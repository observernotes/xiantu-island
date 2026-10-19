import rules from '@xt/balance/market_consign.json';
import { ITEMS, inPhase, t } from './data';
import { Progress } from './Progress';
import { MarketGate, type MarketGateResult, type MarketListRequest } from './MarketGate';
import { featureClosed } from './MarketClosed';
import { isMarketOpenForFixture } from './MarketOpenFlag';
import type { MarketListing } from './MarketProgress';
import { isMarketConsignUiAccessible } from './MarketConsignUiAccess';

export type MarketConsignStage = 'closed' | 'panel' | 'list_pick' | 'confirm' | 'submitting' | 'result';
export type MarketConsignAction = 'list' | 'withdraw' | 'claim';

export interface MarketSlotRow {
  listingId: string;
  itemId: string;
  name: string;
  state: MarketListing['state'];
  slotIndex: number;
  listingPrice: number;
  pendingReward?: number;
}

export interface MarketCandidateRow {
  itemId: string;
  itemInstanceId: string;
  name: string;
  owned: number;
  refPrice: number;
}

export interface MarketPending {
  readonly action: MarketConsignAction;
  readonly session: number;
  readonly slot: number;
  readonly listingId?: string;
  readonly request?: MarketListRequest;
  readonly label: string;
}

export interface MarketConsignState {
  stage: MarketConsignStage;
  slotCapacity: number;
  activeSlots: number;
  slots: MarketSlotRow[];
  candidates: MarketCandidateRow[];
  selectedListingId?: string;
  selectedItemId?: string;
  draftPrice: number;
  details: string[];
  resultLines: string[];
  pending: MarketPending | null;
}

export interface MarketConsignHooks {
  tip: (key: string, vars?: Record<string, string | number>) => void;
  log?: (text: string, color: string) => void;
  changed?: () => void;
  currentProgress?: () => Progress;
}

const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value as object)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};
const itemName = (id: string) => ITEMS[id]?.name ?? id;
const emptyState = (): MarketConsignState => ({
  stage: 'closed', slotCapacity: rules.slotCapacity, activeSlots: 0, slots: [], candidates: [],
  draftPrice: 0, details: [], resultLines: [], pending: null,
});
const activeState = (state: MarketListing['state']) => state === 'listed' || state === 'sold_pending_claim';
const positive = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n > 0;

/** View memory only: open/browse/cancel never pre-holds, occupies slots, or creates half listings. */
export class MarketConsignController {
  private model = emptyState();
  private session = 0;
  private slot = Progress.getActiveSlot();
  private busy = false;

  constructor(private readonly progress: Progress, private readonly hooks: MarketConsignHooks) {}

  get state(): MarketConsignState { return clone(this.model); }
  get pending(): MarketPending | null { return this.model.pending; }

  private emit() { this.hooks.changed?.(); }
  private tip(key: string, vars?: Record<string, string | number>) { this.hooks.tip(key, vars); }
  private log(text: string, color = '#aaaaaa') {
    if (this.hooks.log) this.hooks.log(text, color);
    else this.hooks.tip('market.closed.feature');
  }
  private tipDenied(result: Extract<MarketGateResult, { allowed: false }>) {
    if (typeof result.tipKey === 'string' && result.tipKey.startsWith('market.closed.')) this.tip(result.tipKey);
    else this.log(result.text);
  }
  private gate() { return new MarketGate(this.progress); }
  private reset(stage: MarketConsignStage = 'closed') {
    this.session++; this.model = emptyState(); this.model.stage = stage; this.emit();
  }
  close() { this.reset(); }
  private sameCharacter(): boolean {
    return this.slot === Progress.getActiveSlot() && (!this.hooks.currentProgress || this.hooks.currentProgress() === this.progress);
  }
  private guard(notify = true): boolean {
    if (!isMarketConsignUiAccessible('entrance') || !isMarketConsignUiAccessible('panel')) {
      this.reset(); if (notify) this.tip('market.closed.feature'); return false;
    }
    if (!isMarketOpenForFixture()) {
      this.reset(); if (notify) this.log(featureClosed().text); return false;
    }
    if (!this.sameCharacter()) {
      this.reset(); if (notify) this.tip('market.closed.load_refresh'); return false;
    }
    return true;
  }

  /** Scene entrance: only open when Flag/UI allow; feature() is read-only. */
  open(): boolean {
    if (!isMarketConsignUiAccessible('entrance') || !isMarketConsignUiAccessible('panel')) {
      this.tip('market.closed.feature'); return false;
    }
    if (!isMarketOpenForFixture()) { this.log(featureClosed().text); return false; }
    if (!this.sameCharacter()) { this.tip('market.closed.load_refresh'); return false; }
    const feature = this.gate().feature();
    if (!feature.allowed) { this.tipDenied(feature); return false; }
    this.reset('panel');
    this.reload();
    return true;
  }

  poll(): boolean {
    return this.model.stage === 'closed' || this.guard(false);
  }

  private reload() {
    const slots = this.gate().slotOrItem();
    const loaded = this.gate().loadProgress();
    const rewards = this.gate().rewards();
    this.model.slotCapacity = slots.allowed ? (slots.slotCapacity ?? rules.slotCapacity) : rules.slotCapacity;
    this.model.activeSlots = slots.allowed ? (slots.activeSlots ?? 0) : 0;
    const market = loaded.allowed ? loaded.progress : undefined;
    const pendingByRef = new Map((market?.pendingRewards ?? []).map(row => [row.ref, row]));
    this.model.slots = (market?.listings ?? [])
      .filter(row => activeState(row.state))
      .sort((a, b) => a.slotIndex - b.slotIndex)
      .map(row => ({
        listingId: row.listingId, itemId: row.itemId, name: itemName(row.itemId), state: row.state,
        slotIndex: row.slotIndex, listingPrice: row.listingPrice,
        pendingReward: row.pendingRewardRef ? pendingByRef.get(row.pendingRewardRef)?.amount : undefined,
      }));
    this.model.candidates = this.buildCandidates(market?.listings ?? []);
    if (this.model.selectedListingId && !this.model.slots.some(row => row.listingId === this.model.selectedListingId)) {
      this.model.selectedListingId = undefined;
    }
    if (this.model.selectedItemId && !this.model.candidates.some(row => row.itemId === this.model.selectedItemId)) {
      this.model.selectedItemId = undefined;
    }
    this.updateDetails();
    void rewards;
  }

  private buildCandidates(listings: MarketListing[]): MarketCandidateRow[] {
    const used = new Set(listings.map(row => row.itemInstanceId));
    const rows: MarketCandidateRow[] = [];
    for (const itemId of Object.keys(this.progress.inventory)) {
      const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : undefined;
      const owned = this.progress.permanentCount(itemId);
      if (!item || !positive(owned) || !positive(item.price) || !inPhase(item)
        || item.enabled === false || item.placeholder === true) continue;
      if (this.progress.count(itemId) !== owned) continue;
      const historical = listings.filter(row => row.itemId === itemId).length;
      let instanceId: string | undefined;
      for (let share = 1; share <= owned + historical; share++) {
        const id = `${itemId}#${share}`;
        if (!used.has(id)) { instanceId = id; break; }
      }
      if (!instanceId) continue;
      rows.push({ itemId, itemInstanceId: instanceId, name: itemName(itemId), owned, refPrice: item.price });
    }
    return rows.sort((a, b) => a.name.localeCompare(b.name, 'zh'));
  }

  private updateDetails() {
    const lines = [
      `栏位 ${this.model.activeSlots}/${this.model.slotCapacity}`,
      '打开／浏览／取消不占栏、不预扣。',
      '上架／撤回／领取须确认后经坊市 Gate。',
    ];
    const selected = this.model.slots.find(row => row.listingId === this.model.selectedListingId);
    if (selected) {
      lines.push(`选中栏位 #${selected.slotIndex + 1} · ${selected.name}`);
      lines.push(selected.state === 'listed' ? `待售 · 挂牌 ${selected.listingPrice}` : `待领 · ${selected.pendingReward ?? '?'}`);
    }
    const candidate = this.model.candidates.find(row => row.itemId === this.model.selectedItemId);
    if (candidate) {
      const min = candidate.refPrice * rules.listingPrice.minRatioOfNpcSell;
      const max = candidate.refPrice * rules.listingPrice.maxRatioOfNpcSell;
      lines.push(`上架候选 · ${candidate.name} ×${candidate.owned}`);
      lines.push(`挂牌价 ${this.model.draftPrice}（参考 ${candidate.refPrice}，区间 ${min}–${max}）`);
    }
    if (this.model.pending) lines.push(this.model.pending.label);
    this.model.details = lines;
  }

  selectListing(listingId: string): boolean {
    if (!this.guard() || this.model.stage === 'submitting' || this.busy) return false;
    this.reload();
    const row = this.model.slots.find(item => item.listingId === listingId);
    if (!row) { this.tip('market.closed.slot_or_item'); return false; }
    this.model.selectedListingId = listingId;
    this.model.selectedItemId = undefined;
    this.model.pending = null;
    this.model.stage = 'panel';
    this.model.resultLines = [];
    this.updateDetails(); this.emit(); return true;
  }

  beginList(): boolean {
    if (!this.guard() || this.busy) return false;
    this.reload();
    if (this.model.activeSlots >= this.model.slotCapacity) { this.tip('market.closed.slot_or_item'); return false; }
    if (!this.model.candidates.length) { this.tip('market.closed.slot_or_item'); return false; }
    this.model.stage = 'list_pick';
    this.model.pending = null;
    this.model.selectedListingId = undefined;
    this.model.resultLines = [];
    if (!this.model.selectedItemId) {
      const first = this.model.candidates[0];
      this.model.selectedItemId = first.itemId;
      this.model.draftPrice = first.refPrice;
    } else {
      const row = this.model.candidates.find(item => item.itemId === this.model.selectedItemId);
      if (row) this.model.draftPrice = this.model.draftPrice || row.refPrice;
    }
    this.updateDetails(); this.emit(); return true;
  }

  selectCandidate(itemId: string): boolean {
    if (!this.guard() || this.model.stage !== 'list_pick' || this.busy) return false;
    this.reload();
    const row = this.model.candidates.find(item => item.itemId === itemId);
    if (!row) { this.tip('market.closed.slot_or_item'); return false; }
    this.model.selectedItemId = itemId;
    this.model.draftPrice = row.refPrice;
    this.model.pending = null;
    this.updateDetails(); this.emit(); return true;
  }

  adjustPrice(delta: number): boolean {
    if (!this.guard() || this.model.stage !== 'list_pick' || this.busy) return false;
    const row = this.model.candidates.find(item => item.itemId === this.model.selectedItemId);
    if (!row || !Number.isFinite(delta) || delta === 0) return false;
    const min = row.refPrice * rules.listingPrice.minRatioOfNpcSell;
    const max = row.refPrice * rules.listingPrice.maxRatioOfNpcSell;
    const next = Math.min(max, Math.max(min, this.model.draftPrice + delta));
    this.model.draftPrice = Math.round(next * 1000) / 1000;
    this.model.pending = null;
    this.updateDetails(); this.emit(); return true;
  }

  requestConfirm(action: MarketConsignAction): MarketPending | null {
    if (!this.guard() || this.busy || this.model.stage === 'submitting') return null;
    this.reload();
    if (action === 'list') {
      const row = this.model.candidates.find(item => item.itemId === this.model.selectedItemId);
      if (!row || this.model.stage !== 'list_pick') { this.tip('market.closed.list'); return null; }
      const request: MarketListRequest = {
        itemId: row.itemId, itemInstanceId: row.itemInstanceId, listingPrice: this.model.draftPrice,
      };
      const pending = freeze({
        action, session: this.session, slot: this.slot, request,
        label: `确认上架 ${row.name}？挂牌 ${request.listingPrice}`,
      } satisfies MarketPending);
      this.model.pending = pending; this.model.stage = 'confirm'; this.model.resultLines = [];
      this.updateDetails(); this.emit(); return pending;
    }
    const listing = this.model.slots.find(row => row.listingId === this.model.selectedListingId);
    if (!listing) { this.tip(action === 'withdraw' ? 'market.closed.withdraw' : 'market.closed.claim'); return null; }
    if (action === 'withdraw' && listing.state !== 'listed') { this.tip('market.closed.withdraw'); return null; }
    if (action === 'claim' && listing.state !== 'sold_pending_claim') { this.tip('market.closed.claim'); return null; }
    const pending = freeze({
      action, session: this.session, slot: this.slot, listingId: listing.listingId,
      label: action === 'withdraw' ? `确认撤回 ${listing.name}？` : `确认领取 ${listing.name} 收益？`,
    } satisfies MarketPending);
    this.model.pending = pending; this.model.stage = 'confirm'; this.model.resultLines = [];
    this.updateDetails(); this.emit(); return pending;
  }

  async submit(pending: MarketPending | null = this.model.pending): Promise<MarketGateResult | null> {
    if (!this.guard()) return null;
    if (this.busy || this.model.stage === 'submitting') { this.log('正在处理寄售，请稍候。'); return null; }
    if (!pending || pending !== this.model.pending || pending.session !== this.session || pending.slot !== this.slot) {
      this.tip('market.closed.load_refresh'); return null;
    }
    const session = this.session;
    this.busy = true; this.model.stage = 'submitting'; this.emit();
    let result: MarketGateResult;
    try {
      const gate = this.gate();
      if (pending.action === 'list' && pending.request) result = await gate.listItem(pending.request);
      else if (pending.action === 'withdraw' && pending.listingId) result = await gate.withdraw(pending.listingId);
      else if (pending.action === 'claim' && pending.listingId) result = await gate.claim(pending.listingId);
      else { this.tip('market.closed.feature'); result = { allowed: false, tipKey: 'market.closed.feature', text: featureClosed().text }; }
    } catch {
      if (session === this.session && this.guard(false)) {
        this.model.stage = 'panel'; this.model.pending = null; this.log('寄售保存失败，请重试。'); this.reload(); this.emit();
      }
      return null;
    } finally { this.busy = false; }
    if (session !== this.session || !this.guard(false)) return result;
    this.model.pending = null;
    if (result.allowed) {
      const lines = [`操作成功：${pending.action === 'list' ? '上架' : pending.action === 'withdraw' ? '撤回' : '领取'}`];
      if (result.listing) lines.push(`${itemName(result.listing.itemId)} · ${result.listing.state}`);
      if (result.rewardAmount != null) lines.push(`收益 ${result.rewardAmount}`);
      this.model.stage = 'result'; this.model.resultLines = lines;
      this.model.selectedListingId = undefined; this.model.selectedItemId = undefined;
      this.reload(); this.emit(); return result;
    }
    this.model.stage = 'panel'; this.model.resultLines = [];
    this.tipDenied(result); this.reload(); this.emit(); return result;
  }

  back(): void {
    if (this.model.stage === 'closed') return;
    if (!this.guard()) return;
    if (this.model.stage === 'submitting') { this.close(); return; }
    if (this.model.stage === 'confirm' || this.model.stage === 'result' || this.model.stage === 'list_pick') {
      this.model.stage = 'panel'; this.model.pending = null; this.model.resultLines = [];
      this.reload(); this.emit(); return;
    }
    this.close();
  }
}
