import type Phaser from 'phaser';
import baseAnimations from '@xt/art/sprites/player_sword_m.anims.json';
import assets from './gen/assets.json';
import { BASE_PLAYER_ATLAS, PLAYER_ACTIONS, resolvePlayerAtlas, syncPlayerAppearance } from './Appearance';
import { ITEMS } from './data';
import { Progress } from './Progress';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: 得到 ${String(actual)}，期望 ${String(expected)}`);
}
function ok(value: unknown, message: string): asserts value {
  assertions++;
  if (!value) throw new Error(message);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}

// runner 仅 require 独立动画组件；这些是真实 Phaser Animation / AnimationState。
const runtime = (globalThis as unknown as {
  appearanceTestPhaser: {
    Animation: new (manager: Phaser.Animations.AnimationManager, key: string, config: Phaser.Types.Animations.Animation) => Phaser.Animations.Animation;
    AnimationState: new (parent: Phaser.GameObjects.GameObject) => Phaser.Animations.AnimationState;
  };
}).appearanceTestPhaser;

class Texture {
  frames = new Map<string, Phaser.Textures.Frame>();
  constructor(readonly key: string, names: string[]) {
    for (const name of ['__BASE', ...names]) this.frames.set(name, {
      name, texture: this, customPivot: false,
    } as unknown as Phaser.Textures.Frame);
  }
  has(name: string) { return this.frames.has(name); }
  get(name: string = '__BASE') {
    const frame = this.frames.get(name);
    if (!frame) throw new Error(`缺纹理帧 ${this.key}:${name}`);
    return frame;
  }
}

class Fixture {
  textures = new Map<string, Texture>();
  animations = new Map<string, Phaser.Animations.Animation>();
  textureManager = {
    exists: (key: string) => this.textures.has(key),
    get: (key: string) => {
      const texture = this.textures.get(key);
      if (!texture) throw new Error(`缺纹理 ${key}`);
      return texture;
    },
    getFrame: (key: string, name: string) => this.textures.get(key)?.get(name),
  };
  animationManager = {
    textureManager: this.textureManager,
    globalTimeScale: 1,
    on: () => undefined,
    off: () => undefined,
    exists: (key: string) => this.animations.has(key),
    get: (key: string) => this.animations.get(key),
  };
  json = new Map<string, unknown>();
  scene = {
    cache: { json: { get: (key: string) => this.json.get(key) } },
    textures: this.textureManager,
    anims: this.animationManager,
    sys: { anims: this.animationManager },
  };
  constructor(keys: string[] = [BASE_PLAYER_ATLAS]) { for (const key of keys) this.addAtlas(key); }
  addAtlas(key: string) {
    const names = baseAnimations.anims.flatMap(a => a.frames.map(name => name.replace(BASE_PLAYER_ATLAS, key)));
    this.textures.set(key, new Texture(key, names));
    for (const def of baseAnimations.anims) {
      const animKey = def.key.replace(BASE_PLAYER_ATLAS, key);
      this.animations.set(animKey, new runtime.Animation(this.animationManager as unknown as Phaser.Animations.AnimationManager, animKey, {
        frames: def.frames.map(name => ({ key, frame: name.replace(BASE_PLAYER_ATLAS, key) })),
        frameRate: def.frameRate,
        repeat: def.repeat,
      }));
    }
  }
  sprite(key = BASE_PLAYER_ATLAS, action?: string, index = 1) {
    const player = new Sprite(this, key);
    if (action) {
      player.anims.play(`${key}_${action}`);
      player.anims.setCurrentFrame(player.anims.currentAnim!.frames[index - 1]);
    }
    player.events = [];
    return player;
  }
}

class Sprite {
  texture: Texture;
  frame: Phaser.Textures.Frame;
  anims: Phaser.Animations.AnimationState;
  scene: Fixture['scene'];
  x = 123; y = 456; flipX = true; flipY = false; facing = -1;
  alpha = 0.7; originX = 0.5; originY = 1;
  isCropped = false; _originComponent = true;
  events: string[] = [];
  constructor(fixture: Fixture, key: string) {
    this.scene = fixture.scene;
    this.texture = fixture.textureManager.get(key);
    this.frame = this.texture.get(`${key}_idle_01`);
    this.anims = new runtime.AnimationState(this as unknown as Phaser.GameObjects.GameObject);
  }
  setTexture(key: string, name?: string | number) {
    this.texture = this.scene.textures.get(key);
    this.frame = this.texture.get(name === undefined ? undefined : String(name));
    return this;
  }
  setSizeToFrame() { return this; }
  updateDisplayOrigin() { return this; }
  emit(event: string) { this.events.push(event); return this; }
}

function sync(player: Sprite, appearance?: string) { return syncPlayerAppearance(player as unknown as Phaser.GameObjects.Sprite, appearance); }
function animationState(player: Sprite) {
  const anim = player.anims as unknown as Record<string, unknown>;
  const fields = ['isPlaying', 'hasStarted', 'timeScale', 'frameRate', 'duration', 'msPerFrame', 'accumulator', 'nextTick',
    'delayCounter', 'repeatCounter', 'repeatDelay', 'pendingRepeat', 'forward', 'inReverse', 'yoyo',
    '_paused', '_wasPlaying', '_pendingStop', '_pendingStopValue'];
  return Object.fromEntries(fields.map(key => [key, anim[key]]));
}
function pose(player: Sprite) {
  return [player.x, player.y, player.flipX, player.flipY, player.facing, player.alpha, player.originX, player.originY];
}
function changed(player: Sprite, appearance: string | undefined, expectedAtlas: string, label: string) {
  const before = animationState(player), beforePose = pose(player);
  const action = player.anims.currentAnim?.key.slice(player.texture.key.length + 1);
  const index = player.anims.currentFrame?.index;
  player.events = [];
  eq(sync(player, appearance), true, `${label} 立即变更`);
  eq(player.texture.key, expectedAtlas, `${label} 使用对应图集`);
  if (action) {
    eq(player.anims.currentAnim?.key, `${expectedAtlas}_${action}`, `${label} 保持动作`);
    eq(player.anims.currentFrame?.index, index, `${label} 保持当前帧序号`);
    eq(player.frame.name, player.anims.currentFrame?.textureFrame, `${label} 显示帧对应当前动画帧`);
  }
  same(animationState(player), before, `${label} 保持播放状态、计时与 timeScale`);
  same(pose(player), beforePose, `${label} 保持位置、朝向、透明度和锚点`);
  eq(player.events.some(event => event === 'animationstart' || event === 'animationstop' || event === 'animationcomplete'), false, `${label} 不重播或结束动画`);
}

const sects = ['taixu', 'lingfu', 'youying', 'wanshou', 'tianjian'];
const variants = sects.map(sect => `${BASE_PLAYER_ATLAS}__outfit_${sect}_1`);
const foxAtlas = `${BASE_PLAYER_ATLAS}__fox_robe`;
same(PLAYER_ACTIONS, baseAnimations.anims.map(a => a.key.slice(BASE_PLAYER_ATLAS.length + 1)), '外观完整性检查覆盖真实主角所有动作');
ok(assets.atlases.every(a => !a.key.startsWith('pend_') && !a.key.includes('_pending/')), '加载清单不包含 pending 外观');

const saved: Record<string, string> = {};
globalThis.localStorage = {
  getItem: key => saved[key] ?? null,
  setItem: (key, value) => { saved[key] = String(value); },
  removeItem: key => { delete saved[key]; },
  clear: () => { for (const key of Object.keys(saved)) delete saved[key]; },
  key: index => Object.keys(saved)[index] ?? null,
  get length() { return Object.keys(saved).length; },
};

// 不改物品表：五套真实宗门装备的 appearance 从装备读取，背包持有不会换装。
{
  const p = new Progress();
  eq(p.appearance, undefined, '未穿装备无外观');
  const fixture = new Fixture([BASE_PLAYER_ATLAS, ...variants, foxAtlas]);
  const player = fixture.sprite(BASE_PLAYER_ATLAS, 'walk', 3);
  player.anims.timeScale = 1.65;
  player.anims.update(0, 23);
  for (const [i, sect] of sects.entries()) {
    const id = `robe_${sect}_1`, item = ITEMS[id];
    ok(item?.slot, `${sect} 宗袍存在且可装备`);
    p.addItem(id, 1);
    if (i === 0) eq(p.appearance, undefined, '仅在背包中不切外观');
    p.equip[item.slot] = id;
    eq(p.appearance, `outfit_${sect}_1`, `${sect} 装备直接读 appearance`);
    eq(resolvePlayerAtlas(p.appearance, key => fixture.textures.has(key)), variants[i], `${sect} 外观键映射`);
    changed(player, p.appearance, variants[i], `${sect} 换装`);
    eq(sync(player, p.appearance), false, `${sect} 重复同步无需重播`);
    p.save();
    const restored = Progress.load();
    eq(restored.appearance, p.appearance, `${sect} 读档恢复装备外观`);
    changed(fixture.sprite(), restored.appearance, variants[i], `${sect} 读档首个 sprite`);
    changed(fixture.sprite(BASE_PLAYER_ATLAS, 'idle', 2), restored.appearance, variants[i], `${sect} 换图新 sprite`);
  }
  p.equip = {};
  eq(p.appearance, undefined, '脱下外观装备立即清除 appearance');
  changed(player, p.appearance, BASE_PLAYER_ATLAS, '脱下宗袍');
  const fox = ITEMS.fox_robe;
  ok(fox?.slot, '旧狐裘装备存在');
  p.equip[fox.slot] = fox.id;
  eq(p.appearance, 'fox_robe', '旧狐裘兼容无 appearance 的物品 id');
  changed(player, p.appearance, foxAtlas, '穿旧狐裘');
  p.equip = { robe: '__unknown_item' };
  eq(p.appearance, undefined, '未知装备不报错且无外观');
  changed(player, p.appearance, BASE_PLAYER_ATLAS, '未知装备退回素体');
}

// 已转正外观也可能没加载成功；缺纹理、动作或动作中的任意一帧都回退。
{
  for (const appearance of sects.map(sect => `outfit_${sect}_1`)) {
    const fixture = new Fixture([BASE_PLAYER_ATLAS, foxAtlas]);
    const player = fixture.sprite(foxAtlas, 'attack', 2);
    changed(player, appearance, BASE_PLAYER_ATLAS, `${appearance} 缺图`);
    eq(sync(player, appearance), false, `${appearance} 缺图后重复同步不变`);
    eq(resolvePlayerAtlas(appearance, key => fixture.textures.has(key)), BASE_PLAYER_ATLAS, `${appearance} 缺图解析回退`);
  }
  const appearance = 'outfit_taixu_1', atlas = variants[0];
  const pending = new Fixture([BASE_PLAYER_ATLAS, foxAtlas, `pend_${atlas}`]);
  changed(pending.sprite(foxAtlas, 'walk', 2), appearance, BASE_PLAYER_ATLAS, '只有 pending 资源');
  for (const missing of ['animation', 'frame'] as const) {
    const fixture = new Fixture([BASE_PLAYER_ATLAS, foxAtlas, atlas]);
    if (missing === 'animation') fixture.animations.delete(`${atlas}_gather`);
    else fixture.textures.get(atlas)!.frames.delete(`${atlas}_walk_04`);
    changed(fixture.sprite(foxAtlas, 'attack', 2), appearance, BASE_PLAYER_ATLAS, `外观缺 ${missing}`);
  }
  const fixture = new Fixture([foxAtlas]);
  const player = fixture.sprite(foxAtlas, 'attack', 2);
  const before = animationState(player);
  eq(sync(player), false, '连素体也缺失时安全保留现状');
  eq(player.texture.key, foxAtlas, '素体缺失不会设置不存在的纹理');
  same(animationState(player), before, '素体缺失不影响动画状态');
}

// 真实 Phaser 暂停、停止、攻击中途和全部动作的当前帧均可无重播换装。
{
  const fixture = new Fixture([BASE_PLAYER_ATLAS, foxAtlas]);
  for (const action of PLAYER_ACTIONS) {
    const count = fixture.animations.get(`${BASE_PLAYER_ATLAS}_${action}`)!.frames.length;
    const player = fixture.sprite(BASE_PLAYER_ATLAS, action, count);
    player.anims.timeScale = action === 'walk' ? 2.2 : 0.85;
    player.anims.update(0, 13);
    changed(player, 'fox_robe', foxAtlas, `${action} 动作最后一帧`);
    changed(player, undefined, BASE_PLAYER_ATLAS, `${action} 原动作脱下`);
  }
  const paused = fixture.sprite(BASE_PLAYER_ATLAS, 'walk', 3);
  paused.anims.timeScale = 1.8;
  paused.anims.update(0, 17);
  paused.anims.pause();
  changed(paused, 'fox_robe', foxAtlas, '暂停中换装');
  eq(paused.anims.isPaused, true, '换装后仍暂停');
  paused.anims.update(100, 100);
  eq(paused.anims.currentFrame!.index, 3, '暂停中 update 不前进');
  paused.anims.resume();
  paused.anims.update(200, 70);
  eq(paused.anims.currentFrame!.textureKey, foxAtlas, '恢复后仍用外观动画帧');
  ok(paused.anims.currentFrame!.index !== 3, '恢复后继续从保留的计时前进');
  const stopped = fixture.sprite(BASE_PLAYER_ATLAS, 'attack', 2);
  stopped.anims.update(0, 11);
  stopped.anims.stop();
  changed(stopped, 'fox_robe', foxAtlas, '停止后换装');
  stopped.anims.update(100, 500);
  eq(stopped.anims.isPlaying, false, '停止状态不被换装重新启动');
  eq(stopped.anims.currentFrame!.index, 2, '停止后保持攻击中间帧');
}

// 未播放动画的新 sprite 立即切同名静态帧，未知静态帧安全退到 idle_01。
{
  const fixture = new Fixture([BASE_PLAYER_ATLAS, foxAtlas]);
  const player = fixture.sprite();
  player.setTexture(BASE_PLAYER_ATLAS, `${BASE_PLAYER_ATLAS}_sit_01`);
  changed(player, 'fox_robe', foxAtlas, '静态打坐帧');
  eq(player.frame.name, `${foxAtlas}_sit_01`, '静态帧按图集前缀映射');
  eq(player.anims.currentAnim, null, '静态换装不启动动画');
  player.frame = { name: `${foxAtlas}_unknown_01` } as Phaser.Textures.Frame;
  changed(player, undefined, BASE_PLAYER_ATLAS, '未知静态帧');
  eq(player.frame.name, `${BASE_PLAYER_ATLAS}_idle_01`, '未知静态帧回退明确的 idle_01');
}

// 纸娃娃规则：v2 本体（192 画布 / 0.5 缩放）上不叠画布更小的旧 96 外观，只显示本体；装备数据不变，同规格重画后自动接回。
{
  const v2 = { frameSize: 192, displayScale: 0.5 }, v1 = { frameSize: 96 };
  const fixture = new Fixture([BASE_PLAYER_ATLAS, ...variants, foxAtlas]);
  fixture.json.set(`${BASE_PLAYER_ATLAS}_anims`, v2);
  for (const key of [...variants, foxAtlas]) fixture.json.set(`${key}_anims`, v1);
  const player = fixture.sprite(BASE_PLAYER_ATLAS, 'walk', 2);
  for (const appearance of ['fox_robe', ...sects.map(sect => `outfit_${sect}_1`)]) {
    eq(sync(player, appearance), false, `${appearance} 旧 96 图层不叠到 v2 本体`);
    eq(player.texture.key, BASE_PLAYER_ATLAS, `${appearance} 只显示 v2 本体`);
  }
  const worn = fixture.sprite(foxAtlas, 'attack', 2);
  changed(worn, 'fox_robe', BASE_PLAYER_ATLAS, '已穿旧狐裘遇 v2 本体退回本体');
  fixture.json.set(`${foxAtlas}_anims`, { frameSize: [192, 192], displayScale: 0.5 });
  changed(player, 'fox_robe', foxAtlas, '狐裘重画成同规格后自动接回');
  // 本体回退旧 96 后，同一套被屏蔽的旧外观无需改装备或存档就恢复显示。
  fixture.json.set(`${BASE_PLAYER_ATLAS}_anims`, v1);
  for (const key of [...variants, foxAtlas]) fixture.json.set(`${key}_anims`, v1);
  const restored = fixture.sprite(BASE_PLAYER_ATLAS, 'walk', 2);
  for (const appearance of ['fox_robe', ...sects.map(sect => `outfit_${sect}_1`)]) {
    const key = `${BASE_PLAYER_ATLAS}__${appearance}`;
    changed(restored, appearance, key, `96 本体 + 96 ${appearance} 恢复显示`);
    eq(sync(restored, appearance), false, `${appearance} 恢复后重复同步不重播`);
    changed(fixture.sprite(BASE_PLAYER_ATLAS, 'idle', 1), appearance, key, `${appearance} 96 本体首帧恢复显示`);
  }
  fixture.json.set(`${variants[1]}_anims`, v2);
  changed(fixture.sprite(BASE_PLAYER_ATLAS, 'walk', 3), `outfit_${sects[1]}_1`, variants[1], '旧 96 本体 + 新 2x 外观照 E-1 并存');
}

console.log(`appearance tests ok: ${assertions} assertions`);
