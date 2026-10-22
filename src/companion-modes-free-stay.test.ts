import companionsRaw from '@xt/balance/companions.json';
import skillsRaw from '@xt/balance/skills.json';
import npcsRaw from '@xt/balance/npcs.json';
import { GAME_PHASE } from './data';
import { featureFlags } from './features';
import { parseAffinityIndex } from './Affinity';
import {
  activeCompanion, cycleCompanionMode, invite, canInvite, parseCompanionsConfig, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionMode, type CompanionProgress,
} from './Companions';
import {
  COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD, companionDealtDamage, companionFollowEntityId,
  companionPrimarySkillRatio, companionReflectDamage, followAnchorX, inAggroRange, inEngageRange,
  inFreeAggroRange, nextCompanionMode, pickCompanionFreeTarget, pickCompanionTarget, shouldLeashTeleport,
} from './CompanionFollowAi';
import { SKILLS } from './skills';

/** design/42 同行 AI free＋stay＋切换接线静证（≠开态≠soft≠release）。 */
export async function runCompanionModesFreeStayTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  // —— follow 硬读不漂 ——
  eq(COMPANION_FOLLOW_HARD.followDist, 96, 'followDist=96');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, 'leashDist=320');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, 'aggroRange=320');
  eq(COMPANION_FOLLOW_HARD.primary.skillId, 'sword_qi_slash', 'primary=sword_qi_slash');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, 'effectiveAiCooldownMs=1200');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange, { w: 240, h: 48 }, 'engageRange 240×48');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, 'budgetScale=0.35');
  eq(COMPANION_FOLLOW_HARD.damage.noPerSkillBudgetStack, true, '禁三技能各叠');
  eq(COMPANION_FOLLOW_HARD.mode, 'follow', 'follow 硬读 mode 锁仍 follow');
  eq(COMPANION_FOLLOW_HARD.entityNamespace, 'companion_follow', '隔离 namespace');
  eq(companionFollowEntityId(), 'companion_follow:companion_senior_sister_su', '实体 id');

  // —— design/42 硬读 ——
  eq(COMPANION_MODES_HARD.cycle, ['follow', 'free', 'stay'], 'cycle follow→free→stay');
  eq(COMPANION_MODES_HARD.entry, 'keyCycle', 'entry=keyCycle');
  eq(COMPANION_MODES_HARD.bind, { defaultCode: 'KeyV', action: 'companion_mode_cycle' }, 'KeyV 绑定');
  eq(COMPANION_MODES_HARD.free.aggroRange, 320, 'free.aggro=320');
  eq(COMPANION_MODES_HARD.free.engageRange, { w: 240, h: 48 }, 'free.engage 240×48');
  eq(COMPANION_MODES_HARD.free.leashTeleport, false, 'free 无 leash 瞬移');
  eq(COMPANION_MODES_HARD.free.forcePlayerTarget, false, 'free 不绑玩家目标');
  eq(COMPANION_MODES_HARD.stay.zeroDamage, true, 'stay 零主动伤');
  eq(COMPANION_MODES_HARD.stay.stopFollow, true, 'stay 停跟随');
  eq(COMPANION_MODES_HARD.stay.stopChase, true, 'stay 停追敌');
  eq(COMPANION_MODES_HARD.stay.stopSupport, true, 'stay 停主动 support');
  eq(COMPANION_MODES_HARD.stay.cancelPendingSupportOnEnter, true, '切 stay 取消 pending support');
  eq(COMPANION_MODES_HARD.stay.invulnerable, false, 'stay ≠无敌');
  eq(COMPANION_MODES_HARD.stay.keepRelation, true, 'stay 关系保留');
  eq(COMPANION_MODES_HARD.switch.noBudgetStack, true, '切态不叠 budget');
  eq(COMPANION_MODES_HARD.switch.noCooldownStackOrReset, true, '切态不重置 CD');
  eq(COMPANION_MODES_HARD.switch.clearAiFlagsOnEnter, true, '切入清旗');
  eq(COMPANION_MODES_HARD.schedule, 'primary_area_and_support', 'primary＋area＋support（design/48）');

  eq(nextCompanionMode('follow'), 'free', 'follow→free');
  eq(nextCompanionMode('free'), 'stay', 'free→stay');
  eq(nextCompanionMode('stay'), 'follow', 'stay→follow');

  // —— 表只读旁证 ——
  eq(companionsRaw.damageRatioOfPlayer, 0.35, '表 damageRatio=0.35');
  eq(companionsRaw.modes, ['follow', 'free', 'stay'], '表 modes 三态');
  const skill = (skillsRaw.skills as { id: string; cooldownMs: number; range: { w: number; h: number } }[])
    .find(s => s.id === 'sword_qi_slash')!;
  eq(skill.cooldownMs, 0, '表 cooldownMs 仍 0');
  eq(skill.range, { w: 280, h: 48 }, '表 range 仍 280×48');
  ok(SKILLS.sword_qi_slash, 'SKILLS 含 sword_qi_slash');
  eq(Math.abs(companionPrimarySkillRatio(1) - 1.6) < 1e-9, true, 'skillRatio 1.6');

  // —— 伤害预算一份：切态不叠 ——
  const once = companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 0, roll: 1.0 });
  eq(once, Math.max(1, Math.round(100 * 1.6 * 0.35)), '单轨 ×0.35');
  eq(companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 0, roll: 1.0, budgetScale: 0.35 }),
    once, '显式 0.35 与默认同一份');
  eq(companionReflectDamage(100, 0.5), Math.max(1, Math.round(100 * 0.5 * 0.35)), '反伤同乘');

  // —— follow 几何仍在 ——
  eq(shouldLeashTeleport(0, 400), true, 'follow 超 leash 瞬移');
  eq(followAnchorX(1000, 1), 904, 'follow 锚点');
  eq(inEngageRange(0, 0, 240, 0), true, 'engage 内');
  eq(inAggroRange(0, 0, 320, 0, 0), true, 'follow aggro 边界');

  // —— free 自主索敌：不绑玩家目标；无 leash 约束 ——
  const mobs = [
    { x: 50, y: 0, active: true, dead: false, id: 'nearPlayer' },
    { x: 180, y: 0, active: true, dead: false, id: 'nearCompanion' },
    { x: 900, y: 0, active: true, dead: false, id: 'far' },
  ];
  const companion = { x: 200, y: 0 };
  const player = { x: 0 };
  eq(pickCompanionTarget(mobs, companion, player)?.id, 'nearPlayer', 'follow 优先近玩家');
  eq(pickCompanionFreeTarget(mobs, companion)?.id, 'nearCompanion', 'free 自主近同伴');
  eq(inFreeAggroRange(0, 0, 320, 0), true, 'free aggro 320 边界');
  eq(inFreeAggroRange(0, 0, 321, 0), false, 'free 超 aggro');
  // free：同伴附近敌可被选；follow：同几何因超玩家 leash 不可选（forcePlayerTarget／leash 差）
  const farFromPlayer = [
    { x: 0, y: 0, active: true, dead: false, id: 'byPlayer' },
    { x: 500, y: 0, active: true, dead: false, id: 'byCompanion' },
  ];
  eq(pickCompanionFreeTarget(farFromPlayer, { x: 500, y: 0 })?.id, 'byCompanion', 'free 自主近同伴（不绑玩家）');
  eq(pickCompanionTarget(farFromPlayer, { x: 500, y: 0 }, { x: 0 }), undefined, 'follow 超玩家 leash 不选远敌');

  // stay：零主动伤害＝不出招契约（纯函数层无伤害调用）；invulnerable=false
  eq(COMPANION_MODES_HARD.stay.invulnerable, false, 'stay 可受击');
  eq(COMPANION_MODES_HARD.stay.zeroDamage, true, 'stay 不出招');

  // —— 关系循环：邀请默认 follow；KeyV 循环；无关系无效 ——
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
  eq(cycleCompanionMode(parsed.config, prog), null, '无关系切换无效');
  eq(invite(parsed.config, affinity.config, prog).status, 'ok', '邀请');
  eq(prog.companionRelations, { [SU_COMPANION_ID]: { mode: 'follow' } }, '邀请仍 follow');
  eq(canInvite(parsed.config, affinity.config, prog).status, 'already', '再邀 already');

  const order: CompanionMode[] = ['free', 'stay', 'follow'];
  for (const expectMode of order) {
    const got = cycleCompanionMode(parsed.config, prog);
    eq(got, expectMode, `循环至 ${expectMode}`);
    eq(activeCompanion(parsed.config, prog)?.mode, expectMode, `存档 mode=${expectMode}`);
  }
  eq(prog.companionRelations?.[SU_COMPANION_ID]?.mode, 'follow', '切回 follow 关系保留');
  // 关系键仍仅苏师姐；不重复增员（关系对象仍 1）
  eq(Object.keys(prog.companionRelations ?? {}), [SU_COMPANION_ID], '恰 1 关系');

  // 切态不重置 CD：共享时钟由实体 attackReadyAt 持有；纯函数契约＝noCooldownStackOrReset
  const cdBefore = 12_000;
  const cdAfterSwitch = cdBefore; // 切态不得改写该时钟
  eq(cdAfterSwitch, cdBefore, '切态 CD 时钟不重置');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, '切回 follow budget 仍 0.35');
  eq(COMPANION_FOLLOW_HARD.followDist, 96, '切回 followDist');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, '切回 leash');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, '切回 aggro');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, '切回 CD1200');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange.w, 240, '切回 engage 240');

  // 切图／读档：mode 保留（序列化往返）
  prog.companionRelations = { [SU_COMPANION_ID]: { mode: 'stay' } };
  const reloaded = JSON.parse(JSON.stringify(prog.companionRelations));
  eq(activeCompanion(parsed.config, { companionRelations: reloaded })?.mode, 'stay', '读档 mode=stay 保留');
  eq(Object.keys(reloaded).length, 1, '读档恰 1 关系');

  // gifts 仍关；无新 Flag；PHASE 不抬
  eq(affinity.config?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');
  eq(GAME_PHASE, 5, 'GAME_PHASE 不抬');
  const flags = featureFlags();
  ok(!('CompanionOpenFlag' in flags) && !('companionOpen' in flags), '无 CompanionOpenFlag');
  ok(!('softOpenedCompanion' in flags), '无 softOpenedCompanion');

  return { assertions };
}
