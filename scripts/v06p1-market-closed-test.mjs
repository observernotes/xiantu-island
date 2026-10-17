// 正式旗已软开；双数据根关态只替换 Vite SSR 内存模块，关态 API 不消费寄售数值表。
import assert from 'node:assert/strict';
import { salvageSourceNames } from './v06p1-salvage-soft-open-compat-proof.mjs';
import { stripEnchantClosedAddition, enchantSourceNames, preexistingReadOnlyShas, stripEnchantOpenProgress, stripEnchantSceneWiring, checkEnchantCompatibility } from './v06p1-enchant-soft-open-compat-proof.mjs';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { sharedRoot } from './root.mjs';
import { stripFormalEnhanceInstanceSource } from './v06p1-enhance-instance-source-proof.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const shared = sharedRoot(root), gameData = path.join(shared, 'game/data');
const modes = [['shared', shared], ['snapshot', path.join(root, 'data')]];
const dataRoots = new Map([['shared', shared], ['wt', path.join(root, 'data')], ['game', gameData]]);
const out = process.env.MARKET_CLOSED_OUT ?? process.env.OUT_DIR ?? path.join(root, 'qa/out_v06p1_salvage_soft_open/regressions/market-closed');
const baselineFile = path.join(root, 'qa/out_v06p1_market_closed/protected-before.json');
const stringsSha = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda';
const preFormalStringsSha = '92d5525c86562a870f45bf53c0c2010e961b83ec9c257a0cf8257178f45b4cab';
const preEnhanceStringsSha = 'fad9b3e604a3af23e99939bf22f77a55de803842daa297ab7fb2c2a6ed0b8967';
const marketStringsSha = 'c115b6deadf85d1aa9958de1097321ab65624b456e0fddeca42a5fe39743db27';
const previousStringsSha = '6b0861110a6af78f7bbfb78eb32e7579ecd41d5a33c3eff3da9e157794f5951f';
const originalStringsSha = '4a32b19b8e1f318cfcbbf8b9a4e9382f17e7fc3fd951d040f9ec4749524f7385';
const originalSemanticSha = '81d364627ea128a3125c1def299f1d94804cee7b7e511ff417dd4bf9ff24c7a9';
// 沿用既有寄售接线；炼器窗仅追加四个明确源码、可选袋四行与最小欧冶匠提示，八 tip 契约不变。
const openFixtureSources = ['MarketOpenFlag.ts', 'MarketProgress.ts', 'MarketGate.ts', 'v06p1-market-open.test.ts',
  'ForgeOpenFlag.ts', 'ForgeGate.ts', 'ForgeProgress.ts', 'v06p1-forge-open.test.ts',
  'EnhanceGate.ts', 'EnhanceProgress.ts', 'v06p1-enhance-open.test.ts'];
const enhanceClosedSources = ['EnhanceClosed.ts', 'EnhanceOpenFlag.ts'];
const openFixtureProgressSha = '3e1f4a258b384d5f0d1a2967d0228fcd792cb9a58979efcd5648d9baf9f2e7da';
const marketTableSha = 'e4725b4724dea9abf67baf2ee467a30e841fee3ee1a9137f5dc25225c09debde';
// 仅认可本窗权威配方及 wt 镜像的固定 SHA，game/data 和其他表继续钉历史值。
const formalRecipesSha = '1be644e365d95c5fa5e48bb8318a5b7bbe83ae1cab6657f5968a204ae0638f9f';
const formalRecipeKeys = new Set(['shared:balance/recipes.json', 'wt:balance/recipes.json', 'game:balance/recipes.json']);
const protectCharmTableShas = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
};
const protectCharmSha = key => /^(shared|wt):balance\/(?:materials|items|enhance_protect_charm)\.json$/u.test(key)
  ? protectCharmTableShas[key.slice(key.lastIndexOf('/') + 1)] : undefined;
const closedStrings = {
  'market.closed.feature': '坊市寄售尚未开放。',
  'market.closed.list': '坊市寄售尚未开放，暂不可上架。',
  'market.closed.withdraw': '坊市寄售尚未开放，暂不可撤回。',
  'market.closed.claim': '坊市寄售尚未开放，暂不可领取。',
  'market.closed.no_deal': '坊市寄售尚未开放，不成交、不写收益收据。',
  'market.closed.no_reward': '坊市寄售尚未开放，寄售收益暂不可领取。',
  'market.closed.load_refresh': '读档或刷新后仍未开放，寄售操作暂不可用。',
  'market.closed.slot_or_item': '坊市寄售尚未开放，栏位或物品异常，暂不可操作。',
};
const forgeClosedStrings = {
  'forge.closed.feature': '炼器打造尚未开放。',
  'forge.closed.entrance': '欧冶匠暂不提供打造，可查看说明。',
  'forge.closed.craft': '炼器打造尚未开放，暂不可打造。',
  'forge.closed.no_submit': '炼器打造尚未开放，暂不可提交图纸或材料。',
  'forge.closed.no_result': '炼器打造尚未开放，不产出成品。',
  'forge.closed.no_grade': '炼器打造尚未开放，不展示或结算品质档。',
  'forge.closed.load_refresh': '读档或刷新后炼器仍未开放，暂不可打造。',
  'forge.closed.later_service': '强化、附灵与分解等后续服务尚未开放。',
};
const enhanceClosedStrings = {
  'enhance.closed.feature': '装备强化尚未开放。',
  'enhance.closed.entrance': '欧冶匠暂不提供强化，可查看说明。',
  'enhance.closed.enhance': '装备强化尚未开放，暂不可强化。',
  'enhance.closed.no_submit': '装备强化尚未开放，暂不可提交强化。',
  'enhance.closed.no_level': '装备强化尚未开放，不变更强化等级。',
  'enhance.closed.no_consume': '装备强化尚未开放，不扣灵石或精炼石。',
  'enhance.closed.load_refresh': '读档或刷新后强化仍未开放，暂不可强化。',
  'enhance.closed.later_service': '附灵与分解等后续服务尚未开放。',
};
const apiTips = {
  featureClosed: 'market.closed.feature', refuseList: 'market.closed.list',
  refuseWithdraw: 'market.closed.withdraw', refuseClaim: 'market.closed.claim',
  refuseDeal: 'market.closed.no_deal', refuseReward: 'market.closed.no_reward',
  refuseLoadRefresh: 'market.closed.load_refresh', refuseSlotOrItem: 'market.closed.slot_or_item',
};
const caseApis = {
  C01: ['featureClosed'], C02: ['refuseList'], C03: ['refuseSlotOrItem'],
  C04: ['refuseWithdraw'], C05: ['refuseClaim'], C06: ['refuseReward'],
  C07: ['refuseDeal'], C08: ['refuseWithdraw', 'refuseClaim'],
  C09: ['refuseWithdraw', 'refuseDeal'], C10: ['refuseLoadRefresh'],
  C11: ['refuseLoadRefresh', 'refuseList', 'refuseWithdraw', 'refuseClaim'],
};
const evidence = [], readOnlyBefore = new Map();
let assertions = 0;
const eq = (actual, expected, message) => { assertions++; assert.deepEqual(actual, expected, message); };
const ok = (value, message) => { assertions++; assert.ok(value, message); };
const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const clone = value => JSON.parse(JSON.stringify(value));
const report = row => { evidence.push(row); console.log(JSON.stringify(row)); };
async function shaOrNull(file) {
  try { return hash(await fs.readFile(file)); }
  catch (error) { if (error.code === 'ENOENT') return null; throw error; }
}

async function filesUnder(directory, prefix = '') {
  const names = [];
  for (const entry of await fs.readdir(directory, { withFileTypes: true })) {
    const name = path.posix.join(prefix, entry.name);
    if (entry.isDirectory()) names.push(...await filesUnder(path.join(directory, entry.name), name));
    else if (entry.isFile()) names.push(name);
  }
  return names.sort();
}

function protectedPath(key) {
  const separator = key.indexOf(':');
  if (separator < 0) return null; // tip、GAME_PHASE、gifts 计数仅为元数据。
  const mode = key.slice(0, separator), name = key.slice(separator + 1);
  if (!dataRoots.has(mode)) return null;
  return path.join(mode === 'wt' && name.startsWith('src/') ? root : dataRoots.get(mode), name);
}

// 只剥强化本窗三个 import 与一个完整提示块；打造原方法仍逐字钉旧 SHA。
function stripEnhanceSceneWiring(source) {
  source = stripEnchantSceneWiring(source, eq);
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

// 仅剥本窗明确授权的欧冶匠提示；其余 GameScene 字节仍逐字核对软开前 SHA。
function stripForgeSceneWiring(source) {
  source = stripEnhanceSceneWiring(source);
  let original = source;
  for (const line of ["import { featureClosed as forgeFeatureClosed } from '../ForgeClosed';\n",
    "import { isForgeOpenForFixture } from '../ForgeOpenFlag';\n",
    "import { ForgeGate } from '../ForgeGate';\n"]) {
    eq(original.split(line).length - 1, 1, `C12 GameScene 炼器授权 import 精确一次：${line.trim()}`);
    original = original.replace(line, '');
  }
  const entry = source.match(/  \/\*\* 仅接既有欧冶匠冒烟提示；未布置对象的地图保持安静。 \*\/\n  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}\n\n/u)?.[0];
  ok(entry, 'C01/C12 GameScene 存在最小欧冶匠入口提示方法');
  eq(hash(entry), 'f351b1220b3362b840e1b11538b5607cb2eb80079d201371034ab7d980e81b43',
    'C01/C12 欧冶匠方法仅含本窗授权提示完整字节，禁止夹带其他操作');
  ok(entry.includes("(o.name === 'smith_ou' || o.props?.npc === 'smith_ou')"), 'C01/C12 只查当前地图既有 smith_ou 对象');
  ok(entry.includes('this.senseMap?.objectVisible(o) !== false'), 'C01/C12 隐藏欧冶匠不接交互');
  ok(entry.includes('Math.abs(o.x - this.player.x) <= 28 && Math.abs(o.y - this.player.y) <= 40'), 'C01/C12 欧冶匠沿用 28×40 邻近范围');
  ok(/if \(!entrance\) return false;/u.test(entry), 'C01/C12 无欧冶匠对象安静 no-op');
  ok(/!isForgeOpenForFixture\(\)[\s\S]*forgeFeatureClosed\(\)\.text/u.test(entry), 'C01/C12 内存关态显示 ForgeClosed.featureClosed tip');
  ok(/new ForgeGate\(this\.prog\)\.entrance\(\)/u.test(entry), 'C01/C12 正式开态只问 Gate.entrance');
  ok(!/\.(?:craft|submit|result|grade|loadRefresh|laterService|save|persistSoon)\(|ShopPanel|Panel|services|auction|拍卖/u.test(entry), 'C01/C12 入口不铺完整 UI、不接服务或发起打造写操作');
  original = original.replace(entry, '');
  const zCall = 'this.tryInteractMarketConsign() || this.tryInteractForgeEntrance() || this.tryInteractSecretNest()';
  eq(original.split(zCall).length - 1, 1, 'C01/C12 Z 键在 talkNearby 之前同级接最小炼器入口');
  original = original.replace(zCall, 'this.tryInteractMarketConsign() || this.tryInteractSecretNest()');
  const interactCall = '    if (this.tryInteractForgeEntrance()) return true;\n';
  eq(original.split(interactCall).length - 1, 1, 'C01/C12 通用交互仅接同一炼器提示入口');
  return original.replace(interactCall, '');
}

function stripMarketSceneWiring(source) {
  let original = source;
  for (const line of ["import { featureClosed as marketFeatureClosed } from '../MarketClosed';\n",
    "import { isMarketOpenForFixture } from '../MarketOpenFlag';\n",
    "import { MarketGate } from '../MarketGate';\n"]) {
    eq(original.split(line).length - 1, 1, `C12 GameScene 授权 import 精确一次：${line.trim()}`);
    original = original.replace(line, '');
  }
  const entry = source.match(/  \/\*\* 仅接既有寄售入口的冒烟提示；未布置对象的地图保持安静。 \*\/\n  private tryInteractMarketConsign\(\): boolean \{[\s\S]*?\n  \}\n\n/u)?.[0];
  ok(entry, 'C01/C12 GameScene 存在最小寄售入口提示方法');
  ok(entry.includes("['market_consign_entrance', 'fangshi_consign'].includes(o.name)"), 'C01/C12 只查当前地图既有寄售对象');
  ok(/if \(!entrance\) return false;/u.test(entry), 'C01/C12 无入口对象安静 no-op');
  ok(/!isMarketOpenForFixture\(\)[\s\S]*marketFeatureClosed\(\)\.text/u.test(entry), 'C01/C12 内存关态显示 MarketClosed.featureClosed tip');
  ok(/new MarketGate\(this\.prog\)\.feature\(\)/u.test(entry), 'C01/C12 正式开态只问 Gate.feature');
  ok(!/\.(?:listItem|withdraw|settle|claim|rewards|loadProgress)\(|ShopPanel|Panel|auction|拍卖/u.test(entry), 'C01/C12 入口不铺完整 UI、不发起寄售写操作或混拍卖');
  original = original.replace(entry, '');
  const zCall = 'this.tryInteractTowerClosed() || this.tryInteractMarketConsign() || this.tryInteractSecretNest()';
  eq(original.split(zCall).length - 1, 1, 'C01/C12 Z 键在 talkNearby 之前同级接最小寄售入口');
  original = original.replace(zCall, 'this.tryInteractTowerClosed() || this.tryInteractSecretNest()');
  const interactCall = '    if (this.tryInteractMarketConsign()) return true;\n';
  eq(original.split(interactCall).length - 1, 1, 'C01/C12 通用交互仅接同一最小提示入口');
  return original.replace(interactCall, '');
}

// 只剥本窗获准的四个完整行；其余 Progress 字节仍与原基线 SHA 逐字比对。
const forgeProgressAddedLines = [
  "import { isValidForgeProgress, type ForgeProgress } from './ForgeProgress';",
  "  if (has('forge') && !isValidForgeProgress(saved.forge)) return false;",
  '  /** 仅保留完整夹具事实；缺袋旧档不补建，读回不结算。 */',
  '  forge: ForgeProgress | undefined = undefined;',
];
const enhanceProgressAddedLines = [
  "import { isValidEnhanceProgress, type EnhanceProgress } from './EnhanceProgress';",
  "  if (has('enhance') && !isValidEnhanceProgress(saved.enhance)) return false;",
  '  /** 仅承载明确授权的强化夹具事实；缺袋旧档不补建，读回不结算。 */',
  '  enhance: EnhanceProgress | undefined = undefined;',
];
function stripForgeProgress(source) {
  source = stripEnchantOpenProgress(source, eq);
  source = stripFormalEnhanceInstanceSource(source, eq);
  for (const line of enhanceProgressAddedLines) {
    eq(source.split(`${line}\n`).length - 1, 1, `Progress 强化可选夹具袋授权完整行精确一次：${line.trim()}`);
    source = source.replace(`${line}\n`, '');
  }
  for (const line of forgeProgressAddedLines) {
    eq(source.split(`${line}\n`).length - 1, 1, `Progress 炼器可选袋授权完整行精确一次：${line.trim()}`);
    source = source.replace(`${line}\n`, '');
  }
  return source;
}

async function checkProtection() {
  const baseline = JSON.parse(await fs.readFile(baselineFile, 'utf8'));
  const protectedFiles = {};
  for (const [key, expected] of Object.entries(baseline)) {
    const file = protectedPath(key);
    if (!file || (expected !== null && (typeof expected !== 'string' || !/^[a-f0-9]{64}$/u.test(expected)))) continue;
    // 演武已翻 enabled=true；下方钉最终三根同字节 SHA，仅授权该表软开翻旗。
    if (key.endsWith('/market_consign.json')) continue;
    const actual = await shaOrNull(file);
    const authorizedSha = key === 'wt:src/Progress.ts' ? openFixtureProgressSha
      : key.endsWith(':balance/strings_zh.json') ? (key.startsWith('game:') ? '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9' : stringsSha)
      : formalRecipeKeys.has(key) ? formalRecipesSha : preexistingReadOnlyShas[key] ?? protectCharmSha(key) ?? expected;
    if (key === 'wt:src/Progress.ts') {
      eq(hash(stripForgeProgress(await fs.readFile(file, 'utf8'))), authorizedSha,
        'C12 Progress 仅增加炼器可选袋四完整行，剥离后原寄售基线字节保持');
    } else if (key === 'wt:src/scenes/GameScene.ts') {
      eq(hash(stripMarketSceneWiring(stripForgeSceneWiring(await fs.readFile(file, 'utf8')))), authorizedSha,
        'C12 GameScene 仅增加寄售及欧冶匠各三 import、提示方法、Z/通用交互最小接线，其余字节保持');
    } else eq(actual, authorizedSha, `C12 写前 SHA 保护：${key}`);
    readOnlyBefore.set(file, actual);
    protectedFiles[key] = actual;
  }
  for (const [mode, dataRoot] of dataRoots) {
    for (const directory of ['balance', 'maps']) {
      const actual = (await filesUnder(path.join(dataRoot, directory))).filter(name => name.endsWith('.json') && !(directory === 'balance' && name === 'market_consign.json'));
      const prefix = `${mode}:${directory}/`;
      const expected = Object.keys(baseline).filter(key => key.startsWith(prefix) && !(directory === 'balance' && key.endsWith('/market_consign.json')))
        .map(key => key.slice(prefix.length));
      if (directory === 'balance') expected.push('enhance_protect_charm.json');
      expected.sort();
      eq(actual, expected, `C12 ${mode}/${directory} 没有新增/删除表、地图或入口文件`);
    }
  }
  for (const mode of ['shared', 'wt']) for (const [name, expected] of Object.entries(protectCharmTableShas)) {
    const file = path.join(dataRoots.get(mode), 'balance', name), actual = await shaOrNull(file);
    eq(actual, expected, `${mode}: 护符三表仅接受权威固定 SHA ${name}`);
    readOnlyBefore.set(file, actual); protectedFiles[`${mode}:balance/${name}`] = actual;
  }
  const expectedSource = Object.keys(baseline).filter(key => key.startsWith('wt:src/')).map(key => key.slice('wt:src/'.length));
  eq(await filesUnder(path.join(root, 'src')), [...expectedSource, 'MarketClosed.ts', 'ForgeClosed.ts', ...openFixtureSources, ...enhanceClosedSources, ...enchantSourceNames, ...salvageSourceNames].sort(), 'C12 src 仅新增关态 API 及精确列明的寄售/炼器夹具源码与强化关态 API/Flag，无完整寄售 UI 文件');
  for (const [mode, dataRoot] of dataRoots) {
    const file = path.join(dataRoot, 'balance/market_consign.json');
    const actual = await shaOrNull(file);
    eq(actual, marketTableSha, `C12 ${mode}: market_consign 三根同字节，演武数值仅翻软开旗及状态说明`);
    readOnlyBefore.set(file, actual);
    eq(JSON.parse(await fs.readFile(file, 'utf8')).enabled, true, `C12 ${mode}: 演武表 enabled=true`);
  }
  for (const name of ['src/scenes/GameScene.ts', 'src/Progress.ts', 'src/ShopPanel.ts', 'src/data.ts', 'src/features.ts']) {
    ok(Object.hasOwn(protectedFiles, `wt:${name}`), `C12 写前证据覆盖 ${name}`);
  }
  report({ suite: 'v06p1-market-closed-protection', passed: true, protectedFiles: Object.keys(protectedFiles).length,
    sourcesOnlyAdded: ['src/MarketClosed.ts', ...openFixtureSources.map(name => `src/${name}`), ...enhanceClosedSources.map(name => `src/${name}`)],
    optionalMarketBagAdded: true, marketTableConsumedByClosedApi: false, minimalFrontendWiring: true,
    fullMarketUiAdded: false, formalRecipesSha, formalRecipeKeys: [...formalRecipeKeys],
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
}

async function checkStatic(mode, dataRoot) {
  const raw = await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'), 'utf8');
  const strings = JSON.parse(raw), entries = Object.entries(strings);
  eq(hash(raw), stringsSha, `${mode}: strings 为权威目标 SHA`);
  eq(entries.length, 960, `${mode}: shared/wt现960键；原944键由精确增量剥离逐字证明`);
  const preFormal = stripEnchantClosedAddition(raw).replace(/,\n(?: {2}"enhance\.formal\.[^\n]+\n?){8}/u, '\n');
  eq(hash(preFormal), preFormalStringsSha, `${mode}: 剥正式八键还原原936键完整字节`);
  eq(entries.slice(912, 920), Object.entries(closedStrings), `${mode}: market 八键区间及文案逐字相等`);
  eq(entries.slice(920, 928), Object.entries(forgeClosedStrings), `${mode}: forge 八键区间及文案逐字相等`);
  eq(entries.slice(928, 936), Object.entries(enhanceClosedStrings), `${mode}: enhance.closed 八键区间及文案逐字相等`);
  eq(entries.filter(([key]) => key.startsWith('market.closed.')), Object.entries(closedStrings), `${mode}: 恰有八个 market.closed 键`);
  eq(hash(JSON.stringify(entries.slice(0, 904))), originalSemanticSha, `${mode}: 原 904 键语义保持`);
  const preEnhance = preFormal.replace(/,\n(?: {2}"enhance\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(preEnhance), preEnhanceStringsSha, `${mode}: 剥 enhance 八行即还原原 928 项完整字节`);
  const market = preEnhance.replace(/,\n(?: {2}"forge\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(market), marketStringsSha, `${mode}: 再剥 forge 八行即还原原 920 项完整字节`);
  const previous = market.replace(/,\n(?: {2}"market\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(previous), previousStringsSha, `${mode}: 再剥 market 八行即还原原 912 项完整字节`);
  const original = previous.replace(/,\n(?: {2}"tower\.closed\.[^\n]+\n?){8}/u, '\n');
  eq(hash(original), originalStringsSha, `${mode}: 再剥 tower 八行即还原原 904 项完整字节`);
  for (const [key, text] of Object.entries(closedStrings)) {
    eq(strings[key], text, `${mode}: ${key} 文案逐字`);
    ok(Array.from(text).length <= 40, `${mode}: ${key} 不超过 40 字`);
  }
  const npcs = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/npcs.json'), 'utf8'));
  let gifts = 0;
  function visit(value) {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { gifts++; eq(child?.enabled, false, `${mode}/C12: gifts false`); }
      visit(child);
    }
  }
  visit(npcs);
  eq(gifts, 10, `${mode}/C12: 实际核查 gifts 10×false`);
  const shops = JSON.parse(await fs.readFile(path.join(dataRoot, 'balance/shops.json'), 'utf8'));
  ok(Object.keys(shops).length > 0 && Object.values(shops).every(Array.isArray), `${mode}/C12: shops 保持既有 NPC 货单形状`);
  ok(!Object.keys(shops).some(key => /market|consign|auction|寄售|拍卖/iu.test(key)), `${mode}/C12: 不把 shops 变成寄售或拍卖`);
  // features.ts 固定读取当前工程快照；shared/features.json 原本不存在，缺席另由 SHA 基线保护。
  const features = JSON.parse(await fs.readFile(path.join(root, 'data/features.json'), 'utf8'));
  ok(!/"[^"\n]*(?:market|consign)[^"\n]*"/iu.test(JSON.stringify(features)), `${mode}/C12: 无新增寄售开态开关`);
  report({ suite: 'v06p1-market-closed-static', dataMode: mode, passed: true, strings: entries.length,
    stringsSha, marketTableSha, marketEnabled: true, giftsFalseCount: gifts, shopsUnchanged: true,
    mapsUnchanged: true, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false });
}

async function checkSource() {
  const source = await fs.readFile(path.join(root, 'src/MarketClosed.ts'), 'utf8');
  const code = source.replace(/\/\*[\s\S]*?\*\//gu, '').replace(/\/\/[^\n]*/gu, '');
  const imports = [...code.matchAll(/\bimport\s+[^;]+;/gu)].map(match => match[0]);
  eq(imports, ["import strings from '@xt/balance/strings_zh.json';"], 'C12 API 唯一依赖权威 strings，不消费 Progress、寄售表或服务');
  ok(!/\benabled\b|\b(?:setTimeout|setInterval|queueMicrotask|requestIdleCallback|fetch)\s*\(/u.test(code), 'C12 不新增开态字段、结算、后台延后或网络写入口');
  const consumers = [];
  for (const name of await filesUnder(path.join(root, 'src'))) {
    if ([...enchantSourceNames, ...salvageSourceNames].includes(name)) continue; // 附灵/分解各精确六文件由专窗验证，生产旧消费者继续全扫。
    if (name === 'MarketClosed.ts' || openFixtureSources.includes(name) || /\.test\.[cm]?[jt]sx?$/u.test(name)) continue;
    let text = await fs.readFile(path.join(root, 'src', name), 'utf8');
    if (name === 'scenes/GameScene.ts') text = stripMarketSceneWiring(stripForgeSceneWiring(text));
    if (name === 'Progress.ts') {
      // 仅豁免已钉 SHA 的可选袋声明与纯校验两行，其余 Progress 内容仍全量扫描。
      for (const line of ["  if (has('market') && !isValidMarketProgress(saved.market)) return false;",
        '  market: MarketProgress | undefined = undefined;']) {
        eq(text.split(line).length - 1, 1, `C12 Progress 可选袋授权行精确出现一次：${line.trim()}`);
        text = text.replace(line, '');
      }
    }
    if (/\bMarket\b|MarketClosed|consign|listing|寄售|auction|拍卖/iu.test(text)) consumers.push(name);
  }
  eq(consumers, [], 'C01/C12 除四个既有源码及 GameScene 最小提示接线外，无寄售消费者或拍卖接线');
  ok(!/market|consign|寄售|auction|拍卖/iu.test(await fs.readFile(path.join(root, 'src/ShopPanel.ts'), 'utf8')),
    'C12 ShopPanel 保持 NPC 商店，不接寄售或拍卖');
  const flag = await fs.readFile(path.join(root, 'src/MarketOpenFlag.ts'), 'utf8');
  ok(/export function isMarketOpenForFixture\(\): boolean\s*\{\s*return true;\s*\}/u.test(flag),
    'C12 正式磁盘 MarketOpenFlag 恒返回 true，关态仅 SSR 内存 false');
}

// 本套件历史单据仍挂测试字段；新增可选 Progress.market 袋由开态四图套件另验。
function legacyFixtures() {
  const listed = { listingId: 'fixture-listed', itemInstanceId: 'fixture-owned-instance', state: 'listed',
    heldItemRef: { id: 'wood_sword', instanceId: 'fixture-owned-instance', count: 1 }, pendingRewardRef: null, slotIndex: 0,
    settlementRef: null, claimRef: null, receipts: [], deferredWrites: [] };
  const pending = { ...clone(listed), listingId: 'fixture-pending', state: 'sold_pending_claim', heldItemRef: null,
    pendingRewardRef: { id: 'fixture-reward', amount: 73 }, settlementRef: 'fixture-settlement', receipts: ['fixture-settlement'] };
  return [
    ['empty', { state: 'empty', listings: [], receipts: [], deferredWrites: [] }],
    ['listed', listed], ['sold_pending_claim', pending],
    ['withdrawn', { ...clone(listed), state: 'withdrawn', heldItemRef: null, archived: true, receipts: ['fixture-withdrawn'] }],
    ['claimed', { ...clone(pending), state: 'claimed', pendingRewardRef: null, claimRef: 'fixture-claim', archived: true,
      receipts: ['fixture-settlement', 'fixture-claim'] }],
    ['full-bag-listed', { ...clone(listed), testBagFull: true }],
    ['reward-carrier-refused', { ...clone(pending), testRewardCarrierRefuses: true }],
    ['unknown-state', { ...clone(listed), state: 'fixture_unknown', rawUnknown: { preserve: true } }],
    ['missing-reference', { ...clone(listed), itemInstanceId: null, heldItemRef: null }],
    ['invalid-reward', { ...clone(pending), pendingRewardRef: { id: null, amount: -73, raw: 'damaged' } }],
    ['double-ownership', { ...clone(listed), testAlsoInInventory: 'fixture-owned-instance' }],
  ];
}

async function runGraph(mode, dataRoot, closedFixtureOnly, refreshPayloads = null) {
  let flagLoads = 0;
  const flagId = '\0v06p1-memory-closed-market-flag';
  const server = await createServer({ root, configFile: false, resolve: { alias: { '@xt': dataRoot } },
    server: { middlewareMode: true, hmr: false, ws: false }, appType: 'custom', logLevel: 'error',
    plugins: [{ name: 'v06p1-market-closed-memory-fixture', enforce: 'pre',
      resolveId(id) {
        if (closedFixtureOnly && /(?:^|\/)MarketOpenFlag(?:\.ts)?$/u.test(id)) return flagId;
      },
      load(id) {
        if (id === flagId) { flagLoads++; return 'export function isMarketOpenForFixture() { return false; }'; }
      },
    }],
  });
  const storageDescriptor = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const saved = new Map();
  let storageWrites = 0, fixtures = 0, invocations = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: key => saved.get(key) ?? null,
    setItem: (key, value) => { storageWrites++; saved.set(key, String(value)); },
    removeItem: key => { storageWrites++; saved.delete(key); }, clear: () => { storageWrites++; saved.clear(); },
    key: index => [...saved.keys()][index] ?? null, get length() { return saved.size; },
  } });
  try {
    const flag = await server.ssrLoadModule('/src/MarketOpenFlag.ts');
    eq(flag.isMarketOpenForFixture(), !closedFixtureOnly, `${mode}: 正式旗 true；关态仅 SSR 内存注入 false`);
    eq(flagLoads, closedFixtureOnly ? 1 : 0, `${mode}: 正式图 flagLoads=0，内存关态图 flagLoads=1`);
    if (!closedFixtureOnly) {
      report({ suite: 'v06p1-market-closed-formal-graph', dataMode: mode, graph: 'formal-open',
        flagLoads, formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false, passed: true });
      return;
    }
    const api = await server.ssrLoadModule('/src/MarketClosed.ts');
    const { Progress } = await server.ssrLoadModule('/src/Progress.ts');
    const data = await server.ssrLoadModule('/src/data.ts');
    const features = await server.ssrLoadModule('/src/features.ts');
    const flagsBefore = clone(features.featureFlags());
    eq(data.GAME_PHASE, 5, `${mode}/C12: GAME_PHASE 保持 5`);
    ok(!Object.keys(flagsBefore).some(key => /market|consign/iu.test(key)), `${mode}/C12: 无寄售开态开关`);
    eq(Object.keys(api).sort(), Object.keys(apiTips).sort(), `${mode}: 恰好八个零参数拒绝 API`);

    async function exercise(p, label) {
      for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
        'settleQuestRewards', 'gainExp', 'addItem', 'removeItem', 'grantSkill', 'grantRecipe',
        'addStones', 'removeStones', 'settleMarket', 'claimMarketReward', 'enqueueMarketWrite']) {
        Object.defineProperty(p, method, { configurable: true, value: () => { throw new Error(`${label}: 关态禁止调用 ${method}`); } });
      }
      const beforeState = clone(p), beforeSave = p.exportSave(), beforeInventory = clone(p.inventory), beforeStones = p.stones;
      // 直接播种内存存档作旁证，不调用实际存储 API。
      saved.set('v06p1-existing-slot', JSON.stringify(beforeSave));
      const diskBefore = [...saved], writesBefore = storageWrites;
      const call = name => {
        invocations++;
        eq(api[name].length, 0, `${label}: ${name} 零参数，不接收 Progress 或写入意图`);
        const result = api[name]();
        eq(result, { allowed: false, tipKey: apiTips[name], text: closedStrings[apiTips[name]] }, `${label}: ${name} 只读拒绝及 tipKey 对应`);
        return result;
      };
      for (let repeat = 0; repeat < 3; repeat++) {
        for (const [caseId, names] of Object.entries(caseApis)) {
          for (const name of names) call(name);
          eq(clone(p), beforeState, `${label}/${caseId}: 完整 Progress 与历史单据零增量`);
        }
        // 同单撤回、成交、重复上架及重复领取并发：每个真实 API 分支均必须拒绝。
        const results = await Promise.all(['refuseWithdraw', 'refuseDeal', 'refuseWithdraw', 'refuseDeal', 'refuseList', 'refuseList', 'refuseClaim', 'refuseClaim']
          .map(name => Promise.resolve().then(() => call(name))));
        ok(results.every(result => result.allowed === false), `${label}/C09: 并发分支全部关态拒绝`);
        eq(p.inventory, beforeInventory, `${label}/C02–C11: inventory 不扣物、不返物`);
        eq(p.stones, beforeStones, `${label}/C02–C11: stones 不扣费、不发收益`);
        eq(clone(p), beforeState, `${label}/C02–C11: 完整 clone、扣押、待领、终态及收据无增量`);
        eq(p.exportSave(), beforeSave, `${label}/C02–C11: exportSave 字节语义零增量`);
        eq([...saved], diskBefore, `${label}/C10: 已有存档原文保留`);
        eq(storageWrites, writesBefore, `${label}/C10: localStorage 写入零次`);
      }
      fixtures++;
      return beforeSave;
    }

    const payloads = [];
    if (!refreshPayloads) {
      for (const [state, fixture] of legacyFixtures()) {
        const p = new Progress();
        p.stones = 1234; p.inventory = { hp_pill_small: 3, qi_pill: 2 };
        p.__closedMarketLegacyFixture = clone(fixture);
        payloads.push([state, await exercise(p, `${mode}/${state}`)]);
      }
    } else for (const [state, payload] of refreshPayloads) payloads.push([state, clone(payload)]);

    for (const [state, payload] of payloads) {
      const serialized = JSON.stringify(payload), writesBeforeLoad = storageWrites;
      const restored = Progress.restore(JSON.parse(serialized), false);
      eq(storageWrites, writesBeforeLoad, `${mode}/${state}/C10: 真实无持久化 restore 不写存储`);
      eq([restored.inventory, restored.stones], [payload.inventory, payload.stones], `${mode}/${state}/C10: 真实 restore 既有库存与灵石保留`);
      ok(!Object.hasOwn(restored, '__closedMarketLegacyFixture'), `${mode}/${state}/C10: 正式 schema 未被测试夹具扩展`);
      // 正式 restore 仅恢复已登记字段，历史寄售语义显式重附在测试字段中，不宣称已接存档。
      restored.__closedMarketLegacyFixture = clone(payload.__closedMarketLegacyFixture);
      eq(restored.__closedMarketLegacyFixture, payload.__closedMarketLegacyFixture, `${mode}/${state}/C10–C11: 原始历史夹具完整重附`);
      await exercise(restored, `${mode}/${refreshPayloads ? 'fresh-ssr-refresh' : 'real-restore'}/${state}`);
      const memoryReload = Object.assign(new Progress(), JSON.parse(serialized));
      eq(memoryReload.__closedMarketLegacyFixture, payload.__closedMarketLegacyFixture, `${mode}/${state}/C10–C11: JSON 保存读回保留全部原始夹具`);
      await exercise(memoryReload, `${mode}/json-save-reload/${state}`);
    }
    eq(features.featureFlags(), flagsBefore, `${mode}/C12: 所有开关保持原值`);
    eq(storageWrites, 0, `${mode}: 所有拒绝、并发、真实读档、刷新零存储写入`);
    report({ suite: 'v06p1-market-closed-runtime', dataMode: mode, graph: 'memory-closed', flagLoads,
      formalOpen: true, closedFixtureOnly: true, passed: true, fixtures, invocations,
      freshSsrRefresh: !!refreshPayloads, legacyFixtureOnly: true, optionalMarketBagAdded: true,
      cases: Object.keys(caseApis), zeroArgumentApis: 8, storageWrites, closed: true, softOpened: true, released: false });
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
  report(await checkEnchantCompatibility(root, shared, eq));
  await checkProtection();
  await checkSource();
  for (const [mode, dataRoot] of modes) await checkStatic(mode, dataRoot);
  const sharedStrings = await fs.readFile(path.join(shared, 'balance/strings_zh.json'));
  eq((await fs.readFile(path.join(root, 'data/balance/strings_zh.json'))).equals(sharedStrings), true, 'shared/snapshot: strings960同字节');
  eq(await shaOrNull(path.join(gameData, 'balance/strings_zh.json')), '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9', 'game: 既有strings952指定SHA保持原字节');
  for (const [mode, dataRoot] of modes) {
    await runGraph(mode, dataRoot, false);
    const payloads = await runGraph(mode, dataRoot, true);
    // 新 SSR 图重新加载真实模块和 Progress，模拟刷新后仍拒绝全部历史状态。
    await runGraph(mode, dataRoot, true, payloads);
  }
  passed = true;
} finally {
  for (const [file, sha] of readOnlyBefore) eq(await shaOrNull(file), sha, `只读测试前后 SHA 不变：${file}`);
  await fs.writeFile(path.join(out, 'v06p1-market-closed-evidence.json'), `${JSON.stringify({ passed, assertions,
    stringsSha, marketTableSha, marketEnabled: true, cases: [...Object.keys(caseApis), 'C12'],
    formalOpen: true, closedFixtureOnly: true, softOpened: true, released: false,
    minimalFrontendWiring: true, fullMarketUiAdded: false, noMarketTableConsumedByClosedApi: true, optionalMarketBagAdded: true,
    protectedFiles: Object.fromEntries(readOnlyBefore), evidence }, null, 2)}\n`);
}
console.log(`v06p1 market closed tests ok: ${assertions} assertions; C01–C12 自动化部分通过；shared/wt strings960同字节，game既有952本窗不改；八 API 零参数、零副作用、零存储写入；shops/禁改表/地图不变，Progress仅授权可选market袋，gifts 10×false，GAME_PHASE=5；仅前台入口最小提示、无完整寄售 UI；formalOpen:true、closedFixtureOnly:true、softOpened:true、released:false；正式旗及三根 enabled=true，关态仅 SSR 内存 false、未发版`);
