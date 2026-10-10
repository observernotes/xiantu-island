import type Phaser from 'phaser';
import assets from './gen/assets.json';

interface OptionalAssetManifest {
  atlases: { key: string }[];
  areas: string[];
  tileMetadata?: { path: string }[];
  backgrounds?: { path: string }[];
  backgroundConfigs?: { path: string }[];
  propLayouts?: { path: string }[];
  skillIcons: { path: string }[];
  sectRankIcons?: { path: string }[];
  uiImages?: { path: string }[];
}

/** sync 只登记实际存在的文件；图集登记要求 PNG、JSON、anims.json 齐全。 */
export function optionalAssetUrls(manifest: OptionalAssetManifest): string[] {
  return [...new Set([
    ...manifest.atlases.flatMap(({ key }) => [
      `art/sprites/${key}.png`, `art/sprites/${key}.json`, `art/sprites/${key}.anims.json`,
    ]),
    ...manifest.areas.map(area => `art/tiles/tiles_${area}.png`),
    ...(manifest.tileMetadata ?? []).map(metadata => metadata.path),
    ...(manifest.backgrounds ?? []).map(bg => bg.path),
    ...(manifest.backgroundConfigs ?? []).map(config => config.path),
    ...(manifest.propLayouts ?? []).map(layout => layout.path),
    ...manifest.skillIcons.map(icon => icon.path),
    ...(manifest.sectRankIcons ?? []).map(icon => icon.path),
    ...(manifest.uiImages ?? []).map(image => image.path),
  ])];
}

// 构建清单随程序打包；启动不发 fetch/HEAD 探测请求。
const availableUrls = new Set(optionalAssetUrls(assets));
export function assetAvailable(url: string): boolean { return availableUrls.has(url); }

type LoadingScene = Pick<Phaser.Scene, 'load'>;

export function loadOptionalImage(scene: LoadingScene, key: string, url: string): boolean {
  if (!assetAvailable(url)) return false;
  scene.load.image(key, url);
  return true;
}

export function loadOptionalAtlas(scene: LoadingScene, key: string, pngUrl: string, jsonUrl: string): boolean {
  if (!assetAvailable(pngUrl) || !assetAvailable(jsonUrl)) return false;
  scene.load.atlas(key, pngUrl, jsonUrl);
  return true;
}

export function loadOptionalJson(scene: LoadingScene, key: string, url: string): boolean {
  if (!assetAvailable(url)) return false;
  scene.load.json(key, url);
  return true;
}

export function loadOptionalSpritesheet(scene: LoadingScene, key: string, url: string,
  frameConfig: Phaser.Types.Loader.FileTypes.ImageFrameConfig): boolean {
  if (!assetAvailable(url)) return false;
  scene.load.spritesheet(key, url, frameConfig);
  return true;
}
