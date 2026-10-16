import rawQuests from '@xt/balance/quests.json';
import rawNpcs from '@xt/balance/npcs.json';
import strings from '@xt/balance/strings_zh.json';
import releaseFeatures from '../data/features.json';
import { BREAKTHROUGH, NPCS, QUESTS, REALMS, SCRIPTS, TILED_MAPS, TRIALS, questName, questDescription, t, type NpcDef, type QuestDef } from './data';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { gameNow } from './GameClock';
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

const ids = ['q_elder_exam', 'q_main_06'] as const;
type ChapterId = typeof ids[number];
// design/18 的原值基线；考核与深林均不得借展示接线改变目标和奖励。
const originalRewards: Record<ChapterId, QuestDef['rewards'] & { unlockTrial?: string }> = {
  q_elder_exam: { exp: 0, spiritStone: 0, items: [], unlockTrial: 'trial_foundation_altar' },
  q_main_06: { exp: 10000, spiritStone: 2400, items: [{ item: 'pillar_shard_2', count: 1 }] },
};
const objectives: Record<ChapterId, QuestDef['objectives']> = {
  q_elder_exam: [{ type: 'collect', target: 'foundation_pill', count: 1, consume: false }, { type: 'talk', target: 'tianjian_elder' }],
  q_main_06: [{ type: 'kill', target: 'millennium_tree_demon', count: 1 }],
};
const expectedStrings = {
  'quest.elder_exam.name': '长老考核',
  'quest.elder_exam.description': '持有一枚筑基丹，与传功长老交谈并交付考核，开启筑基台。',
  'quest.elder_exam.offer': '备好一枚筑基丹，再来见我。苏师姐会为你护法。',
  'quest.elder_exam.progress': '筑基丹可备好了？带在身上，再与我说说入台之事。',
  'quest.elder_exam.complete': '考核已过，筑基台已开。入台守住阵眼，提防黑袍人偷袭。',
  'quest.main_06.name': '深林',
  'quest.main_06.description': '前往万妖林深处，击败一只千年树妖，再向雷猎户复命。',
  'quest.main_06.offer': '林子深处的千年树妖中了黑袍人的魔种，劳你去除掉它。',
  'quest.main_06.progress': '深处那千年树妖还在作乱，劳你再走一趟。',
  'quest.main_06.complete': '千年树妖已除，辛苦了。第二块天柱残片可要收好。',
};
const stringTable: Record<string, unknown> = strings;
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
const now = Date.now();

function fixture(id: ChapterId) {
  const p = new Progress(); p.level = QUESTS[id].reqLevel;
  if (id === 'q_elder_exam') p.exp = p.expNeed;
  else p.quests.q_main_04 = { state: 'done', kills: {} };
  return { p, qs: new QuestSystem(p, () => now), q: QUESTS[id] };
}
type Fixture = ReturnType<typeof fixture>;
function dialogue(f: Fixture, stage: 'offer' | 'progress' | 'complete', result: ReturnType<QuestSystem['talk']>) {
  const key = f.q.dialogueKeys?.[stage];
  ok(key, `${f.q.id} ${stage} 配置 key`);
  const npcId = stage === 'offer' ? f.q.giver : f.q.turnIn;
  eq(result.lines, [{ speaker: NPCS[npcId].name, text: t(key, { name: f.p.name }) }], `${f.q.id} ${stage} 由登记 NPC 读取对白 key`);
}
function accept(f: Fixture) {
  eq(f.qs.mark(f.q.giver), '!', `${f.q.id} 发布 NPC 可接标记`);
  const result = f.qs.talk(f.q.giver);
  dialogue(f, 'offer', result);
  ok(result.after, `${f.q.id} 有接取回调`);
  eq(f.qs.state(f.q.id), undefined, `${f.q.id} 接取对白结束前尚未接取`);
  result.after();
  eq(f.qs.state(f.q.id), 'active', `${f.q.id} 接取对白结束后生效`);
  eq(f.qs.mark(f.q.turnIn), '…', `${f.q.id} 进行中标记`);
}
function progress(f: Fixture) {
  const result = f.qs.talk(f.q.turnIn);
  dialogue(f, 'progress', result);
  eq(result.after, undefined, `${f.q.id} 进行中对白不提供交付回调`);
  eq(f.qs.complete(f.q.id), false, `${f.q.id} 缺目标不可完成`);
  eq(f.qs.turnIn(f.q.id), undefined, `${f.q.id} 缺目标不可直接交付`);
}
function finish(f: Fixture, result = f.qs.talk(f.q.turnIn)) {
  dialogue(f, 'complete', result);
  ok(result.after, `${f.q.id} 有交付回调`);
  eq(f.qs.mark(f.q.turnIn), '?', `${f.q.id} 可交付标记`);
  eq(f.qs.state(f.q.id), 'active', `${f.q.id} 目标完成仍须交付`);
  const before = { stones: f.p.stones, shard: f.p.count('pillar_shard_2'), level: f.p.level, exp: f.p.exp, pill: f.p.count('foundation_pill') };
  const reward = result.after();
  ok(reward?.settled, `${f.q.id} 使用真实奖励事务`);
  eq(f.qs.state(f.q.id), 'done', `${f.q.id} 成功交付后完成`);
  eq(reward.quest.rewards, originalRewards[f.q.id as ChapterId], `${f.q.id} 交付沿用原奖励`);
  eq(reward.settled.exp.gained, f.q.rewards.exp, `${f.q.id} 修为实发原值`);
  eq(f.p.stones - before.stones, f.q.rewards.spiritStone, `${f.q.id} 灵石实发原值`);
  eq(reward.settled.items, f.q.rewards.items, `${f.q.id} 物品收据为原表`);
  eq(f.p.count('pillar_shard_2') - before.shard, f.q.id === 'q_main_06' ? 1 : 0, `${f.q.id} 只由交付奖励发第二残片`);
  eq(reward.broke, false, `${f.q.id} 交付不提前突破`);
  if (f.q.id === 'q_elder_exam') {
    eq([f.p.level, f.p.exp, f.p.count('foundation_pill')], [before.level, before.exp, before.pill], '考核 consume:false，交付不扣丹不改瓶颈');
    eq(f.p.completedTrials.includes('trial_foundation_altar'), false, '考核交付不冒充筑基台已通关');
  }
  eq(JSON.parse(saved[saveKey]), f.p.exportSave(), `${f.q.id} 完成状态和奖励一同存档`);
  const settled = f.p.exportSave();
  eq(result.after(), undefined, `${f.q.id} 重复执行同一回调不再领奖`);
  eq(f.qs.turnIn(f.q.id), undefined, `${f.q.id} 不可重复交付`);
  eq(f.p.exportSave(), settled, `${f.q.id} 重复交付不改变存档或奖励`);
}

// 仅替换渲染、计时器与切场景对象；offerTrial / enterTrial / onTrialEnd 仍调用真实 GameScene 方法。
function trialScene(f: Fixture) {
  const values = new Map<string, unknown>();
  const logs: string[] = [], banners: string[] = [], timers: { ms: number; run: () => void }[] = [], restarts: unknown[] = [];
  const dialogs: { lines: { speaker: string | null; text: string }[]; after?: () => void }[] = [];
  const visual = { setOrigin() { return this; }, setScrollFactor() { return this; }, setDepth() { return this; }, destroy() {} };
  const scene = Object.assign(Object.create(GameScene.prototype), {
    prog: f.p, quests: f.qs, map: { id: 'tianjian_sect' }, player: { x: 200, y: 300, body: { setVelocityX() {} } },
    registry: { get: (key: string) => values.get(key), set: (key: string, value: unknown) => values.set(key, value), remove: (key: string) => values.delete(key) },
    log: (message: string) => logs.push(message),
    dialog: { show: (lines: typeof dialogs[number]['lines'], _sprite: unknown, after?: () => void) => dialogs.push({ lines, after }) },
    time: { delayedCall: (ms: number, run: () => void) => timers.push({ ms, run }) },
    cameras: { main: { fadeOut() {}, fadeIn() {}, shake() {} } },
    scene: { restart: (args: unknown) => restarts.push(args) },
    add: { text: (_x: number, _y: number, text: string) => { banners.push(text); return visual; }, rectangle: () => visual },
    tweens: { add() {} }, playBreakthroughFail() {},
  });
  return { scene, values, logs, banners, timers, restarts, dialogs };
}

try {
  eq(releaseFeatures.indexedDbSaves, true, '正式 data/features.json indexedDbSaves 严格布尔 true');
  eq(featureEnabled('indexedDbSaves'), true, 'indexedDbSaves 发布配置默认开启');
  // 关态夹具保留本套件的同步事务与 localStorage 断言。
  setFeatureFlag('indexedDbSaves', false);
  const flagsBefore = featureFlags();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, writable: true, value: {
    getItem: (key: string) => saved[key] ?? null,
    setItem: (key: string, value: string) => { saved[key] = String(value); },
    removeItem: (key: string) => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: (index: number) => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  } });

  eq(Object.keys(expectedStrings).length, 10, '两章恰好引用十个定稿展示 key');
  for (const [key, text] of Object.entries(expectedStrings)) {
    eq(stringTable[key], text, `${key} 与 design/18 定稿一致`);
    eq(t(key), text, `${key} 经 t() 读取`);
    if (/\.(offer|progress|complete)$/.test(key)) ok(Array.from(text).length <= 40, `${key} 单段对白不超过40字`);
  }
  for (const id of ids) {
    const raw = (rawQuests as QuestDef[]).find(q => q.id === id), q = QUESTS[id];
    ok(raw && q, `${id} 原表和运行时均可用`);
    const stem = id === 'q_elder_exam' ? 'quest.elder_exam' : 'quest.main_06';
    for (const entry of [raw, q]) {
      eq(entry.nameKey, `${stem}.name`, `${id} 名称 key`);
      eq(entry.descriptionKey, `${stem}.description`, `${id} 描述 key`);
      eq(entry.dialogueKeys, { offer: `${stem}.offer`, progress: `${stem}.progress`, complete: `${stem}.complete` }, `${id} 三态对白 key`);
      eq(entry.rewards, originalRewards[id], `${id} 原奖励全部保留`);
      eq(entry.objectives, objectives[id], `${id} 目标保留，无护法/御剑/炼器目标`);
    }
    eq(questName({ ...q, name: '不得使用此旧名' }), stringTable[q.nameKey!], `${id} questName 优先展示表名`);
    eq(questDescription(q), stringTable[q.descriptionKey!], `${id} questDescription 读取描述`);
    eq(questName({ ...q, nameKey: undefined }), q.name, `${id} 旧登记名仍可兜底`);
    eq(questDescription({ ...q, descriptionKey: undefined }), '', `${id} 没有描述不造新文案`);
    eq(SCRIPTS[id], undefined, `${id} 不依赖 design/02 外脚本解析`);
    eq(q.giver, id === 'q_elder_exam' ? 'tianjian_elder' : 'hunter_lei', `${id} 原发布人`);
    eq(q.turnIn, q.giver, `${id} 原交付人`);
    eq(q.next, null, `${id} 原后续字段`);
    eq(q.reqLevel, id === 'q_elder_exam' ? 29 : 35, `${id} 原接取等级`);
    eq(q.reqRealm, undefined, `${id} 不新增境界前置`);
    eq(q.sect, undefined, `${id} 不新增宗门前置`);
    const f = fixture(id);
    ok((rawNpcs as NpcDef[]).find(n => n.id === q.giver)?.quests.includes(id), `${id} 原 NPC.quests 已挂载`);
    ok(NPCS[q.giver].quests.includes(id), `${id} 运行时 NPC.quests 已挂载`);
    ok(f.qs.npcQuestIds(q.giver).includes(id), `${id} QuestSystem 消费 NPC.quests`);
    f.p.level = q.reqLevel - 1;
    eq(f.qs.available(id), false, `${id} 等级不足不可接取`);
    eq(f.qs.levelLocked(id), true, `${id} 等级锁仍可显示`);
  }
  const elderRaw = (rawQuests as QuestDef[]).find(q => q.id === 'q_elder_exam')!;
  eq(Object.prototype.hasOwnProperty.call(elderRaw, 'prereq'), false, '考核保留缺省 prereq，不插入主线链');
  eq(Object.prototype.hasOwnProperty.call(elderRaw, 'phase'), false, '考核保留缺省 phase');
  eq(Object.prototype.hasOwnProperty.call(elderRaw, 'unlockTrial'), false, 'unlockTrial 仅位于 rewards 内');
  eq(QUESTS.q_main_04.next, 'q_main_06', '主线04仍直接承接06');
  eq(QUESTS.q_main_06.prereq, 'q_main_04', '深林只保留主线04前置');
  eq(QUESTS.q_main_06.phase, 5, '深林仍为原阶段5');
  eq(QUESTS.q_fox.next, null, '妖狐原next保持null');
  eq((rawQuests as QuestDef[]).some(q => q.id === 'q_main_05'), false, '筑基沿用长老考核，无新增主线05');

  // 无丹也可先 talk，持丹也可先达成 collect；接取当次不追记 talk。
  for (const pillFirst of [true, false]) {
    const f = fixture('q_elder_exam');
    f.qs.talk('tianjian_elder');
    if (pillFirst) f.p.addItem('foundation_pill', 2);
    const h = trialScene(f);
    eq(h.scene.trialOfferFor('tianjian_elder'), null, '考核交付前不开筑基台');
    accept(f);
    eq(f.p.quests.q_elder_exam.talked ?? {}, {}, '考核接取前与接取当次交谈均不追记');
    eq(f.qs.complete(f.q.id), false, '考核有丹不能替代接取后的talk');
    if (!pillFirst) {
      progress(f);
      eq(f.p.quests.q_elder_exam.talked?.tianjian_elder, true, '无丹时可先完成talk');
      f.p.addItem('foundation_pill', 2);
    }
    const pending = f.qs.talk('tianjian_elder');
    eq(f.qs.objectiveProgress(f.q).map(p => p.cur), [1, 1], '持丹与talk两项达成，没有先后锁');
    eq(f.p.count('foundation_pill'), 2, '考核接取与交谈不扣丹');
    eq(h.scene.trialOfferFor('tianjian_elder'), null, '目标达成但未交付仍不开台');
    finish(f, pending);
    eq(h.scene.trialOfferFor('tianjian_elder')?.id, 'trial_foundation_altar', '交付unlockTrial可经真实trialOfferFor开启筑基台');
    eq(h.scene.trialOfferFor('hunter_lei'), null, '雷猎户不能代开筑基台');
    f.p.exp--;
    eq(h.scene.trialOfferFor('tianjian_elder'), null, '考核已交仍须修为圆满才入台');
  }
  {
    const f = fixture('q_elder_exam'); accept(f); progress(f);
    f.p.addItem('foundation_pill', 1);
    const pending = f.qs.talk('tianjian_elder'); dialogue(f, 'complete', pending);
    f.p.removeItem('foundation_pill', 1);
    eq(pending.after?.(), undefined, '考核交付回调重新核验持丹');
    eq(f.qs.state(f.q.id), 'active', '考核确认间缺丹仍保持进行中');
    f.p.addItem('foundation_pill', 1); finish(f);
    eq(f.p.count('foundation_pill'), 1, '补齐丹后交付仍不扣丹');
  }

  {
    const f = fixture('q_main_06');
    delete f.p.quests.q_main_04;
    eq(f.qs.available(f.q.id), false, '深林仍检查主线04已交付');
    f.p.quests.q_main_04 = { state: 'done', kills: {} };
    eq(f.qs.available(f.q.id), true, '35级交04即可接06，不要求考核/试炼/御剑/宗门');
    eq(f.p.completedTrials, [], '接深林的角色没有试炼通关记录');
    eq(f.p.skills.sword_ride, undefined, '接深林的角色没有御剑技能');
    f.qs.onKill('millennium_tree_demon');
    accept(f); progress(f);
    f.qs.onKill('vine_imp');
    eq(f.qs.objectiveProgress(f.q)[0].cur, 0, '深林不追记接取前击杀，不计其他怪物');
    f.qs.onKill('millennium_tree_demon');
    eq(f.qs.objectiveProgress(f.q)[0].cur, 1, '接取后击杀一只千年树妖即达成');
    eq(f.qs.state(f.q.id), 'active', '深林杀首领后仍待雷猎户交付');
    eq(f.p.count('pillar_shard_2'), 0, '击杀与对白不提前给第二残片');
    eq(JSON.parse(saved[saveKey]).quests.q_main_06.kills.millennium_tree_demon, 1, '首领击杀进度立即持久化');
    const pending = f.qs.talk('hunter_lei');
    eq(f.p.count('pillar_shard_2'), 0, '交付对白结束前不发残片');
    finish(f, pending);
  }

  // 两章都经真实 tracker；保留原目标进度格式。
  for (const id of ids) {
    const f = fixture(id); accept(f);
    const text = () => ({ value: '', visible: false, padding: { left: 6 },
      setText(value: string) { this.value = value; return this; },
      setVisible(value: boolean) { this.visible = value; return this; } });
    const tracker = text();
    const scene = Object.assign(Object.create(GameScene.prototype), {
      prog: f.p, quests: f.qs, sectGrowth: { identity: () => null },
      invText: { visible: false }, sectTitle: text(), sectBadge: text(),
      skillBar: { draw() {} }, combat: { cds: {} }, npcMarks: [], tracker, debugText: { visible: false },
    });
    scene.drawHudTail();
    const lines = tracker.value.split('\n');
    ok(tracker.visible, `${id} tracker可见`);
    ok(lines.includes(`  ${questDescription(f.q)}`), `${id} tracker展示真实任务描述`);
    ok(tracker.value.includes(questName(f.q)), `${id} tracker展示表内任务名称`);
    for (const objective of f.qs.objectiveProgress(f.q)) {
      ok(lines.includes(`  ${objective.label} ${objective.cur}/${objective.need}`), `${id} tracker保留原目标进度格式`);
    }
  }

  // 真实普通任务菜单的 reason 继续展示描述；用现有商店入口触发菜单。
  for (const id of ids) {
    const f = fixture(id), h = trialScene(f);
    let choices: { label: string; reason?: string }[] = [];
    Object.assign(h.scene, {
      closeItemPanels() {},
      sectGrowth: { services: () => [], ordinaryCatalog: () => ({ ok: true }), ordinarySellCatalog: () => ({ ok: false }), recipeCatalog: () => ({ ok: false }) },
      dialog: { choose: (_line: unknown, _sprite: unknown, options: typeof choices) => { choices = options; } },
    });
    h.scene.talkTo(f.q.giver);
    const option = choices.find(choice => choice.label === questName(f.q));
    ok(option, `${id} 普通NPC菜单显示任务`);
    eq(option.reason, questDescription(f.q), `${id} 普通NPC菜单显示描述`);
  }

  // 入口依旧是 reqLevel30；任务接取为35级，两者均不依赖御剑或筑基考核。
  {
    const objects = TILED_MAPS.wanyao_outer_2.layers.flatMap((layer: { objects?: { type: string; name: string; properties?: { name: string; value: unknown }[] }[] }) => layer.objects ?? []);
    const entry = objects.find((o: { type: string; name: string }) => o.type === 'portal' && o.name === 'portal_to_deep_1');
    ok(entry, '万妖林外围有现有深林入口');
    const props = Object.fromEntries(entry.properties.map((p: { name: string; value: unknown }) => [p.name, p.value]));
    eq(props, { target: 'wanyao_deep_1', targetPortal: 'portal_to_outer_2', reqLevel: 30 }, '深林入口保持reqLevel30，无御剑等新增前置');
    const f = fixture('q_main_06'), h = trialScene(f); h.scene.map.id = 'wanyao_outer_2';
    f.p.level = 29;
    eq(h.scene.portalOpen({ props }), false, '29级不能通过深林入口');
    f.p.level = 30;
    eq(h.scene.portalOpen({ props }), true, '30级可通过真实portalOpen，无御剑/考核/守阵记录');
    eq(f.qs.available(f.q.id), false, '深林入口开放不绕过任务35级门槛');
    f.p.level = 35;
    eq(f.qs.available(f.q.id), true, '35级接取深林仍走原门槛');
  }

  const altar = TRIALS.trial_foundation_altar;
  ok(altar, '筑基台原试炼存在');
  eq(altar.durationMs, 60000, '筑基台仍守阵60秒');
  eq(altar.objective?.hp, 6000, '阵眼气血原值');
  eq(altar.objective?.monsterDamageMul, 0.2, '阵眼承伤原值');
  eq(altar.waves, [
    { fromMs: 0, toMs: 20000, spawns: [{ monster: 'heart_demon_imp', side: 'both', everyMs: 5500, perSide: 1 }], total: 8 },
    { fromMs: 20000, toMs: 40000, spawns: [{ monster: 'heart_demon_imp', side: 'both', everyMs: 7500, perSide: 1 }, { monster: 'heart_demon_wisp', side: 'alternate', everyMs: 7500, perSide: 1 }], total: 9 },
    { fromMs: 45000, toMs: 55000, spawns: [{ monster: 'heart_demon_imp', side: 'both', everyMs: 5000, perSide: 1 }, { monster: 'heart_demon_wisp', side: 'both', everyMs: 9000, perSide: 1 }], hazard: { type: 'thunder_circle', everyMs: 5000, count: 2, radius: 64, telegraphMs: 1200, playerDamageRatioOfMaxHp: 0.15, nearObjective: 320 }, total: 8 },
    { fromMs: 55000, toMs: 60000, spawns: [], despawnAll: true },
  ], '筑基台波次、时长、数量、天雷原值全部保留');

  {
    const f = fixture('q_elder_exam'); f.p.quests.q_elder_exam = { state: 'done', kills: {} };
    f.p.addItem('foundation_pill', 2); f.p.addItem('clear_mind_pill', 2);
    const h = trialScene(f), rate = f.p.breakthroughRate();
    h.scene.offerTrial('tianjian_elder', altar);
    eq([f.p.count('foundation_pill'), f.p.count('clear_mind_pill')], [2, 2], '查看成功率与入台提示不扣丹');
    eq(h.values.has('trialPending'), false, '提示对白未结束不开始试炼');
    eq(h.restarts.length, 0, '提示对白未结束不切图');
    ok(h.dialogs[0].lines.some(line => line.text.includes(t('trial.enter_hint', { sec: 60 }))), '入台前仍展示60秒守阵说明');
    ok(h.dialogs[0].lines.some(line => line.text.includes(`${Math.round(rate.rate * 100)}`)), '入台前仍展示原成功率明细');
    ok(h.dialogs[0].after, '入台提示完成后才进入试炼');
    h.dialogs[0].after();
    eq([f.p.count('foundation_pill'), f.p.count('clear_mind_pill')], [1, 1], '真实enterTrial入台才各扣一枚丹');
    eq(f.p.level, 29, '入台不提前筑基');
    eq(h.values.get('trialPending'), altar.id, '入台登记原试炼');
    eq(h.values.get('trialRate'), rate, '本次成功率在消耗丹药前计算并固定');
    eq(JSON.parse(saved[saveKey]), f.p.exportSave(), '入台消耗立即保存');
    const transition = h.timers.find(timer => timer.ms === 220);
    ok(transition, '入台保留原淡出时长'); transition.run();
    eq(h.restarts, [{ map: altar.map }], '入台加载原筑基台地图');
    eq([f.p.count('foundation_pill'), f.p.count('clear_mind_pill')], [1, 1], '切图回调不重复扣丹');
  }
  {
    const f = fixture('q_elder_exam'); f.p.quests.q_elder_exam = { state: 'done', kills: {} };
    f.p.addItem('foundation_pill', 1); f.p.addItem('clear_mind_pill', 1);
    const h = trialScene(f);
    h.scene.offerTrial('tianjian_elder', altar);
    ok(h.dialogs[0].after, '有丹可查看入台提示');
    f.p.removeItem('foundation_pill', 1);
    h.dialogs[0].after();
    eq(f.p.count('clear_mind_pill'), 1, '确认过程中筑基丹失效不预扣清心丹');
    eq(h.values.has('trialPending'), false, '确认过程中缺筑基丹不开台');
    eq(h.restarts.length, 0, '确认过程中缺筑基丹不切图');
    eq(h.timers.length, 0, '确认过程中缺筑基丹不排入场切图');
    ok(h.logs.includes(t('trial.need_pill', { item: '筑基丹' })), '缺丹复核给出可读提示');
    h.scene.offerTrial('tianjian_elder', altar);
    eq(h.dialogs[1].after, undefined, '缺丹时入台对白没有可执行入台回调');
  }

  const penalty = REALMS.find(realm => realm.id === 'qi_refining')!.failPenalty!;
  eq(penalty, { expLossRatio: 0.1, debuffMs: 600000, debuffStatRatio: -0.1, debuffStats: ['atk', 'def'], consumeItem: true, retryTrial: true }, '筑基失败惩罚原值不变');
  for (const result of ['broken', 'dead', 'held'] as const) {
    const f = fixture('q_elder_exam'); f.p.quests.q_elder_exam = { state: 'done', kills: {} };
    f.p.addItem('foundation_pill', 2);
    f.p.overflowExp = Math.floor(f.p.exp * 0.05);
    const h = trialScene(f); h.scene.enterTrial(altar);
    h.timers.length = 0;
    const before = { exp: f.p.exp, pool: f.p.overflowExp, fails: f.p.breakthroughFails, unstable: f.p.unstableUntil, pill: f.p.count('foundation_pill') };
    h.values.set('trialRate', { rate: 0 });
    const randomBefore = Math.random;
    try { Math.random = () => 0.999999; h.scene.onTrialEnd(result); }
    finally { Math.random = randomBefore; }
    eq(f.p.count('foundation_pill'), before.pill, `${result} 结算不再次扣丹`);
    eq(f.p.level, 29, `${result} 失败不进入30级筑基`);
    if (result !== 'held') {
      eq([f.p.exp, f.p.overflowExp, f.p.breakthroughFails, f.p.unstableUntil], [before.exp, before.pool, before.fails, before.unstable], `${result} 守阵失败不扣修为、不加失败保底或不稳`);
      eq(h.values.get('lastTrialResult'), result, `${result} 保留失败结果`);
      ok(h.logs.includes(t(result === 'broken' ? 'trial.altar_broken' : 'trial.player_down')), `${result} 展示明确失败原因`);
      const feedback = h.logs.join('\n');
      ok(/丹药.*(?:消耗|用掉)/.test(feedback), `${result} 反馈明确丹药已在入台消耗`);
      ok(/修为没有损失/.test(feedback), `${result} 反馈明确未扣修为`);
      ok(/(?:再找|再试|再.*入台|再.*挑战)/.test(feedback), `${result} 反馈说明如何重试`);
      ok(h.timers.some(timer => timer.ms === 2600), `${result} 返回时长保持2600ms`);
    } else {
      const roll = h.timers.find(timer => timer.ms === 2200);
      ok(roll, '守阵成功后保留原突破判定演出时长');
      const started = gameNow(); roll.run(); const ended = gameNow();
      const loss = Math.round(before.exp * penalty.expLossRatio);
      const poolLoss = Math.min(before.pool, loss);
      eq([f.p.exp, f.p.overflowExp], [before.exp - (loss - poolLoss), before.pool - poolLoss], '守阵成功但突破失败仍先扣溢出池、再扣修为条10%');
      eq(f.p.breakthroughFails, before.fails + 1, '突破判定失败才递增保底计数');
      ok(f.p.unstableUntil >= started + penalty.debuffMs && f.p.unstableUntil <= ended + penalty.debuffMs, '突破失败不稳仍持续原10分钟');
      eq(f.p.unstableRatio, penalty.debuffStatRatio, '突破失败不稳属性倍率原值');
      eq(f.p.unstableStats, penalty.debuffStats, '突破失败不稳属性类型原值');
      eq(h.values.get('lastTrialResult'), 'lose', '守阵成功与突破失败结果分开记录');
      ok(h.logs.includes(t('realm.breakthrough_fail')), '保留原突破失败反馈');
      ok(h.logs.includes(t('realm.next_bonus', { bonus: Math.round((BREAKTHROUGH.pityPerFail ?? 0) * 100) })), '保留原下次成功率保底反馈');
      ok(/阵眼已守住.*突破未成/.test(h.logs.join('\n')), '可读反馈区分守阵成功与突破判定失败');
      eq(JSON.parse(saved[saveKey]), f.p.exportSave(), '突破失败与惩罚一起存档');
      ok(h.timers.some(timer => timer.ms === 3000), '突破失败返回时长保持3000ms');
    }
  }

  eq(featureFlags(), flagsBefore, '卷一5–6章测试保持关态夹具开关不变');
  console.log(JSON.stringify({ suite: 'mainline-56', passed: true, assertions, quests: ids }));
} finally {
  setFeatureFlag('indexedDbSaves', false);
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
