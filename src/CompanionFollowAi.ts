import Phaser from 'phaser';
import { ATLAS_INFO, COMPANIONS } from './data';
import {
  activeCompanion, cycleCompanionMode, SU_COMPANION_ID, type CompanionMode,
} from './Companions';
import type { GameScene } from './scenes/GameScene';
import type { Monster } from './scenes/Monster';
import { SKILLS, skillNumber } from './skills';

/**
 * design/41 · 同行 AI follow 硬读（演武定稿；design/42 不漂此表）。
 * design/42 扩展 mode 状态机（free／stay／切换）；与 FriendlySummons 隔离；禁新 OpenFlag。
 * ≠ 开态 ≠ soft ≠ release ≠ Pages。
 */
export const COMPANION_FOLLOW_HARD = Object.freeze({
  companionId: SU_COMPANION_ID,
  mode: 'follow' as const,
  followDist: 96,
  leashDist: 320,
  aggroRange: 320,
  primary: Object.freeze({
    skillId: 'sword_qi_slash' as const,
    effectiveAiCooldownMs: 1200,
    engageRange: Object.freeze({ w: 240, h: 48 }),
    telegraphMs: 200,
    recoverMs: 200,
    useTableCooldownMs: false as const,
  }),
  damage: Object.freeze({
    budgetScale: 0.35,
    atkSource: 'player.atk' as const,
    reflectAlsoScaled: true as const,
    noPerSkillBudgetStack: true as const,
  }),
  /** 可选占位：灵狼旁证；不写 companions.json */
  attrs: Object.freeze({
    hpRatioOfOwner: 0.6,
    defRatioOfOwner: 0.5,
    moveSpeed: 150,
  }),
  /** 运行时实体命名空间；禁止与 FriendlySummons.pets 混链 */
  entityNamespace: 'companion_follow' as const,
  spriteKey: 'npc_senior_sister_su' as const,
});

/** design/42 · free／stay／切换硬读（≠落 companions／skills 字节）。 */
export const COMPANION_MODES_HARD = Object.freeze({
  cycle: Object.freeze(['follow', 'free', 'stay'] as const),
  entry: 'keyCycle' as const,
  bind: Object.freeze({
    defaultCode: 'KeyV' as const,
    action: 'companion_mode_cycle' as const,
  }),
  free: Object.freeze({
    aggroRange: 320,
    engageRange: Object.freeze({ w: 240, h: 48 }),
    leashTeleport: false as const,
    forcePlayerTarget: false as const,
  }),
  stay: Object.freeze({
    zeroDamage: true as const,
    stopFollow: true as const,
    stopChase: true as const,
    invulnerable: false as const,
    keepRelation: true as const,
  }),
  switch: Object.freeze({
    noBudgetStack: true as const,
    noCooldownStackOrReset: true as const,
    clearAiFlagsOnEnter: true as const,
  }),
  schedule: 'primary_only' as const,
});

export type CompanionFollowEntityId = `${typeof COMPANION_FOLLOW_HARD.entityNamespace}:${typeof SU_COMPANION_ID}`;

export function companionFollowEntityId(): CompanionFollowEntityId {
  return `${COMPANION_FOLLOW_HARD.entityNamespace}:${SU_COMPANION_ID}`;
}

/** primary skillRatio；本刀验收可用基值 1.6（skillLv=1）。 */
export function companionPrimarySkillRatio(skillLevel = 1): number {
  const def = SKILLS[COMPANION_FOLLOW_HARD.primary.skillId];
  if (!def) return 1.6;
  return skillNumber(def, 'damageRatio', Math.max(1, skillLevel));
}

/**
 * 每一笔同伴造成的伤害（primary／area／reflect 同源乘 budgetScale 一次）：
 * max(1, round(atk * skillRatio * budgetScale * rand(0.9,1.1) - def))
 */
export function companionDealtDamage(opts: {
  playerAtk: number;
  skillRatio: number;
  targetDef: number;
  budgetScale?: number;
  /** 可注入 [0.9,1.1]；缺省随机 */
  roll?: number;
}): number {
  const scale = opts.budgetScale ?? COMPANION_FOLLOW_HARD.damage.budgetScale;
  const roll = opts.roll ?? (0.9 + Math.random() * 0.2);
  const clamped = Math.min(1.1, Math.max(0.9, roll));
  return Math.max(1, Math.round(opts.playerAtk * opts.skillRatio * scale * clamped - opts.targetDef));
}

/** 反伤同乘 budgetScale；禁二次叠乘。 */
export function companionReflectDamage(incomingHitDamage: number, reflectRatio: number,
  budgetScale = COMPANION_FOLLOW_HARD.damage.budgetScale): number {
  return Math.max(1, Math.round(incomingHitDamage * reflectRatio * budgetScale));
}

export function shouldLeashTeleport(companionX: number, playerX: number,
  leashDist: number = COMPANION_FOLLOW_HARD.leashDist): boolean {
  return Math.abs(companionX - playerX) > leashDist;
}

export function followAnchorX(playerX: number, facing: number,
  followDist: number = COMPANION_FOLLOW_HARD.followDist): number {
  return playerX - facing * followDist;
}

export function inEngageRange(companionX: number, companionY: number, targetX: number, targetY: number,
  range: { readonly w: number; readonly h: number } = COMPANION_FOLLOW_HARD.primary.engageRange): boolean {
  return Math.abs(targetX - companionX) <= range.w && Math.abs(targetY - companionY) <= range.h;
}

export function inAggroRange(companionX: number, companionY: number, targetX: number, targetY: number,
  playerX: number, aggro: number = COMPANION_FOLLOW_HARD.aggroRange, leash: number = COMPANION_FOLLOW_HARD.leashDist): boolean {
  return Math.abs(targetX - playerX) <= leash
    && Math.abs(targetX - companionX) <= aggro
    && Math.abs(targetY - companionY) <= 96;
}

/** free 索敌：仅相对同伴 aggro；不绑玩家 leash／当前目标。 */
export function inFreeAggroRange(companionX: number, companionY: number, targetX: number, targetY: number,
  aggro: number = COMPANION_MODES_HARD.free.aggroRange): boolean {
  return Math.abs(targetX - companionX) <= aggro
    && Math.abs(targetY - companionY) <= 96;
}

/** 纯函数索敌：优先距玩家最近的合法敌对（≈玩家正在交战目标），否则距同伴最近。 */
export function pickCompanionTarget<T extends { x: number; y: number; active: boolean; dead: boolean }>(
  mobs: readonly T[],
  companion: { x: number; y: number },
  player: { x: number },
  preferred?: T | null,
): T | undefined {
  const legal = (m: T) => m.active && !m.dead
    && inAggroRange(companion.x, companion.y, m.x, m.y, player.x);
  if (preferred && legal(preferred)) return preferred;
  const candidates = [...mobs].filter(legal);
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => {
    const byPlayer = Math.abs(a.x - player.x) - Math.abs(b.x - player.x);
    if (byPlayer !== 0) return byPlayer;
    return Math.abs(a.x - companion.x) - Math.abs(b.x - companion.x);
  });
  return candidates[0];
}

/** free 自主白名单索敌：距同伴最近；forcePlayerTarget=false。 */
export function pickCompanionFreeTarget<T extends { x: number; y: number; active: boolean; dead: boolean }>(
  mobs: readonly T[],
  companion: { x: number; y: number },
): T | undefined {
  const candidates = [...mobs].filter(m => m.active && !m.dead
    && inFreeAggroRange(companion.x, companion.y, m.x, m.y));
  if (!candidates.length) return undefined;
  candidates.sort((a, b) => {
    const da = Math.abs(a.x - companion.x) + Math.abs(a.y - companion.y);
    const db = Math.abs(b.x - companion.x) + Math.abs(b.y - companion.y);
    return da - db;
  });
  return candidates[0];
}

export function nextCompanionMode(current: CompanionMode): CompanionMode {
  const cycle = COMPANION_MODES_HARD.cycle;
  const idx = cycle.indexOf(current);
  return cycle[(idx + 1) % cycle.length];
}

export interface CompanionFollowEntity {
  readonly entityId: CompanionFollowEntityId;
  readonly companionId: typeof SU_COMPANION_ID;
  readonly namespace: typeof COMPANION_FOLLOW_HARD.entityNamespace;
  sprite: Phaser.Physics.Arcade.Sprite;
  hp: number;
  maxHp: number;
  defense: number;
  /** 三态共享同一 CD 时钟；切态不重置。 */
  attackReadyAt: number;
  colliders: Phaser.Physics.Arcade.Collider[];
  pendingStrike?: { target: Monster; strikeAt: number };
  recoverUntil?: number;
}

/**
 * 同行 follow／free／stay 控制器：至多 1 实体；不进入 FriendlySummons.pets。
 * 切图 SHUTDOWN 销毁实例；关系＋mode 存档保留，新场景 project 重生。
 */
export class CompanionFollowAi {
  private entity: CompanionFollowEntity | null = null;
  private destroyed = false;
  /** 供静证：从未把实体推入 FriendlySummons */
  readonly isolationTag = COMPANION_FOLLOW_HARD.entityNamespace;

  constructor(private readonly scene: GameScene) {
    this.scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  get entityCount() { return this.entity?.sprite.active ? 1 : 0; }
  get liveEntity() { return this.entity?.sprite.active ? this.entity : null; }
  get entityId() { return this.liveEntity?.entityId ?? null; }

  /** 当前存档 mode；无关系则 null。 */
  currentMode(): CompanionMode | null {
    return activeCompanion(COMPANIONS, this.scene.prog)?.mode ?? null;
  }

  /** 关系有效且表开 → 投影恰 1 实体；已有则不重复。 */
  projectFromRelation(): boolean {
    if (this.destroyed) return false;
    if (!activeCompanion(COMPANIONS, this.scene.prog)) return false;
    if (this.liveEntity) return false;
    return this.spawnEntity();
  }

  /** 邀请 status=ok 后调用；已有实体 no-op（禁双实例）。 */
  spawnAfterInvite(): boolean {
    if (this.destroyed) return false;
    if (!activeCompanion(COMPANIONS, this.scene.prog)) return false;
    if (this.liveEntity) return false;
    return this.spawnEntity();
  }

  /**
   * KeyV／companion_mode_cycle：须关系＋实体在场；成功写 mode 并清 AI 旗（不重置 CD／budget）。
   * design/43：永不触发解散；≠ dismissEntity。
   */
  cycleMode(): CompanionMode | null {
    if (this.destroyed || !this.liveEntity) return null;
    if (!activeCompanion(COMPANIONS, this.scene.prog)) return null;
    const next = cycleCompanionMode(COMPANIONS, this.scene.prog);
    if (!next) return null;
    if (COMPANION_MODES_HARD.switch.clearAiFlagsOnEnter) this.clearAiFlags();
    return next;
  }

  /**
   * design/43：主动解散毁实体；仅 clearEntity，不设 destroyed（再邀可 spawnAfterInvite）。
   * 切图 SHUTDOWN 仍走 destroy()（保关系）。
   */
  dismissEntity(): boolean {
    if (this.destroyed) return false;
    const had = !!this.entity;
    this.clearEntity();
    return had;
  }

  /** 切入新 mode：清追敌／出手瞬态；禁重置 attackReadyAt（noCooldownStackOrReset）。 */
  clearAiFlags() {
    const entity = this.entity;
    if (!entity) return;
    entity.pendingStrike = undefined;
    entity.recoverUntil = undefined;
  }

  update(time: number) {
    const entity = this.liveEntity;
    if (!entity || this.destroyed) return;
    const { player, prog } = this.scene;
    if (!player || player.dead) {
      const body = entity.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setVelocityX(0);
      return;
    }
    const active = activeCompanion(COMPANIONS, prog);
    if (!active) {
      this.clearEntity();
      return;
    }

    if (active.mode === 'stay') {
      this.updateStay(entity);
      return;
    }
    if (active.mode === 'free') {
      this.updateCombat(entity, time, 'free');
      return;
    }
    this.updateCombat(entity, time, 'follow');
  }

  destroy() {
    if (this.destroyed) return;
    this.destroyed = true;
    this.clearEntity();
  }

  private updateStay(entity: CompanionFollowEntity) {
    const body = entity.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    entity.pendingStrike = undefined;
    this.animate(entity.sprite, 'idle');
    // stay.invulnerable=false：本层不加免伤；仍可受击（外层伤害系统另钩）。
  }

  private updateCombat(entity: CompanionFollowEntity, time: number, mode: 'follow' | 'free') {
    const hard = COMPANION_FOLLOW_HARD;
    const modes = COMPANION_MODES_HARD;
    const { player } = this.scene;
    const sprite = entity.sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const engage = mode === 'free' ? modes.free.engageRange : hard.primary.engageRange;

    if (mode === 'follow' && shouldLeashTeleport(sprite.x, player.x, hard.leashDist)) {
      body.reset(followAnchorX(player.x, player.facing, 40), player.feet);
    }
    // free.leashTeleport=false：不停强制锚点、无超距瞬移归位。

    const target = mode === 'free'
      ? pickCompanionFreeTarget(this.scene.mobs, sprite)
      : pickCompanionTarget(this.scene.mobs, sprite, player);

    const inReach = target
      ? inEngageRange(sprite.x, sprite.y, target.x, target.y, engage)
      : false;

    let anchor: number;
    if (target) {
      anchor = target.x;
    } else if (mode === 'follow') {
      anchor = followAnchorX(player.x, player.facing, hard.followDist);
    } else {
      anchor = sprite.x; // free 无目标：停在原地
    }
    const dx = anchor - sprite.x;
    const moving = !inReach && Math.abs(dx) > (target ? 12 : 24);

    if (entity.pendingStrike) {
      body.setVelocityX(0);
      if (time >= entity.pendingStrike.strikeAt) {
        const victim = entity.pendingStrike.target;
        entity.pendingStrike = undefined;
        entity.recoverUntil = time + hard.primary.recoverMs;
        if (victim.active && !victim.dead
          && inEngageRange(sprite.x, sprite.y, victim.x, victim.y, engage)) {
          this.strike(entity, victim, time);
        }
      }
      return;
    }

    if (time < (entity.recoverUntil ?? 0)) {
      body.setVelocityX(0);
      return;
    }

    body.setVelocityX(moving ? Math.sign(dx) * hard.attrs.moveSpeed : 0);
    if (moving) sprite.setFlipX(dx > 0);
    if (target && target.y < sprite.y - 40 && (body.blocked.down || body.touching.down)) {
      body.setVelocityY(-360);
    }

    if (inReach && target && time >= entity.attackReadyAt) {
      sprite.setFlipX(target.x > sprite.x);
      entity.pendingStrike = { target, strikeAt: time + hard.primary.telegraphMs };
      // 共享 CD：三态同一 attackReadyAt；切态不重置、不叠第二份。
      entity.attackReadyAt = time + hard.primary.telegraphMs + hard.primary.effectiveAiCooldownMs;
      this.animate(sprite, 'attack');
    } else {
      this.animate(sprite, moving ? 'walk' : 'idle');
    }
  }

  private spawnEntity(): boolean {
    const { player, prog } = this.scene;
    if (!player) return false;
    const hard = COMPANION_FOLLOW_HARD;
    const texture = this.scene.textures.exists(hard.spriteKey) ? hard.spriteKey : this.placeholder();
    const x = followAnchorX(player.x, player.facing, hard.followDist);
    const sprite = this.scene.physics.add.sprite(x, player.feet, texture)
      .setOrigin(0.5, 1).setDepth(player.depth - 1);
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const info = ATLAS_INFO[hard.spriteKey];
    const [w, h] = info?.bodySize ?? [46, 58];
    body.setSize(w, h).setOffset(
      Math.max(0, (sprite.frame.realWidth - w) / 2),
      Math.max(0, sprite.frame.realHeight - h),
    );
    body.setMaxVelocityY(670);
    const colliders = [this.scene.physics.add.collider(sprite, this.scene.map.solids)];
    colliders.push(this.scene.physics.add.collider(sprite, this.scene.map.oneWays, undefined, (a, platform) => {
      const moving = (a as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body;
      const top = (platform as Phaser.Physics.Arcade.Sprite).body!.top;
      return moving.velocity.y >= 0 && moving.prev.y + moving.height <= top + 2;
    }));
    const maxHp = Math.max(1, Math.round(prog.maxHp * hard.attrs.hpRatioOfOwner));
    const now = this.scene.time.now;
    this.entity = {
      entityId: companionFollowEntityId(),
      companionId: SU_COMPANION_ID,
      namespace: hard.entityNamespace,
      sprite,
      hp: maxHp,
      maxHp,
      defense: Math.round(prog.def * hard.attrs.defRatioOfOwner),
      attackReadyAt: now,
      colliders,
    };
    this.animate(sprite, 'idle');
    return true;
  }

  private strike(entity: CompanionFollowEntity, mob: Monster, time: number) {
    const hard = COMPANION_FOLLOW_HARD;
    const ratio = companionPrimarySkillRatio(1);
    const damage = companionDealtDamage({
      playerAtk: this.scene.prog.atk,
      skillRatio: ratio,
      targetDef: mob.def.def,
      budgetScale: hard.damage.budgetScale,
    });
    mob.takeHit(time, damage, Math.sign(mob.x - entity.sprite.x) || 1);
    this.scene.damageNumber(mob.x, mob.y - mob.body.height - 10, damage, '#c8e6ff', '#1a3a5c');
    this.scene.events.emit('skill:hit', {
      id: hard.primary.skillId,
      target: mob.def.id,
      damage,
      companionFollow: true,
      entityId: entity.entityId,
    });
  }

  private animate(sprite: Phaser.Physics.Arcade.Sprite, action: string) {
    const key = `${sprite.texture.key}_${action}`;
    if (this.scene.anims.exists(key)) sprite.play(key, true);
  }

  private clearEntity() {
    const entity = this.entity;
    this.entity = null;
    if (!entity) return;
    for (const collider of entity.colliders) collider.destroy();
    if (entity.sprite.active) entity.sprite.destroy();
  }

  private placeholder() {
    const key = 'ph_companion_su';
    if (!this.scene.textures.exists(key)) {
      const graphics = this.scene.make.graphics({}, false);
      graphics.fillStyle(0x9ec8ff).fillRoundedRect(16, 8, 32, 56, 6)
        .fillCircle(32, 14, 10);
      graphics.generateTexture(key, 64, 72);
      graphics.destroy();
    }
    return key;
  }
}
