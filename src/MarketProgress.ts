export type MarketListingState = 'listed' | 'withdrawn' | 'sold_pending_claim' | 'claimed';
export interface MarketListing {
  listingId: string;
  itemId: string;
  /** 配置 id + 库存份额序号，仅用于夹具，不是正式实例 schema。 */
  itemInstanceId: string;
  state: MarketListingState;
  heldItemRef: string;
  pendingRewardRef?: string;
  settlementRef?: string;
  claimRef?: string;
  slotIndex: number;
  listingPrice: number;
  listedAt: number;
}
export interface MarketHeldItem {
  ref: string; listingId: string; itemId: string; itemInstanceId: string;
  disposition: 'held' | 'returned' | 'departed';
}
export interface MarketReward { ref: string; listingId: string; amount: number; claimed: boolean; }
export interface MarketSettlement { ref: string; listingId: string; rewardRef: string; marketFactor: number; }
export interface MarketClaim { ref: string; listingId: string; rewardRef: string; amount: number; }
/** 只保存整笔确认结果；所有引用都绑定同一存档账本，终态保留防重放。 */
export interface MarketProgress {
  version: 1;
  ledgerId: string;
  nextListingSeq: number;
  listings: MarketListing[];
  heldItems: MarketHeldItem[];
  pendingRewards: MarketReward[];
  settlements: MarketSettlement[];
  claims: MarketClaim[];
}
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value));
const fields = (value: unknown, required: string[], optional: string[] = []): value is Record<string, unknown> => record(value)
  && required.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && [...required, ...optional].includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));
const id = (value: unknown): value is string => typeof value === 'string' && /^[a-zA-Z][\w.-]{0,127}$/.test(value)
  && !['__proto__', 'constructor', 'prototype'].includes(value);
const nonnegative = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const positive = (value: unknown): value is number => nonnegative(value) && value > 0;
const integer = (value: unknown): value is number => nonnegative(value) && Number.isSafeInteger(value);
const array = (value: unknown): value is unknown[] => Array.isArray(value)
  && Reflect.ownKeys(value).every(key => key === 'length' || typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'))
  && Array.from(value).every((_, index) => Object.prototype.hasOwnProperty.call(value, index));

export function emptyMarketProgress(ledgerId: string): MarketProgress {
  return { version: 1, ledgerId, nextListingSeq: 1, listings: [], heldItems: [], pendingRewards: [], settlements: [], claims: [] };
}

/** 无袋旧档保持 undefined；有袋必须完整。未知状态、孤儿引用与双占栏均拒绝，不猜 empty。 */
export function isValidMarketProgress(value: unknown): value is MarketProgress {
  try {
    if (!fields(value, ['version', 'ledgerId', 'nextListingSeq', 'listings', 'heldItems', 'pendingRewards', 'settlements', 'claims'])
      || value.version !== 1 || !id(value.ledgerId) || !integer(value.nextListingSeq) || value.nextListingSeq < 1
      || !['listings', 'heldItems', 'pendingRewards', 'settlements', 'claims'].every(key => array(value[key]))) return false;
    const market = value as unknown as MarketProgress;
    const listingIds = new Set<string>(), instances = new Set<string>(), slots = new Set<number>();
    const heldRefs = new Set<string>(), rewardRefs = new Set<string>(), settlementRefs = new Set<string>(), claimRefs = new Set<string>();
    for (const entry of market.listings) {
      if (!fields(entry, ['listingId', 'itemId', 'itemInstanceId', 'state', 'heldItemRef', 'slotIndex', 'listingPrice', 'listedAt'],
        ['pendingRewardRef', 'settlementRef', 'claimRef']) || !id(entry.itemId) || typeof entry.listingId !== 'string'
        || !entry.listingId.startsWith(`${market.ledgerId}:listing:`)) return false;
      const sequence = Number(entry.listingId.slice(`${market.ledgerId}:listing:`.length));
      if (!integer(sequence) || sequence < 1 || sequence >= market.nextListingSeq
        || entry.listingId !== `${market.ledgerId}:listing:${sequence}` || listingIds.has(entry.listingId)
        || typeof entry.itemInstanceId !== 'string' || !entry.itemInstanceId.startsWith(`${entry.itemId}#`)) return false;
      const share = Number(entry.itemInstanceId.slice(entry.itemId.length + 1));
      if (!integer(share) || share < 1 || entry.itemInstanceId !== `${entry.itemId}#${share}` || instances.has(entry.itemInstanceId)
        || !['listed', 'withdrawn', 'sold_pending_claim', 'claimed'].includes(entry.state)
        || !integer(entry.slotIndex)
        || !positive(entry.listingPrice) || !nonnegative(entry.listedAt)
        || entry.heldItemRef !== `${entry.listingId}:held`) return false;
      listingIds.add(entry.listingId); instances.add(entry.itemInstanceId); heldRefs.add(entry.heldItemRef);
      if (entry.state === 'listed' || entry.state === 'sold_pending_claim') {
        if (slots.has(entry.slotIndex)) return false;
        slots.add(entry.slotIndex);
      }
      const held = market.heldItems.filter(row => row.ref === entry.heldItemRef);
      if (held.length !== 1 || !fields(held[0], ['ref', 'listingId', 'itemId', 'itemInstanceId', 'disposition'])
        || held[0].listingId !== entry.listingId || held[0].itemId !== entry.itemId || held[0].itemInstanceId !== entry.itemInstanceId
        || held[0].disposition !== (entry.state === 'listed' ? 'held' : entry.state === 'withdrawn' ? 'returned' : 'departed')) return false;
      const sold = entry.state === 'sold_pending_claim' || entry.state === 'claimed';
      if (!sold) {
        if (Object.prototype.hasOwnProperty.call(entry, 'pendingRewardRef') || Object.prototype.hasOwnProperty.call(entry, 'settlementRef')
          || Object.prototype.hasOwnProperty.call(entry, 'claimRef')) return false;
        continue;
      }
      if (entry.pendingRewardRef !== `${entry.listingId}:reward` || entry.settlementRef !== `${entry.listingId}:settlement`) return false;
      rewardRefs.add(entry.pendingRewardRef); settlementRefs.add(entry.settlementRef);
      const rewards = market.pendingRewards.filter(row => row.ref === entry.pendingRewardRef);
      const settlements = market.settlements.filter(row => row.ref === entry.settlementRef);
      if (rewards.length !== 1 || settlements.length !== 1
        || !fields(rewards[0], ['ref', 'listingId', 'amount', 'claimed']) || rewards[0].listingId !== entry.listingId
        || !positive(rewards[0].amount) || rewards[0].claimed !== (entry.state === 'claimed')
        || !fields(settlements[0], ['ref', 'listingId', 'rewardRef', 'marketFactor'])
        || settlements[0].listingId !== entry.listingId || settlements[0].rewardRef !== entry.pendingRewardRef
        || !positive(settlements[0].marketFactor)) return false;
      if (entry.state === 'sold_pending_claim') {
        if (Object.prototype.hasOwnProperty.call(entry, 'claimRef')) return false;
      } else {
        if (entry.claimRef !== `${entry.listingId}:claim`) return false;
        claimRefs.add(entry.claimRef);
        const claims = market.claims.filter(row => row.ref === entry.claimRef);
        if (claims.length !== 1 || !fields(claims[0], ['ref', 'listingId', 'rewardRef', 'amount'])
          || claims[0].listingId !== entry.listingId || claims[0].rewardRef !== entry.pendingRewardRef
          || claims[0].amount !== rewards[0].amount) return false;
      }
    }
    return market.heldItems.length === heldRefs.size && market.heldItems.every(row => heldRefs.has(row.ref))
      && market.pendingRewards.length === rewardRefs.size && market.pendingRewards.every(row => rewardRefs.has(row.ref))
      && market.settlements.length === settlementRefs.size && market.settlements.every(row => settlementRefs.has(row.ref))
      && market.claims.length === claimRefs.size && market.claims.every(row => claimRefs.has(row.ref));
  } catch { return false; }
}
