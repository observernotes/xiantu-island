import type Phaser from 'phaser';

export const HUD_RESERVE = 116;

/** 镜头下方的视觉地面，不扩展碰撞或物理边界。 */
export function addFloorStrip(scene: Phaser.Scene, mapWidth: number, mapHeight: number, area: string) {
  const texture = `tiles_${area}_ss`;
  if (scene.textures.exists(texture)) {
    scene.add.tileSprite(0, mapHeight, mapWidth, HUD_RESERVE, texture, 5).setOrigin(0, 0).setDepth(-1);
  } else {
    scene.add.graphics({ x: 0, y: mapHeight }).setDepth(-1).fillStyle(0x8a5a3c).fillRect(0, 0, mapWidth, HUD_RESERVE);
  }
}
