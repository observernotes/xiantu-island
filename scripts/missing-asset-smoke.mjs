// 自包含正式构建冒烟：基线 sync+build，缺图后只重建清单再打包，最后还原素材与清单。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(process.argv.length, 2, '缺图冒烟使用正式 preview，不接受参数');
const port = Number(process.env.XT_TEST_PORT ?? 4351);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'XT_TEST_PORT 必须是有效端口');
const isolated = await createIsolatedBuild(projectRoot, 'missing-assets');
const root = isolated.root;
const features = JSON.parse(await fs.readFile(path.join(root, 'data/features.json'), 'utf8'));
const assetRoot = path.join(root, 'public');
const assets = [
  'art/icons/ui/sect_rank/icon_sect_rank_outer_disciple.png',
  'art/sprites/prop_chest.png',
  'art/sprites/prop_chest.json',
  'art/sprites/prop_chest.anims.json',
  'art/tiles/tiles_altar_fill_variants.png',
].map(relative => ({ relative, file: path.join(assetRoot, relative), moved: false, restored: false }));
const textureKeys = ['icon_sect_rank_outer_disciple', 'prop_chest', 'tiles_altar_fill_variants'];
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const emptyEvents = () => ({ console: [], page: [], request: [], http: [], assets: [], head: [] });
const counts = events => ({ consoleErrors: events.console.length, pageErrors: events.page.length,
  requestFailures: events.request.length, httpErrors: events.http.length,
  missingAssetRequests: events.assets.length, headRequests: events.head.length });
const sampleEvents = events => ({ counts: counts(events),
  ...Object.fromEntries(Object.entries(events).map(([type, rows]) => [type, rows.slice(0, 10)])) });
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (actual, message) => { assert.ok(actual, message); assertions++; };

let browser, server, activeChild, backupDir, temporaryDir, interrupted;
let failure;
const result = { mode: 'preview', port, passed: false, assertions: 0, baseline: null, missing: null,
  baselineState: null, missingState: null, events: {}, restored: [], cleanupErrors: [] };
const checkInterrupted = () => { if (interrupted) throw interrupted; };
const onSignal = signal => {
  interrupted ??= new Error(`收到 ${signal}，正在还原文件并关闭服务`);
  if (activeChild?.pid) {
    try { process.kill(process.platform === 'win32' ? activeChild.pid : -activeChild.pid, 'SIGTERM'); }
    catch (error) { if (error.code !== 'ESRCH') activeChild.kill('SIGTERM'); }
  }
  // 解除导航/等待阻塞，让 finally 仍然执行素材还原。
  if (browser) void browser.close().catch(() => {});
};
const onInterrupt = () => onSignal('SIGINT');
const onTerminate = () => onSignal('SIGTERM');
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);

async function command(executable, args, env = {}, cleanup = false) {
  if (!cleanup) checkInterrupted();
  console.log(JSON.stringify({ phase: 'command', command: [executable, ...args], manifestOnly: env.XT_SYNC_MANIFEST_ONLY === '1' }));
  await new Promise((resolve, reject) => {
    const child = spawn(executable, args, { cwd: root, env: childBuildEnv(env),
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

async function ready(page, mapId) {
  await page.waitForFunction(id => {
    const scene = window.__scene;
    return scene?.map?.id === id && scene.player?.active && scene.dialog && scene.sectTitle;
  }, mapId, { timeout: 25000 });
  await page.waitForTimeout(350);
  return page.evaluate(keys => {
    const scene = window.__scene;
    const layer = scene.children.list.find(object => object.type === 'TilemapLayer');
    const chests = scene.map.objects.filter(object => object.type === 'chest').map(object => {
      const art = scene.children.getByName(`chest:${object.name}`);
      return { name: object.name, objectX: object.x, objectY: object.y, type: art?.type, visible: art?.visible,
        x: art?.x, y: art?.y, width: art?.width, height: art?.height, depth: art?.depth,
        fillColor: art?.fillColor, strokeColor: art?.strokeColor,
        texture: art?.texture?.key, frame: art?.frame?.name, originX: art?.originX, originY: art?.originY };
    });
    return { textures: Object.fromEntries(keys.map(key => [key, scene.textures.exists(key)])),
      tileSets: layer?.tileset.map(tileSet => tileSet.name) ?? [],
      sectTitle: scene.sectTitle.text, sectTitleVisible: scene.sectTitle.visible,
      sectBadgeVisible: scene.sectBadge.visible, chests, testBridgePresent: !!window.__xt };
  }, textureKeys);
}

async function phase(outDir, label) {
  checkInterrupted();
  server = await preview({ root, build: { outDir }, logLevel: 'error',
    preview: { host: '127.0.0.1', port, strictPort: true } });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const events = emptyEvents();
  try {
    // 独立浏览器档提供外门身份，产品发版开关仍读取工程配置。
    await context.addInitScript(() => {
      localStorage.setItem('xiantu_save_v1', JSON.stringify({ name: '缺图冒烟修士', level: 30, exp: 0,
        hp: 0, mp: 0, job: 'tianjian_disciple', sectRank: 'outer_disciple', sectContribution: 0,
        inventory: {}, quests: {}, ageUpdatedAt: Date.now() }));
    });
    const page = await context.newPage();
    page.on('console', message => { if (message.type() === 'error') events.console.push(message.text()); });
    page.on('pageerror', error => events.page.push(error.message));
    page.on('requestfailed', request => events.request.push({ url: request.url(), failure: request.failure() }));
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (assets.some(asset => pathname.endsWith(`/${asset.relative}`)))
        events.assets.push({ url: request.url(), method: request.method() });
      if (request.method() === 'HEAD') events.head.push(request.url());
    });
    page.on('response', response => {
      if (response.status() >= 400) events.http.push({ status: response.status(), url: response.url() });
    });
    const baseURL = server.resolvedUrls?.local?.[0];
    check(baseURL, `${label} preview 没有提供可访问地址`);
    const altarURL = new URL(baseURL);
    altarURL.searchParams.set('map', 'trial_foundation_altar');
    await page.goto(altarURL.href, { waitUntil: 'networkidle', timeout: 30000 });
    const altar = await ready(page, 'trial_foundation_altar');
    equal(altar.testBridgePresent, false, `${label} 必须使用正式构建`);
    const villageURL = new URL(baseURL);
    villageURL.searchParams.set('map', 'qingyun_village');
    await page.goto(villageURL.href, { waitUntil: 'networkidle', timeout: 30000 });
    const village = await ready(page, 'qingyun_village');
    result[`${label}State`] = { altar, village };
    equal(village.testBridgePresent, false, `${label} 青云村必须使用正式构建`);
    check(village.chests.length > 0, `${label} 未创建真实地图宝匣对象`);
    for (const chest of village.chests) {
      equal(chest.visible, true, `${label} ${chest.name} 宝匣不可见`);
      if (label === 'baseline') {
        equal(chest.type, 'Sprite', `${label} ${chest.name} 未使用精修宝匣图集`);
        equal([chest.texture, chest.frame], ['prop_chest', 'prop_chest_closed_01'], `${label} ${chest.name} 宝匣图集或闭合帧错误`);
        equal([chest.x, chest.y], [chest.objectX, chest.objectY], `${label} ${chest.name} 宝匣位置错误`);
        equal([chest.originX, chest.originY, chest.depth], [0.5, 1, 4], `${label} ${chest.name} 宝匣挂点错误`);
      } else {
        equal(chest.type, 'Rectangle', `${label} ${chest.name} 未保留宝匣代码画`);
        equal([chest.x, chest.y], [chest.objectX, chest.objectY - 14], `${label} ${chest.name} 宝匣位置错误`);
        equal([chest.width, chest.height], [34, 28], `${label} ${chest.name} 宝匣尺寸错误`);
        equal([chest.fillColor, chest.strokeColor, chest.depth], [0xd9a43a, 0x5a3418, 4], `${label} ${chest.name} 宝匣绘制错误`);
      }
    }
    for (const [kind, rows] of Object.entries(events).filter(([kind]) => ['console', 'page', 'request', 'http', 'head'].includes(kind)))
      equal(rows.length, 0, `${label} 出现 ${kind}：${JSON.stringify(rows.slice(0, 10))}`);
    checkInterrupted();
    console.log(JSON.stringify({ phase: label, ...counts(events), chestRenderChecks: village.chests.length }));
    return { state: { altar, village }, events };
  } finally {
    result[label] = counts(events);
    result.events[label] = sampleEvents(events);
    await context.close();
    await closeServer();
  }
}

try {
  // npm run build 包含正常 sync，不能直接复用旧 dist/清单。
  await command('npm', ['run', 'build'], { XT_SYNC_MANIFEST_ONLY: '0', VITE_XT_TEST: '0' });
  for (const asset of assets) asset.beforeHash = await sha256(asset.file);
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-missing-assets-backup-'));
  temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-missing-assets-dist-'));
  const candidates = [process.env.CHROMIUM_EXECUTABLE_PATH, chromium.executablePath(),
    '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell']
    .filter(Boolean);
  let executablePath;
  for (const candidate of candidates) {
    try { await fs.access(candidate); executablePath = candidate; break; } catch { /* 下一条路径 */ }
  }
  check(executablePath, '未找到 Chromium 可执行文件');
  browser = await chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const baseline = await phase('dist', 'baseline');
  result.baseline = counts(baseline.events);
  result.baselineState = baseline.state;
  for (const key of textureKeys) equal(baseline.state.altar.textures[key], true, `基线未加载 ${key}`);
  // 外部变体图片必须预加载；是否铺到地图上由 E-3 的显式 variants 配置决定。
  check(baseline.state.altar.tileSets.includes('tiles_altar'), '基线未加载原 altar tileset');
  for (const state of [baseline.state.altar, baseline.state.village]) {
    equal(state.sectBadgeVisible, features.sectRanks, '基线职位徽记不符合发版关口');
    equal(state.sectTitleVisible, features.sectRanks, '基线职位称号不符合发版关口');
    if (features.sectRanks) check(/外门弟子/.test(state.sectTitle), '基线缺中文职位');
  }
  for (const [index, asset] of assets.entries()) {
    checkInterrupted();
    asset.backup = path.join(backupDir, `${index}${path.extname(asset.file)}`);
    await move(asset.file, asset.backup);
    asset.moved = true;
    await assert.rejects(fs.stat(asset.file), { code: 'ENOENT' }); assertions++;
  }
  await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '1' });
  const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/gen/assets.json'), 'utf8'));
  equal(manifest.atlases.some(atlas => atlas.key === 'prop_chest'), false, '缺图图集仍在清单');
  equal(manifest.areas.includes('altar_fill_variants'), false, '缺图填充图集仍在区域清单');
  equal(manifest.sectRankIcons.some(icon => icon.key === 'icon_sect_rank_outer_disciple'), false, '缺图徽记仍在清单');
  await command('npx', ['vite', 'build', '--outDir', temporaryDir, '--emptyOutDir'], { VITE_XT_TEST: '0' });
  const missing = await phase(temporaryDir, 'missing');
  result.missing = counts(missing.events);
  result.missingState = missing.state;
  equal(missing.events.assets.length, 0, `缺图素材仍有网络请求：${JSON.stringify(missing.events.assets)}`);
  for (const key of textureKeys) equal(missing.state.altar.textures[key], false, `缺图仍加载了 ${key}`);
  equal(missing.state.altar.tileSets.includes('tiles_altar_fill_variants'), false, '缺图未回退原 tileset');
  check(missing.state.altar.tileSets.includes('tiles_altar'), '缺图未保留原 altar tileset');
  for (const [index, state] of [missing.state.altar, missing.state.village].entries()) {
    equal(state.sectBadgeVisible, false, '缺图仍显示徽记');
    equal(state.sectTitleVisible, features.sectRanks, '缺图职位称号不符合发版关口');
    if (features.sectRanks) check(/外门弟子/.test(state.sectTitle), '缺图没有保留中文职位');
    const before = [baseline.state.altar, baseline.state.village][index];
    equal(state.sectTitle, before.sectTitle, '缺图改变中文职位称号');
  }
  const chestObjects = chests => chests.map(({ name, objectX, objectY }) => ({ name, objectX, objectY }));
  equal(chestObjects(missing.state.village.chests), chestObjects(baseline.state.village.chests), '缺图改变地图宝匣对象');
  result.events = { baseline: sampleEvents(baseline.events), missing: sampleEvents(missing.events) };
  result.passed = true;
} catch (error) {
  failure = error;
  result.failure = error.message;
} finally {
  // 任一步失败或信号中断，先逐个还原并校验，再正常 sync 恢复正式清单。
  for (const asset of assets) {
    try {
      if (asset.moved) await move(asset.backup, asset.file);
      if (asset.beforeHash) {
        asset.afterHash = await sha256(asset.file);
        equal(asset.afterHash, asset.beforeHash, `${asset.relative} 还原后哈希变化`);
        asset.restored = true;
      }
    } catch (error) { result.cleanupErrors.push(`${asset.relative}: ${error.message}`); }
    result.restored.push({ file: asset.file, restored: asset.restored, beforeHash: asset.beforeHash, afterHash: asset.afterHash });
  }
  try { await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '0' }, true); }
  catch (error) { result.cleanupErrors.push(`restore manifest: ${error.message}`); }
  try { await browser?.close(); } catch (error) { result.cleanupErrors.push(`browser: ${error.message}`); }
  try { await closeServer(); } catch (error) { result.cleanupErrors.push(`server: ${error.message}`); }
  if (backupDir && assets.every(asset => !asset.moved || asset.restored)) {
    try { await fs.rm(backupDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`backup directory: ${error.message}`); }
  } else if (backupDir) result.backupDirectory = backupDir;
  if (temporaryDir) {
    try { await fs.rm(temporaryDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`temporary build: ${error.message}`); }
  }
  if (!result.cleanupErrors.length) {
    try { await isolated.cleanup(); }
    catch (error) { result.cleanupErrors.push(`isolated project: ${error.message}`); }
  } else result.workspace = root;
  if (interrupted) { failure ??= interrupted; result.failure = interrupted.message; }
  if (failure || result.cleanupErrors.length) result.passed = false;
  result.assertions = assertions;
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  console.log(JSON.stringify(result));
}
if (failure || result.cleanupErrors.length) process.exitCode = 1;
