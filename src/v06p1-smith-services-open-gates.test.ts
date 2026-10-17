// design/32 O02–O09: real Controller -> SmithServices -> formal Gates.
// These isolated saves never grant production UI release or salvage fixture authority.
import rules from '@xt/balance/enhance.json';
import recipes from '@xt/balance/recipes.json';
import charm from '@xt/balance/enhance_protect_charm.json';
import { ITEMS, t } from './data';
import { Progress } from './Progress';
import { SmithServices, type SmithService, type SmithRequests, type SmithGateResult } from './SmithServices';
import { SmithServicesController, type SmithPending } from './SmithServicesController';
import { ForgeGate } from './ForgeGate';
import { EnhanceGate } from './EnhanceGate';
import { EnchantGate } from './EnchantGate';
import { SalvageGate } from './SalvageGate';
import { resolveFormalInventoryEquipBinding } from './EquipInstBinding';
import { setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';
import { featureEnabled } from './features';

type Row = Record<string, unknown>;
export interface SmithOpenCase {
  executed: true; passed: boolean; blocked?: string; evidenceKeys: string[]; evidence: Row;
}
const clone = <T>(value: T): T => structuredClone(value);
let assertions = 0;
const equal = (actual: unknown, expected: unknown, label: string) => {
  assertions++;
  if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${label}: actual=${JSON.stringify(actual)} expected=${JSON.stringify(expected)}`);
};
function assert(value: unknown, label: string): asserts value { assertions++; if (!value) throw new Error(label); }
let sequence = 0;
const recipe = recipes.recipes.find(row => row.type === 'forge')!;
const requestId = (label: string) => `smith_open_${label}_${++sequence}`;

/** The backend is isolated test storage; all serialization/transactions still use Progress/SaveStore. */
export function installSmithMemoryBackend() {
  const rows = new Map<SlotKey, SaveSlot>();
  let writes = 0;
  setSaveBackend({
    async read(slot) { return rows.has(slot) ? clone(rows.get(slot)!) : null; },
    async write(slot) { writes++; rows.set(slot.slotKey, clone(slot)); },
    async delete(slot) { writes++; rows.delete(slot); },
    async insertIfEmpty(slot) {
      if (rows.has(slot.slotKey)) return false;
      writes++; rows.set(slot.slotKey, clone(slot)); return true;
    },
  });
  return { rows, get writes() { return writes; } };
}

/** Creates sources exclusively through the real default ForgeGate's atomic registration. */
export async function createFormalSmithProgress(options: { slot?: SlotKey; copies?: number } = {}) {
  Progress.setActiveSlot(options.slot ?? 1);
  const progress = new Progress();
  progress.level = 20; progress.rootElement = '金'; progress.stones = 1000000;
  progress.forgingLevel = 3; progress.forgingExp = 7;
  progress.inventory = { [recipe.blueprint!]: 50, spirit_copper: 1000, refine_stone: 1000, beast_core: 50, protect_charm: 50 };
  const refs: string[] = [];
  for (let index = 0; index < (options.copies ?? 1); index++) {
    const forged = await new ForgeGate(progress, { random: () => 0 }).submit({
      craftRequestId: requestId('source'), blueprintId: recipe.blueprint!,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })),
    });
    assert(forged.allowed && forged.result, '正式 ForgeGate 完整生成实例');
    const ref = forged.result.resultItem.instanceRef;
    equal(progress.formalEnhanceInstanceStatus(ref), 'registered', '本档正式来源登记');
    equal(resolveFormalInventoryEquipBinding(progress, { id: recipe.output, instanceRef: ref }),
      { kind: 'verified', instanceRef: ref }, '真实背包 binding 核实位置');
    refs.push(ref);
  }
  assert(await progress.saveAsync(), '正式准备档保存');
  return { progress, refs, blueprintId: recipe.blueprint! };
}

function controller(progress: Progress) {
  const tips: string[] = [];
  return { ui: new SmithServicesController(progress, { tip: key => tips.push(key), currentProgress: () => progress }), tips };
}
function prepare(progress: Progress, service: SmithService, selected: string, options: { element?: '金' | '木' | '水' | '火' | '土'; protect?: boolean } = {}) {
  const ctx = controller(progress);
  assert(ctx.ui.guardEntrance() && ctx.ui.openMenu() && ctx.ui.openService(service), `${service} 完整菜单入口`);
  assert(ctx.ui.select(selected), `${service} 明确选择正式候选`);
  if (service === 'enchant' && options.element) assert(ctx.ui.selectElement(options.element), '明确选择合法五行');
  if (service === 'enhance' && options.protect !== undefined) assert(ctx.ui.setProtectCharm(options.protect), '明确选择护符模式');
  return ctx;
}
const readGate = (progress: Progress, pending: SmithPending): SmithGateResult => {
  switch (pending.service) {
    case 'forge': return new ForgeGate(progress).result((pending.request as SmithRequests['forge']).craftRequestId);
    case 'enhance': return new EnhanceGate(progress).level((pending.request as SmithRequests['enhance']).enhanceRequestId);
    case 'enchant': return new EnchantGate(progress).result((pending.request as SmithRequests['enchant']).enchantRequestId);
    case 'salvage': return new SalvageGate(progress).result((pending.request as SmithRequests['salvage']).salvageRequestId);
  }
};
async function withRandom<T>(value: number, action: () => Promise<T>): Promise<{ value: T; calls: number }> {
  const original = Math.random; let calls = 0;
  Math.random = () => { calls++; return value; };
  try { return { value: await action(), calls }; } finally { Math.random = original; }
}
function fullResult(value: SmithGateResult | null) {
  assert(value && 'result' in value && value.result, '必须核实 Gate 完整已提交结果');
  return value.result;
}
async function saveHash(save: Row): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(JSON.stringify(save)));
  return Array.from(new Uint8Array(digest), byte => byte.toString(16).padStart(2, '0')).join('');
}
async function commit(progress: Progress, service: SmithService, selected: string,
  options: { element?: '金' | '木' | '水' | '火' | '土'; protect?: boolean; random?: number } = {}) {
  const ctx = prepare(progress, service, selected, options), before = clone(progress.exportSave());
  const pending = ctx.ui.requestConfirm();
  assert(pending, `${service} 只读确认成功: ${ctx.tips.join(',')}`);
  equal(progress.exportSave(), before, '选择和确认不写业务资产/请求/结果');
  const settled = await withRandom(options.random ?? 0, () => ctx.ui.submit(pending));
  const result = fullResult(settled.value), direct = readGate(progress, pending);
  equal(fullResult(direct), result, `${service} Controller 完整结果与真实 Gate 读取相同`);
  equal(ctx.ui.state.stage, 'result', `${service} 完整结果才进入结果面板`);
  assert(ctx.ui.state.resultLines.length > 0 && ctx.ui.state.resultLines.every(line => !/NaN|null|undefined|\{\w+\}/u.test(line)), '结果文案占位符完整');
  const resultLines = ctx.ui.state.resultLines;
  ctx.ui.back(); equal(ctx.ui.state.stage, 'panel', '结果返回原面板');
  ctx.ui.back(); equal(ctx.ui.state.stage, 'menu', '原面板返回菜单');
  return { ...ctx, pending, result, resultLines, randomCalls: settled.calls, before };
}

/** No copied formulas: expected costs and display fields come from each complete Gate result. */
export async function runGateOpenCases(_options?: unknown): Promise<{ cases: Record<string, SmithOpenCase>; assertions: number }> {
  assertions = 0;
  const backend = installSmithMemoryBackend(), originalSlot = Progress.getActiveSlot();
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  let localWrites = 0;
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null, setItem() { localWrites++; }, removeItem() { localWrites++; },
  } });
  const cases: Record<string, SmithOpenCase> = {};
  const mark = (id: string, evidence: Row, blocked?: string) => {
    cases[id] = { executed: true, passed: !blocked, ...(blocked ? { blocked } : {}), evidenceKeys: Object.keys(evidence).map(key => `${id}.${key}`), evidence };
  };
  const unchanged = async <T>(p: Progress, action: () => T | Promise<T>, label: string) => {
    const before = clone(p.exportSave()), stored = clone([...backend.rows]), writes = backend.writes;
    const value = await action();
    equal(p.exportSave(), before, `${label} 整档无半扣半发半销毁`);
    equal([...backend.rows], stored, `${label} 原始存储不变`);
    equal(backend.writes, writes, `${label} 无新增保存`);
    return value;
  };
  try {
    assert(featureEnabled('indexedDbSaves'), '使用正式异步事务路径');
    {
      const { progress: p, blueprintId } = await createFormalSmithProgress({ copies: 0 });
      const forge = await commit(p, 'forge', blueprintId);
      assert('craftRequestId' in forge.result, 'Gate 返回正式打造结果');
      const result = forge.result;
      equal(p.permanentCount(result.blueprintId), Number(forge.before.inventory && Reflect.get(forge.before.inventory, result.blueprintId)) - result.blueprintCount, '按 Gate 实际图纸成本扣除');
      for (const material of result.materials) equal(p.permanentCount(material.itemId),
        Number(Reflect.get(forge.before.inventory as object, material.itemId)) - material.count, '按 Gate 实际材料扣除一次');
      equal(p.permanentCount(result.resultItem.itemId), result.resultItem.count, '完整 Gate 产物数量入库');
      equal(p.formalEnhanceInstanceStatus(result.resultItem.instanceRef), 'registered', '完整正式成品登记');
      equal(forge.resultLines[0], t('ui.smith.result_forge', { item: `${ITEMS[result.resultItem.itemId].name} ×${result.resultItem.count}`, quality: t(`forge.grade.${result.resultGrade}`) }), '打造结果品质/数量来自 Gate');
      equal([p.forgingLevel, p.forgingExp], [3, 7], 'UI 不另写锻造经验');
      equal(forge.randomCalls, 1, '唯一 Gate 抽样一次');
      mark('O02', { controllerGateRoundtrip: { request: forge.pending.request, result, resultLines: forge.resultLines, formalInstanceRegistered: true, returnedToMenu: true, randomCalls: forge.randomCalls, uiExtraExp: 0 } });
    }
    {
      const { progress: p, refs } = await createFormalSmithProgress();
      const rows: Row[] = [];
      for (const [protect, random] of [[false, 0], [false, 0.999999], [true, 0], [true, 0.999999]] as const) {
        const settled = await commit(p, 'enhance', refs[0], { protect, random });
        assert('enhanceRequestId' in settled.result, '完整强化结果');
        const r = settled.result;
        equal(p.stones, Number(settled.before.stones) - r.stones, '强化费用来自 Gate 完整结果');
        equal(p.permanentCount('refine_stone'), Number(Reflect.get(settled.before.inventory as object, 'refine_stone')) - r.refineStones, '精炼石扣实际成本');
        equal(p.permanentCount(charm.itemId), Number(Reflect.get(settled.before.inventory as object, charm.itemId)) - (r.useProtectCharm ? charm.countPerSettlement : 0), '护符只在明确选择时扣除');
        equal(p.formalEnhanceInstances()[0].enhanceLevel, r.finalLevel, '最终级沿 Gate');
        equal(r.success, random === 0, '概率失败作为已结算结果');
        equal(settled.randomCalls, 1, '强化结算仅抽一次');
        equal(settled.resultLines[0], t(r.success ? 'ui.smith.result_enhance_ok' : 'ui.smith.result_enhance_fail', { item: ITEMS[r.itemId].name, before: r.fromLevel, after: r.finalLevel }), '强化成功/失败文字沿完整结果');
        rows.push({ result: r, request: settled.pending.request, resultLines: settled.resultLines, returnedToMenu: true });
      }
      while (p.formalEnhanceInstances()[0].enhanceLevel < 5) await commit(p, 'enhance', refs[0]);
      const protectedFailure = await commit(p, 'enhance', refs[0], { protect: true, random: 0.999999 });
      assert('enhanceRequestId' in protectedFailure.result && !protectedFailure.result.success && protectedFailure.result.dropOnFail, '掉级档概率失败确已结算');
      equal(protectedFailure.result.finalLevel, protectedFailure.result.fromLevel, '真实护符保持原级');
      assert(protectedFailure.resultLines.includes(t('ui.smith.result_protected')), '保护结果只在 Gate 已证实消费并保级后显示');
      rows.push({ protectedDropFailure: protectedFailure.result, resultLines: protectedFailure.resultLines });
      const dropped = await commit(p, 'enhance', refs[0], { protect: false, random: 0.999999 });
      assert('enhanceRequestId' in dropped.result && !dropped.result.success, '无符失败完整结果');
      equal(p.formalEnhanceInstances()[0].enhanceLevel, dropped.result.finalLevel, '无符掉级不由 UI 重算');
      rows.push({ unprotectedDropFailure: dropped.result, resultLines: dropped.resultLines });
      while (p.formalEnhanceInstances()[0].enhanceLevel < rules.maxLevel) await commit(p, 'enhance', refs[0]);
      const max = prepare(p, 'enhance', refs[0]);
      const pending = await unchanged(p, () => max.ui.requestConfirm(), '满级拒绝');
      equal(pending, null, '满级不能提交下一档');
      equal(max.tips[max.tips.length - 1], 'enhance.formal.max_level', '满级独立提示');
      mark('O03', { completeRoundtrips: rows, maxLevelRefusal: { level: rules.maxLevel, tipKey: max.tips[max.tips.length - 1], fullBusinessDelta: 0 }, gateSettlementOnly: true });
    }
    {
      const { progress: p, refs } = await createFormalSmithProgress();
      const rounds: Row[] = [];
      for (const element of ['金', '木', '水', '火', '土'] as const) {
        const settled = await commit(p, 'enchant', refs[0], { element });
        assert('enchantRequestId' in settled.result, '完整附灵结果');
        const r = settled.result;
        equal(p.stones, Number(settled.before.stones) - r.stones, '附灵灵石成本沿 Gate');
        equal(p.enchant!.instances.length, 1, '不同元素覆盖保持一个当前附着');
        equal(p.enchant!.instances[0].element, r.element, '当前元素与完整 Gate 结果相同');
        equal(p.enchant!.instances[0].attributes, r.attributes, '属性仅正式覆盖一次');
        for (const material of r.materials) equal(p.permanentCount(material.itemId), Number(Reflect.get(settled.before.inventory as object, material.itemId)) - material.count, '附灵材料按完整结果扣一次');
        equal(settled.resultLines[0], t('ui.smith.result_enchant', { item: ITEMS[r.itemId].name, element: r.element }), '附灵结果文字来自 Gate');
        equal(settled.randomCalls, 0, '附灵无 UI 重抽');
        rounds.push({ request: settled.pending.request, result: r, resultLines: settled.resultLines, returnedToMenu: true });
      }
      const same = prepare(p, 'enchant', refs[0], { element: '土' });
      equal(await unchanged(p, () => same.ui.requestConfirm(), '同元素拒绝'), null, '同元素不建提交确认');
      equal(same.tips[same.tips.length - 1], 'ui.smith.same_element', '同元素独立提示');
      const stale = prepare(p, 'enchant', refs[0], { element: '金' });
      const pending = stale.ui.requestConfirm(); assert(pending, '过期目标准备确认');
      await commit(p, 'enchant', refs[0], { element: '木' });
      equal(await unchanged(p, () => stale.ui.submit(pending), '已变化附灵目标'), null, '旧确认不沿用');
      equal(stale.tips[stale.tips.length - 1], 'ui.smith.changed', '状态变化明确重新确认');
      mark('O04', { fiveElementsAndOverwrite: rounds, sameElementRefused: { tipKey: same.tips[same.tips.length - 1], fullBusinessDelta: 0 }, staleTargetRefused: { tipKey: stale.tips[stale.tips.length - 1], fullBusinessDelta: 0 }, noLayerStacking: true });
    }
    {
      const { progress: p, refs } = await createFormalSmithProgress();
      const ui = prepare(p, 'salvage', refs[0]);
      equal(await unchanged(p, () => ui.ui.requestConfirm(), '正式分解资格未齐'), null, '分解资格不齐不能确认');
      const source = p.enhance!.formalSources![0], craft = p.forge!.crafts.find(row => row.craftResultRef === source.craftResultRef)!;
      const request: SmithRequests['salvage'] = { salvageRequestId: requestId('salvage_blocked'), instanceRef: refs[0], fromGrade: craft.resultGrade, fromEnhanceLevel: 0 };
      const direct = await unchanged(p, () => new SalvageGate(p).submit(request), '正式 Gate 分解整拒');
      assert(!direct.allowed && direct.tipKey === 'salvage.fixture.qualification', '保留 Gate 正式资格拒绝');
      const adapter = await unchanged(p, () => new SmithServices(p).select('salvage', request), '分解适配层整拒');
      equal(adapter.allowed, false, '适配层不绕过分解资格');
      mark('O05', { O05_blocked_formal_qualification: { request, gate: direct, uiTipKey: ui.tips[ui.tips.length - 1], formalIdentity: 'registered', exactInventoryBinding: resolveFormalInventoryEquipBinding(p, { id: craft.resultItem.itemId, instanceRef: refs[0] }), missingEvidence: ['production-bound-lifeblood-qualification', 'complete-related-enchant-retirement', 'production-atomic-carrier'], fullBusinessDelta: 0, completeSuccessClaimed: false, fixtureQualificationInjected: false, fixtureCarrierInstalled: false } }, 'O05_blocked_formal_qualification');
    }
    {
      const refusals: Row[] = [];
      for (const [label, service, mutate, expected] of [
        ['missing-blueprint', 'forge', (p: Progress) => { p.inventory[recipe.blueprint!] = 0; }, ['ui.smith.no_recipe', 'talisman.material_lack']],
        ['missing-material', 'forge', (p: Progress) => { p.inventory.spirit_copper = 0; }, ['talisman.material_lack']],
        ['missing-stones', 'enhance', (p: Progress) => { p.stones = 0; }, ['enhance.formal.resources', 'ui.shop.not_enough']],
        ['missing-refine', 'enhance', (p: Progress) => { p.inventory.refine_stone = 0; }, ['enhance.formal.resources', 'talisman.material_lack']],
        ['missing-charm', 'enhance', (p: Progress) => { p.inventory.protect_charm = 0; }, ['ui.smith.charm_short']],
        ['enchant-missing-stones', 'enchant', (p: Progress) => { p.stones = 0; }, ['ui.shop.not_enough']],
        ['enchant-missing-material', 'enchant', (p: Progress) => { p.inventory.beast_core = 0; }, ['talisman.material_lack']],
      ] as const) {
        const { progress: p, refs, blueprintId } = await createFormalSmithProgress(); mutate(p);
        const ctx = prepare(p, service, service === 'forge' ? blueprintId : refs[0], { element: service === 'enchant' ? '火' : undefined, protect: service === 'enhance' ? true : undefined });
        const pending = await unchanged(p, () => ctx.ui.requestConfirm(), label);
        equal(pending, null, `${label} 不建可提交确认`);
        assert(expected.some(key => key === ctx.tips[ctx.tips.length - 1]), `${label} 正确分层 tip: ${ctx.tips[ctx.tips.length - 1]}`);
        refusals.push({ label, tipKey: ctx.tips[ctx.tips.length - 1], fullBusinessDelta: 0 });
      }
      const { progress: invalid, refs } = await createFormalSmithProgress();
      const invalidRequests = [
        { label: 'item-id-is-not-instance', service: 'enhance' as const, request: { enhanceRequestId: requestId('itemid'), instanceRef: recipe.output, fromLevel: 0, to: 1, useProtectCharm: false } },
        { label: 'illegal-element', service: 'enchant' as const, request: { enchantRequestId: requestId('element'), instanceRef: refs[0], fromElement: null, element: 'invalid' } },
        { label: 'unknown-quality', service: 'salvage' as const, request: { salvageRequestId: requestId('grade'), instanceRef: refs[0], fromGrade: 'unknown', fromEnhanceLevel: 0 } },
      ];
      for (const row of invalidRequests) {
        const services = new SmithServices(invalid);
        const reply = await unchanged(invalid, () => Reflect.apply(services.select, services, [row.service, row.request]), row.label);
        equal(reply.allowed, false, `${row.label} 整拒`);
        assert(reply.tipKey && !reply.tipKey.includes('later_service'), '非法请求不串旧服务提示');
        refusals.push({ label: row.label, tipKey: reply.tipKey, gate: reply.gate, fullBusinessDelta: 0 });
      }
      const { progress: badType, refs: badRefs } = await createFormalSmithProgress();
      badType.enhance!.instances[0].type = 'armor'; // Deliberately corrupt an existing source; never grant a new source.
      const badRequest: SmithRequests['enhance'] = { enhanceRequestId: requestId('bad_type'), instanceRef: badRefs[0], fromLevel: 0, to: 1, useProtectCharm: false };
      const badReply = await unchanged(badType, () => new SmithServices(badType).select('enhance', badRequest), '非法类型整拒');
      assert(!badReply.allowed && badReply.tipKey === 'enhance.formal.bad_type', '合法本档引用不能把武器伪装防具');
      refusals.push({ label: 'illegal-formal-equipment-type', tipKey: badReply.tipKey, gate: badReply.gate, fullBusinessDelta: 0 });
      const { progress: full, blueprintId } = await createFormalSmithProgress({ copies: 0 });
      full.inventory[recipe.output] = Number.MAX_SAFE_INTEGER;
      const cap = prepare(full, 'forge', blueprintId), pending = cap.ui.requestConfirm(); assert(pending, '实际整数承载边界保留只读确认');
      const outcome = await unchanged(full, () => cap.ui.submit(pending), '成品无法完整承载');
      assert(outcome && !outcome.allowed && outcome.tipKey === 'forge.fixture.capacity', '真实安全整数承载拒绝');
      equal(cap.ui.state.stage, 'panel', '承载拒绝不展示成功');
      refusals.push({ label: 'actual-inventory-overflow', gate: outcome, tipKey: cap.tips[cap.tips.length - 1], fullBusinessDelta: 0, finiteSlotsExistInProduction: false });
      mark('O07', { refusals, qualificationRefusal: cases.O05.evidence.O05_blocked_formal_qualification,
        formalCharmMappingRead: { itemId: charm.itemId, countPerSettlement: charm.countPerSettlement },
        mappingAnomalyGraph: 'O07.invalidProtectMappingIsolatedGraph (separate runner graph; disk mapping preserved)',
        capacityScope: '生产背包无有限格数；实际整数溢出已拒绝，有限格数满包不伪造正式支持' });
    }
    {
      const replayRows: Row[] = [];
      for (const service of ['forge', 'enhance', 'enchant'] as const) {
        const { progress: p, refs, blueprintId } = await createFormalSmithProgress();
        const settled = await commit(p, service, service === 'forge' ? blueprintId : refs[0], { element: '火' });
        assert(await p.saveAsync(), '提交后正式保存');
        const loaded = await Progress.loadAsync(1);
        equal(loaded.storageError, undefined, '真实 loadAsync 读取完整合法档');
        equal([loaded.inventory, loaded.stones, loaded.forge, loaded.enhance, loaded.enchant, loaded.salvage],
          [p.inventory, p.stones, p.forge, p.enhance, p.enchant, p.salvage], '读档资产和服务完整事实相同');
        const ui = controller(loaded); assert(ui.ui.openMenu() && ui.ui.openService(service), '读档经 Controller 再开对应面板');
        await unchanged(loaded, () => ui.ui.refresh(), `${service} 读档刷新只读`);
        const services = new SmithServices(loaded), request = settled.pending.request;
        const oldRead = await withRandom(0, () => unchanged(loaded, () => Reflect.apply(services.result, services, [service, request]), `${service} 原请求适配读取`));
        equal(oldRead.calls, 0, '适配层旧结果读取实际随机调用零次');
        const old = oldRead.value;
        assert(old.allowed && old.replayed, '匹配请求只读返回旧结果');
        equal(old.result, settled.result, '完整旧结果逐字段相同');
        const conflicting = { ...request, ...(service === 'forge' ? { materials: [] } : service === 'enhance' ? { useProtectCharm: true } : { element: '水' }) };
        const collisionRead = await withRandom(0, () => unchanged(loaded, () => Reflect.apply(services.result, services, [service, conflicting]), `${service} 同 id 改载荷`));
        equal(collisionRead.calls, 0, '同 id 冲突读取实际随机调用零次');
        const collision = collisionRead.value;
        equal(collision.allowed, false, '同 id 改载荷不能冒认成功');
        const replayRead = await withRandom(0, () => unchanged<SmithGateResult>(loaded, () => {
            if (service === 'forge') return new ForgeGate(loaded).submit(request as SmithRequests['forge']);
            if (service === 'enhance') return new EnhanceGate(loaded).submit(request as SmithRequests['enhance']);
            return new EnchantGate(loaded).submit(request as SmithRequests['enchant']);
          }, `${service} Gate 原请求重放`));
        const replay = replayRead.value;
        equal(replayRead.calls, 0, '旧请求重放实际随机调用零次');
        equal(fullResult(replay), settled.result, '唯一 Gate 返回同一个完整旧结果');
        equal('replayed' in replay && replay.replayed, true, '业务去重明确为重放');
        replayRows.push({ service, request, result: old.result, conflictingTipKey: collision.tipKey, replayed: true, fullBusinessDelta: 0,
          duplicateRandomCalls: replayRead.calls, resultReadRandomCalls: oldRead.calls, conflictReadRandomCalls: collisionRead.calls,
          persistedReloaded: true, controllerRefresh: true });
      }
      mark('O08', { replayedServices: replayRows, salvageReplayBlocked: { reason: 'O05_blocked_formal_qualification', submitted: false, completeSuccessClaimed: false }, noSecondDeductionOrDraw: true }, 'O08_salvage_submit_reload_replay_blocked_by_O05');
    }
    {
      const raceRows: Row[] = [];
      for (const service of ['forge', 'enhance', 'enchant'] as const) {
        const { progress: p, refs, blueprintId } = await createFormalSmithProgress();
        const ctx = prepare(p, service, service === 'forge' ? blueprintId : refs[0], { element: '火' });
        const pending = ctx.ui.requestConfirm(); assert(pending, '并发明确确认');
        const before = clone(p.exportSave());
        const answers = await withRandom(0, () => Promise.all(Array.from({ length: 8 }, () => ctx.ui.submit(pending))));
        const result = answers.value.find(row => row && 'result' in row && row.result);
        assert(result, '同请求连点至少一次完整结果');
        equal(answers.value.filter(row => row && 'result' in row && row.result).length, 1, 'Controller 同请求连点只委托一次成功');
        equal(answers.calls, service === 'enchant' ? 0 : 1, '连点不重抽');
        assert(ctx.tips.includes('ui.smith.busy'), '连点忙提示');
        const r = fullResult(result);
        if ('craftRequestId' in r) equal(p.forge!.crafts.length, (before.forge ? Reflect.get(before.forge as object, 'crafts').length : 0) + 1, '只增加一次打造事实');
        if ('enhanceRequestId' in r) equal(p.enhance!.enhancements.length, 1, '只增加一次强化事实');
        if ('enchantRequestId' in r) equal(p.enchant!.enchantments.length, 1, '只增加一次附灵事实');
        raceRows.push({ service, scenario: 'same-request-eight-clicks', accepted: 1, busyTips: ctx.tips.filter(key => key === 'ui.smith.busy').length, randomCalls: answers.calls, result: r });
      }
      for (const service of ['enhance', 'enchant'] as const) {
        const { progress: p, refs } = await createFormalSmithProgress();
        const contenders = Array.from({ length: 3 }, (_, index) => {
          const ctx = prepare(p, service, refs[0], { element: (['金', '水', '火'] as const)[index] });
          const pending = ctx.ui.requestConfirm(); assert(pending, '同实例不同请求确认'); return { ctx, pending };
        });
        const answers = await withRandom(0, () => Promise.all(contenders.map(row => row.ctx.ui.submit(row.pending))));
        equal(answers.value.filter(row => row && 'result' in row && row.result).length, 1, '同实例多请求仅一个提交成立');
        equal(service === 'enhance' ? p.enhance!.enhancements.length : p.enchant!.enchantments.length, 1, '不覆盖新状态/叠层');
        raceRows.push({ service, scenario: 'same-instance-three-intents', accepted: 1, rejected: 2, results: answers.value });
      }
      {
        const { progress: p, refs } = await createFormalSmithProgress({ copies: 2 });
        p.stones = rules.enchant.cost.stones; assert(await p.saveAsync(), '共享资源准备持久档');
        const contenders = refs.map((ref, index) => {
          const ctx = prepare(p, 'enchant', ref, { element: index ? '火' : '水' }), pending = ctx.ui.requestConfirm();
          assert(pending, '共享资源同条件确认'); return { ctx, pending };
        });
        const answers = await Promise.all(contenders.map(row => row.ctx.ui.submit(row.pending)));
        equal(answers.filter(row => row && 'result' in row && row.result).length, 1, '共享仅一份灵石不负库存');
        equal(p.stones, 0, '共享资源恰好扣一次');
        equal(p.enchant!.enchantments.length, 1, '只有所选一个正式实例附灵');
        raceRows.push({ scenario: 'two-formal-instances-shared-stones', accepted: 1, finalStones: p.stones, results: answers });
      }
      {
        const { progress: p, refs, blueprintId } = await createFormalSmithProgress();
        p.inventory.refine_stone = 1; assert(await p.saveAsync(), '跨服务共用精炼石准备');
        const forge = prepare(p, 'forge', blueprintId), enhance = prepare(p, 'enhance', refs[0]);
        const forgePending = forge.ui.requestConfirm(), enhancePending = enhance.ui.requestConfirm(); assert(forgePending && enhancePending, '跨服务各自只读确认');
        const answers = await withRandom(0, () => Promise.all([forge.ui.submit(forgePending), enhance.ui.submit(enhancePending)]));
        equal(answers.value.filter(row => row && 'result' in row && row.result).length, 1, '跨服务共享材料仅一笔提交');
        equal(p.permanentCount('refine_stone'), 0, '跨服务库存不为负');
        raceRows.push({ scenario: 'forge-enhance-shared-refine-stone', accepted: 1, finalRefineStones: 0, results: answers.value });
      }
      {
        const { progress: p, refs, blueprintId } = await createFormalSmithProgress({ copies: 0 });
        p.inventory[recipe.output] = Number.MAX_SAFE_INTEGER - 1;
        const first = prepare(p, 'forge', blueprintId), second = prepare(p, 'forge', blueprintId);
        const left = first.ui.requestConfirm(), right = second.ui.requestConfirm(); assert(left && right, '真实容量竞争确认');
        const answers = await withRandom(0, () => Promise.all([first.ui.submit(left), second.ui.submit(right)]));
        equal(answers.value.filter(row => row && 'result' in row && row.result).length, 1, '一份安全整数容量仅一笔成品');
        equal(p.permanentCount(recipe.output), Number.MAX_SAFE_INTEGER, '容量不溢出');
        equal(refs.length, 0, '容量测试无伪造实例');
        raceRows.push({ scenario: 'shared-actual-output-capacity', accepted: 1, finalQuantity: p.permanentCount(recipe.output), results: answers.value });
      }
      {
        const { progress: p, refs } = await createFormalSmithProgress();
        const ctx = prepare(p, 'enhance', refs[0]), pending = ctx.ui.requestConfirm(); assert(pending, '装备操作竞争准备');
        const operation = ctx.ui.submit(pending);
        const equip = p.equipItem(recipe.output, refs[0]);
        const settled = await operation;
        assert(settled && 'result' in settled && settled.result, '既有装备写入拒绝不损坏完整强化提交');
        equal(equip, { ok: false, reason: 'save' }, '现有同步装备写入在 IDB 模式整拒回滚');
        equal(p.equip[ITEMS[recipe.output].slot!], undefined, '同步装备竞争不留下半位置');
        equal(resolveFormalInventoryEquipBinding(p, { id: recipe.output, instanceRef: refs[0] }).kind, 'verified', '原本档背包实例保持可核实');
        raceRows.push({ scenario: 'existing-equip-operation-competition', equipResult: equip, enhanceResult: settled, exactBindingPreserved: true });
      }
      const staleWriterGaps: Row[] = [];
      for (const staleService of ['forge', 'enhance'] as const) {
        const { progress: fresh, refs, blueprintId } = await createFormalSmithProgress();
        const stale = await Progress.loadAsync(1);
        equal(stale.storageError, undefined, '同槽真实 loadAsync 创建第二对象');
        // loadAsync also advances ordinary age/daily metadata; compare the complete service assets here.
        equal([stale.inventory, stale.stones, stale.forge, stale.enhance, stale.enchant, stale.salvage],
          [fresh.inventory, fresh.stones, fresh.forge, fresh.enhance, fresh.enchant, fresh.salvage],
          '两个对象开始于相同库存/费用/四服务完整事实');
        const oldUi = prepare(stale, staleService, staleService === 'forge' ? blueprintId : refs[0]);
        const oldIntent = oldUi.ui.requestConfirm(); assert(oldIntent, '旧对象先完成只读确认');
        const newUi = prepare(fresh, 'enchant', refs[0], { element: '火' });
        const newIntent = newUi.ui.requestConfirm(); assert(newIntent, '新对象正式附灵确认');
        const freshResult = await newUi.ui.submit(newIntent);
        assert(freshResult?.allowed && 'result' in freshResult && freshResult.result, '新对象附灵已完整提交');
        const beforeOld = clone(backend.rows.get(1)!.data);
        assert(beforeOld.enchant, '旧 writer 前存储具有完整附灵结果');
        const staleAttempt = await withRandom(0, () => oldUi.ui.submit(oldIntent));
        const afterOld = clone(backend.rows.get(1)!.data);
        // Reproduce the existing Gate boundary defect explicitly; this observation is BLOCKED, never PASS.
        assert(staleAttempt.value?.allowed && 'result' in staleAttempt.value && staleAttempt.value.result,
          '已知缺口：旧对象 Gate 仍返回完整提交');
        equal(afterOld.enchant, undefined, '已知缺口：旧 writer 覆盖新附灵完整事实');
        equal(afterOld.stones, staleService === 'forge' ? 1000000 : 1000000 - rules.levels[0].stones,
          '已知缺口：旧 writer 恢复另一服务已消费灵石');
        assert(afterOld.stones !== fresh.stones, '持久资产与先前完整提交不一致，不能宣称并发安全');
        staleWriterGaps.push({ scenario: `same-slot-stale-${staleService}-overwrites-completed-enchant`, ownerSlot: 1,
          twoRealControllers: true, secondObjectSource: 'Progress.loadAsync(1)',
          currentProgressHooks: 'Each independent Controller is bound to its own Progress object; this diagnoses the formal Gate cross-object boundary.',
          singleGameSceneCurrentProgressBypassClaimed: false,
          freshRequest: newIntent.request, freshResult, staleRequest: oldIntent.request, staleResult: staleAttempt.value,
          beforeOldWriter: { sha256: await saveHash(beforeOld), completeSave: beforeOld },
          afterOldWriter: { sha256: await saveHash(afterOld), completeSave: afterOld },
          restoredSpentStones: true, lostCompletedEnchant: true, safetyPassed: false,
          gateOwnerActionRequired: 'formal cross-object shared-save CAS/serialization; no UI second transaction' });
      }
      mark('O09', { concurrency: raceRows, staleCrossObjectWritersBlocked: staleWriterGaps,
        salvageConcurrencyBlocked: { reason: 'O05_blocked_formal_qualification', submitted: false, completeSuccessClaimed: false },
        uiSecondLedger: false }, 'O09_blocked_stale_forge_and_enhance_overwrite_other_service; O09_salvage_competition_blocked_by_O05');
    }
    equal(localWrites, 0, '开态夹具业务不写旧 localStorage');
    return { cases, assertions };
  } finally {
    Progress.setActiveSlot(originalSlot);
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

/** Invoked only by the runner's separate in-memory invalid protect mapping graph. */
export async function runInvalidProtectMappingCase(_options?: unknown): Promise<{ cases: Record<string, SmithOpenCase>; assertions: number }> {
  assertions = 0;
  const oldSlot = Progress.getActiveSlot(), backend = installSmithMemoryBackend();
  try {
    assert(charm.itemId !== 'protect_charm', '仅隔离 SSR 图故意破坏护符映射');
    const { progress, refs } = await createFormalSmithProgress();
    const ctx = prepare(progress, 'enhance', refs[0], { protect: true }), before = clone(progress.exportSave());
    const stored = clone([...backend.rows]), writes = backend.writes;
    equal(ctx.ui.requestConfirm(), null, '护符映射异常整拒');
    equal(ctx.tips[ctx.tips.length - 1], 'enhance.formal.protect', '沿正式 Gate 映射缺失提示');
    equal(ctx.ui.state.useProtectCharm, true, '映射异常不能静默取消所选护符');
    equal(progress.exportSave(), before, '映射异常无半扣');
    equal([...backend.rows], stored, '映射异常原存档不变');
    equal(backend.writes, writes, '映射异常零保存');
    const gate = new EnhanceGate(progress).enhance({ enhanceRequestId: requestId('mapping'), instanceRef: refs[0], fromLevel: 0, to: 1, useProtectCharm: true });
    assert(!gate.allowed && gate.tipKey === 'enhance.formal.protect', '未绕过正式 protectCharm 校验');
    return { assertions, cases: { O07: { executed: true, passed: true, evidenceKeys: ['O07.invalidProtectMappingIsolatedGraph'], evidence: {
      invalidProtectMappingIsolatedGraph: { testOnlyDependencyInjection: true, productionMappingChanged: false, gate, selectedCharmRetained: true, fullBusinessDelta: 0, persistentWrites: 0 },
    } } } };
  } finally { Progress.setActiveSlot(oldSlot); }
}
