import rawQuests from '@xt/balance/quests.json';
import strings from '@xt/balance/strings_zh.json';
import { CLASS_LIST } from './classes';
import { dailyContribution, dailyQuestDay } from './DailyQuests';
import { NPCS, QUESTS, QUEST_ORDER, QuestDef, REALMS, SECT_SECLUSION, t } from './data';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { realDay, Seclusion } from './Seclusion';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}：得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

// Date.now 与任务时钟一起控制，不改系统日期，不写共享表或 data/ 快照。
let now = new Date(2026, 9, 10, 4, 59, 59, 999).getTime();
const originalNow = Date.now;
Date.now = () => now;
const beforeFive = now, atFive = new Date(2026, 9, 10, 5).getTime();
const nextFive = new Date(2026, 9, 11, 5).getTime();
const disk: Record<string, string> = {};
globalThis.localStorage = {
  getItem: key => disk[key] ?? null,
  setItem: (key, value) => { disk[key] = String(value); },
  removeItem: key => { delete disk[key]; },
  clear: () => { for (const key of Object.keys(disk)) delete disk[key]; },
  key: index => Object.keys(disk)[index] ?? null,
  get length() { return Object.keys(disk).length; },
};
const saveKey = 'xiantu_save_v1';
const rows = Object.values(QUESTS).filter(q => q.daily);
const own = rows.filter(q => q.sect === 'tianjian');
function joined(sect = 'tianjian') {
  const p = new Progress(); p.level = 29;
  const cls = CLASS_LIST.find(c => c.sect === sect);
  ok(cls, `${sect} 职业已登记`);
  // 已交付的拜宗事实用于既有成员回归，不受四宗新入口开关限制。
  p.quests[cls.joinQuest] = { state: 'done', kills: {} };
  ok(p.advanceClass(cls.id), `${sect} 正式拜入成功`);
  p.resetDailyQuests(now);
  return p;
}
function objectives(qs: QuestSystem, p: Progress, q: QuestDef) {
  for (const objective of q.objectives) {
    if (objective.type === 'kill') for (let index = 0; index < objective.count!; index++) qs.onKill(objective.target!);
    else if (objective.type === 'collect') p.addItem(objective.target!, objective.count!);
    else if (objective.type === 'talk') qs.talk(objective.target!);
    else throw new Error(`测试尚未准备目标 ${objective.type}`);
  }
}
function complete(qs: QuestSystem, p: Progress, q: QuestDef) {
  ok(qs.accept(q.id), `${q.id} 接取成功`);
  objectives(qs, p, q);
  ok(qs.complete(q.id), `${q.id} 目标已满足`);
  const reward = qs.talk(q.turnIn, q.id).after?.();
  ok(reward, `${q.id} NPC 交付返回奖励`);
  ok(reward.daily, `${q.id} NPC 交付返回已结算日常奖励`);
  return { ...reward, daily: reward.daily };
}

try {
  // 日期比较使用本地日历，05:00 前后严格归两个日常日。
  eq(dailyQuestDay(beforeFive), dailyQuestDay(new Date(2026, 9, 9, 5).getTime()), '05:00 前归前一日');
  ok(dailyQuestDay(beforeFive) !== dailyQuestDay(atFive), '恰好 05:00 换日');
  eq(dailyQuestDay(atFive), dailyQuestDay(new Date(2026, 9, 11, 4, 59, 59, 999).getTime()), '05:00 到次日 04:59 属同一天');
  ok(dailyQuestDay(atFive) !== dailyQuestDay(nextFive), '次日 05:00 再次换日');
  eq(dailyQuestDay(new Date(2027, 0, 1, 4).getTime()), dailyQuestDay(new Date(2026, 11, 31, 23).getTime()), '跨年日期正确');
  eq(dailyQuestDay(new Date(2026, 2, 1, 4).getTime()), dailyQuestDay(new Date(2026, 1, 28, 23).getTime()), '月末日历日期正确');

  // 全量 15 条用原表 giver/turnIn、名称和三种对白，NPC 标记沿用 ! / … / ?。
  eq(rows.length, 15, '五宗日常全量开放');
  for (const cls of CLASS_LIST) eq(rows.filter(q => q.sect === cls.sect).length, 3, `${cls.sect} 固定三条日常`);
  for (const q of rows) {
    const raw = rawQuests.find(row => row.id === q.id);
    ok(raw?.daily && raw.sect && raw.nameKey && raw.descriptionKey && raw.dialogueKeys, `${q.id} 日常字段齐全`);
    const table = strings as unknown as Record<string, string>;
    for (const key of [raw.nameKey, raw.descriptionKey, ...Object.values(raw.dialogueKeys)]) ok(table[key], `${q.id} 文案存在 ${key}`);
    eq(q.name, t(raw.nameKey), `${q.id} 名称读取 strings`);
    eq(q.giver, raw.giver, `${q.id} 接引人来自任务表`);
    eq(q.turnIn, raw.turnIn, `${q.id} 交付人来自任务表`);
    ok(NPCS[q.giver]?.quests.includes(q.id), `${q.id} NPC quests 登记入口`);
    const p = joined(q.sect), qs = new QuestSystem(p, () => now);
    ok(qs.npcDailyQuestIds(q.giver).includes(q.id), `${q.id} 本宗接引菜单存在`);
    eq(qs.mark(q.giver), '!', `${q.id} 可接标记`);
    const offered = qs.talk(q.giver, q.id);
    eq(offered.lines[0]?.text, t(raw.dialogueKeys.offer), `${q.id} 接取对白读取 strings`);
    offered.after?.();
    eq(qs.state(q.id), 'active', `${q.id} NPC 对话后接取`);
    // 移除其他菜单可接项后检查进行中标记优先级。
    for (const otherId of NPCS[q.giver].quests.filter(id => id !== q.id)) p.quests[otherId] = { state: 'done', kills: {} };
    eq(qs.mark(q.giver), '…', `${q.id} 进行中标记`);
    eq(qs.talk(q.giver, q.id).lines[0]?.text, t(raw.dialogueKeys.progress), `${q.id} 进行中对白读取 strings`);
    objectives(qs, p, q);
    eq(qs.mark(q.giver), '?', `${q.id} 可交付标记`);
    eq(qs.talk(q.turnIn, q.id).lines[0]?.text, t(raw.dialogueKeys.complete), `${q.id} 交付对白读取 strings`);
  }

  // 未入宗和外宗任务不能从菜单、直接 API 或完成回调绕过。
  {
    const p = new Progress(); p.level = 99;
    const qs = new QuestSystem(p, () => now);
    for (const q of rows) {
      eq(qs.available(q.id), false, `${q.id} 未拜入不可接`);
      eq(qs.accept(q.id), false, `${q.id} 直接接取仍拒绝`);
      eq(qs.talk(q.giver, q.id).after, undefined, `${q.id} 指定外宗 NPC 对话不提供接取回调`);
      same(qs.npcDailyQuestIds(q.giver), [], `${q.id} 未拜入没有日常菜单`);
    }
    eq(qs.mark(own[0].giver), null, '未入宗天剑接引没有日常标记');
    eq(p.onSectDailyQuestCompleted('q_fox', now), 0, '普通任务不能当日常发贡献');
    eq(p.onSectDailyQuestCompleted('__unknown_daily', now), 0, '未知来源不能发贡献');
    p.advanceClass(CLASS_LIST.find(cls => cls.sect === 'tianjian')!.id);
    for (const q of rows.filter(row => row.sect !== p.sect)) {
      eq(qs.available(q.id), false, `${q.id} 外宗不可接`);
      p.quests[q.id] = { state: 'done', kills: {} };
      eq(p.onSectDailyQuestCompleted(q.id, now), 0, `${q.id} 外宗已done回调仍不发贡献`);
    }
  }

  // 单条每日只发一次，贡献余额、完成额度与领取去重一起落盘。
  {
    const p = joined(), qs = new QuestSystem(p, () => now), q = own[1];
    const initial = { exp: p.exp, stones: p.stones, contribution: p.sectContribution };
    eq(p.onSectDailyQuestCompleted(q.id, now), 0, '尚未交付不能先领贡献');
    const reward = complete(qs, p, q);
    eq(p.sectContribution - initial.contribution, dailyContribution(q), '交付贡献按任务覆盖值');
    ok(p.exp > initial.exp, '普通修为奖励照常发放');
    eq(p.stones - initial.stones, q.rewards.spiritStone, '灵石奖励照常发放');
    eq(reward.daily.contribution, dailyContribution(q), '返回实际贡献供展示');
    eq(p.count(q.objectives[0].target!), 0, '交付消费收集材料');
    const after = { exp: p.exp, stones: p.stones, contribution: p.sectContribution };
    eq(qs.accept(q.id), false, '同日已完成不可重复接取');
    eq(qs.turnIn(q.id), undefined, '同日重复交付无奖励');
    eq(p.onSectDailyQuestCompleted(q.id, now), 0, '旧贡献回调与交付共享去重');
    same({ exp: p.exp, stones: p.stones, contribution: p.sectContribution }, after, '重复领取保持全部奖励余额');
    same(p.dailyQuestCompletions.tianjian, [q.id], '完成记录按宗门保存');
    const loaded = Progress.load(), restored = new QuestSystem(loaded, () => now);
    eq(restored.available(q.id), false, '同日读档保留已完成禁领');
    eq(loaded.onSectDailyQuestCompleted(q.id, now), 0, '同日读档保留回调去重');
    eq(loaded.dailyQuestResetDay, dailyQuestDay(now), '保存上次日常重置日期');
  }

  // 恰跨 05:00 清已完成和全部进行中进度，不动材料及普通任务。
  {
    now = beforeFive;
    const p = joined(), qs = new QuestSystem(p, () => now);
    const done = own[2], kill = own[0], collect = own[1];
    complete(qs, p, done);
    ok(qs.accept(kill.id), '过期击杀日常接取'); qs.onKill(kill.objectives[0].target!);
    ok(qs.accept(collect.id), '过期收集日常接取'); p.addItem(collect.objectives[0].target!, 2);
    p.quests[kill.id].talked = { smith_ou: true }; p.quests[kill.id].crafted = { hp_pill_small: 2 }; p.quests[kill.id].reached = true;
    p.quests.q_fox = { state: 'done', kills: { demon_fox: 1 } };
    p.quests.q_bamboo = { state: 'active', kills: { wild_boar_spirit: 2 } };
    const ordinary = JSON.stringify([p.quests.q_fox, p.quests.q_bamboo]);
    const balance = p.sectContribution;
    eq(qs.refreshDaily(), false, '同日刷新不重置');
    now = atFive;
    eq(qs.refreshDaily(), true, '跨 05:00 在线刷新触发重置');
    for (const q of own) eq(qs.state(q.id), undefined, `${q.id} 跨日清除完成或进行中状态`);
    same(p.dailyQuestCompletions, {}, '跨日每宗完成额度清空');
    same(p.sectDailyContributionClaims, [], '跨日领取去重清空');
    eq(p.count(collect.objectives[0].target!), 2, '跨日保留已收集背包材料');
    eq(JSON.stringify([p.quests.q_fox, p.quests.q_bamboo]), ordinary, '跨日保留普通任务状态与进度');
    eq(p.sectContribution, balance, '跨日保留宗门贡献余额');
    eq(qs.accept(kill.id), true, '跨日已过期任务可重新接取');
    same(p.quests[kill.id], { state: 'active', kills: {}, crafted: {} }, '重新接取清全部旧任务进度');
    eq(qs.refreshDaily(), false, '同一天重复刷新不清刚接任务');
    eq(qs.isActive(kill.id), true, '同日新接任务继续有效');
    eq(qs.available(done.id), true, '跨日已完成任务重新开放');
  }

  // 玩家打开交付对白后跨日，缓存的 after 必须重新验证日界与 active 状态。
  {
    now = beforeFive;
    const p = joined(), qs = new QuestSystem(p, () => now), q = own[1];
    ok(qs.accept(q.id), '缓存交付回调夹具接取'); objectives(qs, p, q);
    const after = qs.talk(q.turnIn, q.id).after;
    ok(after, '05:00 前可取得真实交付回调');
    const balance = { contribution: p.sectContribution, exp: p.exp, stones: p.stones };
    const material = p.count(q.objectives[0].target!);
    now = atFive;
    eq(after(), undefined, '过期对白 after 不交付前一天日常');
    same({ contribution: p.sectContribution, exp: p.exp, stones: p.stones }, balance, '过期交付不发任何奖励');
    eq(p.count(q.objectives[0].target!), material, '过期交付不扣背包材料');
    eq(p.quests[q.id], undefined, '过期交付清旧任务状态');
    eq(qs.available(q.id), true, '缓存交付跨日后可重新接取');
  }

  // 离线读档补算多个日界，并立即保存新的重置日期。
  {
    now = atFive;
    const p = joined(), qs = new QuestSystem(p, () => now);
    complete(qs, p, own[2]); p.save();
    const balance = p.sectContribution;
    now = new Date(2026, 9, 15, 4, 59).getTime();
    const loaded = Progress.load();
    eq(loaded.dailyQuestResetDay, dailyQuestDay(now), '离线数日读档使用当前日常日');
    eq(loaded.quests[own[2].id], undefined, '离线过日清已完成日常');
    eq(loaded.sectContribution, balance, '离线补算不增加或扣除贡献');
    same(loaded.dailyQuestCompletions, {}, '离线补算不累计过去配额');
    eq(new QuestSystem(loaded, () => now).accept(own[2].id), true, '离线补算后可以再接');
    eq(JSON.parse(disk[saveKey]).dailyQuestResetDay, dailyQuestDay(now), '补算重置日期保存到档');

    const old = JSON.parse(disk[saveKey]);
    delete old.dailyQuestResetDay; delete old.dailyQuestCompletions;
    old.sectDailyContributionDay = ''; old.sectDailyContributionClaims = [];
    old.quests[own[2].id] = { state: 'done', kills: {} };
    old.quests.q_fox = { state: 'done', kills: { demon_fox: 1 } };
    disk[saveKey] = JSON.stringify(old);
    const migrated = Progress.load();
    eq(migrated.dailyQuestResetDay, dailyQuestDay(now), '无日期旧档迁移到当前日常日');
    eq(migrated.quests.q_fox.state, 'done', '无日期旧档迁移保留普通任务');
    eq(migrated.sectContribution, balance, '无日期旧档迁移保留贡献');
  }

  // 遍历 activeIds 时日界可能发生变化：事件必须只读取一次日常日，不能持有已删状态。
  for (const event of ['kill', 'talk', 'craft'] as const) {
    now = beforeFive;
    const p = joined();
    let race = false, reads = 0;
    const lastBefore = QUEST_ORDER.indexOf(own[0].id) + 1;
    const qs = new QuestSystem(p, () => race ? (++reads <= lastBefore ? beforeFive : atFive) : beforeFive);
    ok(qs.accept(own[0].id), `${event} 日界并发夹具接取`);
    // 只在内存给同一日常添加目标，三种事件都遍历这条状态。
    const original = own[0].objectives;
    try {
      own[0].objectives = [...original, { type: 'talk', target: 'smith_ou' }, { type: 'craft', target: 'hp_pill_small', count: 1 }];
      race = true;
      if (event === 'kill') qs.onKill(original[0].target!);
      else if (event === 'talk') qs.onTalk('smith_ou');
      else qs.onCraft('hp_pill_small', 1);
      eq(reads, 1, `${event} 事件读取单次日界，遍历中不重复重置`);
      reads = lastBefore;
      eq(qs.refreshDaily(), true, `${event} 后续跨 05:00 检查重置`);
      eq(p.quests[own[0].id], undefined, `${event} 过期事件进度不残留到新一天`);
      eq(JSON.parse(disk[saveKey]).quests[own[0].id], undefined, `${event} 过期进度没有写入新日档`);
    } finally { own[0].objectives = original; }
  }

  // 固定三条额度仍需守住程序契约，内存注入第四条验证每日上限。
  {
    now = atFive;
    const p = joined(), qs = new QuestSystem(p, () => now);
    for (const q of own) complete(qs, p, q);
    eq(p.dailyQuestCompletions.tianjian.length, 3, '本宗每日完整三条额度');
    const id = 'q_daily_tianjian_test_fourth';
    const fixture: QuestDef = { ...own[2], id };
    const npc = NPCS[fixture.giver], original = npc.quests;
    try {
      QUESTS[id] = fixture; QUEST_ORDER.push(id); npc.quests = [...original, id];
      eq(qs.available(id), false, '本宗每日三条后拒绝第四条');
      eq(qs.accept(id), false, '不能用直接接取绕过宗门额度');
      eq(qs.npcDailyQuestIds(fixture.giver).includes(id), true, '达到额度菜单仍可展示任务供灰显');
      p.quests[id] = { state: 'done', kills: {} };
      eq(p.onSectDailyQuestCompleted(id, now), 0, '旧回调不能绕过三条额度');
    } finally {
      delete QUESTS[id]; QUEST_ORDER.splice(QUEST_ORDER.indexOf(id), 1); npc.quests = original;
    }
  }

  // 字段存在性决定回退：0 有效；null、负值、小数、非数字停用任务。
  {
    const q = own[2], original = q.rewards;
    try {
      q.rewards = { ...original, sectContribution: 0 };
      eq(dailyContribution(q), 0, '显式 0 不回退');
      const p = joined(), qs = new QuestSystem(p, () => now);
      const reward = complete(qs, p, q);
      eq(p.sectContribution, 0, '显式 0 日常不发贡献但正常完成');
      eq(reward.daily.contribution, 0, '显式 0 返回真实零贡献');
      q.rewards = { ...original }; delete q.rewards.sectContribution;
      eq(dailyContribution(q), SECT_SECLUSION.dailyQuestContribution, '缺字段才读取 dailyQuestContribution');
      const fallback = joined(); complete(new QuestSystem(fallback, () => now), fallback, q);
      eq(fallback.sectContribution, SECT_SECLUSION.dailyQuestContribution, '缺字段实际交付按回退发贡献');
      for (const value of [null, -1, 1.5, '40', NaN, Infinity]) {
        q.rewards = { ...original, sectContribution: value } as unknown as QuestDef['rewards'];
        eq(dailyContribution(q), undefined, `非法贡献 ${String(value)} 不回退`);
        const invalid = joined(), system = new QuestSystem(invalid, () => now);
        eq(system.available(q.id), false, '非法贡献任务不开放');
        invalid.quests[q.id] = { state: 'done', kills: {} };
        eq(invalid.onSectDailyQuestCompleted(q.id, now), 0, '非法贡献不能借旧回调发奖励');
      }
      for (const field of ['exp', 'spiritStone'] as const) {
        q.rewards = { ...original, [field]: null } as unknown as QuestDef['rewards'];
        const invalid = joined(), system = new QuestSystem(invalid, () => now);
        eq(system.available(q.id), false, `${field} 为 null 的日常停用`);
        eq(system.accept(q.id), false, `${field} 为 null 不能直接领取`);
      }
    } finally { q.rewards = original; }
  }

  // 闭关继续按午夜日界，花贡献与游戏年龄增加不能刷新宗门日常。
  {
    now = new Date(2026, 9, 10, 23, 59).getTime();
    const p = joined(), qs = new QuestSystem(p, () => now);
    complete(qs, p, own[2]);
    const completionDay = p.dailyQuestResetDay;
    p.level = REALMS.find(realm => realm.id === SECT_SECLUSION.unlockRealm)!.levelMin;
    p.sectContribution = 1000; p.ageUpdatedAt = now;
    const seclusion = new Seclusion(p), years = Math.min(...SECT_SECLUSION.options);
    const cost = SECT_SECLUSION.contributionCost[String(years)];
    ok(seclusion.settle({ mode: 'sect' }, years, now).ok, '日常所得贡献接既有闭关接口');
    eq(p.sectContribution, 1000 - cost, '闭关照既有贡献费用扣除');
    eq(p.dailyQuestResetDay, completionDay, '游戏内闭关年数不改日常日');
    eq(qs.available(own[2].id), false, '闭关后同一日常仍不能重领');
    now = new Date(2026, 9, 11, 0).getTime();
    eq(qs.refreshDaily(), false, '午夜不重置日常');
    ok(p.seclusionDay !== realDay(now), '闭关每日额度仍在午夜换日');
    eq(p.dailyQuestResetDay, completionDay, '午夜日常日期保留');
    now = nextFive;
    eq(qs.available(own[2].id), true, '05:00 API 入口自动补算后再接日常');
  }

  console.log(`宗门日常逻辑断言通过：${assertions} 条；15 条任务、本地 05:00 日界、领取去重、离线补算、贡献回退、闭关接口。`);
} finally { Date.now = originalNow; }
