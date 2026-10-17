import enhance from '@xt/balance/enhance.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
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
export interface EnhanceDenied { allowed: false; tipKey: string; text: string; }
export type EnhanceGateResult = EnhanceAllowed | EnhanceDenied;
const copy = <T>(value: T): T => structuredClone(value);
const denied = (reason: string, text: string): EnhanceDenied => ({ allowed: false, tipKey: `enhance.fixture.${reason}`, text });
const count = (value: unknown): value is number => typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
const positive = (value: unknown): value is number => count(value) && value > 0;
const ratio = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value) && value >= 0;
const sameAttributes = (a: EnhanceAttributes, b: EnhanceAttributes): boolean =>
  a.atkRatioOfBase === b.atkRatioOfBase && a.defRatioOfBase === b.defRatioOfBase
  && a.hpRatioOfBase === b.hpRatioOfBase && a.allRatio === b.allRatio;

/** 正式恒关；仅独立 SSR 内存图可结算明确授权的测试装备，没有前台消费者。 */
export class EnhanceGate {
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: EnhanceFixtureOptions = {}) {}

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
      if (!this.valid(this.progress)) return denied('progress', '强化档案存在歧义，已阻止写入。');
      const selected = this.selection(this.progress, request);
      if (!selected) return denied('selection', '装备实例、等级或夹具授权无效。');
      if (!this.ownsCosts(this.progress, selected.row)) return denied('resources', '灵石或精炼石不足。');
      return { allowed: true, instance: copy(selected.instance), attributes: this.attributes(selected.instance.type, selected.instance.enhanceLevel), row: copy(selected.row) };
    } catch { return denied('request', '强化选择无效。'); }
  }
  async submit(request: EnhanceRequest): Promise<EnhanceGateResult> {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseSubmit();
    if (this.#busy) return denied('busy', '正在保存强化结果，请稍候。');
    try {
      if (!this.valid(this.progress)) return denied('progress', '强化档案存在歧义，已阻止写入。');
      if (!this.validRequest(request)) return denied('request', '强化请求无效或护器符依据缺失。');
      const old = this.progress.enhance?.enhancements.find(row => row.enhanceRequestId === request.enhanceRequestId);
      // 重放只认已提交身份，不依赖新装备授权，不抽样或开启事务。
      if (old) return this.replay(old, request);
      const selected = this.selection(this.progress, request);
      if (!selected) return denied('selection', '装备实例、等级或夹具授权无效。');
      // 第一次 await 之前固定请求和授权，外部对象变化不能改变本次含义。
      const intent = copy(request), authorized = copy(this.fixture.fixtureInstances!);
      return await this.transact((draft, reject) => {
        const selection = this.selection(draft, intent, authorized);
        if (!selection) return reject('selection', '装备已变动，保持原库存与等级。');
        if (draft.enhance?.enhancements.some(row => row.enhanceRequestId === intent.enhanceRequestId))
          return reject('duplicate', '该请求已提交，请读取既有结果。');
        if (!this.ownsCosts(draft, selection.row)) return reject('resources', '灵石或精炼石不足。');
        const ledgerId = draft.enhance?.ledgerId ?? (this.fixture.ledgerId ? this.fixture.ledgerId() : `enhance_${crypto.randomUUID()}`);
        if (!isEnhanceId(ledgerId)) return reject('identity', '强化夹具账本身份无效。');
        const random = this.fixture.random ? this.fixture.random() : Math.random();
        if (!ratio(random) || random >= 1) return reject('random', '强化抽样无效，保持原状态。');
        const success = random < selection.row.rate;
        const finalLevel = success ? intent.to : intent.fromLevel - (selection.row.dropOnFail ? 1 : 0);
        const result: EnhanceResult = {
          state: 'committed', enhanceRequestId: intent.enhanceRequestId, enhanceResultRef: `${ledgerId}:enhance:${intent.enhanceRequestId}`,
          instanceRef: selection.instance.instanceRef, itemId: selection.instance.itemId, type: selection.instance.type,
          fromLevel: intent.fromLevel, ...copy(selection.row), useProtectCharm: false, success, finalLevel,
          attributes: this.attributes(selection.instance.type, finalLevel),
        };
        const bag: EnhanceProgress = draft.enhance ?? { version: 1, ledgerId, instances: copy([...authorized]), enhancements: [], receipts: [] };
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
          return reject('commit', '强化结果承载失败，保持原库存与等级。');
        if (draft.stones !== stones - result.stones || draft.count('refine_stone') !== refineStones - result.refineStones
          || instance.enhanceLevel !== finalLevel || equipmentCounts.some(([id, before]) => draft.count(id) !== before)
          || !this.ownsInstances(draft, bag.instances))
          return reject('commit', '强化结果承载失败，保持原库存与等级。');
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
    if (!this.valid(this.progress)) return denied('progress', '强化档案存在歧义，已阻止写入。');
    return this.progress.enhance === undefined ? { allowed: true } : { allowed: true, progress: copy(this.progress.enhance) };
  }
  laterService(): EnhanceGateResult {
    if (!isEnhanceOpenForFixture()) return EnhanceClosed.refuseLaterService();
    return EnhanceClosed.refuseLaterService();
  }

  private readResult(requestId: string | undefined): EnhanceGateResult {
    if (!this.valid(this.progress)) return denied('progress', '强化档案存在歧义，已阻止写入。');
    const result = this.progress.enhance?.enhancements.find(row => row.enhanceRequestId === requestId);
    return result ? { allowed: true, result: copy(result), replayed: true } : denied('result', '没有完整提交的强化结果。');
  }
  private replay(result: EnhanceResult, request: EnhanceRequest): EnhanceGateResult {
    return result.instanceRef === request.instanceRef && result.fromLevel === request.fromLevel && result.to === request.to
      ? { allowed: true, result: copy(result), replayed: true } : denied('identity', '请求身份与既有强化结果不符。');
  }
  private validRequest(value: unknown): value is EnhanceRequest {
    return enhanceFields(value, ['enhanceRequestId', 'instanceRef', 'fromLevel', 'to', 'useProtectCharm'])
      && isEnhanceId(value.enhanceRequestId) && isEnhanceInstanceRef(value.instanceRef) && count(value.fromLevel)
      && positive(value.to) && value.to === value.fromLevel + 1 && value.to <= enhance.maxLevel && value.useProtectCharm === false;
  }
  private selection(progress: Progress, request: EnhanceRequest | undefined,
    authorized: readonly EnhanceFixtureInstance[] | undefined = this.fixture.fixtureInstances): { instance: EnhanceFixtureInstance; row: EnhanceLevelRow } | undefined {
    if (!this.validRequest(request) || !isValidEnhanceInstances(authorized)
      || !authorized.every(row => row.enhanceLevel <= enhance.maxLevel && this.supportedInstance(row))) return undefined;
    const instances = progress.enhance?.instances ?? authorized;
    const instance = instances.find(row => row.instanceRef === request.instanceRef);
    const permission = authorized.find(row => row.instanceRef === request.instanceRef);
    if (!instance || !permission || instance.itemId !== permission.itemId || instance.type !== permission.type
      || instance.enhanceLevel !== request.fromLevel || instance.enhanceLevel >= enhance.maxLevel
      || !instances.every(row => row.enhanceLevel <= enhance.maxLevel && this.supportedInstance(row))
      || !this.ownsInstances(progress, instances)) return undefined;
    const matches = enhance.levels.filter(row => row.to === request.to);
    return matches.length === 1 ? { instance, row: matches[0] } : undefined;
  }
  private supportedInstance(instance: EnhanceFixtureInstance): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, instance.itemId) ? ITEMS[instance.itemId] : undefined;
    return !!item && item.type === 'equip' && inPhase(item) && item.enabled !== false && item.placeholder !== true
      && item.qualityEnabled !== true && (instance.type === 'weapon' ? item.slot === 'weapon' : item.slot === 'robe' || item.slot === 'shoes');
  }
  private ownsInstances(progress: Progress, instances: readonly EnhanceFixtureInstance[]): boolean {
    const counts = new Map<string, number>();
    for (const row of instances) counts.set(row.itemId, (counts.get(row.itemId) ?? 0) + 1);
    return [...counts].every(([itemId, owned]) => count(progress.permanentCount(itemId)) && progress.permanentCount(itemId) >= owned
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
    return bag.enhancements.every(result => {
      const row = enhance.levels.find(other => other.to === result.to);
      return !!row && result.rate === row.rate && result.stones === row.stones && result.refineStones === row.refineStones
        && result.dropOnFail === row.dropOnFail && result.finalLevel <= enhance.maxLevel
        && sameAttributes(result.attributes, this.attributes(result.type, result.finalLevel));
    });
  }
  private async transact(apply: (draft: Progress, reject: (reason: string, text: string) => undefined) => EnhanceAllowed | undefined): Promise<EnhanceGateResult> {
    if (this.#busy) return denied('busy', '正在保存强化结果，请稍候。');
    this.#busy = true;
    let rejection: EnhanceDenied | undefined;
    const reject = (reason: string, text: string): undefined => { rejection = denied(reason, text); return undefined; };
    try {
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        if (!this.valid(draft)) return reject('progress', '强化档案存在歧义，已阻止写入。');
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject('progress', '强化结果校验失败，保持原档。');
        return result;
      });
      return saved ?? rejection ?? denied('save', '强化保存失败，保持原库存与等级。');
    } catch { return denied('save', '强化保存失败，保持原库存与等级。'); }
    finally { this.#busy = false; }
  }
}
