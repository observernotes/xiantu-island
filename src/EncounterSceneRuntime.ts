import type { EncounterDefinition, EncountersConfig } from './Encounter';
import { EncounterRunner, type EncounterRunnerContext, type EncounterRunnerPacing, type EncounterRunnerResult } from './EncounterRunner';
import type { EncounterOffer } from './EncounterUi';
import type { Progress } from './Progress';

export interface EncounterMeditationProvider {
  active(): boolean;
  atAnchor(): boolean;
  /** 抽中后必须结束打坐，等待玩家参与奇遇。 */
  stop(): void;
}
export interface EncounterSceneRuntimeOptions {
  progress: Progress;
  config: EncountersConfig | null;
  pacing: EncounterRunnerPacing;
  rng?: () => number;
  context(): EncounterRunnerContext;
  anchor(definition: EncounterDefinition): { x: number; y: number; height?: number } | undefined;
  near(anchor: { x: number; y: number }): boolean;
  emit(name: string, payload?: EncounterOffer): void;
  onCommit?(): void;
}
type AdvanceInput = { encounterId?: string; attemptId?: string; stepId?: string; mock?: boolean };
type ChoiceInput = AdvanceInput & { choiceId?: string };

/** Phaser 无关的正式接线；Fixture 与 GameScene 使用同一个 runner、事务与交互入口。 */
export class EncounterSceneRuntime {
  readonly runner: EncounterRunner;
  private visitId?: string;
  private waitingEntry = false;
  private meditation?: EncounterMeditationProvider;
  private interrupted = false;
  private stoppedAttempts = new Set<string>();
  private presentedAttempts = new Set<string>();
  private pendingSeen?: string;
  private readonly enabled: boolean;

  constructor(private readonly options: EncounterSceneRuntimeOptions) {
    this.enabled = !!options.config?.encounters.some(row => row.enabled);
    this.runner = new EncounterRunner(options.config, options.pacing, {
      read: () => options.progress.encounterSave(),
      commit: next => options.progress.commitEncounterSave(next),
    }, options.rng);
  }

  registerMeditation(provider: EncounterMeditationProvider): () => void {
    this.meditation = provider;
    return () => { if (this.meditation === provider) { this.meditation = undefined; this.interrupted = true; } };
  }

  private context(): EncounterRunnerContext {
    const ctx = this.options.context();
    const ready = ctx.featuresReady instanceof Set
      ? new Set(ctx.featuresReady) : new Set(Object.entries(ctx.featuresReady).filter(([, value]) => value === true).map(([key]) => key));
    if (this.meditation) ready.add('meditation'); else ready.delete('meditation');
    return { ...ctx, featuresReady: ready };
  }

  enter(visitId: string): void {
    if (!this.enabled) return;
    this.visitId = visitId;
    this.waitingEntry = true;
    if (!this.flushPending()) return;
    this.checkEntry();
  }
  private checkEntry(): void {
    if (!this.waitingEntry || !this.visitId) return;
    const result = this.runner.enter(this.context(), this.visitId);
    this.waitingEntry = result.status === 'deferred' || result.status === 'rejected' && result.reason === 'stale_save';
    this.publish(result, false);
  }

  update(deltaMs: number, state: { paused?: boolean; interrupted?: boolean } = {}): void {
    if (!this.enabled) return;
    if (!this.flushPending()) return;
    this.checkEntry();
    if (!this.flushSeen()) return;
    this.presentNearbyOffer();
    const ctx = this.context();
    const provider = this.meditation;
    this.publish(this.runner.tick(ctx, deltaMs, {
      meditating: provider?.active() === true, atAnchor: provider?.atAnchor() === true,
      paused: state.paused === true, interrupted: this.interrupted || state.interrupted === true,
    }), false);
    this.interrupted = false;
  }
  interrupt(): void { this.interrupted = true; }

  /** 扫描所属适配器完成保存后发布入口；事务仍由 runner 负责。 */
  reveal(attemptId: string): EncounterRunnerResult {
    const result = this.runner.reveal(this.context(), attemptId);
    this.publish(result, false);
    return result;
  }

  /** 只在真实锚点附近打开；缺地图锚点时保持不可见，不借用出生点。 */
  interact(): boolean {
    if (!this.enabled || !this.flushPending() || !this.flushSeen() || this.context().blocked) return false;
    const offer = this.runner.offer();
    const definition = offer && this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const target = definition && this.options.anchor(definition);
    if (!offer || !target || !this.options.near(target)) return false;
    const checked = this.runner.revalidate(this.context(), offer.attemptId);
    if (checked.status === 'settled') { this.publish(checked, true); return true; }
    if (checked.status === 'rejected' || checked.status === 'deferred') return false;
    this.options.emit('encounter:offer', { ...offer, target, markerOnly: false });
    this.presentedAttempts.add(offer.attemptId);
    this.pendingSeen = offer.attemptId; this.flushSeen();
    return true;
  }

  advance(payload: AdvanceInput): void {
    if (!this.flushPending() || !this.flushSeen() || !this.matches(payload) || !payload.attemptId || !payload.stepId) return;
    this.publish(this.runner.advance(this.context(), payload.attemptId, payload.stepId), true);
  }
  choose(payload: ChoiceInput): void {
    if (!this.flushPending() || !this.flushSeen() || !this.matches(payload) || !payload.attemptId || !payload.encounterId || !payload.stepId || !payload.choiceId) return;
    this.publish(this.runner.choose(this.context(), { attemptId: payload.attemptId, encounterId: payload.encounterId,
      stepId: payload.stepId, choiceId: payload.choiceId }), true);
  }
  private matches(payload: AdvanceInput): boolean {
    if (!this.enabled || payload.mock === true) return false;
    const current = this.runner.offer();
    return !!current && payload.attemptId === current.attemptId && payload.encounterId === current.encounterId && payload.stepId === current.stepId;
  }
  terminate(reason: 'missed' | 'failed'): boolean {
    if (!this.enabled) return true;
    if (!this.flushPending()) return false;
    if (!this.flushSeen()) return false;
    const result = this.runner.terminate(this.context(), reason);
    this.publish(result, false);
    return result.status !== 'rejected' && result.status !== 'deferred';
  }

  private publish(result: EncounterRunnerResult, panel: boolean): void {
    const attemptId = result.attemptId ?? result.offer?.attemptId;
    if (result.status === 'offered' && attemptId && !this.stoppedAttempts.has(attemptId)) {
      this.stoppedAttempts.add(attemptId); this.meditation?.stop();
    }
    if (['offered', 'advanced', 'settled'].includes(result.status)) this.options.onCommit?.();
    if (result.status === 'settled' && result.encounterId && result.outcomeId) {
      this.options.emit('encounter:result', { encounterId: result.encounterId, attemptId: result.attemptId,
        outcomeId: result.outcomeId, config: this.options.config });
      return;
    }
    if (result.status !== 'offered' && result.status !== 'advanced') return;
    const offer = result.offer ?? this.runner.offer();
    const definition = offer && this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const target = definition && this.options.anchor(definition);
    if (offer && target && (panel || this.options.near(target))) {
      this.options.emit(panel ? 'encounter:step' : 'encounter:offer', { ...offer, target, markerOnly: !panel });
      this.presentedAttempts.add(offer.attemptId);
      this.pendingSeen = offer.attemptId; this.flushSeen();
    }
  }
  private presentNearbyOffer(): void {
    const offer = this.runner.offer();
    if (!offer || this.presentedAttempts.has(offer.attemptId) || this.context().blocked) return;
    const definition = this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const target = definition && this.options.anchor(definition);
    if (!target || !this.options.near(target)) return;
    this.options.emit('encounter:offer', { ...offer, target, markerOnly: true });
    this.presentedAttempts.add(offer.attemptId);
    this.pendingSeen = offer.attemptId; this.flushSeen();
  }
  private flushSeen(): boolean {
    if (!this.pendingSeen) return true;
    const result = this.runner.markSeen(this.context(), this.pendingSeen);
    if (result.status === 'rejected' || result.status === 'deferred') return false;
    this.pendingSeen = undefined;
    return true;
  }
  /** 已确认的动作保存失败后按原事务重试；关闭展示不撤销玩家已作的选择。 */
  private flushPending(): boolean {
    const result = this.runner.retryPending();
    if (result.status === 'deferred') return false;
    if (result.status === 'rejected') return result.reason === 'stale_save';
    this.publish(result, result.status !== 'offered');
    return true;
  }
}
