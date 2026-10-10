import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import ts from 'typescript';

const root = new URL('../', import.meta.url);
const importTs = async source => {
  const { outputText } = ts.transpileModule(source, { compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 } });
  return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
};
const { PropLayout } = await importTs(await fs.readFile(new URL('src/scenes/PropLayout.ts', root), 'utf8'));
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const images = [], shutdown = [];
const scene = {
  textures: { exists: key => key === 'props_fixture', get: () => ({ has: frame => ['house', 'lantern', 'fence'].includes(frame) }) },
  add: { image: (x, y, key, frame) => {
    assert.notEqual(frame, 'missing', 'missing frame must be rejected before Phaser can log a warning');
    const image = { x, y, key, frame,
      setOrigin(x, y) { this.origin = [x, y]; return this; }, setDepth(depth) { this.depth = depth; return this; },
      setScale(x, y) { this.scale = [x, y]; return this; }, setFlipX(flipX) { this.flipX = flipX; return this; },
      setName(name) { this.name = name; return this; }, destroy() { this.destroyed = true; },
    };
    images.push(image); return image;
  } },
  events: { once: (event, callback, context) => shutdown.push({ event, callback, context }), off: () => {} },
};
const config = { map: 'fixture_map', atlas: 'props_fixture', items: [
  { frame: 'house', x: 600, y: 704, layer: 'back', flipX: true, scale: 0.75 },
  { frame: 'lantern', x: 680, y: 704, layer: 'front', origin: [0.25, 0.9], scale: [0.5, 0.8] },
  { frame: 'fence', x: 700, y: 704 },
  { frame: 'missing', x: 740, y: 704 }, { frame: 'house', x: NaN, y: 704 },
] };
new PropLayout(scene, 'other_map', config);
new PropLayout(scene, 'fixture_map', { ...config, atlas: 'missing_atlas' });
new PropLayout(scene, 'fixture_map');
equal(images.length, 0, 'other maps and absent layouts/atlases add no objects');
const layout = new PropLayout(scene, 'fixture_map', config);
equal(layout.images.length, 3, 'missing frame and invalid coordinates are skipped');
equal(images.map(({ x, y, origin, depth, scale, flipX }) => ({ x, y, origin, depth, scale, flipX })), [
  { x: 600, y: 704, origin: [0.5, 1], depth: -2, scale: [0.75, 0.75], flipX: true },
  { x: 680, y: 704, origin: [0.25, 0.9], depth: 15, scale: [0.5, 0.8], flipX: false },
  { x: 700, y: 704, origin: [0.5, 1], depth: 2, scale: [1, 1], flipX: false },
], 'world foot coordinates, layers and transforms match the art contract');
equal(images.some(image => image.body || image.input), false, 'props do not attach physics or interaction');
equal(shutdown.length, 1, 'only mounted layout registers shutdown cleanup');
shutdown[0].callback.call(shutdown[0].context);
equal(images.every(image => image.destroyed), true, 'map shutdown destroys decorative objects');
equal(layout.images.length, 0, 'shutdown clears references');

const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-prop-layout-'));
try {
  for (const directory of ['scripts', 'data/balance', 'public/art/sprites', 'public/art/tiles', 'public/art/tiles/_pending'])
    await fs.mkdir(path.join(temporary, directory), { recursive: true });
  for (const file of ['sync.mjs', 'root.mjs']) await fs.copyFile(new URL(`scripts/${file}`, root), path.join(temporary, 'scripts', file));
  const write = (file, content) => fs.writeFile(path.join(temporary, file), JSON.stringify(content));
  await write('data/balance/skills.json', { skills: [] });
  await write('data/balance/sect_ranks.json', { ranks: [] });
  await write('public/art/tiles/props_fixture.layout.json', config);
  await write('public/art/tiles/_pending/props_hidden.layout.json', config);
  const sync = () => execFileSync(process.execPath, ['scripts/sync.mjs'], { cwd: temporary,
    env: { ...process.env, XT_DATA: 'snapshot', XT_SYNC_MANIFEST_ONLY: '1' }, stdio: 'pipe' });
  const manifest = async () => JSON.parse(await fs.readFile(path.join(temporary, 'src/gen/assets.json'), 'utf8'));
  sync();
  const inventory = await manifest();
  equal(inventory.propLayouts, [{ area: 'fixture', key: 'props_fixture_layout', path: 'art/tiles/props_fixture.layout.json' }],
    'sync registers only existing formal layouts, including areas without tiles');
  const optionalSource = await fs.readFile(new URL('src/optionalAssets.ts', root), 'utf8');
  const optional = await importTs(optionalSource.replace("import assets from './gen/assets.json';", `const assets = ${JSON.stringify(inventory)};`));
  const queued = [];
  const loading = { load: { json: (...args) => queued.push(args) } };
  equal(optional.loadOptionalJson(loading, 'props_fixture_layout', inventory.propLayouts[0].path), true, 'formal layout enters optional JSON loader');
  equal(optional.loadOptionalJson(loading, 'props_missing_layout', 'art/tiles/props_missing.layout.json'), false, 'absent layout never requests a URL');
  equal(queued, [['props_fixture_layout', 'art/tiles/props_fixture.layout.json']], 'missing layout queues no request');
  await fs.unlink(path.join(temporary, 'public/art/tiles/props_fixture.layout.json'));
  sync();
  equal((await manifest()).propLayouts, [], 'deleted layout is omitted on next sync');
} finally {
  await fs.rm(temporary, { recursive: true, force: true });
}
console.log(JSON.stringify({ suite: 'prop-layout', passed: true, assertions }));
