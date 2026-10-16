/** 地图灵气表的只读入口；不接管打坐、闭关、采集或存档。 */
export const QI_TIER_IDS = Object.freeze(['sparse', 'normal', 'abundant', 'rich'] as const);
export type QiTierId = typeof QI_TIER_IDS[number];
export interface QiTier {
  readonly id: QiTierId; readonly nameKey: string; readonly min: number; readonly balanceTodo: readonly string[];
}
export interface QiDensityConfig {
  readonly version: 'v0.5c'; readonly enabled: boolean;
  readonly rules: {
    readonly tierOrder: readonly QiTierId[];
    readonly mapDensitySource: 'tiled_property'; readonly mapDensityProperty: 'qiDensity';
    readonly densityRef: 'solo_pacing.densityRef'; readonly meditationRef: 'solo_pacing.meditation';
    readonly seclusionRef: 'solo_pacing.seclusion'; readonly sectSeclusionRef: 'solo_pacing.sectSeclusion';
    readonly abodeBaseRef: 'solo_pacing.qiDensity.cave_abode_base'; readonly abodeRef: 'solo_pacing.spiritAbode';
    readonly offlineRef: 'solo_pacing.offline'; readonly invalidDensity: 'unavailable';
    readonly sourceOwnership: 'originating_system';
  };
  readonly display: { readonly enabled: boolean }; readonly meditation: { readonly enabled: boolean };
  readonly tiers: readonly QiTier[];
  readonly future: { readonly gathering: {
    readonly version: 'v0.7+'; readonly enabled: boolean; readonly mode: 'weighted_variant';
    readonly snapshotAt: 'resource_spawn';
    readonly tierModifiers: readonly { readonly tier: QiTierId; readonly qualityWeightMul: number; readonly balanceTodo: readonly string[] }[];
    readonly bindings: readonly { readonly mapId: string; readonly objectName: string; readonly poolRef: string; readonly enabled: boolean }[];
  } };
}
export interface QiDensityValidation { readonly config: QiDensityConfig | null; readonly errors: readonly string[] }
export type QiTierResult = { readonly status: 'pending' | 'unavailable' }
  | { readonly status: 'ready'; readonly density: number; readonly tier: QiTier };
export type MeditationFactorResult = { readonly status: 'legacy'; readonly factor: 1 }
  | { readonly status: 'ready'; readonly factor: number } | { readonly status: 'unavailable' };

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const density = (value: unknown): value is number => finite(value) && value >= 1 && value <= 10;
const positive = (value: unknown): value is number => finite(value) && value > 0;
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 坏表只让新增查询不可用，不用默认值修表，也不影响既有玩法。 */
export function parseQiDensityConfig(raw: unknown): QiDensityValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`qi_density.json ${path}: ${message}`); };
  const emptyTodo = (value: unknown, path: string) => check(Array.isArray(value) && value.length === 0, path, '正式表 balanceTodo 必须为空数组');
  if (!record(raw)) return freeze({ config: null, errors: ['qi_density.json $: 必须为对象'] });
  check(raw.version === 'v0.5c', '$.version', '仅支持 v0.5c');
  check(typeof raw.enabled === 'boolean', '$.enabled', '必须为 boolean');
  const rules = record(raw.rules) ? raw.rules : {};
  check(record(raw.rules), '$.rules', '必须为对象');
  check(Array.isArray(rules.tierOrder) && rules.tierOrder.length === QI_TIER_IDS.length
    && QI_TIER_IDS.every((id, i) => rules.tierOrder instanceof Array && rules.tierOrder[i] === id),
  '$.rules.tierOrder', '必须依次为 sparse / normal / abundant / rich');
  const references = {
    mapDensitySource: 'tiled_property', mapDensityProperty: 'qiDensity', densityRef: 'solo_pacing.densityRef',
    meditationRef: 'solo_pacing.meditation', seclusionRef: 'solo_pacing.seclusion', sectSeclusionRef: 'solo_pacing.sectSeclusion',
    abodeBaseRef: 'solo_pacing.qiDensity.cave_abode_base', abodeRef: 'solo_pacing.spiritAbode', offlineRef: 'solo_pacing.offline',
    invalidDensity: 'unavailable', sourceOwnership: 'originating_system',
  };
  for (const [key, expected] of Object.entries(references)) check(rules[key] === expected, `$.rules.${key}`, `必须为 ${expected}`);
  for (const key of ['display', 'meditation']) {
    const block = record(raw[key]) ? raw[key] : {};
    check(record(raw[key]), `$.${key}`, '必须为对象');
    check(typeof block.enabled === 'boolean', `$.${key}.enabled`, '必须为 boolean');
  }
  const tiers = Array.isArray(raw.tiers) ? raw.tiers : [];
  check(Array.isArray(raw.tiers) && tiers.length === QI_TIER_IDS.length, '$.tiers', '必须完整配置四档');
  let previousMin = -Infinity;
  Array.from(tiers).forEach((tier: unknown, index: number) => {
    const p = `$.tiers[${index}]`, id = QI_TIER_IDS[index];
    if (!record(tier)) { check(false, p, '必须为对象'); return; }
    check(!!id && tier.id === id, `${p}.id`, '必须与 tierOrder 一一对应且不重复');
    check(!!id && tier.nameKey === `qi.tier.${id}`, `${p}.nameKey`, '必须引用对应 qi.tier.*');
    check(density(tier.min), `${p}.min`, '必须为合法浓度域 1～10 内的有限数');
    if (density(tier.min)) {
      check(index === 0 ? tier.min === 1 : tier.min > previousMin, `${p}.min`, '首档覆盖 1，后续下界严格递增');
      previousMin = tier.min;
    }
    emptyTodo(tier.balanceTodo, `${p}.balanceTodo`);
  });
  const future = record(raw.future) ? raw.future : {}, gathering = record(future.gathering) ? future.gathering : {};
  check(record(raw.future), '$.future', '必须为对象');
  check(record(future.gathering), '$.future.gathering', '必须为对象');
  const gp = '$.future.gathering';
  check(gathering.version === 'v0.7+', `${gp}.version`, '必须为 v0.7+');
  check(typeof gathering.enabled === 'boolean', `${gp}.enabled`, '必须为 boolean');
  check(gathering.mode === 'weighted_variant', `${gp}.mode`, '必须为 weighted_variant');
  check(gathering.snapshotAt === 'resource_spawn', `${gp}.snapshotAt`, '必须为 resource_spawn');
  const modifiers = Array.isArray(gathering.tierModifiers) ? gathering.tierModifiers : [];
  check(Array.isArray(gathering.tierModifiers) && modifiers.length === QI_TIER_IDS.length, `${gp}.tierModifiers`, '必须与四档一一对应');
  let previousMul = 1;
  Array.from(modifiers).forEach((modifier: unknown, index: number) => {
    const p = `${gp}.tierModifiers[${index}]`;
    if (!record(modifier)) { check(false, p, '必须为对象'); return; }
    check(!!QI_TIER_IDS[index] && modifier.tier === QI_TIER_IDS[index], `${p}.tier`, '必须依次对应四档且不重复');
    check(positive(modifier.qualityWeightMul) && modifier.qualityWeightMul >= previousMul,
      `${p}.qualityWeightMul`, '必须为不小于 1 且单调不降的正有限直接乘数');
    if (positive(modifier.qualityWeightMul)) previousMul = modifier.qualityWeightMul;
    emptyTodo(modifier.balanceTodo, `${p}.balanceTodo`);
  });
  const bindings = Array.isArray(gathering.bindings) ? gathering.bindings : [], seen = new Set<string>();
  check(Array.isArray(gathering.bindings), `${gp}.bindings`, '必须为数组；未接入时显式 []');
  Array.from(bindings).forEach((binding: unknown, index: number) => {
    const p = `${gp}.bindings[${index}]`;
    if (!record(binding)) { check(false, p, '必须为对象'); return; }
    for (const key of ['mapId', 'objectName', 'poolRef']) check(text(binding[key]), `${p}.${key}`, '必须为非空字符串');
    check(typeof binding.enabled === 'boolean', `${p}.enabled`, '必须为 boolean');
    if (text(binding.mapId) && text(binding.objectName)) {
      const identity = JSON.stringify([binding.mapId, binding.objectName]);
      check(!seen.has(identity), p, '地图与对象组合不能重复'); seen.add(identity);
    }
  });
  if (errors.length) return freeze({ config: null, errors });
  // 深拷贝后冻结，不冻结调用方导入对象或测试用克隆。
  try { return freeze({ config: JSON.parse(JSON.stringify(raw)) as QiDensityConfig, errors }); }
  catch { return freeze({ config: null, errors: ['qi_density.json $: 必须为可序列化配置'] }); }
}

/** 地图根 properties 是唯一来源；不读固定下标、顶层同名字段或区域登记表。 */
export function mapDensity(tiledRoot: unknown): number | null {
  if (!record(tiledRoot) || !Array.isArray(tiledRoot.properties)) return null;
  const matches = tiledRoot.properties.filter(property => record(property) && property.name === 'qiDensity');
  if (matches.length !== 1) return null;
  const property = matches[0];
  return property.type === 'int' && density(property.value) && Number.isSafeInteger(property.value) ? property.value : null;
}

/** 关态只报告尚未评定，调用方自行保留现有 UI。分档不参与修炼公式。 */
export function resolveTier(config: QiDensityConfig | null, value: unknown): QiTierResult {
  if (!config) return freeze({ status: 'unavailable' });
  if (!config.enabled || !config.display.enabled) return freeze({ status: 'pending' });
  if (!density(value)) return freeze({ status: 'unavailable' });
  const tier = [...config.tiers].reverse().find(candidate => value >= candidate.min);
  return tier ? freeze({ status: 'ready', density: value, tier }) : freeze({ status: 'unavailable' });
}

/**
 * 返回原同等级打怪预算 B 所用的 ratioOfGrind × D / densityRef。
 * 不能再叠在已含 ratioOfGrind 或浓度的收益上；准入、计时和结算仍归原系统。
 * 根或打坐关态不读取参数，只返回 legacy identity；本轮不接现有闭关公式。
 */
export function meditationFactor(config: QiDensityConfig | null, value: unknown, soloPacing: unknown): MeditationFactorResult {
  if (!config) return freeze({ status: 'unavailable' });
  if (!config.enabled || !config.meditation.enabled) return freeze({ status: 'legacy', factor: 1 });
  if (!density(value) || !record(soloPacing) || !positive(soloPacing.densityRef)
    || !record(soloPacing.meditation) || !positive(soloPacing.meditation.ratioOfGrind)) return freeze({ status: 'unavailable' });
  const factor = soloPacing.meditation.ratioOfGrind * value / soloPacing.densityRef;
  return positive(factor) ? freeze({ status: 'ready', factor }) : freeze({ status: 'unavailable' });
}

/** future 只校验门禁；即使克隆表打开也没有采集玩法、抽取或发奖入口。 */
export function gatheringAvailability(_config: QiDensityConfig | null): Readonly<{ status: 'unavailable' }> {
  return freeze({ status: 'unavailable' });
}
