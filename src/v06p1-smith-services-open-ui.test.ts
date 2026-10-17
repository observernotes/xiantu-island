// design/32 O-table UI fixtures: real Controller/Panel, bindings, E/I and Gate;
// only Phaser geometry and the isolated save transport are replaced.
import type Phaser from 'phaser';
import { Progress } from './Progress';
import { SmithServicesController, SMITH_SERVICES } from './SmithServicesController';
import { SmithServicesPanel } from './SmithServicesPanel';
import { GameScene } from './scenes/GameScene';
import { EquipPanel } from './EquipPanel';
import { InventoryPanel } from './InventoryPanel';
import { resolveFormalEquipSlotBinding, resolveFormalInventoryEquipBinding, listBagFormalEquipBindings } from './EquipInstBinding';
import { buildInstDisplay } from './EquipInstReadonly';
import { ForgeGate } from './ForgeGate';
import { isForgeOpenForFixture } from './ForgeOpenFlag';
import { isEnhanceOpenForFixture } from './EnhanceOpenFlag';
import { isEnchantOpenForFixture } from './EnchantOpenFlag';
import { isSalvageOpenForFixture } from './SalvageOpenFlag';
import { createIndexedDbBackend, setSaveBackend, type SaveBackend } from './SaveStore';
import { t } from './data';
import { createFormalSmithProgress, installSmithMemoryBackend } from './v06p1-smith-services-open-gates.test';

type Service = typeof SMITH_SERVICES[number];
type Row = Record<string, unknown>;
interface OpenCase { executed: true; passed: boolean; blocked?: string; evidenceKeys: string[]; evidence: Row }
interface UiOptions { dataMode?: string; graph?: string; controls?: { setRoute(value: Row): void; setGate(name: string, value: boolean): void } }
interface MockNode { children: MockNode[]; handlers: Map<string, (...args: unknown[]) => void>; add(child: MockNode): MockNode; destroy(): void }
const copy = <T>(value: T): T => structuredClone(value);
const field = <T>(target: object, name: string): T => Reflect.get(target, name) as T;
const call = <T>(target: object, name: string, receiver: unknown, ...args: unknown[]): T => Reflect.apply(field<(...values: unknown[]) => T>(target, name), receiver, args);
const flags = () => [isForgeOpenForFixture(), isEnhanceOpenForFixture(), isEnchantOpenForFixture(), isSalvageOpenForFixture()];

function mockScene() {
  const listeners = new Map<string, { fn: (...args: unknown[]) => void; context: unknown }[]>();
  const node = (value?: unknown): MockNode => {
    const target = { value, children: [] as MockNode[], handlers: new Map<string, (...args: unknown[]) => void>(),
      add(child: MockNode) { this.children.push(child); return proxy; },
      destroy() { this.children.forEach(child => child.destroy()); this.handlers.clear(); },
      on(name: string, fn: (...args: unknown[]) => void) { this.handlers.set(name, fn); return proxy; }, width: 100, height: 20 };
    const proxy: MockNode = new Proxy(target, { get(object, name) {
      return name in object ? Reflect.get(object, name) : () => proxy;
    } }) as MockNode;
    return proxy;
  };
  const scene = { input: { keyboard: {
    on(name: string, fn: (...args: unknown[]) => void, context: unknown) { const rows = listeners.get(name) ?? []; rows.push({ fn, context }); listeners.set(name, rows); },
    off(name: string, fn: (...args: unknown[]) => void, context: unknown) { listeners.set(name, (listeners.get(name) ?? []).filter(row => row.fn !== fn || row.context !== context)); },
  } }, events: { once() {} }, time: { now: 1000 }, scale: { width: 800, height: 600 },
  textures: { exists: () => false }, cache: { json: { get: () => undefined } },
  add: { container: () => node(), text: (_x: unknown, _y: unknown, value: unknown) => node(value), rectangle: () => node(), graphics: () => node(), zone: () => node(), image: () => node() } };
  return { scene: scene as unknown as Phaser.Scene,
    press(key: string, repeat = false) { for (const row of listeners.get('keydown') ?? []) Reflect.apply(row.fn, row.context, [{ key, repeat, preventDefault() {} }]); },
    advance() { scene.time.now += 200; } };
}

export async function runUiOpenCases(options: UiOptions = {}): Promise<{ cases: Record<string, OpenCase>; assertions: number }> {
  const oldSlot = Progress.getActiveSlot(), oldAccess = Object.getOwnPropertyDescriptor(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__');
  const cases: Record<string, OpenCase> = {}, tips: { key: string; vars?: Record<string, string | number> }[] = [];
  let assertions = 0;
  const ok: (value: unknown, label: string) => asserts value = (value, label) => { assertions++; if (!value) throw new Error(`UI open fixture: ${label}`); };
  const eq = (actual: unknown, expected: unknown, label: string) => {
    assertions++; if (JSON.stringify(actual) !== JSON.stringify(expected)) throw new Error(`UI open fixture: ${label}\nactual=${JSON.stringify(actual)}\nexpected=${JSON.stringify(expected)}`);
  };
  const access = (value: Row = {}) => {
    Object.defineProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__', { configurable: true, writable: true, value }); options.controls?.setRoute(value);
  };
  const record = (id: string, evidence: Row, evidenceKeys: string[], blocked?: string) => {
    cases[id] = { executed: true, passed: !blocked, ...(blocked ? { blocked } : {}), evidenceKeys,
      evidence: { ...evidence, assertionsThroughCase: assertions, dataMode: options.dataMode ?? 'runner', graph: options.graph ?? 'isolated-SSR' } };
  };
  const make = (p: Progress, currentProgress: () => Progress = () => p) => new SmithServicesController(p, { tip: (key, vars) => tips.push({ key, vars }), currentProgress });
  let store = installSmithMemoryBackend();
  const fresh = async (copies = 2) => { Progress.setActiveSlot(1); access(); store = installSmithMemoryBackend(); return createFormalSmithProgress({ slot: 1, copies }); };
  const readonly = async <T>(p: Progress, action: () => T | Promise<T>, label: string): Promise<T> => {
    const before = JSON.stringify(p.exportSave()), disk = JSON.stringify([...store.rows]), writes = store.writes; const result = await action();
    eq(JSON.stringify(p.exportSave()), before, `${label}: full business state unchanged`); eq(JSON.stringify([...store.rows]), disk, `${label}: persisted records unchanged`); eq(store.writes, writes, `${label}: no save calls`); return result;
  };
  const pointer = (panel: SmithServicesPanel, index: number) => {
    const view = field<MockNode[]>(panel, 'focusViews')[index]; ok(view?.handlers.has('pointerup'), `actual pointer callback exists for action ${index}`);
    view.handlers.get('pointerover')?.(); view.handlers.get('pointerup')!();
  };
  const actionIndex = (panel: SmithServicesPanel, label: string) => { const index = field<{ label: string }[]>(panel, 'actions').findIndex(action => action.label === label); ok(index >= 0, `rendered localized action exists: ${label}`); return index; };
  const prepare = (c: SmithServicesController, service: Service, selected?: string) => {
    ok(c.openMenu(), `${service} menu opens`); ok(c.openService(service), `${service} panel opens`);
    const target = selected ?? c.state.candidates[0]?.id; ok(target, `${service} candidate exists`); ok(c.select(target), `${service} explicit selection accepted`);
    if (service === 'enchant') ok(c.selectElement('火'), 'explicit first enchant element'); const pending = c.requestConfirm(); ok(pending, `${service} formal confirmation exists`); return pending;
  };
  try {
    eq(flags(), [true, true, true, true], 'production four service flags initially true');
    // O01: actual GameScene smith_ou dialogue, rendered mouse callbacks and key focus.
    {
      const { progress: p, refs, blueprintId } = await fresh(2), render = mockScene();
      let returnDialogue = () => {};
      const panel = new SmithServicesPanel(render.scene, p, { tip: (key, vars) => tips.push({ key, vars }), currentProgress: () => p, onClose: () => returnDialogue() });
      const choices: { label: string; onSelect(): void }[][] = [], ordinary: unknown[] = []; let marketCalls = 0, itemCloseCalls = 0;
      const scene = { prog: p, map: { id: 'luoxia_town', objects: [{ name: 'smith_ou', x: 20, y: 20 }] },
        player: { x: 20, y: 20, body: { setVelocityX() {} } }, senseMap: { objectVisible: () => true }, gathering: { cancel() {} }, closeItemPanels() { itemCloseCalls++; },
        log(text: string) { tips.push({ key: text }); },
        dialog: { choose(_line: unknown, _sprite: unknown, rows: { label: string; onSelect(): void }[]) { choices.push(rows); }, show(lines: unknown) { ordinary.push(lines); } },
        returnToSmithDialogue() { call(GameScene.prototype, 'returnToSmithDialogue', this); }, smithServices: panel, shop: { show() { marketCalls++; } } };
      returnDialogue = () => scene.returnToSmithDialogue();
      const interact = () => call<boolean>(GameScene.prototype, 'tryInteractForgeEntrance', scene);
      await readonly(p, () => {
        eq(interact(), true, 'actual nearby smith interaction consumed'); eq(panel.visible(), false, 'dialogue does not auto-open services');
        eq(choices[choices.length - 1]?.map(row => row.label), [t('ui.smith.title'), t('ui.smith.back')], 'localized dialogue service choice and Back');
        choices[choices.length - 1]![0].onSelect(); eq(panel.controller.state.stage, 'menu', 'dialogue choice enters actual menu');
        eq(field<{ label: string }[]>(panel, 'actions').slice(1).map(row => row.label), SMITH_SERVICES.map(service => t(`ui.smith.${service}`)), 'fixed four service order');
        render.advance(); render.press('Enter'); eq(panel.visible(), false, 'menu Enter starts on Back, no automatic request');
        panel.show(); render.advance(); render.press('ArrowRight'); eq(field<number>(panel, 'focus'), 1, 'ArrowRight moves menu focus'); render.press('ArrowLeft'); eq(field<number>(panel, 'focus'), 0, 'ArrowLeft moves focus back'); render.press('ArrowUp'); eq(field<number>(panel, 'focus'), 4, 'ArrowUp wraps menu focus'); render.press('ArrowDown'); eq(field<number>(panel, 'focus'), 0, 'ArrowDown wraps back'); render.press('ArrowDown'); render.press('Enter'); eq(panel.controller.state.service, 'forge', 'ArrowDown + Enter activates focused forge');
        eq(panel.controller.state.selected, undefined, 'no default recipe selection'); eq(panel.controller.requestConfirm(), null, 'unselected recipe cannot confirm');
        pointer(panel, 1); eq(panel.controller.state.selected, panel.controller.state.candidates[0].id, 'actual mouse selects candidate');
        const recipes = panel.controller.state.candidates; if (recipes.length > 1) { pointer(panel, 2); eq(panel.controller.state.selected, recipes[1].id, 'mouse changes recipe'); }
        ok(panel.controller.select(blueprintId), 'explicit formal recipe selected'); pointer(panel, actionIndex(panel, t('ui.confirm')));
        eq(panel.controller.state.stage, 'confirm', 'mouse opens confirmation only'); eq(field<number>(panel, 'focus'), 0, 'confirmation focuses safe Back');
        render.press('Enter'); eq(panel.controller.state.stage, 'panel', 'confirmation Enter returns without submitting');
        panel.controller.requestConfirm(); render.press('ArrowDown'); render.press('Enter'); eq(panel.controller.state.stage, 'panel', 'keyboard Cancel returns without cost');
        panel.controller.requestConfirm(); render.press('Escape'); eq(panel.controller.state.stage, 'panel', 'Esc cancels confirmation'); render.press('Escape'); eq(panel.controller.state.stage, 'menu', 'Esc panel to menu');
        for (const service of SMITH_SERVICES) {
          pointer(panel, actionIndex(panel, t(`ui.smith.${service}`))); eq(panel.controller.state.service, service, `mouse routes only to ${service}`);
          eq(panel.controller.state.stage, 'panel', `${service} opens without submit`); eq(panel.controller.state.selected, undefined, `${service} no implicit selection`);
          if (service !== 'forge') {
            ok(panel.controller.select(refs[0]), `${service} exact first ref`);
            if (service === 'enhance') { ok(panel.controller.setProtectCharm(true), 'explicit charm option'); ok(panel.controller.requestConfirm(), 'enhance old confirmation exists'); }
            if (service === 'enchant') { ok(panel.controller.selectElement('火'), 'explicit enchant target'); ok(panel.controller.requestConfirm(), 'enchant old confirmation exists'); ok(panel.controller.selectElement('水'), 'changing element allowed'); eq(panel.controller.pending, null, 'element change clears old confirm'); }
            ok(panel.controller.select(refs[1]), `${service} change exact second ref`); eq(panel.controller.pending, null, `${service} change clears confirmation`);
          }
          render.press('Escape'); eq(panel.controller.state.stage, 'menu', `${service} Esc returns menu`);
        }
        render.press('Escape'); eq(panel.visible(), false, 'Esc closes menu');
      }, 'O01 dialogue/menu/four-panel keyboard and mouse');
      eq(marketCalls, 0, 'smith never opens market'); ok(ordinary.length >= 2, 'actual scene returns to ordinary smith dialogue after menu closes'); ok(itemCloseCalls > 0, 'scene closes item views before service dialogue'); eq(p.forge?.crafts.length, 2, 'routes create no new craft');
      record('O01', { actualGameSceneRoute: true, actualControllerAndPanel: true, renderedPointerCallbacks: true, arrowEnterEscExecuted: true, enterDefaultSubmit: false,
        unselectedAndReselectionExecuted: true, cancellationAssetDelta: 0, marketCalls, servicesMetadataIsAuthorization: false },
      ['O01/actual-smith-dialogue-menu-four-panels', 'O01/actual-pointer-and-arrow-enter-escape', 'O01/confirm-cancel-readonly-no-default-submit']);
    }
    // O06: two real formally forged copies; exact slot/bag positions and unchanged E/I.
    {
      const { progress: p, refs } = await fresh(2), itemId = p.enhance!.instances.find(row => row.instanceRef === refs[0])!.itemId;
      eq(await p.runSaveTransactionAsync(draft => draft.equipItem(itemId, refs[0]).ok ? true : undefined), true, 'official equip transaction commits selected formal ref');
      eq(resolveFormalEquipSlotBinding(p, 'weapon'), { kind: 'verified', instanceRef: refs[0] }, 'exact equipped binding'); eq(listBagFormalEquipBindings(p), [{ id: itemId, instanceRef: refs[1] }], 'other same prototype remains bag row');
      eq(resolveFormalInventoryEquipBinding(p, { id: itemId, instanceRef: refs[1] }), { kind: 'verified', instanceRef: refs[1] }, 'exact bag binding'); eq(resolveFormalInventoryEquipBinding(p, { id: itemId }), { kind: 'no_instance' }, 'itemId never fabricates ref');
      const e = new EquipPanel(mockScene().scene, p, () => { throw new Error('O06 readonly E'); }), i = new InventoryPanel(mockScene().scene, p, { onChanged() { throw new Error('O06 readonly I'); }, openAlchemy: () => false, openSectToken: () => false });
      e.open(); i.open(); i.setTab('equip'); const eBefore = copy(e.snapshot()), iBefore = copy(i.snapshot()), c = make(p), attributesBefore = e.snapshot().attributes;
      await readonly(p, () => {
        c.openMenu(); c.openService('enhance'); eq(c.state.candidates.map(row => row.id).sort(), [...refs].sort(), 'distinct same-prototype refs'); eq(c.state.selected, undefined, 'no auto-first selection');
        ok(c.select(refs[0]), 'explicit equipped copy'); ok(c.select(refs[1]), 'explicit bag copy'); eq(c.select(itemId), false, 'itemId cannot impersonate instanceRef');
        ok(c.select(refs[1]), 'reselect exact bag copy'); const pending = c.requestConfirm(); ok(pending, 'formal confirmation'); ok('instanceRef' in pending.request, 'precise ref field'); eq(pending.request.instanceRef, refs[1], 'request addresses selected copy only');
        e.update(); i.update(); eq(e.snapshot(), eBefore, 'E text unchanged before result'); eq(i.snapshot(), iBefore, 'I text unchanged before result'); c.back(); ok(c.select(refs[1]), 'cancel permits explicit reselect');
      }, 'O06 selection and E-I readonly');
      const pending = c.requestConfirm(); ok(pending, 'selected copy confirm'); const random = Math.random; let result;
      try { Math.random = () => 0; result = await c.submit(pending); } finally { Math.random = random; } ok(result?.allowed && 'result' in result && result.result, 'actual Gate selected copy submits'); eq(c.state.stage, 'result', 'complete result rendered');
      eq(p.enhance!.instances.find(row => row.instanceRef === refs[0])!.enhanceLevel, 0, 'unselected equipped untouched'); eq(p.enhance!.instances.find(row => row.instanceRef === refs[1])!.enhanceLevel, 1, 'selected bag copy enhanced');
      e.update(); i.update(); eq(e.snapshot().instDisplay, eBefore.instDisplay, 'equipped attribute text original'); eq(e.snapshot().attributes, attributesBefore, 'bag enhance does not prewrite character attributes'); ok(!e.snapshot().status && !i.snapshot().status, 'outcome never contaminates E/I status'); eq(i.snapshot().instKind, 'no_instance', 'aggregate I remains unmapped');
      const display = buildInstDisplay(p, resolveFormalInventoryEquipBinding(p, { id: itemId, instanceRef: refs[1] })); eq(display.kind, 'verified', 'exact bag reader stays formal'); ok(display.lines.some(row => row.key === 'ui.equip.inst.enhance_level'), 'exact selected bag reader reflects committed +1');
      e.close(); i.close(); e.open(); i.open(); i.setTab('equip'); e.update(); i.update(); eq(e.snapshot().instDisplay, eBefore.instDisplay, 'E reopen original instance'); ok(!e.snapshot().status && !i.snapshot().status, 'E/I reopen do not inherit success text');
      record('O06', { formalCopies: refs.length, selectedRef: refs[1], untouchedRef: refs[0], actualEquipPanelAndInventoryPanel: true, exactFormalEquipmentOperation: true,
        preSubmitEiDelta: 0, aggregateItemIdRejected: true, selectedOnlyLevelChange: true, itemId, formalBindingReplaced: false },
      ['O06/two-real-forged-copies-exact-equip-bag-bindings', 'O06/E-I-before-submit-and-after-reopen-readonly', 'O06/only-explicit-instance-ref-settled']);
    }
    // O10: only save transport is delayed/failed. Successful Gate commits remain real.
    {
      const interruptions: Row[] = [];
      for (const interrupt of ['close-view', 'switch-slot', 'replace-current-progress', 'close-ui'] as const) {
        const { progress: p } = await fresh(1), before = JSON.stringify(p.exportSave()); let current = p;
        const c = make(p, () => current), pending = prepare(c, 'forge'), rows = store.rows, diskBefore = JSON.stringify([...rows]);
        let release!: () => void, started!: () => void, writeCalls = 0; const entered = new Promise<void>(resolve => { started = resolve; }), delayed = new Promise<void>(resolve => { release = resolve; });
        const backend: SaveBackend = { async read(slot) { return copy(rows.get(slot) ?? null); }, async write(slot) { writeCalls++; started(); await delayed; rows.set(slot.slotKey, copy(slot)); }, async delete(slot) { rows.delete(slot); }, async insertIfEmpty(slot) { if (rows.has(slot.slotKey)) return false; rows.set(slot.slotKey, copy(slot)); return true; } };
        setSaveBackend(backend); const operation = c.submit(pending); await entered;
        eq(c.state.stage, 'submitting', `${interrupt}: Gate awaits save`); eq(JSON.stringify(p.exportSave()), before, `${interrupt}: draft unpublished before save`); eq(JSON.stringify([...rows]), diskBefore, `${interrupt}: persisted original pending`);
        eq(c.select(c.state.candidates[0]?.id ?? ''), false, `${interrupt}: pending target cannot change`); eq(await c.submit(pending), null, `${interrupt}: duplicate submit blocked`);
        let replacementBefore = '';
        if (interrupt === 'close-view') c.back();
        if (interrupt === 'switch-slot') { Progress.setActiveSlot(2); current = new Progress(); replacementBefore = JSON.stringify(current.exportSave()); c.poll(); }
        if (interrupt === 'replace-current-progress') { current = new Progress(); replacementBefore = JSON.stringify(current.exportSave()); c.poll(); }
        if (interrupt === 'close-ui') { access({ entrance: false }); c.poll(); }
        eq(c.state.stage, 'closed', `${interrupt}: interrupted view cleared`); release(); await operation;
        eq(c.state.resultLines, [], `${interrupt}: late result never renders`); eq(c.state.stage, 'closed', `${interrupt}: late callback cannot reopen`); eq(writeCalls, 1, `${interrupt}: one save`);
        eq(p.forge!.crafts.length, 2, `${interrupt}: original-slot transaction commits once`); ok(rows.has(1) && !rows.has(2), `${interrupt}: original slot preserved`);
        if (replacementBefore) eq(JSON.stringify(current.exportSave()), replacementBefore, `${interrupt}: replacement character unchanged`);
        Progress.setActiveSlot(1); current = p; access(); ok(c.openMenu(), `${interrupt}: reopen`); ok(c.openService('forge'), `${interrupt}: inspect fixed original result`);
        eq(c.state.stage, 'result', `${interrupt}: original complete result recovered`); eq(c.state.resultLines[0], t('ui.smith.load_dedupe'), `${interrupt}: recovery explicitly readonly`); eq(writeCalls, 1, `${interrupt}: reopen no retry`);
        interruptions.push({ interrupt, originalSlot: 1, writeCalls, realGateCommit: true, staleResultRendered: false, automaticRetries: 0 });
      }
      {
        const { progress: p } = await fresh(1), c = make(p), pending = prepare(c, 'forge'), before = JSON.stringify(p.exportSave()), disk = JSON.stringify([...store.rows]); let calls = 0;
        setSaveBackend({ async read(slot) { return copy(store.rows.get(slot) ?? null); }, async write() { calls++; throw new Error('O10 deliberate transport failure'); }, async delete() {}, async insertIfEmpty() { return false; } });
        const result = await c.submit(pending); ok(result && !result.allowed, 'save failure actual Gate refusal'); eq(c.state.stage, 'panel', 'failed save panel'); eq(c.state.resultLines, [], 'failed save no success'); eq(JSON.stringify(p.exportSave()), before, 'failed save original complete assets'); eq(JSON.stringify([...store.rows]), disk, 'failed save original persisted state'); eq(calls, 1, 'failed save no auto retry');
        c.refresh(); c.close(); c.openMenu(); c.openService('forge'); eq(calls, 1, 'refresh reopen no retry'); interruptions.push({ interrupt: 'save-failure', writeCalls: calls, gateRefusal: result, originalAssetsPreserved: true, automaticRetries: 0 });
      }
      const unknownRecords: Row[] = [];
      for (const damaged of ['unknown-version', 'half-result', 'missing-receipt'] as const) {
        const { progress: p } = await fresh(1), raw = copy(p.exportSave()), forge = raw.forge as Row;
        if (damaged === 'unknown-version') forge.version = 99; if (damaged === 'half-result') forge.crafts = [{ state: 'committed', craftRequestId: 'half' }]; if (damaged === 'missing-receipt') forge.receipts = [];
        const restored = call<Progress>(Progress, 'restore', Progress, raw, false), c = make(restored), before = JSON.stringify(restored.exportSave()), disk = JSON.stringify([...store.rows]), writes = store.writes;
        c.openMenu(); c.openService('forge'); c.select(c.state.candidates[0].id); eq(c.requestConfirm(), null, `${damaged}: malformed old record cannot confirm`); eq(await c.submit(), null, `${damaged}: unconfirmed never dispatches`); c.refresh(); eq(c.state.resultLines, [], `${damaged}: no success`); eq(JSON.stringify(restored.exportSave()), before, `${damaged}: no repair`); eq(JSON.stringify([...store.rows]), disk, `${damaged}: no disk overwrite`); eq(store.writes, writes, `${damaged}: no saves`);
        unknownRecords.push({ damaged, realRestore: true, acceptedResult: false, autoRepair: false, autoRetry: false });
      }
      {
        const { progress: p } = await fresh(1), c = make(p), pending = prepare(c, 'forge'), original = ForgeGate.prototype.submit; let calls = 0;
        ForgeGate.prototype.submit = async function (...args) { calls++; await Reflect.apply(original, this, args); throw new Error('O10 reply lost after real settlement'); };
        try {
          await c.submit(pending); eq(c.state.stage, 'panel', 'lost reply unresolved'); eq(c.state.resultLines, [], 'lost reply no fake success/failure'); eq(p.forge!.crafts.length, 2, 'lost reply committed once'); eq(c.requestConfirm(), null, 'unresolved no replacement'); await c.submit(pending); eq(calls, 1, 'unresolved no retry'); ok(c.refresh(), 'refresh reads original committed result'); eq(c.state.stage, 'result', 'complete original result resolves unknown'); eq(calls, 1, 'recovery no second submit');
          interruptions.push({ interrupt: 'lost-reply-after-commit', realGateCommit: true, calls, fakeSuccessBeforeRecovery: false, readOnlyOriginalResultRecovered: true });
        } finally { ForgeGate.prototype.submit = original; }
      }
      record('O10', { actualGateTransactions: true, saveTransportFaultsOnly: true, interruptions, unknownRestoredRecords: unknownRecords, automaticRetry: false, crossSlotRendering: false, secondRecoveryQueue: false, completeStateOrOriginalState: true },
      ['O10/real-Gate-pending-close-switch-replace-and-ui-close', 'O10/save-failure-atomic-original-state', 'O10/unknown-half-records-rejected-without-repair', 'O10/lost-reply-fixed-intent-readonly-recovery']);
    }
    // O11: three real available result routes; unavailable salvage success is never checked off.
    {
      const returns: Row[] = [];
      for (const service of ['forge', 'enhance', 'enchant'] as const) {
        const { progress: p } = await fresh(1), render = mockScene(), panel = new SmithServicesPanel(render.scene, p, { tip: (key, vars) => tips.push({ key, vars }), currentProgress: () => p });
        const pending = prepare(panel.controller, service), result = await panel.controller.submit(pending); ok(result?.allowed && 'result' in result && result.result, `${service}: real complete Gate result`); eq(panel.controller.state.stage, 'result', `${service}: result view`);
        const before = JSON.stringify(p.exportSave()), writes = store.writes; pointer(panel, actionIndex(panel, t('ui.smith.title'))); eq(panel.controller.state.stage, 'menu', `${service}: actual result Menu pointer`); eq(panel.controller.state.resultLines, [], `${service}: old success cleared`); eq(JSON.stringify(p.exportSave()), before, `${service}: return readonly`); eq(store.writes, writes, `${service}: return no save`); returns.push({ service, realCompleteResult: true, actualRenderedMenuPointer: true, returnWrites: 0 });
      }
      const { progress: p, refs } = await fresh(2), c = make(p), closedScopes: Row[] = [];
      for (const scope of ['entrance', 'menu', ...SMITH_SERVICES] as const) {
        access(); prepare(c, 'enhance', refs[0]); const oldPending = c.pending; access({ [scope]: false }); tips.length = 0;
        await readonly(p, async () => {
          if (scope === 'entrance' || scope === 'menu') { eq(c.openMenu(), false, `${scope}: menu refuses`); await c.submit(oldPending); for (const service of SMITH_SERVICES) eq(c.openService(service), false, `${scope}: ${service} refuses`); }
          else { eq(c.openService(scope), false, `${scope}: panel refuses`); await c.submit({ ...oldPending!, service: scope }); }
          eq(c.state.resultLines, [], `${scope}: stale success cleared`); ok(tips.length && tips.every(row => row.key === 'ui.smith.closed'), `${scope}: exact closed tip`);
        }, `O11 isolated scope ${scope}`);
        eq(flags(), [true, true, true, true], `${scope}: no flag flip`); closedScopes.push({ scope, originalStatePreserved: true, zeroWrites: true, flagValues: flags() });
      }
      access(); const e = new EquipPanel(mockScene().scene, p, () => { throw new Error('O11 readonly E'); }), i = new InventoryPanel(mockScene().scene, p, { onChanged() { throw new Error('O11 readonly I'); }, openAlchemy: () => false, openSectToken: () => false });
      e.open(); i.open(); i.setTab('equip'); const eBefore = copy(e.snapshot()), iBefore = copy(i.snapshot()); access({ entrance: false, menu: false, forge: false, enhance: false, enchant: false, salvage: false });
      await readonly(p, () => { e.update(); i.update(); eq(e.snapshot(), eBefore, 'six scope closure E independent'); eq(i.snapshot(), iBefore, 'six scope closure I independent'); }, 'O11 E-I independent'); eq(flags(), [true, true, true, true], 'final four flags preserved'); access();
      record('O11', { completedResultReturns: returns, deliberateClosedScopes: closedScopes, realEiPreserved: true, closedRegressionRequired: true, frozenByteChecksOwnedByRunner: true,
        salvageResultReturnExecuted: false, salvageNewSubmissionAuthorizedByFixture: false, smithServicesUiWired: true, softOpenedSmithServicesUi: false, released: false, newOpenFlag: false },
      ['O11/forge-enhance-enchant-real-results-return-menu', 'O11/six-scope-deliberate-closed-zero-write', 'O11/E-I-independent-of-all-UI-scopes', 'O11/salvage-result-return-blocked-by-formal-dependency'], 'O11_partial_salvage_result_return_requires_O05_formal_qualification');
    }
    return { cases, assertions };
  } finally {
    Progress.setActiveSlot(oldSlot); setSaveBackend(createIndexedDbBackend()); if (oldAccess) Object.defineProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__', oldAccess); else Reflect.deleteProperty(globalThis, '__XT_SMITH_SERVICES_UI_ACCESS__'); options.controls?.setRoute({});
  }
}
