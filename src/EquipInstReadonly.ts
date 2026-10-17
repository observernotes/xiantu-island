import enhance from '@xt/balance/enhance.json';
import { ITEMS, inPhase, t } from './data';
import type { EquipSlot, Progress } from './Progress';
import { resolveFormalEquipSlotBinding, resolveFormalInventoryEquipBinding,
  type FormalInventoryEquipRow } from './EquipInstBinding';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import { EnchantGate } from './EnchantGate';
import { isEnhanceInstanceRef, isValidEnhanceProgress, type EnhanceFixtureInstance,
  type EnhanceProgress } from './EnhanceProgress';
import { isEnchantElement, isValidEnchantProgress, sameEnchantAttributes } from './EnchantProgress';

/** verified 仅接收生产 API 已证明的位置绑定；foreign 不携带实例引用。 */
export type InstBinding = { kind: 'empty' } | { kind: 'not_equip' } | { kind: 'no_instance' }
  | { kind: 'foreign' }
  | { kind: 'verified'; instanceRef: string };
export interface InstDisplay {
  lines: { key: string; text: string }[];
  kind: 'empty' | 'not_equip' | 'no_instance' | 'foreign' | 'unknown' | 'unavailable' | 'verified';
  enhanceOpen: boolean;
  enchantOpen: boolean;
  instanceRef?: string | null;
}
type Problem = 'no_instance' | 'foreign' | 'unknown';
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const own = (value: object, key: string) => Object.prototype.hasOwnProperty.call(value, key);
const openFact = (read: () => boolean): boolean => { try { return read() === true; } catch { return false; } };

/** 只读正式槽位绑定；缺失时不以数量或同原型候选制造身份。 */
export function resolveEquipSlotBinding(prog: Progress, slot: EquipSlot): InstBinding {
  return resolveFormalEquipSlotBinding(prog, slot);
}
/** 明确行交给正式 API 核实；纯 itemId 聚合行仍无实例绑定。 */
export function resolveInventoryEquipBinding(prog: Progress, row: FormalInventoryEquipRow | undefined): InstBinding {
  return resolveFormalInventoryEquipBinding(prog, row);
}

function supported(instance: EnhanceFixtureInstance): boolean {
  const item = own(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
  return !!item && item.type === 'equip' && inPhase(item) && item.enabled !== false
    && item.placeholder !== true && item.qualityEnabled !== true
    && (instance.type === 'weapon' ? item.slot === 'weapon'
      : instance.type === 'armor' && (item.slot === 'robe' || item.slot === 'shoes'));
}

/** 数量只核持有总量，绝不用来选择身份。 */
function ownsFormalInstances(prog: Progress): boolean {
  const totals = new Map<string, number>();
  for (const instance of prog.formalEnhanceInstances()) totals.set(instance.itemId, (totals.get(instance.itemId) ?? 0) + 1);
  return [...totals].every(([itemId, needed]) => {
    const held = prog.permanentCount(itemId);
    const equipped = Object.entries(prog.equip).filter(([slot, id]) => id === itemId && ITEMS[itemId]?.slot === slot).length;
    return count(held) && prog.count(itemId) === held && !own(prog.pillQualities, itemId) && held + equipped >= needed;
  });
}

/** 沿 EnhanceGate 核对已提交结果；不预览下一档，不修改或重算角色六维。 */
function completeEnhanceState(bag: EnhanceProgress): boolean {
  if (!isValidEnhanceProgress(bag) || bag.instances.some(row => !supported(row) || row.enhanceLevel > enhance.maxLevel)) return false;
  return bag.enhancements.every(result => {
    const rule = enhance.levels.find(row => row.to === result.to);
    const level = result.finalLevel;
    const allRatio = Object.entries(enhance.milestoneBonus).filter(([at]) => Number(at) <= level)
      .reduce((sum, [, bonus]) => sum + bonus.allRatio, 0);
    return !!rule && result.rate === rule.rate && result.stones === rule.stones
      && result.refineStones === rule.refineStones && result.dropOnFail === rule.dropOnFail
      && level <= enhance.maxLevel
      && result.attributes.atkRatioOfBase === (result.type === 'weapon' ? enhance.statPerLevel.weapon.atkRatioOfBase * level : 0)
      && result.attributes.defRatioOfBase === (result.type === 'armor' ? enhance.statPerLevel.armor.defRatioOfBase * level : 0)
      && result.attributes.hpRatioOfBase === (result.type === 'armor' ? enhance.statPerLevel.armor.hpRatioOfBase * level : 0)
      && result.attributes.allRatio === allRatio;
  });
}

function identity(prog: Progress, instanceRef: string): Problem | EnhanceFixtureInstance {
  if (!isEnhanceInstanceRef(instanceRef)) return 'unknown';
  const status = prog.formalEnhanceInstanceStatus(instanceRef);
  if (status === 'foreign') return 'foreign';
  if (status !== 'registered') return 'no_instance';
  if (prog.storageError !== undefined || !isValidEnhanceProgress(prog.enhance)) return 'unknown';
  const bag = prog.enhance;
  const instance = bag.instances.find(row => row.instanceRef === instanceRef);
  const source = bag.formalSources?.find(row => row.instanceRef === instanceRef);
  if (!instance || !source || instanceRef === instance.itemId) return 'no_instance';
  if (bag.formalSources?.some(row => prog.formalEnhanceInstanceStatus(row.instanceRef) !== 'registered')) return 'foreign';
  if (!supported(instance) || !count(instance.enhanceLevel) || instance.enhanceLevel > enhance.maxLevel
    || !completeEnhanceState(bag)) return 'unknown';
  if (!ownsFormalInstances(prog)) return 'unknown';
  // 附灵袋的档位冲突是共同身份异常，不能只隐藏附灵而保留他档强化。
  if (prog.enchant && [1, 2, 3].includes(prog.enchant.ownerSlot)
    && prog.enchant.ownerSlot !== source.ownerSlot) return 'foreign';
  return instance;
}

function enchantLines(prog: Progress, instance: EnhanceFixtureInstance): Problem | { key: string; vars?: Record<string, string | number> }[] {
  if (instance.type !== 'weapon') return [];
  if (!isEnchantElement(prog.rootElement)) return 'unknown';
  const bag = prog.enchant;
  if (bag === undefined) return [{ key: 'no_enchant' }];
  if (!isValidEnchantProgress(bag)) return 'unknown';
  // 完整袋中的每个附着仍须回查本档来源，未知记录不能拼成成功。
  for (const row of bag.instances) {
    const source = prog.enhance?.formalSources?.find(other => other.instanceRef === row.instanceRef);
    const registered = prog.enhance?.instances.find(other => other.instanceRef === row.instanceRef);
    if (!source || source.ownerSlot !== bag.ownerSlot || prog.formalEnhanceInstanceStatus(row.instanceRef) !== 'registered'
      || !registered || registered.itemId !== row.itemId || registered.type !== 'weapon') return 'foreign';
  }
  if (!bag.enchantments.every(result => result.stones === enhance.enchant.cost.stones
    && result.materials[0].count === enhance.enchant.cost.materials[0].count
    && result.attributes.elementDamage === enhance.enchant.elementDamage
    && result.attributes.sameRootBonus === (result.element === result.rootElement ? enhance.enchant.sameRootBonus : 0))) return 'unknown';
  const current = bag.instances.find(row => row.instanceRef === instance.instanceRef);
  if (!current) return [{ key: 'no_enchant' }];
  const latest = [...bag.enchantments].reverse().find(row => row.instanceRef === instance.instanceRef);
  if (!latest || latest.rootElement !== prog.rootElement || current.itemId !== instance.itemId
    || !sameEnchantAttributes(current.attributes, latest.attributes)) return 'unknown';
  const read = new EnchantGate(prog).element(instance.instanceRef);
  if (!read.allowed || !read.instance || !('element' in read.instance)
    || read.instance.element !== latest.element || !read.attributes
    || !sameEnchantAttributes(read.attributes, latest.attributes)) return 'unknown';
  const lines: { key: string; vars?: Record<string, string | number> }[] = [
    { key: 'enchant_element', vars: { element: latest.element } },
    { key: 'element_damage', vars: { pct: String(latest.attributes.elementDamage * 100) } },
  ];
  if (latest.element === prog.rootElement) lines.push({ key: 'same_root_bonus', vars: { pct: String(latest.attributes.sameRootBonus * 100) } });
  return lines;
}

/** 全态纯读：不创建请求、保存、登记、迁移或修复，关闭组先于任何实例字段读取。 */
export function buildInstDisplay(prog: Progress, binding: InstBinding): InstDisplay {
  const enhanceOpen = openFact(isEnhanceOpenForFixture), enchantOpen = openFact(isEnchantOpenForFixture);
  const display: InstDisplay = { kind: binding.kind, lines: [], enhanceOpen, enchantOpen, instanceRef: null };
  const add = (name: string, vars: Record<string, string | number> = {}) => {
    const key = `ui.equip.inst.${name}`;
    if (!display.lines.some(line => line.key === key)) display.lines.push({ key, text: t(key, vars) });
  };
  if (binding.kind === 'empty' || binding.kind === 'not_equip') return display;
  if (!enhanceOpen || !enchantOpen) add('unavailable');
  if (!enhanceOpen && !enchantOpen) { display.kind = 'unavailable'; return display; }
  if (binding.kind === 'no_instance') { display.kind = 'no_instance'; add('no_instance'); return display; }
  if (binding.kind === 'foreign') { display.kind = 'foreign'; add('foreign'); return display; }
  try {
    const checked = identity(prog, binding.instanceRef);
    if (typeof checked === 'string') { display.kind = checked; add(checked); return display; }
    const attached = enchantOpen ? enchantLines(prog, checked) : [];
    if (attached === 'foreign') { display.kind = 'foreign'; add('foreign'); return display; }
    display.kind = 'verified';
    display.instanceRef = binding.instanceRef;
    if (enhanceOpen) add(checked.enhanceLevel === 0 ? 'no_enhance' : 'enhance_level', { n: checked.enhanceLevel });
    if (typeof attached === 'string') { display.kind = attached; add(attached); }
    else for (const line of attached) add(line.key, line.vars);
    return display;
  } catch {
    display.kind = 'unknown'; display.instanceRef = null; display.lines = [];
    if (!enhanceOpen || !enchantOpen) add('unavailable');
    add('unknown'); return display;
  }
}
