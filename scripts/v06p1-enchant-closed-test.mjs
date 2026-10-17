import { hasSmithServicesScene, stripSmithServicesScene } from './v06p1-smith-services-scene-compat.mjs';
// 附灵正式磁盘 soft-open；两根先核 true，再仅在 Vite SSR 注入 false 执行 C01–C10 八 tip 零写。
import assert from 'node:assert/strict';
import { stripSalvageSceneWiring, checkSalvageCompatibility } from './v06p1-salvage-soft-open-compat-proof.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const out = process.env.ENCHANT_CLOSED_OUT ?? path.join(root, 'qa/out_v06p1_salvage_soft_open/regressions/enchant-closed');
const roots = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const targets = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda',
};
const frozen = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const frozenSources = {
  'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  'src/EnchantClosed.ts': '15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
};
const apiTips = {
  featureClosed: 'enchant.closed.feature', refuseEntrance: 'enchant.closed.entrance',
  refuseEnchant: 'enchant.closed.enchant', refuseSubmit: 'enchant.closed.no_submit',
  refuseResult: 'enchant.closed.no_result', refuseElement: 'enchant.closed.no_element',
  refuseLoadRefresh: 'enchant.closed.load_refresh', refuseLaterService: 'enchant.closed.later_service',
};
const evidence = [], protectedFiles = {}, captured = new Map();
let assertions = 0, passed = false, staticChecksPassed = false, totalFixtures = 0, totalInvocations = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const hasExport = node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
const source = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  if (expected) eq(actual, expected, `冻结/目标 SHA MATCH: ${path.relative(root, file)}`);
  captured.set(file, actual); protectedFiles[file] = actual;
}
// 仅允许欧冶匠同一次命中追加三个 import 与一个完整只读提示块。
function stripEnchantSceneWiring(text) {
  if (hasSmithServicesScene(text)) return stripSmithServicesScene(text, eq);
  text = stripSalvageSceneWiring(text, eq);
  for (const line of ["import { featureClosed as enchantFeatureClosed } from '../EnchantClosed';\n",
    "import { isEnchantOpenForFixture } from '../EnchantOpenFlag';\n",
    "import { EnchantGate } from '../EnchantGate';\n"]) {
    eq(text.split(line).length - 1, 1, `GameScene 附灵授权 import 精确一次：${line.trim()}`);
    text = text.replace(line, '');
  }
  const block = [
    "    if (!isEnchantOpenForFixture()) this.log(enchantFeatureClosed().text, '#aaaaaa');",
    '    else {',
    '      const result = new EnchantGate(this.prog).entrance();',
    "      this.log(result.allowed ? '装备附灵已开放。' : result.text, '#aaaaaa');",
    '    }',
    '',
  ].join('\n');
  eq(text.split(block).length - 1, 1, 'GameScene 附灵只增加一个完整只读提示块');
  const entrance = text.match(/  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}/u)?.[0];
  ok(entrance?.includes(`${block}    return true;`), '同次 smith_ou 命中末尾附灵提示后才 return true');
  const forgeIndex = entrance?.indexOf('new ForgeGate(this.prog).entrance()') ?? -1;
  const enhanceIndex = entrance?.indexOf('new EnhanceGate(this.prog).entrance()') ?? -1;
  const enchantIndex = entrance?.indexOf('new EnchantGate(this.prog).entrance()') ?? -1;
  ok(forgeIndex >= 0 && enhanceIndex > forgeIndex && enchantIndex > enhanceIndex, '同次命中依次 forge→enhance→enchant，无提前 return 饿死附灵');
  return text.replace(block, '');
}
async function sourceChecks() {
  evidence.push(await checkSalvageCompatibility(root, shared, eq));
  const closedPath = path.join(root, 'src/EnchantClosed.ts'), flagPath = path.join(root, 'src/EnchantOpenFlag.ts');
  const closedText = await fs.readFile(closedPath, 'utf8'), flagText = await fs.readFile(flagPath, 'utf8');
  eq(flagText, '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isEnchantOpenForFixture(): boolean { return true; }\n',
    'EnchantOpenFlag 正式源码精确恒 true；仅 SSR 关态图允许注入 false');
  const closed = source(closedPath, closedText), flag = source(flagPath, flagText);
  const imports = closed.statements.filter(ts.isImportDeclaration);
  eq(imports.map(node => node.moduleSpecifier.text), ['@xt/balance/strings_zh.json'], '唯一 import 仅读 strings');
  eq(imports[0].importClause?.name?.text, 'strings', '唯一默认字符串绑定');
  const exports = closed.statements.filter(node => ts.isFunctionDeclaration(node) && hasExport(node));
  eq(exports.map(node => node.name?.text).sort(), Object.keys(apiTips).sort(), '恰有八个公开 API');
  for (const node of exports) {
    const name = node.name.text;
    eq(node.parameters.length, 0, `${name} 零参数`);
    eq(node.body.statements.length, 1, `${name} 仅一条返回语句`);
    const statement = node.body.statements[0];
    ok(ts.isReturnStatement(statement) && statement.expression && ts.isCallExpression(statement.expression), `${name} 只调用只读 helper`);
    const call = statement.expression;
    eq(call.expression.getText(closed), 'closed', `${name} 不接 Gate/服务/请求`);
    eq(call.arguments.map(arg => ts.isStringLiteral(arg) ? arg.text : null), [apiTips[name]], `${name} 精确键映射`);
  }
  const helper = closed.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'closed');
  ok(helper && !hasExport(helper) && helper.parameters.length === 1, '私有 helper 只收 tipKey');
  eq(helper.body.statements.length, 1, 'helper 无其他副作用语句');
  eq(helper.body.statements[0].getText(closed).replace(/\s/gu, ''), 'return{allowed:false,tipKey,text:strings[tipKey]};', '恒 false 且 text 仅读 strings[tipKey]');
  const flagImports = flag.statements.filter(ts.isImportDeclaration);
  eq(flagImports.length, 0, '附灵 Flag 无 import，不借 Forge/Enhance Flag');
  const flagExports = flag.statements.filter(node => ts.isFunctionDeclaration(node) && hasExport(node));
  eq(flagExports.map(node => node.name?.text), ['isEnchantOpenForFixture'], '独立 Flag 仅一个公开 API');
  eq(flagExports[0].parameters.length, 0, 'Flag 零参数');
  eq(flagExports[0].body.statements.map(node => node.getText(flag).replace(/\s/gu, '')), ['returntrue;'], '正式 Flag 恒 true');
  // soft-open 仅翻正式旗；C 套件仍在独立 SSR false 图验证关态首旗优先，未执行 O 表。
  const gatePath = path.join(root, 'src/EnchantGate.ts');
  const gateAst = source(gatePath, await fs.readFile(gatePath, 'utf8'));
  const gateClass = gateAst.statements.find(ts.isClassDeclaration);
  const gateTips = { feature: 'featureClosed', entrance: 'refuseEntrance', enchant: 'refuseEnchant', submit: 'refuseSubmit',
    result: 'refuseResult', element: 'refuseElement', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' };
  for (const [name, tip] of Object.entries(gateTips)) {
    const method = gateClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(gateAst) === name);
    ok(method, '开态夹具 Gate 存在独立入口: ' + name);
    eq(method.body.statements[0].getText(gateAst).replace(/\s/gu, ''),
      'if(!isEnchantOpenForFixture())returnEnchantClosed.' + tip + '();', name + ' 正式关态首句仍原样返回八 tip');
  }
  ok((await fs.readFile(path.join(root, 'src/EnchantProgress.ts'), 'utf8')).includes('isValidEnchantProgress'),
    '开态夹具令授权最小可选完整袋，缺字段旧档仍由 C 套件验证');
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  ok(!/EnchantClosed|EnchantOpenFlag|EnchantGate|enchant\.closed\.|tryInteractEnchant|submitEnchant/u.test(stripEnchantSceneWiring(scene)),
    '生产 GameScene 只接 smith_ou 最小附灵提示');
  ok(!/fixtureInstances/u.test(scene), '生产 GameScene 不注入 fixtureInstances');
  ok(!/EnchantClosed|EnchantOpenFlag|EnchantGate|enchant\.closed\.|submitEnchant/u.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')),
    'ShopPanel 不接附灵');
  for (const [name, service] of [['EnhanceGate', 'EnhanceClosed'], ['ForgeGate', 'ForgeClosed']]) {
    const text = await fs.readFile(path.join(root, `src/${name}.ts`), 'utf8');
    const ast = source(`${name}.ts`, text), klass = ast.statements.find(ts.isClassDeclaration);
    const method = klass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'laterService');
    ok(method && method.body.statements.length === 2, `${name}.laterService 保留既有两条语句`);
    eq(method.body.statements[1].getText(ast).replace(/\s/gu, ''), `return${service}.refuseLaterService();`, `${name} 不串独立附灵键`);
  }
  for (const file of ['src/EnchantClosed.ts', 'src/EnchantOpenFlag.ts', 'src/Progress.ts', 'src/EnhanceGate.ts',
    'src/ForgeGate.ts', 'src/EnhanceClosed.ts', 'src/ForgeClosed.ts', 'src/scenes/GameScene.ts', 'data/features.json']) await guard(path.join(root, file));
  evidence.push({ suite: 'source-static', passed: true, uniqueStringsImport: true, zeroArgumentApis: 8,
    flagIndependent: true, flagAlwaysTrue: true, gateClosedFirst: true, optionalEnchantSchema: true, noProductionFixtureInjection: true,
    minimalFrontendWiring: true, sameHitTipOrder: ['forge', 'enhance', 'enchant', 'salvage'], fullEnchantUiAdded: false,
    existingLaterServicePreserved: true, apiTips });
}
async function dataChecks() {
  for (const [name, expected] of Object.entries(frozenSources)) await guard(path.join(root, name), expected);
  for (const [mode, dataRoot] of roots) {
    for (const [name, expected] of Object.entries({ ...frozen, ...targets })) await guard(path.join(dataRoot, 'balance', name), expected);
    const strings = await json(path.join(dataRoot, 'balance/strings_zh.json'));
    eq(Object.keys(strings).length, 960, `${mode}: strings 960 键含 _meta`);
    eq(Object.keys(strings).filter(key => key.startsWith('enchant.closed.')).sort(), Object.values(apiTips).sort(), `${mode}: 恰有八附灵关态键`);
    for (const key of Object.values(apiTips)) {
      ok(typeof strings[key] === 'string' && strings[key].length > 0, `${mode}: ${key} 有文案`);
      ok(Array.from(strings[key]).length <= 40, `${mode}: ${key} Unicode ≤40`);
    }
    const items = await json(path.join(dataRoot, 'balance/items.json')), materials = await json(path.join(dataRoot, 'balance/materials.json'));
    const itemRows = items.items ?? items, materialRows = materials.materials ?? materials;
    const item = itemRows.filter(row => row.id === 'beast_core'), material = materialRows.filter(row => row.id === 'beast_core');
    eq(item.length, 1, `${mode}: beast_core 正式 items 登记唯一`);
    eq(material.length, 1, `${mode}: beast_core 正式 materials 登记唯一`);
    eq(item[0], { id: 'beast_core', name: '妖兽内丹', phase: 5, icon: 'icon_beast_core' }, `${mode}: items 镜像只读精确记录`);
    eq([material[0].id, material[0].type, material[0].phase], ['beast_core', 'material', 5], `${mode}: 有效材料登记保持`);
    const effective = Object.fromEntries([...itemRows, ...materialRows].map(row => [row.id, row]));
    eq(effective.beast_core, material[0], `${mode}: 同 id 覆盖语义读取材料行`);
    const npcs = await json(path.join(dataRoot, 'balance/npcs.json')), npcRows = npcs.npcs ?? npcs;
    const gifts = npcRows.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${mode}: gifts 登记仍 10 条`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${mode}: gifts 10×false`);
    const smith = npcRows.find(row => row.id === 'smith_ou');
    ok(smith && !Object.prototype.hasOwnProperty.call(smith, 'services'), `${mode}: 不挂 smith_ou.services`);
    eq(await fs.stat(path.join(dataRoot, 'balance/enhance_enchant.json')).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)), false, `${mode}: 不增附灵数量/映射表`);
    evidence.push({ suite: 'data-static', dataMode: mode, passed: true, beastCoreMapped: true,
      beastCoreMappedMeaning: 'items/materials 与合并记录登记齐；不代表消费/存档/事务或生产放行',
      stringsKeys: Object.keys(strings).length, targetShas: targets, frozenShas: frozen, giftsDisabled: 10, smithServicesAdded: false });
  }
  for (const name of Object.keys(targets)) eq(await fs.readFile(path.join(roots[0][1], 'balance', name)),
    await fs.readFile(path.join(roots[1][1], 'balance', name)), `shared/snapshot ${name} 同字节`);
}
async function runGraph(dataMode, dataRoot, graph, payloads) {
  const memoryClosed = graph !== 'formal-open';
  let flagLoads = 0;
  const flagId = '\0v06p1-memory-closed-enchant-flag';
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-enchant-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (memoryClosed && /(?:^|\/)EnchantOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isEnchantOpenForFixture() { return false; }'; }
      },
    }],
  });
  try {
    const flag = await server.ssrLoadModule('/src/EnchantOpenFlag.ts');
    eq(flag.isEnchantOpenForFixture(), !memoryClosed, `${dataMode}/${graph}: 正式旗 true；关态仅 SSR 内存注入 false`);
    eq(flagLoads, memoryClosed ? 1 : 0, `${dataMode}/${graph}: 正式 flagLoads=0，内存关态 flagLoads=1`);
    if (!memoryClosed) {
      evidence.push({ suite: 'formal-graph', dataMode, graph, passed: true, flagLoads,
        EnchantOpenFlag: true, softOpenedEnchant: true, released: false, closedFixtureOnly: true });
      console.log(JSON.stringify({ suite: 'formal-graph', dataMode, graph, flagLoads, EnchantOpenFlag: true, passed: true }));
      return;
    }
    const api = await server.ssrLoadModule('/src/EnchantClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { EnchantGate } = await server.ssrLoadModule('/src/EnchantGate.ts');
    const p = new Progress(), before = JSON.parse(JSON.stringify(p.exportSave()));
    let gateWrites = 0;
    for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync'])
      Object.defineProperty(p, method, { configurable: true, value() {
        gateWrites++; throw new Error('附灵内存关态 Gate 不得提交、存储或排队');
      } });
    const gate = new EnchantGate(p);
    for (const [method, apiName] of Object.entries({ feature: 'featureClosed', entrance: 'refuseEntrance', enchant: 'refuseEnchant',
      submit: 'refuseSubmit', result: 'refuseResult', element: 'refuseElement', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' }))
      eq(await gate[method](), api[apiName](), `${dataMode}/${graph}: Gate.${method} 内存关态首旗返回原八 tip`);
    eq(p.exportSave(), before, `${dataMode}/${graph}: 内存关态 Gate 八入口完整存档零增量`);
    eq(gateWrites, 0, `${dataMode}/${graph}: 内存关态 Gate 事务、保存与排队 0`);
    const suite = await server.ssrLoadModule('/src/v06p1-enchant-closed.test.ts');
    const result = await suite.runEnchantClosedTests({ dataMode, graph, payloads });
    eq(result.passed, true, `${dataMode}/${graph}: suite 通过`);
    eq(suite.apiTips, apiTips, `${dataMode}/${graph}: runtime 八 API 对照静态表一致`);
    eq([result.sentinelCalls, result.storageWrites, result.localStorageWrites, result.indexedDbOpens], [0, 0, 0, 0], `${dataMode}/${graph}: 拒绝动作全部零写`);
    assertions += result.assertions; totalFixtures += result.fixtures; totalInvocations += result.invocations;
    const { payloads: nextPayloads, ...row } = result;
    eq(flagLoads, 1, `${dataMode}/${graph}: C 套件与 Gate 共用唯一 SSR false Flag`);
    evidence.push({ suite: 'v06p1-enchant-closed-graph', ...row, flagLoads, memoryClosed: true,
      formalEnchantOpenFlag: true, gateClosedTips: 8, gateWrites });
    console.log(JSON.stringify({ suite: 'v06p1-enchant-closed-graph', dataMode, graph, assertions: result.assertions,
      fixtures: result.fixtures, invocations: result.invocations, ordinarySaveSetupWrites: result.ordinarySaveSetupWrites,
      sentinelCalls: result.sentinelCalls, storageWrites: result.storageWrites, flagLoads, memoryClosed: true, passed: true }));
    return JSON.parse(JSON.stringify(nextPayloads));
  } finally { await server.close(); }
}

await fs.mkdir(out, { recursive: true });
try {
  await sourceChecks(); await dataChecks(); staticChecksPassed = true;
  for (const [mode, dataRoot] of roots) {
    await runGraph(mode, dataRoot, 'formal-open');
    const payloads = await runGraph(mode, dataRoot, 'initial');
    await runGraph(mode, dataRoot, 'fresh-ssr-refresh', payloads);
  }
  passed = true;
} finally {
  for (const [file, expected] of captured) eq(hash(await fs.readFile(file)), expected, `运行前后只读 SHA MATCH: ${file}`);
  const graphs = evidence.filter(row => row.suite === 'v06p1-enchant-closed-graph');
  const cases = Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
    const caseId = `C${String(i + 1).padStart(2, '0')}`;
    return [caseId, { executed: graphs.length === 4 && graphs.every(row => row.cases[caseId]?.executed === true),
      evidenceKeys: graphs.flatMap(row => row.cases[caseId]?.evidenceKeys.map(key => `${row.dataMode}/${row.graph}/${key}`) ?? []) }];
  }));
  const result = { passed, assertions, totalFixtures, totalInvocations, apiTips, cases,
    enchantClosedTipsWired: passed, EnchantOpenFlag: true, softOpenedEnchant: true, released: false,
    formalOpen: true, closedFixtureOnly: true, closedRuntimeFlag: false,
    EnhanceOpenFlagPreserved: true,
    beastCoreMapped: true, beastCoreMappedMeaning: '仅登记齐；不宣称附灵消费、事务或生产开放', protectCharmSoftOpenPreserved: true,
    ForgeOpenFlag: true, EnhanceOpenFlag: true, targetShas: targets, frozenShas: frozen, frozenSourceShas: frozenSources,
    sentinelCalls: graphs.reduce((sum, row) => sum + row.sentinelCalls, 0),
    storageWrites: graphs.reduce((sum, row) => sum + row.storageWrites, 0),
    ordinarySaveSetupWrites: graphs.reduce((sum, row) => sum + row.ordinarySaveSetupWrites, 0),
    storageScope: 'storageWrites=拒绝/读档过程；ordinarySaveSetupWrites=仅 C08 普通 saveAsync 准备阶段',
    semanticFixtureOnly: true, enchantSchemaAdded: true, enchantSchemaScope: '开态夹具令授权可选完整袋；本 C 套件不执行开态', unknownFieldsRetainedByRestore: false,
    openFixtureTableExecuted: false, testsUseRealSsrModule: true, freshIndependentGraphs: 6,
    formalGraphs: evidence.filter(row => row.suite === 'formal-graph').length, memoryClosedGraphs: graphs.length,
    compatibilityMeaning: '附灵 soft-open ≠ 进包 ≠ 发版；fixture≠正式；本 runner 正式磁盘图仅核 true，C01–C10 仅 SSR false 图执行；O 表交 open runner',
    protectedFiles, evidence };
  await fs.writeFile(path.join(out, 'v06p1-enchant-closed-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify({ passed: staticChecksPassed, expectedFrozenAndTargetsMatched: staticChecksPassed,
    protectedBeforeAndAfterMatched: true, files: protectedFiles }, null, 2)}\n`);
}
console.log(`v06p1 enchant closed tests ok: ${assertions} assertions; C01–C10; ${totalFixtures} fixtures; ${totalInvocations} API calls; shared/snapshot 正式 flagLoads=0 + SSR false/fresh flagLoads=1; 写哨兵=0; 拒绝过程存储写入=0; EnchantOpenFlag=true; softOpenedEnchant=true; released=false; O表未执行；附灵 soft-open ≠ 进包 ≠ 发版；fixture≠正式`);
