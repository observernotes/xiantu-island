// 历史回归只扩展精确附灵增量；真实表与生产 SSR 模块始终直接读取磁盘。
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import { stripSalvageClosedAddition, stripSalvageOpenProgress, stripSalvageSceneWiring, checkSalvageCompatibility } from './v06p1-salvage-soft-open-compat-proof.mjs';

const hash = bytes => createHash('sha256').update(bytes).digest('hex');
export const enchantSourceNames = ['EnchantClosed.ts', 'EnchantOpenFlag.ts', 'v06p1-enchant-closed.test.ts',
  'EnchantGate.ts', 'EnchantProgress.ts', 'v06p1-enchant-open.test.ts'];
const previousShas = {
  'materials.json': '79c68429d763054ac1715467d1743575e179ecaecb2529e4b6ed7df137ef4052',
  'items.json': 'f8b587634e5c9d43a475e85724aa34172e2945abda7654c2ef98fda07d1566f3',
  'strings_zh.json': 'd7361af3f4a61e4a6e751e8f4474ec1fbbf2409ddc0fc964e93bd351a75a1e09',
};
const currentShas = {
  'materials.json': '86ae4e29bacee6b3847081caf415001f584bd4d037aa46d72f1accd14e00b98d',
  'items.json': 'dc0ba49591183b2cc7fd8af551c6b91f91e2a596be217bc6e9a608832482de99',
  'strings_zh.json': '9d8babe8c5715e55f050ea9b2ff1239600a72f32d2d753a2b2d7d9ffaf1f5dda',
};
export const preexistingReadOnlyShas = {
  'game:balance/materials.json': currentShas['materials.json'],
  'game:balance/items.json': currentShas['items.json'],
  'game:balance/strings_zh.json': '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9',
  'game:balance/enhance_protect_charm.json': '0e3a73aa1034a4c628b9d19d5c7aa90a9591df072177759d21fcd927326a4772',
  'shared:balance/tools/gen_enchant_beast_core.py': '2f048b7b04903788b847624f3390aa81bb1fe84bff81f60c0f4c88f6f55d6220',
};
const strictEq = (actual, expected, message) => assert.deepEqual(actual, expected, message);
function replaceOnce(source, before, after, eq, label) {
  eq(source.split(before).length - 1, 1, `${label}：授权完整字节精确一次`);
  return source.replace(before, after);
}

export function stripEnchantClosedAddition(raw, eq = strictEq) {
  raw = stripSalvageClosedAddition(raw, eq);
  if (hash(raw) === previousShas['strings_zh.json']) return raw;
  eq(hash(raw), '6f2443f87db77dcaf88f565f87c38849c5dde482dc77592102acb64695258dd9', '当前真实 strings952 固定权威 SHA');
  eq(Object.keys(JSON.parse(raw)).length, 952, '当前真实 strings 恰为 952 键');
  const blocks = raw.match(/,\n(?: {2}"enchant\.closed\.[^\n]+\n?){8}/gu);
  eq(blocks?.length, 1, '只剥八条完整 enchant.closed 键');
  const previous = raw.replace(blocks[0], '\n');
  eq(hash(previous), previousShas['strings_zh.json'], '仅剥八附灵键恢复旧 strings944 完整字节');
  return previous;
}

export function stripEnchantOpenProgress(source, eq = strictEq) {
  source = stripSalvageOpenProgress(source, eq);
  for (const line of ["import { isValidEnchantProgress, type EnchantProgress } from './EnchantProgress';",
    "  if (has('enchant') && !isValidEnchantProgress(saved.enchant)) return false;",
    '  /** 仅 SSR 开态夹具完整提交产生；缺字段旧档保持 undefined，读档不补做。 */',
    '  enchant: EnchantProgress | undefined = undefined;'])
    source = replaceOnce(source, `${line}\n`, '', eq, 'Enchant 可选袋');
  eq(hash(source), '9c6556462768199f2b0c6a2ee3deb420c0a117b9a49945ec5723a90f88b8d0df',
    '剥四条附灵可选袋行恢复 2ad6367 Progress 完整字节');
  return source;
}

export function stripEnchantSceneWiring(source, eq = strictEq) {
  source = stripSalvageSceneWiring(source, eq);
  for (const line of ["import { featureClosed as enchantFeatureClosed } from '../EnchantClosed';",
    "import { isEnchantOpenForFixture } from '../EnchantOpenFlag';",
    "import { EnchantGate } from '../EnchantGate';"])
    source = replaceOnce(source, `${line}\n`, '', eq, 'GameScene 附灵 import');
  const block = [
    "    if (!isEnchantOpenForFixture()) this.log(enchantFeatureClosed().text, '#aaaaaa');",
    '    else {',
    '      const result = new EnchantGate(this.prog).entrance();',
    "      this.log(result.allowed ? '装备附灵已开放。' : result.text, '#aaaaaa');",
    '    }', '',
  ].join('\n');
  const entry = source.match(/  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}/u)?.[0];
  eq(Boolean(entry?.includes(`${block}    return true;`)), true, '同次 smith_ou 命中附灵提示后才 return true');
  eq(Boolean(/new ForgeGate\(this\.prog\)\.entrance\(\)[\s\S]*new EnhanceGate\(this\.prog\)\.entrance\(\)[\s\S]*new EnchantGate\(this\.prog\)\.entrance\(\)/u.test(entry)),
    true, '同次 smith_ou 顺序 forge→enhance→enchant，先处理不得饿死附灵');
  eq((entry?.match(/return true;/gu) ?? []).length, 1, '三 tip 仅在末尾消费一次命中');
  return replaceOnce(source, block, '', eq, 'GameScene 附灵完整只读提示块');
}

export function stripEnchantForgeSmokeCompatibility(source, eq = strictEq) {
  const line = "      eq(logs[logs.length - 1], { text: '装备附灵已开放。', color: '#aaaaaa' }, '同次命中在打造强化提示后显示附灵正式开态提示');\n";
  eq(source.split(line).length - 1, 2, 'Forge 冒烟只追加两条附灵正式提示断言');
  source = source.split(line).join('');
  eq(source.split('logs[logs.length - 3]').length - 1, 2, 'Forge 原文及颜色断言仅前移一位');
  eq(source.split('logs[logs.length - 2]').length - 1, 2, 'Enhance 原文及颜色断言仅前移一位');
  return source.replaceAll('logs[logs.length - 2]', 'logs[logs.length - 1]')
    .replaceAll('logs[logs.length - 3]', 'logs[logs.length - 2]');
}

export async function checkEnchantCompatibility(root, shared, eq = strictEq) {
  const salvageCompatibility = await checkSalvageCompatibility(root, shared, eq);
  const tableChecks = [];
  for (const [mode, base] of [['shared', shared], ['snapshot', path.join(root, 'data')]]) {
    for (const [name, expected] of Object.entries(currentShas)) {
      const raw = await fs.readFile(path.join(base, 'balance', name), 'utf8');
      eq(hash(raw), expected, `${mode} 真实磁盘 ${name} 附灵既有 SHA`);
      const previous = name === 'materials.json' ? replaceOnce(raw,
        '  "note": "炼气后期以上精英怪 3%，首领必掉",\n  "phase": 5',
        '  "note": "炼气后期以上精英怪 3%，首领必掉"', eq, `${mode} beast_core phase`)
        : name === 'items.json' ? replaceOnce(raw,
          ' },\n {\n  "id": "beast_core",\n  "name": "妖兽内丹",\n  "phase": 5,\n  "icon": "icon_beast_core"\n }\n]',
          ' }\n]', eq, `${mode} beast_core item`)
          : stripEnchantClosedAddition(raw, eq);
      eq(hash(previous), previousShas[name], `${mode} 仅还原附灵既有增量后旧表 SHA 完整保持`);
      tableChecks.push({ mode, name, currentSha: expected, historicalSha: previousShas[name], matched: true });
    }
  }
  for (const [key, expected] of Object.entries(preexistingReadOnlyShas)) {
    const [mode, name] = key.split(':');
    eq(hash(await fs.readFile(path.join(mode === 'game' ? path.join(shared, 'game/data') : shared, name))), expected,
      `${key} 开窗前只读历史快照固定 SHA`);
  }
  const flag = await fs.readFile(path.join(root, 'src/EnchantOpenFlag.ts'), 'utf8');
  eq(flag, '/** 正式路径恒 true；仅 Vite SSR 关态图可注入 false。 */\nexport function isEnchantOpenForFixture(): boolean { return true; }\n',
    '附灵正式 Flag 精确恒 true，独立于打造强化且无配表或环境开关');
  eq(hash(await fs.readFile(path.join(root, 'src/EnchantClosed.ts'))),
    '15870998e95f8f41ab4fb3e6c30dc17a82019502276084f4610800be5927e730', '附灵关态 API 原字节保留');
  stripEnchantSceneWiring(await fs.readFile(path.join(root, 'src/scenes/GameScene.ts'), 'utf8'), eq);
  return { suite: 'enchant-soft-open-compatibility-proof', passed: true, realDiskRead: true,
    productModuleTransformations: [], tableChecks, salvageCompatibility, sameHitForgeThenEnhanceThenEnchant: true,
    EnchantOpenFlag: true, softOpenedEnchant: true, released: false };
}
