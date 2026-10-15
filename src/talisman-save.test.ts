import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { QUESTS, RECIPES, ITEMS, GROWTH, t } from './data';
import { featureFlags, setFeatureFlag } from './features';
import { setGameTimeSource } from './GameClock';

let assertions = 0;
const eq = (actual: unknown, expected: unknown, message: string) => {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} / ${JSON.stringify(expected)}`);
};
const ok = (value: unknown, message: string) => eq(!!value, true, message);
const flags = featureFlags(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const disk: Record<string, string> = {}, key = 'xiantu_save_v1';
let fail = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (id: string) => disk[id] ?? null,
  setItem: (id: string, value: string) => { if (fail) throw new Error('模拟写盘失败'); disk[id] = value; },
  removeItem: (id: string) => { delete disk[id]; },
} });
const now = 1_800_000_000_000;
setGameTimeSource(() => now);
try {
  setFeatureFlag('talismanCraft', false);
  const p = new Progress();
  const off = p.exportSave();
  for (const field of ['talisman', 'talismanUse', 'visitedMaps', 'talismanQuickSlots']) eq(Object.prototype.hasOwnProperty.call(off, field), false, `关口关闭新档不添加 ${field}`);
  eq(new QuestSystem(p).npcQuestIds('lingfu_envoy').includes('q_talisman_intro'), false, '关闭隐藏入门任务');
  eq(new QuestSystem(p).accept('q_talisman_intro'), false, '关闭不能学习');
  disk[key] = JSON.stringify({ level: 15, inventory: { talisman_fire: 3, snake_gall: 7, spirit_herb: 5 }, learnedRecipes: [], ageUpdatedAt: now });
  const oldOff = Progress.load();
  eq(oldOff.inventory, { talisman_fire: 3, snake_gall: 7, spirit_herb: 5 }, '关闭保留旧物品计数');
  eq(oldOff.pillQualities, {}, '关闭不迁移符品质');
  setFeatureFlag('talismanCraft', true);
  const old = Progress.load();
  eq(old.countQuality('talisman_fire', 'low'), 3, '旧品质物品归下品');
  eq(old.pillQualities.talisman_fire, { low: 3, mid: 0, high: 0, supreme: 0 }, '品质迁移落账');
  eq(old.count('snake_gall'), 7, '普通物品不迁移');
  eq(old.talisman.attempt, null, '旧档尝试为空');
  eq(old.talismanUse.cooldowns, {}, '旧档冷却为空');
  ok(old.addCraftedItem('talisman_fire', 2, 'high'), '按品质入包');
  eq(old.qualityCounts('talisman_fire'), { low: 3, mid: 0, high: 2, supreme: 0 }, '不同品质分堆');
  eq(old.removeQuality('talisman_fire', 1, 'supreme'), false, '指定品质不足不偷用其它堆');
  ok(old.removeQuality('talisman_fire', 1, 'high'), '指定品质消耗');
  eq(old.count('talisman_fire'), 4, '汇总数量一致');
  ok(old.bindTalismanSlot(0, 'talisman_fire', 'high'), '快捷栏明确绑定品质');
  old.save();
  const once = Progress.load(); once.save();
  const twice = Progress.load();
  eq(twice.qualityCounts('talisman_fire'), once.qualityCounts('talisman_fire'), '重复加载品质幂等');
  eq(twice.talismanQuickSlots[0], { item: 'talisman_fire', quality: 'high' }, '快捷栏重载不替换品质');
  eq(twice.inventory, once.inventory, '重复加载普通物品幂等');

  const intro = QUESTS.q_talisman_intro;
  ok(intro && intro.reqLevel === 15 && intro.reqRealm === 'qi_refining', '任务门槛读表');
  const student = new Progress(), qs = new QuestSystem(student);
  student.level = 14; eq(qs.available(intro.id), false, '十四级不可学');
  student.level = 15; ok(qs.available(intro.id), '炼气十五级无宗门可学');
  qs.onTalk('lingfu_envoy');
  ok(qs.accept(intro.id), '接取入门');
  eq(qs.complete(intro.id), false, '接取前对话不算教学');
  qs.onTalk('lingfu_envoy');
  ok(qs.complete(intro.id), '接取后教学可交付');
  ok(qs.turnIn(intro.id), '交付授方');
  eq(student.learnedRecipes, intro.rewards.recipes, '五个配方全部授予');
  for (const id of student.learnedRecipes) ok(RECIPES[id], '授予真实配方');
  const exp = student.exp;
  eq(qs.turnIn(intro.id), undefined, '任务奖励只发一次');
  eq(student.exp, exp, '重复交付不重复修为');
  eq(student.grantQuestRecipes(intro), [], '授方去重');
  student.save();
  eq(Progress.load().learnedRecipes, intro.rewards.recipes, '已学状态重载');
  ok(t('talisman.intro_done').includes('研墨'), '缺文案读设计兜底');

  // 保存失败既不丢已有品质，也不提交一半配方奖励。
  const retry = new Progress(); retry.level = 15;
  const retryQ = new QuestSystem(retry); retryQ.accept(intro.id); retryQ.onTalk('lingfu_envoy');
  fail = true;
  eq(retryQ.turnIn(intro.id), undefined, '奖励存档失败');
  eq(retry.learnedRecipes, [], '奖励存档失败回滚配方');
  eq(retry.quests[intro.id].state, 'active', '奖励存档失败回滚任务');
  fail = false; ok(retryQ.turnIn(intro.id), '重试交付成功');

  // 用表内实际强度检验聚灵只加击杀，且和悟性相加后只取整一次。
  const gather = ITEMS.talisman_gather.effect, guard = ITEMS.talisman_guard.effect;
  const boosted = new Progress(); boosted.level = 15; boosted.allocatedStats.insight = 5;
  boosted.talismanUse.buffs = [
    { buffId: gather.buffId, itemId: 'talisman_gather', quality: 'high', expireAt: now + gather.durationMs, expBonusRatio: gather.byQuality.high.expBonusRatio },
    { buffId: guard.buffId, itemId: 'talisman_guard', quality: 'high', expireAt: now + guard.durationMs, damageReductionRatio: guard.byQuality.high.damageReductionRatio, reductionCap: guard.reductionCap },
  ];
  const insightBonus = Object.entries(GROWTH.statEffects as Record<string, Record<string, number>>)
    .reduce((sum, [stat, effects]) => sum + boosted.stat(stat) * (effects.expBonus ?? 0), 0);
  eq(boosted.gainExp(100, 15, 'kill').gained, Math.round(100 * (1 + insightBonus + gather.byQuality.high.expBonusRatio)), '聚灵与悟性相加一次');
  eq(boosted.gainExp(100, 15, 'quest').gained, Math.round(100 * (1 + insightBonus)), '任务修为不加聚灵');
  eq(boosted.gainCultivation(100).gained, 100, '闭关修为不加聚灵');
  const random = Math.random;
  try {
    Math.random = () => 0.5;
    const fireDamage = ITEMS.talisman_fire.effect.byQuality.high.baseDamage;
    eq(boosted.fixedDamageTo(fireDamage, boosted.level, 8), Math.max(1, Math.round(fireDamage - 8)), '火符绝对伤害不乘角色攻击');
    const raw = Math.max(1, 100.37 - boosted.def);
    eq(boosted.damageFrom(100.37), Math.max(1, Math.round(raw * (1 - guard.byQuality.high.damageReductionRatio))), '护身防御后减伤最终取整');
    eq(boosted.damageFrom(100.37, 1, [0.4, 0.4]), Math.max(1, Math.round(raw * (1 - guard.reductionCap))), '其它百分比相乘且总减伤封顶');
  } finally { Math.random = random; }
  boosted.save();
  const restored = Progress.load();
  eq(restored.talismanUse.buffs, boosted.talismanUse.buffs, '增益实际强度与现实到期时刻存档');
  eq(Progress.load().talismanUse.buffs, restored.talismanUse.buffs, '增益重复加载不叠层');
  setFeatureFlag('talismanCraft', false);
  eq(boosted.gainExp(100, 15, 'kill').gained, Math.round(100 * (1 + insightBonus)), '关闭不应用聚灵');
  eq(boosted.exportSave().talismanUse, boosted.talismanUse, '关闭保留已有增益和冷却记录');
  console.log(`talisman save tests ok: ${assertions} assertions`);
} finally {
  fail = false;
  setGameTimeSource(null);
  for (const [name, enabled] of Object.entries(flags)) setFeatureFlag(name as keyof typeof flags, enabled);
  if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
}
