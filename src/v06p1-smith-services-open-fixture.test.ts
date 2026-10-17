// O02–O10: isolated fixture regression only; production O05 is proven in open-gates without this provider.
// Every business write is delegated to the existing Gate.
import recipes from '@xt/balance/recipes.json';
import enhance from '@xt/balance/enhance.json';
import protectCharmMap from '@xt/balance/enhance_protect_charm.json';
import { Progress } from './Progress';
import { SmithServices, type SmithService, type SmithRequests, type SmithReply } from './SmithServices';
import { ForgeGate } from './ForgeGate';
import { EnhanceGate } from './EnhanceGate';
import { EnchantGate } from './EnchantGate';
import { SalvageGate, createSalvageFixtureCarrier, type SalvageFixtureOptions } from './SalvageGate';
import { listBagFormalEquipBindings, resolveFormalEquipSlotBinding } from './EquipInstBinding';
import { createIndexedDbBackend, saveStore, setSaveBackend, type SaveSlot, type SlotKey } from './SaveStore';
import { featureFlags } from './features';
import { ITEMS } from './data';

type Row = Record<string, unknown>;
const copy = <T>(value: T): T => structuredClone(value);
const recipe = recipes.recipes.find(row => row.type === 'forge' && row.output === 'bamboo_sword')!;
const providerKey = '__smithServicesOpenSalvageFixture';
export interface SmithOpenFixtureEnvironment {
  rows: Map<SlotKey, SaveSlot>;
  readonly writes: number;
  readonly commits: number;
  readonly randomCalls: number;
  sample: number;
  salvageOptions: Partial<SalvageFixtureOptions>;
  id(prefix: string): string;
  bare(): Progress;
  forgeRequest(): SmithRequests['forge'];
  source(count?: number): Promise<{ p: Progress; refs: string[]; router: SmithServices }>;
  failNextWrite(): void;
  failAfterNextWrite(): void;
  holdNextWrite(): { started: Promise<void>; release(): void };
  qualification: NonNullable<SalvageFixtureOptions['qualification']>;
}

/** Installs a detachable backend/provider only while the SSR acceptance callback runs. */
export async function withSmithServicesOpenFixtureEnvironment<T>(run: (env: SmithOpenFixtureEnvironment) => Promise<T>): Promise<T> {
  const oldSlot = Progress.getActiveSlot(), oldRandom = Math.random;
  const oldProvider = Object.getOwnPropertyDescriptor(globalThis, providerKey);
  const oldStorage = Object.getOwnPropertyDescriptor(globalThis, 'localStorage');
  const rows = new Map<SlotKey, SaveSlot>();
  let sequence = 0, writes = 0, commits = 0, randomCalls = 0, failNext = false, failAfterNext = false;
  let held: { started(): void; released: Promise<void> } | undefined;
  const carrier = createSalvageFixtureCarrier({
    async read(slot) { return copy(rows.get(slot) ?? null); },
    async write(slot) {
      writes++;
      const hold = held; held = undefined;
      if (hold) { hold.started(); await hold.released; }
      if (failNext) { failNext = false; throw new Error('O10 isolated backend write aborted'); }
      rows.set(slot.slotKey, copy(slot)); commits++;
      if (failAfterNext) { failAfterNext = false; throw new Error('O10 durable commit acknowledgement lost'); }
    },
    async delete(slot) { rows.delete(slot); },
    async insertIfEmpty(slot) { if (rows.has(slot.slotKey)) return false; rows.set(slot.slotKey, copy(slot)); return true; },
  });
  const env: SmithOpenFixtureEnvironment = {
    rows, get writes() { return writes; }, get commits() { return commits; }, get randomCalls() { return randomCalls; },
    sample: 0, salvageOptions: {}, id: prefix => `${prefix}_${++sequence}`,
    bare() {
      rows.delete(1); Progress.setActiveSlot(1);
      const p = new Progress(); p.level = 5; p.rootElement = '金'; p.stones = 1000000; p.equip = {};
      p.inventory = { refine_stone: 1000, beast_core: 100, protect_charm: 100 };
      p.inventory[recipe.blueprint!] = 100;
      for (const material of recipe.materials) p.inventory[material.item] = Math.max(p.count(material.item), material.count * 100);
      return p;
    },
    forgeRequest() { return { craftRequestId: env.id('forge'), blueprintId: recipe.blueprint!,
      materials: recipe.materials.map(row => ({ itemId: row.item, count: row.count })) }; },
    async source(count = 1) {
      const p = env.bare(), router = new SmithServices(p), refs: string[] = [];
      if (!await p.saveAsync()) throw new Error('formal source baseline save failed');
      for (let index = 0; index < count; index++) {
        const request = env.forgeRequest();
        if (!router.select('forge', request).allowed) throw new Error('formal source selection failed');
        const reply = await router.submit('forge', request);
        if (!reply.result || !('resultItem' in reply.result)) throw new Error(`formal source failed: ${JSON.stringify(reply)}`);
        refs.push(reply.result.resultItem.instanceRef);
      }
      return { p, refs, router };
    },
    failNextWrite() { failNext = true; },
    failAfterNextWrite() { failAfterNext = true; },
    holdNextWrite() {
      let started!: () => void, release!: () => void;
      const pending = new Promise<void>(resolve => { started = resolve; });
      const released = new Promise<void>(resolve => { release = resolve; });
      held = { started, released }; return { started: pending, release };
    },
    qualification(p, ref) {
      const source = p.enhance?.formalSources?.find(row => row.instanceRef === ref);
      if (!source || p.formalEnhanceInstanceStatus(ref) !== 'registered') return undefined;
      for (const slot of ['weapon', 'robe', 'shoes'] as const) {
        const binding = resolveFormalEquipSlotBinding(p as Progress, slot);
        if (binding.kind === 'verified' && binding.instanceRef === ref) return { instanceRef: ref, ownerSlot: source.ownerSlot,
          bound: false, natal: false, bloodBound: false, unsalvageable: false, location: { kind: 'equip', slot } };
      }
      return listBagFormalEquipBindings(p as Progress).some(row => row.instanceRef === ref)
        ? { instanceRef: ref, ownerSlot: source.ownerSlot, bound: false, natal: false, bloodBound: false,
          unsalvageable: false, location: { kind: 'inventory' } } : undefined;
    },
  };
  Object.defineProperty(globalThis, providerKey, { configurable: true, value: () => ({
    qualification: env.qualification, atomicCarrier: carrier, ledgerId: () => env.id('salvage'), ...env.salvageOptions,
  }) });
  Object.defineProperty(globalThis, 'localStorage', { configurable: true, value: { getItem: () => null,
    setItem() { throw new Error('open fixture unexpectedly used localStorage'); }, removeItem() {} } });
  Math.random = () => { randomCalls++; return env.sample; };
  setSaveBackend(carrier.backend); Progress.setActiveSlot(1);
  try { return await run(env); }
  finally {
    Math.random = oldRandom; Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend());
    if (oldProvider) Object.defineProperty(globalThis, providerKey, oldProvider); else Reflect.deleteProperty(globalThis, providerKey);
    if (oldStorage) Object.defineProperty(globalThis, 'localStorage', oldStorage); else Reflect.deleteProperty(globalThis, 'localStorage');
  }
}

export async function runSmithServicesOpenFixtureTests(options: { dataMode: string }) {
  return withSmithServicesOpenFixtureEnvironment(async env => {
    let assertions = 0;
    const evidence: Row[] = [];
    const cases: Record<string, { executed: boolean; passed: boolean; assertions: number; evidenceKeys: string[] }> = {};
    let activeCase = '';
    const eq = (actual: unknown, expected: unknown, label: string) => {
      assertions++; if (activeCase) cases[activeCase].assertions++;
      if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`${options.dataMode}: ${label}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
    };
    function ok(value: unknown, label: string): asserts value { eq(!!value, true, label); }
    const start = (id: string) => { activeCase = id; cases[id] = { executed: true, passed: true, assertions: 0, evidenceKeys: [] }; };
    const mark = (label: string, fields: Row = {}) => { cases[activeCase].evidenceKeys.push(label); evidence.push({ case: activeCase, label, passed: true, ...fields }); };
    const save = (p: Progress) => copy(p.exportSave());
    const assets = (p: Progress) => ({ inventory: copy(p.inventory), stones: p.stones, equip: copy(p.equip), forgingExp: p.forgingExp, forgingLevel: p.forgingLevel,
      formalSources: copy(p.enhance?.formalSources), forge: copy(p.forge), enhance: copy(p.enhance), enchant: copy(p.enchant), salvage: copy(p.salvage) });
    const eReq = (p: Progress, ref: string, charm = false): SmithRequests['enhance'] => {
      const fromLevel = p.formalEnhanceInstances().find(row => row.instanceRef === ref)!.enhanceLevel;
      return { enhanceRequestId: env.id('enhance'), instanceRef: ref, fromLevel, to: fromLevel + 1, useProtectCharm: charm };
    };
    const cReq = (p: Progress, ref: string, element: SmithRequests['enchant']['element']): SmithRequests['enchant'] => ({
      enchantRequestId: env.id('enchant'), instanceRef: ref, fromElement: p.enchant?.instances.find(row => row.instanceRef === ref)?.element ?? null, element });
    const sReq = (p: Progress, ref: string): SmithRequests['salvage'] => ({ salvageRequestId: env.id('salvageRequest'), instanceRef: ref,
      fromGrade: p.forge!.crafts.find(row => row.resultItem.instanceRef === ref)!.resultGrade,
      fromEnhanceLevel: p.formalEnhanceInstances().find(row => row.instanceRef === ref)!.enhanceLevel });
    const complete = async <S extends SmithService>(p: Progress, router: SmithServices, service: S, request: SmithRequests[S]) => {
      const before = save(p), writes = env.writes;
      ok(router.select(service, request).allowed, `${service} formal select accepted`);
      eq(save(p), before, `${service} selection read only`); eq(env.writes, writes, `${service} selection zero storage writes`);
      const reply = await router.submit(service, request);
      ok(reply.allowed && reply.status === 'committed' && reply.result?.state === 'committed', `${service} complete result only after commit`);
      eq('result' in reply.gate! ? reply.gate!.result : null, reply.result, `${service} delegates exact full Gate result`);
      const fromGate = service === 'forge' ? new ForgeGate(p).result((request as SmithRequests['forge']).craftRequestId)
        : service === 'enhance' ? new EnhanceGate(p).level((request as SmithRequests['enhance']).enhanceRequestId)
        : service === 'enchant' ? new EnchantGate(p).result((request as SmithRequests['enchant']).enchantRequestId)
        : new SalvageGate(p).result((request as SmithRequests['salvage']).salvageRequestId);
      eq('result' in fromGate ? fromGate.result : null, reply.result, `${service} existing Gate read API matches complete result`);
      eq(router.result(service, request).result, reply.result, `${service} Services result API matches`);
      eq((await saveStore.readSlot(1))!.data, p.exportSave(), `${service} complete assets published with persisted result`);
      eq(router.back().route, 'menu', `${service} result returns to menu`);
      return reply;
    };
    const deniedUnchanged = async (p: Progress, action: () => SmithReply | Promise<SmithReply>, label: string, expectedTip?: string) => {
      const before = save(p), rows = copy([...env.rows]), writes = env.writes, calls = env.randomCalls;
      const reply = await action(); eq(reply.allowed, false, `${label}: denied`);
      if (expectedTip) eq(reply.tipKey, expectedTip, `${label}: layered tip`);
      ok(reply.status !== 'committed' && reply.result === undefined, `${label}: no fake committed result`);
      eq(save(p), before, `${label}: full save unchanged`); eq([...env.rows], rows, `${label}: stored assets unchanged`);
      eq(env.writes, writes, `${label}: zero storage write`); eq(env.randomCalls, calls, `${label}: zero sample`); return reply;
    };
    const featuresBefore = copy(featureFlags());

    start('O02');
    const forgeP = env.bare(), forgeRouter = new SmithServices(forgeP), forgeRequest = env.forgeRequest();
    ok(await forgeP.saveAsync(), 'formal forge baseline saved before full snapshot CAS');
    const forgeBefore = assets(forgeP), forgeCalls = env.randomCalls, forgeReply = await complete(forgeP, forgeRouter, 'forge', forgeRequest);
    ok(forgeReply.result && 'resultItem' in forgeReply.result, 'forge full result has output and grade');
    const forgeResult = forgeReply.result;
    eq(forgeResult.resultItem.count, 1, 'formal output quantity'); eq(forgeResult.resultGrade, 'common', 'quality sampled by Gate');
    eq(env.randomCalls - forgeCalls, 1, 'one quality sample'); eq(forgeP.stones, forgeBefore.stones, 'no invented stone charge');
    for (const cost of [{ itemId: forgeResult.blueprintId, count: forgeResult.blueprintCount }, ...forgeResult.materials])
      eq(forgeP.count(cost.itemId), (forgeBefore.inventory[cost.itemId] ?? 0) - cost.count, `forge exact cost ${cost.itemId}`);
    eq(forgeP.forge!.receipts, [forgeResult.craftResultRef], 'forge receipt once');
    eq(forgeP.formalEnhanceInstanceStatus(forgeResult.resultItem.instanceRef), 'registered', 'formal output registered in same transaction');
    eq([forgeP.forgingExp, forgeP.forgingLevel], [forgeBefore.forgingExp, forgeBefore.forgingLevel], 'UI does not grant forging experience');
    mark('O02/formal-blueprint-materials-full-gate-result', { request: forgeRequest, result: forgeResult, before: forgeBefore, after: assets(forgeP), samples: 1 });

    start('O03');
    for (const charm of [false, true]) {
      const { p, refs, router } = await env.source(); const ref = refs[0];
      env.sample = 0;
      for (let level = 0; level < 5; level++) await complete(p, router, 'enhance', eReq(p, ref, charm));
      env.sample = .9999;
      const request = eReq(p, ref, charm), before = assets(p), reply = await complete(p, router, 'enhance', request);
      ok(reply.result && 'finalLevel' in reply.result, 'enhance complete failure result');
      eq(reply.result.success, false, 'probability failure is settled result');
      eq(reply.result.finalLevel, charm ? 5 : 4, 'Gate drop/protection final level');
      eq(p.stones, before.stones - reply.result.stones, 'failure still charges full exact stones');
      eq(p.count('refine_stone'), before.inventory.refine_stone - reply.result.refineStones, 'failure exact materials');
      eq(p.count('protect_charm'), before.inventory.protect_charm - (charm ? protectCharmMap.countPerSettlement : 0), 'formal charm exact consumption');
      mark(`O03/${charm ? 'with' : 'without'}-charm-probability-failure`, { request, result: reply.result, before, after: assets(p) });
      env.sample = 0;
      while (p.formalEnhanceInstances().find(row => row.instanceRef === ref)!.enhanceLevel < enhance.maxLevel)
        await complete(p, router, 'enhance', eReq(p, ref, charm));
      await deniedUnchanged(p, () => router.select('enhance', eReq(p, ref, charm)), 'max level', 'enhance.formal.max_level');
      mark(`O03/${charm ? 'with' : 'without'}-charm-success-and-max-refusal`, { maxLevel: enhance.maxLevel, after: assets(p) });
    }

    start('O04'); env.sample = 0;
    const enchanted = await env.source(2), enchantRef = enchanted.refs[1];
    for (const element of ['金', '木', '水', '火', '土'] as const) {
      const request = cReq(enchanted.p, enchantRef, element), before = assets(enchanted.p);
      const reply = await complete(enchanted.p, enchanted.router, 'enchant', request);
      ok(reply.result && 'element' in reply.result, 'full enchant result');
      eq(enchanted.p.stones, before.stones - reply.result.stones, 'enchant exact stones');
      for (const material of reply.result.materials) eq(enchanted.p.count(material.itemId), before.inventory[material.itemId] - material.count, 'enchant exact materials');
      eq(enchanted.p.enchant!.instances.filter(row => row.instanceRef === enchantRef).length, 1, 'overwrites one element, no layers');
      eq(enchanted.p.enchant!.instances[0].element, element, 'selected element is current');
      await deniedUnchanged(enchanted.p, () => enchanted.router.select('enchant', cReq(enchanted.p, enchantRef, element)), 'same element', 'ui.smith.same_element');
      mark(`O04/five-elements-${element}`, { request, result: reply.result, before, after: assets(enchanted.p) });
    }
    const staleEnchant = { ...cReq(enchanted.p, enchantRef, '金'), fromElement: null };
    await deniedUnchanged(enchanted.p, () => enchanted.router.select('enchant', staleEnchant), 'stale enchant target', 'ui.smith.changed');
    await deniedUnchanged(enchanted.p, () => enchanted.router.select('enchant', { ...staleEnchant, instanceRef: 'beast_core' }), 'illegal enchant identity');
    mark('O04/illegal-and-stale-targets-rejected', { originalOtherRef: enchanted.refs[0], selectedRef: enchantRef });

    start('O05');
    const salvaged = await env.source(2);
    await complete(salvaged.p, salvaged.router, 'enhance', eReq(salvaged.p, salvaged.refs[1]));
    await complete(salvaged.p, salvaged.router, 'enchant', cReq(salvaged.p, salvaged.refs[0], '金'));
    const salvageRequest = sReq(salvaged.p, salvaged.refs[1]), salvageBefore = assets(salvaged.p);
    const salvageReply = await complete(salvaged.p, salvaged.router, 'salvage', salvageRequest);
    ok(salvageReply.result && 'destroyed' in salvageReply.result, 'O05 full successful destruction');
    eq(salvageReply.result.location, { kind: 'inventory' }, 'precise selected inventory location');
    eq(salvageReply.result.destroyed, true, 'selected formal instance destroyed');
    eq(salvaged.p.count('bamboo_sword'), salvageBefore.inventory.bamboo_sword - 1, 'exactly one selected equipment removed');
    eq(salvaged.p.count('refine_stone'), salvageBefore.inventory.refine_stone + salvageReply.result.output.count, 'all output once');
    eq(salvaged.p.salvage!.receipts, [salvageReply.result.salvageResultRef], 'destruction output receipt in same committed save');
    ok(!salvaged.p.enhance!.formalSources!.some(row => row.instanceRef === salvaged.refs[1]), 'selected formal source retired');
    eq(salvaged.p.formalEnhanceInstanceStatus(salvaged.refs[1]), 'missing', 'retired selected identity cannot be reselected');
    eq(salvaged.p.enchant, salvageBefore.enchant, 'other enchanted instance and all enchant history retained');
    eq(salvaged.p.forge, salvageBefore.forge, 'forge history retained');
    await deniedUnchanged(salvaged.p, () => salvaged.router.select('salvage', sReq(salvaged.p, salvaged.refs[0])), 'cannot retire enchanted association', 'ui.smith.result_unknown');
    mark('O05/full-inventory-destruction-exact-position-retirement-and-atomic-carrier', { request: salvageRequest, result: salvageReply.result,
      before: salvageBefore, after: assets(salvaged.p), qualificationEvidence: 'formalSources + exact EquipInstBinding location; explicit false eligibility fixture',
      carrier: 'isolated SalvageFixtureCarrier CAS, same saved destruction/output/receipt', enchantedAssociationRefused: true });
    const equipped = await env.source();
    equipped.p.equip = { weapon: 'bamboo_sword' }; equipped.p.equipInstanceRefs = { weapon: equipped.refs[0] }; equipped.p.inventory.bamboo_sword--;
    ok(await equipped.p.saveAsync(), 'explicit equipped fixture prepared and saved');
    const equipRequest = sReq(equipped.p, equipped.refs[0]);
    const equipReply = await complete(equipped.p, equipped.router, 'salvage', equipRequest);
    ok(equipReply.result && 'location' in equipReply.result, 'full equipped salvage result');
    eq(equipReply.result.location, { kind: 'equip', slot: 'weapon' }, 'exact selected equip slot');
    eq(resolveFormalEquipSlotBinding(equipped.p, 'weapon'), { kind: 'empty' }, 'destroyed equip slot inaccessible');
    mark('O05/full-equipped-destruction-precise-slot', { request: equipRequest, result: equipReply.result, after: assets(equipped.p),
      oldReferencePolicy: 'Gate retains historical equipInstanceRefs bytes; slot empty and formalSource retired, resolver returns empty' });

    start('O07');
    for (const missing of ['blueprint', 'material']) {
      const p = env.bare(), router = new SmithServices(p), request = env.forgeRequest();
      p.inventory[missing === 'blueprint' ? request.blueprintId : request.materials[0].itemId] = 0;
      await deniedUnchanged(p, () => router.select('forge', request), `missing ${missing}`);
      mark(`O07/missing-${missing}`, { refusal: router.select('forge', request) });
    }
    for (const shortage of ['stones', 'refine_stone', 'protect_charm']) {
      const { p, refs, router } = await env.source();
      if (shortage === 'stones') p.stones = 0; else p.inventory[shortage] = 0;
      const reply = await deniedUnchanged(p, () => router.select('enhance', eReq(p, refs[0], true)), `short ${shortage}`,
        shortage === 'protect_charm' ? 'ui.smith.charm_short' : 'enhance.formal.resources');
      mark(`O07/missing-${shortage}`, { refusal: reply, noSilentCharmFallback: true });
    }
    const badMap = await env.source(), map = protectCharmMap as { itemId: string; countPerSettlement: number }, mapBefore = copy(map);
    try {
      map.itemId = 'not_a_formal_charm';
      await deniedUnchanged(badMap.p, () => badMap.router.select('enhance', eReq(badMap.p, badMap.refs[0], true)), 'invalid charm mapping', 'enhance.formal.protect');
      mark('O07/malformed-charm-map-memory-only', { refusal: 'enhance.formal.protect', sourceBytesEdited: false });
    } finally { Object.assign(map, mapBefore); }
    const noQualification = await env.source(); env.salvageOptions = { qualification: () => undefined };
    const qualificationRefusal = await deniedUnchanged(noQualification.p, () => new SmithServices(noQualification.p).select('salvage', sReq(noQualification.p, noQualification.refs[0])), 'qualification missing');
    env.salvageOptions = {};
    const gradeSource = await env.source();
    const gradeRefusal = await deniedUnchanged(gradeSource.p, () => gradeSource.router.select('salvage', { ...sReq(gradeSource.p, gradeSource.refs[0]), fromGrade: 'unknown' } as never), 'unknown grade');
    const identityRefusal = await deniedUnchanged(gradeSource.p, () => gradeSource.router.select('enhance', { ...eReq(gradeSource.p, gradeSource.refs[0]), instanceRef: 'beast_core' }), 'illegal identity');
    const corruptedType = await env.source(), badTypeRequest = cReq(corruptedType.p, corruptedType.refs[0], '金');
    corruptedType.p.enhance!.instances[0].type = 'armor';
    const typeRefusal = await deniedUnchanged(corruptedType.p, () => corruptedType.router.select('enchant', badTypeRequest), 'stored type and weapon slot mismatch');
    const corruptedGrade = await env.source(), badGradeRequest = sReq(corruptedGrade.p, corruptedGrade.refs[0]);
    (corruptedGrade.p.forge!.crafts[0] as unknown as Row).resultGrade = 'unknown';
    const storedGradeRefusal = await deniedUnchanged(corruptedGrade.p, () => corruptedGrade.router.select('salvage', badGradeRequest), 'unknown stored grade does not become common');
    const fullSource = await env.source(); env.salvageOptions = { capacity: { slots: 0 } };
    const capacityRefusal = await deniedUnchanged(fullSource.p, () => new SmithServices(fullSource.p).select('salvage', sReq(fullSource.p, fullSource.refs[0])), 'explicit finite bag capacity');
    env.salvageOptions = {};
    const fullForge = env.bare(), fullRouter = new SmithServices(fullForge), fullRequest = env.forgeRequest();
    fullForge.inventory.bamboo_sword = Number.MAX_SAFE_INTEGER;
    const overflowRefusal = await deniedUnchanged(fullForge, async () => {
      ok(fullRouter.select('forge', fullRequest).allowed, 'ownership preflight does not claim capacity success');
      return fullRouter.submit('forge', fullRequest);
    }, 'forge output overflow');
    mark('O07/qualification-grade-identity-and-full-carrier-refusals', { qualificationRefusal, gradeRefusal, identityRefusal, typeRefusal,
      storedGradeRefusal, capacityRefusal, overflowRefusal, finiteBagCapacityFixtureOnly: true, fullSaveZeroDelta: true });

    start('O08');
    for (const service of ['forge', 'enhance', 'enchant', 'salvage'] as const) {
      const { p, refs, router } = await env.source();
      const request = service === 'forge' ? env.forgeRequest() : service === 'enhance' ? eReq(p, refs[0])
        : service === 'enchant' ? cReq(p, refs[0], '火') : sReq(p, refs[0]);
      const reply = await complete(p, router, service, request as never); ok(await p.saveAsync(), `${service} manual save`);
      const loaded = await Progress.loadAsync(1), loadedRouter = new SmithServices(loaded), before = save(loaded), writes = env.writes, calls = env.randomCalls;
      eq(loadedRouter.loadRefresh(service).status, 'loaded', `${service} read-only refresh`);
      const replay = loadedRouter.result(service, request as never); eq(replay.result, reply.result, `${service} saved full result replay`);
      eq(replay.status, 'replayed', `${service} explicit old result`);
      const gateReplay = service === 'forge' ? await new ForgeGate(loaded).submit(request as SmithRequests['forge'])
        : service === 'enhance' ? await new EnhanceGate(loaded).submit(request as SmithRequests['enhance'])
        : service === 'enchant' ? await new EnchantGate(loaded).submit(request as SmithRequests['enchant'])
        : await new SalvageGate(loaded).submit(request as SmithRequests['salvage']);
      eq('result' in gateReplay ? gateReplay.result : null, reply.result, `${service} Gate matching request old result`);
      const conflict = copy(request) as unknown as Row;
      if (service === 'forge') conflict.materials = [{ itemId: 'spirit_copper', count: 999 }];
      else if (service === 'enhance') conflict.useProtectCharm = true;
      else if (service === 'enchant') conflict.element = '水'; else conflict.fromEnhanceLevel = 1;
      const conflictReply = loadedRouter.result(service, conflict as never); eq(conflictReply.allowed, false, `${service} same id changed payload rejected`);
      ok(!conflictReply.result, `${service} conflict has no claimed result`);
      const conflictGate = service === 'forge' ? await new ForgeGate(loaded).submit(conflict as unknown as SmithRequests['forge'])
        : service === 'enhance' ? await new EnhanceGate(loaded).submit(conflict as unknown as SmithRequests['enhance'])
        : service === 'enchant' ? await new EnchantGate(loaded).submit(conflict as unknown as SmithRequests['enchant'])
        : await new SalvageGate(loaded).submit(conflict as unknown as SmithRequests['salvage']);
      eq(conflictGate.allowed, false, `${service} Gate same id changed payload rejects`);
      ok(!('result' in conflictGate && conflictGate.result), `${service} conflicting Gate intent cannot reuse complete old result`);
      eq(save(loaded), before, `${service} load replay conflict zero asset delta`); eq(env.writes, writes, `${service} zero second write`);
      eq(env.randomCalls, calls, `${service} zero reroll`);
      mark(`O08/${service}-save-load-refresh-replay-conflict`, { request, result: reply.result, replay, conflictReply, conflictGate, loadedAssets: assets(loaded) });
    }

    start('O09');
    const clicks = await env.source(), clickRequest = eReq(clicks.p, clicks.refs[0]);
    ok(clicks.router.select('enhance', clickRequest).allowed, 'select before repeated click');
    const hold = env.holdNextWrite(), first = clicks.router.submit('enhance', clickRequest); await hold.started;
    const duplicate = await clicks.router.submit('enhance', clickRequest); eq(duplicate.status, 'busy', 'same request double click busy');
    const equipCompete = clicks.p.equipItem('bamboo_sword', clicks.refs[0]); eq(equipCompete.ok, false, 'existing equip operation cannot overwrite pending transaction');
    eq('reason' in equipCompete ? equipCompete.reason : null, 'save', 'equipment qualified by level and binding, refused at pending storage transaction');
    hold.release(); const once = await first; ok(once.result, 'first click one complete result');
    eq(clicks.p.enhance!.enhancements.length, 1, 'same request only one corresponding effect');
    mark('O09/repeated-click-and-existing-equip-operation', { first: once, duplicate, equipCompete, after: assets(clicks.p) });
    const compete = await env.source(), left = new SmithServices(compete.p), right = new SmithServices(compete.p);
    const leftRequest = eReq(compete.p, compete.refs[0]), rightRequest = eReq(compete.p, compete.refs[0]);
    ok(left.select('enhance', leftRequest).allowed && right.select('enhance', rightRequest).allowed, 'same instance two independent confirmations');
    const both = await Promise.all([left.submit('enhance', leftRequest), right.submit('enhance', rightRequest)]);
    eq(both.filter(row => !!row.result).length, 1, 'same instance multiple request at most one update');
    const shared = await env.source(), a = new SmithServices(shared.p), b = new SmithServices(shared.p);
    shared.p.stones = enhance.enchant.cost.stones; ok(await shared.p.saveAsync(), 'shared-resource fixture stored before confirmations');
    const ea = eReq(shared.p, shared.refs[0]), cb = cReq(shared.p, shared.refs[0], '木');
    ok(a.select('enhance', ea).allowed && b.select('enchant', cb).allowed, 'cross service shared resources preconfirmed');
    const cross = await Promise.all([a.submit('enhance', ea), b.submit('enchant', cb)]);
    eq(cross.filter(row => !!row.result).length, 1, 'cross service shared transaction exactly one write');
    const crossWinner = cross.find(row => row.result)!.result!;
    ok('stones' in crossWinner, 'resource winner records exact charge');
    eq(shared.p.stones, enhance.enchant.cost.stones - crossWinner.stones, 'shared stones match complete winning Gate result');
    ok(shared.p.stones >= 0 && Object.values(shared.p.inventory).every(n => n >= 0), 'no negative shared resources');
    mark('O09/same-instance-and-cross-service-shared-resources', { sameInstance: both, cross, after: assets(shared.p) });
    const capacityRace = await env.source();
    const occupancy = (p: Progress) => Object.entries(p.inventory).reduce((total, [id, owned]) => {
      const stack: unknown = id === 'refine_stone' ? 1 : ITEMS[id] ? Reflect.get(ITEMS[id], 'stack') : 1;
      const size = typeof stack === 'number' && Number.isSafeInteger(stack) && stack > 0 ? stack : 1;
      return total + (owned ? Math.ceil(owned / size) : 0);
    }, 0);
    const exactCapacity = occupancy(capacityRace.p);
    env.salvageOptions = { capacity: { slots: exactCapacity, stackLimit: 1 } };
    const capacitySalvage = new SmithServices(capacityRace.p), capacityEnhance = new SmithServices(capacityRace.p);
    const capacityDestroyRequest = sReq(capacityRace.p, capacityRace.refs[0]), capacityEnhanceRequest = eReq(capacityRace.p, capacityRace.refs[0]);
    ok(capacitySalvage.select('salvage', capacityDestroyRequest).allowed && capacityEnhance.select('enhance', capacityEnhanceRequest).allowed,
      'exactly full finite output capacity and shared material preconfirmed');
    const capacityResults = await Promise.all([capacitySalvage.submit('salvage', capacityDestroyRequest),
      capacityEnhance.submit('enhance', capacityEnhanceRequest)]);
    eq(capacityResults.filter(row => row.result).length, 1, 'two services at exact shared output capacity one complete transaction');
    eq(capacityRace.p.enhance!.enhancements.length + (capacityRace.p.salvage?.destructions.length ?? 0), 1,
      'shared instance capacity race exactly one effect');
    ok(occupancy(capacityRace.p) <= exactCapacity, 'cross-service output never exceeds shared finite capacity');
    eq((await saveStore.readSlot(1))!.data, capacityRace.p.exportSave(), 'cross-service capacity race full result and assets persisted together');
    env.salvageOptions = {};
    mark('O09/cross-service-exact-capacity-and-material-concurrent-race', { capacityResults, exactCapacity,
      usedCapacityAfter: occupancy(capacityRace.p), after: assets(capacityRace.p), finiteCapacitySsrOnly: true });
    const capacity = await env.source(), oldObject = await Progress.loadAsync(1);
    env.salvageOptions = { capacity: { slots: 10000 } };
    const destroyRouter = new SmithServices(capacity.p), forgeOld = new SmithServices(oldObject);
    const destroyRequest = sReq(capacity.p, capacity.refs[0]), createRequest = env.forgeRequest();
    ok(destroyRouter.select('salvage', destroyRequest).allowed && forgeOld.select('forge', createRequest).allowed,
      'shared output carrier finite capacity preconfirmed on independent objects');
    const destroyResult = await destroyRouter.submit('salvage', destroyRequest); ok(destroyResult.result, `salvage shared carrier commits first: ${JSON.stringify(destroyResult)}`);
    const durableDestruction = copy((await saveStore.readSlot(1))!.data), oldForgeResult = await forgeOld.submit('forge', createRequest);
    eq(oldForgeResult.allowed, false, 'old cross-service writer rejected by carrier'); ok(!oldForgeResult.result, 'old writer no claimed output');
    eq((await saveStore.readSlot(1))!.data, durableDestruction, 'capacity and destruction facts preserved against stale cross-service writer');
    const capacityLoaded = await Progress.loadAsync(1); eq(capacityLoaded.salvage!.destructions.length, 1, 'no revived selected instance');
    eq(capacityLoaded.count('bamboo_sword'), 0, 'stale forge cannot revive or replace destroyed equipment');
    env.salvageOptions = {};
    mark('O09/cross-service-output-carrier-and-stale-writer-cas', { destroyResult, oldForgeResult, finiteCapacitySlots: 10000,
      after: assets(capacityLoaded), staleWriterCannotDropDestructionReceipt: true });

    start('O10');
    for (const service of ['forge', 'enhance', 'enchant', 'salvage'] as const) {
      const { p, refs, router } = await env.source();
      const request = service === 'forge' ? env.forgeRequest() : service === 'enhance' ? eReq(p, refs[0])
        : service === 'enchant' ? cReq(p, refs[0], '火') : sReq(p, refs[0]);
      ok(router.select(service, request as never).allowed, `${service} save failure confirmed`);
      const before = save(p), stored = copy([...env.rows]); env.failNextWrite(); const reply = await router.submit(service, request as never);
      eq(reply.allowed, false, `${service} interrupted commit not successful`); ok(!reply.result, `${service} no partial full result`);
      eq(save(p), before, `${service} original legal state after failed save`); eq([...env.rows], stored, `${service} persisted original state`);
      const w = env.writes; router.loadRefresh(service); router.result(service, request as never); eq(env.writes, w, `${service} no automatic retry`);
      mark(`O10/${service}-save-failure-atomic-original-state`, { reply, originalAssets: assets(p), autoRetry: false });
    }
    for (const service of ['forge', 'enhance', 'enchant', 'salvage'] as const) {
      const { p, refs, router } = await env.source();
      const request = service === 'forge' ? env.forgeRequest() : service === 'enhance' ? eReq(p, refs[0])
        : service === 'enchant' ? cReq(p, refs[0], '水') : sReq(p, refs[0]);
      ok(router.select(service, request as never).allowed, `${service} lost-ack selected`);
      const before = save(p); env.failAfterNextWrite(); const unresolved = await router.submit(service, request as never);
      eq(unresolved.allowed, false, `${service} acknowledgement loss cannot claim success`); ok(!unresolved.result, `${service} acknowledgement loss no fabricated full result`);
      eq(unresolved.tipKey, 'ui.smith.result_unknown', `${service} uncertainty asks for verification rather than fake safe retry`);
      eq(save(p), before, `${service} unconfirmed memory remains original`);
      const writes = env.writes, loaded = await Progress.loadAsync(1), verified = new SmithServices(loaded).result(service, request as never);
      ok(verified.allowed && verified.result, `${service} explicit reload verifies complete durable result`);
      const check = new SmithServices(loaded).result(service, request as never); eq(check.result, verified.result, `${service} verified result stable`);
      eq(env.writes, writes, `${service} unknown-to-verified path zero retry`);
      mark(`O10/${service}-durable-write-lost-acknowledgement`, { unresolved, verified, durableAssets: assets(loaded),
        status: 'unresolved acknowledgement until explicit reload verifies complete one-time commit', automaticRetry: false });
    }
    for (const event of ['close', 'switch-slot'] as const) {
      const { p, refs, router } = await env.source(), request = eReq(p, refs[0]); ok(router.select('enhance', request).allowed, 'async selected');
      const hold = env.holdNextWrite(), pending = router.submit('enhance', request); await hold.started;
      if (event === 'close') router.invalidate(); else Progress.setActiveSlot(2);
      hold.release(); const late = await pending; eq(late.status, 'stale', `${event}: stale result hidden`); ok(!late.result, `${event}: no stale result rendering`);
      Progress.setActiveSlot(1); eq(p.enhance!.enhancements.length, 1, `${event}: Gate transaction still completes exactly once`);
      ok(!env.rows.has(2), `${event}: no write to another save slot`);
      mark(`O10/old-async-${event}-result-hidden`, { reply: late, committedOnceInOriginalSlot: true, after: assets(p) });
    }
    const unknown = await env.source(), half = copy(unknown.p.exportSave());
    (half.forge as Row).crafts = [{ state: 'committed', craftRequestId: 'half-only' }];
    const restore = (Progress as unknown as { restore(value: unknown, persist: boolean): Progress }).restore;
    const malformed = restore(half, false), malformedBefore = malformed.exportSave(), unknownRouter = new SmithServices(malformed), oldWrites = env.writes;
    const unknownReply = unknownRouter.result('forge', { ...env.forgeRequest(), craftRequestId: 'half-only' });
    eq(unknownReply.allowed, false, 'unknown half result cannot claim success'); ok(!unknownReply.result, 'no fabricated half result');
    eq(malformed.exportSave(), malformedBefore, 'unknown result no repair'); eq(env.writes, oldWrites, 'unknown result no retry or persistence');
    mark('O10/unknown-half-result-refused-without-repair', { reply: unknownReply, noRepair: true, noAutoRetry: true });
    const unknownVersion = copy(unknown.p.exportSave()); (unknownVersion.forge as Row).version = 999;
    const versionP = restore(unknownVersion, false), versionBefore = versionP.exportSave(), versionRouter = new SmithServices(versionP), versionWrites = env.writes;
    const versionReply = versionRouter.result('forge', env.forgeRequest()); eq(versionReply.allowed, false, 'unknown version cannot claim success');
    ok(!versionReply.result, 'unknown schema has no fabricated result'); eq(versionP.exportSave(), versionBefore, 'unknown schema not repaired');
    eq(env.writes, versionWrites, 'unknown schema zero auto persistence');
    mark('O10/unknown-schema-version-refused-without-repair', { reply: versionReply, noRepair: true, noAutoRetry: true });
    eq(featureFlags(), featuresBefore, 'all feature flags unchanged'); eq(protectCharmMap, mapBefore, 'in-memory anomaly fully restored');
    return { passed: true, dataMode: options.dataMode, assertions, cases, evidence,
      settlementUnchanged: true, salvageFixtureInjection: 'SSR MEMORY ONLY; production new SalvageGate(progress) untouched',
      formalSourceSeed: 'only successful default formal ForgeGate submissions; no fixtureInstances or count/itemId identity',
      o05FullSuccess: true, o05BlockReason: null, softOpenedSmithServicesUi: false, released: false, newOpenFlag: false };
  });
}
