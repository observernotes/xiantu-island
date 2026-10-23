import Phaser from 'phaser';
import { ATLAS_INFO, COMPANIONS } from './data';
import {
  activeCompanion, cycleCompanionMode, SU_COMPANION_ID, type CompanionMode,
} from './Companions';
import type { GameScene } from './scenes/GameScene';
import type { Monster } from './scenes/Monster';
import { SKILLS, skillNumber } from './skills';

/**
 * design/41 · 同行 AI follow 硬读（演武定稿；design/42–48 不漂此表）。
 * design/42 扩展 mode 状态机（free／stay／切换）；design/43 解散；design/44 area＝whirl_sword；
 * design/45 受击被动反伤；design/46 零血倒地／场景本地复起（≠ support／≠ emit sword_shield）。
 * 与 FriendlySummons 隔离；禁新 OpenFlag。≠ 开态 ≠ soft ≠ release ≠ Pages。
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

/** design/44 · area＝whirl_sword 硬读（只读对齐 skills.range；禁改 skills 字节）。 */
export const COMPANION_AREA_HARD = Object.freeze({
  skillId: 'whirl_sword' as const,
  effectiveAiCooldownMs: 4000,
  telegraphMs: 250,
  recoverMs: 250,
  /** 只读对齐表；禁另造半径／扇形 */
  rangeAlign: Object.freeze({ w: 160, h: 80, behind: 32 }),
  preferThreshold: 2,
  starveGuardN: 2,
  maxPendingPerTick: 1,
  cdIndependent: true as const,
  /** 结算上限旁证（读表 maxTargets）；≠计数阈值 */
  maxTargetsTable: 3,
  supportLocked: false as const,
  supportSkillId: 'sword_shield' as const,
  modes: Object.freeze({
    follow: true as const,
    free: true as const,
    stay: false as const,
  }),
});

/** design/48 · 唯一主动 support；表基值旁证，实际施法只读 skills，不进伤害通道。 */
export const COMPANION_SUPPORT_HARD = Object.freeze({
  skillId: 'sword_shield' as const,
  effectiveAiCooldownMs: 30000,
  telegraphMs: 200,
  recoverMs: 200,
  preferRemainingMs: 3000,
  starveGuardN: 2,
  mpCost: 30,
  durationMs: 60000,
  damageReduce: 0.05,
  modes: Object.freeze({ follow: true as const, free: true as const, stay: false as const }),
  supportEntersDamageBudget: false as const,
  cancelPendingOnStay: true as const,
  clearBuffOnDown: true as const,
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
    /** design/44：stay 零伤含不放 area */
    stopArea: true as const,
    /** design/45：stay 零伤含不放反伤；切入取消 pendingReflect */
    stopReflect: true as const,
    cancelPendingReflectOnEnter: true as const,
    /** design/48：stay 停主动 buff，切入立即取消施法。 */
    stopSupport: true as const,
    cancelPendingSupportOnEnter: true as const,
  }),
  switch: Object.freeze({
    noBudgetStack: true as const,
    noCooldownStackOrReset: true as const,
    clearAiFlagsOnEnter: true as const,
  }),
  /** design/48：primary＋area＋唯一主动 support＝sword_shield。 */
  schedule: 'primary_area_and_support' as const,
});

/**
 * design/45 · 受击被动反伤硬读（≠落 companions／skills 字节；≠ emit sword_shield）。
 * ratio 只读 skills.sword_shield.effects.reflectRatio 基值；不用 perLevel。
 * 被动路径独立于 design/48 主动 buff；无需先施放 shield。
 */
export const COMPANION_REFLECT_HARD = Object.freeze({
  companionId: SU_COMPANION_ID,
  enabled: true as const,
  semantic: 'passive_on_hit' as const,
  /** 硬读数字；运行时以 companionReflectRatioFromTable 为准 */
  ratio: 0.5,
  ratioReadPath: 'skills.sword_shield.effects.reflectRatio' as const,
  ratioSource: 'effects' as const,
  forbidEmitSwordShield: true as const,
  supportSkillIdNeverEmit: 'sword_shield' as const,
  helper: 'companionReflectDamage' as const,
  budgetScale: 0.35,
  reflectAlsoScaled: true as const,
  noSecondBudgetStackWithPrimaryOrArea: true as const,
  trigger: 'hostileHitOnCompanion' as const,
  target: 'thatAttackerOnly' as const,
  skipIfAttackerDeadOrGoneOrUnhittable: true as const,
  visibleFeedback: 'attackerHpDropAndDamageNumber' as const,
  /** 接触受击 i-frame（对齐 FriendlySummons 量级；本刀不改表） */
  hurtIframeMs: 700,
  modes: Object.freeze({
    follow: true as const,
    free: true as const,
    stay: false as const,
  }),
  stay: Object.freeze({
    zeroDamage: true as const,
    cancelPendingReflectOnEnter: true as const,
    invulnerable: false as const,
  }),
});

/** design/46 · 零血复起硬读；运行时只读表根 reviveMs，不改 41–45／表字节。 */
export const COMPANION_DOWN_REVIVE_HARD = Object.freeze({
  companionId: SU_COMPANION_ID,
  down: Object.freeze({
    enabled: true as const,
    trigger: 'hostileHitOnCompanion && hp→0' as const,
    stopPrimaryAreaReflect: true as const,
    cancelPendingStrikeAndReflect: true as const,
    fatalHitReflect: false as const,
    whileDowned: Object.freeze({ noPrimaryAreaReflect: true as const }),
  }),
  revive: Object.freeze({
    readPath: 'companions.reviveMs' as const,
    timerScope: 'sceneLocal' as const,
    keepRelationAndMode: true as const,
    /** 现表旁证；实际 deadline 读 COMPANIONS.reviveMs。 */
    reviveMs: 30000,
    hpOnRevive: 'maxHp' as const,
    iFramesMs: 1000,
    spawn: '原地' as const,
    visibleDown: '苏师姐力竭' as const,
    visibleRevive: '复起' as const,
  }),
  modes: Object.freeze({
    follow: Object.freeze({ canDownAndRevive: true as const }),
    free: Object.freeze({ canDownAndRevive: true as const }),
    stay: Object.freeze({ canDownAndRevive: true as const }),
  }),
});

export type CompanionStrikeSkillId =
  | typeof COMPANION_FOLLOW_HARD.primary.skillId
  | typeof COMPANION_AREA_HARD.skillId;

export type CompanionSkillId = CompanionStrikeSkillId | typeof COMPANION_SUPPORT_HARD.skillId;

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

/** area skillRatio；表旁证基值 0.9（skillLv=1）。 */
export function companionAreaSkillRatio(skillLevel = 1): number {
  const def = SKILLS[COMPANION_AREA_HARD.skillId];
  if (!def) return 0.9;
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
  budgetScale: number = COMPANION_FOLLOW_HARD.damage.budgetScale): number {
  return Math.max(1, Math.round(incomingHitDamage * reflectRatio * budgetScale));
}

/**
 * design/45：只读 effects.reflectRatio 基值（不用 perLevel／不用 skillNumber 成长链）。
 * 禁要求 emit／pending／strike sword_shield。
 */
export function companionReflectRatioFromTable(): number {
  const def = SKILLS[COMPANION_REFLECT_HARD.supportSkillIdNeverEmit];
  const effects = def?.effects;
  if (effects && typeof effects.reflectRatio === 'number') {
    return effects.reflectRatio as number;
  }
  return COMPANION_REFLECT_HARD.ratio;
}

/** 合法命中＋mode 门禁：仅敌对＋incoming＞0＋follow／free；stay／玩家／友方／环境否。 */
export function companionReflectShouldApply(opts: {
  mode: CompanionMode | null | undefined;
  incomingHitDamage: number;
  attackerHostile: boolean;
  attackerHittable: boolean;
}): boolean {
  if (!COMPANION_REFLECT_HARD.enabled) return false;
  if (!opts.attackerHostile) return false;
  if (!(opts.incomingHitDamage > 0)) return false;
  if (COMPANION_REFLECT_HARD.skipIfAttackerDeadOrGoneOrUnhittable && !opts.attackerHittable) return false;
  const mode = opts.mode;
  if (mode !== 'follow' && mode !== 'free') return false;
  return COMPANION_REFLECT_HARD.modes[mode] === true;
}

/** 纯函数结算：ratio＋budget 同乘一次；forbidEmit 仅契约旁证。 */
export function companionReflectResolve(opts: {
  incomingHitDamage: number;
  reflectRatio?: number;
  budgetScale?: number;
}): { damage: number; ratio: number; budgetScale: number; emitSkillId: null } {
  const ratio = opts.reflectRatio ?? companionReflectRatioFromTable();
  const budgetScale = opts.budgetScale ?? COMPANION_REFLECT_HARD.budgetScale;
  const damage = companionReflectDamage(opts.incomingHitDamage, ratio, budgetScale);
  // forbidEmitSwordShield：永不返回 sword_shield 作为出招 id
  return { damage, ratio, budgetScale, emitSkillId: null };
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

/**
 * design/44 · area 朝向盒（对齐 SkillCombat.fireAoe）：
 * facing>0：x∈[cx-behind, cx+w]；facing≤0：x∈[cx-w, cx+behind]；
 * y∈[cy-h, cy]（脚底原点，等同 body.bottom-h … body.bottom）。
 */
export function inAreaFacingBox(
  companionX: number, companionY: number, facing: number,
  targetX: number, targetY: number,
  range: { readonly w: number; readonly h: number; readonly behind: number } = COMPANION_AREA_HARD.rangeAlign,
): boolean {
  const front = range.w;
  const behind = range.behind;
  const left = facing > 0 ? companionX - behind : companionX - front;
  const right = left + front + behind;
  const top = companionY - range.h;
  const bottom = companionY;
  return targetX >= left && targetX <= right && targetY >= top && targetY <= bottom;
}

/** 朝向盒内合法敌对数（active∧!dead）；计数阈值≠maxTargets 结算上限。 */
export function countLegalInAreaFacingBox<T extends { x: number; y: number; active: boolean; dead: boolean }>(
  mobs: readonly T[],
  companionX: number, companionY: number, facing: number,
  range: { readonly w: number; readonly h: number; readonly behind: number } = COMPANION_AREA_HARD.rangeAlign,
): number {
  let n = 0;
  for (const m of mobs) {
    if (!m.active || m.dead) continue;
    if (inAreaFacingBox(companionX, companionY, facing, m.x, m.y, range)) n++;
  }
  return n;
}

/** area 条件：CD 就绪且盒内合法敌 ≥ preferThreshold。 */
export function areaPreferCondition(opts: {
  areaReady: boolean;
  legalInBox: number;
  preferThreshold?: number;
}): boolean {
  const th = opts.preferThreshold ?? COMPANION_AREA_HARD.preferThreshold;
  return opts.areaReady && opts.legalInBox >= th;
}

/** 饿死防护：连续 N 拍 area 条件假 → 必须允许 primary（若自身就绪）。 */
export function starveAllowsPrimary(
  areaMissStreak: number,
  N: number = COMPANION_AREA_HARD.starveGuardN,
): boolean {
  return areaMissStreak >= N;
}

/** 主动 buff 的优先门槛；3000ms 边界不抢占，过期 buff 等同无 buff。 */
export function supportPreferCondition(opts: {
  supportReady: boolean;
  mpReady: boolean;
  hasActiveShield: boolean;
  shieldRemainingMs: number;
  mode?: CompanionMode;
}): boolean {
  return opts.mode !== 'stay' && opts.supportReady && opts.mpReady
    && (!opts.hasActiveShield || opts.shieldRemainingMs < COMPANION_SUPPORT_HARD.preferRemainingMs);
}

/**
 * 决策：support 优先门槛满足时先施法，否则沿 design/44 area→primary。
 * 失败一次后的第 2 可决策拍跳过 support，避免假阳性饿死主招；成功施法清失败计数。
 */
export function chooseCompanionCombatSkill(opts: {
  areaReady: boolean;
  primaryReady: boolean;
  legalInBox: number;
  primaryInReach: boolean;
  areaMissStreak: number;
  preferThreshold?: number;
  starveGuardN?: number;
  supportReady?: boolean;
  mpReady?: boolean;
  hasActiveShield?: boolean;
  shieldRemainingMs?: number;
  supportMissStreak?: number;
  mode?: CompanionMode;
}): { skill: CompanionSkillId | null; nextMissStreak: number; nextSupportMissStreak: number } {
  const supportMiss = opts.supportMissStreak ?? 0;
  if (opts.mode === 'stay') {
    return { skill: null, nextMissStreak: opts.areaMissStreak, nextSupportMissStreak: 0 };
  }
  const preferSupport = supportPreferCondition({
    supportReady: opts.supportReady ?? false,
    mpReady: opts.mpReady ?? false,
    hasActiveShield: opts.hasActiveShield ?? false,
    shieldRemainingMs: opts.shieldRemainingMs ?? 0,
    mode: opts.mode,
  });
  if (preferSupport && supportMiss + 1 < COMPANION_SUPPORT_HARD.starveGuardN) {
    return { skill: COMPANION_SUPPORT_HARD.skillId, nextMissStreak: opts.areaMissStreak,
      nextSupportMissStreak: supportMiss };
  }
  const th = opts.preferThreshold ?? COMPANION_AREA_HARD.preferThreshold;
  const N = opts.starveGuardN ?? COMPANION_AREA_HARD.starveGuardN;
  const preferArea = areaPreferCondition({
    areaReady: opts.areaReady,
    legalInBox: opts.legalInBox,
    preferThreshold: th,
  });
  if (preferArea) {
    return { skill: COMPANION_AREA_HARD.skillId, nextMissStreak: 0, nextSupportMissStreak: 0 };
  }
  const nextMiss = opts.areaMissStreak + 1;
  // area 条件假 → 走 primary；饿死 N＝streak≥N 时契约上必须允许 primary（不得另门挡）
  void N;
  if (opts.primaryReady && opts.primaryInReach) {
    return { skill: COMPANION_FOLLOW_HARD.primary.skillId, nextMissStreak: nextMiss, nextSupportMissStreak: 0 };
  }
  return { skill: null, nextMissStreak: nextMiss, nextSupportMissStreak: supportMiss };
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
  /** primary 独立 CD 时钟；切态不重置。 */
  primaryReadyAt: number;
  /** area 独立 CD 时钟；与 primary 互不推进。 */
  areaReadyAt: number;
  /** 连续 area 条件假拍数（饿死 N）。 */
  areaMissStreak: number;
  /** design/48：独立施法 CD／失败计数；切态不重置 CD。 */
  supportReadyAt: number;
  supportMissStreak: number;
  /** 最小场景本地 MP 池：以表 mpCost 初始化一次施法量，不借用玩家 MP／不新增回复数值。 */
  companionMp: number;
  pendingSupport?: { skillId: typeof COMPANION_SUPPORT_HARD.skillId; castAt: number };
  activeSupportBuff?: { expireAt: number; damageReduce: number };
  colliders: Phaser.Physics.Arcade.Collider[];
  pendingStrike?: {
    skillId: CompanionStrikeSkillId;
    target?: Monster;
    facing: number;
    strikeAt: number;
  };
  /** design/45：未结算反伤；切 stay／clearAiFlags 立即取消 */
  pendingReflect?: {
    attacker: Monster;
    incomingHitDamage: number;
    applyAt: number;
  };
  /** 接触受击 i-frame 时钟 */
  hurtReadyAt: number;
  recoverUntil?: number;
  /** design/46：仅本场景实体持有；不写入关系／存档，切态不清除。 */
  downed: boolean;
  reviveAt?: number;
  downedPosition?: { x: number; y: number };
}

/**
 * 同行 follow／free／stay 控制器：至多 1 实体；不进入 FriendlySummons.pets。
 * 切图 SHUTDOWN 销毁实例；关系＋mode 存档保留，新场景 project 重生。
 * design/48：schedule=primary_area_and_support；support 仅走主动 buff 施法通道。
 * design/45：外层受击钩→reflect；stay 不放反伤；forbidEmitSwordShield。
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

  /** 切入新 mode：清追敌／出手瞬态；禁重置各独立 CD（noCooldownStackOrReset）。 */
  clearAiFlags() {
    const entity = this.entity;
    if (!entity) return;
    entity.pendingStrike = undefined;
    entity.pendingSupport = undefined;
    entity.pendingReflect = undefined; // design/45：切态取消未结算反伤
    entity.recoverUntil = undefined;
    entity.areaMissStreak = 0;
    entity.supportMissStreak = 0;
  }

  update(time: number) {
    const entity = this.liveEntity;
    if (!entity || this.destroyed) return;
    this.expireSupportBuff(entity, time);
    const { player, prog } = this.scene;
    const active = activeCompanion(COMPANIONS, prog);
    if (!active) {
      this.clearEntity();
      return;
    }
    // sceneLocal 复起先于 mode／玩家停战门闩；stay 或切 mode 不得取消倒地计时。
    if (entity.downed) {
      this.updateDowned(entity, time);
      return;
    }
    if (!player || player.dead) {
      const body = entity.sprite.body as Phaser.Physics.Arcade.Body | undefined;
      body?.setVelocityX(0);
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

  private enterDowned(entity: CompanionFollowEntity, time: number) {
    if (entity.downed) return;
    entity.downed = true;
    entity.downedPosition = { x: entity.sprite.x, y: entity.sprite.y };
    // activeCompanion 已通过表门禁；不以 HARD 旁证数字代替读表根。
    entity.reviveAt = time + COMPANIONS!.reviveMs;
    entity.activeSupportBuff = undefined;
    this.clearAiFlags();
    const body = entity.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    body.setVelocityY(0);
    body.moves = false;
    this.animate(entity.sprite, 'idle');
    entity.sprite.setAngle(90);
    this.scene.log(COMPANION_DOWN_REVIVE_HARD.revive.visibleDown, '#c8e6ff');
  }

  private updateDowned(entity: CompanionFollowEntity, time: number) {
    if (entity.reviveAt === undefined || time < entity.reviveAt) return;
    const body = entity.sprite.body as Phaser.Physics.Arcade.Body;
    const position = entity.downedPosition!;
    body.reset(position.x, position.y);
    body.moves = true;
    entity.hp = entity.maxHp;
    entity.downed = false;
    entity.reviveAt = undefined;
    entity.downedPosition = undefined;
    entity.hurtReadyAt = time + COMPANION_DOWN_REVIVE_HARD.revive.iFramesMs;
    // 主动护体倒地即消失，复起后须完整重新等待表 CD；不影响 primary／area。
    entity.supportReadyAt = Math.max(entity.supportReadyAt,
      time + this.supportTableValues().cooldownMs);
    entity.sprite.setAngle(0);
    this.animate(entity.sprite, 'idle');
    this.scene.log(COMPANION_DOWN_REVIVE_HARD.revive.visibleRevive, '#c8e6ff');
    // 本帧保持倒地落点；下一帧才按既有 mode 调度（含 follow leash）。
  }

  private updateStay(entity: CompanionFollowEntity) {
    const body = entity.sprite.body as Phaser.Physics.Arcade.Body;
    body.setVelocityX(0);
    // stay：立即取消主动出手／support／reflect，不残放 buff。
    entity.pendingStrike = undefined;
    entity.pendingSupport = undefined;
    entity.pendingReflect = undefined;
    entity.areaMissStreak = 0;
    entity.supportMissStreak = 0;
    this.animate(entity.sprite, 'idle');
    // stay.invulnerable=false：仍可受击扣血；allowReflect=false
    this.scanHostileTouchHits(entity, this.scene.time.now, false);
  }

  private updateCombat(entity: CompanionFollowEntity, time: number, mode: 'follow' | 'free') {
    const hard = COMPANION_FOLLOW_HARD;
    const area = COMPANION_AREA_HARD;
    const support = COMPANION_SUPPORT_HARD;
    const modes = COMPANION_MODES_HARD;
    const { player } = this.scene;
    const sprite = entity.sprite;
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const engage = mode === 'free' ? modes.free.engageRange : hard.primary.engageRange;

    // design/46：先受击门闩；致命同拍清 pending，禁止继续反伤／出招／leash。
    const previousReflect = entity.pendingReflect;
    this.scanHostileTouchHits(entity, time, true);
    if (entity.downed) return;
    // 帧间隔超过受击 i-frame 时，两笔非致命命中仍各按 45 结算，不覆盖旧笔。
    if (previousReflect && previousReflect !== entity.pendingReflect && time >= previousReflect.applyAt) {
      this.applyReflect(entity, previousReflect.attacker, previousReflect.incomingHitDamage, time);
    }
    this.processPendingReflect(entity, time);

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

    // 独立施法通道：同拍处理后即返回，绝不走 strikePrimary／strikeArea／pendingReflect。
    if (entity.pendingSupport) {
      body.setVelocityX(0);
      if (time >= entity.pendingSupport.castAt) {
        entity.pendingSupport = undefined;
        const table = this.supportTableValues();
        if (supportPreferCondition({
          supportReady: time >= entity.supportReadyAt,
          mpReady: entity.companionMp >= table.mpCost,
          hasActiveShield: !!entity.activeSupportBuff,
          shieldRemainingMs: (entity.activeSupportBuff?.expireAt ?? time) - time,
          mode,
        })) {
          entity.activeSupportBuff = { expireAt: time + table.durationMs, damageReduce: table.damageReduce };
          entity.supportReadyAt = time + table.cooldownMs;
          entity.companionMp -= table.mpCost;
          entity.supportMissStreak = 0;
          entity.recoverUntil = time + support.recoverMs;
          this.scene.log('苏师姐施展剑罡护体', '#c8e6ff');
          // 独立事件避免 skill:cast 的玩家符箓中断监听；无伤敌／反伤载体。
          this.scene.events.emit('companion:support-cast', {
            id: support.skillId, companionSupport: true, entityId: entity.entityId,
            expireAt: entity.activeSupportBuff.expireAt, damageReduce: table.damageReduce,
          });
        } else {
          // 前摇期间 MP／CD／buff 改变造成假阳性：第 2 可决策拍必须让位主招。
          entity.supportMissStreak++;
        }
      }
      return;
    }

    if (entity.pendingStrike) {
      body.setVelocityX(0);
      if (time >= entity.pendingStrike.strikeAt) {
        const pending = entity.pendingStrike;
        entity.pendingStrike = undefined;
        const recover = pending.skillId === area.skillId ? area.recoverMs : hard.primary.recoverMs;
        entity.recoverUntil = time + recover;
        if (pending.skillId === area.skillId) {
          this.strikeArea(entity, pending.facing, time);
        } else if (pending.target && pending.target.active && !pending.target.dead
          && inEngageRange(sprite.x, sprite.y, pending.target.x, pending.target.y, engage)) {
          this.strikePrimary(entity, pending.target, time);
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

    // facing：flipX true＝朝右（与 setFlipX(target.x > sprite.x) 一致）
    const facing = sprite.flipX ? 1 : -1;
    const areaReady = time >= entity.areaReadyAt;
    const primaryReady = time >= entity.primaryReadyAt;
    const supportReady = time >= entity.supportReadyAt;
    const primaryInReach = !!(inReach && target);
    // 仅在至少一侧可出手时计一拍，避免行走帧虚增饿死计数
    const canDecide = supportReady || areaReady || (primaryReady && primaryInReach);
    if (canDecide) {
      const legalInBox = countLegalInAreaFacingBox(
        this.scene.mobs, sprite.x, sprite.y, facing, area.rangeAlign);
      const choice = chooseCompanionCombatSkill({
        areaReady,
        primaryReady,
        legalInBox,
        primaryInReach,
        areaMissStreak: entity.areaMissStreak,
        supportReady,
        mpReady: entity.companionMp >= this.supportTableValues().mpCost,
        hasActiveShield: !!entity.activeSupportBuff,
        shieldRemainingMs: (entity.activeSupportBuff?.expireAt ?? time) - time,
        supportMissStreak: entity.supportMissStreak,
        mode,
      });
      entity.areaMissStreak = choice.nextMissStreak;
      entity.supportMissStreak = choice.nextSupportMissStreak;

      // maxPendingPerTick=1：主动施法与 primary／area 互斥。
      if (choice.skill === support.skillId && support.modes[mode]) {
        entity.pendingSupport = { skillId: support.skillId, castAt: time + support.telegraphMs };
        this.animate(sprite, 'attack');
        return;
      }
      if (choice.skill === area.skillId && area.modes[mode]) {
        if (target) sprite.setFlipX(target.x > sprite.x);
        const face = sprite.flipX ? 1 : -1;
        entity.pendingStrike = {
          skillId: area.skillId,
          facing: face,
          strikeAt: time + area.telegraphMs,
        };
        // CD 独立：只推进 area
        entity.areaReadyAt = time + area.telegraphMs + area.effectiveAiCooldownMs;
        this.animate(sprite, 'attack');
        return;
      }
      if (choice.skill === hard.primary.skillId && target && inReach) {
        sprite.setFlipX(target.x > sprite.x);
        entity.pendingStrike = {
          skillId: hard.primary.skillId,
          target,
          facing: sprite.flipX ? 1 : -1,
          strikeAt: time + hard.primary.telegraphMs,
        };
        // CD 独立：只推进 primary
        entity.primaryReadyAt = time + hard.primary.telegraphMs + hard.primary.effectiveAiCooldownMs;
        this.animate(sprite, 'attack');
        return;
      }
    }
    this.animate(sprite, moving ? 'walk' : 'idle');
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
    const maxHp = Math.max(1, Math.round(prog.baseMaxHp * hard.attrs.hpRatioOfOwner));
    const now = this.scene.time.now;
    this.entity = {
      entityId: companionFollowEntityId(),
      companionId: SU_COMPANION_ID,
      namespace: hard.entityNamespace,
      sprite,
      hp: maxHp,
      maxHp,
      defense: Math.round(prog.def * hard.attrs.defRatioOfOwner),
      primaryReadyAt: now,
      areaReadyAt: now,
      areaMissStreak: 0,
      supportReadyAt: now,
      supportMissStreak: 0,
      companionMp: this.supportTableValues().mpCost,
      hurtReadyAt: now,
      downed: false,
      colliders,
    };
    this.animate(sprite, 'idle');
    return true;
  }

  /** 仅读取现表基值；不用 perLevel 成长，不修改 skills 字节。 */
  private supportTableValues() {
    const def = SKILLS[COMPANION_SUPPORT_HARD.skillId];
    return {
      mpCost: def.mpCost,
      cooldownMs: def.cooldownMs,
      durationMs: def.durationMs,
      damageReduce: def.effects.damageReduce as number,
    };
  }

  private expireSupportBuff(entity: CompanionFollowEntity, time: number) {
    if (entity.activeSupportBuff && time >= entity.activeSupportBuff.expireAt) {
      entity.activeSupportBuff = undefined;
    }
  }

  private strikePrimary(entity: CompanionFollowEntity, mob: Monster, time: number) {
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

  /** area＝whirl_sword：朝向盒内至多 maxTargets 合法敌；每一笔仍只乘一次 budgetScale。 */
  private strikeArea(entity: CompanionFollowEntity, facing: number, time: number) {
    const hard = COMPANION_FOLLOW_HARD;
    const area = COMPANION_AREA_HARD;
    const sprite = entity.sprite;
    const ratio = companionAreaSkillRatio(1);
    const maxT = (() => {
      const def = SKILLS[area.skillId];
      if (!def) return area.maxTargetsTable;
      return Math.max(0, Math.floor(skillNumber(def, 'maxTargets', 1)));
    })();
    const hits = this.scene.mobs
      .filter(m => m.active && !m.dead
        && inAreaFacingBox(sprite.x, sprite.y, facing, m.x, m.y, area.rangeAlign))
      .sort((a, b) => Math.abs(a.x - sprite.x) - Math.abs(b.x - sprite.x))
      .slice(0, maxT);
    for (const mob of hits) {
      const damage = companionDealtDamage({
        playerAtk: this.scene.prog.atk,
        skillRatio: ratio,
        targetDef: mob.def.def,
        budgetScale: hard.damage.budgetScale,
      });
      mob.takeHit(time, damage, facing || Math.sign(mob.x - sprite.x) || 1);
      this.scene.damageNumber(mob.x, mob.y - mob.body.height - 10, damage, '#c8e6ff', '#1a3a5c');
      this.scene.events.emit('skill:hit', {
        id: area.skillId,
        target: mob.def.id,
        damage,
        companionFollow: true,
        entityId: entity.entityId,
        area: true,
      });
    }
  }

  /**
   * design/45：接触合法敌对命中 → 扣同伴血；follow／free 排队反伤；stay 只扣血不反伤。
   * 不混玩家 hurt／FriendlySummons；不反伤玩家／友方／环境。
   */
  private scanHostileTouchHits(entity: CompanionFollowEntity, time: number, allowReflect: boolean) {
    if (entity.downed || entity.hp <= 0 || !entity.sprite.active || time < entity.hurtReadyAt) return;
    const sprite = entity.sprite;
    for (const mob of this.scene.mobs) {
      if (mob.dead || mob.def.noDamage || mob.suppressTouch || !mob.def.touchDamage || !mob.body?.enable) continue;
      if (!this.bodiesOverlap(sprite, mob)) continue;
      const raw = mob.def.atk * (mob.def.touchDamageMul ?? 1);
      this.takeHostileHit(entity, raw, mob, time, allowReflect);
      break;
    }
  }

  /**
   * 外层受击钩：合法敌对命中 →（可选）排队 companionReflectDamage。
   * incoming＝扣防后实际伤害；>0 才可反伤。
   */
  takeHostileHit(
    entity: CompanionFollowEntity,
    rawDamage: number,
    attacker: Monster,
    time: number,
    allowReflect: boolean,
  ): number {
    if (this.destroyed || entity !== this.liveEntity || entity.downed || entity.hp <= 0
      || time < entity.hurtReadyAt) return 0;
    this.expireSupportBuff(entity, time);
    entity.hurtReadyAt = time + COMPANION_REFLECT_HARD.hurtIframeMs;
    const damageReduce = entity.activeSupportBuff?.damageReduce ?? 0;
    const incoming = Math.max(1, Math.round((rawDamage - entity.defense) * (1 - damageReduce)));
    entity.hp = Math.max(0, entity.hp - incoming);
    this.scene.damageNumber(
      entity.sprite.x, entity.sprite.y - 40, incoming, '#c8e6ff', '#1a3a5c');
    // fatalHitReflect=false：先倒地、清 pending；致命击绝不进入反伤排队。
    if (entity.hp === 0) {
      this.enterDowned(entity, time);
      return incoming;
    }
    const body = entity.sprite.body as Phaser.Physics.Arcade.Body | undefined;
    if (body) body.setVelocityX(Math.sign(entity.sprite.x - attacker.x) * 60);

    const mode = this.currentMode();
    const canReflect = allowReflect && companionReflectShouldApply({
      mode,
      incomingHitDamage: incoming,
      attackerHostile: true,
      attackerHittable: !!(attacker.active && !attacker.dead),
    });
    if (!canReflect) return incoming;
    // 排队一笔；同拍 processPendingReflect 可立即结算；切 stay 取消
    entity.pendingReflect = {
      attacker,
      incomingHitDamage: incoming,
      applyAt: time,
    };
    return incoming;
  }

  private processPendingReflect(entity: CompanionFollowEntity, time: number) {
    if (entity.downed || entity.hp <= 0) {
      entity.pendingReflect = undefined;
      return;
    }
    const pending = entity.pendingReflect;
    if (!pending) return;
    if (time < pending.applyAt) return;
    entity.pendingReflect = undefined;
    this.applyReflect(entity, pending.attacker, pending.incomingHitDamage, time);
  }

  /** 对攻击者结算反伤；可见＝掉血＋跳字；永不 emit sword_shield。 */
  private applyReflect(
    entity: CompanionFollowEntity,
    attacker: Monster,
    incomingHitDamage: number,
    time: number,
  ) {
    if (entity.downed || entity.hp <= 0) return;
    if (COMPANION_REFLECT_HARD.forbidEmitSwordShield) {
      // 契约：本路径不调度／不 pending／不 strike sword_shield
    }
    if (!attacker?.active || attacker.dead) return; // skipIfAttackerDeadOrGoneOrUnhittable
    const resolved = companionReflectResolve({ incomingHitDamage });
    if (!(resolved.damage > 0)) return;
    const dir = Math.sign(attacker.x - entity.sprite.x) || 1;
    attacker.takeHit(time, resolved.damage, dir);
    this.scene.damageNumber(
      attacker.x, attacker.y - attacker.body.height - 10, resolved.damage, '#c8e6ff', '#1a3a5c');
    this.scene.events.emit('skill:hit', {
      id: 'companion_reflect',
      target: attacker.def.id,
      damage: resolved.damage,
      companionFollow: true,
      companionReflect: true,
      entityId: entity.entityId,
      // 明示 ≠ sword_shield
      emitSwordShield: false,
    });
  }

  private bodiesOverlap(a: Phaser.Physics.Arcade.Sprite, b: Monster): boolean {
    const ab = a.body;
    const bb = b.body;
    if (!ab || !bb) return false;
    return Phaser.Geom.Intersects.RectangleToRectangle(
      new Phaser.Geom.Rectangle(ab.x, ab.y, ab.width, ab.height),
      new Phaser.Geom.Rectangle(bb.x, bb.y, bb.width, bb.height),
    );
  }

  private animate(sprite: Phaser.Physics.Arcade.Sprite, action: string) {
    const key = `${sprite.texture.key}_${action}`;
    if (this.scene.anims.exists(key)) sprite.play(key, true);
  }

  private clearEntity() {
    const entity = this.entity;
    this.clearAiFlags();
    this.entity = null;
    if (!entity) return;
    entity.activeSupportBuff = undefined;
    entity.reviveAt = undefined;
    entity.downedPosition = undefined;
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
