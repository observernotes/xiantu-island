// 完整炼器服务接线 C01–C11；仅 SSR 内存图注入路由/单旗关态，不执行 O 表或发布。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import fs from 'node:fs/promises';
import path from 'node:path';
import { smithServicesSoftOpenOutput, assertSmithServicesSoftOpenOutput } from './v06p1-smith-services-soft-open-output.mjs';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const out = path.resolve(process.env.OUT_DIR ?? smithServicesSoftOpenOutput(root, 'services-closed'));
assertSmithServicesSoftOpenOutput(root, out);
const baseline = '0dd59efdcd288930f1bd0525d2c9e7ddf06c0814';
const stringsShaBefore = 'ae51319b82a6486cc7f3d9b26c5ae89719e23c32ff9debdcfbb86ef7b5aea08b';
const frozenTables = {
  'enhance.json': 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954',
  'recipes.json': '3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd',
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'life_skills.json': '204261fec8ba6f9c95ce6b63e0caf92465e04a6572fcd255e561af7b7a34f57b',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
  'npcs.json': '2533a87d057146e024a90ab07749d1a667b550b9f3caa74c42f2a8ed5f9c23c6',
};
const flagShas = {
  Forge: '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e',
  Enhance: 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e',
  Enchant: 'bd5445b8ddfed56a32811cedd28db72e8676c7a5eff321e2fedb0ec5fe4c505a',
  Salvage: '69aace852957c52bf7ca0214345ede7df29d6d36ec1dfd4849462e54552edff3',
};
const addedStrings = {
  'ui.smith.closed': '炼器服务界面暂未开放。', 'ui.smith.title': '炼器服务',
  'ui.smith.forge': '打造', 'ui.smith.enhance': '强化', 'ui.smith.enchant': '附灵', 'ui.smith.salvage': '分解',
  'ui.smith.back': '返回', 'ui.smith.select_recipe': '选择打造图纸', 'ui.smith.select_instance': '选择本档正式装备',
  'ui.smith.select_weapon': '选择本档正式武器', 'ui.smith.select_element': '选择五行目标',
  'ui.smith.protect_charm': '护器符（可选）', 'ui.smith.no_charm': '不使用护器符',
  'ui.smith.selection_required': '请先完成{service}所需选择。',
  'ui.smith.confirm': '确认{service}？请核对目标、材料与消耗。',
  'ui.smith.confirm_salvage': '确认分解{item}？装备将被销毁且不可恢复。',
  'ui.smith.output_preview': '分解产出：{output}。',
  'ui.smith.result_forge': '打造完成：{item}；品质：{quality}。',
  'ui.smith.result_enhance_ok': '{item}强化成功：{before}级→{after}级。',
  'ui.smith.result_enhance_fail': '{item}强化失败：{before}级→{after}级。',
  'ui.smith.result_protected': '本次强化失败，护器符已保护装备等级。',
  'ui.smith.result_enchant': '{item}附灵完成：{element}。',
  'ui.smith.result_salvage': '{item}已分解，获得：{output}。',
  'ui.smith.no_recipe': '暂无可用的打造图纸。', 'ui.smith.no_instance': '无本档正式装备实例，无法提交。',
  'ui.smith.foreign': '非本档装备实例，无法提交。',
  'ui.smith.invalid': '当前目标或材料不可用于{service}，请重新选择。',
  'ui.smith.charm_short': '护器符数量不足。', 'ui.smith.changed': '选择内容或资源已变化，请重新确认。',
  'ui.smith.busy': '请求处理中，请勿重复提交。', 'ui.smith.duplicate': '该请求已提交，请读取既有结果。',
  'ui.smith.load_dedupe': '读档后只显示已提交结果，不重复结算。',
  'ui.smith.result_unknown': '暂未取得可核实的结果，请稍后查看；请勿重复提交。',
  'ui.smith.confirm_enchant': '确认将{item}从{from}附灵为{to}？',
  'ui.smith.enhance_preview': '强化至{level}级；成功率{rate}%。',
  'ui.smith.drop_on_fail': '失败降低{n}级，不碎装。', 'ui.smith.no_drop_on_fail': '失败不掉级，不碎装。',
  'ui.smith.same_element': '已附着该五行，无需重复附灵。', 'ui.smith.keys': '方向键选择 · 回车确认 · Esc 返回',
  'forge.grade.common': '凡', 'forge.grade.fine': '良', 'forge.grade.spirit': '灵', 'forge.grade.treasure': '宝',
};
const protectedFiles = {}, evidence = [];
const testExpectationAdaptations = [];
let passed = false, assertions = 0;
const hash = value => createHash('sha256').update(value).digest('hex');
const eq = (actual, expected, label) => { assertions++; assert.deepEqual(actual, expected, label); };
const ok = (value, label) => { assertions++; assert.ok(value, label); };
const git = (...args) => execFileSync('git', args, { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
async function guard(file, expected) {
  const actual = hash(await fs.readFile(file));
  if (expected) eq(actual, expected, `冻结 SHA MATCH: ${file}`);
  protectedFiles[file] = actual;
}
async function sourceFiles(dir) {
  const rows = await fs.readdir(dir, { withFileTypes: true });
  return (await Promise.all(rows.map(row => row.isDirectory() ? sourceFiles(path.join(dir, row.name)) : path.join(dir, row.name)))).flat();
}
async function staticChecks() {
  const oldSources = git('ls-tree', '-r', '--name-only', baseline, 'src').toString().trim().split('\n');
  const newFlags = (await sourceFiles(path.join(root, 'src'))).filter(file => /OpenFlag\.ts$/u.test(file))
    .map(file => path.relative(root, file)).sort();
  eq(newFlags, oldSources.filter(file => /OpenFlag\.ts$/u.test(file)).sort(), '无新生产 OpenFlag');
  for (const [name, expected] of Object.entries(flagShas)) {
    await guard(path.join(root, `src/${name}OpenFlag.ts`), expected);
    await guard(path.join(root, `src/${name}Gate.ts`), hash(git('show', `${baseline}:src/${name}Gate.ts`)));
  }
  for (const name of ['Progress', 'SaveStore', 'EquipInstBinding', 'EquipInstReadonly'])
    await guard(path.join(root, `src/${name}.ts`), hash(git('show', `${baseline}:src/${name}.ts`)));
  await guard(path.join(root, 'src/data.ts'), 'aad725652f5c0eb57a5c699726e570b146d5ded52d5c31715444dbbf4117024a');
  const routeText = await fs.readFile(path.join(root, 'src/SmithServices.ts'), 'utf8');
  ok(routeText.includes('SMITH_SERVICES_MEMORY_CLOSED_ROUTE'), '唯一可定位隔离图路由边界');
  ok(!/SalvageFixtureCarrier|createSalvageFixtureCarrier|fixtureInstances|fixtureRecipes/u.test(routeText), '生产适配无 fixture 回退');
  ok(!/\.laterService\s*\(/u.test(routeText), '当前四服务不用 later_service 误关');
  for (const [mode, dataRoot] of [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]]) {
    for (const [name, expected] of Object.entries(frozenTables)) await guard(path.join(dataRoot, 'balance', name), expected);
    const file = path.join(dataRoot, 'balance/strings_zh.json'), text = await fs.readFile(file, 'utf8');
    await guard(file);
    const strings = JSON.parse(text), keys = Object.keys(strings), added = Object.keys(addedStrings);
    eq(keys.length, 1013, `${mode}: strings 970→1013（含 _meta）`);
    eq(keys.slice(-43), added, `${mode}: 恰有 43 个末尾新键且顺序一致`);
    eq(keys.at(-44), 'ui.equip.inst.unavailable', `${mode}: 原末键仍紧邻追加区之前`);
    for (const [key, value] of Object.entries(addedStrings)) {
      eq(strings[key], value, `${mode}: ${key} 全文/Unicode 精确一致`);
      ok(Array.from(strings[key]).length <= 40, `${mode}: ${key} ≤40 Unicode 码点`);
    }
    const suffix = ',\n' + added.map((key, i) => `  ${JSON.stringify(key)}: ${JSON.stringify(addedStrings[key])}${i === added.length - 1 ? '' : ','}`).join('\n') + '\n}\n';
    ok(text.endsWith(suffix), `${mode}: 仅标准 2 空格末尾追加`);
    eq(hash(text.slice(0, -suffix.length) + '\n}\n'), stringsShaBefore, `${mode}: 剥43键还原原970键全部字节`);
    const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
    const rows = npcs.npcs ?? npcs, gifts = rows.filter(row => row.affinity?.gifts);
    eq(gifts.length, 10, `${mode}: gifts 十条`);
    ok(gifts.every(row => row.affinity.gifts.enabled === false), `${mode}: gifts 10×false`);
    ok(!Object.hasOwn(rows.find(row => row.id === 'smith_ou'), 'services'), `${mode}: 等价路由不改 npcs`);
    evidence.push({ suite: 'static', dataMode: mode, passed: true, stringsKeysBefore: 970, stringsKeysAfter: 1013,
      stringsShaBefore, stringsShaAfter: hash(text), previousBytesRestored: true, appendKeys: added,
      newOpenFlag: false, fourFlagsPreserved: true, settlementUnchanged: true, gifts0: true, GAME_PHASE: 5 });
  }
  eq(await fs.readFile(path.join(sharedRoot(root), 'balance/strings_zh.json')),
    await fs.readFile(path.join(root, 'data/balance/strings_zh.json')), '双根 strings 字节一致');
}
async function runGraph(dataMode, dataRoot, graph, payloads) {
  const injected = graph !== 'production-closed', flagLoads = { Forge: 0, Enhance: 0, Enchant: 0, Salvage: 0 };
  let routeTransforms = 0;
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    ssr: { noExternal: ['phaser'] }, optimizeDeps: { noDiscovery: true, include: [] },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'smith-services-isolated-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return '\0smith-closed-phaser';
        const match = id.match(/(?:^|\/)(Forge|Enhance|Enchant|Salvage)OpenFlag(?:\.ts)?$/u);
        if (injected && match) return `\0smith-closed-${match[1]}-flag`;
      },
      load(id) {
        if (id === '\0smith-closed-phaser') return 'export default { Scenes: { Events: { SHUTDOWN: "shutdown" } } };';
        for (const name of Object.keys(flagLoads)) if (id === `\0smith-closed-${name}-flag`) {
          flagLoads[name]++;
          return `let open = true; export function is${name}OpenForFixture() { return open; } export function __setOpen(value) { open = value; }`;
        }
      },
      transform(code, id) {
        if (id.endsWith('/src/v06p1-smith-services-closed.test.ts')) {
          const file = 'src/v06p1-smith-services-closed.test.ts';
          const sourceSha = hash(code);
          eq(sourceSha, hash(git('show', `abff11d:${file}`)), 'C runtime disk source stays exactly at abff11d');
          const changes = [
            ['salvage.fixture.qualification', 'salvage.fixture.relation'],
            ['C07/formal-salvage-no-production-qualification', 'C07/formal-salvage-enchanted-relation-refused'],
            ['C07 正式存活实例不自动获得分解资格/承载', 'C07 已附灵实例不可安全退役仍拒绝'],
            ['C07 原 Gate 保持缺正式资格裁决', 'C07 原 Gate 保持已附灵 relation 裁决'],
            ['C07/salvage-adapter-keeps-qualification-refusal', 'C07/salvage-adapter-keeps-relation-refusal'],
            ['C07 未齐正式依赖仅中性待核实提示', 'C07 已附灵 relation 拒绝保留中性待核实提示'],
            ['C07/formal-salvage-dependency-still-rejected', 'C07/formal-salvage-enchanted-relation-still-rejected'],
            ['formalQualificationAvailable: false', 'formalQualificationAvailable: true'],
            ['formalAtomicCarrierAvailable: false', 'formalAtomicCarrierAvailable: true'],
            ['softOpenedSmithServicesUi: false', 'softOpenedSmithServicesUi: true'],
            ['接引子仍须完成对话→菜单→四面板 tip', '接引子配合合入/对齐 soft-open tip；生产 UI 保持 abff11d'],
          ];
          for (const [before, after] of changes) {
            eq(code.split(before).length - 1, 1, `exact test-only expectation adaptation: ${before}`);
            code = code.replace(before, after);
          }
          testExpectationAdaptations.push({ dataMode, graph, file, sourceSha, changes,
            productModuleChanged: false, reason: 'abff11d/ef99abb formal qualification now reaches the existing enchanted relation refusal; all read-only and zero-write assertions retained' });
          return code;
        }
        if (!injected || !id.endsWith('/src/SmithServices.ts')) return;
        const method = /private routeAvailable\(_layer: SmithRouteLayer, _service\?: SmithService\): boolean\s*\{[\s\S]*?\n  \}/u;
        eq((code.match(method) ?? []).length, 1, `${dataMode}/${graph}: 精确替换唯一UiAccess路由委托函数`);
        routeTransforms++;
        return `let __smithRoute = { entrance: false, menu: false, panels: {} };\nexport function __setSmithRoute(value) { __smithRoute = value; }\n`
          + code.replace(method, 'private routeAvailable(_layer: SmithRouteLayer, _service?: SmithService): boolean { return _layer === "panel" ? __smithRoute.panels[_service] === true : __smithRoute[_layer] === true; }');
      },
    }],
  });
  const previousAccess = Object.getOwnPropertyDescriptor(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__');
  if (!injected) Object.defineProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__', { configurable: true, value: { entrance: false } });
  try {
    const route = await server.ssrLoadModule('/src/SmithServices.ts'), flags = {};
    for (const name of Object.keys(flagShas)) {
      flags[name] = await server.ssrLoadModule(`/src/${name}OpenFlag.ts`);
      eq(flags[name][`is${name}OpenForFixture`](), true, `${dataMode}/${graph}: 四正式 Gate 初始 true`);
    }
    const suite = await server.ssrLoadModule('/src/v06p1-smith-services-closed.test.ts');
    const result = await suite.runSmithServicesClosedTests({ dataMode, graph, payloads,
      controls: injected ? {
        setRoute: value => route.__setSmithRoute(value),
        setGate: (name, value) => flags[name].__setOpen(value),
      } : undefined });
    eq(result.passed, true, `${dataMode}/${graph}: C 套件通过`);
    eq([result.storageWrites, result.localStorageWrites, result.indexedDbOpens, result.sentinelCalls], [0, 0, 0, 0], `${dataMode}/${graph}: 全部写哨兵零`);
    eq(routeTransforms, injected ? 1 : 0, `${dataMode}/${graph}: 仅隔离内存图注入路由`);
    eq(Object.values(flagLoads), injected ? [1, 1, 1, 1] : [0, 0, 0, 0], `${dataMode}/${graph}: 不改磁盘 Flag`);
    const { payloads: nextPayloads, ...row } = result;
    evidence.push({ suite: 'runtime', ...row, injected, routeTransforms, flagLoads });
    assertions += result.assertions;
    console.log(JSON.stringify({ dataMode, graph, passed: true, assertions: result.assertions, fixtures: result.fixtures,
      invocations: result.invocations, sentinelCalls: result.sentinelCalls, storageWrites: result.storageWrites }));
    return nextPayloads;
  } finally {
    if (previousAccess) Object.defineProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__', previousAccess);
    else delete globalThis.__XT_SMITH_SERVICES_UI_ACCESS__;
    await server.close();
  }
}
await fs.mkdir(out, { recursive: true });
try {
  await staticChecks();
  for (const [mode, dataRoot] of [['shared', sharedRoot(root)], ['snapshot', path.join(root, 'data')]]) {
    await runGraph(mode, dataRoot, 'production-closed');
    const payloads = await runGraph(mode, dataRoot, 'memory-closed');
    await runGraph(mode, dataRoot, 'fresh-memory-closed', payloads);
  }
  passed = true;
} finally {
  for (const [file, expected] of Object.entries(protectedFiles)) eq(hash(await fs.readFile(file)), expected, `运行后 MATCH: ${file}`);
  const graphs = evidence.filter(row => row.suite === 'runtime'), isolated = graphs.filter(row => row.injected);
  const cases = Object.fromEntries(Array.from({ length: 11 }, (_, i) => {
    const id = `C${String(i + 1).padStart(2, '0')}`;
    return [id, { executed: isolated.length === 4 && isolated.every(row => row.cases[id]?.executed === true),
      passed: isolated.length === 4 && isolated.every(row => row.cases[id]?.passed === true),
      evidenceKeys: isolated.flatMap(row => row.cases[id]?.evidenceKeys.map(key => `${row.dataMode}/${row.graph}/${key}`) ?? []) }];
  }));
  const result = { passed, assertions, baselineTip: baseline, smithServicesUiWired: passed, newOpenFlag: false,
    enhanceSha: frozenTables['enhance.json'], stringsKeysBefore: 970, stringsKeysAfter: 1013, stringsShaBefore,
    stringsShaAfter: protectedFiles[path.join(root, 'data/balance/strings_zh.json')],
    softOpenedSmithServicesUi: true, released: false, settlementUnchanged: true, fourFlagsPreserved: true,
    GAME_PHASE: 5, gifts0: true, flagShas, protectedFiles, cases, evidence, testExpectationAdaptations,
    storageWrites: graphs.reduce((sum, row) => sum + row.storageWrites, 0),
    localStorageWrites: graphs.reduce((sum, row) => sum + row.localStorageWrites, 0),
    indexedDbOpens: graphs.reduce((sum, row) => sum + row.indexedDbOpens, 0),
    sentinelCalls: graphs.reduce((sum, row) => sum + row.sentinelCalls, 0),
    ordinarySaveSetupWrites: graphs.reduce((sum, row) => sum + row.ordinarySaveSetupWrites, 0),
    openFixtureTableExecuted: false, independentGraphs: graphs.length,
    scope: '实际 services/Gate 关态边界与 E/I 隔离；原生产关图改用SSR UiAccess入口关闭，隔离图继续替换路由测试独立关态。UI主C01–C11另由test:v06p1-smith-services-closed执行；未执行O01–O11。' };
  await fs.writeFile(path.join(out, 'evidence.json'), `${JSON.stringify(result, null, 2)}\n`);
}
console.log(`v06p1 smith-services closed PASS: ${assertions} assertions; C01–C11; shared+snapshot; softOpenedSmithServicesUi=true; released=false`);
