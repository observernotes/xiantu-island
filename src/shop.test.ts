import rawShops from '@xt/balance/shops.json';
import strings from '@xt/balance/strings_zh.json';
import releaseFeatures from '../data/features.json';
import { CLASS_LIST } from './classes';
import { t, type SectShopGood } from './data';
import { Progress } from './Progress';
import { SectGrowth, SECT_GROWTH_CONFIG, type SectGrowthConfig } from './SectGrowth';
import { FEATURE_UNAVAILABLE, featureFlags, setFeatureFlag } from './features';

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

// 固定时间、会话开关和内存存档；不修改共享 balance 表或用户真实存档。
const now = new Date(2026, 9, 11, 12).getTime();
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFeatures = featureFlags();
const serviceFeatures = ['shops', 'sectRanks', 'sectShopLibrary', 'alchemyPhase1'] as const;
Date.now = () => now;
let failStorage = false, writes = 0;
const disk: Record<string, string> = {};
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage) throw new Error('商店自测：模拟存储失败');
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
  config.ranks.enabled = true;
  return config;
}
function joined(sectId = 'tianjian') {
  const p = new Progress(); p.level = 30;
  const cls = CLASS_LIST.find(row => row.sect === sectId);
  ok(cls, `${sectId} 职业存在`);
  p.quests[cls.joinQuest] = { state: 'done', kills: {} };
  ok(p.advanceClass(cls.id), `${sectId} 已完成拜宗`);
  return p;
}
function sectShelf(config: SectGrowthConfig, sectId = 'tianjian') {
  const sect = config.ranks.sects.find(row => row.id === sectId);
  ok(sect, `${sectId} 货架存在`);
  config.shops[sect.stewardNpc] = [
    'qi_pill',
    { item: 'hp_pill_small', reqRank: outer, costContribution: 8, enabled: true },
    { item: 'clear_mind_pill', reqRank: inner, costContribution: 30, enabled: true },
    { item: 'talisman_paper', reqRank: outer, costContribution: 1, enabled: false },
  ];
  return sect.stewardNpc;
}
function state(p: Progress) {
  return clone({ inventory: p.inventory, permanentInventory: p.exportSave().inventory, qualities: p.pillQualities,
    stones: p.stones, contribution: p.sectContribution, rank: p.sectRank,
    equip: p.equip, skills: p.skills, quests: p.quests, learnedRecipes: p.learnedRecipes, growth: p.sectGrowthState });
}
function rejected(action: () => { ok: boolean; key: string }, p: Progress, message: string, key?: string) {
  const before = state(p), diskBefore = disk[saveKey], writesBefore = writes;
  const result = action();
  eq(result.ok, false, message);
  if (key) eq(result.key, key, `${message} 返回原因`);
  same(state(p), before, `${message} 不改变物品/品质/余额/收据`);
  eq(disk[saveKey], diskBefore, `${message} 不改磁盘`);
  eq(writes, writesBefore, `${message} 不保存部分事务`);
}

try {
  eq(releaseFeatures.shops, false, '发版 shops 默认关闭');
  eq(originalFeatures.shops, false, '运行时 shops 默认关闭');
  same(SECT_GROWTH_CONFIG.shops, rawShops, '商店从唯一 shops.json 读取');
  for (const key of ['ui.shop.menu', 'ui.shop.confirm', 'ui.shop.complete'] as const) {
    ok(typeof strings[key] === 'string' && strings[key].length > 0, `${key} 表内存在`);
    eq(t(key), strings[key], `${key} 使用 strings_zh 表内文案`);
  }
  for (const name of serviceFeatures) setFeatureFlag(name, true);

  // 单一发版门禁约束普通买卖与宗门商店，存档 flags 不能越过门禁。
  {
    const config = fixture(), p = joined(), npc = sectShelf(config), growth = new SectGrowth(p, config);
    p.stones = 1000; p.sectContribution = 100; p.addItem('qi_pill', 3); p.flags.shops = true; p.save();
    setFeatureFlag('shops', false);
    eq(growth.ordinaryCatalog('doctor_sun').entries.length, 0, '关闭普通货架不展示');
    eq(growth.ordinarySellCatalog('doctor_sun').entries.length, 0, '关闭出售目录不展示');
    eq(growth.catalog(npc, 'sect_shop').entries.length, 0, '关闭宗门货架不展示');
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', 'closed-buy'), p, '直接买货不能绕过 shops', FEATURE_UNAVAILABLE);
    rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', 'closed-sell'), p, '直接售卖不能绕过 shops', FEATURE_UNAVAILABLE);
    rejected(() => growth.exchange(npc, 'sect_shop', 'hp_pill_small', 'closed-sect'), p, '直接贡献兑换不能绕过 shops', FEATURE_UNAVAILABLE);
    ok(growth.catalog('tianjian_elder', 'sect_library').key !== FEATURE_UNAVAILABLE, 'shops 不关闭藏经阁');
    setFeatureFlag('shops', true);
    ok(growth.ordinaryCatalog('doctor_sun').ok, '重开 shops 普通货架恢复');
    ok(growth.catalog(npc, 'sect_shop').ok, '重开 shops 宗门货架恢复');
    setFeatureFlag('sectShopLibrary', false);
    rejected(() => growth.exchange(npc, 'sect_shop', 'hp_pill_small', 'closed-sect-service'), p, '宗门服务开关仍需同时打开', FEATURE_UNAVAILABLE);
    ok(growth.ordinaryCatalog('doctor_sun').ok, '普通货架不依赖宗门服务开关');
    setFeatureFlag('sectShopLibrary', true);
  }

  // 普通商店仅买字符串；原售价与批量数量决定一次结算，买卖收据严格区分。
  for (const npc of ['grocer_wang', 'doctor_sun']) {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 10000; p.sectContribution = 100;
    const ids = config.shops[npc].filter((row): row is string => typeof row === 'string');
    same(growth.ordinaryCatalog(npc).entries.map(row => row.itemId), ids, `${npc} 字符串原顺序显示`);
    const item = ids[0], price = config.items[item].price!;
    p.stones = price * 3; p.save();
    const writesBefore = writes;
    eq(growth.buyOrdinary(npc, item, `buy-three-${npc}`, 3).key, 'ui.shop.complete', `${npc} 购买使用 complete 文案`);
    eq(p.count(item), 3, `${npc} 批量交货三件`);
    eq(p.stones, 0, `${npc} 恰好三件售价扣至零`);
    eq(p.sectContribution, 100, `${npc} 普通购买不扣贡献`);
    eq(writes - writesBefore, 1, `${npc} 货款/交货/收据一次保存`);
    const after = state(p), writesAfter = writes;
    eq(growth.buyOrdinary(npc, item, `buy-three-${npc}`, 3).repeated, true, `${npc} 同购买确认命中收据`);
    same(state(p), after, `${npc} 重试不重复扣货款或交货`);
    eq(writes, writesAfter, `${npc} 重试不重写磁盘`);
    const loaded = Progress.load(), loadedGrowth = new SectGrowth(loaded, config);
    eq(loadedGrowth.buyOrdinary(npc, item, `buy-three-${npc}`, 3).repeated, true, `${npc} 读档保留购买收据`);
    same(state(loaded), after, `${npc} 读档重试保持交易结果`);
    rejected(() => growth.buyOrdinary(npc, item, `buy-three-${npc}`, 2), p, `${npc} 同收据改数量拒绝`);
    rejected(() => growth.sellOrdinary(npc, item, `buy-three-${npc}`, 3), p, `${npc} 买货收据不能冒充售卖确认`);
    p.stones = price;
    ok(growth.buyOrdinary(npc, item, `buy-one-${npc}`).ok, `${npc} 单件最简调用仍可买`);
    eq(p.sectGrowthState.settledTransactions[`buy-one-${npc}`].sourceId, `${npc}|${item}`, `${npc} 单件购买收据兼容原格式`);
  }
  {
    const config = fixture(), p = new Progress(); p.stones = 1000;
    config.shops.doctor_sun.push({ item: 'clear_mind_pill', reqRank: outer, costContribution: 1, enabled: true });
    const growth = new SectGrowth(p, config);
    same(growth.ordinaryCatalog('doctor_sun').entries.map(row => row.itemId), ['hp_pill_small', 'qi_pill'], '普通货架对象不回退为灵石商品');
    rejected(() => growth.buyOrdinary('doctor_sun', 'clear_mind_pill', 'object-ordinary'), p, '对象不能通过普通购买 API 绕过');
    rejected(() => growth.buyOrdinary('grocer_wang', 'qi_pill', 'wrong-shelf'), p, '商品必须存在当前 NPC 的字符串货架');
    rejected(() => growth.buyOrdinary('tianjian_envoy_sect', 'qi_pill', 'not-ordinary'), p, '宗门 NPC 不成为普通商店');
    rejected(() => growth.buyOrdinary('missing', 'qi_pill', 'unknown-npc'), p, '未知 NPC 不卖货');
    rejected(() => growth.sellOrdinary('missing', 'qi_pill', 'unknown-sale-npc'), p, '未知 NPC 不收货');
  }

  // 06 只规定孙郎中出售清心/筑基丹方；学习与灵石和收据一起保存。
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.level = 20; p.stones = 10000; p.save();
    const catalog = growth.recipeCatalog('doctor_sun');
    ok(catalog.ok, '孙郎中开放丹方目录');
    same(catalog.entries.map(row => row.recipeId), ['recipe_clear_mind', 'recipe_foundation'], '孙郎中只售一期规定的两张丹方');
    for (const row of catalog.entries) {
      eq(row.price, config.recipes[row.recipeId].price, `${row.recipeId} 售价读 recipes`);
      eq(row.reqLevel, config.recipes[row.recipeId].reqLevel, `${row.recipeId} 购买等级读 recipes`);
    }
    p.level = config.recipes.recipe_foundation.reqLevel - 1;
    eq(growth.recipeCatalog('doctor_sun').entries.find(row => row.recipeId === 'recipe_foundation')?.key, 'alchemy.recipe.level', '筑基丹方差一级显示购买门槛');
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-level-short'), p, '确认重新检验购买等级', 'alchemy.recipe.level');
    p.level = 20; p.stones = config.recipes.recipe_foundation.price! - 1;
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-stone-short'), p, '丹方差一灵石拒绝', 'ui.shop.not_enough');
    p.stones = config.recipes.recipe_foundation.price!; p.save();
    const writesBefore = writes, beforeInventory = clone(p.inventory);
    eq(growth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-foundation').key, 'alchemy.recipe.complete', '丹方购买返回学习完成');
    eq(p.stones, 0, '丹方恰好售价扣至零');
    same(p.learnedRecipes, ['recipe_foundation'], '购买直接 grantRecipe 学会');
    same(p.inventory, beforeInventory, '丹方购买不写物品背包');
    eq(writes - writesBefore, 1, '丹方学习/灵石/收据只保存一次');
    eq(growth.recipeCatalog('doctor_sun').entries.find(row => row.recipeId === 'recipe_foundation')?.learned, true, '目录标记已经学会');
    const after = state(p), writesAfter = writes;
    eq(growth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-foundation').repeated, true, '原购买确认重试命中收据');
    same(state(p), after, '重试不重复扣费授方'); eq(writes, writesAfter, '重试不再写存档');
    const loaded = Progress.load(), loadedGrowth = new SectGrowth(loaded, config);
    eq(loadedGrowth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-foundation').repeated, true, '读档保留丹方收据');
    same(state(loaded), after, '丹方购买读档保持角色状态');
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_foundation', 'recipe-already-known'), p, '新确认不重复购买已学丹方', 'alchemy.recipe.learned');
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_clear_mind', 'recipe-foundation'), p, '收据不能改为另一张丹方');
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', 'recipe-foundation'), p, '丹方收据不能变为普通购买');
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_hp_pill', 'recipe-tutorial'), p, '任务教学丹方不额外销售');
    rejected(() => growth.buyRecipe('doctor_sun', 'recipe_buff_atk', 'recipe-later'), p, '后续丹方不进入一期商店');
    rejected(() => growth.buyRecipe('grocer_wang', 'recipe_clear_mind', 'recipe-wrong-npc'), p, '普通杂货商不售孙郎中丹方');
    eq(growth.recipeCatalog('grocer_wang').entries.length, 0, '杂货商不显示丹方目录');
  }
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.level = 20; p.stones = 10000; p.save();
    ok(growth.recipeCatalog('doctor_sun').entries.every(row => row.ok), '开关关闭前预览可以购买');
    for (const feature of ['shops', 'alchemyPhase1'] as const) {
      setFeatureFlag(feature, false);
      eq(growth.recipeCatalog('doctor_sun').entries.length, 0, `${feature} 关闭时丹方入口目录为空`);
      rejected(() => growth.buyRecipe('doctor_sun', 'recipe_clear_mind', `recipe-gate-${feature}`), p, `旧预览确认不能绕过 ${feature}`, FEATURE_UNAVAILABLE);
      setFeatureFlag(feature, true);
    }
    failStorage = true;
    try { rejected(() => growth.buyRecipe('doctor_sun', 'recipe_clear_mind', 'recipe-save-failure'), p, '丹方保存失败回滚学习/余额/收据', 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    eq(p.learnedRecipes.length, 0, '保存失败不留下已学丹方');
    const writesBefore = writes;
    ok(growth.buyRecipe('doctor_sun', 'recipe_clear_mind', 'recipe-save-failure').ok, '丹方保存恢复后原确认可重试');
    eq(writes - writesBefore, 1, '丹方恢复交易只保存一次');
    same(p.learnedRecipes, ['recipe_clear_mind'], '恢复后只学会一次');
    eq(p.stones, 10000 - config.recipes.recipe_clear_mind.price!, '恢复后按表扣一笔价格');
  }
  for (const field of ['price', 'reqLevel'] as const) {
    for (const value of [null, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
      const config = fixture(), p = new Progress(); p.level = 20; p.stones = 10000;
      Object.assign(config.recipes.recipe_clear_mind, { [field]: value });
      const growth = new SectGrowth(p, config);
      ok(!growth.recipeCatalog('doctor_sun').entries.some(row => row.recipeId === 'recipe_clear_mind'), `缺失/非法丹方 ${field} ${String(value)} 不展示销售`);
      rejected(() => growth.buyRecipe('doctor_sun', 'recipe_clear_mind', `recipe-invalid-${field}-${String(value)}`), p, `缺失/非法丹方 ${field} ${String(value)} 不交易`);
    }
  }

  // 永久库存可卖给普通商店，价格为 item.price 一半向下取整；不要求该物在货架。
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 10; p.sectContribution = 77; p.addItem('rabbit_fur', 4); p.addItem('qi_pill', 2); p.addItem('hp_pill_small', 1); p.save();
    const catalog = growth.ordinarySellCatalog('doctor_sun');
    ok(catalog.ok, '拥有永久库存可打开出售目录');
    eq(catalog.entries.find(row => row.itemId === 'rabbit_fur')?.price, 3, '材料按售价一半收购');
    eq(catalog.entries.find(row => row.itemId === 'rabbit_fur')?.count, 4, '出售目录给出永久库存数量');
    eq(catalog.entries.find(row => row.itemId === 'qi_pill')?.price, 10, '偶数售价精确减半');
    eq(catalog.entries.find(row => row.itemId === 'hp_pill_small')?.price, 7, '奇数售价向下取整保持整数灵石');
    const writesBefore = writes;
    const result = growth.sellOrdinary('doctor_sun', 'rabbit_fur', 'sale-three', 3);
    ok(result.ok, '不在购买货架的永久材料仍可出售');
    eq(result.key, 'ui.shop.sell_complete', '售卖返回专用完成文案');
    eq(p.count('rabbit_fur'), 1, '售卖只扣指定数量');
    eq(p.stones, 19, '三件材料增加三件半价灵石');
    eq(p.sectContribution, 77, '普通售卖不改变贡献');
    eq(p.sectGrowthState.settledTransactions['sale-three'].kind, 'shop_sale', '售卖收据使用独立交易种类');
    eq(writes - writesBefore, 1, '售卖扣货/灵石/收据一次保存');
    const after = state(p), writesAfter = writes;
    eq(growth.sellOrdinary('doctor_sun', 'rabbit_fur', 'sale-three', 3).repeated, true, '售卖重试命中收据');
    same(state(p), after, '售卖重试不重复扣货或发灵石');
    eq(writes, writesAfter, '售卖重试不写存档');
    const loaded = Progress.load(), loadedGrowth = new SectGrowth(loaded, config);
    eq(loadedGrowth.sellOrdinary('doctor_sun', 'rabbit_fur', 'sale-three', 3).repeated, true, '读档售卖收据不丢失');
    same(state(loaded), after, '读档售卖重试不改变角色');
    rejected(() => growth.sellOrdinary('doctor_sun', 'rabbit_fur', 'sale-three', 1), p, '同售卖收据不能改变数量');
    rejected(() => growth.buyOrdinary('doctor_sun', 'rabbit_fur', 'sale-three', 3), p, '售卖收据不能冒充购买确认');
    rejected(() => growth.sellOrdinary('doctor_sun', 'rabbit_fur', 'sale-too-many', 2), p, '预览后库存不足确认重新校验');
  }

  // 临时物与装备栏里的物品不可卖；背包中的备用装备副本可以出售。
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config); p.stones = 10;
    p.addTrialItem('rabbit_fur', 3);
    ok(!growth.ordinarySellCatalog('grocer_wang').entries.some(row => row.itemId === 'rabbit_fur'), '纯临时库存不出现在出售目录');
    rejected(() => growth.sellOrdinary('grocer_wang', 'rabbit_fur', 'trial-only'), p, '直接 API 不能卖纯临时物');
    p.addItem('rabbit_fur', 2);
    eq(growth.ordinarySellCatalog('grocer_wang').entries.find(row => row.itemId === 'rabbit_fur')?.count, 2, '混合库存只展示永久数量');
    rejected(() => growth.sellOrdinary('grocer_wang', 'rabbit_fur', 'trial-padding', 3), p, '临时数量不能凑足售卖批次');
    ok(growth.sellOrdinary('grocer_wang', 'rabbit_fur', 'permanent-only', 2).ok, '混合库存出售完整永久数量');
    eq(p.count('rabbit_fur'), 3, '售卖保留全部临时数量');
    eq(p.count('rabbit_fur') - p.permanentCount('rabbit_fur'), 3, '售卖不改变临时标记');
    eq(JSON.parse(disk[saveKey]).inventory.rabbit_fur, 0, '存档不写临时数量');
    p.removeTrialItem('rabbit_fur', 3);
    eq(p.count('rabbit_fur'), 0, '试炼仍可完整清除原临时物');
    p.equip.weapon = 'wood_sword';
    ok(!growth.ordinarySellCatalog('grocer_wang').entries.some(row => row.itemId === 'wood_sword'), '仅装备栏持有的物品不展示售卖');
    rejected(() => growth.sellOrdinary('grocer_wang', 'wood_sword', 'equipped'), p, '装备栏物品不能经直接 API 卖出');
    p.addItem('wood_sword', 2);
    ok(growth.sellOrdinary('grocer_wang', 'wood_sword', 'spare-equipment', 2).ok, '背包同 id 备用装备可出售');
    eq(p.count('wood_sword'), 0, '售卖只扣背包装备副本');
    eq(p.equip.weapon, 'wood_sword', '售卖备用副本保留已装备武器');
    p.addItem('fox_tail', 1);
    rejected(() => growth.sellOrdinary('grocer_wang', 'fox_tail', 'zero-price'), p, '零售价物品不出售');
  }

  // 无效数量、价格、余额和溢出必须在扣款扣物前拒绝。
  for (const count of [0, -1, 0.5, NaN, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 1000; p.addItem('qi_pill', 10);
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', `bad-buy-count-${String(count)}`, count), p, `无效购买数量 ${String(count)}`);
    rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', `bad-sell-count-${String(count)}`, count), p, `无效出售数量 ${String(count)}`);
  }
  for (const price of [null, -1, 0.5, Infinity, Number.MAX_SAFE_INTEGER + 1]) {
    const config = fixture(), p = new Progress(); p.stones = 1000; p.addItem('qi_pill', 1);
    Object.assign(config.items.qi_pill, { price });
    const growth = new SectGrowth(p, config);
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', `bad-buy-price-${String(price)}`), p, `无效购买价格 ${String(price)}`);
    rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', `bad-sale-price-${String(price)}`), p, `无效出售价格 ${String(price)}`);
  }
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 39;
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', 'short-total', 2), p, '批量购买总价差一灵石拒绝');
    p.stones = Number.MAX_SAFE_INTEGER; p.addItem('qi_pill', 1);
    rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', 'overflow-stones'), p, '出售后灵石溢出拒绝');
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', 'overflow-total', Number.MAX_SAFE_INTEGER), p, '购买总价溢出拒绝');
    p.inventory.qi_pill = Number.MAX_SAFE_INTEGER;
    rejected(() => growth.buyOrdinary('doctor_sun', 'qi_pill', 'overflow-inventory'), p, '购买后背包数量溢出拒绝');
    p.stones = -1;
    rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', 'bad-stone-balance'), p, '非法灵石余额不结算出售');
  }

  // 保存失败完整回滚库存、丹药品质与余额；原确认随后可安全重试。
  for (const selling of [false, true]) {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 100; p.addCraftedPill('qi_pill', 2, 'high'); p.addCraftedPill('qi_pill', 1, 'low'); p.save();
    const id = selling ? 'sale-save-failure' : 'buy-save-failure';
    const action = () => selling ? growth.sellOrdinary('doctor_sun', 'qi_pill', id, 2) : growth.buyOrdinary('doctor_sun', 'qi_pill', id, 2);
    failStorage = true;
    try { rejected(action, p, `${selling ? '出售' : '购买'}保存失败原子回滚`, 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    ok(!Object.prototype.hasOwnProperty.call(p.sectGrowthState.settledTransactions, id), '保存失败不留下成功收据');
    const writesBefore = writes;
    ok(action().ok, '保存恢复后原确认可重试');
    eq(writes - writesBefore, 1, '恢复后交易仍只保存一次');
    eq(p.count('qi_pill'), selling ? 1 : 5, '恢复后库存按单笔交易结算');
    eq(p.stones, selling ? 120 : 60, '恢复后灵石按单笔交易结算');
    if (selling) same(p.pillQualityCounts('qi_pill'), { low: 0, mid: 0, high: 1, supreme: 0 }, '售卖沿既有品质消耗顺序扣除');
    same(Progress.load().pillQualityCounts('qi_pill'), p.pillQualityCounts('qi_pill'), '保存与读档丹药品质一致');
  }
  {
    const config = fixture(), p = new Progress(), growth = new SectGrowth(p, config);
    p.stones = 100; p.addCraftedPill('qi_pill', 2, 'high'); p.addTrialItem('qi_pill', 3); p.save();
    eq(growth.ordinarySellCatalog('doctor_sun').entries.find(row => row.itemId === 'qi_pill')?.count, 2, '混合丹药目录只计永久高品质库存');
    failStorage = true;
    try { rejected(() => growth.sellOrdinary('doctor_sun', 'qi_pill', 'mixed-quality-failure'), p, '混合临时丹药保存失败回滚品质与临时数', 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    ok(growth.sellOrdinary('doctor_sun', 'qi_pill', 'mixed-quality-failure').ok, '混合丹药保存恢复后可重试');
    eq(p.count('qi_pill'), 4, '混合丹药售卖扣一枚永久丹药');
    eq(p.permanentCount('qi_pill'), 1, '混合丹药售后永久库存为一枚');
    same(p.pillQualities.qi_pill, { low: 0, mid: 0, high: 1, supreme: 0 }, '临时丹药不充当下品抵扣高品质桶');
    eq(JSON.parse(disk[saveKey]).inventory.qi_pill, 1, '混合丹药保存剔除三枚临时丹药');
    same(Progress.load().pillQualityCounts('qi_pill'), { low: 0, mid: 0, high: 1, supreme: 0 }, '读档保留真实永久丹药品质');
    p.removeTrialItem('qi_pill', 3);
    eq(p.count('qi_pill'), 1, '临时丹药原接口仍可完整清除');
    same(p.pillQualityCounts('qi_pill'), { low: 0, mid: 0, high: 1, supreme: 0 }, '清除临时丹药后剩余高品质永久丹药');
  }

  // G15 四字段对象只花贡献，确认复检职位；enabled:false 连目录都不展示。
  for (const sect of SECT_GROWTH_CONFIG.ranks.sects) {
    const config = fixture(), p = joined(sect.id), npc = sectShelf(config, sect.id), growth = new SectGrowth(p, config);
    p.stones = 999; p.sectContribution = 100; p.save();
    const entries = growth.catalog(npc, 'sect_shop').entries;
    same(entries.map(row => row.itemId), ['hp_pill_small', 'clear_mind_pill'], `${sect.id} 宗门目录过滤字符串与禁用对象`);
    eq(entries[0].ok, true, `${sect.id} G15 四字段对象无需 balanceTodo`);
    eq(entries[1].key, 'sect.ui.locked_rank', `${sect.id} reqRank 不足提示职位`);
    rejected(() => growth.exchange(npc, 'sect_shop', 'clear_mind_pill', `rank-${sect.id}`), p, `${sect.id} 直接确认复检职位`, 'sect.ui.locked_rank');
    rejected(() => growth.exchange(npc, 'sect_shop', 'talisman_paper', `disabled-${sect.id}`), p, `${sect.id} 直接交易禁用对象拒绝`);
    rejected(() => growth.exchange(npc, 'sect_shop', 'qi_pill', `string-${sect.id}`), p, `${sect.id} 字符串不回退贡献货品`);
    const writesBefore = writes;
    ok(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `sect-buy-${sect.id}`).ok, `${sect.id} 宗门对象购买成功`);
    eq(p.count('hp_pill_small'), 1, `${sect.id} 宗门购买交货一件`);
    eq(p.sectContribution, 92, `${sect.id} 只扣 costContribution`);
    eq(p.stones, 999, `${sect.id} 不扣商品灵石售价`);
    eq(writes - writesBefore, 1, `${sect.id} 宗门货款与交货一次保存`);
    const after = state(p);
    eq(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `sect-buy-${sect.id}`).repeated, true, `${sect.id} 宗门交易同确认去重`);
    same(state(p), after, `${sect.id} 重复兑换不扣款或交货`);
    p.sectRank = inner;
    ok(growth.exchange(npc, 'sect_shop', 'clear_mind_pill', `inner-${sect.id}`).ok, `${sect.id} 高职位货架开放`);
    ok(growth.exchange(npc, 'sect_shop', 'hp_pill_small', `inherit-${sect.id}`).ok, `${sect.id} 高职位继承低职位货架`);
    eq(p.sectRank, inner, `${sect.id} 贡献消费不降职`);
  }
  {
    const config = fixture(), p = joined(), npc = sectShelf(config), growth = new SectGrowth(p, config); p.stones = 1000; p.sectContribution = 7;
    rejected(() => growth.exchange(npc, 'sect_shop', 'hp_pill_small', 'short-contribution'), p, '贡献不足不能回退灵石付款', 'sect.ui.contribution_short');
    p.sectContribution = 100; p.save(); failStorage = true;
    try { rejected(() => growth.exchange(npc, 'sect_shop', 'hp_pill_small', 'sect-save-failure'), p, '宗门保存失败原子回滚', 'sect.ui.save_failed'); }
    finally { failStorage = false; }
    (config.shops[npc][1] as SectShopGood).enabled = false;
    rejected(() => growth.exchange(npc, 'sect_shop', 'hp_pill_small', 'stale-enabled'), p, '预览后 enabled 关闭确认拒绝');
    const outsider = new Progress(); outsider.sectContribution = 100;
    rejected(() => new SectGrowth(outsider, config).exchange(npc, 'sect_shop', 'clear_mind_pill', 'outsider'), outsider, '未入宗不开放宗门货架');
  }

  console.log(`shop.test: ${assertions} 条断言通过（普通买卖/一期丹方/G15/门禁/原子存档，仅内存配置与存档）`);
} finally {
  for (const name of serviceFeatures) setFeatureFlag(name, originalFeatures[name]);
  Date.now = originalNow;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
