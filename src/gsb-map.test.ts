import qingyunSceneData from '../data/art/scenes/qingyun_village_gsb_v2/scene-data.json';
import qingyunTiledMap from '../data/maps/qingyun_village.json';
import { FEEL, SPEC } from './config/feel';
import { buildTiledMap } from './scenes/MapBuilder';

// Run with Vite SSR; no browser or Phaser game instance is needed.
// The actual MapBuilder runs here; only rendering and static-body allocation are replaced.
let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: got ${String(actual)}, expected ${String(expected)}`);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value));

type Collision = { up: boolean; down: boolean; left: boolean; right: boolean };
class Display {
  originX = 0.5; originY = 0.5; depth = 0; scrollFactorX = 1; scrollFactorY = 1;
  body?: { checkCollision: Collision };
  marks: unknown[][] = [];
  constructor(readonly kind: string, readonly x = 0, readonly y = 0,
    readonly width = 0, readonly height = 0, readonly key?: string) {}
  setOrigin(x: number, y = x) { this.originX = x; this.originY = y; return this; }
  setDepth(value: number) { this.depth = value; return this; }
  setScrollFactor(x: number, y = x) { this.scrollFactorX = x; this.scrollFactorY = y; return this; }
  fillStyle(...args: unknown[]) { this.marks.push(['fillStyle', ...args]); return this; }
  fillRect(...args: unknown[]) { this.marks.push(['fillRect', ...args]); return this; }
  lineStyle(...args: unknown[]) { this.marks.push(['lineStyle', ...args]); return this; }
  lineBetween(...args: unknown[]) { this.marks.push(['lineBetween', ...args]); return this; }
}
class StaticGroup {
  children: Display[] = [];
  add(object: Display) {
    object.body = { checkCollision: { up: true, down: true, left: true, right: true } };
    this.children.push(object);
    return this;
  }
}
function fixture(data: unknown = sceneData(), foreground = true) {
  const id = 'runtime_fixture';
  const cache = new Map<string, unknown>();
  if (data !== undefined) cache.set(`gsb_${id}_data`, data);
  const textures = new Set([`gsb_${id}_background`, `gsb_${id}_playable`, 'tiles', 'tiles_ss']);
  if (foreground) textures.add(`gsb_${id}_foreground`);
  const displays: Display[] = [], groups: StaticGroup[] = [];
  let tilemaps = 0;
  const display = (kind: string, x = 0, y = 0, width = 0, height = 0, key?: string) => {
    if (key && !textures.has(key)) throw new Error(`Missing texture requested: ${key}`);
    const result = new Display(kind, x, y, width, height, key);
    displays.push(result);
    return result;
  };
  const scene: any = {
    cache: { json: { get: (key: string) => cache.get(key), exists: (key: string) => cache.has(key) } },
    textures: { exists: (key: string) => textures.has(key), get: () => ({
      get: () => ({ cutWidth: 512, cutHeight: 32 }), has: () => true,
    }) },
    physics: { add: { staticGroup: () => { const group = new StaticGroup(); groups.push(group); return group; } } },
    add: {
      zone: (x: number, y: number, w: number, h: number) => display('zone', x, y, w, h),
      image: (x: number, y: number, key: string) => display('image', x, y, 0, 0, key),
      tileSprite: (x: number, y: number, w: number, h: number, key: string) => display('tileSprite', x, y, w, h, key),
      rectangle: (x: number, y: number, w: number, h: number) => display('rectangle', x, y, w, h),
      graphics: () => display('graphics'),
    },
    make: { tilemap: () => {
      tilemaps++;
      return { addTilesetImage: () => ({}), createLayer: () => display('tileLayer') };
    } },
  };
  return { scene, displays, groups, textures, cache, get tilemaps() { return tilemaps; } };
}
function sceneData() {
  return {
    schemaVersion: '1.0',
    space: { origin: 'top-left', xDirection: 'right', yDirection: 'down', units: 'logical-pixel', logicalWidth: 2560, logicalHeight: 864 },
    surfaces: [
      { id: 's_village', polyline: [[0, 700], [674, 700]], support: 'solid' },
      { id: 's_market', polyline: [[674, 635], [1165, 635]], support: 'solid' },
      { id: 's_roof', polyline: [[173.25, 520.5], [521.75, 520.5]], support: 'one-way' },
    ],
    climbs: [],
  };
}
function tiled(gsbScene: unknown = 'runtime_fixture') {
  const props = (values: Record<string, unknown>) => Object.entries(values).map(([name, value]) => ({ name, value }));
  const object = (type: string, name: string, x: number, y: number, values: Record<string, unknown> = {}, width = 0, height = 0) =>
    ({ type, name, x, y, width, height, properties: props(values) });
  return {
    width: 3, height: 2,
    properties: props({ id: 'fixture_map', name: 'GSB runtime fixture', safeZone: true, gsbScene }),
    layers: [
      { type: 'tilelayer', name: 'ground', data: [0, 0, 0, 1, 1, 1] },
      { type: 'tilelayer', name: 'oneway', data: [1, 0, 0, 0, 0, 0] },
      { type: 'objectgroup', objects: [
        object('playerStart', 'start', 176, 700),
        object('npc', 'elder', 610, 700, { npc: 'village_elder' }),
        object('portal', 'east', 2480, 700, { target: 'next_map', targetPortal: 'west' }),
        object('chest', 'treasure', 1935, 420, { loot: 'hp_pill_small', count: 3 }),
        object('spawn', 'dummy', 1805, 700, { monster: 'training_dummy', count: 2 }, 40),
        object('encounter_anchor', 'advice', 1590, 700, { encounter: 'enc_sage_advice' }),
        object('ladder', 'ladder', 412, 520, {}, 32, 180),
        object('rope', 'rope', 1391, 506, {}, 0, 194),
        object('hidden', 'hidden_treasure', 1935, 420, { reveal: 'chest', targetObject: 'treasure', reqSpirit: 0 }),
      ] },
    ],
  };
}
function rectangle(object: Display) {
  return { x: object.x - object.width / 2, y: object.y - object.height / 2, width: object.width, height: object.height };
}

// Scene geometry wins over nonempty legacy tile layers, and retains subpixel coordinates.
{
  const f = fixture(), raw = tiled(), before = JSON.stringify(raw);
  const map = buildTiledMap(f.scene, raw, 'tiles');
  eq(map.gsbScene, 'runtime_fixture', 'GSB mode records the actual scene id');
  same([map.width, map.height], [2560, 864], 'world dimensions come from scene-data rather than the 3 x 2 tile grid');
  same(f.groups[0].children.map(rectangle), [
    { x: 0, y: 700, width: 674, height: FEEL.tile },
    { x: 674, y: 635, width: 491, height: FEEL.tile },
  ], 'solid support top edges and widths preserve scene geometry');
  same(f.groups[1].children.map(rectangle), [
    { x: 173.25, y: 520.5, width: 348.5, height: SPEC.oneWayEdge },
  ], 'one-way body keeps its exact top edge and span without tile quantization');
  same(f.groups[1].children[0].body?.checkCollision, { up: true, down: false, left: false, right: false }, 'one-way bodies collide only on the top');
  same(f.groups[0].children[0].body?.checkCollision, { up: true, down: true, left: true, right: true }, 'solid bodies keep all collision directions');
  same(map.spawn, { x: 176, y: 700 }, 'player start still comes from Tiled objects');
  same(map.spawns, [{ x: 1805, y: 700, w: 40, monster: 'training_dummy', count: 2 }], 'monster spawn objects retain position, width and properties');
  same(map.objects.filter(object => ['npc', 'portal', 'chest', 'encounter_anchor'].includes(object.type)).map(object =>
    [object.type, object.name, object.x, object.y, object.props]), [
    ['npc', 'elder', 610, 700, { npc: 'village_elder' }],
    ['portal', 'east', 2480, 700, { target: 'next_map', targetPortal: 'west' }],
    ['chest', 'treasure', 1935, 420, { loot: 'hp_pill_small', count: 3 }],
    ['encounter_anchor', 'advice', 1590, 700, { encounter: 'enc_sage_advice' }],
  ], 'gameplay objects remain on the established parsing path');
  same(map.ropes, [
    { kind: 'ladder', x: 428, top: 520, bottom: 700, halfW: 16 },
    { kind: 'rope', x: 1391, top: 506, bottom: 700, halfW: FEEL.ropeGrabRangeX },
  ], 'rope and ladder grabbing geometry still comes from Tiled objects');
  eq(map.hidden[0].valid, true, 'object validation uses logical world bounds');
  eq(f.tilemaps, 0, 'GSB never constructs a tilemap even with nonempty ground data and available tiles');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => object.kind), ['image', 'image', 'image'], 'GSB draws no legacy terrain, one-way color blocks or climbable graphics');
  same(f.displays.filter(object => object.kind === 'image').map(object =>
    [object.key, object.x, object.y, object.originX, object.originY, object.scrollFactorX, object.scrollFactorY, object.depth]), [
    ['gsb_runtime_fixture_background', 0, 0, 0, 0, 1, 1, -6],
    ['gsb_runtime_fixture_playable', 0, 0, 0, 0, 1, 1, -5],
    ['gsb_runtime_fixture_foreground', 0, 0, 0, 0, 1, 1, 11],
  ], 'GSB art is anchored to world origin and correctly ordered around the player');
  ok(f.displays.find(object => object.key === 'gsb_runtime_fixture_foreground')!.depth > 10,
    'foreground draws above the existing player depth of 10');
  eq(JSON.stringify(raw), before, 'building does not mutate the source Tiled map');
}

// Optional foreground art must not create a missing-texture image.
{
  const f = fixture(sceneData(), false);
  buildTiledMap(f.scene, tiled());
  same(f.displays.filter(object => object.kind === 'image').map(object => object.key),
    ['gsb_runtime_fixture_background', 'gsb_runtime_fixture_playable'], 'absent foreground is skipped');
}

// A missing, malformed, or unbound scene keeps the legacy terrain and rope path intact.
const fallbacks: [string, unknown, unknown][] = [
  ['missing scene data', undefined, 'runtime_fixture'],
  ['missing logical dimensions', { surfaces: [] }, 'runtime_fixture'],
  ['invalid logical dimensions', { ...sceneData(), space: { logicalWidth: 0, logicalHeight: 864 } }, 'runtime_fixture'],
  ['invalid surfaces collection', { ...sceneData(), surfaces: null }, 'runtime_fixture'],
  ['no scene property', sceneData(), undefined],
  ['empty scene property', sceneData(), ''],
  ['non-string scene property', sceneData(), 42],
];
for (const [label, data, binding] of fallbacks) {
  const f = fixture(null);
  if (data === undefined) f.cache.clear(); else f.cache.set('gsb_runtime_fixture_data', data);
  const raw = tiled(binding);
  // Explicit undefined avoids the fixture's default argument becoming a valid scene binding.
  if (binding === undefined) raw.properties = raw.properties.filter(property => property.name !== 'gsbScene');
  const map = buildTiledMap(f.scene, raw);
  eq(map.gsbScene, undefined, `${label}: does not enable GSB`);
  same([map.width, map.height], [3 * FEEL.tile, 2 * FEEL.tile], `${label}: preserves tile world dimensions`);
  same(f.groups[0].children.map(rectangle), [{ x: 0, y: FEEL.tile, width: 3 * FEEL.tile, height: FEEL.tile }], `${label}: preserves merged solid tile collisions`);
  same(f.groups[1].children.map(rectangle), [{ x: 0, y: 0, width: FEEL.tile, height: SPEC.oneWayEdge }], `${label}: preserves one-way tile collisions`);
  eq(f.displays.filter(object => object.kind === 'rectangle').length, 2, `${label}: preserves the legacy one-way fallback art`);
  ok(f.displays.some(object => object.kind === 'graphics' && object.marks.some(mark => mark[0] === 'lineBetween')),
    `${label}: preserves climbable fallback drawing`);
  eq(f.displays.filter(object => object.key?.startsWith('gsb_')).length, 0, `${label}: does not place GSB art`);
}

// Exercise the checked-in Qingyun contract as well as the deliberately small fixture.
{
  const f = fixture(null, false), dataBefore = JSON.stringify(qingyunSceneData);
  f.cache.clear(); f.cache.set('gsb_qingyun_village_gsb_v2_data', clone(qingyunSceneData));
  f.textures.add('gsb_qingyun_village_gsb_v2_background'); f.textures.add('gsb_qingyun_village_gsb_v2_playable');
  const map = buildTiledMap(f.scene, clone(qingyunTiledMap), 'tiles');
  eq(map.gsbScene, 'qingyun_village_gsb_v2', 'the checked-in village enables GSB');
  same([map.width, map.height], [2560, 864], 'the checked-in village has the expected logical world dimensions');
  eq(f.groups[0].children.length, 2, 'base and market polygons replace duplicate support bodies');
  eq(f.groups[1].children.length, 8, 'all eight village one-way surfaces build bodies');
  ok(f.groups[0].children.some(object => JSON.stringify(rectangle(object)) === JSON.stringify({ x: 674, y: 635, width: 491, height: 65 })),
    'the market support shares the exact solid_market top and span');
  ok(f.groups[0].children.some(object => JSON.stringify(rectangle(object)) === JSON.stringify({ x: 0, y: 700, width: 2560, height: 164 })),
    'solid_base blocks the full area below the ground surface');
  eq(map.ropes.length, 4, 'the checked-in village keeps all four climbables');
  eq(map.spawns.length, 3, 'the checked-in village keeps all three training dummies');
  eq(map.objects.filter(object => object.type === 'npc').length, 5, 'the checked-in village keeps all five NPCs');
  eq(map.objects.filter(object => object.type === 'portal').length, 2, 'the checked-in village keeps both portals');
  eq(map.objects.filter(object => object.type === 'chest').length, 1, 'the checked-in village keeps the lookout chest');
  eq(map.objects.filter(object => object.type === 'encounter_anchor').length, 1, 'the checked-in village keeps its encounter anchor');
  eq(JSON.stringify(qingyunSceneData), dataBefore, 'building leaves the scene-data fixture unchanged');
}

console.log(JSON.stringify({ suite: 'gsb-map', passed: true, assertions }));
