import Phaser from 'phaser';
import { SPEC } from '../config/feel';
import { ITEMS, SENSE, TILED_MAPS } from '../data';
import { featureEnabled } from '../features';
import type { SenseTarget } from '../Sense';
import type { GameScene } from './GameScene';
import { createOneWayPlatformVisual, type HiddenMapObject, type MapObj, type OneWayPlatformVisual } from './MapBuilder';

type VisibleObject = Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };

/** 静态图的隐藏状态只归 mapId|objectName；不接管原生奖励或通行条件。 */
export class SenseMapAdapter {
  private readonly platforms = new Map<string, Phaser.GameObjects.Zone>();
  private readonly platformVisuals = new Map<string, OneWayPlatformVisual>();
  private readonly visuals = new Map<MapObj, Set<VisibleObject>>();

  constructor(private readonly scene: GameScene) {
    // 必须早于 Player 构建：读档的落脚面和本体画面同时恢复，显形高亮仍由界面接入。
    for (const hidden of scene.map.hidden) {
      if (!hidden.valid || hidden.kind !== 'platform' || hidden.encounter) continue;
      const object = hidden.object;
      const zone = scene.add.zone(object.x + object.w / 2, object.y + SPEC.oneWayEdge / 2, object.w, SPEC.oneWayEdge)
        .setName(`sense-platform:${object.name}`);
      scene.map.oneWays.add(zone);
      const body = zone.body as Phaser.Physics.Arcade.StaticBody;
      body.checkCollision.down = body.checkCollision.left = body.checkCollision.right = false;
      this.platforms.set(object.name, zone);
    }
    this.syncRevealed();
  }

  revealed(objectName: string): boolean {
    const hidden = this.scene.map.hidden.find(entry => entry.object.name === objectName);
    return featureEnabled('spiritScan') && !!hidden?.valid && !hidden.encounter
      && this.scene.prog.senseRevealed?.[`${this.scene.map.id}|${objectName}`] === true;
  }

  platformBody(objectName: string): Phaser.Physics.Arcade.StaticBody | undefined {
    return this.platforms.get(objectName)?.body as Phaser.Physics.Arcade.StaticBody | undefined;
  }

  /** 尚未显形时没有任何平台本体图元；测试读取真实渲染对象和所选地砖。 */
  platformVisual(objectName: string): OneWayPlatformVisual | undefined {
    return this.platformVisuals.get(objectName);
  }

  /** 扫描、读档与运行期切换开关都走同一路径；半透明不影响碰撞强度。 */
  syncRevealed() {
    for (const hidden of this.scene.map.hidden) {
      const zone = this.platforms.get(hidden.object.name);
      if (!zone) continue;
      const visible = this.revealed(hidden.object.name);
      (zone.body as Phaser.Physics.Arcade.StaticBody).enable = visible;
      zone.setVisible(visible);
      let visual = this.platformVisuals.get(hidden.object.name);
      if (visible && !visual) {
        visual = createOneWayPlatformVisual(this.scene, this.scene.map, hidden.object);
        this.platformVisuals.set(hidden.object.name, visual);
      }
      visual?.object.setVisible(visible);
    }
    for (const [object, visuals] of this.visuals) for (const visual of visuals)
      if (visual.scene) visual.setVisible(this.objectVisible(object));
  }

  objectVisible(object: MapObj): boolean {
    const controls = this.scene.map.hidden.filter(hidden => hidden.object.props.targetObject === object.name);
    return !controls.length || controls.every(hidden => this.revealed(hidden.object.name));
  }

  bindVisual(object: MapObj, visual: VisibleObject) {
    const visuals = this.visuals.get(object) ?? new Set<VisibleObject>();
    visuals.add(visual); this.visuals.set(object, visuals);
    visual.setVisible(this.objectVisible(object));
  }

  private applyReveal(hidden: HiddenMapObject) {
    if (hidden.kind === 'platform') this.syncRevealed();
    if (hidden.target) for (const visual of this.visuals.get(hidden.target) ?? [])
      if (visual.scene) visual.setVisible(this.objectVisible(hidden.target));
  }

  targets(): SenseTarget[] {
    const scene = this.scene;
    return scene.map.hidden.filter(hidden => hidden.valid && !hidden.encounter && scene.map.objects.includes(hidden.object)
      && hidden.object.x >= 0 && hidden.object.y >= 0 && hidden.object.x + hidden.object.w <= scene.map.width
      && hidden.object.y + hidden.object.h <= scene.map.height
      && (!hidden.target || scene.map.objects.includes(hidden.target))
      && (hidden.kind !== 'chest' || !!ITEMS[hidden.target!.props.loot]
        && !scene.prog.openedChests.includes(`${scene.map.id}:${hidden.target!.name}`))
      && (hidden.kind !== 'entrance' || hidden.target!.props.target === 'field_test' || !!TILED_MAPS[hidden.target!.props.target]))
      .map(hidden => ({ kind: hidden.kind, instanceId: scene.map.id, id: hidden.object.name,
        x: hidden.x, y: hidden.y, reqSpirit: hidden.reqSpirit, active: true,
        revealed: () => this.revealed(hidden.object.name), applyReveal: () => this.applyReveal(hidden) }));
  }
}

/** 怪物必须由自身机制实际激活；本适配器不生成怪物或读取未公开技能。 */
export function sceneMonsterTargets(scene: GameScene): SenseTarget[] {
  return scene.mobs.filter(monster => monster.active && !monster.dead && monster.hp > 0 && monster.visible
    && monster.alpha > 0 && !!monster.body?.enable && monster.def.id !== 'training_dummy'
    && monster.body.center.x >= 0 && monster.body.center.x <= scene.map.width
    && monster.body.center.y >= 0 && monster.body.center.y <= scene.map.height
    && !monster.def.immortal && !monster.def.invulnerable)
    .map(monster => ({ kind: 'monster_info', instanceId: scene.map.id, id: String(monster.senseInstanceId),
      x: monster.body.center.x, y: monster.body.center.y, active: true,
      reqSpirit: SENSE.targetProfiles.find(profile => profile.kind === 'monster_info' && profile.enabled
        && profile.id === monster.def.sense?.profile)?.reqSpirit ?? Number.NaN,
      monster: { instance: monster, definition: monster.def, hp: monster.hp, maxHp: monster.def.hp,
        alive: () => monster.active && !monster.dead && monster.hp > 0 && !!monster.scene } }));
}
