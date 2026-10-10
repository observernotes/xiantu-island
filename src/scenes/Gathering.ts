import { gameNow } from '../GameClock';
import Phaser from 'phaser';
import { ITEMS, t } from '../data';
import { hasHud, hudSpec, sliced, setSlicedWidth } from '../hud';
import { interactionPrompt } from '../InteractionPrompt';
import type { GameScene } from './GameScene';
import type { MapObj } from './MapBuilder';
import { featureEnabled } from '../features';

interface GatherPoint {
  object: MapObj; item: string; castMs: number; respawnMs: number; key: string;
  hitArea: [number, number]; sprite?: Phaser.GameObjects.Sprite; fallback?: Phaser.GameObjects.Text;
  prompt: Phaser.GameObjects.Container; ready: boolean;
}

/** 采集只补地图既有 gather 对象；冷却用绝对时刻，换图/刷新不会立刻重长。 */
export class Gathering {
  points: GatherPoint[] = [];
  active?: { point: GatherPoint; elapsed: number };
  private requireRelease = false;
  private bar: Phaser.GameObjects.Container;
  private fill?: Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image;
  private fallback?: Phaser.GameObjects.Rectangle;
  private icon?: Phaser.GameObjects.Image;
  private fillWidth = 42;
  private fillHeight = 4;

  constructor(private scene: GameScene) {
    for (const o of scene.map.objects.filter(o => o.type === 'gather')) {
      const item = String(o.props.item ?? ''), def = ITEMS[item], g = def?.gather;
      if (!g || !Number.isFinite(g.castMs) || g.castMs <= 0 || !Number.isFinite(g.respawnMs) || g.respawnMs < 0) continue;
      const atlas = `prop_gather_${item}`, note = scene.cache.json.get(`${atlas}_anims`);
      const promptText = t('gather.prompt').replace(/^Z\s*/, '');
      const point: GatherPoint = { object: o, item, castMs: g.castMs, respawnMs: g.respawnMs,
        key: `${scene.map.id}:${o.name}`, hitArea: note?.hitArea ?? [32, 32], ready: false,
        prompt: interactionPrompt(scene, o.x, o.y + (note?.promptOffsetY ?? -52), 'Z', promptText) };
      if (scene.textures.exists(atlas)) {
        const origin = note?.origin ?? [0.5, 1];
        point.sprite = scene.add.sprite(o.x, o.y, atlas).setOrigin(origin[0], origin[1]).setDepth(4).setName(`gather:${o.name}`);
      } else point.fallback = scene.add.text(o.x, o.y, def.name, { color: '#a7dbac', fontSize: '14px' }).setOrigin(0.5, 1).setDepth(4);
      this.points.push(point);
      this.refreshPoint(point, gameNow());
    }
    this.bar = scene.add.container(0, 0).setDepth(40).setVisible(false).setName('gather:castbar');
    if (hasHud(scene, 'ui_gather_castbar_frame') && hasHud(scene, 'ui_gather_castbar_fill')) {
      const spec = hudSpec(scene, 'ui_gather_castbar_frame')!;
      const [ix, iy, iw, ih] = spec.innerRect ?? [0, 0, spec.size![0], spec.size![1]];
      this.fillWidth = 48 - (spec.size![0] - iw); this.fillHeight = ih;
      const frame = sliced(scene, 'ui_gather_castbar_frame', -24, 0, 48, 10)!.setScrollFactor(1);
      this.fill = sliced(scene, 'ui_gather_castbar_fill', -24 + ix, iy, this.fillWidth, ih)!.setScrollFactor(1);
      this.bar.add([frame, this.fill]);
    } else {
      this.bar.add(scene.add.rectangle(0, 5, 48, 10, 0x3b2a20));
      this.fallback = scene.add.rectangle(-21, 3, 42, 4, 0x4fb3c9).setOrigin(0, 0);
      this.bar.add(this.fallback);
    }
    if (scene.textures.exists('icon_gather_herb')) {
      this.icon = scene.add.image(-36, 5, 'icon_gather_herb'); this.bar.add(this.icon);
    }
  }

  private near(point: GatherPoint) {
    const p = this.scene.player, [w, h] = point.hitArea;
    return Math.abs(p.x - point.object.x) <= w / 2 + p.body.width / 2
      && Math.abs(p.feet - point.object.y) <= h;
  }

  private refreshPoint(point: GatherPoint, now: number) {
    const cooldown = this.scene.prog.gatherRespawnAt[point.key];
    const ready = cooldown === undefined || cooldown <= now;
    if (featureEnabled('alchemyPhase1') && ready && cooldown !== undefined) delete this.scene.prog.gatherRespawnAt[point.key];
    if (ready === point.ready && point.sprite?.anims.currentAnim) return;
    point.ready = ready;
    const key = `prop_gather_${point.item}_${ready ? 'idle' : 'harvested'}`;
    if (point.sprite) {
      if (this.scene.anims.exists(key)) point.sprite.setVisible(true).play(key, true);
      else point.sprite.setVisible(ready);
    }
    point.fallback?.setVisible(ready);
  }

  /** blocked 包括落物优先、面板及对话；移动/松键/受击都会取消。 */
  update(delta: number, held: boolean, blocked: boolean, moving = false) {
    const scene = this.scene, p = scene.player, now = gameNow();
    if (!held) this.requireRelease = false;
    if (!featureEnabled('alchemyPhase1')) {
      this.cancel();
      this.bar.setVisible(false);
      for (const point of this.points) point.prompt.setVisible(false);
      return;
    }
    for (const point of this.points) {
      this.refreshPoint(point, now);
      point.prompt.setVisible(point.ready && this.near(point) && !blocked && !this.active && !p.dead);
    }
    if (this.active && (!held || blocked || moving || p.dead || p.state2 === 'hurt' || !p.onGround || !this.near(this.active.point))) this.cancel();
    if (!this.active && held && !blocked && !moving && !this.requireRelease && !p.dead && p.onGround && p.state2 !== 'hurt') {
      const point = this.points.find(point => point.ready && this.near(point));
      if (point) {
        this.active = { point, elapsed: 0 }; p.gathering = true; p.body.setVelocityX(0);
        const icon = ITEMS[point.item]?.kind === 'ore' ? 'icon_gather_ore' : 'icon_gather_herb';
        if (scene.textures.exists(icon)) this.icon?.setTexture(icon);
      }
    }
    if (!this.active) return;
    p.body.setVelocityX(0);
    this.active.elapsed += delta;
    const ratio = Math.min(1, this.active.elapsed / this.active.point.castMs);
    this.bar.setVisible(true).setPosition(p.x, p.y - 88);
    if (this.fill) setSlicedWidth(scene, this.fill, 'ui_gather_castbar_fill', this.fillWidth * ratio);
    this.fallback?.setDisplaySize(this.fillWidth * ratio, this.fillHeight);
    if (ratio < 1) return;
    const point = this.active.point;
    scene.prog.addItem(point.item, 1);
    scene.prog.gatherRespawnAt[point.key] = now + point.respawnMs;
    scene.prog.save();
    scene.log(`获得 ${ITEMS[point.item]?.name ?? point.item} ×1`, '#a7dbac');
    this.active = undefined; p.gathering = false; this.requireRelease = true; this.bar.setVisible(false);
    this.refreshPoint(point, now); point.prompt.setVisible(false);
  }

  cancel() {
    if (!this.active) return;
    this.active = undefined; this.scene.player.gathering = false; this.requireRelease = true;
    const fill = this.fill ?? this.fallback;
    if (fill) {
      if ('setTint' in fill) fill.setTint(0xe5483a); else fill.setFillStyle(0xe5483a);
    }
    this.scene.log(t('gather.interrupted'), '#ffb0b0');
    this.scene.time.delayedCall(120, () => {
      if (!this.active) this.bar.setVisible(false);
      if (this.fill && 'clearTint' in this.fill) this.fill.clearTint();
      this.fallback?.setFillStyle(0x4fb3c9);
    });
  }
}
