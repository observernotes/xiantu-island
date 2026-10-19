export type MarketConsignUiScope = 'entrance' | 'panel';

/** UI visibility only. Production always permits the panel; settlement remains with MarketGate. */
export function isMarketConsignUiAccessible(scope: MarketConsignUiScope): boolean {
  if (!import.meta.env.SSR) return true;
  const injected = Reflect.get(globalThis, '__XT_MARKET_CONSIGN_UI_ACCESS__') as unknown;
  if (!injected || typeof injected !== 'object' || Array.isArray(injected)) return true;
  return Object.getOwnPropertyDescriptor(injected, scope)?.value !== false;
}
