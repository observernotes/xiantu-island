import Phaser from 'phaser';
import altarMap from '@xt/maps/trial_foundation_altar.json';
import { MONSTERS, TRIALS, type MonsterDef, type TrialDef } from './data';
import { objectiveDamage } from './ObjectiveDamage';
import { Monster } from './scenes/Monster';
import { AltarTrial, type TrialHost, type TrialResult } from './scenes/AltarTrial';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: 得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

// Mock 仅提供容器/绘制接口，AI、波次、结算、撤怪及天雷均运行生产代码。
function drawing() {
  const obj: Record<string, unknown> = {};
  const proxy = new Proxy(obj, { get: (_target, key) => key === 'destroy' ? () => {} : () => proxy });
  return proxy;
}
type SpawnEvent = { time: number; id: string; x: number; y: number };
type TestHost = TrialHost & {
  spawnLog: SpawnEvent[];
  playerDamage: number[];
  endResults: TrialResult[];
  numbers: number[];
};
function host(MonsterClass: typeof Monster = Monster): TestHost {
  const objects = altarMap.layers.flatMap(layer => 'objects' in layer ? layer.objects ?? [] : []);
  const props = (properties: { name: string; value: unknown }[] = []) => Object.fromEntries(properties.map(p => [p.name, p.value]));
  const scene = {
    map: {
      width: altarMap.width * altarMap.tilewidth,
      objects: objects.map(o => ({ ...o, props: props(o.properties) })),
      zones: objects.filter(o => o.type === 'zone').map(o => ({ x: o.x, y: o.y, w: o.width, h: o.height, props: props(o.properties) })),
    },
    time: { now: 0, delayedCall: () => {} },
    textures: { exists: (key: string) => key.startsWith('mon_') },
    anims: { exists: () => false },
    cache: { json: { get: () => undefined } },
    add: { graphics: drawing, circle: drawing, text: drawing, existing: () => {} },
    physics: { add: { existing: () => {} }, overlapRect: () => [{}] },
    tweens: { addCounter: () => ({ stop: () => {} }), add: () => {} },
    cameras: { main: { shake: () => {} } },
    player: { x: -10000, y: 576, dead: false, body: { center: { x: -10000, y: 548 }, width: 40, height: 56 } },
    prog: { maxHp: 1000 }, bossOverride: null,
    spawnLog: [] as SpawnEvent[], playerDamage: [] as number[], endResults: [] as TrialResult[], numbers: [] as number[],
    spawnTrialMob(id: string, x: number, y: number): Monster | null {
      this.spawnLog.push({ time: this.time.now, id, x, y });
      return new MonsterClass(this as unknown as TrialHost, x, y, MONSTERS[id]);
    },
    hurtPlayer(damage: number) { this.playerDamage.push(damage); },
    damageNumber(_x: number, _y: number, damage: number) { this.numbers.push(damage); },
    log: () => {},
    onTrialEnd(result: TrialResult) { this.endResults.push(result); },
  };
  return scene as unknown as TestHost;
}
function definition(mul = 0.28, defence = 0): TrialDef {
  const def = JSON.parse(JSON.stringify(TRIALS.trial_foundation_altar)) as TrialDef;
  def.objective!.monsterDamageMul = mul;
  def.objective!.def = defence;
  return def;
}
function advanceMonster(mob: Monster, scene: TestHost, time: number) {
  scene.time.now = time;
  mob.step(time, scene.player);
}
function atEye(trial: AltarTrial, scene: TestHost, id: string) {
  const mob = scene.spawnTrialMob(id, trial.eye.x, trial.eye.y)!;
  mob.objective = {
    x: trial.eye.x, y: trial.eye.y, halfW: 40, climbVy: 600,
    hit: (m, raw) => trial.damageEye(raw, m.def.id),
  };
  return mob;
}

// 唯一结算函数：只乘一次倍率，再减防/round；非法与禁用伤害无受击副作用。
{
  eq(objectiveDamage(87, { monsterDamageMul: 0.28 }), 24, '87 × 0.28 取整');
  eq(objectiveDamage(87 * 0.8, { monsterDamageMul: 0.35, def: 3 }), 21, '技能系数 × 承伤 − 防御后取整');
  eq(objectiveDamage(10, {}), 10, '缺省倍率为 1、防御为 0');
  eq(objectiveDamage(10, { monsterDamageMul: 0.25, def: 0 }), 3, '2.5 四舍五入为 3');
  eq(objectiveDamage(10, { monsterDamageMul: 0.25, def: 3 }), 1, '有效正伤害至少 1');
  eq(objectiveDamage(87, { monsterDamageMul: 0 }), 0, '零承伤禁止扣血');
  for (const raw of [0, -1, NaN, Infinity, -Infinity]) eq(objectiveDamage(raw, { monsterDamageMul: 0.28 }), 0, `拒绝非法 raw ${raw}`);
  for (const mul of [-1, NaN, Infinity, -Infinity]) eq(objectiveDamage(87, { monsterDamageMul: mul }), 0, `拒绝非法倍率 ${mul}`);
  for (const defence of [NaN, Infinity, -Infinity]) eq(objectiveDamage(87, { def: defence }), 0, `拒绝非法防御 ${defence}`);
  const scene = host(), trial = new AltarTrial(scene, definition());
  eq(trial.damageEye(100, 'direct'), 28, '直接入口仍统一乘倍率');
  eq(trial.hp, 5972, '直接入口扣实际结算值');
  eq(trial.hitsBy.direct, 1, '一次有效伤害记一次来源');
  for (const raw of [0, -1, NaN, Infinity]) eq(trial.damageEye(raw, 'invalid'), 0, '非法入口返回 0');
  eq(trial.hp, 5972, '非法伤害不扣血');
  eq(trial.hitsBy.invalid, undefined, '非法伤害不记命中');
  eq(scene.numbers.length, 1, '非法伤害不飘数字');
  trial.end('held');
  eq(trial.damageEye(100, 'ended'), 0, '结束后返回 0');
  eq(trial.hp, 5972, '结束后不扣血');
  eq(trial.hitsBy.ended, undefined, '结束后不记命中');
}

// 近战前摇与冷却：真实 Monster.step 不在前摇开始/冷却中多扣血。
{
  const scene = host(), trial = new AltarTrial(scene, definition()), mob = atEye(trial, scene, 'heart_demon_imp');
  const initialHp = trial.hp;
  // 期望独立按当前怪表计算，不能漏掉近战技能系数，也不能在 AI 和阵眼各乘一次承伤。
  const damage = Math.round(mob.def.atk * mob.def.attack!.damageRatio * trial.def.objective!.monsterDamageMul!);
  advanceMonster(mob, scene, 0); eq(trial.hp, initialHp, '近战起手不扣血');
  advanceMonster(mob, scene, 299); eq(trial.hp, initialHp, '近战 300ms 前摇未结束');
  advanceMonster(mob, scene, 300); eq(trial.hp, initialHp - damage, '前摇结束按怪表技能系数扣血、承伤只乘一次');
  advanceMonster(mob, scene, 599); eq(trial.hp, initialHp - damage, '收招不重复结算');
  advanceMonster(mob, scene, 600); advanceMonster(mob, scene, 1499); eq(trial.hp, initialHp - damage, '冷却未到不攻击');
  advanceMonster(mob, scene, 1500); eq(trial.hp, initialHp - damage, '1500ms 起第二次前摇');
  advanceMonster(mob, scene, 1800); eq(trial.hp, initialHp - 2 * damage, '第二次前摇结束才扣血');
  same(trial.hitsBy, { heart_demon_imp: 2 }, '近战命中记录');
}

// 飞灵 objectiveHit:contact 走 touchDamageMul；useAttack:false 强制 1000ms，忽略弹道倍率/2000ms。
{
  const scene = host(), trial = new AltarTrial(scene, definition());
  trial.update(20000);
  const mob = trial.mobs.find(m => m.def.id === 'heart_demon_wisp')!;
  ok(mob, '实际第二波生成飞灵');
  mob.x = trial.eye.x; mob.y = trial.eye.y - 50;
  mob.def = { ...mob.def, touchDamageMul: 0.5 };
  eq(mob.objective!.useAttack, false, '飞灵覆盖禁止 attack');
  eq(mob.objective!.contact, true, '飞灵覆盖为贴身撞');
  const initialHp = trial.hp;
  const damage = Math.round(mob.def.atk * mob.def.touchDamageMul! * trial.def.objective!.monsterDamageMul!);
  let volleys = 0; mob.onVolley = () => { volleys++; };
  advanceMonster(mob, scene, 20000); eq(trial.hp, initialHp - damage, 'contact 按怪表攻击与 touchDamageMul，承伤只乘一次');
  advanceMonster(mob, scene, 20999); eq(trial.hp, initialHp - damage, 'contact 不在 1000ms 前重撞');
  advanceMonster(mob, scene, 21000); eq(trial.hp, initialHp - 2 * damage, 'contact 每 1000ms 命中');
  eq(volleys, 0, 'useAttack:false 不生成弹道');
  mob.objective!.contact = false;
  advanceMonster(mob, scene, 22000); eq(trial.hp, initialHp - 2 * damage, 'useAttack:false 且非 contact 不攻击阵眼');
  mob.objective!.contact = true;
  trial.def.objective!.monsterDamageMul = 0;
  advanceMonster(mob, scene, 23000); eq(trial.hp, initialHp - 2 * damage, '零倍率 contact 真实路径不漏最少 1 点');
  eq(scene.numbers.length, 2, '零倍率 contact 不产生受击数字');
}

// 远程 attack 打阵眼当前为前摇后直接命中，并非生成实物弹道；断言其真实旧路径。
{
  const scene = host(), trial = new AltarTrial(scene, definition()), mob = atEye(trial, scene, 'heart_demon_wisp');
  const initialHp = trial.hp;
  const damage = Math.round(mob.def.atk * mob.def.attack!.damageRatio * trial.def.objective!.monsterDamageMul!);
  let volleys = 0; mob.onVolley = () => { volleys++; };
  advanceMonster(mob, scene, 0); eq(trial.hp, initialHp, '远程目标前摇起手');
  advanceMonster(mob, scene, 300); eq(trial.hp, initialHp - damage, '远程原路径按怪表技能系数扣血、承伤只乘一次');
  eq(volleys, 0, '目标路径没有实物弹道');
  const zeroScene = host(), zeroTrial = new AltarTrial(zeroScene, definition(0)), zeroMob = atEye(zeroTrial, zeroScene, 'heart_demon_imp');
  advanceMonster(zeroMob, zeroScene, 0); advanceMonster(zeroMob, zeroScene, 300);
  eq(zeroTrial.hp, 6000, '零倍率近战真实路径不漏最少 1 点');
  eq(zeroScene.numbers.length, 0, '零倍率无受击副作用');
}

// 天雷只伤玩家，圈覆盖阵眼不调用阵眼扣血。
{
  const scene = host(), trial = new AltarTrial(scene, definition());
  trial.update(45000); // 实际 runWave -> dropThunder，两圈均采用确定性随机中点。
  const thunders = (trial as unknown as { thunders: { x: number; y: number }[] }).thunders;
  eq(thunders.length, 2, '45 秒两圈天雷');
  const thunder = thunders[0];
  eq(thunder.x, trial.eye.x, '确定性落雷覆盖阵眼横坐标');
  scene.player.body!.center.x = thunder.x;
  scene.player.body!.center.y = thunder.y;
  scene.time.now = 1199; trial.update(0); eq(scene.playerDamage.length, 0, '天雷预警 1200ms 前不打人');
  scene.time.now = 1200; trial.update(0);
  same(scene.playerDamage, [150, 150], '天雷每圈按玩家最大气血 15%');
  eq(trial.hp, 6000, '天雷覆盖阵眼仍不掉血');
  same(trial.hitsBy, {}, '天雷无阵眼命中记录');
}

// 波次起点立即刷，终点不刷；第三波 45 秒；55 秒撤怪，60 秒 held。
{
  const scene = host(), trial = new AltarTrial(scene, definition());
  trial.update(0); eq(scene.spawnLog.length, 2, '0 秒起点立即两只');
  const checkpoints: [number, number][] = [[5500, 4], [11000, 6], [16500, 8], [20000, 11], [27500, 14], [35000, 17], [40000, 17], [44999, 17], [45000, 21], [50000, 23], [54000, 25], [55000, 25]];
  for (const [time, count] of checkpoints) {
    scene.time.now = time; trial.update(time - trial.elapsed);
    eq(scene.spawnLog.length, count, `${time}ms 累计出生 ${count}`);
  }
  eq(scene.spawnLog.filter(m => m.time < 20000).length, 8, '第一波 8');
  eq(scene.spawnLog.filter(m => m.time >= 20000 && m.time < 40000).length, 9, '第二波 9');
  eq(scene.spawnLog.filter(m => m.time >= 45000 && m.time < 55000).length, 8, '第三波 8');
  eq(trial.mobs.filter(m => !m.dead).length, 0, '55 秒全撤怪');
  eq(trial.ended, false, '55 秒仍需守到 60 秒');
  scene.time.now = 59999; trial.update(4999); eq(trial.ended, false, '59999ms 未结算');
  scene.time.now = 60000; trial.update(1); same(scene.endResults, ['held'], '60000ms held');
  const failedScene = host(), failed = new AltarTrial(failedScene, definition());
  failed.damageEye(1e9, 'fatal'); eq(failed.hp, 0, '超过 6000 气血的伤害封顶归零');
  failed.update(0); eq(failed.ended, true, '真实气血归零结束');
  same(failedScene.endResults, ['broken'], '真实气血归零结算 broken');
}

type Baseline = { Monster: typeof Monster; AltarTrial: typeof AltarTrial; revision: string };
const before = (globalThis as unknown as { __altarBaseline: Baseline }).__altarBaseline;
ok(before, 'runner 加载 git show 基线生产模块');
type DamageEvent = { time: number; by: string; damage: number };
function simulate(MonsterClass: typeof Monster, TrialClass: typeof AltarTrial, mul: number) {
  const scene = host(MonsterClass), trial = new TrialClass(scene, definition(mul));
  const events: DamageEvent[] = [];
  const original = trial.damageEye.bind(trial);
  trial.hp = 1e9; // 不封顶记录同一 60 秒压力，避免阵眼提前归零改变刷怪/结算时间轴。
  trial.damageEye = (raw, by = '?') => {
    const hp = trial.hp;
    original(raw, by);
    const damage = hp - trial.hp;
    if (damage) events.push({ time: scene.time.now, by, damage });
    return damage;
  };
  const stepMs = 10;
  for (let time = 0; time <= 60000; time += stepMs) {
    scene.time.now = time;
    trial.update(time === 0 ? 0 : stepMs);
    for (const mob of trial.mobs) {
      // 无地形近似：地面怪已可顺利登台，水平步行；飞行依真实 AI 的 flyY/下降速度。
      if (!(mob.def as MonsterDef & { flying?: boolean }).flying) mob.y = trial.eye.y;
      mob.step(time, scene.player);
      mob.x += mob.body.velocity.x * stepMs / 1000;
      mob.y += mob.body.velocity.y * stepMs / 1000;
    }
  }
  eq(scene.spawnLog.length, 25, `倍率 ${mul} 时间轴 25 只`);
  same(scene.endResults, ['held'], `倍率 ${mul} 未限血时间轴完成`);
  ok(events.every(e => e.time < 55000), '55 秒撤怪后不再掉血');
  return { damage: events.reduce((sum, e) => sum + e.damage, 0), events, spawnLog: scene.spawnLog };
}
const estimates = [0.2, 0.28, 0.35, 0.45, 0.6].map(mul => {
  const old = simulate(before.Monster, before.AltarTrial, mul);
  const fixed = simulate(Monster, AltarTrial, mul);
  same(old.spawnLog, fixed.spawnLog, `倍率 ${mul} 修复前后刷怪时间轴相同`);
  same(old.events, fixed.events, `倍率 ${mul} 正倍率现有两种入口前后等价`);
  const eyeHp = TRIALS.trial_foundation_altar.objective!.hp;
  return {
    mul, beforeDamage: old.damage, afterDamage: fixed.damage,
    beforePressurePct: +(old.damage / eyeHp * 100).toFixed(2),
    afterPressurePct: +(fixed.damage / eyeHp * 100).toFixed(2),
    beforeLossHp: Math.min(old.damage, eyeHp),
    afterLossHp: Math.min(fixed.damage, eyeHp),
    beforeLossPct: +(Math.min(old.damage, eyeHp) / eyeHp * 100).toFixed(2),
    afterLossPct: +(Math.min(fixed.damage, eyeHp) / eyeHp * 100).toFixed(2),
    beforeRemainingHp: Math.max(0, eyeHp - old.damage),
    afterRemainingHp: Math.max(0, eyeHp - fixed.damage),
    beforeRemainingPct: +(Math.max(0, eyeHp - old.damage) / eyeHp * 100).toFixed(2),
    afterRemainingPct: +(Math.max(0, eyeHp - fixed.damage) / eyeHp * 100).toFixed(2),
    hits: fixed.events.length,
    impHits: fixed.events.filter(e => e.by === 'heart_demon_imp').length,
    wispHits: fixed.events.filter(e => e.by === 'heart_demon_wisp').length,
  };
});
console.log(`筑基台逻辑断言通过：${assertions} 项；旧代码 ${before.revision}。`);
console.log('估算假设：10ms 步长，实际怪表/波次/出生门，玩家远离且不清怪，省略地形/碰撞/登台耗时；天雷只伤玩家；55 秒撤怪。');
console.log('pressurePct 为未封顶伤害压力，lossPct 为阵眼最多扣 100%；不是实机主动清怪守阵剩余血预测。');
console.log(JSON.stringify(estimates, null, 2));
