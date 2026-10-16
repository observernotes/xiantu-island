import lifeSkillsRaw from '@xt/balance/life_skills.json';
import { ALCHEMY_RULES, LIFE_SKILLS, LIFE_SKILL_ERRORS, MORAL_STATE, RECIPES, type FireResult, type PillQuality } from './data';
import { validateLifeSkills, lifeSkillDefinition, lifeSkillLevel, lifeSkillRecipe, lifeSkillExperience, normalizeLifeSkillProgress } from './LifeSkills';
import { MORAL_VERSION, Progress } from './Progress';
import { RELATIONSHIP_VERSION } from './RelationshipState';
import { AlchemySystem, qualityRates } from './Alchemy';
import { DrawStroke, TalismanSystem, normalizeTalismanSave, type TalismanDirection, type TalismanResult } from './Talisman';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { setGameTimeSource } from './GameClock';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
function near(actual: number, expected: number, message: string) { ok(Number.isFinite(actual) && Math.abs(actual - expected) < 1e-10, `${message}: ${actual} / ${expected}`); }

const priorFlags = featureFlags(), storage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const disk: Record<string, string> = {}, key = 'xiantu_save_v1', now = 1_800_000_000_000;
let writeFails = false;
Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
  getItem: (id: string) => disk[id] ?? null,
  setItem: (id: string, value: string) => { if (writeFails) throw new Error('模拟写盘失败'); disk[id] = value; },
  removeItem: (id: string) => { delete disk[id]; },
} });
setGameTimeSource(() => now);

function alchemyReady(level = 1) {
  const p = new Progress(); p.level = 60; p.alchemyLevel = level; p.stones = 1_000_000;
  p.learnedRecipes = Object.values(RECIPES).filter(r => !r.type).map(r => r.id);
  for (const recipe of Object.values(RECIPES)) for (const m of recipe.materials ?? []) p.inventory[m.item] = 10_000;
  return { p, system: new AlchemySystem(p, undefined, () => 0) };
}
function talismanReady(random: () => number = () => 0) {
  const p = new Progress(); p.level = 15;
  p.learnedRecipes = Object.values(RECIPES).filter(r => r.type === 'talisman' || r.type === 'grinding').map(r => r.id);
  p.inventory = { talisman_paper: 100, spirit_ink: 100, snake_gall: 100, spirit_herb: 100 };
  return { p, system: new TalismanSystem(p, undefined, random) };
}
function draw(system: TalismanSystem, correct: number): TalismanResult | null {
  const strokes = system.view().draw!.strokes;
  system.input([], 0, 0);
  let result: TalismanResult | null = null;
  for (const [i, expected] of strokes.entries()) {
    const wrong: TalismanDirection = expected === 'up' ? 'down' : 'up';
    result = system.input([i < correct ? expected : wrong], 10 + i * 20, i * 2 + 1) ?? result;
    system.input([], 11 + i * 20, i * 2 + 2);
  }
  return result;
}

try {
  eq(featureEnabled('lifeSkillCurve'), false, '发布快照显式默认关，pending不自动开放');
  eq(LIFE_SKILL_ERRORS.length, 0, '真实表无配置错误');
  ok(LIFE_SKILLS, '真实生活技能表已接入 data.ts');
  const config = LIFE_SKILLS;
  const validated = validateLifeSkills(lifeSkillsRaw, RECIPES);
  ok(validated.config, '真实配置通过独立校验'); eq(validated.errors.length, 0, '校验器没有忽略的错误');
  eq(config.skills.length, 3, '三项技能');

  // 每个必需叶字段都单独删除，禁止缺项悄悄变成免费/零门槛。
  type Mutable = Record<string, any>;
  function bad(label: string, mutate: (raw: Mutable) => void) {
    const raw = structuredClone(lifeSkillsRaw) as Mutable; mutate(raw);
    const result = validateLifeSkills(raw, RECIPES);
    eq(result.config, null, `坏表禁用配置：${label}`); ok(result.errors.length > 0, `坏表必须给出错误：${label}`);
  }
  for (const field of ['schemaVersion', 'integrationState', 'curve', 'futureRecipeRankGate', 'skills']) bad(`缺 ${field}`, r => { delete r[field]; });
  for (const field of ['initialLevel', 'initialExp', 'maxLevel', 'expToNextCoefficient']) bad(`缺 curve.${field}`, r => { delete r.curve[field]; });
  for (const field of ['id', 'name', 'eligibleActions', 'expSuccessPerRank', 'expFailureRatio', 'expFailureRequiresQualification',
    'successPerLevel', 'bonusLevelOffset', 'qualityShiftPerLevel', 'qualityWeights', 'outputBonusRate', 'recipeRanks', 'levels']) {
    bad(`缺技能 ${field}`, r => { delete r.skills[0][field]; });
  }
  for (const field of ['level', 'expToNext', 'totalExp', 'successBonus', 'qualityShift', 'outputBonusRate', 'maxNewRecipeRank']) {
    bad(`缺等级 ${field}`, r => { delete r.skills[0].levels[0][field]; });
  }
  for (const field of ['recipeId', 'rank', 'minSkillLevel']) bad(`缺配方 ${field}`, r => { delete r.skills[0].recipeRanks[0][field]; });
  for (const [label, mutate] of [
    ['版本不支持', (r: Mutable) => { r.schemaVersion = 2; }],
    ['技能缺失', (r: Mutable) => { r.skills.pop(); }],
    ['技能重复', (r: Mutable) => { r.skills[1].id = r.skills[0].id; }],
    ['等级少行', (r: Mutable) => { r.skills[0].levels.pop(); }],
    ['等级多行', (r: Mutable) => { r.skills[0].levels.push(r.skills[0].levels[29]); }],
    ['等级不连续', (r: Mutable) => { r.skills[0].levels[1].level = 3; }],
    ['经验参数与行不一致', (r: Mutable) => { r.curve.expToNextCoefficient++; }],
    ['成功率参数与行不一致', (r: Mutable) => { r.skills[0].successPerLevel += 0.001; }],
    ['品质参数与行不一致', (r: Mutable) => { r.skills[0].qualityShiftPerLevel += 0.001; }],
    ['产量参数与行不一致', (r: Mutable) => { r.skills[0].outputBonusRate = 0.1; }],
    ['累计经验不一致', (r: Mutable) => { r.skills[0].levels[1].totalExp++; }],
    ['满级缺哨兵', (r: Mutable) => { r.skills[0].levels[29].expToNext = 1500; }],
    ['不存在的配方引用', (r: Mutable) => { r.skills[0].recipeRanks[0].recipeId = '__missing'; }],
    ['重复配方引用', (r: Mutable) => { r.skills[0].recipeRanks.push(r.skills[0].recipeRanks[0]); }],
    ['旧配方映射缺失不得走未来门槛', (r: Mutable) => { r.skills[0].recipeRanks.shift(); }],
    ['非法技能门槛', (r: Mutable) => { r.skills[0].recipeRanks[0].minSkillLevel = 0; }],
    ['非法技艺阶', (r: Mutable) => { r.skills[0].recipeRanks[0].rank = -1; }],
    ['非有限经验', (r: Mutable) => { r.skills[0].expSuccessPerRank = Infinity; }],
    ['负失败比率', (r: Mutable) => { r.skills[0].expFailureRatio = -0.5; }],
    ['品质权重未归一', (r: Mutable) => { r.skills[0].qualityWeights.mid = 1; }],
  ] as const) bad(label, mutate);

  for (const id of ['alchemy', 'forging', 'talisman'] as const) {
    const skill = lifeSkillDefinition(config, id); eq(skill.levels.length, 30, `${id}完整30行`);
    for (let level = 1; level <= 30; level++) {
      const row = lifeSkillLevel(config, id, level);
      eq(row.level, level, `${id}按等级索引`);
      eq(row.expToNext, level === 30 ? 0 : 50 * level, `${id}升级经验和满级哨兵`);
      eq(row.totalExp, 25 * level * (level - 1), `${id}累计阈值`);
      eq(row.outputBonusRate, 0, `${id}没有隐藏增产`);
    }
  }
  eq(lifeSkillDefinition(config, 'forging').recipeRanks.length, 0, '炼器无虚构图纸');
  eq(lifeSkillRecipe(config, 'forging', { ...RECIPES.recipe_hp_pill, id: '__future_forge', type: 'forge' } as never), null, '未知炼器图纸不得按默认rank开造');
  for (const id of ['recipe_foundation', 'recipe_golden_core']) eq(lifeSkillRecipe(config, 'alchemy', RECIPES[id])?.minSkillLevel, 1, '显式旧方许可优先，突破丹不反锁');
  same(lifeSkillRecipe(config, 'alchemy', { ...RECIPES.recipe_hp_pill, id: '__new', recipeLevel: 12 }), { recipeId: '__new', rank: 12, minSkillLevel: 12 }, '未来新丹方按阶许可');
  const gateOff = structuredClone(lifeSkillsRaw); gateOff.futureRecipeRankGate = false;
  const gateOffConfig = validateLifeSkills(gateOff, RECIPES).config; ok(gateOffConfig, '未来许可策略可关闭');
  eq(lifeSkillRecipe(gateOffConfig, 'alchemy', { ...RECIPES.recipe_hp_pill, id: '__new', recipeLevel: 12 }), null, '策略关时未知新方不可默认开炉');
  eq(lifeSkillExperience(config, 'talisman', RECIPES.recipe_spirit_ink, 'grinding', true, true), 0, 'rank0研墨不授经验');
  eq(lifeSkillExperience(config, 'talisman', RECIPES.recipe_talisman_fire, 'trial', true, true), 0, '试炼不在eligibleActions');
  eq(lifeSkillExperience(config, 'alchemy', RECIPES.recipe_hp_pill, 'trial', true, true), 0, '炼丹只认正式炼丹动作');
  const fractional = structuredClone(lifeSkillsRaw) as Mutable; fractional.skills[2].expFailureRatio = 0.55;
  const fractionalConfig = validateLifeSkills(fractional, RECIPES).config; ok(fractionalConfig, '可配置小数失败比率');
  eq(lifeSkillExperience(fractionalConfig, 'talisman', RECIPES.recipe_talisman_fire, 'talisman', false, true), 5, '失败经验向下取整');

  setFeatureFlag('alchemyPhase1', true); setFeatureFlag('talismanCraft', false); setFeatureFlag('lifeSkillCurve', false);
  // 固定 gameNow、未开启制符的关态新档字节基线，含两轴、好感/关系默认字段及版本；仍不含生活四字段。
  const oldSaveBaseline = `{"level":1,"exp":0,"hp":50,"mp":10,"stones":0,"allocatedStats":{"rootBone":0,"agility":0,"spirit":0,"insight":0},"unspentStatPoints":0,"inventory":{},"equip":{},"job":"","selectedSect":"","classVersion":0,"questRewardVersion":1,"daoHeart":${MORAL_STATE.daoHeart.initial},"morality":${MORAL_STATE.morality.initial},"moralVersion":${MORAL_VERSION},"affinity":{},"relationshipState":{"version":${RELATIONSHIP_VERSION},"questChoices":{},"appliedQuestHooks":[],"appliedAffinitySources":[],"claimedAffinityRewards":[],"pendingAffinitySources":[],"quarantinedFlags":{}},"classRewardClaims":[],"classRefundSp":0,"rootElement":"","completedTrials":[],"pendingSectTrial":null,"skillCooldowns":{},"quests":{},"learnedRecipes":[],"alchemyLevel":1,"alchemyExp":0,"pillQualities":{},"gatherRespawnAt":{},"openedChests":[],"pendingAlchemy":null,"name":"少年","skills":{},"skillGifted":{},"skillMastery":{},"hotbar":[null,null,null,null,null,null,null,null],"buffs":[],"spTipShown":false,"tutorialsSeen":[],"sectContribution":0,"sectRank":null,"position":null,"flags":{},"sectGrowthState":{"donationBatches":{},"settledTransactions":{}},"sectDailyContributionDay":"","sectDailyContributionClaims":[],"dailyQuestResetDay":"","dailyQuestCompletions":{},"age":16,"ageUpdatedAt":1800000000000,"seclusionDay":"","seclusionYearsToday":0,"seclusionHistory":[],"overflowExp":0,"breakthroughFails":0,"unstableUntil":0,"realmRewards":[],"unstableRatio":0,"unstableStats":[],"lastOverflowReturned":0,"breakthroughBonusLevels":0}`;
  eq(JSON.stringify(new Progress().exportSave()), oldSaveBaseline, 'lifeSkillCurve关新档符合含两轴及好感/关系默认字段、不含生活四字段的字节基线');
  {
    const p = new Progress(); p.talismanLevel = 9; p.talismanExp = 17;
    const before = JSON.stringify(p.exportSave()); eq(p.gainTalismanExp(100), 0, '关不授制符经验');
    eq(JSON.stringify(p.exportSave()), before, '关不改已有制符生活经验存档');
  }

  // 旧公式为独立预期；切开关逐级比较生产 API，避免把实现本身当预期。
  const alchemyRecipes = Object.values(RECIPES).filter(r => !r.type);
  const fires: FireResult[] = ['skipped', 'missed', 'inZone', 'perfect'];
  const qualities: PillQuality[] = ['low', 'mid', 'high', 'supreme'];
  for (let level = 1; level <= 30; level++) {
    const { p, system } = alchemyReady(level);
    for (const recipe of alchemyRecipes) {
      for (const fire of fires) for (const furnace of Object.keys(ALCHEMY_RULES.furnace)) {
        setFeatureFlag('lifeSkillCurve', false); const old = system.rate(recipe.id, fire, furnace);
        setFeatureFlag('lifeSkillCurve', true); const next = system.rate(recipe.id, fire, furnace);
        const expected = Math.max(ALCHEMY_RULES.minRate, Math.min(ALCHEMY_RULES.maxRate,
          recipe.baseRate! + 0.01 * level + (ALCHEMY_RULES.furnace as Record<string, number>)[furnace] + ALCHEMY_RULES.fire[fire]
          - 0.1 * Math.max(0, recipe.recipeLevel! - level)));
        near(next, old, `${level}级${recipe.id}新旧成功率等价`); near(next, expected, '新项替换而非叠加旧等级项');
      }
      for (const success of [false, true]) {
        const expectedExp = level === 30 ? 0 : recipe.recipeLevel! * (success ? 10 : 5);
        for (const enabled of [false, true]) {
          setFeatureFlag('lifeSkillCurve', enabled); const attempt = alchemyReady(level);
          eq(attempt.system.start(recipe.id).ok, true, '现有配方生活1级仍允许开炉');
          attempt.system.random = () => success ? 0 : 0.999999;
          const result = attempt.system.skipFire(); ok(result, '正式炉结算');
          eq(result.success, success, '按所选roll成功或失败'); eq(result.expGained, expectedExp, `${level}级${recipe.id}经验等价`);
          eq(result.count, success ? recipe.outputCount : 0, '产量读取0加成且无隐藏额外产物');
          const total = 25 * (attempt.p.alchemyLevel * (attempt.p.alchemyLevel - 1)) + attempt.p.alchemyExp;
          eq(total, 25 * level * (level - 1) + expectedExp, '跨级累计经验守恒');
        }
      }
    }
    for (const fire of fires) {
      setFeatureFlag('lifeSkillCurve', false); const old = qualityRates(level, fire);
      setFeatureFlag('lifeSkillCurve', true); const next = qualityRates(level, fire);
      const shift = 0.01 * level, perfect = fire === 'perfect';
      const expected = { low: 0.6 - shift - (perfect ? 0.12 : 0), mid: 0.3 + 0.75 * shift,
        high: 0.09 + 0.225 * shift + (perfect ? 0.1 : 0), supreme: 0.01 + 0.025 * shift + (perfect ? 0.02 : 0) };
      for (const q of qualities) { near(next[q], old[q], `${level}级${q}新旧品质等价`); near(next[q], expected[q], '品质迁移只应用一次'); }
      near(Object.values(next).reduce((a, b) => a + b, 0), 1, '品质概率归一');
    }
    p.alchemyExp = 7;
    setFeatureFlag('lifeSkillCurve', true);
    const view = p.lifeSkillView('alchemy'); eq(view.level, level, '只读等级视图');
    eq(view.expToNext, level === 30 ? 0 : 50 * level, '界面满级哨兵与经验需求'); eq(view.maxed, level === 30, '显式满级态');
    const preview = system.preview('recipe_hp_pill'); near(preview.rate, system.rate('recipe_hp_pill'), '炼丹预览率等于结算率');
    same(preview.qualityRates, qualityRates(level, 'skipped'), '炼丹预览品质分布'); eq(preview.permitted, true, '旧方预览生活许可');
    ok(Object.isFrozen(view) && Object.isFrozen(preview) && Object.isFrozen(preview.qualityRates), '界面只读视图不会被改写');
  }

  setFeatureFlag('lifeSkillCurve', true);
  {
    const p = new Progress();
    for (const invalidLevel of [NaN, Infinity, -1, 31]) {
      p.alchemyLevel = invalidLevel;
      eq(p.recipeSkillPermission('recipe_hp_pill').reason, 'config', '非法运行时生活等级给出配置许可错误');
    }
  }
  {
    const id = 'recipe_hp_pill', original = RECIPES[id];
    for (const field of ['baseRate', 'fuelStones', 'outputCount', 'materials', 'recipeLevel'] as const) {
      const broken = { ...original } as Mutable; delete broken[field]; RECIPES[id] = broken as typeof original;
      try {
        const { p, system } = alchemyReady(); const before = JSON.stringify(p.exportSave());
        eq(system.start(id).reason, 'config', `缺配方必需字段${field}报配置错误`);
        eq(system.batch(id).results.length, 0, `缺${field}不允许批量消费`);
        eq(system.preview(id).reason, 'config', `缺${field}预览显示配置错误`);
        eq(JSON.stringify(p.exportSave()), before, `缺${field}不变成免费或零门槛消费`);
      } finally { RECIPES[id] = original; }
    }
  }
  {
    const futureId = '__life_skills_future_recipe';
    RECIPES[futureId] = { ...RECIPES.recipe_hp_pill, id: futureId, recipeLevel: 12 };
    try {
      const { p, system } = alchemyReady();
      eq(system.check(futureId).reason, 'skill_level', '未来新方按rank限制制作');
      eq(system.preview(futureId).reason, 'skill_level', '预览导出生活等级许可原因');
      eq(system.preview(futureId).permitted, false, '预览明确未许可');
      p.learnedRecipes = p.learnedRecipes.filter(id => id !== futureId);
      eq(p.grantRecipe(futureId), false, '未来新方学习同样检查生活许可');
      p.alchemyLevel = 12; eq(p.grantRecipe(futureId), true, '达到明确生活门槛允许学习');
      eq(system.check(futureId).ok, true, '达到门槛允许制作');
    } finally { delete RECIPES[futureId]; }
  }
  {
    const { p, system } = alchemyReady(); p.alchemyExp = 49;
    eq(system.start('recipe_hp_pill').ok, true, '升级前开炉'); const first = system.skipFire(); ok(first?.success, '升级炉成功');
    near(first.rate, 0.81, '本炉按开炉一级结算'); same([p.alchemyLevel, p.alchemyExp], [2, 9], '结算后才升级');
    eq(system.start('recipe_hp_pill').ok, true, '升级后再开炉'); near(system.skipFire()!.rate, 0.82, '下一炉才吃新等级');
    const batch = alchemyReady(); batch.p.alchemyExp = 49; const results = batch.system.batch('recipe_hp_pill', 2).results;
    near(results[0].rate, 0.81, '批量第一炉用当前等级'); near(results[1].rate, 0.82, '批量逐炉经验推进');
    const started = alchemyReady(); started.system.start('recipe_hp_pill'); started.p.alchemyLevel = 30;
    near(started.system.skipFire()!.rate, 0.81, '进行中炉固定开炉生活等级');
    eq(new Progress().lifeSkillView('forging').available, false, '炼器保留索引与状态但没有玩法');
  }
  {
    const p = new Progress(); p.alchemyExp = 49;
    eq(p.gainAlchemyExp(252), 3, '单炉支持连续升三级'); same([p.alchemyLevel, p.alchemyExp], [4, 1], '跨级保留余量');
    p.alchemyLevel = 29; p.alchemyExp = 1449; eq(p.gainAlchemyExp(100), 1, '29到30只升一级');
    same([p.alchemyLevel, p.alchemyExp], [30, 0], '满级丢弃多余经验'); eq(p.gainAlchemyExp(999999), 0, '满级哨兵不进入while');
    eq(p.alchemyExp, 0, '满级不再授经验');
    p.talismanExp = 49; eq(p.gainTalismanExp(252), 3, '制符可一次跨级'); same([p.talismanLevel, p.talismanExp], [4, 1], '制符余量守恒');
    p.talismanLevel = 29; p.talismanExp = 1449; p.gainTalismanExp(10); same([p.talismanLevel, p.talismanExp], [30, 0], '制符满级余量归零');
  }
  same(normalizeLifeSkillProgress(config, -1, -20), { level: 1, exp: 0 }, '负等级和余量安全夹取');
  same(normalizeLifeSkillProgress(config, 999, 999), { level: 30, exp: 0 }, '超限等级夹满且经验清零');
  {
    disk[key] = JSON.stringify({ ageUpdatedAt: now, alchemyLevel: 12, alchemyExp: 77 });
    const p = Progress.load(); same([p.alchemyLevel, p.alchemyExp], [12, 77], '原炼丹生活经验迁移保持');
    same([p.talismanLevel, p.talismanExp, p.forgingLevel, p.forgingExp], [1, 0, 1, 0], '旧档按initialLevel/initialExp补两技能默认');
    for (const [rawLevel, rawExp, expectedLevel, expectedExp] of [
      [-2, -1, 1, 0], [999, 99, 30, 0], [15, 9.8, 15, 9], [15, 'bad', 15, 0], [null, null, 1, 0],
    ]) {
      disk[key] = JSON.stringify({ ageUpdatedAt: now, talismanLevel: rawLevel, talismanExp: rawExp, forgingLevel: rawLevel, forgingExp: rawExp });
      const loaded = Progress.load(); same([loaded.talismanLevel, loaded.talismanExp], [expectedLevel, expectedExp], '制符旧档非法字段归一');
      same([loaded.forgingLevel, loaded.forgingExp], [expectedLevel, expectedExp], '炼器只预留存档字段且归一');
    }
  }

  setFeatureFlag('talismanCraft', true);
  for (let level = 1; level <= 30; level++) {
    const { p, system } = talismanReady(); p.talismanLevel = level;
    const recipe = system.config.recipes.recipe_talisman_fire;
    near(system.rate(recipe.id), recipe.baseRate! + 0.001 * (level - 1), '制符逐级只加0.001×(L−1)');
    const preview = system.preview(recipe.id); near(preview.successRate, system.rate(recipe.id), '制符预览成功率');
    same(preview.qualityDistribution, { low: 0, mid: 0, high: 1, supreme: 0 }, '等级不改变完成度品质与普通宗门封顶');
    p.job = 'lingfu_novice'; near(system.rate(recipe.id), Math.min(system.config.rules!.maxRate, recipe.baseRate! + 0.08 + 0.001 * (level - 1)), '宗门与生活加成封顶');
  }
  {
    const { p, system } = talismanReady(); p.talismanExp = 49;
    eq(system.start('recipe_talisman_fire').ok, true, '正式制符开画');
    const result = draw(system, 4); ok(result?.success, '正式成功结算');
    same([p.talismanLevel, p.talismanExp], [2, 9], '成功经验同事务升级并保留余量');
    near(result.rate, 0.9, '本次结果按开画前等级算率'); eq(p.talisman.attempt!.lifeSkillExpGranted, true, 'attempt带已授经验凭据');
    const committed = JSON.stringify(p.exportSave()); eq(system.settle(result.attemptId), null, '重复结算拒绝');
    system.claimPending(); system.recover(); eq(JSON.stringify(p.exportSave()), committed, '重试领取与恢复不重复经验');
    const loaded = Progress.load(); new TalismanSystem(loaded); same([loaded.talismanLevel, loaded.talismanExp], [2, 9], '读档已领奖经验去重');
    const savedAgain = JSON.stringify(loaded.exportSave()); loaded.save(); const loadedAgain = Progress.load(); new TalismanSystem(loadedAgain);
    same([loadedAgain.talismanLevel, loadedAgain.talismanExp], [2, 9], '反复读档不重复经验');
    eq(JSON.stringify(loadedAgain.exportSave()), savedAgain, '结果恢复幂等');
  }
  {
    let rolls = 0;
    const { p, system } = talismanReady(() => { rolls++; return 0; }); system.start('recipe_talisman_fire');
    const paid = JSON.stringify(p.exportSave()), onDisk = disk[key]; writeFails = true;
    eq(draw(system, 4), null, '结果写盘失败不提交'); eq(JSON.stringify(p.exportSave()), paid, '经验、产物、结果在同事务全部回滚');
    eq(disk[key], onDisk, '失败保持已扣料存档'); writeFails = false;
    const result = system.settle(p.talisman.attempt!.attemptId); ok(result?.success, '原结果可重试提交');
    eq(p.talismanExp, 10, '重试只授一次经验'); system.settle(result.attemptId); eq(p.talismanExp, 10, '二次重试不再授经验');
    eq(rolls, 1, '曲线开启的保存失败与重试不重掷判定');
  }
  {
    const { p, system } = talismanReady(); p.addCraftedItem = () => false;
    system.start('recipe_talisman_fire'); const result = draw(system, 4); ok(result?.success, '容量竞争结果保留');
    eq(result.delivered, false, '产物待领取'); eq(p.talismanExp, 10, '待领取前经验已同结果提交');
    eq(p.talisman.pendingOutput!.lifeSkillExpGranted, true, 'pendingOutput复制经验凭据');
    const pending = normalizeTalismanSave(p.talisman); eq(pending.pendingOutput!.lifeSkillExpGranted, true, '迁移保留pending经验凭据');
    const loaded = Progress.load(); eq(loaded.talismanExp, 10, '读pending档不补经验'); new TalismanSystem(loaded);
    eq(loaded.count('talisman_fire'), 1, '恢复待领取结果只发一次产物'); eq(loaded.talismanExp, 10, 'pending恢复不重复授经验');
    const again = new TalismanSystem(loaded); eq(again.claimPending(), false, '待领取重复点击无效');
    loaded.save(); const twice = Progress.load(); new TalismanSystem(twice); eq(twice.talismanExp, 10, 'pending领奖后再次读档经验不变');
    for (const variant of ['missing_marker', 'missing_pending', 'conflict', 'only_pending'] as const) {
      const raw = structuredClone(pending);
      if (variant === 'missing_marker') delete raw.pendingOutput!.lifeSkillExpGranted;
      if (variant === 'missing_pending') raw.pendingOutput = null;
      if (variant === 'conflict') raw.attempt!.lifeSkillExpGranted = false;
      if (variant === 'only_pending') delete raw.attempt!.lifeSkillExpGranted;
      const normalized = normalizeTalismanSave(raw);
      eq(normalized.attempt!.lifeSkillExpGranted, true, `${variant}尝试凭据择已授经验`);
      eq(normalized.pendingOutput!.lifeSkillExpGranted, true, `${variant}待领取凭据保留已授经验`);
      disk[key] = JSON.stringify({ ...p.exportSave(), talisman: raw });
      const restored = Progress.load(); new TalismanSystem(restored);
      eq(restored.talismanExp, 10, `${variant}恢复不重复经验`); eq(restored.count('talisman_fire'), 1, `${variant}恢复只发原产物`);
    }
  }
  for (const [correct, expectedExp, reason] of [[0, 0, 'completion'], [1, 5, 'condense']] as const) {
    const { p, system } = talismanReady(() => 0.999999); system.start('recipe_talisman_fire');
    const result = draw(system, correct); ok(result && !result.success, '失败正式结算');
    eq(result.reason, reason, '完成度失败与合格凝符失败区分'); eq(p.talismanExp, expectedExp, '未达minCompletion不授经验，合格失败5');
    system.recover(); eq(p.talismanExp, expectedExp, '失败结果恢复也不重复授经验');
  }
  for (const success of [true, false]) {
    const { p, system } = talismanReady(() => success ? 0 : 0.999999); p.talismanLevel = 30;
    system.start('recipe_talisman_fire'); const result = draw(system, 4); ok(result, '满级正式制符结算');
    eq(result.success, success, '满级成功/合格失败按概率结算'); same([p.talismanLevel, p.talismanExp], [30, 0], '满级正式制符不再授经验');
    eq(p.talisman.attempt!.lifeSkillExpGranted, true, '满级结果仍标记完成经验结算');
  }
  {
    const { p, system } = talismanReady(() => 0.999999); system.start('recipe_talisman_fire');
    const paid = JSON.stringify(p.exportSave()); writeFails = true; eq(draw(system, 1), null, '合格失败保存失败');
    eq(JSON.stringify(p.exportSave()), paid, '合格失败经验也在事务回滚'); writeFails = false;
    ok(system.settle(p.talisman.attempt!.attemptId), '合格失败原结果重试'); eq(p.talismanExp, 5, '合格失败重试只发5经验');
    const loaded = Progress.load(); new TalismanSystem(loaded); eq(loaded.talismanExp, 5, '合格失败读档不重发');
    const interrupted = talismanReady(); interrupted.system.start('recipe_talisman_fire');
    const drawing = JSON.stringify(interrupted.p.exportSave()); writeFails = true; eq(interrupted.system.abandon(), false, '放弃保存失败可重试');
    eq(JSON.stringify(interrupted.p.exportSave()), drawing, '放弃保存失败不丢已付费尝试'); writeFails = false;
    ok(interrupted.system.abandon(), '放弃重试成功'); eq(interrupted.p.talismanExp, 0, '放弃重试仍无经验');
    const reloaded = Progress.load(); new TalismanSystem(reloaded); eq(reloaded.talismanExp, 0, '放弃后读档仍无经验');
  }
  {
    const { p, system } = talismanReady(); ok(system.grind().ok, '研墨可正式结算');
    eq(p.count('spirit_ink'), 104, '研墨仍必成4墨'); eq(p.talismanExp, 0, '研墨不授生活经验');
    const before = JSON.stringify(p.exportSave()), trial = new DrawStroke('trial', ['up', 'left']);
    trial.input([], 0); trial.input(['up'], 1); trial.input([], 2); trial.input(['left'], 3);
    ok(trial.done, '试炼画符完成'); eq(JSON.stringify(p.exportSave()), before, '试炼不改正式生活经验/存档');
    const restricted = new TalismanSystem(p, undefined, () => 0, { context: () => ({ inTrial: true }) });
    eq(restricted.start('recipe_talisman_fire').reason, 'state', '试炼中不能借正式制作授经验');
    eq(JSON.stringify(p.exportSave()), before, '试炼预检失败不授经验');
    system.start('recipe_talisman_fire'); ok(system.abandon(), '放弃尝试'); eq(p.talismanExp, 0, '放弃不授经验');
    system.start('recipe_talisman_fire'); const restored = Progress.load(); new TalismanSystem(restored); eq(restored.talismanExp, 0, '读档中断不授经验');
  }
  {
    setFeatureFlag('lifeSkillCurve', false); const { p, system } = talismanReady();
    const recipe = system.config.recipes.recipe_talisman_fire; p.talismanLevel = 30;
    near(system.rate(recipe.id), recipe.baseRate!, '关闭曲线制符率恢复一期'); system.start(recipe.id); const result = draw(system, 4); ok(result?.success, '关闭曲线正式制符仍工作');
    eq(p.talismanExp, 0, '关闭曲线制符不授经验');
    eq(Object.prototype.hasOwnProperty.call(p.talisman.attempt!, 'lifeSkillExpGranted'), false, '关闭曲线不为新attempt添加标记');
    setFeatureFlag('lifeSkillCurve', true); system.recover(); eq(p.talismanExp, 0, '开启曲线不补发旧结果经验');
  }
  {
    setFeatureFlag('lifeSkillCurve', false);
    const { p, system } = talismanReady(); p.addCraftedItem = () => false;
    system.start('recipe_talisman_fire'); draw(system, 4);
    const legacyPending = structuredClone(p.talisman);
    same(normalizeTalismanSave(legacyPending), legacyPending, '关闭曲线一期无标记pending档完整字节不变');
    const delivered = structuredClone(legacyPending); delivered.pendingOutput = null;
    delivered.attempt!.result!.delivered = true; delivered.attempt!.craftEmitted = true;
    same(normalizeTalismanSave(delivered), delivered, '关闭曲线一期无标记settled档完整字节不变');
    const drawing = structuredClone(legacyPending); drawing.attempt!.state = 'drawing';
    drawing.attempt!.result = null; drawing.attempt!.craftEmitted = false; drawing.pendingOutput = null;
    same(normalizeTalismanSave(drawing, false), drawing, '关闭曲线一期drawing实时归一完整字节不变');
    same(normalizeTalismanSave(drawing), { ...drawing, attempt: { ...drawing.attempt!, state: 'interrupted' } }, '关闭曲线一期drawing读档仍只中断');
    setFeatureFlag('lifeSkillCurve', true);
    const beforeExp = p.talismanExp; const reloaded = Progress.load(); new TalismanSystem(reloaded);
    eq(reloaded.talismanExp, beforeExp, '旧无标记pending档启用后领取不追授经验');
  }
  console.log(`life skills tests ok: ${assertions} assertions (schema/fail-closed, off baseline, all 30 alchemy levels, migration, cap/remainders, talisman transactions/recovery/pending, grind/trial exclusions)`);
} finally {
  writeFails = false; setGameTimeSource(null);
  for (const [name, enabled] of Object.entries(priorFlags)) setFeatureFlag(name as keyof typeof priorFlags, enabled);
  if (storage) Object.defineProperty(globalThis, 'localStorage', storage); else Reflect.deleteProperty(globalThis, 'localStorage');
}
