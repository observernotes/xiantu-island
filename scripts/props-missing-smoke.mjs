// npm run build 后运行；真实 reload 验证清单内全部 prop 图集的缺图回退。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { preview } from 'vite';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const spriteDir = path.join(root, 'dist/art/sprites');
const assets = (await fs.readdir(spriteDir)).filter(file => /^prop_.*\.png$/.test(file)).sort()
  .map(file => ({ file: path.join(spriteDir, file), relative: `art/sprites/${file}`, key: file.slice(0, -4), moved: false, restored: false }));
assert.ok(assets.length > 0, 'dist/art/sprites 缺少 prop PNG；请先 npm run build');
const manifest = JSON.parse(await fs.readFile(path.join(root, 'src/gen/assets.json'), 'utf8'));
assert.deepEqual(assets.map(asset => asset.key), manifest.atlases.filter(({ key }) => key.startsWith('prop_')).map(({ key }) => key).sort(),
  '所有 prop PNG 均须进入探测与可选加载清单');
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const emptyEvents = () => ({ console: [], page: [], request: [], http: [], assets: [] });
const counts = events => ({ consoleErrors: events.console.length, pageErrors: events.page.length,
  requestFailures: events.request.length, httpErrors: events.http.length });
const sampleEvents = events => ({ ...counts(events), ...Object.fromEntries(Object.entries(events).map(([kind, rows]) => [kind, rows.slice(0, 10)])) });

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
    try {
      const server = await preview({ root, logLevel: 'silent', preview: { host: '127.0.0.1', port, strictPort: true } });
      return { server, baseURL: `http://127.0.0.1:${port}/` };
    } catch (error) {
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
    return scene?.map?.id === 'qingyun_village' && scene.player?.active && scene.dialog;
  }, null, { timeout: 25000 });
  await page.waitForTimeout(350);
  return page.evaluate(keys => {
    const scene = window.__scene;
    return {
      map: scene.map.id,
      textures: Object.fromEntries(keys.map(key => [key, scene.textures.exists(key)])),
      animations: scene.anims.anims.getArray().map(animation => animation.key).filter(key => key.startsWith('prop_')),
      portals: scene.map.objects.filter(object => object.type === 'portal').map(object => {
        const display = scene.children.list.find(display => display.depth === 4 && display.x === object.x
          && (display.type === 'Sprite' ? display.y === object.y : display.type === 'Ellipse' && display.y === object.y - 40));
        return { name: object.name, type: display?.type, texture: display?.texture?.key };
      }),
      chests: scene.map.objects.filter(object => object.type === 'chest').map(object => {
        const display = scene.children.getByName(`chest:${object.name}`);
        return { name: object.name, type: display?.type, texture: display?.texture?.key };
      }),
    };
  }, assets.map(asset => asset.key));
}

let browser, server, backupDir, activeEvents, failure, interrupted;
const result = { mode: 'preview', passed: false, assetCount: assets.length, baseline: null, missing: null,
  added: null, baselineState: null, missingState: null, restored: [], cleanupErrors: [] };
const onSignal = signal => {
  interrupted = new Error(`收到 ${signal}，正在还原文件并关闭服务`);
  if (browser) void browser.close().catch(() => {});
};
const onInterrupt = () => onSignal('SIGINT');
const onTerminate = () => onSignal('SIGTERM');
process.once('SIGINT', onInterrupt);
process.once('SIGTERM', onTerminate);
const checkInterrupted = () => { if (interrupted) throw interrupted; };

try {
  await fs.access(path.join(root, 'dist/index.html'));
  for (const asset of assets) asset.beforeHash = await sha256(asset.file);
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-props-missing-'));
  const started = await startServer();
  server = started.server;
  result.baseURL = started.baseURL;
  checkInterrupted();
  browser = await chromium.launch({
    executablePath: '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell',
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'], headless: true, timeout: 20000,
  });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
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
      activeEvents?.assets.push({ url: response.url(), status: response.status(), method: response.request().method(), contentType: response.headers()['content-type'] });
  });
  const baselineEvents = emptyEvents();
  activeEvents = baselineEvents;
  const url = new URL(started.baseURL);
  url.searchParams.set('map', 'qingyun_village');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  result.baselineState = await ready(page);
  result.baseline = counts(baselineEvents);
  assert.ok(result.baselineState.portals.length > 0, '青云村没有传送门测试对象');
  assert.ok(result.baselineState.chests.length > 0, '青云村没有宝匣测试对象');
  for (const asset of assets) assert.equal(result.baselineState.textures[asset.key], true, `基线未加载 ${asset.key}`);
  for (const portal of result.baselineState.portals) {
    assert.equal(portal.type, 'Sprite', `基线传送门 ${portal.name} 未显示 sprite`);
    assert.equal(portal.texture, 'prop_portal');
  }
  for (const chest of result.baselineState.chests) {
    assert.equal(chest.type, 'Sprite', `基线宝匣 ${chest.name} 未显示 sprite`);
    assert.equal(chest.texture, 'prop_chest');
  }
  console.log(JSON.stringify({ mode: 'preview', phase: 'baseline', assetCount: assets.length, ...result.baseline }));

  checkInterrupted();
  for (const [index, asset] of assets.entries()) {
    checkInterrupted();
    asset.backup = path.join(backupDir, `${index}.png`);
    await move(asset.file, asset.backup);
    asset.moved = true;
    await assert.rejects(fs.stat(asset.file), { code: 'ENOENT' });
  }
  assert.deepEqual((await fs.readdir(spriteDir)).filter(file => /^prop_.*\.png$/.test(file)), [], '未移走全部 prop PNG');
  const missingEvents = emptyEvents();
  activeEvents = missingEvents;
  await cdp.send('Network.clearBrowserCache');
  await page.reload({ waitUntil: 'networkidle', timeout: 30000 });
  result.missingState = await ready(page);
  checkInterrupted();
  result.missing = counts(missingEvents);
  result.added = Object.fromEntries(Object.keys(result.baseline).map(key => [key, Math.max(0, result.missing[key] - result.baseline[key])]));
  result.events = { baseline: sampleEvents(baselineEvents), missing: sampleEvents(missingEvents) };
  console.log(JSON.stringify({ mode: 'preview', phase: 'missing-reload', ...result.missing, added: result.added }));
  for (const [phase, events] of [['baseline', baselineEvents], ['missing-reload', missingEvents]]) {
    for (const [kind, rows] of Object.entries(events).filter(([kind]) => kind !== 'assets'))
      assert.equal(rows.length, 0, `${phase} 出现 ${kind}：${JSON.stringify(rows.slice(0, 10))}`);
  }
  for (const asset of assets) assert.equal(result.missingState.textures[asset.key], false, `缺图仍加载 ${asset.key}`);
  assert.deepEqual(result.missingState.animations, [], '缺图仍建立了 prop 动画');
  assert.ok(missingEvents.assets.length >= assets.length, '真实 reload 未重新探测全部 prop PNG');
  assert.ok(missingEvents.assets.every(response => response.method === 'HEAD'), '缺图 PNG 不应进入 Phaser GET 加载');
  for (const portal of result.missingState.portals) assert.equal(portal.type, 'Ellipse', `缺图传送门 ${portal.name} 未使用 Ellipse 回退`);
  for (const chest of result.missingState.chests) assert.equal(chest.type, 'Rectangle', `缺图宝匣 ${chest.name} 未使用 Rectangle 回退`);
  result.passed = true;
} catch (error) {
  failure = error;
  result.failure = error.message;
} finally {
  // 每个文件分别还原并校验；清理失败时保留备份目录，供手动恢复。
  for (const asset of assets) {
    try {
      if (asset.moved) await move(asset.backup, asset.file);
      if (asset.beforeHash) {
        asset.afterHash = await sha256(asset.file);
        assert.equal(asset.afterHash, asset.beforeHash, `${asset.relative} 还原后哈希变化`);
        asset.restored = true;
      }
    } catch (error) { result.cleanupErrors.push(`${asset.relative}: ${error.message}`); }
    result.restored.push({ file: asset.relative, restored: asset.restored, beforeHash: asset.beforeHash, afterHash: asset.afterHash });
  }
  try { await browser?.close(); } catch (error) { result.cleanupErrors.push(`browser: ${error.message}`); }
  try {
    if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
  } catch (error) { result.cleanupErrors.push(`server: ${error.message}`); }
  if (backupDir && assets.every(asset => !asset.moved || asset.restored)) {
    try { await fs.rm(backupDir, { recursive: true, force: true }); }
    catch (error) { result.cleanupErrors.push(`backup directory: ${error.message}`); }
  } else if (backupDir) result.backupDirectory = backupDir;
  if (interrupted) { failure ??= interrupted; result.failure = interrupted.message; }
  if (failure || result.cleanupErrors.length) result.passed = false;
  process.removeListener('SIGINT', onInterrupt);
  process.removeListener('SIGTERM', onTerminate);
  console.log(JSON.stringify(result));
}
if (failure || result.cleanupErrors.length) process.exitCode = 1;
