// build:test 中以真实键盘事件、手动完整渲染帧比较 30 / 60 / 144 Hz。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const args = process.argv.slice(2);
const baseline = args.includes('--baseline');
const outputIndex = args.indexOf('--output');
const outputPath = outputIndex < 0 ? undefined : args[outputIndex + 1];
if (outputIndex >= 0 && !outputPath) throw new Error('--output 需要 JSON 文件路径');
for (let i = 0; i < args.length; i++) {
  if (args[i] === '--baseline') continue;
  if (args[i] === '--output') { i++; continue; }
  throw new Error(`未知参数：${args[i]}`);
}

async function buildTest() {
  console.log('fixed-step smoke: npm run build:test');
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

const snapshot = page => page.evaluate(() => window.__xt.fixedStep.snapshot());
const drain = page => page.evaluate(() => window.__xt.fixedStep.drain());
const advance = (page, frames) => page.evaluate(async n => (await window.__xt.fixedStep.advance(n)), frames);
const framesFor = (hz, ms) => {
  const frames = hz * ms / 1000;
  assert.ok(Math.abs(frames - Math.round(frames)) < 1e-8, `时间 ${ms} ms 不在 ${hz} Hz 帧边界上`);
  return Math.round(frames);
};
const runFor = (page, hz, ms) => advance(page, framesFor(hz, ms));

async function reset(page, hz) {
  for (const key of ['ArrowRight', 'ArrowLeft', 'c', 'x']) await page.keyboard.up(key);
  await page.evaluate(() => window.__xt.fixedStep.start());
  // 固定一秒预热，所有档位使用相同出生点、物理相位和静止状态。
  const state = await runFor(page, hz, 1000);
  assert.ok(state.grounded, `${hz} Hz：出生点一秒后仍未落地`);
  assert.ok(Math.abs(state.vx) < 1e-6 && Math.abs(state.vy) < 1e-6, `${hz} Hz：出生点未静止`);
  await drain(page);
  return state;
}

async function alignPulse(page, hz, state) {
  if (hz !== 144) return state;
  const initialSteps = state.physicsSteps;
  // 真实等到一次物理步完成；其后的 6.94 ms 渲染帧保证没有新物理步。
  for (let frames = 0; frames < 4; frames++) {
    state = await advance(page, 1);
    if (state.physicsSteps > initialSteps) return state;
  }
  throw new Error('144 Hz：四个渲染帧内没有物理步');
}

function flight(trace, launch, hz, name) {
  const airborne = trace.findIndex(s => s.bodyY < launch.bodyY - 0.1);
  if (airborne < 0) return { triggered: false, peakHeightPx: 0, landingMs: null, landed: false };
  const landing = trace.slice(airborne + 1).find(s => s.grounded && s.bodyY >= launch.bodyY - 0.1);
  const active = landing ? trace.filter(s => s.physicsSteps <= landing.physicsSteps) : trace;
  const peak = active.reduce((best, s) => s.bodyY < best.bodyY ? s : best, active[0]);
  return { triggered: true, peakHeightPx: launch.bodyY - peak.bodyY,
    landingMs: landing ? (landing.physicsSteps - launch.physicsSteps) * 1000 / 60 : null,
    landed: !!landing, landing, peak, hz, name };
}

async function measure(page, hz) {
  const walkStart = await reset(page, hz);
  await page.keyboard.down('ArrowRight');
  const walking = await runFor(page, hz, 1000);
  await page.keyboard.up('ArrowRight');
  const braked = await runFor(page, hz, 1000);

  const singleStart = await reset(page, hz);
  await page.keyboard.down('c');
  await runFor(page, hz, 1000 / 6);
  await page.keyboard.up('c');
  const singleEnd = await runFor(page, hz, 11000 / 6);
  const singleTrace = await drain(page);
  const single = flight(singleTrace, singleStart, hz, 'single');

  const doubleStart = await reset(page, hz);
  await page.keyboard.down('c');
  await runFor(page, hz, 1000 / 6);
  await page.keyboard.up('c');
  const secondPress = await runFor(page, hz, 1000 / 6);
  const beforeDouble = await drain(page);
  await page.keyboard.down('c');
  await runFor(page, hz, 1000 / 6);
  await page.keyboard.up('c');
  const doubleEnd = await runFor(page, hz, 1500);
  const afterDouble = await drain(page);
  const double = flight([...beforeDouble, ...afterDouble], doubleStart, hz, 'double');
  const secondTrace = double.landing
    ? afterDouble.filter(s => s.physicsSteps <= double.landing.physicsSteps) : afterDouble;
  const secondPeakY = Math.min(secondPress.bodyY, ...secondTrace.map(s => s.bodyY));

  // 此脉冲在 144 Hz 第一渲染帧采样后即松开，下一物理步必须只消费一次。
  const attackStart = await alignPulse(page, hz, await reset(page, hz));
  await page.keyboard.down('x');
  const pressed = await advance(page, 1);
  await page.keyboard.up('x');
  const attackEnd = await runFor(page, hz, 1000);

  const jumpPulseStart = await alignPulse(page, hz, await reset(page, hz));
  await page.keyboard.down('c');
  const jumpPressed = await advance(page, 1);
  await page.keyboard.up('c');
  const jumpPulseEnd = await runFor(page, hz, 1000);
  const jumpPulse = flight(await drain(page), jumpPulseStart, hz, 'short single');

  // 普攻原有长按连发规则也要保留；真实重复 keydown 不应变成额外按下边沿。
  const heldStart = await reset(page, hz);
  await page.keyboard.down('x');
  await runFor(page, hz, 500);
  await page.keyboard.down('x');
  await runFor(page, hz, 500);
  await page.keyboard.up('x');
  const heldEnd = await runFor(page, hz, 1000);

  const errors = await page.evaluate(() => ({ stored: JSON.parse(localStorage.getItem('xiantu_errors') ?? '[]'),
    guarded: window.__xt.errors, events: window.__xt.events.drain().filter(event =>
      ['error', 'console.error', 'unhandledrejection'].includes(event.type)) }));
  return {
    hz,
    walkPx: walking.x - walkStart.x,
    brakePx: braked.x - walking.x,
    jumpHeightPx: single.peakHeightPx,
    landingMs: single.landingMs,
    doubleHorizontalPx: double.landing ? double.landing.x - secondPress.x : 0,
    doubleVerticalPx: secondPress.bodyY - secondPeakY,
    doubleTotalHeightPx: double.peakHeightPx,
    doubleLandingMs: double.landingMs,
    doubleTriggered: doubleEnd.doubleJumps - doubleStart.doubleJumps === 1,
    singleLanded: single.landed,
    doubleLanded: double.landed,
    jumpEdges: { single: singleEnd.jumpEdges - singleStart.jumpEdges,
      double: doubleEnd.jumpEdges - doubleStart.jumpEdges },
    attackPulse: { physicsStepsDuringPress: pressed.physicsSteps - attackStart.physicsSteps,
      consumed: attackEnd.attackEdges - attackStart.attackEdges,
      attacks: attackEnd.attacks - attackStart.attacks },
    jumpPulse: { physicsStepsDuringPress: jumpPressed.physicsSteps - jumpPulseStart.physicsSteps,
      consumed: jumpPulseEnd.jumpEdges - jumpPulseStart.jumpEdges,
      triggered: jumpPulse.triggered, landed: jumpPulse.landed,
      doubleJumps: jumpPulseEnd.doubleJumps - jumpPulseStart.doubleJumps },
    heldAttack: { attacks: heldEnd.attacks - heldStart.attacks },
    stopped: Math.abs(braked.vx) < 1e-6,
    movementSteps: { physics: walking.physicsSteps - walkStart.physicsSteps,
      player: walking.playerSteps - walkStart.playerSteps },
    errors,
  };
}

function compare(results) {
  const reference = results.find(result => result.hz === 60);
  const fields = ['walkPx', 'brakePx', 'jumpHeightPx', 'doubleHorizontalPx', 'doubleVerticalPx'];
  return results.filter(result => result.hz !== 60).map(result => {
    const metrics = Object.fromEntries(fields.map(field => {
      const difference = Math.abs(result[field] - reference[field]);
      const tolerance = Math.max(2, Math.abs(reference[field]) * 0.03);
      return [field, { difference, tolerance, passed: difference <= tolerance + 1e-8 }];
    }));
    for (const field of ['landingMs', 'doubleLandingMs']) {
      const difference = result[field] === null || reference[field] === null
        ? null : Math.abs(result[field] - reference[field]);
      metrics[field] = { difference, tolerance: 34, passed: difference !== null && difference <= 34 + 1e-8 };
    }
    return { hz: result.hz, referenceHz: 60, metrics, passed: Object.values(metrics).every(metric => metric.passed) };
  });
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
  for (const hz of [60, 144, 30]) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    const page = await context.newPage(), pageErrors = [], consoleErrors = [];
    page.setDefaultTimeout(15000);
    page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    await page.addInitScript(() => localStorage.clear());
    const url = new URL(baseURL);
    url.searchParams.set('map', 'test');
    url.searchParams.set('xtRenderHz', String(hz));
    url.searchParams.set('xtManualLoop', '1');
    try {
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
      await page.waitForFunction(() => window.__xt?.fixedStep && window.__xt.loopSnapshot().mapId === 'field_test');
      const result = await measure(page, hz);
      results.push({ ...result, pageerror: pageErrors.length, consoleError: consoleErrors.length,
        pageErrors, consoleErrors });
      console.log(JSON.stringify({ hz, measured: true }));
    } finally { await context.close(); }
  }
  const differences = compare(results);
  const violations = [];
  const check = (condition, message) => { if (!condition) violations.push(message); };
  for (const result of results) {
    const prefix = `${result.hz} Hz`;
    check(result.pageerror === 0, `${prefix}: pageerror: ${JSON.stringify(result.pageErrors)}`);
    check(result.consoleError === 0, `${prefix}: console.error: ${JSON.stringify(result.consoleErrors)}`);
    check(result.errors.stored.length === 0 && result.errors.guarded.length === 0 && result.errors.events.length === 0,
      `${prefix}: 安全网捕获错误: ${JSON.stringify(result.errors)}`);
    check(result.stopped, `${prefix}: 松手一秒后仍未刹停`);
    check(result.movementSteps.player === result.movementSteps.physics,
      `${prefix}: 玩家逻辑与物理步未同步: ${JSON.stringify(result.movementSteps)}`);
    check(result.singleLanded && result.doubleLanded, `${prefix}: 跳跃后未落地`);
    check(result.doubleTriggered, `${prefix}: 二段跳没有恰好触发一次`);
    check(result.jumpEdges.single === 1 && result.jumpEdges.double === 2,
      `${prefix}: 跳跃按下丢失/重复: ${JSON.stringify(result.jumpEdges)}`);
    check(result.attackPulse.attacks === 1 && result.attackPulse.consumed === 1,
      `${prefix}: 短按攻击丢失/重复: ${JSON.stringify(result.attackPulse)}`);
    check(result.jumpPulse.consumed === 1 && result.jumpPulse.triggered && result.jumpPulse.landed
      && result.jumpPulse.doubleJumps === 0,
    `${prefix}: 短按跳跃丢失/重复: ${JSON.stringify(result.jumpPulse)}`);
    if (result.hz === 144) check(result.attackPulse.physicsStepsDuringPress === 0 && result.attackPulse.consumed === 1,
      `${prefix}: 未覆盖两次物理步之间的一次性输入锁存: ${JSON.stringify(result.attackPulse)}`);
    if (result.hz === 144) check(result.jumpPulse.physicsStepsDuringPress === 0,
      `${prefix}: 短按跳跃没有覆盖两次物理步之间的输入锁存`);
    check(result.heldAttack.attacks === 2, `${prefix}: 长按普攻连发规则改变: ${JSON.stringify(result.heldAttack)}`);
  }
  for (const comparison of differences) for (const [field, value] of Object.entries(comparison.metrics)) {
    check(value.passed, `${comparison.hz} vs 60 Hz ${field}: 差值 ${value.difference}，允许 ${value.tolerance}`);
  }
  const report = { baseline, passed: violations.length === 0, rates: results, differences, violations,
    units: { distance: 'px', time: 'ms', landingClock: 'physicsSteps * 1000 / 60' },
    script: { spawn: { map: 'field_test', x: 80, y: 704 }, warmupMs: 1000,
      walking: [{ atMs: 0, key: 'ArrowRight', down: true }, { atMs: 1000, key: 'ArrowRight', down: false }],
      singleJump: [{ atMs: 0, key: 'c', down: true }, { atMs: 1000 / 6, key: 'c', down: false }],
      doubleJump: [{ atMs: 0, key: 'c', down: true }, { atMs: 1000 / 6, key: 'c', down: false },
        { atMs: 1000 / 3, key: 'c', down: true }, { atMs: 500, key: 'c', down: false }],
      doubleDisplacement: 'second key press to landing (horizontal), second key press to apex (vertical)',
      attackPulse: 'x down, one render frame, x up; 144 Hz has no physics step during press',
      jumpPulse: 'c down, one render frame, c up; 144 Hz has no physics step during press' } };
  if (outputPath) await fs.writeFile(path.resolve(outputPath), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
  // 基线保留数值与失败原因；浏览器异常在基线模式下也必须使脚本失败。
  const browserFailures = results.flatMap(result => result.pageerror || result.consoleError || result.errors.stored.length
    || result.errors.guarded.length || result.errors.events.length ? [`${result.hz} Hz: 浏览器或安全网捕获错误`] : []);
  assert.deepEqual(baseline ? browserFailures : violations, [], 'fixed-step smoke 验收失败');
} finally {
  await browser?.close();
  await server?.close();
}
