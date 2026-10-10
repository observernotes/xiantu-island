import Phaser from 'phaser';
import { hudSpec, sliced, HUD_FONT, PAPER, INK } from './hud';

/** 世界坐标键帽；边距和字的视觉中心沿 HUD 配置。 */
export function interactionPrompt(scene: Phaser.Scene, x: number, y: number, key: string, label: string) {
  const c = scene.add.container(x, y).setDepth(30).setVisible(false);
  const spec = hudSpec(scene, 'ui_hud_keycap');
  const [w, h] = spec?.size ?? [20, 20];
  const cap = sliced(scene, 'ui_hud_keycap', 0, 0, w, h);
  if (cap) c.add(cap.setScrollFactor(1));
  else c.add(scene.add.rectangle(w / 2, h / 2, w, h, 0xfaf2dc).setStrokeStyle(1, 0x3b2a20));
  const style = spec?.text;
  c.add(scene.add.text(w / 2, style?.centerY ?? h / 2, key, {
    fontFamily: HUD_FONT, fontSize: `${style?.size ?? 12}px`, fontStyle: style?.bold === false ? 'normal' : 'bold', color: style?.color ?? INK,
  }).setOrigin(0.5));
  const text = scene.add.text(w + 4, h / 2, label, {
    fontFamily: HUD_FONT, fontSize: '14px', fontStyle: 'bold', color: PAPER, stroke: INK, strokeThickness: 2,
  }).setOrigin(0, 0.5);
  c.add(text);
  c.setPosition(x - (w + 4 + text.width) / 2, y);
  return c;
}
