import boonsRaw from '@xt/balance/secret_boons.json';
import npcsRaw from '@xt/balance/npcs.json';
import { GAME_PHASE } from './data';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { Progress } from './Progress';
import {
  SECRET_BOON_RUNTIME_IDS, SECRET_BOON_DEFINITIONS, SECRET_BOON_TIERS,
  beginSecretBoonRun, onSecretBoonRoomClear, getSecretBoonState, chooseSecretBoon,
  closeSecretBoonPanel, reopenSecretBoonPanel, clearRunBoons, secretBoonRatio,
  filterSecretBoonCandidates, drawSecretBoonHand, type SecretBoonDefinition,
} from './SecretBoonRuntime';
import {
  startSecretNest, fixtureClearSecretNestMobs, clearSecretNestMob, rewardSecretNest,
  exitSecretNestSession, abandonSecretNestSession, onSecretNestPlayerDown,
  getSecretNestRun, resetSecretNestRunForTests, SECRET_NEST_MIN_LOOP,
} from './SecretNestGate';

/** design/49：Soft OpenPreRelease 落盘 true；关回夹具只在本次 SSR 内存，不写盘／存档。 */
export async function runSecretBoonRuntimeTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const near = (a: number, b: number, message: string) => ok(Math.abs(a - b) < 1e-9, message);
  const common = ['sb_vigor', 'sb_focus', 'sb_force', 'sb_guard', 'sb_spring', 'sb_flow'];
  const fallback = ['sb_breath', 'sb_sip', 'sb_balance'];
  const forbidden = ['sb_edge', 'sb_shell', 'sb_thorn', 'sb_siphon', 'sb_resolve', 'sb_echo'];
  const ids = (hand: readonly SecretBoonDefinition[] | undefined) => (hand ?? []).map(card => card.id);
  const originalRandom = Math.random;
  const originalFlags = featureFlags();
  const returnPosition = { mapId: 'wanyao_outer_1', x: 480, y: 800 };
  const player = () => {
    const p = new Progress();
    p.level = 32; p.stones = 1000; p.exp = 1; p.hp = p.maxHp; p.mp = p.maxMp;
    p.quests.q_main_04 = { state: 'done', kills: {} };
    p.quests.q_main_06 = { state: 'active', kills: { millennium_tree_demon: 0 } };
    p.quests.q_secret_nest_intro = { state: 'done', kills: {}, reached: true };
    return p;
  };
  let room = 0;
  const newHand = () => { onSecretBoonRoomClear(`fixture_${++room}`); return getSecretBoonState().pendingHand ?? []; };
  const select = (id: string) => {
    // 固定抽样边界可达全部 common；每次都只选择真实 pendingHand 中的卡。
    for (const value of [0, 0.999999, 0.5, 0.2, 0.8]) {
      Math.random = () => value;
      const hand = getSecretBoonState().pendingHand ?? newHand();
      if (hand.some(card => card.id === id)) {
        ok(chooseSecretBoon(id), `选择真实候选 ${id}`);
        return;
      }
      // 未命中时选择一张合法其它卡推进下一次事件，不借测试钩子伪造 pending。
      ok(chooseSecretBoon(hand[0]!.id), '抽样推进选择合法卡');
    }
    throw new Error(`${label}: 未抽到 ${id}`);
  };
  try {
    eq(featureEnabled('secret_boon_runtime'), true, '正式快照 Soft OpenPreRelease 软闸落盘 true');
    eq(featureEnabled('secret_daily_bonus'), false, 'design/50 接线仅落默认 false，boon 兼容测仍发基线');
    eq(GAME_PHASE, 5, 'C03 GAME_PHASE 仍为 5');
    ok(!Object.keys(originalFlags).some(key => /OpenFlag|softOpenedNest/.test(key)), 'C03 无新 OpenFlag／softOpenedNest');
    eq([...SECRET_BOON_RUNTIME_IDS].sort(), [...common, ...fallback].sort(), '仅六 common＋三 fallback allowlist');
    eq(SECRET_BOON_DEFINITIONS.map(card => card.id).sort(), [...common, ...fallback].sort(), '生产候选恰为允许九条');
    eq(SECRET_BOON_TIERS, boonsRaw.tiers, '沿用原 tiers 70／25／5');
    eq(boonsRaw.boons.every(card => card.enabled === false), true, '表 enabled 原样 false，不借接线开表');
    const all = boonsRaw.boons as unknown as SecretBoonDefinition[];
    const allMax = Object.fromEntries(common.map(id => [id, 2]));
    for (const value of [0, 0.25, 0.7, 0.999999]) {
      const hand = drawSecretBoonHand(SECRET_BOON_DEFINITIONS, {}, () => value);
      eq(hand.length, 3, 'O01 三张卡');
      eq(new Set(ids(hand)).size, 3, 'O01 同组 id 去重');
      ok(hand.every(card => common.includes(card.id)), 'O01 fallback 不混入常规池，rare／epic 关闭');
      ok(hand.every(card => !forbidden.includes(card.id)), 'O01 无六条关闭 id');
    }
    eq(ids(drawSecretBoonHand(SECRET_BOON_DEFINITIONS, allMax, () => 0)).sort(), fallback.slice().sort(), 'O01 常规全满由三个 fallback 补足');
    const oneRegular = { ...allMax, sb_guard: 1 };
    const filled = drawSecretBoonHand(SECRET_BOON_DEFINITIONS, oneRegular, () => 0);
    eq(filled.length, 3, '不足三张仍补满');
    eq(new Set(ids(filled)).size, 3, 'fallback 补足也去重');
    eq(filled.filter(card => !card.fallback).map(card => card.id), ['sb_guard'], '满二层过滤，未满条目保留');
    eq(filled.filter(card => card.fallback).length, 2, '仅补 shortage 两张 fallback');
    ok(filterSecretBoonCandidates(SECRET_BOON_DEFINITIONS, allMax).every(card => card.fallback), 'fallback 缺省 maxStacks 不按零层过滤');
    for (const card of SECRET_BOON_DEFINITIONS.filter(card => card.fallback)) {
      eq(card.weight, undefined, 'fallback 沿用缺省 weight');
      eq(card.maxStacks, undefined, 'fallback 沿用缺省 maxStacks');
    }
    // 二期 stance 规则以纯函数夹具保留；生产仍只用九条 allowlist。
    const stanceHand = drawSecretBoonHand(all, {}, () => 0.75);
    ok(stanceHand.filter(card => card.exclusiveGroup === 'stance').length <= 1, '同卡组最多一张 stance');
    const stanceEligible = filterSecretBoonCandidates(all, { sb_edge: 1 });
    eq(stanceEligible.some(card => card.id === 'sb_shell'), false, '选择 edge 后 shell 不再入候选');
    const fixture = (id: string, tier: string, weight: number): SecretBoonDefinition => ({
      ...SECRET_BOON_DEFINITIONS[0]!, id, tier, weight,
    });
    const weighted = [fixture('common-light', 'common', 1), fixture('common-heavy', 'common', 9), fixture('rare-only', 'rare', 1)];
    eq(drawSecretBoonHand(weighted, {}, () => 0.8, [{ id: 'common', weight: 70 }, { id: 'rare', weight: 25 }])[0]?.id,
      'rare-only', '先按 tiers 权重抽档');
    eq(drawSecretBoonHand(weighted.slice(0, 2), {}, () => 0.8, [{ id: 'common', weight: 70 }, { id: 'rare', weight: 25 }])[0]?.id,
      'common-heavy', '排除空档，再按原条目 weight 抽卡');

    setFeatureFlag('secret_boon_runtime', false);
    const closedPlayer = player();
    beginSecretBoonRun(closedPlayer);
    onSecretBoonRoomClear('combat_01');
    eq(getSecretBoonState().pendingHand, undefined, 'C01 关闸清房无卡');
    eq(chooseSecretBoon('sb_vigor'), false, 'C01 关闸不可 apply');
    eq(secretBoonRatio(closedPlayer, 'hp_max'), 0, 'C01 无玩家机缘增益');
    setFeatureFlag('secret_boon_runtime', true);
    beginSecretBoonRun(closedPlayer);
    onSecretBoonRoomClear('start');
    eq(getSecretBoonState().pendingHand, undefined, 'C02 start 房不出卡');
    onSecretBoonRoomClear('combat_01');
    const locked = ids(getSecretBoonState().pendingHand);
    eq(locked.length, 3, 'O01 开闸非开局房三选一');
    eq(getSecretBoonState().panelOpen, true, '清房打开面板');
    eq(chooseSecretBoon('sb_echo'), false, '不可选择非 pending id');
    closeSecretBoonPanel();
    eq(getSecretBoonState().panelOpen, false, 'O04 关闭只收面板');
    eq(ids(getSecretBoonState().pendingHand), locked, 'O04 关面板不默选、不清卡');
    eq(getSecretBoonState().layers, {}, 'O04 关闭不暗中加层');
    onSecretBoonRoomClear('combat_01');
    eq(ids(getSecretBoonState().pendingHand), locked, 'O04 再次清同房不重抽');
    reopenSecretBoonPanel();
    eq(getSecretBoonState().panelOpen, true, 'O04 可再开');
    eq(ids(getSecretBoonState().pendingHand), locked, 'O04 再开同一卡组');

    // passive 必须经过 Progress 真实 getter／伤害通道，第二个玩家与召唤伤害均不继承。
    const p = player(), other = player();
    beginSecretBoonRun(p);
    const base = { hp: p.maxHp, mp: p.maxMp, attack: 0, incoming: 0, summon: 0 };
    Math.random = () => 0.5;
    base.attack = p.damageTo(32, 0); base.incoming = p.damageFrom(500); base.summon = p.summonDamageTo(32, 0);
    select('sb_vigor');
    near(secretBoonRatio(p, 'hp_max'), 0.06, 'O02 hp_max 原 effects 0.06');
    ok(p.maxHp > base.hp, 'O02 passive maxHp 生效');
    eq(other.maxHp, base.hp, 'O02 仅绑定玩家，另一角色 maxHp 不变');
    eq(secretBoonRatio(other, 'hp_max'), 0, 'O02 另一对象无 boon');
    eq(p.baseMaxHp, base.hp, '召唤／同伴基础 maxHp 不继承 boon');
    select('sb_focus');
    ok(p.maxMp > base.mp, 'passive maxMp 生效');
    eq(p.baseMaxMp, base.mp, '基础 maxMp 不含 boon');
    select('sb_force');
    Math.random = () => 0.5;
    ok(p.damageTo(32, 0) > base.attack, 'direct_damage 只提升玩家直接伤害');
    eq(other.damageTo(32, 0), base.attack, '另一角色伤害不受影响');
    eq(p.summonDamageTo(32, 0), base.summon, '召唤伤害不继承 direct_damage');
    select('sb_guard');
    Math.random = () => 0.5;
    ok(p.damageFrom(500) < base.incoming, 'monster_damage_taken 降低玩家受击');
    eq(other.damageFrom(500), base.incoming, '另一角色受击不受影响');
    const saved = p.exportSave();
    eq(JSON.stringify(saved).includes('sb_vigor'), false, '局内层不写入永久存档');
    p.hp = p.maxHp; p.mp = p.maxMp;
    const cappedSave = p.exportSave();
    eq([cappedSave.hp, cappedSave.mp], [p.baseMaxHp, p.baseMaxMp], '存档只保留基础上限内 hp／mp');
    const draft = Object.assign(new Progress(), p);
    eq([draft.exportSave().hp, draft.exportSave().mp], [p.baseMaxHp, p.baseMaxMp], '异步事务 draft 导出同样裁至基础上限');
    eq([p.hp, p.mp], [p.maxHp, p.maxMp], '导出不会提前抹掉本局机缘上限');
    clearRunBoons();
    eq([p.maxHp, p.maxMp], [base.hp, base.mp], 'clear 撤销 passive 属性');
    Math.random = () => 0.5;
    eq([p.damageTo(32, 0), p.damageFrom(500)], [base.attack, base.incoming], 'clear 撤销 passive 伤害效果');
    eq(getSecretBoonState().pendingHand, undefined, 'clear 清未决卡');
    eq(getSecretBoonState().layers, {}, 'clear 清全部层');

    const springPlayer = player();
    beginSecretBoonRun(springPlayer);
    Math.random = () => 0.999999;
    onSecretBoonRoomClear('spring_room');
    ok(ids(getSecretBoonState().pendingHand).includes('sb_spring'), '真实卡组含 spring');
    springPlayer.hp = 1; springPlayer.mp = 1;
    ok(chooseSecretBoon('sb_spring'), '选择 room_clear 型 spring');
    eq(springPlayer.hp, 1, 'O02 刚清完才选择不补触发本房');
    onSecretBoonRoomClear('spring_room');
    eq(springPlayer.hp, 1, 'O02 同房清事件不二次恢复');
    eq(getSecretBoonState().pendingHand, undefined, '同一已清房选后不重复出卡');
    onSecretBoonRoomClear('next_room');
    ok(springPlayer.hp > 1, 'room_clear 只在将来的清房事件恢复');
    clearRunBoons();

    // 自然选满六条 common 后，fallback 无常规层数限制，按原比例即时恢复。
    const restPlayer = player();
    beginSecretBoonRun(restPlayer); Math.random = () => 0;
    for (let i = 0; i < 12; i++) {
      const hand = newHand();
      const regular = hand.find(card => !card.fallback);
      ok(regular, '满层前仍有合法 common');
      ok(chooseSecretBoon(regular.id), '真实选择 common 叠到原 maxStacks');
    }
    eq(common.map(id => getSecretBoonState().layers[id]), [2, 2, 2, 2, 2, 2], '六条 common 均封顶两层');
    for (const id of fallback) {
      const hand = newHand();
      eq(ids(hand).sort(), fallback.slice().sort(), '满层后只补三条 fallback');
      restPlayer.hp = 1; restPlayer.mp = 1;
      ok(chooseSecretBoon(id), `choose 即时恢复 ${id}`);
      if (id !== 'sb_sip') near(restPlayer.hp, 1 + restPlayer.maxHp * (id === 'sb_balance' ? 0.08 : 0.15), `${id} 按原比例即时回 hp`);
      if (id !== 'sb_breath') near(restPlayer.mp, 1 + restPlayer.maxMp * (id === 'sb_balance' ? 0.08 : 0.15), `${id} 按原比例即时回 mp`);
      if (id === 'sb_breath') eq(restPlayer.mp, 1, 'breath 只回 hp');
      if (id === 'sb_sip') eq(restPlayer.hp, 1, 'sip 只回 mp');
      eq(getSecretBoonState().layers[id], undefined, 'instant fallback 不留永久或局内被动层');
    }

    // Gate 通关／退出／倒地／放弃仍清层；design/50 日倍闸默认关，结算基线 12／20，仍不开 loot。
    for (const path of ['complete', 'exit', 'down', 'abandon'] as const) {
      resetSecretNestRunForTests();
      const runPlayer = player();
      const assetsBefore = structuredClone([runPlayer.inventory, runPlayer.dailyQuestCompletions, runPlayer.sectDailyContributionClaims]);
      const stonesBefore = runPlayer.stones;
      const started = startSecretNest(runPlayer, returnPosition);
      ok(started.allowed, `${path} Gate 开局`);
      Math.random = () => 0;
      ok(fixtureClearSecretNestMobs().allowed, `${path} Gate 清房`);
      eq(ids(getSecretBoonState().pendingHand).length, 3, `${path} 清 combat_01 出三卡`);
      eq(rewardSecretNest(runPlayer).allowed, false, '未选择前不可跳过卡组结算');
      ok(chooseSecretBoon('sb_vigor'), `${path} 玩家选择一层`);
      ok(runPlayer.maxHp > runPlayer.baseMaxHp, `${path} 退出前有效层`);
      eq(clearSecretNestMob(started.allowed ? started.run.rooms[0]!.mobs[0]!.id : '').allowed, false, '已清 mob 不重复触发');
      eq(getSecretBoonState().pendingHand, undefined, '已清本房选后不再弹卡');
      if (path !== 'complete') onSecretBoonRoomClear(`pending_${path}`);
      if (path === 'complete') {
        const reward = rewardSecretNest(runPlayer);
        ok(reward.allowed, '选完才可领取原通关行');
        if (reward.allowed) eq([reward.exp, reward.stones, reward.item], [12, 20, null], 'O05 日倍闸关发基线 12／20，仍无 loot');
        eq(runPlayer.stones, stonesBefore + 20, '日倍闸关时灵石基线20');
      } else if (path === 'exit') ok(exitSecretNestSession().allowed, '退出 API 成功');
      else if (path === 'down') onSecretNestPlayerDown();
      else abandonSecretNestSession();
      eq(getSecretBoonState().layers, {}, `O03 ${path} 清全部层`);
      eq(getSecretBoonState().pendingHand, undefined, `O03 ${path} 清 pending`);
      eq(runPlayer.maxHp, runPlayer.baseMaxHp, `O03 ${path} 撤销局内属性`);
      eq([runPlayer.inventory, runPlayer.dailyQuestCompletions, runPlayer.sectDailyContributionClaims], assetsBefore, `${path} 无 loot／日奖变化`);
      if (path !== 'complete') eq(runPlayer.stones, stonesBefore, `${path} 不发通关资产`);
      const exported = runPlayer.exportSave();
      eq(Object.keys(exported).some(key => /boon|pendingHand|layers/i.test(key)), false, '卡组与层不序列化为存档字段');
      const loaded = new Progress();
      Object.defineProperty(loaded, 'save', { configurable: true, value: () => true });
      eq(loaded.importSave(exported), true, '真实 importSave／restore 成功（fixture 仅替换落盘）');
      eq(secretBoonRatio(loaded, 'hp_max'), 0, 'O04 离境后读档不恢复旧层');
      eq([loaded.maxHp, loaded.maxMp], [loaded.baseMaxHp, loaded.baseMaxMp], '读档只保留基础 hp／mp 上限');
      ok(loaded.hp <= loaded.baseMaxHp && loaded.mp <= loaded.baseMaxMp, '读档无机缘超出基础上限的 hp／mp');
      if (path === 'complete') eq(getSecretNestRun()?.rewarded, true, 'design/40 rewarded 仍保留');
    }
    eq(SECRET_NEST_MIN_LOOP.reward, { exp: 12, stones: 20, item: null }, 'design/40 最小结算硬读未改');
    eq(SECRET_NEST_MIN_LOOP.bossRoomRequired, false, '本刀不强制 boss');
    const gifts = npcsRaw.filter(npc => npc.affinity?.gifts);
    eq(gifts.length, 10, '十个既有 gifts 登记仍在');
    ok(gifts.every(npc => npc.affinity!.gifts.enabled === false), 'gifts 保持关闭');
    return { assertions };
  } finally {
    Math.random = originalRandom;
    resetSecretNestRunForTests(); clearRunBoons();
    setFeatureFlag('secret_boon_runtime', originalFlags.secret_boon_runtime);
    eq(featureFlags(), originalFlags, '夹具结束恢复全部软闸');
  }
}
