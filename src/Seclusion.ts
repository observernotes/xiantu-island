import { DENSITY_REF, REALMS, SECT_SECLUSION, SECLUSION_RULES } from './data';
import type { Progress } from './Progress';

/** 本地日历日，不把游戏内闭关年份算进现实日上限。 */
export function realDay(now = Date.now()) {
  const d = new Date(now);
  return `${d.getFullYear()}-${d.getMonth() + 1}-${d.getDate()}`;
}

export type SeclusionRequest = { mode?: string; reqRealm?: string };
export class Seclusion {
  constructor(private prog: Progress) {}

  locked(request: SeclusionRequest) {
    const required = [request.reqRealm, SECT_SECLUSION.unlockRealm].filter(Boolean);
    return request.mode !== 'sect' || required.some(id => {
      const realm = REALMS.find(r => r.id === id);
      return !realm || this.prog.level < realm.levelMin;
    });
  }

  check(request: SeclusionRequest, years: number, now = Date.now()): 'locked' | 'cost' | 'daily' | 'life' | null {
    if (this.locked(request) || !SECT_SECLUSION.options.includes(years)) return 'locked';
    const cost = SECT_SECLUSION.contributionCost[String(years)];
    if (!Number.isFinite(cost) || this.prog.sectContribution < cost) return 'cost';
    const used = this.prog.seclusionDay === realDay(now) ? this.prog.seclusionYearsToday : 0;
    if (used + years > SECT_SECLUSION.maxYearsPerRealDay) return 'daily';
    this.prog.advanceAge(now);
    if (this.prog.remainingLife <= years) return 'life';
    return null;
  }

  /** 配表没有现实等待时长；确认后逐年结算游戏内年数并立即落盘。 */
  settle(request: SeclusionRequest, years: number, now = Date.now()) {
    const reason = this.check(request, years, now);
    if (reason) return { ok: false as const, reason };
    const p = this.prog;
    const cost = SECT_SECLUSION.contributionCost[String(years)];
    p.sectContribution -= cost;
    if (p.seclusionDay !== realDay(now)) { p.seclusionDay = realDay(now); p.seclusionYearsToday = 0; }
    p.seclusionYearsToday += years;
    let gained = 0, overflowed = 0, levels = 0, blocked = false, overflowFilled = false;
    for (let year = 0; year < years; year++) {
      const realmMul = (SECLUSION_RULES.realmMul as Record<string, number>)[p.realm.id] ?? 1;
      const base = Number.isFinite(p.expNeed) ? p.expNeed * SECLUSION_RULES.perYearRatio
        * SECT_SECLUSION.density / DENSITY_REF * realmMul * SECT_SECLUSION.roomMul : 0;
      const r = p.gainCultivation(base);
      gained += r.gained; overflowed += r.overflowed; levels += r.levels;
      blocked ||= r.blocked; overflowFilled ||= r.overflowFilled;
      p.age += 1;
    }
    p.seclusionHistory.push({ at: now, years, cost, gained, overflowed });
    p.seclusionHistory = p.seclusionHistory.slice(-20);
    p.save();
    return { ok: true as const, years, cost, gained, overflowed, levels, blocked, overflowFilled };
  }
}
