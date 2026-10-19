import companionsRaw from '@xt/balance/companions.json';
import skillsRaw from '@xt/balance/skills.json';
import npcsRaw from '@xt/balance/npcs.json';
import { GAME_PHASE } from './data';
import { featureFlags } from './features';
import { parseAffinityIndex } from './Affinity';
import {
  activeCompanion, invite, canInvite, parseCompanionsConfig, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionProgress,
} from './Companions';
import {
  COMPANION_FOLLOW_HARD, companionDealtDamage, companionFollowEntityId, companionPrimarySkillRatio,
  companionReflectDamage, followAnchorX, inAggroRange, inEngageRange, pickCompanionTarget,
  shouldLeashTeleport,
} from './CompanionFollowAi';
import { SKILLS } from './skills';

/** design/41 同行 AI follow 接线静证（≠开态≠soft≠release）。 */
export async function runCompanionFollowAiTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  // —— 硬读常量 ——
  eq(COMPANION_FOLLOW_HARD.followDist, 96, 'followDist=96');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, 'leashDist=320');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, 'aggroRange=320');
  eq(COMPANION_FOLLOW_HARD.primary.skillId, 'sword_qi_slash', 'primary=sword_qi_slash');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, 'effectiveAiCooldownMs=1200');
  eq(COMPANION_FOLLOW_HARD.primary.useTableCooldownMs, false, '禁直用表 cooldownMs');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange, { w: 240, h: 48 }, 'engageRange 240×48');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, 'budgetScale=0.35');
  eq(COMPANION_FOLLOW_HARD.damage.noPerSkillBudgetStack, true, '禁三技能各叠');
  eq(COMPANION_FOLLOW_HARD.mode, 'follow', '本刀仅 follow');
  eq(COMPANION_FOLLOW_HARD.entityNamespace, 'companion_follow', '隔离 namespace');
  eq(companionFollowEntityId(), 'companion_follow:companion_senior_sister_su', '实体 id 命名空间');

  // —— 表只读旁证（不改字节） ——
  eq(companionsRaw.damageRatioOfPlayer, 0.35, '表根 damageRatioOfPlayer=0.35');
  eq(companionsRaw.enabled, true, 'companions 根开');
  eq(companionsRaw.companions[0].enabled, true, '苏条目开');
  const skill = (skillsRaw.skills as { id: string; cooldownMs: number; range: { w: number; h: number } }[])
    .find(s => s.id === 'sword_qi_slash')!;
  eq(skill.cooldownMs, 0, '表 cooldownMs 仍为 0（接线覆写有效 CD）');
  eq(skill.range, { w: 280, h: 48 }, '表 range 仍 280×48（接线略收至 240）');
  ok(SKILLS.sword_qi_slash, 'SKILLS 含 sword_qi_slash');
  eq(Math.abs(companionPrimarySkillRatio(1) - 1.6) < 1e-9, true, 'skillRatio 基值 1.6');

  // —— 伤害公式 ——
  eq(companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 0, roll: 1.0 }),
    Math.max(1, Math.round(100 * 1.6 * 0.35 * 1.0 - 0)), '公式 atk×ratio×0.35×roll');
  const withDef = companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 20, roll: 1.0 });
  eq(withDef, Math.max(1, Math.round(100 * 1.6 * 0.35 - 20)), '公式扣 def');
  eq(companionReflectDamage(100, 0.5), Math.max(1, Math.round(100 * 0.5 * 0.35)), '反伤同乘 0.35');
  // 抽检：同伴单发 ≈ 玩家单发 × 0.35（同 atk／ratio／roll，def=0）
  const playerLike = Math.max(1, Math.round(100 * 1.6 * 1.0));
  const companionLike = companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 0, roll: 1.0 });
  eq(companionLike, Math.max(1, Math.round(playerLike * 0.35)), '同伴单发≈玩家×0.35');

  // —— follow／leash／aggro 几何 ——
  eq(shouldLeashTeleport(0, 400), true, '超 leash 须瞬移');
  eq(shouldLeashTeleport(0, 100), false, '内 leash 不瞬移');
  eq(followAnchorX(1000, 1), 1000 - 96, 'follow 锚点在玩家身后');
  eq(inEngageRange(0, 0, 240, 0), true, 'engage 边界内');
  eq(inEngageRange(0, 0, 241, 0), false, 'engage 略收于表 280');
  eq(inAggroRange(0, 0, 320, 0, 0), true, 'aggro 边界');
  eq(inAggroRange(0, 0, 321, 0, 0), false, '超 aggro');

  const mobs = [
    { x: 50, y: 0, active: true, dead: false, id: 'nearPlayer' },
    { x: 200, y: 0, active: true, dead: false, id: 'nearCompanion' },
    { x: 900, y: 0, active: true, dead: false, id: 'far' },
  ];
  const picked = pickCompanionTarget(mobs, { x: 180, y: 0 }, { x: 0 });
  eq(picked?.id, 'nearPlayer', '优先距玩家近的合法目标');

  // —— 邀请关系＋投影契约（无 Phaser 实体；spawn 由 GameScene 钩） ——
  const parsed = parseCompanionsConfig(companionsRaw, skillsRaw.skills as { id: string }[]);
  eq(parsed.errors, [], 'companions 校验空错');
  ok(parsed.config, 'companions config');
  const affinity = parseAffinityIndex(npcsRaw);
  eq(affinity.errors, [], 'affinity 校验');
  const threshold = affinity.config?.[SU_COMPANION_NPC_ID]?.tiers.find(t => t.id === 'confidant')?.min ?? 300;
  // indexedDbSaves=true 时真实 Progress 同步事务恒 undefined；用 CompanionProgress stub 验关系写入。
  const prog: CompanionProgress = {
    affinity: { [SU_COMPANION_NPC_ID]: threshold },
    runSaveTransaction<T>(apply: () => T | undefined) { return apply(); },
  };
  eq(canInvite(parsed.config, affinity.config, prog).status, 'ok', '知交可邀');
  eq(invite(parsed.config, affinity.config, prog).status, 'ok', '邀请写关系');
  eq(prog.companionRelations, { [SU_COMPANION_ID]: { mode: 'follow' } }, '唯一 follow 关系');
  eq(activeCompanion(parsed.config, prog), { id: SU_COMPANION_ID, mode: 'follow' }, 'activeCompanion 投影');
  eq(invite(parsed.config, affinity.config, prog).status, 'already', '再邀不重复关系');

  // gifts 仍关；邀请不碰 gifts
  eq(affinity.config?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');

  // —— 禁项 ——
  eq(GAME_PHASE, 5, 'GAME_PHASE 不抬');
  const flags = featureFlags();
  ok(!('CompanionOpenFlag' in flags) && !('companionOpen' in flags), '无 CompanionOpenFlag');
  eq(String(COMPANION_FOLLOW_HARD.entityNamespace), 'companion_follow', 'namespace=companion_follow≠FriendlySummons');

  return { assertions };
}
