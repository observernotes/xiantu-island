import rawQuests from '@xt/balance/quests.json';
import rawNpcs from '@xt/balance/npcs.json';
import strings from '@xt/balance/strings_zh.json';
import { NPCS, QUESTS, SCRIPTS, questName, questDescription, t, type NpcDef, type QuestDef } from './data';
import { featureFlags } from './features';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { GameScene } from './scenes/GameScene';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  }
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}

const ids = ['q_main_01', 'q_main_02', 'q_main_03', 'q_main_04'] as const;
type MainlineId = typeof ids[number];
// #21 接线前的奖励基线；只断言，不回填或修改任何配置。
const originalRewards: Record<MainlineId, QuestDef['rewards']> = {
  q_main_01: { exp: 60, spiritStone: 120, items: [] },
  q_main_02: { exp: 150, spiritStone: 180, items: [] },
  q_main_03: { exp: 1800, spiritStone: 600, items: [{ item: 'foundation_shard', count: 1 }] },
  q_main_04: { exp: 5500, spiritStone: 1200, items: [{ item: 'clear_mind_pill', count: 1 }] },
};
const targets: Record<MainlineId, QuestDef['objectives']> = {
  q_main_01: [{ type: 'talk', target: 'luoxia_mayor' }, { type: 'talk', target: 'alchemist_ge' }],
  q_main_02: [{ type: 'collect', target: 'pillar_shard_1', count: 1, consume: true }, { type: 'talk', target: 'sect_master_ling' }],
  q_main_03: [{ type: 'kill', target: 'black_robe_minion', count: 15 }],
  q_main_04: [{ type: 'kill', target: 'vine_imp', count: 20 }, { type: 'talk', target: 'tree_spirit' }],
};
const turnIns = ['luoxia_mayor', 'sect_master_ling', 'luoxia_mayor', 'tree_spirit'];
const stringTable: Record<string, unknown> = strings;
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const flagsBefore = featureFlags();
const now = Date.now();
const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';

function fixture(id: MainlineId) {
  const p = new Progress(); p.level = QUESTS[id].reqLevel;
  p.quests.q_fox = { state: 'done', kills: {} };
  for (const previous of ids.slice(0, ids.indexOf(id))) p.quests[previous] = { state: 'done', kills: {} };
  return { p, qs: new QuestSystem(p, () => now), q: QUESTS[id] };
}
type Fixture = ReturnType<typeof fixture>;
function dialogue(f: Fixture, stage: 'offer' | 'progress' | 'complete', result: ReturnType<QuestSystem['talk']>) {
  const npcId = stage === 'offer' ? f.q.giver : f.q.turnIn;
  const key = f.q.dialogueKeys?.[stage];
  ok(key, `${f.q.id} ${stage} 配置 key`);
  eq(result.lines, [{ speaker: NPCS[npcId].name, text: t(key, { name: f.p.name }) }], `${f.q.id} ${stage} 使用表内对白和正确 NPC`);
}
function accept(f: Fixture) {
  eq(f.qs.mark(f.q.giver), '!', `${f.q.id} 发布 NPC 可接标记`);
  const offer = f.qs.talk(f.q.giver);
  dialogue(f, 'offer', offer);
  ok(offer.after, `${f.q.id} 接取回调存在`);
  eq(f.qs.state(f.q.id), undefined, `${f.q.id} 对白结束前未接取`);
  offer.after();
  eq(f.qs.state(f.q.id), 'active', `${f.q.id} 对白结束后才接取`);
  eq(f.qs.mark(f.q.turnIn), '…', `${f.q.id} 交付 NPC 进行中标记`);
}
function progress(f: Fixture) {
  const result = f.qs.talk(f.q.turnIn);
  dialogue(f, 'progress', result);
  eq(result.after, undefined, `${f.q.id} 进行中无交付回调`);
  eq(f.qs.complete(f.q.id), false, `${f.q.id} 缺目标不能完成`);
  eq(f.qs.turnIn(f.q.id), undefined, `${f.q.id} 缺目标不能直接交付`);
  eq(f.qs.mark(f.q.turnIn), '…', `${f.q.id} 缺目标保留进行中标记`);
}
function finish(f: Fixture, result = f.qs.talk(f.q.turnIn)) {
  dialogue(f, 'complete', result);
  ok(result.after, `${f.q.id} 交付回调存在`);
  eq(f.qs.mark(f.q.turnIn), '?', `${f.q.id} 交付 NPC 可交付标记`);
  eq(f.qs.state(f.q.id), 'active', `${f.q.id} 目标达成后仍待交付`);
  const before = { stones: f.p.stones, items: f.q.rewards.items.map(item => f.p.count(item.item)) };
  const reward = result.after();
  ok(reward?.settled, `${f.q.id} 通过 NPC 完成奖励事务`);
  eq(f.qs.state(f.q.id), 'done', `${f.q.id} 交付后完成`);
  eq(reward.quest.rewards, originalRewards[f.q.id as MainlineId], `${f.q.id} 结算使用原奖励表`);
  eq(f.p.stones - before.stones, f.q.rewards.spiritStone, `${f.q.id} 灵石实发原值`);
  eq(reward.settled.items, f.q.rewards.items, `${f.q.id} 物品收据与原表一致`);
  f.q.rewards.items.forEach((item, index) => eq(f.p.count(item.item) - before.items[index], item.count, `${f.q.id} ${item.item} 实发原数量`));
  eq(JSON.parse(saved[saveKey]), f.p.exportSave(), `${f.q.id} 完成与奖励一起持久化`);
  const settled = f.p.exportSave();
  eq(result.after(), undefined, `${f.q.id} 同一回调不可重复领奖`);
  eq(f.qs.turnIn(f.q.id), undefined, `${f.q.id} 不可重复交付`);
  eq(f.p.exportSave(), settled, `${f.q.id} 重复交付不改存档或奖励`);
  ok(f.qs.mark(f.q.turnIn) !== '?', `${f.q.id} 交付后去掉可交付标记`);
}

try {
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = String(value); },
    removeItem: (key: string) => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: (index: number) => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  } });

  for (const [index, id] of ids.entries()) {
    const raw = (rawQuests as QuestDef[]).find(q => q.id === id), q = QUESTS[id];
    ok(raw && q, `${id} 原表与当前阶段均可读`);
    eq(q.nameKey, `quest.main_0${index + 1}.name`, `${id} 名称 key`);
    eq(q.descriptionKey, `quest.main_0${index + 1}.description`, `${id} 描述 key`);
    eq(q.dialogueKeys, {
      offer: `quest.main_0${index + 1}.offer`, progress: `quest.main_0${index + 1}.progress`, complete: `quest.main_0${index + 1}.complete`,
    }, `${id} 三态对白 key`);
    for (const key of [q.nameKey!, q.descriptionKey!, ...Object.values(q.dialogueKeys!)]) {
      const value = stringTable[key];
      ok(typeof value === 'string' && value.trim(), `${id} ${key} 文案非空`);
      eq(t(key), value, `${id} ${key} t() 读表`);
    }
    eq(questName({ ...q, name: '不得使用此旧名' }), stringTable[q.nameKey!], `${id} questName 优先读表`);
    eq(questDescription(q), stringTable[q.descriptionKey!], `${id} questDescription 读表`);
    eq(questName({ ...q, nameKey: undefined }), q.name, `${id} 保留旧任务名兜底`);
    eq(questDescription({ ...q, descriptionKey: undefined }), '', `${id} 无描述不额外造文案`);
    eq(SCRIPTS[id], undefined, `${id} 不依赖 design/02 以外的脚本解析`);
    eq(raw.rewards, originalRewards[id], `${id} 原表奖励保持改前值`);
    eq(q.rewards, originalRewards[id], `${id} 运行时奖励保持改前值`);
    eq(q.objectives, targets[id], `${id} 目标保持原口径`);
    eq(q.giver, 'luoxia_mayor', `${id} 柳知县发布`);
    eq(q.turnIn, turnIns[index], `${id} 交付 NPC`);
    eq(q.prereq, index ? ids[index - 1] : 'q_fox', `${id} 原前置链`);
    eq(q.next, ids[index + 1] ?? 'q_main_06', `${id} 原后续链`);
    eq(q.reqLevel, [10, 10, 12, 20][index], `${id} 原等级门槛`);
    eq(q.phase, 5, `${id} 原阶段门槛`);
    const f = fixture(id);
    for (const npcId of new Set([q.giver, q.turnIn])) {
      ok((rawNpcs as NpcDef[]).find(npc => npc.id === npcId)?.quests.includes(id), `${id} 原 NPC 表 ${npcId} 已挂入口`);
      ok(NPCS[npcId].quests.includes(id), `${id} 运行时 NPC ${npcId} 已挂入口`);
      ok(f.qs.npcQuestIds(npcId).includes(id), `${id} npcQuestIds 消费 ${npcId} 原表`);
    }
    delete f.p.quests[q.prereq!];
    eq(f.qs.available(id), false, `${id} 未交前置不可接`);
    f.p.quests[q.prereq!] = { state: 'done', kills: {} };
    f.p.level = q.reqLevel - 1;
    eq(f.qs.available(id), false, `${id} 等级未到不可接`);
    eq(f.qs.levelLocked(id), true, `${id} 保留等级锁提示`);
  }

  // 01：接取当次与接取前的交谈都不追记；两个 talk 缺一不可。
  {
    const f = fixture('q_main_01');
    f.qs.talk('alchemist_ge');
    accept(f);
    eq(f.p.quests[f.q.id].talked ?? {}, {}, '01 接取对白不记柳知县，也不追记葛丹师');
    progress(f);
    eq(f.p.quests[f.q.id].talked, { luoxia_mayor: true }, '01 接取后再谈才记录柳知县');
    const ge = f.qs.talk('alchemist_ge');
    eq(ge.lines, NPCS.alchemist_ge.dialog.map(text => ({ speaker: NPCS.alchemist_ge.name, text })), '01 葛丹师沿用闲聊');
    eq(f.qs.objectiveProgress(f.q).map(p => p.cur), [1, 1], '01 两个 talk 分别完成');
    finish(f);
    eq(f.qs.available('q_main_02'), true, '01 交付后开放 02');
  }

  // 02：持有残片不能替代 talk；offer / complete 对白结束前都不预扣。
  {
    const f = fixture('q_main_02'); f.p.addItem('pillar_shard_1', 2);
    f.qs.talk('sect_master_ling');
    accept(f);
    eq(f.p.count('pillar_shard_1'), 2, '02 携残片接取不预扣');
    eq(f.qs.complete(f.q.id), false, '02 有残片但未在接取后 talk 不可交');
    eq(f.qs.turnIn(f.q.id), undefined, '02 未完成 talk 不能直接扣料交付');
    const result = f.qs.talk('sect_master_ling');
    eq(f.qs.objectiveProgress(f.q).map(p => p.cur), [1, 1], '02 凌宗主交谈后双目标达成');
    eq(f.p.count('pillar_shard_1'), 2, '02 与凌宗主交谈不预扣');
    finish(f, result);
    eq(f.p.count('pillar_shard_1'), 1, '02 成功交付只扣 1 个残片');
  }
  {
    const f = fixture('q_main_02');
    accept(f); progress(f);
    eq(f.p.quests[f.q.id].talked?.sect_master_ling, true, '02 没有残片也可先完成交谈');
    eq(f.p.count('pillar_shard_1'), 0, '02 缺残片不产生负库存');
    f.p.addItem('pillar_shard_1', 1);
    const pending = f.qs.talk('sect_master_ling');
    dialogue(f, 'complete', pending);
    f.p.removeItem('pillar_shard_1', 1);
    eq(pending.after?.(), undefined, '02 交付回调重新检查残片持有量');
    eq(f.qs.state(f.q.id), 'active', '02 材料失效仍保持进行中');
    f.p.addItem('pillar_shard_1', 1);
    finish(f);
    eq(f.p.count('pillar_shard_1'), 0, '02 补齐残片后交付扣 1');
  }

  // 03：只累计接取后的对应击杀，15 次后回柳知县交付。
  {
    const f = fixture('q_main_03');
    f.qs.onKill('black_robe_minion');
    accept(f); progress(f);
    f.qs.onKill('vine_imp');
    eq(f.qs.objectiveProgress(f.q)[0].cur, 0, '03 接取前击杀与其他怪物不计数');
    for (let i = 0; i < 14; i++) f.qs.onKill('black_robe_minion');
    eq(f.qs.complete(f.q.id), false, '03 击杀 14 名仍不足');
    f.qs.onKill('black_robe_minion');
    eq(f.qs.complete(f.q.id), true, '03 击杀 15 名可交付');
    finish(f);
    eq(f.qs.available('q_main_04'), false, '03 交付不绕过 04 的 20 级门槛');
    f.p.level = 20;
    eq(f.qs.available('q_main_04'), true, '03 交付且到 20 级后开放 04');
  }

  // 04：两种目标顺序都允许，达成目标仍须在古树灵处完成交付。
  for (const talkFirst of [true, false]) {
    const f = fixture('q_main_04');
    f.qs.onKill('vine_imp'); f.qs.talk('tree_spirit');
    accept(f);
    eq(f.qs.objectiveProgress(f.q).map(p => p.cur), [0, 0], '04 接取前的击杀和交谈均不计');
    if (talkFirst) progress(f);
    for (let i = 0; i < 19; i++) f.qs.onKill('vine_imp');
    eq(f.qs.complete(f.q.id), false, '04 击杀 19 只仍不足');
    f.qs.onKill('vine_imp');
    eq(f.qs.complete(f.q.id), talkFirst, '04 20 击杀与 talk 缺一不可，无强制先后锁');
    if (!talkFirst) {
      eq(f.qs.mark('tree_spirit'), '…', '04 只有击杀仍为进行中');
      eq(f.qs.turnIn(f.q.id), undefined, '04 只有击杀不能直接交付');
    }
    finish(f);
    eq(f.p.quests[f.q.id].talked?.tree_spirit, true, '04 古树灵 talk 已完成');
  }

  // 调用真实 tracker 绘制方法，只替换渲染对象，保留 daily progress 的既有格式。
  {
    const f = fixture('q_main_04'); accept(f);
    const daily = Object.values(QUESTS).find(q => q.daily && q.objectives[0]?.type === 'kill');
    if (flagsBefore.sectDaily) {
      ok(daily, '日常击杀任务存在');
      f.p.quests[daily.id] = { state: 'active', kills: {} };
    }
    const text = () => ({
      value: '', visible: false, padding: { left: 6 },
      setText(value: string) { this.value = value; return this; },
      setVisible(value: boolean) { this.visible = value; return this; },
    });
    const tracker = text();
    const scene = Object.assign(Object.create(GameScene.prototype), {
      prog: f.p, quests: f.qs, sectGrowth: { identity: () => null },
      invText: { visible: false }, sectTitle: text(), sectBadge: text(),
      skillBar: { draw() {} }, combat: { cds: {} }, npcMarks: [], tracker, debugText: { visible: false },
    });
    (GameScene.prototype as unknown as { drawHudTail(): void }).drawHudTail.call(scene);
    const lines = tracker.value.split('\n');
    ok(tracker.visible, '有活动任务时 tracker 可见');
    ok(lines.includes(`  ${questDescription(f.q)}`), 'tracker 展示主线描述');
    for (const objective of f.qs.objectiveProgress(f.q)) {
      ok(lines.includes(`  ${objective.label} ${objective.cur}/${objective.need}`), '主线目标仍保持原进度格式');
    }
    if (flagsBefore.sectDaily && daily) {
      ok(lines.includes(`  ${questDescription(daily)}`), 'tracker 继续展示日常描述');
      for (const objective of f.qs.objectiveProgress(daily)) {
        const target = objective.label.replace(/^击杀 /, '');
        ok(lines.includes(`  ${t('quest.progress', { target, cur: objective.cur, max: objective.need })}`), '日常目标保持 quest.progress 文案格式');
      }
    }
  }
  eq(featureFlags(), flagsBefore, '#21 测试保持全部正式开关原样');
  console.log(JSON.stringify({ suite: 'mainline-21', passed: true, assertions, quests: ids }));
} finally {
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
