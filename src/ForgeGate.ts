import enhance from '@xt/balance/enhance.json';
import { ITEMS, inPhase } from './data';
import type { Progress } from './Progress';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import * as ForgeClosed from './ForgeClosed';
import { isForgeId, isValidForgeMaterials, isValidForgeProgress,
  type ForgeCraftResult, type ForgeGrade, type ForgeMaterial, type ForgeProgress } from './ForgeProgress';

export interface ForgeFixtureRecipe {
  blueprintId: string;
  /** 是否消耗及数量只由本地夹具明确授权，不推定正式图纸规则。 */
  blueprintCount: number;
  materials: readonly ForgeMaterial[];
  resultItemId: string;
}
export interface ForgeFixtureOptions {
  /** 缺省没有任何合法配方；不读取或生成正式配方表。 */
  fixtureRecipes?: readonly ForgeFixtureRecipe[];
  random?: () => number;
  ledgerId?: () => string;
  /** 当前背包无格数上限，夹具用此哨兵模拟满包/承载失败。 */
  canReceiveResult?: (draft: Progress, itemId: string) => boolean;
}
export interface ForgeCraftRequest { craftRequestId: string; blueprintId: string; materials: ForgeMaterial[]; }
export interface ForgeAllowed {
  allowed: true;
  result?: ForgeCraftResult;
  progress?: ForgeProgress;
  replayed?: boolean;
}
export interface ForgeDenied { allowed: false; tipKey: string; text: string; }
export type ForgeGateResult = ForgeAllowed | ForgeDenied;
const copy = <T>(value: T): T => structuredClone(value);
const denied = (reason: string, text: string): ForgeDenied => ({ allowed: false, tipKey: `forge.fixture.${reason}`, text });
const positiveInteger = (n: unknown): n is number => typeof n === 'number' && Number.isSafeInteger(n) && n > 0;
const sameMaterials = (a: readonly ForgeMaterial[], b: readonly ForgeMaterial[]) => a.length === b.length
  && a.every(row => b.some(other => other.itemId === row.itemId && other.count === row.count));
const ownFields = (value: unknown, keys: string[]): boolean => !!value && typeof value === 'object'
  && !Array.isArray(value) && keys.every(key => Object.prototype.hasOwnProperty.call(value, key))
  && Reflect.ownKeys(value).every(key => typeof key === 'string' && keys.includes(key)
    && Object.prototype.hasOwnProperty.call(Object.getOwnPropertyDescriptor(value, key), 'value'));

/** 正式恒关；只有独立 Vite SSR 内存图能执行本地授权夹具，前台无消费者。 */
export class ForgeGate {
  #busy = false;
  constructor(private readonly progress: Progress, private readonly fixture: ForgeFixtureOptions = {}) {}

  feature(): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.featureClosed();
    return this.validRules() ? { allowed: true } : denied('rules', '打造品质依赖未就绪。');
  }
  entrance(): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseEntrance();
    return this.validRules() ? { allowed: true } : denied('rules', '打造品质依赖未就绪。');
  }
  /** 只读检查选择；不会占用库存、建单、抽样或提交。 */
  craft(request?: ForgeCraftRequest): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseCraft();
    try {
      if (!this.valid(this.progress)) return denied('progress', '打造档案不完整，已阻止歧义操作。');
      const recipe = this.recipe(request);
      if (!recipe) return denied('recipe', '图纸、材料或本地授权映射无效。');
      return this.ownsInputs(this.progress, recipe) ? { allowed: true } : denied('ownership', '没有足够的永久图纸或材料。');
    } catch { return denied('request', '打造选择无效。'); }
  }
  async submit(request: ForgeCraftRequest): Promise<ForgeGateResult> {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseSubmit();
    if (this.#busy) return denied('busy', '正在保存打造结果，请稍候。');
    try {
      if (!this.valid(this.progress)) return denied('progress', '打造档案不完整，已阻止歧义操作。');
      const recipe = this.recipe(request);
      if (!recipe) return denied('recipe', '图纸、材料或本地授权映射无效。');
      // 已提交请求只读重放；无新事务、扣料或品质抽样。身份冲突不认作重试。
      const old = this.progress.forge?.crafts.find(row => row.craftRequestId === request.craftRequestId);
      if (old) return this.replay(old, recipe);
      // 在第一个 await 前固定请求与授权，外部修改对象不能改变正在提交的含义。
      const intent = copy(request), authorized = copy(recipe);
      return await this.transact((draft, reject) => {
        const current = draft.forge;
        if (current?.crafts.some(row => row.craftRequestId === intent.craftRequestId)) return reject('duplicate', '该请求已提交，请读取既有结果。');
        if (!this.ownsInputs(draft, authorized)) return reject('ownership', '没有足够的永久图纸或材料。');
        if (!this.supportedItem(draft, authorized.resultItemId)
          || !draft.canAddCraftedItem(authorized.resultItemId, 1)
          || this.fixture.canReceiveResult?.(draft, authorized.resultItemId) === false) return reject('capacity', '成品承载失败，保持原库存。');
        const ledgerId = current?.ledgerId ?? (this.fixture.ledgerId ? this.fixture.ledgerId() : `forge_${crypto.randomUUID()}`);
        if (!isForgeId(ledgerId)) return reject('identity', '打造账本身份无效。');
        const grade = this.sampleGrade();
        if (!grade) return reject('grade', '品质抽样无效，不生成默认品质。');
        const craftResultRef = `${ledgerId}:craft:${intent.craftRequestId}`;
        const result: ForgeCraftResult = {
          state: 'committed', craftRequestId: intent.craftRequestId, craftResultRef,
          blueprintId: authorized.blueprintId, blueprintCount: authorized.blueprintCount, materials: copy([...authorized.materials]),
          resultItem: { itemId: authorized.resultItemId, count: 1, instanceRef: `${craftResultRef}:item` }, resultGrade: grade,
        };
        const costs = [{ itemId: authorized.blueprintId, count: authorized.blueprintCount }, ...authorized.materials];
        const beforeCosts = costs.map(cost => draft.count(cost.itemId)), beforeResult = draft.count(authorized.resultItemId);
        for (const cost of costs) draft.removeItem(cost.itemId, cost.count);
        if (!costs.every((cost, index) => draft.count(cost.itemId) === beforeCosts[index] - cost.count)
          || !draft.addCraftedItem(authorized.resultItemId, 1)
          || draft.count(authorized.resultItemId) !== beforeResult + 1) return reject('capacity', '成品入库失败，保持原库存。');
        const forge: ForgeProgress = current ?? { version: 1, ledgerId, crafts: [], receipts: [] };
        forge.crafts.push(result); forge.receipts.push(craftResultRef); draft.forge = forge;
        return { allowed: true, result: copy(result), progress: copy(forge), replayed: false };
      });
    } catch { return denied('save', '打造未提交，保持原库存。'); }
  }
  result(craftRequestId?: string): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseResult();
    return this.readResult(craftRequestId);
  }
  grade(craftRequestId?: string): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseGrade();
    return this.readResult(craftRequestId);
  }
  loadRefresh(): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseLoadRefresh();
    if (!this.valid(this.progress)) return denied('progress', '打造档案不完整，已阻止歧义操作。');
    return this.progress.forge === undefined ? { allowed: true } : { allowed: true, progress: copy(this.progress.forge) };
  }
  laterService(): ForgeGateResult {
    if (!isForgeOpenForFixture()) return ForgeClosed.refuseLaterService();
    return ForgeClosed.refuseLaterService();
  }

  private readResult(requestId: string | undefined): ForgeGateResult {
    if (!this.valid(this.progress)) return denied('progress', '打造档案不完整，已阻止歧义操作。');
    const result = this.progress.forge?.crafts.find(row => row.craftRequestId === requestId);
    return result ? { allowed: true, result: copy(result), replayed: true } : denied('result', '没有完整提交的打造结果。');
  }
  private replay(result: ForgeCraftResult, recipe: ForgeFixtureRecipe): ForgeGateResult {
    return result.blueprintId === recipe.blueprintId && result.blueprintCount === recipe.blueprintCount
      && sameMaterials(result.materials, recipe.materials) && result.resultItem.itemId === recipe.resultItemId
      ? { allowed: true, result: copy(result), replayed: true } : denied('identity', '请求身份与既有结果不符。');
  }
  private validRules(): boolean {
    const grades = enhance.forge.grade;
    return Object.keys(grades).length === 4 && ['common', 'fine', 'spirit', 'treasure'].every(key =>
      Object.prototype.hasOwnProperty.call(grades, key) && typeof Reflect.get(grades, key) === 'number'
      && Number.isFinite(Reflect.get(grades, key)) && Reflect.get(grades, key) > 0)
      && Math.abs(Object.values(grades).reduce((sum, value) => sum + value, 0) - 1) <= Number.EPSILON * 8;
  }
  private sampleGrade(): ForgeGrade | undefined {
    const random = this.fixture.random ? this.fixture.random() : Math.random();
    if (typeof random !== 'number' || !Number.isFinite(random) || random < 0 || random >= 1) return undefined;
    let cumulative = 0;
    for (const grade of ['common', 'fine', 'spirit', 'treasure'] as const) {
      cumulative += enhance.forge.grade[grade];
      if (random < cumulative) return grade;
    }
    return undefined;
  }
  private recipe(request: ForgeCraftRequest | undefined): ForgeFixtureRecipe | undefined {
    if (!ownFields(request, ['craftRequestId', 'blueprintId', 'materials']) || !request
      || !isForgeId(request.craftRequestId) || !isForgeId(request.blueprintId) || !isValidForgeMaterials(request.materials)) return undefined;
    const matches = this.fixture.fixtureRecipes?.filter(row => row.blueprintId === request.blueprintId);
    if (matches?.length !== 1) return undefined;
    const recipe = matches[0];
    if (!ownFields(recipe, ['blueprintId', 'blueprintCount', 'materials', 'resultItemId'])
      || !isForgeId(recipe.blueprintId) || !positiveInteger(recipe.blueprintCount) || !isValidForgeMaterials(recipe.materials)
      || !isForgeId(recipe.resultItemId) || recipe.blueprintId === recipe.resultItemId
      || recipe.materials.some(row => row.itemId === recipe.blueprintId || row.itemId === recipe.resultItemId)
      || !sameMaterials(request.materials, recipe.materials) || ITEMS[recipe.resultItemId]?.type !== 'equip') return undefined;
    return recipe;
  }
  private valid(progress: Progress): boolean {
    if (!this.validRules()) return false;
    if (progress.forge === undefined) return true;
    if (!isValidForgeProgress(progress.forge)) return false;
    // 存档结构检查与本地授权映射分离；损坏或外来引用不补配方、不改原档。
    return progress.forge.crafts.every(row => {
      const recipe = this.recipe({ craftRequestId: row.craftRequestId, blueprintId: row.blueprintId, materials: row.materials });
      return !!recipe && row.blueprintCount === recipe.blueprintCount && row.resultItem.itemId === recipe.resultItemId
        && [row.blueprintId, ...row.materials.map(material => material.itemId), row.resultItem.itemId].every(id => this.configItem(id));
    });
  }
  private configItem(id: string): boolean {
    const item = Object.prototype.hasOwnProperty.call(ITEMS, id) ? ITEMS[id] : undefined;
    return !!item && inPhase(item) && item.enabled !== false && item.placeholder !== true && item.qualityEnabled !== true;
  }
  private supportedItem(progress: Progress, id: string): boolean {
    return this.configItem(id) && !Object.prototype.hasOwnProperty.call(progress.pillQualities, id)
      && !Object.values(progress.equip).includes(id) && progress.count(id) === progress.permanentCount(id);
  }
  private ownsInputs(progress: Progress, recipe: ForgeFixtureRecipe): boolean {
    return [{ itemId: recipe.blueprintId, count: recipe.blueprintCount }, ...recipe.materials].every(row =>
      this.supportedItem(progress, row.itemId) && positiveInteger(progress.permanentCount(row.itemId))
      && progress.permanentCount(row.itemId) >= row.count);
  }
  private async transact(apply: (draft: Progress, reject: (reason: string, text: string) => undefined) => ForgeAllowed | undefined): Promise<ForgeGateResult> {
    if (this.#busy) return denied('busy', '正在保存打造结果，请稍候。');
    this.#busy = true;
    let rejection: ForgeDenied | undefined;
    const reject = (reason: string, text: string): undefined => { rejection = denied(reason, text); return undefined; };
    try {
      const saved = await this.progress.runSaveTransactionAsync(draft => {
        if (!this.valid(draft)) return reject('progress', '打造档案不完整，已阻止歧义操作。');
        const result = apply(draft, reject);
        if (result && !this.valid(draft)) return reject('progress', '打造结果校验失败，保持原档。');
        return result;
      });
      return saved ?? rejection ?? denied('save', '打造保存失败，请重试。');
    } catch { return denied('save', '打造保存失败，请重试。'); }
    finally { this.#busy = false; }
  }
}
