// 关态 tip C01–C10。语义载荷只用于证明零写，不创建分解 schema、Gate 或结算流程。
import strings from '@xt/balance/strings_zh.json';
import enhance from '@xt/balance/enhance.json';
import protectCharmMap from '@xt/balance/enhance_protect_charm.json';
import recipes from '@xt/balance/recipes.json';
import * as Closed from './SalvageClosed';
import { isSalvageOpenForFixture } from './SalvageOpenFlag';
import * as EnhanceClosed from './EnhanceClosed';
import * as EnchantClosed from './EnchantClosed';
import { EnchantGate } from './EnchantGate';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import { isValidEnchantProgress } from './EnchantProgress';
import * as ForgeClosed from './ForgeClosed';
import { EnhanceGate } from './EnhanceGate';
import { ForgeGate } from './ForgeGate';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isValidEnhanceProgress } from './EnhanceProgress';
import { isValidForgeProgress } from './ForgeProgress';
import { Progress } from './Progress';
import { createIndexedDbBackend, setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';
import { GAME_PHASE, ITEMS, inPhase } from './data';
import { featureEnabled, featureFlags } from './features';

export const apiTips = {
  featureClosed: 'salvage.closed.feature', refuseEntrance: 'salvage.closed.entrance',
  refuseSalvage: 'salvage.closed.salvage', refuseSubmit: 'salvage.closed.no_submit',
  refuseResult: 'salvage.closed.no_result', refuseOutput: 'salvage.closed.no_output',
  refuseLoadRefresh: 'salvage.closed.load_refresh', refuseLaterService: 'salvage.closed.later_service',
} as const;
type ApiName = keyof typeof apiTips;
type Payload = { name: string; slot: SlotKey; save: Record<string, unknown> };
type CaseEvidence = { executed: true; evidenceKeys: string[]; fixtures: number; invocations: number };
const semanticField = '__salvageClosedSemanticFixture';
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const methods = ['persistSoon', 'save', 'saveAsync', 'runSaveTransaction', 'runSaveTransactionAsync',
  'addItem', 'addCraftedItem', 'removeItem', 'gainExp', 'gainLifeSkillExp', 'grantRecipe',
  'registerFormalEnhanceInstance', 'salvage', 'submitSalvage', 'settleSalvage', 'destroyFormalInstance',
  'removeEquip', 'grantRefineStone', 'createSalvageRequest', 'recordSalvageResult',
  'recordSalvageDedup', 'enqueueSalvageWrite', 'reserveSalvageInstance', 'reserveInventory'] as const;

export async function runSalvageClosedTests(options: {
  dataMode: string; graph: 'initial' | 'fresh-ssr-refresh'; payloads?: Payload[];
}) {
  let assertions = 0, invocations = 0, fixtures = 0, sentinelCalls = 0, storageWrites = 0,
    ordinarySaveSetupWrites = 0, storageReads = 0, setup = true;
  const eq = (actual: unknown, expected: unknown, message: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${message}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  };
  const ok = (actual: unknown, message: string) => { assertions++; if (!actual) throw new Error(message); };
  const cases: Record<string, CaseEvidence> = {};
  for (let i = 1; i <= 10; i++) cases[`C${String(i).padStart(2, '0')}`] = {
    executed: true, evidenceKeys: [], fixtures: 0, invocations: 0,
  };
  const key = (caseId: string, label: string) => {
    if (!cases[caseId].evidenceKeys.includes(label)) cases[caseId].evidenceKeys.push(label);
  };
  const oldSlot = Progress.getActiveSlot(), localStorageBefore = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    indexedDbBefore = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB');
  const rows = new Map<SlotKey, SaveSlot>();
  const globalsBefore = copy(featureFlags());
  let localStorageWrites = 0, indexedDbOpens = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null,
    setItem: () => { localStorageWrites++; throw new Error('分解关态不得写 localStorage'); },
    removeItem: () => { localStorageWrites++; throw new Error('分解关态不得删除 localStorage'); },
  } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open: () => { indexedDbOpens++; throw new Error('测试使用内存后端；分解关态不得打开 IDB'); },
    deleteDatabase: () => { indexedDbOpens++; throw new Error('分解关态不得删除 IDB'); },
  } });
  const write = () => {
    if (setup) ordinarySaveSetupWrites++;
    else { storageWrites++; throw new Error('分解关态 API 不得提交存储'); }
  };
  setSaveBackend({
    async read(slot) { storageReads++; return rows.has(slot) ? structuredClone(rows.get(slot)!) : null; },
    async write(slot) { write(); rows.set(slot.slotKey, structuredClone(slot)); },
    async delete(slot) { write(); rows.delete(slot); },
    async insertIfEmpty(slot) {
      write(); if (rows.has(slot.slotKey)) return false; rows.set(slot.slotKey, structuredClone(slot)); return true;
    },
  });
  const call = (caseId: string, name: ApiName, label: string) => {
    invocations++; cases[caseId].invocations++;
    eq(Closed[name].length, 0, `${label}: ${name} 零参数`);
    const result = Closed[name]();
    eq(Object.keys(result).sort(), ['allowed', 'text', 'tipKey'], `${label}: 只返回三个提示字段`);
    eq(result, { allowed: false, tipKey: apiTips[name], text: strings[apiTips[name]] }, `${label}: ${name} 只读拒绝且读 strings`);
    ok(result.tipKey.startsWith('salvage.closed.'), `${label}: 独立分解提示分层`);
    eq(isSalvageOpenForFixture(), false, `${label}: 调用后独立分解旗仍 false`);
    return result;
  };
  const experience = (p: Progress) => [p.level, p.exp, p.alchemyLevel, p.alchemyExp,
    p.talismanLevel, p.talismanExp, p.forgingLevel, p.forgingExp];
  async function exercise(caseId: string, label: string, p: Progress, context: unknown,
    names: ApiName[] = ['refuseSalvage', 'refuseSubmit'], concurrent = false) {
    const state = p as unknown as Record<string, unknown>;
    Object.defineProperty(state, semanticField, { configurable: true, enumerable: true, writable: true, value: copy(context) });
    const descriptors = methods.map(name => [name, Object.getOwnPropertyDescriptor(p, name)] as const);
    const beforeSave = p.exportSave(), beforeState = copy(p), beforeExp = experience(p),
      beforeRows = copy([...rows]), beforeFeatures = copy(featureFlags()), raw = JSON.stringify(beforeSave);
    const beforeFormal = copy([p.forge, p.enhance, p.enchant, p.inventory, p.equip, p.stones, p.rootElement]);
    try {
      for (const method of methods) Object.defineProperty(p, method, { configurable: true, value: () => {
        sentinelCalls++; throw new Error(`${label}: 禁止调用写入哨兵 ${method}`);
      } });
      for (let repeat = 0; repeat < 3; repeat++) for (const name of names) call(caseId, name, label);
      if (concurrent) {
        const results = await Promise.all(Array.from({ length: 32 }, (_, index) =>
          Promise.resolve().then(() => call(caseId, names[index % names.length], `${label}/concurrent-${index}`))));
        ok(results.every(result => result.allowed === false), `${label}: 同实例/共享库存回调全部拒绝`);
      }
      eq(copy(p), beforeState, `${label}: 内存完整状态不变`);
      eq(p.exportSave(), beforeSave, `${label}: 整档资产、结果和业务记录零增量`);
      eq(JSON.stringify(p.exportSave()), raw, `${label}: 保存内容序列化字节不变`);
      eq([p.forge, p.enhance, p.enchant, p.inventory, p.equip, p.stones, p.rootElement], beforeFormal,
        `${label}: 正式打造/强化/护符/附灵与灵石/精炼石/装备/灵根保留`);
      eq(experience(p), beforeExp, `${label}: 品质、等级与经验不变`);
      eq([...rows], beforeRows, `${label}: 两档存储原文不变`);
      eq(featureFlags(), beforeFeatures, `${label}: features 不变`);
      eq([sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens], [0, 0, 0, 0], `${label}: 写哨兵、存储与 IDB 打开均 0`);
      cases[caseId].fixtures++; fixtures++; key(caseId, label);
    } finally {
      for (const [method, descriptor] of descriptors) {
        if (descriptor) Object.defineProperty(p, method, descriptor); else Reflect.deleteProperty(p, method);
      }
      Reflect.deleteProperty(state, semanticField);
    }
  }
  // 仅 seed 已有 schema 的完整打造、带符强化和附灵旧记录；不运行结算，不创建分解字段。
  function existingAssets(slot: SlotKey = 1) {
    const p = new Progress();
    p.stones = 10000; p.inventory = { bamboo_sword: 1, fox_robe: 1, beast_core: 4, refine_stone: 20, protect_charm: 3 };
    p.equip = { weapon: 'bamboo_sword' }; p.forgingLevel = 3; p.forgingExp = 7; p.rootElement = '金';
    const forgeLedger = 'salvageClosedForge', craftRequestId = 'oldOwnedWeapon',
      craftResultRef = `${forgeLedger}:craft:${craftRequestId}`, instanceRef = `${craftResultRef}:item`;
    p.forge = { version: 1, ledgerId: forgeLedger, crafts: [{ state: 'committed', craftRequestId, craftResultRef,
      blueprintId: 'scroll_ten_thousand_swords', blueprintCount: 1,
      materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }],
      resultItem: { itemId: 'bamboo_sword', count: 1, instanceRef }, resultGrade: 'spirit' }], receipts: [craftResultRef] };
    const ledgerId = 'salvageClosedEnhance', enhanceRequestId = 'oldProtectedSuccess',
      enhanceResultRef = `${ledgerId}:enhance:${enhanceRequestId}`;
    p.enhance = { version: 1, ledgerId, instances: [{ instanceRef, itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: 1 }],
      enhancements: [{ state: 'committed', enhanceRequestId, enhanceResultRef, instanceRef, itemId: 'bamboo_sword', type: 'weapon',
        fromLevel: 0, to: 1, rate: enhance.levels[0].rate, stones: enhance.levels[0].stones,
        refineStones: enhance.levels[0].refineStones, dropOnFail: false, useProtectCharm: true, success: true,
        finalLevel: 1, attributes: { atkRatioOfBase: enhance.statPerLevel.weapon.atkRatioOfBase, defRatioOfBase: 0, hpRatioOfBase: 0, allRatio: 0 } }],
      receipts: [enhanceResultRef], formalSources: [{ instanceRef, source: 'forge', forgeLedgerId: forgeLedger, craftResultRef, ownerSlot: slot }] };
    const enchantLedger = 'salvageClosedEnchant', enchantRequestId = 'oldElementSuccess',
      enchantResultRef = `${enchantLedger}:enchant:${enchantRequestId}`;
    const attributes = { elementDamage: enhance.enchant.elementDamage, sameRootBonus: enhance.enchant.sameRootBonus };
    p.enchant = { version: 1, ledgerId: enchantLedger, ownerSlot: slot,
      instances: [{ instanceRef, itemId: 'bamboo_sword', type: 'weapon', element: '金', attributes }],
      enchantments: [{ state: 'committed', enchantRequestId, enchantResultRef, instanceRef, itemId: 'bamboo_sword',
        type: 'weapon', fromElement: null, element: '金', rootElement: '金', stones: enhance.enchant.cost.stones,
        materials: [{ itemId: 'beast_core', count: enhance.enchant.cost.materials[0].count }], attributes, success: true }],
      receipts: [enchantResultRef] };
    ok(isValidEnchantProgress(p.enchant), '既有完整附灵旧袋符合正式 schema');
    ok(isValidForgeProgress(p.forge), '既有打造完整事实 seed 符合正式 schema');
    ok(isValidEnhanceProgress(p.enhance), '既有带符强化完整事实 seed 符合正式 schema');
    return p;
  }
  const restore = (save: Record<string, unknown>) =>
    (Progress as unknown as { restore(saved: unknown, persistMigrations: boolean): Progress }).restore(copy(save), false);
  try {
    eq(Object.keys(Closed).sort(), Object.keys(apiTips).sort(), '恰有八个公开分解只读 API');
    eq(isSalvageOpenForFixture.length, 0, '分解旗零参数');
    eq([isForgeOpenForFixture(), isEnhanceOpenForFixture(), isEnchantOpenForFixture(), isSalvageOpenForFixture()], [true, true, true, false],
      'C09 三既有正式 Flag=true，独立 Salvage=false');
    eq(GAME_PHASE, 5, 'GAME_PHASE 保持 5');
    eq(featureEnabled('indexedDbSaves'), true, 'C08 使用真实异步存档入口');
    ok(!Object.keys(globalsBefore).some(name => /salvage/iu.test(name)), '不增加 features 分解开关');
    eq(enhance.salvage, { refineStonesByGrade: { common: 1, fine: 2, spirit: 4, treasure: 8 } },
      '分解数量仅读冻结 enhance.salvage；无 cost/rate，不授权产出');
    ok(ITEMS.refine_stone && ITEMS.refine_stone.type === 'material' && inPhase(ITEMS.refine_stone),
      '精炼石合并后有效 material 登记且在阶段内');
    ok(ITEMS.refine_stone.enabled !== false && ITEMS.refine_stone.placeholder !== true && ITEMS.refine_stone.qualityEnabled !== true,
      'refine_stone 仅登记齐，此断言不授权分解');
    eq(protectCharmMap, { itemId: 'protect_charm', countPerSettlement: 1 }, '保留护符 N=1 正式映射');
    ok(recipes.recipes.some(row => row.type === 'forge' && row.output === 'bamboo_sword'), '合法旧实例对应既有正式 forge 配方');
    Progress.setActiveSlot(1);
    let payloads: Payload[];
    if (!options.payloads) {
      const p = existingAssets(1), other = existingAssets(2);
      other.stones = 12345; other.inventory.beast_core = 9;
      eq(p.formalEnhanceInstances().length, 1, 'C02 旧实例由本档既有正式来源回查');
      ok(await p.saveAsync(), 'C08 普通 saveAsync 建立完整旧资产档 1');
      Progress.setActiveSlot(2); ok(await other.saveAsync(), 'C08 普通 saveAsync 建立独立旧资产档 2');
      payloads = [{ name: 'existing-protected-slot-1', slot: 1, save: p.exportSave() },
        { name: 'same-reference-slot-2', slot: 2, save: other.exportSave() }];
      eq(ordinarySaveSetupWrites, 2, 'C08 两次普通保存仅作准备，分列于 API 零写计数之外');
    } else {
      payloads = copy(options.payloads);
      for (const payload of payloads) rows.set(payload.slot, { slotKey: payload.slot, data: copy(payload.save), lastSaveAt: 1 });
      eq(ordinarySaveSetupWrites, 0, 'fresh SSR 图仅播种内存原文，无存储写入');
    }
    setup = false; Progress.setActiveSlot(1);
    const base = restore(payloads[0].save), instanceRef = base.enhance!.instances[0].instanceRef;
    eq(base.formalEnhanceInstanceStatus(instanceRef), 'registered', 'C02 restore 后正式旧武器来源仍属本档');
    await exercise('C01', 'C01/feature-close-reopen-smith-entrance', base,
      { interactions: ['view', 'close', 'reopen', 'smith_ou'], serviceCreated: false, requestCreated: false }, ['featureClosed', 'refuseEntrance']);
    // C02 意图仅为测试上下文；API 零参数且不验证资格、不执行分解，armor/品质不升格为生产实例。
    for (const type of ['weapon', 'armor']) for (const grade of ['common', 'fine', 'spirit', 'treasure'])
      await exercise('C02', `C02/${type}/${grade}/first-and-repeat`, base,
        { instanceRef, type, grade, enoughStorage: true, semanticIntentOnly: true,
          weaponFormalSource: base.formalEnhanceInstanceStatus(instanceRef), armorItemId: 'fox_robe' },
        ['refuseSalvage', 'refuseSubmit'], true);
    const badSources = ['no-instance', 'itemId-count-only', 'equipment-slot-only', 'historical-bag-only', 'fixtureInstances-fallback', 'foreign-same-reference'];
    for (const source of badSources) {
      const p = restore(payloads[0].save);
      if (source === 'foreign-same-reference') p.enhance!.formalSources![0].ownerSlot = 2;
      else if (source === 'historical-bag-only') delete p.enhance!.formalSources;
      else { p.enhance = undefined; p.forge = undefined; }
      await exercise('C03', `C03/${source}`, p, { source, itemId: 'bamboo_sword', instanceRef,
        fixtureInstances: source === 'fixtureInstances-fallback' ? [{ instanceRef, itemId: 'bamboo_sword' }] : [] }, ['refuseSubmit']);
    }
    for (const target of ['non-equipment', 'illegal-type', 'illegal-slot', 'disabled', 'placeholder', 'quality-enabled', 'blood-bound', 'natal-marked', 'non-salvageable', 'binding-fields-missing'])
      await exercise('C04', `C04/${target}`, base, { target, bindingFieldsPresent: target !== 'binding-fields-missing', semanticIntentOnly: true }, ['refuseSubmit']);
    for (const dependency of ['unknown-grade', 'missing-grade', 'conflicting-grade', 'invalid-output-config', 'items-registration-only',
      'materials-visible-only', 'partial-mapping', 'no-complete-capacity', 'invalid-owned-count', 'unsafe-inventory-count']) {
      const p = restore(payloads[0].save);
      if (dependency === 'invalid-owned-count') p.inventory.refine_stone = -1;
      if (dependency === 'unsafe-inventory-count') p.inventory.refine_stone = Number.MAX_SAFE_INTEGER;
      await exercise('C05', `C05/${dependency}`, p, { dependency, semanticIntentOnly: true }, ['refuseSubmit', 'refuseOutput']);
    }
    for (const operation of ['result-request', 'output-request', 'held-reference-rewrite', 'equip-slot-rewrite', 'destroy-before-output', 'partial-output'])
      await exercise('C06', `C06/${operation}`, base, { operation, instanceRef,
        requestLog: [], resultLog: [], dedupLog: [], delayedQueue: [], semanticIntentOnly: true },
      ['refuseResult', 'refuseOutput']);
    for (const callback of ['old-ui', 'duplicate-callback', 'same-request-replay', 'payload-conflict', 'same-instance-target-conflict', 'shared-refine-stack-capacity']) {
      const p = restore(payloads[0].save); if (callback === 'shared-refine-stack-capacity') p.inventory.refine_stone = 199;
      await exercise('C07', `C07/${callback}`, p, { callback, requestId: 'closed-repeat', instanceRef, conflictingGrades: ['common', 'treasure'],
        requestLog: [], resultLog: [], dedupLog: [], delayedQueue: [], reservations: [] }, ['refuseSalvage', 'refuseSubmit'], true);
    }
    for (const payload of payloads) {
      const original = JSON.stringify(payload.save), restored = restore(payload.save);
      eq([restored.forge, restored.enhance, restored.enchant, restored.inventory, restored.stones, restored.equip, restored.rootElement],
        [payload.save.forge, payload.save.enhance, payload.save.enchant, payload.save.inventory, payload.save.stones, payload.save.equip, payload.save.rootElement],
        `C08/${payload.name}: 真实 restore 保留已登记的正式字段`);
      await exercise('C08', `C08/${options.graph}/restore/${payload.name}`, restored,
        { oldState: 'legal-complete-result', raw: payload.save }, ['refuseLoadRefresh', 'refuseSubmit']);
      const loaded = await Progress.loadAsync(payload.slot);
      eq(loaded.storageError, undefined, `C08/${payload.name}: 真实异步读档无错误`);
      eq([loaded.forge, loaded.enhance, loaded.enchant, loaded.inventory, loaded.stones, loaded.equip, loaded.rootElement],
        [payload.save.forge, payload.save.enhance, payload.save.enchant, payload.save.inventory, payload.save.stones, payload.save.equip, payload.save.rootElement],
        `C08/${payload.name}: 真实 loadAsync 保留合法资产与完整打造/带符强化/附灵旧结果`);
      await exercise('C08', `C08/${options.graph}/loadAsync/${payload.name}`, loaded,
        { oldState: 'legal-complete-result', slot: payload.slot }, ['refuseLoadRefresh', 'refuseSubmit']);
      eq(JSON.stringify(payload.save), original, `C08/${payload.name}: 原存档载荷不变`);
    }
    Progress.setActiveSlot(1);
    for (const oldState of ['missing', 'unknown', 'unfinished', 'corrupt']) {
      const p = restore(payloads[0].save), raw = { oldState, grade: oldState === 'corrupt' ? null : 'spirit',
        result: oldState === 'unfinished' ? { state: 'pending' } : { state: oldState }, pending: ['do-not-replay'] };
      const legacySave = { ...p.exportSave(), [semanticField]: copy(raw) }, legacyBefore = JSON.stringify(legacySave), actualRestore = restore(legacySave);
      ok(!Object.prototype.hasOwnProperty.call(actualRestore, semanticField), `C08/${oldState}: 真实 restore 不登记未知分解测试字段`);
      eq(JSON.stringify(legacySave), legacyBefore, `C08/${oldState}: 未知记录原始输入不被修复`);
      rows.set(3, { slotKey: 3, data: copy(legacySave), lastSaveAt: 1 });
      const rawRowsBefore = JSON.stringify([...rows]), loadedLegacy = await Progress.loadAsync(3);
      eq(loadedLegacy.storageError, undefined, `C08/${oldState}: 含未知测试字段旧原文可由真实读档读取`);
      ok(!Object.prototype.hasOwnProperty.call(loadedLegacy, semanticField), `C08/${oldState}: loadAsync 同样不登记未知 schema`);
      eq(JSON.stringify([...rows]), rawRowsBefore, `C08/${oldState}: 真实读档不修复或覆盖后端未知原文`);
      // 仅将未知原文作为语义夹具复挂供只读 API 比对；不宣称 restore 保留未知 schema 字段。
      await exercise('C08', `C08/${oldState}-semantic-fixture-only`, actualRestore, raw, ['refuseLoadRefresh', 'refuseResult', 'refuseOutput']);
    }
    const first = await Progress.loadAsync(1), second = await Progress.loadAsync(2), firstBefore = first.exportSave(), secondBefore = second.exportSave();
    eq(first.enhance!.instances[0].instanceRef, second.enhance!.instances[0].instanceRef, 'C08 两档刻意使用相同引用文本');
    ok(first.stones !== second.stones && first.count('beast_core') !== second.count('beast_core'), 'C08 两档资产刻意不同');
    await exercise('C08', 'C08/cross-slot-same-reference', first, { foreignRef: second.enhance!.instances[0].instanceRef, sourceSlot: 2 }, ['refuseSubmit', 'refuseLoadRefresh'], true);
    eq(first.exportSave(), firstBefore, 'C08 A 档资产与完整结果隔离保留');
    eq(second.exportSave(), secondBefore, 'C08 B 档资产与完整结果隔离保留');
    Progress.setActiveSlot(1);
    const gateBefore = base.exportSave(), forge = new ForgeGate(base), gate = new EnhanceGate(base), enchantGate = new EnchantGate(base);
    eq(forge.entrance().allowed, true, 'C09 既有正式打造入口保持开放');
    eq(gate.entrance().allowed, true, 'C09 既有正式强化入口保持开放');
    eq(gate.laterService(), EnhanceClosed.refuseLaterService(), 'C09 强化窗混入分解仍用 enhance.closed.later_service');
    eq(enchantGate.entrance().allowed, true, 'C09 附灵 soft-open 入口保持开放');
    eq(enchantGate.laterService(), EnchantClosed.refuseLaterService(), 'C09 附灵窗混入分解仍用 enchant.closed.later_service');
    eq(forge.laterService(), ForgeClosed.refuseLaterService(), 'C09 既有打造 laterService 提示不回退');
    eq(base.exportSave(), gateBefore, 'C09 三既有 Gate 只读入口不改完整旧资产');
    await exercise('C09', 'C09/three-formal-flags-open-and-layered-tips', base, { forgeOpen: true, enhanceOpen: true, enchantOpen: true, salvageOpen: false,
      protectCharm: copy(protectCharmMap), productionFixtureInjection: false }, ['featureClosed', 'refuseEntrance', 'refuseSalvage']);
    await exercise('C10', 'C10/later-service-and-all-eight-refusals', base, { service: 'after-salvage',
      process: 'not-created', requestLog: [], resultLog: [], dedupLog: [], delayedQueue: [] }, Object.keys(apiTips) as ApiName[], true);
    for (const [caseId, row] of Object.entries(cases)) ok(row.fixtures > 0 && row.invocations > 0 && row.evidenceKeys.length > 0, `${caseId}: 已执行且有明确旁证索引`);
    eq(featureFlags(), globalsBefore, 'features 全程保持原状态');
    eq([sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens], [0, 0, 0, 0], '全部关态动作写入、排队、存储及 IDB 打开 0');
    eq([isForgeOpenForFixture(), isEnhanceOpenForFixture(), isEnchantOpenForFixture(), isSalvageOpenForFixture()], [true, true, true, false], '三既有 true 与分解 false 保留');
    return { passed: true, assertions, fixtures, invocations, cases, payloads,
      dataMode: options.dataMode, graph: options.graph, freshSsrRefresh: options.graph === 'fresh-ssr-refresh',
      salvageClosedTipsWired: true, SalvageOpenFlag: false, softOpenedSalvage: false, released: false,
      refineStoneMapped: true, refineStoneMappedMeaning: 'items/materials 与有效 ITEMS 仅登记齐；不表示分解消费者、存档/事务或生产放行',
      enchantSoftOpenPreserved: true, EnhanceOpenFlagPreserved: true, protectCharmSoftOpenPreserved: true,
      ForgeOpenFlag: true, EnhanceOpenFlag: true, EnchantOpenFlag: true,
      sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens, ordinarySaveSetupWrites, storageReads,
      storageScope: 'storageWrites=关态 API/读档动作；ordinarySaveSetupWrites=仅 C08 准备阶段的普通 saveAsync',
      semanticFixtureOnly: true, salvageSchemaAdded: false, unknownFieldsRetainedByRestore: false,
      formalSourceSeed: '已有正式 forge/enhance/enchant 完整事实 schema 的显式测试 seed，不执行新结算',
      openFixtureTableExecuted: false, concurrencyScope: '同一 SSR realm 的零参数 tip 调用 Promise.all 拒绝；不宣称分解 Gate/资格校验/事务并发实现' };
  } finally {
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (localStorageBefore) Object.defineProperty(globalThis, 'localStorage', localStorageBefore); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (indexedDbBefore) Object.defineProperty(globalThis, 'indexedDB', indexedDbBefore); else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}
