import questsRaw from '@xt/balance/quests.json';
import stringsRaw from '@xt/balance/strings_zh.json';
import companionsRaw from '@xt/balance/companions.json';
import flyZonesRaw from '@xt/balance/fly_zones.json';
import npcsRaw from '@xt/balance/npcs.json';
import campRaw from '@xt/maps/wanyao_outer_1.json';
import { GAME_PHASE, NPCS, QUESTS, REALMS, type Line } from './data';
import { featureEnabled, featureFlags, setFeatureFlag } from './features';
import { gameNow } from './GameClock';
import { Progress } from './Progress';
import { QuestSystem } from './QuestSystem';
import { SectGrowth } from './SectGrowth';
import { createIndexedDbBackend, createMemorySaveBackend, saveStore, setSaveBackend } from './SaveStore';
import { SECRET_NEST_INTRO_ID, isSecretNestIntroEnabled, refuseEnter, refuseReward, refuseStart } from './SecretNestClosed';
import { enterSecretNest, exitSecretNest, readSecretNestSign, rewardSecretNest, startSecretNest, resetSecretNestRunForTests, fixtureClearSecretNestMobs, getSecretNestRun } from './SecretNestGate';
import { getSecretBoonState, chooseSecretBoon } from './SecretBoonRuntime';
import { GameScene } from './scenes/GameScene';
import type { MapObj } from './scenes/MapBuilder';

type After = (() => unknown) | undefined;
type Choice = { label: string; disabled?: boolean; onSelect: () => unknown };

/** openFixture 表示当前独立 SSR 图读到开态；正式开态直接导入 JSON，关态只读 runner 注入的克隆。 */
export async function runV06cOpenTests(options: { openFixture: boolean; dataMode?: string }): Promise<{ assertions: number }> {
  const { openFixture, dataMode = 'fixture' } = options;
  const label = `${dataMode}/${openFixture ? 'formal-open' : 'memory-closed'}`;
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const clone = <T>(value: T): T => structuredClone(value);
  const last = <T>(values: T[]): T | undefined => values[values.length - 1];
  const id = SECRET_NEST_INTRO_ID;
  const strings = stringsRaw as unknown as Record<string, string>;
  const signLines = ['a', 'b', 'c'].map(part => strings[`secret.quest.intro.sign_${part}`]);
  const importedBefore = JSON.stringify([questsRaw, stringsRaw, campRaw, companionsRaw, flyZonesRaw, npcsRaw]);
  const runtimeBefore = JSON.stringify(QUESTS), flagsBefore = featureFlags();
  const intro = questsRaw.find((quest): quest is typeof quest & { reqLevel: number } => quest.id === id && typeof quest.reqLevel === 'number');
  ok(intro, '导入任务表有唯一引导条目');
  eq(GAME_PHASE, 5, '全局阶段仍为 5');
  eq([intro.enabled, intro.phase], openFixture ? [true, 5] : [false, 6], '正式开态为 true/5，SSR 关态克隆仅改为 false/6');
  eq(intro.rewards, {}, '引导奖励始终为空');
  eq([intro.giver, intro.turnIn, intro.prereq, intro.reqRealm, intro.reqLevel, intro.next],
    ['hunter_lei', 'hunter_lei', 'q_main_04', 'foundation', 30, null], '资格、NPC、前置与 next 均沿用正式表');
  eq(intro.objectives, [{ type: 'reach', map: 'wanyao_outer_1', target: 'secret_nest_sign' }], '引导只推进路牌 reach');
  eq(isSecretNestIntroEnabled(), openFixture, '门禁读导入 JSON 的开关');
  eq(!!QUESTS[id], openFixture, '正式开态 JSON 进入阶段表，关态克隆被 phase 筛除');
  eq(featureEnabled('indexedDbSaves'), true, 'IDB 正式开关保持 true');
  eq(featureEnabled('secret_boon_runtime'), true, 'design/49 Soft OpenPreRelease 正式软闸 true');
  eq(featureEnabled('secret_daily_bonus'), true, 'design/50 Soft OpenPreRelease 日倍键落盘 true');
  eq([companionsRaw.enabled, companionsRaw.companions[0].enabled, flyZonesRaw.enabled], [true, true, true], '同门与御剑沿用已软开正式值');
  let giftsChecked = 0;
  const checkGifts = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') {
        giftsChecked++;
        eq((child as { enabled?: boolean }).enabled, false, '所有正式 gifts 仍关闭');
      }
      checkGifts(child);
    }
  };
  checkGifts(npcsRaw);
  ok(giftsChecked > 0, '确实检查了赠礼开关');

  const mapObjects: MapObj[] = campRaw.layers.flatMap(layer => ('objects' in layer ? layer.objects ?? [] : []))
    .map(object => ({ name: object.name, type: object.type, x: object.x, y: object.y,
      w: object.width, h: object.height, props: Object.fromEntries((object.properties ?? []).map(property => [property.name, property.value])) }));
  const sign = mapObjects.find(object => object.name === 'secret_nest_sign');
  const entrance = mapObjects.find(object => object.name === 'secret_nest_entrance');
  const campReturn = mapObjects.find(object => object.name === 'secret_nest_return');
  ok(sign && entrance && campReturn, '使用正式地图路牌、入口与回营地点');
  const returnPosition = { mapId: 'wanyao_outer_1', x: campReturn.x, y: campReturn.y };
  const slotBefore = Progress.getActiveSlot(), storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const disk = new Map<string, string>(), progresses: Progress[] = [];
  let writes = 0, localWrites = 0;
  const memory = createMemorySaveBackend();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => disk.get(key) ?? null,
    setItem: (key: string, value: string) => { localWrites++; disk.set(key, String(value)); },
    removeItem: (key: string) => { localWrites++; disk.delete(key); },
  } });
  setSaveBackend({ ...memory, async write(slot) { writes++; await memory.write(slot); } });
  const now = gameNow();
  async function fixture(main06Done = false, level = intro!.reqLevel) {
    const p = new Progress(); progresses.push(p);
    p.level = level; p.exp = 7; p.stones = 1234; p.hp = p.maxHp; p.mp = p.maxMp;
    p.inventory = { hp_pill: 3, pillar_shard_2: 1 };
    p.spTipShown = true;
    p.position = { mapId: 'wanyao_outer_1', x: entrance!.x, y: entrance!.y };
    p.quests.q_main_04 = { state: 'done', kills: {} };
    p.quests.q_main_06 = { state: main06Done ? 'done' : 'active', kills: { millennium_tree_demon: 0 } };
    const qs = new QuestSystem(p, () => now);
    p.sectDailyContributionClaims = ['q_daily_tianjian_1'];
    p.dailyQuestCompletions = { tianjian: ['q_daily_tianjian_1'] };
    p.buffs = [{ id: 'existing-secret-gate-boon', expireAt: 9999999999999 }];
    await p.flushSaves();
    return { p, qs };
  }
  // 显示对象只模拟 Phaser 渲染，交互、门禁、任务和存档逻辑均运行产品代码。
  function sceneFixture(p: Progress, qs: QuestSystem, withArt = false) {
    const logs: string[] = [], dialogs: Line[][] = [], callbacks: After[] = [], menus: Choice[][] = [];
    const visuals: any[] = [], transitions: unknown[] = [], physicsEvents: string[] = [];
    function display(kind: string, text?: string): any {
      const events = new Map<string, (...args: any[]) => unknown>(), data = new Map<string, unknown>();
      const item: any = { kind, text, width: 40, events, data, destroyed: false,
        texture: { has: () => true, firstFrame: 'first' }, anims: { stop() {} },
        setOrigin() { return this; }, setDepth() { return this; }, setStrokeStyle() { return this; },
        setInteractive() { this.interactive = true; return this; }, setScrollFactor() { return this; },
        setVisible(value: boolean) { this.visible = value; return this; }, setPosition() { return this; },
        setName(name: string) { this.name = name; return this; }, add() { return this; },
        on(event: string, callback: (...args: any[]) => unknown) { events.set(event, callback); return this; }, off() { return this; },
        setData(key: string, value: unknown) { data.set(key, value); return this; }, getData(key: string) { return data.get(key); },
        setFrame() { return this; }, destroy() { this.destroyed = true; },
      };
      visuals.push(item); return item;
    }
    const world = { isPaused: false };
    const player: any = { x: entrance!.x, y: entrance!.y, dead: false, syncAppearance() {},
      body: { setVelocityX() {}, setVelocity() {}, reset(x: number, y: number) { player.x = x; player.y = y; } } };
    const scene: any = Object.assign(Object.create(GameScene.prototype), {
      prog: p, quests: qs, sectGrowth: new SectGrowth(p), player, travelling: false,
      senseCueDepth: 0, interactionPrompts: [], map: { id: 'wanyao_outer_1', objects: mapObjects, spawn: { x: 490, y: 832 } },
      scale: { width: 1024, height: 768 }, time: { paused: false },
      keys: { z: { _justDown: false }, up: { _justDown: false }, esc: { _justDown: false } },
      textures: { exists: (key: string) => withArt && key === 'prop_secret_door' },
      cache: { json: { get: () => undefined } }, anims: { exists: () => false },
      add: { sprite: () => display('sprite'), rectangle: () => display('rectangle'), container: () => display('container'),
        text: (_x: number, _y: number, text: string) => display('text', text) },
      log: (text: string) => logs.push(text), skillWindow: { refresh() {} },
      dialog: { open: false, show: (lines: Line[], _speaker?: unknown, after?: After) => { dialogs.push(lines); callbacks.push(after); },
        choose: (_line: Line, _speaker: unknown, choices: Choice[]) => { menus.push(choices); } },
      physics: { world, pause() { world.isPaused = true; physicsEvents.push('pause'); }, resume() { world.isPaused = false; physicsEvents.push('resume'); } },
      scene: { restart: (args: unknown) => transitions.push(args) },
      encounterRuntime: { interact() { throw new Error('秘境交互必须先于遭遇路径'); } },
    });
    return { scene, logs, dialogs, callbacks, menus, visuals, transitions, physicsEvents };
  }
  function withoutIntro(p: Progress) {
    const saved = p.exportSave();
    delete (saved.quests as Record<string, unknown>)[id];
    return saved;
  }

  try {
    resetSecretNestRunForTests();
    if (openFixture) {
      eq(readSecretNestSign(), { allowed: true, lines: signLines }, '路牌 API 返回既有三句说明');
      for (const main06Done of [false, true]) {
        const { p, qs } = await fixture(main06Done), view = sceneFixture(p, qs);
        const baseline = withoutIntro(p), mainBefore = clone(p.quests.q_main_06);
        ok(qs.npcQuestIds('hunter_lei').includes(id), '引导按 giver/turnIn 补入雷猎户任务入口');
        ok(qs.available(id), '筑基 30 级且主线04完成可以接取');
        if (!main06Done) {
          const normalTalk = qs.talk('hunter_lei');
          ok(!normalTalk.lines.some(line => line.text === strings['secret.quest.intro.offer']), '普通猎户主线对话保持主线06');
        }
        // 从普通猎户菜单选择引导，真实 Scene 对话结束回调接取，不直接写进度。
        view.scene.talkTo('hunter_lei');
        const acceptChoice = last(view.menus)?.find(choice => choice.label === strings['secret.quest.intro.name']);
        ok(acceptChoice && !acceptChoice.disabled, '主线06 active/done 的普通猎户菜单均可选择引导');
        if (!main06Done) ok(last(view.menus)?.some(choice => choice.label !== acceptChoice.label
          && choice.label === QUESTS.q_main_06.name), '引导菜单保留进行中的主线06入口');
        acceptChoice.onSelect();
        eq(last(view.dialogs), [{ speaker: NPCS.hunter_lei.name, text: strings['secret.quest.intro.offer'] }], '真实猎户对话给出引导接取说明');
        ok(last(view.callbacks), '接取对白有真实回调');
        await last(view.callbacks)!(); await p.flushSaves();
        eq(qs.state(id), 'active', '对话结束成功接取');
        eq(qs.accept(id), false, '重复接取不重置任务');
        eq(qs.complete(id), false, '未读路牌前不可交付');

        const beforeRejected = p.exportSave(), rejectedWrites = writes;
        view.scene.player.x = entrance!.x;
        eq(view.scene.tryInteract(), true, '真实入口在引导 active 时给出拒绝');
        eq(view.scene.secretNestRoom, undefined, '未 done 不创建最小房间');
        ok(last(view.dialogs)?.[0]?.text, '未 done 有明确拒绝文案');
        eq(p.exportSave(), beforeRejected, '拒绝入口不改存档');
        eq(writes, rejectedWrites, '拒绝入口不保存');

        view.scene.player.x = sign!.x;
        eq(view.scene.tryInteract(), true, '真实键盘交互可读开态路牌');
        eq(last(view.dialogs), signLines.map(text => ({ speaker: null, text })), '路牌展示既有 sign_a/b/c 原句');
        eq(p.quests[id].reached, true, '真实路牌派发 reach 推进 active intro');
        await p.flushSaves();
        const reached = p.exportSave(), reachedWrites = writes;
        for (let repeat = 0; repeat < 2; repeat++) {
          eq(view.scene.tryInteract(), true, '开态路牌可反复阅读');
          eq(last(view.dialogs), signLines.map(text => ({ speaker: null, text })), '重读三句不变');
        }
        eq(p.exportSave(), reached, '重读不重复推进或产生收益');
        eq(writes, reachedWrites, '已 reach 重读不再保存');
        eq(qs.complete(id), true, '路牌 reach 后可以交付');
        const completed: unknown[] = [];
        qs.onCompleted(reward => completed.push(reward));
        view.scene.talkTo('hunter_lei');
        const turnInChoice = last(view.menus)?.find(choice => choice.label === strings['secret.quest.intro.name']);
        ok(turnInChoice && !turnInChoice.disabled, '主线06 active/done 的普通猎户菜单均可选择交付引导');
        turnInChoice.onSelect();
        eq(last(view.dialogs), [{ speaker: NPCS.hunter_lei.name, text: strings['secret.quest.intro.complete'] }], '真实猎户交付对白命中引导');
        await last(view.callbacks)!(); await p.flushSaves();
        eq(qs.state(id), 'done', '真实 IDB 异步事务交付后为 done');
        eq(completed.length, 1, '只通知一次引导交付');
        eq((completed[0] as { quest: { id: string; rewards: unknown } }).quest.id, id, '交付不会串入主线06');
        eq((completed[0] as { quest: { rewards: unknown } }).quest.rewards, {}, '交付的实际 rewards 为空');
        eq((await saveStore.readSlot(Progress.getActiveSlot()))?.data.quests, p.exportSave().quests, 'done 经过真实异步保存提交');
        eq(withoutIntro(p), baseline, '接取、reach、交付除引导进度外全部资产、boon、日奖不变');
        const doneBefore = p.exportSave(), doneWrites = writes;
        eq(await qs.turnInAsync(id), undefined, '重复交付不产生第二张奖励收据');
        eq(qs.accept(id), false, 'done 不能重接');
        eq(p.exportSave(), doneBefore, '重复接取与交付完整状态不变');
        eq(writes, doneWrites, '重复任务动作不保存');
        eq(p.quests.q_main_06, mainBefore, '主线06状态与目标完全不变');

        // 正式地图点击与键盘路径均执行产品门禁；占位房间只驻留 Scene 内存。
        view.scene.player.x = entrance!.x;
        eq(view.scene.tryInteract(), true, 'done 后真实入口交互成功');
        eq(view.scene.secretNestRoom?.id, 'combat_01', '实际创建最小可玩战斗房 combat_01');
        eq(view.scene.secretNestRoom?.returnPosition, returnPosition, '最小房间记录正式 secret_nest_return');
        eq(view.scene.physics.world.isPaused, true, '占位房间暂停营地物理');
        eq(view.scene.time.paused, true, '占位房间暂停营地延时计时器');
        const exit = view.visuals.find(visual => visual.name === 'secret_nest_run_exit');
        ok(exit?.interactive && exit.events.has('pointerdown'), '可玩房间有真实可点击退出入口');
        eq(p.exportSave(), doneBefore, '进入不创建持久 runId 或改存档位置/收益');
        eq(writes, doneWrites, '最小进巢不写盘');
        exit.events.get('pointerdown')();
        eq(view.scene.secretNestRoom, undefined, '点击退出清除内存房间');
        eq([view.scene.player.x, view.scene.player.y], [campReturn!.x, campReturn!.y], '退出实际回到营地 secret_nest_return');
        eq(view.scene.physics.world.isPaused, false, '退出恢复营地物理');
        eq(view.scene.time.paused, false, '退出恢复营地延时计时器');
        eq(view.physicsEvents, ['pause', 'resume'], '一次进入退出只暂停恢复一次');
        eq(view.transitions, [], '占位进出不重启场景或扩展地图');
        eq(p.exportSave(), doneBefore, 'design/49 软闸关：进巢与退出无资产、boon、日奖或主线变化');
        eq(writes, doneWrites, '最小退出不写盘');

        // 用真实 update 验证单房隔离与三个退出按键；任何外界模拟调用立即失败。
        const outsideSimulation = (): never => { throw new Error('占位房内不得更新营地、遭遇、神识或物理'); };
        view.scene.encounterRuntime.update = outsideSimulation;
        view.scene.sense = { tick: outsideSimulation };
        view.scene.senseUi = { update: outsideSimulation };
        view.scene.updateFrame = outsideSimulation;
        view.scene.advancePlayerPhysics = outsideSimulation;
        view.scene.player.refreshVisuals = outsideSimulation;
        for (const exitKey of ['z', 'up', 'esc'] as const) {
          view.scene.player.x = entrance!.x;
          eq(view.scene.tryInteract(), true, `done 后可重复进巢供 ${exitKey} 退出`);
          view.scene.update(123456, 60000);
          eq(view.scene.secretNestRoom?.id, 'combat_01', '无退出键时 update 只保留可玩房，不运行外界模拟');
          eq(p.exportSave(), doneBefore, '房内经过长帧仍无寿元、任务、资产或存档变化');
          view.scene.keys[exitKey]._justDown = true;
          view.scene.update(123457, 16);
          eq(view.scene.secretNestRoom, undefined, `真实 update 的 ${exitKey} 按键退出房间`);
          eq([view.scene.player.x, view.scene.player.y], [campReturn!.x, campReturn!.y], `${exitKey} 退出回到正式营地落点`);
          eq([view.scene.physics.world.isPaused, view.scene.time.paused], [false, false], `${exitKey} 退出恢复营地物理和计时器`);
          eq(p.exportSave(), doneBefore, `${exitKey} 重复进出不产生收益或持久房间状态`);
          eq(writes, doneWrites, `${exitKey} 房内等待与退出均不写盘`);
        }

        if (main06Done) {
          const incomeBefore = clone([p.level, p.exp, p.stones, p.inventory, p.buffs, p.sectDailyContributionClaims, p.dailyQuestCompletions]);
          const loaded = await Progress.load({ async: true }); progresses.push(loaded);
          const loadedQuests = new QuestSystem(loaded, () => now);
          await loaded.flushSaves();
          eq(loaded.quests[id]?.state, 'done', '真实异步读档保留引导 done');
          eq([loaded.level, loaded.exp, loaded.stones, loaded.inventory, loaded.buffs, loaded.sectDailyContributionClaims, loaded.dailyQuestCompletions],
            incomeBefore, '真实读档不发修为、灵石、物品、boon 或日奖');
          const loadedView = sceneFixture(loaded, loadedQuests), loadedBefore = loaded.exportSave(), loadedWrites = writes;
          eq(loadedView.scene.secretNestRoom, undefined, 'done 读档后不自动创建或恢复内存房间');
          loadedView.scene.tryInteract();
          eq(loadedView.scene.secretNestRoom?.id, 'combat_01', 'done 读档后仍须通过入口门禁重新进巢');
          loadedView.scene.keys.esc._justDown = true;
          loadedView.scene.update(123458, 16);
          eq(loadedView.scene.secretNestRoom, undefined, 'done 读档后的房间可由真实 update 退出');
          eq([loadedView.scene.player.x, loadedView.scene.player.y], [campReturn!.x, campReturn!.y], 'done 读档后退出仍回正式营地落点');
          eq(loaded.exportSave(), loadedBefore, '读档后再次进出不发收益或记录持久房间');
          eq(writes, loadedWrites, '读档后的入口与退出不新增保存');
        }
      }

      // 资格分别隔离：即使旧档 done，也不能绕过等级或境界；高于筑基允许入门。
      for (const entry of [
        { name: '未接取', state: undefined, level: 30, realm: 'foundation', allowed: false },
        { name: '已读未交付', state: 'active', level: 30, realm: 'foundation', allowed: false },
        { name: '不足表等级', state: 'done', level: intro.reqLevel - 1, realm: 'foundation', allowed: false },
        { name: '境界不足', state: 'done', level: intro.reqLevel, realm: 'qi_refining', allowed: false },
        { name: '未知境界', state: 'done', level: intro.reqLevel, realm: '__unknown', allowed: false },
        { name: '高境界', state: 'done', level: 60, realm: 'golden_core', allowed: true },
      ] as const) {
        const { p, qs } = await fixture(true, entry.level);
        if (entry.state) p.quests[id] = { state: entry.state, kills: {}, reached: true };
        const realm = REALMS.find(value => value.id === entry.realm) ?? { id: entry.realm };
        Object.defineProperty(p, 'realm', { configurable: true, get: () => realm });
        const before = p.exportSave(), writesBefore = writes, view = sceneFixture(p, qs);
        const result = enterSecretNest(p, returnPosition);
        eq(result.allowed, entry.allowed, `${entry.name} API 门禁符合资格`);
        if (!result.allowed) ok(result.text.length > 0 && result.text.length <= 40, `${entry.name} 拒绝文案清晰且不超过40字`);
        view.scene.player.x = entrance!.x;
        eq(view.scene.tryInteract(), true, `${entry.name} 走真实入口交互`);
        eq(!!view.scene.secretNestRoom, entry.allowed, `${entry.name} 场景门禁与 API 一致`);
        if (entry.allowed) view.scene.exitSecretNestRoom();
        eq(p.exportSave(), before, `${entry.name} 不改全部持久状态`);
        eq(writes, writesBefore, `${entry.name} 不写盘`);
      }
      for (const withArt of [false, true]) {
        const { p, qs } = await fixture(true), view = sceneFixture(p, qs, withArt);
        p.quests[id] = { state: 'done', kills: {}, reached: true };
        const before = p.exportSave(), writesBefore = writes;
        const clickableObjects: MapObj[] = [sign, entrance];
        for (let objectIndex = 0; objectIndex < clickableObjects.length; objectIndex++) {
          const object: MapObj = clickableObjects[objectIndex];
          view.scene.drawObject(object);
          const visual = view.visuals.find(item => item.name === object!.name);
          ok(visual?.interactive, `${object!.name} art=${withArt} 可点击`);
          visual.events.get('pointerdown')();
          if (object === sign) eq(last(view.dialogs), signLines.map(text => ({ speaker: null, text })), '点击路牌也显示三句开态说明');
          else {
            eq(view.scene.secretNestRoom?.id, 'combat_01', '点击石门实际进入最小可玩战斗房');
            view.scene.exitSecretNestRoom();
          }
        }
        eq(p.exportSave(), before, '有图/无图点击均不产生持久收益');
        eq(writes, writesBefore, '有图/无图点击均不保存');
      }
      const paused = await fixture(true), pausedView = sceneFixture(paused.p, paused.qs);
      paused.p.quests[id] = { state: 'done', kills: {}, reached: true };
      pausedView.scene.physics.world.isPaused = true; pausedView.scene.time.paused = true;
      pausedView.scene.tryInteract();
      eq(pausedView.scene.secretNestRoom?.id, 'combat_01', '原有物理/计时器已暂停时仍可进入可玩房');
      pausedView.scene.exitSecretNestRoom();
      eq([pausedView.scene.physics.world.isPaused, pausedView.scene.time.paused], [true, true], '退出保留营地原有暂停状态');
      eq(pausedView.physicsEvents, [], '不会恢复其它系统持有的物理暂停');
      // 会话关回日倍，保留 soft 机缘清房三选一后的基线 12/20 验收。
      const dailyBonusBefore = featureEnabled('secret_daily_bonus');
      setFeatureFlag('secret_daily_bonus', false);
      try {
        resetSecretNestRunForTests();
        eq(startSecretNest().allowed, false, '无 Progress 参数时 start 仍拒');
        eq(rewardSecretNest().allowed, false, '无局／未清房时 reward 仍拒');
        const wireProg = await fixture(true);
        wireProg.p.quests[id] = { state: 'done', kills: {}, reached: true };
        const wireStart = startSecretNest(wireProg.p, returnPosition);
        eq(wireStart.allowed, true, '资格满足后 startSecretNest 允许最小可玩局');
        eq(rewardSecretNest(wireProg.p).allowed, false, '未清房不可领通关行');
        const cleared = fixtureClearSecretNestMobs();
        eq(cleared.allowed && cleared.cleared, true, '夹具清房成功');
        const hand = getSecretBoonState().pendingHand ?? [];
        eq(hand.length, 3, 'design/49 soft 开闸清房三选一');
        eq(rewardSecretNest(wireProg.p).allowed, false, 'design/49 pending 卡组阻止通关结算');
        ok(chooseSecretBoon(hand[0]!.id), 'design/49 选择真实候选后放行原通关行');
        const stonesBeforeReward = wireProg.p.stones;
        const rewarded = rewardSecretNest(wireProg.p);
        eq(rewarded.allowed, true, '清房后 rewardSecretNest 发放通关行');
        if (rewarded.allowed) {
          eq(rewarded.exp, 12, '通关 exp=12');
          eq(rewarded.stones, 20, '通关 stones=20');
          eq(wireProg.p.stones, stonesBeforeReward + 20, '灵石入账 +20');
        }
        eq(getSecretNestRun()?.rewarded, true, 'run.rewarded');
      } finally {
        setFeatureFlag('secret_daily_bonus', dailyBonusBefore);
        resetSecretNestRunForTests();
      }
    } else {
      // 同一测试文件保留 JSON 内存关态对照，包括遗留 active/reached/done。
      for (const state of ['none', 'active', 'done'] as const) {
        const { p, qs } = await fixture(true);
        if (state !== 'none') p.quests[id] = { state, kills: {}, reached: true };
        const before = p.exportSave(), writesBefore = writes, tips: { tipKey: string }[] = [];
        qs.onBlocked(tip => tips.push(tip));
        eq(qs.available(id), false, '内存关态不可接取');
        eq(qs.accept(id), false, '内存关态 accept 拒绝');
        eq(last(tips)?.tipKey, 'secret.closed.quest_offer', '内存关态 accept tipKey 不变');
        eq(await qs.turnInAsync(id), undefined, '内存关态异步交付拒绝');
        eq(last(tips)?.tipKey, 'secret.closed.quest_progress', '内存关态交付 tipKey 不变');
        qs.onReach('secret_nest_sign');
        eq(qs.complete(id), false, '内存关态不可推进或完成');
        eq(readSecretNestSign().allowed, false, '内存关态路牌 API 关闭');
        eq(enterSecretNest(p, returnPosition), refuseEnter(), '内存关态进巢 API 保留 no_enter 拒绝');
        eq(exitSecretNest({ id: 'secret_nest_gate_stub', returnPosition }), refuseEnter(), '关态伪造内存房间不能绕过门禁');
        eq(startSecretNest(), refuseStart(), '内存关态开局 API 保留 no_start');
        eq(rewardSecretNest(), refuseReward(), '内存关态收益 API 保留 no_reward');
        const view = sceneFixture(p, qs);
        for (const [object, tipKey] of [[sign, 'secret.closed.sign_readable'], [entrance, 'secret.closed.entrance']] as const) {
          view.scene.player.x = object!.x;
          eq(view.scene.tryInteract(), true, '关态真实场景交互仍可阅读说明');
          eq(last(view.logs), strings[tipKey], '关态场景日志保留既有原句');
          eq(last(view.dialogs), [{ speaker: null, text: strings[tipKey] }], '关态场景对白保留既有原句');
          eq(last(view.callbacks), undefined, '关态交互无进入或收益回调');
        }
        view.scene.player.x = 490;
        eq(view.scene.tryInteractSecretNest(), false, '关态营地 return 不抢猎户交互');
        eq(view.scene.secretNestRoom, undefined, '内存关态不建立最小房间');
        eq(view.transitions, [], '内存关态不传送或重启');
        eq(p.exportSave(), before, '内存关态所有请求完整状态零变化');
        eq(writes, writesBefore, '内存关态不写存档');
      }
    }
    eq(JSON.stringify([questsRaw, stringsRaw, campRaw, companionsRaw, flyZonesRaw, npcsRaw]), importedBefore, '测试不修改任何导入表或内存克隆');
    eq(JSON.stringify(QUESTS), runtimeBefore, '测试不伪开或修改运行时 QUESTS');
    eq(featureFlags(), flagsBefore, '测试后恢复全部 feature 会话状态');
    eq(featureEnabled('indexedDbSaves'), true, '测试后 IDB 正式开关仍 true');
    eq(localWrites, 0, '真实异步路径无需 localStorage 写入');
    console.log(JSON.stringify({ suite: 'v06c-open-runtime', dataMode, graph: openFixture ? 'formal-open' : 'memory-closed',
      openFixture, formalOpen: true, closedFixtureOnly: true, passed: true,
      assertions, giftsChecked, indexedDbSaves: true, persistentRewards: false }));
    return { assertions };
  } finally {
    await Promise.all(progresses.map(progress => progress.flushSaves()));
    Progress.setActiveSlot(slotBefore);
    setSaveBackend(createIndexedDbBackend());
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
