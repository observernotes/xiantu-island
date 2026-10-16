import type Phaser from 'phaser';
import secretRooms from '@xt/balance/secret_rooms.json';

/** 只登记本批新增的图集；普通宝箱继续使用既有 prop_chest。 */
export const SECRET_PROP_ATLASES = [
  'prop_chest_hidden', 'prop_secret_door', 'prop_campfire', 'prop_spirit_spring',
  'prop_secret_stele', 'prop_secret_furnace', 'prop_trap_spikes', 'prop_trap_thorns',
  'prop_trap_lava', 'fx_elite_aura',
] as const;

export type SecretPropAtlas = typeof SECRET_PROP_ATLASES[number] | 'prop_chest';
export type SecretPropState = 'hidden' | 'reveal' | 'closed' | 'open' | 'opened' | 'opening' | 'idle' | 'trigger';
export interface SecretPropVisual { atlas: SecretPropAtlas; state: SecretPropState; }
export interface SecretPropObject { type: string; props?: Readonly<Record<string, unknown>>; }
export interface SecretPropContext { revealed?: boolean; opened?: boolean; }

/** 主题皮只读权威表；未登记的主题或皮肤回退通用地刺。 */
export function trapAtlasForTheme(themeId?: string): 'prop_trap_spikes' | 'prop_trap_thorns' | 'prop_trap_lava' {
  const themes: Record<string, { trapSkin?: string }> = secretRooms.themes;
  const skin = themeId ? themes[themeId]?.trapSkin : undefined;
  if (skin === 'thorns') return 'prop_trap_thorns';
  if (skin === 'lava') return 'prop_trap_lava';
  return 'prop_trap_spikes';
}

/** 不读取 sprite 等私有地图字段，也不改变地图对象或玩法状态。 */
export function resolveSecretProp(object: SecretPropObject, themeId?: string, context: SecretPropContext = {}): SecretPropVisual | undefined {
  const props = object.props ?? {};
  switch (object.type) {
    case 'chest': {
      const hidden = props.hidden === true;
      return { atlas: hidden ? 'prop_chest_hidden' : 'prop_chest',
        state: context.opened ? 'opened' : hidden && !context.revealed ? 'hidden' : 'closed' };
    }
    case 'roomDoor': return { atlas: 'prop_secret_door', state: context.opened ? 'open' : 'closed' };
    case 'restPoint': {
      const healRatio = props.healRatio;
      if (typeof healRatio !== 'number' || !Number.isFinite(healRatio)) return undefined;
      if (healRatio >= 45) return { atlas: 'prop_campfire', state: 'idle' };
      if (healRatio <= 35 && props.rerollBoon === true) return { atlas: 'prop_spirit_spring', state: 'idle' };
      return undefined;
    }
    case 'event':
      if (props.kind === 'stele') return { atlas: 'prop_secret_stele', state: 'idle' };
      if (props.kind === 'cauldron') return { atlas: 'prop_secret_furnace', state: 'idle' };
      return undefined;
    case 'zone': return props.hazard === 'trap' ? { atlas: trapAtlasForTheme(themeId), state: 'idle' } : undefined;
    default: return undefined;
  }
}

type Sprite = Phaser.GameObjects.Sprite;
interface PropTransition { key: string; complete: () => void; destroy: () => void; afterSettled?: () => void; }
const transitions = new WeakMap<Sprite, PropTransition>();

function clearTransition(sprite: Sprite) {
  const pending = transitions.get(sprite);
  if (!pending) return;
  sprite.off(`animationcomplete-${pending.key}`, pending.complete);
  sprite.off('destroy', pending.destroy);
  transitions.delete(sprite);
}

/** 与 GameScene 的 propAnimation 标记和静帧降级保持一致。 */
export function playPropAnimation(scene: Phaser.Scene, sprite: Sprite, key: string): void {
  if (sprite.getData('propAnimation') === key) return;
  clearTransition(sprite);
  sprite.setData('propAnimation', key);
  if (scene.anims.exists(key)) sprite.play(key);
  else {
    sprite.anims.stop();
    const frame = `${key}_01`;
    sprite.setFrame(sprite.texture.has(frame) ? frame : sprite.texture.firstFrame);
  }
}

function transitionProp(scene: Phaser.Scene, sprite: Sprite, atlas: string, state: SecretPropState,
  settled: SecretPropState, afterSettled?: () => void): boolean {
  const key = `${atlas}_${state}`;
  if (!scene.anims.exists(key)) {
    playPropAnimation(scene, sprite, `${atlas}_${settled}`);
    afterSettled?.();
    return true;
  }
  playPropAnimation(scene, sprite, key);
  const pending: PropTransition = {
    key, afterSettled,
    destroy: () => clearTransition(sprite),
    complete: () => {
      // 每条过渡只监听自己的完成事件；手动切态后旧回调不能倒退状态。
      if (transitions.get(sprite) !== pending || sprite.getData('propAnimation') !== key) return;
      const next = pending.afterSettled;
      clearTransition(sprite);
      playPropAnimation(scene, sprite, `${atlas}_${settled}`);
      next?.();
    },
  };
  transitions.set(sprite, pending);
  sprite.once(`animationcomplete-${key}`, pending.complete);
  sprite.once('destroy', pending.destroy);
  return true;
}

/** 仅揭示动画；扫描扣费和显隐仍由 Sense 决定。 */
export function revealHiddenChest(scene: Phaser.Scene, sprite: Sprite): boolean {
  if (sprite.texture.key !== 'prop_chest_hidden') return false;
  const current = sprite.getData('propAnimation');
  if (current && current !== 'prop_chest_hidden_hidden') return false;
  return transitionProp(scene, sprite, 'prop_chest_hidden', 'reveal', 'closed');
}

/** 隐藏箱在揭示中开启时排队，保留 hidden→reveal→closed→open→opened。 */
export function openPropChest(scene: Phaser.Scene, sprite: Sprite, atlas = sprite.texture.key): boolean {
  if (atlas !== 'prop_chest' && atlas !== 'prop_chest_hidden') return false;
  const current = sprite.getData('propAnimation');
  if (current === `${atlas}_open` || current === `${atlas}_opened`) return false;
  if (atlas === 'prop_chest_hidden' && (!current || current === `${atlas}_hidden` || current === `${atlas}_reveal`)) {
    const pending = transitions.get(sprite);
    if (pending?.key === `${atlas}_reveal`) {
      if (pending.afterSettled) return false;
      pending.afterSettled = () => { openPropChest(scene, sprite, atlas); };
      return true;
    }
    return transitionProp(scene, sprite, atlas, 'reveal', 'closed', () => { openPropChest(scene, sprite, atlas); });
  }
  return transitionProp(scene, sprite, atlas, 'open', 'opened');
}

/** 由未来的 lock:clear 门控调用，本模块不判定清怪。 */
export function openSecretDoor(scene: Phaser.Scene, sprite: Sprite): boolean {
  if (sprite.texture.key !== 'prop_secret_door') return false;
  const current = sprite.getData('propAnimation');
  if (current === 'prop_secret_door_opening' || current === 'prop_secret_door_open') return false;
  return transitionProp(scene, sprite, 'prop_secret_door', 'opening', 'open');
}

/** 由未来的陷阱触发调用，本模块不结算伤害或触发时机。 */
export function triggerSecretTrap(scene: Phaser.Scene, sprite: Sprite): boolean {
  const atlas = sprite.texture.key;
  if (!['prop_trap_spikes', 'prop_trap_thorns', 'prop_trap_lava'].includes(atlas)) return false;
  if (sprite.getData('propAnimation') === `${atlas}_trigger`) return false;
  return transitionProp(scene, sprite, atlas, 'trigger', 'idle');
}

const eliteAuras = new WeakMap<Sprite, Sprite>();

/** 只挂视觉；调用方沿用 secret_rooms.monster.elite 的体型和精英判定。 */
export function attachEliteAura(scene: Phaser.Scene, monsterSprite: Sprite): Sprite | undefined {
  const existing = eliteAuras.get(monsterSprite);
  if (existing) return existing;
  if (!scene.textures.exists('fx_elite_aura')) return undefined;
  const aura = scene.add.sprite(monsterSprite.x, monsterSprite.y, 'fx_elite_aura').setOrigin(0.5, 1);
  eliteAuras.set(monsterSprite, aura);
  playPropAnimation(scene, aura, 'fx_elite_aura_idle');
  // 怪图可能用 2 倍像素、displayScale=0.5；96px 光环保留自身尺寸，只跟随挂载后的相对缩放。
  const baseScaleX = Math.abs(monsterSprite.scaleX) || 1;
  const baseScaleY = Math.abs(monsterSprite.scaleY) || 1;
  let disposed = false;
  const follow = () => {
    aura.setPosition(monsterSprite.x + (0.5 - monsterSprite.originX) * monsterSprite.displayWidth,
      monsterSprite.y + (1 - monsterSprite.originY) * monsterSprite.displayHeight);
    aura.setScale(Math.abs(monsterSprite.scaleX) / baseScaleX, Math.abs(monsterSprite.scaleY) / baseScaleY);
    aura.setDepth(monsterSprite.depth - 1);
    aura.setVisible(monsterSprite.visible && monsterSprite.active);
    aura.setAlpha(monsterSprite.alpha);
  };
  const dispose = (destroyAura: boolean) => {
    if (disposed) return;
    disposed = true;
    scene.events.off('postupdate', follow);
    scene.events.off('shutdown', destroy);
    scene.events.off('destroy', destroy);
    monsterSprite.off('destroy', destroy);
    aura.off('destroy', auraDestroyed);
    eliteAuras.delete(monsterSprite);
    if (destroyAura) aura.destroy();
  };
  const destroy = () => dispose(true);
  const auraDestroyed = () => dispose(false);
  scene.events.on('postupdate', follow);
  scene.events.once('shutdown', destroy);
  scene.events.once('destroy', destroy);
  monsterSprite.once('destroy', destroy);
  aura.once('destroy', auraDestroyed);
  follow();
  return aura;
}
