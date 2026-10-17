import Phaser from 'phaser';
import { t } from './data';
import type { Progress } from './Progress';
import { HUD_FONT, INK, INK_60 } from './hud';
import { SmithServicesController, SMITH_ELEMENTS, SMITH_SERVICES, type SmithServicesHooks } from './SmithServicesController';

export interface SmithServicesPanelHooks {
  tip?: SmithServicesHooks['tip'];
  log?: (text: string, color: string) => void;
  currentProgress?: () => Progress;
  onClose?: () => void;
}
interface Action { label: string; run: () => void; disabled?: boolean; destructive?: boolean }

/** Lightweight modal renderer. All requests and readonly selection stay in the controller. */
export class SmithServicesPanel {
  readonly controller: SmithServicesController;
  private c?: Phaser.GameObjects.Container;
  private actions: Action[] = [];
  private focus = 0;
  private focusViews: Phaser.GameObjects.Rectangle[] = [];
  private offset = 0;
  private openedAt = 0;
  private previousStage = 'closed';

  constructor(private readonly scene: Phaser.Scene, progress: Progress, private readonly hooks: SmithServicesPanelHooks) {
    this.controller = new SmithServicesController(progress, {
      tip: (key, vars) => hooks.tip ? hooks.tip(key, vars) : hooks.log?.(t(key, vars), '#aaaaaa'),
      currentProgress: hooks.currentProgress,
      changed: () => this.render(),
    });
    scene.input.keyboard?.on('keydown', this.onKey, this);
    scene.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      this.controller.close(); scene.input.keyboard?.off('keydown', this.onKey, this);
    });
  }
  visible(): boolean { return this.controller.state.stage !== 'closed'; }
  isOpen(): boolean { return this.visible(); }
  show(): boolean {
    this.focus = 0; this.offset = 0; this.openedAt = this.scene.time.now;
    return this.controller.openMenu();
  }
  open(): boolean { return this.show(); }
  hide(): void { this.controller.close(); }
  close(): void { this.hide(); }
  update(): void { if (this.visible()) this.controller.poll(); }
  private onKey(event: KeyboardEvent) {
    if (!this.visible() || event.repeat || this.scene.time.now - this.openedAt < 120) return;
    if (!['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { this.controller.back(); return; }
    if (event.key.startsWith('Arrow')) {
      const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
      this.focus = (this.focus + delta + this.actions.length) % this.actions.length; this.paintFocus(); return;
    }
    const action = this.actions[this.focus];
    if (action && !action.disabled) action.run();
  }
  private paintFocus() { this.focusViews.forEach((row, i) => row.setStrokeStyle(i === this.focus ? 2 : 1, i === this.focus ? 0xc17732 : 0x987b53)); }
  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    (obj as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(obj); return obj;
  }
  private text(x: number, y: number, value: string, width: number, size = 14, color = INK) {
    return this.add(this.scene.add.text(x, y, value, { fontFamily: HUD_FONT, fontSize: `${size}px`, color,
      wordWrap: { width, useAdvancedWrap: true }, lineSpacing: 5 }));
  }
  private button(x: number, y: number, width: number, action: Action, height = 29) {
    const index = this.actions.length; this.actions.push(action);
    const bg = this.add(this.scene.add.rectangle(x, y, width, height, action.disabled ? 0xd7cfbd : 0xf8edcf)
      .setOrigin(0).setStrokeStyle(1, 0x987b53));
    this.focusViews.push(bg);
    this.text(x + 8, y + 6, action.label, width - 16, 13, action.disabled ? INK_60 : action.destructive ? '#a33028' : INK);
    if (!action.disabled) bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focus = index; this.paintFocus(); })
      .on('pointerup', () => action.run());
  }
  private render() {
    const state = this.controller.state;
    const wasVisible = this.previousStage !== 'closed';
    const stageChanged = state.stage !== this.previousStage;
    this.previousStage = state.stage;
    this.c?.destroy(); this.c = undefined; this.actions = []; this.focusViews = [];
    if (state.stage === 'closed') { if (wasVisible) this.hooks.onClose?.(); return; }
    // Every new level starts on Back, including destructive confirmation.
    if (stageChanged) this.focus = 0;
    const w = Math.min(744, this.scene.scale.width - 24), h = Math.min(500, this.scene.scale.height - 24);
    const x = (this.scene.scale.width - w) / 2, y = (this.scene.scale.height - h) / 2;
    this.c = this.scene.add.container(x, y).setDepth(3100).setScrollFactor(0).setName('smith-services-modal');
    const shade = this.add(this.scene.add.rectangle(-x, -y, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.45).setOrigin(0));
    shade.setInteractive();
    this.add(this.scene.add.rectangle(0, 0, w, h, 0xf5e9ce).setOrigin(0).setStrokeStyle(2, 0x725234));
    this.text(20, 18, t('ui.smith.title') + (state.service ? ` · ${t(`ui.smith.${state.service}`)}` : ''), w - 175, 20);
    this.button(w - 124, 14, 104, { label: t('ui.smith.back'), run: () => this.controller.back() });
    this.text(20, h - 31, t('ui.smith.keys'), w - 40, 12, INK_60);
    if (state.stage === 'menu') {
      SMITH_SERVICES.forEach((service, i) => {
        const availability = this.controller.serviceAvailability(service);
        this.button(48, 85 + i * 65, w - 96, {
          label: `${t(`ui.smith.${service}`)}${!availability.available ? ` · ${t(availability.tipKey!, { service: t(`ui.smith.${service}`) })}` : ''}`,
          run: () => { this.offset = 0; this.controller.openService(service); },
        });
      });
      this.paintFocus(); return;
    }
    const left = Math.min(260, Math.round(w * .38)), listHeight = h - 190;
    this.text(20, 61, t(state.service === 'forge' ? 'ui.smith.select_recipe' : state.service === 'enchant' ? 'ui.smith.select_weapon' : 'ui.smith.select_instance'), left - 25, 14);
    if (state.stage === 'panel') {
      const count = Math.max(1, Math.floor(listHeight / 43));
      const rows = state.candidates.slice(this.offset, this.offset + count);
      if (!rows.length) this.text(20, 105, t(state.service === 'forge' ? 'ui.smith.no_recipe' : 'ui.smith.no_instance'), left - 25, 14, INK_60);
      rows.forEach((row, i) => this.button(18, 93 + i * 43, left - 30, {
        label: `${state.selected === row.id ? '● ' : ''}${this.offset + i + 1}. ${row.name}${row.location ? ` · ${row.location}` : ''}${row.lines.length ? `\n${row.lines.filter(line => line !== t('ui.equip.inst.unavailable')).slice(0, 2).join(' · ')}` : ''}`,
        run: () => this.controller.select(row.id),
      }, 39));
      if (state.candidates.length > count) {
        this.button(18, h - 92, 76, { label: '↑', disabled: this.offset === 0, run: () => { this.offset = Math.max(0, this.offset - count); this.render(); } });
        this.button(104, h - 92, 76, { label: '↓', disabled: this.offset + count >= state.candidates.length,
          run: () => { this.offset += count; this.render(); } });
      }
    }
    const detailX = state.stage === 'panel' ? left + 8 : 24;
    const detailW = w - detailX - 24;
    const lines = state.stage === 'result' ? state.resultLines : state.details;
    const details = this.text(detailX, 88, lines.join('\n'), detailW, 13);
    details.setCrop(0, 0, detailW, Math.max(50, h - 245));
    if (state.stage === 'submitting') {
      this.text(detailX, h - 138, t('ui.smith.busy'), detailW, 14); this.paintFocus(); return;
    }
    if (state.stage === 'panel') {
      if (state.service === 'enhance') this.button(detailX, h - 156, detailW, {
        label: state.useProtectCharm ? `☑ ${t('ui.smith.protect_charm')}` : `☐ ${t('ui.smith.no_charm')}`,
        run: () => this.controller.setProtectCharm(!this.controller.state.useProtectCharm),
      });
      if (state.service === 'enchant') {
        this.text(detailX, h - 186, t('ui.smith.select_element'), detailW, 13);
        SMITH_ELEMENTS.forEach((element, i) => this.button(detailX + i * (detailW / 5), h - 156, detailW / 5 - 4, {
          label: `${state.element === element ? '● ' : ''}${element}`, run: () => this.controller.selectElement(element),
        }));
      }
      this.button(detailX, h - 102, Math.min(170, detailW), {
        label: t('ui.confirm'), disabled: !state.selected || state.service === 'enchant' && !state.element,
        run: () => this.controller.requestConfirm(),
      });
    } else if (state.stage === 'confirm') {
      const pending = this.controller.pending;
      this.button(detailX, h - 102, 140, { label: t('ui.cancel'), run: () => this.controller.back() });
      this.button(detailX + 155, h - 102, 140, {
        label: t('ui.confirm'), destructive: state.service === 'salvage', run: () => { void this.controller.submit(pending); },
      });
    } else if (state.stage === 'result') {
      this.button(detailX, h - 102, 150, { label: t('ui.smith.back'), run: () => this.controller.back() });
      this.button(detailX + 165, h - 102, 150, { label: t('ui.smith.title'), run: () => this.controller.openMenu() });
    }
    this.focus = Math.min(this.focus, this.actions.length - 1); this.paintFocus();
  }
}
