// 双根四图：正式旗标恒 true；只有独立 Vite SSR 关态图可将旗标模块内存注入 false。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const dataRoots = new Map([['shared', shared], ['wt', path.join(root, 'data')], ['game', path.join(shared, 'game/data')]]);
const out = path.join(root, 'qa/out_v06p1_market_open_preamble/open');
const before = new Map(), evidence = [], marketSources = new Map();
let assertions = 0, runtimeAssertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const report = row => { evidence.push(row); console.log(JSON.stringify(row)); };
async function shaOrNull(file) {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function filesUnder(directory, prefix = '') {
  const files = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) files.push(...await filesUnder(path.join(directory, entry.name), name));
    else if (entry.isFile()) files.push(name);
  }
  return files.sort();
}

async function protectFiles() {
  for (const [, dataRoot] of dataRoots) {
    for (const directory of ['balance', 'maps']) {
      for (const name of (await filesUnder(path.join(dataRoot, directory))).filter(name => name.endsWith('.json'))) {
        const file = path.join(dataRoot, directory, name);
        before.set(file, await shaOrNull(file));
      }
    }
    for (const name of ['features.json', 'balance/market_consign.json']) {
      const file = path.join(dataRoot, name);
      before.set(file, await shaOrNull(file));
    }
  }
  for (const name of ['src/features.ts', 'src/data.ts', 'src/Progress.ts', 'src/scenes/GameScene.ts',
    'src/ShopPanel.ts', 'src/TowerOpenFlag.ts', 'src/MarketClosed.ts', 'src/MarketOpenFlag.ts',
    'src/MarketProgress.ts', 'src/MarketGate.ts']) {
    const file = path.join(root, name);
    before.set(file, await shaOrNull(file));
  }
}

async function checkFormal() {
  const flag = await fs.readFile(path.join(root, 'src/MarketOpenFlag.ts'), 'utf8');
  ok(/export function isMarketOpenForFixture\(\): boolean\s*\{\s*return true;\s*\}/u.test(flag), '正式磁盘 MarketOpenFlag 恒返回 true');
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  for (const name of ['isMarketOpenForFixture', 'MarketGate', 'MarketClosed', 'tryInteractMarketConsign'])
    ok(scene.includes(name), `GameScene 已接寄售最小冒烟入口：${name}`);
  ok(/this\.tryInteractTowerClosed\(\)\s*\|\|\s*this\.tryInteractMarketConsign\(\)/u.test(scene), 'Z 键交互链在 talkNearby 前接入寄售');
  ok(!/MarketPanel|ConsignPanel|AuctionPanel|openMarketPanel|openConsignPanel/u.test(scene), 'GameScene 未铺完整寄售或拍卖面板');
  ok(!/market|consign/iu.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')), 'ShopPanel 不接入寄售');
  const formalBytes = await fs.readFile(path.join(shared, 'balance/market_consign.json'));
  for (const [mode, dataRoot] of dataRoots) {
    const tableFile = path.join(dataRoot, 'balance/market_consign.json');
    const tableSha = await shaOrNull(tableFile);
    ok(tableSha !== null, `${mode}: market_consign 表存在`);
    const bytes = await fs.readFile(tableFile);
    eq(bytes.equals(formalBytes), true, `${mode}: market_consign 表与共享同字节`);
    eq(JSON.parse(bytes.toString('utf8')).enabled, true, `${mode}: market_consign.enabled 正式 true`);
    const shops = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/shops.json'), 'utf8'));
    ok(Object.keys(shops).length > 0 && Object.values(shops).every(Array.isArray), `${mode}: shops 保持 NPC 货单`);
    ok(!Object.keys(shops).some(key => /market|consign|auction|寄售|拍卖/iu.test(key)), `${mode}: shops 不变为寄售或拍卖`);
    let giftsChecked = 0;
    function visit(value) {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'gifts') { giftsChecked++; eq(child?.enabled, false, `${mode}: gifts false`); }
        visit(child);
      }
    }
    visit(JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8')));
    eq(giftsChecked, 10, `${mode}: gifts 十处全关`);
    report({ suite: 'v06p1-market-open-formal', dataMode: mode, formalOpen: true,
      closedFixtureOnly: true, marketTablePresent: tableSha !== null, marketTableSha: tableSha,
      marketEnabled: true, giftsChecked, shopsUnchanged: true,
      softOpened: true, released: false });
  }
  for (const [mode, dataRoot] of modes) {
    const ownFile = path.join(dataRoot, 'balance/market_consign.json');
    const sourceFile = ownFile;
    const bytes = await fs.readFile(sourceFile);
    const table = JSON.parse(bytes.toString('utf8'));
    eq(table.enabled, true, `${mode}: SSR 只读正式软开数值表`);
    marketSources.set(mode, { sourceFile, sha: hash(bytes) });
  }
}

async function runGraph(mode, dataRoot, openFixture, refreshPayloads = null) {
  let flagLoads = 0, featureOverrideCalls = 0;
  const tableSource = marketSources.get(mode), flagId = '\0v06p1-memory-closed-market-flag';
  const phaserId = '\0v06p1-market-phaser';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-market-memory-only-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return phaserId;
        if (!openFixture && /(?:^|\/)MarketOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isMarketOpenForFixture() { return false; }'; }
        if (id !== phaserId) return;
        return `class Sprite {} export default { WEBGL: 2, Scene: class {}, BlendModes: { NORMAL: 0 },
          Physics: { Arcade: { Sprite } }, GameObjects: { Sprite, NineSlice: class {} },
          Scenes: { Events: { SHUTDOWN: 'shutdown' } }, Animations: { Events: { ANIMATION_COMPLETE: 'animationcomplete' } },
          Input: { Keyboard: { JustDown: key => { const down = !!key?._justDown; if (key) key._justDown = false; return down; } } },
          Math: { Clamp: (value, min, max) => Math.min(max, Math.max(min, value)), Linear: (from, to, amount) => from + (to - from) * amount } };`;
      },
      transform(source, id) {
        if (!id.endsWith('/src/features.ts')) return;
        return source.replace(/export function setFeatureFlag\(name: FeatureName, value: boolean\): void \{/u,
          'export function setFeatureFlag(name: FeatureName, value: boolean): void { globalThis.__v06p1MarketFeatureOverrideAttempt();');
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__v06p1MarketFeatureOverrideAttempt');
  Object.defineProperty(globalThis, '__v06p1MarketFeatureOverrideAttempt', { configurable: true, value() {
    featureOverrideCalls++; throw new Error('本套件禁止 features 覆盖');
  } });
  try {
    const flag = await server.ssrLoadModule('/src/MarketOpenFlag.ts');
    eq(flag.isMarketOpenForFixture(), openFixture, `${mode}: 正式图读 true，关态图仅内存注入 false`);
    const { GAME_PHASE } = await server.ssrLoadModule('/src/data.ts');
    eq(GAME_PHASE, 5, `${mode}: GAME_PHASE 保持 5`);
    const features = await server.ssrLoadModule('/src/features.ts');
    ok(!Object.keys(features.featureFlags()).some(key => /market|consign/iu.test(key)), `${mode}: 无正式寄售 feature 开关`);
    const suite = await server.ssrLoadModule('/src/v06p1-market-open.test.ts');
    const result = await suite.runMarketOpenFixtureTests({ openFixture, dataMode: mode, refreshPayloads });
    ok(Number.isSafeInteger(result.assertions) && result.assertions > 0, `${mode}: 实际运行自动化断言`);
    runtimeAssertions += result.assertions;
    eq(featureOverrideCalls, 0, `${mode}: 任何图均不调用 features 覆盖`);
    eq(flagLoads, openFixture ? 0 : 1, `${mode}: 正式图无 flag 注入，关态图只加载一次虚拟 flag`);
    const { payloads, ...resultEvidence } = result;
    const savedStateEvidence = Array.isArray(payloads)
      ? payloads.map(({ state, save }) => ({ state, saveSha: hash(JSON.stringify(save)) })) : [];
    report({ suite: 'v06p1-market-open-graph', dataMode: mode, graph: openFixture ? 'formal-open' : 'memory-closed',
      freshSsrRefresh: refreshPayloads !== null, formalOpen: true, closedFixtureOnly: true,
      marketTableSource: tableSource.sourceFile, marketTableSha: tableSource.sha,
      flagLoads, featureOverrideCalls,
      result: resultEvidence, savedStateEvidence, softOpened: true, released: false });
    return result;
  } finally {
    if (descriptor) Object.defineProperty(globalThis, '__v06p1MarketFeatureOverrideAttempt', descriptor);
    else Reflect.deleteProperty(globalThis, '__v06p1MarketFeatureOverrideAttempt');
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
let passed = false;
try {
  await protectFiles();
  await checkFormal();
  for (const [mode, dataRoot] of modes) {
    const opened = await runGraph(mode, dataRoot, true);
    await runGraph(mode, dataRoot, false);
    ok(opened.payloads && typeof opened.payloads === 'object', `${mode}: 四状态保存数据供独立 SSR 刷新`);
    await runGraph(mode, dataRoot, true, opened.payloads);
    // 将同一批真实开态历史单带入新的内存关态图，验关态优先旧资格且零增量。
    await runGraph(mode, dataRoot, false, opened.payloads);
  }
  passed = true;
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `夹具运行前后字节不变：${file}`);
  report({ suite: 'v06p1-market-open-sha-guard', protectedFiles: before.size, passed: true });
  await fs.writeFile(path.join(out, 'v06p1-market-open-evidence.json'), `${JSON.stringify({ passed,
    assertions: assertions + runtimeAssertions, staticAssertions: assertions, runtimeAssertions,
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    protectedFiles: Object.fromEntries(before), evidence }, null, 2)}\n`);
}
console.log(`v06p1 market open fixture tests ok: ${assertions + runtimeAssertions} assertions; shared/snapshot 双根正式开态+内存关态四图及独立 SSR 刷新；O01–O10 自动化；正式 flag=true、三根 market_consign.enabled=true；SHA不变；gifts 10×false、GAME_PHASE=5；formalOpen:true、closedFixtureOnly:true、softOpened:true、released:false；未进包、未发版`);
