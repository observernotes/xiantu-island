// 故意注入异常；安全网记录与测试桥 error 事件必须可见，不能要求 pageerror=0 掩盖错误。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
async function buildTest() {
  console.log('crash guard smoke: npm run build:test');
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
const records = page => page.evaluate(() => JSON.parse(localStorage.getItem('xiantu_errors') ?? '[]'));
async function expectGuard(page, frame) {
  await page.getByRole('alert').filter({ hasText: '按 R 恢复' }).waitFor({ state: 'visible' });
  await page.waitForFunction(before => window.__xt.loopSnapshot().frame > before + 8, frame, { timeout: 10000 });
}
async function recover(page, before) {
  await page.keyboard.press('r');
  await page.waitForFunction(previous => {
    try {
      const s = window.__xt.loopSnapshot();
      return s.sceneGeneration > previous.sceneGeneration && s.mapId === previous.mapId
        && !window.__xt.guardState().visible;
    } catch { return false; }
  }, before, { timeout: 10000 });
  await page.getByRole('alert').filter({ hasText: '按 R 恢复' }).waitFor({ state: 'hidden' });
  const start = await snapshot(page);
  await page.keyboard.down('ArrowRight');
  try {
    await page.waitForFunction(x => window.__xt.loopSnapshot().x > x + 2, start.x, { timeout: 3000 });
  }
  finally { await page.keyboard.up('ArrowRight'); }
  const after = await snapshot(page);
  assert.ok(after.frame > start.frame, '恢复后循环未推进');
  assert.ok(after.x > start.x + 2, `恢复后玩家无法移动: ${JSON.stringify({ start, after })}`);
  assert.equal(after.injectedUpdateErrors, 0, '恢复后仍残留注入错误');
  return after;
}

let server, browser;
const results = [], pageErrors = [];
try {
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await buildTest();
    server = await preview({ root, preview: { port: Number(process.env.XT_TEST_PORT ?? 0) } });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await loadBrowser();
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => {
    const message = error.stack ?? error.message;
    pageErrors.push(message); console.error(`[crash-guard] pageerror: ${message}`);
  });
  await page.addInitScript(() => {
    localStorage.clear();
    window.__crashGuardWrites = 0;
    const setItem = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === 'xiantu_errors') window.__crashGuardWrites++;
      return setItem.call(this, key, value);
    };
  });
  const url = new URL(baseURL); url.searchParams.set('map', 'bamboo_forest');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.__xt && window.__xt.loopSnapshot().frame > 5);

  const initial = await snapshot(page);
  await page.evaluate(() => window.__xt.injectUpdateError(1));
  await expectGuard(page, initial.frame);
  const firstRecords = await records(page);
  assert.equal(firstRecords.length, 1, '单次 update 异常未记录');
  assert.match(firstRecords[0].message, /injected update failure/);
  assert.equal(firstRecords[0].mapId, initial.mapId);
  assert.ok(firstRecords[0].time && firstRecords[0].stack, '记录缺少时间/调用栈');
  const observed = await page.evaluate(() => ({ errors: window.__xt.errors,
    events: window.__xt.events.drain().filter(event => event.type === 'error') }));
  assert.equal(observed.errors.length, 1, '测试桥无法观察已捕获错误');
  assert.ok(observed.events.some(event => event.data.message.includes('injected update failure')),
    '已捕获错误没有进入测试桥事件流');
  results.push({ phase: 'update', before: initial, after: await recover(page, initial) });

  const beforeRepeated = await snapshot(page), oldRecords = (await records(page)).length;
  const oldGuard = await page.evaluate(() => window.__xt.guardState());
  const beforeWrites = await page.evaluate(() => window.__crashGuardWrites);
  await page.evaluate(() => window.__xt.injectUpdateError(10000));
  await expectGuard(page, beforeRepeated.frame);
  await page.waitForFunction(calls => window.__xt.loopSnapshot().updateCalls > calls + 35,
    beforeRepeated.updateCalls, { timeout: 15000 });
  const repeatedRecords = await records(page), repeatedGuard = await page.evaluate(() => window.__xt.guardState());
  assert.ok(repeatedGuard.totalErrors > oldGuard.totalErrors + 30, '连续异常没有逐帧继续执行');
  assert.ok(repeatedGuard.suppressedErrors > oldGuard.suppressedErrors + 25, '重复错误没有限流');
  assert.ok(repeatedRecords.length <= oldRecords + 1, '连续每帧错误刷入 localStorage');
  const repeatedWrites = await page.evaluate(() => window.__crashGuardWrites);
  assert.ok(repeatedWrites <= beforeWrites + 1, '重复异常仍在逐帧写入 localStorage');
  assert.ok(repeatedRecords.length <= 20, '错误记录超出上限');
  results.push({ phase: 'continuous', guard: repeatedGuard, records: repeatedRecords.length,
    after: await recover(page, beforeRepeated) });

  for (const source of ['collider', 'render']) {
    const before = await snapshot(page);
    await page.evaluate(value => window.__xt.injectCallbackError(value), source);
    await expectGuard(page, before.frame);
    const latest = (await records(page)).slice(-1)[0];
    assert.match(latest.message, new RegExp(`injected ${source} failure`));
    results.push({ phase: source, after: await recover(page, before) });
  }

  // 原 window 监听仍收集事件；不同异常检验最近 20 条边界。
  const beforeWindow = await snapshot(page);
  await page.evaluate(() => {
    for (let i = 0; i < 25; i++) {
      const error = new Error(`xt guard window fixture ${i}`);
      window.dispatchEvent(new ErrorEvent('error', { message: error.message, error }));
    }
    window.dispatchEvent(new PromiseRejectionEvent('unhandledrejection', {
      promise: Promise.resolve(), reason: new Error('xt guard rejection fixture'),
    }));
  });
  await expectGuard(page, beforeWindow.frame);
  const bounded = await records(page);
  assert.equal(bounded.length, 20, '最近错误记录未保持 20 条上限');
  assert.match(bounded[bounded.length - 1].message, /xt guard rejection fixture/);
  const windowEvents = await page.evaluate(() => window.__xt.events.drain());
  assert.ok(windowEvents.some(event => event.type === 'unhandledrejection'), '原拒绝事件监听失效');
  assert.ok(windowEvents.some(event => event.type === 'error' && event.data.message === 'xt guard window fixture 24'),
    '原 window error 监听失效');
  await recover(page, beforeWindow);
  const unexpected = pageErrors.filter(message => !/injected (update|collider|render) failure|xt guard (window|rejection) fixture/.test(message));
  assert.deepEqual(unexpected, [], `出现非预期 pageerror: ${JSON.stringify(unexpected)}`);
  console.log(JSON.stringify({ passed: true, phases: results, records: bounded.length, pageerror: pageErrors.length }));
} finally {
  await browser?.close();
  await server?.close();
}
