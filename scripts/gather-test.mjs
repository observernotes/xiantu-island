import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const server = await createServer({ server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'gather-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0gather-phaser'; },
    load(id) { if (id === '\0gather-phaser') return 'export default {WEBGL:2,GameObjects:{NineSlice:class {}}};'; },
  }], ssr: { noExternal: ['phaser'] } });
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const originalNow = Date.now;
let now = 1000000;
Date.now = () => now;
const saves = {};
globalThis.localStorage = { getItem: k => saves[k] ?? null, setItem: (k, v) => saves[k] = v };
class Display {
  constructor(x, y, key) { Object.assign(this, { x, y, key, visible: true, width: 20, height: 20, anims: {} }); }
  setOrigin() { return this; } setDepth() { return this; } setScrollFactor() { return this; }
  setVisible(v) { this.visible = v; return this; } setName(n) { this.name = n; return this; }
  setStrokeStyle() { return this; } setDisplaySize(w, h) { this.displayWidth = w; this.displayHeight = h; return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; } setTexture(key) { this.key = key; return this; }
  setTint(tint) { this.tint = tint; return this; } clearTint() { delete this.tint; return this; }
  setFillStyle(fill) { this.fill = fill; return this; }
  play(key) { this.anims.currentAnim = { key }; return this; }
  add(children) { (this.children ??= []).push(...(Array.isArray(children) ? children : [children])); return this; }
}
try {
  const { Gathering } = await server.ssrLoadModule('/src/scenes/Gathering.ts');
  const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
  const { ITEMS } = await server.ssrLoadModule('/src/data.ts');
  const dataRoot = findRoot(process.cwd());
  const spec = JSON.parse(fs.readFileSync(path.join(dataRoot, 'art/icons/ui/alchemy/alchemy_ui.json'), 'utf8'));
  const hud = JSON.parse(fs.readFileSync(path.join(dataRoot, 'art/icons/ui/hud/hud_ui.json'), 'utf8'));
  const note = JSON.parse(fs.readFileSync(path.join(dataRoot, 'art/sprites/prop_gather_spirit_herb.anims.json'), 'utf8'));
  const displays = [], timers = [], p = new Progress();
  const add = (x, y, key) => { const d = new Display(x, y, key); displays.push(d); return d; };
  const scene = { prog: p, player: { x: 100, y: 200, feet: 200, body: { width: 28, setVelocityX() {} }, onGround: true, state2: 'ground', dead: false },
    map: { id: 'bamboo_forest', objects: [{ type: 'gather', name: 'herb', x: 100, y: 200, props: { item: 'spirit_herb', castMs: 1, respawnMs: 1 } }] },
    add: { container: add, rectangle: add, sprite: add, image: add, text: add },
    textures: { exists: () => true }, anims: { exists: () => true }, game: { renderer: { type: 1 } },
    cache: { json: { get: key => ({ alchemy_ui: spec, hud_ui: hud, prop_gather_spirit_herb_anims: note })[key] } },
    time: { delayedCall: (_, f) => timers.push(f) }, log() {} };
  const gathering = new Gathering(scene), point = gathering.points[0], bar = displays.find(d => d.name === 'gather:castbar');
  const cfg = ITEMS.spirit_herb.gather;
  eq(point.castMs, cfg.castMs, 'castMs必须读材料表，不读地图覆盖');
  eq(point.respawnMs, cfg.respawnMs, 'respawnMs必须读材料表');
  gathering.update(0, false, false);
  eq(point.prompt.visible, true, '靠近可采点显示键帽');
  gathering.update(cfg.castMs - 1, true, false);
  eq(p.count('spirit_herb'), 0, '读条不足不给物品');
  eq(bar.y, scene.player.y - 88, '读条位于主角y−88');
  eq(scene.player.gathering, true, '读条期间标记gather动作');
  gathering.update(1, false, false);
  eq(p.count('spirit_herb'), 0, '松键中断不给奖励');
  eq(scene.player.gathering, false, '中断恢复动作');
  timers.splice(0).forEach(f => f());
  gathering.update(0, false, false);
  gathering.update(100, true, false);
  scene.player.state2 = 'hurt'; gathering.update(cfg.castMs, true, false);
  eq(p.count('spirit_herb'), 0, '受击中断不给物品');
  gathering.update(cfg.castMs, true, false);
  eq(gathering.active, undefined, '中断后按住键不可自动重开');
  scene.player.state2 = 'ground'; gathering.update(0, false, false);
  gathering.update(cfg.castMs, true, false);
  eq(p.count('spirit_herb'), 1, '完整读条采一株');
  eq(point.sprite.anims.currentAnim.key, 'prop_gather_spirit_herb_harvested', '采后停harvested');
  eq(point.prompt.visible, false, '冷却期间隐藏键帽');
  eq(p.gatherRespawnAt[point.key], now + cfg.respawnMs, '冷却记录绝对时刻');
  eq(JSON.parse(saves.xiantu_save_v1).gatherRespawnAt[point.key], now + cfg.respawnMs, '冷却即时存档');
  gathering.update(cfg.castMs, true, false);
  eq(p.count('spirit_herb'), 1, '采完持续按键不重复发奖');
  scene.prog = Progress.load(); const reloaded = new Gathering(scene);
  eq(reloaded.points[0].ready, false, '读档仍在冷却');
  now += cfg.respawnMs - 1; gathering.update(0, false, false);
  eq(point.ready, false, '刷新前1ms仍不可采');
  now += 1; gathering.update(0, false, false);
  eq(point.ready, true, 'respawnMs到点恢复');
  eq(point.sprite.anims.currentAnim.key, 'prop_gather_spirit_herb_idle', '刷新恢复idle');
  gathering.update(cfg.castMs, true, true);
  eq(gathering.active, undefined, '附近落物/对话优先不开始采集');
  gathering.update(cfg.castMs, true, false, true);
  eq(gathering.active, undefined, '移动期间不能采集');
  console.log(`gather logic ok: ${assertions} assertions`);
} finally { Date.now = originalNow; delete globalThis.localStorage; await server.close(); }
