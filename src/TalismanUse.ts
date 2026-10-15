import { ITEMS, NPCS, TILED_MAPS, inPhase, type PillQuality } from './data';
import { featureEnabled } from './features';
import { gameNow } from './GameClock';
import { mapEntryOpen } from './Ferry';

/** Actual applied values are saved so an offline buff never rerolls or changes strength. */
export interface TalismanBuff {
  buffId: string; itemId: 'talisman_guard' | 'talisman_gather'; quality: PillQuality;
  expireAt: number; damageReductionRatio?: number; reductionCap?: number; expBonusRatio?: number;
}
export interface TalismanUseState { version: 1; buffs: TalismanBuff[]; cooldowns: Record<string, number> }
export const TALISMAN_QUALITIES: readonly PillQuality[] = ['low', 'mid', 'high', 'supreme'];
export const TALISMAN_ITEMS = ['talisman_fire', 'talisman_guard', 'talisman_return', 'talisman_gather'] as const;
type TalismanItemId = typeof TALISMAN_ITEMS[number];
export function emptyTalismanUseState(): TalismanUseState { return { version: 1, buffs: [], cooldowns: {} }; }
const record = (v: unknown): v is Record<string, any> => !!v && typeof v === 'object' && !Array.isArray(v);
const finite = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v);
const nonnegative = (v: unknown): v is number => finite(v) && v >= 0;
const positive = (v: unknown): v is number => finite(v) && v > 0;
const qualityValid = (q: unknown): q is PillQuality => TALISMAN_QUALITIES.includes(q as PillQuality);
const ratio = (v: unknown, max = 1): v is number => nonnegative(v) && v <= max;

/** Old saves default empty; invalid/expired fields are discarded, active real-time expiries retained. */
export function normalizeTalismanUseState(raw: unknown, now = gameNow()): TalismanUseState {
  const state = emptyTalismanUseState();
  if (!record(raw)) return state;
  // Preserve unknown future schemas verbatim; runtime actions will refuse to interpret them.
  if (raw.version !== undefined && raw.version !== 1) return raw as unknown as TalismanUseState;
  if (record(raw.cooldowns)) for (const [group, expireAt] of Object.entries(raw.cooldowns)) {
    if (group && !['__proto__', 'constructor', 'prototype'].includes(group) && positive(expireAt) && expireAt > now) state.cooldowns[group] = expireAt;
  }
  if (Array.isArray(raw.buffs)) for (const buff of raw.buffs) {
    if (!record(buff) || !qualityValid(buff.quality) || !positive(buff.expireAt) || buff.expireAt <= now || typeof buff.buffId !== 'string' || !buff.buffId) continue;
    let normalized: TalismanBuff;
    if (buff.itemId === 'talisman_guard' && ratio(buff.damageReductionRatio, 0.5) && ratio(buff.reductionCap, 0.5)) {
      normalized = { buffId: buff.buffId, itemId: buff.itemId, quality: buff.quality, expireAt: buff.expireAt,
        damageReductionRatio: buff.damageReductionRatio, reductionCap: buff.reductionCap };
    } else if (buff.itemId === 'talisman_gather' && ratio(buff.expBonusRatio)) {
      normalized = { buffId: buff.buffId, itemId: buff.itemId, quality: buff.quality, expireAt: buff.expireAt, expBonusRatio: buff.expBonusRatio };
    } else continue;
    const previous = state.buffs.findIndex(b => b.itemId === normalized.itemId);
    if (previous < 0) state.buffs.push(normalized);
    else {
      const old = state.buffs[previous], rank = TALISMAN_QUALITIES.indexOf(normalized.quality) - TALISMAN_QUALITIES.indexOf(old.quality);
      if (rank > 0 || rank === 0 && normalized.expireAt > old.expireAt) state.buffs[previous] = normalized;
    }
  }
  return state;
}

/** Apply after defense and before the combat pipeline's single final rounding. */
export function talismanDamageMultiplier(state: TalismanUseState | undefined, now = gameNow(), otherRatios: number[] = []): number {
  const guard = state?.version === 1 && Array.isArray(state.buffs) ? state.buffs.find(b => b.itemId === 'talisman_guard' && b.expireAt > now) : undefined;
  let multiplier = otherRatios.filter(v => ratio(v)).reduce((result, r) => result * (1 - r), 1);
  if (guard && ratio(guard.damageReductionRatio, 0.5) && ratio(guard.reductionCap, 0.5)) {
    multiplier *= 1 - guard.damageReductionRatio;
    multiplier = Math.max(1 - guard.reductionCap, multiplier);
  }
  return multiplier;
}
export function talismanGatherBonus(state: TalismanUseState | undefined, now = gameNow(), source = 'kill'): number {
  if (source !== 'kill') return 0;
  const buff = state?.version === 1 && Array.isArray(state.buffs) ? state.buffs.find(b => b.itemId === 'talisman_gather' && b.expireAt > now) : undefined;
  return buff && ratio(buff.expBonusRatio) ? buff.expBonusRatio : 0;
}

export interface TalismanFireEffect { type: 'talisman_fire'; element: string; baseDamage: number; projectileSpeed: number; rangePx: number; hitWidth: number; hitHeight: number; facing: number }
export interface TalismanReturnDestination { mapId: string; x: number; y: number; name?: string }
export interface TalismanUseContext { mapId: string; alive: boolean; available: boolean; inTrial: boolean; closedBossFight: boolean; facing: number; visitedMaps: string[] }
export interface TalismanUseProgress {
  level: number; hp: number; mp: number; talismanUse: TalismanUseState;
  countQuality(id: string, quality: PillQuality): number;
  removeQuality(id: string, n: number, quality: PillQuality): boolean;
  runSaveTransaction<T>(apply: () => T | undefined): T | undefined;
}
/** A successful external effect may return a rollback callback for storage failure. */
export interface TalismanUseHost {
  context(): TalismanUseContext;
  emitProjectile(effect: TalismanFireEffect): false | void | (() => void);
  returnDestination(): TalismanReturnDestination | undefined;
  validateDestination(destination: TalismanReturnDestination): boolean;
  teleport(destination: TalismanReturnDestination): false | void | (() => void);
}
export interface TalismanUseOptions { items?: Record<string, unknown>; now?: () => number; enabled?: () => boolean }
export interface TalismanUseResult { ok: boolean; key?: string; params?: Record<string, string | number>; casting?: boolean }
export interface TalismanReturnCast { itemId: string; quality: PillQuality; destination: TalismanReturnDestination; startedAt: number; endsAt: number; sourceMapId: string }
interface UseConfig { consumeCount: number; mpCost: number; cooldownMs: number; cooldownGroup: string }
interface ValidItem { id: TalismanItemId; reqLevel: number; use: UseConfig; effect: Record<string, any> }
const QUALITY_FIELD = { talisman_fire: 'baseDamage', talisman_guard: 'damageReductionRatio', talisman_return: 'castMs', talisman_gather: 'expBonusRatio' } as const;

/** No numeric fallback: malformed effects disable the entire item, including all quality variants. */
export function talismanUseConfigErrors(item: unknown): string[] {
  const errors: string[] = [];
  if (!record(item)) return ['item: missing'];
  const id = item.id as TalismanItemId;
  if (!TALISMAN_ITEMS.includes(id)) return ['item.id: unsupported'];
  if (item.qualityEnabled !== true) errors.push('qualityEnabled');
  if (!Number.isInteger(item.reqLevel) || item.reqLevel < 1) errors.push('reqLevel');
  const use = item.use;
  if (!record(use)) errors.push('use');
  else {
    if (!Number.isSafeInteger(use.consumeCount) || use.consumeCount < 1) errors.push('use.consumeCount');
    if (!nonnegative(use.mpCost)) errors.push('use.mpCost');
    if (!nonnegative(use.cooldownMs)) errors.push('use.cooldownMs');
    if (typeof use.cooldownGroup !== 'string' || !use.cooldownGroup || ['__proto__', 'constructor', 'prototype'].includes(use.cooldownGroup)) errors.push('use.cooldownGroup');
  }
  const effect = item.effect;
  if (!record(effect) || effect.type !== id) return [...errors, 'effect.type'];
  const field = QUALITY_FIELD[id], values: number[] = [];
  if (!record(effect.byQuality)) errors.push('effect.byQuality');
  else for (const q of TALISMAN_QUALITIES) {
    const override = effect.byQuality[q], value = record(override) ? override[field] : undefined;
    const valid = id === 'talisman_guard' ? ratio(value, 0.5) : id === 'talisman_gather' ? ratio(value) : positive(value);
    if (!valid) errors.push(`effect.byQuality.${q}.${field}`); else values.push(value);
  }
  if (values.some((n, i) => i > 0 && (id === 'talisman_return' ? n > values[i - 1] : n < values[i - 1]))) errors.push('effect.byQuality: non-monotonic');
  const baseValid = id === 'talisman_guard' ? ratio(effect[field], 0.5) : id === 'talisman_gather' ? ratio(effect[field]) : positive(effect[field]);
  if (!baseValid) errors.push(`effect.${field}`);
  if (id === 'talisman_fire') {
    if (effect.element !== 'fire') errors.push('effect.element');
    for (const k of ['projectileSpeed', 'rangePx', 'hitWidth', 'hitHeight']) if (!positive(effect[k])) errors.push(`effect.${k}`);
  } else if (id === 'talisman_guard' || id === 'talisman_gather') {
    if (typeof effect.buffId !== 'string' || !effect.buffId) errors.push('effect.buffId');
    if (!positive(effect.durationMs)) errors.push('effect.durationMs');
    if (id === 'talisman_guard' && !ratio(effect.reductionCap, 0.5)) errors.push('effect.reductionCap');
    if (id === 'talisman_gather' && (!Array.isArray(effect.sources) || effect.sources.length !== 1 || effect.sources[0] !== 'kill')) errors.push('effect.sources');
  } else if (effect.destination !== 'nearest_town') errors.push('effect.destination');
  // An override may contain common fields too; validate the entire applied effect at every quality.
  if (record(effect.byQuality)) for (const q of TALISMAN_QUALITIES) {
    if (!record(effect.byQuality[q])) continue;
    const applied = { ...effect, ...effect.byQuality[q] }, path = `effect.byQuality.${q}`;
    if (applied.type !== id) errors.push(`${path}.type`);
    if (id === 'talisman_fire') {
      if (applied.element !== 'fire') errors.push(`${path}.element`);
      for (const key of ['projectileSpeed', 'rangePx', 'hitWidth', 'hitHeight']) if (!positive(applied[key])) errors.push(`${path}.${key}`);
    } else if (id === 'talisman_guard' || id === 'talisman_gather') {
      if (typeof applied.buffId !== 'string' || !applied.buffId) errors.push(`${path}.buffId`);
      if (!positive(applied.durationMs)) errors.push(`${path}.durationMs`);
      if (id === 'talisman_guard' && !ratio(applied.reductionCap, 0.5)) errors.push(`${path}.reductionCap`);
      if (id === 'talisman_gather' && (!Array.isArray(applied.sources) || applied.sources.length !== 1 || applied.sources[0] !== 'kill')) errors.push(`${path}.sources`);
    } else if (applied.destination !== 'nearest_town') errors.push(`${path}.destination`);
  }
  return errors;
}

export class TalismanUseSystem {
  readonly configErrors: Record<string, string[]> = {};
  private readonly items: Record<string, unknown>;
  private readonly now: () => number;
  private readonly enabled: () => boolean;
  private casting: TalismanReturnCast | null = null;
  get cast(): Readonly<TalismanReturnCast> | null { return this.casting ? { ...this.casting, destination: { ...this.casting.destination } } : null; }
  constructor(private readonly prog: TalismanUseProgress, private readonly host: TalismanUseHost, options: TalismanUseOptions = {}) {
    this.items = options.items ?? ITEMS; this.now = options.now ?? gameNow; this.enabled = options.enabled ?? (() => featureEnabled('talismanCraft'));
    for (const id of TALISMAN_ITEMS) {
      const errors = talismanUseConfigErrors(this.items[id]);
      if (errors.length) this.configErrors[id] = errors;
    }
    if (this.enabled()) this.ensureState();
  }
  private ensureState(): boolean {
    const raw: unknown = this.prog.talismanUse;
    if (record(raw) && raw.version !== undefined && raw.version !== 1) {
      this.configErrors.$save = [`talismanUse.version: unsupported ${String(raw.version)}`]; return false;
    }
    delete this.configErrors.$save;
    if (!record(raw) || raw.version !== 1 || !Array.isArray(raw.buffs) || !record(raw.cooldowns)) {
      this.prog.talismanUse = normalizeTalismanUseState(raw, this.now());
    }
    return true;
  }
  private item(id: string, quality: PillQuality): ValidItem | undefined {
    const raw = this.items[id];
    if (!qualityValid(quality) || talismanUseConfigErrors(raw).length || !record(raw)) return undefined;
    return { id: raw.id, reqLevel: raw.reqLevel, use: raw.use, effect: { ...raw.effect, ...raw.effect.byQuality[quality] } };
  }
  private reject(key: string, params?: Record<string, string | number>): TalismanUseResult { return { ok: false, key, ...(params ? { params } : {}) }; }
  precheck(id: string, quality: PillQuality, completingReturn = false): TalismanUseResult {
    if (!this.enabled()) return this.reject('talisman.use_unavailable');
    if (!this.ensureState()) return this.reject('talisman.config_error');
    const item = this.item(id, quality);
    if (!item) return this.reject('talisman.config_error');
    const context = this.host.context();
    if (!context.alive || this.prog.hp <= 0 || !context.available || this.casting && !completingReturn) return this.reject('talisman.use_unavailable');
    if (this.prog.level < item.reqLevel) return this.reject('talisman.use_level', { level: item.reqLevel });
    if (this.prog.countQuality(id, quality) < item.use.consumeCount) return this.reject('talisman.use_lack');
    const remaining = (this.prog.talismanUse.cooldowns[item.use.cooldownGroup] ?? 0) - this.now();
    if (remaining > 0) return this.reject('talisman.use_cooldown', { seconds: Math.ceil(remaining / 1000) });
    if (this.prog.mp < item.use.mpCost) return this.reject('talisman.use_mp');
    if (id === 'talisman_guard' || id === 'talisman_gather') {
      const current = this.prog.talismanUse.buffs.find(b => b.itemId === id && b.expireAt > this.now());
      if (current && TALISMAN_QUALITIES.indexOf(current.quality) > TALISMAN_QUALITIES.indexOf(quality)) return this.reject('talisman.use_stronger');
    }
    if (id === 'talisman_return' && (context.inTrial || context.closedBossFight || !mapAllowsReturn(TILED_MAPS[context.mapId]))) return this.reject('talisman.return_blocked');
    return { ok: true };
  }
  use(id: string, quality: PillQuality): TalismanUseResult {
    const check = this.precheck(id, quality); if (!check.ok) return check;
    const item = this.item(id, quality)!;
    if (id === 'talisman_return') {
      const context = this.host.context();
      if (isTalismanTown(context.mapId)) return this.reject('talisman.return_in_town');
      const destination = this.host.returnDestination();
      if (!destination) return this.reject('talisman.return_missing');
      if (!this.host.validateDestination(destination)) return this.reject('talisman.return_failed');
      const startedAt = this.now();
      this.casting = { itemId: id, quality, destination: { ...destination }, startedAt, endsAt: startedAt + item.effect.castMs, sourceMapId: context.mapId };
      return { ok: true, casting: true, key: 'talisman.return_cast', params: { town: destination.name ?? destination.mapId, seconds: item.effect.castMs / 1000 } };
    }
    return this.commit(item, quality);
  }
  private commit(item: ValidItem, quality: PillQuality, destination?: TalismanReturnDestination): TalismanUseResult {
    let rollback: void | (() => void) = undefined, effectFailed = false;
    const result = this.prog.runSaveTransaction(() => {
      const check = this.precheck(item.id, quality, !!destination); if (!check.ok) return undefined;
      if (!this.prog.removeQuality(item.id, item.use.consumeCount, quality)) return undefined;
      const now = this.now(); this.prog.mp -= item.use.mpCost;
      this.prog.talismanUse = normalizeTalismanUseState(this.prog.talismanUse, now);
      this.prog.talismanUse.cooldowns[item.use.cooldownGroup] = now + item.use.cooldownMs;
      const effect = item.effect;
      if (item.id === 'talisman_fire') {
        const emitted = this.host.emitProjectile({ type: 'talisman_fire', element: effect.element, baseDamage: effect.baseDamage,
          projectileSpeed: effect.projectileSpeed, rangePx: effect.rangePx, hitWidth: effect.hitWidth, hitHeight: effect.hitHeight, facing: this.host.context().facing });
        if (emitted === false) { effectFailed = true; return undefined; } rollback = emitted;
      } else if (destination) {
        const moved = this.host.teleport(destination);
        if (moved === false) { effectFailed = true; return undefined; } rollback = moved;
      } else {
        const buff: TalismanBuff = { buffId: effect.buffId, itemId: item.id as 'talisman_guard' | 'talisman_gather', quality, expireAt: now + effect.durationMs };
        if (item.id === 'talisman_guard') { buff.damageReductionRatio = effect.damageReductionRatio; buff.reductionCap = effect.reductionCap; }
        else buff.expBonusRatio = effect.expBonusRatio;
        this.prog.talismanUse.buffs = [...this.prog.talismanUse.buffs.filter(b => b.itemId !== item.id), buff];
      }
      return { ok: true } as TalismanUseResult;
    });
    if (!result) {
      if (typeof rollback === 'function') (rollback as () => void)();
      return this.reject(destination && effectFailed ? 'talisman.return_failed' : 'talisman.use_unavailable');
    }
    return result;
  }
  /** Casts are transient; loading a save cancels them with no consumption. */
  update(): TalismanUseResult | undefined {
    const cast = this.casting; if (!cast) return undefined;
    const context = this.host.context();
    if (!this.enabled() || !context.alive || !context.available || context.inTrial || context.closedBossFight || context.mapId !== cast.sourceMapId) {
      this.interrupt('map'); return this.reject('talisman.return_interrupted');
    }
    if (this.now() < cast.endsAt) return undefined;
    const check = this.precheck(cast.itemId, cast.quality, true);
    const reachable = this.host.returnDestination();
    // Re-evaluate the locked target, not a newly preferred candidate after state changes.
    const destination = cast.destination;
    if (!check.ok || !reachable || !this.host.validateDestination(destination)) {
      this.casting = null; return this.reject('talisman.return_failed');
    }
    const item = this.item(cast.itemId, cast.quality)!;
    const result = this.commit(item, cast.quality, destination); this.casting = null; return result;
  }
  interrupt(_reason: 'move' | 'attack' | 'damage' | 'death' | 'map'): boolean {
    if (!this.casting) return false; this.casting = null; return true;
  }
  onDeath(): void {
    this.interrupt('death'); if (!this.enabled() || !this.ensureState()) return;
    if (this.prog.talismanUse.buffs.some(b => b.itemId === 'talisman_guard')) this.prog.runSaveTransaction(() => {
      this.prog.talismanUse.buffs = this.prog.talismanUse.buffs.filter(b => b.itemId !== 'talisman_guard'); return true;
    });
  }
  guardDamage(damage: number, otherRatios: number[] = []): number {
    return damage * talismanDamageMultiplier(this.enabled() ? this.prog.talismanUse : undefined, this.now(), otherRatios);
  }
  gatherBonus(source = 'kill'): number { return this.enabled() ? talismanGatherBonus(this.prog.talismanUse, this.now(), source) : 0; }
}

/** Tiled source maps and small plain map fixtures share this property reader. */
export function talismanMapProperties(map: unknown): Record<string, any> {
  if (!record(map)) return {};
  return Array.isArray(map.properties) ? Object.fromEntries(map.properties.filter(record).map(p => [p.name, p.value])) : record(map.properties) ? map.properties : map;
}
export function isTalismanTown(id: string, maps: Record<string, unknown> = TILED_MAPS): boolean {
  if (!maps[id]) return false;
  const property = talismanMapProperties(maps[id]).returnTown;
  return typeof property === 'boolean' ? property : property === undefined && (id === 'qingyun_village' || id === 'luoxia_town');
}
export function talismanMapGaps(maps: Record<string, unknown> = TILED_MAPS): string[] {
  return Object.entries(maps).flatMap(([id, map]) => {
    const properties = talismanMapProperties(map), gaps: string[] = [];
    if ((id === 'qingyun_village' || id === 'luoxia_town') && typeof properties.returnTown !== 'boolean') gaps.push(`${id}.returnTown`);
    if (typeof properties.allowTalismanReturn !== 'boolean') gaps.push(`${id}.allowTalismanReturn`);
    return gaps;
  });
}
interface ReturnEdge { source: string; target: string; kind: 'portal' | 'ferry'; props: Record<string, any> }
export interface TalismanTownAccess {
  level: number; quests: Record<string, { state: string }>; visitedMaps: readonly string[];
  edgeOpen?: (edge: ReturnEdge) => boolean;
}
function mapObjects(map: unknown): Record<string, any>[] {
  if (!record(map)) return [];
  if (Array.isArray(map.objects)) return map.objects.filter(record);
  return (Array.isArray(map.layers) ? map.layers : []).filter(record).flatMap(layer => Array.isArray(layer.objects) ? layer.objects.filter(record) : []);
}
function mapAllowsReturn(map: unknown): boolean {
  const property = talismanMapProperties(map).allowTalismanReturn;
  return property === undefined || property === true;
}
function isTrialMap(id: string, map: unknown): boolean { return id.startsWith('trial_') || !!talismanMapProperties(map).trial; }
function townDestination(id: string, map: unknown): TalismanReturnDestination | undefined {
  const props = talismanMapProperties(map), spawn = mapObjects(map).find(o => o.type === 'playerStart' || o.name === 'playerStart');
  if (!spawn || !finite(spawn.x) || !finite(spawn.y)) return undefined;
  if (!record(map) || !positive(map.width) || !positive(map.height) || !positive(map.tilewidth) || !positive(map.tileheight)) return undefined;
  if (spawn.x < 0 || spawn.y < 0 || spawn.x >= map.width * map.tilewidth || spawn.y >= map.height * map.tileheight) return undefined;
  // Reject solid destination tiles, while allowing playerStart to stand on a platform edge.
  const col = Math.floor(spawn.x / map.tilewidth), row = Math.floor((spawn.y - 1) / map.tileheight);
  for (const layer of Array.isArray(map.layers) ? map.layers : []) if (record(layer) && (layer.name === 'collision' || layer.name === 'solid' || layer.name === 'ground') && Array.isArray(layer.data)) {
    if (layer.data[row * map.width + col] > 0) return undefined;
  }
  return { mapId: id, x: spawn.x, y: spawn.y, ...(typeof props.name === 'string' ? { name: props.name } : {}) };
}
/** Breadth-first traversal: visited towns only; ties use map ids, never safeZone. */
export function nearestTalismanTown(currentMap: string, access: TalismanTownAccess, maps: Record<string, unknown> = TILED_MAPS): TalismanReturnDestination | undefined {
  if (!maps[currentMap] || isTrialMap(currentMap, maps[currentMap]) || isTalismanTown(currentMap, maps)) return undefined;
  if (!mapAllowsReturn(maps[currentMap])) return undefined;
  const edges: ReturnEdge[] = [];
  for (const [source, map] of Object.entries(maps)) for (const object of mapObjects(map)) {
    const props = talismanMapProperties({ properties: object.props ?? object.properties });
    if (object.type === 'portal' && typeof props.target === 'string') edges.push({ source, target: props.target, kind: 'portal', props });
    if (object.type === 'ferry' && typeof props.returnTo === 'string') edges.push({ source, target: props.returnTo, kind: 'ferry', props });
    if (object.type !== 'npc' && object.type !== 'ferry') continue;
    const npc = NPCS[props.npc ?? object.name];
    if (!inPhase(props) || !inPhase(npc)) continue;
    for (const route of npc?.ferryRoutes ?? []) edges.push({ source, target: route.targetMap, kind: 'ferry', props: route });
  }
  const visited = new Set([currentMap]), queue = [currentMap], towns = new Set(access.visitedMaps);
  while (queue.length) {
    const layer = queue.splice(0), candidates = layer.filter(id => towns.has(id) && isTalismanTown(id, maps)).sort();
    for (const id of candidates) { const destination = townDestination(id, maps[id]); if (destination) return destination; }
    for (const source of layer) for (const edge of edges.filter(e => e.source === source)) {
      const p = edge.props;
      if (visited.has(edge.target) || !maps[edge.target] || isTrialMap(edge.target, maps[edge.target])) continue;
      if (p.locked || p.trialOnly || p.trial || p.permanentlyClosed || !inPhase(p) || access.level < (p.reqLevel ?? 0)) continue;
      if (p.unlockQuest && access.quests[p.unlockQuest]?.state !== 'done') continue;
      if (!(access.edgeOpen ? access.edgeOpen(edge) : mapEntryOpen(edge.target, source))) continue;
      visited.add(edge.target); queue.push(edge.target);
    }
  }
  return undefined;
}

/** Recheck the destination chosen when the cast began, even if another town is now nearer. */
export function reachableTalismanTown(currentMap: string, targetMap: string, access: TalismanTownAccess, maps: Record<string, unknown> = TILED_MAPS): TalismanReturnDestination | undefined {
  if (!access.visitedMaps.includes(targetMap)) return undefined;
  return nearestTalismanTown(currentMap, { ...access, visitedMaps: [targetMap] }, maps);
}
