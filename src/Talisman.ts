import recipesRaw from '@xt/balance/recipes.json';
import { ITEMS, LIFE_SKILLS, LIFE_SKILL_ERRORS, REALMS, inPhase, type PillQuality } from './data';
import { featureEnabled } from './features';
import { lifeSkillExperience, lifeSkillLevel, lifeSkillRecipe } from './LifeSkills';

export const TALISMAN_QUALITIES = ['low', 'mid', 'high', 'supreme'] as const;
export const TALISMAN_DIRECTIONS = ['up', 'down', 'left', 'right'] as const;
export type TalismanDirection = typeof TALISMAN_DIRECTIONS[number];
export type Direction = TalismanDirection;
export type DrawMode = 'craft' | 'trial';
export type StrokeOutcome = 'correct' | 'wrong' | 'timeout';
export interface TalismanRecipe {
  id: string; name: string; type: 'talisman' | 'grinding'; output: string; outputCount: number;
  materials: { item: string; count: number }[]; realm: string; reqLevel: number;
  recipeLevel?: number; baseRate?: number; draw?: { strokes: TalismanDirection[]; stepTimeMs: number };
}
export interface TalismanRules {
  minCompletion: number; minRate: number; maxRate: number; lingfuSuccessBonus: number;
  qualityMin: Record<PillQuality, number>; qualityCap: { lingfu: PillQuality; default: PillQuality };
}
export interface DrawStrokeView {
  mode: DrawMode; strokes: TalismanDirection[]; current: number; total: number;
  correct: number; wrong: number; timeouts: number; completion: number;
  remainingMs: number | null; waitingRelease: boolean; paused: boolean; done: boolean;
  lastOutcome: StrokeOutcome | null; redraws: number;
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const count = (value: unknown): value is number => finite(value) && Number.isSafeInteger(value) && value >= 0;
const positiveCount = (value: unknown): value is number => count(value) && value > 0;
const probability = (value: unknown): value is number => finite(value) && value >= 0 && value <= 1;
const quality = (value: unknown): value is PillQuality => TALISMAN_QUALITIES.includes(value as PillQuality);
const direction = (value: unknown): value is TalismanDirection => TALISMAN_DIRECTIONS.includes(value as TalismanDirection);

/** 按帧提交“全部按住方向”，内部只认新按下沿。时间与帧号由调用方提供，可脱离 Phaser 测试。 */
export class DrawStroke {
  private current = 0;
  private correct = 0;
  private wrong = 0;
  private timeouts = 0;
  private redraws = 0;
  private held = new Set<TalismanDirection>();
  private waitingRelease = true;
  private paused = false;
  private pauseAt = 0;
  private releaseWaitAt: number;
  private stepStartedAt: number;
  private now: number;
  private lastFrame: number | null = null;
  private lastOutcome: StrokeOutcome | null = null;
  readonly strokes: TalismanDirection[];
  constructor(readonly mode: DrawMode, strokes: readonly TalismanDirection[], readonly stepTimeMs = 0, now = 0) {
    if (!strokes.length || !strokes.every(direction) || !finite(now)
      || (mode === 'craft' && (!finite(stepTimeMs) || stepTimeMs <= 0))) throw new TypeError('Invalid draw configuration');
    this.strokes = [...strokes]; this.now = this.stepStartedAt = this.releaseWaitAt = now;
  }
  get done() { return this.current >= this.strokes.length; }
  input(down: readonly TalismanDirection[], now: number, frame = Math.floor(now)): StrokeOutcome | null {
    if (!finite(now) || now < this.now || !finite(frame) || this.done) return null;
    this.now = now;
    const keys = new Set(down.filter(direction)), pressed = [...keys].filter(key => !this.held.has(key));
    this.held = keys;
    if (this.paused) return null;
    if (this.waitingRelease) {
      if (!keys.size) { this.waitingRelease = false; this.stepStartedAt += now - this.releaseWaitAt; }
      return null;
    }
    if (this.lastFrame === frame) return null;
    if (this.mode === 'craft' && now >= this.stepStartedAt + this.stepTimeMs) return this.judge('timeout', now, frame);
    if (!pressed.length) return null;
    return this.judge(pressed.length === 1 && pressed[0] === this.strokes[this.current] ? 'correct' : 'wrong', now, frame);
  }
  advance(now: number, frame = Math.floor(now)): StrokeOutcome | null {
    if (!finite(now) || now < this.now || !finite(frame)) return null;
    this.now = now;
    if (this.done || this.paused || this.waitingRelease || this.lastFrame === frame || this.mode === 'trial') return null;
    return now >= this.stepStartedAt + this.stepTimeMs ? this.judge('timeout', now, frame) : null;
  }
  pause(now = this.now) {
    if (!this.paused && finite(now) && now >= this.now) {
      // 等待全松开的时间也须冻结；否则在等待阶段失焦会吃掉未亮起的首笔预算。
      if (this.waitingRelease) { this.stepStartedAt += now - this.releaseWaitAt; this.releaseWaitAt = now; }
      this.now = this.pauseAt = now; this.paused = true;
    }
  }
  resume(now = this.now) {
    if (!this.paused || !finite(now) || now < this.now) return;
    this.stepStartedAt += now - this.pauseAt; this.now = now; this.paused = false;
    this.waitingRelease = true; this.releaseWaitAt = now; this.held.clear(); this.lastFrame = null;
  }
  view(): DrawStrokeView {
    return { mode: this.mode, strokes: [...this.strokes], current: this.current, total: this.strokes.length,
      correct: this.correct, wrong: this.wrong, timeouts: this.timeouts, completion: this.correct / this.strokes.length,
      remainingMs: this.mode === 'trial' ? null : Math.max(0, this.stepTimeMs - ((this.paused ? this.pauseAt : this.waitingRelease ? this.releaseWaitAt : this.now) - this.stepStartedAt)),
      waitingRelease: this.waitingRelease, paused: this.paused, done: this.done, lastOutcome: this.lastOutcome, redraws: this.redraws };
  }
  private judge(outcome: StrokeOutcome, now: number, frame: number) {
    this.lastFrame = frame; this.lastOutcome = outcome;
    if (this.mode === 'trial' && outcome !== 'correct') {
      this.current = this.correct = this.wrong = this.timeouts = 0; this.redraws++;
    } else {
      this.current++;
      if (outcome === 'correct') this.correct++; else if (outcome === 'wrong') this.wrong++; else this.timeouts++;
    }
    this.stepStartedAt = now;
    return outcome;
  }
}

export type TalismanFailure = 'completion' | 'condense' | 'interrupted';
export interface TalismanResult {
  attemptId: string; recipeId: string; item: string; success: boolean; quality: PillQuality | null;
  rawQuality: PillQuality | null; capApplied: boolean; count: number; completion: number;
  correct: number; wrong: number; timeouts: number; total: number; rate: number; roll: number | null;
  reason?: TalismanFailure; delivered: boolean;
}
export interface TalismanAttempt {
  attemptId: string; recipeId: string; state: 'drawing' | 'settled' | 'interrupted'; result: TalismanResult | null;
  craftEmitted: boolean; lifeSkillExpGranted?: boolean;
}
export interface TalismanPendingOutput {
  attemptId: string; item: string; count: number; quality: PillQuality | null; lifeSkillExpGranted?: boolean;
}
export interface TalismanSave {
  version: 1; nextAttempt: number; attempt: TalismanAttempt | null; pendingOutput: TalismanPendingOutput | null;
}
export const emptyTalismanSave = (): TalismanSave => ({ version: 1, nextAttempt: 1, attempt: null, pendingOutput: null });

/** 旧档补默认，坏结果不重掷；读档中的 drawing 只能中断，永不补扣料或补奖。 */
export function normalizeTalismanSave(value: unknown, interruptDrawing = true): TalismanSave {
  const result = emptyTalismanSave();
  if (!record(value)) return result;
  if (positiveCount(value.nextAttempt)) result.nextAttempt = value.nextAttempt;
  const a = value.attempt;
  if (!record(a) || typeof a.attemptId !== 'string' || !a.attemptId || typeof a.recipeId !== 'string'
    || !['drawing', 'settled', 'interrupted'].includes(String(a.state))) return result;
  result.attempt = { attemptId: a.attemptId, recipeId: a.recipeId,
    state: a.state === 'drawing' && interruptDrawing ? 'interrupted' : a.state as TalismanAttempt['state'], result: null,
    craftEmitted: a.craftEmitted === true,
    ...(typeof a.lifeSkillExpGranted === 'boolean' ? { lifeSkillExpGranted: a.lifeSkillExpGranted } : {}) };
  const previousSequence = /^talisman_(\d+)$/.exec(a.attemptId)?.[1];
  if (previousSequence && positiveCount(Number(previousSequence)) && Number(previousSequence) < Number.MAX_SAFE_INTEGER) {
    result.nextAttempt = Math.max(result.nextAttempt, Number(previousSequence) + 1);
  }
  const r = a.result;
  if (record(r) && r.attemptId === a.attemptId && r.recipeId === a.recipeId && typeof r.item === 'string'
    && typeof r.success === 'boolean' && (r.quality === null || quality(r.quality))
    && (r.rawQuality === null || quality(r.rawQuality)) && typeof r.capApplied === 'boolean'
    && count(r.count) && probability(r.completion) && count(r.correct) && count(r.wrong) && count(r.timeouts)
    && count(r.total) && r.correct + r.wrong + r.timeouts === r.total && probability(r.rate)
    && (r.roll === null || probability(r.roll)) && typeof r.delivered === 'boolean'
    && (r.reason === undefined || ['completion', 'condense', 'interrupted'].includes(String(r.reason)))
    && (r.success ? r.count > 0 && (quality(r.quality) || r.quality === null) : r.count === 0 && r.quality === null)) {
    result.attempt.result = { ...r } as unknown as TalismanResult;
  }
  const pending = value.pendingOutput, settled = result.attempt.result;
  if (record(pending) && settled?.success && !settled.delivered && result.attempt.state === 'settled'
    && pending.attemptId === a.attemptId && pending.item === settled.item && pending.count === settled.count
    && pending.quality === settled.quality) {
    result.pendingOutput = { ...pending } as unknown as TalismanPendingOutput;
    // 任一凭据已提交经验时保留 true；旧结果没有标记也只领取，绝不追授。
    if (a.lifeSkillExpGranted === true || pending.lifeSkillExpGranted === true) {
      result.attempt.lifeSkillExpGranted = result.pendingOutput.lifeSkillExpGranted = true;
    } else if (typeof a.lifeSkillExpGranted === 'boolean') result.pendingOutput.lifeSkillExpGranted = a.lifeSkillExpGranted;
    else if (typeof pending.lifeSkillExpGranted === 'boolean') result.attempt.lifeSkillExpGranted = pending.lifeSkillExpGranted;
  }
  // 一份已确定但未入包的成功结果就是待领取凭据，不能因缺少冗余字段而遗失。
  else if (settled?.success && !settled.delivered && result.attempt.state === 'settled') {
    result.pendingOutput = { attemptId: a.attemptId, item: settled.item, count: settled.count, quality: settled.quality,
      ...(typeof a.lifeSkillExpGranted === 'boolean' ? { lifeSkillExpGranted: a.lifeSkillExpGranted } : {}) };
  }
  if (result.attempt.state === 'drawing' || result.attempt.state === 'interrupted') {
    result.attempt.result = null; result.attempt.craftEmitted = false; result.pendingOutput = null;
  }
  return result;
}

export interface TalismanHost {
  talisman: TalismanSave; learnedRecipes: string[]; level: number; realm: { id: string }; sect: string;
  readonly talismanLevel?: number; readonly talismanExp?: number; gainTalismanExp?(amount: number): number;
  count(item: string): number; removeItem(item: string, count: number): void;
  canAddCraftedItem(item: string, count: number): boolean;
  addCraftedItem(item: string, count: number, quality?: PillQuality): boolean;
  save(): boolean; runSaveTransaction<T>(apply: () => T | undefined): T | undefined;
}
export type TalismanBlock = 'closed' | 'busy' | 'pending' | 'unknown' | 'config' | 'unlearned' | 'level' | 'skill_level' | 'realm' | 'state' | 'materials' | 'bag_full' | 'save';
export interface TalismanCheck { ok: boolean; reason?: TalismanBlock; materials: { item: string; have: number; need: number }[] }
export interface TalismanRecipePreview {
  readonly recipeId: string; readonly successRate: number; readonly qualityDistribution: Readonly<Record<PillQuality, number>>;
  readonly allowed: boolean; readonly reason?: TalismanBlock; readonly outputCount: number; readonly minSkillLevel: number | null;
}
export interface TalismanOptions {
  context?: () => { inCombat?: boolean; inTrial?: boolean }; config?: unknown; report?: (message: string) => void;
}
export interface TalismanView {
  recipes: TalismanRecipe[]; selectedRecipe: TalismanRecipe | null; check: TalismanCheck;
  state: 'select' | 'drawing' | 'settled' | 'interrupted' | 'pending'; attempt: TalismanAttempt | null;
  draw: DrawStrokeView | null; result: TalismanResult | null; pendingOutput: TalismanPendingOutput | null;
  rate: number; sectBonus: number; qualityCap: PillQuality | null; configErrors: string[];
  buttons: { start: boolean; grind: boolean; again: boolean; abandon: boolean; close: boolean; continue: boolean };
}

/** 运行配置逐项校验，非法方保留错误信息但不能制作；研墨不借用制符概率。 */
export function readTalismanConfig(input: unknown = recipesRaw) {
  const recipes: Record<string, TalismanRecipe> = Object.create(null), errors: string[] = [], invalid = new Set<string>();
  let rules: TalismanRules | null = null;
  const fail = (id: string, field: string) => { invalid.add(id); errors.push(`[talisman config] ${id}: ${field}`); };
  if (!record(input)) { fail('rules.talisman', 'missing configuration'); return { recipes, rules, errors, invalid }; }
  const r = record(input.rules) ? input.rules.talisman : undefined;
  if (record(r) && probability(r.minCompletion) && probability(r.minRate) && probability(r.maxRate) && r.minRate <= r.maxRate
    && probability(r.lingfuSuccessBonus) && record(r.qualityMin) && record(r.qualityCap)
    && TALISMAN_QUALITIES.every(q => probability((r.qualityMin as Record<string, unknown>)[q]))
    && r.qualityMin.low === r.minCompletion && TALISMAN_QUALITIES.every((q, i) => !i || (r.qualityMin as Record<string, number>)[q] > (r.qualityMin as Record<string, number>)[TALISMAN_QUALITIES[i - 1]])
    && quality(r.qualityCap.lingfu) && quality(r.qualityCap.default)) rules = r as unknown as TalismanRules;
  else fail('rules.talisman', 'missing or invalid probabilities / quality thresholds / quality caps');
  if (!Array.isArray(input.recipes)) { fail('recipes', 'missing recipes'); return { recipes, rules, errors, invalid }; }
  for (const entry of input.recipes) {
    if (!record(entry) || !['talisman', 'grinding'].includes(String(entry.type)) || !inPhase(entry)) continue;
    const id = typeof entry.id === 'string' && entry.id ? entry.id : '(missing id)';
    if (['__proto__', 'constructor', 'prototype', '(missing id)'].includes(id)) { fail(id, 'invalid reserved recipe id'); continue; }
    if (recipes[id] || invalid.has(id)) { fail(id, 'duplicate recipe id'); delete recipes[id]; continue; }
    if (typeof entry.name !== 'string' || !entry.name || typeof entry.output !== 'string' || !Object.prototype.hasOwnProperty.call(ITEMS, entry.output)
      || !positiveCount(entry.outputCount) || !positiveCount(entry.reqLevel) || typeof entry.realm !== 'string' || !REALMS.some(realm => realm.id === entry.realm)
      || !Array.isArray(entry.materials) || !entry.materials.length
      || !entry.materials.every(m => record(m) && typeof m.item === 'string' && Object.prototype.hasOwnProperty.call(ITEMS, m.item) && positiveCount(m.count))
      || new Set(entry.materials.map(m => (m as Record<string, unknown>).item)).size !== entry.materials.length) { fail(id, 'invalid required recipe / output / materials / requirements'); continue; }
    if (entry.type === 'talisman' && ((ITEMS[entry.output as string] as unknown as Record<string, unknown>).qualityEnabled !== true
      || !rules || !probability(entry.baseRate) || !record(entry.draw)
      || !Array.isArray(entry.draw.strokes) || !entry.draw.strokes.length || !entry.draw.strokes.every(direction)
      || !finite(entry.draw.stepTimeMs) || entry.draw.stepTimeMs <= 0)) { fail(id, 'invalid rules / baseRate / draw'); continue; }
    recipes[id] = entry as unknown as TalismanRecipe;
  }
  return { recipes, rules, errors, invalid };
}

/** 所有付料、入包及任务事件经同一存档事务提交；结果按钮不发奖。 */
export class TalismanSystem {
  readonly config: ReturnType<typeof readTalismanConfig>;
  private draw: DrawStroke | null = null;
  private selected = '';
  private candidates = new Map<string, TalismanResult>();
  private startedLifeSkillLevel: number | null = null;
  constructor(private prog: TalismanHost, private quests?: { onCraft(item: string, count: number): void },
    public random: () => number = () => Math.random(), private options: TalismanOptions = {}) {
    this.config = readTalismanConfig(options.config ?? recipesRaw);
    if (featureEnabled('talismanCraft')) {
      // 关闭开关时保留的原始旧字段，在本次真正启用时才迁移。
      this.prog.talisman = normalizeTalismanSave(this.prog.talisman, false);
      this.config.errors.forEach(message => (options.report ?? console.error)(message));
      if (featureEnabled('lifeSkillCurve')) LIFE_SKILL_ERRORS.forEach(message => (options.report ?? console.error)(message));
      this.recover();
    }
    this.selected = prog.talisman?.attempt?.recipeId ?? Object.keys(this.config.recipes)[0] ?? '';
  }
  get active() { return this.prog.talisman.attempt?.state === 'drawing' ? this.prog.talisman.attempt : null; }
  get knownRecipes() { return Object.values(this.config.recipes).filter(recipe => this.prog.learnedRecipes.includes(recipe.id)); }
  rate(recipeId: string) { return this.rateAtLevel(recipeId, this.prog.talismanLevel); }
  private rateAtLevel(recipeId: string, level: number | undefined) {
    const recipe = this.config.recipes[recipeId], r = this.config.rules;
    if (!recipe || recipe.type !== 'talisman' || !r) return 0;
    if (featureEnabled('lifeSkillCurve') && (!LIFE_SKILLS || !this.curveReady(recipe) || !positiveCount(level))) return 0;
    const bonus = featureEnabled('lifeSkillCurve') ? lifeSkillLevel(LIFE_SKILLS!, 'talisman', level!).successBonus : 0;
    return Math.max(r.minRate, Math.min(r.maxRate, recipe.baseRate! + (this.prog.sect === 'lingfu' ? r.lingfuSuccessBonus : 0) + bonus));
  }
  check(recipeId: string): TalismanCheck {
    const recipe = this.config.recipes[recipeId];
    const materials = (recipe?.materials ?? []).map(m => ({ item: m.item, have: this.prog.count(m.item), need: m.count }));
    const context = this.options.context?.() ?? {};
    let reason: TalismanBlock | undefined;
    if (!featureEnabled('talismanCraft')) reason = 'closed';
    else if (this.prog.talisman.pendingOutput) reason = 'pending';
    else if (this.active) reason = 'busy';
    else if (this.config.invalid.has(recipeId)) reason = 'config';
    else if (!recipe) reason = 'unknown';
    else if (featureEnabled('lifeSkillCurve') && !this.curveReady(recipe)) reason = 'config';
    else if (!this.prog.learnedRecipes.includes(recipeId)) reason = 'unlearned';
    else if (this.prog.level < recipe.reqLevel) reason = 'level';
    else if (featureEnabled('lifeSkillCurve') && this.prog.talismanLevel! < lifeSkillRecipe(LIFE_SKILLS!, 'talisman', recipe)!.minSkillLevel) reason = 'skill_level';
    else if (REALMS.findIndex(r => r.id === this.prog.realm.id) < REALMS.findIndex(r => r.id === recipe.realm)) reason = 'realm';
    else if (context.inCombat || context.inTrial) reason = 'state';
    else if (materials.some(m => !finite(m.have) || m.have < m.need)) reason = 'materials';
    else if (!this.prog.canAddCraftedItem(recipe.output, this.outputCount(recipe))) reason = 'bag_full';
    return { ok: !reason, reason, materials };
  }
  start(recipeId: string, now = 0): TalismanCheck & { attempt?: TalismanAttempt } {
    const check = this.check(recipeId), recipe = this.config.recipes[recipeId];
    if (!check.ok) return check;
    if (recipe.type === 'grinding') return this.grind(recipeId);
    if (!finite(now)) return { ...check, ok: false, reason: 'state' };
    const attempt = this.prog.runSaveTransaction(() => this.begin(recipe));
    if (!attempt) return { ...check, ok: false, reason: 'save' };
    this.startedLifeSkillLevel = featureEnabled('lifeSkillCurve') ? this.prog.talismanLevel! : null;
    this.selected = recipeId; this.draw = new DrawStroke('craft', recipe.draw!.strokes, recipe.draw!.stepTimeMs, now);
    return { ...check, attempt };
  }
  grind(recipeId = 'recipe_spirit_ink'): TalismanCheck & { result?: TalismanResult } {
    const check = this.check(recipeId), recipe = this.config.recipes[recipeId];
    if (!check.ok) return check;
    if (recipe.type !== 'grinding') return { ...check, ok: false, reason: 'unknown' };
    const result = this.prog.runSaveTransaction(() => {
      const attempt = this.begin(recipe);
      const result: TalismanResult = { attemptId: attempt.attemptId, recipeId, item: recipe.output, success: true,
        quality: null, rawQuality: null, capApplied: false, count: recipe.outputCount, completion: 1,
        correct: 0, wrong: 0, timeouts: 0, total: 0, rate: 1, roll: null, delivered: false };
      this.commitResult(attempt, result); return result;
    });
    if (!result) return { ...check, ok: false, reason: 'save' };
    this.selected = recipeId; this.draw = null; return { ...check, result };
  }
  input(down: readonly TalismanDirection[], now: number, frame?: number): TalismanResult | null {
    if (!featureEnabled('talismanCraft') || !this.active || !this.draw) return null;
    this.draw.input(down, now, frame); return this.draw.done ? this.settle(this.active.attemptId) : null;
  }
  advance(now: number, frame?: number): TalismanResult | null {
    if (!featureEnabled('talismanCraft')) return null;
    if (!this.active || !this.draw) { this.claimPending(); return null; }
    this.draw.advance(now, frame); return this.draw.done ? this.settle(this.active.attemptId) : null;
  }
  pause(now?: number) { if (featureEnabled('talismanCraft')) this.draw?.pause(now); }
  resume(now?: number) { if (featureEnabled('talismanCraft')) this.draw?.resume(now); }
  settle(attemptId: string): TalismanResult | null {
    const attempt = this.active;
    if (!featureEnabled('talismanCraft') || !attempt || attempt.attemptId !== attemptId || !this.draw?.done) return null;
    if (featureEnabled('lifeSkillCurve') && !this.curveReady(this.config.recipes[attempt.recipeId])) return null;
    let result = this.candidates.get(attemptId);
    if (!result) {
      const recipe = this.config.recipes[attempt.recipeId], r = this.config.rules!, d = this.draw.view();
      const completion = d.correct / d.total, craftLevel = this.startedLifeSkillLevel ?? this.prog.talismanLevel;
      const rate = this.rateAtLevel(recipe.id, craftLevel);
      const roll = completion < r.minCompletion ? null : this.random();
      // 非法随机源不能产生默认必成；合法源仅调用一次且严格 r < p。
      const success = roll !== null && probability(roll) && roll < 1 && roll < rate;
      const rawQuality = success ? [...TALISMAN_QUALITIES].reverse().find(q => completion >= r.qualityMin[q])! : null;
      const cap = this.prog.sect === 'lingfu' ? r.qualityCap.lingfu : r.qualityCap.default;
      const finalQuality = rawQuality && TALISMAN_QUALITIES.indexOf(rawQuality) > TALISMAN_QUALITIES.indexOf(cap) ? cap : rawQuality;
      result = { attemptId, recipeId: recipe.id, item: recipe.output, success, quality: finalQuality,
        rawQuality, capApplied: rawQuality !== finalQuality, count: success ? this.outputCount(recipe, craftLevel) : 0,
        completion, correct: d.correct, wrong: d.wrong, timeouts: d.timeouts, total: d.total, rate,
        roll: roll !== null && probability(roll) && roll < 1 ? roll : null, delivered: false,
        ...(!success ? { reason: completion < r.minCompletion ? 'completion' as const : 'condense' as const } : {}) };
      this.candidates.set(attemptId, result);
    }
    const committed = this.prog.runSaveTransaction(() => { this.commitResult(this.prog.talisman.attempt!, { ...result! }); return this.prog.talisman.attempt!.result!; });
    if (!committed) return null;
    this.candidates.delete(attemptId); this.draw = null; this.startedLifeSkillLevel = null; return committed;
  }
  abandon() {
    if (!featureEnabled('talismanCraft') || !this.active) return false;
    const committed = this.prog.runSaveTransaction(() => {
      const attempt = this.prog.talisman.attempt!; attempt.state = 'interrupted'; attempt.result = null;
      return true;
    });
    if (committed) { this.draw = null; this.candidates.clear(); }
    return !!committed;
  }
  again(now = 0) { return this.start(this.selected, now); }
  close(confirmAbandon = false) { return this.active ? confirmAbandon && this.abandon() : true; }
  /** 读档后调用，已确定的结果只领取，不重跑判率。 */
  recover() {
    if (!featureEnabled('talismanCraft')) return false;
    let changed = false;
    if (this.active) changed = !!this.prog.runSaveTransaction(() => {
      this.prog.talisman.attempt!.state = 'interrupted'; this.prog.talisman.attempt!.result = null; return true;
    });
    return this.claimPending() || changed;
  }
  claimPending() {
    if (!featureEnabled('talismanCraft')) return false;
    const pending = this.prog.talisman.pendingOutput, attempt = this.prog.talisman.attempt;
    if (!pending || !attempt || attempt.attemptId !== pending.attemptId || attempt.state !== 'settled'
      || !attempt.result?.success || attempt.result.delivered || !this.prog.canAddCraftedItem(pending.item, pending.count)) return false;
    return !!this.prog.runSaveTransaction(() => {
      if (!this.prog.addCraftedItem(pending.item, pending.count, pending.quality ?? undefined)) return undefined;
      const current = this.prog.talisman.attempt!;
      current.result!.delivered = true; this.prog.talisman.pendingOutput = null;
      this.emitCraft(current); return true;
    });
  }
  /** 指定完成度后的条件成功品质分布；品质仍只由笔画与宗门上限决定。 */
  preview(recipeId: string, completion = 1): TalismanRecipePreview {
    const recipe = this.config.recipes[recipeId], check = this.check(recipeId), r = this.config.rules;
    const qualityDistribution: Record<PillQuality, number> = { low: 0, mid: 0, high: 0, supreme: 0 };
    const qualified = probability(completion) && !!r && completion >= r.minCompletion;
    if (qualified && recipe?.type === 'talisman') {
      const raw = [...TALISMAN_QUALITIES].reverse().find(q => completion >= r!.qualityMin[q])!;
      const cap = this.prog.sect === 'lingfu' ? r!.qualityCap.lingfu : r!.qualityCap.default;
      qualityDistribution[TALISMAN_QUALITIES[Math.min(TALISMAN_QUALITIES.indexOf(raw), TALISMAN_QUALITIES.indexOf(cap))]] = 1;
    }
    const mapping = featureEnabled('lifeSkillCurve') && LIFE_SKILLS && recipe ? lifeSkillRecipe(LIFE_SKILLS, 'talisman', recipe) : null;
    return Object.freeze({ recipeId, successRate: recipe?.type === 'grinding' ? 1 : qualified ? this.rate(recipeId) : 0,
      qualityDistribution: Object.freeze(qualityDistribution), allowed: check.ok, reason: check.reason,
      outputCount: recipe && (!featureEnabled('lifeSkillCurve') || this.curveReady(recipe)) ? this.outputCount(recipe) : 0,
      minSkillLevel: mapping?.minSkillLevel ?? (featureEnabled('lifeSkillCurve') ? null : 1) });
  }
  view(recipeId = this.selected): TalismanView {
    const recipe = this.config.recipes[recipeId] ?? null;
    if (recipe && !this.active) this.selected = recipeId;
    const attempt = this.prog.talisman.attempt, check = this.check(recipeId), rules = this.config.rules;
    const state = this.prog.talisman.pendingOutput ? 'pending' : attempt?.state ?? 'select';
    return { recipes: Object.values(this.config.recipes), selectedRecipe: recipe, check, state, attempt,
      draw: this.draw?.view() ?? null, result: attempt?.result ?? null, pendingOutput: this.prog.talisman.pendingOutput,
      rate: this.rate(recipeId), sectBonus: this.prog.sect === 'lingfu' ? rules?.lingfuSuccessBonus ?? 0 : 0,
      qualityCap: rules ? this.prog.sect === 'lingfu' ? rules.qualityCap.lingfu : rules.qualityCap.default : null,
      configErrors: [...this.config.errors, ...(featureEnabled('lifeSkillCurve') ? this.curveErrors(recipe) : [])], buttons: { start: check.ok && recipe?.type === 'talisman',
        grind: check.ok && recipe?.type === 'grinding', again: check.ok && !!attempt,
        abandon: !!this.active, close: !this.active, continue: !!this.active } };
  }
  private begin(recipe: TalismanRecipe): TalismanAttempt {
    for (const m of recipe.materials) this.prog.removeItem(m.item, m.count);
    const attempt: TalismanAttempt = { attemptId: `talisman_${this.prog.talisman.nextAttempt++}`, recipeId: recipe.id,
      state: 'drawing', result: null, craftEmitted: false,
      ...(featureEnabled('lifeSkillCurve') ? { lifeSkillExpGranted: false } : {}) };
    this.prog.talisman.attempt = attempt; this.prog.talisman.pendingOutput = null; return attempt;
  }
  private commitResult(attempt: TalismanAttempt, result: TalismanResult) {
    attempt.state = 'settled'; attempt.result = result;
    if (featureEnabled('lifeSkillCurve') && !attempt.lifeSkillExpGranted) {
      const recipe = this.config.recipes[attempt.recipeId];
      if (!this.curveReady(recipe)) throw new Error('[life skills config] talisman settlement unavailable');
      const exp = recipe.type === 'talisman' ? lifeSkillExperience(LIFE_SKILLS!, 'talisman', recipe, 'talisman', result.success,
        result.completion >= this.config.rules!.minCompletion) : 0;
      // 结果、经验及去重标记同事务落盘；领取和恢复都不再调用经验接口。
      if (exp > 0) this.prog.gainTalismanExp!(exp);
      attempt.lifeSkillExpGranted = true;
    }
    if (!result.success) return;
    if (this.prog.canAddCraftedItem(result.item, result.count)
      && this.prog.addCraftedItem(result.item, result.count, result.quality ?? undefined)) {
      result.delivered = true; this.emitCraft(attempt);
    } else this.prog.talisman.pendingOutput = { attemptId: attempt.attemptId, item: result.item, count: result.count, quality: result.quality,
      ...(typeof attempt.lifeSkillExpGranted === 'boolean' ? { lifeSkillExpGranted: attempt.lifeSkillExpGranted } : {}) };
  }
  private curveReady(recipe: TalismanRecipe | undefined) {
    return !!LIFE_SKILLS && !!recipe && positiveCount(this.prog.talismanLevel)
      && this.prog.talismanLevel <= LIFE_SKILLS.curve.maxLevel && count(this.prog.talismanExp)
      && typeof this.prog.gainTalismanExp === 'function' && !!lifeSkillRecipe(LIFE_SKILLS, 'talisman', recipe);
  }
  private curveErrors(recipe: TalismanRecipe | null) {
    if (!LIFE_SKILLS) return [...LIFE_SKILL_ERRORS];
    if (recipe && !this.curveReady(recipe)) return [`[life skills config] talisman: invalid progress or unregistered recipe ${recipe.id}`];
    return [];
  }
  private outputCount(recipe: TalismanRecipe, level = this.prog.talismanLevel) {
    if (!featureEnabled('lifeSkillCurve') || recipe.type === 'grinding') return recipe.outputCount;
    // levels 是计算源，与技能全局项由导入校验保证一致，禁止重复叠加。
    const bonus = lifeSkillLevel(LIFE_SKILLS!, 'talisman', level!).outputBonusRate;
    return Math.floor(recipe.outputCount * (1 + bonus));
  }
  private emitCraft(attempt: TalismanAttempt) {
    if (attempt.craftEmitted || !attempt.result?.success || !attempt.result.delivered) return;
    this.quests?.onCraft(attempt.result.item, attempt.result.count); attempt.craftEmitted = true;
  }
}
