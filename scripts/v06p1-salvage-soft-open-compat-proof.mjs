// 仅精确证明已授权分解增量；历史断言保留，生产 SSR 模块始终直接读取磁盘。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
const strictEq = (actual, expected, message) => assert.deepEqual(actual, expected, message);
const historical944 = 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09';
const historical952 = '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9';
const current960 = '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda';
export const salvageSourceNames = ['SalvageClosed.ts', 'SalvageOpenFlag.ts', 'v06p1-salvage-closed.test.ts',
  'SalvageGate.ts', 'SalvageProgress.ts', 'v06p1-salvage-open.test.ts'];
export const salvageProgressBase = 'a9ab2aa6e73dca631b6ed28f672d490b61525610c609df478e2c112a66358d3c';
export const salvageProgressAuthorizedAdditions = [
  "import { isValidSalvageProgress, type SalvageProgress } from './SalvageProgress';\n",
  "  if (has('salvage') && !isValidSalvageProgress(saved.salvage)) return false;\n",
  '  /** 仅 SSR 开态夹具完整提交产生；缺字段旧档保持 undefined，读档不补做。 */\n'
    + '  salvage: SalvageProgress | undefined = undefined;\n',
];
function replaceOnce(source, before, after, eq, label) {
  eq(source.split(before).length - 1, 1, `${label}：授权完整字节精确一次`);
  return source.replace(before, after);
}

export function stripSalvageClosedAddition(raw, eq = strictEq) {
  if ([historical944, historical952].includes(hash(raw))) return raw;
  eq(hash(raw), current960, '当前真实 strings960 固定权威 SHA');
  eq(Object.keys(JSON.parse(raw)).length, 960, '当前真实 strings 恰为 960 键');
  const blocks = raw.match(/,\n(?: {2}"salvage\.closed\.[^\n]+\n?){8}/gu);
  eq(blocks?.length, 1, '只剥八条完整 salvage.closed 键');
  const previous = raw.replace(blocks[0], '\n');
  eq(hash(previous), historical952, '仅剥八分解键恢复旧 strings952 完整字节');
  return previous;
}

export function stripSalvageOpenProgress(source, eq = strictEq) {
  for (const addition of salvageProgressAuthorizedAdditions)
    source = replaceOnce(source, addition, '', eq, 'Salvage 可选袋最小授权行');
  eq(hash(source), salvageProgressBase, '仅剥分解四行恢复 5d9fa29 Progress 完整字节；既有业务保持');
  return source;
}

export function stripSalvageSceneWiring(source, eq = strictEq) {
  for (const line of ["import { featureClosed as salvageFeatureClosed } from '../SalvageClosed';",
    "import { isSalvageOpenForFixture } from '../SalvageOpenFlag';",
    "import { SalvageGate } from '../SalvageGate';"])
    source = replaceOnce(source, `${line}\n`, '', eq, 'GameScene 分解 import');
  const block = [
    "    if (!isSalvageOpenForFixture()) this.log(salvageFeatureClosed().text, '#aaaaaa');",
    '    else {',
    '      const result = new SalvageGate(this.prog).entrance();',
    "      this.log(result.allowed ? '装备分解已开放。' : result.text, '#aaaaaa');",
    '    }', '',
  ].join('\n');
  const entrance = source.match(/  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}/u)?.[0];
  eq(Boolean(entrance?.includes(`${block}    return true;`)), true, '同次 smith_ou 命中分解提示后才 return true');
  eq(Boolean(/new ForgeGate\(this\.prog\)\.entrance\(\)[\s\S]*new EnhanceGate\(this\.prog\)\.entrance\(\)[\s\S]*new EnchantGate\(this\.prog\)\.entrance\(\)[\s\S]*new SalvageGate\(this\.prog\)\.entrance\(\)/u.test(entrance)),
    true, '同次 smith_ou 顺序 forge→enhance→enchant→salvage，前序不得饿死分解');
  eq((entrance?.match(/return true;/gu) ?? []).length, 1, '四 tip 仅在末尾消费一次命中');
  source = replaceOnce(source, block, '', eq, 'GameScene 分解完整只读提示块');
  eq(hash(source), 'f5d7defb24dda3ef1956e331479e9ee96794f1f45515bbb7951f3c3e19a0726c',
    '仅剥分解三 import 与提示块恢复 15b66e3 GameScene 完整字节');
  return source;
}

export async function checkSalvageCompatibility(root, shared, eq = strictEq) {
  const flag = await fs.readFile(path.join(root, 'src/SalvageOpenFlag.ts'), 'utf8');
  eq(flag, '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isSalvageOpenForFixture(): boolean { return true; }\n',
    '分解正式 Flag 精确恒 true，独立且无配表或环境开关');
  eq(hash(await fs.readFile(path.join(root, 'src/SalvageClosed.ts'))),
    '287a55d7025018629235d45ca4386d75134fc39362532a4c47bf121b574ae211', '分解八关态 API 原字节保持');
  const scene = await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8');
  stripSalvageSceneWiring(scene, eq);
  eq(/fixtureInstances/u.test(scene), false, '生产 GameScene 无 fixtureInstances 默认注入');
  for (const [mode, dataRoot] of [['shared', shared], ['snapshot', path.join(root, 'data')]])
    eq(hash(await fs.readFile(path.join(dataRoot, 'balance/strings_zh.json'))), current960, `${mode} 分解字符串冻结 SHA`);
  return { suite: 'salvage-soft-open-compatibility-proof', passed: true, realDiskRead: true,
    productModuleTransformations: [], sameHitForgeThenEnhanceThenEnchantThenSalvage: true,
    SalvageOpenFlag: true, softOpenedSalvage: true, released: false };
}

export function stripSalvageForgeSmokeCompatibility(source, eq = strictEq) {
  const line = "      eq(logs[logs.length - 1], { text: '装备分解已开放。', color: '#aaaaaa' }, '同次命中在打造强化附灵提示后显示分解正式开态提示');\n";
  eq(source.split(line).length - 1, 2, 'Forge 冒烟只追加两条分解正式提示断言');
  source = source.split(line).join('');
  for (const index of [4, 3, 2])
    eq(source.split(`logs[logs.length - ${index}]`).length - 1, 2, 'Forge/Enhance/Enchant 原文颜色断言各精确前移一位');
  source = source.replaceAll('logs[logs.length - 2]', 'logs[logs.length - 1]')
    .replaceAll('logs[logs.length - 3]', 'logs[logs.length - 2]')
    .replaceAll('logs[logs.length - 4]', 'logs[logs.length - 3]');
  eq(hash(source), '7f0f1e2fb6237b0d4028458e11202011b11eeeb49e9bf31bee6205557d595581',
    '仅恢复分解提示断言与日志位置后 Forge 冒烟全部旧字节保持');
  return source;
}
