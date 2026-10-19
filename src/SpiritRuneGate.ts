import strings from '@xt/balance/strings_zh.json';
import { ITEMS, inPhase } from './data';
import { featureEnabled } from './features';
import type { Progress } from './Progress';
import { isEnhanceId, isEnhanceInstanceRef } from './EnhanceProgress';
import { isSpiritRuneOpen } from './SpiritRuneAccess';
import * as SpiritRuneClosed from './SpiritRuneClosed';
import {
  emptySpiritRuneProgress, isValidSpiritRuneProgress, type SpiritRuneHostBag, type SpiritRuneProgress, type SpiritRuneSlot,
} from './SpiritRuneProgress';
import { loadSpiritRuneRules, pickWeightedAffix, type SpiritRuneCost, type SpiritRuneRules } from './SpiritRuneRules';

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
 * 生产默认关（无注入）；开态测夹具注入后走真写路径。
 * softOpenedSpiritRune 恒 false；不建 OpenFlag 文件。
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
    // fixture／无档：同步写 draft（IDB 开态请走 submitRefine）；拒绝则回滚本机内存
    const before = structuredClone(Object.fromEntries(
      Object.entries(this.progress).filter(([, value]) => typeof value !== 'function'),
    ));
    const result = this.#refineOpen(this.progress, request);
    if (!result.allowed) {
      for (const key of Object.keys(this.progress)) {
        if (!Object.prototype.hasOwnProperty.call(before, key)) Reflect.deleteProperty(this.progress, key);
      }
      Object.assign(this.progress, before);
    }
    return result;
  }

  async submitRefine(request: SpiritRuneRequest): Promise<SpiritRuneGateResult> {
    if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseSubmit();
    if (this.#busy) return denied('spirit_rune.closed.no_submit', '灵纹祭炼处理中，请稍候。');
    return this.#transact(draft => this.#refineOpen(draft, request));
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
    if (!confirm?.accept) return denied('spirit_rune.quench.preview', '已取消淬炼，未扣材料。');
    if (this.#busy) return denied('spirit_rune.closed.no_submit', '灵纹祭炼处理中，请稍候。');
    return this.#transact(draft => this.#quenchOpen(draft, confirm));
  }

  async submitLock(request: SpiritRuneRequest, locked: boolean): Promise<SpiritRuneGateResult> {
    if (!isSpiritRuneOpen()) return locked ? SpiritRuneClosed.refuseLock() : SpiritRuneClosed.refuseUnlock();
    if (this.#busy) return denied('spirit_rune.closed.no_submit', '灵纹祭炼处理中，请稍候。');
    return this.#transact(draft => this.#lockOpen(draft, request, locked));
  }

  /** 关态／开态共用：FX 查询前核 Flag。 */
  hostHasAffix(hostInstanceRef: string): boolean {
    if (!isSpiritRuneOpen()) return false;
    const bag = this.progress.spiritRune?.bags.find(row => row.hostInstanceRef === hostInstanceRef);
    return !!bag?.slots.some(slot => slot.affixId != null);
  }

  /** 开态炼化写路径：扣耗＋空槽写入 affix（禁动 enhance／enchant／equip）。 */
  #refineOpen(draft: Progress, request: SpiritRuneRequest): SpiritRuneGateResult {
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validRequest(request)) return denied('spirit_rune.host_invalid');
    if (!this.validHostOn(draft, request.hostInstanceRef)) return denied('spirit_rune.host_invalid');
    const bag = this.bagOf(draft.spiritRune, request.hostInstanceRef, rules.slotCount);
    const slot = bag.slots[request.slotIndex];
    if (!slot || slot.affixId != null) return denied('spirit_rune.no_slot');
    if (!this.canPay(draft, rules.refineCost, rules.scrapItemId)) return denied('spirit_rune.no_scrap');
    const picked = pickWeightedAffix(rules, this.fixture.random ?? Math.random);
    if (!picked) return denied('spirit_rune.rules_missing');
    const enhanceSnap = copy(draft.enhance);
    const enchantSnap = copy(draft.enchant);
    const equipSnap = copy(draft.equip);
    this.pay(draft, rules.refineCost, rules.scrapItemId);
    slot.affixId = picked.id;
    bag.refineCount += 1;
    const progress = this.upsertBag(draft, bag, rules.slotCount);
    if (JSON.stringify(draft.enhance) !== JSON.stringify(enhanceSnap)
      || JSON.stringify(draft.enchant) !== JSON.stringify(enchantSnap)
      || JSON.stringify(draft.equip) !== JSON.stringify(equipSnap)) {
      return denied('spirit_rune.closed.no_submit', '灵纹炼化结果校验失败，保持原状。');
    }
    if (!isValidSpiritRuneProgress(progress)) return denied('spirit_rune.rules_missing');
    return {
      allowed: true,
      tipKey: 'spirit_rune.refine.ok',
      text: textOf('spirit_rune.refine.ok'),
      affixId: picked.id,
      bag: copy(bag),
      progress: copy(progress),
      slot: copy(slot),
    };
  }

  #quenchOpen(draft: Progress, confirm: SpiritRuneQuenchConfirm): SpiritRuneGateResult {
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validRequest(confirm)) return denied('spirit_rune.host_invalid');
    if (!this.validHostOn(draft, confirm.hostInstanceRef)) return denied('spirit_rune.host_invalid');
    if (typeof confirm.previousAffixId !== 'string' || typeof confirm.nextAffixId !== 'string') {
      return denied('spirit_rune.quench.preview', '淬炼确认无效。');
    }
    if (!rules.affixes.some(row => row.id === confirm.nextAffixId)) return denied('spirit_rune.rules_missing');
    const bag = this.bagOf(draft.spiritRune, confirm.hostInstanceRef, rules.slotCount);
    const slot = bag.slots[confirm.slotIndex];
    if (!slot || slot.affixId == null) return denied('spirit_rune.no_slot', textOf('spirit_rune.no_slot'));
    if (slot.locked) return denied('spirit_rune.all_locked', '该槽已锁定，淬炼跳过。');
    if (slot.affixId !== confirm.previousAffixId) {
      return denied('spirit_rune.quench.preview', '淬炼确认与当前词条不一致。');
    }
    if (!this.canPay(draft, rules.quenchCost, rules.scrapItemId)) return denied('spirit_rune.no_scrap');
    const enhanceSnap = copy(draft.enhance);
    const enchantSnap = copy(draft.enchant);
    const equipSnap = copy(draft.equip);
    const enhanceLevel = draft.enhance?.instances.find(row => row.instanceRef === confirm.hostInstanceRef)?.enhanceLevel;
    this.pay(draft, rules.quenchCost, rules.scrapItemId);
    const previousAffixId = slot.affixId;
    slot.affixId = confirm.nextAffixId;
    bag.quenchCount += 1;
    const progress = this.upsertBag(draft, bag, rules.slotCount);
    const levelAfter = draft.enhance?.instances.find(row => row.instanceRef === confirm.hostInstanceRef)?.enhanceLevel;
    if (enhanceLevel !== undefined && levelAfter !== enhanceLevel) {
      return denied('spirit_rune.closed.no_submit', '淬炼不得改动强化档。');
    }
    if (JSON.stringify(draft.enhance) !== JSON.stringify(enhanceSnap)
      || JSON.stringify(draft.enchant) !== JSON.stringify(enchantSnap)
      || JSON.stringify(draft.equip) !== JSON.stringify(equipSnap)) {
      return denied('spirit_rune.closed.no_submit', '淬炼结果校验失败，保持原状。');
    }
    if (!isValidSpiritRuneProgress(progress)) return denied('spirit_rune.rules_missing');
    return {
      allowed: true,
      tipKey: 'spirit_rune.quench.ok',
      text: textOf('spirit_rune.quench.ok'),
      previousAffixId,
      nextAffixId: confirm.nextAffixId,
      affixId: confirm.nextAffixId,
      bag: copy(bag),
      progress: copy(progress),
      slot: copy(slot),
    };
  }

  #lockOpen(draft: Progress, request: SpiritRuneRequest, locked: boolean): SpiritRuneGateResult {
    const rules = this.rules();
    if (!rules) return denied('spirit_rune.rules_missing');
    if (!this.validRequest(request)) return denied('spirit_rune.host_invalid');
    if (!this.validHostOn(draft, request.hostInstanceRef)) return denied('spirit_rune.host_invalid');
    const bag = this.bagOf(draft.spiritRune, request.hostInstanceRef, rules.slotCount);
    const slot = bag.slots[request.slotIndex];
    if (!slot || slot.affixId == null) return denied('spirit_rune.no_slot', '空槽不可锁定／解锁。');
    const tipKey = locked ? 'spirit_rune.lock.ok' : 'spirit_rune.unlock.ok';
    if (slot.locked === locked) {
      // 幂等：已达目标态，不重扣
      const progress = draft.spiritRune && isValidSpiritRuneProgress(draft.spiritRune)
        ? draft.spiritRune : this.upsertBag(draft, bag, rules.slotCount);
      return {
        allowed: true, tipKey, text: textOf(tipKey),
        bag: copy(bag), progress: copy(progress), slot: copy(slot),
      };
    }
    const cost = locked ? rules.lockCost : rules.unlockCost;
    if (!this.canPay(draft, cost, rules.scrapItemId)) return denied('spirit_rune.no_scrap');
    this.pay(draft, cost, rules.scrapItemId);
    slot.locked = locked;
    const progress = this.upsertBag(draft, bag, rules.slotCount);
    if (!isValidSpiritRuneProgress(progress)) return denied('spirit_rune.rules_missing');
    return {
      allowed: true, tipKey, text: textOf(tipKey),
      bag: copy(bag), progress: copy(progress), slot: copy(slot),
    };
  }

  async #transact(
    apply: (draft: Progress) => SpiritRuneGateResult,
  ): Promise<SpiritRuneGateResult> {
    if (this.#busy) return denied('spirit_rune.closed.no_submit', '灵纹祭炼处理中，请稍候。');
    this.#busy = true;
    const snap = (p: Progress) => structuredClone(Object.fromEntries(
      Object.entries(p).filter(([, value]) => typeof value !== 'function'),
    ));
    const restore = (p: Progress, before: Record<string, unknown>) => {
      for (const key of Object.keys(p)) {
        if (!Object.prototype.hasOwnProperty.call(before, key)) Reflect.deleteProperty(p, key);
      }
      Object.assign(p, before);
    };
    const applySync = (): SpiritRuneGateResult => {
      const before = snap(this.progress);
      const result = apply(this.progress);
      if (!result.allowed) restore(this.progress, before);
      return result;
    };
    try {
      if (!isSpiritRuneOpen()) return SpiritRuneClosed.refuseSubmit();
      // 有 IDB 时先走事务落盘；写盘失败／无档／SSR 夹具则回落同步写 draft
      if (featureEnabled('indexedDbSaves')) {
        let rejection: SpiritRuneDenied | undefined;
        let expected: string | undefined;
        try { expected = JSON.stringify(this.progress.exportSave()); } catch { expected = undefined; }
        try {
          const saved = await this.progress.runSaveTransactionAsync(draft => {
            if (!isSpiritRuneOpen()) {
              rejection = SpiritRuneClosed.refuseSubmit();
              return undefined;
            }
            const before = snap(draft);
            const result = apply(draft);
            if (!result.allowed) {
              restore(draft, before);
              rejection = result;
              return undefined;
            }
            return result;
          }, expected);
          if (saved) return saved;
          if (rejection) return rejection;
        } catch {
          /* 回落同步 */
        }
      }
      return applySync();
    } catch {
      return denied('spirit_rune.closed.no_submit', '灵纹祭炼保存失败，保持原状。');
    } finally {
      this.#busy = false;
    }
  }

  private canPay(draft: Progress, cost: SpiritRuneCost, scrapItemId: string): boolean {
    const scrap = cost.scrap ?? 0;
    const stones = cost.spiritStones ?? 0;
    if (scrap > 0 && !(draft.permanentCount(scrapItemId) >= scrap)) return false;
    if (stones > 0 && !(draft.stones >= stones)) return false;
    return true;
  }

  private pay(draft: Progress, cost: SpiritRuneCost, scrapItemId: string): void {
    const scrap = cost.scrap ?? 0;
    const stones = cost.spiritStones ?? 0;
    if (scrap > 0) draft.removeItem(scrapItemId, scrap);
    if (stones > 0) draft.stones -= stones;
  }

  private upsertBag(draft: Progress, bag: SpiritRuneHostBag, slotCount: number): SpiritRuneProgress {
    void slotCount;
    let progress = draft.spiritRune;
    if (!progress || !isValidSpiritRuneProgress(progress)) {
      const ledgerId = this.ledgerIdFor(draft);
      const ownerSlot = this.ownerSlotFor(draft);
      progress = emptySpiritRuneProgress(ledgerId, ownerSlot);
    }
    const bags = progress.bags.map(row => copy(row));
    const index = bags.findIndex(row => row.hostInstanceRef === bag.hostInstanceRef);
    if (index >= 0) bags[index] = copy(bag);
    else bags.push(copy(bag));
    const next: SpiritRuneProgress = {
      version: 1,
      ledgerId: progress.ledgerId,
      ownerSlot: progress.ownerSlot,
      bags,
      receipts: [...progress.receipts],
    };
    draft.spiritRune = next;
    return next;
  }

  private ledgerIdFor(draft: Progress): string {
    const fromFixture = this.fixture.ledgerId?.();
    if (fromFixture && isEnhanceId(fromFixture)) return fromFixture;
    if (draft.spiritRune && isEnhanceId(draft.spiritRune.ledgerId)) return draft.spiritRune.ledgerId;
    if (draft.enhance && isEnhanceId(draft.enhance.ledgerId)) return draft.enhance.ledgerId;
    return 'spirit_rune_ledger';
  }

  private ownerSlotFor(draft: Progress): 1 | 2 | 3 {
    if (draft.spiritRune && [1, 2, 3].includes(draft.spiritRune.ownerSlot)) return draft.spiritRune.ownerSlot;
    const slot = draft.getSaveSlot();
    return slot === 2 || slot === 3 ? slot : 1;
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
    return this.validHostOn(this.progress, instanceRef);
  }

  private validHostOn(progress: Progress, instanceRef: string): boolean {
    if (!isEnhanceInstanceRef(instanceRef)) return false;
    if (progress.formalEnhanceInstanceStatus(instanceRef) !== 'registered') return false;
    const inst = progress.formalEnhanceInstances().find(row => row.instanceRef === instanceRef);
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
