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

// 按 Loader 隔离登记，避免其它场景中同名的必需资源也被静默。
const optionalKeys = new WeakMap<Phaser.Loader.LoaderPlugin, Set<string>>();
let errorHandlerInstalled = false;

function registerOptionalKey(scene: LoadingScene, key: string): void {
  let keys = optionalKeys.get(scene.load);
  if (!keys) { keys = new Set(); optionalKeys.set(scene.load, keys); }
  keys.add(`${scene.load.prefix ?? ''}${key}`);
}

function isOptionalFile(file: Phaser.Loader.File | Phaser.Loader.MultiFile): boolean {
  return optionalKeys.get(file.loader)?.has(file.key) ?? false;
}

/** 由已导入 Phaser 的启动模块安装一次；保留失败流程，仅省去可选资源的错误日志。 */
export function installOptionalAssetErrorHandler(phaser: typeof Phaser): void {
  if (errorHandlerInstalled) return;
  errorHandlerInstalled = true;
  const onProcessError = phaser.Loader.File.prototype.onProcessError;
  phaser.Loader.File.prototype.onProcessError = function () {
    if (!isOptionalFile(this)) { onProcessError.call(this); return; }
    // 与 Phaser File.onProcessError 相同，跳过 console.error；200 HTML 仍按解码失败处理。
    this.state = phaser.Loader.FILE_ERRORED;
    if (this.multiFile) this.multiFile.onFileFailed(this);
    this.loader.fileProcessComplete(this);
  };
  const onFileFailed = phaser.Loader.MultiFile.prototype.onFileFailed;
  phaser.Loader.MultiFile.prototype.onFileFailed = function (file) {
    if (!isOptionalFile(this)) { onFileFailed.call(this, file); return; }
    // Atlas 的失败仍计数，Loader 后续再次通知时也沿用 Phaser 原有行为。
    if (this.files.includes(file)) this.failed++;
  };
}

export function loadOptionalImage(scene: LoadingScene, key: string, url: string): boolean {
  if (!assetAvailable(url)) return false;
  registerOptionalKey(scene, key);
  scene.load.image(key, url);
  return true;
}

export function loadOptionalAtlas(scene: LoadingScene, key: string, pngUrl: string, jsonUrl: string): boolean {
  if (!assetAvailable(pngUrl) || !assetAvailable(jsonUrl)) return false;
  registerOptionalKey(scene, key);
  scene.load.atlas(key, pngUrl, jsonUrl);
  return true;
}

export function loadOptionalJson(scene: LoadingScene, key: string, url: string): boolean {
  if (!assetAvailable(url)) return false;
  registerOptionalKey(scene, key);
  scene.load.json(key, url);
  return true;
}

export function loadOptionalSpritesheet(scene: LoadingScene, key: string, url: string,
  frameConfig: Phaser.Types.Loader.FileTypes.ImageFrameConfig): boolean {
  if (!assetAvailable(url)) return false;
  registerOptionalKey(scene, key);
  scene.load.spritesheet(key, url, frameConfig);
  return true;
}
