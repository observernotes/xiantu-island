import { QUESTS, QUEST_ORDER, NPCS, SCRIPTS, ITEMS, MONSTERS, Line, QuestDef, inPhase } from './data';
import type { Progress } from './Progress';

export type NpcMark = '!' | '?' | '…' | null;

/** 任务系统：串行任务链，状态存在 Progress.quests 里。字段见 balance/quests.json */
export class QuestSystem {
  constructor(private prog: Progress) {}

  state(id: string) { return this.prog.quests[id]?.state; }
  get activeIds() { return QUEST_ORDER.filter(id => this.state(id) === 'active'); }
  isActive(id: string) { return this.state(id) === 'active'; }

  /** next 链和独立 prereq 均须完成，且版本阶段、等级、目标类型可用。 */
  available(id: string) {
    if (this.state(id)) return false;
    const q = QUESTS[id];
    if (!q || !inPhase(q) || !supported(q) || !this.prereqsDone(q)) return false;
    return this.prog.level >= q.reqLevel;
  }
  /** 前置已完成但等级不够 */
  levelLocked(id: string) {
    const q = QUESTS[id];
    return !!q && inPhase(q) && supported(q) && !this.state(id) && this.prereqsDone(q) && this.prog.level < q.reqLevel;
  }

  private prereqsDone(q: QuestDef) {
    return (!q.prereq || this.state(q.prereq) === 'done')
      && QUEST_ORDER.filter(id => QUESTS[id].next === q.id).every(id => this.state(id) === 'done');
  }

  /** 06 文档一期入门仍归孙郎中；旧 NPC 表未挂任务时只补这一项入口。 */
  private npcQuestIds(npcId: string) {
    const ids = [...(NPCS[npcId]?.quests ?? [])];
    const intro = QUESTS.q_alchemy_intro;
    if (intro && (intro.giver === npcId || intro.turnIn === npcId) && !ids.includes(intro.id)) ids.push(intro.id);
    return ids.filter(id => QUESTS[id]);
  }

  objectiveProgress(q: QuestDef) {
    const st = this.prog.quests[q.id];
    return q.objectives.map(o => {
      switch (o.type) {
        case 'kill': { const n = st?.kills[o.target!] ?? 0; return { o, cur: Math.min(n, o.count!), need: o.count!, label: `击杀 ${MONSTERS[o.target!]?.name ?? o.target}` }; }
        case 'collect': return { o, cur: Math.min(this.prog.count(o.target!), o.count!), need: o.count!, label: `收集 ${ITEMS[o.target!]?.name ?? o.target}` };
        case 'reach': return { o, cur: st?.reached ? 1 : 0, need: 1, label: '登上望仙台' };
        case 'breakthrough': return { o, cur: this.prog.atBreakthrough ? 1 : 0, need: 1, label: '修为圆满' };
        case 'talk': return { o, cur: st?.talked?.[o.target!] ? 1 : 0, need: 1, label: `与${NPCS[o.target!]?.name ?? o.target}对话` };
        case 'craft': return { o, cur: Math.min(st?.crafted?.[o.target!] ?? 0, o.count ?? 1), need: o.count ?? 1, label: `炼制 ${ITEMS[o.target!]?.name ?? o.target}` };
        default: return { o, cur: 0, need: 1, label: String(o.type) };   // 未支持的目标：永不完成，但不抛错
      }
    });
  }
  complete(id: string) { return this.isActive(id) && this.objectiveProgress(QUESTS[id]).every(p => p.cur >= p.need); }

  /** NPC 头顶标记：可交付 ?、可接 !、进行中 … */
  mark(npcId: string): NpcMark {
    const ids = this.npcQuestIds(npcId);
    if (ids.some(id => QUESTS[id].turnIn === npcId && this.complete(id))) return '?';
    if (ids.some(id => QUESTS[id].giver === npcId && this.available(id))) return '!';
    if (ids.some(id => this.isActive(id) && QUESTS[id].turnIn === npcId)) return '…';
    return null;
  }

  /** 和 NPC 说话：返回要播放的台词和说完后要做的事 */
  talk(npcId: string): { lines: Line[]; after?: () => QuestReward | void } {
    const npc = NPCS[npcId];
    // talk 目标：和目标 NPC 说过话就算完成
    for (const id of this.activeIds) for (const o of QUESTS[id].objectives) if (o.type === 'talk' && o.target === npcId) {
      const st = this.prog.quests[id]; (st.talked ??= {})[npcId] = true; this.prog.save();
    }
    const fill = (ls: Line[] | undefined) => (ls ?? []).map(l => ({ ...l, text: l.text.replace(/\{name\}/g, this.prog.name) }));
    for (const id of this.npcQuestIds(npcId)) {
      const q = QUESTS[id], sc = SCRIPTS[id] ?? {};
      if (!q) continue;
      if (q.turnIn === npcId && this.complete(id)) return { lines: fill(sc.turnIn), after: () => this.turnIn(id) };
      if (q.turnIn === npcId && this.isActive(id)) {
        const notReady = q.objectives.some(o => o.type === 'breakthrough') && sc.notReady && this.objectiveProgress(q).some(p => p.o.type !== 'breakthrough' && p.cur >= p.need);
        return { lines: fill(notReady ? sc.notReady : sc.progress) };
      }
      if (q.giver === npcId && this.available(id)) return { lines: fill(sc.accept), after: () => { this.accept(id); } };
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

  turnIn(id: string): QuestReward {
    const q = QUESTS[id];
    for (const o of q.objectives) if (o.type === 'collect' && o.consume !== false) this.prog.removeItem(o.target!, o.count!);
    const broke = q.objectives.some(o => o.type === 'breakthrough') ? this.prog.breakthrough() : false;
    this.prog.quests[id].state = 'done';
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

const SUPPORTED = new Set(['kill', 'collect', 'reach', 'breakthrough', 'talk', 'craft']);
function supported(q: QuestDef) { return q.objectives.every(o => SUPPORTED.has(o.type)); }

export interface QuestReward { quest: QuestDef; broke: boolean; }
