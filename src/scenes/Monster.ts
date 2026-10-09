import Phaser from 'phaser';
import type { MonsterDef } from '../data';

type MState = 'patrol' | 'idle' | 'chase' | 'attack' | 'hit' | 'dead';

/** ?debug=timing：把山魈等的前摇各段时间打到控制台，方便和实测对数 */
const DEBUG_TIMING = typeof location !== 'undefined' && new URLSearchParams(location.search).get('debug') === 'timing';
const BODY: Record<string, [number, number]> = {
  mon_demon_fox: [64, 110],
  mon_spirit_rabbit: [34, 30], mon_bamboo_snake: [46, 22], mon_mountain_mandrill: [46, 58],
};

/** 小怪：巡逻 / 主动怪追击 / 山魈拍地 / 受击 / 死亡 / 复活。数值全部来自 monsters.json */
export class Monster extends Phaser.Physics.Arcade.Sprite {
  declare body: Phaser.Physics.Arcade.Body;
  def: MonsterDef; hp: number; home: { x: number; y: number };
  st: MState = 'patrol'; dir = -1; stateUntil = 0; attackReadyAt = 0;
  atlas: boolean; bar: Phaser.GameObjects.Graphics;
  patrolBounds?: [number, number];
  onSlam?: (m: Monster, rect: Phaser.Geom.Rectangle) => void;
  onDead?: (m: Monster) => void;

  constructor(scene: Phaser.Scene, x: number, y: number, def: MonsterDef) {
    const atlas = scene.textures.exists(def.sprite);
    super(scene, x, y, atlas ? def.sprite : Monster.placeholder(scene, def));
    this.def = def; this.hp = def.hp; this.home = { x, y }; this.atlas = atlas;
    scene.add.existing(this); scene.physics.add.existing(this);
    this.setOrigin(0.5, 1).setDepth(8);
    const fs = this.frame.realWidth, fh = this.frame.realHeight;
    const [bw, bh] = BODY[def.sprite] ?? [Math.min(fs - 8, 40), Math.min(fh - 4, 56)];
    this.body.setSize(bw, bh).setOffset((fs - bw) / 2, fh - bh);
    this.body.setMaxVelocityY(670);
    if (def.moveSpeed === 0) this.body.setImmovable(true);
    this.dir = Math.random() < 0.5 ? -1 : 1;
    this.bar = scene.add.graphics().setDepth(11);
    this.anim('idle');
    this.on(Phaser.Animations.Events.ANIMATION_UPDATE, (_a: any, frame: Phaser.Animations.AnimationFrame) => {
      // 出伤害改在前摇结束时直接触发（见 step），这里不再按帧判，免得低帧率下拖长
    });
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

  get dead() { return this.st === 'dead'; }
  get grounded() { return this.body.blocked.down || this.body.touching.down; }

  step(time: number, player: Phaser.Physics.Arcade.Sprite & { dead?: boolean }) {
    const d = this.def, b = this.body;
    this.drawBar();
    if (this.st === 'dead') return;
    if (d.moveSpeed === 0) { b.setVelocityX(0); return; }
    // 前摇结束：落下出伤害
    if (this.teleEnd && time >= this.teleEnd) {
      this.teleEnd = 0; this.teleBlink?.stop(); this.teleBlink = undefined; this.clearTint();
      if (DEBUG_TIMING) console.log(`[tele] ${d.id} 前摇结束 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
      if (this.st === 'attack') { if (this.atlas) { this.anims.resume(); this.anims.nextFrame(); } this.doSlam(); }
    }
    if ((this.st === 'hit' || this.st === 'attack') && time < this.stateUntil) {
      if (this.grounded && this.st === 'attack') b.setVelocityX(0);
      return this.face();
    }
    if (this.st === 'hit' || this.st === 'attack') this.st = 'patrol';

    const dx = player.x - this.x, dy = player.y - this.y;
    const sees = d.aggressive && !player.dead && Math.abs(dx) < (d.aggroRange ?? 0) && Math.abs(dy) < 64;

    // 山魈：玩家进入拍地范围就出手
    if (d.attack && sees && time >= this.attackReadyAt && Math.abs(dx) < d.attack.range.w && this.grounded) {
      this.dir = Math.sign(dx) || this.dir;
      // 前摇：停在抬手帧 telegraphMs（默认 500ms），身体闪红，然后才落下出伤害
      const tele = (d.attack as any).telegraphMs ?? 500;
      this.st = 'attack'; this.attackReadyAt = time + d.attack.cooldownMs; this.teleAt = performance.now(); this.teleGameAt = this.scene.time.now;
      if (DEBUG_TIMING) console.log(`[tele] ${d.id} 抬手 telegraphMs=${tele}`);
      this.stateUntil = time + tele + 450;
      b.setVelocityX(0); this.anim('attack');
      if (this.atlas) this.anims.pause();
      const blink = this.scene.tweens.addCounter({ from: 0, to: 1, duration: 120, yoyo: true, repeat: Math.floor(tele / 240),
        onUpdate: tw => this.setTint(Phaser.Display.Color.GetColor(255, 255 - 120 * tw.getValue()!, 255 - 120 * tw.getValue()!)) });
      this.teleEnd = time + tele; this.teleBlink = blink;   // 前摇结束在 update 里按同一个时钟判，不用 delayedCall（低帧率下会被拖长）
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

  private face() { this.setFlipX(this.dir > 0); }   // 美术朝左画

  private teleAt = 0; private teleGameAt = 0; private teleEnd = 0; private teleBlink?: Phaser.Tweens.Tween;
  private doSlam() {
    if (DEBUG_TIMING) console.log(`[tele] ${this.def.id} 出伤害 实际 +${Math.round(performance.now() - this.teleAt)}ms`);
    const r = this.def.attack!.range, b = this.body;
    const x = this.dir > 0 ? b.center.x : b.center.x - r.w;
    this.onSlam?.(this, new Phaser.Geom.Rectangle(x, b.bottom - r.h, r.w, r.h));
  }

  takeHit(time: number, dmg: number, fromDir: number) {
    if (this.dead) return;
    this.hp -= dmg;
    this.setTintFill(0xffffff); this.scene.time.delayedCall(60, () => this.clearTint());
    if (this.def.respawnMs === 0) { if (this.hp <= 0) this.hp = this.def.hp; return; }   // 木人桩：打不死
    if (this.hp <= 0) return this.die();
    if (this.st !== 'attack') {                                     // 拍地中不被打断（霸体）
      this.st = 'hit'; this.stateUntil = time + 350;
      this.body.setVelocity(fromDir * 60, -110); this.anim('hit');
    }
    if (this.def.aggressive) this.dir = -fromDir;
  }

  private die() {
    this.st = 'dead'; this.body.enable = false; this.bar.clear();
    this.anim('die');
    this.scene.tweens.add({ targets: this, alpha: 0, delay: 350, duration: 400 });
    this.onDead?.(this);
    this.scene.time.delayedCall(this.def.respawnMs, () => this.respawn());
  }

  private respawn() {
    if (!this.scene) return;
    this.hp = this.def.hp; this.st = 'patrol'; this.setAlpha(0);
    this.body.enable = true; this.body.reset(this.home.x, this.home.y);
    this.anim('idle');
    this.scene.tweens.add({ targets: this, alpha: 1, duration: 400 });
  }

  private drawBar() {
    this.bar.clear();
    if (this.dead || this.hp >= this.def.hp) return;
    const w = 44, y = this.y - this.body.height - 14;
    this.bar.fillStyle(0x222222).fillRect(this.x - w / 2, y, w, 5).fillStyle(0xe8443a).fillRect(this.x - w / 2, y, w * this.hp / this.def.hp, 5);
  }
}
