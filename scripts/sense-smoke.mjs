// 先 npm run build:test；只在当前浏览器内存启用表与夹具，不改正式地图或 balance。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const checks = [];
let assertions = 0, server, browser;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const seed = { name: '神识冒烟修士', level: 30, exp: 0, hp: 5000, mp: 5000, stones: 123,
  allocatedStats: { rootBone: 29, agility: 29, spirit: 29, insight: 29 }, unspentStatPoints: 0,
  questRewardVersion: 1, moralVersion: 1, ageUpdatedAt: Date.now() };

async function playwright() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'].filter(Boolean)) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  for (const candidate of [process.env.CHROMIUM_EXECUTABLE_PATH, chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await fs.access(candidate); return candidate; } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Chromium');
}
async function session(baseURL) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  await context.addInitScript(save => {
    if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
    if (!sessionStorage.getItem('sense-seeded')) {
      localStorage.setItem('xiantu_save_v1', JSON.stringify(save)); sessionStorage.setItem('sense-seeded', '1');
    }
  }, seed);
  const page = await context.newPage(), errors = { console: [], page: [], request: [], http: [] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.request.push(request.url()));
  page.on('response', response => { if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`); });
  await page.goto(new URL('?map=qingyun_village', baseURL).href, { waitUntil: 'load', timeout: 60000 });
  await page.waitForFunction(() => window.__xt?.senseFixture && window.__scene?.sense && window.__scene.player?.active,
    null, { timeout: 30000 });
  return { page, errors, async done(label) {
    try { eq(errors, { console: [], page: [], request: [], http: [] }, `${label}: 浏览器错误`); }
    finally { await context.close(); }
  } };
}

try {
  const baseURL = process.env.XT_SMOKE_BASE_URL ?? await (async () => {
    server = await preview({ root, preview: { host: '127.0.0.1', port: Number(process.env.SMOKE_PORT ?? 0), strictPort: false, open: false } });
    return server.resolvedUrls.local[0];
  })();
  const api = await playwright();
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  {
    const { page, done } = await session(baseURL);
    const before = await page.evaluate(() => {
      const s = window.__scene; s.physics.pause();
      return { mp: s.prog.mp, save: localStorage.getItem('xiantu_save_v1'), result: window.__xt.senseScan('key', 'off') };
    });
    eq(before.result.blockKey, 'sense.block.unavailable', '关态 requestScan 必须 unavailable');
    eq(await page.evaluate(() => window.__scene.prog.mp), before.mp, '关态扣了灵力');
    eq(await page.evaluate(() => localStorage.getItem('xiantu_save_v1')), before.save, '关态请求写了存档');
    const saved = await page.evaluate(() => { window.__scene.prog.save(); return JSON.parse(localStorage.getItem('xiantu_save_v1')); });
    eq(Object.hasOwn(saved, 'senseState'), false, '关态正常 save 不得写 senseState');
    await done('disabled'); checks.push('默认关态 unavailable、不扣蓝、不写盘，正常 save 无 senseState');
  }

  {
    const { page, done } = await session(baseURL);
    await page.evaluate(() => window.__xt.setFlag('spiritScan', true));
    const before = await page.evaluate(() => window.__xt.senseFixture({ cooldownMs: 1500, inspectDurationMs: 800 }));
    eq(before.preview.unlocked, true, '旧筑基档未按境界解锁');
    eq(before.preview.ready, true, '已填内存表没有就绪');
    eq(before.chestVisible, false, '未显形宝箱可见');
    ok(before.platform && !before.platform.enabled, '未显形平台提前启用碰撞');
    const hiddenChest = await page.evaluate(() => {
      const s = window.__scene; s.player.body.reset(224, s.map.spawn.y); s.player.body.updateFromGameObject();
      s.tryOpenChest(); return [...s.prog.openedChests];
    });
    eq(hiddenChest.includes(`${before.mapId}:${before.names.chest}`), false, '未显形宝箱可交互');
    const transaction = await page.evaluate(() => {
      const s = window.__scene, xt = window.__xt; xt.events.drain();
      const mp = s.prog.mp, center = { x: s.player.body.center.x, y: s.player.body.center.y };
      const first = xt.senseScan('key', 'smoke-first');
      const retry = xt.senseScan('button', 'smoke-first');
      const repeated = xt.senseScan('button', 'smoke-second');
      const intel = xt.senseMonsterIntel(), saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
      return { mp, center, first, retry, repeated, intel, saved, after: xt.senseFixtureSnapshot(), events: xt.events.drain(), now: Date.now() };
    });
    eq(transaction.first.ok, true, '扫描未成功提交');
    eq(transaction.retry.replayed, true, '同 scanId 重试未认领已提交操作');
    eq(transaction.first.count, 2, 'count 必须只计首次显形宝箱和平台');
    eq(transaction.after.mp, transaction.mp - before.preview.mpCost, '键鼠/同 scanId 重试重复扣费');
    eq(transaction.repeated.blockKey, 'sense.block.cooldown', '冷却重按未立即拒绝');
    eq(transaction.saved.mp, transaction.after.mp, '真实扣蓝未写盘');
    eq(transaction.saved.senseState.lastScanId, 'smoke-first', 'lastScanId 未提交');
    ok(transaction.saved.senseState.cooldownUntil > transaction.now, '冷却不是提交时真实到期时间');
    eq(transaction.after.chestVisible, true, '宝箱提交后未显形');
    eq(transaction.after.platform.enabled, true, '平台提交后碰撞未启用');
    eq(transaction.after.platform.checkCollision, { up: true, down: false, left: false, right: false }, '平台须只允许上表面落脚');
    eq(transaction.after.openedChests.includes(`${before.mapId}:${before.names.chest}`), false, '扫描自动开了箱');
    ok(transaction.after.revealed.includes(before.names.platform) && transaction.after.revealed.includes(before.names.hiddenChest), 'revealedHidden 缺少显形对象');
    const scanEvents = transaction.events.filter(event => event.type === 'sense:scan');
    eq(scanEvents.length, 1, '同 scanId 重试重复发成功事件');
    eq(scanEvents[0].data.center, transaction.center, '成功事件中心不是 body 中心冻结值');
    eq(scanEvents[0].data.radius, before.preview.radius, '成功事件半径与逻辑预览不符');
    ok(transaction.intel, '真实怪物没有生成临时情报');
    eq(Object.hasOwn(transaction.intel, 'name'), false, '情报泄漏未授权姓名');
    eq(Object.hasOwn(transaction.intel, 'level'), false, '情报泄漏未授权等级');
    eq(transaction.intel.abilities, ['尚未辨明'], '空公开能力列表没有沿用 unknown 文案');
    const changed = await page.evaluate(() => {
      const xt = window.__xt, intel = xt.senseMonsterIntel(); xt.senseHitMonster(1);
      xt.clock.advance(60000);
      return { intel: xt.senseMonsterIntel(), scan: xt.senseScan('key', 'game-clock-must-not-expire'), snapshot: intel };
    });
    eq(changed.intel, changed.snapshot, '怪物受击后情报变成实时血量');
    eq(changed.scan.blockKey, 'sense.block.cooldown', '游戏时钟推进清除了真实冷却');
    await page.waitForFunction(() => window.__xt.senseIntelList().length === 0, null, { timeout: 4000 });
    const expired = await page.evaluate(() => window.__xt.events.drain().filter(event => event.type === 'sense:intel-expired'));
    eq(expired.length, 1, '怪物情报到期未发一次 expired 事件');
    await page.waitForFunction(() => window.__xt.sensePreview().cooldownRemainingMs === 0, null, { timeout: 4000 });
    const known = await page.evaluate(() => window.__xt.senseScan('button', 'smoke-known'));
    eq(known.ok, true, '冷却到期后无法重新扫描');
    eq(known.count, 0, '重复扫描把已知物件计为首次显形');
    eq(known.result, 'known', '重复扫描没有使用 known 结果');
    eq(await page.evaluate(() => window.__xt.senseIntelList().length), 1, '重复扫描没有刷新临时情报');
    await page.evaluate(() => window.__xt.senseHitMonster(1000000));
    await page.waitForFunction(() => window.__xt.senseIntelList().length === 0, null, { timeout: 3000 });
    checks.push('真实扣蓝/冷却/同标识重试、键鼠重按、冻结事件、白名单/血量快照、过期与死亡清除');

    await page.waitForFunction(() => window.__xt.sensePreview().cooldownRemainingMs === 0, null, { timeout: 4000 });
    const beforeLoadIntel = await page.evaluate(() => {
      const xt = window.__xt; xt.senseSpawnMonster();
      return { result: xt.senseScan('button', 'smoke-reload'), intel: xt.senseIntelList() };
    });
    eq(beforeLoadIntel.result.ok, true, '读档情报夹具扫描未成功');
    eq(beforeLoadIntel.intel.length, 1, '读档前必须有仍有效的情报记录');
    const restored = await page.evaluate(async () => {
      const xt = window.__xt, s = window.__scene, before = xt.senseFixtureSnapshot();
      const save = xt.exportSave(); save.position = { mapId: s.map.id, x: 224, y: before.platform.top };
      await xt.loadSave(save);
      const fresh = window.__scene; fresh.physics.pause();
      return { snapshot: xt.senseFixtureSnapshot(), save: JSON.parse(localStorage.getItem('xiantu_save_v1')) };
    });
    eq(restored.snapshot.platform.enabled, true, '读档未恢复平台碰撞');
    eq(restored.snapshot.player.y, restored.snapshot.platform.top, '读档未把玩家放回平台落点');
    eq(restored.snapshot.chestVisible, true, '同 mapId 静态实例读档丢失宝箱显形');
    eq(restored.snapshot.intel, [], '读档保留了临时怪物情报');
    eq(restored.save.senseState.lastScanId, 'smoke-reload', '读档丢失已提交扫描记录');
    await page.evaluate(() => { const s = window.__scene; s.physics.resume(); s.player.body.setVelocity(0, 0); });
    await page.waitForFunction(() => {
      const xt = window.__xt, s = window.__scene, snap = xt.senseFixtureSnapshot();
      return s.game.loop.frame > 8 && snap.player.onGround && Math.abs(snap.player.bottom - snap.platform.top) < 2;
    }, null, { timeout: 4000 });
    const final = await page.evaluate(() => {
      const s = window.__scene; s.physics.pause();
      s.player.body.reset(224, s.map.spawn.y); s.player.body.updateFromGameObject(); s.tryOpenChest();
      return window.__xt.senseFixtureSnapshot();
    });
    eq(final.openedChests.includes(`${final.mapId}:${final.names.chest}`), true, '显形后未交还原生宝箱交互');
    await done('enabled'); checks.push('class hidden 平台和宝箱真实 MapBuilder 接入；先恢复平台碰撞再放玩家，实际落脚；原生开箱');
  }
  console.log(JSON.stringify({ suite: 'sense-smoke', passed: true, assertions, checks, consoleErrors: 0, pageErrors: 0 }));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
}
