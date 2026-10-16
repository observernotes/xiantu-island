import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash } from 'node:crypto';
import { EventEmitter } from 'node:events';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';

const root = fileURLToPath(new URL('../', import.meta.url));
const dataRoot = findRoot(root);
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const required = ['prop_chest_hidden', 'prop_secret_door', 'prop_campfire', 'prop_spirit_spring',
  'prop_secret_stele', 'prop_secret_furnace', 'prop_trap_spikes', 'prop_trap_thorns', 'prop_trap_lava', 'fx_elite_aura'];
const chestHashes = {
  png: 'fb615b17a8d2803283b0a046e6f14ac49411fd9e6755d3659a52a266680664c6',
  json: '8390287dda46f54f35b3df75758b71fa92a2682b9ae2f39e960f95ff17b19d6f',
  'anims.json': 'b168d5ec5ce2c4e6d808fd8bdb48070c73d196d7a4e5e49fe7f4ae1685ea2827',
};

// 实际 GameScene / MapBuilder 只替换 Phaser 渲染宿主，保留真实方法与数据导入。
const server = await createServer({
  server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
  plugins: [{ name: 'secret-props-render-stub', enforce: 'pre',
    resolveId(id) { if (id === 'phaser') return '\0secret-props-phaser'; },
    load(id) {
      if (id !== '\0secret-props-phaser') return;
      return `class Sprite {} class Rectangle {} export default {
        WEBGL: 2, Scene: class {}, Physics: { Arcade: { Sprite } },
        GameObjects: { Sprite, Rectangle, NineSlice: class {} },
        Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } }, BlendModes: { NORMAL: 0 }
      };`;
    },
  }], ssr: { noExternal: ['phaser'] },
});

try {
  const api = await server.ssrLoadModule('/src/SecretProps.ts');
  const { ATLASES, SENSE, ITEMS } = await server.ssrLoadModule('/src/data.ts');
  const { GameScene } = await server.ssrLoadModule('/src/scenes/GameScene.ts');
  const { buildTiledMap, parseHiddenObjects } = await server.ssrLoadModule('/src/scenes/MapBuilder.ts');
  const { SenseMapAdapter } = await server.ssrLoadModule('/src/scenes/SenseScene.ts');
  const { setFeatureFlag, featureEnabled } = await server.ssrLoadModule('/src/features.ts');
  const { default: Phaser } = await server.ssrLoadModule('phaser');
  const { default: rooms } = await server.ssrLoadModule(`/@fs/${dataRoot}/balance/secret_rooms.json`);
  equal([...api.SECRET_PROP_ATLASES].sort(), [...required].sort(), 'module lists exactly ten new atlases');
  const specs = new Map();
  let missingFiles = 0;
  for (const atlas of [...required, 'prop_chest']) {
    check(ATLASES.includes(atlas), `ATLASES includes ${atlas}`);
    for (const ext of ['png', 'json', 'anims.json']) {
      const file = path.join(root, 'public/art/sprites', `${atlas}.${ext}`);
      const bytes = await fs.readFile(file).catch(() => { missingFiles++; return undefined; });
      check(bytes?.length, `synced triplet exists: ${atlas}.${ext}`);
      if (atlas === 'prop_chest') equal(createHash('sha256').update(bytes).digest('hex'), chestHashes[ext], `ordinary chest ${ext} unchanged`);
    }
    const spec = JSON.parse(await fs.readFile(path.join(root, 'public/art/sprites', `${atlas}.anims.json`), 'utf8'));
    const atlasData = JSON.parse(await fs.readFile(path.join(root, 'public/art/sprites', `${atlas}.json`), 'utf8'));
    equal(spec.atlas, atlas, `${atlas}: animation metadata targets its own atlas`);
    for (const anim of spec.anims) for (const frame of anim.frames)
      check(Object.hasOwn(atlasData.frames, frame), `${anim.key}: frame ${frame} exists`);
    specs.set(atlas, spec);
  }
  for (const [ext, hash] of Object.entries(chestHashes))
    equal(createHash('sha256').update(await fs.readFile(path.join(dataRoot, 'art/sprites', `prop_chest.${ext}`))).digest('hex'), hash,
      `source ordinary chest ${ext} unchanged`);
  equal(missingFiles, 0, 'all eleven atlas triplets have zero missing files');

  const object = (type, props = {}) => ({ type, props });
  const visual = (atlas, state = 'idle') => ({ atlas, state });
  for (const hidden of [undefined, false, 0, 1, 'true', null])
    equal(api.resolveSecretProp(object('chest', { hidden })), visual('prop_chest', 'closed'), `hidden=${String(hidden)} remains ordinary chest`);
  equal(api.resolveSecretProp(object('chest', { hidden: true })), visual('prop_chest_hidden', 'hidden'), 'strict true selects hidden atlas/state');
  equal(api.resolveSecretProp(object('chest', { hidden: true }), undefined, { revealed: true }), visual('prop_chest_hidden', 'closed'), 'revealed chest restores closed');
  equal(api.resolveSecretProp(object('chest', { hidden: true }), undefined, { opened: true }), visual('prop_chest_hidden', 'opened'), 'opened chest restores opened');
  for (const ratio of [45, 49.5, 50]) equal(api.resolveSecretProp(object('restPoint', { healRatio: ratio })), visual('prop_campfire'), `healRatio ${ratio} uses campfire`);
  for (const ratio of [30, 34.5, 35]) equal(api.resolveSecretProp(object('restPoint', { healRatio: ratio, rerollBoon: true })), visual('prop_spirit_spring'), `healRatio ${ratio} plus reroll uses spring`);
  for (const props of [{ healRatio: 30 }, { healRatio: 40, rerollBoon: true }, { healRatio: '50' }, { healRatio: NaN }, { healRatio: Infinity }])
    equal(api.resolveSecretProp(object('restPoint', props)), undefined, 'unmapped rest points remain unmapped');
  for (const [kind, atlas] of [['stele', 'prop_secret_stele'], ['cauldron', 'prop_secret_furnace']])
    equal(api.resolveSecretProp(object('event', { kind })), visual(atlas), `${kind} event uses matching atlas`);
  equal(api.resolveSecretProp(object('event', { kind: 'wanderer' })), undefined, 'wanderer has no invented art key');
  equal(api.resolveSecretProp(object('roomDoor', { lock: 'clear' })), visual('prop_secret_door', 'closed'), 'clear-lock door remains closed without gameplay gate');
  for (const [theme, atlas] of [[undefined, 'prop_trap_spikes'], ['unknown_theme', 'prop_trap_spikes'], ['wanyao_nest', 'prop_trap_thorns'], ['chiyan_cavern', 'prop_trap_lava']]) {
    equal(api.trapAtlasForTheme(theme), atlas, `${theme}: table-driven trap skin`);
    equal(api.resolveSecretProp(object('zone', { hazard: 'trap' }), theme), visual(atlas), `${theme}: trap zone maps correctly`);
  }
  rooms.themes.ui_test_unknown_skin = { trapSkin: 'unregistered_skin' };
  try { equal(api.trapAtlasForTheme('ui_test_unknown_skin'), 'prop_trap_spikes', 'unknown trapSkin falls back to spikes'); }
  finally { delete rooms.themes.ui_test_unknown_skin; }
  equal(api.resolveSecretProp(object('zone', { hazard: 'water' })), undefined, 'non-trap zone gets no trap art');
  const forbidSprite = target => new Proxy(target, { get(host, key) {
    if (key === 'sprite') throw new Error('invented sprite property read');
    return Reflect.get(host, key);
  } });
  const guarded = forbidSprite(object('chest', forbidSprite({})));
  equal(api.resolveSecretProp(guarded), visual('prop_chest', 'closed'), 'mapping never reads invented sprite fields');

  class Display extends EventEmitter {
    constructor(scene, x, y, key) {
      super(); Object.assign(this, { scene, x, y, active: true, visible: true, alpha: 1, depth: 0, originX: 0.5, originY: 1,
        scaleX: 1, scaleY: 1, displayWidth: 96, displayHeight: 96, plays: [], data: new Map(), destroys: 0 });
      const spec = specs.get(key), frames = new Set(spec?.anims.flatMap(anim => anim.frames));
      this.texture = { key, has: frame => frames.has(frame), firstFrame: frames.values().next().value };
      this.anims = { stop: () => { this.stopped = true; } };
    }
    setData(key, value) { this.data.set(key, value); return this; }
    getData(key) { return this.data.get(key); }
    setOrigin(x, y = x) { this.originX = x; this.originY = y; return this; }
    setDepth(value) { this.depth = value; return this; }
    setName(value) { this.name = value; return this; }
    setScale(x, y = x) { this.scaleX = x; this.scaleY = y; return this; }
    setPosition(x, y) { this.x = x; this.y = y; return this; }
    setAlpha(value) { this.alpha = value; return this; }
    setVisible(value) { this.visible = value; return this; }
    setFrame(value) { this.frame = value; return this; }
    setStrokeStyle() { return this; }
    setFillStyle(value) { this.fill = value; return this; }
    play(key) { check(this.scene.anims.exists(key), `only registered animation may play: ${key}`); this.plays.push(key); return this; }
    destroy() { if (!this.active) return; this.emit('destroy', this); this.active = false; this.destroys++; this.removeAllListeners(); }
  }
  // instanceof checks in real GameScene use the stub Phaser class.
  Object.setPrototypeOf(Display.prototype, Object.create(Phaser.GameObjects.Sprite.prototype,
    Object.getOwnPropertyDescriptors(EventEmitter.prototype)));
  const ready = () => {
    const scene = Object.create(GameScene.prototype), displays = [], textures = new Set(specs.keys());
    const animations = new Set([...specs.values()].flatMap(spec => spec.anims.map(anim => anim.key)));
    Object.assign(scene, {
      events: new EventEmitter(), textures: { exists: key => textures.has(key) }, anims: { exists: key => animations.has(key) },
      senseMap: { bindVisual() {}, objectVisible: () => true }, prog: { openedChests: [], senseRevealed: [], isChestOpened: () => false },
      map: { id: 'secret_fixture', objects: [], zones: [] },
      add: { sprite: (x, y, key) => { const sprite = new Display(scene, x, y, key); displays.push(sprite); return sprite; },
        rectangle: (x, y, w, h, fill) => { const rectangle = new Display(scene, x, y); rectangle.fill = fill; displays.push(rectangle); return rectangle; } },
    });
    return { scene, displays, textures, animations, sprite: atlas => scene.add.sprite(100, 200, atlas) };
  };
  const state = sprite => sprite.getData('propAnimation');
  const complete = sprite => { const key = state(sprite); sprite.emit(`animationcomplete-${key}`, { key }); };
  {
    const f = ready(), sprite = f.sprite('prop_chest_hidden');
    api.playPropAnimation(f.scene, sprite, 'prop_chest_hidden_hidden');
    api.revealHiddenChest(f.scene, sprite); api.revealHiddenChest(f.scene, sprite);
    equal(sprite.plays, ['prop_chest_hidden_hidden', 'prop_chest_hidden_reveal'], 'reveal is idempotent while playing');
    complete(sprite); equal(state(sprite), 'prop_chest_hidden_closed', 'reveal settles closed');
    api.openPropChest(f.scene, sprite, 'prop_chest_hidden'); complete(sprite);
    equal(state(sprite), 'prop_chest_hidden_opened', 'hidden chest settles opened');
    api.revealHiddenChest(f.scene, sprite); api.openPropChest(f.scene, sprite, 'prop_chest_hidden');
    equal(sprite.plays, ['prop_chest_hidden_hidden', 'prop_chest_hidden_reveal', 'prop_chest_hidden_closed', 'prop_chest_hidden_open', 'prop_chest_hidden_opened'], 'full state sequence does not regress after opened');
  }
  for (const fromHidden of [false, true]) {
    const f = ready(), sprite = f.sprite('prop_chest_hidden');
    api.playPropAnimation(f.scene, sprite, 'prop_chest_hidden_hidden');
    if (!fromHidden) api.revealHiddenChest(f.scene, sprite);
    api.openPropChest(f.scene, sprite); api.openPropChest(f.scene, sprite);
    equal(state(sprite), 'prop_chest_hidden_reveal', 'opening during hidden/reveal queues behind reveal');
    complete(sprite); equal(state(sprite), 'prop_chest_hidden_open', 'queued opening follows closed');
    sprite.emit('animationcomplete-prop_chest_hidden_reveal'); equal(state(sprite), 'prop_chest_hidden_open', 'stale reveal completion cannot overwrite open');
    complete(sprite); equal(state(sprite), 'prop_chest_hidden_opened', 'queued opening settles opened');
    equal(sprite.plays, ['prop_chest_hidden_hidden', 'prop_chest_hidden_reveal', 'prop_chest_hidden_closed', 'prop_chest_hidden_open', 'prop_chest_hidden_opened'], 'queued opening retains every transition once');
  }
  for (const [atlas, initial, action, transitional, settled] of [
    ['prop_chest', 'closed', api.openPropChest, 'open', 'opened'],
    ['prop_secret_door', 'closed', api.openSecretDoor, 'opening', 'open'],
    ...['spikes', 'thorns', 'lava'].map(skin => [`prop_trap_${skin}`, 'idle', api.triggerSecretTrap, 'trigger', 'idle']),
  ]) {
    const f = ready(), sprite = f.sprite(atlas);
    api.playPropAnimation(f.scene, sprite, `${atlas}_${initial}`); action(f.scene, sprite); action(f.scene, sprite);
    equal(state(sprite), `${atlas}_${transitional}`, `${atlas} enters transition`);
    equal(sprite.plays.filter(key => key === `${atlas}_${transitional}`).length, 1, `${atlas} ignores duplicate transition`);
    complete(sprite); equal(state(sprite), `${atlas}_${settled}`, `${atlas} settles correctly`);
    const missing = ready(), fallback = missing.sprite(atlas); missing.animations.delete(`${atlas}_${transitional}`);
    action(missing.scene, fallback); equal(state(fallback), `${atlas}_${settled}`, `${atlas} missing transition falls back safely`);
  }
  {
    const f = ready(), sprite = f.sprite('prop_chest_hidden'); f.animations.clear();
    api.revealHiddenChest(f.scene, sprite); equal(state(sprite), 'prop_chest_hidden_closed', 'missing reveal animation settles closed');
    api.openPropChest(f.scene, sprite); equal(state(sprite), 'prop_chest_hidden_opened', 'missing open animation settles opened');
    equal(sprite.frame, 'prop_chest_hidden_opened_01', 'missing animations use known static frame');
  }
  {
    const f = ready(), sprite = f.sprite('prop_chest_hidden');
    api.revealHiddenChest(f.scene, sprite); sprite.destroy();
    equal(sprite.listenerCount('animationcomplete-prop_chest_hidden_reveal'), 0, 'destroying a prop removes pending transition callback');
    const direct = f.sprite('prop_secret_door'); api.openSecretDoor(f.scene, direct);
    api.playPropAnimation(f.scene, direct, 'prop_secret_door_closed');
    direct.emit('animationcomplete-prop_secret_door_opening');
    equal(state(direct), 'prop_secret_door_closed', 'explicit state switch cancels stale transition callback');
  }
  for (const termination of ['monster', 'aura', 'shutdown', 'scene']) {
    const f = ready(), monster = f.sprite('prop_chest'); Object.assign(monster, { x: 100, y: 200, originX: 0.25, originY: 0.5, displayWidth: 80, displayHeight: 100, scaleX: 0.625, scaleY: 0.625, depth: 12 });
    const aura = api.attachEliteAura(f.scene, monster);
    equal([aura.x, aura.y, aura.originX, aura.originY, aura.depth, aura.scaleX], [120, 250, 0.5, 1, 11, 1], 'aura uses foot center and natural initial size for scaled art');
    equal(api.attachEliteAura(f.scene, monster), aura, 'aura attaches once');
    Object.assign(monster, { x: 150, y: 260, scaleX: -1.25, scaleY: 1.25, visible: false, alpha: 0.4, depth: 14 }); f.scene.events.emit('postupdate');
    equal([aura.x, aura.y, aura.scaleX, aura.scaleY, aura.visible, aura.alpha, aura.depth], [170, 310, 2, 2, false, 0.4, 13], 'aura follows feet, relative scale, visibility, alpha and depth');
    if (termination === 'monster') monster.destroy(); else if (termination === 'aura') aura.destroy(); else f.scene.events.emit(termination === 'scene' ? 'destroy' : termination);
    equal([aura.active, aura.destroys, f.scene.events.listenerCount('postupdate'), monster.listenerCount('destroy')], [false, 1, 0, 0], `${termination} cleanup removes aura and follow listeners`);
  }
  {
    const f = ready(); f.textures.delete('fx_elite_aura');
    equal(api.attachEliteAura(f.scene, f.sprite('prop_chest')), undefined, 'missing aura texture skips safely');
    const missingAnimation = ready(); missingAnimation.animations.delete('fx_elite_aura_idle');
    equal(api.attachEliteAura(missingAnimation.scene, missingAnimation.sprite('prop_chest')).frame, 'fx_elite_aura_idle_01', 'missing aura animation uses a static frame');
  }
  {
    // 仅在内存启用 fixture 配置，finally 恢复；不写 features、数值或存档文件。
    const previous = structuredClone(SENSE), previousFlag = featureEnabled('spiritScan');
    try {
      setFeatureFlag('spiritScan', true); SENSE.enabled = true;
      for (const profile of SENSE.targetProfiles) profile.enabled = true;
      const native = { type: 'chest', name: 'native', x: 100, y: 100, w: 0, h: 0, props: { hidden: true, loot: Object.keys(ITEMS)[0] } };
      const platform = { type: 'hidden', name: 'platform', x: 80, y: 100, w: 40, h: 8, props: { reveal: 'platform', reqSpirit: 0 } };
      const control = { type: 'hidden', name: 'hidden', x: 100, y: 100, w: 0, h: 0, props: { reveal: 'chest', reqSpirit: 0, targetObject: 'native' } };
      const objects = [platform, native, control];
      const basicVisual = () => ({ scene: {}, visible: true, body: { enable: true, checkCollision: {} },
        setVisible(v) { this.visible = v; return this; }, setName() { return this; }, setOrigin() { return this; },
        setDepth() { return this; }, setAlpha() { return this; }, add() { return this; } });
      const f = ready(), scene = f.scene;
      scene.prog.openedChests = []; scene.prog.senseRevealed = {};
      scene.map = { id: 'fixture', width: 1000, height: 1000, objects, hidden: parseHiddenObjects(objects), oneWays: { add() {} }, useTiles: false };
      scene.add.zone = basicVisual; scene.add.container = basicVisual;
      const adapter = new SenseMapAdapter(scene), art = f.sprite('prop_chest_hidden');
      adapter.bindVisual(native, art);
      equal([art.visible, state(art)], [false, 'prop_chest_hidden_hidden'], 'Sense initial hidden chest is concealed');
      scene.prog.senseRevealed = { 'fixture|platform': true, 'fixture|hidden': true };
      for (const target of adapter.targets()) target.applyReveal();
      equal([art.visible, state(art)], [true, 'prop_chest_hidden_reveal'], 'platform-first callbacks preserve chest reveal');
      const plays = [...art.plays]; adapter.syncRevealed(); adapter.syncRevealed();
      equal(art.plays, plays, 'Sense repeated sync preserves active reveal');
      complete(art); equal(state(art), 'prop_chest_hidden_closed', 'Sense reveal settles closed');
      const loaded = new SenseMapAdapter(scene), loadedArt = f.sprite('prop_chest_hidden'); loaded.bindVisual(native, loadedArt);
      equal(loadedArt.plays, ['prop_chest_hidden_closed'], 'Sense saved reveal restores closed without replay');
      loaded.syncRevealed(); equal(loadedArt.plays, ['prop_chest_hidden_closed'], 'Sense restored sync does not replay');
      scene.prog.openedChests = ['fixture:native'];
      const opened = new SenseMapAdapter(scene), openedArt = f.sprite('prop_chest_hidden'); opened.bindVisual(native, openedArt);
      equal(openedArt.plays, ['prop_chest_hidden_opened'], 'Sense saved opened chest restores opened');
      const direct = { ...native, name: 'direct' }; scene.map.objects.push(direct);
      const directArt = f.sprite('prop_chest_hidden'); opened.bindVisual(direct, directArt);
      equal(state(directArt), 'prop_chest_hidden_hidden', 'direct hidden prop needs an existing reveal controller');
      const rectangle = basicVisual(); opened.bindVisual(native, rectangle); opened.syncRevealed();
      equal(rectangle.visible, true, 'setVisible-only fallback remains supported');
    } finally { Object.assign(SENSE, previous); setFeatureFlag('spiritScan', previousFlag); }
  }

  // 真实 25 房通过生产 MapBuilder 解析，再调用生产 GameScene 视觉路径；不注册抽房或伤害玩法。
  const graphics = () => new Proxy({}, { get: (_target, key) => key === 'destroy' ? () => {} : () => graphics() });
  const parserScene = { textures: { exists: () => false }, physics: { add: { staticGroup: () => ({ add() {} }) } }, add: {
    graphics, rectangle: () => ({ setOrigin() { return this; }, setDepth() { return this; } }),
    zone: () => ({ body: { checkCollision: {} } }),
  } };
  const files = (await fs.readdir(path.join(dataRoot, 'maps/secret_rooms'))).filter(file => file.endsWith('.json')).sort();
  equal(files.length, 25, 'all twenty-five authoritative room fixtures are present');
  let mapped = 0, traps = 0, hidden = 0, elites = 0;
  for (const file of files) {
    const raw = JSON.parse(await fs.readFile(path.join(dataRoot, 'maps/secret_rooms', file), 'utf8'));
    const snapshot = JSON.stringify(raw), map = buildTiledMap(parserScene, raw);
    for (const layer of raw.layers.filter(layer => layer.type === 'objectgroup')) for (const obj of layer.objects) {
      check(!Object.hasOwn(obj, 'sprite') && !(obj.properties ?? []).some(prop => prop.name === 'sprite'), `${file}: fixture has no sprite field`);
    }
    for (const theme of [undefined, 'wanyao_nest', 'chiyan_cavern']) {
      const f = ready(); f.scene.map = map;
      for (const obj of map.objects) {
        const expected = api.resolveSecretProp(obj, theme), before = f.displays.length;
        f.scene.drawObject(obj, theme);
        if (!expected) continue;
        const sprite = f.displays[before]; check(sprite, `${file}/${obj.name}: actual draw creates visual`);
        equal([sprite.texture.key, state(sprite), sprite.originX, sprite.originY], [expected.atlas, `${expected.atlas}_${expected.state}`, 0.5, 1], `${file}/${obj.name}: actual draw honors atlas, initial animation and feet`);
        mapped++;
        if (obj.props.hidden === true && theme === undefined) hidden++;
        const missing = ready(); missing.scene.map = map; missing.textures.delete(expected.atlas);
        missing.scene.drawObject(obj, theme);
        if (obj.type !== 'chest') equal(missing.displays.length, 0, `${file}/${obj.name}: missing optional texture skips visual`);
      }
      const before = f.displays.length; f.scene.drawSecretTrapZones(theme);
      const zones = map.zones.filter(zone => zone.props.hazard === 'trap');
      const expectedTiles = zones.reduce((sum, zone) => sum + Math.max(1, Math.ceil(zone.w / 64)), 0);
      equal(f.displays.length - before, expectedTiles, `${file}/${theme}: actual trap path covers zone width`);
      for (const sprite of f.displays.slice(before)) {
        equal([sprite.texture.key, state(sprite)], [api.trapAtlasForTheme(theme), `${api.trapAtlasForTheme(theme)}_idle`], `${file}: actual zone uses theme skin and idle`); traps++;
      }
      const missing = ready(); missing.scene.map = map; missing.textures.delete(api.trapAtlasForTheme(theme)); missing.scene.drawSecretTrapZones(theme);
      equal(missing.displays.length, 0, `${file}/${theme}: missing trap texture skips safely`);
    }
    for (const slot of map.objects.filter(obj => obj.type === 'slot' && obj.props.role === 'elite')) {
      const f = ready(), monster = f.sprite('prop_chest'); monster.setPosition(slot.x, slot.y).setScale(rooms.monster.elite.sizeMul);
      equal(rooms.monster.elite.sizeMul, 1.25, 'authoritative elite size remains 1.25');
      check(rooms.monster.elite.aura, 'authoritative elite aura enabled');
      const aura = api.attachEliteAura(f.scene, monster); equal([aura.x, aura.y, state(aura)], [slot.x, slot.y, 'fx_elite_aura_idle'], `${file}: callable aura works at real elite slot`); elites++;
    }
    equal(JSON.stringify(raw), snapshot, `${file}: mapping and drawing leave map fixture unchanged`);
  }
  equal(hidden, 1, 'real hidden chest fixture was exercised'); equal(elites, 3, 'all three real elite slots exercise callable aura helper');
  console.log(JSON.stringify({ suite: 'secret-props', passed: true, assertions, rooms: files.length, mapped, trapSprites: traps, eliteSlots: elites, newKeys: required.length, missingFiles }));
} finally {
  await server.close();
}
