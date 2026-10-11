import { createServer } from 'vite';
import assert from 'node:assert/strict';
import { EventEmitter } from 'node:events';
import fs from 'node:fs';
import path from 'node:path';
import { findRoot } from './root.mjs';
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'alchemy-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0alchemy-phaser'; },
    load(id) { if (id === '\0alchemy-phaser') return 'export default {WEBGL:2,GameObjects:{NineSlice:class {}},Scenes:{Events:{SHUTDOWN:"shutdown"}}};'; },
  }], ssr: { noExternal: ['phaser'] },
});
const originalStorage = globalThis.localStorage;
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
class Display extends EventEmitter {
  constructor(x, y, key, textures) {
    super(); Object.assign(this, { x, y, key, textures, list: [], visible: true });
    if (key) assert.ok(textures.exists(key), `创建缺失纹理 ${key}`);
  }
  setOrigin() { return this; } setDepth() { return this; } setScrollFactor() { return this; }
  setInteractive() { return this; } setStroke() { return this; } setLineSpacing() { return this; }
  setBackgroundColor() { return this; } setPadding() { return this; } setScale() { return this; }
  setAlpha() { return this; } play() { return this; }
  setName(name) { this.name = name; return this; }
  setVisible(visible) { this.visible = visible; return this; }
  setDisplaySize(width, height) { this.displayWidth = width; this.displayHeight = height; return this; }
  setTexture(key) { assert.ok(this.textures.exists(key), `切换缺失纹理 ${key}`); this.key = key; return this; }
  add(child) { this.list.push(child); return this; }
  moveTo() { return this; }
  destroy() { this.destroyed = true; this.list.forEach(child => child.destroy()); this.removeAllListeners(); }
}
try {
  await server.ssrLoadModule('/src/alchemy.test.ts');
  const { AlchemyPanel } = await server.ssrLoadModule('/src/AlchemyPanel.ts');
  const { AlchemySystem } = await server.ssrLoadModule('/src/Alchemy.ts');
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { QuestSystem } = await server.ssrLoadModule('/src/QuestSystem.ts');
  const { RECIPES } = await server.ssrLoadModule('/src/data.ts');
  const dataRoot = findRoot(process.cwd()), recipe = RECIPES.recipe_hp_pill;
  const tables = Object.fromEntries(Object.entries({
    alchemy_ui: 'art/icons/ui/alchemy/alchemy_ui.json', hud_ui: 'art/icons/ui/hud/hud_ui.json',
    cult_slices: 'art/icons/ui/ui_bar_cultivation.slices.json', bestiary_ui: 'art/icons/ui/bestiary/bestiary_ui.json',
  }).map(([key, file]) => [key, JSON.parse(fs.readFileSync(path.join(dataRoot, file), 'utf8'))]));
  const frameKey = 'ui_bar_cultivation_frame', qualityKey = 'ui_alchemy_quality_low';
  const cases = [
    { label: '正常关闭按钮', mode: 'click' },
    { label: '缺关闭按钮', missing: ['ui_bestiary_btn_close'], mode: 'idle' },
    { label: '缺关闭悬停图', missing: ['ui_bestiary_btn_close_hover'], mode: 'idle' },
    { label: '缺火候指针', missing: ['ui_alchemy_fire_pointer'] },
    { label: '所有图片缺失', allMissing: true, mode: 'finish' },
    { label: '缺炉火图集但动画存在', missing: ['ui_alchemy_fire'] },
    { label: '缺按钮状态图', missing: ['ui_alchemy_btn_hover', 'ui_alchemy_btn_pressed'], mode: 'brew' },
    { label: '缺修为规格', mutate: cache => { delete cache.cult_slices[frameKey]; } },
    ...['size', 'innerRect'].map(field => ({ label: `修为规格缺 ${field}`, mutate: cache => { delete cache.cult_slices[frameKey][field]; } })),
    { label: '缺品质规格', mode: 'finish', mutate: cache => { delete cache.alchemy_ui[qualityKey]; } },
    { label: '品质规格缺 size', mode: 'finish', mutate: cache => { delete cache.alchemy_ui[qualityKey].size; } },
  ];
  for (const test of cases) {
    const cache = structuredClone(tables); test.mutate?.(cache);
    const missing = new Set(test.missing), displays = [], containers = [], keyboard = new EventEmitter();
    const textures = { exists: key => !test.allMissing && !missing.has(key) && key !== 'icons_items' };
    const add = (x, y, key) => { const display = new Display(x, y, key, textures); displays.push(display); return display; };
    const scene = { scale: { width: 1280, height: 720 }, textures, game: { renderer: { type: 1 } },
      cache: { json: { get: key => cache[key] } }, anims: { exists: () => true }, events: new EventEmitter(),
      input: { keyboard: { on: (event, fn, context) => keyboard.on(event, fn.bind(context)), off() {} } },
      add: { container: (x, y) => { const c = add(x, y); containers.push(c); return c; },
        image: add, sprite: add, zone: (x, y) => add(x, y), text: (x, y) => add(x, y) },
      tweens: { killTweensOf() {}, add() {} }, time: { delayedCall() {} } };
    const p = new Progress(); p.level = 12; p.stones = 100; p.learnedRecipes = [recipe.id];
    recipe.materials.forEach(material => p.addItem(material.item, material.count * 3));
    const system = new AlchemySystem(p, new QuestSystem(p), () => 0), panel = new AlchemyPanel(scene, p, system);
    const idle = ['idle', 'click', 'brew'].includes(test.mode);
    if (!idle) eq(system.start(recipe.id).ok, true, `${test.label}：开炉`);
    panel.open(); eq(panel.isOpen(), true, `${test.label}：打开`);
    if (test.mode === 'brew') {
      const [x, y] = cache.alchemy_ui.detail.buttons.brew;
      const hit = displays.find(d => d.x === x && d.y === y && d.listenerCount('pointerdown'));
      hit.emit('pointerover'); hit.emit('pointerout'); hit.emit('pointerdown');
      eq(!!system.active, true, `${test.label}：真实按钮仍可开炉`);
    }
    const close = displays.findLast(d => d.key === 'ui_bestiary_btn_close');
    close?.emit('pointerover'); close?.emit('pointerout');
    if (test.mode === 'click') {
      close.emit('pointerdown'); eq(panel.isOpen(), false, '正常关闭按钮可点击'); panel.open();
    }
    panel.update(100);
    if (test.mode === 'finish') { eq(panel.skipFire()?.quality, 'low', `${test.label}：成丹后品质文字渲染`); }
    const paid = { stones: p.stones, inventory: { ...p.inventory } };
    let prevented = false;
    const escape = () => keyboard.emit('keydown-ESC', { preventDefault() { prevented = true; } });
    escape(); eq(prevented, true, `${test.label}：ESC 已处理`);
    eq(panel.isOpen(), false, `${test.label}：ESC 关闭`);
    eq(containers.every(c => c.destroyed), true, `${test.label}：容器清理`);
    eq(system.active, null, `${test.label}：无悬挂炉次`);
    eq(p.pendingAlchemy, null, `${test.label}：存档炉次清理`);
    eq(p.stones, paid.stones, `${test.label}：关闭不重复扣燃料`);
    for (const material of recipe.materials) eq(p.count(material.item), paid.inventory[material.item], `${test.label}：关闭不重复扣料`);
    const output = p.count(recipe.output); escape();
    eq(p.count(recipe.output), output, `${test.label}：重复 ESC 不重复结算`);
    eq(output, idle && test.mode !== 'brew' ? 0 : recipe.outputCount, `${test.label}：仅结算一炉`);
  }
  console.log(`alchemy missing-art render tests ok: ${assertions} assertions`);
} finally {
  if (originalStorage === undefined) delete globalThis.localStorage; else globalThis.localStorage = originalStorage;
  await server.close();
}
