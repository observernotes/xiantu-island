import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';
import { GROWTH } from '../data';
import { pixelsFromMovePoints } from '../move';
import { BASE_PLAYER_ATLAS, syncPlayerAppearance } from '../Appearance';
import { applySpriteArt, spriteArtSpec } from '../SpriteArt';
import type { Rope } from './MapBuilder';

export type PState = 'ground' | 'air' | 'rope' | 'hurt';

export interface Input {
  left: boolean; right: boolean; up: boolean; down: boolean;
  jumpDown: boolean; attackDown: boolean;
}

export class Player extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  state2: PState = 'air';
  facing = 1;
  hp = 100; maxHp = 100;
  rope: Rope | null = null;
  canDouble = true;
  private airJumpsUsed = 0;
  getAirJumpBonus: () => { extra: number; distanceRatio: number } = () => ({ extra: 0, distanceRatio: 0 });
  oneWayAt = -9999;          // 最近一次站在单向平台上的时间，由碰撞回调写入
  get onOneWay() { return this.scene.time.now - this.oneWayAt < 100; }
  dropUntil = 0;
  ropeRegrabAt = 0;
  lastGroundAt = 0;
  jumpBufferedAt = -9999;
  attackReadyAt = 0;
  attackLockUntil = 0;
  hurtUntil = 0;
  invulnUntil = 0;
  onAttack?: (hit: Phaser.Geom.Rectangle) => void;
  atlas = false;
  /** 读取当前装备，读档与换图后由 GameScene 重新绑定。 */
  getAppearance: () => string | undefined = () => undefined;
  animationKey(action: string) { return `${this.texture.key}_${action}`; }
  syncAppearance() {
    if (syncPlayerAppearance(this, this.getAppearance())) {
      this.atlas = true;
      applySpriteArt(this, [SPEC.bodyW, SPEC.bodyH]);
    }
  }
  /** 技能后摇期间锁移动。剑气斩可被跳跃取消。 */
  skillRooted = false;
  skillCancelOnJump = false;
  /** 霸体结束时间：受击掉血，但不击退、不进硬直。 */
  superArmorUntil = 0;
  /**
   * 当前速度 / 跳跃点数。GameScene 注入，读的是 Progress.currentMovePoints()。
   * window.__scene.player.speed / .jump 给测试用，基础 100，轻身术按等级加在点数上。
   */
  getMovePoints: () => { speed: number; jump: number } = () => ({
    speed: GROWTH.base.speed ?? 100,
    jump: GROWTH.base.jump ?? 100,
  });
  get speed() { return this.getMovePoints().speed; }
  get jump() { return this.getMovePoints().jump; }
  prone = false;
  gathering = false;
  didDouble = false;
  dead = false;
  /** 阴影反馈与受伤闪烁相乘，避免每帧 finish 覆盖渐变。 */
  shadowAlpha = 1;
  getSkillAlpha: () => number = () => 1;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    const atlas = scene.textures.exists(BASE_PLAYER_ATLAS);
    super(scene, x, y, atlas ? BASE_PLAYER_ATLAS : Player.makeTexture(scene));
    this.atlas = atlas;
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(10);
    this.body.setSize(SPEC.bodyW, SPEC.bodyH);
    this.body.setOffset((SPEC.charCanvas - SPEC.bodyW) / 2, SPEC.charCanvas - SPEC.bodyH);
    if (atlas) applySpriteArt(this, [SPEC.bodyW, SPEC.bodyH]);
    this.body.setMaxVelocityY(FEEL.maxFallSpeed);
    this.body.setCollideWorldBounds(true);
  }

  static makeTexture(scene: Phaser.Scene) {
    const key = 'proto-player';
    if (scene.textures.exists(key)) return key;
    const C = SPEC.charCanvas, g = scene.make.graphics({}, false);
    // 色块角色：2 头身比例（头大身小），月白道袍 + 天青腰带
    g.fillStyle(0xf4f1e6).fillRoundedRect(C / 2 - 15, C - 34, 30, 34, 6);     // 身体
    g.fillStyle(0x4fb3c9).fillRect(C / 2 - 15, C - 22, 30, 5);                 // 腰带
    g.fillStyle(0xffe0c2).fillCircle(C / 2, C - 50, 18);                        // 头
    g.fillStyle(0x2b2b3a).fillCircle(C / 2 + 8, C - 52, 3);                     // 眼睛（朝右）
    g.fillStyle(0x2b2b3a).fillRect(C / 2 - 18, C - 70, 30, 8);                  // 发髻
    g.lineStyle(2, 0x3a3a4a).strokeRoundedRect(C / 2 - 15, C - 34, 30, 34, 6).strokeCircle(C / 2, C - 50, 18);
    g.generateTexture(key, C, C); g.destroy();
    return key;
  }

  get onGround() { return this.body.blocked.down || this.body.touching.down; }
  get feet() { return this.body.bottom; }

  step(time: number, dt: number, inp: Input, ropes: Rope[]) {
    const b = this.body;
    const dir = (inp.right ? 1 : 0) - (inp.left ? 1 : 0);
    if (this.dead) { b.setVelocityX(0); return; }
    if (inp.jumpDown) this.jumpBufferedAt = time;

    // ---- 受击硬直 ----
    if (this.state2 === 'hurt') {
      if (time >= this.hurtUntil && this.onGround) this.state2 = 'ground';
      else if (time >= this.hurtUntil) this.state2 = 'air';
      else return this.finish(time);
    }

    // ---- 绳上 ----
    if (this.state2 === 'rope' && this.rope) {
      const r = this.rope;
      b.setAllowGravity(false);
      b.setVelocityX(0);
      this.x = r.x;
      const vy = inp.up ? -FEEL.climbSpeed : inp.down ? FEEL.climbSpeed : 0;
      b.setVelocityY(vy);
      if (dir !== 0) this.facing = dir;
      if (inp.jumpDown && dir !== 0) {           // 左/右 + 跳：跳离绳子
        this.leaveRope(time);
        b.setVelocity(dir * FEEL.ropeJumpVx, -FEEL.ropeJumpVy);
        this.canDouble = true; this.airJumpsUsed = 0; this.jumpBufferedAt = -9999;
        return this.finish(time);
      }
      if (this.feet <= r.top + 1 && inp.up) {    // 爬到顶：站上平台
        this.leaveRope(time);
        b.reset(r.x, r.top - 1);
        this.state2 = 'ground'; this.lastGroundAt = time;
        return this.finish(time);
      }
      if (this.feet >= r.bottom && !inp.up) {
        if (inp.down) { this.leaveRope(time); this.state2 = 'air'; }
        else { b.setVelocityY(0); this.y = r.bottom; }
      }
      return this.finish(time);
    }

    const grounded = this.onGround;
    if (grounded) { this.state2 = 'ground'; this.lastGroundAt = time; this.canDouble = true; this.airJumpsUsed = 0; this.didDouble = false; }
    else this.state2 = 'air';

    // ---- 抓绳 ----
    if (time >= this.ropeRegrabAt && (inp.up || (inp.down && grounded))) {
      const r = this.findRope(ropes, inp.up, grounded);
      if (r) { this.grabRope(r, inp.up ? null : r.top + 14); return this.finish(time); }
    }

    // ---- 跳 ----
    if (time >= this.attackLockUntil) { this.skillRooted = false; this.skillCancelOnJump = false; }
    const mv = pixelsFromMovePoints(this.speed, this.jump);
    const buffered = time - this.jumpBufferedAt <= FEEL.jumpBufferMs;
    const canGroundJump = grounded || time - this.lastGroundAt <= FEEL.coyoteMs;
    // 普攻后摇不能跳；剑气斩的后摇允许跳，跳起来就取消锁移动
    const jumpLocked = time < this.attackLockUntil && !this.skillCancelOnJump;
    if (buffered && !jumpLocked) {
      if (grounded && inp.down && this.onOneWay) {            // ↓+跳：穿过单向平台
        this.dropUntil = time + FEEL.dropThroughMs;
        b.setVelocityY(60);
        this.jumpBufferedAt = -9999;
        this.releaseSkillRecovery();
      } else if (grounded && inp.down) {                      // 实心地面上 ↓+跳：不动（冒险岛行为）
        this.jumpBufferedAt = -9999;
      } else if (canGroundJump && b.velocity.y >= -1) {
        b.setVelocityY(-mv.jumpSpeed);
        this.lastGroundAt = -9999; this.jumpBufferedAt = -9999;
        this.state2 = 'air';
        this.releaseSkillRecovery();
      } else if (!grounded && inp.jumpDown && this.canDouble) { // 二段跳：纵向横向都不吃轻身术
        const bonus = this.getAirJumpBonus();
        this.airJumpsUsed++;
        this.canDouble = this.airJumpsUsed < 1 + Math.max(0, Math.floor(bonus.extra)); this.didDouble = true;
        b.setVelocity(this.facing * FEEL.doubleJumpVx * (1 + bonus.distanceRatio), -FEEL.doubleJumpVy);
        this.jumpBufferedAt = -9999;
        this.emit('doublejump');
        this.releaseSkillRecovery();
      }
    }

    // ---- 水平移动 ----
    const rooted = this.skillRooted && time < this.attackLockUntil;
    const locked = rooted || (FEEL.attackLocksGroundMove && time < this.attackLockUntil && this.state2 === 'ground');
    const prone = this.state2 === 'ground' && inp.down;
    if (this.state2 === 'ground') {
      const target = locked || prone ? 0 : dir * mv.walkSpeed;
      const rate = target === 0 ? FEEL.groundDecel : FEEL.groundAccel;
      b.setVelocityX(approach(b.velocity.x, target, rate * dt));
    } else if (rooted) {
      b.setVelocityX(0);
    } else if (dir !== 0) {
      const vx = b.velocity.x;
      if (Math.sign(vx) !== dir || Math.abs(vx) < mv.airMaxSpeed)
        b.setVelocityX(approach(vx, dir * mv.airMaxSpeed, FEEL.airAccel * dt));
    }
    if (dir !== 0 && time >= this.attackLockUntil) this.facing = dir;   // 出刀期间锁朝向（地面空中都锁）

    // ---- 普攻 ----
    if (inp.attackDown && time >= this.attackReadyAt && time >= this.attackLockUntil) {
      this.attackReadyAt = time + FEEL.attackCooldownMs;
      this.attackLockUntil = time + FEEL.attackCooldownMs * 0.8;
      if (this.atlas) this.play(this.animationKey('attack'), true);
      this.scene.time.delayedCall(FEEL.attackHitDelayMs, () => {     // 第 2 帧出剑判定
        const w = FEEL.attackRange, h = FEEL.attackHeight;
        const x = this.facing > 0 ? b.right - 4 : b.left - w + 4;
        this.onAttack?.(new Phaser.Geom.Rectangle(x, b.bottom - h - 6, w, h));
      });
    }

    this.prone = prone;
    if (!this.atlas) this.setScale(1, prone ? 0.7 : 1);
    this.finish(time);
  }

  /** 跳跃取消剑气斩后摇：恢复移动，挥砍动画停下。弹道已经记了朝向，不受影响。 */
  private releaseSkillRecovery() {
    if (!this.skillCancelOnJump) return;
    this.attackLockUntil = 0;
    this.skillRooted = false;
    this.skillCancelOnJump = false;
    const key = this.anims.currentAnim?.key;
    if (key?.endsWith('_attack') && this.anims.isPlaying) this.anims.stop();
  }

  private finish(time: number) {
    this.setFlipX(this.atlas ? this.facing > 0 : this.facing < 0);
    if (this.atlas) this.updateAnim(time);
    this.syncWalkTimeScale();
    this.setAlpha(this.shadowAlpha * this.getSkillAlpha() * (time < this.invulnUntil ? (Math.floor(time / 80) % 2 ? 0.35 : 0.9) : 1));
  }

  /** 只有 walk 跟着速度点数走（满级轻身术、无其他速度加成时是 1.2），其它动画回到 1。 */
  private syncWalkTimeScale() {
    if (!this.atlas) return;
    const key = this.anims.currentAnim?.key ?? '';
    const walking = key.endsWith('_walk') && this.anims.isPlaying && !this.anims.isPaused;
    this.anims.timeScale = walking ? this.speed / 100 : 1;
  }

  private updateAnim(time: number) {
    const k = `${this.texture.key}_`;
    const cur = this.anims.currentAnim?.key;
    if (cur === k + 'attack' && this.anims.isPlaying) return;
    let next: string;
    if (this.state2 === 'hurt') next = 'hit';
    else if (this.state2 === 'rope') {
      next = this.rope?.kind === 'ladder' ? 'ladder' : 'rope';
      if (cur !== k + next) this.play(k + next);
      if (this.body.velocity.y === 0) this.anims.pause(); else this.anims.resume();
      return;
    } else if (this.gathering) next = this.scene.anims.exists(k + 'gather') ? 'gather' : 'idle';
    else if (this.state2 === 'air') next = this.didDouble ? 'djump' : 'jump';
    else if (this.prone) next = 'sit';
    else next = Math.abs(this.body.velocity.x) > 10 ? 'walk' : 'idle';
    if (this.anims.isPaused) this.anims.resume();
    if (cur !== k + next) this.play(k + next);
  }

  private findRope(ropes: Rope[], up: boolean, grounded: boolean) {
    for (const r of ropes) {
      if (Math.abs(this.x - r.x) > r.halfW) continue;
      if (up && this.feet > r.top + 4 && this.body.top < r.bottom) return r;
      if (!up && grounded && Math.abs(this.feet - r.top) <= 6) return r;  // 站在绳头上按↓往下爬
    }
    return null;
  }

  private grabRope(r: Rope, feetY: number | null) {
    this.rope = r; this.state2 = 'rope';
    this.body.setAllowGravity(false);
    this.body.reset(r.x, feetY ?? Math.min(this.feet, r.bottom));
    this.setScale(this.atlas ? spriteArtSpec(this).displayScale : 1);
  }

  leaveRope(time: number) {
    this.rope = null;
    this.body.setAllowGravity(true);
    this.ropeRegrabAt = time + 250;
    this.state2 = 'air';
  }

  hurt(time: number, fromX: number, dmg: number, knock = FEEL.hurtKnockVx): boolean {
    if (time < this.invulnUntil || this.dead) return false;
    const armor = time < this.superArmorUntil;
    if (this.state2 === 'rope' && !armor) this.leaveRope(time);
    this.hp = Math.max(0, this.hp - dmg);
    this.invulnUntil = time + FEEL.hurtInvulnMs;
    if (armor) return true;                 // 霸体：掉血，不击退，技能不被硬直打断
    this.state2 = 'hurt';
    this.hurtUntil = time + 300;
    const away = this.x < fromX ? -1 : 1;
    this.body.setVelocity(away * Math.min(knock * 1.2, 320), -FEEL.hurtKnockVy);
    return true;
  }
}

export function approach(v: number, target: number, delta: number) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}
