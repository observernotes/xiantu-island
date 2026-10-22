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
  COMPANION_AREA_HARD, COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD, COMPANION_REFLECT_HARD, areaPreferCondition,
  chooseCompanionCombatSkill, companionAreaSkillRatio, companionDealtDamage, companionFollowEntityId,
  companionPrimarySkillRatio, companionReflectDamage, countLegalInAreaFacingBox, inAreaFacingBox,
  inEngageRange, nextCompanionMode, starveAllowsPrimary,
} from './CompanionFollowAi';
import { SKILLS } from './skills';

/** design/44 同行 AI area＝whirl_sword 接线静证（≠开态≠soft≠release）。 */
export async function runCompanionAreaWhirlTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  // —— 41／42／43 硬读不漂 ——
  eq(COMPANION_FOLLOW_HARD.followDist, 96, 'followDist=96');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, 'leashDist=320');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, 'aggroRange=320');
  eq(COMPANION_FOLLOW_HARD.primary.skillId, 'sword_qi_slash', 'primary');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, 'primary CD1200');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange, { w: 240, h: 48 }, 'engage 240×48');
  eq(COMPANION_FOLLOW_HARD.primary.telegraphMs, 200, 'primary tele');
  eq(COMPANION_FOLLOW_HARD.primary.recoverMs, 200, 'primary rec');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, 'budget 0.35');
  eq(COMPANION_FOLLOW_HARD.damage.noPerSkillBudgetStack, true, '禁各叠');
  eq(COMPANION_FOLLOW_HARD.entityNamespace, 'companion_follow', '隔离 ns');
  eq(COMPANION_MODES_HARD.cycle, ['follow', 'free', 'stay'], 'KeyV cycle');
  eq(COMPANION_MODES_HARD.bind, { defaultCode: 'KeyV', action: 'companion_mode_cycle' }, 'KeyV≠解散');
  eq(COMPANION_MODES_HARD.free.aggroRange, 320, 'free.aggro');
  eq(COMPANION_MODES_HARD.stay.zeroDamage, true, 'stay 零伤');
  eq(COMPANION_MODES_HARD.stay.invulnerable, false, 'stay≠无敌');
  eq(COMPANION_MODES_HARD.stay.stopArea, true, 'stay 不放 area');
  eq(COMPANION_MODES_HARD.schedule, 'primary_area_and_support', 'schedule primary＋area＋support');
  eq(nextCompanionMode('follow'), 'free', 'cycle follow→free');
  eq(nextCompanionMode('stay'), 'follow', 'cycle stay→follow');

  // —— design/44 area 硬读 ——
  eq(COMPANION_AREA_HARD.skillId, 'whirl_sword', 'area=whirl_sword');
  eq(COMPANION_AREA_HARD.effectiveAiCooldownMs, 4000, 'areaCD=4000');
  eq(COMPANION_AREA_HARD.telegraphMs, 250, 'area tele');
  eq(COMPANION_AREA_HARD.recoverMs, 250, 'area rec');
  eq(COMPANION_AREA_HARD.rangeAlign, { w: 160, h: 80, behind: 32 }, 'range 160×80×behind32');
  eq(COMPANION_AREA_HARD.preferThreshold, 2, 'prefer≥2');
  eq(COMPANION_AREA_HARD.starveGuardN, 2, 'N=2');
  eq(COMPANION_AREA_HARD.maxPendingPerTick, 1, 'maxPending=1');
  eq(COMPANION_AREA_HARD.cdIndependent, true, 'CD 独立');
  eq(COMPANION_AREA_HARD.supportLocked, false, 'support 解锁');
  eq(COMPANION_AREA_HARD.supportSkillId, 'sword_shield', '唯一 support=sword_shield 主动 buff');
  eq(COMPANION_AREA_HARD.modes.follow, true, 'follow 可 area');
  eq(COMPANION_AREA_HARD.modes.free, true, 'free 可 area');
  eq(COMPANION_AREA_HARD.modes.stay, false, 'stay 不放 area');
  eq(COMPANION_AREA_HARD.maxTargetsTable, 3, 'maxTargets 旁证 3');

  // —— 表只读旁证（禁改字节） ——
  const whirl = (skillsRaw.skills as {
    id: string; cooldownMs: number; damageRatio: number; maxTargets: number;
    range: { w: number; h: number; behind: number };
  }[]).find(s => s.id === 'whirl_sword')!;
  ok(whirl, '表含 whirl_sword');
  eq(whirl.range, { w: 160, h: 80, behind: 32 }, '表 range 对齐硬读');
  eq(whirl.cooldownMs, 0, '表 CD 仍 0（AI 覆写 4000）');
  eq(whirl.damageRatio, 0.9, '表 damageRatio 0.9');
  eq(whirl.maxTargets, 3, '表 maxTargets 3');
  ok(SKILLS.whirl_sword, 'SKILLS 含 whirl_sword');
  eq(Math.abs(companionAreaSkillRatio(1) - 0.9) < 1e-9, true, 'area skillRatio 0.9');
  eq(Math.abs(companionPrimarySkillRatio(1) - 1.6) < 1e-9, true, 'primary skillRatio 1.6');
  eq(companionsRaw.damageRatioOfPlayer, 0.35, '表 budget 0.35');
  const su = companionsRaw.companions[0];
  eq(su.id, 'companion_senior_sister_su', 'companionId');
  const roles = Object.fromEntries(
    (su.skills as { skillId: string; role: string }[]).map(s => [s.role, s.skillId]));
  eq(roles.primary, 'sword_qi_slash', '表 primary');
  eq(roles.area, 'whirl_sword', '表 area');
  eq(roles.support, 'sword_shield', '表登记唯一主动 buff support');

  // —— 朝向盒几何（对齐 SkillCombat） ——
  // facing>0：x∈[cx-32, cx+160]；y∈[cy-80, cy]
  eq(inAreaFacingBox(0, 0, 1, 160, 0), true, '朝右前界内');
  eq(inAreaFacingBox(0, 0, 1, 161, 0), false, '朝右前界外');
  eq(inAreaFacingBox(0, 0, 1, -32, 0), true, '朝右身后界内');
  eq(inAreaFacingBox(0, 0, 1, -33, 0), false, '朝右身后界外');
  eq(inAreaFacingBox(0, 0, 1, 80, -80), true, '高界内');
  eq(inAreaFacingBox(0, 0, 1, 80, -81), false, '高界外');
  eq(inAreaFacingBox(0, 0, -1, -160, 0), true, '朝左前界内');
  eq(inAreaFacingBox(0, 0, -1, -161, 0), false, '朝左前界外');
  eq(inAreaFacingBox(0, 0, -1, 32, 0), true, '朝左身后界内');
  // primary engage 独立
  eq(inEngageRange(0, 0, 240, 0), true, 'primary engage 独立');
  eq(inEngageRange(0, 0, 241, 0), false, 'primary 不混用 area');

  const mobs = [
    { x: 40, y: 0, active: true, dead: false, id: 'a' },
    { x: 80, y: 0, active: true, dead: false, id: 'b' },
    { x: 120, y: 0, active: true, dead: false, id: 'c' },
    { x: 900, y: 0, active: true, dead: false, id: 'far' },
    { x: 50, y: 0, active: true, dead: true, id: 'dead' },
  ];
  eq(countLegalInAreaFacingBox(mobs, 0, 0, 1), 3, '盒内合法 3（死／远不计）');
  eq(countLegalInAreaFacingBox(mobs.slice(0, 1), 0, 0, 1), 1, '单目标＝1');

  // —— 优先级／饿死／互斥 ——
  eq(areaPreferCondition({ areaReady: true, legalInBox: 2 }), true, '≥2 优先 area');
  eq(areaPreferCondition({ areaReady: true, legalInBox: 1 }), false, '1 不优先 area');
  eq(areaPreferCondition({ areaReady: false, legalInBox: 3 }), false, 'CD 未就绪不优先');

  const areaPick = chooseCompanionCombatSkill({
    areaReady: true, primaryReady: true, legalInBox: 2, primaryInReach: true, areaMissStreak: 0,
  });
  eq(areaPick.skill, 'whirl_sword', '≥2 → area');
  eq(areaPick.nextMissStreak, 0, 'area 命中清 streak');

  const primaryPick = chooseCompanionCombatSkill({
    areaReady: true, primaryReady: true, legalInBox: 1, primaryInReach: true, areaMissStreak: 0,
  });
  eq(primaryPick.skill, 'sword_qi_slash', '1 敌 → primary');
  eq(primaryPick.nextMissStreak, 1, 'miss streak +1');

  const starve1 = chooseCompanionCombatSkill({
    areaReady: false, primaryReady: true, legalInBox: 0, primaryInReach: true, areaMissStreak: 0,
  });
  eq(starve1.skill, 'sword_qi_slash', 'area 假 → primary');
  eq(starveAllowsPrimary(starve1.nextMissStreak), false, 'streak1 < N');
  const starve2 = chooseCompanionCombatSkill({
    areaReady: false, primaryReady: true, legalInBox: 0, primaryInReach: true,
    areaMissStreak: starve1.nextMissStreak,
  });
  eq(starve2.nextMissStreak, 2, 'streak→2');
  eq(starveAllowsPrimary(starve2.nextMissStreak), true, 'N=2 饿死放行');
  eq(starve2.skill, 'sword_qi_slash', '饿死后仍 primary');

  // design/48：唯一 support 可主动调度，原 area／primary 顺序仍在未就绪时沿用。
  const supportPick = chooseCompanionCombatSkill({
    areaReady: true, primaryReady: true, legalInBox: 2, primaryInReach: true, areaMissStreak: 0,
    supportReady: true, mpReady: true, hasActiveShield: false, shieldRemainingMs: 0,
    supportMissStreak: 0, mode: 'follow',
  });
  eq(supportPick.skill, 'sword_shield', '唯一可调度 support=sword_shield 主动 buff');
  eq(areaPick.skill, 'whirl_sword', 'support 未就绪仍按 area 优先');
  eq(primaryPick.skill, 'sword_qi_slash', 'support 未就绪仍可 primary');
  eq(COMPANION_REFLECT_HARD.forbidEmitSwordShield, true, '主动 buff 不解除 reflect forbidEmit');

  // —— budget 同乘一次（primary／area／reflect） ——
  const primaryDmg = companionDealtDamage({
    playerAtk: 100, skillRatio: companionPrimarySkillRatio(1), targetDef: 0, roll: 1.0,
  });
  eq(primaryDmg, Math.max(1, Math.round(100 * 1.6 * 0.35)), 'primary ×0.35 一次');
  const areaDmg = companionDealtDamage({
    playerAtk: 100, skillRatio: companionAreaSkillRatio(1), targetDef: 0, roll: 1.0,
  });
  eq(areaDmg, Math.max(1, Math.round(100 * 0.9 * 0.35)), 'area ×0.35 一次');
  eq(companionDealtDamage({
    playerAtk: 100, skillRatio: 0.9, targetDef: 0, roll: 1.0, budgetScale: 0.35,
  }), areaDmg, '显式 budget 与默认同一份');
  // 禁各叠：不得再建 0.35×0.35
  const stacked = Math.max(1, Math.round(100 * 0.9 * 0.35 * 0.35));
  eq(areaDmg === stacked, false, 'area 非叠乘 0.35²');
  eq(companionReflectDamage(100, 0.5), Math.max(1, Math.round(100 * 0.5 * 0.35)), 'reflect 同乘一次');

  // —— stay／关系／gifts／Flag ——
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
  eq(COMPANION_AREA_HARD.modes.stay, false, 'stay 模式不放 area');
  eq(COMPANION_MODES_HARD.stay.stopArea, true, 'stay.stopArea');
  eq(affinity.config?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');
  eq(GAME_PHASE, 5, 'PHASE 不抬');
  const flags = featureFlags();
  ok(!('CompanionOpenFlag' in flags) && !('companionOpen' in flags), '无 CompanionOpenFlag');
  ok(!('softOpenedCompanion' in flags) && !('softOpenedCompanionArea' in flags), '无 softOpenedCompanion＊');
  eq(companionFollowEntityId(), 'companion_follow:companion_senior_sister_su', '实体 id');

  return { assertions };
}
