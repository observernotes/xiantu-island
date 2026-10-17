import strings from '@xt/balance/strings_zh.json';

export type SalvageClosedTipKey = 'salvage.closed.feature' | 'salvage.closed.entrance'
  | 'salvage.closed.salvage' | 'salvage.closed.no_submit' | 'salvage.closed.no_result'
  | 'salvage.closed.no_output' | 'salvage.closed.load_refresh' | 'salvage.closed.later_service';

export interface SalvageClosedTip {
  readonly allowed: false;
  readonly tipKey: SalvageClosedTipKey;
  readonly text: string;
}

/** 独立分解恒定关态；三既有服务许可与材料登记均不能授权分解。 */
function closed(tipKey: SalvageClosedTipKey): SalvageClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不销毁实例、发物、保存、建单或排队。
export function featureClosed() { return closed('salvage.closed.feature'); }
export function refuseEntrance() { return closed('salvage.closed.entrance'); }
export function refuseSalvage() { return closed('salvage.closed.salvage'); }
export function refuseSubmit() { return closed('salvage.closed.no_submit'); }
export function refuseResult() { return closed('salvage.closed.no_result'); }
export function refuseOutput() { return closed('salvage.closed.no_output'); }
export function refuseLoadRefresh() { return closed('salvage.closed.load_refresh'); }
export function refuseLaterService() { return closed('salvage.closed.later_service'); }
