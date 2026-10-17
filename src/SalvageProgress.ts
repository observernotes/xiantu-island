import { enhanceArray, enhanceFields, isEnhanceId, isEnhanceInstanceRef,
  type EnhanceEquipmentType, type FormalEnhanceSource } from './EnhanceProgress';
import { isForgeGrade, type ForgeGrade } from './ForgeProgress';

export type SalvageLocation = { kind: 'inventory' } | { kind: 'equip'; slot: 'weapon' | 'robe' | 'shoes' };
export interface SalvageResult {
  state: 'committed';
  salvageRequestId: string;
  salvageResultRef: string;
  instanceRef: string;
  itemId: string;
  type: EnhanceEquipmentType;
  grade: ForgeGrade;
  enhanceLevel: number;
  formalSource: FormalEnhanceSource;
  location: SalvageLocation;
  refineStones: number;
  output: { itemId: 'refine_stone'; count: number };
  destroyed: true;
  success: true;
}
/** 只记录完整销毁、产物和收据；正式来源退役，既有打造/强化历史原样保留。 */
export interface SalvageProgress {
  version: 1;
  ledgerId: string;
  ownerSlot: 1 | 2 | 3;
  destructions: SalvageResult[];
  receipts: string[];
}
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
export function isValidSalvageLocation(value: unknown): value is SalvageLocation {
  return enhanceFields(value, ['kind']) && value.kind === 'inventory'
    || enhanceFields(value, ['kind', 'slot']) && value.kind === 'equip' && ['weapon', 'robe', 'shoes'].includes(value.slot as string);
}
/** 纯结构检查，不读取配置、不补档；未知旧记录和半份事务保留原信息并拒绝使用。 */
export function isValidSalvageProgress(value: unknown): value is SalvageProgress {
  try {
    if (!enhanceFields(value, ['version', 'ledgerId', 'ownerSlot', 'destructions', 'receipts'])
      || value.version !== 1 || !isEnhanceId(value.ledgerId) || ![1, 2, 3].includes(value.ownerSlot as number)
      || !enhanceArray(value.destructions) || !value.destructions.length || !enhanceArray(value.receipts)
      || value.receipts.length !== value.destructions.length) return false;
    const requests = new Set<string>(), instances = new Set<string>(), receipts = new Set<string>();
    for (const row of value.destructions) {
      if (!enhanceFields(row, ['state', 'salvageRequestId', 'salvageResultRef', 'instanceRef', 'itemId', 'type',
        'grade', 'enhanceLevel', 'formalSource', 'location', 'refineStones', 'output', 'destroyed', 'success'])
        || row.state !== 'committed' || row.destroyed !== true || row.success !== true
        || !isEnhanceId(row.salvageRequestId) || requests.has(row.salvageRequestId)
        || row.salvageResultRef !== `${value.ledgerId}:salvage:${row.salvageRequestId}`
        || !isEnhanceInstanceRef(row.instanceRef) || instances.has(row.instanceRef) || !isEnhanceId(row.itemId)
        || !['weapon', 'armor'].includes(row.type as string) || !isForgeGrade(row.grade) || !count(row.enhanceLevel)
        || !isValidSalvageLocation(row.location)
        || row.location.kind === 'equip' && (row.type === 'weapon' ? row.location.slot !== 'weapon' : row.location.slot === 'weapon')
        || !positive(row.refineStones)
        || !enhanceFields(row.output, ['itemId', 'count']) || row.output.itemId !== 'refine_stone'
        || row.output.count !== row.refineStones
        || !enhanceFields(row.formalSource, ['instanceRef', 'source', 'forgeLedgerId', 'craftResultRef', 'ownerSlot'])
        || row.formalSource.source !== 'forge' || row.formalSource.instanceRef !== row.instanceRef
        || row.formalSource.ownerSlot !== value.ownerSlot || !isEnhanceId(row.formalSource.forgeLedgerId)
        || !isEnhanceInstanceRef(row.formalSource.craftResultRef)
        || !row.formalSource.craftResultRef.startsWith(`${row.formalSource.forgeLedgerId}:craft:`)
        || !isEnhanceId(row.formalSource.craftResultRef.slice(`${row.formalSource.forgeLedgerId}:craft:`.length))
        || row.instanceRef !== `${row.formalSource.craftResultRef}:item`) return false;
      requests.add(row.salvageRequestId); instances.add(row.instanceRef); receipts.add(row.salvageResultRef as string);
    }
    return value.receipts.every(ref => typeof ref === 'string' && receipts.delete(ref)) && receipts.size === 0;
  } catch { return false; }
}
