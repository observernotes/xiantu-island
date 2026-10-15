import Phaser from 'phaser';
import { t } from './data';
import { HUD_FONT, INK, INK_60, PAPER, hudSpec, sliced } from './hud';

type Rect = [number, number, number, number];
type Slice = [number, number, number, number];
type State = 'normal' | 'hover' | 'pressed' | 'disabled';
type ButtonName = 'startOrAgain' | 'abandonOrContinue';
export type TalismanPanelAction = 'start' | 'again' | 'abandon' | 'continue' | 'close';
export interface TalismanPanelState {
  primary: 'start' | 'again' | 'abandon';
  secondary: 'abandon' | 'continue';
  primaryDisabled: boolean;
  secondaryDisabled: boolean;
  message: string;
  primaryLabel?: string;
  recipes?: { id: string; name: string; selected: boolean; disabled?: boolean }[];
  selectionDisabled?: boolean;
}
interface Layout {
  window: { size: [number, number]; image: string; nineSlice: Slice; close: [number, number]; closeImage: string };
  recipeList: { panel: Rect; panelImage: string };
  detail: { panel: Rect; panelImage: string; buttons: {
    image: string; nineSlice: Slice; startOrAgain: Rect; abandonOrContinue: Rect;
    abandonOrContinueImage: Record<State, string> & { nineSlice: Slice; textColor: { normal: string; disabled: string } };
  } };
}
type Background = Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
interface ButtonView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  state: State;
  views: { state: State; key: string; bg: Background; artUsed: 'art' | 'code' }[];
}
const textureKey = (image: string) => image.split('/').pop()!;
const label = (key: string, fallback: string) => { const value = t(key); return value === key ? fallback : value; };

/** UI-4 受控窗壳：只展示按钮状态、发出意图；预检、确认和结算由调用方负责。 */
export class TalismanPanel {
  private c?: Phaser.GameObjects.Container;
  private messageText?: Phaser.GameObjects.Text;
  private model: TalismanPanelState = this.defaults();
  private buttons: Partial<Record<ButtonName, ButtonView>> = {};
  private artUsed: Record<string, 'art' | 'code'> = {};
  private position = { x: 0, y: 0, width: 0, height: 0 };

  constructor(private scene: Phaser.Scene, private onAction: (action: TalismanPanelAction) => void, private onSelect?: (id: string) => void) {
    scene.input.keyboard?.on('keydown-ESC', this.onEscape, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.close();
      scene.input.keyboard?.off('keydown-ESC', this.onEscape, this);
    });
  }
  private defaults(): TalismanPanelState {
    return { primary: 'start', secondary: 'abandon', primaryDisabled: false, secondaryDisabled: false, message: '' };
  }
  isOpen() { return !!this.c; }
  open(state: Partial<TalismanPanelState> = {}) {
    this.model = { ...this.defaults(), ...state };
    this.render();
  }
  setState(state: Partial<TalismanPanelState>) {
    const before = JSON.stringify({ ...this.model, message: undefined });
    this.model = { ...this.model, ...state };
    if (!this.isOpen()) return;
    // Countdown changes must preserve an in-progress pointer press on the existing buttons.
    if (before === JSON.stringify({ ...this.model, message: undefined }) && this.messageText) this.messageText.setText(this.model.message);
    else this.render();
  }
  close() { this.c?.destroy(); this.c = undefined; this.buttons = {}; this.artUsed = {}; this.messageText = undefined; }
  private onEscape(event: KeyboardEvent) {
    if (this.isOpen() && !event.repeat) { event.preventDefault(); this.onAction('close'); }
  }
  private get layout() { return this.scene.cache.json.get('talisman_ui') as Layout | undefined; }
  private add<T extends Phaser.GameObjects.GameObject>(object: T): T {
    (object as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(object); return object;
  }
  private text(x: number, y: number, text: string, size = 14, color = INK) {
    return this.add(this.scene.add.text(x, y, text, { fontFamily: HUD_FONT, fontSize: `${size}px`, color }));
  }
  private background(key: string, rect: Rect, slice: Slice | undefined, fill: number, stroke: number): Background {
    const [x, y, w, h] = rect;
    if (slice && this.scene.textures.exists(key)) {
      this.artUsed[key] = 'art';
      const bg = this.scene.game.renderer.type === Phaser.WEBGL
        ? this.scene.add.nineslice(x, y, key, undefined, w, h, ...slice)
        : this.scene.add.image(x, y, key).setDisplaySize(w, h);
      return bg.setOrigin(0, 0).setScrollFactor(0);
    }
    this.artUsed[key] = 'code';
    return this.scene.add.rectangle(x, y, w, h, fill).setOrigin(0, 0).setStrokeStyle(1, stroke).setScrollFactor(0);
  }
  private box(image: string, rect: Rect, slice?: Slice) {
    const key = textureKey(image);
    if (slice) return this.add(this.background(key, rect, slice, 0xfaf2dc, 0x3b2a20));
    const art = sliced(this.scene, key, ...rect);
    if (art) { this.artUsed[key] = 'art'; return this.add(art); }
    return this.add(this.background(key, rect, undefined, 0xece0c4, 0x6b4b2a));
  }
  private button(name: ButtonName) {
    const B = this.layout!.detail.buttons, secondary = name === 'abandonOrContinue', S = B.abandonOrContinueImage;
    const [x, y, w, h] = B[name], slice = secondary ? S.nineSlice : B.nineSlice;
    const disabled = secondary ? this.model.secondaryDisabled : this.model.primaryDisabled;
    const action = secondary ? this.model.secondary : this.model.primary;
    const fallbacks = { start: '开始制符', again: '再来', abandon: '放弃画符', continue: '继续画符' };
    const container = this.add(this.scene.add.container(x, y).setSize(w, h).setName(`talisman-${name}`));
    const views = (['normal', 'hover', 'pressed', 'disabled'] as const).map(state => {
      const key = textureKey(secondary ? S[state] : B.image.replace(/\{[^}]+\}/, state));
      const fill = disabled || state === 'disabled' ? 0xd4cec0 : secondary ? 0xfaf2dc : 0xe5483a;
      const stroke = state === 'disabled' ? 0x8e867c : state === 'normal' ? 0x3b2a20 : 0xe5483a;
      const bg = this.background(key, [0, 0, w, h], slice, fill, stroke).setName(`talisman-bg:${state}`);
      container.add(bg);
      return { state, key, bg, artUsed: this.artUsed[key] };
    });
    const text = this.scene.add.text(w / 2, h / 2, (!secondary && this.model.primaryLabel) || label(`talisman.${action}`, fallbacks[action]), {
      fontFamily: HUD_FONT, fontSize: '14px', color: secondary ? disabled ? S.textColor.disabled : S.textColor.normal : PAPER,
    }).setOrigin(0.5).setScrollFactor(0).setName('talisman-button-label');
    container.add(text);
    const view: ButtonView = { container, label: text, state: disabled ? 'disabled' : 'normal', views };
    const paint = (state: State) => {
      view.state = state;
      views.forEach(v => v.bg.setVisible(v.state === state));
    };
    paint(view.state); this.buttons[name] = view;
    if (disabled) return;
    let pressed = false;
    container.setInteractive(new Phaser.Geom.Rectangle(0, 0, w, h), Phaser.Geom.Rectangle.Contains);
    container.input!.cursor = 'pointer';
    container.on('pointerover', () => paint(pressed ? 'pressed' : 'hover'));
    container.on('pointerout', () => { pressed = false; paint('normal'); });
    container.on('pointerdown', () => { pressed = true; paint('pressed'); });
    container.on('pointerupoutside', () => { pressed = false; paint('normal'); });
    container.on('pointerup', () => {
      const activate = pressed; pressed = false; paint('hover');
      if (activate) this.onAction(action);
    });
  }
  private render() {
    this.close();
    const L = this.layout;
    if (!L) return;
    const [width, height] = L.window.size;
    this.position = { x: (this.scene.scale.width - width) / 2, y: (this.scene.scale.height - height) / 2, width, height };
    this.c = this.scene.add.container(this.position.x, this.position.y).setDepth(234).setScrollFactor(0).setName('talisman-panel');
    this.add(this.scene.add.zone(-this.position.x, -this.position.y, this.scene.scale.width, this.scene.scale.height).setOrigin(0, 0).setInteractive());
    this.box(L.window.image, [0, 0, width, height], L.window.nineSlice);
    const [tw, th] = hudSpec(this.scene, 'ui_bestiary_title')?.size ?? [160, 28];
    this.box('bestiary/ui_bestiary_title', [(width - tw) / 2, -12, tw, th]);
    this.text(width / 2, -12 + th / 2, label('talisman.title', '制符'), 18).setOrigin(0.5);
    this.box(L.recipeList.panelImage, L.recipeList.panel);
    this.box(L.detail.panelImage, L.detail.panel);
    const [rx, ry, rw] = L.recipeList.panel;
    this.model.recipes?.forEach((recipe, index) => {
      const y = ry + 18 + index * 42;
      this.text(rx + 12, y, `${recipe.selected ? '› ' : ''}${recipe.name}`, 14, recipe.disabled ? INK_60 : INK)
        .setWordWrapWidth(rw - 20);
      if (!this.model.selectionDisabled) this.add(this.scene.add.zone(rx + 4, y - 5, rw - 8, 34).setOrigin(0, 0))
        .setInteractive({ useHandCursor: true }).on('pointerup', () => this.onSelect?.(recipe.id));
    });
    const [dx, dy, dw] = L.detail.panel;
    this.messageText = this.text(dx + 16, dy + 20, this.model.message, 14, INK_60).setWordWrapWidth(dw - 32);
    const [cx, cy] = L.window.close, key = textureKey(L.window.closeImage);
    this.artUsed[key] = this.scene.textures.exists(key) ? 'art' : 'code';
    const close = this.scene.textures.exists(key)
      ? this.add(this.scene.add.image(cx, cy, key).setOrigin(0, 0))
      : this.text(cx, cy, '×').setFixedSize(20, 20).setAlign('center').setBackgroundColor(PAPER);
    close.setName('talisman-close').setInteractive({ useHandCursor: true }).on('pointerup', () => this.onAction('close'));
    this.button('startOrAgain'); this.button('abandonOrContinue');
  }
  snapshot() {
    return { open: this.isOpen(), state: { ...this.model }, position: { ...this.position }, artUsed: { ...this.artUsed },
      buttons: Object.fromEntries(Object.entries(this.buttons).map(([name, view]) => {
        const current = view.views.find(v => v.state === view.state)!;
        const bg = current.bg, n = bg instanceof Phaser.GameObjects.NineSlice ? bg : undefined;
        return [name, { state: view.state, enabled: !!view.container.input?.enabled,
          rect: [view.container.x, view.container.y, view.container.width, view.container.height],
          label: view.label.text, textColor: view.label.style.color, key: current.key, artUsed: current.artUsed,
          background: { type: bg.type, texture: 'texture' in bg ? bg.texture.key : null,
            width: bg.width, height: bg.height, nineSlice: n ? [n.leftWidth, n.rightWidth, n.topHeight, n.bottomHeight] : null },
        }];
      })) };
  }
}
