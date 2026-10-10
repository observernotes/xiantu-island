// 功法表与纯计算。数值全部来自 balance/skills.json，不在这里写死伤害、范围、消耗。
import skillsJson from '@xt/balance/skills.json';

export interface SkillRange { w: number; h: number; behind?: number }
export interface SkillDef {
  id: string; name: string; sect: string | null; job: number;
  type: 'active' | 'buff' | 'passive' | string;
  maxLevel: number; spCost: number; masteryPerHit: number; masteryToCap: number;
  mpCost: number; cooldownMs: number; damageRatio: number; hitCount: number; maxTargets: number;
  range: SkillRange | null; durationMs: number;
  perLevel: Record<string, number>;
  effects: Record<string, number | boolean | string>;
  req: Record<string, number | string> | null;
  fx: string | null; icon: string; key?: string;
}

const raw = skillsJson as unknown as { rules: SkillRules; skills: SkillDef[] };
export interface SkillRules {
  spPerLevel: number; jobAdvanceBonusSp: number; masteryCapBonus: number;
  budget?: Record<string, { levels?: string; sp?: number; needToMaxAll?: number }>;
}
export const SKILL_RULES: SkillRules = raw.rules;
export const SKILL_LIST: SkillDef[] = raw.skills;
export const SKILLS: Record<string, SkillDef> = Object.fromEntries(SKILL_LIST.map(s => [s.id, s]));

/** 八格快捷栏。左手键位沿用冒险岛习惯；C 是跳跃、E 预留装备、K 是功法窗口，所以后两格用 Q、W。 */
export const HOTBAR_SLOTS = [
  { label: 'A', code: 'KeyA' },
  { label: 'S', code: 'KeyS' },
  { label: 'D', code: 'KeyD' },
  { label: 'F', code: 'KeyF' },
  { label: 'G', code: 'KeyG' },
  { label: 'H', code: 'KeyH' },
  { label: 'Q', code: 'KeyQ' },
  { label: 'W', code: 'KeyW' },
] as const;

export const SKILL_WINDOW_CODE = 'KeyK';

/**
 * 设计文档 05 的手感，表里没有这些字段：
 * 剑气斩后摇约 400ms、可被跳跃取消，第 2 帧（约 90ms）出剑气；
 * 回风剑约 300ms，其中 200ms 霸体；轻身术无后摇锁定。
 * 表内 cooldownMs 为 0 时，施放间隔取这里的 recoverMs，并用来画快捷栏遮罩。
 */
export interface SkillAct {
  kind: 'projectile' | 'aoe' | 'buff' | 'summon' | 'dash';
  recoverMs: number; hitDelayMs: number;
  jumpCancel?: boolean; superArmorMs?: number;
}
export const SKILL_ACT: Record<string, SkillAct> = {
  spirit_bolt: { kind: 'projectile', recoverMs: 400, hitDelayMs: 90, jumpCancel: true },
  sword_qi_slash: { kind: 'projectile', recoverMs: 400, hitDelayMs: 90, jumpCancel: true },
  whirl_sword: { kind: 'aoe', recoverMs: 300, hitDelayMs: 100, superArmorMs: 200 },
  light_body: { kind: 'buff', recoverMs: 200, hitDelayMs: 0 },
};

/** skills.json 没有弹道速度。剑气按这个速度飞完 range.w。 */
export const PROJECTILE_SPEED = 480;
/** 设计文档：剑气命中顿帧 */
export const HITSTOP_MS = 50;
/** 设计文档：增益结束前 5 秒图标闪烁 */
export const BUFF_WARN_MS = 5000;
/** 美术说明：轻身术结束 200ms 淡出 */
export const BUFF_FADE_MS = 200;

export function actOf(def: SkillDef): SkillAct {
  const spec = SKILL_ACT[def.id];
  if (spec) return spec;
  const recoverMs = typeof def.effects.recoverMs === 'number' ? Math.max(0, def.effects.recoverMs) : def.type === 'buff' ? 200 : 300;
  if (def.type === 'buff') return { kind: 'buff', recoverMs, hitDelayMs: 0 };
  if (typeof def.effects.summon === 'string') return { kind: 'summon', recoverMs, hitDelayMs: 0 };
  if (typeof def.effects.dashDistance === 'number') return { kind: 'dash', recoverMs, hitDelayMs: 0 };
  if (def.key?.startsWith('default:') || typeof def.effects.projectileCount === 'number') {
    return { kind: 'projectile', recoverMs, hitDelayMs: 90, jumpCancel: true };
  }
  return { kind: 'aoe', recoverMs, hitDelayMs: 80 };
}

export function skillsForJob(job: number) { return SKILL_LIST.filter(s => s.job === job); }

/** 目标数、段数、发数。带小数的成长用 floorCount，伤害倍率和百分比不要进来。 */
export function isIntegerCountField(key: string) {
  return key === 'count' || /Count$/.test(key) || /Targets$/.test(key);
}

/** Math.floor，先加一个很小的数，避免 0.2×5 这类二进制误差掉到整数下面。 */
export function floorCount(n: number) {
  if (!Number.isFinite(n)) return 0;
  return Math.floor(n + 1e-8);
}

/** 技能根上这些字段是 1 级时的值，之后每级再加 perLevel。 */
const LV1_BASE_FIELDS = new Set(['mpCost', 'cooldownMs', 'damageRatio', 'hitCount', 'maxTargets', 'durationMs']);

/**
 * 取技能在某一级的数值。
 * - 根字段 / effects 里有的战斗数值：Lv1 基础 + perLevel × (等级 - 1)
 * - 只写在 perLevel 里的加成（speed、jump、atk…）：perLevel × 等级（1 级就有一份）
 * - maxTargets、hitCount、count 等整数计数字段：结果 Math.floor
 * - 伤害倍率、百分比原样返回
 */
export function skillNumber(def: SkillDef, key: string, level: number): number {
  if (!(level > 0)) return 0;
  const per = typeof def.perLevel?.[key] === 'number' ? def.perLevel[key] : 0;
  const effect = def.effects && typeof def.effects[key] === 'number' ? def.effects[key] as number : undefined;
  const root = typeof (def as unknown as Record<string, unknown>)[key] === 'number'
    ? (def as unknown as Record<string, number>)[key] : undefined;
  const base = effect ?? (LV1_BASE_FIELDS.has(key) ? root : undefined);
  const raw = base == null ? per * level : base + per * (level - 1);
  return isIntegerCountField(key) ? floorCount(raw) : raw;
}

export function skillRange(def: SkillDef): { w: number; h: number; behind: number } | null {
  if (!def.range) return null;
  return { w: def.range.w, h: def.range.h, behind: def.range.behind ?? 0 };
}

/** 解析 rules.budget.jobN.levels（如 "10-29"）。表里没有 spPerLevel 时按每级 3 点。 */
export function spBand(job: number): { min: number; max: number } | null {
  const levels = SKILL_RULES.budget?.[`job${job}`]?.levels;
  const m = typeof levels === 'string' ? levels.match(/(\d+)\s*-\s*(\d+)/) : null;
  if (!m) return null;
  return { min: Number(m[1]), max: Number(m[2]) };
}

export function spPerLevel() { return Number(SKILL_RULES.spPerLevel ?? 3); }

/** 某一转已获得的技能点（还没扣消耗）。一转在职业 id 写入后额外加上 jobAdvanceBonusSp。 */
export function spEarnedFor(level: number, job: number, jobAdvanced: boolean) {
  const band = spBand(job);
  if (!band || level < band.min) return 0;
  const count = Math.min(level, band.max) - band.min + 1;
  const bonus = job === 1 && jobAdvanced ? Number(SKILL_RULES.jobAdvanceBonusSp ?? 0) : 0;
  return count * spPerLevel() + bonus;
}

const STAT_LABEL: Record<string, string> = {
  atk: '攻击', mpRegenPer10s: '每10秒回灵', hit: '命中', minDamageRatio: '最低伤害',
  speed: '移速', jump: '跳跃', spirit: '神识', rootBone: '根骨', agility: '身法',
  critRate: '暴击率', evade: '闪避', attackSpeedRatio: '攻速', extraAirJumps: '空中跳跃次数',
};

function trimNum(n: number) {
  if (!Number.isFinite(n)) return '0';
  if (Number.isInteger(n)) return String(n);
  return String(Math.round(n * 1000) / 1000);
}

export function typeLabel(type: string) {
  return type === 'passive' ? '被动' : type === 'buff' ? '增益' : '主动';
}

/** 技能窗口里的一行简介。level < 1 时按 1 级预览。 */
export function describeSkill(def: SkillDef, level: number) {
  const lv = Math.max(level, 1);
  const bits: string[] = [];
  const mp = skillNumber(def, 'mpCost', lv);
  if (mp) bits.push(`灵力 ${trimNum(mp)}`);
  const cd = skillNumber(def, 'cooldownMs', lv);
  if (cd > 0) bits.push(`冷却 ${(cd / 1000).toFixed(1)}秒`);
  if (def.type !== 'passive' && def.damageRatio) bits.push(`伤害 ×${trimNum(skillNumber(def, 'damageRatio', lv))}`);
  if (def.maxTargets) bits.push(`目标 ${skillNumber(def, 'maxTargets', lv)}`);
  const segs = skillNumber(def, 'hitCount', lv);
  if (def.hitCount > 1) bits.push(`${segs}段`);
  const dur = skillNumber(def, 'durationMs', lv);
  if (dur > 0) bits.push(`持续 ${Math.round(dur / 1000)}秒`);
  if (def.perLevel?.speed) bits.push(`移速 +${trimNum(skillNumber(def, 'speed', lv))}`);
  if (def.perLevel?.jump) bits.push(`跳跃 +${trimNum(skillNumber(def, 'jump', lv))}`);
  if (def.type === 'passive') {
    for (const k of Object.keys(def.perLevel ?? {})) bits.push(`${STAT_LABEL[k] ?? k} +${trimNum(skillNumber(def, k, lv))}`);
  }
  return bits.join('  ');
}

/** 早期主线旧档补发：只读取当前表的 skills，不继承已经移除的奖励。 */
export const QUEST_SKILL_BACKFILL = ['q_breakthrough', 'q_fox'];
