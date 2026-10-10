// npm run build:test；测试资源仅在 scripts/fixtures 中，通过 __xt 加载，不写 art/。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { inflateSync } from 'node:zlib';
import { build, preview } from 'vite';
import { findRoot } from './root.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const fixtureRoot = path.join(projectRoot, 'scripts/fixtures/art-engine');
const baselineRevision = 'a0f37b9e4f1af41329883f168dd37b58ff5fede7';
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

// 原提交只解包到临时目录；地图和旧素材与被测构建共用输入，隔离引擎变化。
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
  const directory = path.join(temporaryRoot, 'dist');
  await build({ root: temporaryRoot, configFile: false, logLevel: 'error', base: './',
    resolve: { alias: { '@xt': findRoot(projectRoot) } },
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

async function prepare(page, baseURL, map = 'qingyun_village') {
  await page.bringToFront();
  await page.addInitScript(({ fixedTime }) => {
    Date.now = () => fixedTime;
    let state = 123;
    Math.random = () => { state = (Math.imul(state, 1664525) + 1013904223) >>> 0; return state / 4294967296; };
  }, { fixedTime });
  const url = new URL(baseURL); url.searchParams.set('map', map);
  await page.goto(url.href, { waitUntil: 'networkidle', timeout: 30000 });
  await page.waitForFunction(() => window.__xt && window.__scene?.player?.active && window.__scene?.quests);
  await page.evaluate(async ({ map, fixedTime }) => {
    window.__xt.seed(123); window.__xt.clock.pause(); window.__xt.clock.setNow(fixedTime);
    await window.__xt.teleport(map, 320, 608);
  }, { map, fixedTime });
  await page.waitForTimeout(300);
  return page.evaluate(() => {
    const s = window.__scene, p = s.player;
    s.physics.world.pause(); s.tweens.killAll(); s.time.removeAllEvents();
    s.cameras.main.resetFX(); s.cameras.main.stopFollow(); s.cameras.main.setScroll(0, 0);
    p.body.reset(320, 608); p.body.setVelocity(0, 0); p.state2 = 'ground'; p.body.blocked.down = true;
    p.play('player_sword_m_idle'); p.anims.setCurrentFrame(s.anims.get('player_sword_m_idle').frames[0]); p.anims.pause();
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
      frameSize: [p.frame.realWidth, p.frame.realHeight], frame: p.frame.name, labels,
      collision: [s.map.solids, s.map.oneWays].map(group => group.getChildren().map(object => ({ x: object.body.x, y: object.body.y, width: object.body.width, height: object.body.height }))), map: { width: s.map.width, height: s.map.height } };
  });
}
async function screenshot(page) { await page.bringToFront(); await page.waitForTimeout(100); return page.screenshot(); }
async function fps(page) {
  for (const candidate of page.context().pages()) await candidate.evaluate(() => window.__scene?.game.loop.sleep());
  await page.bringToFront();
  await page.evaluate(() => window.__scene.game.loop.wake());
  await page.waitForTimeout(150);
  const result = await page.evaluate(() => new Promise(resolve => {
    const stamps = [];
    function tick(timestamp) {
      stamps.push(timestamp);
      if (stamps.length === 31) {
        const deltas = stamps.slice(1).map((time, i) => time - stamps[i]).sort((a, b) => a - b);
        resolve({ fps: 30000 / (stamps.at(-1) - stamps[0]), medianMs: deltas[15] });
      } else requestAnimationFrame(tick);
    }
    requestAnimationFrame(tick);
  }));
  await page.evaluate(() => window.__scene.game.loop.sleep());
  return result;
}
function playerAnchors(snapshot) {
  return { body: snapshot.player.body, x: snapshot.player.x, y: snapshot.player.y,
    feet: snapshot.player.feet, origin: snapshot.player.origin, displayHeight: snapshot.player.displayHeight, labels: [...snapshot.labels].sort((a, b) => a.depth - b.depth || a.x - b.x || a.y - b.y || a.text.localeCompare(b.text)) };
}

let baseline, beforeServer, afterServer, browser;
const errors = [], metrics = {};
try {
  await fs.access(path.join(projectRoot, 'dist/index.html'));
  baseline = await buildBaseline();
  beforeServer = await preview({ root: projectRoot, build: { outDir: baseline.directory },
    preview: { host: '127.0.0.1', port, strictPort: true }, logLevel: 'error' });
  afterServer = await preview({ root: projectRoot, preview: { host: '127.0.0.1', port: port + 1, strictPort: true }, logLevel: 'error' });
  const api = await loadPlaywright();
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true,
    args: [...(process.env.ART_RENDERER === 'canvas' ? ['--disable-webgl', '--disable-gpu'] : ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']),
      '--disable-background-timer-throttling', '--disable-backgrounding-occluded-windows'] });
  const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  async function newPage() {
    const page = await context.newPage(); page.setDefaultTimeout(15000);
    page.on('pageerror', error => errors.push(error.message));
    page.on('console', message => { if (message.type() === 'error') errors.push(message.text()); });
    return page;
  }
  const beforePage = await newPage(), afterPage = await newPage();
  const beforeState = await prepare(beforePage, beforeServer.resolvedUrls.local[0]);
  const beforeImage = await screenshot(beforePage);
  const afterState = await prepare(afterPage, afterServer.resolvedUrls.local[0]);
  const afterImage = await screenshot(afterPage);
  equal(afterState, beforeState, '旧素材 world body / 脚底 / 所有名牌及 HUD 原位回退');
  const differentPixels = pixelDifference(beforeImage, afterImage);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-before.png'), beforeImage);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-after.png'), afterImage);
  equal(differentPixels, 0, `没有新配置时截图不同：${differentPixels} 像素`);
  check(await afterPage.evaluate(() => !!window.__xt.art), '测试桥缺少 __xt.art');

  const fixturesPage = await newPage();
  const tilesMetadata = await json('tiles.json');
  await fixturesPage.route('**/art/tiles/tiles_qingyun.png', route => route.fulfill({ contentType: 'image/png', path: path.join(fixtureRoot, 'tiles.png') }));
  await fixturesPage.route('**/art/tiles/tiles_qingyun.json', route => route.fulfill({ contentType: 'application/json', body: JSON.stringify(tilesMetadata) }));
  await prepare(fixturesPage, afterServer.resolvedUrls.local[0]);
  const oneX = await fixturesPage.evaluate(() => window.__xt.art.snapshot());
  const oneXImage = await screenshot(fixturesPage);
  const anims = await json('player-2x.anims.json'), atlas = await json('player-2x.atlas.json'), image = await pngUrl('player-2x.png');
  await fixturesPage.evaluate(async ({ image, atlas, anims }) => {
    await window.__xt.art.loadAtlas(anims.atlas, image, atlas, anims);
    window.__xt.art.applyAtlas(anims.atlas); window.__scene.player.body.updateFromGameObject();
  }, { image, atlas, anims });
  const twoX = await fixturesPage.evaluate(() => window.__xt.art.snapshot());
  equal(twoX.player.frameSize, [192, 192], '2x 画布未逐 key 读取');
  equal(twoX.player.displayScale, 0.5, 'displayScale 未读取');
  equal(playerAnchors(twoX), playerAnchors(oneX), '2x 主角 body / 脚底 / 名牌锚点变化');
  equal(await fixturesPage.evaluate(() => [window.__scene.player.body.sourceWidth, window.__scene.player.body.sourceHeight]), [52, 116], 'bodySize 不是源像素2x');
  equal(await fixturesPage.evaluate(() => window.__scene.player.texture.source[0].scaleMode), 1, 'pixelArt 开关未使用 nearest');
  const duplicatePixels = pixelDifference(oneXImage, await screenshot(fixturesPage));
  metrics.duplicate2xPixelDifference = duplicatePixels;
  // Canvas roundPixels 的drawImage额外0.5源像素随displayScale变化；补充的整图等同只适用于WebGL。
  if (await fixturesPage.evaluate(() => window.__scene.game.renderer.type !== 1)) equal(duplicatePixels, 0, 'nearest 2x 测试夹具缩至0.5后像素不一致');
  await fixturesPage.evaluate(({ key }) => window.__xt.art.applyAtlas(key, { pixelArt: false }), { key: anims.atlas });
  equal(await fixturesPage.evaluate(() => window.__scene.player.texture.source[0].scaleMode), 0, '线性过滤开关未生效');
  const originalRates = await fixturesPage.evaluate(({ key }) => {
    const s = window.__scene;
    return ['idle', 'walk', 'jump', 'djump', 'rope', 'ladder', 'attack', 'hit', 'die', 'sit', 'gather'].map(action => {
      const old = s.anims.get(`player_sword_m_${action}`), newer = s.anims.get(`${key}_${action}`);
      return [old.frames.length, old.frameRate, newer.frames.length, newer.frameRate];
    });
  }, { key: anims.atlas });
  check(originalRates.every(([oldCount, oldRate, newCount, newRate]) => oldCount === newCount && oldRate === newRate), '2x 帧数/帧率改变');
  const moving = await fixturesPage.evaluate(() => {
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
  equal(moving.key, anims.atlas, '移动中未通过真正换装切到 2x');
  equal(moving.after, moving.before, '2x 换装回卷当前帧走/跳位移或速度');
  equal(moving.reverted, moving.before, '回到 1x 回卷当前帧走/跳位移或速度');
  await fixturesPage.evaluate(() => window.__xt.art.applyAtlas('player_sword_m'));
  const reverted = await fixturesPage.evaluate(() => window.__xt.art.snapshot());
  equal(reverted.player.displayScale, 1, '96x96 默认 displayScale 不是 1');
  equal(playerAnchors(reverted), playerAnchors(oneX), '1x/2x 混用回切改变锚点');

  // 在测试 TextureManager 内替换六套同帧变体，走真正 syncPlayerAppearance。
  for (const appearance of ['fox_robe', ...['tianjian', 'taixu', 'lingfu', 'youying', 'wanshou'].map(area => `outfit_${area}_1`)]) {
    const key = `player_sword_m__${appearance}`;
    const variantAtlas = { ...atlas, frames: Object.fromEntries(Object.entries(atlas.frames).map(([name, frame]) => [name.replace('player_sword_m_', `${key}_`), frame])) };
    const variantAnims = { ...anims, atlas: key, anims: anims.anims.map(animation => ({ ...animation,
      key: animation.key.replace(anims.atlas, key), frames: animation.frames.map(frame => frame.replace('player_sword_m_', `${key}_`)) })) };
    const result = await fixturesPage.evaluate(async ({ key, appearance, image, atlas, anims }) => {
      const s = window.__scene; window.__xt.art.applyAtlas('player_sword_m');
      if (s.textures.exists(key)) s.textures.remove(key);
      await window.__xt.art.loadAtlas(key, image, atlas, anims);
      s.player.getAppearance = () => appearance; s.player.syncAppearance(); s.player.body.updateFromGameObject();
      return window.__xt.art.snapshot();
    }, { key, appearance, image, atlas: variantAtlas, anims: variantAnims });
    equal(result.player.key, key, `${appearance} 未走同帧换装`);
    equal(result.player.displayScale, 0.5, `${appearance} 未继承逐 key displayScale`);
    equal(playerAnchors(result), playerAnchors(oneX), `${appearance} body/名牌变化`);
  }
  await fixturesPage.evaluate(() => { window.__scene.player.getAppearance = () => undefined; window.__xt.art.applyAtlas('player_sword_m'); });

  // 所有图块都来自实际 MapBuilder / Tilemap；爬行块读真实显示对象。
  const tiles = await fixturesPage.evaluate(() => {
    const s = window.__scene;
    return { terrain: s.children.list.filter(child => child.type === 'TilemapLayer').flatMap(layer => layer.layer.data.flatMap(row => row
      .filter(tile => tile.index >= 0).map(tile => ({ x: tile.x, y: tile.y, frame: tile.index })))),
      climbables: s.children.list.filter(child => (child.displayTexture?.key ?? child.texture?.key) === 'tiles_qingyun_ss')
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
  check(foreground.depth > oneX.player.depth || foreground.depth > 10, '前景没有覆盖角色');
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

  metrics.renderer = await afterPage.evaluate(() => window.__scene.game.renderer.type === 1 ? 'canvas' : 'webgl');
  metrics.environment144HzP95Ms = simulation.p95ms;
  metrics.maximumBudget = { lights: maximum.lights, fog: maximum.fog, particles: maximum.particles };
  metrics.differentPixels = differentPixels;
  if (!process.env.ART_FEATURES_ONLY) {
    for (const page of [beforePage, afterPage, fixturesPage]) await page.evaluate(() => window.__scene.scene.resume());
    // 交错测三轮；每轮用完整30个帧间隔的平均 FPS，轮间取中位。
    const beforeSamples = [], afterSamples = [], effectSamples = [];
    for (let run = 0; run < 3; run++) {
      beforeSamples.push(await fps(beforePage)); afterSamples.push(await fps(afterPage)); effectSamples.push(await fps(fixturesPage));
    }
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
    // Canvas（禁用 GPU）与 WebGL（SwiftShader）均为软件渲染；qa/out_tier1/d4cd341_triage2/triage.md
    // 的 A/A 均值波动达 16.11ms。三轮均值取中位后允许一个 60Hz 帧间隔，仍检查更大的持续退化。
    const frameIntervalToleranceMs = 1000 / 60;
    metrics.frameIntervalToleranceMs = frameIntervalToleranceMs;
    const frameIntervalLimitMs = baselineFrameMs + frameIntervalToleranceMs;
    check(fallbackFrameMs <= frameIntervalLimitMs, `${metrics.renderer} 旧素材帧间隔超过基线容差：${fallbackFrameMs.toFixed(2)} > ${baselineFrameMs.toFixed(2)} + ${frameIntervalToleranceMs.toFixed(2)} ms`);
    check(effectsFrameMs <= frameIntervalLimitMs, `${metrics.renderer} 示例特效帧间隔超过基线容差：${effectsFrameMs.toFixed(2)} > ${baselineFrameMs.toFixed(2)} + ${frameIntervalToleranceMs.toFixed(2)} ms`);
  }
  equal(errors, [], '浏览器控制台/页面报错');
  const report = JSON.stringify({ baselineRevision, assertions, metrics }, null, 2);
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-test.json'), report);
  await fs.writeFile(path.join(projectRoot, `dist/art-engine-test.${metrics.renderer}.json`), report);
  const { samples: _samples, ...reportedMetrics } = metrics;
  console.log(JSON.stringify({ test: 'art-engine', assertions, ...reportedMetrics }));
} catch (error) {
  await fs.writeFile(path.join(projectRoot, 'dist/art-engine-test.json'), JSON.stringify({ baselineRevision, assertions, metrics, error: error.message }, null, 2));
  if (errors.length) console.error(JSON.stringify({ browserErrors: errors }));
  throw error;
} finally {
  await browser?.close();
  for (const server of [beforeServer, afterServer]) if (server) await new Promise(resolve => server.httpServer.close(resolve));
  if (baseline?.temporaryRoot) await fs.rm(baseline.temporaryRoot, { recursive: true, force: true });
}
