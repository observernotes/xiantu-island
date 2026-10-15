/** life_skills v1 的唯一校验与索引入口。levels 是运行值，参数只作一致性校验。 */
export const LIFE_SKILL_IDS = ['alchemy', 'forging', 'talisman'] as const;
export type LifeSkillId = typeof LIFE_SKILL_IDS[number];
export type LifeSkillAction = 'alchemy' | 'forge' | 'talisman';
export interface LifeSkillRecipeSource { readonly id: string; readonly type?: string; readonly recipeLevel?: number }
export interface LifeSkillRecipeRank { readonly recipeId: string; readonly rank: number; readonly minSkillLevel: number }
export interface LifeSkillLevel {
  readonly level: number; readonly expToNext: number; readonly totalExp: number;
  readonly successBonus: number; readonly qualityShift: number; readonly outputBonusRate: number;
  readonly maxNewRecipeRank: number;
}
export interface LifeSkillDefinition {
  readonly id: LifeSkillId; readonly name: string; readonly eligibleActions: readonly LifeSkillAction[];
  readonly expSuccessPerRank: number; readonly expFailureRatio: number; readonly expFailureRequiresQualification: boolean;
  readonly successPerLevel: number; readonly bonusLevelOffset: number; readonly qualityShiftPerLevel: number;
  readonly qualityWeights: Readonly<Record<string, number>>; readonly outputBonusRate: number;
  readonly recipeRanks: readonly LifeSkillRecipeRank[]; readonly levels: readonly LifeSkillLevel[];
}
export interface LifeSkillsConfig {
  readonly schemaVersion: 1;
  /** 配置交付状态，只作格式检查，绝不能据此打开 feature。 */
  readonly integrationState: 'pending';
  readonly curve: {
    readonly initialLevel: number; readonly initialExp: number; readonly maxLevel: number; readonly expToNextCoefficient: number;
  };
  readonly futureRecipeRankGate: boolean;
  readonly skills: readonly LifeSkillDefinition[];
}
export interface LifeSkillsValidation { readonly config: LifeSkillsConfig | null; readonly errors: readonly string[] }

const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const integer = (value: unknown, min: number, max = Number.MAX_SAFE_INTEGER): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= min && value <= max;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
const close = (left: unknown, right: number) => typeof left === 'number' && Number.isFinite(left) && Math.abs(left - right) <= 1e-9;
const numeric = (value: unknown) => typeof value === 'number' ? value : NaN;
/** 既有配方必须保留显式兼容许可，缺行不能误走 futureRecipeRankGate。 */
const LEGACY_RECIPES: Readonly<Record<LifeSkillId, readonly string[]>> = {
  alchemy: ['recipe_hp_pill', 'recipe_qi_pill', 'recipe_clear_mind', 'recipe_buff_atk', 'recipe_foundation', 'recipe_golden_core'],
  forging: [],
  talisman: ['recipe_spirit_ink', 'recipe_talisman_fire', 'recipe_talisman_guard', 'recipe_talisman_return', 'recipe_talisman_gather'],
};
function freeze<T>(value: T): T {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    for (const child of Object.values(value)) freeze(child);
    Object.freeze(value);
  }
  return value;
}
function matchesSkill(id: LifeSkillId, recipe: LifeSkillRecipeSource) {
  if (id === 'alchemy') return !recipe.type;
  if (id === 'talisman') return recipe.type === 'talisman' || recipe.type === 'grinding';
  return recipe.type === 'forge' || recipe.type === 'forging';
}

/** 坏表只关闭生活曲线消费，错误保留完整字段路径，不把缺失数字转成 0。 */
export function validateLifeSkills(raw: unknown,
  recipes: readonly LifeSkillRecipeSource[] | Readonly<Record<string, LifeSkillRecipeSource>>): LifeSkillsValidation {
  const errors: string[] = [];
  const check = (valid: boolean, path: string, message: string) => { if (!valid) errors.push(`life_skills.json ${path}: ${message}`); };
  if (!record(raw)) return freeze({ config: null, errors: ['life_skills.json $: 必须为对象'] });
  check(raw.schemaVersion === 1, '$.schemaVersion', '仅支持整数版本 1');
  check(raw.integrationState === 'pending', '$.integrationState', 'v1 交付状态必须为 pending（不控制功能开关）');
  check(typeof raw.futureRecipeRankGate === 'boolean', '$.futureRecipeRankGate', '必须为 boolean');
  const curve = record(raw.curve) ? raw.curve : {};
  check(record(raw.curve), '$.curve', '缺失或不是对象');
  check(curve.maxLevel === 30, '$.curve.maxLevel', 'v1 必须为 30');
  check(integer(curve.initialLevel, 1, 30), '$.curve.initialLevel', '必须为 1～30 的整数');
  check(integer(curve.initialExp, 0), '$.curve.initialExp', '必须为非负安全整数');
  check(integer(curve.expToNextCoefficient, 1), '$.curve.expToNextCoefficient', '必须为正安全整数');
  if (integer(curve.initialLevel, 1, 30) && integer(curve.expToNextCoefficient, 1) && integer(curve.initialExp, 0)) {
    check(curve.initialLevel === 30 ? curve.initialExp === 0 : curve.initialExp < curve.expToNextCoefficient * curve.initialLevel,
      '$.curve.initialExp', '必须是初始等级内余量；满级必须为 0');
  }
  const recipeList = Array.isArray(recipes) ? recipes : Object.values(recipes);
  const recipeIndex = new Map(recipeList.map(recipe => [recipe.id, recipe]));
  const skills = Array.isArray(raw.skills) ? raw.skills : [];
  check(Array.isArray(raw.skills) && skills.length === 3, '$.skills', '必须恰有 alchemy / forging / talisman 三项');
  const seenSkills = new Set<string>(), seenRecipes = new Set<string>();
  Array.from(skills).forEach((unknownSkill, index) => {
    const p = `$.skills[${index}]`;
    if (!record(unknownSkill)) { check(false, p, '必须为对象'); return; }
    const skill = unknownSkill, id = skill.id;
    const validId = typeof id === 'string' && (LIFE_SKILL_IDS as readonly string[]).includes(id);
    check(validId, `${p}.id`, '必须为 alchemy / forging / talisman');
    if (!validId) return;
    const skillId = id as LifeSkillId;
    check(!seenSkills.has(skillId), `${p}.id`, '技能 id 重复'); seenSkills.add(skillId);
    check(typeof skill.name === 'string' && skill.name.trim().length > 0, `${p}.name`, '必须为非空字符串');
    const expectedAction = skillId === 'forging' ? 'forge' : skillId;
    check(Array.isArray(skill.eligibleActions) && skill.eligibleActions.length === 1 && skill.eligibleActions[0] === expectedAction,
      `${p}.eligibleActions`, `仅允许正式动作 ${expectedAction}`);
    check(integer(skill.expSuccessPerRank, 1), `${p}.expSuccessPerRank`, '必须为正安全整数');
    check(typeof skill.expSuccessPerRank === 'number' && Number.isSafeInteger(skill.expSuccessPerRank * 30),
      `${p}.expSuccessPerRank`, '最高阶单次经验不得超出安全整数范围');
    check(ratio(skill.expFailureRatio), `${p}.expFailureRatio`, '必须为 [0,1] 有限数');
    check(typeof skill.expFailureRequiresQualification === 'boolean', `${p}.expFailureRequiresQualification`, '必须为 boolean');
    check(ratio(skill.successPerLevel), `${p}.successPerLevel`, '必须为 [0,1] 有限数');
    check(integer(skill.bonusLevelOffset, 0, 30), `${p}.bonusLevelOffset`, '必须为 0～30 的整数');
    check(ratio(skill.qualityShiftPerLevel), `${p}.qualityShiftPerLevel`, '必须为 [0,1] 有限数');
    check(ratio(skill.outputBonusRate), `${p}.outputBonusRate`, '必须为 [0,1] 有限数');
    const weights = record(skill.qualityWeights) ? skill.qualityWeights : {};
    check(record(skill.qualityWeights), `${p}.qualityWeights`, '缺失或不是对象');
    const expectedWeights = skillId === 'alchemy' ? ['mid', 'high', 'supreme'] : skillId === 'forging' ? ['fine', 'spirit', 'treasure'] : [];
    check(Object.keys(weights).length === expectedWeights.length && expectedWeights.every(key => ratio(weights[key])),
      `${p}.qualityWeights`, `必须完整配置 ${expectedWeights.join('/') || '空对象'}，权重为 [0,1] 有限数`);
    if (expectedWeights.length) check(close(Object.values(weights).reduce<number>((sum, value) => sum + (typeof value === 'number' ? value : NaN), 0), 1),
      `${p}.qualityWeights`, '权重之和必须为 1');
    if (skillId === 'talisman') {
      check(skill.qualityShiftPerLevel === 0, `${p}.qualityShiftPerLevel`, '制符品质由完成度决定，迁移必须为 0');
      check(skill.expFailureRequiresQualification === true, `${p}.expFailureRequiresQualification`, '制符失败经验必须要求最低完成度');
    }
    const ranks = Array.isArray(skill.recipeRanks) ? skill.recipeRanks : [];
    check(Array.isArray(skill.recipeRanks), `${p}.recipeRanks`, '必须为数组（无图纸时显式 []）');
    Array.from(ranks).forEach((binding, rankIndex) => {
      const rp = `${p}.recipeRanks[${rankIndex}]`;
      if (!record(binding)) { check(false, rp, '必须为对象'); return; }
      const recipeId = binding.recipeId;
      const recipe = typeof recipeId === 'string' ? recipeIndex.get(recipeId) : undefined;
      check(typeof recipeId === 'string' && !!recipe, `${rp}.recipeId`, '必须引用 recipes 现有 id');
      if (typeof recipeId === 'string') { check(!seenRecipes.has(recipeId), `${rp}.recipeId`, '配方映射重复'); seenRecipes.add(recipeId); }
      check(integer(binding.rank, 0, 30), `${rp}.rank`, '必须为 0～30 的整数');
      check(integer(binding.minSkillLevel, 1, 30), `${rp}.minSkillLevel`, '必须为 1～30 的整数');
      if (recipe) {
        check(matchesSkill(skillId, recipe), `${rp}.recipeId`, '配方类型与生活技能不匹配');
        if (recipe.type === 'grinding') check(binding.rank === 0, `${rp}.rank`, '研墨必须为 rank 0');
        else check(integer(binding.rank, 1, 30), `${rp}.rank`, '正式制作必须为 rank 1～30');
        if (skillId === 'alchemy') check(binding.rank === recipe.recipeLevel, `${rp}.rank`, '炼丹阶数必须等于现有 recipeLevel');
      }
    });
    for (const recipeId of LEGACY_RECIPES[skillId]) {
      const binding = ranks.find(value => record(value) && value.recipeId === recipeId);
      check(!!binding, `${p}.recipeRanks`, `缺少旧方 ${recipeId} 的显式兼容许可`);
      if (record(binding)) check(binding.minSkillLevel === 1, `${p}.recipeRanks[${recipeId}].minSkillLevel`, '旧方许可必须保持 1 级');
    }
    const levels = Array.isArray(skill.levels) ? skill.levels : [];
    check(Array.isArray(skill.levels) && levels.length === 30, `${p}.levels`, '必须为连续 1～30 级，共 30 行');
    Array.from(levels).forEach((row, rowIndex) => {
      const lp = `${p}.levels[${rowIndex}]`, level = rowIndex + 1;
      if (!record(row)) { check(false, lp, '必须为对象'); return; }
      check(row.level === level && integer(row.level, 1, 30), `${lp}.level`, '等级必须按 1～30 连续排列且不重复');
      check(integer(row.expToNext, level === 30 ? 0 : 1) && row.expToNext === (level === 30 ? 0 : numeric(curve.expToNextCoefficient) * level),
        `${lp}.expToNext`, '必须等于经验系数×等级，满级哨兵为 0');
      check(integer(row.totalExp, 0) && row.totalExp === numeric(curve.expToNextCoefficient) * level * (level - 1) / 2,
        `${lp}.totalExp`, '必须与累计经验曲线一致');
      const effectiveLevel = Math.max(0, level - numeric(skill.bonusLevelOffset));
      check(ratio(row.successBonus) && close(row.successBonus, numeric(skill.successPerLevel) * effectiveLevel), `${lp}.successBonus`, '必须与成功率参数一致');
      check(ratio(row.qualityShift) && close(row.qualityShift, numeric(skill.qualityShiftPerLevel) * effectiveLevel), `${lp}.qualityShift`, '必须与品质迁移参数一致');
      check(ratio(row.outputBonusRate) && row.outputBonusRate === skill.outputBonusRate, `${lp}.outputBonusRate`, '必须与产量参数一致');
      check(row.maxNewRecipeRank === level, `${lp}.maxNewRecipeRank`, '新配方许可必须等于本行等级');
    });
  });
  for (const id of LIFE_SKILL_IDS) check(seenSkills.has(id), '$.skills', `缺少必需技能 ${id}`);
  if (errors.length) return freeze({ config: null, errors });
  // 不冻结调用方原始 JSON / 测试输入，导出独立且深只读的配置快照。
  const config = JSON.parse(JSON.stringify(raw)) as LifeSkillsConfig;
  return freeze({ config, errors });
}

export function lifeSkillDefinition(config: LifeSkillsConfig, id: LifeSkillId): LifeSkillDefinition {
  return config.skills.find(skill => skill.id === id)!;
}
export function lifeSkillLevel(config: LifeSkillsConfig, id: LifeSkillId, level: number): LifeSkillLevel {
  const bounded = Number.isFinite(level) ? Math.max(1, Math.min(config.curve.maxLevel, Math.floor(level))) : config.curve.initialLevel;
  return lifeSkillDefinition(config, id).levels[bounded - 1];
}
/** 显式旧方许可优先；未来策略只接受真实有阶数的配方，不推测未知图纸。 */
export function lifeSkillRecipe(config: LifeSkillsConfig, id: LifeSkillId, recipe: LifeSkillRecipeSource): LifeSkillRecipeRank | null {
  const explicit = lifeSkillDefinition(config, id).recipeRanks.find(binding => binding.recipeId === recipe.id);
  if (explicit) return explicit;
  if (id === 'forging' || !config.futureRecipeRankGate || !matchesSkill(id, recipe) || !integer(recipe.recipeLevel, 1, config.curve.maxLevel)) return null;
  return Object.freeze({ recipeId: recipe.id, rank: recipe.recipeLevel, minSkillLevel: recipe.recipeLevel });
}
export function lifeSkillExperience(config: LifeSkillsConfig, id: LifeSkillId, recipe: LifeSkillRecipeSource,
  action: string, success: boolean, qualified = true): number {
  const skill = lifeSkillDefinition(config, id), binding = lifeSkillRecipe(config, id, recipe);
  if (!binding || binding.rank === 0 || !(skill.eligibleActions as readonly string[]).includes(action)
    || (!success && skill.expFailureRequiresQualification && !qualified)) return 0;
  return Math.floor(skill.expSuccessPerRank * binding.rank * (success ? 1 : skill.expFailureRatio));
}
export interface LifeSkillProgress { readonly level: number; readonly exp: number }
export function normalizeLifeSkillProgress(config: LifeSkillsConfig, level: unknown, exp: unknown): LifeSkillProgress {
  const normalizedLevel = typeof level === 'number' && Number.isFinite(level)
    ? Math.max(1, Math.min(config.curve.maxLevel, Math.floor(level))) : config.curve.initialLevel;
  const normalizedExp = typeof exp === 'number' && Number.isFinite(exp)
    ? Math.max(0, Math.min(Number.MAX_SAFE_INTEGER, Math.floor(exp))) : config.curve.initialExp;
  return Object.freeze({ level: normalizedLevel, exp: normalizedLevel >= config.curve.maxLevel ? 0 : normalizedExp });
}
export interface LifeSkillProgressGain extends LifeSkillProgress { readonly levels: number }
export function advanceLifeSkillProgress(config: LifeSkillsConfig, id: LifeSkillId, level: number, exp: number, gain: number): LifeSkillProgressGain {
  const initial = normalizeLifeSkillProgress(config, level, exp);
  let nextLevel = initial.level, nextExp = initial.exp;
  if (nextLevel >= config.curve.maxLevel) return Object.freeze({ ...initial, levels: 0 });
  nextExp = Math.min(Number.MAX_SAFE_INTEGER, nextExp + (Number.isFinite(gain) ? Math.max(0, Math.floor(gain)) : 0));
  // 满级检查必须在读取 0 哨兵之前，既保留跨级余量，也避免 while(0)。
  while (nextLevel < config.curve.maxLevel) {
    const need = lifeSkillLevel(config, id, nextLevel).expToNext;
    if (nextExp < need) break;
    nextExp -= need; nextLevel++;
  }
  return Object.freeze({ level: nextLevel, exp: nextLevel >= config.curve.maxLevel ? 0 : nextExp, levels: nextLevel - initial.level });
}
export interface LifeSkillProgressView extends LifeSkillProgress { readonly expToNext: number; readonly maxLevel: number; readonly maxed: boolean }
export function lifeSkillProgressView(config: LifeSkillsConfig, id: LifeSkillId, level: number, exp: number): LifeSkillProgressView {
  const progress = normalizeLifeSkillProgress(config, level, exp);
  return Object.freeze({ ...progress, expToNext: lifeSkillLevel(config, id, progress.level).expToNext,
    maxLevel: config.curve.maxLevel, maxed: progress.level >= config.curve.maxLevel });
}
