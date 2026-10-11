// UI-5 商店窗冒烟：timeout 300s node scripts/shop-ui-smoke.mjs（自行 sync + 测试构建到临时目录，不覆盖 dist）。
// 覆盖：发版开关关闭、购买（数量/确认/重放去重）、灵石不足、出售、目录变动重验、打开中关开关、宗门商店/藏经阁窗体、窗体缺图回退。
// 商店开关与宗门货架只在浏览器内存里打开；正式 features.json、shops.json 与交易逻辑不改。
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { createRequire } from 'node:module';
import { createServer } from 'vite';
import { findRoot } from './root.mjs';
import { preview } from './isolated-build.mjs';
import { inspectSharedPreview, installMissingManifest } from './shared-smoke-preview.mjs';

const projectRoot = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dataRoot = findRoot(projectRoot);
const readTable = async name => JSON.parse(await fs.readFile(path.join(dataRoot, `balance/${name}.json`), 'utf8'));
const [strings, itemRows, materialRows, shops, ranks] = await Promise.all(['strings_zh', 'items', 'materials', 'shops', 'sect_ranks'].map(readTable));
const snapshotStrings = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/balance/strings_zh.json'), 'utf8'));
const SHOP_STRING_KEYS = ['ui.shop.title', 'ui.shop.balance', 'ui.shop.quantity', 'ui.shop.total', 'ui.shop.unit_price',
  'ui.shop.held', 'ui.shop.req_rank', 'ui.shop.max', 'ui.shop.exchange', 'ui.shop.keys', 'ui.shop.changed',
  'ui.shop.price_stones', 'ui.shop.price_contribution'];
const formatString = (key, vars = {}) => strings[key].replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
const features = JSON.parse(await fs.readFile(path.join(projectRoot, 'data/features.json'), 'utf8'));
const ITEMS = Object.fromEntries([...itemRows, ...materialRows].map(item => [item.id, item]));
const shotDir = process.env.XT_SHOP_UI_SHOTS ?? path.join(projectRoot, 'dist/shop-ui-shots');
const WINDOW_ART = ['bestiary/ui_bestiary_window', 'bestiary/ui_bestiary_title', 'bestiary/ui_bestiary_inset', 'bestiary/ui_bestiary_btn_close',
  'bestiary/ui_bestiary_btn_close_hover', 'bestiary/ui_bestiary_tab', 'bestiary/ui_bestiary_tab_active',
  'alchemy/ui_alchemy_list_row_normal', 'alchemy/ui_alchemy_list_row_selected', 'alchemy/ui_alchemy_list_row_disabled',
  'alchemy/ui_alchemy_btn_normal', 'alchemy/ui_alchemy_btn_hover', 'alchemy/ui_alchemy_btn_pressed', 'alchemy/ui_alchemy_btn_disabled']
  .map(file => `art/icons/ui/${file}.png`);
const grocer = 'grocer_wang', doctor = 'doctor_sun';
const buyItem = shops[grocer].find(id => Number.isInteger(ITEMS[id]?.price) && ITEMS[id].price > 0);
const sellItem = shops[doctor].find(id => Number.isInteger(ITEMS[id]?.price) && Math.floor(ITEMS[id].price / 2) > 0);
assert.ok(buyItem && sellItem, '货架缺可用于冒烟的有价商品');
const buyPrice = ITEMS[buyItem].price, sellPrice = Math.floor(ITEMS[sellItem].price / 2);
assert.equal(features.shops, false, '正式 shops 开关必须保持关闭');

let assertions = 0;
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); assertions++; };
const ok = (value, message) => { assert.ok(value, message); assertions++; };
const passed = [];
for (const key of SHOP_STRING_KEYS) {
  ok(Object.hasOwn(strings, key) && typeof strings[key] === 'string', `运行时文案表缺 ${key}`);
  ok(Object.hasOwn(snapshotStrings, key) && typeof snapshotStrings[key] === 'string', `快照文案表缺 ${key}`);
  eq(snapshotStrings[key], strings[key], `快照与运行时文案不一致：${key}`);
}
passed.push('13 条商店文案：运行时表与快照齐全且一致');

async function checkLabelFallback() {
  // SSR 只替换未使用的 Phaser 绘图依赖；调用真实 title/priceText -> label -> t，不读取或匹配源码。
  const loader = await createServer({ configFile: false, root: projectRoot,
    resolve: { alias: { '@xt': dataRoot } }, server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'shop-label-render-stub', enforce: 'pre',
      resolveId(id) { if (id === 'phaser') return '\0shop-label-phaser'; },
      load(id) { if (id === '\0shop-label-phaser') return 'export default {};'; },
    }], ssr: { noExternal: ['phaser'] } });
  try {
    const { ShopPanel } = await loader.ssrLoadModule('/src/ShopPanel.ts');
    const { t } = await loader.ssrLoadModule('/src/data.ts');
    const { default: table } = await loader.ssrLoadModule(path.join(dataRoot, 'balance/strings_zh.json'));
    const panel = Object.assign(Object.create(ShopPanel.prototype), { target: { kind: 'ordinary', npcId: grocer, mode: 'buy' } });
    const original = Object.fromEntries(['ui.shop.title', 'ui.shop.price_stones'].map(key => [key, table[key]]));
    try {
      // 只改变 SSR 的内存表；磁盘数据与浏览器构建均不受影响，结束时恢复。
      table['ui.shop.title'] = '表内货摊：{npc}';
      eq(panel.title(), '表内货摊：王婶', 'label 未优先使用表内文案');
      for (const key of Object.keys(original)) delete table[key];
      eq(t('ui.shop.title'), 'ui.shop.title', '缺 key 时 t 未返回 key 本身');
      eq(panel.title(), '王婶的货摊', '缺标题 key 时 label 未退回中文兜底/npc');
      eq(t('ui.shop.price_stones', { n: 37 }), 'ui.shop.price_stones', '缺价格 key 时 t 未返回 key 本身');
      eq(panel.priceText(37), '37 灵石', '缺价格 key 时 label 未退回中文兜底/n');
    } finally { Object.assign(table, original); }
    passed.push('文案优先/缺 key：真实 label/t 路径与中文兜底插值');
  } finally { await loader.close(); }
}

async function loadPlaywright() {
  for (const candidate of [process.env.PLAYWRIGHT_MODULE, 'playwright', 'playwright-core', '/tmp/pwt/node_modules/playwright-core/index.mjs'].filter(Boolean)) {
    try { return await import(path.isAbsolute(candidate) ? pathToFileURL(candidate).href : candidate); } catch { /* 下一个 */ }
  }
  throw new Error('未找到 Playwright；请设置 PLAYWRIGHT_MODULE');
}
async function browserPath(chromium) {
  for (const candidate of [process.env.CHROMIUM_EXECUTABLE_PATH, chromium.executablePath(), '/usr/bin/google-chrome', '/usr/bin/chromium'].filter(Boolean))
    try { await fs.access(candidate); return candidate; } catch { /* 下一个 */ }
  throw new Error('未找到 Chromium');
}
function build(outDir) {
  const require = createRequire(import.meta.url);
  const vite = path.join(path.dirname(require.resolve('vite/package.json')), 'bin/vite.js');
  for (const [cmd, args, env] of [[process.execPath, ['scripts/sync.mjs'], {}], [process.execPath, [vite, 'build', '--outDir', outDir, '--emptyOutDir', '--logLevel', 'error'], { VITE_XT_TEST: '1' }]]) {
    const r = spawnSync(cmd, args, { cwd: projectRoot, env: { ...process.env, ...env }, encoding: 'utf8' });
    assert.equal(r.status, 0, `${args.join(' ')} 失败\n${r.stdout}\n${r.stderr}`);
  }
}
const SAVE = { name: '商店冒烟修士', level: 30, exp: 0, hp: 0, mp: 0, job: 'tianjian_disciple', sectRank: 'outer_disciple', sectContribution: 50,
  stones: 1000, questRewardVersion: 1, inventory: { [sellItem]: 5 }, quests: { q_fox: { state: 'done', kills: {} } }, ageUpdatedAt: Date.now() };

let browser, server, outDir;
try {
  outDir = await fs.mkdtemp(path.join(os.tmpdir(), 'xiantu-shop-ui-'));
  build(outDir);
  await checkLabelFallback();
  await fs.mkdir(shotDir, { recursive: true });
  server = await preview({ root: projectRoot, build: { outDir }, preview: { port: Number(process.env.SMOKE_PORT ?? 0) } });
  const baseURL = server.resolvedUrls.local[0];
  const manifest = (await inspectSharedPreview(baseURL)).manifest;
  const api = await loadPlaywright();
  browser = await api.chromium.launch({ executablePath: await browserPath(api.chromium), headless: true, timeout: 20000,
    args: ['--use-gl=swiftshader', '--enable-unsafe-swiftshader'] });

  async function session(label, { missing = [], save = SAVE, map = 'qingyun_village' } = {}) {
    const context = await browser.newContext({ viewport: { width: 1280, height: 720 }, timezoneId: 'Asia/Shanghai' });
    if (missing.length) await installMissingManifest(context, manifest, missing);
    await context.addInitScript(save => { if (!sessionStorage.getItem('shop-seeded')) {
      localStorage.setItem('xiantu_save_v1', JSON.stringify(save)); sessionStorage.setItem('shop-seeded', '1'); } }, save);
    const page = await context.newPage();
    const errors = { console: [], page: [], request: [], http: [] };
    page.on('console', m => { if (m.type() === 'error') errors.console.push(m.text()); });
    page.on('pageerror', e => errors.page.push(e.message));
    page.on('requestfailed', r => errors.request.push(r.url()));
    page.on('response', r => { if (r.status() >= 400) errors.http.push(`${r.status()} ${r.url()}`); });
    const url = new URL(baseURL); url.searchParams.set('map', map);
    await page.goto(url.href, { waitUntil: 'load', timeout: 60000 });
    await page.waitForFunction(id => { const s = window.__scene; return s?.map?.id === id && s.player?.active && s.dialog && s.shop && window.__xt; }, map, { timeout: 40000 });
    await page.waitForTimeout(400);
    const done = async () => {
      eq({ console: errors.console, page: errors.page, request: errors.request, http: errors.http },
        { console: [], page: [], request: [], http: [] }, `${label}: 浏览器出现报错`);
      await context.close();
    };
    return { page, done };
  }
  const shot = (page, name) => page.screenshot({ path: path.join(shotDir, `${name}.png`) });
  const snap = page => page.evaluate(() => window.__scene.shop.snapshot());
  const shopText = (page, name) => page.evaluate(name => window.__scene.children.getByName('shop-panel').getByName(name).text, name);
  const wallet = (page, item) => page.evaluate(item => ({ stones: window.__scene.prog.stones, count: window.__scene.prog.count(item),
    contribution: window.__scene.prog.sectContribution, saved: JSON.parse(localStorage.getItem('xiantu_save_v1')).stones }), item);
  const press = async (page, key, times = 1) => { for (let i = 0; i < times; i++) {
    await page.keyboard.down(key); await page.waitForTimeout(60); await page.keyboard.up(key); await page.waitForTimeout(60); } };
  async function talkMenu(page, npcId) {
    const near = await page.evaluate(npcId => {
      const s = window.__scene; s.dialog.close();
      const o = s.map.objects.find(o => o.type === 'npc' && (o.props.npc ?? o.name) === npcId);
      s.player.body.reset(o.x, o.y); s.player.body.setVelocity(0, 0);
      return s.nearNpc() === npcId;
    }, npcId);
    ok(near, `${npcId} 不在真实点位`);
    await press(page, 'z');
    await page.waitForFunction(() => window.__scene.dialog.open, null, { timeout: 3000 });
    return page.evaluate(() => window.__scene.dialog.choices.map(c => c.label));
  }
  async function chooseMenu(page, label) {
    const index = await page.evaluate(label => window.__scene.dialog.choices.findIndex(c => c.label === label), label);
    ok(index >= 0 && index < 5, `菜单缺 ${label}`);
    await press(page, String(index + 1));
    await page.waitForFunction(() => window.__scene.shop.isOpen() || window.__scene.dialog.open, null, { timeout: 3000 });
    await page.waitForTimeout(250);
  }

  // 1. 正式开关关闭：NPC 无货架入口，直接调用也只提示暂未开放，余额不变。
  {
    const { page, done } = await session('shops-off');
    const before = await wallet(page, buyItem);
    const menu = await talkMenu(page, grocer);
    ok(!menu.includes(strings['ui.shop.menu']), '关闭时仍显示看看货架');
    await page.evaluate(() => window.__scene.dialog.close());
    const off = await page.evaluate(() => { const s = window.__scene; s.openOrdinaryShop('grocer_wang');
      const r = { open: s.shop.isOpen(), text: s.dialog.body.text }; s.dialog.close();
      s.openSectCatalog('tianjian_envoy_sect', 'sect_shop'); r.sectOpen = s.shop.isOpen(); return r; });
    eq([off.open, off.sectOpen], [false, false], '开关关闭仍打开商店窗');
    ok(off.text.includes('暂未开放'), '开关关闭没有暂未开放提示');
    await page.waitForTimeout(200); await shot(page, 'ui5_shops_off');
    eq(await wallet(page, buyItem), before, '开关关闭改变余额');
    await done(); passed.push('shops=false：无入口、窗不打开、提示暂未开放');
  }

  // 2. 购买 + 灵石不足 + 出售 + 重验 + 中途关开关（精修窗体）。
  {
    const { page, done } = await session('ordinary');
    await page.evaluate(() => window.__xt.setFlag('shops', true));
    const menu = await talkMenu(page, grocer);
    ok(menu.includes(strings['ui.shop.menu']), '开启后无看看货架');
    await chooseMenu(page, strings['ui.shop.menu']);
    let s = await snap(page);
    eq([s.open, s.mode, s.target.npcId], [true, 'buy', grocer], '未打开王婶购买窗');
    eq(await shopText(page, 'shop-title'), formatString('ui.shop.title', { npc: '王婶' }), '商店标题未使用表内文案/npc');
    eq(await shopText(page, 'shop-balance'), formatString('ui.shop.balance', { n: (await wallet(page, buyItem)).stones }), '灵石余额未使用表内文案/n');
    ok((await shopText(page, 'shop-keys')).startsWith(strings['ui.shop.keys']), '按键提示未使用表内文案');
    ok(Object.values(s.artUsed).every(v => v === 'art') && Object.keys(s.artUsed).length >= 6, `精修窗体未全部使用：${JSON.stringify(s.artUsed)}`);
    const index = s.rows.findIndex(r => r.itemId === buyItem);
    eq(s.rows[index].price, buyPrice, '列表价格不读 item.price');
    await press(page, 'ArrowDown', index);
    await press(page, 'ArrowRight', 2);
    s = await snap(page);
    eq([s.rows[s.selected].itemId, s.quantity], [buyItem, 3], '方向键选货/数量失败');
    eq(await shopText(page, 'shop-total'), `${strings['ui.shop.total']}：${formatString('ui.shop.price_stones', { n: s.rows[s.selected].price * s.quantity })}`, '合计/灵石价格未使用表内文案/n');
    await shot(page, 'ui5_buy_list');
    const before = await wallet(page, buyItem);
    await press(page, 'Enter');
    s = await snap(page);
    ok(s.pending && s.pending.count === 3 && s.pending.transactionId.startsWith('sect:'), '确认未生成交易 ID');
    await shot(page, 'ui5_buy_confirm');
    const pending = s.pending;
    await press(page, 'Enter');
    let after = await wallet(page, buyItem);
    eq([after.stones, after.count, after.saved], [before.stones - buyPrice * 3, before.count + 3, before.stones - buyPrice * 3], '购买 3 件结算错误');
    s = await snap(page);
    ok(s.statusOk && s.status.includes(ITEMS[buyItem].name), '购买成功提示缺失');
    await shot(page, 'ui5_buy_done');
    const replay = await page.evaluate(p => window.__scene.shop.commit(p), pending);
    ok(replay.ok && replay.repeated, '同一确认重放未被收据去重');
    eq(await wallet(page, buyItem), after, '重放重复扣款');

    // 灵石不足：数量上限压到可买数，余额不足时确认禁用并提示。
    await page.evaluate(price => { const s = window.__scene; s.prog.stones = price - 1; s.prog.save(); s.shop.close(); s.openOrdinaryShop('grocer_wang'); }, buyPrice);
    await page.waitForTimeout(150);
    await press(page, 'ArrowDown', index);
    s = await snap(page);
    eq([s.check.ok, s.check.reason, s.rows[index].ok, s.rows[index].key], [false, strings['ui.shop.not_enough'], false, 'ui.shop.not_enough'], '灵石不足未提示');
    eq(await page.evaluate(() => window.__scene.shop.requestConfirm()), null, '灵石不足仍可确认');
    eq(await page.evaluate(() => !!window.__scene.children.getByName('shop-panel').getByName('shop-confirm')), false, '灵石不足时确认钮仍可点');
    await shot(page, 'ui5_not_enough');
    eq((await wallet(page, buyItem)).stones, buyPrice - 1, '灵石不足改变余额');
    // 数量上限受余额约束
    await page.evaluate(price => { window.__scene.prog.stones = price * 2 + 1; window.__scene.shop.select(window.__scene.shop.snapshot().selected); }, buyPrice);
    await press(page, 'ArrowRight', 5);
    eq((await snap(page)).quantity, 2, '数量上限没有按余额约束');

    // 出售：孙郎中回收价 floor(price/2)，数量选择后一次结算。
    await page.evaluate(() => { const s = window.__scene; s.shop.close(); s.prog.stones = 100; s.prog.save(); });
    await talkMenu(page, doctor);
    await chooseMenu(page, strings['ui.shop.menu']);
    await press(page, 'Tab');
    s = await snap(page);
    const sellIndex = s.rows.findIndex(r => r.itemId === sellItem);
    eq([s.mode, s.rows[sellIndex].price, s.rows[sellIndex].held], ['sell', sellPrice, 5], '出售目录价格/持有数错误');
    await press(page, 'ArrowDown', sellIndex); await press(page, 'ArrowRight');
    const beforeSell = await wallet(page, sellItem);
    await press(page, 'Enter'); await shot(page, 'ui5_sell_confirm'); await press(page, 'Enter');
    after = await wallet(page, sellItem);
    eq([after.stones, after.count], [beforeSell.stones + sellPrice * 2, beforeSell.count - 2], '出售 2 件结算错误');
    await shot(page, 'ui5_sell_done');

    // 确认后目录变化（持有数变了）→ 不结算，刷新货架提示重新确认。
    await press(page, 'Enter');
    const stale = await page.evaluate(item => { const s = window.__scene; s.prog.addItem(item, 1); const r = s.shop.commit(); return { r, snap: s.shop.snapshot() }; }, sellItem);
    eq([stale.r.ok, stale.r.key, stale.snap.pending], [false, 'ui.shop.changed', null], '目录变化未重验');
    eq(stale.snap.status, strings['ui.shop.changed'], '目录变化提示未使用表内文案');
    eq((await wallet(page, sellItem)).stones, after.stones, '目录变化仍结算');

    // 打开中关开关：窗口收起，缓存的确认也不能结算。
    await press(page, 'Enter');
    const cached = (await snap(page)).pending;
    await page.evaluate(() => window.__xt.setFlag('shops', false)); await page.waitForTimeout(200);
    eq((await snap(page)).open, false, '关开关后窗口未收起');
    const blocked = await page.evaluate(p => { const r = window.__scene.shop.commit(p); const text = window.__scene.dialog.body.text; window.__scene.dialog.close(); return { r, text }; }, cached);
    eq(blocked.r.ok, false, '关开关后缓存确认仍结算'); ok(blocked.text.includes('暂未开放'), '关开关后无提示');
    eq((await wallet(page, sellItem)).stones, after.stones, '关开关后余额变化');
    await done(); passed.push('普通买卖：列表/价格/数量/确认/重放去重/灵石不足/出售/重验/中途关闭');
  }

  // 3. 宗门商店与藏经阁：内存夹具开放货架，只扣贡献、职位不足灰显。
  {
    const { page, done } = await session('sect', { map: 'tianjian_sect' });
    await page.evaluate(() => { for (const f of ['shops', 'sectRanks', 'sectShopLibrary']) window.__xt.setFlag(f, true); });
    const goods = shops.tianjian_envoy_sect.map(g => ({ ...g, enabled: !!ITEMS[g.item] }));
    const library = shops.tianjian_elder.map(g => ({ ...g, enabled: !!ITEMS[g.item] }));
    await page.evaluate(({ ranks, goods, library }) => {
      const s = window.__scene, g = s.sectGrowth;
      s.sectGrowth = new g.constructor(s.prog, { ...g.config, ranks: { ...ranks, enabled: true },
        shops: { ...g.config.shops, tianjian_envoy_sect: goods, tianjian_elder: library } });
    }, { ranks, goods, library });
    await page.evaluate(() => window.__scene.openSectCatalog('tianjian_envoy_sect', 'sect_shop'));
    let s = await snap(page);
    eq([s.open, s.mode, s.maxQuantity], [true, 'exchange', 1], '宗门商店窗未打开');
    const open = s.rows.findIndex(r => r.ok), locked = s.rows.findIndex(r => !r.ok);
    ok(open >= 0 && locked >= 0, `宗门货架夹具不完整：${JSON.stringify(s.rows)}`);
    await press(page, 'ArrowDown', locked);
    s = await snap(page);
    eq(s.check.ok, false, '职位不足未禁用'); ok(s.check.reason.length > 0, '职位不足缺原因');
    await shot(page, 'ui5_sect_shop_locked');
    await page.evaluate(i => window.__scene.shop.select(i), open);
    const row = (await snap(page)).rows[open];
    const before = await wallet(page, row.itemId);
    await press(page, 'Enter'); await shot(page, 'ui5_sect_shop_confirm'); await press(page, 'Enter');
    const after = await wallet(page, row.itemId);
    eq([after.contribution, after.count, after.stones], [before.contribution - row.price, before.count + 1, before.stones], '宗门兑换结算错误');
    await shot(page, 'ui5_sect_shop_done');
    await page.evaluate(() => { window.__scene.shop.close(); window.__scene.openSectCatalog('tianjian_elder', 'sect_library'); });
    s = await snap(page);
    eq([s.open, s.target.service], [true, 'sect_library'], '藏经阁窗未打开');
    await shot(page, 'ui5_sect_library');
    await done(); passed.push('宗门商店/藏经阁：精修窗体、贡献结算、职位灰显');
  }

  // 4. 窗体缺图：清单里去掉全部窗体件，窗口退回代码画，买卖照常，console.error=0。
  {
    const { page, done } = await session('missing-art', { missing: WINDOW_ART });
    await page.evaluate(() => window.__xt.setFlag('shops', true));
    const textures = await page.evaluate(() => ['ui_bestiary_window', 'ui_alchemy_btn_normal', 'ui_alchemy_list_row_normal'].map(k => window.__scene.textures.exists(k)));
    eq(textures, [false, false, false], '缺图模拟未生效');
    await talkMenu(page, grocer); await chooseMenu(page, strings['ui.shop.menu']);
    let s = await snap(page);
    ok(s.open && Object.values(s.artUsed).every(v => v === 'code'), `缺图时未全部退回代码画：${JSON.stringify(s.artUsed)}`);
    const index = s.rows.findIndex(r => r.itemId === buyItem);
    await press(page, 'ArrowDown', index);
    const before = await wallet(page, buyItem);
    await press(page, 'Enter'); await shot(page, 'ui5_missing_confirm'); await press(page, 'Enter');
    eq((await wallet(page, buyItem)).count, before.count + 1, '缺图时购买失败');
    await shot(page, 'ui5_missing_done');
    await page.evaluate(() => window.__scene.shop.setMode('sell')); await page.waitForTimeout(100);
    await shot(page, 'ui5_missing_sell');
    await done(); passed.push('窗体缺图：代码画回退、交易照常、0 报错');
  }
  console.log(JSON.stringify({ suite: 'shop-ui', passed: true, assertions, checks: passed, shots: shotDir, buyItem, sellItem }));
} finally {
  if (browser) await browser.close();
  if (server) await server.close();
  if (outDir) await fs.rm(outDir, { recursive: true, force: true });
}
