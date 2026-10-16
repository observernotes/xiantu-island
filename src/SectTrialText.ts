import { t } from './data';

/** 共享表未补齐时保留试炼提示及其参数。 */
export function sectTrialText(key: string, fallback: string, vars: Record<string, string | number> = {}) {
  const value = t(key, vars);
  return value !== key ? value : fallback.replace(/\{(\w+)\}/g, (_, name) => String(vars[name] ?? `{${name}}`));
}
