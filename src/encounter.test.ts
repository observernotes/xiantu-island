import encountersRaw from '@xt/balance/encounters.json';
import { ENCOUNTERS, ENCOUNTERS_ERRORS } from './data';
import { parseEncountersConfig, listEncounters, previewEncounter, triggerEncounter,
  evaluateEncounterEligibility, listEligibleEncounters, previewEncounterOutcome, settleEncounterOutcome } from './Encounter';

const rawBefore = JSON.stringify(encountersRaw);
let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
function bad(label: string, mutate: (raw: Mutable) => void) {
  const raw = structuredClone(encountersRaw); mutate(raw);
  const result = parseEncountersConfig(raw);
  eq(result.config, null, `坏表拒绝：${label}`);
  ok(result.errors.length, `保留字段诊断：${label}`);
  ok(result.errors.every(error => error.startsWith('encounters.json $')), `诊断含表名与字段路径：${label}`);
}

eq(ENCOUNTERS_ERRORS.length, 0, 'data.ts 真表无错误');
ok(ENCOUNTERS, 'data.ts 导出已校验奇遇快照');
const config = ENCOUNTERS, metadata = listEncounters(config);
eq(config.encounters.length, 5, '真表加载五事件');
eq(metadata.length, 5, '真表可读取五条登记元数据');
same(metadata.map(row => row.id), encountersRaw.encounters.map(row => row.id), '列表来自真表');
eq(metadata.filter(row => row.enabled).length, 5, '正式五事件 enabled 全 true');
same(metadata[0], {
  id: encountersRaw.encounters[0].id, nameKey: encountersRaw.encounters[0].nameKey,
  maps: encountersRaw.encounters[0].maps, enabled: true,
}, '元数据包含身份、名称、地图与正式门禁');
ok(Object.isFrozen(config) && Object.isFrozen(config.rules) && Object.isFrozen(config.encounters)
  && Object.isFrozen(config.encounters[0].script.steps[0]) && Object.isFrozen(config.encounters[0].outcomes[0]), '配置递归冻结');
ok(Object.isFrozen(metadata) && Object.isFrozen(metadata[0]) && Object.isFrozen(metadata[0].maps), '列表元数据只读');
const raw = structuredClone(encountersRaw), parsed = parseEncountersConfig(raw);
ok(parsed.config, '真表通过独立校验');
ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.errors), '校验结果与 errors 只读');
eq(Object.isFrozen(raw), false, '不冻结调用方对象');
eq(Object.isFrozen(raw.encounters[0].script.steps), false, '不冻结调用方嵌套对象');
raw.encounters[0].maps[0] = 'changed_map';
raw.encounters[0].script.steps[0].id = 'changed_step';
same(parsed.config.encounters[0].maps, encountersRaw.encounters[0].maps, '地图为独立快照');
eq(parsed.config.encounters[0].script.steps[0].id, encountersRaw.encounters[0].script.steps[0].id, '脚本为独立快照');

// 访问、修改 ctx/save/opts 的任何属性都会抛错：关态必须先短路。
const forbiddenContext = new Proxy({}, {
  get() { throw new Error('关态不得读上下文或存档'); },
  set() { throw new Error('关态不得写上下文或存档'); },
  ownKeys() { throw new Error('关态不得遍历上下文或存档'); },
});
const freshSave = (): Mutable => ({
  exp: 100, stones: 20, inventory: { hp_pill_small: 2 }, encounters: {},
  daoHeart: 50, morality: 0, karmaFlags: {}, bonusStats: { insight: 3 },
  unrelated: { keep: ['unchanged'] },
});
const save = freshSave(), before = JSON.stringify(save);
const closedRaw = structuredClone(encountersRaw);
closedRaw.encounters.forEach(row => { row.enabled = false; });
const closed = parseEncountersConfig(closedRaw).config;
ok(closed, '关态 fixture 经校验，不改正式表');
for (const row of closed.encounters) {
  eq(row.enabled, false, `${row.id} 保持关态`);
  same(evaluateEncounterEligibility(closed, row.id, forbiddenContext), { eligible: false, reason: 'disabled' }, `${row.id} 资格关态`);
  same(previewEncounter(closed, row.id, forbiddenContext), { status: 'unavailable', reason: 'disabled' }, `${row.id} 预览不可用`);
  same(triggerEncounter(closed, row.id, forbiddenContext), { status: 'rejected', reason: 'disabled' }, `${row.id} 触发被拒绝`);
  same(previewEncounterOutcome(closed, row.id, String(row.outcomes[0].id)), { status: 'unavailable', reason: 'disabled' }, `${row.id} 结局预览关态`);
  same(settleEncounterOutcome(closed, row.id, String(row.outcomes[0].id), forbiddenContext, forbiddenContext as any), { status: 'rejected', reason: 'disabled' }, `${row.id} 结算先关态不读存档或选项`);
  triggerEncounter(closed, row.id, save);
  settleEncounterOutcome(closed, row.id, String(row.outcomes[0].id), save);
}
eq(JSON.stringify(save), before, '关态 fixture 所有入口不改变存档、物资、两轴或因果');
same(listEligibleEncounters(closed, forbiddenContext), [], '全关列表不消费 ctx');
for (const [lookup, id, reason] of [[config, 'missing', 'missing'], [null, config.encounters[0].id, 'invalid']] as const) {
  same(evaluateEncounterEligibility(lookup, id, forbiddenContext), { eligible: false, reason }, `${reason} 资格`);
  same(previewEncounter(lookup, id, forbiddenContext), { status: 'unavailable', reason }, `${reason} 预览`);
  same(triggerEncounter(lookup, id, forbiddenContext), { status: 'rejected', reason }, `${reason} 触发`);
  same(previewEncounterOutcome(lookup, id, 'missing'), { status: 'unavailable', reason }, `${reason} 结局预览`);
  same(settleEncounterOutcome(lookup, id, 'missing', forbiddenContext, forbiddenContext as any), { status: 'rejected', reason }, `${reason} 结算`);
}
same(listEncounters(null), [], '坏表列表为空');
same(listEligibleEncounters(null, forbiddenContext), [], '坏表候选列表为空且不读 ctx');

// 每次只打开内存克隆中的一个事件；raw JSON 全程不改。
function fixture(id: string, mutate?: (row: Mutable) => void) {
  const candidate: Mutable = structuredClone(encountersRaw);
  candidate.encounters.forEach((entry: Mutable) => { entry.enabled = false; });
  const row = candidate.encounters.find((value: Mutable) => value.id === id);
  ok(row, `fixture 事件存在：${id}`);
  row.enabled = true; mutate?.(row);
  const parsed = parseEncountersConfig(candidate);
  eq(parsed.errors.length, 0, `fixture 通过校验：${id}`);
  ok(parsed.config, `fixture 可用：${id}`);
  return parsed.config;
}
const NOW = 10_000_000;
function context(row: typeof config.encounters[number]): Mutable {
  return {
    mapId: row.maps[0], level: row.req.levelMin, realmId: 'foundation',
    questsDone: new Set(row.req.questsDone as string[]), sectJoined: true,
    featuresReady: new Set(row.req.featuresAll as string[]),
    daoHeart: row.req.daoHeartMax ?? 50, nowMs: NOW, save: freshSave(),
  };
}
function ineligible(open: typeof config, id: string, ctx: Mutable, reason: string, label: string) {
  same(evaluateEncounterEligibility(open, id, ctx), { eligible: false, reason }, `${label} 资格拒绝`);
  same(previewEncounter(open, id, ctx), { status: 'unavailable', reason }, `${label} 预览一致`);
  same(triggerEncounter(open, id, ctx), { status: 'rejected', reason }, `${label} 触发一致`);
  same(listEligibleEncounters(open, ctx), [], `${label} 不进入候选列表`);
}
for (const row of config.encounters) {
  const open = fixture(row.id), ctx = context(row), initial = JSON.stringify(ctx.save);
  const eligibility = evaluateEncounterEligibility(open, row.id, ctx);
  ok(eligibility.eligible, `${row.id} 满足全部确定性前置`);
  if (eligibility.eligible) eq(eligibility.metadata.id, row.id, `${row.id} 资格携带元数据`);
  const preview = previewEncounter(open, row.id, ctx);
  eq(preview.status, 'available', `${row.id} fixture 预览可用`);
  if (preview.status === 'available') same(preview.metadata, listEncounters(open).find(item => item.id === row.id), `${row.id} 预览元数据一致`);
  const triggered = triggerEncounter(open, row.id, ctx);
  eq(triggered.status, 'accepted', `${row.id} fixture 接受触发`);
  if (triggered.status === 'accepted') {
    same(triggered.attempt, { encounterId: row.id, parentMap: row.maps[0], stepId: row.script.start, startedAtMs: NOW }, `${row.id} 只生成脚本草稿`);
    ok(Object.isFrozen(triggered) && Object.isFrozen(triggered.attempt), `${row.id} attempt 只读`);
  }
  eq(JSON.stringify(ctx.save), initial, `${row.id} 资格预览触发不改存档`);
  ok(!Object.isFrozen(ctx) && !Object.isFrozen(ctx.save) && !Object.isFrozen(ctx.save.inventory), `${row.id} 不冻结调用方上下文或存档`);
  same(listEligibleEncounters(open, ctx).map(value => value.id), [row.id], `${row.id} 单 fixture 只列满足前置的事件`);
  ineligible(open, row.id, { ...ctx, mapId: 'unrelated_map' }, 'map', `${row.id} 地图`);
  ineligible(open, row.id, { ...ctx, level: Number(row.req.levelMin) - 1 }, 'level', `${row.id} 等级`);
  ineligible(open, row.id, { ...ctx, questsDone: new Set() }, 'quests', `${row.id} 未完成任务`);
  ineligible(open, row.id, { ...ctx, featuresReady: new Set() }, 'features', `${row.id} 功能未就绪`);
  for (const feature of row.req.featuresAll as string[]) {
    const ready = new Set(row.req.featuresAll as string[]); ready.delete(feature);
    ineligible(open, row.id, { ...ctx, featuresReady: ready }, 'features', `${row.id} 缺单个功能 ${feature}`);
  }
  if (row.req.sectJoined === true) ineligible(open, row.id, { ...ctx, sectJoined: false }, 'sect', `${row.id} 未入宗`);
  if (typeof row.req.daoHeartMax === 'number') {
    ineligible(open, row.id, { ...ctx, daoHeart: row.req.daoHeartMax + 1 }, 'dao_heart', `${row.id} 道心上限`);
    ineligible(open, row.id, { ...ctx, daoHeart: undefined }, 'dao_heart', `${row.id} 缺道心不猜默认值`);
    ineligible(open, row.id, { ...ctx, daoHeart: NaN }, 'dao_heart', `${row.id} 道心非有限值`);
  }
  if (row.req.realmMin) {
    ineligible(open, row.id, { ...ctx, realmId: 'qi_refining' }, 'realm', `${row.id} 境界不足`);
    ineligible(open, row.id, { ...ctx, realmId: 'unknown_realm' }, 'realm', `${row.id} 未知境界`);
    ineligible(open, row.id, { ...ctx, realmId: undefined }, 'realm', `${row.id} 缺境界`);
    ok(evaluateEncounterEligibility(open, row.id, { ...ctx, realmId: 'golden_core' }).eligible, `${row.id} 更高境界也合格`);
  }
  const recordCtx = { ...ctx,
    questsDone: Object.fromEntries((row.req.questsDone as string[]).map(id => [id, { state: 'done' }])),
    featuresReady: Object.fromEntries((row.req.featuresAll as string[]).map(id => [id, true])),
  };
  ok(evaluateEncounterEligibility(open, row.id, recordCtx).eligible, `${row.id} 支持常规任务记录与功能记录`);
  const booleanQuests = { ...recordCtx, questsDone: Object.fromEntries((row.req.questsDone as string[]).map(id => [id, true])) };
  ok(evaluateEncounterEligibility(open, row.id, booleanQuests).eligible, `${row.id} 支持任务 boolean 记录`);
  ineligible(open, row.id, { ...recordCtx, questsDone: Object.fromEntries((row.req.questsDone as string[]).map(id => [id, { state: 'active' }])) }, 'quests', `${row.id} active 任务不是已完成`);
  const cooling = freshSave(); cooling.encounters.cooldownUntil = { [row.id]: NOW + 1 };
  ineligible(open, row.id, { ...ctx, save: cooling }, 'cooldown', `${row.id} 冷却未到`);
  cooling.encounters.cooldownUntil[row.id] = NOW;
  ok(evaluateEncounterEligibility(open, row.id, { ...ctx, save: cooling }).eligible, `${row.id} 冷却边界等于 now 可触发`);
  cooling.encounters.resolved = { [row.id]: String(row.outcomes.find(outcome => outcome.status === 'resolved')!.id) };
  if (row.once) ineligible(open, row.id, { ...ctx, save: cooling }, 'resolved', `${row.id} once 已结案`);
  else ok(evaluateEncounterEligibility(open, row.id, { ...ctx, save: cooling }).eligible, `${row.id} once=false 已结案仍可再次触发`);
  ineligible(open, row.id, { ...ctx, nowMs: NaN }, 'invalid_context', `${row.id} 无效时钟`);
  same(previewEncounterOutcome(open, row.id, 'missing'), { status: 'unavailable', reason: 'missing_outcome' }, `${row.id} 缺结局不可预览`);
  for (const outcome of row.outcomes) {
    const result = previewEncounterOutcome(open, row.id, String(outcome.id));
    eq(result.status, 'available', `${row.id}/${outcome.id} fixture 结局可预览`);
    if (result.status === 'available') {
      same(result.rewards, outcome.rewards, `${row.id}/${outcome.id} 奖励快照`);
      same(result.hooks, outcome.hooks, `${row.id}/${outcome.id} hooks 快照`);
      ok(Object.isFrozen(result) && Object.isFrozen(result.outcome) && Object.isFrozen(result.rewards) && Object.isFrozen(result.hooks), `${row.id}/${outcome.id} 预览深只读`);
      ok(result.rewards !== outcome.rewards && result.hooks !== outcome.hooks, `${row.id}/${outcome.id} 不共享关态配置对象`);
    }
  }
}

function settled(open: typeof config, id: string, outcomeId: string, input: Mutable, attemptId: string, nowMs = NOW, extra: Mutable = {}): Mutable {
  const initial = JSON.stringify(input), inputFrozen = Object.isFrozen(input);
  const fields = ['inventory', 'encounters', 'bonusStats', 'karmaFlags', 'unrelated'];
  const frozenFields = Object.fromEntries(fields.map(field => [field, Object.isFrozen(input[field])]));
  const opts = { nowMs, attemptId, ...extra };
  const result = settleEncounterOutcome(open, id, outcomeId, input, opts);
  eq(result.status, 'settled', `${id}/${outcomeId}/${attemptId} 结算成功`);
  eq(JSON.stringify(input), initial, `${id}/${outcomeId}/${attemptId} 不修改输入存档`);
  eq(Object.isFrozen(input), inputFrozen, `${id}/${outcomeId}/${attemptId} 不改变输入根对象冻结状态`);
  eq(Object.isFrozen(opts), false, `${id}/${outcomeId}/${attemptId} 不冻结 opts`);
  for (const field of fields) {
    if (input[field]) eq(Object.isFrozen(input[field]), frozenFields[field], `${id}/${outcomeId}/${attemptId} 不改变输入 ${field} 冻结状态`);
  }
  if (result.status !== 'settled') throw new Error(`settle rejected: ${JSON.stringify(result)}`);
  ok(result.save !== input, `${id}/${outcomeId}/${attemptId} 返回新存档`);
  return result.save as Mutable;
}
// 逐事件、逐结局执行结算；每个分支从独立朴素存档开始。
for (const row of config.encounters) {
  const open = fixture(row.id);
  for (const rawOutcome of row.outcomes) {
    const outcome = rawOutcome as Mutable, input = freshSave(), attemptId = `${row.id}:${outcome.id}`;
    const after = settled(open, row.id, outcome.id, input, attemptId);
    same(after.unrelated, input.unrelated, `${attemptId} 保留无关存档`);
    eq(after.encounters.cooldownUntil[row.id], NOW + row.cooldownMs, `${attemptId} 实时时钟冷却`);
    ok(after.encounters.settledAttempts.includes(attemptId), `${attemptId} 保存幂等结算键`);
    eq(after.exp, input.exp + (outcome.rewards.exp ?? 0), `${attemptId} 经验到账`);
    eq(after.stones, input.stones + (outcome.rewards.spiritStone ?? 0), `${attemptId} 灵石到账常规字段`);
    eq(after.bonusStats.insight, input.bonusStats.insight + (outcome.rewards.insight ?? 0), `${attemptId} 悟性到账常规字段`);
    const expectedItems = structuredClone(input.inventory);
    for (const item of outcome.rewards.items ?? []) expectedItems[item.item] = (expectedItems[item.item] ?? 0) + item.count;
    same(after.inventory, expectedItems, `${attemptId} 物品逐项累计`);
    eq(after.daoHeart, Math.max(0, Math.min(100, input.daoHeart + (outcome.hooks.daoHeartDelta ?? 0))), `${attemptId} 道心变化`);
    eq(after.morality, Math.max(-100, Math.min(100, input.morality + (outcome.hooks.moralityDelta ?? 0))), `${attemptId} 善恶变化`);
    if (outcome.status === 'resolved') {
      ok(after.encounters.resolved[row.id], `${attemptId} 标记已结案`);
      for (const hook of outcome.hooks.karma ?? []) eq(after.karmaFlags[hook.flag], hook.value, `${attemptId} 因果即时记录`);
      if (outcome.hooks.affinity?.length) {
        eq(after.encounters.pendingHooks.length, 1, `${attemptId} 好感消费者未开则待消费`);
        same(after.encounters.pendingHooks[0].payload, { affinity: outcome.hooks.affinity }, `${attemptId} 队列仅含未消费好感`);
        eq(after.encounters.hooksApplied.includes(row.id), false, `${attemptId} 有待消费不得虚标 hooksApplied`);
      } else ok(after.encounters.hooksApplied.includes(row.id), `${attemptId} 即时 hooks 已应用`);
    } else {
      eq(Boolean(after.encounters.resolved[row.id]), false, `${attemptId} failed/missed 不结案`);
      same(after.karmaFlags, input.karmaFlags, `${attemptId} failed/missed 因果不变`);
      eq(after.encounters.pendingHooks.length, 0, `${attemptId} failed/missed 不排 hooks`);
      eq(after.encounters.hooksApplied.length, 0, `${attemptId} failed/missed 不标 hooksApplied`);
      ok(evaluateEncounterEligibility(open, row.id, { ...context(row), nowMs: NOW + row.cooldownMs, save: after }).eligible, `${attemptId} failed/missed 冷却后可重试`);
    }
    const serialized = JSON.stringify(after);
    same(settleEncounterOutcome(open, row.id, outcome.id, after, { nowMs: NOW + row.cooldownMs + 1, attemptId }), { status: 'rejected', reason: 'duplicate_attempt' }, `${attemptId} 重放同 attempt 不发奖`);
    eq(JSON.stringify(after), serialized, `${attemptId} 重放不重启冷却或改变存档`);
    if (row.once && outcome.status === 'resolved') {
      same(settleEncounterOutcome(open, row.id, outcome.id, after, { nowMs: NOW + row.cooldownMs, attemptId: `${attemptId}:again` }), { status: 'rejected', reason: 'resolved' }, `${attemptId} once 已结案不能重发物资`);
      eq(JSON.stringify(after), serialized, `${attemptId} once 拒绝无副作用`);
    }
  }
}

const rescueId = 'enc_stranded_cultivator', rescue = fixture(rescueId), rescueCooldown = config.encounters[0].cooldownMs;
for (const outcomeId of ['failed', 'missed']) {
  const unsuccessful = settled(rescue, rescueId, outcomeId, freshSave(), `rescue:${outcomeId}`);
  const thenResolved = settled(rescue, rescueId, 'rescued', unsuccessful, `rescue:${outcomeId}:resolved`, NOW + rescueCooldown);
  eq(thenResolved.morality, 1, `${outcomeId} 后首次 resolved 仍领取首次两轴`);
  eq(thenResolved.karmaFlags.enc_wanderer_rescued, true, `${outcomeId} 后首次 resolved 仍领取首次因果`);
  eq(thenResolved.encounters.pendingHooks.length, 1, `${outcomeId} 后首次 resolved 仍排好感`);
}
const firstRescue = settled(rescue, rescueId, 'rescued', freshSave(), 'rescue:1');
const failedAfterResolved = settled(rescue, rescueId, 'missed', firstRescue, 'rescue:rollback', NOW - 100);
eq(failedAfterResolved.encounters.resolved[rescueId], firstRescue.encounters.resolved[rescueId], 'missed 不覆盖已有 resolved');
eq(failedAfterResolved.encounters.cooldownUntil[rescueId], firstRescue.encounters.cooldownUntil[rescueId], '时间回拨不缩短已有冷却');
same(failedAfterResolved.encounters.pendingHooks, firstRescue.encounters.pendingHooks, 'missed 不丢已有待消费 hooks');
const secondRescue = settled(rescue, rescueId, 'rescued', firstRescue, 'rescue:2', NOW + rescueCooldown);
eq(secondRescue.exp, firstRescue.exp + 1200, '救援 once=false 再次发经验');
eq(secondRescue.stones, firstRescue.stones + 648, '救援 once=false 再次发灵石');
eq(secondRescue.morality, firstRescue.morality, '救援第二次不叠善恶 hooks');
same(secondRescue.karmaFlags, firstRescue.karmaFlags, '救援第二次不叠因果 hooks');
same(secondRescue.encounters.pendingHooks, firstRescue.encounters.pendingHooks, '救援第二次不叠待消费好感');
const switchedRescue = settled(rescue, rescueId, 'aided', secondRescue, 'rescue:3', NOW + 2 * rescueCooldown);
eq(switchedRescue.exp, secondRescue.exp + 900, '救援换 resolved 结局仍可发物资');
eq(switchedRescue.morality, firstRescue.morality, '救援换结局不得再叠 oncePerEncounter');
eq(switchedRescue.karmaFlags.enc_wanderer_aided, undefined, '救援换结局不追加另一条首次因果');
same(switchedRescue.encounters.pendingHooks, firstRescue.encounters.pendingHooks, '救援换结局不追加好感队列');
const alreadyApplied = freshSave(); alreadyApplied.encounters.hooksApplied = [rescueId];
const appliedAgain = settled(rescue, rescueId, 'rescued', alreadyApplied, 'rescue:already-applied');
eq(appliedAgain.exp, alreadyApplied.exp + 1200, '既有 hooksApplied 不妨碍 once=false 物资');
eq(appliedAgain.morality, alreadyApplied.morality, '既有 hooksApplied 不再叠两轴');
same(appliedAgain.karmaFlags, {}, '既有 hooksApplied 不再叠因果');
same(appliedAgain.encounters.pendingHooks, [], '既有 hooksApplied 不再排关系');
const deferred = settled(rescue, rescueId, 'rescued', freshSave(), 'rescue:deferred', NOW, { karmaReady: false });
same(deferred.karmaFlags, {}, '未就绪因果消费者不提前写因果');
eq(deferred.morality, 1, '待消费不妨碍即时两轴');
eq(deferred.encounters.pendingHooks.length, 1, '未就绪因果与好感进入待消费队列');
same(deferred.encounters.pendingHooks[0], {
  attemptId: 'rescue:deferred', encounterId: rescueId,
  payload: { karma: [{ flag: 'enc_wanderer_rescued', value: true }], affinity: [{ npc: 'enc_wanderer', delta: 2 }] },
}, '待消费队列保存完整未消费 payload 和来源');
same(deferred.encounters.hooksApplied, [], '待消费未结束不标 hooksApplied');
const deferredAgain = settled(rescue, rescueId, 'rescued', deferred, 'rescue:deferred-again', NOW + rescueCooldown, { karmaReady: true });
same(deferredAgain.encounters.pendingHooks, deferred.encounters.pendingHooks, '消费者状态变化也不重复排首次 hooks');
same(deferredAgain.karmaFlags, deferred.karmaFlags, '已有 pending 时不绕过消费队列重写因果');
eq(deferredAgain.morality, deferred.morality, '已有 pending 时两轴不重复');

const pendingWithoutResolved = freshSave();
pendingWithoutResolved.encounters.pendingHooks = structuredClone(firstRescue.encounters.pendingHooks);
const oldPending = settled(rescue, rescueId, 'aided', pendingWithoutResolved, 'rescue:old-pending');
eq(oldPending.exp, 1000, '旧档仅有 pending 时仍可领取 once=false 物资');
eq(oldPending.morality, 0, '旧档仅有 pending 时不重叠即时两轴');
same(oldPending.karmaFlags, {}, '旧档仅有 pending 时不改首次因果');
same(oldPending.encounters.pendingHooks, pendingWithoutResolved.encounters.pendingHooks, '旧档仅有 pending 时不重复排队');

const demonId = 'enc_demon_whisper', demon = fixture(demonId), abode = fixture('enc_hidden_abode');
const lower = freshSave(); lower.daoHeart = 1; lower.morality = -99;
const clampedLow = settled(demon, demonId, 'accepted', lower, 'axis:lower');
eq(clampedLow.daoHeart, 0, '道心裁剪下界 0'); eq(clampedLow.morality, -100, '善恶裁剪下界 -100');
const higher = freshSave(); higher.daoHeart = 99; higher.morality = 100;
const clampedHigh = settled(abode, 'enc_hidden_abode', 'sealed', higher, 'axis:upper');
eq(clampedHigh.daoHeart, 100, '道心裁剪上界 100');
const upperMoral = settled(rescue, rescueId, 'rescued', higher, 'axis:upper-moral');
eq(upperMoral.morality, 100, '善恶裁剪上界 100');
const minimal = settled(fixture('enc_sage_advice'), 'enc_sage_advice', 'enlightened', {}, 'minimal');
eq(minimal.bonusStats.insight, 1, '朴素空存档补齐悟性字段');
eq(minimal.karmaFlags.enc_sage_enlightened, true, '朴素空存档补齐因果字段');
same(settleEncounterOutcome(demon, demonId, 'accepted', {}, { nowMs: NOW, attemptId: 'missing-axes' }), { status: 'rejected', reason: 'invalid_save' }, '涉及两轴时缺字段拒绝而不猜默认值');
for (const opts of [undefined, {}, { nowMs: NaN, attemptId: 'bad' }, { nowMs: NOW, attemptId: '' }, { nowMs: NOW, attemptId: 'bad', karmaReady: 'yes' }]) {
  same(settleEncounterOutcome(rescue, rescueId, 'rescued', freshSave(), opts as any), { status: 'rejected', reason: 'invalid_context' }, '无效结算 opts 拒绝');
}
same(settleEncounterOutcome(rescue, rescueId, 'missing', forbiddenContext, forbiddenContext as any), { status: 'rejected', reason: 'missing_outcome' }, '不存在的结局先拒绝不读取存档与 opts');
for (const invalidSave of [null, [], { exp: Infinity }, { stones: -1 }, { inventory: { hp_pill_small: NaN } }]) {
  same(settleEncounterOutcome(rescue, rescueId, 'rescued', invalidSave as any, { nowMs: NOW, attemptId: 'bad-save' }), { status: 'rejected', reason: 'invalid_save' }, '无效存档拒绝');
}
eq(JSON.stringify(encountersRaw), rawBefore, '全部 fixture 与坏表测试后正式导入 raw 字节内容未变');
eq(encountersRaw.encounters.filter(row => row.enabled).length, 5, 'fixture 结算后正式五事件仍 5 enabled');

for (const field of ['rules', 'encounters']) bad(`缺顶层 ${field}`, raw => { delete raw[field]; });
for (const field of ['pacingRef', 'cooldownClock']) bad(`缺 rules.${field}`, raw => { delete raw.rules[field]; });
for (const field of ['id', 'nameKey', 'enabled', 'phase', 'maps', 'trigger', 'weight', 'cooldownMs', 'once', 'req', 'script', 'choices', 'outcomes']) {
  bad(`缺事件 ${field}`, raw => { delete raw.encounters[0][field]; });
}
for (const field of ['type', 'chanceRef', 'anchor', 'reveal', 'timeSlots']) bad(`缺 trigger.${field}`, raw => { delete raw.encounters[0].trigger[field]; });
for (const field of ['start', 'steps']) bad(`缺 script.${field}`, raw => { delete raw.encounters[0].script[field]; });
for (const field of ['id', 'type']) bad(`缺步骤 ${field}`, raw => { delete raw.encounters[0].script.steps[0][field]; });
for (const field of ['id', 'textKey', 'next']) bad(`缺选项 ${field}`, raw => { delete raw.encounters[0].choices[0][field]; });
for (const field of ['id', 'status', 'textKeys', 'rewards', 'hooks']) bad(`缺结局 ${field}`, raw => { delete raw.encounters[0].outcomes[0][field]; });
for (const [label, mutate] of [
  ['重复事件 id', (raw: Mutable) => { raw.encounters[1].id = raw.encounters[0].id; }],
  ['稀疏事件行', (raw: Mutable) => { delete raw.encounters[0]; }],
  ['门禁非 boolean', (raw: Mutable) => { raw.encounters[0].enabled = 'false'; }],
  ['地图非数组', (raw: Mutable) => { raw.encounters[0].maps = 'lingxi_path'; }],
  ['空地图', (raw: Mutable) => { raw.encounters[0].maps = []; }],
  ['权重非有限数', (raw: Mutable) => { raw.encounters[0].weight = Infinity; }],
  ['负冷却', (raw: Mutable) => { raw.encounters[0].cooldownMs = -1; }],
  ['小数阶段', (raw: Mutable) => { raw.encounters[0].phase = 5.5; }],
  ['未知触发类型', (raw: Mutable) => { raw.encounters[0].trigger.type = 'quest_done'; }],
  ['触发类型不可为数组', (raw: Mutable) => { raw.encounters[3].trigger.type = ['meditation_tick']; }],
  ['进图概率引用错误', (raw: Mutable) => { raw.encounters[0].trigger.chanceRef = 'sageAdviceChancePerMeditationMin'; }],
  ['打坐概率引用错误', (raw: Mutable) => { raw.encounters[3].trigger.chanceRef = 'baseChancePerMapEnter'; }],
  ['打坐缺间隔', (raw: Mutable) => { delete raw.encounters[3].trigger.intervalMs; }],
  ['打坐零间隔', (raw: Mutable) => { raw.encounters[3].trigger.intervalMs = 0; }],
  ['打坐小数间隔', (raw: Mutable) => { raw.encounters[3].trigger.intervalMs = 0.5; }],
  ['选项物品未知', (raw: Mutable) => { raw.encounters[0].choices[1].cost.items[0].item = 'unknown_item'; }],
  ['选项消耗不可负数', (raw: Mutable) => { raw.encounters[0].choices[1].cost.items[0].count = -1; }],
  ['选项物品门槛不可小数', (raw: Mutable) => { raw.encounters[0].choices[1].req.items[0].count = 0.5; }],
  ['选项物品不可重复', (raw: Mutable) => { raw.encounters[0].choices[1].req.items.push({ item: 'hp_pill_small', count: 1 }); }],
  ['扣药门槛必须一致', (raw: Mutable) => { raw.encounters[0].choices[1].req.items[0].count = 2; }],
  ['扣药消耗必填', (raw: Mutable) => { delete raw.encounters[0].choices[1].cost; }],
  ['选项不支持未知消耗', (raw: Mutable) => { raw.encounters[0].choices[1].cost.stones = 1; }],
  ['前置功能格式错误', (raw: Mutable) => { raw.encounters[0].req.featuresAll = 'moral_state'; }],
  ['起点悬空', (raw: Mutable) => { raw.encounters[0].script.start = 'missing'; }],
  ['重复步骤', (raw: Mutable) => { raw.encounters[0].script.steps[1].id = raw.encounters[0].script.steps[0].id; }],
  ['选项悬空', (raw: Mutable) => { raw.encounters[0].script.steps[1].choiceIds = ['missing']; }],
  ['跳转悬空', (raw: Mutable) => { raw.encounters[0].choices[0].next = 'missing'; }],
  ['结局悬空', (raw: Mutable) => { raw.encounters[0].script.steps.find((step: Mutable) => step.type === 'finish').outcomeId = 'missing'; }],
  ['结局状态错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].status = 'unknown'; }],
  ['结局状态数组不得转字符串', (raw: Mutable) => { raw.encounters[0].outcomes[0].status = ['resolved']; }],
  ['两轴增量错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.moralityDelta = NaN; }],
  ['等级前置负数', (raw: Mutable) => { raw.encounters[0].req.levelMin = -1; }],
  ['等级前置小数', (raw: Mutable) => { raw.encounters[0].req.levelMin = 1.5; }],
  ['道心前置越界', (raw: Mutable) => { raw.encounters[4].req.daoHeartMax = 101; }],
  ['境界前置未知', (raw: Mutable) => { raw.encounters[2].req.realmMin = 'unknown_realm'; }],
  ['经验负数', (raw: Mutable) => { raw.encounters[0].outcomes[0].rewards.exp = -1; }],
  ['经验非有限', (raw: Mutable) => { raw.encounters[0].outcomes[0].rewards.exp = Infinity; }],
  ['灵石小数', (raw: Mutable) => { raw.encounters[0].outcomes[0].rewards.spiritStone = 0.5; }],
  ['悟性非数值', (raw: Mutable) => { raw.encounters[3].outcomes[0].rewards.insight = '1'; }],
  ['物品非数组', (raw: Mutable) => { raw.encounters[1].outcomes[0].rewards.items = {}; }],
  ['物品缺 id', (raw: Mutable) => { delete raw.encounters[1].outcomes[0].rewards.items[0].item; }],
  ['物品未知', (raw: Mutable) => { raw.encounters[1].outcomes[0].rewards.items[0].item = 'unknown_item'; }],
  ['物品数量非正', (raw: Mutable) => { raw.encounters[1].outcomes[0].rewards.items[0].count = 0; }],
  ['物品数量小数', (raw: Mutable) => { raw.encounters[1].outcomes[0].rewards.items[0].count = 1.5; }],
  ['奖励未知字段', (raw: Mutable) => { raw.encounters[0].outcomes[0].rewards.currency = 1; }],
  ['hooks 重复标志错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.oncePerEncounter = false; }],
  ['hooks 缺重复标志', (raw: Mutable) => { delete raw.encounters[0].outcomes[0].hooks.oncePerEncounter; }],
  ['因果非数组', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.karma = {}; }],
  ['因果 flag 未知', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.karma[0].flag = 'unknown_flag'; }],
  ['因果 writer 串结局', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.karma[0].flag = 'enc_wanderer_aided'; }],
  ['因果 value 错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.karma[0].value = false; }],
  ['好感非数组', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.affinity = {}; }],
  ['好感 NPC 未知', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.affinity[0].npc = 'unknown_npc'; }],
  ['好感 delta 小数', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.affinity[0].delta = 0.5; }],
  ['hooks 未知字段', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.futureHook = {}; }],
  ['failed 偷带奖励', (raw: Mutable) => { raw.encounters[0].outcomes[2].rewards.exp = 1; }],
  ['missed 偷带 hooks', (raw: Mutable) => { raw.encounters[0].outcomes[3].hooks.oncePerEncounter = true; }],
] as const) bad(label, mutate);
for (const value of [null, undefined, [], false, 'encounters']) {
  const result = parseEncountersConfig(value);
  eq(result.config, null, '非对象拒绝'); ok(result.errors.length, '非对象有诊断');
}

eq(JSON.stringify(encountersRaw), rawBefore, '坏表测试仍未改写正式 raw');
console.log(`encounter tests ok: ${assertions} assertions, 5 loaded / 5 enabled, closed/open fixture eligibility / outcomes / settlement / idempotency PASS`);
