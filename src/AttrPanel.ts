import Phaser from 'phaser';
import { t } from './data';
import type { Progress } from './Progress';
import { HUD_FONT, INK, INK_60, PAPER, RED, sliced, hudSpec } from './hud';

type Rect = [number, number, number, number];
type AllocationResult = ReturnType<Progress['applyAllocate']>;
export interface AttrRow {
  key: string; name: string; allocated: number; value: number; draft: number; next: number;
}
export interface AttrPending { delta: Record<string, number>; total: number }

const NAMES: Record<string, string> = { rootBone: '根骨', agility: '身法', spirit: '神识', insight: '悟性' };
const C = { ink: 0x3b2a20, paper: 0xfaf2dc, paper2: 0xece0c4, wood: 0x966a42, sky: 0x4096dc, skyFill: 0xd7eeff, greyBtn: 0xb8afa4 };

/** 新文案暂用中文兜底，已有四维名称沿用 ui.rootBone/agility/spirit/insight。 */
function label(key: string, fallback: string, vars: Record<string, string | number> = {}) {
  const value = t(key, vars);
  if (value !== key) return value;
  return fallback.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}

/** UI-6 加点窗：加减只改本地 delta；二次确认后一次交由 Progress 校验、扣点和保存。 */
export class AttrPanel {
  private c?: Phaser.GameObjects.Container;
  private shown = false;
  private draft: Record<string, number> = {};
  private selected = 0;
  private openedAt = 0;
  pending: AttrPending | null = null;
  status = '';
  statusOk = true;
  artUsed: Record<string, 'art' | 'code'> = {};
  position = { x: 0, y: 0, width: 600, height: 420 };

  constructor(private scene: Phaser.Scene, private prog: Progress, private onChanged: () => void = () => {}) {
    const kb = scene.input.keyboard;
    kb?.on('keydown', this.onKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.close(); kb?.off('keydown', this.onKey, this);
    });
    this.resetDraft();
  }

  isOpen() { return this.shown; }
  open() {
    this.resetDraft(); this.pending = null; this.status = ''; this.statusOk = true; this.selected = 0;
    this.shown = true; this.openedAt = this.scene.time.now; this.render();
  }
  close() { this.shown = false; this.pending = null; this.resetDraft(); this.clear(); }
  toggle() { if (this.shown) this.close(); else this.open(); }
  update() {}

  /** 只接受四维整数草稿增减；已确认分配始终由 Progress 管理。 */
  adjust(key: string, amount: number) {
    if (!this.shown || this.pending || !this.prog.statKeys().some(statKey => statKey === key) || !Number.isSafeInteger(amount)) return false;
    const next = { ...this.draft, [key]: (this.draft[key] ?? 0) + amount };
    if (!this.prog.checkAllocate(next).ok) return false;
    this.draft = next; this.status = ''; this.statusOk = true; this.render();
    return true;
  }
  check() {
    const result = this.prog.checkAllocate(this.draft);
    if (!result.ok) return { ok: false, reason: result.reason, message: this.reason(result.reason) };
    if (!this.total()) return { ok: false, reason: 'empty', message: label('ui.attr.empty', '请先选择要分配的属性点。') };
    return { ok: true, reason: '', message: '' };
  }
  requestConfirm() {
    if (!this.shown || !this.check().ok) return null;
    this.pending = { delta: { ...this.draft }, total: this.total() };
    this.status = ''; this.render();
    return this.pending;
  }
  /** 确认失败保留草稿；Progress 负责保证余额和存档原子性。 */
  confirm(): AllocationResult | null {
    if (!this.shown || !this.pending) return null;
    const result = this.prog.applyAllocate(this.pending.delta);
    this.pending = null;
    this.statusOk = result.ok;
    if (result.ok) {
      this.resetDraft(); this.status = label('ui.attr.success', '加点完成。'); this.onChanged();
    } else this.status = this.reason(result.reason);
    this.render();
    return result;
  }
  commit() { return this.confirm(); }
  cancelConfirm() { this.pending = null; this.render(); }
  /** 取消待分配草稿，已确认属性保持原值。 */
  cancel() { this.pending = null; this.resetDraft(); this.status = ''; this.statusOk = true; this.render(); }
  snapshot() {
    return { open: this.shown, unspent: this.prog.unspentStatPoints, remaining: this.remaining(), rows: this.rows(),
      draft: { ...this.draft }, pending: this.pending ? { delta: { ...this.pending.delta }, total: this.pending.total } : null,
      check: this.check(), status: this.status, statusOk: this.statusOk, artUsed: { ...this.artUsed }, position: { ...this.position } };
  }

  private resetDraft() { this.draft = Object.fromEntries(this.prog.statKeys().map(key => [key, 0])); }
  private total() { return Object.values(this.draft).reduce((sum, n) => sum + n, 0); }
  private remaining() { return Math.max(0, this.prog.unspentStatPoints - this.total()); }
  private rows(): AttrRow[] {
    return this.prog.statKeys().map(key => {
      const value = this.prog.stat(key), draft = this.draft[key] ?? 0;
      return { key, name: label(`ui.${key}`, NAMES[key] ?? key), allocated: this.prog.allocatedStat(key), value, draft, next: value + draft };
    });
  }
  private reason(reason: string) {
    if (reason === 'overspend') return label('ui.attr.overspend', '可分配点不足，请调整后再确认。');
    if (reason === 'save') return label('ui.attr.save_failed', '存档未成功，属性点已保留，请重试。');
    return label('ui.attr.invalid', '分配无效，请重新调整。');
  }
  private onKey(event: KeyboardEvent) {
    if (!this.shown || this.scene.time.now - this.openedAt < 120 || event.repeat) return;
    if (event.key === 'Escape') this.close();
    else if (event.key === 'Enter' || event.key === 'z' || event.key === 'Z') {
      if (this.pending) this.confirm(); else this.requestConfirm();
    } else if (event.key === 'ArrowUp' || event.key === 'ArrowDown') {
      if (!this.pending) {
        this.selected = Phaser.Math.Clamp(this.selected + (event.key === 'ArrowUp' ? -1 : 1), 0, this.prog.statKeys().length - 1);
        this.render();
      }
    } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
      const key = this.prog.statKeys()[this.selected];
      if (key) this.adjust(key, event.key === 'ArrowLeft' ? -1 : 1);
    } else return;
    event.preventDefault();
  }

  private clear() { this.c?.destroy(); this.c = undefined; }
  private add<T extends Phaser.GameObjects.GameObject>(o: T): T {
    (o as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(o); return o;
  }
  private text(x: number, y: number, text: string, size = 14, color = INK, bold = false) {
    return this.add(this.scene.add.text(x, y, text, { fontFamily: HUD_FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }));
  }
  /** 与商店共用已由 preloadHud/preloadAlchemy 按 optionalAssets 加载的精修件。 */
  private box(key: string, rect: Rect, fill: number, stroke: number, radius = 6, strokeWidth = 1, alpha = 1) {
    const art = sliced(this.scene, key, ...rect);
    this.artUsed[key] = art ? 'art' : 'code';
    if (art) return this.add(art);
    const [x, y, w, h] = rect, g = this.add(this.scene.add.graphics());
    g.fillStyle(fill, alpha).fillRoundedRect(x, y, w, h, radius);
    g.lineStyle(strokeWidth, stroke, 1).strokeRoundedRect(x + strokeWidth / 2, y + strokeWidth / 2, w - strokeWidth, h - strokeWidth, radius);
    return g;
  }
  private zone(rect: Rect, run: () => void) {
    const [x, y, w, h] = rect;
    return this.add(this.scene.add.zone(x, y, w, h).setOrigin(0, 0)).setInteractive({ useHandCursor: true }).on('pointerdown', run);
  }
  private button(rect: Rect, text: string, enabled: boolean, run: () => void, name: string) {
    const [x, y, w, h] = rect;
    const bg = this.box(enabled ? 'ui_alchemy_btn_normal' : 'ui_alchemy_btn_disabled', rect, enabled ? C.wood : C.greyBtn, C.ink);
    this.text(x + w / 2, y + h / 2, text, 14, enabled ? PAPER : '#F2EEE8', true).setOrigin(0.5).setStroke(INK, enabled ? 2 : 0);
    if (!enabled) return;
    const hit = this.zone(rect, run).setName(name);
    if (bg instanceof Phaser.GameObjects.NineSlice || bg instanceof Phaser.GameObjects.Image) {
      hit.on('pointerover', () => this.scene.textures.exists('ui_alchemy_btn_hover') && bg.setTexture('ui_alchemy_btn_hover'));
      hit.on('pointerout', () => bg.setTexture('ui_alchemy_btn_normal'));
    }
  }
  private render() {
    if (!this.shown) return;
    this.clear(); this.artUsed = {};
    const { width: W, height: H } = this.position;
    this.position.x = Math.round((this.scene.scale.width - W) / 2);
    this.position.y = Math.round((this.scene.scale.height - H) / 2);
    this.c = this.scene.add.container(this.position.x, this.position.y).setDepth(234).setScrollFactor(0).setName('attr-panel');
    this.add(this.scene.add.zone(-this.position.x, -this.position.y, this.scene.scale.width, this.scene.scale.height).setOrigin(0, 0).setInteractive());
    this.box('ui_bestiary_window', [0, 0, W, H], C.paper, C.wood, 8, 2, 0.97);
    const [tw, th] = hudSpec(this.scene, 'ui_bestiary_title')?.size ?? [160, 28];
    this.box('ui_bestiary_title', [(W - tw) / 2, -12, tw, th], C.paper2, C.ink);
    this.text(W / 2, -12 + th / 2, label('ui.attr.title', '加点'), 18, INK, true).setOrigin(0.5).setName('attr-title');
    this.closeButton(W);
    this.text(24, 42, label('ui.attr.remaining', '剩余点数：{n}', { n: this.remaining() }), 16, INK, true).setOrigin(0, 0.5).setName('attr-unspent');
    this.text(W - 24, 42, label('ui.attr.planned', '待分配：{n}', { n: this.total() }), 14, INK_60).setOrigin(1, 0.5);
    this.box('ui_bestiary_inset', [16, 68, W - 32, 236], C.paper2, C.ink, 6, 1, 0.6);
    this.text(36, 86, label('ui.attr.attribute', '属性'), 12, INK_60).setOrigin(0, 0.5);
    this.text(218, 86, label('ui.attr.current', '当前值'), 12, INK_60).setOrigin(0.5);
    this.text(439, 86, label('ui.attr.draft', '待分配'), 12, INK_60).setOrigin(0.5);
    this.rows().forEach((row, i) => this.row(row, i));
    this.text(28, 290, label('ui.attr.value_hint', '当前值含功法加成；减号仅撤回待分配点数。'), 12, INK_60).setOrigin(0, 0.5);
    if (this.pending) {
      this.text(28, 324, label('ui.attr.confirm_hint', '确认分配 {n} 点？再点确认后生效。', { n: this.pending.total }), 14, INK, true)
        .setWordWrapWidth(W - 56).setName('attr-confirm-text');
    } else if (this.status) {
      this.text(28, 324, this.status, 14, this.statusOk ? '#2E7D32' : RED, true).setWordWrapWidth(W - 56).setName('attr-status');
    } else this.text(28, 324, this.check().message || label('ui.attr.ready', '调整完毕后，点击确认提交。'), 14, INK_60).setWordWrapWidth(W - 56);
    this.button([W - 256, 354, 108, 32], label('ui.attr.cancel', '取消'), !!this.pending || this.total() > 0,
      () => { if (this.pending) this.cancelConfirm(); else this.cancel(); }, 'attr-cancel');
    this.button([W - 136, 354, 108, 32], label('ui.attr.confirm', '确认'), this.check().ok,
      () => { if (this.pending) this.confirm(); else this.requestConfirm(); }, this.pending ? 'attr-commit' : 'attr-confirm');
    this.text(28, H - 18, label('ui.attr.keys', '↑↓ 选择  ←→ 加减  回车 确认  Esc / P 关闭'), 12, INK_60).setOrigin(0, 0.5);
  }
  private row(row: AttrRow, index: number) {
    const y = 102 + index * 44, selected = this.selected === index;
    this.box(selected ? 'ui_alchemy_list_row_selected' : 'ui_alchemy_list_row_normal', [24, y, 552, 38], selected ? C.skyFill : C.paper, selected ? C.sky : C.ink, 5);
    this.text(36, y + 19, row.name, 16, INK, true).setOrigin(0, 0.5);
    this.text(218, y + 19, row.draft ? `${row.value} → ${row.next}` : String(row.value), 16, INK, true).setOrigin(0.5).setName(`attr-${row.key}-value`);
    this.button([370, y + 4, 32, 30], '−', !this.pending && row.draft > 0, () => this.adjust(row.key, -1), `attr-${row.key}-minus`);
    this.text(439, y + 19, `+${row.draft}`, 16, row.draft ? '#2B4C7E' : INK_60, true).setOrigin(0.5).setName(`attr-${row.key}-draft`);
    this.button([476, y + 4, 32, 30], '＋', !this.pending && this.remaining() > 0, () => this.adjust(row.key, 1), `attr-${row.key}-plus`);
  }
  private closeButton(width: number) {
    if (this.scene.textures.exists('ui_bestiary_btn_close')) {
      this.artUsed.ui_bestiary_btn_close = 'art';
      const close = this.add(this.scene.add.image(width - 26, 6, 'ui_bestiary_btn_close').setOrigin(0, 0)).setName('attr-close');
      close.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close())
        .on('pointerover', () => this.scene.textures.exists('ui_bestiary_btn_close_hover') && close.setTexture('ui_bestiary_btn_close_hover'))
        .on('pointerout', () => close.setTexture('ui_bestiary_btn_close'));
      return;
    }
    this.artUsed.ui_bestiary_btn_close = 'code';
    const g = this.add(this.scene.add.graphics());
    g.fillStyle(C.paper2, 1).fillRoundedRect(width - 26, 6, 20, 20, 4).lineStyle(1, C.ink).strokeRoundedRect(width - 26, 6, 20, 20, 4);
    this.text(width - 16, 16, '×', 14, INK, true).setOrigin(0.5);
    this.zone([width - 26, 6, 20, 20], () => this.close()).setName('attr-close');
  }
}
