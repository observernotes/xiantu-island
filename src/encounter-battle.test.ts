import encountersRaw from '@xt/balance/encounters.json';
import { createEncounterBattleProvider, type EncounterBattleHandle, type EncounterBattleRequest } from './EncounterBattle';
import { MONSTERS } from './data';
import { GameScene } from './scenes/GameScene';
import { Monster } from './scenes/Monster';
import { SkillCombat } from './SkillCombat';
import { FriendlySummons } from './FriendlySummons';
import { Progress } from './Progress';
import { SKILL_LIST, skillNumber } from './skills';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
function same(actual: unknown, expected: unknown, message: string) { eq(JSON.stringify(actual), JSON.stringify(expected), message); }
const rescue = 'enc_stranded_cultivator', herb = 'enc_fragrant_herb';
function request(id = rescue): EncounterBattleRequest {
  const row = encountersRaw.encounters.find(row => row.id === id)!;
  const step = row.script.steps.find(step => step.type === 'battle') as unknown as EncounterBattleRequest;
  return { attemptId: `${id}:fixture`, encounterId: id, stepId: 'battle', spawns: step.spawns,
    warningMs: step.warningMs, respawnMs: 0, grantRewards: false, anchor: { x: 300, y: 420 } };
}
function clock() {
  let now = 0;
  const timers: { at: number; callback: () => void; removed: boolean }[] = [];
  return {
    schedule(delay: number, callback: () => void) {
      const timer = { at: now + delay, callback, removed: false }; timers.push(timer);
      return { dispose() { timer.removed = true; } };
    },
    advance(ms: number) {
      const end = now + ms;
      for (;;) {
        const timer = timers.filter(row => !row.removed && row.at <= end).sort((a, b) => a.at - b.at)[0];
        if (!timer) break;
        timer.removed = true; now = timer.at; timer.callback();
      }
      now = end;
    },
    pending: () => timers.filter(row => !row.removed).length,
  };
}
interface Mob {
  id: string; x: number; y: number; active: boolean; grantRewards: boolean; noRespawn: boolean;
  def: typeof MONSTERS[string];
}
function world() {
  const time = clock(), mobs: Mob[] = [], listeners = new Map<Mob, () => void>();
  const warnings: { x: number; y: number; active: boolean }[] = [];
  const destroyed: Mob[] = [], results: boolean[] = [];
  const rewards = { quests: 0, exp: 0, drops: 0, intelRemoved: 0 };
  const scene = { sense: { removeMonsterIntel() { rewards.intelRemoved++; } },
    quests: { onKill() { rewards.quests++; } }, prog: { gainExp() { rewards.exp++; } },
    applyExp() {}, spawnDrop() { rewards.drops++; } };
  const provider = createEncounterBattleProvider<Mob>({
    fallbackAnchor: () => ({ x: 500, y: 640 }), schedule: time.schedule,
    warn(point) { const mark = { x: point.x, y: point.y, active: true }; warnings.push(mark); return { dispose() { mark.active = false; } }; },
    spawn(id, x, y) {
      if (!MONSTERS[id]) return null;
      const mob = { id, x, y, def: MONSTERS[id], active: true, grantRewards: true, noRespawn: false };
      mobs.push(mob); return mob;
    },
    onDeath(mob, callback) {
      const listener = () => { GameScene.prototype.onMobDead.call(scene as unknown as GameScene, mob as any); callback(); };
      listeners.set(mob, listener); return { dispose() { listeners.delete(mob); } };
    },
    destroy(mob) { if (mob.active) { mob.active = false; destroyed.push(mob); } },
  });
  return { provider, time, mobs, warnings, destroyed, listeners, rewards, results, scene,
    die(mob: Mob) { listeners.get(mob)?.(); } };
}

const originalDefinitions = JSON.stringify(MONSTERS);
for (const [id, monster, count] of [[rescue, 'mountain_mandrill', 2], [herb, 'vine_imp', 1]] as const) {
  const w = world();
  let handle: EncounterBattleHandle;
  handle = w.provider.start(request(id), success => { w.results.push(success); handle.dispose(); });
  eq(w.warnings.filter(row => row.active).length, count, `${id} 每个表内实体有预警`);
  eq(w.mobs.length, 0, `${id} 预警开始不提前刷怪`);
  w.time.advance(799); eq(w.mobs.length, 0, `${id} 799ms 仍不刷怪`);
  w.time.advance(1); eq(w.mobs.length, count, `${id} 800ms 按表生成完整波次`);
  eq(w.warnings.filter(row => row.active).length, 0, `${id} 生成时移除预警`);
  for (const mob of w.mobs) {
    eq(mob.id, monster, `${id} 复用正式怪物 id`);
    eq(mob.grantRewards, false, `${id} 禁用普通击杀收益`);
    eq(mob.noRespawn, true, `${id} 独立实例不重生`);
    eq(mob.def.respawnMs, 0, `${id} 实例定义重生时间 0`);
    ok(mob.def !== MONSTERS[monster], `${id} 未修改共享怪物定义`);
  }
  eq(w.listeners.has({ ...w.mobs[0] }), false, `${id} 同 id 的常驻怪不属于波次`);
  const firstDeath = w.listeners.get(w.mobs[0])!;
  w.die(w.mobs[0]); firstDeath();
  eq(w.results.length, 0, `${id} 重复死亡回报不提前触发胜利`);
  if (count === 2) {
    w.time.advance(0); eq(w.results.length, 0, '救援只杀一只不能获胜');
    w.die(w.mobs[1]);
  }
  eq(w.destroyed.length, 0, `${id} onDead 调用栈中不销毁 Monster`);
  w.time.advance(0);
  same(w.results, [true], `${id} 全波死亡自动判胜一次`);
  eq(w.destroyed.length, count, `${id} 结局清理本波独立实例`);
  eq(w.listeners.size, 0, `${id} 清理退订本波死亡回报`);
  same([w.rewards.quests, w.rewards.exp, w.rewards.drops], [0, 0, 0], `${id} 真实 GameScene 击杀口径不推进任务或发普通收益`);
  firstDeath(); w.time.advance(10_000);
  same(w.results, [true], `${id} 残留回报和时间流逝不二次判胜`);
  eq(w.time.pending(), 0, `${id} 清理后无预警或回报 timer`);
  handle.dispose(); eq(w.destroyed.length, count, `${id} 重复清理幂等`);
}
eq(JSON.stringify(MONSTERS), originalDefinitions, '两种事件不改共享 MONSTERS 定义');

for (const afterSpawn of [false, true]) {
  const w = world(), handle = w.provider.start(request(), success => w.results.push(success));
  if (afterSpawn) { w.time.advance(800); w.die(w.mobs[0]); }
  const lateDeath = w.listeners.get(w.mobs[0]);
  handle.dispose(); lateDeath?.(); w.time.advance(10_000);
  eq(w.results.length, 0, `死亡/离图取消${afterSpawn ? '战斗' : '预警'}不回报成功`);
  eq(w.mobs.filter(row => row.active).length, 0, '取消移除所有事件怪');
  eq(w.warnings.filter(row => row.active).length, 0, '取消移除所有事件预警');
  eq(w.time.pending(), 0, '取消清除所有预警与回报 timer');
  eq(w.listeners.size, 0, '取消退订所有死亡回报');
}
{
  const w = world(), handle = w.provider.start(request(herb), success => w.results.push(success));
  w.time.advance(800); w.die(w.mobs[0]); handle.dispose(); w.time.advance(0);
  eq(w.results.length, 0, '最后一只死后同帧取消仍忽略排队胜利');
}
{
  const w = world(), handle = w.provider.start({ ...request(herb), anchor: undefined }, success => w.results.push(success));
  w.time.advance(800);
  same([w.mobs[0].x, w.mobs[0].y], [412, 640], '缺锚点 fixture 使用 player fallback 附近偏移');
  w.mobs[0].active = false; w.time.advance(10_000);
  eq(w.results.length, 0, '实体消失不冒充击杀判胜');
  handle.dispose();
}
{
  const w = world(), handle = w.provider.start(request(), success => w.results.push(success));
  w.time.advance(800);
  const ordinary = { ...w.mobs[0], grantRewards: true, def: { ...MONSTERS.mountain_mandrill, dropTable: undefined } };
  GameScene.prototype.onMobDead.call(w.scene as unknown as GameScene, ordinary as any);
  same([w.rewards.quests, w.rewards.exp], [1, 1], '同 id 的常驻怪仍正常计任务与修为');
  w.time.advance(0); same(w.results, [], '同 id 常驻怪击杀不算本波');
  w.die(w.mobs[0]); w.time.advance(0); same(w.results, [], '常驻加事件一只仍不算救援清波');
  w.die(w.mobs[1]); w.time.advance(0); same(w.results, [true], '仅两只事件实例死亡后完成救援');
  same([w.rewards.quests, w.rewards.exp], [1, 1], '事件怪死亡没有追加常驻收益'); handle.dispose();
}
for (const spawns of [[], [{ monster: 'missing_monster', count: 1 }],
  [{ monster: 'mountain_mandrill', count: 1 }, { monster: 'missing_monster', count: 1 }],
  [{ monster: 'vine_imp', count: 0 }]]) {
  const w = world(); let handle: EncounterBattleHandle;
  handle = w.provider.start({ ...request(), spawns }, success => { w.results.push(success); handle.dispose(); });
  w.time.advance(800); same(w.results, [false], '缺失或无效刷怪配置明确失败而非无怪获胜');
  eq(w.mobs.filter(row => row.active).length, 0, '部分生成失败也清理已生成实体');
  eq(w.warnings.filter(row => row.active).length, 0, '部分生成失败也移除预警');
}
{
  const w = world(), one: boolean[] = [], two: boolean[] = [];
  const first = w.provider.start(request(), success => one.push(success));
  const second = w.provider.start({ ...request(herb), attemptId: 'other-attempt' }, success => two.push(success));
  w.time.advance(800); w.die(w.mobs[2]); w.time.advance(0);
  same(one, [], '另一波同场击杀不计救援进度'); same(two, [true], '另一波仅完成自身');
  first.dispose(); second.dispose();
}

// 真实 GameScene 创建的 provider 桥接：只替换显示分配、timer 与 Monster 分配。
{
  const time = clock(), spawned: any[] = [], markers: any[] = [], results: boolean[] = [];
  let barDestroyed = 0, priorDeaths = 0, blinkStopped = 0, fxDestroyed = 0, warnDestroyed = 0, movementAfterCancel = 0;
  const game = Object.create(GameScene.prototype) as any;
  Object.assign(game, { map: { id: 'entity-fixture', width: 1000 }, mobs: [], player: { x: 12, feet: 420 },
    prog: { encounters: undefined }, events: { on() {} }, registry: { get() { return 0; }, set() {} },
    time: { delayedCall(ms: number, callback: () => void) { const timer = time.schedule(ms, callback); return { remove() { timer.dispose(); } }; } },
    add: { ellipse(x: number, y: number) { const mark = { x, y, active: true, setStrokeStyle() { return this; }, setDepth() { return this; }, destroy() { this.active = false; } }; markers.push(mark); return mark; } },
    spawnTrialMob(id: string, x: number, y: number) {
      const mob = Object.assign(Object.create(Monster.prototype), { def: MONSTERS[id], hp: MONSTERS[id].hp,
        x, y, scene: game, active: true, grantRewards: true, noRespawn: false, atlas: false, st: 'patrol', dir: 1,
        fxTimers: [], cooldowns: {}, summons: [], cast: null, charge: null,
        body: { enable: true, blocked: { down: true }, touching: { down: true }, center: { x }, bottom: y,
          setVelocity() {}, setVelocityX() { movementAfterCancel++; } },
        onDead() { priorDeaths++; }, clearTint() {}, setVisible() {},
        bar: { clear() {}, destroy() { barDestroyed++; } },
        destroy() { this.active = false; (this as any).body = undefined; this.scene = undefined; } });
      spawned.push(mob); game.mobs.push(mob); return mob;
    } });
  game.setupEncounters();
  const battle = game.encounterRuntime.options.battle;
  const handle = battle.start({ ...request(herb), anchor: undefined }, (success: boolean) => { results.push(success); handle.dispose(); });
  eq(markers[0].x, 32, 'GameScene 预警坐标裁剪到地图内');
  time.advance(800); eq(spawned[0].x, 32, 'GameScene 实体坐标与预警一致');
  eq(spawned[0].grantRewards, false, 'GameScene 实体沿 grantRewards=false');
  spawned[0].onDead(spawned[0]); eq(priorDeaths, 1, 'GameScene 保留既有 onMobDead 链');
  time.advance(0); same(results, [true], '真实 GameScene provider 自动回报本波清完');
  eq(spawned[0].active, false, 'GameScene 结局移除实体'); eq(barDestroyed, 1, 'GameScene 同时移除独立血条');
  eq(markers.filter(mark => mark.active).length, 0, 'GameScene 结局无残留预警');
  eq(game.mobs.length, 0, 'GameScene 胜利清理同时移除 registry 引用');

  // 真 Monster.step -> doSlam -> 场景取消 -> 返回 step：禁止在攻击调用栈中删 body。
  const registry = game.mobs, ordinary = { fixture: 'resident' }; registry.push(ordinary);
  const cancelled: boolean[] = [];
  const fighting = battle.start(request(), (success: boolean) => cancelled.push(success));
  time.advance(800);
  const attacker = spawned[1], other = spawned[2];
  for (const mob of [attacker, other]) {
    mob.teleBlink = { stop() { blinkStopped++; } };
    mob.fxTimers = [{ sprite: { destroy() { fxDestroyed++; } }, doneAt: 100_000 }];
  }
  other.cast = { warn: { destroy() { warnDestroyed++; } } };
  attacker.teleEnd = 1; attacker.st = 'attack';
  attacker.onSlam = () => {
    fighting.dispose();
    ok(attacker.body, 'doSlam 内退场仍保留当前攻击者 body');
    eq(attacker.body.enable, false, '退场同步禁用当前攻击者物理体');
    eq(attacker.dead, true, '退场同步标为 dead，后续命中逻辑会跳过');
    eq(attacker.active, true, '真正销毁延迟到攻击调用栈返回后');
    eq(game.mobs, registry, '清理保留 Phaser collider 持有的同一数组');
    same(game.mobs, [ordinary], '清理原位移除本波引用并保留常驻怪');
  };
  attacker.step(1601, { x: attacker.x, y: attacker.y, dead: false });
  eq(movementAfterCancel, 0, 'doSlam 返回后 dead guard 阻止继续移动/读 body');
  eq(blinkStopped, 2, '攻击者和同波怪的预警闪烁 tween 均停止');
  eq(fxDestroyed, 2, '退场销毁所有自有战斗 FX'); eq(warnDestroyed, 1, '退场销毁尚存施法预警');
  time.advance(0);
  eq(attacker.active, false, '攻击调用栈返回后再销毁攻击者');
  eq(other.active, false, '同波其他怪也安全销毁');
  eq(barDestroyed, 3, '清理三只独立血条且无重复销毁');
  same(cancelled, [], '攻击导致退场不会误报清波胜利');
  fighting.dispose(); eq(barDestroyed, 3, '重入/重复清理保持幂等');
}

// 真实 SkillCombat 命中与真实 Progress 熟练度：事件怪仍受伤，但不增加熟练度。
{
  const def = SKILL_LIST.find(row => row.type !== 'passive' && row.masteryPerHit > 0 && skillNumber(row, 'damageRatio', 1) > 0);
  ok(def, '正式技能表存在可验证熟练度的攻击技能');
  const progress = new Progress();
  let hits = 0, hitEvents = 0;
  const scene = { prog: progress, player: { x: 100, y: 100, facing: 1, depth: 2 }, time: { now: 1234 },
    add: { graphics: () => ({ setDepth() { return this; } }) },
    events: { once() {}, emit(name: string) { if (name === 'skill:hit') hitEvents++; } }, damageNumber() {} };
  const combat = new SkillCombat(scene as unknown as GameScene) as any;
  const target = (grantRewards: boolean | undefined) => ({ x: 150, y: 100, dead: false, grantRewards,
    def: { id: 'fixture-mob', level: 12, def: 2 }, body: { height: 32, setVelocityX() {} }, takeHit() { hits++; } });
  for (const grant of [false, true, undefined]) {
    const before = progress.skillMastery[def.id] ?? 0, oldHits = hits;
    combat.applyHits(def.id, 1, [target(grant)], { hits: new Set(), maxTargets: 1, crit: false });
    ok(hits > oldHits, `grantRewards=${grant} 仍走真实伤害`);
    eq((progress.skillMastery[def.id] ?? 0) - before, grant === false ? 0 : def.masteryPerHit,
      `grantRewards=${grant} 熟练度遵守奖励门禁`);
  }
  ok(hitEvents > 0, '真实技能命中事件仍发出，未破坏战斗反馈');
}
// 友方灵兽由独立 attack 路径结算熟练度，也必须遵守目标的普通奖励门禁。
{
  const def = SKILL_LIST.find(row => row.id === 'summon_spirit_wolf');
  ok(def && def.masteryPerHit > 0, '正式灵狼技能存在可验证的熟练度');
  const progress = new Progress();
  let hits = 0, hitEvents = 0;
  const scene = { prog: progress, player: { depth: 2 }, time: { now: 1234 },
    add: { graphics: () => ({ setDepth() { return this; } }) },
    events: { once() {}, emit(name: string) { if (name === 'skill:hit') hitEvents++; } }, damageNumber() {} };
  const summons = new FriendlySummons(scene as unknown as GameScene) as any;
  const pet = { defId: def.id, level: 1, secondary: false, sprite: { x: 100, y: 100 } };
  for (const grant of [false, true, undefined]) {
    const before = progress.skillMastery[def.id] ?? 0, oldHits = hits;
    const target = { x: 150, y: 100, dead: false, grantRewards: grant,
      def: { id: 'fixture-mob', level: 12, def: 2 }, body: { height: 32 }, takeHit() { hits++; } };
    summons.attack(pet, target);
    ok(hits > oldHits, `灵狼攻击 grantRewards=${grant} 目标仍造成伤害`);
    eq((progress.skillMastery[def.id] ?? 0) - before, grant === false ? 0 : def.masteryPerHit,
      `灵狼攻击 grantRewards=${grant} 目标遵守熟练度门禁`);
  }
  ok(hitEvents > 0, '灵狼真实命中事件仍发出，未破坏攻击反馈');
}
console.log(`encounter-battle: ${assertions} assertions passed; 800ms waves, kill isolation, cleanup, real GameScene/SkillCombat`);
