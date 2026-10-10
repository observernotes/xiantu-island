import pacing from '@xt/balance/solo_pacing.json';
import expCurve from '@xt/balance/exp_curve.json';
import realms from '@xt/balance/realms.json';
import rawQuests from '@xt/balance/quests.json';
import rawNpcs from '@xt/balance/npcs.json';
import breakthrough from '@xt/balance/breakthrough.json';
import monsters from '@xt/balance/monsters.json';
import youyingMap from '@xt/maps/trial_youying_vault.json';
import lingfuMap from '@xt/maps/trial_lingfu_range.json';
import shadowArt from '@xt/art/sprites/fx_shadow_zone.anims.json';
import { GAME_PHASE, inPhase, NPCS, QUESTS, QUEST_NAMES, QUEST_ORDER, t } from './data';
import { ferryLockedReason } from './Ferry';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { realDay, Seclusion } from './Seclusion';
import { dailyContribution, dailyQuestDay } from './DailyQuests';
import { advancePatrol, detectProgress, inShadow, seesPlayer, shadowPieces, startPatrol, targetMotion } from './TrialMotion';

let assertions = 0;
function eq(actual: unknown, expected: unknown, msg: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${msg}: 得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, msg: string): asserts value {
  assertions++;
  if (!value) throw new Error(msg);
}
function same(actual: unknown, expected: unknown, msg: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), msg);
}

// 可观察实际存档，所有测试只改内存，不写 balance 生成表。
const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
globalThis.localStorage = {
  getItem: (key: string) => saved[key] ?? null,
  setItem: (key: string, value: string) => { saved[key] = String(value); },
  removeItem: (key: string) => { delete saved[key]; },
  clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
  key: (index: number) => Object.keys(saved)[index] ?? null,
  get length() { return Object.keys(saved).length; },
};

// G8：航线来自 NPC 原表；叠加门槛只能提示第一个未满足条件，任务必须交付完成。
{
  const routes = NPCS.ferry_master.ferryRoutes;
  const rawRoutes = rawNpcs.find(n => n.id === 'ferry_master')?.ferryRoutes;
  // 旧发版快照还未登记航线；只有读到新表才检查实际数据，其余门槛照常验证。
  same(routes, rawRoutes, '航线顺序与 NPC 原表一致');
  same(QUEST_NAMES, Object.fromEntries(rawQuests.map(q => [q.id, q.name])), '锁定任务名称包含完整原表的所有阶段');
  const route = { id: '__gate_test', label: 'ferry.route_wanyao_outer_1', targetMap: 'wanyao_outer_1',
    targetPortal: 'test_dock', cost: 0, phaseMin: GAME_PHASE + 1, reqLevel: 10, unlockQuest: 'q_awaken' };
  const p = new Progress(); p.level = 1;
  eq(ferryLockedReason(route, p), t('sys.portal_locked'), '阶段门槛优先于等级与任务');
  route.phaseMin = GAME_PHASE;
  eq(ferryLockedReason(route, p), t('sys.portal_level', { lv: 10 }), '等级门槛优先于任务');
  p.level = 10;
  const questReason = t('ferry.locked_quest', { quest: QUESTS.q_awaken.name });
  eq(ferryLockedReason(route, p), questReason, '任务未接取时显示前置名称');
  p.quests.q_awaken = { state: 'active', kills: {} };
  eq(ferryLockedReason(route, p), questReason, '任务进行中不能登船');
  p.quests.q_awaken.state = 'done';
  eq(ferryLockedReason(route, p), undefined, '等级与阶段等于下限且任务已交付时开放');
  eq(ferryLockedReason({ ...route, phaseMax: GAME_PHASE - 1 }, p), t('sys.portal_locked'), '阶段上限已过仍灰显');
  eq(ferryLockedReason({ ...route, phaseMax: GAME_PHASE }, p), undefined, '阶段上限含边界');
  eq(ferryLockedReason({ ...route, targetMap: '__missing_map' }, p), t('sys.portal_locked'), '缺目的地图不能启航');
  p.stones = 5;
  eq(ferryLockedReason({ ...route, cost: 6 }, p), t('ui.shop.not_enough'), '付费航线先确认灵石充足');
  eq(ferryLockedReason({ ...route, cost: 5 }, p), undefined, '灵石等于航费可以启航');
  eq(ferryLockedReason({ id: '__free', label: '', targetMap: route.targetMap, cost: 0 }, p), undefined, '可选门槛缺省不限制');
}

// G2：独立前置与 next 链都要已完成；等级锁不应泄漏未满足前置的任务。
{
  const p = new Progress(), qs = new QuestSystem(p);
  const sect = rawQuests.find(q => q.id === 'q_sect_tianjian');
  const chain = rawQuests.find(q => q.next === 'q_bamboo');
  ok(sect?.prereq && chain, '共享任务表包含可支持的 prereq 与 next 示例');
  p.level = sect.reqLevel;
  eq(qs.available(sect.id), false, '宗门任务不能越过前置');
  p.quests[sect.prereq] = { state: 'active', kills: {} };
  eq(qs.available(sect.id), false, '前置已接尚未交付仍不可接');
  p.quests[sect.prereq].state = 'done';
  eq(qs.available(sect.id), true, '前置完成后宗门任务可接');
  p.level = sect.reqLevel - 1;
  eq(qs.available(sect.id), false, '前置完成仍检查等级');
  eq(qs.levelLocked(sect.id), true, '满足前置的低等级任务显示等级锁');
  delete p.quests[sect.prereq];
  eq(qs.levelLocked(sect.id), false, '未满足前置不显示等级锁');
  p.level = sect.reqLevel;
  eq(qs.available(chain.next!), false, 'next 链前驱未完成不可接');
  p.quests[chain.id] = { state: 'active', kills: {} };
  eq(qs.available(chain.next!), false, 'next 前驱进行中不可接');
  p.quests[chain.id].state = 'done';
  eq(qs.available(chain.next!), true, 'next 前驱完成才可接');

  // 在内存中为真实宗门任务加第二条独立 next 依赖，检查两种条件必须同时满足。
  const oldNext = QUESTS[chain.id].next;
  try {
    QUESTS[chain.id].next = sect.id;
    delete p.quests[chain.id];
    p.quests[sect.prereq] = { state: 'done', kills: {} };
    eq(qs.available(sect.id), false, 'prereq 满足不能跳过另一个 next 前驱');
    p.quests[chain.id] = { state: 'done', kills: {} };
    delete p.quests[sect.prereq];
    eq(qs.available(sect.id), false, 'next 满足不能跳过独立 prereq');
    p.quests[sect.prereq] = { state: 'done', kills: {} };
    eq(qs.accept(sect.id), true, '所有前置完成可实际接取');
    eq(qs.accept(sect.id), false, '进行中任务不可重复接取');
    p.quests[sect.id].state = 'done';
    eq(qs.available(sect.id), false, '完成任务不可重复接取');
  } finally { QUESTS[chain.id].next = oldNext; }
}

// phase 既管原表加载，也管任务入口；NPC 挂着未加载的未来任务不会抛错。
{
  same(QUEST_ORDER, rawQuests.filter(q => q.phase === undefined || q.phase <= GAME_PHASE).map(q => q.id), '任务加载按原表 phase 与 GAME_PHASE 筛选');
  eq(inPhase({ phase: GAME_PHASE }), true, '首次阶段等于当前启用');
  eq(inPhase({ phase: GAME_PHASE + 1 }), false, '未来首次阶段不启用');
  eq(inPhase({ phase: GAME_PHASE - 1, phaseMin: GAME_PHASE + 1 }), false, 'phaseMin 与 phase 合并检查');
  eq(inPhase({ phase: GAME_PHASE - 1, phaseMax: GAME_PHASE - 1 }), false, 'phaseMax 与 phase 合并检查');
  const p = new Progress(), qs = new QuestSystem(p);
  p.level = 99;
  const id = '__v05_future_quest', npc = NPCS.village_elder;
  const future = { ...QUESTS.q_awaken, id, phase: GAME_PHASE + 1 };
  const oldNpcQuests = npc.quests;
  try {
    // 模拟 NPC 引用一项因 phase 过滤而未加载的任务。
    npc.quests = [id];
    eq(qs.mark(npc.id), null, '未来任务未加载时 NPC 没有任务标记');
    same(qs.talk(npc.id).lines, npc.dialog.map(text => ({ speaker: npc.name, text })), '未来任务未加载时仍可正常聊天');
    // 即使运行期注册了未来任务，available 和 levelLocked 仍应守住 phase。
    QUESTS[id] = future; QUEST_ORDER.push(id);
    eq(qs.available(id), false, '运行期未来任务不可接');
    p.level = 0;
    eq(qs.levelLocked(id), false, '运行期未来任务不显示等级锁');
    eq(qs.accept(id), false, '直接接取未来任务被拒绝');
  } finally {
    npc.quests = oldNpcQuests;
    delete QUESTS[id];
    const index = QUEST_ORDER.indexOf(id); if (index >= 0) QUEST_ORDER.splice(index, 1);
  }
}

const sect = pacing.sectSeclusion;
const unlock = realms.find(r => r.id === sect.unlockRealm);
ok(unlock, 'sectSeclusion.unlockRealm 在共享 realms 表中存在');
const minYears = Math.min(...sect.options), longYears = Math.max(...sect.options);
const costs = sect.contributionCost as Record<string, number>;
const expTable = expCurve.expToNext as Record<string, number>;
const realmFactors = pacing.seclusion.realmMul as Record<string, number>;
const request = { mode: 'sect', reqRealm: unlock.id };
const now = Date.now();
const tomorrow = new Date(new Date(now).getFullYear(), new Date(now).getMonth(), new Date(now).getDate() + 1, 12).getTime();
function ready() {
  const p = new Progress();
  p.level = unlock!.levelMin;
  p.sectContribution = 100 * costs[String(longYears)];
  p.ageUpdatedAt = now;
  return p;
}
// 期望按表中描述算；下面使用只跨一级的样例，避免复制结算循环。
function yearly(level: number, realmId = unlock!.id) {
  return Math.round(expTable[String(level)] * pacing.seclusion.perYearRatio
    * sect.density / pacing.densityRef * realmFactors[realmId] * sect.roomMul);
}

// G8：mode、地图 reqRealm、表中 unlockRealm 和选项都约束闭关入口。
{
  const p = ready(), s = new Seclusion(p);
  eq(s.locked(request), false, '达到地图与表内境界可闭关');
  eq(s.locked({ mode: 'cave', reqRealm: unlock.id }), true, '尚未实现的洞府模式锁定');
  eq(s.locked({ mode: 'sect', reqRealm: 'unknown_realm' }), true, '未知 reqRealm 不开放');
  p.level = unlock.levelMin - 1;
  eq(s.locked({ mode: 'sect' }), true, '地图省略 reqRealm 仍服从表内 unlockRealm');
  p.level = unlock.levelMin;
  const higher = realms.find(r => r.levelMin > p.level);
  ok(higher, '表中有高于宗门闭关解锁的境界');
  eq(s.locked({ mode: 'sect', reqRealm: higher.id }), true, '地图更高 reqRealm 不能被表内解锁覆盖');
  const unavailableYears = Math.max(...sect.options) + 1;
  eq(s.check(request, unavailableYears, now), 'locked', '非配表年数拒绝');
}

// 一开始只差 1 修为升级；第一年升阶，后续年份改用下一等级的升级基数。
{
  const p = ready(), s = new Seclusion(p);
  const initialLevel = unlock.levelMin;
  const expectedGain = yearly(initialLevel) + (longYears - 1) * yearly(initialLevel + 1);
  ok(yearly(initialLevel) !== yearly(initialLevel + 1), '相邻等级年修为不同，能检出旧基数错误');
  ok(expectedGain - 1 < expTable[String(initialLevel + 1)], '测试样例只跨一级');
  p.exp = expTable[String(initialLevel)] - 1;
  const initialBalance = p.sectContribution, initialAge = p.age;
  const result = s.settle(request, longYears, now);
  ok(result.ok, '足够贡献与寿元可以闭关');
  eq(result.gained, expectedGain, '后续年份取升级后的基数');
  eq(result.levels, 1, '闭关跨一级');
  eq(p.level, initialLevel + 1, '闭关升级落到下一等级');
  eq(p.exp, expectedGain - 1, '跨级之后修为正确保留');
  eq(p.sectContribution, initialBalance - costs[String(longYears)], '只扣本次配表贡献');
  eq(p.age, initialAge + longYears, '逐年消耗寿元');
  eq(p.seclusionYearsToday, longYears, '现实日累计记录游戏年份');
  same(p.seclusionHistory, [{ at: now, years: longYears, cost: costs[String(longYears)], gained: expectedGain, overflowed: 0 }], '闭关日志记录实际结算');
  const disk = JSON.parse(saved[saveKey]);
  same(disk.seclusionHistory, p.seclusionHistory, '结算日志实际写入存档');
  eq(disk.level, p.level, '闭关升级实际写入存档');
  eq(disk.sectContribution, p.sectContribution, '贡献扣费实际写入存档');
  const restored = Progress.load();
  same(restored.seclusionHistory, p.seclusionHistory, '读档后闭关记录保留');
  eq(restored.seclusionYearsToday, longYears, '读档后现实日使用量保留');
}

// 境界关口不得自动突破，装不下的修为进入溢出池并按突破表截断。
{
  const p = ready(), s = new Seclusion(p);
  p.level = unlock.levelMax;
  const need = expTable[String(p.level)];
  const expectedCap = Math.round(need * breakthrough.overflowPoolRatio);
  p.exp = need - 1;
  const result = s.settle(request, longYears, now);
  ok(result.ok, '瓶颈前允许闭关');
  const expectedOverflow = Math.min(longYears * yearly(p.level) - 1, expectedCap);
  eq(p.level, unlock.levelMax, '闭关不会自动越过境界关口');
  eq(p.exp, need, '闭关在瓶颈把条填满');
  eq(result.gained, 1, '瓶颈仅实际填条算获得修为');
  eq(result.overflowed, expectedOverflow, '多余修为入池并截断');
  eq(p.overflowExp, expectedOverflow, '溢出池余额正确');
  eq(result.blocked, true, '返回瓶颈阻塞');
  eq(result.overflowFilled, expectedOverflow === expectedCap, '返回首次存满标志');
  p.overflowExp = expectedCap;
  const full = s.settle(request, minYears, now);
  ok(full.ok, '满瓶颈仍可闭关结算成本');
  eq(full.gained, 0, '满条闭关不虚报获得修为');
  eq(full.overflowed, 0, '满池闭关不虚报溢出');
  eq(full.overflowFilled, false, '满池不重复报告首次存满');
  eq(p.overflowExp, expectedCap, '满池保持表内上限');
}

// 拒绝路径不产生结算；日限按本地现实日重置，闭关消耗的游戏年不能刷新日限。
{
  const poor = ready(), s = new Seclusion(poor);
  poor.sectContribution = costs[String(minYears)] - 1;
  const before = JSON.stringify(poor), diskBefore = saved[saveKey];
  const result = s.settle(request, minYears, now);
  same(result, { ok: false, reason: 'cost' }, '贡献不足拒绝结算');
  eq(JSON.stringify(poor), before, '贡献不足不改变角色、年龄、使用量、日志');
  eq(saved[saveKey], diskBefore, '贡献不足不写存档');

  const limited = ready(), daily = new Seclusion(limited);
  limited.seclusionDay = realDay(now);
  limited.seclusionYearsToday = sect.maxYearsPerRealDay;
  const balance = limited.sectContribution, age = limited.age;
  same(daily.settle(request, minYears, now), { ok: false, reason: 'daily' }, '同一现实日达到限额拒绝');
  eq(limited.sectContribution, balance, '日限拒绝不扣贡献');
  eq(limited.age, age, '日限拒绝不扣寿元');
  eq(limited.seclusionHistory.length, 0, '日限拒绝不写闭关日志');
  ok(realDay(tomorrow) !== realDay(now), '跨日本地日期不同');
  limited.ageUpdatedAt = tomorrow;
  const next = daily.settle(request, minYears, tomorrow);
  ok(next.ok, '跨现实日重新允许闭关');
  eq(limited.seclusionDay, realDay(tomorrow), '闭关日换到新现实日');
  eq(limited.seclusionYearsToday, minYears, '新日仅计本次年份');

  const exhausted = ready(), life = new Seclusion(exhausted);
  const lifespan = (pacing.lifespan.cap as Record<string, number>)[unlock.id];
  exhausted.age = lifespan - minYears;
  const lifeBefore = JSON.stringify(exhausted);
  same(life.settle(request, minYears, now), { ok: false, reason: 'life' }, '闭关不能消耗到寿元归零');
  eq(JSON.stringify(exhausted), lifeBefore, '寿元不足不扣贡献、不加修为、不记闭关');
}

// 日常贡献接口：只认本宗真实已交付任务，同任务同日只能领一次。
{
  const p = ready(); p.sectContribution = 0;
  p.advanceClass('tianjian_disciple'); p.resetDailyQuests(now);
  const dailyA = QUESTS.q_daily_tianjian_1, dailyB = QUESTS.q_daily_tianjian_2;
  const contributionA = dailyContribution(dailyA)!, contributionB = dailyContribution(dailyB)!;
  eq(p.onSectDailyQuestCompleted('daily_a', now), 0, '旧虚构来源不发贡献');
  eq(p.onSectDailyQuestCompleted(dailyA.id, now), 0, '尚未交付日常不发贡献');
  p.quests[dailyA.id] = { state: 'done', kills: {} };
  eq(p.onSectDailyQuestCompleted(dailyA.id, now), contributionA, '本宗真实日常按任务奖励贡献');
  eq(p.onSectDailyQuestCompleted(dailyA.id, now), 0, '同日同来源不重复领奖');
  p.quests[dailyB.id] = { state: 'done', kills: {} };
  eq(p.onSectDailyQuestCompleted(dailyB.id, now), contributionB, '同日不同日常可分别领奖');
  eq(p.sectContribution, contributionA + contributionB, '累计贡献按任务奖励');
  same(p.sectDailyContributionClaims, [dailyA.id, dailyB.id], '领取来源去重');
  p.save();
  const loaded = Progress.load();
  eq(loaded.onSectDailyQuestCompleted(dailyA.id, now), 0, '读档后同日来源仍不可重领');
  eq(loaded.onSectDailyQuestCompleted('', now), 0, '空来源不发贡献');
  for (const invalid of [-1, 0.5, NaN, Infinity, loaded.sectContribution + 1]) {
    const balance = loaded.sectContribution;
    eq(loaded.spendSectContribution(invalid), false, '非法或不足的贡献消耗拒绝');
    eq(loaded.sectContribution, balance, '拒绝消耗保持贡献余额');
  }
  const expected = loaded.sectContribution - costs[String(minYears)];
  eq(loaded.spendSectContribution(costs[String(minYears)]), true, '足够贡献可按闭关费用消耗');
  eq(Progress.load().sectContribution, expected, '贡献消耗持久化');
  loaded.resetDailyQuests(tomorrow);
  eq(loaded.onSectDailyQuestCompleted(dailyA.id, tomorrow), 0, '跨日须重新交付才能再次领取');
  loaded.quests[dailyA.id] = { state: 'done', kills: {} };
  eq(loaded.onSectDailyQuestCompleted(dailyA.id, tomorrow), contributionA, '跨日重新交付相同任务可再次领取');
  same(loaded.sectDailyContributionClaims, [dailyA.id], '跨日清空旧领取记录');
  eq(Progress.load().sectContribution, expected + contributionA, '跨日获得贡献持久化');
}

// 旧档缺省新增字段：直接 ensureDefaults 和真实 load 两条入口均能恢复。
{
  const p = ready(); p.name = '旧档修士'; p.addItem('hp_pill_small', 3); p.save();
  const old = JSON.parse(saved[saveKey]);
  const addedFields = ['sectContribution', 'sectDailyContributionDay', 'sectDailyContributionClaims',
    'age', 'ageUpdatedAt', 'seclusionDay', 'seclusionYearsToday', 'seclusionHistory'] as const;
  for (const key of addedFields) delete old[key];
  saved[saveKey] = JSON.stringify(old);
  const loaded = Progress.load();
  eq(loaded.name, '旧档修士', '旧档迁移保留角色');
  eq(loaded.count('hp_pill_small'), 3, '旧档迁移保留背包');
  for (const key of ['sectContribution', 'seclusionYearsToday'] as const) eq(loaded[key], 0, `旧档 ${key} 缺省 0`);
  eq(loaded.sectDailyContributionDay, dailyQuestDay(), '旧档日常贡献日期补到当前 05:00 日');
  eq(loaded.dailyQuestResetDay, dailyQuestDay(), '旧档记录本次补算日常日期');
  eq(loaded.seclusionDay, '', '旧档闭关日期缺省空日期');
  same(loaded.sectDailyContributionClaims, [], '旧档缺省无贡献来源');
  same(loaded.seclusionHistory, [], '旧档缺省无闭关记录');
  ok(loaded.age >= pacing.lifespan.startAge && loaded.age < pacing.lifespan.startAge + 0.01, '旧档年龄从配表 startAge 开始');

  const partial = ready();
  for (const key of addedFields) Object.assign(partial, { [key]: undefined });
  partial.ensureDefaults();
  eq(partial.sectContribution, 0, 'ensureDefaults 修复缺失贡献');
  eq(partial.age, pacing.lifespan.startAge, 'ensureDefaults 修复缺失年龄');
  eq(partial.seclusionYearsToday, 0, 'ensureDefaults 修复缺失今日闭关量');
  same(partial.seclusionHistory, [], 'ensureDefaults 修复缺失闭关历史');
  same(partial.sectDailyContributionClaims, [], 'ensureDefaults 修复缺失领取记录');

  partial.sectDailyContributionClaims = ['daily_a', '', 'daily_a', 'daily_b'];
  partial.seclusionHistory = Array.from({ length: 25 }, (_, i) => ({ at: now + i, years: minYears,
    cost: costs[String(minYears)], gained: i, overflowed: 0 }));
  partial.ensureDefaults();
  same(partial.sectDailyContributionClaims, ['daily_a', 'daily_b'], '存档领取来源去空去重');
  eq(partial.seclusionHistory.length, 20, '闭关历史最多保留 20 次');
  eq(partial.seclusionHistory[0].gained, 5, '闭关历史保留最近 20 次');
  partial.save();
  same(Progress.load().seclusionHistory, partial.seclusionHistory, '历史截断后可稳定存取');
}

// G10/视野：实际 patrol_path 参数与怪物 vision 表作为运动、发现与阴影的输入。
type MapObjectFixture = { type: string; name: string; x: number; y: number; width: number; height: number;
  properties?: { name: string; value: unknown }[] };
const mapObjects = (youyingMap as unknown as { layers: { objects?: MapObjectFixture[] }[] })
  .layers.flatMap(layer => layer.objects ?? []);
const path = mapObjects.find(o => o.type === 'patrol_path');
ok(path, '幽影试炼地图包含巡逻路径');
const pathProps = Object.fromEntries((path.properties ?? []).map(p => [p.name, p.value]));
const patrol = monsters.find(m => m.id === pathProps.monster);
ok(patrol?.vision, '地图巡逻怪物具有 vision 配表');
const vision = patrol.vision;
const speed = patrol.moveSpeed;
const pauseMs = Number(pathProps.turnPauseMs);
const actualPoints = [{ x: Number(pathProps.startX), y: path.y }, { x: Number(pathProps.endX), y: path.y }];

// 移动木靶从出生点中央出发，在实际 moveRange 内左右折返。
{
  const targets = (lingfuMap as unknown as { layers: { objects?: MapObjectFixture[] }[] })
    .layers.flatMap(layer => layer.objects ?? []);
  const moving = targets.find(o => o.type === 'target_spot' && o.properties?.some(p => p.name === 'moveRange' && Number(p.value) > 0));
  ok(moving, '真实灵符地图含移动木靶');
  const range = Number(moving.properties!.find(p => p.name === 'moveRange')!.value);
  same(targetMotion(12345, 0), { offset: 0, direction: 1 }, '零范围木靶保持出生点');
  same(targetMotion(0, range), { offset: 0, direction: 1 }, '从中央面向右出发');
  same(targetMotion(-range, range), { offset: 0, direction: 1 }, '负累计距离按起点处理');
  const checkpoints = [
    [1, range, -1], [2, 0, -1], [3, -range, 1], [4, 0, 1],
    [5, range, -1], [6, 0, -1], [7, -range, 1], [8, 0, 1],
  ];
  for (const [distanceMul, offset, direction] of checkpoints) {
    same(targetMotion(distanceMul * range, range), { offset, direction }, `第 ${distanceMul} 个半程的木靶位置与方向`);
  }
  const wholeCycles = 4 * range * 1000000;
  for (const [fraction, offset, direction] of [[0.5, range / 2, 1], [1.5, range / 2, -1],
    [2.5, -range / 2, -1], [3.5, -range / 2, 1]]) {
    const state = targetMotion(wholeCycles + fraction * range, range);
    same(state, { offset, direction }, '大 distance 跨百万次往返后位置与方向正确');
    ok(state.offset >= -range && state.offset <= range, '大 distance 始终在出生点 ±moveRange 内');
  }
}

// 试炼令牌可以立即用于交互，保存/刷新/离开都不会额外留下临时份额。
{
  const token = mapObjects.find(o => o.type === 'token');
  const item = token?.properties?.find(p => p.name === 'item')?.value;
  ok(typeof item === 'string' && item.length > 0, '真实幽影地图令牌配置 item');
  const p = ready();
  p.addItem(item, 5);
  p.addItem('hp_pill_small', 3);
  p.addTrialItem(item, 3);
  eq(p.count(item), 8, '临时令牌加入运行期背包可用于交互');
  p.save();
  const disk = JSON.parse(saved[saveKey]);
  eq(disk.inventory[item], 5, '保存只留下原有永久令牌');
  eq('transientItems' in disk, false, '临时份额账本不进入存档');
  eq(Progress.load().count(item), 5, '刷新后临时令牌消失，原份数保留');
  p.addItem(item, 2);
  p.save();
  eq(Progress.load().count(item), 7, '试炼中新增永久份数仍可正常保存');
  p.removeTrialItem(item, 1);
  eq(p.count(item), 9, '只移除请求的临时份额');
  p.save();
  eq(Progress.load().count(item), 7, '部分临时清理不影响永久存档份数');
  p.removeTrialItem(item, 100);
  eq(p.count(item), 7, '离开时清理最多移除剩余临时份额');
  p.removeTrialItem(item, 100);
  eq(p.count(item), 7, '重复清理不移除永久令牌');
  eq(p.count('hp_pill_small'), 3, '试炼清理保留其他永久背包物品');
  p.save();
  eq(Progress.load().count(item), 7, '离开清理后的永久令牌可稳定存读');
  const empty = ready();
  empty.addTrialItem(item, 1); empty.save();
  eq(Progress.load().count(item), 0, '原本没有令牌的角色刷新不保留临时令牌');
  empty.removeTrialItem(item, 1);
  eq(empty.count(item), 0, '原本没有令牌的角色离开后背包归零');
}

// 真地图的直线路径到两端时停顿并返回；中间折点不应停顿。
{
  const motion = startPatrol(actualPoints), distance = actualPoints[1].x - actualPoints[0].x;
  const travelMs = distance / speed * 1000;
  advancePatrol(motion, actualPoints, speed, travelMs, pauseMs);
  eq(motion.x, actualPoints[1].x, '真实路径到配表右端');
  eq(motion.pauseLeft, pauseMs, '真实端点按配表 turnPauseMs 停顿');
  advancePatrol(motion, actualPoints, speed, pauseMs / 2, pauseMs);
  eq(motion.x, actualPoints[1].x, '端点暂停期间不平移');
  eq(motion.pauseLeft, pauseMs / 2, '暂停时间正确消耗');
  advancePatrol(motion, actualPoints, speed, pauseMs / 2 + travelMs, pauseMs);
  eq(motion.x, actualPoints[0].x, '暂停结束沿原路线返回起点');
  eq(motion.facing, -1, '返回时面向左');
  eq(motion.pauseLeft, pauseMs, '起点也按配表暂停');

  // 100px 斜段 + 60px 水平段，速度仍读真实怪物表。
  const points = [{ x: 0, y: 0 }, { x: 60, y: 80 }, { x: 120, y: 80 }];
  const folded = startPatrol(points);
  advancePatrol(folded, points, speed, 100 / speed * 1000, pauseMs);
  same({ x: folded.x, y: folded.y }, points[1], '折线沿斜段行走到中间折点');
  eq(folded.pauseLeft, 0, '内部折点不触发端点暂停');
  advancePatrol(folded, points, speed, 30 / speed * 1000, pauseMs);
  same({ x: folded.x, y: folded.y }, { x: 90, y: 80 }, '中间折点继续沿下一段平移');
  advancePatrol(folded, points, speed, 30 / speed * 1000, pauseMs);
  same({ x: folded.x, y: folded.y }, points[2], '折线走到末端');
  advancePatrol(folded, points, speed, pauseMs + 30 / speed * 1000, pauseMs);
  same({ x: folded.x, y: folded.y }, { x: 90, y: 80 }, '折线端点暂停后反向返回');

  const cycleMs = 2 * 160 / speed * 1000 + 2 * pauseMs;
  const largeDelta = 3 * cycleMs + 50 / speed * 1000;
  const fast = startPatrol(points);
  advancePatrol(fast, points, speed, largeDelta, pauseMs);
  same({ x: fast.x, y: fast.y }, { x: 30, y: 40 }, '大 delta 跨多段、多次往返与暂停后位置正确');
  eq(fast.facing, 1, '多次折返后面向当前行进方向');
  eq(fast.pauseLeft, 0, '多次折返后不残留已消耗暂停');
  const duplicates = [points[0], points[0], points[1], points[1], points[2], points[2]];
  const repeated = startPatrol(duplicates);
  advancePatrol(repeated, duplicates, speed, largeDelta, pauseMs);
  same({ x: repeated.x, y: repeated.y }, { x: 30, y: 40 }, '相邻重复点不挂死且运动距离不变');
  const stationary = startPatrol([points[0], points[0], points[0]]);
  const unchanged = JSON.stringify(stationary);
  advancePatrol(stationary, [points[0], points[0], points[0]], speed, largeDelta, pauseMs);
  eq(JSON.stringify(stationary), unchanged, '全重复点路径安全保持静止');
  advancePatrol(fast, points, 0, largeDelta, pauseMs);
  same({ x: fast.x, y: fast.y }, { x: 30, y: 40 }, '零速度路径保持静止');
}

// 灯笼高 40px，判断主角同高胸前点；阴影、高差和巡逻两端扩展范围先限制可见性。
{
  const feet = actualPoints[0], origin = { x: feet.x + 30, y: feet.y - 40 };
  const ahead = { x: origin.x + vision.length / 2, y: feet.y };
  eq(seesPlayer(origin, 1, feet, actualPoints, ahead, false, vision), true, '同高且位于前方锥内可见');
  eq(seesPlayer(origin, 1, feet, actualPoints, ahead, true, vision), false, '阴影内即使位于锥内也不可见');
  eq(seesPlayer(origin, 1, feet, actualPoints, { x: origin.x - 1, y: feet.y }, false, vision), false, '正后方不可见');
  eq(seesPlayer(origin, 1, feet, actualPoints, { x: origin.x + vision.length, y: feet.y }, false, vision), true, '视野长度边界可见');
  eq(seesPlayer(origin, 1, feet, actualPoints, { x: origin.x + vision.length + 0.01, y: feet.y }, false, vision), false, '超过视野长度不可见');
  const halfWidth = vision.length / 2 * Math.tan(vision.halfAngleDeg * Math.PI / 180);
  // 把原点 y 放在 -halfWidth，避免在半角边界上产生加减大坐标的浮点误差。
  const edgeOrigin = { x: origin.x, y: -halfWidth }, edgeFeet = { x: feet.x, y: 40 - halfWidth };
  const edgePlayer = { x: ahead.x, y: 40 };
  eq(seesPlayer(edgeOrigin, 1, edgeFeet, actualPoints, edgePlayer, false, vision), true, '配表半角边界可见');
  eq(seesPlayer(edgeOrigin, 1, edgeFeet, actualPoints, { ...edgePlayer, y: 40 + 0.01 }, false, vision), false, '超过半角不可见');
  eq(seesPlayer(edgeOrigin, 1, edgeFeet, actualPoints, { ...edgePlayer, y: 40 - 0.01 }, false, vision), true, '半角内侧可见');
  const wideVision = { ...vision, halfAngleDeg: 89, length: 1000 };
  eq(seesPlayer(origin, 1, feet, actualPoints, { ...ahead, y: feet.y + 95 }, false, wideVision), true, '高差 95px 尚可判断视野');
  eq(seesPlayer(origin, 1, feet, actualPoints, { ...ahead, y: feet.y + 96 }, false, wideVision), false, '高差 96px 排除被看见');
  eq(seesPlayer(origin, 1, feet, actualPoints, { ...ahead, y: feet.y - 96 }, false, wideVision), false, '负向高差 96px 也排除');
  const rightFeet = actualPoints[1], rightOrigin = { x: rightFeet.x + 30, y: rightFeet.y - 40 };
  eq(seesPlayer(rightOrigin, 1, rightFeet, actualPoints, { x: rightFeet.x + 192, y: rightFeet.y }, false, vision), true, '右端外 192px 边界可见');
  eq(seesPlayer(rightOrigin, 1, rightFeet, actualPoints, { x: rightFeet.x + 193, y: rightFeet.y }, false, vision), false, '右端外超过 192px 排除');
  const leftOrigin = { x: feet.x - 30, y: feet.y - 40 };
  eq(seesPlayer(leftOrigin, -1, feet, actualPoints, { x: feet.x - 192, y: feet.y }, false, vision), true, '左端外 192px 边界可见');
  eq(seesPlayer(leftOrigin, -1, feet, actualPoints, { x: feet.x - 193, y: feet.y }, false, vision), false, '左端外超过 192px 排除');
  eq(seesPlayer(leftOrigin, -1, feet, actualPoints, { x: leftOrigin.x + 1, y: feet.y }, false, vision), false, '面向左时右侧是后方');

  const zoneObjects = mapObjects.filter(o => o.type === 'zone');
  const zones = zoneObjects.map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height,
    props: Object.fromEntries((o.properties ?? []).map(p => [p.name, p.value])) as { kind?: string } }));
  const shadowZone = zones.find(z => z.props.kind === 'shadow');
  ok(shadowZone, '真实试炼地图包含 shadow 区');
  eq(inShadow({ x: shadowZone.x, y: shadowZone.y }, zones), true, '阴影区左上边界包含');
  eq(inShadow({ x: shadowZone.x + shadowZone.w, y: shadowZone.y + shadowZone.h }, zones), true, '阴影区右下脚底边界包含');
  eq(inShadow({ x: shadowZone.x - 1, y: shadowZone.y }, zones), false, '阴影区外不算藏身');
  eq(inShadow({ x: shadowZone.x, y: shadowZone.y }, [{ ...shadowZone, props: { kind: 'return_point' } }]), false, 'return_point 不算阴影');
}

// 发现进度以 detectMs 封顶，脱离视野按表内 decayMul 衰减且不能变为负数。
{
  const quarter = vision.detectMs / 4;
  eq(detectProgress(0, true, quarter, vision), quarter, '被看见按实际毫秒累计');
  eq(detectProgress(quarter, true, vision.detectMs, vision), vision.detectMs, '进度到配表 detectMs 封顶');
  eq(detectProgress(vision.detectMs, false, quarter, vision), vision.detectMs - quarter * vision.decayMul, '脱离视野按 decayMul 衰减');
  eq(detectProgress(quarter, false, vision.detectMs, vision), 0, '衰减到零截断');
  eq(detectProgress(quarter, true, -100, vision), quarter, '负 delta 不倒退或误增进度');
  eq(detectProgress(quarter, false, -100, vision), quarter, '负 delta 不触发衰减');
}

// fx_shadow_zone note：64px 只有左右；中片不足 32px 时裁切，拼片无缝无重叠。
{
  const w = shadowArt.pieceWidth;
  eq(w, shadowArt.frameSize[0], '拼片宽度与实际动画帧宽匹配');
  const x = 17;
  same(shadowPieces(x, 2 * w, w), [
    { kind: 'left', x, width: w }, { kind: 'right', x: x + w, width: w },
  ], '64px 阴影只有 left 与 right');
  same(shadowPieces(x, 4 * w, w), [
    { kind: 'left', x, width: w }, { kind: 'mid', x: x + w, width: w },
    { kind: 'mid', x: x + 2 * w, width: w }, { kind: 'right', x: x + 3 * w, width: w },
  ], '128px 阴影分为左右和两块完整中段');
  const width = 3 * w + 4, pieces = shadowPieces(x, width, w);
  same(pieces.map(p => [p.kind, p.width]), [['left', w], ['mid', w], ['mid', 4], ['right', w]], '非整倍数中片裁到剩余 4px');
  eq(pieces[0].x, x, '拼片从区域左端开始');
  for (let i = 1; i < pieces.length; i++) eq(pieces[i].x, pieces[i - 1].x + pieces[i - 1].width, '相邻拼片无缝无重叠');
  const last = pieces[pieces.length - 1];
  eq(last.x + last.width, x + width, '拼片恰好覆盖到区域右端');
}

console.log(`v0.5 logic tests ok: ${assertions} assertions (G2/G8, seclusion, contribution, saves, patrol, vision, shadow)`);
