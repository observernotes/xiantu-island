import Phaser from 'phaser';
import { t } from './data';
import type { Progress } from './Progress';
import { HUD_FONT, INK, INK_60 } from './hud';
import {
  MarketConsignController, type MarketConsignAction, type MarketConsignHooks,
} from './MarketConsignController';

export interface MarketConsignPanelHooks {
  tip?: MarketConsignHooks['tip'];
  log?: MarketConsignHooks['log'];
  currentProgress?: () => Progress;
  onClose?: () => void;
}
interface Action { label: string; run: () => void; disabled?: boolean; destructive?: boolean }

/** Lightweight modal renderer. Requests and readonly selection stay in the controller. */
export class MarketConsignPanel {
  readonly controller: MarketConsignController;
  private c?: Phaser.GameObjects.Container;
  private actions: Action[] = [];
  private focus = 0;
  private focusViews: Phaser.GameObjects.Rectangle[] = [];
  private offset = 0;
  private openedAt = 0;
  private previousStage = 'closed';

  constructor(private readonly scene: Phaser.Scene, progress: Progress, private readonly hooks: MarketConsignPanelHooks) {
    this.controller = new MarketConsignController(progress, {
      tip: (key, vars) => hooks.tip ? hooks.tip(key, vars) : hooks.log?.(t(key, vars), '#aaaaaa'),
      log: (text, color) => hooks.log?.(text, color),
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
    return this.controller.open();
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
      this.focus = (this.focus + delta + this.actions.length) % Math.max(1, this.actions.length); this.paintFocus(); return;
    }
    const action = this.actions[this.focus];
    if (action && !action.disabled) action.run();
  }
  private paintFocus() {
    this.focusViews.forEach((row, i) => row.setStrokeStyle(i === this.focus ? 2 : 1, i === this.focus ? 0xc17732 : 0x987b53));
  }
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
    if (stageChanged) this.focus = 0;
    const w = Math.min(744, this.scene.scale.width - 24), h = Math.min(500, this.scene.scale.height - 24);
    const x = (this.scene.scale.width - w) / 2, y = (this.scene.scale.height - h) / 2;
    this.c = this.scene.add.container(x, y).setDepth(3100).setScrollFactor(0).setName('market-consign-modal');
    const shade = this.add(this.scene.add.rectangle(-x, -y, this.scene.scale.width, this.scene.scale.height, 0x000000, 0.45).setOrigin(0));
    shade.setInteractive();
    this.add(this.scene.add.rectangle(0, 0, w, h, 0xf5e9ce).setOrigin(0).setStrokeStyle(2, 0x725234));
    this.text(20, 18, '坊市寄售', w - 175, 20);
    this.button(w - 124, 14, 104, { label: t('ui.cancel'), run: () => this.controller.back() });
    this.text(20, h - 31, '方向键移动 · Enter 确认 · Esc 返回', w - 40, 12, INK_60);

    const left = Math.min(280, Math.round(w * .4)), listHeight = h - 190;
    if (state.stage === 'panel' || state.stage === 'confirm' || state.stage === 'submitting' || state.stage === 'result') {
      this.text(20, 61, `活动栏位（${state.activeSlots}/${state.slotCapacity}）`, left - 25, 14);
      const count = Math.max(1, Math.floor(listHeight / 43));
      const rows = state.slots.slice(this.offset, this.offset + count);
      if (!rows.length) this.text(20, 105, '暂无活动寄售', left - 25, 14, INK_60);
      rows.forEach((row, i) => this.button(18, 93 + i * 43, left - 30, {
        label: `${state.selectedListingId === row.listingId ? '● ' : ''}${row.slotIndex + 1}. ${row.name} · ${row.state === 'listed' ? '待售' : '待领'}`,
        run: () => this.controller.selectListing(row.listingId),
      }, 39));
      if (state.slots.length > count) {
        this.button(18, h - 92, 76, { label: '↑', disabled: this.offset === 0, run: () => { this.offset = Math.max(0, this.offset - count); this.render(); } });
        this.button(104, h - 92, 76, {
          label: '↓', disabled: this.offset + count >= state.slots.length,
          run: () => { this.offset += count; this.render(); },
        });
      }
    }

    if (state.stage === 'list_pick') {
      this.text(20, 61, '选择上架物品', left - 25, 14);
      const count = Math.max(1, Math.floor(listHeight / 43));
      const rows = state.candidates.slice(this.offset, this.offset + count);
      if (!rows.length) this.text(20, 105, '背包无可上架物品', left - 25, 14, INK_60);
      rows.forEach((row, i) => this.button(18, 93 + i * 43, left - 30, {
        label: `${state.selectedItemId === row.itemId ? '● ' : ''}${row.name} ×${row.owned}`,
        run: () => this.controller.selectCandidate(row.itemId),
      }, 39));
    }

    const detailX = left + 8, detailW = w - detailX - 24;
    const lines = state.stage === 'result' ? state.resultLines : state.details;
    const details = this.text(detailX, 88, lines.join('\n'), detailW, 13);
    details.setCrop(0, 0, detailW, Math.max(50, h - 245));

    if (state.stage === 'submitting') {
      this.text(detailX, h - 138, '正在处理寄售…', detailW, 14); this.paintFocus(); return;
    }
    if (state.stage === 'panel') {
      this.button(detailX, h - 156, Math.min(150, detailW), { label: '上架', run: () => { this.offset = 0; this.controller.beginList(); } });
      this.button(detailX + 160, h - 156, Math.min(150, detailW), {
        label: '撤回', disabled: !state.slots.some(row => row.listingId === state.selectedListingId && row.state === 'listed'),
        run: () => this.controller.requestConfirm('withdraw'),
      });
      this.button(detailX, h - 112, Math.min(150, detailW), {
        label: '领取', disabled: !state.slots.some(row => row.listingId === state.selectedListingId && row.state === 'sold_pending_claim'),
        run: () => this.controller.requestConfirm('claim'),
      });
    } else if (state.stage === 'list_pick') {
      this.button(detailX, h - 156, 76, { label: '价−', run: () => this.controller.adjustPrice(-1) });
      this.button(detailX + 86, h - 156, 76, { label: '价＋', run: () => this.controller.adjustPrice(1) });
      this.button(detailX, h - 112, Math.min(170, detailW), {
        label: t('ui.confirm'), disabled: !state.selectedItemId,
        run: () => this.controller.requestConfirm('list' satisfies MarketConsignAction),
      });
    } else if (state.stage === 'confirm') {
      const pending = this.controller.pending;
      this.button(detailX, h - 102, 140, { label: t('ui.cancel'), run: () => this.controller.back() });
      this.button(detailX + 155, h - 102, 140, {
        label: t('ui.confirm'), destructive: pending?.action === 'withdraw',
        run: () => { void this.controller.submit(pending); },
      });
    } else if (state.stage === 'result') {
      this.button(detailX, h - 102, 150, { label: '返回寄售', run: () => this.controller.back() });
    }
    this.focus = Math.min(this.focus, Math.max(0, this.actions.length - 1)); this.paintFocus();
  }
}
