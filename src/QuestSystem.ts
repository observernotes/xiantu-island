import { QUESTS, QUEST_ORDER, NPCS, SCRIPTS, ITEMS, MONSTERS, Line, QuestDef } from './data';
import type { Progress } from './Progress';

export type NpcMark = '!' | '?' | '…' | null;

/** 任务系统：串行任务链，状态存在 Progress.quests 里。字段见 balance/quests.json */
export class QuestSystem {
  constructor(private prog: Progress) {}

  state(id: string) { return this.prog.quests[id]?.state; }
  get activeIds() { return QUEST_ORDER.filter(id => this.state(id) === 'active'); }
  isActive(id: string) { return this.state(id) === 'active'; }

  /** 是否可接：前一个任务（指向它的 next）已完成，且等级够；目标类型本版本不支持的任务（如 craft）先不开放 */
  available(id: string) {
    if (this.state(id)) return false;
    const q = QUESTS[id];
    if (!supported(q)) return false;
    const prev = QUEST_ORDER.find(p => QUESTS[p].next === id);
    if (prev && this.state(prev) !== 'done') return false;
    return this.prog.level >= q.reqLevel;
  }
  /** 前置已完成但等级不够 */
  levelLocked(id: string) {
    const prev = QUEST_ORDER.find(p => QUESTS[p].next === id);
    return !this.state(id) && (!prev || this.state(prev) === 'done') && this.prog.level < QUESTS[id].reqLevel;
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
        default: return { o, cur: 0, need: 1, label: String(o.type) };   // 未支持的目标：永不完成，但不抛错
      }
    });
  }
  complete(id: string) { return this.isActive(id) && this.objectiveProgress(QUESTS[id]).every(p => p.cur >= p.need); }

  /** NPC 头顶标记：可交付 ?、可接 !、进行中 … */
  mark(npcId: string): NpcMark {
    const ids = NPCS[npcId]?.quests ?? [];
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
    for (const id of npc.quests) {
      const q = QUESTS[id], sc = SCRIPTS[id] ?? {};
      if (q.turnIn === npcId && this.complete(id)) return { lines: fill(sc.turnIn), after: () => this.turnIn(id) };
      if (q.turnIn === npcId && this.isActive(id)) {
        const notReady = q.objectives.some(o => o.type === 'breakthrough') && sc.notReady && this.objectiveProgress(q).some(p => p.o.type !== 'breakthrough' && p.cur >= p.need);
        return { lines: fill(notReady ? sc.notReady : sc.progress) };
      }
      if (q.giver === npcId && this.available(id)) return { lines: fill(sc.accept), after: () => { this.accept(id); } };
    }
    return { lines: npc.dialog.map(t => ({ speaker: npc.name, text: t })) };
  }

  accept(id: string) { this.prog.quests[id] = { state: 'active', kills: {} }; this.prog.save(); }

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
}

const SUPPORTED = new Set(['kill', 'collect', 'reach', 'breakthrough', 'talk']);
function supported(q: QuestDef) { return q.objectives.every(o => SUPPORTED.has(o.type)); }

export interface QuestReward { quest: QuestDef; broke: boolean; }
