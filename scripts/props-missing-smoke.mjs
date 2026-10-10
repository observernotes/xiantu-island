// 自包含正式构建冒烟：从 public 移走全部 prop PNG，只重建清单再打包，最后还原素材与清单。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import net from 'node:net';
import { createHash } from 'node:crypto';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
assert.equal(process.argv.length, 2, 'prop 缺图冒烟使用正式 preview，不接受参数');
const requestedPort = process.env.XT_TEST_PORT === undefined ? undefined : Number(process.env.XT_TEST_PORT);
if (requestedPort !== undefined)
  assert.ok(Number.isInteger(requestedPort) && requestedPort > 0 && requestedPort < 65536, 'XT_TEST_PORT 必须是有效端口');
const isolated = await createIsolatedBuild(projectRoot, 'props-missing');
const root = isolated.root;
const spriteDir = path.join(root, 'public/art/sprites');
const assets = [];
const sha256 = async file => createHash('sha256').update(await fs.readFile(file)).digest('hex');
const readManifest = async () => JSON.parse(await fs.readFile(path.join(root, 'src/gen/assets.json'), 'utf8'));
const propKeys = manifest => manifest.atlases.filter(({ key }) => key.startsWith('prop_')).map(({ key }) => key).sort();
const emptyEvents = () => ({ console: [], page: [], request: [], http: [], assets: [], head: [] });
const counts = events => ({ consoleErrors: events.console.length, pageErrors: events.page.length,
  requestFailures: events.request.length, httpErrors: events.http.length,
  propAssetRequests: events.assets.length, headRequests: events.head.length });
const sampleEvents = events => ({ counts: counts(events),
  ...Object.fromEntries(Object.entries(events).map(([kind, rows]) => [kind, rows.slice(0, 10)])) });
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (actual, message) => { assert.ok(actual, message); assertions++; };

let browser, server, activeChild, backupDir, temporaryDir, interrupted, failure;
const result = { mode: 'preview', passed: false, assertions: 0, assetCount: 0, baseline: null, missing: null,
  baselineState: null, missingState: null, manifests: {}, events: {}, restored: [], cleanupErrors: [] };
const checkInterrupted = () => { if (interrupted) throw interrupted; };
const onSignal = signal => {
  interrupted ??= new Error(`收到 ${signal}，正在还原文件并关闭服务`);
  // npm/npx 的子进程也属于本脚本的进程组，避免中断后继续 sync/build。
  if (activeChild) {
    try {
      if (process.platform === 'win32') activeChild.kill('SIGTERM');
      else process.kill(-activeChild.pid, 'SIGTERM');
    } catch (error) { if (error.code !== 'ESRCH') result.cleanupErrors.push(`child process: ${error.message}`); }
  }
  // 解除浏览器导航/等待，让 finally 仍然执行素材还原。
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
    child.once('error', error => { if (activeChild === child) activeChild = undefined; reject(error); });
    child.once('close', (code, signal) => {
      if (activeChild === child) activeChild = undefined;
      if (code === 0) resolve();
      else reject(new Error(`${[executable, ...args].join(' ')} 失败（${signal ?? code}）\n${output}`));
    });
  });
  if (!cleanup) checkInterrupted();
}

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

async function startServer(outDir) {
  const ports = requestedPort === undefined ? Array.from({ length: 100 }, (_, index) => 4300 + index) : [requestedPort];
  for (const port of ports) {
    if (!await freePort(port)) continue;
    checkInterrupted();
    try {
      const started = await preview({ root, build: { outDir }, logLevel: 'error',
        preview: { host: '127.0.0.1', port, strictPort: true } });
      const baseURL = started.resolvedUrls?.local?.[0];
      check(baseURL, 'preview 没有提供可访问地址');
      return { server: started, baseURL };
    } catch (error) {
      if (error.code !== 'EADDRINUSE' && !/already in use/.test(error.message)) throw error;
    }
  }
  throw new Error(requestedPort === undefined ? '4300–4399 没有可用端口' : `XT_TEST_PORT=${requestedPort} 已被占用`);
}

async function closeServer() {
  if (!server) return;
  const closing = server;
  server = undefined;
  await new Promise((resolve, reject) => closing.httpServer.close(error => error ? reject(error) : resolve()));
}

async function move(from, to) {
  try { await fs.rename(from, to); }
  catch (error) {
    if (error.code !== 'EXDEV') throw error;
    await fs.copyFile(from, to);
    await fs.unlink(from);
  }
}

async function ready(page, mapId) {
  await page.waitForFunction(id => {
    const scene = window.__scene;
    return scene?.map?.id === id && scene.player?.active && scene.dialog;
  }, mapId, { timeout: 25000 });
  await page.waitForTimeout(350);
  return page.evaluate(keys => {
    const scene = window.__scene;
    return {
      map: scene.map.id,
      testBridgePresent: !!window.__xt,
      textures: Object.fromEntries(keys.map(key => [key, scene.textures.exists(key)])),
      animationData: Object.fromEntries(keys.map(key => [key, scene.cache.json.has(`${key}_anims`)])),
      animations: scene.anims.anims.getArray().map(animation => animation.key).filter(key => key.startsWith('prop_')).sort(),
      portals: scene.portalVisuals.map(({ object, art, label }) => ({ name: object.name,
        type: art.type, texture: art.texture?.key ?? null, visible: art.visible, label: label?.text ?? '' })),
      chests: scene.map.objects.filter(object => object.type === 'chest').map(object => {
        const display = scene.children.getByName(`chest:${object.name}`);
        return { name: object.name, type: display?.type ?? null, texture: display?.texture?.key ?? null, visible: display?.visible };
      }),
      seclusions: scene.map.objects.filter(object => object.type === 'seclusion').map((object, index) => {
        const door = scene.children.list.find(display => display.type === 'Sprite' && display.depth === 4
          && display.x === object.x && display.y === object.y && display.texture?.key === 'prop_seclusion_door');
        const label = scene.seclusionLabels[index];
        return { name: object.name, doorType: door?.type ?? null, texture: door?.texture?.key ?? null,
          labelType: label?.type ?? null, label: label?.text ?? null, labelVisible: label?.visible,
          labelX: label?.x, labelY: label?.y, objectX: object.x, objectY: object.y };
      }),
    };
  }, assets.map(asset => asset.key));
}

async function phase(outDir, label) {
  checkInterrupted();
  const started = await startServer(outDir);
  server = started.server;
  result.baseURL = started.baseURL;
  let context;
  const events = emptyEvents();
  try {
    context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    // 两阶段独立存档；保留工程的发版开关，不调用测试桥或覆写 feature 配置。
    await context.addInitScript(() => {
      localStorage.setItem('xiantu_save_v1', JSON.stringify({ name: '道具缺图冒烟修士', level: 30, exp: 0,
        hp: 0, mp: 0, job: 'tianjian_disciple', sectRank: 'outer_disciple', sectContribution: 0,
        inventory: {}, quests: {}, openedChests: [], ageUpdatedAt: Date.now() }));
    });
    const page = await context.newPage();
    const cdp = await context.newCDPSession(page);
    await cdp.send('Network.enable');
    await cdp.send('Network.setCacheDisabled', { cacheDisabled: true });
    page.on('console', message => { if (message.type() === 'error') events.console.push(message.text()); });
    page.on('pageerror', error => events.page.push(error.message));
    page.on('requestfailed', request => events.request.push({ url: request.url(), failure: request.failure() }));
    page.on('request', request => {
      const pathname = new URL(request.url()).pathname;
      if (assets.some(asset => ['.png', '.json', '.anims.json'].some(extension =>
        pathname.endsWith(`/art/sprites/${asset.key}${extension}`))))
        events.assets.push({ url: request.url(), method: request.method() });
      if (request.method() === 'HEAD') events.head.push(request.url());
    });
    page.on('response', response => {
      if (response.status() >= 400) events.http.push({ status: response.status(), url: response.url() });
    });
    const state = {};
    for (const [name, mapId] of [['village', 'qingyun_village'], ['sect', 'tianjian_sect']]) {
      checkInterrupted();
      const url = new URL(started.baseURL);
      url.searchParams.set('map', mapId);
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      state[name] = await ready(page, mapId);
      equal(state[name].testBridgePresent, false, `${label} ${mapId} 必须使用正式构建`);
    }
    result[`${label}State`] = state;
    check(state.village.portals.length > 0, `${label} 青云村没有传送门测试对象`);
    check(state.village.chests.length > 0, `${label} 青云村没有宝匣测试对象`);
    check(state.sect.seclusions.length > 0, `${label} 天剑宗没有闭关室测试对象`);
    for (const [kind, rows] of Object.entries(events).filter(([kind]) => ['console', 'page', 'request', 'http', 'head'].includes(kind)))
      equal(rows.length, 0, `${label} 出现 ${kind}：${JSON.stringify(rows.slice(0, 10))}`);
    checkInterrupted();
    console.log(JSON.stringify({ mode: 'preview', phase: label, assetCount: assets.length, ...counts(events) }));
    return { state, events };
  } finally {
    result[label] = counts(events);
    result.events[label] = sampleEvents(events);
    try { await context?.close(); } finally { await closeServer(); }
  }
}

try {
  // npm run build 会正常 sync，不能直接复用旧 dist 或清单。
  await command('npm', ['run', 'build'], { XT_SYNC_MANIFEST_ONLY: '0', VITE_XT_TEST: '0' });
  const files = (await fs.readdir(spriteDir)).filter(file => /^prop_.*\.png$/.test(file)).sort();
  equal(files.length, 19, '必须覆盖全部 19 个 prop 图集 PNG');
  for (const file of files) {
    const key = file.slice(0, -4);
    const animationData = JSON.parse(await fs.readFile(path.join(spriteDir, `${key}.anims.json`), 'utf8'));
    check(animationData.anims?.length > 0, `${key} 缺少动画定义`);
    assets.push({ file: path.join(spriteDir, file), relative: `art/sprites/${file}`, key,
      animationKeys: animationData.anims.map(animation => animation.key), moved: false, restored: false });
  }
  result.assetCount = assets.length;
  const keys = assets.map(asset => asset.key);
  const animationKeys = assets.flatMap(asset => asset.animationKeys).sort();
  result.manifests.baseline = propKeys(await readManifest());
  equal(result.manifests.baseline, keys, '全部 prop PNG 均须进入基线构建清单');
  for (const asset of assets) asset.beforeHash = await sha256(asset.file);
  backupDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-props-missing-backup-'));
  temporaryDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-props-missing-dist-'));
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
  for (const state of Object.values(baseline.state)) {
    for (const asset of assets) {
      equal(state.textures[asset.key], true, `${state.map} 基线未加载 ${asset.key}`);
      equal(state.animationData[asset.key], true, `${state.map} 基线未加载 ${asset.key} 动画 JSON`);
      check(baseline.events.assets.some(request => new URL(request.url).pathname.endsWith(`/${asset.relative}`)
        && request.method === 'GET'), `基线未请求 ${asset.relative}`);
    }
    equal(state.animations, animationKeys, `${state.map} 基线未注册全部 prop 动画`);
    for (const portal of state.portals) {
      equal(portal.type, 'Sprite', `基线传送门 ${portal.name} 未显示 Sprite`);
      equal(portal.texture, 'prop_portal', `基线传送门 ${portal.name} 图集错误`);
      equal(portal.visible, true, `基线传送门 ${portal.name} 不可见`);
    }
    for (const chest of state.chests) {
      equal(chest.type, 'Sprite', `基线宝匣 ${chest.name} 未显示 Sprite`);
      equal(chest.texture, 'prop_chest', `基线宝匣 ${chest.name} 图集错误`);
      equal(chest.visible, true, `基线宝匣 ${chest.name} 不可见`);
    }
    for (const seclusion of state.seclusions) {
      equal(seclusion.doorType, 'Sprite', `基线闭关室 ${seclusion.name} 未显示 Sprite`);
      equal(seclusion.texture, 'prop_seclusion_door', `基线闭关室 ${seclusion.name} 图集错误`);
      equal(seclusion.labelType, 'Text', `基线闭关室 ${seclusion.name} 缺少文字`);
      equal(seclusion.labelVisible, true, `基线闭关室 ${seclusion.name} 文字不可见`);
      check(['闭关室 ↑', '暂未开放'].includes(seclusion.label), `基线闭关室 ${seclusion.name} 未保留发版文案`);
    }
  }

  for (const [index, asset] of assets.entries()) {
    checkInterrupted();
    asset.backup = path.join(backupDir, `${index}.png`);
    await move(asset.file, asset.backup);
    asset.moved = true;
    await assert.rejects(fs.stat(asset.file), { code: 'ENOENT' }); assertions++;
  }
  equal((await fs.readdir(spriteDir)).filter(file => /^prop_.*\.png$/.test(file)), [], '未移走全部 prop PNG');
  await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '1' });
  result.manifests.missing = propKeys(await readManifest());
  equal(result.manifests.missing, [], '缺图 prop 图集仍在构建清单');
  // 直接 vite build，防止 npm run build 的正常 sync 将刚移走的 PNG 拷回。
  await command('npx', ['vite', 'build', '--outDir', temporaryDir, '--emptyOutDir'], { VITE_XT_TEST: '0' });
  const missing = await phase(temporaryDir, 'missing');
  equal(missing.events.assets.length, 0, `缺图 prop 仍有网络请求：${JSON.stringify(missing.events.assets)}`);
  for (const [name, state] of Object.entries(missing.state)) {
    const before = baseline.state[name];
    for (const asset of assets) {
      equal(state.textures[asset.key], false, `${state.map} 缺图仍加载 ${asset.key}`);
      equal(state.animationData[asset.key], false, `${state.map} 缺图仍加载 ${asset.key} 动画 JSON`);
    }
    equal(state.animations, [], `${state.map} 缺图仍建立了 prop 动画`);
    equal(state.portals.map(portal => ({ name: portal.name, label: portal.label })),
      before.portals.map(portal => ({ name: portal.name, label: portal.label })), `${state.map} 缺图改变传送门发版文案`);
    for (const portal of state.portals) {
      equal(portal.type, 'Ellipse', `缺图传送门 ${portal.name} 未使用 Ellipse 回退`);
      equal(portal.visible, true, `缺图传送门 ${portal.name} 不可见`);
    }
    equal(state.chests.map(chest => chest.name), before.chests.map(chest => chest.name), `${state.map} 缺图丢失宝匣对象`);
    for (const chest of state.chests) {
      equal(chest.type, 'Rectangle', `缺图宝匣 ${chest.name} 未使用 Rectangle 回退`);
      equal(chest.visible, true, `缺图宝匣 ${chest.name} 不可见`);
    }
    equal(state.seclusions.map(seclusion => ({ name: seclusion.name, label: seclusion.label })),
      before.seclusions.map(seclusion => ({ name: seclusion.name, label: seclusion.label })), `${state.map} 缺图改变闭关室发版文案`);
    for (const seclusion of state.seclusions) {
      equal(seclusion.doorType, null, `缺图闭关室 ${seclusion.name} 仍显示 Sprite`);
      equal(seclusion.labelType, 'Text', `缺图闭关室 ${seclusion.name} 未回退文字`);
      equal(seclusion.labelVisible, true, `缺图闭关室 ${seclusion.name} 文字不可见`);
      equal([seclusion.labelX, seclusion.labelY], [seclusion.objectX, seclusion.objectY - 48],
        `缺图闭关室 ${seclusion.name} 文字回退位置错误`);
    }
  }
  result.passed = true;
} catch (error) {
  failure = error;
  result.failure = error.message;
} finally {
  // 任一步失败或信号中断，逐个还原并校验；还原失败时保留备份以便恢复。
  for (const asset of assets) {
    try {
      if (asset.moved) await move(asset.backup, asset.file);
      if (asset.beforeHash) {
        asset.afterHash = await sha256(asset.file);
        equal(asset.afterHash, asset.beforeHash, `${asset.relative} 还原后哈希变化`);
        asset.restored = true;
      }
    } catch (error) { result.cleanupErrors.push(`${asset.relative}: ${error.message}`); }
    result.restored.push({ file: asset.relative, restored: asset.restored, beforeHash: asset.beforeHash, afterHash: asset.afterHash });
  }
  try {
    await command('npm', ['run', 'sync'], { XT_SYNC_MANIFEST_ONLY: '0' }, true);
    result.manifests.restored = propKeys(await readManifest());
    if (assets.length === 19) equal(result.manifests.restored, assets.map(asset => asset.key), '还原后的清单缺少 prop 图集');
    for (const asset of assets) {
      if (asset.beforeHash) equal(await sha256(asset.file), asset.beforeHash, `${asset.relative} 正常 sync 后哈希变化`);
    }
  } catch (error) { result.cleanupErrors.push(`restore manifest: ${error.message}`); }
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
