import companionsRaw from '@xt/balance/companions.json';
import { AFFINITY, COMPANIONS, GAME_PHASE } from './data';
import { featureFlags } from './features';
import {
  dismissCompanionRelation, invite, SU_COMPANION_ID, SU_COMPANION_NPC_ID,
  type CompanionMode, type CompanionProgress,
} from './Companions';
import {
  CompanionFollowAi, COMPANION_DOWN_REVIVE_HARD, COMPANION_AREA_HARD,
  COMPANION_FOLLOW_HARD, COMPANION_MODES_HARD, COMPANION_REFLECT_HARD,
  type CompanionFollowEntity,
} from './CompanionFollowAi';
import type { GameScene } from './scenes/GameScene';
import type { Monster } from './scenes/Monster';

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

/** design/46 行为证：直接运行真实 CompanionFollowAi，时间由场景时钟推进。 */
export async function runCompanionDownReviveTests(options: { dataMode?: string } = {}): Promise<{ assertions: number }> {
  const label = options.dataMode ?? 'fixture';
  let assertions = 0;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected)) {
      throw new Error(`${label}: ${message}: ${JSON.stringify(actual)}，期望 ${JSON.stringify(expected)}`);
    }
  };
  const noDamage = (h: ReturnType<typeof makeHarness>, message: string) => {
    eq(h.mobs.flatMap(m => m.hits), [], `${message}：敌人未受伤`);
    eq(h.events.emitted.filter(e => e.name === 'skill:hit'), [], `${message}：无技能命中事件`);
  };
  const ms = companionsRaw.reviveMs;
  eq(ms, 30000, '保持表根 reviveMs=30000');
  eq(COMPANIONS?.reviveMs, ms, '运行时校验配置读同一表根');
  eq(COMPANION_DOWN_REVIVE_HARD, {
    companionId: SU_COMPANION_ID,
    down: { enabled: true, trigger: 'hostileHitOnCompanion && hp→0', stopPrimaryAreaReflect: true,
      cancelPendingStrikeAndReflect: true, fatalHitReflect: false, whileDowned: { noPrimaryAreaReflect: true } },
    revive: { readPath: 'companions.reviveMs', timerScope: 'sceneLocal', keepRelationAndMode: true,
      reviveMs: 30000, hpOnRevive: 'maxHp', iFramesMs: 1000, spawn: '原地', visibleDown: '苏师姐力竭', visibleRevive: '复起' },
    modes: { follow: { canDownAndRevive: true }, free: { canDownAndRevive: true }, stay: { canDownAndRevive: true } },
  }, 'design/46 完整硬读');

  // 41–45 数字保持；design/48 解锁主动 support，行为回归在下方通过真实控制器执行。
  eq([COMPANION_FOLLOW_HARD.followDist, COMPANION_FOLLOW_HARD.leashDist, COMPANION_FOLLOW_HARD.aggroRange], [96, 320, 320], '41 几何');
  eq([COMPANION_FOLLOW_HARD.primary.skillId, COMPANION_FOLLOW_HARD.primary.effectiveAiCooldownMs,
    COMPANION_FOLLOW_HARD.primary.engageRange], ['sword_qi_slash', 1200, { w: 240, h: 48 }], '41 primary');
  eq(COMPANION_FOLLOW_HARD.damage.budgetScale, 0.35, '总预算同乘一次');
  eq(COMPANION_MODES_HARD.bind, { defaultCode: 'KeyV', action: 'companion_mode_cycle' }, '42 KeyV');
  eq(COMPANION_MODES_HARD.cycle, ['follow', 'free', 'stay'], '42 三态');
  eq(COMPANION_MODES_HARD.free.aggroRange, 320, 'free320');
  eq([COMPANION_MODES_HARD.stay.zeroDamage, COMPANION_MODES_HARD.stay.invulnerable], [true, false], 'stay 零伤≠无敌');
  eq([COMPANION_AREA_HARD.skillId, COMPANION_AREA_HARD.effectiveAiCooldownMs, COMPANION_AREA_HARD.rangeAlign,
    COMPANION_AREA_HARD.starveGuardN], ['whirl_sword', 4000, { w: 160, h: 80, behind: 32 }, 2], '44 area');
  eq([COMPANION_MODES_HARD.schedule, COMPANION_AREA_HARD.supportLocked], ['primary_area_and_support', false], 'schedule＋support 解锁');
  eq([COMPANION_REFLECT_HARD.ratio, COMPANION_REFLECT_HARD.budgetScale, COMPANION_REFLECT_HARD.forbidEmitSwordShield],
    [0.5, 0.35, true], '45 ratio／budget／forbidEmit');

  const absent = makeHarness({ invited: false });
  eq(absent.ai.entityCount, 0, '无关系无实体');
  eq(absent.ai.projectFromRelation(), false, '无关系不建倒地链');
  eq(absent.ai.cycleMode(), null, '无实体 KeyV 无效');
  absent.prog.affinity[SU_COMPANION_NPC_ID] = 0;
  eq(invite(COMPANIONS, AFFINITY, absent.prog).status, 'need_confidant', '未达知交不可邀请');
  absent.tick(1_000_000);
  eq(absent.sprites.length, 0, '时间不能凭空生成实体');
  absent.ai.destroy();

  // 三态各验证恰好零血与过量致命、30 秒边界、原地满血复起及无敌帧边界。
  for (const mode of ['follow', 'free', 'stay'] as const) {
    for (const overkill of [0, 400]) {
      const h = makeHarness({ mode });
      const entity = h.entity(), sprite = h.sprite(), attacker = h.addMob();
      const downAt = h.scene.time.now;
      const position = { x: sprite.x, y: sprite.y };
      eq(h.ai.projectFromRelation(), false, `${mode} 幂等单实体`);
      sprite.body.setVelocityX(150).setVelocityY(-360);
      h.hit(entity.maxHp + entity.defense + overkill, attacker, downAt);
      eq(entity.hp, 0, `${mode}/${overkill} hp 截断到零`);
      eq(entity.downed, true, `${mode}/${overkill} 倒地`);
      eq(entity.reviveAt, downAt + ms, `${mode} 计时源为场景 now＋表根`);
      eq(entity.pendingStrike, undefined, `${mode} 不保留出招`);
      eq(entity.pendingReflect, undefined, `${mode} 致命无反伤排队`);
      eq(sprite.angle, 90, `${mode} 可见倒下姿态`);
      eq(h.logs, ['苏师姐力竭'], `${mode} 可见力竭提示`);
      eq(sprite.body.velocity, { x: 0, y: 0 }, `${mode} 倒地停止移动`);
      eq(sprite.body.moves, false, `${mode} 倒地停止物理位移`);
      eq(h.prog.companionRelations, { [SU_COMPANION_ID]: { mode } }, `${mode} 倒地保关系`);
      eq(h.hit(99999, attacker, downAt + 1000), 0, `${mode} 倒地后不再受击`);
      h.scene.player.x += 1000;
      h.tick(downAt + ms - 1);
      eq(entity.downed, true, `${mode} 29999ms 仍倒地`);
      eq({ x: sprite.x, y: sprite.y }, position, `${mode} 倒地不 follow leash`);
      eq(h.logs, ['苏师姐力竭'], `${mode} 倒地提示不逐帧重复`);
      noDamage(h, `${mode} 倒地全程`);
      h.tick(downAt + ms);
      eq(entity.downed, false, `${mode} 30000ms 边界复起`);
      eq(entity.hp, entity.maxHp, `${mode} 复起满血`);
      eq(entity.reviveAt, undefined, `${mode} 清除倒地时钟`);
      eq(sprite.angle, 0, `${mode} 可见站起姿态`);
      eq(sprite.body.moves, true, `${mode} 复起恢复物理移动`);
      eq({ x: sprite.x, y: sprite.y }, position, `${mode} 复起当帧原地`);
      eq(h.logs, ['苏师姐力竭', '复起'], `${mode} 可见复起提示`);
      eq(entity.hurtReadyAt, downAt + ms + 1000, `${mode} 复起无敌 1000ms`);
      eq(h.hit(entity.maxHp + entity.defense, attacker, downAt + ms + 999), 0, `${mode} 999ms 无敌`);
      eq(entity.hp, entity.maxHp, `${mode} 无敌期满血保持`);
      noDamage(h, `${mode} 致命及复起瞬间`);
      eq(h.hit(entity.defense + 100, attacker, downAt + ms + 1000), 100, `${mode} 1000ms 边界可受击`);
      eq(entity.hp, entity.maxHp - 100, `${mode} 复起后真实扣血`);
      eq(h.ai.currentMode(), mode, `${mode} 复起保 mode`);
      h.tick(downAt + ms + 1000);
      eq(attacker.hits.map(hit => hit.damage), mode === 'stay' ? [] : [18], `${mode} 复起后 45 反伤规则`);
      eq(h.events.emitted.some(e => e.name === 'skill:hit' && e.payload?.id === 'sword_shield'), false, `${mode} 主动 support 不走伤敌命中通道`);
      h.ai.destroy();
    }
  }

  // 出招和反伤都由真实控制器自然排队，致命受击应立即清掉已有 primary／area／reflect。
  for (const skill of ['sword_qi_slash', 'whirl_sword'] as const) {
    const h = makeHarness();
    const entity = h.entity(), sprite = h.sprite();
    // 本段隔离 support CD，专测既有 primary／area 的排队、取消和复起恢复。
    entity.supportReadyAt = Infinity;
    sprite.setFlipX(true);
    const attacker = h.addMob(skill === 'whirl_sword' ? 40 : 100);
    if (skill === 'whirl_sword') h.addMob(80);
    const first = h.scene.time.now;
    h.tick(first);
    eq(entity.pendingStrike?.skillId, skill, `${skill} 真实调度产生 pending`);
    h.hit(entity.defense + 100, attacker, first + 1);
    eq(entity.pendingReflect?.incomingHitDamage, 100, `${skill} 非致命命中产生 reflect pending`);
    const clocks = [entity.primaryReadyAt, entity.areaReadyAt];
    const downAt = first + 701;
    h.hit(entity.hp + entity.defense, attacker, downAt);
    eq(entity.downed, true, `${skill} 致命倒地`);
    eq(entity.pendingStrike, undefined, `${skill} 倒地取消 pendingStrike`);
    eq(entity.pendingReflect, undefined, `${skill} 倒地取消旧 pendingReflect`);
    eq([entity.primaryReadyAt, entity.areaReadyAt], clocks, `${skill} 倒地不重置 CD`);
    eq(h.ai.cycleMode(), 'free', `${skill} 倒地 KeyV→free`);
    eq(h.ai.cycleMode(), 'stay', `${skill} 倒地 KeyV→stay`);
    h.tick(downAt + 10000);
    eq(entity.downed, true, `${skill} 切 stay 不跳过倒地`);
    eq(entity.reviveAt, downAt + ms, `${skill} 切 mode 不重置复起计时`);
    eq(h.ai.cycleMode(), 'follow', `${skill} 倒地 KeyV→follow`);
    eq([entity.primaryReadyAt, entity.areaReadyAt], clocks, `${skill} KeyV 不重置两份 CD`);
    h.tick(downAt + ms);
    eq([entity.primaryReadyAt, entity.areaReadyAt], clocks, `${skill} 复起不重置两份 CD`);
    eq(entity.pendingStrike, undefined, `${skill} 复起不恢复旧 pending`);
    eq(entity.pendingReflect, undefined, `${skill} 复起不恢复旧 reflect`);
    noDamage(h, `${skill} 取消后无残放`);
    h.tick(downAt + ms + 1);
    eq(entity.pendingStrike?.skillId, skill, `${skill} 复起后恢复既有调度`);
    h.tick(downAt + ms + 1 + (skill === 'whirl_sword' ? 250 : 200));
    eq(attacker.hits.length, 1, `${skill} 复起后可战`);
    h.ai.destroy();
  }

  // 接触扫描遇到致命伤必须抢在到期 pending／follow leash 前停战。
  for (const skill of ['sword_qi_slash', 'whirl_sword'] as const) {
    const h = makeHarness();
    const entity = h.entity(), sprite = h.sprite();
    // 本段隔离 support CD，确保到期 pending 是待验证的 primary／area。
    entity.supportReadyAt = Infinity;
    sprite.setFlipX(true);
    const attacker = h.addMob(skill === 'whirl_sword' ? 40 : 100);
    if (skill === 'whirl_sword') h.addMob(80);
    const first = h.scene.time.now;
    h.tick(first);
    h.hit(entity.defense + 100, attacker, first + 1);
    const position = { x: sprite.x, y: sprite.y };
    attacker.x = sprite.x;
    attacker.def.touchDamage = true;
    attacker.def.atk = entity.hp + entity.defense;
    h.scene.player.x += 1000;
    h.tick(first + 701);
    eq(entity.downed, true, `${skill} 接触伤害可倒地`);
    eq(entity.pendingStrike, undefined, `${skill} 致命接触当帧取消已到期出招`);
    eq(entity.pendingReflect, undefined, `${skill} 致命接触当帧取消已到期反伤`);
    eq(sprite.body.resets, [], `${skill} 致命接触当帧不 leash 瞬移`);
    eq({ x: sprite.x, y: sprite.y }, position, `${skill} 接触倒地留原处`);
    noDamage(h, `${skill} 接触致命当帧停战`);
    h.tick(first + 701 + ms);
    eq({ x: sprite.x, y: sprite.y }, position, `${skill} 远离玩家仍原地复起`);
    h.tick(first + 702 + ms);
    eq(sprite.x, h.scene.player.x - 40, `${skill} 复起次帧既有 follow leash 可归位`);
    h.ai.destroy();
  }

  // 非致命接触仍按 45 同拍反伤；stay 可受伤，零伤含不放反伤／主招／area。
  for (const mode of ['follow', 'free', 'stay'] as const) {
    const h = makeHarness({ mode });
    const entity = h.entity(), attacker = h.addMob(0);
    attacker.def.touchDamage = true;
    attacker.def.atk = entity.defense + 100;
    h.tick(h.scene.time.now);
    eq(entity.hp, entity.maxHp - 100, `${mode} 非致命接触扣防后扣血`);
    eq(entity.downed, false, `${mode} 非致命不倒地`);
    eq(attacker.hits.map(hit => hit.damage), mode === 'stay' ? [] : [18], `${mode} 非致命反伤仅乘 0.35 一次`);
    if (mode === 'stay') eq(entity.pendingStrike, undefined, 'stay 无 primary／area');
    h.ai.destroy();
  }

  // 扫描改为致命门闩优先后，两笔非致命反伤仍分别命中原攻击者。
  for (const mode of ['follow', 'free'] as const) {
    const h = makeHarness({ mode });
    const entity = h.entity(), firstAttacker = h.addMob(100), nextAttacker = h.addMob(0);
    const first = h.scene.time.now;
    h.hit(entity.defense + 100, firstAttacker, first);
    eq(entity.pendingReflect?.attacker === firstAttacker.asMonster(), true, `${mode} 旧反伤保留原攻击者`);
    nextAttacker.def.touchDamage = true;
    nextAttacker.def.atk = entity.defense + 80;
    h.tick(first + COMPANION_REFLECT_HARD.hurtIframeMs + 1);
    eq(entity.hp, entity.maxHp - 180, `${mode} 两笔非致命伤均扣血`);
    eq(firstAttacker.hits.map(hit => hit.damage), [18], `${mode} 旧 pending 未被新命中覆盖`);
    eq(nextAttacker.hits.map(hit => hit.damage), [14], `${mode} 新接触反伤同拍结算`);
    eq(entity.pendingReflect, undefined, `${mode} 两笔结算后无残余 pending`);
    eq(entity.downed, false, `${mode} 两笔非致命不倒地`);
    h.ai.destroy();
  }

  // 非法接触源不引出倒地／复起。
  for (const reason of ['dead', 'noDamage', 'suppressed', 'noTouch', 'disabled'] as const) {
    const h = makeHarness({ mode: 'stay' });
    const entity = h.entity(), attacker = h.addMob(0);
    attacker.def.atk = entity.maxHp + entity.defense;
    attacker.def.touchDamage = reason !== 'noTouch';
    if (reason === 'dead') attacker.dead = true;
    if (reason === 'noDamage') attacker.def.noDamage = true;
    if (reason === 'suppressed') attacker.suppressTouch = true;
    if (reason === 'disabled') attacker.body.enable = false;
    h.tick(h.scene.time.now);
    eq(entity.hp, entity.maxHp, `${reason} 不造成合法受击`);
    eq(entity.downed, false, `${reason} 不启动复起`);
    eq(h.logs, [], `${reason} 不显示力竭`);
    h.ai.destroy();
  }

  const ownerDead = makeHarness();
  const ownerEntity = ownerDead.entity(), ownerAttacker = ownerDead.addMob();
  const ownerDownAt = ownerDead.scene.time.now;
  ownerDead.hit(ownerEntity.maxHp + ownerEntity.defense, ownerAttacker, ownerDownAt);
  ownerDead.scene.player.dead = true;
  ownerDead.tick(ownerDownAt + ms);
  eq(ownerEntity.downed, false, '玩家倒下不拖住同伴 sceneLocal 复起');
  eq(ownerEntity.hp, ownerEntity.maxHp, '玩家倒下时同伴仍按时满血复起');
  ownerDead.ai.destroy();

  // 解散中断本实例计时；再邀产生单个满血实体，旧 deadline 无幽灵复起。
  const dismissed = makeHarness({ mode: 'stay' });
  const old = dismissed.entity(), oldSprite = dismissed.sprite(), dismissAttacker = dismissed.addMob();
  const dismissAt = dismissed.scene.time.now;
  dismissed.hit(old.maxHp + old.defense, dismissAttacker, dismissAt);
  eq(dismissCompanionRelation(COMPANIONS, dismissed.prog).status, 'ok', '倒地可解散关系');
  eq(dismissed.ai.dismissEntity(), true, '倒地可立即毁实体');
  eq(oldSprite.active, false, '解散 sprite 销毁');
  eq(dismissed.colliders.every(c => c.destroyed), true, '解散销毁所有碰撞');
  eq(dismissed.prog.companionRelations, undefined, '解散清关系');
  dismissed.tick(dismissAt + ms + 1000);
  eq(dismissed.ai.entityCount, 0, '解散后无幽灵复起');
  eq(dismissed.logs, ['苏师姐力竭'], '已毁实体不发复起反馈');
  eq(invite(COMPANIONS, AFFINITY, dismissed.prog).status, 'ok', '倒地解散后可再邀');
  eq(dismissed.ai.spawnAfterInvite(), true, '再邀生成新实体');
  eq(dismissed.ai.spawnAfterInvite(), false, '再邀不重复生成');
  const renewed = dismissed.entity();
  eq(renewed === old, false, '再邀换实例');
  eq([renewed.hp, renewed.downed, renewed.reviveAt], [renewed.maxHp, false, undefined], '再邀满血无半段倒地');
  eq(dismissed.ai.currentMode(), 'follow', '再邀沿 43 初始 follow');
  dismissed.ai.destroy();

  // 切图 shutdown／读档仅保关系和 mode，半段倒地不进存档。
  for (const mode of ['follow', 'free', 'stay'] as const) {
    const oldMap = makeHarness({ mode });
    const entity = oldMap.entity(), sprite = oldMap.sprite(), attacker = oldMap.addMob();
    const downAt = oldMap.scene.time.now;
    oldMap.hit(entity.maxHp + entity.defense, attacker, downAt);
    oldMap.tick(downAt + 15000);
    const serialized = JSON.stringify(oldMap.prog);
    const saved = JSON.parse(serialized) as Omit<TestProgress, 'runSaveTransaction'>;
    eq(saved.companionRelations, { [SU_COMPANION_ID]: { mode } }, `${mode} 保存仅 mode`);
    eq(/downed|reviveAt|downedPosition|pendingStrike|pendingReflect|pendingSupport|activeSupportBuff/.test(serialized), false, `${mode} 不持久化倒地／时钟／pending／buff`);
    oldMap.events.emit('shutdown');
    eq(oldMap.ai.entityCount, 0, `${mode} shutdown 毁旧实例`);
    eq(sprite.active, false, `${mode} shutdown 毁 sprite`);
    eq(oldMap.colliders.every(c => c.destroyed), true, `${mode} shutdown 毁碰撞`);
    eq(oldMap.ai.projectFromRelation(), false, `${mode} 已 shutdown 不重建`);
    oldMap.tick(downAt + ms);
    eq(oldMap.logs, ['苏师姐力竭'], `${mode} 旧场景 deadline 无反馈`);
    for (const source of ['map', 'load'] as const) {
      const progress: TestProgress = source === 'map' ? oldMap.prog : {
        ...saved, runSaveTransaction<T>(apply: () => T | undefined) { return apply(); },
      };
      const next = makeHarness({ progress, now: 700 });
      const fresh = next.entity();
      eq(next.ai.entityCount, 1, `${mode}/${source} 恰 1 新投影`);
      eq(next.ai.currentMode(), mode, `${mode}/${source} mode 保留`);
      eq([fresh.hp, fresh.downed, fresh.reviveAt], [fresh.maxHp, false, undefined], `${mode}/${source} 满血无倒地残余`);
      eq(fresh.hurtReadyAt, 700, `${mode}/${source} 新场景时钟独立`);
      eq(next.logs, [], `${mode}/${source} 不发旧复起提示`);
      next.ai.destroy();
    }
  }

  eq(AFFINITY?.[SU_COMPANION_NPC_ID]?.gifts.enabled, false, 'gifts 仍关');
  eq(GAME_PHASE, 5, 'GAME_PHASE 不抬');
  eq(Object.keys(featureFlags()).some(k => /CompanionOpenFlag|companionOpen|softOpenedCompanion/.test(k)), false, '无新 OpenFlag／softOpenedCompanion＊');
  return { assertions };
}
