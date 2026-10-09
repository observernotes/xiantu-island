import Phaser from 'phaser';

/**
 * HUD 精修素材（art/icons/ui/hud/，README 与 hud_ui.json）。
 * 九切片 / 三切片边距、innerRect、iconOffset 一律读 hud_ui.json 和 ../ui_bar_cultivation.slices.json，不在代码里写死。
 * 素材缺失时各调用方退回代码绘制。
 */
export const HUD_DIR = 'art/icons/ui/hud';
export const HUD_FONT = '"Noto Sans CJK SC", "Source Han Sans SC", sans-serif';
export const INK = '#3B2A20', PAPER = '#FAF2DC', RED = '#E5483A', NAVY = '#2B4C7E';
export const INK_60 = 'rgba(59,42,32,0.6)';

const HUD_IMAGES = [
  'ui_hud_bar_frame', 'ui_hud_bar_hp', 'ui_hud_bar_mp', 'ui_hud_panel', 'ui_hud_dialog',
  'ui_hud_slot', 'ui_hud_slot_locked', 'ui_hud_slot_active',
  'ui_hud_quest_available', 'ui_hud_quest_turnin', 'ui_hud_quest_progress',
  'ui_hud_boss_bar_frame', 'ui_hud_boss_bar_fill', 'ui_hud_boss_nameplate',
];
const CULT_IMAGES = ['ui_bar_cultivation_frame', 'ui_bar_cultivation', 'ui_bar_cultivation_bottleneck', 'ui_bar_cultivation_bottleneck_glow'];
export const HUD_FONTS = ['ui_hud_font_white', 'ui_hud_font_crit', 'ui_hud_font_hurt'];

export function preloadHud(scene: Phaser.Scene) {
  scene.load.json('hud_ui', `${HUD_DIR}/hud_ui.json`);
  scene.load.json('cult_slices', 'art/icons/ui/ui_bar_cultivation.slices.json');
  for (const k of HUD_IMAGES) scene.load.image(k, `${HUD_DIR}/${k}.png`);
  for (const k of CULT_IMAGES) scene.load.image(k, `art/icons/ui/${k}.png`);
  for (const k of HUD_FONTS) { scene.load.image(k, `${HUD_DIR}/fonts/${k}.png`); scene.load.json(`${k}_data`, `${HUD_DIR}/fonts/${k}.json`); }
}

/** sync 只拷 png/json，位图字用 json 里的 xml 字段注册（README「位图字加载」） */
export function registerHudFonts(scene: Phaser.Scene) {
  for (const k of HUD_FONTS) {
    if (scene.cache.bitmapFont.exists(k) || !scene.textures.exists(k)) continue;
    const j = scene.cache.json.get(`${k}_data`);
    if (!j?.xml) continue;
    const xml = new DOMParser().parseFromString(j.xml, 'text/xml');
    const tex = scene.textures.get(k);
    const data = Phaser.GameObjects.BitmapText.ParseXMLBitmapFont(xml, tex.get(), 0, 0);
    scene.cache.bitmapFont.add(k, { data, texture: k, frame: null });
  }
}

export interface HudSpec {
  size?: [number, number];
  nineSlice?: { left: number; right: number; top: number; bottom: number };
  threeSlice?: { left: number; right: number };
  innerRect?: [number, number, number, number];
  iconOffset?: [number, number];
  origin?: [number, number];
  contentInset?: number;
  pad?: number;
}
export function hudSpec(scene: Phaser.Scene, key: string): HudSpec | undefined {
  return scene.cache.json.get('hud_ui')?.[key] ?? scene.cache.json.get('cult_slices')?.[key];
}
export function hasHud(scene: Phaser.Scene, key: string) { return scene.textures.exists(key) && !!hudSpec(scene, key); }

type Sliced = Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image;

/** 按 hud_ui.json 的切片建一个可拉伸的件。WebGL 用 NineSlice；Canvas 退回整图拉伸 */
export function sliced(scene: Phaser.Scene, key: string, x: number, y: number, w: number, h: number): Sliced | null {
  const sp = hudSpec(scene, key);
  if (!scene.textures.exists(key) || !sp) return null;
  let o: Sliced;
  if (scene.game.renderer.type === Phaser.WEBGL && (sp.nineSlice || sp.threeSlice)) {
    const n = sp.nineSlice, t = sp.threeSlice;
    o = n ? scene.add.nineslice(x, y, key, undefined, w, h, n.left, n.right, n.top, n.bottom)
      : scene.add.nineslice(x, y, key, undefined, w, sp.size?.[1] ?? h, t!.left, t!.right, 0, 0);
  } else o = scene.add.image(x, y, key).setDisplaySize(w, h);
  return o.setOrigin(0, 0).setScrollFactor(0);
}

/** 改宽度；小于左右切片之和时按比例压缩（README：宽度过小时改用裁剪/缩放） */
export function setSlicedWidth(scene: Phaser.Scene, o: Sliced, key: string, w: number) {
  const sp = hudSpec(scene, key);
  const min = (sp?.nineSlice?.left ?? sp?.threeSlice?.left ?? 0) + (sp?.nineSlice?.right ?? sp?.threeSlice?.right ?? 0);
  o.setVisible(w > 0.5);
  if (w <= 0.5) return;
  if (o instanceof Phaser.GameObjects.NineSlice) {
    const ww = Math.max(min, Math.round(w));
    if (o.width !== ww) o.setSize(ww, o.height);
    o.setScale(w < min ? w / min : 1, 1);
  } else o.setDisplaySize(w, o.displayHeight);
}

/** 横条：底框 + 三切片填充，填充放在 innerRect（拉伸后 x+ix, y+iy, w-(frameW-iw), ih） */
export class HudBar {
  frame: Sliced; fill: Sliced; glow?: Sliced;
  inner: { x: number; y: number; w: number; h: number };
  constructor(private scene: Phaser.Scene, private frameKey: string, private fillKey: string, x: number, y: number, w: number, h: number, depth: number) {
    const sp = hudSpec(scene, frameKey)!;
    const [ix, iy, iw, ih] = sp.innerRect ?? [0, 0, sp.size![0], sp.size![1]];
    this.inner = { x: x + ix, y: y + iy, w: w - (sp.size![0] - iw), h: ih };
    this.frame = sliced(scene, frameKey, x, y, w, h)!.setDepth(depth);
    this.fill = sliced(scene, fillKey, this.inner.x, this.inner.y, this.inner.w, this.inner.h)!.setDepth(depth + 1);
  }
  set(ratio: number, fillKey = this.fillKey) {
    if (fillKey !== this.fillKey && this.scene.textures.exists(fillKey)) {
      this.fillKey = fillKey;
      const vis = this.fill.visible; this.fill.destroy();
      this.fill = sliced(this.scene, fillKey, this.inner.x, this.inner.y, this.inner.w, this.inner.h)!.setDepth(this.frame.depth + 1).setVisible(vis);
    }
    setSlicedWidth(this.scene, this.fill, this.fillKey, this.inner.w * Phaser.Math.Clamp(ratio, 0, 1));
  }
  setVisible(v: boolean) { this.frame.setVisible(v); if (!v) this.fill.setVisible(false); this.glow?.setVisible(v && this.glow.visible); return this; }
}

export function hudText(scene: Phaser.Scene, x: number, y: number, size: number, opts: Phaser.Types.GameObjects.Text.TextStyle = {}) {
  return scene.add.text(x, y, '', { fontFamily: HUD_FONT, fontSize: `${size}px`, color: INK, ...opts }).setScrollFactor(0);
}
