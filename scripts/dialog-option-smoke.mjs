// UI-2：独立快照工程构建/preview；只移动临时 dist 的 PNG，不改工作树或共享素材。
// XT_DIALOG_UI_SHOTS 可覆盖截图目录；PLAYWRIGHT_MODULE / CHROMIUM_EXECUTABLE_PATH 可指定浏览器。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { inspectSharedPreview, installMissingManifest } from './shared-smoke-preview.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotDir = process.env.XT_DIALOG_UI_SHOTS ?? '/workspace/reports/ui2';
const keys = ['ui_hud_dialog_option_selected', 'ui_hud_dialog_option_normal', 'ui_hud_dialog_option_disabled', 'ui_hud_cursor'];
const imagePath = key => `art/icons/ui/hud/${key}.png`;
const specs = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/art/icons/ui/hud/hud_ui.json'), 'utf8'));
const ranks = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/sect_ranks.json'), 'utf8'));
const rankKey = ranks.ranks.find(rank => rank.icon)?.icon;
const fixture = [
  { label: '查看宗门服务', rankIcon: rankKey },
  { label: '继续修炼' },
  { label: '暂不可晋升', disabled: true, reason: '境界或贡献尚未满足条件；禁用选项不响应点击和数字键。', rankIcon: rankKey },
  { label: '离开' },
];
const save = { name: '对话冒烟修士', level: 2, exp: 0, hp: 0, mp: 0, stones: 1000,
  questRewardVersion: 1, inventory: {}, ageUpdatedAt: Date.now() };
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (actual, message) => { assert.ok(actual, message); assertions++; };
const checks = [], browserChecks = {}, missingFileChecks = {}, screenshots = [];
const startedAt = Date.now();
const progress = phase => console.log(JSON.stringify({ suite: 'dialog-ui', phase, elapsedMs: Date.now() - startedAt }));

async function playwright() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'].filter(Boolean)) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  for (const candidate of [process.env.CHROMIUM_EXECUTABLE_PATH, chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean)) {
    try { await fs.access(candidate); return candidate; } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Chromium');
}
async function buildIsolated(root) {
  const require = createRequire(import.meta.url);
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  for (const args of [['scripts/sync.mjs'], [vite, 'build', '--outDir', 'dist', '--emptyOutDir', '--logLevel', 'error']]) {
    await new Promise((resolve, reject) => {
      const child = spawn(process.execPath, args, { cwd: root, env: childBuildEnv({ VITE_XT_TEST: '1' }), stdio: ['ignore', 'pipe', 'pipe'] });
      let output = '';
      const append = chunk => { output = (output + chunk.toString()).slice(-12000); };
      child.stdout.on('data', append); child.stderr.on('data', append);
      child.once('error', reject);
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`隔离构建失败 (${signal ?? code})\n${output}`)));
    });
  }
}

let isolated, browser, server;
try {
  progress('isolated-build');
  isolated = await createIsolatedBuild(projectRoot, 'dialog-ui');
  await buildIsolated(isolated.root);
  await fs.mkdir(shotDir, { recursive: true });
  server = await preview({ root: isolated.root, preview: { port: Number(process.env.SMOKE_PORT ?? 0) } });
  const baseURL = server.resolvedUrls.local[0];
  const { manifest, testBridgePresent } = await inspectSharedPreview(baseURL);
  ok(testBridgePresent, '隔离构建缺测试桥');
  for (const key of keys) {
    ok(manifest.uiImages.some(image => image.key === key && image.path === imagePath(key)), `sync 未登记 ${key}`);
    await fs.access(path.join(isolated.root, 'public', imagePath(key)));
  }
  const api = await playwright();
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  async function session(label, { missing = [], missingFile = '' } = {}) {
    progress(label);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    const filtered = missing.length ? await installMissingManifest(context, manifest, missing) : undefined;
    await context.addInitScript(save => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('xiantu_save_v1', JSON.stringify(save));
    }, save);
    const page = await context.newPage();
    const errors = { console: [], page: [], request: [], http: [] }, responses = [], requests = [];
    page.on('console', event => { if (event.type() === 'error') errors.console.push(event.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('request', request => requests.push(new URL(request.url()).pathname.slice(1)));
    page.on('requestfailed', request => errors.request.push(request.url()));
    page.on('response', response => {
      if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`);
      if (missingFile && new URL(response.url()).pathname === `/${missingFile}`)
        responses.push({ status: response.status(), type: response.headers()['content-type'] ?? '' });
    });
    await page.goto(new URL('?map=qingyun_village', baseURL).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__scene?.player?.active && window.__xt?.openDialogChoices,
      null, { timeout: 40000 });
    await page.waitForTimeout(200);
    const done = async () => {
      try {
        // 不屏蔽或过滤浏览器原始错误；与 G17/G18 一样要求全零。
        eq(errors, { console: [], page: [], request: [], http: [] }, `${label}: 浏览器报错`);
        browserChecks[label] = { consoleErrors: errors.console.length, pageErrors: errors.page.length,
          requestFailures: errors.request.length, httpErrors: errors.http.length };
        if (filtered) {
          ok(filtered.rewriteCount > 0, `${label}: 清单模拟未生效`);
          for (const file of missing) eq(requests.includes(file), false, `${label}: 清单外资源仍请求 ${file}`);
        }
        if (missingFile) {
          ok(responses.length > 0, `${label}: 清单内实体缺图未发请求`);
          ok(responses.every(row => row.status === 200 && row.type.includes('text/html')), `${label}: 未覆盖 200 HTML 解码失败`);
          missingFileChecks[label] = { ...browserChecks[label], responses };
        }
      } finally { await context.close(); }
    };
    return { page, done };
  }
  async function withMissingFile(key, test) {
    const original = path.join(isolated.root, 'dist', imagePath(key)), moved = `${original}.smoke-missing`;
    await fs.rename(original, moved);
    try { await test(); } finally { await fs.rename(moved, original); }
    await fs.access(original);
  }
  async function shot(page, name, row) {
    const file = path.join(shotDir, `${name}.png`);
    await page.screenshot({ path: file, ...(row ? { clip: { x: row.world.x - 18, y: row.world.y - 2,
      width: row.width + 20, height: row.height + 4 } } : {}) });
    screenshots.push(file);
  }
  const snap = page => page.evaluate(() => {
    const s = window.__scene, d = s.dialog;
    return { open: d.open, body: d.body.text, choiceCount: d.choices.length,
      textures: Object.fromEntries(['ui_hud_dialog_option_selected', 'ui_hud_dialog_option_normal', 'ui_hud_dialog_option_disabled', 'ui_hud_cursor']
        .map(key => [key, s.textures.exists(key)])),
      rows: d.c.list.filter(obj => /^dialog-choice:\d+$/.test(obj.name)).map(btn => {
        const bg = btn.list.find(obj => obj.name.startsWith('dialog-choice-bg:') && obj.visible);
        const label = btn.list.find(obj => obj.name.startsWith('dialog-choice-label:'));
        const cursor = btn.list.find(obj => obj.name.startsWith('dialog-choice-cursor:'));
        const rank = btn.list.find(obj => obj.name.startsWith('dialog-choice-rank:'));
        const world = btn.getWorldTransformMatrix();
        return { name: btn.name, state: btn.getData('state'), artUsed: btn.getData('artUsed'), enabled: !!btn.input?.enabled,
          x: btn.x, y: btn.y, width: btn.width, height: btn.height, world: { x: world.tx, y: world.ty },
          bg: { type: bg.type, texture: bg.texture?.key, width: bg.width, height: bg.height,
            displayWidth: bg.displayWidth, displayHeight: bg.displayHeight,
            slice: [bg.leftWidth, bg.rightWidth, bg.topHeight, bg.bottomHeight], fillColor: bg.fillColor },
          label: { text: label.text, x: label.x, y: label.y, color: label.style.color, size: label.style.fontSize },
          cursor: cursor ? { visible: cursor.visible, artUsed: cursor.getData('artUsed'), texture: cursor.texture?.key,
            x: cursor.x, y: cursor.y, origin: [cursor.originX, cursor.originY] } : null,
          rank: rank ? { x: rank.x, alpha: rank.alpha, texture: rank.texture.key } : null };
      }) };
  });
  async function open(page, choices = fixture) {
    await page.mouse.move(10, 10);
    await page.evaluate(({ choices, rankKey }) => { window.__xt.setFlag('sectRanks', true); window.__xt.openDialogChoices(choices, rankKey); }, { choices, rankKey });
    await page.waitForTimeout(100);
    return snap(page);
  }
  async function press(page, key) {
    await page.waitForTimeout(100);
    await page.keyboard.down(key); await page.waitForTimeout(65); await page.keyboard.up(key); await page.waitForTimeout(100);
  }
  const center = row => ({ x: row.world.x + row.width / 2, y: row.world.y + row.height / 2 });
  async function hover(page, row) { const p = center(row); await page.mouse.move(p.x, p.y); await page.waitForTimeout(100); }
  async function click(page, row) { const p = center(row); await page.mouse.click(p.x, p.y); await page.waitForTimeout(100); }

  {
    const { page, done } = await session('three-state-art');
    let s = await open(page);
    ok(Object.values(s.textures).every(Boolean), '正常四件纹理不齐');
    eq(s.rows.map(row => row.state), ['selected', 'normal', 'disabled', 'normal'], '默认首个可用项未选中');
    for (const row of s.rows) {
      const spec = specs[`ui_hud_dialog_option_${row.state}`];
      eq(row.artUsed, 'art', '正常素材未使用 art');
      eq(row.bg.texture, `ui_hud_dialog_option_${row.state}`, '三态纹理映射不符');
      if (row.bg.type === 'NineSlice') {
        eq(row.bg.slice, ['left', 'right', 'top', 'bottom'].map(key => spec.nineSlice[key]), '切片未读 HUD 表');
      } else {
        eq(row.bg.type, 'Image', 'Canvas 背景未使用 Image');
      }
      // Image 的 width/height 是素材尺寸；Canvas 应校验拉伸后的显示尺寸。
      const backgroundSize = row.bg.type === 'Image'
        ? [row.bg.displayWidth, row.bg.displayHeight] : [row.bg.width, row.bg.height];
      eq([row.width, ...backgroundSize], [592, 592, row.height], '拉伸宽高不符');
      ok(row.height >= spec.size[1] && row.world.y + row.height < 404, '行高或对白框上方布局错误');
      eq(row.label.color, spec.text.color, '字色不符 HUD 表');
      eq(row.label.size, `${spec.text.size}px`, '字号不符 HUD 表');
      eq(row.label.x, spec.text.x + (row.rank ? 32 : 0), '文字缩进不符 HUD 表/rankIcon');
      if (row.cursor) {
        eq(row.cursor.artUsed, 'art', '光标未使用 art');
        eq([row.cursor.x, row.cursor.y], [-14, row.height / 2], '光标位置必须 btn.x−14、按钮中心');
        eq(row.cursor.origin, specs.ui_hud_cursor.origin, '光标原点未读 HUD 表');
        eq(row.cursor.visible, row.state === 'selected', '未选项显示光标');
      } else eq(row.state, 'disabled', '可用行缺光标');
    }
    ok(s.rows[0].rank && s.rows[2].rank?.alpha === 0.6, 'rankIcon 丢失或禁用透明度错误');
    eq(s.rows[2].enabled, false, '禁用项仍有点击区域');
    await shot(page, 'ui2_three_states');
    await shot(page, 'ui2_normal', s.rows[1]);
    await shot(page, 'ui2_selected', s.rows[0]);
    await shot(page, 'ui2_disabled', s.rows[2]);
    await hover(page, s.rows[1]); s = await snap(page);
    eq(s.rows.map(row => row.state), ['normal', 'selected', 'disabled', 'normal'], 'pointerover 未迁移选中态');
    await page.mouse.move(10, 10); await page.waitForTimeout(100);
    eq((await snap(page)).rows[1].state, 'selected', 'pointerout 未保持焦点');
    await click(page, s.rows[2]); await press(page, '3');
    eq((await snap(page)).choiceCount, 4, '禁用项被点击/数字键选中');
    await press(page, '1');
    s = await snap(page); eq([s.choiceCount, s.body], [0, fixture[0].label], '数字键未直接选指定项');
    s = await open(page); await click(page, s.rows[1]);
    eq((await snap(page)).body, fixture[1].label, '真实鼠标点击未触发回调');
    await open(page, [{ label: '不可用', disabled: true }, { label: '第一项可用' }, { label: '另一可用' }]);
    eq((await snap(page)).rows.map(row => row.state), ['disabled', 'selected', 'normal'], '默认焦点未跳过禁用项');
    await open(page, [{ label: '不可用', disabled: true }]);
    eq((await snap(page)).rows[0].cursor, null, '全禁用菜单仍有光标');
    await press(page, '1'); eq((await snap(page)).choiceCount, 1, '全禁用菜单数字键仍响应');
    await press(page, 'Escape'); eq((await snap(page)).open, false, 'Esc 未关闭选项菜单');
    checks.push('三态九切片/字色/缩进/行高/布局、cursor 坐标/原点、rankIcon、默认焦点/悬停、禁用、数字键/点击/Esc');

    // 真实长菜单分页：每页三条业务项，前后页占用余下数字键位置。
    const many = Array.from({ length: 8 }, (_, i) => ({ label: `目录 ${i + 1}` }));
    s = await open(page, many);
    eq(s.rows.map(row => row.label.text.split('. ')[1]), ['目录 1', '目录 2', '目录 3', '› 2/3'], '首页分页变更');
    await press(page, '4'); s = await snap(page);
    eq(s.rows.map(row => row.label.text.split('. ')[1]), ['目录 4', '目录 5', '目录 6', '‹ 1/3', '› 3/3'], '中页分页变更');
    eq(s.rows[0].state, 'selected', '翻页未重置首个可用焦点');
    await press(page, '5'); s = await snap(page);
    eq(s.rows.map(row => row.label.text.split('. ')[1]), ['目录 7', '目录 8', '‹ 2/3'], '末页分页变更');
    await press(page, '3'); await press(page, '4');
    eq((await snap(page)).rows[0].label.text, '1. 目录 1', '返回前页失效');
    await shot(page, 'ui2_paged');
    checks.push('8 项真实分页、数字键 4/5 翻页、回前页、分页焦点重置');

    // 修改浏览器内存的切片表，证明尺寸/字样来自 hudSpec，而非实现常量。
    await page.evaluate(() => {
      const h = window.__scene.cache.json.get('hud_ui');
      for (const state of ['normal', 'selected', 'disabled']) {
        h[`ui_hud_dialog_option_${state}`] = { ...h[`ui_hud_dialog_option_${state}`],
          nineSlice: undefined, slice: [7, 8, 5, 9], size: [64, 48], text: { size: 15, x: 19, color: '#654321' } };
      }
    });
    s = await open(page);
    for (const row of s.rows) {
      if (row.bg.type === 'NineSlice') eq(row.bg.slice, [7, 8, 5, 9], 'slice 数组未通过 hudSpec 转换');
      ok(row.height >= 48, '行高未遵循素材高度');
      eq([row.label.x, row.label.size, row.label.color], [19 + (row.rank ? 32 : 0), '15px', '#654321'], '文本未读 HUD 表');
    }
    await done(); checks.push('内存换 slice 数组/素材高度/文字配置，证明切片和排版读表');
  }

  {
    const { page, done } = await session('manifest-missing', { missing: keys.map(imagePath) });
    let s = await open(page);
    eq(Object.values(s.textures), [false, false, false, false], '缺清单仍加载纹理');
    for (const row of s.rows) {
      eq(row.artUsed, 'code', '缺清单未回退 code'); eq(row.bg.type, 'Rectangle', '缺清单未画矩形');
      eq(row.label.color, row.state === 'disabled' ? 'rgba(59,42,32,0.6)' : '#3B2A20', '代码回退字色改变');
      if (row.cursor) eq(row.cursor.artUsed, 'code', '缺 cursor 未代码画');
    }
    await shot(page, 'ui2_missing_fallback');
    await hover(page, s.rows[1]); s = await snap(page);
    eq(s.rows[1].bg.fillColor, 0xe0cd9e, '代码悬停矩形颜色失效');
    await press(page, '3'); eq((await snap(page)).choiceCount, 4, '代码禁用选项仍响应');
    await press(page, '2'); eq((await snap(page)).body, fixture[1].label, '代码数字键回调失效');
    s = await open(page); await click(page, s.rows[3]); eq((await snap(page)).body, fixture[3].label, '代码点击失效');
    await done(); checks.push('四件清单缺失：无请求、矩形/字色/光标回退、禁用/数字键/点击可用、零报错');
  }

  // 每件分别移走 PNG；其它件继续 art，缺少的那一件回退 code。
  for (const key of keys) await withMissingFile(key, async () => {
    const { page, done } = await session(`file-missing:${key}`, { missingFile: imagePath(key) });
    let s = await open(page);
    eq(s.textures[key], false, `${key}: 实体缺图纹理仍存在`);
    for (const row of s.rows) {
      eq(row.artUsed, key === `ui_hud_dialog_option_${row.state}` ? 'code' : 'art', `${key}: 逐件回退错误`);
      if (row.cursor) eq(row.cursor.artUsed, key === 'ui_hud_cursor' ? 'code' : 'art', `${key}: cursor 逐件回退错误`);
    }
    await shot(page, `ui2_missing_${key}`);
    await hover(page, s.rows[1]); s = await snap(page);
    eq(s.rows[1].state, 'selected', `${key}: 缺图悬停失效`);
    eq(s.rows[1].artUsed, key.endsWith('_selected') ? 'code' : 'art', `${key}: 状态切换回退错误`);
    await press(page, '3'); eq((await snap(page)).choiceCount, 4, `${key}: 禁用项仍响应`);
    await click(page, s.rows[1]); eq((await snap(page)).body, fixture[1].label, `${key}: 缺图点击失效`);
    await done(); checks.push(`${key}: 清单内实体 PNG 缺失/200 HTML 静默、逐件回退、交互可用、还原 PNG`);
  });

  const report = { suite: 'dialog-ui', passed: true, assertions, checks, browserChecks, missingFileChecks, screenshots,
    shotDir, elapsedMs: Date.now() - startedAt };
  await fs.writeFile(path.join(shotDir, 'dialog-ui-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
  console.log(JSON.stringify(report, null, 2));
} finally {
  await browser?.close();
  await server?.close();
  await isolated?.cleanup();
}
