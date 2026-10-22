import companionsRaw from '@xt/balance/companions.json';
import skillsRaw from '@xt/balance/skills.json';
import npcsRaw from '@xt/balance/npcs.json';
import { GAME_PHASE } from './data';
import { featureFlags } from './features';
import { parseAffinityIndex } from './Affinity';
import {
  activeCompanion, cycleCompanionMode, invite, parseCompanionsConfig, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionProgress,
} from './Companions';
import {
  COMPANION_AREA_HARD, COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD, COMPANION_REFLECT_HARD,
  chooseCompanionCombatSkill, companionDealtDamage, companionFollowEntityId, companionPrimarySkillRatio, companionReflectDamage,
  companionReflectRatioFromTable, companionReflectResolve, companionReflectShouldApply,
  nextCompanionMode,
} from './CompanionFollowAi';
import { SKILLS } from './skills';

/** design/45 同行 AI 受击反伤接线静证（≠开态≠soft≠release）。 */
export async function runCompanionReflectHookTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  // —— 41／42／43／44 硬读不漂 ——
  eq(COMPANION_FOLLOW_HARD.followDist, 96, 'followDist=96');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, 'leashDist=320');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, 'aggroRange=320');
  eq(COMPANION_FOLLOW_HARD.primary.skillId, 'sword_qi_slash', 'primary');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, 'primary CD1200');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange, { w: 240, h: 48 }, 'engage 240×48');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, 'budget 0.35');
  eq(COMPANION_FOLLOW_HARD.damage.reflectAlsoScaled, true, 'reflectAlsoScaled');
  eq(COMPANION_FOLLOW_HARD.damage.noPerSkillBudgetStack, true, '禁各叠');
  eq(COMPANION_FOLLOW_HARD.entityNamespace, 'companion_follow', '隔离 ns');
  eq(COMPANION_MODES_HARD.cycle, ['follow', 'free', 'stay'], 'KeyV cycle');
  eq(COMPANION_MODES_HARD.bind, { defaultCode: 'KeyV', action: 'companion_mode_cycle' }, 'KeyV≠解散');
  eq(COMPANION_MODES_HARD.free.aggroRange, 320, 'free.aggro');
  eq(COMPANION_MODES_HARD.stay.zeroDamage, true, 'stay 零伤');
  eq(COMPANION_MODES_HARD.stay.invulnerable, false, 'stay≠无敌');
  eq(COMPANION_MODES_HARD.stay.stopArea, true, 'stay 不放 area');
  eq(COMPANION_MODES_HARD.stay.stopReflect, true, 'stay 不放反伤');
  eq(COMPANION_MODES_HARD.stay.cancelPendingReflectOnEnter, true, '切 stay 取消 pendingReflect');
  eq(COMPANION_MODES_HARD.schedule, 'primary_area_and_support', 'schedule 含主动 support');
  eq(nextCompanionMode('follow'), 'free', 'cycle follow→free');
  eq(nextCompanionMode('stay'), 'follow', 'cycle stay→follow');

  eq(COMPANION_AREA_HARD.skillId, 'whirl_sword', 'area=whirl_sword');
  eq(COMPANION_AREA_HARD.effectiveAiCooldownMs, 4000, 'areaCD=4000');
  eq(COMPANION_AREA_HARD.rangeAlign, { w: 160, h: 80, behind: 32 }, 'range 160×80×behind32');
  eq(COMPANION_AREA_HARD.starveGuardN, 2, 'N=2');
  eq(COMPANION_AREA_HARD.supportLocked, false, 'support 解锁');
  eq(COMPANION_AREA_HARD.supportSkillId, 'sword_shield', '唯一 support=sword_shield 主动 buff');
  eq(chooseCompanionCombatSkill({
    areaReady: false, primaryReady: false, legalInBox: 0, primaryInReach: false, areaMissStreak: 0,
    supportReady: true, mpReady: true, hasActiveShield: false, shieldRemainingMs: 0,
    supportMissStreak: 0, mode: 'follow',
  }).skill, 'sword_shield', '主动 support 可选；reflect 保持被动通道');
  eq(COMPANION_AREA_HARD.modes.stay, false, 'stay 不放 area');

  // —— design/45 reflect 硬读 ——
  eq(COMPANION_REFLECT_HARD.companionId, SU_COMPANION_ID, 'companionId');
  eq(COMPANION_REFLECT_HARD.enabled, true, 'reflect.enabled');
  eq(COMPANION_REFLECT_HARD.semantic, 'passive_on_hit', '仅受击被动');
  eq(COMPANION_REFLECT_HARD.ratio, 0.5, 'ratio=0.5');
  eq(COMPANION_REFLECT_HARD.ratioReadPath, 'skills.sword_shield.effects.reflectRatio', '读表路径');
  eq(COMPANION_REFLECT_HARD.ratioSource, 'effects', 'effects 基值');
  eq(COMPANION_REFLECT_HARD.forbidEmitSwordShield, true, 'forbidEmit');
  eq(COMPANION_REFLECT_HARD.supportSkillIdNeverEmit, 'sword_shield', '禁 emit id');
  eq(COMPANION_REFLECT_HARD.helper, 'companionReflectDamage', 'helper');
  eq(COMPANION_REFLECT_HARD.budgetScale, 0.35, 'budgetScale');
  eq(COMPANION_REFLECT_HARD.reflectAlsoScaled, true, 'reflectAlsoScaled');
  eq(COMPANION_REFLECT_HARD.noSecondBudgetStackWithPrimaryOrArea, true, '禁二次叠乘');
  eq(COMPANION_REFLECT_HARD.trigger, 'hostileHitOnCompanion', 'trigger');
  eq(COMPANION_REFLECT_HARD.target, 'thatAttackerOnly', 'target');
  eq(COMPANION_REFLECT_HARD.skipIfAttackerDeadOrGoneOrUnhittable, true, 'skip dead');
  eq(COMPANION_REFLECT_HARD.visibleFeedback, 'attackerHpDropAndDamageNumber', '可见掉血+跳字');
  eq(COMPANION_REFLECT_HARD.modes.follow, true, 'follow 可反伤');
  eq(COMPANION_REFLECT_HARD.modes.free, true, 'free 可反伤');
  eq(COMPANION_REFLECT_HARD.modes.stay, false, 'stay 不反伤');
  eq(COMPANION_REFLECT_HARD.stay.zeroDamage, true, 'stay.zeroDamage 含不放反伤');
  eq(COMPANION_REFLECT_HARD.stay.cancelPendingReflectOnEnter, true, 'cancel pending');
  eq(COMPANION_REFLECT_HARD.stay.invulnerable, false, 'stay≠无敌');

  // —— 读表：effects 基值 0.5；不用 perLevel 0.05 ——
  const shield = (skillsRaw.skills as {
    id: string;
    effects: { reflectRatio: number };
    perLevel: { reflectRatio: number };
  }[]).find(s => s.id === 'sword_shield')!;
  ok(shield, '表含 sword_shield');
  eq(shield.effects.reflectRatio, 0.5, '表 effects.reflectRatio=0.5');
  eq(shield.perLevel.reflectRatio, 0.05, '表 perLevel 旁证 0.05（不进硬读）');
  eq(companionReflectRatioFromTable(), 0.5, '读表函数=0.5');
  eq(companionReflectRatioFromTable() === shield.effects.reflectRatio, true, '读表＝effects 基值');
  eq(companionReflectRatioFromTable() === shield.perLevel.reflectRatio, false, '≠perLevel');
  ok(SKILLS.sword_shield, 'SKILLS 含 sword_shield（reflect 只读比值）');
  eq(typeof SKILLS.sword_shield.effects.reflectRatio, 'number', 'runtime effects 可读');

  // —— helper／budget 同乘一次 ——
  eq(companionReflectDamage(100, 0.5), Math.max(1, Math.round(100 * 0.5 * 0.35)), 'helper 100→18');
  eq(companionReflectDamage(100, 0.5), 18, '例 100×0.5×0.35=18');
  const resolved = companionReflectResolve({ incomingHitDamage: 100 });
  eq(resolved.damage, 18, 'resolve damage=18');
  eq(resolved.ratio, 0.5, 'resolve ratio');
  eq(resolved.budgetScale, 0.35, 'resolve budget 一次');
  eq(resolved.emitSkillId, null, 'forbidEmit → emitSkillId=null');
  const primaryDmg = companionDealtDamage({
    playerAtk: 100, skillRatio: companionPrimarySkillRatio(1), targetDef: 0, roll: 1.0,
  });
  eq(primaryDmg, Math.max(1, Math.round(100 * 1.6 * 0.35)), 'primary ×0.35 一次');
  const stacked = Math.max(1, Math.round(100 * 0.5 * 0.35 * 0.35));
  eq(resolved.damage === stacked, false, 'reflect 非叠乘 0.35²');

  // —— 合法命中门禁 ——
  eq(companionReflectShouldApply({
    mode: 'follow', incomingHitDamage: 10, attackerHostile: true, attackerHittable: true,
  }), true, 'follow+敌对+incoming>0 → 是');
  eq(companionReflectShouldApply({
    mode: 'free', incomingHitDamage: 10, attackerHostile: true, attackerHittable: true,
  }), true, 'free → 是');
  eq(companionReflectShouldApply({
    mode: 'stay', incomingHitDamage: 10, attackerHostile: true, attackerHittable: true,
  }), false, 'stay → 否（零伤含不放反伤）');
  eq(companionReflectShouldApply({
    mode: 'follow', incomingHitDamage: 0, attackerHostile: true, attackerHittable: true,
  }), false, 'incoming=0 → 否');
  eq(companionReflectShouldApply({
    mode: 'follow', incomingHitDamage: 10, attackerHostile: false, attackerHittable: true,
  }), false, '非敌对（玩家／友方／环境）→ 否');
  eq(companionReflectShouldApply({
    mode: 'follow', incomingHitDamage: 10, attackerHostile: true, attackerHittable: false,
  }), false, '攻击者不可伤 → 跳过');
  eq(companionReflectShouldApply({
    mode: null, incomingHitDamage: 10, attackerHostile: true, attackerHittable: true,
  }), false, '无 mode → 否');

  // —— 关系／gifts／Flag／PHASE ——
  const parsed = parseCompanionsConfig(companionsRaw, skillsRaw.skills as { id: string }[]);
  eq(parsed.errors, [], 'companions 校验');
  ok(parsed.config, 'config');
  const affinity = parseAffinityIndex(npcsRaw);
  eq(affinity.errors, [], 'affinity');
  const threshold = affinity.config?.[SU_COMPANION_NPC_ID]?.tiers.find(t => t.id === 'confidant')?.min ?? 300;
  const prog: CompanionProgress = {
    affinity: { [SU_COMPANION_NPC_ID]: threshold },
    runSaveTransaction<T>(apply: () => T | undefined) { return apply(); },
  };
  eq(invite(parsed.config, affinity.config, prog).status, 'ok', '邀请');
  eq(activeCompanion(parsed.config, prog)?.mode, 'follow', '初始 follow');
  eq(cycleCompanionMode(parsed.config, prog), 'free', '→free');
  eq(cycleCompanionMode(parsed.config, prog), 'stay', '→stay');
  eq(affinity.config?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');
  eq(GAME_PHASE, 5, 'PHASE 不抬');
  const flags = featureFlags();
  ok(!('CompanionOpenFlag' in flags) && !('companionOpen' in flags), '无 CompanionOpenFlag');
  ok(!('softOpenedCompanion' in flags)
    && !Object.keys(flags).some(k => k.startsWith('softOpenedCompanion')), '无 softOpenedCompanion＊');
  eq(companionFollowEntityId(), 'companion_follow:companion_senior_sister_su', '实体 id');
  eq(companionsRaw.damageRatioOfPlayer, 0.35, '表 budget 0.35');

  return { assertions };
}
