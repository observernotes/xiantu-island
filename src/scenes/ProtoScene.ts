import Phaser from 'phaser';
import { FEEL, SPEC } from '../config/feel';
import { PROTO_MAP } from '../config/maps';
import qingyunRaw from '../../../maps/qingyun_village.proto.txt?raw';
import { buildMap, BuiltMap } from './MapBuilder';
import { Player, Input } from './Player';

type Mob = Phaser.Physics.Arcade.Sprite & { hp: number; maxHp: number; dir: number; stunUntil: number; dead: boolean; home: { x: number; y: number }; bar: Phaser.GameObjects.Graphics };

export class ProtoScene extends Phaser.Scene {
  map!: BuiltMap;
  player!: Player;
  mobs!: Phaser.Physics.Arcade.Group;
  drops!: Phaser.Physics.Arcade.Group;
  keys!: Record<string, Phaser.Input.Keyboard.Key>;
  hud!: Phaser.GameObjects.Text;
  hpBar!: Phaser.GameObjects.Graphics;
  stones = 0;

  constructor() { super('proto'); (window as any).__scene = this; }

  create() {
    this.drawBackground();
    const useTest = new URLSearchParams(location.search).get('map') === 'test';
    this.map = buildMap(this, useTest ? PROTO_MAP : qingyunRaw.split('\n').filter((l: string) => l.length > 0));
    this.physics.world.setBounds(0, 0, this.map.width, this.map.height + 200);
    this.player = new Player(this, this.map.spawn.x, this.map.spawn.y);

    const oneWayCheck = (a: any, plat: any) => {
      const body: Phaser.Physics.Arcade.Body = a.body;
      if (a === this.player && (this.player.state2 === 'rope' || this.time.now < this.player.dropUntil)) return false;
      const top = (plat.body as Phaser.Physics.Arcade.StaticBody).top;
      return body.velocity.y >= 0 && body.prev.y + body.height <= top + 2;
    };
    this.physics.add.collider(this.player, this.map.solids);
    this.physics.add.collider(this.player, this.map.oneWays, () => { if (this.player.body.touching.down) this.player.oneWayAt = this.time.now; }, oneWayCheck);

    this.mobs = this.physics.add.group();
    this.map.monsterSpawns.forEach(p => this.spawnMob(p.x, p.y));
    this.physics.add.collider(this.mobs, this.map.solids);
    this.physics.add.collider(this.mobs, this.map.oneWays, undefined, oneWayCheck);
    this.physics.add.overlap(this.player, this.mobs, (_p, m) => {
      const mob = m as Mob;
      if (!mob.dead) this.player.hurt(this.time.now, mob.x, 8);
    });

    this.drops = this.physics.add.group();
    this.physics.add.collider(this.drops, this.map.solids);
    this.physics.add.collider(this.drops, this.map.oneWays, undefined, oneWayCheck);

    this.player.onAttack = rect => this.doAttack(rect);
    this.player.on('doublejump', () => this.puff(this.player.x, this.player.y - 10));

    const K = Phaser.Input.Keyboard.KeyCodes;
    this.keys = this.input.keyboard!.addKeys({
      left: K.LEFT, right: K.RIGHT, up: K.UP, down: K.DOWN,
      alt: K.ALT, space: K.SPACE, c: K.C,
      ctrl: K.CTRL, x: K.X, z: K.Z, f1: K.F1, r: K.R,
    }, true) as any;

    const cam = this.cameras.main;
    cam.setBounds(0, 0, this.map.width, this.map.height);
    cam.startFollow(this.player, true, 0.12, 0.1, 0, 40);

    this.hpBar = this.add.graphics().setScrollFactor(0).setDepth(100);
    this.hud = this.add.text(16, 40, '', { fontFamily: 'monospace', fontSize: '14px', color: '#1d2a3a', backgroundColor: '#ffffffaa', padding: { x: 6, y: 4 } }).setScrollFactor(0).setDepth(100);
    this.add.text(1264, 16,
      '方向键 移动 / ↑↓ 爬绳\nAlt / 空格 / C 跳跃（空中再按 = 二段跳）\n↓ + 跳 穿下单向平台\nCtrl / X 普攻   Z 拾取\nF1 碰撞框   R 回出生点',
      { fontFamily: 'sans-serif', fontSize: '14px', color: '#1d2a3a', backgroundColor: '#ffffffaa', padding: { x: 8, y: 6 }, align: 'right' })
      .setOrigin(1, 0).setScrollFactor(0).setDepth(100);
  }

  update(time: number, delta: number) {
    const k = this.keys, J = Phaser.Input.Keyboard.JustDown;
    const inp: Input = {
      left: k.left.isDown, right: k.right.isDown, up: k.up.isDown, down: k.down.isDown,
      jumpDown: J(k.alt) || J(k.space) || J(k.c),
      attackDown: k.ctrl.isDown || k.x.isDown,    // 按住连续普攻，和冒险岛一样
    };
    if (J(k.f1)) this.toggleDebug();
    if (J(k.r)) { this.player.leaveRope(time); this.player.body.reset(this.map.spawn.x, this.map.spawn.y); }
    if (J(k.z)) this.tryPickup();
    if (this.player.y > this.map.height + 100) this.player.body.reset(this.map.spawn.x, this.map.spawn.y);

    this.player.step(time, delta / 1000, inp, this.map.ropes);
    this.updateMobs(time);
    this.drawHud();
  }

  // ---------------- 怪物 ----------------
  spawnMob(x: number, y: number) {
    if (!this.textures.exists('proto-mob')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x9b6bd6).fillRoundedRect(2, 6, 40, 30, 12);
      g.fillStyle(0xffffff).fillCircle(30, 18, 5).fillStyle(0x222222).fillCircle(32, 18, 2);
      g.lineStyle(2, 0x4b2d7a).strokeRoundedRect(2, 6, 40, 30, 12);
      g.generateTexture('proto-mob', 44, 36); g.destroy();
    }
    const m = this.physics.add.sprite(x, y, 'proto-mob').setOrigin(0.5, 1) as Mob;
    this.mobs.add(m);
    m.body!.setSize(36, 28).setOffset(4, 8);
    m.hp = m.maxHp = 60; m.dir = Math.random() < 0.5 ? -1 : 1; m.stunUntil = 0; m.dead = false; m.home = { x, y };
    m.bar = this.add.graphics().setDepth(11);
    return m;
  }

  updateMobs(time: number) {
    this.mobs.getChildren().forEach(o => {
      const m = o as Mob, b = m.body as Phaser.Physics.Arcade.Body;
      m.bar.clear();
      if (m.dead) return;
      const grounded = b.blocked.down || b.touching.down;
      if (time >= m.stunUntil && grounded) {
        const aheadX = m.dir > 0 ? b.right + 4 : b.left - 4;
        const ground = this.physics.overlapRect(aheadX, b.bottom + 2, 2, 6, false, true).length > 0;
        if (!ground || (m.dir > 0 ? b.blocked.right : b.blocked.left) || Math.random() < 0.003) m.dir *= -1;
        b.setVelocityX(m.dir * 45);
      } else if (grounded) b.setVelocityX(b.velocity.x * 0.9);
      m.setFlipX(m.dir < 0);
      if (m.hp < m.maxHp) {
        m.bar.fillStyle(0x222222).fillRect(m.x - 20, m.y - 44, 40, 5);
        m.bar.fillStyle(0xe8443a).fillRect(m.x - 20, m.y - 44, 40 * m.hp / m.maxHp, 5);
      }
    });
  }

  doAttack(rect: Phaser.Geom.Rectangle) {
    const p = this.player;
    // 挥砍特效
    const fx = this.add.graphics().setDepth(12);
    fx.lineStyle(6, 0xbfefff, 0.9);
    const cx = p.x, cy = p.y - SPEC.bodyH / 2, s = p.facing;
    fx.beginPath(); fx.arc(cx, cy, FEEL.attackRange - 8, s > 0 ? -1.2 : Math.PI - 0.0 - 1.9, s > 0 ? 1.0 : Math.PI + 1.2); fx.strokePath();
    this.tweens.add({ targets: fx, alpha: 0, duration: FEEL.attackActiveMs + 100, onComplete: () => fx.destroy() });

    // 普攻只打离角色最近的一只，和冒险岛初始普攻一致
    let best: Mob | null = null, bestD = Infinity;
    for (const o of this.mobs.getChildren()) {
      const m = o as Mob;
      if (m.dead) continue;
      const mb = m.body as Phaser.Physics.Arcade.Body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height))) continue;
      const d = Math.abs(m.x - p.x);
      if (d < bestD) { bestD = d; best = m; }
    }
    if (best) {
      const m = best, mb = m.body as Phaser.Physics.Arcade.Body;
      const [lo, hi] = FEEL.attackDamage, dmg = Phaser.Math.Between(lo, hi);
      m.hp -= dmg; m.stunUntil = this.time.now + 350;
      mb.setVelocity(s * 50, -120);
      m.setTintFill(0xffffff); this.time.delayedCall(70, () => m.clearTint());
      this.damageNumber(m.x, m.y - 40, dmg);
      if (m.hp <= 0) this.killMob(m);
    }
  }

  killMob(m: Mob) {
    m.dead = true; (m.body as Phaser.Physics.Arcade.Body).enable = false; m.bar.clear();
    this.tweens.add({ targets: m, alpha: 0, y: m.y - 10, duration: 400 });
    const d = this.physics.add.sprite(m.x, m.y - 20, this.stoneTex()).setOrigin(0.5, 1);
    this.drops.add(d);
    (d.body as Phaser.Physics.Arcade.Body).setVelocity(Phaser.Math.Between(-40, 40), -320).setDragX(200);
    this.time.delayedCall(5000, () => {
      m.dead = false; m.hp = m.maxHp; m.setAlpha(1).setPosition(m.home.x, m.home.y);
      (m.body as Phaser.Physics.Arcade.Body).enable = true; (m.body as Phaser.Physics.Arcade.Body).reset(m.home.x, m.home.y);
    });
  }

  tryPickup() {
    const p = this.player;
    for (const o of this.drops.getChildren()) {
      const d = o as Phaser.Physics.Arcade.Sprite;
      if (Math.abs(d.x - p.x) < 40 && Math.abs(d.y - p.y) < 40) {
        (d.body as Phaser.Physics.Arcade.Body).enable = false;
        this.tweens.add({ targets: d, x: p.x, y: p.y - 70, alpha: 0, duration: 220, onComplete: () => d.destroy() });
        this.stones += 10;
        return;
      }
    }
  }

  stoneTex() {
    if (!this.textures.exists('proto-stone')) {
      const g = this.make.graphics({}, false);
      g.fillStyle(0x7ff0d0).fillTriangle(8, 0, 16, 8, 8, 16).fillTriangle(8, 0, 0, 8, 8, 16);
      g.lineStyle(1, 0x2a8f7a).strokeTriangle(8, 0, 16, 8, 8, 16).strokeTriangle(8, 0, 0, 8, 8, 16);
      g.generateTexture('proto-stone', 16, 16); g.destroy();
    }
    return 'proto-stone';
  }

  damageNumber(x: number, y: number, n: number) {
    const t = this.add.text(x, y, String(n), { fontFamily: 'Arial Black, sans-serif', fontSize: '24px', color: '#ffb02e', stroke: '#6b2a00', strokeThickness: 4 }).setOrigin(0.5).setDepth(50);
    this.tweens.add({ targets: t, y: y - 40, alpha: 0, duration: 700, ease: 'Cubic.easeOut', onComplete: () => t.destroy() });
  }

  puff(x: number, y: number) {
    const c = this.add.circle(x, y, 10, 0xffffff, 0.8).setDepth(9);
    this.tweens.add({ targets: c, scale: 2.5, alpha: 0, duration: 250, onComplete: () => c.destroy() });
  }

  // ---------------- 界面与背景 ----------------
  drawHud() {
    const p = this.player, b = p.body;
    this.hpBar.clear().fillStyle(0x222222, 0.8).fillRect(16, 16, 204, 16).fillStyle(0xe8443a).fillRect(18, 18, 200 * p.hp / p.maxHp, 12);
    this.hud.setText(
      `气血 ${p.hp}/${p.maxHp}   灵石 ${this.stones}\n` +
      `状态 ${p.state2}${p.onGround && p.state2 === 'ground' ? '' : ''}  二段跳 ${p.canDouble ? '可用' : '已用'}\n` +
      `速度 vx ${b.velocity.x.toFixed(0)}  vy ${b.velocity.y.toFixed(0)}  FPS ${this.game.loop.actualFps.toFixed(0)}`);
  }

  toggleDebug() {
    const w = this.physics.world;
    w.drawDebug = !w.drawDebug;
    if (!w.debugGraphic) w.createDebugGraphic();
    w.debugGraphic.clear();
  }

  drawBackground() {
    const sky = this.add.graphics().setScrollFactor(0).setDepth(-10);
    sky.fillGradientStyle(0x7cc8f2, 0x7cc8f2, 0xdff3ff, 0xdff3ff, 1).fillRect(0, 0, 1280, 720);
    const far = this.add.graphics().setScrollFactor(0.15, 0.1).setDepth(-9);
    far.fillStyle(0xb7d9ec);
    for (let i = 0; i < 10; i++) far.fillTriangle(i * 260 - 100, 620, i * 260 + 60, 260 + (i % 3) * 50, i * 260 + 220, 620);
    const mid = this.add.graphics().setScrollFactor(0.4, 0.3).setDepth(-8);
    mid.fillStyle(0x8fcf9a);
    for (let i = 0; i < 14; i++) mid.fillEllipse(i * 200, 700, 320, 260 + (i % 2) * 80);
    const clouds = this.add.graphics().setScrollFactor(0.25, 0.1).setDepth(-7);
    clouds.fillStyle(0xffffff, 0.85);
    for (let i = 0; i < 8; i++) { const x = i * 330 + 40, y = 90 + (i % 3) * 60; clouds.fillEllipse(x, y, 140, 40).fillEllipse(x + 50, y - 14, 90, 40); }
  }
}
