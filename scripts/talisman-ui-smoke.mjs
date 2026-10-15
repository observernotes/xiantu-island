// UI-4：独立 snapshot 工程与 preview；只移动临时 dist 的文件，不改工作树/共享素材。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { inspectSharedPreview, installMissingManifest } from './shared-smoke-preview.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotDir = process.env.XT_TALISMAN_UI_SHOTS ?? '/workspace/reports/ui4';
const spec = JSON.parse(await fs.readFile(path.join(root, 'data/art/icons/ui/talisman/talisman_ui.json'), 'utf8'));
const B = spec.detail.buttons, S = B.abandonOrContinueImage;
const keyOf = image => image.split('/').pop();
const secondaryKeys = [...new Set(['normal', 'hover', 'pressed', 'disabled'].map(state => keyOf(S[state])))];
const primaryKeys = ['normal', 'hover', 'pressed', 'disabled'].map(state => keyOf(B.image.replace(/\{[^}]+\}/, state)));
const windowKeys = ['ui_bestiary_window', 'ui_bestiary_title', 'ui_bestiary_inset', 'ui_bestiary_btn_close'];
const keys = [...secondaryKeys, ...primaryKeys, ...windowKeys];
const imagePath = key => `art/icons/ui/${key.startsWith('ui_hud_') ? 'hud' : key.startsWith('ui_alchemy_') ? 'alchemy' : 'bestiary'}/${key}.png`;
const save = { name: '制符冒烟修士', level: 2, exp: 0, hp: 0, mp: 0, stones: 1000,
  questRewardVersion: 1, inventory: {}, ageUpdatedAt: Date.now() };
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const checks = [], browserChecks = {}, missingFileChecks = {}, screenshots = [];
const startedAt = Date.now();
const progress = phase => console.log(JSON.stringify({ suite: 'talisman-ui', phase, elapsedMs: Date.now() - startedAt }));

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
async function build(root) {
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

let isolated, browser, server, report;
try {
  progress('isolated-build');
  isolated = await createIsolatedBuild(root, 'talisman-ui');
  await build(isolated.root);
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

  async function session(label, { missing = [], missingFile = '' } = {}, run) {
    progress(label);
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    try {
      const filtered = missing.length ? await installMissingManifest(context, manifest, missing) : undefined;
      await context.addInitScript(save => localStorage.setItem('xiantu_save_v1', JSON.stringify(save)), save);
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
      await page.waitForFunction(() => {
        if (!window.__scene?.player?.active || !window.__xt?.openTalismanPanel) return false;
        try { return !!window.__xt.talismanSnapshot(); } catch { return false; }
      }, null, { timeout: 40000 });
      await run(page);
      // 不过滤 Chromium 的资源日志，所有原始错误均须为零。
      eq(errors, { console: [], page: [], request: [], http: [] }, `${label}: 浏览器报错`);
      browserChecks[label] = { consoleErrors: errors.console.length, pageErrors: errors.page.length,
        requestFailures: errors.request.length, httpErrors: errors.http.length };
      if (filtered) {
        ok(filtered.rewriteCount > 0, '清单模拟未生效');
        for (const file of missing) eq(requests.includes(file), false, `清单外仍请求 ${file}`);
      }
      if (missingFile) {
        ok(responses.length > 0, `${label}: 清单内实体缺图未请求`);
        ok(responses.every(row => row.status === 200 && row.type.includes('text/html')), `${label}: 未覆盖 200 HTML 解码失败`);
        missingFileChecks[label] = { ...browserChecks[label], responses };
      }
    } finally { await context.close(); }
  }
  // render 后等一帧，让 Phaser 把新按钮加入输入列表；不靠固定延时猜就绪。
  async function render(page, method, state) {
    await page.mouse.move(10, 10);
    return page.evaluate(({ method, state }) => {
      window.__xt[method](state);
      return new Promise(resolve => window.__scene.events.once('postupdate', () => resolve(window.__xt.talismanSnapshot())));
    }, { method, state });
  }
  const open = (page, state = {}) => render(page, 'openTalismanPanel', state);
  const update = (page, state) => render(page, 'setTalismanPanelState', state);
  const afterInputFrame = page => page.evaluate(() => new Promise(resolve =>
    window.__scene.events.once('postupdate', () => resolve(window.__xt.talismanSnapshot()))));
  async function waitSnapshot(page, { open = true, states = {}, actionCount = 0 } = {}) {
    const handle = await page.waitForFunction(({ open, states, actionCount }) => {
      const s = window.__xt.talismanSnapshot();
      return s.open === open && s.actions.length >= actionCount
        && Object.entries(states).every(([name, state]) => s.buttons[name]?.state === state) ? s : false;
    }, { open, states, actionCount }, { polling: 'raf', timeout: 5000 });
    try { return await handle.jsonValue(); } finally { await handle.dispose(); }
  }
  async function hover(page, s, name = 'abandonOrContinue') {
    const [x, y, w, h] = s.buttons[name].rect;
    await page.mouse.move(s.position.x + x + w / 2, s.position.y + y + h / 2);
    return waitSnapshot(page, { states: { [name]: s.buttons[name].enabled ? 'hover' : 'disabled' } });
  }
  async function moveOut(page, name) {
    await page.mouse.move(10, 10);
    return waitSnapshot(page, { states: { [name]: 'normal' } });
  }
  async function shot(page, name) {
    const file = path.join(shotDir, `${name}.png`);
    await page.screenshot({ path: file }); screenshots.push(file);
  }
  function verify(s, name, state, missing = []) {
    const button = s.buttons[name], secondary = name === 'abandonOrContinue';
    const key = keyOf(secondary ? S[state] : B.image.replace(/\{[^}]+\}/, state));
    const absent = missing.includes(key);
    eq(button.state, state, `${name}: 状态错误`);
    eq(button.key, key, `${name}: 图路径未正确映射 texture key`);
    eq(button.artUsed, absent ? 'code' : 'art', `${key}: 逐件回退错误`);
    eq(s.artUsed[key], absent ? 'code' : 'art', `${key}: artUsed 错误`);
    eq(button.background.type, absent ? 'Rectangle' : 'NineSlice', `${key}: 背景类型错误`);
    eq(button.rect, B[name], `${name}: 未读坐标`);
    eq([button.background.width, button.background.height], B[name].slice(2), `${name}: 尺寸错误`);
    eq(button.background.nineSlice, absent ? null : secondary ? S.nineSlice : B.nineSlice, `${name}: 未读切片`);
    if (secondary) eq(button.textColor, state === 'disabled' ? S.textColor.disabled : S.textColor.normal, '次按钮字色错误');
    eq(button.enabled, state !== 'disabled', `${name}: 禁用命中区域错误`);
  }
  async function activate(page, s, name, action, missing) {
    s = await hover(page, s, name); verify(s, name, 'hover', missing);
    const count = s.actions.length;
    await page.mouse.down();
    s = await waitSnapshot(page, { states: { [name]: 'pressed' } });
    verify(s, name, 'pressed', missing);
    eq(s.actions.length, count, '按下时提前执行动作');
    await page.mouse.up();
    s = await waitSnapshot(page, { states: { [name]: 'hover' }, actionCount: count + 1 });
    eq(s.actions.length, count + 1, '松开按钮未执行一次回调');
    eq(s.actions.at(-1), action, '回调意图错误');
    return s;
  }
  // 正常/清单外场景完整覆盖双按钮四态和回调；截图仅在调用方各留一张。
  async function exercise(page, missing = []) {
    let s = await open(page);
    for (const name of ['startOrAgain', 'abandonOrContinue']) {
      verify(s, name, 'normal', missing);
      await activate(page, s, name, name === 'startOrAgain' ? 'start' : 'abandon', missing);
      s = await moveOut(page, name); verify(s, name, 'normal', missing);
    }
    s = await update(page, { primary: 'again', secondary: 'continue' });
    ok(s.buttons.startOrAgain.label.includes('再'), '再来文案错误');
    ok(s.buttons.abandonOrContinue.label.includes('继续'), '继续文案错误');
    for (const name of ['startOrAgain', 'abandonOrContinue']) {
      verify(s, name, 'normal', missing);
      await activate(page, s, name, name === 'startOrAgain' ? 'again' : 'continue', missing);
      s = await moveOut(page, name); verify(s, name, 'normal', missing);
    }
    s = await update(page, { primaryDisabled: true, secondaryDisabled: true });
    for (const name of ['startOrAgain', 'abandonOrContinue']) {
      verify(s, name, 'disabled', missing);
      const count = s.actions.length;
      await hover(page, s, name); await page.mouse.click(s.position.x + s.buttons[name].rect[0] + 10,
        s.position.y + s.buttons[name].rect[1] + 10);
      s = await afterInputFrame(page); eq(s.actions.length, count, '禁用按钮仍执行回调'); verify(s, name, 'disabled', missing);
    }
    s = await update(page, { secondary: 'abandon' }); verify(s, 'abandonOrContinue', 'disabled', missing);
    s = await render(page, 'setTalismanButtonDisabled', false);
    s = await hover(page, s); verify(s, 'abandonOrContinue', 'hover', missing);
    const count = s.actions.length;
    await page.mouse.down();
    s = await waitSnapshot(page, { states: { abandonOrContinue: 'pressed' } });
    verify(s, 'abandonOrContinue', 'pressed', missing);
    await moveOut(page, 'abandonOrContinue'); await page.mouse.up();
    s = await afterInputFrame(page); eq(s.actions.length, count, '拖出按钮仍执行回调');
    verify(s, 'abandonOrContinue', 'normal', missing);
    return s;
  }

  async function exerciseMissingFile(page, key) {
    const missing = [key], name = secondaryKeys.includes(key) ? 'abandonOrContinue' : 'startOrAgain';
    let s = await open(page);
    // render 会创建四态背景；同时检查不可见状态，确保只有缺失的那一件回退。
    for (const relatedKey of keys)
      eq(s.artUsed[relatedKey], relatedKey === key ? 'code' : 'art', `${key}: ${relatedKey} 逐件回退错误`);
    for (const button of ['startOrAgain', 'abandonOrContinue']) verify(s, button, 'normal', missing);
    const disabledKey = name === 'abandonOrContinue' ? keyOf(S.disabled) : primaryKeys[3];
    if (key === disabledKey) {
      const field = name === 'abandonOrContinue' ? 'secondaryDisabled' : 'primaryDisabled';
      s = await update(page, { [field]: true }); verify(s, name, 'disabled', missing);
      s = await update(page, { [field]: false });
    }
    s = await activate(page, s, name, name === 'startOrAgain' ? 'start' : 'abandon', missing);
    await shot(page, `ui4_missing_${key}`);
    return s;
  }

  await session('states-and-callbacks', {}, async page => {
    const before = await page.evaluate(() => ({ inventory: { ...window.__scene.prog.inventory }, stones: window.__scene.prog.stones }));
    let s = await exercise(page);
    await shot(page, 'ui4');
    eq([s.position.width, s.position.height], spec.window.size, '窗体尺寸未读表');
    eq(s.buttons.abandonOrContinue.rect, [342, 346, 112, 28], '次按钮基线坐标错误');
    for (const key of windowKeys) eq(s.artUsed[key], 'art', '公共窗体件未复用');
    const after = await page.evaluate(() => ({ inventory: { ...window.__scene.prog.inventory }, stones: window.__scene.prog.stones }));
    eq(after, before, 'UI 壳改变了材料/灵石');
    await page.keyboard.press('Escape'); s = await waitSnapshot(page, { open: false });
    eq(s.open, false, 'Esc 未发出关闭请求'); eq(s.actions.at(-1), 'close', '关闭回调错误');
    s = await open(page);
    await page.locator('canvas').click({ position: {
      x: s.position.x + spec.window.close[0] + 10, y: s.position.y + spec.window.close[1] + 10 } });
    s = await waitSnapshot(page, { open: false });
    eq(s.open, false, '真实 × 点击未关闭'); eq(s.actions.at(-1), 'close', '真实 × 关闭回调错误');
    checks.push('放弃/继续、开始/再来四态；真实按下/松开/拖出/禁用/恢复/关闭；无扣料');

    // 改缓存而不改文件：证明专属切片不借用 HUD 表，两个按钮各读自己的字段。
    await page.evaluate(() => {
      const L = window.__scene.cache.json.get('talisman_ui'), B = L.detail.buttons;
      L.window.size = [660, 410]; B.startOrAgain = [224, 334, 118, 32]; B.abandonOrContinue = [354, 334, 124, 32];
      B.nineSlice = [8, 7, 4, 5]; B.image = 'alchemy/ui_alchemy_btn_disabled';
      B.abandonOrContinueImage.nineSlice = [7, 8, 5, 9];
      B.abandonOrContinueImage.normal = 'alchemy/ui_alchemy_btn_normal';
      B.abandonOrContinueImage.textColor = { normal: '#123456', disabled: '#765432' };
    });
    s = await open(page);
    eq([s.position.width, s.position.height], [660, 410], '缓存窗体尺寸未生效');
    eq(s.buttons.startOrAgain.rect, [224, 334, 118, 32], '主按钮坐标写死');
    eq(s.buttons.startOrAgain.key, 'ui_alchemy_btn_disabled', '主按钮未读 image');
    eq(s.buttons.startOrAgain.background.nineSlice, [8, 7, 4, 5], '主按钮切片写死');
    eq(s.buttons.abandonOrContinue.rect, [354, 334, 124, 32], '次按钮坐标写死');
    eq(s.buttons.abandonOrContinue.key, 'ui_alchemy_btn_normal', '次按钮未读 abandonOrContinueImage');
    eq(s.buttons.abandonOrContinue.background.nineSlice, [7, 8, 5, 9], '次按钮切片未独立读表');
    eq(s.buttons.abandonOrContinue.textColor, '#123456', 'normal 字色写死');
    s = await update(page, { secondaryDisabled: true });
    eq(s.buttons.abandonOrContinue.textColor, '#765432', 'disabled 字色写死');
    checks.push('内存换表验证窗口/双按钮坐标、独立切片、图片路径与字色');
  });
  await session('manifest-missing', { missing: keys.map(imagePath) }, async page => {
    const s = await exercise(page, keys);
    for (const key of windowKeys) eq(s.artUsed[key], 'code', `${key}: 窗体未回退`);
    await shot(page, 'ui4_missing_manifest');
    checks.push('所有相关图片清单外：无请求、代码回退、状态和回调可用');
  });
  for (const key of keys) {
    const original = path.join(isolated.root, 'dist', imagePath(key)), moved = `${original}.smoke-missing`;
    await fs.rename(original, moved);
    try {
      await session(`file-missing:${key}`, { missingFile: imagePath(key) }, async page => {
        await exerciseMissingFile(page, key);
      });
    } finally { await fs.rename(moved, original); }
    await fs.access(original);
    checks.push(`${key}: 清单内实体 PNG 缺失、200 HTML 静默、逐件回退、还原`);
  }
  report = { suite: 'talisman-ui', passed: true, assertions, checks, browserChecks, missingFileChecks, screenshots, shotDir };
} finally {
  progress('cleanup');
  await browser?.close(); await server?.close(); await isolated?.cleanup();
}
report.elapsedMs = Date.now() - startedAt;
await fs.writeFile(path.join(shotDir, 'talisman-ui-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
