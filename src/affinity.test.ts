import npcsRaw from '@xt/balance/npcs.json';
import encountersRaw from '@xt/balance/encounters.json';
import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { AFFINITY, AFFINITY_ERRORS } from './data';
import { parseAffinityIndex, getAffinity, previewAffinityDelta, applyAffinityDelta,
  consumeQuestAffinitySources, consumeEncounterAffinityHooks, claimAffinityUnlock, stageQuestAffinityCompletion, type SaveAffinity } from './Affinity';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { parseQuestHooks } from './QuestHooks';
import { parseEncountersConfig, settleEncounterOutcome } from './Encounter';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type MutableNpc = Record<string, any>;
function details(result: unknown, status: string, label: string): MutableNpc {
  eq((result as MutableNpc).status, status, label);
  return result as MutableNpc;
}
function reason(result: unknown) { return (result as MutableNpc).reason; }
const clone = (): MutableNpc[] => structuredClone(npcsRaw);
const first = (raw: MutableNpc[]) => raw.find(npc => npc.affinity)!;
function bad(label: string, mutate: (raw: MutableNpc[]) => void) {
  const raw = clone(); mutate(raw);
  const result = parseAffinityIndex(raw);
  eq(result.config, null, `坏表拒绝：${label}`); ok(result.errors.length, `保留错误：${label}`);
  ok(result.errors.every(error => error.startsWith('npcs.json $')), `错误含路径：${label}`);
}

eq(AFFINITY_ERRORS.length, 0, 'data.ts 真表无错误'); ok(AFFINITY, 'data.ts 导出只读好感索引');
const config = AFFINITY, entries = Object.values(config);
eq(entries.length, 9, '正式表 9 名 NPC 好感块全部加载');
const formalEnabledCount = entries.filter(entry => entry.enabled).length;
eq(entries.filter(entry => entry.gifts.enabled).length, 0, '送礼门禁全部 false');
if (formalEnabledCount === 9) {
  eq(formalEnabledCount, 9, 'tip 开态：正式表 affinity.enabled===true 共 9');
} else if (formalEnabledCount === 0) {
  eq(formalEnabledCount, 0, '未翻表时根门禁仍全 false');
} else {
  eq(formalEnabledCount, 9, '正式表根门禁只允许全关或全开，不允许半开');
}
const parsed = parseAffinityIndex(npcsRaw); ok(parsed.config, '独立解析真表成功'); eq(parsed.errors.length, 0, '无忽略错误');
ok(Object.isFrozen(config) && Object.isFrozen(config.village_elder) && Object.isFrozen(config.village_elder.tiers[0])
  && Object.isFrozen(config.enc_wanderer.sources[0]) && Object.isFrozen(config.village_elder.unlocks[0].items), '索引深冻结');
ok(Object.isFrozen(parsed) && Object.isFrozen(parsed.errors), '校验结果和错误冻结');
const raw = clone(), independent = parseAffinityIndex(raw).config;
ok(independent, '可创建独立快照'); eq(Object.isFrozen(first(raw).affinity), false, '不冻结调用方对象');
first(raw).affinity.tiers[0].nameKey = 'changed';
eq(independent.village_elder.tiers[0].nameKey, config.village_elder.tiers[0].nameKey, '调用方改动不影响快照');

const disabledRaw = structuredClone(npcsRaw);
for (const npc of disabledRaw) if (npc.affinity) npc.affinity.enabled = false;
const disabledParsed = parseAffinityIndex(disabledRaw);
eq(disabledParsed.errors.length, 0, '关态夹具通过真实表校验');
ok(disabledParsed.config, '关态夹具有可用配置');
const closed = disabledParsed.config;
const closedEntries = Object.values(closed);
eq(closedEntries.filter(entry => entry.enabled).length, 0, '关态夹具 9 块全 false');
eq(closedEntries.filter(entry => entry.gifts.enabled).length, 0, '关态夹具送礼仍全 false');

// 好感主路径隔离任务选择；开态共存另用显式 choice 冒烟覆盖。
function questHooksFixture(enabledHookId?: string) {
  const raw = structuredClone(karmaFlagsRaw);
  for (const hook of raw.questHooks) hook.enabled = hook.id === enabledHookId;
  const label = enabledHookId ?? '全关态', parsed = parseQuestHooks(raw);
  eq(parsed.errors.length, 0, `${label} questHooks 夹具无坏表`);
  ok(parsed.config, `${label} questHooks 夹具可解析`);
  eq(parsed.config.questHooks.length, 2, `${label} questHooks 夹具保留两题`);
  eq(parsed.config.questHooks.filter(hook => hook.enabled).length, enabledHookId ? 1 : 0, `${label} questHooks 夹具仅开指定题`);
  return parsed.config;
}
const hooksClosed = questHooksFixture(), hooksOpen = questHooksFixture('prologue_medicine');

const saved: Record<string, number> = { village_elder: 40 }, before = JSON.stringify(saved);
const poison = new Proxy({} as SaveAffinity, { get() { throw new Error('关态不得读取存档'); } });
for (const entry of closedEntries) {
  same(getAffinity(closed, entry.npcId, poison), { status: 'unavailable', reason: 'disabled' }, '关态夹具不读存档、不造零值');
  same(previewAffinityDelta(closed, entry.npcId, 40, poison), { status: 'unavailable', reason: 'disabled' }, '关态夹具不预览变化');
  same(applyAffinityDelta(closed, entry.npcId, 40, saved), { status: 'rejected', reason: 'disabled' }, '关态夹具拒绝结算');
  eq(reason(applyAffinityDelta(closed, entry.npcId, null, poison)), 'disabled', '关态夹具先于参数和存档检查');
}
eq(JSON.stringify(saved), before, 'apply 不改变传入存档');
same(getAffinity(null, 'village_elder', poison), { status: 'unavailable', reason: 'invalid' }, '坏表查询不可用');
same(applyAffinityDelta(null, 'village_elder', 40, poison), { status: 'rejected', reason: 'invalid' }, '坏表拒绝结算');
same(getAffinity(config, 'tianjian_envoy', poison), { status: 'unavailable', reason: 'missing' }, '无配置 NPC 不补零');
eq(reason(applyAffinityDelta(config, 'toString', 40, poison)), 'missing', '原型键不当作 NPC');
ok(Object.isFrozen(applyAffinityDelta(closed, 'village_elder', 40)), 'API 结果冻结');

// 开态业务使用调用方内存克隆，送礼门禁继续 false。
function fixture(npcId = 'village_elder', initial?: number) {
  const candidate = clone(), npc = candidate.find(row => row.id === npcId)!;
  npc.affinity.enabled = true;
  if (initial !== undefined) npc.affinity.initial = initial;
  const parsed = parseAffinityIndex(candidate);
  eq(parsed.errors.length, 0, `${npcId} 开态 fixture 无坏表`);
  ok(parsed.config, `${npcId} 内存克隆可校验开门禁`);
  eq(parsed.config[npcId].gifts.enabled, false, `${npcId} fixture 不开启送礼`);
  return parsed.config;
}
const enabled = fixture(), initialized = fixture('village_elder', 25), wandererEnabled = fixture('enc_wanderer');
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const saveKey = 'xiantu_save_v1', disk: Record<string, string> = {};
let writes = 0;
function snapshot(p: Progress) { return JSON.stringify(p.exportSave()); }
function failSave(p: Progress, throws = false) {
  Object.defineProperty(p, 'save', { configurable: true, value: () => {
    if (throws) throw new Error('fixture storage failed');
    return false;
  } });
}
function restoreSave(p: Progress) { Reflect.deleteProperty(p, 'save'); }
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk[key] ?? null,
    setItem: (key: string, value: string) => { writes++; disk[key] = value; },
    removeItem: (key: string) => { delete disk[key]; },
  } });

  {
    const p = new Progress(), before = snapshot(p), beforeWrites = writes;
    const sourceId = 'village_elder|quest|q_missing';
    eq(reason(applyAffinityDelta(enabled, 'village_elder', 40, p, sourceId)), 'invalid_source', '格式合法但未登记的来源拒绝');
    eq(snapshot(p), before, '未登记来源不初始化或记录收据'); eq(writes, beforeWrites, '未登记来源不写盘');
    eq(reason(applyAffinityDelta(enabled, 'village_elder', 40, poison, sourceId)), 'invalid_source', '未登记来源先于读取 poison 存档');
  }
  for (const invalidEnabled of ['true', 1]) {
    const candidate: MutableNpc = structuredClone(enabled); candidate.village_elder.enabled = invalidEnabled;
    same(getAffinity(candidate, 'village_elder', poison), { status: 'unavailable', reason: 'disabled' }, '运行时仅严格 true 开门禁');
    same(applyAffinityDelta(candidate, 'village_elder', 40, poison), { status: 'rejected', reason: 'disabled' }, '真值类型伪造不打开结算');
  }

  {
    const flat: Record<string, number> = {}, beforeFlat = JSON.stringify(flat);
    const view = details(getAffinity(initialized, 'village_elder', flat), 'ready', '开态平面存档可读取 initial');
    eq(view.value, 25, '缺值返回配表 initial'); eq(view.min, 0, '视图含最小值'); eq(view.max, 1000, '视图含最大值');
    eq(view.tier.id, 'stranger', 'initial 使用最高匹配档位'); eq(view.needsInitialization, true, '纯快照明确要求 Progress 初始化');
    eq(JSON.stringify(flat), beforeFlat, '读取纯快照无隐式写入');
    ok(Object.isFrozen(view) && Object.isFrozen(view.tier), '读取结果和档位深冻结');
    eq(reason(applyAffinityDelta(enabled, 'village_elder', 1, flat)), 'needs_progress', '没有 Progress 不伪造持久化成功');
  }
  {
    const p = new Progress(), initialSave = snapshot(p), beforeWrites = writes;
    const preview = details(previewAffinityDelta(initialized, 'village_elder', 90, p), 'preview', '未初始化 Progress 可预览');
    eq(preview.before, 25, '预览使用 initial'); eq(preview.after, 115, '预览计算增量');
    eq(preview.tier.id, 'acquaintance', '预览跨档位'); eq(preview.clamped, false, '范围内不标裁剪');
    eq(snapshot(p), initialSave, '预览不懒初始化存档'); eq(writes, beforeWrites, '预览不写盘');
    ok(Object.isFrozen(preview) && Object.isFrozen(preview.tier), '预览深冻结');
    const view = details(getAffinity(initialized, 'village_elder', p), 'ready', 'Progress 首读原子初始化');
    eq(view.value, 25, '首读 initial 值'); eq(p.affinity.village_elder, 25, 'initial 写入调用方 Progress');
    eq(view.needsInitialization, false, '已持久化无需再次初始化'); eq(writes, beforeWrites + 1, '初始化整笔只保存一次');
    eq(JSON.parse(disk[saveKey]).affinity.village_elder, 25, 'initial 确实落盘');
    details(getAffinity(initialized, 'village_elder', p), 'ready', '重复读取成功');
    eq(writes, beforeWrites + 1, '已初始化读取不重复写盘');
    ok(!Object.isFrozen(p) && !Object.isFrozen(p.affinity), 'API 不冻结调用方 Progress');
  }
  for (const throws of [false, true]) {
    const p = new Progress(), initialSave = snapshot(p), beforeDisk = disk[saveKey]; failSave(p, throws);
    eq(reason(getAffinity(initialized, 'village_elder', p)), 'save_failed', `初始化保存${throws ? '异常' : '拒绝'}可诊断`);
    eq(snapshot(p), initialSave, '初始化失败恢复完整内存'); eq(disk[saveKey], beforeDisk, '初始化失败不改原盘');
    restoreSave(p);
    details(getAffinity(initialized, 'village_elder', p), 'ready', '初始化失败后可重试');
    eq(p.affinity.village_elder, 25, '重试使用 initial');
  }
  {
    const p = new Progress(); p.affinity.village_elder = 95;
    const receipt = 'village_elder|quest|q_awaken', beforeWrites = writes;
    const applied = details(applyAffinityDelta(enabled, 'village_elder', 10, p, receipt), 'applied', '增量在 Progress 结算');
    eq(applied.before, 95, '加值前值'); eq(applied.after, 105, '加值后值'); eq(applied.clamped, false, '未裁剪');
    eq(applied.tier.id, 'acquaintance', '到达新档位'); eq(p.affinity.village_elder, 105, '加值写入 Progress');
    same(p.relationshipState.appliedAffinitySources, [receipt], '值与来源收据一起保存');
    eq(writes, beforeWrites + 1, '加值与收据原子单次保存');
    ok(!Object.isFrozen(p.affinity) && !Object.isFrozen(p.relationshipState)
      && !Object.isFrozen(p.relationshipState.appliedAffinitySources), '冻结收据返回结果不冻结调用方状态');
    const after = snapshot(p), afterWrites = writes;
    details(applyAffinityDelta(enabled, 'village_elder', 10, p, receipt), 'duplicate', '相同收据拒绝重放');
    eq(snapshot(p), after, '来源 once 不重复加值'); eq(writes, afterWrites, '重复收据不再次写盘');
    ok(Object.isFrozen(applied) && Object.isFrozen(applied.tier), '结算结果深冻结');
    for (const [value, delta, expected, tier] of [
      [995, 40, 1000, 'sworn_friend'], [4, -40, 0, 'stranger'],
      [1, Number.MAX_SAFE_INTEGER, 1000, 'sworn_friend'], [999, -Number.MAX_SAFE_INTEGER, 0, 'stranger'],
    ] as const) {
      p.affinity.village_elder = value;
      const before = snapshot(p), preview = details(previewAffinityDelta(enabled, 'village_elder', delta, p), 'preview', '上下界预览');
      eq(preview.after, expected, '预览裁剪到边界'); eq(preview.clamped, true, '预览标裁剪'); eq(snapshot(p), before, '裁剪预览无副作用');
      const result = details(applyAffinityDelta(enabled, 'village_elder', delta, p), 'applied', '上下界结算');
      eq(result.after, expected, '安全整数极值正确裁剪'); eq(result.tier.id, tier, '边界匹配最高档');
      eq(p.affinity.village_elder, expected, '裁剪值落盘');
    }
    for (const [value, tier] of [[99, 'stranger'], [100, 'acquaintance'], [299, 'acquaintance'], [300, 'confidant'], [600, 'close_friend'], [1000, 'sworn_friend']] as const) {
      p.affinity.village_elder = value;
      eq(details(getAffinity(enabled, 'village_elder', p), 'ready', '精确档位查询').tier.id, tier, `${value} 对应最高不大于值的档位`);
    }
  }
  for (const delta of [null, undefined, '1', NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const p = new Progress(), before = snapshot(p), beforeWrites = writes;
    details(previewAffinityDelta(enabled, 'village_elder', delta, p), 'unavailable', '非法增量预览不可用');
    details(applyAffinityDelta(enabled, 'village_elder', delta, p), 'rejected', '非法增量结算拒绝');
    eq(snapshot(p), before, '非法增量不初始化或改值'); eq(writes, beforeWrites, '非法增量不写盘');
  }
  for (const value of [null, '40', NaN, Infinity, 1.5, Number.MAX_SAFE_INTEGER + 1]) {
    const p = new Progress(); (p.affinity as MutableNpc).village_elder = value;
    const before = snapshot(p);
    eq(reason(getAffinity(enabled, 'village_elder', p)), 'invalid_save', '坏档值拒绝读取而非转成零');
    details(applyAffinityDelta(enabled, 'village_elder', 10, p), 'rejected', '坏档值拒绝结算');
    eq(snapshot(p), before, '坏档值不被静默覆盖');
  }
  for (const affinity of [null, '40', [], { village_elder: null }]) {
    const p = new Progress(); (p as unknown as MutableNpc).affinity = affinity;
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(getAffinity(initialized, 'village_elder', p)), 'invalid_save', '顶层坏 affinity 拒绝初始化');
    details(previewAffinityDelta(initialized, 'village_elder', 10, p), 'unavailable', '顶层坏 affinity 无预览');
    details(applyAffinityDelta(initialized, 'village_elder', 10, p), 'rejected', '顶层坏 affinity 无结算');
    eq(snapshot(p), before, '顶层坏 affinity 不被 initial 覆盖'); eq(writes, beforeWrites, '顶层坏 affinity 不写盘');
  }
  for (const [value, boundary] of [[-1, 0], [1001, 1000]] as const) {
    const p = new Progress(); p.affinity.village_elder = value;
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(getAffinity(enabled, 'village_elder', p)), 'invalid_save', '越界已存值拒绝直接展示');
    eq(snapshot(p), before, '越界读取不偷偷改写'); eq(writes, beforeWrites, '越界读取不写盘');
    eq(details(previewAffinityDelta(enabled, 'village_elder', 0, p), 'preview', '显式预览可裁剪修复越界值').after, boundary, '越界预览回到边界');
    eq(snapshot(p), before, '越界修复预览无副作用');
    eq(details(applyAffinityDelta(enabled, 'village_elder', 0, p), 'applied', '显式结算修复越界值').after, boundary, '修复后值落边界');
    eq(p.affinity.village_elder, boundary, '越界修复原子落盘');
  }
  for (const throws of [false, true]) {
    const p = new Progress(); p.affinity.village_elder = 40; p.save();
    const before = snapshot(p), beforeDisk = disk[saveKey]; failSave(p, throws);
    eq(reason(applyAffinityDelta(enabled, 'village_elder', 60, p, 'village_elder|quest|q_awaken')), 'save_failed', '加值写盘失败可诊断');
    eq(snapshot(p), before, '加值保存失败同时回滚值与收据'); eq(disk[saveKey], beforeDisk, '加值保存失败不改原盘');
    restoreSave(p);
    details(applyAffinityDelta(enabled, 'village_elder', 60, p, 'village_elder|quest|q_awaken'), 'applied', '失败收据可重试');
    eq(p.affinity.village_elder, 100, '重试仅加一次');
  }

  // 从真实任务首次 active -> done 产生来源，不扫描旧档历史完成项。
  eq(stageQuestAffinityCompletion(enabled, 'q_fox', poison as any), true, '无来源原任务不读取关系存档');
  for (const invalidState of ['version_zero', 'bad_receipt']) {
    const p = new Progress();
    if (invalidState === 'version_zero') p.relationshipState.version = 0;
    else p.relationshipState.appliedAffinitySources = ['invalid'];
    const before = snapshot(p), beforeWrites = writes;
    eq(stageQuestAffinityCompletion(enabled, 'q_fox', p), true, '坏关系状态不阻挡无好感来源的任务');
    eq(snapshot(p), before, '无来源任务不改坏关系状态');
    eq(stageQuestAffinityCompletion(enabled, 'q_awaken', p), false, '有好感来源任务对坏关系状态继续 fail-closed');
    eq(snapshot(p), before, '有来源拒绝不留下半状态'); eq(writes, beforeWrites, '关系检查不额外写盘');
  }
  function readyQuest(affinityCfg = enabled, hooksCfg = hooksClosed) {
    const p = new Progress(), quest = new QuestSystem(p, () => 10_000_000, affinityCfg, hooksCfg);
    p.quests.q_awaken = { state: 'active', kills: {}, reached: true };
    return { p, quest };
  }
  {
    const { p, quest } = readyQuest(), beforeWrites = writes;
    ok(quest.turnIn('q_awaken'), '真实 QuestSystem 首次交付成功');
    eq(p.quests.q_awaken.state, 'done', '交付成为 done'); eq(p.affinity.village_elder, 40, '真实任务来源加 40');
    same(p.relationshipState.appliedAffinitySources, ['village_elder|quest|q_awaken'], '真实交付标准收据');
    eq(writes, beforeWrites + 1, '任务奖励、done、好感同一事务写盘');
    const after = snapshot(p); eq(quest.turnIn('q_awaken'), undefined, '已完成任务不能再次提交'); eq(snapshot(p), after, '重交不二次发好感');
  }
  for (const choiceId of ['return', 'keep'] as const) {
    const { p, quest } = readyQuest(enabled, hooksOpen), beforeWrites = writes;
    ok(quest.turnIn('q_awaken', false, choiceId)?.settled, `${choiceId} 开态显式选择交付成功`);
    eq(p.quests.q_awaken.state, 'done', `${choiceId} 开态交付成为 done`);
    eq(p.affinity.village_elder, 40, `${choiceId} 与正魔共存仍加好感 40`);
    same(p.relationshipState.appliedAffinitySources, ['village_elder|quest|q_awaken'], `${choiceId} 好感标准收据只一条`);
    eq(writes, beforeWrites + 1, `${choiceId} 交付与好感同一事务仅写盘一次`);
    const persisted = JSON.parse(disk[saveKey]);
    eq(persisted.affinity.village_elder, 40, `${choiceId} 好感值确实落盘`);
    same(persisted.relationshipState.appliedAffinitySources, ['village_elder|quest|q_awaken'], `${choiceId} 好感收据确实落盘`);
    const after = snapshot(p);
    for (const repeated of ['return', 'keep'] as const) {
      eq(quest.turnIn('q_awaken', false, repeated), undefined, `${choiceId} 后重交 ${repeated} 不重复结算`);
    }
    eq(snapshot(p), after, `${choiceId} 重交不重复发好感或收据`);
    eq(writes, beforeWrites + 1, `${choiceId} 重交不额外写盘`);
  }
  {
    const { p, quest } = readyQuest(closed);
    ok(quest.turnIn('q_awaken'), '关态夹具不阻挡旧任务交付');
    same(p.affinity, {}, '关态来源不初始化好感');
    same(p.relationshipState.pendingAffinitySources, [{ sourceId: 'village_elder|quest|q_awaken', npc: 'village_elder', quest: 'q_awaken' }], '关态来源记录标准待消费项');
    same(p.relationshipState.appliedAffinitySources, [], '关态不伪标已应用');
    const pending = snapshot(p);
    details(consumeQuestAffinitySources(closed, p), 'consumed', '关态夹具消费者可安全检查');
    eq(snapshot(p), pending, '仍关态保持 pending 原样');
    eq(details(consumeQuestAffinitySources(enabled, p), 'consumed', '开态消费真实任务 pending').count, 1, '消费一条');
    eq(p.affinity.village_elder, 40, '开态只补 pending 40'); same(p.relationshipState.pendingAffinitySources, [], '成功清除任务 pending');
    const after = snapshot(p); eq(details(consumeQuestAffinitySources(enabled, p), 'consumed', '再次消费任务 pending').count, 0, '第二次无来源'); eq(snapshot(p), after, '任务消费一次');
  }
  for (const throws of [false, true]) {
    const { p, quest } = readyQuest(); p.save(); const before = snapshot(p), beforeDisk = disk[saveKey]; failSave(p, throws);
    eq(quest.turnIn('q_awaken'), undefined, '任务事务写盘失败不报成功');
    eq(snapshot(p), before, '失败回滚 done、常规奖励、好感与收据'); eq(disk[saveKey], beforeDisk, '任务失败原盘完整');
    restoreSave(p); ok(quest.turnIn('q_awaken'), '失败任务可再次提交'); eq(p.affinity.village_elder, 40, '重试任务好感一次');
    const queued = readyQuest(closed); ok(queued.quest.turnIn('q_awaken'), '准备待消费任务');
    const pending = snapshot(queued.p); failSave(queued.p, throws);
    details(consumeQuestAffinitySources(enabled, queued.p), 'rejected', '任务 pending 保存失败拒绝');
    eq(snapshot(queued.p), pending, '任务 pending 保存失败保留来源且不加值'); restoreSave(queued.p);
    eq(details(consumeQuestAffinitySources(enabled, queued.p), 'consumed', '任务 pending 保存失败后可重试').count, 1, '重试消费一条');
  }
  {
    const candidate = clone();
    for (const npc of candidate) if (['village_elder', 'grocer_wang'].includes(npc.id)) npc.affinity.enabled = true;
    const twoEnabled = parseAffinityIndex(candidate).config; ok(twoEnabled, '两个 NPC 开态 fixture 可用');
    const p = new Progress(); p.relationshipState.pendingAffinitySources = [
      { sourceId: 'village_elder|quest|q_awaken', npc: 'village_elder', quest: 'q_awaken' },
      { sourceId: 'grocer_wang|quest|q_bamboo', npc: 'grocer_wang', quest: 'q_bamboo' },
    ];
    const before = snapshot(p), beforeDisk = disk[saveKey]; let saveCalls = 0;
    Object.defineProperty(p, 'save', { configurable: true, value: () => { saveCalls++; return false; } });
    details(consumeQuestAffinitySources(twoEnabled, p), 'rejected', '整批任务 pending 写盘失败拒绝');
    eq(saveCalls, 1, '整批 pending 只有一个提交点'); eq(snapshot(p), before, '两个 NPC 的值、收据与队列整批回滚'); eq(disk[saveKey], beforeDisk, '批量失败原盘不改');
    restoreSave(p); const beforeWrites = writes;
    eq(details(consumeQuestAffinitySources(twoEnabled, p), 'consumed', '整批 pending 可重试').count, 2, '两个来源整批消费');
    eq(writes, beforeWrites + 1, '两个来源共用一次原子保存');
    same(p.affinity, { village_elder: 40, grocer_wang: 30 }, '两个 NPC 的独立增量正确');
    same(p.relationshipState.pendingAffinitySources, [], '整批成功一起清队列');
  }
  {
    const legacy = new Progress().exportSave(); delete legacy.affinity; delete legacy.relationshipState;
    legacy.quests = { q_awaken: { state: 'done', kills: {} } }; disk[saveKey] = JSON.stringify(legacy);
    const p = Progress.load(); new QuestSystem(p, () => 10_000_000, enabled, hooksClosed);
    eq(details(consumeQuestAffinitySources(enabled, p), 'consumed', '旧档完成历史不扫描').count, 0, '旧档缺来源不补发');
    same(p.affinity, {}, '旧档好感仅迁移空结构'); same(p.relationshipState.pendingAffinitySources, [], '不猜测旧任务来源');
  }

  // 真实奇遇 producer 只排队；消费方只读取既有 pendingHooks，不再计算配置来源。
  const encounterRaw = structuredClone(encountersRaw); encounterRaw.encounters.find(row => row.id === 'enc_stranded_cultivator')!.enabled = true;
  const encounterConfig = parseEncountersConfig(encounterRaw).config; ok(encounterConfig, '救援奇遇开态 fixture 可用');
  function pendingEncounter(mixed = false) {
    const p = new Progress();
    const produced = details(settleEncounterOutcome(encounterConfig, 'enc_stranded_cultivator', 'rescued', p.encounterSave(), {
      attemptId: 'affinity-rescue:1', nowMs: 10_000_000, karmaReady: !mixed,
    }), 'settled', '真实奇遇 producer 成功');
    ok(p.commitEncounterSave(produced.save), '真实奇遇结果提交 Progress');
    same(p.affinity, {}, 'producer 不提前加好感'); eq(p.encounters!.pendingHooks!.length, 1, 'producer 仅排一条 pending');
    same(p.encounters!.pendingHooks![0].payload.affinity, [{ npc: 'enc_wanderer', delta: 2 }], 'producer 队列增量为真表 +2');
    return p;
  }
  {
    const p = pendingEncounter(), pending = snapshot(p), beforeWrites = writes;
    eq(details(consumeEncounterAffinityHooks(closed, p), 'consumed', '关态夹具不消费奇遇').count, 0, '关态消费数量零');
    eq(snapshot(p), pending, '对应 NPC 未启用保留整个队列');
    eq(writes, beforeWrites, '没有就绪消费者不写盘');
    eq(details(consumeEncounterAffinityHooks(wandererEnabled, p), 'consumed', 'NPC 开态消费既有好感').count, 1, '只消费一个好感动作');
    eq(p.affinity.enc_wanderer, 2, '真实 pending +2 仅到账一次'); same(p.encounters!.pendingHooks, [], '成功清理空 payload 队列项');
    ok(p.encounters!.hooksApplied!.includes('enc_stranded_cultivator'), '全部 hooks 消费后标已应用');
    const after = snapshot(p); eq(details(consumeEncounterAffinityHooks(wandererEnabled, p), 'consumed', '重复消费奇遇').count, 0, '无重复奇遇动作'); eq(snapshot(p), after, '不双加奇遇好感');
  }
  {
    const p = pendingEncounter(true), karma = p.encounters!.pendingHooks![0].payload.karma;
    eq(details(consumeEncounterAffinityHooks(wandererEnabled, p), 'consumed', '混合 payload 可消费 affinity').count, 1, '混合项仅消费好感');
    eq(p.affinity.enc_wanderer, 2, '混合项加值一次');
    same(p.encounters!.pendingHooks![0].payload, { karma }, '消费 affinity 后保留其它 hooks');
    eq(p.encounters!.hooksApplied!.includes('enc_stranded_cultivator'), false, '仍有其它 hooks 不标整项完成');
    const after = snapshot(p), beforeWrites = writes; eq(details(consumeEncounterAffinityHooks(wandererEnabled, p), 'consumed', '混合项重复消费').count, 0, '混合项不二次加值'); eq(snapshot(p), after, '剩余 payload 完整保留'); eq(writes, beforeWrites, '只有其它 hooks 时不空写盘');
  }
  {
    const p = pendingEncounter(true), state = p.encounters!, firstPending = state.pendingHooks![0];
    p.encounters = { ...state, pendingHooks: [firstPending, structuredClone(firstPending)] };
    const before = snapshot(p), beforeWrites = writes;
    details(consumeEncounterAffinityHooks(wandererEnabled, p), 'rejected', '重复 encounter pending 身份拒绝');
    eq(snapshot(p), before, '恶意重复 pending 保留原队列且不变成 +4'); eq(writes, beforeWrites, '重复 pending 不写盘');
  }
  for (const throws of [false, true]) {
    const p = pendingEncounter(), before = snapshot(p), beforeDisk = disk[saveKey]; failSave(p, throws);
    details(consumeEncounterAffinityHooks(wandererEnabled, p), 'rejected', '奇遇消费写盘失败拒绝');
    eq(snapshot(p), before, '奇遇消费失败保留队列、不加值'); eq(disk[saveKey], beforeDisk, '奇遇消费失败不改盘');
    restoreSave(p); eq(details(consumeEncounterAffinityHooks(wandererEnabled, p), 'consumed', '奇遇消费可重试').count, 1, '重试只消费一次'); eq(p.affinity.enc_wanderer, 2, '重试仅加 +2');
  }

  {
    const p = new Progress(); p.affinity.village_elder = 299; const before = snapshot(p);
    details(claimAffinityUnlock(enabled, 'village_elder', 'confidant_gift', p), 'rejected', '未达知己档不可领取'); eq(snapshot(p), before, '未达档不发礼不标已领');
    p.affinity.village_elder = 300;
    const beforeWrites = writes, inventoryBefore = p.permanentCount('hp_pill_small');
    const claimed = details(claimAffinityUnlock(enabled, 'village_elder', 'confidant_gift', p), 'claimed', '达到档位领取解锁奖励');
    eq(p.permanentCount('hp_pill_small'), inventoryBefore + 1, '礼物到账常规背包');
    same(p.relationshipState.claimedAffinityRewards, ['village_elder|confidant_gift'], '标准领取收据'); eq(writes, beforeWrites + 1, '背包和收据同一保存');
    ok(Object.isFrozen(claimed), '领取结果冻结');
    const after = snapshot(p); details(claimAffinityUnlock(enabled, 'village_elder', 'confidant_gift', p), 'duplicate', 'once 奖励拒绝重复领取'); eq(snapshot(p), after, '重复领取不发礼');
    details(claimAffinityUnlock(enabled, 'village_elder', 'unknown', p), 'rejected', '缺失解锁可诊断');
  }
  for (const mode of ['capacity', 'noop', 'false_after_add', 'throw_after_add', 'save_false', 'save_throw'] as const) {
    const p = new Progress(); p.affinity.village_elder = 300; p.save(); const before = snapshot(p), beforeDisk = disk[saveKey];
    if (mode === 'noop') Object.defineProperty(p, 'addItem', { configurable: true, value: () => {} });
    if (mode === 'capacity') Object.defineProperty(p, 'canAddCraftedItem', { configurable: true, value: () => false });
    if (mode === 'false_after_add') Object.defineProperty(p, 'addItem', { configurable: true, value: (id: string, n: number) => { p.inventory[id] = (p.inventory[id] ?? 0) + n; return false; } });
    if (mode === 'throw_after_add') Object.defineProperty(p, 'addItem', { configurable: true, value: (id: string, n: number) => { p.inventory[id] = (p.inventory[id] ?? 0) + n; throw new Error('fixture bag failed'); } });
    if (mode.startsWith('save_')) failSave(p, mode === 'save_throw');
    details(claimAffinityUnlock(enabled, 'village_elder', 'confidant_gift', p), 'rejected', `领取 ${mode} 拒绝`);
    eq(snapshot(p), before, `${mode} 不吞礼、不标收据、不留下半背包`); eq(disk[saveKey], beforeDisk, `${mode} 原盘不变`);
    Reflect.deleteProperty(p, 'addItem'); Reflect.deleteProperty(p, 'canAddCraftedItem'); restoreSave(p);
    details(claimAffinityUnlock(enabled, 'village_elder', 'confidant_gift', p), 'claimed', `${mode} 失败后可以重试`);
    eq(p.permanentCount('hp_pill_small'), 1, `${mode} 重试仅一份礼`); same(p.relationshipState.claimedAffinityRewards, ['village_elder|confidant_gift'], `${mode} 重试仅一份收据`);
  }
  same(claimAffinityUnlock(closed, 'village_elder', 'unknown', poison as any), { status: 'rejected', reason: 'disabled' }, '关态夹具领取先于解锁参数和 poison 存档');
  same(claimAffinityUnlock(null, 'village_elder', 'confidant_gift', poison as any), { status: 'rejected', reason: 'invalid' }, '坏表不读取领取存档');
  same(claimAffinityUnlock(enabled, 'missing', 'confidant_gift', poison as any), { status: 'rejected', reason: 'missing' }, '缺 NPC 不读取领取存档');
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

for (const field of ['enabled', 'min', 'max', 'initial', 'tiers', 'sources', 'gifts', 'unlocks', 'balanceTodo']) {
  bad(`缺 ${field}`, raw => { delete first(raw).affinity[field]; });
}
for (const [label, mutate] of [
  ['affinity 非对象', (raw: MutableNpc[]) => { first(raw).affinity = null; }],
  ['NPC id 缺失', (raw: MutableNpc[]) => { delete first(raw).id; }],
  ['NPC id 重复', (raw: MutableNpc[]) => { raw.push(structuredClone(first(raw))); }],
  ['NPC id 原型键', (raw: MutableNpc[]) => { first(raw).id = '__proto__'; }],
  ['NPC id 构造器键', (raw: MutableNpc[]) => { first(raw).id = 'constructor'; }],
  ['根门禁非 boolean', (raw: MutableNpc[]) => { first(raw).affinity.enabled = 'false'; }],
  ['范围含 null', (raw: MutableNpc[]) => { first(raw).affinity.min = null; }],
  ['范围颠倒', (raw: MutableNpc[]) => { first(raw).affinity.max = -1; }],
  ['初值越界', (raw: MutableNpc[]) => { first(raw).affinity.initial = 1001; }],
  ['小数初值', (raw: MutableNpc[]) => { first(raw).affinity.initial = 0.5; }],
  ['档位空', (raw: MutableNpc[]) => { first(raw).affinity.tiers = []; }],
  ['档位稀疏', (raw: MutableNpc[]) => { delete first(raw).affinity.tiers[0]; }],
  ['档位重复', (raw: MutableNpc[]) => { first(raw).affinity.tiers[1].id = 'stranger'; }],
  ['档位阈值非单调', (raw: MutableNpc[]) => { first(raw).affinity.tiers[1].min = 0; }],
  ['档位缺对白', (raw: MutableNpc[]) => { delete first(raw).affinity.tiers[0].dialogKey; }],
  ['来源稀疏', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0]; }],
  ['来源类型缺失', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0].type; }],
  ['任务增量非法', (raw: MutableNpc[]) => { first(raw).affinity.sources[0].delta = Infinity; }],
  ['任务来源缺收据门禁', (raw: MutableNpc[]) => { delete first(raw).affinity.sources[0].once; }],
  ['奇遇结局缺失', (raw: MutableNpc[]) => { delete raw.find(npc => npc.id === 'enc_wanderer')!.affinity.sources[0].outcomes; }],
  ['送礼门禁非法', (raw: MutableNpc[]) => { first(raw).affinity.gifts.enabled = null; }],
  ['解锁引用未知档位', (raw: MutableNpc[]) => { first(raw).affinity.unlocks[0].tier = 'unknown'; }],
  ['解锁物品数量空', (raw: MutableNpc[]) => { first(raw).affinity.unlocks[0].items[0].count = null; }],
] as const) bad(label, mutate);
for (const value of [null, undefined, {}, 'npcs', true]) eq(parseAffinityIndex(value).config, null, '非数组拒绝');
const endEntries = Object.values(parseAffinityIndex(npcsRaw).config!);
eq(endEntries.filter(entry => entry.gifts.enabled).length, 0, '测试未开启正式送礼门禁');
const endEnabled = endEntries.filter(entry => entry.enabled).length;
ok(endEnabled === 0 || endEnabled === 9, '正式表根门禁旁证只允许 0 或 9');
eq(endEnabled, formalEnabledCount, '测试未改变正式表根门禁');
if (endEnabled === 9) eq(endEnabled, 9, 'tip 开态 9 true');
else eq(endEnabled, 0, '未翻表旁证仍 0');
console.log(`affinity tests ok: ${assertions} assertions (dual-state preamble; questHooks closed fixture + open explicit choices; fixture initialization/delta/tiers, quest and encounter once, unlock rollback)`);
