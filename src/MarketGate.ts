import rules from '@xt/balance/market_consign.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
import { emptyMarketProgress, isValidMarketProgress, type MarketListing, type MarketProgress } from './MarketProgress';
import { isMarketOpenForFixture } from './MarketOpenFlag';
import * as MarketClosed from './MarketClosed';

export interface MarketFixtureOptions {
  /** 夹具显式允许集；仅测试／fixture 路径。正式路径不得依赖本字段放行。 */
  fixtureAllowedItemIds?: readonly string[];
  /**
   * 正式路径：完整寄售面板已接。未置 true 时写操作走 L1（只 tip、零写）。
   * 夹具路径忽略本字段。入口冒烟／无面板不得据此放行上架。
   */
  consignPanelReady?: boolean;
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

type MarketRules = typeof rules & { consignableItemIds?: readonly string[] };
const marketRules = rules as MarketRules;

/** 只读正式品类白名单；空／缺＝正式全拒（L2）。不回退 fixtureAllowedItemIds。 */
export function formalConsignableItemIds(): readonly string[] {
  const ids = marketRules.consignableItemIds;
  if (!Array.isArray(ids)) return [];
  return ids.filter((id): id is string => typeof id === 'string' && safeId(id));
}

/** 正式 soft-open；每入口保留关态拦截，仅 Vite SSR 内存关态图注入 false。 */
export class MarketGate {
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: MarketFixtureOptions = {}) {}

  /** 夹具路径：显式注入 fixtureAllowedItemIds（含空数组）。正式路径：未注入该字段。 */
  private isFixtureMode(): boolean {
    return Object.prototype.hasOwnProperty.call(this.fixture, 'fixtureAllowedItemIds');
  }

  feature(): MarketGateResult {
    if (!isMarketOpenForFixture()) return MarketClosed.featureClosed();
    if (!this.validRules()) return denied('rules', '寄售依赖未就绪。');
    // 只读说明可在 Flag/enabled 下查看；L1–L3 拦写不拦说明（入口冒烟保持「已开放」文案）。
    return { allowed: true, slotCapacity: rules.slotCapacity };
  }

  async listItem(request: MarketListRequest): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseList();
    const depth = this.refuseFormalDepth('list');
    if (depth) return depth;
    return this.transact((draft, reject) => {
      if (!request || !safeId(request.itemId) || !this.supportedItem(draft, request.itemId)
        || !positive(request.listingPrice) || typeof request.itemInstanceId !== 'string') {
        if (!this.isFixtureMode() && formalConsignableItemIds().length === 0)
          return reject('item', '可寄售品类未齐，暂不可上架。');
        if (!this.isFixtureMode() && !formalConsignableItemIds().includes(request.itemId))
          return reject('item', '物品不在正式可寄售品类中。');
        return reject('item', '物品或挂牌价不可用于本夹具。');
      }
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
    const depth = this.refuseFormalDepth('withdraw');
    if (depth) return depth;
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

  /**
   * 成交回调：消费 saleDelaySec／offlineSettlementWindowSec。
   * 未满最短等待不成交；离线累计不超窗；关态／纵深未齐不补算；成交→sold_pending_claim 不自动领取。
   */
  async settle(listingId: string, request: MarketSettlementRequest = {}): Promise<MarketGateResult> {
    if (!isMarketOpenForFixture()) return MarketClosed.refuseDeal();
    const depth = this.refuseFormalDepth('deal');
    if (depth) return depth;
    return this.transact((draft, reject) => {
      const market = this.current(draft), listing = market?.listings.find(row => row.listingId === listingId);
      if (!market || !listing || listing.state !== 'listed') return reject('settle_state', '当前单据不可成交。');
      if (!this.supportedItem(draft, listing.itemId)) return reject('item', '扣押物品类未获授权。');
      const now = this.now();
      if (!request || !nonnegative(now) || now < listing.listedAt) return reject('time', '寄售时钟不可用。');
      let elapsedSec = (now - listing.listedAt) / 1000;
      if (Object.prototype.hasOwnProperty.call(request, 'offlineElapsedSec')) {
        if (!nonnegative(request.offlineElapsedSec)) return reject('time', '离线结算时间无效。');
        // 离线必须同时受实际时间差与寄售专属窗口约束，不借其它玩法上限。
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
    const depth = this.refuseFormalDepth('claim');
    if (depth) return depth;
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
      // 领取／重试用已存 amount；不重抽 marketFactor。
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

  /**
   * 正式路径 L1–L3：只 tip、零写。夹具路径跳过。
   * L1 无面板；L2 品类未齐；L3 本刀已接 saleDelay／offline 消费者，品类+面板齐后不再以 L3 拒成交。
   */
  private refuseFormalDepth(op: 'list' | 'withdraw' | 'claim' | 'deal'): MarketDenied | undefined {
    if (this.isFixtureMode()) return undefined;
    if (this.fixture.consignPanelReady !== true) {
      if (op === 'list') return MarketClosed.refuseList();
      if (op === 'withdraw') return MarketClosed.refuseWithdraw();
      if (op === 'claim') return MarketClosed.refuseClaim();
      return MarketClosed.refuseDeal();
    }
    if (formalConsignableItemIds().length === 0) {
      if (op === 'list') return MarketClosed.refuseList();
      if (op === 'withdraw') return MarketClosed.refuseWithdraw();
      if (op === 'claim') return MarketClosed.refuseClaim();
      return MarketClosed.refuseDeal();
    }
    return undefined;
  }

  private now(): number { return this.fixture.now?.() ?? Date.now(); }
  private current(progress: Progress): MarketProgress | undefined { return progress.market === undefined ? undefined : copy(progress.market); }
  private valid(progress: Progress): boolean {
    if (!this.validRules()) return false;
    if (progress.market === undefined) return true;
    if (!isValidMarketProgress(progress.market)) return false;
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

  private itemBaseOk(progress: Progress, itemId: string): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, itemId) ? ITEMS[itemId] : undefined;
    return !!item && inPhase(item)
      && item.enabled !== false && item.placeholder !== true && positive(item.price)
      && item.qualityEnabled !== true && !Object.prototype.hasOwnProperty.call(progress.pillQualities, itemId)
      && !Object.values(progress.equip).includes(itemId);
  }

  private supportedItem(progress: Progress, itemId: string): boolean {
    if (!this.itemBaseOk(progress, itemId)) return false;
    if (this.isFixtureMode()) {
      // 夹具名单仅测试路径；正式路径永不回退到此。
      return this.fixture.fixtureAllowedItemIds?.includes(itemId) === true;
    }
    return formalConsignableItemIds().includes(itemId);
  }

  private validRules(): boolean {
    return rules.enabled === true && rules.listingPrice.mode === 'player_set' && rules.listingPrice.reference === 'items.price'
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
