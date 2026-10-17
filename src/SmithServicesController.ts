import recipes from '@xt/balance/recipes.json';
import rules from '@xt/balance/enhance.json';
import charm from '@xt/balance/enhance_protect_charm.json';
import { ITEMS, inPhase, t } from './data';
import { Progress, type EquipSlot } from './Progress';
import { ForgeGate, type ForgeCraftRequest, type ForgeGateResult } from './ForgeGate';
import { EnhanceGate, type EnhanceRequest, type EnhanceGateResult } from './EnhanceGate';
import { EnchantGate, type EnchantRequest, type EnchantGateResult } from './EnchantGate';
import { SalvageGate, type SalvageRequest, type SalvageGateResult } from './SalvageGate';
import { isForgeGrade } from './ForgeProgress';
import { isEnchantElement, type EnchantElement } from './EnchantProgress';
import { listBagFormalEquipBindings, resolveFormalEquipSlotBinding, resolveFormalInventoryEquipBinding } from './EquipInstBinding';
import { buildInstDisplay } from './EquipInstReadonly';
import { isSmithServicesUiAccessible, type SmithService } from './SmithServicesUiAccess';

export const SMITH_SERVICES: readonly SmithService[] = ['forge', 'enhance', 'enchant', 'salvage'];
export const SMITH_ELEMENTS: readonly EnchantElement[] = ['金', '木', '水', '火', '土'];
type GateResult = ForgeGateResult | EnhanceGateResult | EnchantGateResult | SalvageGateResult;
type Request = ForgeCraftRequest | EnhanceRequest | EnchantRequest | SalvageRequest;
export interface SmithCandidate { id: string; itemId: string; name: string; location?: string; lines: string[] }
export interface SmithPending {
  readonly service: SmithService;
  readonly request: Request;
  readonly session: number;
  readonly slot: number;
  readonly snapshot: string;
  readonly itemId: string;
}
export interface SmithServicesState {
  stage: 'closed' | 'menu' | 'panel' | 'confirm' | 'submitting' | 'result';
  service?: SmithService;
  candidates: SmithCandidate[];
  selected?: string;
  element?: EnchantElement;
  useProtectCharm: boolean;
  details: string[];
  resultLines: string[];
  pending: SmithPending | null;
}
export interface SmithServicesHooks {
  tip: (key: string, vars?: Record<string, string | number>) => void;
  changed?: () => void;
  /** The scene's current object prevents callbacks from an old loaded character. */
  currentProgress?: () => Progress;
}
const clone = <T>(value: T): T => structuredClone(value);
const freeze = <T>(value: T): T => {
  if (value && typeof value === 'object') {
    for (const nested of Object.values(value)) freeze(nested);
    Object.freeze(value);
  }
  return value;
};
const itemName = (id: string) => ITEMS[id]?.name;
const cost = (itemId: string, count: number) => t('encounter.ui.cost_item', { item: itemName(itemId) ?? t('ui.smith.result_unknown'), n: count });
const owned = (prog: Progress, itemId: string, need: number) => t('talisman.material_count', {
  name: itemName(itemId) ?? t('ui.smith.result_unknown'), owned: prog.permanentCount(itemId), need,
});
const ownedStones = (prog: Progress, need: number) => t('talisman.material_count', { name: t('ui.stone'), owned: prog.stones, need });
const stoneCost = (n: number) => t('encounter.ui.cost_item', { item: t('ui.stone'), n });
const emptyState = (): SmithServicesState => ({ stage: 'closed', candidates: [], useProtectCharm: false, details: [], resultLines: [], pending: null });

/** View memory only: no inventory, persistence, random, receipts, or fixture authority. */
export class SmithServicesController {
  private model = emptyState();
  private session = 0;
  private slot = Progress.getActiveSlot();
  private gates: { forge: ForgeGate; enhance: EnhanceGate; enchant: EnchantGate; salvage: SalvageGate };
  private unresolved = false;
  private unresolvedIntent: SmithPending | null = null;
  private activePending: SmithPending | null = null;

  constructor(private readonly progress: Progress, private readonly hooks: SmithServicesHooks) {
    this.gates = { forge: new ForgeGate(progress), enhance: new EnhanceGate(progress), enchant: new EnchantGate(progress), salvage: new SalvageGate(progress) };
  }
  get state(): SmithServicesState { return clone(this.model); }
  get pending(): SmithPending | null { return this.model.pending; }
  private emit() { this.hooks.changed?.(); }
  private tip(key: string, vars?: Record<string, string | number>) { this.hooks.tip(key, vars); }
  private reset(stage: SmithServicesState['stage'] = 'closed') {
    this.session++; this.model = emptyState(); this.model.stage = stage; this.emit();
  }
  close() { this.reset(); }
  private sameCharacter(): boolean {
    return this.slot === Progress.getActiveSlot() && (!this.hooks.currentProgress || this.hooks.currentProgress() === this.progress);
  }
  /** Also used by the dialogue route, before constructing a menu. */
  guardEntrance(): boolean {
    if (!isSmithServicesUiAccessible('entrance')) { this.reset(); this.tip('ui.smith.closed'); return false; }
    return true;
  }
  private guard(service?: SmithService, action = 'entrance', notify = true): boolean {
    if (!isSmithServicesUiAccessible('entrance') || !isSmithServicesUiAccessible('menu')) {
      this.reset(); if (notify) this.tip('ui.smith.closed'); return false;
    }
    if (!this.sameCharacter()) {
      this.reset(); if (notify) this.tip('ui.smith.changed'); return false;
    }
    if (service && !isSmithServicesUiAccessible(service)) {
      this.reset('menu'); if (notify) this.tip('ui.smith.closed'); return false;
    }
    if (service) {
      const entrance = this.gates[service].entrance();
      if (!entrance.allowed) {
        this.reset('menu');
        if (notify) this.tip(!entrance.allowed && entrance.tipKey.startsWith(`${service}.closed.`)
          ? `${service}.closed.${action}` : this.rejectionKey(service, entrance));
        return false;
      }
    }
    return true;
  }
  openMenu(): boolean {
    if (!this.guard()) return false;
    this.reset('menu'); return true;
  }
  openService(service: SmithService): boolean {
    if (!SMITH_SERVICES.includes(service) || !this.guard(service)) return false;
    if (this.activePending) { this.tip('ui.smith.busy'); return false; }
    this.reset('panel'); this.model.service = service;
    this.reloadCandidates(); this.emit();
    if (this.unresolved && this.unresolvedIntent?.service === service) this.refresh();
    return true;
  }
  serviceAvailability(service: SmithService): { available: boolean; tipKey?: string } {
    if (!isSmithServicesUiAccessible(service)) return { available: false, tipKey: 'ui.smith.closed' };
    const entrance = this.gates[service].entrance();
    return entrance.allowed ? { available: true } : { available: false, tipKey: this.rejectionKey(service, entrance) };
  }
  /** Called every frame: a stale view clears silently, with no deferred action. */
  poll(): boolean {
    return this.model.stage === 'closed' || this.guard(this.model.service, 'no_submit', false);
  }
  private forgeRows() {
    return recipes.recipes.filter(row => row.type === 'forge' && 'blueprint' in row && 'outputCount' in row)
      .filter(row => typeof row.blueprint === 'string' && typeof row.outputCount === 'number'
        && !!ITEMS[row.blueprint] && !!ITEMS[row.output] && inPhase(ITEMS[row.output])
        && ITEMS[row.output].enabled !== false && ITEMS[row.output].placeholder !== true);
  }
  private reloadCandidates() {
    const service = this.model.service;
    this.model.candidates = [];
    if (!service) return;
    if (service === 'forge') {
      this.model.candidates = this.forgeRows().map(row => ({ id: row.blueprint!, itemId: row.output, name: itemName(row.output)!, lines: [] }));
      return;
    }
    const add = (id: string, itemId: string, location: string) => {
      if (!itemName(itemId) || this.model.candidates.some(row => row.id === id)) return;
      const display = buildInstDisplay(this.progress, { kind: 'verified', instanceRef: id });
      if (display.kind !== 'verified') return;
      const inst = this.progress.formalEnhanceInstances().find(row => row.instanceRef === id);
      if (!inst || service === 'enchant' && inst.type !== 'weapon') return;
      this.model.candidates.push({ id, itemId, name: itemName(itemId)!, location, lines: display.lines.map(line => line.text) });
    };
    for (const slot of ['weapon', 'robe', 'shoes'] as EquipSlot[]) {
      const binding = resolveFormalEquipSlotBinding(this.progress, slot);
      if (binding.kind === 'verified') add(binding.instanceRef, this.progress.equip[slot], t(`ui.slot.${slot}`));
    }
    for (const row of listBagFormalEquipBindings(this.progress)) {
      const binding = resolveFormalInventoryEquipBinding(this.progress, row);
      if (binding.kind === 'verified') add(binding.instanceRef, row.id, t('ui.inventory'));
    }
  }
  private editable(): boolean {
    const service = this.model.service;
    if (!this.guard(service, 'no_submit')) return false;
    if (!service || this.model.stage === 'closed' || this.model.stage === 'menu') return false;
    if (this.activePending || this.model.stage === 'submitting') { this.tip('ui.smith.busy'); return false; }
    if (this.unresolved) { this.tip('ui.smith.result_unknown'); return false; }
    return true;
  }
  select(id: string): boolean {
    if (!this.editable()) return false;
    this.reloadCandidates();
    const candidate = this.model.candidates.find(row => row.id === id);
    if (!candidate) {
      this.model.pending = null; this.model.selected = undefined; this.model.resultLines = []; this.model.details = []; this.model.stage = 'panel';
      this.tip(this.model.service === 'forge' ? 'ui.smith.no_recipe' : this.progress.formalEnhanceInstanceStatus(id) === 'foreign' ? 'ui.smith.foreign' : 'ui.smith.no_instance');
      this.emit(); return false;
    }
    this.model.selected = id; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.model.useProtectCharm = false; this.model.element = undefined; this.updateDetails(); this.emit(); return true;
  }
  selectElement(element: EnchantElement): boolean {
    if (!this.editable() || this.model.service !== 'enchant' || !isEnchantElement(element)) return false;
    this.model.element = element; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.updateDetails(); this.emit(); return true;
  }
  setProtectCharm(use: boolean): boolean {
    if (!this.editable() || this.model.service !== 'enhance' || typeof use !== 'boolean') return false;
    this.model.useProtectCharm = use; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.updateDetails(); this.emit(); return true;
  }
  private buildRequest(id: string): Request | null {
    const candidate = this.model.candidates.find(row => row.id === this.model.selected);
    const service = this.model.service;
    if (!candidate || !service) return null;
    if (service === 'forge') {
      const row = this.forgeRows().find(row => row.blueprint === candidate.id);
      return row ? { craftRequestId: id, blueprintId: row.blueprint!, materials: row.materials.map(m => ({ itemId: m.item, count: m.count })) } : null;
    }
    const instance = this.progress.formalEnhanceInstances().find(row => row.instanceRef === candidate.id);
    if (!instance) return null;
    if (service === 'enhance') return { enhanceRequestId: id, instanceRef: instance.instanceRef,
      fromLevel: instance.enhanceLevel, to: instance.enhanceLevel + 1, useProtectCharm: this.model.useProtectCharm };
    if (service === 'enchant') {
      const element = this.model.element;
      if (!isEnchantElement(element)) return null;
      return { enchantRequestId: id, instanceRef: instance.instanceRef,
        fromElement: this.progress.enchant?.instances.find(row => row.instanceRef === instance.instanceRef)?.element ?? null, element };
    }
    const source = this.progress.enhance?.formalSources?.find(row => row.instanceRef === instance.instanceRef);
    const craft = this.progress.forge?.crafts.find(row => row.craftResultRef === source?.craftResultRef);
    return craft && isForgeGrade(craft.resultGrade) ? { salvageRequestId: id, instanceRef: instance.instanceRef,
      fromGrade: craft.resultGrade, fromEnhanceLevel: instance.enhanceLevel } : null;
  }
  private read(service: SmithService, request: Request): GateResult {
    if (service === 'forge') return this.gates.forge.craft(request as ForgeCraftRequest);
    if (service === 'enhance') return this.gates.enhance.enhance(request as EnhanceRequest);
    if (service === 'enchant') return this.gates.enchant.enchant(request as EnchantRequest);
    return this.gates.salvage.salvage(request as SalvageRequest);
  }
  private updateDetails() {
    const service = this.model.service, candidate = this.model.candidates.find(row => row.id === this.model.selected);
    this.model.details = [];
    if (!service || !candidate) return;
    const lines = [candidate.name, ...(candidate.location ? [candidate.location] : []), ...candidate.lines];
    const request = this.buildRequest('smith_ui_preview');
    if (service === 'forge') {
      const recipe = this.forgeRows().find(row => row.blueprint === candidate.id);
      if (recipe) lines.push(owned(this.progress, recipe.blueprint!, 1), ...recipe.materials.map(row => owned(this.progress, row.item, row.count)), `${itemName(recipe.output)} ×${recipe.outputCount}`);
    } else if (service === 'enhance' && request && 'to' in request) {
      const read = this.read(service, request);
      const row = read.allowed && 'row' in read ? read.row : rules.levels.find(row => row.to === request.to);
      if (row) lines.push(t('ui.smith.enhance_preview', { level: row.to, rate: Number((row.rate * 100).toFixed(8)) }),
        t(row.dropOnFail && !(request.useProtectCharm && read.allowed) ? 'ui.smith.drop_on_fail' : 'ui.smith.no_drop_on_fail', { n: 1 }),
        ownedStones(this.progress, row.stones), owned(this.progress, 'refine_stone', row.refineStones));
      else lines.push(t('enhance.formal.max_level'));
      if (request.useProtectCharm) lines.push(owned(this.progress, charm.itemId, charm.countPerSettlement));
      if (!read.allowed) lines.push(t(this.rejectionKey(service, read), { service: t(`ui.smith.${service}`) }));
    } else if (service === 'enchant') {
      lines.push(ownedStones(this.progress, rules.enchant.cost.stones), ...rules.enchant.cost.materials.map(row => owned(this.progress, row.item, row.count)));
    } else if (service === 'salvage' && request && 'fromGrade' in request) {
      lines.push(t(`forge.grade.${request.fromGrade}`));
      const read = this.read(service, request);
      if (read.allowed && 'output' in read && read.output) lines.push(t('ui.smith.output_preview', { output: `${itemName(read.output.itemId)} ×${read.output.count}` }));
      else if (!read.allowed) lines.push(t(this.rejectionKey(service, read), { service: t(`ui.smith.${service}`) }));
    }
    this.model.details = lines;
  }
  private snapshot(): string {
    const candidate = this.model.candidates.find(row => row.id === this.model.selected);
    return JSON.stringify({ candidate, selected: this.model.selected, element: this.model.element, charm: this.model.useProtectCharm,
      inventory: this.progress.inventory, stones: this.progress.stones, equip: this.progress.equip, refs: this.progress.equipInstanceRefs,
      forge: this.progress.forge, enhance: this.progress.enhance, enchant: this.progress.enchant, salvage: this.progress.salvage, root: this.progress.rootElement });
  }
  requestConfirm(): SmithPending | null {
    if (!this.editable()) return null;
    const service = this.model.service!;
    this.reloadCandidates();
    if (this.model.pending && this.model.pending.snapshot === this.snapshot()) return this.model.pending;
    const request = this.buildRequest(`smith_ui_${crypto.randomUUID()}`);
    if (!request) { this.tip('ui.smith.selection_required', { service: t(`ui.smith.${service}`) }); return null; }
    const checked = this.read(service, request);
    if (!checked.allowed) { this.tip(this.rejectionKey(service, checked), { service: t(`ui.smith.${service}`) }); return null; }
    const candidate = this.model.candidates.find(row => row.id === this.model.selected)!;
    const pending: SmithPending = freeze({ service, request: clone(request), session: this.session,
      slot: this.slot, snapshot: this.snapshot(), itemId: candidate.itemId });
    this.model.pending = pending; this.model.stage = 'confirm'; this.model.resultLines = []; this.updateDetails();
    let confirm = t('ui.smith.confirm', { service: t(`ui.smith.${service}`) });
    if (service === 'salvage') confirm = t('ui.smith.confirm_salvage', { item: candidate.name });
    if (service === 'enchant' && 'fromElement' in request) confirm = t('ui.smith.confirm_enchant', {
      item: candidate.name, from: request.fromElement ?? t('ui.equip.inst.no_enchant'), to: request.element,
    });
    this.model.details.push(confirm); this.emit(); return pending;
  }
  async submit(pending: SmithPending | null = this.model.pending): Promise<GateResult | null> {
    const service = pending?.service ?? this.model.service;
    if (!this.guard(service, 'no_submit')) return null;
    if (this.activePending || this.model.stage === 'submitting') { this.tip('ui.smith.busy'); return null; }
    if (this.unresolved) { this.tip('ui.smith.result_unknown'); return null; }
    if (!pending || pending !== this.model.pending || pending.session !== this.session || pending.slot !== this.slot || service !== this.model.service) {
      this.tip('ui.smith.changed'); return null;
    }
    this.reloadCandidates();
    if (pending.snapshot !== this.snapshot()) { this.model.pending = null; this.model.stage = 'panel'; this.tip('ui.smith.changed'); this.emit(); return null; }
    const checked = this.read(pending.service, pending.request);
    if (!checked.allowed) { this.model.pending = null; this.model.stage = 'panel'; this.tip(this.rejectionKey(pending.service, checked), { service: t(`ui.smith.${pending.service}`) }); this.emit(); return checked; }
    const session = this.session;
    this.activePending = pending; this.model.stage = 'submitting'; this.emit();
    let result: GateResult;
    try {
      switch (pending.service) {
        case 'forge': result = await this.gates.forge.submit(pending.request as ForgeCraftRequest); break;
        case 'enhance': result = await this.gates.enhance.submit(pending.request as EnhanceRequest); break;
        case 'enchant': result = await this.gates.enchant.submit(pending.request as EnchantRequest); break;
        case 'salvage': result = await this.gates.salvage.submit(pending.request as SalvageRequest); break;
      }
    } catch {
      this.unresolved = true; this.unresolvedIntent = pending;
      if (session === this.session && this.guard(pending.service, 'no_submit', false)) { this.model.stage = 'panel'; this.model.pending = null; this.tip('ui.smith.result_unknown'); this.emit(); }
      return null;
    } finally { this.activePending = null; }
    if (session !== this.session || !this.guard(pending.service, 'no_submit', false)) {
      // A completed hidden operation can later be inspected only with this fixed intent.
      if (result.allowed || 'result' in result && result.result) { this.unresolved = true; this.unresolvedIntent = pending; }
      return result;
    }
    this.model.pending = null;
    const lines = this.completeResult(pending, result);
    if (lines) {
      this.model.stage = 'result'; this.model.resultLines = lines;
      if ('replayed' in result && result.replayed) this.model.resultLines.unshift(t('ui.smith.duplicate'));
      this.reloadCandidates();
    } else {
      this.model.stage = 'panel'; this.model.resultLines = [];
      if (result.allowed || 'result' in result && result.result) { this.unresolved = true; this.unresolvedIntent = pending; }
      this.tip(result.allowed ? 'ui.smith.result_unknown' : this.rejectionKey(pending.service, result), { service: t(`ui.smith.${pending.service}`) });
    }
    this.emit(); return result;
  }
  private completeResult(pending: SmithPending, returned: GateResult): string[] | null {
    if (!('result' in returned) || !returned.result || !itemName(pending.itemId)) return null;
    let canonical: GateResult;
    switch (pending.service) {
      case 'forge': canonical = this.gates.forge.result((pending.request as ForgeCraftRequest).craftRequestId); break;
      case 'enhance': canonical = this.gates.enhance.level((pending.request as EnhanceRequest).enhanceRequestId); break;
      case 'enchant': canonical = this.gates.enchant.result((pending.request as EnchantRequest).enchantRequestId); break;
      case 'salvage': canonical = this.gates.salvage.result((pending.request as SalvageRequest).salvageRequestId); break;
    }
    if (!('result' in canonical) || !canonical.result || JSON.stringify(canonical.result) !== JSON.stringify(returned.result)) return null;
    const r = canonical.result, item = itemName(pending.itemId)!;
    if (r.state !== 'committed') return null;
    if (pending.service === 'forge' && 'craftRequestId' in r && 'craftRequestId' in pending.request
      && r.craftRequestId === pending.request.craftRequestId && r.blueprintId === pending.request.blueprintId
      && JSON.stringify(r.materials) === JSON.stringify(pending.request.materials) && r.resultItem.itemId === pending.itemId && isForgeGrade(r.resultGrade)) {
      return [t('ui.smith.result_forge', { item: `${item} ×${r.resultItem.count}`, quality: t(`forge.grade.${r.resultGrade}`) }),
        cost(r.blueprintId, r.blueprintCount), ...r.materials.map(row => cost(row.itemId, row.count))];
    }
    if (pending.service === 'enhance' && 'enhanceRequestId' in r && 'enhanceRequestId' in pending.request
      && r.enhanceRequestId === pending.request.enhanceRequestId && r.instanceRef === pending.request.instanceRef
      && r.fromLevel === pending.request.fromLevel && r.to === pending.request.to && r.useProtectCharm === pending.request.useProtectCharm && r.itemId === pending.itemId) {
      return [t(r.success ? 'ui.smith.result_enhance_ok' : 'ui.smith.result_enhance_fail', { item, before: r.fromLevel, after: r.finalLevel }),
        stoneCost(r.stones), cost('refine_stone', r.refineStones),
        ...(r.useProtectCharm ? [cost(charm.itemId, charm.countPerSettlement)] : []),
        ...(!r.success && r.useProtectCharm && r.finalLevel === r.fromLevel ? [t('ui.smith.result_protected')] : [])];
    }
    if (pending.service === 'enchant' && 'enchantRequestId' in r && 'enchantRequestId' in pending.request
      && r.enchantRequestId === pending.request.enchantRequestId && r.instanceRef === pending.request.instanceRef
      && r.fromElement === pending.request.fromElement && r.element === pending.request.element && r.itemId === pending.itemId) {
      return [t('ui.smith.result_enchant', { item, element: r.element }), stoneCost(r.stones), ...r.materials.map(row => cost(row.itemId, row.count))];
    }
    if (pending.service === 'salvage' && 'salvageRequestId' in r && 'salvageRequestId' in pending.request
      && r.salvageRequestId === pending.request.salvageRequestId && r.instanceRef === pending.request.instanceRef
      && r.grade === pending.request.fromGrade && r.enhanceLevel === pending.request.fromEnhanceLevel && r.destroyed === true && r.itemId === pending.itemId) {
      return [t('ui.smith.result_salvage', { item, output: `${itemName(r.output.itemId)} ×${r.output.count}` })];
    }
    return null;
  }
  /** No automatic replay, request recovery, or saved result masquerading as a new action. */
  refresh(): boolean {
    const service = this.model.service ?? this.unresolvedIntent?.service;
    if (!this.guard(service, 'load_refresh')) return false;
    if (!service) return true;
    if (this.activePending) { this.tip('ui.smith.busy'); return false; }
    if (this.unresolved && this.unresolvedIntent) {
      const intent = this.unresolvedIntent;
      if (intent.service !== service) { this.tip('ui.smith.result_unknown'); return false; }
      let previous: GateResult;
      switch (service) {
        case 'forge': previous = this.gates.forge.result((intent.request as ForgeCraftRequest).craftRequestId); break;
        case 'enhance': previous = this.gates.enhance.level((intent.request as EnhanceRequest).enhanceRequestId); break;
        case 'enchant': previous = this.gates.enchant.result((intent.request as EnchantRequest).enchantRequestId); break;
        case 'salvage': previous = this.gates.salvage.result((intent.request as SalvageRequest).salvageRequestId); break;
      }
      const lines = this.completeResult(intent, previous);
      if (!lines) { this.tip('ui.smith.result_unknown'); return false; }
      this.unresolved = false; this.unresolvedIntent = null;
      this.model.pending = null; this.model.service = service; this.model.stage = 'result';
      this.model.resultLines = [t('ui.smith.load_dedupe'), ...lines]; this.reloadCandidates(); this.emit(); return true;
    }
    this.model.pending = null; this.model.resultLines = []; this.model.selected = undefined; this.model.details = []; this.model.stage = 'panel';
    const read = this.gates[service].loadRefresh();
    if (!read.allowed && !('replayed' in read && read.replayed)) this.tip(this.rejectionKey(service, read), { service: t(`ui.smith.${service}`) });
    else if ('replayed' in read && read.replayed) this.tip('ui.smith.load_dedupe');
    this.reloadCandidates(); this.emit(); return true;
  }
  back(): void {
    if (this.model.stage === 'closed') return;
    if (!this.guard(this.model.service, 'no_submit')) return;
    if (this.model.stage === 'submitting') { this.close(); return; }
    if (this.model.stage === 'confirm' || this.model.stage === 'result') {
      this.model.stage = 'panel'; this.model.pending = null; this.model.resultLines = []; this.updateDetails(); this.emit(); return;
    }
    if (this.model.stage === 'panel') { this.openMenu(); return; }
    this.close();
  }
  private rejectionKey(service: SmithService, result: GateResult): string {
    if (result.allowed) return 'ui.smith.result_unknown';
    const key = result.tipKey;
    if (key.startsWith(`${service}.closed.`) && !key.endsWith('.later_service')) return key;
    if (key === 'enhance.formal.resources' && this.model.useProtectCharm && charm.itemId === 'protect_charm'
      && this.progress.permanentCount(charm.itemId) < charm.countPerSettlement) {
      const instance = this.progress.formalEnhanceInstances().find(row => row.instanceRef === this.model.selected);
      const next = rules.levels.find(row => row.to === (instance?.enhanceLevel ?? -1) + 1);
      if (next && this.progress.stones >= next.stones && this.progress.permanentCount('refine_stone') >= next.refineStones)
        return 'ui.smith.charm_short';
    }
    if (key.startsWith('enhance.formal.')) return key;
    const reason = key.split('.').pop();
    if (reason === 'busy') return 'ui.smith.busy';
    if (reason === 'foreign') return 'ui.smith.foreign';
    if (reason === 'no_instance') return 'ui.smith.no_instance';
    if (reason === 'stale' || reason === 'conflict' || reason === 'identity') return 'ui.smith.changed';
    if (reason === 'duplicate') return service === 'enchant' ? 'ui.smith.same_element' : 'ui.smith.duplicate';
    if (reason === 'resources') return service === 'enchant' && this.progress.stones < rules.enchant.cost.stones ? 'ui.shop.not_enough' : 'talisman.material_lack';
    if (reason === 'ownership') return 'talisman.material_lack';
    if (reason === 'recipe' || reason === 'request' || reason === 'bad_type' || reason === 'qualification') return 'ui.smith.invalid';
    if (reason === 'capacity' && service === 'salvage') return 'sect.ui.bag_full';
    return 'ui.smith.result_unknown';
  }
}
