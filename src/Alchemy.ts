import { ALCHEMY_RULES, RECIPES, type FireResult, type PillQuality, type RecipeDef } from './data';
import type { Progress } from './Progress';
import type { QuestSystem } from './QuestSystem';
export { ALCHEMY_RULES } from './data';

export interface FireConfig {
  zoneWidth: number; perfectWidth: number; periodMs: number; zoneRandomPerBrew: boolean;
}
export interface FireRound extends FireConfig {
  zoneStart: number; elapsedMs: number; durationMs: number;
}
export type AlchemyBlock = 'unknown' | 'unlearned' | 'materials' | 'fuel' | 'furnace' | 'busy';
export interface AlchemyCheck {
  ok: boolean; reason?: AlchemyBlock;
  materials: { item: string; have: number; need: number }[];
  fuelHave: number; fuelNeed: number;
}
export interface AlchemyResult {
  recipe: RecipeDef; success: boolean; quality: PillQuality | null; count: number;
  rate: number; fire: FireResult; expGained: number; levels: number;
}
export interface BrewSession { recipeId: string; furnaceId: string; fire: FireRound; }

/** 读档只恢复已知丹方/丹炉及完整合法的火候状态，不替损坏档编造结果。 */
export function isBrewSession(value: unknown): value is BrewSession {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const session = value as Partial<BrewSession>, fire = session.fire;
  if (typeof session.recipeId !== 'string' || !RECIPES[session.recipeId] || RECIPES[session.recipeId].type
    || typeof session.furnaceId !== 'string' || !Object.prototype.hasOwnProperty.call(ALCHEMY_RULES.furnace, session.furnaceId)
    || !fire || typeof fire !== 'object') return false;
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
  const shift = Math.min(rates.low, Math.max(0, level) * config.perAlchemyLevelShift);
  const higher = rates.mid + rates.high + rates.supreme;
  if (higher > 0) {
    for (const quality of ['mid', 'high', 'supreme'] as const) rates[quality] += shift * rates[quality] / higher;
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
    this.active = isBrewSession(prog.pendingAlchemy) ? prog.pendingAlchemy : null;
    prog.pendingAlchemy = this.active;
  }

  get knownRecipes(): RecipeDef[] {
    return this.prog.learnedRecipes.map(id => RECIPES[id]).filter((recipe): recipe is RecipeDef => !!recipe && !recipe.type);
  }
  check(recipeId: string, count = 1, furnaceId = 'bronze_furnace'): AlchemyCheck {
    const recipe = RECIPES[recipeId];
    const validCount = Number.isInteger(count) && count > 0;
    const materials = (recipe?.materials ?? []).map(material => ({ item: material.item, have: this.prog.count(material.item), need: material.count * count }));
    const fuelNeed = (recipe?.fuelStones ?? 0) * count;
    let reason: AlchemyBlock | undefined;
    if (this.active) reason = 'busy';
    else if (!recipe || recipe.type || !validCount) reason = 'unknown';
    else if (!this.prog.learnedRecipes.includes(recipeId)) reason = 'unlearned';
    else if (!Object.prototype.hasOwnProperty.call(ALCHEMY_RULES.furnace, furnaceId)) reason = 'furnace';
    else if (materials.some(material => material.have < material.need)) reason = 'materials';
    else if (this.prog.stones < fuelNeed) reason = 'fuel';
    return { ok: !reason, reason, materials, fuelHave: this.prog.stones, fuelNeed };
  }
  rate(recipeId: string, fire: FireResult = 'skipped', furnaceId = 'bronze_furnace') {
    const recipe = RECIPES[recipeId];
    if (!recipe || recipe.type) return 0;
    const rules = ALCHEMY_RULES;
    const furnaceBonus = (rules.furnace as Record<string, number>)[furnaceId] ?? 0;
    const raw = (recipe.baseRate ?? 0) + rules.perAlchemyLevel * this.prog.alchemyLevel + furnaceBonus + rules.fire[fire]
      - rules.levelGapPenalty * Math.max(0, (recipe.recipeLevel ?? 1) - this.prog.alchemyLevel);
    return Math.max(rules.minRate, Math.min(rules.maxRate, raw));
  }
  start(recipeId: string, furnaceId = 'bronze_furnace'): AlchemyCheck & { fire?: FireRound } {
    const check = this.check(recipeId, 1, furnaceId);
    if (!check.ok) return check;
    this.consume(RECIPES[recipeId]);
    const config = fireConfig();
    const fire = { ...config, zoneStart: (1 - config.zoneWidth) * (config.zoneRandomPerBrew ? this.roll() : 0.5), elapsedMs: 0, durationMs: 2000 };
    this.active = { recipeId, furnaceId, fire };
    this.prog.pendingAlchemy = this.active;
    this.prog.save();
    return { ...check, fire };
  }
  advanceFire(delta: number): AlchemyResult | null {
    if (!this.active) return null;
    this.active.fire.elapsedMs += Number.isFinite(delta) ? Math.max(0, delta) : 0;
    return this.active.fire.elapsedMs >= this.active.fire.durationMs ? this.skipFire() : null;
  }
  stopFire(): AlchemyResult | null {
    if (!this.active) return null;
    if (this.active.fire.elapsedMs >= this.active.fire.durationMs) return this.skipFire();
    return this.finish(fireOutcome(this.active.fire));
  }
  skipFire(): AlchemyResult | null { return this.active ? this.finish('skipped') : null; }
  batch(recipeId: string, count = 5, furnaceId = 'bronze_furnace'): AlchemyCheck & { results: AlchemyResult[] } {
    const check = this.check(recipeId, count, furnaceId);
    if (!check.ok) return { ...check, results: [] };
    const results: AlchemyResult[] = [];
    for (let i = 0; i < count; i++) {
      const recipe = RECIPES[recipeId];
      this.consume(recipe); results.push(this.settle(recipe, furnaceId, 'skipped'));
    }
    this.prog.save();
    return { ...check, results };
  }
  private consume(recipe: RecipeDef) {
    for (const material of recipe.materials) this.prog.removeItem(material.item, material.count);
    this.prog.stones -= recipe.fuelStones ?? 0;
  }
  private finish(fire: FireResult): AlchemyResult {
    const session = this.active!;
    this.active = null;
    this.prog.pendingAlchemy = null;
    return this.settle(RECIPES[session.recipeId], session.furnaceId, fire);
  }
  private roll() { return Math.max(0, Math.min(1 - Number.EPSILON, Number(this.random()) || 0)); }
  private settle(recipe: RecipeDef, furnaceId: string, fire: FireResult): AlchemyResult {
    const rate = this.rate(recipe.id, fire, furnaceId), success = this.roll() < rate;
    let quality: PillQuality | null = null;
    if (success) {
      const distribution = qualityRates(this.prog.alchemyLevel, fire);
      let remainder = this.roll();
      quality = 'supreme';
      for (const grade of ['low', 'mid', 'high', 'supreme'] as PillQuality[]) {
        remainder -= distribution[grade]; if (remainder < 0) { quality = grade; break; }
      }
      this.prog.addCraftedPill(recipe.output, recipe.outputCount, quality);
      this.quests?.onCraft(recipe.output, recipe.outputCount);
    }
    const multiplier = Number(ALCHEMY_RULES.alchemyExp.perBrew.match(/×\s*(\d+(?:\.\d+)?)/)?.[1] ?? 10);
    const expGained = this.prog.alchemyLevel >= ALCHEMY_RULES.alchemyExp.maxLevel ? 0 : Math.floor((recipe.recipeLevel ?? 1) * multiplier * (success ? 1 : 0.5));
    const levels = this.prog.gainAlchemyExp(expGained);
    this.prog.save();
    return { recipe, success, quality, count: success ? recipe.outputCount : 0, rate, fire, expGained, levels };
  }
}
