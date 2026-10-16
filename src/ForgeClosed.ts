import strings from '@xt/balance/strings_zh.json';

export type ForgeClosedTipKey = 'forge.closed.feature' | 'forge.closed.entrance'
  | 'forge.closed.craft' | 'forge.closed.no_submit' | 'forge.closed.no_result'
  | 'forge.closed.no_grade' | 'forge.closed.load_refresh' | 'forge.closed.later_service';

export interface ForgeClosedTip {
  readonly allowed: false;
  readonly tipKey: ForgeClosedTipKey;
  readonly text: string;
}

/** 本窗恒定关态；图纸、材料和旧档均不能授权打造，不另造开放开关。 */
function closed(tipKey: ForgeClosedTipKey): ForgeClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不扣料、产物、写品质/经验、保存、建单或排队。
export function featureClosed() { return closed('forge.closed.feature'); }
export function refuseEntrance() { return closed('forge.closed.entrance'); }
export function refuseCraft() { return closed('forge.closed.craft'); }
export function refuseSubmit() { return closed('forge.closed.no_submit'); }
export function refuseResult() { return closed('forge.closed.no_result'); }
export function refuseGrade() { return closed('forge.closed.no_grade'); }
export function refuseLoadRefresh() { return closed('forge.closed.load_refresh'); }
export function refuseLaterService() { return closed('forge.closed.later_service'); }
