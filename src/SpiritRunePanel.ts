import Phaser from 'phaser';
import { t } from './data';
import type { Progress } from './Progress';
import { HUD_FONT, INK, INK_60 } from './hud';
import { SpiritRuneController, type SpiritRuneHooks } from './SpiritRuneController';

export interface SpiritRunePanelHooks {
  tip?: SpiritRuneHooks['tip'];
  log?: (text: string, color: string) => void;
  currentProgress?: () => Progress;
  onClose?: () => void;
}

interface Action { label: string; run: () => void; disabled?: boolean }

/** 独立「灵纹祭炼」窗；禁挂坊市／禁塞欧冶匠四服务同面板。 */
export class SpiritRunePanel {
  readonly controller: SpiritRuneController;
  private c?: Phaser.GameObjects.Container;
  private actions: Action[] = [];
  private focus = 0;
  private focusViews: Phaser.GameObjects.Rectangle[] = [];
  private openedAt = 0;

  constructor(private readonly scene: Phaser.Scene, progress: Progress, private readonly hooks: SpiritRunePanelHooks) {
    this.controller = new SpiritRuneController(progress, {
      tip: (key, vars) => hooks.tip ? hooks.tip(key, vars) : hooks.log?.(t(key, vars), '#aaaaaa'),
      log: hooks.log,
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
    this.focus = 0; this.openedAt = this.scene.time.now;
    return this.controller.open();
  }
  open(): boolean { return this.show(); }
  hide(): void { this.controller.close(); this.clear(); this.hooks.onClose?.(); }
  close(): void { this.hide(); }
  update(): void { if (this.visible()) this.controller.poll(); }

  private onKey(event: KeyboardEvent) {
    if (!this.visible() || event.repeat || this.scene.time.now - this.openedAt < 120) return;
    if (!['Escape', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Enter'].includes(event.key)) return;
    event.preventDefault();
    if (event.key === 'Escape') { this.hide(); return; }
    if (event.key.startsWith('Arrow')) {
      if (!this.actions.length) return;
      const delta = event.key === 'ArrowUp' || event.key === 'ArrowLeft' ? -1 : 1;
      this.focus = (this.focus + delta + this.actions.length) % this.actions.length; this.paintFocus(); return;
    }
    const action = this.actions[this.focus];
    if (action && !action.disabled) action.run();
  }

  private paintFocus() {
    this.focusViews.forEach((row, i) => row.setStrokeStyle(i === this.focus ? 2 : 1, i === this.focus ? 0xc17732 : 0x987b53));
  }
  private clear() { this.c?.destroy(true); this.c = undefined; this.actions = []; this.focusViews = []; }
  private add<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    (obj as T & { setScrollFactor?: (factor: number) => unknown }).setScrollFactor?.(0);
    this.c!.add(obj); return obj;
  }
  private text(x: number, y: number, value: string, width: number, size = 14, color = INK) {
    return this.add(this.scene.add.text(x, y, value, {
      fontFamily: HUD_FONT, fontSize: `${size}px`, color,
      wordWrap: { width, useAdvancedWrap: true }, lineSpacing: 5,
    }));
  }
  private button(x: number, y: number, width: number, action: Action, height = 29) {
    const index = this.actions.length; this.actions.push(action);
    const bg = this.add(this.scene.add.rectangle(x, y, width, height, action.disabled ? 0xd7cfbd : 0xf8edcf)
      .setOrigin(0).setStrokeStyle(1, 0x987b53));
    this.focusViews.push(bg);
    this.text(x + 8, y + 6, action.label, width - 16, 13, action.disabled ? INK_60 : INK);
    if (!action.disabled) bg.setInteractive({ useHandCursor: true })
      .on('pointerover', () => { this.focus = index; this.paintFocus(); })
      .on('pointerup', () => action.run());
  }

  private render() {
    const state = this.controller.state;
    this.clear();
    if (state.stage === 'closed') return;
    const w = 420, h = 360, x = Math.floor((this.scene.scale.width - w) / 2), y = Math.floor((this.scene.scale.height - h) / 2);
    this.c = this.scene.add.container(0, 0).setDepth(4000);
    this.add(this.scene.add.rectangle(x, y, w, h, 0xf3e6c8).setOrigin(0).setStrokeStyle(2, 0x8a6a3a));
    this.text(x + 16, y + 14, t('spirit_rune.ui.title'), w - 32, 18);
    this.text(x + 16, y + 40, t('spirit_rune.ui.subtitle'), w - 32, 13, INK_60);
    let cursor = y + 68;
    for (const line of state.details) {
      this.text(x + 16, cursor, line, w - 32, 13); cursor += 22;
    }
    if (state.stage === 'panel' || state.stage === 'pick_host') {
      for (const host of state.hosts) {
        this.button(x + 16, cursor, w - 32, {
          label: `${host.name} · ${host.instanceRef.slice(-8)}`,
          run: () => this.controller.selectHost(host.instanceRef),
        });
        cursor += 34;
      }
      if (!state.hosts.length) this.text(x + 16, cursor, t('spirit_rune.host_invalid'), w - 32, 13, INK_60);
    } else if (state.stage === 'slots' || state.stage === 'quench_preview') {
      for (const slot of state.slots) {
        const lockLabel = slot.locked ? t('spirit_rune.ui.locked') : '';
        this.text(x + 16, cursor, `#${slot.index + 1} ${slot.affixName} ${lockLabel}`.trim(), w - 32, 13);
        cursor += 22;
        this.button(x + 16, cursor, 120, {
          label: t('spirit_rune.ui.refine'), disabled: !slot.empty,
          run: () => this.controller.requestRefine(slot.index),
        });
        this.button(x + 144, cursor, 120, {
          label: t('spirit_rune.ui.quench'), disabled: slot.empty || slot.locked,
          run: () => this.controller.requestQuench(slot.index),
        });
        this.button(x + 272, cursor, 120, {
          label: slot.locked ? t('spirit_rune.ui.unlock') : t('spirit_rune.ui.lock'), disabled: slot.empty,
          run: () => this.controller.requestLock(slot.index, !slot.locked),
        });
        cursor += 36;
      }
      if (state.stage === 'quench_preview') {
        this.text(x + 16, cursor, `${state.quenchPrevious ?? ''} → ${state.quenchNext ?? ''}`, w - 32, 13);
      }
    }
    this.text(x + 16, y + h - 28, t('spirit_rune.ui.keys'), w - 32, 12, INK_60);
    this.paintFocus();
  }
}
