/** 好感与因果同属角色存档；本期仅结算好感，预留的正魔记录不产生效果。 */
export const RELATIONSHIP_VERSION = 1;
export interface PendingAffinitySource { sourceId: string; npc: string; quest: string }
export interface RelationshipState {
  version: number;
  questChoices: Record<string, string>;
  appliedQuestHooks: string[];
  appliedAffinitySources: string[];
  claimedAffinityRewards: string[];
  pendingAffinitySources: PendingAffinitySource[];
  quarantinedFlags: Record<string, unknown>;
}

export function createRelationshipState(): RelationshipState {
  return { version: RELATIONSHIP_VERSION, questChoices: {}, appliedQuestHooks: [], appliedAffinitySources: [],
    claimedAffinityRewards: [], pendingAffinitySources: [], quarantinedFlags: {} };
}

const id = (value: unknown): value is string => typeof value === 'string' && /^[A-Za-z][\w.-]*$/.test(value)
  && !value.split('.').some(part => ['__proto__', 'prototype', 'constructor'].includes(part));
const record = (value: unknown): value is Record<string, unknown> => !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && id(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));
const dense = (value: unknown): value is unknown[] => Array.isArray(value)
  && Reflect.ownKeys(value).length === value.length + 1
  && Array.from({ length: value.length }, (_, index) => Object.getOwnPropertyDescriptor(value, String(index)))
    .every(descriptor => !!descriptor && Object.prototype.hasOwnProperty.call(descriptor, 'value'));
const uniqueStrings = (value: unknown, valid: (entry: unknown) => boolean) => dense(value)
  && value.every(valid) && new Set(value).size === value.length;
const source = (value: unknown) => typeof value === 'string' && value.split('|').length === 3
  && value.split('|')[1] === 'quest' && id(value.split('|')[0]) && id(value.split('|')[2]);
const claim = (value: unknown) => typeof value === 'string' && value.split('|').length === 2 && value.split('|').every(id);
function jsonData(value: unknown, seen = new Set<unknown>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (seen.has(value)) return false;
  seen.add(value);
  const valid = dense(value) ? value.every(entry => jsonData(entry, seen))
    : record(value) && Object.values(value).every(entry => jsonData(entry, seen));
  seen.delete(value);
  return valid;
}

/** 只接受安全整数；负好感合法，null/字符串不可被 Number() 隐式转为数值。 */
export function isValidAffinity(value: unknown): value is Record<string, number> {
  try { return record(value) && Object.values(value).every(entry => typeof entry === 'number' && Number.isSafeInteger(entry)); }
  catch { return false; }
}

/** 加载损坏好感时仅保留合法旧值，不根据任务历史补初值或增量。 */
export function normalizeAffinity(value: unknown): Record<string, number> {
  try {
    if (!record(value)) return {};
    return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, number] => typeof entry[1] === 'number' && Number.isSafeInteger(entry[1])));
  } catch { return {}; }
}

/** 已有坏收据必须拒绝，不能清空后重新发礼或重放来源。 */
export function isValidRelationshipState(value: unknown): value is RelationshipState {
  try {
    if (!record(value) || typeof value.version !== 'number' || !Number.isSafeInteger(value.version) || value.version < RELATIONSHIP_VERSION
      || !record(value.questChoices) || !Object.values(value.questChoices).every(id)
      || !uniqueStrings(value.appliedQuestHooks, id) || !uniqueStrings(value.appliedAffinitySources, source)
      || !uniqueStrings(value.claimedAffinityRewards, claim) || !dense(value.pendingAffinitySources)
      || !record(value.quarantinedFlags) || !jsonData(value.quarantinedFlags)) return false;
    const applied = new Set(value.appliedAffinitySources as string[]), pending = new Set<string>();
    for (const entry of value.pendingAffinitySources) {
      if (!record(entry) || !id(entry.npc) || !id(entry.quest) || entry.sourceId !== `${entry.npc}|quest|${entry.quest}`
        || applied.has(entry.sourceId as string) || pending.has(entry.sourceId as string)) return false;
      pending.add(entry.sourceId as string);
    }
    return true;
  } catch { return false; }
}

/** 仅补缺失字段；显式损坏返回 null，调用者保留原记录并暂停关系结算。 */
export function normalizeRelationshipState(value: unknown): RelationshipState | null {
  if (value === undefined) return createRelationshipState();
  try {
    if (!record(value)) return null;
    const candidate = { ...createRelationshipState(), ...value };
    return isValidRelationshipState(candidate) ? candidate : null;
  } catch { return null; }
}
