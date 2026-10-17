import enhance from '@xt/balance/enhance.json';
import strings from '@xt/balance/strings_zh.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
import { saveStore } from './SaveStore';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import * as EnhanceClosed from './EnhanceClosed';
import { enhanceArray, enhanceFields, isEnhanceId, isEnhanceInstanceRef, isValidEnhanceInstances, isValidEnhanceProgress,
  type EnhanceAttributes, type EnhanceEquipmentType, type EnhanceFixtureInstance, type EnhanceProgress, type EnhanceResult } from './EnhanceProgress';

export interface EnhanceRequest {
  enhanceRequestId: string;
  instanceRef: string;
  fromLevel: number;
  to: number;
  useProtectCharm: boolean;
}
export interface EnhanceFixtureOptions {
  /** 只授权测试明确列出的当前档实例；无授权不得从物品数量制造实例。 */
  fixtureInstances?: readonly EnhanceFixtureInstance[];
  random?: () => number;
  ledgerId?: () => string;
  /** 夹具哨兵只可拒绝整次结果；不提供概率、消耗或属性回退。 */
  canCommitResult?: (draft: Progress, result: EnhanceResult) => boolean;
}
export interface EnhanceLevelRow { to: number; rate: number; stones: number; refineStones: number; dropOnFail: boolean; }
export interface EnhanceAllowed {
  allowed: true;
  result?: EnhanceResult;
  progress?: EnhanceProgress;
  instance?: EnhanceFixtureInstance;
  attributes?: EnhanceAttributes;
  row?: EnhanceLevelRow;
  replayed?: boolean;
}
export type EnhanceFormalTipKey = 'enhance.formal.no_instance' | 'enhance.formal.foreign' | 'enhance.formal.bad_type'
  | 'enhance.formal.protect' | 'enhance.formal.resources' | 'enhance.formal.max_level'
  | 'enhance.formal.duplicate' | 'enhance.formal.load_dedupe';
export interface EnhanceDenied {
  allowed: false;
  tipKey: string;
  text: string;
  /** 仅携带已完整提交结果的只读副本；拒绝本次请求不代表再次结算。 */
  result?: EnhanceResult;
  progress?: EnhanceProgress;
  replayed?: true;
}
export type EnhanceGateResult = EnhanceAllowed | EnhanceDenied;
type EnhanceSelection = { allowed: true; instance: EnhanceFixtureInstance; row: EnhanceLevelRow };
const copy = <T>(value: T): T => structuredClone(value);
const denied = (reason: string, text: string): EnhanceDenied => ({ allowed: false, tipKey: `enhance.fixture.${reason}`, text });
const formalDenied = (tipKey: EnhanceFormalTipKey): EnhanceDenied => ({ allowed: false, tipKey, text: strings[tipKey] });
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameAttributes = (a: EnhanceAttributes, b: EnhanceAttributes): boolean =>
  a.atkRatioOfBase === b.atkRatioOfBase && a.defRatioOfBase === b.defRatioOfBase
  && a.hpRatioOfBase === b.hpRatioOfBase && a.allRatio === b.allRatio;

/** 入口只读开放；默认结算只认本档正式登记，测试夹具必须显式注入。 */
export class EnhanceGate {
  static #formalSlots = new Set<number>();
  #busy = false;
  readonly #fixtureInstancesProvided: boolean;
  constructor(private readonly progress: Progress, private readonly fixture: EnhanceFixtureOptions = {}) {
    this.#fixtureInstancesProvided = Object.prototype.hasOwnProperty.call(fixture, 'fixtureInstances');
  }

  feature(): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.featureClosed();
    return this.validRules() ? { allowed: true } : denied('rules', '强化配置依赖不完整。');
  }
  entrance(): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseEntrance();
    return this.validRules() ? { allowed: true } : denied('rules', '强化配置依赖不完整。');
  }
  /** 只读检查当前档实例和下一档；不抽样、不占用库存、不创建袋或业务请求。 */
  enhance(request?: EnhanceRequest): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseEnhance();
    try {
      if (this.requestsProtect(request)) return formalDenied('enhance.formal.protect');
      const boundary = this.formalSelectionBoundary(this.progress, request);
      if (boundary) return boundary;
      if (!this.valid(this.progress)) return this.hasFixtureAuthorization()
        ? denied('progress', '强化档案存在歧义，已阻止写入。') : formalDenied('enhance.formal.no_instance');
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!this.ownsCosts(this.progress, selected.row)) return formalDenied('enhance.formal.resources');
      return { allowed: true, instance: copy(selected.instance), attributes: this.attributes(selected.instance.type, selected.instance.enhanceLevel), row: copy(selected.row) };
    } catch { return denied('request', '强化选择无效。'); }
  }
  async submit(request: EnhanceRequest): Promise<EnhanceGateResult> {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseSubmit();
    try {
      if (this.requestsProtect(request)) return formalDenied('enhance.formal.protect');
      if (this.#busy) return denied('busy', '正在保存强化结果，请稍候。');
      const boundary = this.formalSelectionBoundary(this.progress, request);
      if (!this.valid(this.progress)) return boundary ?? (this.hasFixtureAuthorization()
        ? denied('progress', '强化档案存在歧义，已阻止写入。') : formalDenied('enhance.formal.no_instance'));
      if (!this.validRequest(request)) return formalDenied('enhance.formal.no_instance');
      const old = this.progress.enhance?.enhancements.find(row => row.enhanceRequestId === request.enhanceRequestId);
      // 重放只认已提交身份，不依赖新装备授权，不抽样或开启事务。
      if (old) return this.replay(old, request);
      if (boundary) return boundary;
      const selected = this.selection(this.progress, request);
      if (!selected.allowed) return selected;
      if (!this.ownsCosts(this.progress, selected.row)) return formalDenied('enhance.formal.resources');
      // 第一次 await 之前固定请求和授权，外部对象变化不能改变本次含义。
      const intent = copy(request), authorized = this.usesFixtureInstances() ? copy(this.fixture.fixtureInstances) : undefined;
      return await this.transact((draft, reject) => {
        const committed = draft.enhance?.enhancements.find(row => row.enhanceRequestId === intent.enhanceRequestId);
        if (committed) return reject(this.replay(committed, intent));
        const selection = this.selection(draft, intent, authorized);
        if (!selection.allowed) return reject(selection);
        if (!this.ownsCosts(draft, selection.row)) return reject(formalDenied('enhance.formal.resources'));
        const ledgerId = draft.enhance?.ledgerId ?? (this.fixture.ledgerId ? this.fixture.ledgerId() : `enhance_${crypto.randomUUID()}`);
        if (!isEnhanceId(ledgerId)) return reject(denied('identity', '强化夹具账本身份无效。'));
        const random = this.fixture.random ? this.fixture.random() : Math.random();
        if (!ratio(random) || random >= 1) return reject(denied('random', '强化抽样无效，保持原状态。'));
        const success = random < selection.row.rate;
        const finalLevel = success ? intent.to : intent.fromLevel - (selection.row.dropOnFail ? 1 : 0);
        const result: EnhanceResult = {
          state: 'committed', enhanceRequestId: intent.enhanceRequestId, enhanceResultRef: `${ledgerId}:enhance:${intent.enhanceRequestId}`,
          instanceRef: selection.instance.instanceRef, itemId: selection.instance.itemId, type: selection.instance.type,
          fromLevel: intent.fromLevel, ...copy(selection.row), useProtectCharm: false, success, finalLevel,
          attributes: this.attributes(selection.instance.type, finalLevel),
        };
        const bag: EnhanceProgress = draft.enhance ?? { version: 1, ledgerId, instances: copy([...authorized!]), enhancements: [], receipts: [] };
        const instance = bag.instances.find(row => row.instanceRef === intent.instanceRef)!;
        const stones = draft.stones, refineStones = draft.count('refine_stone');
        const equipmentCounts = bag.instances.map(row => [row.itemId, draft.count(row.itemId)] as const);
        draft.stones -= result.stones;
        draft.removeItem('refine_stone', result.refineStones);
        instance.enhanceLevel = finalLevel;
        bag.enhancements.push(result); bag.receipts.push(result.enhanceResultRef); draft.enhance = bag;
        const settled = JSON.stringify(Object.fromEntries(Object.entries(draft).filter(([, value]) => typeof value !== 'function')));
        if (this.fixture.canCommitResult?.(draft, copy(result)) === false
          || settled !== JSON.stringify(Object.fromEntries(Object.entries(draft).filter(([, value]) => typeof value !== 'function'))))
          return reject(denied('commit', '强化结果承载失败，保持原库存与等级。'));
        if (draft.stones !== stones - result.stones || draft.count('refine_stone') !== refineStones - result.refineStones
          || instance.enhanceLevel !== finalLevel || equipmentCounts.some(([id, before]) => draft.count(id) !== before)
          || !this.ownsInstances(draft, this.usesFixtureInstances() ? bag.instances : draft.formalEnhanceInstances()))
          return reject(denied('commit', '强化结果承载失败，保持原库存与等级。'));
        return { allowed: true, result: copy(result), progress: copy(bag), replayed: false };
      });
    } catch { return denied('save', '强化未提交，保持原库存与等级。'); }
  }
  level(enhanceRequestId?: string): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseLevel();
    return this.readResult(enhanceRequestId);
  }
  consume(enhanceRequestId?: string): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseConsume();
    return this.readResult(enhanceRequestId);
  }
  loadRefresh(): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseLoadRefresh();
    if (!this.valid(this.progress)) return this.hasFixtureAuthorization()
      ? denied('progress', '强化档案存在歧义，已阻止写入。') : formalDenied('enhance.formal.no_instance');
    if (this.progress.enhance?.enhancements.length) return {
      ...formalDenied('enhance.formal.load_dedupe'), progress: copy(this.progress.enhance), replayed: true,
    };
    return this.progress.enhance === undefined ? { allowed: true } : { allowed: true, progress: copy(this.progress.enhance) };
  }
  laterService(): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseLaterService();
    return EnhanceClosed.refuseLaterService();
  }

  private readResult(requestId: string | undefined): EnhanceGateResult {
    if (!this.valid(this.progress)) return this.hasFixtureAuthorization()
      ? denied('progress', '强化档案存在歧义，已阻止写入。') : formalDenied('enhance.formal.no_instance');
    const result = this.progress.enhance?.enhancements.find(row => row.enhanceRequestId === requestId);
    if (result) return { allowed: true, result: copy(result), replayed: true };
    return this.hasFixtureAuthorization()
      ? denied('result', '没有完整提交的强化结果。') : formalDenied('enhance.formal.no_instance');
  }
  private replay(result: EnhanceResult, request: EnhanceRequest): EnhanceDenied {
    return result.instanceRef === request.instanceRef && result.fromLevel === request.fromLevel && result.to === request.to
      ? { ...formalDenied('enhance.formal.duplicate'), result: copy(result), replayed: true }
      : formalDenied('enhance.formal.duplicate');
  }
  private validRequest(value: unknown): value is EnhanceRequest {
    return enhanceFields(value, ['enhanceRequestId', 'instanceRef', 'fromLevel', 'to', 'useProtectCharm'])
      && isEnhanceId(value.enhanceRequestId) && isEnhanceInstanceRef(value.instanceRef)
      && typeof value.fromLevel === 'number' && typeof value.to === 'number' && typeof value.useProtectCharm === 'boolean';
  }
  private requestsProtect(value: unknown): boolean {
    return !!value && typeof value === 'object' && Object.getOwnPropertyDescriptor(value, 'useProtectCharm')?.value === true;
  }
  private usesFixtureInstances(): boolean {
    return this.#fixtureInstancesProvided;
  }
  private hasFixtureAuthorization(): boolean {
    const authorized = this.usesFixtureInstances() ? this.fixture.fixtureInstances : this.progress.formalEnhanceInstances();
    return enhanceArray(authorized) && authorized.length > 0;
  }
  /** 只读分型；来源证明仍须由本档登记 API 核实，不能由库存或槽位补造。 */
  private formalSelectionBoundary(progress: Progress, request: EnhanceRequest | undefined): EnhanceDenied | undefined {
    if (this.usesFixtureInstances() || !this.validRequest(request)) return;
    const status = progress.formalEnhanceInstanceStatus(request.instanceRef);
    if (status === 'foreign') return formalDenied('enhance.formal.foreign');
    if (status !== 'registered') return;
    const instance = progress.enhance?.instances.find(row => row.instanceRef === request.instanceRef);
    if (instance && ((instance.type !== 'weapon' && instance.type !== 'armor') || !this.supportedInstance(instance)))
      return formalDenied('enhance.formal.bad_type');
    if (instance && (!count(instance.enhanceLevel) || instance.enhanceLevel > enhance.maxLevel))
      return formalDenied('enhance.formal.max_level');
  }
  private selection(progress: Progress, request: EnhanceRequest | undefined,
    authorized: readonly EnhanceFixtureInstance[] | undefined = this.usesFixtureInstances()
      ? this.fixture.fixtureInstances : progress.formalEnhanceInstances()): EnhanceSelection | EnhanceDenied {
    const boundary = this.formalSelectionBoundary(progress, request);
    if (boundary) return boundary;
    if (!this.validRequest(request) || !enhanceArray(authorized) || !authorized.length)
      return formalDenied('enhance.formal.no_instance');
    if (request.useProtectCharm) return formalDenied('enhance.formal.protect');
    // 显式夹具与正式源各自封闭，不能互补或缺源回退。
    for (const row of authorized) {
      if (!enhanceFields(row, ['instanceRef', 'itemId', 'type', 'enhanceLevel'])
        || !isEnhanceInstanceRef(row.instanceRef) || !isEnhanceId(row.itemId))
        return formalDenied('enhance.formal.no_instance');
      if ((row.type !== 'weapon' && row.type !== 'armor') || !this.supportedInstance(row as unknown as EnhanceFixtureInstance))
        return formalDenied('enhance.formal.bad_type');
      if (!count(row.enhanceLevel) || row.enhanceLevel > enhance.maxLevel) return formalDenied('enhance.formal.max_level');
    }
    if (!isValidEnhanceInstances(authorized)) return formalDenied('enhance.formal.no_instance');
    const permission = authorized.find(row => row.instanceRef === request.instanceRef);
    if (!permission || request.instanceRef === permission.itemId) return formalDenied('enhance.formal.no_instance');
    if (this.usesFixtureInstances() && progress.enhance?.formalSources?.some(source => source.instanceRef === request.instanceRef))
      return formalDenied('enhance.formal.no_instance');
    if (!count(request.fromLevel) || !positive(request.to) || request.to !== request.fromLevel + 1 || request.to > enhance.maxLevel)
      return formalDenied('enhance.formal.max_level');
    const instances = this.usesFixtureInstances() ? progress.enhance?.instances ?? authorized : authorized;
    const instance = instances.find(row => row.instanceRef === request.instanceRef);
    if (!instance || instance.itemId !== permission.itemId || instance.type !== permission.type)
      return formalDenied('enhance.formal.foreign');
    if (!instances.every(row => this.supportedInstance(row))) return formalDenied('enhance.formal.bad_type');
    if (instance.enhanceLevel !== request.fromLevel || instance.enhanceLevel >= enhance.maxLevel
      || !instances.every(row => count(row.enhanceLevel) && row.enhanceLevel <= enhance.maxLevel))
      return formalDenied('enhance.formal.max_level');
    if (!this.ownsInstances(progress, instances)) return formalDenied('enhance.formal.foreign');
    const matches = enhance.levels.filter(row => row.to === request.to);
    return matches.length === 1 ? { allowed: true, instance, row: matches[0] } : denied('rules', '强化配置依赖不完整。');
  }
  private supportedInstance(instance: EnhanceFixtureInstance): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
    return !!item && item.type === 'equip' && inPhase(item) && item.enabled !== false && item.placeholder !== true
      && item.qualityEnabled !== true && (instance.type === 'weapon' ? item.slot === 'weapon' : item.slot === 'robe' || item.slot === 'shoes');
  }
  private ownsInstances(progress: Progress, instances: readonly EnhanceFixtureInstance[]): boolean {
    const counts = new Map<string, number>();
    for (const row of instances) counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + 1);
    return [...counts].every(([itemId, owned]) => count(progress.permanentCount(itemId))
      && progress.permanentCount(itemId) + (this.usesFixtureInstances() ? 0 : Object.entries(progress.equip)
        .filter(([slot, id]) => id === itemId && ITEMS[itemId]?.slot === slot).length) >= owned
      && progress.count(itemId) === progress.permanentCount(itemId) && !Object.prototype.hasOwnProperty.call(progress.pillQualities, itemId));
  }
  private ownsCosts(progress: Progress, row: EnhanceLevelRow): boolean {
    const item = ITEMS.refine_stone;
    return count(progress.stones) && progress.stones >= row.stones && !!item && inPhase(item)
      && item.enabled !== false && item.placeholder !== true && item.qualityEnabled !== true
      && count(progress.permanentCount('refine_stone')) && progress.permanentCount('refine_stone') >= row.refineStones
      && progress.count('refine_stone') === progress.permanentCount('refine_stone')
      && !Object.prototype.hasOwnProperty.call(progress.pillQualities, 'refine_stone');
  }
  private validRules(): boolean {
    try {
      if (!positive(enhance.maxLevel) || !enhanceArray(enhance.levels) || enhance.levels.length !== enhance.maxLevel) return false;
      const targets = new Set<number>();
      for (const row of enhance.levels) {
        if (!enhanceFields(row, ['to', 'rate', 'stones', 'refineStones', 'dropOnFail']) || !positive(row.to)
          || row.to > enhance.maxLevel || targets.has(row.to) || !ratio(row.rate) || row.rate > 1
          || !positive(row.stones) || !positive(row.refineStones) || typeof row.dropOnFail !== 'boolean') return false;
        targets.add(row.to);
      }
      if (!enhanceFields(enhance.statPerLevel, ['weapon', 'armor'])
        || !enhanceFields(enhance.statPerLevel.weapon, ['atkRatioOfBase'])
        || !enhanceFields(enhance.statPerLevel.armor, ['defRatioOfBase', 'hpRatioOfBase'])
        || !ratio(enhance.statPerLevel.weapon.atkRatioOfBase) || !ratio(enhance.statPerLevel.armor.defRatioOfBase)
        || !ratio(enhance.statPerLevel.armor.hpRatioOfBase)) return false;
      const milestones: unknown = enhance.milestoneBonus;
      if (!milestones || typeof milestones !== 'object' || Array.isArray(milestones)
        || ![Object.prototype, null].includes(Object.getPrototypeOf(milestones))) return false;
      return Reflect.ownKeys(milestones).length > 0 && Reflect.ownKeys(milestones).every(key => {
        if (typeof key !== 'string' || !/^[1-9]\d*$/.test(key) || !positive(Number(key)) || Number(key) > enhance.maxLevel) return false;
        const row: unknown = Object.getOwnPropertyDescriptor(milestones, key)?.value;
        return enhanceFields(row, ['allRatio']) && ratio(row.allRatio);
      });
    } catch { return false; }
  }
  private attributes(type: EnhanceEquipmentType, level: number): EnhanceAttributes {
    return {
      atkRatioOfBase: type === 'weapon' ? enhance.statPerLevel.weapon.atkRatioOfBase * level : 0,
      defRatioOfBase: type === 'armor' ? enhance.statPerLevel.armor.defRatioOfBase * level : 0,
      hpRatioOfBase: type === 'armor' ? enhance.statPerLevel.armor.hpRatioOfBase * level : 0,
      allRatio: Object.entries(enhance.milestoneBonus).filter(([milestone]) => Number(milestone) <= level)
        .reduce((sum, [, bonus]) => sum + bonus.allRatio, 0),
    };
  }
  private valid(progress: Progress): boolean {
    if (!this.validRules()) return false;
    const bag = progress.enhance;
    if (bag === undefined) return true;
    if (!isValidEnhanceProgress(bag) || bag.instances.some(row => row.enhanceLevel > enhance.maxLevel)) return false;
    if (bag.formalSources?.some(source => progress.formalEnhanceInstanceStatus(source.instanceRef) !== 'registered')) return false;
    return bag.enhancements.every(result => {
      const row = enhance.levels.find(other => other.to === result.to);
      return !!row && result.rate === row.rate && result.stones === row.stones && result.refineStones === row.refineStones
        && result.dropOnFail === row.dropOnFail && result.finalLevel <= enhance.maxLevel
        && sameAttributes(result.attributes, this.attributes(result.type, result.finalLevel));
    });
  }
  private async transact(apply: (draft: Progress, reject: (rejection: EnhanceDenied) => undefined) => EnhanceAllowed | undefined): Promise<EnhanceGateResult> {
    if (this.#busy) return denied('busy', '正在保存强化结果，请稍候。');
    const slot = this.usesFixtureInstances() ? undefined : this.progress.enhance?.formalSources?.[0]?.ownerSlot;
    if (slot !== undefined && EnhanceGate.#formalSlots.has(slot)) return denied('busy', '正在保存强化结果，请稍候。');
    this.#busy = true;
    if (slot !== undefined) EnhanceGate.#formalSlots.add(slot);
    const expected = slot === undefined ? undefined : copy(this.progress.enhance);
    let rejection: EnhanceDenied | undefined;
    const reject = (result: EnhanceDenied): undefined => { rejection = result; return undefined; };
    try {
      if (slot !== undefined) {
        // 同档不同 Progress 也必须串行；旧对象在竞争结束后不能覆盖已提交等级或重新抽样。
        const saved = await saveStore.readSlot(slot);
        if (!saved || JSON.stringify(saved.data.enhance) !== JSON.stringify(expected))
          return denied('stale', '强化档案已更新，请重新读档。');
      }
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        if (slot !== undefined && JSON.stringify(draft.enhance) !== JSON.stringify(expected))
          return reject(denied('stale', '强化档案已更新，请重新读档。'));
        if (!this.valid(draft)) return reject(denied('progress', '强化档案存在歧义，已阻止写入。'));
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject(denied('progress', '强化结果校验失败，保持原档。'));
        return result;
      });
      return saved ?? rejection ?? denied('save', '强化保存失败，保持原库存与等级。');
    } catch { return denied('save', '强化保存失败，保持原库存与等级。'); }
    finally {
      if (slot !== undefined) EnhanceGate.#formalSlots.delete(slot);
      this.#busy = false;
    }
  }
}
