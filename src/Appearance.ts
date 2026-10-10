import type Phaser from 'phaser';

export const BASE_PLAYER_ATLAS = 'player_sword_m';
export const PLAYER_ACTIONS = ['idle', 'walk', 'jump', 'djump', 'rope', 'ladder', 'attack', 'hit', 'die', 'sit', 'gather'] as const;

export function resolvePlayerAtlas(appearance: string | undefined, available: (key: string) => boolean): string {
  const variant = appearance ? `${BASE_PLAYER_ATLAS}__${appearance}` : undefined;
  return variant && available(variant) ? variant : BASE_PLAYER_ATLAS;
}

/** 只使用已加载的完整变体；_pending 或加载失败的外观自然回退素体。 */
export function syncPlayerAppearance(player: Phaser.GameObjects.Sprite, appearance?: string): boolean {
  const { scene, anims } = player;
  const atlas = resolvePlayerAtlas(appearance, key => {
    if (!scene.textures.exists(key)) return false;
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
