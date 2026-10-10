import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

// 用小块不透明前景验证真实 BackgroundArt 的坐标转换和透明区行为。
class Display {
  constructor(x, y, key, width = 128, height = 128) {
    Object.assign(this, { x, y, texture: { key }, displayWidth: width, displayHeight: height,
      scaleX: 1, scaleY: 1, tileScaleX: 1, tileScaleY: 1, tilePositionX: 0, tilePositionY: 0 });
  }
  setScrollFactor(x, y = x) { this.scrollFactorX = x; this.scrollFactorY = y; return this; }
  setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
  setOrigin(x, y) { this.originX = x; this.originY = y; return this; }
  setDepth(depth) { this.depth = depth; return this; }
  setAlpha(alpha) { this.alpha = alpha; return this; }
  setName() { return this; }
  fillGradientStyle() { return this; }
  fillRect() { return this; }
  destroy() { this.destroyed = true; }
}
class TileSprite extends Display {}
globalThis.__backgroundPhaser = { GameObjects: { TileSprite }, Scenes: { Events: { SHUTDOWN: 'shutdown' } } };
const originalDocument = globalThis.document;
let maskReads = 0;
let sampledAlpha = 255;
globalThis.document = { createElement() {
  const canvas = {};
  canvas.getContext = () => ({
    drawImage() {},
    getImageData() {
      maskReads++;
      const data = new Uint8ClampedArray(canvas.width * canvas.height * 4);
      // 128×128 图片的 [64,72)×[64,72) 区域不透明，其余透明。
      data[(8 * canvas.width + 8) * 4 + 3] = sampledAlpha;
      return { data };
    },
  });
  return canvas;
} };

try {
  const source = await fs.readFile(new URL('../src/scenes/BackgroundArt.ts', import.meta.url), 'utf8');
  const { outputText } = ts.transpileModule(source.replace("import Phaser from 'phaser';", 'const Phaser = globalThis.__backgroundPhaser;'),
    { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  const { BackgroundArt } = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  const create = (definition, name = 'fg', width = 128) => {
    const scene = {
      scale: { width: 128, height: 128 }, cameras: { main: { scrollX: 0, scrollY: 0 } },
      textures: { exists: () => true, get: () => ({ getSourceImage: () => ({ width: 128, height: 128 }) }) },
      events: { once() {}, off() {} },
      add: { image: (x, y, key) => new Display(x, y, key),
        tileSprite: (x, y, w, h, key) => new TileSprite(x, y, key, w, h), graphics: () => new Display() },
    };
    const art = new BackgroundArt(scene, 'test', width, 128, { layers: { [name]: { texture: 'test', alpha: 0.9, ...definition } } });
    return { art, scene, image: art.layers[0].image };
  };
  const close = (actual, expected, message) => assert.ok(Math.abs(actual - expected) < 0.001, `${message}: ${actual}`);
  const enabled = create({ fadeNearPlayer: true });
  assert.equal(enabled.image.depth, 20, 'foreground retains the engine depth');
  enabled.art.update({ x: 68, y: 100 }, 1200);
  close(enabled.image.alpha, 0.35, 'overlapping opaque foreground fades');
  enabled.art.update({ x: 16, y: 16 }, 1200);
  close(enabled.image.alpha, 0.9, 'transparent foreground rectangle does not fade');
  enabled.art.update({ x: 32, y: 100 }, 1200);
  close(enabled.image.alpha, 0.625, 'fade varies with distance to opaque pixels');
  enabled.art.update(undefined, 1200);
  close(enabled.image.alpha, 0.9, 'omitted player restores configured alpha');
  assert.equal(maskReads, 1, 'updates reuse the alpha mask');

  const parallax = create({ fadeNearPlayer: true, factorX: 1.15 });
  parallax.scene.cameras.main.scrollX = 200;
  parallax.art.update({ x: 38, y: 100 }, 1200);
  close(parallax.image.alpha, 0.35, 'non-tiled foreground considers camera parallax');
  const scaled = create({ fadeNearPlayer: true }, 'fg', 256);
  scaled.art.update({ x: 136, y: 100 }, 1200);
  close(scaled.image.alpha, 0.35, 'stretched background uses display size for alpha coordinates');
  const screenAnchored = create({ fadeNearPlayer: true, factorY: 0 });
  screenAnchored.scene.cameras.main.scrollY = 40;
  screenAnchored.art.update({ x: 68, y: 140 }, 1200);
  close(screenAnchored.image.alpha, 0.35, 'vertical parallax keeps screen-anchored alpha aligned');
  const tiled = create({ fadeNearPlayer: true, factorX: 1.15, repeatX: true });
  tiled.scene.cameras.main.scrollX = 132;
  tiled.art.update({ x: 176.2, y: 100 }, 1200);
  close(tiled.image.alpha, 0.35, 'tiled foreground considers parallax and wrapped texture');
  close(tiled.image.tilePositionX, 151.8, 'tile scrolling remains unchanged');

  for (const [alpha, expected] of [[15, 0.9], [16, 0.35]]) {
    sampledAlpha = alpha;
    const threshold = create({ fadeNearPlayer: true });
    threshold.art.update({ x: 68, y: 100 }, 1200);
    close(threshold.image.alpha, expected, 'alpha threshold rejects almost transparent pixels');
  }
  sampledAlpha = 255;

  const faint = create({ fadeNearPlayer: true, alpha: 0.2 });
  faint.art.update({ x: 68, y: 100 }, 1200);
  close(faint.image.alpha, 0.2, 'fade never makes a faint foreground more opaque');
  for (const [definition, name] of [[{}, 'fg'], [{ fadeNearPlayer: true }, 'far']]) {
    const unchanged = create(definition, name);
    unchanged.art.update({ x: 68, y: 100 }, 1200);
    close(unchanged.image.alpha, 0.9, 'unconfigured foreground and other layers retain alpha');
    unchanged.art.destroy();
    assert.equal(unchanged.image.destroyed, true);
  }
  console.log(JSON.stringify({ suite: 'background-fade', passed: true }));
} finally {
  globalThis.document = originalDocument;
  delete globalThis.__backgroundPhaser;
}
