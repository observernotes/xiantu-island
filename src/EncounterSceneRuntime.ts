import type { EncounterDefinition, EncountersConfig } from './Encounter';
import { EncounterRunner, type EncounterRunnerContext, type EncounterRunnerPacing, type EncounterRunnerResult } from './EncounterRunner';
import type { EncounterOffer } from './EncounterUi';
import type { Progress } from './Progress';
import type { EncounterBattleProvider } from './EncounterBattle';

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
  battle?: EncounterBattleProvider;
}
type AdvanceInput = { encounterId?: string; attemptId?: string; stepId?: string; mock?: boolean };
type ChoiceInput = AdvanceInput & { choiceId?: string };
type PuzzleInput = AdvanceInput & { objectId?: string };
type Challenge = { attemptId: string; stepId: string; success: boolean };

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
  private destroyed = false;
  private syncingChallenge = false;
  private battle?: { attemptId: string; stepId: string; handle?: { dispose(): void } };
  private puzzleState?: { attemptId: string; stepId: string; index: number };
  /** 保存失败或模态阻塞不丢弃已经发生的实体胜负。 */
  private completedChallenge?: Challenge;
  private terminating?: 'missed' | 'failed';

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
    if (!this.enabled || this.destroyed) return;
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
    if (!this.enabled || this.destroyed) return;
    if (!this.flushPending()) return;
    if (this.terminating && !this.terminate(this.terminating)) return;
    this.checkEntry();
    if (!this.flushSeen()) return;
    this.syncChallenge();
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

  /** 只在真实锚点附近打开；缺地图锚点时保持不可见，不借用出生点。 */
  interact(): boolean {
    if (!this.enabled || this.destroyed || !this.flushPending() || !this.flushSeen() || this.context().blocked) return false;
    const offer = this.runner.offer();
    const definition = offer && this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const step = definition?.script.steps.find(row => row.id === offer?.stepId);
    if (step?.type === 'battle' || step?.type === 'scene') return false;
    const target = definition && this.options.anchor(definition);
    if (!offer || !target || !this.options.near(target)) return false;
    const checked = this.runner.revalidate(this.context(), offer.attemptId);
    if (checked.status === 'settled') { this.publish(checked, true); return true; }
    if (checked.status === 'rejected' || checked.status === 'deferred') return false;
    this.options.emit('encounter:offer', { ...offer, target, markerOnly: false,
      vars: { n: this.puzzleState?.index ?? 0, total: Array.isArray(step?.sequence) ? step.sequence.length : 0 } });
    this.presentedAttempts.add(offer.attemptId);
    this.pendingSeen = offer.attemptId; this.flushSeen();
    return true;
  }

  advance(payload: AdvanceInput): void {
    if (!this.enabled || this.destroyed) return;
    if (!this.flushPending() || !this.flushSeen() || !this.matches(payload) || !payload.attemptId || !payload.stepId) return;
    this.publish(this.runner.advance(this.context(), payload.attemptId, payload.stepId), true);
  }
  choose(payload: ChoiceInput): void {
    if (!this.enabled || this.destroyed) return;
    if (!this.flushPending() || !this.flushSeen() || !this.matches(payload) || !payload.attemptId || !payload.encounterId || !payload.stepId || !payload.choiceId) return;
    this.publish(this.runner.choose(this.context(), { attemptId: payload.attemptId, encounterId: payload.encounterId,
      stepId: payload.stepId, choiceId: payload.choiceId }), true);
  }
  /** 扫描系统/fixture 的受信显形入口；不从 UI 事件推断扫描成功。 */
  reveal(attemptId: string): void {
    if (!this.enabled || this.destroyed || this.terminating || !this.flushPending()) return;
    this.publish(this.runner.reveal(this.context(), attemptId), false);
  }
  /** 保留受信挑战回报；真实战斗使用同一路径，UI 的继续不能代报胜利。 */
  completeChallenge(attemptId: string, stepId: string, success: boolean): void {
    if (!this.enabled || this.destroyed || this.terminating || typeof success !== 'boolean') return;
    const offer = this.runner.offer();
    const step = offer?.config.encounters.find(row => row.id === offer.encounterId)?.script.steps.find(row => row.id === offer.stepId);
    if (!offer || offer.attemptId !== attemptId || offer.stepId !== stepId
      || !['battle', 'scene', 'puzzle'].includes(String(step?.type)) || this.completedChallenge) return;
    this.completedChallenge = { attemptId, stepId, success };
    if (this.flushPending()) this.syncChallenge();
  }
  /** 一次点击/JustDown 只接受一个机关；进度仅在本 Runtime 内，刷新仍按 runner 安全 failed。 */
  puzzle(payload: PuzzleInput): void {
    if (!this.enabled || this.destroyed) return;
    if (!this.flushPending() || !this.flushSeen() || !this.matches(payload) || this.context().blocked || this.completedChallenge) return;
    const offer = this.runner.offer()!;
    const step = offer.config.encounters.find(row => row.id === offer.encounterId)?.script.steps.find(row => row.id === offer.stepId);
    if (step?.type !== 'puzzle' || !Array.isArray(step.sequence) || !Array.isArray(step.objects)
      || !step.objects.includes(payload.objectId)) return;
    this.pruneChallenges(offer);
    const puzzle = this.puzzleState ??= { attemptId: offer.attemptId, stepId: offer.stepId, index: 0 };
    if (payload.objectId !== step.sequence[puzzle.index]) {
      this.completeChallenge(offer.attemptId, offer.stepId, false); return;
    }
    puzzle.index++;
    if (puzzle.index === step.sequence.length) this.completeChallenge(offer.attemptId, offer.stepId, true);
    else this.publish({ status: 'advanced', offer }, true);
  }
  private matches(payload: AdvanceInput): boolean {
    if (!this.enabled || this.destroyed || this.terminating || payload.mock === true) return false;
    const current = this.runner.offer();
    return !!current && payload.attemptId === current.attemptId && payload.encounterId === current.encounterId && payload.stepId === current.stepId;
  }
  terminate(reason: 'missed' | 'failed'): boolean {
    if (!this.enabled) return true;
    if (this.destroyed) return false;
    this.terminating = reason;
    this.clearChallenges();
    if (!this.flushPending()) return false;
    if (!this.flushSeen()) return false;
    const result = this.runner.terminate(this.context(), reason);
    this.publish(result, false);
    const done = result.status !== 'rejected' && result.status !== 'deferred';
    if (done) this.terminating = undefined;
    return done;
  }

  /** 场景销毁只收实体，不另造 missed/保存事务。 */
  destroy(): void { this.destroyed = true; this.clearChallenges(); }

  private clearChallenges(): void {
    const battle = this.battle;
    this.battle = undefined;
    battle?.handle?.dispose();
    this.puzzleState = undefined;
    this.completedChallenge = undefined;
  }

  private pruneChallenges(offer: ReturnType<EncounterRunner['offer']>): void {
    const same = (value: { attemptId: string; stepId: string }) => value.attemptId === offer?.attemptId && value.stepId === offer.stepId;
    if (this.battle && !same(this.battle)) {
      const battle = this.battle; this.battle = undefined; battle.handle?.dispose();
    }
    if (this.puzzleState && !same(this.puzzleState)) this.puzzleState = undefined;
    if (this.completedChallenge && !same(this.completedChallenge)) this.completedChallenge = undefined;
  }

  private syncChallenge(): void {
    if (!this.enabled || this.destroyed || this.syncingChallenge || this.terminating) return;
    this.syncingChallenge = true;
    try {
      const offer = this.runner.offer();
      this.pruneChallenges(offer);
      if (!offer) return;
      const definition = offer.config.encounters.find(row => row.id === offer.encounterId)!;
      const step = definition.script.steps.find(row => row.id === offer.stepId)!;
      if (step.type === 'scene') {
        // 最小洞府原地承接 inscription，沿父 visit，不实际过图也不重抽。
        this.completedChallenge ??= { attemptId: offer.attemptId, stepId: offer.stepId, success: true };
      } else if (step.type === 'battle' && !this.battle && this.options.battle && !this.completedChallenge) {
        const battle = { attemptId: offer.attemptId, stepId: offer.stepId, handle: undefined as { dispose(): void } | undefined };
        this.battle = battle;
        this.options.emit('encounter:clear');
        battle.handle = this.options.battle.start({ attemptId: offer.attemptId, encounterId: offer.encounterId,
          stepId: offer.stepId, spawns: step.spawns as { monster: string; count: number }[], warningMs: Number(step.warningMs),
          respawnMs: 0, grantRewards: false, anchor: this.options.anchor(definition) }, success => {
          if (this.battle !== battle || this.destroyed || this.terminating) return;
          this.completeChallenge(battle.attemptId, battle.stepId, success);
        });
      }
      const completed = this.completedChallenge;
      if (!completed || this.context().blocked) return;
      const result = this.runner.completeChallenge(this.context(), completed.attemptId, completed.stepId, completed.success);
      if (!['rejected', 'deferred'].includes(result.status)) this.completedChallenge = undefined;
      this.publish(result, true);
    } finally { this.syncingChallenge = false; }
  }

  private publish(result: EncounterRunnerResult, panel: boolean): void {
    const attemptId = result.attemptId ?? result.offer?.attemptId;
    if (result.status === 'offered' && attemptId && !this.stoppedAttempts.has(attemptId)) {
      this.stoppedAttempts.add(attemptId); this.meditation?.stop();
    }
    if (['offered', 'advanced', 'settled'].includes(result.status)) this.options.onCommit?.();
    if (result.status === 'settled' && result.encounterId && result.outcomeId) {
      this.clearChallenges();
      this.options.emit('encounter:result', { encounterId: result.encounterId, attemptId: result.attemptId,
        outcomeId: result.outcomeId, config: this.options.config });
      return;
    }
    if (result.status !== 'offered' && result.status !== 'advanced') return;
    const offer = result.offer ?? this.runner.offer();
    this.pruneChallenges(offer);
    const definition = offer && this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const step = definition?.script.steps.find(row => row.id === offer?.stepId);
    if (step?.type === 'battle' || step?.type === 'scene') {
      this.options.emit('encounter:clear');
      this.syncChallenge(); return;
    }
    this.syncChallenge();
    const target = definition && this.options.anchor(definition);
    if (offer && target && (panel || this.options.near(target))) {
      this.options.emit(panel ? 'encounter:step' : 'encounter:offer', { ...offer, target, markerOnly: !panel,
        vars: { n: this.puzzleState?.index ?? 0, total: Array.isArray(step?.sequence) ? step.sequence.length : 0 } });
      this.presentedAttempts.add(offer.attemptId);
      this.pendingSeen = offer.attemptId; this.flushSeen();
    }
  }
  private presentNearbyOffer(): void {
    const offer = this.runner.offer();
    if (!offer || this.presentedAttempts.has(offer.attemptId) || this.context().blocked) return;
    const definition = this.options.config?.encounters.find(row => row.id === offer.encounterId);
    const step = definition?.script.steps.find(row => row.id === offer.stepId);
    if (step?.type === 'battle' || step?.type === 'scene') return;
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
