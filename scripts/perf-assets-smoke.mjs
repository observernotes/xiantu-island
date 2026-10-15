// 默认 build:test + preview；XT_SMOKE_BASE_URL 仅用于复用已构建的测试服务。
import assert from 'node:assert/strict';
import { assertPerfErrorsClean, assertPerfLoopAlive, createPerfPage, launchPerfBrowser,
  loopSnapshot, openPerfGame, startPerfPreview } from './perf-smoke-utils.mjs';

const artPath = request => decodeURIComponent(new URL(request.url()).pathname)
  .match(/(?:^|\/)art\/.+\.(?:json|png)$/)?.[0];
const isSprite = pathname => /\/sprites\//.test(pathname);
let server, browser, context;
try {
  server = await startPerfPreview('perf-assets smoke');
  browser = await launchPerfBrowser();
  const watched = await createPerfPage(browser, 'perf-assets');
  ({ context } = watched);
  const { page } = watched, initial = [], subsequent = [];
  let countingRestarts = false;
  page.on('request', request => {
    const pathname = artPath(request);
    if (pathname) (countingRestarts ? subsequent : initial).push(pathname);
  });
  await watched.run(async () => {
    const first = await openPerfGame(page, server.baseURL);
    assert.ok(initial.some(pathname => isSprite(pathname) && pathname.endsWith('.json')), '首屏未请求 sprites JSON，统计无效');
    assert.ok(initial.some(pathname => isSprite(pathname) && pathname.endsWith('.png')), '首屏未请求 sprites PNG，统计无效');
    for (const key of ['icons_skills', 'icons_items'])
      assert.ok(initial.some(pathname => pathname.endsWith(`/icons/${key}.json`)), `首屏未请求 ${key} JSON，统计无效`);
    countingRestarts = true;
    const changes = [];
    for (const mapId of ['lingxi_path', 'bamboo_forest']) {
      const before = await loopSnapshot(page);
      await page.evaluate(destination => window.__xt.teleport(destination), mapId);
      await page.waitForLoadState('networkidle');
      const after = await assertPerfLoopAlive(page, before);
      assert.equal(after.mapId, mapId, '传送未进入指定地图');
      assert.ok(after.sceneGeneration > before.sceneGeneration, '换图没有重新 create');
      changes.push({ mapId, generation: after.sceneGeneration, frame: after.frame });
    }
    const jsonRequests = subsequent.filter(pathname => isSprite(pathname) && pathname.endsWith('.json'));
    const pngRequests = subsequent.filter(pathname => isSprite(pathname) && pathname.endsWith('.png'));
    assert.deepEqual(jsonRequests, [], `换图重复请求 sprites JSON：${JSON.stringify(jsonRequests)}`);
    assert.deepEqual(pngRequests, [], `换图重复请求 sprites PNG：${JSON.stringify(pngRequests)}`);
    assert.deepEqual(subsequent, [], `换图重复请求 art 素材：${JSON.stringify(subsequent)}`);
    const errors = await assertPerfErrorsClean(page, watched.errors);
    console.log(JSON.stringify({ suite: 'perf-assets', passed: true,
      initialSpriteJson: initial.filter(pathname => isSprite(pathname) && pathname.endsWith('.json')).length,
      initialSpritePng: initial.filter(pathname => isSprite(pathname) && pathname.endsWith('.png')).length,
      subsequentSpriteJson: jsonRequests.length, subsequentSpritePng: pngRequests.length,
      subsequentArtRequests: subsequent.length,
      transitions: changes, firstFrame: first.frame, loop: 'alive', ...errors }));
  });
} finally {
  await context?.close();
  await browser?.close();
  await server?.close();
}
