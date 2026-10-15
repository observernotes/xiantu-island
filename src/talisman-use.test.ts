import { ITEMS, TILED_MAPS, type PillQuality } from './data';
import {
  TalismanUseSystem, emptyTalismanUseState, normalizeTalismanUseState, talismanUseConfigErrors,
  talismanDamageMultiplier, talismanGatherBonus, nearestTalismanTown, reachableTalismanTown,
  isTalismanTown, talismanMapGaps, type TalismanUseState, type TalismanUseHost, type TalismanUseContext,
  type TalismanUseProgress, type TalismanReturnDestination, type TalismanFireEffect,
} from './TalismanUse';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++; if (actual !== expected) throw new Error(`talisman use: ${message}: ${String(actual)}, expected ${String(expected)}`);
}
function near(actual: number, expected: number, message: string) { eq(Math.abs(actual - expected) < 1e-9, true, message); }
function ready() {
  let now = 1_000_000, enabled = true, canSave = true;
  const context: TalismanUseContext = { mapId: 'bamboo_forest', alive: true, available: true, inTrial: false, closedBossFight: false, facing: -1, visitedMaps: ['qingyun_village'] };
  const inventory: Record<string, number> = {};
  for (const id of ['talisman_fire', 'talisman_guard', 'talisman_return', 'talisman_gather']) for (const quality of ['low', 'mid', 'high', 'supreme']) inventory[`${id}:${quality}`] = 10;
  const prog: TalismanUseProgress & { inventory: Record<string, number>; saves: number } = {
    level: 15, hp: 100, mp: 100, talismanUse: emptyTalismanUseState(), inventory, saves: 0,
    countQuality(id, quality) { return this.inventory[`${id}:${quality}`] ?? 0; },
    removeQuality(id, n, quality) { const key = `${id}:${quality}`; if (this.countQuality(id, quality) < n) return false; this.inventory[key] -= n; return true; },
    runSaveTransaction<T>(apply: () => T | undefined): T | undefined {
      const before = JSON.parse(JSON.stringify({ inventory: this.inventory, talismanUse: this.talismanUse, mp: this.mp }));
      let result: T | undefined;
      try { result = apply(); } catch { result = undefined; }
      if (result !== undefined && canSave) { this.saves++; return result; }
      Object.assign(this, before); return undefined;
    },
  };
  let destination: TalismanReturnDestination | undefined = { mapId: 'qingyun_village', x: 128, y: 832 };
  let landingValid = true, projectileValid = true, teleportValid = true;
  const projectiles: TalismanFireEffect[] = [], teleports: TalismanReturnDestination[] = [];
  const host: TalismanUseHost = {
    context: () => context,
    emitProjectile(effect) { if (!projectileValid) return false; projectiles.push(effect); return () => { projectiles.splice(projectiles.indexOf(effect), 1); }; },
    returnDestination: () => destination,
    validateDestination: () => landingValid,
    teleport(target) { if (!teleportValid) return false; teleports.push(target); return () => { teleports.splice(teleports.indexOf(target), 1); }; },
  };
  const items = structuredClone(ITEMS) as Record<string, any>;
  const system = new TalismanUseSystem(prog, host, { items, now: () => now, enabled: () => enabled });
  return { prog, host, context, system, items, projectiles, teleports, advance: (ms: number) => { now += ms; }, time: () => now,
    disable: () => { enabled = false; }, saveFail: () => { canSave = false; }, noProjectile: () => { projectileValid = false; },
    noDestination: () => { destination = undefined; }, badLanding: () => { landingValid = false; }, noTeleport: () => { teleportValid = false; } };
}

// Effects/quality/costs are table-driven, with no silent success on malformed configuration.
for (const id of ['talisman_fire', 'talisman_guard', 'talisman_return', 'talisman_gather']) eq(talismanUseConfigErrors(ITEMS[id]).length, 0, `${id} validates shared/snapshot table`);
for (const edit of [
  (i: any) => { delete i.use; }, (i: any) => { i.use.consumeCount = 0; }, (i: any) => { i.use.cooldownMs = -1; },
  (i: any) => { i.use.mpCost = NaN; }, (i: any) => { delete i.effect.byQuality.mid; },
  (i: any) => { i.effect.byQuality.high.baseDamage = 1; }, (i: any) => { i.effect.projectileSpeed = '360'; },
]) {
  const f = ready(); edit(f.items.talisman_fire); eq(f.system.use('talisman_fire', 'low').ok, false, 'invalid config rejects'); eq(f.prog.saves, 0, 'invalid config has no mutation');
}
{
  const f = ready(); f.items.talisman_fire.use.consumeCount = 2; f.items.talisman_fire.use.mpCost = 7;
  eq(f.system.use('talisman_fire', 'supreme').ok, true, 'fire emits without target');
  eq(f.prog.countQuality('talisman_fire', 'supreme'), 8, 'consumeCount read table'); eq(f.prog.mp, 93, 'mpCost read table');
  eq(f.projectiles.length, 1, 'air shot is still a successful use'); eq(f.projectiles[0].baseDamage, f.items.talisman_fire.effect.byQuality.supreme.baseDamage, 'quality damage read table');
  eq(f.projectiles[0].facing, -1, 'projectile faces current direction');
  eq(f.prog.talismanUse.cooldowns.talisman_fire, f.time() + f.items.talisman_fire.use.cooldownMs, 'cooldown absolute expiry read table');
  eq(f.system.use('talisman_fire', 'low').key, 'talisman.use_cooldown', 'all quality stacks share cooldown');
  eq(f.system.use('talisman_gather', 'low').ok, true, 'different talismans have independent cooldown groups');
  f.advance(f.items.talisman_fire.use.cooldownMs); eq(f.system.use('talisman_fire', 'low').ok, true, 'exact cooldown boundary permits use');
}
for (const scenario of ['disabled', 'quantity', 'level', 'dead', 'state', 'trial', 'mp', 'spawn', 'save'] as const) {
  const f = ready();
  if (scenario === 'disabled') f.disable();
  if (scenario === 'quantity') f.prog.inventory['talisman_fire:low'] = 0;
  if (scenario === 'level') f.prog.level = 14;
  if (scenario === 'dead') f.context.alive = false;
  if (scenario === 'state') f.context.available = false;
  if (scenario === 'trial') f.context.inTrial = true;
  if (scenario === 'mp') { f.items.talisman_fire.use.mpCost = 5; f.prog.mp = 4; }
  if (scenario === 'spawn') f.noProjectile();
  if (scenario === 'save') f.saveFail();
  const before = JSON.stringify({ inventory: f.prog.inventory, mp: f.prog.mp, state: f.prog.talismanUse });
  eq(f.system.use('talisman_fire', 'low').ok, false, `${scenario} rejects`);
  eq(JSON.stringify({ inventory: f.prog.inventory, mp: f.prog.mp, state: f.prog.talismanUse }), before, `${scenario} does not consume/start cooldown`);
  eq(f.projectiles.length, 0, `${scenario} leaves no projectile`);
}
{
  const f = ready(); eq(f.system.use('talisman_guard', 'high').ok, true, 'guard use');
  const guard = f.prog.talismanUse.buffs[0], expected = f.items.talisman_guard.effect.byQuality.high.damageReductionRatio;
  near(f.system.guardDamage(100), 100 * (1 - expected), 'guard after-defense multiplier');
  near(f.system.guardDamage(100, [0.4]), 50, 'multiplicative reduction capped at configured cap');
  eq(guard.expireAt, f.time() + f.items.talisman_guard.effect.durationMs, 'guard duration read table');
  f.advance(f.items.talisman_guard.effect.durationMs); near(f.system.guardDamage(100), 100, 'guard expires at exact real-time expiry');
}
{
  const f = ready(), item = f.items.talisman_gather;
  eq(f.system.use('talisman_gather', 'high').ok, true, 'gather use');
  near(f.system.gatherBonus(), item.effect.byQuality.high.expBonusRatio, 'gather quality strength read table');
  eq(f.prog.talismanUse.buffs[0].expireAt - f.time(), item.effect.durationMs, 'gather full real-time duration');
  for (const source of ['quest', 'craft', 'offline', 'seclusion', 'overflow']) eq(f.system.gatherBonus(source), 0, `${source} never gets kill bonus`);
  f.advance(item.use.cooldownMs); const before = f.prog.countQuality('talisman_gather', 'low');
  eq(f.system.use('talisman_gather', 'low').key, 'talisman.use_stronger', 'lower quality cannot replace stronger buff');
  eq(f.prog.countQuality('talisman_gather', 'low'), before, 'lower replacement consumes nothing');
  const oldExpiry = f.prog.talismanUse.buffs[0].expireAt;
  eq(f.system.use('talisman_gather', 'high').ok, true, 'equal quality refreshes');
  eq(f.prog.talismanUse.buffs.length, 1, 'equal quality does not stack');
  eq(f.prog.talismanUse.buffs[0].expireAt, oldExpiry + item.use.cooldownMs, 'refresh gives full duration');
  f.advance(item.use.cooldownMs); eq(f.system.use('talisman_gather', 'supreme').ok, true, 'higher quality replaces');
  eq(f.prog.talismanUse.buffs.length, 1, 'higher quality does not stack');
  near(f.system.gatherBonus(), item.effect.byQuality.supreme.expBonusRatio, 'higher strength takes effect');
  eq(f.system.use('talisman_guard', 'low').ok, true, 'guard coexists with gather');
  f.system.onDeath(); eq(f.prog.talismanUse.buffs.length, 1, 'death clears only guard');
  near(f.system.gatherBonus(), item.effect.byQuality.supreme.expBonusRatio, 'death keeps gather original expiry');
  f.advance(item.effect.durationMs); eq(f.system.gatherBonus(), 0, 'gather offline/pause real-time expiration');
}
for (const reason of ['move', 'attack', 'damage', 'death', 'map'] as const) {
  const f = ready(), before = JSON.stringify({ inventory: f.prog.inventory, state: f.prog.talismanUse });
  eq(f.system.use('talisman_return', 'low').casting, true, `${reason} starts return cast`);
  eq(f.prog.saves, 0, 'starting cast has no cost transaction'); eq(f.system.interrupt(reason), true, `${reason} interrupts`);
  f.advance(10_000); eq(f.system.update(), undefined, 'cancelled cast never completes');
  eq(JSON.stringify({ inventory: f.prog.inventory, state: f.prog.talismanUse }), before, `${reason} interruption consumes nothing`);
}
for (const quality of ['low', 'mid', 'high', 'supreme'] as PillQuality[]) {
  const f = ready(), item = f.items.talisman_return;
  eq(f.system.use('talisman_return', quality).ok, true, `${quality} return starts`);
  const cast = f.system.cast!; eq(cast.endsAt - cast.startedAt, item.effect.byQuality[quality].castMs, 'cast duration read quality table');
  f.advance(item.effect.byQuality[quality].castMs - 1); eq(f.system.update(), undefined, 'cast not complete before deadline');
  f.advance(1); eq(f.system.update()?.ok, true, 'cast completes at deadline'); eq(f.teleports.length, 1, 'return teleports once');
  eq(f.prog.countQuality('talisman_return', quality), 9, 'success consumes locked quality once');
  eq(f.system.update(), undefined, 'same return cannot settle twice');
}
for (const scenario of ['town', 'closedBoss', 'noDestination', 'badLanding', 'teleportFail', 'saveFail', 'routeLost', 'stateLost', 'mapChanged'] as const) {
  const f = ready(), before = JSON.stringify({ inventory: f.prog.inventory, state: f.prog.talismanUse });
  if (scenario === 'town') f.context.mapId = 'qingyun_village';
  if (scenario === 'closedBoss') f.context.closedBossFight = true;
  if (scenario === 'noDestination') f.noDestination();
  if (scenario === 'badLanding') f.badLanding();
  const start = f.system.use('talisman_return', 'low');
  if (['town', 'closedBoss', 'noDestination', 'badLanding'].includes(scenario)) eq(start.ok, false, `${scenario} rejects before cast`);
  else {
    eq(start.ok, true, `${scenario} begins cast`);
    if (scenario === 'teleportFail') f.noTeleport();
    if (scenario === 'saveFail') f.saveFail();
    if (scenario === 'routeLost') f.noDestination();
    if (scenario === 'stateLost') f.context.available = false;
    if (scenario === 'mapChanged') f.context.mapId = 'lingxi_path';
    f.advance(5000); eq(f.system.update()?.ok, false, `${scenario} rejects completion`);
  }
  eq(JSON.stringify({ inventory: f.prog.inventory, state: f.prog.talismanUse }), before, `${scenario} no consumption or cooldown`);
  eq(f.teleports.length, 0, `${scenario} no migration`);
}

// Invalid shared-field quality overrides cannot bypass validation.
for (const [id, field, value] of [['talisman_guard', 'durationMs', -1], ['talisman_guard', 'reductionCap', 1], ['talisman_gather', 'sources', ['quest']], ['talisman_fire', 'projectileSpeed', 0], ['talisman_return', 'destination', 'safe_zone']] as const) {
  const f = ready(); f.items[id].effect.byQuality.low[field] = value;
  eq(f.system.use(id, 'low').ok, false, `${id} malformed override ${field} rejected`);
  eq(f.prog.saves, 0, 'invalid override no transaction');
}

// Runtime expiry fields survive serialization and repeated load; legacy missing fields default empty.
{
  const f = ready(); f.system.use('talisman_gather', 'supreme'); f.system.use('talisman_guard', 'mid');
  const raw = JSON.parse(JSON.stringify(f.prog.talismanUse));
  const restored = normalizeTalismanUseState(raw, f.time());
  eq(JSON.stringify(restored), JSON.stringify(f.prog.talismanUse), 'saved cooldown/buffs restore unchanged');
  eq(JSON.stringify(normalizeTalismanUseState(restored, f.time())), JSON.stringify(restored), 'repeat restore idempotent');
  eq(talismanGatherBonus(restored, f.time()), f.items.talisman_gather.effect.byQuality.supreme.expBonusRatio, 'restored actual gather strength');
  near(talismanDamageMultiplier(restored, f.time()), 1 - f.items.talisman_guard.effect.byQuality.mid.damageReductionRatio, 'restored guard actual strength');
  eq(JSON.stringify(normalizeTalismanUseState(undefined, f.time())), JSON.stringify(emptyTalismanUseState()), 'old save absent field defaults');
  const expiry = f.time() + f.items.talisman_gather.effect.durationMs;
  eq(normalizeTalismanUseState(raw, expiry).buffs.length, 0, 'offline expires saved buffs');
  eq(Object.keys(normalizeTalismanUseState(raw, expiry).cooldowns).length, 0, 'offline expires saved cooldowns');
  const doubled: TalismanUseState = { ...restored, buffs: [...restored.buffs, { ...restored.buffs[0], quality: 'low' }] };
  eq(normalizeTalismanUseState(doubled, f.time()).buffs.length, 2, 'duplicate type sanitized without stacking');
}

// Return navigation uses reachable visited towns, ignores safeZone, and honors explicit map flags.
function map(id: string, targetIds: string[] = [], properties: Record<string, unknown> = {}) {
  return { width: 10, height: 10, tilewidth: 32, tileheight: 32, properties: { id, ...properties }, layers: [{ type: 'objectgroup', objects: [
    { type: 'playerStart', x: 32, y: 64 }, ...targetIds.map(target => ({ type: 'portal', properties: { target } })),
  ] }] };
}
{
  const maps: Record<string, any> = { field: map('field', ['sect', 'a', 'b']), sect: map('sect', [], { safeZone: true }),
    a: map('a', [], { returnTown: true }), b: map('b', [], { returnTown: true }), qingyun_village: map('qingyun_village') };
  const access = { level: 15, quests: {} as Record<string, { state: string }>, visitedMaps: ['b', 'a', 'sect'], edgeOpen: () => true };
  eq(nearestTalismanTown('field', access, maps)?.mapId, 'a', 'same distance ties alphabetically');
  eq(nearestTalismanTown('field', { ...access, visitedMaps: ['b'] }, maps)?.mapId, 'b', 'candidate must have been visited');
  eq(reachableTalismanTown('field', 'b', access, maps)?.mapId, 'b', 'cast locked target stays valid if nearer candidate differs');
  eq(reachableTalismanTown('field', 'qingyun_village', access, maps), undefined, 'unvisited locked destination invalid');
  maps.field.layers[0].objects[2].properties.reqLevel = 16;
  eq(nearestTalismanTown('field', access, maps)?.mapId, 'b', 'level locked edge excluded');
  delete maps.field.layers[0].objects[2].properties.reqLevel;
  maps.field.layers[0].objects[2].properties.unlockQuest = 'gate';
  eq(nearestTalismanTown('field', access, maps)?.mapId, 'b', 'quest locked edge excluded');
  access.quests.gate = { state: 'done' }; eq(nearestTalismanTown('field', access, maps)?.mapId, 'a', 'completed quest opens edge');
  maps.field.layers[0].objects[2].properties.locked = true;
  eq(nearestTalismanTown('field', access, maps)?.mapId, 'b', 'permanently locked edge excluded');
  maps.field.layers[0].objects[3].properties.trialOnly = true;
  eq(nearestTalismanTown('field', access, maps), undefined, 'trial-only edge and sect safezone excluded');
  maps.field.properties.allowTalismanReturn = false; eq(nearestTalismanTown('field', access, maps), undefined, 'explicit map deny');
  eq(isTalismanTown('qingyun_village', maps), true, 'explicit design village fallback');
  maps.qingyun_village.properties.returnTown = false; eq(isTalismanTown('qingyun_village', maps), false, 'explicit table value wins over fallback');
  eq(isTalismanTown('sect', maps), false, 'safeZone alone never town');
}
{
  const f = ready();
  const destination = nearestTalismanTown('bamboo_forest', { level: 15, quests: {}, visitedMaps: ['qingyun_village'], edgeOpen: () => true });
  eq(destination?.mapId, 'qingyun_village', 'actual shared/snapshot bamboo portal resolves village playerStart');
  eq(isTalismanTown('qingyun_village', TILED_MAPS), true, 'actual village fallback recorded');
  eq(talismanMapGaps().some(g => g === 'qingyun_village.returnTown'), true, 'missing returnTown listed as configuration gap');
}
console.log(`talisman use tests ok: ${assertions} assertions`);
