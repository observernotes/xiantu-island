import assert from 'node:assert/strict';
import { createServer } from 'vite';

// 跑真实 Progress 与 GameScene 开箱/绘制方法，Phaser 只替换渲染对象。
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'chest-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0chest-phaser'; },
    load(id) {
      if (id !== '\0chest-phaser') return;
      return `class Display {
        setOrigin() { return this; } setDepth() { return this; }
        setName(name) { this.name = name; return this; }
        setStrokeStyle() { return this; } setFillStyle(fill) { this.fill = fill; return this; }
      }
      class Sprite extends Display {} class Rectangle extends Display {}
      export default { WEBGL: 2, Scene: class {}, Physics: { Arcade: { Sprite } },
        GameObjects: { Sprite, Rectangle, NineSlice: class {} },
        Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } } };`;
    },
  }], ssr: { noExternal: ['phaser'] },
});
const previousStorage = globalThis.localStorage;
const saves = new Map();
globalThis.localStorage = {
  getItem: key => saves.get(key) ?? null,
  setItem: (key, value) => saves.set(key, value),
  removeItem: key => saves.delete(key),
};
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
try {
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
  const { default: Phaser } = await server.ssrLoadModule('phaser');
  const old = new Progress();
  old.name = '宝匣旧档'; old.stones = 173; old.addItem('spirit_herb', 2);
  old.completedTrials = ['saved_trial'];
  old.save();
  const legacySave = JSON.parse(saves.get('xiantu_save_v1'));
  delete legacySave.openedChests;
  saves.set('xiantu_save_v1', JSON.stringify(legacySave));
  const migrated = Progress.load();
  eq(migrated.openedChests, [], '旧档没有 openedChests 时补空数组');
  eq([migrated.name, migrated.stones, migrated.inventory, migrated.completedTrials],
    [old.name, old.stones, old.inventory, old.completedTrials], '补默认不影响其他存档字段');

  const makeScene = (prog, mapId, props = { loot: 'spirit_herb', count: 2 }, hasTexture = true) => {
    const scene = Object.create(GameScene.prototype), displays = [], drops = [];
    const chest = { type: 'chest', name: 'shared_chest', x: 80, y: 160, props };
    // 故意与存档冲突，验证 registry 的旧 Set 不能决定开箱资格。
    scene.openedChests = new Set([`${mapId}:${chest.name}`]);
    scene.prog = prog; scene.map = { id: mapId, objects: [chest] };
    scene.player = { x: chest.x, y: chest.y };
    scene.textures = { exists: () => hasTexture };
    scene.anims = { exists: () => false };
    scene.add = {
      sprite: () => { const d = new Phaser.GameObjects.Sprite(); displays.push(d); return d; },
      rectangle: (_x, _y, _w, _h, fill) => { const d = new Phaser.GameObjects.Rectangle(); d.fill = fill; displays.push(d); return d; },
    };
    scene.children = { getByName: name => displays.find(d => d.name === name) };
    scene.playPropAnimation = (sprite, key) => { sprite.animation = key; };
    scene.spawnDrop = (...args) => drops.push(args);
    scene.drawObject(chest);
    return { scene, displays, drops };
  };
  const first = makeScene(migrated, 'map_a');
  eq(first.displays[0].animation, 'prop_chest_closed', '存档未开箱时无视 registry 旧状态，显示 closed');
  first.scene.tryOpenChest();
  eq(first.drops, [[80, 130, 'spirit_herb', 2]], '首次开箱正常掉落');
  eq(JSON.parse(saves.get('xiantu_save_v1')).openedChests, ['map_a:shared_chest'], '开箱立即保存地图与箱名');
  first.scene.tryOpenChest();
  eq(first.drops.length, 1, '同会话重复开箱不再掉落');

  const reloaded = Progress.load(), second = makeScene(reloaded, 'map_a');
  eq(reloaded.openedChests, ['map_a:shared_chest'], '保存后重载仍为已开');
  eq(second.displays[0].animation, 'prop_chest_opened', '读档后的宝匣直接显示 opened');
  second.scene.openedChests.clear();
  second.scene.tryOpenChest();
  eq(second.drops.length, 0, '即使清空 registry Set，读档后的已开宝匣也不再掉落');
  const fallback = makeScene(reloaded, 'map_a', undefined, false);
  eq(fallback.displays[0].fill, 0x7a5a3a, '缺图的已开宝匣显示 opened 回退色');

  const otherMap = makeScene(reloaded, 'map_b');
  eq(otherMap.displays[0].animation, 'prop_chest_closed', '不同地图同名宝匣各自保留状态');
  otherMap.scene.tryOpenChest();
  eq(otherMap.drops.length, 1, '不同地图的同名宝匣仍可正常掉落');
  eq(Progress.load().openedChests, ['map_a:shared_chest', 'map_b:shared_chest'], '不同地图同名宝匣各自持久化');

  console.log(`chest save ok: ${assertions} assertions`);
} finally {
  if (previousStorage === undefined) delete globalThis.localStorage;
  else globalThis.localStorage = previousStorage;
  await server.close();
}
