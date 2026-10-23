import questsRaw from '@xt/balance/quests.json';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { GAME_PHASE } from './data';
import { Progress } from './Progress';
import {
  SECRET_NEST_MIN_LOOP, startSecretNest, rewardSecretNest, clearSecretNestMob,
  fixtureClearSecretNestMobs, exitSecretNestSession, getSecretNestRun, resetSecretNestRunForTests,
  enterSecretNest,
} from './SecretNestGate';
import { isSecretNestIntroEnabled, refuseStart, refuseReward } from './SecretNestClosed';
import { getSecretBoonState, chooseSecretBoon } from './SecretBoonRuntime';

/** design/40 万妖巢穴最小可玩闭环接线静证（≠开态≠soft≠release）。 */
export async function runSecretNestMinLoopTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }

  const flagsBefore = featureFlags();
  eq(featureEnabled('secret_boon_runtime'), false, 'design/49 兼容口径：正式软闸关，沿 design/40 不出 boon');
  eq(GAME_PHASE, 5, 'GAME_PHASE 仍为 5');
  ok(isSecretNestIntroEnabled(), '正式 intro.enabled 为 true（无新 OpenFlag）');
  eq(SECRET_NEST_MIN_LOOP.slotsOverride, { melee: 2, ranged: 1 }, 'slotsOverride 硬读 2/1');
  eq(SECRET_NEST_MIN_LOOP.reward, { exp: 12, stones: 20, item: null }, 'rewardSecretNest 硬读 12/20');
  eq([...SECRET_NEST_MIN_LOOP.poolAllow.melee], ['shadow_wolf', 'demonized_ape', 'tree_demon_sapling'], 'melee 池 3 id');
  eq([...SECRET_NEST_MIN_LOOP.poolAllow.ranged], ['poison_spider'], 'ranged 池 1 id');
  eq(SECRET_NEST_MIN_LOOP.bossRoomRequired, false, '禁 boss 房硬条件');

  const intro = questsRaw.find(quest => quest.id === 'q_secret_nest_intro')!;
  const returnPosition = { mapId: 'wanyao_outer_1', x: 480, y: 800 };

  function makeProg(opts: { level?: number; realmId?: string; introState?: 'active' | 'done'; main06Kills?: number } = {}) {
    const p = new Progress();
    p.level = opts.level ?? intro.reqLevel ?? 30;
    p.exp = 11; p.stones = 1000; p.hp = p.maxHp; p.mp = p.maxMp;
    p.quests.q_main_04 = { state: 'done', kills: {} };
    p.quests.q_main_06 = { state: 'active', kills: { millennium_tree_demon: opts.main06Kills ?? 0 } };
    if (opts.introState) p.quests.q_secret_nest_intro = { state: opts.introState, kills: {}, reached: true };
    if (opts.realmId) {
      Object.defineProperty(p, 'realm', { configurable: true, get: () => ({ id: opts.realmId }) });
    }
    return p;
  }

  resetSecretNestRunForTests();

  // C01：未 done／等级／境界不足 → start 拒
  const denyCases: { name: string; introState?: 'active' | 'done'; level: number; realmId: string }[] = [
    { name: '未接取', introState: undefined, level: 30, realmId: 'foundation' },
    { name: 'active', introState: 'active', level: 30, realmId: 'foundation' },
    { name: '等级不足', introState: 'done', level: (intro.reqLevel ?? 30) - 1, realmId: 'foundation' },
    { name: '境界不足', introState: 'done', level: 30, realmId: 'qi_refining' },
  ];
  for (const caseName of denyCases) {
    resetSecretNestRunForTests();
    const p = makeProg(caseName);
    const result = startSecretNest(p, returnPosition);
    eq(result.allowed, false, `C01 ${caseName.name} start 拒绝`);
    eq(getSecretNestRun(), undefined, `C01 ${caseName.name} 无 run`);
  }

  // 无参 start／reward 仍拒（兼容旧断言语义）
  eq(startSecretNest().allowed, false, '无 Progress 时 start 拒');
  eq(rewardSecretNest().allowed, false, '无 Progressive 清房时 reward 拒');

  // O01：资格满足开局
  resetSecretNestRunForTests();
  const p = makeProg({ introState: 'done', level: 32 });
  const stonesBefore = p.stones, expBefore = p.exp, main06Before = structuredClone(p.quests.q_main_06);
  const started = startSecretNest(p, returnPosition);
  ok(started.allowed, 'O01 start 允许');
  if (!started.allowed) throw new Error('start failed');
  eq(started.room.id, 'combat_01', 'O01 验收房 combat_01');
  eq(started.room.playable, true, 'O01 playable');
  const run = started.run;
  eq(run.theme, 'wanyao_nest', '主题 wanyao_nest');
  eq(run.rooms.length, 1, '默认 1 房');
  eq(run.rooms[0]!.slotsOverride, { melee: 2, ranged: 1 }, 'slotsOverride 落地');
  eq(run.rooms[0]!.mobs.length, 3, '降槽合计 3 实体');
  const roles = run.rooms[0]!.mobs.map(m => m.role).sort();
  eq(roles, ['melee', 'melee', 'ranged'], 'melee×2＋ranged×1');
  const ids = run.rooms[0]!.mobs.map(m => m.monsterId);
  const allow = new Set<string>([...SECRET_NEST_MIN_LOOP.poolAllow.melee, ...SECRET_NEST_MIN_LOOP.poolAllow.ranged]);
  ok(ids.every(id => allow.has(id)), '池仅既有 4 id');
  eq(ids.filter(id => id === 'poison_spider').length, 1, 'ranged 为毒蛛');
  eq(ids[0], 'shadow_wolf', 'melee 偏好首抽影狼');
  eq(ids[1], 'demonized_ape', 'melee 次抽魔化猿');
  for (const mob of run.rooms[0]!.mobs) {
    ok(mob.level >= 30 && mob.level <= 34, `levelClip ${mob.monsterId}=${mob.level}`);
  }

  // stub enter 仍可单独调用，但不冒充可玩开局
  const stub = enterSecretNest(p, returnPosition);
  ok(stub.allowed && stub.room.id === 'secret_nest_gate_stub', 'enterSecretNest 仍可建 stub（C04 对照）');

  // C03：未清房 reward 拒
  eq(rewardSecretNest(p).allowed, false, 'C03 未清房不可领通关行');
  eq([p.stones, p.exp], [stonesBefore, expBefore], 'C03 拒奖无资产变化');

  // O02：清房
  const clear = fixtureClearSecretNestMobs();
  ok(clear.allowed && clear.cleared, 'O02 清房成功');
  eq(getSecretNestRun()?.cleared, true, 'O02 run.cleared');
  eq(getSecretBoonState().pendingHand, undefined, 'design/49 软闸关：清房不出三选一');
  eq(getSecretBoonState().layers, {}, 'design/49 软闸关：不 apply boon');
  eq(p.quests.q_main_06, main06Before, 'O04 清怪不计 q_main_06');

  // 逐只 clear 路径（重建一局）
  resetSecretNestRunForTests();
  const p2 = makeProg({ introState: 'done', level: 30 });
  const s2 = startSecretNest(p2, returnPosition);
  ok(s2.allowed, '第二局开局');
  if (!s2.allowed) throw new Error('s2');
  for (const mob of s2.run.rooms[0]!.mobs) {
    const step = clearSecretNestMob(mob.id);
    ok(step.allowed, `逐清 ${mob.id}`);
  }
  eq(getSecretNestRun()?.cleared, true, '逐清后 cleared');

  // O06：reward 12/20
  const stones2 = p2.stones, exp2 = p2.exp;
  const reward = rewardSecretNest(p2);
  ok(reward.allowed, 'O06 reward 成功');
  if (!reward.allowed) throw new Error('reward');
  eq(reward.exp, 12, 'O06 exp=12');
  eq(reward.stones, 20, 'O06 stones=20');
  eq(reward.item, null, 'O06 item=null');
  eq(p2.stones, stones2 + 20, 'O06 stones 入账');
  ok(p2.exp >= exp2, 'O06 exp 入账或不低于前');
  eq(rewardSecretNest(p2).allowed, false, '不可重复领奖');

  // O03：退出清理
  const exited = exitSecretNestSession();
  ok(exited.allowed, 'O03 退出');
  if (!exited.allowed) throw new Error('exit');
  eq(exited.cleared, true, 'O03 cleared');
  eq(exited.rewarded, true, 'O03 rewarded');
  eq(getSecretNestRun(), undefined, 'O03 run 已清');
  eq(exited.returnPosition, returnPosition, 'O03 回 returnPosition');

  // 中途退出无通关行
  resetSecretNestRunForTests();
  const p3 = makeProg({ introState: 'done' });
  const s3 = startSecretNest(p3, returnPosition);
  ok(s3.allowed, '中途局开局');
  const stones3 = p3.stones, exp3 = p3.exp;
  const mid = exitSecretNestSession();
  ok(mid.allowed && !mid.cleared && !mid.rewarded, '中途退出无通关');
  eq([p3.stones, p3.exp], [stones3, exp3], '中途退出无结算增量');

  // design/49 明示改写旧「不开 boon」口径：仅关闸保持旧行为；开闸允许三选一，离境全清。
  setFeatureFlag('secret_boon_runtime', true);
  try {
    const boonPlayer = makeProg({ introState: 'done' });
    ok(startSecretNest(boonPlayer, returnPosition).allowed, 'design/49 内存开闸仍沿原门禁入局');
    ok(fixtureClearSecretNestMobs().allowed, 'design/49 内存开闸清原 combat_01');
    const hand = getSecretBoonState().pendingHand ?? [];
    eq(hand.length, 3, 'design/49 软闸开：清房可三选一');
    eq(new Set(hand.map(card => card.id)).size, 3, 'design/49 三卡不同 id');
    eq(rewardSecretNest(boonPlayer).allowed, false, 'design/49 未选择前不可跳过卡组结算');
    ok(chooseSecretBoon(hand[0]!.id), 'design/49 选择一张真实候选');
    ok(exitSecretNestSession().allowed, 'design/49 选后退出');
    eq(getSecretBoonState().layers, {}, 'design/49 离境清全部机缘层');
    eq(getSecretBoonState().pendingHand, undefined, 'design/49 离境清未决卡组');
  } finally {
    setFeatureFlag('secret_boon_runtime', flagsBefore.secret_boon_runtime);
    resetSecretNestRunForTests();
  }

  // 关态对照：intro 关闭时由 Closed 拒（本测在正式开态图；无参拒已覆盖；closed 图由 v06c 管）
  eq(typeof refuseStart().tipKey, 'string', 'refuseStart 可用');
  eq(typeof refuseReward().tipKey, 'string', 'refuseReward 可用');

  eq(featureFlags(), flagsBefore, '全程不翻 feature');
  eq(featureEnabled('indexedDbSaves'), true, 'IDB 仍 true');
  resetSecretNestRunForTests();
  return { assertions };
}

if (import.meta.url.endsWith('secret-nest-min-loop.test.ts')) {
  // vite ssr runner 调用 export；直接 node 不跑。
}
