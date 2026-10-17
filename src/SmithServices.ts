import recipes from '@xt/balance/recipes.json';
import enhanceRules from '@xt/balance/enhance.json';
import protectCharmMap from '@xt/balance/enhance_protect_charm.json';
import { ITEMS, t } from './data';
import { Progress, type EquipSlot } from './Progress';
import { ForgeGate, type ForgeCraftRequest, type ForgeGateResult } from './ForgeGate';
import { EnhanceGate, type EnhanceRequest, type EnhanceGateResult } from './EnhanceGate';
import { EnchantGate, type EnchantRequest, type EnchantGateResult } from './EnchantGate';
import { SalvageGate, type SalvageRequest, type SalvageGateResult } from './SalvageGate';
import { listBagFormalEquipBindings, resolveFormalEquipSlotBinding,
  resolveFormalInventoryEquipBinding } from './EquipInstBinding';
import { buildInstDisplay, type InstDisplay } from './EquipInstReadonly';
import { isForgeGrade, isForgeId, isValidForgeMaterials, type ForgeCraftResult } from './ForgeProgress';
import { enhanceFields, isEnhanceId, isEnhanceInstanceRef, type EnhanceResult } from './EnhanceProgress';
import { isEnchantElement, type EnchantResult } from './EnchantProgress';
import type { SalvageResult } from './SalvageProgress';
import { isSmithServicesUiAccessible } from './SmithServicesUiAccess';

export type SmithService = 'forge' | 'enhance' | 'enchant' | 'salvage';
export type SmithRouteLayer = 'entrance' | 'menu' | 'panel';
export interface SmithRequests {
  forge: ForgeCraftRequest;
  enhance: EnhanceRequest;
  enchant: EnchantRequest;
  salvage: SalvageRequest;
}
export type SmithGateResult = ForgeGateResult | EnhanceGateResult | EnchantGateResult | SalvageGateResult;
export type SmithCommittedResult = ForgeCraftResult | EnhanceResult | EnchantResult | SalvageResult;
export interface SmithServiceIntent { readonly type: SmithService; readonly labelKey: string }
/** Equivalent smith_ou.services discovery metadata; it grants no UI or settlement permission. */
export const SMITH_SERVICES: readonly SmithServiceIntent[] = Object.freeze([
  Object.freeze({ type: 'forge' as const, labelKey: 'ui.smith.forge' }),
  Object.freeze({ type: 'enhance' as const, labelKey: 'ui.smith.enhance' }),
  Object.freeze({ type: 'enchant' as const, labelKey: 'ui.smith.enchant' }),
  Object.freeze({ type: 'salvage' as const, labelKey: 'ui.smith.salvage' }),
]);
export const SMITH_SERVICES_ROUTE = Object.freeze({ npcId: 'smith_ou', labelKey: 'ui.smith.title', services: SMITH_SERVICES });
export interface SmithRecipeChoice {
  kind: 'recipe'; recipeId: string; name: string; blueprintId: string; blueprintCount: 1;
  materials: { itemId: string; count: number; owned: number }[];
  resultItemId: string; outputCount: number; blueprintOwned: number;
}
export interface SmithInstanceChoice {
  kind: 'instance'; itemId: string; name: string; instanceRef: string;
  location: { kind: 'inventory' } | { kind: 'equip'; slot: EquipSlot };
  display: InstDisplay;
}
export interface SmithMenuItem extends SmithServiceIntent {
  available: boolean; tipKey?: string; text?: string;
}
export interface SmithReply {
  allowed: boolean;
  status: 'closed' | 'ready' | 'selected' | 'denied' | 'busy' | 'stale' | 'committed' | 'replayed' | 'loaded' | 'unknown';
  route: 'dialogue' | 'menu' | 'panel';
  service?: SmithService; tipKey?: string; text?: string;
  gate?: SmithGateResult; result?: SmithCommittedResult; replayed?: boolean;
  items?: readonly (SmithMenuItem | SmithRecipeChoice | SmithInstanceChoice)[];
}
type Selected = { service: SmithService; request: SmithRequests[SmithService]; snapshot: string; epoch: number };
const clone = <T>(value: T): T => structuredClone(value);
const slots: readonly EquipSlot[] = ['weapon', 'robe', 'shoes'];
const validService = (value: unknown): value is SmithService => SMITH_SERVICES.some(row => row.type === value);

/**
 * Routing and formal Gate adapters only. UI visibility follows SmithServicesUiAccess while
 * settlement remains with each Gate. No constructor option, persistent UI flag, fixture authorization,
 * resource writer, settlement ledger or recovery queue is exposed here.
 */
export class SmithServices {
  readonly #ownerSlot = Progress.getActiveSlot();
  readonly #gates;
  #epoch = 0;
  #selected: Selected | undefined;
  #busy = false;
  constructor(private readonly progress: Progress) {
    this.#gates = {
      forge: new ForgeGate(progress), enhance: new EnhanceGate(progress),
      enchant: new EnchantGate(progress), salvage: new SalvageGate(progress),
    };
  }

  // SMITH_SERVICES_MEMORY_CLOSED_ROUTE: isolated tests replace this method in memory only.
  private routeAvailable(_layer: SmithRouteLayer, _service?: SmithService): boolean {
    return isSmithServicesUiAccessible(_layer === 'panel' ? _service ?? 'entrance' : _layer);
  }

  /** Read-only availability for view polling; an open route never invalidates a confirmation. */
  availability(service: SmithService, action: 'entrance' | 'no_submit' | 'load_refresh' = 'entrance'): SmithReply {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    const gate = this.#gates[service].entrance();
    if (gate.allowed) return { allowed: true, status: 'ready', route: 'panel', service, gate };
    return this.refusal(service, gate.tipKey.startsWith(`${service}.closed.`)
      ? { ...gate, tipKey: `${service}.closed.${action}` } : gate);
  }

  entrance(): SmithReply {
    const stopped = this.guard();
    if (stopped) return stopped;
    this.clearSelection();
    return { allowed: true, status: 'ready', route: 'menu' };
  }
  menu(): SmithReply {
    const stopped = this.guard(undefined, 'menu');
    if (stopped) return stopped;
    this.clearSelection();
    const items = SMITH_SERVICES.map(intent => {
      const gate = this.#gates[intent.type].entrance();
      return gate.allowed ? { ...intent, available: true }
        : { ...intent, available: false, ...this.tipFor(intent.type, gate) };
    });
    return { allowed: true, status: 'ready', route: 'menu', items };
  }
  panel(service: SmithService): SmithReply {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    this.clearSelection();
    const gate = this.#gates[service].entrance();
    return gate.allowed ? { allowed: true, status: 'ready', route: 'panel', service }
      : this.refusal(service, gate);
  }

  /** Every instance row has an explicit current position proven by EquipInstBinding. */
  choices(service: SmithService): SmithReply {
    const opened = this.panel(service);
    if (!opened.allowed) return opened;
    try {
      const items = service === 'forge' ? this.recipeChoices() : this.instanceChoices(service);
      return { ...opened, items, ...(items.length ? {} : this.tip(service === 'forge' ? 'ui.smith.no_recipe' : 'ui.smith.no_instance')) };
    } catch { return this.unknown(service); }
  }

  /** Read-only selection; supplied identity is retained only in view memory, never generated or saved. */
  select<S extends SmithService>(service: S, request?: SmithRequests[S]): SmithReply {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    if (this.#busy) return this.message(service, 'busy', 'ui.smith.busy');
    this.clearSelection();
    try {
      const gate = this.selectGate(service, request);
      if (!gate.allowed) return this.refusal(service, gate, request);
      if (!request) return this.message(service, 'denied', 'ui.smith.selection_required');
      const binding = this.bindingRefusal(service, request);
      if (binding) return binding;
      this.#selected = { service, request: clone(request), snapshot: this.stateSnapshot(), epoch: this.#epoch };
      return { allowed: true, status: 'selected', route: 'panel', service, gate };
    } catch { return this.unknown(service); }
  }

  /** Only the matching confirmed selection is delegated; all settlement and dedupe remain in Gate. */
  async submit<S extends SmithService>(service: S, request: SmithRequests[S]): Promise<SmithReply> {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    try {
      const entrance = this.#gates[service].entrance();
      // Preserve the Gate's action-specific closed tip, before inspecting old or malformed selections.
      if (!entrance.allowed) return entrance.tipKey.startsWith(`${service}.closed.`)
        ? this.refusal(service, await this.submitGate(service, request)) : this.refusal(service, entrance);
      if (this.#busy) return this.message(service, 'busy', 'ui.smith.busy');
      const selected = this.#selected;
      if (!selected || selected.service !== service) return this.message(service, 'denied', 'ui.smith.selection_required');
      if (!this.requestValid(service, request) || selected.epoch !== this.#epoch || !this.sameRequest(selected.request, request)
        || selected.snapshot !== this.stateSnapshot()) {
        this.clearSelection();
        return this.message(service, 'denied', 'ui.smith.changed');
      }
      const binding = this.bindingRefusal(service, request);
      if (binding) { this.clearSelection(); return binding; }
      const intent = clone(request), epoch = this.#epoch;
      this.#busy = true;
      try {
        const gate = await this.submitGate(service, intent);
        const closed = this.guard(service, 'panel');
        if (closed) return closed;
        if (epoch !== this.#epoch) return this.message(service, 'stale', 'ui.smith.result_unknown');
        this.clearSelection();
        return this.submittedReply(service, intent, gate);
      } finally { this.#busy = false; }
    } catch { this.clearSelection(); return this.unknown(service); }
  }

  /** Request payload must match a complete Gate result; allowed=false duplicate can still replay it. */
  result<S extends SmithService>(service: S, request: SmithRequests[S]): SmithReply {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    try {
      const gate = this.resultGate(service, request);
      return this.submittedReply(service, request, gate);
    } catch { return this.unknown(service); }
  }
  /** Loading exposes Gate's read-only state without promoting cached state into a current result. */
  loadRefresh(service: SmithService): SmithReply {
    const stopped = this.guard(service, 'panel');
    if (stopped) return stopped;
    this.clearSelection();
    try {
      const gate = this.#gates[service].loadRefresh();
      if (!gate.allowed && !('replayed' in gate && gate.replayed)) return this.refusal(service, gate);
      return { allowed: true, status: 'loaded', route: 'panel', service, gate,
        ...this.tip('ui.smith.load_dedupe') };
    } catch { return this.unknown(service); }
  }

  /** Discard view state only. An in-flight Gate transaction is never cancelled or automatically retried. */
  invalidate(): void { this.clearSelection(); }
  back(): SmithReply {
    this.clearSelection();
    return this.guard(undefined, 'menu') ?? { allowed: true, status: 'ready', route: 'menu' };
  }

  private guard(service?: SmithService, layer: SmithRouteLayer = 'entrance'): SmithReply | undefined {
    if (!this.routeAvailable('entrance') || layer !== 'entrance' && !this.routeAvailable('menu')
      || layer === 'panel' && !this.routeAvailable('panel', service)) {
      this.clearSelection();
      return { allowed: false, status: 'closed', route: 'dialogue', ...(validService(service) ? { service } : {}), ...this.tip('ui.smith.closed') };
    }
    if (Progress.getActiveSlot() !== this.#ownerSlot) {
      this.clearSelection();
      return { allowed: false, status: 'stale', route: 'dialogue', ...this.tip('ui.smith.result_unknown') };
    }
    if (layer === 'panel' && !validService(service)) return this.unknown();
    return undefined;
  }
  private clearSelection(): void { this.#selected = undefined; this.#epoch++; }
  private tip(key: string, service?: SmithService): { tipKey: string; text: string } {
    return { tipKey: key, text: t(key, service ? { service: t(`ui.smith.${service}`) } : {}) };
  }
  private message(service: SmithService, status: SmithReply['status'], key: string): SmithReply {
    return { allowed: false, status, route: 'panel', service, ...this.tip(key, service) };
  }
  private unknown(service?: SmithService): SmithReply {
    return { allowed: false, status: 'unknown', route: service ? 'panel' : 'dialogue', service, ...this.tip('ui.smith.result_unknown') };
  }
  private refusal(service: SmithService, gate: SmithGateResult, request?: SmithRequests[SmithService]): SmithReply {
    if (gate.allowed) return this.unknown(service);
    if (gate.tipKey.startsWith(`${service}.closed.`)) this.clearSelection();
    return { allowed: false, status: gate.tipKey.startsWith(`${service}.closed.`) ? 'closed' : 'denied',
      route: gate.tipKey.endsWith('.entrance') ? 'menu' : 'panel', service, gate, ...this.tipFor(service, gate, request) };
  }
  private tipFor(service: SmithService, gate: Exclude<SmithGateResult, { allowed: true }>, request?: SmithRequests[SmithService]): { tipKey: string; text: string } {
    if (gate.tipKey.startsWith(`${service}.closed.`) && !gate.tipKey.endsWith('.later_service')) return this.tip(gate.tipKey);
    if (service === 'enhance' && gate.tipKey.startsWith('enhance.formal.')) {
      if (gate.tipKey === 'enhance.formal.duplicate') return this.tip('ui.smith.changed');
      // The Gate shares resources for charm shortages. Refine only the text after its full refusal.
      if (gate.tipKey === 'enhance.formal.resources' && request && 'useProtectCharm' in request && request.useProtectCharm
        && typeof protectCharmMap.itemId === 'string' && Number.isSafeInteger(protectCharmMap.countPerSettlement)
        && protectCharmMap.countPerSettlement > 0
        && this.progress.permanentCount(protectCharmMap.itemId) < protectCharmMap.countPerSettlement) return this.tip('ui.smith.charm_short');
      return this.tip(gate.tipKey);
    }
    const reason = gate.tipKey.split('.').pop();
    // Refine only an explicit Gate resource refusal; these reads never grant settlement.
    if (service === 'forge' && reason === 'ownership' && request && 'blueprintId' in request) {
      if (this.progress.permanentCount(request.blueprintId) < 1) return this.tip('ui.smith.no_recipe');
      if (request.materials.some(row => this.progress.permanentCount(row.itemId) < row.count))
        return this.tip('talisman.material_lack');
    }
    if (service === 'enchant' && reason === 'resources') {
      // The Gate owns the cost rules; use its already checked request preview for classification.
      // Formal cost rows are shared with the Controller and are never consumed in this adapter.
      const cost = enhanceRules.enchant.cost;
      if (this.progress.stones < cost.stones) return this.tip('ui.shop.not_enough');
      if (cost.materials.some(row => this.progress.permanentCount(row.item) < row.count))
        return this.tip('talisman.material_lack');
    }
    if (reason === 'busy') return this.tip('ui.smith.busy');
    if (reason === 'duplicate') {
      // Enchant uses duplicate for a *new* same-element intent as well as business duplicates.
      if (service === 'enchant' && this.requestValid('enchant', request)) {
        const intent = request as EnchantRequest;
        const current = this.#gates.enchant.element(intent.instanceRef);
        if (!this.progress.enchant?.enchantments.some(row => row.enchantRequestId === intent.enchantRequestId)
          && current.allowed && current.instance && 'element' in current.instance
          && current.instance.element === intent.element) return this.tip('ui.smith.same_element');
      }
      return this.tip('ui.smith.result_unknown');
    }
    if (reason === 'foreign') return this.tip('ui.smith.foreign');
    if (reason === 'no_instance') return this.tip('ui.smith.no_instance');
    if (reason === 'stale' || reason === 'identity' || reason === 'conflict') return this.tip('ui.smith.changed');
    // Gate capacity may also mean a failed carrier or inconsistent inventory, not a full bag.
    if (['request', 'recipe', 'type', 'bad_type', 'element', 'grade', 'location'].includes(reason ?? '')) return this.tip('ui.smith.invalid', service);
    return this.tip('ui.smith.result_unknown');
  }
  private selectGate<S extends SmithService>(service: S, request?: SmithRequests[S]): SmithGateResult {
    switch (service) {
      case 'forge': return this.#gates.forge.craft(request as ForgeCraftRequest | undefined);
      case 'enhance': return this.#gates.enhance.enhance(request as EnhanceRequest | undefined);
      case 'enchant': return this.#gates.enchant.enchant(request as EnchantRequest | undefined);
      case 'salvage': return this.#gates.salvage.salvage(request as SalvageRequest | undefined);
    }
    return { allowed: false, ...this.tip('ui.smith.result_unknown') };
  }
  private submitGate<S extends SmithService>(service: S, request: SmithRequests[S]): Promise<SmithGateResult> {
    switch (service) {
      case 'forge': return this.#gates.forge.submit(request as ForgeCraftRequest);
      case 'enhance': return this.#gates.enhance.submit(request as EnhanceRequest);
      case 'enchant': return this.#gates.enchant.submit(request as EnchantRequest);
      case 'salvage': return this.#gates.salvage.submit(request as SalvageRequest);
    }
    return Promise.resolve({ allowed: false, ...this.tip('ui.smith.result_unknown') });
  }
  private resultGate<S extends SmithService>(service: S, request: SmithRequests[S]): SmithGateResult {
    // Inspect data descriptors only: malformed payload accessors cannot masquerade as result identity.
    const field = (key: string): string | undefined => {
      const value: unknown = request && Object.getOwnPropertyDescriptor(request, key)?.value;
      return typeof value === 'string' ? value : undefined;
    };
    switch (service) {
      case 'forge': return this.#gates.forge.result(field('craftRequestId'));
      case 'enhance': return this.#gates.enhance.level(field('enhanceRequestId'));
      case 'enchant': return this.#gates.enchant.result(field('enchantRequestId'));
      case 'salvage': return this.#gates.salvage.result(field('salvageRequestId'));
    }
    return { allowed: false, ...this.tip('ui.smith.result_unknown') };
  }
  private submittedReply<S extends SmithService>(service: S, request: SmithRequests[S], gate: SmithGateResult): SmithReply {
    if ('result' in gate && gate.result) {
      if (!this.matchesResult(service, request, gate.result)) return this.unknown(service);
      const replayed = 'replayed' in gate && gate.replayed === true;
      return { allowed: true, status: replayed ? 'replayed' : 'committed', route: 'panel', service,
        gate, result: clone(gate.result), replayed,
        ...(replayed ? this.tip('ui.smith.duplicate') : {}) };
    }
    return gate.allowed ? this.unknown(service) : this.refusal(service, gate, request);
  }
  private matchesResult<S extends SmithService>(service: S, request: SmithRequests[S], result: SmithCommittedResult): boolean {
    if (!this.requestValid(service, request) || result.state !== 'committed') return false;
    switch (service) {
      case 'forge': {
        const req = request as ForgeCraftRequest;
        return 'craftRequestId' in result && req.craftRequestId === result.craftRequestId && req.blueprintId === result.blueprintId
          && Array.isArray(req.materials) && req.materials.length === result.materials.length
          && req.materials.every(row => result.materials.some(other => row.itemId === other.itemId && row.count === other.count));
      }
      case 'enhance': {
        const req = request as EnhanceRequest;
        return 'enhanceRequestId' in result && req.enhanceRequestId === result.enhanceRequestId && req.instanceRef === result.instanceRef
          && req.fromLevel === result.fromLevel && req.to === result.to && req.useProtectCharm === result.useProtectCharm;
      }
      case 'enchant': {
        const req = request as EnchantRequest;
        return 'enchantRequestId' in result && req.enchantRequestId === result.enchantRequestId && req.instanceRef === result.instanceRef
          && req.fromElement === result.fromElement && req.element === result.element;
      }
      case 'salvage': {
        const req = request as SalvageRequest;
        return 'salvageRequestId' in result && req.salvageRequestId === result.salvageRequestId && req.instanceRef === result.instanceRef
          && req.fromGrade === result.grade && req.fromEnhanceLevel === result.enhanceLevel;
      }
    }
    return false;
  }
  private bindingRefusal<S extends SmithService>(service: S, request: SmithRequests[S]): SmithReply | undefined {
    if (service === 'forge') return;
    const ref = (request as EnhanceRequest | EnchantRequest | SalvageRequest).instanceRef;
    if (this.progress.formalEnhanceInstanceStatus(ref) === 'foreign') return this.message(service, 'denied', 'ui.smith.foreign');
    if (!this.instanceChoices(service).some(row => row.instanceRef === ref)) return this.message(service, 'denied', 'ui.smith.no_instance');
    return undefined;
  }
  private instanceChoices(service: Exclude<SmithService, 'forge'>): SmithInstanceChoice[] {
    const result: SmithInstanceChoice[] = [];
    const append = (itemId: string, instanceRef: string, location: SmithInstanceChoice['location']) => {
      const instance = this.progress.formalEnhanceInstances().find(row => row.instanceRef === instanceRef && row.itemId === itemId);
      if (!instance || service === 'enchant' && instance.type !== 'weapon') return;
      const display = buildInstDisplay(this.progress, { kind: 'verified', instanceRef });
      // Attribute visibility follows E/I flags; the independent service's identity follows binding.
      if (!['verified', 'unavailable'].includes(display.kind) || result.some(row => row.instanceRef === instanceRef)) return;
      result.push({ kind: 'instance', itemId, instanceRef, name: ITEMS[itemId].name, location, display });
    };
    for (const slot of slots) {
      const bound = resolveFormalEquipSlotBinding(this.progress, slot);
      if (bound.kind === 'verified') append(this.progress.equip[slot]!, bound.instanceRef, { kind: 'equip', slot });
    }
    for (const row of listBagFormalEquipBindings(this.progress)) {
      const bound = resolveFormalInventoryEquipBinding(this.progress, row);
      if (bound.kind === 'verified') append(row.id, bound.instanceRef, { kind: 'inventory' });
    }
    return result;
  }
  private recipeChoices(): SmithRecipeChoice[] {
    return recipes.recipes.filter(row => row.type === 'forge').map(row => ({
      kind: 'recipe', recipeId: row.id, name: row.name, blueprintId: row.blueprint!, blueprintCount: 1,
      blueprintOwned: this.progress.permanentCount(row.blueprint!),
      materials: row.materials.map(material => ({ itemId: material.item, count: material.count, owned: this.progress.permanentCount(material.item) })),
      resultItemId: row.output, outputCount: row.outputCount,
    }));
  }
  private stateSnapshot(): string { return JSON.stringify(this.progress.exportSave()); }
  private requestValid(service: SmithService, value: unknown): boolean {
    const count = (number: unknown): number is number => typeof number === 'number' && Number.isSafeInteger(number) && number >= 0;
    switch (service) {
      case 'forge': return enhanceFields(value, ['craftRequestId', 'blueprintId', 'materials'])
        && isForgeId(value.craftRequestId) && isForgeId(value.blueprintId) && isValidForgeMaterials(value.materials);
      case 'enhance': return enhanceFields(value, ['enhanceRequestId', 'instanceRef', 'fromLevel', 'to', 'useProtectCharm'])
        && isEnhanceId(value.enhanceRequestId) && isEnhanceInstanceRef(value.instanceRef)
        && count(value.fromLevel) && count(value.to) && value.to > 0 && typeof value.useProtectCharm === 'boolean';
      case 'enchant': return enhanceFields(value, ['enchantRequestId', 'instanceRef', 'fromElement', 'element'])
        && isEnhanceId(value.enchantRequestId) && isEnhanceInstanceRef(value.instanceRef)
        && (value.fromElement === null || isEnchantElement(value.fromElement)) && isEnchantElement(value.element);
      case 'salvage': return enhanceFields(value, ['salvageRequestId', 'instanceRef', 'fromGrade', 'fromEnhanceLevel'])
        && isEnhanceId(value.salvageRequestId) && isEnhanceInstanceRef(value.instanceRef)
        && isForgeGrade(value.fromGrade) && count(value.fromEnhanceLevel);
    }
  }
  private sameRequest(a: SmithRequests[SmithService], b: SmithRequests[SmithService]): boolean {
    // View comparison only, not a business identity, receipt or dedupe store.
    return JSON.stringify(a) === JSON.stringify(b);
  }
}
