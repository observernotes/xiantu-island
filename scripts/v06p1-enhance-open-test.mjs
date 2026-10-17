import { assertSmithServicesScene } from './v06p1-smith-services-scene-compat.mjs';
// 护符 soft-open 正式磁盘图；仅独立 Vite SSR 关态图内存注入 false。soft-open≠进包≠发版。
import assert from 'node:assert/strict';
import { salvageSourceNames } from './v06p1-salvage-soft-open-compat-proof.mjs';
import { stripEnchantClosedAddition, enchantSourceNames, checkEnchantCompatibility } from './v06p1-enchant-soft-open-compat-proof.mjs';
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
const out = process.env.XT_ENHANCE_QA_OUT ?? process.env.OUT_DIR ?? path.join(root, 'qa/out_v06p1_salvage_soft_open/regressions/enhance-open');
const before = new Map(), directoryBefore = new Map(), evidence = [];
const recipesSha = '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f';
const forgeFlagSha = '0ce035549fc88e9ca4aa55fb10e762657a684bb4ff57ca700557553d6f16cc3e';
const enhanceSha = 'd5b91a06b748aed2c9f0c4894422f33b69471c7f0967d6da325dd640c6b71954';
const enhanceFlagSha = 'd7a3f688e5bf8eb30cfbfd7700de035be2554be825d89208adc898b0f9ee099e';
const stringsSha = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda';
const previousStringsSha = '92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab';
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
let assertions = 0, runtimeAssertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const compatibilityMeaning = 'formalOpen/softOpened 表示正式磁盘护符 soft-open；护符 soft-open ≠ 进包 ≠ 发版；memory-closed 仍先拒绝，fixture≠正式≠进包依据';
const charmEvidence = { protectCharmWired: true, protectCharmN: 1, protectCharmOpenFixtureTableExecuted: true, formalTipsWired: true, formalInstanceSource: true, softOpenedEntrance: true, softOpenedFormalSettle: true, softOpenedProtectCharm: true, released: false };
const openTableCases = ['O01', 'O02', 'O03', 'O04', 'O05', 'O06'];
const charmSnapshots = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const report = row => { row = { ...charmEvidence, protectCharmOpenFixtureTableExecuted: false, compatibilityMeaning, ...row }; evidence.push(row); console.log(JSON.stringify(row)); };
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
    'src/scenes/GameScene.ts', 'src/ShopPanel.ts', 'src/EnhanceClosed.ts', 'src/EnhanceOpenFlag.ts',
    'src/EnhanceProgress.ts', 'src/EnhanceGate.ts', 'src/ForgeOpenFlag.ts', 'src/ForgeGate.ts', 'src/MarketOpenFlag.ts', 'src/MarketGate.ts',
    'src/MarketProgress.ts', 'src/MarketClosed.ts', 'src/TowerOpenFlag.ts']) {
    before.set(path.join(root, name), await shaOrNull(path.join(root, name)));
  }
}
async function checkFormal() {
  const flag = await fs.readFile(path.join(root, 'src/EnhanceOpenFlag.ts'), 'utf8');
  eq(hash(flag), enhanceFlagSha, 'EnhanceOpenFlag保持正式true指定完整SHA');
  ok(/export function isEnhanceOpenForFixture\(\): boolean\s*\{\s*return true;\s*\}/u.test(flag), '正式磁盘EnhanceOpenFlag恒true');
  ok(!/import\s|process\.|globalThis|localStorage|sessionStorage|featureEnabled|enabled/u.test(flag), '正式旗标不受配表环境或会话翻转');
  const oldClosed = execFileSync('git', ['show', '64c26a4:src/EnhanceClosed.ts'], { cwd: root, stdio: ['ignore', 'pipe', 'pipe'] });
  eq(await fs.readFile(path.join(root, 'src/EnhanceClosed.ts')), oldClosed, 'EnhanceClosed保留关态基线原字节');
  eq(await shaOrNull(path.join(root, 'src/ForgeOpenFlag.ts')), forgeFlagSha, 'ForgeOpenFlag保持写前指定SHA');
  const gate = await fs.readFile(path.join(root, 'src/EnhanceGate.ts'), 'utf8');
  const methods = { feature: 'featureClosed', entrance: 'refuseEntrance', enhance: 'refuseEnhance', submit: 'refuseSubmit',
    level: 'refuseLevel', consume: 'refuseConsume', loadRefresh: 'refuseLoadRefresh', laterService: 'refuseLaterService' };
  ok(/import enhance from ['"]@xt\/balance\/enhance\.json['"]/u.test(gate), 'Gate数值仅从正式enhance.json读取');
  ok(/import strings from ['"]@xt\/balance\/strings_zh\.json['"]/u.test(gate), '正式拒绝文案只读strings_zh');
  ok(/const formalDenied\s*=\s*\(tipKey/u.test(gate) && /strings[^;\n]*\[tipKey\]/u.test(gate), '正式拒绝帮助函数按tipKey查strings');
  for (const [tipKey, text] of Object.entries(formalStrings)) {
    ok(gate.includes(tipKey), `Gate接正式键：${tipKey}`);
    ok(!gate.includes(text), `Gate不硬编码正式中文：${tipKey}`);
  }
  ok(!/ForgeOpenFlag|forge\.closed\.|fixtureRates|fixtureCosts/u.test(gate), '强化不借打造旗或夹具费用概率回退');
  ok(/@xt\/balance\/enhance_protect_charm\.json/u.test(gate), 'Gate只读正式护符映射表');
  ok(/removeItem\('protect_charm',/u.test(gate), 'Gate同草稿实际消费正式protect_charm而非虚拟item id');
  ok(!/requestsProtect\(request\)/u.test(gate), '已替换true一律protect的提前拦截');
  for (const [mode, dataRoot] of modes) {
    for (const [name, sha] of Object.entries(charmSnapshots))
      eq(await shaOrNull(path.join(dataRoot, 'balance', name)), sha, `${mode} ${name} 精确快照权威SHA MATCH`);
    eq(JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/enhance_protect_charm.json'), 'utf8')),
      { itemId: 'protect_charm', countPerSettlement: 1 }, `${mode} 护符正式唯一id与N=1`);
  }
  ok(/formalEnhanceInstances/u.test(gate), '正式Gate显式读取本档正式登记而不依赖fixtureInstances');
  const progress = await fs.readFile(path.join(root, 'src/Progress.ts'), 'utf8');
  ok(/registerFormalEnhanceInstance/u.test(progress) && /formalEnhanceInstanceStatus/u.test(progress), '正式登记API及本档来源检查已接线');
  const forge = await fs.readFile(path.join(root, 'src/ForgeGate.ts'), 'utf8');
  ok(/draft\.registerFormalEnhanceInstance\(result\)/u.test(forge), '默认正式Forge在同草稿事务登记完整结果');
  for (const [method, closed] of Object.entries(methods))
    ok(new RegExp(`(?:async\\s+)?${method}\\([^)]*\\)\\s*:\\s*[^\\{]+\\{\\s*if\\s*\\(!isEnhanceOpenForFixture\\(\\)\\)\\s*return EnhanceClosed\\.${closed}\\(\\);`, 'u').test(gate),
      `${method}首语句先查旗并返回对应原关态tip`);
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  assertSmithServicesScene(scene, eq);
  ok(/this\.tryInteractTowerClosed\(\)\s*\|\|\s*this\.tryInteractMarketConsign\(\)\s*\|\|\s*this\.tryInteractForgeEntrance\(\)[^\n]*this\.talkNearby\(\)/u.test(scene),
    'Z键链保留既有smith_ou同级入口');
  ok(/if \(this\.tryInteractMarketConsign\(\)\) return true;\s*if \(this\.tryInteractForgeEntrance\(\)\) return true;/u.test(scene),
    '通用交互链保留既有smith_ou入口');
  ok(!/EnhancePanel|EnhancementPanel|openEnhance|submitEnhance|EnhanceProgress|fixtureInstances/u.test(scene),
    'GameScene 委托统一 UI，无直接服务结算或夹具注入');
  ok(!/EnhanceGate|EnhanceOpenFlag|EnhanceProgress|tryInteractEnhance|openEnhance|submitEnhance/u.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')),
    'ShopPanel不接强化');
  const consumers = [];
  for (const file of (await filesUnder(path.join(root, 'src'))).filter(name => name.endsWith('.ts'))) {
    if (['EnhanceGate.ts', 'v06p1-enhance-open.test.ts', ...enchantSourceNames, ...salvageSourceNames].includes(file)) continue;
    if (/from\s+['"][^'"]*EnhanceGate(?:\.ts)?['"]/u.test(await fs.readFile(path.join(root, 'src', file), 'utf8'))) consumers.push(file);
  }
  eq(consumers, ['SmithServicesController.ts'], 'EnhanceGate正式 UI 消费者为统一服务控制器');
  for (const [mode, dataRoot] of dataRoots) {
    const rawStrings = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
    const entries = Object.entries(JSON.parse(rawStrings));
    eq(hash(rawStrings), mode === 'game' ? '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9' : stringsSha, `${mode} strings保持开工前固定完整SHA`);
    eq(entries.length, mode === 'game' ? 952 : 960, `${mode} strings shared/wt 960键、game952键含_meta`);
    if (mode !== 'game') {
      eq(entries.slice(936, 944), Object.entries(formalStrings), `${mode} 正式八键及文案完全取表`);
      eq(hash(stripEnchantClosedAddition(rawStrings).replace(/,\n(?: {2}"enhance\.formal\.[^\n]+\n?){8}/u, '\n')), previousStringsSha,
        `${mode} 剥正式八键还原原936键完整字节`);
    }
    eq(await shaOrNull(path.join(dataRoot, 'balance/enhance.json')), enhanceSha, `${mode} enhance保持指定SHA`);
    const table = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/enhance.json'), 'utf8'));
    eq(table.levels.map(row => row.to), Array.from({ length: table.maxLevel }, (_, index) => index + 1), `${mode} 正式强化档位1到maxLevel完整`);
    eq(table.maxLevel, 12, `${mode} 不外推正式满级`);
    eq(await shaOrNull(path.join(dataRoot, 'balance/recipes.json')), recipesSha, `${mode} recipes保持指定SHA`);
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
    ok(!Object.keys(shops).some(key => /enhance|smith_ou|auction|consign/iu.test(key)), `${mode} 不混强化寄售拍卖服务`);
    report({ suite: 'v06p1-enhance-open-formal', dataMode: mode, formalOpen: true, closedFixtureOnly: true,
      enhanceSha, giftsChecked, smithServices: false, minimalSceneWiring: true, smithServicesUiWired: true, softOpened: true, released: false });
  }
}
async function runGraph(mode, dataRoot, openFixture, refreshPayloads = null, invalidTable = null) {
  let flagLoads = 0, featureOverrideCalls = 0;
  const flagId = '\0v06p1-memory-closed-enhance-flag', tableId = '\0v06p1-invalid-enhance-table', phaserId = '\0v06p1-enhance-phaser';
  let tableLoads = 0;
  const server = await createServer({
    root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-enhance-memory-closed', enforce: 'pre',
      resolveId(id) {
        if (id === 'phaser') return phaserId;
        if (!openFixture && /(?:^|\/)EnhanceOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
        if (invalidTable && /(?:^|\/)balance\/enhance\.json$/u.test(id)) return tableId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isEnhanceOpenForFixture() { return false; }'; }
        if (id === tableId) { tableLoads++; return `export default ${JSON.stringify(invalidTable.table)};`; }
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
          'export function setFeatureFlag(name: FeatureName, value: boolean): void { globalThis.__v06p1EnhanceFeatureOverrideAttempt();');
      },
    }], ssr: { noExternal: ['phaser'] },
  });
  const descriptor = Object.getOwnPropertyDescriptor(globalThis, '__v06p1EnhanceFeatureOverrideAttempt');
  Object.defineProperty(globalThis, '__v06p1EnhanceFeatureOverrideAttempt', { configurable: true, value() {
    featureOverrideCalls++; throw new Error('本套件禁止features覆盖');
  } });
  try {
    const flag = await server.ssrLoadModule('/src/EnhanceOpenFlag.ts');
    eq(flag.isEnhanceOpenForFixture(), openFixture, `${mode} 正式图true，关态图仅内存false`);
    const data = await server.ssrLoadModule('/src/data.ts');
    eq(data.GAME_PHASE, 5, `${mode} GAME_PHASE仍为5`);
    const features = await server.ssrLoadModule('/src/features.ts');
    ok(!Object.keys(features.featureFlags()).some(key => /enhance|forging/iu.test(key)), `${mode} 不用配表新增强化开关`);
    const suite = await server.ssrLoadModule('/src/v06p1-enhance-open.test.ts');
    const result = await suite.runEnhanceOpenFixtureTests({ openFixture, dataMode: mode, refreshPayloads, invalidTable: invalidTable?.name });
    ok(Number.isSafeInteger(result.assertions) && result.assertions > 0, `${mode} 自动化断言实际执行`);
    const tableExecuted = openFixture && refreshPayloads === null && invalidTable === null;
    for (const [key, value] of Object.entries(charmEvidence))
      eq(result[key], key === 'protectCharmOpenFixtureTableExecuted' ? tableExecuted : value,
        `${mode} evidence ${key}对应当前运行图及本窗授权值`);
    eq(result.compatibilityMeaning, compatibilityMeaning, `${mode} 兼容字段明确护符soft-open不授权进包发版`);
    eq(result.softOpenedFormalSettle, true, `${mode} 明确登记正式实例源soft-open结算口径`);
    eq(result.released, false, `${mode} 正式实例源soft-open不授权进包发版`);
    if (!invalidTable) {
      eq(result.sceneSmoke?.smithServicesUiWired, true, '真实欧冶匠交互进入正式服务对话');
      eq(result.sceneSmoke?.menuRouted, true, '对话选择服务后进入菜单');
      eq(result.sceneSmoke?.saveWrites, 0, `${mode} 正式或内存关态入口均只读零写`);
    }
    if (openFixture && refreshPayloads === null && invalidTable === null) {
      eq(result.protectCharmMapping?.cases, ['C01', 'C02', 'C03', 'C04', 'C05', 'C06', 'C07', 'C08'], `${mode} design28护符接线C01–C08实际旁证`);
      eq(result.protectCharmMapping?.openFixtureTableExecuted, false, `${mode} 保留独立C回归段的历史范围标记`);
      eq(result.protectCharmOpenFixtureTable?.cases, openTableCases, `${mode} design/28 O01–O06全表实际执行`);
      eq(result.protectCharmOpenFixtureTable?.source, 'default-ForgeGate-committed-result', `${mode} 护符O表只取默认Forge完整提交正式来源`);
      eq(result.protectCharmOpenFixtureTable?.productionFixtureInstances, false, `${mode} 护符O表无fixtureInstances生产依赖`);
      eq(result.protectCharmOpenFixtureTable?.softOpenedProtectCharm, true, `${mode} 护符O表固化生产soft-open口径`);
      eq(result.protectCharmOpenFixtureTable?.released, false, `${mode} 护符O表通过不授权进包发版`);
      for (const key of openTableCases) {
        eq(result.protectCharmOpenFixtureTable?.[key]?.executed, true, `${mode} design/28 ${key}独立执行旁证`);
        ok(result.protectCharmOpenFixtureTable?.[key]?.evidenceKeys?.length > 0, `${mode} design/28 ${key}旁证键非空`);
      }
      eq(result.protectCharmMapping?.falseCharmReads, 0, `${mode} false路径护符映射资格库存零读取`);
      eq(result.formalInstances?.source, 'default-ForgeGate-committed-result', `${mode} 正式O表只取默认Forge完整结果来源`);
      eq(result.formalInstances?.productionFixtureInstances, false, `${mode} 正式O表不依赖fixtureInstances`);
      eq(result.formalInstances?.registeredAtForgeCommit, true, `${mode} 打造完整提交同事务登记正式实例`);
      eq(result.formalInstances?.cases, ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'],
        `${mode} 正式磁盘图必须实际执行正式实例源O01–O08`);
    }
    runtimeAssertions += result.assertions;
    eq(featureOverrideCalls, 0, `${mode} 正式图与夹具图均不覆盖features`);
    eq(tableLoads, invalidTable ? 1 : 0, `${mode} 坏表仅独立SSR内存模块注入`);
    eq(flagLoads, openFixture ? 0 : 1, `${mode} 正式图无注入，关态图虚拟flag仅加载一次`);
    const { payloads, ...resultEvidence } = result;
    report({ suite: 'v06p1-enhance-open-graph', dataMode: mode, graph: openFixture ? 'formal-open' : 'memory-closed',
      freshSsrRefresh: refreshPayloads !== null, invalidTable: invalidTable?.name ?? null, formalOpen: true, closedFixtureOnly: true, flagLoads, featureOverrideCalls,
      protectCharmOpenFixtureTableExecuted: tableExecuted,
      result: resultEvidence, savedStateEvidence: payloads.map(({ state, enhanceRequestId, save }) =>
        ({ state, enhanceRequestId, saveSha: hash(JSON.stringify(save)) })), softOpened: true, released: false });
    return result;
  } finally {
    if (descriptor) Object.defineProperty(globalThis, '__v06p1EnhanceFeatureOverrideAttempt', descriptor);
    else Reflect.deleteProperty(globalThis, '__v06p1EnhanceFeatureOverrideAttempt');
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
    eq(opened.payloads.length, 11, `${mode} 既有八条载荷及design/28成功/两类失败三条载荷供fresh SSR读回`);
    eq(opened.payloads.filter(row => row.formalInstanceSource).length, 6, `${mode} 正式来源保存载荷均无fixtureInstances依赖`);
    await runGraph(mode, dataRoot, true, opened.payloads);
    // 将已提交历史结果带入全新内存关态图，关态优先并保留合法既有资产。
    await runGraph(mode, dataRoot, false, opened.payloads);
    const original = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/enhance.json'), 'utf8'));
    const mutations = {
      'missing-row': table => { table.levels = table.levels.filter(row => row.to !== 1); },
      'duplicate-row': table => { table.levels.push(structuredClone(table.levels[0])); },
      'invalid-rate': table => { table.levels[0].rate = -1; },
      'invalid-stones': table => { table.levels[0].stones = -1; },
      'invalid-refine': table => { table.levels[0].refineStones = 1.5; },
      'invalid-drop': table => { table.levels[0].dropOnFail = 'false'; },
      'missing-stat': table => { delete table.statPerLevel.weapon; },
      'invalid-milestone': table => { table.milestoneBonus['7'].allRatio = -1; },
      'invalid-max-level': table => { table.maxLevel = 0; },
    };
    for (const [name, mutate] of Object.entries(mutations)) {
      const table = structuredClone(original); mutate(table);
      await runGraph(mode, dataRoot, true, null, { name, table });
    }
    const table = structuredClone(original); table.levels = [];
    await runGraph(mode, dataRoot, false, null, { name: 'memory-closed-never-settles-table', table });
  }
  passed = true;
} finally {
  for (const [file, sha] of before) eq(await shaOrNull(file), sha, `夹具运行前后保护字节不变：${file}`);
  for (const [folder, names] of directoryBefore)
    eq((await filesUnder(folder)).filter(name => name.endsWith('.json')), names, `夹具不新建删除正式balance/maps JSON：${folder}`);
  report({ suite: 'v06p1-enhance-open-sha-guard', protectedFiles: before.size, protectedDirectories: directoryBefore.size, passed: true,
    protectCharmOpenFixtureTableExecuted: passed });
  await fs.writeFile(path.join(out, 'v06p1-enhance-open-evidence.json'), `${JSON.stringify({ passed,
    assertions: assertions + runtimeAssertions, staticAssertions: assertions, runtimeAssertions,
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    ...charmEvidence, protectCharmOpenFixtureTableExecuted: passed, acceptanceDesign: 'design/28 §4.3 O01–O06',
    protectCharmOpenFixtureTable: Object.fromEntries(openTableCases.map(key => [key, { executed: passed,
      evidenceKeys: modes.map(([mode]) => `${mode}/formal-open/result.protectCharmOpenFixtureTable.${key}`) }])),
    legacyRegressionDesign: 'design/27 existing no-charm C/O cases', compatibilityMeaning, stringsSha, enhanceFlagSha, charmSnapshots,
    protectedFiles: Object.fromEntries(before), protectedDirectories: Object.fromEntries(directoryBefore), evidence }, null, 2)}\n`);
}
console.log(`v06p1 enhance protect charm soft-open tests ok: ${assertions + runtimeAssertions} assertions; shared/snapshot双根正式磁盘formal-open(flagLoads=0)+memory-closed(flagLoads=1)及fresh SSR读回；design/28 O01–O06护符soft-open生产口径全表实际执行；C01–C08及既有design27 C/O回归保留；strings944；Scene只读无fixture；GAME_PHASE=5；${JSON.stringify(charmEvidence)}；${compatibilityMeaning}`);
