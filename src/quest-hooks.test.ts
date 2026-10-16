import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { MORAL_STATE, QUEST_HOOKS, QUEST_HOOKS_ERRORS } from './data';
import { parseQuestHooks, previewQuestHook, settleQuestHook } from './QuestHooks';
import { MORAL_VERSION, Progress } from './Progress';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
function details(result: unknown, status: string, message: string): Mutable {
  eq((result as Mutable).status, status, message);
  return result as Mutable;
}
function reason(result: unknown) { return (result as Mutable).reason; }
function frozen(value: unknown): boolean {
  return !value || typeof value !== 'object'
    || Object.isFrozen(value) && Object.values(value).every(frozen);
}
function fixture(hookId = 'prologue_medicine', mutate?: (raw: Mutable) => void) {
  const raw = structuredClone(karmaFlagsRaw);
  for (const hook of raw.questHooks) hook.enabled = hook.id === hookId;
  mutate?.(raw);
  const parsed = parseQuestHooks(raw);
  eq(parsed.errors.length, 0, `${hookId} 开态 fixture 无坏表`);
  ok(parsed.config, `${hookId} 内存开态克隆可校验`);
  eq(parsed.config.questHooks.filter(hook => hook.enabled).length, 1, '仅打开目标 hook');
  return parsed.config;
}
function snapshot(p: Progress) { return JSON.stringify(p.exportSave()); }
function bad(label: string, mutate: (raw: Mutable) => void) {
  const raw = structuredClone(karmaFlagsRaw); mutate(raw);
  const result = parseQuestHooks(raw);
  eq(result.config, null, `坏表拒绝：${label}`); ok(result.errors.length, `保留诊断：${label}`);
  ok(result.errors.every(error => error.startsWith('karma_flags.json $')), `诊断含表名和路径：${label}`);
}

eq(QUEST_HOOKS_ERRORS.length, 0, 'data.ts 导出真表无错误'); ok(QUEST_HOOKS, 'data.ts 导出只读选择索引');
const config = QUEST_HOOKS;
eq(config.questHooks.length, 2, '本期两个选择已加载');
same(config.questHooks.map(hook => hook.id), ['prologue_medicine', 'sect_tianjian_sword'], '两题身份正确');
const formalEnabledCount = config.questHooks.filter(hook => hook.enabled).length;
if (formalEnabledCount === 2) {
  eq(formalEnabledCount, 2, 'tip 开态：正式表 questHooks.enabled===true 共 2');
} else if (formalEnabledCount === 0) {
  eq(formalEnabledCount, 0, '未翻表时根门禁仍全 false');
} else {
  eq(formalEnabledCount, 2, '正式表根门禁只允许全关或全开，不允许半开');
}
same(MORAL_STATE, karmaFlagsRaw.rules.moralState, '仍复用既有两轴配置');
const checked = parseQuestHooks(karmaFlagsRaw);
ok(checked.config, '真表通过独立解析'); eq(checked.errors.length, 0, '没有被忽略的错误');
ok(Object.isFrozen(config) && Object.isFrozen(config.questHooks) && Object.isFrozen(config.questHooks[0].choices[0].hooks.karma[0]), '配置深冻结');
ok(Object.isFrozen(checked) && Object.isFrozen(checked.errors), '校验结果及错误只读');
const mutableRaw = structuredClone(karmaFlagsRaw), independent = parseQuestHooks(mutableRaw).config;
ok(independent, '可建立独立快照'); eq(Object.isFrozen(mutableRaw.questHooks[0]), false, '不冻结调用方');
mutableRaw.questHooks[0].choices[0].hooks.moralityDelta = 99;
eq(independent.questHooks[0].choices[0].hooks.moralityDelta, 1, '调用方变更不改变快照');

const disabledRaw = structuredClone(karmaFlagsRaw);
for (const hook of disabledRaw.questHooks) hook.enabled = false;
const disabledParsed = parseQuestHooks(disabledRaw);
eq(disabledParsed.errors.length, 0, '关态夹具通过真实表校验');
ok(disabledParsed.config, '关态夹具有可用配置');
const closed = disabledParsed.config;
eq(closed.questHooks.length, 2, '关态夹具保留两题');
eq(closed.questHooks.filter(hook => hook.enabled).length, 0, '关态夹具两题全 false');

const state = { daoHeart: MORAL_STATE.daoHeart.initial, morality: MORAL_STATE.morality.initial, karmaFlags: {} };
const before = JSON.stringify(state);
const poison = new Proxy({}, { get() { throw new Error('关态不得读取状态'); }, set() { throw new Error('不得写入状态'); } });
for (const hook of closed.questHooks) {
  eq(hook.enabled, false, '关态夹具两题 enabled 全 false');
  for (const choice of hook.choices) {
    same(previewQuestHook(closed, hook.id, choice.id, state), { status: 'unavailable', reason: 'disabled' }, '关态夹具不弹选择');
    same(settleQuestHook(closed, hook.id, choice.id, state), { status: 'rejected', reason: 'disabled' }, '关态夹具拒绝结算');
    eq(reason(previewQuestHook(closed, hook.id, choice.id, poison)), 'disabled', '关态夹具预览不读状态');
    eq(reason(settleQuestHook(closed, hook.id, choice.id, poison)), 'disabled', '关态夹具结算不读写状态');
  }
  eq(reason(settleQuestHook(closed, hook.id, 'unknown', poison)), 'disabled', '关态夹具在选项查找前短路');
  eq(reason(previewQuestHook(closed, hook.id, 'unknown', poison)), 'disabled', '关态夹具预览也先于选项查找和状态读取');
}
eq(JSON.stringify(state), before, '两轴和 karmaFlags 无变化');
same(previewQuestHook(null, 'prologue_medicine', 'return', poison), { status: 'unavailable', reason: 'invalid' }, '坏表无预览');
same(settleQuestHook(null, 'prologue_medicine', 'return', poison), { status: 'rejected', reason: 'invalid' }, '坏表无结算');
eq(reason(previewQuestHook(config, 'missing', 'return')), 'missing', '缺题目可诊断');
eq(reason(settleQuestHook(config, 'missing', 'return')), 'missing', '缺题目拒绝结算');
const enabled = fixture();
eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'unknown')), 'missing', '开态可诊断缺选项');
eq(reason(previewQuestHook(enabled, 'prologue_medicine', 'unknown', poison)), 'missing', '缺选项先于状态读取');
eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'unknown', poison)), 'missing', '结算缺选项先于状态读取');
ok(Object.isFrozen(settleQuestHook(closed, 'prologue_medicine', 'return')), '查询结果只读');

const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const saveKey = 'xiantu_save_v1', disk: Record<string, string> = {};
let writes = 0, failStorage = false;
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk[key] ?? null,
    setItem: (key: string, value: string) => {
      if (failStorage) throw new Error('fixture localStorage failed');
      writes++; disk[key] = value;
    },
    removeItem: (key: string) => { delete disk[key]; },
  } });

  // 开态夹具仅在内存启用目标题；四个正式选项都用真实 Progress 完成预览、保存和重放检查。
  for (const originalHook of config.questHooks) {
    const open = fixture(originalHook.id), hook = open.questHooks.find(row => row.id === originalHook.id)!;
    for (const choice of hook.choices) {
      const p = new Progress();
      p.quests[hook.quest] = { state: 'active', kills: {}, reached: true };
      p.karmaFlags = { enc_sage_enlightened: true };
      const before = snapshot(p), beforeWrites = writes;
      const daoDelta = choice.hooks.daoHeartDelta ?? 0, moralDelta = choice.hooks.moralityDelta ?? 0;
      const expectedDao = { before: p.daoHeart, after: p.daoHeart + daoDelta, delta: daoDelta, clamped: false };
      const expectedMorality = { before: p.morality, after: p.morality + moralDelta, delta: moralDelta, clamped: false };
      const preview = details(previewQuestHook(open, hook.id, choice.id, p), 'preview', `${hook.id}/${choice.id} 可预览`);
      same(preview.daoHeart, expectedDao, '预览道心独立计算');
      same(preview.morality, expectedMorality, '预览善恶独立计算');
      same(preview.karma, choice.hooks.karma, '预览明确列出置 true 的因果');
      same(preview.resultTextKeys, choice.resultTextKeys, '预览保留结果文案 keys');
      eq(preview.questId, hook.quest, '预览任务身份使用 quest 字段');
      eq(preview.choiceId, choice.id, '预览选项身份正确'); eq(preview.textKey, choice.textKey, '预览选择文案 key');
      ok(frozen(preview), '预览的两轴、因果、结果文案深冻结');
      eq(snapshot(p), before, '开态预览不改 Progress'); eq(writes, beforeWrites, '开态预览不保存');
      const flat = structuredClone(p.exportSave()), flatBefore = JSON.stringify(flat);
      const flatPreview = details(previewQuestHook(open, hook.id, choice.id, flat), 'preview', '只读快照也可预览');
      same(flatPreview.daoHeart, preview.daoHeart, '快照与 Progress 道心预览一致');
      same(flatPreview.morality, preview.morality, '快照与 Progress 善恶预览一致');
      eq(JSON.stringify(flat), flatBefore, '快照预览无副作用');
      eq(reason(settleQuestHook(open, hook.id, choice.id, flat)), 'needs_progress', '没有 Progress 事务不伪造持久化成功');
      eq(JSON.stringify(flat), flatBefore, '拒绝普通快照结算不改快照');

      const applied = details(settleQuestHook(open, hook.id, choice.id, p), 'applied', `${hook.id}/${choice.id} 真实事务结算`);
      same(applied.daoHeart, preview.daoHeart, '结算道心与预览一致');
      same(applied.morality, preview.morality, '结算善恶与预览一致');
      same(applied.karma, preview.karma, '结算因果与预览一致');
      same(applied.resultTextKeys, preview.resultTextKeys, '保存成功后提供结果文案');
      eq(applied.questId, hook.quest, '结算保留任务身份'); eq(applied.choiceId, choice.id, '结算保留选项身份');
      eq(applied.questChoice, choice.id, '结算返回保存的选择'); eq(applied.appliedQuestId, hook.quest, '收据按 quest id 返回');
      eq(p.daoHeart, expectedDao.after, '道心写入 Progress'); eq(p.morality, expectedMorality.after, '善恶写入 Progress');
      same(p.karmaFlags, { enc_sage_enlightened: true, ...Object.fromEntries(choice.hooks.karma.map(action => [action.flag, true])) }, '置因果并保留其他历史');
      same(p.relationshipState.questChoices, { [hook.quest]: choice.id }, 'questChoices 使用 quest id，不用 hook id');
      same(p.relationshipState.appliedQuestHooks, [hook.quest], 'once 收据使用 quest id，不用 choice 或 hook id');
      eq(writes, beforeWrites + 1, '两轴、因果、选择和收据只保存一次');
      const persisted = JSON.parse(disk[saveKey]);
      eq(persisted.daoHeart, expectedDao.after, '道心确实落盘'); eq(persisted.morality, expectedMorality.after, '善恶确实落盘');
      same(persisted.karmaFlags, p.karmaFlags, '因果和两轴同次落盘');
      same(persisted.relationshipState.questChoices, p.relationshipState.questChoices, '选择同次落盘');
      same(persisted.relationshipState.appliedQuestHooks, [hook.quest], '整题收据同次落盘');
      ok(frozen(applied), '成功结果深冻结');
      ok(!Object.isFrozen(p) && !Object.isFrozen(p.karmaFlags) && !Object.isFrozen(p.relationshipState)
        && !Object.isFrozen(p.relationshipState.questChoices) && !Object.isFrozen(p.relationshipState.appliedQuestHooks), '返回结果不冻结调用方状态');
      const after = snapshot(p), afterWrites = writes;
      for (const replay of hook.choices) {
        eq(reason(previewQuestHook(open, hook.id, replay.id, p)), 'already_applied', '已收据整题不再预览');
        same(settleQuestHook(open, hook.id, replay.id, p), { status: 'duplicate', questId: hook.quest }, '相同或另一选项都按整题 duplicate');
      }
      eq(snapshot(p), after, '重复/互换选项不改两轴、因果或选择'); eq(writes, afterWrites, '重复结算不写盘');
    }
  }

  // 默认无 karmaFlags 容器也能在同一事务中建立，旧 moralVersion 按既有 Progress 路径迁移。
  for (const legacyVersion of [undefined, 0]) {
    const p = new Progress();
    if (legacyVersion === undefined) Reflect.deleteProperty(p, 'moralVersion'); else p.moralVersion = legacyVersion;
    const before = snapshot(p), beforeWrites = writes;
    eq(p.karmaFlags, undefined, '新 Progress 不预先建因果对象');
    details(previewQuestHook(enabled, 'prologue_medicine', 'return', p), 'preview', '版本缺失/旧版本不伪装 moral 未就绪');
    eq(snapshot(p), before, '版本预览不迁移、不建因果'); eq(writes, beforeWrites, '版本预览不写盘');
    details(settleQuestHook(enabled, 'prologue_medicine', 'return', p), 'applied', '缺因果对象和旧版本可真实结算');
    same(p.karmaFlags, { prologue_medicine_returned: true }, '事务内创建因果容器');
    eq(p.moralVersion, MORAL_VERSION, '事务沿 Progress 规范化旧 moralVersion');
    eq(writes, beforeWrites + 1, '版本迁移与效果只保存一次');
  }

  for (const [hookId, choiceId, axis, value, expected] of [
    ['prologue_medicine', 'return', 'morality', MORAL_STATE.morality.max, MORAL_STATE.morality.max],
    ['prologue_medicine', 'keep', 'morality', MORAL_STATE.morality.min, MORAL_STATE.morality.min],
    ['sect_tianjian_sword', 'seek_dao', 'daoHeart', MORAL_STATE.daoHeart.max, MORAL_STATE.daoHeart.max],
    ['sect_tianjian_sword', 'seek_dao', 'daoHeart', MORAL_STATE.daoHeart.min, MORAL_STATE.daoHeart.min + 1],
  ] as const) {
    const open = fixture(hookId), p = new Progress(); p[axis] = value;
    const before = snapshot(p), preview = details(previewQuestHook(open, hookId, choiceId, p), 'preview', '正式选项边界预览');
    eq(preview[axis].before, value, '边界预览保留实际旧值'); eq(preview[axis].after, expected, '边界按 MORAL_STATE 裁剪');
    eq(preview[axis].clamped, expected === value, '边界预览明确是否裁剪'); eq(snapshot(p), before, '边界预览无副作用');
    const result = details(settleQuestHook(open, hookId, choiceId, p), 'applied', '边界仍可选择并消耗资格');
    eq(result[axis].after, expected, '边界结算与预览一致'); eq(p[axis], expected, '边界值落盘');
    eq(p.relationshipState.appliedQuestHooks.length, 1, '即便实际增量为零仍有 once 收据');
    eq(Object.values(p.karmaFlags!)[0], true, '边界仍保存选择因果');
  }
  // 大额安全整数配置比较剩余空间后再求和，覆盖两轴顶/底和有符号 delta。
  for (const axis of ['daoHeart', 'morality'] as const) for (const delta of [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER]) {
    const open = fixture('prologue_medicine', raw => { raw.questHooks[0].choices[0].hooks[`${axis}Delta`] = delta; });
    const p = new Progress(), expected = delta > 0 ? MORAL_STATE[axis].max : MORAL_STATE[axis].min;
    const before = snapshot(p), beforeWrites = writes;
    const preview = details(previewQuestHook(open, 'prologue_medicine', 'return', p), 'preview', '极值安全整数增量可预览');
    eq(preview[axis].after, expected, '极值安全整数正确裁剪'); eq(preview[axis].delta, delta, '预览保留配置增量');
    eq(preview[axis].clamped, true, '极值标记裁剪'); eq(snapshot(p), before, '极值预览不写状态'); eq(writes, beforeWrites, '极值预览不写盘');
    const result = details(settleQuestHook(open, 'prologue_medicine', 'return', p), 'applied', '极值安全整数增量可结算');
    eq(result[axis].after, expected, '极值结算无溢出'); eq(p[axis], expected, '极值裁剪结果落盘');
  }

  for (const axis of ['daoHeart', 'morality'] as const) for (const [value, delta] of [
    [Number.MAX_SAFE_INTEGER, -Number.MAX_SAFE_INTEGER],
    [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  ]) {
    const open = fixture('prologue_medicine', raw => { raw.questHooks[0].choices[0].hooks[`${axis}Delta`] = delta; });
    const p = new Progress(); p[axis] = value;
    const before = snapshot(p), beforeWrites = writes;
    const preview = details(previewQuestHook(open, 'prologue_medicine', 'return', p), 'preview', '安全整数越界旧值按旧值加增量后裁剪');
    eq(preview[axis].before, value, '越界预览保留原始旧值'); eq(preview[axis].after, 0, '相反极值增量抵消后为零');
    eq(preview[axis].clamped, false, '抵消至合法值不标裁剪');
    eq(snapshot(p), before, '越界旧值预览不先修复或保存'); eq(writes, beforeWrites, '越界旧值预览不写盘');
    const applied = details(settleQuestHook(open, 'prologue_medicine', 'return', p), 'applied', '越界旧值可在事务中安全抵消');
    eq(applied[axis].after, 0, '越界旧值结算与预览一致'); eq(p[axis], 0, '抵消结果实际落盘');
  }

  for (const mutate of [
    (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma[0].flag = 'unregistered_flag'; },
    (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma[0].flag = 'prologue_medicine_kept'; },
    (raw: Mutable) => { raw.questHooks[0].quest = 'q_sect_tianjian'; },
    (raw: Mutable) => { raw.questHooks[0].node = 'sword_purpose'; },
  ]) {
    const open = fixture('prologue_medicine', mutate), p = new Progress();
    const before = snapshot(p), beforeWrites = writes;
    same(previewQuestHook(open, 'prologue_medicine', 'return', p), { status: 'unavailable', reason: 'invalid' }, '解析通过不授权未登记 flag 或错误 writer');
    same(settleQuestHook(open, 'prologue_medicine', 'return', p), { status: 'rejected', reason: 'invalid' }, '未登记 flag/越权 writer 不进入保存事务');
    eq(reason(previewQuestHook(open, 'prologue_medicine', 'return', poison)), 'invalid', 'writer 校验先于读取状态');
    eq(reason(settleQuestHook(open, 'prologue_medicine', 'return', poison)), 'invalid', '结算 writer 校验先于读取状态');
    eq(snapshot(p), before, '错误 writer 不改两轴、因果、选择或收据'); eq(writes, beforeWrites, '错误 writer 不写盘');
  }
  {
    const open = fixture('prologue_medicine', raw => { raw.questHooks[0].featuresAll.push('pending_feature'); });
    const p = new Progress(), before = snapshot(p), beforeWrites = writes;
    same(previewQuestHook(open, 'prologue_medicine', 'return', p), { status: 'unavailable', reason: 'not_ready' }, '未知功能依赖不提供选择');
    same(settleQuestHook(open, 'prologue_medicine', 'return', p), { status: 'rejected', reason: 'not_ready' }, '未知功能依赖不假造就绪');
    eq(snapshot(p), before, '未知功能依赖不改状态'); eq(writes, beforeWrites, '未知功能依赖不写盘');
  }
  for (const value of [null, [], 'quests', { q_awaken: { state: 'unknown' } }, { q_awaken: null }, { q_awaken: false }]) {
    const p = new Progress(); (p as unknown as Mutable).quests = value;
    const before = snapshot(p), beforeWrites = writes;
    same(previewQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'unavailable', reason: 'invalid_save' }, '坏任务容器/任务状态拒绝预览');
    same(settleQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'rejected', reason: 'invalid_save' }, '坏任务容器/任务状态不当作未完成');
    eq(snapshot(p), before, '坏任务状态不被覆盖'); eq(writes, beforeWrites, '坏任务状态不写盘');
  }

  for (const axis of ['daoHeart', 'morality'] as const) for (const value of [undefined, null, '1', NaN, Infinity, -Infinity, 0.5, Number.MAX_SAFE_INTEGER + 1]) {
    const p = new Progress(); (p as unknown as Mutable)[axis] = value;
    const before = snapshot(p), beforeWrites = writes;
    same(previewQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'unavailable', reason: 'not_ready' }, '两轴均须安全整数，未就绪不提供选择');
    same(settleQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'rejected', reason: 'not_ready' }, 'moral 未就绪不假造选择或规范化');
    eq(snapshot(p), before, '未就绪保留原状态'); eq(writes, beforeWrites, '未就绪不写盘');
  }
  for (const mutate of [
    (p: Mutable) => { p.relationshipState = undefined; },
    (p: Mutable) => { p.relationshipState = null; },
    (p: Mutable) => { p.relationshipState.version = 0; },
    (p: Mutable) => { p.relationshipState.appliedQuestHooks = ['q_awaken', 'q_awaken']; },
    (p: Mutable) => { p.relationshipState.questChoices = { q_awaken: 1 }; },
    (p: Mutable) => { p.relationshipState.appliedAffinitySources = ['invalid']; },
  ]) {
    const p = new Progress(); mutate(p);
    const before = snapshot(p), beforeWrites = writes;
    same(previewQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'unavailable', reason: 'invalid_save' }, '坏 relationshipState 不预览');
    same(settleQuestHook(enabled, 'prologue_medicine', 'return', p), { status: 'rejected', reason: 'invalid_save' }, '坏 relationshipState 不清空后重新发放');
    eq(snapshot(p), before, '坏关系状态原样保留'); eq(writes, beforeWrites, '坏关系不写盘');
  }
  for (const value of [null, [], 'flags', { prologue_medicine_returned: 'true' }]) {
    const p = new Progress(); (p as unknown as Mutable).karmaFlags = value;
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(previewQuestHook(enabled, 'prologue_medicine', 'return', p)), 'invalid_save', '坏因果对象不预览');
    eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'return', p)), 'invalid_save', '坏因果对象不覆盖');
    eq(snapshot(p), before, '坏因果状态保留'); eq(writes, beforeWrites, '坏因果不写盘');
  }
  for (const hook of config.questHooks) {
    const open = fixture(hook.id), p = new Progress();
    p.quests[hook.quest] = { state: 'done', kills: {} };
    const before = snapshot(p), beforeWrites = writes;
    for (const choice of hook.choices) {
      eq(reason(previewQuestHook(open, hook.id, choice.id, p)), 'not_retroactive', '已 done 无收据不重问、不提供预览');
      eq(reason(settleQuestHook(open, hook.id, choice.id, p)), 'not_retroactive', '旧完成任务不补发');
    }
    eq(snapshot(p), before, '不可追溯不补两轴、因果、选择或收据'); eq(writes, beforeWrites, '不可追溯不写盘');
  }
  for (const historical of ['flag', 'choice']) {
    const p = new Progress();
    if (historical === 'flag') p.karmaFlags = { prologue_medicine_returned: true };
    else p.relationshipState.questChoices.q_awaken = 'return';
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(previewQuestHook(enabled, 'prologue_medicine', 'return', p)), 'not_retroactive', '已有合法选择历史无收据不推算漏发');
    eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'return', p)), 'not_retroactive', '已有历史不再次补轴');
    eq(snapshot(p), before, '历史事实无收据保持原状'); eq(writes, beforeWrites, '历史事实不写盘');
  }
  {
    const p = new Progress(); p.karmaFlags = { prologue_medicine_returned: true, prologue_medicine_kept: true };
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(previewQuestHook(enabled, 'prologue_medicine', 'return', p)), 'conflict', '互斥因果同时为 true 明确拒绝预览');
    eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'return', p)), 'conflict', '互斥不能通过清另一个 flag 修复');
    eq(snapshot(p), before, '互斥冲突不改历史'); eq(writes, beforeWrites, '互斥冲突不保存');
  }
  {
    const p = new Progress(); p.relationshipState.quarantinedFlags.prologue_medicine_returned = 'bad history';
    const before = snapshot(p), beforeWrites = writes;
    eq(reason(previewQuestHook(enabled, 'prologue_medicine', 'return', p)), 'invalid_save', '本题隔离的坏因果不假造新选择');
    eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'return', p)), 'invalid_save', '隔离历史不覆盖补发');
    eq(snapshot(p), before, '隔离历史保留排查'); eq(writes, beforeWrites, '隔离历史不写盘');
  }

  for (const mode of ['save_false', 'save_throw', 'storage_throw']) {
    const p = new Progress(); p.moralVersion = 0;
    p.addTrialItem('hp_pill_small', 2); p.save();
    const before = snapshot(p), beforeDisk = disk[saveKey], beforeWrites = writes, beforeKeys = Object.keys(p);
    if (mode === 'storage_throw') failStorage = true;
    else Object.defineProperty(p, 'save', { configurable: true, value: () => {
      if (mode === 'save_throw') throw new Error('fixture save failed');
      return false;
    } });
    eq(reason(settleQuestHook(enabled, 'prologue_medicine', 'return', p)), 'save_failed', `${mode} 保存失败可诊断`);
    eq(snapshot(p), before, '保存失败同时回滚两轴、因果、选择、收据和版本迁移');
    eq(p.moralVersion, 0, '保存失败回滚旧 moralVersion'); eq(p.karmaFlags, undefined, '保存失败不遗留新建因果对象');
    eq(p.count('hp_pill_small'), 2, '保存失败保留当前试炼临时背包');
    same(Object.keys(p), beforeKeys, '保存失败不遗留临时字段');
    eq(disk[saveKey], beforeDisk, '保存失败保留原磁盘'); eq(writes, beforeWrites, '失败无成功写盘');
    failStorage = false; if (mode !== 'storage_throw') Reflect.deleteProperty(p, 'save');
    details(settleQuestHook(enabled, 'prologue_medicine', 'return', p), 'applied', `${mode} 失败后能重试`);
    eq(p.morality, MORAL_STATE.morality.initial + 1, '失败重试只加一次善恶');
    same(p.relationshipState.appliedQuestHooks, ['q_awaken'], '失败重试只消耗一次整题资格');
    eq(writes, beforeWrites + 1, '失败重试整笔保存一次');
    same(settleQuestHook(enabled, 'prologue_medicine', 'keep', p), { status: 'duplicate', questId: 'q_awaken' }, '重试后另一选项仍去重');
  }
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}

for (const field of ['questHooks']) bad(`缺 ${field}`, raw => { delete raw[field]; });
for (const field of ['id', 'enabled', 'quest', 'node', 'on', 'speaker', 'textKeys', 'featuresAll', 'choices']) bad(`缺 hook.${field}`, raw => { delete raw.questHooks[0][field]; });
for (const field of ['id', 'textKey', 'resultTextKeys', 'hooks']) bad(`缺 choice.${field}`, raw => { delete raw.questHooks[0].choices[0][field]; });
for (const field of ['oncePerQuest', 'karma']) bad(`缺 hooks.${field}`, raw => { delete raw.questHooks[0].choices[0].hooks[field]; });
for (const [label, mutate] of [
  ['少一题', (raw: Mutable) => { raw.questHooks.pop(); }],
  ['重复题目', (raw: Mutable) => { raw.questHooks[1] = raw.questHooks[0]; }],
  ['稀疏题目', (raw: Mutable) => { delete raw.questHooks[0]; }],
  ['错误门禁', (raw: Mutable) => { raw.questHooks[0].enabled = 'false'; }],
  ['缺功能依赖', (raw: Mutable) => { raw.questHooks[0].featuresAll = []; }],
  ['稀疏文案', (raw: Mutable) => { raw.questHooks[0].textKeys = Array(1); }],
  ['重复选项', (raw: Mutable) => { raw.questHooks[0].choices[1] = raw.questHooks[0].choices[0]; }],
  ['空选项', (raw: Mutable) => { raw.questHooks[0].choices = []; }],
  ['稀疏选项', (raw: Mutable) => { delete raw.questHooks[0].choices[0]; }],
  ['非整道心', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.daoHeartDelta = 0.5; }],
  ['无穷善恶', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.moralityDelta = Infinity; }],
  ['空善恶', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.moralityDelta = null; }],
  ['逐选项重复资格', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.oncePerQuest = false; }],
  ['因果动作非数组', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma = {}; }],
  ['空因果 id', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma[0].flag = ''; }],
  ['因果反转', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma[0].value = false; }],
  ['重复因果动作', (raw: Mutable) => { raw.questHooks[0].choices[0].hooks.karma.push(raw.questHooks[0].choices[0].hooks.karma[0]); }],
] as const) bad(label, mutate);
for (const raw of [null, undefined, [], false, 'questHooks']) {
  const result = parseQuestHooks(raw); eq(result.config, null, '非对象配置拒绝'); ok(result.errors.length, '非对象保留诊断');
}
const endEnabled = parseQuestHooks(karmaFlagsRaw).config!.questHooks.filter(hook => hook.enabled).length;
ok(endEnabled === 0 || endEnabled === 2, '正式表根门禁旁证只允许 0 或 2');
eq(endEnabled, formalEnabledCount, '测试未改变正式表根门禁');
console.log(`quest hooks tests ok: ${assertions} assertions (dual-state preamble; closed-fixture; two hooks, fail-closed schema, disabled short-circuit, enabled preview/settlement, quest once, clamp, no retroactivity, atomic rollback)`);
