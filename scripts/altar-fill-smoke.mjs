// 正式构建冒烟：检查 E-3 实际铺块；缺图只重建清单，finally 还原本工作树素材并正常 sync。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';
import { findRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(process.argv.length, 2, '筑基台冒烟使用正式 preview，不接受参数');
const port = Number(process.env.XT_TEST_PORT ?? 4352);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'XT_TEST_PORT 必须是有效端口');
const image = { relative: 'art/tiles/tiles_altar_fill_variants.png', moved: false, restored: false };
image.file = path.join(root, 'public', image.relative);
const metadataFile = path.join(root, 'public/art/tiles/tiles_altar.json');
const manifestFile = path.join(root, 'src/gen/assets.json');
const expectedVariants = { '5': { tileset: 'tiles_altar_fill_variants', frames: [0, 1, 2], includeBase: true } };
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const json = async file => JSON.parse(await fs.readFile(file, 'utf8'));
const emptyEvents = () => ({ console: [], page: [], request: [], http: [], assets: [], head: [] });
const counts = events => ({ consoleErrors: events.console.length, pageErrors: events.page.length,
  requestFailures: events.request.length, httpErrors: events.http.length,
  variantImageRequests: events.assets.length, headRequests: events.head.length });
const sampleEvents = events => ({ counts: counts(events),
  ...Object.fromEntries(Object.entries(events).map(([type, rows]) => [type, rows.slice(0, 10)])) });
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (actual, message) => { assert.ok(actual, message); assertions++; };

let browser, server, activeChild, backupDir, temporaryDir, interrupted, failure, cleaning = false;
const result = { mode: 'preview', map: 'trial_foundation_altar', port, passed: false, assertions: 0,
  baseline: null, missing: null, baselineState: null, missingState: null,
  manifestOnly: [], events: {}, restored: null, cleanupErrors: [] };
const checkInterrupted = () => { if (interrupted) throw interrupted; };
const onSignal = signal => {
  interrupted ??= new Error(`收到 ${signal}，正在还原图片并关闭服务`);
  if (cleaning) return;
  if (activeChild?.pid) {
    // npm/npx 可能有正在构建的子进程，一并停止，避免其在还原后继续写临时产物。
    try { process.kill(process.platform === 'win32' ? activeChild.pid : -activeChild.pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') activeChild.kill('SIGTERM'); }
  }
  // 解除导航/等待阻塞，让 finally 仍然执行素材还原；清理期间重复信号不打断 sync。
  if (browser) void browser.close().catch(() => {});
};
const onInterrupt = () => onSignal('SIGINT');
const onTerminate = () => onSignal('SIGTERM');
process.on('SIGINT', onInterrupt);
process.on('SIGTERM', onTerminate);

async function command(executable, args, env = {}, cleanup = false) {
  if (!cleanup) checkInterrupted();
  console.log(JSON.stringify({ phase: 'command', command: [executable, ...args],
    manifestOnly: env.XT_SYNC_MANIFEST_ONLY === '1' }));
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: { ...process.env, ...env },
      detached: process.platform !== 'win32', stdio: ['ignore', 'pipe', 'pipe'] });
    activeChild = child;
    let output = '';
    const append = chunk => { output = (output + chunk.toString()).slice(-12000); };
    child.stdout.on('data', append);
    child.stderr.on('data', append);
    child.once('error', reject);
    child.once('close', (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${[executable, ...args].join(' ')} 失败（${signal ?? code}）\n${output}`));
    });
  });
  if (!cleanup) checkInterrupted();
}

async function move(from, to) {
  try { await fs.rename(from, to); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

async function closeServer() {
  if (!server) return;
  const closing = server;
  server = undefined;
  await new Promise((resolve, reject) => closing.httpServer.close(error => error ? reject(error) : resolve()));
}

function fillCells(map) {
  // 满铺 #5 要求上、左、右也是实心；边界的左右按 MapBuilder 自动铺块规则处理。
  const grid = Array.from({ length: map.height }, () => Array(map.width).fill('.'));
  for (const layer of map.layers) {
    if (layer.type !== 'tilelayer' || !['ground', 'oneway'].includes(layer.name)) continue;
    layer.data.forEach((gid, i) => { if (gid) grid[Math.floor(i / map.width)][i % map.width] = layer.name === 'ground' ? '#' : '='; });
  }
  return grid.flatMap((line, row) => line.flatMap((tile, col) =>
    tile === '#' && grid[row - 1]?.[col] === '#'
      && (col === 0 || line[col - 1] === '#') && (col === map.width - 1 || line[col + 1] === '#')
      ? [{ col, row }] : []));
}

async function verifyManifestOnly(label, metadataHash, imagePresent) {
  // 连跑两遍证明 manifest-only 不重写覆盖层，variants 既不丢失也不累加。
  for (let pass = 1; pass <= 2; pass++) {
    await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '1' });
    const metadata = await json(metadataFile), hash = await sha256(metadataFile), manifest = await json(manifestFile);
    equal(metadata.variants, expectedVariants, `${label} 第 ${pass} 次 manifest-only 改变 variants`);
    equal(hash, metadataHash, `${label} 第 ${pass} 次 manifest-only 重写图块配置`);
    equal(manifest.areas.includes('altar_fill_variants'), imagePresent, `${label} 图集清单与图片存在性不符`);
    equal(manifest.tileMetadata.some(entry => entry.key === 'tiles_altar_fill_variants_meta'), imagePresent,
      `${label} 外部图集元数据清单与图片存在性不符`);
    result.manifestOnly.push({ phase: label, pass, metadataHash: hash,
      variantFrames: metadata.variants['5'].frames.length, variantImageInManifest: imagePresent });
  }
}

async function phase(outDir, label, cells) {
  checkInterrupted();
  server = await preview({ root, build: { outDir }, logLevel: 'error',
    preview: { host: '127.0.0.1', port, strictPort: true } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const events = emptyEvents();
  try {
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') events.console.push(message.text()); });
    page.on('pageerror', error => events.page.push(error.message));
    page.on('requestfailed', request => events.request.push({ url: request.url(), failure: request.failure() }));
    page.on('request', request => {
      if (new URL(request.url()).pathname.endsWith(`/${image.relative}`))
        events.assets.push({ url: request.url(), method: request.method() });
      if (request.method() === 'HEAD') events.head.push(request.url());
    });
    page.on('response', response => {
      if (response.status() >= 400) events.http.push({ status: response.status(), url: response.url() });
    });
    await page.goto(`http://127.0.0.1:${port}/?map=trial_foundation_altar`, { waitUntil: 'networkidle', timeout: 30000 });
    await page.waitForFunction(() => {
      const scene = window.__scene;
      return scene?.map?.id === 'trial_foundation_altar' && scene.player?.active && scene.dialog;
    }, null, { timeout: 25000 });
    await page.waitForTimeout(350);
    const state = await page.evaluate(coordinates => {
      const scene = window.__scene;
      const layer = scene.children.list.find(object => object.type === 'TilemapLayer');
      const sets = layer?.tileset ?? [];
      const tiles = coordinates.map(({ col, row }) => {
        const index = layer?.layer.data[row]?.[col]?.index;
        const source = sets.find(set => index >= set.firstgid && index < set.firstgid + set.total);
        return { col, row, index, tileset: source?.name ?? null, frame: source ? index - source.firstgid : null };
      });
      const fillCounts = { base: 0, variant0: 0, variant1: 0, variant2: 0, other: 0 };
      for (const tile of tiles) {
        if (tile.tileset === 'tiles_altar' && tile.frame === 5) fillCounts.base++;
        else if (tile.tileset === 'tiles_altar_fill_variants' && [0, 1, 2].includes(tile.frame)) fillCounts[`variant${tile.frame}`]++;
        else fillCounts.other++;
      }
      return { tileSets: sets.map(set => set.name), fillCells: coordinates.length, fillCounts,
        variantCells: fillCounts.variant0 + fillCounts.variant1 + fillCounts.variant2,
        variantTexturePresent: scene.textures.exists('tiles_altar_fill_variants'),
        variants: scene.cache.json.get('tiles_altar_meta')?.variants,
        testBridgePresent: !!window.__xt, sampleCells: tiles.slice(0, 12) };
    }, cells);
    result[`${label}State`] = state;
    equal(state.testBridgePresent, false, `${label} 必须使用正式构建`);
    equal(state.variants, expectedVariants, `${label} 没有加载外部 variants 配置`);
    equal(state.fillCells, 90, `${label} 筑基台 #5 满铺格数变化`);
    equal(state.fillCounts.other, 0, `${label} 存在错误的 #5 满铺格`);
    equal(state.variantTexturePresent, label === 'baseline', `${label} 变体纹理存在性错误`);
    if (label === 'baseline') {
      equal([...state.tileSets].sort(), ['tiles_altar', 'tiles_altar_fill_variants'], '正常图层没有使用外部图集');
      check(state.fillCounts.base > 0, '正常图层没有保留原 #5');
      for (const frame of [0, 1, 2]) check(state.fillCounts[`variant${frame}`] > 0, `正常图层没有使用变体 ${frame}`);
      check(events.assets.length > 0, '正常构建没有请求变体图片');
    } else {
      equal(state.tileSets, ['tiles_altar'], '缺图没有仅保留 tiles_altar');
      equal(state.fillCounts, { base: 90, variant0: 0, variant1: 0, variant2: 0, other: 0 }, '缺图未全部回退原 #5');
      equal(events.assets.length, 0, `缺图仍请求变体图片：${JSON.stringify(events.assets)}`);
    }
    for (const [kind, rows] of Object.entries(events).filter(([kind]) => ['console', 'page', 'request', 'http', 'head'].includes(kind)))
      equal(rows.length, 0, `${label} 出现 ${kind}：${JSON.stringify(rows.slice(0, 10))}`);
    checkInterrupted();
    console.log(JSON.stringify({ phase: label, ...counts(events), tileSets: state.tileSets,
      fillCells: state.fillCells, fillCounts: state.fillCounts, variantCells: state.variantCells }));
  } finally {
    result[label] = counts(events);
    result.events[label] = sampleEvents(events);
    await context.close();
    await closeServer();
  }
}

try {
  await command('npm', ['run', 'build'], { XT_SYNC_MANIFEST_ONLY: '0', VITE_XT_TEST: '0' });
  image.beforeHash = await sha256(image.file);
  const metadataHash = await sha256(metadataFile);
  equal((await json(metadataFile)).variants, expectedVariants, '正常 sync 未合并仓库覆盖层');
  const cells = fillCells(await json(path.join(findRoot(root), 'maps/trial_foundation_altar.json')));
  equal(cells.length, 90, '筑基台 #5 满铺坐标数量变化');
  await verifyManifestOnly('baseline', metadataHash, true);
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-altar-fill-backup-'));
  temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-altar-fill-dist-'));
  const candidates = [process.env.CHROMIUM_EXECUTABLE_PATH, chromium.executablePath(),
    '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'].filter(Boolean);
  let executablePath;
  for (const candidate of candidates) {
    try { await fs.access(candidate); executablePath = candidate; break; } catch { /* 下一条路径 */ }
  }
  check(executablePath, '未找到 Chromium 可执行文件');
  browser = await chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  await phase('dist', 'baseline', cells);
  checkInterrupted();
  image.backup = path.join(backupDir, path.basename(image.file));
  await move(image.file, image.backup);
  image.moved = true;
  await assert.rejects(fs.stat(image.file), { code: 'ENOENT' }); assertions++;
  await verifyManifestOnly('missing', metadataHash, false);
  await command('npx', ['vite', 'build', '--outDir', temporaryDir, '--emptyOutDir'], { VITE_XT_TEST: '0' });
  await phase(temporaryDir, 'missing', cells);
  result.passed = true;
} catch (error) {
  failure = error;
  result.failure = error.message;
} finally {
  cleaning = true;
  try {
    if (image.moved) await move(image.backup, image.file);
    if (image.beforeHash) {
      image.afterHash = await sha256(image.file);
      equal(image.afterHash, image.beforeHash, '变体图片还原后 SHA256 变化');
      image.restored = true;
    }
  } catch (error) { result.cleanupErrors.push(`restore image: ${error.message}`); }
  try {
    await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '0' }, true);
    if (image.beforeHash) {
      image.afterSyncHash = await sha256(image.file);
      equal(image.afterSyncHash, image.beforeHash, '正常 sync 后变体图片 SHA256 变化');
      equal((await json(metadataFile)).variants, expectedVariants, '正常 sync 后丢失 variants');
      equal((await json(manifestFile)).areas.includes('altar_fill_variants'), true, '正常 sync 后没有恢复图集清单');
    }
  } catch (error) { result.cleanupErrors.push(`restore manifest: ${error.message}`); }
  result.restored = { file: image.file, restored: image.restored, beforeHash: image.beforeHash,
    afterHash: image.afterHash, afterSyncHash: image.afterSyncHash };
  try { await browser?.close(); } catch (error) { result.cleanupErrors.push(`browser: ${error.message}`); }
  try { await closeServer(); } catch (error) { result.cleanupErrors.push(`server: ${error.message}`); }
  if (backupDir && (!image.moved || image.restored)) {
    try { await fs.rm(backupDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`backup directory: ${error.message}`); }
  } else if (backupDir) result.backupDirectory = backupDir;
  if (temporaryDir) {
    try { await fs.rm(temporaryDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`temporary build: ${error.message}`); }
  }
  if (interrupted) { failure ??= interrupted; result.failure = interrupted.message; }
  if (failure || result.cleanupErrors.length) result.passed = false;
  result.assertions = assertions;
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  console.log(JSON.stringify(result));
}
if (failure || result.cleanupErrors.length) process.exitCode = 1;
