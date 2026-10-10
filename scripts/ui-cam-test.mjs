import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import ts from 'typescript';

let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const root = new URL('../', import.meta.url);
const source = await fs.readFile(new URL('src/scenes/cameraFloor.ts', root), 'utf8');
const variantsSource = await fs.readFile(new URL('src/TileVariants.ts', root), 'utf8');
const moduleUrl = source => {
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
  });
  return `data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`;
};
const floorModule = dependency => import(moduleUrl(source.replace(/(['"])\.\.\/TileVariants\1/g, JSON.stringify(dependency))));
const { addFloorStrip, HUD_RESERVE } = await floorModule(moduleUrl(variantsSource));

// Phaser is a type import. The scene records all visual calls and rejects physics use.
const sceneFor = (metadata, textures) => {
  const calls = [];
  const cacheKeys = [];
  const textureKeys = [];
  const display = kind => ({
    setOrigin(...args) { calls.push([kind, 'origin', ...args]); return this; },
    setDepth(...args) { calls.push([kind, 'depth', ...args]); return this; },
    fillStyle(...args) { calls.push([kind, 'fillStyle', ...args]); return this; },
    fillRect(...args) { calls.push([kind, 'fillRect', ...args]); return this; },
  });
  return {
    calls, cacheKeys, textureKeys,
    scene: {
      cache: { json: { get(key) { cacheKeys.push(key); return metadata; } } },
      textures: { exists(key) { textureKeys.push(key); return textures.includes(key); } },
      add: {
        tileSprite(...args) { calls.push(['tileSprite', ...args]); return display('tileSprite'); },
        graphics(...args) { calls.push(['graphics', ...args]); return display('graphics'); },
      },
      get physics() { throw new Error('the visual floor must never access physics'); },
    },
  };
};
const area = 'altar';
const width = 2701;
const height = 1379;
const expectedSprite = (tileset, frame) => [
  ['tileSprite', 0, height, width, HUD_RESERVE, `${tileset}_ss`, frame],
  ['tileSprite', 'origin', 0, 0],
  ['tileSprite', 'depth', -1],
];
const run = (add, metadata, textures) => {
  const state = sceneFor(metadata, textures);
  const previousRandom = Math.random;
  Math.random = () => { throw new Error('the floor must not choose a random variant'); };
  try { add(state.scene, width, height, area); }
  finally { Math.random = previousRandom; }
  return state;
};

equal(HUD_RESERVE, 116, 'the strip retains the HUD reserve height');
for (const metadata of [undefined, {}, { tiles: [{ id: 37, role: 'ground_fill' }] }]) {
  const state = run(addFloorStrip, metadata, ['tiles_altar_ss']);
  equal(state.calls, expectedSprite('tiles_altar', 5), 'without a variant table, the original fill frame spans the whole floor');
  equal(state.cacheKeys, ['tiles_altar_meta'], 'the area metadata uses the E-3 cache key');
}

const externalTable = {
  variants: {
    ground_fill: { tileset: 'tiles_altar_fill_variants', includeBase: true, frames: [0, 1, 2], weights: [100, 200, 300] },
  },
};
const external = run(addFloorStrip, externalTable, ['tiles_altar_ss', 'tiles_altar_fill_variants_ss']);
equal(external.calls, expectedSprite('tiles_altar', 5), 'an external includeBase table uses the original base, never an extra variant');
check(!external.textureKeys.includes('tiles_altar_fill_variants_ss'), 'extra variants do not supply the uniform strip');

const reordered = {
  tiles: [
    { id: 5, role: 'ground_l', variant: 0 },
    { id: 31, properties: [{ name: 'role', value: 'ground_fill' }, { name: 'variant', value: 1 }, { name: 'weight', value: 100 }] },
    { id: 26, properties: [{ name: 'role', value: 'ground_fill' }, { name: 'variant', value: 0 }, { name: 'weight', value: 0 }] },
    { id: 33, role: 'ground_fill', variant: 2, weight: 1000 },
  ],
};
const rearranged = run(addFloorStrip, reordered, ['tiles_altar_ss']);
equal(rearranged.calls, expectedSprite('tiles_altar', 26), 'role + variant 0 identifies a reordered base frame even with zero random weight');

// E-3 currently keeps the base on the original sheet. Test the consumer contract
// at the module boundary as well, so a base on another sheet preserves tileset/frame.
const externalBase = { tileset: 'tiles_external_base', frame: 17, weight: 1 };
const alternate = await floorModule(moduleUrl(`
  export function tileVariantGroups(metadata, tileset) {
    if (metadata !== 'external-base' || tileset !== 'tiles_altar') throw new Error('incorrect metadata or tileset');
    return new Map([[5, { base: ${JSON.stringify(externalBase)}, frames: [] }]]);
  }
`));
const alternateTexture = run(alternate.addFloorStrip, 'external-base', ['tiles_external_base_ss', 'tiles_altar_ss']);
equal(alternateTexture.calls, expectedSprite('tiles_external_base', 17), 'the group base supplies both tileset and frame');
const originalFallback = run(alternate.addFloorStrip, 'external-base', ['tiles_altar_ss']);
equal(originalFallback.calls, expectedSprite('tiles_altar', 5), 'a missing base texture falls back to original frame 5');
equal(originalFallback.textureKeys, ['tiles_external_base_ss', 'tiles_altar_ss'], 'texture fallback follows base then original sheet');

for (const [add, metadata] of [[addFloorStrip, reordered], [alternate.addFloorStrip, 'external-base']]) {
  const state = run(add, metadata, []);
  equal(state.calls, [
    ['graphics', { x: 0, y: height }],
    ['graphics', 'depth', -1],
    ['graphics', 'fillStyle', 0x8a5a3c],
    ['graphics', 'fillRect', 0, 0, width, HUD_RESERVE],
  ], 'with no usable sheet, the original color block starts at the same world boundary and depth');
}

console.log(JSON.stringify({ suite: 'ui-cam', passed: true, assertions }));
