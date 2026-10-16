import gongfaRaw from '@xt/balance/gongfa_grades.json';
import { GONGFA_GRADES, GONGFA_GRADES_ERRORS } from './data';
import { SKILL_LIST } from './skills';
import { GONGFA_GRADE_IDS, parseGongfaGradesConfig, effectMul, levelCap, futureAvailability, type GongfaGradesConfig } from './GongfaGrades';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
const clone = (): Mutable => JSON.parse(JSON.stringify(gongfaRaw));
function parsed(raw: unknown): GongfaGradesConfig {
  const checked = parseGongfaGradesConfig(raw, SKILL_LIST);
  same(checked.errors, [], '克隆表校验通过'); ok(checked.config, '克隆表可用'); return checked.config;
}
function allFrozen(value: unknown): boolean {
  return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(allFrozen));
}
function enabledValues(value: unknown): unknown[] {
  if (!value || typeof value !== 'object') return [];
  return Object.entries(value).flatMap(([key, child]) => key === 'enabled' ? [child] : enabledValues(child));
}

same(GONGFA_GRADES_ERRORS, [], '真表没有配置错误'); ok(GONGFA_GRADES, 'data 导出已校验配置');
const config = GONGFA_GRADES;
const gates = enabledValues(gongfaRaw);
eq(gates.length, 46, '正式功法表共 46 个门禁');
eq(gongfaRaw.enabled, true, 'tip 开态：发布快照功法总开关已开启');
eq(config.enabled, true, 'tip 开态：已校验功法配置总开关已开启');
eq(gongfaRaw.bindings.length, 38, '正式功法表共 38 个绑定');
ok(gongfaRaw.bindings.every(binding => binding.enabled === true), 'tip 开态：正式表 38 个绑定全部开启');
const futureGates = enabledValues(gongfaRaw.future);
eq(futureGates.length, 7, '正式功法表共 7 个未来门禁');
ok(futureGates.every(value => value === false), '正式表 future 七处 enabled 仍全部关闭');
eq(gates.filter(value => value === true).length, 39, 'tip 开态：正式表 enabled=true 共 39 处');
eq(gates.filter(value => value === false).length, 7, 'tip 开态：正式表 enabled=false 共 7 处');
ok(allFrozen(config) && Object.isFrozen(GONGFA_GRADES_ERRORS) && Object.isFrozen(GONGFA_GRADE_IDS), '配置、诊断与品阶枚举深只读');
{
  const input = clone(), checked = parseGongfaGradesConfig(input, SKILL_LIST);
  ok(checked.config && allFrozen(checked), '校验结果整体深冻结');
  ok(!Object.isFrozen(input) && !Object.isFrozen(input.grades), '不冻结调用者原始表');
  input.grades[0].effectMul = 999;
  eq(checked.config.grades[0].effectMul, config.grades[0].effectMul, '校验快照不受调用者后改影响');
}

const disabledInput = clone();
disabledInput.enabled = false;
for (const binding of disabledInput.bindings) binding.enabled = false;
const closed = parsed(disabledInput);
eq(closed.enabled, false, '关态夹具总开关关闭');
ok(closed.bindings.every(binding => binding.enabled === false), '关态夹具全部绑定关闭');
same(enabledValues(closed.future), futureGates, '关态夹具保留 future 七处关闭');
for (const skill of SKILL_LIST) {
  eq(effectMul(closed, skill.id), 1, `${skill.id} 关态夹具倍率为 1`);
  eq(effectMul(null, skill.id), 1, `${skill.id} 坏表沿 legacy`);
  eq(levelCap(closed, skill.id, skill.maxLevel), skill.maxLevel, `${skill.id} 关态夹具保留原 maxLevel`);
  const binding = config.bindings.find(row => row.skillId === skill.id);
  const expected = binding?.effectMode === 'damage_ratio'
    ? config.grades.find(row => row.id === binding.initialGrade)!.effectMul : 1;
  eq(effectMul(config, skill.id), expected, `${skill.id} tip 开态正式配置按 effectMode 读取倍率`);
  eq(levelCap(config, skill.id, skill.maxLevel), skill.maxLevel, `${skill.id} tip 开态仍保留原 maxLevel`);
}
eq(effectMul(config, '__missing_binding'), 1, '缺绑定不默认黄阶');
eq(levelCap(null, '__missing_binding', 77), 77, '坏表及缺绑定上限仍为原值');
{
  const input = clone(); input.enabled = true; input.bindings = [];
  const missing = parsed(input);
  eq(effectMul(missing, 'spirit_bolt'), 1, '总开关开且缺绑定仍沿 legacy');
  eq(levelCap(missing, 'spirit_bolt', 20), 20, '空绑定不截断旧上限');
}
for (const binding of config.bindings) {
  for (const rootEnabled of [false, true]) for (const bindingEnabled of [false, true]) {
    const input = clone(); input.enabled = rootEnabled;
    input.bindings.find((row: Mutable) => row.skillId === binding.skillId).enabled = bindingEnabled;
    const changed = parsed(input);
    const expected = rootEnabled && bindingEnabled && binding.effectMode === 'damage_ratio'
      ? config.grades.find(row => row.id === binding.initialGrade)!.effectMul : 1;
    eq(effectMul(changed, binding.skillId), expected, `${binding.skillId} 根与绑定共同启用且 damage_ratio 才读倍率`);
    eq(levelCap(changed, binding.skillId, 20), 20, '开态 legacy 仍不使用品阶 levelCap');
  }
}
{
  const none = config.bindings.find(row => row.effectMode === 'none')!;
  const noGradeRead = { ...config, enabled: true, bindings: [{ ...none, enabled: true }] };
  Object.defineProperty(noGradeRead, 'grades', { get() { throw new Error('none / legacy 不应读取品阶数值'); } });
  eq(effectMul(noGradeRead, none.skillId), 1, 'none 模式不读取倍率');
  eq(levelCap(noGradeRead, none.skillId, 20), 20, 'legacy 不读取 levelCap');
}

const mutations: [string, (raw: Mutable) => void][] = [
  ['$.version', raw => { delete raw.version; }],
  ['$.enabled', raw => { raw.enabled = 'false'; }],
  ['$.rules', raw => { delete raw.rules; }],
  ['$.rules.gradeOrder', raw => { raw.rules.gradeOrder.reverse(); }],
  ['$.rules.missingBinding', raw => { delete raw.rules.missingBinding; }],
  ['$.grades', raw => { raw.grades.pop(); }],
  ['$.grades[0]', raw => { delete raw.grades[0]; }],
  ['.nameKey', raw => { delete raw.grades[0].nameKey; }],
  ['.levelCap', raw => { raw.grades[0].levelCap = null; }],
  ['.levelCap', raw => { raw.grades[1].levelCap = raw.grades[0].levelCap - 1; }],
  ['.effectMul', raw => { delete raw.grades[0].effectMul; }],
  ['.effectMul', raw => { raw.grades[0].effectMul = Infinity; }],
  ['.effectMul', raw => { raw.grades[1].effectMul = 0.5; }],
  ['.effectMul', raw => { raw.grades[0].effectMul = raw.grades[1].effectMul + 1; }],
  ['.balanceTodo', raw => { raw.grades[0].balanceTodo = ['effectMul']; }],
  ['$.bindings', raw => { delete raw.bindings; }],
  ['$.bindings[0]', raw => { delete raw.bindings[0]; }],
  ['.skillId', raw => { raw.bindings[1].skillId = raw.bindings[0].skillId; }],
  ['.skillId', raw => { raw.bindings[0].skillId = '__unknown_skill'; }],
  ['.initialGrade', raw => { raw.bindings[0].initialGrade = 'unknown'; }],
  ['.capMode', raw => { raw.bindings[0].capMode = 'grade'; }],
  ['.effectMode', raw => { delete raw.bindings[0].effectMode; }],
  ['.effectMode', raw => { raw.bindings.find((row: Mutable) => row.effectMode === 'none').effectMode = 'damage_ratio'; }],
  ['.enabled', raw => { delete raw.bindings[0].enabled; }],
  ['$.future', raw => { delete raw.future; }],
  ['$.future.version', raw => { delete raw.future.version; }],
  ['$.future.study.enabled', raw => { delete raw.future.study.enabled; }],
  ['$.future.epiphany.enabled', raw => { raw.future.epiphany.enabled = null; }],
  ['$.future.upgradeProfiles', raw => { delete raw.future.upgradeProfiles; }],
  ['.enabled', raw => { delete raw.future.upgradeProfiles[0].enabled; }],
  ['.toGrade', raw => { raw.future.upgradeProfiles[0].toGrade = 'tian'; }],
  ['.grade', raw => { delete raw.future.assemblyProfiles[0].grade; }],
  ['$.future.recipes', raw => { delete raw.future.recipes; }],
  ['$.future.variants', raw => { delete raw.future.variants; }],
];
for (const [path, mutate] of mutations) {
  const input = clone(); mutate(input);
  const checked = parseGongfaGradesConfig(input, SKILL_LIST);
  eq(checked.config, null, `坏表 ${path} 不可用`);
  ok(checked.errors.some(error => error.includes(path)), `坏表 ${path} 保留字段路径`);
  eq(effectMul(checked.config, 'spirit_bolt'), 1, '坏表不阻断原攻击');
}
for (const invalid of [null, undefined, [], 0, 'invalid']) eq(parseGongfaGradesConfig(invalid).config, null, '根必须为对象');
{
  const input = clone(); input.enabled = true;
  for (const kind of ['study', 'epiphany', 'upgrade', 'assembly'] as const) {
    const profileId = kind === 'upgrade' ? input.future.upgradeProfiles[0].id : kind === 'assembly' ? input.future.assemblyProfiles[0].id : undefined;
    eq(futureAvailability(null, kind, profileId).available, false, '坏表未来接口 unavailable');
    same(futureAvailability(config, kind, profileId), { available: false, reason: 'disabled' }, '正式表未来玩法 unavailable');
    same(futureAvailability(parsed(input), kind, profileId), { available: false, reason: 'disabled' }, '总开关开但未来门禁关仍 unavailable');
  }
  input.future.study.enabled = true; input.future.epiphany.enabled = true;
  input.future.upgradeProfiles[0].enabled = true; input.future.assemblyProfiles[0].enabled = true;
  const future = parsed(input);
  for (const [kind, id] of [['study', undefined], ['epiphany', undefined], ['upgrade', input.future.upgradeProfiles[0].id], ['assembly', input.future.assemblyProfiles[0].id]] as const) {
    const result = futureAvailability(future, kind, id);
    same(result, { available: false, reason: 'unimplemented' }, '未来门禁打开也未实现玩法'); ok(Object.isFrozen(result), '未来查询只读');
  }
}
console.log(`gongfa grades tests ok: ${assertions} assertions (tip open tables, closed fixtures, legacy caps, effect whitelist, fail-open legacy, freeze, future unavailable)`);
