import companionsRaw from '@xt/balance/companions.json';
import skillsRaw from '@xt/balance/skills.json';
import npcsRaw from '@xt/balance/npcs.json';
import { GAME_PHASE } from './data';
import { featureFlags } from './features';
import { parseAffinityIndex } from './Affinity';
import {
  activeCompanion, canDismiss, canInvite, cycleCompanionMode, dismissCompanionRelation, invite,
  parseCompanionsConfig, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionProgress,
} from './Companions';
import {
  COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD,
} from './CompanionFollowAi';

/** design/43 同行 AI 主动解散入口接线静证（≠开态≠soft≠release）。 */
export async function runCompanionDismissTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  // —— 41／42 硬读未漂 ——
  eq(COMPANION_FOLLOW_HARD.followDist, 96, 'followDist=96');
  eq(COMPANION_FOLLOW_HARD.leashDist, 320, 'leashDist=320');
  eq(COMPANION_FOLLOW_HARD.aggroRange, 320, 'aggroRange=320');
  eq(COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs, 1200, 'CD=1200');
  eq(COMPANION_FOLLOW_HARD.primary.engageRange, { w: 240, h: 48 }, 'engage 240×48');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, 'budgetScale=0.35');
  eq(COMPANION_MODES_HARD.cycle, ['follow', 'free', 'stay'], 'cycle 未改');
  eq(COMPANION_MODES_HARD.bind, { defaultCode: 'KeyV', action: 'companion_mode_cycle' }, 'KeyV 仍 cycle');
  eq(COMPANION_MODES_HARD.stay.keepRelation, true, 'stay 保关系');
  eq(COMPANION_MODES_HARD.stay.zeroDamage, true, 'stay 零伤');
  eq(COMPANION_MODES_HARD.stay.invulnerable, false, 'stay ≠无敌');
  eq(COMPANION_MODES_HARD.free.aggroRange, 320, 'free320');

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

  // —— 幂等：无关系 → noop ——
  eq(canDismiss(parsed.config, prog).status, 'noop', '无关系 canDismiss=noop');
  eq(dismissCompanionRelation(parsed.config, prog).status, 'noop', '无关系 dismiss=noop');
  eq(prog.companionRelations, undefined, 'noop 不写脏档');

  // —— 邀请 → 解散 ——
  eq(invite(parsed.config, affinity.config, prog).status, 'ok', '邀请');
  eq(prog.companionRelations, { [SU_COMPANION_ID]: { mode: 'follow' } }, '有 follow 关系');
  eq(canDismiss(parsed.config, prog).showDismiss, true, '有关系可解散入口');
  eq(dismissCompanionRelation(parsed.config, prog).status, 'ok', '解散 ok');
  eq(prog.companionRelations, undefined, '整键删除');
  eq(activeCompanion(parsed.config, prog), null, '解散后无 active');
  eq(cycleCompanionMode(parsed.config, prog), null, '解散后 cycle 无效');

  // —— 再邀：恰 1 follow ——
  eq(canInvite(parsed.config, affinity.config, prog).status, 'ok', '再邀资格');
  eq(invite(parsed.config, affinity.config, prog).status, 'ok', '再邀');
  eq(prog.companionRelations, { [SU_COMPANION_ID]: { mode: 'follow' } }, '再邀初始 follow');
  eq(Object.keys(prog.companionRelations ?? {}), [SU_COMPANION_ID], '恰 1 关系');
  eq(activeCompanion(parsed.config, prog)?.mode, 'follow', 'active follow');

  // —— stay≠解散：stay 保关系；仅 dismiss 清 ——
  eq(cycleCompanionMode(parsed.config, prog), 'free', '→free');
  eq(cycleCompanionMode(parsed.config, prog), 'stay', '→stay');
  eq(prog.companionRelations?.[SU_COMPANION_ID]?.mode, 'stay', 'stay 关系保留');
  eq(activeCompanion(parsed.config, prog)?.mode, 'stay', 'stay active');
  // KeyV／cycle 不触发解散
  const beforeCycle = JSON.stringify(prog.companionRelations);
  eq(cycleCompanionMode(parsed.config, prog), 'follow', 'stay→follow 非解散');
  eq(JSON.parse(beforeCycle) && Object.keys(prog.companionRelations ?? {}).length, 1, 'cycle 不删关系键');
  // 回到 stay 再 dismiss
  cycleCompanionMode(parsed.config, prog); // free
  cycleCompanionMode(parsed.config, prog); // stay
  eq(prog.companionRelations?.[SU_COMPANION_ID]?.mode, 'stay', '再 stay');
  eq(dismissCompanionRelation(parsed.config, prog).dismissed, true, 'stay 下解散仍清关系');
  eq(prog.companionRelations, undefined, '解散后无关系（stay≠保）');
  eq(activeCompanion(parsed.config, prog), null, '解散后无实体投影');

  // —— 切图保关系回归：未解散 mode 保留 ——
  invite(parsed.config, affinity.config, prog);
  prog.companionRelations = { [SU_COMPANION_ID]: { mode: 'free' } };
  const reloaded = JSON.parse(JSON.stringify(prog.companionRelations));
  eq(activeCompanion(parsed.config, { companionRelations: reloaded })?.mode, 'free', '未解散读档保 mode');
  // 解散后读档
  dismissCompanionRelation(parsed.config, prog);
  const afterDismiss = prog.companionRelations === undefined ? undefined : JSON.parse(JSON.stringify(prog.companionRelations));
  eq(afterDismiss, undefined, '解散后读档无关系');
  eq(activeCompanion(parsed.config, { companionRelations: afterDismiss }), null, '解散后不投影');

  // —— 幂等再 dismiss ——
  eq(dismissCompanionRelation(parsed.config, prog).status, 'noop', '再 dismiss 幂等');

  // —— 关态不写档 ——
  const closed = JSON.parse(JSON.stringify(companionsRaw)) as typeof companionsRaw;
  (closed as { enabled: boolean }).enabled = false;
  const closedParsed = parseCompanionsConfig(closed, skillsRaw.skills as { id: string }[]);
  invite(parsed.config, affinity.config, prog);
  const snap = JSON.stringify(prog.companionRelations);
  eq(canDismiss(closedParsed.config, prog).status, 'disabled', '关态 canDismiss');
  eq(dismissCompanionRelation(closedParsed.config, prog).status, 'disabled', '关态不解散');
  eq(JSON.stringify(prog.companionRelations), snap, '关态不改存档');

  // —— gifts 关；无新 Flag；PHASE ——
  eq(affinity.config?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');
  eq(GAME_PHASE, 5, 'GAME_PHASE 不抬');
  const flags = featureFlags();
  ok(!('CompanionOpenFlag' in flags) && !('companionOpen' in flags), '无 CompanionOpenFlag');
  ok(!('softOpenedCompanion' in flags) && !Object.keys(flags).some(k => k.startsWith('softOpenedCompanion')), '无 softOpenedCompanion＊');
  // KeyV bind 不含 dismiss
  eq(COMPANION_MODES_HARD.bind.action, 'companion_mode_cycle', 'bind≠dismiss');
  ok(!String(COMPANION_MODES_HARD.bind.action).includes('dismiss'), 'KeyV 不绑解散');

  return { assertions };
}
