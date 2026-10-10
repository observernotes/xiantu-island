import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';
import { preview } from './isolated-build.mjs';

// Inspect the existing production dist through a real Vite preview. Native keys
// drive every action; sleeping the loop after postrender only preserves its frame.
const project = fileURLToPath(new URL('../', import.meta.url));
const dist = path.join(project, 'dist');
const output = process.env.REVERT_V2_REPORT_DIR ?? '/workspace/reports/revert_v2';
const viewport = { width: 1280, height: 720 };
const screenshots = Object.fromEntries(['spawn', 'walk', 'jump', 'attack', 'outfit']
  .map(name => [name, path.join(output, `${name}.png`)]));
const consoleMessages = [], consoleErrors = [], pageErrors = [], failedRequests = [], httpErrors = [];
const evidence = {
  suite: 'revert-v2-production-capture', project, dist, mode: 'production',
  viewport, screenshots, views: {}, passed: false,
  captureMethod: '原生 ArrowRight / Space / X；满足动作条件的 postrender 后 sleep 渲染循环，仅冻结已渲染的帧，不改角色/物理/动画。',
  outfitMethod: '独立浏览器上下文通过 localStorage 正常加载 level=10、equip.robe=fox_robe 的存档，由 GameScene.create / Player.syncAppearance 显示外观。',
};
await fs.mkdir(output, { recursive: true });
await fs.access(path.join(dist, 'index.html'));
const md5 = async file => createHash('md5').update(await fs.readFile(file)).digest('hex');
evidence.assetMd5 = Object.fromEntries(await Promise.all([
  'sprites/player_sword_m.png', 'sprites/player_sword_m.json', 'sprites/player_sword_m.anims.json',
  'sprites/fx_sword_slash.png', 'sprites/fx_sword_slash.json', 'sprites/fx_sword_slash.anims.json',
  'tiles/tiles_qingyun.png', 'tiles/tiles_qingyun.json', 'tiles/bg_qingyun_far.png',
  'tiles/bg_qingyun_mid.png', 'tiles/bg_qingyun.json',
].map(async file => [file, await md5(path.join(dist, 'art', file))])));

let server, browser;
try {
  server = await preview({ root: project, build: { outDir: 'dist' } });
  const baseURL = server.resolvedUrls.local[0];
  evidence.previewURL = baseURL;
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader',
      '--disable-background-timer-throttling', '--disable-renderer-backgrounding',
      '--disable-backgrounding-occluded-windows'] });

  const newPage = async outfit => {
    const context = await browser.newContext({ viewport, timezoneId: 'Asia/Shanghai',
      ...(outfit ? { storageState: { cookies: [], origins: [{ origin: new URL(baseURL).origin,
        localStorage: [{ name: 'xiantu_save_v1', value: JSON.stringify({ level: 10,
          equip: { robe: 'fox_robe' }, tutorialsSeen: ['qingyun_village'] }) }] }] } } : {}) });
    const page = await context.newPage();
    page.on('console', message => {
      const entry = { type: message.type(), text: message.text(), location: message.location() };
      consoleMessages.push(entry);
      if (entry.type === 'error') consoleErrors.push(entry);
    });
    page.on('pageerror', error => pageErrors.push({ message: error.message, stack: error.stack }));
    page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure() }));
    page.on('response', response => {
      if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() });
    });
    await page.goto(`${baseURL}?map=qingyun_village${outfit ? '' : '&reset=1'}`,
      { waitUntil: 'networkidle', timeout: 45000 });
    await page.waitForFunction(() => window.__scene?.map?.id === 'qingyun_village'
      && window.__scene.player?.active && window.__scene.player.onGround
      && !window.__scene.cameras.main.fadeEffect.isRunning,
    null, { timeout: 30000 });
    await page.bringToFront();
    return { page, context };
  };

  const state = page => page.evaluate(() => {
    const scene = window.__scene, player = scene.player, camera = scene.cameras.main;
    const imageKey = image => image.displayTexture?.key ?? image.texture?.key;
    const metadata = scene.cache.json.get(`${player.texture.key}_anims`);
    const rawSize = metadata?.frameSize;
    const frameSize = typeof rawSize === 'number' ? [rawSize, rawSize]
      : rawSize ?? [player.frame.realWidth, player.frame.realHeight];
    const backgrounds = scene.backgroundArt?.snapshot() ?? scene.parallax.map(({ ts, f }) => ({
      name: imageKey(ts).split('_').at(-1), key: imageKey(ts),
      factorX: f, factorY: ts.scrollFactorY, depth: ts.depth, y: ts.y,
      width: ts.displayWidth, height: ts.displayHeight, tiled: true,
    }));
    const environmentObjects = scene.children.list.filter(image => image.name?.startsWith('environment:'))
      .map(image => ({ name: image.name, textureKey: imageKey(image), frame: image.frame?.name,
        x: image.x, y: image.y, visible: image.visible, alpha: image.alpha }));
    const slashes = scene.children.list.filter(image => imageKey(image) === 'fx_sword_slash')
      .map(image => ({ key: imageKey(image), frame: image.frame.name, x: image.x, y: image.y,
        visible: image.visible, alpha: image.alpha, displaySize: [image.displayWidth, image.displayHeight],
        animation: image.anims?.currentAnim?.key }));
    const textureKeys = Object.keys(scene.textures.list).sort();
    return {
      testBridgePresent: typeof window.__xt !== 'undefined',
      map: { id: scene.map.id, spawn: scene.map.spawn, width: scene.map.width, height: scene.map.height },
      player: { x: player.x, y: player.y, feet: player.feet, onGround: player.onGround,
        state: player.state2, texture: player.texture.key, frame: player.frame.name,
        frameSize, actualFrameSize: [player.frame.realWidth, player.frame.realHeight],
        displayScale: player.scaleX, scale: [player.scaleX, player.scaleY],
        animation: player.anims.currentAnim?.key, animationPlaying: player.anims.isPlaying,
        velocity: { x: player.body.velocity.x, y: player.body.velocity.y } },
      progress: { level: scene.prog.level, appearance: scene.prog.appearance ?? null,
        equip: { ...scene.prog.equip } },
      camera: { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom,
        fadeRunning: camera.fadeEffect.isRunning, fadeAlpha: camera.fadeEffect.alpha },
      backgrounds, environment: scene.environmentArt?.snapshot(), environmentObjects,
      slashes, textureKeys,
      forbiddenTexturesPresent: ['props_qingyun', 'fx_qingyun_env', 'bg_qingyun_sky',
        'bg_qingyun_near', 'bg_qingyun_fg'].filter(key => scene.textures.exists(key)),
      renderedFrameFrozen: !scene.game.loop.running,
    };
  });

  const freeze = async (page, mode, key) => {
    await page.evaluate(mode => {
      const scene = window.__scene, origin = { x: scene.player.x, feet: scene.player.feet };
      window.__revertCapture = { frozen: false, mode, origin };
      const afterRender = () => {
        const player = scene.player;
        const slash = scene.children.list.find(image => image.texture?.key === 'fx_sword_slash'
          && /_play_0[234]$/.test(String(image.frame?.name)) && image.visible && image.alpha > 0);
        const ready = mode === 'walk' ? player.x > origin.x + 20 && player.body.velocity.x > 0
            && player.anims.currentAnim?.key.endsWith('_walk')
          : mode === 'jump' ? player.feet < origin.feet - 30 && player.body.velocity.y < -100
            && player.anims.currentAnim?.key.endsWith('_jump')
          : mode === 'attack' ? !!slash && player.anims.currentAnim?.key.endsWith('_attack')
          : player.onGround && player.anims.currentAnim?.key.endsWith('_idle');
        if (!ready) return;
        scene.game.events.off('postrender', afterRender);
        scene.game.loop.sleep();
        window.__revertCapture.frozen = true;
      };
      scene.game.events.on('postrender', afterRender);
    }, mode);
    if (key) await page.keyboard.down(key);
    await page.waitForFunction(() => window.__revertCapture?.frozen, null, { timeout: 15000 });
    const result = await state(page);
    await page.screenshot({ path: screenshots[mode], animations: 'allow' });
    if (key) await page.keyboard.up(key);
    return result;
  };

  for (const [mode, key] of [['spawn', undefined], ['walk', 'ArrowRight'], ['jump', 'Space'], ['attack', 'x']]) {
    const { page, context } = await newPage(false);
    evidence.views[mode] = await freeze(page, mode, key);
    await context.close();
  }
  const outfit = await newPage(true);
  evidence.views.outfit = await freeze(outfit.page, 'outfit');
  await outfit.context.close();

  for (const [mode, view] of Object.entries(evidence.views)) {
    assert.equal(view.testBridgePresent, false, `${mode}: production __xt must be absent`);
    assert.deepEqual(view.player.frameSize, [96, 96], `${mode}: metadata frame canvas 96`);
    assert.deepEqual(view.player.actualFrameSize, [96, 96], `${mode}: actual atlas frame canvas 96`);
    assert.equal(view.player.displayScale, 1, `${mode}: displayScale 1`);
    assert.deepEqual(view.backgrounds.map(layer => layer.key), ['bg_qingyun_far', 'bg_qingyun_mid'], `${mode}: only old far/mid layers`);
    assert.equal(view.environment.lights, 0, `${mode}: no building-positioned lights`);
    assert.equal(view.environment.fog, 2, `${mode}: two generated fog layers`);
    assert.equal(view.environment.particles, 40, `${mode}: forty generated fireflies`);
    assert.equal(view.environment.objects, 42, `${mode}: 42 environment objects`);
    assert.deepEqual([...new Set(view.environmentObjects.map(object => object.textureKey))].sort(),
      ['__environment_art_firefly', '__environment_art_fog'], `${mode}: generated textures only`);
    assert.deepEqual(view.forbiddenTexturesPresent, [], `${mode}: toon3d-only textures absent`);
    assert.equal(view.renderedFrameFrozen, true, `${mode}: capture preserves the completed render`);
  }
  assert.equal(evidence.views.spawn.player.texture, 'player_sword_m');
  assert.equal(evidence.views.spawn.player.x, evidence.views.spawn.map.spawn.x);
  assert.ok(Math.abs(evidence.views.spawn.player.feet - 704) < 1, 'spawn feet at original ground 704');
  assert.ok(evidence.views.walk.player.velocity.x > 0 && evidence.views.walk.player.x > evidence.views.spawn.player.x + 20);
  assert.ok(evidence.views.jump.player.velocity.y < 0 && evidence.views.jump.player.feet < evidence.views.spawn.player.feet - 30);
  assert.ok(evidence.views.attack.slashes.some(slash => slash.visible && /_play_0[234]$/.test(slash.frame)), 'attack capture contains the visible old sword slash');
  assert.equal(evidence.views.outfit.progress.equip.robe, 'fox_robe');
  assert.equal(evidence.views.outfit.progress.appearance, 'fox_robe');
  assert.equal(evidence.views.outfit.player.texture, 'player_sword_m__fox_robe', '96 body restores the 96 fox robe');
  assert.deepEqual(consoleErrors, [], 'console.error=0');
  assert.deepEqual(pageErrors, [], 'pageerror=0');
  assert.deepEqual(failedRequests, [], 'requestfailed=0');
  assert.deepEqual(httpErrors, [], 'HTTP errors, including 404, equal 0');
  evidence.passed = true;
  console.log(JSON.stringify({ passed: true, evidence: path.join(output, 'evidence.json'), screenshots,
    frameSize: evidence.views.spawn.player.frameSize, displayScale: evidence.views.spawn.player.displayScale,
    backgrounds: evidence.views.spawn.backgrounds.map(layer => layer.key),
    environment: { lights: 0, fog: 2, fireflies: 40, objects: 42 },
    outfitTexture: evidence.views.outfit.player.texture,
    consoleErrors: 0, pageErrors: 0, http404: 0, requestfailed: 0 }));
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser?.close();
  await server?.close();
  Object.assign(evidence, { applicationConsoleErrors: consoleErrors.length, pageErrorCount: pageErrors.length,
    requestFailureCount: failedRequests.length, httpErrorCount: httpErrors.length,
    http404Count: httpErrors.filter(error => error.status === 404).length,
    consoleMessages, consoleErrors, pageErrors, failedRequests, httpErrors });
  await fs.writeFile(path.join(output, 'evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
}
