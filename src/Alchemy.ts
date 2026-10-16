import { ALCHEMY_RULES, RECIPES, LIFE_SKILLS, LIFE_SKILL_ERRORS, type FireResult, type PillQuality, type RecipeDef } from './data';
import { lifeSkillDefinition, lifeSkillExperience, lifeSkillLevel, lifeSkillRecipe } from './LifeSkills';
import type { Progress } from './Progress';
import type { QuestSystem } from './QuestSystem';
import { featureEnabled } from './features';
export { ALCHEMY_RULES } from './data';

export interface FireConfig {
  zoneWidth: number; perfectWidth: number; periodMs: number; zoneRandomPerBrew: boolean;
}
export interface FireRound extends FireConfig {
  zoneStart: number; elapsedMs: number; durationMs: number;
}
export type AlchemyBlock = 'unknown' | 'unlearned' | 'materials' | 'fuel' | 'furnace' | 'busy' | 'closed' | 'config' | 'skill_level';
export interface AlchemyCheck {
  ok: boolean; reason?: AlchemyBlock;
  materials: { item: string; have: number; need: number }[];
  fuelHave: number; fuelNeed: number;
}
export interface AlchemyResult {
  recipe: RecipeDef; success: boolean; quality: PillQuality | null; count: number;
  rate: number; fire: FireResult; expGained: number; levels: number;
}
export interface BrewSession { recipeId: string; furnaceId: string; fire: FireRound; lifeSkillLevel?: number; }

/** 自用丹炉随身使用；无炉时仅可借用孙郎中交互范围内的公共青铜炉。 */
export function alchemyFurnace(prog: Pick<Progress, 'count'>, player: { x: number; y: number },
  objects: readonly { type: string; name: string; x: number; y: number; props: { npc?: string } }[], publicFurnace?: string) {
  if (publicFurnace) return publicFurnace;
  const owned = ['dark_iron_furnace', 'purple_copper_furnace', 'bronze_furnace'].find(id => prog.count(id) > 0);
  if (owned) return owned;
  const nearDoctor = objects.some(o => o.type === 'npc' && (o.props.npc ?? o.name) === 'doctor_sun'
    && Math.abs(o.x - player.x) < 40 && Math.abs(o.y - player.y) < 48);
  return nearDoctor ? 'bronze_furnace' : undefined;
}

/** 读档只恢复已知丹方/丹炉及完整合法的火候状态，不替损坏档编造结果。 */
export function isBrewSession(value: unknown, learnedRecipes: readonly string[]): value is BrewSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Partial<BrewSession>, fire = session.fire;
  if (typeof session.recipeId !== 'string' || !RECIPES[session.recipeId] || RECIPES[session.recipeId].type || !learnedRecipes.includes(session.recipeId)
    || typeof session.furnaceId !== 'string' || !Object.prototype.hasOwnProperty.call(ALCHEMY_RULES.furnace, session.furnaceId)
    || !fire || typeof fire !== 'object'
    || (featureEnabled('lifeSkillCurve') && LIFE_SKILLS && session.lifeSkillLevel !== undefined
      && (!Number.isInteger(session.lifeSkillLevel) || session.lifeSkillLevel < 1 || session.lifeSkillLevel > LIFE_SKILLS.curve.maxLevel))) return false;
  return [fire.zoneStart, fire.zoneWidth, fire.perfectWidth, fire.periodMs, fire.elapsedMs, fire.durationMs].every(Number.isFinite)
    && fire.zoneWidth > 0 && fire.zoneWidth <= 1 && fire.perfectWidth > 0 && fire.perfectWidth <= fire.zoneWidth
    && fire.zoneStart >= 0 && fire.zoneStart + fire.zoneWidth <= 1 + 1e-10
    && fire.periodMs > 0 && fire.elapsedMs >= 0 && fire.durationMs > 0 && typeof fire.zoneRandomPerBrew === 'boolean';
}

/** 06 文档定稿缺省：26% / 4% / 来回一趟 1.2s；期限约 2s。 */
export function fireConfig(input: Partial<FireConfig> = ALCHEMY_RULES.fire): FireConfig {
  const positive = (value: unknown, fallback: number) => typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
  const zoneWidth = Math.min(1, positive(input.zoneWidth, 0.26));
  return {
    zoneWidth, perfectWidth: Math.min(zoneWidth, positive(input.perfectWidth, 0.04)),
    periodMs: positive(input.periodMs, 1200), zoneRandomPerBrew: input.zoneRandomPerBrew !== false,
  };
}
/** 0 → 1 → 0 的匀速往返，periodMs 是完整来回时长。 */
export function firePointer(fire: FireRound): number {
  const phase = Math.max(0, fire.elapsedMs) % fire.periodMs / fire.periodMs;
  return phase <= 0.5 ? phase * 2 : (1 - phase) * 2;
}
export function fireOutcome(fire: FireRound, position = firePointer(fire)): FireResult {
  const distance = Math.abs(position - (fire.zoneStart + fire.zoneWidth / 2));
  if (distance <= fire.perfectWidth / 2 + 1e-10) return 'perfect';
  if (distance <= fire.zoneWidth / 2 + 1e-10) return 'inZone';
  return 'missed';
}

/** 从下品向更高三品转移；未配分配比例时按三品基础权重比例分摊。 */
export function qualityRates(level: number, fire: FireResult): Record<PillQuality, number> {
  const config = ALCHEMY_RULES.quality;
  const rates = { ...config.base };
  const curve = featureEnabled('lifeSkillCurve');
  if (curve && !LIFE_SKILLS) return { low: 0, mid: 0, high: 0, supreme: 0 };
  const shift = Math.min(rates.low, curve ? lifeSkillLevel(LIFE_SKILLS!, 'alchemy', level).qualityShift
    : Math.max(0, level) * config.perAlchemyLevelShift);
  const higher = rates.mid + rates.high + rates.supreme;
  if (higher > 0) {
    for (const quality of ['mid', 'high', 'supreme'] as const) rates[quality] += curve
      ? shift * lifeSkillDefinition(LIFE_SKILLS!, 'alchemy').qualityWeights[quality] : shift * rates[quality] / higher;
    rates.low -= shift;
  }
  if (fire === 'perfect') {
    const desired = config.perfectFireBonus.high + config.perfectFireBonus.supreme;
    const multiplier = desired > 0 ? Math.min(rates.low, desired) / desired : 0;
    rates.low -= desired * multiplier;
    rates.high += config.perfectFireBonus.high * multiplier;
    rates.supreme += config.perfectFireBonus.supreme * multiplier;
  }
  return rates;
}

/** 一炉结算只走一次，费用在开炉时扣除；批量逐炉结算但跳过火候。 */
export class AlchemySystem {
  active: BrewSession | null = null;
  constructor(private prog: Progress, private quests?: QuestSystem, public random: () => number = () => Math.random()) {
    if (featureEnabled('lifeSkillCurve')) LIFE_SKILL_ERRORS.forEach(message => console.error(`[life skills config] ${message}`));
    this.active = isBrewSession(prog.pendingAlchemy, prog.learnedRecipes) ? prog.pendingAlchemy : null;
    prog.pendingAlchemy = this.active;
  }

  get knownRecipes(): RecipeDef[] {
    return this.prog.learnedRecipes.map(id => RECIPES[id]).filter((recipe): recipe is RecipeDef => !!recipe && !recipe.type);
  }
  check(recipeId: string, count = 1, furnaceId = 'bronze_furnace'): AlchemyCheck {
    const recipe = RECIPES[recipeId];
    const validCount = Number.isInteger(count) && count > 0;
    const curveReady = !featureEnabled('lifeSkillCurve') || !!recipe && this.curveRecipeReady(recipe);
    const materials = (curveReady ? recipe?.materials ?? [] : []).map(material => ({ item: material.item, have: this.prog.count(material.item), need: material.count * count }));
    const fuelNeed = (recipe?.fuelStones ?? 0) * count;
    let reason: AlchemyBlock | undefined;
    if (!featureEnabled('alchemyPhase1')) reason = 'closed';
    else if (this.active) reason = 'busy';
    else if (!recipe || recipe.type || !validCount) reason = 'unknown';
    else if (!curveReady || this.prog.recipeSkillPermission(recipeId).reason === 'config') reason = 'config';
    else if (featureEnabled('lifeSkillCurve') && !this.prog.recipeSkillPermission(recipeId).ok) reason = 'skill_level';
    else if (!this.prog.learnedRecipes.includes(recipeId)) reason = 'unlearned';
    else if (!Object.prototype.hasOwnProperty.call(ALCHEMY_RULES.furnace, furnaceId)) reason = 'furnace';
    else if (materials.some(material => material.have < material.need)) reason = 'materials';
    else if (this.prog.stones < fuelNeed) reason = 'fuel';
    return { ok: !reason, reason, materials, fuelHave: this.prog.stones, fuelNeed };
  }
  rate(recipeId: string, fire: FireResult = 'skipped', furnaceId = 'bronze_furnace', level = this.prog.alchemyLevel) {
    const recipe = RECIPES[recipeId];
    if (!recipe || recipe.type) return 0;
    if (featureEnabled('lifeSkillCurve') && !this.curveRecipeReady(recipe)) return 0;
    const rules = ALCHEMY_RULES;
    const furnaceBonus = (rules.furnace as Record<string, number>)[furnaceId] ?? 0;
    const levelBonus = featureEnabled('lifeSkillCurve') ? lifeSkillLevel(LIFE_SKILLS!, 'alchemy', level).successBonus : rules.perAlchemyLevel * level;
    const raw = (recipe.baseRate ?? 0) + levelBonus + furnaceBonus + rules.fire[fire]
      - rules.levelGapPenalty * Math.max(0, (recipe.recipeLevel ?? 1) - level);
    return Math.max(rules.minRate, Math.min(rules.maxRate, raw));
  }
  preview(recipeId: string, fire: FireResult = 'skipped', furnaceId = 'bronze_furnace') {
    const check = this.check(recipeId, 1, furnaceId), recipe = RECIPES[recipeId];
    const outputBonus = featureEnabled('lifeSkillCurve') && LIFE_SKILLS
      ? lifeSkillLevel(LIFE_SKILLS, 'alchemy', this.prog.alchemyLevel).outputBonusRate : 0;
    return Object.freeze({ recipeId, rate: this.rate(recipeId, fire, furnaceId),
      qualityRates: Object.freeze(qualityRates(this.prog.alchemyLevel, fire)), permitted: check.ok, reason: check.reason,
      outputCount: recipe && check.reason !== 'config' ? Math.floor(recipe.outputCount * (1 + outputBonus)) : 0,
      configErrors: featureEnabled('lifeSkillCurve') ? LIFE_SKILL_ERRORS.length ? LIFE_SKILL_ERRORS
        : Object.freeze(check.reason === 'config' ? [`[life skills config] alchemy: invalid progress or recipe ${recipeId}`] : [])
        : Object.freeze([] as string[]) });
  }
  start(recipeId: string, furnaceId = 'bronze_furnace'): AlchemyCheck & { fire?: FireRound } {
    const check = this.check(recipeId, 1, furnaceId);
    if (!check.ok) return check;
    this.consume(RECIPES[recipeId]);
    const config = fireConfig();
    const fire = { ...config, zoneStart: (1 - config.zoneWidth) * (config.zoneRandomPerBrew ? this.roll() : 0.5), elapsedMs: 0, durationMs: 2000 };
    this.active = { recipeId, furnaceId, fire,
      ...(featureEnabled('lifeSkillCurve') ? { lifeSkillLevel: this.prog.alchemyLevel } : {}) };
    this.prog.pendingAlchemy = this.active;
    this.prog.persistSoon();
    return { ...check, fire };
  }
  advanceFire(delta: number): AlchemyResult | null {
    if (!featureEnabled('alchemyPhase1') || !this.active || !this.canSettle()) return null;
    this.active.fire.elapsedMs += Number.isFinite(delta) ? Math.max(0, delta) : 0;
    return this.active.fire.elapsedMs >= this.active.fire.durationMs ? this.skipFire() : null;
  }
  stopFire(): AlchemyResult | null {
    if (!featureEnabled('alchemyPhase1') || !this.active || !this.canSettle()) return null;
    if (this.active.fire.elapsedMs >= this.active.fire.durationMs) return this.skipFire();
    return this.finish(fireOutcome(this.active.fire));
  }
  skipFire(): AlchemyResult | null { return featureEnabled('alchemyPhase1') && this.active && this.canSettle() ? this.finish('skipped') : null; }
  batch(recipeId: string, count = 5, furnaceId = 'bronze_furnace'): AlchemyCheck & { results: AlchemyResult[] } {
    const check = this.check(recipeId, count, furnaceId);
    if (!check.ok) return { ...check, results: [] };
    const results: AlchemyResult[] = [];
    for (let i = 0; i < count; i++) {
      const recipe = RECIPES[recipeId];
      this.consume(recipe); results.push(this.settle(recipe, furnaceId, 'skipped'));
    }
    this.prog.persistSoon();
    return { ...check, results };
  }
  private consume(recipe: RecipeDef) {
    for (const material of recipe.materials) this.prog.removeItem(material.item, material.count);
    this.prog.stones -= recipe.fuelStones ?? 0;
  }
  private curveRecipeReady(recipe: RecipeDef) {
    return !!LIFE_SKILLS && !!lifeSkillRecipe(LIFE_SKILLS, 'alchemy', recipe)
      && Number.isSafeInteger(this.prog.alchemyLevel) && this.prog.alchemyLevel >= 1 && this.prog.alchemyLevel <= LIFE_SKILLS.curve.maxLevel
      && Number.isSafeInteger(this.prog.alchemyExp) && this.prog.alchemyExp >= 0
      && Number.isInteger(recipe.recipeLevel) && recipe.recipeLevel! >= 1 && recipe.recipeLevel! <= LIFE_SKILLS.curve.maxLevel
      && typeof recipe.baseRate === 'number' && Number.isFinite(recipe.baseRate) && recipe.baseRate >= 0 && recipe.baseRate <= 1
      && Number.isSafeInteger(recipe.fuelStones) && recipe.fuelStones! >= 0
      && Number.isSafeInteger(recipe.outputCount) && recipe.outputCount > 0
      && Array.isArray(recipe.materials) && recipe.materials.length > 0
      && recipe.materials.every(m => !!m && typeof m.item === 'string' && Number.isSafeInteger(m.count) && m.count > 0);
  }
  private canSettle() {
    return !featureEnabled('lifeSkillCurve') || !!this.active && !!RECIPES[this.active.recipeId] && this.curveRecipeReady(RECIPES[this.active.recipeId]);
  }
  private finish(fire: FireResult): AlchemyResult {
    const session = this.active!;
    this.active = null;
    this.prog.pendingAlchemy = null;
    return this.settle(RECIPES[session.recipeId], session.furnaceId, fire, session.lifeSkillLevel);
  }
  private roll() { return Math.max(0, Math.min(1 - Number.EPSILON, Number(this.random()) || 0)); }
  private settle(recipe: RecipeDef, furnaceId: string, fire: FireResult, openedLevel = this.prog.alchemyLevel): AlchemyResult {
    const curve = featureEnabled('lifeSkillCurve');
    const level = curve ? openedLevel : this.prog.alchemyLevel;
    const rate = this.rate(recipe.id, fire, furnaceId, level), success = this.roll() < rate;
    const outputCount = curve ? Math.floor(recipe.outputCount * (1 + lifeSkillLevel(LIFE_SKILLS!, 'alchemy', level).outputBonusRate)) : recipe.outputCount;
    let quality: PillQuality | null = null;
    if (success) {
      const distribution = qualityRates(level, fire);
      let remainder = this.roll();
      quality = 'supreme';
      for (const grade of ['low', 'mid', 'high', 'supreme'] as PillQuality[]) {
        remainder -= distribution[grade]; if (remainder < 0) { quality = grade; break; }
      }
      this.prog.addCraftedPill(recipe.output, outputCount, quality);
      this.quests?.onCraft(recipe.output, outputCount);
    }
    const multiplier = Number(ALCHEMY_RULES.alchemyExp.perBrew.match(/×\s*(\d+(?:\.\d+)?)/)?.[1] ?? 10);
    const maxLevel = curve ? LIFE_SKILLS!.curve.maxLevel : ALCHEMY_RULES.alchemyExp.maxLevel;
    const expGained = this.prog.alchemyLevel >= maxLevel ? 0 : curve
      ? lifeSkillExperience(LIFE_SKILLS!, 'alchemy', recipe, 'alchemy', success, true)
      : Math.floor((recipe.recipeLevel ?? 1) * multiplier * (success ? 1 : 0.5));
    const levels = this.prog.gainAlchemyExp(expGained);
    this.prog.persistSoon();
    return { recipe, success, quality, count: success ? outputCount : 0, rate, fire, expGained, levels };
  }
}
