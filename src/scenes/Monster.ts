import Phaser from 'phaser';
import { ATLAS_INFO, type MonsterDef, type MonsterSkill } from '../data';

type MState = 'patrol' | 'idle' | 'chase' | 'attack' | 'hit' | 'dead';

/** ?debug=timing：山魈和妖狐的前摇 / 出手 / 冷却打到控制台，时间用游戏时钟 */
const DEBUG_TIMING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === 'timing';
/** 碰撞体优先读 anims.json 的 bodySize；这里只给还没标 bodySize 的旧图集兜底 */
const BODY_FALLBACK: Record<string, [number, number]> = { mon_bamboo_snake: [46, 22], mon_mountain_mandrill: [46, 58] };
/** 霸体受击闪白。用游戏时钟清，不用 delayedCall */
const ARMOR_FLASH_MS = 80;
/**
 * 冲刺速度表里没有。1280px/s 时 384px 大约 300ms，撞墙提前停。
 * 狐火扇形夹角（FOX_FIRE_SPREAD）、召唤间距（SUMMON_GAP）表里也没有。
 */
const DASH_SPEED = 1280;
const FOX_FIRE_SPREAD = 0.26;
const SUMMON_GAP = 96;
/** #3c 野猪冲锋：表里有 distance（192），没有速度，暂定 360px/s；表里没 distance 时最远 256px */
const CHARGE_SPEED = 360;
const CHARGE_MAX_DIST = 256;
/** 冲锋停下后的收招时间（暂定），之后才进入正常巡逻；冷却从出手起算 cooldownMs */
const CHARGE_RECOVER_MS = 300;
/** #3c 黑袍人丢符：表里有 speed（240），缺省 300px/s；出手后的收招时间暂定 */
const PROJECTILE_SPEED = 300;
const PROJECTILE_RECOVER_MS = 350;
/** 还没实现的攻击类型（poison 等）临时按山魈拍地 96×48 */
const FALLBACK_RANGE = { w: 96, h: 48 };
/** skillFrames 备注：召唤阵第 4 帧刷出灵兔（anims 里没有单独的数字字段） */
const SUMMON_SPAWN_FRAME = 4;
/** 幻影突袭预警贴地，低于玩家（10）和怪物（8） */
const DEPTH_WARN = 5;
/** 狐火、召唤阵、冲刺残影、消散：画在角色上面 */
const DEPTH_SKILL_FX = 12;

interface AnimDef { key: string; frames: string[]; frameRate: number; repeat: number; }
interface AnimPack {
  origin?: [number, number];
  anims?: AnimDef[];
  skillFrames?: Record<string, {
    release?: number; spawnOffset?: [number, number];
    telegraphFrames?: number[]; dashFrame?: number; recoverFrame?: number;
    fx?: string; warnFx?: string;
  }>;
}
type SkillMeta = NonNullable<AnimPack['skillFrames']>[string];
interface Cast {
  skill: MonsterSkill;
  t0: number; wall0: number;
  releaseAt: number; endAt: number;
  interruptible: boolean; released: boolean;
  frames: string[]; frameMs: number;
  meta?: SkillMeta;
  logged?: Record<string, boolean>;
  warn?: Phaser.GameObjects.Sprite;
  fromX?: number; prevX?: number; moved?: boolean;
  dashStarted?: boolean; dashDone?: boolean; didHit?: boolean; recoverAt?: number;
  points?: { x: number; y: number }[];
  spawnAt?: number; spawned?: boolean;
}
interface FxTimer { sprite: Phaser.GameObjects.Sprite; doneAt: number; }
interface Cd { readyAt: number; wall: number; game: number; ms: number; logged: boolean; }

/** 试炼目标（筑基台阵眼）：带 targetsObjective 的怪走过去打它 */
/**
 * 守阵目标（试炼里由 AltarTrial 填）。halfW / climbVy 读 trials.json objective.hitHalfWidth / climbJumpVelocity；
 * useAttack / contact 读 behaviorOverrides[怪物 id]（只在这场试炼里生效）
 */
export interface ObjectiveTarget {
  x: number; y: number; halfW: number;
  /** 只传原始伤害（atk × 攻击/接触倍率）；承伤和减防统一由阵眼结算。 */
  hit: (m: Monster, rawDamage: number) => void;
  climbVy: number;
  /** false = 不用自身 attack（不打玩家，也不用攻击打阵眼） */
  useAttack?: boolean;
  /** true = 贴到阵眼判定框就算一击（objectiveHit: "contact"） */
  contact?: boolean;
}
/** 接触撞阵眼的间隔：表里没有 attack 时用（暂定 1000ms） */
const CONTACT_CD_MS = 1000;
/** 接触型飞行心魔贴近阵眼时下降到的高度：阵眼 hitArea 64×100 的一半（anims.json note） */
const CONTACT_FLY_DY = 50;

export interface SkillVolley {
  fx: string; ratio: number; knockback: number; atk: number;
  shots: { x: number; y: number; vx: number; vy: number }[];
  /** 可选：飞行最远距离（黑袍人符 = range.w）和碰撞框（range.h 做高） */
  maxDist?: number; body?: { w: number; h: number };
}

/** 小怪：巡逻 / 追击 / 山魈拍地。首领技能（妖狐）数值全部来自 monsters.json 和 anims.json */
export class Monster extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  def: MonsterDef; hp: number; home: { x: number; y: number };
  st: MState = 'patrol'; dir = -1; stateUntil = 0; attackReadyAt = 0;
  atlas: boolean; bar: Phaser.GameObjects.Graphics;
  patrolBounds?: [number, number];
  onSlam?: (m: Monster, rect: Phaser.Geom.Rectangle) => void;
  onDead?: (m: Monster) => void;
  onVolley?: (v: SkillVolley) => void;
  onSkillDamage?: (m: Monster, ratio: number, knockback: number, fromX: number) => void;
  onSummon?: (owner: Monster, summonId: string, x: number, y: number, grantRewards: boolean, despawnWithOwner: boolean) => void;
  /** 普通怪给奖励；召唤物按技能 grantRewards（默认 false）关掉 */
  grantRewards = true;
  despawnWithOwner = false;
  noRespawn = false;
  owner?: Monster;
  summons: Monster[] = [];
  /** 幻影突袭整段不出接触伤害，避免无敌帧把冲刺伤害吃掉 */
  suppressTouch = false;
  /** 试炼折线巡逻由控制器平移，普通追击/碰墙转向不覆盖它。 */
  manualMotion = false;
  dashing = false;
  despawning = false;
  /** 试炼：目标阵眼与飞行高度（地面 y − flyHeight） */
  objective?: ObjectiveTarget;
  flyY?: number;
  private objTeleEnd = 0;
  /** 测试用：已经放过的 once 技能 */
  usedOnce = new Set<string>();

  private cast: Cast | null = null;
  private fxTimers: FxTimer[] = [];
  private cooldowns: Record<string, Cd> = {};
  private flashUntil = 0;
  private teleAt = 0; private teleEnd = 0; private teleBlink?: Phaser.Tweens.Tween;
  /** 野猪冲锋进行中：起点、是否已命中 */
  private charge: { fromX: number; hit: boolean; prevX: number } | null = null;
  private despawnHideAt = 0; private despawnDoneAt = 0; private despawnHidden = false;

  constructor(scene: Phaser.Scene, x: number, y: number, def: MonsterDef) {
    const atlas = scene.textures.exists(def.sprite);
    super(scene, x, y, atlas ? def.sprite : Monster.placeholder(scene, def));
    this.def = def; this.hp = def.hp; this.home = { x, y }; this.atlas = atlas;
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(8);
    const fs = this.frame.realWidth, fh = this.frame.realHeight;
    const [bw, bh] = ATLAS_INFO[def.sprite]?.bodySize ?? BODY_FALLBACK[def.sprite] ?? [Math.min(fs - 8, 40), Math.min(fh - 4, 56)];
    this.body.setSize(bw, bh).setOffset((fs - bw) / 2, fh - bh);
    this.body.setMaxVelocityY(670);
    if (def.moveSpeed === 0) this.body.setImmovable(true);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.bar = scene.add.graphics().setDepth(11);
    this.anim('idle');
  }

  static placeholder(scene: Phaser.Scene, def: MonsterDef) {
    const key = 'ph_' + def.sprite;
    if (scene.textures.exists(key)) return key;
    const g = scene.make.graphics({}, false);
    if (def.id === 'training_dummy') {
      g.fillStyle(0x7a4e2a).fillRect(22, 70, 20, 10).fillStyle(0xc68a52).fillRoundedRect(16, 14, 32, 58, 8);
      g.lineStyle(3, 0x5a3418).strokeRoundedRect(16, 14, 32, 58, 8).lineBetween(4, 34, 60, 34);
      g.generateTexture(key, 64, 80);
    } else {
      g.fillStyle(0x9b6bd6).fillRoundedRect(4, 20, 56, 44, 14).lineStyle(2, 0x4b2d7a).strokeRoundedRect(4, 20, 56, 44, 14);
      g.generateTexture(key, 64, 64);
    }
    g.destroy(); return key;
  }

  anim(a: string) {
    if (!this.atlas) return;
    const k = `${this.def.sprite}_${a}`;
    if (this.scene.anims.exists(k) && this.anims.currentAnim?.key !== k) this.play(k);
  }

  get dead() { return this.st === 'dead' || this.despawning; }
  get grounded() { return this.body.blocked.down || this.body.touching.down; }

  step(time: number, player: Phaser.Physics.Arcade.Sprite & { dead?: boolean }, hidden = false) {
    if (!this.active) return;
    const d = this.def, b = this.body;
    this.drawBar();
    this.tickFlash(time);
    this.tickFx(time);
    this.tickCooldownLogs(time);
    if (this.despawning) { this.tickDespawn(time); return; }
    if (this.st === 'dead') return;
    if (this.manualMotion) return;
    if (this.cast) { this.tickCast(time, player); return; }
    if (d.moveSpeed === 0) { b.setVelocityX(0); return; }
    // 山魈：前摇结束落下出伤害（游戏时钟，不用 delayedCall）
    if (this.teleEnd && time >= this.teleEnd) {
      this.teleEnd = 0; this.teleBlink?.stop(); this.teleBlink = undefined; this.clearTint();
      if (DEBUG_TIMING) console.log(`[tele] ${d.id} 前摇结束 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
      if (this.st === 'attack') {
        if (this.atlas) { this.anims.resume(); this.anims.nextFrame(); }
        const type = d.attack?.type;
        if (type === 'charge') this.startCharge(time);
        else if (type === 'projectile') this.throwTalisman(time, player);
        else this.doSlam();
      }
    }
    if (this.charge) { this.tickCharge(time, player); return this.face(); }
    if (this.objective && this.stepObjective(time, player)) return this.face();
    if ((this.st === 'hit' || this.st === 'attack') && time < this.stateUntil) {
      if (this.grounded && this.st === 'attack') b.setVelocityX(0);
      return this.face();
    }
    if (this.st === 'hit' || this.st === 'attack') this.st = 'patrol';

    const dx = player.x - this.x, dy = player.y - this.y;
    const sees = !hidden && d.aggressive && !player.dead && Math.abs(dx) < (d.aggroRange ?? 0) && Math.abs(dy) < 64;

    if (d.skills?.length && this.trySkills(time, player, dx, sees)) return;

    // 山魈：玩家进入拍地范围就出手
    if (d.attack && sees && time >= this.attackReadyAt && Math.abs(dx) < this.triggerRange && this.grounded) {
      this.dir = Math.sign(dx) || this.dir;
      const tele = d.attack.telegraphMs ?? 500;
      this.st = 'attack'; this.attackReadyAt = time + d.attack.cooldownMs; this.teleAt = performance.now();
      if (DEBUG_TIMING) console.log(`[tele] ${d.id} ${d.attack.type} 抬手 telegraphMs=${tele}`);
      // 冲锋的结束由 tickCharge 决定，这里先给足时间
      this.stateUntil = time + tele + (d.attack.type === 'charge' ? 60000 : d.attack.type === 'projectile' ? PROJECTILE_RECOVER_MS : 450);
      b.setVelocityX(0); this.anim('attack');
      if (this.atlas) this.anims.pause();
      const blink = this.scene.tweens.addCounter({ from: 0, to: 1, duration: 120, yoyo: true, repeat: Math.floor(tele / 240),
        onUpdate: tw => this.setTint(Phaser.Display.Color.GetColor(255, 255 - 120 * tw.getValue()!, 255 - 120 * tw.getValue()!)) });
      this.teleEnd = time + tele; this.teleBlink = blink;
      return this.face();
    }

    if (sees) { this.st = 'chase'; if (Math.abs(dx) > 8) this.dir = Math.sign(dx); }
    else if (this.st === 'chase') this.st = 'patrol';

    if (this.st === 'idle') {
      b.setVelocityX(0); this.anim('idle');
      if (time >= this.stateUntil) { this.st = 'patrol'; this.stateUntil = time + Phaser.Math.Between(1500, 4000); }
      return this.face();
    }
    if (this.st === 'patrol') {
      const half = d.patrolRange / 2;
      const lo = Math.max(this.home.x - half, this.patrolBounds?.[0] ?? -Infinity), hi = Math.min(this.home.x + half, this.patrolBounds?.[1] ?? Infinity);
      if (this.x < lo) this.dir = 1;
      else if (this.x > hi) this.dir = -1;
      if (time >= this.stateUntil && Math.random() < 0.01) { this.st = 'idle'; this.stateUntil = time + Phaser.Math.Between(800, 2000); }
    }
    if (this.grounded) {
      const aheadX = this.dir > 0 ? b.right + 4 : b.left - 6;
      const ground = this.scene.physics.overlapRect(aheadX, b.bottom + 2, 2, 6, false, true).length > 0;
      const wall = this.dir > 0 ? b.blocked.right : b.blocked.left;
      if (!ground || wall) {
        if (this.st === 'chase') { b.setVelocityX(0); this.anim('idle'); return this.face(); }
        this.dir *= -1;
      }
      b.setVelocityX(this.dir * d.moveSpeed * (this.st === 'chase' ? 1.25 : 1));
      this.anim('walk');
    }
    this.face();
  }

  /**
   * 试炼 AI：朝阵眼走（飞行的保持在 flyY 高度），到了攻击距离就按 attack 的 telegraphMs / cooldownMs 打阵眼，
   * 命中只提交 atk × damageRatio，由 AltarTrial.damageEye 统一结算承伤和减防。地面怪的贴身玩家仍走原来的出手逻辑。
   * 返回 true 表示本帧已处理。
   */
  private stepObjective(time: number, player: Phaser.Physics.Arcade.Sprite & { dead?: boolean }) {
    const d = this.def, b = this.body, o = this.objective!, a = d.attack;
    const flying = !!(d as { flying?: boolean }).flying;
    if ((this.st === 'hit' || this.st === 'attack') && time < this.stateUntil) {
      if (this.objTeleEnd && time >= this.objTeleEnd) {
        this.objTeleEnd = 0; this.teleBlink?.stop(); this.teleBlink = undefined; this.clearTint();
        if (this.atlas) { this.anims.resume(); this.anims.nextFrame(); }
        if (Math.abs(o.x - this.x) <= this.objReach + 8) o.hit(this, d.atk * (a?.damageRatio ?? 1));
      }
      if (flying) b.setVelocity(0, 0);
      return this.st === 'attack' && !this.teleEnd;   // 普通拍地前摇交回原逻辑
    }
    if (this.st === 'hit' || this.st === 'attack') this.st = 'patrol';
    // 地面怪：玩家贴身时照原逻辑打玩家
    const pdx = player.x - this.x;
    if (o.useAttack !== false && !flying && !player.dead && Math.abs(pdx) < 48 && Math.abs(player.y - this.y) < 48) return false;
    const dx = o.x - this.x;
    this.dir = Math.sign(dx) || this.dir;
    if (flying) {
      const ty = o.contact && Math.abs(dx) < this.objReach * 3 ? o.y - CONTACT_FLY_DY : this.flyY;
      const vy = ty !== undefined ? Phaser.Math.Clamp((ty - this.y) * 3, -d.moveSpeed, d.moveSpeed) : 0;
      b.setVelocityY(vy);
    }
    if (o.contact && Math.abs(dx) <= this.objReach) {
      b.setVelocityX(0); this.anim('idle');
      if (time >= this.attackReadyAt) {
        this.attackReadyAt = time + ((o.useAttack !== false && a?.cooldownMs) || CONTACT_CD_MS);
        const ratio = (d as { touchDamageMul?: number }).touchDamageMul ?? 1;
        o.hit(this, d.atk * ratio);
      }
      return true;
    }
    if (o.useAttack === false) { if (Math.abs(dx) <= this.objReach) { b.setVelocityX(0); this.anim('idle'); return true; } }
    else if (Math.abs(dx) <= this.objReach) {
      b.setVelocityX(0);
      if (a && time >= this.attackReadyAt && (flying || this.grounded)) {
        const tele = a.telegraphMs ?? 300;
        this.st = 'attack'; this.attackReadyAt = time + a.cooldownMs; this.teleAt = performance.now();
        this.stateUntil = time + tele + 300; this.objTeleEnd = time + tele;
        if (DEBUG_TIMING) console.log(`[tele] ${d.id} 打阵眼 抬手 telegraphMs=${tele}`);
        this.anim('attack'); if (this.atlas) this.anims.pause();
        this.teleBlink = this.scene.tweens.addCounter({ from: 0, to: 1, duration: 120, yoyo: true, repeat: Math.floor(tele / 240),
          onUpdate: tw => this.setTint(Phaser.Display.Color.GetColor(255, 255 - 120 * tw.getValue()!, 255 - 120 * tw.getValue()!)) });
      } else this.anim('idle');
      return true;
    }
    b.setVelocityX(this.dir * d.moveSpeed);
    if (!flying && this.grounded && (this.dir > 0 ? b.blocked.right : b.blocked.left)) b.setVelocityY(-o.climbVy);
    this.anim('walk');
    return true;
  }
  /** 到阵眼多近开打：近战 = 阵眼半宽 + range.w / 2；远程 = range.w */
  private get objReach() {
    const a = this.def.attack, o = this.objective!;
    if (o.contact) return o.halfW + this.body.width / 2;
    if (!a || o.useAttack === false) return o.halfW;
    return a.type === 'projectile' ? (a.range?.w ?? 200) * 0.8 : o.halfW + (a.range?.w ?? 48) / 2;
  }

  private face() { this.setFlipX(this.dir > 0); }   // 美术朝左画

  /** Y2：slam 读自己的 range；charge / projectile 走 #3c 新逻辑；其余未实现类型（poison 等）临时按 96×48 拍地 */
  get slamRange() { const a = this.def.attack!; return a.type === 'slam' && a.range ? a.range : FALLBACK_RANGE; }
  /** 出手距离：冲锋 = 冲锋距离 + 撞击宽度一半；丢符 = range.w；其余 = 拍地宽度 */
  get triggerRange() {
    const a = this.def.attack!;
    if (a.type === 'charge') return this.chargeDist + (a.range?.w ?? 64) / 2;
    if (a.type === 'projectile') return a.range?.w ?? FALLBACK_RANGE.w * 3;
    return this.slamRange.w;
  }
  private get chargeDist() { return (this.def.attack as { distance?: number }).distance ?? CHARGE_MAX_DIST; }

  private startCharge(time: number) {
    if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 冲锋开始 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
    this.charge = { fromX: this.x, hit: false, prevX: this.x };
    this.suppressTouch = true;   // 冲锋只按 damageRatio 结算一次，不叠接触伤害
    this.anim('walk');
    this.tickCharge(time, null);
  }

  private tickCharge(time: number, player: (Phaser.Physics.Arcade.Sprite & { dead?: boolean }) | null) {
    const c = this.charge!, b = this.body, a = this.def.attack!;
    const traveled = (this.x - c.fromX) * this.dir;
    const aheadX = this.dir > 0 ? b.right + 4 : b.left - 6;
    const ground = this.scene.physics.overlapRect(aheadX, b.bottom + 2, 2, 6, false, true).length > 0;
    const wall = this.dir > 0 ? b.blocked.right : b.blocked.left;
    if (this.st === 'dead' || traveled >= this.chargeDist || !ground || (wall && traveled > 1) || !this.grounded) {
      b.setVelocityX(0);
      if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 冲锋结束 距离 ${Math.round(traveled)}px${!ground ? '（平台边缘）' : wall ? '（撞墙）' : ''}`);
      this.charge = null; this.suppressTouch = false;
      if (this.st === 'attack') { this.stateUntil = time + CHARGE_RECOVER_MS; this.anim('idle'); }
      return;
    }
    b.setVelocityX(this.dir * CHARGE_SPEED);
    if (player && !c.hit && !player.dead) {
      const pb = player.body as Phaser.Physics.Arcade.Body;
      const dx = this.x - c.prevX;
      const rect = new Phaser.Geom.Rectangle(Math.min(b.x, b.x - dx), b.y, b.width + Math.abs(dx), b.height);
      if (Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) {
        c.hit = true;
        if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 冲锋命中`);
        this.onSkillDamage?.(this, a.damageRatio, a.knockback, this.x);
      }
    }
    c.prevX = this.x;
  }

  private throwTalisman(_time: number, player: Phaser.Physics.Arcade.Sprite) {
    const a = this.def.attack! as { damageRatio: number; knockback: number; range: { w: number; h: number }; speed?: number };
    if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 丢符 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
    this.dir = Math.sign(player.x - this.x) || this.dir;
    const speed = a.speed ?? PROJECTILE_SPEED;
    const range = a.range ?? { w: 320, h: 32 };
    const sx = this.x + this.dir * 20, sy = this.body.bottom - this.body.height / 2;
    this.onVolley?.({
      fx: 'fx_black_robe_projectile', ratio: a.damageRatio, knockback: a.knockback, atk: this.def.atk,
      shots: [{ x: sx, y: sy, vx: this.dir * speed, vy: 0 }],
      maxDist: range.w, body: { w: Math.min(32, range.h), h: range.h },
    });
  }
  private doSlam() {
    if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 出伤害 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
    const r = this.slamRange, b = this.body;
    const x = this.dir > 0 ? b.center.x : b.center.x - r.w;
    this.onSlam?.(this, new Phaser.Geom.Rectangle(x, b.bottom - r.h, r.w, r.h));
  }

  takeHit(time: number, dmg: number, fromDir: number) {
    if (this.dead) return;
    const d = this.def;
    // invulnerable 不扣血；minHp 是血量下限；immortal（木人桩）打空立刻回满
    if (!d.invulnerable) this.hp = Math.max(d.minHp ?? 0, this.hp - dmg);
    if (d.immortal && this.hp <= 0) this.hp = d.hp;
    // interruptible 缺省 false：整段出招不打断、不击退、不重置冷却。前摇里只闪白，继续播当前攻击帧
    const armored = !!this.cast && this.cast.interruptible !== true;
    if (armored) this.flashWhite(time);
    else {
      this.setTintFill(0xffffff);
      this.scene.time.delayedCall(60, () => { if (this.active && !this.flashUntil) this.clearTint(); });
    }
    if (d.immortal) return;   // 不死：只扣血闪白，不进受击硬直（沿用原木人桩表现）
    if (this.hp <= 0) return this.die();
    if (armored) return;
    if (this.cast?.interruptible === true) this.abortCast();
    if (this.st !== 'attack') {
      this.st = 'hit'; this.stateUntil = time + 350;
      this.body.setVelocity(fromDir * 60, -110); this.anim('hit');
    }
    if (this.def.aggressive) this.dir = -fromDir;
  }

  private die() {
    if (this.st === 'dead' || this.despawning) return;
    this.abortCast();
    this.charge = null;
    for (const s of this.summons) if (s.despawnWithOwner && s.active && !s.dead) s.despawn();
    this.st = 'dead'; this.body.enable = false; this.bar.clear();
    this.anim('die');
    this.scene.tweens.add({ targets: this, alpha: 0, delay: 350, duration: 400 });
    this.onDead?.(this);
    // respawnMs 0（或召唤物）= 不重生，死亡演出后销毁
    if (this.noRespawn || !(this.def.respawnMs > 0)) this.scene.time.delayedCall(800, () => { if (this.active) this.destroy(); });
    else this.scene.time.delayedCall(this.def.respawnMs, () => this.respawn());
  }

  /** 首领死亡：脚底播消散，第 2 帧藏本体，播完销毁。不走死亡奖励 */
  despawn() {
    if (!this.active || this.despawning || this.st === 'dead') return;
    this.despawning = true; this.st = 'dead';
    this.abortCast();
    this.body.setVelocity(0, 0); this.body.enable = false; this.bar.clear();
    const key = 'fx_summon_despawn';
    const pack = this.pack(key);
    const anim = pack?.anims?.[0];
    const rate = anim?.frameRate ?? 12;
    const n = anim?.frames?.length ?? 6;
    const now = this.scene.time.now;
    this.despawnHideAt = now + (2 - 1) * (1000 / rate);
    this.despawnDoneAt = now + n * (1000 / rate);
    if (this.scene.textures.exists(key)) {
      const origin = pack?.origin ?? [0.5, 1];
      const s = this.scene.add.sprite(this.x, this.y, key).setOrigin(origin[0], origin[1]).setDepth(DEPTH_SKILL_FX).setBlendMode(Phaser.BlendModes.NORMAL);
      if (anim && this.scene.anims.exists(anim.key)) s.play(anim.key);
      this.fxTimers.push({ sprite: s, doneAt: this.despawnDoneAt });
    }
  }

  private tickDespawn(time: number) {
    if (!this.despawnHidden && time >= this.despawnHideAt) { this.despawnHidden = true; this.setVisible(false); }
    if (time >= this.despawnDoneAt) {
      for (const f of this.fxTimers) f.sprite.destroy();
      this.fxTimers = [];
      this.destroy();
    }
  }

  private respawn() {
    if (!this.scene || !this.active) return;
    this.hp = this.def.hp; this.st = 'patrol'; this.cast = null; this.usedOnce.clear(); this.summons = [];
    this.suppressTouch = false; this.dashing = false; this.setAlpha(0).setVisible(true);
    this.body.enable = true; this.body.reset(this.home.x, this.home.y);
    this.anim('idle');
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 400 });
  }

  private drawBar() {
    this.bar.clear();
    if (this.dead || this.hp >= this.def.hp || this.def.isBoss) return;
    const w = 44, y = this.y - this.body.height - 14;
    this.bar.fillStyle(0x222222).fillRect(this.x - w / 2, y, w, 5).fillStyle(0xe8443a).fillRect(this.x - w / 2, y, w * Math.max(0, this.hp) / this.def.hp, 5);
  }

  // ---------------- 首领技能 ----------------

  private trySkills(time: number, player: Phaser.Physics.Arcade.Sprite, dx: number, sees: boolean) {
    if (!this.grounded) return false;
    const skills = this.def.skills ?? [];
    const ratio = this.hp / this.def.hp;
    const summon = skills.find(s => s.type === 'summon' && !this.usedOnce.has(s.id) && ratio < (s.hpBelow ?? 1));
    if (summon) { this.startSkill(summon, time, player); return true; }
    if (!sees) return false;
    const dash = skills.find(s => s.type === 'dash' && this.cdReady(s.id, time) && Math.abs(dx) <= (s.distance ?? Infinity));
    if (dash) { this.startSkill(dash, time, player); return true; }
    const shot = skills.find(s => s.type === 'projectile' && this.cdReady(s.id, time));
    if (shot) { this.startSkill(shot, time, player); return true; }
    return false;
  }

  private startSkill(skill: MonsterSkill, time: number, player: Phaser.Physics.Arcade.Sprite) {
    const dx = player.x - this.x;
    if (Math.abs(dx) > 4) this.dir = Math.sign(dx) || this.dir;
    const meta = this.skillMeta(skill.id);
    const anim = this.pack(this.def.sprite)?.anims?.find(a => a.key === `${this.def.sprite}_${skill.id}`);
    const frames = anim?.frames ?? [];
    const frameMs = 1000 / (anim?.frameRate || 8);
    const release = meta?.release ?? 1;
    const windup = skill.type === 'dash' ? (skill.telegraphMs ?? 0) : Math.max(0, release - 1) * frameMs;
    this.st = 'attack'; this.body.setVelocityX(0);
    if (this.atlas) this.anims.stop();
    if (this.atlas && frames[0]) this.setFrame(frames[0]);
    this.cast = {
      skill, t0: time, wall0: performance.now(),
      releaseAt: time + windup, endAt: time + Math.max(frames.length, 1) * frameMs,
      interruptible: skill.interruptible === true, released: false,
      frames, frameMs, meta,
    };
    if (skill.once) this.usedOnce.add(skill.id);
    this.armCd(skill, time);
    this.suppressTouch = skill.type === 'dash';
    if (DEBUG_TIMING) {
      if (skill.type === 'dash') console.log(`[tele] ${this.def.id} ${skill.id} 抬手 telegraphMs=${skill.telegraphMs ?? 0}`);
      else console.log(`[tele] ${this.def.id} ${skill.id} 抬手 出手帧=${release} 预计 +${Math.round(windup)}ms`);
      if (skill.type === 'summon' && !skill.cooldownMs) console.log(`[tele] ${this.def.id} ${skill.id} 唤狐 once（无 cooldownMs）`);
    }
    if (skill.type === 'dash') this.ensureWarn(meta?.warnFx ?? `${meta?.fx ?? this.fxKey(skill)}_warn`);
    this.face();
  }

  private tickCast(time: number, player: Phaser.Physics.Arcade.Sprite) {
    const cast = this.cast!;
    this.face();
    if (cast.skill.type === 'dash') { this.tickDash(time, player); return; }
    const elapsed = time - cast.t0;
    if (cast.frames.length) this.pose(cast.frames, Math.min(cast.frames.length - 1, Math.floor(elapsed / cast.frameMs)));
    this.body.setVelocityX(0);
    if (!cast.released && time >= cast.releaseAt) {
      cast.released = true;
      this.logCast('出手');
      if (cast.skill.type === 'projectile') this.releaseProjectiles(player);
      else if (cast.skill.type === 'summon') this.releaseSummon(time);
    }
    if (cast.spawnAt && !cast.spawned && time >= cast.spawnAt) {
      cast.spawned = true;
      this.logCast('召唤落下');
      const grant = cast.skill.grantRewards ?? false;
      const despawn = cast.skill.despawnWithOwner ?? true;
      for (const p of cast.points ?? []) this.onSummon?.(this, cast.skill.summon ?? '', p.x, p.y, grant, despawn);
    }
    if (time >= cast.endAt) this.endCast();
  }

  private tickDash(time: number, player: Phaser.Physics.Arcade.Sprite) {
    const cast = this.cast!, skill = cast.skill, meta = cast.meta;
    if (time < cast.releaseAt) {
      const tf = meta?.telegraphFrames ?? [1];
      const tele = Math.max(1, skill.telegraphMs ?? 0);
      const idx = Math.min(tf.length - 1, Math.floor((time - cast.t0) / tele * tf.length));
      this.pose(cast.frames, (tf[idx] ?? 1) - 1);
      this.body.setVelocityX(0);
      this.placeWarn();
      return;
    }
    if (!cast.dashStarted) {
      cast.dashStarted = true; cast.fromX = this.x; cast.prevX = this.x;
      this.logCast('前摇结束'); this.logCast('出手');
      this.destroyWarn();
      this.dashing = true;
    }
    if (!cast.dashDone) {
      const dist = skill.distance ?? 0;
      const traveled = (this.x - (cast.fromX ?? this.x)) * this.dir;
      const blocked = this.dir > 0 ? this.body.blocked.right : this.body.blocked.left;
      if (traveled >= dist - 0.5 || (cast.moved && blocked)) {
        if (!(blocked && traveled < dist)) this.body.reset((cast.fromX ?? this.x) + this.dir * dist, this.y);
        this.body.setVelocityX(0);
        cast.dashDone = true; cast.recoverAt = time + cast.frameMs; this.dashing = false;
        this.pose(cast.frames, (meta?.recoverFrame ?? cast.frames.length) - 1);
        const mid = ((cast.fromX ?? this.x) + this.x) / 2;
        this.spawnFx(meta?.fx ?? this.fxKey(skill), mid, this.y, this.dir > 0);
      } else {
        this.body.setVelocityX(this.dir * DASH_SPEED);
        this.pose(cast.frames, (meta?.dashFrame ?? 3) - 1);
        this.tryDashHit(player);
        cast.moved = true; cast.prevX = this.x;
      }
      return;
    }
    this.body.setVelocityX(0);
    if (time >= (cast.recoverAt ?? time)) this.endCast();
  }

  private tryDashHit(player: Phaser.Physics.Arcade.Sprite) {
    const cast = this.cast;
    if (!cast || cast.didHit) return;
    const pb = player.body as Phaser.Physics.Arcade.Body;
    const mb = this.body;
    const dx = this.x - (cast.prevX ?? this.x);
    const rect = new Phaser.Geom.Rectangle(Math.min(mb.x, mb.x - dx), mb.y, mb.width + Math.abs(dx), mb.height);
    if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(pb.x, pb.y, pb.width, pb.height))) return;
    cast.didHit = true;
    this.onSkillDamage?.(this, cast.skill.damageRatio ?? 1, cast.skill.knockback ?? this.def.knockback, this.x);
  }

  private releaseProjectiles(player: Phaser.Physics.Arcade.Sprite) {
    const cast = this.cast!, skill = cast.skill, meta = cast.meta;
    const off = meta?.spawnOffset ?? [0, -40];
    const sx = this.x + (this.dir < 0 ? off[0] : -off[0]);
    const sy = this.y + off[1];
    const count = skill.count ?? 1;
    const speed = skill.speed ?? 0;
    const aim = Math.atan2((player.body as Phaser.Physics.Arcade.Body).center.y - sy, player.x - sx);
    const shots = [];
    for (let i = 0; i < count; i++) {
      const a = aim + (i - (count - 1) / 2) * FOX_FIRE_SPREAD;
      shots.push({ x: sx, y: sy, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed });
    }
    this.onVolley?.({
      fx: meta?.fx ?? skill.fx ?? this.fxKey(skill),
      ratio: skill.damageRatio ?? 1,
      knockback: skill.knockback ?? this.def.knockback,
      atk: this.def.atk, shots,
    });
  }

  private releaseSummon(time: number) {
    const cast = this.cast!, skill = cast.skill;
    const fx = cast.meta?.fx ?? skill.fx ?? this.fxKey(skill);
    const count = skill.count ?? 1;
    const lo = this.patrolBounds?.[0] ?? this.x - 480;
    const hi = this.patrolBounds?.[1] ?? this.x + 480;
    cast.points = [];
    for (let i = 0; i < count; i++) {
      const raw = this.x + (i - (count - 1) / 2) * SUMMON_GAP;
      const x = Phaser.Math.Clamp(raw, lo + 24, hi - 24);
      cast.points.push({ x, y: this.y });
      this.spawnFx(fx, x, this.y, false);
    }
    const rate = this.pack(fx)?.anims?.[0]?.frameRate ?? 12;
    cast.spawnAt = time + (SUMMON_SPAWN_FRAME - 1) * (1000 / rate);
    cast.spawned = false;
  }

  private endCast() {
    this.destroyWarn();
    this.suppressTouch = false; this.dashing = false;
    this.cast = null;
    if (this.st === 'attack') this.st = 'patrol';
  }

  private abortCast() {
    this.destroyWarn();
    this.suppressTouch = false; this.dashing = false;
    this.cast = null;
  }

  private ensureWarn(key: string) {
    if (!this.cast || this.cast.warn || !this.scene.textures.exists(key)) return;
    const origin = this.pack(key)?.origin ?? [0.9286, 1];
    const s = this.scene.add.sprite(this.x, this.y, key).setDepth(DEPTH_WARN).setBlendMode(Phaser.BlendModes.NORMAL);
    s.setData('oxL', origin[0]); s.setData('oxR', 1 - origin[0]); s.setData('oy', origin[1]);
    const anim = this.pack(key)?.anims?.[0];
    if (anim && this.scene.anims.exists(anim.key)) s.play(anim.key);
    this.cast.warn = s;
    this.placeWarn();
  }

  /** 动画每帧会把原点设回图集 pivot。朝右要在渲染前改成 1 - pivotX（0.9286 → 0.0714）并 flipX */
  private placeWarn() {
    const s = this.cast?.warn;
    if (!s) return;
    const right = this.dir > 0;
    s.setFlipX(right).setOrigin(right ? s.getData('oxR') : s.getData('oxL'), s.getData('oy')).setPosition(this.x, this.y);
  }
  private destroyWarn() { this.cast?.warn?.destroy(); if (this.cast) this.cast.warn = undefined; }

  private spawnFx(key: string, x: number, y: number, flipX: boolean) {
    if (!this.scene.textures.exists(key)) return;
    const pack = this.pack(key);
    const origin = pack?.origin ?? [0.5, 1];
    const s = this.scene.add.sprite(x, y, key).setOrigin(origin[0], origin[1]).setFlipX(flipX).setDepth(DEPTH_SKILL_FX).setBlendMode(Phaser.BlendModes.NORMAL);
    const anim = pack?.anims?.[0];
    if (anim && this.scene.anims.exists(anim.key)) s.play(anim.key);
    const n = anim?.frames?.length ?? 1;
    const rate = anim?.frameRate ?? 12;
    this.fxTimers.push({ sprite: s, doneAt: this.scene.time.now + (anim?.repeat === -1 ? 600000 : n * (1000 / rate)) });
  }

  private pose(frames: string[], index: number) {
    if (!this.atlas) return;
    const name = frames[Math.max(0, Math.min(frames.length - 1, index))];
    if (name && this.frame.name !== name) this.setFrame(name);
  }

  private flashWhite(time: number) { this.setTintFill(0xffffff); this.flashUntil = time + ARMOR_FLASH_MS; }
  private tickFlash(time: number) {
    if (this.flashUntil && time >= this.flashUntil) { this.flashUntil = 0; this.clearTint(); }
  }

  private tickFx(time: number) {
    if (!this.fxTimers.length) return;
    this.fxTimers = this.fxTimers.filter(f => {
      if (time >= f.doneAt) { f.sprite.destroy(); return false; }
      return true;
    });
  }

  private cdReady(id: string, time: number) { const c = this.cooldowns[id]; return !c || time >= c.readyAt; }
  private armCd(skill: MonsterSkill, time: number) {
    const ms = skill.cooldownMs ?? 0;
    if (!ms) return;
    this.cooldowns[skill.id] = { readyAt: time + ms, wall: performance.now(), game: time, ms, logged: false };
    if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} ${skill.id} 冷却开始 cooldownMs=${ms}`);
  }
  private tickCooldownLogs(time: number) {
    if (!DEBUG_TIMING) return;
    for (const [id, c] of Object.entries(this.cooldowns)) {
      if (!c.logged && time >= c.readyAt) {
        c.logged = true;
        console.log(`[tele] ${this.def.id} ${id} 冷却结束 游戏 +${Math.round(time - c.game)}ms 实际 +${Math.round(performance.now() - c.wall)}ms`);
      }
    }
  }
  private logCast(tag: string) {
    const cast = this.cast;
    if (!DEBUG_TIMING || !cast || cast.logged?.[tag]) return;
    (cast.logged ??= {})[tag] = true;
    const time = this.scene.time.now;
    console.log(`[tele] ${this.def.id} ${cast.skill.id} ${tag} 游戏 +${Math.round(time - cast.t0)}ms 实际 +${Math.round(performance.now() - cast.wall0)}ms`);
  }

  private pack(key: string): AnimPack | undefined { return this.scene.cache.json.get(`${key}_anims`); }
  private skillMeta(id: string) { return this.pack(this.def.sprite)?.skillFrames?.[id]; }
  /** 规范 G6：fx_<短名>_<技能id>，demon_fox 的短名是 fox */
  private fxKey(skill: MonsterSkill) { return `fx_${this.def.id.split('_').pop()}_${skill.id}`; }
}
