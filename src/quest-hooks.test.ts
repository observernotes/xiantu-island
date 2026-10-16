import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { MORAL_STATE, QUEST_HOOKS, QUEST_HOOKS_ERRORS } from './data';
import { parseQuestHooks, previewQuestHook, settleQuestHook } from './QuestHooks';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
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
same(MORAL_STATE, karmaFlagsRaw.rules.moralState, '仍复用既有两轴配置');
const checked = parseQuestHooks(karmaFlagsRaw);
ok(checked.config, '真表通过独立解析'); eq(checked.errors.length, 0, '没有被忽略的错误');
ok(Object.isFrozen(config) && Object.isFrozen(config.questHooks) && Object.isFrozen(config.questHooks[0].choices[0].hooks.karma[0]), '配置深冻结');
ok(Object.isFrozen(checked) && Object.isFrozen(checked.errors), '校验结果及错误只读');
const mutableRaw = structuredClone(karmaFlagsRaw), independent = parseQuestHooks(mutableRaw).config;
ok(independent, '可建立独立快照'); eq(Object.isFrozen(mutableRaw.questHooks[0]), false, '不冻结调用方');
mutableRaw.questHooks[0].choices[0].hooks.moralityDelta = 99;
eq(independent.questHooks[0].choices[0].hooks.moralityDelta, 1, '调用方变更不改变快照');

const state = { daoHeart: MORAL_STATE.daoHeart.initial, morality: MORAL_STATE.morality.initial, karmaFlags: {} };
const before = JSON.stringify(state);
const poison = new Proxy({}, { get() { throw new Error('关态不得读取状态'); }, set() { throw new Error('不得写入状态'); } });
for (const hook of config.questHooks) {
  eq(hook.enabled, false, '正式表两题 enabled 全 false');
  for (const choice of hook.choices) {
    same(previewQuestHook(config, hook.id, choice.id, state), { status: 'unavailable', reason: 'disabled' }, '关态不弹选择');
    same(settleQuestHook(config, hook.id, choice.id, state), { status: 'rejected', reason: 'disabled' }, '关态拒绝结算');
    eq(previewQuestHook(config, hook.id, choice.id, poison).reason, 'disabled', '关态预览不读状态');
    eq(settleQuestHook(config, hook.id, choice.id, poison).reason, 'disabled', '关态结算不读写状态');
  }
  eq(settleQuestHook(config, hook.id, 'unknown', poison).reason, 'disabled', '关态在选项查找前短路');
}
eq(JSON.stringify(state), before, '两轴和 karmaFlags 无变化');
same(previewQuestHook(null, 'prologue_medicine', 'return', poison), { status: 'unavailable', reason: 'invalid' }, '坏表无预览');
same(settleQuestHook(null, 'prologue_medicine', 'return', poison), { status: 'rejected', reason: 'invalid' }, '坏表无结算');
eq(previewQuestHook(config, 'missing', 'return').reason, 'missing', '缺题目可诊断');
eq(settleQuestHook(config, 'missing', 'return').reason, 'missing', '缺题目拒绝结算');
const enabledRaw = structuredClone(karmaFlagsRaw); enabledRaw.questHooks[0].enabled = true;
const enabledClone = parseQuestHooks(enabledRaw).config; ok(enabledClone, '内存开态克隆可校验');
eq(previewQuestHook(enabledClone, 'prologue_medicine', 'return', poison).reason, 'not_implemented', '克隆开态不提前提供玩法');
eq(settleQuestHook(enabledClone, 'prologue_medicine', 'return', poison).reason, 'not_implemented', '克隆开态也无副作用');
eq(settleQuestHook(enabledClone, 'prologue_medicine', 'unknown').reason, 'missing', '开态可诊断缺选项');
ok(Object.isFrozen(settleQuestHook(config, 'prologue_medicine', 'return')), '查询结果只读');

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
eq(karmaFlagsRaw.questHooks.filter(hook => hook.enabled).length, 0, '测试未开启正式表');
console.log(`quest hooks tests ok: ${assertions} assertions (two hooks, fail-closed schema, disabled short-circuit, no state effects)`);
