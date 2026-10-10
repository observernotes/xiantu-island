import Phaser from 'phaser';
import { ITEMS, RECIPES, t, type RecipeDef } from './data';
import type { Progress } from './Progress';
import { AlchemySystem, firePointer, type AlchemyResult } from './Alchemy';
import { HUD_FONT, INK, INK_60, PAPER, RED, sliced, hudSpec, setSlicedWidth } from './hud';

const DIR = 'art/icons/ui/alchemy';
const IMAGES = [
  'ui_alchemy_furnace_bronze_furnace', 'ui_alchemy_furnace_purple_copper_furnace', 'ui_alchemy_furnace_dark_iron_furnace',
  'ui_alchemy_glow_gold', 'ui_alchemy_smoke_white', 'ui_alchemy_smoke_black', 'ui_alchemy_slot',
  'ui_alchemy_slot_ok', 'ui_alchemy_slot_lack', 'ui_alchemy_slot_empty', 'icon_alchemy_ok', 'icon_alchemy_lack',
  'ui_alchemy_list_row_normal', 'ui_alchemy_list_row_selected', 'ui_alchemy_list_row_disabled',
  'ui_alchemy_btn_normal', 'ui_alchemy_btn_hover', 'ui_alchemy_btn_pressed', 'ui_alchemy_btn_disabled',
  'ui_alchemy_fire_gauge', 'ui_alchemy_fire_track', 'ui_alchemy_fire_zone', 'ui_alchemy_fire_perfect', 'ui_alchemy_fire_pointer',
  'ui_alchemy_stamp_success', 'ui_alchemy_stamp_fail', 'ui_alchemy_quality_low', 'ui_alchemy_quality_mid',
  'ui_alchemy_quality_high', 'ui_alchemy_quality_supreme', 'ui_alchemy_exp_fill',
];

/** 公共窗体、切片表由 preloadHud 加载；炉火按自身 JSONHash 图集与 meta.anim 接入。 */
export function preloadAlchemy(scene: Phaser.Scene) {
  for (const key of IMAGES) scene.load.image(key, `${DIR}/${key}.png`);
  scene.load.atlas('ui_alchemy_fire', `${DIR}/ui_alchemy_fire.png`, `${DIR}/ui_alchemy_fire.json`);
  scene.load.json('alchemy_fire_meta', `${DIR}/ui_alchemy_fire.json`);
  for (const icon of new Set(Object.values(RECIPES).filter(r => !r.type).map(r => ITEMS[r.output]?.icon).filter(Boolean)))
    scene.load.image(`${icon}@64`, `art/icons/items/${icon}@64.png`);
}

export function registerAlchemy(scene: Phaser.Scene) {
  const atlas = scene.cache.json.get('alchemy_fire_meta');
  const anim = atlas?.meta?.anim;
  if (!anim || scene.anims.exists(anim.key)) return;
  scene.anims.create({ key: anim.key, frames: Object.keys(atlas.frames).map(frame => ({ key: 'ui_alchemy_fire', frame })),
    frameRate: anim.frameRate, repeat: anim.repeat });
}

type Rect = [number, number, number, number];
type Point = [number, number];
type Drawable = Phaser.GameObjects.Image | Phaser.GameObjects.NineSlice;

/** 丹方详情与一次机会的火候操作。所有扣料、判定、背包和任务计数交给 AlchemySystem。 */
export class AlchemyPanel {
  private c?: Phaser.GameObjects.Container;
  private selected = '';
  private furnaceId = 'bronze_furnace';
  private pointer?: Phaser.GameObjects.Image;
  private pointerTrack?: { x: number; w: number };
  private status = '';
  private shown = false;
  lastResult: AlchemyResult | null = null;
  pointerRatio = 0;
  position = { x: 0, y: 0, width: 640, height: 400 };

  constructor(private scene: Phaser.Scene, private prog: Progress, readonly system: AlchemySystem, private onChanged: () => void = () => {}) {
    scene.input.keyboard?.on('keydown-SPACE', this.onSpace, this);
    scene.input.keyboard?.on('keydown-ESC', this.onEscape, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.close();
      scene.input.keyboard?.off('keydown-SPACE', this.onSpace, this);
      scene.input.keyboard?.off('keydown-ESC', this.onEscape, this);
    });
  }

  isOpen() { return this.shown; }
  open(furnaceId = 'bronze_furnace') {
    this.furnaceId = this.system.active?.furnaceId ?? furnaceId;
    this.shown = true;
    this.status = '';
    if (!this.system.knownRecipes.some(r => r.id === this.selected)) this.selected = this.system.knownRecipes[0]?.id ?? '';
    this.render();
  }
  close() {
    if (this.system.active) {
      this.lastResult = this.system.skipFire();
      this.onChanged();
    }
    this.shown = false;
    this.clear();
    this.pointer = undefined; this.pointerTrack = undefined;
  }
  selectRecipe(id: string) {
    if (this.system.active || !this.system.knownRecipes.some(r => r.id === id)) return;
    this.selected = id; this.status = ''; this.lastResult = null; this.render();
  }
  update(delta: number) {
    if (!this.shown || !this.system.active) return;
    const result = this.system.advanceFire(delta);
    if (result) { this.finish(result); return; }
    this.movePointer();
  }
  stopFire() { const result = this.system.stopFire(); if (result) this.finish(result); return result; }
  skipFire() { const result = this.system.skipFire(); if (result) this.finish(result); return result; }

  private onSpace(event: KeyboardEvent) {
    if (!this.shown || !this.system.active || event.repeat) return;
    event.preventDefault(); this.stopFire();
  }
  private onEscape(event: KeyboardEvent) { if (this.shown) { event.preventDefault(); this.close(); } }
  private get layout() { return this.scene.cache.json.get('alchemy_ui'); }
  private add<T extends Phaser.GameObjects.GameObject>(o: T): T { this.c!.add(o); return o; }
  private text(x: number, y: number, text: string, size = 12, color = INK) {
    return this.add(this.scene.add.text(x, y, text, { fontFamily: HUD_FONT, fontSize: `${size}px`, color }));
  }
  private art(key: string, rect: Rect): Drawable | undefined {
    const o = sliced(this.scene, key, ...rect);
    if (o) return this.add(o);
    return undefined;
  }
  private image(key: string, x: number, y: number, width?: number, height?: number) {
    if (!this.scene.textures.exists(key)) return undefined;
    const o = this.add(this.scene.add.image(x, y, key).setOrigin(0, 0));
    if (width !== undefined && height !== undefined) o.setDisplaySize(width, height);
    return o;
  }
  private item(id: string, x: number, y: number, size: number) {
    const key = id === 'spirit_stone' ? 'icon_spirit_stone' : ITEMS[id]?.icon;
    if (key && size > 32 && this.scene.textures.exists(`${key}@64`)) return this.image(`${key}@64`, x, y, size, size);
    if (key && this.scene.textures.exists('icons_items') && this.scene.textures.get('icons_items').has(key))
      return this.add(this.scene.add.image(x, y, 'icons_items', key).setOrigin(0, 0).setDisplaySize(size, size));
    return undefined;
  }
  private button(rect: Rect, label: string, enabled: boolean, run: () => void) {
    const [x, y, w, h] = rect;
    const bg = this.art(enabled ? 'ui_alchemy_btn_normal' : 'ui_alchemy_btn_disabled', rect);
    this.text(x + w / 2, y + h / 2, label, 14, enabled ? PAPER : '#D0C7BA').setOrigin(0.5);
    const hit = this.add(this.scene.add.zone(x, y, w, h).setOrigin(0, 0));
    if (!enabled) return;
    hit.setInteractive({ useHandCursor: true });
    hit.on('pointerover', () => bg?.setTexture('ui_alchemy_btn_hover'));
    hit.on('pointerout', () => bg?.setTexture('ui_alchemy_btn_normal'));
    hit.on('pointerdown', () => { bg?.setTexture('ui_alchemy_btn_pressed'); run(); });
  }
  private error(reason?: string) {
    this.status = ({ materials: '材料不足', fuel: '灵石不足', furnace: '丹炉不可用', unlearned: '尚未学会这张丹方', unknown: '丹方不存在', busy: '请先完成这一炉' } as Record<string, string>)[reason ?? ''] ?? '暂时无法炼制';
    this.render();
  }
  private brew() {
    const started = this.system.start(this.selected, this.furnaceId);
    if (!started.ok) { this.error(started.reason); return; }
    this.status = ''; this.lastResult = null; this.onChanged(); this.render(); this.movePointer();
  }
  private batch() {
    const result = this.system.batch(this.selected, 5, this.furnaceId);
    if (!result.ok) { this.error(result.reason); return; }
    const successes = result.results.filter(r => r.success).length;
    this.lastResult = result.results[result.results.length - 1] ?? null;
    this.status = `五炉炼制：成丹 ${successes} 炉，产出 ${result.results.reduce((n, r) => n + r.count, 0)} 颗`;
    this.onChanged(); this.render();
    if (this.lastResult) this.effects(this.lastResult);
  }
  private finish(result: AlchemyResult) {
    this.lastResult = result;
    this.status = result.success ? t('alchemy.success', { quality: t(`alchemy.quality.${result.quality}`) }) + ` ×${result.count}` : t('alchemy.fail');
    this.onChanged(); this.render(); this.effects(result);
  }
  private clear() {
    for (const child of this.c?.list ?? []) this.scene.tweens.killTweensOf(child);
    this.c?.destroy(); this.c = undefined;
  }
  private render() {
    if (!this.shown) return;
    this.clear(); this.pointer = undefined; this.pointerTrack = undefined;
    const L = this.layout, [width, height] = L.window.size as Point;
    this.position = { x: (this.scene.scale.width - width) / 2, y: (this.scene.scale.height - height) / 2, width, height };
    this.c = this.scene.add.container(this.position.x, this.position.y).setDepth(230).setScrollFactor(0);
    this.add(this.scene.add.zone(-this.position.x, -this.position.y, this.scene.scale.width, this.scene.scale.height).setOrigin(0, 0).setInteractive());
    this.art('ui_bestiary_window', [0, 0, width, height]);
    const titleSpec = hudSpec(this.scene, 'ui_bestiary_title');
    const [tw, th] = titleSpec?.size ?? [160, 28];
    this.art('ui_bestiary_title', [(width - tw) / 2, -12, tw, th]);
    this.text(width / 2, -12 + th / 2, t('alchemy.title'), 18).setOrigin(0.5);
    const [cx, cy] = L.window.close as Point;
    const close = this.image('ui_bestiary_btn_close', cx, cy)!;
    close.setInteractive({ useHandCursor: true }).on('pointerover', () => close.setTexture('ui_bestiary_btn_close_hover'))
      .on('pointerout', () => close.setTexture('ui_bestiary_btn_close')).on('pointerdown', () => this.close());
    this.text(...L.levelBar.text as Point, t('alchemy.level', { n: this.prog.alchemyLevel }), 14).setOrigin(0, 0.5);
    const [ex, ey, ew, eh] = L.levelBar.frameRect as Rect;
    this.art('ui_bar_cultivation_frame', [ex, ey, ew, eh]);
    const frameSpec = hudSpec(this.scene, 'ui_bar_cultivation_frame')!;
    const [ix, iy, iw, ih] = frameSpec.innerRect!;
    const fillWidth = ew - (frameSpec.size![0] - iw);
    const fill = this.art('ui_alchemy_exp_fill', [ex + ix, ey + iy, fillWidth, ih]);
    const capped = !Number.isFinite(this.prog.alchemyExpNeed);
    if (fill) setSlicedWidth(this.scene, fill, 'ui_alchemy_exp_fill', fillWidth * (capped ? 1 : this.prog.alchemyExp / this.prog.alchemyExpNeed));
    this.text(ex + ew / 2, ey + eh / 2, capped ? '已满级' : `${this.prog.alchemyExp}/${this.prog.alchemyExpNeed}`, 12, PAPER).setOrigin(0.5).setStroke(INK, 2);
    this.art('ui_bestiary_inset', L.recipeList.panel);
    this.art('ui_bestiary_inset', L.detail.panel);
    const recipes = this.system.knownRecipes;
    if (!recipes.length) {
      const [px, py] = L.recipeList.panel as Rect;
      this.text(px + 12, py + 12, '尚未学会丹方\n请向孙郎中请教', 12, INK_60).setLineSpacing(8);
      return;
    }
    recipes.forEach((recipe, index) => this.row(recipe, index));
    const recipe = recipes.find(r => r.id === this.selected) ?? recipes[0];
    this.selected = recipe.id;
    this.details(recipe);
  }
  private row(recipe: RecipeDef, index: number) {
    const L = this.layout.recipeList, [x, y, w, h] = L.row as Rect;
    const ry = y + index * (h + L.rowGap);
    const check = this.system.check(recipe.id, 1, this.furnaceId);
    const enough = check.materials.every(material => material.have >= material.need) && check.fuelHave >= check.fuelNeed;
    this.art(!enough ? 'ui_alchemy_list_row_disabled' : this.selected === recipe.id ? 'ui_alchemy_list_row_selected' : 'ui_alchemy_list_row_normal', [x, ry, w, h]);
    this.item(recipe.output, x + 10, ry + 3, 20);
    this.text(x + 36, ry + h / 2, recipe.name, 12, enough ? INK : '#8E867C').setOrigin(0, 0.5);
    if (!enough) this.text(x + w - 38, ry + h / 2, t('alchemy.lack'), 12, RED).setOrigin(0.5);
    this.image(enough ? 'icon_alchemy_ok' : 'icon_alchemy_lack', x + w - 18, ry + 6, 14, 14);
    this.add(this.scene.add.zone(x, ry, w, h).setOrigin(0, 0).setInteractive({ useHandCursor: true }))
      .on('pointerdown', () => this.selectRecipe(recipe.id));
  }
  private details(recipe: RecipeDef) {
    const D = this.layout.detail;
    const busy = !!this.system.active;
    const check = this.system.check(recipe.id, 1, this.furnaceId);
    const [ox, oy] = D.output['icon@64'] as Point;
    this.item(recipe.output, ox, oy, 64);
    this.text(...D.output.name as Point, `${recipe.name} ×${recipe.outputCount}`, 14);
    const [nx, ny] = D.output.name as Point;
    this.text(nx, ny + 38, `丹方等级 ${recipe.recipeLevel ?? 1}`, 12, INK_60);
    if (this.lastResult?.quality) {
      const quality = this.lastResult.quality, [qx, qy] = D.output.qualityTag as Point;
      this.image(`ui_alchemy_quality_${quality}`, qx, qy);
      const spec = hudSpec(this.scene, `ui_alchemy_quality_${quality}`)!;
      this.text(qx + spec.size![0] / 2 - 3, qy + spec.size![1] / 2, t(`alchemy.quality.${quality}`), 12, PAPER).setOrigin(0.5);
    }
    this.art(`ui_alchemy_furnace_${this.furnaceId}`, D.furnace.rect)?.setName('alchemy_furnace');
    if (busy && this.scene.anims.exists('ui_alchemy_fire')) {
      const [fx, fy] = D.furnace.rect as Rect;
      this.add(this.scene.add.sprite(fx + 32, fy + 82, 'ui_alchemy_fire').setOrigin(0, 0).play('ui_alchemy_fire'));
    }
    const [mx, my] = D.materials.first as Point;
    this.text(mx, my - 16, '材料', 12, INK_60);
    recipe.materials.forEach((material, i) => {
      const x = mx + i * D.materials.gap, have = this.prog.count(material.item), ok = have >= material.count;
      const slot = this.image(ok ? 'ui_alchemy_slot_ok' : 'ui_alchemy_slot_lack', x, my);
      this.item(material.item, x + 4, my + 4, 32);
      this.image(ok ? 'icon_alchemy_ok' : 'icon_alchemy_lack', x + 30, my - 4, 14, 14);
      this.text(x + 20, my + 44, `${have}/${material.count}`, 12, ok ? INK : RED).setOrigin(0.5, 0);
      const tip = this.text(x + 20, my - 2, ITEMS[material.item]?.name ?? material.item).setOrigin(0.5, 1)
        .setBackgroundColor(PAPER).setPadding(4, 2).setVisible(false);
      slot?.setInteractive().on('pointerover', () => tip.setVisible(true)).on('pointerout', () => tip.setVisible(false));
    });
    const [sx, sy] = D.fuel.slot as Point;
    this.text(sx, sy - 16, '燃料', 12, INK_60); this.image('ui_alchemy_slot', sx, sy); this.item('spirit_stone', sx + 4, sy + 4, 32);
    this.text(sx + 20, sy + 44, `${this.prog.stones}/${recipe.fuelStones ?? 0}`, 12, this.prog.stones >= (recipe.fuelStones ?? 0) ? INK : RED).setOrigin(0.5, 0);
    this.text(...D.rate.text as Point, `预估成功率：${Math.round(this.system.rate(recipe.id, 'skipped', this.furnaceId) * 100)}%（不含火候）`, 12);
    this.gauge();
    const [bx, by] = D.buttons.brew as Rect;
    if (this.status) this.text(bx, by - 26, this.status, 12, this.lastResult?.success ? '#34774D' : RED);
    this.button(D.buttons.brew, '炼制', !busy && check.ok, () => this.brew());
    this.button(D.buttons.batch, '×5 批量', !busy && this.system.check(recipe.id, 5, this.furnaceId).ok, () => this.batch());
    this.button(D.buttons.skip, '跳过', busy, () => this.skipFire());
  }
  private gauge() {
    const G = this.layout.detail.fireGauge, [x, y, w, h] = G.rect as Rect;
    this.art('ui_alchemy_fire_gauge', G.rect);
    const m = String(G.track).match(/x\+(\d+),y\+(\d+),w[−-](\d+),h[−-](\d+)/);
    if (!m) return;
    const tx = x + +m[1], ty = y + +m[2], tw = w - +m[3], th = h - +m[4];
    this.image('ui_alchemy_fire_track', tx, ty, tw, th);
    const fire = this.system.active?.fire;
    if (fire) {
      const zoneHeight = hudSpec(this.scene, 'ui_alchemy_fire_zone')?.size?.[1] ?? h;
      this.art('ui_alchemy_fire_zone', [tx + fire.zoneStart * tw, y + (h - zoneHeight) / 2, fire.zoneWidth * tw, zoneHeight]);
      this.image('ui_alchemy_fire_perfect', tx + (fire.zoneStart + (fire.zoneWidth - fire.perfectWidth) / 2) * tw, y, fire.perfectWidth * tw, h);
      this.pointer = this.image('ui_alchemy_fire_pointer', tx, ty)!;
      this.pointer.setOrigin(0.5, 1);
      this.pointerTrack = { x: tx, w: tw };
      this.movePointer();
    }
    this.text(x, y + 30, fire ? t('alchemy.fire_hint') : '单炉按空格控火；批量自动跳过', 12, INK_60);
  }
  private movePointer() {
    if (!this.system.active || !this.pointer || !this.pointerTrack) return;
    this.pointerRatio = firePointer(this.system.active.fire);
    this.pointer.x = this.pointerTrack.x + this.pointerRatio * this.pointerTrack.w;
  }
  private effects(result: AlchemyResult) {
    const D = this.layout.detail, [fx, fy, fw] = D.furnace.rect as Rect;
    if (result.success) {
      const glow = this.image('ui_alchemy_glow_gold', fx + fw / 2, fy + 36)?.setOrigin(0.5).setScale(0.6);
      if (glow) {
        const furnaceIndex = this.c!.list.findIndex(o => o.name === 'alchemy_furnace');
        if (furnaceIndex >= 0) this.c!.moveTo(glow, furnaceIndex);
        this.scene.tweens.add({ targets: glow, scale: 1.2, alpha: 0, duration: 900, onComplete: () => glow.destroy() });
      }
    }
    const smoke = this.image(result.success ? 'ui_alchemy_smoke_white' : 'ui_alchemy_smoke_black', fx + fw / 2, fy + 10)?.setOrigin(0.5);
    if (smoke) this.scene.tweens.add({ targets: smoke, y: smoke.y - 24, alpha: 0, duration: 900, onComplete: () => smoke.destroy() });
    const [sx, sy] = D.stamp.center as Point;
    const stamp = this.image(result.success ? 'ui_alchemy_stamp_success' : 'ui_alchemy_stamp_fail', sx, sy)?.setOrigin(0.5).setScale(2.2).setAlpha(0);
    if (stamp) this.scene.tweens.add({ targets: stamp, scale: 1, alpha: 1, duration: 180, ease: 'Back.Out',
      onComplete: () => this.scene.tweens.add({ targets: stamp, alpha: 0, delay: 1200, duration: 300, onComplete: () => stamp.destroy() }) });
  }
}
