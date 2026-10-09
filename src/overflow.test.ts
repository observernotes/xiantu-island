import { EXP_TO_NEXT, BREAKTHROUGH } from './data';
import { Progress } from './Progress';

function eq(actual: unknown, expected: unknown, msg: string) {
  if (actual !== expected) throw new Error(`${msg}: 得到 ${String(actual)}，期望 ${String(expected)}`);
}

const poolRatio = BREAKTHROUGH.overflowPoolRatio;
const stuck = EXP_TO_NEXT['9'];
const after = EXP_TO_NEXT['10'];

const p = new Progress();
p.level = 9;
p.exp = stuck;

eq(stuck, 382, '9→10 的修为');
eq(after, 312, '10→11 的修为');
eq(p.overflowCap, Math.round(stuck * poolRatio), '卡在 9 级时上限取 9→10 × overflowPoolRatio');
eq(p.overflowCap === Math.round(after * poolRatio), false, '不能用 10→11 那一项');

p.overflowExp = p.overflowCap;
eq(p.overflowTier, 'full', '池满是满态葫芦');
const bar = p.exp;
const covered = p.applyBreakthroughFail(0.1);
eq(covered.fromBar, 0, '池子够时不扣修为条');
eq(covered.fromPool, Math.round(bar * 0.1), '扣减量是修为条 × ratio，从池子出');
eq(p.exp, bar, '修为条保持原样');
eq(p.overflowTier, 'half', '满态扣过之后切回半满');

p.overflowExp = 10;
p.exp = bar;
const short = p.applyBreakthroughFail(0.1);
eq(short.fromPool, 10, '池子先扣光');
eq(short.fromBar, Math.round(bar * 0.1) - 10, '不够的部分扣修为条');
eq(p.overflowExp, 0, '溢出池归零');
eq(p.exp, bar - short.fromBar, '修为条扣掉差额');
eq(p.overflowTier, 'empty', '池子扣空后葫芦切回空态');

// G12：多出的修为全额存入，到上限截断
const g = new Progress();
g.level = 9; g.exp = stuck - 10; g.overflowExp = 0;
// 悟性带 expBonus，找一个实际到账正好 100 的基础修为，让结余正好是 90
const bonus = (g as unknown as { statBonus(a: string): number }).statBonus('expBonus');
let base = 1; while (Math.max(1, Math.round(base * (1 + bonus))) < 100) base++;
eq(Math.round(base * (1 + bonus)), 100, '测试前提：实际到账 100');
const r1 = g.gainExp(base, 9);
eq(g.overflowExp, 90, '卡 9 级多出 90 就存 90（不乘 overflowPoolRatio）');
eq(r1.overflowed, 90, '飘字数字 = 实际存入');
eq(g.overflowCap, 191, '9 级卡住上限 382×0.5=191');
const r2 = g.gainExp(500, 9);
eq(g.overflowExp, 191, '超过上限时截断到 191');
eq(r2.overflowed, 101, '截断时飘字只报实际存入的 101');
eq(r2.overflowFilled, true, '第一次存满');

console.log('overflow tests ok');
