import Phaser from 'phaser';

export const BACKGROUND_DEPTH = { sky: -10, far: -9, mid: -8, near: -7, fg: 20 } as const;
type LayerName = keyof typeof BACKGROUND_DEPTH;
// Phaser 运行时有 displayTexture，但发行的声明省略了此字段。
type SourceTileSprite = Phaser.GameObjects.TileSprite & { displayTexture: Phaser.Textures.Texture };
export interface BackgroundLayer {
  texture?: string; key?: string; file?: string;
  scrollFactor?: number | [number, number]; scrollFactorX?: number; scrollFactorY?: number;
  factorX?: number; factorY?: number; yOffset?: number; y?: number;
  tile?: boolean; repeatX?: boolean; alpha?: number; fadeNearPlayer?: boolean;
}
export interface BackgroundConfig { layers?: Partial<Record<LayerName, BackgroundLayer>> | BackgroundLayer[]; }
const number = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) ? value : fallback;
interface AlphaMask { width: number; height: number; sourceWidth: number; sourceHeight: number; alpha: Uint8Array; }
interface BackgroundState {
  name: LayerName; image: Phaser.GameObjects.Image | Phaser.GameObjects.TileSprite;
  factorX: number; factorY: number; tiled: boolean;
  fade?: { baseAlpha: number; mask: AlphaMask };
}
// 每层只读一次低分辨率 alpha；透明画布的整幅矩形不会触发淡出。
function alphaMask(source: HTMLImageElement): AlphaMask | undefined {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = Math.max(1, Math.ceil(source.width / 8));
    canvas.height = Math.max(1, Math.ceil(source.height / 8));
    const context = canvas.getContext('2d', { willReadFrequently: true });
    if (!context) return;
    context.drawImage(source, 0, 0, canvas.width, canvas.height);
    const pixels = context.getImageData(0, 0, canvas.width, canvas.height).data;
    const alpha = new Uint8Array(canvas.width * canvas.height);
    for (let i = 0; i < alpha.length; i++) alpha[i] = pixels[i * 4 + 3];
    return { width: canvas.width, height: canvas.height, sourceWidth: source.width, sourceHeight: source.height, alpha };
  } catch { /* 无法读 alpha 的纹理保持配置透明度，不影响可玩性。 */ }
}
function proximity(mask: AlphaMask, x: number, y: number, scaleX: number, scaleY: number, tiled: boolean) {
  const radius = 64;
  const cellW = mask.sourceWidth / mask.width * scaleX, cellH = mask.sourceHeight / mask.height * scaleY;
  let nearest = radius;
  for (let row = Math.floor((y - radius) / cellH); row <= Math.floor((y + radius) / cellH); row++) {
    if (!tiled && (row < 0 || row >= mask.height)) continue;
    for (let col = Math.floor((x - radius) / cellW); col <= Math.floor((x + radius) / cellW); col++) {
      if (!tiled && (col < 0 || col >= mask.width)) continue;
      const mx = (col % mask.width + mask.width) % mask.width, my = (row % mask.height + mask.height) % mask.height;
      if (mask.alpha[my * mask.width + mx] < 16) continue;
      const dx = Math.max(0, Math.abs((col + 0.5) * cellW - x) - cellW / 2);
      const dy = Math.max(0, Math.abs((row + 0.5) * cellH - y) - cellH / 2);
      nearest = Math.min(nearest, Math.hypot(dx, dy));
    }
  }
  return 1 - nearest / radius;
}

/** 仅配置且纹理已到位的层参与渲染；深度由引擎统一保护交互层。 */
export class BackgroundArt {
  readonly layers: BackgroundState[] = [];
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
      const baseAlpha = Math.max(0, Math.min(1, number(def.alpha, 1)));
      image.setOrigin(0, 1).setDepth(depth).setAlpha(baseAlpha).setName(`background:${name}`);
      const mask = name === 'fg' && def.fadeNearPlayer ? alphaMask(source) : undefined;
      this.layers.push({ name, image, factorX: fx, factorY: fy, tiled, fade: mask ? { baseAlpha, mask } : undefined });
    }
    if (this.layers.length && !this.layers.some(layer => layer.name === 'sky')) {
      this.sky = scene.add.graphics().setScrollFactor(0).setDepth(BACKGROUND_DEPTH.sky);
      this.sky.fillGradientStyle(0x7cc8f2, 0x7cc8f2, 0xdff3ff, 0xdff3ff, 1).fillRect(0, 0, 1280, 720);
    }
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
  }
  update(player?: { x: number; y: number }, delta = 1000 / 60) {
    const camera = this.scene.cameras.main;
    for (const layer of this.layers) {
      if (layer.tiled) (layer.image as Phaser.GameObjects.TileSprite).tilePositionX = camera.scrollX * layer.factorX;
      if (!layer.fade) continue;
      const { image, fade, tiled } = layer;
      let strength = 0;
      if (player) {
        // 玩家以脚底定位；查询身体附近，并把视差层转换到相同的屏幕坐标。
        let x = player.x + camera.scrollX * (image.scrollFactorX - 1) - image.x + image.originX * image.displayWidth;
        let y = player.y - 32 + camera.scrollY * (image.scrollFactorY - 1) - image.y + image.originY * image.displayHeight;
        const sprite = image as Phaser.GameObjects.TileSprite;
        if (tiled) { x += sprite.tilePositionX * image.scaleX; y += sprite.tilePositionY * image.scaleY; }
        const sx = tiled ? image.scaleX * sprite.tileScaleX : image.displayWidth / fade.mask.sourceWidth;
        const sy = tiled ? image.scaleY * sprite.tileScaleY : image.displayHeight / fade.mask.sourceHeight;
        strength = proximity(fade.mask, x, y, sx, sy, tiled);
      }
      const target = fade.baseAlpha - (fade.baseAlpha - Math.min(fade.baseAlpha, 0.35)) * strength;
      const blend = 1 - Math.exp(-Math.max(0, number(delta, 1000 / 60)) / 120);
      image.setAlpha(image.alpha + (target - image.alpha) * blend);
    }
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
