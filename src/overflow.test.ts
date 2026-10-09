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

console.log('overflow tests ok');
