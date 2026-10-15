// 性能冒烟共用 build:test、独立 preview 与浏览器；不改发布开关或已有存档。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

export const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));

export async function startPerfPreview(label) {
  if (process.env.XT_SMOKE_BASE_URL)
    return { baseURL: process.env.XT_SMOKE_BASE_URL, close: async () => {} };
  console.log(`${label}: npm run build:test`);
  await new Promise((resolve, reject) => {
    const child = spawn('npm', ['run', 'build:test'], { cwd: root,
      env: { ...process.env, NODE_OPTIONS: '', XT_DATA: 'snapshot' }, stdio: ['ignore', 'pipe', 'pipe'] });
    let output = '';
    const append = chunk => { output = (output + chunk.toString()).slice(-16000); };
    child.stdout.on('data', append); child.stderr.on('data', append);
    child.once('error', reject);
    child.once('close', code => code === 0 ? resolve() : reject(new Error(`build:test failed (${code})\n${output}`)));
  });
  const server = await preview({ root, preview: { port: Number(process.env.XT_TEST_PORT ?? 0) } });
  return { baseURL: server.resolvedUrls.local[0], close: () => server.close() };
}

export async function launchPerfBrowser(extraArgs = []) {
  const modules = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  let api;
  for (const name of modules) {
    try { api = await import(path.isAbsolute(name) ? pathToFileURL(name).href : name); break; }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  assert.ok(api, '未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
  const paths = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [api.chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser',
      '/home/box/.cache/ms-playwright/chromium_headless_shell-1243/chrome-headless-shell-linux64/chrome-headless-shell'];
  for (const executablePath of paths) {
    try { await fs.access(executablePath); } catch { continue; }
    return api.chromium.launch({ executablePath, headless: true, timeout: 20000,
      args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', ...extraArgs] });
  }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}

export async function createPerfPage(browser, label) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  await page.addInitScript(() => localStorage.clear());
  const errors = [];
  let rejectFailure;
  const failure = new Promise((_, reject) => { rejectFailure = reject; });
  // 监听器在导航前安装；即使游戏安全网吞掉异常，也会打印并使当前断言立即失败。
  const report = (kind, detail) => {
    const message = `[${label}] ${kind}: ${detail}`;
    errors.push(message); console.error(message); rejectFailure(new Error(message));
  };
  void failure.catch(() => {});
  page.on('pageerror', error => report('pageerror', error.stack ?? error.message));
  page.on('console', message => { if (message.type() === 'error') report('console.error', message.text()); });
  return { context, page, errors, run: task => Promise.race([Promise.resolve().then(task), failure]) };
}

export const loopSnapshot = page => page.evaluate(() => window.__xt.loopSnapshot());

export async function openPerfGame(page, baseURL, params = {}) {
  const url = new URL(baseURL);
  url.searchParams.set('map', 'bamboo_forest');
  for (const [key, value] of Object.entries(params)) {
    if (value === undefined) url.searchParams.delete(key);
    else url.searchParams.set(key, value);
  }
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.__xt && window.__xt.loopSnapshot().mapId === 'bamboo_forest');
  return assertPerfLoopAlive(page);
}

export async function assertPerfLoopAlive(page, before) {
  before ??= await loopSnapshot(page);
  await page.waitForFunction(previous => {
    const current = window.__xt.loopSnapshot();
    return current.frame > previous.frame + 6 && current.updateCalls > previous.updateCalls + 6;
  }, before, { timeout: 15000 });
  return loopSnapshot(page);
}

export async function assertPerfErrorsClean(page, browserErrors) {
  const errors = await page.evaluate(() => ({
    stored: JSON.parse(localStorage.getItem('xiantu_errors') ?? '[]'),
    guarded: window.__xt.errors,
    guardState: window.__xt.guardState(),
    events: window.__xt.events.drain().filter(event =>
      ['loaderror', 'console.error', 'error', 'unhandledrejection'].includes(event.type)),
  }));
  assert.deepEqual(browserErrors, [], '浏览器存在 pageerror 或 console.error');
  assert.deepEqual(errors.stored, [], '本地安全网留有错误记录');
  assert.deepEqual(errors.guarded, [], 'crashGuard 捕获到了错误');
  assert.deepEqual(errors.events, [], '测试桥捕获到了素材或运行时错误');
  assert.equal(errors.guardState.totalErrors, 0, 'crashGuard 曾捕获错误');
  assert.equal(errors.guardState.visible, false, '恢复提示不应出现');
  return { pageerror: 0, consoleError: 0, guardErrors: 0 };
}
