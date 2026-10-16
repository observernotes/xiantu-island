import encountersRaw from '@xt/balance/encounters.json';
import { ENCOUNTERS, SENSE } from './data';
import { parseEncountersConfig, type EncountersConfig } from './Encounter';
import { EncounterUi } from './EncounterUi';
import { createEncounterProp, encounterPropAnimation, playEncounterProp, resolveEncounterProp, revealEncounterProp } from './EncounterProps';
import { Progress } from './Progress';
import { featureEnabled, setFeatureFlag } from './features';
import { setGameTimeSource } from './GameClock';
import { GameScene } from './scenes/GameScene';
import type { MapObj } from './scenes/MapBuilder';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
type Mutable = Record<string, any>;
type Listener = { fn: (...args: any[]) => void; context?: unknown; once: boolean };
class Events {
  private readonly listeners = new Map<string, Listener[]>();
  on(name: string, fn: Listener['fn'], context?: unknown) {
    this.listeners.set(name, [...this.listeners.get(name) ?? [], { fn, context, once: false }]); return this;
  }
  once(name: string, fn: Listener['fn'], context?: unknown) {
    this.on(name, fn, context); const rows = this.listeners.get(name)!; rows[rows.length - 1].once = true; return this;
  }
  off(name: string, fn?: Listener['fn'], context?: unknown) {
    this.listeners.set(name, (this.listeners.get(name) ?? []).filter(row => fn && (row.fn !== fn || context !== undefined && row.context !== context)));
    return this;
  }
  emit(name: string, ...args: any[]) {
    for (const row of [...this.listeners.get(name) ?? []]) {
      if (row.once) this.off(name, row.fn, row.context);
      row.fn.apply(row.context ?? this, args);
    }
    return this;
  }
  listenerCount(name: string) { return this.listeners.get(name)?.length ?? 0; }
  removeAllListeners() { this.listeners.clear(); }
}
class Display extends Events {
  name = ''; active = true; visible = true; alpha = 1; originX = 0.5; originY = 0.5;
  depth = 0; scaleX = 1; scaleY = 1; width = 64; height = 96;
  readonly frame: { name?: string | number; realWidth: number; realHeight: number };
  readonly texture: Mutable; readonly plays: string[] = []; readonly data = new Map<string, unknown>();
  readonly anims = { stop: () => {} };
  get displayHeight() { return this.height * this.scaleY; }
  get displayWidth() { return this.width * this.scaleX; }
  constructor(readonly scene: Mutable, public x: number, public y: number, readonly key: string, frame?: string | number) {
    super(); this.texture = scene.textures.get(key); this.frame = { name: frame, realWidth: 64, realHeight: 96 };
  }
  setName(value: string) { this.name = value; return this; }
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setDepth(value: number) { this.depth = value; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setScale(x: number, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setFrame(value: string | number) { this.frame.name = value; return this; }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  getData(key: string) { return this.data.get(key); }
  play(key: string) { ok(this.scene.anims.exists(key), `只播已登记动画 ${key}`); this.plays.push(key); return this; }
  destroy() { if (!this.active) return; this.emit('destroy'); this.active = this.visible = false; this.removeAllListeners(); }
}
const herb = 'enc_fragrant_herb', abode = 'enc_hidden_abode';
const originalRaw = JSON.stringify(encountersRaw), originalConfig = JSON.stringify(ENCOUNTERS);
function configWith(id: string, mutate?: (raw: Mutable) => void): EncountersConfig {
  const raw: Mutable = structuredClone(encountersRaw);
  for (const row of raw.encounters) row.enabled = row.id === id;
  mutate?.(raw);
  const parsed = parseEncountersConfig(raw); eq(parsed.errors.length, 0, '仅内存 fixture 通过真实表校验');
  ok(parsed.config, 'fixture 有可用配置'); return parsed.config;
}
function anchor(id: string, props: Mutable = {}): MapObj {
  return { type: id === abode ? 'hidden' : 'encounter_anchor', name: `${id}_anchor`, x: 460, y: 720, w: 48, h: 8,
    props: { encounter: id, ...(id === abode ? { reveal: 'entrance' } : {}), ...props } };
}
let saveFails = false, saves = 0;
const disk = new Map<string, string>();
function fixture(config: EncountersConfig | null, objects: MapObj[] = [], prog = new Progress()) {
  const scene = Object.create(GameScene.prototype) as Mutable, displays: Display[] = [];
  const atlases = new Set(['prop_enc_herb_glow', 'prop_enc_abode_entrance', 'prop_enc_seal', 'fx_spirit_scan_reveal', 'fx_enc_help_mark', 'fixture_help']);
  const animations = new Set([...atlases].flatMap(atlas => ['hidden', 'reveal', 'idle', 'play', 'earth_idle'].map(state => `${atlas}_${state}`)));
  const textures = new Map([...atlases].map(key => {
    const names = ['hidden', 'reveal', 'idle', 'play', 'earth_idle'].map(state => `${key}_${state}_01`);
    return [key, { key, firstFrame: names[0], has: (frame: string) => names.includes(frame), getFrameNames: () => names,
      frames: {}, setFilter() {} }];
  }));
  Object.assign(scene, {
    prog, encounterProps: new Map(), events: new Events(), registry: new Map(), mobs: [],
    map: { id: config?.encounters.find(row => row.enabled)?.maps[0] ?? 'wanyao_outer_2', objects, zones: [], hidden: [],
      width: 2000, height: 1000, spawn: { x: 12, y: 34 } },
    player: { x: 460, feet: 720, body: { center: { x: 460, y: 680 } }, syncAppearance() {} },
    encounterBlocked: () => false, senseBusy: () => false,
    senseMap: { targets: () => [] }, scale: { width: 1280, height: 720 },
    textures: { exists: (key: string) => atlases.has(key), get: (key: string) => textures.get(key) },
    anims: { exists: (key: string) => animations.has(key), get: (key: string) => ({ frames: [{ textureKey: key.replace(/_idle$/, ''), textureFrame: `${key}_01` }] }) },
    cache: { json: { get: () => ({ frameSize: [64, 96], origin: [0.5, 1] }) } },
    add: { sprite: (x: number, y: number, key: string, frame?: string | number) => {
      const display = new Display(scene, x, y, key, frame); displays.push(display); return display;
    } },
  });
  const ui = new EncounterUi(scene as GameScene);
  scene.setupSense();
  const setup = () => scene.setupEncounters(config);
  const prop = () => displays.find(row => row.active && row.name.startsWith('encounter-prop:'));
  const fx = () => displays.filter(row => row.active && row.name === 'encounter-scan-reveal');
  const mark = () => displays.find(row => row.active && row.name === 'encounter-help-mark');
  const runtime = () => scene.encounterRuntime;
  return { scene, displays, prog, atlases, animations, setup, prop, fx, mark, runtime, ui };
}
function readyProgress(): Progress {
  const prog = new Progress();
  Object.assign(prog, { level: 40, hp: 100, mp: 100, daoHeart: 20, morality: 0,
    quests: { q_main_04: { state: 'done', kills: {} }, q_fox: { state: 'done', kills: {} } } });
  return prog;
}
const state = (display: Display | undefined) => display?.getData('propAnimation');
const complete = (display: Display) => display.emit(`animationcomplete-${state(display)}`);
const seen = (prog: Progress, id: string) => (prog.encounters?.seen as string[] | undefined)?.includes(id) === true;
const active = (prog: Progress): Mutable | undefined => prog.encounters?.active as Mutable | undefined;
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const randomBefore = Math.random, senseBefore = structuredClone(SENSE), flagBefore = featureEnabled('spiritScan');
try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { if (saveFails) throw new Error('fixture storage failure'); disk.set(key, value); saves++; },
    removeItem: (key: string) => disk.delete(key),
  } });
  Math.random = () => 0; setGameTimeSource(() => 10_000_000);
  SENSE.enabled = true; setFeatureFlag('spiritScan', true);
  ok(ENCOUNTERS, '正式奇遇表有效'); eq(ENCOUNTERS.encounters.length, 5, '正式五事件');
  for (const row of ENCOUNTERS.encounters) eq(row.enabled, false, `${row.id} 保持关态`);
  const closed = fixture(ENCOUNTERS, [anchor(herb), anchor(abode)], readyProgress());
  closed.setup(); for (const object of closed.scene.map.objects) closed.scene.drawObject(object);
  eq(closed.displays.length, 0, '正式关态即使放入 fixture 锚点也零精灵');
  eq(closed.scene.encounterSenseTargets().length, 0, '正式关态无扫描候选');
  eq(closed.runtime().runner.offer(), undefined, '正式关态无 offer');

  const visibleConfig = configWith(herb), missing = fixture(visibleConfig, [], readyProgress());
  missing.setup(); ok(missing.runtime().runner.offer(), '缺锚 fixture 确实已抽中 offer');
  missing.runtime().update(16); missing.scene.syncEncounterProps();
  eq(missing.displays.length, 0, '缺地图锚点零精灵且不借 map.spawn');
  eq(seen(missing.prog, herb), false, '缺地图锚点不记假 seen');
  eq(missing.runtime().interact(), false, '缺地图锚点不可交互');
  for (const invalid of [
    { ...anchor(herb), name: 'wrong_name' }, { ...anchor(herb), type: 'npc' },
    { ...anchor(herb), props: { encounter: abode } },
  ]) {
    missing.scene.map.objects = [invalid]; missing.scene.syncEncounterProps(); missing.runtime().update(16);
    eq(missing.displays.length, 0, '错名/错type/错encounter不能借用为锚点');
  }
  const object = anchor(herb), visible = fixture(visibleConfig, [object], readyProgress());
  visible.scene.drawObject(object); eq(visible.displays.length, 0, '尚未 offer 的锚点零创建'); visible.setup();
  const art = visible.prop(); ok(art, 'visible offer 后创建表登记 prop');
  same([art.key, art.x, art.y, art.originX, art.originY, art.depth, art.visible],
    ['prop_enc_herb_glow', object.x, object.y, 0.5, 1, 4, true], '锚点脚底/原点/depth与宝箱一致');
  eq(state(art), 'prop_enc_herb_glow_idle', 'visible offer 播 idle');
  same([visible.mark()?.x, visible.mark()?.y], [object.x, object.y - art.displayHeight - 4], '求助标对齐精灵头顶，不借出生点');
  visible.scene.syncEncounterProps(); visible.scene.drawObject(object);
  eq(visible.displays.filter(row => row.name.startsWith('encounter-prop:')).length, 1, '逐帧/重复draw不重建prop');
  visible.ui.destroy(); visible.runtime().terminate('missed'); visible.scene.syncEncounterProps(); eq(art.active, false, 'runner终止后移除prop');

  const hiddenConfig = configWith(abode), hiddenObject = anchor(abode);
  const hidden = fixture(hiddenConfig, [hiddenObject], readyProgress()); hidden.setup();
  const entrance = hidden.prop(); ok(entrance, 'active hidden可创建不可见入口');
  eq(entrance.visible, false, 'hidden+spirit_scan 未扫描不可见');
  eq(state(entrance), 'prop_enc_abode_entrance_hidden', '未扫描入口使用hidden态');
  eq(hidden.runtime().runner.offer(), undefined, '未显形与runner无offer一致');
  eq(seen(hidden.prog, abode), false, '抽中hidden不记seen'); eq(hidden.mark(), undefined, '未显形不出现求助标');
  const targets = hidden.scene.encounterSenseTargets(); eq(targets.length, 1, '当前图active隐藏入口有唯一候选');
  same([targets[0].kind, targets[0].x, targets[0].y, targets[0].reqSpirit, targets[0].persistence],
    ['entrance', hiddenObject.x, hiddenObject.y, 0, 'adapter'], '扫描候选读脚底与表默认门槛');
  hiddenObject.props.reqSpirit = 7; eq(hidden.scene.encounterSenseTargets()[0].reqSpirit, 7, '地图门槛优先于表'); delete hiddenObject.props.reqSpirit;
  const beforeBlocked = hidden.prog.encounters;
  hidden.scene.encounterBlocked = () => true;
  eq(hidden.scene.encounterSenseTargets().length, 0, 'runner阻挡时不出扫描候选');
  let stageBlocked = false;
  try { targets[0].stageReveal(); } catch { stageBlocked = true; }
  eq(stageBlocked, true, '已枚举候选在stage时重新检查runner阻挡');
  eq(hidden.prog.encounters, beforeBlocked, '被阻挡stage不暂存显形');
  hidden.scene.encounterBlocked = () => false;
  const snapshot = JSON.stringify(hidden.prog.exportSave()), diskBefore = JSON.stringify([...disk]);
  const beforeReference = hidden.prog.encounters, savesBefore = saves;
  saveFails = true; const failed = hidden.scene.sense.requestScan('key', 'anchor-failed'); saveFails = false;
  eq(failed.ok, false, '扫描保存失败返回失败'); eq(failed.blockKey, 'sense.block.save_failed', '失败沿Sense保存失败合同');
  eq(hidden.prog.encounters, beforeReference, 'stage失败恢复原encounters引用');
  eq(JSON.stringify(hidden.prog.exportSave()), snapshot, '失败回滚revealed/seen/灵力/冷却');
  eq(JSON.stringify([...disk]), diskBefore, '失败磁盘无变化'); eq(saves, savesBefore, '失败未成功写盘');
  eq(entrance.visible, false, '失败入口仍隐藏'); eq(hidden.fx().length, 0, '失败不播FX');
  hidden.runtime().update(16); hidden.scene.syncEncounterProps();
  eq(hidden.runtime().runner.offer(), undefined, '失败后的runner重试不产生免费显形');
  eq(active(hidden.prog)?.locals.revealed, false, '失败后active仍未显形'); eq(seen(hidden.prog, abode), false, '失败不记假seen');
  const mpBefore = hidden.prog.mp, success = hidden.scene.sense.requestScan('button', 'anchor-success');
  eq(success.ok, true, '真实Sense注册adapter扫描成功'); eq(success.count, 1, '扫描找到一个入口');
  eq(saves, savesBefore + 1, 'stage显形与扣费一次保存，apply/runtime不额外保存');
  eq(hidden.prog.mp, mpBefore - SENSE.scan.mpCost, '显形沿Sense原灵力扣费');
  eq(active(hidden.prog)?.locals.revealed, true, 'adapter与runner locals显形一致'); eq(seen(hidden.prog, abode), true, '成功显形才记seen');
  ok(hidden.runtime().runner.offer(), '成功显形runner公开offer'); eq(entrance.visible, true, '成功显形入口可见');
  eq(state(entrance), 'prop_enc_abode_entrance_reveal', '入口播reveal'); eq(hidden.fx().length, 1, '一次性扫描FX只分配一次');
  eq(hidden.prog.senseRevealed?.[`${hidden.scene.map.id}|${hiddenObject.name}`], undefined, '事件状态不冒充静态地图senseRevealed');
  hidden.scene.syncEncounterProps(); eq(state(entrance), 'prop_enc_abode_entrance_reveal', '同步不会截断reveal');
  complete(entrance); eq(state(entrance), 'prop_enc_abode_entrance_idle', 'reveal完成后idle');
  const fx = hidden.fx()[0]; complete(fx); eq(hidden.fx().length, 0, '一次性FX完成后销毁');
  eq(hidden.scene.encounterSenseTargets().length, 0, '已显形不重复作为候选');
  const afterSuccess = JSON.stringify(hidden.prog.exportSave()), afterSaves = saves;
  eq(hidden.scene.sense.requestScan('key', 'anchor-success').replayed, true, '同scanId幂等重试');
  eq(saves, afterSaves, '同scanId不重复保存'); eq(JSON.stringify(hidden.prog.exportSave()), afterSuccess, '同scanId不重复扣费');
  const loaded = Progress.load(), restored = fixture(hiddenConfig, [anchor(abode)], loaded); restored.setup();
  ok(restored.prop()?.visible, '真实读档恢复可见入口'); eq(state(restored.prop()), 'prop_enc_abode_entrance_idle', '读档直接idle');
  eq(restored.fx().length, 0, '读档不重播显形FX');
  eq(restored.prop()?.plays.includes('prop_enc_abode_entrance_reveal'), false, '读档不重播reveal');
  const malformed = fixture(hiddenConfig, [anchor(abode)], readyProgress()); malformed.setup();
  const broken = structuredClone(malformed.prog.encounters!); (broken.active as Mutable).locals = null;
  malformed.prog.encounters = broken; malformed.scene.syncEncounterProps();
  eq(malformed.prop(), undefined, '坏档active.locals=null静默移除精灵');
  eq(malformed.scene.encounterSenseTargets().length, 0, '坏档active.locals=null不出扫描候选');

  const missingArt = fixture(visibleConfig, [anchor(herb)], readyProgress()); missingArt.atlases.clear(); missingArt.setup();
  eq(missingArt.displays.length, 0, '缺纹理静默零精灵');
  const configMissingVisual = configWith(herb, raw => { delete raw.encounters.find((row: Mutable) => row.id === herb).visual.objects; });
  const noVisual = fixture(configMissingVisual, [anchor(herb)], readyProgress()); noVisual.setup();
  eq(noVisual.prop(), undefined, '缺visual.objects不猜纹理');
  const spriteGuard = (value: Mutable) => new Proxy(value, { get(target, key) {
    if (key === 'sprite') throw new Error('读取了地图私有sprite'); return Reflect.get(target, key);
  } });
  const guarded = spriteGuard({ ...anchor(herb), props: spriteGuard({ encounter: herb }) });
  eq(resolveEncounterProp(guarded as MapObj, visibleConfig, { offered: true })?.atlas, 'prop_enc_herb_glow', '只读表visual，不读地图私有sprite');
  eq(resolveEncounterProp(anchor(herb), visibleConfig), undefined, '未active/offer无显示态');
  eq(resolveEncounterProp({ ...anchor(herb), type: 'chest' }, visibleConfig, { active: true }), undefined, '不接管其他原生对象');
  const staticFixture = fixture(hiddenConfig, [], readyProgress()), visual = resolveEncounterProp(hiddenObject, hiddenConfig, { active: true });
  ok(visual, 'hidden visual可解析'); staticFixture.animations.clear();
  const staticArt = createEncounterProp(staticFixture.scene as GameScene, hiddenObject, visual) as unknown as Display;
  ok(staticArt, '动画缺省仍可建静帧'); eq(staticArt.frame.name, 'prop_enc_abode_entrance_hidden_01', '动画缺省hidden静帧');
  ok(revealEncounterProp(staticFixture.scene as GameScene, staticArt as any, visual), '缺reveal动画静帧降级');
  eq(state(staticArt), 'prop_enc_abode_entrance_idle', '缺动画仍达idle'); eq(staticArt.frame.name, 'prop_enc_abode_entrance_idle_01', '静帧idle不回退hidden');
  eq(revealEncounterProp(staticFixture.scene as GameScene, staticArt as any, visual), false, '重复reveal不重播');
  const seal = { ...visual, atlas: 'prop_enc_seal', animPrefix: 'earth', state: 'idle' as const };
  eq(encounterPropAnimation(seal, 'idle'), 'prop_enc_seal_earth_idle', '配置animPrefix接在图集后');
  playEncounterProp(staticFixture.scene as GameScene, staticArt as any, seal); eq(state(staticArt), 'prop_enc_seal_earth_idle', 'play使用配置prefix');
  const custom = configWith(herb, raw => { raw.encounters.find((row: Mutable) => row.id === herb).visual.promptSprite = 'fixture_help'; });
  const customFixture = fixture(custom, [anchor(herb)], readyProgress()); customFixture.setup();
  eq(customFixture.mark()?.key, 'fixture_help', '求助标继续读取当前配置promptSprite');
  eq(JSON.stringify(encountersRaw), originalRaw, '原始正式五事件配置完全未改');
  eq(JSON.stringify(ENCOUNTERS), originalConfig, '校验后正式配置完全未改');
  console.log(`encounter-props: ${assertions} assertions passed`);
} finally {
  Math.random = randomBefore; setGameTimeSource(null); Object.assign(SENSE, senseBefore); setFeatureFlag('spiritScan', flagBefore);
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore); else Reflect.deleteProperty(globalThis, 'localStorage');
}
