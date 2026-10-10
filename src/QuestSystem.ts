import { QUESTS, QUEST_ORDER, NPCS, SCRIPTS, ITEMS, MONSTERS, Line, QuestDef, inPhase, t } from './data';
import type { Progress } from './Progress';
import { classForQuest } from './classes';
import { REALMS } from './data';
import { dailyRewardsReady, type DailyQuestReward } from './DailyQuests';

export type NpcMark = '!' | '?' | '…' | null;

/** 任务系统：串行任务链，状态存在 Progress.quests 里。字段见 balance/quests.json */
export class QuestSystem {
  constructor(private prog: Progress, private now: () => number = () => Date.now()) { this.refreshDaily(); }

  refreshDaily() { return this.prog.resetDailyQuests(this.now()); }

  state(id: string) { this.refreshDaily(); return this.prog.quests[id]?.state; }
  get activeIds() {
    this.refreshDaily();
    return QUEST_ORDER.filter(id => this.prog.quests[id]?.state === 'active');
  }
  isActive(id: string) { return this.state(id) === 'active'; }

  /** next 链和独立 prereq 均须完成，且版本阶段、等级、目标类型可用。 */
  available(id: string) {
    if (this.state(id)) return false;
    const q = QUESTS[id];
    if (!q || !inPhase(q) || !supported(q) || !this.prereqsDone(q) || !this.classAllowed(q)) return false;
    if (q.daily && !this.prog.canCompleteSectDailyQuest(id, this.now())) return false;
    return this.prog.level >= q.reqLevel;
  }
  /** 前置已完成但等级不够 */
  levelLocked(id: string) {
    const q = QUESTS[id];
    return !!q && inPhase(q) && supported(q) && !this.state(id) && this.prereqsDone(q) && this.classAllowed(q)
      && (!q.daily || this.prog.canCompleteSectDailyQuest(id, this.now())) && this.prog.level < q.reqLevel;
  }

  private classAllowed(q: QuestDef) {
    const cls = classForQuest(q.id);
    if (cls && this.prog.job && this.prog.job !== cls.id) return false;
    if (q.sect && this.prog.sect !== q.sect) return false;
    if (q.reqRealm && REALMS.findIndex(r => r.id === this.prog.realm.id) < REALMS.findIndex(r => r.id === q.reqRealm)) return false;
    return true;
  }

  private prereqsDone(q: QuestDef) {
    return (!q.prereq || this.state(q.prereq) === 'done')
      && QUEST_ORDER.filter(id => QUESTS[id].next === q.id).every(id => this.state(id) === 'done');
  }

  /** 06 文档一期入门仍归孙郎中；旧 NPC 表未挂任务时只补这一项入口。 */
  npcQuestIds(npcId: string) {
    const ids = [...(NPCS[npcId]?.quests ?? [])];
    const intro = QUESTS.q_alchemy_intro;
    if (intro && (intro.giver === npcId || intro.turnIn === npcId) && !ids.includes(intro.id)) ids.push(intro.id);
    // 配表尚未将五宗拜入任务挂到 NPC.quests；按任务自身 giver/turnIn 补入口。
    for (const q of Object.values(QUESTS)) if (classForQuest(q.id) && (q.giver === npcId || q.turnIn === npcId) && !ids.includes(q.id)) ids.push(q.id);
    return ids.filter(id => QUESTS[id]);
  }

  /** 本宗接引人菜单全量展示，已完成项可灰显，不让进行中的首条任务挡住其余两条。 */
  npcDailyQuestIds(npcId: string) {
    this.refreshDaily();
    return this.npcQuestIds(npcId).filter(id => {
      const q = QUESTS[id];
      return q.daily && this.classAllowed(q) && (q.giver === npcId || q.turnIn === npcId);
    });
  }

  objectiveProgress(q: QuestDef) {
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
    if (changed) this.prog.save();
  }

  talk(npcId: string, questId?: string): { lines: Line[]; after?: () => QuestReward | void } {
    const npc = NPCS[npcId];
    // talk 目标：和目标 NPC 说过话就算完成
    this.onTalk(npcId);
    const fill = (ls: Line[] | undefined) => (ls ?? []).map(l => ({ ...l, text: l.text.replace(/\{name\}/g, this.prog.name) }));
    for (const id of this.npcQuestIds(npcId).filter(id => !questId || id === questId)) {
      const q = QUESTS[id], sc = SCRIPTS[id] ?? {};
      if (!q) continue;
      const lines = (stage: 'offer' | 'progress' | 'complete', fallback?: Line[]) => {
        const key = q.dialogueKeys?.[stage];
        return key ? [{ speaker: npc.name, text: t(key, { name: this.prog.name }) }] : fill(fallback);
      };
      if (q.turnIn === npcId && this.complete(id)) return { lines: lines('complete', sc.turnIn), after: () => this.turnIn(id) };
      if (q.turnIn === npcId && this.isActive(id) && this.classAllowed(q)) {
        const notReady = q.objectives.some(o => o.type === 'breakthrough') && sc.notReady && this.objectiveProgress(q).some(p => p.o.type !== 'breakthrough' && p.cur >= p.need);
        return { lines: lines('progress', notReady ? sc.notReady : sc.progress) };
      }
      if (q.giver === npcId && this.available(id)) return { lines: lines('offer', sc.accept), after: () => { this.accept(id); } };
    }
    return { lines: npc.dialog.map(t => ({ speaker: npc.name, text: t })) };
  }

  accept(id: string) {
    if (!this.available(id)) return false;
    this.prog.quests[id] = { state: 'active', kills: {}, crafted: {} };
    // 06 文档先教回春丹再要求炼成；表只有完成奖励丹方，教学时提前解锁避免闭环。
    if (id === 'q_alchemy_intro') this.prog.grantRecipe('recipe_hp_pill');
    this.prog.save();
    return true;
  }

  turnIn(id: string): QuestReward | undefined {
    if (!this.complete(id)) return undefined;
    const q = QUESTS[id];
    const now = this.now();
    if (q.daily && (!this.prog.canCompleteSectDailyQuest(id, now) || this.prog.quests[id]?.state !== 'active')) return undefined;
    for (const o of q.objectives) if (o.type === 'collect' && o.consume !== false) this.prog.removeItem(o.target!, o.count!);
    const broke = q.objectives.some(o => o.type === 'breakthrough') ? this.prog.breakthrough() : false;
    this.prog.quests[id].state = 'done';
    if (q.daily) {
      const daily = this.prog.settleSectDailyQuest(id, now);
      return daily ? { quest: q, broke, daily } : undefined;
    }
    return { quest: q, broke };
  }

  onKill(monsterId: string) {
    let changed = false;
    for (const id of this.activeIds) {
      const st = this.prog.quests[id];
      if (QUESTS[id].objectives.some(o => o.type === 'kill' && o.target === monsterId)) { st.kills[monsterId] = (st.kills[monsterId] ?? 0) + 1; changed = true; }
    }
    if (changed) this.prog.save();   // G8：击杀数立即存档
  }
  onReach(target: string) {
    for (const id of this.activeIds) if (QUESTS[id].objectives.some(o => o.type === 'reach' && o.target === target)) this.prog.quests[id].reached = true;
  }
  /** 完整试炼控制器胜利时调用；进图、局部机关、失败均不能算通关。 */
  onTrialComplete(trialId: string) {
    if (!trialId || !this.activeIds.some(id => QUESTS[id].objectives.some(o => o.type === 'trial' && o.trial === trialId))) return false;
    if (this.prog.completedTrials.includes(trialId)) return false;
    this.prog.completedTrials.push(trialId);
    this.prog.save();
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
    if (changed) this.prog.save();
  }
}

const SUPPORTED = new Set(['kill', 'collect', 'reach', 'breakthrough', 'talk', 'craft', 'trial']);
function supported(q: QuestDef) { return (!q.daily || dailyRewardsReady(q)) && q.objectives.every(o => SUPPORTED.has(o.type)); }

export interface QuestReward { quest: QuestDef; broke: boolean; daily?: DailyQuestReward; }
