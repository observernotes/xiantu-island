import { isEnhanceId, isEnhanceInstanceRef } from './EnhanceProgress';

export type SpiritRuneAffixType =
  | 'atk' | 'def' | 'hp' | 'mp' | 'crit' | 'elem_bonus' | 'skill_haste' | 'lifesteal';

export interface SpiritRuneSlot {
  affixId: string | null;
  locked: boolean;
}

export interface SpiritRuneHostBag {
  hostInstanceRef: string;
  slots: SpiritRuneSlot[];
  refineCount: number;
  quenchCount: number;
}

/** 试炼灵纹进度袋；缺袋旧档保持 undefined，读档不补做。 */
export interface SpiritRuneProgress {
  version: 1;
  ledgerId: string;
  ownerSlot: 1 | 2 | 3;
  bags: SpiritRuneHostBag[];
  receipts: string[];
}

const ownKeys = (value: object, keys: readonly string[]) =>
  Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));

export const spiritFields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> =>
  !!value && typeof value === 'object' && !Array.isArray(value)
  && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && ownKeys(value, keys);

export const spiritArray = (value: unknown): value is unknown[] => Array.isArray(value)
  && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).every(key => key === 'length' || typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)
    && Number(key) < value.length && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'))
  && Array.from(value).every((_, index) => Object.prototype.hasOwnProperty.call(value, index));

const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

export function isValidSpiritRuneSlot(value: unknown): value is SpiritRuneSlot {
  if (!spiritFields(value, ['affixId', 'locked'])) return false;
  if (typeof value.locked !== 'boolean') return false;
  if (value.affixId !== null && !isEnhanceId(value.affixId)) return false;
  return true;
}

export function isValidSpiritRuneHostBag(value: unknown): value is SpiritRuneHostBag {
  if (!spiritFields(value, ['hostInstanceRef', 'slots', 'refineCount', 'quenchCount'])) return false;
  if (!isEnhanceInstanceRef(value.hostInstanceRef) || !spiritArray(value.slots) || !value.slots.length) return false;
  if (!count(value.refineCount) || !count(value.quenchCount)) return false;
  return value.slots.every(isValidSpiritRuneSlot);
}

export function isValidSpiritRuneProgress(value: unknown): value is SpiritRuneProgress {
  try {
    if (!spiritFields(value, ['version', 'ledgerId', 'ownerSlot', 'bags', 'receipts'])
      || value.version !== 1 || !isEnhanceId(value.ledgerId)
      || ![1, 2, 3].includes(value.ownerSlot as number)
      || !spiritArray(value.bags) || !spiritArray(value.receipts)) return false;
    const refs = new Set<string>();
    for (const bag of value.bags) {
      if (!isValidSpiritRuneHostBag(bag) || refs.has(bag.hostInstanceRef)) return false;
      refs.add(bag.hostInstanceRef);
    }
    return value.receipts.every(row => typeof row === 'string' && isEnhanceId(row));
  } catch { return false; }
}

export function emptySpiritRuneProgress(ledgerId: string, ownerSlot: 1 | 2 | 3): SpiritRuneProgress {
  return { version: 1, ledgerId, ownerSlot, bags: [], receipts: [] };
}
