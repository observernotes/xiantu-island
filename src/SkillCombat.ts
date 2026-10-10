import Phaser from 'phaser';
import { ITEMS, t } from './data';
import { FriendlySummons, type FriendlySummon } from './FriendlySummons';
import type { Monster } from './scenes/Monster';
import type { GameScene } from './scenes/GameScene';
import {
  BUFF_FADE_MS, BUFF_WARN_MS, HITSTOP_MS, PROJECTILE_SPEED, SKILLS, SkillDef,
  actOf, skillNumber, skillRange,
} from './skills';

interface Qi {
  sprite: Phaser.GameObjects.Sprite;
  vx: number;
  vy: number;
  traveled: number;
  maxDist: number;
  hitH: number;
  defId: string;
  level: number;
  alive: boolean;
  cast: SkillCast;
}

interface SkillCast { hits: Set<Monster>; maxTargets: number; crit: boolean; }
export interface SpecialSkillContext {
  scene: GameScene; skill: SkillDef; level: number;
  phase: 'cast' | 'hit' | 'buff'; target?: Monster;
}
export type SpecialSkillHandler = (context: SpecialSkillContext) => void;
/** 明确保留事件接口：专有 AI/状态规则由后续实现接入，不静默假装已生效。 */
export const SPECIAL_SKILL_TODO = {
  paralyzeChance: 'TODO 掌心雷的麻痹状态与首领免疫规则（paralyzeMs）。',
  decoyTauntCount: 'TODO 影遁残影吸引一次仇恨（decoyDurationMs）。',
  summon: 'TODO 敌方范围/弹道技能对友方灵兽的命中；调用 receiveSummonDamage。',
} as const;

/** 技能施放、弹道、范围伤害、增益特效。数值从 skills.json 读，手感时间见 SKILL_ACT。 */
export class SkillCombat {
  cds = new Map<string, { readyAt: number; total: number }>();
  private qis: Qi[] = [];
  private buffFx = new Map<string, Phaser.GameObjects.Sprite>();
  private hintAt = new Map<string, number>();
  private pets: FriendlySummons;
  private specialEffects = new Map<string, SpecialSkillHandler>();

  get summons() { return this.pets.pets; }

  registerSpecialEffect(key: string, handler: SpecialSkillHandler) { this.specialEffects.set(key, handler); }
  receiveSummonDamage(pet: FriendlySummon, rawDamage: number, fromX: number) {
    this.pets.takeDamage(pet, rawDamage, fromX);
  }

  constructor(private scene: GameScene) {
    this.pets = new FriendlySummons(scene);
    const now = Date.now();
    for (const [id, cd] of Object.entries(scene.prog.skillCooldowns)) {
      const def = SKILLS[id];
      if (!def || !scene.prog.ownsSkill(def) || skillNumber(def, 'cooldownMs', scene.prog.skillLevel(id)) <= 0) continue;
      const remaining = cd.readyAt - now;
      if (remaining > 0) this.cds.set(id, { readyAt: scene.time.now + remaining, total: cd.total });
    }
  }

  tryCast(slot: number) {
    const { prog, player } = this.scene;
    if (!prog.skillsUnlocked || player.dead) return;
    if (player.state2 === 'hurt' || player.state2 === 'rope') return;
    const id = prog.hotbar[slot];
    if (!id) return;
    const def = SKILLS[id];
    const level = prog.skillLevel(id);
    if (!def || !prog.ownsSkill(def) || level <= 0 || def.type === 'passive') return;
    const now = this.scene.time.now;
    const cd = this.cds.get(id);
    if (cd && now < cd.readyAt) { this.hint('skill.cooldown', {}, '#d0d0d0'); return; }
    if (player.skillRooted && now < player.attackLockUntil) return;
    const cost = prog.skillMpCost(id);
    if (prog.mp + 1e-6 < cost) { this.hint('sys.mp_low', {}, '#8ec8ff'); return; }
    // 符纸还没有登记时保留射击，待制符配表上线后自动启用消耗与免耗判定。
    const ammo = typeof def.effects?.ammoItem === 'string' ? def.effects.ammoItem : '';
    const ammoCount = Math.max(0, skillNumber(def, 'ammoCount', level));
    if (ammo && ITEMS[ammo]) {
      if (prog.count(ammo) < ammoCount) { this.scene.log(`${ITEMS[ammo].name}不足。`, '#ffd6a0'); return; }
      if (Math.random() >= Math.min(1, Math.max(0, prog.passiveBonus('ammoSaveChance')))) prog.removeItem(ammo, ammoCount);
    }
    prog.mp -= cost;
    const total = Math.max(0, prog.skillCooldownMs(id), prog.skillRecoverMs(id));
    if (total > 0) this.cds.set(id, { readyAt: now + total, total });
    // 独立冷却跨地图/刷新保留；剑修无独立冷却的后摇沿用旧行为。
    const persistentCooldown = skillNumber(def, 'cooldownMs', level) > 0;
    if (persistentCooldown) prog.skillCooldowns[id] = { readyAt: Date.now() + total, total };
    this.perform(def, level);
    if (persistentCooldown) prog.save();
    this.scene.events.emit('skill:cast', { id, level, cost, cooldownMs: total });
  }

  update(_time: number, delta: number) {
    this.stepQi(delta / 1000);
    this.pets.update(this.scene.time.now);
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
    const recoverMs = this.scene.prog.skillRecoverMs(def.id);
    // 天剑轻身术沿用已上线的无锁定行为；四宗的增益刷新计入表内后摇。
    if (act.kind !== 'buff' || def.sect && def.sect !== 'tianjian') {
      p.attackLockUntil = now + recoverMs;
      p.skillRooted = recoverMs > 0;
      p.skillCancelOnJump = !!act.jumpCancel;
      if (act.superArmorMs) p.superArmorUntil = now + act.superArmorMs;
      const atk = p.animationKey('attack');
      if (p.atlas && this.scene.anims.exists(atk)) {
        p.play(atk);
        p.anims.timeScale = 1;
      }
    }
    const cast: SkillCast = { hits: new Set(), maxTargets: Math.max(1, skillNumber(def, 'maxTargets', level)),
      crit: Math.random() < Math.min(1, Math.max(0, this.scene.prog.passiveBonus('critRate'))) };
    if (def.damageRatio > 0 && act.kind !== 'summon') {
      const cloak = this.scene.prog.buffs.find(b => b.expireAt > Date.now() && SKILLS[b.id]?.effects?.nextCastCrit);
      if (cloak) {
        cast.crit = true;
        this.scene.prog.buffs = this.scene.prog.buffs.filter(b => b !== cloak);
        this.fadeBuff(cloak.id);
      }
    }
    this.special(def, level, 'cast');
    if (act.kind === 'projectile') this.queue(act.hitDelayMs, () => this.spawnQi(def, level, cast));
    else if (act.kind === 'aoe') this.queue(act.hitDelayMs, () => this.fireAoe(def, level, cast));
    else if (act.kind === 'summon') {
      this.playOnce(def.fx, p.x, p.y, [0.5, 1], p.depth + 1);
      this.queue(act.hitDelayMs, () => { if (p.active && !p.dead) this.pets.summon(def, level); });
    } else if (act.kind === 'dash') this.dash(def, level);
    else this.applyBuff(def, level);
  }

  private queue(delay: number, fn: () => void) {
    if (delay <= 0) fn();
    else this.scene.time.delayedCall(delay, fn);
  }

  private spawnQi(def: SkillDef, level: number, cast: SkillCast) {
    const p = this.scene.player;
    if (!p.active || p.dead || p.state2 === 'hurt') return;
    const facing = p.facing;
    const range = skillRange(def);
    const maxDist = range?.w ?? 280;
    const hitH = range?.h ?? 48;
    const pack = this.scene.cache.json.get(`${def.fx}_anims`) as { projectileSpawn?: [number, number]; origin?: [number, number] } | undefined;
    const spawn = pack?.projectileSpawn;
    const x = p.x + (spawn ? -facing * spawn[0] : facing * 42);
    const y = p.y + (spawn?.[1] ?? -46);
    const count = Math.max(1, skillNumber(def, 'projectileCount', level) || skillNumber(def, 'hitCount', level));
    const angle = skillNumber(def, 'fanAngleDeg', level) * Math.PI / 180;
    const speed = skillNumber(def, 'projectileSpeed', level) || PROJECTILE_SPEED;
    for (let i = 0; i < count; i++) {
      const spread = count === 1 ? 0 : angle * (i / (count - 1) - 0.5);
      const shotY = y + (count > 1 && angle === 0 ? (i - (count - 1) / 2) * 8 : 0);
      const sprite = this.fxSprite(def.fx, x, shotY, [0.5, 0.5]);
      sprite.setDepth(p.depth + 2).setFlipX(facing > 0).setRotation(spread * facing);
      if (facing > 0 && pack?.origin) sprite.setOrigin(1 - pack.origin[0], pack.origin[1]);
      const fly = `${def.fx}_fly`;
      if (this.scene.anims.exists(fly)) sprite.play(fly);
      else if (this.scene.anims.exists(`${def.fx}_play`)) sprite.play(`${def.fx}_play`);
      this.qis.push({ sprite, vx: facing * speed * Math.cos(spread), vy: speed * Math.sin(spread),
        traveled: 0, maxDist, hitH, defId: def.id, level, alive: true, cast });
    }
  }

  private stepQi(dt: number) {
    for (const q of this.qis) {
      if (!q.alive) continue;
      const oldX = q.sprite.x;
      const oldY = q.sprite.y;
      q.sprite.x += q.vx * dt;
      q.sprite.y += q.vy * dt;
      q.traveled += Math.hypot(q.vx, q.vy) * dt;
      if (this.touchQi(q, oldX, oldY)) continue;
      if (q.traveled >= q.maxDist) this.killQi(q);
    }
    this.qis = this.qis.filter(q => q.sprite.active);
  }

  /** 飞行途中碰到的第一只怪。美术朝左，朝右飞时已经 flipX。 */
  private touchQi(q: Qi, oldX: number, oldY: number) {
    const w = 40;
    const rect = new Phaser.Geom.Rectangle(
      Math.min(oldX, q.sprite.x) - w / 2, Math.min(oldY, q.sprite.y) - q.hitH / 2,
      Math.abs(q.sprite.x - oldX) + w, Math.abs(q.sprite.y - oldY) + q.hitH,
    );
    const dir = Math.sign(q.vx) || -1;
    if (this.scene.trialObjects?.hitSpell(q.defId, rect)) { this.impactQi(q); return true; }
    const mobs = this.scene.mobs
      .filter(m => !m.dead)
      .sort((a, b) => (a.x - b.x) * dir);
    for (const m of mobs) {
      const mb = m.body;
      if (!Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height))) continue;
      const def = SKILLS[q.defId];
      if (q.cast.hits.has(m)) {
        if (!def.effects?.pierce) { this.impactQi(q); return true; }
        continue;
      }
      this.applyHits(q.defId, q.level, [m], q.cast);
      this.splash(def, q.level, m, q.cast);
      this.hitstop();
      if (!def.effects?.pierce || q.cast.hits.size >= q.cast.maxTargets) { this.impactQi(q); return true; }
    }
    return false;
  }

  private impactQi(q: Qi) {
    q.alive = false;
    const hit = `${SKILLS[q.defId]?.fx ?? ''}_hit`;
    if (this.scene.anims.exists(hit)) {
      q.sprite.play(hit);
      q.sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => q.sprite.destroy());
    } else q.sprite.destroy();
  }

  private killQi(q: Qi) {
    q.alive = false;
    q.sprite.destroy();
  }

  private fireAoe(def: SkillDef, level: number, cast: SkillCast) {
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
    this.scene.trialObjects?.hitSpell(def.id, rect);
    const hits = this.scene.mobs.filter(m => {
      if (m.dead) return false;
      const mb = m.body;
      return Phaser.Geom.Intersects.RectangleToRectangle(rect, new Phaser.Geom.Rectangle(mb.x, mb.y, mb.width, mb.height));
    }).sort((a, b) => Math.abs(a.x - p.x) - Math.abs(b.x - p.x)).slice(0, maxT);
    this.applyHits(def.id, level, hits, cast);
    if (skillNumber(def, 'petAtkRatio', level) > 0 && skillNumber(def, 'durationMs', level) > 0) this.applyBuff(def, level);
  }

  private applyHits(id: string, level: number, mobs: Monster[], cast: SkillCast, multiplier = 1, splash = false) {
    const def = SKILLS[id];
    if (!def || def.type === 'passive') return;
    const ratio = skillNumber(def, 'damageRatio', level) * multiplier;
    const times = Math.max(1, skillNumber(def, 'hitCount', level) || 1);
    const p = this.scene.player;
    for (const m of mobs) {
      if (!splash && (cast.hits.has(m) || cast.hits.size >= cast.maxTargets)) continue;
      if (!splash) cast.hits.add(m);
      for (let i = 0; i < times; i++) {
        const dmg = this.scene.prog.skillDamageTo(id, level, m.def.level, m.def.def, ratio, cast.crit);
        m.takeHit(this.scene.time.now, dmg, p.facing);
        this.scene.damageNumber(m.x, m.y - m.body.height - 10 - i * 16, dmg, '#9fe8ff', '#0a3a4a');
        this.scene.events.emit('skill:hit', { id, target: m.def.id, damage: dmg, splash, crit: cast.crit });
      }
      const knock = skillNumber(def, 'knockback', level);
      if (knock > 0 && !m.dead && !m.def.immortal) m.body.setVelocityX(Math.sign(m.x - p.x) * knock);
      this.special(def, level, 'hit', m);
      this.scene.prog.addMastery(id);
    }
  }

  private applyBuff(def: SkillDef, level: number) {
    const dur = Math.max(0, skillNumber(def, 'durationMs', level));
    const expireAt = Date.now() + dur;
    const found = this.scene.prog.buffs.find(b => b.id === def.id);
    if (found) { found.expireAt = expireAt; found.warned = false; }
    else this.scene.prog.buffs.push({ id: def.id, expireAt, warned: false });
    if (def.type !== 'active') this.ensureBuffFx(def.id, true);
    this.special(def, level, 'buff');
    this.scene.prog.save();
  }

  private splash(def: SkillDef, level: number, primary: Monster, cast: SkillCast) {
    const radius = skillNumber(def, 'splashRadius', level);
    const count = skillNumber(def, 'splashTargets', level);
    if (!(radius > 0 && count > 0)) return;
    const hits = this.scene.mobs.filter(m => m.active && !m.dead && (!def.effects?.splashExcludesPrimary || m !== primary)
      && Phaser.Math.Distance.Between(primary.x, primary.y - primary.body.height / 2, m.x, m.y - m.body.height / 2) <= radius)
      .sort((a, b) => Math.abs(a.x - primary.x) - Math.abs(b.x - primary.x)).slice(0, count);
    this.applyHits(def.id, level, hits, cast, skillNumber(def, 'splashDamageRatio', level), true);
  }

  private dash(def: SkillDef, level: number) {
    const p = this.scene.player;
    const dashFx = this.fxSprite(def.fx, p.x, p.y, [0.5, 1]).setDepth(p.depth + 1).setFlipX(p.facing > 0);
    const dashAnim = `${def.fx}_dash`;
    if (this.scene.anims.exists(dashAnim)) dashFx.play(dashAnim);
    const decoy = this.fxSprite(def.fx, p.x, p.y, [0.5, 1]).setDepth(p.depth - 1).setFlipX(p.facing > 0);
    const decoyAnim = `${def.fx}_decoy`;
    if (this.scene.anims.exists(decoyAnim)) decoy.play(decoyAnim);
    this.queue(Math.max(1, skillNumber(def, 'decoyDurationMs', level)), () => decoy.destroy());
    const direction = p.facing;
    const distance = Math.max(0, skillNumber(def, 'dashDistance', level));
    let targetX = Phaser.Math.Clamp(p.x + direction * distance, p.body.halfWidth, this.scene.map.width - p.body.halfWidth);
    const bodyLeft = p.body.x - p.x, bodyRight = bodyLeft + p.body.width;
    // 只裁剪实体墙，单向平台允许横向穿行；薄墙也不会被一次位移越过。
    for (const solid of this.scene.map.solids.getChildren()) {
      const body = (solid as Phaser.Physics.Arcade.Sprite).body!;
      if (body.bottom <= p.body.top + 2 || body.top >= p.body.bottom - 2) continue;
      if (direction > 0 && body.left >= p.body.right && targetX + bodyRight > body.left)
        targetX = Math.min(targetX, body.left - bodyRight - 1);
      if (direction < 0 && body.right <= p.body.left && targetX + bodyLeft < body.right)
        targetX = Math.max(targetX, body.right - bodyLeft + 1);
    }
    const from = p.x, to = targetX;
    p.body.setVelocityX(0);
    this.scene.tweens.addCounter({ from: 0, to: 1, duration: Math.max(1, skillNumber(def, 'dashMs', level)),
      onUpdate: tween => {
        if (p.active && !p.dead) p.body.reset(Phaser.Math.Linear(from, to, tween.getValue() ?? 1), p.y);
        dashFx.setPosition(p.x, p.y);
      },
      onComplete: () => dashFx.destroy(),
    });
  }

  private special(skill: SkillDef, level: number, phase: SpecialSkillContext['phase'], target?: Monster) {
    const context = { scene: this.scene, skill, level, phase, target };
    for (const key of Object.keys(skill.effects ?? {})) this.specialEffects.get(key)?.(context);
    this.scene.events.emit('skill:effect', context);
  }

  private ensureBuffFx(id: string, restart: boolean) {
    const def = SKILLS[id];
    const p = this.scene.player;
    if (!def || def.type === 'passive') return;
    const start = `${def.fx}_start`;
    const loop = `${def.fx}_loop`;
    // 兽吼等范围技的短时增益仅恢复数值，不把一次性特效挂成常驻首帧。
    if (def.type === 'active' && !this.scene.anims.exists(start) && !this.scene.anims.exists(loop)) return;
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

  private playOnce(key: string | null, x: number, y: number, origin: [number, number], depth: number) {
    const fx = this.fxSprite(key, x, y, origin);
    if (!fx) return;
    fx.setDepth(depth).setFlipX(this.scene.player.facing > 0);
    const anim = ['play', 'cast', 'summon'].map(suffix => `${key}_${suffix}`)
      .find(candidate => this.scene.anims.exists(candidate));
    if (anim) {
      fx.play(anim);
      fx.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => fx.destroy());
    } else this.scene.time.delayedCall(300, () => fx.destroy());
  }

  /** 原点优先读 anims.json。剑气斩缺省 (0.5,0.5)，其余对齐脚底 (0.5,1)。混合用 NORMAL。 */
  private fxSprite(key: string | null, x: number, y: number, fallback: [number, number]) {
    if (!key || !this.scene.textures.exists(key)) key = this.placeholderFx();
    const meta = this.scene.cache.json.get(`${key}_anims`) as { origin?: number[] } | undefined;
    const origin = Array.isArray(meta?.origin) && meta.origin.length >= 2 ? meta.origin : fallback;
    return this.scene.add.sprite(x, y, key).setOrigin(origin[0], origin[1]).setBlendMode(Phaser.BlendModes.NORMAL);
  }

  private placeholderFx() {
    const key = 'ph_skill_fx';
    if (!this.scene.textures.exists(key)) {
      const graphics = this.scene.make.graphics({}, false);
      graphics.fillStyle(0x8eddd8, 0.7).fillCircle(16, 16, 10)
        .lineStyle(2, 0xe9ffff, 0.9).strokeCircle(16, 16, 14);
      graphics.generateTexture(key, 32, 32); graphics.destroy();
    }
    return key;
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
