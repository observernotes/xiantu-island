import enhance from '@xt/balance/enhance.json';
import itemDefinitions from '@xt/balance/items.json';
import materialDefinitions from '@xt/balance/materials.json';
import { ITEMS, inPhase } from './data';
import { Progress } from './Progress';
import { featureEnabled } from './features';
import { saveStore, type SaveBackend, type SaveData, type SlotKey } from './SaveStore';
import { isSalvageOpenForFixture } from './SalvageOpenFlag';
import * as SalvageClosed from './SalvageClosed';
import { enhanceFields, isEnhanceId, isEnhanceInstanceRef, isValidEnhanceProgress,
  type EnhanceFixtureInstance, type FormalEnhanceSource } from './EnhanceProgress';
import { isForgeGrade, isValidForgeProgress, type ForgeGrade } from './ForgeProgress';
import { isValidEnchantProgress } from './EnchantProgress';
import { listBagFormalEquipBindings, resolveFormalEquipSlotBinding, resolveFormalInventoryEquipBinding } from './EquipInstBinding';
import { isValidSalvageLocation, isValidSalvageProgress,
  type SalvageLocation, type SalvageProgress, type SalvageResult } from './SalvageProgress';

export interface SalvageRequest {
  salvageRequestId: string;
  instanceRef: string;
  fromGrade: ForgeGrade;
  fromEnhanceLevel: number;
}
/** 正式来源和精确位置已核实后的分解资格；不登记、补造或授权实例来源。 */
export interface SalvageQualification {
  instanceRef: string;
  ownerSlot: SlotKey;
  bound: boolean;
  natal: boolean;
  bloodBound: boolean;
  unsalvageable: boolean;
  location: SalvageLocation;
}
/** 可剥离测试证据；显式覆盖只服务隔离回归，不充当生产资格来源。 */
export interface SalvageFixtureQualification extends SalvageQualification {}
export interface SalvageFixtureOptions {
  /** 仅隔离回归显式覆盖资格；生产从正式来源及 EquipInstBinding 精确位置核实。 */
  qualification?: (progress: Readonly<Progress>, instanceRef: string) => SalvageFixtureQualification | undefined;
  ledgerId?: () => string;
  /** 当前正式背包无槽上限；仅测试显式施加有限收纳约束，不能扩大物品堆叠上限。 */
  capacity?: { slots: number; stackLimit?: number };
  /** 仅一个 SSR 夹具图的显式原子承载；正式存储不自动安装或获得此能力。 */
  atomicCarrier?: SalvageFixtureCarrier;
  canCommitResult?: (draft: Progress, result: SalvageResult) => boolean;
}
export interface SalvageAllowed {
  allowed: true;
  instance?: EnhanceFixtureInstance;
  grade?: ForgeGrade;
  refineStones?: number;
  output?: { itemId: 'refine_stone'; count: number };
  result?: SalvageResult;
  progress?: SalvageProgress;
  replayed?: boolean;
}
export interface SalvageDenied { allowed: false; tipKey: string; text: string }
export type SalvageGateResult = SalvageAllowed | SalvageDenied;
type Selection = { allowed: true; instance: EnhanceFixtureInstance; source: FormalEnhanceSource;
  grade: ForgeGrade; location: SalvageLocation; ownerSlot: SlotKey; refineStones: number };
const copy = <T>(value: T): T => structuredClone(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const denied = (reason: string, text: string): SalvageDenied => ({ allowed: false, tipKey: `salvage.fixture.${reason}`, text });
const ownData = (progress: Progress): Record<string, unknown> => Object.fromEntries(Object.entries(progress)
  .filter(([, value]) => typeof value !== 'function'));
const snapshot = (value: unknown): string => JSON.stringify(value instanceof Progress ? value.exportSave() : value,
  (_key, row: unknown) => row && typeof row === 'object' && !Array.isArray(row)
    ? Object.fromEntries(Object.entries(row).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : row);

/**
 * 可剥离的单 SSR 图测试载体。所有 writer 经同一后端串行，新增分解事实必须 CAS；
 * 既有 Gate 的旧对象不能把已提交的销毁/产物收据写掉。此载体不提供正式实例或绑定授权。
 */
export class SalvageFixtureCarrier {
  readonly backend: SaveBackend;
  #queue: Promise<unknown> = Promise.resolve();
  #reads = 0;
  #leases = new Map<SlotKey, { expected: string; consumed: boolean }>();
  constructor(base: SaveBackend) {
    const queued = <T>(action: () => Promise<T>): Promise<T> => {
      const next = this.#queue.then(action, action);
      this.#queue = next.catch(() => undefined);
      return next;
    };
    this.backend = {
      read: slot => { this.#reads++; return base.read(slot); },
      write: slot => queued(async () => {
        const current = await base.read(slot.slotKey), previous: unknown = current?.data.salvage, next: unknown = slot.data.salvage;
        if (snapshot(previous) !== snapshot(next)) {
          const lease = this.#leases.get(slot.slotKey);
          if (!lease || lease.consumed || !current || snapshot(current.data) !== lease.expected || !isValidSalvageProgress(next)
            || previous !== undefined && (!isValidSalvageProgress(previous) || next.ledgerId !== previous.ledgerId
              || next.ownerSlot !== previous.ownerSlot || next.destructions.length !== previous.destructions.length + 1
              || snapshot(next.destructions.slice(0, -1)) !== snapshot(previous.destructions)
              || snapshot(next.receipts.slice(0, -1)) !== snapshot(previous.receipts))
            || previous === undefined && next.destructions.length !== 1) throw new Error('分解夹具原子比较失败');
          await base.write(slot);
          lease.consumed = true;
          return;
        }
        // 普通旧 writer 必须完整保留已提交袋；同时不能把失效正式身份重新登记。
        if (next !== undefined && (!isValidSalvageProgress(next) || this.revives(slot.data, next)))
          throw new Error('旧写入不能覆盖分解事实');
        await base.write(slot);
      }),
      delete: slot => queued(() => base.delete(slot)),
      insertIfEmpty: slot => queued(() => base.insertIfEmpty(slot)),
    };
  }
  async run<T>(slot: SlotKey, expected: string, commit: () => Promise<T | undefined>): Promise<T | undefined> {
    if (this.#leases.has(slot)) return undefined;
    // SaveStore.readSlot 同步调用 backend.read 后才 await；可验证当前图确实安装本载体。
    const reads = this.#reads, pending = saveStore.readSlot(slot);
    if (this.#reads !== reads + 1) { await pending.catch(() => undefined); return undefined; }
    const stored = await pending;
    if (!stored || snapshot(stored.data) !== expected || this.#leases.has(slot)) return undefined;
    const lease = { expected, consumed: false };
    this.#leases.set(slot, lease);
    try {
      const result = await commit();
      return lease.consumed ? result : undefined;
    } finally { this.#leases.delete(slot); }
  }
  private revives(data: SaveData, bag: SalvageProgress): boolean {
    const enhanceBag = data.enhance;
    if (!isValidEnhanceProgress(enhanceBag)) return true;
    return bag.destructions.some(result => enhanceBag.formalSources?.some(source => source.instanceRef === result.instanceRef));
  }
}
export const createSalvageFixtureCarrier = (backend: SaveBackend): SalvageFixtureCarrier => new SalvageFixtureCarrier(backend);

/** 正式提交只消费本档来源及精确位置证明；测试选项不作为生产默认依赖。 */
export class SalvageGate {
  static #slots = new Set<SlotKey>();
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: SalvageFixtureOptions = {}) {}

  feature(): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.featureClosed();
    return this.validRules() ? { allowed: true } : denied('rules', '分解配置或精炼石正式映射不完整。');
  }
  entrance(): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseEntrance();
    return this.validRules() ? { allowed: true } : denied('rules', '分解配置或精炼石正式映射不完整。');
  }
  salvage(request?: SalvageRequest): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseSalvage();
    try {
      if (!this.valid(this.progress)) return denied('progress', '分解档案存在歧义，已阻止写入。');
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!this.canReceive(this.progress, selected)) return denied('capacity', '背包无法完整接收精炼石。');
      return { allowed: true, instance: copy(selected.instance), grade: selected.grade,
        refineStones: selected.refineStones, output: { itemId: 'refine_stone', count: selected.refineStones } };
    } catch { return denied('request', '分解选择无效。'); }
  }
  async submit(request: SalvageRequest): Promise<SalvageGateResult> {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseSubmit();
    try {
      if (this.#busy) return denied('busy', '正在保存分解结果，请稍候。');
      if (!this.valid(this.progress)) return denied('progress', '分解档案存在歧义，已阻止写入。');
      if (!this.validRequest(request)) return denied('request', '分解请求无效。');
      const previous = this.progress.salvage?.destructions.find(row => row.salvageRequestId === request.salvageRequestId);
      if (previous) return this.replay(previous, request);
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!featureEnabled('indexedDbSaves')
        || this.fixture.atomicCarrier !== undefined && !(this.fixture.atomicCarrier instanceof SalvageFixtureCarrier))
        return denied('carrier', '分解原子保存不可用，保持原合法状态。');
      if (!this.canReceive(this.progress, selected)) return denied('capacity', '背包无法完整接收精炼石。');
      const intent = copy(request);
      return await this.transact(selected.ownerSlot, (draft, reject) => {
        if (!isSalvageOpenForFixture()) return reject(SalvageClosed.refuseSubmit());
        if (draft.salvage?.destructions.some(row => row.salvageRequestId === intent.salvageRequestId))
          return reject(denied('duplicate', '该请求已完成，请只读查看原结果。'));
        const selection = this.selection(draft, intent);
        if (!selection.allowed) return reject(selection);
        if (!this.canReceive(draft, selection)) return reject(denied('capacity', '背包无法完整接收精炼石。'));
        const ledgerId = draft.salvage?.ledgerId ?? (this.fixture.ledgerId ? this.fixture.ledgerId() : `salvage_${crypto.randomUUID()}`);
        if (!isEnhanceId(ledgerId)) return reject(denied('identity', '分解账本身份无效。'));
        const result: SalvageResult = {
          state: 'committed', salvageRequestId: intent.salvageRequestId,
          salvageResultRef: `${ledgerId}:salvage:${intent.salvageRequestId}`,
          instanceRef: selection.instance.instanceRef, itemId: selection.instance.itemId, type: selection.instance.type,
          grade: selection.grade, enhanceLevel: selection.instance.enhanceLevel,
          formalSource: copy(selection.source), location: copy(selection.location), refineStones: selection.refineStones,
          output: { itemId: 'refine_stone', count: selection.refineStones }, destroyed: true, success: true,
        };
        const bag: SalvageProgress = draft.salvage ?? {
          version: 1, ledgerId, ownerSlot: selection.ownerSlot, destructions: [], receipts: [],
        };
        const inventory = copy(draft.inventory), equip = copy(draft.equip), levels = copy(draft.enhance!);
        const unchanged = this.snapshot({ forge: draft.forge, enchant: draft.enchant, stones: draft.stones,
          forgingLevel: draft.forgingLevel, forgingExp: draft.forgingExp, pillQualities: draft.pillQualities });
        // 只销毁被精确证明的持有引用；未选实例和历史等级、打造/附灵事实均保留。
        if (selection.location.kind === 'inventory') draft.removeItem(result.itemId, 1);
        else {
          delete draft.equip[selection.location.slot];
          draft.hp = Math.min(draft.hp, draft.maxHp); draft.mp = Math.min(draft.mp, draft.maxMp);
        }
        draft.enhance!.formalSources = draft.enhance!.formalSources!.filter(row => row.instanceRef !== result.instanceRef);
        draft.addItem('refine_stone', result.refineStones);
        bag.destructions.push(result); bag.receipts.push(result.salvageResultRef); draft.salvage = bag;
        const settled = this.snapshot(ownData(draft));
        if ((this.fixture.canCommitResult && this.fixture.canCommitResult(draft, copy(result)) !== true)
          || settled !== this.snapshot(ownData(draft))) return reject(denied('commit', '分解结果承载失败，保持原合法状态。'));
        const expectedInventory = copy(inventory), expectedEquip = copy(equip), expectedLevels = copy(levels);
        if (selection.location.kind === 'inventory') expectedInventory[result.itemId] -= 1;
        else delete expectedEquip[selection.location.slot];
        expectedInventory.refine_stone = (expectedInventory.refine_stone ?? 0) + result.refineStones;
        expectedLevels.formalSources = expectedLevels.formalSources!.filter(row => row.instanceRef !== result.instanceRef);
        if (this.snapshot(draft.inventory) !== this.snapshot(expectedInventory) || this.snapshot(draft.equip) !== this.snapshot(expectedEquip)
          || this.snapshot(draft.enhance!) !== this.snapshot(expectedLevels)
          || unchanged !== this.snapshot({ forge: draft.forge, enchant: draft.enchant, stones: draft.stones,
            forgingLevel: draft.forgingLevel, forgingExp: draft.forgingExp, pillQualities: draft.pillQualities }))
          return reject(denied('commit', '分解结果承载失败，保持原合法状态。'));
        return { allowed: true, result: copy(result), output: copy(result.output), progress: copy(bag), replayed: false };
      });
    } catch { return denied('save', '分解未提交，保持原合法状态。'); }
  }
  result(salvageRequestId?: string): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseResult();
    if (!this.valid(this.progress)) return denied('progress', '分解档案存在歧义，已阻止写入。');
    const result = this.progress.salvage?.destructions.find(row => row.salvageRequestId === salvageRequestId);
    return result ? { allowed: true, result: copy(result), replayed: true } : denied('result', '没有完整提交的分解结果。');
  }
  output(salvageRequestId?: string): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseOutput();
    if (!this.valid(this.progress)) return denied('progress', '分解档案存在歧义，已阻止写入。');
    const result = this.progress.salvage?.destructions.find(row => row.salvageRequestId === salvageRequestId);
    return result ? { allowed: true, result: copy(result), output: copy(result.output), replayed: true }
      : denied('result', '没有完整提交的精炼石产出。');
  }
  loadRefresh(): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseLoadRefresh();
    if (!this.valid(this.progress)) return denied('progress', '分解档案存在歧义，已阻止写入。');
    return this.progress.salvage === undefined ? { allowed: true } : { allowed: true, progress: copy(this.progress.salvage), replayed: true };
  }
  laterService(): SalvageGateResult {
    if (!isSalvageOpenForFixture()) return SalvageClosed.refuseLaterService();
    return SalvageClosed.refuseLaterService();
  }

  private validRequest(value: unknown): value is SalvageRequest {
    return enhanceFields(value, ['salvageRequestId', 'instanceRef', 'fromGrade', 'fromEnhanceLevel'])
      && isEnhanceId(value.salvageRequestId) && isEnhanceInstanceRef(value.instanceRef)
      && isForgeGrade(value.fromGrade) && count(value.fromEnhanceLevel);
  }
  private replay(result: SalvageResult, request: SalvageRequest): SalvageGateResult {
    return result.instanceRef === request.instanceRef && result.grade === request.fromGrade && result.enhanceLevel === request.fromEnhanceLevel
      ? { allowed: true, result: copy(result), output: copy(result.output), replayed: true }
      : denied('conflict', '同一分解请求载荷冲突，不能冒认原结果。');
  }
  private qualification(progress: Progress, instanceRef: string): SalvageQualification | undefined {
    if (!this.fixture.qualification) return this.formalQualification(progress, instanceRef);
    // 外置夹具只获隔离视图，预览不能借测试回调修改业务对象。
    const view = Object.assign(new Progress(), copy(ownData(progress))), before = this.snapshot(ownData(view));
    const evidence = this.fixture.qualification(view, instanceRef);
    return this.snapshot(ownData(view)) === before && evidence ? copy(evidence) : undefined;
  }
  private formalQualification(progress: Progress, instanceRef: string): SalvageQualification | undefined {
    if (progress.formalEnhanceInstanceStatus(instanceRef) !== 'registered') return undefined;
    const source = progress.enhance?.formalSources?.find(row => row.instanceRef === instanceRef);
    const instance = progress.formalEnhanceInstances().find(row => row.instanceRef === instanceRef);
    if (!source || !instance) return undefined;
    let location: SalvageLocation | undefined;
    for (const slot of ['weapon', 'robe', 'shoes'] as const) {
      const binding = resolveFormalEquipSlotBinding(progress, slot);
      if (binding.kind === 'verified' && binding.instanceRef === instanceRef) location = { kind: 'equip', slot };
    }
    if (!location) {
      const row = listBagFormalEquipBindings(progress).find(row => row.instanceRef === instanceRef && row.id === instance.itemId);
      const binding = resolveFormalInventoryEquipBinding(progress, row);
      if (binding.kind !== 'verified' || binding.instanceRef !== instanceRef) return undefined;
      location = { kind: 'inventory' };
    }
    // 正式装备当前没有绑定/本命/精血/不可分解的对立 schema；合法正式实例按可分解默认核实。
    // 身份及位置始终由正式来源和显式 instanceRef 证明，绝不按 itemId、数量或唯一候选选件。
    return { instanceRef, ownerSlot: source.ownerSlot, bound: false, natal: false, bloodBound: false,
      unsalvageable: false, location };
  }
  private validQualification(value: unknown, instanceRef: string, ownerSlot: SlotKey, selected = true): value is SalvageQualification {
    return enhanceFields(value, ['instanceRef', 'ownerSlot', 'bound', 'natal', 'bloodBound', 'unsalvageable', 'location'])
      && value.instanceRef === instanceRef && value.ownerSlot === ownerSlot
      && [value.bound, value.natal, value.bloodBound, value.unsalvageable].every(mark => typeof mark === 'boolean' && (!selected || mark === false))
      && isValidSalvageLocation(value.location);
  }
  private selection(progress: Progress, request: SalvageRequest | undefined): Selection | SalvageDenied {
    if (!this.validRequest(request)) return denied('request', '分解请求无效。');
    if (progress.salvage?.destructions.some(row => row.instanceRef === request.instanceRef))
      return denied('destroyed', '该正式装备实例已经销毁。');
    const status = progress.formalEnhanceInstanceStatus(request.instanceRef);
    if (status === 'foreign') return denied('foreign', '该装备不属于当前存档。');
    if (status !== 'registered') return denied('no_instance', '没有本档正式登记的装备实例。');
    const instance = progress.formalEnhanceInstances().find(row => row.instanceRef === request.instanceRef);
    const source = progress.enhance?.formalSources?.find(row => row.instanceRef === request.instanceRef);
    if (!instance || !source || request.instanceRef === instance.itemId) return denied('no_instance', '没有本档正式登记的装备实例。');
    const item = Object.prototype.hasOwnProperty.call(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
    if (!item || item.type !== 'equip' || !inPhase(item) || item.enabled === false || item.placeholder === true || item.qualityEnabled === true
      || !(instance.type === 'weapon' && item.slot === 'weapon' || instance.type === 'armor' && ['robe', 'shoes'].includes(item.slot ?? '')))
      return denied('bad_type', '分解只接受合法正式武器或 robe/shoes 防具。');
    if (!count(instance.enhanceLevel) || instance.enhanceLevel > enhance.maxLevel || instance.enhanceLevel !== request.fromEnhanceLevel)
      return denied('stale', '装备当前等级已变化，请重新选择。');
    const craft = progress.forge?.crafts.find(row => row.craftResultRef === source.craftResultRef);
    if (!craft || !isForgeGrade(craft.resultGrade) || craft.resultGrade !== request.fromGrade)
      return denied('grade', '无法核实装备已存品质，或选择已经过期。');
    const ownerSlot = source.ownerSlot;
    if (ownerSlot !== progress.getSaveSlot() || progress.salvage && progress.salvage.ownerSlot !== ownerSlot)
      return denied('foreign', '分解来源或结果不属于当前存档。');
    const evidence = this.qualification(progress, instance.instanceRef);
    if (!this.validQualification(evidence, instance.instanceRef, ownerSlot))
      return denied('qualification', '绑定、本命、精血或精确持有关系字段未齐，不能分解。');
    // 既有附灵袋要求其历史实例仍有正式来源；本窗不改该行为，无法安全退役时整拒。
    if (progress.enchant?.instances.some(row => row.instanceRef === instance.instanceRef)
      || progress.enchant?.enchantments.some(row => row.instanceRef === instance.instanceRef))
      return denied('relation', '现有附灵关联不能完整退役，保持原装备与历史。');
    const related = progress.formalEnhanceInstances().filter(row => row.itemId === instance.itemId);
    let inventoryRefs = 0;
    const equipRefs = new Set<string>();
    for (const row of related) {
      const proof = row.instanceRef === instance.instanceRef ? evidence : this.qualification(progress, row.instanceRef);
      if (!this.validQualification(proof, row.instanceRef, ownerSlot, row.instanceRef === instance.instanceRef))
        return denied('relation', '同原型实例持有关系不完整。');
      if (proof.location.kind === 'inventory') inventoryRefs++;
      else {
        if (proof.location.slot !== item.slot || progress.equip[proof.location.slot] !== instance.itemId || equipRefs.has(proof.location.slot))
          return denied('relation', '装备槽与正式实例引用不一致。');
        equipRefs.add(proof.location.slot);
      }
    }
    if (!count(progress.permanentCount(instance.itemId)) || progress.count(instance.itemId) !== progress.permanentCount(instance.itemId)
      || progress.permanentCount(instance.itemId) < inventoryRefs || Object.prototype.hasOwnProperty.call(progress.pillQualities, instance.itemId))
      return denied('relation', '正式装备持有数量或位置不一致。');
    return { allowed: true, instance, source, grade: craft.resultGrade, location: evidence.location, ownerSlot,
      refineStones: enhance.salvage.refineStonesByGrade[craft.resultGrade] };
  }
  private canReceive(progress: Progress, selected: Selection): boolean {
    if (!progress.canReceiveItem('refine_stone', selected.refineStones)
      || progress.count('refine_stone') !== progress.permanentCount('refine_stone')
      || Object.prototype.hasOwnProperty.call(progress.pillQualities, 'refine_stone')) return false;
    const inventory = copy(progress.inventory);
    if (selected.location.kind === 'inventory') inventory[selected.instance.itemId] -= 1;
    inventory.refine_stone = (inventory.refine_stone ?? 0) + selected.refineStones;
    if (!Object.values(inventory).every(count)) return false;
    if (this.fixture.capacity === undefined) return true;
    const capacity = this.fixture.capacity, actualStack: unknown = Reflect.get(ITEMS.refine_stone, 'stack');
    if (!enhanceFields(capacity, ['slots', ...(Object.prototype.hasOwnProperty.call(capacity, 'stackLimit') ? ['stackLimit'] : [])])
      || !count(capacity.slots) || !positive(actualStack)
      || capacity.stackLimit !== undefined && (!positive(capacity.stackLimit) || capacity.stackLimit > actualStack)) return false;
    let slots = 0;
    for (const [itemId, owned] of Object.entries(inventory)) {
      if (!owned) continue;
      const stack: unknown = itemId === 'refine_stone' ? capacity.stackLimit ?? actualStack
        : ITEMS[itemId] ? Reflect.get(ITEMS[itemId], 'stack') ?? 1 : 1;
      if (!positive(stack)) return false;
      slots += Math.ceil(owned / stack);
      if (!count(slots) || slots > capacity.slots) return false;
    }
    return true;
  }
  private validRules(): boolean {
    try {
      const rules: unknown = enhance.salvage;
      if (!enhanceFields(rules, ['refineStonesByGrade'])
        || !enhanceFields(rules.refineStonesByGrade, ['common', 'fine', 'spirit', 'treasure'])
        || !Object.values(rules.refineStonesByGrade).every(positive)
        || JSON.stringify(['common', 'fine', 'spirit', 'treasure'].map(grade => Reflect.get(rules.refineStonesByGrade as object, grade)))
          !== JSON.stringify([1, 2, 4, 8])) return false;
      const definitions = itemDefinitions.filter(row => row.id === 'refine_stone');
      const materials = materialDefinitions.filter(row => row.id === 'refine_stone');
      const registered = definitions[0], material = materials[0], item = ITEMS.refine_stone;
      return definitions.length === 1 && materials.length === 1 && registered.phase === 5 && inPhase(registered)
        && Reflect.get(registered, 'enabled') !== false && Reflect.get(registered, 'placeholder') !== true
        && Reflect.get(registered, 'qualityEnabled') !== true && !!item && item.id === registered.id
        && material.type === 'material' && material.kind === 'enhance' && positive(material.stack)
        && item.type === material.type && item.kind === material.kind && Reflect.get(item, 'stack') === material.stack
        && item.phase === Reflect.get(material, 'phase') && inPhase(material) && inPhase(item)
        && item.enabled !== false && item.placeholder !== true && item.qualityEnabled !== true;
    } catch { return false; }
  }
  private valid(progress: Progress): boolean {
    try {
      if (!this.validRules() || progress.storageError !== undefined) return false;
      if (progress.enhance !== undefined && !isValidEnhanceProgress(progress.enhance)) return false;
      if (progress.forge !== undefined && !isValidForgeProgress(progress.forge)) return false;
      if (progress.enchant !== undefined && !isValidEnchantProgress(progress.enchant)) return false;
      if (progress.enhance?.formalSources?.some(row => progress.formalEnhanceInstanceStatus(row.instanceRef) !== 'registered')) return false;
      if (progress.salvage === undefined) return true;
      const bag = progress.salvage;
      if (!isValidSalvageProgress(bag) || bag.ownerSlot !== progress.getSaveSlot()) return false;
      return bag.destructions.every(result => {
        const craft = progress.forge?.crafts.find(row => row.craftResultRef === result.formalSource.craftResultRef);
        const historical = progress.enhance?.instances.find(row => row.instanceRef === result.instanceRef);
        return progress.forge?.ledgerId === result.formalSource.forgeLedgerId && !!craft
          && progress.forge.receipts.includes(craft.craftResultRef) && craft.resultItem.instanceRef === result.instanceRef
          && craft.resultItem.itemId === result.itemId && craft.resultItem.count === 1 && craft.resultGrade === result.grade
          && historical?.itemId === result.itemId && historical.type === result.type && historical.enhanceLevel === result.enhanceLevel
          && !progress.enhance?.formalSources?.some(row => row.instanceRef === result.instanceRef)
          && result.refineStones === enhance.salvage.refineStonesByGrade[result.grade];
      });
    } catch { return false; }
  }
  private snapshot(value: unknown): string {
    return snapshot(value);
  }
  private async transact(ownerSlot: SlotKey,
    apply: (draft: Progress, reject: (result: SalvageDenied) => undefined) => SalvageAllowed | undefined): Promise<SalvageGateResult> {
    if (this.#busy || SalvageGate.#slots.has(ownerSlot)) return denied('busy', '正在保存本档分解结果，请稍候。');
    this.#busy = true; SalvageGate.#slots.add(ownerSlot);
    let rejection: SalvageDenied | undefined;
    const reject = (result: SalvageDenied): undefined => { rejection = result; return undefined; };
    try {
      const expected = this.snapshot(this.progress), stored = await saveStore.readSlot(ownerSlot);
      if (!stored || this.snapshot(stored.data) !== expected) return denied('stale', '存档事实已更新，请重新读档。');
      const commit = () => this.progress.runSaveTransactionAsync(draft => {
        if (this.snapshot(draft) !== expected) return reject(denied('stale', '提交期间装备或库存已变化，请重新选择。'));
        if (!this.valid(draft)) return reject(denied('progress', '分解档案存在歧义，已阻止写入。'));
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject(denied('progress', '分解完整结果校验失败，保持原档。'));
        return result;
      }, expected);
      // 正式路径由 Progress 一次保存完整销毁/产出/收据；显式夹具载体只保留隔离回归用途。
      const result = this.fixture.atomicCarrier instanceof SalvageFixtureCarrier
        ? await this.fixture.atomicCarrier.run(ownerSlot, expected, commit) : await commit();
      return result ?? rejection ?? denied('save', '分解保存失败，保持原合法状态。');
    } catch { return denied('save', '分解保存失败，保持原合法状态。'); }
    finally { this.#busy = false; SalvageGate.#slots.delete(ownerSlot); }
  }
}
