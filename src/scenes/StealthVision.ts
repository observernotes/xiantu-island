import Phaser from 'phaser';
import { MONSTERS, TRIALS } from '../data';
import { advancePatrol, detectProgress, inShadow, seesPlayer, shadowPieces, startPatrol, type PatrolMotion, type Point } from '../TrialMotion';
import type { GameScene } from './GameScene';
import type { MapObj } from './MapBuilder';
import type { Monster } from './Monster';

interface Patrol {
  object: MapObj; mob: Monster; points: Point[]; motion: PatrolMotion;
  pauseMs: number; progress: number; detected: boolean;
  cone?: Phaser.GameObjects.Sprite;
}

/** 巡逻/发现只发事件，完整失败流程由试炼控制器承接。 */
export class StealthVision {
  readonly patrols: Patrol[] = [];
  private shadow = false;
  private shadowTween?: Phaser.Tweens.Tween;
  private shadowParts: { sprite: Phaser.GameObjects.Sprite; frames: string[]; frameRate: number }[] = [];
  private night?: Phaser.GameObjects.RenderTexture;
  private light?: Phaser.GameObjects.Graphics;

  constructor(private readonly scene: GameScene) {
    this.drawShadowZones();
    const config = scene.map.trial ? TRIALS[scene.map.trial]?.patrols : undefined;
    for (const o of scene.map.objects.filter(o => o.type === 'patrol_path')) {
      const raw = o.points?.length ? o.points : [
        { x: Number(o.props.startX ?? o.x), y: o.y }, { x: Number(o.props.endX ?? o.x), y: o.y },
      ];
      const points = raw.filter((p, i) => Number.isFinite(p.x) && Number.isFinite(p.y)
        && (!i || p.x !== raw[i - 1].x || p.y !== raw[i - 1].y));
      if (points.length < 2) continue;
      const id = String(o.props.monster ?? config?.monster ?? 'youying_patrol');
      const def = MONSTERS[id];
      if (!def?.vision) continue;
      const motion = startPatrol(points);
      const mob = scene.spawnTrialMob(id, motion.x, motion.y);
      if (!mob) continue;
      mob.setName(`patrol:${o.name}`); mob.grantRewards = false; mob.suppressTouch = true; mob.manualMotion = true;
      mob.body.setAllowGravity(false).setImmovable(true); mob.body.moves = false;
      const pack = scene.cache.json.get(`${def.sprite}_anims`);
      const fx = String(pack?.coneFx ?? 'fx_youying_patrol_lantern_cone');
      const patrol: Patrol = { object: o, mob, points, motion, pauseMs: Number(o.props.turnPauseMs ?? config?.turnPauseMs ?? 0),
        progress: 0, detected: false };
      if (scene.textures.exists(fx)) {
        const meta = scene.cache.json.get(`${fx}_anims`);
        const baseLength = Number(meta?.range?.length ?? 172);
        const baseAngle = Number(meta?.range?.halfAngleDeg ?? 15);
        const scale = def.vision.length / baseLength; // 当前 192/172 ≈ 1.12（丹青阁占位素材）
        patrol.cone = scene.add.sprite(mob.x, mob.y - 40, fx).setDepth(7).setBlendMode(Phaser.BlendModes.NORMAL)
          .setScale(scale, scale * Math.tan(def.vision.halfAngleDeg * Math.PI / 180) / Math.tan(baseAngle * Math.PI / 180));
        this.playCone(patrol, false);
      }
      this.patrols.push(patrol);
      this.emit(patrol, 'patrol_loaded');
    }
    if (scene.map.night) {
      // 夜景覆盖角色与地面，灯笼/视锥处擦掉暗层，HUD 在其上方。
      this.night = scene.add.renderTexture(0, 0, scene.map.width, scene.map.height).setOrigin(0, 0).setDepth(20);
      this.light = scene.make.graphics({}, false);
      scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => this.light?.destroy());
    }
  }

  update(deltaMs: number, moving: boolean) {
    const scene = this.scene, feet = { x: scene.player.x, y: scene.player.feet };
    const shadow = inShadow(feet, scene.map.zones);
    this.setShadow(shadow);
    for (const part of this.shadowParts) {
      const frame = Math.floor(scene.time.now / 1000 * part.frameRate) % part.frames.length;
      part.sprite.setFrame(part.frames[frame]);
    }
    for (const patrol of this.patrols) {
      const { mob, motion } = patrol;
      if (!mob.active || mob.dead) continue;
      if (moving) advancePatrol(motion, patrol.points, mob.def.moveSpeed, deltaMs, patrol.pauseMs);
      mob.body.reset(motion.x, motion.y);
      mob.body.updateFromGameObject();
      mob.dir = motion.facing; mob.setFlipX(motion.facing > 0);
      const pack = scene.cache.json.get(`${mob.def.sprite}_anims`);
      const offsetX = Math.abs(Number(pack?.lanternOffset?.[0] ?? 30));
      const origin = { x: mob.x + motion.facing * offsetX, y: mob.y - 40 };
      const visible = seesPlayer(origin, motion.facing, { x: mob.x, y: mob.y }, patrol.points, feet,
        shadow || scene.player.dead || scene.prog.buffActive('phantom_cloak'), mob.def.vision!);
      if (moving) patrol.progress = detectProgress(patrol.progress, visible, deltaMs, mob.def.vision!);
      mob.anim(patrol.progress > 0 ? 'alert' : motion.pauseLeft > 0 || !moving ? 'idle' : 'walk');
      patrol.cone?.setPosition(origin.x, origin.y).setFlipX(motion.facing > 0).setOrigin(motion.facing > 0 ? 0 : 1, 0.5);
      this.playCone(patrol, patrol.progress > 0);
      if (moving && !patrol.detected && patrol.progress >= mob.def.vision!.detectMs) {
        patrol.detected = true;
        scene.log('巡逻弟子：什么人！', '#ffb0b0');
        this.emit(patrol, 'detected');
      } else if (patrol.progress === 0) patrol.detected = false;
    }
    this.drawNight();
  }

  private setShadow(shadow: boolean) {
    if (shadow === this.shadow) return;
    this.shadow = shadow; this.shadowTween?.stop();
    const player = this.scene.player, from = Phaser.Display.Color.IntegerToColor(player.tintTopLeft);
    const to = Phaser.Display.Color.IntegerToColor(shadow ? 0x8A80B0 : 0xffffff);
    const alpha = player.shadowAlpha;
    this.shadowTween = this.scene.tweens.addCounter({ from: 0, to: 1, duration: 150,
      onUpdate: tween => {
        const value = tween.getValue() ?? 1;
        const color = Phaser.Display.Color.Interpolate.ColorWithColor(from, to, 1, value);
        player.setTint(Phaser.Display.Color.GetColor(color.r, color.g, color.b));
        player.shadowAlpha = Phaser.Math.Linear(alpha, shadow ? 0.6 : 1, value);
      },
      onComplete: () => { player.shadowAlpha = shadow ? 0.6 : 1; if (shadow) player.setTint(0x8A80B0); else player.clearTint(); },
    });
  }

  private drawShadowZones() {
    const key = 'fx_shadow_zone';
    if (!this.scene.textures.exists(key)) return;
    const pack = this.scene.cache.json.get(`${key}_anims`);
    const pieceWidth = Number(pack?.pieceWidth ?? 32), frameHeight = Number(pack?.frameSize?.[1] ?? 96);
    for (const zone of this.scene.map.zones.filter(z => z.props.kind === 'shadow' && z.w > 0)) {
      for (const piece of shadowPieces(zone.x, zone.w, pieceWidth)) {
        const animation = pack?.anims?.find((a: { key: string }) => a.key === `${key}_${piece.kind}`);
        const frames: string[] = animation?.frames ?? [];
        if (!frames.length) continue;
        const sprite = this.scene.add.sprite(piece.x, zone.y + zone.h, key, frames[0]).setOrigin(0, 1).setDepth(2)
          .setBlendMode(Phaser.BlendModes.NORMAL).setScale(1, (zone.h + Number(pack?.featherHeight ?? 32)) / frameHeight);
        if (piece.width < pieceWidth) sprite.setCrop(0, 0, piece.width, frameHeight);
        this.shadowParts.push({ sprite, frames, frameRate: animation.frameRate ?? 4 });
      }
    }
  }

  private playCone(patrol: Patrol, alert: boolean) {
    const sprite = patrol.cone;
    if (!sprite) return;
    const key = `${sprite.texture.key}_${alert ? 'alert' : 'loop'}`;
    if (this.scene.anims.exists(key)) sprite.play(key, true);
  }

  private drawNight() {
    if (!this.night || !this.light) return;
    this.night.clear().fill(0x080414, 0.65);
    this.light.clear().fillStyle(0xffffff, 1);
    for (const patrol of this.patrols) {
      const vision = patrol.mob.def.vision!, dir = patrol.motion.facing;
      const x = patrol.cone?.x ?? patrol.mob.x + dir * 30, y = patrol.mob.y - 40;
      const h = vision.length * Math.tan(vision.halfAngleDeg * Math.PI / 180);
      this.light.fillTriangle(x, y, x + dir * vision.length, y - h, x + dir * vision.length, y + h).fillCircle(x, y, 24);
    }
    // 点亮的试炼灯也提供一个局部亮区。
    for (const lamp of this.scene.children.list) {
      if (lamp instanceof Phaser.GameObjects.Sprite && lamp.texture.key === 'prop_trial_lamp'
        && lamp.anims.currentAnim?.key !== 'prop_trial_lamp_unlit') this.light.fillCircle(lamp.x, lamp.y - 24, 64);
    }
    this.night.erase(this.light);
  }

  private emit(patrol: Patrol, action: string) {
    this.scene.events.emit('trial:object', { trial: this.scene.map.trial, action, type: 'patrol_path', object: patrol.object.name,
      progress: patrol.progress, detectMs: patrol.mob.def.vision!.detectMs });
  }
}
