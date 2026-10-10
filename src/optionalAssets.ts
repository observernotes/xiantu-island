import type Phaser from 'phaser';

interface OptionalAssetManifest {
  atlases: { key: string }[];
  areas: string[];
  backgrounds?: { path: string }[];
  skillIcons: { path: string }[];
  sectRankIcons?: { path: string }[];
}

const availability = new Map<string, boolean>();
const pending = new Map<string, Promise<void>>();

/** 与清单驱动的 preload 共用 URL；同一 tiles 图片只探测一次。 */
export function optionalAssetUrls(manifest: OptionalAssetManifest): string[] {
  return [...new Set([
    ...manifest.atlases.flatMap(({ key }) => [
      `art/sprites/${key}.png`, `art/sprites/${key}.json`, `art/sprites/${key}.anims.json`,
    ]),
    ...manifest.areas.map(area => `art/tiles/tiles_${area}.png`),
    ...(manifest.backgrounds ?? []).map(bg => bg.path),
    ...manifest.skillIcons.map(icon => icon.path),
    ...(manifest.sectRankIcons ?? []).map(icon => icon.path),
  ])];
}

async function probe(url: string, fetchAsset: typeof fetch): Promise<boolean> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);
  try {
    const options = { cache: 'no-store' as const, signal: controller.signal };
    let response = await fetchAsset(url, { ...options, method: 'HEAD' });
    // HEAD 也读完空正文；只取响应头会让 Chromium 将未消费的流记为 ERR_ABORTED。
    await response.arrayBuffer();
    let hasBody = false;
    // 部分静态服务不支持 HEAD；已明确缺失的 404 不重复请求。
    if (response.status === 405 || response.status === 501) {
      response = await fetchAsset(url, { ...options, method: 'GET' });
      hasBody = true;
    }
    const contentType = () => (response.headers.get('content-type') ?? '').split(';')[0].trim().toLowerCase();
    const pathname = url.split(/[?#]/)[0].toLowerCase();
    if (pathname.endsWith('.png')) {
      if (hasBody) await response.arrayBuffer();
      return response.ok && contentType().startsWith('image/');
    }
    const isJson = () => /^(?:application|text)\/(?:[\w.-]+\+)?json$/.test(contentType()) || contentType() === 'text/plain';
    if (!response.ok || !pathname.endsWith('.json') || !isJson()) {
      if (hasBody) await response.arrayBuffer();
      return false;
    }
    // HEAD 没有正文；JSON 与 text/plain 均验证解析，避免 Phaser 接到 HTML 或坏 JSON。
    if (!hasBody) response = await fetchAsset(url, { ...options, method: 'GET' });
    const body = await response.text();
    if (!response.ok || !isJson()) return false;
    JSON.parse(body);
    return true;
  } catch {
    // 可选素材的请求、解析或超时失败均按缺失处理，不抛出到启动流程。
    return false;
  } finally {
    clearTimeout(timeout);
  }
}

/** 游戏创建前 await；缓存探测结果与进行中的请求，不依赖 sync 时的存在性。 */
export async function probeOptionalAssets(urls: readonly string[], fetchAsset: typeof fetch = fetch): Promise<void> {
  await Promise.all([...new Set(urls)].map(url => {
    if (availability.has(url)) return;
    let request = pending.get(url);
    if (!request) {
      request = probe(url, fetchAsset).then(available => {
        availability.set(url, available);
        pending.delete(url);
      });
      pending.set(url, request);
    }
    return request;
  }));
}

export function assetAvailable(url: string): boolean { return availability.get(url) === true; }

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
