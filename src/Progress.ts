import { GROWTH, EXP_TO_NEXT, MAX_LEVEL, ITEMS, BREAKTHROUGH_LEVELS } from './data';

/** 角色成长与背包（跨地图保留）。公式见 balance/player_growth.json */
export class Progress {
  level = 1; exp = 0; hp = 0; mp = 0; stones = 0;
  inventory: Record<string, number> = {};
  equip: Record<string, string> = { weapon: 'wood_sword' };   // v0.2 先默认佩桃木剑，任务接入后改成任务发放

  constructor() { this.hp = this.maxHp; this.mp = this.maxMp; }

  private equipSum(stat: string) {
    return Object.values(this.equip).reduce((s, id) => s + (ITEMS[id]?.stats?.[stat] ?? 0), 0);
  }
  get maxHp() { return Math.round(GROWTH.base.hp + GROWTH.perLevel.hp * (this.level - 1) + this.equipSum('hp')); }
  get maxMp() { return Math.round(GROWTH.base.mp + GROWTH.perLevel.mp * (this.level - 1)); }
  get atk() { return GROWTH.base.atk + GROWTH.perLevel.atk * (this.level - 1) + this.equipSum('atk'); }
  get def() { return GROWTH.base.def + GROWTH.perLevel.def * (this.level - 1) + this.equipSum('def'); }
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
    const gained = Math.max(1, Math.round(base * (n >= 5 ? Math.max(0.2, 1 - 0.1 * (n - 4)) : 1)));
    this.exp += gained;
    let levels = 0;
    while (this.level < MAX_LEVEL && this.exp >= this.expNeed) {
      if (BREAKTHROUGH_LEVELS.includes(this.level)) { this.exp = this.expNeed; return { gained, levels, blocked: true }; }
      this.exp -= this.expNeed; this.level++; levels++;
    }
    if (levels) { this.hp = this.maxHp; this.mp = this.maxMp; }
    return { gained, levels, blocked: false };
  }

  addItem(id: string, n: number) { this.inventory[id] = (this.inventory[id] ?? 0) + n; }
}
