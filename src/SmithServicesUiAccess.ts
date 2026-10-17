export type SmithService = 'forge' | 'enhance' | 'enchant' | 'salvage';
export type SmithServicesUiScope = 'entrance' | 'menu' | SmithService;

/** UI visibility only. Production always permits the UI; settlement remains with each Gate. */
export function isSmithServicesUiAccessible(scope: SmithServicesUiScope): boolean {
  if (!import.meta.env.SSR) return true;
  const injected = Reflect.get(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__') as unknown;
  if (!injected || typeof injected !== 'object' || Array.isArray(injected)) return true;
  return Object.getOwnPropertyDescriptor(injected, scope)?.value !== false;
}
