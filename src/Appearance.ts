import type Phaser from 'phaser';

export const BASE_PLAYER_ATLAS = 'player_sword_m';
export const PLAYER_ACTIONS = ['idle', 'walk', 'jump', 'djump', 'rope', 'ladder', 'attack', 'hit', 'die', 'sit', 'gather'] as const;

export function resolvePlayerAtlas(appearance: string | undefined, available: (key: string) => boolean): string {
  const variant = appearance ? `${BASE_PLAYER_ATLAS}__${appearance}` : undefined;
  return variant && available(variant) ? variant : BASE_PLAYER_ATLAS;
}

/** 图集画布规格（帧尺寸 + 显示缩放，读 `<key>_anims`，缺省读 idle_01 帧尺寸）；没有元数据（单测夹具）时为 null。 */
export function playerArtSpec(scene: Phaser.Scene, key: string): { size: [number, number] | null; scale: number } {
  const spec = (scene as { cache?: Phaser.Cache.CacheManager }).cache?.json?.get(`${key}_anims`) as
    { frameSize?: number | [number, number]; displayScale?: number } | undefined;
  const raw = spec?.frameSize;
  let size: [number, number] | null = typeof raw === 'number' ? [raw, raw] : Array.isArray(raw) ? raw : null;
  if (!size && scene.textures.exists(key)) {
    const first = scene.textures.get(key).get(`${key}_idle_01`) as Phaser.Textures.Frame | undefined;
    size = first?.realWidth ? [first.realWidth, first.realHeight] : null;
  }
  const scale = typeof spec?.displayScale === 'number' && spec.displayScale > 0 ? spec.displayScale : 1;
  return { size, scale };
}

/**
 * 纸娃娃规则（项目经理 2026-10-10）：本体已换高清画布（如 v2 192/0.5）时，画布更小的旧外观图层
 * （狐裘、五宗道袍 96）不叠上去，只显示本体；装备/存档照常，重画成同规格后自动接回。
 * 反向（旧 96 本体 + 新 2x 外观）照 E-1 逐 key 并存，不拦。
 */
export function outdatedOnBase(scene: Phaser.Scene, key: string): boolean {
  const base = playerArtSpec(scene, BASE_PLAYER_ATLAS), variant = playerArtSpec(scene, key);
  if (!base.size || !variant.size) return false;
  return base.size[0] * base.size[1] > variant.size[0] * variant.size[1];
}

/** 只使用已加载的完整变体；_pending、加载失败或画布旧于本体的外观自然回退素体。 */
export function syncPlayerAppearance(player: Phaser.GameObjects.Sprite, appearance?: string): boolean {
  const { scene, anims } = player;
  const atlas = resolvePlayerAtlas(appearance, key => {
    if (!scene.textures.exists(key)) return false;
    if (scene.textures.exists(BASE_PLAYER_ATLAS) && outdatedOnBase(scene, key)) return false;
    const texture = scene.textures.get(key);
    return PLAYER_ACTIONS.every(action => {
      if (!scene.anims.exists(`${key}_${action}`)) return false;
      const animation = scene.anims.get(`${key}_${action}`);
      return animation.frames.length > 0 && animation.frames.every(frame => frame.textureKey === key && texture.has(String(frame.textureFrame)));
    });
  });
  const previous = player.texture.key;
  if (atlas === previous || !scene.textures.exists(atlas)) return false;

  const current = anims.currentAnim;
  const action = current?.key.startsWith(`${previous}_`) ? current.key.slice(previous.length + 1) : undefined;
  const key = action ? `${atlas}_${action}` : undefined;
  if (key && scene.anims.exists(key)) {
    const animation = scene.anims.get(key);
    const index = (anims.currentFrame?.index ?? 1) - 1;
    const frame = animation.frames[Math.min(index, animation.frames.length - 1)];
    if (!frame) return false;
    // 各套装动作的帧数/帧率一致。直接换引用，保留播放/暂停/结束状态、帧计时及 timeScale，避免攻击重新出刀。
    anims.currentAnim = animation;
    anims.setCurrentFrame(frame);
  } else {
    const name = String(player.frame.name);
    const mapped = name.startsWith(`${previous}_`) ? `${atlas}_${name.slice(previous.length + 1)}` : `${atlas}_idle_01`;
    const texture = scene.textures.get(atlas);
    const frame = texture.has(mapped) ? mapped : texture.has(`${atlas}_idle_01`) ? `${atlas}_idle_01` : undefined;
    player.setTexture(atlas, frame);
  }
  return true;
}
