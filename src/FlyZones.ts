/** 场景持续飞行表的只读入口；与御剑自动授予、单次战斗冲刺分离。 */
export interface FlyZonesConfig {
  readonly version: 'v0.6-draft'; readonly enabled: boolean;
  readonly skillId: 'sword_ride'; readonly unlockRealm: 'foundation';
  readonly mpPerSecond: number; readonly maxFlightMs: number;
  readonly knockdownOnHit: boolean; readonly cannotAttackWhileFlying: boolean;
  readonly maps: readonly string[]; readonly balanceTodo: readonly string[];
}
export interface FlyZonesValidation { readonly config: FlyZonesConfig | null; readonly errors: readonly string[] }
export interface SustainFlightRequest {
  /** 顺序取自 realms.json，不按境界英文名排序，也不复制境界等级阈值。 */
  readonly realmId: string; readonly realmOrder: readonly string[];
  readonly ownsSkill: boolean; readonly mapId: string; readonly inFlyZone: boolean; readonly mp: number;
}
export type FlightRejectionReason = 'locked_realm' | 'disabled' | 'unavailable' | 'mp_low';
export interface FlightRejection {
  readonly ok: false; readonly reason: FlightRejectionReason;
  readonly messageKey: 'fly.locked_realm' | 'fly.zone_disabled' | 'fly.zone_unavailable' | 'fly.mp_low';
}
export interface SustainFlightRejection extends FlightRejection { readonly entered: false; readonly mpSpent: 0 }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}

/** 不替缺项补数值；坏表仅停用持续飞行，不影响 skills 中的基础冲刺。 */
export function parseFlyZonesConfig(raw: unknown): FlyZonesValidation {
  if (!record(raw)) return freeze({ config: null, errors: ['fly_zones.json $: 必须为对象'] });
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`fly_zones.json ${path}: ${message}`); };
  check(raw.version === 'v0.6-draft', '$.version', '仅支持 v0.6-draft');
  check(typeof raw.enabled === 'boolean', '$.enabled', '必须为 boolean');
  check(raw.skillId === 'sword_ride', '$.skillId', '必须引用 sword_ride');
  check(raw.unlockRealm === 'foundation', '$.unlockRealm', '必须引用 foundation');
  check(positive(raw.mpPerSecond), '$.mpPerSecond', '必须为正有限数');
  check(positive(raw.maxFlightMs) && Number.isSafeInteger(raw.maxFlightMs), '$.maxFlightMs', '必须为正安全整数');
  for (const key of ['knockdownOnHit', 'cannotAttackWhileFlying']) check(typeof raw[key] === 'boolean', `$.${key}`, '必须为 boolean');
  const maps = Array.isArray(raw.maps) ? raw.maps : [];
  check(Array.isArray(raw.maps), '$.maps', '必须为 mapId 字符串数组');
  const seen = new Set<string>();
  maps.forEach((map: unknown, index: number) => {
    check(text(map), `$.maps[${index}]`, '必须为非空 mapId 字符串，不支持条目级开关');
    if (text(map)) { check(!seen.has(map), `$.maps[${index}]`, 'mapId 不能重复'); seen.add(map); }
  });
  check(Array.isArray(raw.balanceTodo) && raw.balanceTodo.length === 0, '$.balanceTodo', '正式表 balanceTodo 必须为空数组');
  if (errors.length) return freeze({ config: null, errors });
  // 仅冻结隔离副本，导入 JSON 与调用方的输入仍归调用方所有。
  try { return freeze({ config: JSON.parse(JSON.stringify(raw)) as FlyZonesConfig, errors }); }
  catch { return freeze({ config: null, errors: ['fly_zones.json $: 必须为可序列化配置'] }); }
}

function rejected(reason: FlightRejectionReason): FlightRejection {
  const keys = { locked_realm: 'fly.locked_realm', disabled: 'fly.zone_disabled', unavailable: 'fly.zone_unavailable', mp_low: 'fly.mp_low' } as const;
  return freeze({ ok: false, reason, messageKey: keys[reason] });
}

/**
 * 关态拒绝钩子。优先级按 design/20 §3.2：境界 → 总开关 → 技能/区域 → 灵力。
 * 即使另令改表，本 tip 也不会启动尚未实现的持续飞行；这里不执行耗蓝、位移或存档。
 */
export function canSustainFlight(config: FlyZonesConfig | null, request: SustainFlightRequest): FlightRejection {
  if (!config) return rejected('unavailable');
  const current = request.realmOrder.indexOf(request.realmId), required = request.realmOrder.indexOf(config.unlockRealm);
  if (current < 0 || required < 0 || current < required) return rejected('locked_realm');
  if (!config.enabled) return rejected('disabled');
  if (!request.ownsSkill || !config.maps.includes(request.mapId) || !request.inFlyZone) return rejected('unavailable');
  if (!Number.isFinite(request.mp) || request.mp < config.mpPerSecond) return rejected('mp_low');
  return rejected('unavailable');
}

/** 可供失效交互触达的拒绝入口；传入状态只读，失败绝不扣场景飞行蓝。 */
export function requestSustainFlight(config: FlyZonesConfig | null, request: SustainFlightRequest): SustainFlightRejection {
  return freeze({ ...canSustainFlight(config, request), entered: false, mpSpent: 0 });
}
