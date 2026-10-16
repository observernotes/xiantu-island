import encountersRaw from '@xt/balance/encounters.json';
import { ENCOUNTERS, ITEMS, NPCS, t } from './data';
import { parseEncountersConfig, type EncountersConfig } from './Encounter';
import { EncounterUi, type EncounterOffer } from './EncounterUi';
import { Progress } from './Progress';
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
const uiNames = ['encounter:offer', 'encounter:step', 'encounter:clear', 'update', 'shutdown'];
const pointer = { button: 0, id: 1, leftButtonDown: () => true };
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));
function configWith(mutate: (raw: typeof encountersRaw) => void): EncountersConfig {
  const raw = clone(encountersRaw); mutate(raw);
  const parsed = parseEncountersConfig(raw); ok(parsed.config, `测试克隆通过配置校验：${parsed.errors.join('; ')}`);
  return parsed.config;
}
function fixture(options: { missingTexture?: boolean; missingAnimation?: boolean; invalidAnimation?: boolean } = {}) {
  const displays: Display[] = [], events = new Events();
  const prog = Object.assign(new Progress(), { encounters: { sentinel: { cooldownUntil: 123, resolved: false } } });
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
  const officialBefore = JSON.stringify(ENCOUNTERS), rawBefore = JSON.stringify(encountersRaw);
  const f = fixture(), before = JSON.stringify(f.prog.exportSave());
  eq(f.controls().length, 0, '无 offer 时 0 个可见奇遇 UI 控件');
  for (const name of uiNames) eq(f.events.listenerCount(name), 1, `订阅 ${name}`);
  for (const encounter of ENCOUNTERS.encounters) {
    eq(encounter.enabled, false, `${encounter.id} 正式表保持 disabled`);
    f.ui.showOffer({ encounterId: encounter.id, x: 80, y: 120 });
    eq(f.controls().length, 0, `${encounter.id} 关态不显示任何控件`);
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
      karma: [{ flag: 'enc_wanderer_aided', value: true }, { flag: 'enc_wanderer_rescued', value: false }],
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
    t('encounter.ui.hook_karma', { flag: t('karma.flag.enc_wanderer_rescued'), value: t('encounter.ui.flag_off') }),
    t('encounter.ui.hook_affinity', { npc: NPCS.enc_wanderer?.name ?? 'enc_wanderer', n: '+2' }),
    t('encounter.ui.hook_once'),
  ]) ok(fullPreview.includes(expected), `rewards / hooks 按配置另列：${expected}`);
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
  f.ui.showOffer({ encounterId: id, stepId: 'decide', x: 80, y: 120 });
  eq(f.controls().length, 0, 'mock 切回正式关态立即全隐藏');

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
  console.log(`encounter-ui tests ok: ${assertions} assertions, disabled hidden / mock visible / choice read-only / shutdown cleaned`);
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else delete (globalThis as { localStorage?: Storage }).localStorage;
}
