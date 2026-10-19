export type SpiritRuneUiScope = 'entrance' | 'panel';

/** UI 可见性；生产默认可开壳，结算仍由 Gate（Flag 关 → 只 tip）。 */
export function isSpiritRuneUiAccessible(scope: SpiritRuneUiScope): boolean {
  if (!import.meta.env.SSR) return true;
  const injected = Reflect.get(globalThis, '__XT_SPIRIT_RUNE_UI_ACCESS__') as unknown;
  if (!injected || typeof injected !== 'object' || Array.isArray(injected)) return true;
  return Object.getOwnPropertyDescriptor(injected, scope)?.value !== false;
}
