import enhance from '@xt/balance/enhance.json';
import itemDefinitions from '@xt/balance/items.json';
import { ITEMS, inPhase } from './data';
import { Progress } from './Progress';
import { saveStore, type SlotKey } from './SaveStore';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import * as EnchantClosed from './EnchantClosed';
import { enhanceArray, enhanceFields, isEnhanceId, isEnhanceInstanceRef, isValidEnhanceInstances,
  isValidEnhanceProgress, type EnhanceFixtureInstance } from './EnhanceProgress';
import { isEnchantElement, isValidEnchantProgress, sameEnchantAttributes, type EnchantAttributes,
  type EnchantElement, type EnchantInstance, type EnchantProgress, type EnchantResult } from './EnchantProgress';

export interface EnchantRequest {
  enchantRequestId: string;
  instanceRef: string;
  /** null 表示首次；覆盖必须精确匹配当前元素，不能按过期选择扣料。 */
  fromElement: EnchantElement | null;
  element: EnchantElement;
}
export interface EnchantFixtureOptions {
  /** 仅测试显式授权；不默认注入，不与正式源互补或回退。 */
  fixtureInstances?: readonly EnhanceFixtureInstance[];
  ledgerId?: () => string;
  /** 故障哨兵只能拒绝整笔提交；不能修改 draft 或完整结果。 */
  canCommitResult?: (draft: Progress, result: EnchantResult) => boolean;
}
export interface EnchantAllowed {
  allowed: true;
  result?: EnchantResult;
  progress?: EnchantProgress;
  instance?: EnchantInstance | EnhanceFixtureInstance;
  attributes?: EnchantAttributes;
  replayed?: boolean;
}
export interface EnchantDenied { allowed: false; tipKey: string; text: string }
export type EnchantGateResult = EnchantAllowed | EnchantDenied;
type Selection = { allowed: true; instance: EnhanceFixtureInstance; ownerSlot: SlotKey };
const copy = <T>(value: T): T => structuredClone(value);
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value > 0 && value <= 1;
const denied = (reason: string, text: string): EnchantDenied => ({ allowed: false, tipKey: `enchant.fixture.${reason}`, text });
const ownData = (progress: Progress): string => JSON.stringify(Object.fromEntries(Object.entries(progress)
  .filter(([, value]) => typeof value !== 'function')));

/** 本窗只提供独立开态夹具 API；正式 flag 仍关态，无 NPC 或 GameScene 消费者。 */
export class EnchantGate {
  static #formalSlots = new Set<SlotKey>();
  #busy = false;
  readonly #fixtureInstancesProvided: boolean;
  constructor(private readonly progress: Progress, private readonly fixture: EnchantFixtureOptions = {}) {
    this.#fixtureInstancesProvided = Object.prototype.hasOwnProperty.call(fixture, 'fixtureInstances');
  }

  feature(): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.featureClosed();
    return this.validRules() ? { allowed: true } : denied('rules', '附灵配置或正式材料映射不完整。');
  }
  entrance(): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseEntrance();
    return this.validRules() ? { allowed: true } : denied('rules', '附灵配置或正式材料映射不完整。');
  }
  /** 预览不创建袋、请求或预留库存；只按当前选择读取确定效果。 */
  enchant(request?: EnchantRequest): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseEnchant();
    try {
      if (!this.valid(this.progress)) return denied('progress', '附灵档案存在歧义，已阻止写入。');
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!this.ownsCosts(this.progress)) return denied('resources', '附灵所需灵石或妖兽内丹不足。');
      return { allowed: true, instance: copy(selected.instance), attributes: this.attributes(request!.element, this.progress.rootElement as EnchantElement) };
    } catch { return denied('request', '附灵选择无效。'); }
  }
  async submit(request: EnchantRequest): Promise<EnchantGateResult> {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseSubmit();
    try {
      if (this.#busy) return denied('busy', '正在保存附灵结果，请稍候。');
      if (!this.valid(this.progress)) return denied('progress', '附灵档案存在歧义，已阻止写入。');
      if (!this.validRequest(request)) return denied('request', '附灵请求无效。');
      const previous = this.progress.enchant?.enchantments.find(row => row.enchantRequestId === request.enchantRequestId);
      // 已成功请求只读回放，不能要求补料或把冲突意图冒认为旧结果。
      if (previous) return this.replay(previous, request);
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!this.ownsCosts(this.progress)) return denied('resources', '附灵所需灵石或妖兽内丹不足。');
      const intent = copy(request), authorized = this.#fixtureInstancesProvided ? copy(this.fixture.fixtureInstances) : undefined;
      return await this.transact(selected.ownerSlot, (draft, reject) => {
        if (!isEnchantOpenForFixture()) return reject(EnchantClosed.refuseSubmit());
        const committed = draft.enchant?.enchantments.find(row => row.enchantRequestId === intent.enchantRequestId);
        if (committed) return reject(denied('duplicate', '该请求已经完成，请只读查看原结果。'));
        const selection = this.selection(draft, intent, authorized);
        if (!selection.allowed) return reject(selection);
        if (!this.ownsCosts(draft)) return reject(denied('resources', '附灵所需灵石或妖兽内丹不足。'));
        const ledgerId = draft.enchant?.ledgerId ?? (this.fixture.ledgerId ? this.fixture.ledgerId() : `enchant_${crypto.randomUUID()}`);
        if (!isEnhanceId(ledgerId)) return reject(denied('identity', '附灵账本身份无效。'));
        const rules = enhance.enchant;
        const result: EnchantResult = {
          state: 'committed', enchantRequestId: intent.enchantRequestId,
          enchantResultRef: `${ledgerId}:enchant:${intent.enchantRequestId}`,
          instanceRef: selection.instance.instanceRef, itemId: selection.instance.itemId, type: 'weapon',
          fromElement: intent.fromElement, element: intent.element, rootElement: draft.rootElement as EnchantElement,
          stones: rules.cost.stones, materials: rules.cost.materials.map(row => ({ itemId: row.item as 'beast_core', count: row.count })),
          attributes: this.attributes(intent.element, draft.rootElement as EnchantElement), success: true,
        };
        const bag: EnchantProgress = draft.enchant ?? {
          version: 1, ledgerId, ownerSlot: selection.ownerSlot, instances: [], enchantments: [], receipts: [],
        };
        const current: EnchantInstance = { instanceRef: result.instanceRef, itemId: result.itemId, type: 'weapon',
          element: result.element, attributes: copy(result.attributes) };
        const index = bag.instances.findIndex(row => row.instanceRef === intent.instanceRef);
        if (index < 0) bag.instances.push(current); else bag.instances[index] = current;
        const stones = draft.stones, cores = draft.permanentCount('beast_core');
        const unchanged = { forge: copy(draft.forge), enhance: copy(draft.enhance), equip: copy(draft.equip),
          rootElement: draft.rootElement, forgingLevel: draft.forgingLevel, forgingExp: draft.forgingExp };
        draft.stones -= result.stones;
        draft.removeItem('beast_core', result.materials[0].count);
        bag.enchantments.push(result); bag.receipts.push(result.enchantResultRef); draft.enchant = bag;
        const settled = ownData(draft);
        if ((this.fixture.canCommitResult && this.fixture.canCommitResult(draft, copy(result)) !== true) || settled !== ownData(draft))
          return reject(denied('commit', '附灵结果承载失败，保持原库存与元素。'));
        if (draft.stones !== stones - result.stones || draft.permanentCount('beast_core') !== cores - result.materials[0].count
          || draft.count('beast_core') !== draft.permanentCount('beast_core')
          || JSON.stringify(unchanged) !== JSON.stringify({ forge: draft.forge, enhance: draft.enhance, equip: draft.equip,
            rootElement: draft.rootElement, forgingLevel: draft.forgingLevel, forgingExp: draft.forgingExp })
          || !this.ownsInstances(draft, this.#fixtureInstancesProvided ? authorized! : draft.formalEnhanceInstances()))
          return reject(denied('commit', '附灵结果承载失败，保持原库存与元素。'));
        return { allowed: true, result: copy(result), progress: copy(bag), replayed: false };
      });
    } catch { return denied('save', '附灵未提交，保持原库存与元素。'); }
  }
  result(enchantRequestId?: string): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseResult();
    if (!this.valid(this.progress)) return denied('progress', '附灵档案存在歧义，已阻止写入。');
    const result = this.progress.enchant?.enchantments.find(row => row.enchantRequestId === enchantRequestId);
    return result ? { allowed: true, result: copy(result), replayed: true } : denied('result', '没有完整提交的附灵结果。');
  }
  element(instanceRef?: string): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseElement();
    if (!this.valid(this.progress)) return denied('progress', '附灵档案存在歧义，已阻止写入。');
    const instance = this.progress.enchant?.instances.find(row => row.instanceRef === instanceRef);
    return instance ? { allowed: true, instance: copy(instance), attributes: copy(instance.attributes) }
      : denied('result', '没有完整提交的五行附着。');
  }
  loadRefresh(): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseLoadRefresh();
    if (!this.valid(this.progress)) return denied('progress', '附灵档案存在歧义，已阻止写入。');
    return this.progress.enchant === undefined ? { allowed: true } : { allowed: true, progress: copy(this.progress.enchant), replayed: true };
  }
  laterService(): EnchantGateResult {
    if (!isEnchantOpenForFixture()) return EnchantClosed.refuseLaterService();
    return EnchantClosed.refuseLaterService();
  }

  private validRequest(value: unknown): value is EnchantRequest {
    return enhanceFields(value, ['enchantRequestId', 'instanceRef', 'fromElement', 'element'])
      && isEnhanceId(value.enchantRequestId) && isEnhanceInstanceRef(value.instanceRef)
      && (value.fromElement === null || isEnchantElement(value.fromElement)) && isEnchantElement(value.element);
  }
  private replay(result: EnchantResult, request: EnchantRequest): EnchantGateResult {
    return result.instanceRef === request.instanceRef && result.fromElement === request.fromElement && result.element === request.element
      ? { allowed: true, result: copy(result), replayed: true }
      : denied('conflict', '同一附灵请求的载荷冲突，不能冒认原结果。');
  }
  private selection(progress: Progress, request: EnchantRequest | undefined,
    authorized: readonly EnhanceFixtureInstance[] | undefined = this.#fixtureInstancesProvided
      ? this.fixture.fixtureInstances : progress.formalEnhanceInstances()): Selection | EnchantDenied {
    if (!this.validRequest(request)) return denied('request', '附灵请求无效。');
    if (!this.#fixtureInstancesProvided && progress.formalEnhanceInstanceStatus(request.instanceRef) === 'foreign')
      return denied('foreign', '该武器不属于当前存档。');
    if (!isValidEnhanceInstances(authorized)) return denied('no_instance', '没有本档正式登记的武器实例。');
    const instance = authorized.find(row => row.instanceRef === request.instanceRef);
    if (!instance || request.instanceRef === instance.itemId) return denied('no_instance', '没有本档正式登记的武器实例。');
    if (this.#fixtureInstancesProvided && progress.enhance?.formalSources?.some(row => row.instanceRef === request.instanceRef))
      return denied('no_instance', '显式夹具不能冒认正式实例来源。');
    if (!this.#fixtureInstancesProvided && progress.formalEnhanceInstanceStatus(instance.instanceRef) !== 'registered')
      return denied('no_instance', '没有本档正式登记的武器实例。');
    if (!this.supportedWeapon(instance)) return denied('bad_type', '附灵仅接受合法正式武器。');
    if (!count(instance.enhanceLevel) || instance.enhanceLevel > enhance.maxLevel || !this.ownsInstances(progress, authorized))
      return denied('foreign', '武器持有关系或当前状态无效。');
    const source = progress.enhance?.formalSources?.find(row => row.instanceRef === instance.instanceRef);
    const ownerSlot = this.#fixtureInstancesProvided ? Progress.getActiveSlot() : source?.ownerSlot;
    if (ownerSlot === undefined || progress.enchant && progress.enchant.ownerSlot !== ownerSlot)
      return denied('foreign', '附灵结果不属于当前存档。');
    if (!isEnchantElement(progress.rootElement)) return denied('root', '无法核实合法的五行灵根关系。');
    const current = progress.enchant?.instances.find(row => row.instanceRef === instance.instanceRef);
    if (current?.element === request.element) return denied('duplicate', '该武器已附同元素。');
    if ((current?.element ?? null) !== request.fromElement) return denied('stale', '武器原元素已变化，请重新选择。');
    if (current && current.itemId !== instance.itemId) return denied('foreign', '武器实例身份不一致。');
    return { allowed: true, instance, ownerSlot };
  }
  private supportedWeapon(instance: EnhanceFixtureInstance): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
    return instance.type === 'weapon' && !!item && item.type === 'equip' && item.slot === 'weapon' && inPhase(item)
      && item.enabled !== false && item.placeholder !== true && item.qualityEnabled !== true;
  }
  private ownsInstances(progress: Progress, instances: readonly EnhanceFixtureInstance[]): boolean {
    const totals = new Map<string, number>();
    for (const row of instances) totals.set(row.itemId, (totals.get(row.itemId) ?? 0) + 1);
    return [...totals].every(([itemId, needed]) => count(progress.permanentCount(itemId))
      && progress.count(itemId) === progress.permanentCount(itemId)
      && !Object.prototype.hasOwnProperty.call(progress.pillQualities, itemId)
      && progress.permanentCount(itemId) + (this.#fixtureInstancesProvided ? 0 : Object.entries(progress.equip)
        .filter(([slot, id]) => id === itemId && ITEMS[itemId]?.slot === slot).length) >= needed);
  }
  private ownsCosts(progress: Progress): boolean {
    const needed = enhance.enchant.cost.materials[0].count;
    return count(progress.stones) && progress.stones >= enhance.enchant.cost.stones
      && count(progress.permanentCount('beast_core')) && progress.permanentCount('beast_core') >= needed
      && progress.count('beast_core') === progress.permanentCount('beast_core')
      && !Object.prototype.hasOwnProperty.call(progress.pillQualities, 'beast_core');
  }
  private validRules(): boolean {
    try {
      const rules: unknown = enhance.enchant;
      if (!enhanceFields(rules, ['elementDamage', 'sameRootBonus', 'cost']) || !ratio(rules.elementDamage)
        || !ratio(rules.sameRootBonus) || !enhanceFields(rules.cost, ['stones', 'materials']) || !positive(rules.cost.stones)
        || !enhanceArray(rules.cost.materials) || rules.cost.materials.length !== 1
        || !enhanceFields(rules.cost.materials[0], ['item', 'count']) || rules.cost.materials[0].item !== 'beast_core'
        || !positive(rules.cost.materials[0].count)) return false;
      const definitions = itemDefinitions.filter(row => row.id === 'beast_core');
      const registered = definitions[0], item = Object.prototype.hasOwnProperty.call(ITEMS, 'beast_core') ? ITEMS.beast_core : undefined;
      return definitions.length === 1 && registered.phase === 5 && inPhase(registered)
        && Reflect.get(registered, 'enabled') !== false && Reflect.get(registered, 'placeholder') !== true
        && Reflect.get(registered, 'qualityEnabled') !== true
        && !!item && item.id === registered.id && item.type === 'material' && item.kind === 'drop'
        && item.phase === registered.phase && inPhase(item) && item.enabled !== false && item.placeholder !== true && item.qualityEnabled !== true;
    } catch { return false; }
  }
  private attributes(element: EnchantElement, rootElement: EnchantElement): EnchantAttributes {
    return { elementDamage: enhance.enchant.elementDamage, sameRootBonus: element === rootElement ? enhance.enchant.sameRootBonus : 0 };
  }
  private valid(progress: Progress): boolean {
    try {
      if (!this.validRules() || progress.storageError !== undefined) return false;
      if (progress.enhance !== undefined && !isValidEnhanceProgress(progress.enhance)) return false;
      const bag = progress.enchant;
      if (bag === undefined) return true;
      if (!isValidEnchantProgress(bag)) return false;
      if (!this.#fixtureInstancesProvided) {
        if (progress.enhance?.formalSources?.some(source => source.ownerSlot !== bag.ownerSlot
          || progress.formalEnhanceInstanceStatus(source.instanceRef) !== 'registered')) return false;
        // 完整旧袋也不是跨档读取许可：每个结果必须仍能回查本档原正式来源。
        if (bag.instances.some(instance => {
          const source = progress.enhance?.formalSources?.find(row => row.instanceRef === instance.instanceRef);
          const registered = progress.enhance?.instances.find(row => row.instanceRef === instance.instanceRef);
          return !source || source.ownerSlot !== bag.ownerSlot || progress.formalEnhanceInstanceStatus(instance.instanceRef) !== 'registered'
            || !registered || registered.itemId !== instance.itemId || registered.type !== 'weapon';
        })) return false;
      }
      return bag.enchantments.every(result => result.stones === enhance.enchant.cost.stones
        && result.materials[0].count === enhance.enchant.cost.materials[0].count
        && sameEnchantAttributes(result.attributes, this.attributes(result.element, result.rootElement)));
    } catch { return false; }
  }
  /** 业务事实整体比对；不能让旧对象覆盖另一提交的资源、来源、强化或附灵结果。 */
  private snapshot(progress: Progress | Record<string, unknown>): string {
    const data = progress instanceof Progress ? progress.exportSave() : progress;
    return JSON.stringify(data, (_key, value: unknown) => value && typeof value === 'object' && !Array.isArray(value)
      ? Object.fromEntries(Object.entries(value).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0)) : value);
  }
  private async transact(ownerSlot: SlotKey,
    apply: (draft: Progress, reject: (rejection: EnchantDenied) => undefined) => EnchantAllowed | undefined): Promise<EnchantGateResult> {
    if (this.#busy || !this.#fixtureInstancesProvided && EnchantGate.#formalSlots.has(ownerSlot))
      return denied('busy', '正在保存本档附灵结果，请稍候。');
    this.#busy = true;
    if (!this.#fixtureInstancesProvided) EnchantGate.#formalSlots.add(ownerSlot);
    let rejection: EnchantDenied | undefined;
    const reject = (result: EnchantDenied): undefined => { rejection = result; return undefined; };
    try {
      const expected = this.snapshot(this.progress);
      if (!this.#fixtureInstancesProvided) {
        const saved = await saveStore.readSlot(ownerSlot);
        if (!saved || this.snapshot(saved.data) !== expected) return denied('stale', '存档事实已更新，请重新读档。');
      }
      const result = await this.progress.runSaveTransactionAsync(draft => {
        if (this.snapshot(draft) !== expected) return reject(denied('stale', '提交期间存档事实已变化，请重新选择。'));
        if (!this.valid(draft)) return reject(denied('progress', '附灵档案存在歧义，已阻止写入。'));
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject(denied('progress', '附灵结果校验失败，保持原档。'));
        return result;
      }, this.#fixtureInstancesProvided ? undefined : expected);
      return result ?? rejection ?? denied('save', '附灵保存失败，保持原库存与元素。');
    } catch { return denied('save', '附灵保存失败，保持原库存与元素。'); }
    finally {
      if (!this.#fixtureInstancesProvided) EnchantGate.#formalSlots.delete(ownerSlot);
      this.#busy = false;
    }
  }
}
