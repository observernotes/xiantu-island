import rules from '@xt/balance/market_consign.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
import { emptyMarketProgress, isValidMarketProgress, type MarketListing, type MarketProgress } from './MarketProgress';
import { isMarketOpenForFixture } from './MarketOpenFlag';
import * as MarketClosed from './MarketClosed';

export interface MarketFixtureOptions {
  /** 夹具显式允许集；不存在正式品类授权，缺省不允许任何配置上架。 */
  fixtureAllowedItemIds?: readonly string[];
  /** 毫秒时钟与 [0,1] 随机源，仅在开态事务中使用。 */
  now?: () => number;
  random?: () => number;
  ledgerId?: () => string;
  /** 当前背包没有格数上限；仅夹具用哨兵模拟返物或收益承载失败。 */
  canReturnItem?: (draft: Progress, itemId: string) => boolean;
  canReceiveReward?: (draft: Progress, amount: number) => boolean;
}
export interface MarketListRequest { itemId: string; itemInstanceId: string; listingPrice: number; }
export interface MarketSettlementRequest { offlineElapsedSec?: number; }
export interface MarketAllowed {
  allowed: true;
  listing?: MarketListing;
  progress?: MarketProgress;
  rewardAmount?: number;
  slotCapacity?: number;
  activeSlots?: number;
}
export interface MarketDenied { allowed: false; tipKey: string; text: string; }
export type MarketGateResult = MarketAllowed | MarketDenied;
const copy = <T>(value: T): T => structuredClone(value);
const denied = (reason: string, text: string): MarketDenied => ({ allowed: false, tipKey: `market.fixture.${reason}`, text });
const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const positive = (n: unknown): n is number => nonnegative(n) && n > 0;
const safeId = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z][\w.-]{0,127}$/.test(value)
  && !['__proto__', 'prototype', 'constructor'].includes(value);
const active = (entry: MarketListing) => entry.state === 'listed' || entry.state === 'sold_pending_claim';

/** 无前台接线。正式每入口首先走 Closed；只有 Vite SSR 内存图可进入真实 Progress 事务。 */
export class MarketGate {
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: MarketFixtureOptions = {}) {}

  feature(): MarketGateResult {
    if (!isMarketOpenForFixture()) return MarketClosed.featureClosed();
    if (!this.validRules()) return denied('rules', '寄售依赖未就绪。');
    return { allowed: true, slotCapacity: rules.slotCapacity };
  }

  async listItem(request: MarketListRequest): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseList();
    return this.transact((draft, reject) => {
      if (!request || !safeId(request.itemId) || !this.supportedItem(draft, request.itemId)
        || !positive(request.listingPrice) || typeof request.itemInstanceId !== 'string') return reject('item', '物品或挂牌价不可用于本夹具。');
      const now = this.now();
      if (!nonnegative(now)) return reject('time', '寄售时钟不可用。');
      const current = this.current(draft);
      if (current?.listings.some(row => row.itemInstanceId === request.itemInstanceId)) return reject('duplicate_instance', '同一库存份额不能重复上架。');
      const available = draft.permanentCount(request.itemId);
      if (!Number.isSafeInteger(available) || available < 1 || draft.count(request.itemId) !== available) return reject('ownership', '没有可独立追踪的永久库存份额。');
      const share = Number(request.itemInstanceId.slice(request.itemId.length + 1));
      const historical = current?.listings.filter(row => row.itemId === request.itemId).length ?? 0;
      if (!Number.isSafeInteger(share) || share < 1 || request.itemInstanceId !== `${request.itemId}#${share}`
        || share > available + historical) return reject('instance', '库存份额身份无效。');
      const occupied = new Set(current?.listings.filter(active).map(row => row.slotIndex));
      let slot = 0;
      while (occupied.has(slot)) slot++;
      if (slot >= rules.slotCapacity) return reject('full', '寄售栏已满。');
      const ledgerId = current?.ledgerId ?? (this.fixture.ledgerId?.() ?? `market_${crypto.randomUUID()}`);
      if (!safeId(ledgerId)) return reject('identity', '寄售账本身份无效。');
      const market = current ?? emptyMarketProgress(ledgerId);
      if (!Number.isSafeInteger(market.nextListingSeq + 1)) return reject('identity', '寄售身份已达安全上限。');
      const listingId = `${ledgerId}:listing:${market.nextListingSeq++}`;
      const reference = ITEMS[request.itemId].price!;
      const listing: MarketListing = {
        listingId, itemId: request.itemId, itemInstanceId: request.itemInstanceId, state: 'listed',
        heldItemRef: `${listingId}:held`, slotIndex: slot, listedAt: now,
        listingPrice: Math.max(reference * rules.listingPrice.minRatioOfNpcSell,
          Math.min(reference * rules.listingPrice.maxRatioOfNpcSell, request.listingPrice)),
      };
      draft.removeItem(request.itemId, 1);
      market.listings.push(listing);
      market.heldItems.push({ ref: listing.heldItemRef, listingId, itemId: listing.itemId,
        itemInstanceId: listing.itemInstanceId, disposition: 'held' });
      draft.market = market;
      return { allowed: true, listing: copy(listing), progress: copy(market) };
    });
  }

  async withdraw(listingId: string): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseWithdraw();
    return this.transact((draft, reject) => {
      const market = this.current(draft), listing = market?.listings.find(row => row.listingId === listingId);
      if (!market || !listing || listing.state !== 'listed') return reject('withdraw_state', '当前单据不可撤回。');
      if (!this.supportedItem(draft, listing.itemId)) return reject('item', '扣押物无法原样归还。');
      if (!draft.canAddCraftedItem(listing.itemId, 1) || this.fixture.canReturnItem?.(draft, listing.itemId) === false) {
        return reject('return_capacity', '返物承载失败，寄售单保持待售。');
      }
      if (!draft.addCraftedItem(listing.itemId, 1)) return reject('return_capacity', '返物承载失败，寄售单保持待售。');
      listing.state = 'withdrawn';
      market.heldItems.find(row => row.ref === listing.heldItemRef)!.disposition = 'returned';
      draft.market = market;
      return { allowed: true, listing: copy(listing), progress: copy(market) };
    });
  }

  /** 仅显式夹具回调。没有生产定时器；成交不自动领取，随机数只在这次有效转移中抽一次。 */
  async settle(listingId: string, request: MarketSettlementRequest = {}): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseDeal();
    return this.transact((draft, reject) => {
      const market = this.current(draft), listing = market?.listings.find(row => row.listingId === listingId);
      if (!market || !listing || listing.state !== 'listed') return reject('settle_state', '当前单据不可成交。');
      if (!this.supportedItem(draft, listing.itemId)) return reject('item', '扣押物品类未获夹具授权。');
      const now = this.now();
      if (!request || !nonnegative(now) || now < listing.listedAt) return reject('time', '寄售时钟不可用。');
      let elapsedSec = (now - listing.listedAt) / 1000;
      if (Object.prototype.hasOwnProperty.call(request, 'offlineElapsedSec')) {
        if (!nonnegative(request.offlineElapsedSec)) return reject('time', '离线结算时间无效。');
        // 离线夹具必须同时受实际时间差与寄售专属窗口约束，不借其它玩法上限。
        elapsedSec = Math.min(elapsedSec, request.offlineElapsedSec, rules.offlineSettlementWindowSec);
      }
      if (elapsedSec < rules.saleDelaySec) return reject('too_early', '尚未达到寄售最短等待时间。');
      const random = this.fixture.random?.() ?? Math.random();
      if (!nonnegative(random) || random > 1) return reject('random', '市价抽样不可用。');
      const marketFactor = rules.rewardAmount.marketFactorMin
        + (rules.rewardAmount.marketFactorMax - rules.rewardAmount.marketFactorMin) * random;
      const amount = listing.listingPrice * (1 - rules.consignFee) * marketFactor;
      if (!positive(amount)) return reject('reward', '成交收益不可用。');
      listing.state = 'sold_pending_claim';
      listing.pendingRewardRef = `${listing.listingId}:reward`;
      listing.settlementRef = `${listing.listingId}:settlement`;
      market.heldItems.find(row => row.ref === listing.heldItemRef)!.disposition = 'departed';
      market.pendingRewards.push({ ref: listing.pendingRewardRef, listingId, amount, claimed: false });
      market.settlements.push({ ref: listing.settlementRef, listingId, rewardRef: listing.pendingRewardRef, marketFactor });
      draft.market = market;
      return { allowed: true, listing: copy(listing), progress: copy(market), rewardAmount: amount };
    });
  }

  async claim(listingId: string): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseClaim();
    return this.transact((draft, reject) => {
      const market = this.current(draft), listing = market?.listings.find(row => row.listingId === listingId);
      if (!market || !listing || listing.state !== 'sold_pending_claim') return reject('no_reward', '当前单据没有可领取收益。');
      const reward = market.pendingRewards.find(row => row.ref === listing.pendingRewardRef)!;
      if (!nonnegative(draft.stones) || !nonnegative(draft.stones + reward.amount)
        || draft.stones + reward.amount === draft.stones
        || this.fixture.canReceiveReward?.(draft, reward.amount) === false) return reject('reward_capacity', '收益承载失败，待领项保持不变。');
      draft.stones += reward.amount;
      reward.claimed = true;
      listing.state = 'claimed';
      listing.claimRef = `${listing.listingId}:claim`;
      market.claims.push({ ref: listing.claimRef, listingId, rewardRef: reward.ref, amount: reward.amount });
      draft.market = market;
      return { allowed: true, listing: copy(listing), progress: copy(market), rewardAmount: reward.amount };
    });
  }

  rewards(): MarketGateResult {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseReward();
    if (!this.valid(this.progress)) return denied('progress', '寄售档案不完整，已阻止歧义操作。');
    const market = this.current(this.progress);
    return { allowed: true, progress: market, rewardAmount: market?.pendingRewards.filter(row => !row.claimed).reduce((sum, row) => sum + row.amount, 0) ?? 0 };
  }

  loadProgress(): MarketGateResult {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseLoadRefresh();
    if (!this.valid(this.progress)) return denied('progress', '寄售档案不完整，已阻止歧义操作。');
    return { allowed: true, progress: this.current(this.progress) };
  }

  slotOrItem(): MarketGateResult {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseSlotOrItem();
    if (!this.valid(this.progress)) return denied('progress', '寄售档案不完整，已阻止歧义操作。');
    return { allowed: true, slotCapacity: rules.slotCapacity,
      activeSlots: this.progress.market?.listings.filter(active).length ?? 0 };
  }

  private now(): number { return this.fixture.now?.() ?? Date.now(); }
  private current(progress: Progress): MarketProgress | undefined { return progress.market === undefined ? undefined : copy(progress.market); }
  private valid(progress: Progress): boolean {
    if (!this.validRules()) return false;
    if (progress.market === undefined) return true;
    if (!isValidMarketProgress(progress.market)) return false;
    // Progress 的袋校验不依赖寄售表，避免给旧图新增数值表依赖；开态写在这里读表校验完整业务语义。
    return progress.market.listings.every(listing => {
      const item = Object.prototype.hasOwnProperty.call(ITEMS, listing.itemId) ? ITEMS[listing.itemId] : undefined;
      if (!item || !positive(item.price) || listing.slotIndex >= rules.slotCapacity
        || listing.listingPrice < item.price * rules.listingPrice.minRatioOfNpcSell
        || listing.listingPrice > item.price * rules.listingPrice.maxRatioOfNpcSell) return false;
      if (listing.state === 'listed' || listing.state === 'withdrawn') return true;
      const settlement = progress.market!.settlements.find(row => row.ref === listing.settlementRef)!;
      const reward = progress.market!.pendingRewards.find(row => row.ref === listing.pendingRewardRef)!;
      const expected = listing.listingPrice * (1 - rules.consignFee) * settlement.marketFactor;
      return settlement.marketFactor >= rules.rewardAmount.marketFactorMin
        && settlement.marketFactor <= rules.rewardAmount.marketFactorMax && positive(expected)
        && Math.abs(reward.amount - expected) <= Number.EPSILON * Math.max(1, reward.amount, expected) * 8;
    });
  }
  private supportedItem(progress: Progress, itemId: string): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : undefined;
    return this.fixture.fixtureAllowedItemIds?.includes(itemId) === true && !!item && inPhase(item)
      && item.enabled !== false && item.placeholder !== true && positive(item.price)
      && item.qualityEnabled !== true && !Object.prototype.hasOwnProperty.call(progress.pillQualities, itemId)
      && !Object.values(progress.equip).includes(itemId);
  }
  private validRules(): boolean {
    return rules.enabled === false && rules.listingPrice.mode === 'player_set' && rules.listingPrice.reference === 'items.price'
      && positive(rules.listingPrice.minRatioOfNpcSell) && positive(rules.listingPrice.maxRatioOfNpcSell)
      && rules.listingPrice.minRatioOfNpcSell <= rules.listingPrice.maxRatioOfNpcSell
      && nonnegative(rules.consignFee) && rules.consignFee < 1 && nonnegative(rules.marketPriceSwing) && rules.marketPriceSwing < 1
      && positive(rules.saleDelaySec) && positive(rules.offlineSettlementWindowSec)
      && rules.rewardAmount.formula === 'listingPrice*(1-consignFee)*marketFactor'
      && rules.rewardAmount.sampleAt === 'sale' && rules.rewardAmount.samplesPerSale === 1
      && Math.abs(rules.rewardAmount.marketFactorMin - (1 - rules.marketPriceSwing)) < Number.EPSILON * 8
      && Math.abs(rules.rewardAmount.marketFactorMax - (1 + rules.marketPriceSwing)) < Number.EPSILON * 8
      && Number.isSafeInteger(rules.slotCapacity) && rules.slotCapacity > 0;
  }
  private async transact(apply: (draft: Progress, reject: (reason: string, text: string) => undefined) => MarketAllowed | undefined): Promise<MarketGateResult> {
    if (this.#busy) return denied('busy', '正在保存寄售进度，请稍候。');
    this.#busy = true;
    let rejection: MarketDenied | undefined;
    const reject = (reason: string, text: string): undefined => { rejection = denied(reason, text); return undefined; };
    try {
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        // 必须重读 draft；多个 Gate、重复回调与导档后不能信任先前会话缓存。
        if (!this.valid(draft)) return reject('progress', '寄售档案不完整，已阻止歧义操作。');
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject('progress', '寄售结果校验失败，保持原档。');
        return result;
      });
      return saved ?? rejection ?? denied('save', '寄售保存失败，请重试。');
    } catch { return denied('save', '寄售保存失败，请重试。'); }
    finally { this.#busy = false; }
  }
}
