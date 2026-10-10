import { EXP_TO_NEXT, BREAKTHROUGH, REALMS, inPhase, GAME_PHASE } from './data';
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

// 筑基奖励：realms.json qi_refining.reward.hpMul / mpMul，只乘一次，存档读档后仍在，旧档补发
{
  const mem: Record<string, string> = {};
  (globalThis as any).localStorage = { getItem: (k: string) => mem[k] ?? null, setItem: (k: string, v: string) => { mem[k] = String(v); }, removeItem: (k: string) => { delete mem[k]; } };
  const qi = (REALMS as any[]).find(r => r.id === 'qi_refining');
  const hpMul = Number(qi.reward.hpMul), mpMul = Number(qi.reward.mpMul);
  eq(hpMul, 1.3, 'qi_refining.reward.hpMul 读表');
  const near = (a: number, b: number, msg: string) => { if (Math.abs(a - b) > 1) throw new Error(`${msg}: 得到 ${a}，期望约 ${b}`); };
  // 不带奖励的 30 级基准
  const base = new Progress(); base.level = 30; base.realmRewards = ['mortal'];
  const baseHp = base.maxHp, baseMp = base.maxMp;
  const b = new Progress(); b.level = 29; b.exp = b.expNeed;
  b.realmRewards = ['mortal'];
  eq(b.breakthrough(), true, '29 级突破');
  eq(b.level, 30, '升到 30');
  near(b.maxHp, baseHp * hpMul, '最大气血 ×1.3');
  near(b.maxMp, baseMp * mpMul, '最大灵力 ×1.3');
  eq(b.hp, b.maxHp, '突破后气血回满');
  eq(b.mp, b.maxMp, '突破后灵力回满');
  const hp1 = b.maxHp, mp1 = b.maxMp;
  b.realmRewards.push('qi_refining');          // 重复记录也只算一次
  eq(b.maxHp, hp1, '重复记录不叠加（气血）');
  eq(b.maxMp, mp1, '重复记录不叠加（灵力）');
  b.save();
  const l1 = Progress.load(); const l2 = (l1.save(), Progress.load());
  eq(l1.maxHp, hp1, '读档后气血倍率仍在');
  eq(l2.maxHp, hp1, '再存再读也不重复叠加');
  eq(l2.maxMp, mp1, '再存再读灵力不叠加');
  // 旧存档：已经 30 级、没有 realmRewards 字段
  const old = JSON.parse(mem['xiantu_save_v1']); delete old.realmRewards; old.hp = 1; mem['xiantu_save_v1'] = JSON.stringify(old);
  const o = Progress.load();
  eq(o.maxHp, hp1, '旧存档读档补上筑基倍率');
  eq(o.realmRewards.includes('qi_refining'), true, '旧存档记下已补');
  eq(Progress.load().maxHp, hp1, '旧存档补发后再读不叠加');
  // 还没筑基的 29 级旧档不能被补
  const y = new Progress(); y.level = 29; y.save();
  const yl = Progress.load(); eq(yl.realmRewards.includes('qi_refining'), false, '29 级不补筑基奖励');
}

// v0.5 存档契约：旧档补全、教学首次即保存、跨读档去重，新档独立。
{
  const mem: Record<string, string> = {};
  const saveKey = 'xiantu_save_v1';
  (globalThis as any).localStorage = {
    getItem: (k: string) => mem[k] ?? null,
    setItem: (k: string, v: string) => { mem[k] = String(v); },
    removeItem: (k: string) => { delete mem[k]; },
  };
  const legacy = new Progress(); legacy.name = '旧档修士'; legacy.addItem('hp_pill_small', 3); legacy.save();
  const old = JSON.parse(mem[saveKey]); delete old.tutorialsSeen; delete old.sectContribution;
  mem[saveKey] = JSON.stringify(old);
  const restored = Progress.load();
  eq(restored.name, '旧档修士', '迁移保留原角色');
  eq(restored.count('hp_pill_small'), 3, '迁移保留背包');
  eq(JSON.stringify(restored.tutorialsSeen), '[]', '旧档补空教学记录');
  eq(restored.sectContribution, 0, '旧档贡献默认 0');
  eq(restored.markTutorialSeen('skill_points'), true, '首次进入教学区');
  eq(JSON.stringify(JSON.parse(mem[saveKey]).tutorialsSeen), '["skill_points"]', '首入立即写存档');
  const reloaded = Progress.load();
  eq(reloaded.markTutorialSeen('skill_points'), false, '读档后同一教学不重复');
  eq(reloaded.markTutorialSeen('other_tip'), true, '同档其他教学仍可首次触发');
  eq(JSON.stringify(Progress.load().tutorialsSeen), '["skill_points","other_tip"]', '多条教学记录都持久化');
  Progress.reset();
  const newSave = Progress.load();
  eq(newSave.markTutorialSeen('skill_points'), true, '重开新档可再次首次触发');
  eq(Progress.load().markTutorialSeen('skill_points'), false, '新档首次记录也持久化');

  // 从 JSON 读入损坏或非整数余额，保存后的余额必须仍能稳定读回。
  for (const [raw, expected] of [['-12', 0], ['"无效"', 0], ['1e999', 0], ['null', 0], ['37.9', 37]] as const) {
    mem[saveKey] = `{"sectContribution":${raw}}`;
    const loaded = Progress.load();
    eq(loaded.sectContribution, expected, `读档贡献 ${raw} 标准化`);
    loaded.save();
    eq(JSON.parse(mem[saveKey]).sectContribution, expected, `保存贡献 ${raw} 为有效余额`);
    eq(Progress.load().sectContribution, expected, `再次读档贡献 ${raw} 保持一致`);
  }
}

// phase 过滤
eq(inPhase({}), true, '没填 phase 不限制');
eq(inPhase({ phaseMin: 5 }), true, 'phaseMin 5 在阶段 5 创建');
eq(inPhase({ phaseMin: 6 }), false, 'phaseMin 6 > 5 不创建');
eq(inPhase({ phaseMax: 4 }), false, 'phaseMax 4 < 5 不创建');
eq(inPhase({ phaseMin: 2, phaseMax: 5 }), true, '2~5 包含 5');
eq(inPhase({ phaseMin: 5 }, 4), false, '旧阶段 4 不创建 phaseMin 5');
eq(inPhase({ phaseMax: 3 }, 4), false, '旧阶段 4 不创建 phaseMax 3');
eq(inPhase({ phaseMin: 2, phaseMax: 4 }, 4), true, '旧阶段 4 包含在 2~4 内');
eq(GAME_PHASE, 5, 'GAME_PHASE');
// 境界不稳只影响 debuffStats
{
  const u = new Progress(); u.level = 29;
  const atk0 = u.atk, hp0 = u.maxHp;
  u.unstableUntil = Date.now() + 60000; u.unstableRatio = -0.1; u.unstableStats = ['atk', 'def'];
  if (Math.abs(u.atk - atk0 * 0.9) > 1e-6) throw new Error(`境界不稳攻击 ×0.9: ${u.atk} vs ${atk0}`);
  eq(u.maxHp, hp0, '境界不稳不影响气血（debuffStats 没列）');
}

console.log('overflow tests ok');
