import strings from '@xt/balance/strings_zh.json';

export type EnhanceClosedTipKey = 'enhance.closed.feature' | 'enhance.closed.entrance'
  | 'enhance.closed.enhance' | 'enhance.closed.no_submit' | 'enhance.closed.no_level'
  | 'enhance.closed.no_consume' | 'enhance.closed.load_refresh' | 'enhance.closed.later_service';

export interface EnhanceClosedTip {
  readonly allowed: false;
  readonly tipKey: EnhanceClosedTipKey;
  readonly text: string;
}

/** 本窗恒定关态；装备、资源和旧档均不能授权强化。 */
function closed(tipKey: EnhanceClosedTipKey): EnhanceClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不扣资源、改等级/属性、保存、建单或排队。
export function featureClosed() { return closed('enhance.closed.feature'); }
export function refuseEntrance() { return closed('enhance.closed.entrance'); }
export function refuseEnhance() { return closed('enhance.closed.enhance'); }
export function refuseSubmit() { return closed('enhance.closed.no_submit'); }
export function refuseLevel() { return closed('enhance.closed.no_level'); }
export function refuseConsume() { return closed('enhance.closed.no_consume'); }
export function refuseLoadRefresh() { return closed('enhance.closed.load_refresh'); }
export function refuseLaterService() { return closed('enhance.closed.later_service'); }
