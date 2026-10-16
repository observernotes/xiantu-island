// 关态 API 只读验收：真实 Vite SSR，shared/snapshot 双数据根；不接线 UI，关态 API 不消费寄售数值表。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), gameData = path.join(shared, 'game/data');
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const dataRoots = new Map([['shared', shared], ['wt', path.join(root, 'data')], ['game', gameData]]);
const out = path.join(root, 'qa/out_v06p1_market_closed');
const stringsSha = 'c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27';
const previousStringsSha = '6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f';
const originalStringsSha = '4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385';
const originalSemanticSha = '81d364627ea128a3125c1def299f1d94804cee7b7e511ff417dd4bf9ff24c7a9';
// 本窗只授权可选 Progress.market 袋与四个夹具源码；正式 MarketClosed 的八 tip 契约不变。
const openFixtureSources = ['MarketOpenFlag.ts', 'MarketProgress.ts', 'MarketGate.ts', 'v06p1-market-open.test.ts'];
const openFixtureProgressSha = '3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da';
const marketTableSha = '5bd59bbed50ea437c96e9e3b6712e68fed7d956bfc02c8c21b322e856b93bed1';
const closedStrings = {
  'market.closed.feature': '坊市寄售尚未开放。',
  'market.closed.list': '坊市寄售尚未开放，暂不可上架。',
  'market.closed.withdraw': '坊市寄售尚未开放，暂不可撤回。',
  'market.closed.claim': '坊市寄售尚未开放，暂不可领取。',
  'market.closed.no_deal': '坊市寄售尚未开放，不成交、不写收益收据。',
  'market.closed.no_reward': '坊市寄售尚未开放，寄售收益暂不可领取。',
  'market.closed.load_refresh': '读档或刷新后仍未开放，寄售操作暂不可用。',
  'market.closed.slot_or_item': '坊市寄售尚未开放，栏位或物品异常，暂不可操作。',
};
const apiTips = {
  featureClosed: 'market.closed.feature', refuseList: 'market.closed.list',
  refuseWithdraw: 'market.closed.withdraw', refuseClaim: 'market.closed.claim',
  refuseDeal: 'market.closed.no_deal', refuseReward: 'market.closed.no_reward',
  refuseLoadRefresh: 'market.closed.load_refresh', refuseSlotOrItem: 'market.closed.slot_or_item',
};
const caseApis = {
  C01: ['featureClosed'], C02: ['refuseList'], C03: ['refuseSlotOrItem'],
  C04: ['refuseWithdraw'], C05: ['refuseClaim'], C06: ['refuseReward'],
  C07: ['refuseDeal'], C08: ['refuseWithdraw', 'refuseClaim'],
  C09: ['refuseWithdraw', 'refuseDeal'], C10: ['refuseLoadRefresh'],
  C11: ['refuseLoadRefresh', 'refuseList', 'refuseWithdraw', 'refuseClaim'],
};
const evidence = [], readOnlyBefore = new Map();
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const report = row => { evidence.push(row); console.log(JSON.stringify(row)); };
async function shaOrNull(file) {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function filesUnder(directory, prefix = '') {
  const names = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) names.push(...await filesUnder(path.join(directory, entry.name), name));
    else if (entry.isFile()) names.push(name);
  }
  return names.sort();
}

function protectedPath(key) {
  const separator = key.indexOf(':');
  if (separator < 0) return null; // tip、GAME_PHASE、gifts 计数仅为元数据。
  const mode = key.slice(0, separator), name = key.slice(separator + 1);
  if (!dataRoots.has(mode)) return null;
  return path.join(mode === 'wt' && name.startsWith('src/') ? root : dataRoots.get(mode), name);
}

async function checkProtection() {
  const beforeFile = path.join(out, 'protected-before.json');
  const baseline = JSON.parse(await fs.readFile(beforeFile, 'utf8'));
  const protectedFiles = {};
  for (const [key, expected] of Object.entries(baseline)) {
    const file = protectedPath(key);
    if (!file || (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)))) continue;
    // 演武另窗表不沿用旧窗缺席基线；下方单独保护现有字节/缺席且 enabled=false，不授权写入。
    if (key.endsWith('/market_consign.json')) continue;
    const actual = await shaOrNull(file);
    const authorizedSha = key === 'wt:src/Progress.ts' ? openFixtureProgressSha
      : key.endsWith(':balance/strings_zh.json') ? stringsSha : expected;
    eq(actual, authorizedSha, `C12 写前 SHA 保护：${key}`);
    readOnlyBefore.set(file, actual);
    protectedFiles[key] = actual;
  }
  for (const [mode, dataRoot] of dataRoots) {
    for (const directory of ['balance', 'maps']) {
      const actual = (await filesUnder(path.join(dataRoot, directory))).filter(name => name.endsWith('.json') && !(directory === 'balance' && name === 'market_consign.json'));
      const prefix = `${mode}:${directory}/`;
      const expected = Object.keys(baseline).filter(key => key.startsWith(prefix) && !(directory === 'balance' && key.endsWith('/market_consign.json')))
        .map(key => key.slice(prefix.length)).sort();
      eq(actual, expected, `C12 ${mode}/${directory} 没有新增/删除表、地图或入口文件`);
    }
  }
  const expectedSource = Object.keys(baseline).filter(key => key.startsWith('wt:src/')).map(key => key.slice('wt:src/'.length));
  eq(await filesUnder(path.join(root, 'src')), [...expectedSource, 'MarketClosed.ts', ...openFixtureSources].sort(), 'C12 src 仅新增关态 API 及明确授权的四个开态夹具文件，无 UI 接线');
  for (const [mode, dataRoot] of dataRoots) {
    const file = path.join(dataRoot, 'balance/market_consign.json');
    const actual = await shaOrNull(file);
    eq(actual, mode === 'wt' ? null : marketTableSha, `C12 ${mode}: 演武表写前字节与缺席状态受保护，不授权写入`);
    readOnlyBefore.set(file, actual);
    if (actual !== null) eq(JSON.parse(await fs.readFile(file, 'utf8')).enabled, false, `C12 ${mode}: 演武表 enabled=false`);
  }
  for (const name of ['src/scenes/GameScene.ts', 'src/Progress.ts', 'src/ShopPanel.ts', 'src/data.ts', 'src/features.ts']) {
    ok(Object.hasOwn(protectedFiles, `wt:${name}`), `C12 写前证据覆盖 ${name}`);
  }
  report({ suite: 'v06p1-market-closed-protection', passed: true, protectedFiles: Object.keys(protectedFiles).length,
    sourcesOnlyAdded: ['src/MarketClosed.ts', ...openFixtureSources.map(name => `src/${name}`)],
    optionalMarketBagAdded: true, marketTableConsumedByClosedApi: false, uiAdded: false });
}

async function checkStatic(mode, dataRoot) {
  const raw = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
  const strings = JSON.parse(raw), entries = Object.entries(strings);
  eq(hash(raw), stringsSha, `${mode}: strings 为权威目标 SHA`);
  eq(entries.length, 920, `${mode}: 原 912 键加 market 八键，共 920 键`);
  eq(entries.slice(912), Object.entries(closedStrings), `${mode}: 末尾八键及文案逐字相等`);
  eq(entries.filter(([key]) => key.startsWith('market.closed.')), Object.entries(closedStrings), `${mode}: 恰有八个 market.closed 键`);
  eq(hash(JSON.stringify(entries.slice(0, 904))), originalSemanticSha, `${mode}: 原 904 键语义保持`);
  const previous = raw.replace(/,\n(?: {2}"market\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(previous), previousStringsSha, `${mode}: 只剥末尾 market 八行即还原原 912 项完整字节`);
  const original = previous.replace(/,\n(?: {2}"tower\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(original), originalStringsSha, `${mode}: 再剥 tower 八行即还原原 904 项完整字节`);
  for (const [key, text] of Object.entries(closedStrings)) {
    eq(strings[key], text, `${mode}: ${key} 文案逐字`);
    ok(Array.from(text).length <= 40, `${mode}: ${key} 不超过 40 字`);
  }
  const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
  let gifts = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { gifts++; eq(child?.enabled, false, `${mode}/C12: gifts false`); }
      visit(child);
    }
  }
  visit(npcs);
  eq(gifts, 10, `${mode}/C12: 实际核查 gifts 10×false`);
  const shops = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/shops.json'), 'utf8'));
  ok(Object.keys(shops).length > 0 && Object.values(shops).every(Array.isArray), `${mode}/C12: shops 保持既有 NPC 货单形状`);
  ok(!Object.keys(shops).some(key => /market|consign|auction|寄售|拍卖/iu.test(key)), `${mode}/C12: 不把 shops 变成寄售或拍卖`);
  // features.ts 固定读取当前工程快照；shared/features.json 原本不存在，缺席另由 SHA 基线保护。
  const features = JSON.parse(await fs.readFile(path.join(root, 'data/features.json'), 'utf8'));
  ok(!/"[^"\n]*(?:market|consign)[^"\n]*"/iu.test(JSON.stringify(features)), `${mode}/C12: 无新增寄售开态开关`);
  report({ suite: 'v06p1-market-closed-static', dataMode: mode, passed: true, strings: entries.length,
    stringsSha, giftsFalseCount: gifts, shopsUnchanged: true, mapsUnchanged: true, closed: true, softOpened: false, released: false });
}

async function checkSource() {
  const source = await fs.readFile(path.join(root, 'src/MarketClosed.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  const imports = [...code.matchAll(/\bimport\s+[^;]+;/gu)].map(match => match[0]);
  eq(imports, ["import strings from '@xt/balance/strings_zh.json';"], 'C12 API 唯一依赖权威 strings，不消费 Progress、寄售表或服务');
  ok(!/\benabled\b|\b(?:setTimeout|setInterval|queueMicrotask|requestIdleCallback|fetch)\s*\(/u.test(code), 'C12 不新增开态字段、结算、后台延后或网络写入口');
  const consumers = [];
  for (const name of await filesUnder(path.join(root, 'src'))) {
    if (name === 'MarketClosed.ts' || openFixtureSources.includes(name) || /\.test\.[cm]?[jt]sx?$/u.test(name)) continue;
    let text = await fs.readFile(path.join(root, 'src', name), 'utf8');
    if (name === 'Progress.ts') {
      // 仅豁免已钉 SHA 的可选袋声明与纯校验两行，其余 Progress 内容仍全量扫描。
      for (const line of ["  if (has('market') && !isValidMarketProgress(saved.market)) return false;",
        '  market: MarketProgress | undefined = undefined;']) {
        eq(text.split(line).length - 1, 1, `C12 Progress 可选袋授权行精确出现一次：${line.trim()}`);
        text = text.replace(line, '');
      }
    }
    if (/\bMarket\b|MarketClosed|consign|listing|寄售|auction|拍卖/iu.test(text)) consumers.push(name);
  }
  eq(consumers, [], 'C01/C12 除明确授权的四个开态夹具文件外，全量源文件无寄售消费者、拍卖或前台 stub，不改 GameScene 接线');
}

// 本套件历史单据仍挂测试字段；新增可选 Progress.market 袋由开态四图套件另验。
function legacyFixtures() {
  const listed = { listingId: 'fixture-listed', itemInstanceId: 'fixture-owned-instance', state: 'listed',
    heldItemRef: { id: 'wood_sword', instanceId: 'fixture-owned-instance', count: 1 }, pendingRewardRef: null, slotIndex: 0,
    settlementRef: null, claimRef: null, receipts: [], deferredWrites: [] };
  const pending = { ...clone(listed), listingId: 'fixture-pending', state: 'sold_pending_claim', heldItemRef: null,
    pendingRewardRef: { id: 'fixture-reward', amount: 73 }, settlementRef: 'fixture-settlement', receipts: ['fixture-settlement'] };
  return [
    ['empty', { state: 'empty', listings: [], receipts: [], deferredWrites: [] }],
    ['listed', listed], ['sold_pending_claim', pending],
    ['withdrawn', { ...clone(listed), state: 'withdrawn', heldItemRef: null, archived: true, receipts: ['fixture-withdrawn'] }],
    ['claimed', { ...clone(pending), state: 'claimed', pendingRewardRef: null, claimRef: 'fixture-claim', archived: true,
      receipts: ['fixture-settlement', 'fixture-claim'] }],
    ['full-bag-listed', { ...clone(listed), testBagFull: true }],
    ['reward-carrier-refused', { ...clone(pending), testRewardCarrierRefuses: true }],
    ['unknown-state', { ...clone(listed), state: 'fixture_unknown', rawUnknown: { preserve: true } }],
    ['missing-reference', { ...clone(listed), itemInstanceId: null, heldItemRef: null }],
    ['invalid-reward', { ...clone(pending), pendingRewardRef: { id: null, amount: -73, raw: 'damaged' } }],
    ['double-ownership', { ...clone(listed), testAlsoInInventory: 'fixture-owned-instance' }],
  ];
}

async function runGraph(mode, dataRoot, refreshPayloads = null) {
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  let storageWrites = 0, fixtures = 0, invocations = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { storageWrites++; saved.set(key, String(value)); },
    removeItem: key => { storageWrites++; saved.delete(key); }, clear: () => { storageWrites++; saved.clear(); },
    key: index => [...saved.keys()][index] ?? null, get length() { return saved.size; },
  } });
  try {
    const api = await server.ssrLoadModule('/src/MarketClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const data = await server.ssrLoadModule('/src/data.ts');
    const features = await server.ssrLoadModule('/src/features.ts');
    const flagsBefore = clone(features.featureFlags());
    eq(data.GAME_PHASE, 5, `${mode}/C12: GAME_PHASE 保持 5`);
    ok(!Object.keys(flagsBefore).some(key => /market|consign/iu.test(key)), `${mode}/C12: 无寄售开态开关`);
    eq(Object.keys(api).sort(), Object.keys(apiTips).sort(), `${mode}: 恰好八个零参数拒绝 API`);

    async function exercise(p, label) {
      for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
        'settleQuestRewards', 'gainExp', 'addItem', 'removeItem', 'grantSkill', 'grantRecipe',
        'addStones', 'removeStones', 'settleMarket', 'claimMarketReward', 'enqueueMarketWrite']) {
        Object.defineProperty(p, method, { configurable: true, value: () => { throw new Error(`${label}: 关态禁止调用 ${method}`); } });
      }
      const beforeState = clone(p), beforeSave = p.exportSave(), beforeInventory = clone(p.inventory), beforeStones = p.stones;
      // 直接播种内存存档作旁证，不调用实际存储 API。
      saved.set('v06p1-existing-slot', JSON.stringify(beforeSave));
      const diskBefore = [...saved], writesBefore = storageWrites;
      const call = name => {
        invocations++;
        eq(api[name].length, 0, `${label}: ${name} 零参数，不接收 Progress 或写入意图`);
        const result = api[name]();
        eq(result, { allowed: false, tipKey: apiTips[name], text: closedStrings[apiTips[name]] }, `${label}: ${name} 只读拒绝及 tipKey 对应`);
        return result;
      };
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [caseId, names] of Object.entries(caseApis)) {
          for (const name of names) call(name);
          eq(clone(p), beforeState, `${label}/${caseId}: 完整 Progress 与历史单据零增量`);
        }
        // 同单撤回、成交、重复上架及重复领取并发：每个真实 API 分支均必须拒绝。
        const results = await Promise.all(['refuseWithdraw', 'refuseDeal', 'refuseWithdraw', 'refuseDeal', 'refuseList', 'refuseList', 'refuseClaim', 'refuseClaim']
          .map(name => Promise.resolve().then(() => call(name))));
        ok(results.every(result => result.allowed === false), `${label}/C09: 并发分支全部关态拒绝`);
        eq(p.inventory, beforeInventory, `${label}/C02–C11: inventory 不扣物、不返物`);
        eq(p.stones, beforeStones, `${label}/C02–C11: stones 不扣费、不发收益`);
        eq(clone(p), beforeState, `${label}/C02–C11: 完整 clone、扣押、待领、终态及收据无增量`);
        eq(p.exportSave(), beforeSave, `${label}/C02–C11: exportSave 字节语义零增量`);
        eq([...saved], diskBefore, `${label}/C10: 已有存档原文保留`);
        eq(storageWrites, writesBefore, `${label}/C10: localStorage 写入零次`);
      }
      fixtures++;
      return beforeSave;
    }

    const payloads = [];
    if (!refreshPayloads) {
      for (const [state, fixture] of legacyFixtures()) {
        const p = new Progress();
        p.stones = 1234; p.inventory = { hp_pill_small: 3, qi_pill: 2 };
        p.__closedMarketLegacyFixture = clone(fixture);
        payloads.push([state, await exercise(p, `${mode}/${state}`)]);
      }
    } else for (const [state, payload] of refreshPayloads) payloads.push([state, clone(payload)]);

    for (const [state, payload] of payloads) {
      const serialized = JSON.stringify(payload), writesBeforeLoad = storageWrites;
      const restored = Progress.restore(JSON.parse(serialized), false);
      eq(storageWrites, writesBeforeLoad, `${mode}/${state}/C10: 真实无持久化 restore 不写存储`);
      eq([restored.inventory, restored.stones], [payload.inventory, payload.stones], `${mode}/${state}/C10: 真实 restore 既有库存与灵石保留`);
      ok(!Object.hasOwn(restored, '__closedMarketLegacyFixture'), `${mode}/${state}/C10: 正式 schema 未被测试夹具扩展`);
      // 正式 restore 仅恢复已登记字段，历史寄售语义显式重附在测试字段中，不宣称已接存档。
      restored.__closedMarketLegacyFixture = clone(payload.__closedMarketLegacyFixture);
      eq(restored.__closedMarketLegacyFixture, payload.__closedMarketLegacyFixture, `${mode}/${state}/C10–C11: 原始历史夹具完整重附`);
      await exercise(restored, `${mode}/${refreshPayloads ? 'fresh-ssr-refresh' : 'real-restore'}/${state}`);
      const memoryReload = Object.assign(new Progress(), JSON.parse(serialized));
      eq(memoryReload.__closedMarketLegacyFixture, payload.__closedMarketLegacyFixture, `${mode}/${state}/C10–C11: JSON 保存读回保留全部原始夹具`);
      await exercise(memoryReload, `${mode}/json-save-reload/${state}`);
    }
    eq(features.featureFlags(), flagsBefore, `${mode}/C12: 所有开关保持原值`);
    eq(storageWrites, 0, `${mode}: 所有拒绝、并发、真实读档、刷新零存储写入`);
    report({ suite: 'v06p1-market-closed-runtime', dataMode: mode, passed: true, fixtures, invocations,
      freshSsrRefresh: !!refreshPayloads, legacyFixtureOnly: true, optionalMarketBagAdded: true,
      cases: Object.keys(caseApis), zeroArgumentApis: 8, storageWrites, closed: true, softOpened: false, released: false });
    return payloads;
  } finally {
    if (storageDescriptor) Object.defineProperty(globalThis, 'localStorage', storageDescriptor);
    else delete globalThis.localStorage;
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
let passed = false;
try {
  await checkProtection();
  await checkSource();
  for (const [mode, dataRoot] of modes) await checkStatic(mode, dataRoot);
  const sharedStrings = await fs.readFile(path.join(shared, 'balance/strings_zh.json'));
  for (const [mode, dataRoot] of [['snapshot', path.join(root, 'data')], ['game', gameData]]) {
    eq((await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'))).equals(sharedStrings), true, `${mode}: 三根 strings 最终同字节`);
  }
  for (const [mode, dataRoot] of modes) {
    const payloads = await runGraph(mode, dataRoot);
    // 新 SSR 图重新加载真实模块和 Progress，模拟刷新后仍拒绝全部历史状态。
    await runGraph(mode, dataRoot, payloads);
  }
  passed = true;
} finally {
  for (const [file, sha] of readOnlyBefore) eq(await shaOrNull(file), sha, `只读测试前后 SHA 不变：${file}`);
  await fs.writeFile(path.join(out, 'v06p1-market-closed-evidence.json'), `${JSON.stringify({ passed, assertions,
    stringsSha, cases: [...Object.keys(caseApis), 'C12'], closed: true, softOpened: false, released: false,
    noFrontendMarketUi: true, noMarketTableConsumedByClosedApi: true, optionalMarketBagAdded: true,
    protectedFiles: Object.fromEntries(readOnlyBefore), evidence }, null, 2)}\n`);
}
console.log(`v06p1 market closed tests ok: ${assertions} assertions; C01–C12 自动化部分通过；shared/snapshot 双根及 game 文案同字节；八 API 零参数、零副作用、零存储写入；shops/禁改表/地图不变，Progress仅授权可选market袋，gifts 10×false，GAME_PHASE=5；无前台寄售 UI、正式仍关、未软开、未发版`);
