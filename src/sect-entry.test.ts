import { CLASS_LIST, type ClassDef } from './classes';
import { NPCS, QUESTS, TRIALS, TILED_MAPS, syncTalismanMapAvailability, questName, t, type Line } from './data';
import { FEATURE_UNAVAILABLE, featureFlags, setFeatureFlag } from './features';
import { ferryLockedReason, mapEntryOpen } from './Ferry';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { GameScene } from './scenes/GameScene';
import type { DialogChoice } from './UI';

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

const flagsBefore = featureFlags();
const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
const saved: Record<string, string> = {};
const saveKey = 'xiantu_save_v1';
const fourSects = CLASS_LIST.filter(cls => cls.sect !== 'tianjian');

function fixture(cls: ClassDef) {
  const p = new Progress();
  p.level = QUESTS[cls.joinQuest].reqLevel;
  p.quests.q_fox = { state: 'done', kills: {} };
  return p;
}
function trialFor(cls: ClassDef) {
  const trial = Object.values(TRIALS).find(row => row.quest === cls.joinQuest);
  check(trial, `${cls.id}: 四宗任务存在实际试炼`);
  return trial;
}

try {
  globalThis.localStorage = {
    getItem: key => saved[key] ?? null,
    setItem: (key, value) => { saved[key] = String(value); },
    removeItem: key => { delete saved[key]; },
    clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
    key: index => Object.keys(saved)[index] ?? null,
    get length() { return Object.keys(saved).length; },
  };
  setFeatureFlag('v05Maps', true);
  const traveler = new Progress(); traveler.level = 99; traveler.stones = 999;
  for (const [fiveSectClasses, talismanCraft] of [[false, false], [false, true], [true, false]] as const) {
    setFeatureFlag('fiveSectClasses', fiveSectClasses);
    setFeatureFlag('talismanCraft', talismanCraft);
    syncTalismanMapAvailability();
    for (const cls of fourSects) {
      const gateId = NPCS[QUESTS[cls.joinQuest].turnIn].map;
      const context = `${cls.id}/五宗=${fiveSectClasses}/制符=${talismanCraft}`;
      const accessible = fiveSectClasses || cls.sect === 'lingfu' && talismanCraft;
      const route = NPCS.ferry_master.ferryRoutes?.find(row => row.targetMap === gateId);
      check(route, `${context}: 存在正式山门航线`);
      if (route.unlockQuest) traveler.quests[route.unlockQuest] = { state: 'done', kills: {} };
      equal(!!TILED_MAPS[gateId], accessible, `${context}: 山门注册遵循五宗与独立制符开关`);
      equal(mapEntryOpen(gateId), accessible, `${context}: 山门准入与地图注册一致`);
      equal(ferryLockedReason(route, traveler), accessible ? undefined : FEATURE_UNAVAILABLE,
        `${context}: 满足普通航行门槛后只有已开放山门可达`);
    }
  }
  setFeatureFlag('talismanCraft', flagsBefore.talismanCraft);
  setFeatureFlag('fiveSectClasses', true);
  setFeatureFlag('v05Maps', true);
  setFeatureFlag('sectDaily', true);
  setFeatureFlag('sectShopLibrary', true);
  syncTalismanMapAvailability();
  equal(fourSects.length, 4, 'Y8 覆盖四宗而非仅太虚');

  for (const cls of fourSects) {
    const other = fourSects.find(row => row.sect !== cls.sect)!;
    const trial = trialFor(cls);

    // 正式入口、旧试炼入口与缺 NPC 对象时都须保存可重试的本宗山门落点。
    const elderId = QUESTS[cls.joinQuest].turnIn, gateId = NPCS[elderId].map;
    const gate = TILED_MAPS[gateId];
    check(gate, `${cls.id}: 五宗开启后正式山门已注册`);
    const elder = gate.layers.flatMap((layer: { objects?: { type: string; name: string; x: number; y: number }[] }) => layer.objects ?? [])
      .find((object: { type: string; name: string }) => object.type === 'npc' && object.name === elderId);
    check(elder, `${cls.id}: 山门有本宗长老对象`);
    for (const [result, entrance] of [
      ['fail', 'gate'], ['exit', 'gate'], ['exit', 'legacy'], ['exit', 'missing-npc'], ['exit', 'tiled-properties'],
    ] as const) {
      const context = `${cls.id}/${entrance}/${result}`, p = fixture(cls), qs = new QuestSystem(p);
      p.addItem('five_sect_token', 1); p.selectSect(cls.sect);
      equal(qs.accept(cls.joinQuest), true, `${context}: 真实接取本宗试炼任务`);
      const playerPosition = { x: elder.x - 24, y: elder.y };
      const expected = { mapId: gateId, x: elder.x, y: elder.y };
      const restarts: unknown[] = [], registry = new Map<string, unknown>();
      const scene = Object.assign(Object.create(GameScene.prototype), {
        prog: p, quests: qs,
        map: { id: entrance === 'legacy' || entrance === 'tiled-properties' ? trial.map : gateId,
          objects: entrance === 'missing-npc' ? [] : [{ type: 'npc', name: elderId, props: { npc: elderId },
            x: entrance === 'legacy' ? 128 : elder.x, y: entrance === 'legacy' ? 576 : elder.y }] },
        player: { ...playerPosition, body: { setVelocityX() {}, setVelocity() {} } }, mobs: [],
        registry: { set: (key: string, value: unknown) => registry.set(key, value) },
        scene: { restart: (data: unknown) => { restarts.push(data); } },
        time: { delayedCall: (_delay: number, callback: () => void) => callback() },
      }) as GameScene;
      let entered: boolean;
      try {
        if (entrance === 'tiled-properties') {
          // Tiled 可用 class 标对象类型、properties.npc 关联 NPC，不要求对象名等于 NPC id。
          TILED_MAPS[gateId] = { ...gate, layers: gate.layers.map((layer: { objects?: unknown[] }) => ({
            ...layer, objects: layer.objects?.map(object => object === elder ? { ...elder,
              type: '', class: 'npc', name: 'elder_marker', properties: [{ name: 'npc', type: 'string', value: elderId }],
            } : object),
          })) };
        }
        entered = scene.enterSectTrial(elderId, trial);
      } finally { TILED_MAPS[gateId] = gate; }
      equal(entered, true, `${context}: 长老真实入口进入试炼`);
      equal(p.pendingSectTrial, { id: trial.id, returnPosition: expected }, `${context}: 进入时记录正式山门和正确坐标`);
      equal(restarts, [{ map: trial.map }], `${context}: 入场仍重载本宗独立试炼图`);
      equal(registry.get('sectTrialEntering'), true, `${context}: 场景切换标记当前尝试`);
      equal(JSON.parse(saved[saveKey]).pendingSectTrial, p.pendingSectTrial, `${context}: 返回落点已写存档`);
      equal(Progress.load().pendingSectTrial, p.pendingSectTrial, `${context}: 中断读档保留相同山门落点`);
      equal(scene.enterSectTrial(elderId, trial), false, `${context}: 切图中不能覆盖本次返回位置`);
      p.hp = 1; p.mp = 0;
      scene.onSectTrialEnd(result);
      equal(p.pendingSectTrial, null, `${context}: 失败或退出清除本局 pending`);
      equal(p.position, expected, `${context}: 失败或退出写回原山门落点`);
      equal(restarts[1], { map: gateId, pos: { x: expected.x, y: expected.y } }, `${context}: 失败或退出切回原山门落点`);
      equal(p.completedTrials, [], `${context}: 返回不伪造通关记录`);
      equal(qs.state(cls.joinQuest), 'active', `${context}: 返回仍可重试本宗任务`);
      equal(p.count('five_sect_token'), 1, `${context}: 返回保留五宗帖`);
      scene.onSectTrialEnd(result);
      equal(restarts.length, 2, `${context}: 重复结算不重复切图`);
    }

    for (const [name, token, selected] of [
      ['无帖且未选择', 0, ''], ['无帖但选择本宗', 0, cls.sect],
      ['有帖未选择', 1, ''], ['有帖选择外宗', 1, other.sect],
    ] as const) {
      const p = fixture(cls);
      if (token) p.addItem('five_sect_token', token);
      p.selectedSect = selected;
      const qs = new QuestSystem(p), before = p.exportSave(), storedBefore = saved[saveKey];
      check(qs.sectEntryBlock(cls.joinQuest), `${cls.id}/${name}: 提供门槛提示`);
      equal(qs.available(cls.joinQuest), false, `${cls.id}/${name}: 不可接取`);
      equal(qs.accept(cls.joinQuest), false, `${cls.id}/${name}: 直接接取复查门槛`);
      equal(p.exportSave(), before, `${cls.id}/${name}: 拒绝不改角色`);
      equal(saved[saveKey], storedBefore, `${cls.id}/${name}: 拒绝不写存档`);
    }

    {
      const p = fixture(cls), qs = new QuestSystem(p);
      const before = p.exportSave(), storedBefore = saved[saveKey];
      equal(p.selectedSect, '', `${cls.id}: 新角色尚未选宗`);
      equal(p.selectSect(cls.sect), false, `${cls.id}: 无帖不能选择`);
      equal(p.exportSave(), before, `${cls.id}: 无帖选择不改状态`);
      equal(saved[saveKey], storedBefore, `${cls.id}: 无帖选择不写存档`);
      p.addItem('five_sect_token', 1);
      equal(p.selectSect('__unknown_sect__'), false, `${cls.id}: 未知宗门不能选择`);
      equal(p.selectSect(cls.sect), true, `${cls.id}: 持帖可选本宗`);
      equal(p.count('five_sect_token'), 1, `${cls.id}: 选宗不消耗五宗帖`);
      equal(JSON.parse(saved[saveKey]).selectedSect, cls.sect, `${cls.id}: 选宗写入存档`);
      const restored = Progress.load();
      equal(restored.selectedSect, cls.sect, `${cls.id}: 读档保持显式选宗`);
      equal(restored.job, '', `${cls.id}: 选择与读档不会提前拜入`);
      const imported = new Progress();
      equal(imported.importSave(p.exportSave()), true, `${cls.id}: 选择可导入`);
      equal(imported.selectedSect, cls.sect, `${cls.id}: 导入保持选择`);
      equal(qs.sectEntryBlock(cls.joinQuest), undefined, `${cls.id}: 满足门槛没有提示`);
      equal(qs.available(cls.joinQuest), true, `${cls.id}: 持帖选本宗可接`);
      equal(qs.accept(cls.joinQuest), true, `${cls.id}: 正式接取成功`);
      equal(qs.complete(cls.joinQuest), false, `${cls.id}: 接取不会立即完成`);
      equal(qs.onTrialComplete(trial.id), true, `${cls.id}: 合法通关登记成功`);
      equal(qs.complete(cls.joinQuest), true, `${cls.id}: 合法通关可以交付`);
    }

    // 对话显示后背包或选择可能变化，回调不能沿用打开对话时的资格。
    for (const change of ['失去五宗帖', '改选外宗'] as const) {
      const p = fixture(cls), qs = new QuestSystem(p);
      p.addItem('five_sect_token', 1); p.selectSect(cls.sect);
      const offer = qs.talk(QUESTS[cls.joinQuest].giver, cls.joinQuest);
      check(offer.after, `${cls.id}/${change}: 取得真实接取回调`);
      if (change === '失去五宗帖') p.removeItem('five_sect_token', 1);
      else equal(p.selectSect(other.sect), true, `${cls.id}: 试炼之前允许改选`);
      const before = p.exportSave(), storedBefore = saved[saveKey];
      equal(offer.after(), undefined, `${cls.id}/${change}: 陈旧接取回调不发奖励`);
      equal(qs.state(cls.joinQuest), undefined, `${cls.id}/${change}: 陈旧接取回调不能接取`);
      equal(p.exportSave(), before, `${cls.id}/${change}: 陈旧接取回调不改状态`);
      equal(saved[saveKey], storedBefore, `${cls.id}/${change}: 陈旧接取回调不写存档`);

      p.addItem('five_sect_token', 1); p.selectSect(cls.sect);
      equal(qs.accept(cls.joinQuest), true, `${cls.id}/${change}: 重建合法 active 任务`);
      equal(qs.onTrialComplete(trial.id), true, `${cls.id}/${change}: 完成合法试炼`);
      const turnIn = qs.talk(QUESTS[cls.joinQuest].turnIn, cls.joinQuest);
      check(turnIn.after, `${cls.id}/${change}: 取得真实交付回调`);
      equal(p.selectSect(cls.sect), true, `${cls.id}: 通关后仍可保存当前宗门选择`);
      equal(p.selectSect(other.sect), false, `${cls.id}: 通关后不能改宗`);
      if (change === '失去五宗帖') p.removeItem('five_sect_token', p.count('five_sect_token'));
      else p.selectedSect = other.sect; // 模拟陈旧/异常档变化，交付仍须复查。
      const beforeReward = p.exportSave(), storedRewardBefore = saved[saveKey];
      equal(turnIn.after(), undefined, `${cls.id}/${change}: 陈旧交付回调不给奖`);
      equal(qs.state(cls.joinQuest), 'active', `${cls.id}/${change}: 拒绝交付后仍为 active`);
      equal(p.exportSave(), beforeReward, `${cls.id}/${change}: 陈旧交付不修改资源和职业`);
      equal(saved[saveKey], storedRewardBefore, `${cls.id}/${change}: 陈旧交付不写存档`);
    }

    // v0.5 历史 active 档没有 selectedSect，不能凭残留通关记录取得奖励。
    for (const heldToken of [false, true]) {
      const old = fixture(cls);
      if (heldToken) old.addItem('five_sect_token', 1);
      old.quests[cls.joinQuest] = { state: 'active', kills: {} };
      old.completedTrials = [trial.id, '__unrelated_trial__'];
      const oldSave = old.exportSave(); delete oldSave.selectedSect;
      saved[saveKey] = JSON.stringify(oldSave);
      const p = Progress.load(), qs = new QuestSystem(p);
      let completionCount = 0; qs.onCompleted(() => { completionCount++; });
      equal(p.selectedSect, '', `${cls.id}/旧档持帖=${heldToken}: 缺选宗字段归一为空`);
      equal(p.job, '', `${cls.id}/旧档持帖=${heldToken}: 不根据 active 自动拜入`);
      const before = p.exportSave(), storedBefore = saved[saveKey];
      equal(qs.onTrialComplete(trial.id), false, `${cls.id}/旧档持帖=${heldToken}: 非法 active 不登记胜利`);
      equal(qs.complete(cls.joinQuest), false, `${cls.id}/旧档持帖=${heldToken}: 残留通关仍不能完成`);
      equal(qs.turnIn(cls.joinQuest), undefined, `${cls.id}/旧档持帖=${heldToken}: 不返回奖励`);
      equal(completionCount, 0, `${cls.id}/旧档持帖=${heldToken}: 不通知发奖监听器`);
      equal(p.exportSave(), before, `${cls.id}/旧档持帖=${heldToken}: 拒绝交付不变更角色`);
      equal(saved[saveKey], storedBefore, `${cls.id}/旧档持帖=${heldToken}: 拒绝交付不写存档`);
      equal(qs.abandon(cls.joinQuest), true, `${cls.id}/旧档持帖=${heldToken}: 可安全放弃`);
      equal(qs.state(cls.joinQuest), undefined, `${cls.id}: 放弃回到未接`);
      equal(p.completedTrials, ['__unrelated_trial__'], `${cls.id}: 放弃只清本任务通关记录`);
      equal(p.job, '', `${cls.id}: 放弃不拜入`);
      equal(completionCount, 0, `${cls.id}: 放弃不触发奖励`);
      equal(qs.abandon(cls.joinQuest), false, `${cls.id}: 重复放弃无效`);
      if (!heldToken) p.addItem('five_sect_token', 1);
      equal(p.selectSect(cls.sect), true, `${cls.id}: 旧任务放弃后可持帖选择本宗`);
      equal(qs.accept(cls.joinQuest), true, `${cls.id}: 满足门槛后可重新接取`);
      equal(qs.complete(cls.joinQuest), false, `${cls.id}: 重接不沿用已清通关记录`);
      equal(qs.onTrialComplete(trial.id), true, `${cls.id}: 重接后新的合法通关生效`);
      equal(qs.turnIn(cls.joinQuest)?.quest.id, cls.joinQuest, `${cls.id}: 合法重接交付成功`);
      equal(completionCount, 1, `${cls.id}: 合法交付仅通知一次`);
      equal(qs.abandon(cls.joinQuest), false, `${cls.id}: 已交付任务不可放弃`);
    }

    {
      const p = fixture(cls), qs = new QuestSystem(p);
      p.addItem('five_sect_token', 1); p.selectSect(cls.sect); qs.accept(cls.joinQuest);
      p.pendingSectTrial = { id: trial.id, returnPosition: { mapId: trial.map, x: 0, y: 0 } };
      const before = p.exportSave(), storedBefore = saved[saveKey];
      equal(qs.abandon(cls.joinQuest), false, `${cls.id}: 进行中的试炼不可放弃任务`);
      equal(p.selectSect(other.sect), false, `${cls.id}: 进行中的试炼不可改选`);
      equal(p.exportSave(), before, `${cls.id}: pending 拒绝不改角色`);
      equal(saved[saveKey], storedBefore, `${cls.id}: pending 拒绝不写存档`);
      p.pendingSectTrial = null;
      p.job = cls.id;
      const joinedBefore = p.exportSave();
      equal(p.selectSect(other.sect), false, `${cls.id}: 已入宗不可改选`);
      equal(p.exportSave(), joinedBefore, `${cls.id}: 已入宗选择拒绝不改角色`);
    }

    {
      const p = fixture(cls), qs = new QuestSystem(p);
      p.addItem('five_sect_token', 1);
      const beforeSelection = p.exportSave(), storedBefore = saved[saveKey];
      const setItemBefore = localStorage.setItem;
      localStorage.setItem = () => { throw new Error('Y8 模拟存档写入失败'); };
      try {
        equal(p.selectSect(cls.sect), false, `${cls.id}: 保存失败不能报告选择成功`);
        equal(p.exportSave(), beforeSelection, `${cls.id}: 选择保存失败回滚内存状态`);
        equal(saved[saveKey], storedBefore, `${cls.id}: 选择保存失败不覆盖旧存档`);
      } finally { localStorage.setItem = setItemBefore; }
      p.selectSect(cls.sect); qs.accept(cls.joinQuest);
      p.completedTrials = [trial.id, '__unrelated_trial__']; p.save();
      const beforeAbandon = p.exportSave(), storedAbandonBefore = saved[saveKey];
      localStorage.setItem = () => { throw new Error('Y8 模拟存档写入失败'); };
      try {
        equal(qs.abandon(cls.joinQuest), false, `${cls.id}: 保存失败不能报告放弃成功`);
        equal(p.exportSave(), beforeAbandon, `${cls.id}: 放弃保存失败回滚任务和通关记录`);
        equal(saved[saveKey], storedAbandonBefore, `${cls.id}: 放弃保存失败不覆盖旧存档`);
      } finally { localStorage.setItem = setItemBefore; }
    }

    // 正式 job 是旧档的入宗事实；未留拜师 done/五宗帖不能阻断日常和长老服务。
    for (const entryActive of [false, true]) {
      const old = fixture(cls), quest = QUESTS[cls.joinQuest];
      old.level = 29; old.job = cls.id; old.classVersion = 2; old.classRewardClaims = [cls.id];
      if (entryActive) {
        old.quests[cls.joinQuest] = { state: 'active', kills: {} };
        old.completedTrials = [trial.id];
      }
      const oldSave = old.exportSave(); delete oldSave.selectedSect;
      saved[saveKey] = JSON.stringify(oldSave);
      const p = Progress.load(), qs = new QuestSystem(p);
      const context = `${cls.id}/正式旧档入门active=${entryActive}`;
      equal(p.job, cls.id, `${context}: 正式职业读档保留`);
      equal(p.selectedSect, '', `${context}: 旧档无选择字段`);
      equal(p.count('five_sect_token'), 0, `${context}: 旧档无五宗帖`);
      equal(qs.state(cls.joinQuest), entryActive ? 'active' : undefined, `${context}: 不伪造拜师 done`);
      const dailyIds = qs.npcDailyQuestIds(quest.giver);
      equal(dailyIds.length, 3, `${context}: 本宗三条日常仍可提供`);
      const daily = QUESTS[dailyIds[0]], ordinaryTalk = qs.talk(quest.giver);
      check(ordinaryTalk.after, `${context}: 普通接引对话仍提供既有任务回调`);
      check(ordinaryTalk.lines.every(line => line.text !== qs.sectEntryBlock(cls.joinQuest)),
        `${context}: 普通接引对话没有被入门提示覆盖`);
      equal(qs.talk(quest.turnIn).lines, NPCS[quest.turnIn].dialog.map(text => ({ speaker: NPCS[quest.turnIn].name, text })),
        `${context}: 普通长老对话不被入门提示覆盖`);

      let choices: DialogChoice[] = [], menuText = '', completion: (() => void) | undefined;
      let serviceCalls = 0, rewardCalls = 0;
      const scene = Object.assign(Object.create(GameScene.prototype), {
        prog: p, quests: qs, map: { id: 'luoxia_town', objects: [] },
        player: { body: { setVelocityX() {} } },
        dialog: {
          choose(line: Line, _sprite: unknown, nextChoices: DialogChoice[]) { menuText = line.text; choices = nextChoices; },
          show(_lines: Line[], _sprite: unknown, after?: () => void) { completion = after; },
        },
        sectGrowth: {
          services: (npcId: string) => npcId === quest.turnIn ? [{ type: 'sect_library', allowed: true, key: '' }] : [],
          identity: () => null,
          ordinaryCatalog: () => ({ ok: false }), ordinarySellCatalog: () => ({ ok: false }),
          recipeCatalog: () => ({ ok: false }),
        },
        openSectCatalog(npcId: string, type: string) {
          equal([npcId, type], [quest.turnIn, 'sect_library'], `${context}: 长老服务回调参数正确`);
          serviceCalls++;
        },
        giveRewards() { rewardCalls++; }, log() {},
      }) as GameScene;
      scene.talkTo(quest.giver);
      const dailyChoice = choices.find(choice => choice.label === questName(daily));
      check(dailyChoice && !dailyChoice.disabled, `${context}: 普通 talkTo 可打开可接日常菜单`);
      check(menuText !== qs.sectEntryBlock(cls.joinQuest), `${context}: 日常菜单没有被五宗帖提示覆盖`);
      dailyChoice.onSelect();
      check(completion, `${context}: 日常菜单回调显示任务对话`);
      completion();
      equal(qs.state(daily.id), 'active', `${context}: 日常真实回调仍能接取`);

      scene.talkTo(quest.turnIn);
      const serviceChoice = choices.find(choice => choice.label === t('sect.library.menu'));
      check(serviceChoice, `${context}: 普通 talkTo 可打开长老服务菜单`);
      serviceChoice.onSelect();
      equal(serviceCalls, 1, `${context}: 服务菜单可调用既有服务入口`);

      const beforeBlocked = p.exportSave();
      scene.talkTo(quest.turnIn, cls.joinQuest);
      equal(menuText, qs.sectEntryBlock(cls.joinQuest), `${context}: 显式拜师 quest 仍显示门槛提示`);
      check(!choices.some(choice => choice.label === '进入试炼' || choice.label === t('sect.library.menu')),
        `${context}: 显式拜师 quest 不提供入场或服务回调`);
      const explicitTalk = qs.talk(quest.turnIn, cls.joinQuest);
      equal(explicitTalk.lines[0]?.text, qs.sectEntryBlock(cls.joinQuest), `${context}: 显式任务 API 仍显示门槛`);
      equal(explicitTalk.after, undefined, `${context}: 显式任务 API 不提供交付回调`);
      equal(qs.turnIn(cls.joinQuest), undefined, `${context}: 正式职业不能绕门槛重领拜师奖励`);
      equal(rewardCalls, 0, `${context}: 普通菜单和显式拒绝均不发拜师奖励`);
      equal(p.exportSave(), beforeBlocked, `${context}: 显式拒绝不改角色与任务状态`);
    }
  }

  // 独立制符教学不要求拜入灵符派；拜帖提示只拦宗门任务和继续普通对话。
  const lingfu = fourSects.find(cls => cls.sect === 'lingfu')!;
  for (const [context, token, selected, entryActive] of [
    ['未持帖未选宗', 0, '', false], ['持帖未选宗', 1, '', false],
    ['已选灵符且入门任务进行中', 1, 'lingfu', true],
  ] as const) {
    const p = fixture(lingfu), qs = new QuestSystem(p);
    p.level = 15;
    if (token) p.addItem('five_sect_token', token);
    p.selectedSect = selected;
    if (entryActive) p.quests[lingfu.joinQuest] = { state: 'active', kills: {} };
    let choices: DialogChoice[] = [], menuText = '', completion: (() => void) | undefined;
    const scene = Object.assign(Object.create(GameScene.prototype), {
      prog: p, quests: qs, map: { id: 'lingfu_pavilion', objects: [] },
      player: { body: { setVelocityX() {} } },
      closeItemPanels() {},
      dialog: {
        choose(line: Line, _sprite: unknown, nextChoices: DialogChoice[]) { menuText = line.text; choices = nextChoices; },
        show(_lines: Line[], _sprite: unknown, after?: () => void) { completion = after; choices = []; },
      },
      sectGrowth: {
        services: () => [], ordinaryCatalog: () => ({ ok: false }), ordinarySellCatalog: () => ({ ok: false }),
        recipeCatalog: () => ({ ok: false }),
      },
      giveRewards() {}, log() {},
    }) as GameScene;
    setFeatureFlag('talismanCraft', true);
    scene.talkTo('lingfu_envoy');
    check(choices.some(choice => choice.label === t('talisman.entry_learn')), `${context}: 普通对话提供独立制符教学`);
    check(choices.some(choice => choice.label === t('talisman.entry_craft')), `${context}: 普通对话提供独立制符入口`);
    const blocked = qs.sectEntryBlock(lingfu.joinQuest);
    if (blocked) {
      const before = p.exportSave();
      scene.talkTo('lingfu_envoy', lingfu.joinQuest);
      equal(menuText, blocked, `${context}: 显式宗门任务仍提示拜帖门槛`);
      check(!choices.some(choice => choice.label === t('talisman.entry_learn')), `${context}: 显式门槛不提供制符菜单`);
      scene.talkTo('lingfu_envoy', undefined, true);
      equal(menuText, blocked, `${context}: 继续普通对话仍提示拜帖门槛`);
      setFeatureFlag('talismanCraft', false);
      scene.talkTo('lingfu_envoy');
      equal(menuText, blocked, `${context}: 制符关闭时保留原拜帖提示`);
      setFeatureFlag('talismanCraft', true);
      equal(p.exportSave(), before, `${context}: 显式门槛和关闭制符不改变角色`);
    }
    scene.talkTo('lingfu_envoy');
    choices.find(choice => choice.label === t('talisman.entry_learn'))!.onSelect();
    check(completion, `${context}: 独立制符教学提供真实任务对白回调`);
    completion();
    equal(qs.state('q_talisman_intro'), 'active', `${context}: 制符教学可接取入门任务`);
    equal([p.job, p.sect, p.selectedSect, p.count('five_sect_token')], ['', '', selected, token],
      `${context}: 制符教学不改变入宗、选宗和拜帖`);
    equal(qs.state(lingfu.joinQuest), entryActive ? 'active' : undefined, `${context}: 制符教学不改变宗门任务`);
  }
  setFeatureFlag('talismanCraft', flagsBefore.talismanCraft);

  // 本次修复明确保留天剑：妖狐完成后，不加四宗的持帖与选宗门槛。
  const tianjian = CLASS_LIST.find(cls => cls.sect === 'tianjian')!;
  const p = fixture(tianjian), qs = new QuestSystem(p);
  equal(qs.sectEntryBlock(tianjian.joinQuest), undefined, '天剑免新增五宗帖门槛');
  equal(qs.available(tianjian.joinQuest), true, '天剑仍按妖狐前置提供任务');
  equal(qs.accept(tianjian.joinQuest), true, '天剑无帖未选仍可走原入口');
  equal(qs.abandon(tianjian.joinQuest), false, '天剑不进入四宗放弃路径');
  const reward = qs.talk(QUESTS[tianjian.joinQuest].turnIn, tianjian.joinQuest).after?.();
  equal(reward?.quest.id, tianjian.joinQuest, '天剑仍对话即交付');
  p.quests.q_breakthrough = { state: 'active', kills: {} };
  equal(qs.abandon('q_breakthrough'), false, '普通 active 任务不走四宗放弃');
} finally {
  for (const [name, value] of Object.entries(flagsBefore)) setFeatureFlag(name as keyof typeof flagsBefore, value);
  syncTalismanMapAvailability();
  if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
  else Reflect.deleteProperty(globalThis, 'localStorage');
}
equal(featureFlags(), flagsBefore, 'Y8 专项回归恢复运行时旗标');
console.log(JSON.stringify({ test: 'sect-entry', assertions, fourSects: fourSects.map(cls => cls.sect), flagsBefore }));
