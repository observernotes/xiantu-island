/**
 * SpiritRuneOpenFlag：仅登记消费位名（design/35）。
 * 不建 OpenFlag 文件；本刀已 soft-open。
 * 正式路径默认开（无注入 → true）；仅 SSR／memory-closed 经
 * globalThis.__XT_SPIRIT_RUNE_OPEN__ === false（严格 false）关回。
 * 保留注入 === true 兼容（开态夹具仍可显式 true）。
 * softOpenedSpiritRune ＝发版前交付证据位（≠ 二次配表／ENV 后门）。
 */
export const SPIRIT_RUNE_OPEN_FLAG_NAME = 'SpiritRuneOpenFlag' as const;

/** 测试夹具注入键（与 __XT_SPIRIT_RUNE_UI_ACCESS__ 风格一致）。生产勿设。 */
export const SPIRIT_RUNE_OPEN_INJECT_KEY = '__XT_SPIRIT_RUNE_OPEN__' as const;

/**
 * 正式路径默认 true（对齐 Forge／Enhance／Enchant OpenFlag 正式开）。
 * 仅当 Reflect.get(globalThis, 注入键) === false（严格 false）时关回，供 closed／memory-closed。
 * 注入 === true 仍开（兼容既有夹具）。
 */
export function isSpiritRuneOpen(): boolean {
  const injected = Reflect.get(globalThis, SPIRIT_RUNE_OPEN_INJECT_KEY);
  if (injected === false) return false;
  return true;
}

/** soft-open 证据位（本刀 true；≠ 生产门禁对抗位；禁接成配表／ENV 后门）。 */
export function softOpenedSpiritRune(): boolean {
  return true;
}
