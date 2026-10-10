// 无浏览器、无端口：胜负逻辑、地图机关和怪物受击均加载真实代码。
// Phaser 仅替换绘制/物理容器；snapshot 与 shared 可分别验证。
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
process.env.XT_DATA ??= 'snapshot';
const phaserStub = `
class Body {
  constructor(sprite) {
    this.sprite = sprite; this.width = 40; this.height = 56; this.enable = true;
    this.velocity = { x: 0, y: 0 }; this.blocked = { down: true, left: false, right: false };
    this.touching = { down: false }; this.allowGravity = true;
  }
  get x() { return this.sprite.x - this.width / 2; }
  get y() { return this.sprite.y - this.height; }
  get center() { return { x: this.sprite.x, y: this.sprite.y - this.height / 2 }; }
  get left() { return this.x; } get right() { return this.x + this.width; }
  get top() { return this.y; } get bottom() { return this.sprite.y; }
  setSize(w, h) { this.sourceWidth = w; this.sourceHeight = h; this.width = w; this.height = h; return this; }
  updateBounds() { this.width = this.sourceWidth * this.sprite.scaleX; this.height = this.sourceHeight * this.sprite.scaleY; }
  updateFromGameObject() { return this; }
  setOffset() { return this; } setMaxVelocityY() { return this; }
  setImmovable() { return this; }
  setAllowGravity(value) { this.allowGravity = value; return this; }
  setVelocityX(x) { this.velocity.x = x; return this; }
  setVelocityY(y) { this.velocity.y = y; return this; }
  setVelocity(x, y) { this.velocity.x = x; this.velocity.y = y; return this; }
  reset(x, y) { this.sprite.x = x; this.sprite.y = y; return this; }
}
class Sprite {
  constructor(scene, x, y, key) {
    Object.assign(this, { scene, x, y, active: true, visible: true, alpha: 1, tintTopLeft: 0xffffff });
    this.frame = { realWidth: 64, realHeight: 80 }; this.texture = { key, frames: {}, setFilter() {} };
    this.scaleX = this.scaleY = 1; this.body = new Body(this);
    this.anims = { currentAnim: null, pause() {}, resume() {}, nextFrame() {}, stop() {} };
  }
  setName(name) { this.name = name; return this; }
  setOrigin() { return this; } setDepth() { return this; } setScrollFactor() { return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; }
  setFlipX() { return this; } clearTint() { this.tintTopLeft = 0xffffff; return this; }
  setTint(value) { this.tintTopLeft = value; return this; } setTintFill() { return this; }
  setAlpha(value) { this.alpha = value; return this; } setFrame() { return this; }
  setVisible(value) { this.visible = value; return this; } setBlendMode() { return this; }
  setCollideWorldBounds() { return this; }
  play() { return this; } on() { return this; } once() { return this; }
  destroy() { this.active = false; }
}
class Rectangle {
  constructor(x,y,width,height) { Object.assign(this,{x,y,width,height}); }
  get left() { return this.x; } get right() { return this.x + this.width; }
  get top() { return this.y; } get bottom() { return this.y + this.height; }
}
export default {
  WEBGL: 2, Scene: class {}, Physics: { Arcade: { Sprite, Body } },
  GameObjects: { Sprite, NineSlice: class {}, Events: { DESTROY: 'destroy' } },
  Geom: { Rectangle, Intersects: { RectangleToRectangle: (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top } },
  Math: { Between: (lo, hi) => Math.floor((lo + hi) / 2),
    Clamp: (n, lo, hi) => Math.min(hi, Math.max(lo, n)), Linear: (a, b, p) => a + (b - a) * p,
    Distance: { Between: (ax, ay, bx, by) => Math.hypot(ax - bx, ay - by) } },
  Scenes: { Events: { SHUTDOWN: 'shutdown' } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
  Display: { Color: { IntegerToColor: n => ({ r: n >> 16, g: n >> 8 & 255, b: n & 255 }),
    GetColor: (r,g,b) => r << 16 | g << 8 | b, Interpolate: { ColorWithColor: (_a,b) => b } } },
  Input: { Keyboard: { JustDown: key => { const down = !!key.justDown; key.justDown = false; return down; } } },
  BlendModes: { NORMAL: 0 }
};
`;
const server = await createServer({
  root, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  ssr: { noExternal: ['phaser'] },
  plugins: [{ name: 'trials-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0trials-phaser'; },
    load(id) { if (id === '\0trials-phaser') return phaserStub; },
  }],
});
try { await server.ssrLoadModule('/src/trials.test.ts'); }
finally { await server.close(); }
