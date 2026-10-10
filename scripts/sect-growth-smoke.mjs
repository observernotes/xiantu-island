// npm run build 后执行：timeout 120s node scripts/sect-growth-smoke.mjs。
// 未发布服务只在浏览器内存启用；真实配置、data/ 与系统时间保持原样。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const readTable = async name => JSON.parse(await fs.readFile(path.join(dataRoot, `balance/${name}.json`), 'utf8'));
const [quests, ranks, strings, items] = await Promise.all(['quests', 'sect_ranks', 'strings_zh', 'items'].map(readTable));
const join = quests.find(q => q.id === 'q_sect_tianjian');
const dailies = quests.filter(q => q.daily && q.sect === 'tianjian');
const inner = ranks.ranks.find(r => r.id === 'inner_disciple');
const dailyContribution = dailies.reduce((total, q) => total + q.rewards.sectContribution, 0);
const days = Math.ceil(inner.reqContribution / dailyContribution);
assert.ok(Number.isInteger(days) && days > 0 && days <= 10, '内门冒烟日常夹具范围有误');
const exchangeItem = items.find(i => i.id === 'clear_mind_pill');
const fixtureCost = 35; // 测试报价，不是正式数值，也不回退 items.price。

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try { return { api: await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate), module: candidate }; }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* 下一路径 */ }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}
function collectErrors(page) {
  const errors = { console: [], page: [], request: [], http: [] };
  page.on('console', message => { if (message.type() === 'error') errors.console.push(message.text()); });
  page.on('pageerror', error => errors.page.push(error.message));
  page.on('requestfailed', request => errors.request.push(`${request.url()} ${request.failure()?.errorText}`));
  page.on('response', response => { if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`); });
  return errors;
}
async function press(page, key) {
  await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key);
}
async function sceneReady(page) {
  await page.waitForFunction(() => {
    const s = window.__scene;
    return s?.map?.id === 'tianjian_sect' && s.player?.active && s.dialog && s.quests && s.sectGrowth;
  }, null, { timeout: 15000 });
  await page.waitForTimeout(250);
}
async function finishDialog(page) {
  for (let i = 0; i < 20; i++) {
    if (!await page.evaluate(() => window.__scene.dialog.open)) return;
    assert.equal(await page.evaluate(() => window.__scene.dialog.choices.length), 0, '尚有未选菜单');
    await press(page, 'Enter');
  }
  assert.fail('对白没有结束');
}
async function openNpc(page, npcId) {
  assert.equal(await page.evaluate(npcId => {
    const s = window.__scene;
    s.dialog.close(); s.skillWindow.close();
    const o = s.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === npcId);
    if (!o) return false;
    s.player.body.reset(o.x, o.y); s.player.body.setVelocity(0, 0);
    return s.nearNpc() === npcId;
  }, npcId), true, `${npcId} 缺少真实点位`);
  await press(page, 'z');
  await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 3000 });
}
async function select(page, label) {
  for (let attempt = 0; attempt < 12; attempt++) {
    const choices = await page.evaluate(() => window.__scene.dialog.choices.map(c => ({ label: c.label, disabled: !!c.disabled })));
    const index = choices.findIndex(c => c.label === label || c.label.startsWith(`${label}（`));
    if (index >= 0) {
      assert.equal(choices[index].disabled, false, `${label} 被禁用`);
      assert.ok(index < 5, `${label} 不在数字菜单范围`);
      await press(page, String(index + 1));
      return;
    }
    const next = choices.findIndex(c => c.label.startsWith('›'));
    assert.ok(next >= 0 && next < 5, `菜单缺少 ${label}：${choices.map(c => c.label).join('/')}`);
    await press(page, String(next + 1));
  }
  assert.fail(`未找到 ${label}`);
}
async function daily(page, quest) {
  await openNpc(page, quest.giver); await select(page, strings[quest.nameKey]); await finishDialog(page);
  assert.equal(await page.evaluate(id => window.__scene.quests.state(id), quest.id), 'active');
  // 击杀胜利、采集材料和异图问讯事件作为夹具；领取和奖励走正式逻辑。
  await page.evaluate(quest => {
    const s = window.__scene;
    for (const o of quest.objectives) {
      if (o.type === 'kill') for (let n = 0; n < o.count; n++) s.quests.onKill(o.target);
      else if (o.type === 'collect') s.prog.addItem(o.target, o.count);
      else if (o.type === 'talk') s.quests.onTalk(o.target);
      else throw new Error(`未准备目标 ${o.type}`);
    }
  }, quest);
  await openNpc(page, quest.turnIn); await select(page, strings[quest.nameKey]); await finishDialog(page);
  assert.equal(await page.evaluate(id => window.__scene.quests.state(id), quest.id), 'done');
}

let browser, server, errors;
try {
  const { api, module } = await loadPlaywright();
  const executablePath = await browserPath(api.chromium);
  let baseURL = process.env.XT_SMOKE_BASE_URL;
  if (!baseURL) {
    await fs.access(path.join(projectRoot, 'dist/index.html'));
    server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: 4191 }, logLevel: 'error' });
    baseURL = server.resolvedUrls.local[0];
  }
  browser = await api.chromium.launch({ executablePath, headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage(); errors = collectErrors(page);
  await page.addInitScript(() => {
    const initial = new Date(2026, 9, 10, 5).getTime();
    window.__sectNow = Number(sessionStorage.getItem('sect-smoke-now') ?? initial);
    Date.now = () => window.__sectNow;
    if (!sessionStorage.getItem('sect-smoke-created')) {
      // 等级/前置为开发夹具，正式拜入事实必须由任务交付产生。
      localStorage.setItem('xiantu_save_v1', JSON.stringify({ name: '宗门服务冒烟修士', level: 30, exp: 0,
        hp: 0, mp: 0, job: '', inventory: {}, quests: { q_fox: { state: 'done', kills: {} } }, ageUpdatedAt: initial }));
      sessionStorage.setItem('sect-smoke-created', '1');
    }
  });
  const url = new URL(baseURL); url.searchParams.set('map', 'tianjian_sect');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 }); await sceneReady(page);
  console.log(JSON.stringify({ baseURL, playwright: module, browser: executablePath, headless: true }));

  const beforeJoin = await page.evaluate(join => {
    const s = window.__scene, p = s.prog;
    const before = { job: p.job, rank: p.sectRank, contribution: p.sectContribution };
    s.quests.talk(join.giver, join.id).after?.();
    return before;
  }, join);
  assert.deepEqual(beforeJoin, { job: '', rank: null, contribution: 0 });
  // 长老 services 菜单必须仍能办理原拜入任务，不能遮掉自动登记的任务入口。
  await openNpc(page, join.turnIn); await select(page, join.name); await finishDialog(page);
  const joined = await page.evaluate(id => ({ job: window.__scene.prog.job, rank: window.__scene.prog.sectRank,
    state: window.__scene.quests.state(id), contribution: window.__scene.prog.sectContribution }), join.id);
  assert.equal(joined.job, 'tianjian_disciple'); assert.equal(joined.rank, 'outer_disciple');
  assert.equal(joined.state, 'done'); assert.equal(joined.contribution, 0);

  // 真实表的关门/缺货不会意外开放；测试夹具只启用现有门槛与一件内门商品。
  const configured = await page.evaluate(({ ranks, item, cost }) => {
    const s = window.__scene, g = s.sectGrowth;
    const real = { promotion: g.promotion('tianjian_elder'), catalog: g.catalog('tianjian_envoy_sect', 'sect_shop') };
    const config = { ...g.config, ranks: { ...ranks, enabled: true }, shops: {
      ...g.config.shops, tianjian_envoy_sect: [{ item, reqRank: 'inner_disciple', costContribution: cost, enabled: true, balanceTodo: [] }],
    } };
    s.sectGrowth = new g.constructor(s.prog, config);
    return real;
  }, { ranks, item: exchangeItem.id, cost: fixtureCost });
  assert.equal(configured.promotion.ok, false, '真实关门配置误开放晋升');
  assert.equal(configured.promotion.key, 'sect.ui.config_pending');
  assert.equal(configured.catalog.entries.length, 0, '真实缺货配置误生成商品');

  for (let day = 0; day < days; day++) {
    await page.evaluate(day => {
      window.__sectNow = new Date(2026, 9, 10 + day, 5).getTime();
      sessionStorage.setItem('sect-smoke-now', String(window.__sectNow));
      window.__scene.quests.refreshDaily();
    }, day);
    for (const quest of dailies) await daily(page, quest);
    console.log(JSON.stringify({ dailyDay: day + 1, contribution: await page.evaluate(() => window.__scene.prog.sectContribution) }));
  }
  const contribution = await page.evaluate(() => window.__scene.prog.sectContribution);
  assert.equal(contribution, days * dailyContribution, '贡献必须全部由实际日常领取');
  assert.ok(contribution >= inner.reqContribution);

  await openNpc(page, 'tianjian_elder'); await select(page, strings['sect.promotion.menu']);
  await select(page, strings['sect.ui.confirm']); await finishDialog(page);
  assert.equal(await page.evaluate(() => window.__scene.prog.sectRank), inner.id, '内门确认未晋升');
  assert.equal(await page.evaluate(() => window.__scene.prog.sectContribution), contribution, '晋升错误扣贡献');
  await page.waitForTimeout(100);
  assert.ok(await page.evaluate(title => window.__scene.sectTitle.text.includes(title), strings['sect.title.tianjian.inner_disciple']), 'HUD没有内门称号');

  const beforeBuy = await page.evaluate(item => ({ count: window.__scene.prog.count(item), stones: window.__scene.prog.stones }), exchangeItem.id);
  await openNpc(page, 'tianjian_envoy_sect'); await select(page, strings['sect.shop.menu']);
  await select(page, exchangeItem.name);
  await page.evaluate(confirm => {
    window.__sectBuyConfirm = window.__scene.dialog.choices.find(c => c.label.startsWith(confirm)).onSelect;
  }, strings['sect.ui.confirm']);
  await select(page, strings['sect.ui.confirm']); await finishDialog(page);
  const bought = await page.evaluate(item => ({ rank: window.__scene.prog.sectRank, count: window.__scene.prog.count(item),
    contribution: window.__scene.prog.sectContribution, stones: window.__scene.prog.stones,
    receipts: Object.values(window.__scene.prog.sectGrowthState.settledTransactions) }), exchangeItem.id);
  assert.equal(bought.count, beforeBuy.count + 1); assert.equal(bought.contribution, contribution - fixtureCost);
  assert.equal(bought.stones, beforeBuy.stones, '贡献兑换额外扣灵石'); assert.equal(bought.rank, inner.id);
  assert.equal(bought.receipts.filter(r => r.kind === 'promotion').length, 1);
  assert.equal(bought.receipts.filter(r => r.kind === 'shop').length, 1);
  const repeatedBuy = await page.evaluate(item => {
    window.__sectBuyConfirm();
    return { count: window.__scene.prog.count(item), contribution: window.__scene.prog.sectContribution };
  }, exchangeItem.id);
  assert.deepEqual(repeatedBuy, { count: bought.count, contribution: bought.contribution }, '缓存确认回调重复结算');
  await finishDialog(page);

  await page.reload({ waitUntil: 'networkidle', timeout: 30000 }); await sceneReady(page);
  const reloaded = await page.evaluate(item => ({ rank: window.__scene.prog.sectRank,
    contribution: window.__scene.prog.sectContribution, count: window.__scene.prog.count(item) }), exchangeItem.id);
  assert.deepEqual(reloaded, { rank: inner.id, contribution: bought.contribution, count: bought.count });
  await page.waitForTimeout(300);
  assert.deepEqual(errors, { console: [], page: [], request: [], http: [] }, '浏览器冒烟出现报错');
  console.log(JSON.stringify({ passed: true, joinedByQuest: true, days, dailiesCompleted: days * dailies.length,
    contributionEarned: contribution, rank: bought.rank, exchanged: exchangeItem.id, fixtureCost,
    reloadRetained: true, duplicateConfirmBlocked: true, fixtureOnlyEnabled: true,
    consoleErrors: 0, pageErrors: 0, requestFailures: 0, httpErrors: 0 }));
} catch (error) {
  console.error(JSON.stringify({ failure: error.message, errors })); throw error;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
