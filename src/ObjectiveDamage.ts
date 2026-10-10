/** 阵眼承伤的唯一算式：来源只提交 atk × 技能/接触倍率等原始伤害。 */
export function objectiveDamage(rawDamage: number, objective: { monsterDamageMul?: number; def?: number }): number {
  const mul = objective.monsterDamageMul ?? 1, def = objective.def ?? 0;
  if (!Number.isFinite(rawDamage) || !Number.isFinite(mul) || !Number.isFinite(def) || rawDamage <= 0 || mul <= 0) return 0;
  // 保留原有顺序：先乘承伤，再减防、四舍五入，正倍率下至少扣 1。
  return Math.max(1, Math.round(rawDamage * mul - def));
}
