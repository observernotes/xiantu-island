import Phaser from 'phaser';

export const BACKGROUND_DEPTH = { sky: -10, far: -9, mid: -8, near: -7, fg: 20 } as const;
type LayerName = keyof typeof BACKGROUND_DEPTH;
// Phaser 运行时有 displayTexture，但发行的声明省略了此字段。
type SourceTileSprite = Phaser.GameObjects.TileSprite & { displayTexture: Phaser.Textures.Texture };
export interface BackgroundLayer {
  texture?: string; key?: string; file?: string;
  scrollFactor?: number | [number, number]; scrollFactorX?: number; scrollFactorY?: number;
  factorX?: number; factorY?: number; yOffset?: number; y?: number;
  tile?: boolean; repeatX?: boolean; alpha?: number;
}
export interface BackgroundConfig { layers?: Partial<Record<LayerName, BackgroundLayer>> | BackgroundLayer[]; }
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;

/** 仅配置且纹理已到位的层参与渲染；深度由引擎统一保护交互层。 */
export class BackgroundArt {
  readonly layers: { name: LayerName; image: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite; factorX: number; factorY: number; tiled: boolean }[] = [];
  private sky?: Phaser.GameObjects.Graphics;
  constructor(private scene: Phaser.Scene, area: string, width: number, height: number, config: BackgroundConfig) {
    for (const [name, depth] of Object.entries(BACKGROUND_DEPTH) as [LayerName, number][]) {
      const def = Array.isArray(config.layers) ? config.layers.find(layer => (layer.key ?? layer.texture)?.endsWith(`_${name}`)) : config.layers?.[name];
      if (!def) continue;
      const key = def.texture ?? def.key ?? `bg_${area}_${name}`;
      if (!scene.textures.exists(key)) continue;
      const scalar = typeof def.scrollFactor === 'number' ? def.scrollFactor : undefined;
      const factors = Array.isArray(def.scrollFactor) ? def.scrollFactor : undefined;
      const defaultX = { sky: 0, far: 0.2, mid: 0.5, near: 0.85, fg: 1 }[name];
      const fx = number(factors?.[0] ?? scalar ?? def.scrollFactorX ?? def.factorX, defaultX);
      const fy = number(factors?.[1] ?? def.scrollFactorY ?? def.factorY, name === 'near' || name === 'fg' ? 1 : 0);
      const y = number(def.y, fy === 0 ? scene.scale.height : height) + number(def.yOffset, 0);
      const source = scene.textures.get(key).getSourceImage() as HTMLImageElement;
      const tiled = def.tile ?? def.repeatX ?? false;
      // 系数 >1 的前景也覆盖实际地图的全部镜头行程。
      const coverage = Math.max(width, scene.scale.width + Math.max(0, fx) * Math.max(0, width - scene.scale.width));
      const image = tiled ? scene.add.tileSprite(0, y, coverage, source.height, key).setScrollFactor(0, fy)
        : scene.add.image(0, y, key).setDisplaySize(coverage, source.height).setScrollFactor(fx, fy);
      image.setOrigin(0, 1).setDepth(depth).setAlpha(Math.max(0, Math.min(1, number(def.alpha, 1)))).setName(`background:${name}`);
      this.layers.push({ name, image, factorX: fx, factorY: fy, tiled });
    }
    if (this.layers.length && !this.layers.some(layer => layer.name === 'sky')) {
      this.sky = scene.add.graphics().setScrollFactor(0).setDepth(BACKGROUND_DEPTH.sky);
      this.sky.fillGradientStyle(0x7cc8f2, 0x7cc8f2, 0xdff3ff, 0xdff3ff, 1).fillRect(0, 0, 1280, 720);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  update() {
    for (const layer of this.layers) if (layer.tiled) (layer.image as Phaser.GameObjects.TileSprite).tilePositionX = this.scene.cameras.main.scrollX * layer.factorX;
  }
  snapshot() {
    return this.layers.map(({ name, image, factorX, factorY, tiled }) => ({ name, key: image instanceof Phaser.GameObjects.TileSprite ? (image as SourceTileSprite).displayTexture.key : image.texture.key,
      width: image.displayWidth, height: image.displayHeight, y: image.y, depth: image.depth, factorX, factorY, tiled }));
  }
  destroy() {
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.sky?.destroy(); this.sky = undefined;
    for (const layer of this.layers) layer.image.destroy();
    this.layers.length = 0;
  }
}
