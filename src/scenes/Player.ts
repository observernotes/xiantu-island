import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';
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
  onOneWay = false;          // 由碰撞回调每帧写入
  dropUntil = 0;
  ropeRegrabAt = 0;
  lastGroundAt = 0;
  jumpBufferedAt = -9999;
  attackReadyAt = 0;
  attackLockUntil = 0;
  hurtUntil = 0;
  invulnUntil = 0;
  onAttack?: (hit: Phaser.Geom.Rectangle) => void;

  constructor(scene: Phaser.Scene, x: number, y: number) {
    super(scene, x, y, Player.makeTexture(scene));
    scene.add.existing(this);
    scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(10);
    this.body.setSize(SPEC.bodyW, SPEC.bodyH);
    this.body.setOffset((SPEC.charCanvas - SPEC.bodyW) / 2, SPEC.charCanvas - SPEC.bodyH);
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
        this.canDouble = true; this.jumpBufferedAt = -9999;
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
    if (grounded) { this.state2 = 'ground'; this.lastGroundAt = time; this.canDouble = true; }
    else this.state2 = 'air';

    // ---- 抓绳 ----
    if (time >= this.ropeRegrabAt && (inp.up || (inp.down && grounded))) {
      const r = this.findRope(ropes, inp.up, grounded);
      if (r) { this.grabRope(r, inp.up ? null : r.top + 14); return this.finish(time); }
    }

    // ---- 跳 ----
    const buffered = time - this.jumpBufferedAt <= FEEL.jumpBufferMs;
    const canGroundJump = grounded || time - this.lastGroundAt <= FEEL.coyoteMs;
    if (buffered && time >= this.attackLockUntil) {
      if (grounded && inp.down && this.onOneWay) {            // ↓+跳：穿过单向平台
        this.dropUntil = time + FEEL.dropThroughMs;
        b.setVelocityY(60);
        this.jumpBufferedAt = -9999;
      } else if (canGroundJump && b.velocity.y >= -1) {
        b.setVelocityY(-FEEL.jumpSpeed);
        this.lastGroundAt = -9999; this.jumpBufferedAt = -9999;
        this.state2 = 'air';
      } else if (!grounded && inp.jumpDown && this.canDouble) { // 二段跳
        this.canDouble = false;
        b.setVelocity(this.facing * FEEL.doubleJumpVx, -FEEL.doubleJumpVy);
        this.jumpBufferedAt = -9999;
        this.emit('doublejump');
      }
    }

    // ---- 水平移动 ----
    const locked = FEEL.attackLocksGroundMove && time < this.attackLockUntil && this.state2 === 'ground';
    const prone = this.state2 === 'ground' && inp.down;
    if (this.state2 === 'ground') {
      const target = locked || prone ? 0 : dir * FEEL.walkSpeed;
      const rate = target === 0 ? FEEL.groundDecel : FEEL.groundAccel;
      b.setVelocityX(approach(b.velocity.x, target, rate * dt));
    } else if (dir !== 0) {
      const vx = b.velocity.x;
      if (Math.sign(vx) !== dir || Math.abs(vx) < FEEL.airMaxSpeed)
        b.setVelocityX(approach(vx, dir * FEEL.airMaxSpeed, FEEL.airAccel * dt));
    }
    if (dir !== 0 && !locked) this.facing = dir;

    // ---- 普攻 ----
    if (inp.attackDown && time >= this.attackReadyAt) {
      this.attackReadyAt = time + FEEL.attackCooldownMs;
      this.attackLockUntil = time + FEEL.attackCooldownMs * 0.8;
      const w = FEEL.attackRange, h = FEEL.attackHeight;
      const x = this.facing > 0 ? b.right - 4 : b.left - w + 4;
      this.onAttack?.(new Phaser.Geom.Rectangle(x, b.bottom - h - 6, w, h));
    }

    this.setScale(1, prone ? 0.7 : 1);
    this.finish(time);
  }

  private finish(time: number) {
    this.setFlipX(this.facing < 0);
    this.setAlpha(time < this.invulnUntil ? (Math.floor(time / 80) % 2 ? 0.35 : 0.9) : 1);
    this.onOneWay = false;
  }

  private findRope(ropes: Rope[], up: boolean, grounded: boolean) {
    for (const r of ropes) {
      if (Math.abs(this.x - r.x) > FEEL.ropeGrabRangeX) continue;
      if (up && this.feet > r.top + 4 && this.body.top < r.bottom) return r;
      if (!up && grounded && Math.abs(this.feet - r.top) <= 6) return r;  // 站在绳头上按↓往下爬
    }
    return null;
  }

  private grabRope(r: Rope, feetY: number | null) {
    this.rope = r; this.state2 = 'rope';
    this.body.setAllowGravity(false);
    this.body.reset(r.x, feetY ?? Math.min(this.feet, r.bottom));
    this.setScale(1, 1);
  }

  leaveRope(time: number) {
    this.rope = null;
    this.body.setAllowGravity(true);
    this.ropeRegrabAt = time + 250;
    this.state2 = 'air';
  }

  hurt(time: number, fromX: number, dmg: number) {
    if (time < this.invulnUntil) return;
    if (this.state2 === 'rope') this.leaveRope(time);
    this.hp = Math.max(0, this.hp - dmg);
    this.state2 = 'hurt';
    this.hurtUntil = time + 300;
    this.invulnUntil = time + FEEL.hurtInvulnMs;
    const away = this.x < fromX ? -1 : 1;
    this.body.setVelocity(away * FEEL.hurtKnockVx, -FEEL.hurtKnockVy);
    if (this.hp <= 0) this.hp = this.maxHp; // 原型阶段：不死，直接回满
  }
}

export function approach(v: number, target: number, delta: number) {
  return v < target ? Math.min(v + delta, target) : Math.max(v - delta, target);
}
