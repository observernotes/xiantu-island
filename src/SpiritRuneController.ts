import { ITEMS, t } from './data';
import { Progress } from './Progress';
import { SpiritRuneGate, type SpiritRuneGateResult, type SpiritRuneRequest } from './SpiritRuneGate';
import { featureClosed } from './SpiritRuneClosed';
import { isSpiritRuneOpen } from './SpiritRuneAccess';
import { isSpiritRuneUiAccessible } from './SpiritRuneUiAccess';
import { loadSpiritRuneRules } from './SpiritRuneRules';

export type SpiritRuneStage = 'closed' | 'panel' | 'pick_host' | 'slots' | 'quench_preview' | 'confirm';

export interface SpiritRuneSlotView {
  index: number;
  affixId: string | null;
  affixName: string;
  locked: boolean;
  empty: boolean;
}

export interface SpiritRuneHostView {
  instanceRef: string;
  itemId: string;
  name: string;
}

export interface SpiritRuneState {
  stage: SpiritRuneStage;
  hosts: SpiritRuneHostView[];
  selectedHost?: string;
  slots: SpiritRuneSlotView[];
  details: string[];
  quenchPrevious?: string;
  quenchNext?: string;
  pendingSlot?: number;
}

export interface SpiritRuneHooks {
  tip: (key: string, vars?: Record<string, string | number>) => void;
  log?: (text: string, color: string) => void;
  changed?: () => void;
  currentProgress?: () => Progress;
}

const clone = <T>(value: T): T => structuredClone(value);
const emptyState = (): SpiritRuneState => ({
  stage: 'closed', hosts: [], slots: [], details: [],
});

/** 独立窗视图内存；不经 forge／不挂坊市／不塞欧冶匠四服务。 */
export class SpiritRuneController {
  private model = emptyState();
  private session = 0;
  private slot = Progress.getActiveSlot();

  constructor(private readonly progress: Progress, private readonly hooks: SpiritRuneHooks) {}

  get state(): SpiritRuneState { return clone(this.model); }

  private emit() { this.hooks.changed?.(); }
  private tip(key: string, vars?: Record<string, string | number>) { this.hooks.tip(key, vars); }
  private log(text: string, color = '#aaaaaa') {
    if (this.hooks.log) this.hooks.log(text, color);
    else this.tip('spirit_rune.closed.feature');
  }
  private tipDenied(result: Extract<SpiritRuneGateResult, { allowed: false }>) {
    if (typeof result.tipKey === 'string' && result.tipKey.startsWith('spirit_rune.')) this.tip(result.tipKey);
    else this.log(result.text);
  }
  private gate() { return new SpiritRuneGate(this.progress); }
  private reset(stage: SpiritRuneStage = 'closed') {
    this.session++; this.model = emptyState(); this.model.stage = stage; this.emit();
  }
  close() { this.reset(); }

  private sameCharacter(): boolean {
    return this.slot === Progress.getActiveSlot()
      && (!this.hooks.currentProgress || this.hooks.currentProgress() === this.progress);
  }

  private guard(notify = true): boolean {
    if (!isSpiritRuneUiAccessible('entrance') || !isSpiritRuneUiAccessible('panel')) {
      this.reset(); if (notify) this.tip('spirit_rune.closed.feature'); return false;
    }
    if (!isSpiritRuneOpen()) {
      this.reset(); if (notify) this.log(featureClosed().text); return false;
    }
    if (!this.sameCharacter()) {
      this.reset(); if (notify) this.tip('spirit_rune.closed.load_refresh'); return false;
    }
    return true;
  }

  /** 入口：Flag 关 → 只 tip，不改槽。 */
  open(): boolean {
    if (!isSpiritRuneUiAccessible('entrance') || !isSpiritRuneUiAccessible('panel')) {
      this.tip('spirit_rune.closed.feature'); return false;
    }
    if (!isSpiritRuneOpen()) { this.log(featureClosed().text); return false; }
    if (!this.sameCharacter()) { this.tip('spirit_rune.closed.load_refresh'); return false; }
    const feature = this.gate().feature();
    if (!feature.allowed) { this.tipDenied(feature); return false; }
    this.reset('panel');
    this.reloadHosts();
    return true;
  }

  poll(): boolean {
    return this.model.stage === 'closed' || this.guard(false);
  }

  private reloadHosts() {
    const listed = this.gate().listHosts();
    this.model.hosts = listed.hosts.map(row => ({
      instanceRef: row.instanceRef, itemId: row.itemId, name: ITEMS[row.itemId]?.name ?? row.itemId,
    }));
    this.model.details = [t('spirit_rune.ui.subtitle'), t('spirit_rune.ui.pick_host')];
    this.emit();
  }

  selectHost(instanceRef: string): boolean {
    if (!this.guard()) return false;
    const host = this.model.hosts.find(row => row.instanceRef === instanceRef);
    if (!host) { this.tip('spirit_rune.host_invalid'); return false; }
    const preview = this.gate().previewBag(instanceRef);
    if (!preview.allowed || !preview.bag) { this.tipDenied(preview as Extract<SpiritRuneGateResult, { allowed: false }>); return false; }
    this.model.selectedHost = instanceRef;
    this.model.stage = 'slots';
    this.model.slots = preview.bag.slots.map((slot, index) => ({
      index,
      affixId: slot.affixId,
      affixName: slot.affixId ? t(`spirit_rune.affix.${slot.affixId}`) : t('spirit_rune.ui.empty_slot'),
      locked: slot.locked,
      empty: slot.affixId == null,
    }));
    this.model.details = [host.name, t('spirit_rune.ui.subtitle')];
    this.emit();
    return true;
  }

  requestRefine(slotIndex: number): boolean {
    if (!this.guard()) return false;
    if (!this.model.selectedHost) { this.tip('spirit_rune.host_invalid'); return false; }
    const request: SpiritRuneRequest = { hostInstanceRef: this.model.selectedHost, slotIndex };
    const result = this.gate().refine(request);
    if (!result.allowed) { this.tipDenied(result); return false; }
    return true;
  }

  requestQuench(slotIndex: number): boolean {
    if (!this.guard()) return false;
    if (!this.model.selectedHost) { this.tip('spirit_rune.host_invalid'); return false; }
    const result = this.gate().quenchPreview({ hostInstanceRef: this.model.selectedHost, slotIndex });
    if (!result.allowed) { this.tipDenied(result); return false; }
    this.model.stage = 'quench_preview';
    this.model.pendingSlot = slotIndex;
    this.model.quenchPrevious = result.previousAffixId;
    this.model.quenchNext = result.nextAffixId;
    this.model.details = [t('spirit_rune.quench.preview')];
    this.emit();
    return true;
  }

  requestLock(slotIndex: number, locked: boolean): boolean {
    if (!this.guard()) return false;
    if (!this.model.selectedHost) { this.tip('spirit_rune.host_invalid'); return false; }
    void this.gate().submitLock({ hostInstanceRef: this.model.selectedHost, slotIndex }, locked).then(result => {
      if (!result.allowed) this.tipDenied(result);
    });
    return false;
  }

  /** 诊断：表是否可被 Gate 消费（关态自检用）。 */
  rulesReady(): boolean { return loadSpiritRuneRules() != null; }
}
