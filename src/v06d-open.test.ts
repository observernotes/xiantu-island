import floorsRaw from '@xt/balance/tower_floors.json';
import titlesRaw from '@xt/balance/titles.json';
import stringsRaw from '@xt/balance/strings_zh.json';
import npcsRaw from '@xt/balance/npcs.json';
import companionsRaw from '@xt/balance/companions.json';
import flyZonesRaw from '@xt/balance/fly_zones.json';
import questsRaw from '@xt/balance/quests.json';
import campRaw from '@xt/maps/youying_tower.json';
import { GAME_PHASE, NPCS, type Line } from './data';
import { featureEnabled, featureFlags } from './features';
import { Progress } from './Progress';
import { createIndexedDbBackend, saveStore, setSaveBackend } from './SaveStore';
import * as Closed from './TowerClosed';
import { TowerGate } from './TowerGate';
import { isTowerOpenForFixture } from './TowerOpenFlag';
import { GameScene } from './scenes/GameScene';
import type { MapObj } from './scenes/MapBuilder';

/** 只替换存储介质：真实 IDB 后端仍须等待 transaction.complete 才能发布进度。 */
function memoryIndexedDb() {
  const rows = new Map<IDBValidKey, unknown>(), stores = new Map<string, string>();
  let writes = 0, commits = 0, abortNext = false;
  type Hold = { started: () => void; released: Promise<void> };
  let nextHold: Hold | undefined;
  const factory = {
    open() {
      const request: any = { result: undefined, onupgradeneeded: null, onsuccess: null, onerror: null };
      setTimeout(() => {
        request.result = {
          objectStoreNames: { contains: (name: string) => stores.has(name) },
          createObjectStore(name: string, options: IDBObjectStoreParameters) { stores.set(name, String(options.keyPath)); },
          close() {},
          transaction(storeName: string, mode: IDBTransactionMode = 'readonly') {
            const staged = new Map(rows);
            let pending = 0, finished = false, held = false;
            const tx: any = { error: null, oncomplete: null, onerror: null, onabort: null,
              abort() { if (finished) return; finished = true; tx.error = new DOMException('夹具中止提交', 'AbortError'); tx.onabort?.(); },
              objectStore() {
                const operation = (apply: () => unknown, write = false) => {
                  pending++; if (write) writes++;
                  const req: any = { result: undefined, onsuccess: null, onerror: null };
                  setTimeout(() => {
                    if (finished) return;
                    try { req.result = apply(); req.onsuccess?.(); }
                    catch (error) { tx.error = error; tx.onerror?.(); tx.abort(); return; }
                    pending--; scheduleComplete();
                  }, 0);
                  return req;
                };
                return { transaction: tx,
                  get: (key: IDBValidKey) => operation(() => structuredClone(staged.get(key))),
                  put: (value: Record<string, IDBValidKey>) => operation(() => {
                    const key = value[stores.get(storeName)!]; staged.set(key, structuredClone(value)); return key;
                  }, true),
                  add: (value: Record<string, IDBValidKey>) => operation(() => {
                    const key = value[stores.get(storeName)!];
                    if (staged.has(key)) throw new Error('夹具主键已存在');
                    staged.set(key, structuredClone(value)); return key;
                  }, true),
                  delete: (key: IDBValidKey) => operation(() => staged.delete(key), true),
                };
              },
            };
            const commit = () => {
              if (finished) return;
              if (mode === 'readwrite' && abortNext) { abortNext = false; tx.abort(); return; }
              if (mode === 'readwrite') {
                rows.clear(); for (const [key, value] of staged) rows.set(key, value); commits++;
              }
              finished = true; tx.oncomplete?.();
            };
            const scheduleComplete = () => setTimeout(() => {
              if (finished || pending || held) return;
              if (mode === 'readwrite' && nextHold) {
                const hold = nextHold; nextHold = undefined; held = true;
                hold.started(); void hold.released.then(commit); return;
              }
              commit();
            }, 0);
            scheduleComplete(); return tx;
          },
        };
        if (!stores.size) request.onupgradeneeded?.();
        request.onsuccess?.();
      }, 0);
      return request;
    },
  } as unknown as IDBFactory;
  return { factory, rows, get writes() { return writes; }, get commits() { return commits; },
    abortNextCommit() { abortNext = true; },
    holdNextCommit() {
      let announce!: () => void, release!: () => void;
      const started = new Promise<void>(resolve => { announce = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      nextHold = { started: announce, released };
      return { started, release };
    },
  };
}

/** 四张独立 SSR 图运行同一产品接口；只有内存开态图替换恒 false 的门禁模块。 */
export async function runV06dOpenTests(options: { openFixture: boolean; dataMode?: string }) {
  const { openFixture, dataMode = 'fixture' } = options;
  const label = `${dataMode}/${openFixture ? 'memory-open' : 'formal-closed'}`;
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const clone = <T>(value: T): T => structuredClone(value);
  const allTables = [floorsRaw, titlesRaw, stringsRaw, npcsRaw, companionsRaw, flyZonesRaw, questsRaw, campRaw];
  const tablesBefore = JSON.stringify(allTables), flagsBefore = featureFlags();
  const strings = stringsRaw as unknown as Record<string, string>;
  const objects: MapObj[] = campRaw.layers.flatMap(layer => 'objects' in layer ? layer.objects ?? [] : [])
    .map(object => ({ name: object.name, type: object.type, x: object.x, y: object.y, w: object.width, h: object.height,
      props: Object.fromEntries((object.properties ?? []).map(property => [property.name, property.value])) }));
  const entrance = objects.find(object => object.name === 'tower_climb_entrance');
  ok(entrance, '使用正式地图唯一爬塔入口');
  const returnPosition = { mapId: 'youying_tower', x: entrance.x, y: entrance.y };
  eq(GAME_PHASE, 5, '全局阶段保持 5');
  eq(isTowerOpenForFixture(), openFixture, '门禁只来自当前模块图');
  eq(featureEnabled('indexedDbSaves'), true, '正式 IDB 开关保持 true');
  ok(!Object.keys(flagsBefore).some(key => /tower/iu.test(key)), '不新增塔 feature');
  let giftsChecked = 0;
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    for (const [key, child] of Object.entries(value)) {
      if (key === 'gifts') { giftsChecked++; eq((child as { enabled?: boolean }).enabled, false, '所有 gifts 保持 false'); }
      visit(child);
    }
  };
  visit(npcsRaw); eq(giftsChecked, 10, '核查全部 gifts');

  const slotBefore = Progress.getActiveSlot(), storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const idb = memoryIndexedDb(), progresses: Progress[] = [];
  let localWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem: () => { localWrites++; }, removeItem: () => { localWrites++; },
  } });
  setSaveBackend(createIndexedDbBackend(idb.factory));
  function fixture(highest?: number) {
    const p = new Progress(); progresses.push(p);
    p.level = 30; p.stones = 1234; p.inventory = { hp_pill: 3 }; p.position = clone(returnPosition);
    if (highest !== undefined) p.tower = { highestClearedFloor: highest,
      firstClearClaimed: Array.from({ length: highest }, (_, index) => index + 1),
      titles: [10, 20, 30].filter(floor => floor <= highest).map(floor => `title_tower_${floor}`) };
    return { p, gate: new TowerGate(p) };
  }
  async function waitUntil(done: () => boolean, message: string) {
    for (let count = 0; count < 1000; count++) {
      if (done()) { ok(true, message); return; }
      await new Promise(resolve => setTimeout(resolve, 1));
    }
    ok(false, message);
  }
  function sceneFixture(p: Progress) {
    const logs: string[] = [], dialogs: Line[][] = [], callbacks: unknown[] = [], visuals: any[] = [], transitions: unknown[] = [];
    const physicsEvents: string[] = [];
    function display(kind: string, text?: string): any {
      const events = new Map<string, (...args: any[]) => unknown>(), data = new Map<string, unknown>();
      const visual: any = { kind, text, width: 40, events, destroyed: false,
        setOrigin() { return this; }, setDepth() { return this; }, setStrokeStyle() { return this; },
        setInteractive() { this.interactive = true; return this; }, setScrollFactor() { return this; },
        setVisible() { return this; }, setPosition() { return this; }, setName(name: string) { this.name = name; return this; },
        add() { return this; }, on(event: string, callback: (...args: any[]) => unknown) { events.set(event, callback); return this; },
        setData(key: string, value: unknown) { data.set(key, value); return this; }, getData(key: string) { return data.get(key); },
        destroy() { this.destroyed = true; },
      };
      visuals.push(visual); return visual;
    }
    const world = { isPaused: false };
    const player: any = { x: entrance!.x, y: entrance!.y, dead: false, state2: 'ground',
      body: { setVelocityX() {}, setVelocity() {}, reset(x: number, y: number) { player.x = x; player.y = y; } } };
    const scene: any = Object.assign(Object.create(GameScene.prototype), {
      prog: p, player, travelling: false, interactionPrompts: [], map: { id: 'youying_tower', objects, spawn: returnPosition },
      keys: { z: { _justDown: false }, up: { _justDown: false }, esc: { _justDown: false } },
      scale: { width: 1024, height: 768 }, time: { paused: false }, textures: { exists: () => false },
      cache: { json: { get: () => undefined } }, add: { rectangle: () => display('rectangle'), container: () => display('container'),
        text: (_x: number, _y: number, text: string) => display('text', text) },
      dialog: { open: false, show: (lines: Line[], _speaker: unknown, after: unknown) => { dialogs.push(lines); callbacks.push(after); } },
      log: (text: string) => logs.push(text), closeItemPanels() {}, playerInput: { clear() {} },
      physics: { world, pause() { world.isPaused = true; physicsEvents.push('pause'); },
        resume() { world.isPaused = false; physicsEvents.push('resume'); } },
      scene: { restart: (args: unknown) => transitions.push(args) },
      encounterRuntime: { interact() { throw new Error('爬塔入口必须先于遭遇交互'); } },
    });
    return { scene, logs, dialogs, callbacks, visuals, transitions, physicsEvents };
  }

  try {
    if (!openFixture) {
      for (const highest of [undefined, 0, 10, 20, 30]) {
        const original = fixture(highest);
        eq(await original.p.save({ async: true }), true, '关态旧档先通过正式异步存储保存');
        const p = await Progress.load({ async: true }); progresses.push(p);
        eq(p.tower, original.p.tower, '关态真实读档保留可选塔进度');
        eq(await p.importSave(p.exportSave(), { async: true }), true, '关态真实导入安全接纳旧塔进度');
        eq(p.tower, original.p.tower, '关态导入不补发或清空旧塔记录');
        const gate = new TowerGate(p), before = p.exportSave(), writesBefore = idb.writes;
        // 正式关态要先拒绝，连提交保存或奖励修改的意图也不可传到 Progress。
        for (const method of ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync', 'addItem']) {
          Object.defineProperty(p, method, { configurable: true, value() { throw new Error(`关态禁止调用 ${method}`); } });
        }
        const requests: [() => unknown | Promise<unknown>, () => unknown][] = [
          [() => gate.feature(), Closed.featureClosed], [() => gate.interactEntrance(), Closed.interactEntranceClosed],
          [() => gate.startClimb('tower_climb_entrance', returnPosition), Closed.refuseClimb],
          [() => gate.enterFloor(30), Closed.refuseFloor], [() => gate.clearMob('旧档怪物'), Closed.refuseFloor],
          [() => gate.fixtureClearRemainingMobs(), Closed.refuseFloor], [() => gate.advanceFloor(), Closed.refuseFloor],
          [() => gate.respawnMob('旧档怪物'), Closed.refuseFloor], [() => gate.claimFirstClear(), Closed.refuseReward],
          ...[10, 20, 30].map(floor => [() => gate.unlockTitle(`title_tower_${floor}`), Closed.refuseTitle] as [() => unknown, () => unknown]),
          [() => gate.exitClimb(), Closed.refuseExitOrSaveClimbAdvance], [() => gate.loadProgress(), Closed.refuseLoadRefresh],
        ];
        for (let repeat = 0; repeat < 2; repeat++) for (const [request, expected] of requests) {
          eq(await request(), expected(), '正式 Gate 全 API 与原 Closed tipKey/原文一致');
          eq(gate.session, undefined, '关态请求均不建立会话');
        }
        const view = sceneFixture(p); view.scene.drawObject(entrance);
        const clickable = view.visuals.find(visual => visual.name === entrance.name);
        ok(clickable?.interactive, '关态正式入口可点击查看说明');
        for (const request of [() => view.scene.tryInteractTowerClosed(), () => view.scene.tryInteract(),
          () => clickable.events.get('pointerdown')()]) {
          await request();
          eq(view.dialogs[view.dialogs.length - 1], [{ speaker: null, text: strings['tower.closed.entrance'] },
            { speaker: null, text: strings['tower.closed.feature'] }], '关态邻近、通用和点击仍只说明');
          eq(view.callbacks[view.callbacks.length - 1], undefined, '关态说明不携带开爬回调');
          eq(view.scene.towerGate?.session, undefined, '关态 Scene 不建立会话');
        }
        eq(p.exportSave(), before, '关态全部资产、塔袋与原存档零增量');
        eq(idb.writes, writesBefore, '关态所有 API 不写存储');
        eq(view.transitions, [], '关态不重启或传送');
      }
    } else {
      const route = NPCS.ferry_master.ferryRoutes!.find(route => route.id === 'youying_tower');
      ok(route, '原渡口航线仍存在');
      const ferry = fixture(), choices: any[] = [], transitions: unknown[][] = [];
      const ferryScene: any = Object.assign(Object.create(GameScene.prototype), {
        map: { id: 'luoxia_town', objects: [] }, prog: ferry.p, travelling: false,
        player: { body: { setVelocityX() {} } }, quests: { onTalk() {} }, closeItemPanels() {},
        dialog: { choose: (_line: unknown, _sprite: unknown, options: unknown[]) => choices.push(...options) },
        log() { throw new Error('原免费山门航线不应受爬塔入口影响'); }, travelToMap: async (...args: unknown[]) => transitions.push(args),
      });
      ferryScene.talkTo('ferry_master');
      const ferryChoice = choices.find(choice => choice.label === strings['ferry.route_youying_tower']);
      ok(ferryChoice && !ferryChoice.disabled, '真实免费渡口菜单保留');
      await ferryChoice.onSelect();
      eq(transitions.map(args => args.slice(0, 3)), [['youying_tower', undefined, false]], 'O01 渡口只前往幽影楼山门');
      eq(ferry.gate.session, undefined, 'O01 到山门不自动开爬');
      eq(ferry.p.tower, undefined, '渡口不产生塔进度');

      for (const highest of [0, 10, 20, 30]) {
        const { p, gate } = fixture(highest), before = clone(p.tower);
        eq((await gate.startClimb('youying_tower', returnPosition)).allowed, false, 'O01 渡口 id 不能开爬');
        eq((await gate.startClimb('ferry_master', returnPosition)).allowed, false, 'O01 船老大不是爬塔入口');
        eq((await gate.startClimb('tower_climb_entrance', { ...returnPosition, mapId: 'luoxia_town' })).allowed, false, 'O01 其它地图不可冒充山门入口');
        eq(p.tower, before, '非法入口拒绝不改进度');
        ok((await gate.startClimb('tower_climb_entrance', returnPosition)).allowed, 'O01 正式爬塔入口可开爬');
        eq(gate.session?.floor, Math.max(1, highest - 10), `O02 最高 ${highest} 按表计算起层`);
        const session = gate.session;
        eq((await gate.startClimb('tower_climb_entrance', returnPosition)).allowed, false, '重复开爬不得重建当前层怪物');
        eq(gate.session, session, '重复开爬保持会话');
        eq(p.tower?.firstClearClaimed, before!.firstClearClaimed, 'O02 每日重爬不重置首通');
        ok((await gate.exitClimb()).allowed, 'O08 可中途退出');
        eq(p.tower?.highestClearedFloor, highest, 'O08 未清层退出不额外推进');
        eq(gate.session, undefined, 'O08 退出不自动重开');
      }

      const { p, gate } = fixture(), initialStones = p.stones, initialInventory = clone(p.inventory);
      ok((await gate.startClimb('tower_climb_entrance', returnPosition)).allowed, '全塔链路从真实入口开爬');
      let expectedStones = initialStones, expectedInventory = initialInventory;
      const initialOther = p.exportSave(); delete initialOther.tower; delete initialOther.stones; delete initialOther.inventory; delete initialOther.pillQualities;
      for (const floor of floorsRaw.floors) {
        const number = floor.floor, first = gate.session!;
        eq(first.floor, number, 'O02 真实推进逐层到达且不跳层');
        eq(first.mobs.filter(mob => !mob.isSplitChild).length, floor.mobs.reduce((sum, mob) => sum + mob.count, 0), '按只读正式表创建本层怪物');
        eq((await gate.advanceFloor()).allowed, false, 'O02 怪物未全清不可推进');
        eq((await gate.claimFirstClear()).allowed, false, 'O07 未清层不可提前领首通');
        eq(gate.enterFloor(number === 30 ? 1 : number + 1).allowed, false, '不可由指定层 API 跳层');
        const external = gate.session!; external.mobs[0].alive = false;
        eq(gate.session!.mobs[0].alive, true, '会话快照不可从外部伪造清怪');
        if (number === 30) {
          for (const mob of first.mobs) ok((await gate.clearMob(mob.id)).allowed, 'O06 击杀三十层原体');
          const split = gate.session!, children = split.mobs.filter(mob => mob.isSplitChild);
          eq(children.length, first.mobs.length * floorsRaw.meta.affixDefs.split.childCount, 'O06 每个分裂原体按 meta 产生两个小体');
          ok(children.every(mob => mob.alive && !mob.affixes.includes('split')), 'O06 小体活着且不继承分裂');
          eq(split.cleared, false, 'O06 本体清完而小体未清时不算清层');
          eq(p.tower?.highestClearedFloor, 29, 'O06 小体未清不推进最高层');
          eq((await gate.advanceFloor()).allowed, false, 'O06 小体未清不得推进');
          eq((await gate.claimFirstClear()).allowed, false, 'O06 小体未清不得结算');
          eq(gate.unlockTitle('title_tower_30').allowed, false, 'O06 小体未清不授三十层称号');
          for (const child of children.slice(0, -1)) ok((await gate.clearMob(child.id)).allowed, 'O06 清掉除最后一只外的小体');
          eq(gate.session!.mobs.length, split.mobs.length, 'O06 小体死亡不再分裂');
          eq((await gate.claimFirstClear()).allowed, false, 'O06 尚余一小体仍不得结算');
          eq(gate.session!.cleared, false, 'O06 尚余一小体仍不清层');
        } else {
          for (const mob of first.mobs.slice(0, -1)) ok((await gate.clearMob(mob.id)).allowed, 'O02 可控清怪走真实 API');
        }
        const lastMob = gate.session!.mobs.find(mob => mob.alive)!;
        if (number === 10) {
          const before = p.exportSave(), beforeSession = gate.session, stored = (await saveStore.readSlot(Progress.getActiveSlot()))!.data;
          const hold = idb.holdNextCommit();
          const pending = gate.clearMob(lastMob.id);
          await hold.started;
          eq(p.exportSave(), before, 'O07 IDB complete 前不发布奖励、首通或称号');
          eq(gate.session, beforeSession, 'O07 IDB complete 前最后怪物仍未死亡');
          eq((await saveStore.readSlot(Progress.getActiveSlot()))!.data, stored, 'O07 request 成功但 complete 前存储仍为旧完整状态');
          eq((await gate.claimFirstClear()).allowed, false, 'O07 提交期间拒绝重复结算');
          idb.abortNextCommit(); hold.release();
          eq((await pending).allowed, false, 'O07 transaction abort 报失败');
          eq(p.exportSave(), before, 'O07 abort 不增奖励、首通、称号或最高层');
          eq(gate.session, beforeSession, 'O07 abort 保持最后怪物可重试');
          eq((await saveStore.readSlot(Progress.getActiveSlot()))!.data, stored, 'O07 abort 不覆盖原存档');
        }
        const writesBefore = idb.writes;
        ok((await gate.clearMob(lastMob.id)).allowed, 'O02 最后一怪死亡触发真实原子结算');
        eq(idb.writes - writesBefore, 1, 'O07 最后一怪的奖励与首通只写一笔事务');
        eq(gate.session?.cleared, true, '全部怪物及小体清完才清层');
        eq(p.tower?.highestClearedFloor, number, '最高通层只保存已完成层');
        eq(p.tower?.firstClearClaimed, Array.from({ length: number }, (_, index) => index + 1), '首通标记连续且每层一次');
        expectedStones += floor.firstClearRewards.spirit_stone;
        for (const item of floor.firstClearRewards.items) expectedInventory[item.item] = (expectedInventory[item.item] ?? 0) + item.count;
        eq(p.stones, expectedStones, '按正式 spirit_stone 真正增加 Progress.stones');
        eq(p.inventory, expectedInventory, '按正式首通物品真正增加 Progress.inventory');
        for (const item of floor.firstClearRewards.items) {
          if ('quality' in item && item.quality === 'high') {
            const received = floorsRaw.floors.filter(entry => entry.floor <= number)
              .flatMap(entry => entry.firstClearRewards.items).filter(entry => entry.item === item.item)
              .reduce((sum, entry) => sum + entry.count, 0);
            eq(p.pillQualityCounts(item.item).high, received, '首通高品质丹药按正式 quality 保存高品质桶');
            eq(p.pillQualityCounts(item.item).low, 0, '首通高品质丹药不会降成低品质');
          }
        }
        const saved = (await saveStore.readSlot(Progress.getActiveSlot()))!.data;
        eq([saved.tower, saved.stones, saved.inventory, saved.pillQualities], [p.tower, p.stones, p.inventory, p.pillQualities], 'O07 奖励、品质和首通/称号在同一已提交存档中');
        const rewarded = p.exportSave(), repeatWrites = idb.writes, deadSnapshot = gate.session;
        eq((await gate.clearMob(lastMob.id)).allowed, false, 'O06 已死怪不能再次击杀');
        eq(gate.respawnMob(lastMob.id).allowed, false, 'O06 respawn=false 已死怪不得复活');
        gate.enterFloor(number);
        eq(gate.session, deadSnapshot, 'O06 重入当前层不会重建已死怪物');
        await gate.claimFirstClear(); await gate.claimFirstClear();
        eq(p.exportSave(), rewarded, 'O03–O07 重复结算不重复发奖');
        eq(idb.writes, repeatWrites, 'O07 重复结算不新增保存');
        if ([10, 20, 30].includes(number)) {
          const titleId = `title_tower_${number}`, title = titlesRaw.find(title => title.id === titleId)!;
          const unlocked = gate.unlockTitle(titleId);
          ok(unlocked.allowed, `O03–O05 ${number} 层正式称号已解锁`);
          eq(unlocked.allowed && unlocked.title, { id: title.id, name: title.name, desc: title.desc }, '展示从 titles 与 strings 查正式名称描述');
          eq(title.name, strings[`title.tower_${number}.name`], '称号不用 tower_floors 旧占位名');
          gate.unlockTitle(titleId); gate.unlockTitle(titleId);
          eq(p.tower?.titles.filter(id => id === titleId).length, 1, 'O03–O07 称号按 id 去重');
          const loaded = await Progress.load({ async: true }); progresses.push(loaded);
          eq([loaded.tower, loaded.stones, loaded.inventory, loaded.pillQualities], [p.tower, p.stones, p.inventory, p.pillQualities], 'O07 真正异步读档保留塔袋、品质与奖励');
          const loadedGate = new TowerGate(loaded), loadedBefore = loaded.exportSave();
          ok(loadedGate.loadProgress().allowed, 'O07 开态可读取已有进度');
          eq(loadedGate.session, undefined, 'O08 读档不自动续爬或重开');
          await loadedGate.claimFirstClear();
          eq(loaded.exportSave(), loadedBefore, 'O07 读档与无会话领奖不补发资产或称号');
          const imported = fixture().p;
          eq(await imported.importSave(JSON.parse(JSON.stringify(p.exportSave())), { async: true }), true, '可选塔字段通过真实 validSaveData + importSave');
          eq([imported.tower, imported.stones, imported.inventory, imported.pillQualities], [p.tower, p.stones, p.inventory, p.pillQualities], 'O07 导入保存再读回保持首通、品质及收益一致');
        }
        if (number < 30) {
          ok((await gate.advanceFloor()).allowed, 'O02 清层后才允许下一层');
          eq(gate.session?.floor, number + 1, 'O02 至少 1→2 且全程逐层推进');
        }
      }
      const completeBefore = p.exportSave();
      eq(gate.session?.completed, true, 'O05 三十层及小体全清后通塔');
      await gate.advanceFloor(); await gate.advanceFloor();
      eq(gate.session?.floor, 30, 'O05 通塔后无第 31 层');
      eq(p.exportSave(), completeBefore, '通塔重复推进无收益或额外层数');
      const other = p.exportSave(); delete other.tower; delete other.stones; delete other.inventory; delete other.pillQualities;
      eq(other, initialOther, '全塔首通不修改任务、等级、buff、其它玩法与位置');
      const completeView = sceneFixture(p);
      completeView.scene.towerGate = gate; completeView.scene.enterTowerRoom();
      ok(completeView.visuals.some(visual => visual.text === '三十层妖物已清，通塔完成。'), 'O05 真实房间展示通塔完成');
      ok(await completeView.scene.exitTowerRoom(), 'O08 通塔后经真实 Scene 和 Gate 退出成功');
      eq([completeView.scene.player.x, completeView.scene.player.y], [returnPosition.x, returnPosition.y], 'O08 通塔 Scene 实际回落到入口山门坐标');
      eq([completeView.scene.physics.world.isPaused, completeView.scene.time.paused], [false, false], 'O08 通塔退出恢复山门控制与计时器');
      eq(gate.session, undefined, 'O08 通塔退出清会话不自动重开');
      const afterExit = p.exportSave(); delete afterExit.position;
      const beforeExit = clone(completeBefore); delete beforeExit.position;
      eq(afterExit, beforeExit, 'O08 退出只回落，不补奖或额外推进');
      const loaded = await Progress.load({ async: true }); progresses.push(loaded);
      eq([loaded.tower, loaded.stones, loaded.inventory, loaded.position], [p.tower, p.stones, p.inventory, returnPosition], 'O08 通塔退出存读档进度和回落点一致');
      const reClimb = new TowerGate(loaded), repeatBefore = clone([loaded.stones, loaded.inventory, loaded.tower?.firstClearClaimed, loaded.tower?.titles]);
      ok((await reClimb.startClimb('tower_climb_entrance', returnPosition)).allowed, 'O02/O07 读档后可重爬');
      eq(reClimb.session?.floor, 20, 'O02 通塔后重爬从二十层开始');
      ok((await reClimb.fixtureClearRemainingMobs()).allowed, '可控清层助手仍走产品 Gate');
      eq([loaded.stones, loaded.inventory, loaded.tower?.firstClearClaimed, loaded.tower?.titles], repeatBefore, 'O07 重爬已首通层不重发任何奖励或称号');
      await reClimb.advanceFloor(); await reClimb.exitClimb();
      eq(loaded.tower?.highestClearedFloor, 30, 'O08 二十一层未清退出不改变原最高三十层');

      // 中途退出覆盖已清首层、第二层尚未清完，并验证正常保存不会把房间写进档。
      const mid = fixture(); await mid.gate.startClimb('tower_climb_entrance', returnPosition);
      await mid.gate.fixtureClearRemainingMobs(); await mid.gate.advanceFloor();
      await mid.gate.clearMob(mid.gate.session!.mobs[0].id);
      const midBefore = clone([mid.p.tower, mid.p.stones, mid.p.inventory]);
      ok(await mid.p.save({ async: true }), 'O08 中途普通异步保存成功');
      const midLoaded = await Progress.load({ async: true }); progresses.push(midLoaded);
      eq([midLoaded.tower, midLoaded.stones, midLoaded.inventory], midBefore, 'O08 中途读档只保留完成第一层的收益');
      eq(new TowerGate(midLoaded).session, undefined, 'O08 中途存档不恢复怪物或进行中流程');
      await mid.gate.exitClimb();
      eq([mid.p.tower, mid.p.stones, mid.p.inventory], midBefore, 'O08 第二层未清退出不补奖或标记首通');
      eq(mid.p.position, returnPosition, 'O08 中途退出记录实际山门落点');

      // 可选字段兼容旧档；畸形塔袋由生产 SaveStore 校验和 importSave 一致拒绝。
      const old = fixture().p, oldSave = old.exportSave();
      eq(Object.prototype.hasOwnProperty.call(oldSave, 'tower'), false, '旧档默认无塔字段');
      eq(await old.importSave(oldSave, { async: true }), true, '缺省塔字段的旧档可导入');
      eq(old.tower, undefined, '旧档导入不造首通、称号或会话');
      const valid = { highestClearedFloor: 10, firstClearClaimed: [1, 10], titles: ['title_tower_10'], returnPosition };
      const invalid = [null, [], { ...valid, highestClearedFloor: 31 }, { ...valid, highestClearedFloor: -1 },
        { ...valid, highestClearedFloor: '10' }, { ...valid, highestClearedFloor: NaN },
        { ...valid, firstClearClaimed: [1, 1] }, { ...valid, firstClearClaimed: [11] },
        { ...valid, titles: ['title_tower_10', 'title_tower_10'] }, { ...valid, titles: ['unknown_title'] },
        { ...valid, returnPosition: { ...returnPosition, x: Infinity } },
        { ...valid, returnPosition: { ...returnPosition, mapId: 'luoxia_town' } }, { ...valid, session: { floor: 30 } }];
      for (const tower of invalid) {
        const before = old.exportSave(), writesBefore = idb.writes;
        eq(await old.importSave({ ...oldSave, tower }, { async: true }), false, '安全校验拒绝畸形/重复/越界塔存档');
        eq(await saveStore.writeSlot(3, { ...oldSave, tower }), false, 'SaveStore 使用相同生产 validSaveData 拒绝畸形塔袋');
        eq(old.exportSave(), before, '无效导入保留原角色');
        eq(idb.writes, writesBefore, '无效导入不写存储');
      }

      // 显示与物理只用替身，键盘、点击、房间暂停与 Gate 退出均执行真实 GameScene。
      for (const via of ['direct', 'generic', 'pointer'] as const) {
        const sample = fixture(), view = sceneFixture(sample.p);
        if (via === 'direct') ok(await view.scene.interactTowerEntrance(), 'O01 真实 Scene 入口开爬');
        else if (via === 'generic') eq(view.scene.tryInteract(), true, 'O01 通用交互先消费爬塔入口');
        else {
          view.scene.drawObject(entrance);
          const clickable = view.visuals.find(visual => visual.name === entrance.name);
          ok(clickable?.interactive, 'O01 正式入口视图可点击');
          clickable.events.get('pointerdown')();
        }
        await waitUntil(() => !!view.scene.towerRoomView, '入口异步保存后创建占位房');
        eq(view.scene.towerGate.session.floor, 1, 'O01 Scene 按 Gate 起层');
        eq(view.scene.towerRoomView.name, 'tower_room_stub', '占位房驻留 Scene 内存');
        eq([view.scene.physics.world.isPaused, view.scene.time.paused], [true, true], 'O08 房内暂停山门物理和计时器');
        ok(view.visuals.some(visual => visual.text === '锁妖塔·第 1 层'), '占位房显示当前真实层数');
        const before = sample.p.exportSave();
        eq(await view.scene.advanceTowerRoom(), false, 'O02 未清怪的 Scene 下一层仍被 Gate 拦截');
        if (via === 'direct') {
          await view.scene.towerGate.fixtureClearRemainingMobs();
          ok(await view.scene.advanceTowerRoom(), 'O02 Scene 经真实清层后可进入第二层');
          eq(view.scene.towerGate.session.floor, 2, 'O02 Scene 成功推进真实 1→2');
          ok(view.visuals.some(visual => visual.text === '锁妖塔·第 2 层'), 'O02 推进后房间显示真实第二层');
        }
        const roomBefore = sample.p.exportSave();
        const outside = (): never => { throw new Error('塔房内不得运行外界模拟'); };
        view.scene.encounterRuntime.update = outside; view.scene.updateFrame = outside; view.scene.advancePlayerPhysics = outside;
        view.scene.sense = { tick: outside }; view.scene.senseUi = { update: outside }; view.scene.player.refreshVisuals = outside;
        view.scene.update(100000, 60000);
        eq(sample.p.exportSave(), roomBefore, 'O08 房内长帧不会额外推进、补奖或存档');
        if (via === 'pointer') {
          const exitVisual = [...view.visuals].reverse().find(visual => visual.name === 'tower_stub_exit');
          ok(exitVisual?.interactive, 'O08 房内出口真实可点击'); exitVisual.events.get('pointerdown')();
        } else {
          view.scene.keys[via === 'direct' ? 'z' : 'up']._justDown = true;
          view.scene.update(100001, 16);
        }
        await waitUntil(() => !view.scene.towerGate?.session && !view.scene.towerRoomView, 'O08 点击或真实按键异步退出完成');
        eq([view.scene.player.x, view.scene.player.y], [entrance.x, entrance.y], 'O08 Scene 实际回落到入口坐标');
        eq([view.scene.physics.world.isPaused, view.scene.time.paused], [false, false], 'O08 退出恢复控制与计时器');
        eq(view.physicsEvents, ['pause', 'resume'], 'O08 房间持有并释放一次暂停');
        eq(sample.p.tower?.highestClearedFloor, via === 'direct' ? 1 : 0, 'O08 Scene 退出仅保留已经完成的层');
        eq(view.transitions, [], '占位房进出无需重启场景');
      }
      const paused = fixture(), view = sceneFixture(paused.p);
      view.scene.physics.world.isPaused = true; view.scene.time.paused = true;
      await view.scene.interactTowerEntrance();
      view.scene.keys.esc._justDown = true;
      view.scene.update(100002, 16);
      // 先由 Esc 单独触发退出，再模拟异步保存期间新增的三键残留。
      for (const key of ['z', 'up', 'esc']) view.scene.keys[key]._justDown = true;
      await waitUntil(() => !view.scene.towerRoomView, 'O08 Esc 可退出原已暂停场景的塔房');
      eq([view.scene.physics.world.isPaused, view.scene.time.paused], [true, true], '退出保留其它系统原有暂停');
      eq(view.physicsEvents, [], '退出不会释放其它系统的暂停所有权');
      eq(['z', 'up', 'esc'].map(key => view.scene.keys[key]._justDown), [false, false, false], '退出消费全部残留按键，防止回山门后自动重开');
    }

    eq(JSON.stringify(allTables), tablesBefore, '所有导入表内存对象完全不变');
    eq(featureFlags(), flagsBefore, '全程不修改任何 feature');
    eq(GAME_PHASE, 5, '所有 API 完成后 GAME_PHASE 仍为 5');
    eq(localWrites, 0, '真实 IDB 异步事务无 localStorage 写入');
    console.log(JSON.stringify({ suite: 'v06d-open-runtime', dataMode, openFixture, assertions, giftsChecked,
      cases: openFixture ? ['O01', 'O02', 'O03', 'O04', 'O05', 'O06', 'O07', 'O08'] : ['formal-closed-all-api'],
      idbWrites: idb.writes, idbCommits: idb.commits, formalOpen: false, memoryOpenOnly: true, localWrites }));
    return { assertions, idbWrites: idb.writes, idbCommits: idb.commits, giftsChecked };
  } finally {
    await Promise.all(progresses.map(progress => progress.flushSaves()));
    Progress.setActiveSlot(slotBefore); setSaveBackend(createIndexedDbBackend());
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
