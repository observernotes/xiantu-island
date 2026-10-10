// 无浏览器、无监听端口：SSR 加载真实控制器，Phaser 仅替换渲染/物理容器。
import { createServer, transformWithEsbuild } from 'vite';
import { execFileSync } from 'node:child_process';

const baselineRevision = 'c72b60c';
const before = Object.fromEntries(['Monster', 'AltarTrial'].map(name => [name,
  execFileSync('git', ['show', `${baselineRevision}:src/scenes/${name}.ts`], { encoding: 'utf8' })
    .replaceAll("'../data'", "'/src/data'").replaceAll("'../hud'", "'/src/hud'")
]));

const phaserStub = `
class Body {
  constructor(sprite) {
    this.sprite = sprite; this.width = 40; this.height = 56;
    this.velocity = { x: 0, y: 0 }; this.enable = true;
    this.blocked = { down: true, left: false, right: false };
    this.touching = { down: false }; this.allowGravity = true;
  }
  get x() { return this.sprite.x - this.width / 2; }
  get y() { return this.sprite.y - this.height; }
  get center() { return { x: this.sprite.x, y: this.sprite.y - this.height / 2 }; }
  get left() { return this.x; } get right() { return this.x + this.width; }
  get bottom() { return this.sprite.y; }
  setSize(w, h) { this.sourceWidth = w; this.sourceHeight = h; this.width = w; this.height = h; return this; }
  updateBounds() { this.width = this.sourceWidth * this.sprite.scaleX; this.height = this.sourceHeight * this.sprite.scaleY; }
  setOffset() { return this; } setMaxVelocityY() { return this; }
  setImmovable() { return this; }
  setAllowGravity(value) { this.allowGravity = value; return this; }
  setVelocityX(x) { this.velocity.x = x; return this; }
  setVelocityY(y) { this.velocity.y = y; return this; }
  setVelocity(x, y) { this.velocity.x = x; this.velocity.y = y; return this; }
  reset(x, y) { this.sprite.x = x; this.sprite.y = y; return this; }
}
class Sprite {
  constructor(scene, x, y, _key) {
    this.scene = scene; this.x = x; this.y = y; this.active = true;
    this.visible = true; this.frame = { realWidth: 64, realHeight: 80 };
    this.texture = { key: _key, frames: {}, setFilter() {} }; this.scaleX = this.scaleY = 1;
    this.body = new Body(this); this.anims = {
      currentAnim: null, pause() {}, resume() {}, nextFrame() {}, stop() {}
    };
  }
  setOrigin() { return this; } setDepth() { return this; }
  setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setFlipX() { return this; } clearTint() { return this; }
  setTint() { return this; } setTintFill() { return this; }
  setAlpha() { return this; } setFrame() { return this; }
  setVisible(value) { this.visible = value; return this; }
  play() { return this; } on() { return this; } once() { return this; }
  destroy() { this.active = false; }
}
class Rectangle { constructor(x,y,width,height) { Object.assign(this,{x,y,width,height}); } }
const Phaser = {
  Scene: class {}, Physics: { Arcade: { Sprite, Body } },
  GameObjects: { Sprite, NineSlice: class {} }, Geom: { Rectangle },
  Math: { Between: (lo, hi) => Math.floor((lo + hi) / 2),
    Clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)),
    Distance: { Between: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  Display: { Color: { GetColor: () => 0xffffff } }, BlendModes: { NORMAL: 0 }
};
export default Phaser;
`;

const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false },
  appType: 'custom', logLevel: 'error',
  ssr: { noExternal: ['phaser'] },
  plugins: [{
    name: 'altar-headless-sources', enforce: 'pre',
    resolveId(id) {
      if (id === 'phaser') return '\0altar-phaser.js';
      if (id === 'virtual:altar-before-Monster') return '\0altar-before-Monster.ts';
      if (id === 'virtual:altar-before-AltarTrial') return '\0altar-before-AltarTrial.ts';
    },
    async load(id) {
      if (id === '\0altar-phaser.js') return phaserStub;
      if (id === '\0altar-before-Monster.ts') return (await transformWithEsbuild(before.Monster, 'Monster.ts')).code;
      if (id === '\0altar-before-AltarTrial.ts') return (await transformWithEsbuild(before.AltarTrial, 'AltarTrial.ts')).code;
    },
  }],
});
try {
  const { Monster } = await server.ssrLoadModule('virtual:altar-before-Monster');
  const { AltarTrial } = await server.ssrLoadModule('virtual:altar-before-AltarTrial');
  globalThis.__altarBaseline = { Monster, AltarTrial, revision: baselineRevision };
  await server.ssrLoadModule('/src/altar.test.ts');
} finally {
  delete globalThis.__altarBaseline;
  await server.close();
}
