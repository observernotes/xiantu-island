import encountersRaw from '@xt/balance/encounters.json';
import pacingRaw from '@xt/balance/solo_pacing.json';
import { ENCOUNTERS, ITEMS, NPCS, t } from './data';
import { parseEncountersConfig, type EncountersConfig } from './Encounter';
import { EncounterUi, type EncounterOffer } from './EncounterUi';
import { Progress } from './Progress';
import { EncounterSceneRuntime } from './EncounterSceneRuntime';
import type { EncounterContext } from './Encounter';
import type { GameScene } from './scenes/GameScene';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }

type Listener = { fn: (...args: any[]) => void; context?: unknown; once: boolean };
/** 模拟 Phaser 的 context / once / off 语义，验证 destroy 后真正退订。 */
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

/** 只替换显示对象；可见性沿 parentContainer 计算，避免把隐藏容器里的文字计为可见。 */
class Display extends Events {
  name = ''; visible = true; active = true; destroyed = false; alpha = 1;
  originX = 0.5; originY = 0.5; depth = 0; text = ''; height = 24; width = 100;
  frame: { name?: string | number; realWidth: number; realHeight: number };
  texture: { key?: string; frames: Record<string, unknown>; setFilter(): void }; scene?: unknown;
  parentContainer?: Display; input?: { enabled: boolean }; animation?: string;
  readonly list: Display[] = []; private readonly data = new Map<string, unknown>();
  constructor(public x: number, public y: number, public key?: string, frame?: string | number) {
    super(); this.frame = { name: frame, realWidth: 24, realHeight: 32 }; this.texture = { key, frames: {}, setFilter() {} };
  }
  setName(value: string) { this.name = value; return this; }
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setPosition(x: number, y: number) { this.x = x; this.y = y; return this; }
  setDepth(value: number) { this.depth = value; return this; }
  setScrollFactor() { return this; }
  setScale() { return this; }
  setAlpha(value: number) { this.alpha = value; return this; }
  setVisible(value: boolean) { this.visible = value; return this; }
  setInteractive() { this.input = { enabled: true }; return this; }
  disableInteractive() { if (this.input) this.input.enabled = false; return this; }
  setData(key: string, value: unknown) { this.data.set(key, value); return this; }
  getData(key: string) { return this.data.get(key); }
  setText(value: string | string[]) { this.text = Array.isArray(value) ? value.join('\n') : value; this.height = this.text.split('\n').length * 24; return this; }
  setStyle() { return this; } setColor() { return this; } setPadding() { return this; }
  setLineSpacing() { return this; } setWordWrapWidth() { return this; }
  setBackgroundColor() { return this; } setStrokeStyle() { return this; } setFillStyle() { return this; }
  setSize(width: number, height: number) { this.width = width; this.height = height; return this; }
  setDisplaySize(width: number, height: number) { return this.setSize(width, height); }
  setFrame(value: string | number) { this.frame.name = value; return this; }
  play(value: string) { this.animation = value; return this; }
  add(children: Display | Display[]) {
    for (const child of Array.isArray(children) ? children : [children]) { child.parentContainer = this; this.list.push(child); }
    return this;
  }
  removeAll(destroy = false) { if (destroy) this.list.forEach(child => child.destroy()); this.list.length = 0; return this; }
  destroy() {
    if (this.destroyed) return;
    this.destroyed = true; this.active = this.visible = false;
    this.list.forEach(child => child.destroy()); this.list.length = 0;
    this.emit('destroy', this); this.removeAllListeners();
  }
}
const visible = (display: Display): boolean => !display.destroyed && display.visible && display.alpha > 0
  && (!display.parentContainer || visible(display.parentContainer));
const uiNames = ['encounter:offer', 'encounter:step', 'encounter:result', 'encounter:clear', 'update', 'shutdown'];
const pointer = { button: 0, id: 1, leftButtonDown: () => true };
const clone = <T>(value: T): T => structuredClone(value);
function configWith(mutate: (raw: typeof encountersRaw) => void): EncountersConfig {
  const raw = clone(encountersRaw); mutate(raw);
  const parsed = parseEncountersConfig(raw); ok(parsed.config, `测试克隆通过配置校验：${parsed.errors.join('; ')}`);
  return parsed.config;
}
function fixture(options: { missingTexture?: boolean; missingAnimation?: boolean; invalidAnimation?: boolean } = {}) {
  const displays: Display[] = [], events = new Events();
  const prog: Progress = Object.assign(new Progress(), { encounters: { sentinel: { cooldownUntil: 123, resolved: false } } });
  prog.inventory = { hp_pill_small: 0, nine_leaf_ganoderma: 7 };
  const add = (x: number, y: number, key?: string, frame?: string | number) => {
    const display = new Display(x, y, key, frame); display.scene = scene; displays.push(display); return display;
  };
  const texture = { getFrameNames: () => ['0', '1'], has: (key: string) => ['0', '1', '__BASE'].includes(key) };
  const scene = {
    prog, events, scale: { width: 1280, height: 720 },
    cameras: { main: { width: 1280, height: 720, scrollX: 0, scrollY: 0 } },
    textures: { exists: () => !options.missingTexture, get: () => texture },
    cache: { json: { get: () => ({ origin: [0.5, 1], frameSize: [24, 32] }) } },
    anims: { exists: () => !options.missingAnimation, get: () => ({ frames: [
      { textureKey: options.invalidAnimation ? 'wrong_texture' : 'fx_enc_help_mark', textureFrame: '0' },
    ] }) },
    add: { container: (x: number, y: number, children?: Display[]) => add(x, y).add(children ?? []),
      rectangle: (x: number, y: number, width: number, height: number) => add(x, y).setSize(width, height),
      text: (x: number, y: number, text: string | string[]) => add(x, y).setText(text), sprite: add },
  };
  const ui = new EncounterUi(scene as unknown as GameScene);
  const controls = () => displays.filter(display => display.name.startsWith('encounter-') && visible(display));
  const named = (name: string) => {
    const display = [...displays].reverse().find(row => row.name === name && visible(row));
    ok(display, `找到可见显示对象 ${name}`); return display;
  };
  return { scene, displays, prog, events, ui, controls, named };
}

const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let writes = 0;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: () => null, setItem: () => { writes++; }, removeItem: () => { writes++; },
} });
try {
  ok(ENCOUNTERS, '真实奇遇表有效');
  // tip 临时开态：正式五事件均已启用；关态行为只使用内存夹具验证。
  eq(ENCOUNTERS.encounters.length, 5, 'tip 临时开态保留正式五事件');
  for (const encounter of ENCOUNTERS.encounters) eq(encounter.enabled, true, `${encounter.id} tip 临时开态`);
  const officialBefore = JSON.stringify(ENCOUNTERS), rawBefore = JSON.stringify(encountersRaw);
  const disabledConfig = configWith(raw => { raw.encounters.forEach(row => { row.enabled = false; }); });
  const f = fixture(), before = JSON.stringify(f.prog.exportSave());
  eq(f.controls().length, 0, '无 offer 时 0 个可见奇遇 UI 控件');
  for (const name of uiNames) eq(f.events.listenerCount(name), 1, `订阅 ${name}`);
  for (const encounter of disabledConfig.encounters) {
    f.ui.showOffer({ encounterId: encounter.id, attemptId: 'disabled-ui-attempt', config: disabledConfig, x: 80, y: 120 });
    eq(f.controls().length, 0, `${encounter.id} 关态夹具不显示任何控件`);
  }
  const id = ENCOUNTERS.encounters[0].id;
  for (const offer of [
    { encounterId: id, config: null }, { encounterId: 'missing' },
    { encounterId: id, config: configWith(raw => { raw.encounters[0].enabled = true; }) },
  ]) {
    f.ui.showOffer({ ...offer, x: 80, y: 120 });
    eq(f.controls().length, 0, '坏表 / 缺事件 / preview unavailable 均隐藏');
  }

  const target = { x: 120, y: 200, height: 64 };
  const offer: EncounterOffer = { encounterId: id, mock: true, target };
  f.ui.showOffer(offer);
  const mark = f.named('encounter-help-mark');
  eq(mark.key, 'fx_enc_help_mark', '复用既有奇遇求助贴图');
  same([mark.originX, mark.originY], [0.5, 1], '求助提示原点在底边');
  same([mark.x, mark.y], [120, 132], '默认目标顶边上方 4px');
  eq(mark.animation, 'fx_enc_help_mark_idle', '存在合法动画时优先播放 idle');
  eq(f.named('encounter-dialog').text, t('enc.stranded_cultivator.offer'), '对白通过真实 t() 展示');
  target.x = 180; target.y = 240; f.events.emit('update');
  same([f.named('encounter-help-mark').x, f.named('encounter-help-mark').y], [180, 172], 'update 跟随目标世界坐标');
  f.ui.showOffer({ ...offer, target: { x: 40, y: 240, headY: 140 } });
  eq(f.named('encounter-help-mark').y, 136, 'headY 指定头顶并保留 4px 间距');
  f.ui.showOffer({ ...offer, target: undefined, x: 90, y: 160, headOffset: 44 });
  same([f.named('encounter-help-mark').x, f.named('encounter-help-mark').y], [90, 116], '无名坐标支持显式 headOffset');
  const repeatConfig = configWith(raw => { raw.encounters[0].script.steps[0].textKeys = ['enc.stranded_cultivator.offer_repeat']; });
  f.ui.showOffer({ ...offer, config: repeatConfig, vars: { player: '青舟' } });
  eq(f.named('encounter-dialog').text, t('enc.stranded_cultivator.offer_repeat', { player: '青舟' }), 'offer vars 传入 t()');
  ok(f.named('encounter-dialog').text.includes('青舟'), '对白插值后可见道号');

  const choices: unknown[] = [];
  f.events.on('encounter:ui-choice', payload => choices.push(payload));
  const decide: EncounterOffer = { ...offer, stepId: 'decide' };
  f.events.emit('encounter:step', decide);
  eq(f.named('encounter-choice:fight').text, t('enc.stranded_cultivator.choice_fight'), 'choiceIds 映射真实 choices 文案');
  eq(f.named('encounter-choice:medicine').getData('disabled'), true, '缺料选项标记 disabled');
  eq(f.named('encounter-choice:medicine').input?.enabled === true, false, '缺料选项不响应指针');
  ok(f.named('encounter-lack:medicine').text.includes(ITEMS.hp_pill_small.name), '缺料原因显示物品名称');
  const medicinePreview = f.named('encounter-preview:medicine').text;
  ok(medicinePreview.includes(ITEMS.hp_pill_small.name), 'cost.items 只读预览物品');
  ok(medicinePreview.includes('900'), '直接 finish 的结局展示真实修为奖励');
  ok(!f.displays.some(display => display.name === 'encounter-preview:fight' && visible(display)
    && /1200|648/.test(display.text)), '遇 battle 分歧不猜测最终奖励');
  f.named('encounter-choice:medicine').emit('pointerdown', pointer);
  eq(choices.length, 0, '禁用选项不提交表现选择');
  f.named('encounter-choice:fight').emit('pointerdown', pointer);
  same(choices[0], { encounterId: id, stepId: 'decide', choiceId: 'fight', mock: true }, '点击只发 UI 表现事件');
  ok(visible(f.named('encounter-panel')), '选择后 offer 保持显示');
  eq(f.named('encounter-choice:fight').text, t('enc.stranded_cultivator.choice_fight'), '选择后不推进到 next');
  eq(JSON.stringify(f.prog.exportSave()), before, '展示与选择不改 inventory、奇遇哨兵或其他 Progress 字段');
  eq(writes, 0, '展示与选择不写盘');

  f.prog.inventory.hp_pill_small = 1; const withMedicine = JSON.stringify(f.prog.exportSave());
  f.ui.refresh();
  eq(f.named('encounter-choice:medicine').getData('disabled'), false, '材料足够后 refresh 恢复可选');
  eq(f.named('encounter-choice:medicine').input?.enabled, true, '材料足够后可响应指针');
  f.named('encounter-choice:medicine').emit('pointerdown', pointer);
  eq(choices.length, 2, '可选 medicine 只追加表现事件');
  eq(JSON.stringify(f.prog.exportSave()), withMedicine, '选择含 cost/rewards/hooks 的选项仍不扣料、不结算');

  const fullConfig = configWith(raw => {
    Object.assign(raw.encounters[0].outcomes[1].rewards, {
      spiritStone: 123, items: [{ item: 'nine_leaf_ganoderma', count: 3 }], insight: 2,
    });
    Object.assign(raw.encounters[0].outcomes[1].hooks, { daoHeartDelta: -2,
      karma: [{ flag: 'enc_wanderer_aided', value: true }],
    });
  });
  f.ui.showOffer({ ...decide, config: fullConfig });
  const fullPreview = f.named('encounter-preview:medicine').text;
  for (const expected of [
    t('encounter.ui.cost_item', { item: ITEMS.hp_pill_small.name, n: 1 }),
    t('encounter.ui.reward_exp', { n: 900 }), t('encounter.ui.reward_stones', { n: 123 }),
    t('encounter.ui.reward_item', { item: ITEMS.nine_leaf_ganoderma.name, n: 3 }),
    t('encounter.ui.reward_insight', { n: 2 }), t('encounter.ui.hook_dao_heart', { n: -2 }),
    t('encounter.ui.hook_morality', { n: '+1' }),
    t('encounter.ui.hook_karma', { flag: t('karma.flag.enc_wanderer_aided'), value: t('encounter.ui.flag_on') }),
    t('encounter.ui.hook_affinity', { npc: NPCS.enc_wanderer?.name ?? 'enc_wanderer', n: '+2' }),
    t('encounter.ui.hook_once'),
  ]) ok(fullPreview.includes(expected), `rewards / hooks 按配置另列：${expected}`);
  ok(!fullPreview.includes(t('karma.flag.enc_wanderer_rescued')), 'aided 预览不显示其他结局的因果标记');
  ok(!f.displays.some(display => display.name === 'encounter-preview:leave' && visible(display)), '空奖励与 hooks 不编造预览');
  const chainConfig = configWith(raw => {
    raw.encounters[0].choices[1].next = 'medicine_bridge';
    Object.assign(raw.encounters[0].script, { steps: [...raw.encounters[0].script.steps,
      { id: 'medicine_bridge', type: 'dialog', next: 'end_medicine', textKeys: ['enc.stranded_cultivator.aided'] },
    ] });
  });
  f.ui.showOffer({ ...decide, config: chainConfig });
  ok(f.named('encounter-preview:medicine').text.includes(t('encounter.ui.reward_exp', { n: 900 })), '可沿无分支对白推到 finish 的奖励');
  const multipleReq = configWith(raw => {
    Object.assign(raw.encounters[0].choices[1], { req: { items: [
      { item: 'hp_pill_small', count: 1 }, { item: 'nine_leaf_ganoderma', count: 8 },
    ] } });
  });
  f.ui.showOffer({ ...decide, config: multipleReq });
  eq(f.named('encounter-choice:medicine').getData('disabled'), true, 'req.items 任何一项不足都禁用');
  ok(f.named('encounter-lack:medicine').text.includes(ITEMS.nine_leaf_ganoderma.name), '显示实际不足的第二种材料');
  f.ui.showOffer(decide);
  const beforeRace = f.named('encounter-choice:medicine');
  f.prog.inventory.hp_pill_small = 0;
  const raceSave = JSON.stringify(f.prog.exportSave());
  beforeRace.emit('pointerdown', pointer);
  eq(choices.length, 2, '点击时复查材料，库存同帧耗尽不会提交选择');
  eq(f.named('encounter-choice:medicine').getData('disabled'), true, '同帧缺料刷新为禁用');
  eq(JSON.stringify(f.prog.exportSave()), raceSave, '点击复查不修改 Progress');
  f.prog.inventory.hp_pill_small = 1;
  eq(JSON.stringify(f.prog.exportSave()), withMedicine, '测试库存恢复，后续保持同一只读快照');
  f.ui.showOffer({ encounterId: id, attemptId: 'disabled-ui-attempt', stepId: 'decide', config: disabledConfig, x: 80, y: 120 });
  eq(f.controls().length, 0, 'mock 切回关态夹具立即全隐藏');

  f.events.emit('encounter:offer', offer);
  ok(f.controls().length > 0, 'offer 事件显示显式 mock');
  f.events.emit('encounter:clear');
  eq(f.controls().length, 0, 'clear 事件隐藏全部控件');
  f.ui.clear(); eq(f.controls().length, 0, '重复 clear 安全');
  f.ui.showOffer(decide); f.named('encounter-close').emit('pointerdown', pointer);
  eq(f.controls().length, 0, '关闭按钮仅隐藏 UI');
  eq(choices.length, 2, '关闭不替玩家选择');
  eq(JSON.stringify(f.prog.exportSave()), withMedicine, '关闭不更改 Progress');
  f.ui.showOffer(offer); f.events.emit('shutdown');
  eq(f.controls().length, 0, 'SHUTDOWN 清理全部显示对象');
  for (const name of uiNames) eq(f.events.listenerCount(name), 0, `SHUTDOWN 退订 ${name}`);
  const allocated = f.displays.length;
  f.events.emit('encounter:offer', offer); f.events.emit('encounter:step', decide); f.events.emit('update');
  eq(f.displays.length, allocated, '销毁后事件不会重建 UI');
  f.ui.destroy(); eq(f.controls().length, 0, '重复 destroy 安全');

  for (const options of [{ missingAnimation: true }, { invalidAnimation: true }]) {
    const fallback = fixture(options); fallback.ui.showOffer(offer);
    eq(fallback.named('encounter-help-mark').animation, undefined, '动画缺失或帧无效时使用静帧');
    ok(visible(fallback.named('encounter-dialog')), '静帧回退不影响对白');
    fallback.ui.destroy();
  }
  const missing = fixture({ missingTexture: true }); missing.ui.showOffer(offer);
  ok(!missing.displays.some(display => display.name === 'encounter-help-mark' && visible(display)), '缺贴图时不创建坏标记');
  ok(visible(missing.named('encounter-dialog')), '缺贴图时仍可显示对白'); missing.ui.destroy();
  eq(JSON.stringify(ENCOUNTERS), officialBefore, '正式已校验奇遇表完全未改');
  eq(JSON.stringify(encountersRaw), rawBefore, '正式原始表 enabled 与其他字段完全未改');
  eq(writes, 0, '全部 UI 测试零写盘');

  // GameScene使用的真实runtime + Progress事务 + UI，只替换显示对象与localStorage介质。
  const disk = new Map<string, string>(); let saveAttempts = 0, successfulSaves = 0, saveFails = false;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { saveAttempts++; if (saveFails) throw new Error('fixture storage failure'); disk.set(key, value); successfulSaves++; },
    removeItem: (key: string) => { disk.delete(key); },
  } });
  const runtimeConfig = configWith(raw => { raw.encounters.forEach((row, index) => { row.enabled = index === 0; }); });
  const live = fixture(); live.prog.encounters = undefined; live.prog.inventory = { hp_pill_small: 2 };
  live.prog.level = 12; live.prog.daoHeart = 20; live.prog.morality = 0;
  live.prog.pillQualities.hp_pill_small = { low: 1, high: 1 };
  const runtimeCtx = (mapId: string): EncounterContext => ({ mapId, level: 99, realmId: 'foundation', sectJoined: true,
    questsDone: new Set(['q_fox']), featuresReady: new Set(['moral_state', 'insight_reward']), daoHeart: 20, nowMs: 10_000_000 });
  const emitted: string[] = []; let near = false, hasAnchor = false, rngCalls = 0, committed = 0;
  const runtime = new EncounterSceneRuntime({ progress: live.prog, config: runtimeConfig, pacing: pacingRaw.encounter,
    rng: () => { rngCalls++; return 0; }, context: () => runtimeCtx('lingxi_path'),
    anchor: () => hasAnchor ? { x: 80, y: 120 } : undefined, near: () => near,
    emit: (name, payload) => { emitted.push(name); live.events.emit(name, payload); }, onCommit: () => { committed++; },
  });
  live.events.on('encounter:ui-advance', payload => runtime.advance(payload));
  live.events.on('encounter:ui-choice', payload => runtime.choose(payload));
  runtime.enter('runtime-visit');
  eq(rngCalls, 2, '真实runtime进图只掷共享概率与weight'); eq(successfulSaves, 1, 'trigger只真实保存一次');
  eq(live.controls().length, 0, '地图缺已登记锚点时真实offer保持0可见');
  eq((live.prog.encounterSave().encounters?.seen as string[]).includes(id), false, '无真实锚点不提前记seen');
  hasAnchor = true; runtime.update(16);
  eq(live.controls().length, 0, '未靠近真实锚点也不提前展示');
  near = true; runtime.update(16);
  eq(successfulSaves, 2, '真实锚点首次展示另保存seen');
  eq((live.prog.encounterSave().encounters?.seen as string[]).includes(id), true, '真实锚点展示才记seen');
  eq(live.ui.isOpen(), false, 'runner自动offer只显示marker，不自动打开模态面板');
  ok(visible(live.named('encounter-help-mark')), 'runner offer接通UI锚点提示');
  near = false; eq(runtime.interact(), false, '不在锚点附近不可打开'); near = true; hasAnchor = false;
  eq(runtime.interact(), false, '缺地图锚点保持不可见'); hasAnchor = true;
  ok(runtime.interact(), '走近锚点交互打开真实offer'); eq(live.ui.isOpen(), true, 'UI打开真实runner节点');
  eq(live.named('encounter-dialog').text, t('enc.stranded_cultivator.offer'), '真实offer中文对白');
  runtime.update(16); runtime.update(16);
  eq(live.ui.isOpen(), true, '真实GameScene逐帧update不收起玩家已打开的面板');
  const savedOffer = JSON.stringify(live.prog.encounters), beforeCloseWrites = saveAttempts;
  live.named('encounter-close').emit('pointerdown', pointer);
  eq(live.ui.isOpen(), false, '关闭真实对白仅隐藏'); eq(JSON.stringify(live.prog.encounters), savedOffer, '关闭不终止/代选');
  eq(saveAttempts, beforeCloseWrites, '关闭不提交存档'); runtime.interact();
  const beforeContinue = successfulSaves; live.named('encounter-continue').emit('pointerdown', pointer);
  eq(runtime.runner.offer()?.stepId, 'decide', '真实continue事件经runtime推进runner');
  eq(successfulSaves, beforeContinue + 1, '节点推进一次保存');
  eq(live.named('encounter-choice:medicine').getData('disabled'), false, '真实库存2药时medicine可选');
  const pendingSave = JSON.stringify(live.prog.exportSave()), diskBefore = JSON.stringify([...disk]);
  const attemptsBeforeMedicine = saveAttempts, successesBeforeMedicine = successfulSaves;
  saveFails = true; live.named('encounter-choice:medicine').emit('pointerdown', pointer);
  eq(saveAttempts, attemptsBeforeMedicine + 1, '扣药结算失败仅一次真实save尝试');
  eq(successfulSaves, successesBeforeMedicine, '失败未写入磁盘');
  eq(JSON.stringify(live.prog.exportSave()), pendingSave, '真实Progress保存失败回滚全部内存字段');
  eq(JSON.stringify([...disk]), diskBefore, '保存失败磁盘保持原节点');
  same(live.prog.pillQualityCounts('hp_pill_small'), { low: 1, mid: 0, high: 1, supreme: 0 }, '失败恢复药品品质分桶');
  eq(runtime.runner.offer()?.stepId, 'decide', '失败仍停留选择节点可重试');
  saveFails = false; live.named('encounter-choice:medicine').emit('pointerdown', pointer);
  eq(successfulSaves, successesBeforeMedicine + 1, '扣药/奖励/冷却/attempt同一次真实保存');
  eq(live.prog.count('hp_pill_small'), 1, 'UI选择真实扣药1');
  same(live.prog.pillQualityCounts('hp_pill_small'), { low: 0, mid: 0, high: 1, supreme: 0 }, '扣药沿已有品质分桶顺序');
  eq(live.prog.encounterSave().encounters?.resolved?.[id], 'aided', 'UI分支真实结算aided');
  ok(emitted.includes('encounter:step') && emitted.includes('encounter:result'), 'runner step与settled结果都路由到UI');
  eq(live.named('encounter-dialog').text, t('enc.stranded_cultivator.aided'), '结果面板显示真实outcome文案');
  ok(!live.displays.some(display => display.name === 'encounter-continue' && visible(display)), '结果没有继续发奖入口');
  const resultSaves = saveAttempts, resultState = JSON.stringify(live.prog.exportSave());
  live.ui.advance(); live.ui.selectChoice(1); live.named('encounter-close').emit('pointerdown', pointer);
  eq(saveAttempts, resultSaves, '点击结果与关闭不会重复提交'); eq(JSON.stringify(live.prog.exportSave()), resultState, '结果交互无二次扣药发奖');
  eq(rngCalls, 2, '交互/重试/结果全程无额外随机');
  const loaded = Progress.load();
  eq(loaded.count('hp_pill_small'), 1, '真实Progress.load恢复已消耗库存');
  eq(loaded.encounters?.resolved?.[id], 'aided', '真实存档恢复已结算记录');
  same(loaded.pillQualityCounts('hp_pill_small'), { low: 0, mid: 0, high: 1, supreme: 0 }, '读档保留已扣药品质账本');
  ok(committed >= 3, 'runtime通知真实事务完成'); live.ui.destroy();

  const meditationUi = fixture(); meditationUi.prog.encounters = undefined; meditationUi.prog.inventory = {};
  const meditationConfig = configWith(raw => { raw.encounters.forEach((row, index) => { row.enabled = index === 3; }); });
  let active = true, stopped = 0, meditationRolls = 0;
  const meditationRuntime = new EncounterSceneRuntime({ progress: meditationUi.prog, config: meditationConfig, pacing: pacingRaw.encounter,
    rng: () => { meditationRolls++; return 0; }, context: () => runtimeCtx('qingyun_village'), anchor: () => ({ x: 60, y: 90 }),
    near: () => true, emit: (name, payload) => meditationUi.events.emit(name, payload),
  });
  meditationUi.events.on('encounter:ui-advance', payload => meditationRuntime.advance(payload));
  meditationUi.events.on('encounter:ui-choice', payload => meditationRuntime.choose(payload));
  meditationRuntime.enter('runtime-meditation'); meditationRuntime.update(60000);
  eq(meditationRolls, 0, '未注册打坐provider时仙人不入池');
  const unregister = meditationRuntime.registerMeditation({ active: () => active, atAnchor: () => true,
    stop: () => { active = false; stopped++; } });
  meditationRuntime.update(59000); meditationRuntime.update(600000, { paused: true });
  eq(meditationRolls, 0, '暂停/后台通过真实runtime不累计也不补掷'); meditationRuntime.update(1000);
  eq(meditationRolls, 2, '注册provider后累计满一分钟按独立概率触发'); eq(stopped, 1, '仙人命中自动结束打坐');
  ok(meditationRuntime.interact(), '仙人真实锚点交互'); meditationUi.ui.advance();
  meditationRuntime.update(16); meditationRuntime.update(16);
  eq(meditationUi.ui.isOpen(), true, '问道打开后帧更新保持面板'); eq(stopped, 1, 'active期间帧更新不重复停止打坐');
  const insightBefore = meditationUi.prog.stat('insight'), insightWrites = successfulSaves;
  meditationUi.ui.selectChoice(0);
  eq(successfulSaves, insightWrites + 1, '永久悟性与结算记录一次保存');
  eq(meditationUi.prog.stat('insight'), insightBefore + 1, '永久悟性立即进入真实stat计算');
  eq(meditationUi.prog.bonusStats?.insight, 1, '永久悟性按bonusStats记录');
  const loadedInsight = Progress.load(); eq(loadedInsight.bonusStats?.insight, 1, '真实存档恢复永久悟性');
  eq(loadedInsight.stat('insight'), meditationUi.prog.stat('insight'), '刷新后属性计算继续包含永久悟性');
  eq(meditationUi.named('encounter-dialog').text, t('enc.sage_advice.correct'), '问道结果路由中文文案');
  unregister(); meditationUi.ui.destroy();

  // 保存失败后即使Esc关闭面板，也由正式帧循环完成已经授权的选择/推进。
  for (const action of ['advance', 'choose'] as const) {
    const retryUi = fixture(); retryUi.prog.encounters = undefined; retryUi.prog.inventory = { hp_pill_small: 2 };
    let rolls = 0;
    const retryRuntime = new EncounterSceneRuntime({ progress: retryUi.prog, config: runtimeConfig, pacing: pacingRaw.encounter,
      rng: () => { rolls++; return 0; }, context: () => runtimeCtx('lingxi_path'), anchor: () => ({ x: 60, y: 90 }),
      near: () => true, emit: (name, payload) => retryUi.events.emit(name, payload),
    });
    retryUi.events.on('encounter:ui-advance', payload => retryRuntime.advance(payload));
    retryUi.events.on('encounter:ui-choice', payload => retryRuntime.choose(payload));
    retryRuntime.enter(`closed-pending-${action}`); ok(retryRuntime.interact(), '保存失败场景打开真实面板');
    if (action === 'choose') retryUi.ui.advance();
    const beforeAction = JSON.stringify(retryUi.prog.exportSave()), completedBefore = successfulSaves;
    saveFails = true;
    if (action === 'advance') retryUi.ui.advance(); else retryUi.ui.selectChoice(1);
    eq(JSON.stringify(retryUi.prog.exportSave()), beforeAction, `${action}保存失败完整回滚`);
    retryUi.ui.clear(); eq(retryUi.ui.isOpen(), false, 'Esc/clear关闭失败动作面板');
    saveFails = false; retryRuntime.update(16);
    eq(successfulSaves, completedBefore + 1, `${action}关闭后下帧只提交一次原动作`);
    eq(retryUi.ui.isOpen(), true, `${action}重试后恢复可见节点/结果`);
    if (action === 'advance') {
      eq(retryRuntime.runner.offer()?.stepId, 'decide', '关闭后自动恢复推进的选择节点');
      eq(retryUi.prog.count('hp_pill_small'), 2, '恢复推进不代选扣药');
    } else {
      eq(retryUi.prog.encounterSave().encounters?.resolved?.[id], 'aided', '关闭后自动完成已确认medicine');
      eq(retryUi.prog.count('hp_pill_small'), 1, '自动重试只扣一次药');
      eq(retryUi.named('encounter-dialog').text, t('enc.stranded_cultivator.aided'), '关闭后重试恢复真实结果文案');
    }
    const afterRetry = successfulSaves; retryRuntime.update(16);
    eq(successfulSaves, afterRetry, '后续帧不重复提交原动作'); eq(rolls, 2, '跨帧自动重试不重新掷概率');
    retryUi.ui.destroy();
  }

  // 死亡只调用一次terminate；保存恢复后帧循环负责结束，不能永久卡pending_save。
  const deathUi = fixture(); deathUi.prog.encounters = undefined; deathUi.prog.inventory = { hp_pill_small: 2 };
  let deathNow = 10_000_000, deathRolls = 0;
  const deathRuntime = new EncounterSceneRuntime({ progress: deathUi.prog, config: runtimeConfig, pacing: pacingRaw.encounter,
    rng: () => { deathRolls++; return 0; }, context: () => ({ ...runtimeCtx('lingxi_path'), nowMs: deathNow }),
    anchor: () => ({ x: 60, y: 90 }), near: () => true, emit: (name, payload) => deathUi.events.emit(name, payload),
  });
  deathRuntime.enter('death-pending');
  const beforeDeath = JSON.stringify(deathUi.prog.exportSave());
  const deathRewards = [deathUi.prog.exp, deathUi.prog.stones, deathUi.prog.count('hp_pill_small')];
  const deathWrites = successfulSaves; saveFails = true;
  eq(deathRuntime.terminate('failed'), false, '死亡终止保存失败向调用方返回未完成');
  eq(JSON.stringify(deathUi.prog.exportSave()), beforeDeath, '死亡终止保存失败保留原状态');
  deathUi.ui.clear(); saveFails = false; deathRuntime.update(16);
  eq(successfulSaves, deathWrites + 1, '死亡调用方未重调也由帧更新提交failed一次');
  eq(deathUi.prog.encounterSave().encounters?.active, null, '死亡保存恢复后清空active');
  same([deathUi.prog.exp, deathUi.prog.stones, deathUi.prog.count('hp_pill_small')], deathRewards, '死亡failed无奖励无额外消耗');
  eq(deathUi.prog.encounterSave().encounters?.resolved?.[id], undefined, '死亡failed不封存有效结局');
  eq(deathUi.named('encounter-dialog').text, t('enc.stranded_cultivator.failed'), '死亡恢复提交显示failed结果');
  const deathCommitted = successfulSaves; deathRuntime.update(16);
  eq(successfulSaves, deathCommitted, '死亡failed后续帧不重复保存');
  deathNow += 1_800_001; deathRuntime.enter('death-new-visit');
  ok(deathRuntime.runner.offer(), '死亡恢复后冷却到期新visit可正常触发');
  eq(deathRolls, 4, '死亡恢复不补掷，只有新visit再掷概率与weight'); deathUi.ui.destroy();

  // 关态夹具Runtime所有入口（含新增实体/机关入口）不能碰上下文、存档、随机或实体provider。
  for (const config of [disabledConfig, null]) {
    let forbiddenCalls = 0;
    const forbidden = () => { forbiddenCalls++; throw new Error('关态不允许访问玩法依赖'); };
    const proxy = new Proxy({}, { get: forbidden, ownKeys: forbidden });
    const beforeDisabledWrites = saveAttempts;
    const disabledRuntime = new EncounterSceneRuntime({ config, progress: proxy as Progress, pacing: pacingRaw.encounter,
      context: forbidden, anchor: forbidden, near: forbidden, emit: forbidden, onCommit: forbidden, rng: forbidden,
      battle: { start: forbidden } });
    disabledRuntime.enter('disabled-runtime'); disabledRuntime.update(60000, proxy);
    eq(disabledRuntime.interact(), false, '关态Runtime没有交互');
    disabledRuntime.advance(proxy); disabledRuntime.choose(proxy); disabledRuntime.puzzle(proxy);
    disabledRuntime.reveal('attempt'); disabledRuntime.completeChallenge('attempt', 'battle', true);
    disabledRuntime.completeChallenge('attempt', 'scene', true); disabledRuntime.completeChallenge('attempt', 'puzzle', false);
    eq(disabledRuntime.terminate('failed'), true, '关态死亡无需事务');
    eq(disabledRuntime.terminate('missed'), true, '关态离图无需事务');
    const unregisterDisabled = disabledRuntime.registerMeditation(proxy as Parameters<EncounterSceneRuntime['registerMeditation']>[0]);
    disabledRuntime.update(60000); disabledRuntime.interrupt(); unregisterDisabled(); disabledRuntime.destroy(); disabledRuntime.update(16);
    eq(disabledRuntime.runner.offer(), undefined, '关态Runtime无offer');
    eq(forbiddenCalls, 0, '关态Runtime全部入口零上下文/存档读取/随机/provider/emit');
    eq(saveAttempts, beforeDisabledWrites, '关态Runtime全部入口零写盘');
  }

  // 真实Runtime接实体provider；怪物显示/物理由provider负责，胜负回报走真实事务。
  type BattleRequest = Parameters<NonNullable<ConstructorParameters<typeof EncounterSceneRuntime>[0]['battle']>['start']>[0];
  const entityFixture = (encounterId: string, noAnchor = false) => {
    const ui = fixture(), row = encountersRaw.encounters.find(row => row.id === encounterId)!;
    ui.prog.encounters = undefined; ui.prog.inventory = {}; ui.prog.level = 30; ui.prog.daoHeart = 20; ui.prog.morality = 0;
    const config = configWith(raw => { raw.encounters.forEach(row => { row.enabled = row.id === encounterId; }); });
    const requests: BattleRequest[] = [], completions: ((success: boolean) => void)[] = [], disposals: number[] = [];
    const emitted: string[] = []; let blocked = false, rolls = 0, now = 10_000_000;
    const runtime = new EncounterSceneRuntime({ progress: ui.prog, config, pacing: pacingRaw.encounter,
      context: () => ({ ...runtimeCtx(row.maps[0]), blocked, nowMs: now,
        questsDone: new Set(['q_fox', 'q_main_04']), featuresReady: new Set(['moral_state', 'spirit_scan']) }),
      rng: () => { rolls++; return 0; }, anchor: () => noAnchor ? undefined : { x: 60, y: 90 }, near: () => true,
      emit: (name, payload) => { emitted.push(name); ui.events.emit(name, payload); },
      battle: { start(request, complete) {
        const index = requests.length; requests.push(request); completions.push(complete); disposals.push(0);
        return { dispose: () => { disposals[index]++; } };
      } },
    });
    ui.events.on('encounter:ui-advance', payload => runtime.advance(payload));
    ui.events.on('encounter:ui-choice', payload => runtime.choose(payload));
    ui.events.on('encounter:ui-puzzle', payload => runtime.puzzle(payload));
    const current = () => { const offer = runtime.runner.offer(); ok(offer, `${encounterId}有当前真实节点`); return offer; };
    const advance = () => runtime.advance(current());
    const choose = (choiceId: string) => runtime.choose({ ...current(), choiceId });
    runtime.enter(`entity-${encounterId}`);
    return { ...ui, row, runtime, requests, completions, disposals, emitted, current, advance, choose,
      block: (value: boolean) => { blocked = value; }, setNow: (value: number) => { now = value; }, rolls: () => rolls,
      destroy: () => { runtime.destroy(); ui.ui.destroy(); } };
  };
  const startBattle = (f: ReturnType<typeof entityFixture>) => {
    if (f.row.id === 'enc_stranded_cultivator') {
      f.advance(); f.choose('fight');
      eq(f.requests.length, 0, '救援fight_start对白尚未结束不刷怪'); f.advance();
    } else { f.advance(); f.advance(); f.choose('guard'); }
    eq(f.current().stepId, 'battle', `${f.row.id}选择后到达真实battle`);
    eq(f.requests.length, 1, `${f.row.id}自动仅启动一波实体`);
  };
  for (const encounterId of ['enc_stranded_cultivator', 'enc_fragrant_herb']) {
    const f = entityFixture(encounterId); ok(f.runtime.interact(), `${encounterId}真实锚点可交互`);
    f.ui.advance();
    if (encounterId === 'enc_stranded_cultivator') {
      f.named('encounter-choice:fight').emit('pointerdown', pointer);
      eq(f.requests.length, 0, '选fight先展示真实出战对白'); f.ui.advance();
    } else { f.ui.advance(); f.named('encounter-choice:guard').emit('pointerdown', pointer); }
    const request = f.requests[0]; ok(request, `${encounterId}UI选择自动启动实体provider`);
    const step = f.row.script.steps.find(step => step.id === 'battle')!;
    same(request.spawns, (step as unknown as { spawns: unknown }).spawns, '刷怪数量与合法id取正式spawns');
    eq(request.warningMs, 800, '事件怪出场预警取真表800ms'); eq(request.respawnMs, 0, '事件波禁重生');
    eq(request.grantRewards, false, '事件怪走无击杀奖励隔离'); eq(request.encounterId, encounterId, 'provider收到真实事件id');
    eq(request.attemptId, f.current().attemptId, 'provider绑定真实attempt'); eq(request.stepId, 'battle', 'provider绑定当前挑战节点');
    same(request.anchor, { x: 60, y: 90 }, '刷怪使用已登记锚点');
    eq(f.ui.isOpen(), false, '实体战开始自动清理模态UI以释放战斗暂停');
    const beforeBattle = JSON.stringify(f.prog.exportSave()), beforeWrites = successfulSaves;
    f.runtime.update(16); f.runtime.update(16); f.advance();
    eq(f.requests.length, 1, '逐帧/非法advance不能重刷实体或跳过战斗');
    eq(f.ui.isOpen(), false, '实体战帧更新不重新打开阻挡战斗的面板');
    eq(JSON.stringify(f.prog.exportSave()), beforeBattle, '实体完成前无分段奖励或额外写状态');
    eq(successfulSaves, beforeWrites, '实体完成前逐帧不重复写盘');
    f.completions[0](true);
    eq(f.current().stepId, encounterId === 'enc_stranded_cultivator' ? 'thank' : 'harvest', '清完本波自动开放onWin交互节点');
    eq(f.disposals[0], 1, '胜利推进后清理本波句柄一次');
    eq(f.prog.stones, 0, '答谢/采摘确认前不给分段灵石');
    eq(f.prog.count('nine_leaf_ganoderma'), 0, '采摘确认前不给材料');
    const afterWin = successfulSaves; f.completions[0](true); f.completions[0](false);
    eq(successfulSaves, afterWin, '同波重复/过期胜负回报均不重复保存');
    f.advance();
    if (encounterId === 'enc_fragrant_herb') f.choose('leaf');
    const outcome = encounterId === 'enc_stranded_cultivator' ? 'rescued' : 'preserved';
    eq(f.prog.encounterSave().encounters?.resolved?.[encounterId], outcome, '实体路径通过runner提交正式有效结局');
    eq(f.prog.encounterSave().encounters?.settledAttempts?.length, 1, '实体路径只结算一份attempt');
    eq(f.prog.stones, encounterId === 'enc_stranded_cultivator' ? 648 : 0, '灵石奖励只取当前正式结局表');
    eq(f.prog.count('nine_leaf_ganoderma'), encounterId === 'enc_fragrant_herb' ? 1 : 0, '材料奖励只取当前正式结局表');
    const settledWrites = successfulSaves; f.completions[0](true); f.runtime.update(16);
    eq(successfulSaves, settledWrites, '结算后的过期回报与后续帧不二次发奖');
    eq(f.requests.length, 1, '整条实体路径只创建一波'); eq(f.rolls(), 2, '实体交互全程只有触发两次随机'); f.destroy();
    eq(f.disposals[0], 1, '胜利后destroy不二次销毁句柄');
  }

  // 保存故障发生在入战/清波两端：必须先落盘再刷实体，清波重试不刷第二波。
  const battleRetry = entityFixture('enc_stranded_cultivator'); battleRetry.advance(); battleRetry.choose('fight');
  const beforeBattleEntry = JSON.stringify(battleRetry.prog.exportSave()); saveFails = true; battleRetry.advance();
  eq(battleRetry.requests.length, 0, 'battle节点保存失败不抢先刷怪');
  eq(JSON.stringify(battleRetry.prog.exportSave()), beforeBattleEntry, '入战保存失败完整回滚');
  saveFails = false; battleRetry.runtime.update(16); eq(battleRetry.requests.length, 1, '下帧事务恢复后只启动一波');
  const beforeComplete = JSON.stringify(battleRetry.prog.exportSave()); saveFails = true; battleRetry.completions[0](true);
  eq(JSON.stringify(battleRetry.prog.exportSave()), beforeComplete, '实体清波推进保存失败完整回滚');
  battleRetry.runtime.update(16); eq(battleRetry.requests.length, 1, '清波事务待保存期间不重刷实体');
  saveFails = false; battleRetry.runtime.update(16);
  eq(battleRetry.current().stepId, 'thank', '清波保存恢复后自动推进到答谢');
  eq(battleRetry.requests.length, 1, '清波保存重试不生成第二波'); eq(battleRetry.disposals[0], 1, '重试清理实体句柄一次');
  const afterCompleteRetry = successfulSaves; battleRetry.completions[0](true); battleRetry.runtime.update(16);
  eq(successfulSaves, afterCompleteRetry, '清波重试完成后旧callback无二次事务'); battleRetry.destroy();

  const staleBattle = entityFixture('enc_stranded_cultivator'); startBattle(staleBattle);
  saveFails = true; staleBattle.completions[0](true);
  staleBattle.prog.inventory.hp_pill_small = 3; staleBattle.prog.hp = 17;
  saveFails = false; staleBattle.runtime.update(16); staleBattle.runtime.update(16);
  eq(staleBattle.current().stepId, 'thank', '清波失败草稿过期后保留胜负并基于新快照自动重放');
  eq(staleBattle.prog.count('hp_pill_small'), 3, '清波草稿过期不得覆盖后来库存');
  eq(staleBattle.prog.hp, 17, '清波草稿过期不得覆盖后来气血');
  eq(staleBattle.requests.length, 1, '清波草稿过期重放也不重新刷怪');
  eq(staleBattle.disposals[0], 1, '清波草稿过期恢复仍只销毁一次句柄'); staleBattle.destroy();

  const blockedBattle = entityFixture('enc_fragrant_herb'); startBattle(blockedBattle); blockedBattle.block(true);
  blockedBattle.completions[0](true); eq(blockedBattle.current().stepId, 'battle', '互斥期间实体回报不能越过runner门禁');
  blockedBattle.block(false); blockedBattle.runtime.update(16);
  eq(blockedBattle.current().stepId, 'harvest', '互斥解除后保留的清波回报自动推进');
  eq(blockedBattle.requests.length, 1, '互斥等待不重刷实体'); blockedBattle.destroy();

  for (const reason of ['failed', 'missed', 'provider-failed', 'destroy'] as const) {
    const f = entityFixture('enc_fragrant_herb'); startBattle(f);
    const beforeRewards = [f.prog.exp, f.prog.stones, f.prog.count('nine_leaf_ganoderma')];
    if (reason === 'provider-failed') f.completions[0](false);
    else if (reason === 'destroy') f.runtime.destroy();
    else ok(f.runtime.terminate(reason), `${reason}终止成功`);
    eq(f.disposals[0], 1, `${reason}清理事件实体句柄`);
    const afterTermination = successfulSaves, state = JSON.stringify(f.prog.exportSave());
    f.completions[0](true); f.completions[0](false);
    eq(successfulSaves, afterTermination, `${reason}后的过期回报不能保存`);
    eq(JSON.stringify(f.prog.exportSave()), state, `${reason}后的过期回报不能推进或改奖`);
    same([f.prog.exp, f.prog.stones, f.prog.count('nine_leaf_ganoderma')], beforeRewards, `${reason}不发额外奖励`);
    if (reason !== 'destroy') {
      eq(f.prog.encounterSave().encounters?.active, null, `${reason}清空active`);
      eq(f.prog.encounterSave().encounters?.resolved?.[f.row.id], undefined, `${reason}不消耗once`);
      ok(f.emitted.includes('encounter:result'), `${reason}展示正式失败/错过结果`);
    }
    f.destroy(); eq(f.disposals[0], 1, `${reason}重复destroy安全`);
  }

  const deathBattle = entityFixture('enc_stranded_cultivator'); startBattle(deathBattle);
  const deathBattleSave = JSON.stringify(deathBattle.prog.exportSave()); saveFails = true;
  eq(deathBattle.runtime.terminate('failed'), false, '实体战倒地保存失败可由帧循环重试');
  eq(deathBattle.disposals[0], 1, '倒地保存失败也立即清事件实体');
  eq(JSON.stringify(deathBattle.prog.exportSave()), deathBattleSave, '倒地失败事务保留原快照');
  deathBattle.completions[0](true); saveFails = false; deathBattle.runtime.update(16);
  eq(deathBattle.prog.encounterSave().encounters?.active, null, '倒地恢复后结束active而非卡battle');
  eq(deathBattle.prog.encounterSave().encounters?.resolved?.[deathBattle.row.id], undefined, '倒地后旧胜利回报不能变rescued');
  eq(deathBattle.prog.stones, 0, '倒地恢复无胜利灵石'); eq(deathBattle.requests.length, 1, '倒地待保存不重刷');
  eq(deathBattle.named('encounter-dialog').text, t('enc.stranded_cultivator.failed'), '倒地恢复沿正式failed文案'); deathBattle.destroy();

  const blockedDeath = entityFixture('enc_fragrant_herb'); startBattle(blockedDeath); blockedDeath.block(true);
  blockedDeath.completions[0](true); ok(blockedDeath.runtime.terminate('failed'), '倒地优先终止尚受互斥阻塞的清波回报');
  blockedDeath.block(false); const blockedDeathWrites = successfulSaves;
  blockedDeath.completions[0](true); blockedDeath.runtime.update(16);
  eq(blockedDeath.prog.encounterSave().encounters?.active, null, '倒地后解除互斥不再恢复胜利节点');
  eq(blockedDeath.named('encounter-dialog').text, t('enc.fragrant_herb.failed'), '倒地优先保留正式failed结局');
  eq(successfulSaves, blockedDeathWrites, '倒地后的旧胜利与解除互斥无额外保存'); blockedDeath.destroy();

  const noAnchorBattle = entityFixture('enc_fragrant_herb', true); eq(noAnchorBattle.runtime.interact(), false, '缺锚点仍不可凭空交互');
  startBattle(noAnchorBattle); eq(noAnchorBattle.requests[0].anchor, undefined, '缺锚点fixture仍可启动受信战斗适配');
  eq(noAnchorBattle.controls().length, 0, '缺锚点fixture启动前后不伪造可见offer');
  const trustedBattle = noAnchorBattle.current(); noAnchorBattle.runtime.completeChallenge(trustedBattle.attemptId, trustedBattle.stepId, true);
  eq(noAnchorBattle.current().stepId, 'harvest', '缺锚点fixture仍保留公开受信completeChallenge');
  noAnchorBattle.destroy();

  // 洞府在父地图原地推进scene，机关与奖励使用正式steps；不依赖未布置的小图。
  for (const outcome of ['taken', 'sealed', 'failed', 'missed'] as const) {
    const f = entityFixture('enc_hidden_abode');
    eq(f.runtime.runner.offer(), undefined, '洞府显形前无offer'); eq(f.controls().length, 0, '洞府显形前无UI');
    const active = f.prog.encounterSave().encounters?.active as { attemptId: string };
    ok(active, '未显形洞府已占用active');
    eq((f.prog.encounterSave().encounters?.seen as string[]).includes(f.row.id), false, '未显形洞府不记seen');
    f.runtime.reveal('stale-attempt'); eq(f.runtime.runner.offer(), undefined, '旧attempt不能显形洞府');
    f.runtime.reveal(active.attemptId); eq((f.prog.encounterSave().encounters?.seen as string[]).includes(f.row.id), true, '受信reveal显形并记seen');
    ok(f.runtime.interact(), '显形洞府可主动交互'); f.ui.advance();
    if (outcome === 'missed') f.choose('leave');
    else {
      f.named('encounter-choice:enter').emit('pointerdown', pointer);
      eq(f.current().stepId, 'inscription', 'enter后scene由Runtime自动原地推进石刻');
      eq(f.requests.length, 0, '洞府scene不会误刷战斗怪');
      eq(f.named('encounter-dialog').text, t('enc.hidden_abode.inscription'), '原地路径展示正式石刻对白'); f.ui.advance();
      eq(f.current().stepId, 'puzzle', '继续石刻进入真实机关节点');
      const puzzleEvents: unknown[] = []; f.events.on('encounter:ui-puzzle', payload => puzzleEvents.push(payload));
      for (const [objectId, label] of [['enc_seal_earth', 'earth'], ['enc_seal_water', 'water'], ['enc_seal_wood', 'wood']]) {
        eq(f.named(`encounter-puzzle:${objectId}`).text, t(`enc.hidden_abode.seal_${label}`), '机关按钮沿真表objectNameKeys');
      }
      const puzzleOffer = f.current(), prePuzzleWrites = successfulSaves;
      f.runtime.puzzle({ ...puzzleOffer, objectId: 'enc_seal_earth', mock: true });
      f.runtime.puzzle({ ...puzzleOffer, attemptId: 'stale-attempt', objectId: 'enc_seal_earth' });
      eq(successfulSaves, prePuzzleWrites, 'mock/过期机关输入不推进或保存');
      if (outcome === 'failed') f.named('encounter-puzzle:enc_seal_water').emit('pointerdown', pointer);
      else {
        f.named('encounter-puzzle:enc_seal_earth').emit('pointerdown', pointer);
        same(puzzleEvents[0], { encounterId: f.row.id, stepId: 'puzzle', attemptId: active.attemptId, objectId: 'enc_seal_earth', mock: false }, '机关点击只发带身份的UI表现事件');
        eq(f.current().stepId, 'puzzle', '只按土仍停留机关节点');
        eq(successfulSaves, prePuzzleWrites, '中间机关序列仅内存态，不新增存盘事务');
        f.ui.selectChoice(1); eq(f.current().stepId, 'puzzle', '数字键选择水机关仍等待木');
        f.named('encounter-puzzle:enc_seal_wood').emit('pointerdown', pointer);
        eq(f.current().stepId, 'open_chest', '土水木完整顺序自动走正式onWin');
        eq(f.prog.count('spirit_copper'), 0, '解谜成功未确认宝匣时无分段材料');
        f.advance(); f.advance(); eq(f.current().stepId, 'claim', '宝匣交互与手记对白推进选择');
        f.choose(outcome === 'taken' ? 'take' : 'seal');
      }
    }
    eq(f.prog.encounterSave().encounters?.active, null, `洞府${outcome}清空active`);
    eq(f.prog.encounterSave().encounters?.resolved?.[f.row.id], ['taken', 'sealed'].includes(outcome) ? outcome : undefined, '只有有效洞府结局消耗once');
    eq(f.prog.count('spirit_copper'), outcome === 'taken' ? 3 : 0, '洞府灵铜按正式taken结局一次发放');
    eq(f.prog.count('refine_stone'), outcome === 'taken' ? 2 : 0, '洞府精炼石按正式taken结局一次发放');
    eq(f.prog.daoHeart, outcome === 'sealed' ? 22 : 20, '封存道心按正式sealed结局一次兑现');
    eq(f.named('encounter-dialog').text, t(`enc.hidden_abode.${outcome}`), '洞府四结局使用正式文案');
    const afterAbode = successfulSaves; f.runtime.puzzle({ encounterId: f.row.id, attemptId: active.attemptId, stepId: 'puzzle', objectId: 'enc_seal_wood' });
    f.runtime.reveal(active.attemptId); f.runtime.update(16);
    eq(successfulSaves, afterAbode, '洞府结算后旧机关/显形输入不会二次提交');
    eq(f.rolls(), 2, '洞府进出/机关不重新随机'); f.destroy();
  }

  const openPuzzle = (f: ReturnType<typeof entityFixture>) => {
    const active = f.prog.encounterSave().encounters?.active as { attemptId: string };
    f.runtime.reveal(active.attemptId); f.advance(); f.choose('enter'); f.advance();
    eq(f.current().stepId, 'puzzle', 'fixture经真实Runtime进入机关');
  };
  for (const stale of [false, true]) {
    const f = entityFixture('enc_hidden_abode'); openPuzzle(f);
    f.runtime.puzzle({ ...f.current(), objectId: 'enc_seal_earth' });
    f.runtime.puzzle({ ...f.current(), objectId: 'enc_seal_water' });
    const beforeLastSeal = JSON.stringify(f.prog.exportSave()); saveFails = true;
    f.runtime.puzzle({ ...f.current(), objectId: 'enc_seal_wood' });
    eq(JSON.stringify(f.prog.exportSave()), beforeLastSeal, '最后机关确认保存失败完整回滚');
    eq(f.current().stepId, 'puzzle', '最后机关保存失败仍停真实puzzle');
    f.runtime.update(16); eq(f.current().stepId, 'puzzle', '机关待保存不会自行越过节点');
    if (stale) { f.prog.inventory.hp_pill_small = 4; f.prog.hp = 19; }
    saveFails = false; f.runtime.update(16); f.runtime.update(16);
    eq(f.current().stepId, 'open_chest', `最后机关${stale ? '过期草稿' : '普通'}重试保留成功判定`);
    if (stale) {
      eq(f.prog.count('hp_pill_small'), 4, '机关过期重放不覆盖后来库存');
      eq(f.prog.hp, 19, '机关过期重放不覆盖后来气血');
    }
    eq(f.prog.count('spirit_copper'), 0, '机关保存重试仍不给分段奖励');
    const completedWrites = successfulSaves;
    f.runtime.puzzle({ ...f.current(), stepId: 'puzzle', objectId: 'enc_seal_wood' }); f.runtime.update(16);
    eq(successfulSaves, completedWrites, '已重试完成的机关输入不重复提交'); f.destroy();
  }
  const failedPuzzle = entityFixture('enc_hidden_abode'); openPuzzle(failedPuzzle);
  failedPuzzle.runtime.puzzle({ ...failedPuzzle.current(), objectId: 'enc_seal_water' });
  eq(failedPuzzle.prog.encounterSave().encounters?.active, null, '错序按真表onFail提交failed');
  eq(failedPuzzle.prog.encounterSave().encounters?.resolved?.[failedPuzzle.row.id], undefined, '错序failed不消耗once');
  const failedCooldown = (failedPuzzle.prog.encounterSave().encounters?.cooldownUntil as Record<string, number>)[failedPuzzle.row.id];
  failedPuzzle.setNow(failedCooldown - 1); failedPuzzle.runtime.enter('abode-before-cooldown');
  eq(failedPuzzle.prog.encounterSave().encounters?.active, null, '机关失败冷却内新visit不能重遇');
  eq(failedPuzzle.rolls(), 2, '机关失败冷却内不掷随机');
  failedPuzzle.setNow(failedCooldown); failedPuzzle.runtime.enter('abode-after-cooldown');
  ok(failedPuzzle.prog.encounterSave().encounters?.active, '机关失败冷却到期后的新visit仍可重遇once洞府');
  eq(failedPuzzle.runtime.runner.offer(), undefined, '再次抽中洞府仍从隐藏态开始');
  eq(failedPuzzle.rolls(), 4, '仅冷却后新visit再次共享概率与weight'); failedPuzzle.destroy();

  eq(JSON.stringify(ENCOUNTERS), officialBefore, '真实runtime/UI联调后正式配置仍完全未改');
  eq(JSON.stringify(encountersRaw), rawBefore, '真实runtime/UI联调后正式原始五事件仍完全未改');
  console.log(`encounter-ui tests ok: ${assertions} assertions, tip open preamble / disabled fixtures / rendering / real runner runtime / Progress rollback / medicine / insight / entity battle / abode puzzle`);
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
}
