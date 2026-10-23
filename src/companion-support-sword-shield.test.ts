import companionsRaw from '@xt/balance/companions.json';
import npcsRaw from '@xt/balance/npcs.json';
import { AFFINITY, COMPANIONS, GAME_PHASE } from './data';
import { featureFlags } from './features';
import {
  invite, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionMode, type CompanionProgress,
} from './Companions';
import {
  CompanionFollowAi, COMPANION_DOWN_REVIVE_HARD, COMPANION_AREA_HARD, COMPANION_SUPPORT_HARD,
  COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD, COMPANION_REFLECT_HARD,
  chooseCompanionCombatSkill, companionDealtDamage, companionReflectResolve,
  type CompanionFollowEntity,
} from './CompanionFollowAi';
import type { GameScene } from './scenes/GameScene';
import type { Monster } from './scenes/Monster';
import { SKILLS } from './skills';

class MockBody {
  enable = true;
  moves = true;
  width = 46;
  height = 58;
  velocity = { x: 0, y: 0 };
  blocked = { down: true };
  touching = { down: true };
  prev = { y: 0 };
  resets: { x: number; y: number }[] = [];
  constructor(readonly owner: { x: number; y: number }) {}
  get x() { return this.owner.x - this.width / 2; }
  get y() { return this.owner.y - this.height; }
  setSize(w: number, h: number) { this.width = w; this.height = h; return this; }
  setOffset(_x: number, _y: number) { return this; }
  setMaxVelocityY(_y: number) { return this; }
  setVelocityX(x: number) { this.velocity.x = x; return this; }
  setVelocityY(y: number) { this.velocity.y = y; return this; }
  reset(x: number, y: number) {
    this.owner.x = x; this.owner.y = y;
    this.velocity = { x: 0, y: 0 };
    this.resets.push({ x, y });
    return this;
  }
}

class MockSprite {
  active = true;
  flipX = false;
  angle = 0;
  frame = { realWidth: 64, realHeight: 72 };
  texture: { key: string };
  body: MockBody;
  animations: string[] = [];
  anims = { stop: () => this };
  constructor(public x: number, public y: number, texture: string) {
    this.texture = { key: texture };
    this.body = new MockBody(this);
  }
  setOrigin(_x: number, _y: number) { return this; }
  setDepth(_depth: number) { return this; }
  setFlipX(flip: boolean) { this.flipX = flip; return this; }
  setAngle(angle: number) { this.angle = angle; return this; }
  play(key: string, _ignoreIfPlaying: boolean) { this.animations.push(key); return this; }
  destroy() { this.active = false; }
}

class MockMonster {
  active = true;
  dead = false;
  suppressTouch = false;
  hp = 10000;
  body: MockBody;
  hits: { time: number; damage: number; direction: number }[] = [];
  def: { id: string; atk: number; def: number; touchDamage: boolean; noDamage?: boolean; touchDamageMul?: number };
  constructor(public x: number, public y: number, id: string) {
    this.body = new MockBody(this);
    this.def = { id, atk: 100, def: 0, touchDamage: false };
  }
  takeHit(time: number, damage: number, direction: number) {
    this.hp = Math.max(0, this.hp - damage);
    this.hits.push({ time, damage, direction });
  }
  asMonster() { return this as unknown as Monster; }
}

class MockEvents {
  emitted: { name: string; payload?: { id?: string; [key: string]: unknown } }[] = [];
  onceCallbacks = new Map<string, (() => void)[]>();
  once(name: string, callback: () => void) {
    this.onceCallbacks.set(name, [...(this.onceCallbacks.get(name) ?? []), callback]);
  }
  emit(name: string, payload?: { id?: string; [key: string]: unknown }) {
    this.emitted.push({ name, payload });
    const callbacks = this.onceCallbacks.get(name) ?? [];
    this.onceCallbacks.delete(name);
    for (const callback of callbacks) callback();
  }
}

interface TestProgress extends CompanionProgress {
  affinity: Record<string, number>;
  maxHp: number; def: number; atk: number;
}

/** 真实控制器负责生成和管理实体；仅 Phaser 场景、刚体及敌人是替身。 */
function makeHarness(options: { mode?: CompanionMode; invited?: boolean; now?: number; progress?: TestProgress } = {}) {
  const threshold = AFFINITY?.[SU_COMPANION_NPC_ID]?.tiers.find(t => t.id === 'confidant')?.min ?? 300;
  const prog: TestProgress = options.progress ?? {
    affinity: { [SU_COMPANION_NPC_ID]: threshold }, maxHp: 1000, def: 20, atk: 100,
    runSaveTransaction<T>(apply: () => T | undefined) { return apply(); },
  };
  // 对齐 Progress 的基础上限 getter；不增加夹具存档字段或改动原生命值。
  Object.defineProperty(prog, 'baseMaxHp', { configurable: true, get: () => prog.maxHp });
  if (!options.progress && options.invited !== false) {
    const invited = invite(COMPANIONS, AFFINITY, prog);
    if (invited.status !== 'ok') throw new Error(`fixture 邀请失败: ${invited.status}`);
    prog.companionRelations![SU_COMPANION_ID].mode = options.mode ?? 'follow';
  }
  const sprites: MockSprite[] = [];
  const colliders: { destroyed: boolean; destroy(): void }[] = [];
  const mobs: MockMonster[] = [];
  const logs: string[] = [];
  const damageNumbers: { x: number; y: number; damage: number }[] = [];
  const events = new MockEvents();
  const scene = {
    prog, player: { x: 1000, feet: 300, facing: 1, depth: 20, dead: false },
    time: { now: options.now ?? 12000 }, mobs, events,
    map: { solids: {}, oneWays: {} },
    textures: { exists: (_key: string) => true }, anims: { exists: (_key: string) => true },
    physics: { add: {
      sprite(x: number, y: number, texture: string) {
        const sprite = new MockSprite(x, y, texture); sprites.push(sprite); return sprite;
      },
      collider(..._args: unknown[]) {
        const collider = { destroyed: false, destroy() { this.destroyed = true; } };
        colliders.push(collider); return collider;
      },
    } },
    log(message: string) { logs.push(message); },
    damageNumber(x: number, y: number, damage: number, ..._style: string[]) { damageNumbers.push({ x, y, damage }); },
  };
  const ai = new CompanionFollowAi(scene as unknown as GameScene);
  ai.projectFromRelation();
  return {
    ai, scene, prog, sprites, mobs, logs, damageNumbers, events, colliders,
    entity(): CompanionFollowEntity {
      const entity = ai.liveEntity;
      if (!entity) throw new Error('fixture 应有实体');
      return entity;
    },
    sprite() {
      const sprite = sprites[sprites.length - 1];
      if (!sprite) throw new Error('fixture 应有 sprite');
      return sprite;
    },
    addMob(dx = 100) {
      const sprite = sprites[sprites.length - 1];
      const mob = new MockMonster((sprite?.x ?? scene.player.x) + dx, sprite?.y ?? scene.player.feet, `enemy_${mobs.length}`);
      mobs.push(mob); return mob;
    },
    tick(now: number) { scene.time.now = now; ai.update(now); },
    hit(rawDamage: number, mob: MockMonster, now: number, allowReflect = true) {
      scene.time.now = now;
      const entity = ai.liveEntity;
      if (!entity) throw new Error('受击前应有实体');
      return ai.takeHostileHit(entity, rawDamage, mob.asMonster(), now, allowReflect);
    },
  };
}

/** design/48：真实控制器主动 buff；反伤与主动施法分别验证。 */
export async function runCompanionSupportSwordShieldTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  function ok(value: unknown, message: string): asserts value { eq(!!value, true, message); }
  const casts = (h: ReturnType<typeof makeHarness>) => h.events.emitted.filter(e => e.name === 'companion:support-cast');
  const hits = (h: ReturnType<typeof makeHarness>) => h.events.emitted.filter(e => e.name === 'skill:hit');
  const noOffense = (h: ReturnType<typeof makeHarness>, message: string) => {
    eq(h.mobs.flatMap(m => m.hits), [], `${message}：无敌人伤害`);
    eq(hits(h), [], `${message}：无 skill:hit`);
  };

  eq(COMPANION_SUPPORT_HARD, {
    skillId: 'sword_shield', effectiveAiCooldownMs: 30000, telegraphMs: 200, recoverMs: 200,
    preferRemainingMs: 3000, starveGuardN: 2, mpCost: 30, durationMs: 60000, damageReduce: 0.05,
    modes: { follow: true, free: true, stay: false }, supportEntersDamageBudget: false,
    cancelPendingOnStay: true, clearBuffOnDown: true,
  }, '48 完整主动 support 硬读');
  eq([COMPANION_MODES_HARD.schedule, COMPANION_AREA_HARD.supportLocked],
    ['primary_area_and_support', false], '三技能调度且 support 解锁');
  eq([COMPANION_MODES_HARD.stay.stopSupport, COMPANION_MODES_HARD.stay.cancelPendingSupportOnEnter],
    [true, true], 'stay 禁 support 并立即取消 pending');
  eq([SU_COMPANION_ID, SU_COMPANION_NPC_ID], ['companion_senior_sister_su', 'senior_sister_su'], '仅苏师姐');
  eq(companionsRaw.companions.map(c => [c.id, c.npcId]), [[SU_COMPANION_ID, SU_COMPANION_NPC_ID]], '表唯一同伴');
  eq(companionsRaw.companions[0].skills.filter(s => s.role === 'support').map(s => s.skillId),
    ['sword_shield'], '唯一 support=sword_shield');
  const shield = SKILLS.sword_shield;
  eq([shield.type, shield.mpCost, shield.cooldownMs, shield.durationMs, shield.damageRatio,
    shield.effects.damageReduce, shield.effects.reflectRatio], ['buff', 30, 30000, 60000, 0, 0.05, 0.5], '根表基值只读');

  // 41–47 的几何、预算、反伤、复起与来源不随主动 buff 漂移。
  eq([COMPANION_FOLLOW_HARD.followDist, COMPANION_FOLLOW_HARD.leashDist,
    COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs], [96, 320, 1200], '41 follow96/leash320/CD1200');
  eq([COMPANION_AREA_HARD.effectiveAiCooldownMs, COMPANION_AREA_HARD.rangeAlign, COMPANION_AREA_HARD.starveGuardN],
    [4000, { w: 160, h: 80, behind: 32 }, 2], '44 area4000/160×80/behind32/N2');
  eq([COMPANION_FOLLOW_HARD.damage.budgetScale, COMPANION_REFLECT_HARD.ratio,
    COMPANION_REFLECT_HARD.forbidEmitSwordShield], [0.35, 0.5, true], 'budget/reflect/forbidEmit 保持');
  eq([companionsRaw.reviveMs, COMPANION_DOWN_REVIVE_HARD.revive.reviveMs,
    COMPANION_DOWN_REVIVE_HARD.revive.hpOnRevive, COMPANION_DOWN_REVIVE_HARD.revive.iFramesMs],
    [30000, 30000, 'maxHp', 1000], '46 复起30000/满血/无敌1000');
  eq(companionDealtDamage({ playerAtk: 100, skillRatio: 1.6, targetDef: 0, roll: 1 }), 56, 'primary 单份×0.35');
  eq(companionDealtDamage({ playerAtk: 100, skillRatio: 0.9, targetDef: 0, roll: 1 }), Math.round(100 * 0.9 * 0.35), 'area 单份×0.35');
  eq(companionReflectResolve({ incomingHitDamage: 100 }),
    { damage: 18, ratio: 0.5, budgetScale: 0.35, emitSkillId: null }, 'reflect 无需先施放且不 emit shield');
  const su = npcsRaw.find(n => n.id === SU_COMPANION_NPC_ID)!;
  eq(su.affinity?.gifts.enabled, false, 'gifts.enabled=false');
  if (options.dataMode === 'snapshot') {
    eq(su.affinity?.sources, ['q_su_fellow_meet', 'q_su_fellow_tour', 'q_su_fellow_confide']
      .map(quest => ({ type: 'quest', quest, on: 'done', once: true, delta: 100 })), '47 正式快照三来源100/100/100');
  }
  eq(GAME_PHASE, 5, '不抬 GAME_PHASE');
  eq(Object.keys(featureFlags()), ['fiveSectClasses', 'sectDaily', 'sectRanks', 'sectShopLibrary', 'shops',
    'sectDonations', 'seclusion', 'alchemyPhase1', 'v05Maps', 'foxBoss', 'talismanCraft', 'lifeSkillCurve',
    'spiritScan', 'indexedDbSaves', 'secret_boon_runtime'], '仅新增 design/49 机缘软闸，无新 OpenFlag 或 softOpenedCompanion 开关');
  eq(featureFlags().secret_boon_runtime, false, 'design/49 机缘软闸默认 false，不改变同行硬读');

  const ready = {
    areaReady: true, primaryReady: true, legalInBox: 2, primaryInReach: true, areaMissStreak: 0,
    supportReady: true, mpReady: true, hasActiveShield: false, shieldRemainingMs: 0,
    supportMissStreak: 0, mode: 'follow' as const,
  };
  eq(chooseCompanionCombatSkill(ready).skill, 'sword_shield', '就绪无 buff 优先 support');
  eq(chooseCompanionCombatSkill({ ...ready, mode: 'free' }).skill, 'sword_shield', 'free 可选 support');
  eq(chooseCompanionCombatSkill({ ...ready, mode: 'stay' }).skill, null, 'stay 不选任何主动技能');
  eq(chooseCompanionCombatSkill({ ...ready, supportReady: false }).skill, 'whirl_sword', 'support CD 未好退 area');
  eq(chooseCompanionCombatSkill({ ...ready, mpReady: false }).skill, 'whirl_sword', 'MP 不足退 area');
  eq(chooseCompanionCombatSkill({ ...ready, hasActiveShield: true, shieldRemainingMs: 3000 }).skill,
    'whirl_sword', '剩余恰3000ms 不优先刷新');
  eq(chooseCompanionCombatSkill({ ...ready, hasActiveShield: true, shieldRemainingMs: 2999 }).skill,
    'sword_shield', '剩余2999ms 优先刷新');
  eq(chooseCompanionCombatSkill({ ...ready, hasActiveShield: true, shieldRemainingMs: 60000 }).skill,
    'whirl_sword', '有效长 buff 延续 area');
  eq(chooseCompanionCombatSkill({ ...ready, supportReady: false, legalInBox: 1 }).skill,
    'sword_qi_slash', '否则沿44 area→primary');
  eq(chooseCompanionCombatSkill({ ...ready, supportMissStreak: 1 }).skill,
    'whirl_sword', 'support 一次假阳性后第2可决策拍放行 area');
  eq(chooseCompanionCombatSkill({ ...ready, supportMissStreak: 1, legalInBox: 1 }).skill,
    'sword_qi_slash', 'support 一次假阳性后第2可决策拍放行 primary');

  // 不要求敌人存在或 primary/area 就绪：support 有自己的可决策时钟。
  for (const mode of ['follow', 'free'] as const) {
    const h = makeHarness({ mode }), e = h.entity(), now = h.scene.time.now;
    eq([e.supportReadyAt, e.supportMissStreak, e.companionMp], [now, 0, 30], `${mode} 初始 CD/MP`);
    e.primaryReadyAt = now + 99999;
    e.areaReadyAt = now + 99999;
    h.tick(now);
    eq(e.pendingSupport, { skillId: 'sword_shield', castAt: now + 200 }, `${mode} 独立 pendingSupport`);
    eq([e.pendingStrike, e.pendingReflect], [undefined, undefined], `${mode} 不走伤敌/反伤通道`);
    eq([e.companionMp, e.supportReadyAt], [30, now], `${mode} telegraph 不先扣费或推进CD`);
    h.tick(now + 199);
    eq(e.activeSupportBuff, undefined, `${mode} 前摇未到不生效`);
    h.tick(now + 200);
    eq(e.pendingSupport, undefined, `${mode} cast 清 pending`);
    eq(e.activeSupportBuff, { expireAt: now + 200 + 60000, damageReduce: 0.05 }, `${mode} 表时长与减伤`);
    eq([e.companionMp, e.supportReadyAt], [0, now + 200 + 30000], `${mode} cast 按表扣30并进CD30000`);
    eq([e.primaryReadyAt, e.areaReadyAt], [now + 99999, now + 99999], `${mode} 不碰另外两条 CD`);
    eq(casts(h).map(c => [c.payload?.id, c.payload?.companionSupport]), [['sword_shield', true]], `${mode} 一次主动施法反馈`);
    eq(h.events.emitted.filter(e => e.name === 'skill:cast'), [], `${mode} 不触发玩家全局 skill:cast`);
    eq(h.logs, ['苏师姐施展剑罡护体'], `${mode} 主动 buff 可见日志`);
    noOffense(h, `${mode} 主动 buff 无伤害预算`);
    h.tick(now + 400);
    eq(casts(h).length, 1, `${mode} 同拍重入不重复施放`);
    h.ai.destroy();
  }

  // 双敌同时满足 area 时仍先 support；cast 拍绝不补发 primary/area。
  const offense = makeHarness(), oe = offense.entity(), ot = offense.scene.time.now;
  offense.sprite().setFlipX(true);
  const first = offense.addMob(60), second = offense.addMob(100);
  offense.tick(ot);
  eq([oe.pendingSupport?.skillId, oe.pendingStrike], ['sword_shield', undefined], '双敌只排一个 support');
  offense.tick(ot + 200);
  noOffense(offense, 'support cast 拍不双放');
  eq(oe.pendingStrike, undefined, 'support cast 后当拍不排伤敌技能');
  const originalRandom = Math.random;
  Math.random = () => 0.5;
  try {
    offense.tick(ot + 400);
    eq(oe.pendingStrike?.skillId, 'whirl_sword', 'support 后沿44 area优先');
    offense.tick(ot + 650);
    eq([first.hits.map(h => h.damage), second.hits.map(h => h.damage)], [[Math.round(100 * 0.9 * 0.35)], [Math.round(100 * 0.9 * 0.35)]], 'area 未叠第二份×0.35');
    offense.tick(ot + 900);
    eq(oe.pendingStrike?.skillId, 'sword_qi_slash', 'area CD 中 primary 可独立出手');
    offense.tick(ot + 1100);
    eq(hits(offense).filter(e => e.payload?.id === 'sword_qi_slash').map(e => e.payload?.damage),
      [56], 'primary 未叠第二份×0.35');
  } finally { Math.random = originalRandom; }
  eq(oe.supportReadyAt, ot + 30200, 'primary/area 未改变 support CD');
  eq(hits(offense).some(e => e.payload?.id === 'sword_shield'), false, 'shield 永不当伤害命中 id');
  offense.ai.destroy();

  // 运行时剩余阈值、CD 与 MP 门槛，不仅验证纯函数。
  for (const remaining of [3000, 2999]) {
    const h = makeHarness(), e = h.entity(), now = h.scene.time.now;
    h.addMob(60);
    e.activeSupportBuff = { expireAt: now + remaining, damageReduce: 0.05 };
    h.tick(now);
    eq([e.pendingSupport?.skillId, e.pendingStrike?.skillId], remaining === 2999
      ? ['sword_shield', undefined] : [undefined, 'sword_qi_slash'], `真实剩余${remaining}ms边界`);
    h.ai.destroy();
  }
  for (const gate of ['mp', 'cd'] as const) {
    const h = makeHarness(), e = h.entity(), now = h.scene.time.now;
    h.addMob(60);
    if (gate === 'mp') e.companionMp = 29;
    else e.supportReadyAt = now + 1;
    h.tick(now);
    eq(e.pendingSupport, undefined, `${gate} 未就绪不排support`);
    eq(e.pendingStrike?.skillId, 'sword_qi_slash', `${gate} 未就绪不阻塞primary`);
    h.ai.destroy();
  }

  // pending 后发生假阳性：实际施法重新验 MP/CD/buff；第二可决策拍放行伤敌技能。
  for (const invalid of ['mp', 'cd', 'buff'] as const) {
    const h = makeHarness(), e = h.entity(), now = h.scene.time.now;
    h.sprite().setFlipX(true);
    h.addMob(60);
    if (invalid !== 'mp') h.addMob(100);
    h.tick(now);
    ok(e.pendingSupport, `${invalid} 首拍选support`);
    if (invalid === 'mp') e.companionMp = 0;
    if (invalid === 'cd') e.supportReadyAt = now + 10000;
    if (invalid === 'buff') e.activeSupportBuff = { expireAt: now + 60000, damageReduce: 0.05 };
    const before = [e.companionMp, e.supportReadyAt];
    h.tick(now + 200);
    eq(e.pendingSupport, undefined, `${invalid} 假阳性取消pending`);
    eq(casts(h), [], `${invalid} 不伪报成功施法`);
    eq([e.companionMp, e.supportReadyAt], before, `${invalid} 失败不扣MP不推进CD`);
    eq(e.supportMissStreak, 1, `${invalid} 失败计第1次`);
    noOffense(h, `${invalid} 失败拍无双放`);
    e.companionMp = 30;
    e.supportReadyAt = now;
    e.activeSupportBuff = undefined;
    h.tick(now + 400);
    eq(e.pendingSupport, undefined, `${invalid} 第2可决策拍跳过support`);
    eq(e.pendingStrike?.skillId, invalid === 'mp' ? 'sword_qi_slash' : 'whirl_sword', `${invalid} N2放行原44调度`);
    h.tick(now + (invalid === 'mp' ? 600 : 650));
    ok(hits(h).length, `${invalid} 伤敌实际落地`);
    eq(e.supportMissStreak, 0, `${invalid} 伤敌成功清support streak`);
    h.ai.destroy();
  }

  // stay 默认不施法；切态、updateStay、clearAiFlags 三个入口均立即撤销 pending。
  const stay = makeHarness({ mode: 'stay' }), se = stay.entity(), st = stay.scene.time.now;
  stay.addMob(60);
  stay.tick(st);
  stay.tick(st + 1000);
  eq([se.pendingSupport, se.activeSupportBuff], [undefined, undefined], 'stay 默认不放support');
  eq(se.companionMp, 30, 'stay 不扣MP');
  noOffense(stay, 'stay 零伤');
  stay.ai.destroy();
  for (const entry of ['cycleMode', 'updateStay', 'clearAiFlags'] as const) {
    const h = makeHarness({ mode: 'free' }), e = h.entity(), now = h.scene.time.now;
    h.tick(now);
    ok(e.pendingSupport, `${entry} 取消前有pending`);
    if (entry === 'cycleMode') eq(h.ai.cycleMode(), 'stay', 'free→stay');
    else if (entry === 'updateStay') {
      h.prog.companionRelations![SU_COMPANION_ID].mode = 'stay';
      h.tick(now + 1);
    } else h.ai.clearAiFlags();
    eq(e.pendingSupport, undefined, `${entry} 立即取消pending support`);
    h.prog.companionRelations![SU_COMPANION_ID].mode = 'stay';
    h.tick(now + 200);
    eq([e.activeSupportBuff, e.companionMp, casts(h).length], [undefined, 30, 0], `${entry} 取消后不施法扣费`);
    h.ai.destroy();
  }

  // buff 实际减伤按扣防后×0.95；stay 保留已生效 buff，过期恢复正常受伤。
  const defense = makeHarness(), de = defense.entity(), dt = defense.scene.time.now, attacker = defense.addMob(60);
  defense.tick(dt);
  defense.tick(dt + 200);
  eq(defense.hit(110, attacker, dt + 800), 95, '扣防100后减伤5%=95');
  defense.tick(dt + 800);
  eq(attacker.hits.map(h => h.damage), [17], '减伤后反伤95×0.5×0.35仍只乘一份预算');
  eq(hits(defense).map(e => e.payload?.id), ['companion_reflect'], '有主动buff仍走独立reflect命中通道');
  defense.ai.cycleMode();
  defense.ai.cycleMode();
  ok(de.activeSupportBuff, '进入stay保留已生效buff');
  defense.tick(dt + 1500);
  eq(defense.hit(110, attacker, dt + 1500), 95, 'stay 仍受伤且享有有效buff');
  eq(de.pendingReflect, undefined, 'stay受击不反伤');
  defense.tick(dt + 60200);
  eq(de.activeSupportBuff, undefined, '有效期边界清过期buff');
  eq(defense.hit(110, attacker, dt + 60200), 100, '过期后恢复扣防100');
  defense.ai.destroy();

  // reflect 独立于主动 buff：MP不够、无buff照常反伤，只有companion_reflect命中。
  const reflect = makeHarness(), re = reflect.entity(), rt = reflect.scene.time.now, foe = reflect.addMob(60);
  re.companionMp = 0;
  re.primaryReadyAt = rt + 99999;
  re.areaReadyAt = rt + 99999;
  eq(reflect.hit(110, foe, rt), 100, '无shield照常受击');
  ok(re.pendingReflect, '无shield无需先cast即可排reflect');
  eq(re.pendingSupport, undefined, 'reflect不借support通道');
  reflect.tick(rt);
  eq(foe.hits.map(h => h.damage), [18], '反伤100×0.5×0.35');
  eq(hits(reflect).map(e => e.payload?.id), ['companion_reflect'], 'reflect不用sword_shield命中id');
  eq(casts(reflect), [], 'reflect永不emit主动施法');
  eq([re.activeSupportBuff, re.pendingSupport, re.companionMp, re.supportReadyAt],
    [undefined, undefined, 0, rt], 'reflect不改support buff/MP/CD');
  reflect.ai.destroy();

  // 倒地先清主动buff/pending；满血复起后support重新等整条CD。
  const down = makeHarness(), downEntity = down.entity(), downStart = down.scene.time.now, killer = down.addMob(60);
  down.tick(downStart);
  down.tick(downStart + 200);
  ok(downEntity.activeSupportBuff, '倒地前buff已生效');
  downEntity.companionMp = 30;
  const downAt = downStart + 1000;
  down.hit(99999, killer, downAt);
  eq([downEntity.downed, downEntity.hp, downEntity.activeSupportBuff, downEntity.pendingSupport,
    downEntity.pendingReflect], [true, 0, undefined, undefined, undefined], '致命先清buff和所有主动/反伤pending');
  eq(downEntity.reviveAt, downAt + 30000, '仍是sceneLocal30000');
  down.tick(downAt + 29999);
  eq(downEntity.downed, true, '29999ms仍倒地');
  down.tick(downAt + 30000);
  eq([downEntity.downed, downEntity.hp, downEntity.hurtReadyAt],
    [false, downEntity.maxHp, downAt + 31000], '30000ms满血复起加1000ms无敌');
  eq(downEntity.activeSupportBuff, undefined, '复起不恢复旧buff');
  ok(downEntity.supportReadyAt >= downAt + 60000, '复起后必须重新CD30000');
  down.ai.clearAiFlags();
  down.tick(downEntity.supportReadyAt - 1);
  eq(downEntity.pendingSupport, undefined, '复起support CD边界前不可施放');
  down.ai.clearAiFlags();
  down.tick(downEntity.supportReadyAt);
  eq(downEntity.pendingSupport?.skillId, 'sword_shield', '复起重新CD完成后可施放');
  down.ai.destroy();

  const pendingDown = makeHarness(), pe = pendingDown.entity(), pt = pendingDown.scene.time.now, pm = pendingDown.addMob();
  pendingDown.tick(pt);
  ok(pe.pendingSupport, '倒地前尚有主动pending');
  pendingDown.hit(99999, pm, pt + 100);
  eq(pe.pendingSupport, undefined, '倒地即时取消主动pending');
  pendingDown.tick(pt + 200);
  eq(casts(pendingDown), [], '倒地不补放取消的buff');
  pendingDown.ai.destroy();

  const absent = makeHarness({ invited: false });
  absent.tick(999999);
  eq([absent.ai.entityCount, casts(absent).length], [0, 0], '无关系不投影或施放support');
  absent.ai.destroy();
  return { assertions };
}
