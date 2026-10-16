export type ForgeGrade = 'common' | 'fine' | 'spirit' | 'treasure';
export interface ForgeMaterial { itemId: string; count: number; }
export interface ForgeCraftResult {
  state: 'committed';
  craftRequestId: string;
  craftResultRef: string;
  blueprintId: string;
  blueprintCount: number;
  materials: ForgeMaterial[];
  /** 夹具库存仍按配置计数；此引用只绑定这笔成品品质，不是正式装备实例 schema。 */
  resultItem: { itemId: string; count: 1; instanceRef: string };
  resultGrade: ForgeGrade;
}
/** 仅记录完整提交事实；没有待处理请求，也不在读档时补做。 */
export interface ForgeProgress {
  version: 1;
  ledgerId: string;
  crafts: ForgeCraftResult[];
  receipts: string[];
}
export const isForgeId = (value: unknown): value is string => typeof value === 'string'
  && /^[a-zA-Z][\w.-]{0,127}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
const integer = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const fields = (value: unknown, keys: string[]): value is Record<string, unknown> => !!value && typeof value === 'object'
  && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));
const array = (value: unknown): value is unknown[] => Array.isArray(value)
  && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).every(key => key === 'length' || typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key) && Number(key) < value.length
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'))
  && Array.from(value).every((_, index) => Object.prototype.hasOwnProperty.call(value, index));
export function isValidForgeMaterials(value: unknown): value is ForgeMaterial[] {
  if (!array(value) || value.length === 0) return false;
  const ids = new Set<string>();
  return value.every(row => {
    if (!fields(row, ['itemId', 'count']) || !isForgeId(row.itemId) || !integer(row.count) || ids.has(row.itemId)) return false;
    ids.add(row.itemId); return true;
  });
}
export function isForgeGrade(value: unknown): value is ForgeGrade {
  return typeof value === 'string' && ['common', 'fine', 'spirit', 'treasure'].includes(value);
}
/** 纯结构检查，不读表、不写盘。缺袋由调用方保留 undefined；歧义不猜 empty、不修复。 */
export function isValidForgeProgress(value: unknown): value is ForgeProgress {
  try {
    if (!fields(value, ['version', 'ledgerId', 'crafts', 'receipts']) || value.version !== 1 || !isForgeId(value.ledgerId)
      || !array(value.crafts) || !array(value.receipts) || value.crafts.length !== value.receipts.length) return false;
    const requests = new Set<string>(), refs = new Set<string>();
    for (const row of value.crafts) {
      if (!fields(row, ['state', 'craftRequestId', 'craftResultRef', 'blueprintId', 'blueprintCount', 'materials', 'resultItem', 'resultGrade'])
        || row.state !== 'committed' || !isForgeId(row.craftRequestId) || requests.has(row.craftRequestId)
        || row.craftResultRef !== `${value.ledgerId}:craft:${row.craftRequestId}`
        || !isForgeId(row.blueprintId) || !integer(row.blueprintCount) || !isValidForgeMaterials(row.materials)
        || !fields(row.resultItem, ['itemId', 'count', 'instanceRef']) || !isForgeId(row.resultItem.itemId)
        || row.resultItem.count !== 1 || row.resultItem.instanceRef !== `${row.craftResultRef}:item`
        || row.blueprintId === row.resultItem.itemId
        || row.materials.some(material => material.itemId === row.blueprintId)
        || !isForgeGrade(row.resultGrade)) return false;
      const resultId = row.resultItem.itemId;
      if (row.materials.some(material => material.itemId === resultId)) return false;
      requests.add(row.craftRequestId); refs.add(row.craftResultRef as string);
    }
    return value.receipts.every(ref => typeof ref === 'string' && refs.delete(ref)) && refs.size === 0;
  } catch { return false; }
}
