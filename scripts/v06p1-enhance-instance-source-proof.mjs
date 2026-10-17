// 只撤回本窗明确授权的 Progress 来源接线，调用方继续校验原有完整 SHA。
// 不锁新增方法的实现 SHA；确认只增加三个来源方法，并保留关键来源约束的静态断言。
import ts from 'typescript';

export function stripFormalEnhanceInstanceSource(source, eq) {
  const replaceOnce = (from, to, label) => {
    eq(source.split(from).length - 1, 1, `正式实例源授权块精确一次：${label}`);
    source = source.replace(from, to);
  };
  replaceOnce('syncTalismanMapAvailability, inPhase } from \'./data\';',
    'syncTalismanMapAvailability } from \'./data\';', '仅追加 inPhase import');
  replaceOnce("import { isValidForgeProgress, type ForgeCraftResult, type ForgeProgress } from './ForgeProgress';",
    "import { isValidForgeProgress, type ForgeProgress } from './ForgeProgress';", '仅追加 ForgeCraftResult 类型');
  replaceOnce("import { isEnhanceId, isEnhanceInstanceRef, isValidEnhanceProgress, type EnhanceFixtureInstance,\n  type EnhanceProgress, type FormalEnhanceSource } from './EnhanceProgress';",
    "import { isValidEnhanceProgress, type EnhanceProgress } from './EnhanceProgress';", '强化来源校验及类型 imports');
  replaceOnce('  /** 保留完整打造事实；缺袋旧档不补建，读回不结算。 */',
    '  /** 仅保留完整夹具事实；缺袋旧档不补建，读回不结算。 */', '打造袋注释');
  replaceOnce('  /** 等级和完整结算；正式授权另查本档打造来源，缺袋旧档不补建。 */',
    '  /** 仅承载明确授权的强化夹具事实；缺袋旧档不补建，读回不结算。 */', '强化袋注释');
  replaceOnce('        // 首次成功提交即绑定本实例；切换全局 activeSlot 不能把既有实例写到另一档。\n        this.#slot ??= slot;\n',
    '', '仅在保存成功后绑定当前档位');
  const blocks = [...source.matchAll(/^  \/\*\*\n   \* 仅在正式 ForgeGate[\s\S]*?(?=^  bindTalismanSlot\()/gmu)];
  eq(blocks.length, 1, '来源方法块只出现在 addCraftedItem 与 bindTalismanSlot 之间一次');
  const block = blocks[0][0];
  const parsed = ts.createSourceFile('FormalInstanceProof.ts', `class Proof {\n${block}}`, ts.ScriptTarget.Latest, true);
  const declaration = parsed.statements[0];
  eq(parsed.parseDiagnostics.length, 0, '新增来源方法块可独立解析');
  eq(declaration.members.map(member => ts.isMethodDeclaration(member) ? member.name.getText(parsed) : null),
    ['registerFormalEnhanceInstance', 'formalEnhanceInstanceStatus', 'formalEnhanceInstances'],
    '只新增三个获准实例来源方法，没有其它字段或方法');
  for (const guard of [
    'JSON.stringify(committed) !== JSON.stringify(result)',
    '!forge.receipts.includes(committed.craftResultRef)',
    'committed.resultItem.count !== 1',
    'const type = item.slot === \'weapon\' ? \'weapon\' : \'armor\';',
    'ownerSlot: this.#slot ?? Progress.#activeSlot',
    'source.ownerSlot !== (this.#slot ?? Progress.#activeSlot)',
    'source.forgeLedgerId !== forge.ledgerId',
    'source.instanceRef === `${craft.craftResultRef}:item`',
    "this.formalEnhanceInstanceStatus(row.instanceRef) === 'registered'",
  ]) eq(block.includes(guard), true, `正式来源关键约束存在：${guard}`);
  return source.replace(block, '');
}
