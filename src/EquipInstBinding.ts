import { ITEMS, inPhase } from './data';
import { isEnhanceInstanceRef, isValidEnhanceProgress, type EnhanceFixtureInstance } from './EnhanceProgress';
import type { EquipSlot, Progress } from './Progress';

/** A 的生产位置证明；展示 resolver 由 B 另令接入。 */
export type FormalEquipBinding = { kind: 'empty' | 'not_equip' | 'no_instance' | 'foreign' }
  | { kind: 'verified'; instanceRef: string };
export type EquipInstanceRefs = Partial<Record<EquipSlot, string>>;
export interface FormalInventoryEquipRow { id: string; type?: string; instanceRef?: string }
export interface BagFormalEquipBinding { id: string; instanceRef: string }
const slots: readonly EquipSlot[] = ['weapon', 'robe', 'shoes'];
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;

/** 缺字段由调用方保留 undefined；坏键、访问器、非法引用或重复位置均拒绝。 */
export function isValidEquipInstanceRefs(value: unknown): value is EquipInstanceRefs {
  if (!value || typeof value !== 'object' || Array.isArray(value)
    || ![Object.prototype, null].includes(Object.getPrototypeOf(value))) return false;
  const refs = new Set<string>();
  return Reflect.ownKeys(value).every(key => {
    if (typeof key !== 'string' || !slots.some(slot => slot === key)) return false;
    const ref: unknown = Object.getOwnPropertyDescriptor(value, key)?.value;
    if (!isEnhanceInstanceRef(ref) || refs.has(ref)) return false;
    refs.add(ref); return true;
  });
}

function supported(instance: EnhanceFixtureInstance): boolean {
  const item = own(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
  return !!item && item.type === 'equip' && inPhase(item) && item.enabled !== false
    && item.placeholder !== true && item.qualityEnabled !== true
    && (instance.type === 'weapon' ? item.slot === 'weapon'
      : instance.type === 'armor' && (item.slot === 'robe' || item.slot === 'shoes'));
}

/** 数量仅核总持有，不从同 itemId 候选中选择实例。 */
function ownsItemInstances(prog: Progress, itemId: string, instances: readonly EnhanceFixtureInstance[]): boolean {
  const held = prog.permanentCount(itemId);
  const equipped = slots.filter(slot => prog.equip[slot] === itemId && ITEMS[itemId]?.slot === slot).length;
  const needed = instances.filter(row => row.itemId === itemId).length;
  return count(held) && prog.count(itemId) === held && !own(prog.pillQualities, itemId)
    && held + equipped >= needed;
}

function instanceFor(prog: Progress, itemId: string, ref: string): FormalEquipBinding {
  const status = prog.formalEnhanceInstanceStatus(ref);
  if (status === 'foreign') return { kind: 'foreign' };
  if (status !== 'registered' || prog.storageError !== undefined || !isValidEnhanceProgress(prog.enhance))
    return { kind: 'no_instance' };
  const instance = prog.enhance.instances.find(row => row.instanceRef === ref);
  return instance?.itemId === itemId && supported(instance) && ownsItemInstances(prog, itemId, prog.formalEnhanceInstances())
    ? { kind: 'verified', instanceRef: ref } : { kind: 'no_instance' };
}

/** 只认持久化的显式位置绑定；旧档、唯一候选和 count=1 均不回填。 */
export function resolveFormalEquipSlotBinding(prog: Progress, slot: EquipSlot): FormalEquipBinding {
  if (!slots.includes(slot)) return { kind: 'no_instance' };
  const itemId = prog.equip[slot];
  if (!itemId) return { kind: 'empty' };
  const refs = prog.equipInstanceRefs;
  if (!isValidEquipInstanceRefs(refs) || !own(refs, slot)) return { kind: 'no_instance' };
  const binding = instanceFor(prog, itemId, refs[slot]!);
  if (binding.kind !== 'verified') return binding;
  return ITEMS[itemId]?.slot === slot ? binding : { kind: 'no_instance' };
}

/** 列出未穿戴的正式实例；数量不足时整组拒绝，不选首件凑数。返回独立行。 */
export function listBagFormalEquipBindings(prog: Progress): BagFormalEquipBinding[] {
  if (prog.storageError !== undefined || !isValidEnhanceProgress(prog.enhance)
    || prog.equipInstanceRefs !== undefined && !isValidEquipInstanceRefs(prog.equipInstanceRefs)) return [];
  const equipped = new Set(Object.values(prog.equipInstanceRefs ?? {}));
  const instances = prog.formalEnhanceInstances();
  const unbound = instances.filter(row => !equipped.has(row.instanceRef));
  const totals = new Map<string, number>();
  for (const row of unbound) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + 1);
  const heldItems = new Set([...totals].filter(([itemId, needed]) => prog.permanentCount(itemId) >= needed
    && ownsItemInstances(prog, itemId, instances)).map(([itemId]) => itemId));
  return unbound.filter(row => heldItems.has(row.itemId) && supported(row))
    .map(row => ({ id: row.itemId, instanceRef: row.instanceRef }));
}

/** 聚合行无 ref 永远 no_instance；明确行还须证明该 ref 当前在袋。 */
export function resolveFormalInventoryEquipBinding(prog: Progress, row: FormalInventoryEquipRow | undefined): FormalEquipBinding {
  if (!row || !own(ITEMS, row.id) || ITEMS[row.id]?.type !== 'equip') return { kind: 'not_equip' };
  if (!isEnhanceInstanceRef(row.instanceRef)) return { kind: 'no_instance' };
  const binding = instanceFor(prog, row.id, row.instanceRef);
  if (binding.kind !== 'verified') return binding;
  return listBagFormalEquipBindings(prog).some(entry => entry.id === row.id && entry.instanceRef === row.instanceRef)
    ? binding : { kind: 'no_instance' };
}
