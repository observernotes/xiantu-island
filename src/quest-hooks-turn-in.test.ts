import karmaFlagsRaw from '@xt/balance/karma_flags.json';
import { QUEST_HOOKS, QUESTS } from './data';
import { dailyQuestDay } from './DailyQuests';
import { Progress } from './Progress';
import { parseQuestHooks, type QuestHook, type QuestHooksConfig } from './QuestHooks';
import { QuestSystem, type QuestReward } from './QuestSystem';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
function snapshot(progress: Progress) { return JSON.stringify(progress.exportSave()); }
function enabledFixture(hookId: string) {
  const raw = structuredClone(karmaFlagsRaw);
  raw.questHooks.find(hook => hook.id === hookId)!.enabled = true;
  const parsed = parseQuestHooks(raw);
  eq(parsed.errors.length, 0, `${hookId} 交付 fixture 无坏表`);
  ok(parsed.config, `${hookId} 交付 fixture 可解析`);
  return parsed.config;
}

const now = Date.now(), saveKey = 'xiantu_save_v1';
const disk: Record<string, string> = {};
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
let writes = 0;
function ready(hook: QuestHook, config: QuestHooksConfig | null = QUEST_HOOKS) {
  const p = new Progress();
  p.level = QUESTS[hook.quest].reqLevel;
  p.stones = 37;
  p.dailyQuestResetDay = dailyQuestDay(now);
  if (hook.quest === 'q_sect_tianjian') p.quests.q_fox = { state: 'done', kills: {} };
  p.quests[hook.quest] = { state: 'active', kills: {}, reached: true, talked: { tianjian_elder: true } };
  // 好感由自身回归覆盖；此处只隔离任务原奖励与正魔 hooks 的共同事务。
  const quests = new QuestSystem(p, () => now, null, config);
  ok(quests.complete(hook.quest), `${hook.quest} 真实目标与交付门槛就绪`);
  return { p, quests };
}
function originalReward(hook: QuestHook, p: Progress, reward: QuestReward | undefined) {
  ok(reward?.settled, `${hook.quest} 返回已持久化原任务奖励`);
  eq(p.quests[hook.quest].state, 'done', `${hook.quest} 与奖励一起完成`);
  eq(p.stones, 37 + QUESTS[hook.quest].rewards.spiritStone, `${hook.quest} 原灵石数量保持`);
  eq(reward.settled.exp.gained, QUESTS[hook.quest].rewards.exp, `${hook.quest} 原修为数量保持`);
  for (const item of QUESTS[hook.quest].rewards.items ?? []) {
    eq(p.count(item.item) + Number(Object.values(p.equip).includes(item.item)), item.count, `${hook.quest} ${item.item} 原奖励仅一份`);
  }
  if (hook.quest === 'q_sect_tianjian') {
    eq(p.sect, 'tianjian', '正魔选择仍正常拜入天剑宗');
    for (const skill of QUESTS[hook.quest].rewards.skills ?? []) eq(p.skillLevel(skill.id), skill.level, `${skill.id} 原技能赠级保持`);
  }
}

try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk[key] ?? null,
    setItem: (key: string, value: string) => { writes++; disk[key] = value; },
    removeItem: (key: string) => { delete disk[key]; },
  } });
  ok(QUEST_HOOKS, '正式两个任务选择配置可用');
  for (const hook of QUEST_HOOKS.questHooks) {
    eq(hook.enabled, false, `${hook.id} 正式关态`);
    for (const choiceId of [undefined, 'unknown']) {
      const { p, quests } = ready(hook), beforeWrites = writes;
      const moral = { daoHeart: p.daoHeart, morality: p.morality };
      originalReward(hook, p, quests.turnIn(hook.quest, false, choiceId));
      same({ daoHeart: p.daoHeart, morality: p.morality }, moral, '关态交付不改两轴');
      eq(p.karmaFlags, undefined, '关态交付不创建因果');
      same(p.relationshipState.questChoices, {}, '关态不伪造选择');
      same(p.relationshipState.appliedQuestHooks, [], '关态不消费任务选择资格');
      eq(writes, beforeWrites + 1, '关态原奖励仍一次保存');
    }

    const config = enabledFixture(hook.id);
    {
      const { p, quests } = ready(hook, config), before = snapshot(p), beforeWrites = writes;
      eq(quests.turnIn(hook.quest), undefined, '开态未给显式选择保留节点');
      eq(snapshot(p), before, '未选择不交任务、不发原奖励或新增效果');
      eq(writes, beforeWrites, '未选择不保存');
      eq(quests.turnIn(hook.quest, false, 'unknown'), undefined, '未知选择拒绝原任务提交');
      eq(snapshot(p), before, '未知选择保留原档');
      eq(writes, beforeWrites, '未知选择不保存');
    }
    for (const axis of ['daoHeart', 'morality'] as const) {
      const { p, quests } = ready(hook, config);
      (p as unknown as Record<string, unknown>)[axis] = undefined;
      const other = axis === 'daoHeart' ? 'morality' : 'daoHeart', retained = p[other], beforeWrites = writes;
      originalReward(hook, p, quests.turnIn(hook.quest));
      eq(p[axis], undefined, '未就绪沿用原交付不补造轴值');
      eq(p[other], retained, '未就绪不改另一轴');
      eq(p.karmaFlags, undefined, '未就绪不写因果');
      same(p.relationshipState.questChoices, {}, '未就绪不默认选 A');
      same(p.relationshipState.appliedQuestHooks, [], '未就绪不消费选择资格');
      eq(writes, beforeWrites + 1, '未就绪仍一次提交原奖励');
    }
    for (const choice of hook.choices) {
      const { p, quests } = ready(hook, config), beforeWrites = writes;
      const before = { daoHeart: p.daoHeart, morality: p.morality };
      let notified = 0;
      quests.onCompleted(() => { notified++; });
      originalReward(hook, p, quests.turnIn(hook.quest, false, choice.id));
      eq(p.daoHeart, before.daoHeart + (choice.hooks.daoHeartDelta ?? 0), '交付当场结算道心');
      eq(p.morality, before.morality + (choice.hooks.moralityDelta ?? 0), '交付当场结算善恶');
      same(p.karmaFlags, Object.fromEntries(choice.hooks.karma.map(action => [action.flag, true])), '交付结算当前 choice 因果');
      same(p.relationshipState.questChoices, { [hook.quest]: choice.id }, '选择按 quest id 保存');
      same(p.relationshipState.appliedQuestHooks, [hook.quest], '整题按 quest id once');
      eq(writes, beforeWrites + 1, '任务、原奖励、选择、两轴与因果只有一个保存点');
      same(JSON.parse(disk[saveKey]), p.exportSave(), '主档包含整笔交付');
      const after = snapshot(p);
      for (const repeated of hook.choices) eq(quests.turnIn(hook.quest, false, repeated.id), undefined, '同题另一选择也不能重复提交');
      eq(snapshot(p), after, '重复交付不重发原奖励或新增效果');
      eq(writes, beforeWrites + 1, '重复交付不额外保存');
      eq(notified, 1, '成功交付只通知一次');
    }
    for (const throws of [false, true]) {
      const { p, quests } = ready(hook, config), choice = hook.choices[hook.choices.length - 1];
      ok(p.save(), '保存故障前的完整活动节点');
      const before = snapshot(p), beforeDisk = disk[saveKey], beforeWrites = writes;
      let notified = 0;
      quests.onCompleted(() => { notified++; });
      Object.defineProperty(p, 'save', { configurable: true, value: () => {
        if (throws) throw new Error('quest hooks injected save failure');
        return false;
      } });
      eq(quests.turnIn(hook.quest, false, choice.id), undefined, '写盘拒绝/异常不报交付成功');
      eq(snapshot(p), before, '写盘失败回滚任务、职业、原奖励、两轴、因果、选择及收据');
      eq(disk[saveKey], beforeDisk, '写盘失败保持原盘');
      eq(writes, beforeWrites, '失败不落任何半份存档');
      eq(notified, 0, '失败不触发完成通知');
      Reflect.deleteProperty(p, 'save');
      originalReward(hook, p, quests.turnIn(hook.quest, false, choice.id));
      same(p.relationshipState.appliedQuestHooks, [hook.quest], '失败后重试整题只结算一次');
      eq(writes, beforeWrites + 1, '重试只有一个完整保存点');
      eq(notified, 1, '重试成功通知一次');
    }
    {
      const { p, quests } = ready(hook, config), before = snapshot(p), beforeWrites = writes;
      const transaction = p.runSaveTransaction.bind(p);
      Object.defineProperty(p, 'runSaveTransaction', { configurable: true, value: <T>(apply: () => T | undefined) => transaction(() => {
        p.quests[hook.quest].state = 'done';
        return apply();
      }) });
      eq(quests.turnIn(hook.quest, false, hook.choices[0].id), undefined, '事务开始后任务已完成时再次复检拒绝');
      eq(snapshot(p), before, '事务内复检拒绝保留原活动节点');
      eq(writes, beforeWrites, '事务内复检拒绝不保存');
    }
  }
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
console.log(`quest hooks turn-in tests ok: ${assertions} assertions (disabled fallback, explicit fixture choices, one atomic save, rollback and retry)`);
