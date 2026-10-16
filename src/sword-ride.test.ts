import { REALMS, t } from './data';
import { featureEnabled, featureFlags } from './features';
import { setGameTimeSource } from './GameClock';
import { Progress } from './Progress';
import { SkillCombat } from './SkillCombat';
import { createIndexedDbBackend, createMemorySaveBackend, saveStore, setSaveBackend } from './SaveStore';
import { SKILLS, skillNumber } from './skills';
import { GameScene } from './scenes/GameScene';

/** 真表关态、真实 Progress/SkillCombat；只替换存储、渲染和时间。 */
export async function runSwordRideTests() {
  let assertions = 0, writes = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${message}: ${JSON.stringify(actual)} != ${JSON.stringify(expected)}`);
  };
  const ok = (value: unknown, message: string) => { eq(!!value, true, message); };
  const def = SKILLS.sword_ride;
  const foundation = REALMS.find(realm => realm.id === def.req?.realm)!;
  const refining = REALMS.find(realm => realm.levelMax + 1 === foundation.levelMin)!;
  const beforeFlags = featureFlags();
  eq(featureEnabled('indexedDbSaves'), true, '沿用正式异步存档配置，不覆盖 flag');
  ok(refining.reward?.unlock?.includes(def.id), '御剑来源是离开炼气的 reward.unlock');
  let now = Date.UTC(2026, 9, 16, 8);
  setGameTimeSource(() => now);
  const storageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const local = new Map<string, string>();
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: (key: string) => local.get(key) ?? null,
    setItem: (key: string, value: string) => { local.set(key, value); },
    removeItem: (key: string) => { local.delete(key); },
  } });
  const backend = createMemorySaveBackend();
  setSaveBackend({ ...backend, async write(slot) { writes++; await backend.write(slot); } });

  function atBottleneck() {
    const progress = new Progress(); progress.level = refining.levelMax; progress.exp = progress.expNeed;
    return progress;
  }
  function combatScene(progress: Progress, wall = false) {
    const logs: string[] = [], casts: unknown[] = [], durations: number[] = [];
    const player = {
      x: 100, y: 100, facing: 1, depth: 2, active: true, dead: false, state2: 'ground', atlas: false,
      skillRooted: false, attackLockUntil: 0, skillCancelOnJump: false, animationKey: () => 'attack',
      body: { x: 90, width: 20, halfWidth: 10, left: 90, right: 110, top: 0, bottom: 100,
        setVelocityX() {}, reset(x: number, y: number) {
          player.x = x; player.y = y; this.x = x - 10; this.left = x - 10; this.right = x + 10;
        } },
    };
    const sprite = () => ({ active: true,
      setOrigin() { return this; }, setBlendMode() { return this; }, setDepth() { return this; },
      setFlipX() { return this; }, setPosition() { return this; }, destroy() { this.active = false; },
    });
    const scene = {
      prog: progress, player, time: { now, delayedCall: (_ms: number, run: () => void) => run() },
      map: { width: 2000, solids: { getChildren: () => wall ? [{ body: { left: 180, right: 188, top: 0, bottom: 300 } }] : [] } },
      events: { once() {}, emit(name: string, data: unknown) { if (name === 'skill:cast') casts.push(data); } },
      add: { graphics: () => ({ setDepth() { return this; } }), sprite },
      anims: { exists: () => false }, textures: { exists: () => true }, cache: { json: { get: () => undefined } },
      tweens: { addCounter(options: { duration: number; onUpdate: (tween: { getValue(): number }) => void; onComplete(): void }) {
        durations.push(options.duration); options.onUpdate({ getValue: () => 1 }); options.onComplete();
      } },
      log: (message: string) => logs.push(message),
    };
    return { scene, player, logs, casts, durations, combat: new SkillCombat(scene as unknown as GameScene) };
  }
  function trialScene(progress: Progress, rate: number) {
    const timers: { ms: number; run(): void }[] = [], logs: string[] = [];
    const values = new Map<string, unknown>([['trialRate', { rate }]]);
    const visual = { setOrigin() { return this; }, setScrollFactor() { return this; }, setDepth() { return this; }, destroy() {} };
    const scene = Object.assign(Object.create(GameScene.prototype), {
      prog: progress, player: { x: 100, y: 100 }, registry: { get: (key: string) => values.get(key), set: (key: string, value: unknown) => values.set(key, value) },
      log: (message: string) => logs.push(message), time: { delayedCall: (ms: number, run: () => void) => timers.push({ ms, run }) },
      add: { text: () => visual, rectangle: () => visual }, tweens: { add() {} }, cameras: { main: { shake() {} } },
      playBreakthroughFail() {}, playCue: (_cue: string, after: () => void) => after(),
    }) as GameScene;
    return { scene, timers, logs };
  }

  try {
    {
      const p = atBottleneck(), h = combatScene(p);
      p.skills.sword_ride = 1;
      const before = [p.mp, h.player.x, p.skillCooldowns];
      eq(h.combat.trySwordRide(), false, '即使已有异常技能记录，筑基前仍不可用');
      eq(h.logs, [t('fly.locked_realm')], '筑基前使用正式 fly.locked_realm');
      eq([p.mp, h.player.x, p.skillCooldowns], before, '境界拒绝不扣蓝、不位移、不写冷却');
      delete p.skills.sword_ride;
      eq(p.ensureSwordRideGranted(), false, '筑基前不得补发');
      p.exp = 0;
      eq(p.breakthrough(), false, '修为不足突破不成功'); eq(p.skills.sword_ride, undefined, '失败突破不授予');
    }
    for (const result of ['broken', 'dead', 'held'] as const) {
      const p = atBottleneck(), h = trialScene(p, 0);
      const originalRandom = Math.random;
      try { Math.random = () => 0.5; h.scene.onTrialEnd(result); }
      finally { Math.random = originalRandom; }
      if (result === 'held') h.timers.find(timer => timer.ms === 2200)!.run();
      eq(p.level, refining.levelMax, `${result} 失败路径不达到筑基`);
      eq(p.skills.sword_ride, undefined, `${result} 失败路径不授御剑`);
      await p.flushSaves();
    }
    {
      const p = atBottleneck(), paid = p.spSpent(def.job), hotbar = [...p.hotbar];
      const h = trialScene(p, 1);
      h.scene.onTrialEnd('held'); h.timers.find(timer => timer.ms === 2200)!.run();
      eq(p.realm.id, foundation.id, '真实突破成功路径进入 skills.req.realm');
      eq(p.skills.sword_ride, 1, '突破成功自动赠予御剑一级');
      eq(p.skillGifted.sword_ride, 1, '御剑走 grantSkill 免费等级链');
      eq(p.spSpent(def.job), paid, '自动授予不花 SP'); eq(p.hotbar, hotbar, '被动分类移动能力不抢占既有快捷栏');
      eq(h.logs.filter(message => message === t('fly.skill_granted')).length, 1, '首次成功提示一次领悟');
      const skillBefore = JSON.stringify([p.skills, p.skillGifted]);
      eq(p.ensureSwordRideGranted(), false, '重复事件不再授予');
      eq(p.breakthrough(), false, '重复成功事件不再次突破');
      eq(JSON.stringify([p.skills, p.skillGifted]), skillBefore, '重复事件不升级或新增赠技等级');
      await p.flushSaves();
      const loaded = await Progress.load({ async: true });
      eq(loaded.skills.sword_ride, 1, '保存重载仍持有御剑');
      eq(loaded.skillGifted.sword_ride, 1, '重载不重复赠予');
      const writesBefore = writes;
      await Progress.load({ async: true });
      eq(writes, writesBefore, '已有御剑的重复读档不补发、不重复保存');

      const closedLogs: string[] = [], closedBefore = loaded.exportSave();
      const closedScene = Object.assign(Object.create(GameScene.prototype), {
        prog: loaded, map: { id: 'wanyao_deep_1' }, log: (message: string) => closedLogs.push(message),
      }) as GameScene;
      closedScene.requestCompanionInvite();
      eq(closedLogs, [t('companion.invite.disabled')], '真实失效邀请钩子仅提示 companion.invite.disabled');
      eq(loaded.exportSave(), closedBefore, '真实关态邀请钩子不写关系或其它进度');
      closedScene.requestSustainFlight();
      eq(closedLogs[closedLogs.length - 1], t('fly.zone_disabled'), '筑基角色在白名单地图尝试持续飞仍提示 fly.zone_disabled');
      eq(loaded.exportSave(), closedBefore, '真实持续飞拒绝钩子不扣蓝、不改进度');

      const dash = combatScene(loaded), cost = loaded.skillMpCost(def.id), mp = loaded.mp;
      eq(dash.combat.trySwordRide(), true, '持续飞行正式表关闭时仍能基础冲刺');
      eq(dash.player.x - 100, skillNumber(def, 'dashDistance', 1), '冲刺位移读取现 skills 参数');
      eq(dash.durations, [skillNumber(def, 'dashMs', 1)], '冲刺时长读取现 skills 参数');
      eq(loaded.mp, mp - cost, '有效冲刺才扣现表灵力');
      eq(dash.combat.cds.get(def.id)?.total, loaded.skillCooldownMs(def.id), '冲刺冷却读取现表');
      eq(dash.casts.length, 1, '一次有效冲刺只发一次施放事件');
      const used = [loaded.mp, dash.player.x, dash.casts.length];
      eq(dash.combat.trySwordRide(), false, '冷却中不可重复冲刺');
      eq([loaded.mp, dash.player.x, dash.casts.length], used, '冷却中不误扣或重复位移');
      await loaded.flushSaves();
      const onCooldown = await Progress.load({ async: true }), restored = combatScene(onCooldown);
      eq(restored.combat.trySwordRide(), false, '保存重载保留冲刺冷却');
      now += loaded.skillCooldownMs(def.id) + 1; dash.scene.time.now = now;
      loaded.mp = Math.max(0, cost - 1);
      const low = [loaded.mp, dash.player.x, dash.casts.length];
      eq(dash.combat.trySwordRide(), false, '灵力不足拒绝冲刺');
      eq(dash.logs[dash.logs.length - 1], t('fly.mp_low'), '灵力不足使用 fly.mp_low');
      eq([loaded.mp, dash.player.x, dash.casts.length], low, '灵力不足不误扣或位移');

      const blocked = new Progress(); blocked.level = foundation.levelMin; blocked.ensureSwordRideGranted();
      const wall = combatScene(blocked, true);
      eq(wall.combat.trySwordRide(), true, '有墙仍走既有冲刺碰撞逻辑');
      ok(wall.player.body.right < 180, '薄实体墙裁剪冲刺落点，不能穿墙');
      await blocked.flushSaves();
    }
    {
      const legacy = new Progress(); legacy.level = foundation.levelMin; legacy.job = 'taixu_acolyte';
      legacy.realmRewards = [refining.id];
      const paid = legacy.spSpent(def.job);
      ok(await saveStore.writeSlot(1, legacy.exportSave()), '写入已筑基缺技的旧档');
      const before = writes, loaded = await Progress.load({ async: true });
      eq(loaded.skills.sword_ride, 1, '非天剑的已筑基旧档也补齐御剑');
      eq(loaded.skillGifted.sword_ride, 1, '旧档补发免费一级');
      eq(loaded.spSpent(def.job), paid, '旧档补发不花 SP');
      eq(writes - before, 1, '已筑基缺技的异步读档只持久化补齐一次');
      eq((await saveStore.readSlot(1))?.data.skills, loaded.skills, '补齐立即落盘');
      const again = await Progress.load({ async: true });
      eq(again.skills.sword_ride, 1, '再次读取保留御剑');
      eq(writes - before, 1, '再次读取无重复授予写盘');
      eq(again.canCastSkill(def), true, '非天剑御剑能力不受宗门分类阻挡');
    }
    eq(featureFlags(), beforeFlags, '整套御剑测试不翻正式或会话 flag');
    console.log(`sword ride tests ok: ${assertions} assertions (success/failure, free idempotent grants, async save/backfill, combat dash parameters/collision/MP/cooldown)`);
    return assertions;
  } finally {
    setGameTimeSource(null); setSaveBackend(createIndexedDbBackend());
    if (storageBefore) Object.defineProperty(globalThis, 'localStorage', storageBefore);
    else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}
