import flyZonesRaw from '@xt/balance/fly_zones.json';
import { FLY_ZONES, FLY_ZONES_ERRORS, REALMS } from './data';
import { canSustainFlight, isPointInFlyZone, parseFlyZonesConfig, requestSustainFlight, type SustainFlightRequest } from './FlyZones';

/** 正式开态旁证；显式关态夹具验证门禁与坏表降级。 */
export function runFlyZonesTests() {
  let assertions = 0;
  function eq(actual: unknown, expected: unknown, message: string) {
    assertions++;
    if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
  }
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
  function allFrozen(value: unknown): boolean {
    return !value || typeof value !== 'object' || (Object.isFrozen(value) && Object.values(value).every(allFrozen));
  }
  const clone = (): Record<string, any> => structuredClone(flyZonesRaw);
  same(FLY_ZONES_ERRORS, [], '正式飞行表通过只读校验');
  ok(FLY_ZONES, 'data 导出已校验飞行表');
  eq(flyZonesRaw.enabled, true, '正式飞行表已软开');
  eq(FLY_ZONES.enabled, true, '运行时飞行表读取正式开态');
  ok(allFrozen(FLY_ZONES) && allFrozen(FLY_ZONES_ERRORS), '配置与诊断深只读');
  const input = clone(), checked = parseFlyZonesConfig(input);
  ok(checked.config && allFrozen(checked), '解析结果整体深只读');
  ok(!Object.isFrozen(input) && !Object.isFrozen(input.maps), '不冻结调用方输入');
  input.maps.push('__changed_after_parse');
  same(checked.config.maps, FLY_ZONES.maps, '只读快照不随调用者后改变化');
  const closedInput = clone(); closedInput.enabled = false;
  const closed = parseFlyZonesConfig(closedInput).config;
  ok(closed, '显式关态夹具通过校验');

  const request: SustainFlightRequest = {
    realmId: FLY_ZONES.unlockRealm, realmOrder: REALMS.map(realm => realm.id),
    ownsSkill: true, mapId: FLY_ZONES.maps[0], inFlyZone: true, mp: FLY_ZONES.mpPerSecond,
  };
  const before = JSON.stringify(request);
  for (const mapId of [...FLY_ZONES.maps, '__not_whitelisted']) {
    for (const ownsSkill of [true, false]) for (const inFlyZone of [true, false]) for (const mp of [0, request.mp]) {
      same(canSustainFlight(closed, { ...request, mapId, ownsSkill, inFlyZone, mp }),
        { ok: false, reason: 'disabled', messageKey: 'fly.zone_disabled' }, '关态优先于技能、区域与灵力条件');
    }
  }
  const denied = requestSustainFlight(closed, request);
  same(denied, { ok: false, reason: 'disabled', messageKey: 'fly.zone_disabled', entered: false, mpSpent: 0 }, '持续飞行请求拒绝且不扣蓝');
  ok(allFrozen(denied), '请求结果只读');
  same(request, JSON.parse(before), '请求未写入飞行姿态、灵力或其他状态');
  same(canSustainFlight(closed, { ...request, realmId: REALMS[0].id, mp: 0 }),
    { ok: false, reason: 'locked_realm', messageKey: 'fly.locked_realm' }, '筑基前境界提示优先于表关闭');
  const noOtherReads = { realmId: FLY_ZONES.unlockRealm, realmOrder: request.realmOrder } as SustainFlightRequest;
  for (const key of ['ownsSkill', 'mapId', 'inFlyZone', 'mp']) {
    Object.defineProperty(noOtherReads, key, { get() { throw new Error(`关态不得读取 ${key}`); } });
  }
  const closedGate = canSustainFlight(closed, noOtherReads);
  eq(closedGate.ok, false, '关态短路');
  if (!closedGate.ok) eq(closedGate.messageKey, 'fly.zone_disabled', '关态短路不查询后续依赖与耗蓝');
  eq(requestSustainFlight(null, request).mpSpent, 0, '坏表拒绝也不扣蓝');
  const nullGate = canSustainFlight(null, request);
  eq(nullGate.ok, false, '坏表拒绝');
  if (!nullGate.ok) eq(nullGate.messageKey, 'fly.zone_unavailable', '坏表不可持续飞行');

  const mutations: [string, (raw: Record<string, any>) => void][] = [
    ['$.version', raw => { delete raw.version; }],
    ['$.enabled', raw => { raw.enabled = 'false'; }],
    ['$.skillId', raw => { raw.skillId = '__wrong_skill'; }],
    ['$.unlockRealm', raw => { raw.unlockRealm = '__wrong_realm'; }],
    ['$.mpPerSecond', raw => { raw.mpPerSecond = null; }],
    ['$.maxFlightMs', raw => { raw.maxFlightMs = 0; }],
    ['$.knockdownOnHit', raw => { delete raw.knockdownOnHit; }],
    ['$.cannotAttackWhileFlying', raw => { raw.cannotAttackWhileFlying = null; }],
    ['$.maps', raw => { delete raw.maps; }],
    ['$.maps[0]', raw => { raw.maps[0] = { id: raw.maps[0], enabled: false }; }],
    ['$.maps[1]', raw => { raw.maps[1] = raw.maps[0]; }],
    ['$.balanceTodo', raw => { raw.balanceTodo = ['mpPerSecond']; }],
  ];
  for (const [path, mutate] of mutations) {
    const raw = clone(); mutate(raw);
    const invalid = parseFlyZonesConfig(raw);
    eq(invalid.config, null, `坏表 ${path} 不可用`);
    ok(invalid.errors.some(error => error.includes(path)), `坏表 ${path} 保留字段诊断`);
    eq(requestSustainFlight(invalid.config, request).mpSpent, 0, '坏表请求无扣费');
  }
  for (const invalid of [null, undefined, [], 0, 'invalid']) eq(parseFlyZonesConfig(invalid).config, null, '根必须为对象');

  // 成功通路：全条件满足 → ok／entered／首秒扣蓝预算；请求对象仍只读。
  same(canSustainFlight(FLY_ZONES, request), { ok: true }, '全条件满足允许进入持续飞行');
  const entered = requestSustainFlight(FLY_ZONES, request);
  same(entered, { ok: true, entered: true, mpSpent: FLY_ZONES.mpPerSecond }, '成功进入声明首秒蓝预算');
  same(request, JSON.parse(before), '成功路径也不改写请求对象');
  eq(isPointInFlyZone(10, 10, [], []), false, '无 flyZone 对象则区外');
  eq(isPointInFlyZone(15, 15, [{ type: 'flyZone', name: 'flyZone_a', x: 0, y: 0, w: 40, h: 40 }], []), true, 'type=flyZone 命中');
  eq(isPointInFlyZone(15, 15, [{ type: 'npc', name: 'flyZone_a', x: 0, y: 0, w: 40, h: 40 }], []), true, 'name 前缀 flyZone_ 命中');
  eq(isPointInFlyZone(15, 15, [], [{ name: 'air', x: 0, y: 0, w: 40, h: 40, props: { flyZone: true } }]), true, 'zone props.flyZone 命中');
  eq(isPointInFlyZone(100, 100, [{ type: 'flyZone', name: 'flyZone_a', x: 0, y: 0, w: 40, h: 40 }], []), false, '矩形外不命中');
  console.log(`fly zones tests ok: ${assertions} assertions (formal open, closed fixture, realm priority, no MP mutation, immutable parsing; softOpenedSustainFlight=true delivery evidence only, not a runtime gate)`);
}
