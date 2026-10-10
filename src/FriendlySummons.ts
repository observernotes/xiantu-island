import Phaser from 'phaser';
import { ATLAS_INFO, MONSTERS } from './data';
import type { GameScene } from './scenes/GameScene';
import type { Monster } from './scenes/Monster';
import { floorCount, SKILLS, skillNumber, skillRange, type SkillDef } from './skills';

export interface FriendlySummon {
  sprite: Phaser.Physics.Arcade.Sprite;
  defId: string; level: number; secondary: boolean;
  hp: number; maxHp: number; defense: number;
  createdAt: number; expireAt: number; attackReadyAt: number; hurtReadyAt: number;
  colliders: Phaser.Physics.Arcade.Collider[];
}

/** 友方灵兽独立于敌方 mobs：不会触发击杀、掉落、图鉴或任务奖励。 */
export class FriendlySummons {
  readonly pets: FriendlySummon[] = [];
  private bond: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: GameScene) {
    this.bond = scene.add.graphics().setDepth(scene.player.depth - 1);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.destroy());
  }

  summon(def: SkillDef, level: number) {
    const { prog, player } = this.scene;
    const template = MONSTERS[String(def.effects?.summon)]
      ?? { sprite: 'mon_wild_wolf', tint: 0x7fe0c0 }; // 旧快照缺友方模板时仍读技能表生成灵狼。
    const base = Math.max(1, floorCount(skillNumber(def, 'summonCount', level)));
    const cap = Math.max(base, floorCount(prog.passiveBonus('maxSummons')));
    const allowed = Math.min(cap, base + floorCount(prog.passiveBonus('extraSummonCount')));
    // 每次只召一只；上限达到后刷新最早一只，双狼不能在首次施法时同时生成。
    if (this.pets.length >= allowed && def.effects?.refreshOldest) {
      const old = [...this.pets].sort((a, b) => a.createdAt - b.createdAt)[0];
      this.remove(old);
    } else if (this.pets.length >= allowed) return;
    const secondary = this.pets.some(p => !p.secondary);
    const texture = this.scene.textures.exists(template.sprite) ? template.sprite : this.placeholder();
    const sprite = this.scene.physics.add.sprite(player.x - player.facing * 36, player.feet, texture)
      .setOrigin(0.5, 1).setDepth(player.depth - 1)
      .setTint(Number((template as unknown as { tint?: number }).tint ?? 0x7fe0c0));
    const body = sprite.body as Phaser.Physics.Arcade.Body;
    const [w, h] = ATLAS_INFO[template.sprite]?.bodySize ?? [56, 34];
    body.setSize(w, h).setOffset((sprite.frame.realWidth - w) / 2, sprite.frame.realHeight - h);
    body.setMaxVelocityY(670);
    const colliders = [this.scene.physics.add.collider(sprite, this.scene.map.solids)];
    colliders.push(this.scene.physics.add.collider(sprite, this.scene.map.oneWays, undefined, (a, platform) => {
      const moving = (a as Phaser.Physics.Arcade.Sprite).body as Phaser.Physics.Arcade.Body;
      const top = (platform as Phaser.Physics.Arcade.Sprite).body!.top;
      return moving.velocity.y >= 0 && moving.prev.y + moving.height <= top + 2;
    }));
    const maxHp = Math.max(1, Math.round(prog.maxHp * skillNumber(def, 'hpRatioOfOwner', level)
      * (1 + prog.passiveBonus('petHpRatio'))));
    const now = this.scene.time.now;
    this.pets.push({ sprite, defId: def.id, level, secondary, maxHp, hp: maxHp,
      defense: Math.round(prog.def * skillNumber(def, 'defRatioOfOwner', level)), createdAt: now,
      expireAt: now + skillNumber(def, 'durationMs', level) + prog.passiveBonus('petDurationMs'),
      attackReadyAt: now, hurtReadyAt: now, colliders });
    this.animate(sprite, 'idle');
  }

  update(time: number) {
    const { player, prog } = this.scene;
    this.bond.clear();
    for (const pet of [...this.pets]) {
      if (!pet.sprite.active || player.dead || time >= pet.expireAt || !prog.ownsSkill(SKILLS[pet.defId])) {
        this.remove(pet); continue;
      }
      const def = SKILLS[pet.defId], lv = pet.level;
      const sprite = pet.sprite, body = sprite.body as Phaser.Physics.Arcade.Body;
      const waiting = player.state2 === 'rope' && !!def.effects?.waitBelowRope;
      if (prog.buffBonus('petDamageShareRatio') > 0) this.bond.lineStyle(2, 0x7fe0c0, 0.45)
        .lineBetween(player.x, player.y - 36, sprite.x, sprite.y - 20);
      const leash = skillNumber(def, 'leashDist', lv), aggro = skillNumber(def, 'aggroRange', lv);
      if (!waiting && Math.abs(sprite.x - player.x) > leash) body.reset(player.x - player.facing * 40, player.feet);
      const target = waiting ? undefined : this.scene.mobs.filter(m => m.active && !m.dead
        && Math.abs(m.x - player.x) <= leash && Math.abs(m.x - sprite.x) <= aggro
        && Math.abs(m.y - sprite.y) <= 96)
        .sort((a, b) => Math.abs(a.x - sprite.x) - Math.abs(b.x - sprite.x))[0];
      const range = skillRange(def)!;
      const inReach = target && Math.abs(target.x - sprite.x) <= range.w && Math.abs(target.y - sprite.y) <= range.h;
      const follow = skillNumber(def, 'followDist', lv);
      const x = target?.x ?? player.x - player.facing * follow;
      const dx = x - sprite.x;
      const moving = !inReach && Math.abs(dx) > (target ? 12 : 24);
      body.setVelocityX(moving ? Math.sign(dx) * skillNumber(def, 'moveSpeed', lv) : 0);
      if (moving) sprite.setFlipX(dx > 0);
      if (target && target.y < sprite.y - 40 && (body.blocked.down || body.touching.down)) body.setVelocityY(-360);
      if (inReach && time >= pet.attackReadyAt) {
        sprite.setFlipX(target!.x > sprite.x);
        pet.attackReadyAt = time + Math.max(1, skillNumber(def, 'attackIntervalMs', lv));
        this.animate(sprite, 'attack');
        this.attack(pet, target!);
      } else if (time >= pet.attackReadyAt - 150) this.animate(sprite, moving ? 'walk' : 'idle');
      if (time >= pet.hurtReadyAt) for (const mob of this.scene.mobs) {
        if (mob.dead || mob.def.noDamage || mob.suppressTouch || !mob.def.touchDamage || !mob.body.enable || !this.overlap(sprite, mob)) continue;
        this.takeDamage(pet, mob.def.atk * (mob.def.touchDamageMul ?? 1), mob.x);
        break;
      }
    }
  }

  /** 怪物范围/弹道技能后续统一调用这里；当前接入接触伤害和灵契分担。 */
  takeDamage(pet: FriendlySummon, rawDamage: number, fromX: number) {
    if (!pet.sprite.active || this.scene.time.now < pet.hurtReadyAt) return;
    pet.hurtReadyAt = this.scene.time.now + 700; // TODO 表内缺友方召唤物受击无敌时间。
    const damage = Math.max(1, Math.round(rawDamage - pet.defense));
    const share = Math.min(1, Math.max(0, this.scene.prog.buffBonus('petDamageShareRatio')));
    const ownerDamage = Math.round(damage * share);
    pet.hp = Math.max(0, pet.hp - (damage - ownerDamage));
    if (ownerDamage > 0) {
      this.scene.prog.hp = Math.max(0, this.scene.prog.hp - ownerDamage);
      this.scene.player.hp = this.scene.prog.hp;
      this.scene.damageNumber(this.scene.player.x, this.scene.player.y - 70, ownerDamage, '#c45cff', '#2a0040');
      if (this.scene.prog.hp <= 0) this.scene.playerDie();
    }
    this.scene.damageNumber(pet.sprite.x, pet.sprite.y - 40, damage - ownerDamage, '#7fe0c0', '#123d31');
    if (pet.hp <= 0) this.remove(pet);
    else {
      const body = pet.sprite.body as Phaser.Physics.Arcade.Body;
      body.setVelocityX(Math.sign(pet.sprite.x - fromX) * 60);
    }
  }

  private attack(pet: FriendlySummon, mob: Monster) {
    const def = SKILLS[pet.defId], prog = this.scene.prog;
    const ratio = skillNumber(def, 'damageRatio', pet.level)
      * (pet.secondary ? skillNumber(def, 'secondaryWolfDamageRatio', pet.level) : 1)
      * (1 + prog.buffBonus('petAtkRatio'));
    const count = Math.max(1, skillNumber(def, 'hitCount', pet.level));
    for (let i = 0; i < count && !mob.dead; i++) {
      const damage = prog.damageTo(mob.def.level, mob.def.def, ratio);
      mob.takeHit(this.scene.time.now, damage, Math.sign(mob.x - pet.sprite.x) || 1);
      this.scene.damageNumber(mob.x, mob.y - mob.body.height - 10, damage, '#7fe0c0', '#123d31');
      this.scene.events.emit('skill:hit', { id: def.id, target: mob.def.id, damage, secondary: pet.secondary });
    }
    prog.addMastery(def.id);
  }

  private overlap(a: Phaser.Physics.Arcade.Sprite, b: Monster) {
    const ab = a.body!, bb = b.body;
    return Phaser.Geom.Intersects.RectangleToRectangle(new Phaser.Geom.Rectangle(ab.x, ab.y, ab.width, ab.height),
      new Phaser.Geom.Rectangle(bb.x, bb.y, bb.width, bb.height));
  }

  private animate(sprite: Phaser.Physics.Arcade.Sprite, action: string) {
    const key = `${sprite.texture.key}_${action}`;
    if (this.scene.anims.exists(key)) sprite.play(key, true);
  }

  private remove(pet: FriendlySummon) {
    for (const collider of pet.colliders) collider.destroy();
    pet.sprite.destroy();
    const index = this.pets.indexOf(pet);
    if (index >= 0) this.pets.splice(index, 1);
    // 主狼离场后让仍存活的副狼接替；不会同时出现两只主狼的全额伤害。
    if (this.pets.length === 1) this.pets[0].secondary = false;
  }

  private placeholder() {
    const key = 'ph_spirit_wolf';
    if (!this.scene.textures.exists(key)) {
      const graphics = this.scene.make.graphics({}, false);
      graphics.fillStyle(0x7fe0c0).fillRoundedRect(5, 16, 54, 25, 8)
        .fillTriangle(4, 22, 13, 3, 21, 22).fillRect(12, 35, 8, 12).fillRect(44, 35, 8, 12);
      graphics.generateTexture(key, 64, 48); graphics.destroy();
    }
    return key;
  }

  private destroy() {
    for (const pet of [...this.pets]) this.remove(pet);
    this.bond.destroy();
  }
}
