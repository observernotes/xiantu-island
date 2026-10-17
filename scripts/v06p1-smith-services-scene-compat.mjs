// 只更新旧 Gate 回归的入口假设；Gate 结算断言与历史数据冻结仍逐项执行。
import assert from 'node:assert/strict';
const strictEq = (actual, expected, message) => assert.deepEqual(actual, expected, message);
export const smithServicesSourceNames = ['SmithServicesPanel.ts', 'SmithServicesController.ts', 'SmithServicesUiAccess.ts'];
export function hasSmithServicesScene(source) { return source.includes("import { SmithServicesPanel } from '../SmithServicesPanel';"); }
export function assertSmithServicesScene(source, eq = strictEq) {
  const entry = source.match(/  private tryInteractForgeEntrance\(\): boolean \{[\s\S]*?\n  \}/u)?.[0];
  eq(Boolean(entry), true, '欧冶匠正式交互方法存在');
  for (const required of ["o.name === 'smith_ou'", 'this.senseMap?.objectVisible(o) !== false',
    'Math.abs(o.x - this.player.x) <= 28 && Math.abs(o.y - this.player.y) <= 40',
    "isSmithServicesUiAccessible('entrance')", "t('ui.smith.closed')", "t('ui.smith.title')",
    'this.dialog.choose(', 'this.smithServices?.show();', 'Progress.getActiveSlot() !== slot'])
    eq(entry.includes(required), true, '正式入口保留交互/关态/切档防护: ' + required);
  eq(/return true;/u.test(entry), true, '命中欧冶匠仍消费交互');
  eq(/\.(?:submit|craft|enhance|enchant|salvage|save|persistSoon)\(|later_service|已开放/u.test(entry), false,
    '入口只路由对话和菜单，无直接结算或四连冒烟');
  return entry;
}
export function stripSmithServicesScene(source, eq = strictEq) {
  return source.replace(assertSmithServicesScene(source, eq), '');
}
