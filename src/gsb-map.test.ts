import qingyunSceneData from '../data/art/scenes/qingyun_village_gsb_v2/scene-data.json';
import qingyunTiledMap from '../data/maps/qingyun_village.json';
import bambooSceneData from '../data/art/scenes/bamboo_forest_gsb_v1/scene-data.json';
import bambooTiledMap from '../data/maps/bamboo_forest.json';
import lingxiSceneData from '../data/art/scenes/lingxi_path_gsb_v1/scene-data.json';
import lingxiTiledMap from '../data/maps/lingxi_path.json';
import outskirtsSceneData from '../data/art/scenes/luoxia_outskirts_1_gsb_v1/scene-data.json';
import outskirtsTiledMap from '../data/maps/luoxia_outskirts_1.json';
import outskirts2SceneData from '../data/art/scenes/luoxia_outskirts_2_gsb_v1/scene-data.json';
import outskirts2TiledMap from '../data/maps/luoxia_outskirts_2.json';
import townSceneData from '../data/art/scenes/luoxia_town_gsb_v1/scene-data.json';
import townTiledMap from '../data/maps/luoxia_town.json';
import altarSceneData from '../data/art/scenes/trial_foundation_altar_gsb_v1/scene-data.json';
import altarTiledMap from '../data/maps/trial_foundation_altar.json';
import wanyaoSceneData from '../data/art/scenes/wanyao_outer_1_gsb_v1/scene-data.json';
import wanyaoTiledMap from '../data/maps/wanyao_outer_1.json';
import wanyao2SceneData from '../data/art/scenes/wanyao_outer_2_gsb_v1/scene-data.json';
import wanyao2TiledMap from '../data/maps/wanyao_outer_2.json';
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

// The production bamboo/stream/outskirts maps share the village pipeline and retain their gameplay contracts.
const productionMaps = [
  {
    id: 'bamboo_forest', sceneId: 'bamboo_forest_gsb_v1', revision: 'bamboo-final-001',
    data: bambooSceneData, tiledMap: bambooTiledMap, dimensions: [3200, 896], bodyCounts: [2, 7],
    spawn: { x: 128, y: 832 }, ropeCount: 7,
    portals: [
      ['portal_to_village', 80, 832, 'qingyun_village', 'portal_to_bamboo'],
      ['portal_to_lingxi', 3120, 768, 'lingxi_path', 'portal_to_bamboo'],
    ],
    spawns: [
      ['spirit_rabbit', 160, 832, 640, 3], ['spirit_rabbit', 896, 832, 1056, 3],
      ['spirit_rabbit', 448, 704, 416, 2], ['spirit_rabbit', 1088, 704, 544, 2],
      ['bamboo_snake', 2048, 768, 1024, 2], ['bamboo_snake', 2048, 640, 544, 1],
      ['bamboo_snake', 2304, 512, 608, 2], ['bamboo_snake', 1920, 384, 416, 1],
    ],
    gathers: [
      ['gather_spirit_herb_19', 976, 832, 'spirit_herb', 60000],
      ['gather_spirit_herb_20', 1456, 704, 'spirit_herb', 60000],
      ['gather_spirit_herb_21', 2736, 768, 'spirit_herb', 60000],
    ],
    chest: ['sense_chest_01', 2864, 512, 'hp_pill_small', 1],
  },
  {
    id: 'lingxi_path', sceneId: 'lingxi_path_gsb_v1', revision: 'lingxi-final-001',
    data: lingxiSceneData, tiledMap: lingxiTiledMap, dimensions: [3840, 1024], bodyCounts: [4, 8],
    spawn: { x: 128, y: 960 }, ropeCount: 8,
    portals: [
      ['portal_to_bamboo', 80, 960, 'bamboo_forest', 'portal_to_lingxi'],
      ['portal_to_village', 3760, 768, 'qingyun_village', 'portal_to_bamboo'],
    ],
    spawns: [
      ['bamboo_snake', 128, 960, 800, 3], ['bamboo_snake', 256, 832, 416, 1],
      ['bamboo_snake', 960, 896, 480, 2], ['mountain_mandrill', 1440, 832, 480, 2],
      ['mountain_mandrill', 1920, 768, 864, 3], ['mountain_mandrill', 1600, 640, 480, 1],
      ['mountain_mandrill', 2176, 640, 480, 2], ['mountain_mandrill', 1856, 512, 480, 1],
      ['mountain_mandrill', 2432, 480, 352, 1], ['demon_fox', 3200, 768, 352, 1],
    ],
    gathers: [
      ['gather_cold_heart_lotus_23', 656, 960, 'cold_heart_lotus', 300000],
      ['gather_spirit_herb_24', 1296, 896, 'spirit_herb', 60000],
      ['gather_iron_essence_25', 2256, 768, 'iron_essence', 90000],
    ],
    chest: ['sense_chest_01', 400, 832, 'qi_pill', 1],
  },
  {
    id: 'luoxia_outskirts_1', sceneId: 'luoxia_outskirts_1_gsb_v1', revision: 'outskirts1-final-001',
    data: outskirtsSceneData, tiledMap: outskirtsTiledMap, dimensions: [3200, 1088], bodyCounts: [3, 7],
    spawn: { x: 3072, y: 1024 }, ropeCount: 7,
    portals: [
      ['portal_to_village', 3120, 1024, 'qingyun_village', 'portal_west_locked'],
      ['portal_to_outskirts_2', 80, 1024, 'luoxia_outskirts_2', 'portal_to_outskirts_1'],
    ],
    spawns: [
      ['wild_boar_spirit', 128, 1024, 1120, 4], ['wild_boar_spirit', 1280, 960, 640, 3],
      ['wild_boar_spirit', 1952, 1024, 1120, 4], ['straw_puppet', 192, 896, 416, 1],
      ['straw_puppet', 448, 768, 480, 2], ['straw_puppet', 1344, 832, 512, 1],
      ['straw_puppet', 2240, 768, 608, 2], ['straw_puppet', 2432, 640, 288, 1],
    ],
    gathers: [
      ['gather_spirit_herb_19', 816, 1024, 'spirit_herb', 60000],
      ['gather_spirit_herb_20', 1680, 704, 'spirit_herb', 60000],
      ['gather_spirit_herb_21', 2128, 1024, 'spirit_herb', 60000],
    ],
    chest: ['sense_chest_01', 496, 768, 'hp_pill_small', 1],
  },
  {
    id: 'luoxia_outskirts_2', sceneId: 'luoxia_outskirts_2_gsb_v1', revision: 'luoxia2-final-001',
    data: outskirts2SceneData, tiledMap: outskirts2TiledMap, dimensions: [3520, 1152], bodyCounts: [3, 8],
    spawn: { x: 160, y: 1088 }, ropeCount: 8,
    portals: [
      ['portal_to_outskirts_1', 80, 1088, 'luoxia_outskirts_1', 'portal_to_outskirts_2'],
      ['portal_to_town', 3440, 960, 'luoxia_town', 'portal_to_outskirts'],
    ],
    spawns: [
      ['straw_puppet', 128, 1088, 928, 3], ['straw_puppet', 128, 960, 544, 1],
      ['straw_puppet', 384, 832, 608, 2], ['black_robe_minion', 1088, 960, 608, 2],
      ['black_robe_minion', 1216, 800, 608, 2], ['black_robe_minion', 1408, 672, 352, 1],
      ['black_robe_minion', 1088, 1088, 1120, 2], ['black_robe_minion', 2240, 1024, 512, 2],
      ['black_robe_minion', 2304, 896, 416, 1], ['black_robe_minion', 2880, 832, 480, 2],
    ],
    gathers: [
      ['gather_spirit_herb_22', 528, 1088, 'spirit_herb', 60000],
      ['gather_spirit_herb_23', 1488, 672, 'spirit_herb', 60000],
      ['gather_iron_essence_24', 3056, 960, 'iron_essence', 90000],
    ],
    chest: ['sense_chest_01', 592, 832, 'qi_pill', 1],
  },
];
for (const contract of productionMaps) {
  const { id, sceneId, data, tiledMap } = contract;
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, clone(data));
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, clone(tiledMap), 'tiles');
  eq(map.gsbScene, sceneId, `${id}: checked-in map enables its GSB scene`);
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    contract.revision, `${id}: map binds the approved geometry revision`);
  eq(data.geometryRevision, contract.revision, `${id}: scene-data has the approved geometry revision`);
  same([map.width, map.height], contract.dimensions, `${id}: logical world dimensions match the approved scene`);
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], contract.dimensions,
    `${id}: checked-in tile grid matches logical world dimensions`);
  same(f.groups.map(group => group.children.length), contract.bodyCounts, `${id}: surfaces and solids build the expected collision bodies`);
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `${id}: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    `${id}: all one-way bodies only collide on top`);
  same(map.spawn, contract.spawn, `${id}: player start is preserved`);
  eq(map.ropes.length, contract.ropeCount, `${id}: all named ropes are preserved`);
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => ['rope', climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]), `${id}: rope endpoints follow the approved climb geometry`);
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), contract.spawns,
    `${id}: monster positions, patrol widths and counts survive integration`);
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]), contract.portals,
    `${id}: both portal positions and destinations survive point aliases`);
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), contract.gathers,
    `${id}: all gathers keep their positions, items and respawn times`);
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]), [contract.chest],
    `${id}: the native chest retains its position and loot`);
  eq(map.hidden.length, 2, `${id}: both existing hidden controllers are retained`);
  ok(map.hidden.every(hidden => hidden.object.props.enabled === false), `${id}: hidden controllers stay disabled`);
  eq(f.tilemaps, 0, `${id}: GSB skips the legacy tilemap path`);
  same(f.displays.filter(object => object.kind !== 'zone').map(object => object.key),
    [`gsb_${sceneId}_background`, `gsb_${sceneId}_playable`], `${id}: GSB draws its art without legacy terrain or ropes`);
  ok(tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name))
    .every(layer => layer.data?.every(gid => gid === 0)), `${id}: checked-in legacy collision layers are cleared`);
  eq(JSON.stringify(data), dataBefore, `${id}: building leaves scene-data unchanged`);
  eq(JSON.stringify(tiledMap), mapBefore, `${id}: building leaves the checked-in map unchanged`);
  if (id === 'lingxi_path') {
    same(map.zones, [{ name: 'boss_arena', x: 2880, y: 384, w: 960, h: 384,
      props: { label: '妖狐巢穴', unlockQuest: 'q_fox', bossOnly: true } }], 'lingxi_path: boss arena and quest gate are retained');
    same(map.objects.filter(object => object.type === 'encounter_anchor').map(object =>
      [object.name, object.x, object.y, object.props.encounter]),
    [['enc_stranded_cultivator_anchor', 1712, 640, 'enc_stranded_cultivator']], 'lingxi_path: encounter anchor is retained');
  }
}

// Wanyao's forest edge retains its ferry, hunter, secret nest and three disabled hidden controllers.
{
  const sceneId = 'wanyao_outer_1_gsb_v1', revision = 'wanyao-outer1-final-001';
  const data = clone(wanyaoSceneData), tiledMap = clone(wanyaoTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'wanyao_outer_1: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'wanyao_outer_1: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'wanyao_outer_1: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'wanyao_outer_1: scene-data has the approved geometry revision');
  same([map.width, map.height], [3200, 896], 'wanyao_outer_1: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [100, 28], 'wanyao_outer_1: checked-in tile grid is 100 x 28');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'wanyao_outer_1: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [5, 7], 'wanyao_outer_1: five solids and seven one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `wanyao_outer_1: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'wanyao_outer_1: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'wanyao_outer_1: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 768 }, 'wanyao_outer_1: player start is preserved');
  eq(map.ropes.length, 7, 'wanyao_outer_1: all seven ropes are preserved');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => ['rope', climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'wanyao_outer_1: rope tops follow climb ends and bottoms follow climb starts');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_outer_2', 3120, 832, 'wanyao_outer_2', 'portal_to_outer_1']],
  'wanyao_outer_1: east portal retains its position and destination');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['vine_imp', 704, 832, 608, 3], ['vine_imp', 768, 704, 416, 2],
    ['vine_imp', 960, 576, 480, 2], ['vine_imp', 1344, 704, 352, 1],
    ['vine_imp', 1856, 640, 352, 2], ['shadow_wolf', 1792, 768, 480, 3],
    ['shadow_wolf', 2304, 832, 768, 3], ['shadow_wolf', 2432, 704, 480, 2],
  ], 'wanyao_outer_1: all eight monster positions, patrol widths and counts survive integration');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), [
    ['gather_spirit_herb_20', 1232, 576, 'spirit_herb', 60000],
    ['gather_spirit_herb_21', 2256, 512, 'spirit_herb', 60000],
    ['gather_spirit_copper_22', 2960, 576, 'spirit_copper', 120000],
  ], 'wanyao_outer_1: all gathers keep their positions, items and respawn times');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
  [['sense_chest_01', 1040, 576, 'hp_pill_small', 1]],
  'wanyao_outer_1: the native chest retains its position and loot');
  eq(map.hidden.length, 3, 'wanyao_outer_1: all three existing hidden controllers are retained');
  same(map.hidden.map(hidden => hidden.object.name),
    ['sense_hidden_chest_01', 'sense_hidden_platform_01', 'enc_hidden_abode_anchor'],
    'wanyao_outer_1: chest, platform and hidden abode controllers keep their identities');
  ok(map.hidden.every(hidden => hidden.object.props.enabled === false), 'wanyao_outer_1: hidden controllers stay disabled');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 192, 768, 160, 'luoxia_town']],
  'wanyao_outer_1: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  [['hunter_lei', 528, 832, 'hunter_lei']],
  'wanyao_outer_1: the hunter retains his NPC type, position and identity');
  same(map.objects.filter(object => object.name.startsWith('secret_nest_')).map(object =>
    [object.type, object.name, object.x, object.y]), [
    ['sign', 'secret_nest_sign', 392, 832],
    ['secretEntrance', 'secret_nest_entrance', 456, 832],
    ['point', 'secret_nest_return', 464, 832],
  ], 'wanyao_outer_1: secret nest sign, entrance and return point are retained');
  eq(f.tilemaps, 0, 'wanyao_outer_1: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'wanyao_outer_1: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'wanyao_outer_1: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'wanyao_outer_1: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'wanyao_outer_1: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'wanyao_outer_1: building leaves the Tiled map input unchanged');
}

// Wanyao's spider valley retains its wolves, spiders, tree spirit and two disabled hidden controllers.
{
  const sceneId = 'wanyao_outer_2_gsb_v1', revision = 'wanyao2-final-002';
  const data = clone(wanyao2SceneData), tiledMap = clone(wanyao2TiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'wanyao_outer_2: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'wanyao_outer_2: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'wanyao_outer_2: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'wanyao_outer_2: scene-data has the approved geometry revision');
  same([map.width, map.height], [3520, 1216], 'wanyao_outer_2: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [110, 38], 'wanyao_outer_2: checked-in tile grid is 110 x 38');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'wanyao_outer_2: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [4, 8], 'wanyao_outer_2: four solids and eight one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `wanyao_outer_2: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'wanyao_outer_2: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'wanyao_outer_2: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 1088 }, 'wanyao_outer_2: player start is preserved');
  eq(map.ropes.length, 7, 'wanyao_outer_2: all seven ropes are preserved');
  same(data.climbs.map(climb => [climb.kind, climb.ends.start.position, climb.ends.end.position]), [
    ['rope', [656, 1152], [656, 1024]], ['rope', [848, 1024], [848, 896]],
    ['rope', [1104, 896], [1104, 768]], ['rope', [1552, 1152], [1552, 1024]],
    ['rope', [1808, 1024], [1808, 896]], ['rope', [2448, 1088], [2448, 960]],
    ['rope', [2640, 960], [2640, 832]],
  ], 'wanyao_outer_2: approved climbs retain their bottom/start and top/end endpoints');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'wanyao_outer_2: rope tops follow climb ends and bottoms follow climb starts');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]), [
    ['portal_to_outer_1', 80, 1088, 'wanyao_outer_1', 'portal_to_outer_2'],
    ['portal_to_deep_1', 3440, 1024, 'wanyao_deep_1', 'portal_to_outer_2'],
  ], 'wanyao_outer_2: both portals retain their positions and destinations');
  eq(map.objects.find(object => object.name === 'portal_to_deep_1')?.props.reqLevel,
    30, 'wanyao_outer_2: the deep forest portal retains its level requirement');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['shadow_wolf', 512, 1152, 1568, 4], ['shadow_wolf', 576, 1024, 416, 2],
    ['poison_spider', 704, 896, 480, 2], ['poison_spider', 1408, 1024, 480, 2],
    ['poison_spider', 1600, 896, 480, 2], ['poison_spider', 2112, 1088, 800, 3],
    ['poison_spider', 2240, 960, 480, 2], ['poison_spider', 2368, 832, 480, 2],
  ], 'wanyao_outer_2: all eight monster positions, patrol widths and counts survive integration');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), [
    ['gather_nine_leaf_ganoderma_20', 1232, 672, 'nine_leaf_ganoderma', 600000],
    ['gather_spirit_herb_21', 1936, 896, 'spirit_herb', 60000],
    ['gather_spirit_copper_22', 2768, 832, 'spirit_copper', 120000],
  ], 'wanyao_outer_2: all gathers keep their positions, items and respawn times');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
  [['sense_chest_01', 1008, 768, 'hp_pill_small', 1]],
  'wanyao_outer_2: the native chest retains its position and loot');
  eq(map.hidden.length, 2, 'wanyao_outer_2: both existing hidden controllers are retained');
  same(map.hidden.map(hidden => hidden.object.name), ['sense_hidden_chest_01', 'sense_hidden_platform_01'],
    'wanyao_outer_2: chest and platform hidden controllers keep their identities');
  ok(map.hidden.every(hidden => hidden.object.props.enabled === false), 'wanyao_outer_2: hidden controllers stay disabled');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  [['tree_spirit', 3216, 1024, 'tree_spirit']],
  'wanyao_outer_2: the tree spirit retains its NPC type, position and identity');
  same(map.objects.filter(object => object.type === 'encounter_anchor').map(object =>
    [object.name, object.x, object.y, object.props.encounter]),
  [['enc_fragrant_herb_anchor', 1712, 896, 'enc_fragrant_herb']],
  'wanyao_outer_2: the fragrant herb encounter anchor is retained');
  eq(f.tilemaps, 0, 'wanyao_outer_2: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'wanyao_outer_2: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'wanyao_outer_2: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'wanyao_outer_2: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'wanyao_outer_2: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'wanyao_outer_2: building leaves the Tiled map input unchanged');
}

// Luoxia town has NPCs, a ferry and a ladder, with no monster, gather or treasure objects.
{
  const sceneId = 'luoxia_town_gsb_v1', revision = 'luoxia-final-001';
  const data = clone(townSceneData), tiledMap = clone(townTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'luoxia_town: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'luoxia_town: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'luoxia_town: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'luoxia_town: scene-data has the approved geometry revision');
  same([map.width, map.height], [3072, 1024], 'luoxia_town: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [96, 32], 'luoxia_town: checked-in tile grid is 96 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'luoxia_town: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [5, 11], 'luoxia_town: five solids and eleven one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `luoxia_town: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'luoxia_town: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'luoxia_town: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 832 }, 'luoxia_town: player start is preserved');
  eq(map.ropes.length, 8, 'luoxia_town: all seven ropes and the ladder are preserved');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'luoxia_town: rope and ladder geometry follows the approved climbs');
  same(map.ropes.filter(rope => rope.kind === 'ladder'),
    [{ kind: 'ladder', x: 2448, top: 800, bottom: 896, halfW: 18 }],
    'luoxia_town: ladder uses the patched object center and half-width');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_outskirts', 2992, 896, 'luoxia_outskirts_2', 'portal_to_town']],
  'luoxia_town: east portal retains its position and destination');
  same(map.objects.filter(object => object.type === 'npc').map(object => object.name),
    ['ferry_master', 'merchant_qian', 'storage_keeper', 'alchemist_ge', 'luoxia_mayor', 'smith_ou'],
    'luoxia_town: all six named NPCs are preserved');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.sourceName, ...point.position, point.properties?.npc]),
  'luoxia_town: NPC positions and identities match scene-data points');
  const ferry = data.points.find(point => point.id === 'ferry_dock')!;
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.npc]),
  [['ferry_dock', ...ferry.position, ferry.width, ferry.properties?.npc]],
  'luoxia_town: ferry dock retains its type, point position, width and NPC binding');
  const encounter = data.points.find(point => point.id === 'enc_demon_whisper_anchor')!;
  same(map.objects.filter(object => object.type === 'encounter_anchor').map(object =>
    [object.name, object.x, object.y, object.props.encounter]),
  [['enc_demon_whisper_anchor', ...encounter.position, encounter.properties?.encounter]],
  'luoxia_town: demon whisper encounter anchor is retained');
  same(map.spawns, [], 'luoxia_town: no monster spawns are introduced');
  same(map.hidden, [], 'luoxia_town: no hidden controllers are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden'].includes(object.type)), [],
    'luoxia_town: no gather or treasure objects are introduced');
  eq(f.tilemaps, 0, 'luoxia_town: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'luoxia_town: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'luoxia_town: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'luoxia_town: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'luoxia_town: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'luoxia_town: building leaves the Tiled map input unchanged');
}

// The foundation altar retains trial objectives, gates and hazards without ordinary field-map objects.
{
  const sceneId = 'trial_foundation_altar_gsb_v1', revision = 'trial-foundation-final-001';
  const data = clone(altarSceneData), tiledMap = clone(altarTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'trial_foundation_altar: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'trial_foundation_altar: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'trial_foundation_altar: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'trial_foundation_altar: scene-data has the approved geometry revision');
  same([map.width, map.height], [1600, 704], 'trial_foundation_altar: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [50, 22], 'trial_foundation_altar: checked-in tile grid is 50 x 22');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'trial_foundation_altar: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [4, 3], 'trial_foundation_altar: four solids and three one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `trial_foundation_altar: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'trial_foundation_altar: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'trial_foundation_altar: solid bodies keep all collision directions');
  same(map.spawn, { x: 704, y: 576 }, 'trial_foundation_altar: player start is preserved');
  eq(map.ropes.length, 3, 'trial_foundation_altar: all three ropes are preserved');
  // Tiled orders the ropes left/right/center; scene-data orders the climbs left/center/right.
  same([...map.ropes].sort((a, b) => a.x - b.x).map(rope =>
    [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
  [...data.climbs].sort((a, b) => a.ends.end.position[0] - b.ends.end.position[0]).map(climb =>
    [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
  'trial_foundation_altar: rope endpoints follow the approved climbs regardless of object order');
  same(map.objects.filter(object => object.type === 'objective').map(object =>
    [object.name, object.x, object.y, object.props]),
  [['spirit_array_eye', 800, 576, { objective: 'spirit_array_eye' }]],
  'trial_foundation_altar: the array eye retains its objective type, position and identity');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props]),
  [['elder_phantom', 960, 576, { npc: 'tianjian_elder', phantom: true }]],
  'trial_foundation_altar: the elder retains its NPC type, position, identity and phantom flag');
  same(map.spawnGates, [
    { type: 'spawnGate', name: 'gate_left', x: 64, y: 640, w: 0, h: 0, props: { side: 'left' } },
    { type: 'spawnGate', name: 'gate_right', x: 1504, y: 640, w: 0, h: 0, props: { side: 'right' } },
    { type: 'spawnGate', name: 'gate_air_left', x: 96, y: 320, w: 0, h: 0, props: { side: 'left', flying: true } },
    { type: 'spawnGate', name: 'gate_air_right', x: 1472, y: 320, w: 0, h: 0, props: { side: 'right', flying: true } },
  ], 'trial_foundation_altar: all four spawn gates retain their positions, sides and flying flags');
  same(map.objects.filter(object => object.type === 'spawnGate'), map.spawnGates,
    'trial_foundation_altar: spawn gates remain available through gameplay objects');
  same(map.zones, [{ name: 'thunder_area', x: 416, y: 256, w: 768, h: 320,
    props: { label: '天雷落区', hazard: 'thunder_circle' } }],
  'trial_foundation_altar: the thunder zone retains its bounds and hazard properties');
  same(map.spawns, [], 'trial_foundation_altar: no monster spawns are introduced');
  same(map.hidden, [], 'trial_foundation_altar: no hidden controllers are introduced');
  same(map.objects.filter(object => ['portal', 'gather', 'chest', 'hidden'].includes(object.type)), [],
    'trial_foundation_altar: no portal, gather or treasure objects are introduced');
  eq(f.tilemaps, 0, 'trial_foundation_altar: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'trial_foundation_altar: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'trial_foundation_altar: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'trial_foundation_altar: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'trial_foundation_altar: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'trial_foundation_altar: building leaves the Tiled map input unchanged');
}

console.log(JSON.stringify({ suite: 'gsb-map', passed: true, assertions }));
