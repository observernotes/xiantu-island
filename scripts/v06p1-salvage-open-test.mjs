// 分解开态夹具：正式磁盘 Flag=false；仅 SSR resolve/load 内存图注入 true。fixture≠正式；本令≠soft-open≠release≠进包。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), roots = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const out = process.env.SALVAGE_OPEN_OUT ?? process.env.OUT ?? path.join(root, 'qa/out_v06p1_salvage_open_fixture');
const frozen = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const frozenSources = {
  'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  'src/EnchantOpenFlag.ts': 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  'src/SalvageClosed.ts': '287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
};
const requiredEvidence = {
  salvageClosedTipsWired: true, refineStoneMapped: true, salvageOpenFixtureTableExecuted: true,
  formalInstanceSource: true, softOpenedSalvage: false, SalvageOpenFlag: false, released: false,
  enchantSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true, protectCharmSoftOpenPreserved: true,
};
const apiTips = {
  feature: 'featureClosed', entrance: 'refuseEntrance', salvage: 'refuseSalvage', submit: 'refuseSubmit',
  result: 'refuseResult', output: 'refuseOutput', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService',
};
const captured = new Map(), evidence = [];
let assertions = 0, runtimeAssertions = 0, passed = false, protectionPassed = false;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (actual, message) => { assertions++; assert.ok(actual, message); };
const hash = data => createHash('sha256').update(data).digest('hex');
const readJson = file => fs.readFile(file, 'utf8').then(JSON.parse);
const ast = (name, source) => ts.createSourceFile(name, source, ts.ScriptTarget.Latest, true, ts.ScriptKind.TS);
async function capture(file, expected) {
  const actual = hash(await fs.readFile(file)); captured.set(file, actual);
  if (expected) eq(actual, expected, '冻结 SHA MATCH: ' + file);
}
async function sourceChecks() {
  for (const [file, sha] of Object.entries(frozenSources)) await capture(path.join(root, file), sha);
  for (const file of ['src/ForgeGate.ts', 'src/EnhanceGate.ts', 'src/EnchantGate.ts', 'src/SalvageOpenFlag.ts',
    'src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'data/features.json']) await capture(path.join(root, file));
  const flagSource = await fs.readFile(path.join(root, 'src/SalvageOpenFlag.ts'), 'utf8');
  const flagAst = ast('SalvageOpenFlag.ts', flagSource);
  const flag = flagAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isSalvageOpenForFixture');
  ok(flag, '正式独立 Flag 函数存在');
  eq(flag.body.statements.map(node => node.getText(flagAst).replace(/\s/gu, '')), ['returnfalse;'], '正式 Flag 函数体恒 return false');
  eq(flagAst.statements.filter(ts.isImportDeclaration).length, 0, '独立旗不借三既有 Flag');
  ok(!/process\.|globalThis|localStorage|sessionStorage|featureEnabled|enabled/u.test(flagSource), '正式旗无环境配表或会话后门');
  const gateSource = await fs.readFile(path.join(root, 'src/SalvageGate.ts'), 'utf8'), gateAst = ast('SalvageGate.ts', gateSource);
  const klass = gateAst.statements.find(node => ts.isClassDeclaration(node) && node.name?.text === 'SalvageGate');
  for (const [name, closed] of Object.entries(apiTips)) {
    const method = klass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(gateAst) === name);
    ok(method, 'Gate 八入口存在: ' + name);
    eq(method.body.statements[0].getText(gateAst).replace(/\s/gu, ''),
      'if(!isSalvageOpenForFixture())returnSalvageClosed.' + closed + '();', name + ' 首语句关态优先并原样返回 tip');
  }
  ok(/@xt\/balance\/enhance\.json/u.test(gateSource), 'Gate 仅读正式 enhance.salvage 数值来源');
  ok(!/ForgeOpenFlag|EnhanceOpenFlag|EnchantOpenFlag|Math\.random|salvage\.json/u.test(gateSource), '分解独立许可确定性无新数值表或其他旗');
  ok(!/fixtureInstances/u.test(gateSource), '正式 Gate 无 fixtureInstances 身份源或回退');
  for (const file of ['src/scenes/GameScene.ts', 'src/ShopPanel.ts'])
    ok(!/SalvageGate|SalvageOpenFlag/u.test(await fs.readFile(path.join(root, file), 'utf8')), file + ' 不接分解前台入口');
  for (const [mode, dataRoot] of roots) {
    for (const [name, sha] of Object.entries(frozen)) await capture(path.join(dataRoot, 'balance', name), sha);
    const npcs = await readJson(path.join(dataRoot, 'balance/npcs.json'));
    ok(!Object.hasOwn(npcs.find(row => row.id === 'smith_ou'), 'services'), mode + ' 不挂 smith_ou.services');
    const gifts = npcs.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, mode + ' gifts 共10处');
    ok(gifts.every(row => row.affinity.gifts.enabled === false), mode + ' gifts 10×false');
    eq(Object.keys(await readJson(path.join(dataRoot, 'balance/strings_zh.json'))).length, 960, mode + ' strings 960');
    const items = await readJson(path.join(dataRoot, 'balance/items.json'));
    const materials = await readJson(path.join(dataRoot, 'balance/materials.json'));
    eq(items.filter(row => row.id === 'refine_stone'), [{ id: 'refine_stone', name: '精炼石', phase: 5, icon: 'icon_refine_stone' }],
      mode + ' 精炼石正式登记唯一且资格可读');
    eq(materials.filter(row => row.id === 'refine_stone').length, 1, mode + ' 精炼石有效材料唯一');
    eq(await fs.stat(path.join(dataRoot, 'balance/salvage.json')).then(() => true, error =>
      error.code === 'ENOENT' ? false : Promise.reject(error)), false, mode + ' 不新增独立 salvage 数值表');
  }
}
const invalidDependencies = [
  'missing-salvage', 'missing-grade', 'zero-count', 'negative-count', 'unsafe-count', 'wrong-count', 'extra-grade', 'rate-forbidden', 'cost-forbidden',
  'items-registration-missing', 'materials-missing', 'duplicate-registration', 'stone-phase', 'stone-disabled', 'stone-placeholder', 'stone-quality',
  'weapon-phase', 'weapon-disabled', 'weapon-placeholder', 'weapon-quality', 'weapon-slot', 'weapon-type',
];
async function invalidModules(dataRoot, name) {
  if (!name) return null;
  const tables = {
    enhance: await readJson(path.join(dataRoot, 'balance/enhance.json')),
    items: await readJson(path.join(dataRoot, 'balance/items.json')),
    materials: await readJson(path.join(dataRoot, 'balance/materials.json')),
  };
  const map = tables.enhance.salvage.refineStonesByGrade;
  if (name === 'missing-salvage') delete tables.enhance.salvage;
  if (name === 'missing-grade') delete map.common;
  if (name === 'zero-count') map.common = 0;
  if (name === 'negative-count') map.common = -1;
  if (name === 'unsafe-count') map.common = Number.MAX_SAFE_INTEGER + 1;
  if (name === 'wrong-count') map.common = 2;
  if (name === 'extra-grade') map.mythic = 16;
  if (name === 'rate-forbidden') tables.enhance.salvage.rate = 1;
  if (name === 'cost-forbidden') tables.enhance.salvage.cost = { stones: 1 };
  if (name === 'items-registration-missing') tables.items = tables.items.filter(row => row.id !== 'refine_stone');
  if (name === 'materials-missing') tables.materials = tables.materials.filter(row => row.id !== 'refine_stone');
  if (name === 'duplicate-registration') tables.items.push(structuredClone(tables.items.find(row => row.id === 'refine_stone')));
  const stone = tables.materials.find(row => row.id === 'refine_stone');
  if (name === 'stone-phase') stone.phase = 6;
  if (name === 'stone-disabled') stone.enabled = false;
  if (name === 'stone-placeholder') stone.placeholder = true;
  if (name === 'stone-quality') stone.qualityEnabled = true;
  const weapon = tables.items.find(row => row.id === 'bamboo_sword');
  if (name === 'weapon-phase') weapon.phase = 6;
  if (name === 'weapon-disabled') weapon.enabled = false;
  if (name === 'weapon-placeholder') weapon.placeholder = true;
  if (name === 'weapon-quality') weapon.qualityEnabled = true;
  if (name === 'weapon-slot') weapon.slot = 'ring';
  if (name === 'weapon-type') weapon.type = 'material';
  return tables;
}
async function runGraph(dataMode, dataRoot, openFixture, refreshPayloads = null, invalidDependency = null, dependencyPayload = null) {
  let flagLoads = 0;
  const flagId = '\0v06p1-salvage-memory-open-flag';
  const modules = await invalidModules(dataRoot, invalidDependency);
  // 仅夹具图扩充两条现有防具的来源配方；磁盘正式 recipes 仅有武器行，未生产放行防具打造。
  const fixtureRecipes = openFixture ? await readJson(path.join(dataRoot, 'balance/recipes.json')) : null;
  if (fixtureRecipes) {
    const weapon = fixtureRecipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword');
    for (const [output, blueprint] of [['fox_robe', 'rabbit_fur'], ['cloth_shoes', 'beast_core']])
      fixtureRecipes.recipes.push({ ...structuredClone(weapon), id: 'fixture_recipe_' + output,
        name: 'SSR only ' + output, output, blueprint });
  }
  const graph = openFixture ? 'memory-open' : 'formal-closed';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-salvage-memory-open', enforce: 'pre',
      resolveId(id) {
        if (fixtureRecipes && /(?:^|\/)balance\/recipes\.json$/u.test(id)) return '\0v06p1-salvage-armor-recipes';
        if (openFixture && /(?:^|\/)SalvageOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
        if (modules) {
          const match = id.match(/(?:^|\/)balance\/(enhance|items|materials)\.json$/u);
          if (match) return '\0v06p1-salvage-dependency-' + match[1];
        }
      },
      load(id) {
        if (id === '\0v06p1-salvage-armor-recipes') return 'export default ' + JSON.stringify(fixtureRecipes) + ';';
        if (id === flagId) { flagLoads++; return 'export function isSalvageOpenForFixture() { return true; }'; }
        const name = id.startsWith('\0v06p1-salvage-dependency-') ? id.slice('\0v06p1-salvage-dependency-'.length) : null;
        if (name) return 'export default ' + JSON.stringify(modules[name]) + ';';
      },
    }],
  });
  try {
    const flag = await server.ssrLoadModule('/src/SalvageOpenFlag.ts');
    eq(flag.isSalvageOpenForFixture(), openFixture, dataMode + '/' + graph + ' 正式磁盘 false，仅 SSR 内存开态 true');
    const suite = await server.ssrLoadModule('/src/v06p1-salvage-open.test.ts');
    const result = await suite.runSalvageOpenFixtureTests({ openFixture, dataMode, refreshPayloads, invalidDependency, dependencyPayload });
    eq(result.passed, true, dataMode + '/' + graph + ' 测试通过');
    ok(Number.isSafeInteger(result.assertions) && result.assertions > 0, '自动化断言真实执行');
    runtimeAssertions += result.assertions;
    eq(flagLoads, openFixture ? 1 : 0, dataMode + '/' + graph + ' 正式图零注入，内存开态单一旗载入');
    for (const [key, value] of Object.entries(requiredEvidence))
      eq(result[key], key === 'salvageOpenFixtureTableExecuted' ? openFixture && !refreshPayloads && !invalidDependency : value,
        dataMode + '/' + graph + ' evidence ' + key);
    eq(result.randomCalls, 0, '分解无概率调用');
    eq(result.localWrites, 0, '无 localStorage 写旁路');
    eq(result.productionFixtureInstances, false, '正式源无 fixtureInstances 默认依赖');
    const { payloads, dependencyPayload: unconsumed, ...rest } = result;
    const row = { ...rest, flagLoads, invalidDependency, freshSsr: refreshPayloads !== null };
    evidence.push(row);
    console.log(JSON.stringify({ suite: 'v06p1-salvage-open-graph', dataMode, graph, invalidDependency,
      freshSsr: row.freshSsr, assertions: result.assertions, flagLoads, storageWrites: result.storageWrites, passed: true }));
    return JSON.parse(JSON.stringify({ payloads, dependencyPayload: unconsumed }));
  } finally { await server.close(); }
}
await fs.mkdir(out, { recursive: true });
try {
  await sourceChecks();
  for (const [mode, dataRoot] of roots) {
    const { payloads, dependencyPayload } = await runGraph(mode, dataRoot, true);
    await runGraph(mode, dataRoot, false);
    ok(payloads.length >= 3, mode + ' 完整武器/防具/带符历史刷新载荷');
    await runGraph(mode, dataRoot, true, payloads);
    await runGraph(mode, dataRoot, false, payloads);
    for (const name of invalidDependencies) await runGraph(mode, dataRoot, true, null, name, dependencyPayload);
  }
  const fullGraphs = evidence.filter(row => row.salvageOpenFixtureTableExecuted);
  eq(fullGraphs.length, roots.length, '双根内存开态图各真实执行一次 O01–O08 全表');
  for (const row of fullGraphs) {
    eq(row.graph, 'memory-open', row.dataMode + ' O 全表必须只用 SSR 内存图');
    eq(row.flagLoads, 1, row.dataMode + ' O 全表恰一次内存旗注入');
    for (let number = 1; number <= 8; number++) {
      const key = 'O' + String(number).padStart(2, '0');
      eq(row.cases[key]?.executed, true, row.dataMode + ' ' + key + ' 条目实际执行');
      ok(row.cases[key].evidenceKeys.length > 0, row.dataMode + ' ' + key + ' 存在运行旁证');
    }
  }
  eq(evidence.filter(row => row.graph === 'memory-open').length, roots.length * (invalidDependencies.length + 2), '开态完整表/fresh SSR/异常图数量完整');
  eq(evidence.filter(row => row.graph === 'formal-closed').length, roots.length * 2, '正式关态初始及旧回调图数量完整');
  passed = true;
} finally {
  for (const [file, sha] of captured) eq(hash(await fs.readFile(file)), sha, '运行前后冻结 SHA MATCH: ' + file);
  protectionPassed = true;
  const fullGraphs = evidence.filter(row => row.salvageOpenFixtureTableExecuted);
  const cases = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const key = 'O' + String(index + 1).padStart(2, '0');
    return [key, { executed: fullGraphs.length === 2 && fullGraphs.every(row => row.cases[key]?.executed === true),
      evidenceKeys: evidence.flatMap(row => row.cases[key]?.evidenceKeys.map(value =>
        row.dataMode + '/' + row.graph + '/' + (row.invalidDependency ?? (row.freshSsr ? 'fresh-ssr' : 'initial')) + '/' + value) ?? []) }];
  }));
  const result = { passed, assertions: assertions + runtimeAssertions, runnerAssertions: assertions, runtimeAssertions,
    ...requiredEvidence, salvageOpenFixtureTableExecuted: passed && Object.values(cases).every(row => row.executed),
    cases, acceptanceDesign: 'design/30 §4.3 O01–O08', graphCount: evidence.length,
    formalClosedGraphCount: evidence.filter(row => row.graph === 'formal-closed').length,
    memoryOpenGraphCount: evidence.filter(row => row.graph === 'memory-open').length, invalidDependencies,
    formalGraph: { SalvageOpenFlag: false, flagLoads: 0 }, memoryOpenGraph: { injectedFlag: true, flagLoads: 1 },
    freshSsrRoundtrip: passed, productionFixtureInstances: false, deterministic: true,
    boundary: '本窗=分解开态夹具全表≠soft-open≠release≠进包；fixture≠正式；核齐备≠生产放行',
    frozenShas: frozen, frozenSourceShas: frozenSources, evidence };
  await fs.writeFile(path.join(out, 'v06p1-salvage-open-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'open-runtime-protection-check.json'), JSON.stringify({
    passed: protectionPassed, beforeAfterMatched: protectionPassed, frozenMatch: protectionPassed,
    SalvageOpenFlag: false, EnhanceOpenFlag: true, EnchantOpenFlag: true, files: Object.fromEntries(captured),
  }, null, 2) + '\n');
}
console.log('v06p1 salvage open fixture tests ok: ' + (assertions + runtimeAssertions) +
  ' assertions; O01–O08; shared/snapshot + formal-closed(flagLoads=0)/memory-open(flagLoads=1)/fresh SSR; ' +
  'SalvageOpenFlag=false; softOpenedSalvage=false; released=false; fixture≠正式；核齐备≠生产放行；本令≠soft-open≠release≠进包');
