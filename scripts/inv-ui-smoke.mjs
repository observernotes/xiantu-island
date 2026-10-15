// UI-7 背包/装备窗浏览器冒烟；独立快照工程构建/preview，不覆盖工作树 dist，也不在浏览器冒烟内执行 tsc。
// timeout 300s node scripts/inv-ui-smoke.mjs；XT_INV_UI_SHOTS 可覆盖默认截图目录。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { createRequire } from 'node:module';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createIsolatedBuild, childBuildEnv, preview } from './isolated-build.mjs';
import { inspectSharedPreview, installMissingManifest } from './shared-smoke-preview.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shotDir = process.env.XT_INV_UI_SHOTS ?? '/workspace/reports/ui7';
const items = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/items.json'), 'utf8'));
const materials = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/materials.json'), 'utf8'));
const strings = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/strings_zh.json'), 'utf8'));
const boss = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/monsters.json'), 'utf8'))
  .find(monster => monster.isBoss && monster.id !== 'demon_fox');
assert.ok(boss, '缺少用于首领延时对白的定义');
const WINDOW_ART = ['bestiary/ui_bestiary_window', 'bestiary/ui_bestiary_title', 'bestiary/ui_bestiary_inset',
  'bestiary/ui_bestiary_btn_close', 'bestiary/ui_bestiary_btn_close_hover', 'hud/ui_hud_slot',
  'alchemy/ui_alchemy_slot_empty', 'alchemy/ui_alchemy_btn_normal', 'alchemy/ui_alchemy_btn_disabled']
  .map(file => `art/icons/ui/${file}.png`);
const SAVE = { name: '背包冒烟修士', level: 10, exp: 0, hp: 50, mp: 10, stones: 1000, questRewardVersion: 1,
  inventory: { wood_sword: 1, bamboo_sword: 1, fox_robe: 1, cloth_shoes: 1, bronze_furnace: 1,
    five_sect_token: 1, hp_pill_small: 3, spirit_herb: 8, qi_pill: 0, robe_taixu_1: 1 },
  equip: { weapon: 'azure_steel_sword' }, learnedRecipes: ['recipe_hp_pill'], ageUpdatedAt: Date.now() };
let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (actual, message) => { assert.ok(actual, message); assertions++; };
const requiredStringKeys = [
  ...'title/tab_all/tab_equip/tab_consume/tab_material/tab_other/empty/stones/select/equip/furnace/token/held/equipped/unavailable/keys'
    .split('/').map(key => `ui.inv.${key}`),
  ...'title/base/weapon/robe/shoes/click/atk/def/hp/mp/speed/matk/removed/keys/reason_invalid/reason_missing/reason_sect/reason_level/reason_empty/reason_overflow/reason_save'
    .split('/').map(key => `ui.equip.${key}`),
];
for (const key of requiredStringKeys) ok(typeof strings[key] === 'string' && strings[key].length > 0, `快照缺少 UI-7 文案：${key}`);
const checks = [], missingFileChecks = {}, browserChecks = {};

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
  isolated = await createIsolatedBuild(projectRoot, 'inv-ui');
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
    const filtered = missing.length ? await installMissingManifest(context, manifest, missing) : undefined;
    await context.addInitScript(save => {
      if (location.protocol !== 'http:' && location.protocol !== 'https:') return;
      if (!sessionStorage.getItem('inv-seeded')) {
        localStorage.setItem('xiantu_save_v1', JSON.stringify(save)); sessionStorage.setItem('inv-seeded', '1');
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
    await page.waitForFunction(() => window.__scene?.player?.active && window.__scene.inventoryPanel && window.__xt?.inventorySnapshot,
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
  const inv = page => page.evaluate(() => window.__xt.inventorySnapshot());
  const equip = page => page.evaluate(() => window.__xt.equipSnapshot());
  const state = page => page.evaluate(() => {
    const s = window.__scene, p = s.prog, saved = JSON.parse(localStorage.getItem('xiantu_save_v1'));
    return { inventory: p.inventory, equip: p.equip, savedInventory: saved.inventory, savedEquip: saved.equip,
      appearance: p.appearance ?? null, playerHp: s.player.hp, hp: p.hp, playerMaxHp: s.player.maxHp, maxHp: p.maxHp };
  });
  const press = async (page, key) => {
    await page.waitForTimeout(150);
    const frame = await page.evaluate(() => window.__scene.game.loop.frame);
    // Phaser 的 keyup 会清除 JustDown；持键跨过实际 update，避免繁忙机器同帧按下/松开丢键。
    await page.keyboard.down(key);
    try { await page.waitForFunction(frame => window.__scene.game.loop.frame > frame + 1, frame, { timeout: 5000 }); }
    finally { await page.keyboard.up(key); }
    await page.waitForTimeout(120);
  };
  async function click(page, panel, name) {
    const hit = await page.evaluate(({ panel, name }) => {
      const object = window.__scene.children.getByName(`${panel}-panel`)?.getByName(name), bounds = object?.getBounds();
      return object && bounds ? { enabled: !!object.input?.enabled, x: bounds.centerX, y: bounds.centerY } : null;
    }, { panel, name });
    ok(hit?.enabled, `${panel} 缺可点击 ${name}`);
    await page.mouse.click(hit.x, hit.y); await page.waitForTimeout(100);
  }
  async function open(page, key = 'i') {
    await press(page, key);
    await page.waitForFunction(key => key === 'i' ? window.__xt.inventorySnapshot().open : window.__xt.equipSnapshot().open,
      key, { timeout: 5000 });
    eq(key === 'i' ? (await inv(page)).open : (await equip(page)).open, true, `${key} 未开窗`);
  }
  async function select(page, id) { await click(page, 'inventory', `inventory-item-${id}`); }
  async function use(page, id) { await select(page, id); await click(page, 'inventory', 'inventory-activate'); }
  async function nearNpc(page, id = 'grocer_wang') {
    ok(await page.evaluate(id => {
      const s = window.__scene, npc = s.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === id);
      s.player.body.reset(npc.x, npc.y); s.player.body.setVelocity(0, 0); return s.nearNpc() === id;
    }, id), `未到 ${id} 实际点位`);
  }

  // 真实 I/E 与鼠标；检查强装可换弱装、数量、存档、派生属性、外观/HP 回调与读档。
  {
    const { page, done } = await session('inventory-equip');
    await open(page);
    let s = await inv(page);
    eq([s.position.width, s.position.height], [360, 440], '背包窗尺寸');
    ok(s.rows.every(row => row.count > 0) && !s.rows.some(row => row.id === 'qi_pill'), '背包显示了零库存');
    ok(['ui_bestiary_window', 'ui_bestiary_title', 'ui_bestiary_inset', 'ui_bestiary_btn_close', 'ui_hud_slot']
      .every(key => s.artUsed[key] === 'art'), '背包未使用精修窗体/格子');
    eq(await page.evaluate(() => window.__scene.invText.visible), false, 'I 仍打开旧文字背包');
    eq(await page.evaluate(() => {
      const panel = window.__scene.children.getByName('inventory-panel');
      return panel.list.filter(o => o.name.startsWith('inventory-item-')).map(o => [o.x, o.y]).slice(0, 7);
    }), [[22, 64], [74, 64], [126, 64], [178, 64], [230, 64], [282, 64], [22, 116]], '格子起点/六列/间距');
    await shot(page, 'ui7_inventory_open');
    for (const tab of ['equip', 'consume', 'material', 'other']) {
      await click(page, 'inventory', `inventory-tab-${tab}`); s = await inv(page);
      ok(s.rows.length > 0, `${tab} 夹具没有实际物品`);
      ok(s.rows.every(row => tab === 'other' ? !['equip', 'consume', 'material'].includes(row.type) : row.type === tab), `${tab} 分类错误`);
    }
    await click(page, 'inventory', 'inventory-tab-all');
    await use(page, 'wood_sword');
    let p = await state(page);
    eq(p.equip.weapon, 'wood_sword', '未穿上较弱的桃木剑'); eq(p.inventory.wood_sword, 0, '穿戴未扣一件');
    eq(p.inventory.azure_steel_sword, 1, '换下旧剑未回包'); eq(p.savedEquip, p.equip, '穿戴未写档');
    eq(p.savedInventory, p.inventory, '库存未写档');
    await use(page, 'fox_robe'); await use(page, 'cloth_shoes');
    p = await state(page); eq(p.appearance, 'fox_robe', '狐裘外观 getter 未刷新');
    eq([p.playerHp, p.playerMaxHp], [p.hp, p.maxHp], '穿戴后场景 HP 未同步');
    await shot(page, 'ui7_inventory_equipped');
    await open(page, 'e'); eq((await inv(page)).open, false, 'E 未关闭背包');
    s = await equip(page); eq([s.position.width, s.position.height], [300, 330], '装备窗尺寸');
    eq(s.slots.map(row => row.id), ['wood_sword', 'fox_robe', 'cloth_shoes'], '装备三槽');
    eq(s.attributes, await page.evaluate(() => {
      const p = window.__scene.prog;
      return { atk: p.atk, def: p.def, hp: p.maxHp, mp: p.maxMp, speed: p.currentMovePoints().speed, matk: p.matk };
    }), '装备窗没有只读 Progress 派生值');
    await shot(page, 'ui7_equip_open');
    await page.evaluate(() => { const s = window.__scene; s.prog.hp = s.player.hp = s.prog.maxHp; });
    await click(page, 'equip', 'equip-slot-robe');
    p = await state(page); eq(p.appearance, null, '卸下后外观未清除');
    eq(p.inventory.fox_robe, 1, '卸下未入包'); eq(p.equip.robe, undefined, '卸下未清槽');
    eq([p.hp, p.playerHp, p.playerMaxHp], [p.maxHp, p.maxHp, p.maxHp], '卸下气血上限未同步');
    eq(p.savedEquip, p.equip, '卸下未保存');
    ok((await equip(page)).artUsed.ui_alchemy_slot_empty === 'art', '空装备格未复用素材');
    await click(page, 'equip', 'equip-slot-robe'); eq((await equip(page)).statusOk, false, '空槽无失败提示');
    await shot(page, 'ui7_equip_removed');
    await press(page, 'e'); eq((await equip(page)).open, false, 'E 未切换关闭');
    await open(page); await use(page, 'robe_taixu_1'); eq((await inv(page)).statusOk, false, '异宗装备无失败提示');
    await click(page, 'inventory', 'inventory-close'); eq((await inv(page)).open, false, '关闭钮未关闭');
    const beforeReload = await state(page);
    await page.reload({ waitUntil: 'load' });
    await page.waitForFunction(() => window.__scene?.inventoryPanel && window.__xt?.inventorySnapshot, null, { timeout: 40000 });
    const reloaded = await state(page);
    eq(reloaded.equip, beforeReload.equip, '装备刷新丢失'); eq(reloaded.inventory, beforeReload.inventory, '库存刷新丢失');
    await page.evaluate(() => window.__xt.openInventoryPanel()); eq((await inv(page)).open, true, '背包测试桥未开窗');
    await page.evaluate(() => window.__xt.openEquipPanel()); eq((await equip(page)).open, true, '装备测试桥未开窗');
    eq((await inv(page)).open, false, '桥接入口未互斥');
    await press(page, 'Escape'); eq((await equip(page)).open, false, '装备 Esc 未关闭');
    await done(); checks.push('I/E/关闭/Esc、布局/素材/分类、弱装替换、三槽穿脱/数量/存档、派生值/HP/外观、桥接与刷新');
  }

  // 分页使用真实物品目录，空包和缺图标均不能进入无效操作。
  {
    const catalog = [...new Set([...items, ...materials].map(row => row.id))];
    ok(catalog.length > 36, '分页夹具缺少 37 件物品');
    const { page, done } = await session('pagination', { save: { ...SAVE,
      inventory: Object.fromEntries(catalog.map((id, i) => [id, i + 1])) } });
    await open(page);
    const count = (await inv(page)).rows.length;
    await click(page, 'inventory', 'inventory-next');
    eq((await inv(page)).page, 1, '下一页未翻页');
    await shot(page, 'ui7_inventory_page2');
    await press(page, 'PageUp'); eq((await inv(page)).page, 0, 'PageUp 未翻页');
    await press(page, 'Tab'); eq((await inv(page)).tab, 'equip', 'Tab 未切分类');
    await page.evaluate(() => { window.__scene.prog.inventory = {}; });
    await page.waitForTimeout(150); eq((await inv(page)).rows, [], '空包未刷新');
    eq((await inv(page)).selectedId, null, '空包仍有无效选择');
    await shot(page, 'ui7_inventory_empty');
    await done(); checks.push(`分页/键盘分类、空包；${count} 种物品不受 36 格截断`);
  }

  // 真键位互斥、停止移动/取消采集、持有丹炉与五宗令入口；延迟对白先收窗。
  {
    const { page, done } = await session('modal-and-entries');
    await page.evaluate(() => { window.__xt.setFlag('alchemyPhase1', true); window.__xt.setFlag('shops', true); });
    await nearNpc(page); await open(page);
    for (const key of ['k', 'l', 'p']) await press(page, key);
    eq(await page.evaluate(() => ({ inv: window.__xt.inventorySnapshot().open, skill: window.__scene.skillWindow.open,
      attr: window.__scene.attrPanel.isOpen(), alchemy: window.__scene.alchemy.isOpen(), shop: window.__scene.shop.isOpen() })),
      { inv: true, skill: false, attr: false, alchemy: false, shop: false }, '背包内 K/L/P 打开了其他 modal');
    const x = await page.evaluate(() => window.__scene.player.x);
    await press(page, 'ArrowRight');
    ok(Math.abs(await page.evaluate(() => window.__scene.player.x) - x) < 1, '背包中仍水平移动');
    await use(page, 'bronze_furnace');
    eq(await page.evaluate(() => window.__scene.alchemy.isOpen()), true, '背包未使用持有丹炉');
    eq((await inv(page)).open, false, '炼丹打开后背包未收起');
    for (const key of ['i', 'e']) await press(page, key);
    eq([(await inv(page)).open, (await equip(page)).open], [false, false], '炼丹中可开 I/E');
    await press(page, 'Escape'); await open(page); await use(page, 'five_sect_token');
    eq(await page.evaluate(() => window.__scene.dialog.open), true, '五宗令未打开选择');
    eq((await inv(page)).open, false, '五宗令选择与背包重叠');
    for (const key of ['i', 'e']) await press(page, key);
    eq([(await inv(page)).open, (await equip(page)).open], [false, false], '对白中可开 I/E');
    await press(page, 'Escape'); await press(page, 'p');
    for (const key of ['i', 'e']) await press(page, key);
    eq([(await inv(page)).open, (await equip(page)).open], [false, false], '加点中可开 I/E');
    await press(page, 'Escape'); await press(page, 'k');
    for (const key of ['i', 'e']) await press(page, key);
    eq([(await inv(page)).open, (await equip(page)).open], [false, false], '功法中可开 I/E');
    await press(page, 'Escape'); await nearNpc(page); await press(page, 'z');
    const index = await page.evaluate(label => window.__scene.dialog.choices.findIndex(choice => choice.label === label), strings['ui.shop.menu']);
    ok(index >= 0 && index < 5, '真实 NPC 菜单缺少商店'); await press(page, String(index + 1));
    await page.waitForFunction(() => window.__scene.shop.isOpen(), null, { timeout: 3000 });
    for (const key of ['i', 'e']) await press(page, key);
    eq([(await inv(page)).open, (await equip(page)).open], [false, false], '商店中可开 I/E');
    await press(page, 'Escape');
    eq(await page.evaluate(() => {
      const s = window.__scene, previous = s.sectTrial; s.sectTrial = { blocksInput: true };
      try { return [window.__xt.openInventoryPanel().open, window.__xt.openEquipPanel().open]; } finally { s.sectTrial = previous; }
    }), [false, false], '试炼 blocksInput 未阻止 I/E 入口');
    // 开窗调用真实 gathering.cancel：包装只计数，原函数照常执行。
    eq(await page.evaluate(() => {
      const s = window.__scene, original = s.gathering.cancel; let calls = 0;
      s.gathering.cancel = function () { calls++; return original.call(this); };
      s.player.body.setVelocityX(80); window.__xt.openInventoryPanel();
      const result = [calls, s.player.body.velocity.x]; s.gathering.cancel = original; return result;
    }), [1, 0], '开窗未取消采集/停水平速度');
    await press(page, 'Escape');
    for (const panel of ['inventory', 'equip']) {
      await page.evaluate(({ boss, panel }) => {
        const s = window.__scene; s.onMobDead({ grantRewards: true, def: { ...boss, exp: 0, dropTable: null } });
        if (panel === 'inventory') window.__xt.openInventoryPanel(); else window.__xt.openEquipPanel();
      }, { boss, panel });
      await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 5000 });
      eq([(await inv(page)).open, (await equip(page)).open], [false, false], '首领延时对白未先关闭背包/装备');
      await page.evaluate(() => window.__scene.dialog.dismiss());
    }
    await done(); checks.push('modal 真键位/试炼门禁、开窗停移动/取消采集、丹炉/五宗令入口、首领延时对白');
  }

  // 清单缺图 + 图标缺帧：背包/装备全部代码回退，穿脱仍保存。
  {
    const { page, done } = await session('all-code', { missing: WINDOW_ART });
    await page.evaluate(() => { window.__scene.textures.remove('icons_items'); });
    await open(page);
    ok(Object.values((await inv(page)).artUsed).every(value => value === 'code'), '背包未全部代码回退');
    await use(page, 'fox_robe'); eq((await state(page)).equip.robe, 'fox_robe', '代码背包未穿上');
    await shot(page, 'ui7_inventory_all_code');
    await open(page, 'e');
    ok(Object.values((await equip(page)).artUsed).every(value => value === 'code'), '装备未全部代码回退');
    await click(page, 'equip', 'equip-slot-robe'); eq((await state(page)).inventory.fox_robe, 1, '代码装备未卸下');
    await shot(page, 'ui7_equip_all_code');
    await done(); checks.push('清单缺图/缺图标：背包装备全部代码回退、穿脱保存、console.error=0/pageerror=0');
  }

  // G17/G18：只移走隔离 dist 的实体 PNG，保留清单入队并覆盖 200 HTML 解码失败路径。
  for (const [gate, key] of [['g17', 'ui_bestiary_btn_close'], ['g18', 'ui_bestiary_window']]) {
    const file = `art/icons/ui/bestiary/${key}.png`;
    await withMissingFile(file, async () => {
      const { page, done } = await session(`${gate}-file-missing`, { missingFile: file });
      await open(page);
      eq((await inv(page)).artUsed[key], 'code', `${gate} 背包未回退`);
      await use(page, 'fox_robe'); await shot(page, `ui7_inventory_${gate}_missing`);
      await click(page, 'inventory', 'inventory-close'); eq((await inv(page)).open, false, `${gate} 背包关闭钮无效`);
      await open(page, 'e'); eq((await equip(page)).artUsed[key], 'code', `${gate} 装备未回退`);
      await click(page, 'equip', 'equip-slot-robe'); await shot(page, `ui7_equip_${gate}_missing`);
      if (gate === 'g17') ok(await page.evaluate(() => window.__scene.children.getByName('equip-panel').list.some(o => o.text === '×')), 'G17 缺少代码 ×');
      await click(page, 'equip', 'equip-close'); eq((await equip(page)).open, false, `${gate} 装备关闭钮无效`);
      await open(page); await press(page, 'Escape'); eq((await inv(page)).open, false, `${gate} Esc 无效`);
      await done(); checks.push(`${gate.toUpperCase()} 实体 PNG 缺失：两窗代码回退/穿脱/关闭/Esc/零报错/还原 PNG`);
    });
  }
  console.log(JSON.stringify({ suite: 'inv-ui', passed: true, assertions, checks, shots: shotDir, browserChecks, missingFileChecks }));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (isolated) await isolated.cleanup();
}
