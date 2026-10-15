import { CLASS_LIST, classEntryEnabled, classRobe } from './classes';
import { dailyQuestDay } from './DailyQuests';
import { QUESTS, inPhase } from './data';
import { featureFlags } from './features';
import { Progress } from './Progress';
import { QuestSystem, type QuestReward } from './QuestSystem';
import { GameScene } from './scenes/GameScene';

let assertions = 0;
function equal(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
function check(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}

const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const dateNowBefore = Date.now;
const now = dateNowBefore();
const flagsBefore = featureFlags();
const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
let writes = 0;
let rejectAfter = Infinity;
const cls = CLASS_LIST.find(row => row.sect === 'taixu' && classEntryEnabled(row) && inPhase(QUESTS[row.joinQuest]))
  ?? CLASS_LIST.find(row => classEntryEnabled(row) && QUESTS[row.joinQuest] && inPhase(QUESTS[row.joinQuest]));
check(cls, 'Y10 回归需要一个正式开放的授职任务，不覆盖发版开关');
const quest = QUESTS[cls.joinQuest];

function armStorage(successfulWrites: number) { writes = 0; rejectAfter = successfulWrites; }
function baseProgress() {
  const p = new Progress();
  p.dailyQuestResetDay = dailyQuestDay(now);
  return p;
}
function readyToJoin() {
  const p = baseProgress();
  p.level = Math.max(11, quest.reqLevel);
  p.exp = p.expNeed - 1;
  p.stones = 560;
  p.quests.q_fox = { state: 'done', kills: {}, crafted: {} };
  p.skills = { spirit_bolt: 4 };
  p.skillGifted = { spirit_bolt: 1 };
  p.skillMastery = { spirit_bolt: 37 };
  p.hotbar[6] = 'spirit_bolt';
  p.buffs = [{ id: 'spirit_bolt', expireAt: now + 60000 }];
  p.skillCooldowns = { spirit_bolt: { readyAt: now + 60000, total: 60000 } };
  p.equip.robe = 'fox_robe';
  p.hp = 1; p.mp = 1;
  if (cls!.sect !== 'tianjian') { p.addItem('five_sect_token', 1); p.selectedSect = cls!.sect; }
  p.ensureDefaults(); p.backfillRealmRewards();
  const quests = new QuestSystem(p, () => now);
  equal(quests.accept(quest.id), true, `${cls!.id}: 真实接取开放的授职任务`);
  const trial = quest.objectives.find(objective => objective.type === 'trial')?.trial;
  if (trial) equal(quests.onTrialComplete(trial), true, `${cls!.id}: 真实胜利结算完成任务目标`);
  else quests.onTalk(quest.turnIn);
  equal(quests.complete(quest.id), true, `${cls!.id}: 交付夹具达到真实目标`);
  equal(p.save(), true, '注入故障前保存可再交的状态');
  return { p, quests };
}
function sceneFor(p: Progress) {
  return Object.assign(Object.create(GameScene.prototype), {
    prog: p, player: { syncAppearance() {} }, skillWindow: { refresh() {} },
    log() {}, levelUpFx() {}, maybeSpTip() {},
  }) as GameScene;
}
function assertJoinSettled(p: Progress, reward: QuestReward, context: string) {
  check(reward.settled, `${context}: 有已持久化奖励收据`);
  equal(p.quests[quest.id].state, 'done', `${context}: 任务已完成`);
  equal(p.job, cls!.id, `${context}: 正式职业与任务完成同步`);
  equal(p.stones, 560 + quest.rewards.spiritStone, `${context}: 灵石按奖励表只发一次`);
  equal(reward.settled.exp.gained, quest.rewards.exp, `${context}: 修为按奖励表发放`);
  check(p.level > 11, `${context}: 修为实际跨越升级并发放属性点`);
  check(p.unspentStatPoints > 0, `${context}: 升级发放的属性点已结算`);
  equal(p.hp, p.maxHp, `${context}: 升级回满生命`);
  equal(p.mp, p.maxMp, `${context}: 升级回满法力`);
  const robe = classRobe(cls!);
  check(robe, `${context}: 正式职业配置拜入道袍`);
  equal(p.equip.robe, robe, `${context}: 道袍已装备`);
  equal(p.count('fox_robe'), 1, `${context}: 旧衣只入背包一次`);
  equal(p.count(robe), 0, `${context}: 拜入道袍不会额外发一份到背包`);
  equal(p.classRewardClaims, [cls!.id], `${context}: 拜入奖励收据只登记一次`);
  equal(p.classRefundSp, 3, `${context}: 通用技能付费等级退款`);
  equal(p.skillLevel('spirit_bolt'), 0, `${context}: 通用技已替换`);
  equal(p.buffs, [], `${context}: 通用技增益已清理`);
  equal(p.skillCooldowns, {}, `${context}: 通用技冷却已清理`);
  for (const gift of quest.rewards.skills ?? []) {
    equal(p.skillLevel(gift.id), gift.level, `${context}: ${gift.id} 按表赠级`);
    equal(p.skillGifted[gift.id], gift.level, `${context}: ${gift.id} 赠级收据同步`);
  }
}

try {
  Date.now = () => now;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => {
      if (key === saveKey && ++writes > rejectAfter) throw new Error('Y10 injected storage failure');
      saved[key] = String(value);
    },
    removeItem: (key: string) => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: (index: number) => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  } });

  // 原 Y10 故障模型：第 1 笔成功，第 2 笔起失败；首笔现在必须包含完整交付。
  {
    const { p, quests } = readyToJoin();
    let notified = 0;
    quests.onCompleted(reward => {
      notified++;
      equal(JSON.parse(saved[saveKey]), p.exportSave(), '完成通知发出前完整交付已经落盘');
      check(reward.settled, '完成通知包含已结算奖励收据');
    });
    armStorage(1);
    const reward = quests.turnIn(quest.id);
    check(reward, '首笔成功、后续失败时正式交付成功');
    equal(writes, 1, '含嵌套 advanceClass 的交付只执行一次真实写盘');
    assertJoinSettled(p, reward, '首笔成功');
    equal(JSON.parse(saved[saveKey]), p.exportSave(), '首笔磁盘态包含 done、职业、灵石、修为和全部奖励');
    const snapshot = p.exportSave();
    const scene = sceneFor(p);
    scene.giveRewards(reward.quest, reward.broke, reward.daily, reward.settled);
    scene.giveRewards(reward.quest, reward.broke, reward.daily, reward.settled);
    equal(p.exportSave(), snapshot, '奖励 UI 重复显示不重新结算');
    equal(writes, 1, '奖励 UI 包含升级反馈也不追加写盘');
    equal(quests.turnIn(quest.id), undefined, '同会话无法重复交付');
    equal(notified, 1, '一次交付只发一次完成通知');
    const reloaded = Progress.load();
    equal(reloaded.exportSave(), snapshot, '故障注入后刷新保留完整交付奖励');
    equal(new QuestSystem(reloaded, () => now).turnIn(quest.id), undefined, '刷新后不能重复交付');
    equal(writes, 1, '刷新不依赖补奖或迁移写盘');
  }

  // 所有写盘失败时保留可交付的内存/磁盘态；故障解除后的重试只发一份奖励。
  {
    armStorage(Infinity);
    const { p, quests } = readyToJoin();
    const before = JSON.stringify(p), diskBefore = saved[saveKey];
    let notified = 0;
    quests.onCompleted(() => { notified++; });
    armStorage(0);
    equal(quests.turnIn(quest.id), undefined, '首笔失败时交付返回失败');
    equal(writes, 1, '失败交付只有一次真实写盘尝试');
    equal(JSON.stringify(p), before, '失败完整恢复职业、技能、赠级、热键、增益、收据、装备、背包与成长状态');
    equal(saved[saveKey], diskBefore, '失败保留原磁盘态');
    equal(notified, 0, '存档失败不发送完成通知');
    equal(quests.complete(quest.id), true, '失败后原实例仍可再交');
    const reloaded = Progress.load();
    equal(new QuestSystem(reloaded, () => now).complete(quest.id), true, '失败后刷新仍可再交补领');
    armStorage(Infinity);
    const reward = quests.turnIn(quest.id);
    check(reward, '存储恢复后可重试成功');
    assertJoinSettled(p, reward, '失败重试');
    equal(writes, 1, '重试同样只写盘一次');
    equal(notified, 1, '成功重试只发送一次完成通知');
    const snapshot = p.exportSave();
    equal(quests.turnIn(quest.id), undefined, '重试成功后不可重复交付');
    equal(p.exportSave(), snapshot, '重复交付不再增加奖励');
  }

  // 授职拒绝或中途抛错也不能先留下 done；模拟在真实授职已改变多个字段后失败。
  for (const failure of ['refuse', 'throw'] as const) {
    armStorage(Infinity);
    const { p, quests } = readyToJoin();
    const advanceClass = p.advanceClass.bind(p);
    p.advanceClass = job => {
      equal(advanceClass(job), true, `${failure}: 真实授职先改变嵌套状态`);
      if (failure === 'throw') throw new Error('Y10 injected class failure');
      return false;
    };
    const before = JSON.stringify(p), diskBefore = saved[saveKey];
    let notified = 0;
    quests.onCompleted(() => { notified++; });
    armStorage(Infinity);
    equal(quests.turnIn(quest.id), undefined, `${failure}: 授职失败则交付失败`);
    equal(writes, 0, `${failure}: 授职失败不写半份存档`);
    equal(JSON.stringify(p), before, `${failure}: 授职失败恢复全部实例数据`);
    equal(saved[saveKey], diskBefore, `${failure}: 授职失败保留原磁盘态`);
    equal(notified, 0, `${failure}: 授职失败不通知完成`);
    equal(quests.complete(quest.id), true, `${failure}: 授职失败后仍可再交`);
  }

  for (const id of ['q_snake', 'q_breakthrough']) {
    armStorage(Infinity);
    const q = QUESTS[id], p = baseProgress();
    check(q && inPhase(q), `${id}: 使用正式开放任务覆盖扣料/突破回滚`);
    p.level = q.reqLevel; p.exp = p.expNeed; p.stones = 560;
    p.unspentStatPoints = 7; p.hp = 1; p.mp = 1;
    p.overflowExp = id === 'q_breakthrough' ? 123 : 0;
    p.quests[id] = { state: 'active', kills: {}, crafted: {} };
    for (const objective of q.objectives) {
      if (objective.type === 'collect') p.addItem(objective.target!, objective.count!);
      if (objective.type === 'kill') p.quests[id].kills[objective.target!] = objective.count!;
    }
    const quests = new QuestSystem(p, () => now);
    equal(quests.complete(id), true, `${id}: 真实目标已达交付条件`);
    equal(p.save(), true, `${id}: 保存待交付夹具`);
    const before = JSON.stringify(p), diskBefore = saved[saveKey];
    let notified = 0;
    quests.onCompleted(() => { notified++; });
    armStorage(0);
    equal(quests.turnIn(id), undefined, `${id}: 存档失败交付不成功`);
    equal(JSON.stringify(p), before, `${id}: 存档失败恢复材料、突破、等级、修为、溢出池、属性点及奖励`);
    equal(saved[saveKey], diskBefore, `${id}: 存档失败保留可交付磁盘态`);
    equal(notified, 0, `${id}: 存档失败不通知完成`);
    armStorage(Infinity);
    const reward = quests.turnIn(id);
    check(reward?.settled, `${id}: 存储恢复后可再交并返回奖励收据`);
    equal(writes, 1, `${id}: 成功重试一次写盘`);
    equal(p.stones, 560 + q.rewards.spiritStone, `${id}: 重试灵石只发一次`);
    if (id === 'q_breakthrough') {
      equal(reward.broke, true, '突破任务成功重试完成突破');
      check(p.level > q.reqLevel, '突破任务成功重试推进境界与等级');
      equal(p.lastOverflowReturned, 123, '突破成功只返还一次原溢出池');
    }
    for (const objective of q.objectives) {
      if (objective.type === 'collect' && objective.consume !== false) equal(p.count(objective.target!), 0, `${id}: 成功才扣除交付材料`);
    }
    equal(quests.turnIn(id), undefined, `${id}: 重试成功后不能再领奖`);
    equal(JSON.parse(saved[saveKey]), p.exportSave(), `${id}: 磁盘与内存交付奖励一致`);
  }

  equal(featureFlags(), flagsBefore, 'Y10 事务回归保持全部正式开关原样');
  console.log(JSON.stringify({ suite: 'quest-rewards-atomic-save', passed: true, assertions,
    formalClass: cls.id, scenarios: ['first-save-only', 'all-saves-fail-retry', 'class-refusal', 'class-throw', 'collect-rollback', 'breakthrough-rollback'], features: flagsBefore }));
} finally {
  Date.now = dateNowBefore;
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
