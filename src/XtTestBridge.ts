import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { CLASS_LIST } from './classes';
import { ITEMS, QUESTS, TILED_MAPS } from './data';
import { gameNow, setGameTimeSource } from './GameClock';
import { FIELD_TEST } from './config/maps';
import { FEEL } from './config/feel';

type EventType = 'loaderror' | 'console.error' | 'error' | 'unhandledrejection' | 'scene' | 'quest:complete';
type XtEvent = { type: EventType; time: number; data: unknown };
type Listener = (event: XtEvent) => void;
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

/** 此模块只由 VITE_XT_TEST=1 的动态分支加载。 */
export function startTestGame(config: Phaser.Types.Core.GameConfig): Phaser.Game {
  const marker = 'XT_TEST_INTERFACE_V1';
  const pending: XtEvent[] = [];
  const listeners = new Map<string, Set<Listener>>();
  const consoleError = console.error;
  function emit(type: EventType, data: unknown) {
    const event = { type, time: gameNow(), data };
    pending.push(copy(event));
    for (const listener of new Set([...(listeners.get(type) ?? []), ...(listeners.get('*') ?? [])])) {
      try { listener(copy(event)); } catch (error) { consoleError.call(console, error); }
    }
  }
  const describe = (value: unknown): unknown => {
    if (value instanceof Error) return { name: value.name, message: value.message, stack: value.stack ?? '' };
    try { return copy(value); } catch { return String(value); }
  };
  const wrappedError: typeof console.error = (...args) => {
    emit('console.error', args.map(describe));
    consoleError.apply(console, args);
  };
  console.error = wrappedError;
  const onError = (event: ErrorEvent) => emit('error', { message: event.message, filename: event.filename,
    line: event.lineno, column: event.colno, error: describe(event.error) });
  const onRejection = (event: PromiseRejectionEvent) => emit('unhandledrejection', describe(event.reason));
  window.addEventListener('error', onError);
  window.addEventListener('unhandledrejection', onRejection);

  const scene = new GameScene();
  let ready = false, restarting = false;
  let previousMap: string | null = null;
  let unsubscribeQuest: (() => void) | undefined;
  let resolveRestart: (() => void) | undefined;
  const preload = scene.preload.bind(scene);
  scene.preload = () => {
    scene.load.off('loaderror', onLoadError);
    scene.load.on('loaderror', onLoadError);
    scene.load.off('addfile', onAddFile);
    scene.load.on('addfile', onAddFile);
    preload();
  };
  function onLoadError(file: Phaser.Loader.File) {
    emit('loaderror', { key: file.key, type: file.type, url: file.url, src: file.src });
  }
  function onAddFile(_key: string, _type: string, _loader: Phaser.Loader.LoaderPlugin, file: Phaser.Loader.File) {
    // HTTP 成功但图片解码失败时 Phaser 只记录 console.error，补入同一缺图流。
    const processError = file.onProcessError.bind(file);
    file.onProcessError = () => { onLoadError(file); processError(); };
  }
  const create = scene.create.bind(scene);
  scene.create = data => {
    create(data);
    ready = true;
    unsubscribeQuest?.();
    unsubscribeQuest = scene.quests.onCompleted(reward => emit('quest:complete', { id: reward.quest.id, daily: !!reward.daily }));
    emit('scene', { from: previousMap, to: scene.map.id });
    previousMap = scene.map.id;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { ready = false; unsubscribeQuest?.(); });
    resolveRestart?.();
  };
  function current() {
    if (!ready || restarting) throw new Error(`${marker}: game scene is not ready`);
    return scene;
  }
  function persist() {
    if (!scene.prog.setPosition(scene.map.id, scene.player.x, scene.player.y)) throw new Error(`${marker}: save failed`);
    scene.player.hp = scene.prog.hp;
    scene.player.maxHp = scene.prog.maxHp;
    scene.player.syncAppearance();
    scene.skillWindow.refresh();
  }
  async function restart(mapId: string, pos?: { x: number; y: number }) {
    restarting = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`${marker}: scene restart timed out`)), 15000);
        resolveRestart = () => { window.clearTimeout(timeout); resolve(); };
        scene.scene.restart({ map: mapId, pos });
      });
      persist();
    } finally { resolveRestart = undefined; restarting = false; }
  }
  let paused = false, now = Date.now(), anchor = now;
  const readTime = () => paused ? now : now + Date.now() - anchor;
  setGameTimeSource(readTime);
  function settleClock() {
    if (ready) { scene.quests.refreshDaily(); scene.prog.advanceAge(); persist(); }
    return readTime();
  }
  const originalRandom = Math.random;
  const originalRnd = Phaser.Math.RND?.state();
  const api = {
    getState() {
      const s = current(), p = s.prog;
      s.quests.refreshDaily();
      return copy({ mapId: s.map.id, x: s.player.x, y: s.player.y, level: p.level, realm: p.realm.id,
        realmName: p.realmName, hp: p.hp, mp: p.mp, maxHp: p.maxHp, maxMp: p.maxMp,
        inventory: p.inventory, quests: p.quests, questProgress: Object.fromEntries(s.quests.activeIds
          .map(id => [id, s.quests.objectiveProgress(QUESTS[id])])), sect: p.sect, rank: p.sectRank,
        contribution: p.sectContribution, flags: p.flags, time: readTime() });
    },
    async loadSave(obj: unknown) {
      const s = current();
      if (!s.prog.importSave(obj)) throw new Error(`${marker}: invalid save or save failed`);
      s.registry.set('chests', new Set());
      const pos = s.prog.position;
      await restart(pos?.mapId ?? s.map.id, pos ?? undefined);
    },
    exportSave() { current(); persist(); return scene.prog.exportSave(); },
    joinSect(id: string) {
      const s = current(), cls = CLASS_LIST.find(c => c.sect === id);
      if (!cls || !s.prog.advanceClass(cls.id)) throw new Error(`${marker}: sect unavailable: ${id}`);
      persist();
    },
    setRank(rank: string) {
      if (!current().prog.setSectRank(rank)) throw new Error(`${marker}: invalid rank or save failed: ${rank}`);
      persist();
    },
    async teleport(mapId: string, x?: number, y?: number) {
      current();
      if ((!Object.prototype.hasOwnProperty.call(TILED_MAPS, mapId) && mapId !== 'field_test') || (x !== undefined && !finite(x)) || (y !== undefined && !finite(y))) {
        throw new Error(`${marker}: invalid destination`);
      }
      // 单坐标传送的另一轴使用该图 playerStart。
      const fieldRow = FIELD_TEST.rows.findIndex(row => row.includes('P'));
      const spawn = mapId === 'field_test' ? { x: (FIELD_TEST.rows[fieldRow].indexOf('P') + 0.5) * FEEL.tile, y: (fieldRow + 1) * FEEL.tile } : TILED_MAPS[mapId].layers
        .flatMap((layer: { objects?: { type: string; x: number; y: number }[] }) => layer.objects ?? [])
        .find((object: { type: string }) => object.type === 'playerStart') ?? { x: 64, y: 64 };
      await restart(mapId, x !== undefined || y !== undefined ? { x: x ?? spawn.x, y: y ?? spawn.y } : undefined);
    },
    giveItem(id: string, n: number) {
      const p = current().prog;
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id) || !Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(p.count(id) + n)) {
        throw new Error(`${marker}: invalid item or count`);
      }
      p.addItem(id, n); persist();
    },
    acceptQuest(id: string) {
      const s = current();
      if (!s.quests.accept(id)) throw new Error(`${marker}: quest unavailable: ${id}`);
      persist();
    },
    completeQuest(id: string) {
      const s = current(), q = Object.prototype.hasOwnProperty.call(QUESTS, id) ? QUESTS[id] : undefined;
      if (!q) throw new Error(`${marker}: unknown quest: ${id}`);
      if (s.quests.state(id) === 'done') return false;
      if (!s.quests.isActive(id) && !s.quests.accept(id)) throw new Error(`${marker}: quest unavailable: ${id}`);
      for (const { o, cur, need } of s.quests.objectiveProgress(q)) {
        switch (o.type) {
          case 'kill': for (let i = cur; i < need; i++) s.quests.onKill(o.target!); break;
          case 'collect': if (need > cur) s.prog.addItem(o.target!, need - cur); break;
          case 'reach': s.quests.onReach(o.target!); break;
          case 'talk': s.quests.onTalk(o.target!); break;
          case 'craft': if (need > cur) { s.prog.addItem(o.target!, need - cur); s.quests.onCraft(o.target!, need - cur); } break;
          case 'trial': s.quests.onTrialComplete(o.trial!); break;
          case 'breakthrough': {
            while (!s.prog.atBreakthrough && Number.isFinite(s.prog.expNeed)) {
              const before = s.prog.level;
              s.prog.gainCultivation(Math.max(0, s.prog.expNeed - s.prog.exp));
              if (before === s.prog.level && !s.prog.atBreakthrough) break;
            }
            break;
          }
        }
      }
      const reward = s.quests.turnIn(id);
      if (!reward) { persist(); throw new Error(`${marker}: cannot complete quest: ${id}`); }
      s.giveRewards(reward.quest, reward.broke, reward.daily); persist();
      return true;
    },
    setFlag(key: string, val: boolean) {
      if (!current().prog.setConfigFlag(key, val)) throw new Error(`${marker}: invalid flag or save failed`);
      persist();
    },
    clock: {
      pause() { current(); now = readTime(); paused = true; return settleClock(); },
      resume() { current(); now = readTime(); anchor = Date.now(); paused = false; return settleClock(); },
      advance(ms: number) {
        current();
        if (!finite(ms) || ms < 0 || !finite(readTime() + ms) || readTime() + ms > 8.64e15) throw new Error(`${marker}: invalid clock delta`);
        now = readTime() + ms; anchor = Date.now(); return settleClock();
      },
      setNow(ts: number) {
        current();
        if (!finite(ts) || ts <= 0 || ts > 8.64e15) throw new Error(`${marker}: invalid timestamp`);
        now = ts; anchor = Date.now(); return settleClock();
      },
    },
    seed(n: number) {
      current();
      if (!Number.isSafeInteger(n)) throw new Error(`${marker}: invalid seed`);
      let state = n >>> 0;
      Math.random = () => {
        state = (state + 0x6D2B79F5) >>> 0;
        let v = Math.imul(state ^ state >>> 15, 1 | state);
        v ^= v + Math.imul(v ^ v >>> 7, 61 | v);
        return ((v ^ v >>> 14) >>> 0) / 4294967296;
      };
      Phaser.Math.RND.sow([String(n)]);
      persist();
    },
    events: {
      on(type: EventType | '*', fn: Listener) {
        if (typeof fn !== 'function') throw new TypeError(`${marker}: invalid listener`);
        if (!listeners.has(type)) listeners.set(type, new Set());
        listeners.get(type)!.add(fn);
        return () => api.events.off(type, fn);
      },
      off(type: EventType | '*', fn: Listener) { listeners.get(type)?.delete(fn); },
      drain() { return pending.splice(0); },
    },
  };
  (window as Window & { __xt?: typeof api }).__xt = api;
  const game = new Phaser.Game({ ...config, scene: [scene] });
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    unsubscribeQuest?.(); listeners.clear(); pending.length = 0;
    if (console.error === wrappedError) console.error = consoleError;
    window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
    setGameTimeSource(null); Math.random = originalRandom;
    if (originalRnd) Phaser.Math.RND.state(originalRnd);
    delete (window as Window & { __xt?: typeof api }).__xt;
  });
  return game;
}
