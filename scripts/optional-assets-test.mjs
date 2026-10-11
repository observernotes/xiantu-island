import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { createRequire } from 'node:module';
import ts from 'typescript';

let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const root = new URL('../', import.meta.url);
const temporary = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-optional-assets-'));
const previousFetch = globalThis.fetch;
let fetchCalls = 0;
globalThis.fetch = () => { fetchCalls++; throw new Error('optional assets must never probe'); };
try {
  // 覆盖层在独立 snapshot 工程里验证，完整 sync 不会读取共享美术目录。
  const overlayRoot = path.join(temporary, 'overlay-project');
  for (const directory of ['scripts', 'data/balance', 'data/art/sprites', 'data/art/tiles', 'data/art/icons', 'art-overlays/tiles'])
    await fs.mkdir(path.join(overlayRoot, directory), { recursive: true });
  for (const file of ['sync.mjs', 'root.mjs'])
    await fs.copyFile(new URL(`scripts/${file}`, root), path.join(overlayRoot, 'scripts', file));
  const overlayWrite = (file, contents) => fs.writeFile(path.join(overlayRoot, file), JSON.stringify(contents));
  await overlayWrite('data/balance/skills.json', { skills: [] });
  await overlayWrite('data/balance/sect_ranks.json', { ranks: [] });
  const metadata = { tileSize: 32, columns: 10, note: 'preserved metadata', variants: { 4: [1], 5: [2] } };
  const fillVariants = { 5: { tileset: 'tiles_altar_fill_variants', frames: [0, 1, 2], includeBase: true } };
  await overlayWrite('data/art/tiles/tiles_altar.json', metadata);
  await overlayWrite('data/art/tiles/tiles_altar.png', 'fixture');
  await overlayWrite('art-overlays/tiles/tiles_altar.json', { variants: fillVariants });
  await overlayWrite('art-overlays/tiles/tiles_missing.json', { variants: fillVariants });
  const overlaySync = (manifestOnly = false) => {
    const result = spawnSync(process.execPath, ['scripts/sync.mjs'], { cwd: overlayRoot,
      env: { ...process.env, XT_DATA: 'snapshot', XT_SYNC_MANIFEST_ONLY: manifestOnly ? '1' : '0' }, encoding: 'utf8' });
    equal(result.status, 0, `overlay ${manifestOnly ? 'manifest-only' : 'full'} sync succeeds: ${result.stderr}`);
    return result;
  };
  const mergedFile = path.join(overlayRoot, 'public/art/tiles/tiles_altar.json');
  const fullSync = overlaySync();
  const mergedBytes = await fs.readFile(mergedFile);
  const mergedHash = createHash('sha256').update(mergedBytes).digest('hex');
  equal(JSON.parse(mergedBytes), { ...metadata, variants: fillVariants }, 'full sync copies source, preserves metadata and replaces the entire top-level variants');
  check(fullSync.stderr.includes('tiles/tiles_missing.json'), 'missing overlay target warns');
  equal(await fs.access(path.join(overlayRoot, 'public/art/tiles/tiles_missing.json')).then(() => true, () => false), false, 'missing overlay target is not created');
  overlaySync();
  equal(await fs.readFile(mergedFile), mergedBytes, 'repeated full sync is byte-identical');
  // 非法且已改变的覆盖层证明 manifest-only 完全不读、不重新合并。
  await fs.writeFile(path.join(overlayRoot, 'art-overlays/tiles/tiles_altar.json'), '{changed invalid overlay');
  const manifestSync = overlaySync(true);
  const preservedBytes = await fs.readFile(mergedFile);
  equal(preservedBytes, mergedBytes, 'manifest-only preserves merged JSON bytes');
  equal(createHash('sha256').update(preservedBytes).digest('hex'), mergedHash, 'manifest-only preserves merged JSON hash');
  check(!manifestSync.stderr.includes('tiles/tiles_missing.json'), 'manifest-only does not process overlays');

  // 独立 snapshot 工程验证真实 sync；不会触碰当前工作树的素材或清单。
  for (const directory of ['scripts', 'data/balance', 'public/art/sprites', 'public/art/tiles', 'public/art/icons/skills', 'public/art/icons/ui/sect_rank'])
    await fs.mkdir(path.join(temporary, directory), { recursive: true });
  for (const file of ['sync.mjs', 'root.mjs'])
    await fs.copyFile(new URL(`scripts/${file}`, root), path.join(temporary, 'scripts', file));
  const write = (file, contents) => fs.writeFile(path.join(temporary, file), typeof contents === 'string' ? contents : JSON.stringify(contents));
  await write('data/balance/skills.json', { skills: [{ icon: 'skill_test' }, { icon: 'skill_missing' }] });
  await write('data/balance/sect_ranks.json', { ranks: [{ icon: 'rank_test' }, { icon: 'rank_missing' }] });
  const spec = { atlas: 'prop_test', frameSize: 192, displayScale: 0.5, bodySize: [52, 116], origin: [0.5, 1], anims: [] };
  await write('public/art/sprites/prop_test.anims.json', spec);
  await write('public/art/sprites/prop_test.png', 'fixture');
  await write('public/art/sprites/prop_test.json', { frames: {} });
  // anims 的 atlas 指向另一 key 时，也必须存在该 key 自己的 anims.json。
  await write('public/art/sprites/orphan.anims.json', { ...spec, atlas: 'prop_orphan' });
  await write('public/art/sprites/prop_orphan.png', 'fixture');
  await write('public/art/sprites/prop_orphan.json', { frames: {} });
  await write('public/art/tiles/tiles_altar.png', 'fixture');
  await write('public/art/tiles/tiles_altar_fill_variants.png', 'fixture');
  await write('public/art/tiles/tiles_altar.json', { variants: {} });
  await write('public/art/tiles/bg_altar_far.png', 'fixture');
  await write('public/art/tiles/bg_altar.json', { layers: { far: { texture: 'bg_altar_far' }, mid: { texture: 'bg_missing' } } });
  await write('public/art/icons/skills/skill_test@64.png', 'fixture');
  await write('public/art/icons/ui/sect_rank/rank_test.png', 'fixture');
  const sync = () => execFileSync(process.execPath, ['scripts/sync.mjs'], { cwd: temporary,
    env: { ...process.env, XT_DATA: 'snapshot', XT_SYNC_MANIFEST_ONLY: '1' }, stdio: 'pipe' });
  const manifest = async () => JSON.parse(await fs.readFile(path.join(temporary, 'src/gen/assets.json'), 'utf8'));
  sync();
  const baseline = await manifest();
  equal(baseline.atlases.map(({ key }) => key), ['prop_test']);
  equal([baseline.atlases[0].frameSize, baseline.atlases[0].displayScale], [192, 0.5], 'sync preserves E-1 metadata');
  equal(baseline.areas, ['altar', 'altar_fill_variants'], 'external fill variants must remain an area');
  equal(baseline.tileMetadata.map(({ path }) => path), ['art/tiles/tiles_altar.json']);
  equal(baseline.backgroundConfigs.map(({ path }) => path), ['art/tiles/bg_altar.json']);
  equal(baseline.backgrounds.map(({ path }) => path), ['art/tiles/bg_altar_far.png']);
  equal(baseline.skillIcons.map(({ key }) => key), ['skill_test@64']);
  equal(baseline.sectRankIcons.map(({ key }) => key), ['rank_test']);

  // 用真实生成的清单注入 Node 模块；Phaser 仅 type import，测试记录加载队列。
  const source = await fs.readFile(new URL('src/optionalAssets.ts', root), 'utf8');
  const moduleFor = async inventory => {
    const injected = source.replace("import assets from './gen/assets.json';", `const assets = ${JSON.stringify(inventory)};`);
    const { outputText } = ts.transpileModule(injected, {
      compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
    });
    return import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);
  };
  const api = await moduleFor(baseline);
  const inventory = api.optionalAssetUrls(baseline);
  equal(new Set(inventory).size, inventory.length, 'manifest URLs are unique');
  for (const url of inventory) equal(api.assetAvailable(url), true, `listed URL available: ${url}`);
  equal(api.assetAvailable('art/unknown.png'), false);
  const queued = [];
  const scene = { load: Object.fromEntries(['image', 'atlas', 'json', 'spritesheet'].map(kind => [kind, (...args) => queued.push({ kind, args })])) };
  const frameConfig = { frameWidth: 32, frameHeight: 32 };
  const expected = [];
  for (const [loader, kind, args] of [
    ['loadOptionalImage', 'image', ['image', 'art/icons/skills/skill_test@64.png']],
    ['loadOptionalAtlas', 'atlas', ['atlas', 'art/sprites/prop_test.png', 'art/sprites/prop_test.json']],
    ['loadOptionalJson', 'json', ['anims', 'art/sprites/prop_test.anims.json']],
    ['loadOptionalJson', 'json', ['tile_meta', 'art/tiles/tiles_altar.json']],
    ['loadOptionalJson', 'json', ['bg_config', 'art/tiles/bg_altar.json']],
    ['loadOptionalSpritesheet', 'spritesheet', ['tiles', 'art/tiles/tiles_altar_fill_variants.png', frameConfig]],
  ]) {
    equal(api[loader](scene, ...args), true, `${kind} listed asset queues`);
    expected.push({ kind, args });
  }
  for (const [loader, args] of [
    ['loadOptionalImage', ['missing', 'art/unknown.png']],
    ['loadOptionalJson', ['missing', 'art/unknown.json']],
    ['loadOptionalJson', ['missing_meta', 'art/tiles/tiles_missing.json']],
    ['loadOptionalJson', ['missing_config', 'art/tiles/bg_missing.json']],
    ['loadOptionalSpritesheet', ['missing', 'art/unknown.png', frameConfig]],
    ['loadOptionalAtlas', ['missing_json', 'art/sprites/prop_test.png', 'art/unknown.json']],
    ['loadOptionalAtlas', ['missing_png', 'art/unknown.png', 'art/sprites/prop_test.json']],
  ]) equal(api[loader](scene, ...args), false, 'unlisted asset is rejected');
  equal(queued, expected, 'rejected assets never enter Phaser queue');

  // 使用真实 Phaser 失败处理，验证静默不改变失败状态、Atlas 计数或队列完成。
  const require = createRequire(import.meta.url);
  const File = require('phaser/src/loader/File.js');
  const MultiFile = require('phaser/src/loader/MultiFile.js');
  const LoaderPlugin = require('phaser/src/loader/LoaderPlugin.js');
  const { FILE_ERRORED } = require('phaser/src/loader/const.js');
  const originalProcessError = File.prototype.onProcessError;
  const originalFileFailed = MultiFile.prototype.onFileFailed;
  const originalConsoleError = console.error;
  const errors = [];
  function prepareLoader(loader) {
    return Object.assign(loader, { scene: {}, systems: { game: { pendingDestroy: false } },
      list: new Set(), inflight: new Set(), queue: new Set(), completed: 0,
      fileProcessComplete: LoaderPlugin.prototype.fileProcessComplete,
      loadComplete() { this.completed++; } });
  }
  function fail(loader, key, type = 'image', multiFile) {
    const file = Object.assign(Object.create(File.prototype), { loader, key, type, multiFile });
    if (multiFile) multiFile.files.push(file);
    loader.queue.add(file);
    const before = loader.completed;
    file.onProcessError();
    equal(file.state, FILE_ERRORED, `${type} ${key}: failure state is preserved`);
    equal(loader.queue.has(file), false, `${type} ${key}: failed file leaves process queue`);
    equal(loader.completed, before + 1, `${type} ${key}: loader completes`);
    return file;
  }
  function atlas(loader, key) {
    return Object.assign(Object.create(MultiFile.prototype), { loader, key, type: 'atlasjson', files: [], failed: 0 });
  }
  try {
    console.error = (...args) => errors.push(args);
    const phaser = { Loader: { File, MultiFile, FILE_ERRORED } };
    api.installOptionalAssetErrorHandler(phaser);
    const installed = [File.prototype.onProcessError, MultiFile.prototype.onFileFailed];
    api.installOptionalAssetErrorHandler(phaser);
    equal([File.prototype.onProcessError, MultiFile.prototype.onFileFailed], installed, 'installation is idempotent');
    const loader = prepareLoader(scene.load);
    for (const { kind, args: [key] } of expected) {
      if (kind === 'atlas') {
        const multi = atlas(loader, key);
        fail(loader, key, 'image', multi);
        fail(loader, key, 'json', multi);
        equal(multi.failed, 4, 'Atlas preserves both File and Loader failure notifications');
        multi.onFileFailed({ key, loader });
        equal(multi.failed, 4, 'Atlas ignores files outside its children');
      } else fail(loader, key, kind);
    }
    equal(errors.length, 0, 'registered image/atlas/json/spritesheet processing errors are silent');
    const prefixed = prepareLoader({ prefix: 'ui:', image() {} });
    equal(api.loadOptionalImage({ load: prefixed }, 'close', 'art/icons/skills/skill_test@64.png'), true);
    fail(prefixed, 'ui:close');
    equal(errors.length, 0, 'loader prefix is included in optional registration');
    fail(loader, 'missing');
    equal(errors.length, 1, 'rejected optional key retains required-file error reporting');
    fail(prepareLoader({}), 'image');
    equal(errors.length, 2, 'another loader with the same key retains error reporting');
    const requiredAtlas = atlas(loader, 'required_atlas');
    fail(loader, 'required_atlas', 'image', requiredAtlas);
    equal(requiredAtlas.failed, 2, 'required Atlas failure handling is preserved');
    equal(errors.length, 5, 'required Atlas reports File and both MultiFile errors');
  } finally {
    File.prototype.onProcessError = originalProcessError;
    MultiFile.prototype.onFileFailed = originalFileFailed;
    console.error = originalConsoleError;
  }

  for (const extension of ['json', 'png', 'anims.json']) {
    const file = `public/art/sprites/prop_test.${extension}`;
    const saved = await fs.readFile(path.join(temporary, file));
    await fs.unlink(path.join(temporary, file));
    sync();
    const missing = await manifest();
    equal(missing.atlases, [], `atlas missing ${extension} is omitted by sync`);
    const missingApi = await moduleFor(missing);
    const before = queued.length;
    equal(missingApi.loadOptionalAtlas(scene, 'missing', 'art/sprites/prop_test.png', 'art/sprites/prop_test.json'), false);
    equal(queued.length, before, `atlas missing ${extension} queues nothing`);
    await fs.writeFile(path.join(temporary, file), saved);
  }
  check(!/probeOptionalAssets/.test(await fs.readFile(new URL('src/main.ts', root), 'utf8')), 'startup has no probe');
  const preload = await fs.readFile(new URL('src/scenes/GameScene.ts', root), 'utf8');
  for (const collection of ['TILE_METADATA', 'BACKGROUND_CONFIGS'])
    check(new RegExp(`for \\(const \\w+ of ${collection}\\) loadOptionalJson\\(`).test(preload), `${collection} uses manifest guard`);
  equal(fetchCalls, 0, 'startup and guarded loaders call no fetch');
  console.log(JSON.stringify({ suite: 'optional-assets', passed: true, assertions, fetchCalls }));
} finally {
  globalThis.fetch = previousFetch;
  await fs.rm(temporary, { recursive: true, force: true });
}
