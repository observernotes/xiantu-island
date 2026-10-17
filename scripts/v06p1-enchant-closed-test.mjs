// 两根真实 Vite SSR、独立刷新图，仅执行附灵 C01–C10 关态八 tip；不执行 O 表。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const out = process.env.ENCHANT_CLOSED_OUT ?? path.join(root, 'qa/out_v06p1_enchant_closed/runtime');
const roots = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const targets = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
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
async function sourceChecks() {
  const closedPath = path.join(root, 'src/EnchantClosed.ts'), flagPath = path.join(root, 'src/EnchantOpenFlag.ts');
  const closedText = await fs.readFile(closedPath, 'utf8'), flagText = await fs.readFile(flagPath, 'utf8');
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
  eq(flagExports[0].body.statements.map(node => node.getText(flag).replace(/\s/gu, '')), ['returnfalse;'], '正式 Flag 恒 false');
  // 开态夹具令准许新增 Gate / 可选完整袋；C 套件继续验证正式关态优先，未执行 O 表。
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
  ok(!/EnchantClosed|EnchantOpenFlag|EnchantGate|fixtureInstances/u.test(scene), '生产 GameScene 不强制 UI、不注入 fixtureInstances');
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
    flagIndependent: true, flagAlwaysFalse: true, gateClosedFirst: true, optionalEnchantSchema: true, noProductionFixtureInjection: true,
    existingLaterServicePreserved: true, apiTips });
}
async function dataChecks() {
  for (const [name, expected] of Object.entries(frozenSources)) await guard(path.join(root, name), expected);
  for (const [mode, dataRoot] of roots) {
    for (const [name, expected] of Object.entries({ ...frozen, ...targets })) await guard(path.join(dataRoot, 'balance', name), expected);
    const strings = await json(path.join(dataRoot, 'balance/strings_zh.json'));
    eq(Object.keys(strings).length, 952, `${mode}: strings 952 键含 _meta`);
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
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error' });
  try {
    const suite = await server.ssrLoadModule('/src/v06p1-enchant-closed.test.ts');
    const result = await suite.runEnchantClosedTests({ dataMode, graph, payloads });
    eq(result.passed, true, `${dataMode}/${graph}: suite 通过`);
    eq(suite.apiTips, apiTips, `${dataMode}/${graph}: runtime 八 API 对照静态表一致`);
    eq([result.sentinelCalls, result.storageWrites, result.localStorageWrites, result.indexedDbOpens], [0, 0, 0, 0], `${dataMode}/${graph}: 拒绝动作全部零写`);
    assertions += result.assertions; totalFixtures += result.fixtures; totalInvocations += result.invocations;
    const { payloads: nextPayloads, ...row } = result;
    evidence.push({ suite: 'v06p1-enchant-closed-graph', ...row });
    console.log(JSON.stringify({ suite: 'v06p1-enchant-closed-graph', dataMode, graph, assertions: result.assertions,
      fixtures: result.fixtures, invocations: result.invocations, ordinarySaveSetupWrites: result.ordinarySaveSetupWrites,
      sentinelCalls: result.sentinelCalls, storageWrites: result.storageWrites, passed: true }));
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
  const graphs = evidence.filter(row => row.suite === 'v06p1-enchant-closed-graph');
  const cases = Object.fromEntries(Array.from({ length: 10 }, (_, i) => {
    const caseId = `C${String(i + 1).padStart(2, '0')}`;
    return [caseId, { executed: graphs.length === 4 && graphs.every(row => row.cases[caseId]?.executed === true),
      evidenceKeys: graphs.flatMap(row => row.cases[caseId]?.evidenceKeys.map(key => `${row.dataMode}/${row.graph}/${key}`) ?? []) }];
  }));
  const result = { passed, assertions, totalFixtures, totalInvocations, apiTips, cases,
    enchantClosedTipsWired: passed, EnchantOpenFlag: false, softOpenedEnchant: false, released: false,
    beastCoreMapped: true, beastCoreMappedMeaning: '仅登记齐；不宣称附灵消费、事务或生产开放', protectCharmSoftOpenPreserved: true,
    ForgeOpenFlag: true, EnhanceOpenFlag: true, targetShas: targets, frozenShas: frozen, frozenSourceShas: frozenSources,
    sentinelCalls: graphs.reduce((sum, row) => sum + row.sentinelCalls, 0),
    storageWrites: graphs.reduce((sum, row) => sum + row.storageWrites, 0),
    ordinarySaveSetupWrites: graphs.reduce((sum, row) => sum + row.ordinarySaveSetupWrites, 0),
    storageScope: 'storageWrites=拒绝/读档过程；ordinarySaveSetupWrites=仅 C08 普通 saveAsync 准备阶段',
    semanticFixtureOnly: true, enchantSchemaAdded: true, enchantSchemaScope: '开态夹具令授权可选完整袋；本 C 套件不执行开态', unknownFieldsRetainedByRestore: false,
    openFixtureTableExecuted: false, testsUseRealSsrModule: true, freshIndependentGraphs: 4,
    protectedFiles, evidence };
  await fs.writeFile(path.join(out, 'v06p1-enchant-closed-evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
  await fs.writeFile(path.join(out, 'protection-check.json'), `${JSON.stringify({ passed: staticChecksPassed, expectedFrozenAndTargetsMatched: staticChecksPassed,
    protectedBeforeAndAfterMatched: true, files: protectedFiles }, null, 2)}\n`);
}
console.log(`v06p1 enchant closed tests ok: ${assertions} assertions; C01–C10; ${totalFixtures} fixtures; ${totalInvocations} API calls; shared/snapshot + fresh SSR; 写哨兵=0; 拒绝过程存储写入=0; EnchantOpenFlag=false; softOpenedEnchant=false; released=false; O表未执行`);
