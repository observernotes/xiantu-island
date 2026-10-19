/**
 * SpiritRuneOpenFlag：仅登记消费位名（design/35）。
 * 本刀不建 OpenFlag 文件、不 soft-open；正式消费者恒关。
 * softOpenedSpiritRune 证据位另令 soft-open 才翻；本文件不暴露可翻运行时旗。
 */
export const SPIRIT_RUNE_OPEN_FLAG_NAME = 'SpiritRuneOpenFlag' as const;

/** 关态默认；无 OpenFlag 文件可注入。夹具若需模拟开态须另令开态棒。 */
export function isSpiritRuneOpen(): boolean {
  return false;
}

/** soft-open 证据位（本刀恒 false；≠ 生产门禁）。 */
export function softOpenedSpiritRune(): boolean {
  return false;
}
