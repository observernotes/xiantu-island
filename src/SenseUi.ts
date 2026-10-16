import Phaser from 'phaser';
import { REALMS, SENSE, t } from './data';
import { featureEnabled } from './features';
import { HUD_FONT } from './hud';
import type { MonsterIntel, SenseHit, SensePreview, SenseScanResult, SenseScanSuccess } from './Sense';
import type { GameScene } from './scenes/GameScene';

type Source = 'key' | 'button';
type IntelIdentity = Pick<MonsterIntel, 'instanceId' | 'id'>;
type ScanEvent = SenseScanSuccess & { source: Source; highlightMs: number };
type BlockEvent = Extract<SenseScanResult, { ok: false }> & { source: Source };
type BoundedObject = Phaser.GameObjects.GameObject & { getBounds(): Phaser.Geom.Rectangle };
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
let sequence = 0;

/** 只负责入口、键帽和提交后的表现；不参与判定、扣费、显形或碰撞。 */
export class SenseUi {
  private button?: Phaser.GameObjects.Text;
  private hint?: Phaser.GameObjects.Text;
  private key?: Phaser.Input.Keyboard.Key;
  private keyCode?: number;
  private ownsKey = false;
  private buttonPointer?: number;
  private operations: Partial<Record<Source, string>> = {};
  private readonly fx = new Set<Phaser.GameObjects.Sprite | Phaser.GameObjects.Graphics>();
  private tutorialShown = false;

  constructor(private readonly scene: GameScene, private readonly busy: () => boolean,
    private readonly isViewingIntel: (intel: IntelIdentity) => boolean = () => false) {
    scene.events.on('sense:scan', this.onScan, this);
    scene.events.on('sense:blocked', this.onBlocked, this);
    scene.events.on('sense:intel-expired', this.onIntelExpired, this);
    scene.input.on('pointerup', this.releaseButton, this);
    scene.input.on('pointerupoutside', this.releaseButton, this);
    scene.game.events.on(Phaser.Core.Events.BLUR, this.onBlur, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.refresh();
  }

  keyName(): string | undefined {
    const code = this.scene.inputBindings.keyCode('spirit_scan');
    if (code === undefined) return;
    if (code >= 48 && code <= 90) return String.fromCharCode(code);
    return Object.entries(Phaser.Input.Keyboard.KeyCodes).find(([, value]) => value === code)?.[0] ?? String(code);
  }

  keyHint(): string {
    const key = this.keyName();
    return key ? t('sense.ui.key_hint', { key }) : t('sense.ui.no_binding');
  }

  blockText(preview: SensePreview, blockKey = preview.blockKey): string {
    const vars: Record<string, string | number> = {};
    if (finite(preview.cooldownRemainingMs)) vars.seconds = Math.ceil(preview.cooldownRemainingMs / 1000);
    const realm = REALMS.find(realm => realm.id === SENSE.unlock.realmMin)?.name;
    if (realm) vars.realm = realm;
    return t(blockKey ?? 'sense.block.unavailable', vars);
  }

  /** 每帧都消费边沿，包括模态和关态；GameScene 只在非模态路径提交本帧的按下。 */
  update(): boolean {
    this.refresh();
    const code = this.scene.inputBindings.keyCode('spirit_scan');
    if (code !== this.keyCode) {
      this.releaseKey();
      this.keyCode = code;
      const keyboard = this.scene.input.keyboard;
      if (keyboard && code !== undefined) {
        this.ownsKey = !keyboard.keys[code];
        this.key = keyboard.addKey(code, false);
      }
      delete this.operations.key;
    }
    if (!this.key) return false;
    const down = Phaser.Input.Keyboard.JustDown(this.key);
    if (!this.key.isDown) delete this.operations.key;
    if (down) this.operations.key = this.newOperation();
    return down && featureEnabled('spiritScan');
  }

  /** 同一按下期间显式重试沿用 scanId；松开后的下一次按下才创建新标识。 */
  requestScan(source: Source): SenseScanResult | undefined {
    if (!featureEnabled('spiritScan')) return;
    const scanId = this.operations[source] ??= this.newOperation();
    return this.scene.sense.requestScan(source, scanId);
  }

  private newOperation() { return `sense-ui-${Date.now()}-${++sequence}`; }
  private releaseButton(pointer?: Phaser.Input.Pointer) {
    if (pointer && (pointer.id !== this.buttonPointer || pointer.leftButtonDown())) return;
    this.buttonPointer = undefined; delete this.operations.button;
  }
  private onBlur() { this.releaseButton(); }
  private releaseKey() {
    if (this.ownsKey && this.key) this.scene.input.keyboard?.removeKey(this.key, true);
    this.key = undefined; this.ownsKey = false;
  }

  refresh() {
    if (!featureEnabled('spiritScan')) {
      this.button?.destroy(); this.hint?.destroy();
      this.button = this.hint = undefined;
      this.releaseButton(); this.operations = {};
      this.clearFx();
      return;
    }
    if (!this.button) {
      // 左下状态区右侧的空隙；避开 A–W、K/P 与右下葫芦，也适用于缺 HUD 素材的回退布局。
      this.button = this.scene.add.text(430, 608, t('sense.ui.action'), {
        fontFamily: HUD_FONT, fontSize: '14px', color: '#E8F6FF', backgroundColor: '#244C68', padding: { x: 12, y: 7 },
      }).setScrollFactor(0).setDepth(104).setName('sense-scan-button');
      this.button.on('pointerdown', (pointer: Phaser.Input.Pointer) => {
        if (pointer.button !== 0 || !pointer.leftButtonDown() || this.buttonPointer !== undefined || !featureEnabled('spiritScan')) return;
        this.buttonPointer = pointer.id;
        this.operations.button = this.newOperation();
        // 在事件时再读真实 busy，避免上一帧按钮可点、同帧对话已打开的竞态。
        if (this.busy()) return;
        this.requestScan('button');
      });
      this.hint = this.scene.add.text(430, 646, '', { fontFamily: HUD_FONT, fontSize: '12px', color: '#D8EEFF',
        stroke: '#1D2A3A', strokeThickness: 3, wordWrap: { width: 350 } })
        .setScrollFactor(0).setDepth(104).setName('sense-scan-key-hint');
    }
    const busy = this.busy();
    if (busy) this.button.disableInteractive();
    else this.button.setInteractive({ useHandCursor: true });
    this.button.setAlpha(busy ? 0.45 : 1);
    this.hint!.setText(this.keyHint());
  }

  private onBlocked(result: BlockEvent) {
    if (!featureEnabled('spiritScan')) return;
    this.scene.log(this.blockText(this.scene.sense.preview(), result.blockKey), '#FFB0B0');
  }

  private onScan(result: ScanEvent) {
    if (!featureEnabled('spiritScan') || result.instanceId && result.instanceId !== this.scene.map.id) return;
    this.showTutorial();
    this.scene.log(t(result.resultKey, { count: result.count }), '#9FD8FF');
    if (result.faint && result.result !== 'faint') this.scene.log(t('sense.result.faint'), '#9FD8FF');
    if (result.center && finite(result.center.x) && finite(result.center.y) && finite(result.radius) && result.radius > 0)
      this.playFx(SENSE.visual.waveSprite, SENSE.visual.waveAnim, result.center.x, result.center.y, result.radius / 120);
    for (const hit of result.hits) {
      if (!hit.newlyRevealed || !finite(hit.x) || !finite(hit.y)) continue;
      const bounds = this.hitBounds(hit);
      this.playFx(SENSE.visual.revealSprite, SENSE.visual.revealAnim, bounds.centerX, bounds.centerY);
      if (finite(result.highlightMs) && result.highlightMs > 0) this.highlight(hit, bounds, result.highlightMs);
    }
  }

  private onIntelExpired(intel: IntelIdentity) {
    if (featureEnabled('spiritScan') && this.isViewingIntel(intel)) this.scene.log(t('sense.monster.expired'), '#9FD8FF');
  }

  private showTutorial() {
    if (this.tutorialShown || this.scene.prog.senseState?.tutorialSeen || !this.scene.sense.preview().unlocked) return;
    const realm = REALMS.find(realm => realm.id === SENSE.unlock.realmMin)?.name;
    const key = this.keyName();
    this.scene.log(`${t('sense.unlock.notice', realm ? { realm } : {})} ${key ? t('sense.unlock.tutorial', { key }) : t('sense.ui.no_binding')}`, '#9FD8FF');
    this.tutorialShown = true;
    this.scene.sense.markTutorialSeen();
  }

  private playFx(textureKey: string, animationKey: string, x: number, y: number, scale = 1) {
    const scene = this.scene;
    if (!scene.textures.exists(textureKey) || !scene.anims.exists(animationKey)) return;
    const animation = scene.anims.get(animationKey), texture = scene.textures.get(textureKey);
    if (!animation.frames.length || animation.frames.some(frame => frame.textureKey !== textureKey || !texture.has(String(frame.textureFrame)))) return;
    const sprite = scene.add.sprite(x, y, textureKey, animation.frames[0].textureFrame)
      .setOrigin(0.5, 0.5).setScale(scale).setDepth(12).setName(textureKey).setBlendMode(Phaser.BlendModes.NORMAL);
    this.fx.add(sprite);
    sprite.once(Phaser.GameObjects.Events.DESTROY, () => this.fx.delete(sprite));
    sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
    sprite.play(animationKey);
  }

  private hitBounds(hit: SenseHit): Phaser.Geom.Rectangle {
    const scene = this.scene, hidden = scene.map.hidden.find(hidden => hidden.object.name === hit.id);
    let object: BoundedObject | undefined;
    if (hit.kind === 'platform') object = scene.senseMap.platformVisual(hit.id)?.object;
    else if (hidden?.target) object = scene.children.getByName(`${hit.kind === 'chest' ? 'chest' : 'portal'}:${hidden.target.name}`) as BoundedObject | undefined;
    // 原生对象有脚底 origin，必须取画面中心；无本体的所属系统点位只在已公开 hit 周围表现。
    return object?.getBounds() ?? new Phaser.Geom.Rectangle(hit.x - 16, hit.y - 16, 32, 32);
  }

  private highlight(hit: SenseHit, bounds: Phaser.Geom.Rectangle, duration: number) {
    const outline = this.scene.add.graphics().setDepth(11).setAlpha(0.6).setName(`sense-highlight:${hit.id}`);
    outline.lineStyle(2, 0x6EC6FF).strokeRect(bounds.x - 1, bounds.y - 1, bounds.width + 2, bounds.height + 2);
    this.fx.add(outline);
    const tween = this.scene.tweens.add({ targets: outline, alpha: 1, duration: 600, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
    const timer = this.scene.time.delayedCall(duration, () => outline.destroy());
    outline.once(Phaser.GameObjects.Events.DESTROY, () => { tween.remove(); timer.remove(false); this.fx.delete(outline); });
  }

  private clearFx() { for (const object of this.fx) object.destroy(); this.fx.clear(); }

  destroy() {
    this.scene.events.off('sense:scan', this.onScan, this);
    this.scene.events.off('sense:blocked', this.onBlocked, this);
    this.scene.events.off('sense:intel-expired', this.onIntelExpired, this);
    this.scene.events.off(Phaser.Scenes.Events.SHUTDOWN, this.destroy, this);
    this.scene.input.off('pointerup', this.releaseButton, this);
    this.scene.input.off('pointerupoutside', this.releaseButton, this);
    this.scene.game.events.off(Phaser.Core.Events.BLUR, this.onBlur, this);
    this.button?.destroy(); this.hint?.destroy(); this.button = this.hint = undefined;
    this.releaseButton(); this.releaseKey(); this.keyCode = undefined; this.operations = {}; this.clearFx();
  }
}
