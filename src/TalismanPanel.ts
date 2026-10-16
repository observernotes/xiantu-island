import Phaser from 'phaser';
import { ITEMS, t, type PillQuality } from './data';
import type { Progress } from './Progress';
import type { TalismanRules, TalismanView } from './Talisman';
import { HUD_FONT, INK, INK_60, PAPER, RED, hudSpec, sliced } from './hud';

type Rect = [number, number, number, number];
type Slice = [number, number, number, number];
type State = 'normal' | 'hover' | 'pressed' | 'disabled';
type ButtonName = 'startOrAgain' | 'abandonOrContinue' | 'close';
export type TalismanPanelAction = 'start' | 'again' | 'abandon' | 'continue' | 'close';
export interface TalismanPanelState {
  primary: 'start' | 'again' | 'abandon';
  secondary: 'abandon' | 'continue';
  primaryDisabled: boolean;
  secondaryDisabled: boolean;
  message: string;
  primaryLabel?: string;
  recipes?: { id: string; name: string; selected: boolean; disabled?: boolean; output?: string; type?: 'talisman' | 'grinding'; reason?: string }[];
  selectionDisabled?: boolean;
  view?: TalismanView;
  qualityMin?: TalismanRules['qualityMin'];
  confirming?: boolean;
  lifeSkill?: ReturnType<Progress['lifeSkillView']>;
}
type Point = [number, number];
interface Layout {
  window: { size: [number, number]; image: string; nineSlice: Slice; close: [number, number]; closeImage: string };
  sectInfo: { text: Point };
  recipeList: { panel: Rect; panelImage: string; row: Rect; rowGap: number; rowImages: Record<'normal' | 'selected' | 'locked', string>;
    rowSlices: Slice; inkTab: { image: string; rect: Rect; nineSlice: Slice } };
  detail: { panel: Rect; panelImage: string;
    output: { icon: Point; name: Point; qualityTag: Point };
    materials: { first: Point; gap: number };
    preview: { text: Point; width: number };
    paper: { image: string; rect: Rect; origin: Point; fxCenter: Point; fxScale: number; strokeAtlas: string; failureAtlas: string };
    sequence: { text: Point; width: number };
    stepBar: { frame: string; rect: Rect; fill: string; innerOffset: Point };
    strokeFeedback: { center: Point; icons: string[]; text: Point };
    buttons: {
    image: string; nineSlice: Slice; startOrAgain: Rect; abandonOrContinue: Rect;
    close: Rect;
    abandonOrContinueImage: Record<State, string> & { nineSlice: Slice; textColor: { normal: string; disabled: string } };
  } };
  quality: Record<PillQuality, string>;
}
type Background = Phaser.GameObjects.NineSlice | Phaser.GameObjects.Image | Phaser.GameObjects.Rectangle;
interface ButtonView {
  container: Phaser.GameObjects.Container;
  label: Phaser.GameObjects.Text;
  state: State;
  views: { state: State; key: string; bg: Background; artUsed: 'art' | 'code' }[];
}
const textureKey = (image: string) => image.split('/').pop()!;
const ARROWS = { up: '↑', down: '↓', left: '←', right: '→' };
// 布局 JSON 自身缺失时仍能开窗；专用坐标以美术 JSON 为准。
const FALLBACK_LAYOUT: Layout = {
  window: { size: [640, 400], image: 'ui_bestiary_window', nineSlice: [10, 10, 10, 10], close: [614, 6], closeImage: 'ui_bestiary_btn_close' },
  sectInfo: { text: [24, 30] },
  recipeList: { panel: [20, 52, 176, 326], panelImage: 'ui_bestiary_inset', row: [26, 60, 164, 48], rowGap: 8,
    rowImages: { normal: 'ui_talisman_card_normal', selected: 'ui_talisman_card_selected', locked: 'ui_talisman_card_locked' },
    rowSlices: [14, 6, 6, 6], inkTab: { image: 'ui_alchemy_btn_{normal,hover,pressed,disabled}', rect: [26, 294, 164, 28], nineSlice: [6, 6, 6, 6] } },
  detail: { panel: [206, 52, 414, 326], panelImage: 'ui_bestiary_inset', output: { icon: [222, 64], name: [262, 70], qualityTag: [314, 68] },
    materials: { first: [222, 122], gap: 54 }, preview: { text: [222, 190], width: 116 },
    paper: { image: 'ui_talisman_paper', rect: [350, 82, 128, 224], origin: [0, 0], fxCenter: [414, 194], fxScale: 2, strokeAtlas: 'fx_trial_talisman', failureAtlas: 'fx_talisman_draw' },
    sequence: { text: [488, 88], width: 116 }, stepBar: { frame: 'ui_talisman_step_bar_frame', rect: [350, 312, 128, 10], fill: 'ui_talisman_step_bar_fill', innerOffset: [3, 3] },
    strokeFeedback: { center: [488, 324], icons: ['icon_talisman_stroke_ok', 'icon_talisman_stroke_miss', 'icon_talisman_stroke_timeout'], text: [508, 324] },
    buttons: { image: 'ui_alchemy_btn_{normal,hover,pressed,disabled}', nineSlice: [6, 6, 6, 6], startOrAgain: [222, 346, 112, 28], abandonOrContinue: [342, 346, 112, 28], close: [470, 346, 112, 28],
      abandonOrContinueImage: { normal: 'ui_hud_dialog_option_normal', hover: 'ui_hud_dialog_option_selected', pressed: 'ui_hud_dialog_option_selected', disabled: 'ui_hud_dialog_option_disabled', nineSlice: [6, 6, 6, 6], textColor: { normal: '#3B2A20', disabled: '#8E867C' } } } },
  quality: { low: 'ui_talisman_quality_low', mid: 'ui_talisman_quality_mid', high: 'ui_talisman_quality_high', supreme: 'ui_talisman_quality_supreme' },
};

/** UI-4 受控面板：只消费视图并发出意图，预检、暂停和结算由场景负责。 */
export class TalismanPanel {
  private c?: Phaser.GameObjects.Container;
  private messageText?: Phaser.GameObjects.Text;
  private model: TalismanPanelState = this.defaults();
  private buttons: Partial<Record<ButtonName, ButtonView>> = {};
  private artUsed: Record<string, 'art' | 'code'> = {};
  private position = { x: 0, y: 0, width: 0, height: 0 };
  private presentation: Record<string, any> = {};
  private keys: Phaser.GameObjects.Rectangle[] = [];
  private progressText?: Phaser.GameObjects.Text;
  private timeText?: Phaser.GameObjects.Text;
  private feedbackText?: Phaser.GameObjects.Text;
  private feedbackIcon?: Phaser.GameObjects.GameObject;
  private barFill?: Background;
  private barMask?: Phaser.GameObjects.Graphics;
  private baseSprite?: Phaser.GameObjects.Sprite;
  private overlaySprite?: Phaser.GameObjects.Sprite;
  private codePaper?: Phaser.GameObjects.Graphics;
  private lastStroke = '';

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
    const before = this.structure();
    this.model = { ...this.model, ...state };
    if (!this.isOpen()) return;
    // 本笔倒计时、累计帧和提示局部更新，保留正在按下的按钮与一次性动画。
    if (before === this.structure()) this.updateDrawing(); else this.render();
  }
  private structure() {
    return JSON.stringify({ ...this.model, message: undefined, view: this.model.view ? { ...this.model.view, draw: undefined } : undefined });
  }
  close() {
    this.barFill?.clearMask(true);
    this.c?.destroy(); this.barMask?.destroy(); this.barMask = undefined;
    this.c = undefined; this.buttons = {}; this.artUsed = {}; this.messageText = undefined;
    this.presentation = {}; this.keys = []; this.progressText = this.timeText = this.feedbackText = undefined;
    this.barFill = this.baseSprite = this.overlaySprite = this.codePaper = undefined; this.feedbackIcon = undefined; this.lastStroke = '';
  }
  private onEscape(event: KeyboardEvent) {
    if (this.isOpen() && !event.repeat) { event.preventDefault(); this.onAction('close'); }
  }
  private get layout() { return (this.scene.cache.json.get('talisman_ui') as Layout | undefined) ?? FALLBACK_LAYOUT; }
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
    // 布局 JSON 缺失仍保留已加载的独立静图；只有缺图本身才退回代码画。
    if (this.scene.textures.exists(key)) {
      this.artUsed[key] = 'art';
      return this.add(this.scene.add.image(rect[0], rect[1], key).setOrigin(0).setDisplaySize(rect[2], rect[3]));
    }
    return this.add(this.background(key, rect, undefined, 0xece0c4, 0x6b4b2a));
  }
  private button(name: ButtonName) {
    const B = this.layout!.detail.buttons, secondary = name !== 'startOrAgain', S = B.abandonOrContinueImage;
    const [x, y, w, h] = B[name], slice = secondary ? S.nineSlice : B.nineSlice;
    const disabled = name === 'close' ? false : secondary ? this.model.secondaryDisabled : this.model.primaryDisabled;
    const action = name === 'close' ? 'close' : secondary ? this.model.secondary : this.model.primary;
    const container = this.add(this.scene.add.container(x, y).setSize(w, h).setName(`talisman-${name}`));
    const views = (['normal', 'hover', 'pressed', 'disabled'] as const).map(state => {
      const key = textureKey(secondary ? S[state] : B.image.replace(/\{[^}]+\}/, state));
      const fill = disabled || state === 'disabled' ? 0xd4cec0 : secondary ? 0xfaf2dc : 0xe5483a;
      const stroke = state === 'disabled' ? 0x8e867c : state === 'normal' ? 0x3b2a20 : 0xe5483a;
      const bg = this.background(key, [0, 0, w, h], slice, fill, stroke).setName(`talisman-bg:${state}`);
      container.add(bg);
      return { state, key, bg, artUsed: this.artUsed[key] };
    });
    const text = this.scene.add.text(w / 2, h / 2, (name === 'startOrAgain' && this.model.primaryLabel) || t(`talisman.${action}`), {
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
  private icon(key: string, x: number, y: number, size: number, glyph = '·') {
    if (this.scene.textures.exists(key)) {
      this.artUsed[key] = 'art';
      return this.add(this.scene.add.image(x, y, key).setOrigin(0, 0).setDisplaySize(size, size));
    }
    if (this.scene.textures.exists('icons_items') && this.scene.textures.get('icons_items').has(key)) {
      this.artUsed[key] = 'art';
      return this.add(this.scene.add.image(x, y, 'icons_items', key).setOrigin(0, 0).setDisplaySize(size, size));
    }
    this.artUsed[key] = 'code';
    const container = this.add(this.scene.add.container(x, y));
    container.add(this.scene.add.rectangle(0, 0, size, size, 0xe8d3a1).setOrigin(0).setStrokeStyle(1, 0x947c52));
    container.add(this.scene.add.text(size / 2, size / 2, glyph, { fontFamily: HUD_FONT, fontSize: `${Math.min(16, size)}px`, color: INK }).setOrigin(0.5));
    return container;
  }
  private item(id: string, x: number, y: number, size = 32) {
    const key = ITEMS[id]?.icon ?? `icon_${id}`;
    this.icon(key, x, y, size, (ITEMS[id]?.name ?? id).slice(0, 1)); return key;
  }
  private recipeRows() {
    const R = this.layout.recipeList;
    const rows: Record<string, unknown>[] = [];
    let index = 0;
    for (const recipe of this.model.recipes ?? []) {
      const ink = recipe.type === 'grinding';
      const rect: Rect = ink ? R.inkTab.rect : [R.row[0], R.row[1] + index++ * (R.row[3] + R.rowGap), R.row[2], R.row[3]];
      const [x, y, w, h] = rect;
      const key = textureKey(ink ? R.inkTab.image.replace(/\{[^}]+\}/, recipe.disabled ? 'disabled' : 'normal')
        : R.rowImages[recipe.disabled ? 'locked' : recipe.selected ? 'selected' : 'normal']);
      this.box(key, rect, ink ? R.inkTab.nineSlice : R.rowSlices);
      const icon = recipe.output && !ink ? this.item(recipe.output, x + 18, y + 8) : undefined;
      if (ink) this.text(x + w / 2, y + h / 2, t('talisman.ink_tab'), 14, PAPER).setOrigin(0.5);
      else {
        this.text(x + 58, y + 8, recipe.name, 14, recipe.disabled ? INK_60 : INK);
        const purpose = recipe.reason || (ITEMS[recipe.output ?? ''] as { desc?: string } | undefined)?.desc || '';
        this.text(x + 58, y + 28, purpose, 10, INK_60).setWordWrapWidth(w - 64, true).setCrop(0, 0, w - 64, 16);
      }
      if (!this.model.selectionDisabled) this.add(this.scene.add.zone(x, y, w, h).setOrigin(0, 0))
        .setInteractive({ useHandCursor: true }).on('pointerup', () => this.onSelect?.(recipe.id));
      rows.push({ id: recipe.id, rect, key, reason: recipe.reason, icon, selected: recipe.selected, locked: !!recipe.disabled });
    }
    this.presentation.recipes = rows;
    const [sx, sy, sw] = R.inkTab.rect;
    this.text(sx + 4, sy + 36, `${t('talisman.paper_source')}\n${t('talisman.ink_source')}`, 10, INK_60).setWordWrapWidth(sw - 8, true);
  }
  private details() {
    const view = this.model.view, D = this.layout.detail;
    const recipe = view?.selectedRecipe;
    if (!view || !recipe) {
      this.messageText = this.text(D.panel[0] + 16, D.panel[1] + 20, this.model.message, 14, INK_60).setWordWrapWidth(D.panel[2] - 32, true);
      return;
    }
    const result = view.attempt?.recipeId === recipe.id ? view.result : null;
    this.item(result?.success ? result.item : recipe.output, ...D.output.icon);
    this.text(...D.output.name, recipe.name, 14);
    if (result?.success && result.quality) {
      const key = this.layout.quality[result.quality], [qx, qy] = D.output.qualityTag;
      this.box(key, [qx, qy, 28, 22]);
      if (this.artUsed[textureKey(key)] === 'code') this.text(qx + 14, qy + 11, t(`alchemy.quality.${result.quality}`).slice(0, 1), 12).setOrigin(0.5);
    }
    const [mx, my] = D.materials.first;
    this.presentation.materials = view.check.materials.map((material, index) => {
      const x = mx + index * D.materials.gap, lack = material.have < material.need;
      const key = lack ? 'ui_talisman_slot_lack' : 'ui_talisman_slot_ok';
      const rect: Rect = [x, my, 40, 40]; this.box(key, rect);
      const icon = this.item(material.item, x + 4, my + 4);
      const mark = lack ? { x: x + 33.5, y: my + 33.5, scale: 0.6 } : undefined;
      if (mark) {
        const k = 'icon_talisman_lack';
        if (this.scene.textures.exists(k)) { this.artUsed[k] = 'art'; this.add(this.scene.add.image(mark.x, mark.y, k).setScale(mark.scale)); }
        else { this.artUsed[k] = 'code'; this.text(mark.x, mark.y, '×', 14, RED).setOrigin(0.5); }
      }
      this.text(x + 20, my + 44, `${material.have}/${material.need}`, 12, lack ? RED : INK).setOrigin(0.5, 0);
      // 名称和来源悬停可读；底部同时保留两种固定材料来源。
      const source = material.item === 'talisman_paper' ? t('talisman.paper_source') : material.item === 'spirit_ink' ? t('talisman.ink_source') : '';
      const tip = this.text(x, my - 24, `${t('talisman.material_count', { name: ITEMS[material.item]?.name ?? material.item, owned: material.have, need: material.need })}\n${source}${lack ? t('talisman.material_lack') : ''}`, 11)
        .setWordWrapWidth(190, true).setBackgroundColor(PAPER).setPadding(4).setDepth(1).setVisible(false);
      this.add(this.scene.add.zone(x, my, 40, 40).setOrigin(0).setInteractive())
        .on('pointerover', () => { this.c?.bringToTop(tip); tip.setVisible(true); }).on('pointerout', () => tip.setVisible(false));
      return { ...material, rect, key, lack, icon, mark };
    });
    const preview = [t('talisman.output_count', { count: recipe.outputCount })];
    if (recipe.type === 'talisman') {
      preview.push(t('talisman.rate', { rate: Math.round(view.rate * 100) }));
      for (const quality of ['low', 'mid', 'high', 'supreme'] as const) {
        const threshold = this.model.qualityMin?.[quality];
        if (threshold !== undefined) preview.push(t('talisman.quality_threshold', { quality: t(`alchemy.quality.${quality}`), rate: threshold * 100 }));
      }
    }
    preview.push(t('talisman.start_cost'));
    this.text(...D.preview.text, preview.join('\n'), 10, INK_60).setWordWrapWidth(D.preview.width, true).setLineSpacing(1);
    this.presentation.preview = { rate: view.rate, sectBonus: view.sectBonus, qualityMin: this.model.qualityMin, outputCount: recipe.outputCount, rect: [...D.preview.text, D.preview.width] };
    const [sx, sy] = this.layout.sectInfo.text;
    this.text(sx, sy, `${t('talisman.quality_cap', { quality: view.qualityCap ? t(`alchemy.quality.${view.qualityCap}`) : '—' })}  ${t('talisman.sect_bonus', { bonus: Math.round(view.sectBonus * 100) })}`, 11, INK_60);
    this.levelBar();
    const [qx, qy] = D.sequence.text;
    const strokes = recipe.draw?.strokes ?? [];
    strokes.forEach((direction, index) => {
      const x = qx + index % 3 * 36, y = qy + Math.floor(index / 3) * 35;
      this.keys.push(this.add(this.scene.add.rectangle(x, y, 30, 28, 0xece0c4).setOrigin(0).setStrokeStyle(1, 0x6b4b2a)));
      this.text(x + 15, y + 14, ARROWS[direction], 21).setOrigin(0.5);
    });
    this.progressText = this.text(qx, qy + 78, result ? t('talisman.completion', { rate: Math.round(result.completion * 100) }) : '', 11, INK_60).setWordWrapWidth(D.sequence.width, true);
    this.timeText = this.text(qx, qy + 143, '', 11, INK_60).setWordWrapWidth(D.sequence.width, true);
    this.messageText = this.text(qx, qy + 178, this.model.message, 11, result && !result.success ? RED : INK_60).setWordWrapWidth(D.sequence.width, true);
    this.presentation.sequence = { strokes, current: -1, rect: [...D.sequence.text, D.sequence.width] };
    const interrupted = view.state === 'interrupted' && view.attempt?.recipeId === recipe.id;
    this.presentation.result = result || interrupted ? { quality: result?.quality ?? null,
      key: result?.quality ? this.layout.quality[result.quality] : null, reason: result?.reason ?? (view.state === 'interrupted' ? 'interrupted' : undefined),
      pending: !!view.pendingOutput, count: result?.count ?? 0, success: result?.success ?? false } : null;
    if (result?.success) {
      this.progressText.setText(`${t('talisman.success', { quality: result.quality ? t(`alchemy.quality.${result.quality}`) : '', name: ITEMS[result.item]?.name ?? result.item, count: result.count })}\n${t('talisman.completion', { rate: Math.round(result.completion * 100) })}`);
    }
    this.paper();
    if (view.state === 'drawing') {
      const G = D.stepBar, [x, y, w, h] = G.rect, [ix, iy] = G.innerOffset;
      this.box(G.frame, G.rect, [4, 4, 3, 3]);
      // 填充先切至整宽，再裁剪剩余区域，避免缩窄端帽。
      this.barFill = this.box(G.fill, [x + ix, y + iy, w - ix * 2, h - iy * 2], [2, 2, 0, 0]);
      this.barMask = this.scene.add.graphics().setPosition(this.position.x + x + ix, this.position.y + y + iy).setVisible(false).setScrollFactor(0);
      this.barFill.setMask(this.barMask.createGeometryMask());
      this.feedbackText = this.text(...D.strokeFeedback.text, '', 10, INK_60).setOrigin(0, 0.5).setWordWrapWidth(98, true);
    }
  }
  private levelBar() {
    const skill = this.model.lifeSkill;
    if (!skill?.enabled || !skill.available) return;
    // 制符等级条专用坐标待美术补 JSON；暂放 sectInfo 右侧，仅读取 Progress 视图。
    const [sx, sy] = this.layout.sectInfo.text, x = sx + 390, y = sy;
    this.text(x, y, `${t('talisman.title')} Lv.${skill.level}/${skill.maxLevel}  ${skill.exp}/${skill.expToNext}`, 10, INK_60);
    this.add(this.scene.add.rectangle(x, y + 15, 180, 4, 0xd4cec0).setOrigin(0));
    const ratio = skill.maxed ? 1 : skill.expToNext > 0 ? Math.min(1, skill.exp / skill.expToNext) : 0;
    this.add(this.scene.add.rectangle(x, y + 15, 180 * ratio, 4, 0x458f8b).setOrigin(0));
    this.presentation.lifeSkill = { ...skill, ratio, rect: [x, y, 180, 19] };
  }
  private hasFrame(atlas: string, frame: string) {
    return this.scene.textures.exists(atlas) && this.scene.textures.get(atlas).has(frame);
  }
  private effect(atlas: string, anim: string) {
    const P = this.layout.detail.paper;
    if (!this.hasFrame(atlas, `${anim}_01`) || !this.scene.anims.exists(anim)) return undefined;
    const sprite = this.add(this.scene.add.sprite(...P.fxCenter, atlas, `${anim}_01`).setOrigin(0.5).setScale(P.fxScale));
    sprite.play(anim); return sprite;
  }
  private paper() {
    const view = this.model.view!, recipe = view.selectedRecipe!, P = this.layout.detail.paper;
    const result = view.attempt?.recipeId === recipe.id ? view.result : null;
    const mode = recipe.type === 'grinding' ? 'ink' : view.state === 'drawing' ? 'drawing' : result?.success ? 'done'
      : result && !result.success ? 'craft_fail' : view.state === 'interrupted' && view.attempt?.recipeId === recipe.id ? 'interrupted' : 'preview';
    this.presentation.paper = { mode, rect: P.rect, fxCenter: P.fxCenter, fxScale: P.fxScale, baseFrame: null, overlay: null };
    if (mode === 'ink') { this.item(recipe.output, P.fxCenter[0] - 24, P.fxCenter[1] - 24, 48); return; }
    if (mode === 'preview' || mode === 'interrupted') { this.box(P.image, P.rect); return; }
    if (mode === 'craft_fail') {
      this.presentation.paper.overlay = 'craft_fail';
      const sprite = this.effect(P.failureAtlas, `${P.failureAtlas}_craft_fail`);
      if (sprite) sprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => sprite.destroy());
      else { this.artUsed[P.failureAtlas] = 'code'; this.text(...P.fxCenter, '×', 44, RED).setOrigin(0.5); }
      return;
    }
    const frame = mode === 'done' ? `${P.strokeAtlas}_done_01` : `${P.strokeAtlas}_blank_01`;
    if (this.hasFrame(P.strokeAtlas, frame)) {
      this.artUsed[P.strokeAtlas] = 'art';
      this.baseSprite = this.add(this.scene.add.sprite(...P.fxCenter, P.strokeAtlas, frame).setOrigin(0.5).setScale(P.fxScale));
      if (mode === 'done' && this.scene.anims.exists(`${P.strokeAtlas}_done`)) this.baseSprite.play(`${P.strokeAtlas}_done`);
    } else { this.artUsed[P.strokeAtlas] = 'code'; this.codePaper = this.add(this.scene.add.graphics()); }
    this.presentation.paper.baseFrame = frame;
    if (mode === 'done' && this.codePaper) this.paintCodePaper(result?.correct ?? 0);
  }
  private paintCodePaper(correct: number) {
    const P = this.layout.detail.paper, [x, y, w, h] = P.rect, g = this.codePaper!;
    g.clear().fillStyle(0xe8c779).fillRect(x, y, w, h).lineStyle(2, 0xa6462f).strokeRect(x + 5, y + 5, w - 10, h - 10);
    g.lineStyle(3, 0x9e3625);
    for (let i = 0; i < correct; i++) g.lineBetween(x + 25 + i % 2 * 15, y + 35 + i * 25, x + w - 25, y + 45 + i * 25);
  }
  private updateDrawing() {
    this.messageText?.setText(this.model.confirming ? '' : this.model.message);
    const view = this.model.view, draw = view?.draw;
    if (!draw || view?.state !== 'drawing') return;
    const D = this.layout.detail, P = D.paper;
    this.presentation.sequence.current = draw.current;
    this.keys.forEach((key, index) => key.setFillStyle(index === draw.current ? 0xe7bc69 : index < draw.current ? 0xd5d4bc : 0xece0c4)
      .setStrokeStyle(index === draw.current ? 2 : 1, index === draw.current ? 0xb2462f : 0x6b4b2a));
    const wrongLabel = t('talisman.stroke_wrong').split(/[，。]/)[0], timeoutLabel = t('talisman.stroke_timeout').split(/[，。]/)[0];
    this.progressText?.setText(`${t('talisman.stroke_progress', { current: Math.min(draw.current + 1, draw.total), total: draw.total, correct: draw.correct })}\n${t('talisman.completion', { rate: Math.round(draw.completion * 100) })}\n${wrongLabel} ${draw.wrong}\n${timeoutLabel} ${draw.timeouts}`);
    this.timeText?.setText(t('talisman.step_time', { seconds: (Math.ceil((draw.remainingMs ?? 0) / 100) / 10).toFixed(1) }));
    const frame = draw.correct ? `${P.strokeAtlas}_stroke_${String(draw.correct).padStart(2, '0')}` : `${P.strokeAtlas}_blank_01`;
    if (this.baseSprite && this.hasFrame(P.strokeAtlas, frame) && this.baseSprite.frame.name !== frame) this.baseSprite.setFrame(frame);
    if (this.codePaper) this.paintCodePaper(draw.correct);
    this.presentation.paper.baseFrame = frame;
    const G = D.stepBar, ratio = Math.max(0, Math.min(1, (draw.remainingMs ?? 0) / (view.selectedRecipe?.draw?.stepTimeMs ?? 1)));
    this.barMask?.clear().fillStyle(0xffffff).fillRect(0, 0, (G.rect[2] - G.innerOffset[0] * 2) * ratio, G.rect[3] - G.innerOffset[1] * 2);
    this.presentation.stepBar = { ratio, rect: G.rect, remainingMs: draw.remainingMs };
    const token = `${view.attempt?.attemptId}:${draw.current}:${draw.lastOutcome}`;
    if (token === this.lastStroke) return;
    this.lastStroke = token;
    this.feedbackIcon?.destroy(); this.feedbackIcon = undefined; this.overlaySprite?.destroy(); this.overlaySprite = undefined;
    this.presentation.paper.overlay = null;
    const outcome = draw.lastOutcome;
    this.presentation.feedback = { outcome };
    if (!outcome) { this.feedbackText?.setText(''); return; }
    const index = outcome === 'correct' ? 0 : outcome === 'wrong' ? 1 : 2;
    const key = D.strokeFeedback.icons[index], [fx, fy] = D.strokeFeedback.center;
    this.feedbackIcon = this.icon(key, fx - 8, fy - 8, 16, ['✓', '×', '⌛'][index]);
    this.feedbackText?.setText(t(`talisman.${['stroke_ok', 'stroke_wrong', 'stroke_timeout'][index]}`));
    if (outcome !== 'correct') {
      const name = outcome === 'wrong' ? 'miss' : 'timeout';
      this.presentation.paper.overlay = name;
      this.overlaySprite = this.effect(P.failureAtlas, `${P.failureAtlas}_${name}`);
      if (this.overlaySprite) this.overlaySprite.once(Phaser.Animations.Events.ANIMATION_COMPLETE, () => {
        this.overlaySprite?.destroy(); this.overlaySprite = undefined; this.presentation.paper.overlay = null;
      });
      else {
        this.artUsed[P.failureAtlas] = 'code';
        const flash = this.text(...P.fxCenter, name === 'miss' ? '×' : '⌛', 34, name === 'miss' ? RED : INK_60).setOrigin(0.5);
        this.scene.tweens.add({ targets: flash, alpha: 0, duration: 350, onComplete: () => flash.destroy() });
      }
    }
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
    this.text(width / 2, -12 + th / 2, t('talisman.title'), 18).setOrigin(0.5);
    this.box(L.recipeList.panelImage, L.recipeList.panel);
    this.box(L.detail.panelImage, L.detail.panel);
    this.recipeRows(); this.details(); this.updateDrawing();
    if (this.model.confirming) {
      this.add(this.scene.add.rectangle(20, 52, 600, 286, 0xfaf2dc, 0.96).setOrigin(0).setStrokeStyle(1, 0x6b4b2a).setInteractive());
      this.text(width / 2, 185, t('talisman.abandon_confirm'), 16).setOrigin(0.5).setWordWrapWidth(340, true);
    }
    const [cx, cy] = L.window.close, key = textureKey(L.window.closeImage);
    this.artUsed[key] = this.scene.textures.exists(key) ? 'art' : 'code';
    const close = this.scene.textures.exists(key)
      ? this.add(this.scene.add.image(cx, cy, key).setOrigin(0, 0))
      : this.text(cx, cy, '×').setFixedSize(20, 20).setAlign('center').setBackgroundColor(PAPER);
    close.setName('talisman-close').setInteractive({ useHandCursor: true }).on('pointerup', () => this.onAction('close'));
    this.button('startOrAgain'); this.button('abandonOrContinue');
    if (this.model.view && !this.model.confirming) this.button('close');
  }
  snapshot() {
    return { open: this.isOpen(), state: { ...this.model }, position: { ...this.position }, artUsed: { ...this.artUsed }, presentation: this.presentation,
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
