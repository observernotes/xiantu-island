import {
  evaluateEncounterEligibility, parseEncountersConfig, settleEncounterOutcome,
  type EncounterContext, type EncounterDefinition, type EncounterSave, type EncountersConfig,
} from './Encounter';

type Fields = Record<string, unknown>;
export interface EncounterRunnerPacing {
  readonly baseChancePerMapEnter: number;
  readonly luckBonusPerPoint: number;
  readonly sageAdviceChancePerMeditationMin: number;
  readonly maxPerMapEnter: number;
}
/** commit 必须一次提交整份快照；false/抛错时不得改变 read() 返回的存档。 */
export interface EncounterRunnerStore {
  read(): EncounterSave;
  commit(next: EncounterSave): boolean;
}
export interface EncounterRunnerContext extends EncounterContext {
  /** 只接受气运接口的显式值；接口未接时缺省为零。 */
  readonly luck?: number;
  /** 主线演出、首领登场、突破及试炼等互斥窗口。 */
  readonly blocked?: boolean;
}
export interface EncounterVisit {
  id: string; map: string; entryChecked: boolean; budgetUsed: number;
  selectedId: string | null; meditationElapsedMs: number;
}
export interface EncounterActive {
  attemptId: string; encounterId: string; parentMap: string; stepId: string;
  choiceId?: string; locals: Fields; costApplied: boolean; pendingOutcome?: string;
}
export interface EncounterRunnerOffer {
  readonly encounterId: string; readonly attemptId: string; readonly stepId: string;
  readonly config: EncountersConfig;
}
export interface EncounterRunnerResult {
  readonly status: 'idle' | 'offered' | 'advanced' | 'settled' | 'rejected' | 'duplicate' | 'deferred';
  readonly offer?: EncounterRunnerOffer;
  readonly encounterId?: string; readonly attemptId?: string; readonly outcomeId?: string; readonly reason?: string;
}
export interface EncounterMeditationTick {
  readonly meditating: boolean; readonly atAnchor: boolean;
  readonly interrupted?: boolean; readonly paused?: boolean;
}
export interface EncounterRunnerChoice {
  readonly attemptId: string; readonly encounterId: string; readonly stepId: string; readonly choiceId: string;
}
interface RuntimeState extends Fields {
  version: number; seen: string[]; resolved: Record<string, string>; cooldownUntil: Record<string, number>;
  settledAttempts: string[]; visit: EncounterVisit | null; active: EncounterActive | null;
}
interface Draft { save: EncounterSave; state: RuntimeState }
interface PendingCommit { key: string; before: string; save: EncounterSave; result: EncounterRunnerResult }
const record = (v: unknown): v is Fields => !!v && typeof v === 'object' && !Array.isArray(v)
  && [Object.prototype, null].includes(Object.getPrototypeOf(v));
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const count = (v: unknown): v is number => finite(v) && Number.isSafeInteger(v) && v >= 0;
const text = (v: unknown): v is string => typeof v === 'string' && v.trim().length > 0;
const safe = (v: unknown): v is string => text(v) && !['__proto__', 'prototype', 'constructor'].includes(v);
const strings = (v: unknown): v is string[] => Array.isArray(v) && v.every(safe);
const clamp = (v: number) => Math.max(0, Math.min(1, v));
const rejected = (reason: string): EncounterRunnerResult => ({ status: 'rejected', reason });
const idle = (): EncounterRunnerResult => ({ status: 'idle' });

/**
 * 唯一的抽签与脚本写入口。概率、visit、占额、冷却、节点、扣料和结局均先在深克隆上计算，
 * 只通过 store.commit 发布；保存失败保留本次抽签草稿，重试不会重新掷骰。
 * Runtime 的实体战斗/机关执行器或 fixture 通过受信 completeChallenge 回报，advance 绝不代判胜。
 */
export class EncounterRunner {
  private readonly config: EncountersConfig | null;
  private readonly pacingValid: boolean;
  private pending?: PendingCommit;
  private readonly ownedAttempts = new Set<string>();
  private readonly draws = new Map<string, number[]>();
  private operationKey = '';
  private rollIndex = 0;

  constructor(config: EncountersConfig | null, private readonly pacing: EncounterRunnerPacing,
    private readonly store: EncounterRunnerStore, private readonly rng: () => number = Math.random) {
    this.config = config === null ? null : parseEncountersConfig(config).config;
    this.pacingValid = record(pacing) && finite(pacing.baseChancePerMapEnter) && finite(pacing.luckBonusPerPoint)
      && pacing.luckBonusPerPoint >= 0 && finite(pacing.sageAdviceChancePerMeditationMin)
      && count(pacing.maxPerMapEnter) && pacing.maxPerMapEnter > 0;
  }

  private enabled() { return this.config?.encounters.some(row => row.enabled) === true; }
  private definition(id: string) { return this.config?.encounters.find(row => row.id === id && row.enabled); }
  private validContext(ctx: EncounterRunnerContext) {
    return record(ctx) && text(ctx.mapId) && count(ctx.nowMs) && count(ctx.level)
      && (ctx.luck === undefined || finite(ctx.luck));
  }

  private read(): Draft {
    const save = structuredClone(this.store.read());
    if (!record(save)) throw new Error('invalid_save');
    // 验证所有 runner 使用的计数；未知游戏字段原样保留给 Progress 的完整校验。
    for (const key of ['exp', 'stones']) if (save[key] !== undefined && !count(save[key])) throw new Error('invalid_save');
    if (save.daoHeart !== undefined && (!count(save.daoHeart) || save.daoHeart > 100)) throw new Error('invalid_save');
    if (save.morality !== undefined && (!finite(save.morality) || !Number.isSafeInteger(save.morality)
      || save.morality < -100 || save.morality > 100)) throw new Error('invalid_save');
    if (save.inventory !== undefined && (!record(save.inventory)
      || Object.entries(save.inventory).some(([id, n]) => !safe(id) || !count(n)))) throw new Error('invalid_save');
    const source = save.encounters;
    if (source !== undefined && !record(source)) throw new Error('invalid_state');
    const raw = source ?? {};
    for (const key of ['seen', 'settledAttempts', 'hooksApplied']) {
      if (raw[key] !== undefined && !strings(raw[key])) throw new Error('invalid_state');
    }
    for (const key of ['resolved', 'cooldownUntil']) {
      if (raw[key] !== undefined && (!record(raw[key]) || Object.entries(raw[key]).some(([id, value]) =>
        !safe(id) || (key === 'resolved' ? !safe(value) : !count(value))))) throw new Error('invalid_state');
    }
    if (raw.version !== undefined && raw.version !== 1) throw new Error('invalid_state');
    if (raw.visit !== undefined && raw.visit !== null) {
      const visit = raw.visit;
      if (!record(visit) || !safe(visit.id) || !safe(visit.map) || typeof visit.entryChecked !== 'boolean'
        || !count(visit.budgetUsed) || !(visit.selectedId === null || safe(visit.selectedId))
        || !finite(visit.meditationElapsedMs) || visit.meditationElapsedMs < 0) throw new Error('invalid_visit');
    }
    if (raw.active !== undefined && raw.active !== null) {
      const a = raw.active, row = record(a) && safe(a.encounterId) ? this.definition(a.encounterId) : undefined;
      if (!record(a) || !safe(a.attemptId) || !row || !safe(a.parentMap) || !row.maps.includes(a.parentMap)
        || !safe(a.stepId) || !row.script.steps.some(step => step.id === a.stepId) || !record(a.locals)
        || typeof a.costApplied !== 'boolean' || (a.choiceId !== undefined && !row.choices.some(choice => choice.id === a.choiceId))
        || (a.pendingOutcome !== undefined && !row.outcomes.some(outcome => outcome.id === a.pendingOutcome))) throw new Error('invalid_active');
      if (raw.visit === undefined || raw.visit === null || !record(raw.visit) || raw.visit.map !== a.parentMap
        || raw.visit.selectedId !== a.encounterId || !count(raw.visit.budgetUsed) || raw.visit.budgetUsed < 1
        || (Array.isArray(raw.settledAttempts) && raw.settledAttempts.includes(a.attemptId))) throw new Error('invalid_active');
    }
    const state = { ...raw, version: 1, seen: raw.seen ?? [], resolved: raw.resolved ?? {},
      cooldownUntil: raw.cooldownUntil ?? {}, settledAttempts: raw.settledAttempts ?? [], visit: raw.visit ?? null,
      active: raw.active ?? null } as RuntimeState;
    const next = { ...save, encounters: state };
    // 同时拒绝循环/不可序列化存档；不让 structuredClone 支持但 JSON 保存不支持的值过关。
    JSON.stringify(next);
    return { save: next, state };
  }

  private mutate(key: string, operation: (draft: Draft) => EncounterRunnerResult): EncounterRunnerResult {
    if (!this.enabled()) return idle();
    if (!this.pacingValid) return rejected('invalid_pacing');
    try {
      if (this.pending) {
        if (this.pending.key !== key) return rejected('pending_save');
        if (JSON.stringify(this.store.read()) !== this.pending.before) {
          // 外部背包/成长已改变：丢弃旧快照，下次基于新档重算；保留随机数，不重掷。
          this.pending = undefined;
          return rejected('stale_save');
        }
        return this.commitPending();
      }
      this.operationKey = key; this.rollIndex = 0;
      const before = JSON.stringify(this.store.read());
      const draft = this.read();
      const result = operation(draft);
      if (['rejected', 'duplicate'].includes(result.status)) return result;
      if (JSON.stringify(draft.save) === before) { this.draws.delete(key); return result; }
      this.pending = { key, before, save: draft.save, result };
      return this.commitPending();
    } catch (error) { return rejected(error instanceof Error ? error.message : 'invalid_save'); }
  }

  private commitPending(): EncounterRunnerResult {
    const pending = this.pending!;
    let saved = false;
    try { saved = this.store.commit(structuredClone(pending.save)) === true; } catch { /* 保留同一草稿以便重试。 */ }
    if (!saved) return { status: 'deferred', reason: 'save' };
    this.pending = undefined;
    this.draws.delete(pending.key);
    const active = (pending.save.encounters as RuntimeState).active;
    if (active) this.ownedAttempts.add(active.attemptId);
    return pending.result;
  }

  /** 重试已经确认过的同一事务；没有待保存事务时不读存档，也不消费随机数。 */
  retryPending(): EncounterRunnerResult {
    if (!this.pending) return idle();
    return this.mutate(this.pending.key, () => idle());
  }

  private offerFrom(state: RuntimeState): EncounterRunnerOffer | undefined {
    const active = state.active;
    if (!active || !this.config) return;
    const row = this.definition(active.encounterId);
    if (!row || (row.trigger.reveal === 'spirit_scan' && active.locals.revealed !== true)) return;
    return Object.freeze({ encounterId: row.id, attemptId: active.attemptId, stepId: active.stepId, config: this.config });
  }
  offer(): EncounterRunnerOffer | undefined {
    if (!this.enabled()) return;
    try { return this.offerFrom(this.read().state); } catch { return; }
  }
  private activeResult(state: RuntimeState, status: 'offered' | 'advanced' = 'offered'): EncounterRunnerResult {
    const active = state.active;
    if (!active) return idle();
    const offer = this.offerFrom(state);
    return { status, encounterId: active.encounterId, attemptId: active.attemptId, offer,
      ...(offer ? {} : { reason: 'hidden' }) };
  }

  private roll(): number {
    const cached = this.draws.get(this.operationKey) ?? [];
    const index = this.rollIndex++;
    if (index < cached.length) return cached[index];
    const value = this.rng();
    if (!finite(value) || value < 0 || value >= 1) throw new Error('invalid_rng');
    cached.push(value); this.draws.set(this.operationKey, cached);
    return value;
  }
  private candidates(ctx: EncounterRunnerContext, draft: Draft, type: string) {
    return this.config!.encounters.filter(row => row.trigger.type === type
      && evaluateEncounterEligibility(this.config, row.id, { ...ctx, save: draft.save }).eligible);
  }
  private draw(ctx: EncounterRunnerContext, draft: Draft, rows: readonly EncounterDefinition[], mapEnter: boolean) {
    if (!rows.length) return idle();
    const chanceRef = mapEnter ? 'baseChancePerMapEnter' : 'sageAdviceChancePerMeditationMin';
    if (rows.some(row => row.trigger.chanceRef !== chanceRef)) return rejected('invalid_chance_ref');
    const chance = clamp(this.pacing[chanceRef] + (mapEnter ? (ctx.luck ?? 0) * this.pacing.luckBonusPerPoint : 0));
    if (this.roll() >= chance) return idle();
    const total = rows.reduce((sum, row) => sum + row.weight, 0);
    if (!finite(total) || total <= 0) return rejected('invalid_weight');
    let selected = rows[rows.length - 1], cursor = this.roll() * total;
    for (const row of rows) { cursor -= row.weight; if (cursor < 0) { selected = row; break; } }
    const state = draft.state, visit = state.visit!;
    const attemptId = `${visit.id}:${selected.id}:${visit.budgetUsed + 1}`;
    if (state.settledAttempts.includes(attemptId)) return rejected('duplicate_attempt');
    const until = ctx.nowMs + selected.cooldownMs;
    if (!count(until)) return rejected('invalid_context');
    visit.budgetUsed += 1; visit.selectedId = selected.id; visit.meditationElapsedMs = 0;
    state.cooldownUntil[selected.id] = Math.max(state.cooldownUntil[selected.id] ?? 0, until);
    const revealed = selected.trigger.reveal !== 'spirit_scan';
    state.active = { attemptId, encounterId: selected.id, parentMap: ctx.mapId, stepId: selected.script.start,
      costApplied: false, locals: { revealed } };
    return this.activeResult(state);
  }

  enter(ctx: EncounterRunnerContext, visitId: string): EncounterRunnerResult {
    return this.mutate(`enter:${visitId}`, draft => {
      if (!this.validContext(ctx) || !safe(visitId)) return rejected('invalid_context');
      let visit = draft.state.visit;
      if (visit?.id === visitId && visit.map !== ctx.mapId) return rejected('visit_map_mismatch');
      if (!visit || visit.id !== visitId) {
        if (draft.state.active) {
          const ended = this.settle(draft, ctx.nowMs, 'missed');
          if (ended.status !== 'settled') return ended;
        }
        visit = { id: visitId, map: ctx.mapId, entryChecked: false, budgetUsed: 0, selectedId: null, meditationElapsedMs: 0 };
        draft.state.visit = visit;
      } else if (draft.state.active) {
        const active = draft.state.active, step = this.definition(active.encounterId)!.script.steps.find(step => step.id === active.stepId)!;
        // 实体/机关进度仅存本次 Runtime，刷新不能重建旧波次，安全结束；本实例重入不误判。
        if (!this.ownedAttempts.has(active.attemptId) && ['battle', 'puzzle', 'scene'].includes(String(step.type))) {
          return this.settle(draft, ctx.nowMs, 'failed');
        }
        if (ctx.blocked) return { status: 'deferred', reason: 'blocked' };
        return this.activeResult(draft.state);
      }
      if (visit.entryChecked || visit.budgetUsed >= this.pacing.maxPerMapEnter) return idle();
      if (ctx.blocked) {
        // 先保存未检查的 visit；演出结束后以同一 visit 调用 enter，仍只抽一次。
        return { status: 'deferred', reason: 'blocked' };
      }
      visit.entryChecked = true;
      return this.draw(ctx, draft, this.candidates(ctx, draft, 'map_enter'), true);
    });
  }

  tick(ctx: EncounterRunnerContext, deltaMs: number, flags: EncounterMeditationTick): EncounterRunnerResult {
    if (!this.enabled()) return idle();
    return this.mutate(`tick:${ctx.mapId}`, draft => {
      if (!this.validContext(ctx) || !finite(deltaMs) || deltaMs < 0 || !record(flags)) return rejected('invalid_context');
      const visit = draft.state.visit;
      if (!visit || visit.map !== ctx.mapId) return rejected('missing_visit');
      if (draft.state.active || visit.budgetUsed >= this.pacing.maxPerMapEnter) return idle();
      if (!flags.meditating || !flags.atAnchor || flags.interrupted || ctx.blocked) {
        visit.meditationElapsedMs = 0; return idle();
      }
      if (flags.paused) return idle();
      const rows = this.candidates(ctx, draft, 'meditation_tick');
      if (!rows.length) { visit.meditationElapsedMs = 0; return idle(); }
      const interval = rows[0].trigger.intervalMs;
      if (!count(interval) || interval < 1 || rows.some(row => row.trigger.intervalMs !== interval)) return rejected('invalid_interval');
      visit.meditationElapsedMs += deltaMs;
      if (visit.meditationElapsedMs < interval) return idle();
      // 单帧最多抽一次，并丢弃超额时间；后台/离线不得补掷。
      visit.meditationElapsedMs = 0;
      return this.draw(ctx, draft, rows, false);
    });
  }

  private checkAction(ctx: EncounterRunnerContext, draft: Draft, attemptId: string, stepId?: string): EncounterRunnerResult | undefined {
    if (!this.validContext(ctx)) return rejected('invalid_context');
    if (draft.state.settledAttempts.includes(attemptId)) return { status: 'duplicate', attemptId, reason: 'duplicate_attempt' };
    const a = draft.state.active;
    if (!a || a.attemptId !== attemptId) return rejected('stale_attempt');
    if (stepId !== undefined && a.stepId !== stepId) return rejected('stale_step');
    if (ctx.mapId !== a.parentMap) return rejected('map');
    if (ctx.blocked) return { status: 'deferred', reason: 'blocked' };
    if (!this.offerFrom(draft.state)) return rejected('hidden');
  }
  private move(draft: Draft, nowMs: number, next: unknown): EncounterRunnerResult {
    const active = draft.state.active!, row = this.definition(active.encounterId)!;
    const step = row.script.steps.find(step => step.id === next);
    if (!step) return rejected('missing_step');
    active.stepId = String(step.id);
    if (step.type === 'finish') {
      if (!text(step.outcomeId)) return rejected('missing_outcome');
      active.pendingOutcome = step.outcomeId;
      return this.settle(draft, nowMs, step.outcomeId);
    }
    return this.activeResult(draft.state, 'advanced');
  }
  private settle(draft: Draft, nowMs: number, outcomeId: string): EncounterRunnerResult {
    const a = draft.state.active;
    if (!a) return rejected('stale_attempt');
    const result = settleEncounterOutcome(this.config, a.encounterId, outcomeId, draft.save,
      { attemptId: a.attemptId, nowMs, karmaReady: false });
    if (result.status !== 'settled') return rejected(result.reason);
    const next = structuredClone(result.save), state = next.encounters as RuntimeState;
    state.active = null;
    if (state.visit) state.visit.meditationElapsedMs = 0;
    draft.save = next; draft.state = state;
    return { status: 'settled', encounterId: a.encounterId, attemptId: a.attemptId, outcomeId };
  }

  advance(ctx: EncounterRunnerContext, attemptId: string, stepId: string): EncounterRunnerResult {
    return this.mutate(`advance:${attemptId}:${stepId}`, draft => {
      const invalid = this.checkAction(ctx, draft, attemptId, stepId); if (invalid) return invalid;
      const a = draft.state.active!, row = this.definition(a.encounterId)!, step = row.script.steps.find(step => step.id === a.stepId)!;
      if (a.stepId === row.script.start && finite(row.req.daoHeartMax)
        && (!count(draft.save.daoHeart) || draft.save.daoHeart > row.req.daoHeartMax)) return this.settle(draft, ctx.nowMs, 'missed');
      if (step.type === 'finish') return text(step.outcomeId) ? this.settle(draft, ctx.nowMs, step.outcomeId) : rejected('missing_outcome');
      if (!['dialog', 'interact'].includes(String(step.type))) return rejected('unsupported_step');
      return this.move(draft, ctx.nowMs, step.next);
    });
  }
  choose(ctx: EncounterRunnerContext, action: EncounterRunnerChoice): EncounterRunnerResult {
    if (!this.enabled()) return idle();
    return this.mutate(`choose:${action.attemptId}:${action.stepId}:${action.choiceId}`, draft => {
      const invalid = this.checkAction(ctx, draft, action.attemptId, action.stepId); if (invalid) return invalid;
      const a = draft.state.active!;
      if (a.encounterId !== action.encounterId) return rejected('stale_attempt');
      const row = this.definition(a.encounterId)!, step = row.script.steps.find(step => step.id === a.stepId)!;
      if (step.type !== 'choice' || !Array.isArray(step.choiceIds) || !step.choiceIds.includes(action.choiceId)) return rejected('unreachable_choice');
      // 拒绝不做抵抗判定；接受不能利用抽中后改变道心绕过低语门槛。
      if (action.choiceId === 'accept' && finite(row.req.daoHeartMax)
        && (!count(draft.save.daoHeart) || draft.save.daoHeart > row.req.daoHeartMax)) return this.settle(draft, ctx.nowMs, 'missed');
      const choice = row.choices.find(choice => choice.id === action.choiceId);
      if (!choice) return rejected('missing_choice');
      const inventory = { ...draft.save.inventory };
      const items = (value: unknown): Map<string, number> | null => {
        if (value === undefined) return new Map();
        if (!record(value) || (value.items !== undefined && !Array.isArray(value.items))) return null;
        const result = new Map<string, number>();
        for (const item of (value.items ?? []) as unknown[]) {
          if (!record(item) || !safe(item.item) || !count(item.count) || item.count < 1) return null;
          const total = (result.get(item.item) ?? 0) + item.count;
          if (!count(total)) return null;
          result.set(item.item, total);
        }
        return result;
      };
      const req = items(choice.req), cost = items(choice.cost);
      if (!req || !cost) return rejected('invalid_items');
      for (const [id, n] of req) if ((inventory[id] ?? 0) < n) return rejected('missing_item');
      if (cost.size) {
        if (a.costApplied) return rejected('cost_already_applied');
        for (const [id, n] of cost) if ((inventory[id] ?? 0) < n) return rejected('missing_item');
        for (const [id, n] of cost) inventory[id] = (inventory[id] ?? 0) - n;
        draft.save = { ...draft.save, inventory }; a.costApplied = true;
      }
      a.choiceId = action.choiceId;
      return this.move(draft, ctx.nowMs, choice.next);
    });
  }

  terminate(ctx: EncounterRunnerContext, outcome: 'missed' | 'failed'): EncounterRunnerResult {
    return this.mutate(`terminate:${outcome}`, draft => {
      if (!this.validContext(ctx) || !['missed', 'failed'].includes(outcome)) return rejected('invalid_context');
      if (!draft.state.active) return idle();
      return this.settle(draft, ctx.nowMs, outcome);
    });
  }
  reveal(ctx: EncounterRunnerContext, attemptId: string): EncounterRunnerResult {
    return this.mutate(`reveal:${attemptId}`, draft => {
      if (!this.validContext(ctx)) return rejected('invalid_context');
      const a = draft.state.active;
      if (!a || a.attemptId !== attemptId || a.parentMap !== ctx.mapId) return rejected('stale_attempt');
      if (ctx.blocked) return { status: 'deferred', reason: 'blocked' };
      if (this.definition(a.encounterId)!.trigger.reveal !== 'spirit_scan') return rejected('not_hidden');
      a.locals.revealed = true;
      if (!draft.state.seen.includes(a.encounterId)) draft.state.seen.push(a.encounterId);
      return this.activeResult(draft.state);
    });
  }
  /** 地图适配器确认提示确已展示后调用；抽中并不等于玩家已经看见。 */
  markSeen(ctx: EncounterRunnerContext, attemptId: string): EncounterRunnerResult {
    return this.mutate(`seen:${attemptId}`, draft => {
      const invalid = this.checkAction(ctx, draft, attemptId); if (invalid) return invalid;
      const id = draft.state.active!.encounterId;
      if (!draft.state.seen.includes(id)) draft.state.seen.push(id);
      return idle();
    });
  }
  /** 提示尚未打开时复查可变道心门槛；进选择后拒绝始终可选。 */
  revalidate(ctx: EncounterRunnerContext, attemptId: string): EncounterRunnerResult {
    return this.mutate(`revalidate:${attemptId}`, draft => {
      const invalid = this.checkAction(ctx, draft, attemptId); if (invalid) return invalid;
      const a = draft.state.active!, row = this.definition(a.encounterId)!;
      if (a.stepId === row.script.start && finite(row.req.daoHeartMax)
        && (!count(draft.save.daoHeart) || draft.save.daoHeart > row.req.daoHeartMax)) return this.settle(draft, ctx.nowMs, 'missed');
      return idle();
    });
  }
  /** 仅供受信地图适配器/fixture 回报；UI 的继续/选项无法调用本接口跳过挑战。 */
  completeChallenge(ctx: EncounterRunnerContext, attemptId: string, stepId: string, success: boolean): EncounterRunnerResult {
    return this.mutate(`challenge:${attemptId}:${stepId}:${success}`, draft => {
      const invalid = this.checkAction(ctx, draft, attemptId, stepId); if (invalid) return invalid;
      if (typeof success !== 'boolean') return rejected('invalid_context');
      const a = draft.state.active!, step = this.definition(a.encounterId)!.script.steps.find(step => step.id === a.stepId)!;
      if (!['battle', 'puzzle', 'scene'].includes(String(step.type))) return rejected('unsupported_step');
      if (step.type === 'scene') return success ? this.move(draft, ctx.nowMs, step.next) : this.settle(draft, ctx.nowMs, 'missed');
      return this.move(draft, ctx.nowMs, success ? step.onWin : step.onFail);
    });
  }
}
