import type Phaser from 'phaser';
import type { EncounterDefinition, EncountersConfig } from './Encounter';
import { playPropAnimation } from './SecretProps';

export type EncounterPropState = 'hidden' | 'reveal' | 'idle';
export interface EncounterPropObject {
  readonly type: string; readonly name?: string;
  readonly props?: Readonly<Record<string, unknown>>;
}
export interface EncounterPropContext {
  readonly active?: boolean; readonly offered?: boolean; readonly revealed?: boolean;
}
export interface EncounterPropVisual {
  readonly encounterId: string; readonly atlas: string;
  readonly initialFrame?: string; readonly animPrefix?: string; readonly scanRevealSprite?: string;
  readonly state: 'hidden' | 'idle'; readonly visible: boolean;
}

type Fields = Readonly<Record<string, unknown>>;
type Sprite = Phaser.GameObjects.Sprite;
const fields = (value: unknown): Fields => value && typeof value === 'object' && !Array.isArray(value) ? value as Fields : {};
const text = (value: unknown): value is string => typeof value === 'string' && value.trim().length > 0;

/** 只读权威 visual.objects；地图私有 sprite 字段、出生点与存档均不参与解析。 */
export function resolveEncounterProp(object: EncounterPropObject, config: EncountersConfig | null,
  context: EncounterPropContext = {}): EncounterPropVisual | undefined {
  if (object.type !== 'encounter_anchor' && object.type !== 'hidden') return;
  const encounterId = object.props?.encounter;
  if (!text(encounterId) || !text(object.name) || context.active !== true && context.offered !== true) return;
  const definition = config?.encounters.find(row => row.id === encounterId && row.enabled === true);
  if (!definition || !['visible', 'spirit_scan'].includes(String(definition.trigger.reveal))) return;
  const visual = fields((definition as EncounterDefinition & { readonly visual?: unknown }).visual);
  const entry = fields(fields(visual.objects)[object.name]);
  if (!text(entry.sprite)) return;
  const hidden = definition.trigger.reveal === 'spirit_scan' && context.revealed !== true;
  return {
    encounterId, atlas: entry.sprite,
    ...(text(entry.initialFrame) ? { initialFrame: entry.initialFrame } : {}),
    ...(text(entry.animPrefix) ? { animPrefix: entry.animPrefix } : {}),
    ...(text(visual.scanRevealSprite) ? { scanRevealSprite: visual.scanRevealSprite } : {}),
    state: hidden ? 'hidden' : 'idle', visible: !hidden,
  };
}

export function encounterPropAnimation(visual: EncounterPropVisual, state: EncounterPropState): string {
  return `${visual.atlas}_${visual.animPrefix ? `${visual.animPrefix}_` : ''}${state}`;
}

interface Transition { key: string; complete: () => void; destroy: () => void; }
const transitions = new WeakMap<Sprite, Transition>();

function clearTransition(sprite: Sprite): void {
  const pending = transitions.get(sprite);
  if (!pending) return;
  sprite.off(`animationcomplete-${pending.key}`, pending.complete);
  sprite.off('destroy', pending.destroy);
  transitions.delete(sprite);
}

/** 沿用 propAnimation 标记；缺动画选同态首帧，再降级到配置静帧或图集首帧。 */
export function playEncounterProp(scene: Phaser.Scene, sprite: Sprite, visual: EncounterPropVisual,
  state: EncounterPropState = visual.state): void {
  const key = encounterPropAnimation(visual, state), pending = transitions.get(sprite);
  // runner 已显形后的逐帧 idle 同步不能截断一次性的 reveal。
  if (state === 'idle' && pending && sprite.getData('propAnimation') === pending.key) return;
  if (sprite.getData('propAnimation') === key) return;
  clearTransition(sprite);
  playPropAnimation(scene, sprite, key);
  if (!scene.anims.exists(key)) {
    const frame = `${key}_01`;
    sprite.setFrame(sprite.texture.has(frame) ? frame
      : visual.initialFrame && sprite.texture.has(visual.initialFrame) ? visual.initialFrame : sprite.texture.firstFrame);
  }
}

/** 仅创建当前已抽中事件的视觉；缺纹理静默跳过，脚底/层级与宝箱一致。 */
export function createEncounterProp(scene: Phaser.Scene, object: EncounterPropObject & { readonly x: number; readonly y: number },
  visual: EncounterPropVisual): Sprite | undefined {
  if (!scene.textures.exists(visual.atlas)) return;
  const sprite = scene.add.sprite(object.x, object.y, visual.atlas).setOrigin(0.5, 1).setDepth(4)
    .setName(`encounter-prop:${object.name ?? visual.encounterId}`).setVisible(visual.visible);
  playEncounterProp(scene, sprite, visual);
  return sprite;
}

/** 可选的一次性扫描星点；以入口可见中心为挂点，随入口销毁清理。 */
function scanRevealFx(scene: Phaser.Scene, sprite: Sprite, atlas: string): void {
  if (!scene.textures.exists(atlas)) return;
  const fx = scene.add.sprite(sprite.x, sprite.y - sprite.displayHeight / 2, atlas)
    .setOrigin(0.5, 0.5).setDepth(sprite.depth + 1).setName('encounter-scan-reveal');
  const key = `${atlas}_play`;
  let fallback: Phaser.Time.TimerEvent | undefined;
  const destroy = () => { fx.destroy(); };
  const cleanup = () => {
    sprite.off('destroy', destroy);
    fx.off(`animationcomplete-${key}`, destroy);
    fx.off('destroy', cleanup);
    fallback?.remove(false);
  };
  sprite.once('destroy', destroy);
  fx.once('destroy', cleanup);
  if (scene.anims.exists(key)) {
    fx.once(`animationcomplete-${key}`, destroy);
    playPropAnimation(scene, fx, key);
  } else {
    playPropAnimation(scene, fx, key);
    // 静态 FX 也必须结束；简化渲染宿主未提供时钟时直接撤下。
    if (scene.time?.delayedCall) fallback = scene.time.delayedCall(500, destroy);
    else destroy();
  }
}

/** 只播显形；reveal 的提交和失败回滚由 Runtime/Sense 负责。 */
export function revealEncounterProp(scene: Phaser.Scene, sprite: Sprite, visual: EncounterPropVisual,
  options: { readonly fx?: boolean } = {}): boolean {
  const reveal = encounterPropAnimation(visual, 'reveal'), idle = encounterPropAnimation(visual, 'idle');
  const current = sprite.getData('propAnimation');
  if (current === reveal || current === idle) return false;
  sprite.setVisible(true);
  if (options.fx !== false && visual.scanRevealSprite) scanRevealFx(scene, sprite, visual.scanRevealSprite);
  if (!scene.anims.exists(reveal)) {
    playEncounterProp(scene, sprite, visual, 'idle');
    return true;
  }
  playEncounterProp(scene, sprite, visual, 'reveal');
  const pending: Transition = {
    key: reveal,
    destroy: () => clearTransition(sprite),
    complete: () => {
      if (transitions.get(sprite) !== pending || sprite.getData('propAnimation') !== reveal) return;
      clearTransition(sprite);
      playEncounterProp(scene, sprite, visual, 'idle');
    },
  };
  transitions.set(sprite, pending);
  sprite.once(`animationcomplete-${reveal}`, pending.complete);
  sprite.once('destroy', pending.destroy);
  return true;
}
