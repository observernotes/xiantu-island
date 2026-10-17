import rules from '@xt/balance/enhance.json';
import charm from '@xt/balance/enhance_protect_charm.json';
import { ITEMS, inPhase, t } from './data';
import { Progress } from './Progress';
import type { ForgeCraftRequest, ForgeGateResult } from './ForgeGate';
import type { EnhanceRequest, EnhanceGateResult } from './EnhanceGate';
import type { EnchantRequest, EnchantGateResult } from './EnchantGate';
import type { SalvageRequest, SalvageGateResult } from './SalvageGate';
import { isForgeGrade } from './ForgeProgress';
import { isEnchantElement, type EnchantElement } from './EnchantProgress';
import { isSmithServicesUiAccessible, type SmithService } from './SmithServicesUiAccess';
import { SmithServices, type SmithReply, type SmithRecipeChoice, type SmithInstanceChoice } from './SmithServices';

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
  private readonly services: SmithServices;
  private choices: (SmithRecipeChoice | SmithInstanceChoice)[] = [];
  private unresolved = false;
  private unresolvedIntent: SmithPending | null = null;
  private activePending: SmithPending | null = null;

  constructor(private readonly progress: Progress, private readonly hooks: SmithServicesHooks) {
    this.services = new SmithServices(progress);
  }
  get state(): SmithServicesState { return clone(this.model); }
  get pending(): SmithPending | null { return this.model.pending; }
  private emit() { this.hooks.changed?.(); }
  private tip(key: string, vars?: Record<string, string | number>) { this.hooks.tip(key, vars); }
  private reset(stage: SmithServicesState['stage'] = 'closed') {
    this.services.invalidate(); this.choices = [];
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
  private guard(service?: SmithService, action: 'entrance' | 'no_submit' | 'load_refresh' = 'entrance', notify = true): boolean {
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
      const entrance = this.services.availability(service, action);
      if (!entrance.allowed) {
        this.reset('menu');
        if (notify) this.replyTip(entrance);
        return false;
      }
    }
    return true;
  }
  openMenu(): boolean {
    if (!this.guard()) return false;
    const opened = this.services.menu();
    if (!opened.allowed) { this.reset(); this.replyTip(opened); return false; }
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
    const entrance = this.services.availability(service);
    return entrance.allowed ? { available: true } : { available: false, tipKey: entrance.tipKey ?? 'ui.smith.result_unknown' };
  }
  /** Called every frame: a stale view clears silently, with no deferred action. */
  poll(): boolean {
    return this.model.stage === 'closed' || this.guard(this.model.service, 'no_submit', false);
  }
  private reloadCandidates() {
    const service = this.model.service;
    this.model.candidates = []; this.choices = [];
    if (!service) return;
    const reply = this.services.choices(service);
    if (!reply.allowed) return;
    this.choices = (reply.items ?? []).filter((row): row is SmithRecipeChoice | SmithInstanceChoice => 'kind' in row);
    this.model.candidates = this.choices.flatMap(row => {
      if (row.kind === 'recipe') {
        const output = ITEMS[row.resultItemId];
        return output && inPhase(output) && output.enabled !== false && output.placeholder !== true
          ? [{ id: row.blueprintId, itemId: row.resultItemId, name: itemName(row.resultItemId) ?? row.name, lines: [] as string[] }]
          : [];
      }
      return [{ id: row.instanceRef, itemId: row.itemId, name: row.name,
        location: t(row.location.kind === 'equip' ? `ui.slot.${row.location.slot}` : 'ui.inventory'),
        lines: row.display.lines.map(line => line.text) }];
    });
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
    this.services.invalidate();
    this.model.selected = id; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.model.useProtectCharm = false; this.model.element = undefined; this.updateDetails(); this.emit(); return true;
  }
  selectElement(element: EnchantElement): boolean {
    if (!this.editable() || this.model.service !== 'enchant' || !isEnchantElement(element)) return false;
    this.services.invalidate();
    this.model.element = element; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.updateDetails(); this.emit(); return true;
  }
  setProtectCharm(use: boolean): boolean {
    if (!this.editable() || this.model.service !== 'enhance' || typeof use !== 'boolean') return false;
    this.services.invalidate();
    this.model.useProtectCharm = use; this.model.pending = null; this.model.resultLines = []; this.model.stage = 'panel';
    this.updateDetails(); this.emit(); return true;
  }
  private buildRequest(id: string): Request | null {
    const candidate = this.model.candidates.find(row => row.id === this.model.selected);
    const service = this.model.service;
    if (!candidate || !service) return null;
    if (service === 'forge') {
      const row = this.choices.find((row): row is SmithRecipeChoice => row.kind === 'recipe' && row.blueprintId === candidate.id);
      return row ? { craftRequestId: id, blueprintId: row.blueprintId, materials: row.materials.map(m => ({ itemId: m.itemId, count: m.count })) } : null;
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
  private updateDetails(selected?: SmithReply) {
    const service = this.model.service, candidate = this.model.candidates.find(row => row.id === this.model.selected);
    this.model.details = [];
    if (!service || !candidate) return;
    const lines = [candidate.name, ...(candidate.location ? [candidate.location] : []), ...candidate.lines];
    const request = this.model.pending?.request ?? this.buildRequest('smith_ui_preview');
    if (service === 'forge') {
      const recipe = this.choices.find((row): row is SmithRecipeChoice => row.kind === 'recipe' && row.blueprintId === candidate.id);
      if (recipe) lines.push(owned(this.progress, recipe.blueprintId, 1), ...recipe.materials.map(row => owned(this.progress, row.itemId, row.count)), `${itemName(recipe.resultItemId)} ×${recipe.outputCount}`);
    } else if (service === 'enhance' && request && 'to' in request) {
      const read = selected ?? this.services.select(service, request);
      const row = read.gate?.allowed && 'row' in read.gate ? read.gate.row : rules.levels.find(row => row.to === request.to);
      if (row) lines.push(t('ui.smith.enhance_preview', { level: row.to, rate: Number((row.rate * 100).toFixed(8)) }),
        t(row.dropOnFail && !(request.useProtectCharm && read.allowed) ? 'ui.smith.drop_on_fail' : 'ui.smith.no_drop_on_fail', { n: 1 }),
        ownedStones(this.progress, row.stones), owned(this.progress, 'refine_stone', row.refineStones));
      else lines.push(t('enhance.formal.max_level'));
      if (request.useProtectCharm) lines.push(owned(this.progress, charm.itemId, charm.countPerSettlement));
      if (!read.allowed) lines.push(t(read.tipKey ?? 'ui.smith.result_unknown', { service: t(`ui.smith.${service}`) }));
    } else if (service === 'enchant') {
      lines.push(ownedStones(this.progress, rules.enchant.cost.stones), ...rules.enchant.cost.materials.map(row => owned(this.progress, row.item, row.count)));
    } else if (service === 'salvage' && request && 'fromGrade' in request) {
      lines.push(t(`forge.grade.${request.fromGrade}`));
      const read = selected ?? this.services.select(service, request);
      if (read.gate?.allowed && 'output' in read.gate && read.gate.output) lines.push(t('ui.smith.output_preview', { output: `${itemName(read.gate.output.itemId)} ×${read.gate.output.count}` }));
      else if (!read.allowed) lines.push(t(read.tipKey ?? 'ui.smith.result_unknown', { service: t(`ui.smith.${service}`) }));
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
    if (this.model.pending && this.model.pending.snapshot === this.snapshot()) return this.model.pending;
    this.reloadCandidates();
    const request = this.buildRequest(`smith_ui_${crypto.randomUUID()}`);
    if (!request) { this.tip('ui.smith.selection_required', { service: t(`ui.smith.${service}`) }); return null; }
    const checked = this.services.select(service, request);
    if (!checked.allowed) { this.replyTip(checked); return null; }
    const candidate = this.model.candidates.find(row => row.id === this.model.selected)!;
    const pending: SmithPending = freeze({ service, request: clone(request), session: this.session,
      slot: this.slot, snapshot: this.snapshot(), itemId: candidate.itemId });
    this.model.pending = pending; this.model.stage = 'confirm'; this.model.resultLines = []; this.updateDetails(checked);
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
    // choices() clears service selection; the confirmed view snapshot is checked without reloading it.
    if (pending.snapshot !== this.snapshot()) {
      this.services.invalidate(); this.model.pending = null; this.model.stage = 'panel'; this.tip('ui.smith.changed'); this.emit(); return null;
    }
    const session = this.session;
    this.activePending = pending; this.model.stage = 'submitting'; this.emit();
    let reply: SmithReply;
    try {
      reply = await this.services.submit(pending.service, pending.request);
    } catch {
      this.unresolved = true; this.unresolvedIntent = pending;
      if (session === this.session && this.guard(pending.service, 'no_submit', false)) { this.model.stage = 'panel'; this.model.pending = null; this.tip('ui.smith.result_unknown'); this.emit(); }
      return null;
    } finally { this.activePending = null; }
    if (session !== this.session || !this.guard(pending.service, 'no_submit', false)) {
      // A completed hidden operation can later be inspected only with this fixed intent.
      if (reply.allowed || reply.status === 'unknown' || reply.status === 'stale' || reply.status === 'closed') { this.unresolved = true; this.unresolvedIntent = pending; }
      return reply.gate ?? null;
    }
    this.model.pending = null;
    const lines = this.completeResult(pending, reply);
    if (lines) {
      this.model.stage = 'result'; this.model.resultLines = lines;
      if (reply.replayed) this.model.resultLines.unshift(t('ui.smith.duplicate'));
      this.reloadCandidates();
    } else {
      this.model.stage = 'panel'; this.model.resultLines = [];
      if (reply.allowed || reply.status === 'unknown' || reply.status === 'stale') { this.unresolved = true; this.unresolvedIntent = pending; }
      this.replyTip(reply);
    }
    this.emit(); return reply.gate ?? null;
  }
  /** SmithServices owns result identity validation; this layer only formats its accepted result. */
  private completeResult(pending: SmithPending, reply: SmithReply): string[] | null {
    if (!reply.allowed || !reply.result || !itemName(pending.itemId)) return null;
    const r = reply.result, item = itemName(pending.itemId)!;
    if (pending.service === 'forge' && 'craftRequestId' in r) {
      return [t('ui.smith.result_forge', { item: `${item} ×${r.resultItem.count}`, quality: t(`forge.grade.${r.resultGrade}`) }),
        cost(r.blueprintId, r.blueprintCount), ...r.materials.map(row => cost(row.itemId, row.count))];
    }
    if (pending.service === 'enhance' && 'enhanceRequestId' in r) {
      return [t(r.success ? 'ui.smith.result_enhance_ok' : 'ui.smith.result_enhance_fail', { item, before: r.fromLevel, after: r.finalLevel }),
        stoneCost(r.stones), cost('refine_stone', r.refineStones),
        ...(r.useProtectCharm ? [cost(charm.itemId, charm.countPerSettlement)] : []),
        ...(!r.success && r.useProtectCharm && r.finalLevel === r.fromLevel ? [t('ui.smith.result_protected')] : [])];
    }
    if (pending.service === 'enchant' && 'enchantRequestId' in r) {
      return [t('ui.smith.result_enchant', { item, element: r.element }), stoneCost(r.stones), ...r.materials.map(row => cost(row.itemId, row.count))];
    }
    if (pending.service === 'salvage' && 'salvageRequestId' in r) {
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
      const previous = this.services.result(service, intent.request);
      const lines = this.completeResult(intent, previous);
      if (!lines) { this.tip('ui.smith.result_unknown'); return false; }
      this.unresolved = false; this.unresolvedIntent = null;
      this.model.pending = null; this.model.service = service; this.model.stage = 'result';
      this.model.resultLines = [t('ui.smith.load_dedupe'), ...lines]; this.reloadCandidates(); this.emit(); return true;
    }
    this.model.pending = null; this.model.resultLines = []; this.model.selected = undefined; this.model.details = []; this.model.stage = 'panel';
    const read = this.services.loadRefresh(service);
    if (!read.allowed || read.tipKey) this.replyTip(read);
    this.reloadCandidates(); this.emit(); return true;
  }
  back(): void {
    if (this.model.stage === 'closed') return;
    if (!this.guard(this.model.service, 'no_submit')) return;
    if (this.model.stage === 'submitting') { this.close(); return; }
    if (this.model.stage === 'confirm' || this.model.stage === 'result') {
      this.services.invalidate();
      this.model.stage = 'panel'; this.model.pending = null; this.model.resultLines = []; this.updateDetails(); this.emit(); return;
    }
    if (this.model.stage === 'panel') { this.openMenu(); return; }
    this.close();
  }
  private replyTip(reply: SmithReply): void {
    this.tip(reply.tipKey ?? 'ui.smith.result_unknown', reply.service ? { service: t(`ui.smith.${reply.service}`) } : undefined);
  }
}
