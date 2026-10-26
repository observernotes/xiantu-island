import { FEEL, SPEC } from './config/feel';
import { isGsbSceneData, surfacesToBodies, type GsbSceneData } from './scenes/GsbGeometry';

let assertions = 0;
function eq(actual: unknown, expected: unknown, message: string) {
  assertions++;
  if (actual !== expected) throw new Error(`${message}: got ${String(actual)}, expected ${String(expected)}`);
}
function same(actual: unknown, expected: unknown, message: string) {
  eq(JSON.stringify(actual), JSON.stringify(expected), message);
}
const fixture: GsbSceneData = {
  space: { logicalWidth: 2560, logicalHeight: 864 },
  surfaces: [
    { id: 's_village', polyline: [[0, 700], [674, 700]], effectiveLandingRange: [13, 661] },
    { id: 's_market', polyline: [[674, 635], [1165, 635]], support: 'solid' },
    { id: 's_roof', polyline: [[540, 520], [300, 520]], support: 'one-way', effectiveLandingRange: [313, 527] },
  ],
};

eq(isGsbSceneData(fixture), true, 'valid scene data');
const flat = surfacesToBodies(fixture);
same(flat.solids[0], { id: 's_village', x: 0, y: 700, width: 674, height: FEEL.tile }, 'village retains exact visual standing edge and full width');
same(flat.oneWays, [{ id: 's_roof', x: 300, y: 520, width: 240, height: SPEC.oneWayEdge }], 'roof is a thin one-way with reversed endpoints supported');

const withSolids: GsbSceneData = { ...fixture, solids: [
  { id: 'solid_base', polygon: [[0, 700], [2560, 700], [2560, 864], [0, 864]], openings: [] },
  { id: 'solid_market', polygon: [[674, 635], [1165, 635], [1165, 700], [674, 700]] },
] };
const full = surfacesToBodies(withSolids);
same(full.solids, [
  { id: 'solid_base', x: 0, y: 700, width: 2560, height: 164 },
  { id: 'solid_market', x: 674, y: 635, width: 491, height: 65 },
], 'base and market preserve complete thickness without duplicate surface bodies');
same(full.oneWays, flat.oneWays, 'polygon blockers do not change roof collision');

const fractional = surfacesToBodies({ space: fixture.space, surfaces: [
  { id: 'precise', polyline: [[10.25, 700.125], [34.875, 700.125], [80.5, 700.125]] },
  { id: 'thin', polyline: [[4.125, 520.75], [91.875, 520.75]], support: 'one-way' },
] });
same(fractional.solids, [{ id: 'precise', x: 10.25, y: 700.125, width: 70.25, height: 32 }], 'fractional solid coordinates are never quantized');
same(fractional.oneWays, [{ id: 'thin', x: 4.125, y: 520.75, width: 87.75, height: 8 }], 'fractional one-way coordinates are never quantized');

const partial = surfacesToBodies({ space: fixture.space,
  surfaces: [{ id: 'wide', polyline: [[0, 100], [100, 100]] }],
  solids: [{ id: 'center', polygon: [[25, 100], [75, 100], [75, 180], [25, 180]] }],
});
same(partial.solids, [
  { id: 'center', x: 25, y: 100, width: 50, height: 80 },
  { id: 'wide_0', x: 0, y: 100, width: 25, height: 32 },
  { id: 'wide_1', x: 75, y: 100, width: 25, height: 32 },
], 'partially covered surface fills only missing spans');

const unsupported = surfacesToBodies({ space: fixture.space, surfaces: [
  { id: 'slope', polyline: [[0, 50], [100, 80]] },
  { id: 'point', polyline: [[20, 20]] },
  { id: 'zero', polyline: [[20, 20], [20, 20]] },
  { id: 'future', polyline: [[0, 30], [20, 30]], support: 'unknown' },
], solids: [
  { id: 'triangle', polygon: [[0, 0], [100, 0], [50, 80]] },
  { id: 'diagonal', polygon: [[0, 0], [100, 80], [100, 0], [0, 80]] },
  { id: 'opening', polygon: [[0, 0], [100, 0], [100, 80], [0, 80]], openings: ['door'] },
] });
same(unsupported, { solids: [], oneWays: [] }, 'unsupported geometry never becomes an invented bounding-box ledge');

for (const invalid of [null, {}, { space: fixture.space }, { space: fixture.space, surfaces: {} },
  ...[0, -1, NaN, Infinity, '2560'].map(logicalWidth => ({ ...fixture, space: { ...fixture.space, logicalWidth } })),
  ...[0, -1, NaN, Infinity].map(logicalHeight => ({ ...fixture, space: { ...fixture.space, logicalHeight } })),
  { ...fixture, surfaces: [null] }, { ...fixture, surfaces: [{ polyline: [[1, NaN], [2, 2]] }] },
  { ...fixture, solids: [{ polygon: [[0, 0], [Infinity, 2]] }] },
]) eq(isGsbSceneData(invalid), false, 'malformed scene data is rejected before map construction');

eq(isGsbSceneData({ space: { logicalWidth: 1, logicalHeight: 1 }, surfaces: [] }), true, 'empty valid scenes can still provide artwork and bounds');

export const result = { assertions, passed: true };
