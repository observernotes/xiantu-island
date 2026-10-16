import type Phaser from 'phaser';
import { SPEC } from '../config/feel';
import { ITEMS, SENSE, TILED_MAPS } from '../data';
import { featureEnabled } from '../features';
import { hiddenSenseProfileEnabled, validateSenseConfig, type SenseConfig, type SenseTarget } from '../Sense';
import { playPropAnimation, revealHiddenChest } from '../SecretProps';
import type { GameScene } from './GameScene';
import { createOneWayPlatformVisual, type HiddenMapObject, type MapObj, type OneWayPlatformVisual } from './MapBuilder';

type VisibleObject = Phaser.GameObjects.GameObject & { setVisible(value: boolean): unknown };

/** 静态图的隐藏状态只归 mapId|objectName；不接管原生奖励或通行条件。 */
export class SenseMapAdapter {
  private readonly platforms = new Map<string, Phaser.GameObjects.Zone>();
  private readonly platformVisuals = new Map<string, OneWayPlatformVisual>();
  private readonly visuals = new Map<MapObj, Set<VisibleObject>>();
  private readonly visualVisibility = new WeakMap<VisibleObject, boolean>();

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
    const config = this.config();
    return !!hidden && !!config && this.available(hidden, config)
      && this.scene.prog.senseRevealed?.[`${this.scene.map.id}|${objectName}`] === true;
  }

  private config(): SenseConfig | undefined {
    if (!featureEnabled('spiritScan')) return;
    const config = validateSenseConfig(SENSE).config;
    return config?.enabled === true ? config : undefined;
  }

  /** 候选与已显形恢复共用内容门控；开关变化不删除存档记录。 */
  private available(hidden: HiddenMapObject, config: SenseConfig): boolean {
    const scene = this.scene, object = hidden.object;
    return hidden.valid && !hidden.encounter && object.props.enabled !== false
      && hiddenSenseProfileEnabled(config, hidden.kind) && scene.map.objects.includes(object)
      && object.x >= 0 && object.y >= 0 && object.x + object.w <= scene.map.width
      && object.y + object.h <= scene.map.height
      && (!hidden.target || scene.map.objects.includes(hidden.target))
      && (hidden.kind !== 'chest' || !!ITEMS[hidden.target!.props.loot])
      && (hidden.kind !== 'entrance' || hidden.target!.props.target === 'field_test' || !!TILED_MAPS[hidden.target!.props.target]);
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
    this.syncPlatforms();
    for (const [object, visuals] of this.visuals) for (const visual of visuals)
      if (visual.scene) this.syncVisual(object, visual);
  }

  private syncPlatforms() {
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
  }

  objectVisible(object: MapObj): boolean {
    const controls = this.scene.map.hidden.filter(hidden => hidden.object.props.targetObject === object.name);
    return !controls.length || controls.every(hidden => this.revealed(hidden.object.name));
  }

  bindVisual(object: MapObj, visual: VisibleObject) {
    const visuals = this.visuals.get(object) ?? new Set<VisibleObject>();
    visuals.add(visual); this.visuals.set(object, visuals);
    this.syncVisual(object, visual);
  }

  /** 只操作已有原生视觉；矩形降级和只有 setVisible 的替身沿用可见性同步。 */
  private syncVisual(object: MapObj, visual: VisibleObject, reveal = false) {
    const previous = this.visualVisibility.get(visual), visible = this.objectVisible(object);
    visual.setVisible(visible);
    this.visualVisibility.set(visual, visible);
    const sprite = visual as Phaser.GameObjects.Sprite;
    if (object.type !== 'chest' || object.props.hidden !== true || sprite.texture?.key !== 'prop_chest_hidden'
      || typeof sprite.play !== 'function' || typeof sprite.getData !== 'function' || typeof sprite.setData !== 'function') return;
    const opened = this.scene.prog.openedChests.includes(`${this.scene.map.id}:${object.name}`);
    // props.hidden 自身没有扫描身份；必须沿用现有 hidden 控制器的持久显形结果。
    const controlled = this.scene.map.hidden.some(hidden => hidden.object.props.targetObject === object.name);
    if (reveal && controlled && visible && previous === false && !opened) {
      revealHiddenChest(this.scene, sprite);
    } else if (previous === undefined || previous !== visible) {
      const state = opened ? 'opened' : controlled && visible ? 'closed' : 'hidden';
      playPropAnimation(this.scene, sprite, `prop_chest_hidden_${state}`);
    }
  }

  private applyReveal(hidden: HiddenMapObject) {
    // 同次扫描先提交全部记录；平台显形不能提前把待播 reveal 的箱子恢复成 closed。
    if (hidden.kind === 'platform') this.syncPlatforms();
    if (hidden.target) for (const visual of this.visuals.get(hidden.target) ?? [])
      if (visual.scene) this.syncVisual(hidden.target, visual, true);
  }

  targets(): SenseTarget[] {
    const scene = this.scene, config = this.config();
    if (!config) return [];
    return scene.map.hidden.filter(hidden => this.available(hidden, config)
      && (hidden.kind !== 'chest' || !scene.prog.openedChests.includes(`${scene.map.id}:${hidden.target!.name}`)))
      .map(hidden => ({ kind: hidden.kind, instanceId: scene.map.id, id: hidden.object.name,
        x: hidden.x, y: hidden.y, reqSpirit: hidden.reqSpirit, active: true,
        revealed: () => this.revealed(hidden.object.name), applyReveal: () => this.applyReveal(hidden) }));
  }
}

/** 怪物必须由自身机制实际激活；本适配器不生成怪物或读取未公开技能。 */
export function sceneMonsterTargets(scene: GameScene): SenseTarget[] {
  return scene.mobs.filter(monster => {
    const def = monster.def as typeof monster.def & { grantRewards?: boolean; despawnWithOwner?: boolean };
    // FriendlySummons 的 sprite 不进入 mobs；也防止混入带显式友方标记或玩家 owner 的实例。
    const runtime = monster as unknown as { friendly?: boolean; owner?: unknown };
    // 首领召唤的敌对小怪仍可扫描：不据运行期 grantRewards/despawnWithOwner 判断阵营。
    return monster.active && !monster.dead && monster.hp > 0 && monster.visible
      && monster.alpha > 0 && !!monster.body?.enable && def.id !== 'training_dummy'
      && monster.body.center.x >= 0 && monster.body.center.x <= scene.map.width
      && monster.body.center.y >= 0 && monster.body.center.y <= scene.map.height
      && def.noDamage !== true && !def.immortal && !def.invulnerable
      && !((def.minHp ?? 0) > 0) && !('kneelBelow' in def)
      && def.grantRewards !== false && def.despawnWithOwner !== true
      && runtime.friendly !== true && !(runtime.owner != null && runtime.owner === scene.player);
  })
    .map(monster => ({ kind: 'monster_info', instanceId: scene.map.id, id: String(monster.senseInstanceId),
      x: monster.body.center.x, y: monster.body.center.y, active: true,
      reqSpirit: SENSE.targetProfiles.find(profile => profile.kind === 'monster_info' && profile.enabled
        && profile.id === monster.def.sense?.profile)?.reqSpirit ?? Number.NaN,
      monster: { instance: monster, definition: monster.def, hp: monster.hp, maxHp: monster.def.hp,
        alive: () => monster.active && !monster.dead && monster.hp > 0 && !!monster.scene } }));
}
