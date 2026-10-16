import strings from '@xt/balance/strings_zh.json';

export type MarketClosedTipKey = 'market.closed.feature' | 'market.closed.list'
  | 'market.closed.withdraw' | 'market.closed.claim' | 'market.closed.no_deal'
  | 'market.closed.no_reward' | 'market.closed.load_refresh' | 'market.closed.slot_or_item';

export interface MarketClosedTip {
  readonly allowed: false;
  readonly tipKey: MarketClosedTipKey;
  readonly text: string;
}

/** 本窗恒定关态；配表、资格和旧档均不能授权寄售，不另造开放开关。 */
function closed(tipKey: MarketClosedTipKey): MarketClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不扣物、返物、扣费、结算、保存或排队。
export function featureClosed() { return closed('market.closed.feature'); }
export function refuseList() { return closed('market.closed.list'); }
export function refuseWithdraw() { return closed('market.closed.withdraw'); }
export function refuseClaim() { return closed('market.closed.claim'); }
export function refuseDeal() { return closed('market.closed.no_deal'); }
export function refuseReward() { return closed('market.closed.no_reward'); }
export function refuseLoadRefresh() { return closed('market.closed.load_refresh'); }
export function refuseSlotOrItem() { return closed('market.closed.slot_or_item'); }
