import recipesRaw from '@xt/balance/recipes.json';
import { ALCHEMY_RULES, RECIPES, QUESTS, ITEMS, NPCS } from './data';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { AlchemySystem, alchemyFurnace, fireConfig, fireOutcome, firePointer, qualityRates } from './Alchemy';
import { setFeatureFlag } from './features';

setFeatureFlag('alchemyPhase1', true);

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function near(actual: number, expected: number, message: string) { ok(Math.abs(actual - expected) < 1e-9, message); }

const saved: Record<string, string> = {};
const key = 'xiantu_save_v1';
globalThis.localStorage = {
  getItem: id => saved[id] ?? null, setItem: (id, value) => { saved[id] = value; },
  removeItem: id => { delete saved[id]; }, clear: () => { for (const id of Object.keys(saved)) delete saved[id]; },
  key: index => Object.keys(saved)[index] ?? null, get length() { return Object.keys(saved).length; },
};
const recipe = RECIPES.recipe_hp_pill;
ok(recipe, '真实回春丹丹方存在');
eq(recipe.output, 'hp_pill_small', 'craft 目标引用产物 id');
eq(recipe.outputCount, 5, '一炉按表产五枚');
eq(ALCHEMY_RULES.fire.zoneWidth, recipesRaw.rules.fire.zoneWidth, '火候宽度读原表');
eq(ITEMS.spirit_herb.gather?.castMs, 2500, '采集时长保留材料表');
eq(ITEMS.spirit_herb.gather?.respawnMs, 60000, '刷新时长保留材料表');

function ready() {
  const p = new Progress(); p.level = 12; p.stones = 100;
  p.addItem('spirit_herb', 20); p.addItem('rabbit_fur', 10);
  const q = new QuestSystem(p);
  return { p, q, a: new AlchemySystem(p, q, () => 0) };
}

// L 与背包/地图入口共用规则：无炉借公共炉，持有炉可远离孙郎中使用。
{
  const p = new Progress(); p.inventory = {};
  const doctor = { type: 'npc', name: 'doctor_sun', x: 1024, y: 640, props: {} };
  eq(alchemyFurnace(p, { x: 1024, y: 640 }, [doctor]), 'bronze_furnace', '无炉在孙郎中处可开公共炉');
  eq(alchemyFurnace(p, { x: 1063, y: 687 }, [doctor]), 'bronze_furnace', '公共炉覆盖整个NPC交互范围');
  eq(alchemyFurnace(p, { x: 1064, y: 640 }, [doctor]), undefined, '水平范围外无炉不能开公共炉');
  eq(alchemyFurnace(p, { x: 1024, y: 688 }, [doctor]), undefined, '垂直范围外无炉不能开公共炉');
  eq(alchemyFurnace(p, { x: 0, y: 0 }, []), undefined, '无炉且无孙郎中时不能开炉');
  const other = { ...doctor, name: 'grocer_wang' };
  eq(alchemyFurnace(p, doctor, [other, doctor]), 'bronze_furnace', '其他NPC不遮蔽孙郎中公共炉');
  eq(alchemyFurnace(p, doctor, [{ ...doctor, name: 'doctor_object', props: { npc: 'doctor_sun' } }]),
    'bronze_furnace', '公共炉读取NPC属性ID');
  p.addItem('bronze_furnace', 1);
  eq(alchemyFurnace(p, { x: 0, y: 0 }, []), 'bronze_furnace', '持炉远离孙郎中仍可开');
  p.addItem('purple_copper_furnace', 1); p.addItem('dark_iron_furnace', 1);
  eq(alchemyFurnace(p, doctor, [doctor]), 'dark_iron_furnace', '持有多炉在孙郎中旁仍使用最佳自用炉');
  eq(alchemyFurnace(p, { x: 0, y: 0 }, [], 'bronze_furnace'), 'bronze_furnace', '显式地图公共炉入口保留指定炉');
  eq(p.count('bronze_furnace'), 1, '打开入口不消耗持有丹炉');
}

// NPC 表暂缺入门挂载，按06补入口但不改原表或开放其它未来任务。
{
  const { p, q, a } = ready();
  p.quests.q_snake = { state: 'done', kills: {} };
  const original = NPCS.doctor_sun.quests.join(',');
  eq(q.mark('doctor_sun'), '!', '孙郎中显示炼丹入门可接标记');
  const offer = q.talk('doctor_sun'); ok(offer.after, '实际NPC对话有接取回调');
  offer.after(); eq(q.state('q_alchemy_intro'), 'active', '通过NPC回调接到炼丹入门');
  eq(q.mark('doctor_sun'), '…', '接取后显示任务进行中');
  a.start(recipe.id); a.skipFire(); eq(q.mark('doctor_sun'), '?', '成功炼丹后显示可交付');
  const turnIn = q.talk('doctor_sun').after?.(); ok(turnIn, '实际NPC对话返回交付奖励');
  eq(turnIn.quest.id, 'q_alchemy_intro', '交付炼丹入门任务');
  p.grantQuestRecipes(turnIn.quest);
  ok(p.learnedRecipes.includes('recipe_qi_pill'), 'NPC交付可发奖励丹方');
  eq(NPCS.doctor_sun.quests.join(','), original, '兼容入口不修改NPC原表');
}

// 入门靠教学丹方与公共炉打通，已有背包丹药不会替代接取后的成功产物。
{
  const { p, q, a } = ready();
  eq(q.available('q_alchemy_intro'), true, 'craft 放开后入门任务可接');
  p.addItem(recipe.output, 99);
  eq(q.accept('q_alchemy_intro'), true, '实际接取入门');
  ok(p.learnedRecipes.includes(recipe.id), '接取即开放教学回春丹');
  eq(q.objectiveProgress(QUESTS.q_alchemy_intro).find(o => o.o.type === 'craft')?.cur, 0, '旧丹药库存不算craft');
  eq(p.count('bronze_furnace'), 0, '未交付前没有自用丹炉');
  eq(a.start(recipe.id).ok, true, '公共青铜炉允许无背包炉开炼');
  eq(p.count('spirit_herb'), 18, '开炉按表扣灵草'); eq(p.count('rabbit_fur'), 9, '开炉扣灵兔绒');
  eq(p.stones, 90, '开炉扣燃料'); eq(a.start(recipe.id).reason, 'busy', '禁止同炉重复开启');
  const result = a.skipFire();
  ok(result?.success, '确定成功roll产丹'); eq(result.count, 5, '奖励数量取outputCount');
  eq(p.quests.q_alchemy_intro.crafted?.[recipe.output], 5, 'craft记五枚产物');
  eq(result.expGained, 10, '成功按一级丹方给十经验');
  eq(p.count(recipe.output), 104, '产物进普通背包'); eq(p.pillQualityCounts(recipe.output).low, 104, '旧丹药与新下品合计');
  eq(a.skipFire(), null, '同炉结果不可重复结算');
  eq(q.complete('q_alchemy_intro'), true, '采集持有量与成功炼丹均完成');
  q.turnIn('q_alchemy_intro');
  eq(p.count('spirit_herb'), 15, '交付扣表中三草');
  eq(q.state('q_alchemy_intro'), 'done', '可真实交付');
  const granted = p.grantQuestRecipes(QUESTS.q_alchemy_intro);
  eq(granted.join(','), 'recipe_qi_pill', '完成奖励补第二方并去重教学方');
  eq(p.grantQuestRecipes(QUESTS.q_alchemy_intro).length, 0, '重复授方不重复');
  q.onCraft(recipe.output, 7); eq(p.quests.q_alchemy_intro.crafted?.[recipe.output], 5, '完成后产物不再记任务');
}

// 失败、缺料与缺燃料均不造出丹药；启动失败没有额外扣除。
{
  const { p, q, a } = ready(); q.accept('q_alchemy_intro'); a.random = () => 0.999;
  eq(a.start(recipe.id).ok, true, '失败样例仍能开炉');
  const result = a.skipFire(); ok(result && !result.success, '失败roll按成功率判定');
  eq(result.count, 0, '失败无产物'); eq(result.quality, null, '失败不发品质');
  eq(result.expGained, 5, '失败给予一半经验'); eq(p.alchemyExp, 5, '失败经验留存');
  eq(p.quests.q_alchemy_intro.crafted?.[recipe.output] ?? 0, 0, '失败不推进craft');
  eq(p.count(recipe.output), 0, '失败背包无新丹'); eq(p.stones, 90, '失败仍扣燃料');
  p.inventory.spirit_herb = 1;
  eq(a.start(recipe.id).reason, 'materials', '缺材料拒绝开炉'); eq(p.stones, 90, '缺材料不扣燃料');
  p.inventory.spirit_herb = 20; p.stones = 9;
  eq(a.start(recipe.id).reason, 'fuel', '缺燃料拒绝开炉'); eq(p.count('spirit_herb'), 20, '缺燃料不扣材料');
  eq(a.check('__missing').reason, 'unknown', '未知方不抛错');
  eq(a.check('recipe_qi_pill').reason, 'unlearned', '未学方不可绕过界面开炉');
  eq(a.check(recipe.id, 1, '__missing').reason, 'furnace', '未配炉禁用');
  eq(a.check(recipe.id, 0).reason, 'unknown', '非法批量次数拒绝');
}

// 火候参数、边界、超时与一次机会；停中心提高成功率并能发极品。
{
  const fallback = fireConfig({}); eq(fallback.zoneWidth, 0.26, '缺省文火区26%');
  eq(fallback.perfectWidth, 0.04, '缺省正中线4%'); eq(fallback.periodMs, 1200, '缺省来回1.2秒');
  const { p, q, a } = ready(); q.accept('q_alchemy_intro');
  const started = a.start(recipe.id); ok(started.fire, '开炉产生火候状态');
  const fire = started.fire;
  eq(fire.zoneStart, 0, '文火区随机范围下界完整落入横条');
  fire.elapsedMs = fire.periodMs / 2; eq(firePointer(fire), 1, '半周期走到右端');
  fire.elapsedMs = fire.periodMs; eq(firePointer(fire), 0, '完整周期回到左端');
  fire.elapsedMs = fire.periodMs * fire.zoneWidth / 4;
  near(firePointer(fire), fire.zoneWidth / 2, '匀速走到区中心'); eq(fireOutcome(fire), 'perfect', '正中线判定');
  eq(fireOutcome(fire, fire.zoneStart), 'inZone', '文火区边界包含');
  eq(fireOutcome(fire, 1), 'missed', '偏离区域判定');
  const base = a.rate(recipe.id);
  a.random = () => 0.999999;
  // 成功判定取0、品质取接近1，检查高品真实入包。
  let rolls = 0; a.random = () => rolls++ === 0 ? 0 : 0.999999;
  const result = a.stopFire(); ok(result?.success, '正中样例成功');
  near(result.rate, Math.min(ALCHEMY_RULES.maxRate, base + ALCHEMY_RULES.fire.perfect), '正中成功率按表加成与封顶');
  eq(result.quality, 'supreme', '品质roll可产极品'); eq(p.pillQuality(recipe.output), 'supreme', '首枚极品可被消费端读取');
  eq(a.stopFire(), null, '空格没有第二次机会');
  a.random = () => 0; a.start(recipe.id);
  const timeout = a.advanceFire(2001); eq(timeout?.fire, 'skipped', '超时视为跳过');
  eq(a.active, null, '超时结算清除进行态');
}

// 批量五炉跳过小游戏，每炉仍算经验、成功数量；预算不足整批不开启。
{
  const { p, q, a } = ready(); q.accept('q_alchemy_intro');
  const batch = a.batch(recipe.id); eq(batch.ok, true, '五炉批量可炼');
  eq(batch.results.length, 5, '只结算五炉'); ok(batch.results.every(result => result.fire === 'skipped'), '所有批量炉跳过火候');
  eq(p.count(recipe.output), 25, '五炉按产量发二十五枚'); eq(p.stones, 50, '五炉燃料按表扣五份');
  eq(p.alchemyLevel, 2, '五次一级丹方成功升到二级'); eq(p.alchemyExp, 0, '升级经验正确结余');
  eq(p.alchemyExpNeed, 100, '二级所需经验按50×等级');
  eq(p.quests.q_alchemy_intro.crafted?.[recipe.output], 25, '批量按产物数计craft');
  p.stones = 49; eq(a.batch(recipe.id).reason, 'fuel', '整批燃料不足拒绝');
  eq(p.count(recipe.output), 25, '预算不足不部分炼制');
  near(a.rate('recipe_foundation'), ALCHEMY_RULES.minRate, '丹方等级差大时成功率保底');
  p.alchemyLevel = 30; near(a.rate(recipe.id, 'perfect', 'dark_iron_furnace'), ALCHEMY_RULES.maxRate, '高等级高炉正中成功率封顶');
  for (const level of [1, 15, 30]) {
    const base = qualityRates(level, 'skipped'), perfect = qualityRates(level, 'perfect');
    near(Object.values(base).reduce((sum, value) => sum + value, 0), 1, '等级调整品质总概率为1');
    near(Object.values(perfect).reduce((sum, value) => sum + value, 0), 1, '正中调整品质总概率为1');
    near(perfect.high - base.high, ALCHEMY_RULES.quality.perfectFireBonus.high, '正中提高上品概率');
    near(perfect.supreme - base.supreme, ALCHEMY_RULES.quality.perfectFireBonus.supreme, '正中提高极品概率');
  }
  ok(qualityRates(30, 'skipped').high > qualityRates(1, 'skipped').high, '炼丹等级提高上品概率');
}

// 品质桶始终与普通背包同步，旧库存先下品；旧档与非法字段有默认值。
{
  const p = new Progress(); p.addItem(recipe.output, 2); p.addCraftedPill(recipe.output, 5, 'high');
  eq(p.pillQuality(recipe.output), 'low', '旧库存优先按下品使用');
  p.removeItem(recipe.output, 2); eq(p.pillQuality(recipe.output), 'high', '旧库存耗尽后读取新上品');
  p.removeItem(recipe.output, 3); eq(p.pillQualityCounts(recipe.output).high, 2, '普通removeItem同步品质');
  p.save(); const loaded = Progress.load(); eq(loaded.pillQualityCounts(recipe.output).high, 2, '品质桶读档保留');
  saved[key] = JSON.stringify({ level: 12, inventory: { hp_pill_small: 7 }, quests: { q_alchemy_intro: { state: 'active', kills: {} } } });
  const old = Progress.load(); eq(old.alchemyLevel, 1, '旧档炼丹等级默认1'); eq(old.alchemyExp, 0, '旧档炼丹经验默认0');
  eq(old.pillQualityCounts(recipe.output).low, 7, '旧档丹药均可按下品使用');
  ok(old.learnedRecipes.includes(recipe.id), '旧进行中任务补教学丹方'); eq(old.quests.q_alchemy_intro.crafted?.[recipe.output] ?? 0, 0, '旧任务craft默认0');
  eq(Object.keys(old.gatherRespawnAt).length, 0, '旧档采集冷却默认空');
  eq(old.pendingAlchemy, null, '旧档进行中炉默认空');
  saved[key] = JSON.stringify({ level: 12, alchemyLevel: -2, alchemyExp: 'bad', learnedRecipes: [recipe.id, recipe.id, '__bad'],
    inventory: { hp_pill_small: 3 }, pillQualities: { hp_pill_small: { low: -1, high: 9, supreme: 99 } },
    gatherRespawnAt: { good: Date.now() + 60000, bad: -1, nan: 'oops' }, quests: { q_alchemy_intro: { state: 'done', crafted: { hp_pill_small: -4 } } } });
  const partial = Progress.load(); eq(partial.alchemyLevel, 1, '非法炼丹等级归1'); eq(partial.alchemyExp, 0, '非法经验归0');
  eq(partial.learnedRecipes.join(','), 'recipe_hp_pill,recipe_qi_pill', '已完成任务补奖励方并去重');
  eq(Object.values(partial.pillQualityCounts(recipe.output)).reduce((sum, value) => sum + value, 0), 3, '损坏品质桶不会超过背包');
  eq(Object.keys(partial.gatherRespawnAt).join(','), 'good', '采集冷却清非法值'); eq(partial.quests.q_alchemy_intro.crafted?.[recipe.output], 0, '非法craft计数归0');
}

// 付料中的炉在刷新后接续，原费用不会再扣，结算与第二次刷新都不再发奖。
{
  const { p, q, a } = ready(); q.accept('q_alchemy_intro'); a.start(recipe.id);
  ok(JSON.parse(saved[key]).pendingAlchemy, '开炉连同付料状态存档');
  const pending = JSON.parse(saved[key]).pendingAlchemy;
  a.advanceFire(100); p.save();
  const restored = Progress.load(), restoredQuests = new QuestSystem(restored);
  const resumed = new AlchemySystem(restored, restoredQuests, () => 0);
  ok(resumed.active, '刷新恢复原炉'); eq(resumed.active.fire.elapsedMs, 100, '火候进度随存档保留');
  eq(restored.count('spirit_herb'), 18, '恢复不再次扣草'); eq(restored.count('rabbit_fur'), 9, '恢复不再次扣绒');
  eq(restored.stones, 90, '恢复不再次扣燃料');
  const finished = resumed.stopFire(); ok(finished?.success, '恢复后的原炉可结算');
  eq(restored.count(recipe.output), 5, '恢复只发一炉产物');
  eq(restored.pendingAlchemy, null, '结算清内存进行态'); eq(JSON.parse(saved[key]).pendingAlchemy, null, '结算清磁盘进行态');
  eq(resumed.stopFire(), null, '恢复后同炉仍只有一次机会');
  const final = Progress.load(), restarted = new AlchemySystem(final);
  eq(restarted.active, null, '完成后再次刷新无进行中炉'); eq(final.count(recipe.output), 5, '完成后再次刷新不重复发丹');
  saved[key] = JSON.stringify({ pendingAlchemy: { recipeId: recipe.id, furnaceId: 'bronze_furnace', fire: { zoneStart: -1 } } });
  eq(Progress.load().pendingAlchemy, null, '损坏进行态清空');
  saved[key] = JSON.stringify({ pendingAlchemy: pending, learnedRecipes: [] });
  eq(Progress.load().pendingAlchemy, null, '未学丹方的非法进行态清空');
  saved[key] = JSON.stringify({ pendingAlchemy: { ...pending, furnaceId: '__missing' }, learnedRecipes: [recipe.id] });
  eq(Progress.load().pendingAlchemy, null, '未知丹炉的非法进行态清空');
  saved[key] = JSON.stringify({ quests: { unknown_corrupt_quest: null }, learnedRecipes: null });
  eq(Progress.load().learnedRecipes.length, 0, '损坏未知任务条目不阻断丹方默认值读档');
}
// 关闭入口保留已付费炉、丹方及任务；恢复开关后继续同炉，只结算一次。
{
  const { p, q, a } = ready(); q.accept('q_alchemy_intro');
  a.start(recipe.id);
  const paid = JSON.stringify({ inventory: p.inventory, stones: p.stones, pending: p.pendingAlchemy,
    recipes: p.learnedRecipes, quest: p.quests.q_alchemy_intro });
  setFeatureFlag('alchemyPhase1', false);
  eq(q.npcQuestIds('doctor_sun').includes('q_alchemy_intro'), false, '关闭时孙郎中隐藏入门任务');
  eq(q.activeIds.includes('q_alchemy_intro'), false, '关闭时追踪器隐藏进行中入门');
  eq(q.complete('q_alchemy_intro'), false, '关闭时禁止交付');
  eq(a.check(recipe.id).reason, 'closed', '关闭时禁止开炉');
  eq(a.batch(recipe.id).results.length, 0, '关闭时禁止批量');
  eq(a.advanceFire(9999), null, '关闭时火候不推进');
  eq(a.stopFire(), null, '关闭时空格不结算');
  eq(a.skipFire(), null, '关闭时跳过不结算');
  eq(JSON.stringify({ inventory: p.inventory, stones: p.stones, pending: p.pendingAlchemy,
    recipes: p.learnedRecipes, quest: p.quests.q_alchemy_intro }), paid, '关闭不丢已扣材料/炉次/丹方/任务');
  const restored = Progress.load(), resumed = new AlchemySystem(restored, new QuestSystem(restored), () => 0);
  ok(resumed.active, '关闭时读档保留待炼炉');
  eq(resumed.skipFire(), null, '关闭时恢复炉仍不能结算');
  setFeatureFlag('alchemyPhase1', true);
  ok(resumed.skipFire()?.success, '重新开启可以完成原炉');
  eq(restored.count(recipe.output), recipe.outputCount, '重开仅发一炉');
  eq(restored.stones, p.stones, '重开不会第二次扣燃料');
  eq(resumed.skipFire(), null, '重新开启结算仍然幂等');
}
console.log(`alchemy logic tests ok: ${assertions} assertions (fire, costs, qualities, crafts, batches, old saves, feature gate)`);
