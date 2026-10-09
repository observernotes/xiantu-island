import { GROWTH, EXP_TO_NEXT, MAX_LEVEL, ITEMS, BREAKTHROUGH_LEVELS, REALMS } from './data';

/** 自动加点：加点界面做好前每级自动分配（演武堂/天机阁确认：根骨 2、身法 2、悟性 1） */
export const AUTO_STATS = { rootBone: 2, agility: 2, insight: 1, spirit: 0 } as Record<string, number>;
const SAVE_KEY = 'xiantu_save_v1';

/** 角色成长与背包（跨地图保留）。公式见 balance/player_growth.json */
export class Progress {
  level = 1; exp = 0; hp = 0; mp = 0; stones = 0;
  inventory: Record<string, number> = {};
  equip: Record<string, string> = {};     // 桃木剑由任务「灵根初现」发放
  job = '';                                 // 转职后的职业 id
  quests: Record<string, { state: 'active' | 'done'; kills: Record<string, number>; reached?: boolean; talked?: Record<string, boolean> }> = {};
  name = '少年';

  constructor() { this.hp = this.maxHp; this.mp = this.maxMp; }

  /** 属性点：每升一级按 AUTO_STATS 自动分配 */
  stat(k: string) { return (AUTO_STATS[k] ?? 0) * (this.level - 1); }
  private statBonus(attr: string) {
    let v = 0;
    for (const [k, eff] of Object.entries(GROWTH.statEffects as Record<string, Record<string, number>>)) v += (eff[attr] ?? 0) * this.stat(k);
    return v;
  }
  get realm() { return REALMS.find((r: any) => this.level >= r.levelMin && this.level <= r.levelMax) ?? REALMS[0]; }
  get realmName() {
    const r = this.realm;
    if (!r.stageLevels) return r.name;
    let i = 0; r.stageLevels.forEach((lv: number, k: number) => { if (this.level >= lv) i = k; });
    return `${r.name}·${r.stages[i]}`;
  }
  get skillsUnlocked() { return this.realm.id !== 'mortal'; }

  save() { try { localStorage.setItem(SAVE_KEY, JSON.stringify(this)); } catch { /* 无痕模式等 */ } }
  static load(): Progress {
    const p = new Progress();
    try { const raw = localStorage.getItem(SAVE_KEY); if (raw) Object.assign(p, JSON.parse(raw)); } catch { /* 存档损坏就重开 */ }
    p.hp = Math.min(p.hp || p.maxHp, p.maxHp); p.mp = Math.min(p.mp || p.maxMp, p.maxMp);
    return p;
  }
  static reset() { try { localStorage.removeItem(SAVE_KEY); } catch { /* ignore */ } }

  private equipSum(stat: string) {
    return Object.values(this.equip).reduce((s, id) => s + (ITEMS[id]?.stats?.[stat] ?? 0), 0);
  }
  get maxHp() { return Math.round(GROWTH.base.hp + GROWTH.perLevel.hp * (this.level - 1) + this.statBonus('hp') + this.equipSum('hp')); }
  get maxMp() { return Math.round(GROWTH.base.mp + GROWTH.perLevel.mp * (this.level - 1) + this.statBonus('mp')); }
  get atk() { return GROWTH.base.atk + GROWTH.perLevel.atk * (this.level - 1) + this.statBonus('atk') + this.equipSum('atk'); }
  get def() { return GROWTH.base.def + GROWTH.perLevel.def * (this.level - 1) + this.statBonus('def') + this.equipSum('def'); }
  get expNeed() { return EXP_TO_NEXT[String(this.level)] ?? Infinity; }
  get atBreakthrough() { return BREAKTHROUGH_LEVELS.includes(this.level) && this.exp >= this.expNeed; }

  /** 玩家打怪伤害：max(1, round(atk·ratio·rand(0.9,1.1) − def))，怪高 n 级 ×max(0.6, 1−0.05n) */
  damageTo(monLevel: number, monDef: number, ratio = 1) {
    const n = monLevel - this.level;
    const gap = n > 0 ? Math.max(0.6, 1 - 0.05 * n) : 1;
    return Math.max(1, Math.round((this.atk * ratio * (0.9 + Math.random() * 0.2) - monDef) * gap));
  }
  /** 怪打玩家：同一公式 */
  damageFrom(monAtk: number, ratio = 1) {
    return Math.max(1, Math.round(monAtk * ratio * (0.9 + Math.random() * 0.2) - this.def));
  }

  /** 加修为，返回升了几级。怪比玩家低 5 级以上按 max(0.2, 1−0.1(n−4)) 衰减；突破关口停住 */
  gainExp(base: number, monLevel: number): { gained: number; levels: number; blocked: boolean } {
    const n = this.level - monLevel;
    const raw = Math.max(1, Math.round(base * (n >= 5 ? Math.max(0.2, 1 - 0.1 * (n - 4)) : 1) * (1 + this.statBonus('expBonus'))));
    const before = this.totalExpMark();
    this.exp += raw;
    let levels = 0, blocked = false;
    while (this.level < MAX_LEVEL && this.exp >= this.expNeed) {
      if (BREAKTHROUGH_LEVELS.includes(this.level)) { this.exp = this.expNeed; blocked = true; break; }
      this.exp -= this.expNeed; this.level++; levels++;
    }
    if (levels) { this.hp = this.maxHp; this.mp = this.maxMp; }   // G2：卡在瓶颈级也要回满
    // G3：瓶颈期被截掉的修为不算“获得”
    const gained = blocked ? Math.max(0, this.totalExpMark() - before) : raw;
    return { gained, levels, blocked };
  }

  /** 当前等级之前累计的修为 + 本级修为，用来算实际加了多少 */
  private totalExpMark() { let t = this.exp; for (let lv = 1; lv < this.level; lv++) t += EXP_TO_NEXT[String(lv)] ?? 0; return t; }

  /** 突破：瓶颈级修为满 → 进入下一级（境界随等级变化） */
  breakthrough() {
    if (!this.atBreakthrough) return false;
    this.exp = 0; this.level++; this.hp = this.maxHp; this.mp = this.maxMp;
    return true;
  }

  count(id: string) { return this.inventory[id] ?? 0; }
  removeItem(id: string, n: number) { this.inventory[id] = Math.max(0, this.count(id) - n); }
  /** 获得装备：对应栏位空着或新装备更强就自动换上（装备界面做好前的过渡） */
  gainEquip(id: string) {
    const it = ITEMS[id] as any; if (!it?.slot) return false;
    if ((it.reqLevel ?? 1) > this.level) { this.addItem(id, 1); return false; }
    const cur = this.equip[it.slot];
    const score = (x?: string) => x ? Object.values(ITEMS[x]?.stats ?? {}).reduce((a, b) => a + b, 0) : -1;
    if (score(id) > score(cur)) { if (cur) this.addItem(cur, 1); this.equip[it.slot] = id; return true; }
    this.addItem(id, 1); return false;
  }

  addItem(id: string, n: number) { this.inventory[id] = (this.inventory[id] ?? 0) + n; }
}
