// 先 npm run build:test；验证快照缺省、各入口关/开、旧档和已付料炉次保留。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const names = ['fiveSectClasses', 'sectDaily', 'sectRanks', 'sectShopLibrary', 'sectDonations', 'seclusion', 'alchemyPhase1', 'v05Maps'];
const port = Number(process.env.XT_TEST_PORT ?? 4312);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'XT_TEST_PORT 无效');
assert.ok(!(port >= 4186 && port <= 4190) && !(port >= 42863 && port <= 42865), '不能使用保留端口');

// 用独立临时工程检查可选文件，绝不改工作区发版配置。
const fixtureRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xt-features-'));
try {
  await fs.mkdir(path.join(fixtureRoot, 'src'));
  await fs.mkdir(path.join(fixtureRoot, 'data'));
  await fs.copyFile(path.join(root, 'src/features.ts'), path.join(fixtureRoot, 'src/features.ts'));
  for (const configured of [null, { sectDaily: false, alchemyPhase1: false }, Object.fromEntries(names.map(name => [name, false]))]) {
    if (configured) await fs.writeFile(path.join(fixtureRoot, 'data/features.json'), JSON.stringify(configured));
    const loader = await createServer({ root: fixtureRoot, configFile: false, server: { middlewareMode: true }, logLevel: 'error' });
    try {
      const features = await loader.ssrLoadModule('/src/features.ts');
      assert.deepEqual(features.featureFlags(), Object.fromEntries(names.map(name => [name, configured?.[name] ?? true])));
    } finally { await loader.close(); }
  }
} finally { await fs.rm(fixtureRoot, { recursive: true, force: true }); }

async function playwright() {
  for (const candidate of process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs']) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  for (const candidate of process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser']) {
    try { await fs.access(candidate); return candidate; } catch { /* 下一条路径 */ }
  }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}

let server, browser;
const errors = [];
try {
  const api = await playwright();
  server = await preview({ root, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true,
    timeout: 20000, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  page.on('pageerror', error => errors.push(`page: ${error.message}`));
  page.on('console', message => { if (message.type() === 'error') errors.push(`console: ${message.text()}`); });
  page.on('requestfailed', request => errors.push(`request: ${request.url()}`));
  page.on('response', response => { if (response.status() >= 400) errors.push(`HTTP ${response.status()}: ${response.url()}`); });
  await page.goto(`${server.resolvedUrls.local[0]}?map=luoxia_town&reset=1`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__xt && window.__scene?.player?.active);
  const result = await page.evaluate(async names => {
    const xt = window.__xt, unavailable = '暂未开放', checked = [];
    let assertions = 0;
    const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
    const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), `${message}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    const flip = (name, value) => {
      xt.setFlag(name, value);
      check(xt.getState().features[name] === value, `${name} 切换无效`);
      check(!Object.hasOwn(xt.exportSave().flags, name), `${name} 测试覆盖污染存档`);
    };
    for (const name of names) xt.setFlag(name, true);
    const now = xt.clock.pause();
    const base = { ...xt.exportSave(), level: 30, exp: 0, hp: 0, mp: 0, job: '', inventory: {}, equip: {},
      quests: { q_fox: { state: 'done', kills: {} } }, skills: {}, skillGifted: {}, hotbar: Array(8).fill(null),
      learnedRecipes: ['recipe_hp_pill'], pendingAlchemy: null, completedTrials: [], classVersion: 0, classRewardClaims: [],
      sectRank: null, sectContribution: 10000, flags: {}, sectGrowthState: { donationBatches: {}, settledTransactions: {} },
      dailyQuestResetDay: '', dailyQuestCompletions: {}, sectDailyContributionDay: '', sectDailyContributionClaims: [],
      age: 16, ageUpdatedAt: now, seclusionDay: '', seclusionYearsToday: 0, seclusionHistory: [],
      gatherRespawnAt: {}, skillCooldowns: {}, buffs: [], unstableUntil: 0,
      position: { mapId: 'luoxia_town', x: 320, y: 400 } };
    const load = async (patch = {}) => { await xt.loadSave({ ...base, ...patch }); return window.__scene; };
    let s = await load();
    flip('fiveSectClasses', false);
    check(!s.quests.available('q_sect_taixu') && !s.prog.advanceClass('taixu_acolyte'), '非剑徒仍可进入');
    check(s.quests.available('q_sect_tianjian'), '剑徒被关闭');
    s.talkTo('taixu_envoy', 'q_sect_taixu');
    check(s.dialog.body.text.includes(unavailable), '关闭职业没有开放提示');
    flip('fiveSectClasses', true);
    check(s.quests.available('q_sect_taixu'), '非剑徒未恢复');
    xt.joinSect('taixu');
    const joined = xt.exportSave();
    checked.push('fiveSectClasses');

    xt.acceptQuest('q_daily_taixu_2');
    const dailyBefore = JSON.stringify(s.prog.quests.q_daily_taixu_2), resetBefore = s.prog.dailyQuestResetDay;
    flip('sectDaily', false);
    check(s.quests.npcDailyQuestIds('taixu_envoy').length === 0, '日常菜单未隐藏');
    check(!s.quests.turnIn('q_daily_taixu_2'), '日常关闭仍可交付');
    xt.clock.advance(86400000);
    check(JSON.stringify(s.prog.quests.q_daily_taixu_2) === dailyBefore && s.prog.dailyQuestResetDay === resetBefore, '关闭日常仍发生重置');
    flip('sectDaily', true);
    check(s.quests.npcDailyQuestIds('taixu_envoy').includes('q_daily_taixu_2') && s.quests.available('q_daily_taixu_2'), '日常未恢复');
    checked.push('sectDaily');

    s = await load({ ...joined, ageUpdatedAt: xt.getState().time });
    xt.setFlag('sect_ranks.enabled', true);
    let resumeCue, staleCompletions = 0;
    s.dialog.show([{ speaker: null, text: '', cue: 'feature-test' }, { speaker: null, text: '旧对白' }], null,
      () => staleCompletions++, (_cue, next) => { resumeCue = next; });
    flip('sectRanks', false);
    resumeCue();
    check(!s.dialog.open && staleCompletions === 0, '关闭后旧演出回调仍恢复对白');
    check(s.sectGrowth.promotion('taixu_elder').key === unavailable, '晋升关闭仍可预览');
    check(!s.sectGrowth.promote('taixu_elder', 'inner_disciple', 'features:rank').ok, '关闭晋升仍结算');
    s.openSectPromotion('taixu_elder');
    check(s.dialog.body.text.includes(unavailable), '晋升入口没有开放提示');
    flip('sectRanks', true);
    check(s.sectGrowth.promotion('taixu_elder').ok, '晋升没有恢复');
    s.openSectPromotion('taixu_elder');
    check(s.dialog.choices.length > 1, '晋升菜单没有恢复');
    s.dialog.dismiss(); checked.push('sectRanks');

    flip('sectShopLibrary', false);
    for (const [npc, type] of [['taixu_envoy', 'sect_shop'], ['taixu_elder', 'sect_library']]) {
      check(s.sectGrowth.catalog(npc, type).key === unavailable, `${type} 未关闭`);
      check(!s.sectGrowth.exchange(npc, type, 'qi_pill', `features:${type}`).ok, `${type} 关闭仍结算`);
      s.openSectCatalog(npc, type);
      check(s.dialog.body.text.includes(unavailable), `${type} 入口没有开放提示`);
    }
    flip('sectShopLibrary', true);
    check(s.sectGrowth.services('taixu_envoy').some(row => row.type === 'sect_shop'), '货架服务未恢复');
    check(s.sectGrowth.catalog('taixu_elder', 'sect_library').key !== unavailable, '藏经阁未恢复');
    s.dialog.dismiss(); checked.push('sectShopLibrary');

    xt.setFlag('sect_donations.enabled', true);
    const config = s.sectGrowth.config;
    const donations = new s.sectGrowth.constructor(s.prog, { ...config, donations: { ...config.donations,
      offers: config.donations.offers.map(offer => ({ ...offer, enabled: true })) } });
    flip('sectDonations', false);
    check(donations.donations('taixu_envoy').key === unavailable, '上交未关闭');
    check(!donations.donate('taixu_envoy', 'missing', 'features:donation').ok, '关闭上交仍结算');
    s.openSectDonations('taixu_envoy');
    check(s.dialog.body.text.includes(unavailable), '上交入口没有开放提示');
    flip('sectDonations', true);
    check(donations.donations('taixu_envoy').ok && donations.donations('taixu_envoy').entries.length > 0, '上交未恢复');
    s.dialog.dismiss(); checked.push('sectDonations');

    const room = { props: { mode: 'sect', reqRealm: 'foundation' } };
    const history = s.prog.seclusionHistory.length, contribution = s.prog.sectContribution;
    flip('seclusion', false);
    s.completeSeclusion(room, 1);
    check(s.prog.seclusionHistory.length === history && s.prog.sectContribution === contribution, '关闭闭关仍扣费');
    check(s.dialog.body.text.includes(unavailable), '闭关没有开放提示');
    flip('seclusion', true);
    s.completeSeclusion(room, 1);
    check(s.prog.seclusionHistory.length === history + 1 && s.prog.sectContribution < contribution, '闭关未恢复');
    s.dialog.dismiss(); checked.push('seclusion');

    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, stones: 10000,
      inventory: { spirit_herb: 20, rabbit_fur: 20, bronze_furnace: 1 }, position: { mapId: 'bamboo_forest', x: 352, y: 480 } });
    check(s.openAlchemy('bronze_furnace') && s.alchemySystem.start('recipe_hp_pill').ok, '开炉夹具失败');
    const paid = JSON.stringify(s.prog.pendingAlchemy), materials = JSON.stringify(s.prog.inventory), stones = s.prog.stones;
    flip('alchemyPhase1', false);
    check(!s.alchemy.isOpen() && !s.openAlchemy('bronze_furnace'), '丹炉入口未关闭');
    check(!s.alchemySystem.start('recipe_hp_pill').ok && !s.alchemySystem.advanceFire(5000)
      && !s.alchemySystem.stopFire() && !s.alchemySystem.skipFire(), '关闭丹炉仍能开炉或结算');
    s.gathering.update(10000, true, false);
    check(s.gathering.points.length > 0 && s.gathering.points.every(point => !point.prompt.visible), '采集提示没有关闭');
    check(JSON.stringify(s.prog.pendingAlchemy) === paid && JSON.stringify(s.prog.inventory) === materials && s.prog.stones === stones, '已付料炉次或材料丢失');
    flip('alchemyPhase1', true);
    check(s.openAlchemy('bronze_furnace') && s.alchemySystem.skipFire(), '丹炉与火候未恢复');
    check(s.prog.stones === stones && !s.prog.pendingAlchemy, '恢复丹炉重复扣费');
    s.alchemy.suspend(); checked.push('alchemyPhase1');

    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, stones: 10000 });
    const portal = { props: { target: 'wanyao_outer_1' } }, oldPortal = { props: { target: 'bamboo_forest' } };
    flip('v05Maps', false);
    check(!s.portalOpen(portal) && s.portalOpen(oldPortal), '新地图门禁或旧地图兼容错误');
    let routes = [];
    const choose = s.dialog.choose;
    s.dialog.choose = function(line, portrait, choices, badge) { routes = choices; return choose.call(this, line, portrait, choices, badge); };
    try { s.talkTo('ferry_master'); } finally { s.dialog.choose = choose; }
    check(routes.some(row => row.reason === unavailable && row.disabled), '渡船新航线没有开放提示');
    await xt.teleport('wanyao_outer_1'); s = window.__scene;
    check(xt.getState().features.v05Maps === false && s.map.id === 'wanyao_outer_1', '关闭地图旧档无法加载');
    const back = s.map.objects.find(o => o.type === 'ferry' && o.props.returnTo === 'luoxia_town');
    check(back, '旧档缺少返程渡船');
    s.player.body.reset(back.x + 16, back.y);
    check(s.tryInteract(), '返程渡船不能交互');
    await new Promise((resolve, reject) => {
      const started = performance.now();
      const timer = setInterval(() => {
        if (window.__scene.map.id === 'luoxia_town') { clearInterval(timer); resolve(); }
        else if (performance.now() - started > 15000) { clearInterval(timer); reject(new Error(`旧档返程超时：${window.__scene.map.id}`)); }
      }, 50);
    }); s = window.__scene;
    check(s.map.id === 'luoxia_town', '旧档无法沿渡船返回旧地图');
    flip('v05Maps', true);
    check(s.portalOpen(portal), '新地图没有恢复');
    checked.push('v05Maps');

    // 所有开关关闭后读旧档：保存字段完整，存档的 true 不能越过发版门禁。
    const preserved = { ...joined, ageUpdatedAt: xt.getState().time, flags: Object.fromEntries(names.map(name => [name, true])),
      quests: { ...joined.quests, q_daily_taixu_2: { state: 'active', kills: {}, crafted: {} } }, dailyQuestResetDay: '2026-01-01',
      inventory: { spirit_herb: 7, rabbit_fur: 3 }, gatherRespawnAt: { 'bamboo_forest:save-check': now + 999999999 },
      position: { mapId: 'trial_lingfu_range', x: 64, y: 64 },
      pendingAlchemy: { recipeId: 'recipe_hp_pill', furnaceId: 'bronze_furnace', fire: {
        zoneWidth: 0.26, perfectWidth: 0.04, periodMs: 1200, zoneRandomPerBrew: true, zoneStart: 0.3, elapsedMs: 400, durationMs: 2000 } } };
    for (const name of names) xt.setFlag(name, false);
    await xt.loadSave(preserved); s = window.__scene;
    const restored = xt.exportSave();
    for (const field of ['job', 'skills', 'hotbar', 'sectRank', 'sectContribution', 'inventory', 'learnedRecipes', 'pendingAlchemy',
      'gatherRespawnAt', 'quests', 'dailyQuestResetDay', 'sectGrowthState', 'seclusionHistory']) same(restored[field], preserved[field], `关闭后读档丢失 ${field}`);
    check(names.every(name => xt.getState().features[name] === false), '存档开关越过发版配置');
    check(s.map.objects.some(o => o.type === 'portal' && o.props.target === 'qingyun_village' && s.portalOpen(o)), '未发布试炼旧档没有返程');
    for (const name of names) xt.setFlag(name, true);
    check(!s.map.objects.some(o => o.name === '__feature_return'), '重新开放仍残留临时返程');
    const events = xt.events.drain().filter(event => ['console.error', 'error', 'unhandledrejection', 'loaderror'].includes(event.type));
    same(events, [], '测试事件流出现错误');
    return { assertions, checked };
  }, names);
  assert.deepEqual(result.checked, names);
  assert.deepEqual(errors, [], '浏览器存在错误');
  console.log(JSON.stringify({ passed: true, flags: names.length, assertions: result.assertions, snapshotCases: 3,
    offOn: result.checked, consoleErrors: 0, pageErrors: 0, port }));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
