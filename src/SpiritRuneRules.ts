import raw from '@xt/balance/spirit_rune.json';
import type { SpiritRuneAffixType } from './SpiritRuneProgress';

export interface SpiritRuneAffixDef {
  id: string;
  nameKey: string;
  type: SpiritRuneAffixType;
  value: number;
  valuePct: number;
  weight: number;
}

export interface SpiritRuneCost {
  scrap?: number;
  spiritStones?: number;
  quenchStone?: number;
}

export interface SpiritRuneRules {
  version: string | number;
  enabled: boolean;
  slotCount: number;
  scrapItemId: string;
  refineCost: SpiritRuneCost;
  quenchCost: SpiritRuneCost;
  lockCost: SpiritRuneCost;
  unlockCost: SpiritRuneCost;
  affixes: readonly SpiritRuneAffixDef[];
  guaranteeEveryN?: number;
}

const AFFIX_TYPES: readonly SpiritRuneAffixType[] = [
  'atk', 'def', 'hp', 'mp', 'crit', 'elem_bonus', 'skill_haste', 'lifesteal',
];

const nonnegative = (n: unknown): n is number => typeof n === 'number' && Number.isFinite(n) && n >= 0;
const positiveInt = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const safeId = (value: unknown): value is string => typeof value === 'string'
  && /^[a-zA-Z][\w.-]{0,127}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);

function isPlain(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
    && [Object.prototype, null].includes(Object.getPrototypeOf(value));
}

function cost(value: unknown): SpiritRuneCost | null {
  if (!isPlain(value)) return null;
  const out: SpiritRuneCost = {};
  for (const key of ['scrap', 'spiritStones', 'quenchStone'] as const) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const n = value[key];
    if (!nonnegative(n) || !Number.isSafeInteger(n)) return null;
    out[key] = n;
  }
  return out;
}

function affix(value: unknown): SpiritRuneAffixDef | null {
  if (!isPlain(value)) return null;
  for (const key of ['id', 'nameKey', 'type', 'value', 'valuePct', 'weight']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) return null;
  }
  if (!safeId(value.id) || typeof value.nameKey !== 'string' || !value.nameKey.startsWith('spirit_rune.')) return null;
  if (!AFFIX_TYPES.includes(value.type as SpiritRuneAffixType)) return null;
  if (!nonnegative(value.value) || !nonnegative(value.valuePct) || !nonnegative(value.weight)) return null;
  return {
    id: value.id, nameKey: value.nameKey, type: value.type as SpiritRuneAffixType,
    value: value.value, valuePct: value.valuePct, weight: value.weight,
  };
}

/** 读演武 2A 表（spirit_rune.json）；结构不齐则 null。 */
export function loadSpiritRuneRules(): SpiritRuneRules | null {
  try {
    if (!isPlain(raw)) return null;
    const row = raw;
    const version = row.version;
    if (!(typeof version === 'string' && version.length > 0) && !positiveInt(version)) return null;
    if (!positiveInt(row.slotCount) || !safeId(row.scrapItemId)) return null;
    const refineCost = cost(row.refineCost);
    const quenchCost = cost(row.quenchCost);
    const lockCost = cost(row.lockCost);
    const unlockCost = cost(row.unlockCost);
    if (!refineCost || !quenchCost || !lockCost || !unlockCost) return null;
    const list = Array.isArray(row.spirit_rune_affixes) ? row.spirit_rune_affixes
      : Array.isArray(row.affixes) ? row.affixes : null;
    if (!list || list.length < 8) return null;
    const affixes: SpiritRuneAffixDef[] = [];
    const ids = new Set<string>();
    for (const entry of list) {
      const def = affix(entry);
      if (!def || ids.has(def.id)) return null;
      ids.add(def.id);
      affixes.push(def);
    }
    const enabled = row.enabled === true;
    const guaranteeEveryN = nonnegative(row.guaranteeEveryN) && Number.isSafeInteger(row.guaranteeEveryN)
      ? row.guaranteeEveryN : undefined;
    return {
      version: version as string | number, enabled, slotCount: row.slotCount, scrapItemId: row.scrapItemId,
      refineCost, quenchCost, lockCost, unlockCost, affixes, guaranteeEveryN,
    };
  } catch { return null; }
}

export function pickWeightedAffix(
  rules: SpiritRuneRules, random: () => number, exclude?: ReadonlySet<string>,
): SpiritRuneAffixDef | null {
  const pool = rules.affixes.filter(row => row.weight > 0 && (!exclude || !exclude.has(row.id)));
  const total = pool.reduce((sum, row) => sum + row.weight, 0);
  if (!pool.length || !(total > 0)) return null;
  let cursor = Math.max(0, Math.min(0.999999, random())) * total;
  for (const row of pool) {
    cursor -= row.weight;
    if (cursor < 0) return row;
  }
  return pool[pool.length - 1] ?? null;
}
