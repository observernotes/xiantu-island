import Phaser from 'phaser';
import { REALMS, t } from '../data';
import { TalismanPanel, type TalismanPanelAction, type TalismanPanelState } from '../TalismanPanel';
import { TalismanSystem, type TalismanBlock, type TalismanDirection } from '../Talisman';
import type { GameScene } from './GameScene';

const DIRECTIONS: Record<string, TalismanDirection> = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right' };
const BLOCK_KEYS: Partial<Record<TalismanBlock, string>> = {
  unlearned: 'talisman.not_learned', level: 'talisman.locked', realm: 'talisman.locked', skill_level: 'talisman.locked',
  materials: 'talisman.material_lack', bag_full: 'sys.bag_full', pending: 'talisman.output_pending', config: 'talisman.config_error',
};
const blockedText = (reason?: TalismanBlock) => t(BLOCK_KEYS[reason ?? 'unknown'] ?? 'talisman.entry_unavailable');

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
    const initialView = this.system.view();
    this.selected = data.recipeId ?? initialView.selectedRecipe?.id ?? initialView.recipes[0]?.id ?? '';
    this.held.clear(); this.edges.clear(); this.frame = 0; this.confirming = false; this.exitAfterAbandon = false;
    this.blurred = false; this.pauseReasons.clear(); this.fingerprint = '';
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
    if (event.repeat) return;
    if (this.held.has(direction)) return;
    this.held.add(direction);
    if (this.pauseReasons.size) return;
    // 事件时间与 performance.now 共用起点，截止附近仍按真实按下时刻判定。
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
    this.blurred = false; this.held.clear(); this.edges.clear(); this.input.keyboard?.resetKeys();
    this.resumeFor('blur');
  }
  select(id: string) {
    if (this.system.saving || this.system.view(this.selected).state === 'drawing' || this.confirming) return false;
    if (!this.system.view().recipes.some(recipe => recipe.id === id)) return false;
    this.selected = id; this.refresh(true); return true;
  }
  action(action: TalismanPanelAction) { void this.applyAction(action); }
  private async applyAction(action: TalismanPanelAction) {
    if (this.system.saving) return;
    const drawing = this.system.view(this.selected).state === 'drawing';
    if (action === 'continue') {
      this.confirming = false; this.edges.clear();
      this.resumeFor('confirm');
    } else if (action === 'abandon' && this.confirming) {
      const abandoned = this.system.abandonAsync(); this.refresh(true);
      if (!await abandoned) { this.refresh(true); return; }
      this.confirming = false; this.resumeFor('confirm');
      if (this.exitAfterAbandon) { this.finish(); return; }
    } else if ((action === 'abandon' || action === 'close') && drawing) {
      this.confirming = true; this.exitAfterAbandon = action === 'close'; this.pauseFor('confirm');
    } else if (action === 'close') { this.finish(); return; }
    else if (action === 'start' || action === 'again') {
      if (this.pauseReasons.size) return;
      const recipe = this.system.view(this.selected).selectedRecipe;
      const started = recipe?.type === 'grinding' ? this.system.grindAsync(this.selected)
        : this.system.startAsync(this.selected, () => performance.now());
      this.refresh(true); await started;
      this.edges.clear();
      if (this.pauseReasons.size) this.system.pause(performance.now());
    }
    this.refresh(true);
  }
  private finish() { this.scene.stop(); }
  update() {
    const time = performance.now();
    if (!this.pauseReasons.size && !this.system.saving) {
      const down = [...new Set([...this.held, ...this.edges.keys()])];
      const eventTime = this.edges.size ? Math.min(...this.edges.values()) : time;
      void this.system.inputAsync(down, eventTime, ++this.frame);
      if (!this.system.saving) void this.system.advanceAsync(time, this.frame);
    }
    this.edges.clear();
    if (!this.system.saving) void this.system.claimPendingAsync();
    this.refresh();
  }
  snapshot() { return { ...this.panel.snapshot(), selectedRecipeId: this.selected, confirming: this.confirming, view: this.system.view(this.selected) }; }
  private refresh(force = false) {
    const view = this.system.view(this.selected), draw = view.draw, recipe = view.selectedRecipe;
    const selectedAttempt = view.attempt?.recipeId === this.selected;
    const showResult = selectedAttempt ? view.result : null;
    const interrupted = selectedAttempt && view.state === 'interrupted';
    const message: string[] = [];
    if (this.confirming) message.push(t('talisman.abandon_confirm'));
    else if (draw && view.state === 'drawing') {
      message.push(draw.paused ? t('talisman.paused') : draw.waitingRelease ? t('talisman.release_keys') : t('talisman.draw_prompt'));
    } else if (view.pendingOutput) message.push(t('talisman.output_pending'));
    else if (showResult) {
      if (!showResult.success) message.push(t(showResult.reason === 'interrupted' ? 'talisman.interrupted' : showResult.reason === 'completion' ? 'talisman.fail_completion' : 'talisman.fail_condense'));
      if (showResult.capApplied) message.push(t('talisman.cap_applied'));
    } else if (interrupted) message.push(t('talisman.interrupted'));
    else if (!view.check.ok) message.push(blockedText(view.check.reason));
    const known = new Set(this.system.knownRecipes.map(row => row.id));
    const primary = this.confirming ? 'abandon' : showResult || interrupted ? 'again' : 'start';
    const primaryEnabled = primary === 'abandon' ? view.buttons.abandon
      : primary === 'again' ? view.buttons.again : recipe?.type === 'grinding' ? view.buttons.grind : view.buttons.start;
    const state: TalismanPanelState = { primary,
      secondary: this.confirming ? 'continue' as const : 'abandon' as const,
      primaryDisabled: this.system.saving || !primaryEnabled,
      secondaryDisabled: this.system.saving || !(this.confirming ? view.buttons.continue : view.buttons.abandon),
      primaryLabel: !this.confirming && !showResult && recipe?.type === 'grinding' ? t('talisman.ink_grind') : undefined, message: message.join('\n'),
      recipes: view.recipes.map(row => {
        const check = this.system.check(row.id), permission = this.owner.prog.recipeSkillPermission(row.id);
        // check 的忙碌/待领取会先返回；符卡仍以只读许可和配方条件保持原有锁定说明。
        // 这里只决定卡面，实际开始与扣料始终由系统再次预检。
        const lock = this.system.config.invalid.has(row.id) || permission.reason === 'config' ? 'config'
          : !known.has(row.id) ? 'unlearned'
          : this.owner.prog.level < row.reqLevel ? 'level'
          : !permission.ok ? permission.reason
          : REALMS.findIndex(realm => realm.id === this.owner.prog.realm.id) < REALMS.findIndex(realm => realm.id === row.realm) ? 'realm'
          : check.reason && ['unlearned', 'level', 'realm', 'skill_level', 'config'].includes(check.reason) ? check.reason : undefined;
        return { id: row.id, name: row.type === 'grinding' ? t('talisman.ink_tab') : row.name,
          type: row.type, output: row.output, selected: row.id === this.selected,
          disabled: !!lock, reason: lock ? blockedText(lock) : undefined };
      }),
      selectionDisabled: this.system.saving || view.state === 'drawing' || this.confirming,
      view, qualityMin: this.system.config.rules?.qualityMin, confirming: this.confirming,
      lifeSkill: this.owner.prog.lifeSkillView('talisman') };
    const fingerprint = JSON.stringify(state);
    if (force || this.fingerprint !== fingerprint) { this.panel.setState(state); this.fingerprint = fingerprint; }
  }
}
