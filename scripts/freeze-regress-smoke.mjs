// 默认先 build:test 再 preview；XT_SMOKE_BASE_URL 可复用已启动的测试构建。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function buildTest() {
  console.log('freeze smoke: npm run build:test');
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build:test'], { cwd: root,
      env: { ...process.env, NODE_OPTIONS: '', XT_DATA: 'snapshot' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const append = chunk => { output = (output + chunk.toString()).slice(-16000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`build:test failed (${code})\n${output}`)));
  });
}
async function loadBrowser() {
  const modules = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  let api;
  for (const name of modules) {
    try { api = await import(path.isAbsolute(name) ? pathToFileURL(name).href : name); break; }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  assert.ok(api, '未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
  const paths = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [api.chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium',
      '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'];
  for (const executablePath of paths) {
    try { await fs.access(executablePath); }
    catch { continue; }
    return api.chromium.launch({ executablePath, headless: true, timeout: 20000,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}
const snapshot = page => page.evaluate(() => window.__xt.loopSnapshot());
async function fire(page) {
  await page.evaluate(() => window.__xt.fireVolley({ inUpdate: true }));
  await page.waitForFunction(() => window.__xt.loopSnapshot().liveShots > 0);
  const state = await snapshot(page);
  assert.equal(state.groupAlive, true, '弹道组已被销毁');
  assert.equal(state.groupInCurrentWorld, true, '弹道组仍指向旧物理世界');
  assert.equal(state.liveShots, state.shots, '弹体缺少有效 sprite/body');
  assert.equal(state.shotOf, state.shots, '弹体索引未与列表同步');
  return state;
}
async function waitGone(page) {
  await page.waitForFunction(() => {
    const s = window.__xt.loopSnapshot(); return s.shots === 0 && s.shotOf === 0;
  }, null, { timeout: 12000 });
}
async function assertAlive(page, before) {
  await page.waitForFunction(frame => window.__xt.loopSnapshot().frame > frame + 12, before.frame,
    { timeout: 10000 });
  return snapshot(page);
}

let server, browser;
const results = [];
try {
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await buildTest();
    server = await preview({ root, preview: { port: Number(process.env.XT_TEST_PORT ?? 0) } });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await loadBrowser();
  for (const variant of ['revisit', 'inflight']) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(), pageErrors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => {
      const message = error.stack ?? error.message;
      pageErrors.push(message); console.error(`[freeze:${variant}] pageerror: ${message}`);
    });
    await page.addInitScript(() => localStorage.clear());
    const url = new URL(baseURL); url.searchParams.set('map', 'bamboo_forest');
    try {
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => window.__xt && window.__xt.loopSnapshot().mapId === 'bamboo_forest');
      const first = await fire(page);
      if (variant === 'revisit') await waitGone(page);
      const oldGeneration = (await snapshot(page)).sceneGeneration;
      await page.evaluate(() => window.__xt.teleport('lingxi_path'));
      const restarted = await snapshot(page);
      assert.equal(restarted.mapId, 'lingxi_path');
      assert.ok(restarted.sceneGeneration > oldGeneration, '换图没有重新 create');
      assert.equal(restarted.shots, 0, '旧图弹体跨图残留');
      assert.equal(restarted.shotOf, 0, '旧图弹体索引跨图残留');
      assert.equal(restarted.groupAlive, false, '旧图 PhysicsGroup 未置空');
      const second = await fire(page);
      await waitGone(page);
      const after = await assertAlive(page, second);
      // 已销毁 sprite 与空 body 两条异常分支也必须安全清理。
      for (const kind of ['sprite', 'body']) {
        await fire(page);
        await page.evaluate(mode => window.__xt.invalidateShot(mode), kind);
        await waitGone(page);
      }
      const errors = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('xiantu_errors') ?? '[]'),
        guarded: window.__xt.errors, events: window.__xt.events.drain().filter(event => event.type === 'error') }));
      assert.deepEqual(pageErrors, [], `pageerror: ${JSON.stringify(pageErrors)}`);
      assert.deepEqual(errors, { stored: [], guarded: [], events: [] }, '安全网捕获到了被掩盖的弹道错误');
      results.push({ variant, first, second, after, pageerror: pageErrors.length, errors: errors.stored.length });
      console.log(JSON.stringify({ variant, frame: [first.frame, after.frame], loop: 'alive', errors: 'none' }));
    } finally { await context.close(); }
  }
  console.log(JSON.stringify({ passed: true, variants: results.length }));
} finally {
  await browser?.close();
  await server?.close();
}
