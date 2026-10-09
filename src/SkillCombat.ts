import Phaser from 'phaser';
import { t } from './data';
import type { Monster } from './scenes/Monster';
import type { GameScene } from './scenes/GameScene';
import {
  BUFF_FADE_MS, BUFF_WARN_MS, HITSTOP_MS, PROJECTILE_SPEED, SKILLS, SkillDef,
  actOf, skillNumber, skillRange,
} from './skills';

interface Qi {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  traveled: number;
  maxDist: number;
  hitH: number;
  defId: string;
  level: number;
  alive: boolean;
}

/** 技能施放、弹道、范围伤害、增益特效。数值从 skills.json 读，手感时间见 SKILL_ACT。 */
export class SkillCombat {
  cds = new Map<string, { readyAt: number; total: number }>();
  private qis: Qi[] = [];
  private buffFx = new Map<string, Phaser.GameObjects.Sprite>();
  private hintAt = new Map<string, number>();

  constructor(private scene: GameScene) {}

  tryCast(slot: number) {
    const { prog, player } = this.scene;
    if (!prog.skillsUnlocked || player.dead) return;
    if (player.state2 === 'hurt' || player.state2 === 'rope') return;
    const id = prog.hotbar[slot];
    if (!id) return;
    const def = SKILLS[id];
    const level = prog.skillLevel(id);
    if (!def || level <= 0 || def.type === 'passive') return;
    const now = this.scene.time.now;
    const cd = this.cds.get(id);
    if (cd && now < cd.readyAt) { this.hint('skill.cooldown', {}, '#d0d0d0'); return; }
    if (player.skillRooted && now < player.attackLockUntil) return;
    const cost = prog.skillMpCost(id);
    if (prog.mp + 1e-6 < cost) { this.hint('sys.mp_low', {}, '#8ec8ff'); return; }
    prog.mp -= cost;
    const act = actOf(def);
    const total = Math.max(0, skillNumber(def, 'cooldownMs', level), act.recoverMs);
    if (total > 0) this.cds.set(id, { readyAt: now + total, total });
    this.perform(def, level);
  }

  update(_time: number, delta: number) {
    this.stepQi(delta / 1000);
    const now = Date.now();
    const prog = this.scene.prog;
    for (const b of [...prog.buffs]) {
      const left = b.expireAt - now;
      if (left <= 0) {
        this.fadeBuff(b.id);
        prog.buffs = prog.buffs.filter(x => x !== b);
        continue;
      }
      if (left <= BUFF_WARN_MS && !b.warned) {
        b.warned = true;
        this.scene.log(t('skill.buff_expiring', { skill: SKILLS[b.id]?.name ?? b.id }), '#bfefff');
      }
      const fx = this.buffFx.get(b.id);
      const p = this.scene.player;
      if (fx?.active) fx.setPosition(p.x, p.y).setDepth(p.depth - 1);
      else this.ensureBuffFx(b.id, false);
    }
  }

  private perform(def: SkillDef, level: number) {
    const act = actOf(def);
    const p = this.scene.player;
    const now = this.scene.time.now;
    if (act.kind !== 'buff') {
      p.attackLockUntil = now + act.recoverMs;
      p.skillRooted = act.recoverMs > 0;
      p.skillCancelOnJump = !!act.jumpCancel;
      if (act.superArmorMs) p.superArmorUntil = now + act.superArmorMs;
      const atk = 'player_sword_m_attack';
      if (p.atlas && this.scene.anims.exists(atk)) {
        p.play(atk);
        p.anims.timeScale = 1;
      }
    }
    if (act.kind === 'projectile') this.queue(act.hitDelayMs, () => this.spawnQi(def, level));
    else if (act.kind === 'aoe') this.queue(act.hitDelayMs, () => this.fireAoe(def, level));
    else this.applyBuff(def, level);
  }

  private queue(delay: number, fn: () => void) {
    if (delay <= 0) fn();
    else this.scene.time.delayedCall(delay, fn);
  }

  private spawnQi(def: SkillDef, level: number) {
    const p = this.scene.player;
    if (!p.active || p.dead || p.state2 === 'hurt') return;
    const facing = p.facing;
    const range = skillRange(def);
    const maxDist = range?.w ?? 280;
    const hitH = range?.h ?? 48;
    const x = p.x + facing * 42;
    const y = p.y - 46;
    const sprite = this.fxSprite(def.fx, x, y, [0.5, 0.5]);
    if (!sprite) return;
    sprite.setDepth(p.depth + 2).setFlipX(facing > 0);
    const fly = `${def.fx}_fly`;
    if (this.scene.anims.exists(fly)) sprite.play(fly);
    this.qis.push({
      sprite, vx: facing * PROJECTILE_SPEED, traveled: 0, maxDist, hitH,
      defId: def.id, level, alive: true,
    });
  }

  private stepQi(dt: number) {
    for (const q of this.qis) {
      if (!q.alive) continue;
      const oldX = q.sprite.x;
      q.sprite.x += q.vx * dt;
      q.traveled += Math.abs(q.vx * dt);
      if (this.touchQi(q, oldX)) continue;
      if (q.traveled >= q.maxDist) this.killQi(q);
    }
    this.qis = this.qis.filter(q => q.sprite.active);
  }

  /** 飞行途中碰到的第一只怪。美术朝左，朝右飞时已经 flipX。 */
  private touchQi(q: Qi, oldX: number) {
    const w = 40;
    const rect = new Phaser.Geom.Rectangle(
      Math.min(oldX, q.sprite.x) - w / 2, q.sprite.y - q.hitH / 2,
      Math.abs(q.sprite.x - oldX) + w, q.hitH,
    );
    const dir = Math.sign(q.vx) || -1;
    const mobs = this.scene.mobs
      .filter(m => !m.dead)
      .sort((a, b) => (a.x - b.x) * dir);
    for (const m of mobs) {
      const mb = m.body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height))) continue;
      this.applyHits(q.defId, q.level, [m]);
      q.alive = false;
      const hit = `${SKILLS[q.defId]?.fx ?? ''}_hit`;
      if (this.scene.anims.exists(hit)) {
        q.sprite.play(hit);
        q.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => q.sprite.destroy());
      } else q.sprite.destroy();
      this.hitstop();
      return true;
    }
    return false;
  }

  private killQi(q: Qi) {
    q.alive = false;
    q.sprite.destroy();
  }

  private fireAoe(def: SkillDef, level: number) {
    const p = this.scene.player;
    if (!p.active || p.dead) return;
    const range = skillRange(def);
    if (!range) return;
    this.playOnce(def.fx, p.x, p.y, [0.5, 1], p.depth + 1);
    const maxT = Math.max(0, skillNumber(def, 'maxTargets', level));
    const front = range.w;
    const behind = range.behind;
    const x = p.facing > 0 ? p.x - behind : p.x - front;
    const rect = new Phaser.Geom.Rectangle(x, p.body.bottom - range.h, front + behind, range.h);
    const hits = this.scene.mobs.filter(m => {
      if (m.dead) return false;
      const mb = m.body;
      return Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height));
    }).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, maxT);
    this.applyHits(def.id, level, hits);
  }

  private applyHits(id: string, level: number, mobs: Monster[]) {
    const def = SKILLS[id];
    if (!def) return;
    const ratio = skillNumber(def, 'damageRatio', level);
    const times = Math.max(1, skillNumber(def, 'hitCount', level) || 1);
    const p = this.scene.player;
    for (const m of mobs) {
      for (let i = 0; i < times; i++) {
        const dmg = this.scene.prog.damageTo(m.def.level, m.def.def, ratio);
        m.takeHit(this.scene.time.now, dmg, p.facing);
        this.scene.damageNumber(m.x, m.y - m.body.height - 10 - i * 16, dmg, '#9fe8ff', '#0a3a4a');
      }
      this.scene.prog.addMastery(id);
    }
  }

  private applyBuff(def: SkillDef, level: number) {
    const dur = Math.max(0, skillNumber(def, 'durationMs', level));
    const expireAt = Date.now() + dur;
    const found = this.scene.prog.buffs.find(b => b.id === def.id);
    if (found) { found.expireAt = expireAt; found.warned = false; }
    else this.scene.prog.buffs.push({ id: def.id, expireAt, warned: false });
    this.ensureBuffFx(def.id, true);
    this.scene.prog.save();
  }

  private ensureBuffFx(id: string, restart: boolean) {
    const def = SKILLS[id];
    const p = this.scene.player;
    if (!def) return;
    let fx = this.buffFx.get(id);
    if (!fx?.active) {
      const made = this.fxSprite(def.fx, p.x, p.y, [0.5, 1]);
      if (!made) return;
      fx = made;
      fx.setDepth(p.depth - 1);
      this.buffFx.set(id, fx);
      restart = true;
    }
    fx.setPosition(p.x, p.y);
    if (!restart) return;
    const start = `${def.fx}_start`;
    const loop = `${def.fx}_loop`;
    if (this.scene.anims.exists(start)) {
      fx.play(start);
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        if (fx!.active && this.scene.anims.exists(loop)) fx!.play(loop);
      });
    } else if (this.scene.anims.exists(loop)) fx.play(loop);
  }

  private fadeBuff(id: string) {
    const fx = this.buffFx.get(id);
    this.buffFx.delete(id);
    if (!fx?.active) return;
    this.scene.tweens.add({ targets: fx, alpha: 0, duration: BUFF_FADE_MS, onComplete: () => fx.destroy() });
  }

  private playOnce(key: string, x: number, y: number, origin: [number, number], depth: number) {
    const fx = this.fxSprite(key, x, y, origin);
    if (!fx) return;
    fx.setDepth(depth);
    const anim = `${key}_play`;
    if (this.scene.anims.exists(anim)) {
      fx.play(anim);
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    } else this.scene.time.delayedCall(300, () => fx.destroy());
  }

  /** 原点优先读 anims.json。剑气斩缺省 (0.5,0.5)，其余对齐脚底 (0.5,1)。混合用 NORMAL。 */
  private fxSprite(key: string, x: number, y: number, fallback: [number, number]) {
    if (!key || !this.scene.textures.exists(key)) return null;
    const meta = this.scene.cache.json.get(`${key}_anims`) as { origin?: number[] } | undefined;
    const origin = Array.isArray(meta?.origin) && meta.origin.length >= 2 ? meta.origin : fallback;
    return this.scene.add.sprite(x, y, key).setOrigin(origin[0], origin[1]).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private hitstop() {
    const world = this.scene.physics.world;
    if (!world || (world as unknown as { isPaused?: boolean }).isPaused) return;
    world.pause();
    this.scene.time.delayedCall(HITSTOP_MS, () => { if (world) world.resume(); });
  }

  private hint(key: string, vars: Record<string, string | number>, color: string) {
    const now = this.scene.time.now;
    if (now < (this.hintAt.get(key) ?? 0)) return;
    this.hintAt.set(key, now + 1400);
    this.scene.log(t(key, vars), color);
  }
}
