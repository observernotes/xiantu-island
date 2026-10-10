import Phaser from 'phaser';
import { ITEMS, TRIALS, type TrialDef } from '../data';
import type { GameScene } from './GameScene';
import type { MapObj, Zone } from './MapBuilder';
import type { Monster } from './Monster';

interface AnimPack {
  origin?: [number, number];
  hitArea?: [number, number];
  hitAreaOffsetY?: number;
  promptOffsetY?: number;
}
interface Prop {
  object: MapObj;
  sprite?: Phaser.GameObjects.Sprite;
  prompt?: Phaser.GameObjects.Text;
}
interface Lamp extends Prop { lit: boolean; hit: Phaser.Geom.Rectangle; }
interface Target extends Prop {
  mob?: Monster;
  range: number;
  /** 沿往返轨道走过的距离；出生点在轨道中央。 */
  distance: number;
  direction: number;
}

/** G10 对象与事件；试炼的阶段、胜负和画符输入由后续控制器承接。 */
export class SectTrialObjects {
  private readonly trial?: TrialDef;
  private readonly lamps: Lamp[] = [];
  private readonly props = new Map<MapObj, Prop>();
  private readonly targets: Target[] = [];
  private readonly inside = new Set<Zone>();
  private readonly tokenTaken = new Set<MapObj>();
  private activeDesk?: Prop;
  private tokenItem?: string;
  private tokenReturned = false;
  private spawnedTargets = 0;
  private nextTarget = 0;
  private refillAt = 0;

  constructor(private readonly scene: GameScene) {
    this.trial = scene.map.trial ? TRIALS[scene.map.trial] : undefined;
    const lamps = scene.map.objects.filter(o => o.type === 'lamp')
      .sort((a, b) => Number(a.props.index ?? 0) - Number(b.props.index ?? 0));
    for (const o of lamps) {
      const key = String(o.props.sprite ?? 'prop_trial_lamp');
      const p = this.createProp(o, key, 'unlit');
      const pack = this.pack(key), [w, h] = pack.hitArea ?? [24, 36];
      this.lamps.push({ ...p, lit: false,
        hit: new Phaser.Geom.Rectangle(o.x - w / 2, o.y + (pack.hitAreaOffsetY ?? -16) - h / 2, w, h) });
    }
    for (const o of scene.map.objects) {
      if (o.type === 'draw_desk') {
        const p = this.createProp(o, 'prop_trial_draw_desk', 'idle');
        this.addPrompt(p, '画符桌 Z / ↑', this.pack('prop_trial_draw_desk').promptOffsetY ?? -68);
      } else if (o.type === 'token') {
        const p = this.createProp(o, 'prop_shadow_token', 'idle');
        this.addPrompt(p, '拿令牌 Z / ↑', this.pack('prop_shadow_token').promptOffsetY ?? -56);
      } else if (o.type === 'target_spot') {
        const p = this.createProp(o, 'prop_target_spot', 'idle');
        this.targets.push({ ...p, range: Math.max(0, Number(o.props.moveRange) || 0), distance: 0, direction: 1 });
      }
    }
    // 初刷同时展示平移、高台和地面木靶，不让地图对象顺序决定教学内容。
    const kinds = [this.targets.filter(t => t.range > 0),
      this.targets.filter(t => !t.range && t.object.props.high),
      this.targets.filter(t => !t.range && !t.object.props.high)];
    const order: Target[] = [];
    while (order.length < this.targets.length) for (const kind of kinds) {
      const target = kind.shift();
      if (target) order.push(target);
    }
    this.targets.splice(0, this.targets.length, ...order);
    this.fillTargets();
    // 试炼图不刷常驻 spawn；兽栏只从配置对应的出生点建立驯服对象。
    const tameMonster = this.trial?.tame?.monster;
    if (tameMonster) for (const spawn of scene.map.spawns.filter(sp => sp.monster === tameMonster)) {
      for (let i = 0; i < spawn.count; i++) {
        const x = spawn.x + (spawn.w > 0 ? spawn.w * (i + 0.5) / spawn.count : i * 24);
        const mob = scene.spawnTrialMob(tameMonster, x, spawn.y);
        if (!mob) continue;
        mob.grantRewards = false;
        mob.setName(`tame:${tameMonster}:${i}`);
        this.emit('tame_spawn', { type: 'spawn', name: mob.name, x, y: spawn.y, w: spawn.w, h: 0, props: spawn }, { monster: tameMonster });
      }
    }
  }

  /** 调用方已经完成距离/按键判定；返回 true 表示本模块接管了该次交互。 */
  interact(o: MapObj): boolean {
    const p = this.props.get(o);
    if (!p || o.type !== 'draw_desk' && o.type !== 'token') return false;
    if (o.type === 'draw_desk') {
      if (this.activeDesk && this.activeDesk !== p) this.play(this.activeDesk, 'idle');
      this.activeDesk = p;
      this.play(p, 'active');
      const talismans = this.trial?.draw?.talismans ?? Number(o.props.talismans ?? 3);
      this.scene.log(`画符桌前凝神，准备连画 ${talismans} 道符。`, '#ffe680');
      this.emit('draw_start', o, { talismans });
      // TODO：接画符输入组件，完成/关闭回调恢复 idle，并交给试炼控制器推进阶段。
    } else if (!this.tokenTaken.has(o)) {
      const item = String(o.props.item ?? this.trial?.item ?? 'shadow_token');
      this.tokenTaken.add(o);
      this.tokenItem = item;
      this.scene.prog.addItem(item, 1);
      this.play(p, 'taken');
      p.prompt?.setVisible(false);
      this.scene.log(`拿到${ITEMS[item]?.name ?? item}了，原路返回。`, '#d4c0ff');
      this.emit('token_taken', o, { item });
    }
    return true;
  }

  /** 法术命中矩形，普通近战不会点灯。返回是否命中了一盏尚未点亮的灯。 */
  hitSpell(skillId: string, rect: Phaser.Geom.Rectangle): boolean {
    if (skillId !== (this.trial?.lamps?.hitSkill ?? 'spirit_bolt')) return false;
    let hit = false;
    for (const lamp of this.lamps) {
      if (lamp.lit || !Phaser.Geom.Intersects.RectangleToRectangle(lamp.hit, rect)) continue;
      lamp.lit = true; hit = true;
      this.playOnce(lamp, 'ignite', 'lit');
      const count = this.lamps.filter(l => l.lit).length;
      this.scene.log(`点亮试炼灯（${count}/${this.lamps.length}）`, '#ffe680');
      this.emit('lamp_lit', lamp.object, { skill: skillId, count, total: this.lamps.length });
    }
    return hit;
  }

  update(delta: number): void {
    const player = this.scene.player;
    if (!player) return;
    const feet = player.feet;
    for (const p of this.props.values()) if (p.prompt) {
      const near = Math.abs(p.object.x - player.x) <= 80 && Math.abs(p.object.y - feet) <= 64;
      p.prompt.setVisible(near && !this.tokenTaken.has(p.object));
    }
    if (this.activeDesk && (Math.abs(this.activeDesk.object.x - player.x) > 80 || Math.abs(this.activeDesk.object.y - feet) > 64)) {
      this.play(this.activeDesk, 'idle');
      this.emit('draw_leave', this.activeDesk.object);
      this.activeDesk = undefined;
    }
    if (this.scene.time.now >= this.refillAt) this.fillTargets();
    const speed = Math.max(0, Number(this.trial?.targets?.moveSpeed) || 0);
    for (const target of this.targets) {
      const mob = target.mob;
      if (!mob?.active || mob.dead) continue;
      let x = target.object.x;
      if (target.range > 0 && speed > 0) {
        target.distance += speed * Math.max(0, delta) / 1000;
        const length = target.range * 2, period = length * 2;
        const at = (target.range + target.distance) % period;
        x += (at <= length ? at : period - at) - target.range;
        const direction = at < length ? 1 : -1;
        if (direction !== target.direction) {
          target.direction = direction;
          this.emit('target_turn', target.object, { direction, x, minX: target.object.x - target.range, maxX: target.object.x + target.range });
        }
      }
      // 木靶脚底固定在对象的站立面，不受普攻击退或普通怪物巡逻更新影响。
      mob.body.reset(x, target.object.y);
      if (mob.st === 'hit' && this.scene.time.now >= mob.stateUntil) { mob.st = 'idle'; mob.anim('idle'); }
    }
    for (const zone of this.scene.map.zones) {
      if (zone.props.kind !== 'shadow' && zone.props.kind !== 'return_point') continue;
      const inZone = player.x >= zone.x && player.x <= zone.x + zone.w && feet >= zone.y && feet <= zone.y + zone.h;
      if (inZone !== this.inside.has(zone)) {
        if (inZone) this.inside.add(zone); else this.inside.delete(zone);
        this.emit(inZone ? 'zone_enter' : 'zone_leave', zone, { kind: zone.props.kind });
      }
      if (inZone && zone.props.kind === 'return_point' && this.tokenItem && !this.tokenReturned) {
        this.tokenReturned = true;
        this.scene.log('令牌已带回起点。', '#d4c0ff');
        this.emit('return_token', zone, { kind: zone.props.kind, item: this.tokenItem });
      }
    }
  }

  private fillTargets() {
    if (!this.targets.length) return;
    const config = this.trial?.targets;
    const maxActive = Math.max(1, Math.floor(config?.maxActive ?? this.targets.length));
    const total = Math.max(0, Math.floor(config?.total ?? this.targets.length));
    let active = this.targets.filter(t => t.mob?.active && !t.mob.dead).length;
    for (let tries = 0; tries < this.targets.length && active < maxActive && this.spawnedTargets < total; tries++) {
      const target = this.targets[this.nextTarget++ % this.targets.length];
      if (target.mob?.active && !target.mob.dead) continue;
      const mob = this.scene.spawnTrialMob(config?.monster ?? 'wood_target', target.object.x, target.object.y);
      if (!mob) continue;
      target.mob = mob; target.distance = 0; target.direction = 1;
      mob.setName(`target:${target.object.name}`);
      mob.grantRewards = false;
      mob.body.setAllowGravity(false).setImmovable(true);
      mob.body.moves = false;
      const onDead = mob.onDead;
      mob.onDead = dead => {
        onDead?.(dead);
        if (target.mob === dead) target.mob = undefined;
        this.refillAt = this.scene.time.now + Math.max(0, Number(config?.refillDelayMs) || 0);
        this.emit('target_dead', target.object, { monster: dead.def.id, x: dead.x, high: !!target.object.props.high });
      };
      active++; this.spawnedTargets++;
      this.playOnce(target, 'spawn', 'idle');
      this.emit('target_spawn', target.object, { monster: mob.def.id, high: !!target.object.props.high,
        moveRange: target.range, moveSpeed: config?.moveSpeed ?? 0, spawned: this.spawnedTargets, total });
    }
  }

  private pack(key: string): AnimPack { return this.scene.cache.json.get(`${key}_anims`) ?? {}; }

  private createProp(object: MapObj, key: string, anim: string): Prop {
    const p: Prop = { object };
    if (this.scene.textures.exists(key)) {
      const origin = this.pack(key).origin ?? [0.5, 1];
      p.sprite = this.scene.add.sprite(object.x, object.y, key).setOrigin(origin[0], origin[1]).setDepth(4);
      this.play(p, anim);
    }
    this.props.set(object, p);
    this.emit('loaded', object);
    return p;
  }

  private addPrompt(p: Prop, text: string, offsetY: number) {
    p.prompt = this.scene.add.text(p.object.x, p.object.y + offsetY, text, {
      fontSize: '12px', color: '#fff8d0', stroke: '#3b2a20', strokeThickness: 3,
    }).setOrigin(0.5, 1).setDepth(12).setVisible(false);
  }

  private play(p: Prop, suffix: string) {
    const sprite = p.sprite;
    if (!sprite?.active) return;
    const key = `${sprite.texture.key}_${suffix}`;
    if (this.scene.anims.exists(key)) sprite.play(key, true);
  }

  private playOnce(p: Prop, suffix: string, next: string) {
    const key = p.sprite ? `${p.sprite.texture.key}_${suffix}` : '';
    if (!p.sprite || !this.scene.anims.exists(key)) { this.play(p, next); return; }
    p.sprite.once(`animationcomplete-${key}`, () => this.play(p, next));
    this.play(p, suffix);
  }

  private emit(action: string, object: MapObj | Zone, detail: Record<string, unknown> = {}) {
    this.scene.events.emit('trial:object', { trial: this.scene.map.trial, action,
      object: object.name, type: 'type' in object ? object.type : 'zone', ...detail });
  }
}
