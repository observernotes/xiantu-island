import { enhanceArray, enhanceFields, isEnhanceId, isEnhanceInstanceRef } from './EnhanceProgress';

export type EnchantElement = '金' | '木' | '水' | '火' | '土';
export interface EnchantAttributes { elementDamage: number; sameRootBonus: number }
export interface EnchantInstance {
  instanceRef: string;
  itemId: string;
  type: 'weapon';
  element: EnchantElement;
  attributes: EnchantAttributes;
}
export interface EnchantResult {
  state: 'committed';
  enchantRequestId: string;
  enchantResultRef: string;
  instanceRef: string;
  itemId: string;
  type: 'weapon';
  fromElement: EnchantElement | null;
  element: EnchantElement;
  rootElement: EnchantElement;
  stones: number;
  materials: { itemId: 'beast_core'; count: number }[];
  attributes: EnchantAttributes;
  success: true;
}
/** 仅完整提交才建袋；最终状态与有序结果链一起保存，不支持 pending 或自动补做。 */
export interface EnchantProgress {
  version: 1;
  ledgerId: string;
  ownerSlot: 1 | 2 | 3;
  instances: EnchantInstance[];
  enchantments: EnchantResult[];
  receipts: string[];
}
export const isEnchantElement = (value: unknown): value is EnchantElement =>
  value === '金' || value === '木' || value === '水' || value === '火' || value === '土';
const positive = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value > 0;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 1;
export const sameEnchantAttributes = (left: EnchantAttributes, right: EnchantAttributes): boolean =>
  left.elementDamage === right.elementDamage && left.sameRootBonus === right.sameRootBonus;
export function isValidEnchantAttributes(value: unknown): value is EnchantAttributes {
  return enhanceFields(value, ['elementDamage', 'sameRootBonus']) && ratio(value.elementDamage)
    && value.elementDamage > 0 && ratio(value.sameRootBonus);
}
/** 纯结构校验，不读表、不修档；拒绝未知字段、半份结果、断链和歧义去重。 */
export function isValidEnchantProgress(value: unknown): value is EnchantProgress {
  try {
    if (!enhanceFields(value, ['version', 'ledgerId', 'ownerSlot', 'instances', 'enchantments', 'receipts'])
      || value.version !== 1 || !isEnhanceId(value.ledgerId) || ![1, 2, 3].includes(value.ownerSlot as number)
      || !enhanceArray(value.instances) || !value.instances.length || !enhanceArray(value.enchantments)
      || !value.enchantments.length || !enhanceArray(value.receipts)
      || value.receipts.length !== value.enchantments.length) return false;
    const instances = new Map<string, EnchantInstance>();
    for (const row of value.instances) {
      if (!enhanceFields(row, ['instanceRef', 'itemId', 'type', 'element', 'attributes'])
        || !isEnhanceInstanceRef(row.instanceRef) || instances.has(row.instanceRef)
        || !isEnhanceId(row.itemId) || row.type !== 'weapon' || !isEnchantElement(row.element)
        || !isValidEnchantAttributes(row.attributes)) return false;
      instances.set(row.instanceRef, row as unknown as EnchantInstance);
    }
    const requests = new Set<string>(), receipts = new Set<string>(), latest = new Map<string, EnchantResult>();
    for (const row of value.enchantments) {
      if (!enhanceFields(row, ['state', 'enchantRequestId', 'enchantResultRef', 'instanceRef', 'itemId', 'type',
        'fromElement', 'element', 'rootElement', 'stones', 'materials', 'attributes', 'success'])
        || row.state !== 'committed' || row.success !== true || !isEnhanceId(row.enchantRequestId)
        || requests.has(row.enchantRequestId) || row.enchantResultRef !== `${value.ledgerId}:enchant:${row.enchantRequestId}`
        || !isEnhanceInstanceRef(row.instanceRef) || !isEnhanceId(row.itemId) || row.type !== 'weapon'
        || row.fromElement !== null && !isEnchantElement(row.fromElement) || !isEnchantElement(row.element)
        || row.fromElement === row.element || !isEnchantElement(row.rootElement) || !positive(row.stones)
        || !enhanceArray(row.materials) || row.materials.length !== 1
        || !enhanceFields(row.materials[0], ['itemId', 'count']) || row.materials[0].itemId !== 'beast_core'
        || !positive(row.materials[0].count) || !isValidEnchantAttributes(row.attributes)
        || (row.rootElement !== row.element && row.attributes.sameRootBonus !== 0)
        || (row.rootElement === row.element && row.attributes.sameRootBonus <= 0)) return false;
      const instance = instances.get(row.instanceRef), previous = latest.get(row.instanceRef);
      if (!instance || instance.itemId !== row.itemId || row.fromElement !== (previous?.element ?? null)) return false;
      requests.add(row.enchantRequestId); receipts.add(row.enchantResultRef as string);
      latest.set(row.instanceRef, row as unknown as EnchantResult);
    }
    return [...instances.values()].every(instance => {
      const last = latest.get(instance.instanceRef);
      return !!last && instance.element === last.element && sameEnchantAttributes(instance.attributes, last.attributes);
    }) && value.receipts.every(ref => typeof ref === 'string' && receipts.delete(ref)) && receipts.size === 0;
  } catch { return false; }
}
