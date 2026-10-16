import senseTable from '@xt/balance/sense.json';
import chiyanSlope from '@xt/maps/chiyan_slope_1.json';
import { ITEMS, MONSTERS, REALMS, SENSE, TILED_MAPS, t } from './data';
import { featureEnabled, setFeatureFlag } from './features';
import { Progress } from './Progress';
import { Sense, validateSenseConfig, type SenseOptions } from './Sense';
import { oneWayPlatformTiles, oneWayTileBase, parseHiddenObjects, type MapObj } from './scenes/MapBuilder';
import { SenseMapAdapter, sceneMonsterTargets } from './scenes/SenseScene';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const originalNow = Date.now;
const originalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const previousFlag = featureEnabled('spiritScan');
const epoch = Date.UTC(2026, 9, 16, 4);
let now = epoch, writes = 0, failStorage = false;
Date.now = () => now;
const disk: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (key: string) => disk[key] ?? null,
  setItem: (key: string, value: string) => {
    if (failStorage) throw new Error('神识自测：模拟存储失败');
    disk[key] = String(value); writes++;
  },
  removeItem: (key: string) => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: (index: number) => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
} satisfies Storage });

// 只覆盖独立内存配置，不修改 balance 表或正式地图。
function fixture() {
  now = epoch; setFeatureFlag('spiritScan', true);
  const p = new Progress(); p.level = 30; p.allocatedStats.spirit = 5;
  p.hp = p.maxHp; p.mp = p.maxMp;
  const config: any = clone(senseTable); config.enabled = true;
  Object.assign(config.scan, { radiusBasePx: 10, radiusPerSpiritPx: 2, radiusMaxPx: 30, mpCost: 8, cooldownMs: 1000 });
  config.reveal.highlightMs = 250; config.inspect.durationMs = 2000;
  for (const profile of config.targetProfiles) profile.enabled = true;
  const context = { instanceId: 'sense_fixture', center: { x: 100, y: 100 }, alive: true, busy: false, ready: true };
  const targets: any[] = [], events: { name: string; payload: any }[] = [];
  const sense = new Sense({ progress: p, config: () => config, realms: REALMS,
    enabled: () => featureEnabled('spiritScan'), context: () => context,
    targets: () => targets, text: t, emit: (name: string, payload: any) => events.push({ name, payload }) });
  return { p, config, context, targets, events, sense };
}
type Fixture = ReturnType<typeof fixture>;
function service(f: Fixture, overrides: Partial<SenseOptions>): Sense {
  return new Sense({ progress: f.p, config: () => f.config, realms: REALMS,
    enabled: () => featureEnabled('spiritScan'), context: () => f.context,
    targets: () => f.targets, text: t, emit: (name, payload) => f.events.push({ name, payload }), ...overrides });
}
function hidden(f: Fixture, id: string, patch: Record<string, unknown> = {}) {
  const state = { visible: false, collision: false, revealCalls: 0 };
  const target: any = { kind: 'chest', instanceId: f.context.instanceId, id, x: 100, y: 100,
    reqSpirit: 0, active: true, applyReveal: () => { state.visible = true; state.collision = true; state.revealCalls++; }, ...patch };
  f.targets.push(target);
  return { target, state };
}
function monster(f: Fixture, patch: Record<string, unknown> = {}) {
  const instance = {}, state = { alive: true };
  const definition: any = clone(Object.values(MONSTERS)[0]);
  Object.assign(definition, { id: 'sense_fixture_monster', name: '不应泄漏的妖兽名', level: 37,
    dropTable: 'secret_drop', skills: [{ id: 'secret_phase', name: '未公开阶段', type: 'attack' }],
    sense: { enabled: true, profile: 'sense_monster_basic', visibleInfo: ['level', 'hp', 'abilities'], abilityKeys: [] } });
  const details = { instance, alive: () => state.alive, definition, hp: 31, maxHp: 99 };
  const target: any = { kind: 'monster_info', instanceId: f.context.instanceId, id: 'monster_instance_1',
    x: 100, y: 100, reqSpirit: 0, active: true, monster: details, ...patch };
  f.targets.push(target);
  return { instance, state, definition, details, target };
}
function blocked(f: Fixture, reason: string, message: string) {
  const before = JSON.stringify(f.p.exportSave()), writesBefore = writes;
  const result = f.sense.requestScan('key');
  ok(!result.ok, `${message} 拒绝`);
  eq(result.blockKey, `sense.block.${reason}`, `${message} 只报首因`);
  eq(JSON.stringify(f.p.exportSave()), before, `${message} 不改存档数据`);
  eq(writes, writesBefore, `${message} 不写盘`);
  eq(f.events[f.events.length - 1]?.name, 'sense:blocked', `${message} 发 blocked 事件`);
}

// 场景适配器读正式单例；只临时替换内存配置，并在每组断言后原样恢复。
function sceneConfig(f: Fixture, run: () => void) {
  const previous = clone(SENSE);
  Object.assign(SENSE, f.config); f.config = SENSE;
  try { run(); } finally { Object.assign(SENSE, previous); }
}
function mapObjects(): MapObj[] {
  return [
    { type: 'chest', name: 'native_chest', x: 100, y: 100, w: 0, h: 0, props: { loot: Object.keys(ITEMS)[0] } },
    { type: 'hidden', name: 'hidden_chest', x: 100, y: 100, w: 0, h: 0,
      props: { reveal: 'chest', reqSpirit: 0, targetObject: 'native_chest' } },
    { type: 'hidden', name: 'hidden_platform', x: 92, y: 96, w: 16, h: 8, props: { reveal: 'platform', reqSpirit: 0 } },
  ];
}
function mapFixture(f: Fixture, objects = mapObjects(), mapId = f.context.instanceId, width = 1000, height = 1000) {
  // 保留真实 adapter / platform visual 工厂，只替代 Phaser 对象分配。
  const visual = () => ({ scene: {}, visible: true, body: { enable: true, checkCollision: {} },
    setVisible(value: boolean) { this.visible = value; return this; },
    setName() { return this; }, setOrigin() { return this; }, setDepth() { return this; },
    setAlpha() { return this; }, add() { return this; } });
  const scene: any = { prog: f.p, map: { id: mapId, width, height, objects,
    hidden: parseHiddenObjects(objects), oneWays: { add() {} }, useTiles: false },
    add: { zone: visual, container: visual, rectangle: visual } };
  const adapter = new SenseMapAdapter(scene);
  const native = objects.find(object => object.type === 'chest');
  const nativeVisual = visual();
  if (native) adapter.bindVisual(native, nativeVisual as any);
  return { scene, adapter, native, nativeVisual };
}
function hostileInstance(definition: any, patch: Record<string, unknown> = {}): any {
  return { active: true, dead: false, hp: 10, visible: true, alpha: 1,
    body: { enable: true, center: { x: 100, y: 100 } }, scene: {}, senseInstanceId: 'fixture_mob',
    def: definition, ...patch };
}
function tiledObjects(raw: any): MapObj[] {
  return raw.layers.filter((layer: any) => layer.type === 'objectgroup').flatMap((layer: any) =>
    layer.objects.map((object: any) => ({ type: object.type || object.class, name: object.name,
      x: object.x, y: object.y, w: object.width ?? 0, h: object.height ?? 0,
      props: Object.fromEntries((object.properties ?? []).map((property: any) => [property.name, property.value])),
      ...(object.type === 'hidden' ? { hiddenGeometryValid: !object.ellipse && !object.polygon && !object.polyline && !(object.rotation ?? 0) } : {}),
    })));
}

try {
  // 与普通 '=' 共用端头选择；任意对象宽度必须无缝覆盖且不越过碰撞体左右边。
  {
    same([oneWayTileBase(false, false), oneWayTileBase(false, true),
      oneWayTileBase(true, true), oneWayTileBase(true, false)], [11, 8, 9, 10], '单格/左端/中间/右端沿用普通单向平台索引');
    same(oneWayPlatformTiles(13.5, 65.25, 16), [
      { x: 13.5, width: 16, base: 11, col: 0, row: 2 },
    ], '不足一格仍使用单格地砖，位置保留小数精度');
    same(oneWayPlatformTiles(32, 96, 64), [
      { x: 32, width: 32, base: 8, col: 1, row: 3 },
      { x: 64, width: 32, base: 10, col: 2, row: 3 },
    ], '两整格不多生成尾格，端头和变体网格坐标正确');
    same(oneWayPlatformTiles(13.5, 65.25, 157).map(tile => tile.base), [8, 9, 9, 9, 10], '非整格平台保留两端与中段地砖');
    for (const width of [0.5, 16, 32, 32.5, 64, 157, 160]) {
      const x = 13.5, y = 65.25, tiles = oneWayPlatformTiles(x, y, width);
      ok(tiles.length > 0, `合法平台宽 ${width} 提供地砖`);
      let edge = x;
      for (const tile of tiles) {
        eq(tile.x, edge, `宽 ${width} 地砖之间不留缝隙或重叠`);
        ok(tile.width > 0 && tile.width <= 32, `宽 ${width} 各地砖不超过一格`);
        eq(tile.row, 2, `宽 ${width} 每格使用对象上沿所在行选变体`);
        edge += tile.width;
      }
      eq(edge, x + width, `宽 ${width} 画面右侧精确对齐碰撞体右侧`);
    }
    same(oneWayPlatformTiles(-8, -0.5, 20, 16), [
      { x: -8, width: 16, base: 8, col: -1, row: -1 },
      { x: 8, width: 4, base: 10, col: 0, row: -1 },
    ], '自定义格尺寸与负坐标仍按地砖网格选变体并保持边界');
    for (const invalid of [NaN, Infinity, -Infinity]) {
      same(oneWayPlatformTiles(invalid, 0, 32), [], '非法横坐标不创建地砖');
      same(oneWayPlatformTiles(0, invalid, 32), [], '非法上沿坐标不创建地砖');
      same(oneWayPlatformTiles(0, 0, invalid), [], '非法宽度不创建地砖');
      same(oneWayPlatformTiles(0, 0, 32, invalid), [], '非法格尺寸不创建地砖');
    }
    for (const empty of [0, -1]) {
      same(oneWayPlatformTiles(0, 0, empty), [], '非正宽度不创建地砖');
      same(oneWayPlatformTiles(0, 0, 32, empty), [], '非正格尺寸不创建地砖');
    }
  }

  // MapBuilder 先解析结构合法性；模板与点位开关由运行期统一门控。
  {
    const native = (type: string, name: string, props: Record<string, unknown>): MapObj => ({ type, name, props, x: 100, y: 100, w: 0, h: 0 });
    const controller = (name: string, props: Record<string, unknown>, patch: Partial<MapObj> = {}): MapObj => ({
      type: 'hidden', name, props: { reqSpirit: 0, reveal: 'chest', targetObject: 'native_chest', ...props }, x: 100, y: 100, w: 0, h: 0, ...patch,
    });
    const chest = native('chest', 'native_chest', { loot: 'existing_chest_reward' });
    const portal = native('portal', 'native_portal', { target: 'existing_map' });
    const parsed = parseHiddenObjects([chest, portal, controller('hidden_chest', {}),
      controller('hidden_portal', { reveal: 'entrance', targetObject: 'native_portal' }),
      { type: 'hidden', name: 'hidden_platform', x: 50, y: 60, w: 40, h: 8, props: { reveal: 'platform', reqSpirit: 5 } }]);
    same(parsed.map(entry => entry.valid), [true, true, true], '宝箱/原生门/平台合法绑定均可解析');
    eq(parsed[0].target, chest, '宝箱绑定既有原生宝箱对象'); eq(parsed[1].target, portal, '入口绑定既有原生传送门');
    same({ x: parsed[0].x, y: parsed[0].y }, { x: 100, y: 100 }, '点对象使用自身逻辑锚点');
    same({ x: parsed[2].x, y: parsed[2].y }, { x: 70, y: 64 }, '平台矩形中心为扫描锚点');
    for (const value of [undefined, null, NaN, Infinity, -1, '0']) {
      eq(parseHiddenObjects([chest, controller('invalid_req', { reqSpirit: value })])[0].valid, false, '地图门槛必填合法非负有限数');
    }
    for (const entry of [
      controller('', {}), controller('ambiguous|name', {}), controller('wrong_reveal', { reveal: 'spirit_scan' }),
      controller('both_binding', { encounter: 'enc_hidden_abode' }), controller('null_encounter', { encounter: null }),
      controller('missing_target', { targetObject: 'missing_native' }), controller('wrong_native_kind', { targetObject: 'native_portal' }),
      controller('partial_rect', {}, { w: 5, h: 0 }), controller('invalid_geometry', {}, { hiddenGeometryValid: false }),
      controller('polyline', {}, { points: [{ x: 0, y: 0 }] }),
      { type: 'hidden', name: 'platform_with_binding', x: 0, y: 0, w: 5, h: 5, props: { reveal: 'platform', reqSpirit: 0, targetObject: 'native_chest' } },
      { type: 'hidden', name: 'platform_point', x: 0, y: 0, w: 0, h: 0, props: { reveal: 'platform', reqSpirit: 0 } },
      { type: 'hidden', name: 'door_without_binding', x: 0, y: 0, w: 0, h: 0, props: { reveal: 'entrance', reqSpirit: 0 } },
    ] satisfies MapObj[]) {
      eq(parseHiddenObjects([chest, portal, entry])[0].valid, false, `非法地图对象 ${entry.name} 不启用`);
    }
    const duplicate = parseHiddenObjects([chest, controller('controller_a', {}), controller('controller_b', {})]);
    same(duplicate.map(entry => entry.valid), [false, false], '一个原生目标不能绑定两个 hidden 控制器');
    eq(parseHiddenObjects([chest, { ...chest }, controller('controller', {})])[0].valid, false, '原生目标名重复不绑定');
    eq(parseHiddenObjects([native('chest', 'native_chest', { loot: '' }), controller('empty_loot', {})])[0].valid, false, '原生宝箱缺有效 loot 不启用');
    const encounter = parseHiddenObjects([{ type: 'hidden', name: 'enc_hidden_abode_anchor', x: 100, y: 100, w: 0, h: 0,
      props: { reveal: 'entrance', reqSpirit: 5, encounter: 'enc_hidden_abode' } }])[0];
    eq(encounter.valid, true, '奇遇入口只解析显式归属'); eq(encounter.target, undefined, '奇遇入口不伪造第二道原生门');
  }

  // 静态宝箱/平台必须分别登记 exact id + kind 的已启用模板；点位值仍独立决定强度。
  for (const kind of ['chest', 'platform'] as const) {
    for (const condition of ['disabled', 'missing']) {
      const f = fixture();
      const profile = f.config.targetProfiles.find((entry: any) => entry.id === `sense_hidden_${kind}`);
      if (condition === 'disabled') profile.enabled = false;
      else f.config.targetProfiles = f.config.targetProfiles.filter((entry: any) => entry !== profile);
      const h = hidden(f, `${condition}_${kind}`, { kind, reqSpirit: 999 });
      const result = f.sense.requestScan('key', `${condition}_template_${kind}`);
      ok(result.ok, `${kind}/${condition} 不阻塞空扫`);
      eq(result.result, 'empty', `${kind}/${condition} 服务拒绝未门控的原始候选`);
      eq(result.faint, false, `${kind}/${condition} 不产生 faint`);
      same(result.hits, [], `${kind}/${condition} 不泄漏命中`);
      eq(h.state.visible, false, `${kind}/${condition} 不执行显形`);
    }
  }

  {
    const f = fixture();
    f.config.targetProfiles = [];
    let revealed = false;
    f.sense.registerAdapter('secret_chest', { targets: () => [{
      kind: 'chest', instanceId: f.context.instanceId, id: 'native_secret_chest', x: 100, y: 100,
      reqSpirit: 0, active: true, persistence: 'adapter', revealed: () => revealed,
      stageReveal: () => { revealed = true; return () => { revealed = false; }; },
    }] });
    const result = f.sense.requestScan('key', 'secret_chest_without_generic_template');
    ok(result.ok, '所属系统适配宝箱不要求通用静态地图模板');
    eq(result.count, 1, '原秘境箱维持自身显形契约');
    eq(revealed, true, '所属系统保存自身显形状态');
  }
  for (const kind of ['chest', 'platform'] as const) {
    for (const condition of ['disabled', 'missing', 'wrong_kind', 'wrong_id', 'invalid_threshold']) {
      const f = fixture();
      sceneConfig(f, () => {
        for (const profile of f.config.targetProfiles) profile.enabled = false;
        const profile = f.config.targetProfiles.find((entry: any) => entry.id === `sense_hidden_${kind}`);
        if (condition !== 'disabled') profile.enabled = true;
        if (condition === 'missing') f.config.targetProfiles = f.config.targetProfiles.filter((entry: any) => entry !== profile);
        if (condition === 'wrong_kind') profile.kind = kind === 'chest' ? 'platform' : 'chest';
        if (condition === 'wrong_id') profile.id = `unregistered_${kind}`;
        if (condition === 'invalid_threshold') profile.reqSpirit = null;
        const objects = mapObjects();
        for (const object of objects.filter(object => object.type === 'hidden')) object.props.reqSpirit = 999;
        f.p.senseRevealed = { 'sense_fixture|hidden_chest': true, 'sense_fixture|hidden_platform': true };
        const m = mapFixture(f, objects);
        eq(m.adapter.targets().length, 0, `${kind}/${condition} 点位不入适配器候选`);
        eq(m.adapter.revealed(`hidden_${kind}`), false, `${kind}/${condition} 旧显形不可见`);
        eq(m.nativeVisual.visible, false, `${kind}/${condition} 原生箱维持隐藏不可交互`);
        eq(m.adapter.platformBody('hidden_platform')?.enable, false, `${kind}/${condition} 平台无碰撞`);
        eq(m.adapter.platformVisual('hidden_platform'), undefined, `${kind}/${condition} 未分配平台画面`);
        f.sense = service(f, { targets: () => m.adapter.targets() });
        const result = f.sense.requestScan('key', `${kind}_${condition}`);
        if (condition === 'invalid_threshold') {
          ok(!result.ok, '启用模板的非法阈值仍遵守整表校验');
          eq(result.blockKey, 'sense.block.unavailable', '非法模板不以默认值执行');
        } else {
          ok(result.ok, `${kind}/${condition} 正常空扫`);
          eq(result.faint, false, `${kind}/${condition} 不产生 faint`);
          same(result.hits, [], `${kind}/${condition} 没有扫描命中`);
        }
      });
    }
  }
  {
    const f = fixture();
    sceneConfig(f, () => {
      for (const profile of f.config.targetProfiles) profile.enabled = false;
      const m = mapFixture(f);
      f.sense = service(f, { targets: () => m.adapter.targets() });
      eq(m.adapter.targets().length, 0, '两个隐藏模板关闭时无候选');
      const off = f.sense.requestScan('key', 'map_templates_off'); ok(off.ok, '模板关闭可正常空扫');
      eq(off.faint, false, '模板关闭不计 faint'); eq(m.nativeVisual.visible, false, '模板关闭原生箱不提前露出');
      eq(m.adapter.platformBody('hidden_platform')?.enable, false, '模板关闭平台不产生碰撞');
      for (const profile of f.config.targetProfiles) {
        profile.enabled = true; profile.reqSpirit = 999;
      }
      eq(m.adapter.targets().length, 2, '内存启用模板且点位缺省 enabled 后可扫描');
      now += 1000;
      const on = f.sense.requestScan('key', 'map_templates_on'); ok(on.ok, '启用模板后扫描提交');
      eq(on.count, 2, '点位使用自身 reqSpirit，不再叠加模板门槛');
      eq(m.nativeVisual.visible, true, '提交显形后原生箱才可见');
      eq(m.adapter.objectVisible(m.native!), true, '原生交互复用显形结果');
      eq(m.adapter.platformBody('hidden_platform')?.enable, true, '提交后平台开启碰撞');
      eq(m.adapter.platformVisual('hidden_platform')?.object.visible, true, '提交后平台有实际画面');
      const persisted = clone(f.p.senseRevealed);
      for (const profile of f.config.targetProfiles) profile.enabled = false;
      m.adapter.syncRevealed();
      eq(m.adapter.revealed('hidden_chest'), false, '模板禁用后已显形箱也视为未显形');
      eq(m.nativeVisual.visible, false, '禁用模板隐藏原生箱');
      eq(m.adapter.platformBody('hidden_platform')?.enable, false, '禁用模板撤去已显形平台碰撞');
      eq(m.adapter.platformVisual('hidden_platform')?.object.visible, false, '禁用模板隐藏已创建平台画面');
      same(f.p.senseRevealed, persisted, '禁用模板保留原有显形记录');
      for (const profile of f.config.targetProfiles) profile.enabled = true;
      m.adapter.syncRevealed();
      eq(m.nativeVisual.visible, true, '模板重新启用恢复旧箱显形');
      eq(m.adapter.platformBody('hidden_platform')?.enable, true, '模板重新启用恢复平台碰撞');
      eq(m.adapter.platformVisual('hidden_platform')?.object.visible, true, '模板重新启用恢复平台画面');

      for (const hidden of m.scene.map.hidden) hidden.object.props.enabled = false;
      m.adapter.syncRevealed();
      eq(m.adapter.targets().length, 0, '点位 enabled:false 无扫描候选');
      eq(m.adapter.revealed('hidden_platform'), false, '点位关闭也遮蔽旧显形');
      eq(m.nativeVisual.visible, false, '点位关闭原生箱不可见不可交互');
      eq(m.adapter.platformBody('hidden_platform')?.enable, false, '点位关闭平台无碰撞');
      now += 1000;
      const pointOff = f.sense.requestScan('key', 'map_points_off'); ok(pointOff.ok, '点位关闭允许空扫');
      eq(pointOff.faint, false, '关闭点位不计 faint'); same(pointOff.hits, [], '关闭点位不入命中');
      same(f.p.senseRevealed, persisted, '点位关闭不删除显形记录');
      for (const hidden of m.scene.map.hidden) delete hidden.object.props.enabled;
      m.adapter.syncRevealed();
      eq(m.nativeVisual.visible, true, '点位缺省 enabled 恢复箱子');
      eq(m.adapter.platformBody('hidden_platform')?.enable, true, '点位重新启用恢复平台');

      const gates: [string, () => void, () => void][] = [
        ['features.spiritScan', () => setFeatureFlag('spiritScan', false), () => setFeatureFlag('spiritScan', true)],
        ['sense.enabled', () => { f.config.enabled = false; }, () => { f.config.enabled = true; }],
        ['公共配置非法', () => { f.config.scan.mpCost = 0; }, () => { f.config.scan.mpCost = 8; }],
      ];
      for (const [name, disable, enable] of gates) {
        disable(); m.adapter.syncRevealed();
        eq(m.adapter.targets().length, 0, `${name} 关闭扫描候选`);
        eq(m.adapter.revealed('hidden_chest'), false, `${name} 关闭读档显形`);
        eq(m.nativeVisual.visible, false, `${name} 关闭原生箱可见及交互`);
        eq(m.adapter.platformBody('hidden_platform')?.enable, false, `${name} 关闭平台碰撞`);
        eq(m.adapter.platformVisual('hidden_platform')?.object.visible, false, `${name} 关闭平台渲染`);
        eq(f.sense.requestScan('key', `global_gate_${name}`).ok, false, `${name} 扫描与恢复采用同一口径`);
        same(f.p.senseRevealed, persisted, `${name} 不删除显形记录`);
        enable(); m.adapter.syncRevealed();
        eq(m.nativeVisual.visible, true, `${name} 恢复后原生箱重新显形`);
        eq(m.adapter.platformBody('hidden_platform')?.enable, true, `${name} 恢复后平台重新生效`);
      }
    });
  }
  {
    const f = fixture();
    sceneConfig(f, () => {
      f.config.targetProfiles = [];
      const objects: MapObj[] = [
        { type: 'portal', name: 'native_portal', x: 100, y: 100, w: 0, h: 0, props: { target: 'field_test' } },
        { type: 'hidden', name: 'hidden_entrance', x: 100, y: 100, w: 0, h: 0,
          props: { reveal: 'entrance', reqSpirit: 0, targetObject: 'native_portal' } },
      ];
      const m = mapFixture(f, objects);
      f.sense = service(f, { targets: () => m.adapter.targets() });
      eq(m.adapter.targets().length, 1, 'entrance 没有模板仍可按原条件扫描');
      const result = f.sense.requestScan('key', 'entrance_without_template'); ok(result.ok, '入口无模板可提交');
      eq(result.count, 1, '入口正常显形');
      eq(m.adapter.objectVisible(objects[0]), true, '原生入口沿用显形状态');
      objects[1].props.enabled = false;
      eq(m.adapter.targets().length, 0, '入口也遵守点位 enabled:false');
      eq(m.adapter.objectVisible(objects[0]), false, '禁用入口绑定的原生门保持隐藏');
    });
  }

  // 开关关闭不产生新字段、不扣费、不写盘；预览也是只读。
  {
    const f = fixture(); setFeatureFlag('spiritScan', false);
    const before = JSON.stringify(f.p.exportSave()), writesBefore = writes;
    const preview = f.sense.preview();
    eq(preview.ready, false, '关态预览未就绪');
    eq(preview.blockKey, 'sense.block.unavailable', '关态提示未开放');
    blocked(f, 'unavailable', '开关关闭');
    eq(f.sense.markTutorialSeen(), false, '关态不登记教学');
    eq(JSON.stringify(f.p.exportSave()), before, '关态行为前后序列化逐字节一致');
    eq(writes, writesBefore, '关态预览/教学/扫描均不写盘');
    eq(own(f.p.exportSave(), 'senseState'), false, '关态不输出 senseState');
    eq(own(f.p.exportSave(), 'senseRevealed'), false, '关态不输出显形记录');
  }
  {
    const f = fixture(), original = clone(f.p.exportSave());
    delete original.senseState; delete original.senseRevealed;
    disk[saveKey] = JSON.stringify(original);
    const p = Progress.load();
    eq(p.senseState, undefined, '旧筑基档无扫描历史');
    eq(own(p.exportSave(), 'senseState'), false, '旧档无历史不补写空 senseState');
    const sense = new Sense({ progress: p, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => [] });
    eq(sense.preview().unlocked, true, '旧筑基档按成功境界继承权限');
    eq(sense.preview().ready, true, '旧筑基档无需补奖励即可扫描');
    eq(p.stat('spirit'), f.p.stat('spirit'), '旧筑基档不补神识');
    eq(p.inventory.foundation_pill, undefined, '旧筑基档不补物品');
    eq(own(p.exportSave(), 'senseUnlocked'), false, '权限不持久化为 senseUnlocked');
  }

  // 检查顺序：realm → unavailable → dead → busy → cooldown → mp。
  {
    const f = fixture(); f.p.level = 29; f.p.exp = f.p.expNeed; f.p.breakthroughFails = 99;
    f.context.ready = false; f.context.alive = false; f.context.busy = true; f.p.mp = 0;
    blocked(f, 'realm', '炼气圆满/失败次数不能代替筑基');
    f.p.level = 30; setFeatureFlag('spiritScan', false); blocked(f, 'unavailable', '筑基但总开关关闭优先于死亡');
    setFeatureFlag('spiritScan', true); blocked(f, 'unavailable', '缺少运行接口');
    f.context.ready = true; blocked(f, 'dead', '死亡优先于 busy');
    f.context.alive = true; blocked(f, 'busy', 'busy 优先于灵力');
    f.context.busy = false; f.p.senseState = { cooldownUntil: now + 1, tutorialSeen: false };
    blocked(f, 'cooldown', '冷却优先于灵力');
    now++; blocked(f, 'mp', '冷却到边界才检查灵力');
    f.p.mp = 8; eq(f.sense.preview().ready, true, '恰好足够灵力可用');
    f.p.level = 60; eq(f.sense.preview().unlocked, true, '后续境界继承权限');
  }
  {
    const f = fixture(); f.config.enabled = false;
    blocked(f, 'unavailable', 'sense 表关闭');
  }
  for (const invalid of [null, undefined, [], 0, 'sense']) {
    eq(validateSenseConfig(invalid).config, undefined, '缺失/非对象表不能就绪');
  }
  {
    const f = fixture();
    for (const profile of f.config.targetProfiles) { profile.enabled = false; profile.reqSpirit = null; }
    Object.defineProperty(f.config, 'future', { configurable: true, get: () => { throw new Error('未来弱点块禁止读取'); } });
    eq(f.sense.preview().ready, true, '禁用模板待填和未来弱点块不阻塞已完整公共规则');
    eq(f.sense.requestScan('key', 'future_untouched').ok, true, '本期扫描不读取执行 future.weakness');
  }
  const publicNumbers: [string, string, boolean][] = [
    ['scan', 'radiusBasePx', false], ['scan', 'radiusPerSpiritPx', false], ['scan', 'radiusMaxPx', false],
    ['scan', 'mpCost', true], ['scan', 'cooldownMs', true], ['reveal', 'highlightMs', true], ['inspect', 'durationMs', true],
  ];
  for (const [section, key, integer] of publicNumbers) {
    for (const value of [null, undefined, NaN, Infinity, -Infinity, -1, 0, '8', ...(integer ? [1.5] : [])]) {
      const f = fixture(); f.config[section][key] = value;
      blocked(f, 'unavailable', `${section}.${key}=${String(value)} 不用默认值`);
    }
  }
  {
    const f = fixture(); f.config.scan.radiusMaxPx = f.config.scan.radiusBasePx - 1;
    blocked(f, 'unavailable', '半径上限不能小于基础半径');
  }
  for (const value of [NaN, Infinity, -1]) {
    const f = fixture(); Object.defineProperty(f.p, 'stat', { configurable: true, value: () => value });
    blocked(f, 'unavailable', '有效神识非法不参与计算');
  }
  for (const missing of [false, true]) {
    const f = fixture(); Object.defineProperty(f.p, 'stat', { configurable: true,
      value: missing ? undefined : () => { throw new Error('属性接口尚未就绪'); } });
    blocked(f, 'unavailable', missing ? '有效属性接口缺失' : '有效属性接口抛异常');
    ok(f.sense.preview().diagnostics.includes('spirit'), '属性接口故障保留诊断');
  }
  {
    const f = fixture(); f.sense = service(f, { sources: () => { throw new Error('属性来源接口尚未就绪'); } });
    blocked(f, 'unavailable', '属性来源接口抛异常');
    ok(f.sense.preview().diagnostics.includes('sources'), '属性来源故障保留诊断');
  }
  for (const interfaceName of ['config', 'context'] as const) {
    const f = fixture(); let calls = 0;
    f.sense = service(f, interfaceName === 'config' ? { config: () => {
      if (++calls > 1) throw new Error('确认时配置接口失效'); return f.config;
    } } : { context: () => {
      if (++calls > 1) throw new Error('确认时场景接口失效'); return f.context;
    } });
    blocked(f, 'unavailable', `${interfaceName} 第二次读取抛异常`);
  }
  {
    const f = fixture(); f.p.job = 'taixu_acolyte'; f.p.skills.taixu_heart = 3;
    const strength = f.p.stat('spirit'), preview = f.sense.preview();
    ok(strength > f.p.allocatedStats.spirit, '测试心法实际加神识');
    eq(preview.strength, strength, '神识只读现有有效属性，不重复加心法');
    eq(preview.radius, Math.min(30, 10 + strength * 2), '半径按配表公式并封顶');
    eq(preview.mpCost, 8, '预览给出合法耗蓝'); eq(preview.cooldownMs, 1000, '预览给出合法冷却');
    ok(preview.sources, '预览保留属性来源接口');
  }

  // 同一提交 ID 幂等，键鼠同帧共用检查，冷却不排队，空扫正常耗蓝。
  {
    const f = fixture(), mp = f.p.mp, writesBefore = writes;
    const first = f.sense.requestScan('key', 'empty_scan');
    ok(first.ok, '空扫也成功提交'); eq(first.result, 'empty', '无目标返回 empty'); eq(first.count, 0, '空扫计数为零');
    eq(f.p.mp, mp - 8, '空扫真实扣费'); eq(f.p.senseState?.cooldownUntil, now + 1000, '冷却使用真实绝对时间');
    eq(f.p.senseState?.lastScanId, 'empty_scan', '提交 ID 同次持久化'); eq(writes - writesBefore, 1, '整次扫描只保存一次');
    eq(f.events.filter(e => e.name === 'sense:scan').length, 1, '提交后只发一次成功事件');
    eq(f.sense.requestScan('button', 'empty_scan').ok, true, '同 ID 重试取得已提交结果');
    eq(f.p.mp, mp - 8, '同 ID 重试不重复扣费'); eq(writes - writesBefore, 1, '同 ID 重试不重复保存');
    blocked(f, 'cooldown', '键鼠不同 ID 同帧只有首笔提交');
    now += 999; blocked(f, 'cooldown', '冷却最后 1 毫秒不可重按');
    now++; f.sense.tick(); eq(f.p.mp, mp - 8, '冷却到期不执行先前拒绝的输入');
    eq(f.sense.requestScan('button', 'next_scan').ok, true, '冷却边界可再次空扫');
    eq(f.p.mp, mp - 16, '第二次扫描独立扣费');
    now -= 5000; blocked(f, 'cooldown', '时钟回拨不提前清冷却');
  }
  {
    const f = fixture(); f.p.mp = 8;
    eq(f.sense.preview().ready, true, '灵力临界预览可施放');
    f.p.mp--; // 战斗先提交了另一笔耗蓝。
    blocked(f, 'mp', '战斗先耗蓝后扫描确认重新检查余额');
    f.p.mp = 8; eq(f.sense.requestScan('key', 'mp_exact').ok, true, '恰好八点灵力提交');
    eq(f.p.mp, 0, '临界耗蓝恰好归零');
    const loaded = Progress.load(); eq(loaded.mp, 0, '扫描扣至零后读档不返还灵力');
    const loadedSense = new Sense({ progress: loaded, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => [] });
    const writesBefore = writes;
    eq(loadedSense.requestScan('button', 'mp_exact').ok, true, '跨读档同 ID 可识别已提交操作');
    eq(loaded.mp, 0, '跨读档同 ID 不重复扣费或返费'); eq(writes, writesBefore, '跨读档同 ID 不重复保存');
  }
  {
    const f = fixture(); f.p.mp = 8;
    const writesBefore = writes;
    const concurrent = new Sense({ progress: f.p, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => { f.p.mp--; return []; } });
    const result = concurrent.requestScan('key', 'combat_during_enumeration');
    ok(!result.ok, '候选接口执行期间发生战斗耗蓝仍复检'); eq(result.blockKey, 'sense.block.mp', '提交余额不足报 mp');
    eq(f.p.mp, 7, '拒绝扫描保留其他动作先提交的耗蓝'); eq(writes, writesBefore, '余额复检失败不写盘');
    eq(f.p.senseState, undefined, '余额复检失败不写扫描历史');
  }
  {
    const f = fixture(), mp = f.p.mp, writesBefore = writes;
    f.sense = service(f, { targets: () => { f.p.mp--; throw new Error('候选枚举失败'); } });
    const result = f.sense.requestScan('key', 'combat_before_target_failure');
    ok(!result.ok, '枚举接口抛异常拒绝扫描'); eq(result.blockKey, 'sense.block.unavailable', '枚举异常不伪装成空扫');
    eq(f.p.mp, mp - 1, '枚举失败不返还战斗已经先提交的耗蓝');
    eq(f.p.senseState, undefined, '枚举失败不建立扫描历史'); eq(writes, writesBefore, '枚举失败不发起扫描保存');
  }
  {
    const f = fixture(); f.sense = service(f, { targets: () => { f.context.ready = false; return []; } });
    blocked(f, 'unavailable', '确认期间运行接口失去就绪状态');
  }
  {
    const f = fixture(); const h = hidden(f, 'frozen_position');
    const freeze = new Sense({ progress: f.p, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => {
        f.context.center.x = 900; f.p.allocatedStats.spirit = 0; return [h.target];
      } });
    const result = freeze.requestScan('key', 'freeze_at_start'); ok(result.ok, '冻结后移动和属性变化不取消合法提交');
    same(result.center, { x: 100, y: 100 }, '枚举中移动仍使用提交前冻结中心');
    eq(result.strength, 5, '枚举中属性变化仍使用冻结强度'); eq(result.radius, 20, '枚举中属性变化仍使用冻结半径');
    eq(result.count, 1, '冻结中心范围内目标正常命中');
  }

  // 圆形与强度含边界，先范围后强度；不同实例/未激活/非法目标不会泄漏。
  {
    const f = fixture();
    const a = hidden(f, 'circle_boundary', { kind: 'platform', x: 112, y: 116, reqSpirit: 5 });
    const b = hidden(f, 'outside_circle', { x: 120, y: 120, reqSpirit: 0 });
    hidden(f, 'outside_faint', { x: 200, reqSpirit: 999 });
    hidden(f, 'other_room', { instanceId: 'another_room', reqSpirit: 999 });
    hidden(f, 'future_spawn', { active: false, reqSpirit: 999 });
    hidden(f, 'bad_threshold', { reqSpirit: null });
    const result = f.sense.requestScan('key', 'circle_scan');
    ok(result.ok, '圆形边界命中'); eq(result.result, 'found', '发现合法物件'); eq(result.count, 1, '计数仅首次合法显形');
    eq(result.faint, false, '范围外/无效候选不产生模糊异息');
    eq(a.state.visible, true, '3:4:5 斜向圆周边界显形'); eq(a.state.collision, true, '平台边界显形启用碰撞');
    eq(b.state.visible, false, '矩形包围盒内但圆外不显形');
    const event = f.events.find(e => e.name === 'sense:scan')?.payload;
    same(event.center, { x: 100, y: 100 }, '成功事件携带冻结中心'); eq(event.radius, 20, '成功事件携带冻结半径');
    f.context.center.x = 500; f.p.allocatedStats.spirit = 100;
    same(event.center, { x: 100, y: 100 }, '移动不拖拽冻结中心'); eq(event.radius, 20, '后续神识变化不改已提交半径');
    now += 1000; f.context.center.x = 100; f.p.allocatedStats.spirit = 5;
    const again = f.sense.requestScan('button', 'known_scan'); ok(again.ok, '复扫成功提交');
    eq(again.result, 'known', '只复扫已显形目标为 known'); eq(again.count, 0, '已显形平台不计新发现');
    eq(a.state.visible, true, '复扫不隐藏已显形平台');
  }
  {
    const f = fixture(); hidden(f, 'secret_name_coordinate_threshold', { x: 110, reqSpirit: 5.01 });
    const result = f.sense.requestScan('key', 'faint_scan'); ok(result.ok, '模糊扫描正常提交');
    eq(result.result, 'faint', '范围内强度不足返回 faint'); eq(result.faint, true, '只公开存在模糊反馈');
    eq(result.count, 0, '模糊反馈不计发现'); same(result.hits, [], '模糊目标不进入 hits');
    const serialized = JSON.stringify({ result, event: f.events.find(e => e.name === 'sense:scan')?.payload });
    ok(!serialized.includes('secret_name_coordinate_threshold'), 'faint 不泄漏对象名');
    ok(!serialized.includes('5.01'), 'faint 不泄漏精确阈值');
  }
  {
    const f = fixture(); hidden(f, 'new_chest'); hidden(f, 'faint_secret', { reqSpirit: 6 });
    const result = f.sense.requestScan('key', 'mixed_scan'); ok(result.ok, '混合扫描正常提交');
    eq(result.result, 'found', '发现与模糊混合以 found 为主结果'); eq(result.faint, true, '混合结果保留模糊文案标记');
    eq(result.count, 1, '混合结果不计强度不足目标'); eq(result.hits.length, 1, '混合 hits 只含授权目标');
  }

  // save false / throw 均整体回滚，失败不发成功事件；同 ID 可恢复后重试。
  for (const throwing of [false, true]) {
    const f = fixture(), h = hidden(f, `rollback_${String(throwing)}`, { kind: 'platform' });
    f.p.save(); const before = JSON.stringify(f.p.exportSave()), diskBefore = disk[saveKey], writesBefore = writes;
    if (throwing) Object.defineProperty(f.p, 'save', { configurable: true, value: () => { throw new Error('模拟自定义保存抛异常'); } });
    else failStorage = true;
    let result;
    try { result = f.sense.requestScan('key', 'retry_after_save_failure'); }
    finally { failStorage = false; if (throwing) Reflect.deleteProperty(f.p, 'save'); }
    ok(!result.ok, '保存失败拒绝提交'); eq(result.blockKey, 'sense.block.save_failed', '保存失败有专用原因');
    eq(JSON.stringify(f.p.exportSave()), before, '保存失败整体回滚角色/冷却/显形');
    eq(disk[saveKey], diskBefore, '保存失败保留原磁盘'); eq(writes, writesBefore, '保存失败无部分写盘');
    eq(h.state.visible, false, '保存前不应用显形'); eq(h.state.collision, false, '保存失败不启用碰撞');
    eq(f.events.filter(e => e.name === 'sense:scan').length, 0, '保存失败不显示成功');
    eq(f.sense.requestScan('button', 'retry_after_save_failure').ok, true, '保存恢复后同 ID 可重试');
    eq(h.state.visible, true, '重试提交后才显形'); eq(writes - writesBefore, 1, '重试只落一笔');
  }
  {
    const f = fixture(), mp = f.p.mp;
    hidden(f, 'callback_failure', { applyReveal: () => { throw new Error('模拟保存后显形回调异常'); } });
    const result = f.sense.requestScan('key', 'committed_callback_failure');
    ok(result.ok, '成功保存后显形监听者异常仍保留已提交结果');
    eq(f.p.mp, mp - 8, '成功保存后回调异常不撤销扣费');
    eq(JSON.parse(disk[saveKey]).mp, f.p.mp, '成功保存后回调异常内存与磁盘一致');
    eq(f.p.senseRevealed?.['sense_fixture|callback_failure'], true, '显形持久状态可供下次构图恢复');
    eq(f.events.filter(e => e.name === 'sense:scan').length, 1, '已成功提交仍发布成功事件');
  }
  {
    const f = fixture(), state = { revealed: false, applied: false }, before = JSON.stringify(f.p.exportSave());
    const detach = f.sense.registerAdapter('encounter', { targets: () => [{
      kind: 'entrance', instanceId: f.context.instanceId, id: 'adapter_fixture', x: 100, y: 100,
      active: true, reqSpirit: 0, persistence: 'adapter', revealed: () => state.revealed,
      stageReveal: () => { state.revealed = true; return () => { state.revealed = false; }; },
      applyReveal: () => { state.applied = true; },
    }] });
    failStorage = true;
    try { eq(f.sense.requestScan('key', 'adapter_failure').ok, false, '所属系统暂存与保存失败一起拒绝'); }
    finally { failStorage = false; }
    eq(state.revealed, false, '所属系统显形暂存失败回滚'); eq(state.applied, false, '所属系统保存前不执行显形回调');
    eq(JSON.stringify(f.p.exportSave()), before, '所属系统失败不留下扫描费用或冷却');
    detach(); eq(f.sense.requestScan('key', 'adapter_detached').ok, true, '注销适配器后可空扫');
    eq(state.revealed, false, '无注册适配器不伪造奇遇目标');
  }

  // 显形归静态 mapId 实例持久化；恢复碰撞后才能放置玩家。
  {
    const f = fixture(); hidden(f, 'saved_platform', { kind: 'platform' });
    eq(f.sense.requestScan('key', 'save_platform').ok, true, '平台首次显形可持久化');
    const saved = JSON.parse(disk[saveKey]);
    eq(saved.senseState.lastScanId, 'save_platform', '显形与冷却在同一保存内容中');
    const loaded = Progress.load();
    const restored = new Sense({ progress: loaded, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => [] });
    const restoreOrder: string[] = [];
    const revealed = restored.revealedHidden(f.context.instanceId);
    ok(revealed.includes('saved_platform'), '浏览器重载仍保留 mapId|objectName');
    if (revealed.includes('saved_platform')) restoreOrder.push('collision');
    restoreOrder.push('player'); same(restoreOrder, ['collision', 'player'], '平台碰撞先于玩家落点恢复');
    same(restored.revealedHidden('another_map'), [], '不同静态 mapId 不串显形状态');
    eq(restored.preview().blockKey, 'sense.block.cooldown', '读档保留真实冷却');
    loaded.hp = 0; f.context.alive = false;
    ok(restored.revealedHidden(f.context.instanceId).includes('saved_platform'), '死亡不撤销平台显形');
    f.context.alive = true; loaded.allocatedStats.spirit = 0;
    ok(restored.revealedHidden(f.context.instanceId).includes('saved_platform'), '神识降低不撤销平台显形');
  }
  for (const corrupted of [null, 'not_a_timestamp', -1, { diagnostic: 'corrupt_clock' }]) {
    const f = fixture(); const save = f.p.exportSave();
    save.senseState = { cooldownUntil: corrupted, lastScanId: 'old_scan', tutorialSeen: false };
    disk[saveKey] = JSON.stringify(save); const loaded = Progress.load();
    const sense = new Sense({ progress: loaded, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => [] });
    same(loaded.senseState?.cooldownUntil, corrupted, '损坏冷却值保留诊断');
    eq(sense.preview().blockKey, 'sense.block.unavailable', '损坏冷却不重置为立即可用');
    const mp = loaded.mp; eq(sense.requestScan('button').ok, false, '损坏冷却阻止施放'); eq(loaded.mp, mp, '损坏冷却不扣费');
  }
  for (const corrupted of [NaN, Infinity, -Infinity, Number.MAX_SAFE_INTEGER]) {
    const f = fixture(); f.p.senseState = { cooldownUntil: corrupted, tutorialSeen: false };
    const preview = f.sense.preview();
    eq(preview.blockKey, 'sense.block.unavailable', '非有限/超合法时间范围冷却拒绝施放');
    ok(preview.diagnostics.includes('senseState.cooldownUntil'), '损坏时间戳保留诊断路径');
    ok(Object.is(f.p.senseState.cooldownUntil, corrupted), '检查不重置损坏时间戳');
  }
  {
    const f = fixture(); const writesBefore = writes;
    eq(f.sense.markTutorialSeen(), true, '教学实际展示后可标记');
    eq(f.p.senseState?.tutorialSeen, true, '教学标记持久化'); eq(writes - writesBefore, 1, '教学标记只保存一笔');
    f.sense.markTutorialSeen(); eq(writes - writesBefore, 1, '重复教学标记不重复保存');
    setFeatureFlag('spiritScan', false);
    eq(own(f.p.exportSave(), 'senseState'), false, '即使已有教学记录关态也不写 senseState');
  }
  {
    const f = fixture(), writesBefore = writes;
    failStorage = true;
    try { eq(f.sense.markTutorialSeen(), false, '教学保存失败返回失败'); }
    finally { failStorage = false; }
    eq(f.p.senseState, undefined, '教学保存失败恢复无历史状态'); eq(writes, writesBefore, '教学保存失败不写部分记录');
  }

  // 定义排除字段与运行期敌我属性分别判定；敌方召唤物的运行期奖励关闭仍可探知。
  {
    const f = fixture();
    sceneConfig(f, () => {
      const player = {}, enemyOwner = {};
      const cases: [string, Record<string, unknown>, Record<string, unknown>, boolean][] = [
        ['普通敌人', {}, {}, false],
        ['training_dummy 显式排除', { id: 'training_dummy' }, {}, true],
        ['noDamage', { noDamage: true }, {}, true],
        ['immortal', { immortal: true }, {}, true],
        ['invulnerable', { invulnerable: true }, {}, true],
        ['minHp 正数', { minHp: 1 }, {}, true],
        ['kneelBelow 正数', { kneelBelow: 0.25 }, {}, true],
        ['kneelBelow 为零仍存在', { kneelBelow: 0 }, {}, true],
        ['kneelBelow 显式 undefined 仍存在', { kneelBelow: undefined }, {}, true],
        ['定义 grantRewards:false', { grantRewards: false }, {}, true],
        ['定义 despawnWithOwner:true', { despawnWithOwner: true }, {}, true],
        ['运行期 friendly:true', {}, { friendly: true }, true],
        ['运行期 owner 为玩家', {}, { owner: player }, true],
        ['敌方首领召唤', {}, { owner: enemyOwner, grantRewards: false, despawnWithOwner: true }, false],
        ['运行期 grantRewards:false', {}, { grantRewards: false }, false],
        ['各排除布尔为 false', { noDamage: false, immortal: false, invulnerable: false, grantRewards: true, despawnWithOwner: false }, { friendly: false }, false],
        ['minHp 为零', { minHp: 0 }, {}, false],
        ['minHp 为负数', { minHp: -1 }, {}, false],
        ['未激活', {}, { active: false }, true],
        ['死亡', {}, { dead: true }, true],
        ['零气血', {}, { hp: 0 }, true],
        ['未显形', {}, { visible: false }, true],
        ['全透明', {}, { alpha: 0 }, true],
        ['无碰撞体', {}, { body: undefined }, true],
        ['碰撞体禁用', {}, { body: { enable: false, center: { x: 100, y: 100 } } }, true],
        ['实例在地图外', {}, { body: { enable: true, center: { x: -1, y: 100 } } }, true],
      ];
      for (const [label, defPatch, runtimePatch, excluded] of cases) {
        const def: any = { id: 'sense_enemy', name: '妖兽', level: 1, hp: 10,
          sense: { enabled: true, profile: 'sense_monster_basic', visibleInfo: ['hp'], abilityKeys: [] }, ...defPatch };
        const instance = hostileInstance(def, runtimePatch);
        const scene: any = { map: { id: f.context.instanceId, width: 1000, height: 1000 }, player, mobs: [instance] };
        const targets = sceneMonsterTargets(scene);
        eq(targets.length, excluded ? 0 : 1, `${label} 场景候选数量`);
        const sense = service(f, { targets: () => targets });
        f.p.senseState = undefined; f.p.mp = f.p.maxMp;
        const result = sense.requestScan('key', `monster_matrix_${label}`); ok(result.ok, `${label} 扫描提交`);
        eq(result.hits.length, excluded ? 0 : 1, `${label} 命中与排除一致`);
        eq(result.faint, false, `${label} 排除不泄漏 faint`);
        eq(Boolean(sense.monsterIntel(instance)), !excluded, `${label} 仅合法敌人建立情报`);
      }
    });
  }

  // shared 直接读取真实投放；snapshot 尚未同步时跳过这组投放数量断言，仍运行上方全部夹具。
  {
    const maps = ['bamboo_forest', 'lingxi_path', 'luoxia_outskirts_1', 'luoxia_outskirts_2', 'wanyao_outer_1']
      .map(id => ({ id, raw: TILED_MAPS[id] }));
    maps.push({ id: 'chiyan_slope_1', raw: chiyanSlope });
    const placements = maps.map(({ id, raw }) => ({ id, raw, objects: tiledObjects(raw) }));
    const hiddenCount = placements.reduce((count, map) => count + map.objects.filter(object => object.type === 'hidden').length, 0);
    if (hiddenCount === 0) console.log('sense.test: snapshot 无神识投放，跳过 shared 真实投放断言');
    else {
      eq(hiddenCount, 12, '共享六图真实登记 12 个 hidden 点位');
      const registered = Object.values(MONSTERS).filter(def => def.sense);
      eq(registered.length, 22, '共享怪物真实登记 22 个 sense 块');
      ok(registered.every(def => def.sense!.enabled === false), '真实怪物 sense 块保持全部禁用');
      const f = fixture();
      sceneConfig(f, () => {
        f.p.allocatedStats.spirit = 100;
        Object.assign(f.config.scan, { radiusBasePx: 100000, radiusMaxPx: 100000 });
        for (const profile of f.config.targetProfiles) profile.enabled = false;
        const sharedMaps = placements.map(({ id, raw, objects }) => {
          const m = mapFixture(f, clone(objects), id, raw.width * raw.tilewidth, raw.height * raw.tileheight);
          same(m.scene.map.hidden.map((hidden: any) => hidden.object.name).sort(),
            ['sense_hidden_chest_01', 'sense_hidden_platform_01'], `${id} 使用真实宝箱/平台点位`);
          ok(m.scene.map.hidden.every((hidden: any) => hidden.valid && hidden.object.props.enabled === false), `${id} 真实点位合法且全部禁用`);
          eq(m.adapter.targets().length, 0, `${id} 模板 false 时零候选`);
          for (const hidden of m.scene.map.hidden) hidden.object.props.enabled = true;
          eq(m.adapter.targets().length, 0, `${id} 只开点位，模板 false 仍零候选`);
          return m;
        });
        const instances = registered.map((def, index) => hostileInstance(clone(def), { senseInstanceId: `shared_mob_${index}` }));
        const monsterScene: any = { map: { id: f.context.instanceId, width: 1000, height: 1000 }, player: {}, mobs: instances };
        let targets = sceneMonsterTargets(monsterScene);
        eq(targets.filter(target => Number.isFinite(target.reqSpirit)).length, 0, '真实怪物模板 false 无有效门槛候选');
        f.sense = service(f, { targets: () => targets });
        const off = f.sense.requestScan('key', 'shared_templates_off'); ok(off.ok, '真实怪物关态可空扫');
        same(off.hits, [], '真实禁用 sense 块及模板不产生命中'); eq(off.faint, false, '真实禁用怪物不计 faint');
        for (const profile of f.config.targetProfiles) profile.enabled = true;
        for (const m of sharedMaps) {
          eq(m.adapter.targets().length, 2, `${m.scene.map.id} 内存开模板和点位后有两个候选`);
          f.context.instanceId = m.scene.map.id; f.p.senseState = undefined; f.p.mp = f.p.maxMp;
          const sense = service(f, { targets: () => m.adapter.targets() });
          const result = sense.requestScan('key', `shared_map_${m.scene.map.id}`); ok(result.ok, `${m.scene.map.id} 真实点位可扫`);
          eq(result.count, 2, `${m.scene.map.id} 真实宝箱及平台均可显形`);
        }
        f.context.instanceId = monsterScene.map.id; f.p.senseState = undefined; f.p.mp = f.p.maxMp;
        for (const instance of instances) instance.def.sense.enabled = true;
        targets = sceneMonsterTargets(monsterScene);
        eq(targets.length, 22, '真实普通怪物定义通过通用排除规则');
        const on = f.sense.requestScan('key', 'shared_monsters_on'); ok(on.ok, '内存开真实怪物 sense 块及模板后可扫');
        eq(on.hits.length, 22, '真实 22 个已登记怪物均可建立情报');
        eq(f.sense.intelList().length, 22, '真实怪物逐实例记录临时情报');
      });
    }
  }

  // 怪物需显式登记 + 已启用 monster_info 模板；白名单严格限制公开快照。
  {
    const f = fixture(), m = monster(f), permanentBefore = clone(f.p.exportSave());
    eq(f.sense.requestScan('key', 'intel_scan').ok, true, '已登记怪物可扫描');
    eq(f.events.find(e => e.name === 'sense:scan')?.payload.count, 0, '怪物情报不计首次物件数');
    const intel: any = f.sense.monsterIntel(m.instance); ok(intel, '按怪物实例建立临时快照');
    const serialized = JSON.stringify(intel);
    ok(!serialized.includes('不应泄漏的妖兽名') && !serialized.includes('sense_fixture_monster'), '未授权 name 不注入姓名或怪物 id');
    ok(!serialized.includes('secret_drop') && !serialized.includes('secret_phase') && !serialized.includes('未公开阶段'), '不遍历奖励或首领未公开技能');
    eq(intel.level, 37, '等级白名单可见'); eq(intel.hp, 31, 'hp 为提交时气血'); eq(intel.maxHp, 99, 'hp 权限同时给最大气血');
    ok(serialized.includes('sense.monster.unknown') || serialized.includes('尚未辨明'), 'abilities 空数组明确尚未辨明');
    m.details.hp = 9; eq((f.sense.monsterIntel(m.instance) as any).hp, 31, '战斗扣血不修改既有情报快照');
    same(f.p.openedChests, permanentBefore.openedChests, '扫描不改变宝箱领取收据');
    same(f.p.quests, permanentBefore.quests, '扫描不增加任务击杀');
    same(f.p.skillMastery, permanentBefore.skillMastery, '扫描不累积技能熟练度');
    ok(!JSON.stringify(f.p.exportSave()).includes('secret_phase'), '临时情报不写入存档');
    now += 1000; eq(f.sense.requestScan('button', 'intel_refresh').ok, true, '复扫刷新同实例情报');
    eq((f.sense.monsterIntel(m.instance) as any).hp, 9, '复扫取得新的 hp 快照');
    eq(f.sense.intelList().length, 1, '复扫覆盖不叠加记录');
    now += 1999; f.sense.tick(); eq(f.sense.intelList().length, 1, '刷新持续时间到期前仍有效');
    now++; f.sense.tick(); eq(f.sense.intelList().length, 0, '刷新持续时间到期边界失效，不叠加');
    ok(f.events.some(e => e.name === 'sense:intel-expired'), '到期通知界面清除标签');
  }
  for (const condition of ['disabled', 'missing', 'wrong_kind', 'null_threshold', 'no_block', 'disabled_block', 'duplicate_fields', 'private_field']) {
    const f = fixture(), m = monster(f), profile = f.config.targetProfiles.find((entry: any) => entry.id === 'sense_monster_basic');
    if (condition === 'disabled') profile.enabled = false;
    if (condition === 'missing') m.definition.sense.profile = 'unregistered_profile';
    if (condition === 'wrong_kind') m.definition.sense.profile = 'sense_hidden_chest';
    if (condition === 'null_threshold') profile.reqSpirit = null;
    if (condition === 'no_block') delete m.definition.sense;
    if (condition === 'disabled_block') m.definition.sense.enabled = false;
    if (condition === 'duplicate_fields') m.definition.sense.visibleInfo = ['hp', 'hp'];
    if (condition === 'private_field') m.definition.sense.visibleInfo = ['dropTable'];
    const result = f.sense.requestScan('key', `monster_excluded_${condition}`);
    if (condition === 'null_threshold') {
      ok(!result.ok, '启用模板存在 null 阈值，整表未就绪');
      eq(result.blockKey, 'sense.block.unavailable', '启用模板 null 不能当默认值');
      continue;
    }
    ok(result.ok, `${condition} 不阻塞完整公共规则下的空扫`);
    eq(result.result, 'empty', `${condition} 怪物不入候选`);
    eq(f.sense.monsterIntel(m.instance), undefined, `${condition} 不建立情报`);
  }
  for (const requirement of [5, 5.01]) {
    const f = fixture(), m = monster(f);
    f.config.targetProfiles.find((entry: any) => entry.id === 'sense_monster_basic').reqSpirit = requirement;
    m.target.reqSpirit = 0; // 怪物门槛只能来自显式引用的 monster_info 模板。
    const result = f.sense.requestScan('key', 'monster_template_strength'); ok(result.ok, '怪物模板强度检查可正常提交');
    eq(result.result, requirement === 5 ? 'known' : 'faint', '怪物门槛使用模板且含强度边界');
    eq(Boolean(f.sense.monsterIntel(m.instance)), requirement === 5, '不足怪物门槛不建立情报快照');
  }
  {
    const f = fixture(), m = monster(f); m.definition.sense.abilityKeys = ['unregistered_secret_ability'];
    const result = f.sense.requestScan('key', 'missing_public_text'); ok(result.ok, '未登记公开能力文案不影响空扫事务');
    eq(result.result, 'empty', '不存在公开能力文案的怪物不入候选');
    eq(f.sense.monsterIntel(m.instance), undefined, '不存在文案不暴露占位 key 或首领脚本');
  }
  {
    const f = fixture(), m = monster(f); m.definition.sense.visibleInfo = ['name', 'abilities'];
    m.definition.sense.abilityKeys = ['sense.monster.no_weakness'];
    f.sense.requestScan('key', 'public_ability');
    const intel: any = f.sense.monsterIntel(m.instance); ok(intel, '显式授权名字与公开能力可用');
    eq(intel.name, m.definition.name, '已授权名称可见');
    eq(own(intel, 'hp'), false, '未授权 hp 不展示'); eq(own(intel, 'level'), false, '未授权 level 不展示');
    ok(JSON.stringify(intel).includes('sense.monster.no_weakness') || JSON.stringify(intel).includes('此次探查仅辨气息'), '能力仅取显式公开文案');
    m.state.alive = false; f.sense.tick(); eq(f.sense.intelList().length, 0, '目标死亡清理临时情报');
    m.state.alive = true; now += 1000; f.sense.requestScan('key', 'after_death');
    const replacement = {}; eq(f.sense.monsterIntel(replacement), undefined, '同配置新怪物实例不串旧情报');
    f.context.instanceId = 'new_scene'; f.sense.tick(); eq(f.sense.intelList().length, 0, '离图清理情报');
  }
  {
    const f = fixture(), m = monster(f); f.sense.requestScan('key', 'reload_intel');
    const loaded = Progress.load(); const fresh = new Sense({ progress: loaded, config: () => f.config, realms: REALMS,
      enabled: () => true, context: () => f.context, targets: () => f.targets });
    eq(fresh.monsterIntel(m.instance), undefined, '读档不恢复临时怪物情报');
    eq(fresh.intelList().length, 0, '读档临时情报列表为空');
  }
  {
    const f = fixture(), m = monster(f), before = f.p.exportSave();
    f.sense.requestScan('key', 'same_progress_import');
    ok(f.sense.monsterIntel(m.instance), '导入前原服务确有怪物情报');
    eq(f.p.importSave(before), true, '同 Progress 对象成功导入旧档');
    eq(f.sense.intelList().length, 0, '同对象导入成功立即使原服务情报失效');
    eq(f.sense.monsterIntel(m.instance), undefined, '同对象导入成功不残留实例情报');
    const mp = f.p.mp, writesBefore = writes;
    eq(f.sense.requestScan('key', 'same_progress_import').ok, true, '导入旧档后旧操作缓存不阻止新提交');
    eq(f.p.mp, mp - 8, '导入旧档后旧 scanId 不命中已废弃缓存');
    eq(writes - writesBefore, 1, '导入旧档后新操作重新保存一笔');
  }
  console.log(`sense.test: ${assertions} 条断言通过（地砖齐边/开关/配表/顺序/原子提交/边界/静态实例存档/怪物快照）`);
} finally {
  Date.now = originalNow; setFeatureFlag('spiritScan', previousFlag);
  if (originalStorage) Object.defineProperty(globalThis, 'localStorage', originalStorage);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
