import qiDensityRaw from '@xt/balance/qi_density.json';
import soloPacingRaw from '@xt/balance/solo_pacing.json';
import villageMap from '@xt/maps/qingyun_village.json';
import { QI_DENSITY, QI_DENSITY_ERRORS } from './data';
import { parseQiDensityConfig, mapDensity, resolveTier, meditationFactor, gatheringAvailability, type QiDensityConfig } from './QiDensity';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
function clonedConfig(mutate: (raw: Mutable) => void): QiDensityConfig {
  const raw = structuredClone(qiDensityRaw); mutate(raw);
  const result = parseQiDensityConfig(raw); ok(result.config, `测试克隆通过校验：${result.errors.join('; ')}`);
  return result.config;
}
function bad(label: string, mutate: (raw: Mutable) => void) {
  const raw = structuredClone(qiDensityRaw); mutate(raw);
  const result = parseQiDensityConfig(raw);
  eq(result.config, null, `坏表拒绝：${label}`); ok(result.errors.length, `保留字段诊断：${label}`);
  ok(result.errors.every(error => error.startsWith('qi_density.json $')), `诊断含表名和路径：${label}`);
}
function allEnabledFalse(value: unknown) {
  if (!value || typeof value !== 'object') return;
  for (const [key, child] of Object.entries(value)) {
    if (key === 'enabled') eq(child, false, '正式表所有 enabled 保持 false');
    allEnabledFalse(child);
  }
}

eq(QI_DENSITY_ERRORS.length, 0, 'data.ts 导出的真表无错误'); ok(QI_DENSITY, 'data.ts 导出已校验配置');
const config = QI_DENSITY;
const checked = parseQiDensityConfig(qiDensityRaw);
ok(checked.config, '真表通过独立校验'); eq(checked.errors.length, 0, '无忽略的错误');
allEnabledFalse(qiDensityRaw);
ok(Object.isFrozen(config) && Object.isFrozen(config.rules.tierOrder) && Object.isFrozen(config.tiers[0])
  && Object.isFrozen(config.future.gathering.tierModifiers), '导出深冻结');
ok(Object.isFrozen(checked) && Object.isFrozen(checked.errors), '校验结果及错误只读');
const mutableRaw = structuredClone(qiDensityRaw), independent = parseQiDensityConfig(mutableRaw).config;
ok(independent, '可建立独立快照'); eq(Object.isFrozen(mutableRaw), false, '不冻结调用方');
mutableRaw.tiers[0].nameKey = 'changed';
eq(independent.tiers[0].nameKey, qiDensityRaw.tiers[0].nameKey, '调用方改动不改变快照');

for (const field of ['version', 'enabled', 'rules', 'display', 'meditation', 'tiers', 'future']) bad(`缺 ${field}`, raw => { delete raw[field]; });
for (const field of Object.keys(qiDensityRaw.rules)) bad(`缺 rules.${field}`, raw => { delete raw.rules[field]; });
for (const block of ['display', 'meditation']) bad(`缺 ${block}.enabled`, raw => { delete raw[block].enabled; });
for (const field of ['id', 'nameKey', 'min', 'balanceTodo']) bad(`缺 tiers.${field}`, raw => { delete raw.tiers[0][field]; });
bad('缺 future.gathering', raw => { delete raw.future.gathering; });
for (const field of Object.keys(qiDensityRaw.future.gathering)) bad(`缺 future.gathering.${field}`, raw => { delete raw.future.gathering[field]; });
for (const field of ['tier', 'qualityWeightMul', 'balanceTodo']) bad(`缺 tierModifiers.${field}`, raw => { delete raw.future.gathering.tierModifiers[0][field]; });
for (const field of ['mapId', 'objectName', 'poolRef', 'enabled']) bad(`缺 bindings.${field}`, raw => {
  raw.future.gathering.bindings = [{ mapId: 'test_map', objectName: 'test_object', poolRef: 'test_pool', enabled: false }];
  delete raw.future.gathering.bindings[0][field];
});
for (const [label, mutate] of [
  ['错误版本', (raw: Mutable) => { raw.version = 'future'; }],
  ['根门禁非 boolean', (raw: Mutable) => { raw.enabled = 1; }],
  ['显示门禁非 boolean', (raw: Mutable) => { raw.display.enabled = null; }],
  ['打坐门禁非 boolean', (raw: Mutable) => { raw.meditation.enabled = 'false'; }],
  ['后期门禁非 boolean', (raw: Mutable) => { raw.future.gathering.enabled = null; }],
  ['错误来源', (raw: Mutable) => { raw.rules.mapDensitySource = 'top_level'; }],
  ['错误参考值引用', (raw: Mutable) => { raw.rules.densityRef = 5; }],
  ['顺序错误', (raw: Mutable) => { raw.rules.tierOrder.reverse(); }],
  ['档位少行', (raw: Mutable) => { raw.tiers.pop(); }],
  ['档位稀疏行', (raw: Mutable) => { delete raw.tiers[0]; }],
  ['重复档位', (raw: Mutable) => { raw.tiers[1].id = raw.tiers[0].id; }],
  ['档名错误', (raw: Mutable) => { raw.tiers[0].nameKey = 'qi.tier.unknown'; }],
  ['空阈值', (raw: Mutable) => { raw.tiers[0].min = null; }],
  ['无穷阈值', (raw: Mutable) => { raw.tiers[0].min = Infinity; }],
  ['NaN 阈值', (raw: Mutable) => { raw.tiers[0].min = NaN; }],
  ['越界阈值', (raw: Mutable) => { raw.tiers[3].min = 11; }],
  ['首档漏最低浓度', (raw: Mutable) => { raw.tiers[0].min = 2; }],
  ['阈值不递增', (raw: Mutable) => { raw.tiers[1].min = raw.tiers[0].min; }],
  ['残留待填', (raw: Mutable) => { raw.tiers[0].balanceTodo = ['min']; }],
  ['后期权重空', (raw: Mutable) => { raw.future.gathering.tierModifiers[0].qualityWeightMul = null; }],
  ['后期权重非法', (raw: Mutable) => { raw.future.gathering.tierModifiers[0].qualityWeightMul = Infinity; }],
  ['后期权重降低品质', (raw: Mutable) => { raw.future.gathering.tierModifiers[0].qualityWeightMul = 0.9; }],
  ['后期权重非单调', (raw: Mutable) => { raw.future.gathering.tierModifiers[1].qualityWeightMul = 0.9; }],
  ['后期档位重复', (raw: Mutable) => { raw.future.gathering.tierModifiers[1].tier = 'sparse'; }],
  ['后期权重稀疏行', (raw: Mutable) => { delete raw.future.gathering.tierModifiers[0]; }],
  ['后期绑定稀疏行', (raw: Mutable) => { raw.future.gathering.bindings = Array(1); }],
  ['绑定字段缺失', (raw: Mutable) => { raw.future.gathering.bindings = [{ mapId: 'test_map', objectName: 'test_object', enabled: false }]; }],
  ['重复绑定', (raw: Mutable) => { raw.future.gathering.bindings = Array(2).fill({ mapId: 'test_map', objectName: 'test_object', poolRef: 'test_pool', enabled: false }); }],
] as const) bad(label, mutate);
for (const raw of [null, undefined, [], false, 'qi_density']) eq(parseQiDensityConfig(raw).config, null, '非对象配置拒绝');

const actualProperty = villageMap.properties.find(property => property.name === 'qiDensity');
ok(actualProperty, '真图有 qiDensity 属性');
eq(mapDensity(villageMap), actualProperty.value, '真图从根 properties 取值');
const reordered = { ...structuredClone(villageMap), properties: [...villageMap.properties].reverse() };
eq(mapDensity(reordered), actualProperty.value, '改变数组位置不改变读取');
eq(mapDensity({ qiDensity: actualProperty.value }), null, '顶层同名键不能替代根 properties');
eq(mapDensity({ properties: [], objects: [{ properties: [actualProperty] }] }), null, '对象属性不能替代根属性');
eq(mapDensity({ properties: [{ name: 'unrelated', type: 'int', value: 10 }, actualProperty], qiDensity: 10 }), actualProperty.value, '按名忽略无关值和顶层值');
eq(mapDensity({ properties: [actualProperty, actualProperty] }), null, '重复 qiDensity 拒绝');
eq(mapDensity({ properties: [actualProperty, { name: 'qiDensity', type: 'string', value: 'invalid' }] }), null, '非法同名重复也拒绝');
for (const value of [null, undefined, '3', 0, -1, 11, 1.5, NaN, Infinity, true]) {
  eq(mapDensity({ properties: [{ name: 'qiDensity', type: 'int', value }] }), null, `非法地图值 ${String(value)} 拒绝`);
}
for (const type of ['float', 'string', undefined, '']) eq(mapDensity({ properties: [{ ...actualProperty, type }] }), null, '仅接受 Tiled int');

same(resolveTier(config, actualProperty.value), { status: 'pending' }, '根关态不推导档位');
eq(resolveTier(null, actualProperty.value).status, 'unavailable', '坏表档位不可用');
const displayOnly = clonedConfig(raw => { raw.display.enabled = true; });
eq(resolveTier(displayOnly, actualProperty.value).status, 'pending', '显示开关无法绕过根门禁');
const rootOnly = clonedConfig(raw => { raw.enabled = true; });
eq(resolveTier(rootOnly, actualProperty.value).status, 'pending', '根开关无法绕过显示门禁');
const displayOn = clonedConfig(raw => { raw.enabled = true; raw.display.enabled = true; });
for (let i = 0; i < displayOn.tiers.length; i++) {
  const tier = displayOn.tiers[i], nextMin = displayOn.tiers[i + 1]?.min;
  const atMin = resolveTier(displayOn, tier.min); ok(atMin.status === 'ready', '下界可分档');
  eq(atMin.tier.id, tier.id, '下界属于本档'); ok(Object.isFrozen(atMin), '查询结果冻结');
  if (nextMin !== undefined) {
    const below = resolveTier(displayOn, nextMin - 0.01), atNext = resolveTier(displayOn, nextMin);
    ok(below.status === 'ready' && atNext.status === 'ready', '相邻边界均可分档');
    eq(below.tier.id, tier.id, '下一档下界前属于本档');
    eq(atNext.tier.id, displayOn.tiers[i + 1].id, '下一档下界不属于本档');
  }
}
const maximum = resolveTier(displayOn, 10); ok(maximum.status === 'ready', '最高合法浓度可分档');
eq(maximum.tier.id, displayOn.tiers[displayOn.tiers.length - 1].id, '末档覆盖合法域上限');
for (const value of [null, undefined, '3', 0, 11, Infinity, NaN]) eq(resolveTier(displayOn, value).status, 'unavailable', '非法浓度不可分档');

same(meditationFactor(config, null, null), { status: 'legacy', factor: 1 }, '正式关态不读取浓度或参数');
same(meditationFactor(rootOnly, null, null), { status: 'legacy', factor: 1 }, '根开但打坐关时沿旧逻辑');
const meditationOnly = clonedConfig(raw => { raw.meditation.enabled = true; });
same(meditationFactor(meditationOnly, null, null), { status: 'legacy', factor: 1 }, '打坐无法绕过根门禁');
const poison = { get densityRef(): number { throw new Error('关态不得读取参数'); } };
eq(meditationFactor(config, null, poison).status, 'legacy', '关态甚至不读取参数 getter');
const meditationOn = clonedConfig(raw => { raw.enabled = true; raw.meditation.enabled = true; });
const factor = meditationFactor(meditationOn, actualProperty.value, soloPacingRaw);
ok(factor.status === 'ready', '开态读取既有节奏表');
eq(factor.factor, soloPacingRaw.meditation.ratioOfGrind * Number(actualProperty.value) / soloPacingRaw.densityRef, '只算原 B 所用因子，不乘档位或宗门室');
eq(meditationFactor(null, actualProperty.value, soloPacingRaw).status, 'unavailable', '坏新表不生成零收益');
for (const pacing of [{}, { densityRef: null, meditation: soloPacingRaw.meditation }, { densityRef: Infinity, meditation: soloPacingRaw.meditation },
  { densityRef: soloPacingRaw.densityRef, meditation: {} }, { densityRef: soloPacingRaw.densityRef, meditation: { ratioOfGrind: null } }]) {
  eq(meditationFactor(meditationOn, actualProperty.value, pacing).status, 'unavailable', '启用动作实际参数缺失/非法不可用');
}
for (const value of [null, 0, 11, NaN]) eq(meditationFactor(meditationOn, value, soloPacingRaw).status, 'unavailable', '开态非法浓度不回退');
eq(gatheringAvailability(config).status, 'unavailable', '后期采集关态不可用');
const gatheringOn = clonedConfig(raw => { raw.enabled = true; raw.future.gathering.enabled = true; });
eq(gatheringAvailability(gatheringOn).status, 'unavailable', '后期只有校验，不因克隆门禁开启而实现玩法');
allEnabledFalse(qiDensityRaw);
console.log(`qi density tests ok: ${assertions} assertions (schema/fail-closed, gates, named Tiled property, tier boundaries, readonly factors)`);
