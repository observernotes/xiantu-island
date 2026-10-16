import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import { EventEmitter } from 'node:events';
import { createRequire } from 'node:module';
import ts from 'typescript';

let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const root = new URL('../', import.meta.url);
equal(JSON.parse(await fs.readFile(new URL('data/features.json', root), 'utf8')).talismanCraft, true, 'tip 临时开态 talismanCraft === true');
const transpile = async source => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(`${outputText}\n//# sourceURL=talisman-fx-isolated.js`).toString('base64')}`);
};
const { applySpriteArt } = await transpile(await fs.readFile(new URL('src/SpriteArt.ts', root), 'utf8'));
const source = await fs.readFile(new URL('src/scenes/GameScene.ts', root), 'utf8');
const ast = ts.createSourceFile('GameScene.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const sceneClass = ast.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'GameScene');
const methodNames = ['createTalismanFx', 'syncTalismanFx', 'clearTalismanFx', 'emitTalismanFire', 'updateTalismanUse', 'interruptTalisman', 'setupTalismanUse'];
const members = sceneClass.members.filter(node => ts.isPropertyDeclaration(node) && node.name.getText(ast).startsWith('talisman')
  || ts.isMethodDeclaration(node) && methodNames.includes(node.name.getText(ast)));
for (const name of methodNames) check(members.some(node => node.name.getText(ast) === name), `real GameScene method exists: ${name}`);
// 只抽取真实方法和字段；不加载 Phaser renderer，也不在测试里重写 FX/碰撞逻辑。
const { isolatedScene } = await transpile(`export function isolatedScene(Phaser, applySpriteArt, SPEC, featureEnabled, gameNow, t, HUD_FONT, PAPER, hasHud, TalismanUseSystem, TILED_MAPS, TRIAL_BY_MAP) {
  return class GameScene { ${members.map(node => node.getText(ast)).join('\n')} };
}`);
const cases = [
  ['fx_talisman_fire_projectile', 'fly'], ['fx_talisman_fire_hit', 'hit', true],
  ['fx_talisman_guard_orbit', 'loop'], ['fx_talisman_gather_buff', 'loop'],
  ['fx_talisman_return_cast', 'loop'], ['fx_talisman_return_land', 'land', true],
];
const specs = new Map(await Promise.all(cases.map(async ([atlas]) => [atlas, JSON.parse(await fs.readFile(new URL(`data/art/sprites/${atlas}.anims.json`, root), 'utf8'))])));
const ui = JSON.parse(await fs.readFile(new URL('data/art/icons/ui/talisman/talisman_ui.json', root), 'utf8'));
const require = createRequire(import.meta.url);
const Phaser = { BlendModes: { NORMAL: 0 }, GameObjects: { Events: { DESTROY: 'destroy' } },
  Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete', ANIMATION_COMPLETE_KEY: 'animationcomplete-' } },
  Geom: { Rectangle: require('phaser/src/geom/rectangle/Rectangle.js'),
    Intersects: { RectangleToRectangle: require('phaser/src/geom/intersects/RectangleToRectangle.js') } } };

class DisplayObject extends EventEmitter {
  constructor(scene, kind, x, y, key) {
    super(); Object.assign(this, { scene, kind, x, y, active: true, visible: true, destroys: 0, plays: [] });
    this.texture = { key, frames: { frame: {} }, setFilter() {} };
    this.frame = { realWidth: 64, realHeight: 64 };
  }
  setDepth(depth) { this.depth = depth; return this; }
  setName(name) { this.name = name; return this; }
  setBlendMode(mode) { this.blendMode = mode; return this; }
  setOrigin(x, y = x) { this.origin = [x, y]; return this; }
  setScale(scale) { this.scale = scale; return this; }
  setAlpha(alpha) { this.alpha = alpha; return this; }
  setPosition(x, y) { this.x = x; this.y = y; return this; }
  setFlipX(flip) { this.flipX = flip; return this; }
  setVisible(visible) { this.visible = visible; return this; }
  setScrollFactor(value) { this.scrollFactor = value; return this; }
  setDisplaySize(width, height) { this.displaySize = [width, height]; return this; }
  setText(text) { this.text = text; return this; }
  play(key) { assert.ok(this.scene.anims.exists(key), `unavailable animation was played: ${key}`); this.plays.push(key); return this; }
  destroy() { if (!this.scene) return; this.emit('destroy', this); this.active = false; this.scene = undefined; this.destroys++; this.removeAllListeners(); }
}
function ready() {
  let now = 10_000, enabled = true;
  const textures = new Set([...specs.keys(), ...Object.values(ui.hud.icons)]);
  const animations = new Set([...specs.values()].flatMap(spec => spec.anims.map(anim => anim.key)));
  const animationData = new Map([...specs].flatMap(([atlas, spec]) => spec.anims.map(anim => [anim.key,
    { frames: anim.frames.map(frame => ({ textureKey: atlas, textureFrame: frame })) }])));
  const textureFrames = new Map([...specs].map(([atlas, spec]) => [atlas, new Set(spec.anims.flatMap(anim => anim.frames))]));
  const Scene = isolatedScene(Phaser, applySpriteArt, { bodyH: 64 }, () => enabled, () => now, key => key, 'sans-serif', '#fff',
    (scene, key) => scene.textures.exists(key) && !!ui[key], class { constructor(prog, host) { this.host = host; } }, { town: {} }, {});
  const scene = new Scene(), objects = [], generated = [], damage = [], logs = [], interrupted = [], timers = [], restarts = [];
  const add = kind => (x, y, key) => { const object = new DisplayObject(scene, kind, x, y, key); objects.push(object); return object; };
  Object.assign(scene, {
    textures: { exists: key => textures.has(key), get: key => ({ has: frame => textureFrames.get(key)?.has(frame) }) },
    anims: { exists: key => animations.has(key), get: key => animationData.get(key) },
    cache: { json: { get: key => key === 'talisman_ui' ? ui : specs.get(key.replace(/_anims$/, '')) } },
    add: { sprite: add('sprite'), image: add('image'), text: add('text') },
    make: { graphics: () => {
      const graphics = { fillStyle: () => graphics, fillRect: () => graphics, lineStyle: () => graphics, strokeRect: () => graphics,
        generateTexture(key) { textures.add(key); generated.push(key); }, destroy() {} }; return graphics;
    } },
    player: { active: true, dead: false, x: 100, y: 200, body: { velocity: { x: 0, y: 0 }, setVelocity(x, y) { this.velocity = { x, y }; } } },
    prog: { hp: 100, talismanUse: { version: 1, cooldowns: {}, buffs: [] }, fixedDamageTo: (...args) => { damage.push(args); return 37; } },
    map: { solids: { getChildren: () => scene.solids } }, solids: [], mobs: [],
    time: { now, delayedCall(delay, callback) { const timer = { delay, removed: false, remove() { this.removed = true; }, run() { if (!this.removed) callback(); } }; timers.push(timer); return timer; } },
    scene: { restart: data => restarts.push(data), isActive: () => false },
    talismanUse: { cast: null, update() {}, interrupt(reason) { const hadCast = !!this.cast; this.cast = null; interrupted.push(reason); return hadCast; } },
    keys: Object.fromEntries(['left', 'right', 'up', 'down', 'space', 'alt', 'c', 'r', 'ctrl', 'x', 'a', 's', 'd', 'f', 'g', 'h', 'q', 'w'].map(key => [key, { isDown: false }])),
    log: (...args) => logs.push(args), damageNumber() {},
  });
  return { scene, objects, textures, animations, animationData, textureFrames, generated, damage, interrupted, timers, restarts,
    advance(ms) { now += ms; scene.time.now = now; }, now: () => now, disable() { enabled = false; } };
}
const effect = facing => ({ type: 'talisman_fire', element: 'fire', baseDamage: 60, projectileSpeed: 360, rangePx: 240, hitWidth: 18, hitHeight: 24, facing });
const body = (x, y, width = 16, height = 32) => ({ x, y, width, height, left: x, right: x + width });
const monster = x => ({ x, y: 184, dead: false, body: body(x, 152), def: { level: 15, def: 3 }, hits: [],
  takeHit(...args) { this.hits.push(args); } });
const buffs = now => [
  { itemId: 'talisman_guard', buffId: 'buff_talisman_guard', quality: 'low', expireAt: now + 1000 },
  { itemId: 'talisman_gather', buffId: 'buff_talisman_gather', quality: 'high', expireAt: now + 5000 },
];
const matching = (f, atlas) => f.objects.filter(object => object.texture.key === atlas);

for (const [atlas, phase, once = false] of cases) {
  const f = ready(), sprite = f.scene.createTalismanFx(atlas, phase, 11, 22, once);
  equal(sprite?.plays, [`${atlas}_${phase}`], `${atlas}: plays registered atlas animation`);
  equal([sprite.origin, sprite.blendMode, sprite.depth, sprite.name], [specs.get(atlas).origin, Phaser.BlendModes.NORMAL, 12, atlas], `${atlas}: honors art origin and NORMAL blend`);
  sprite.emit('animationcomplete');
  equal(sprite.active, !once, `${atlas}: only one-shot FX auto-destroy`);
  equal(f.scene.talismanFx.has(sprite), !once, `${atlas}: completed one-shot leaves tracking set`);
  for (const missing of ['texture', 'animation']) {
    const absent = ready();
    (missing === 'texture' ? absent.textures : absent.animations).delete(missing === 'texture' ? atlas : `${atlas}_${phase}`);
    equal(absent.scene.createTalismanFx(atlas, phase, 11, 22, once), undefined, `${atlas}: missing ${missing} is optional`);
    equal(absent.objects.length, 0, `${atlas}: missing ${missing} creates no object`);
  }
}
for (const malformed of ['empty', 'wrong-atlas', 'missing-frame']) {
  const f = ready(), atlas = 'fx_talisman_return_land', key = `${atlas}_land`;
  if (malformed === 'empty') f.animationData.get(key).frames = [];
  else if (malformed === 'wrong-atlas') f.animationData.get(key).frames[0].textureKey = 'missing';
  else f.textureFrames.get(atlas).clear();
  equal(f.scene.createTalismanFx(atlas, 'land', 0, 0, true), undefined, `${malformed} animation is optional`);
  equal(f.objects.length, 0, `${malformed} animation leaves no broken sprite`);
}

for (const facing of [-1, 1]) {
  const f = ready(), rollback = f.scene.emitTalismanFire(effect(facing)), sprite = f.scene.talismanProjectiles[0].sprite;
  equal([sprite.texture.key, sprite.flipX, sprite.x, sprite.y], ['fx_talisman_fire_projectile', facing > 0, 100, 168], 'fire atlas follows projectile direction and body center');
  check(typeof rollback === 'function', 'fire emission returns transaction rollback');
  rollback(); equal([sprite.active, f.scene.talismanProjectiles.length], [false, 0], 'rollback destroys and removes atlas projectile');
}
for (const missing of ['texture', 'animation']) {
  const f = ready();
  (missing === 'texture' ? f.textures : f.animations).delete(missing === 'texture' ? 'fx_talisman_fire_projectile' : 'fx_talisman_fire_projectile_fly');
  const rollback = f.scene.emitTalismanFire(effect(1));
  equal(f.scene.talismanProjectiles[0].sprite.texture.key, 'fx_talisman_fire_fallback', `missing projectile ${missing}: preserves yellow fallback`);
  f.scene.emitTalismanFire(effect(-1)); equal(f.generated, ['fx_talisman_fire_fallback'], 'fallback texture is generated once');
  rollback(); equal(f.scene.talismanProjectiles.length, 1, 'fallback rollback removes only its own projectile');
}
for (const state of ['inactive', 'dead']) {
  const f = ready(); if (state === 'inactive') f.scene.player.active = false; else f.scene.player.dead = true;
  equal(f.scene.emitTalismanFire(effect(1)), false, `${state} player cannot emit`); equal(f.objects.length, 0, `${state} player leaves no FX`);
}

for (const missingHit of [false, true]) {
  const f = ready(), first = monster(140), second = monster(190); f.scene.mobs = [second, first];
  if (missingHit) f.textures.delete('fx_talisman_fire_hit');
  f.scene.emitTalismanFire(effect(1)); f.scene.updateTalismanUse(500); f.scene.updateTalismanUse(500);
  equal([first.hits.length, second.hits.length, f.scene.talismanProjectiles.length], [1, 0, 0], 'fire damages only the first enemy once and removes projectile');
  equal(f.damage, [[60, 15, 3]], 'fire reuses configured damage through defense pipeline');
  equal(first.hits[0], [10_000, 37, 1], 'first enemy receives resolved damage and facing');
  equal(matching(f, 'fx_talisman_fire_hit').length, missingHit ? 0 : 1, 'enemy hit FX remains optional');
}
for (const stop of ['wall', 'range']) {
  const f = ready(), target = monster(150); f.scene.mobs = [target];
  if (stop === 'wall') f.scene.solids.push({ body: body(120, 140, 16, 64) });
  f.scene.emitTalismanFire({ ...effect(1), ...(stop === 'range' ? { rangePx: 10 } : {}) }); f.scene.updateTalismanUse(500);
  equal([target.hits.length, f.scene.talismanProjectiles.length, matching(f, 'fx_talisman_fire_hit').length], [0, 0, 0], `${stop} destroys projectile without enemy hit or hit FX`);
}

{
  const f = ready(); f.scene.prog.talismanUse.buffs = buffs(f.now()); f.scene.syncTalismanFx();
  equal([f.scene.talismanBuffFx.size, f.scene.talismanBuffIcons.size], [2, 2], 'guard and gather create atlas loops and configured HUD icons');
  const guard = matching(f, 'fx_talisman_guard_orbit')[0], gather = matching(f, 'fx_talisman_gather_buff')[0];
  const before = [guard.x, guard.y, gather.x, gather.y], count = f.objects.length;
  f.scene.player.x += 30; f.scene.player.y += 40;
  f.scene.prog.talismanUse.buffs = buffs(f.now() + 500); f.scene.syncTalismanFx();
  equal([guard.x, guard.y, gather.x, gather.y], [before[0] + 30, before[1] + 40, before[2] + 30, before[3] + 40], 'buff FX follow player');
  equal(f.objects.length, count, 'buff refresh updates existing instances without stacking');
  f.advance(1500); f.scene.syncTalismanFx();
  equal([guard.plays.at(-1), gather.active, f.scene.talismanBuffFx.size, f.scene.talismanBuffIcons.size], ['fx_talisman_guard_orbit_end', true, 1, 1], 'exact expiry removes guard loop and icon while gather remains');
  guard.emit('animationcomplete'); equal(guard.active, false, 'guard end animation destroys expired sprite');
  equal(f.scene.prog.talismanUse.buffs.length, 2, 'FX cleanup does not mutate logical buff state');
}
{
  const f = ready(); f.scene.prog.talismanUse.buffs = buffs(f.now()); f.scene.syncTalismanFx();
  const guard = matching(f, 'fx_talisman_guard_orbit')[0], gather = matching(f, 'fx_talisman_gather_buff')[0];
  // TalismanUse.onDeath 已由 talisman-use.test.ts 覆盖；这里模拟其删护、保聚后的真实视觉同步。
  f.scene.prog.talismanUse.buffs = f.scene.prog.talismanUse.buffs.filter(buff => buff.itemId !== 'talisman_guard');
  f.scene.player.dead = true; f.scene.syncTalismanFx(); guard.emit('animationcomplete');
  equal([guard.active, gather.active, f.scene.talismanBuffFx.size, f.scene.talismanBuffIcons.size], [false, true, 1, 1], 'death removes guard and preserves gather until its original expiry');
}
{
  const f = ready(); f.textures.delete('fx_talisman_guard_orbit'); f.animations.delete('fx_talisman_gather_buff_loop');
  for (const key of Object.values(ui.hud.icons)) f.textures.delete(key);
  f.scene.prog.talismanUse.buffs = buffs(f.now()); f.scene.syncTalismanFx();
  equal([f.scene.talismanBuffFx.size, f.scene.talismanBuffIcons.size, f.scene.prog.talismanUse.buffs.length], [0, 0, 2], 'missing buff atlases/animations/icons preserve pure logic without FX');
}
{
  const f = ready(); f.scene.talismanUse.cast = { endsAt: f.now() + 3000, destination: { mapId: 'town' } };
  f.scene.updateTalismanUse(0); const castFx = matching(f, 'fx_talisman_return_cast')[0];
  equal(castFx?.plays, ['fx_talisman_return_cast_loop'], 'active return cast plays atlas loop');
  f.scene.keys.left.isDown = true; f.scene.updateTalismanUse(0);
  equal([f.scene.talismanUse.cast, castFx.active, f.scene.talismanReturnFx], [null, false, undefined], 'movement cancellation clears return cast FX');
  equal(f.interrupted, ['move'], 'movement uses existing interruption hook');
}
{
  const f = ready(); f.scene.prog.talismanUse.buffs = buffs(f.now());
  f.scene.talismanUse.cast = { endsAt: f.now() + 3000, destination: { mapId: 'town' } };
  f.scene.emitTalismanFire(effect(1)); f.scene.syncTalismanFx();
  f.scene.createTalismanFx('fx_talisman_return_land', 'land', 100, 200, true);
  const owned = f.objects.filter(object => object.kind !== 'text');
  f.disable(); f.scene.updateTalismanUse(16); f.scene.clearTalismanFx();
  equal([f.scene.talismanProjectiles.length, f.scene.talismanBuffFx.size, f.scene.talismanBuffIcons.size, f.scene.talismanReturnFx, f.scene.talismanFx.size], [0, 0, 0, undefined, 0], 'feature off clears all owned FX references and cleanup is repeatable');
  check(owned.every(object => !object.active), 'feature off destroys projectiles, buffs, icons, return cast and unfinished landing FX');
}
{
  const f = ready(); f.scene.setupTalismanUse(); const host = f.scene.talismanUse.host, destination = { mapId: 'town', x: 128, y: 832 };
  const rollback = host.teleport(destination);
  equal([f.restarts.length, f.timers[0].delay], [0, 0], 'return schedules restart after save transaction');
  rollback(); f.timers[0].run(); equal(f.restarts.length, 0, 'save rollback cancels return landing transition');
  host.teleport(destination); f.timers[1].run();
  equal(f.restarts, [{ map: 'town', pos: { x: 128, y: 832 }, talismanReturnLand: true }], 'committed return carries one-shot landing FX marker to destination scene');
  equal(host.teleport(destination), false, 'travelling scene cannot queue a second return');
}
console.log(JSON.stringify({ suite: 'talisman-fx', passed: true, assertions }));
