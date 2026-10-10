/** Old autotile indices remain the logical roles, even when a new sheet reorders its frames. */
export const TILE_ROLES = [
  'ground_tl', 'ground_t', 'ground_tr', 'ground_single_t', 'ground_l', 'ground_fill', 'ground_r', 'ground_single',
  'oneway_l', 'oneway_m', 'oneway_r', 'oneway_single', 'rope', 'ladder', 'ladder_top', 'deco_grass',
] as const;

export interface TileVariantFrame { tileset: string; frame: number; weight: number; }
export interface TileVariantGroup { base: TileVariantFrame; frames: TileVariantFrame[]; }
export type TileVariantGroups = Map<number, TileVariantGroup>;

function properties(value: unknown): Record<string, unknown> {
  if (Array.isArray(value)) return Object.fromEntries(value.filter(p => p && typeof p.name === 'string').map(p => [p.name, p.value]));
  return value && typeof value === 'object' ? value as Record<string, unknown> : {};
}
function frameId(value: unknown): value is number { return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0; }
function weight(value: unknown): number { return typeof value === 'number' && Number.isFinite(value) && value >= 0 ? value : 1; }

/** Accept Tiled role/variant/weight properties, or an explicit original-role -> extra-frame table. */
export function tileVariantGroups(metadata: any, tileset: string): TileVariantGroups {
  const groups: TileVariantGroups = new Map();
  if (!metadata || typeof metadata !== 'object') return groups;
  const roles = new Map<number, { variant: number; frame: TileVariantFrame }[]>();
  for (const tile of Array.isArray(metadata.tiles) ? metadata.tiles : []) {
    if (!tile || !frameId(tile.id)) continue;
    const p = { ...properties(tile.properties), ...tile };
    const base = TILE_ROLES.indexOf(p.role), variant = p.variant;
    // A role alone belongs to the old metadata and must never change its rendering.
    if (base < 0 || !frameId(variant)) continue;
    const frames = roles.get(base) ?? [];
    frames.push({ variant, frame: { tileset, frame: tile.id, weight: weight(p.weight) } });
    roles.set(base, frames);
  }
  for (const [base, candidates] of roles) {
    candidates.sort((a, b) => a.variant - b.variant || a.frame.frame - b.frame.frame);
    groups.set(base, { base: candidates[0].frame, frames: candidates.map(c => c.frame) });
  }
  let table = metadata.variants ?? properties(metadata.properties).variants;
  if (typeof table === 'string') { try { table = JSON.parse(table); } catch { return groups; } }
  if (!table || typeof table !== 'object' || Array.isArray(table)) return groups;
  for (const [key, value] of Object.entries(table)) {
    const base = /^\d+$/.test(key) ? Number(key) : TILE_ROLES.indexOf(key as typeof TILE_ROLES[number]);
    if (!frameId(base)) continue;
    const original = groups.get(base)?.base ?? { tileset, frame: base, weight: 1 };
    const config = Array.isArray(value) ? { frames: value, includeBase: true } : value;
    if (!config || typeof config !== 'object') continue;
    const spec = config as { tileset?: unknown; frames?: unknown; includeBase?: unknown; weights?: unknown };
    if (!Array.isArray(spec.frames)) continue;
    const source = typeof spec.tileset === 'string' && spec.tileset ? spec.tileset : tileset;
    const frames: TileVariantFrame[] = spec.includeBase === true ? [original] : [];
    spec.frames.forEach((id, index) => {
      if (!frameId(id) || frames.some(f => f.tileset === source && f.frame === id)) return;
      frames.push({ tileset: source, frame: id, weight: weight(Array.isArray(spec.weights) ? spec.weights[index] : undefined) });
    });
    if (frames.length) groups.set(base, { base: original, frames });
  }
  return groups;
}

/** UI-1's 32-bit coordinate hash; Math.imul keeps Python's unsigned multiplication semantics. */
export function tileCoordinateHash(col: number, row: number): number {
  return Math.imul(Math.imul(Math.floor(col), 73856093) ^ Math.imul(Math.floor(row), 19349663), 2654435761) >>> 0;
}

export function pickTileVariant(groups: TileVariantGroups, tileset: string, base: number, col: number, row: number): TileVariantFrame {
  const group = groups.get(base);
  if (!group) return { tileset, frame: base, weight: 1 };
  const frames = group.frames.filter(f => f.weight > 0);
  if (!frames.length) return group.base;
  const hash = tileCoordinateHash(col, row);
  if (frames.every(f => f.weight === frames[0].weight)) return frames[(hash >>> 13) % frames.length];
  let cursor = hash / 0x100000000 * frames.reduce((sum, frame) => sum + frame.weight, 0);
  for (const frame of frames) { cursor -= frame.weight; if (cursor < 0) return frame; }
  return frames[frames.length - 1];
}
