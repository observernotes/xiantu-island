import strings from '@xt/balance/strings_zh.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
import { isEnhanceInstanceRef } from './EnhanceProgress';
import { isSpiritRuneOpen } from './SpiritRuneAccess';
import * as SpiritRuneClosed from './SpiritRuneClosed';
import {
  emptySpiritRuneProgress, isValidSpiritRuneProgress, type SpiritRuneHostBag, type SpiritRuneProgress, type SpiritRuneSlot,
} from './SpiritRuneProgress';
import { loadSpiritRuneRules, pickWeightedAffix, type SpiritRuneRules } from './SpiritRuneRules';

export interface SpiritRuneRequest {
  hostInstanceRef: string;
  slotIndex: number;
}

export interface SpiritRuneQuenchConfirm {
  hostInstanceRef: string;
  slotIndex: number;
  previousAffixId: string;
  nextAffixId: string;
  accept: boolean;
}

export interface SpiritRuneFixtureOptions {
  random?: () => number;
  ledgerId?: () => string;
}

export interface SpiritRuneAllowed {
  allowed: true;
  progress?: SpiritRuneProgress;
  bag?: SpiritRuneHostBag;
  slot?: SpiritRuneSlot;
  affixId?: string;
  previousAffixId?: string;
  nextAffixId?: string;
  tipKey?: string;
  text?: string;
}

export interface SpiritRuneDenied { allowed: false; tipKey: string; text: string }
export type SpiritRuneGateResult = SpiritRuneAllowed | SpiritRuneDenied;

const copy = <T>(value: T): T => structuredClone(value);
const textOf = (key: string) => (strings as unknown as Record<string, string>)[key] ?? key;
const denied = (tipKey: string, text?: string): SpiritRuneDenied => ({
  allowed: false, tipKey, text: text ?? textOf(tipKey),
});

/**
 * 灵纹祭炼 Gate：与 enhance／enchant 并列独立。
 * SpiritRuneOpenFlag 未建文件 → isSpiritRuneOpen() 恒 false → 写操作只 tip、零扣、零改槽。
 */
export class SpiritRuneGate {
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: SpiritRuneFixtureOptions = {}) {}

  private rules(): SpiritRuneRules | null { return loadSpiritRuneRules(); }

  feature(): SpiritRuneGateResult {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.featureClosed();
    return this.rules() ? { allowed: true } : denied('spirit_rune.rules_missing');
  }

  entrance(): SpiritRuneGateResult {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseEntrance();
    return this.rules() ? { allowed: true } : denied('spirit_rune.rules_missing');
  }

  /** 列出本档正式武器宿主候选（只读；关态也允许只读枚举供 UI 壳，不改槽）。 */
  listHosts(): { allowed: true; hosts: { instanceRef: string; itemId: string }[] } {
    const hosts = this.progress.formalEnhanceInstances()
      .filter(row => row.type === 'weapon' && this.supportedWeapon(row.itemId))
      .map(row => ({ instanceRef: row.instanceRef, itemId: row.itemId }));
    return { allowed: true, hosts };
  }

  previewBag(hostInstanceRef: string): SpiritRuneGateResult {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.featureClosed();
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validHost(hostInstanceRef)) return denied('spirit_rune.host_invalid');
    const bag = this.bagOf(this.progress.spiritRune, hostInstanceRef, rules.slotCount);
    return { allowed: true, bag: copy(bag), progress: copy(this.progress.spiritRune) };
  }

  refine(request: SpiritRuneRequest): SpiritRuneGateResult {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseRefine();
    return this.#refineOpen(request);
  }

  async submitRefine(request: SpiritRuneRequest): Promise<SpiritRuneGateResult> {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseSubmit();
    if (this.#busy) return denied('spirit_rune.closed.no_submit', '灵纹祭炼处理中，请稍候。');
    return this.#refineOpen(request);
  }

  quenchPreview(request: SpiritRuneRequest): SpiritRuneGateResult {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseQuench();
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validHost(request.hostInstanceRef)) return denied('spirit_rune.host_invalid');
    const bag = this.bagOf(this.progress.spiritRune, request.hostInstanceRef, rules.slotCount);
    const slot = bag.slots[request.slotIndex];
    if (!slot || slot.affixId == null) return denied('spirit_rune.no_slot', textOf('spirit_rune.no_slot'));
    if (slot.locked) return denied('spirit_rune.all_locked', '该槽已锁定，淬炼跳过。');
    if (bag.slots.every(row => row.locked || row.affixId == null)) return denied('spirit_rune.all_locked');
    const next = pickWeightedAffix(rules, this.fixture.random ?? Math.random, new Set([slot.affixId]));
    if (!next) return denied('spirit_rune.rules_missing');
    return {
      allowed: true, bag: copy(bag), slot: copy(slot), previousAffixId: slot.affixId, nextAffixId: next.id,
      tipKey: 'spirit_rune.quench.preview', text: textOf('spirit_rune.quench.preview'),
    };
  }

  async submitQuench(confirm: SpiritRuneQuenchConfirm): Promise<SpiritRuneGateResult> {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseSubmit();
    return denied('spirit_rune.closed.no_submit'); // 开态另令；本刀关态到此
  }

  async submitLock(request: SpiritRuneRequest, locked: boolean): Promise<SpiritRuneGateResult> {
    if (!isSpiritRuneOpen()) return locked ? SpiritRuneClosed.refuseLock() : SpiritRuneClosed.refuseUnlock();
    return denied('spirit_rune.closed.no_submit');
  }

  /** 关态／开态共用：FX 查询前核 Flag。 */
  hostHasAffix(hostInstanceRef: string): boolean {
    if (!isSpiritRuneOpen()) return false;
    const bag = this.progress.spiritRune?.bags.find(row => row.hostInstanceRef === hostInstanceRef);
    return !!bag?.slots.some(slot => slot.affixId != null);
  }

  #refineOpen(request: SpiritRuneRequest): SpiritRuneGateResult {
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validRequest(request)) return denied('spirit_rune.host_invalid');
    if (!this.validHost(request.hostInstanceRef)) return denied('spirit_rune.host_invalid');
    const bag = this.bagOf(this.progress.spiritRune, request.hostInstanceRef, rules.slotCount);
    const slot = bag.slots[request.slotIndex];
    if (!slot || slot.affixId != null) return denied('spirit_rune.no_slot');
    const scrapNeed = rules.refineCost.scrap ?? 0;
    if (scrapNeed > 0 && this.progress.permanentCount(rules.scrapItemId) < scrapNeed) return denied('spirit_rune.no_scrap');
    const stonesNeed = rules.refineCost.spiritStones ?? 0;
    if (stonesNeed > 0 && this.progress.stones < stonesNeed) return denied('spirit_rune.no_scrap');
    // 开态写路径另令接事务；本刀 Flag 恒关，不会落到此。
    return denied('spirit_rune.closed.no_submit');
  }

  private validRequest(request: SpiritRuneRequest): boolean {
    return !!request && isEnhanceInstanceRef(request.hostInstanceRef)
      && typeof request.slotIndex === 'number' && Number.isSafeInteger(request.slotIndex) && request.slotIndex >= 0;
  }

  private supportedWeapon(itemId: string): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : undefined;
    return !!item && item.type === 'equip' && item.slot === 'weapon' && inPhase(item)
      && item.enabled !== false && item.placeholder !== true;
  }

  private validHost(instanceRef: string): boolean {
    if (!isEnhanceInstanceRef(instanceRef)) return false;
    if (this.progress.formalEnhanceInstanceStatus(instanceRef) !== 'registered') return false;
    const inst = this.progress.formalEnhanceInstances().find(row => row.instanceRef === instanceRef);
    return !!inst && inst.type === 'weapon' && this.supportedWeapon(inst.itemId);
  }

  private bagOf(progress: SpiritRuneProgress | undefined, hostInstanceRef: string, slotCount: number): SpiritRuneHostBag {
    const existing = progress && isValidSpiritRuneProgress(progress)
      ? progress.bags.find(row => row.hostInstanceRef === hostInstanceRef) : undefined;
    if (existing) return copy(existing);
    return {
      hostInstanceRef,
      slots: Array.from({ length: slotCount }, () => ({ affixId: null, locked: false })),
      refineCount: 0, quenchCount: 0,
    };
  }
}

/** 测试辅助：关态下导出空袋工厂（不写盘）。 */
export function spiritRuneEmptyForTest(ledgerId: string, ownerSlot: 1 | 2 | 3): SpiritRuneProgress {
  return emptySpiritRuneProgress(ledgerId, ownerSlot);
}
