export type EnhanceEquipmentType = 'weapon' | 'armor';
/** 仅测试夹具拥有的装备引用；不定义正式装备实例系统。 */
export interface EnhanceFixtureInstance {
  instanceRef: string;
  itemId: string;
  type: EnhanceEquipmentType;
  enhanceLevel: number;
}
/** 相对基础属性的只读增量；allRatio 单列已达到的正式里程碑。 */
export interface EnhanceAttributes {
  atkRatioOfBase: number;
  defRatioOfBase: number;
  hpRatioOfBase: number;
  allRatio: number;
}
export interface EnhanceResult {
  state: 'committed';
  enhanceRequestId: string;
  enhanceResultRef: string;
  instanceRef: string;
  itemId: string;
  type: EnhanceEquipmentType;
  fromLevel: number;
  to: number;
  rate: number;
  stones: number;
  refineStones: number;
  dropOnFail: boolean;
  useProtectCharm: false;
  success: boolean;
  finalLevel: number;
  attributes: EnhanceAttributes;
}
/** 只保存完整结果和当前夹具等级；没有 pending 状态或读档补做。 */
export interface EnhanceProgress {
  version: 1;
  ledgerId: string;
  instances: EnhanceFixtureInstance[];
  enhancements: EnhanceResult[];
  receipts: string[];
}
export const isEnhanceId = (value: unknown): value is string => typeof value === 'string'
  && /^[a-zA-Z][\w.-]{0,127}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
export const isEnhanceInstanceRef = (value: unknown): value is string => typeof value === 'string'
  && /^[a-zA-Z][\w.:-]{0,255}$/.test(value) && !['__proto__', 'prototype', 'constructor'].includes(value);
export const enhanceFields = (value: unknown, keys: readonly string[]): value is Record<string, unknown> => !!value
  && typeof value === 'object' && !Array.isArray(value) && [Object.prototype, null].includes(Object.getPrototypeOf(value))
  && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));
export const enhanceArray = (value: unknown): value is unknown[] => Array.isArray(value)
  && Object.getPrototypeOf(value) === Array.prototype
  && Reflect.ownKeys(value).every(key => key === 'length' || typeof key === 'string' && /^(0|[1-9]\d*)$/.test(key)
    && Number(key) < value.length && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'))
  && Array.from(value).every((_, index) => Object.prototype.hasOwnProperty.call(value, index));
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const equipmentType = (value: unknown): value is EnhanceEquipmentType => value === 'weapon' || value === 'armor';
export function isValidEnhanceInstances(value: unknown): value is EnhanceFixtureInstance[] {
  if (!enhanceArray(value) || !value.length) return false;
  const refs = new Set<string>();
  return value.every(row => {
    if (!enhanceFields(row, ['instanceRef', 'itemId', 'type', 'enhanceLevel']) || !isEnhanceInstanceRef(row.instanceRef)
      || refs.has(row.instanceRef) || !isEnhanceId(row.itemId) || !equipmentType(row.type) || !count(row.enhanceLevel)) return false;
    refs.add(row.instanceRef); return true;
  });
}
export function isValidEnhanceAttributes(value: unknown): value is EnhanceAttributes {
  return enhanceFields(value, ['atkRatioOfBase', 'defRatioOfBase', 'hpRatioOfBase', 'allRatio'])
    && Object.values(value).every(ratio);
}
/** 纯结构检查：不读配置、不写盘；未知状态、破链和歧义不猜 empty、不修复。 */
export function isValidEnhanceProgress(value: unknown): value is EnhanceProgress {
  try {
    if (!enhanceFields(value, ['version', 'ledgerId', 'instances', 'enhancements', 'receipts'])
      || value.version !== 1 || !isEnhanceId(value.ledgerId) || !isValidEnhanceInstances(value.instances)
      || !enhanceArray(value.enhancements) || !enhanceArray(value.receipts)
      || value.enhancements.length !== value.receipts.length) return false;
    const requests = new Set<string>(), refs = new Set<string>(), levels = new Map<string, number>();
    for (const row of value.enhancements) {
      if (!enhanceFields(row, ['state', 'enhanceRequestId', 'enhanceResultRef', 'instanceRef', 'itemId', 'type',
        'fromLevel', 'to', 'rate', 'stones', 'refineStones', 'dropOnFail', 'useProtectCharm', 'success', 'finalLevel', 'attributes'])
        || row.state !== 'committed' || !isEnhanceId(row.enhanceRequestId) || requests.has(row.enhanceRequestId)
        || row.enhanceResultRef !== `${value.ledgerId}:enhance:${row.enhanceRequestId}`
        || !isEnhanceInstanceRef(row.instanceRef) || !isEnhanceId(row.itemId) || !equipmentType(row.type)
        || !count(row.fromLevel) || !positive(row.to) || row.to !== row.fromLevel + 1
        || !ratio(row.rate) || row.rate > 1 || !positive(row.stones) || !positive(row.refineStones)
        || typeof row.dropOnFail !== 'boolean' || row.useProtectCharm !== false || typeof row.success !== 'boolean'
        || !count(row.finalLevel) || row.finalLevel !== (row.success ? row.to : row.fromLevel - (row.dropOnFail ? 1 : 0))
        || !isValidEnhanceAttributes(row.attributes)) return false;
      const instance = value.instances.find(other => other.instanceRef === row.instanceRef);
      if (!instance || instance.itemId !== row.itemId || instance.type !== row.type
        || levels.has(row.instanceRef) && levels.get(row.instanceRef) !== row.fromLevel) return false;
      levels.set(row.instanceRef, row.finalLevel);
      requests.add(row.enhanceRequestId); refs.add(row.enhanceResultRef as string);
    }
    return value.instances.every(row => !levels.has(row.instanceRef) || levels.get(row.instanceRef) === row.enhanceLevel)
      && value.receipts.every(ref => typeof ref === 'string' && refs.delete(ref)) && refs.size === 0;
  } catch { return false; }
}
