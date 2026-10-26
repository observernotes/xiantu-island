import { FEEL, SPEC } from '../config/feel';

type GsbPoint = readonly [number, number];
interface GsbSurface {
  id?: string;
  polyline: readonly GsbPoint[];
  support?: string;
  [key: string]: unknown;
}
interface GsbSolid {
  id?: string;
  polygon: readonly GsbPoint[];
  openings?: readonly unknown[];
  [key: string]: unknown;
}
export interface GsbSceneData {
  space: { logicalWidth: number; logicalHeight: number; [key: string]: unknown };
  surfaces: readonly GsbSurface[];
  solids?: readonly GsbSolid[];
  [key: string]: unknown;
}

// All coordinates are logical pixels, measured from the body's top-left corner.
export interface GsbBodyRect {
  id: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

const record = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const finite = (value: unknown): value is number => typeof value === 'number' && Number.isFinite(value);
const points = (value: unknown): value is readonly GsbPoint[] => Array.isArray(value) &&
  value.every(point => Array.isArray(point) && point.length === 2 && point.every(finite));
const optionalId = (value: Record<string, unknown>) => value.id === undefined || typeof value.id === 'string';

export function isGsbSceneData(value: unknown): value is GsbSceneData {
  if (!record(value) || !record(value.space)) return false;
  const { logicalWidth, logicalHeight } = value.space;
  return finite(logicalWidth) && logicalWidth > 0 && finite(logicalHeight) && logicalHeight > 0 &&
    Array.isArray(value.surfaces) && value.surfaces.every(surface => record(surface) && optionalId(surface) &&
      points(surface.polyline) && (surface.support === undefined || typeof surface.support === 'string')) &&
    (value.solids === undefined || (Array.isArray(value.solids) && value.solids.every(solid =>
      record(solid) && optionalId(solid) && points(solid.polygon) &&
      (solid.openings === undefined || Array.isArray(solid.openings)))));
}

function polygonRect(solid: GsbSolid, index: number): GsbBodyRect | undefined {
  // Filling a polygon's bounding box would close holes or create invented ledges.
  // Only complete axis-aligned rectangles are supported by Arcade bodies here.
  if (solid.openings?.length) return;
  const vertices = [...solid.polygon];
  if (vertices.length === 5 && vertices[0][0] === vertices[4][0] && vertices[0][1] === vertices[4][1]) vertices.pop();
  if (vertices.length !== 4) return;
  const x = Math.min(...vertices.map(point => point[0]));
  const y = Math.min(...vertices.map(point => point[1]));
  const right = Math.max(...vertices.map(point => point[0]));
  const bottom = Math.max(...vertices.map(point => point[1]));
  if (!(right > x && bottom > y) || !finite(right - x) || !finite(bottom - y)) return;
  const corners = new Set<string>();
  for (let i = 0; i < vertices.length; i++) {
    const [vx, vy] = vertices[i], [nextX, nextY] = vertices[(i + 1) % vertices.length];
    if ((vx !== x && vx !== right) || (vy !== y && vy !== bottom) || (vx !== nextX && vy !== nextY)) return;
    corners.add(`${vx},${vy}`);
  }
  if (corners.size !== 4) return;
  return { id: solid.id || `solid_${index}`, x, y, width: right - x, height: bottom - y };
}

function uncoveredSpans(x: number, right: number, y: number, bodies: readonly GsbBodyRect[]) {
  let spans = [[x, right]];
  for (const body of bodies) {
    if (body.y !== y) continue;
    const end = body.x + body.width;
    spans = spans.flatMap(([left, right]) => {
      if (end <= left || body.x >= right) return [[left, right]];
      const remaining: number[][] = [];
      if (body.x > left) remaining.push([left, body.x]);
      if (end < right) remaining.push([end, right]);
      return remaining;
    });
  }
  return spans;
}

export function surfacesToBodies(sceneData: GsbSceneData): { solids: GsbBodyRect[]; oneWays: GsbBodyRect[] } {
  const solids: GsbBodyRect[] = [], oneWays: GsbBodyRect[] = [];
  for (const [index, solid] of (sceneData.solids ?? []).entries()) {
    const rect = polygonRect(solid, index);
    if (!rect) continue;
    // Identical/contained duplicate solids add no useful collision geometry.
    if (!solids.some(body => body.x <= rect.x && body.y <= rect.y &&
      body.x + body.width >= rect.x + rect.width && body.y + body.height >= rect.y + rect.height)) solids.push(rect);
  }
  for (const [index, surface] of sceneData.surfaces.entries()) {
    const { polyline, support = 'solid' } = surface;
    if (polyline.length < 2 || (support !== 'solid' && support !== 'one-way')) continue;
    const y = polyline[0][1];
    // Slopes need a different physics adapter; never turn them into flat ledges.
    if (!polyline.every(point => point[1] === y)) continue;
    const x = Math.min(...polyline.map(point => point[0])), right = Math.max(...polyline.map(point => point[0]));
    if (!(right > x) || !finite(right - x)) continue;
    const bodies = support === 'one-way' ? oneWays : solids;
    const height = support === 'one-way' ? SPEC.oneWayEdge : FEEL.tile;
    // effectiveLandingRange has already deducted the actor's half-width. The
    // collision body must retain the visual surface's full span instead.
    const spans = uncoveredSpans(x, right, y, bodies);
    for (const [part, [left, end]] of spans.entries()) bodies.push({
      id: `${surface.id || `surface_${index}`}${spans.length > 1 ? `_${part}` : ''}`,
      x: left, y, width: end - left, height,
    });
  }
  return { solids, oneWays };
}
