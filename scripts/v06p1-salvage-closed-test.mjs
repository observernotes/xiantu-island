// 分解正式磁盘 soft-open；两根先核 true，再仅在 Vite SSR 注入 false 执行 C01–C10 八 tip 零写。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { stripSalvageOpenProgress, stripSalvageSceneWiring } from './v06p1-salvage-soft-open-compat-proof.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.env.SALVAGE_CLOSED_OUT ?? path.join(root, 'qa/out_v06p1_salvage_soft_open/regressions/salvage-closed'));
const roots = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
const targets = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '160308538d372404b808123d51c2cb08b037c5f439f6e3441380ccacbd9639ee',
};
const frozen = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const frozenSources = {
  'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  'src/EnchantOpenFlag.ts': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
  'src/ForgeGate.ts': '7aa9b91bf4ad2d389f2b96c41479338bd53cb3fdd63f65ff47a64f8528d75bcb',
  'src/EnhanceGate.ts': 'c2a2a0efb7997270eb48674224ce9bfc08e14201e613d7aa12d35af0a2a09796',
  'src/EnchantGate.ts': '9dbb43f607fb1c298661bccd8a31f5653583b0b1dae956ca3f317f2fe8fc0ad2',
  'src/ForgeClosed.ts': 'f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c',
  'src/EnhanceClosed.ts': 'c52ffbfc269f3a41c309184d9781f23cf2511d5acec7570ebb44b84683b3e821',
  'src/EnchantClosed.ts': '15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730',
  'src/SalvageClosed.ts': '287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211',
  'src/SalvageGate.ts': '3777c6b72615f21a9c47544cfa8eeece08eb54009032cbf53e713091f8d8ce52',
  'src/SalvageProgress.ts': '118f49bc4931727e0aafbc39fba6b883a94a948f8d478653bf42335305548787',
  'src/Progress.ts': 'a9ab2aa6e73dca631b6ed28f672d490b61525610c609df478e2c112a66358d3c',
  'src/SaveStore.ts': '4c99f7410cd87e2e9b46d7b685fdb9ab5f2c9ca3b8a266da61eb062624ec7916',
  'src/scenes/GameScene.ts': 'f5d7defb24dda3ef1956e331479e9ee96794f1f45515bbb7951f3c3e19a0726c',
  'src/ShopPanel.ts': '419a3c5b112301a69258303062f3a82468aff2e6116b440f7c3844a465c1170c',
};
const apiTips = {
  featureClosed: 'salvage.closed.feature', refuseEntrance: 'salvage.closed.entrance',
  refuseSalvage: 'salvage.closed.salvage', refuseSubmit: 'salvage.closed.no_submit',
  refuseResult: 'salvage.closed.no_result', refuseOutput: 'salvage.closed.no_output',
  refuseLoadRefresh: 'salvage.closed.load_refresh', refuseLaterService: 'salvage.closed.later_service',
};
const evidence = [], protectedFiles = {}, captured = new Map();
let assertions = 0, totalFixtures = 0, totalInvocations = 0, passed = false, staticChecksPassed = false;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const json = file => fs.readFile(file, 'utf8').then(JSON.parse);
const source = (file, text) => ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
const hasExport = node => node.modifiers?.some(modifier => modifier.kind === ts.SyntaxKind.ExportKeyword);
const compact = (node, ast) => node.getText(ast).replace(/\s/gu, '');
async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  if (expected) {
    const historical = file === path.join(root, 'src/Progress.ts')
      ? hash(stripSalvageOpenProgress(await fs.readFile(file, 'utf8'), eq))
      : file === path.join(root, 'src/scenes/GameScene.ts')
        ? hash(stripSalvageSceneWiring(await fs.readFile(file, 'utf8'), eq)) : actual;
    eq(historical, expected, `冻结/目标 SHA MATCH（仅精确剥授权分解增量）: ${file}`);
  }
  captured.set(file, actual); protectedFiles[file] = actual;
}
async function sourceChecks() {
  for (const [file, sha] of Object.entries(frozenSources)) await guard(path.join(root, file), sha);
  const closedPath = path.join(root, 'src/SalvageClosed.ts'), flagPath = path.join(root, 'src/SalvageOpenFlag.ts');
  const closed = source(closedPath, await fs.readFile(closedPath, 'utf8'));
  const flagText = await fs.readFile(flagPath, 'utf8'), flag = source(flagPath, flagText);
  eq(flagText, '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isSalvageOpenForFixture(): boolean { return true; }\n',
    'SalvageOpenFlag 正式源码精确恒 true；仅 SSR 关态图允许注入 false');
  const imports = closed.statements.filter(ts.isImportDeclaration);
  eq(imports.map(node => node.moduleSpecifier.text), ['@xt/balance/strings_zh.json'], 'SalvageClosed 唯一 import 仅读 strings');
  eq(imports[0].importClause?.name?.text, 'strings', '唯一默认字符串绑定');
  ok(closed.statements.every(node => ts.isImportDeclaration(node) || ts.isTypeAliasDeclaration(node)
    || ts.isInterfaceDeclaration(node) || ts.isFunctionDeclaration(node)), '模块顶层无服务、状态、调用或写入初始化');
  const exports = closed.statements.filter(node => ts.isFunctionDeclaration(node) && hasExport(node));
  eq(exports.map(node => node.name?.text).sort(), Object.keys(apiTips).sort(), '恰有八个公开零参数 API');
  for (const node of exports) {
    const name = node.name.text;
    eq(node.parameters.length, 0, `${name} 零参数，不接 Progress/意图`);
    eq(node.body.statements.length, 1, `${name} 仅一条返回语句`);
    const statement = node.body.statements[0];
    ok(ts.isReturnStatement(statement) && statement.expression && ts.isCallExpression(statement.expression), `${name} 仅调用只读 helper`);
    const call = statement.expression;
    eq(call.expression.getText(closed), 'closed', `${name} 无 Gate/请求/存档依赖`);
    eq(call.arguments.map(arg => ts.isStringLiteral(arg) ? arg.text : null), [apiTips[name]], `${name} 精确键映射`);
  }
  const functions = closed.statements.filter(ts.isFunctionDeclaration);
  eq(functions.length, 9, '八 API 加唯一私有 helper');
  const helper = functions.find(node => node.name?.text === 'closed');
  ok(helper && !hasExport(helper) && helper.parameters.length === 1, '私有 helper 只收 tipKey');
  eq(helper.body.statements.map(node => compact(node, closed)), ['return{allowed:false,tipKey,text:strings[tipKey]};'],
    '恒 false 且 text 仅读 strings[tipKey]，无硬编码中文');
  eq(flag.statements.filter(ts.isImportDeclaration).length, 0, '分解 Flag 无 import，不借三既有旗');
  eq(flag.statements.length, 1, 'Flag 模块无顶层其他行为');
  const flagExport = flag.statements[0];
  ok(ts.isFunctionDeclaration(flagExport) && hasExport(flagExport), 'Flag 唯一导出函数');
  eq(flagExport.name.text, 'isSalvageOpenForFixture', '独立 Flag API');
  eq(flagExport.parameters.length, 0, 'Flag 零参数');
  eq(flagExport.body.statements.map(node => compact(node, flag)), ['returntrue;'], '正式源码恒 true');
  const gatePath = path.join(root, 'src/SalvageGate.ts'), gateAst = source(gatePath, await fs.readFile(gatePath, 'utf8'));
  const gateClass = gateAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'SalvageGate');
  const gateTips = { feature: 'featureClosed', entrance: 'refuseEntrance', salvage: 'refuseSalvage', submit: 'refuseSubmit',
    result: 'refuseResult', output: 'refuseOutput', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' };
  for (const [name, tip] of Object.entries(gateTips)) {
    const method = gateClass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(gateAst) === name);
    ok(method, `开态夹具既有 Gate 保留独立入口: ${name}`);
    eq(compact(method.body.statements[0], gateAst), `if(!isSalvageOpenForFixture())returnSalvageClosed.${tip}();`,
      `${name} 关态首句仍原样返回八 tip`);
  }
  for (const file of ['src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'src/Progress.ts', 'src/SaveStore.ts']) {
    const raw = await fs.readFile(path.join(root, file), 'utf8');
    const text = file === 'src/Progress.ts' ? stripSalvageOpenProgress(raw, eq)
      : file === 'src/scenes/GameScene.ts' ? stripSalvageSceneWiring(raw, eq) : raw;
    ok(!/SalvageClosed|SalvageOpenFlag|SalvageGate|salvage\.closed\.|submitSalvage|fixtureInstances/u.test(text),
      `${file} 仅已授权最小接线/可选袋，无分解 UI 或默认生产夹具`);
    ok(!/fixtureInstances/u.test(raw), `${file} 原生产磁盘无 fixtureInstances 默认注入`);
  }
  for (const family of ['Forge', 'Enhance', 'Enchant']) {
    const gatePath = path.join(root, `src/${family}Gate.ts`), ast = source(gatePath, await fs.readFile(gatePath, 'utf8'));
    const klass = ast.statements.find(ts.isClassDeclaration);
    const later = klass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(ast) === 'laterService');
    eq(compact(later.body.statements.at(-1), ast), `return${family}Closed.refuseLaterService();`,
      `${family} 混入分解仍用既有 later_service`);
  }
  await guard(closedPath); await guard(flagPath);
  evidence.push({ suite: 'source-static', passed: true, uniqueStringsImport: true, zeroArgumentApis: 8,
    independentFlagAlwaysTrue: true, flagImports: 0, existingSalvageGatePreserved: true, gateClosedFirst: true,
    productionFixtureInjection: false, minimalFrontendWiring: true, fullSalvageUiAdded: false,
    sameHitTipOrder: ['forge', 'enhance', 'enchant', 'salvage'], existingGatesAndFrontendPreserved: true,
    existingLaterServicePreserved: true, apiTips });
}
async function dataChecks() {
  for (const [mode, dataRoot] of roots) {
    for (const [name, expected] of Object.entries({ ...frozen, ...targets })) await guard(path.join(dataRoot, 'balance', name), expected);
    const strings = await json(path.join(dataRoot, 'balance/strings_zh.json'));
    eq(Object.keys(strings).length, 960, `${mode}: strings 960 键含 _meta`);
    eq(Object.keys(strings).filter(key => key.startsWith('salvage.closed.')).sort(), Object.values(apiTips).sort(), `${mode}: 恰有八分解关态键`);
    for (const key of Object.values(apiTips)) {
      ok(typeof strings[key] === 'string' && strings[key].length > 0, `${mode}: ${key} 有文案`);
      ok(Array.from(strings[key]).length <= 40, `${mode}: ${key} Unicode ≤40`);
    }
    const items = await json(path.join(dataRoot, 'balance/items.json')), materials = await json(path.join(dataRoot, 'balance/materials.json'));
    const itemRows = items.items ?? items, materialRows = materials.materials ?? materials;
    const item = itemRows.filter(row => row.id === 'refine_stone'), material = materialRows.filter(row => row.id === 'refine_stone');
    eq(item.length, 1, `${mode}: 精炼石 items 正式登记唯一`);
    eq(material.length, 1, `${mode}: 精炼石 materials 正式登记唯一`);
    eq(item[0], { id: 'refine_stone', name: '精炼石', phase: 5, icon: 'icon_refine_stone' }, `${mode}: items 精确登记行`);
    eq([material[0].type, material[0].kind, material[0].price, material[0].stack, material[0].icon],
      ['material', 'enhance', 50, 200, 'icon_refine_stone'], `${mode}: materials 原行只读`);
    const effective = Object.fromEntries([...itemRows, ...materialRows].map(row => [row.id, row]));
    eq(effective.refine_stone, material[0], `${mode}: 同 id 合并取 materials 整行`);
    const enhance = await json(path.join(dataRoot, 'balance/enhance.json'));
    eq(enhance.salvage, { refineStonesByGrade: { common: 1, fine: 2, spirit: 4, treasure: 8 } }, `${mode}: 仅读数量且无 cost/rate`);
    const npcs = await json(path.join(dataRoot, 'balance/npcs.json')), npcRows = npcs.npcs ?? npcs;
    const gifts = npcRows.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${mode}: gifts 仍 10 条`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${mode}: gifts 10×false`);
    const smith = npcRows.find(row => row.id === 'smith_ou');
    ok(smith && !Object.prototype.hasOwnProperty.call(smith, 'services'), `${mode}: 不挂 smith_ou.services`);
    evidence.push({ suite: 'data-static', dataMode: mode, passed: true, refineStoneMapped: true,
      refineStoneMappedMeaning: '正式登记及合并记录齐；不表示分解消费者/存档/事务接通或生产放行',
      stringsKeys: Object.keys(strings).length, targetShas: targets, frozenShas: frozen, giftsDisabled: 10, smithServicesAdded: false });
  }
  for (const name of Object.keys(targets)) eq(await fs.readFile(path.join(roots[0][1], 'balance', name)),
    await fs.readFile(path.join(roots[1][1], 'balance', name)), `shared/snapshot ${name} 同字节`);
}
async function runGraph(dataMode, dataRoot, graph, payloads) {
  const memoryClosed = graph !== 'formal-open';
  let flagLoads = 0;
  const flagId = '\0v06p1-memory-closed-salvage-flag';
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-salvage-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (memoryClosed && /(?:^|\/)SalvageOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isSalvageOpenForFixture() { return false; }'; }
      },
    }],
  });
  try {
    const flag = await server.ssrLoadModule('/src/SalvageOpenFlag.ts');
    eq(flag.isSalvageOpenForFixture(), !memoryClosed, `${dataMode}/${graph}: 正式旗 true；关态仅 SSR 内存注入 false`);
    eq(flagLoads, memoryClosed ? 1 : 0, `${dataMode}/${graph}: 正式 flagLoads=0，内存关态 flagLoads=1`);
    for (const family of ['Forge', 'Enhance', 'Enchant']) {
      const prior = await server.ssrLoadModule(`/src/${family}OpenFlag.ts`);
      eq(prior[`is${family}OpenForFixture`](), true, `${dataMode}/${graph}: ${family} 原正式 true 保留`);
    }
    if (!memoryClosed) {
      evidence.push({ suite: 'formal-graph', dataMode, graph, passed: true, flagLoads,
        SalvageOpenFlag: true, softOpenedSalvage: true, released: false, closedFixtureOnly: true });
      console.log(JSON.stringify({ suite: 'formal-graph', dataMode, graph, flagLoads, SalvageOpenFlag: true, passed: true }));
      return;
    }
    const api = await server.ssrLoadModule('/src/SalvageClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const { SalvageGate } = await server.ssrLoadModule('/src/SalvageGate.ts');
    const p = new Progress(), before = JSON.parse(JSON.stringify(p.exportSave()));
    let gateWrites = 0;
    for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
      'addItem', 'removeItem', 'registerFormalEnhanceInstance'])
      Object.defineProperty(p, method, { configurable: true, value() {
        gateWrites++; throw new Error('分解内存关态 Gate 不得销毁、发放、提交、存储或排队');
      } });
    const gate = new SalvageGate(p);
    for (const [method, apiName] of Object.entries({ feature: 'featureClosed', entrance: 'refuseEntrance', salvage: 'refuseSalvage',
      submit: 'refuseSubmit', result: 'refuseResult', output: 'refuseOutput', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' }))
      eq(await gate[method](), api[apiName](), `${dataMode}/${graph}: Gate.${method} 内存关态首旗返回原八 tip`);
    eq(p.exportSave(), before, `${dataMode}/${graph}: 内存关态 Gate 八入口完整存档零增量`);
    eq(gateWrites, 0, `${dataMode}/${graph}: 内存关态 Gate 销毁、发放、事务、保存与排队 0`);
    const suite = await server.ssrLoadModule('/src/v06p1-salvage-closed.test.ts');
    eq(suite.apiTips, apiTips, `${dataMode}/${graph}: 静态/运行 API 映射一致`);
    const result = await suite.runSalvageClosedTests({ dataMode, graph, payloads });
    eq(result.passed, true, `${dataMode}/${graph}: 专项通过`);
    eq([result.sentinelCalls, result.storageWrites, result.localStorageWrites, result.indexedDbOpens], [0, 0, 0, 0],
      `${dataMode}/${graph}: 拒绝及读档过程零写`);
    assertions += result.assertions; totalFixtures += result.fixtures; totalInvocations += result.invocations;
    const { payloads: nextPayloads, ...row } = result;
    eq(flagLoads, 1, `${dataMode}/${graph}: C 套件与 Gate 共用唯一 SSR false Flag`);
    evidence.push({ suite: 'v06p1-salvage-closed-graph', ...row, flagInjection: true, flagLoads, memoryClosed: true,
      formalSalvageOpenFlag: true, gateClosedTips: 8, gateWrites });
    console.log(JSON.stringify({ suite: 'v06p1-salvage-closed-graph', dataMode, graph, passed: true,
      assertions: result.assertions, fixtures: result.fixtures, invocations: result.invocations,
      ordinarySaveSetupWrites: result.ordinarySaveSetupWrites, storageWrites: result.storageWrites,
      sentinelCalls: result.sentinelCalls, SalvageOpenFlag: false, flagInjection: true, flagLoads, memoryClosed: true }));
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
  const graphs = evidence.filter(row => row.suite === 'v06p1-salvage-closed-graph');
  const cases = Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
    const id = `C${String(i + 1).padStart(2, '0')}`;
    return [id, { executed: graphs.length === 4 && graphs.every(row => row.cases[id]?.executed === true),
      evidenceKeys: graphs.flatMap(row => row.cases[id]?.evidenceKeys.map(key => `${row.dataMode}/${row.graph}/${key}`) ?? []) }];
  }));
  const result = { passed, assertions, totalFixtures, totalInvocations, apiTips, cases,
    salvageClosedTipsWired: passed, SalvageOpenFlag: true, softOpenedSalvage: true, released: false,
    formalOpen: true, closedFixtureOnly: true, closedRuntimeFlag: false,
    refineStoneMapped: staticChecksPassed, enchantSoftOpenPreserved: passed,
    EnhanceOpenFlagPreserved: passed, EnchantOpenFlagPreserved: passed, protectCharmSoftOpenPreserved: passed,
    refineStoneMappedMeaning: 'items/materials 与合并登记齐；核齐备≠生产分解授权，不表示消费者/销毁入库/事务已接通',
    ForgeOpenFlag: true, EnhanceOpenFlag: true, EnchantOpenFlag: true,
    targetShas: targets, frozenShas: frozen, frozenSourceShas: frozenSources,
    sentinelCalls: graphs.reduce((sum, row) => sum + row.sentinelCalls, 0),
    storageWrites: graphs.reduce((sum, row) => sum + row.storageWrites, 0),
    ordinarySaveSetupWrites: graphs.reduce((sum, row) => sum + row.ordinarySaveSetupWrites, 0),
    storageScope: 'storageWrites=关态 API/读档过程；ordinarySaveSetupWrites=仅 C08 准备阶段普通 saveAsync',
    testsUseRealSsrModule: true, freshIndependentGraphs: graphs.length + evidence.filter(row => row.suite === 'formal-graph').length,
    formalGraphs: evidence.filter(row => row.suite === 'formal-graph').length, memoryClosedGraphs: graphs.length,
    flagInjection: '仅四个 SSR memory-closed 图注入 false；两个正式磁盘图 flagLoads=0',
    semanticFixtureOnly: true, salvageSchemaAdded: true,
    salvageSchemaScope: '开态夹具令授权既有可选完整袋；本 C 套件不执行开态', unknownFieldsRetainedByRestore: false,
    unknownRawStoredPayloadPreserved: passed, oldFormalForgeEnhanceEnchantAssetsPreserved: passed,
    openFixtureTableExecuted: false, successSettlementExecuted: false, existingSalvageGatePreserved: true,
    compatibilityMeaning: '分解 soft-open ≠ 进包 ≠ 发版；fixture≠正式；正式磁盘图仅核 true，C01–C10 仅 SSR false 图执行；O 表交 open runner；C02 armor/四品质及 C03–C07 意图仅语义上下文；未知字段原文保留不等于 restore 登记；release 预期 v0.6.12 另令，本令不授权',
    protectedFiles, evidence };
  await fs.writeFile(path.join(out, 'v06p1-salvage-closed-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify({ passed: staticChecksPassed,
    expectedFrozenAndTargetsMatched: staticChecksPassed, protectedBeforeAndAfterMatched: true, files: protectedFiles }, null, 2)}\n`);
}
console.log(`v06p1 salvage closed tests ok: ${assertions} assertions; C01–C10; ${totalFixtures} semantic/state fixtures; ${totalInvocations} zero-argument API calls; shared/snapshot 正式 flagLoads=0 + SSR false/fresh flagLoads=1; writes=0; three prior Flags=true; SalvageOpenFlag=true; softOpenedSalvage=true; released=false; O表未执行；分解 soft-open ≠ 进包 ≠ 发版；fixture≠正式；release 预期 v0.6.12 另令`);
