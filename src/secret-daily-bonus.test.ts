import secretRooms from '@xt/balance/secret_rooms.json';
import { GAME_PHASE } from './data';
import { dailyQuestDay } from './DailyQuests';
import { setGameTimeSource } from './GameClock';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { Progress } from './Progress';
import {
  SECRET_NEST_MIN_LOOP, startSecretNest, fixtureClearSecretNestMobs, rewardSecretNest,
  getSecretNestRun, exitSecretNestSession, abandonSecretNestSession,
  onSecretNestPlayerDown, resetSecretNestRunForTests,
} from './SecretNestGate';
import { chooseSecretBoon, getSecretBoonState, secretBoonRatio } from './SecretBoonRuntime';

/** design/50 Soft OpenPreRelease 落盘 true；关回／缺键只用会话或 missing-key 夹具。 */
export async function runSecretDailyBonusTests(options: { dataMode?: string; closedOnly?: boolean } = {}): Promise<{ assertions: number }> {
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
  const randomBefore = Math.random;
  let now = new Date(2026, 9, 23, 12).getTime();
  const returnPosition = { mapId: 'wanyao_outer_1', x: 480, y: 800 };
  const player = () => {
    const p = new Progress();
    p.level = 32; p.exp = 1; p.stones = 1000; p.hp = p.maxHp; p.mp = p.maxMp;
    p.quests.q_main_04 = { state: 'done', kills: {} };
    p.quests.q_main_06 = { state: 'active', kills: { millennium_tree_demon: 0 } };
    p.quests.q_secret_nest_intro = { state: 'done', kills: {}, reached: true };
    return p;
  };
  const daily = (p: Progress) => [p.secretNestDailyBonusDay, p.secretNestDailyBonusCount];
  const untouchedAssets = (p: Progress) => structuredClone({ inventory: p.inventory, main06: p.quests.q_main_06,
    dailyQuests: p.dailyQuestCompletions, contributionClaims: p.sectDailyContributionClaims });
  const start = (p: Progress) => {
    resetSecretNestRunForTests();
    const result = startSecretNest(p, returnPosition);
    ok(result.allowed, '沿既有门禁成功开局');
    if (!result.allowed) throw new Error(`${label}: start denied`);
    eq(result.run.rooms.length, 1, '仍只生成一间 combat_01，不扩房');
    return result;
  };
  const clear = () => ok(fixtureClearSecretNestMobs().allowed, '清原最小战斗房');
  const settle = (p: Progress, exp: number, stones: number) => {
    const before = { exp: p.exp, stones: p.stones, assets: untouchedAssets(p) };
    const result = rewardSecretNest(p);
    ok(result.allowed, '通关实际发放成功');
    if (!result.allowed) throw new Error(`${label}: reward denied`);
    eq([result.exp, result.stones, result.item], [exp, stones, null], '本笔返回实发通关行，仍不开 loot');
    eq(result.receipt, { expGained: exp, stonesGranted: stones }, 'receipt 为本笔实发值');
    eq([p.exp, p.stones], [before.exp + exp, before.stones + stones], '修为与灵石实际入账');
    eq(untouchedAssets(p), before.assets, '不发物品／精炼石／日常奖／主线击杀');
    eq(getSecretNestRun()?.rewarded, true, '成功后保留 rewarded 防重领');
    return result;
  };
  // getter 与 setter 均抛错：比只比较最终值更严格，禁止关态／拒绝路径偷读或换日写入。
  const withoutDailyAccess = <T>(p: Progress, action: () => T): T => {
    const names = ['secretNestDailyBonusDay', 'secretNestDailyBonusCount'] as const;
    const descriptors = names.map(name => Object.getOwnPropertyDescriptor(p, name)!);
    for (const name of names) Object.defineProperty(p, name, {
      configurable: true, enumerable: true,
      get: () => { throw new Error(`${label}: 禁止读取 ${name}`); },
      set: () => { throw new Error(`${label}: 禁止写入 ${name}`); },
    });
    try { return action(); }
    finally { names.forEach((name, i) => Object.defineProperty(p, name, descriptors[i]!)); }
  };
  const importInto = (saved: unknown) => {
    const p = new Progress();
    Object.defineProperty(p, 'save', { configurable: true, value: () => true });
    return { p, imported: p.importSave(saved) };
  };

  setGameTimeSource(() => now);
  Math.random = () => 0;
  try {
    eq(featureEnabled('secret_daily_bonus'), options.closedOnly ? false : true,
      options.closedOnly ? '缺键必须关日倍软闸' : '正式快照 Soft OpenPreRelease 日倍软闸落盘 true');
    eq(featureEnabled('secret_boon_runtime'), true, '既有 boon 正式快照 true 不变');
    eq(GAME_PHASE, 5, 'GAME_PHASE 仍为 5');
    eq(SECRET_NEST_MIN_LOOP.reward, { exp: 12, stones: 20, item: null }, '基线常量公式保持 12／20／null');
    eq(SECRET_NEST_MIN_LOOP.bossRoomRequired, false, '仍无强制 boss');
    eq(secretRooms.rewards.dailyBonus, { runs: 3, mul: 2 }, '两根实读表 runs／mul 沿用 3／2.0');

    setFeatureFlag('secret_boon_runtime', false);
    if (!options.closedOnly) setFeatureFlag('secret_daily_bonus', false);
    const closed = player();
    closed.secretNestDailyBonusDay = '2020-01-01'; closed.secretNestDailyBonusCount = 2;
    start(closed); clear();
    withoutDailyAccess(closed, () => settle(closed, 12, 20));
    eq(daily(closed), ['2020-01-01', 2], '缺键／会话关闸成功结算不借跨日迁移历史字段');
    ok(exitSecretNestSession().allowed, '关态成功后仍可退出');
    setFeatureFlag('secret_daily_bonus', false);
    start(closed); clear();
    withoutDailyAccess(closed, () => settle(closed, 12, 20));
    eq(daily(closed), ['2020-01-01', 2], '显式 false 结算零读写');
    if (options.closedOnly) return { assertions };

    setFeatureFlag('secret_daily_bonus', true);
    const p = player();
    eq(daily(p), ['', 0], 'Progress 新字段默认未记日／零次');
    for (let i = 1; i <= 4; i++) {
      start(p); clear();
      settle(p, i <= 3 ? 24 : 12, i <= 3 ? 40 : 20);
      eq(daily(p), [dailyQuestDay(now), Math.min(i, 3)], `第 ${i} 笔仅前三次占额`);
      withoutDailyAccess(p, () => eq(rewardSecretNest(p).allowed, false, '重复领取拒绝且零日倍读写'));
      eq(p.secretNestDailyBonusCount, Math.min(i, 3), '重领不占额度');
      ok(exitSecretNestSession().allowed, '成功结算后退出');
      eq(p.secretNestDailyBonusCount, Math.min(i, 3), '退出不重置日倍额度');
    }
    eq(p.stones, 1000 + 3 * 40 + 20, '三笔加成＋第四笔基线合计入账');

    // 拒绝路径即使存着旧日，也不得读取／修改两个日倍字段。
    const denied = player();
    denied.secretNestDailyBonusDay = '2020-01-01'; denied.secretNestDailyBonusCount = 2;
    resetSecretNestRunForTests();
    withoutDailyAccess(denied, () => eq(rewardSecretNest(denied).allowed, false, '无 activeRun 拒绝'));
    start(denied);
    withoutDailyAccess(denied, () => eq(rewardSecretNest(denied).allowed, false, '未清房拒绝'));
    clear();
    withoutDailyAccess(denied, () => eq(rewardSecretNest().allowed, false, '无 Progress 拒绝'));
    for (const stones of [-1, Number.NaN, Number.MAX_SAFE_INTEGER, Number.MAX_SAFE_INTEGER - 20]) {
      denied.stones = stones;
      withoutDailyAccess(denied, () => eq(rewardSecretNest(denied).allowed, false, `余额 ${String(stones)} 无法入账拒绝`));
      eq(getSecretNestRun()?.rewarded, false, '不可入账不标 rewarded，可重试');
    }
    eq(daily(denied), ['2020-01-01', 2], '全部拒绝路径未迁移旧日或占额');
    denied.stones = 1000;
    settle(denied, 24, 40);
    eq(daily(denied), [dailyQuestDay(now), 1], '拒绝后修复余额重试只占一笔');

    // 04:59 仍属前一天，05:00 后首笔才清零重新占额；开局／清房自身不换日。
    now = new Date(2026, 9, 24, 4, 59, 59, 999).getTime();
    const rollover = player();
    rollover.secretNestDailyBonusDay = '2026-10-23'; rollover.secretNestDailyBonusCount = 3;
    eq(dailyQuestDay(now), '2026-10-23', '05:00 前日键保持前日');
    start(rollover); clear(); settle(rollover, 12, 20);
    eq(daily(rollover), ['2026-10-23', 3], '05:00 前已满额度只发基线');
    now = new Date(2026, 9, 24, 5).getTime();
    eq(dailyQuestDay(now), '2026-10-24', '05:00 准点进入新日');
    start(rollover); clear();
    eq(daily(rollover), ['2026-10-23', 3], '开局及清房不抢先换日日倍字段');
    settle(rollover, 24, 40);
    eq(daily(rollover), ['2026-10-24', 1], '跨日实际发放才清零并占首笔');
    now = new Date(2026, 9, 25, 5).getTime();
    setFeatureFlag('secret_daily_bonus', false);
    start(rollover); clear();
    withoutDailyAccess(rollover, () => settle(rollover, 12, 20));
    eq(daily(rollover), ['2026-10-24', 1], '次日关回仍不换日、不增计数');

    // boon 正交：日倍开与关都不能跳过 pending；选中层不被日倍叠乘。
    setFeatureFlag('secret_daily_bonus', true);
    setFeatureFlag('secret_boon_runtime', true);
    const boon = player();
    boon.secretNestDailyBonusDay = '2020-01-01'; boon.secretNestDailyBonusCount = 2;
    start(boon); clear();
    const hand = getSecretBoonState().pendingHand ?? [];
    eq(hand.length, 3, '既有 boon 闸 true 仍清房三选一');
    for (const dailyFlag of [false, true]) {
      setFeatureFlag('secret_daily_bonus', dailyFlag);
      withoutDailyAccess(boon, () => eq(rewardSecretNest(boon).allowed, false, 'pending 阻结算且不读写日倍'));
      eq(daily(boon), ['2020-01-01', 2], 'pending 不换日、不占额度');
    }
    ok(hand.some(card => card.id === 'sb_vigor'), '真实抽牌含 common vigor');
    ok(chooseSecretBoon('sb_vigor'), '选择真实候选后解除 pending');
    eq(secretBoonRatio(boon, 'hp_max'), 0.06, '日倍开不乘 common 机缘层效果');
    eq(getSecretBoonState().layers.sb_vigor, 1, '日倍开不乘机缘层数');
    settle(boon, 24, 40);
    eq(daily(boon), [dailyQuestDay(now), 1], '选后可独立领取日倍');
    eq(getSecretBoonState().layers, {}, '通关结算清 boon 层');
    eq(getSecretBoonState().pendingHand, undefined, '通关结算清 pending');
    eq(secretBoonRatio(boon, 'hp_max'), 0, '通关撤销机缘效果');
    for (const lifecycle of ['exit', 'down', 'abandon'] as const) {
      start(boon); clear();
      if (lifecycle === 'exit') ok(exitSecretNestSession().allowed, '中途退出仍成功');
      else if (lifecycle === 'down') onSecretNestPlayerDown();
      else abandonSecretNestSession();
      eq(getSecretBoonState().layers, {}, `${lifecycle} 清机缘层`);
      eq(getSecretBoonState().pendingHand, undefined, `${lifecycle} 清 pending`);
      eq(daily(boon), [dailyQuestDay(now), 1], `${lifecycle} 不清日倍历史额度`);
    }
    const killOn = player().gainExp(100, 32, 'kill');
    setFeatureFlag('secret_daily_bonus', false);
    const killOff = player().gainExp(100, 32, 'kill');
    eq(killOn, killOff, '日倍软闸不乘击杀修为通道');

    // 存档独立保存日键／日通计数；合法历史不在导入或 normalize 时换日。
    const savedPlayer = player();
    savedPlayer.secretNestDailyBonusDay = '2020-01-01'; savedPlayer.secretNestDailyBonusCount = 2;
    const saved = savedPlayer.exportSave();
    eq([saved.secretNestDailyBonusDay, saved.secretNestDailyBonusCount], ['2020-01-01', 2], 'exportSave 保留合法历史日键和次数');
    const loaded = importInto(saved);
    ok(loaded.imported, '合法日倍存档可真实 importSave');
    eq(daily(loaded.p), ['2020-01-01', 2], '导入不借每日任务换日重置日倍历史');
    loaded.p.ensureDefaults();
    eq(daily(loaded.p), ['2020-01-01', 2], 'normalize 不主动换日');
    const oldSaved = { ...saved };
    delete oldSaved.secretNestDailyBonusDay; delete oldSaved.secretNestDailyBonusCount;
    const legacy = importInto(oldSaved);
    ok(legacy.imported, '缺日倍字段旧档兼容导入');
    eq(daily(legacy.p), ['', 0], '旧档仅补空日键／零次');
    const max = importInto({ ...saved, secretNestDailyBonusCount: Number.MAX_SAFE_INTEGER });
    ok(max.imported, '非负安全整数上界可导入');
    eq(max.p.secretNestDailyBonusCount, Number.MAX_SAFE_INTEGER, '合法已满次数不截断或自增');
    for (const invalid of [-1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Infinity, '2', null, {}]) {
      eq(importInto({ ...saved, secretNestDailyBonusCount: invalid }).imported, false, `导入非法 count ${String(invalid)} 拒绝`);
      const broken = player();
      Object.assign(broken, { secretNestDailyBonusDay: 123, secretNestDailyBonusCount: invalid });
      const exported = broken.exportSave();
      eq([exported.secretNestDailyBonusDay, exported.secretNestDailyBonusCount], ['', 0], '导出内存坏值回落安全初值');
      broken.ensureDefaults();
      eq(daily(broken), ['', 0], 'normalize 内存坏值回落空日键／零次');
    }
    for (const invalidDay of [123, null, [], {}]) {
      eq(importInto({ ...saved, secretNestDailyBonusDay: invalidDay }).imported, false, '导入非 string 日键拒绝');
    }
    const resumed = importInto(saved);
    ok(resumed.imported, '历史存档再次导入');
    setFeatureFlag('secret_boon_runtime', false);
    setFeatureFlag('secret_daily_bonus', true);
    start(resumed.p); clear(); settle(resumed.p, 24, 40);
    eq(daily(resumed.p), [dailyQuestDay(now), 1], '历史存档仅开闸实际发放时换日');
  } finally {
    resetSecretNestRunForTests();
    setGameTimeSource(null);
    Math.random = randomBefore;
    for (const name of Object.keys(flagsBefore) as (keyof typeof flagsBefore)[]) setFeatureFlag(name, flagsBefore[name]);
  }
  eq(featureFlags(), flagsBefore, '会话开关测试后全部复原');
  return { assertions };
}
