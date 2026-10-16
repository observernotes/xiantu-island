import { gameNow } from './GameClock';
import { AFFINITY, QUEST_HOOKS, QUESTS, QUEST_ORDER, NPCS, SCRIPTS, ITEMS, MONSTERS, Line, QuestDef, questInPhase, t } from './data';
import type { Progress, QuestRewardSettlement } from './Progress';
import { CLASS_RULES, classEntryEnabled, classForQuest } from './classes';
import { REALMS } from './data';
import { dailyRewardsReady, type DailyQuestReward } from './DailyQuests';
import { FEATURE_UNAVAILABLE, featureEnabled } from './features';
import { isCheatEnabled } from './cheatFlags';
import { stageQuestAffinityCompletion, type AffinityConfig } from './Affinity';
import { previewQuestHook, stageQuestHookChoice, type QuestHooksConfig } from './QuestHooks';
import { SECRET_NEST_INTRO_ID, isSecretNestIntroEnabled, refuseQuestOffer, refuseQuestProgress,
  type SecretNestClosedTip } from './SecretNestClosed';

export type NpcMark = '!' | '?' | '…' | null;
type QuestTalkResult<T> = { lines: Line[]; after?: () => T; blockedTip?: SecretNestClosedTip };

/** 任务系统：串行任务链，状态存在 Progress.quests 里。字段见 balance/quests.json */
export class QuestSystem {
  private completionListeners = new Set<(reward: QuestReward) => void>();
  private blockedListeners = new Set<(tip: SecretNestClosedTip) => void>();
  constructor(private prog: Progress, private now: () => number = () => gameNow(), private affinityConfig: AffinityConfig | null = AFFINITY,
    private questHooksConfig: QuestHooksConfig | null = QUEST_HOOKS) { this.refreshDaily(); }

  /** 交付成功后通知订阅者；返回的函数可解除订阅。 */
  onCompleted(listener: (reward: QuestReward) => void): () => void {
    this.completionListeners.add(listener);
    return () => { this.completionListeners.delete(listener); };
  }
  /** 拒绝提示交给界面展示；沿用 accept/turnIn 的原返回结构，不写入存档。 */
  onBlocked(listener: (tip: SecretNestClosedTip) => void): () => void {
    this.blockedListeners.add(listener);
    return () => { this.blockedListeners.delete(listener); };
  }
  private notifyBlocked(tip: SecretNestClosedTip) {
    for (const listener of [...this.blockedListeners]) {
      try { listener(tip); } catch (error) { console.error(error); }
    }
  }
  private secretNestClosed(id: string) { return id === SECRET_NEST_INTRO_ID && !isSecretNestIntroEnabled(); }
  private secretNestQuestTip() {
    return this.prog.quests[SECRET_NEST_INTRO_ID] ? refuseQuestProgress() : refuseQuestOffer();
  }
  private notifyCompleted(reward: QuestReward): QuestReward {
    for (const listener of [...this.completionListeners]) {
      try { listener(reward); } catch (error) { console.error(error); }
    }
    return reward;
  }

  refreshDaily() { return this.prog.resetDailyQuests(this.now()); }

  state(id: string) { this.refreshDaily(); return this.prog.quests[id]?.state; }
  get activeIds() {
    this.refreshDaily();
    return QUEST_ORDER.filter(id => !this.secretNestClosed(id)
      && this.prog.quests[id]?.state === 'active' && this.featureAllowed(QUESTS[id]));
  }
  isActive(id: string) { return !this.secretNestClosed(id) && this.state(id) === 'active'; }

  /** next 链和独立 prereq 均须完成，且版本阶段、等级、目标类型可用。 */
  available(id: string) {
    if (this.secretNestClosed(id)) return false;
    if (this.state(id)) return false;
    const q = QUESTS[id];
    if (!q || !questInPhase(q) || !supported(q) || !this.prereqsDone(q) || !this.classAllowed(q)) return false;
    if (q.daily && !this.prog.canCompleteSectDailyQuest(id, this.now())) return false;
    return this.prog.level >= q.reqLevel;
  }
  /** 前置已完成但等级不够 */
  levelLocked(id: string) {
    if (this.secretNestClosed(id)) return false;
    const q = QUESTS[id];
    return !!q && questInPhase(q) && supported(q) && !this.state(id) && this.prereqsDone(q) && this.classAllowed(q)
      && (!q.daily || this.prog.canCompleteSectDailyQuest(id, this.now())) && this.prog.level < q.reqLevel;
  }

  private classAllowed(q: QuestDef) {
    if (!this.featureAllowed(q)) return false;
    if (this.sectEntryBlock(q.id)) return false;
    const cls = classForQuest(q.id);
    if (cls && this.prog.job && this.prog.job !== cls.id) return false;
    if (q.sect && this.prog.sect !== q.sect) return false;
    if (q.reqRealm && REALMS.findIndex(r => r.id === this.prog.realm.id) < REALMS.findIndex(r => r.id === q.reqRealm)) return false;
    return true;
  }

  /** 四宗拜帖门槛用于接取、入场及结算；天剑继续沿用妖狐前置与对话拜入。 */
  sectEntryBlock(id: string): string | undefined {
    const cls = classForQuest(id);
    if (!cls || cls.sect === CLASS_RULES.unjoinedSkillSect) return;
    if (this.prog.count('five_sect_token') <= 0) return t('sect.entry.need_token');
    if (this.prog.selectedSect !== cls.sect) return t('sect.entry.select_sect');
  }

  private featureAllowed(q: QuestDef) {
    if (this.secretNestClosed(q.id)) return false;
    const cls = classForQuest(q.id);
    return (!cls || classEntryEnabled(cls)) && (!q.daily || featureEnabled('sectDaily'))
      && (q.id !== 'q_alchemy_intro' || featureEnabled('alchemyPhase1'))
      && (q.id !== 'q_talisman_intro' || featureEnabled('talismanCraft'))
      && (q.id !== 'q_fox' || featureEnabled('foxBoss'));
  }

  private prereqsDone(q: QuestDef) {
    return (!q.prereq || this.state(q.prereq) === 'done')
      && QUEST_ORDER.filter(id => QUESTS[id].next === q.id).every(id => this.state(id) === 'done');
  }

  /** 06 文档一期入门仍归孙郎中；旧 NPC 表未挂任务时只补这一项入口。 */
  npcQuestIds(npcId: string) {
    const ids = [...(NPCS[npcId]?.quests ?? [])];
    const talisman = QUESTS.q_talisman_intro;
    if (featureEnabled('talismanCraft') && talisman && (talisman.giver === npcId || talisman.turnIn === npcId) && !ids.includes(talisman.id)) ids.push(talisman.id);
    const intro = QUESTS.q_alchemy_intro;
    if (intro && (intro.giver === npcId || intro.turnIn === npcId) && !ids.includes(intro.id)) ids.push(intro.id);
    // 配表尚未将五宗拜入任务挂到 NPC.quests；按任务自身 giver/turnIn 补入口。
    for (const q of Object.values(QUESTS)) if (classForQuest(q.id) && (q.giver === npcId || q.turnIn === npcId) && !ids.includes(q.id)) ids.push(q.id);
    return ids.filter(id => QUESTS[id] && this.featureAllowed(QUESTS[id]));
  }

  /** 本宗接引人菜单全量展示，已完成项可灰显，不让进行中的首条任务挡住其余两条。 */
  npcDailyQuestIds(npcId: string) {
    if (!featureEnabled('sectDaily')) return [];
    this.refreshDaily();
    return this.npcQuestIds(npcId).filter(id => {
      const q = QUESTS[id];
      return q.daily && this.classAllowed(q) && (q.giver === npcId || q.turnIn === npcId);
    });
  }

  objectiveProgress(q: QuestDef) {
    if (this.secretNestClosed(q.id)) return q.objectives.map(o => ({ o, cur: 0, need: o.count ?? 1, label: refuseQuestProgress().text }));
    this.refreshDaily();
    const st = this.prog.quests[q.id];
    return q.objectives.map(o => {
      switch (o.type) {
        case 'kill': { const n = st?.kills[o.target!] ?? 0; return { o, cur: Math.min(n, o.count!), need: o.count!, label: `击杀 ${MONSTERS[o.target!]?.name ?? o.target}` }; }
        case 'collect': return { o, cur: Math.min(this.prog.count(o.target!), o.count!), need: o.count!, label: `收集 ${ITEMS[o.target!]?.name ?? o.target}` };
        case 'reach': return { o, cur: st?.reached ? 1 : 0, need: 1, label: '登上望仙台' };
        case 'breakthrough': return { o, cur: this.prog.atBreakthrough ? 1 : 0, need: 1, label: '修为圆满' };
        case 'talk': return { o, cur: st?.talked?.[o.target!] ? 1 : 0, need: 1, label: `与${NPCS[o.target!]?.name ?? o.target}对话` };
        case 'craft': return { o, cur: Math.min(st?.crafted?.[o.target!] ?? 0, o.count ?? 1), need: o.count ?? 1, label: `炼制 ${ITEMS[o.target!]?.name ?? o.target}` };
        case 'trial': return { o, cur: this.prog.completedTrials.includes(o.trial ?? '') ? 1 : 0, need: 1, label: '通过入门试炼' };
        default: return { o, cur: 0, need: 1, label: String(o.type) };   // 未支持的目标：永不完成，但不抛错
      }
    });
  }
  complete(id: string) {
    if (this.secretNestClosed(id)) return false;
    const q = QUESTS[id];
    return this.isActive(id) && !!q && supported(q) && this.classAllowed(q)
      && (!q.daily || this.prog.canCompleteSectDailyQuest(id, this.now()))
      && this.objectiveProgress(q).every(p => p.cur >= p.need);
  }

  /** NPC 头顶标记：可交付 ?、可接 !、进行中 … */
  mark(npcId: string): NpcMark {
    const ids = this.npcQuestIds(npcId);
    if (ids.some(id => QUESTS[id].turnIn === npcId && this.complete(id))) return '?';
    if (ids.some(id => QUESTS[id].giver === npcId && this.available(id))) return '!';
    if (ids.some(id => this.isActive(id) && QUESTS[id].turnIn === npcId && this.classAllowed(QUESTS[id]))) return '…';
    return null;
  }

  /** 和 NPC 说话：返回要播放的台词和说完后要做的事 */
  onTalk(npcId: string) {
    let changed = false;
    for (const id of this.activeIds) {
      if (!this.classAllowed(QUESTS[id])) continue;
      for (const o of QUESTS[id].objectives) if (o.type === 'talk' && o.target === npcId) {
        const st = this.prog.quests[id];
        if (!st.talked?.[npcId]) { (st.talked ??= {})[npcId] = true; changed = true; }
      }
    }
    if (changed) this.prog.persistSoon();
  }

  talk(npcId: string, questId: string | undefined, options: { async: true }): QuestTalkResult<Promise<QuestReward | void>>;
  talk(npcId: string, questId?: string): QuestTalkResult<QuestReward | void>;
  talk(npcId: string, questId?: string, options?: { async: true }): QuestTalkResult<QuestReward | void | Promise<QuestReward | void>> {
    const npc = NPCS[npcId];
    // 必须先于 phase/资格/旧档状态及 onTalk；显式尝试绝不派发其他任务 talk 目标。
    if (questId && this.secretNestClosed(questId)) {
      const blockedTip = this.secretNestQuestTip();
      return { lines: [{ speaker: npc?.name ?? NPCS.hunter_lei?.name ?? '雷猎户', text: blockedTip.text }], blockedTip };
    }
    const blockedTip = !questId && npcId === 'hunter_lei' && !isSecretNestIntroEnabled()
      ? this.secretNestQuestTip() : undefined;
    // 正常主线保留原对白与 after；秘境说明由界面提示事件展示，不抢占主线对话。
    const reply = (result: QuestTalkResult<QuestReward | void | Promise<QuestReward | void>>) => {
      if (!blockedTip) return result;
      this.notifyBlocked(blockedTip);
      return { ...result, blockedTip };
    };
    if (questId && QUESTS[questId] && !this.featureAllowed(QUESTS[questId])) {
      return { lines: [{ speaker: npc.name, text: FEATURE_UNAVAILABLE }] };
    }
    // talk 目标：和目标 NPC 说过话就算完成
    this.onTalk(npcId);
    const fill = (ls: Line[] | undefined) => (ls ?? []).map(l => ({ ...l, text: l.text.replace(/\{name\}/g, this.prog.name) }));
    for (const id of this.npcQuestIds(npcId).filter(id => !questId || id === questId)) {
      const q = QUESTS[id], sc = SCRIPTS[id] ?? {};
      if (!q) continue;
      const blocked = this.sectEntryBlock(id);
      if (blocked && (questId || !this.prog.job) && this.state(id) !== 'done' && (q.giver === npcId || q.turnIn === npcId)) {
        return reply({ lines: [{ speaker: npc.name, text: blocked }] });
      }
      const lines = (stage: 'offer' | 'progress' | 'complete', fallback?: Line[]) => {
        if (id === 'q_talisman_intro' && !q.dialogueKeys?.[stage]) {
          const keys = stage === 'offer' ? ['intro_offer'] : stage === 'complete' ? ['intro_material', 'intro_draw', 'intro_done'] : ['intro_material', 'intro_draw'];
          return keys.map(key => ({ speaker: npc.name, text: t(`talisman.${key}`) }));
        }
        const key = q.dialogueKeys?.[stage];
        return key ? [{ speaker: npc.name, text: t(key, { name: this.prog.name }) }] : fill(fallback);
      };
      if (q.turnIn === npcId && this.complete(id)) return reply({ lines: lines('complete', sc.turnIn), after: options?.async ? () => this.turnInAsync(id) : () => this.turnIn(id) });
      if (q.turnIn === npcId && this.isActive(id) && this.classAllowed(q)) {
        const notReady = q.objectives.some(o => o.type === 'breakthrough') && sc.notReady && this.objectiveProgress(q).some(p => p.o.type !== 'breakthrough' && p.cur >= p.need);
        return reply({ lines: lines('progress', notReady ? sc.notReady : sc.progress) });
      }
      if (q.giver === npcId && this.available(id)) return reply({ lines: lines('offer', sc.accept), after: options?.async ? async () => { this.accept(id); } : () => { this.accept(id); } });
    }
    const fox = QUESTS.q_fox;
    if (!questId && fox && !featureEnabled('foxBoss') && this.state(fox.id) !== 'done'
      && (fox.giver === npcId || fox.turnIn === npcId)) {
      return reply({ lines: [{ speaker: npc.name, text: FEATURE_UNAVAILABLE }] });
    }
    if (blockedTip) return { lines: [{ speaker: npc.name, text: blockedTip.text }], blockedTip };
    return { lines: npc.dialog.map(t => ({ speaker: npc.name, text: t })) };
  }

  accept(id: string) {
    if (this.secretNestClosed(id)) { this.notifyBlocked(refuseQuestOffer()); return false; }
    if (!this.available(id)) return false;
    this.prog.quests[id] = { state: 'active', kills: {}, crafted: {} };
    // 06 文档先教回春丹再要求炼成；表只有完成奖励丹方，教学时提前解锁避免闭环。
    if (id === 'q_alchemy_intro') this.prog.grantRecipe('recipe_hp_pill');
    this.prog.persistSoon();
    return true;
  }

  /** 旧档或改选后可退回未接；清除本次试炼记录，不能带旧通关重接领奖。 */
  abandon(id: string): boolean;
  abandon(id: string, options: { async: true }): Promise<boolean>;
  abandon(id: string, options?: { async: true }): boolean | Promise<boolean> {
    if (options?.async) return this.abandonAsync(id);
    const cls = classForQuest(id), q = QUESTS[id];
    if (!cls || cls.sect === CLASS_RULES.unjoinedSkillSect || !q || !this.isActive(id) || this.prog.pendingSectTrial) return false;
    const previous = this.prog.quests[id], trials = this.prog.completedTrials;
    delete this.prog.quests[id];
    this.prog.completedTrials = trials.filter(trial => !q.objectives.some(o => o.type === 'trial' && o.trial === trial));
    if (this.prog.save()) return true;
    this.prog.quests[id] = previous;
    this.prog.completedTrials = trials;
    return false;
  }

  async abandonAsync(id: string): Promise<boolean> {
    if (!featureEnabled('indexedDbSaves')) return this.abandon(id);
    const now = this.now();
    return await this.prog.runSaveTransactionAsync(draft => {
      const staged = new QuestSystem(draft, () => now, this.affinityConfig, this.questHooksConfig);
      return staged.abandon(id) ? true : undefined;
    }) === true;
  }

  /** 选择 UI 可传入显式 choice；关态或两轴未就绪沿用原交付，不推断答案。 */
  private questHookTurnIn(id: string, choiceId: string | undefined, stage: boolean): boolean {
    const hook = this.questHooksConfig?.questHooks.find(candidate => candidate.quest === id && candidate.on === 'turn_in');
    if (!hook || !hook.enabled) return true;
    const view = previewQuestHook(this.questHooksConfig, hook.id, choiceId ?? hook.choices[0].id, this.prog);
    if (view.status === 'unavailable') return view.reason === 'disabled' || view.reason === 'not_ready';
    if (choiceId === undefined) return false;
    if (!stage) return true;
    return stageQuestHookChoice(this.questHooksConfig, hook.id, choiceId, this.prog).status === 'applied';
  }

  turnIn(id: string, force?: boolean, choiceId?: string): QuestReward | undefined;
  turnIn(id: string, force: boolean | undefined, choiceId: string | undefined, options: { async: true }): Promise<QuestReward | undefined>;
  turnIn(id: string, force = false, choiceId?: string, options?: { async: true }): QuestReward | undefined | Promise<QuestReward | undefined> {
    if (options?.async) return this.turnInAsync(id, force, choiceId);
    if (this.secretNestClosed(id)) { this.notifyBlocked(refuseQuestProgress()); return undefined; }
    const q = QUESTS[id];
    // 内部作弊仅跳过普通任务的接取/职业门槛；目标与事务发奖仍走原路径。
    const forced = force && isCheatEnabled() && !!q && !q.daily && this.isActive(id)
      && this.objectiveProgress(q).every(p => p.cur >= p.need || p.o.type === 'breakthrough'
        && REALMS.some(realm => realm.id === p.o.realm && this.prog.level >= realm.levelMin));
    if (!this.complete(id) && !forced) return undefined;
    const now = this.now();
    if (q.daily && (!this.prog.canCompleteSectDailyQuest(id, now) || this.prog.quests[id]?.state !== 'active')) return undefined;
    if (!q.daily) {
      if (!this.questHookTurnIn(id, choiceId, false)) return undefined;
      const reward = this.prog.runSaveTransaction(() => {
        // done 前复检并暂存选择；两轴、收据、原任务和奖励共用本次保存。
        if (!this.questHookTurnIn(id, choiceId, true)) return undefined;
        for (const o of q.objectives) if (o.type === 'collect' && o.consume !== false) this.prog.removeItem(o.target!, o.count!);
        const needsBreakthrough = q.objectives.some(o => o.type === 'breakthrough' && (!forced
          || !REALMS.some(realm => realm.id === o.realm && this.prog.level >= realm.levelMin)));
        const broke = needsBreakthrough ? this.prog.breakthrough() : false;
        this.prog.quests[id].state = 'done';
        if (!stageQuestAffinityCompletion(this.affinityConfig, id, this.prog)) return undefined;
        const settled = this.prog.settleQuestRewards(q, forced);
        return settled ? { quest: q, broke, settled } : undefined;
      });
      return reward ? this.notifyCompleted(reward) : undefined;
    }
    const reward = this.prog.runSaveTransaction(() => {
      for (const o of q.objectives) if (o.type === 'collect' && o.consume !== false) this.prog.removeItem(o.target!, o.count!);
      const broke = q.objectives.some(o => o.type === 'breakthrough') ? this.prog.breakthrough() : false;
      this.prog.quests[id].state = 'done';
      if (!stageQuestAffinityCompletion(this.affinityConfig, id, this.prog)) return undefined;
      const daily = this.prog.settleSectDailyQuest(id, now);
      return daily ? { quest: q, broke, daily } : undefined;
    });
    return reward ? this.notifyCompleted(reward) : undefined;
  }

  async turnInAsync(id: string, force = false, choiceId?: string): Promise<QuestReward | undefined> {
    if (this.secretNestClosed(id)) { this.notifyBlocked(refuseQuestProgress()); return undefined; }
    if (!featureEnabled('indexedDbSaves')) return this.turnIn(id, force, choiceId);
    const now = this.now();
    const reward = await this.prog.runSaveTransactionAsync(draft => {
      // 旧同步结算仅在隔离 draft 内暂存；原实例及通知等待外层槽提交成功。
      const staged = new QuestSystem(draft, () => now, this.affinityConfig, this.questHooksConfig);
      return staged.turnIn(id, force, choiceId);
    });
    return reward ? this.notifyCompleted(reward) : undefined;
  }

  onKill(monsterId: string) {
    let changed = false;
    for (const id of this.activeIds) {
      const st = this.prog.quests[id];
      if (QUESTS[id].objectives.some(o => o.type === 'kill' && o.target === monsterId)) { st.kills[monsterId] = (st.kills[monsterId] ?? 0) + 1; changed = true; }
    }
    if (changed) this.prog.persistSoon();   // G8：击杀数立即存档
  }
  onReach(target: string) {
    if (target === 'secret_nest_sign' && !isSecretNestIntroEnabled()) { this.notifyBlocked(refuseQuestProgress()); return; }
    let changed = false;
    for (const id of this.activeIds) if (!this.prog.quests[id].reached && QUESTS[id].objectives.some(o => o.type === 'reach' && o.target === target)) {
      this.prog.quests[id].reached = true; changed = true;
    }
    if (changed) this.prog.persistSoon();
  }
  /** 完整试炼控制器胜利时调用；进图、局部机关、失败均不能算通关。 */
  onTrialComplete(trialId: string) {
    if (!trialId || !this.activeIds.some(id => this.classAllowed(QUESTS[id])
      && QUESTS[id].objectives.some(o => o.type === 'trial' && o.trial === trialId))) return false;
    if (this.prog.completedTrials.includes(trialId)) return false;
    this.prog.completedTrials.push(trialId);
    this.prog.persistSoon();
    return true;
  }
  /** 只接受成功产出的数量，背包拾取/旧库存不计入 craft 目标。 */
  onCraft(itemId: string, count: number) {
    if (!Number.isFinite(count) || count <= 0) return;
    let changed = false;
    for (const id of this.activeIds) {
      if (!QUESTS[id].objectives.some(o => o.type === 'craft' && o.target === itemId)) continue;
      const st = this.prog.quests[id];
      (st.crafted ??= {})[itemId] = (st.crafted?.[itemId] ?? 0) + Math.floor(count); changed = true;
    }
    if (changed) this.prog.persistSoon();
  }
}

const SUPPORTED = new Set(['kill', 'collect', 'reach', 'breakthrough', 'talk', 'craft', 'trial']);
function supported(q: QuestDef) { return (!q.daily || dailyRewardsReady(q)) && q.objectives.every(o => SUPPORTED.has(o.type)); }

export interface QuestReward { quest: QuestDef; broke: boolean; daily?: DailyQuestReward; settled?: QuestRewardSettlement; }
