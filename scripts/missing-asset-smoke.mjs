// npm run build 后运行；--dev 直接启动 Vite，不执行 sync。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer, preview } from 'vite';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dev = process.argv.includes('--dev');
assert.ok(process.argv.slice(2).every(arg => arg === '--dev'), '仅支持 --dev 参数');
const mode = dev ? 'dev' : 'preview';
const assetRoot = path.join(root, dev ? 'public' : 'dist');
const assets = [
  ['art/icons/ui/sect_rank/icon_sect_rank_outer_disciple.png', 'icon_sect_rank_outer_disciple'],
  ['art/sprites/prop_chest.png', 'prop_chest'],
  ['art/tiles/tiles_altar_fill_variants.png', 'tiles_altar_fill_variants'],
].map(([relative, key]) => ({ relative, key, file: path.join(assetRoot, relative), moved: false, restored: false }));
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const emptyEvents = () => ({ console: [], page: [], request: [], http: [], assets: [] });
const counts = events => ({ consoleErrors: events.console.length, pageErrors: events.page.length,
  requestFailures: events.request.length, httpErrors: events.http.length });
// 全量事件仍参与断言；输出只展示每类前 10 条，避免失败时淹没诊断结果。
const sampleEvents = events => ({ counts: { ...counts(events), assetResponses: events.assets.length },
  ...Object.fromEntries(Object.entries(events).map(([type, rows]) => [type, rows.slice(0, 10)])) });

async function freePort(port) {
  const socket = net.createServer();
  try {
    await new Promise((resolve, reject) => {
      socket.once('error', reject);
      socket.listen(port, '127.0.0.1', resolve);
    });
    return true;
  } catch (error) {
    if (error.code === 'EADDRINUSE') return false;
    throw error;
  } finally {
    if (socket.listening) await new Promise((resolve, reject) => socket.close(error => error ? reject(error) : resolve()));
  }
}

async function startServer() {
  for (let port = 4300; port <= 4399; port++) {
    if (!await freePort(port)) continue;
    let server;
    try {
      const options = { host: '127.0.0.1', port, strictPort: true };
      server = dev
        ? await createServer({ root, logLevel: 'silent', server: options })
        : await preview({ root, logLevel: 'silent', preview: options });
      if (dev) await server.listen();
      return { server, baseURL: `http://127.0.0.1:${port}/` };
    } catch (error) {
      if (dev) await server?.close();
      if (error.code !== 'EADDRINUSE' && !/already in use/.test(error.message)) throw error;
    }
  }
  throw new Error('4300–4399 没有可用端口');
}

async function move(from, to) {
  try { await fs.rename(from, to); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

async function ready(page) {
  await page.waitForFunction(() => {
    const scene = window.__scene;
    return scene?.map?.id === 'trial_foundation_altar' && scene.player?.active && scene.dialog && scene.sectTitle;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(350);
  return page.evaluate(keys => {
    const scene = window.__scene;
    const layer = scene.children.list.find(object => object.type === 'TilemapLayer');
    return { textures: Object.fromEntries(keys.map(key => [key, scene.textures.exists(key)])),
      tileSets: layer?.tileset.map(tileSet => tileSet.name) ?? [],
      sectTitle: scene.sectTitle.text, sectTitleVisible: scene.sectTitle.visible,
      sectBadgeVisible: scene.sectBadge.visible };
  }, assets.map(asset => asset.key));
}

function additionalMessages(baseline, missing) {
  const remaining = new Map();
  for (const message of baseline) remaining.set(message, (remaining.get(message) ?? 0) + 1);
  return missing.filter(message => {
    const count = remaining.get(message) ?? 0;
    if (!count) return true;
    remaining.set(message, count - 1);
    return false;
  });
}

let browser, server, backupDir, activeEvents;
let failure, interrupted;
const onSignal = signal => {
  interrupted = new Error(`收到 ${signal}，正在还原文件并关闭服务`);
  // 取消正在等待的导航，使 SIGINT/SIGTERM 也能经过 finally 还原文件。
  if (browser) void browser.close().catch(() => {});
};
const onInterrupt = () => onSignal('SIGINT');
const onTerminate = () => onSignal('SIGTERM');
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);
const checkInterrupted = () => { if (interrupted) throw interrupted; };
const result = { mode, passed: false, baseline: null, missing: null, addedConsoleErrors: null,
  baselineState: null, missingState: null, restored: [], cleanupErrors: [] };
try {
  if (!dev) await fs.access(path.join(assetRoot, 'index.html'));
  for (const asset of assets) asset.beforeHash = await sha256(asset.file);
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-missing-assets-'));
  const started = await startServer();
  server = started.server;
  result.baseURL = started.baseURL;
  checkInterrupted();
  browser = await chromium.launch({
    executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], headless: true, timeout: 20000,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  // 独立浏览器档只提供外门称号，用于确认缺徽记仍显示中文职位。
  await context.addInitScript(() => {
    localStorage.setItem('xiantu_save_v1', JSON.stringify({ name: '缺图冒烟修士', level: 30, exp: 0,
      hp: 0, mp: 0, job: 'tianjian_disciple', sectRank: 'outer_disciple', sectContribution: 0,
      inventory: {}, quests: {}, ageUpdatedAt: Date.now() }));
  });
  const page = await context.newPage();
  const cdp = await context.newCDPSession(page);
  await cdp.send('Network.enable');
  await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
  page.on('console', message => { if (message.type() === 'error') activeEvents?.console.push(message.text()); });
  page.on('pageerror', error => activeEvents?.page.push(error.message));
  page.on('requestfailed', request => activeEvents?.request.push({ url: request.url(), failure: request.failure() }));
  page.on('response', response => {
    if (response.status() >= 400) activeEvents?.http.push({ status: response.status(), url: response.url() });
    if (assets.some(asset => new URL(response.url()).pathname.endsWith(`/${asset.relative}`)))
      activeEvents?.assets.push({ url: response.url(), status: response.status(),
        method: response.request().method(), contentType: response.headers()['content-type'] });
  });
  const baselineEvents = emptyEvents();
  activeEvents = baselineEvents;
  const url = new URL(started.baseURL);
  url.searchParams.set('map', 'trial_foundation_altar');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  result.baselineState = await ready(page);
  result.baseline = counts(baselineEvents);
  // sync 已排除独立 fill_variants 区域；它仍须参与物理移走/还原检查。
  for (const asset of assets.slice(0, 2)) assert.equal(result.baselineState.textures[asset.key], true, `基线未加载 ${asset.key}`);
  assert.equal(result.baselineState.sectBadgeVisible, true, '基线未显示职位徽记');
  assert.equal(result.baselineState.sectTitleVisible, true, '基线未显示职位称号');
  assert.match(result.baselineState.sectTitle, /外门弟子/, '基线缺中文职位');
  console.log(JSON.stringify({ mode, phase: 'baseline', ...result.baseline }));

  checkInterrupted();
  for (const [index, asset] of assets.entries()) {
    checkInterrupted();
    asset.backup = path.join(backupDir, `${index}.png`);
    await move(asset.file, asset.backup);
    asset.moved = true;
    await assert.rejects(fs.stat(asset.file), { code: 'ENOENT' });
  }
  const missingEvents = emptyEvents();
  activeEvents = missingEvents;
  await cdp.send('Network.clearBrowserCache');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  result.missingState = await ready(page);
  checkInterrupted();
  result.missing = counts(missingEvents);
  const added = additionalMessages(baselineEvents.console, missingEvents.console);
  result.addedConsoleErrors = added.length;
  result.events = { baseline: sampleEvents(baselineEvents), missing: sampleEvents(missingEvents),
    addedConsole: added.slice(0, 10), addedConsoleCount: added.length };
  console.log(JSON.stringify({ mode, phase: 'missing-reload', ...result.missing, addedConsoleErrors: added.length }));
  assert.equal(added.length, 0, `缺图刷新新增 console error：${added.join('\n')}`);
  for (const [phase, events] of [['baseline', baselineEvents], ['missing', missingEvents]]) {
    assert.equal(events.page.length, 0, `${phase} 出现 pageerror`);
    assert.equal(events.request.length, 0, `${phase} 出现 requestfailed`);
    assert.equal(events.http.length, 0, `${phase} 出现 HTTP>=400`);
  }
  for (const asset of assets) assert.equal(result.missingState.textures[asset.key], false, `缺图仍加载了 ${asset.key}`);
  assert.equal(result.missingState.tileSets.includes('tiles_altar_fill_variants'), false, '缺图未使用原 tileset 回退');
  assert.equal(result.missingState.sectBadgeVisible, false, '缺图仍显示徽记');
  assert.equal(result.missingState.sectTitleVisible, true, '缺图隐藏职位称号');
  assert.equal(result.missingState.sectTitle, result.baselineState.sectTitle, '缺图改变中文职位称号');
  result.passed = true;
} catch (error) {
  failure = error;
  result.failure = error.message;
} finally {
  // 先还原文件，再清理浏览器和服务；任一步失败都继续清理其余资源。
  for (const asset of assets) {
    try {
      if (asset.moved) await move(asset.backup, asset.file);
      if (asset.beforeHash) {
        asset.afterHash = await sha256(asset.file);
        assert.equal(asset.afterHash, asset.beforeHash, `${asset.relative} 还原后哈希变化`);
        asset.restored = true;
      }
    } catch (error) { result.cleanupErrors.push(`${asset.relative}: ${error.message}`); }
    result.restored.push({ file: asset.file, restored: asset.restored, beforeHash: asset.beforeHash, afterHash: asset.afterHash });
  }
  try { await browser?.close(); } catch (error) { result.cleanupErrors.push(`browser: ${error.message}`); }
  try {
    if (server) {
      if (dev) await server.close();
      else await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
    }
  } catch (error) { result.cleanupErrors.push(`server: ${error.message}`); }
  if (backupDir && assets.every(asset => !asset.moved || asset.restored)) {
    try { await fs.rm(backupDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`backup directory: ${error.message}`); }
  } else if (backupDir) result.backupDirectory = backupDir;
  if (interrupted) {
    failure ??= interrupted;
    result.failure = interrupted.message;
  }
  if (failure || result.cleanupErrors.length) result.passed = false;
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  console.log(JSON.stringify(result));
}
if (failure || result.cleanupErrors.length) process.exitCode = 1;
