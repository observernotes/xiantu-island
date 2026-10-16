// 炼器关态只读验收：真实 Vite SSR，shared/snapshot 双根；不接前台打造或服务。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), out = path.join(root, 'qa/out_v06p1_forge_closed');
const roots = new Map([['shared', shared], ['wt', path.join(root, 'data')], ['game', path.join(shared, 'game/data')]]);
const modes = [['shared', shared], ['snapshot', roots.get('wt')]];
const openFixtureSources = ['ForgeOpenFlag.ts', 'ForgeGate.ts', 'ForgeProgress.ts', 'v06p1-forge-open.test.ts'];
const forgeClosedSha = 'f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c';
const stringsSha = 'fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967';
const previousStringsSha = 'c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27';
const preMarketStringsSha = '6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f';
const closedStrings = {
  'forge.closed.feature': '炼器打造尚未开放。',
  'forge.closed.entrance': '欧冶匠暂不提供打造，可查看说明。',
  'forge.closed.craft': '炼器打造尚未开放，暂不可打造。',
  'forge.closed.no_submit': '炼器打造尚未开放，暂不可提交图纸或材料。',
  'forge.closed.no_result': '炼器打造尚未开放，不产出成品。',
  'forge.closed.no_grade': '炼器打造尚未开放，不展示或结算品质档。',
  'forge.closed.load_refresh': '读档或刷新后炼器仍未开放，暂不可打造。',
  'forge.closed.later_service': '强化、附灵与分解等后续服务尚未开放。',
};
const apiTips = {
  featureClosed: 'forge.closed.feature', refuseEntrance: 'forge.closed.entrance',
  refuseCraft: 'forge.closed.craft', refuseSubmit: 'forge.closed.no_submit',
  refuseResult: 'forge.closed.no_result', refuseGrade: 'forge.closed.no_grade',
  refuseLoadRefresh: 'forge.closed.load_refresh', refuseLaterService: 'forge.closed.later_service',
};
const caseApis = {
  C01: 'featureClosed', C02: 'refuseEntrance', C03: 'refuseCraft', C04: 'refuseSubmit',
  C05: 'refuseSubmit', C06: 'refuseResult', C07: 'refuseGrade', C08: 'refuseLoadRefresh',
  C09: 'refuseLaterService', C10: 'refuseCraft', C11: 'refuseSubmit', C12: 'refuseLoadRefresh',
};
const evidence = [], protectedFiles = {}, readOnlyBefore = new Map();
let assertions = 0, totalInvocations = 0, totalFixtures = 0;
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
    // src/gen 是既有 .gitignore 生成目录，不把本机旧缓存变成验收依赖。
    if (directory === path.join(root, 'src') && entry.name === 'gen') continue;
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) names.push(...await filesUnder(path.join(directory, entry.name), name));
    else if (entry.isFile()) names.push(name);
  }
  return names.sort();
}
function protectedPath(key) {
  const separator = key.indexOf(':'), mode = key.slice(0, separator), name = key.slice(separator + 1);
  if (!roots.has(mode)) return null;
  return path.join(mode === 'wt' && name.startsWith('src/') ? root : roots.get(mode), name);
}

// 只剥本窗获准的四个完整行；其余 Progress 字节仍与原基线 SHA 逐字比对。
const forgeProgressAddedLines = [
  "import { isValidForgeProgress, type ForgeProgress } from './ForgeProgress';",
  "  if (has('forge') && !isValidForgeProgress(saved.forge)) return false;",
  '  /** 仅保留完整夹具事实；缺袋旧档不补建，读回不结算。 */',
  '  forge: ForgeProgress | undefined = undefined;',
];
function stripForgeProgress(source) {
  for (const line of forgeProgressAddedLines) {
    eq(source.split(`${line}\n`).length - 1, 1, `Progress 炼器可选袋授权完整行精确一次：${line.trim()}`);
    source = source.replace(`${line}\n`, '');
  }
  return source;
}

async function checkProtection() {
  const baseline = JSON.parse(await fs.readFile(path.join(out, 'protected-before.json'), 'utf8'));
  for (const [key, expected] of Object.entries(baseline)) {
    const file = protectedPath(key);
    if (!file) continue;
    const actual = await shaOrNull(file);
    const compared = key === 'wt:src/Progress.ts'
      ? hash(stripForgeProgress(await fs.readFile(file, 'utf8'))) : actual;
    eq(compared, key.endsWith(':balance/strings_zh.json') ? stringsSha : expected, `禁改表/地图/源码写前 SHA（Progress 仅剥四行）：${key}`);
    readOnlyBefore.set(file, actual);
    protectedFiles[key] = actual;
  }
  const sourceBefore = JSON.parse(await fs.readFile(path.join(out, 'source-before.json'), 'utf8'));
  eq(await filesUnder(path.join(root, 'src')), [...Object.keys(sourceBefore).map(name => name.slice(4)), 'ForgeClosed.ts', ...openFixtureSources].sort(),
    '仅追加 ForgeClosed.ts 及明确授权的四个开态夹具源码，无服务、配方表或前台打造文件');
  for (const [name, expected] of Object.entries(sourceBefore)) {
    const file = path.join(root, name), actual = await shaOrNull(file);
    const compared = name === 'src/Progress.ts' ? hash(stripForgeProgress(await fs.readFile(file, 'utf8'))) : actual;
    eq(compared, expected, `既有源码完整字节不变（Progress 仅剥四行）：${name}`);
    readOnlyBefore.set(file, actual);
  }
  const closedFile = path.join(root, 'src/ForgeClosed.ts');
  eq(await shaOrNull(closedFile), forgeClosedSha, 'ForgeClosed.ts 与关态 tip 完整字节一致');
  readOnlyBefore.set(closedFile, forgeClosedSha);
  ok(Object.hasOwn(sourceBefore, 'src/features.ts'), '补充保护 features.ts 全文，不新增炼器开态字段');
  const dataFiles = JSON.parse(await fs.readFile(path.join(out, 'data-files-before.json'), 'utf8'));
  for (const [mode, dataRoot] of roots) for (const directory of ['balance', 'maps']) {
    eq(await filesUnder(path.join(dataRoot, directory)), dataFiles[mode][directory], `${mode}/${directory} 无新增/删除表、地图或入口`);
  }
  report({ suite: 'protection', passed: true, baselineFiles: Object.keys(protectedFiles).length,
    existingSourceFiles: Object.keys(sourceBefore).length, sourcesOnlyAdded: ['src/ForgeClosed.ts', ...openFixtureSources.map(name => `src/${name}`)],
    optionalForgeBagOnly: true, gameSceneUnchanged: true });
}

async function checkStatic(mode, dataRoot) {
  const raw = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
  const strings = JSON.parse(raw), entries = Object.entries(strings);
  eq(hash(raw), stringsSha, `${mode}: strings 权威 SHA`);
  eq(entries.length, 928, `${mode}: 928 个顶层键`);
  eq(entries.slice(920), Object.entries(closedStrings), `${mode}: 末尾八键及文案逐字`);
  eq(entries.filter(([key]) => key.startsWith('forge.closed.')), Object.entries(closedStrings), `${mode}: 恰有 forge 八键`);
  ok(entries.slice(912, 920).every(([key]) => key.startsWith('market.closed.')), `${mode}: 原 market 八键仍在 slice(912,920)`);
  const previous = raw.replace(/,\n(?: {2}"forge\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(previous), previousStringsSha, `${mode}: 剥 forge 八行还原原 920 键完整字节`);
  const preMarket = previous.replace(/,\n(?: {2}"market\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(preMarket), preMarketStringsSha, `${mode}: 再剥 market 八行还原 912 键完整字节`);
  for (const [key, text] of Object.entries(closedStrings)) {
    eq(strings[key], text, `${mode}: ${key} 文案逐字`);
    ok(Array.from(text).length <= 40, `${mode}: ${key} ≤40 字`);
  }
  const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
  let gifts = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { gifts++; eq(child?.enabled, false, `${mode}: gifts false`); }
      visit(child);
    }
  }
  visit(npcs);
  eq(gifts, 10, `${mode}: gifts 10×false`);
  const smith = npcs.find(npc => npc.id === 'smith_ou');
  ok(smith, `${mode}: smith_ou 既有 NPC 存在`);
  ok(!Object.hasOwn(smith, 'services'), `${mode}: 不挂 smith_ou.services`);
  eq(smith.quests, [], `${mode}: smith_ou quests=[]`);
  report({ suite: 'static', dataMode: mode, passed: true, strings: entries.length, stringsSha,
    giftsFalseCount: gifts, smithServices: false, smithQuests: [], closed: true, softOpened: false, released: false });
}

async function checkSource() {
  const flag = await fs.readFile(path.join(root, 'src/ForgeOpenFlag.ts'), 'utf8');
  eq(flag, '/** 正式恒关；仅 Vite SSR 开态夹具图可由 resolve/load 内存模块注入 true。 */\nexport function isForgeOpenForFixture(): boolean { return false; }\n',
    '正式 ForgeOpenFlag 精确恒 false，开态只能由 SSR 内存模块注入');
  const source = await fs.readFile(path.join(root, 'src/ForgeClosed.ts'), 'utf8');
  const parsed = ts.createSourceFile('ForgeClosed.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = parsed.statements.filter(ts.isImportDeclaration).map(node => node.getText(parsed));
  eq(imports, ["import strings from '@xt/balance/strings_zh.json';"], 'API 唯一 import 为 strings，无 Progress/存档/服务/配方依赖');
  const functions = parsed.statements.filter(ts.isFunctionDeclaration);
  const exports = functions.filter(node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  eq(exports.map(node => node.name.text).sort(), Object.keys(apiTips).sort(), '仅八个导出 API');
  for (const node of exports) eq(node.parameters.length, 0, `${node.name.text} 源码零参数`);
  function inspect(node) {
    ok(!ts.isNewExpression(node) && !ts.isAwaitExpression(node) && !ts.isImportEqualsDeclaration(node), '无构造、异步或旁路依赖');
    if (ts.isCallExpression(node)) eq(node.expression.getText(parsed), 'closed', '只调用本地只读提示函数，不保存、抽样、排队或请求');
    if (ts.isBinaryExpression(node)) ok(!ts.isAssignmentOperator(node.operatorToken.kind), '不赋值或改写任何状态');
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  const search = [];
  for (const name of await filesUnder(path.join(root, 'src'))) {
    const text = await fs.readFile(path.join(root, 'src', name), 'utf8');
    if (name !== 'ForgeClosed.ts' && !openFixtureSources.includes(name)) ok(!/ForgeClosed|forge\.closed\./u.test(text), `${name}: 无关态 API 前台消费者或打造接线`);
    text.split('\n').forEach((line, index) => {
      if (/forge|打造|ForgeClosed|smith_ou/iu.test(line)) search.push({ file: `src/${name}`, line: index + 1, text: line });
    });
  }
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  ok(!/ForgeClosed|smith_ou|forge\.closed\./u.test(scene), 'GameScene 无炼器/欧冶匠专用接线');
  await fs.writeFile(path.join(out, 'source-search.json'), `${JSON.stringify(search, null, 2)}\n`);
  report({ suite: 'source', passed: true, importOnlyStrings: true, zeroArgumentApis: 8,
    noFrontendForgeWiring: true, formalFlagFalse: true, openFixtureSources, sourceSearch: 'source-search.json', matches: search.length });
}

// 本套件保留历史语义夹具；真实可选 forge 袋由开态专项另验，关态 API 不消费它。
function legacyFixtures() {
  const base = { blueprint: 'fixture-only-blueprint', materials: [{ ref: 'fixture-only-material', count: 2 }],
    existingResult: { ref: 'fixture-owned-result', grade: 'fine' }, requests: [], receipts: [], deferredWrites: [] };
  return [
    ['legal-complete', base],
    ['missing-blueprint-material', { ...clone(base), blueprint: null, materials: [] }],
    ['invalid-reference-count-recipe', { ...clone(base), materials: [{ ref: null, count: -2 }], recipe: null }],
    ['full-bag-result-refused', { ...clone(base), testBagFull: true, testResultCarrierRefuses: true }],
    ['unknown-grade', { ...clone(base), requestedGrade: 'fixture-unknown', rawUnknown: { preserve: true } }],
    ['old-callback-duplicate', { ...clone(base), callbacks: ['fixture-request', 'fixture-request'], receipts: ['fixture-existing-receipt'] }],
    ['contending-requests', { ...clone(base), requests: [{ id: 'fixture-A', state: 'pending' }, { id: 'fixture-B', state: 'pending' }] }],
    ['old-save-unfinished-result', { ...clone(base), requests: [{ id: 'fixture-old', state: 'unknown', raw: { preserve: true } }],
      receipts: ['fixture-old-receipt'], deferredWrites: ['fixture-existing-pending'] }],
  ];
}

async function runGraph(mode, dataRoot, refreshPayloads = null) {
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  let storageWrites = 0, sentinelCalls = 0, fixtures = 0, invocations = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { storageWrites++; saved.set(key, String(value)); },
    removeItem: key => { storageWrites++; saved.delete(key); }, clear: () => { storageWrites++; saved.clear(); },
    key: index => [...saved.keys()][index] ?? null, get length() { return saved.size; },
  } });
  try {
    const api = await server.ssrLoadModule('/src/ForgeClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const data = await server.ssrLoadModule('/src/data.ts');
    const features = await server.ssrLoadModule('/src/features.ts');
    const flagsBefore = clone(features.featureFlags());
    eq(data.GAME_PHASE, 5, `${mode}: GAME_PHASE=5（定义位于 data.ts）`);
    ok(!Object.keys(flagsBefore).some(key => /forg/iu.test(key)), `${mode}: 无炼器开态字段`);
    eq(Object.keys(api).sort(), Object.keys(apiTips).sort(), `${mode}: 真实 SSR 模块仅八 API`);

    async function exercise(p, label) {
      for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
        'settleQuestRewards', 'gainExp', 'gainLifeSkillExp', 'addItem', 'removeItem', 'grantSkill', 'grantRecipe',
        'addStones', 'removeStones', 'forge', 'craft', 'submitForge', 'settleForge', 'grantForgeResult',
        'rollForgeGrade', 'enqueueForgeWrite', 'createForgeRequest', 'recordForgeReceipt']) {
        Object.defineProperty(p, method, { configurable: true, value: () => {
          sentinelCalls++; throw new Error(`${label}: 关态禁止调用 ${method}`);
        } });
      }
      const beforeState = clone(p), beforeSave = p.exportSave(), beforeInventory = clone(p.inventory), beforeStones = p.stones;
      const beforeForging = [p.forgingLevel, p.forgingExp];
      const saveBytes = JSON.stringify(beforeSave);
      saved.set('v06p1-forge-existing-slot', saveBytes); // 播种内存，不调用 localStorage 写 API。
      const diskBefore = [...saved], writesBefore = storageWrites;
      const call = name => {
        invocations++;
        eq(api[name].length, 0, `${label}: ${name} 零参数，无 Progress 或写入意图`);
        const result = api[name]();
        eq(result, { allowed: false, tipKey: apiTips[name], text: closedStrings[apiTips[name]] }, `${label}: ${name} 恒只读拒绝`);
        return result;
      };
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [caseId, name] of Object.entries(caseApis)) {
          call(name);
          eq(clone(p), beforeState, `${label}/${caseId}: 完整 clone 与历史品质/请求/队列零增量`);
        }
        for (let click = 0; click < 10; click++) call('refuseCraft');
        const results = await Promise.all(['refuseSubmit', 'refuseSubmit', 'refuseCraft', 'refuseCraft', 'refuseResult', 'refuseGrade']
          .map(name => Promise.resolve().then(() => call(name))));
        ok(results.every(result => result.allowed === false), `${label}/C03/C10/C11: 连点、旧回调与 Promise.all 争用全部拒绝`);
        eq(p.inventory, beforeInventory, `${label}: inventory 不扣图纸/材料、不产物`);
        eq(p.stones, beforeStones, `${label}: stones 零增量`);
        eq([p.forgingLevel, p.forgingExp], beforeForging, `${label}: forging 等级/经验零增量`);
        eq(clone(p), beforeState, `${label}: 品质/结果/请求/去重/排队完整状态零增量`);
        eq(p.exportSave(), beforeSave, `${label}: exportSave 完整语义零增量`);
        eq(JSON.stringify(p.exportSave()), saveBytes, `${label}: exportSave 序列化字节一致`);
        eq([...saved], diskBefore, `${label}: 既有存档原文不变`);
        eq(storageWrites, writesBefore, `${label}: localStorage 写入0`);
        eq(sentinelCalls, 0, `${label}: 写入口抛错哨兵调用0`);
      }
      fixtures++;
      return beforeSave;
    }

    const payloads = [];
    if (!refreshPayloads) {
      for (const [state, fixture] of legacyFixtures()) {
        const p = new Progress();
        p.stones = 1234; p.inventory = { hp_pill_small: 3, wood_sword: 1 };
        p.forgingLevel = 3; p.forgingExp = 7;
        p.__closedForgeLegacyFixture = clone(fixture);
        payloads.push([state, await exercise(p, `${mode}/${state}`)]);
      }
    } else for (const [state, payload] of refreshPayloads) payloads.push([state, clone(payload)]);
    for (const [state, payload] of payloads) {
      const serialized = JSON.stringify(payload), writesBeforeLoad = storageWrites;
      const restored = Progress.restore(JSON.parse(serialized), false);
      eq(storageWrites, writesBeforeLoad, `${mode}/${state}/C08/C12: 真实 restore(false) 无存储写`);
      eq([restored.inventory, restored.stones, restored.forgingLevel, restored.forgingExp],
        [payload.inventory, payload.stones, payload.forgingLevel, payload.forgingExp], `${mode}/${state}: 真实读档保留既有资产与 forging`);
      ok(!Object.hasOwn(restored, '__closedForgeLegacyFixture'), `${mode}/${state}: 正式 restore/schema 未扩展测试语义字段`);
      // 正式 schema 不登记打造请求；明确重附原始测试语义，不宣称已接打造存档消费者。
      restored.__closedForgeLegacyFixture = clone(payload.__closedForgeLegacyFixture);
      eq(restored.__closedForgeLegacyFixture, payload.__closedForgeLegacyFixture, `${mode}/${state}: 历史品质/请求/队列语义完整重附`);
      await exercise(restored, `${mode}/${refreshPayloads ? 'fresh-ssr-refresh' : 'real-restore'}/${state}`);
      const memoryReload = Object.assign(new Progress(), JSON.parse(serialized));
      eq(memoryReload.__closedForgeLegacyFixture, payload.__closedForgeLegacyFixture, `${mode}/${state}: JSON 读回保留原始夹具`);
      await exercise(memoryReload, `${mode}/json-save-reload/${state}`);
    }
    eq(features.featureFlags(), flagsBefore, `${mode}: 既有开关不变`);
    eq(storageWrites, 0, `${mode}: 全部调用、读档、刷新 localStorage 写入0`);
    eq(sentinelCalls, 0, `${mode}: 所有写哨兵调用0`);
    totalFixtures += fixtures; totalInvocations += invocations;
    report({ suite: 'runtime', dataMode: mode, passed: true, fixtures, invocations, freshSsrRefresh: !!refreshPayloads,
      cases: Object.keys(caseApis), zeroArgumentApis: 8, storageWrites, sentinelCalls, closedApiConsumesForgeBag: false,
      legacyFixtureOnly: true, optionalForgeBagAdded: true, closed: true, softOpened: false, released: false });
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
  for (const [mode, dataRoot] of roots) await checkStatic(mode, dataRoot);
  const sharedStrings = await fs.readFile(path.join(shared, 'balance/strings_zh.json'));
  for (const mode of ['wt', 'game']) eq((await fs.readFile(path.join(roots.get(mode), 'balance/strings_zh.json'))).equals(sharedStrings), true, `${mode}: 三根同字节`);
  for (const [mode, dataRoot] of modes) {
    const payloads = await runGraph(mode, dataRoot);
    await runGraph(mode, dataRoot, payloads);
  }
  passed = true;
} finally {
  for (const [file, sha] of readOnlyBefore) eq(await shaOrNull(file), sha, `自检前后只读 SHA：${file}`);
  const baseline = JSON.parse(await fs.readFile(path.join(out, 'protected-before.json'), 'utf8'));
  const after = { ...baseline, ...protectedFiles };
  await fs.writeFile(path.join(out, 'protected-after.json'), `${JSON.stringify(after, null, 2)}\n`);
  const changes = Object.keys(protectedFiles).filter(key => baseline[key] !== protectedFiles[key]);
  await fs.writeFile(path.join(out, 'boundary-check.log'), `${JSON.stringify({ passed, baselineEntries: Object.keys(baseline).length,
    protectedFiles: Object.keys(protectedFiles).length, authorizedChanges: changes, sourceOnlyAdded: ['src/ForgeClosed.ts', ...openFixtureSources.map(name => `src/${name}`)],
    stringsSha, sharedStringsUnchanged: baseline['shared:balance/strings_zh.json'] === after['shared:balance/strings_zh.json'],
    gameSceneUnchanged: baseline['wt:src/scenes/GameScene.ts'] === after['wt:src/scenes/GameScene.ts'],
    giftsFalseCount: 10, GAME_PHASE: 5, smithServices: false, closed: true, softOpened: false, released: false }, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'v06p1-forge-closed-evidence.json'), `${JSON.stringify({ passed, assertions, stringsSha,
    cases: caseApis, totalFixtures, totalInvocations, protectedFiles, evidence, closed: true, softOpened: false, released: false }, null, 2)}\n`);
}
console.log(`v06p1 forge closed tests ok: ${assertions} assertions; C01–C12; ${totalFixtures} fixtures; ${totalInvocations} API calls; shared/snapshot SSR; localStorage写入0; gifts 10×false; GAME_PHASE=5; 不挂smith_ou.services; 无前台打造接线; 不开态/不软开/不release`);
