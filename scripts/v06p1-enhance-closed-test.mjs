// 强化正式旗已软开；只在 Vite SSR 内存图注入 false，保留 C01–C12 八 tip 零写。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { stripFormalEnhanceInstanceSource } from './v06p1-enhance-instance-source-proof.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), baselineOut = path.join(root, 'qa/out_v06p1_enhance_closed');
const out = process.env.ENHANCE_CLOSED_OUT ?? (process.env.XT_ENHANCE_QA_OUT ? path.join(process.env.XT_ENHANCE_QA_OUT, 'closed') : process.env.OUT_DIR) ?? path.join(root, 'qa/out_v06p1_enhance_open_preamble/closed');
const roots = new Map([['shared', shared], ['wt', path.join(root, 'data')], ['game', path.join(shared, 'game/data')]]);
const modes = [['shared', shared], ['snapshot', roots.get('wt')]];
const stringsSha = 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09';
const preFormalStringsSha = '92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab';
const enhanceFlagSha = 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e';
const formalStrings = {
  'enhance.formal.no_instance': '无正式装备实例，不可强化。',
  'enhance.formal.bad_type': '该装备类型不可强化。',
  'enhance.formal.protect': '护器符尚未映射，暂不可使用。',
  'enhance.formal.resources': '灵石或精炼石不足。',
  'enhance.formal.max_level': '已达强化上限或目标越界。',
  'enhance.formal.duplicate': '该强化请求已提交，请读取结果。',
  'enhance.formal.load_dedupe': '读档后只认已提交结果，不重抽。',
  'enhance.formal.foreign': '非本档装备实例，不可强化。',
};
const previousStringsSha = 'fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const forgeFlagSha = '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e';
const newSources = ['EnhanceClosed.ts', 'EnhanceOpenFlag.ts'];
const openFixtureSources = ['EnhanceGate.ts', 'EnhanceProgress.ts', 'v06p1-enhance-open.test.ts'];
const enhanceClosedSha = 'c52ffbfc269f3a41c309184d9781f23cf2511d5acec7570ebb44b84683b3e821';
const fixtureField = '__enhanceClosedSemanticFixture';
const closedStrings = {
  'enhance.closed.feature': '装备强化尚未开放。',
  'enhance.closed.entrance': '欧冶匠暂不提供强化，可查看说明。',
  'enhance.closed.enhance': '装备强化尚未开放，暂不可强化。',
  'enhance.closed.no_submit': '装备强化尚未开放，暂不可提交强化。',
  'enhance.closed.no_level': '装备强化尚未开放，不变更强化等级。',
  'enhance.closed.no_consume': '装备强化尚未开放，不扣灵石或精炼石。',
  'enhance.closed.load_refresh': '读档或刷新后强化仍未开放，暂不可强化。',
  'enhance.closed.later_service': '附灵与分解等后续服务尚未开放。',
};
const forgeStrings = {
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
  featureClosed: 'enhance.closed.feature', refuseEntrance: 'enhance.closed.entrance',
  refuseEnhance: 'enhance.closed.enhance', refuseSubmit: 'enhance.closed.no_submit',
  refuseLevel: 'enhance.closed.no_level', refuseConsume: 'enhance.closed.no_consume',
  refuseLoadRefresh: 'enhance.closed.load_refresh', refuseLaterService: 'enhance.closed.later_service',
};
const caseApis = {
  C01: 'featureClosed', C02: 'refuseEntrance', C03: 'refuseEnhance', C04: 'refuseSubmit',
  C05: 'refuseSubmit', C06: 'refuseLevel', C07: 'refuseConsume', C08: 'refuseLoadRefresh',
  C09: 'refuseLaterService', C10: 'refuseEnhance', C11: 'refuseSubmit', C12: 'refuseLoadRefresh',
};
const evidence = [], readOnlyBefore = new Map(), protectedFiles = {};
let assertions = 0, totalFixtures = 0, totalInvocations = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const report = row => { row = { compatibilityMeaning: 'formalOpen/softOpened 仅沿用入口状态；实例源已接线 ≠ soft-open 进包', formalTipsWired: true, formalInstanceSource: true, softOpenedEntrance: true, ...row }; evidence.push(row); console.log(JSON.stringify(row)); };
async function shaOrNull(file) {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}
async function filesUnder(directory, prefix = '') {
  const names = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    if (directory === path.join(root, 'src') && entry.name === 'gen') continue;
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) names.push(...await filesUnder(path.join(directory, entry.name), name));
    else if (entry.isFile()) names.push(name);
  }
  return names.sort();
}
// 只剥强化本窗三个 import 与一个完整提示块；打造原方法仍逐字钉旧 SHA。
function stripEnhanceSceneWiring(source) {
  for (const line of ["import { featureClosed as enhanceFeatureClosed } from '../EnhanceClosed';\n",
    "import { isEnhanceOpenForFixture } from '../EnhanceOpenFlag';\n",
    "import { EnhanceGate } from '../EnhanceGate';\n"]) {
    eq(source.split(line).length - 1, 1, `C01/C12 GameScene 强化授权 import 精确一次：${line.trim()}`);
    source = source.replace(line, '');
  }
  const block = [
    "    if (!isEnhanceOpenForFixture()) this.log(enhanceFeatureClosed().text, '#aaaaaa');",
    '    else {',
    '      const result = new EnhanceGate(this.prog).entrance();',
    "      this.log(result.allowed ? '装备强化已开放。' : result.text, '#aaaaaa');",
    '    }',
    '',
  ].join('\n');
  eq(source.split(block).length - 1, 1, 'C01/C12 GameScene 强化只增加一个完整只读提示块');
  const entry = source.match(/  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}/u)?.[0];
  ok(entry?.includes(`${block}    return true;`), 'C01/C12 同次 smith_ou 命中先打造再强化，提示后才 return true');
  return source.replace(block, '');
}

// Forge 冒烟仍核对原文；只恢复强化追加提示导致的两个日志位置及两个新断言。
function stripForgeSceneSmokeCompatibility(source) {
  const enhanceAssertion = "      eq(logs[logs.length - 1], { text: '装备强化已开放。', color: '#aaaaaa' }, '同次命中在打造提示后显示强化正式开态提示');\n";
  eq(source.split(enhanceAssertion).length - 1, 2, 'Forge 入口冒烟只增加两个同命中强化提示断言');
  source = source.split(enhanceAssertion).join('');
  const shiftedIndex = 'logs[logs.length - 2]';
  eq(source.split(shiftedIndex).length - 1, 2, 'Forge 原提示断言恰有两个前移日志索引，期望文本/颜色均不变');
  return source.split(shiftedIndex).join('logs[logs.length - 1]');
}

// 只剥获准的四个完整行；旧 Progress 的其余完整字节继续钉写前 SHA。
const enhanceProgressAddedLines = [
  "import { isValidEnhanceProgress, type EnhanceProgress } from './EnhanceProgress';",
  "  if (has('enhance') && !isValidEnhanceProgress(saved.enhance)) return false;",
  '  /** 仅承载明确授权的强化夹具事实；缺袋旧档不补建，读回不结算。 */',
  '  enhance: EnhanceProgress | undefined = undefined;',
];
function stripEnhanceProgress(source) {
  source = stripFormalEnhanceInstanceSource(source, eq);
  for (const line of enhanceProgressAddedLines) {
    eq(source.split(`${line}\n`).length - 1, 1, `Progress 强化可选夹具袋授权完整行精确一次：${line.trim()}`);
    source = source.replace(`${line}\n`, '');
  }
  return source;
}
function stripFormalForgeRegistration(source) {
  const block = [
    '        // 只有默认正式配方的完整成品可登记；显式测试配方结果仍只是夹具事实。',
    '        // 与库存、打造结果和收据共用本次 draft 提交，拒绝或保存中断会整笔回滚。',
    '        if (this.fixture.fixtureRecipes === undefined && this.fixture.formalRecipes === undefined',
    "          && !draft.registerFormalEnhanceInstance(result)) return reject('instance', '成品实例登记失败，保持原库存。');",
    '',
  ].join('\n');
  eq(source.split(block).length - 1, 1, 'ForgeGate只增加同事务默认正式成品登记获准块');
  return source.replace(block, '');
}
function keyPath(key) {
  if (key === 'GameScene.ts') return path.join(root, 'src/scenes/GameScene.ts');
  if (key === 'features.wt') return path.join(root, 'data/features.json');
  if (key.endsWith('.ts')) return path.join(root, 'src', key);
  const split = key.lastIndexOf('.'), name = key.slice(0, split), mode = key.slice(split + 1);
  ok(roots.has(mode), `保护表数据根已知：${key}`);
  return path.join(roots.get(mode), 'balance', `${name === 'strings' ? 'strings_zh' : name}.json`);
}

async function checkProtection() {
  const baseline = JSON.parse(await fs.readFile(path.join(baselineOut, 'protected-before-key.json'), 'utf8'));
  eq(baseline['ForgeOpenFlag.ts'], forgeFlagSha, '写前权威 ForgeOpenFlag SHA 固定');
  for (const [key, expected] of Object.entries(baseline)) {
    const file = keyPath(key), actual = await shaOrNull(file);
    const compared = key === 'GameScene.ts' ? hash(stripEnhanceSceneWiring(await fs.readFile(file, 'utf8')))
      : key === 'ForgeGate.ts' ? hash(stripFormalForgeRegistration(await fs.readFile(file, 'utf8'))) : actual;
    eq(compared, ['strings.shared', 'strings.wt'].includes(key) ? stringsSha : expected, `权威写前/写后保护字节（仅剥获准强化接线）：${key}`);
    protectedFiles[key] = actual; readOnlyBefore.set(file, actual);
  }
  const sourceBefore = JSON.parse(await fs.readFile(path.join(baselineOut, 'source-before.json'), 'utf8'));
  const relativeSource = name => name.startsWith('src/') ? name.slice(4) : name;
  const oldNames = Object.keys(sourceBefore).map(relativeSource);
  eq(await filesUnder(path.join(root, 'src')), [...oldNames, ...newSources, ...openFixtureSources].sort(),
    'src 仅新增强化关态 API/Flag 及三个开态夹具源码；既有 smith_ou 仅接最小提示');
  for (const [name, expected] of Object.entries(sourceBefore)) {
    const file = path.join(root, 'src', relativeSource(name)), actual = await shaOrNull(file);
    const compared = relativeSource(name) === 'Progress.ts' ? hash(stripEnhanceProgress(await fs.readFile(file, 'utf8')))
      : relativeSource(name) === 'ForgeGate.ts' ? hash(stripFormalForgeRegistration(await fs.readFile(file, 'utf8')))
      : relativeSource(name) === 'scenes/GameScene.ts' ? hash(stripEnhanceSceneWiring(await fs.readFile(file, 'utf8')))
      : relativeSource(name) === 'v06p1-forge-open.test.ts' ? hash(stripForgeSceneSmokeCompatibility(await fs.readFile(file, 'utf8'))) : actual;
    eq(compared, expected, `既有 src 完整字节不变（仅剥 Progress 四行、GameScene 强化最小提示及 Forge 冒烟日志位置兼容）：${name}`);
    readOnlyBefore.set(file, actual);
  }
  ok(oldNames.includes('features.ts') && oldNames.includes('data.ts') && oldNames.includes('scenes/GameScene.ts'),
    '保护 features/data/GAME_PHASE/GameScene 既有完整源码');
  const dataBefore = JSON.parse(await fs.readFile(path.join(baselineOut, 'data-files-before.json'), 'utf8'));
  const currentData = {};
  for (const [mode, dataRoot] of roots) {
    for (const directory of ['balance', 'maps']) for (const name of await filesUnder(path.join(dataRoot, directory))) {
      const file = path.join(dataRoot, directory, name), actual = await shaOrNull(file);
      currentData[`${mode}:${directory}/${name}`] = actual;
      readOnlyBefore.set(file, actual);
    }
    const file = path.join(dataRoot, 'features.json'), actual = await shaOrNull(file);
    currentData[`${mode}:features.json`] = actual;
    if (actual !== null) readOnlyBefore.set(file, actual);
  }
  for (const mode of ['shared', 'wt']) dataBefore[`${mode}:balance/strings_zh.json`] = stringsSha;
  eq(currentData, dataBefore, '三根 balance/maps/features 仅shared/wt strings正式八键获准变化，其余逐字 SHA 均不变');
  const forgeBefore = JSON.parse(await fs.readFile(path.join(baselineOut, 'forge-block-before.json'), 'utf8'));
  for (const [mode, dataRoot] of roots) {
    const raw = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
    const block = raw.match(/^.*"forge\.closed\.[^\n]*\n/gmu)?.join('') ?? '';
    eq(hash(block), forgeBefore[mode].rawLinesSha256, `${mode}: forge.closed.* 八个原始行完整字节不变`);
    const normalized = block.trimEnd().split('\n').map(line => line.trim().replace(/,$/u, '')).join('\n');
    eq(hash(normalized), forgeBefore[mode].normalizedLinesSha256, `${mode}: forge.closed.* 规范行块写前/写后一致`);
    eq(hash(normalized), 'fa6451ac7be94a0ecfb9b2ce11ef9f8c4c4bc60befda83bbe3169b61b90f2f11', `${mode}: forge 行块权威 SHA`);
  }
  report({ suite: 'protection', passed: true, existingSources: oldNames.length,
    protectedDataFiles: Object.keys(currentData).length, sourceOnlyAdded: [...newSources, ...openFixtureSources],
    sharedStringsOnlyFormalEightAdded: true, gameStringsUnchanged: true, enhanceGateFixtureSourceAllowed: true, minimalFrontendWiring: true, fullEnhanceUiAdded: false,
    EnhanceOpenFlag: true, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
}

async function checkStatic(mode, dataRoot) {
  const raw = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
  const strings = JSON.parse(raw), entries = Object.entries(strings);
  const formal = mode !== 'game';
  eq(hash(raw), formal ? stringsSha : preFormalStringsSha, `${mode}: strings 权威 SHA（game旧快照不动）`);
  eq(entries.length, formal ? 944 : 936, `${mode}: strings键数含_meta`);
  const preFormal = formal ? raw.replace(/,\n(?: {2}"enhance\.formal\.[^\n]+\n?){8}/u, '\n') : raw;
  eq(hash(preFormal), preFormalStringsSha, `${mode}: 原936键完整字节保留`);
  if (formal) {
    eq(entries.slice(936), Object.entries(formalStrings), `${mode}: 正式八键及文案逐字`);
    for (const [key, text] of Object.entries(formalStrings)) {
      eq(strings[key], text, `${mode}: ${key} 文案逐字`);
      ok(Array.from(text).length <= 40, `${mode}: ${key} Unicode ≤40 字`);
    }
  }
  eq(entries.slice(928, 936), Object.entries(closedStrings), `${mode}: slice(928,936) 恰为 enhance.closed 八键及逐字文案`);
  eq(entries.slice(920, 928), Object.entries(forgeStrings), `${mode}: forge 八键仍在 slice(920,928)，值逐字不变`);
  eq(entries.filter(([key]) => key.startsWith('enhance.closed.')), Object.entries(closedStrings), `${mode}: 恰有 enhance 八键`);
  const previous = preFormal.replace(/,\n(?: {2}"enhance\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(previous), previousStringsSha, `${mode}: 剥 enhance 八行还原 928 键原始完整字节`);
  for (const [key, text] of Object.entries(closedStrings)) {
    eq(strings[key], text, `${mode}: ${key} 文案逐字`);
    ok(Array.from(text).length <= 40, `${mode}: ${key} Unicode ≤40 字`);
  }
  eq(await shaOrNull(path.join(dataRoot, 'balance/enhance.json')), enhanceSha, `${mode}: enhance.json 冻结 SHA`);
  const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
  let gifts = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { gifts++; eq(child?.enabled, false, `${mode}: gifts enabled=false`); }
      visit(child);
    }
  }
  visit(npcs); eq(gifts, 10, `${mode}: gifts 10×false`);
  const smith = npcs.find(npc => npc.id === 'smith_ou');
  ok(smith, `${mode}: 既有 smith_ou 存在`);
  ok(!Object.hasOwn(smith, 'services'), `${mode}: smith_ou 无 services`);
  eq(smith.quests, [], `${mode}: smith_ou quests=[]`);
  report({ suite: 'static', dataMode: mode, passed: true, stringsSha: formal ? stringsSha : preFormalStringsSha, strings: entries.length,
    enhanceJsonSha: enhanceSha, giftsFalseCount: gifts, smithServices: false, smithQuests: [],
    EnhanceOpenFlag: true, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
}

async function checkSource() {
  const flagFile = path.join(root, 'src/EnhanceOpenFlag.ts'), flag = await fs.readFile(flagFile, 'utf8');
  eq(flag, '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isEnhanceOpenForFixture(): boolean { return true; }\n',
    'EnhanceOpenFlag 正式源码精确恒 true；仅 SSR 关态图允许内存注入 false');
  eq(hash(flag), enhanceFlagSha, 'EnhanceOpenFlag正式true完整字节SHA不变');
  eq(await shaOrNull(path.join(root, 'src/ForgeOpenFlag.ts')), forgeFlagSha, 'ForgeOpenFlag 完整 SHA 不变');
  const sourceFile = path.join(root, 'src/EnhanceClosed.ts'), source = await fs.readFile(sourceFile, 'utf8');
  eq(hash(source), enhanceClosedSha, 'EnhanceClosed 与 tip@64c26a4 完整字节相同');
  for (const file of [flagFile, sourceFile]) readOnlyBefore.set(file, await shaOrNull(file));
  const parsed = ts.createSourceFile('EnhanceClosed.ts', source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
  const imports = parsed.statements.filter(ts.isImportDeclaration).map(node => node.getText(parsed));
  eq(imports, ["import strings from '@xt/balance/strings_zh.json';"], 'Closed 唯一 import 是 strings，无 Progress/表结算/存档依赖');
  const functions = parsed.statements.filter(ts.isFunctionDeclaration);
  eq(functions.map(node => node.name.text).sort(), ['closed', ...Object.keys(apiTips)].sort(), '仅本地 closed 帮助函数及八个 API');
  const exports = functions.filter(node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword));
  eq(exports.map(node => node.name.text).sort(), Object.keys(apiTips).sort(), '恰有八个导出 API');
  for (const node of exports) eq(node.parameters.length, 0, `${node.name.text} 源码零参数`);
  ok(!/ForgeGate|ForgeClosed|ForgeOpenFlag|forge\.closed\./u.test(source), '强化 Closed 不依赖 Forge、不串 forge.closed.*');
  function inspect(node) {
    ok(!ts.isNewExpression(node) && !ts.isAwaitExpression(node) && !ts.isImportEqualsDeclaration(node)
      && !ts.isDeleteExpression(node) && !ts.isPostfixUnaryExpression(node), 'Closed 不构造、异步、删除、递增或引入旁路');
    if (ts.isPrefixUnaryExpression(node)) ok(![ts.SyntaxKind.PlusPlusToken, ts.SyntaxKind.MinusMinusToken].includes(node.operator), 'Closed 无前置递增/递减');
    if (ts.isCallExpression(node)) eq(node.expression.getText(parsed), 'closed', '仅调用本地 closed，不抽样、保存、请求或排队');
    if (ts.isBinaryExpression(node)) ok(!ts.isAssignmentOperator(node.operatorToken.kind), 'Closed 不赋值或改写状态');
    ts.forEachChild(node, inspect);
  }
  inspect(parsed);
  const search = [];
  for (const name of await filesUnder(path.join(root, 'src'))) {
    const text = await fs.readFile(path.join(root, 'src', name), 'utf8');
    const scanned = name === 'scenes/GameScene.ts' ? stripEnhanceSceneWiring(text) : text;
    if (!newSources.includes(name) && !openFixtureSources.includes(name)) ok(!/EnhanceClosed|EnhanceOpenFlag|EnhanceGate|enhance\.closed\./u.test(scanned), `${name}: 除 smith_ou 最小提示外无强化 API/Flag/Gate 消费者`);
    // ForgeGate 既有 enhance.forge 读表是打造品质规则，保持完整字节，不误判为强化入口。
    if (/^Forge[^/]*\.ts$/u.test(name)) ok(!/EnhanceClosed|EnhanceOpenFlag/u.test(text), `${name}: 打造不走 Enhance API 或 Flag`);
    text.split('\n').forEach((line, index) => {
      if (/enhance|强化|EnhanceClosed|EnhanceOpenFlag/iu.test(line)) search.push({ file: `src/${name}`, line: index + 1, text: line });
    });
  }
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  ok(!/EnhanceClosed|EnhanceOpenFlag|EnhanceGate|enhance\.closed\.|tryInteractEnhance|submitEnhance/u.test(stripEnhanceSceneWiring(scene)), 'GameScene 只接既有 smith_ou 最小强化提示');
  ok(!/EnhanceClosed|EnhanceOpenFlag|EnhanceGate|enhance\.closed\.|submitEnhance/u.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')), 'ShopPanel 不接强化');
  const gateSource = await fs.readFile(path.join(root, 'src/ForgeGate.ts'), 'utf8');
  ok(/laterService\(\): ForgeGateResult \{\s*if \(!isForgeOpenForFixture\(\)\) return ForgeClosed\.refuseLaterService\(\);\s*return ForgeClosed\.refuseLaterService\(\);\s*\}/u.test(gateSource),
    'ForgeGate.laterService 原样只返回 ForgeClosed.refuseLaterService');
  await fs.writeFile(path.join(out, 'source-search.json'), `${JSON.stringify(search, null, 2)}\n`);
  report({ suite: 'source', passed: true, importOnlyStrings: true, zeroArgumentApis: 8,
    EnhanceOpenFlag: true, sourceSearch: 'source-search.json', matches: search.length,
    enhanceGateFixtureSourceAllowed: true, minimalFrontendWiring: true, fullEnhanceUiAdded: false, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
}

// 以下是测试专用的装备/等级/属性/护器符/请求语义，未定义正式强化 schema 或物品映射。
// 正式 Progress.restore 不认识 fixtureField；重附原文只为断言拒绝 API 不改未知旧数据。
function semanticFixtures() {
  const base = { fixtureOnly: true, equipmentInstance: 'fixture-owned-instance', itemId: 'wood_sword',
    owner: 'fixture-current-slot', existingLevel: 5, requestedTarget: 6, attributes: { attack: 23, defense: 7 },
    refineStoneCount: 12, protectCharmSemanticCount: 3, requests: [], dedupRecords: [], receipts: [], pendingQueue: [] };
  return [
    ['legal-equipped-and-funded', base],
    ['non-equipment-or-other-owner', { ...clone(base), itemId: 'hp_pill_small', owner: 'fixture-other-slot' }],
    ['missing-or-duplicate-target-row', { ...clone(base), targetRowsFixture: [null, { to: 6 }, { to: 6 }], invalidRateFixture: -1 }],
    ['max-level-and-out-of-range', { ...clone(base), existingLevel: 12, requestedTarget: 13 }],
    ['unknown-old-level-and-attributes', { ...clone(base), existingLevel: 'fixture-unknown-level', rawUnknown: { preserve: true } }],
    ['insufficient-resources', { ...clone(base), refineStoneCount: 0, protectCharmSemanticCount: 0 }],
    ['old-duplicate-callback', { ...clone(base), callbacksFixture: ['fixture-old', 'fixture-old'], receipts: ['fixture-existing-result'] }],
    ['contending-and-stale-requests', { ...clone(base), requests: [{ fixtureId: 'fixture-A' }, { fixtureId: 'fixture-B' }], requestedTarget: 4 }],
    ['old-save-with-unfinished-queue', { ...clone(base), requests: [{ fixtureId: 'fixture-old', state: 'unknown', raw: { preserve: true } }],
      dedupRecords: ['fixture-old-record'], pendingQueue: ['fixture-existing-pending'] }],
  ];
}

async function runGraph(mode, dataRoot, closedFixtureOnly, refreshPayloads = null) {
  let flagLoads = 0;
  const flagId = '\0v06p1-memory-closed-enhance-flag';
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-enhance-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (closedFixtureOnly && /(?:^|\/)EnhanceOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isEnhanceOpenForFixture() { return false; }'; }
      },
    }],
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  let storageWrites = 0, sentinelCalls = 0, fixtures = 0, invocations = 0;
  const forbidStorage = operation => { storageWrites++; throw new Error(`${mode}: 禁止 localStorage.${operation}`); };
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: () => forbidStorage('setItem'), removeItem: () => forbidStorage('removeItem'), clear: () => forbidStorage('clear'),
    key: index => [...saved.keys()][index] ?? null, get length() { return saved.size; },
  } });
  try {
    const flag = await server.ssrLoadModule('/src/EnhanceOpenFlag.ts');
    eq(flag.isEnhanceOpenForFixture(), !closedFixtureOnly, `${mode}: 正式旗 true；关态仅 SSR 内存注入 false`);
    eq(flagLoads, closedFixtureOnly ? 1 : 0, `${mode}: 正式图 flagLoads=0，内存关态图 flagLoads=1`);
    if (!closedFixtureOnly) {
      eq(storageWrites, 0, `${mode}: 正式旗验证无存储写入`);
      report({ suite: 'formal-graph', dataMode: mode, graph: 'formal-open', passed: true, flagLoads, storageWrites,
        EnhanceOpenFlag: true, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
      return;
    }
    const api = await server.ssrLoadModule('/src/EnhanceClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { EnhanceGate } = await server.ssrLoadModule('/src/EnhanceGate.ts');
    const gateProgress = new Progress(), beforeGate = clone(gateProgress.exportSave()), gate = new EnhanceGate(gateProgress);
    for (const [method, apiName] of Object.entries({ feature: 'featureClosed', entrance: 'refuseEntrance', enhance: 'refuseEnhance',
      submit: 'refuseSubmit', level: 'refuseLevel', consume: 'refuseConsume', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' })) {
      eq(await gate[method](), api[apiName](), `${mode}: 内存关态 Gate.${method} 首旗路由原八 tip`);
    }
    eq(gateProgress.exportSave(), beforeGate, `${mode}: 内存关态 Gate 八入口完整存档零增量`);
    eq(storageWrites, 0, `${mode}: 内存关态 Gate 八入口存储写入0`);
    eq(flagLoads, 1, `${mode}: Gate 与 Closed 共用唯一 memory-closed Flag 模块`);
    const { ForgeGate } = await server.ssrLoadModule('/src/ForgeGate.ts');
    const forge = await server.ssrLoadModule('/src/ForgeClosed.ts');
    const forgeFlag = await server.ssrLoadModule('/src/ForgeOpenFlag.ts');
    const data = await server.ssrLoadModule('/src/data.ts');
    const features = await server.ssrLoadModule('/src/features.ts'), featuresBefore = clone(features.featureFlags());
    eq(flag.isEnhanceOpenForFixture(), false, `${mode}: 内存关态 EnhanceOpenFlag false`);
    eq(flag.isEnhanceOpenForFixture.length, 0, `${mode}: 内存关态 Flag 零参数`);
    eq(Object.keys(api).sort(), Object.keys(apiTips).sort(), `${mode}: 真实 SSR 仅八个强化 API`);
    eq(data.GAME_PHASE, 5, `${mode}: 真实 GAME_PHASE===5`);
    ok(!Object.keys(featuresBefore).some(key => /enhance/iu.test(key)), `${mode}: features 无强化开态字段`);
    for (const [name, fn] of Object.entries(forge)) {
      const result = fn();
      ok(result.tipKey.startsWith('forge.closed.'), `${mode}: ForgeClosed.${name} 仍用 forge.closed.*`);
      eq(result, { allowed: false, tipKey: result.tipKey, text: forgeStrings[result.tipKey] }, `${mode}: ForgeClosed.${name} 原八键只读拒绝`);
    }
    const isolationProgress = new Progress(), isolationBefore = clone(isolationProgress.exportSave());
    eq(new ForgeGate(isolationProgress).laterService(), forge.refuseLaterService(), `${mode}: 正式 ForgeGate.laterService 仍用 forge.closed.later_service`);
    eq(api.refuseLaterService().tipKey, 'enhance.closed.later_service', `${mode}: 强化附灵/分解只用 enhance.closed.later_service`);
    eq(isolationProgress.exportSave(), isolationBefore, `${mode}: Forge 后续提示抽检存档零增量`);
    const forgeFlagBefore = forgeFlag.isForgeOpenForFixture();

    async function exercise(p, label) {
      for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
        'settleQuestRewards', 'gainExp', 'gainLifeSkillExp', 'addItem', 'removeItem', 'grantSkill', 'grantRecipe',
        'addStones', 'removeStones', 'enhance', 'submitEnhance', 'settleEnhance', 'setEnhanceLevel', 'applyEnhanceAttributes',
        'consumeRefineStone', 'consumeProtectCharm', 'createEnhanceRequest', 'recordEnhanceReceipt', 'recordEnhanceDedup',
        'enqueueEnhanceWrite', 'enchant', 'salvage']) {
        Object.defineProperty(p, method, { configurable: true, value: () => {
          sentinelCalls++; throw new Error(`${label}: 强化关态禁止调用 ${method}`);
        } });
      }
      const beforeState = clone(p), beforeSave = clone(p.exportSave());
      const beforeInventory = clone(p.inventory), beforeStones = p.stones, beforeEquipment = clone(p.equip);
      const beforeForging = [p.forgingLevel, p.forgingExp], saveBytes = JSON.stringify(beforeSave);
      saved.set('v06p1-enhance-existing-slot', saveBytes); // 测试内存播种，不调用存储写 API。
      const diskBefore = [...saved], writesBefore = storageWrites;
      const call = name => {
        invocations++;
        eq(api[name].length, 0, `${label}: ${name} 零参数，不接 Progress 或写入意图`);
        const result = api[name]();
        eq(result, { allowed: false, tipKey: apiTips[name], text: closedStrings[apiTips[name]] }, `${label}: ${name} 恒只读拒绝`);
        ok(!result.tipKey.startsWith('forge.closed.'), `${label}: 强化提示不串 Forge`);
        return result;
      };
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [caseId, name] of Object.entries(caseApis)) {
          call(name);
          eq(clone(p), beforeState, `${label}/${caseId}: 完整状态含 fixture 等级/属性/护器符/请求/去重/队列零增量`);
        }
        for (let click = 0; click < 10; click++) call('refuseEnhance');
        const results = await Promise.all(['refuseSubmit', 'refuseSubmit', 'refuseEnhance', 'refuseEnhance', 'refuseLevel', 'refuseConsume']
          .map(name => Promise.resolve().then(() => call(name))));
        ok(results.every(result => result.allowed === false), `${label}/C03/C10/C11: 连点/旧回调/Promise.all 全拒绝`);
        eq(p.inventory, beforeInventory, `${label}: inventory 含精炼石零增量`);
        eq(p.stones, beforeStones, `${label}: 灵石零增量`);
        eq(p.equip, beforeEquipment, `${label}: 已有装备原样保留`);
        eq([p.forgingLevel, p.forgingExp], beforeForging, `${label}: forging 等级/经验零增量`);
        eq(clone(p), beforeState, `${label}: 完整 clone 零增量`);
        eq(p.exportSave(), beforeSave, `${label}: exportSave 完整零增量`);
        eq(JSON.stringify(p.exportSave()), saveBytes, `${label}: exportSave 序列化字节不变`);
        eq([...saved], diskBefore, `${label}: 既有存档原文不变`);
        eq(storageWrites, writesBefore, `${label}: localStorage 写入0`);
        eq(sentinelCalls, 0, `${label}: 所有抛错写入哨兵调用0`);
        eq(flag.isEnhanceOpenForFixture(), false, `${label}: 连点后仍关态`);
      }
      fixtures++;
      return beforeSave;
    }

    const payloads = [];
    if (!refreshPayloads) {
      for (const [label, fixture] of semanticFixtures()) {
        const p = new Progress();
        p.stones = label === 'insufficient-resources' ? 0 : 1234;
        p.inventory = { wood_sword: 1, hp_pill_small: 3, refine_stone: label === 'insufficient-resources' ? 0 : 12 };
        p.equip = { weapon: 'wood_sword' }; p.forgingLevel = 3; p.forgingExp = 7;
        p[fixtureField] = clone(fixture);
        payloads.push([label, await exercise(p, `${mode}/${label}`)]);
      }
    } else for (const [label, payload] of refreshPayloads) payloads.push([label, clone(payload)]);
    for (const [label, payload] of payloads) {
      const serialized = JSON.stringify(payload), writesBeforeLoad = storageWrites;
      const restored = Progress.restore(JSON.parse(serialized), false);
      eq(storageWrites, writesBeforeLoad, `${mode}/${label}/C08/C12: 真实 restore(false) 无存储写`);
      eq([restored.inventory, restored.stones, restored.equip, restored.forgingLevel, restored.forgingExp],
        [payload.inventory, payload.stones, payload.equip, payload.forgingLevel, payload.forgingExp], `${mode}/${label}: 真实读档保留库存/灵石/装备/forging`);
      ok(!Object.hasOwn(restored, fixtureField), `${mode}/${label}: 正式 restore/schema 未登记测试语义字段`);
      // 原始未知旧字段仅作为 fixture 重附，不宣称强化存档消费者已存在。
      restored[fixtureField] = clone(payload[fixtureField]);
      eq(restored[fixtureField], payload[fixtureField], `${mode}/${label}: 原有 fixture 等级/属性/业务记录/队列原文保留`);
      await exercise(restored, `${mode}/${refreshPayloads ? 'fresh-ssr-refresh' : 'real-restore'}/${label}`);
      const jsonReloaded = Object.assign(new Progress(), JSON.parse(serialized));
      eq(jsonReloaded[fixtureField], payload[fixtureField], `${mode}/${label}: JSON 读回完整保留 fixture 原文`);
      await exercise(jsonReloaded, `${mode}/json-save-reload/${label}`);
    }
    eq(features.featureFlags(), featuresBefore, `${mode}: features 完整不变`);
    eq(forgeFlag.isForgeOpenForFixture(), forgeFlagBefore, `${mode}: Forge Flag 既有状态不变且不能授权强化`);
    eq(flag.isEnhanceOpenForFixture(), false, `${mode}: 全部调用后内存图仍 false`);
    eq(storageWrites, 0, `${mode}: 所有调用/读档/刷新 localStorage 写入0`);
    eq(sentinelCalls, 0, `${mode}: 所有写哨兵调用0`);
    totalFixtures += fixtures; totalInvocations += invocations;
    report({ suite: 'runtime', dataMode: mode, graph: 'memory-closed', freshSsrRefresh: !!refreshPayloads, flagLoads, passed: true,
      cases: Object.keys(caseApis), fixtures, invocations, zeroArgumentApis: 8, storageWrites, sentinelCalls,
      semanticFixtureOnly: true, formalEnhanceSchemaAdded: true, flagInjection: true, memoryClosedFlag: false,
      EnhanceOpenFlag: true, enhanceGateFixtureSourceAllowed: true, minimalFrontendWiring: true, fullEnhanceUiAdded: false, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
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
  eq((await fs.readFile(path.join(roots.get('wt'), 'balance/strings_zh.json'))).equals(sharedStrings), true, 'shared/wt: strings944同字节');
  eq(await shaOrNull(path.join(roots.get('game'), 'balance/strings_zh.json')), preFormalStringsSha, 'game旧strings936快照保持原字节');
  for (const [mode, dataRoot] of modes) {
    await runGraph(mode, dataRoot, false);
    const payloads = await runGraph(mode, dataRoot, true);
    await runGraph(mode, dataRoot, true, payloads);
  }
  passed = true;
} finally {
  for (const [file, expected] of readOnlyBefore) eq(await shaOrNull(file), expected, `自检前后只读 SHA 不变：${file}`);
  await fs.writeFile(path.join(out, 'selftest-protected-after.json'), `${JSON.stringify(protectedFiles, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'v06p1-enhance-closed-evidence.json'), `${JSON.stringify({ passed, assertions, stringsSha, enhanceJsonSha: enhanceSha,
    forgeFlagSha, cases: caseApis, totalFixtures, totalInvocations, protectedFiles, evidence,
    EnhanceOpenFlag: true, enhanceGateFixtureSourceAllowed: true, minimalFrontendWiring: true, fullEnhanceUiAdded: false, formalOpen: true, closedFixtureOnly: true,
    semanticFixtureOnly: true, formalEnhanceSchemaAdded: true, softOpened: true, released: false,
    formalTipsWired: true, formalInstanceSource: true, softOpenedEntrance: true, enhanceFlagSha }, null, 2)}\n`);
}
console.log(`v06p1 enhance closed tests ok: ${assertions} assertions; C01–C12; ${totalFixtures} semantic fixtures; ${totalInvocations} API calls; shared/snapshot + fresh SSR; localStorage写入0; shared/wt strings944、game旧936; gifts10×false; GAME_PHASE=5; EnhanceOpenFlag=true; 不挂smith_ou.services; smith_ou同次命中仅提示、无完整强化UI; formalOpen:true; closedFixtureOnly:true; softOpened:true; formalTipsWired:true; formalInstanceSource:true; softOpenedEntrance:true; released:false`);
