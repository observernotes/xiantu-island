// 先 npm run build:test；无头验证测试接口，端口可用 XT_TEST_PORT 覆盖。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';
import { findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const quests = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/quests.json'), 'utf8'));
const classes = JSON.parse(await fs.readFile(path.join(projectRoot, 'src/config/classes.json'), 'utf8')).classes;
const pacing = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/solo_pacing.json'), 'utf8')).sectSeclusion;
const daily = quests.find(q => q.id === 'q_daily_taixu_2');
const collect = daily.objectives.find(o => o.type === 'collect');
const awaken = quests.find(q => q.id === 'q_awaken');
const bamboo = quests.find(q => q.id === 'q_bamboo');
const port = Number(process.env.XT_TEST_PORT ?? 4311);
assert.ok(Number.isInteger(port) && port > 0 && port < 65536, 'XT_TEST_PORT 必须是有效端口');
assert.ok(!(port >= 4186 && port <= 4190) && !(port >= 42863 && port <= 42865), '测试端口不能占用保留区间');
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
const browserErrors = [];
let blockedImage;
let malformedImage;
let initialEventTypes = [];
try {
  await fs.access(path.join(projectRoot, 'dist/index.html'));
  const api = await loadPlaywright();
  server = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true,
    timeout: 20000, args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  page.setDefaultTimeout(15000);
  page.on('pageerror', error => browserErrors.push(error.message));
  // 在首次 preload 前拦截一张可缺省背景图，不改动真实资源文件。
  // 启动时的存在性探测（HEAD，G15）放行，只让 Phaser 的 GET 失败，模拟探测后文件丢失，仍须进入 loaderror。
  await page.route('**/art/tiles/bg_*_far.png', async route => {
    const requested = route.request().url();
    blockedImage ??= requested;
    if (requested === blockedImage && route.request().method() !== 'HEAD') await route.abort('failed');
    else await route.continue();
  });
  // HTTP 200 的无效 PNG 走图片解码失败入口，仍须收录 loaderror / console.error。
  await page.route('**/art/tiles/bg_*_mid.png', async route => {
    const requested = route.request().url();
    malformedImage ??= requested;
    if (requested === malformedImage) await route.fulfill({ status: 200, contentType: 'image/png', body: 'xt invalid PNG' });
    else await route.continue();
  });
  const url = new URL(server.resolvedUrls.local[0]); url.searchParams.set('map', 'luoxia_town');
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.__xt && window.__scene?.player?.active && window.__scene?.quests);

  const initial = await page.evaluate(() => ({ state: window.__xt.getState(), save: window.__xt.exportSave(),
    events: window.__xt.events.drain() }));
  initialEventTypes = initial.events.map(event => event.type);
  for (const key of ['mapId', 'x', 'y', 'level', 'realm', 'hp', 'mp', 'inventory', 'quests', 'sect', 'rank', 'contribution', 'time']) {
    check(Object.hasOwn(initial.state, key), `getState 缺少 ${key}`);
  }
  equal(initial.state.mapId, 'luoxia_town', 'getState 地图错误');
  check(Number.isFinite(initial.state.time), 'getState 时间不是毫秒数值');
  const blockedKey = blockedImage && path.basename(new URL(blockedImage).pathname, '.png');
  const malformedKey = malformedImage && path.basename(new URL(malformedImage).pathname, '.png');
  check(blockedKey && initial.events.some(event => event.type === 'loaderror' && event.data?.key === blockedKey), '初始 preload 缺图未进入事件流');
  check(malformedKey && initial.events.some(event => event.type === 'loaderror' && event.data?.key === malformedKey),
    'HTTP 200 图片解码失败未通过 onProcessError 进入 loaderror');
  check(malformedKey && initial.events.some(event => event.type === 'console.error' && JSON.stringify(event.data).includes(malformedKey)),
    '图片解码失败的 console.error 未进入事件流');
  check(initial.events.some(event => event.type === 'scene'), '首次场景创建未进入事件流');
  check(initial.events.every(event => Number.isFinite(event.time) && Object.hasOwn(event, 'data')), '事件缺少 time/data');
  equal(await page.evaluate(() => window.__xt.events.drain()), [], 'drain 没有清空事件队列');

  // pause 固定绝对时间；resume 恢复系统时间的推进，setNow/advance 给出精确边界。
  const paused = await page.evaluate(() => window.__xt.clock.pause());
  await page.waitForTimeout(60);
  equal(await page.evaluate(() => window.__xt.getState().time), paused, 'pause 后时间仍推进');
  const resumed = await page.evaluate(() => window.__xt.clock.resume());
  await page.waitForTimeout(60);
  const later = await page.evaluate(() => window.__xt.getState().time);
  check(Number.isFinite(resumed) && later > resumed, 'resume 未恢复时间推进');
  const frozen = await page.evaluate(() => window.__xt.clock.pause());
  const boundary = await page.evaluate(() => new Date(2026, 9, 10, 4, 59, 30).getTime());
  equal(await page.evaluate(now => window.__xt.clock.setNow(now), boundary), boundary, 'setNow 返回时间不准确');
  equal(await page.evaluate(() => window.__xt.clock.advance(1)), boundary + 1, 'advance 返回时间不准确');
  check(frozen >= later, '第二次 pause 导致时钟倒退');
  await page.evaluate(now => window.__xt.clock.setNow(now), boundary);

  const fixture = { ...initial.save, level: 30, exp: 0, hp: 0, mp: 0, job: '', inventory: {}, quests: {},
    equip: {}, skills: {}, skillGifted: {}, hotbar: Array(8).fill(null), completedTrials: [],
    classVersion: 0, classRewardClaims: [], sectRank: null, sectContribution: 0,
    sectGrowthState: { donationBatches: {}, settledTransactions: {} }, flags: {},
    dailyQuestResetDay: '', dailyQuestCompletions: {}, sectDailyContributionDay: '', sectDailyContributionClaims: [],
    age: 16, ageUpdatedAt: boundary, seclusionDay: '', seclusionYearsToday: 0, seclusionHistory: [],
    skillCooldowns: {}, gatherRespawnAt: {}, buffs: [], unstableUntil: 0,
    position: { mapId: 'luoxia_town', x: 320, y: 400 } };
  for (const cls of classes) {
    const joined = await page.evaluate(async ({ fixture, cls }) => {
      await window.__xt.loadSave(fixture); window.__xt.joinSect(cls.sect);
      return { state: window.__xt.getState(), saved: JSON.parse(localStorage.getItem('xiantu_save_v1')) };
    }, { fixture, cls });
    equal(joined.state.sect, cls.sect, `joinSect(${cls.sect}) 未入宗`);
    equal(joined.saved.job, cls.id, `joinSect(${cls.sect}) 未调用正式职业 API/存档`);
    equal(joined.state.rank, 'outer_disciple', `joinSect(${cls.sect}) 未初始化职位`);
  }
  await page.evaluate(async fixture => { await window.__xt.loadSave(fixture); window.__xt.joinSect('taixu'); }, fixture);
  const ranked = await page.evaluate(() => {
    window.__xt.setRank('inner_disciple');
    window.__xt.setFlag('sect_ranks.enabled', true);
    window.__xt.setFlag('sect_donations.enabled', true);
    window.__xt.giveItem('spirit_herb', 4);
    return { state: window.__xt.getState(), save: window.__xt.exportSave(), stored: JSON.parse(localStorage.getItem('xiantu_save_v1')) };
  });
  equal(ranked.state.rank, 'inner_disciple', 'setRank 未设置职位');
  equal(ranked.stored.sectRank, 'inner_disciple', 'setRank 未存档');
  equal(ranked.state.flags['sect_ranks.enabled'], true, 'setFlag 未改变配置开关');
  equal(ranked.save.flags, ranked.state.flags, '开关未进入导出存档');
  equal(ranked.stored.flags, ranked.state.flags, 'setFlag 未存档');
  equal(ranked.state.inventory.spirit_herb, 4, 'giveItem 数量错误');
  equal(ranked.stored.inventory.spirit_herb, 4, 'giveItem 未存档');

  const gates = await page.evaluate(() => {
    const s = window.__scene;
    window.__xt.setFlag('sect_ranks.enabled', false);
    const rankClosed = s.sectGrowth.promotion('taixu_elder');
    window.__xt.setFlag('sect_ranks.enabled', true);
    const rankOpen = s.sectGrowth.promotion('taixu_elder');
    // 策划表的每条上交 offer 仍独立关闭；只为验配置总开关注入启用的 offer 副本。
    const config = s.sectGrowth.config;
    const service = new s.sectGrowth.constructor(s.prog, { ...config, donations: { ...config.donations,
      offers: config.donations.offers.map(offer => ({ ...offer, enabled: true })) } });
    window.__xt.setFlag('sect_donations.enabled', false);
    const donationClosed = service.donations('taixu_envoy');
    window.__xt.setFlag('sect_donations.enabled', true);
    const donationOpen = service.donations('taixu_envoy');
    return { rankClosed, rankOpen, donationClosed, donationOpen };
  });
  equal(gates.rankClosed.key, 'sect.ui.config_pending', '职位配置关闭仍开放晋升');
  equal(gates.rankOpen.key, 'sect.ui.requirements_unmet', '职位配置开启未进入正式门槛检查');
  equal(gates.donationClosed.key, 'sect.ui.config_pending', '上交配置关闭仍开放上交');
  equal(gates.donationOpen.ok, true, '上交总开关开启未传递给正式消费者');
  check(gates.donationOpen.entries.length > 0, '上交总开关开启仍无已启用的 offer');

  const invalid = await page.evaluate(async () => {
    const xt = window.__xt, before = xt.getState();
    const storedBefore = localStorage.getItem('xiantu_save_v1');
    const cases = {
      loadNull: () => xt.loadSave(null), loadArray: () => xt.loadSave([]),
      invalidLevel: () => xt.loadSave({ level: 'oops' }),
      negativeInventory: () => xt.loadSave({ inventory: { spirit_herb: -4 } }),
      prototypeQuest: () => xt.loadSave({ quests: { constructor: { state: 'done', kills: {} } } }),
      unknownSect: () => xt.joinSect('missing_sect'), unknownRank: () => xt.setRank('missing_rank'),
      unknownMap: () => xt.teleport('missing_map'), invalidCoordinate: () => xt.teleport('luoxia_town', NaN),
      unknownItem: () => xt.giveItem('missing_item', 1), zeroItem: () => xt.giveItem('spirit_herb', 0),
      fractionalItem: () => xt.giveItem('spirit_herb', 1.5),
      unknownAccept: () => xt.acceptQuest('missing_quest'), unknownComplete: () => xt.completeQuest('missing_quest'),
      unsafeFlag: () => xt.setFlag('__proto__', true), nonBooleanFlag: () => xt.setFlag('sect_ranks.enabled', 1),
      negativeAdvance: () => xt.clock.advance(-1), infiniteAdvance: () => xt.clock.advance(Infinity),
      invalidNow: () => xt.clock.setNow(NaN), invalidSeed: () => xt.seed(NaN),
      invalidListener: () => xt.events.on('scene', null),
    };
    const rejected = {};
    for (const [name, run] of Object.entries(cases)) {
      try { rejected[name] = await run() === false; } catch { rejected[name] = true; }
    }
    const after = xt.getState();
    return { rejected, before, after, storedBefore, storedAfter: localStorage.getItem('xiantu_save_v1') };
  });
  for (const [name, rejected] of Object.entries(invalid.rejected)) check(rejected, `${name} 非法参数未被拒绝`);
  for (const key of ['mapId', 'level', 'inventory', 'quests', 'sect', 'rank', 'flags', 'time']) {
    equal(invalid.after[key], invalid.before[key], `${key} 被非法参数修改`);
  }
  equal(invalid.storedAfter, invalid.storedBefore, '非法参数改变了 localStorage 存档');

  const failedSave = await page.evaluate(async () => {
    const xt = window.__xt, before = xt.getState(), candidate = xt.exportSave();
    const storedBefore = localStorage.getItem('xiantu_save_v1');
    candidate.inventory.spirit_herb = 99;
    const descriptor = Object.getOwnPropertyDescriptor(Storage.prototype, 'setItem');
    let rejected = false;
    try {
      Object.defineProperty(Storage.prototype, 'setItem', { ...descriptor, value() { throw new Error('xt expected storage failure'); } });
      try { await xt.loadSave(candidate); } catch { rejected = true; }
    } finally { Object.defineProperty(Storage.prototype, 'setItem', descriptor); }
    return { rejected, before, after: xt.getState(), storedBefore, storedAfter: localStorage.getItem('xiantu_save_v1') };
  });
  check(failedSave.rejected, '存储失败的导入未报错');
  for (const key of ['level', 'inventory', 'quests', 'sect', 'rank', 'flags']) {
    equal(failedSave.after[key], failedSave.before[key], `导入保存失败没有回滚 ${key}`);
  }
  equal(failedSave.storedAfter, failedSave.storedBefore, '导入保存失败改变了磁盘存档');

  const unknownSaveFields = await page.evaluate(async () => {
    const xt = window.__xt, progress = window.__scene.prog, candidate = xt.exportSave();
    candidate.save = 'overwritten'; candidate.unregisteredField = 'ignored';
    await xt.loadSave(candidate);
    const exported = xt.exportSave();
    return { sameInstance: progress === window.__scene.prog, saveCallable: typeof window.__scene.prog.save === 'function',
      saveOverwritten: Object.hasOwn(exported, 'save'), unknownPersisted: Object.hasOwn(exported, 'unregisteredField') };
  });
  equal(unknownSaveFields, { sameInstance: true, saveCallable: true, saveOverwritten: false, unknownPersisted: false },
    '导入未保留 Progress 实例或未知字段覆盖了方法');

  const ordinary = await page.evaluate(({ awaken, bamboo }) => {
    const xt = window.__xt, before = xt.exportSave();
    xt.acceptQuest(awaken.id); const accepted = xt.getState().quests[awaken.id];
    xt.completeQuest(awaken.id); xt.acceptQuest(bamboo.id); xt.completeQuest(bamboo.id);
    return { before, accepted, after: xt.exportSave(), events: xt.events.drain() };
  }, { awaken, bamboo });
  equal(ordinary.accepted.state, 'active', '非日常任务 acceptQuest 未调用正式接取路径');
  equal(ordinary.after.quests[awaken.id].reached, true, '非日常 reach 没有经过 QuestSystem.onReach');
  equal(ordinary.after.quests[bamboo.id].state, 'done', '非日常 kill/collect 任务未完成');
  for (const objective of bamboo.objectives.filter(objective => objective.type === 'kill')) {
    equal(ordinary.after.quests[bamboo.id].kills[objective.target], objective.count, '非日常 kill 没有使用 QuestSystem.onKill');
  }
  equal(ordinary.after.stones - ordinary.before.stones, awaken.rewards.spiritStone + bamboo.rewards.spiritStone,
    '非日常 giveRewards 灵石奖励没有结算');
  check(ordinary.after.equip.weapon === 'wood_sword' || ordinary.after.inventory.wood_sword > 0, '非日常装备奖励没有经过 Progress');
  equal(ordinary.events.filter(event => event.type === 'quest:complete').length, 2, '非日常任务完成事件数量错误');

  // NPC 接取和交付调用同一 QuestSystem；同步验证事件订阅、取消与奖励不重复。
  const completed = await page.evaluate(daily => {
    window.__xtSeen = [];
    window.__xtQuestListener = event => window.__xtSeen.push(event);
    window.__xt.events.on('quest:complete', window.__xtQuestListener);
    window.__xt.acceptQuest(daily.id);
    const accepted = window.__xt.getState().quests[daily.id];
    const before = window.__xt.getState().contribution;
    window.__xt.completeQuest(daily.id);
    const state = window.__xt.getState(), stored = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    window.__xt.events.off('quest:complete', window.__xtQuestListener);
    return { accepted, state, before, stored, seen: window.__xtSeen.slice(), events: window.__xt.events.drain() };
  }, daily);
  equal(completed.accepted.state, 'active', 'acceptQuest 未接取任务');
  equal(completed.state.quests[daily.id].state, 'done', 'completeQuest 未交付任务');
  equal(completed.stored.quests[daily.id].state, 'done', 'completeQuest 未存档');
  equal(completed.state.contribution - completed.before, daily.rewards.sectContribution, '任务贡献奖励错误');
  equal(completed.state.inventory[collect.target] ?? 0, 4 - collect.count, '交付没有消费收集材料');
  equal(completed.seen.length, 1, 'on 订阅的完成事件数量错误');
  equal(completed.seen[0].type, 'quest:complete', '任务完成订阅类型错误');
  check(completed.events.some(event => event.type === 'quest:complete'), '任务完成未进入 drain');
  const duplicate = await page.evaluate(id => {
    let rejected = false;
    try { const result = window.__xt.completeQuest(id); rejected = result === false; } catch { rejected = true; }
    return { rejected, contribution: window.__xt.getState().contribution };
  }, daily.id);
  check(duplicate.rejected, '已完成任务被重复交付');
  equal(duplicate.contribution, completed.state.contribution, '重复交付再次获得贡献');
  await page.evaluate(() => window.__xt.clock.advance(30000));
  const reset = await page.evaluate(id => ({ state: window.__xt.getState(), stored: JSON.parse(localStorage.getItem('xiantu_save_v1')),
    available: window.__scene.quests.available(id) }), daily.id);
  equal(reset.state.quests[daily.id] ?? null, null, '跨本地 05:00 未重置日常');
  equal(reset.stored.quests[daily.id] ?? null, null, '跨日重置未存档');
  equal(reset.available, true, '跨日后日常不可重新接取');
  equal(reset.state.contribution, completed.state.contribution, '重置日常错误清空贡献');
  await page.evaluate(id => { window.__xt.giveItem('spirit_herb', 3); window.__xt.acceptQuest(id); window.__xt.completeQuest(id); }, daily.id);
  equal(await page.evaluate(() => window.__xtSeen.length), 1, 'off 后仍收到完成事件');

  // 导出的对象是独立快照；读档保留位置、物品、任务、宗门、职位与配置。
  const travel = await page.evaluate(async () => {
    window.__xtSceneSeen = [];
    window.__xtSceneListener = event => window.__xtSceneSeen.push(event);
    window.__xt.events.on('scene', window.__xtSceneListener);
    await window.__xt.teleport('qingyun_village', 352, 480);
    const state = window.__xt.getState(), save = window.__xt.exportSave();
    window.__xt.events.off('scene', window.__xtSceneListener);
    return { state, save, seen: window.__xtSceneSeen.slice() };
  });
  equal(travel.state.mapId, 'qingyun_village', 'teleport 未切图');
  equal([travel.state.x, travel.state.y], [352, 480], 'teleport 没有使用指定坐标');
  equal(travel.save.position, { mapId: 'qingyun_village', x: 352, y: 480 }, 'exportSave 缺位置');
  equal(travel.seen.length, 1, '场景切换订阅没有恰好收到一次事件');
  const roundtrip = await page.evaluate(async save => {
    await window.__xt.loadSave(save);
    const state = window.__xt.getState(), exported = window.__xt.exportSave();
    const detached = window.__xt.exportSave(); detached.inventory.spirit_herb = 9999;
    return { state, exported, detachedAffectedState: window.__xt.getState().inventory.spirit_herb === 9999 };
  }, travel.save);
  for (const key of ['mapId', 'x', 'y', 'level', 'realm', 'inventory', 'quests', 'sect', 'rank', 'contribution', 'flags']) {
    equal(roundtrip.state[key], travel.state[key], `loadSave/exportSave 往返丢失 ${key}`);
  }
  equal(roundtrip.detachedAffectedState, false, 'exportSave 暴露可直接改写的内部状态');
  const defaultPosition = await page.evaluate(async () => { await window.__xt.teleport('luoxia_town'); return window.__xt.getState(); });
  equal(defaultPosition.mapId, 'luoxia_town', 'teleport 可选坐标入口失败');
  check(Number.isFinite(defaultPosition.x) && Number.isFinite(defaultPosition.y), 'teleport 默认出生点非法');
  const singleAxis = await page.evaluate(async () => {
    await window.__xt.teleport('luoxia_town', 352);
    const xOnly = window.__xt.getState();
    await window.__xt.teleport('luoxia_town', undefined, 480);
    return { xOnly, yOnly: window.__xt.getState() };
  });
  equal([singleAxis.xOnly.x, singleAxis.xOnly.y], [352, defaultPosition.y], 'teleport x-only 未保留指定 X / 默认出生 Y');
  equal([singleAxis.yOnly.x, singleAxis.yOnly.y], [defaultPosition.x, 480], 'teleport y-only 未保留默认出生 X / 指定 Y');

  // 固定种子同时验证 Math.random 和真实 Phaser Tilemap 的 RND 消费者。
  const seeded = await page.evaluate(() => {
    const sample = seed => {
      window.__xt.seed(seed);
      const random = Array.from({ length: 12 }, () => Math.random());
      const map = window.__scene.make.tilemap({ data: [Array(24).fill(0)], tileWidth: 1, tileHeight: 1 });
      map.weightedRandomize([{ index: [1, 2], weight: 1 }, { index: [3, 4], weight: 2 }], 0, 0, 24, 1, 0);
      const phaser = map.layers[0].data[0].map(tile => tile.index); map.destroy();
      return { random, phaser };
    };
    return { first: sample(12345), second: sample(12345), other: sample(98765) };
  });
  equal(seeded.first, seeded.second, 'seed 相同种子未复现 Math.random / Phaser.Math.RND');
  check(JSON.stringify(seeded.first.random) !== JSON.stringify(seeded.other.random), 'Math.random 不随种子改变');
  check(JSON.stringify(seeded.first.phaser) !== JSON.stringify(seeded.other.phaser), 'Phaser.Math.RND 不随种子改变');

  // 持久技能冷却走真实 SkillCombat，在换图后仍挡住施法，推进后允许施法。
  const now = await page.evaluate(() => window.__xt.getState().time);
  const cooldownFixture = { ...roundtrip.exported, mp: 0, skillCooldowns: { water_mirror: { readyAt: now + 30000, total: 30000 } },
    skills: { water_mirror: 1 }, hotbar: ['water_mirror', null, null, null, null, null, null, null] };
  const cooldown = await page.evaluate(async fixture => {
    await window.__xt.loadSave(fixture); await window.__xt.teleport('luoxia_town');
    const scene = window.__scene, before = scene.prog.mp;
    scene.combat.tryCast(0);
    return { before, after: scene.prog.mp, readyAt: scene.combat.cds.get('water_mirror')?.readyAt,
      stored: window.__xt.exportSave().skillCooldowns.water_mirror?.readyAt };
  }, cooldownFixture);
  equal(cooldown.after, cooldown.before, '持久冷却到期前仍施法扣 MP');
  equal(cooldown.readyAt, now + 30000, '切图没有恢复持久技能冷却');
  equal(cooldown.stored, now + 30000, '持久冷却未进入导出存档');
  const cast = await page.evaluate(() => {
    window.__xt.clock.advance(30001);
    const scene = window.__scene, before = scene.prog.mp; scene.combat.tryCast(0);
    return { before, after: scene.prog.mp, readyAt: window.__xt.exportSave().skillCooldowns.water_mirror?.readyAt,
      now: window.__xt.getState().time };
  });
  check(cast.after < cast.before && cast.readyAt > cast.now, 'advance 未让既有技能冷却到期并重新开始');

  // 闭关通过既有场景入口结算；现实日上限仍按午夜重置，历史时间取受控时钟。
  const midnight = await page.evaluate(() => new Date(2026, 9, 11, 0).getTime());
  const seclusionFixture = { ...cooldownFixture, level: 30, exp: 0, sectContribution: 10000, age: 16,
    seclusionDay: '', seclusionYearsToday: 0, seclusionHistory: [], ageUpdatedAt: midnight - 1000,
    skillCooldowns: {}, buffs: [] };
  await page.evaluate(now => window.__xt.clock.setNow(now), midnight - 1000);
  const secluded = await page.evaluate(async ({ fixture, pacing }) => {
    await window.__xt.loadSave(fixture);
    const object = { props: { mode: 'sect', reqRealm: 'foundation' } };
    const years = Math.max(...pacing.options), count = pacing.maxYearsPerRealDay / years;
    for (let i = 0; i < count; i++) window.__scene.completeSeclusion(object, years);
    const before = window.__xt.exportSave();
    window.__scene.completeSeclusion(object, years);
    const blocked = window.__xt.exportSave();
    window.__xt.clock.advance(1000);
    window.__scene.completeSeclusion(object, years);
    return { before, blocked, next: window.__xt.exportSave(), years, count };
  }, { fixture: seclusionFixture, pacing });
  equal(secluded.before.seclusionYearsToday, pacing.maxYearsPerRealDay, '闭关累计日额度错误');
  equal(secluded.blocked.seclusionHistory.length, secluded.before.seclusionHistory.length, '午夜前闭关超额仍可结算');
  equal(secluded.blocked.sectContribution, secluded.before.sectContribution, '超额闭关仍扣贡献');
  equal(secluded.next.seclusionYearsToday, secluded.years, '午夜后闭关日额度未重置');
  equal(secluded.next.seclusionHistory.at(-1).at, midnight, '闭关历史未使用受控时间');

  // 错误由真实 console / 浏览器异常入口产生，on/off 与 drain 覆盖全部事件类型。
  await page.evaluate(() => {
    window.__xt.events.drain(); window.__xtAllSeen = [];
    window.__xtAllListener = event => window.__xtAllSeen.push(event);
    window.__xt.events.on('*', window.__xtAllListener);
    console.error('xt expected console error');
    setTimeout(() => { throw new Error('xt expected uncaught exception'); }, 0);
    Promise.reject(new Error('xt expected unhandled rejection'));
  });
  await page.waitForFunction(() => ['console.error', 'error', 'unhandledrejection'].every(type => window.__xtAllSeen.some(event => event.type === type)));
  const errors = await page.evaluate(() => {
    window.__xt.events.off('*', window.__xtAllListener);
    const events = window.__xt.events.drain(), seen = window.__xtAllSeen.slice();
    console.error('xt expected after off');
    return { events, seen, countAfterOff: window.__xtAllSeen.length };
  });
  for (const type of ['console.error', 'error', 'unhandledrejection']) {
    check(errors.events.some(event => event.type === type), `${type} 未进入事件队列`);
    check(errors.seen.some(event => event.type === type), `通配订阅未收到 ${type}`);
  }
  equal(errors.countAfterOff, errors.seen.length, 'off 通配订阅失败');
  equal(browserErrors.filter(message => !message.startsWith('xt expected ')), [], '测试出现非预期未捕获异常');
  console.log(JSON.stringify({ passed: true, assertions, port, methods: 'all', sects: classes.length,
    initialPreloadLoaderror: true, invalidPngLoaderror: true, singleAxisTeleport: true,
    saveRoundtrip: true, dailyReset: true, persistentCooldown: true,
    seclusionMidnight: true, randomChannels: ['Math.random', 'Phaser.Math.RND'],
    eventTypes: ['loaderror', 'console.error', 'error', 'unhandledrejection', 'scene', 'quest:complete'] }));
} catch (error) {
  console.error(JSON.stringify({ passed: false, assertions, failure: error.message, browserErrors, blockedImage, malformedImage, initialEventTypes }));
  process.exitCode = 1;
} finally {
  if (browser) await browser.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
