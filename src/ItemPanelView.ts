import Phaser from 'phaser';
import { ITEMS, t } from './data';
import { HUD_FONT, INK, PAPER, RED, hudSpec, sliced } from './hud';
import type { EquipResult, Progress } from './Progress';

export type Rect = [number, number, number, number];
export function label(key: string, fallback: string, vars: Record<string, string | number> = {}) {
  const value = t(key, vars);
  return value !== key ? value : fallback.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? ''));
}
export function equipReason(result: EquipResult) {
  if (result.ok) return '';
  const reasons = { invalid: '这件物品不能穿戴。', missing: '背包中没有这件装备。', sect: '宗门不符，无法穿戴。',
    level: '等级不足，无法穿戴。', empty: '此栏位没有装备。', overflow: '背包数量已达上限。', save: '存档未成功，穿脱已撤回，请重试。' };
  return label(`ui.equip.reason_${result.reason}`, reasons[result.reason]);
}

/** 背包与装备共用的轻量窗体绘制；切片只经过 hudSpec/sliced，缺件逐项回退。 */
export abstract class ItemPanelView {
  protected c?: Phaser.GameObjects.Container;
  protected shown = false;
  protected openedAt = 0;
  status = '';
  statusOk = true;
  artUsed: Record<string, 'art' | 'code'> = {};
  position: { x: number; y: number; width: number; height: number };

  constructor(protected scene: Phaser.Scene, protected prog: Progress, width: number, height: number) {
    this.position = { x: 0, y: 0, width, height };
    const kb = scene.input.keyboard;
    kb?.on('keydown', this.handleKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { this.close(); kb?.off('keydown', this.handleKey, this); });
  }
  isOpen() { return this.shown; }
  open() { this.shown = true; this.openedAt = this.scene.time.now; this.status = ''; this.statusOk = true; this.render(); }
  close() { this.shown = false; this.c?.destroy(); this.c = undefined; }
  toggle() { if (this.shown) this.close(); else this.open(); }
  abstract update(): void;
  protected abstract render(): void;
  protected abstract onKey(event: KeyboardEvent): boolean;
  private handleKey(event: KeyboardEvent) {
    if (!this.shown || event.repeat || this.scene.time.now - this.openedAt < 120) return;
    if (event.key === 'Escape') { this.close(); event.preventDefault(); }
    else if (this.onKey(event)) event.preventDefault();
  }
  protected add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    (object as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(object); return object;
  }
  protected text(x: number, y: number, value: string, size = 12, color = INK, bold = false) {
    return this.add(this.scene.add.text(x, y, value, { fontFamily: HUD_FONT, fontSize: `${size}px`, color, fontStyle: bold ? 'bold' : 'normal' }));
  }
  protected box(key: string, rect: Rect, fill = 0xece0c4) {
    const art = sliced(this.scene, key, ...rect);
    this.artUsed[key] = art ? 'art' : 'code';
    if (art) return this.add(art);
    const [x, y, w, h] = rect, g = this.add(this.scene.add.graphics());
    g.fillStyle(fill, 0.98).fillRoundedRect(x, y, w, h, 6);
    const stroke = key === 'ui_bestiary_window' ? 2 : 1;
    g.lineStyle(stroke, key === 'ui_bestiary_window' ? 0x966a42 : 0x3b2a20)
      .strokeRoundedRect(x + stroke / 2, y + stroke / 2, w - stroke, h - stroke, 6);
    return g;
  }
  protected zone(rect: Rect, run: () => void, name: string) {
    const [x, y, w, h] = rect;
    return this.add(this.scene.add.zone(x, y, w, h).setOrigin(0)).setName(name)
      .setInteractive({ useHandCursor: true }).on('pointerdown', run);
  }
  protected button(rect: Rect, value: string, enabled: boolean, run: () => void, name: string) {
    const [x, y, w, h] = rect;
    this.box(enabled ? 'ui_alchemy_btn_normal' : 'ui_alchemy_btn_disabled', rect, enabled ? 0x966a42 : 0xb8afa4);
    this.text(x + w / 2, y + h / 2, value, 12, PAPER, true).setOrigin(0.5).setStroke(INK, 1);
    if (enabled) this.zone(rect, run, name);
  }
  protected outline(rect: Rect) {
    const [x, y, w, h] = rect;
    this.add(this.scene.add.graphics()).lineStyle(1, 0x4096dc).strokeRect(x + 0.5, y + 0.5, w - 1, h - 1);
  }
  protected item(id: string, x: number, y: number) {
    const icon = ITEMS[id]?.icon;
    const exists = !!icon && this.scene.textures.exists('icons_items') && this.scene.textures.get('icons_items').has(icon);
    this.artUsed[`item:${id}`] = exists ? 'art' : 'code';
    if (exists) this.add(this.scene.add.image(x, y, 'icons_items', icon).setOrigin(0).setDisplaySize(32, 32));
    else this.text(x + 16, y + 16, (ITEMS[id]?.name ?? id).slice(0, 2), 12, INK, true).setOrigin(0.5);
  }
  protected shell(name: string, title: string) {
    this.c?.destroy(); this.artUsed = {};
    const { width: w, height: h } = this.position;
    this.position.x = Math.round((this.scene.scale.width - w) / 2);
    this.position.y = Math.round((this.scene.scale.height - h) / 2);
    this.c = this.scene.add.container(this.position.x, this.position.y).setDepth(234).setScrollFactor(0).setName(`${name}-panel`);
    this.add(this.scene.add.zone(-this.position.x, -this.position.y, this.scene.scale.width, this.scene.scale.height).setOrigin(0).setInteractive());
    this.box('ui_bestiary_window', [0, 0, w, h], 0xfaf2dc);
    const [tw, th] = hudSpec(this.scene, 'ui_bestiary_title')?.size ?? [160, 28];
    this.box('ui_bestiary_title', [(w - tw) / 2, -12, tw, th]);
    this.text(w / 2, -12 + th / 2, title, 18, INK, true).setOrigin(0.5);
    const key = 'ui_bestiary_btn_close';
    if (this.scene.textures.exists(key)) {
      this.artUsed[key] = 'art';
      const close = this.add(this.scene.add.image(w - 26, 6, key).setOrigin(0)).setName(`${name}-close`);
      close.setInteractive({ useHandCursor: true }).on('pointerdown', () => this.close())
        .on('pointerover', () => this.scene.textures.exists(`${key}_hover`) && close.setTexture(`${key}_hover`))
        .on('pointerout', () => close.setTexture(key));
    } else {
      this.artUsed[key] = 'code';
      this.add(this.scene.add.graphics()).fillStyle(0xece0c4).fillRoundedRect(w - 26, 6, 20, 20, 4)
        .lineStyle(1, 0x3b2a20).strokeRoundedRect(w - 26, 6, 20, 20, 4);
      this.text(w - 16, 16, '×', 14, INK, true).setOrigin(0.5);
      this.zone([w - 26, 6, 20, 20], () => this.close(), `${name}-close`);
    }
  }
  protected statusLine(y: number, fallback: string) {
    this.text(22, y, this.status || fallback, 12, this.status ? this.statusOk ? '#2E7D32' : RED : INK)
      .setWordWrapWidth(this.position.width - 44);
  }
}
