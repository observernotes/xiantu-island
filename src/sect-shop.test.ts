import rawDonations from '@xt/balance/sect_donations.json';
import rawShops from '@xt/balance/shops.json';
import { CLASS_LIST } from './classes';
import { dailyQuestDay } from './DailyQuests';
import { QUESTS, type SectShopGood } from './data';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { SectGrowth, SECT_GROWTH_CONFIG, type SectGrowthConfig } from './SectGrowth';
import { featureFlags, setFeatureFlag } from './features';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
function clone<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T; }

// 固定运行端本地时钟，替换 Storage 并最终恢复，所有成功/失败写盘都只落内存。
const start = new Date(2026, 9, 10, 12).getTime();
const beforeFive = new Date(2026, 9, 11, 4, 59, 59, 999).getTime();
const nextFive = new Date(2026, 9, 11, 5).getTime();
let now = start, failStorage = false, writes = 0;
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFeatures = featureFlags();
const serviceFeatures = ['sectRanks', 'sectShopLibrary', 'shops', 'sectDonations'] as const;
Date.now = () => now;
const disk: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage) throw new Error('宗门商店自测：模拟存储失败');
    writes++; disk[key] = String(value);
  },
  removeItem: (key: string) => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: (index: number) => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
} satisfies Storage });
const saveKey = 'xiantu_save_v1', outer = 'outer_disciple', inner = 'inner_disciple';
function fixture() {
  const config = clone(SECT_GROWTH_CONFIG) as SectGrowthConfig;
  config.ranks.enabled = true; config.donations.enabled = true;
  for (const offer of config.donations.offers) offer.enabled = true;
  return config;
}
function joined(sectId = 'tianjian') {
  const p = new Progress(); p.level = 30;
  const cls = CLASS_LIST.find(row => row.sect === sectId);
  ok(cls, `${sectId} 职业存在`);
  // 已交付的拜宗事实用于既有成员回归，不受四宗新入口开关限制。
  p.quests[cls.joinQuest] = { state: 'done', kills: {} };
  ok(p.advanceClass(cls.id), `${sectId} 正式拜宗`);
  p.resetDailyQuests(now);
  return p;
}
function offer(config: SectGrowthConfig, sectId = 'tianjian') {
  const value = config.donations.offers.find(row => row.sect === sectId);
  ok(value, `${sectId} 上交夹具存在`);
  // 本夹具的已落表数值均为 number；非法/null 分支另外通过注入验证。
  return value as typeof value & { count: number; dailyLimit: number; rewards: { sectContribution: number } };
}
function shop(config: SectGrowthConfig, sectId = 'tianjian') {
  const sect = config.ranks.sects.find(row => row.id === sectId);
  ok(sect, `${sectId} 货架夹具存在`);
  config.shops[sect.stewardNpc] = [
    'qi_pill',
    { item: 'hp_pill_small', reqRank: outer, costContribution: 20, enabled: true },
    { item: 'clear_mind_pill', reqRank: inner, costContribution: 30, enabled: true, balanceTodo: [] },
    { item: 'talisman_paper', reqRank: outer, costContribution: 1, enabled: false },
  ];
  return sect.stewardNpc;
}
function state(p: Progress) {
  return clone({ inventory: p.inventory, equip: p.equip, skills: p.skills, rank: p.sectRank,
    contribution: p.sectContribution, stones: p.stones, growth: p.sectGrowthState,
    quests: p.quests, daily: p.dailyQuestCompletions, claims: p.sectDailyContributionClaims,
    dailyDay: p.dailyQuestResetDay, contributionDay: p.sectDailyContributionDay });
}
function rejected(action: () => { ok: boolean; key: string }, p: Progress, message: string, key?: string) {
  const before = state(p), diskBefore = disk[saveKey], writesBefore = writes;
  const result = action();
  eq(result.ok, false, message);
  if (key) eq(result.key, key, `${message} 明确提示原因`);
  same(state(p), before, `${message} 不改变背包/余额/批数/收据/日常`);
  eq(disk[saveKey], diskBefore, `${message} 不改磁盘`);
  eq(writes, writesBefore, `${message} 不保存部分事务`);
}
function donate(growth: SectGrowth, row: ReturnType<typeof offer>, id: string, day = dailyQuestDay(now)) {
  return growth.donate(row.npc, row.id, id, day, now);
}

try {
  // 注入业务夹具对应的会话开关；发版关闭入口另由 test:classes/test:features 覆盖。
  for (const name of serviceFeatures) setFeatureFlag(name, true);
  // 真实配置保持禁用；测试仅克隆打开，不改快照与共享 JSON。
  same(SECT_GROWTH_CONFIG.donations, rawDonations, '上交从唯一共享表读取');
  same(SECT_GROWTH_CONFIG.shops, rawShops, '两种货品均完整读取');
  eq(rawDonations.enabled, false, '真实上交总开关关闭');
  eq(rawDonations.offers.length, 5, '真实上交五宗各一条');
  const actualGoods = Object.values(rawShops).flat().filter(entry => typeof entry !== 'string');
  eq(actualGoods.length, 16, '真实宗门货架含 16 个对象');
  ok(actualGoods.every(entry => entry.enabled === false), '真实宗门商品全部关闭');
  for (const row of rawDonations.offers) {
    eq(row.enabled, false, `${row.id} 条目保持关闭`);
    const p = joined(row.sect), growth = new SectGrowth(p);
    eq(growth.donations(row.npc, now).ok, false, `${row.sect} 默认不开放上交`);
    eq(growth.services(row.npc).find(service => service.type === 'sect_donation')?.allowed, false, `${row.sect} 上交服务注册不等于可扣料`);
  }

  // 普通 NPC 只消费字符串，单件付灵石；注入贡献对象不改变普通分流。
  {
    const config = fixture(), p = new Progress(), npc = 'doctor_sun';
    config.shops[npc].push({ item: 'clear_mind_pill', reqRank: outer, costContribution: 1, enabled: true });
    const growth = new SectGrowth(p, config), item = 'hp_pill_small', price = config.items[item].price!;
    p.stones = price * 3; p.sectContribution = 100; p.save();
    same(growth.ordinaryCatalog(npc).entries.map(entry => entry.itemId), ['hp_pill_small', 'qi_pill'], '普通货架保留旧字符串次序且过滤对象');
    rejected(() => growth.buyOrdinary(npc, 'clear_mind_pill', 'ordinary-object'), p, '普通入口不能把贡献对象当灵石商品');
    rejected(() => growth.buyOrdinary('tianjian_envoy_sect', item, 'ordinary-steward'), p, '非普通商店 NPC 不售字符串');
    const writesBefore = writes;
    ok(growth.buyOrdinary(npc, item, 'ordinary-one').ok, '未入宗普通商品照常购买');
    eq(p.count(item), 1, '普通买货交付一件');
    eq(p.stones, price * 2, '普通字符串按 items.price 扣灵石');
    eq(p.sectContribution, 100, '普通字符串不扣贡献');
    eq(writes - writesBefore, 1, '普通扣款交货与收据一次保存');
    const after = state(p), writesAfter = writes;
    eq(growth.buyOrdinary(npc, item, 'ordinary-one').repeated, true, '普通同确认重复命中收据');
    same(state(p), after, '普通同确认不重复扣款交货');
    eq(writes, writesAfter, '普通同确认重试不重写');
    const loaded = Progress.load(), loadedGrowth = new SectGrowth(loaded, config);
    eq(loadedGrowth.buyOrdinary(npc, item, 'ordinary-one').repeated, true, '普通读档重试保留收据');
    eq(loaded.count(item), 1, '普通读档不多发货');
    eq(loaded.stones, price * 2, '普通读档不多扣灵石');
    p.stones = price - 1;
    rejected(() => growth.buyOrdinary(npc, item, 'ordinary-short'), p, '普通灵石差 1 拒绝');
    p.stones = price;
    ok(growth.buyOrdinary(npc, item, 'ordinary-exact').ok, '普通恰好售价可购买');
    eq(p.stones, 0, '普通恰价余额归零');
    p.stones = price * 2; p.save(); failStorage = true;
    try { rejected(() => growth.buyOrdinary(npc, item, 'ordinary-failure'), p, '普通存储失败回滚', 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    ok(growth.buyOrdinary(npc, item, 'ordinary-failure').ok, '普通失败同确认可重试');
  }
  for (const price of [null, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const config = fixture(), p = new Progress(); p.stones = 1000;
    Object.assign(config.items.hp_pill_small, { price });
    rejected(() => new SectGrowth(p, config).buyOrdinary('doctor_sun', 'hp_pill_small', `ordinary-price-${String(price)}`), p, `普通非法价格 ${String(price)} 不买货`);
  }

  // G15 四字段对象不强制 balanceTodo，禁用不展示，高职位累加低货架。
  for (const sect of rawDonations.offers.map(row => row.sect)) {
    const config = fixture(), npc = shop(config, sect), p = joined(sect); p.sectContribution = 100; p.stones = 1000;
    const growth = new SectGrowth(p, config), entries = growth.catalog(npc, 'sect_shop').entries;
    same(entries.map(entry => entry.itemId), ['hp_pill_small', 'clear_mind_pill'], `${sect} 字符串/禁用不进入贡献目录`);
    eq(entries[0].ok, true, `${sect} 四字段合法对象可买`);
    eq(entries[1].key, 'sect.ui.locked_rank', `${sect} reqRank 不足显示职位提示`);
    rejected(() => growth.exchange(npc, 'sect_shop', 'clear_mind_pill', `locked-${sect}`), p, `${sect} 确认复检职位`, 'sect.ui.locked_rank');
    rejected(() => growth.exchange(npc, 'sect_shop', 'talisman_paper', `disabled-${sect}`), p, `${sect} disabled 直接交易仍拒绝`);
    rejected(() => growth.exchange(npc, 'sect_shop', 'qi_pill', `string-${sect}`), p, `${sect} 字符串不能回退为贡献货品`);
    const writesBefore = writes;
    ok(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `object-${sect}`).ok, `${sect} 四字段贡献兑换成功`);
    eq(p.sectContribution, 80, `${sect} 对象只扣贡献`);
    eq(p.stones, 1000, `${sect} 对象不叠加物品灵石价`);
    eq(writes - writesBefore, 1, `${sect} 贡献商店事务一次保存`);
    const after = state(p);
    eq(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `object-${sect}`).repeated, true, `${sect} 同确认命中收据`);
    same(state(p), after, `${sect} 不重复交货扣款`);
    p.sectRank = inner;
    ok(growth.exchange(npc, 'sect_shop', 'clear_mind_pill', `inner-${sect}`).ok, `${sect} 内门开放高档商品`);
    ok(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `inherited-${sect}`).ok, `${sect} 内门继承外门货架`);
    eq(p.sectRank, inner, `${sect} 消费不降职`);
  }
  const badGoods: [string, Record<string, unknown>][] = [
    ['null 价格', { costContribution: null }], ['负价格', { costContribution: -1 }],
    ['小数价格', { costContribution: 0.5 }], ['不安全价格', { costContribution: Number.MAX_SAFE_INTEGER + 1 }],
    ['无穷价格', { costContribution: Infinity }], ['未知职位', { reqRank: 'unknown' }],
    ['有待填字段', { balanceTodo: ['costContribution'] }], ['非法待填字段', { balanceTodo: 'costContribution' }],
    ['null 待填字段', { balanceTodo: null }], ['未知物品', { item: 'unknown' }],
  ];
  for (const [name, changes] of badGoods) {
    const config = fixture(), npc = shop(config), p = joined(); p.stones = 999; p.sectContribution = 100;
    Object.assign(config.shops[npc][1] as SectShopGood, changes);
    rejected(() => new SectGrowth(p, config).exchange(npc, 'sect_shop', 'hp_pill_small', `bad-${name}`), p, `${name} 不回退灵石买货`);
  }

  // 五宗严格按唯一 offer 的整批数值交换贡献；配额与收据一并写盘。
  for (const sect of rawDonations.offers.map(row => row.sect)) {
    const config = fixture(), row = offer(config, sect), p = joined(sect); p.addItem(row.item, row.count * 4); p.sectContribution = 7; p.stones = 88; p.save();
    const growth = new SectGrowth(p, config), preview = growth.donations(row.npc, now);
    ok(preview.ok, `${sect} 开启双开关才提供服务`);
    eq(preview.entries.length, 1, `${sect} 仅显示本宗白名单`);
    const entry = preview.entries[0];
    eq(entry.offerId, row.id, `${sect} 上交 id 原表读取`);
    eq(entry.itemId, row.item, `${sect} 材料 id 原表读取`);
    eq(entry.count, row.count, `${sect} 整批材料数原表读取`);
    eq(entry.contribution, row.rewards.sectContribution, `${sect} 每批贡献原表读取`);
    eq(entry.remaining, row.dailyLimit, `${sect} 今日初始配额`);
    eq(entry.day, dailyQuestDay(now), `${sect} 预览携带 05:00 日界`);
    eq(entry.rankName, growth.identity()!.name, `${sect} 职位使用中文显示名`);
    eq(entry.name, config.items[row.item].name, `${sect} 材料使用中文显示名`);
    const before = state(p), writesBefore = writes, id = `donate-${sect}`;
    ok(donate(growth, row, id, entry.day).ok, `${sect} 上交完整一批`);
    eq(p.count(row.item), row.count * 3, `${sect} 每确认只扣一批`);
    eq(p.sectContribution, 7 + row.rewards.sectContribution, `${sect} 贡献只加配置奖励`);
    eq(p.stones, 88, `${sect} 上交不加灵石`);
    same(p.quests, before.quests, `${sect} 上交不完成任务`);
    same(p.dailyQuestCompletions, before.daily, `${sect} 上交不占日常条数`);
    same(p.sectDailyContributionClaims, before.claims, `${sect} 上交不写日常奖励收据`);
    eq(p.sectGrowthState.donationBatches?.[row.id], 1, `${sect} 当日批数加一`);
    eq(p.sectGrowthState.donationDay, entry.day, `${sect} 当日日界落档`);
    same(p.sectGrowthState.settledTransactions[id], { kind: 'donation', sect, sourceId: row.id, day: entry.day }, `${sect} 收据采用 offer id`);
    eq(writes - writesBefore, 1, `${sect} 扣料/贡献/配额/收据一次写盘`);
    const saved = JSON.parse(disk[saveKey]);
    same(saved.inventory, p.inventory, `${sect} 保存扣料与内存一致`);
    eq(saved.sectContribution, p.sectContribution, `${sect} 保存贡献与内存一致`);
    same(saved.sectGrowthState, p.sectGrowthState, `${sect} 保存批数与收据完整`);
    const after = state(p), writesAfter = writes;
    eq(donate(growth, row, id).repeated, true, `${sect} 同确认二次调用命中收据`);
    same(state(p), after, `${sect} 同确认不重复扣料奖励`);
    eq(writes, writesAfter, `${sect} 同确认重试不再保存`);
    const loaded = Progress.load(), loadedGrowth = new SectGrowth(loaded, config), loadedBefore = state(loaded);
    eq(donate(loadedGrowth, row, id).repeated, true, `${sect} 读档重试命中原收据`);
    same(state(loaded), loadedBefore, `${sect} 读档重试不改背包贡献批数`);
    ok(donate(growth, row, `${id}-second`).ok, `${sect} 独立确认可重复上交到限额`);
    eq(growth.donations(row.npc, now).entries[0].remaining, 0, `${sect} 满额后剩余零批`);
    rejected(() => donate(growth, row, `${id}-third`), p, `${sect} 第三批不扣料不奖励`);
  }

  // 准入/配置错误不能经直接 API 绕过，也不能当免费材料或无限额度。
  const badOffers: [string, (config: SectGrowthConfig) => void][] = [
    ['总开关关闭', config => { config.donations.enabled = false; }],
    ['条目开关关闭', config => { offer(config).enabled = false; }],
    ['职位总开关关闭', config => { config.ranks.enabled = false; }],
    ['材料数零', config => { offer(config).count = 0; }],
    ['材料数 null', config => { Object.assign(offer(config), { count: null }); }],
    ['材料数负数', config => { offer(config).count = -1; }],
    ['材料数小数', config => { offer(config).count = 0.5; }],
    ['材料数不安全', config => { offer(config).count = Number.MAX_SAFE_INTEGER + 1; }],
    ['奖励零', config => { offer(config).rewards.sectContribution = 0; }],
    ['奖励 null', config => { Object.assign(offer(config).rewards, { sectContribution: null }); }],
    ['奖励结构非法', config => { Object.assign(offer(config), { rewards: null }); }],
    ['奖励负数', config => { offer(config).rewards.sectContribution = -1; }],
    ['奖励小数', config => { offer(config).rewards.sectContribution = 0.5; }],
    ['奖励不安全', config => { offer(config).rewards.sectContribution = Number.MAX_SAFE_INTEGER + 1; }],
    ['配额零', config => { offer(config).dailyLimit = 0; }],
    ['配额 null', config => { Object.assign(offer(config), { dailyLimit: null }); }],
    ['配额小数', config => { offer(config).dailyLimit = 0.5; }],
    ['配额不安全', config => { offer(config).dailyLimit = Number.MAX_SAFE_INTEGER + 1; }],
    ['未清待填', config => { offer(config).balanceTodo = ['count']; }],
    ['非法待填', config => { Object.assign(offer(config), { balanceTodo: null }); }],
    ['未知职位', config => { offer(config).reqRank = 'unknown'; }],
    ['未来职位', config => { offer(config).reqRank = 'elder'; }],
    ['未知材料', config => { offer(config).item = 'unknown'; }],
    ['占位材料', config => { config.items[offer(config).item].placeholder = true; }],
    ['材料禁用', config => { config.items[offer(config).item].enabled = false; }],
    ['装备不能上交', config => { offer(config).item = 'wood_sword'; }],
    ['消耗品不能上交', config => { offer(config).item = 'hp_pill_small'; }],
    ['外宗登记', config => { offer(config).sect = 'taixu'; }],
    ['旧青云接引', config => { offer(config).npc = 'tianjian_envoy'; }],
    ['重复 offer id', config => { config.donations.offers.push(clone(offer(config))); }],
    ['贡献商品回流', config => { const row = offer(config); config.shops.doctor_sun.push({ item: row.item, reqRank: outer, costContribution: 1, enabled: false }); }],
    ['config 不在白名单', config => { config.npcs[offer(config).npc].services!.find(service => service.type === 'sect_donation')!.config = '../sect_donations'; }],
    ['NPC 服务异宗', config => { config.npcs[offer(config).npc].services!.find(service => service.type === 'sect_donation')!.sect = 'taixu'; }],
    ['NPC 未注册上交', config => { const npc = config.npcs[offer(config).npc]; npc.services = npc.services!.filter(service => service.type !== 'sect_donation'); }],
    ['重复 NPC 服务', config => { const npc = config.npcs[offer(config).npc]; npc.services!.push(clone(npc.services!.find(service => service.type === 'sect_donation')!)); }],
  ];
  for (const [name, change] of badOffers) {
    const config = fixture(), row = clone(offer(config)), p = joined(); p.addItem(row.item, row.count * 3); p.sectContribution = 100;
    change(config);
    rejected(() => donate(new SectGrowth(p, config), row, `invalid-${name}`), p, `${name} 拒绝上交`);
  }
  {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config); p.addItem(row.item, row.count * 3);
    for (const npc of ['taixu_envoy', 'tianjian_envoy', 'tianjian_elder', '__proto__']) {
      rejected(() => growth.donate(npc, row.id, `bad-npc-${npc}`, dailyQuestDay(now), now), p, `${npc} 不受理本宗上交`);
    }
    rejected(() => growth.donate(row.npc, 'unknown', 'unknown-offer', dailyQuestDay(now), now), p, '未知白名单 id 不上交');
    p.equip.weapon = row.item;
    rejected(() => donate(growth, row, 'equipped-material'), p, '装备中的物品不能纳入上交材料');
    delete p.equip.weapon;
    const unjoined = new Progress(); unjoined.addItem(row.item, row.count);
    rejected(() => donate(new SectGrowth(unjoined, config), row, 'not-member'), unjoined, '未拜宗不办理上交');
    row.reqRank = inner;
    rejected(() => donate(growth, row, 'rank-short'), p, '上交职位不足提示', 'sect.ui.locked_rank');
    row.reqRank = outer; p.sectRank = null;
    rejected(() => donate(growth, row, 'invalid-rank'), p, '冲突职位不办理上交');
  }

  // 不够整批与确认后材料变化重新检查；临时试炼物同 id 也不能凑批。
  {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config);
    p.addItem(row.item, row.count - 1);
    rejected(() => donate(growth, row, 'partial'), p, '少一个材料拒绝整批上交');
    p.addTrialItem(row.item, row.count * 2);
    rejected(() => donate(growth, row, 'trial-only-short'), p, '临时材料不能补足永久一批');
    p.addItem(row.item, 1); p.save();
    ok(growth.donations(row.npc, now).entries[0].ok, '临时与永久混合但永久刚好够批可预览');
    ok(donate(growth, row, 'permanent-only').ok, '混合背包只扣永久完整一批');
    eq(p.count(row.item), row.count * 2, '上交保留全部临时数量');
    eq(JSON.parse(disk[saveKey]).inventory[row.item], 0, '临时数量不会进入永久存档');
    rejected(() => donate(growth, row, 'trial-only'), p, '仅临时材料不能再上交');
    p.removeTrialItem(row.item, row.count * 2);
    eq(p.count(row.item), 0, '临时材料仍能由原试炼接口完整清除');
    p.addItem(row.item, row.count);
    const preview = growth.donations(row.npc, now).entries[0];
    p.removeItem(row.item, 1);
    rejected(() => donate(growth, row, 'stale-material', preview.day), p, '预览后材料不足确认重新检查');
    p.addItem(row.item, 1);
    const originalJob = p.job;
    p.job = CLASS_LIST.find(cls => cls.sect === 'taixu')!.id;
    rejected(() => donate(growth, row, 'stale-membership', preview.day), p, '预览后改宗确认重新检查本宗');
    p.job = originalJob; p.sectContribution = Number.MAX_SAFE_INTEGER;
    rejected(() => donate(growth, row, 'stale-contribution', preview.day), p, '预览后贡献变化导致奖励溢出时重新检查');
  }

  // 日常与上交独立扣料；同一份永久材料不能同时交给两个系统。
  for (const donationFirst of [true, false]) {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config);
    const quest = Object.values(QUESTS).find(q => q.daily && q.sect === p.sect && q.objectives.some(o => o.type === 'collect' && o.target === row.item));
    ok(quest, '真实本宗收集日常与上交材料存在重合');
    const questCount = quest.objectives.find(o => o.type === 'collect' && o.target === row.item)!.count!;
    const quests = new QuestSystem(p, () => now);
    ok(quests.accept(quest.id), '真实收集日常可接取');
    p.addItem(row.item, donationFirst ? row.count : questCount);
    if (donationFirst) {
      ok(donate(growth, row, 'donation-before-daily').ok, '先上交扣完整批');
      eq(quests.complete(quest.id), false, '上交已耗同份材料，日常不能完成');
      eq(quests.talk(quest.turnIn, quest.id).after, undefined, '日常不能重复交同份材料');
    } else {
      ok(quests.complete(quest.id), '先凑齐日常材料可完成目标');
      ok(quests.talk(quest.turnIn, quest.id).after?.(), '日常交付扣料并独立结算');
      rejected(() => donate(growth, row, 'daily-before-donation'), p, '日常已经扣料后不能凭同份材料上交');
    }
  }

  // 配额每 offer 独立；05:00 旧预览必须重确认，成功时只清当日批数。
  {
    const config = fixture(), row = offer(config), second = { ...clone(row), id: `${row.id}_second` };
    config.donations.offers.push(second);
    const p = joined(); p.addItem(row.item, row.count * 10); p.sectContribution = 100;
    const growth = new SectGrowth(p, config);
    ok(donate(growth, row, 'quota-first').ok, '第一白名单批次成功');
    rejected(() => donate(growth, second, 'quota-first'), p, '成功确认 id 不能改成第二白名单重复领');
    ok(donate(growth, second, 'quota-second').ok, '第二白名单有独立额度');
    eq(growth.donations(row.npc, now).entries.find(entry => entry.offerId === row.id)?.remaining, 1, '第一白名单独立减一批');
    eq(growth.donations(row.npc, now).entries.find(entry => entry.offerId === second.id)?.remaining, 1, '第二白名单独立减一批');
    now = beforeFive;
    const oldDay = growth.donations(row.npc, now).entries[0].day;
    eq(oldDay, dailyQuestDay(start), '次日 04:59 保留昨日配额');
    const before = state(p), receipts = clone(p.sectGrowthState.settledTransactions);
    now = nextFive;
    eq(growth.donations(row.npc, now).entries[0].remaining, row.dailyLimit, '05:00 预览刷新每日配额');
    same(state(p), before, '跨日预览本身不写永久事务状态');
    rejected(() => donate(growth, row, 'stale-day', oldDay), p, '跨日旧预览要求重新确认', 'sect.donation.day_changed');
    const beforeRepeat = state(p);
    eq(donate(growth, row, 'quota-first', oldDay).repeated, true, '跨日旧成功确认先去重');
    same(state(p), beforeRepeat, '跨日旧收据重试不扣料不奖励不重置状态');
    const material = p.count(row.item), contribution = p.sectContribution;
    ok(donate(growth, row, 'new-day').ok, '新预览确认可用新日额度');
    eq(p.count(row.item), material - row.count, '新日只扣本确认一批');
    eq(p.sectContribution, contribution + row.rewards.sectContribution, '跨日不重置已有贡献');
    same(p.sectGrowthState.donationBatches, { [row.id]: 1 }, '跨日只清旧日各 offer 批数');
    eq(p.sectGrowthState.donationDay, dailyQuestDay(now), '成功确认存新日日期');
    for (const [id, receipt] of Object.entries(receipts)) same(p.sectGrowthState.settledTransactions[id], receipt, '跨日保留历史成功收据');
    same(p.quests, before.quests, '跨日上交不重置或完成日常');
    const loaded = Progress.load(), loadedBefore = state(loaded);
    eq(donate(new SectGrowth(loaded, config), row, 'quota-first', oldDay).repeated, true, '跨日读档旧确认仍去重');
    same(state(loaded), loadedBefore, '跨日读档重试仍不重复奖励');
    now = start;
  }

  // 旧档只补缺失容器，历史成功收据及已有异常状态不能被迁移清空。
  {
    const config = fixture(), row = offer(config), p = joined(); p.addItem(row.item, row.count * 3);
    const receipt = { kind: 'donation', sect: p.sect, sourceId: row.id, day: dailyQuestDay(now) } as const;
    p.sectGrowthState = { donationDay: receipt.day, settledTransactions: { legacy: receipt } };
    p.save();
    const loaded = Progress.load(), growth = new SectGrowth(loaded, config), before = state(loaded);
    same(loaded.sectGrowthState.donationBatches, {}, '旧档仅缺每日容器时补空批数');
    same(loaded.sectGrowthState.settledTransactions.legacy, receipt, '补容器不清历史成功收据');
    eq(donate(growth, row, 'legacy').repeated, true, '迁移后旧成功确认仍去重');
    same(state(loaded), before, '迁移后的收据重试不重复扣料奖励');
  }
  for (const malformed of [
    { donationDay: dailyQuestDay(now), donationBatches: { donate_tianjian_iron: -1 }, settledTransactions: {} },
    { donationBatches: null, settledTransactions: {} },
    { donationBatches: {}, settledTransactions: null },
    { donationBatches: {}, settledTransactions: { legacy: { kind: 'donation', sect: 'tianjian', sourceId: '', day: dailyQuestDay(now) } } },
  ]) {
    const config = fixture(), row = offer(config), p = joined(); p.addItem(row.item, row.count);
    Object.assign(p, { sectGrowthState: clone(malformed) }); p.save();
    const loaded = Progress.load();
    same(loaded.sectGrowthState, malformed, '异常宗门业务状态读档保留原值');
    rejected(() => donate(new SectGrowth(loaded, config), row, 'malformed-state'), loaded, '异常业务状态暂停上交');
  }

  // 不安全数值与失败保存均原子拒绝；失败同确认允许修复后重试。
  for (const value of [-1, 0.5, Infinity, NaN, Number.MAX_SAFE_INTEGER + 1]) {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config);
    p.addItem(row.item, row.count); p.sectContribution = value;
    rejected(() => donate(growth, row, `unsafe-contribution-${String(value)}`), p, `贡献 ${String(value)} 不安全拒绝上交`);
    p.sectContribution = 0; p.inventory[row.item] = value;
    rejected(() => donate(growth, row, `unsafe-inventory-${String(value)}`), p, `材料 ${String(value)} 不安全拒绝上交`);
  }
  {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config); p.addItem(row.item, row.count * 2);
    p.sectContribution = Number.MAX_SAFE_INTEGER - row.rewards.sectContribution + 1;
    rejected(() => donate(growth, row, 'overflow'), p, '所得贡献会溢出安全整数时拒绝');
    p.sectContribution--;
    ok(donate(growth, row, 'safe-edge').ok, '所得贡献恰好安全整数上限可以提交');
    eq(p.sectContribution, Number.MAX_SAFE_INTEGER, '安全整数边界保存精确');
  }
  {
    const config = fixture(), row = offer(config), p = joined(), growth = new SectGrowth(p, config); p.addItem(row.item, row.count * 3); p.sectContribution = 9;
    p.addTrialItem(row.item, row.count * 2);
    p.sectGrowthState.donationDay = '2026-10-09';
    p.sectGrowthState.donationBatches = { [row.id]: 2 };
    p.sectGrowthState.settledTransactions.previous = { kind: 'shop', sect: p.sect, sourceId: 'old|item', day: '2026-10-09' };
    p.save();
    failStorage = true;
    try { rejected(() => donate(growth, row, 'save-retry'), p, '跨日保存失败回滚扣料/贡献/重置/收据', 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    eq(p.sectGrowthState.settledTransactions['save-retry'], undefined, '失败不记已结算确认');
    ok(donate(growth, row, 'save-retry').ok, '失败复用同确认可成功一次');
    const after = state(p);
    eq(donate(growth, row, 'save-retry').repeated, true, '重试成功后再次同确认只去重');
    same(state(p), after, '重复成功不会再次扣料奖励');
    const saved = JSON.parse(disk[saveKey]);
    same(saved.inventory, { ...p.inventory, [row.item]: p.count(row.item) - row.count * 2 }, '成功重试永久材料完整落盘且临时材料不存盘');
    eq(saved.sectContribution, p.sectContribution, '成功重试贡献完整落盘');
    same(saved.sectGrowthState, p.sectGrowthState, '成功重试日界/批数/收据完整落盘');
    p.removeTrialItem(row.item, row.count * 2);
    eq(p.count(row.item), row.count * 2, '失败与成功重试始终保留临时材料供原接口清除');
  }
  for (const id of ['', '__proto__', 'constructor', 'prototype']) {
    const config = fixture(), row = offer(config), p = joined(); p.addItem(row.item, row.count);
    rejected(() => donate(new SectGrowth(p, config), row, id), p, `非法事务 id ${id} 不结算`);
  }

  console.log(`sect-shop.test: ${assertions} 条断言通过（双货架/上交/原子事务，仅内存配置与存档）`);
} finally {
  for (const name of serviceFeatures) setFeatureFlag(name, originalFeatures[name]);
  failStorage = false; Date.now = originalNow;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
