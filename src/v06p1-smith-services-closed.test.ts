// C01–C11 接线关态证据；真实旧 schema seed 不代表新提交/开态 O 表授权。
import type Phaser from 'phaser';
import strings from '@xt/balance/strings_zh.json';
import enhance from '@xt/balance/enhance.json';
import { SmithServices } from './SmithServices';
import { Progress } from './Progress';
import { ForgeGate } from './ForgeGate';
import { EnhanceGate } from './EnhanceGate';
import { EnchantGate } from './EnchantGate';
import { SalvageGate } from './SalvageGate';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import { isSalvageOpenForFixture } from './SalvageOpenFlag';
import { isValidForgeProgress } from './ForgeProgress';
import { isValidEnhanceProgress } from './EnhanceProgress';
import { isValidEnchantProgress } from './EnchantProgress';
import { isValidSalvageProgress } from './SalvageProgress';
import { resolveFormalEquipSlotBinding, resolveFormalInventoryEquipBinding } from './EquipInstBinding';
import { buildInstDisplay } from './EquipInstReadonly';
import { EquipPanel } from './EquipPanel';
import { InventoryPanel } from './InventoryPanel';
import { createIndexedDbBackend, setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';
import { featureEnabled, featureFlags } from './features';
import { GAME_PHASE } from './data';

type Service = 'forge' | 'enhance' | 'enchant' | 'salvage';
type Family = 'Forge' | 'Enhance' | 'Enchant' | 'Salvage';
type Payload = { slot: SlotKey; name: string; save: Record<string, unknown> };
type RouteState = { entrance: boolean; menu: boolean; panels: Record<Service, boolean> };
interface Controls { setRoute(value: RouteState): void; setGate(name: Family, value: boolean): void }
interface CaseEvidence { executed: boolean; passed: boolean; fixtures: number; invocations: number; evidenceKeys: string[] }
type Row = Record<string, unknown>;
const services: Service[] = ['forge', 'enhance', 'enchant', 'salvage'];
const families: Family[] = ['Forge', 'Enhance', 'Enchant', 'Salvage'];
const copy = <T>(value: T): T => JSON.parse(JSON.stringify(value));
const flags = () => [isForgeOpenForFixture(), isEnhanceOpenForFixture(), isEnchantOpenForFixture(), isSalvageOpenForFixture()];
const routeState = (value: boolean): RouteState => ({ entrance: value, menu: value,
  panels: { forge: value, enhance: value, enchant: value, salvage: value } });
const invoke = (router: SmithServices, method: string, ...args: unknown[]): unknown =>
  Reflect.apply(Reflect.get(router, method) as (...values: unknown[]) => unknown, router, args);
const writes = ['save', 'saveAsync', 'persistSoon', 'runSaveTransaction', 'runSaveTransactionAsync',
  'registerFormalEnhanceInstance', 'equipItem', 'unequipSlot', 'addItem', 'removeItem', 'gainEquip',
  'addCraftedItem', 'gainExp', 'gainLifeSkillExp', 'grantRecipe'] as const;

// Phaser 渲染节点替身；真实 E/I 代码、正式 binding 与属性读取均不替换。
function mockScene(): Phaser.Scene {
  const node = (value?: unknown) => {
    const target = { value, children: [] as unknown[], add(child: unknown) { this.children.push(child); return this; },
      destroy() {}, on() { return this; } };
    const proxy: unknown = new Proxy(target, { get(object, name) { return name in object ? Reflect.get(object, name) : () => proxy; } });
    return proxy;
  };
  return { input: { keyboard: { on() {}, off() {} } }, events: { once() {} }, time: { now: 1000 },
    scale: { width: 800, height: 600 }, textures: { exists: () => false }, cache: { json: { get: () => undefined } },
    add: { container: () => node(), text: (_x: unknown, _y: unknown, value: unknown) => node(value),
      graphics: () => node(), zone: () => node(), image: () => node() } } as unknown as Phaser.Scene;
}

export async function runSmithServicesClosedTests(options: {
  dataMode: string; graph: string; controls?: Controls; payloads?: Payload[];
}) {
  let assertions = 0, invocations = 0, fixtures = 0, sentinelCalls = 0, storageWrites = 0,
    localStorageWrites = 0, indexedDbOpens = 0, storageReads = 0, ordinarySaveSetupWrites = 0, setup = true;
  const cases: Record<string, CaseEvidence> = Object.fromEntries(Array.from({ length: 11 }, (_, i) =>
    [`C${String(i + 1).padStart(2, '0')}`, { executed: false, passed: false, fixtures: 0, invocations: 0, evidenceKeys: [] }]));
  const evidence: Row[] = [], rows = new Map<SlotKey, SaveSlot>();
  const eq = (actual: unknown, expected: unknown, label: string) => {
    assertions++;
    if (JSON.stringify(actual) !== JSON.stringify(expected))
      throw new Error(`${label}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  };
  const ok = (value: unknown, label: string) => { assertions++; if (!value) throw new Error(label); };
  const record = (id: string, label: string, fields: Row = {}) => {
    cases[id].executed = true; cases[id].passed = true; cases[id].fixtures++; fixtures++;
    if (!cases[id].evidenceKeys.includes(label)) cases[id].evidenceKeys.push(label);
    evidence.push({ case: id, label, passed: true, ...fields });
  };
  const oldSlot = Progress.getActiveSlot(), oldLocalStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage'),
    oldIndexedDb = Object.getOwnPropertyDescriptor(globalThis, 'indexedDB'), featureBefore = copy(featureFlags());
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: {
    getItem: () => null,
    setItem() { localStorageWrites++; throw new Error('完整炼器服务关态不写 localStorage'); },
    removeItem() { localStorageWrites++; throw new Error('完整炼器服务关态不删 localStorage'); },
    clear() { localStorageWrites++; throw new Error('完整炼器服务关态不清 localStorage'); },
  } });
  Object.defineProperty(globalThis, 'indexedDB', { configurable: true, value: {
    open() { indexedDbOpens++; throw new Error('隔离后端不允许打开 IndexedDB'); },
    deleteDatabase() { indexedDbOpens++; throw new Error('关态不删 IndexedDB'); },
  } });
  const write = () => {
    if (setup) ordinarySaveSetupWrites++;
    else { storageWrites++; throw new Error('炼器服务故意关态禁止保存、队列或去重写入'); }
  };
  setSaveBackend({
    async read(slot) { storageReads++; return rows.has(slot) ? structuredClone(rows.get(slot)!) : null; },
    async write(slot) { write(); rows.set(slot.slotKey, structuredClone(slot)); },
    async delete(slot) { write(); rows.delete(slot); },
    async insertIfEmpty(slot) { write(); if (rows.has(slot.slotKey)) return false; rows.set(slot.slotKey, structuredClone(slot)); return true; },
  });
  const restore = (save: Row) => (Progress as unknown as { restore(value: unknown, persist: boolean): Progress }).restore(copy(save), false);
  const sentinels = (p: Progress) => {
    for (const method of writes) Object.defineProperty(p, method, { configurable: true,
      value() { sentinelCalls++; throw new Error(`只读/关态路径调用写接口 ${method}`); } });
    return p;
  };
  function existingAssets(slot: SlotKey): Progress {
    Progress.setActiveSlot(slot);
    const p = new Progress();
    p.level = 20; p.rootElement = '金'; p.stones = slot === 1 ? 10000 : 12345;
    p.inventory = { bamboo_sword: 1, scroll_ten_thousand_swords: 1, spirit_copper: 5,
      refine_stone: 30, beast_core: slot === 1 ? 5 : 9, protect_charm: 3 };
    p.equip = { weapon: 'bamboo_sword' }; p.forgingLevel = 3; p.forgingExp = 7;
    const forgeLedgerId = 'smithClosedForge', ref = (name: string) => `${forgeLedgerId}:craft:${name}`;
    const refs = ['equipped', 'bagged'].map(name => `${ref(name)}:item`);
    p.forge = { version: 1, ledgerId: forgeLedgerId, crafts: ['equipped', 'bagged'].map((name, index) => ({
      state: 'committed' as const, craftRequestId: name, craftResultRef: ref(name), blueprintId: 'scroll_ten_thousand_swords',
      blueprintCount: 1, materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }],
      resultItem: { itemId: 'bamboo_sword', count: 1, instanceRef: refs[index] }, resultGrade: 'spirit' as const,
    })), receipts: ['equipped', 'bagged'].map(ref) };
    const row = enhance.levels[0], enhanceResultRef = 'smithClosedEnhance:enhance:oldEnhance';
    p.enhance = { version: 1, ledgerId: 'smithClosedEnhance', instances: refs.map((instanceRef, index) => ({
      instanceRef, itemId: 'bamboo_sword', type: 'weapon' as const, enhanceLevel: index === 0 ? 1 : 0,
    })), enhancements: [{ state: 'committed', enhanceRequestId: 'oldEnhance', enhanceResultRef, instanceRef: refs[0],
      itemId: 'bamboo_sword', type: 'weapon', fromLevel: 0, to: 1, rate: row.rate, stones: row.stones,
      refineStones: row.refineStones, dropOnFail: row.dropOnFail, useProtectCharm: true, success: true, finalLevel: 1,
      attributes: { atkRatioOfBase: enhance.statPerLevel.weapon.atkRatioOfBase, defRatioOfBase: 0, hpRatioOfBase: 0, allRatio: 0 } }],
      receipts: [enhanceResultRef], formalSources: refs.map((instanceRef, index) => ({ instanceRef, source: 'forge' as const,
        forgeLedgerId, craftResultRef: ref(index === 0 ? 'equipped' : 'bagged'), ownerSlot: slot })) };
    p.equipInstanceRefs = { weapon: refs[0] };
    const attributes = { elementDamage: enhance.enchant.elementDamage, sameRootBonus: enhance.enchant.sameRootBonus },
      enchantResultRef = 'smithClosedEnchant:enchant:oldEnchant';
    p.enchant = { version: 1, ledgerId: 'smithClosedEnchant', ownerSlot: slot,
      instances: [{ instanceRef: refs[0], itemId: 'bamboo_sword', type: 'weapon', element: '金', attributes }],
      enchantments: [{ state: 'committed', enchantRequestId: 'oldEnchant', enchantResultRef, instanceRef: refs[0],
        itemId: 'bamboo_sword', type: 'weapon', fromElement: null, element: '金', rootElement: '金',
        stones: enhance.enchant.cost.stones, materials: [{ itemId: 'beast_core', count: enhance.enchant.cost.materials[0].count }],
        attributes: copy(attributes), success: true }], receipts: [enchantResultRef] };
    // 已退役的第三件只保留历史；当前库存与 formalSources 均不登记它，不运行分解提交。
    const retiredCraftRef = ref('retired'), retiredRef = `${retiredCraftRef}:item`, salvageResultRef = 'smithClosedSalvage:salvage:oldSalvage';
    p.forge.crafts.push({ state: 'committed', craftRequestId: 'retired', craftResultRef: retiredCraftRef,
      blueprintId: 'scroll_ten_thousand_swords', blueprintCount: 1,
      materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }],
      resultItem: { itemId: 'bamboo_sword', count: 1, instanceRef: retiredRef }, resultGrade: 'spirit' });
    p.forge.receipts.push(retiredCraftRef);
    p.enhance.instances.push({ instanceRef: retiredRef, itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: 0 });
    p.salvage = { version: 1, ledgerId: 'smithClosedSalvage', ownerSlot: slot,
      destructions: [{ state: 'committed', salvageRequestId: 'oldSalvage', salvageResultRef, instanceRef: retiredRef,
        itemId: 'bamboo_sword', type: 'weapon', grade: 'spirit', enhanceLevel: 0,
        formalSource: { instanceRef: retiredRef, source: 'forge', forgeLedgerId, craftResultRef: retiredCraftRef, ownerSlot: slot },
        location: { kind: 'inventory' }, refineStones: enhance.salvage.refineStonesByGrade.spirit,
        output: { itemId: 'refine_stone', count: enhance.salvage.refineStonesByGrade.spirit }, destroyed: true, success: true }],
      receipts: [salvageResultRef] };
    ok(isValidForgeProgress(p.forge), '完整旧打造记录合法');
    ok(isValidEnhanceProgress(p.enhance), '完整旧强化/护符记录合法');
    ok(isValidEnchantProgress(p.enchant), '完整旧附灵记录合法');
    ok(isValidSalvageProgress(p.salvage), '完整旧分解记录合法，退役来源不复活');
    const originalSalvageRead = new SalvageGate(p).loadRefresh();
    ok(originalSalvageRead.allowed && originalSalvageRead.replayed && originalSalvageRead.progress,
      '真实原 Gate.loadRefresh 核实完整历史分解（无资格/承载 fixture）');
    eq(p.enhance.formalSources!.some(source => source.instanceRef === retiredRef), false, '历史销毁实例不再有正式当前来源');
    eq(p.formalEnhanceInstances().length, 2, '两件同原型正式源完整，禁止隐式代选');
    eq(resolveFormalEquipSlotBinding(p, 'weapon'), { kind: 'verified', instanceRef: refs[0] }, '装备精确位置已核实');
    eq(resolveFormalInventoryEquipBinding(p, { id: 'bamboo_sword', instanceRef: refs[1] }),
      { kind: 'verified', instanceRef: refs[1] }, '背包独立行精确实例已核实');
    return p;
  }
  const request = (service: Service, p: Progress, overrides: Row = {}): Row => {
    const instanceRef = p.enhance?.instances[0]?.instanceRef ?? 'smithClosedForge:craft:equipped:item';
    return { ...({ forge: { craftRequestId: 'closedRequest', blueprintId: 'scroll_ten_thousand_swords',
      materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'refine_stone', count: 1 }] },
    enhance: { enhanceRequestId: 'closedRequest', instanceRef, fromLevel: 1, to: 2, useProtectCharm: true },
    enchant: { enchantRequestId: 'closedRequest', instanceRef, fromElement: '金', element: '水' },
    salvage: { salvageRequestId: 'closedRequest', instanceRef, fromGrade: 'spirit', fromEnhanceLevel: 1 } })[service], ...overrides };
  };
  async function readOnly<T>(p: Progress, action: () => T | Promise<T>, label: string): Promise<T> {
    const before = JSON.stringify(p.exportSave()), publicBefore = JSON.stringify(p), storeBefore = JSON.stringify([...rows]),
      features = copy(featureFlags()), beforeCounters = [sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens];
    const result = await action();
    eq(JSON.stringify(p.exportSave()), before, `${label}: 完整业务存档字节零增量`);
    eq(JSON.stringify(p), publicBefore, `${label}: 全部公开业务字段/缓存/队列零增量`);
    eq(JSON.stringify([...rows]), storeBefore, `${label}: 全部原始存档后端零增量`);
    eq(featureFlags(), features, `${label}: 不串 feature`);
    eq([sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens], beforeCounters, `${label}: 写/存储哨兵零调用`);
    return result;
  }
  async function refusal(id: string, p: Progress, router: SmithServices, method: string, args: unknown[], tip: string, label: string) {
    invocations++; cases[id].invocations++;
    const result = await readOnly(p, () => invoke(router, method, ...args), label) as Row;
    eq(result.allowed, false, `${label}: 明确拒绝`);
    eq(result.tipKey, tip, `${label}: 只给对应层级 tip`);
    eq(result.text, (strings as unknown as Record<string, string>)[tip], `${label}: 文案源自 strings`);
    ok(!result.result && !result.replayed, `${label}: 不挂旧成功/伪完整结果`);
    ok(!String(result.tipKey).includes('later_service') && !String(result.tipKey).startsWith('attr.'), `${label}: 不串历史/属性成功提示`);
    record(id, label, { method, tipKey: result.tipKey, fullBusinessDelta: 0, writeCalls: 0 });
    return result;
  }
  try {
    eq(GAME_PHASE, 5, 'GAME_PHASE=5');
    eq(flags(), [true, true, true, true], '正式四 Flag 保留 true');
    eq(featureEnabled('indexedDbSaves'), true, '通过既有异步存档读取路径');
    let payloads: Payload[];
    if (options.payloads) {
      payloads = copy(options.payloads);
      for (const payload of payloads) rows.set(payload.slot, { slotKey: payload.slot, data: copy(payload.save), lastSaveAt: 1 });
    } else {
      const first = existingAssets(1); ok(await first.saveAsync(), '普通保存仅为准备档1');
      const second = existingAssets(2); ok(await second.saveAsync(), '普通保存仅为准备档2');
      payloads = [{ slot: 1, name: 'complete-old-slot-1', save: first.exportSave() },
        { slot: 2, name: 'same-reference-different-owner-slot-2', save: second.exportSave() }];
      eq(ordinarySaveSetupWrites, 2, '两个准备保存与关态写计数分列');
    }
    setup = false; Progress.setActiveSlot(1);
    const base = sentinels(restore(payloads[0].save)), router = new SmithServices(base),
      oldResults = JSON.stringify([base.forge, base.enhance, base.enchant, base.salvage]), stateBefore = JSON.stringify(base.exportSave());
    options.controls?.setRoute(routeState(false));
    for (let repeat = 0; repeat < 3; repeat++) {
      await refusal('C01', base, router, 'entrance', [], 'ui.smith.closed', `C01/entry-repeat-${repeat}`);
      for (const service of services) for (const method of ['panel', 'choices', 'select', 'submit', 'result', 'loadRefresh'])
        await refusal('C01', base, router, method, [service, request(service, base)], 'ui.smith.closed', `C01/entry-priority/${repeat}/${service}/${method}`);
    }
    if (options.controls) {
      const controls = options.controls;
      const menuClosed = routeState(true); menuClosed.menu = false; controls.setRoute(menuClosed);
      await refusal('C02', base, router, 'menu', [], 'ui.smith.closed', 'C02/menu-not-mounted');
      const staleMenuCallbacks = services.map(service => () => invoke(router, 'submit', service, request(service, base)));
      for (let i = 0; i < services.length; i++) {
        await refusal('C02', base, router, 'panel', [services[i]], 'ui.smith.closed', `C02/old-menu-click/${services[i]}`);
        const old = await readOnly(base, staleMenuCallbacks[i], `C02/old-menu-callback/${services[i]}`) as Row;
        eq(old.tipKey, 'ui.smith.closed', `C02/${services[i]}: 旧回调不派发`);
      }
      controls.setRoute(routeState(true));
      const selectedBeforeClose = await readOnly(base, () => invoke(router, 'select', 'forge', request('forge', base)), 'C02/read-only-selection-before-menu-close') as Row;
      eq(selectedBeforeClose.status, 'selected', 'C02 仅只读建立视图确认，无结算');
      controls.setRoute(menuClosed);
      await refusal('C02', base, router, 'submit', ['forge', request('forge', base)], 'ui.smith.closed', 'C02/old-confirmation-after-menu-close');
      controls.setRoute(routeState(true));
      const cleared = await readOnly(base, () => invoke(router, 'submit', 'forge', request('forge', base)), 'C02/reopen-old-confirmation') as Row;
      eq(cleared.tipKey, 'ui.smith.selection_required', 'C02 关态清理旧确认，重新进入不能沿用旧提交');
      ok(!cleared.result, 'C02 不保留伪成功');
      record('C02', 'C02/closed-clears-actual-selected-intent', { oldSelectionDiscarded: true, resubmission: false });
      const variants: Record<Service, string[]> = {
        forge: ['legal', 'missing-blueprint', 'missing-materials', 'bag-full'],
        enhance: ['with-charm', 'without-charm', 'short-charm', 'missing-charm-mapping', 'max-level'],
        enchant: ['first-element', 'same-element', 'overwrite', 'armor'],
        salvage: ['legal', 'not-salvageable', 'unknown-grade', 'capacity-short'],
      };
      for (let index = 0; index < services.length; index++) {
        const service = services[index], family = families[index], id = `C${String(index + 3).padStart(2, '0')}`;
        for (const variant of variants[service]) {
          Progress.setActiveSlot(1);
          const p = sentinels(restore(payloads[0].save));
          if (variant === 'missing-blueprint') p.inventory.scroll_ten_thousand_swords = 0;
          if (variant === 'missing-materials') p.inventory.spirit_copper = 0;
          if (variant === 'short-charm') p.inventory.protect_charm = 0;
          if (variant === 'max-level') p.enhance!.instances[0].enhanceLevel = enhance.maxLevel;
          const changes: Row = variant === 'without-charm' ? { useProtectCharm: false }
            : variant === 'first-element' ? { fromElement: null, element: '火' }
            : variant === 'same-element' ? { fromElement: '金', element: '金' }
            : variant === 'unknown-grade' ? { fromGrade: 'unknown' }
            : variant === 'armor' || variant === 'not-salvageable' ? { instanceRef: 'fox_robe' } : {};
          // 满包/护符映射损坏/分解资格及承载不足是故意关闭前的语义载荷，不安装测试承载器。
          Object.defineProperty(p, '__smithClosedCase', { configurable: true, enumerable: true, value: { service, variant,
            capacity: variant === 'bag-full' || variant === 'capacity-short' ? 0 : 100,
            charmMappingMissing: variant === 'missing-charm-mapping', qualification: variant !== 'not-salvageable' } });
          if (['bag-full', 'missing-charm-mapping', 'not-salvageable', 'capacity-short'].includes(variant))
            record(id, `${id}/${variant}/closed-priority-semantic-context`, { semanticContextOnly: true,
              actualOpenCapacityOrQualificationOrMappingExecuted: false, expectedReachability: 'closed-before-dependency' });
          const target = new SmithServices(p), intent = request(service, p, changes), panelClosed = routeState(true);
          panelClosed.panels[service] = false; controls.setRoute(panelClosed);
          for (const method of ['panel', 'choices', 'select', 'submit', 'result', 'loadRefresh'])
            await refusal(id, p, target, method, [service, intent], 'ui.smith.closed', `${id}/${variant}/ui-panel/${method}`);
          controls.setRoute(routeState(true)); controls.setGate(family, false);
          await refusal(id, p, target, 'panel', [service], `${service}.closed.entrance`, `${id}/${variant}/gate-entrance`);
          await refusal(id, p, target, 'select', [service, intent], `${service}.closed.${service === 'forge' ? 'craft' : service}`, `${id}/${variant}/gate-select`);
          await refusal(id, p, target, 'submit', [service, intent], `${service}.closed.no_submit`, `${id}/${variant}/gate-submit`);
          await refusal(id, p, target, 'result', [service, intent], `${service}.closed.${service === 'enhance' ? 'no_level' : 'no_result'}`, `${id}/${variant}/gate-result`);
          await refusal(id, p, target, 'loadRefresh', [service], `${service}.closed.load_refresh`, `${id}/${variant}/gate-load`);
          eq(flags(), families.map(name => name !== family), `${id}/${variant}: 单旗 false 不串其他 Flag`);
          controls.setGate(family, true);
        }
      }
      // UI 自身关闭优先于真实开放 Gate；分别关闭每个服务时其他三个只读入口仍开放。
      controls.setRoute(routeState(false));
      for (const service of services) await refusal('C07', base, router, 'submit', [service, request(service, base)], 'ui.smith.closed', `C07/ui-false-gates-true/${service}`);
      eq(flags(), [true, true, true, true], 'C07 UI false 不回翻四服务');
      for (let index = 0; index < families.length; index++) {
        const family = families[index]; controls.setRoute(routeState(true)); controls.setGate(family, false);
        const gates = [new ForgeGate(base), new EnhanceGate(base), new EnchantGate(base), new SalvageGate(base)];
        for (let other = 0; other < families.length; other++) if (other !== index)
          eq(gates[other].entrance().allowed, true, `C07/${family}-false/${families[other]}-still-true`);
        await refusal('C07', base, router, 'submit', [services[index], request(services[index], base)], `${services[index]}.closed.no_submit`, `C07/single-service/${services[index]}`);
        controls.setGate(family, true);
      }
      controls.setGate('Enhance', false); controls.setGate('Enchant', false); controls.setRoute(routeState(true));
      const independentSalvage = await readOnly(base, () => invoke(router, 'choices', 'salvage'), 'C07/enhance-enchant-false-salvage-true') as Row;
      eq(independentSalvage.allowed, true, 'C07 属性两 Flag 关态不会串关分解正式候选');
      const salvageRows = independentSalvage.items as Row[];
      eq(salvageRows.map(row => row.instanceRef).sort(), base.formalEnhanceInstances().map(row => row.instanceRef).sort(), 'C07 分解候选保留两个精确正式位置实例，不复活历史销毁实例');
      ok(salvageRows.every(row => (row.display as Row).kind === 'unavailable'), 'C07 只隐藏 E/I 属性，不借该组旗作分解资格');
      controls.setGate('Enhance', true); controls.setGate('Enchant', true);
      record('C07', 'C07/readonly-attribute-flags-independent-of-salvage-candidates', { formalCandidates: 2, salvageGateTrue: true, exactPositionPreserved: true });
      const unqualifiedRaw = await readOnly(base, () => new SalvageGate(base).salvage(request('salvage', base) as never), 'C07/formal-salvage-no-production-qualification');
      eq(unqualifiedRaw.allowed, false, 'C07 正式存活实例不自动获得分解资格/承载');
      ok(!unqualifiedRaw.allowed && unqualifiedRaw.tipKey === 'salvage.fixture.qualification', 'C07 原 Gate 保持缺正式资格裁决');
      const unqualifiedUi = await readOnly(base, () => invoke(router, 'select', 'salvage', request('salvage', base)), 'C07/salvage-adapter-keeps-qualification-refusal') as Row;
      eq(unqualifiedUi.allowed, false, 'C07 services 不以位置映射替代正式分解资格');
      eq(unqualifiedUi.tipKey, 'ui.smith.result_unknown', 'C07 未齐正式依赖仅中性待核实提示');
      eq(unqualifiedUi.gate, unqualifiedRaw, 'C07 保留原 Gate 裁决，没有夹具资格/承载回退');
      record('C07', 'C07/formal-salvage-dependency-still-rejected', { formalQualificationAvailable: false,
        formalAtomicCarrierAvailable: false, fixtureQualificationFallback: false, originalGateRefusalPreserved: true,
        actualNewSalvageSubmissionExecuted: false });
      const sameElement = await readOnly(base, () => invoke(router, 'select', 'enchant', request('enchant', base,
        { enchantRequestId: 'newSameElement', fromElement: '金', element: '金' })), 'C05/same-existing-element-new-intent') as Row;
      eq(sameElement.allowed, false, 'C05 同元素新意图拒绝');
      eq(sameElement.tipKey, 'ui.smith.same_element', 'C05 已核实完整旧五行使用同元素精确提示');
      ok(!sameElement.result && !sameElement.replayed, 'C05 新同元素拒绝不冒称已提交');
      record('C05', 'C05/same-element-new-intent-readonly-refusal', { existingElementVerified: true, newSettlement: false });
      // 缺源与旧位置不向正式 source 迁移；关闭优先不读取这些非法身份。
      for (const source of ['no-instance', 'aggregate-item-count', 'fixture-only', 'foreign-owner', 'stale-position']) {
        Progress.setActiveSlot(1);
        const p = sentinels(restore(payloads[0].save));
        if (source === 'foreign-owner') { p.enhance!.formalSources!.forEach(row => { row.ownerSlot = 2; }); p.enchant!.ownerSlot = 2; }
        else if (source === 'stale-position') { p.equipInstanceRefs = { weapon: 'smithClosedForge:craft:bagged:item' }; p.inventory.bamboo_sword = 0; }
        else { p.forge = undefined; p.enhance = undefined; p.enchant = undefined; p.equipInstanceRefs = undefined; }
        if (source === 'fixture-only') Object.defineProperty(p, 'fixtureInstances', { enumerable: true,
          value: [{ instanceRef: 'smithClosedForge:craft:equipped:item', itemId: 'bamboo_sword', type: 'weapon', enhanceLevel: 0 }] });
        const target = new SmithServices(p); controls.setRoute(routeState(false));
        for (const service of ['enhance', 'enchant', 'salvage'] as Service[])
          await refusal('C08', p, target, 'submit', [service, request(service, p)], 'ui.smith.closed', `C08/${source}/${service}/closed-priority`);
        const aggregate = await readOnly(p, () => resolveFormalInventoryEquipBinding(p, { id: 'bamboo_sword' }), `C08/${source}/aggregate-resolver`);
        eq(aggregate, { kind: 'no_instance' }, `C08/${source}: 聚合行从不补身份`);
        controls.setRoute(routeState(true));
        for (const service of ['enhance', 'enchant', 'salvage'] as Service[]) {
          const candidates = await readOnly(p, () => invoke(target, 'choices', service), `C08/${source}/${service}/formal-candidates`) as Row;
          eq(candidates.items, [], `C08/${source}/${service}: 无有效正式来源/精确位置不列实例`);
          const selection = await readOnly(p, () => invoke(target, 'select', service, request(service, p)), `C08/${source}/${service}/formal-readonly-selection`) as Row;
          eq(selection.allowed, false, `C08/${source}/${service}: 只读正式裁决拒绝非法身份`);
          ok(!selection.result, `C08/${source}/${service}: 无实例/fixture/跨档/旧位置不造结果`);
        }
        record('C08', `C08/${source}/explicit-source-refusal`, { aggregate, fixtureProductionFallback: false, migrations: 0 });
      }
      // 同一 SSR realm 的真实 services 方法并发；关闭路径不进入事务，不宣称开态事务竞争通过。
      controls.setRoute(routeState(false)); Progress.setActiveSlot(1);
      const activeBefore = JSON.stringify(base.exportSave()), concurrent = services.flatMap(service => Array.from({ length: 12 }, () =>
        () => invoke(router, 'submit', service, request(service, base))));
      const results = await readOnly(base, () => Promise.all(concurrent.map(callback => Promise.resolve().then(callback))), 'C09/cross-service-shared-resources') as Row[];
      eq(results.length, 48, 'C09 四服务共48次同实例/同请求/共享材料并发');
      ok(results.every(row => row.allowed === false && row.tipKey === 'ui.smith.closed' && !row.result), 'C09 所有并发仅 UI 关态，无排队/去重/预占');
      record('C09', 'C09/same-request-same-instance-cross-service', { callbacks: 48, sameRealmOnly: true, persistentLocks: 0, queues: 0 });
      const oldCallback = () => invoke(router, 'submit', 'enhance', request('enhance', base));
      Progress.setActiveSlot(2);
      const second = sentinels(await Progress.loadAsync(2)), secondBefore = JSON.stringify(second.exportSave());
      const old = await readOnly(base, oldCallback, 'C09/slot-switch-old-callback') as Row;
      eq(old.allowed, false, 'C09 切档旧 callback 拒绝');
      ok(!old.result, 'C09 切档旧 callback 无跨档结果');
      eq(JSON.stringify(base.exportSave()), activeBefore, 'C09 A 档全量资产不变');
      eq(JSON.stringify(second.exportSave()), secondBefore, 'C09 B 档全量资产不变');
      record('C09', 'C09/cross-slot-stale-callback', { equalReferenceText: true, differentAssetsAndOwner: true, crossSlotResult: false });
      controls.setRoute(routeState(true));
      const oldOpenRoute = await readOnly(base, oldCallback, 'C09/slot-switch-old-callback-open-route') as Row;
      eq(oldOpenRoute.allowed, false, 'C09 即使内存路由已开，旧档回调仍拒绝');
      eq(oldOpenRoute.status, 'stale', 'C09 真实 ownerSlot guard 判旧回调');
      eq(oldOpenRoute.tipKey, 'ui.smith.result_unknown', 'C09 不泄露另一档结果或伪造未提交');
      ok(!oldOpenRoute.result, 'C09 route-open 旧回调仍无跨档结果');
      record('C09', 'C09/owner-slot-stale-guard-independent-of-ui-close', { routeOpenOnlyInMemory: true, staleCallbackRejected: true });
      // 只替换隔离 SSR 内 Gate.submit 的等待/返回；返回已播种历史完整结果，绝不执行结算。
      for (const interrupt of ['switch-slot', 'invalidate-view', 'close-ui']) {
        Progress.setActiveSlot(1); controls.setRoute(routeState(true));
        const target = new SmithServices(base), intent = request('forge', base, { craftRequestId: 'equipped' });
        const selected = await readOnly(base, () => invoke(target, 'select', 'forge', intent), `C09/pending-${interrupt}/select-readonly`) as Row;
        eq(selected.status, 'selected', `C09/pending-${interrupt}: 只读确认就绪`);
        const oldGateResult = await readOnly(base, () => new ForgeGate(base).result('equipped'), `C09/pending-${interrupt}/read-existing-result`);
        ok(oldGateResult.allowed && oldGateResult.result && oldGateResult.replayed, `C09/pending-${interrupt}: 原 Gate 核实旧完整结果`);
        const original = Object.getOwnPropertyDescriptor(ForgeGate.prototype, 'submit')!;
        let complete!: (value: unknown) => void, delegateCalls = 0;
        const delayed = new Promise(resolve => { complete = resolve; });
        Object.defineProperty(ForgeGate.prototype, 'submit', { ...original, value() { delegateCalls++; return delayed; } });
        try {
          const result = await readOnly(base, async () => {
            const pending = invoke(target, 'submit', 'forge', intent) as Promise<Row>;
            eq(delegateCalls, 1, `C09/pending-${interrupt}: Gate 已进入 pending`);
            if (interrupt === 'switch-slot') Progress.setActiveSlot(2);
            else if (interrupt === 'close-ui') controls.setRoute(routeState(false));
            else target.invalidate();
            complete(copy(oldGateResult));
            return await pending;
          }, `C09/pending-${interrupt}/late-promise`);
          eq(result.allowed, false, `C09/pending-${interrupt}: 迟到 Promise 不渲染旧成功`);
          eq(result.status, interrupt === 'close-ui' ? 'closed' : 'stale', `C09/pending-${interrupt}: owner/epoch/UI guard 真实拒绝`);
          eq(result.tipKey, interrupt === 'close-ui' ? 'ui.smith.closed' : 'ui.smith.result_unknown', `C09/pending-${interrupt}: 未决/关闭分层提示`);
          ok(!result.result, `C09/pending-${interrupt}: 旧结果不泄露`);
          record('C09', `C09/pending-gate-promise/${interrupt}`, { pendingCallbackSpyOnly: true, delayedGateSubmitStubOnly: true,
            existingHistoricalResultOnly: true, settlementExecuted: false, staleViewResult: false });
        } finally { Object.defineProperty(ForgeGate.prototype, 'submit', original); }
      }
      Progress.setActiveSlot(1);
      // 完整旧结果经真实 loadAsync / restore / 新路由重读；坏记录原文不被修复。
      controls.setRoute(routeState(false));
      for (const payload of payloads) {
        const loaded = sentinels(await Progress.loadAsync(payload.slot)), rawBefore = JSON.stringify([...rows]);
        eq(loaded.storageError, undefined, `C10/${payload.name}: 真实 loadAsync 成功`);
        eq([loaded.forge, loaded.enhance, loaded.enchant, loaded.salvage, loaded.inventory, loaded.equip, loaded.equipInstanceRefs, loaded.stones],
          [payload.save.forge, payload.save.enhance, payload.save.enchant, payload.save.salvage, payload.save.inventory, payload.save.equip, payload.save.equipInstanceRefs, payload.save.stones],
          `C10/${payload.name}: 完整旧结果和合法资产保留`);
        const reentered = new SmithServices(loaded);
        for (const service of services) for (const method of ['entrance', 'result', 'loadRefresh'])
          await refusal('C10', loaded, reentered, method, method === 'entrance' ? [] : [service, request(service, loaded)], 'ui.smith.closed', `C10/${payload.name}/${method}/${service}`);
        eq(JSON.stringify([...rows]), rawBefore, `C10/${payload.name}: 退出重进不补写`);
      }
      for (const corruption of ['unknown-version', 'half-result', 'missing-receipt', 'unknown-ui-record']) {
        Progress.setActiveSlot(1);
        const raw = copy(payloads[0].save), bag = raw.enhance as Row;
        if (corruption === 'unknown-version') bag.version = 99;
        if (corruption === 'half-result') bag.enhancements = [{ state: 'pending', enhanceRequestId: 'oldEnhance' }];
        if (corruption === 'missing-receipt') bag.receipts = [];
        if (corruption === 'unknown-ui-record') raw.__oldSmithUi = { success: true, pending: ['do-not-retry'], result: { incomplete: true } };
        rows.set(3, { slotKey: 3, data: copy(raw), lastSaveAt: 1 });
        const rawBefore = JSON.stringify([...rows]), loaded = sentinels(await Progress.loadAsync(3)), reopened = new SmithServices(loaded);
        for (const service of services) await refusal('C10', loaded, reopened, 'loadRefresh', [service], 'ui.smith.closed', `C10/${corruption}/${service}`);
        eq(JSON.stringify([...rows]), rawBefore, `C10/${corruption}: 原坏记录无修复/补扣/补发`);
      }
      Progress.setActiveSlot(1); controls.setRoute(routeState(true));
      const oldForgeIntent = request('forge', base, { craftRequestId: 'equipped' }), oldEnhanceIntent = request('enhance', base,
        { enhanceRequestId: 'oldEnhance', fromLevel: 0, to: 1, useProtectCharm: true }),
        oldEnchantIntent = request('enchant', base, { enchantRequestId: 'oldEnchant', fromElement: null, element: '金' }),
        oldSalvageIntent = request('salvage', base, { salvageRequestId: 'oldSalvage', instanceRef: base.salvage!.destructions[0].instanceRef,
          fromEnhanceLevel: 0 });
      const conflicts: { service: Service; name: string; intent: Row }[] = [
        { service: 'forge', name: 'duplicate-material-row', intent: { ...oldForgeIntent,
          materials: [{ itemId: 'spirit_copper', count: 1 }, { itemId: 'spirit_copper', count: 1 }] } },
        { service: 'forge', name: 'changed-count', intent: { ...oldForgeIntent,
          materials: [{ itemId: 'spirit_copper', count: 2 }, { itemId: 'refine_stone', count: 1 }] } },
        { service: 'forge', name: 'extra-field', intent: { ...oldForgeIntent, extra: true } },
        { service: 'enhance', name: 'changed-charm', intent: { ...oldEnhanceIntent, useProtectCharm: false } },
        { service: 'enhance', name: 'extra-field', intent: { ...oldEnhanceIntent, extra: true } },
        { service: 'enchant', name: 'changed-target-element', intent: { ...oldEnchantIntent, element: '水' } },
        { service: 'enchant', name: 'extra-field', intent: { ...oldEnchantIntent, extra: true } },
        { service: 'salvage', name: 'changed-grade', intent: { ...oldSalvageIntent, fromGrade: 'treasure' } },
        { service: 'salvage', name: 'extra-field', intent: { ...oldSalvageIntent, extra: true } },
      ];
      for (const conflict of conflicts) {
        const bad = await readOnly(base, () => invoke(router, 'result', conflict.service, conflict.intent), `C10/old-result-${conflict.service}/${conflict.name}`) as Row;
        eq(bad.allowed, false, `C10/${conflict.service}/${conflict.name}: 旧结果冲突拒绝`);
        ok(!bad.result && !bad.replayed, `C10/${conflict.service}/${conflict.name}: 同请求ID不冒认匹配旧成功`);
        record('C10', `C10/old-result-payload-conflict/${conflict.service}/${conflict.name}`, { resultReadOnly: true, sameIdConflictRejected: true });
      }
      Progress.setActiveSlot(1); controls.setRoute(routeState(false));
      const equip = new EquipPanel(mockScene(), base, () => { throw new Error('C11 只读不穿脱'); }),
        inventory = new InventoryPanel(mockScene(), base, { onChanged() { throw new Error('C11 只读不改背包'); }, openAlchemy: () => false, openSectToken: () => false });
      await readOnly(base, () => { equip.open(); inventory.open(); inventory.setTab('equip'); }, 'C11/real-E-I-open');
      const eBefore = copy(equip.snapshot()), iBefore = copy(inventory.snapshot()),
        explicit = await readOnly(base, () => buildInstDisplay(base, resolveFormalEquipSlotBinding(base, 'weapon')), 'C11/formal-readonly');
      eq(explicit.kind, 'verified', 'C11 完整正式旧 +1/金 仍正常只读');
      ok(explicit.lines.some(row => row.key === 'ui.equip.inst.enhance_level'), 'C11 强化旧属性保持独立');
      ok(explicit.lines.some(row => row.key === 'ui.equip.inst.enchant_element'), 'C11 附灵旧属性保持独立');
      for (const service of services) await refusal('C11', base, router, 'submit', [service, request(service, base)], 'ui.smith.closed', `C11/service-closed-ei-independent/${service}`);
      await readOnly(base, () => { equip.update(); inventory.update(); }, 'C11/real-E-I-refresh');
      eq(equip.snapshot(), eBefore, 'C11 E 全快照与原 status 不变');
      eq(inventory.snapshot(), iBefore, 'C11 I 全快照与原 status 不变');
      ok(!equip.snapshot().status && !inventory.snapshot().status, 'C11 不注入 attr-ui/服务成功状态');
      await readOnly(base, () => { equip.close(); inventory.close(); }, 'C11/real-E-I-close');
      eq(JSON.stringify([base.forge, base.enhance, base.enchant, base.salvage]), oldResults, 'C11 四服务旧完整业务事实全部保留');
      eq(JSON.stringify(base.exportSave()), stateBefore, 'C11 全窗完整业务增量零');
      record('C11', 'C11/full-business-and-ei-display-isolation', { fullSaveDelta: 0, publicBusinessDelta: 0,
        actualEquipPanelAndInventoryPanel: true, readonlySuccessSeparated: true, laterServiceMisreport: false, oldCOChecked: false });
      for (const [id, row] of Object.entries(cases)) ok(row.executed && row.passed && row.evidenceKeys.length, `${id} 有本窗独立执行证据`);
    }
    eq(featureFlags(), featureBefore, '全程 features 不变');
    eq(flags(), [true, true, true, true], '结束四正式服务 true 均保留');
    eq([sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens], [0, 0, 0, 0], '所有关态动作零写/零 IDB 打开');
    return { passed: true, assertions, invocations, fixtures, cases, evidence, payloads,
      dataMode: options.dataMode, graph: options.graph, sentinelCalls, storageWrites, localStorageWrites, indexedDbOpens,
      storageReads, ordinarySaveSetupWrites, softOpenedSmithServicesUi: false, released: false,
      openFixtureTableExecuted: false, formalSourceSeed: '明确播种既有正式打造/强化/附灵/分解完整记录；分解来源已退役，无新结算',
      zeroWriteScope: '逐动作对比 exportSave、公开业务字段、全部后端原文与写接口哨兵；普通准备保存单列',
      invocationsScope: '逐条严格 tip 断言调用数；并发、只读与迟到回调另列 cases evidence',
      uiIntegrationPending: '接引子仍须完成对话→菜单→四面板 tip' };
  } finally {
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (oldLocalStorage) Object.defineProperty(globalThis, 'localStorage', oldLocalStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
    if (oldIndexedDb) Object.defineProperty(globalThis, 'indexedDB', oldIndexedDb); else Reflect.deleteProperty(globalThis, 'indexedDB');
  }
}
