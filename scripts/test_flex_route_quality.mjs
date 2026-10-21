import assert from 'node:assert/strict';
import {auditFlexRoute, segmentTriangleDistance} from './flex-route-quality.mjs';
import {enderBowdenRoute} from '../site/viewer/ender-bowden-route.mjs';

// Synthetic independent geometry regressions, not actual-model fit evidence.
const started = performance.now();
const axis = [1, 0, 0];
const base = {start: {positionMm: [0, 0, 0], axis}, end: {positionMm: [100, 0, 0], axis},
  minBendRadiusMm: 30, tubeRadiusMm: 2};
const line = {getPoint: t => [100*t, 0, 0], getDerivative: () => [100, 0, 0], getSecondDerivative: () => [0, 0, 0]};
const codes = result => result.findings.map(f => f.code);
function passes(curve, options, label) {
  const result = auditFlexRoute(curve, options);
  assert.equal(result.ok, true, `${label}: ${JSON.stringify(result.findings)}`);
  return result;
}
function fails(curve, options, code, label) {
  const result = auditFlexRoute(curve, options);
  assert.equal(result.ok, false, label);
  assert(codes(result).includes(code), `${label}: ${JSON.stringify(result.findings)}`);
  return result;
}
function near(actual, expected, label, tolerance = 1e-7) {
  assert(Math.abs(actual-expected) <= tolerance, `${label}: ${actual} versus ${expected}`);
}
const straight = passes(line, base, 'straight regular route');
assert.equal(straight.metrics.minBendRadiusMm, null);
near(straight.metrics.lengthMm, 100, 'straight arc length');
assert(straight.samples.length > 16);
assert.deepEqual(straight.samples[0], {t: 0, positionMm: [0, 0, 0], arcLengthMm: 0});
assert.deepEqual(straight.samples.at(-1), {t: 1, positionMm: [100, 0, 0], arcLengthMm: 100});
for (let i = 1; i < straight.samples.length; i++) {
  assert(straight.samples[i].t > straight.samples[i-1].t);
  assert(straight.samples[i].arcLengthMm > straight.samples[i-1].arcLengthMm);
}
assert.equal(straight.sampling.approximate, true);
assert.equal(straight.sampling.certifiedErrorBound, false);
assert.equal(straight.sampling.meshClearanceChecked, false);
assert.equal(straight.sampling.nativeSolidClearanceChecked, false);
assert(straight.sampling.observedChordDeviationMm <= straight.sampling.tolerances.chordToleranceMm);

// A smooth semicircular service loop has a known radius and signed fitting axes.
function arc(radius, units = 'mm') {
  const scale = units === 'm' ? .001 : 1, r = radius * scale;
  const curve = {
    getPoint: t => [r*Math.cos(Math.PI*t), r*Math.sin(Math.PI*t), 0],
    getDerivative: t => [-r*Math.PI*Math.sin(Math.PI*t), r*Math.PI*Math.cos(Math.PI*t), 0],
    getSecondDerivative: t => [-r*Math.PI**2*Math.cos(Math.PI*t), -r*Math.PI**2*Math.sin(Math.PI*t), 0],
  };
  const options = {...base, units, start: {positionMm: [radius, 0, 0], axis: [0, 1, 0]},
    end: {positionMm: [-radius, 0, 0], axis: [0, -1, 0]}};
  return {curve, options};
}
const smooth = arc(40), service = passes(smooth.curve, smooth.options, '40 mm service crown at 30 mm review limit');
near(service.metrics.minBendRadiusMm, 40, 'known derivative radius', 1e-5);
assert(service.metrics.lengthMm > 125.6 && service.metrics.lengthMm < 40*Math.PI);
assert(service.sampling.curvatureMethod.includes('derivatives'));
const meters = arc(40, 'm'), metric = passes(meters.curve, meters.options, 'metre curve with mm native fitting positions');
near(metric.metrics.minBendRadiusMm, service.metrics.minBendRadiusMm, 'unit invariant radius', 1e-5);
near(metric.metrics.lengthMm, service.metrics.lengthMm, 'unit invariant length');
const tangentOnly = {getPoint: smooth.curve.getPoint, getTangent: smooth.curve.getDerivative};
const sampled = passes(tangentOnly, smooth.options, 'exact tangent without second derivative');
near(sampled.metrics.minBendRadiusMm, 40, 'tangent-derived radius', 1e-5);
passes(smooth.curve.getPoint, smooth.options, 'point-only smooth loop fallback');
passes({getPoint: t => ({x: 100*t, y: 0, z: 0})}, base, 'Vector3-compatible positions');

// The production composite CurvePath generated equivalent subdivision parameters
// differing by ~1e-17 at X=-100. They are not geometric stalls. Keep this case
// separate from the stationary cusp and out-and-back regressions below.
const enderProfile = {machine_id: 'ender3_stock_220', origin_mm: [0, 0, 0],
  basis: [[1, 0, 0], [0, 1, 0], [0, 0, 1]], configurations: {stock: {}}};
for (const x of [-100, -25, 0, 100]) {
  const native = enderBowdenRoute({x, y: 0, z: 0}, enderProfile);
  passes(native.curve, {...base, units: 'm',
    start: {positionMm: native.endpoints_mm[0], axis: [1, 0, 0]},
    end: {positionMm: native.endpoints_mm[1], axis: [0, -1, 0]}}, `production path roundoff at X=${x}`);
}
// Source-backed regression for the short inlet handle: the old 65 mm handle
// begins 57 mm beyond the 8 mm entry line. Its cubic really violates 30 mm;
// this is independent of CurvePath length mapping and duplicate t handling.
// Freeze the original nominal stock X=-25, Z=0 cubic in native mm. Its exit
// was extruder+[8,0,0], first handle extruder+[65,0,0], and rise used a
// 40 mm crown rotated by 3*pi/8, extruder Y+45, with a 75 mm final handle.
// Never derive this rejected geometry from the current production route.
const controlMm = [
  [-76.17249999999962, 241.91036372880058, -30.29700000000281],
  [-19.172499999999616, 241.91036372880058, -30.29700000000281],
  [11.726736032605192, 211.91036372880058, 137.61036260090083],
  [11.726736032605192, 286.9103637288006, 137.61036260090083],
];
const oldLead = {
  getPoint: t => controlMm[0].map((v, i) => (1-t)**3*v + 3*(1-t)**2*t*controlMm[1][i] + 3*(1-t)*t*t*controlMm[2][i] + t**3*controlMm[3][i]),
  getDerivative: t => controlMm[0].map((v, i) => 3*(1-t)**2*(controlMm[1][i]-v) + 6*(1-t)*t*(controlMm[2][i]-controlMm[1][i]) + 3*t*t*(controlMm[3][i]-controlMm[2][i])),
  getSecondDerivative: t => controlMm[0].map((v, i) => 6*(1-t)*(controlMm[2][i]-2*controlMm[1][i]+v) + 6*t*(controlMm[3][i]-2*controlMm[2][i]+controlMm[1][i])),
};
const rejectedLead = fails(oldLead, {...base,
  start: {positionMm: controlMm[0], axis: [1, 0, 0]}, end: {positionMm: controlMm[3], axis: [0, 1, 0]}},
  'tight-bend', 'old source cubic handle must fail the unmodified bend threshold');
assert(rejectedLead.findings.some(f => f.code === 'tight-bend' && f.method === 'derivatives'));
assert(rejectedLead.metrics.minBendRadiusMm < 29);

fails(line, {...base, end: {...base.end, axis: [-1, 0, 0]}}, 'fitting-tangent', 'reversed end fitting must fail');
fails(line, {...base, start: {...base.start, axis: [-1, 0, 0]}}, 'fitting-tangent', 'reversed start fitting must fail');
fails(line, {...base, end: {...base.end, positionMm: [101, 0, 0]}}, 'endpoint-detached', 'detached end fitting');
fails(line, {...base, start: {...base.start, positionMm: [0, 1, 0]}}, 'endpoint-detached', 'detached start fitting');
const tight = arc(8);
fails(tight.curve, tight.options, 'tight-bend', 'old-style tight service loop fails despite finite attached endpoints');

// Semicubical cusp: finite positions and correct endpoint axes are insufficient.
const cusp = {
  getPoint: t => { const u = 2*t-1; return [100*u*u, 100*u*u*u, 0]; },
  getDerivative: t => { const u = 2*t-1; return [400*u, 600*u*u, 0]; },
  getSecondDerivative: t => [800, 2400*(2*t-1), 0],
};
fails(cusp, {...base, start: {positionMm: [100, -100, 0], axis: [-400, 600, 0]},
  end: {positionMm: [100, 100, 0], axis: [400, 600, 0]}}, 'cusp-or-stall', 'stationary cusp rejected');
// A collinear out-and-back fold defeats chord-flatness alone.
fails(t => [100*Math.abs(2*t-1), 0, 0], {...base,
  start: {positionMm: [100, 0, 0], axis: [-1, 0, 0]}, end: {positionMm: [100, 0, 0], axis}},
  'cusp-or-stall', 'collinear reversal rejected');

// A corner between segments can have straight geometry on each individual span.
const corner = {
  getPoint: t => t <= .5 ? [200*t, 0, 0] : [100, 200*(t-.5), 0],
  getTangent: () => [1, 1, 0], // deliberately masks the join; point-side check must still reject it.
  getCurveLengths: () => [100, 200],
};
fails(corner, {...base, start: {positionMm: [0, 0, 0], axis: [1, 1, 0]},
  end: {positionMm: [100, 100, 0], axis: [1, 1, 0]}}, 'tangent-discontinuity', 'piecewise tangent discontinuity');
fails(t => t <= .37 ? [100*t, 0, 0] : [37, 100*(t-.37), 0], {...base, breakpoints: [.37],
  end: {positionMm: [37, 63, 0], axis: [0, 1, 0]}}, 'tangent-discontinuity', 'explicit off-grid join');

// A smooth figure eight crosses far-separated arc positions. Raising it in Z
// separates the two strands without changing their XY projection.
function figureEight(height) {
  const start = -.5*Math.PI, sweep = 3*Math.PI;
  const point = t => { const u = start+sweep*t; return [100*Math.sin(u), 100*Math.sin(2*u), height*Math.cos(u)]; };
  const derivative = t => { const u = start+sweep*t; return [100*sweep*Math.cos(u), 200*sweep*Math.cos(2*u), -height*sweep*Math.sin(u)]; };
  return {curve: {getPoint: point, getDerivative: derivative}, options: {...base, minBendRadiusMm: 1,
    start: {positionMm: point(0), axis: derivative(0)}, end: {positionMm: point(1), axis: derivative(1)},
    maxPairTests: 1000000}};
}
const crossing = figureEight(0);
const crossed = fails(crossing.curve, crossing.options, 'self-intersection-or-close-sections', 'nonadjacent self crossing');
near(crossed.metrics.minNonadjacentDistanceMm, 0, 'crossing segment distance');
const closeStrands = figureEight(1);
fails(closeStrands.curve, closeStrands.options, 'self-intersection-or-close-sections', 'nonintersecting tube bodies too close');
// An open, almost complete circle brings its ends close without self crossing.
const nearClosed = t => [40*Math.cos(1.98*Math.PI*t), 40*Math.sin(1.98*Math.PI*t), 0];
fails(nearClosed, {...base, start: {positionMm: nearClosed(0), axis: [0, 1, 0]},
  end: {positionMm: nearClosed(1), axis: [-Math.sin(1.98*Math.PI), Math.cos(1.98*Math.PI), 0]}},
  'self-intersection-or-close-sections', 'nearby nonadjacent ends');

fails(t => t === .5 ? [NaN, 0, 0] : [100*t, 0, 0], base, 'nonfinite-or-invalid-curve', 'nonfinite curve');
fails({...line, getSecondDerivative: () => [Infinity, 0, 0]}, base, 'nonfinite-or-invalid-curve', 'nonfinite derivative');
fails(() => { throw new Error('unreported evaluator detail'); }, base, 'nonfinite-or-invalid-curve', 'evaluator failure');
fails(line, {...base, maxSamples: 5}, 'sampling-budget', 'bounded sampling fails closed');
const unresolved = fails(smooth.curve, {...smooth.options, minIntervals: 1, maxDepth: 0},
  'unresolved-fold-or-discontinuity', 'unresolved sampling fails closed');
assert.equal(unresolved.sampling.converged, false);
fails(line, {...base, maxPairTests: 1}, 'self-distance-budget', 'bounded nonlocal distance work fails closed');
fails({...line, getCurveLengths: () => [1, 0]}, base, 'invalid-curve-joins', 'invalid path join metadata');
assert.throws(() => auditFlexRoute(line, {...base, units: 'inches'}), /units/);
assert.throws(() => auditFlexRoute(line, {...base, tubeRadiusMm: 0}), /tubeRadiusMm/);
assert.throws(() => auditFlexRoute(line, {...base, end: {...base.end, axis: [0, 0, 0]}}), /axis/);
assert.throws(() => auditFlexRoute(line, {...base, breakpoints: [NaN]}), /breakpoint/);

// Actual-mesh narrow phase primitive. None of these rely on box overlap.
const triangle = [[0, 0, 0], [10, 0, 0], [0, 10, 0]];
const cases = [
  ['through face interior', [2, 2, -5], [2, 2, 5], 0],
  ['endpoint face contact', [2, 2, 0], [2, 2, 3], 0],
  ['coplanar endpoints outside but crosses face', [-2, 4, 0], [10, 4, 0], 0],
  ['coplanar collinear edge overlap', [-2, 0, 0], [8, 0, 0], 0],
  ['coplanar fully contained', [1, 1, 0], [2, 2, 0], 0],
  ['coplanar disjoint segment', [11, 0, 0], [12, 0, 0], 1],
  ['parallel above face', [2, 2, 2], [3, 2, 2], 2],
  ['edge interior closest to segment interior', [-3, 2, 2], [3, -2, 2], 2],
  ['vertex closest to segment interior', [-2, -1, 3], [2, -1, 3], Math.sqrt(10)],
  ['near miss above face', [-2, 4, .001], [10, 4, .001], .001],
  ['pierces plane outside triangle', [8, 8, -3], [8, 8, 3], Math.sqrt(18)],
  ['zero length segment', [2, 2, 3], [2, 2, 3], 3],
];
for (const [label, a, b, expected] of cases) {
  near(segmentTriangleDistance(a, b, triangle), expected, label);
  near(segmentTriangleDistance(b, a, [...triangle].reverse()), expected, `${label}, reversed winding and segment`);
  const shift = p => [p[0]+1234, p[2]-21, -p[1]+65];
  near(segmentTriangleDistance(shift(a), shift(b), triangle.map(shift)), expected, `${label}, transformed world mesh`);
}
near(segmentTriangleDistance([3, -1, 1], [3, 1, 1], [[0, 0, 0], [5, 0, 0], [10, 0, 0]]), 1, 'degenerate triangle line');
near(segmentTriangleDistance([0, 0, 2], [0, 0, 3], [[0, 0, 0], [0, 0, 0], [0, 0, 0]]), 2, 'degenerate triangle point');
assert.throws(() => segmentTriangleDistance([NaN, 0, 0], [0, 0, 0], triangle), /finite/);
assert.throws(() => segmentTriangleDistance([0, 0, 0], [0, 0, 0], triangle, -1), /epsilon/);

// Fitting exclusions are explicit caller-side clipping, scoped to one fitting.
// The whole segment contacts the fitting. Clip its documented 2 mm engagement
// only for that fitting; a separate body beyond the engagement must still fail.
const fitting = [[0, -10, -10], [0, 10, -10], [0, 0, 10]];
const otherBody = fitting.map(([x, y, z]) => [x+5, y, z]);
const fittingEngagement = {partId: 'inlet-fitting', end: 'start', lengthMm: 2, reason: 'intended bore engagement'};
near(segmentTriangleDistance([0, 0, 0], [10, 0, 0], fitting), 0, 'no implicit fitting exemption');
assert.equal(fittingEngagement.end, 'start');
near(segmentTriangleDistance([fittingEngagement.lengthMm, 0, 0], [10, 0, 0], fitting), 2, 'explicit clipped fitting remainder');
near(segmentTriangleDistance([fittingEngagement.lengthMm, 0, 0], [10, 0, 0], otherBody), 0, 'engagement does not hide another body');
assert.equal(fittingEngagement.partId, 'inlet-fitting');

const elapsed = performance.now()-started;
assert(elapsed < 90000, 'Regression exceeded 90 second resource budget');
assert(process.memoryUsage().rss < 512*1024*1024, 'Regression exceeded 512 MiB resource budget');
console.log('Flex route quality: smooth loops, folds, fitting axes, nonlocal clearance and triangle distances passed.');
