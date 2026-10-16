import Phaser from 'phaser';
import { GameScene } from './scenes/GameScene';
import { CLASS_LIST } from './classes';
import { ITEMS, MONSTERS, QUEST_HOOKS, QUESTS, SENSE, TILED_MAPS } from './data';
import { gameNow, setGameTimeSource } from './GameClock';
import { FIELD_TEST } from './config/maps';
import { FEEL } from './config/feel';
import { applySpriteArt, spriteArtSpec, type SpriteArtSpec } from './SpriteArt';
import { MAP_AREA } from './data';
import type { BackgroundConfig } from './scenes/BackgroundArt';
import type { EnvironmentArtConfig } from './scenes/EnvironmentArt';
import { SPEC } from './config/feel';
import { featureFlags, isFeatureName, setFeatureFlag } from './features';
import type { DialogChoice } from './UI';
import { TalismanScene } from './scenes/TalismanScene';
import { TalismanPanel, type TalismanPanelAction, type TalismanPanelState } from './TalismanPanel';
import { installCrashGuard } from './crashGuard';
import type { SkillVolley } from './scenes/Monster';
import { getRendererInfo, recordRendererChoice, type RendererChoice } from './rendererChoice';
import { fixedStepTestProbe } from './FixedStepTestProbe';

type EventType = 'loaderror' | 'console.error' | 'error' | 'unhandledrejection' | 'scene' | 'quest:complete'
  | 'sense:scan' | 'sense:intel-expired' | 'sense:blocked';
type XtEvent = { type: EventType; time: number; data: unknown };
type Listener = (event: XtEvent) => void;
type SourceTileSprite = Phaser.GameObjects.TileSprite & { displayTexture: Phaser.Textures.Texture; displayFrame: Phaser.Textures.Frame };
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const finite = (n: number) => typeof n === 'number' && Number.isFinite(n);

/** 此模块只由 VITE_XT_TEST=1 的动态分支加载。 */
export function startTestGame(config: Phaser.Types.Core.GameConfig, rendererChoice: RendererChoice): Phaser.Game {
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
  const query = new URLSearchParams(location.search);
  const renderHz = Number(query.get('xtRenderHz') ?? 60);
  const manualLoop = query.get('xtManualLoop') === '1';
  const fixedStep = fixedStepTestProbe(scene, renderHz, manualLoop);
  let talismanPanel: TalismanPanel;
  const talismanActions: TalismanPanelAction[] = [];
  let ready = false, restarting = false;
  let sceneGeneration = 0, updateCalls = 0, queuedVolleys = 0, injectedUpdateErrors = 0;
  let previousMap: string | null = null;
  let unsubscribeQuest: (() => void) | undefined;
  let resolveRestart: (() => void) | undefined;
  const senseFixtureNames = { chest: 'xt_sense_chest', hiddenChest: 'xt_sense_hidden_chest', platform: 'xt_sense_platform', monster: 'xt_sense_monster' };
  let senseFixtureMap: string | undefined;
  type SenseFixturePlatform = { x: number; y: number; w: number; h: number };
  function senseFixtureClearance(s: GameScene, platform: SenseFixturePlatform) {
    // 留出玩家宽度、两倍身高的下落空间，以及完整地砖高度；同时避开原地形上方的站立区。
    const area = { left: platform.x - SPEC.bodyW / 2, right: platform.x + platform.w + SPEC.bodyW / 2,
      top: platform.y - SPEC.bodyH * 2, bottom: platform.y + Math.max(FEEL.tile, platform.h, SPEC.oneWayEdge) };
    const collisions = (['solids', 'oneWays'] as const).flatMap(kind => s.map[kind].getChildren()
      .filter(object => object.name !== `sense-platform:${senseFixtureNames.platform}`)
      .map(object => {
        const body = object.body as Phaser.Physics.Arcade.StaticBody;
        const bounds = { left: body.left, right: body.right, top: body.top, bottom: body.bottom };
        return { kind, name: object.name, enabled: body.enable, bounds,
          landingArea: { ...bounds, top: body.top - SPEC.bodyH } };
      }));
    const overlaps = collisions.filter(({ landingArea: bounds }) => area.left < bounds.right && area.right > bounds.left
      && area.top < bounds.bottom && area.bottom > bounds.top);
    return { area, checkedBodies: collisions.length, overlaps };
  }
  function senseFixturePlatform(s: GameScene): SenseFixturePlatform {
    // 青云村首选 [32, 189] / y584，完全绕开 x224 起的原单向平台；非整格宽度覆盖末格对齐。
    const platform = { x: FEEL.tile, y: s.map.spawn.y - 120, w: 157, h: 12 };
    for (let y = platform.y; y >= SPEC.bodyH * 2; y -= FEEL.tile) {
      for (let x = FEEL.tile; x + platform.w + SPEC.bodyW / 2 <= s.map.width; x += FEEL.tile) {
        const candidate = { ...platform, x, y }, clearance = senseFixtureClearance(s, candidate);
        if (clearance.area.top >= 0 && clearance.area.bottom <= s.map.height && clearance.overlaps.length === 0) return candidate;
      }
    }
    throw new Error(`${marker}: no clear sense platform fixture position`);
  }
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
    fixedStep.attach();
    sceneGeneration++;
    queuedVolleys = 0; injectedUpdateErrors = 0;
    talismanActions.length = 0;
    talismanPanel = new TalismanPanel(scene, action => {
      talismanActions.push(action);
      if (action === 'close') talismanPanel.close();
    });
    ready = true;
    unsubscribeQuest?.();
    unsubscribeQuest = scene.quests.onCompleted(reward => emit('quest:complete', { id: reward.quest.id, daily: !!reward.daily }));
    for (const name of ['sense:scan', 'sense:intel-expired', 'sense:blocked'] as const) {
      const listener = (result: unknown) => emit(name, result);
      scene.events.on(name, listener);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => scene.events.off(name, listener));
    }
    emit('scene', { from: previousMap, to: scene.map.id });
    previousMap = scene.map.id;
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => { ready = false; unsubscribeQuest?.(); });
    resolveRestart?.();
  };
  // 私有战斗状态只在这个测试构建模块内读取，正式构建不会包含这些钩子。
  type ShotRuntime = {
    launchVolley(volley: SkillVolley): void;
    impactShot(shot: ShotRuntime['shots'][number], hitPlayer: boolean): void;
    shots: { sprite: Phaser.Physics.Arcade.Sprite }[];
    shotOf: Map<Phaser.GameObjects.GameObject, unknown>;
    shotGroup?: Phaser.Physics.Arcade.Group;
  };
  const shotRuntime = () => scene as unknown as ShotRuntime;
  function launchTestVolley() {
    const player = scene.player;
    shotRuntime().launchVolley({ fx: 'xt_freeze_fixture_missing', maxDist: 240, ratio: 0.01,
      knockback: 0, atk: 1, shots: [{ x: player.x + 300, y: player.y - 100, vx: -120, vy: 0 }] });
  }
  const update = scene.update.bind(scene);
  scene.update = (time, delta) => {
    updateCalls++;
    if (injectedUpdateErrors > 0) {
      injectedUpdateErrors--;
      throw new Error(`${marker}: injected update failure`);
    }
    while (queuedVolleys > 0) { queuedVolleys--; launchTestVolley(); }
    update(time, delta);
  };
  function current() {
    if (!ready || restarting) throw new Error(`${marker}: game scene is not ready`);
    return scene;
  }
  async function persist() {
    // 场景重建会先提交地图访问等事务，落点保存须等该笔槽提交结束。
    await scene.prog.flushSaves();
    if (!await scene.prog.setPosition(scene.map.id, scene.player.x, scene.player.y, { async: true })) throw new Error(`${marker}: save failed`);
    scene.player.hp = scene.prog.hp;
    scene.player.maxHp = scene.prog.maxHp;
    scene.player.syncAppearance();
    scene.skillWindow.refresh();
  }
  async function restart(mapId: string, pos?: { x: number; y: number }) {
    if (scene.scene.isActive('talisman-craft-ui')) scene.scene.stop('talisman-craft-ui');
    restarting = true;
    try {
      await new Promise<void>((resolve, reject) => {
        const timeout = window.setTimeout(() => reject(new Error(`${marker}: scene restart timed out`)), 15000);
        resolveRestart = () => { window.clearTimeout(timeout); resolve(); };
        scene.scene.restart({ map: mapId, pos });
      });
      await persist();
    } finally { resolveRestart = undefined; restarting = false; }
  }
  let paused = false, now = Date.now(), anchor = now;
  const readTime = () => paused ? now : now + Date.now() - anchor;
  setGameTimeSource(readTime);
  async function settleClock() {
    if (ready) { scene.quests.refreshDaily(); scene.prog.advanceAge(); await persist(); }
    return readTime();
  }
  const originalRandom = Math.random;
  const originalRnd = Phaser.Math.RND?.state();
  const api = {
    fixedStep,
    get errors() { return copy(crashGuard.errors); },
    guardState() { return copy(crashGuard.getState()); },
    rendererSnapshot() {
      const s = current();
      return { ...getRendererInfo(s.game), debugVisible: s.debugText.visible,
        debugText: s.debugText.text, startup: { ...rendererChoice } };
    },
    loopSnapshot() {
      const s = current(), shots = shotRuntime();
      return { frame: s.game.loop.frame, updateCalls, sceneGeneration, mapId: s.map.id,
        x: s.player.x, y: s.player.y, shots: shots.shots.length, shotOf: shots.shotOf.size,
        liveShots: shots.shots.filter(shot => shot.sprite.active && !!shot.sprite.body).length,
        groupAlive: !!shots.shotGroup?.children,
        groupInCurrentWorld: shots.shotGroup?.world === s.physics.world,
        queuedVolleys, injectedUpdateErrors };
    },
    fireVolley({ inUpdate = true }: { inUpdate?: boolean } = {}) {
      current();
      if (inUpdate) queuedVolleys++;
      else launchTestVolley();
    },
    injectUpdateError(n: number) {
      current();
      if (!Number.isInteger(n) || n < 0 || n > 10000) throw new Error(`${marker}: invalid error count`);
      injectedUpdateErrors = n;
    },
    invalidateShot(kind: 'sprite' | 'body') {
      current();
      const runtime = shotRuntime(), shot = runtime.shots[runtime.shots.length - 1];
      if (!shot) throw new Error(`${marker}: no projectile to invalidate`);
      if (kind === 'sprite') shot.sprite.destroy();
      else if (kind === 'body') {
        runtime.shotGroup?.remove(shot.sprite);
        shot.sprite.body?.destroy();
        (shot.sprite as unknown as { body: null }).body = null;
      } else throw new Error(`${marker}: invalid projectile fixture`);
      // 同时覆盖 collider 已排队、sprite 却已被外部销毁的 impact 路径。
      runtime.impactShot(shot, false);
    },
    injectCallbackError(source: 'collider' | 'render') {
      const s = current();
      const fail = () => { throw new Error(`${marker}: injected ${source} failure`); };
      if (source === 'render') s.game.events.once(Phaser.Core.Events.PRE_RENDER, fail);
      else if (source === 'collider') {
        const trigger = s.physics.add.image(s.player.x, s.player.y, '__WHITE').setVisible(false);
        trigger.body.setAllowGravity(false).setSize(s.player.width + 40, s.player.height + 40);
        const collider = s.physics.add.overlap(s.player, trigger, () => {
          collider.destroy(); trigger.destroy(); fail();
        });
        s.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
          if (collider.active) collider.destroy();
          if (trigger.scene) trigger.destroy();
        });
      } else throw new Error(`${marker}: invalid callback source`);
    },
    art: {
      snapshot() {
        const s = current(), p = s.player, b = p.body;
        const labels: { text: string; x: number; y: number; depth: number }[] = [];
        const visit = (objects: Phaser.GameObjects.GameObject[], x = 0, y = 0, depth = 0) => {
          for (const obj of objects) {
            if (obj instanceof Phaser.GameObjects.Container) visit(obj.list, x + obj.x, y + obj.y, obj.depth);
            else if (obj instanceof Phaser.GameObjects.Text) labels.push({ text: obj.text, x: x + obj.x, y: y + obj.y, depth: depth || obj.depth });
          }
        };
        visit(s.children.list);
        return copy({ player: { key: p.texture.key, x: p.x, y: p.y, frame: p.frame.name,
          frameSize: spriteArtSpec(p).frameSize, origin: [p.originX, p.originY], displayScale: p.scaleX,
          displayHeight: p.displayHeight, feet: p.feet, body: { x: b.x, y: b.y, width: b.width, height: b.height, bottom: b.bottom } },
          tiles: s.children.list.filter((object): object is Phaser.Tilemaps.TilemapLayer => object instanceof Phaser.Tilemaps.TilemapLayer)
            .flatMap(layer => layer.layer.data.flatMap(row => row.filter(tile => tile.index >= 0).map(tile => ({ x: tile.x, y: tile.y, index: tile.index })))),
          climbables: s.children.list.filter((object): object is Phaser.GameObjects.TileSprite | Phaser.GameObjects.Image =>
            (object instanceof Phaser.GameObjects.TileSprite || object instanceof Phaser.GameObjects.Image) && object.depth === -1)
            .map(object => ({ x: object.x, y: object.y, height: object.height,
              key: object instanceof Phaser.GameObjects.TileSprite ? (object as SourceTileSprite).displayTexture.key : object.texture.key,
              frame: object instanceof Phaser.GameObjects.TileSprite ? (object as SourceTileSprite).displayFrame.name : object.frame.name })),
          collision: [s.map.solids, s.map.oneWays].map(group => group.getChildren().map(object => {
            const body = object.body as Phaser.Physics.Arcade.StaticBody;
            return { x: body.x, y: body.y, width: body.width, height: body.height };
          })),
          labels, backgrounds: s.backgroundArt?.snapshot() ?? s.parallax.map(({ ts, f }) => ({ key: (ts as SourceTileSprite).displayTexture.key, width: ts.width, depth: ts.depth, factorX: f, y: ts.y })),
          environment: s.environmentArt?.snapshot(), fps: s.game.loop.actualFps });
      },
      configureEnvironment(config: EnvironmentArtConfig | null) {
        current().configureEnvironment(config); return api.art.snapshot();
      },
      setEnvironmentEnabled(enabled: boolean) { current().setEnvironmentEnabled(enabled); return api.art.snapshot(); },
      setAreaEnabled(area: string, enabled: boolean) { current().setEnvironmentAreaEnabled(area, enabled); return api.art.snapshot(); },
      stepEnvironment(deltaMs: number, frames = 1) {
        if (!finite(deltaMs) || deltaMs <= 0 || !Number.isInteger(frames) || frames < 1 || frames > 10000) throw new Error(`${marker}: invalid art timestep`);
        const s = current(), start = performance.now();
        for (let frame = 0; frame < frames; frame++) s.environmentArt?.update(deltaMs);
        return { elapsedMs: performance.now() - start, frames, environment: s.environmentArt?.snapshot() };
      },
      rebuildBackground(config: BackgroundConfig | null) {
        const s = current(), area = MAP_AREA[s.map.id] ?? 'qingyun';
        if (config) s.cache.json.add(`bg_${area}_config`, copy(config));
        else s.cache.json.remove(`bg_${area}_config`);
        s.drawBackground(area); return api.art.snapshot();
      },
      async loadImage(key: string, imageUrl: string) {
        const s = current();
        await new Promise<void>((resolve, reject) => {
          const failed = (file: Phaser.Loader.File) => { if (file.key === key) { cleanup(); reject(new Error(`${marker}: fixture image failed: ${key}`)); } };
          const loaded = () => { cleanup(); resolve(); };
          const cleanup = () => { s.load.off('loaderror', failed); s.load.off('complete', loaded); };
          s.load.on('loaderror', failed).once('complete', loaded);
          s.load.image(key, imageUrl); s.load.start();
        });
      },
      applyAtlas(key: string, metadata?: SpriteArtSpec) {
        const s = current(), p = s.player;
        if (!s.textures.exists(key)) throw new Error(`${marker}: missing art atlas: ${key}`);
        if (metadata) s.cache.json.add(`${key}_anims`, { ...s.cache.json.get(`${key}_anims`), ...copy(metadata) });
        const previous = p.texture.key, action = p.anims.currentAnim?.key.slice(previous.length + 1) ?? 'idle';
        const animation = s.anims.get(`${key}_${action}`);
        if (animation?.frames.length) {
          const index = (p.anims.currentFrame?.index ?? 1) - 1;
          p.anims.currentAnim = animation;
          p.anims.setCurrentFrame(animation.frames[Math.min(index, animation.frames.length - 1)]);
        } else p.setTexture(key);
        p.atlas = true;
        applySpriteArt(p, [SPEC.bodyW, SPEC.bodyH]);
        p.body.updateFromGameObject();
        return api.art.snapshot();
      },
      async loadAtlas(key: string, imageUrl: string, atlasData: object, animsData: SpriteArtSpec & {
        anims: { key: string; frames: string[]; frameRate: number; repeat: number }[];
      }) {
        const s = current();
        await new Promise<void>((resolve, reject) => {
          const failed = (file: Phaser.Loader.File) => { if (file.key === key) { cleanup(); reject(new Error(`${marker}: fixture load failed: ${key}`)); } };
          const loaded = () => { cleanup(); resolve(); };
          const cleanup = () => { s.load.off('loaderror', failed); s.load.off('complete', loaded); };
          s.load.on('loaderror', failed).once('complete', loaded);
          s.load.atlas(key, imageUrl, atlasData); s.load.start();
        });
        s.cache.json.add(`${key}_anims`, copy(animsData));
        for (const anim of animsData.anims) {
          if (s.anims.exists(anim.key)) s.anims.remove(anim.key);
          s.anims.create({ key: anim.key, frames: anim.frames.map(frame => ({ key, frame })), frameRate: anim.frameRate, repeat: anim.repeat });
        }
      },
    },
    getState() {
      const s = current(), p = s.prog;
      s.quests.refreshDaily();
      return copy({ mapId: s.map.id, x: s.player.x, y: s.player.y, level: p.level, realm: p.realm.id,
        realmName: p.realmName, hp: p.hp, mp: p.mp, maxHp: p.maxHp, maxMp: p.maxMp,
        inventory: p.inventory, quests: p.quests, questProgress: Object.fromEntries(s.quests.activeIds
          .map(id => [id, s.quests.objectiveProgress(QUESTS[id])])), sect: p.sect, rank: p.sectRank,
        contribution: p.sectContribution, flags: p.flags, features: featureFlags(), time: readTime() });
    },
    async loadSave(obj: unknown) {
      const s = current();
      await s.prog.flushSaves();
      if (!await s.prog.importSave(obj, { async: true })) throw new Error(`${marker}: invalid save or save failed`);
      s.registry.set('chests', new Set());
      const pos = s.prog.position;
      await restart(pos?.mapId ?? s.map.id, pos ?? undefined);
    },
    async exportSave() { current(); await persist(); return scene.prog.exportSave(); },
    // UI-2：仅测试构建的展示夹具；仍走真实 choose/分页/键鼠，回调以对白显示所选 label。
    openDialogChoices(choices: Omit<DialogChoice, 'onSelect'>[], rankIcon?: string) {
      const s = current();
      s.dialog.choose({ speaker: null, text: 'UI-2' }, null, choices.map(choice => ({ ...choice,
        onSelect: () => s.dialog.show([{ speaker: null, text: choice.label }], null),
      })), rankIcon);
    },
    openAttrPanel() { const s = current(); s.openAttrPanel(); return copy(s.attrPanel.snapshot()); },
    // UI-4 展示夹具：只记录意图，不启动制符或改变材料/存档。
    openTalismanPanel(state: Partial<TalismanPanelState> = {}) {
      current(); talismanActions.length = 0; talismanPanel.open(state); return api.talismanSnapshot();
    },
    setTalismanPanelState(state: Partial<TalismanPanelState>) {
      current(); talismanPanel.setState(state); return api.talismanSnapshot();
    },
    setTalismanButtonDisabled(disabled: boolean) {
      return api.setTalismanPanelState({ secondaryDisabled: disabled });
    },
    talismanSnapshot() { current(); return copy({ ...talismanPanel.snapshot(), actions: [...talismanActions] }); },
    openTalismanCraft(recipeId?: string) {
      const s = current(); talismanPanel.close();
      return s.openTalisman(recipeId);
    },
    talismanCraftSnapshot() {
      const s = current();
      return s.scene.isActive('talisman-craft-ui') ? copy((s.scene.get('talisman-craft-ui') as TalismanScene).snapshot()) : null;
    },
    talismanCraftAction(action: TalismanPanelAction, recipeId?: string) {
      const s = current(), ui = s.scene.get('talisman-craft-ui') as TalismanScene | null;
      if (!s.scene.isActive('talisman-craft-ui') || !ui) throw new Error(`${marker}: talisman panel closed`);
      if (recipeId) ui.select(recipeId);
      ui.action(action); return api.talismanCraftSnapshot();
    },
    async useTalisman(id: string, quality: 'low' | 'mid' | 'high' | 'supreme') {
      const s = current();
      await s.prog.flushSaves();
      return copy(await s.useTalismanAsync(id, quality));
    },
    async bindTalismanSlot(index: number, item: string | null, quality: 'low' | 'mid' | 'high' | 'supreme' = 'low') {
      const s = current();
      await s.prog.flushSaves();
      return await s.prog.runSaveTransactionAsync(draft => draft.bindTalismanSlot(index, item, quality) ? true : undefined) === true;
    },
    async giveCraftedItem(id: string, n: number, quality: 'low' | 'mid' | 'high' | 'supreme') {
      const s = current();
      if (!ITEMS[id] || !Number.isSafeInteger(n) || n <= 0 || !['low', 'mid', 'high', 'supreme'].includes(quality)
        || !s.prog.addCraftedItem(id, n, quality)) throw new Error(`${marker}: invalid quality item`);
      await persist();
    },
    attrSnapshot() { return copy(current().attrPanel.snapshot()); },
    sensePreview() { return copy(current().sense.preview()); },
    async senseScan(source: 'key' | 'button', scanId?: string) { return copy(await current().sense.requestScanAsync(source, scanId)); },
    senseIntelList() { return copy(current().sense.intelList()); },
    senseMonsterIntel() {
      const s = current(), monster = s.mobs.find(mob => mob.name === senseFixtureNames.monster);
      return monster ? copy(s.sense.monsterIntel(monster) ?? null) : null;
    },
    senseHitMonster(damage: number) {
      const s = current(), monster = s.mobs.find(mob => mob.name === senseFixtureNames.monster);
      if (!monster || !finite(damage) || damage < 0) throw new Error(`${marker}: invalid sense monster hit`);
      monster.takeHit(s.time.now, damage, 0);
      return monster.hp;
    },
    senseSpawnMonster() {
      const s = current();
      for (const old of s.mobs.filter(mob => mob.name === senseFixtureNames.monster)) old.destroy();
      const base = MONSTERS.bamboo_snake ?? Object.values(MONSTERS).find(monster => !monster.immortal && !monster.isBoss);
      if (!base) throw new Error(`${marker}: missing sense monster fixture base`);
      const monster = s.spawnTrialMob(base.id, 304, s.map.spawn.y);
      if (!monster) throw new Error(`${marker}: sense monster fixture spawn failed`);
      monster.def = { ...copy(base), aggressive: false, moveSpeed: 0, touchDamage: false, exp: 0, dropTable: null,
        sense: { enabled: true, profile: 'sense_monster_basic', visibleInfo: ['hp', 'abilities'], abilityKeys: [] } } as typeof monster.def;
      monster.setName(senseFixtureNames.monster); monster.grantRewards = false; monster.noRespawn = true;
      monster.body.setAllowGravity(false).setVelocity(0, 0);
      return { hp: monster.hp, maxHp: monster.def.hp, name: monster.name };
    },
    async senseFixture(options: { enabled?: boolean; cooldownMs?: number; inspectDurationMs?: number } = {}) {
      const s = current(), mapId = s.map.id;
      if (!TILED_MAPS[mapId]) throw new Error(`${marker}: sense fixture requires a Tiled map`);
      const table = SENSE as unknown as { enabled: boolean; scan: { cooldownMs: number }; inspect: { durationMs: number };
        targetProfiles: { id: string; enabled: boolean }[] };
      table.enabled = options.enabled ?? true;
      for (const value of [options.cooldownMs, options.inspectDurationMs]) {
        if (value !== undefined && (!Number.isSafeInteger(value) || value <= 0)) throw new Error(`${marker}: invalid sense fixture duration`);
      }
      if (options.cooldownMs !== undefined) table.scan.cooldownMs = options.cooldownMs;
      if (options.inspectDurationMs !== undefined) table.inspect.durationMs = options.inspectDurationMs;
      for (const profile of table.targetProfiles) profile.enabled = true;
      const map = TILED_MAPS[mapId];
      const platform = senseFixturePlatform(s);
      const prop = (name: string, value: unknown) => ({ name, type: typeof value === 'number' ? 'float' : 'string', value });
      const objects = [
        { id: 910001, type: 'chest', name: senseFixtureNames.chest, x: 224, y: mapId === 'qingyun_village' ? 704 : s.map.spawn.y,
          width: 0, height: 0, properties: [prop('loot', 'hp_pill_small'), prop('count', 1)] },
        { id: 910002, type: 'hidden', name: senseFixtureNames.hiddenChest, x: 224, y: mapId === 'qingyun_village' ? 704 : s.map.spawn.y,
          width: 0, height: 0, properties: [prop('reqSpirit', 0), prop('reveal', 'chest'), prop('targetObject', senseFixtureNames.chest)] },
        { id: 910003, class: 'hidden', name: senseFixtureNames.platform, x: platform.x, y: platform.y,
          width: platform.w, height: platform.h, properties: [prop('reqSpirit', 0), prop('reveal', 'platform')] },
      ];
      map.layers = map.layers.filter((layer: { name?: string }) => layer.name !== 'xt_sense_fixture');
      map.layers.push({ id: 910000, type: 'objectgroup', name: 'xt_sense_fixture', objects });
      senseFixtureMap = mapId;
      await restart(mapId, { x: s.map.spawn.x, y: s.map.spawn.y });
      const fresh = current(); fresh.physics.resume(); fresh.dialog.close();
      fresh.player.body.setAllowGravity(false).setVelocity(0, 0);
      fresh.prog.hp = fresh.prog.maxHp; fresh.prog.mp = fresh.prog.maxMp;
      fresh.player.hp = fresh.prog.hp; fresh.player.maxHp = fresh.prog.maxHp;
      api.senseSpawnMonster();
      return api.senseFixtureSnapshot();
    },
    senseFixtureSnapshot() {
      const s = current(), body = s.senseMap.platformBody(senseFixtureNames.platform);
      const platform = s.map.hidden.find(hidden => hidden.object.name === senseFixtureNames.platform)?.object;
      const visual = s.senseMap.platformVisual(senseFixtureNames.platform);
      const bounds = visual?.object.getBounds();
      const render = {
        exists: !!visual?.object.scene, visible: visual?.object.visible ?? false,
        bounds: bounds ? { left: bounds.left, right: bounds.right, top: bounds.top, bottom: bounds.bottom,
          width: bounds.width, height: bounds.height } : null,
        alpha: visual?.object.alpha ?? null, depth: visual?.object.depth ?? null,
        fallback: visual?.fallback ?? false, tileset: visual?.tileset ?? null, tiles: visual?.tiles ?? [],
        images: visual?.object.list.filter((child): child is Phaser.GameObjects.Image => child instanceof Phaser.GameObjects.Image)
          .map(image => {
            const tileBounds = image.getBounds();
            return { texture: image.texture.key, frame: image.frame.name, visible: image.visible, alpha: image.alpha,
              bounds: { left: tileBounds.left, right: tileBounds.right, top: tileBounds.top, bottom: tileBounds.bottom,
                width: tileBounds.width, height: tileBounds.height } };
          }) ?? [],
      };
      const chest = s.children.getByName('chest:' + senseFixtureNames.chest) as Phaser.GameObjects.GameObject & { visible?: boolean } | null;
      return copy({ names: senseFixtureNames, mapId: s.map.id, fixtureMap: senseFixtureMap, mp: s.prog.mp,
        spawn: s.map.spawn,
        openedChests: [...s.prog.openedChests], chestVisible: chest?.visible ?? false,
        platform: body ? { enabled: body.enable, top: body.top, left: body.left, right: body.right,
          bottom: body.bottom, centerX: body.center.x, width: body.width, render,
          clearance: platform ? senseFixtureClearance(s, platform) : null,
          checkCollision: { up: body.checkCollision.up, down: body.checkCollision.down, left: body.checkCollision.left, right: body.checkCollision.right } } : null,
        player: { x: s.player.x, y: s.player.y, bottom: s.player.body.bottom, onGround: s.player.onGround },
        revealed: s.sense.revealedHidden(s.map.id), intel: s.sense.intelList(), preview: s.sense.preview() });
    },
    openInventoryPanel() { const s = current(); s.openInventoryPanel(); return copy(s.inventoryPanel.snapshot()); },
    inventorySnapshot() { return copy(current().inventoryPanel.snapshot()); },
    openEquipPanel() { const s = current(); s.openEquipPanel(); return copy(s.equipPanel.snapshot()); },
    equipSnapshot() { return copy(current().equipPanel.snapshot()); },
    async joinSect(id: string) {
      const s = current(), cls = CLASS_LIST.find(c => c.sect === id);
      if (!cls || !s.prog.advanceClass(cls.id)) throw new Error(`${marker}: sect unavailable: ${id}`);
      await persist();
    },
    async setRank(rank: string) {
      const p = current().prog;
      await p.flushSaves();
      if (!await p.runSaveTransactionAsync(draft => draft.setSectRank(rank) ? true : undefined)) throw new Error(`${marker}: invalid rank or save failed: ${rank}`);
      await persist();
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
    async giveItem(id: string, n: number) {
      const p = current().prog;
      if (!Object.prototype.hasOwnProperty.call(ITEMS, id) || !Number.isSafeInteger(n) || n <= 0 || !Number.isSafeInteger(p.count(id) + n)) {
        throw new Error(`${marker}: invalid item or count`);
      }
      p.addItem(id, n); await persist();
    },
    async acceptQuest(id: string) {
      const s = current();
      if (!s.quests.accept(id)) throw new Error(`${marker}: quest unavailable: ${id}`);
      await persist();
    },
    async completeQuest(id: string, choiceId?: string) {
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
      // 与作弊器一致：强制完成夹具没有选择 UI，未指定答案时使用已开启节点首项。
      const hook = QUEST_HOOKS?.questHooks.find(candidate => candidate.quest === id
        && candidate.on === 'turn_in' && candidate.enabled);
      await s.prog.flushSaves();
      const reward = await s.quests.turnInAsync(id, false, choiceId ?? hook?.choices[0].id);
      if (!reward) { await persist(); throw new Error(`${marker}: cannot complete quest: ${id}`); }
      s.giveRewards(reward.quest, reward.broke, reward.daily, reward.settled); await persist();
      return true;
    },
    async setFlag(key: string, val: boolean) {
      const s = current();
      if (isFeatureName(key)) {
        await s.prog.flushSaves();
        setFeatureFlag(key, val);
        await s.applyFeatureFlags();
        await s.prog.flushSaves();
        return;
      }
      await s.prog.flushSaves();
      if (!await s.prog.runSaveTransactionAsync(draft => draft.setConfigFlag(key, val) ? true : undefined)) throw new Error(`${marker}: invalid flag or save failed`);
      await persist();
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
    async seed(n: number) {
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
      await persist();
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
  const testFps = query.has('xtRenderHz') && [30, 60, 144].includes(renderHz)
    ? { fps: { target: renderHz, forceSetTimeOut: true, smoothStep: false } } : {};
  const game = new Phaser.Game({ ...config, ...testFps, scene: [scene] });
  recordRendererChoice(game, rendererChoice);
  const crashGuard = installCrashGuard(game);
  // 已被安全网捕获的循环错误仍进入测试事件流，不能因兜底而掩盖回归。
  const unsubscribeCrash = crashGuard.onError(record => emit('error', record));
  game.events.once(Phaser.Core.Events.DESTROY, () => {
    unsubscribeCrash();
    unsubscribeQuest?.(); listeners.clear(); pending.length = 0;
    if (console.error === wrappedError) console.error = consoleError;
    window.removeEventListener('error', onError); window.removeEventListener('unhandledrejection', onRejection);
    setGameTimeSource(null); Math.random = originalRandom;
    if (originalRnd) Phaser.Math.RND.state(originalRnd);
    delete (window as Window & { __xt?: typeof api }).__xt;
  });
  return game;
}
