import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import ts from 'typescript';

// Keep this test in Node: the module has only a type import from Phaser.
const source = await readFile(new URL('../src/optionalAssets.ts', import.meta.url), 'utf8');
const { outputText } = ts.transpileModule(source, {
  compilerOptions: { module: ts.ModuleKind.ESNext, target: ts.ScriptTarget.ES2022 },
});
const {
  probeOptionalAssets, assetAvailable, optionalAssetUrls,
  loadOptionalImage, loadOptionalAtlas, loadOptionalJson, loadOptionalSpritesheet,
} = await import(`data:text/javascript;base64,${Buffer.from(outputText).toString('base64')}`);

const routes = new Map([
  ['test/image.png', { type: 'image/png' }],
  ['test/html.png', { type: 'text/html', body: '<!doctype html><html></html>' }],
  ['test/not-found.png', { status: 404, type: 'image/png' }],
  ['test/network.png', { failure: true }],
  ['test/atlas.png', { type: 'image/png' }],
  ['test/atlas.json', { type: 'application/json', body: '{"frames":{}}' }],
  ['test/missing-atlas.json', { type: 'text/html', body: '<html></html>' }],
  ['test/plain.json', { type: 'text/plain; charset=utf-8', body: '{"anims":[]}' }],
  ['test/invalid-plain.json', { type: 'text/plain', body: 'not json' }],
  ['test/structured.json', { type: 'application/vnd.test+json', body: '{"ok":true}' }],
  ['test/fallback.png', { headStatus: 405, type: 'image/png' }],
  ['test/cached.png', { type: 'image/png' }],
]);
const requests = [];
const fetchAsset = async (input, init = {}) => {
  const url = String(input);
  const method = init.method ?? 'GET';
  requests.push({ url, method });
  assert.equal(init.cache, 'no-store', 'asset probes must not reuse stale browser responses');
  const route = routes.get(url);
  assert.ok(route, `unexpected URL: ${url}`);
  if (route.failure) throw new TypeError('simulated network failure');
  const status = method === 'HEAD' ? (route.headStatus ?? route.status ?? 200) : (route.status ?? 200);
  return new Response(method === 'HEAD' ? null : (route.body ?? ''), {
    status,
    headers: { 'content-type': route.type },
  });
};

await probeOptionalAssets([...routes.keys()].filter((url) => url !== 'test/cached.png'), fetchAsset);
for (const url of ['test/image.png', 'test/atlas.png', 'test/atlas.json', 'test/plain.json', 'test/structured.json', 'test/fallback.png']) {
  assert.equal(assetAvailable(url), true, `${url} should be available`);
}
for (const url of ['test/html.png', 'test/not-found.png', 'test/network.png', 'test/missing-atlas.json', 'test/invalid-plain.json', 'test/unknown.png']) {
  assert.equal(assetAvailable(url), false, `${url} should be unavailable`);
}
assert.deepEqual(requests.filter(({ url }) => url === 'test/fallback.png').map(({ method }) => method), ['HEAD', 'GET']);
assert.deepEqual(requests.filter(({ url }) => url === 'test/plain.json').map(({ method }) => method), ['HEAD', 'GET']);

await Promise.all([
  probeOptionalAssets(['test/cached.png'], fetchAsset),
  probeOptionalAssets(['test/cached.png'], fetchAsset),
]);
await probeOptionalAssets(['test/cached.png', 'test/network.png'], fetchAsset);
assert.equal(requests.filter(({ url }) => url === 'test/cached.png').length, 1, 'concurrent and later probes share the URL cache');
assert.equal(requests.filter(({ url }) => url === 'test/network.png').length, 1, 'failed probes are cached too');

const queued = [];
const scene = { load: Object.fromEntries(['image', 'atlas', 'json', 'spritesheet'].map((kind) => [kind, (...args) => queued.push({ kind, args })])) };
assert.equal(loadOptionalImage(scene, 'image', 'test/image.png'), true);
assert.equal(loadOptionalImage(scene, 'html', 'test/html.png'), false);
assert.equal(loadOptionalAtlas(scene, 'atlas', 'test/atlas.png', 'test/atlas.json'), true);
const beforeMissingAtlas = queued.length;
assert.equal(loadOptionalAtlas(scene, 'missing-json', 'test/atlas.png', 'test/missing-atlas.json'), false);
assert.equal(loadOptionalAtlas(scene, 'missing-png', 'test/not-found.png', 'test/atlas.json'), false);
assert.equal(queued.length, beforeMissingAtlas, 'an atlas queues nothing unless both PNG and JSON exist');
assert.equal(loadOptionalJson(scene, 'anims', 'test/plain.json'), true);
assert.equal(loadOptionalJson(scene, 'missing-anims', 'test/invalid-plain.json'), false);
const frameConfig = { frameWidth: 32, frameHeight: 32 };
assert.equal(loadOptionalSpritesheet(scene, 'tiles', 'test/image.png', frameConfig), true);
assert.equal(loadOptionalSpritesheet(scene, 'missing-tiles', 'test/not-found.png', frameConfig), false);
assert.deepEqual(queued, [
  { kind: 'image', args: ['image', 'test/image.png'] },
  { kind: 'atlas', args: ['atlas', 'test/atlas.png', 'test/atlas.json'] },
  { kind: 'json', args: ['anims', 'test/plain.json'] },
  { kind: 'spritesheet', args: ['tiles', 'test/image.png', frameConfig] },
]);

const inventory = optionalAssetUrls({
  atlases: [{ key: 'prop_test' }],
  areas: ['altar'],
  backgrounds: [{ key: 'bg_altar_far', path: 'art/tiles/bg_altar_far.png' }],
  skillIcons: [{ key: 'skill', path: 'art/icons/skills/skill@64.png' }],
  sectRankIcons: [{ key: 'rank', path: 'art/icons/ui/sect_rank/rank.png' }],
});
assert.deepEqual([...new Set(inventory)].sort(), [
  'art/sprites/prop_test.png', 'art/sprites/prop_test.json', 'art/sprites/prop_test.anims.json',
  'art/tiles/tiles_altar.png', 'art/tiles/bg_altar_far.png',
  'art/icons/skills/skill@64.png', 'art/icons/ui/sect_rank/rank.png',
].sort(), 'probe inventory covers every manifest-driven loader URL');

console.log('optional-assets: passed (MIME/status/network probes, JSON validation, cache, guarded loaders, inventory)');
