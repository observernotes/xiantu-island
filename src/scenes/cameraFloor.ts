import type Phaser from 'phaser';
import { tileVariantGroups } from '../TileVariants';

export const HUD_RESERVE = 116;

/** 镜头下方的视觉地面，不扩展碰撞或物理边界。 */
export function addFloorStrip(scene: Phaser.Scene, mapWidth: number, mapHeight: number, area: string) {
  const tileset = `tiles_${area}`;
  // 满铺块整条固定取组 base（变体 0），重排图集后不能再假定帧号是 5。
  const base = tileVariantGroups(scene.cache.json.get(`${tileset}_meta`), tileset).get(5)?.base;
  const selected = base && scene.textures.exists(`${base.tileset}_ss`) ? base : { tileset, frame: 5 };
  const texture = `${selected.tileset}_ss`;
  if (scene.textures.exists(texture)) {
    scene.add.tileSprite(0, mapHeight, mapWidth, HUD_RESERVE, texture, selected.frame).setOrigin(0, 0).setDepth(-1);
  } else {
    scene.add.graphics({ x: 0, y: mapHeight }).setDepth(-1).fillStyle(0x8a5a3c).fillRect(0, 0, mapWidth, HUD_RESERVE);
  }
}
