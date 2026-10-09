import Phaser from 'phaser';
import { MONSTERS, t, type TrialDef, type TrialWave, type TrialHazard } from '../data';
import { hudText, INK, PAPER } from '../hud';
import type { Monster } from './Monster';
import type { Zone } from './MapBuilder';

export type TrialResult = 'held' | 'broken' | 'dead';

/** 场景需要提供的接口（GameScene 实现），避免循环依赖 */
export interface TrialHost extends Phaser.Scene {
  map: { width: number; objects: { type: string; name: string; x: number; y: number; props: Record<string, any> }[]; zones: Zone[] };
  player: Phaser.Physics.Arcade.Sprite & { dead?: boolean };
  prog: { maxHp: number };
  spawnTrialMob(id: string, x: number, y: number): Monster | null;
  hurtPlayer(dmg: number, fromX: number, knock: number): void;
  damageNumber(x: number, y: number, n: number, color: string, stroke: string): void;
  log(msg: string, color: string): void;
  bossOverride?: { name: string; hp: number; max: number } | null;
  onTrialEnd(result: TrialResult): void;
}

/** 天雷落下后判定的击退（表里没有，暂定） */
const THUNDER_KNOCK = 120;
/** 天雷圈圆心离地高度（暂定：贴地略抬，圈的下半截不被地面挡住太多） */
const THUNDER_LIFT = 24;
/** 预警圈 depth：地面特效层，低于怪（8）和主角（10） */
const DEPTH_GROUND_FX = 5;
/** 阵眼判定半宽（表里没有，暂定 40px），怪近战按这个距离 + 攻击宽度的一半出手 */
const EYE_HALF_W = 40;

interface Thunder { x: number; y: number; r: number; strikeAt: number; ratio: number; warn?: Phaser.GameObjects.Sprite; struck: boolean }

/**
 * 筑基台守阵眼（trials.json type=defend）。时间轴、波次、天雷、阵眼全读表；
 * elapsed 用场景 delta 累加（?debug=trial&speed=N 加速），怪物自身速度不加速。
 */
export class AltarTrial {
  elapsed = 0;
  ended = false;
  hp: number;
  readonly maxHp: number;
  readonly eye: { x: number; y: number };
  mobs: Monster[] = [];
  private gates: Record<string, { x: number; y: number }> = {};
  private area?: Zone;
  private ruleNext = new Map<string, number>();
  private altFlip = new Map<string, boolean>();
  private waveCount: number[] = [];
  private hazardNext = new Map<number, number>();
  private despawned = new Set<number>();
  private thunders: Thunder[] = [];
  private countdown: Phaser.GameObjects.Text;
  private eyeGfx: Phaser.GameObjects.Graphics;
  private edge?: Phaser.GameObjects.Graphics;

  constructor(private scene: TrialHost, readonly def: TrialDef, private speed = 1) {
    const ob = def.objective!;
    const mo = scene.map.objects.find(o => o.type === 'objective' && (o.props.objective ?? o.name) === ob.id);
    this.eye = { x: mo?.x ?? (typeof ob.x === 'number' ? ob.x : scene.map.width / 2), y: mo?.y ?? 576 };
    this.hp = this.maxHp = ob.hp;
    for (const o of scene.map.objects) if (o.type === 'spawnGate') this.gates[o.name] = { x: o.x, y: o.y };
    this.area = scene.map.zones.find(z => z.props.hazard === 'thunder_circle');
    this.eyeGfx = scene.add.graphics().setDepth(4);
    this.countdown = hudText(scene, 640, 84, 16, { fontStyle: 'bold', color: INK, stroke: PAPER, strokeThickness: 3 }).setOrigin(0.5).setDepth(131);
    scene.bossOverride = { name: ob.name, hp: this.hp, max: this.maxHp };
    this.drawEye();
  }

  get remainSec() { return Math.max(0, Math.ceil((this.def.durationMs - this.elapsed) / 1000)); }

  update(delta: number) {
    if (this.ended) return;
    this.elapsed += delta * this.speed;
    const e = this.elapsed;
    (this.def.waves ?? []).forEach((w, wi) => { if (e >= w.fromMs && e < w.toMs) this.runWave(w, wi, e); });
    this.tickThunder();
    this.mobs = this.mobs.filter(m => m.active);
    this.countdown.setText(t('trial.countdown', { sec: this.remainSec }));
    if (this.scene.bossOverride) this.scene.bossOverride.hp = this.hp;
    this.drawEye();
    if (this.hp <= 0) return this.end('broken');
    if (e >= this.def.durationMs) return this.end('held');
  }

  private runWave(w: TrialWave, wi: number, e: number) {
    if (w.despawnAll && !this.despawned.has(wi)) {
      this.despawned.add(wi);
      this.clearMobs();
      this.scene.log(t('trial.retreat'), '#ffe680');
      this.goldEdge();
    }
    w.spawns.forEach((sp, ri) => {
      const key = `${wi}:${ri}`;
      let next = this.ruleNext.get(key) ?? w.fromMs;
      while (e >= next) {
        const sides = sp.side === 'both' ? ['left', 'right'] : sp.side === 'alternate' ? [this.flip(key)] : [sp.side];
        for (const side of sides) for (let i = 0; i < (sp.perSide ?? 1); i++) {
          if (w.total !== undefined && (this.waveCount[wi] ?? 0) >= w.total) break;
          if (this.spawn(sp.monster, side)) this.waveCount[wi] = (this.waveCount[wi] ?? 0) + 1;
        }
        next += Math.max(100, sp.everyMs);
      }
      this.ruleNext.set(key, next);
    });
    if (w.hazard) {
      let next = this.hazardNext.get(wi) ?? w.fromMs;
      while (e >= next) { this.dropThunder(w.hazard); next += Math.max(500, w.hazard.everyMs); }
      this.hazardNext.set(wi, next);
    }
  }

  private flip(key: string) { const f = !this.altFlip.get(key); this.altFlip.set(key, f); return f ? 'left' : 'right'; }

  private spawn(id: string, side: string) {
    const def = MONSTERS[id] as (typeof MONSTERS)[string] & { flying?: boolean; flyHeight?: [number, number] };
    if (!def) return false;
    const gate = this.gates[def.flying ? `gate_air_${side}` : `gate_${side}`] ?? this.gates[`gate_${side}`];
    if (!gate) return false;
    const m = this.scene.spawnTrialMob(id, gate.x, gate.y);
    if (!m) return false;
    m.objective = { x: this.eye.x, y: this.eye.y, halfW: EYE_HALF_W, mul: this.def.objective?.monsterDamageMul ?? 1, def: this.def.objective?.def ?? 0,
      hit: (_mm, dmg) => this.damageEye(dmg) };
    if (def.flying) {
      m.body.setAllowGravity(false);
      const [lo, hi] = def.flyHeight ?? [96, 128];
      m.flyY = this.eye.y - Phaser.Math.Between(lo, hi);
    }
    this.mobs.push(m);
    return true;
  }

  damageEye(dmg: number) {
    if (this.ended) return;
    this.hp = Math.max(0, this.hp - dmg);
    this.scene.damageNumber(this.eye.x, this.eye.y - 60, dmg, '#ffffff', '#3b2a20');
  }

  private dropThunder(h: TrialHazard) {
    const a = this.area, near = h.nearObjective ?? 9999, r = h.radius;
    const lo = Math.max((a?.x ?? 0) + r, this.eye.x - near), hi = Math.min((a ? a.x + a.w : this.scene.map.width) - r, this.eye.x + near);
    const groundY = a ? a.y + a.h : this.eye.y;
    const xs: number[] = [];
    for (let i = 0; i < h.count; i++) {
      let x = Phaser.Math.Between(Math.round(lo), Math.round(hi));
      for (let k = 0; k < 8 && xs.some(o => Math.abs(o - x) < 2 * r); k++) x = Phaser.Math.Between(Math.round(lo), Math.round(hi));
      xs.push(x);
      const y = groundY - THUNDER_LIFT;
      const th: Thunder = { x, y, r, strikeAt: this.scene.time.now + h.telegraphMs, ratio: h.playerDamageRatioOfMaxHp, struck: false };
      if (this.scene.textures.exists('fx_trial_thunder_warn')) {
        th.warn = this.scene.add.sprite(x, y, 'fx_trial_thunder_warn').setOrigin(0.5, 0.5).setDepth(DEPTH_GROUND_FX);
        if (this.scene.anims.exists('fx_trial_thunder_warn_warn')) th.warn.play({ key: 'fx_trial_thunder_warn_warn', duration: h.telegraphMs });
      } else {
        const c = this.scene.add.circle(x, y, r, 0xffe680, 0.25).setStrokeStyle(2, 0xd9a441).setDepth(DEPTH_GROUND_FX);
        th.warn = c as unknown as Phaser.GameObjects.Sprite;
      }
      this.thunders.push(th);
    }
  }

  private tickThunder() {
    const now = this.scene.time.now;
    for (const th of this.thunders) {
      if (th.struck || now < th.strikeAt) continue;
      th.struck = true; th.warn?.destroy();
      if (this.scene.textures.exists('fx_trial_thunder')) {
        const s = this.scene.add.sprite(th.x, th.y, 'fx_trial_thunder').setOrigin(0.5, 0.8).setDepth(12);
        if (this.scene.anims.exists('fx_trial_thunder_strike')) { s.play('fx_trial_thunder_strike'); s.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => s.destroy()); }
        else this.scene.time.delayedCall(400, () => s.destroy());
      }
      this.scene.cameras.main.shake(80, 0.004);
      const p = this.scene.player, pb = p.body as Phaser.Physics.Arcade.Body;
      if (!p.dead && Phaser.Math.Distance.Between(th.x, th.y, pb.center.x, pb.center.y) <= th.r + Math.min(pb.width, pb.height) / 2)
        this.scene.hurtPlayer(Math.max(1, Math.round(this.scene.prog.maxHp * th.ratio)), th.x, THUNDER_KNOCK);
    }
    this.thunders = this.thunders.filter(th => !th.struck);
  }

  private clearMobs() { for (const m of this.mobs) if (m.active && !m.dead) m.despawn(); }

  private goldEdge() {
    const g = this.scene.add.graphics().setScrollFactor(0).setDepth(140);
    for (let i = 0; i < 6; i++) g.lineStyle(4, 0xffd86a, 0.5 - i * 0.08).strokeRect(i * 4, i * 4, 1280 - i * 8, 720 - i * 8);
    g.setAlpha(0);
    this.scene.tweens.add({ targets: g, alpha: 1, duration: 600, yoyo: true, repeat: -1 });
    this.edge = g;
  }

  private drawEye() {
    const g = this.eyeGfx.clear(), k = this.hp / this.maxHp, pulse = 0.5 + 0.5 * Math.sin(this.scene.time.now / 300);
    g.fillStyle(0x9fe8ff, 0.18 + 0.12 * pulse * k).fillEllipse(this.eye.x, this.eye.y - 4, 140, 24);
    g.lineStyle(2, 0xd9a441, 0.5 + 0.4 * k).strokeEllipse(this.eye.x, this.eye.y - 4, 120, 18);
    g.fillStyle(0xfff0a0, 0.35 + 0.4 * pulse * k).fillCircle(this.eye.x, this.eye.y - 30, 10 + 4 * pulse);
  }

  end(result: TrialResult) {
    if (this.ended) return;
    this.ended = true;
    this.clearMobs();
    for (const th of this.thunders) th.warn?.destroy();
    this.thunders = [];
    this.edge?.destroy();
    this.countdown.setVisible(false);
    this.scene.bossOverride = null;
    this.scene.onTrialEnd(result);
  }
}
