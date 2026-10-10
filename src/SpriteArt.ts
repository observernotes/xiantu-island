import type Phaser from 'phaser';

export interface SpriteArtSpec {
  frameSize?: number | [number, number];
  origin?: [number, number];
  bodySize?: [number, number] | null;
  displayScale?: number;
  pixelArt?: boolean;
}

const positive = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0;

/** 源画布/碰撞框使用素材像素；所有游戏挂点继续使用脚底起算的世界像素。 */
export function spriteArtSpec(sprite: Phaser.GameObjects.Sprite): SpriteArtSpec & { frameSize: [number, number]; displayScale: number } {
  const spec: SpriteArtSpec = sprite.scene.cache.json.get(`${sprite.texture.key}_anims`) ?? {};
  const size = typeof spec.frameSize === 'number' ? [spec.frameSize, spec.frameSize] : spec.frameSize;
  return { ...spec, frameSize: size?.length === 2 && size.every(positive) ? size as [number, number]
    : [sprite.frame.realWidth, sprite.frame.realHeight], displayScale: positive(spec.displayScale) ? spec.displayScale : 1 };
}

export function applySpriteArt(sprite: Phaser.GameObjects.Sprite, fallbackBody?: [number, number]) {
  const spec = spriteArtSpec(sprite), [w, h] = spec.frameSize;
  const origin = spec.origin?.length === 2 && spec.origin.every(Number.isFinite) ? spec.origin : [0.5, 1];
  // Phaser 的动画换帧会重新应用 atlas pivot，统一到 anims 的逐 key 原点。
  if (spec.origin) for (const frame of Object.values(sprite.texture.frames) as Phaser.Textures.Frame[]) {
    frame.customPivot = true; frame.pivotX = origin[0]; frame.pivotY = origin[1];
  }
  sprite.setOrigin(origin[0], origin[1]).setScale(spec.displayScale);
  // BRIEF 的柔和插画沿当前线性过滤；每 key 可显式切换 nearest。
  if (spec.pixelArt !== undefined || spec.displayScale !== 1) sprite.texture.setFilter(spec.pixelArt ? 1 : 0);
  const body = sprite.body as Phaser.Physics.Arcade.Body | null;
  const size = spec.bodySize?.length === 2 && spec.bodySize.every(positive) ? spec.bodySize : fallbackBody;
  if (body && size) {
    const [bw, bh] = size;
    body.setSize(bw, bh, false).setOffset((w - bw) / 2, h - bh);
    // Scene.UPDATE 在物理步进之后：只能改尺寸，不得用尚未同步的 sprite 坐标回卷本帧位移。
    body.updateBounds();
  }
  return spec;
}
