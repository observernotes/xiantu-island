// 分解仅关态 tip；两根正式 false 图及刷新图，不注入 true、不执行 O 表或成功结算。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.env.SALVAGE_CLOSED_OUT ?? path.join(root, 'qa/out_v06p1_salvage_closed'));
const roots = [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]];
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
  'src/EnchantOpenFlag.ts': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
  'src/ForgeGate.ts': '7aa9b91bf4ad2d389f2b96c41479338bd53cb3fdd63f65ff47a64f8528d75bcb',
  'src/EnhanceGate.ts': 'c2a2a0efb7997270eb48674224ce9bfc08e14201e613d7aa12d35af0a2a09796',
  'src/EnchantGate.ts': '9dbb43f607fb1c298661bccd8a31f5653583b0b1dae956ca3f317f2fe8fc0ad2',
  'src/ForgeClosed.ts': 'f7e4216be7767f481c96ae7f1dc5796574fe9b231ada91d57a137c1dc8a8c90c',
  'src/EnhanceClosed.ts': 'c52ffbfc269f3a41c309184d9781f23cf2511d5acec7570ebb44b84683b3e821',
  'src/EnchantClosed.ts': '15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730',
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
  if (expected) eq(actual, expected, `冻结/目标 SHA MATCH: ${file}`);
  captured.set(file, actual); protectedFiles[file] = actual;
}
async function sourceChecks() {
  for (const [file, sha] of Object.entries(frozenSources)) await guard(path.join(root, file), sha);
  const closedPath = path.join(root, 'src/SalvageClosed.ts'), flagPath = path.join(root, 'src/SalvageOpenFlag.ts');
  const closed = source(closedPath, await fs.readFile(closedPath, 'utf8'));
  const flag = source(flagPath, await fs.readFile(flagPath, 'utf8'));
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
  eq(flagExport.body.statements.map(node => compact(node, flag)), ['returnfalse;'], '正式源码恒 false');
  eq(await fs.stat(path.join(root, 'src/SalvageGate.ts')).then(() => true, error => error.code === 'ENOENT' ? false : Promise.reject(error)),
    false, '不创建 SalvageGate 或成功流程');
  for (const file of ['src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'src/Progress.ts', 'src/SaveStore.ts']) {
    const text = await fs.readFile(path.join(root, file), 'utf8');
    ok(!/SalvageClosed|SalvageOpenFlag|SalvageGate|salvage\.closed\.|submitSalvage|fixtureInstances/u.test(text),
      `${file} 不挂分解 UI/schema/默认生产夹具`);
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
    independentFlagAlwaysFalse: true, flagImports: 0, salvageGateAdded: false, productionFixtureInjection: false,
    existingGatesAndFrontendUnchanged: true, existingLaterServicePreserved: true, apiTips });
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
  // 无 resolve/load 插件、无 Flag 替换。每次 createServer 创建独立正式 SSR 模块图。
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const flag = await server.ssrLoadModule('/src/SalvageOpenFlag.ts');
    eq(flag.isSalvageOpenForFixture(), false, `${dataMode}/${graph}: 正式 SSR 图分解恒 false`);
    for (const family of ['Forge', 'Enhance', 'Enchant']) {
      const prior = await server.ssrLoadModule(`/src/${family}OpenFlag.ts`);
      eq(prior[`is${family}OpenForFixture`](), true, `${dataMode}/${graph}: ${family} 原正式 true 保留`);
    }
    const suite = await server.ssrLoadModule('/src/v06p1-salvage-closed.test.ts');
    eq(suite.apiTips, apiTips, `${dataMode}/${graph}: 静态/运行 API 映射一致`);
    const result = await suite.runSalvageClosedTests({ dataMode, graph, payloads });
    eq(result.passed, true, `${dataMode}/${graph}: 专项通过`);
    eq([result.sentinelCalls, result.storageWrites, result.localStorageWrites, result.indexedDbOpens], [0, 0, 0, 0],
      `${dataMode}/${graph}: 拒绝及读档过程零写`);
    assertions += result.assertions; totalFixtures += result.fixtures; totalInvocations += result.invocations;
    const { payloads: nextPayloads, ...row } = result;
    evidence.push({ suite: 'v06p1-salvage-closed-graph', ...row, flagInjection: false });
    console.log(JSON.stringify({ suite: 'v06p1-salvage-closed-graph', dataMode, graph, passed: true,
      assertions: result.assertions, fixtures: result.fixtures, invocations: result.invocations,
      ordinarySaveSetupWrites: result.ordinarySaveSetupWrites, storageWrites: result.storageWrites,
      sentinelCalls: result.sentinelCalls, SalvageOpenFlag: false, flagInjection: false }));
    return JSON.parse(JSON.stringify(nextPayloads));
  } finally { await server.close(); }
}

await fs.mkdir(out, { recursive: true });
try {
  await sourceChecks(); await dataChecks(); staticChecksPassed = true;
  for (const [mode, dataRoot] of roots) {
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
    salvageClosedTipsWired: passed, SalvageOpenFlag: false, softOpenedSalvage: false, released: false,
    refineStoneMapped: staticChecksPassed, enchantSoftOpenPreserved: passed,
    EnhanceOpenFlagPreserved: passed, protectCharmSoftOpenPreserved: passed,
    refineStoneMappedMeaning: 'items/materials 与合并登记齐；核齐备≠生产分解授权，不表示消费者/销毁入库/事务已接通',
    ForgeOpenFlag: true, EnhanceOpenFlag: true, EnchantOpenFlag: true,
    targetShas: targets, frozenShas: frozen, frozenSourceShas: frozenSources,
    sentinelCalls: graphs.reduce((sum, row) => sum + row.sentinelCalls, 0),
    storageWrites: graphs.reduce((sum, row) => sum + row.storageWrites, 0),
    ordinarySaveSetupWrites: graphs.reduce((sum, row) => sum + row.ordinarySaveSetupWrites, 0),
    storageScope: 'storageWrites=关态 API/读档过程；ordinarySaveSetupWrites=仅 C08 准备阶段普通 saveAsync',
    testsUseRealSsrModule: true, freshIndependentGraphs: graphs.length, flagInjection: false,
    semanticFixtureOnly: true, salvageSchemaAdded: false, unknownFieldsRetainedByRestore: false,
    unknownRawStoredPayloadPreserved: passed, oldFormalForgeEnhanceEnchantAssetsPreserved: passed,
    openFixtureTableExecuted: false, successSettlementImplemented: false, salvageGateAdded: false,
    compatibilityMeaning: '本窗仅八 tip 零写；C02 armor/四品质及 C03–C07 非正式分解意图仅语义上下文，不验证未来资格链/承载/事务；未知字段原文保留不等于 restore 登记该字段；本令≠开态夹具≠soft-open≠release≠进包',
    protectedFiles, evidence };
  await fs.writeFile(path.join(out, 'v06p1-salvage-closed-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify({ passed: staticChecksPassed,
    expectedFrozenAndTargetsMatched: staticChecksPassed, protectedBeforeAndAfterMatched: true, files: protectedFiles }, null, 2)}\n`);
}
console.log(`v06p1 salvage closed tests ok: ${assertions} assertions; C01–C10; ${totalFixtures} semantic/state fixtures; ${totalInvocations} zero-argument API calls; shared/snapshot + fresh SSR; Flag=false; injection=false; writes=0; three prior Flags=true; O表未执行；仅关态 tip，不授权生产分解`);
