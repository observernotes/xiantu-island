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
import wanyaoDeep1SceneData from '../data/art/scenes/wanyao_deep_1_gsb_v1/scene-data.json';
import wanyaoDeep1TiledMap from '../data/maps/wanyao_deep_1.json';
import wanyaoDeep2SceneData from '../data/art/scenes/wanyao_deep_2_gsb_v1/scene-data.json';
import wanyaoDeep2TiledMap from '../data/maps/wanyao_deep_2.json';
import tombSceneData from '../data/art/scenes/tianjian_sword_tomb_gsb_v1/scene-data.json';
import tombTiledMap from '../data/maps/tianjian_sword_tomb.json';
import sectSceneData from '../data/art/scenes/tianjian_sect_gsb_v1/scene-data.json';
import sectTiledMap from '../data/maps/tianjian_sect.json';
import taixuSceneData from '../data/art/scenes/taixu_temple_gsb_v1/scene-data.json';
import taixuTiledMap from '../data/maps/taixu_temple.json';
import lingfuSceneData from '../data/art/scenes/lingfu_pavilion_gsb_v1/scene-data.json';
import lingfuTiledMap from '../data/maps/lingfu_pavilion.json';
import youyingSceneData from '../data/art/scenes/youying_tower_gsb_v1/scene-data.json';
import youyingTiledMap from '../data/maps/youying_tower.json';
import wanshouSceneData from '../data/art/scenes/wanshou_mountain_gsb_v1/scene-data.json';
import wanshouTiledMap from '../data/maps/wanshou_mountain.json';
import chiyanSlope1SceneData from '../data/art/scenes/chiyan_slope_1_gsb_v1/scene-data.json';
import chiyanSlope1TiledMap from '../data/maps/chiyan_slope_1.json';
import chiyanSlope2SceneData from '../data/art/scenes/chiyan_slope_2_gsb_v1/scene-data.json';
import chiyanSlope2TiledMap from '../data/maps/chiyan_slope_2.json';
import trialLingfuRangeSceneData from '../data/art/scenes/trial_lingfu_range_gsb_v1/scene-data.json';
import trialLingfuRangeTiledMap from '../data/maps/trial_lingfu_range.json';
import trialTaixuStageSceneData from '../data/art/scenes/trial_taixu_stage_gsb_v1/scene-data.json';
import trialTaixuStageTiledMap from '../data/maps/trial_taixu_stage.json';
import trialYouyingVaultSceneData from '../data/art/scenes/trial_youying_vault_gsb_v1/scene-data.json';
import trialYouyingVaultTiledMap from '../data/maps/trial_youying_vault.json';
import trialWanshouPenSceneData from '../data/art/scenes/trial_wanshou_pen_gsb_v1/scene-data.json';
import trialWanshouPenTiledMap from '../data/maps/trial_wanshou_pen.json';
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

// Wanyao's deep forest retains its apes, saplings, resources and two disabled hidden controllers.
{
  const sceneId = 'wanyao_deep_1_gsb_v1', revision = 'deep1-final-001';
  const data = clone(wanyaoDeep1SceneData), tiledMap = clone(wanyaoDeep1TiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'wanyao_deep_1: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'wanyao_deep_1: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'wanyao_deep_1: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'wanyao_deep_1: scene-data has the approved geometry revision');
  same([map.width, map.height], [3520, 1024], 'wanyao_deep_1: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [110, 32], 'wanyao_deep_1: checked-in tile grid is 110 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'wanyao_deep_1: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [4, 11], 'wanyao_deep_1: four solids and eleven one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `wanyao_deep_1: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'wanyao_deep_1: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'wanyao_deep_1: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 960 }, 'wanyao_deep_1: player start is preserved');
  eq(map.ropes.length, 8, 'wanyao_deep_1: all eight ropes are preserved');
  // The three ladder climbs in scene-data have no corresponding objects in the checked-in map.
  const ropeClimbs = data.climbs.filter(climb => climb.kind === 'rope');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    ropeClimbs.map(climb => ['rope', climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'wanyao_deep_1: rope tops follow rope climb ends and bottoms follow rope climb starts');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]), [
    ['portal_to_outer_2', 80, 960, 'wanyao_outer_2', 'portal_to_deep_1'],
    ['portal_to_deep_2', 3440, 768, 'wanyao_deep_2', 'portal_to_deep_1'],
  ], 'wanyao_deep_1: both portals retain their positions and destinations');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['demonized_ape', 192, 960, 736, 3], ['demonized_ape', 960, 896, 928, 3],
    ['demonized_ape', 1920, 832, 800, 3], ['tree_demon_sapling', 256, 832, 480, 2],
    ['tree_demon_sapling', 1152, 768, 480, 2], ['tree_demon_sapling', 1280, 640, 544, 2],
    ['tree_demon_sapling', 2048, 704, 480, 2], ['tree_demon_sapling', 2752, 768, 608, 2],
  ], 'wanyao_deep_1: all eight monster positions, patrol widths and counts survive integration');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), [
    ['gather_spirit_copper_20', 784, 704, 'spirit_copper', 120000],
    ['gather_spirit_copper_21', 2576, 576, 'spirit_copper', 120000],
    ['gather_nine_leaf_ganoderma_22', 3152, 512, 'nine_leaf_ganoderma', 600000],
  ], 'wanyao_deep_1: all gathers keep their positions, items and respawn times');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
  [['sense_chest_01', 528, 704, 'qi_pill', 1]],
  'wanyao_deep_1: the native chest retains its position and loot');
  eq(map.hidden.length, 2, 'wanyao_deep_1: both existing hidden controllers are retained');
  same(map.hidden.map(hidden => hidden.object.name), ['sense_hidden_chest_01', 'sense_hidden_platform_01'],
    'wanyao_deep_1: chest and platform hidden controllers keep their identities');
  ok(map.hidden.every(hidden => hidden.object.props.enabled === false), 'wanyao_deep_1: hidden controllers stay disabled');
  same(map.objects.filter(object => object.type === 'flyZone').map(object =>
    [object.name, object.x, object.y, object.w, object.h]),
  [['flyZone_1', 640, 448, 2240, 288]],
  'wanyao_deep_1: the flying zone retains its bounds');
  eq(f.tilemaps, 0, 'wanyao_deep_1: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'wanyao_deep_1: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'wanyao_deep_1: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'wanyao_deep_1: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'wanyao_deep_1: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'wanyao_deep_1: building leaves the Tiled map input unchanged');
}

// Wanyao's ancient tree heart retains its boss arena, summon gates and return ferry.
{
  const sceneId = 'wanyao_deep_2_gsb_v1', revision = 'wanyao-deep2-final-001';
  const data = clone(wanyaoDeep2SceneData), tiledMap = clone(wanyaoDeep2TiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'wanyao_deep_2: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'wanyao_deep_2: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'wanyao_deep_2: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'wanyao_deep_2: scene-data has the approved geometry revision');
  same([map.width, map.height], [3840, 1024], 'wanyao_deep_2: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [120, 32], 'wanyao_deep_2: checked-in tile grid is 120 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'wanyao_deep_2: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 7], 'wanyao_deep_2: three solids and seven one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `wanyao_deep_2: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'wanyao_deep_2: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'wanyao_deep_2: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 960 }, 'wanyao_deep_2: player start is preserved');
  eq(map.ropes.length, 7, 'wanyao_deep_2: all seven ropes are preserved');
  // Tiled places rope_107 before rope_96; compare copies sorted by x to preserve both inputs.
  same([...map.ropes].sort((a, b) => a.x - b.x).map(rope =>
    [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
  [...data.climbs].sort((a, b) => a.ends.end.position[0] - b.ends.end.position[0]).map(climb =>
    [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
  'wanyao_deep_2: rope endpoints follow the approved climbs regardless of object order');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_deep_1', 80, 960, 'wanyao_deep_1', 'portal_to_deep_2']],
  'wanyao_deep_2: the portal retains its position and destination');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_pickup', 3760, 960, 96, 'luoxia_town']],
  'wanyao_deep_2: ferry pickup retains its position, width and return town');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['tree_demon_sapling', 192, 960, 928, 3], ['tree_demon_sapling', 320, 832, 480, 2],
    ['tree_demon_sapling', 576, 704, 480, 2], ['tree_demon_sapling', 1152, 896, 800, 3],
    ['tree_demon_sapling', 1280, 768, 480, 2], ['demonized_ape', 1952, 960, 448, 2],
    ['millennium_tree_demon', 3072, 960, 288, 1],
  ], 'wanyao_deep_2: all seven monster positions, patrol widths and counts survive integration');
  same(map.spawnGates, [
    { type: 'spawnGate', name: 'summon_left', x: 2496, y: 960, w: 0, h: 0, props: { side: 'left' } },
    { type: 'spawnGate', name: 'summon_right', x: 3712, y: 960, w: 0, h: 0, props: { side: 'right' } },
  ], 'wanyao_deep_2: both spawn gates retain their positions and sides');
  same(map.objects.filter(object => object.type === 'spawnGate'), map.spawnGates,
    'wanyao_deep_2: spawn gates remain available through gameplay objects');
  same(map.zones, [{ name: 'boss_arena', x: 2432, y: 384, w: 1344, h: 576,
    props: { label: '古树心（千年树妖）', unlockQuest: 'q_main_06', bossOnly: true } }],
  'wanyao_deep_2: the boss arena retains its bounds and quest gate');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]),
  [['gather_spirit_copper_21', 1616, 768, 'spirit_copper', 120000]],
  'wanyao_deep_2: the gather keeps its position, item and respawn time');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
  [['sense_chest_01', 2208, 768, 'hp_pill_small', 1]],
  'wanyao_deep_2: the native chest retains its position and loot');
  eq(map.hidden.length, 2, 'wanyao_deep_2: both existing hidden controllers are retained');
  same(map.hidden.map(hidden => hidden.object.name), ['sense_hidden_chest_01', 'sense_hidden_platform_01'],
    'wanyao_deep_2: chest and platform hidden controllers keep their identities');
  ok(map.hidden.every(hidden => hidden.object.props.enabled === false), 'wanyao_deep_2: hidden controllers stay disabled');
  same(map.objects.filter(object => object.type === 'flyZone').map(object =>
    [object.name, object.x, object.y, object.w, object.h]),
  [['flyZone_1', 640, 448, 2400, 288]],
  'wanyao_deep_2: the flying zone retains its bounds');
  eq(f.tilemaps, 0, 'wanyao_deep_2: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'wanyao_deep_2: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'wanyao_deep_2: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'wanyao_deep_2: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'wanyao_deep_2: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'wanyao_deep_2: building leaves the Tiled map input unchanged');
}

// Tianjian's sword tomb retains its training dummies, tutorial zone and return portal.
{
  const sceneId = 'tianjian_sword_tomb_gsb_v1', revision = 'tomb-final-001';
  const data = clone(tombSceneData), tiledMap = clone(tombTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'tianjian_sword_tomb: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'tianjian_sword_tomb: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'tianjian_sword_tomb: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'tianjian_sword_tomb: scene-data has the approved geometry revision');
  same([map.width, map.height], [2240, 768], 'tianjian_sword_tomb: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [70, 24], 'tianjian_sword_tomb: checked-in tile grid is 70 x 24');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'tianjian_sword_tomb: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 2], 'tianjian_sword_tomb: three solids and two one-way bodies are built');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `tianjian_sword_tomb: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'tianjian_sword_tomb: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'tianjian_sword_tomb: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 704 }, 'tianjian_sword_tomb: player start is preserved');
  eq(map.ropes.length, 2, 'tianjian_sword_tomb: both ropes are preserved');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'tianjian_sword_tomb: rope tops follow climb ends and bottoms follow climb starts');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_sect', 80, 704, 'tianjian_sect', 'portal_to_sword_tomb']],
  'tianjian_sword_tomb: the return portal retains its position and destination');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['training_dummy', 512, 704, 32, 1], ['training_dummy', 704, 704, 32, 1],
    ['training_dummy', 896, 704, 32, 1], ['training_dummy', 1600, 640, 32, 1],
    ['training_dummy', 1824, 640, 32, 1], ['training_dummy', 1184, 576, 32, 1],
  ], 'tianjian_sword_tomb: all six training dummy positions, patrol widths and counts survive integration');
  same(map.zones, [{ name: 'skill_tutorial', x: 384, y: 384, w: 704, h: 320,
    props: { label: '技能点教学', tutorial: 'skill_points' } }],
  'tianjian_sword_tomb: the skill tutorial zone retains its bounds and properties');
  same(map.hidden, [], 'tianjian_sword_tomb: no hidden controllers are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'ferry', 'flyZone', 'spawnGate'].includes(object.type)), [],
    'tianjian_sword_tomb: no gather, chest, hidden, ferry, flying zone or spawn gate objects are introduced');
  eq(f.tilemaps, 0, 'tianjian_sword_tomb: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'tianjian_sword_tomb: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'tianjian_sword_tomb: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'tianjian_sword_tomb: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'tianjian_sword_tomb: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'tianjian_sword_tomb: building leaves the Tiled map input unchanged');
}

// Tianjian's sect gate retains its ferry, three NPCs, seclusion point and sword tomb portal.
{
  const sceneId = 'tianjian_sect_gsb_v1', revision = 'tianjian-sect-final-003';
  const data = clone(sectSceneData), tiledMap = clone(sectTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'tianjian_sect: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'tianjian_sect: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'tianjian_sect: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'tianjian_sect: scene-data has the approved geometry revision');
  same([map.width, map.height], [3072, 960], 'tianjian_sect: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [96, 30], 'tianjian_sect: checked-in tile grid is 96 x 30');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'tianjian_sect: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [6, 4], 'tianjian_sect: six solids and four one-way bodies are built');
  same(data.surfaces.filter(surface => surface.support === 'solid').map(surface => surface.id),
    ['s_dock', 's_gate', 's_stair_1', 's_arena', 's_hall', 's_east'],
    'tianjian_sect: all six approved solid surfaces are preserved');
  same(data.surfaces.filter(surface => surface.support === 'one-way').map(surface => surface.id),
    ['s_cloud', 's_eaves', 's_bell', 's_lesson'],
    'tianjian_sect: all four approved one-way surfaces are preserved');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `tianjian_sect: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'tianjian_sect: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'tianjian_sect: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 832 }, 'tianjian_sect: player start is preserved');
  eq(map.ropes.length, 4, 'tianjian_sect: both ropes and both ladders are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_rope_7', 'rope'], ['c_ladder_52', 'ladder'], ['c_rope_59', 'rope'], ['c_ladder_80', 'ladder'],
  ], 'tianjian_sect: all four approved climbs keep their identities and kinds');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'tianjian_sect: rope and ladder geometry follows the approved climbs');
  same(map.ropes.filter(rope => rope.kind === 'ladder'), [
    { kind: 'ladder', x: 1680, top: 544, bottom: 704, halfW: 18 },
    { kind: 'ladder', x: 2576, top: 608, bottom: 768, halfW: 18 },
  ], 'tianjian_sect: both ladders use the patched object centers and half-widths');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_sword_tomb', 3024, 768, 'tianjian_sword_tomb', 'portal_to_sect']],
  'tianjian_sect: the sword tomb portal retains its position and destination');
  same(map.objects.filter(object => object.type === 'npc').map(object => object.name),
    ['senior_sister_su', 'sect_master_ling', 'tianjian_elder'],
    'tianjian_sect: all three named NPCs are preserved');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.sourceName, ...point.position, point.properties?.npc]),
  'tianjian_sect: NPC positions and identities match scene-data points');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 272, 832, 160, 'luoxia_town']],
  'tianjian_sect: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.type === 'seclusion').map(object =>
    [object.name, object.x, object.y, object.props.mode, object.props.reqRealm]),
  [['sect_seclusion', 2864, 768, 'sect', 'foundation']],
  'tianjian_sect: sect seclusion retains its position, mode and realm requirement');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'tianjian_sect: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'tianjian_sect: no monster spawns are introduced');
  same(map.hidden, [], 'tianjian_sect: no hidden controllers are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'spawn', 'flyZone', 'spawnGate'].includes(object.type)), [],
    'tianjian_sect: no gather, chest, hidden, spawn, flying zone or spawn gate objects are introduced');
  eq(f.tilemaps, 0, 'tianjian_sect: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'tianjian_sect: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'tianjian_sect: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'tianjian_sect: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'tianjian_sect: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'tianjian_sect: building leaves the Tiled map input unchanged');
}

// Taixu's temple retains its ferry, two NPCs and three approved climbables.
function testTaixuTempleGsb() {
  const sceneId = 'taixu_temple_gsb_v1', revision = 'taixu-final-001';
  const data = clone(taixuSceneData), tiledMap = clone(taixuTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'taixu_temple: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'taixu_temple: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'taixu_temple: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'taixu_temple: scene-data has the approved geometry revision');
  same([map.width, map.height], [1280, 640], 'taixu_temple: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [40, 20], 'taixu_temple: checked-in tile grid is 40 x 20');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'taixu_temple: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'taixu_temple: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 3], 'taixu_temple: three solids and three one-way bodies are built');
  same(data.surfaces.filter(surface => surface.support === 'solid').map(surface => surface.id),
    ['s_dock', 's_envoy', 's_elder'],
    'taixu_temple: all three approved solid surfaces are preserved');
  same(data.surfaces.filter(surface => surface.support === 'one-way').map(surface => surface.id),
    ['s_west', 's_middle', 's_high'],
    'taixu_temple: all three approved one-way surfaces are preserved');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `taixu_temple: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'taixu_temple: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'taixu_temple: solid bodies keep all collision directions');
  same(map.spawn, { x: 224, y: 512 }, 'taixu_temple: player start is preserved');
  eq(map.ropes.length, 3, 'taixu_temple: one rope and both ladders are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_ladder_5', 'ladder'], ['c_rope_25', 'rope'], ['c_ladder_31', 'ladder'],
  ], 'taixu_temple: all three approved climbs keep their identities and kinds');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'taixu_temple: rope and ladder geometry follows the approved climbs');
  same(map.ropes, [
    { kind: 'ladder', x: 176, top: 384, bottom: 512, halfW: 18 },
    { kind: 'rope', x: 816, top: 352, bottom: 512, halfW: 18 },
    { kind: 'ladder', x: 1008, top: 224, bottom: 352, halfW: 18 },
  ], 'taixu_temple: all climbables keep their exact geometry, patched ladder centers and half-widths');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]), [
    ['taixu_envoy', 464, 576, 'taixu_envoy'],
    ['taixu_elder', 976, 512, 'taixu_elder'],
  ], 'taixu_temple: both named NPCs keep their positions and identities');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.id, ...point.position, point.properties?.npc]),
  'taixu_temple: NPC positions and identities match scene-data points');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 176, 512, 160, 'luoxia_town']],
  'taixu_temple: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'taixu_temple: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'taixu_temple: no monster spawns are introduced');
  same(map.hidden, [], 'taixu_temple: no hidden controllers are introduced');
  same(map.spawnGates, [], 'taixu_temple: no spawn gates are introduced');
  same(map.objects.filter(object => !['npc', 'ferry'].includes(object.type)), [],
    'taixu_temple: no additional gameplay objects are introduced');
  eq(f.tilemaps, 0, 'taixu_temple: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'taixu_temple: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'taixu_temple: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'taixu_temple: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'taixu_temple: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'taixu_temple: building leaves the Tiled map input unchanged');
}
testTaixuTempleGsb();

// Lingfu's pavilion retains its ferry, two NPCs and all three approved climbables.
function testLingfuPavilionGsb() {
  const sceneId = 'lingfu_pavilion_gsb_v1', revision = 'lingfu-final-003';
  const data = clone(lingfuSceneData), tiledMap = clone(lingfuTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'lingfu_pavilion: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'lingfu_pavilion: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'lingfu_pavilion: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'lingfu_pavilion: scene-data has the approved geometry revision');
  same([map.width, map.height], [1280, 640], 'lingfu_pavilion: logical world dimensions match the approved scene');
  same([tiledMap.width, tiledMap.height], [40, 20], 'lingfu_pavilion: checked-in tile grid is 40 x 20');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'lingfu_pavilion: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'lingfu_pavilion: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 3], 'lingfu_pavilion: three solids and three one-way bodies are built');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_dock', 'solid', [[0, 512], [320, 512]]],
    ['s_envoy', 'solid', [[320, 576], [768, 576]]],
    ['s_elder', 'solid', [[768, 512], [1280, 512]]],
    ['s_west', 'one-way', [[64, 384], [288, 384]]],
    ['s_middle', 'one-way', [[832, 352], [1216, 352]]],
    ['s_high', 'one-way', [[928, 224], [1152, 224]]],
  ], 'lingfu_pavilion: all six approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `lingfu_pavilion: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'lingfu_pavilion: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'lingfu_pavilion: solid bodies keep all collision directions');
  same(map.spawn, { x: 224, y: 512 }, 'lingfu_pavilion: player start is preserved');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'lingfu_pavilion: player start matches the approved scene spawn point');
  eq(map.ropes.length, 3, 'lingfu_pavilion: both ropes and the ladder are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_rope_5', 'rope'], ['c_ladder_27', 'ladder'], ['c_rope_33', 'rope'],
  ], 'lingfu_pavilion: all three approved climbs keep their identities and kinds');
  const climbObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : [])
    .filter(object => ['rope', 'ladder'].includes(object.type));
  same(climbObjects.map(object => [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_5', 'rope', 176, 384, 0, 128],
    ['ladder_27', 'ladder', 862, 352, 36, 160],
    ['rope_33', 'rope', 1072, 224, 0, 128],
  ], 'lingfu_pavilion: the named Tiled climbables retain the approved endpoints and ladder corridor');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'lingfu_pavilion: rope and ladder geometry follows the approved climb ends and corridor widths');
  same(map.ropes, [
    { kind: 'rope', x: 176, top: 384, bottom: 512, halfW: FEEL.ropeGrabRangeX },
    { kind: 'ladder', x: 880, top: 352, bottom: 512, halfW: 18 },
    { kind: 'rope', x: 1072, top: 224, bottom: 352, halfW: FEEL.ropeGrabRangeX },
  ], 'lingfu_pavilion: all climbables keep their exact geometry, patched ladder center and half-width');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]), [
    ['lingfu_envoy', 496, 576, 'lingfu_envoy'],
    ['lingfu_elder', 1040, 512, 'lingfu_elder'],
  ], 'lingfu_pavilion: both named NPCs keep their positions and identities');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.id, ...point.position, point.properties?.npc]),
  'lingfu_pavilion: NPC positions and identities match scene-data points');
  same(map.objects.filter(object => object.name === 'lingfu_elder').map(object =>
    [object.props.trial, object.props.target]), [['trial_sect_lingfu', 'trial_lingfu_range']],
  'lingfu_pavilion: the elder retains the existing trial and target');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 176, 512, 160, 'luoxia_town']],
  'lingfu_pavilion: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'lingfu_pavilion: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'lingfu_pavilion: no monster spawns are introduced');
  same(map.hidden, [], 'lingfu_pavilion: no hidden controllers are introduced');
  same(map.spawnGates, [], 'lingfu_pavilion: no spawn gates are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'spawn', 'flyZone', 'spawnGate', 'portal'].includes(object.type)), [],
    'lingfu_pavilion: no gather, chest, hidden, spawn, flying zone, spawn gate or portal objects are introduced');
  same(map.objects.filter(object => !['npc', 'ferry'].includes(object.type)), [],
    'lingfu_pavilion: no additional gameplay objects are introduced');
  eq(f.tilemaps, 0, 'lingfu_pavilion: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'lingfu_pavilion: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'lingfu_pavilion: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'lingfu_pavilion: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'lingfu_pavilion: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'lingfu_pavilion: building leaves the Tiled map input unchanged');
}
testLingfuPavilionGsb();

// Youying's tower retains its ferry, two NPCs, decorative entrance and all three approved climbables.
function testYouyingTowerGsb() {
  const sceneId = 'youying_tower_gsb_v1', revision = 'youying-final-002';
  const data = clone(youyingSceneData), tiledMap = clone(youyingTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'youying_tower: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'youying_tower: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'youying_tower: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'youying_tower: scene-data has the approved geometry revision');
  same([map.width, map.height], [1280, 640], 'youying_tower: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1280, 640],
    'youying_tower: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height], [40, 20], 'youying_tower: checked-in tile grid is 40 x 20');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'youying_tower: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'youying_tower: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 3], 'youying_tower: three solids and three one-way bodies are built');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_dock', 'solid', [[0, 512], [320, 512]]],
    ['s_envoy', 'solid', [[320, 576], [704, 576]]],
    ['s_elder', 'solid', [[704, 512], [1280, 512]]],
    ['s_west', 'one-way', [[48, 384], [280, 384]]],
    ['s_middle', 'one-way', [[748, 352], [1200, 352]]],
    ['s_high', 'one-way', [[880, 224], [1140, 224]]],
  ], 'youying_tower: all six approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `youying_tower: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'youying_tower: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'youying_tower: solid bodies keep all collision directions');
  same(map.spawn, { x: 224, y: 512 }, 'youying_tower: player start is preserved');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'youying_tower: player start matches the approved scene spawn point');
  eq(map.ropes.length, 3, 'youying_tower: both ropes and the ladder are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_rope_4', 'rope'], ['c_rope_24', 'rope'], ['c_ladder_34', 'ladder'],
  ], 'youying_tower: all three approved climbs keep their identities and kinds');
  const climbObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : [])
    .filter(object => ['rope', 'ladder'].includes(object.type));
  same(climbObjects.map(object => [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_4', 'rope', 144, 384, 0, 128],
    ['rope_24', 'rope', 784, 352, 0, 160],
    ['ladder_34', 'ladder', 1086, 224, 36, 128],
  ], 'youying_tower: the named Tiled climbables retain the approved endpoints and ladder corridor');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'youying_tower: rope and ladder geometry follows the approved climb ends and corridor widths');
  same(map.ropes, [
    { kind: 'rope', x: 144, top: 384, bottom: 512, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 784, top: 352, bottom: 512, halfW: FEEL.ropeGrabRangeX },
    { kind: 'ladder', x: 1104, top: 224, bottom: 352, halfW: 18 },
  ], 'youying_tower: all climbables keep their exact geometry, approved ladder center and half-width');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]), [
    ['youying_envoy', 432, 576, 'youying_envoy'],
    ['youying_elder', 1008, 512, 'youying_elder'],
  ], 'youying_tower: both named NPCs keep their positions and identities');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.id, ...point.position, point.properties?.npc]),
  'youying_tower: NPC positions and identities match scene-data points');
  same(map.objects.filter(object => object.name === 'youying_elder').map(object =>
    [object.props.trial, object.props.target]), [['trial_sect_youying', 'trial_youying_vault']],
  'youying_tower: the elder retains the existing trial and target');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 176, 512, 160, 'luoxia_town']],
  'youying_tower: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'youying_tower: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'youying_tower: no monster spawns are introduced');
  same(map.hidden, [], 'youying_tower: no hidden controllers are introduced');
  same(map.spawnGates, [], 'youying_tower: no spawn gates are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'spawn', 'flyZone', 'spawnGate', 'portal'].includes(object.type)), [],
    'youying_tower: no gather, chest, hidden, spawn, flying zone, spawn gate or portal objects are introduced');
  same(map.objects.filter(object => object.name === 'tower_climb_entrance').map(object =>
    [object.type, object.x, object.y, object.props.physicalTrialGate]),
  [['tower_climb', 880, 512, false]],
  'youying_tower: the tower entrance remains a decorative anchor without a physical trial gate');
  ok(map.objects.filter(object => object.name === 'tower_climb_entrance').every(object =>
    !['portal', 'trial', 'target'].some(property => Object.prototype.hasOwnProperty.call(object.props, property))),
    'youying_tower: the decorative tower entrance has no portal, trial or target binding');
  same(map.objects.filter(object => !['npc', 'ferry'].includes(object.type)).map(object => [object.type, object.name]),
    [['tower_climb', 'tower_climb_entrance']], 'youying_tower: only the approved decorative anchor accompanies gameplay objects');
  eq(f.tilemaps, 0, 'youying_tower: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'youying_tower: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'youying_tower: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'youying_tower: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'youying_tower: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'youying_tower: building leaves the Tiled map input unchanged');
}
testYouyingTowerGsb();

// Wanshou's mountain retains its ferry, two NPCs, one ladder and two approved ropes.
function testWanshouMountainGsb() {
  const sceneId = 'wanshou_mountain_gsb_v1', revision = 'wanshou-final-003';
  const data = clone(wanshouSceneData), tiledMap = clone(wanshouTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'wanshou_mountain: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'wanshou_mountain: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'wanshou_mountain: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'wanshou_mountain: scene-data has the approved geometry revision');
  same([map.width, map.height], [1280, 640], 'wanshou_mountain: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1280, 640],
    'wanshou_mountain: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height], [40, 20], 'wanshou_mountain: checked-in tile grid is 40 x 20');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'wanshou_mountain: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'wanshou_mountain: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [3, 3], 'wanshou_mountain: three solids and three one-way bodies are built');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_dock', 'solid', [[0, 512], [320, 512]]],
    ['s_envoy', 'solid', [[320, 576], [800, 576]]],
    ['s_elder', 'solid', [[800, 512], [1280, 512]]],
    ['s_west', 'one-way', [[64, 384], [288, 384]]],
    ['s_middle', 'one-way', [[864, 352], [1248, 352]]],
    ['s_high', 'one-way', [[960, 224], [1184, 224]]],
  ], 'wanshou_mountain: all six approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `wanshou_mountain: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'wanshou_mountain: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'wanshou_mountain: solid bodies keep all collision directions');
  same(map.spawn, { x: 224, y: 512 }, 'wanshou_mountain: player start is preserved');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'wanshou_mountain: player start matches the approved scene spawn point');
  eq(map.ropes.length, 3, 'wanshou_mountain: both ropes and the ladder are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_ladder_5', 'ladder'], ['c_rope_28', 'rope'], ['c_rope_35', 'rope'],
  ], 'wanshou_mountain: all three approved climbs keep their identities and kinds');
  const climbObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : [])
    .filter(object => ['rope', 'ladder'].includes(object.type));
  same(climbObjects.map(object => [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['ladder_5', 'ladder', 158, 384, 36, 128],
    ['rope_28', 'rope', 912, 352, 0, 160],
    ['rope_35', 'rope', 1136, 224, 0, 128],
  ], 'wanshou_mountain: the named Tiled climbables retain the approved endpoints and ladder corridor');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'wanshou_mountain: rope and ladder geometry follows the approved climb ends and corridor widths');
  same(map.ropes, [
    { kind: 'ladder', x: 176, top: 384, bottom: 512, halfW: 18 },
    { kind: 'rope', x: 912, top: 352, bottom: 512, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1136, top: 224, bottom: 352, halfW: FEEL.ropeGrabRangeX },
  ], 'wanshou_mountain: all climbables keep their exact geometry, approved ladder center and half-width');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]), [
    ['wanshou_envoy', 496, 576, 'wanshou_envoy'],
    ['wanshou_elder', 1072, 512, 'wanshou_elder'],
  ], 'wanshou_mountain: both named NPCs keep their positions and identities');
  same(map.objects.filter(object => object.type === 'npc').map(object =>
    [object.name, object.x, object.y, object.props.npc]),
  data.points.filter(point => point.type === 'npc').map(point =>
    [point.id, ...point.position, point.properties?.npc]),
  'wanshou_mountain: NPC positions and identities match scene-data points');
  same(map.objects.filter(object => object.name === 'wanshou_elder').map(object =>
    [object.props.trial, object.props.target]), [['trial_sect_wanshou', 'trial_wanshou_pen']],
  'wanshou_mountain: the elder retains the existing trial and target');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 176, 512, 160, 'luoxia_town']],
  'wanshou_mountain: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'wanshou_mountain: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'wanshou_mountain: no monster spawns are introduced');
  same(map.hidden, [], 'wanshou_mountain: no hidden controllers are introduced');
  same(map.spawnGates, [], 'wanshou_mountain: no spawn gates are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'spawn', 'flyZone', 'spawnGate', 'portal'].includes(object.type)), [],
    'wanshou_mountain: no gather, chest, hidden, spawn, flying zone, spawn gate or portal objects are introduced');
  same(map.objects.filter(object => object.name === 'tower_climb_entrance'), [],
    'wanshou_mountain: no decorative tower entrance is introduced');
  same(map.objects.filter(object => !['npc', 'ferry'].includes(object.type)), [],
    'wanshou_mountain: no additional gameplay objects are introduced');
  eq(f.tilemaps, 0, 'wanshou_mountain: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'wanshou_mountain: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'wanshou_mountain: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'wanshou_mountain: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'wanshou_mountain: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'wanshou_mountain: building leaves the Tiled map input unchanged');
}
testWanshouMountainGsb();

// Chiyan's foothill keeps its lava hazards, source patrol extents, two ladders and three ropes.
function testChiyanSlope1Gsb() {
  const sceneId = 'chiyan_slope_1_gsb_v1', revision = 'chiyan1-final-002';
  const data = clone(chiyanSlope1SceneData), tiledMap = clone(chiyanSlope1TiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'chiyan_slope_1: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'chiyan_slope_1: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'chiyan_slope_1: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'chiyan_slope_1: scene-data has the approved geometry revision');
  same([map.width, map.height], [3200, 896], 'chiyan_slope_1: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [3200, 896],
    'chiyan_slope_1: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height], [100, 28], 'chiyan_slope_1: checked-in tile grid is 100 x 28');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'chiyan_slope_1: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'chiyan_slope_1: checked-in tile grid matches logical world dimensions');
  same(f.groups.map(group => group.children.length), [5, 5], 'chiyan_slope_1: five solids and five one-way bodies are built');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_dock', 'solid', [[0, 768], [384, 768]]],
    ['s_low_west', 'solid', [[384, 832], [1536, 832]]],
    ['s_middle', 'solid', [[1536, 768], [2144, 768]]],
    ['s_low_east', 'solid', [[2144, 832], [2432, 832]]],
    ['s_east', 'solid', [[2432, 768], [3200, 768]]],
    ['s_west_low', 'one-way', [[704, 704], [1120, 704]]],
    ['s_west_high', 'one-way', [[896, 576], [1312, 576]]],
    ['s_middle_low', 'one-way', [[1664, 640], [2080, 640]]],
    ['s_middle_high', 'one-way', [[1792, 512], [2272, 512]]],
    ['s_east_high', 'one-way', [[2560, 640], [3040, 640]]],
  ], 'chiyan_slope_1: all ten approved surfaces keep their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `chiyan_slope_1: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'chiyan_slope_1: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'chiyan_slope_1: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 768 }, 'chiyan_slope_1: player start is preserved');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'chiyan_slope_1: player start matches the approved scene spawn point');
  eq(map.ropes.length, 5, 'chiyan_slope_1: both ladders and all three ropes are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind]), [
    ['c_rope_26', 'ladder'], ['c_rope_32', 'rope'], ['c_rope_58', 'rope'],
    ['c_rope_62', 'rope'], ['c_rope_86', 'ladder'],
  ], 'chiyan_slope_1: all five approved climbs keep their identities and corrected kinds');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.filter(object => ['rope', 'ladder'].includes(object.type)).map(object =>
    [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['ladder_26', 'ladder', 830, 704, 36, 128],
    ['rope_32', 'rope', 1040, 576, 0, 128],
    ['rope_58', 'rope', 1872, 640, 0, 128],
    ['rope_62', 'rope', 2000, 512, 0, 128],
    ['ladder_86', 'ladder', 2750, 640, 36, 128],
  ], 'chiyan_slope_1: Tiled climbables retain their approved names, kinds, endpoints and ladder corridors');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'chiyan_slope_1: runtime climb geometry follows approved ends and corridor widths');
  same(map.ropes, [
    { kind: 'ladder', x: 848, top: 704, bottom: 832, halfW: 18 },
    { kind: 'rope', x: 1040, top: 576, bottom: 704, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1872, top: 640, bottom: 768, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 2000, top: 512, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'ladder', x: 2768, top: 640, bottom: 768, halfW: 18 },
  ], 'chiyan_slope_1: all climbables retain their exact centers, ends and grab half-widths');
  same(map.objects.filter(object => object.type === 'ferry').map(object =>
    [object.name, object.x, object.y, object.w, object.props.returnTo]),
  [['ferry_landing', 192, 768, 160, 'luoxia_town']],
  'chiyan_slope_1: ferry landing retains its position, width and return town');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]),
  [['portal_to_slope_2', 3120, 768, 'chiyan_slope_2', 'portal_to_slope_1']],
  'chiyan_slope_1: the east portal retains its position and existing destination');
  same(map.zones.map(zone => [zone.name, zone.x, zone.y, zone.w, zone.h, zone.props.label,
    zone.props.hazard, zone.props.damagePermilleOfMaxHp, zone.props.tickMs, zone.props.knockUp]), [
    ['lava_6', 1280, 800, 128, 32, '岩浆', 'lava', 80, 500, 480],
    ['lava_7', 2240, 800, 128, 32, '岩浆', 'lava', 80, 500, 480],
  ], 'chiyan_slope_1: both lava zones retain their bounds, hazard identity and damage properties');
  same(tiledObjects.filter(object => ['lava_6', 'lava_7'].includes(object.name)).map(object => object.type),
    ['zone', 'zone'], 'chiyan_slope_1: hazards remain Tiled zone objects');
  same(map.zones.map(zone => [zone.name, zone.x, zone.y, zone.w, zone.h, zone.props.hazard,
    zone.props.damagePermilleOfMaxHp, zone.props.tickMs, zone.props.knockUp]),
    data.hazards.map(hazard => {
      const xs = hazard.polygon.map(point => point[0]), ys = hazard.polygon.map(point => point[1]);
      return [hazard.id, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys), hazard.type, hazard.effect.damagePermilleOfMaxHp,
        hazard.effect.tickMs, hazard.effect.knockUp];
    }), 'chiyan_slope_1: runtime hazard bounds and effects match approved scene-data');
  const spawnPoints = data.points.filter(point => point.type === 'spawn');
  const tiledSpawns = tiledObjects.filter(object => object.type === 'spawn');
  same(tiledSpawns.map(object => [object.name, object.x, object.y, object.width]),
    spawnPoints.map(point => [point.id, ...point.sourcePosition!, point.sourceWidth]),
    'chiyan_slope_1: Tiled spawns retain source positions and patrol widths rather than inset center ranges');
  same(spawnPoints.map(point => [point.id, point.position, point.width, point.spawnCenterRange]), [
    ['spawn_lava_lizard_11', [525, 832], 742, [525, 1267]],
    ['spawn_lava_lizard_12', [1421, 832], 102, [1421, 1523]],
    ['spawn_lava_lizard_13', [1549, 768], 582, [1549, 2131]],
    ['spawn_lava_lizard_14', [2445, 768], 582, [2445, 3027]],
    ['spawn_fire_crow_15', [717, 704], 390, [717, 1107]],
    ['spawn_fire_crow_16', [909, 576], 390, [909, 1299]],
    ['spawn_fire_crow_17', [1677, 640], 390, [1677, 2067]],
    ['spawn_fire_crow_18', [1805, 512], 454, [1805, 2259]],
    ['spawn_fire_crow_19', [2573, 640], 454, [2573, 3027]],
  ], 'chiyan_slope_1: scene-data keeps its approved inset spawn center ranges');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['lava_lizard', 512, 832, 768, 3], ['lava_lizard', 1408, 832, 128, 1],
    ['lava_lizard', 1536, 768, 608, 3], ['lava_lizard', 2432, 768, 608, 3],
    ['fire_crow', 704, 704, 416, 2], ['fire_crow', 896, 576, 416, 1],
    ['fire_crow', 1664, 640, 416, 2], ['fire_crow', 1792, 512, 480, 1],
    ['fire_crow', 2560, 640, 480, 2],
  ], 'chiyan_slope_1: all four lizard and five crow spawns retain source patrol extents and counts');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]),
    spawnPoints.map(point => [point.properties?.monster, ...point.sourcePosition!, point.sourceWidth, point.properties?.count]),
    'chiyan_slope_1: runtime monster spawns match scene-data source semantics');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), [
    ['gather_fire_herb_20', 1232, 576, 'fire_herb', 120000],
    ['gather_fire_herb_21', 2192, 512, 'fire_herb', 120000],
    ['gather_fire_herb_22', 2960, 640, 'fire_herb', 120000],
  ], 'chiyan_slope_1: all three gathers retain their positions, items and respawn times');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
  [['sense_chest_01', 944, 576, 'qi_pill', 1]],
  'chiyan_slope_1: the native chest retains its position and loot');
  eq(map.hidden.length, 2, 'chiyan_slope_1: both existing hidden controllers are retained');
  same(map.hidden.map(hidden => [hidden.object.name, hidden.object.x, hidden.object.y,
    hidden.object.w, hidden.object.h, hidden.object.props.enabled, hidden.object.props.reqSpirit,
    hidden.object.props.reveal, hidden.object.props.targetObject ?? null]), [
    ['sense_hidden_chest_01', 944, 576, 0, 0, false, 0, 'chest', 'sense_chest_01'],
    ['sense_hidden_platform_01', 3056, 576, 64, 32, false, 10, 'platform', null],
  ], 'chiyan_slope_1: hidden chest and platform retain their disabled state, geometry and reveal requirements');
  same(map.objects.filter(object => object.type === 'flyZone').map(object =>
    [object.name, object.x, object.y, object.w, object.h]),
  [['flyZone_1', 480, 384, 2000, 256]], 'chiyan_slope_1: the flying zone retains its approved bounds');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'chiyan_slope_1: the scene-only east goal does not introduce a gameplay object');
  same(tiledObjects.filter(object => object.name === 'goal_east'), [],
    'chiyan_slope_1: the scene-only east goal does not introduce a Tiled object');
  eq(f.tilemaps, 0, 'chiyan_slope_1: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'chiyan_slope_1: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'chiyan_slope_1: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'chiyan_slope_1: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'chiyan_slope_1: building leaves cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'chiyan_slope_1: building leaves the Tiled map input unchanged');
}
testChiyanSlope1Gsb();

// Chiyan's lava road retains both portals, ten patrols, lava and all thirteen approved climbs.
function testChiyanSlope2Gsb() {
  const sceneId = 'chiyan_slope_2_gsb_v1', revision = 'slope2-geometry-003';
  const data = clone(chiyanSlope2SceneData), tiledMap = clone(chiyanSlope2TiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'chiyan_slope_2: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'chiyan_slope_2: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'chiyan_slope_2: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'chiyan_slope_2: scene-data has the approved geometry revision');
  same([map.width, map.height], [3520, 960], 'chiyan_slope_2: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [3520, 960],
    'chiyan_slope_2: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height], [110, 30], 'chiyan_slope_2: checked-in tile grid is 110 x 30');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'chiyan_slope_2: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'chiyan_slope_2: checked-in tile grid matches logical world dimensions');
  same([data.surfaces.filter(surface => surface.support === 'solid').length,
    data.surfaces.filter(surface => surface.support === 'one-way').length], [6, 12],
    'chiyan_slope_2: approved surfaces comprise six solids and twelve one-way spans');
  same(f.groups.map(group => group.children.length), [8, 12],
    'chiyan_slope_2: runtime builds six solid surfaces, two approved lava beds and twelve one-way bodies');
  same(data.solids.filter(solid => solid.id.startsWith('bed_lava_')).map(solid => [solid.id, solid.polygon]), [
    ['bed_lava_9', [[960, 896], [1152, 896], [1152, 960], [960, 960]]],
    ['bed_lava_10', [[1920, 896], [2080, 896], [2080, 960], [1920, 960]]],
  ], 'chiyan_slope_2: both approved lava bed polygons remain below the hazards');
  same(f.groups[0].children.map(rectangle).filter(body => body.y === 896 && [960, 1920].includes(body.x)), [
    { x: 960, y: 896, width: 192, height: 64 },
    { x: 1920, y: 896, width: 160, height: 64 },
  ], 'chiyan_slope_2: both lava beds retain their exact runtime collision bounds');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_west', 'solid', [[0, 832], [480, 832]]],
    ['s_low_w', 'solid', [[480, 896], [960, 896]]],
    ['s_low_mid', 'solid', [[1152, 896], [1920, 896]]],
    ['s_bank', 'solid', [[2080, 896], [2112, 896]]],
    ['s_east', 'solid', [[2112, 832], [2752, 832]]],
    ['s_gate', 'solid', [[2752, 768], [3520, 768]]],
    ['s_p16', 'one-way', [[512, 768], [928, 768]]],
    ['s_p20', 'one-way', [[640, 640], [1120, 640]]],
    ['s_p38', 'one-way', [[1216, 768], [1824, 768]]],
    ['s_p42', 'one-way', [[1344, 640], [1888, 640]]],
    ['s_p46', 'one-way', [[1472, 512], [1824, 512]]],
    ['s_p70', 'one-way', [[2240, 704], [2720, 704]]],
    ['s_p74', 'one-way', [[2368, 576], [2848, 576]]],
    ['s_p92', 'one-way', [[2944, 640], [3360, 640]]],
    ['s_bridge1', 'one-way', [[896, 832], [1216, 832]]],
    ['s_bridge2', 'one-way', [[1856, 832], [2144, 832]]],
    ['s_lip_w', 'one-way', [[480, 832], [528, 832]]],
    ['s_lip_e', 'one-way', [[2704, 768], [2752, 768]]],
  ], 'chiyan_slope_2: all eighteen approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `chiyan_slope_2: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'chiyan_slope_2: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'chiyan_slope_2: solid bodies keep all collision directions');
  same(map.spawn, { x: 128, y: 832 }, 'chiyan_slope_2: player start is preserved');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'chiyan_slope_2: player start matches the approved scene spawn point');
  eq(map.ropes.length, 13, 'chiyan_slope_2: all eight ropes and five ladders are retained');
  same(data.climbs.map(climb => [climb.id, climb.kind, climb.ends.start.position, climb.ends.end.position]), [
    ['c_rope_20', 'rope', [656, 896], [656, 768]],
    ['c_rope_24', 'rope', [784, 768], [784, 640]],
    ['c_rope_44', 'rope', [1424, 896], [1424, 768]],
    ['c_rope_50', 'rope', [1616, 768], [1616, 640]],
    ['c_rope_52', 'rope', [1680, 640], [1680, 512]],
    ['c_rope_76', 'rope', [2448, 832], [2448, 704]],
    ['c_rope_82', 'rope', [2640, 704], [2640, 576]],
    ['c_rope_98', 'rope', [3152, 768], [3152, 640]],
    ['c_step_w', 'ladder', [496, 896], [496, 832]],
    ['c_bridge1_w', 'ladder', [944, 896], [944, 832]],
    ['c_bridge1_e', 'ladder', [1168, 896], [1168, 832]],
    ['c_bridge2_w', 'ladder', [1872, 896], [1872, 832]],
    ['c_step_e', 'ladder', [2736, 832], [2736, 768]],
  ], 'chiyan_slope_2: all thirteen approved climbs retain their identities, kinds and both endpoints');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.filter(object => ['rope', 'ladder'].includes(object.type)).map(object =>
    [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_20', 'rope', 656, 768, 0, 128],
    ['rope_24', 'rope', 784, 640, 0, 128],
    ['rope_44', 'rope', 1424, 768, 0, 128],
    ['rope_50', 'rope', 1616, 640, 0, 128],
    ['rope_52', 'rope', 1680, 512, 0, 128],
    ['rope_76', 'rope', 2448, 704, 0, 128],
    ['rope_82', 'rope', 2640, 576, 0, 128],
    ['rope_98', 'rope', 3152, 640, 0, 128],
    ['ladder_step_w', 'ladder', 478, 832, 36, 64],
    ['ladder_bridge1_w', 'ladder', 926, 832, 36, 64],
    ['ladder_bridge1_e', 'ladder', 1150, 832, 36, 64],
    ['ladder_bridge2_w', 'ladder', 1854, 832, 36, 64],
    ['ladder_step_e', 'ladder', 2718, 768, 36, 64],
  ], 'chiyan_slope_2: Tiled keeps eight full-length ropes and creates five ladders with 36px corridors');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => {
      const width = Math.max(...climb.corridor.map(point => point[0])) - Math.min(...climb.corridor.map(point => point[0]));
      return [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1], climb.ends.start.position[1],
        climb.kind === 'ladder' ? Math.max(12, width / 2) : FEEL.ropeGrabRangeX];
    }), 'chiyan_slope_2: runtime climbs retain exact centers, endpoints, rope grab ranges and ladder half-widths');
  same([map.ropes.filter(rope => rope.kind === 'rope').length, map.ropes.filter(rope => rope.kind === 'ladder').length],
    [8, 5], 'chiyan_slope_2: the runtime exposes all eight ropes and five ladders');
  same(map.objects.filter(object => object.type === 'portal').map(object =>
    [object.name, object.x, object.y, object.props.target, object.props.targetPortal]), [
    ['portal_to_slope_1', 80, 832, 'chiyan_slope_1', 'portal_to_slope_2'],
    ['portal_to_core', 3440, 768, 'chiyan_core', 'portal_to_slope_2'],
  ], 'chiyan_slope_2: both portals retain their positions and destinations');
  eq(map.objects.find(object => object.name === 'portal_to_core')?.props.reqLevel,
    55, 'chiyan_slope_2: the preserved core portal retains its level requirement');
  const slope1Objects = chiyanSlope1TiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(slope1Objects.filter(object => object.name === 'portal_to_slope_2').map(object =>
    [object.type, object.x, object.y, object.properties.find(property => property.name === 'target')?.value,
      object.properties.find(property => property.name === 'targetPortal')?.value]),
    [['portal', 3120, 768, 'chiyan_slope_2', 'portal_to_slope_1']],
    'chiyan_slope_2: the mountain-foot portal completes the reciprocal link');
  same(map.zones.map(zone => [zone.name, zone.x, zone.y, zone.w, zone.h, zone.props.label,
    zone.props.hazard, zone.props.damagePermilleOfMaxHp, zone.props.tickMs, zone.props.knockUp]), [
    ['lava_9', 960, 864, 192, 32, '岩浆', 'lava', 80, 500, 480],
    ['lava_10', 1920, 864, 160, 32, '岩浆', 'lava', 80, 500, 480],
  ], 'chiyan_slope_2: both lava zones retain their bounds, identity and damage properties');
  same(tiledObjects.filter(object => ['lava_9', 'lava_10'].includes(object.name)).map(object => object.type),
    ['zone', 'zone'], 'chiyan_slope_2: hazards remain Tiled zone objects');
  same(map.zones.map(zone => [zone.name, zone.x, zone.y, zone.w, zone.h, zone.props.hazard,
    zone.props.damagePermilleOfMaxHp, zone.props.tickMs, zone.props.knockUp]),
    data.hazards.map(hazard => {
      const xs = hazard.polygon.map(point => point[0]), ys = hazard.polygon.map(point => point[1]);
      return [hazard.id, Math.min(...xs), Math.min(...ys), Math.max(...xs) - Math.min(...xs),
        Math.max(...ys) - Math.min(...ys), hazard.hazard, hazard.effect.damagePermilleOfMaxHp,
        hazard.effect.tickMs, hazard.effect.knockUp];
    }), 'chiyan_slope_2: runtime hazard bounds and effects match approved scene-data');
  const spawnPoints = data.points.filter(point => ['spawn', 'monsterSpawn'].includes(point.type) && point.properties?.monster);
  const tiledSpawns = tiledObjects.filter(object => object.type === 'spawn');
  same(tiledSpawns.map(object => [object.name, object.x, object.y, object.width]),
    spawnPoints.map(point => [point.id, ...point.position, point.width]),
    'chiyan_slope_2: all ten monsterSpawn scene points remain Tiled spawns with matching positions and widths');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]), [
    ['flame_puppet', 480, 896, 480, 2], ['flame_puppet', 1152, 896, 768, 3],
    ['flame_puppet', 2112, 832, 640, 3], ['flame_puppet', 2752, 768, 608, 2],
    ['fire_crow', 512, 768, 416, 2], ['fire_crow', 640, 640, 480, 1],
    ['fire_crow', 1344, 640, 544, 2], ['fire_crow', 1472, 512, 352, 1],
    ['fire_crow', 2240, 704, 480, 2], ['fire_crow', 2368, 576, 480, 1],
  ], 'chiyan_slope_2: all four puppet and six crow spawns retain their patrol extents and counts');
  same(map.spawns.map(spawn => [spawn.monster, spawn.x, spawn.y, spawn.w, spawn.count]),
    spawnPoints.map(point => [point.properties?.monster, ...point.position, point.width, point.properties?.count]),
    'chiyan_slope_2: runtime monster spawns match approved scene point semantics');
  same(map.objects.filter(object => object.type === 'gather').map(object =>
    [object.name, object.x, object.y, object.props.item, object.props.respawnMs]), [
    ['gather_fire_herb_24', 1744, 512, 'fire_herb', 120000],
    ['gather_fire_herb_25', 2768, 576, 'fire_herb', 120000],
    ['gather_fire_herb_26', 3216, 640, 'fire_herb', 120000],
  ], 'chiyan_slope_2: all three gathers retain their positions, items and respawn times');
  same(map.objects.filter(object => object.type === 'chest').map(object =>
    [object.name, object.x, object.y, object.props.loot, object.props.count]),
    [['sense_chest_01', 3024, 640, 'qi_pill', 1]],
    'chiyan_slope_2: the native chest retains its position and loot');
  eq(map.hidden.length, 2, 'chiyan_slope_2: both existing hidden controllers are retained');
  same(map.hidden.map(hidden => [hidden.object.name, hidden.object.x, hidden.object.y,
    hidden.object.w, hidden.object.h, hidden.object.props.enabled, hidden.object.props.reqSpirit,
    hidden.object.props.reveal, hidden.object.props.targetObject ?? null]), [
    ['sense_hidden_chest_01', 3024, 640, 0, 0, false, 0, 'chest', 'sense_chest_01'],
    ['sense_hidden_platform_01', 560, 576, 64, 32, false, 10, 'platform', null],
  ], 'chiyan_slope_2: hidden chest and platform retain their disabled state, geometry and reveal requirements');
  same(map.objects.filter(object => object.type === 'flyZone').map(object =>
    [object.name, object.x, object.y, object.w, object.h]),
    [['flyZone_1', 480, 400, 2200, 272]], 'chiyan_slope_2: the flying zone retains its approved bounds');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'chiyan_slope_2: the scene-only east goal does not introduce a gameplay object');
  same(tiledObjects.filter(object => object.name === 'goal_east'), [],
    'chiyan_slope_2: the scene-only east goal does not introduce a Tiled object');
  eq(f.tilemaps, 0, 'chiyan_slope_2: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'chiyan_slope_2: GSB draws background and playable art without legacy terrain or climbs');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'chiyan_slope_2: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'chiyan_slope_2: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'chiyan_slope_2: building leaves cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'chiyan_slope_2: building leaves the Tiled map input unchanged');
}
testChiyanSlope2Gsb();

// Lingfu's trial retains its drawing desk and eight targets with four approved ropes.
function testTrialLingfuRangeGsb() {
  const sceneId = 'trial_lingfu_range_gsb_v1', revision = 'trial-lingfu-final-002';
  const data = clone(trialLingfuRangeSceneData), tiledMap = clone(trialLingfuRangeTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'trial_lingfu_range: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'trial_lingfu_range: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'trial_lingfu_range: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'trial_lingfu_range: scene-data has the approved geometry revision');
  same([map.width, map.height], [1792, 704], 'trial_lingfu_range: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1792, 704],
    'trial_lingfu_range: scene-data declares the approved logical dimensions');
  eq(data.space.sourceMap, 'maps/trial_lingfu_range.json', 'trial_lingfu_range: scene-data identifies the original trial map');
  same([tiledMap.width, tiledMap.height], [56, 22], 'trial_lingfu_range: checked-in tile grid is 56 x 22');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'trial_lingfu_range: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'trial_lingfu_range: checked-in tile grid matches logical world dimensions');
  same(Object.fromEntries(tiledMap.properties.filter(property => !['gsbScene', 'gsbGeometryRevision'].includes(property.name))
    .map(property => [property.name, property.value])), {
    id: 'trial_lingfu_range', name: '灵符派·符阁靶场', safeZone: false, qiDensity: 4, area: 'lingfu',
    trial: 'trial_sect_lingfu', returnTown: false, allowTalismanReturn: false,
  }, 'trial_lingfu_range: all existing map properties and trial identity are preserved');
  same([map.id, map.trial, map.safeZone], ['trial_lingfu_range', 'trial_sect_lingfu', false],
    'trial_lingfu_range: the built map retains its identity, trial flow and unsafe zone');
  same(f.groups.map(group => group.children.length), [2, 4], 'trial_lingfu_range: two solids and four one-way bodies are built');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_pavilion', 'solid', [[0, 576], [384, 576]]],
    ['s_ground', 'solid', [[384, 640], [1792, 640]]],
    ['s_low', 'one-way', [[832, 512], [1184, 512]]],
    ['s_west', 'one-way', [[608, 416], [832, 416]]],
    ['s_high', 'one-way', [[1216, 384], [1440, 384]]],
    ['s_east', 'one-way', [[1536, 448], [1728, 448]]],
  ], 'trial_lingfu_range: all six approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `trial_lingfu_range: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'trial_lingfu_range: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'trial_lingfu_range: solid bodies keep all collision directions');
  same(map.spawn, { x: 96, y: 576 }, 'trial_lingfu_range: player start is on the approved pavilion surface');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'trial_lingfu_range: player start matches the approved scene spawn point');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.filter(object => object.type === 'playerStart').map(object =>
    [object.name, object.x, object.y, object.width, object.height]),
  [['playerStart', 96, 576, 0, 0]], 'trial_lingfu_range: Tiled retains exactly one approved player start');
  eq(map.ropes.length, 4, 'trial_lingfu_range: all four ropes are preserved');
  same([...data.climbs].sort((a, b) => a.ends.end.position[0] - b.ends.end.position[0]).map(climb =>
    [climb.id, climb.kind, climb.ends.start.position, climb.ends.start.surface,
      climb.ends.end.position, climb.ends.end.surface, climb.corridor]), [
    ['rope_21', 'rope', [688, 640], 's_ground', [688, 416], 's_west', [[670, 416], [706, 416], [706, 640], [670, 640]]],
    ['rope_28', 'rope', [912, 640], 's_ground', [912, 512], 's_low', [[894, 512], [930, 512], [930, 640], [894, 640]]],
    ['rope_40', 'rope', [1296, 640], 's_ground', [1296, 384], 's_high', [[1278, 384], [1314, 384], [1314, 640], [1278, 640]]],
    ['rope_51', 'rope', [1648, 640], 's_ground', [1648, 448], 's_east', [[1630, 448], [1666, 448], [1666, 640], [1630, 640]]],
  ], 'trial_lingfu_range: all climbs keep their rope identities, surface bindings, endpoints and 36px corridors');
  same(tiledObjects.filter(object => ['rope', 'ladder'].includes(object.type)).sort((a, b) => a.x - b.x)
    .map(object => [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_21', 'rope', 688, 416, 0, 224],
    ['rope_28', 'rope', 912, 512, 0, 128],
    ['rope_40', 'rope', 1296, 384, 0, 256],
    ['rope_51', 'rope', 1648, 448, 0, 192],
  ], 'trial_lingfu_range: the four named Tiled climbables are ropes with approved geometry and no ladder');
  same([...map.ropes].sort((a, b) => a.x - b.x), [
    { kind: 'rope', x: 688, top: 416, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 912, top: 512, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1296, top: 384, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1648, top: 448, bottom: 640, halfW: FEEL.ropeGrabRangeX },
  ], 'trial_lingfu_range: all runtime ropes keep exact endpoints and FEEL grab half-width');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'trial_lingfu_range: runtime ropes match the approved scene climbs');
  const trialObjects = [
    ['draw_desk_6', 'draw_desk', 240, 576, { talismans: 3 }],
    ['target_spot_7', 'target_spot', 528, 640, {}],
    ['target_spot_8', 'target_spot', 976, 640, { moveRange: 128 }],
    ['target_spot_9', 'target_spot', 1200, 640, {}],
    ['target_spot_10', 'target_spot', 1424, 640, { moveRange: 128 }],
    ['target_spot_11', 'target_spot', 1008, 512, { moveRange: 128 }],
    ['target_spot_12', 'target_spot', 752, 416, { high: true }],
    ['target_spot_13', 'target_spot', 1360, 384, { high: true }],
    ['target_spot_14', 'target_spot', 1616, 448, { high: true }],
  ];
  same(map.objects.map(object => [object.name, object.type, object.x, object.y, object.props]), trialObjects,
    'trial_lingfu_range: the drawing desk and eight targets retain approved positions and all gameplay properties');
  same(data.points.filter(point => ['draw_desk', 'target_spot'].includes(point.type)).map(point =>
    [point.id, point.type, ...point.position, point.properties]), trialObjects,
  'trial_lingfu_range: retained gameplay objects agree with scene-data points');
  same(tiledObjects.filter(object => ['draw_desk', 'target_spot'].includes(object.type)).map(object =>
    [object.name, object.type, object.x, object.y,
      Object.fromEntries(object.properties.map(property => [property.name, property.value]))]), trialObjects,
  'trial_lingfu_range: Tiled retains the desk talismans, moving targets and high targets');
  same(map.objects.filter(object => object.name === 'goal_east'), [],
    'trial_lingfu_range: the scene-only east goal does not introduce a gameplay object');
  same(map.spawns, [], 'trial_lingfu_range: no monster spawns are introduced');
  same(map.hidden, [], 'trial_lingfu_range: no hidden controllers are introduced');
  same(map.spawnGates, [], 'trial_lingfu_range: no spawn gates are introduced');
  same(map.zones, [], 'trial_lingfu_range: no extra gameplay zones are introduced');
  same(map.objects.filter(object => ['gather', 'chest', 'hidden', 'spawn', 'flyZone', 'spawnGate', 'portal'].includes(object.type)), [],
    'trial_lingfu_range: no gather, chest, hidden, spawn, flying zone, spawn gate or portal objects are introduced');
  eq(f.tilemaps, 0, 'trial_lingfu_range: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'trial_lingfu_range: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'trial_lingfu_range: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'trial_lingfu_range: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'trial_lingfu_range: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'trial_lingfu_range: building leaves the Tiled map input unchanged');
}
testTrialLingfuRangeGsb();

// Taixu's trial retains five lamps and two spawn gates with three approved ropes.
function testTrialTaixuStageGsb() {
  const sceneId = 'trial_taixu_stage_gsb_v1', revision = 'taixu-stage-final-003';
  const data = clone(trialTaixuStageSceneData), tiledMap = clone(trialTaixuStageTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'trial_taixu_stage: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'trial_taixu_stage: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'trial_taixu_stage: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'trial_taixu_stage: scene-data has the approved geometry revision');
  same([map.width, map.height], [1600, 704], 'trial_taixu_stage: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1600, 704],
    'trial_taixu_stage: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height], [50, 22], 'trial_taixu_stage: checked-in tile grid is 50 x 22');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'trial_taixu_stage: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'trial_taixu_stage: checked-in tile grid matches logical world dimensions');
  same(Object.fromEntries(tiledMap.properties.filter(property => !['gsbScene', 'gsbGeometryRevision'].includes(property.name))
    .map(property => [property.name, property.value])), {
    id: 'trial_taixu_stage', name: '太虚观·演法台', safeZone: false, qiDensity: 4, area: 'taixu',
    trial: 'trial_sect_taixu', returnTown: false, allowTalismanReturn: false,
  }, 'trial_taixu_stage: all existing map properties and trial identity are preserved');
  same([map.id, map.trial, map.safeZone], ['trial_taixu_stage', 'trial_sect_taixu', false],
    'trial_taixu_stage: the built map retains its identity, trial flow and unsafe zone');
  // The approved full scene has two thick polygon blockers and three exposed solid standing surfaces.
  same(f.groups.map(group => group.children.length), [2, 5], 'trial_taixu_stage: two approved polygon blockers and five one-way bodies are built');
  same(f.groups[0].children.map(rectangle), [
    { x: 0, y: 640, width: 1600, height: 64 },
    { x: 512, y: 576, width: 576, height: 64 },
  ], 'trial_taixu_stage: the full map preserves approved ground and altar polygon thickness without duplicate surface bodies');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_ground_left', 'solid', [[0, 640], [512, 640]]],
    ['s_altar', 'solid', [[512, 576], [1088, 576]]],
    ['s_ground_right', 'solid', [[1088, 640], [1600, 640]]],
    ['s_side_left', 'one-way', [[160, 544], [384, 544]]],
    ['s_mid_left', 'one-way', [[448, 448], [736, 448]]],
    ['s_top', 'one-way', [[672, 320], [928, 320]]],
    ['s_mid_right', 'one-way', [[864, 448], [1152, 448]]],
    ['s_side_right', 'one-way', [[1216, 544], [1440, 544]]],
  ], 'trial_taixu_stage: all eight approved surfaces retain their identities, kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `trial_taixu_stage: ${surface.id} retains its full landing span and exact top edge`);
  }
  // This independent fallback omits polygons; it does not describe the full map's body count.
  const surfaceOnlyData = { ...clone(data), solids: [] }, surfaceOnlyTiledMap = clone(tiledMap);
  const surfaceOnlyDataBefore = JSON.stringify(surfaceOnlyData), surfaceOnlyMapBefore = JSON.stringify(surfaceOnlyTiledMap);
  const surfaceOnlyFixture = fixture(null, false);
  surfaceOnlyFixture.cache.clear(); surfaceOnlyFixture.cache.set(`gsb_${sceneId}_data`, surfaceOnlyData);
  surfaceOnlyFixture.textures.add(`gsb_${sceneId}_background`); surfaceOnlyFixture.textures.add(`gsb_${sceneId}_playable`);
  buildTiledMap(surfaceOnlyFixture.scene, surfaceOnlyTiledMap, 'tiles');
  same(surfaceOnlyFixture.groups.map(group => group.children.length), [3, 5],
    'trial_taixu_stage: the independent surface-only fallback builds three solid and five one-way bodies');
  same(surfaceOnlyFixture.groups[0].children.map(rectangle), [
    { x: 0, y: 640, width: 512, height: FEEL.tile },
    { x: 512, y: 576, width: 576, height: FEEL.tile },
    { x: 1088, y: 640, width: 512, height: FEEL.tile },
  ], 'trial_taixu_stage: surface-only fallback collision spans exactly match all three approved solid surfaces');
  eq(JSON.stringify(surfaceOnlyData), surfaceOnlyDataBefore,
    'trial_taixu_stage: surface-only fallback leaves its cached scene-data input unchanged');
  eq(JSON.stringify(surfaceOnlyTiledMap), surfaceOnlyMapBefore,
    'trial_taixu_stage: surface-only fallback leaves its Tiled map input unchanged');
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'trial_taixu_stage: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'trial_taixu_stage: solid bodies keep all collision directions');
  same(map.spawn, { x: 768, y: 576 }, 'trial_taixu_stage: player start is on the approved altar surface');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'trial_taixu_stage: player start matches the approved scene spawn point');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.filter(object => object.type === 'playerStart').map(object =>
    [object.name, object.x, object.y, object.width, object.height]),
  [['playerStart', 768, 576, 0, 0]], 'trial_taixu_stage: Tiled retains exactly one approved player start');
  eq(map.ropes.length, 3, 'trial_taixu_stage: all three ropes are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind, climb.ends.start.position, climb.ends.start.surface,
    climb.ends.end.position, climb.ends.end.surface, climb.corridor]), [
    ['rope_18', 'rope', [592, 576], 's_altar', [592, 448], 's_mid_left', [[574, 448], [610, 448], [610, 576], [574, 576]]],
    ['rope_31', 'rope', [1008, 576], 's_altar', [1008, 448], 's_mid_right', [[990, 448], [1026, 448], [1026, 576], [990, 576]]],
    ['rope_22', 'rope', [720, 448], 's_mid_left', [720, 320], 's_top', [[702, 320], [738, 320], [738, 448], [702, 448]]],
  ], 'trial_taixu_stage: all climbs keep their rope identities, surface bindings, endpoints and 36px corridors');
  same(tiledObjects.filter(object => ['rope', 'ladder'].includes(object.type)).map(object =>
    [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_18', 'rope', 592, 448, 0, 128],
    ['rope_31', 'rope', 1008, 448, 0, 128],
    ['rope_22', 'rope', 720, 320, 0, 128],
  ], 'trial_taixu_stage: the three named Tiled climbables are ropes with approved geometry and no ladder');
  same(map.ropes, [
    { kind: 'rope', x: 592, top: 448, bottom: 576, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1008, top: 448, bottom: 576, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 720, top: 320, bottom: 448, halfW: FEEL.ropeGrabRangeX },
  ], 'trial_taixu_stage: all runtime ropes keep exact endpoints and FEEL grab half-width');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'trial_taixu_stage: runtime ropes match the approved scene climbs');
  const lamps = [
    ['lamp_5', 272, 544, { sprite: 'prop_trial_lamp' }],
    ['lamp_6', 528, 448, { sprite: 'prop_trial_lamp' }],
    ['lamp_7', 784, 320, { sprite: 'prop_trial_lamp' }],
    ['lamp_8', 1072, 448, { sprite: 'prop_trial_lamp' }],
    ['lamp_9', 1328, 544, { sprite: 'prop_trial_lamp' }],
  ];
  same(map.objects.filter(object => object.type === 'lamp').map(object =>
    [object.name, object.x, object.y, object.props]), lamps,
  'trial_taixu_stage: all five lamps retain approved positions and trial lamp sprites');
  same(data.points.filter(point => point.type === 'lamp').map(point =>
    [point.id, ...point.position, point.properties]), lamps,
  'trial_taixu_stage: retained lamps agree with scene-data points');
  same(tiledObjects.filter(object => object.type === 'lamp').map(object =>
    [object.name, object.x, object.y, Object.fromEntries(object.properties.map(property => [property.name, property.value]))]),
  lamps, 'trial_taixu_stage: Tiled retains all five lamp identities, positions and sprites');
  same(map.spawnGates, [
    { type: 'spawnGate', name: 'gate_left', x: 80, y: 640, w: 0, h: 0, props: { side: 'left' } },
    { type: 'spawnGate', name: 'gate_right', x: 1520, y: 640, w: 0, h: 0, props: { side: 'right' } },
  ], 'trial_taixu_stage: both spawn gates retain approved positions and sides');
  same(map.objects.filter(object => object.type === 'spawnGate'), map.spawnGates,
    'trial_taixu_stage: spawn gates remain available through gameplay objects');
  same(map.spawnGates.map(object => [object.name, object.x, object.y, object.props]),
    data.points.filter(point => point.type === 'spawnGate').map(point => [point.id, ...point.position, point.properties]),
    'trial_taixu_stage: spawn gate positions and sides match the approved scene points');
  same(map.objects.filter(object => !['lamp', 'spawnGate'].includes(object.type)), [],
    'trial_taixu_stage: only the approved lamps and spawn gates accompany the trial');
  same(map.spawns, [], 'trial_taixu_stage: no monster spawns are introduced');
  same(map.hidden, [], 'trial_taixu_stage: no hidden controllers are introduced');
  same(map.zones, [], 'trial_taixu_stage: no extra gameplay zones are introduced');
  eq(f.tilemaps, 0, 'trial_taixu_stage: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'trial_taixu_stage: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'trial_taixu_stage: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'trial_taixu_stage: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'trial_taixu_stage: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'trial_taixu_stage: building leaves the Tiled map input unchanged');
}
testTrialTaixuStageGsb();

// Approved scene-data SHA256: 4a420537d95d8b48e1c8454db16789d8a11f8aa5d43253ec01ccfa6bced88fbd.
// Youying's night trial retains its token, patrols and shadow/return zones with five approved ropes.
function testTrialYouyingVaultGsb() {
  const sceneId = 'trial_youying_vault_gsb_v1', revision = 'trial-youying-final-002';
  const data = clone(trialYouyingVaultSceneData), tiledMap = clone(trialYouyingVaultTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'trial_youying_vault: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'trial_youying_vault: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'trial_youying_vault: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'trial_youying_vault: scene-data has the approved geometry revision');
  same([map.width, map.height], [1792, 704], 'trial_youying_vault: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1792, 704],
    'trial_youying_vault: scene-data declares the approved logical dimensions');
  eq(data.space.sourceMap, 'maps/trial_youying_vault.json', 'trial_youying_vault: scene-data identifies the original trial map');
  same([tiledMap.width, tiledMap.height], [56, 22], 'trial_youying_vault: checked-in tile grid is 56 x 22');
  same([tiledMap.tilewidth, tiledMap.tileheight], [32, 32], 'trial_youying_vault: checked-in tiles are 32 x 32');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'trial_youying_vault: checked-in tile grid matches logical world dimensions');
  same(Object.fromEntries(tiledMap.properties.filter(property => !['gsbScene', 'gsbGeometryRevision'].includes(property.name))
    .map(property => [property.name, property.value])), {
    id: 'trial_youying_vault', name: '幽影楼·夜藏宝阁', safeZone: false, qiDensity: 4, area: 'youying',
    trial: 'trial_sect_youying', night: true, returnTown: false, allowTalismanReturn: false,
  }, 'trial_youying_vault: all existing map properties and night trial identity are preserved');
  same([data.trial, data.area, data.night, data.qiDensity, data.safeZone],
    ['trial_sect_youying', 'youying', true, 4, false], 'trial_youying_vault: scene-data retains the existing trial environment');
  same([map.id, map.trial, map.night, map.safeZone], ['trial_youying_vault', 'trial_sect_youying', true, false],
    'trial_youying_vault: the built map retains its identity, trial flow and unsafe night setting');
  same(data.solids.map(solid => [solid.id, solid.surface, solid.polygon]), [
    ['solid_ground', 's_ground', [[0, 640], [1792, 640], [1792, 704], [0, 704]]],
    ['solid_token', 's_token', [[1632, 544], [1792, 544], [1792, 640], [1632, 640]]],
  ], 'trial_youying_vault: both solid polygons retain their approved spans and thickness');
  same(f.groups.map(group => group.children.length), [2, 3],
    'trial_youying_vault: the full map builds two solid polygon bodies and three one-way bodies');
  same(f.groups[0].children.map(rectangle), [
    { x: 0, y: 640, width: 1792, height: 64 },
    { x: 1632, y: 544, width: 160, height: 96 },
  ], 'trial_youying_vault: the full map preserves the foundation and token dais without duplicate surface bodies');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_ground', 'solid', [[0, 640], [1632, 640]]],
    ['s_token', 'solid', [[1632, 544], [1792, 544]]],
    ['s_west', 'one-way', [[160, 512], [1024, 512]]],
    ['s_library', 'one-way', [[1216, 512], [1568, 512]]],
    ['s_upper', 'one-way', [[1024, 384], [1792, 384]]],
  ], 'trial_youying_vault: all five approved surfaces retain their identities, support kinds and exact landing spans');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x <= left && body.x + body.width >= right),
      `trial_youying_vault: ${surface.id} retains its full landing span and exact top edge`);
  }
  same(f.groups[1].children.map(rectangle), [
    { x: 160, y: 512, width: 864, height: SPEC.oneWayEdge },
    { x: 1216, y: 512, width: 352, height: SPEC.oneWayEdge },
    { x: 1024, y: 384, width: 768, height: SPEC.oneWayEdge },
  ], 'trial_youying_vault: all three one-way bodies use exact approved top edges and spans');
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'trial_youying_vault: all one-way bodies only collide on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'trial_youying_vault: solid bodies keep all collision directions');
  const surfaceOnlyData = { ...clone(data), solids: [] }, surfaceOnlyTiledMap = clone(tiledMap);
  const surfaceOnlyDataBefore = JSON.stringify(surfaceOnlyData), surfaceOnlyMapBefore = JSON.stringify(surfaceOnlyTiledMap);
  const surfaceOnlyFixture = fixture(null, false);
  surfaceOnlyFixture.cache.clear(); surfaceOnlyFixture.cache.set(`gsb_${sceneId}_data`, surfaceOnlyData);
  surfaceOnlyFixture.textures.add(`gsb_${sceneId}_background`); surfaceOnlyFixture.textures.add(`gsb_${sceneId}_playable`);
  buildTiledMap(surfaceOnlyFixture.scene, surfaceOnlyTiledMap, 'tiles');
  same(surfaceOnlyFixture.groups.map(group => group.children.length), [2, 3],
    'trial_youying_vault: the independent surface-only fallback builds two solid and three one-way bodies');
  same(surfaceOnlyFixture.groups[0].children.map(rectangle), [
    { x: 0, y: 640, width: 1632, height: FEEL.tile },
    { x: 1632, y: 544, width: 160, height: FEEL.tile },
  ], 'trial_youying_vault: surface-only fallback collision spans exactly match both approved solid surfaces');
  same(surfaceOnlyFixture.groups[1].children.map(rectangle), f.groups[1].children.map(rectangle),
    'trial_youying_vault: surface-only fallback retains all three approved one-way bodies');
  eq(JSON.stringify(surfaceOnlyData), surfaceOnlyDataBefore,
    'trial_youying_vault: surface-only fallback leaves its cached scene-data input unchanged');
  eq(JSON.stringify(surfaceOnlyTiledMap), surfaceOnlyMapBefore,
    'trial_youying_vault: surface-only fallback leaves its Tiled map input unchanged');
  same(map.spawn, { x: 64, y: 640 }, 'trial_youying_vault: player starts at the approved ground spawn');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'trial_youying_vault: player start matches the approved scene spawn point');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.filter(object => object.type === 'playerStart').map(object =>
    [object.name, object.x, object.y, object.width, object.height]),
  [['playerStart', 64, 640, 0, 0]], 'trial_youying_vault: Tiled retains exactly one approved player start');
  eq(map.ropes.length, 5, 'trial_youying_vault: all five ropes are preserved');
  same(data.climbs.map(climb => [climb.id, climb.kind, climb.ends.start.position, climb.ends.start.surface,
    climb.ends.end.position, climb.ends.end.surface, climb.corridor]), [
    ['rope_6', 'rope', [208, 640], 's_ground', [208, 512], 's_west', [[190, 512], [226, 512], [226, 640], [190, 640]]],
    ['rope_31', 'rope', [1008, 640], 's_ground', [1008, 512], 's_west', [[990, 512], [1026, 512], [1026, 640], [990, 640]]],
    ['rope_39', 'rope', [1264, 640], 's_ground', [1264, 512], 's_library', [[1246, 512], [1282, 512], [1282, 640], [1246, 640]]],
    ['rope_33', 'rope', [1072, 640], 's_ground', [1072, 384], 's_upper', [[1054, 384], [1090, 384], [1090, 640], [1054, 640]]],
    ['rope_53', 'rope', [1712, 544], 's_token', [1712, 384], 's_upper', [[1694, 384], [1730, 384], [1730, 544], [1694, 544]]],
  ], 'trial_youying_vault: all climbs keep rope identities, surface bindings, exact endpoints and 36px corridors');
  same(tiledObjects.filter(object => ['rope', 'ladder'].includes(object.type)).map(object =>
    [object.name, object.type, object.x, object.y, object.width, object.height]), [
    ['rope_6', 'rope', 208, 512, 0, 128],
    ['rope_31', 'rope', 1008, 512, 0, 128],
    ['rope_39', 'rope', 1264, 512, 0, 128],
    ['rope_33', 'rope', 1072, 384, 0, 256],
    ['rope_53', 'rope', 1712, 384, 0, 160],
  ], 'trial_youying_vault: five named Tiled ropes reach their approved bearing surfaces');
  same(map.ropes, [
    { kind: 'rope', x: 208, top: 512, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1008, top: 512, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1264, top: 512, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1072, top: 384, bottom: 640, halfW: FEEL.ropeGrabRangeX },
    { kind: 'rope', x: 1712, top: 384, bottom: 544, halfW: FEEL.ropeGrabRangeX },
  ], 'trial_youying_vault: all runtime ropes keep exact endpoints and FEEL grab half-width');
  same(map.ropes.map(rope => [rope.kind, rope.x, rope.top, rope.bottom, rope.halfW]),
    data.climbs.map(climb => [climb.kind, climb.ends.end.position[0], climb.ends.end.position[1],
      climb.ends.start.position[1], FEEL.ropeGrabRangeX]),
    'trial_youying_vault: runtime ropes match the approved scene climbs');
  const token = [['token_8', 'token', 1744, 544, { item: 'shadow_token' }]];
  same(map.objects.filter(object => object.type === 'token').map(object =>
    [object.name, object.type, object.x, object.y, object.props]), token,
  'trial_youying_vault: the existing named token retains its approved position and shadow_token item');
  same(tiledObjects.filter(object => object.type === 'token').map(object =>
    [object.name, object.type, object.x, object.y, Object.fromEntries(object.properties.map(property => [property.name, property.value]))]),
  token, 'trial_youying_vault: Tiled retains exactly the existing token object');
  same(data.points.filter(point => point.id === 'shadow_token').map(point => [point.position, point.properties]),
    [[[1744, 544], { item: 'shadow_token' }]], 'trial_youying_vault: token agrees with the approved scene goal');
  const patrols = [
    ['patrol_1', 'patrol_path', 448, 640, 320, 0,
      { index: 1, monster: 'youying_patrol', startX: 464, endX: 784, turnPauseMs: 1500, visionLength: 192, visionHalfAngleDeg: 15 }],
    ['patrol_2', 'patrol_path', 1280, 512, 192, 0,
      { index: 2, monster: 'youying_patrol', startX: 1296, endX: 1488, turnPauseMs: 1500, visionLength: 192, visionHalfAngleDeg: 15 }],
    ['patrol_3', 'patrol_path', 1344, 640, 192, 0,
      { index: 3, monster: 'youying_patrol', startX: 1360, endX: 1552, turnPauseMs: 1500, visionLength: 192, visionHalfAngleDeg: 15 }],
  ];
  same(map.objects.filter(object => object.type === 'patrol_path').map(object =>
    [object.name, object.type, object.x, object.y, object.w, object.h, object.props]), patrols,
  'trial_youying_vault: all three named patrols preserve positions, path sizes, monster, endpoints, pauses and vision');
  same(tiledObjects.filter(object => object.type === 'patrol_path').map(object =>
    [object.name, object.type, object.x, object.y, object.width, object.height,
      Object.fromEntries(object.properties.map(property => [property.name, property.value]))]), patrols,
  'trial_youying_vault: Tiled retains all three patrol paths and every gameplay property');
  same(map.objects.filter(object => object.type === 'patrol_path').map(object =>
    [object.name, object.type, object.x, object.y, object.props]),
  data.patrols.map(patrol => [patrol.id, patrol.type, ...patrol.position, patrol.properties]),
  'trial_youying_vault: retained patrol identities, positions and properties match scene-data');
  const zones = [
    ['return_point', 0, 544, 160, 96, { label: '起点（交令牌）', kind: 'return_point' }],
    ['shadow_18', 576, 576, 64, 64, { label: '阴影', kind: 'shadow' }],
    ['shadow_36', 1152, 576, 64, 64, { label: '阴影', kind: 'shadow' }],
  ];
  same(map.zones.map(zone => [zone.name, zone.x, zone.y, zone.w, zone.h, zone.props]), zones,
    'trial_youying_vault: the return point and both named shadow zones preserve exact rectangles and properties');
  same(tiledObjects.filter(object => object.type === 'zone').map(object =>
    [object.name, object.x, object.y, object.width, object.height,
      Object.fromEntries(object.properties.map(property => [property.name, property.value]))]), zones,
  'trial_youying_vault: Tiled retains the return zone and both shadow zones');
  same(map.zones.map(zone => [zone.name, [[zone.x, zone.y], [zone.x + zone.w, zone.y],
    [zone.x + zone.w, zone.y + zone.h], [zone.x, zone.y + zone.h]], zone.props]),
  data.zones.map(zone => [zone.sourceName, zone.polygon, zone.properties]),
  'trial_youying_vault: all retained gameplay zones agree with approved scene polygons');
  const returnZone = map.zones.find(zone => zone.name === 'return_point')!;
  ok(map.spawn.x >= returnZone.x && map.spawn.x <= returnZone.x + returnZone.w &&
    map.spawn.y >= returnZone.y && map.spawn.y <= returnZone.y + returnZone.h,
  'trial_youying_vault: the token return zone still includes the natural spawn');
  same(map.objects.filter(object => !['token', 'patrol_path'].includes(object.type)), [],
    'trial_youying_vault: only the approved token and patrol paths accompany the gameplay zones');
  same(map.spawns, [], 'trial_youying_vault: no independent monster spawns are introduced');
  same(map.spawnGates, [], 'trial_youying_vault: no spawn gates are introduced');
  same(map.hidden, [], 'trial_youying_vault: no hidden controllers are introduced');
  eq(f.tilemaps, 0, 'trial_youying_vault: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'trial_youying_vault: GSB draws background and playable art without legacy terrain or ropes');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'trial_youying_vault: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'trial_youying_vault: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'trial_youying_vault: building leaves the cached scene-data input unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'trial_youying_vault: building leaves the Tiled map input unchanged');
}
testTrialYouyingVaultGsb();

// Wanshou's pen keeps its mandrill spawn and both wave gates on three approved standing surfaces.
function testTrialWanshouPenGsb() {
  const sceneId = 'trial_wanshou_pen_gsb_v1', revision = 'trial-wanshou-final-002';
  const data = clone(trialWanshouPenSceneData), tiledMap = clone(trialWanshouPenTiledMap);
  const f = fixture(null, false), dataBefore = JSON.stringify(data), mapBefore = JSON.stringify(tiledMap);
  f.cache.clear(); f.cache.set(`gsb_${sceneId}_data`, data);
  f.textures.add(`gsb_${sceneId}_background`); f.textures.add(`gsb_${sceneId}_playable`);
  const map = buildTiledMap(f.scene, tiledMap, 'tiles');
  eq(map.gsbScene, sceneId, 'trial_wanshou_pen: checked-in map enables its GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbScene')?.value,
    sceneId, 'trial_wanshou_pen: map binds the approved GSB scene');
  eq(tiledMap.properties.find(property => property.name === 'gsbGeometryRevision')?.value,
    revision, 'trial_wanshou_pen: map binds the approved geometry revision');
  eq(data.geometryRevision, revision, 'trial_wanshou_pen: scene-data has the approved geometry revision');
  same([map.width, map.height], [1600, 640], 'trial_wanshou_pen: logical world dimensions match the approved scene');
  same([data.space.logicalWidth, data.space.logicalHeight], [1600, 640],
    'trial_wanshou_pen: scene-data declares the approved logical dimensions');
  same([tiledMap.width, tiledMap.height, tiledMap.tilewidth, tiledMap.tileheight], [50, 20, 32, 32],
    'trial_wanshou_pen: checked-in tile grid is 50 x 20 with 32px tiles');
  same([tiledMap.width * tiledMap.tilewidth, tiledMap.height * tiledMap.tileheight], [map.width, map.height],
    'trial_wanshou_pen: checked-in tile grid matches logical world dimensions');
  same(Object.fromEntries(tiledMap.properties.filter(property => !['gsbScene', 'gsbGeometryRevision'].includes(property.name))
    .map(property => [property.name, property.value])), {
    id: 'trial_wanshou_pen', name: '万兽山·兽栏', safeZone: false, qiDensity: 4, area: 'wanshou',
    trial: 'trial_sect_wanshou', returnTown: false, allowTalismanReturn: false,
  }, 'trial_wanshou_pen: every existing map property and trial identity is preserved');
  eq(data.source.path, 'maps/trial_wanshou_pen.json', 'trial_wanshou_pen: scene-data identifies the original trial map');
  same(data.source.properties, { qiDensity: 4, area: 'wanshou', trial: 'trial_sect_wanshou', safeZone: false },
    'trial_wanshou_pen: scene-data retains the existing trial environment');
  same([map.id, map.trial, map.safeZone], ['trial_wanshou_pen', 'trial_sect_wanshou', false],
    'trial_wanshou_pen: the built map retains its identity, trial flow and unsafe zone');
  same(data.surfaces.map(surface => [surface.id, surface.support, surface.polyline]), [
    ['s_ground', 'solid', [[0, 576], [1600, 576]]],
    ['s_pen_left', 'one-way', [[128, 480], [352, 480]]],
    ['s_pen_right', 'one-way', [[1248, 480], [1472, 480]]],
  ], 'trial_wanshou_pen: all three surfaces retain their identities, support kinds and exact landing spans');
  same(data.solids.map(solid => [solid.id, solid.terrain, solid.polygon]), [
    ['solid_ground', 's_ground', [[0, 576], [1600, 576], [1600, 640], [0, 640]]],
  ], 'trial_wanshou_pen: the approved ground polygon retains its full thickness');
  same(f.groups.map(group => group.children.length), [1, 2],
    'trial_wanshou_pen: the full map builds one solid polygon and two one-way bodies');
  same(f.groups[0].children.map(rectangle), [{ x: 0, y: 576, width: 1600, height: 64 }],
    'trial_wanshou_pen: the full ground polygon replaces duplicate solid surface bodies');
  same(f.groups[1].children.map(rectangle), [
    { x: 128, y: 480, width: 224, height: SPEC.oneWayEdge },
    { x: 1248, y: 480, width: 224, height: SPEC.oneWayEdge },
  ], 'trial_wanshou_pen: both pen platforms use exact approved spans and thin one-way tops');
  for (const surface of data.surfaces) {
    const left = Math.min(...surface.polyline.map(point => point[0]));
    const right = Math.max(...surface.polyline.map(point => point[0]));
    const bodies = f.groups[surface.support === 'one-way' ? 1 : 0].children.map(rectangle);
    ok(bodies.some(body => body.y === surface.polyline[0][1] && body.x === left && body.x + body.width === right),
      `trial_wanshou_pen: ${surface.id} retains its full landing span and exact top edge`);
  }
  ok(f.groups[1].children.every(object => object.body?.checkCollision.up &&
    !object.body.checkCollision.down && !object.body.checkCollision.left && !object.body.checkCollision.right),
    'trial_wanshou_pen: both one-way bodies collide only on top');
  ok(f.groups[0].children.every(object => object.body?.checkCollision.up &&
    object.body.checkCollision.down && object.body.checkCollision.left && object.body.checkCollision.right),
    'trial_wanshou_pen: the solid ground keeps all collision directions');
  const surfaceOnlyData = { ...clone(data), solids: [] }, surfaceOnlyTiledMap = clone(tiledMap);
  const surfaceOnlyDataBefore = JSON.stringify(surfaceOnlyData), surfaceOnlyMapBefore = JSON.stringify(surfaceOnlyTiledMap);
  const surfaceOnlyFixture = fixture(null, false);
  surfaceOnlyFixture.cache.clear(); surfaceOnlyFixture.cache.set(`gsb_${sceneId}_data`, surfaceOnlyData);
  surfaceOnlyFixture.textures.add(`gsb_${sceneId}_background`); surfaceOnlyFixture.textures.add(`gsb_${sceneId}_playable`);
  buildTiledMap(surfaceOnlyFixture.scene, surfaceOnlyTiledMap, 'tiles');
  same(surfaceOnlyFixture.groups.map(group => group.children.length), [1, 2],
    'trial_wanshou_pen: surface-only fallback builds one solid and two one-way bodies');
  same(surfaceOnlyFixture.groups[0].children.map(rectangle), [{ x: 0, y: 576, width: 1600, height: FEEL.tile }],
    'trial_wanshou_pen: surface-only fallback retains the approved ground top and full span');
  same(surfaceOnlyFixture.groups[1].children.map(rectangle), f.groups[1].children.map(rectangle),
    'trial_wanshou_pen: surface-only fallback retains both approved one-way bodies');
  eq(JSON.stringify(surfaceOnlyData), surfaceOnlyDataBefore, 'trial_wanshou_pen: fallback leaves cached scene-data unchanged');
  eq(JSON.stringify(surfaceOnlyTiledMap), surfaceOnlyMapBefore, 'trial_wanshou_pen: fallback leaves its Tiled map unchanged');
  same(map.spawn, { x: 256, y: 576 }, 'trial_wanshou_pen: player starts at the approved ground spawn');
  same(data.points.filter(point => point.id === 'start_spawn').map(point => point.position),
    [[map.spawn.x, map.spawn.y]], 'trial_wanshou_pen: player start matches the approved scene spawn point');
  const tiledObjects = tiledMap.layers.flatMap(layer => layer.type === 'objectgroup' ? layer.objects ?? [] : []);
  same(tiledObjects.map(object => [object.name, object.type, object.x, object.y, object.width, object.height,
    Object.fromEntries(object.properties.map(property => [property.name, property.value]))]), [
    ['playerStart', 'playerStart', 256, 576, 0, 0, {}],
    ['spawn_mad_mandrill_2', 'spawn', 768, 576, 64, 0, { monster: 'mad_mandrill', count: 1 }],
    ['gate_left', 'spawnGate', 80, 576, 0, 0, { side: 'left' }],
    ['gate_right', 'spawnGate', 1520, 576, 0, 0, { side: 'right' }],
  ], 'trial_wanshou_pen: all four original Tiled objects retain their names, geometry and gameplay properties');
  same(data.climbs, [], 'trial_wanshou_pen: the approved scene has no climbs');
  same(map.ropes, [], 'trial_wanshou_pen: no runtime ropes or ladders are introduced');
  same(map.spawns, [{ x: 768, y: 576, w: 64, monster: 'mad_mandrill', count: 1 }],
    'trial_wanshou_pen: the single mandrill spawn retains its position, range and identity');
  const mandrillPoint = data.points.find(point => point.id === 'mad_mandrill')!;
  same([mandrillPoint.sourceName, mandrillPoint.position, mandrillPoint.spawnRange, mandrillPoint.monster, mandrillPoint.count],
    ['spawn_mad_mandrill_2', [768, 576], [768, 832], 'mad_mandrill', 1],
    'trial_wanshou_pen: scene-data binds the named mandrill spawn and full 64px range');
  const gates = [
    ['gate_left', 'spawnGate', 80, 576, 0, 0, { side: 'left' }],
    ['gate_right', 'spawnGate', 1520, 576, 0, 0, { side: 'right' }],
  ];
  same(map.spawnGates.map(gate => [gate.name, gate.type, gate.x, gate.y, gate.w, gate.h, gate.props]), gates,
    'trial_wanshou_pen: both named spawn gates retain exact positions, sizes and sides');
  same(map.objects.map(object => [object.name, object.type, object.x, object.y, object.w, object.h, object.props]), gates,
    'trial_wanshou_pen: both gates remain available to existing object lookup without extra gameplay objects');
  same(data.points.filter(point => point.type === 'spawnGate').map(point => [point.id, ...point.position, point.side]),
    map.spawnGates.map(gate => [gate.name, gate.x, gate.y, gate.props.side]),
    'trial_wanshou_pen: runtime gate positions and sides agree with scene-data points');
  same(map.hidden, [], 'trial_wanshou_pen: no hidden controllers are introduced');
  same(map.zones, [], 'trial_wanshou_pen: no extra gameplay zones are introduced');
  eq(f.tilemaps, 0, 'trial_wanshou_pen: GSB skips the legacy tilemap path');
  same(f.displays.filter(object => object.kind !== 'zone').map(object => [object.kind, object.key]),
    [['image', `gsb_${sceneId}_background`], ['image', `gsb_${sceneId}_playable`]],
    'trial_wanshou_pen: GSB draws background and playable art without legacy terrain');
  const legacyLayers = tiledMap.layers.filter(layer => layer.type === 'tilelayer' && ['ground', 'oneway'].includes(layer.name));
  same(legacyLayers.map(layer => layer.name), ['ground', 'oneway'], 'trial_wanshou_pen: both legacy collision layers are present');
  ok(legacyLayers.every(layer => layer.data?.length === tiledMap.width * tiledMap.height && layer.data.every(gid => gid === 0)),
    'trial_wanshou_pen: checked-in legacy collision layers are fully cleared');
  eq(JSON.stringify(data), dataBefore, 'trial_wanshou_pen: building leaves cached scene-data unchanged');
  eq(JSON.stringify(tiledMap), mapBefore, 'trial_wanshou_pen: building leaves the Tiled map unchanged');
}
testTrialWanshouPenGsb();

console.log(JSON.stringify({ suite: 'gsb-map', passed: true, assertions }));
