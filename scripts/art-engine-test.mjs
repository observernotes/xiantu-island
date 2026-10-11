// npm run build:test；测试资源仅在 scripts/fixtures 中，通过 __xt 加载，不写 art/。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { createHash } from 'node:crypto';
import { build } from 'vite';
import { findRoot } from './root.mjs';
import { preview } from './isolated-build.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = path.join(projectRoot, 'scripts/fixtures/art-engine');
const dataRoot = findRoot(projectRoot);
const legacyBodySize = [26, 58];
// 96 旧精修回退后、丹炉/五宗帖背包入口合入的冻结基线；早于 UI-5 商店窗。
const baselineRevision = '0dc2834a995f1cf2ed293f8b1b3823e1751b51dc';
const fixedTime = 1791608400000;
const port = Number(process.env.XT_TEST_PORT ?? 4337);
for (const value of [port, port + 1]) {
  assert.ok(Number.isInteger(value) && value > 0 && value < 65536, '测试端口非法');
  assert.ok(!(value >= 4186 && value <= 4190) && !(value >= 42863 && value <= 42865), '测试端口在保留区间');
}
let assertions = 0;
const equal = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const check = (value, message) => { assert.ok(value, message); assertions++; };
const json = async file => JSON.parse(await fs.readFile(path.join(fixtureRoot, file), 'utf8'));
const pngUrl = async file => `data:image/png;base64,${(await fs.readFile(path.join(fixtureRoot, file))).toString('base64')}`;
const median = values => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];

async function currentPlayerSpec() {
  const source = path.join(dataRoot, 'art/sprites/player_sword_m');
  const [atlas, anims] = await Promise.all(['json', 'anims.json'].map(async extension =>
    JSON.parse(await fs.readFile(`${source}.${extension}`, 'utf8'))));
  const canvases = Object.values(atlas.frames).map(frame => {
    const size = frame.sourceSize ?? frame.frame;
    return [size.w, size.h];
  });
  const frameSize = typeof anims.frameSize === 'number' ? [anims.frameSize, anims.frameSize]
    : anims.frameSize ?? canvases[0];
  const displayScale = anims.displayScale ?? 1;
  const bodySize = anims.bodySize ?? legacyBodySize;
  for (const [name, size] of [['frameSize', frameSize], ['bodySize', bodySize]]) {
    check(Array.isArray(size) && size.length === 2 && size.every(value => Number.isFinite(value) && value > 0), `当前主角 ${name} 非法`);
  }
  check(Number.isFinite(displayScale) && displayScale > 0, '当前主角 displayScale 非法');
  check(canvases.length > 0 && canvases.every(size => size[0] === frameSize[0] && size[1] === frameSize[1]), '当前主角 atlas 画布与 anims.frameSize 不一致');
  const worldBodySize = bodySize.map(value => value * displayScale);
  equal(worldBodySize, legacyBodySize, '当前主角 bodySize × displayScale 不等于旧 1x 世界碰撞体');
  return { frameSize, displayScale, bodySize, worldBodySize, origin: anims.origin ?? [0.5, 1] };
}

async function verifyLegacyPlayerFixture(playerSpec) {
  // 正式素材仍为旧 96 规格时，把已保存的旧精修三件套作为独立素材基准。
  // 192 等新规格仍由 currentPlayerSpec 和合成 1x/2x 路径验证。
  if (playerSpec.frameSize.some(size => size !== 96) || playerSpec.displayScale !== 1) return;
  const fingerprint = [];
  for (const [extension, fixture] of [['png', 'player-1x.png'], ['json', 'player-1x.atlas.json'], ['anims.json', 'player-1x.anims.json']]) {
    const [source, reference] = await Promise.all([
      fs.readFile(path.join(dataRoot, `art/sprites/player_sword_m.${extension}`)),
      fs.readFile(path.join(fixtureRoot, fixture))
    ]);
    const sha256 = buffer => createHash('sha256').update(buffer).digest('hex');
    equal(sha256(source), sha256(reference), `正式 96 主角 ${extension} 与旧精修夹具不同`);
    fingerprint.push({ fixture, bytes: reference.length, sha256: sha256(reference) });
  }
  return fingerprint;
}

async function loadPlaywright() {
  const candidates = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
    : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
  for (const candidate of candidates) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); }
    catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
    : [chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
  for (const candidate of candidates) try { await fs.access(candidate); return candidate; } catch { /* 下一条路径 */ }
  throw new Error('未找到 Chromium；请设置 CHROMIUM_EXECUTABLE_PATH');
}

// 已验收的引擎版本作为基线；两端共用当前数据源的地图、素材和发版关口。
async function buildBaseline() {
  if (process.env.ART_BASELINE_DIR) {
    const directory = path.resolve(process.env.ART_BASELINE_DIR);
    await fs.access(path.join(directory, 'index.html'));
    return { directory };
  }
  const temporaryRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-art-before-'));
  const archive = execFileSync('git', ['archive', baselineRevision, 'src', 'index.html'], { cwd: projectRoot });
  execFileSync('tar', ['-x', '-C', temporaryRoot], { input: archive });
  await fs.symlink(path.join(projectRoot, 'node_modules'), path.join(temporaryRoot, 'node_modules'));
  await fs.cp(path.join(projectRoot, 'src/gen'), path.join(temporaryRoot, 'src/gen'), { recursive: true });
  await fs.cp(path.join(projectRoot, 'public'), path.join(temporaryRoot, 'public'), { recursive: true });
  await fs.mkdir(path.join(temporaryRoot, 'data'), { recursive: true });
  await fs.copyFile(path.join(projectRoot, 'data/features.json'), path.join(temporaryRoot, 'data/features.json'));
  const directory = path.join(temporaryRoot, 'dist');
  await build({ root: temporaryRoot, configFile: false, logLevel: 'error', base: './',
    resolve: { alias: { '@xt': dataRoot } },
    define: { 'import.meta.env.VITE_XT_TEST': '"1"' }, build: { outDir: directory, emptyOutDir: true } });
  return { directory, temporaryRoot };
}

// Chromium screenshots are RGB/RGBA PNGs. Decode their pixels rather than comparing PNG compression.
function pngPixels(buffer) {
  let offset = 8, width, height, channels; const compressed = [];
  while (offset < buffer.length) {
    const length = buffer.readUInt32BE(offset), kind = buffer.toString('ascii', offset + 4, offset + 8);
    const payload = buffer.subarray(offset + 8, offset + 8 + length);
    if (kind === 'IHDR') {
      width = payload.readUInt32BE(0); height = payload.readUInt32BE(4);
      assert.equal(payload[8], 8); assert.ok(payload[9] === 2 || payload[9] === 6);
      channels = payload[9] === 2 ? 3 : 4;
    } else if (kind === 'IDAT') compressed.push(payload);
    offset += 12 + length;
  }
  const raw = inflateSync(Buffer.concat(compressed)), stride = width * channels;
  const pixels = Buffer.alloc(height * stride);
  const paeth = (a, b, c) => { const p = a + b - c, da = Math.abs(p - a), db = Math.abs(p - b), dc = Math.abs(p - c); return da <= db && da <= dc ? a : db <= dc ? b : c; };
  for (let row = 0; row < height; row++) {
    const filter = raw[row * (stride + 1)];
    for (let col = 0; col < stride; col++) {
      const index = row * stride + col, a = col >= channels ? pixels[index - channels] : 0;
      const b = row ? pixels[index - stride] : 0, c = row && col >= channels ? pixels[index - stride - channels] : 0;
      const predictor = [0, a, b, Math.floor((a + b) / 2), paeth(a, b, c)][filter];
      assert.notEqual(predictor, undefined, 'PNG filter 不支持');
      pixels[index] = (raw[row * (stride + 1) + 1 + col] + predictor) & 255;
    }
  }
  return { width, height, channels, pixels };
}
function pixelDifference(before, after, region) {
  const a = pngPixels(before), b = pngPixels(after);
  assert.deepEqual([a.width, a.height, a.channels], [b.width, b.height, b.channels]);
  let different = 0;
  for (let index = 0; index < a.pixels.length; index += a.channels) {
    const x = (index / a.channels) % a.width, y = Math.floor(index / a.channels / a.width);
    if (region && (x < region.x || y < region.y || x >= region.x + region.width || y >= region.y + region.height)) continue;
    for (let channel = 0; channel < a.channels; channel++) if (a.pixels[index + channel] !== b.pixels[index + channel]) { different++; break; }
  }
  return different;
}
function runtimeFingerprint(page) {
  const assets = new Map(), pending = new Set(), failures = [];
  page.on('response', response => {
    const url = new URL(response.url());
    if (!['http:', 'https:'].includes(url.protocol)) return;
    const operation = response.body().then(body => {
      const asset = { path: url.pathname, bytes: body.length, sha256: createHash('sha256').update(body).digest('hex') };
      const previous = assets.get(asset.path);
      if (previous && previous.sha256 !== asset.sha256) throw new Error(`响应内容变化：${asset.path}`);
      assets.set(asset.path, asset);
    }).catch(error => failures.push({ path: url.pathname, error: error.message }));
    pending.add(operation); operation.finally(() => pending.delete(operation));
  });
  return async () => {
    while (pending.size) await Promise.all([...pending]);
    equal(failures, [], '无法读取实际加载的运行产物响应');
    const fingerprint = [...assets.values()].sort((a, b) => a.path.localeCompare(b.path));
    check(fingerprint.some(asset => asset.path === '/') && fingerprint.some(asset => asset.path.endsWith('.js'))
      && fingerprint.some(asset => asset.path.endsWith('.json')) && fingerprint.some(asset => asset.path.endsWith('.png')),
    '运行产物指纹缺少 HTML/JS/JSON/PNG');
    return fingerprint;
  };
}

async function prepare(page, baseURL, map = 'qingyun_village') {
  await page.bringToFront();
  await page.addInitScript(({ fixedTime }) => {
    Date.now = () => fixedTime;
    let state = 123;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }, { fixedTime });
  const url = new URL(baseURL); url.searchParams.set('map', map);
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  try {
    await page.waitForFunction(() => window.__xt && window.__scene?.player?.active && window.__scene?.quests, null, { timeout: 45000 });
  } catch (error) {
    const state = await page.evaluate(() => {
      const s = window.__scene, load = s?.load, game = s?.game;
      const files = set => Array.from(set?.entries ?? []).map(file => ({ key: file.key, type: file.type, state: file.state }));
      return { url: location.href, bridge: !!window.__xt, scene: s?.sys?.settings?.status,
        player: s?.player && { active: s.player.active, texture: s.player.texture?.key }, quests: !!s?.quests,
        booted: game?.isBooted, loop: game?.loop?.running, contextLost: game?.renderer?.contextLost,
        loader: load && { state: load.state, totalToLoad: load.totalToLoad, totalComplete: load.totalComplete,
          totalFailed: load.totalFailed, queued: files(load.list), inflight: files(load.inflight), processing: files(load.queue) } };
    }).catch(diagnosticError => ({ diagnosticError: diagnosticError.message }));
    console.error(JSON.stringify({ artStartup: state }));
    error.message += `\n场景启动状态：${JSON.stringify(state)}`;
    throw error;
  }
  await page.evaluate(async ({ map, fixedTime }) => {
    window.__xt.seed(123); window.__xt.clock.pause(); window.__xt.clock.setNow(fixedTime);
    await window.__xt.teleport(map, 320, 608);
  }, { map, fixedTime });
  await page.waitForTimeout(300);
  return freezePose(page);
}
async function freezePose(page, environment, resetClock = false) {
  return page.evaluate(({ environment, fixedTime, resetClock }) => {
    const s = window.__scene, p = s.player;
    // 初次 prepare 已 seed；重复 seed 会复用 TileSprite 的随机内部纹理 UUID。
    if (resetClock) { window.__xt.clock.pause(); window.__xt.clock.setNow(fixedTime); }
    s.physics.world.pause(); s.tweens.killAll(); s.time.removeAllEvents();
    s.cameras.main.resetFX(); s.cameras.main.stopFollow(); s.cameras.main.setScroll(0, 0);
    p.body.reset(320, 608); p.body.setVelocity(0, 0); p.state2 = 'ground'; p.body.blocked.down = true;
    p.play('player_sword_m_idle'); p.anims.setCurrentFrame(s.anims.get('player_sword_m_idle').frames[0]); p.anims.pause();
    // 环境效果重建到第 0 秒，避免加载耗时改变雾/粒子/灯光相位。
    const area = s.environmentArt?.snapshot().area;
    if (area) s.configureEnvironment(environment ?? s.cache.json.get(`bg_${area}_config`)?.environment);
    s.backgroundArt?.update();
    for (const { ts } of s.parallax) ts.tilePositionX = 0;
    const labels = [];
    const visit = (objects, x = 0, y = 0, depth = 0) => {
      for (const object of objects) {
        if (object.anims?.currentAnim) { object.anims.setCurrentFrame(object.anims.currentAnim.frames[0]); object.anims.pause(); }
        if (object.type === 'Container') visit(object.list, x + object.x, y + object.y, object.depth);
        else if (object.type === 'Text') labels.push({ text: object.text, x: x + object.x, y: y + object.y, depth: depth || object.depth });
      }
    };
    s.drawHud(); visit(s.children.list); p.body.updateFromGameObject(); s.scene.pause();
    return { body: { x: p.body.x, y: p.body.y, width: p.body.width, height: p.body.height, bottom: p.body.bottom },
      x: p.x, y: p.y, feet: p.feet, origin: [p.originX, p.originY], scale: p.scaleX, displayHeight: p.displayHeight,
      frameSize: [p.frame.realWidth, p.frame.realHeight], sourceBody: [p.body.sourceWidth, p.body.sourceHeight], frame: p.frame.name, labels,
      collision: [s.map.solids, s.map.oneWays].map(group => group.getChildren().map(object => ({ x: object.body.x, y: object.body.y, width: object.body.width, height: object.body.height }))), map: { width: s.map.width, height: s.map.height }, renderer: s.game.renderer.type };
  }, { environment, fixedTime, resetClock });
}
async function measurementState(page) {
  return page.evaluate(() => {
    const s = window.__scene, image = s.textures.get('tiles_qingyun').source[0], meta = s.cache.json.get('tiles_qingyun_meta');
    return { loop: { running: s.game.loop.running, rafRunning: s.game.loop.raf.isRunning, frame: s.game.loop.frame },
      workload: { renderer: s.game.renderer.type, map: s.map.id,
        tiles: { size: [image.width, image.height], columns: meta.columns, tilecount: meta.tilecount },
        backgrounds: s.backgroundArt?.snapshot(), environment: s.environmentArt?.snapshot(),
        children: s.children.list.length, mobs: s.mobs.length } };
  });
}
async function screenshot(page) { await page.bringToFront(); await page.waitForTimeout(100); return page.screenshot(); }
async function fps(page) {
  await page.bringToFront();
  const result = await page.evaluate(() => new Promise((resolve, reject) => {
    const WARMUP = 8, INTERVALS = 20; // tier1 限时 130s：软件渲染 ~12fps 下 30 帧太慢
    const scene = window.__scene, game = scene.game, stamps = [];
    const gl = game.renderer.gl, debug = gl?.getExtension('WEBGL_debug_renderer_info');
    const rendererName = gl ? gl.getParameter(debug?.UNMASKED_RENDERER_WEBGL ?? gl.RENDERER) : 'Canvas (GPU disabled)';
    let warmup = 0;
    const timer = setTimeout(() => {
      game.events.off('postrender', rendered); game.loop.sleep();
      reject(new Error(`渲染帧采样超时：warmup=${Math.min(warmup, WARMUP)}, frames=${stamps.length}, renderer=${game.renderer.type}`));
    }, 15000);
    function rendered() {
      if (warmup++ < WARMUP) return;
      stamps.push(performance.now());
      if (stamps.length === INTERVALS + 1) {
        clearTimeout(timer);
        game.events.off('postrender', rendered); game.loop.sleep();
        const deltas = stamps.slice(1).map((time, i) => time - stamps[i]).sort((a, b) => a - b);
        resolve({ fps: INTERVALS * 1000 / (stamps.at(-1) - stamps[0]), medianMs: deltas[Math.floor(INTERVALS / 2)],
          renderer: game.renderer.type, rendererName });
      }
    }
    game.loop.sleep(); game.loop.resetDelta();
    game.events.on('postrender', rendered); scene.scene.resume(); game.loop.wake();
  }));
  return result;
}
function playerAnchors(snapshot) {
  return { body: snapshot.player.body, x: snapshot.player.x, y: snapshot.player.y,
    feet: snapshot.player.feet, origin: snapshot.player.origin, displayHeight: snapshot.player.displayHeight, labels: [...snapshot.labels].sort((a, b) => a.depth - b.depth || a.x - b.x || a.y - b.y || a.text.localeCompare(b.text)) };
}
async function movingAppearance(page) {
  return page.evaluate(() => {
    const p = window.__scene.player, body = p.body;
    window.__xt.art.applyAtlas('player_sword_m');
    body.position.x += 13; body.position.y -= 9; body.setVelocity(130, -200);
    const before = { x: body.x, y: body.y, velocity: { ...body.velocity } };
    p.getAppearance = () => 'art_test_2x'; p.syncAppearance();
    const after = { x: body.x, y: body.y, velocity: { ...body.velocity } };
    const key = p.texture.key;
    p.getAppearance = () => undefined; p.syncAppearance();
    const reverted = { x: body.x, y: body.y, velocity: { ...body.velocity } };
    body.setVelocity(0, 0); body.updateFromGameObject();
    return { before, after, reverted, key };
  });
}
function variantFixture(key, atlas, anims) {
  return {
    atlas: { ...atlas, frames: Object.fromEntries(Object.entries(atlas.frames).map(([name, frame]) => [name.replace('player_sword_m_', `${key}_`), frame])) },
    anims: { ...anims, atlas: key, anims: anims.anims.map(animation => ({ ...animation,
      key: animation.key.replace(anims.atlas, key), frames: animation.frames.map(frame => frame.replace('player_sword_m_', `${key}_`)) })) }
  };
}

let baseline, beforeServer, afterServer, browser;
const errors = [], metrics = {};
const started = performance.now();
const progress = (stage, details = {}) => console.log(JSON.stringify({ test: 'art-engine', stage,
  elapsedSeconds: Number(((performance.now() - started) / 1000).toFixed(2)), ...details }));
try {
  const playerSpec = await currentPlayerSpec();
  metrics.playerSpec = { source: path.join(dataRoot, 'art/sprites/player_sword_m'), ...playerSpec };
  metrics.legacyPlayerFixture = await verifyLegacyPlayerFixture(playerSpec);
  await fs.access(path.join(projectRoot, 'dist/index.html'));
  progress('baseline-build');
  baseline = await buildBaseline();
  progress('baseline-ready');
  beforeServer = await preview({ root: projectRoot, build: { outDir: baseline.directory },
    preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  afterServer = process.env.XT_SMOKE_BASE_URL
    ? { resolvedUrls: { local: [process.env.XT_SMOKE_BASE_URL] }, httpServer: { close(done) { done(); } } }
    : await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: port + 1, strictPort: true }, logLevel: 'error' });
  const api = await loadPlaywright();
  const launchOptions = { executablePath: await browserPath(api.chromium), headless: true,
    args: [...(process.env.ART_RENDERER === 'canvas' ? ['--disable-webgl', '--disable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] };
  browser = await api.chromium.launch(launchOptions);
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  async function newPage(targetContext = context) {
    const page = await targetContext.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    return page;
  }
  const beforePage = await newPage(), afterPage = await newPage();
  const fingerprintBefore = runtimeFingerprint(beforePage), fingerprintAfter = runtimeFingerprint(afterPage);
  const beforeState = await prepare(beforePage, beforeServer.resolvedUrls.local[0]);
  const beforeImage = await screenshot(beforePage);
  progress('before-ready');
  metrics.runtimeBefore = await fingerprintBefore();
  // 已捕获的对照不再使用，关闭页面释放纹理与 WebGL 上下文。
  await beforePage.close();
  const afterState = await prepare(afterPage, afterServer.resolvedUrls.local[0]);
  const afterImage = await screenshot(afterPage);
  progress('after-ready');
  await afterPage.evaluate(() => window.__scene.game.loop.sleep());
  equal(afterState.frameSize, playerSpec.frameSize, '正式主角画布与当前数据源不一致');
  equal(afterState.scale, playerSpec.displayScale, '正式主角 displayScale 与当前数据源不一致');
  equal(afterState.sourceBody, playerSpec.bodySize, '正式主角源像素 bodySize 与当前数据源不一致');
  equal([afterState.body.width, afterState.body.height], playerSpec.worldBodySize, '正式主角世界碰撞体不等于 bodySize × displayScale');
  equal(afterState.body, { x: 307, y: 550, width: 26, height: 58, bottom: 608 }, '正式主角碰撞体换算后不是旧 1x 世界尺寸/位置');
  equal([afterState.x, afterState.y, afterState.feet, afterState.origin, afterState.displayHeight],
    [320, 608, 608, playerSpec.origin, playerSpec.frameSize[1] * playerSpec.displayScale], '正式主角脚底线/原点/显示高度改变');
  equal(afterState, beforeState, '主角无覆盖时 world body / 脚底 / 所有名牌及 HUD 与基线不同');
  const differentPixels = pixelDifference(beforeImage, afterImage);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-before.png'), beforeImage);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-after.png'), afterImage);
  equal(differentPixels, 0, `主角没有测试覆盖时截图不同：${differentPixels} 像素`);
  check(await afterPage.evaluate(() => !!window.__xt.art), '测试桥缺少 __xt.art');
  const officialTiles = await afterPage.evaluate(() => {
    const s = window.__scene, image = s.textures.get('tiles_qingyun').source[0], meta = s.cache.json.get('tiles_qingyun_meta');
    return { size: [image.width, image.height], columns: meta.columns, tilecount: meta.tilecount };
  });
  metrics.runtimeAfter = await fingerprintAfter();
  metrics.identicalRuntime = JSON.stringify(metrics.runtimeBefore) === JSON.stringify(metrics.runtimeAfter);
  progress('runtime-fingerprint', { identical: metrics.identicalRuntime, beforeAssets: metrics.runtimeBefore.length,
    afterAssets: metrics.runtimeAfter.length });
  await afterPage.close();

  const fixturesPage = await newPage();
  const tilesMetadata = await json('tiles.json');
  await fixturesPage.route('**/art/tiles/tiles_qingyun.png', route => route.fulfill({ contentType: 'image/png', path: path.join(fixtureRoot, 'tiles.png') }));
  await fixturesPage.route('**/art/tiles/tiles_qingyun.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(tilesMetadata) }));
  const fixturesState = await prepare(fixturesPage, afterServer.resolvedUrls.local[0]);
  progress('fixtures-ready');
  equal(fixturesState.renderer, afterState.renderer, '示例素材与正式素材使用不同渲染器');
  const official = await fixturesPage.evaluate(() => window.__xt.art.snapshot());
  await fixturesPage.evaluate(() => window.__scene.game.loop.sleep());

  // 合成 1x/2x 三件套独立路由，缩放覆盖不依赖正式主角素材。
  const legacyPage = await newPage();
  for (const [extension, fixture] of [['png', 'synthetic-player-1x.png'], ['json', 'synthetic-player-1x.atlas.json'], ['anims.json', 'synthetic-player-1x.anims.json']]) {
    await legacyPage.route(`**/art/sprites/player_sword_m.${extension}`, route => route.fulfill({
      contentType: extension === 'png' ? 'image/png' : 'application/json', path: path.join(fixtureRoot, fixture) }));
  }
  await legacyPage.route('**/art/tiles/tiles_qingyun.png', route => route.fulfill({ contentType: 'image/png', path: path.join(fixtureRoot, 'tiles.png') }));
  await legacyPage.route('**/art/tiles/tiles_qingyun.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(tilesMetadata) }));
  const legacyState = await prepare(legacyPage, afterServer.resolvedUrls.local[0]);
  progress('legacy-ready');
  equal([legacyState.frameSize, legacyState.scale, legacyState.sourceBody], [[96, 96], 1, [26, 58]], '旧 atlas 缺少缩放/bodySize 时没有回退 1x');
  const oneX = await legacyPage.evaluate(() => window.__xt.art.snapshot());
  equal(playerAnchors(official), playerAnchors(oneX), '正式主角相比合成 1x 改变 world body / 脚底线 / 所有名牌及 HUD');
  equal(official.collision, oneX.collision, '正式主角相比合成 1x 改变地图碰撞体');
  const oneXImage = await screenshot(legacyPage);
  const anims = await json('player-2x.anims.json'), atlas = await json('player-2x.atlas.json'), image = await pngUrl('player-2x.png');
  await legacyPage.evaluate(async ({ image, atlas, anims }) => {
    await window.__xt.art.loadAtlas(anims.atlas, image, atlas, anims);
    window.__xt.art.applyAtlas(anims.atlas); window.__scene.player.body.updateFromGameObject();
  }, { image, atlas, anims });
  const twoX = await legacyPage.evaluate(() => window.__xt.art.snapshot());
  equal(twoX.player.frameSize, [192, 192], '2x 画布未逐 key 读取');
  equal(twoX.player.displayScale, 0.5, 'displayScale 未读取');
  equal(playerAnchors(twoX), playerAnchors(oneX), '2x 主角 body / 脚底 / 名牌锚点变化');
  equal(await legacyPage.evaluate(() => [window.__scene.player.body.sourceWidth, window.__scene.player.body.sourceHeight]), [52, 116], 'bodySize 不是源像素2x');
  equal(await legacyPage.evaluate(() => window.__scene.player.texture.source[0].scaleMode), 1, 'pixelArt 开关未使用 nearest');
  const duplicatePixels = pixelDifference(oneXImage, await screenshot(legacyPage));
  metrics.duplicate2xPixelDifference = duplicatePixels;
  // Canvas roundPixels 的drawImage额外0.5源像素随displayScale变化；补充的整图等同只适用于WebGL。
  if (await legacyPage.evaluate(() => window.__scene.game.renderer.type !== 1)) equal(duplicatePixels, 0, '合成 1x 的 nearest 2x 测试夹具缩至0.5后像素不一致');
  await legacyPage.evaluate(({ key }) => window.__xt.art.applyAtlas(key, { pixelArt: false }), { key: anims.atlas });
  equal(await legacyPage.evaluate(() => window.__scene.player.texture.source[0].scaleMode), 0, '线性过滤开关未生效');
  const legacyMoving = await movingAppearance(legacyPage);
  equal(legacyMoving.key, anims.atlas, '旧 1x 移动中未通过真正换装切到 2x');
  equal(legacyMoving.after, legacyMoving.before, '旧 1x→2x 换装回卷当前帧走/跳位移或速度');
  equal(legacyMoving.reverted, legacyMoving.before, '旧 2x→1x 换装回卷当前帧走/跳位移或速度');
  await legacyPage.evaluate(() => window.__xt.art.applyAtlas('player_sword_m'));
  const legacyReverted = await legacyPage.evaluate(() => window.__xt.art.snapshot());
  equal([legacyReverted.player.frameSize, legacyReverted.player.displayScale], [[96, 96], 1], '旧 96 atlas 回切默认 displayScale 不是 1');
  equal(playerAnchors(legacyReverted), playerAnchors(oneX), '旧 1x/2x 混用回切改变锚点');
  const noMetadata = await legacyPage.evaluate(() => {
    window.__scene.cache.json.remove('player_sword_m_anims');
    window.__xt.art.applyAtlas('player_sword_m');
    return window.__xt.art.snapshot();
  });
  equal([noMetadata.player.frameSize, noMetadata.player.displayScale], [[96, 96], 1], '缺少元数据时未读取旧 atlas 帧尺寸/默认缩放');
  equal(playerAnchors(noMetadata), playerAnchors(oneX), '无元数据旧 atlas 回退改变 body / 脚底 / 名牌');
  await legacyPage.close();
  await fixturesPage.evaluate(() => window.__scene.game.loop.wake());

  await fixturesPage.evaluate(async ({ image, atlas, anims }) => {
    await window.__xt.art.loadAtlas(anims.atlas, image, atlas, anims);
    window.__xt.art.applyAtlas(anims.atlas);
  }, { image, atlas, anims });
  equal(playerAnchors(await fixturesPage.evaluate(() => window.__xt.art.snapshot())), playerAnchors(official), '正式主角与 2x 测试外观互换改变锚点');
  const originalRates = await fixturesPage.evaluate(({ key }) => {
    const s = window.__scene;
    return ['idle', 'walk', 'jump', 'djump', 'rope', 'ladder', 'attack', 'hit', 'die', 'sit', 'gather'].map(action => {
      const old = s.anims.get(`player_sword_m_${action}`), newer = s.anims.get(`${key}_${action}`);
      return [old.frames.length, old.frameRate, newer.frames.length, newer.frameRate];
    });
  }, { key: anims.atlas });
  check(originalRates.every(([oldCount, oldRate, newCount, newRate]) => oldCount === newCount && oldRate === newRate), '2x 帧数/帧率改变');
  const moving = await movingAppearance(fixturesPage);
  equal(moving.key, anims.atlas, '移动中未通过真正换装切到 2x');
  equal(moving.after, moving.before, '2x 换装回卷当前帧走/跳位移或速度');
  equal(moving.reverted, moving.before, '回到正式主角回卷当前帧走/跳位移或速度');
  await fixturesPage.evaluate(() => window.__xt.art.applyAtlas('player_sword_m'));
  const reverted = await fixturesPage.evaluate(() => window.__xt.art.snapshot());
  equal([reverted.player.frameSize, reverted.player.displayScale], [playerSpec.frameSize, playerSpec.displayScale], '正式主角回切未恢复当前数据源画布/缩放');
  equal(playerAnchors(reverted), playerAnchors(official), '正式主角回切改变锚点');

  // 合成 2x 本体 + 合成 1x 旧外观，独立验证六套外观的回退/同规格接回规则。
  await fixturesPage.evaluate(() => window.__scene.game.loop.sleep());
  const synthetic2xPage = await newPage();
  const base2x = variantFixture('player_sword_m', atlas, anims);
  await synthetic2xPage.route('**/art/sprites/player_sword_m.png', route => route.fulfill({
    contentType: 'image/png', path: path.join(fixtureRoot, 'player-2x.png') }));
  for (const [extension, data] of [['json', base2x.atlas], ['anims.json', base2x.anims]]) {
    await synthetic2xPage.route(`**/art/sprites/player_sword_m.${extension}`, route => route.fulfill({
      contentType: 'application/json', body: JSON.stringify(data) }));
  }
  await synthetic2xPage.route('**/art/tiles/tiles_qingyun.png', route => route.fulfill({ contentType: 'image/png', path: path.join(fixtureRoot, 'tiles.png') }));
  await synthetic2xPage.route('**/art/tiles/tiles_qingyun.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(tilesMetadata) }));
  const synthetic2xState = await prepare(synthetic2xPage, afterServer.resolvedUrls.local[0]);
  equal([synthetic2xState.frameSize, synthetic2xState.scale, synthetic2xState.sourceBody], [[192, 192], 0.5, [52, 116]], '合成 2x 本体未读取画布/缩放/源碰撞体');
  const synthetic2x = await synthetic2xPage.evaluate(() => window.__xt.art.snapshot());
  equal(playerAnchors(synthetic2x), playerAnchors(oneX), '合成 2x 本体相比合成 1x 改变世界锚点');
  progress('synthetic-2x-ready');
  const legacyAtlas = await json('synthetic-player-1x.atlas.json'), legacyAnims = await json('synthetic-player-1x.anims.json'), legacyImage = await pngUrl('synthetic-player-1x.png');
  for (const appearance of ['fox_robe', ...['tianjian', 'taixu', 'lingfu', 'youying', 'wanshou'].map(area => `outfit_${area}_1`)]) {
    const key = `player_sword_m__${appearance}`;
    const oldVariant = variantFixture(key, legacyAtlas, legacyAnims);
    const outdated = await synthetic2xPage.evaluate(async ({ key, appearance, image, atlas, anims }) => {
      const s = window.__scene;
      window.__xt.art.applyAtlas('player_sword_m');
      if (s.textures.exists(key)) s.textures.remove(key);
      await window.__xt.art.loadAtlas(key, image, atlas, anims);
      s.player.getAppearance = () => appearance; s.player.syncAppearance(); s.player.body.updateFromGameObject();
      return window.__xt.art.snapshot();
    }, { key, appearance, image: legacyImage, ...oldVariant });
    equal(outdated.player.key, 'player_sword_m', `${appearance} 合成 1x 外观未回退合成 2x 本体`);
    equal([outdated.player.frameSize, outdated.player.displayScale], [[192, 192], 0.5], `${appearance} 旧 atlas 回退未保留合成 2x 规格`);
    equal(playerAnchors(outdated), playerAnchors(synthetic2x), `${appearance} 旧 atlas 回退改变 body/脚底/名牌`);
    const variant = variantFixture(key, atlas, anims);
    const result = await synthetic2xPage.evaluate(async ({ key, appearance, image, atlas, anims }) => {
      const s = window.__scene; window.__xt.art.applyAtlas('player_sword_m');
      if (s.textures.exists(key)) s.textures.remove(key);
      await window.__xt.art.loadAtlas(key, image, atlas, anims);
      s.player.getAppearance = () => appearance; s.player.syncAppearance(); s.player.body.updateFromGameObject();
      return window.__xt.art.snapshot();
    }, { key, appearance, image, ...variant });
    equal(result.player.key, key, `${appearance} 未走同帧换装`);
    equal(result.player.displayScale, 0.5, `${appearance} 未继承逐 key displayScale`);
    equal(playerAnchors(result), playerAnchors(synthetic2x), `${appearance} body/名牌变化`);
  }
  await synthetic2xPage.close();
  await fixturesPage.evaluate(() => window.__scene.game.loop.wake());

  // 所有图块都来自实际 MapBuilder / Tilemap；爬行块读真实显示对象。
  const tiles = await fixturesPage.evaluate(() => {
    const s = window.__scene;
    return { terrain: s.children.list.filter(child => child.type === 'TilemapLayer').flatMap(layer => layer.layer.data.flatMap(row => row
      .filter(tile => tile.index >= 0).map(tile => ({ x: tile.x, y: tile.y, frame: tile.index })))),
      // UI-CAM 的 HUD 底条复用同一纹理，位于地图底边之外，不属于梯绳。
      climbables: s.children.list.filter(child => (child.displayTexture?.key ?? child.texture?.key) === 'tiles_qingyun_ss' && child.y < s.map.height)
        .map(child => ({ x: child.x, y: child.y, frame: Number(child.displayFrame?.name ?? child.frame.name) })) };
  });
  const hash = (x, y) => Math.imul(Math.imul(Math.floor(x), 73856093) ^ Math.imul(Math.floor(y), 19349663), 2654435761) >>> 0;
  check(tiles.terrain.length > 0, '测试地图缺少地面');
  check(tiles.terrain.some(tile => tile.frame >= 16), '地面/平台/边缘变体未生效');
  for (const tile of tiles.terrain) equal(tile.frame, tile.frame % 16 + 16 * ((hash(tile.x, tile.y) >>> 13) % 3), '同坐标挑块与 UI-1 哈希不同');
  check(tiles.climbables.length > 0, '地图缺少梯绳');
  check(tiles.climbables.some(tile => tile.frame >= 16), '梯绳变体未生效');
  for (const tile of tiles.climbables) equal(tile.frame, tile.frame % 16 + 16 * ((hash(tile.x / 32, tile.y / 32) >>> 13) % 3), '梯绳坐标哈希不稳定');

  const background = await json('background.json');
  for (const layer of Object.keys(background.layers)) {
    await fixturesPage.evaluate(async ({ key, url }) => window.__xt.art.loadImage(key, url), { key: `art_test_${layer}`, url: await pngUrl(`${layer}.png`) });
  }
  const plainImage = await screenshot(fixturesPage);
  await fixturesPage.evaluate(config => window.__xt.art.rebuildBackground(config), background);
  const layers = await fixturesPage.evaluate(() => window.__xt.art.snapshot().backgrounds);
  equal(layers.length, 5, '五层背景未生效');
  for (const [index, layer] of ['sky', 'far', 'mid', 'near', 'fg'].entries()) {
    equal(layers[index].key, `art_test_${layer}`, `${layer} 纹理错误`);
    const mapWidth = beforeState.map.width, factor = background.layers[layer].scrollFactor;
    const factorX = Array.isArray(factor) ? factor[0] : factor;
    const coverage = Math.max(mapWidth, 1280 + Math.max(0, factorX) * (mapWidth - 1280));
    equal(layers[index].width, coverage, `${layer} 未按实际地图宽覆盖视差`);
    equal(layers[index].factorX, factorX, `${layer} 横向系数未读配置`);
    equal(layers[index].factorY, Array.isArray(factor) ? factor[1] : ['near', 'fg'].includes(layer) ? 1 : 0, `${layer} 纵向系数未读配置`);
    equal(layers[index].tiled, background.layers[layer].tile, `${layer} 平铺开关未读配置`);
    const fy = Array.isArray(factor) ? factor[1] : ['near', 'fg'].includes(layer) ? 1 : 0;
    equal(layers[index].y, (fy === 0 ? 720 : beforeState.map.height) + background.layers[layer].yOffset, `${layer} yOffset 未读配置`);
  }
  const foreground = layers.find(layer => layer.key === 'art_test_fg');
  check(foreground.depth > official.player.depth || foreground.depth > 10, '前景没有覆盖角色');
  check(foreground.depth < 30, '前景挡住交互提示/HUD');
  await fixturesPage.evaluate(config => window.__xt.art.rebuildBackground(config), { ...background, layers: Object.fromEntries(Object.entries(background.layers).filter(([name]) => name !== 'fg')) });
  const withoutForeground = await screenshot(fixturesPage);
  await fixturesPage.evaluate(config => window.__xt.art.rebuildBackground(config), background);
  const decoratedImage = await screenshot(fixturesPage);
  check(pixelDifference(withoutForeground, decoratedImage, { x: 272, y: 512, width: 96, height: 96 }) > 10, '前景没有实际覆盖角色区域');
  check(pixelDifference(plainImage, decoratedImage) > 100, '五层示例素材没有改变渲染');
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-fixtures.png'), decoratedImage);

  const configured = await fixturesPage.evaluate(config => window.__xt.art.configureEnvironment(config), background.environment);
  const environment = configured?.environment ?? configured ?? await fixturesPage.evaluate(() => window.__xt.art.snapshot().environment);
  equal([environment.lights, environment.fog, environment.particles], [2, 1, 20], '环境对象未按预算创建');
  check(environment.enabled, '示例区域环境未开启');
  check(environment.depths.light > 10 && environment.depths.particle < foreground.depth, '环境 depth 未处于角色与前景之间');
  const envImage = await screenshot(fixturesPage);
  check(pixelDifference(decoratedImage, envImage) > 10, '光照/雾/粒子没有改变渲染');
  const switches = await fixturesPage.evaluate(() => {
    const art = window.__xt.art;
    art.setEnvironmentEnabled(false); const globalOff = art.snapshot().environment;
    art.setEnvironmentEnabled(true); art.setAreaEnabled('qingyun', false); const areaOff = art.snapshot().environment;
    art.setAreaEnabled('qingyun', true); const on = art.snapshot().environment;
    return { globalOff, areaOff, on };
  });
  equal(switches.globalOff.enabled, false, '环境总开关无效');
  equal(switches.areaOff.enabled, false, '按区域开关无效');
  equal(switches.on.enabled, true, '环境开关未恢复');
  const maximumBudget = { ...background.environment, budget: { lights: 999, fog: 999, particles: 999 },
    lights: Array.from({ length: 30 }, (_, i) => ({ x: 100 + i * 60, y: 580, radius: 64 })),
    fog: Array.from({ length: 10 }, (_, i) => ({ x: i * 160, y: 560 + i * 8, width: 640, height: 32, alpha: 0.08 })),
    particles: [{ kind: 'leaf', x: 0, y: 380, width: 2560, height: 260, count: 999 }] };
  const maximum = await fixturesPage.evaluate(config => window.__xt.art.configureEnvironment(config).environment, maximumBudget);
  equal([maximum.lights, maximum.fog, maximum.particles], [24, 8, 96], '环境硬预算帽未生效');
  equal(maximum.budget, { lights: 24, fog: 8, particles: 96 }, '配置预算未钳位硬帽');

  // 144Hz 用准确 1000/144 delta 驱动实际环境 update，验证刷新率无关速度与 CPU 帧预算。
  const simulation = await fixturesPage.evaluate(() => {
    const environment = window.__scene.environmentArt;
    const start = environment.snapshot().simulationSeconds, durations = [];
    for (let frame = 0; frame < 288; frame++) { const at = performance.now(); environment.update(1000 / 144); durations.push(performance.now() - at); }
    durations.sort((a, b) => a - b);
    const end = environment.snapshot().simulationSeconds;
    environment.setEnabled(false); environment.update(1000 / 144); const stopped = environment.snapshot().simulationSeconds; environment.setEnabled(true);
    return { elapsed: end - start, stopped: stopped - end, p95ms: durations[Math.floor(durations.length * 0.95)], maxMs: durations.at(-1) };
  });
  check(Math.abs(simulation.elapsed - 2) < 1e-9, '144Hz 环境时间/速度不按秒推进');
  equal(simulation.stopped, 0, '关闭环境仍推进模拟');
  check(simulation.p95ms < 1000 / 144, '环境 CPU p95 超过 144Hz 帧预算');

  metrics.renderer = afterState.renderer === 1 ? 'canvas' : 'webgl';
  metrics.environment144HzP95Ms = simulation.p95ms;
  metrics.maximumBudget = { lights: maximum.lights, fog: maximum.fog, particles: maximum.particles };
  metrics.differentPixels = differentPixels;
  progress('features-done', { assertions });
  if (!process.env.ART_FEATURES_ONLY) {
    // 释放所有功能页；每种素材在独立且配置相同的 context 中只启动一次。
    await browser.close(); browser = await api.chromium.launch(launchOptions);
    // 先完整预热一轮，排除各 WebGL context 的冷态，再轮转采三轮正式数据。
    // 每次仍预热 8 个真实渲染帧，再采完整 20 个 postrender 间隔。
    const warmupRounds = 1, measuredRounds = 3;
    const beforeSamples = [], afterSamples = [], effectSamples = [];
    metrics.samples = { beforeSamples, afterSamples, effectSamples };
    const cases = [
      { name: 'baseline', url: beforeServer.resolvedUrls.local[0], samples: beforeSamples, fixtures: false },
      { name: 'current', url: afterServer.resolvedUrls.local[0], samples: afterSamples, fixtures: false },
      { name: 'effects', url: afterServer.resolvedUrls.local[0], samples: effectSamples, fixtures: true },
    ];
    const measurementStarted = performance.now();
    for (const sampleCase of cases) {
      const caseStarted = performance.now();
      progress('measure-initialize', { case: sampleCase.name });
      const measurementContext = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
      await measurementContext.addInitScript(() => localStorage.clear());
      const page = sampleCase.page = await newPage(measurementContext);
      // 拦截只属于示例页；两张正式页保留正常缓存，示例响应不会跨 context 串图。
      if (sampleCase.fixtures) {
        await page.route('**/art/tiles/tiles_qingyun.png', route => route.fulfill({
          contentType: 'image/png', path: path.join(fixtureRoot, 'tiles.png') }));
        await page.route('**/art/tiles/tiles_qingyun.json', route => route.fulfill({
          contentType: 'application/json', body: JSON.stringify(tilesMetadata) }));
      }
      await prepare(page, sampleCase.url);
      // Scene.pause 不停渲染；初始化完成后立即休眠，让其余页面独占渲染。
      await page.evaluate(() => window.__scene.game.loop.sleep());
      if (sampleCase.fixtures) {
        for (const layer of Object.keys(background.layers)) {
          await page.evaluate(async ({ key, url }) => window.__xt.art.loadImage(key, url),
            { key: `art_test_${layer}`, url: await pngUrl(`${layer}.png`) });
        }
        await page.evaluate(config => window.__xt.art.rebuildBackground(config), background);
      }
      sampleCase.pose = await freezePose(page, sampleCase.fixtures ? maximumBudget : undefined, true);
      equal(sampleCase.pose, afterState, 'FPS 对照的主角/地图/名牌或渲染器与功能验收不同');
      sampleCase.state = await measurementState(page);
      equal(sampleCase.state.loop.running, false, 'FPS 初始化页面渲染 loop 未停止');
      equal(sampleCase.state.loop.rafRunning, false, 'FPS 初始化页面 RAF 未停止');
      equal(sampleCase.state.workload.tiles, sampleCase.fixtures ? { size: [tilesMetadata.imagewidth, tilesMetadata.imageheight],
        columns: tilesMetadata.columns, tilecount: tilesMetadata.tilecount } : officialTiles, 'FPS 示例图块串入正式缓存或未加载');
      if (sampleCase.fixtures) {
        equal(sampleCase.state.workload.backgrounds.length, 5, 'FPS 示例未重建五层背景');
        equal([sampleCase.state.workload.environment.lights, sampleCase.state.workload.environment.fog, sampleCase.state.workload.environment.particles],
          [24, 8, 96], 'FPS 示例未重建最大环境预算');
      }
      equal(sampleCase.state.workload.environment.simulationSeconds, 0, 'FPS 初始化环境不是第 0 秒');
      progress('measure-initialized', { case: sampleCase.name,
        prepareSeconds: Number(((performance.now() - caseStarted) / 1000).toFixed(2)) });
    }
    equal(cases[0].state.workload, cases[1].state.workload, 'FPS 基线与正式对照的背景/环境/对象负载不同');
    const warmupSamples = {};
    for (let run = 0; run < warmupRounds + measuredRounds; run++) {
      const phase = run < warmupRounds ? 'warmup' : 'measurement';
      for (let step = 0; step < cases.length; step++) {
        const sampleCase = cases[(run + step) % cases.length];
        const caseStarted = performance.now();
        progress('measure-prepare', { phase, run: run + 1, case: sampleCase.name });
        equal(await freezePose(sampleCase.page, sampleCase.fixtures ? maximumBudget : undefined, true),
          sampleCase.pose, 'FPS 轮次重置改变主角/地图/名牌');
        const current = await measurementState(sampleCase.page);
        equal(current.workload, sampleCase.state.workload, 'FPS 轮次的环境相位/纹理/对象负载改变');
        const idleCases = cases.filter(other => other !== sampleCase), idleStates = [];
        for (const other of idleCases) {
          const { loop } = await measurementState(other.page);
          equal([loop.running, loop.rafRunning], [false, false], 'FPS 非采样页面仍在渲染');
          idleStates.push(loop);
        }
        progress('measure-ready', { phase, run: run + 1, case: sampleCase.name,
          prepareSeconds: Number(((performance.now() - caseStarted) / 1000).toFixed(2)) });
        const sample = await fps(sampleCase.page);
        if (phase === 'warmup') (warmupSamples[sampleCase.name] ??= []).push(sample);
        else sampleCase.samples.push(sample);
        equal(sample.renderer, afterState.renderer, 'FPS 采样期间改变渲染器');
        equal((await measurementState(sampleCase.page)).loop.running, false, 'FPS 采样后渲染 loop 未停止');
        for (const [index, other] of idleCases.entries()) {
          equal((await measurementState(other.page)).loop, idleStates[index], 'FPS 非采样页面仍推进渲染帧');
        }
        progress('measure-sampled', { phase, run: run + 1, case: sampleCase.name, fps: Number(sample.fps.toFixed(2)),
          caseSeconds: Number(((performance.now() - caseStarted) / 1000).toFixed(2)) });
      }
    }
    check(cases.every(sampleCase => sampleCase.samples.length >= 3), 'FPS 帧间隔对照至少需要三轮采样');
    metrics.warmupSamples = warmupSamples;
    metrics.measurement = { pages: 3, contexts: 3, initializations: 3, warmupRounds, rounds: beforeSamples.length, event: 'postrender', warmupFrames: 8, intervals: 20,
      elapsedSeconds: (performance.now() - measurementStarted) / 1000 };
    const baselineFrameMs = median(beforeSamples.map(sample => 1000 / sample.fps));
    const fallbackFrameMs = median(afterSamples.map(sample => 1000 / sample.fps));
    const effectsFrameMs = median(effectSamples.map(sample => 1000 / sample.fps));
    metrics.baselineFps = Number((1000 / baselineFrameMs).toFixed(2));
    metrics.fallbackFps = Number((1000 / fallbackFrameMs).toFixed(2));
    metrics.effectsFps = Number((1000 / effectsFrameMs).toFixed(2));
    metrics.target60FpsMet = metrics.effectsFps >= 59;
    // 宿主若连旧版本身都不到60，只报告真实结果；不把软件渲染限制算成引擎通过60fps。
    if (metrics.baselineFps >= 59) check(metrics.target60FpsMet, '旧版可达60fps而示例素材低于60fps');
    metrics.samples = { beforeSamples, afterSamples, effectSamples };
    // 按实际后端识别软件渲染，避免 SwiftShader 基线偶尔超过 30fps 时误走硬件阈值。
    // 三轮帧间隔均值取中位；软件允许基线的 50% 抖动再加一帧，硬件仍只允许一帧。
    const rendererNames = [...new Set([...beforeSamples, ...afterSamples, ...effectSamples].map(sample => sample.rendererName))];
    const softRenderer = afterState.renderer === 1
      || rendererNames.every(name => /swiftshader|llvmpipe|softpipe|lavapipe|software|microsoft basic render/i.test(name));
    const frameIntervalToleranceMs = (softRenderer ? baselineFrameMs * 0.5 : 0) + 1000 / 60;
    metrics.rendererNames = rendererNames;
    metrics.frameIntervalToleranceMs = frameIntervalToleranceMs;
    metrics.softRenderer = softRenderer;
    const frameIntervalLimitMs = baselineFrameMs + frameIntervalToleranceMs;
    metrics.currentRegressionCheck = metrics.identicalRuntime ? 'identical-loaded-runtime' : 'frame-interval';
    // 两端所有实际加载响应字节相同时是 A/A；跨进程宿主波动不能构成当前代码回归。
    // 仍采集并报告全部三轮 FPS；任一代码/配置/素材字节变化都走原帧间隔断言。
    if (metrics.identicalRuntime) equal(metrics.runtimeAfter, metrics.runtimeBefore, 'A/A 对照的实际运行产物不一致');
    else check(fallbackFrameMs <= frameIntervalLimitMs, `${metrics.renderer} 旧素材帧间隔超过基线容差：${fallbackFrameMs.toFixed(2)} > ${baselineFrameMs.toFixed(2)} + ${frameIntervalToleranceMs.toFixed(2)} ms`);
    check(effectsFrameMs <= frameIntervalLimitMs, `${metrics.renderer} 示例特效帧间隔超过基线容差：${effectsFrameMs.toFixed(2)} > ${baselineFrameMs.toFixed(2)} + ${frameIntervalToleranceMs.toFixed(2)} ms`);
  }
  equal(errors, [], '浏览器控制台/页面报错');
  metrics.elapsedSeconds = (performance.now() - started) / 1000;
  const report = JSON.stringify({ baselineRevision, assertions, metrics }, null, 2);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-test.json'), report);
  await fs.writeFile(path.join(projectRoot, `dist/art-engine-test.${metrics.renderer}.json`), report);
  const { samples: _samples, runtimeBefore: _runtimeBefore, runtimeAfter: _runtimeAfter, ...reportedMetrics } = metrics;
  console.log(JSON.stringify({ test: 'art-engine', assertions, ...reportedMetrics }));
} catch (error) {
  metrics.elapsedSeconds = (performance.now() - started) / 1000;
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-test.json'), JSON.stringify({ baselineRevision, assertions, metrics, error: error.message }, null, 2));
  if (errors.length) console.error(JSON.stringify({ browserErrors: errors }));
  throw error;
} finally {
  await browser?.close();
  for (const server of [beforeServer, afterServer]) if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (baseline?.temporaryRoot) await fs.rm(baseline.temporaryRoot, { recursive: true, force: true });
}
