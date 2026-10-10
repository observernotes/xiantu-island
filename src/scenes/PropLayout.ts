import type Phaser from 'phaser';

const PROP_DEPTH = { back: -2, mid: 2, front: 15 } as const;
export interface PropLayoutItem {
  frame: string; x: number; y: number;
  layer?: keyof typeof PROP_DEPTH;
  origin?: [number, number]; flipX?: boolean; scale?: number | [number, number];
}
export interface PropLayoutConfig { map: string; atlas: string; items: PropLayoutItem[]; }
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** 道具仅作装饰；坐标是世界像素脚底，既不创建物理体也不占交互对象。 */
export class PropLayout {
  readonly images: Phaser.GameObjects.Image[] = [];
  constructor(private scene: Phaser.Scene, mapId: string, config?: PropLayoutConfig) {
    if (!config || config.map !== mapId || !scene.textures.exists(config.atlas)) return;
    const atlas = scene.textures.get(config.atlas);
    for (const item of Array.isArray(config.items) ? config.items : []) {
      // Texture.get 遇到缺帧会打印警告并返回默认帧，所以在 add.image 之前检查。
      if (!item || typeof item.frame !== 'string' || !atlas.has(item.frame) || !Number.isFinite(item.x) || !Number.isFinite(item.y)) continue;
      const scale = Array.isArray(item.scale) ? item.scale : [item.scale, item.scale];
      const image = scene.add.image(item.x, item.y, config.atlas, item.frame)
        .setOrigin(number(item.origin?.[0], 0.5), number(item.origin?.[1], 1))
        .setDepth(PROP_DEPTH[item.layer ?? 'mid'] ?? PROP_DEPTH.mid)
        .setScale(number(scale[0], 1), number(scale[1], 1))
        .setFlipX(item.flipX ?? false).setName(`prop:${item.frame}`);
      this.images.push(image);
    }
    scene.events.once('shutdown', this.destroy, this);
  }
  destroy() {
    this.scene.events.off('shutdown', this.destroy, this);
    for (const image of this.images) image.destroy();
    this.images.length = 0;
  }
}
