// 正式附灵旗恒 false；只在独立 Vite SSR resolve/load 内存图注入 true。本窗不授权 soft-open / release / 进包。
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
const out = process.env.ENCHANT_OPEN_OUT ?? path.join(root, 'qa/out_v06p1_enchant_open_fixture');
const frozen = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f',
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const frozenSources = {
  'src/ForgeOpenFlag.ts': '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  'src/EnhanceOpenFlag.ts': 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  'src/data.ts': 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a',
};
const requiredEvidence = {
  enchantClosedTipsWired: true, beastCoreMapped: true, enchantOpenFixtureTableExecuted: true,
  formalInstanceSource: true, softOpenedEnchant: false, EnchantOpenFlag: false, released: false,
  protectCharmSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true,
};
const apiTips = {
  feature: 'featureClosed', entrance: 'refuseEntrance', enchant: 'refuseEnchant', submit: 'refuseSubmit',
  result: 'refuseResult', element: 'refuseElement', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService',
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
  for (const file of ['src/EnhanceGate.ts', 'src/ForgeGate.ts', 'src/EnhanceClosed.ts', 'src/ForgeClosed.ts',
    'src/EnchantClosed.ts', 'src/EnchantOpenFlag.ts', 'src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'data/features.json'])
    await capture(path.join(root, file));
  eq(await fs.readFile(path.join(root, 'src/EnchantClosed.ts')),
    execFileSync('git', ['show', '5bee47d7b81ed22ed5c28719d9c06190ea817c13:src/EnchantClosed.ts'],
      { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }), '关态八 tip 权威字节保持');
  const flagSource = await fs.readFile(path.join(root, 'src/EnchantOpenFlag.ts'), 'utf8');
  const flagAst = ast('EnchantOpenFlag.ts', flagSource);
  const flag = flagAst.statements.find(node => ts.isFunctionDeclaration(node) && node.name?.text === 'isEnchantOpenForFixture');
  ok(flag, '正式独立 Flag 函数存在');
  eq(flag.body.statements.map(node => node.getText(flagAst).replace(/\s/gu, '')), ['returnfalse;'], '正式 Flag 函数体恒 return false');
  eq(flagAst.statements.filter(ts.isImportDeclaration).length, 0, '独立旗不借其他 Flag');
  const gateSource = await fs.readFile(path.join(root, 'src/EnchantGate.ts'), 'utf8'), gateAst = ast('EnchantGate.ts', gateSource);
  const klass = gateAst.statements.find(ts.isClassDeclaration);
  for (const [name, closed] of Object.entries(apiTips)) {
    const method = klass.members.find(node => ts.isMethodDeclaration(node) && node.name.getText(gateAst) === name);
    ok(method, 'Gate 八入口存在: ' + name);
    eq(method.body.statements[0].getText(gateAst).replace(/\s/gu, ''),
      'if(!isEnchantOpenForFixture())returnEnchantClosed.' + closed + '();', name + ' 首语句关态优先并原样返回 tip');
  }
  ok(/@xt\/balance\/enhance\.json/u.test(gateSource), 'Gate 只读正式 enhance.enchant 数值来源');
  ok(!/ForgeOpenFlag|EnhanceOpenFlag|Math\.random|enhance_enchant\.json/u.test(gateSource), '附灵独立许可确定性无新表或其他旗');
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  ok(!/EnchantGate|EnchantOpenFlag|EnchantClosed/u.test(scene), '不接 GameScene 附灵入口');
  ok(!/EnchantGate|EnchantOpenFlag|EnchantClosed/u.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')), '不接商店附灵 UI');
  for (const [mode, dataRoot] of roots) {
    for (const [name, sha] of Object.entries(frozen)) await capture(path.join(dataRoot, 'balance', name), sha);
    const npcs = await readJson(path.join(dataRoot, 'balance/npcs.json'));
    const smith = npcs.find(row => row.id === 'smith_ou');
    ok(smith && !Object.prototype.hasOwnProperty.call(smith, 'services'), mode + ' 不挂 smith_ou.services');
    const gifts = npcs.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, mode + ' gifts 共10处');
    ok(gifts.every(row => row.affinity.gifts.enabled === false), mode + ' gifts 10×false');
    eq(Object.keys(await readJson(path.join(dataRoot, 'balance/strings_zh.json'))).length, 952, mode + ' strings 952');
    const items = await readJson(path.join(dataRoot, 'balance/items.json'));
    const materials = await readJson(path.join(dataRoot, 'balance/materials.json'));
    eq(items.filter(row => row.id === 'beast_core'), [{ id: 'beast_core', name: '妖兽内丹', phase: 5, icon: 'icon_beast_core' }],
      mode + ' 内丹正式登记唯一且资格可读');
    eq(materials.filter(row => row.id === 'beast_core').length, 1, mode + ' 内丹有效材料唯一');
    eq(await fs.stat(path.join(dataRoot, 'balance/enhance_enchant.json')).then(() => true, error =>
      error.code === 'ENOENT' ? false : Promise.reject(error)), false, mode + ' 不新增附灵配置表');
  }
}
const invalidDependencies = [
  'missing-enchant', 'bad-damage', 'bad-root-bonus', 'bad-cost', 'bad-count', 'bad-item', 'rate-forbidden',
  'items-registration-missing', 'materials-only-visible', 'items-only-registered', 'core-phase', 'core-disabled', 'core-placeholder', 'core-quality',
];
async function invalidModules(dataRoot, name) {
  if (!name) return null;
  const tables = {
    enhance: await readJson(path.join(dataRoot, 'balance/enhance.json')),
    items: await readJson(path.join(dataRoot, 'balance/items.json')),
    materials: await readJson(path.join(dataRoot, 'balance/materials.json')),
  };
  if (name === 'missing-enchant') delete tables.enhance.enchant;
  if (name === 'bad-damage') tables.enhance.enchant.elementDamage = -0.05;
  if (name === 'bad-root-bonus') tables.enhance.enchant.sameRootBonus = null;
  if (name === 'bad-cost') tables.enhance.enchant.cost.stones = 0;
  if (name === 'bad-count') tables.enhance.enchant.cost.materials[0].count = 0;
  if (name === 'bad-item') tables.enhance.enchant.cost.materials[0].item = 'rabbit_fur';
  if (name === 'rate-forbidden') tables.enhance.enchant.rate = 1;
  if (name === 'items-registration-missing' || name === 'materials-only-visible')
    tables.items = tables.items.filter(row => row.id !== 'beast_core');
  if (name === 'items-only-registered') tables.materials = tables.materials.filter(row => row.id !== 'beast_core');
  const core = tables.materials.find(row => row.id === 'beast_core');
  if (name === 'core-phase') core.phase = 6;
  if (name === 'core-disabled') core.enabled = false;
  if (name === 'core-placeholder') core.placeholder = true;
  if (name === 'core-quality') core.qualityEnabled = true;
  return tables;
}
async function runGraph(dataMode, dataRoot, openFixture, refreshPayloads = null, invalidDependency = null) {
  let flagLoads = 0;
  const flagId = '\0v06p1-enchant-memory-open-flag', modules = await invalidModules(dataRoot, invalidDependency);
  const graph = openFixture ? 'memory-open' : 'formal-closed';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-enchant-memory-open', enforce: 'pre',
      resolveId(id) {
        if (openFixture && /(?:^|\/)EnchantOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
        if (modules) {
          const match = id.match(/(?:^|\/)balance\/(enhance|items|materials)\.json$/u);
          if (match) return '\0v06p1-enchant-dependency-' + match[1];
        }
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isEnchantOpenForFixture() { return true; }'; }
        const name = id.startsWith('\0v06p1-enchant-dependency-') ? id.slice('\0v06p1-enchant-dependency-'.length) : null;
        if (name) return 'export default ' + JSON.stringify(modules[name]) + ';';
      },
    }],
  });
  try {
    const flag = await server.ssrLoadModule('/src/EnchantOpenFlag.ts');
    eq(flag.isEnchantOpenForFixture(), openFixture, dataMode + '/' + graph + ' Flag 仅 SSR 注入');
    const suite = await server.ssrLoadModule('/src/v06p1-enchant-open.test.ts');
    const result = await suite.runEnchantOpenFixtureTests({ openFixture, dataMode, refreshPayloads, invalidDependency });
    eq(result.passed, true, dataMode + '/' + graph + ' 测试通过');
    ok(Number.isSafeInteger(result.assertions) && result.assertions > 0, '自动化断言真实执行');
    runtimeAssertions += result.assertions;
    eq(flagLoads, openFixture ? 1 : 0, dataMode + '/' + graph + ' resolve/load 单一内存旗载入次数');
    for (const [key, value] of Object.entries(requiredEvidence))
      eq(result[key], key === 'enchantOpenFixtureTableExecuted' ? openFixture && !refreshPayloads && !invalidDependency : value,
        dataMode + '/' + graph + ' evidence ' + key);
    eq(result.randomCalls, 0, '附灵无概率调用');
    eq(result.localWrites, 0, '无 localStorage 写旁路');
    eq(result.productionFixtureInstances, false, '正式图无 fixtureInstances 生产默认依赖');
    const { payloads, ...rest } = result;
    const row = { ...rest, flagLoads, invalidDependency, freshSsr: refreshPayloads !== null };
    evidence.push(row);
    console.log(JSON.stringify({ suite: 'v06p1-enchant-open-graph', dataMode, graph, invalidDependency,
      freshSsr: row.freshSsr, assertions: result.assertions, flagLoads, storageWrites: result.storageWrites, passed: true }));
    return JSON.parse(JSON.stringify(payloads));
  } finally { await server.close(); }
}

await fs.mkdir(out, { recursive: true });
try {
  await sourceChecks();
  for (const [mode, dataRoot] of roots) {
    await runGraph(mode, dataRoot, false);
    const payloads = await runGraph(mode, dataRoot, true);
    ok(payloads.length >= 3, mode + ' 首次成功覆盖强化护符保留共三类刷新数据');
    await runGraph(mode, dataRoot, true, payloads);
    await runGraph(mode, dataRoot, false, payloads);
    for (const name of invalidDependencies) await runGraph(mode, dataRoot, true, null, name);
  }
  passed = true;
} finally {
  for (const [file, sha] of captured) eq(hash(await fs.readFile(file)), sha, '运行前后冻结 SHA MATCH: ' + file);
  protectionPassed = true;
  const fullGraphs = evidence.filter(row => row.enchantOpenFixtureTableExecuted);
  const cases = Object.fromEntries(Array.from({ length: 8 }, (_, index) => {
    const key = 'O' + String(index + 1).padStart(2, '0');
    return [key, { executed: fullGraphs.length === 2 && fullGraphs.every(row => row.cases[key]?.executed === true),
      evidenceKeys: evidence.flatMap(row => row.cases[key]?.evidenceKeys.map(value =>
        row.dataMode + '/' + row.graph + '/' + (row.invalidDependency ?? (row.freshSsr ? 'fresh-ssr' : 'initial')) + '/' + value) ?? []) }];
  }));
  const result = { passed, assertions: assertions + runtimeAssertions, runnerAssertions: assertions, runtimeAssertions,
    ...requiredEvidence, enchantOpenFixtureTableExecuted: passed && Object.values(cases).every(row => row.executed),
    cases, acceptanceDesign: 'design/29 §4.3 O01–O08', graphCount: evidence.length, invalidDependencies,
    formalGraph: { EnchantOpenFlag: false, flagLoads: 0 }, memoryOpenGraph: { injectedFlag: true, flagLoads: 1 },
    freshSsrRoundtrip: true, productionFixtureInstances: false, deterministic: true,
    boundary: '本窗=附灵开态夹具全表 ≠ soft-open 进包 ≠ release', frozenShas: frozen,
    frozenSourceShas: frozenSources, evidence };
  await fs.writeFile(path.join(out, 'v06p1-enchant-open-evidence.json'), JSON.stringify(result, null, 2) + '\n');
  await fs.writeFile(path.join(out, 'open-runtime-protection-check.json'), JSON.stringify({
    passed: protectionPassed, beforeAfterMatched: protectionPassed, frozenMatch: protectionPassed,
    EnchantOpenFlag: false, EnchantClosedAuthorityMatched: protectionPassed, files: Object.fromEntries(captured),
  }, null, 2) + '\n');
}
console.log('v06p1 enchant open fixture tests ok: ' + (assertions + runtimeAssertions) +
  ' assertions; O01–O08; shared/snapshot + formal-closed/memory-open/fresh SSR; EnchantOpenFlag=false; softOpenedEnchant=false; released=false');
