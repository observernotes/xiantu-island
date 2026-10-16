import encountersRaw from '@xt/balance/encounters.json';
import { ENCOUNTERS, ENCOUNTERS_ERRORS } from './data';
import { parseEncountersConfig, listEncounters, previewEncounter, triggerEncounter } from './Encounter';

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
eq(metadata.length, 5, '关态仍可读取五条登记元数据');
same(metadata.map(row => row.id), encountersRaw.encounters.map(row => row.id), '列表来自真表');
eq(metadata.filter(row => row.enabled).length, 0, '正式五事件 enabled 全 false');
same(metadata[0], {
  id: encountersRaw.encounters[0].id, nameKey: encountersRaw.encounters[0].nameKey,
  maps: encountersRaw.encounters[0].maps, enabled: false,
}, '元数据包含身份、名称、地图与关态门禁');
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

// 访问、修改 ctx 的任何属性都会抛错：关态必须在消费上下文之前返回。
const forbiddenContext = new Proxy({}, {
  get() { throw new Error('关态不得读 ctx'); },
  set() { throw new Error('关态不得写 ctx'); },
  ownKeys() { throw new Error('关态不得遍历 ctx'); },
});
const save = { exp: 100, inventory: { hp_pill_small: 2 }, encounters: {}, daoHeart: 50, morality: 0, karmaFlags: {} };
const before = JSON.stringify(save);
for (const row of config.encounters) {
  eq(row.enabled, false, `${row.id} 保持关态`);
  same(previewEncounter(config, row.id, forbiddenContext), { status: 'unavailable', reason: 'disabled' }, `${row.id} 预览不可用`);
  same(triggerEncounter(config, row.id, forbiddenContext), { status: 'rejected', reason: 'disabled' }, `${row.id} 触发被拒绝`);
  triggerEncounter(config, row.id, save);
}
eq(JSON.stringify(save), before, '拒绝触发不改变存档、物资、两轴或因果');
same(previewEncounter(config, 'missing', forbiddenContext), { status: 'unavailable', reason: 'missing' }, '缺事件预览不可用');
same(triggerEncounter(config, 'missing', forbiddenContext), { status: 'rejected', reason: 'missing' }, '缺事件触发被拒绝');
same(listEncounters(null), [], '坏表列表为空');
same(previewEncounter(null, config.encounters[0].id, forbiddenContext), { status: 'unavailable', reason: 'invalid' }, '坏表预览不可用');
same(triggerEncounter(null, config.encounters[0].id, forbiddenContext), { status: 'rejected', reason: 'invalid' }, '坏表触发被拒绝');
const enabledRaw = structuredClone(encountersRaw); enabledRaw.encounters[0].enabled = true;
const enabled = parseEncountersConfig(enabledRaw).config;
ok(enabled, '测试克隆可校验开启门禁');
same(previewEncounter(enabled, enabled.encounters[0].id, forbiddenContext), { status: 'unavailable', reason: 'not_implemented' }, '开态克隆仍没有完整脚本');
same(triggerEncounter(enabled, enabled.encounters[0].id, forbiddenContext), { status: 'rejected', reason: 'not_implemented' }, '开态克隆仍不能发奖');
eq(encountersRaw.encounters[0].enabled, false, '测试克隆未修改正式表');

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
  ['前置功能格式错误', (raw: Mutable) => { raw.encounters[0].req.featuresAll = 'moral_state'; }],
  ['起点悬空', (raw: Mutable) => { raw.encounters[0].script.start = 'missing'; }],
  ['重复步骤', (raw: Mutable) => { raw.encounters[0].script.steps[1].id = raw.encounters[0].script.steps[0].id; }],
  ['选项悬空', (raw: Mutable) => { raw.encounters[0].script.steps[1].choiceIds = ['missing']; }],
  ['跳转悬空', (raw: Mutable) => { raw.encounters[0].choices[0].next = 'missing'; }],
  ['结局悬空', (raw: Mutable) => { raw.encounters[0].script.steps.find((step: Mutable) => step.type === 'finish').outcomeId = 'missing'; }],
  ['结局状态错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].status = 'unknown'; }],
  ['两轴增量错误', (raw: Mutable) => { raw.encounters[0].outcomes[0].hooks.moralityDelta = NaN; }],
] as const) bad(label, mutate);
for (const value of [null, undefined, [], false, 'encounters']) {
  const result = parseEncountersConfig(value);
  eq(result.config, null, '非对象拒绝'); ok(result.errors.length, '非对象有诊断');
}

console.log(`encounter tests ok: ${assertions} assertions, 5 loaded / 0 enabled, preview and trigger rejected without effects`);
