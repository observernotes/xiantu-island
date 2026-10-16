import { installBrowserSaveReader } from './browser-save.mjs';
// 先运行 npm run build：只验收已有的正式 dist，不使用 build:test 或外部共享 preview。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from './isolated-build.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const port = Number(process.env.XT_TEST_PORT ?? 0);
assert.ok(Number.isInteger(port) && port >= 0 && port < 65536, 'XT_TEST_PORT 必须是有效端口');
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}

async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* 下一条路径 */ }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}

let server, browser;
const results = [];
try {
  await fs.access(path.join(root, 'dist/index.html'));
  const files = await fs.readdir(path.join(root, 'dist/assets'));
  const cheatChunks = files.filter(file => /^Cheat(?:Panel)?-[^/]+\.js$/i.test(file));
  check(cheatChunks.length > 0, '正式 dist 必须含独立动态 Cheat chunk；请先运行 npm run build');
  equal(files.filter(file => /^XtTestBridge-[^/]+\.js$/i.test(file)), [], '正式 dist 不应包含测试桥 chunk');
  const cheatPaths = new Set(cheatChunks.map(file => `/assets/${file}`));
  const playwright = await loadPlaywright();
  // 子进程 preview 会清空 NODE_OPTIONS，确保验收当前正式 dist。
  server = await preview({ root, preview: { port } });
  browser = await playwright.chromium.launch({ executablePath: await browserPath(playwright.chromium), headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  let baseline;
  const parameters = new URLSearchParams({ god: '1', stone: '987654', contrib: '4567', level: '30',
    realm: '筑基', exp: '满', unlock: 'skills,outfits', quest: 'accept:q_snake', spawn: 'item:fox_tailx3', __xt: '1' });
  const cases = [
    { search: '', enabled: false },
    { search: '?cheat=0', enabled: false },
    { search: '?cheat=false', enabled: false },
    { search: `?${parameters}`, enabled: false },
    { search: `?cheat=0&${parameters}`, enabled: false },
    { search: '?cheat=1', enabled: true },
    { search: '?cheat=true&__xt=1', enabled: true },
  ];
  for (const { search, enabled } of cases) {
    const label = `/${search}`;
    // 各入口使用全新缓存和存档，既不复用已加载模块，也不让作弊存档影响普通入口。
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 } });
    await installBrowserSaveReader(context);
    const page = await context.newPage();
    const pageErrors = [], consoleErrors = [], requests = [];
    page.setDefaultTimeout(20000);
    page.on('pageerror', error => pageErrors.push(error.stack ?? error.message));
    page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
    // 记录所有请求，连 modulepreload 都不能绕过关闭态检查。
    page.on('request', request => requests.push(request.url()));
    await context.addInitScript(() => localStorage.clear());
    try {
      const url = new URL(server.resolvedUrls.local[0]);
      url.search = search;
      await page.goto(url.href, { waitUntil: 'networkidle', timeout: 45000 });
      await page.waitForFunction(() => window.__scene?.player?.active && window.__scene?.quests);
      if (enabled) await page.waitForFunction(() => window.__cheat?.enabled && document.querySelector('#xt-cheat-panel'));
      equal(await page.evaluate(() => typeof window.__xt), 'undefined', `${label}：正式构建不挂测试桥`);
      const loadedCheats = requests.filter(value => cheatPaths.has(new URL(value).pathname)
        || /\/(?:Cheat|CheatPanel)-[^/]+\.js(?:\?|$)/i.test(value));
      equal(await page.locator('#xt-cheat-panel').count(), enabled ? 1 : 0, `${label}：面板遵守 URL 门控`);
      if (enabled) {
        check(loadedCheats.length > 0, `${label}：显式开启才请求 Cheat chunk`);
        const state = await page.evaluate(async () => {
          const api = window.__cheat;
          const ok = await api.setStones(2468);
          return { enabled: api.enabled, ok, stones: window.__scene.prog.stones,
            savedStones: (await window.__xtReadPersistedSave()).stones };
        });
        equal(state, { enabled: true, ok: true, stones: 2468, savedStones: 2468 }, `${label}：API 可调用并写入隔离存档`);
      } else {
        equal(await page.evaluate(() => typeof window.__cheat), 'undefined', `${label}：不挂作弊器 API`);
        equal(loadedCheats, [], `${label}：不请求 Cheat chunk`);
        const state = await page.evaluate(() => {
          const scene = window.__scene, progress = scene.prog;
          return { map: scene.map.id, level: progress.level, realm: progress.realm.id, exp: progress.exp,
            stones: progress.stones, contrib: progress.sectContribution, inventory: { ...progress.inventory },
            skills: { ...progress.skills }, quests: structuredClone(progress.quests) };
        });
        baseline ??= state;
        equal(state, baseline, `${label}：关闭态不应用任何作弊参数`);
        const damage = await page.evaluate(() => {
          const scene = window.__scene, player = scene.player;
          player.invulnUntil = 0; player.superArmorUntil = 0;
          const before = player.hp;
          const accepted = player.hurt(scene.time.now + 10000, player.x + 10, 7);
          return { accepted, lost: before - player.hp };
        });
        equal(damage, { accepted: true, lost: 7 }, `${label}：god 参数未越过 URL 门控`);
      }
    } finally {
      // 页面关闭前收集最后的异步异常，关闭整个 context 自动丢弃存档。
      await context.close();
      results.push({ path: label, enabled, pageerror: pageErrors.length, consoleError: consoleErrors.length });
      equal(pageErrors, [], `${label}：pageerror 必须为 0`);
      equal(consoleErrors, [], `${label}：console.error 必须为 0`);
    }
  }
  console.log(JSON.stringify({ suite: 'cheat-gate', passed: true, assertions, cases: results }));
} finally {
  try { await browser?.close(); }
  finally { await server?.close(); }
}
