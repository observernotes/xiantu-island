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
  /** 顺序取自 realms.json，不按境界英文名排序，也不复制境界等级数值。 */
  readonly realmId: string; readonly realmOrder: readonly string[];
  readonly ownsSkill: boolean; readonly mapId: string; readonly inFlyZone: boolean; readonly mp: number;
}
export type FlightRejectionReason = 'locked_realm' | 'disabled' | 'unavailable' | 'mp_low';
export interface FlightRejection {
  readonly ok: false; readonly reason: FlightRejectionReason;
  readonly messageKey: 'fly.locked_realm' | 'fly.zone_disabled' | 'fly.zone_unavailable' | 'fly.mp_low';
}
export interface FlightAllowed { readonly ok: true }
export type FlightGateResult = FlightAllowed | FlightRejection;
export interface SustainFlightRejection extends FlightRejection { readonly entered: false; readonly mpSpent: 0 }
export interface SustainFlightSuccess { readonly ok: true; readonly entered: true; readonly mpSpent: number }
export type SustainFlightResult = SustainFlightSuccess | SustainFlightRejection;

/** 地图 flyZone 几何查询用的最小矩形（2A 对象／zone 约定）。 */
export interface FlyZoneRect {
  readonly type?: string; readonly name: string;
  readonly x: number; readonly y: number; readonly w: number; readonly h: number;
  readonly props?: Readonly<Record<string, unknown>>;
}

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
 * 是否名为／标为 flyZone 的区域几何。
 * 2A 约定：objects 层 type/class=`flyZone`，或 name=`flyZone`／`flyZone_*`，或 props.flyZone=true；
 * 亦可 type=`zone` 且 name／props 同上（落入 BuiltMap.zones）。
 */
export function isFlyZoneRect(rect: FlyZoneRect): boolean {
  if (rect.type === 'flyZone') return true;
  if (rect.name === 'flyZone' || rect.name.startsWith('flyZone_')) return true;
  return rect.props?.flyZone === true;
}

/** 真实 inFlyZone：点落在任一有效 flyZone 矩形内；无对象 → false（非恒短路硬编码）。 */
export function isPointInFlyZone(
  x: number, y: number,
  objects: readonly FlyZoneRect[] = [],
  zones: readonly FlyZoneRect[] = [],
): boolean {
  const hit = (r: FlyZoneRect) => Number.isFinite(r.w) && Number.isFinite(r.h) && r.w > 0 && r.h > 0
    && x >= r.x && x <= r.x + r.w && y >= r.y && y <= r.y + r.h;
  for (const o of objects) if (isFlyZoneRect(o) && hit(o)) return true;
  for (const z of zones) if (isFlyZoneRect(z) && hit(z)) return true;
  return false;
}

/**
 * 门禁优先级按 design/34 §2.1：境界 → 总开关 → 技能/区域 → 灵力。
 * 全条件满足时返回 ok（成功通路）；失败不扣蓝、不进入。
 */
export function canSustainFlight(config: FlyZonesConfig | null, request: SustainFlightRequest): FlightGateResult {
  if (!config) return rejected('unavailable');
  const current = request.realmOrder.indexOf(request.realmId), required = request.realmOrder.indexOf(config.unlockRealm);
  if (current < 0 || required < 0 || current < required) return rejected('locked_realm');
  if (!config.enabled) return rejected('disabled');
  if (!request.ownsSkill || !config.maps.includes(request.mapId) || !request.inFlyZone) return rejected('unavailable');
  if (!Number.isFinite(request.mp) || request.mp < config.mpPerSecond) return rejected('mp_low');
  return freeze({ ok: true });
}

/**
 * 成功：entered=true，mpSpent=首秒预算（mpPerSecond）；调用方负责扣蓝。
 * 失败：entered=false，mpSpent=0；不修改请求对象。
 */
export function requestSustainFlight(config: FlyZonesConfig | null, request: SustainFlightRequest): SustainFlightResult {
  const gate = canSustainFlight(config, request);
  if (!gate.ok) return freeze({ ...gate, entered: false, mpSpent: 0 });
  return freeze({ ok: true, entered: true, mpSpent: config!.mpPerSecond });
}
