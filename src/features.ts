/** 发版配置只读取当前工程的快照，不随 @xt 的 shared/snapshot 数据模式切换。 */
export const FEATURE_NAMES = [
  'fiveSectClasses', 'sectDaily', 'sectRanks', 'sectShopLibrary',
  'sectDonations', 'seclusion', 'alchemyPhase1', 'v05Maps',
] as const;
export type FeatureName = typeof FEATURE_NAMES[number];
export const FEATURE_UNAVAILABLE = '暂未开放';

// 空匹配表示尚未配置发版开关，开发环境保持全部开放。
const snapshots = import.meta.glob('../data/features.json', { eager: true, import: 'default' });
const snapshot: unknown = snapshots['../data/features.json'];
const configured = snapshot && typeof snapshot === 'object' && !Array.isArray(snapshot)
  ? snapshot as Record<string, unknown> : {};
const defaults = Object.fromEntries(FEATURE_NAMES.map(name =>
  [name, typeof configured[name] === 'boolean' ? configured[name] : true])) as Record<FeatureName, boolean>;
// 测试覆盖只存在于本次页面会话；不会被存档覆盖，也不会写入存档。
const overrides = new Map<FeatureName, boolean>();

export function isFeatureName(key: string): key is FeatureName {
  return (FEATURE_NAMES as readonly string[]).includes(key);
}

export function featureEnabled(name: FeatureName): boolean {
  return overrides.get(name) ?? defaults[name];
}

export function featureFlags(): Record<FeatureName, boolean> {
  return Object.fromEntries(FEATURE_NAMES.map(name => [name, featureEnabled(name)])) as Record<FeatureName, boolean>;
}

/** 由测试构建的 __xt.setFlag 调用，场景重启不会清除会话覆盖。 */
export function setFeatureFlag(name: FeatureName, value: boolean): void {
  if (!isFeatureName(name) || typeof value !== 'boolean') throw new TypeError('Invalid feature flag');
  overrides.set(name, value);
}
