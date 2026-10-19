import strings from '@xt/balance/strings_zh.json';

export type SpiritRuneClosedTipKey =
  | 'spirit_rune.closed.feature'
  | 'spirit_rune.closed.entrance'
  | 'spirit_rune.closed.refine'
  | 'spirit_rune.closed.quench'
  | 'spirit_rune.closed.lock'
  | 'spirit_rune.closed.unlock'
  | 'spirit_rune.closed.no_submit'
  | 'spirit_rune.closed.load_refresh';

export interface SpiritRuneClosedTip {
  readonly allowed: false;
  readonly tipKey: SpiritRuneClosedTipKey;
  readonly text: string;
}

function closed(tipKey: SpiritRuneClosedTipKey): SpiritRuneClosedTip {
  return { allowed: false, tipKey, text: strings[tipKey] };
}

/** 只读提示；不接收 Progress 或写入意图。 */
export function featureClosed() { return closed('spirit_rune.closed.feature'); }
export function refuseEntrance() { return closed('spirit_rune.closed.entrance'); }
export function refuseRefine() { return closed('spirit_rune.closed.refine'); }
export function refuseQuench() { return closed('spirit_rune.closed.quench'); }
export function refuseLock() { return closed('spirit_rune.closed.lock'); }
export function refuseUnlock() { return closed('spirit_rune.closed.unlock'); }
export function refuseSubmit() { return closed('spirit_rune.closed.no_submit'); }
export function refuseLoadRefresh() { return closed('spirit_rune.closed.load_refresh'); }
