// 先构建，再 node scripts/ui-cam-shot.mjs before|after；支持现有 smoke 的浏览器环境变量。
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { preview } from 'vite';

const label = process.argv[2] ?? 'after';
if (!['before', 'after'].includes(label)) throw new Error('参数须为 before 或 after');
const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const screenshot = `/workspace/reports/ui-cam_${label}_qingyun_spawn.png`;
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
  server = await preview({ root, preview: { host: '127.0.0.1', port: 4312, strictPort: true }, logLevel: 'error' });
  browser = await api.chromium.launch({ executablePath, headless: true,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(`${server.resolvedUrls.local[0]}?reset=1&map=qingyun_village`, { waitUntil: 'networkidle' });
  await page.waitForFunction(() => window.__scene?.map?.id === 'qingyun_village' && window.__scene?.player?.active);
  await page.waitForTimeout(3000);
  const state = await page.evaluate(() => {
    const scene = window.__scene, player = scene.player, cam = scene.cameras.main, bounds = player.getBounds();
    const screenBounds = { left: bounds.left - cam.scrollX, right: bounds.right - cam.scrollX,
      top: bounds.top - cam.scrollY, bottom: bounds.bottom - cam.scrollY };
    const hud = { left: 16, right: 416, top: 604, bottom: 692 };
    return { map: scene.map.id, scroll: { x: cam.scrollX, y: cam.scrollY },
      feetScreen: { x: player.x - cam.scrollX, y: player.y - cam.scrollY },
      bodyFeetScreenY: player.feet - cam.scrollY, displaySize: { width: player.displayWidth, height: player.displayHeight },
      screenBounds, hud, overlapsHud: screenBounds.left < hud.right && screenBounds.right > hud.left
        && screenBounds.top < hud.bottom && screenBounds.bottom > hud.top };
  });
  await fs.mkdir(path.dirname(screenshot), { recursive: true });
  await page.screenshot({ path: screenshot });
  if (errors.length) throw new Error(errors.join('\n'));
  console.log(JSON.stringify({ label, ...state, screenshot }, null, 2));
} finally {
  await browser?.close();
  if (server) await new Promise((resolve, reject) => server.httpServer.close(error => error ? reject(error) : resolve()));
}
