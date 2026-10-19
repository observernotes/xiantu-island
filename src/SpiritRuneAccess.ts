/**
 * SpiritRuneOpenFlag：仅登记消费位名（design/35）。
 * 不建 OpenFlag 文件、不 soft-open；生产包默认关。
 * 开态测夹具可经 globalThis.__XT_SPIRIT_RUNE_OPEN__ 注入 true（仅测）；
 * softOpenedSpiritRune 证据位另令 soft-open 才翻。
 */
export const SPIRIT_RUNE_OPEN_FLAG_NAME = 'SpiritRuneOpenFlag' as const;

/** 测试夹具注入键（与 __XT_SPIRIT_RUNE_UI_ACCESS__ 风格一致）。生产勿设。 */
export const SPIRIT_RUNE_OPEN_INJECT_KEY = '__XT_SPIRIT_RUNE_OPEN__' as const;

/**
 * 关态默认 false；仅当夹具 Reflect/defineProperty 设 globalThis 键为严格 true 时开。
 * 生产包无注入 → 恒关。
 */
export function isSpiritRuneOpen(): boolean {
  return Reflect.get(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY) === true;
}

/** soft-open 证据位（本刀恒 false；≠ 生产门禁；本令不授权翻 soft）。 */
export function softOpenedSpiritRune(): boolean {
  return false;
}
