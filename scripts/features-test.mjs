// 先 XT_DATA=snapshot npm run build:test；验证发版快照、各入口关/开及旧档兼容。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createServer, preview } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const names = ['fiveSectClasses', 'sectDaily', 'sectRanks', 'sectShopLibrary', 'shops', 'sectDonations', 'seclusion', 'alchemyPhase1', 'v05Maps', 'foxBoss'];
let configured = {};
try { configured = JSON.parse(await fs.readFile(path.join(root, 'data/features.json'), 'utf8')); }
catch (error) { if (error.code !== 'ENOENT') throw error; }
const expected = Object.fromEntries(names.map(name => [name,
  typeof configured?.[name] === 'boolean' ? configured[name] : name !== 'shops']));
if (process.env.QA_TIER_EXPECT_FEATURES) {
  // tier1 的清单可早于新开关；完整运行时开关仍在下方与工程快照核对。
  for (const [name, value] of Object.entries(JSON.parse(process.env.QA_TIER_EXPECT_FEATURES))) {
    assert.equal(expected[name], value, `tier1 关口 ${name} 与目标快照不一致`);
  }
}
// 四宗拜入保留登记并由 fiveSectClasses 显式开放，默认配置仍关闭本期未发布入口。
process.env.XT_DATA ??= 'snapshot';
const snapshotLoader = await createServer({ root, appType: 'custom',
  server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error' });
let taixuEntryPresent;
try {
  const features = await snapshotLoader.ssrLoadModule('/src/features.ts');
  assert.deepEqual(features.featureFlags(), expected, 'SSR 开关与工程快照不一致');
  const data = await snapshotLoader.ssrLoadModule('/src/data.ts');
  taixuEntryPresent = !!data.QUESTS.q_sect_taixu;
} finally { await snapshotLoader.close(); }
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
    const loader = await createServer({ root: fixtureRoot, configFile: false, server: { middlewareMode: true, hmr: false, ws: false }, logLevel: 'error' });
    try {
      const features = await loader.ssrLoadModule('/src/features.ts');
      assert.deepEqual(features.featureFlags(), Object.fromEntries(names.map(name => [name, configured?.[name] ?? (name !== 'shops')])));
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
  const result = await page.evaluate(async ({ names, expected, taixuEntryPresent }) => {
    const xt = window.__xt, unavailable = '暂未开放', checked = [];
    let assertions = 0;
    const check = (value, message) => { if (!value) throw new Error(message); assertions++; };
    const same = (a, b, message) => check(JSON.stringify(a) === JSON.stringify(b), `${message}: ${JSON.stringify(a)} / ${JSON.stringify(b)}`);
    const flip = (name, value) => {
      xt.setFlag(name, value);
      check(xt.getState().features[name] === value, `${name} 切换无效`);
      check(!Object.hasOwn(xt.exportSave().flags, name), `${name} 测试覆盖污染存档`);
    };
    same(xt.getState().features, expected, '页面初始开关与发版快照不一致');
    // 以下关/开覆盖仅用于当前页面的隔离测试；刷新必须恢复发版快照。
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
    if (taixuEntryPresent) {
      s.talkTo('taixu_envoy', 'q_sect_taixu');
      check(s.dialog.body.text.includes(unavailable), '关闭职业没有开放提示');
    }
    flip('fiveSectClasses', true);
    check(s.quests.available('q_sect_taixu') === taixuEntryPresent, '非剑徒入口未遵循任务阶段');
    xt.joinSect('tianjian');
    check(s.prog.job === 'tianjian_disciple', '天剑正常拜入失败');
    const joined = xt.exportSave();
    checked.push('fiveSectClasses');

    xt.acceptQuest('q_daily_tianjian_2');
    const dailyBefore = JSON.stringify(s.prog.quests.q_daily_tianjian_2), resetBefore = s.prog.dailyQuestResetDay;
    flip('sectDaily', false);
    check(s.quests.npcDailyQuestIds('tianjian_envoy_sect').length === 0, '日常菜单未隐藏');
    check(!s.quests.turnIn('q_daily_tianjian_2'), '日常关闭仍可交付');
    xt.clock.advance(86400000);
    check(JSON.stringify(s.prog.quests.q_daily_tianjian_2) === dailyBefore && s.prog.dailyQuestResetDay === resetBefore, '关闭日常仍发生重置');
    flip('sectDaily', true);
    check(s.quests.npcDailyQuestIds('tianjian_envoy_sect').includes('q_daily_tianjian_2') && s.quests.available('q_daily_tianjian_2'), '日常未恢复');
    checked.push('sectDaily');

    s = await load({ ...joined, ageUpdatedAt: xt.getState().time });
    xt.setFlag('sect_ranks.enabled', true);
    let resumeCue, staleCompletions = 0;
    s.dialog.show([{ speaker: null, text: '', cue: 'feature-test' }, { speaker: null, text: '旧对白' }], null,
      () => staleCompletions++, (_cue, next) => { resumeCue = next; });
    flip('sectRanks', false);
    resumeCue();
    check(!s.dialog.open && staleCompletions === 0, '关闭后旧演出回调仍恢复对白');
    check(s.sectGrowth.promotion('tianjian_elder').key === unavailable, '晋升关闭仍可预览');
    check(!s.sectGrowth.promote('tianjian_elder', 'inner_disciple', 'features:rank').ok, '关闭晋升仍结算');
    s.openSectPromotion('tianjian_elder');
    check(s.dialog.body.text.includes(unavailable), '晋升入口没有开放提示');
    flip('sectRanks', true);
    check(s.sectGrowth.promotion('tianjian_elder').ok, '晋升没有恢复');
    s.openSectPromotion('tianjian_elder');
    check(s.dialog.choices.length > 1, '晋升菜单没有恢复');
    s.dialog.dismiss(); checked.push('sectRanks');

    flip('sectShopLibrary', false);
    for (const [npc, type] of [['tianjian_envoy_sect', 'sect_shop'], ['tianjian_elder', 'sect_library']]) {
      check(s.sectGrowth.catalog(npc, type).key === unavailable, `${type} 未关闭`);
      check(!s.sectGrowth.exchange(npc, type, 'qi_pill', `features:${type}`).ok, `${type} 关闭仍结算`);
      s.openSectCatalog(npc, type);
      check(s.dialog.body.text.includes(unavailable), `${type} 入口没有开放提示`);
    }
    flip('sectShopLibrary', true);
    check(s.sectGrowth.services('tianjian_envoy_sect').some(row => row.type === 'sect_shop'), '货架服务未恢复');
    check(s.sectGrowth.catalog('tianjian_elder', 'sect_library').key !== unavailable, '藏经阁未恢复');
    s.dialog.dismiss(); checked.push('sectShopLibrary');

    s.prog.stones = 1000; s.prog.addItem('qi_pill', 1);
    const shopBefore = JSON.stringify({ inventory: s.prog.inventory, stones: s.prog.stones, growth: s.prog.sectGrowthState });
    flip('shops', false);
    check(s.sectGrowth.ordinaryCatalog('doctor_sun').entries.length === 0, '普通货架关闭仍展示');
    check(s.sectGrowth.ordinarySellCatalog('doctor_sun').entries.length === 0, '出售目录关闭仍展示');
    check(!s.sectGrowth.buyOrdinary('doctor_sun', 'qi_pill', 'features:shop-buy').ok, 'shops 关闭仍购买');
    check(!s.sectGrowth.sellOrdinary('doctor_sun', 'qi_pill', 'features:shop-sell').ok, 'shops 关闭仍出售');
    check(s.sectGrowth.catalog('tianjian_envoy_sect', 'sect_shop').key === unavailable, 'shops 关闭仍开放宗门商店');
    check(s.sectGrowth.catalog('tianjian_elder', 'sect_library').key !== unavailable, 'shops 关闭影响藏经阁');
    same(JSON.stringify({ inventory: s.prog.inventory, stones: s.prog.stones, growth: s.prog.sectGrowthState }), shopBefore, '关闭商店仍变更余额、库存或收据');
    flip('shops', true);
    check(s.sectGrowth.ordinaryCatalog('doctor_sun').ok && s.sectGrowth.ordinarySellCatalog('doctor_sun').ok, '普通买卖没有恢复');
    checked.push('shops');

    xt.setFlag('sect_donations.enabled', true);
    const config = s.sectGrowth.config;
    const donations = new s.sectGrowth.constructor(s.prog, { ...config, donations: { ...config.donations,
      offers: config.donations.offers.map(offer => ({ ...offer, enabled: true })) } });
    flip('sectDonations', false);
    check(donations.donations('tianjian_envoy_sect').key === unavailable, '上交未关闭');
    check(!donations.donate('tianjian_envoy_sect', 'missing', 'features:donation').ok, '关闭上交仍结算');
    s.openSectDonations('tianjian_envoy_sect');
    check(s.dialog.body.text.includes(unavailable), '上交入口没有开放提示');
    flip('sectDonations', true);
    check(donations.donations('tianjian_envoy_sect').ok && donations.donations('tianjian_envoy_sect').entries.length > 0, '上交未恢复');
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

    const foxPrereqs = { q_breakthrough: { state: 'done', kills: {} } };
    const foxPosition = { mapId: 'lingxi_path', x: 64, y: 960 };
    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, inventory: { fox_tail: 1 },
      quests: { ...foxPrereqs, q_fox: { state: 'active', kills: {} } }, position: foxPosition });
    const liveFoxes = () => s.mobs.filter(m => m.def.id === 'demon_fox' && m.active && !m.dead);
    check(liveFoxes().length > 0, '妖狐关态夹具没有生成首领');
    const foxBefore = xt.exportSave();
    flip('foxBoss', false);
    check(liveFoxes().length === 0, '关闭妖狐后仍留有活跃首领');
    same(xt.exportSave().quests.q_fox, foxBefore.quests.q_fox, '关闭妖狐回滚任务进度');
    s.quests.onKill('demon_fox');
    same(s.prog.quests.q_fox, foxBefore.quests.q_fox, '妖狐任务关闭仍推进击杀数');
    check(!s.quests.complete('q_fox') && !s.quests.turnIn('q_fox'), '妖狐任务关闭仍完成或交付');
    s.talkTo('tianjian_envoy', 'q_fox');
    check(s.dialog.body.text.includes(unavailable), '进行中的妖狐任务没有开放提示');
    const bossPortal = { props: { target: 'lingxi_path', bossOnly: true } };
    check(!s.portalOpen(bossPortal), '妖狐专用传送门没有关闭');
    check(s.map.objects.filter(o => o.type === 'portal').every(o => s.portalOpen(o)), '关闭妖狐影响山道常规出口');

    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, quests: foxPrereqs, position: foxPosition });
    check(!s.quests.available('q_fox') && !s.quests.accept('q_fox'), '妖狐任务关闭仍可接取');
    s.talkTo('tianjian_envoy');
    check(s.dialog.body.text.includes(unavailable), '妖狐任务普通 NPC 入口没有开放提示');
    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, stones: 900,
      inventory: { fox_tail: 1, foundation_shard: 1 }, equip: { ...joined.equip, weapon: 'azure_steel_sword' },
      quests: { ...foxPrereqs, q_fox: { state: 'active', kills: { demon_fox: 1 } } }, position: foxPosition });
    const killedFox = xt.exportSave();
    check(liveFoxes().length === 0, '妖狐关闭后载入进行中存档仍生成首领');
    s.quests.onKill('demon_fox');
    check(!s.quests.turnIn('q_fox'), '已有击杀的妖狐任务关闭仍交付');
    const heldFox = xt.exportSave();
    for (const field of ['quests', 'inventory', 'equip', 'stones']) same(heldFox[field], killedFox[field], `关闭妖狐丢失已有击杀或奖励 ${field}`);

    flip('foxBoss', true);
    check(s.portalOpen(bossPortal), '妖狐专用传送门没有恢复');
    s = await load({ ...joined, ageUpdatedAt: xt.getState().time, inventory: { fox_tail: 1 },
      quests: foxPrereqs, position: foxPosition });
    check(s.quests.available('q_fox'), '妖狐任务没有恢复接取');
    xt.acceptQuest('q_fox');
    await xt.teleport('lingxi_path'); s = window.__scene;
    check(liveFoxes().length > 0, '重新开放妖狐后首领没有恢复生成');
    s.quests.onKill('demon_fox');
    check(s.quests.complete('q_fox'), '重新开放妖狐后任务没有恢复推进');
    check(xt.completeQuest('q_fox') && s.quests.state('q_fox') === 'done', '重新开放妖狐后无法交付');
    const foxCompleted = xt.exportSave();
    check(foxCompleted.quests.q_fox.kills.demon_fox === 1
      && foxCompleted.inventory.foundation_shard >= 1 && foxCompleted.inventory.pillar_shard_1 >= 1
      && Object.values(foxCompleted.equip).includes('azure_steel_sword'), '妖狐任务完成奖励缺失');
    checked.push('foxBoss');

    // 所有开关关闭后读旧档：保存字段完整，存档的 true 不能越过发版门禁。
    const preserved = { ...joined, ageUpdatedAt: xt.getState().time, flags: Object.fromEntries(names.map(name => [name, true])),
      quests: { ...foxCompleted.quests, q_daily_tianjian_2: { state: 'active', kills: {}, crafted: {} } }, dailyQuestResetDay: '2026-01-01',
      inventory: { ...foxCompleted.inventory, spirit_herb: 7, rabbit_fur: 3 }, equip: foxCompleted.equip,
      skills: foxCompleted.skills, stones: foxCompleted.stones, gatherRespawnAt: { 'bamboo_forest:save-check': now + 999999999 },
      position: { mapId: 'trial_lingfu_range', x: 64, y: 64 },
      pendingAlchemy: { recipeId: 'recipe_hp_pill', furnaceId: 'bronze_furnace', fire: {
        zoneWidth: 0.26, perfectWidth: 0.04, periodMs: 1200, zoneRandomPerBrew: true, zoneStart: 0.3, elapsedMs: 400, durationMs: 2000 } } };
    for (const name of names) xt.setFlag(name, false);
    await xt.loadSave(preserved); s = window.__scene;
    const restored = xt.exportSave();
    for (const field of ['job', 'skills', 'hotbar', 'sectRank', 'sectContribution', 'inventory', 'equip', 'stones', 'learnedRecipes', 'pendingAlchemy',
      'gatherRespawnAt', 'quests', 'dailyQuestResetDay', 'sectGrowthState', 'seclusionHistory']) same(restored[field], preserved[field], `关闭后读档丢失 ${field}`);
    check(names.every(name => xt.getState().features[name] === false), '存档开关越过发版配置');
    check(s.map.objects.some(o => o.type === 'portal' && o.props.target === 'qingyun_village' && s.portalOpen(o)), '未发布试炼旧档没有返程');
    for (const name of names) xt.setFlag(name, true);
    check(!s.map.objects.some(o => o.name === '__feature_return'), '重新开放仍残留临时返程');
    const events = xt.events.drain().filter(event => ['console.error', 'error', 'unhandledrejection', 'loaderror'].includes(event.type));
    same(events, [], '测试事件流出现错误');
    return { assertions, checked };
  }, { names, expected, taixuEntryPresent });
  assert.deepEqual(result.checked, names);
  await page.reload({ waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__xt && window.__scene?.player?.active);
  assert.deepEqual(await page.evaluate(() => window.__xt.getState().features), expected,
    '刷新未恢复发版快照或测试覆盖泄漏');
  assert.deepEqual(errors, [], '浏览器存在错误');
  console.log(JSON.stringify({ passed: true, flags: names.length, assertions: result.assertions, snapshotCases: 3,
    snapshot: expected, taixuEntryPresent, reloadRestored: true, offOn: result.checked, consoleErrors: 0, pageErrors: 0, port }));
} finally {
  await browser?.close();
  if (server) await new Promise(resolve => server.httpServer.close(resolve));
}
