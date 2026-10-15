import Phaser from 'phaser';
import { ITEMS, t } from '../data';
import { TalismanPanel, type TalismanPanelAction } from '../TalismanPanel';
import { TalismanSystem, type TalismanDirection } from '../Talisman';
import type { GameScene } from './GameScene';

const DIRECTIONS: Record<string, TalismanDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const ARROWS: Record<string, string> = { up: '↑', down: '↓', left: '←', right: '→' };
const qualities: Record<string, string> = { low: '下品', mid: '中品', high: '上品', supreme: '极品' };

/** 正式画符独立场景。地图、物理和人物输入停在原场景，现实时间增益继续到期。 */
export class TalismanScene extends Phaser.Scene {
  private owner!: GameScene;
  private system!: TalismanSystem;
  private panel!: TalismanPanel;
  private selected = '';
  private held = new Set<TalismanDirection>();
  private edges = new Map<TalismanDirection, number>();
  private frame = 0;
  private confirming = false;
  private exitAfterAbandon = false;
  private blurred = false;
  private pauseReasons = new Set<string>();
  private fingerprint = '';
  constructor() { super('talisman-craft-ui'); }
  create(data: { owner: GameScene; system: TalismanSystem; recipeId?: string; initialHeld?: TalismanDirection[] }) {
    this.owner = data.owner; this.system = data.system;
    this.selected = data.recipeId ?? this.system.view().recipes[0]?.id ?? '';
    this.held.clear(); this.edges.clear(); this.frame = 0; this.confirming = false; this.blurred = false; this.pauseReasons.clear(); this.fingerprint = '';
    for (const direction of data.initialHeld ?? []) this.held.add(direction);
    this.panel = new TalismanPanel(this, action => this.action(action), id => this.select(id));
    this.input.keyboard?.on('keydown', this.down, this);
    this.input.keyboard?.on('keyup', this.up, this);
    this.game.events.on(Phaser.Core.Events.BLUR, this.blur, this);
    this.game.events.on(Phaser.Core.Events.FOCUS, this.focus, this);
    this.game.events.on(Phaser.Core.Events.PAUSE, this.globalPause, this);
    this.game.events.on(Phaser.Core.Events.RESUME, this.globalResume, this);
    this.events.on(Phaser.Scenes.Events.PAUSE, this.scenePause, this);
    this.events.on(Phaser.Scenes.Events.RESUME, this.sceneResume, this);
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.input.keyboard?.off('keydown', this.down, this); this.input.keyboard?.off('keyup', this.up, this);
      this.game.events.off(Phaser.Core.Events.BLUR, this.blur, this); this.game.events.off(Phaser.Core.Events.FOCUS, this.focus, this);
      this.game.events.off(Phaser.Core.Events.PAUSE, this.globalPause, this); this.game.events.off(Phaser.Core.Events.RESUME, this.globalResume, this);
      this.events.off(Phaser.Scenes.Events.PAUSE, this.scenePause, this); this.events.off(Phaser.Scenes.Events.RESUME, this.sceneResume, this);
      this.panel.close();
      this.owner.input.keyboard?.resetKeys();
      if (this.owner.input.keyboard) this.owner.input.keyboard.enabled = true;
      this.owner.physics.resume(); this.scene.resume('game');
    });
    this.panel.open(); this.refresh(true);
  }
  private down(event: KeyboardEvent) {
    const direction = DIRECTIONS[event.code];
    if (!direction) return;
    event.preventDefault();
    if (event.repeat) { this.held.add(direction); return; }
    if (this.held.has(direction)) return;
    this.held.add(direction);
    if (this.pauseReasons.size) return;
    // event.timeStamp shares performance.now's time origin. Preserve the event instant at a deadline.
    const at = event.timeStamp > 1e12 ? event.timeStamp - performance.timeOrigin : event.timeStamp;
    this.edges.set(direction, at);
  }
  private up(event: KeyboardEvent) {
    const direction = DIRECTIONS[event.code];
    if (direction) { event.preventDefault(); this.held.delete(direction); }
  }
  private pauseFor(reason: string) {
    if (!this.pauseReasons.size) this.system.pause(performance.now());
    this.pauseReasons.add(reason); this.edges.clear(); this.refresh(true);
  }
  private resumeFor(reason: string) {
    this.pauseReasons.delete(reason); this.edges.clear();
    if (!this.pauseReasons.size) this.system.resume(performance.now());
    this.refresh(true);
  }
  private globalPause() { this.pauseFor('game'); }
  private globalResume() { this.resumeFor('game'); }
  private scenePause() { this.pauseFor('scene'); }
  private sceneResume() { this.resumeFor('scene'); }
  private blur() { this.blurred = true; this.pauseFor('blur'); }
  private focus() {
    this.blurred = false; this.edges.clear(); this.input.keyboard?.resetKeys();
    this.resumeFor('blur');
  }
  select(id: string) {
    if (this.system.view(this.selected).state === 'drawing' || this.confirming) return false;
    if (!this.system.view().recipes.some(recipe => recipe.id === id)) return false;
    this.selected = id; this.refresh(true); return true;
  }
  action(action: TalismanPanelAction) {
    const drawing = this.system.view(this.selected).state === 'drawing';
    if (action === 'continue') {
      this.confirming = false; this.edges.clear();
      this.resumeFor('confirm');
    } else if (action === 'abandon' && this.confirming) {
      if (!this.system.abandon()) return;
      this.confirming = false; this.resumeFor('confirm');
      if (this.exitAfterAbandon) { this.finish(); return; }
    } else if ((action === 'abandon' || action === 'close') && drawing) {
      this.confirming = true; this.exitAfterAbandon = action === 'close'; this.pauseFor('confirm');
    } else if (action === 'close') { this.finish(); return; }
    else if (action === 'start' || action === 'again') {
      if (this.pauseReasons.size) return;
      const recipe = this.system.view(this.selected).selectedRecipe;
      if (recipe?.type === 'grinding') this.system.grind(this.selected);
      else this.system.start(this.selected, performance.now());
      this.edges.clear();
    }
    this.refresh(true);
  }
  private finish() { this.scene.stop(); }
  update() {
    const time = performance.now();
    if (!this.pauseReasons.size) {
      const down = [...new Set([...this.held, ...this.edges.keys()])];
      const eventTime = this.edges.size ? Math.min(...this.edges.values()) : time;
      this.system.input(down, eventTime, ++this.frame);
      this.system.advance(time, this.frame);
    }
    this.edges.clear(); this.system.claimPending(); this.refresh();
  }
  snapshot() { return { ...this.panel.snapshot(), selectedRecipeId: this.selected, confirming: this.confirming, view: this.system.view(this.selected) }; }
  private refresh(force = false) {
    const view = this.system.view(this.selected), draw = view.draw, recipe = view.selectedRecipe;
    const showResult = view.attempt?.recipeId === this.selected ? view.result : null;
    const message: string[] = [];
    if (this.confirming) message.push(t('talisman.abandon_confirm'));
    else if (draw && view.state === 'drawing') {
      message.push(draw.paused ? t('talisman.paused') : draw.waitingRelease ? t('talisman.release_keys') : t('talisman.draw_prompt'));
      message.push(draw.strokes.map((direction, index) => `${index === draw.current ? '【' : ''}${ARROWS[direction]}${index === draw.current ? '】' : ''}`).join(' '));
      message.push(t('talisman.stroke_progress', { current: Math.min(draw.current + 1, draw.strokes.length), total: draw.strokes.length, correct: draw.correct }));
      message.push(`错误 ${draw.wrong} / 超时 ${draw.timeouts}`);
      message.push(t('talisman.completion', { rate: Math.round(draw.completion * 100) }));
      message.push(t('talisman.step_time', { seconds: (Math.ceil((draw.remainingMs ?? 0) / 100) / 10).toFixed(1) }));
    } else if (view.pendingOutput) message.push(t('talisman.output_pending'));
    else if (showResult) {
      const result = showResult;
      if (result.success) message.push(t('talisman.success', { quality: result.quality ? qualities[result.quality] : '', name: ITEMS[result.item]?.name ?? result.item, count: result.count }));
      else message.push(t(result.reason === 'interrupted' ? 'talisman.interrupted' : result.reason === 'completion' ? 'talisman.fail_completion' : 'talisman.fail_condense'));
      if (result.completion !== undefined) message.push(t('talisman.completion', { rate: Math.round(result.completion * 100) }));
      if (result.capApplied) message.push(t('talisman.cap_applied'));
    } else if (view.state === 'interrupted') message.push(t('talisman.interrupted'));
    else if (recipe) {
      message.push(recipe.name, t('talisman.quality_cap', { quality: qualities[view.qualityCap ?? 'low'] }));
      if (recipe.type !== 'grinding') {
        message.push(t('talisman.rate', { rate: Math.round(view.rate * 100) }), t('talisman.sect_bonus', { bonus: Math.round(view.sectBonus * 100) }));
        for (const quality of ['low', 'mid', 'high', 'supreme'] as const) {
          const threshold = this.system.config.rules?.qualityMin[quality];
          if (threshold !== undefined) message.push(t('talisman.quality_threshold', { quality: qualities[quality], rate: threshold * 100 }));
        }
      }
      for (const material of view.check.materials) message.push(t('talisman.material_count', { name: ITEMS[material.item]?.name ?? material.item, owned: material.have, need: material.need }));
      message.push(t('talisman.output_count', { count: recipe.outputCount }), t('talisman.start_cost'));
      if (!view.check.ok) {
        const reasons: Record<string, string> = { unlearned: 'talisman.not_learned', level: 'talisman.locked', realm: 'talisman.locked',
          materials: 'talisman.material_lack', bag_full: 'sys.bag_full', pending: 'talisman.output_pending', config: 'talisman.config_error' };
        message.push(t(reasons[view.check.reason ?? ''] ?? 'talisman.entry_unavailable'));
      }
    }
    const state = { primary: this.confirming ? 'abandon' as const : showResult || view.state === 'interrupted' ? 'again' as const : 'start' as const,
      secondary: this.confirming ? 'continue' as const : 'abandon' as const,
      primaryDisabled: !this.confirming && (view.state === 'drawing' || !view.check.ok),
      secondaryDisabled: !this.confirming && view.state !== 'drawing',
      primaryLabel: !this.confirming && !showResult && recipe?.type === 'grinding' ? t('talisman.ink_grind') : undefined, message: message.join('\n'),
      recipes: view.recipes.map(row => ({ id: row.id, name: row.type === 'grinding' ? t('talisman.ink_tab') : row.name, selected: row.id === this.selected })),
      selectionDisabled: view.state === 'drawing' || this.confirming };
    const fingerprint = JSON.stringify(state);
    if (force || this.fingerprint !== fingerprint) { this.panel.setState(state); this.fingerprint = fingerprint; }
  }
}
