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
const shotDir = process.env.XT_TALISMAN_UI_SHOTS ?? '/workspace/reports/ui4_finish';
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
let contextCount = 0, pageCount = 0;
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

  async function createSessionContext() {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    contextCount++;
    await context.addInitScript(save => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      localStorage.setItem('xiantu_save_v1', JSON.stringify(save));
    }, save);
    return context;
  }
  async function session(label, { missing = [], missingFile = '', sharedContext } = {}, run) {
    progress(label);
    const context = sharedContext ?? await createSessionContext();
    let page;
    try {
      const filtered = missing.length ? await installMissingManifest(context, manifest, missing) : undefined;
      page = await context.newPage(); pageCount++;
      if (missingFile) await page.addInitScript(({ missingFile, token }) => {
        // Keep unrelated HTTP/decoded-image caches warm without Playwright routing, which disables HTTP cache.
        // Only the physically missing file gets a unique URL, so an earlier valid PNG can never mask this case.
        const freshMissingUrl = value => {
          const url = new URL(String(value), location.href);
          if (url.pathname !== `/${missingFile}`) return value;
          url.searchParams.set('talismanMissingCase', token); return url.href;
        };
        const open = XMLHttpRequest.prototype.open;
        XMLHttpRequest.prototype.open = function(method, url, ...args) {
          return open.call(this, method, freshMissingUrl(url), ...args);
        };
        // Phaser normally uses XHR blobs; retain the same guarantee if its image-load mode uses Image.src.
        const src = Object.getOwnPropertyDescriptor(HTMLImageElement.prototype, 'src');
        if (src?.set) Object.defineProperty(HTMLImageElement.prototype, 'src', { ...src,
          set(value) { return src.set.call(this, freshMissingUrl(value)); },
        });
      }, { missingFile, token: `${startedAt}:${label}` });
      const errors = { console: [], page: [], request: [], http: [] }, responses = [], requests = [];
      page.on('console', event => { if (event.type() === 'error') errors.console.push(event.text()); });
      page.on('pageerror', error => errors.page.push(error.message));
      page.on('request', request => requests.push(new URL(request.url()).pathname.slice(1)));
      page.on('requestfailed', request => errors.request.push(request.url()));
      page.on('response', response => {
        if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`);
        if (missingFile && new URL(response.url()).pathname === `/${missingFile}`)
          responses.push({ status: response.status(), type: response.headers()['content-type'] ?? '',
            caseToken: new URL(response.url()).searchParams.get('talismanMissingCase') });
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
        ok(responses.every(row => row.caseToken === `${startedAt}:${label}`), `${label}: 缺件未使用独立请求地址`);
        missingFileChecks[label] = { ...browserChecks[label], responses };
      }
    } finally {
      await page?.close();
      if (!sharedContext) await context.close();
    }
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
  async function backgroundSize(page, s, name) {
    const { background, state } = s.buttons[name];
    if (background.type !== 'Image') return [background.width, background.height];
    // Image 的 width/height 是素材尺寸；Canvas 的 setDisplaySize 应校验显示尺寸。
    return page.evaluate(({ name, state }) => {
      const button = window.__scene.children.getByName('talisman-panel').getByName(`talisman-${name}`);
      const background = button.getByName(`talisman-bg:${state}`);
      return [background.displayWidth, background.displayHeight];
    }, { name, state });
  }
  async function verify(page, s, name, state, missing = []) {
    const button = s.buttons[name], secondary = name === 'abandonOrContinue';
    const key = keyOf(secondary ? S[state] : B.image.replace(/\{[^}]+\}/, state));
    const absent = missing.includes(key);
    eq(button.state, state, `${name}: 状态错误`);
    eq(button.key, key, `${name}: 图路径未正确映射 texture key`);
    eq(button.artUsed, absent ? 'code' : 'art', `${key}: 逐件回退错误`);
    eq(s.artUsed[key], absent ? 'code' : 'art', `${key}: artUsed 错误`);
    if (absent) {
      eq(button.background.type, 'Rectangle', `${key}: 背景类型错误`);
      eq(button.background.nineSlice, null, `${name}: 缺图仍有切片`);
    } else if (button.background.type === 'NineSlice') {
      eq(button.background.nineSlice, secondary ? S.nineSlice : B.nineSlice, `${name}: 未读切片`);
    } else {
      eq(button.background.type, 'Image', `${key}: 背景类型错误`);
      eq(button.background.nineSlice, null, `${name}: Canvas 图片仍有切片`);
    }
    eq(button.background.texture, absent ? null : key, `${key}: 背景 texture key 错误`);
    eq(button.rect, B[name], `${name}: 未读坐标`);
    eq(await backgroundSize(page, s, name), B[name].slice(2), `${name}: 尺寸错误`);
    if (secondary) eq(button.textColor, state === 'disabled' ? S.textColor.disabled : S.textColor.normal, '次按钮字色错误');
    eq(button.enabled, state !== 'disabled', `${name}: 禁用命中区域错误`);
  }
  async function activate(page, s, name, action, missing) {
    s = await hover(page, s, name); await verify(page, s, name, 'hover', missing);
    const count = s.actions.length;
    await page.mouse.down();
    s = await waitSnapshot(page, { states: { [name]: 'pressed' } });
    await verify(page, s, name, 'pressed', missing);
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
      await verify(page, s, name, 'normal', missing);
      await activate(page, s, name, name === 'startOrAgain' ? 'start' : 'abandon', missing);
      s = await moveOut(page, name); await verify(page, s, name, 'normal', missing);
    }
    s = await update(page, { primary: 'again', secondary: 'continue' });
    ok(s.buttons.startOrAgain.label.includes('再'), '再来文案错误');
    ok(s.buttons.abandonOrContinue.label.includes('继续'), '继续文案错误');
    for (const name of ['startOrAgain', 'abandonOrContinue']) {
      await verify(page, s, name, 'normal', missing);
      await activate(page, s, name, name === 'startOrAgain' ? 'again' : 'continue', missing);
      s = await moveOut(page, name); await verify(page, s, name, 'normal', missing);
    }
    s = await update(page, { primaryDisabled: true, secondaryDisabled: true });
    for (const name of ['startOrAgain', 'abandonOrContinue']) {
      await verify(page, s, name, 'disabled', missing);
      const count = s.actions.length;
      await hover(page, s, name); await page.mouse.click(s.position.x + s.buttons[name].rect[0] + 10,
        s.position.y + s.buttons[name].rect[1] + 10);
      s = await afterInputFrame(page); eq(s.actions.length, count, '禁用按钮仍执行回调'); await verify(page, s, name, 'disabled', missing);
    }
    s = await update(page, { secondary: 'abandon' }); await verify(page, s, 'abandonOrContinue', 'disabled', missing);
    s = await render(page, 'setTalismanButtonDisabled', false);
    s = await hover(page, s); await verify(page, s, 'abandonOrContinue', 'hover', missing);
    const count = s.actions.length;
    await page.mouse.down();
    s = await waitSnapshot(page, { states: { abandonOrContinue: 'pressed' } });
    await verify(page, s, 'abandonOrContinue', 'pressed', missing);
    await moveOut(page, 'abandonOrContinue'); await page.mouse.up();
    s = await afterInputFrame(page); eq(s.actions.length, count, '拖出按钮仍执行回调');
    await verify(page, s, 'abandonOrContinue', 'normal', missing);
    return s;
  }

  async function exerciseMissingFile(page, key) {
    const missing = [key], name = secondaryKeys.includes(key) ? 'abandonOrContinue' : 'startOrAgain';
    let s = await open(page);
    // render 会创建四态背景；同时检查不可见状态，确保只有缺失的那一件回退。
    for (const relatedKey of keys)
      eq(s.artUsed[relatedKey], relatedKey === key ? 'code' : 'art', `${key}: ${relatedKey} 逐件回退错误`);
    for (const button of ['startOrAgain', 'abandonOrContinue']) await verify(page, s, button, 'normal', missing);
    const disabledKey = name === 'abandonOrContinue' ? keyOf(S.disabled) : primaryKeys[3];
    if (key === disabledKey) {
      const field = name === 'abandonOrContinue' ? 'secondaryDisabled' : 'primaryDisabled';
      s = await update(page, { [field]: true }); await verify(page, s, name, 'disabled', missing);
      s = await update(page, { [field]: false });
    }
    s = await activate(page, s, name, name === 'startOrAgain' ? 'start' : 'abandon', missing);
    await shot(page, `ui4_missing_${key}`);
    return s;
  }

  const craftSnapshot = page => page.evaluate(() => window.__xt.talismanCraftSnapshot());
  async function waitCraft(page, expected = {}) {
    const handle = await page.waitForFunction(expected => {
      const s = window.__xt.talismanCraftSnapshot();
      if (expected.closed) return !s;
      if (!s?.open) return false;
      if (expected.state && s.view.state !== expected.state) return false;
      if (expected.current !== undefined && s.view.draw?.current !== expected.current) return false;
      if (expected.confirming !== undefined && s.confirming !== expected.confirming) return false;
      if (expected.ready && s.view.draw?.waitingRelease !== false) return false;
      return s;
    }, expected, { polling: 'raf', timeout: 7000 });
    try { return await handle.jsonValue(); } finally { await handle.dispose(); }
  }
  async function clickCraft(page, name) {
    const s = await craftSnapshot(page), [x, y, w, h] = s.buttons[name].rect;
    await page.mouse.click(s.position.x + x + w / 2, s.position.y + y + h / 2);
    return craftSnapshot(page);
  }
  async function selectCraft(page, id) {
    const s = await craftSnapshot(page), row = s.presentation.recipes.find(row => row.id === id);
    ok(row, `缺少配方卡 ${id}`);
    const [x, y, w, h] = row.rect;
    await page.mouse.click(s.position.x + x + w / 2, s.position.y + y + h / 2);
    await page.waitForFunction(id => window.__xt.talismanCraftSnapshot()?.selectedRecipeId === id, id);
    return craftSnapshot(page);
  }
  async function setupCraft(page, { inventory = { talisman_paper: 12, spirit_ink: 12 }, curve = false, random = 0 } = {}) {
    await page.evaluate(async ({ inventory, curve, random }) => {
      window.__xt.setFlag('talismanCraft', true);
      window.__xt.setFlag('lifeSkillCurve', curve);
      await window.__xt.loadSave({ name: '制符界面收尾修士', level: 15, exp: 0, hp: 9999, mp: 9999, stones: 1000,
        questRewardVersion: 1, ageUpdatedAt: Date.now(), learnedRecipes: ['recipe_spirit_ink', 'recipe_talisman_fire'],
        // 部分已学夹具不标教学完成，避免旧档补授方把锁定卡自动解锁。
        quests: {}, inventory,
        talismanLevel: 1, talismanExp: 0, position: { mapId: 'qingyun_village', x: 160, y: 352 } });
      // 只固定注入点的随机源；扣料、输入、结算与领奖均走正式系统。
      window.__scene.talismanSystem.random = () => random;
      if (!window.__xt.openTalismanCraft('recipe_talisman_fire')) throw new Error('制符入口未打开');
    }, { inventory, curve, random });
    return waitCraft(page);
  }
  async function craftInput(page, directions, { resume = false, pause = false } = {}) {
    return page.evaluate(async ({ directions, resume, pause }) => {
      const ui = window.__scene.scene.get('talisman-craft-ui');
      const nextFrame = () => new Promise(resolve => ui.events.once('postupdate', resolve));
      const arrows = { up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39] };
      const dispatch = (type, direction) => {
        const [code, keyCode] = arrows[direction];
        window.dispatchEvent(new KeyboardEvent(type, { key: code, code, keyCode, which: keyCode,
          bubbles: true, cancelable: true, repeat: false }));
      };
      if (resume) window.__scene.game.resume();
      await nextFrame(); // 首帧先松键，恢复后不得把上一笔残留当成新输入。
      const snapshots = [];
      for (const direction of directions) {
        dispatch('keydown', direction); await nextFrame();
        dispatch('keyup', direction); await nextFrame();
        snapshots.push(window.__xt.talismanCraftSnapshot());
      }
      if (pause) window.__scene.game.pause();
      return { snapshots, snapshot: window.__xt.talismanCraftSnapshot() };
    }, { directions, resume, pause });
  }
  function verifyMaterials(s, missing = false) {
    eq(s.presentation.materials.map(({ item, have, need }) => ({ item, have, need })), s.view.check.materials,
      '材料槽未原样消费 view.check.materials');
    s.presentation.materials.forEach((material, index) => {
      const [x, y] = spec.detail.materials.first, lack = material.have < material.need;
      eq(material.rect, [x + index * spec.detail.materials.gap, y, 40, 40], '材料槽未读 JSON 坐标');
      eq(material.key, lack ? 'ui_talisman_slot_lack' : 'ui_talisman_slot_ok', '材料足缺底图错误');
      eq(material.lack, lack, '缺料状态错误');
      eq(s.artUsed[material.key], missing ? 'code' : 'art', '材料底图未逐件回退');
      if (lack) eq(material.mark, { x: x + index * spec.detail.materials.gap + 33.5, y: y + 33.5, scale: 0.6 },
        '缺料角标未使用中心 +33.5,+33.5 与 0.6 缩放');
    });
  }

  await session('states-and-callbacks', {}, async page => {
    const before = await page.evaluate(() => ({ inventory: { ...window.__scene.prog.inventory }, stones: window.__scene.prog.stones }));
    let s = await exercise(page);
    checks.push(`按钮背景：${s.buttons.startOrAgain.background.type} / ${s.buttons.abandonOrContinue.background.type}；纹理、显示尺寸与切片按实际类型校验`);
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
    eq(await backgroundSize(page, s, 'startOrAgain'), [118, 32], '主按钮背景尺寸写死');
    eq(s.buttons.startOrAgain.key, 'ui_alchemy_btn_disabled', '主按钮未读 image');
    if (s.buttons.startOrAgain.background.type === 'NineSlice')
      eq(s.buttons.startOrAgain.background.nineSlice, [8, 7, 4, 5], '主按钮切片写死');
    else {
      eq(s.buttons.startOrAgain.background.type, 'Image', '主按钮 Canvas 背景类型错误');
      eq(s.buttons.startOrAgain.background.nineSlice, null, '主按钮 Canvas 图片仍有切片');
    }
    eq(s.buttons.abandonOrContinue.rect, [354, 334, 124, 32], '次按钮坐标写死');
    eq(await backgroundSize(page, s, 'abandonOrContinue'), [124, 32], '次按钮背景尺寸写死');
    eq(s.buttons.abandonOrContinue.key, 'ui_alchemy_btn_normal', '次按钮未读 abandonOrContinueImage');
    if (s.buttons.abandonOrContinue.background.type === 'NineSlice')
      eq(s.buttons.abandonOrContinue.background.nineSlice, [7, 8, 5, 9], '次按钮切片未独立读表');
    else {
      eq(s.buttons.abandonOrContinue.background.type, 'Image', '次按钮 Canvas 背景类型错误');
      eq(s.buttons.abandonOrContinue.background.nineSlice, null, '次按钮 Canvas 图片仍有切片');
    }
    eq(s.buttons.abandonOrContinue.textColor, '#123456', 'normal 字色写死');
    s = await update(page, { secondaryDisabled: true });
    eq(s.buttons.abandonOrContinue.textColor, '#765432', 'disabled 字色写死');
    checks.push('内存换表验证窗口/双按钮坐标、独立切片、图片路径与字色');
  });
  await session('talisman-npc-route', {}, async page => {
    await page.evaluate(async () => {
      window.__xt.setFlag('fiveSectClasses', true);
      window.__xt.setFlag('talismanCraft', false);
      await window.__xt.loadSave({ name: '未拜师制符学徒', level: 15, exp: 0, hp: 9999, mp: 9999,
        questRewardVersion: 1, inventory: {}, quests: {}, ageUpdatedAt: Date.now() });
      await window.__xt.teleport('luoxia_town');
    });
    async function approachNpc(id) {
      await page.evaluate(id => {
        const s = window.__scene, npc = s.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === id);
        if (!npc) throw new Error(`地图未摆放NPC ${id}`);
        s.player.body.reset(npc.x, npc.y); s.player.body.setVelocity(0, 0);
      }, id);
      await page.waitForFunction(() => window.__scene.player.state2 === 'ground');
      await page.keyboard.press('z', { delay: 60 });
      await page.waitForFunction(() => window.__scene.dialog.open && window.__scene.dialog.choices.length > 0);
    }
    async function choose(label) {
      for (let pageIndex = 0; pageIndex < 8; pageIndex++) {
        const labels = await page.evaluate(() => window.__scene.dialog.choices.map(choice => choice.label));
        const index = labels.indexOf(label);
        if (index >= 0) {
          eq(await page.evaluate(index => !!window.__scene.dialog.choices[index].disabled, index), false, `${label}被禁用`);
          await page.keyboard.press(String(index + 1), { delay: 60 }); return;
        }
        const next = labels.findIndex(value => value.startsWith('›'));
        ok(next >= 0, `菜单未提供${label}`);
        await page.keyboard.press(String(next + 1), { delay: 60 });
        await page.waitForFunction(before => JSON.stringify(window.__scene.dialog.choices.map(choice => choice.label)) !== before, JSON.stringify(labels));
      }
      throw new Error(`翻页未找到${label}`);
    }
    async function finishTeaching() {
      for (let line = 0; line < 10 && await page.evaluate(() => window.__scene.dialog.open); line++) {
        eq(await page.evaluate(() => window.__scene.dialog.choices.length), 0, '教学对白意外出现选项');
        await page.keyboard.press('Enter', { delay: 60 });
      }
      eq(await page.evaluate(() => window.__scene.dialog.open), false, '教学对白未结束');
    }
    await approachNpc('ferry_master');
    await choose('前往灵符派');
    await page.waitForFunction(() => window.__scene.map.id === 'lingfu_pavilion' && window.__scene.player.active);
    eq(await page.evaluate(() => window.__xt.getState().features.talismanCraft), false, '五宗航线不应依赖制符开关');
    eq(await page.evaluate(() => window.__scene.prog.sect), '', '未拜师乘飞舟被强制入宗');
    eq(await page.evaluate(() => [window.__scene.prog.job, window.__scene.prog.selectedSect,
      window.__scene.prog.count('five_sect_token')]), ['', '', 0], '教学夹具应保持未入宗、未选宗且无拜帖');
    await page.evaluate(() => window.__xt.setFlag('talismanCraft', true));
    await approachNpc('lingfu_envoy');
    await choose('学习制符'); await finishTeaching();
    eq(await page.evaluate(() => window.__scene.quests.state('q_talisman_intro')), 'active', '第一轮对白未接取入门任务');
    eq(await page.evaluate(() => window.__scene.prog.learnedRecipes.length), 0, '接取前对话提前授方');
    await approachNpc('lingfu_envoy');
    await choose('学习制符'); await finishTeaching();
    eq(await page.evaluate(() => window.__scene.quests.state('q_talisman_intro')), 'done', '第二轮教学未交付入门任务');
    eq(await page.evaluate(() => window.__scene.prog.learnedRecipes.length), 5, '自然NPC教学未发五张配方');
    eq(await page.evaluate(() => [window.__scene.prog.job, window.__scene.prog.sect, window.__scene.prog.selectedSect,
      window.__scene.prog.count('five_sect_token'), window.__scene.quests.state('q_sect_lingfu') ?? null]),
    ['', '', '', 0, null], '独立制符教学不得拜入、选宗、发帖或接取宗门任务');
    await approachNpc('lingfu_envoy'); await choose('制符');
    await page.waitForFunction(() => window.__xt.talismanCraftSnapshot()?.open === true);
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__xt.talismanCraftSnapshot());
    const sourceSave = await page.evaluate(() => window.__xt.exportSave());
    eq(sourceSave.position.mapId, 'lingfu_pavilion', '新地图位置未进入合法存档');
    await page.evaluate(async save => window.__xt.loadSave(save), sourceSave);
    eq(await page.evaluate(() => window.__scene.map.id), 'lingfu_pavilion', '开关开启重载新图失败');
    const vital = await page.evaluate(() => [window.__scene.prog.hp, window.__scene.prog.mp]);
    await page.evaluate(() => window.__xt.setFlag('talismanCraft', false));
    eq(await page.evaluate(() => window.__scene.map.id), 'lingfu_pavilion', '五宗开态关闭制符不得撤离正式山门');
    eq(await page.evaluate(() => window.__xt.openTalismanCraft('recipe_talisman_fire')), false, '关闭制符会话后仍可打开正式制符');
    await page.evaluate(async save => window.__xt.loadSave(save), sourceSave);
    eq(await page.evaluate(() => window.__scene.map.id), 'lingfu_pavilion', '五宗开态须保留灵符山门旧档');
    await page.evaluate(() => window.__xt.setFlag('fiveSectClasses', false));
    await page.waitForFunction(() => window.__scene.map.id === 'luoxia_town');
    eq(await page.evaluate(() => [window.__scene.prog.hp, window.__scene.prog.mp]), vital, '关闭开关回镇修改气血灵力');
    eq(await page.evaluate(() => window.__scene.map.objects.some(o => o.type === 'npc' && (o.props.npc ?? o.name) === 'lingfu_envoy')), false,
      '关闭开关仍向未拜师角色追加墨符使');
    await page.evaluate(async save => window.__xt.loadSave(save), sourceSave);
    eq(await page.evaluate(() => window.__scene.map.id), 'luoxia_town', '关闭开关无法兼容新地图存档回镇');
    eq(await page.evaluate(() => [window.__scene.prog.hp, window.__scene.prog.mp]), vital, '关闭开关读新图档修改气血灵力');
    await page.evaluate(async save => {
      window.__xt.setFlag('talismanCraft', true);
      await window.__xt.loadSave(save);
    }, sourceSave);
    eq(await page.evaluate(() => window.__scene.map.id), 'lingfu_pavilion', '制符单独开启须重新登记灵符山门');
    await page.evaluate(() => window.__xt.teleport('luoxia_town'));
    await approachNpc('ferry_master'); await choose('前往灵符派');
    await page.waitForFunction(() => window.__scene.map.id === 'lingfu_pavilion' && window.__scene.player.active);
    checks.push('五宗开态且制符关闭仍可乘前往灵符派；会话开启制符后无帖教学授五方；关闭制符保留五宗山门，双关回镇，制符单开恢复地图与航线');
  });
  await session('craft-gameplay-save', {}, async page => {
    eq(await page.evaluate(() => window.__xt.openTalismanCraft('recipe_talisman_fire')), false, '默认开关关闭仍可进入正式制符');
    await page.evaluate(async () => {
      window.__xt.setFlag('talismanCraft', true);
      await window.__xt.loadSave({ name: '制符玩法修士', level: 15, exp: 0, hp: 9999, mp: 9999, stones: 1000,
        questRewardVersion: 1, ageUpdatedAt: Date.now(), learnedRecipes: ['recipe_spirit_ink', 'recipe_talisman_fire'],
        quests: { q_talisman_intro: { state: 'done', kills: {} } },
        inventory: { talisman_paper: 3, spirit_ink: 3 }, position: { mapId: 'qingyun_village', x: 160, y: 352 } });
      // The core accepts an injected RNG. Keep the real input path deterministic despite Phaser's random calls.
      window.__scene.talismanSystem.random = () => 0;
    });
    const opened = await page.evaluate(() => window.__xt.openTalismanCraft('recipe_talisman_fire'));
    eq(opened, true, '真实制符入口未打开');
    await page.waitForFunction(() => window.__xt.talismanCraftSnapshot()?.open === true);
    let s = await page.evaluate(() => window.__xt.talismanCraftSnapshot());
    eq(s.view.check.ok, true, '制符预检未通过');
    ok(await page.evaluate(() => window.__scene.scene.isPaused('game')), '正式窗口未暂停地图');
    const [x, y, w, h] = s.buttons.startOrAgain.rect;
    await page.mouse.click(s.position.x + x + w / 2, s.position.y + y + h / 2);
    await page.waitForFunction(() => window.__xt.talismanCraftSnapshot()?.view.state === 'drawing');
    eq(await page.evaluate(() => window.__scene.prog.count('talisman_paper')), 2, '开始未一次扣料');
    await page.waitForFunction(() => window.__xt.talismanCraftSnapshot()?.view.draw?.waitingRelease === false);
    const beforePause = await page.evaluate(() => {
      window.__scene.game.pause();
      return window.__xt.talismanCraftSnapshot().view.draw.remainingMs;
    });
    // Wait longer than a full stroke: paused wall time must not consume the gameplay deadline.
    await page.waitForTimeout(s.view.selectedRecipe.draw.stepTimeMs + 100);
    // Resume, release and draw within one browser turn: CDP round trips must not spend the real stroke budget.
    // DOM events still traverse the installed Phaser KeyboardManager and TalismanScene listeners.
    const drawing = await page.evaluate(async strokes => {
      const ui = window.__scene.scene.get('talisman-craft-ui');
      const nextFrame = () => new Promise(resolve => ui.events.once('postupdate', resolve));
      const arrows = { up: ['ArrowUp', 38], down: ['ArrowDown', 40], left: ['ArrowLeft', 37], right: ['ArrowRight', 39] };
      const dispatch = (type, direction) => {
        const [code, keyCode] = arrows[direction];
        window.dispatchEvent(new KeyboardEvent(type, { key: code, code, keyCode, which: keyCode,
          bubbles: true, cancelable: true, repeat: false }));
      };
      window.__scene.game.resume();
      const afterPause = window.__xt.talismanCraftSnapshot().view.draw;
      await nextFrame(); // First resumed frame observes released directions before any new stroke.
      for (const direction of strokes) {
        dispatch('keydown', direction); await nextFrame();
        dispatch('keyup', direction); await nextFrame();
      }
      return { afterPause, snapshot: window.__xt.talismanCraftSnapshot() };
    }, s.view.selectedRecipe.draw.strokes);
    eq(drawing.afterPause.current, 0, '全局暂停期间画符超时推进');
    ok(Math.abs(drawing.afterPause.remainingMs - beforePause) < 1, '全局暂停未保留本笔剩余时间');
    s = drawing.snapshot;
    eq(s.view.state, 'settled', '全笔画后未结算');
    eq(s.view.result.success, true, '固定种子全对未成功');
    eq(s.view.result.completion, 1, '实际方向输入完成度错误');
    eq(s.view.result.quality, 'high', '普通宗门极品未封上品');
    eq(s.view.result.delivered, true, '成功未实际入包');
    eq(await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'high')), 1, '品质堆数量错误');
    const attemptId = s.view.result.attemptId;
    await page.keyboard.press('Escape');
    await page.waitForFunction(() => !window.__xt.talismanCraftSnapshot());
    ok(await page.evaluate(() => window.__scene.scene.isActive('game')), '关闭未恢复地图');
    await page.evaluate(async () => { const save = window.__xt.exportSave(); await window.__xt.loadSave(save); });
    eq(await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'high')), 1, '重载重复入包或丢品质');
    eq(await page.evaluate(() => window.__scene.prog.talisman.attempt.result.attemptId), attemptId, '重载改变已结算attempt');
    eq(await page.evaluate(() => window.__scene.prog.count('talisman_paper')), 2, '重载重复扣料');
    const used = await page.evaluate(() => window.__xt.useTalisman('talisman_fire', 'high'));
    eq(used.ok, true, '实际火符打空发射未成立');
    eq(await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'high')), 0, '火符打空未扣数量');
    ok(await page.evaluate(() => window.__scene.prog.talismanUse.cooldowns.talisman_fire > window.__xt.getState().time), '火符打空未存冷却');
    await page.evaluate(async () => { const save = window.__xt.exportSave(); await window.__xt.loadSave(save); });
    ok(await page.evaluate(() => window.__scene.prog.talismanUse.cooldowns.talisman_fire > window.__xt.getState().time), '重载清除了符箓冷却');
    checks.push('正式开关、真实开窗→开始扣料→方向按键→品质封顶→入包→关窗恢复→重载幂等；火符打空消耗及冷却持久');
  });
  await session('craft-layout-feedback', {}, async page => {
    let s = await setupCraft(page, { inventory: { talisman_paper: 12, snake_gall: 2, spirit_herb: 2 } });
    verifyMaterials(s);
    eq(s.view.check.reason, 'materials', '缺料预检原因错误');
    eq(s.buttons.startOrAgain.enabled, false, '缺料仍可开始');
    const rows = s.presentation.recipes.filter(row => row.id !== 'recipe_spirit_ink');
    eq(rows.length, 4, '左侧未展示四种符卡');
    rows.forEach((row, index) => {
      const [x, y, w, h] = spec.recipeList.row;
      eq(row.rect, [x, y + index * (h + spec.recipeList.rowGap), w, h], '配方行未消费 JSON 坐标');
      eq(row.key, index === 0 ? spec.recipeList.rowImages.selected : spec.recipeList.rowImages.locked,
        '已选/未学配方卡图错误');
      if (index) ok(row.reason, '锁定配方没有原因文案');
    });
    eq(s.presentation.recipes.find(row => row.id === 'recipe_spirit_ink').rect, spec.recipeList.inkTab.rect, '研墨未读独立 tab 坐标');
    eq(s.presentation.paper.mode, 'preview', '选符未展示独立符纸');
    eq(s.presentation.paper.rect, spec.detail.paper.rect, '纸面未读 JSON 区域');
    eq(s.presentation.preview.rate, s.view.rate, '预览成功率偏离 view');
    eq(s.presentation.preview.outputCount, s.view.selectedRecipe.outputCount, '预览产出数偏离配方');
    eq(s.presentation.preview.qualityMin, await page.evaluate(() => window.__scene.talismanSystem.config.rules.qualityMin), '品质阈值未读配置');
    ok(!s.presentation.lifeSkill, '曲线默认关闭仍显示等级条');
    await shot(page, 'ui4_material_lack');

    s = await selectCraft(page, 'recipe_spirit_ink');
    verifyMaterials(s);
    eq(s.view.selectedRecipe.type, 'grinding', '研墨 tab 未选择研墨配方');
    eq(s.presentation.paper.mode, 'ink', '研墨页仍显示画符纸');
    await shot(page, 'ui4_ink');
    await clickCraft(page, 'startOrAgain');
    s = await waitCraft(page, { state: 'settled' });
    eq(s.view.result.item, 'spirit_ink', '研墨产物错误');
    eq(s.view.result.count, s.view.selectedRecipe.outputCount, '研墨产出未使用正式结果');
    eq(s.view.result.delivered, true, '研墨未实际入包');
    eq(s.presentation.result.key, null, '研墨结果误挂品质签');

    s = await selectCraft(page, 'recipe_talisman_fire');
    verifyMaterials(s);
    eq(s.buttons.startOrAgain.enabled, true, '研墨后材料余额未刷新');
    await shot(page, 'ui4_preview');
    await clickCraft(page, 'startOrAgain');
    s = await waitCraft(page, { state: 'drawing', current: 0, ready: true });
    eq(s.presentation.paper.mode, 'drawing', '绘制未切换累计纸面');
    ok(s.presentation.paper.baseFrame.includes('blank'), '零正确笔未显示 blank');
    eq(s.presentation.paper.fxCenter, spec.detail.paper.fxCenter, '绘制特效中心写死');
    eq(s.presentation.paper.fxScale, spec.detail.paper.fxScale, '绘制特效缩放写死');
    eq(s.presentation.sequence.strokes, s.view.draw.strokes, '未展示完整方向序列');
    eq(s.presentation.sequence.current, s.view.draw.current, '当前笔未跟随 draw');
    eq(s.presentation.stepBar.rect, spec.detail.stepBar.rect, '本笔时间条未读 JSON 坐标');
    ok(s.presentation.stepBar.ratio > 0 && s.presentation.stepBar.ratio <= 1, '本笔剩余比例错误');
    await page.evaluate(() => window.__scene.game.pause());
    await shot(page, 'ui4_drawing_blank');
    const mixed = await craftInput(page, ['up', 'up'], { resume: true, pause: true });
    const [correct, wrong] = mixed.snapshots;
    eq(correct.view.draw.correct, 1, '正确输入未累计');
    ok(correct.presentation.paper.baseFrame.includes('stroke_01'), '正确笔未更新累计帧');
    eq(correct.presentation.feedback.outcome, 'correct', '正确反馈缺失');
    eq(wrong.view.draw.current, 2, '错误笔未独立推进序列');
    eq(wrong.view.draw.correct, 1, '错误笔改变正确累计数');
    eq(wrong.presentation.paper.baseFrame, correct.presentation.paper.baseFrame, '错误笔改变底层累计帧');
    eq(wrong.presentation.feedback.outcome, 'wrong', '错误反馈缺失');
    await shot(page, 'ui4_stroke_miss');
    await page.evaluate(() => window.__scene.game.resume());
    // 以真实单笔时钟触发超时；命中后立即全局暂停，避免截图耗时占用下一笔。
    const timeoutHandle = await page.waitForFunction(() => {
      const s = window.__xt.talismanCraftSnapshot();
      if (s?.view.draw?.current !== 3) return false;
      window.__scene.game.pause(); return window.__xt.talismanCraftSnapshot();
    }, null, { polling: 'raf', timeout: 6000 });
    try { s = await timeoutHandle.jsonValue(); } finally { await timeoutHandle.dispose(); }
    eq(s.view.draw.timeouts, 1, '真实超时未判定');
    eq(s.presentation.feedback.outcome, 'timeout', '超时反馈缺失');
    eq(s.presentation.paper.baseFrame, correct.presentation.paper.baseFrame, '超时改变底层累计帧');
    await shot(page, 'ui4_stroke_timeout');
    s = (await craftInput(page, ['left'], { resume: true })).snapshot;
    eq(s.view.result.completion, 0.5, '混合笔画完成度错误');
    eq(s.view.result.quality, 'mid', '混合笔画未显示正式中品结果');
    eq(s.presentation.paper.mode, 'done', '成功未切成符动画');
    eq(s.presentation.result.key, 'ui_talisman_quality_mid', '成功品质签错误');
    eq(s.presentation.result.quality, s.view.result.quality, '结果品质偏离 view.result');
    ok(s.buttons.startOrAgain.label.includes('再'), '结果未提供再来');
    ok(s.buttons.close?.label.includes('关'), '结果未提供关闭');
    await shot(page, 'ui4_result_mid');
    const delivered = await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'mid'));
    eq(delivered, 1, '中品结果未自动入包');

    await clickCraft(page, 'startOrAgain');
    s = await waitCraft(page, { state: 'drawing', ready: true });
    const attemptId = s.view.attempt.attemptId;
    await clickCraft(page, 'abandonOrContinue');
    s = await waitCraft(page, { confirming: true });
    eq(s.view.state, 'drawing', '首击放弃提前中断制作');
    eq(s.view.draw.paused, true, '放弃确认未暂停玩法时钟');
    await shot(page, 'ui4_abandon_confirm');
    await clickCraft(page, 'abandonOrContinue');
    s = await waitCraft(page, { confirming: false, ready: true });
    eq(s.view.attempt.attemptId, attemptId, '继续画符换了尝试');
    eq(s.view.draw.paused, false, '继续未恢复计时');
    await page.keyboard.press('Escape');
    s = await waitCraft(page, { confirming: true });
    eq(s.view.draw.paused, true, '绘制中关闭未先暂停确认');
    await clickCraft(page, 'startOrAgain');
    await waitCraft(page, { closed: true });
    eq(await page.evaluate(() => window.__scene.prog.talisman.attempt.state), 'interrupted', '确认关闭未保存中断');
    eq(await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'mid')), delivered, '确认/结果按钮重复发奖');
    ok(await page.evaluate(() => window.__scene.scene.isActive('game')), '确认关闭未恢复地图');
    checks.push('JSON 四符卡/锁定原因/研墨 tab/材料槽/预览/纸面/序列/本笔条；真实正确、错误、超时保持累计帧；品质结果、再来、放弃继续及关闭确认');
  });
  await session('craft-failure-pending-level', {}, async page => {
    let s = await setupCraft(page, { curve: true, random: 0.999999 });
    const skill = await page.evaluate(() => window.__scene.prog.lifeSkillView('talisman'));
    ok(skill.enabled && skill.available, '等级测试条件未开启');
    ok(s.presentation.lifeSkill, '曲线开启未显示只读等级条');
    for (const key of ['level', 'exp', 'expToNext', 'maxLevel', 'maxed'])
      eq(s.presentation.lifeSkill[key], skill[key], `等级条 ${key} 未读 lifeSkillView`);
    const beforeSkill = await page.evaluate(() => [window.__scene.prog.talismanLevel, window.__scene.prog.talismanExp]);
    await selectCraft(page, 'recipe_spirit_ink'); await selectCraft(page, 'recipe_talisman_fire');
    eq(await page.evaluate(() => [window.__scene.prog.talismanLevel, window.__scene.prog.talismanExp]), beforeSkill,
      '选择配方或展示等级条改变经验');
    await shot(page, 'ui4_life_skill');
    await clickCraft(page, 'startOrAgain'); await waitCraft(page, { state: 'drawing', ready: true });
    s = (await craftInput(page, ['up', 'right', 'down', 'left'])).snapshot;
    eq(s.view.result.reason, 'condense', '高随机值未走凝符失败');
    eq(s.presentation.result.reason, 'condense', '凝符失败原因未展示');
    eq(s.presentation.paper.mode, 'craft_fail', '凝符失败未隐藏累计纸并切失败动画');
    await shot(page, 'ui4_fail_condense');
    await clickCraft(page, 'startOrAgain'); await waitCraft(page, { state: 'drawing', ready: true });
    s = (await craftInput(page, ['down', 'up', 'up', 'up'])).snapshot;
    eq(s.view.result.reason, 'completion', '全错输入未走完成度失败');
    eq(s.presentation.result.reason, 'completion', '完成度失败原因未展示');
    await shot(page, 'ui4_fail_completion');
    await page.evaluate(() => { window.__scene.talismanSystem.random = () => 0; });
    await clickCraft(page, 'startOrAgain'); await waitCraft(page, { state: 'drawing', ready: true });
    // 开始预检后模拟异常容量变化，保留正式 pending/claimPending 事务链。
    await page.evaluate(() => {
      const prog = window.__scene.prog;
      window.__ui4CanAddCraftedItem = prog.canAddCraftedItem;
      prog.canAddCraftedItem = () => false;
    });
    s = (await craftInput(page, ['up', 'right', 'down', 'left'])).snapshot;
    eq(s.view.state, 'pending', '异常入包失败未形成待领取');
    eq(s.view.result.success, true, '待领取重写了成功结果');
    eq(s.view.result.delivered, false, '待领取提前入包');
    eq(s.presentation.result.pending, true, '界面未提示待领取');
    eq(s.buttons.startOrAgain.enabled, false, '待领取仍可再来');
    const pendingId = s.view.result.attemptId;
    await shot(page, 'ui4_output_pending');
    await page.evaluate(() => {
      window.__scene.prog.canAddCraftedItem = window.__ui4CanAddCraftedItem;
      delete window.__ui4CanAddCraftedItem;
    });
    s = await waitCraft(page, { state: 'settled' });
    eq(s.view.result.attemptId, pendingId, '自动领取改变尝试');
    eq(s.view.result.delivered, true, '容量恢复后未自动领取');
    const count = await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'high'));
    eq(count, s.view.result.count, '自动领取数量与正式结果不同');
    await clickCraft(page, 'close'); await waitCraft(page, { closed: true });
    eq(await page.evaluate(() => window.__scene.prog.countQuality('talisman_fire', 'high')), count, '结果关闭重复领取');
    await page.evaluate(() => { window.__xt.setFlag('lifeSkillCurve', false); window.__xt.openTalismanCraft('recipe_talisman_fire'); });
    s = await waitCraft(page);
    ok(!s.presentation.lifeSkill, '关闭曲线后等级条未隐藏');
    checks.push('生活等级/经验只读及开关隐藏；凝符/完成度失败原因；异常入包待领取与恢复自动领取，结果按钮不发奖');
  });
  await session('craft-focus-and-selection', {}, async page => {
    await setupCraft(page);
    await selectCraft(page, 'recipe_spirit_ink');
    await clickCraft(page, 'close'); await waitCraft(page, { closed: true });
    eq(await page.evaluate(() => window.__xt.openTalismanCraft()), true, '再次打开制符失败');
    let s = await waitCraft(page);
    eq(s.selectedRecipeId, 'recipe_spirit_ink', '关闭重开未保留最后所选配方');
    await selectCraft(page, 'recipe_talisman_fire');
    await clickCraft(page, 'startOrAgain');
    await waitCraft(page, { state: 'drawing', ready: true });
    const focus = await page.evaluate(async () => {
      const ui = window.__scene.scene.get('talisman-craft-ui');
      const nextFrame = () => new Promise(resolve => ui.events.once('postupdate', resolve));
      const dispatch = (type, code, keyCode, repeat = false) => window.dispatchEvent(new KeyboardEvent(type,
        { key: code, code, keyCode, which: keyCode, repeat, bubbles: true, cancelable: true }));
      dispatch('keydown', 'ArrowUp', 38); await nextFrame();
      const before = window.__xt.talismanCraftSnapshot();
      // 保持方向键按住，模拟失焦期间 keyup 丢失；恢复不应永久等待残留 held。
      window.dispatchEvent(new Event('blur'));
      const blurred = window.__xt.talismanCraftSnapshot();
      await new Promise(resolve => setTimeout(resolve, before.view.selectedRecipe.draw.stepTimeMs + 100));
      const afterBlurWait = window.__xt.talismanCraftSnapshot();
      window.dispatchEvent(new Event('focus')); await nextFrame(); await nextFrame();
      const focused = window.__xt.talismanCraftSnapshot();
      dispatch('keydown', 'ArrowRight', 39, true); await nextFrame(); await nextFrame();
      dispatch('keyup', 'ArrowRight', 39); await nextFrame();
      const repeated = window.__xt.talismanCraftSnapshot();
      dispatch('keydown', 'ArrowRight', 39); await nextFrame();
      dispatch('keyup', 'ArrowRight', 39); await nextFrame();
      const fresh = window.__xt.talismanCraftSnapshot();
      window.__xt.talismanCraftAction('close');
      return { before, blurred, afterBlurWait, focused, repeated, fresh };
    });
    eq(focus.before.view.draw.current, 1, '失焦测试首笔未正确判定');
    eq(focus.blurred.view.draw.paused, true, '真实 blur 未暂停制符时钟');
    eq(focus.afterBlurWait.view.draw.current, 1, '失焦墙钟超过本笔仍推进');
    eq(focus.afterBlurWait.view.draw.remainingMs, focus.blurred.view.draw.remainingMs, '失焦未冻结剩余时限');
    eq(focus.focused.view.draw.waitingRelease, false, 'focus 后丢失 keyup 的 held 残留卡住松键等待');
    eq(focus.focused.view.draw.current, 1, 'focus 把残留按键算成新笔');
    eq(focus.repeated.view.draw.current, 1, 'repeat 事件被当成新按下沿');
    eq(focus.fresh.view.draw.current, 2, 'focus 后新方向按下不能继续画符');
    s = await waitCraft(page, { confirming: true });
    await clickCraft(page, 'startOrAgain'); await waitCraft(page, { closed: true });
    checks.push('关闭重开记忆所选研墨；真实 blur 持键丢 keyup 仍冻结计时，focus 清残键、忽略 repeat 并接收新笔');
  });
  await session('craft-layout-json-missing', { missing: ['art/icons/ui/talisman/talisman_ui.json'] }, async page => {
    const s = await setupCraft(page);
    eq(await page.evaluate(() => !!window.__scene.cache.json.get('talisman_ui')), false, '布局 JSON 缺清单夹具未生效');
    eq([s.position.width, s.position.height], spec.window.size, '布局 JSON 缺失未回退窗体');
    verifyMaterials(s);
    eq(s.presentation.paper.rect, spec.detail.paper.rect, '布局 JSON 缺失未回退纸面区域');
    eq(s.buttons.startOrAgain.rect, spec.detail.buttons.startOrAgain, '布局 JSON 缺失未回退按钮');
    await shot(page, 'ui4_missing_layout_json');
    checks.push('制符布局 JSON 清单外不请求，采用默认布局正常显示材料、纸面和按钮');
  });
  const talismanImages = manifest.uiImages.filter(row => row.path.startsWith('art/icons/ui/talisman/'));
  const talismanMissing = [...talismanImages.map(row => row.path),
    'art/sprites/fx_trial_talisman.png', 'art/sprites/fx_talisman_draw.png',
    ...(manifest.itemIcons ?? []).filter(row => ['icon_talisman_paper', 'icon_spirit_ink', 'icon_talisman_fire'].includes(row.key)).map(row => row.path)];
  await session('craft-manifest-missing', { missing: talismanMissing }, async page => {
    let s = await setupCraft(page, { inventory: { talisman_paper: 3 } });
    verifyMaterials(s, true);
    for (const row of s.presentation.recipes.filter(row => row.id !== 'recipe_spirit_ink'))
      eq(s.artUsed[row.key], 'code', '制符配方卡缺图未回退');
    eq(s.artUsed.ui_talisman_paper, 'code', '选符纸面缺图未回退');
    await shot(page, 'ui4_craft_missing_preview');
    await page.evaluate(() => window.__xt.giveItem('spirit_ink', 3));
    await page.waitForFunction(() => {
      const s = window.__xt.talismanCraftSnapshot();
      return s?.view.check.ok && s.buttons.startOrAgain.enabled;
    });
    // 材料预检是实时值；按钮须先完成重绘，再等下一帧加入 Phaser 输入列表。
    await page.evaluate(() => new Promise(resolve =>
      window.__scene.scene.get('talisman-craft-ui').events.once('postupdate', () => resolve())));
    await clickCraft(page, 'startOrAgain'); await waitCraft(page, { state: 'drawing', ready: true });
    s = (await craftInput(page, ['up', 'up'], { pause: true })).snapshot;
    eq(s.artUsed.fx_trial_talisman, 'code', '累计画符特效缺图未回退');
    eq(s.artUsed.fx_talisman_draw, 'code', '错笔特效缺图未回退');
    eq(s.presentation.paper.baseFrame.includes('stroke_01'), true, '缺图回退丢失正确累计数');
    await shot(page, 'ui4_craft_missing_drawing');
    s = (await craftInput(page, ['down', 'left'], { resume: true })).snapshot;
    eq(s.presentation.result.key, 'ui_talisman_quality_high', '缺图结果未保留正式品质');
    eq(s.artUsed.ui_talisman_quality_high, 'code', '品质签缺图未回退');
    await shot(page, 'ui4_craft_missing_result');
    checks.push('制符专属卡/槽/纸/反馈/品质及两套绘制 atlas 集中缺图：正式路径逐件代码回退且浏览器零错误');
  });
  await session('manifest-missing', { missing: keys.map(imagePath) }, async page => {
    const s = await exercise(page, keys);
    for (const key of windowKeys) eq(s.artUsed[key], 'code', `${key}: 窗体未回退`);
    await shot(page, 'ui4_missing_manifest');
    checks.push('所有相关图片清单外：无请求、代码回退、状态和回调可用');
  });
  // Reuse the HTTP/decoded-image cache; every case still owns a new Page, base save and JS realm.
  const fileContext = await createSessionContext();
  try {
    for (const key of keys) {
      const original = path.join(isolated.root, 'dist', imagePath(key)), moved = `${original}.smoke-missing`;
      await fs.rename(original, moved);
      try {
        await session(`file-missing:${key}`, { missingFile: imagePath(key), sharedContext: fileContext }, async page => {
          await exerciseMissingFile(page, key);
        });
      } finally { await fs.rename(moved, original); }
      await fs.access(original);
      checks.push(`${key}: 清单内实体 PNG 缺失、200 HTML 静默、逐件回退、还原`);
    }
  } finally { await fileContext.close(); }
  report = { suite: 'talisman-ui', passed: true, assertions, checks, browserChecks, missingFileChecks, screenshots, shotDir,
    isolation: { contexts: contextCount, pages: pageCount, fileCasesShareContext: true } };
} finally {
  progress('cleanup');
  await browser?.close(); await server?.close(); await isolated?.cleanup();
}
report.elapsedMs = Date.now() - startedAt;
await fs.writeFile(path.join(shotDir, 'talisman-ui-smoke.json'), `${JSON.stringify(report, null, 2)}\n`);
console.log(JSON.stringify(report, null, 2));
