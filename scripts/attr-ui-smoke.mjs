import { installBrowserSaveReader } from './browser-save.mjs';
// UI-6 加点窗浏览器冒烟；独立快照工程构建/preview，不覆盖工作树 dist，也不在浏览器冒烟内执行 tsc。
// timeout 300s node scripts/attr-ui-smoke.mjs；XT_ATTR_UI_SHOTS 可覆盖默认截图目录。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { inspectSharedPreview, installMissingManifest } from './shared-smoke-preview.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotDir = process.env.XT_ATTR_UI_SHOTS ?? '/workspace/reports/ui6';
const STAT_KEYS = ['rootBone', 'agility', 'spirit', 'insight'];
const growth = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/player_growth.json'), 'utf8'));
const strings = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/strings_zh.json'), 'utf8'));
const boss = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/monsters.json'), 'utf8'))
  .find(monster => monster.isBoss && monster.id !== 'demon_fox');
assert.ok(boss, '快照缺少用于延时首领对白的真实 boss 定义');
const points = Number(growth.perLevel.statPoints) || 0;
assert.ok(Number.isSafeInteger(points) && points > 1, '冒烟需表内每级点数大于 1');
const WINDOW_ART = ['bestiary/ui_bestiary_window', 'bestiary/ui_bestiary_title', 'bestiary/ui_bestiary_inset',
  'bestiary/ui_bestiary_btn_close', 'bestiary/ui_bestiary_btn_close_hover',
  'alchemy/ui_alchemy_list_row_normal', 'alchemy/ui_alchemy_list_row_selected', 'alchemy/ui_alchemy_list_row_disabled',
  'alchemy/ui_alchemy_btn_normal', 'alchemy/ui_alchemy_btn_hover', 'alchemy/ui_alchemy_btn_pressed', 'alchemy/ui_alchemy_btn_disabled']
  .map(file => `art/icons/ui/${file}.png`);
const SAVE = { name: '加点冒烟修士', level: 2, exp: 0, hp: 0, mp: 0, stones: 1000,
  allocatedStats: Object.fromEntries(STAT_KEYS.map(key => [key, 0])), unspentStatPoints: points,
  questRewardVersion: 1, inventory: { bronze_furnace: 1 }, learnedRecipes: ['recipe_hp_pill'], ageUpdatedAt: Date.now() };
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (actual, message) => { assert.ok(actual, message); assertions++; };
const checks = [], missingFileChecks = {}, browserChecks = {};
const sum = record => Object.values(record).reduce((total, value) => total + value, 0);

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
      child.once('close', (code, signal) => code === 0 ? resolve() : reject(new Error(`隔离构建失败 ${args.join(' ')} (${signal ?? code})\n${output}`)));
    });
  }
}

let isolated, browser, server;
try {
  isolated = await createIsolatedBuild(projectRoot, 'attr-ui');
  await buildIsolated(isolated.root);
  await fs.mkdir(shotDir, { recursive: true });
  server = await preview({ root: isolated.root, preview: { port: Number(process.env.SMOKE_PORT ?? 0) } });
  const baseURL = server.resolvedUrls.local[0];
  const { manifest, testBridgePresent } = await inspectSharedPreview(baseURL);
  ok(testBridgePresent, '隔离构建未包含测试桥');
  const api = await playwright();
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  async function session(label, { missing = [], missingFile = '', save = SAVE } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    await installBrowserSaveReader(context);
    const filtered = missing.length ? await installMissingManifest(context, manifest, missing) : undefined;
    await context.addInitScript(save => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      if (!sessionStorage.getItem('attr-seeded')) {
        localStorage.setItem('xiantu_save_v1', JSON.stringify(save)); sessionStorage.setItem('attr-seeded', '1');
      }
    }, save);
    const page = await context.newPage();
    const errors = { console: [], page: [], request: [], http: [] }, responses = [];
    page.on('console', event => { if (event.type() === 'error') errors.console.push(event.text()); });
    page.on('pageerror', error => errors.page.push(error.message));
    page.on('requestfailed', request => errors.request.push(request.url()));
    page.on('response', response => {
      if (response.status() >= 400) errors.http.push(`${response.status()} ${response.url()}`);
      if (missingFile && new URL(response.url()).pathname === `/${missingFile}`)
        responses.push({ status: response.status(), type: response.headers()['content-type'] ?? '' });
    });
    await page.goto(new URL('?map=qingyun_village', baseURL).href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(() => window.__scene?.player?.active && window.__scene.attrPanel && window.__xt?.attrSnapshot,
      null, { timeout: 40000 });
    await page.waitForTimeout(350);
    const done = async () => {
      try {
        // 清单缺图与 200 HTML 解码失败均要求真实 console.error 为零，不排除浏览器诊断。
        eq(errors, { console: [], page: [], request: [], http: [] }, `${label}: 浏览器报错`);
        browserChecks[label] = { consoleErrors: errors.console.length, pageErrors: errors.page.length,
          requestFailures: errors.request.length, httpErrors: errors.http.length };
        if (filtered) ok(filtered.rewriteCount > 0, `${label}: 清单缺图模拟未生效`);
        if (missingFile) {
          ok(responses.length > 0, `${label}: 清单内实体缺图没有发请求`);
          ok(responses.every(row => row.status === 200 && row.type.includes('text/html')),
            `${label}: 缺图未覆盖 preview 的 200 HTML 路径：${JSON.stringify(responses)}`);
          missingFileChecks[label] = { ...browserChecks[label], responses };
        }
      } finally { await context.close(); }
    };
    return { page, done };
  }
  async function withMissingFile(file, test) {
    ok(manifest.uiImages.some(image => image.path === file), `实体缺图不在构建清单：${file}`);
    const original = path.join(isolated.root, 'dist', file), moved = `${original}.smoke-missing`;
    await fs.rename(original, moved);
    try { await test(); } finally { await fs.rename(moved, original); }
    await fs.access(original);
  }
  const shot = (page, name) => page.screenshot({ path: path.join(shotDir, `${name}.png`) });
  const snap = page => page.evaluate(() => window.__xt.attrSnapshot());
  const progress = page => page.evaluate(async () => {
    const p = window.__scene.prog, saved = (await window.__xtReadPersistedSave());
    return { unspent: p.unspentStatPoints, allocated: { ...p.allocatedStats }, savedUnspent: saved.unspentStatPoints,
      savedAllocated: saved.allocatedStats };
  });
  const press = async (page, key) => {
    await page.waitForTimeout(150);
    await page.keyboard.down(key); await page.waitForTimeout(55); await page.keyboard.up(key); await page.waitForTimeout(80);
  };
  async function clickNamed(page, name) {
    const button = await page.evaluate(name => {
      const obj = window.__scene.children.getByName('attr-panel')?.getByName(name), bounds = obj?.getBounds();
      return obj && bounds ? { enabled: !!obj.input?.enabled, text: obj.text, x: bounds.centerX, y: bounds.centerY } : null;
    }, name);
    ok(button?.enabled, `加点窗缺可点击 ${name}：${JSON.stringify(button)}`);
    await page.mouse.click(button.x, button.y); await page.waitForTimeout(100);
    return button;
  }
  async function open(page) {
    await press(page, 'p');
    await page.waitForFunction(() => window.__xt.attrSnapshot().open, null, { timeout: 3000 });
  }
  async function nearNpc(page, npcId = 'grocer_wang') {
    const nearby = await page.evaluate(id => {
      const s = window.__scene, npc = s.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === id);
      s.player.body.reset(npc.x, npc.y); s.player.body.setVelocity(0, 0);
      return s.nearNpc() === id;
    }, npcId);
    ok(nearby, `${npcId} 未在真实 NPC 点位`);
  }
  const emptyDraft = draft => eq(draft, Object.fromEntries(STAT_KEYS.map(key => [key, 0])), '草稿未清空');

  // 真正的 P、鼠标加减和两步确认；修改草稿与首确认都不能写档。
  {
    const { page, done } = await session('allocate');
    await open(page);
    let s = await snap(page);
    eq(s.rows.map(row => row.key), STAT_KEYS, '四维键/顺序错误');
    eq(s.unspent, points, '未分配点未读取存档');
    ok(s.rows.every(row => row.name === strings[`ui.${row.key}`]), '属性名未读现有 ui.* 文案');
    ok(Object.keys(s.artUsed).length >= 4 && Object.values(s.artUsed).every(value => value === 'art'),
      `正常素材未使用精修件：${JSON.stringify(s.artUsed)}`);
    await shot(page, 'ui6_attr_open');
    const before = await progress(page);
    await clickNamed(page, 'attr-rootBone-plus'); await clickNamed(page, 'attr-agility-plus');
    await clickNamed(page, 'attr-agility-minus');
    eq((await snap(page)).draft.rootBone, 1, '根骨 + 没有修改草稿');
    eq((await snap(page)).draft.agility, 0, '身法 − 没有撤销草稿');
    eq(await progress(page), before, '草稿加减写入了存档/已确认属性');
    await clickNamed(page, 'attr-confirm');
    ok((await snap(page)).pending, '首次确认未进入二步确认');
    eq(await progress(page), before, '首次确认已经结算');
    await shot(page, 'ui6_attr_confirm');
    await clickNamed(page, 'attr-commit');
    let after = await progress(page);
    eq(after, { unspent: points - 1, allocated: { ...before.allocated, rootBone: before.allocated.rootBone + 1 },
      savedUnspent: points - 1, savedAllocated: { ...before.allocated, rootBone: before.allocated.rootBone + 1 } }, '确认未扣点/写属性/保存');
    s = await snap(page);
    eq(s.pending, null, '确认后 pending 未清除'); emptyDraft(s.draft);
    await shot(page, 'ui6_attr_allocated');
    // 已确认属性不能由草稿减回去；耗尽预算后继续加不会超支，逻辑层也应拒绝超支请求。
    await page.evaluate(() => window.__scene.attrPanel.adjust('rootBone', -1));
    eq(await progress(page), after, '− 改动已确认属性'); emptyDraft((await snap(page)).draft);
    await page.evaluate(points => { for (let i = 0; i <= points; i++) window.__scene.attrPanel.adjust('spirit', 1); }, points);
    s = await snap(page);
    eq(sum(s.draft), after.unspent, '草稿未限制剩余点数');
    const rejected = await page.evaluate(points => window.__scene.prog.applyAllocate({ insight: points + 1 }), points);
    eq(rejected, { ok: false, reason: 'overspend' }, '逻辑层未拒绝超支');
    eq(await progress(page), after, '超支失败仍改变存档');
    await press(page, 'Escape');
    eq((await snap(page)).open, false, 'Esc 未关窗');
    await open(page); emptyDraft((await snap(page)).draft);
    await clickNamed(page, 'attr-insight-plus'); await clickNamed(page, 'attr-close');
    eq((await snap(page)).open, false, '关闭钮未关窗');
    await open(page); emptyDraft((await snap(page)).draft);
    eq(await progress(page), after, 'Esc/关闭草稿仍改变存档');
    await press(page, 'p'); eq((await snap(page)).open, false, 'P 未切换关闭');
    await page.evaluate(() => window.__xt.openAttrPanel());
    eq((await snap(page)).open, true, '测试桥 openAttrPanel 未开窗');
    await press(page, 'Escape');
    // 刷新走真实读取，保证确认值存档往返。
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__scene?.attrPanel && window.__xt?.attrSnapshot, null, { timeout: 40000 });
    eq(await progress(page), after, '刷新后加点存档未保持');
    await done(); checks.push('P 开关、四维/素材、草稿加减、两步确认落盘、超支/减点拒绝、Esc/关闭丢稿、测试桥、刷新往返');
  }

  // 真键位与真实 NPC 菜单证明 modal 输入互斥；开关只在本测试浏览器内存启用。
  {
    const { page, done } = await session('modal');
    await page.evaluate(async () => { await window.__xt.setFlag('alchemyPhase1', true); await window.__xt.setFlag('shops', true); });
    await nearNpc(page); await open(page); await press(page, 'k'); await press(page, 'l'); await press(page, 'z');
    eq(await page.evaluate(() => ({ attr: window.__xt.attrSnapshot().open, skill: window.__scene.skillWindow.open,
      alchemy: window.__scene.alchemy.isOpen(), shop: window.__scene.shop.isOpen(), dialog: window.__scene.dialog.open })),
      { attr: true, skill: false, alchemy: false, shop: false, dialog: false }, '加点窗内 K/L/Z 打开了其他 modal');
    await press(page, 'Escape'); await press(page, 'k');
    eq(await page.evaluate(() => window.__scene.skillWindow.open), true, 'K 未开功法窗');
    await press(page, 'p'); eq((await snap(page)).open, false, '功法窗内 P 打开加点窗'); await press(page, 'Escape');
    await press(page, 'l'); eq(await page.evaluate(() => window.__scene.alchemy.isOpen()), true, 'L 未开炼丹窗');
    await press(page, 'p'); eq((await snap(page)).open, false, '炼丹窗内 P 打开加点窗'); await press(page, 'Escape');
    await nearNpc(page); await press(page, 'z');
    eq(await page.evaluate(() => window.__scene.dialog.open), true, 'Z 未打开真实 NPC 菜单');
    await press(page, 'p'); eq((await snap(page)).open, false, '对白内 P 打开加点窗');
    const index = await page.evaluate(label => window.__scene.dialog.choices.findIndex(choice => choice.label === label), strings['ui.shop.menu']);
    ok(index >= 0 && index < 5, '真实 NPC 菜单缺货架入口'); await press(page, String(index + 1));
    await page.waitForFunction(() => window.__scene.shop.isOpen(), null, { timeout: 3000 });
    await press(page, 'p'); eq((await snap(page)).open, false, '商店窗内 P 打开加点窗'); await press(page, 'Escape');
    // 首领死亡的真实 600ms 回调可在玩家开窗之后才触发；对白出现必须先关闭并丢弃草稿。
    const beforeBossDialog = await progress(page);
    const interrupted = await page.evaluate(def => {
      const scene = window.__scene;
      scene.onMobDead({ grantRewards: true, def: { ...def, exp: 0, dropTable: null } });
      window.__xt.openAttrPanel(); scene.attrPanel.adjust('insight', 1);
      return window.__xt.attrSnapshot();
    }, boss);
    ok(interrupted.open && interrupted.draft.insight === 1, '首领延时对白前未建立加点草稿');
    await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 5000 });
    const afterBossDialog = await snap(page);
    eq(afterBossDialog.open, false, '首领延时对白与加点窗重叠'); emptyDraft(afterBossDialog.draft);
    eq(await progress(page), beforeBossDialog, '首领延时对白关闭加点窗时结算了草稿');
    await page.evaluate(() => window.__scene.dialog.dismiss());
    await done(); checks.push('modal：加点中 K/L/Z 被拦，功法/炼丹/真实对白/商店中 P 被拦；真实首领延时对白关闭加点并丢稿');
  }

  // 清单缺图：全代码窗体仍能确认，原始 console.error/pageerror 均为零。
  {
    const { page, done } = await session('manifest-missing', { missing: WINDOW_ART });
    await open(page);
    let s = await snap(page);
    ok(Object.keys(s.artUsed).length >= 4 && Object.values(s.artUsed).every(value => value === 'code'),
      `清单缺图未全部代码回退：${JSON.stringify(s.artUsed)}`);
    await clickNamed(page, 'attr-rootBone-plus'); await press(page, 'Enter'); await press(page, 'Enter');
    eq((await progress(page)).unspent, points - 1, '代码窗体确认未结算');
    await shot(page, 'ui6_attr_missing_fallback');
    await done(); checks.push('清单缺图：全代码回退、确认可用、console.error=0/pageerror=0');
  }

  // G18：只拿走隔离 dist 的 PNG；清单仍入队，preview 200 HTML 解码失败静默回退。
  await withMissingFile('art/icons/ui/bestiary/ui_bestiary_window.png', async () => {
    const { page, done } = await session('g18-window-file-missing', { missingFile: 'art/icons/ui/bestiary/ui_bestiary_window.png' });
    await open(page);
    eq((await snap(page)).artUsed.ui_bestiary_window, 'code', 'G18 实体窗体缺图未代码回退');
    eq(await page.evaluate(() => window.__scene.textures.exists('ui_bestiary_window')), false, 'G18 实体缺图纹理仍存在');
    await clickNamed(page, 'attr-spirit-plus'); await press(page, 'Enter'); await press(page, 'Enter');
    eq((await progress(page)).unspent, points - 1, 'G18 确认未结算');
    await shot(page, 'ui6_attr_g18_window_missing');
    await done(); checks.push('G18：实体窗体 PNG 缺失/200 HTML、代码回退、结算可用、零报错、还原 PNG');
  });

  // G17：关闭钮缺图仍有真实可点击 ×，并且 Esc 可丢弃未确认草稿。
  await withMissingFile('art/icons/ui/bestiary/ui_bestiary_btn_close.png', async () => {
    const { page, done } = await session('g17-close-file-missing', { missingFile: 'art/icons/ui/bestiary/ui_bestiary_btn_close.png' });
    await open(page);
    eq((await snap(page)).artUsed.ui_bestiary_btn_close, 'code', 'G17 关闭钮未代码回退');
    await clickNamed(page, 'attr-insight-plus'); await shot(page, 'ui6_attr_g17_close_missing');
    ok(await page.evaluate(() => window.__scene.children.getByName('attr-panel').list.some(obj => obj.text === '×')),
      'G17 关闭钮缺代码画 × 文本');
    await clickNamed(page, 'attr-close');
    eq((await snap(page)).open, false, 'G17 点击 × 未关闭');
    await open(page); emptyDraft((await snap(page)).draft);
    await clickNamed(page, 'attr-agility-plus'); await press(page, 'Escape');
    eq((await snap(page)).open, false, 'G17 Esc 未关闭');
    eq((await progress(page)).unspent, points, 'G17 关闭仍结算草稿');
    await done(); checks.push('G17：关闭 PNG 缺失、真实 × 点击/Esc 丢稿、console.error=0/pageerror=0、还原 PNG');
  });
  console.log(JSON.stringify({ suite: 'attr-ui', passed: true, assertions, checks, shots: shotDir, pointsPerLevel: points,
    browserChecks, missingFileChecks }));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (isolated) await isolated.cleanup();
}
