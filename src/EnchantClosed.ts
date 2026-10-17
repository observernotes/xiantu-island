import strings from '@xt/balance/strings_zh.json';

export type EnchantClosedTipKey = 'enchant.closed.feature' | 'enchant.closed.entrance'
  | 'enchant.closed.enchant' | 'enchant.closed.no_submit' | 'enchant.closed.no_result'
  | 'enchant.closed.no_element' | 'enchant.closed.load_refresh' | 'enchant.closed.later_service';

export interface EnchantClosedTip {
  readonly allowed: false;
  readonly tipKey: EnchantClosedTipKey;
  readonly text: string;
}

/** 本窗恒定关态；武器、材料和既有打造/强化许可均不能授权附灵。 */
function closed(tipKey: EnchantClosedTipKey): EnchantClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

// 只读提示不接收 Progress 或写入意图，不扣资源、改五行/属性、保存、建单或排队。
export function featureClosed() { return closed('enchant.closed.feature'); }
export function refuseEntrance() { return closed('enchant.closed.entrance'); }
export function refuseEnchant() { return closed('enchant.closed.enchant'); }
export function refuseSubmit() { return closed('enchant.closed.no_submit'); }
export function refuseResult() { return closed('enchant.closed.no_result'); }
export function refuseElement() { return closed('enchant.closed.no_element'); }
export function refuseLoadRefresh() { return closed('enchant.closed.load_refresh'); }
export function refuseLaterService() { return closed('enchant.closed.later_service'); }
