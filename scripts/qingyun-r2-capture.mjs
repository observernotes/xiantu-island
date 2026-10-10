import assert from 'node:assert/strict';
import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { chromium } from '/tmp/pwt/node_modules/playwright-core/index.mjs';

// 仅服务现有 dist 生产包；不构建、不写素材、不启用测试桥或发版开关。
const project = path.resolve(process.env.QINGYUN_PROJECT ?? fileURLToPath(new URL('../', import.meta.url)));
const dist = path.join(project, 'dist');
const output = process.env.QINGYUN_REPORT_DIR ?? '/workspace/reports/qingyun_toon3d_a';
const file = name => path.join(output, `r2_${name}`);
const r2Path = '/workspace/xiantu/art/trial_v2/qingyun_3d/tiles/fx_qingyun.json';
const mapPath = '/workspace/xiantu/maps/qingyun_village.json';
const digest = location => createHash('sha256').update(fs.readFileSync(location)).digest('hex');
const r2 = JSON.parse(fs.readFileSync(r2Path, 'utf8'));
const fixedTime = new Date('2026-10-10T12:00:00+08:00').getTime();
const mime = { '.html': 'text/html', '.js': 'text/javascript', '.json': 'application/json', '.png': 'image/png', '.css': 'text/css' };
const consoleMessages = [], consoleErrors = [], pageErrors = [], failedRequests = [], httpErrors = [];
const evidence = {
  project, dist, mode: 'production', viewport: { width: 1280, height: 720 }, fixedTime,
  mapSource: { path: mapPath, sha256: digest(mapPath) },
  r2Source: { path: r2Path, sha256: digest(r2Path), lights: r2.lights },
  textureDecision: '交付 3 盏 glow_window、2 盏 glow_soft；按总监口径统一使用 fx_qingyun_env 图集的 glow_soft 帧。',
  screenshots: { spawn: file('spawn.png') }, views: {}, passed: false,
};
fs.mkdirSync(output, { recursive: true });
assert.ok(fs.existsSync(path.join(dist, 'index.html')), `生产构建不存在: ${dist}`);
const server = http.createServer((req, res) => {
  const pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname);
  if (pathname === '/favicon.ico') { res.writeHead(204); res.end(); return; }
  let location = path.resolve(dist, `.${pathname}`);
  if (!location.startsWith(`${dist}${path.sep}`) && location !== dist) { res.writeHead(403); res.end(); return; }
  if (fs.existsSync(location) && fs.statSync(location).isDirectory()) location = path.join(location, 'index.html');
  if (!fs.existsSync(location) || !fs.statSync(location).isFile()) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'content-type': mime[path.extname(location)] ?? 'application/octet-stream' });
  fs.createReadStream(location).pipe(res);
});
let browser;
try {
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { server.off('error', reject); resolve(); });
  });
  const port = server.address().port;
  evidence.url = `http://127.0.0.1:${port}/?map=qingyun_village&reset=1`;
  browser = await chromium.launch({ executablePath: '/usr/bin/google-chrome', headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--disable-background-timer-throttling',
      '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: evidence.viewport, timezoneId: 'Asia/Shanghai' });
  const page = await context.newPage();
  await page.addInitScript(({ fixedTime }) => {
    Date.now = () => fixedTime;
    let state = 1729;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }, { fixedTime });
  page.on('console', message => {
    const entry = { type: message.type(), text: message.text(), location: message.location() };
    consoleMessages.push(entry);
    if (entry.type === 'error') consoleErrors.push(entry);
  });
  page.on('pageerror', error => pageErrors.push({ message: error.message, stack: error.stack }));
  page.on('requestfailed', request => failedRequests.push({ url: request.url(), error: request.failure() }));
  page.on('response', response => { if (response.status() >= 400) httpErrors.push({ url: response.url(), status: response.status() }); });

  const readState = () => page.evaluate(() => {
    const scene = window.__scene, player = scene.player, camera = scene.cameras.main;
    const snapshot = scene.environmentArt?.snapshot();
    const tintFields = image => {
      const tint = image.tintTopLeft;
      return { tint, tintHex: `#${tint.toString(16).padStart(6, '0').toUpperCase()}`,
        tintCorners: [image.tintTopLeft, image.tintTopRight, image.tintBottomLeft, image.tintBottomRight] };
    };
    // 直接读取实际显示对象，避免只用配置证明纹理；内部 Light.alpha 是 flicker 前的基准值。
    const lights = scene.children.list.filter(image => image.name === 'environment:light').map((image, index) => {
      const entry = scene.environmentArt?.lights?.find(light => light.image === image);
      const textureKey = image.texture?.key, frame = image.frame?.name;
      const source = image.frame?.source?.image;
      const atlasFrameExists = !!textureKey && scene.textures.exists(textureKey) && scene.textures.get(textureKey).has(frame);
      const trueTexture = atlasFrameExists && source instanceof HTMLImageElement && source.complete && source.naturalWidth > 0;
      return { index, name: image.name, x: image.x, y: image.y, textureKey, frame, ...tintFields(image),
        alpha: image.alpha, baseAlpha: entry?.alpha ?? snapshot?.lightDetails?.[index]?.baseAlpha ?? null,
        blendMode: image.blendMode,
        flicker: entry?.flicker ?? null, radius: image.displayWidth / 2,
        displaySize: [image.displayWidth, image.displayHeight], origin: [image.originX, image.originY], visible: image.visible,
        source: { type: source?.constructor?.name ?? null, url: source?.src ?? null,
          width: source?.naturalWidth ?? source?.width ?? null, height: source?.naturalHeight ?? source?.height ?? null },
        atlasFrameExists, trueTexture, generated: textureKey?.startsWith('__environment_art_') ?? false };
    });
    const particles = scene.children.list.filter(image => ['environment:leaf', 'environment:firefly'].includes(image.name))
      .map(image => ({ name: image.name, textureKey: image.texture?.key, frame: image.frame?.name,
        ...tintFields(image), alpha: image.alpha, x: image.x, y: image.y, visible: image.visible }));
    return {
      map: { id: scene.map.id, width: scene.map.width, height: scene.map.height, spawn: scene.map.spawn },
      player: { x: player.x, y: player.y, feet: player.feet, onGround: player.onGround, state: player.state2,
        texture: player.texture.key, frame: player.frame.name, velocity: { x: player.body.velocity.x, y: player.body.velocity.y } },
      camera: { x: camera.scrollX, y: camera.scrollY, zoom: camera.zoom, rotation: camera.rotation },
      backgrounds: (scene.backgroundArt?.snapshot() ?? []).map(layer => ({ ...layer,
        alpha: scene.backgroundArt.layers.find(entry => entry.name === layer.name)?.image.alpha })),
      environment: { snapshot, lightCount: lights.length, lights, particles,
        generatedLightTexturePresent: scene.textures.exists('__environment_art_light') },
      testBridgePresent: !!window.__xt,
    };
  });

  await page.goto(evidence.url, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.__scene?.map?.id === 'qingyun_village' && window.__scene.player?.active
    && window.__scene.player.state2 === 'ground', null, { timeout: 30000 });
  await page.waitForTimeout(1000);
  evidence.views.spawn = await readState();
  evidence.environment = evidence.views.spawn.environment;
  await page.screenshot({ path: evidence.screenshots.spawn });
  assert.equal(evidence.views.spawn.testBridgePresent, false, '生产包必须 __xt=false');
  assert.equal(evidence.views.spawn.player.x, 176, '青云村出生点 x');
  assert.ok(Math.abs(evidence.views.spawn.player.feet - 704) < 1, '出生点脚底地面=704');
  assert.ok(evidence.environment.snapshot?.enabled, '青云环境已启用');
  assert.equal(evidence.environment.lightCount, 5, 'r2 仅 5 盏灯');
  assert.equal(evidence.environment.snapshot.lights, 5, '环境快照灯数一致');
  for (const [index, light] of evidence.environment.lights.entries()) {
    const expected = r2.lights[index];
    assert.equal(light.textureKey, 'fx_qingyun_env', `灯 ${index} 使用正式图集`);
    assert.equal(light.frame, 'glow_soft', `灯 ${index} 使用 glow_soft 帧`);
    assert.ok(light.trueTexture && !light.generated, `灯 ${index} 必须是真 PNG 图集帧`);
    assert.deepEqual(light.origin, [0.5, 0.5], `灯 ${index} 图集帧光晕以配置坐标为中心`);
    assert.equal(light.blendMode, 0, `灯 ${index} 使用显式 NORMAL 混合消除 ADD 叠绿背景的亮斑`);
    assert.equal(light.tint, parseInt(expected.color.replace('#', ''), 16), `灯 ${index} 保留交付 color`);
    const red = light.tint >> 16 & 255, green = light.tint >> 8 & 255, blue = light.tint & 255;
    assert.ok(red >= green && green > blue, `灯 ${index} 必须是暖色`);
    assert.ok(light.tintCorners.every(color => color === light.tint), `灯 ${index} tint 一致`);
    assert.equal(light.radius, expected.radius, `灯 ${index} 半径与 r2 一致`);
    assert.ok(light.radius <= 56, `灯 ${index} r≤56`);
    assert.equal(light.baseAlpha, expected.intensity, `灯 ${index} intensity→baseAlpha`);
    assert.ok(light.baseAlpha <= 0.4 && light.alpha <= 0.4, `灯 ${index} alpha≤0.4`);
    assert.equal(light.flicker, expected.flicker.amp, `灯 ${index} flicker.amp→数字`);
  }
  evidence.particleTintSummary = [...new Set(evidence.environment.particles.map(particle => particle.tintHex))];

  // 原生按键走跳短测；不调用 Player.step、不更改位置或移动/碰撞参数。
  await page.bringToFront();
  evidence.walk = { before: evidence.views.spawn.player };
  await page.keyboard.down('ArrowRight');
  await page.waitForFunction(() => window.__scene.player.x > 211, null, { timeout: 15000 });
  evidence.walk.moving = (await readState()).player;
  await page.keyboard.up('ArrowRight');
  await page.waitForTimeout(220);
  evidence.walk.after = (await readState()).player;
  assert.ok(evidence.walk.moving.x - evidence.walk.before.x > 30, 'ArrowRight 应移动至少 30px');
  assert.ok(evidence.walk.moving.velocity.x > 0, '步行正向速度');
  await page.waitForFunction(() => window.__scene.player.onGround, null, { timeout: 5000 });
  evidence.jump = { before: (await readState()).player };
  await page.keyboard.down('Space');
  await page.waitForFunction(() => window.__scene.player.body.velocity.y < 0 && window.__scene.player.feet < 689,
    null, { timeout: 15000 });
  evidence.jump.ascending = (await readState()).player;
  await page.keyboard.up('Space');
  assert.ok(evidence.jump.ascending.velocity.y < 0, 'Space 跳跃上升速度');
  assert.ok(evidence.jump.before.feet - evidence.jump.ascending.feet > 15, '跳跃脚底上升至少 15px');
  await page.waitForFunction(() => window.__scene.player.onGround, null, { timeout: 15000 });
  evidence.jump.landed = (await readState()).player;
  assert.ok(Math.abs(evidence.jump.landed.feet - evidence.jump.before.feet) < 1, '跳跃后回到地面');
  assert.equal((await readState()).testBridgePresent, false, '走跳后仍为生产包 __xt=false');
  evidence.mapSourceUnchanged = digest(mapPath) === evidence.mapSource.sha256;
  assert.ok(evidence.mapSourceUnchanged, '采证未修改 maps 源');
  assert.deepEqual(consoleErrors, [], '应用 console.error 必须为 0');
  assert.deepEqual(pageErrors, [], 'pageerror 必须为 0');
  assert.deepEqual(failedRequests, [], 'requestfailed 必须为 0');
  assert.deepEqual(httpErrors, [], '404/其他 HTTP 错误必须为 0');
  evidence.passed = true;
  console.log(JSON.stringify({ passed: true, screenshot: evidence.screenshots.spawn, evidence: file('evidence.json'),
    testBridgePresent: false, lightCount: evidence.environment.lightCount,
    lights: evidence.environment.lights.map(({ textureKey, frame, tintHex, alpha, baseAlpha, radius, trueTexture, blendMode }) =>
      ({ textureKey, frame, tintHex, alpha, baseAlpha, radius, trueTexture, blendMode })),
    particleTints: evidence.particleTintSummary, walkPixels: evidence.walk.moving.x - evidence.walk.before.x,
    jumpRise: evidence.jump.before.feet - evidence.jump.ascending.feet,
    applicationConsoleErrors: 0, pageErrors: 0, failedRequests: 0, httpErrors: 0 }));
} catch (error) {
  evidence.failure = { message: error.message, stack: error.stack };
  throw error;
} finally {
  await browser?.close();
  if (server.listening) await new Promise(resolve => server.close(resolve));
  Object.assign(evidence, { applicationConsoleErrors: consoleErrors.length, pageErrorCount: pageErrors.length,
    requestFailureCount: failedRequests.length, httpErrorCount: httpErrors.length,
    http404Count: httpErrors.filter(error => error.status === 404).length,
    consoleMessages, consoleErrors, pageErrors, failedRequests, httpErrors });
  fs.writeFileSync(file('evidence.json'), JSON.stringify(evidence, null, 2) + '\n');
  fs.writeFileSync(file('console.json'), JSON.stringify({ applicationConsoleErrors: consoleErrors.length,
    consoleMessages, consoleErrors, pageErrors, failedRequests, httpErrors }, null, 2) + '\n');
}
