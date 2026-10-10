import rawRanks from '@xt/balance/sect_ranks.json';
import rawShops from '@xt/balance/shops.json';
import strings from '@xt/balance/strings_zh.json';
import { CLASS_LIST } from './classes';
import { dailyQuestDay } from './DailyQuests';
import { REALMS, t } from './data';
import { Progress } from './Progress';
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

// 固定本地日常日，所有写入只落本测试的内存 localStorage。
const now = new Date(2026, 9, 10, 12).getTime();
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const originalFeatures = featureFlags();
const serviceFeatures = ['sectRanks', 'sectShopLibrary'] as const;
Date.now = () => now;
const disk: Record<string, string> = {};
let failStorage = false, writes = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage) throw new Error('开发自测：模拟存储写入失败');
    writes++; disk[key] = String(value);
  },
  removeItem: (key: string) => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: (index: number) => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
} satisfies Storage });
const saveKey = 'xiantu_save_v1';
const outer = 'outer_disciple', inner = 'inner_disciple', direct = 'direct_disciple';
const shop = 'sect_shop' as const, library = 'sect_library' as const;
function fixture() {
  const config = clone(SECT_GROWTH_CONFIG) as SectGrowthConfig;
  config.ranks.enabled = true;
  return config;
}
function rank(config: SectGrowthConfig, id: string) {
  const row = config.ranks.ranks.find(row => row.id === id);
  ok(row, `职位夹具 ${id} 存在`);
  return row;
}
function sect(config: SectGrowthConfig, id: string) {
  const row = config.ranks.sects.find(row => row.id === id);
  ok(row, `宗门夹具 ${id} 存在`);
  return row;
}
function joined(id = 'tianjian', level = 30) {
  const p = new Progress(); p.level = level;
  const cls = CLASS_LIST.find(row => row.sect === id);
  ok(cls, `${id} 职业登记存在`);
  // 已交付的拜宗事实用于既有成员回归，不受四宗新入口开关限制。
  p.quests[cls.joinQuest] = { state: 'done', kills: {} };
  ok(p.advanceClass(cls.id), `${id} 正式入宗`);
  return p;
}
function state(p: Progress) {
  return clone({ rank: p.sectRank, contribution: p.sectContribution, stones: p.stones,
    inventory: p.inventory, skills: p.skills, skillGifted: p.skillGifted,
    equip: p.equip, growth: p.sectGrowthState });
}
function rejected(action: () => { ok: boolean }, p: Progress, message: string) {
  const before = state(p), diskBefore = disk[saveKey];
  eq(action().ok, false, message);
  same(state(p), before, `${message} 不改变角色和收据`);
  eq(disk[saveKey], diskBefore, `${message} 不改存档`);
}
function goods(config: SectGrowthConfig, id = 'tianjian') {
  const npc = sect(config, id).stewardNpc;
  config.shops[npc] = [
    { item: 'hp_pill_small', reqRank: outer, costContribution: 20, enabled: true, balanceTodo: [] },
    { item: 'clear_mind_pill', reqRank: inner, costContribution: 30, enabled: true, balanceTodo: [] },
    { item: 'talisman_paper', reqRank: direct, costContribution: 40, enabled: true, balanceTodo: [] },
  ];
  return npc;
}
function books(config: SectGrowthConfig) {
  for (const entry of config.ranks.sects) {
    let item = 'scroll_ten_thousand_swords';
    if (entry.id !== 'tianjian') {
      const skill = Object.values(config.skills).find(row => row.sect === entry.id);
      ok(skill, `${entry.id} 本宗真实功法登记存在`);
      item = `sect_test_scroll_${entry.id}`;
      config.items[item] = { ...clone(config.items.scroll_ten_thousand_swords), id: item, unlockSkill: skill.id };
    }
    config.shops[entry.promotionNpc] = [
      { item, reqRank: direct, costContribution: 50, enabled: true, balanceTodo: [] },
    ];
  }
  return 'tianjian_elder';
}

try {
  // 注入业务夹具对应的会话开关；发版关闭入口另由 test:classes/test:features 覆盖。
  for (const name of serviceFeatures) setFeatureFlag(name, true);
  // 共享表关闭晋升与兑换；读表与身份显示仍正常，未来预留档不会被总开关放行。
  eq(rawRanks.enabled, false, '共享职位总开关当前关闭');
  same(SECT_GROWTH_CONFIG.ranks.rules.rankOrder, rawRanks.rules.rankOrder, '唯一职位顺序读取共享配置');
  same(SECT_GROWTH_CONFIG.shops, rawShops, '字符串与已落表贡献对象货架完整读取');
  same(rawRanks.ranks.filter(row => row.availableInV05).map(row => row.id), [outer, inner, direct], 'v0.5 只登记前三档');
  for (const row of rawRanks.ranks) {
    eq(row.icon, `icon_sect_rank_${row.id}`, `${row.id} 徽记 key`);
    ok((strings as unknown as Record<string, string>)[row.nameKey], `${row.id} 职位名称 key 存在`);
    for (const key of Object.values(row.promotion.dialogueKeys)) {
      ok((strings as unknown as Record<string, string>)[key], `${row.id} 晋升对白 key ${key} 存在`);
    }
  }
  for (const entry of rawRanks.sects) {
    const p = joined(entry.id), growth = new SectGrowth(p);
    eq(p.sectRank, outer, `${entry.id} 正式拜入仅授外门`);
    const identity = growth.identity();
    ok(identity?.valid, `${entry.id} 正式外门身份有效`);
    eq(identity.title, t(entry.titles.outer_disciple.nameKey), `${entry.id} 完整称号读取文案`);
    eq(identity.name, t(rawRanks.ranks[0].nameKey), `${entry.id} 通用职位名称读取文案`);
    eq(identity.icon, rawRanks.ranks[0].icon, `${entry.id} 无图不影响徽记 key`);
    same(identity.libraryTiers, ['entry'], `${entry.id} 外门只开入门权限`);
    same(identity.shopShelves, [outer], `${entry.id} 外门只开本档货架`);
    rejected(() => growth.promote(entry.promotionNpc, inner, `closed-${entry.id}`), p, `${entry.id} 总开关关闭不得晋升`);
    eq(growth.catalog(entry.stewardNpc, shop).ok, false, `${entry.id} 已落表贡献货架开关仍关闭`);
    eq(growth.catalog(entry.promotionNpc, library).ok, false, `${entry.id} 未齐真实书目仍筹备`);
    eq(growth.services(entry.stewardNpc).some(service => service.allowed), false, `${entry.id} 未落表服务不可扣款`);
  }

  // 缺字段才迁移，余额不推断职位；现有合法值及冲突值均不静默改写。
  for (const entry of rawRanks.sects) {
    const p = joined(entry.id); p.sectContribution = 10000;
    p.save();
    const old = JSON.parse(disk[saveKey]) as Record<string, unknown>;
    delete old.sectRank; delete old.sectGrowthState;
    disk[saveKey] = JSON.stringify(old);
    const loaded = Progress.load();
    eq(loaded.sectRank, outer, `${entry.id} 旧正式存档补外门`);
    eq(loaded.sectContribution, 10000, `${entry.id} 旧档不补贡献不按余额晋升`);
    same(loaded.skills, p.skills, `${entry.id} 职位迁移不重发技能`);
    same(loaded.classRewardClaims, p.classRewardClaims, `${entry.id} 职位迁移不重发入宗收据`);
    same(loaded.inventory, p.inventory, `${entry.id} 职位迁移不补物品`);
    same(loaded.sectGrowthState.settledTransactions, {}, `${entry.id} 缺业务容器仅建空收据`);
    loaded.sectRank = inner; loaded.save();
    eq(Progress.load().sectRank, inner, `${entry.id} 已有内门读档保留`);
  }
  {
    const p = new Progress(); p.level = 60; p.sectContribution = 99999;
    p.completedTrials = ['trial_tianjian']; p.addItem('five_sect_invitation', 1); p.save();
    const old = JSON.parse(disk[saveKey]) as Record<string, unknown>;
    delete old.sectRank; disk[saveKey] = JSON.stringify(old);
    const loaded = Progress.load();
    eq(loaded.sectRank, null, '仅持宗帖/经历试炼的旧档保持未入宗');
    eq(new SectGrowth(loaded).identity(), null, '未正式拜入没有职位称号');
    const config = fixture(), npc = goods(config);
    const growth = new SectGrowth(loaded, config);
    rejected(() => growth.promote('tianjian_elder', inner, 'unjoined-promote'), loaded, '未拜入不得晋升');
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', 'unjoined-shop'), loaded, '未拜入不得兑换');
    loaded.sectRank = outer; loaded.save();
    eq(Progress.load().sectRank, outer, '未入宗却有职位的冲突原值保留');
    eq(growth.services(npc).some(service => service.allowed), false, '冲突身份暂停新服务');
  }
  {
    const p = new Progress(), cls = CLASS_LIST.find(row => row.sect === 'tianjian')!;
    p.level = 30; p.sectContribution = 600;
    p.quests[cls.joinQuest] = { state: 'done', kills: {} }; p.save();
    const old = JSON.parse(disk[saveKey]) as Record<string, unknown>;
    delete old.sectRank; disk[saveKey] = JSON.stringify(old);
    const loaded = Progress.load();
    eq(loaded.sect, 'tianjian', '旧档已交付原拜宗任务属于正式身份事实');
    eq(loaded.sectRank, outer, '旧档拜宗任务完成且缺职位时迁移外门');
    eq(loaded.sectContribution, 600, '原入宗事实回补职位不赠贡献');
  }
  for (const invalid of [null, 'unknown_rank']) {
    const p = joined(); p.sectRank = invalid; p.save();
    const loaded = Progress.load();
    eq(loaded.sectRank, invalid, `正式身份冲突 ${String(invalid)} 不重置外门`);
    const config = fixture(), npc = goods(config), growth = new SectGrowth(loaded, config);
    eq(growth.identity()?.valid, false, `正式身份冲突 ${String(invalid)} 有诊断`);
    ok(growth.identity()?.diagnostic, `正式身份冲突 ${String(invalid)} 诊断非空`);
    rejected(() => growth.promote('tianjian_elder', inner, `invalid-${String(invalid)}`), loaded, '冲突档不晋升');
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', `invalid-shop-${String(invalid)}`), loaded, '冲突档不兑换');
  }
  for (const future of ['deacon', 'elder']) {
    const p = joined(); p.sectRank = future; p.save();
    const loaded = Progress.load();
    eq(loaded.sectRank, future, `${future} 未来档存档不降职`);
    const config = fixture(), npc = goods(config), growth = new SectGrowth(loaded, config);
    const identity = growth.identity();
    ok(identity?.valid, `${future} 已登记未来身份有效`);
    same(identity.libraryTiers, ['entry', 'advanced', 'secret'], `${future} 目录封顶亲传`);
    same(identity.shopShelves, [outer, inner, direct], `${future} 货架封顶亲传`);
    rejected(() => growth.promote('tianjian_elder', 'elder', `future-${future}`), loaded, `${future} 不执行后续晋升`);
    loaded.sectContribution = 100; ok(growth.exchange(npc, shop, 'talisman_paper', `future-shop-${future}`).ok, `${future} 可使用本期已就绪货架`);
    eq(loaded.sectRank, future, `${future} 消费不降低保存职位`);
  }

  // 五宗按真实贡献与境界门槛验册；确认复检相邻职位，不收费、不跳档。
  for (const entry of rawRanks.sects) {
    const config = fixture(), innerRow = rank(config, inner), directRow = rank(config, direct);
    const p = joined(entry.id), growth = new SectGrowth(p, config);
    const minContribution = innerRow.reqContribution!;
    const realm = REALMS.find(row => row.id === innerRow.reqRealm);
    ok(realm, `${entry.id} 内门境界引用存在`);
    p.level = realm.levelMin; p.sectContribution = minContribution - 1;
    rejected(() => growth.promote(entry.promotionNpc, inner, `short-${entry.id}`), p, `${entry.id} 差 1 贡献不能晋升`);
    p.sectContribution = minContribution; p.level = realm.levelMin - 1;
    rejected(() => growth.promote(entry.promotionNpc, inner, `realm-short-${entry.id}`), p, `${entry.id} 境界不足不能晋升`);
    p.level = realm.levelMin;
    const preview = growth.promotion(entry.promotionNpc);
    ok(preview.ok, `${entry.id} 门槛恰达可晋升`);
    eq(preview.target, inner, `${entry.id} 只报价相邻下一档`);
    eq(preview.requiredContribution, minContribution, `${entry.id} 贡献门槛读取职位表`);
    eq(preview.requiredRealm, innerRow.reqRealm, `${entry.id} 境界门槛读取职位表`);
    same(preview.dialogueKeys, innerRow.promotion.dialogueKeys, `${entry.id} 晋升对白引用职位表`);
    rejected(() => growth.promote(entry.promotionNpc, direct, `skip-${entry.id}`, true), p, `${entry.id} 外门不能跳亲传`);
    const before = state(p), writesBefore = writes, transaction = `inner-${entry.id}`;
    ok(growth.promote(entry.promotionNpc, inner, transaction).ok, `${entry.id} 晋升内门成功`);
    eq(p.sectRank, inner, `${entry.id} 内门落档`);
    eq(p.sectContribution, before.contribution, `${entry.id} 晋升只验余额不扣费`);
    same(p.skills, before.skills, `${entry.id} 晋升权限不自动学技能`);
    same(p.inventory, before.inventory, `${entry.id} 晋升不虚构物品奖励`);
    eq(writes - writesBefore, 1, `${entry.id} 职位和收据一次写盘`);
    same(p.sectGrowthState.settledTransactions[transaction], { kind: 'promotion', sect: entry.id, sourceId: inner, day: dailyQuestDay(now) }, `${entry.id} 晋升收据来源与日界`);
    const after = state(p);
    growth.promote(entry.promotionNpc, inner, transaction);
    same(state(p), after, `${entry.id} 重复回调不二次晋升或改奖励`);
    growth.promote(entry.promotionNpc, direct, transaction, true);
    same(state(p), after, `${entry.id} 同笔 id 不能改目标晋升第二档`);
    p.spendSectContribution(p.sectContribution);
    eq(p.sectRank, inner, `${entry.id} 用尽贡献不降内门`);
    p.sectContribution = directRow.reqContribution!;
    p.level = REALMS.find(row => row.id === directRow.reqRealm)!.levelMin;
    eq(growth.promotion(entry.promotionNpc).mode, 'oath', `${entry.id} 亲传要求誓问`);
    rejected(() => growth.promote(entry.promotionNpc, direct, `defer-${entry.id}`), p, `${entry.id} 未接受誓问无变化`);
    ok(growth.promote(entry.promotionNpc, direct, `direct-${entry.id}`, true).ok, `${entry.id} 延期后接受可晋升亲传`);
    eq(p.sectRank, direct, `${entry.id} 亲传保存`);
    eq(growth.promotion(entry.promotionNpc).ok, false, `${entry.id} 亲传不再提供晋升`);
    rejected(() => growth.promote(entry.promotionNpc, 'deacon', `cap-${entry.id}`, true), p, `${entry.id} 本期封顶拒绝执事`);
  }

  // 配置门槛非法时拒绝业务，不能靠表空值、旧灵石价或错误服务注册绕过。
  const badRanks: [string, (config: SectGrowthConfig) => void][] = [
    ['贡献 null', config => { rank(config, inner).reqContribution = null; }],
    ['境界 null', config => { rank(config, inner).reqRealm = null; }],
    ['未清 balanceTodo', config => { rank(config, inner).balanceTodo = ['reqContribution']; }],
    ['负贡献', config => { rank(config, inner).reqContribution = -1; }],
    ['小数贡献', config => { rank(config, inner).reqContribution = 0.5; }],
    ['未知境界', config => { rank(config, inner).reqRealm = 'unknown_realm'; }],
    ['不开放目标档', config => { rank(config, inner).availableInV05 = false; }],
    ['贡献门槛非单调', config => { rank(config, direct).reqContribution = 0; }],
    ['境界门槛非单调', config => { rank(config, direct).reqRealm = 'qi_refining'; }],
    ['累计贡献依据', config => { config.ranks.rules.contributionBasis = 'lifetime'; }],
    ['晋升消耗开关', config => { config.ranks.rules.promotionSpendsContribution = true; }],
    ['消费降职开关', config => { config.ranks.rules.demoteOnSpend = true; }],
    ['重复职位顺序', config => { config.ranks.rules.rankOrder[1] = outer; }],
  ];
  for (const [name, change] of badRanks) {
    const config = fixture(); change(config);
    const p = joined('tianjian', 60); p.sectContribution = 100000;
    const growth = new SectGrowth(p, config);
    rejected(() => growth.promote('tianjian_elder', inner, `bad-rank-${name}`), p, `${name} 禁止晋升`);
  }
  {
    const config = fixture(), npc = goods(config), p = joined('tianjian', 60); p.sectContribution = 99999;
    const growth = new SectGrowth(p, config);
    rejected(() => growth.promote('taixu_elder', inner, 'wrong-elder'), p, '外宗长老不办理本宗晋升');
    rejected(() => growth.exchange('taixu_envoy', shop, 'hp_pill_small', 'wrong-shop'), p, '外宗接引不兑换');
    rejected(() => growth.exchange('tianjian_envoy', shop, 'hp_pill_small', 'old-npc'), p, '青云旧称引不提供山门服务');
    rejected(() => growth.exchange(npc, library, 'hp_pill_small', 'wrong-type'), p, '不匹配服务类型不得兑换');
    const elder = config.npcs.tianjian_elder;
    const original = clone(elder.services);
    elder.services = original?.filter(service => service.type !== 'sect_promotion');
    rejected(() => growth.promote('tianjian_elder', inner, 'missing-service'), p, 'NPC 无注册服务不办理');
    elder.services = clone(original);
    const promotionService = elder.services!.find(service => service.type === 'sect_promotion')!;
    promotionService.config = 'unknown_config';
    rejected(() => growth.promote('tianjian_elder', inner, 'wrong-config'), p, 'services config 非白名单不办理');
    promotionService.config = 'sect_ranks'; promotionService.sect = 'taixu';
    rejected(() => growth.promote('tianjian_elder', inner, 'wrong-service-sect'), p, 'services sect 与职务表不一致不办理');
    elder.services = [...clone(original!), clone(original![0])];
    rejected(() => growth.promote('tianjian_elder', inner, 'duplicate-service'), p, 'NPC 重复服务 type 不办理');
    elder.services = [{ type: '__proto__', sect: 'tianjian', config: 'shops' }];
    same(growth.services('tianjian_elder'), [], '未知或原型服务 type 不执行');
    rejected(() => growth.exchange(npc, '__proto__' as typeof shop, 'hp_pill_small', 'unknown-service-type'), p, '直接 API 未知服务 type 不扣款');
    Object.assign(elder, { services: [null] });
    rejected(() => growth.promote('tianjian_elder', inner, 'malformed-service'), p, '畸形 services 不抛错不办理');
  }
  {
    const config = fixture(), p = joined('tianjian', 60); p.sectContribution = 1400;
    const growth = new SectGrowth(p, config);
    ok(growth.promotion('tianjian_elder').ok, '确认前可取有效晋升报价');
    p.spendSectContribution(p.sectContribution);
    rejected(() => growth.promote('tianjian_elder', inner, 'stale-promotion'), p, '预览后贡献变化确认重新检查');
    p.sectContribution = 1400;
    rejected(() => growth.promote('tianjian_elder', inner, ''), p, '晋升空业务 id 不结算');
    for (const transaction of ['__proto__', 'constructor', 'prototype']) {
      rejected(() => growth.promote('tianjian_elder', inner, transaction), p, '原型属性业务 id 不结算');
    }
  }

  // 贡献商品按档累加，检查价格/开关/待填/门槛；旧字符串不混入贡献货架。
  for (const entry of rawRanks.sects) {
    const config = fixture(), npc = goods(config, entry.id), p = joined(entry.id);
    const growth = new SectGrowth(p, config); p.sectContribution = 100;
    const catalog = growth.catalog(npc, shop);
    ok(catalog.ok, `${entry.id} 本宗对象商品货架就绪`);
    eq(catalog.entries.length, 3, `${entry.id} 高档商品仍展示供灰显`);
    eq(catalog.entries.find(row => row.itemId === 'hp_pill_small')?.ok, true, `${entry.id} 外门补给可兑换`);
    eq(catalog.entries.find(row => row.itemId === 'clear_mind_pill')?.ok, false, `${entry.id} 内门补给外门锁定`);
    rejected(() => growth.exchange(npc, shop, 'clear_mind_pill', `locked-shop-${entry.id}`), p, `${entry.id} 直接 API 不能绕 reqRank`);
    const stones = p.stones, writesBefore = writes;
    ok(growth.exchange(npc, shop, 'hp_pill_small', `shop-${entry.id}`).ok, `${entry.id} 贡献兑换一件`);
    eq(p.count('hp_pill_small'), 1, `${entry.id} 一次兑换只交付单件`);
    eq(p.sectContribution, 80, `${entry.id} 按对象价格扣贡献`);
    eq(p.stones, stones, `${entry.id} 对象商品不叠灵石扣款`);
    eq(writes - writesBefore, 1, `${entry.id} 扣款交货收据一次保存`);
    same(p.sectGrowthState.settledTransactions[`shop-${entry.id}`], { kind: 'shop', sect: entry.id, sourceId: `${npc}|hp_pill_small`, day: dailyQuestDay(now) }, `${entry.id} 商店收据使用 NPC 与物品来源`);
    const after = state(p);
    growth.exchange(npc, shop, 'hp_pill_small', `shop-${entry.id}`);
    same(state(p), after, `${entry.id} 重复回调同笔只交货一次`);
    const loaded = Progress.load();
    new SectGrowth(loaded, config).exchange(npc, shop, 'hp_pill_small', `shop-${entry.id}`);
    eq(loaded.count('hp_pill_small'), 1, `${entry.id} 读档重试不重复交货`);
    eq(loaded.sectContribution, 80, `${entry.id} 读档重试不再次扣款`);
    ok(growth.exchange(npc, shop, 'hp_pill_small', `shop-again-${entry.id}`).ok, `${entry.id} 新确认可再次买同一物品`);
    eq(p.count('hp_pill_small'), 2, `${entry.id} 不按 item id 限购去重`);
    p.sectRank = inner;
    ok(growth.exchange(npc, shop, 'clear_mind_pill', `inner-shop-${entry.id}`).ok, `${entry.id} 内门可用新增货架`);
    ok(growth.exchange(npc, shop, 'hp_pill_small', `inherited-shop-${entry.id}`).ok, `${entry.id} 内门继承外门货架`);
    eq(p.sectRank, inner, `${entry.id} 商店消费不降职`);
  }
  const badGoods: [string, (config: SectGrowthConfig, npc: string) => void][] = [
    ['价格 null', (config, npc) => { (config.shops[npc][0] as { costContribution: number | null }).costContribution = null; }],
    ['价格负数', (config, npc) => { (config.shops[npc][0] as { costContribution: number }).costContribution = -1; }],
    ['价格小数', (config, npc) => { (config.shops[npc][0] as { costContribution: number }).costContribution = 0.5; }],
    ['价格无穷', (config, npc) => { (config.shops[npc][0] as { costContribution: number }).costContribution = Infinity; }],
    ['条目 disabled', (config, npc) => { (config.shops[npc][0] as { enabled: boolean }).enabled = false; }],
    ['商品 balanceTodo', (config, npc) => { (config.shops[npc][0] as { balanceTodo: string[] }).balanceTodo = ['costContribution']; }],
    ['未知 reqRank', (config, npc) => { (config.shops[npc][0] as { reqRank: string }).reqRank = 'unknown_rank'; }],
    ['重复 item', (config, npc) => { config.shops[npc].push(clone(config.shops[npc][0])); }],
    ['旧字符串 item', (config, npc) => { config.shops[npc][0] = 'hp_pill_small'; }],
  ];
  for (const [name, change] of badGoods) {
    const config = fixture(), npc = goods(config); change(config, npc);
    const p = joined(); p.sectContribution = 100; p.stones = 10000;
    const growth = new SectGrowth(p, config);
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', `bad-shop-${name}`), p, `${name} 不扣款不交货`);
  }
  {
    const config = fixture(), npc = goods(config), p = joined(), growth = new SectGrowth(p, config);
    p.sectContribution = 19;
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', 'balance-short'), p, '贡献差 1 不足不可兑换');
    p.sectContribution = 20;
    ok(growth.exchange(npc, shop, 'hp_pill_small', 'exact-balance').ok, '余额恰好价格可以兑换');
    eq(p.sectContribution, 0, '恰好余额扣到零');
    p.sectContribution = 0;
    (config.shops[npc][0] as { costContribution: number }).costContribution = 0;
    ok(growth.exchange(npc, shop, 'hp_pill_small', 'explicit-free').ok, '显式合法零价与 null 区分');
    p.sectContribution = 100;
    p.canReceiveItem = () => false;
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', 'bag-full'), p, '背包接口拒收不扣款');
  }

  // 五宗同档书目齐备才开放高阶目录；买书保留原功法条件，权限不直接发技能。
  {
    const config = fixture(), npc = books(config), p = joined('tianjian', 60);
    p.sectRank = direct; p.sectContribution = 200; p.skills.sword_rain = 10;
    const growth = new SectGrowth(p, config), lastSect = config.ranks.sects[4];
    const lastShelf = config.shops[lastSect.promotionNpc];
    delete config.shops[lastSect.promotionNpc];
    eq(growth.catalog(npc, library).ok, false, '四宗高阶书目不能独立开放目录');
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-incomplete'), p, '未齐五宗同档书目不扣款');
    const initialSkill = CLASS_LIST.find(row => row.sect === 'tianjian')!;
    ok(p.classRewardClaims.includes(initialSkill.id), '未齐书目不撤销既有一转登记');
    ok(p.skillLevel('breeze_sword') > 0 || Object.keys(p.skills).some(id => id !== 'sword_rain'), '未齐书目保留已学一转功法');
    config.shops[lastSect.promotionNpc] = lastShelf;
    ok(growth.catalog(npc, library).ok, '五宗同档商品与功法引用齐备可开目录');
    p.skills.sword_rain = 9;
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-prereq'), p, '秘籍原功法前置差 1 不可兑换');
    p.skills.sword_rain = 10; p.level = 59;
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-level'), p, '秘籍原三转等级条件不足不兑换');
    p.level = 60; p.sectRank = inner;
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-rank'), p, '已有学习前置仍须亲传职位');
    p.sectRank = direct;
    rejected(() => growth.exchange('taixu_elder', library, 'sect_test_scroll_taixu', 'library-cross-sect'), p, '功法兑换不能跨宗');
    const before = state(p);
    eq(p.count('scroll_ten_thousand_swords'), 0, '秘籍未拥有不构成购买前循环条件');
    ok(growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-success').ok, '满足原条件与职位可兑换秘籍');
    eq(p.count('scroll_ten_thousand_swords'), 1, '秘籍单件进入背包');
    eq(p.sectContribution, 150, '秘籍只扣配置贡献价格');
    eq(p.skillLevel('ten_thousand_swords'), 0, '兑换不自动学会解锁功法');
    same(p.skills, before.skills, '兑换权限不改已有功法等级');
    same(p.skillGifted, before.skillGifted, '兑换不改赠送技能点记录');
    ok(p.addSkillPoint('ten_thousand_swords').ok, '书入背包后仍由原学习接口花技能点解锁');
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-learned'), p, '已学秘籍新确认也不能重复购买');
    const after = state(p);
    growth.exchange(npc, library, 'scroll_ten_thousand_swords', 'library-success');
    same(state(p), after, '已学后重试成功交易仍不多发不多扣');
  }
  for (const mutation of ['realm', 'level', 'itemLevel', 'unknownSkill'] as const) {
    const config = fixture(), npc = books(config), p = joined('tianjian', 60);
    p.sectRank = direct; p.sectContribution = 200; p.skills.sword_rain = 10;
    const skill = config.skills.ten_thousand_swords;
    if (mutation === 'realm') skill.req = { ...skill.req, realm: 'nascent_soul' };
    else if (mutation === 'level') skill.req = { ...skill.req, level: 61 };
    else if (mutation === 'itemLevel') config.items.scroll_ten_thousand_swords.reqLevel = 61;
    else config.items.scroll_ten_thousand_swords.unlockSkill = 'unknown_skill';
    const growth = new SectGrowth(p, config);
    rejected(() => growth.exchange(npc, library, 'scroll_ten_thousand_swords', `library-${mutation}`), p, `秘籍 ${mutation} 原条件或引用不符合不兑换`);
  }

  // 交付接口抛错或未增加物品也回滚扣款，避免背包拒收造成半笔交易。
  for (const mode of ['throw', 'no-delivery', 'unsafe-count'] as const) {
    const config = fixture(), npc = goods(config), p = joined(); p.sectContribution = 100;
    const growth = new SectGrowth(p, config);
    if (mode === 'throw') p.addItem = (id, count) => { p.inventory[id] = p.count(id) + count; throw new Error('测试拒收'); };
    else if (mode === 'no-delivery') p.addItem = () => {};
    else p.inventory.hp_pill_small = Number.MAX_SAFE_INTEGER;
    p.save();
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', `delivery-${mode}`), p, `背包 ${mode} 不留下扣款与收据`);
  }

  // 收据存在异常时保留诊断所需原数据，不能清空收据后重新发货。
  for (const badState of [
    { settledTransactions: null },
    { settledTransactions: { old: { kind: 'shop', sect: 'tianjian', sourceId: '', day: '2026-10-10' } } },
    { settledTransactions: {}, donationBatches: { unknown: -1 } },
  ]) {
    const config = fixture(), npc = goods(config), p = joined(); p.sectContribution = 100;
    Object.assign(p, { sectGrowthState: clone(badState) }); p.save();
    const loaded = Progress.load(), growth = new SectGrowth(loaded, config);
    same(loaded.sectGrowthState, badState, '异常业务状态读档保留原记录');
    rejected(() => growth.exchange(npc, shop, 'hp_pill_small', 'malformed-receipt'), loaded, '异常业务状态暂停兑换');
  }

  // 保存失败时内存、原磁盘与收据全部回滚；重试复用原业务 id 能成功一次。
  for (const kind of ['promotion', 'shop'] as const) {
    const config = fixture(), npc = goods(config), p = joined('tianjian', 60);
    p.sectContribution = 1500; p.save();
    const growth = new SectGrowth(p, config), transaction = `save-failed-${kind}`;
    const action = () => kind === 'promotion'
      ? growth.promote('tianjian_elder', inner, transaction)
      : growth.exchange(npc, shop, 'hp_pill_small', transaction);
    failStorage = true;
    try { rejected(action, p, `${kind} 存储失败回滚`); }
    finally { failStorage = false; }
    eq(p.sectGrowthState.settledTransactions[transaction], undefined, `${kind} 失败不留已结算 id`);
    ok(action().ok, `${kind} 同笔失败事务可重试`);
    const after = state(p);
    action(); same(state(p), after, `${kind} 重试成功后再次回调无变化`);
    const saved = JSON.parse(disk[saveKey]);
    eq(saved.sectRank, p.sectRank, `${kind} 成功档位与内存一致`);
    eq(saved.sectContribution, p.sectContribution, `${kind} 成功余额与内存一致`);
    same(saved.inventory, p.inventory, `${kind} 成功背包与内存一致`);
    same(saved.sectGrowthState, p.sectGrowthState, `${kind} 成功收据与内存一致`);
  }

  console.log(`sect-growth.test: ${assertions} 条断言通过（内存配置/存档，不改共享表或 data/）`);
} finally {
  for (const name of serviceFeatures) setFeatureFlag(name, originalFeatures[name]);
  failStorage = false;
  Date.now = originalNow;
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
