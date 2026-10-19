import { assertSmithServicesScene } from './v06p1-smith-services-scene-compat.mjs';
// 双根隔离：正式旗标恒 true；仅独立 Vite SSR 关态图由 resolve/load 内存注入 false。
import assert from 'node:assert/strict';
import { salvageSourceNames } from './v06p1-salvage-soft-open-compat-proof.mjs';
import { enchantSourceNames, checkEnchantCompatibility } from './v06p1-enchant-soft-open-compat-proof.mjs';
import { execFileSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root);
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const dataRoots = [['shared', shared], ['wt', path.join(root, 'data')], ['game', path.join(shared, 'game/data')]];
const out = process.env.OUT_DIR ?? path.join(root, 'qa/out_v06p1_salvage_soft_open/regressions/forge-open');
const before = new Map(), directoryBefore = new Map(), evidence = [];
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const recipesSha = '3182fff563b5f5f5341af79f64b93026c43ae45aaa1c6248e7f6276af6c38bfd';
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
      const folder = path.join(dataRoot, directory);
      const names = (await filesUnder(folder)).filter(name => name.endsWith('.json'));
      directoryBefore.set(folder, names);
      for (const name of names) before.set(path.join(folder, name), await shaOrNull(path.join(folder, name)));
    }
    before.set(path.join(dataRoot, 'features.json'), await shaOrNull(path.join(dataRoot, 'features.json')));
  }
  for (const name of ['src/features.ts', 'src/data.ts', 'src/Progress.ts', 'src/SaveStore.ts',
    'src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'src/ForgeClosed.ts', 'src/ForgeOpenFlag.ts',
    'src/ForgeProgress.ts', 'src/ForgeGate.ts', 'src/MarketOpenFlag.ts', 'src/MarketGate.ts',
    'src/MarketProgress.ts', 'src/MarketClosed.ts', 'src/TowerOpenFlag.ts']) {
    before.set(path.join(root, name), await shaOrNull(path.join(root, name)));
  }
}
async function checkFormal() {
  const flag = await fs.readFile(path.join(root, 'src/ForgeOpenFlag.ts'), 'utf8');
  ok(/export function isForgeOpenForFixture\(\): boolean\s*\{\s*return true;\s*\}/u.test(flag), '正式磁盘ForgeOpenFlag恒true');
  ok(!/import\s|process\.|globalThis|localStorage|sessionStorage|featureEnabled|enabled/u.test(flag), '正式旗标不受配表环境或会话翻转');
  const oldClosed = execFileSync('git', ['show', '6e94f87:src/ForgeClosed.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  eq(await fs.readFile(path.join(root, 'src/ForgeClosed.ts')), oldClosed, 'ForgeClosed保留关态基线原字节');
  const gate = await fs.readFile(path.join(root, 'src/ForgeGate.ts'), 'utf8');
  ok(/import recipes from ['"]@xt\/balance\/recipes\.json['"]/u.test(gate), '生产Gate从权威alias读recipes.json');
  const methods = { feature: 'featureClosed', entrance: 'refuseEntrance', craft: 'refuseCraft', submit: 'refuseSubmit',
    result: 'refuseResult', grade: 'refuseGrade', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' };
  for (const [method, closed] of Object.entries(methods))
    ok(new RegExp(`(?:async\\s+)?${method}\\([^)]*\\)\\s*:\\s*[^\\{]+\\{\\s*if\\s*\\(!isForgeOpenForFixture\\(\\)\\)\\s*return ForgeClosed\\.${closed}\\(\\);`, 'u').test(gate),
      `${method}首语句先查旗并返回对应原关态tip`);
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  assertSmithServicesScene(scene, eq);
  ok(/this\.tryInteractTowerClosed\(\)\s*\|\|\s*this\.tryInteractMarketConsign\(\)\s*\|\|\s*this\.tryInteractForgeEntrance\(\)[^\n]*this\.talkNearby\(\)/u.test(scene),
    'Z键链在talkNearby前同级接入炼器');
  ok(/if \(this\.tryInteractMarketConsign\(\)\) return true;\s*if \(this\.tryInteractForgeEntrance\(\)\) return true;/u.test(scene),
    '通用交互链在既有market旁接入炼器');
  ok(!/ForgePanel|CraftPanel|openForge|submitForge|ForgeProgress|fixtureRecipes/u.test(scene), 'GameScene 委托统一 UI，无直接服务结算或夹具注入');
  ok(!/ForgeGate|ForgeOpenFlag|ForgeProgress|tryInteractForge|openForge|submitForge/u.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')),
    'ShopPanel不接打造');
  const consumers = [];
  for (const file of (await filesUnder(path.join(root, 'src'))).filter(name => name.endsWith('.ts'))) {
    if (['ForgeGate.ts', 'v06p1-forge-open.test.ts', 'v06p1-enhance-open.test.ts', ...enchantSourceNames, ...salvageSourceNames].includes(file)) continue;
    if (/from\s+['"][^'"]*ForgeGate(?:\.ts)?['"]/u.test(await fs.readFile(path.join(root, 'src', file), 'utf8'))) consumers.push(file);
  }
  eq(consumers, ['SmithServicesController.ts'], 'ForgeGate正式 UI 消费者为统一服务控制器');
  for (const [mode, dataRoot] of dataRoots) {
    const dataFiles = [...await filesUnder(path.join(dataRoot, 'balance')), ...await filesUnder(path.join(dataRoot, 'maps'))];
    eq(dataFiles.filter(name => /^forge_.*\.json$/u.test(path.basename(name))), [], `${mode} 无forge_*.json正式配方表`);
    eq(await shaOrNull(path.join(dataRoot, 'balance/enhance.json')), enhanceSha, `${mode} enhance保持指定SHA`);
    if (mode !== 'game') {
      eq(await shaOrNull(path.join(dataRoot, 'balance/recipes.json')), recipesSha, `${mode} recipes精确权威SHA`);
      const recipeTable = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/recipes.json'), 'utf8'));
      eq(recipeTable.recipes.length, 13, `${mode} 保留既有并追加青竹+青钢两条forge`);
      eq(recipeTable.recipes.filter(row => row.type === 'forge').map(row => row.id),
        ['recipe_forge_bamboo_sword', 'recipe_forge_azure_steel_sword'], `${mode} 正式forge青竹+青钢`);
      const previous = JSON.parse(execFileSync('git', ['show', '801c3ab:data/balance/recipes.json'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] }));
      eq({ ...recipeTable, recipes: recipeTable.recipes.slice(0, -2) }, previous, `${mode} 既有11条/rules/newItems保留`);
      eq(recipeTable.recipes[11]?.id, 'recipe_forge_bamboo_sword', `${mode} 索引11青竹`);
      eq(recipeTable.recipes[12]?.id, 'recipe_forge_azure_steel_sword', `${mode} 索引12青钢`);
    }
    const table = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/enhance.json'), 'utf8'));
    eq(table.forge.grade, { common: 0.6, fine: 0.3, spirit: 0.09, treasure: 0.01 }, `${mode} 品质只读既有四项概率`);
    ok(!Object.prototype.hasOwnProperty.call(table.forge, 'enabled'), `${mode} 不新增forge.enabled配表开关`);
    const skills = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/life_skills.json'), 'utf8'));
    eq(skills.integrationState, 'pending', `${mode} forging仍pending`);
    ok(skills.skills.some(skill => skill.id === 'forging'), `${mode} forging仅保留既有登记`);
    const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
    const smith = npcs.find(npc => npc.id === 'smith_ou');
    ok(smith, `${mode} 仅引用既有smith_ou`);
    eq(Object.prototype.hasOwnProperty.call(smith, 'services'), false, `${mode} 不挂smith_ou.services`);
    eq(smith.quests, [], `${mode} 不混入NPC任务`);
    let giftsChecked = 0;
    const visit = value => {
      if (!value || typeof value !== 'object') return;
      for (const [key, child] of Object.entries(value)) {
        if (key === 'gifts') { giftsChecked++; eq(child?.enabled, false, `${mode} gifts保持false`); }
        visit(child);
      }
    };
    visit(npcs); eq(giftsChecked, 10, `${mode} gifts十处全关`);
    const shops = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/shops.json'), 'utf8'));
    ok(Object.values(shops).every(Array.isArray), `${mode} shops保持既有NPC货单`);
    ok(!Object.keys(shops).some(key => /forge|smith_ou|auction|consign/iu.test(key)), `${mode} 不混打造寄售拍卖服务`);
    report({ suite: 'v06p1-forge-open-formal', dataMode: mode, formalOpen: true, closedFixtureOnly: true,
      enhanceSha, ...(mode !== 'game' ? { recipesSha, formalForgeRows: 2 } : {}),
      giftsChecked, smithServices: false, minimalSceneWiring: true, smithServicesUiWired: true,
      softOpened: true, released: false });
  }
}
async function runGraph(mode, dataRoot, openFixture, refreshPayloads = null) {
  let flagLoads = 0, featureOverrideCalls = 0;
  const flagId = '\0v06p1-memory-closed-forge-flag', phaserId = '\0v06p1-forge-phaser';
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-forge-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return phaserId;
        if (!openFixture && /(?:^|\/)ForgeOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isForgeOpenForFixture() { return false; }'; }
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
          'export function setFeatureFlag(name: FeatureName, value: boolean): void { globalThis.__v06p1ForgeFeatureOverrideAttempt();');
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__v06p1ForgeFeatureOverrideAttempt');
  Object.defineProperty(globalThis, '__v06p1ForgeFeatureOverrideAttempt', { configurable: true, value() {
    featureOverrideCalls++; throw new Error('本套件禁止features覆盖');
  } });
  try {
    const flag = await server.ssrLoadModule('/src/ForgeOpenFlag.ts');
    eq(flag.isForgeOpenForFixture(), openFixture, `${mode} 正式图true，关态图仅内存false`);
    const data = await server.ssrLoadModule('/src/data.ts');
    eq(data.GAME_PHASE, 5, `${mode} GAME_PHASE仍为5`);
    const features = await server.ssrLoadModule('/src/features.ts');
    ok(!Object.keys(features.featureFlags()).some(key => /forge|forging/iu.test(key)), `${mode} 不用配表新增炼器开关`);
    const suite = await server.ssrLoadModule('/src/v06p1-forge-open.test.ts');
    const result = await suite.runForgeOpenFixtureTests({ openFixture, dataMode: mode, refreshPayloads });
    ok(Number.isSafeInteger(result.assertions) && result.assertions > 0, `${mode} 自动化断言实际执行`);
    runtimeAssertions += result.assertions;
    eq(featureOverrideCalls, 0, `${mode} 正式图与夹具图均不覆盖features`);
    eq(flagLoads, openFixture ? 0 : 1, `${mode} 正式图无注入，关态图虚拟flag仅加载一次`);
    const { payloads, ...resultEvidence } = result;
    report({ suite: 'v06p1-forge-open-graph', dataMode: mode, graph: openFixture ? 'formal-open' : 'memory-closed',
      freshSsrRefresh: refreshPayloads !== null, formalOpen: true, closedFixtureOnly: true, flagLoads, featureOverrideCalls,
      result: resultEvidence, savedStateEvidence: payloads.map(({ state, craftRequestId, save }) =>
        ({ state, craftRequestId, saveSha: hash(JSON.stringify(save)) })), softOpened: true, released: false });
    return result;
  } finally {
    if (descriptor) Object.defineProperty(globalThis, '__v06p1ForgeFeatureOverrideAttempt', descriptor);
    else Reflect.deleteProperty(globalThis, '__v06p1ForgeFeatureOverrideAttempt');
    await server.close();
  }
}

await fs.mkdir(out, { recursive: true });
let passed = false;
try {
  report(await checkEnchantCompatibility(root, shared, eq));
  await protectFiles();
  await checkFormal();
  for (const [mode, dataRoot] of modes) {
    const opened = await runGraph(mode, dataRoot, true);
    await runGraph(mode, dataRoot, false);
    eq(opened.payloads.length, 4, `${mode} 提供四品质真实完整保存载荷`);
    await runGraph(mode, dataRoot, true, opened.payloads);
    // 将已提交历史结果带入全新内存关态图，关态优先并保留合法既有资产。
    await runGraph(mode, dataRoot, false, opened.payloads);
  }
  passed = true;
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `夹具运行前后保护字节不变：${file}`);
  for (const [folder, names] of directoryBefore)
    eq((await filesUnder(folder)).filter(name => name.endsWith('.json')), names, `夹具不新建删除正式balance/maps JSON：${folder}`);
  report({ suite: 'v06p1-forge-open-sha-guard', protectedFiles: before.size, protectedDirectories: directoryBefore.size, passed: true });
  await fs.writeFile(path.join(out, 'v06p1-forge-open-evidence.json'), `${JSON.stringify({ passed,
    assertions: assertions + runtimeAssertions, staticAssertions: assertions, runtimeAssertions,
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    protectedFiles: Object.fromEntries(before), protectedDirectories: Object.fromEntries(directoryBefore), evidence }, null, 2)}\n`);
}
console.log(`v06p1 forge formal recipe tests ok: ${assertions + runtimeAssertions} assertions; shared/snapshot双根formal-open+memory-closed及fresh SSR四品质读回；正式配方闭环/outputCount/fixture隔离；O01–O08；Scene最小smith_ou冒烟零写；正式flag=true；ForgeClosed原字节；gifts 10×false；enhance未改；GAME_PHASE=5；formalOpen:true、closedFixtureOnly:true、softOpened:true、released:false；未进包、未发版`);
