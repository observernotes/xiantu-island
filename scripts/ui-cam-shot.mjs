// 先构建，再 node scripts/ui-cam-shot.mjs [before|after]；支持现有 smoke 的浏览器环境变量。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const label = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(label)) throw new Error('参数须为 before 或 after');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
const screenshot = path.resolve(process.env.UI_CAM_SCREENSHOT
  ?? `/workspace/xiantu/reports/炼器阁界面接入/uicam_${timestamp}.png`);
if (path.relative(root, screenshot).split(path.sep)[0] === 'qa') throw new Error('截图须存放在 qa 以外');
const modules = process.env.PLAYWRIGHT_MODULE ? [process.env.PLAYWRIGHT_MODULE]
  : ['playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'];
let api, server, browser;
for (const name of modules) {
  try { api = await import(path.isAbsolute(name) ? pathToFileURL(name).href : name); break; }
  catch (error) { if (process.env.PLAYWRIGHT_MODULE) throw error; }
}
if (!api) throw new Error('未找到 Playwright');
const candidates = process.env.CHROMIUM_EXECUTABLE_PATH ? [process.env.CHROMIUM_EXECUTABLE_PATH]
  : [api.chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium', '/usr/bin/chromium-browser'];
let executablePath;
for (const candidate of candidates) {
  try { await fs.access(candidate); executablePath = candidate; break; } catch { /* 下一路径 */ }
}
if (!executablePath) throw new Error('未找到 Chromium');
try {
  server = await preview({ root, preview: { host: '127.0.0.1', port: Number(process.env.UI_CAM_PORT ?? 4312), strictPort: true }, logLevel: 'error' });
  browser = await api.chromium.launch({ executablePath, headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const consoleErrors = [], pageErrors = [];
  page.on('console', message => { if (message.type() === 'error') consoleErrors.push(message.text()); });
  page.on('pageerror', error => pageErrors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}?reset=1&map=qingyun_village`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__scene?.map?.id === 'qingyun_village' && window.__scene?.player?.active);
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const scene = window.__scene, player = scene.player, cam = scene.cameras.main, bounds = player.getBounds();
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    check(cam.zoom === 1 && cam.rotation === 0, '截图边界检查要求镜头 zoom=1、rotation=0');
    const screen = (rect, object) => ({ left: cam.x + rect.left - cam.scrollX * object.scrollFactorX,
      right: cam.x + rect.right - cam.scrollX * object.scrollFactorX,
      top: cam.y + rect.top - cam.scrollY * object.scrollFactorY,
      bottom: cam.y + rect.bottom - cam.scrollY * object.scrollFactorY });
    const overlaps = (a, b) => a.left < b.right && a.right > b.left && a.top < b.bottom && a.bottom > b.top;
    const screenBounds = screen(bounds, player);
    // Graphics 没有 getBounds；读取实际绘制命令，分别计算矩形/路径，覆盖缺图回退 HUD。
    const graphicsRects = object => {
      const commands = object.commandBuffer, rects = [];
      let points = [], fillAlpha = 1, lineAlpha = 1, lineWidth = 1;
      const transform = object.getWorldTransformMatrix();
      const rect = (vertices, padding = 0) => {
        if (!vertices.length) return;
        const world = vertices.map(([x, y]) => transform.transformPoint(x, y));
        rects.push({ left: Math.min(...world.map(p => p.x)) - padding,
          right: Math.max(...world.map(p => p.x)) + padding,
          top: Math.min(...world.map(p => p.y)) - padding,
          bottom: Math.max(...world.map(p => p.y)) + padding });
      };
      for (let i = 0; i < commands.length;) {
        const command = commands[i++];
        switch (command) {
          case 0: { // ARC：完整圆的包围盒也是圆角路径的保守边界。
            const [x, y, r] = commands.slice(i, i + 3); i += 7;
            points.push([x - r, y - r], [x + r, y + r]); break;
          }
          case 1: points = []; break; // BEGIN_PATH
          case 2: break; // CLOSE_PATH
          case 3: { // FILL_RECT
            const [x, y, w, h] = commands.slice(i, i + 4); i += 4;
            if (fillAlpha > 0) rect([[x, y], [x + w, y], [x, y + h], [x + w, y + h]]);
            break;
          }
          case 4: case 5: points.push(commands.slice(i, i + 2)); i += 2; break;
          case 6: lineWidth = commands[i]; lineAlpha = commands[i + 2]; i += 3; break;
          case 7: fillAlpha = commands[i + 1]; i += 2; break;
          case 8: if (fillAlpha > 0) rect(points); break;
          case 9: if (lineAlpha > 0) rect(points, lineWidth / 2); break;
          case 10: case 11: {
            const vertices = [commands.slice(i, i + 2), commands.slice(i + 2, i + 4), commands.slice(i + 4, i + 6)]; i += 6;
            if ((command === 10 ? fillAlpha : lineAlpha) > 0) rect(vertices, command === 11 ? lineWidth / 2 : 0);
            break;
          }
          case 21: fillAlpha = Math.max(...commands.slice(i, i + 4)); i += 8; break;
          case 22: lineWidth = commands[i]; lineAlpha = commands[i + 1]; i += 6; break;
          default: throw new Error(`未支持的 HUD Graphics 命令 ${command}，请补全边界检查`);
        }
      }
      return rects;
    };
    const rectangles = object => object.type === 'Graphics' ? graphicsRects(object)
      : typeof object.getBounds === 'function' ? [object.getBounds()] : [];
    const hud = scene.children.list.filter(object => object.visible && object.alpha > 0 && object.depth >= 100
      && object.scrollFactorX === 0 && object.scrollFactorY === 0 && object.type !== 'Zone'
      && (object.type !== 'Text' || object.text.length > 0)).flatMap(object => rectangles(object).map(rect => ({
        type: object.type, name: object.name, texture: object.texture?.key, depth: object.depth, ...screen(rect, object),
      }))).filter(rect => rect.right > rect.left && rect.bottom > rect.top);
    check(hud.length > 0, '未读到实际可见 HUD，不能确认遮挡');
    const overlapsHud = hud.filter(rect => overlaps(screenBounds, rect));
    const floorObjects = scene.children.list.filter(object => object.x === 0 && object.y === scene.map.height
      && (object.type === 'Graphics' || (object.type === 'TileSprite' && object.originY === 0)));
    check(floorObjects.length === 1, `应有且仅有一条底条，实际 ${floorObjects.length}`);
    const strip = floorObjects[0], floorBounds = rectangles(strip)[0], reserve = cam._bounds.height - scene.map.height;
    check(strip.depth === -1, '底条深度不是 -1');
    check(strip.scrollFactorX === 1 && strip.scrollFactorY === 1, '底条意外使用视差/屏幕坐标');
    check(reserve === 116, '镜头未保留 116px HUD 空间');
    check(floorBounds.left === 0 && floorBounds.top === scene.map.height
      && floorBounds.right === scene.map.width && floorBounds.bottom === scene.map.height + reserve, '底条世界坐标或尺寸错位');
    check(!strip.body, '底条存在物理 body');
    const referencesStrip = object => object === strip || (Array.isArray(object) && object.some(referencesStrip))
      || (typeof object?.contains === 'function' && object.contains(strip));
    const colliders = scene.physics.world.colliders.getActive();
    check(!colliders.some(collider => referencesStrip(collider.object1) || referencesStrip(collider.object2)), '底条参与碰撞/overlap');
    if (strip.type === 'TileSprite') check(strip.tilePositionX === 0 && strip.tilePositionY === 0, '底条贴图意外参与视差偏移');
    const floorScreen = screen(floorBounds, strip);
    const depths = { sky: -10, far: -9, mid: -8, near: -7, fg: 20 };
    const backgrounds = (scene.backgroundArt?.layers ?? []).map(layer => {
      check(layer.image.depth === depths[layer.name], `E-2 ${layer.name} 深度错误`);
      const rect = screen(layer.image.getBounds(), layer.image);
      check(layer.image.depth < strip.depth || !overlaps(rect, floorScreen), `E-2 ${layer.name} 遮挡底条`);
      return { name: layer.name, depth: layer.image.depth, factorX: layer.factorX, factorY: layer.factorY, screenBounds: rect };
    });
    // 后续 E-2 合成配置检查复用刚确认过的底条，而不触碰源码或 __xt。
    window.__uiCamStrip = strip;
    return { map: scene.map.id, scroll: { x: cam.scrollX, y: cam.scrollY },
      feetScreen: { x: player.x - cam.scrollX, y: player.y - cam.scrollY },
      bodyFeetScreenY: player.feet - cam.scrollY, displaySize: { width: player.displayWidth, height: player.displayHeight },
      screenBounds, hud, overlapsHud, floor: { type: strip.type, depth: strip.depth, worldBounds: floorBounds,
        screenBounds: floorScreen, texture: strip.displayTexture?.key, frame: strip.displayFrame?.name, hasBody: !!strip.body }, backgrounds };
  });
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  assert.deepEqual(state.overlapsHud, [], '实际 HUD 遮挡出生点主角');
  assert.ok(state.screenBounds.left >= 0 && state.screenBounds.right <= 1280
    && state.screenBounds.top >= 0 && state.screenBounds.bottom <= 720, '出生点主角超出可见画面');
  const e2FiveLayers = await page.evaluate(() => {
    const scene = window.__scene, cam = scene.cameras.main, strip = window.__uiCamStrip;
    const check = (condition, message) => { if (!condition) throw new Error(message); };
    const area = 'ui_cam_check', cacheKey = `bg_${area}_config`, keys = [], positions = [];
    const names = ['sky', 'far', 'mid', 'near', 'fg'], depths = [-10, -9, -8, -7, 20], factors = [0, 0.2, 0.5, 0.85, 1.15];
    const config = { layers: Object.fromEntries(names.map((name, index) => {
      const key = `ui_cam_check_${name}`, canvas = document.createElement('canvas');
      canvas.width = 32; canvas.height = 64;
      const context = canvas.getContext('2d'); context.fillStyle = ['#abcdef', '#567890', '#678901', '#789012', '#890123'][index];
      context.fillRect(0, 0, 32, 64); scene.textures.addCanvas(key, canvas); keys.push(key);
      return [name, { texture: key, scrollFactor: [factors[index], index < 3 ? 0 : 1], tile: index % 2 === 1 || name === 'fg', yOffset: name === 'fg' ? -16 : 0 }];
    })) };
    const originalScroll = { x: cam.scrollX, y: cam.scrollY }, follow = cam._follow;
    // mapId -> area 在清单中未导出给页面，青云村明确使用 qingyun。
    check(scene.map.id === 'qingyun_village', '五层检查只适用于本脚本指定的青云村');
    scene.cache.json.add(cacheKey, config);
    try {
      cam.stopFollow(); scene.drawBackground(area, scene.map.width, scene.map.height);
      check(scene.backgroundArt?.layers.length === 5, 'E-2 合成五层未全部创建');
      for (const x of [0, (scene.map.width - cam.width) / 2, scene.map.width - cam.width]) {
        cam.setScroll(Math.max(0, x), Math.max(0, scene.map.height + 116 - cam.height)); cam.preRender(); scene.backgroundArt.update();
        check(strip.active && strip.depth === -1 && strip.x === 0 && strip.y === scene.map.height
          && strip.scrollFactorX === 1 && strip.scrollFactorY === 1 && !strip.body, 'E-2 重建或视差更新改变底条');
        const floorTop = strip.y - cam.scrollY;
        const layers = scene.backgroundArt.layers.map((layer, index) => {
          const image = layer.image;
          check(image.depth === depths[index], `E-2 ${layer.name} depth 错误`);
          if (layer.tiled) check(Math.abs(image.tilePositionX - cam.scrollX * factors[index]) < 0.01, `E-2 ${layer.name} 视差未更新`);
          const bottom = image.getBounds().bottom - cam.scrollY * image.scrollFactorY;
          if (image.depth > strip.depth) check(bottom <= floorTop, 'E-2 fg=20 意外侵入底条');
          return { name: layer.name, depth: image.depth, screenBottom: bottom };
        });
        positions.push({ scroll: { x: cam.scrollX, y: cam.scrollY }, floorTop, layers });
      }
      return { passed: true, positions };
    } finally {
      scene.cache.json.remove(cacheKey); scene.drawBackground('qingyun', scene.map.width, scene.map.height);
      for (const key of keys) scene.textures.remove(key);
      cam.setScroll(originalScroll.x, originalScroll.y);
      if (follow) cam.startFollow(follow, cam.roundPixels, cam.lerp.x, cam.lerp.y, cam.followOffset.x, cam.followOffset.y);
      delete window.__uiCamStrip;
    }
  });
  assert.deepEqual(consoleErrors, [], '浏览器 console.error 必须为 0');
  assert.deepEqual(pageErrors, [], '浏览器 pageerror 必须为 0');
  console.log(JSON.stringify({ label, passed: true, ...state, e2FiveLayers,
    consoleErrors: consoleErrors.length, pageErrors: pageErrors.length, screenshot }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
