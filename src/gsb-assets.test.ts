import assets from './gen/assets.json';
import { loadOptionalGsbScene, optionalAssetUrls, type GsbSceneAsset } from './optionalAssets';

let assertions = 0;
function same(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(message);
}

const legacyManifest = { atlases: [], areas: [], skillIcons: [] };
same(optionalAssetUrls(legacyManifest), [], '旧清单没有 GSB 时可正常读取');
const fixture: GsbSceneAsset = { id: 'fixture', path: 'art/scenes/fixture', files: [
  'art/scenes/fixture/background.png', 'art/scenes/fixture/playable.png',
  'art/scenes/fixture/scene-data.json', 'art/scenes/fixture/manifest.json',
] };
same(optionalAssetUrls({ ...legacyManifest, gsbScenes: [fixture, fixture] }), fixture.files,
  'GSB 全量文件加入可选资源索引且去重');

type Queued = { kind: string; key: string; url: string };
const scenes = (assets as { gsbScenes?: GsbSceneAsset[] }).gsbScenes ?? [];
const textures = new Set<string>(), json = new Set<string>(), queued: Queued[] = [];
const loadingScene = {
  load: {
    prefix: 'map:',
    image: (key: string, url: string) => queued.push({ kind: 'image', key, url }),
    json: (key: string, url: string) => queued.push({ kind: 'json', key, url }),
  },
  textures: { exists: (key: string) => textures.has(key) },
  cache: { json: { exists: (key: string) => json.has(key) } },
} as unknown as Parameters<typeof loadOptionalGsbScene>[0];

const expected: Queued[] = [];
for (const scene of scenes) {
  for (const layer of ['background', 'playable', 'foreground']) {
    const url = `${scene.path}/${layer}.png`;
    if (scene.files.includes(url)) expected.push({ kind: 'image', key: `gsb_${scene.id}_${layer}`, url });
  }
  const url = `${scene.path}/scene-data.json`;
  if (scene.files.includes(url)) expected.push({ kind: 'json', key: `gsb_${scene.id}_data`, url });
  loadOptionalGsbScene(loadingScene, scene);
}
same(queued, expected, '按实际文件预载 GSB 图片与几何，统一 cache key 且不请求 manifest 或缺失图层');
for (const file of queued) (file.kind === 'json' ? json : textures).add(`map:${file.key}`);
for (const scene of scenes) loadOptionalGsbScene(loadingScene, scene);
same(queued, expected, '场景重启复用带 Loader prefix 的全局纹理和 JSON 缓存');

queued.length = 0; textures.clear(); json.clear();
for (const scene of scenes) loadOptionalGsbScene(loadingScene, { ...scene, files: [] });
same(queued, [], 'scene.files 为空时不加载全局清单里其他场景的文件');
loadOptionalGsbScene(loadingScene, fixture);
same(queued, [], '清单外的场景文件不进入 Phaser 加载队列');

console.log(`GSB assets: ${assertions} assertions passed`);
