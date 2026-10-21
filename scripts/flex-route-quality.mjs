/**
 * Independent, bounded PTFE centreline plausibility checks; no renderer imports.
 *
 * auditFlexRoute accepts a function(t), or a Curve-like object with getPoint(t),
 * on [0,1]. Positions may be arrays/typed arrays or {x,y,z}. units is 'mm'
 * (default) or 'm', and applies to curve positions and derivatives only.
 * Optional getDerivative/getSecondDerivative are dP/dt and d2P/dt2, NOT unit
 * tangents. getTangent may supply unit directions. Fitting positionMm and all
 * distance options/results are always mm, in the same world coordinate frame.
 * Both fitting axes are signed in the direction of INCREASING t, including end.
 * A regular parameterization is required: stationary derivatives are findings.
 *
 * Sampling refines quarter-point chord deviation, length, and turning, seeded
 * uniformly and at explicit breakpoints (or CurvePath cumulative-length joins).
 * Curvature uses |P' x P''| / |P'|^3 when both derivatives exist, plus sampled
 * circumcircles and tangent turns. One-sided point derivatives check joins even
 * if a supplied tangent masks a kink. All are finite samples: observed chord
 * error is NOT a certified global error bound for an arbitrary black-box curve.
 * Unresolved refinement/evaluation/pair budgets fail, never produce a pass.
 * Self-distance excludes a declared local arc neighborhood; cusps and bend
 * checks also cover that neighborhood. Defaults are review tolerances, not
 * material specifications. Use source-backed bend limits for a release audit.
 *
 * segmentTriangleDistance takes mm coordinates and returns mm surface distance.
 * It handles degenerate triangles, piercing and coplanar overlap. It has NO
 * implicit fitting exemptions. A mesh caller must explicitly clip only a named
 * fitting's start/end engagement arc interval, recording its identity, end,
 * length and reason, and test the remainder (including straddling segments).
 * Transform actual exported triangles to the common world frame before use.
 * Boxes can filter candidates; they are not collision-free proof. Surface
 * distance does not detect containment inside a closed solid, certify native
 * solid clearance, or cover unsampled motion. Check solid interiors separately.
 */

const sub = (a, b) => a.map((v, i) => v - b[i]);
const addScaled = (a, b, s) => a.map((v, i) => v + b[i] * s);
const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const cross = (a, b) => [a[1]*b[2]-a[2]*b[1], a[2]*b[0]-a[0]*b[2], a[0]*b[1]-a[1]*b[0]];
const norm = a => Math.hypot(...a);
const clamp = x => Math.max(0, Math.min(1, x));
const distance = (a, b) => norm(sub(a, b));
const finite = a => a.every(Number.isFinite);
function vector(v) {
  const a = Array.isArray(v) || ArrayBuffer.isView(v) ? [v[0], v[1], v[2]] : [v?.x, v?.y, v?.z];
  if (!finite(a)) throw new TypeError('Expected three finite coordinates');
  return a;
}
function angle(a, b) {
  const na = norm(a), nb = norm(b);
  if (!(na > 0 && nb > 0 && Number.isFinite(na) && Number.isFinite(nb))) return Infinity;
  const ua = a.map(x => x / na), ub = b.map(x => x / nb);
  return Math.atan2(norm(cross(ua, ub)), Math.max(-1, Math.min(1, dot(ua, ub))));
}
function pointSegmentSquared(p, a, b) {
  const ab = sub(b, a), length2 = dot(ab, ab);
  const delta = sub(p, addScaled(a, ab, length2 > 0 ? clamp(dot(sub(p, a), ab) / length2) : 0));
  return dot(delta, delta);
}
function segmentSegmentSquared(p, q, a, b) {
  const d = sub(q, p), e = sub(b, a), r = sub(p, a);
  const dd = dot(d, d), ee = dot(e, e), de = dot(d, e), dr = dot(d, r), er = dot(e, r);
  if (dd === 0) return pointSegmentSquared(p, a, b);
  if (ee === 0) return pointSegmentSquared(a, p, q);
  const denominator = dd * ee - de * de;
  let s = denominator > Number.EPSILON * dd * ee ? clamp((de * er - dr * ee) / denominator) : 0;
  let t = (de * s + er) / ee;
  if (t < 0) { t = 0; s = clamp(-dr / dd); }
  else if (t > 1) { t = 1; s = clamp((de - dr) / dd); }
  const delta = sub(addScaled(p, d, s), addScaled(a, e, t));
  return dot(delta, delta);
}
function pointTriangleSquared(p, a, b, c) {
  const ab = sub(b, a), ac = sub(c, a), ap = sub(p, a);
  const area2 = dot(cross(ab, ac), cross(ab, ac));
  if (area2 <= Number.EPSILON * dot(ab, ab) * dot(ac, ac)) {
    return Math.min(pointSegmentSquared(p, a, b), pointSegmentSquared(p, b, c), pointSegmentSquared(p, c, a));
  }
  const d1 = dot(ab, ap), d2 = dot(ac, ap);
  if (d1 <= 0 && d2 <= 0) return dot(ap, ap);
  const bp = sub(p, b), d3 = dot(ab, bp), d4 = dot(ac, bp);
  if (d3 >= 0 && d4 <= d3) return dot(bp, bp);
  const vc = d1 * d4 - d3 * d2;
  if (vc <= 0 && d1 >= 0 && d3 <= 0) return pointSegmentSquared(p, a, b);
  const cp = sub(p, c), d5 = dot(ab, cp), d6 = dot(ac, cp);
  if (d6 >= 0 && d5 <= d6) return dot(cp, cp);
  const vb = d5 * d2 - d1 * d6;
  if (vb <= 0 && d2 >= 0 && d6 <= 0) return pointSegmentSquared(p, a, c);
  const va = d3 * d6 - d5 * d4;
  if (va <= 0 && d4 >= d3 && d5 >= d6) return pointSegmentSquared(p, b, c);
  const n = cross(ab, ac), height = dot(ap, n);
  return height * height / area2;
}

/** Minimum segment/triangle SURFACE distance in mm. No implicit exclusions. */
export function segmentTriangleDistance(aMm, bMm, triangleMm, epsilonMm = 1e-8) {
  if (!Number.isFinite(epsilonMm) || epsilonMm < 0) throw new RangeError('Invalid distance epsilon');
  if (!Array.isArray(triangleMm) || triangleMm.length !== 3) throw new TypeError('Expected three triangle vertices');
  const p = vector(aMm), q = vector(bMm), [a, b, c] = triangleMm.map(vector);
  const n = cross(sub(b, a), sub(c, a)), size = norm(n);
  if (size > 0) {
    const unit = n.map(v => v / size), dp = dot(sub(p, a), unit), dq = dot(sub(q, a), unit);
    if (Math.abs(dp - dq) > epsilonMm) {
      const t = dp / (dp - dq);
      if (t >= 0 && t <= 1 && pointTriangleSquared(addScaled(p, sub(q, p), t), a, b, c) <= epsilonMm ** 2) return 0;
    }
  }
  const squared = Math.min(pointTriangleSquared(p, a, b, c), pointTriangleSquared(q, a, b, c),
    segmentSegmentSquared(p, q, a, b), segmentSegmentSquared(p, q, b, c), segmentSegmentSquared(p, q, c, a));
  const result = Math.sqrt(Math.max(0, squared));
  if (!Number.isFinite(result)) throw new RangeError('Nonfinite distance arithmetic');
  return result <= epsilonMm ? 0 : result;
}

/**
 * Required options: start/end {positionMm, axis}, minBendRadiusMm, tubeRadiusMm.
 * Optional mm tolerances: endpointToleranceMm=.25, bendRadiusToleranceMm=.1,
 * chordToleranceMm=.05, maxSegmentLengthMm=5, selfClearanceMm=0,
 * localArcExclusionMm=max(4*tubeRadiusMm+2*selfClearanceMm,2*maxSegmentLengthMm),
 * numericToleranceMm=1e-7. Angular tolerances: tangentToleranceDeg=8,
 * maxTangentStepDeg=8, discontinuityToleranceDeg=5. Bounded work:
 * minIntervals=16, maxDepth=12, maxSamples=4097, maxPairTests=1000000.
 * breakpoints are additional parameter values in (0,1); CurvePath joins are
 * discovered automatically through getCurveLengths(). All limits are reported.
 */
export function auditFlexRoute(curve, options = {}) {
  const scale = options.units === undefined || options.units === 'mm' ? 1 : options.units === 'm' ? 1000 : NaN;
  if (!Number.isFinite(scale)) throw new RangeError("units must be 'mm' or 'm'");
  const o = {
    endpointToleranceMm: .25, bendRadiusToleranceMm: .1, chordToleranceMm: .05,
    maxSegmentLengthMm: 5, selfClearanceMm: 0, numericToleranceMm: 1e-7,
    tangentToleranceDeg: 8, maxTangentStepDeg: 8, discontinuityToleranceDeg: 5,
    minIntervals: 16, maxDepth: 12, maxSamples: 4097, maxPairTests: 1000000,
    ...options,
  };
  o.localArcExclusionMm ??= Math.max(4 * o.tubeRadiusMm + 2 * o.selfClearanceMm, 2 * o.maxSegmentLengthMm);
  for (const key of ['minBendRadiusMm', 'tubeRadiusMm', 'chordToleranceMm', 'maxSegmentLengthMm', 'numericToleranceMm',
    'maxTangentStepDeg', 'discontinuityToleranceDeg', 'localArcExclusionMm']) {
    if (!Number.isFinite(o[key]) || o[key] <= 0) throw new RangeError(`Invalid ${key}`);
  }
  for (const key of ['endpointToleranceMm', 'bendRadiusToleranceMm', 'selfClearanceMm', 'tangentToleranceDeg']) {
    if (!Number.isFinite(o[key]) || o[key] < 0) throw new RangeError(`Invalid ${key}`);
  }
  for (const [key, low, high] of [['minIntervals', 1, 256], ['maxDepth', 0, 20], ['maxSamples', 5, 65537], ['maxPairTests', 1, 10000000]]) {
    if (!Number.isInteger(o[key]) || o[key] < low || o[key] > high) throw new RangeError(`Invalid ${key}`);
  }
  if (o.maxTangentStepDeg >= 90 || o.discontinuityToleranceDeg >= 90 || o.tangentToleranceDeg >= 90) {
    throw new RangeError('Angular tolerances must be less than 90 degrees');
  }
  const fittings = ['start', 'end'].map(end => {
    const f = o[end], positionMm = vector(f?.positionMm), axis = vector(f?.axis);
    if (!(norm(axis) > 0 && Number.isFinite(norm(axis)))) throw new RangeError('Fitting axis must be nonzero');
    return {positionMm, axis};
  });
  const getPoint = typeof curve === 'function' ? curve : t => curve.getPoint(t);
  const hasFirst = typeof curve?.getDerivative === 'function', hasSecond = typeof curve?.getSecondDerivative === 'function';
  if (hasSecond && !hasFirst) throw new TypeError('Second derivative requires first derivative');
  const hasTangent = typeof curve?.getTangent === 'function';
  const findings = [], seen = new Set(), cache = new Map(), boundaries = new Set([0, 1]);
  // Equivalent subdivision expressions need not produce bit-identical t values.
  // Merge roundoff duplicates only; spatial coincidences at distinct t are folds.
  const parameterRoundoffTolerance = 16 * Number.EPSILON;
  let fatal = false, observedError = 0, observedTurn = 0, maxDepthUsed = 0, pairs = 0;
  let minRadius = Infinity, minSelfDistance = Infinity, length = 0, samples = [];
  const metrics = {startEndpointErrorMm: null, endEndpointErrorMm: null, startTangentErrorDeg: null,
    endTangentErrorDeg: null, minBendRadiusMm: null, minNonadjacentDistanceMm: null, lengthMm: 0};
  function issue(code, detail = {}) {
    if (!seen.has(code)) { findings.push({code, ...detail}); seen.add(code); }
  }
  function recordRadius(radius, t, method) {
    if (Number.isNaN(radius) || radius < 0) { issue('nonfinite-geometry', {t}); fatal = true; return; }
    if (radius < minRadius) minRadius = radius;
    if (radius + o.bendRadiusToleranceMm < o.minBendRadiusMm) issue('tight-bend', {t, radiusMm: radius, method});
  }
  function at(t) {
    if (cache.has(t)) return cache.get(t);
    if (fatal) return null;
    if (cache.size >= o.maxSamples) { issue('sampling-budget'); fatal = true; return null; }
    try {
      const p = vector(getPoint(t)).map(v => v * scale);
      const d1 = hasFirst ? vector(curve.getDerivative(t)).map(v => v * scale) : null;
      const tangent = d1 ?? (hasTangent ? vector(curve.getTangent(t)) : null);
      const d2 = hasSecond ? vector(curve.getSecondDerivative(t)).map(v => v * scale) : null;
      if (![p, tangent, d2].filter(Boolean).every(finite)) throw new TypeError('Nonfinite scaled curve');
      const value = {t, p, tangent}; cache.set(t, value);
      if (tangent && norm(tangent) <= o.numericToleranceMm) issue('cusp-or-stall', {t});
      if (d1 && d2 && norm(d1) > o.numericToleranceMm) {
        const bending = norm(cross(d1, d2)), speed = norm(d1);
        recordRadius(bending === 0 ? Infinity : speed ** 3 / bending, t, 'derivatives');
      }
      return value;
    } catch {
      issue('nonfinite-or-invalid-curve', {t}); fatal = true; return null;
    }
  }
  const seeds = new Set([0, 1]);
  for (let i = 1; i < o.minIntervals; i++) seeds.add(i / o.minIntervals);
  for (const t of o.breakpoints ?? []) {
    if (!Number.isFinite(t) || t <= 0 || t >= 1) throw new RangeError('Invalid breakpoint');
    seeds.add(t);
  }
  if (typeof curve?.getCurveLengths === 'function') {
    let lengths;
    try { lengths = curve.getCurveLengths(); } catch { issue('invalid-curve-joins'); fatal = true; }
    if (lengths) {
      if (!Array.isArray(lengths) || lengths.length === 0 || !lengths.every((v, i) => Number.isFinite(v) && v > (i ? lengths[i-1] : 0))) {
        issue('invalid-curve-joins'); fatal = true;
      } else for (const s of lengths.slice(0, -1)) seeds.add(s / lengths.at(-1));
    }
  }
  function refine(a, b, depth) {
    if (fatal) return;
    maxDepthUsed = Math.max(maxDepthUsed, depth);
    const probe = [a, a + (b-a)/4, (a+b)/2, b - (b-a)/4, b].map(at);
    if (probe.some(p => !p) || fatal) return;
    const secants = probe.slice(1).map((p, i) => sub(p.p, probe[i].p));
    const deviation = Math.max(...probe.slice(1, -1).map(p => Math.sqrt(pointSegmentSquared(p.p, probe[0].p, probe[4].p))));
    const turn = Math.max(...secants.slice(1).map((s, i) => angle(secants[i], s)),
      ...probe.slice(1).map((p, i) => p.tangent && probe[i].tangent ? angle(p.tangent, probe[i].tangent) : 0));
    const acceptable = deviation <= o.chordToleranceMm && distance(probe[0].p, probe[4].p) <= o.maxSegmentLengthMm &&
      turn <= o.maxTangentStepDeg * Math.PI / 180 && secants.every(s => norm(s) > o.numericToleranceMm);
    if (!acceptable) {
      if (depth >= o.maxDepth) { issue('unresolved-fold-or-discontinuity', {t: (a+b)/2}); return; }
      refine(a, (a+b)/2, depth+1); refine((a+b)/2, b, depth+1);
    } else {
      observedError = Math.max(observedError, deviation); observedTurn = Math.max(observedTurn, turn);
      boundaries.add(a); boundaries.add(b);
    }
  }
  const uniqueParameters = values => values.sort((a, b) => a-b).filter((t, i, all) => !i || t-all[i-1] > parameterRoundoffTolerance);
  const ts = uniqueParameters([...seeds]);
  for (let i = 1; i < ts.length && !fatal; i++) refine(ts[i-1], ts[i], 0);
  if (!fatal) {
    const route = [];
    for (const row of [...cache.values()].sort((a, b) => a.t-b.t)) {
      const previous = route.at(-1);
      if (previous && row.t-previous.t <= parameterRoundoffTolerance) {
        if (distance(row.p, previous.p) > o.numericToleranceMm) issue('parameter-resolution', {t: row.t});
        else {
          if (row.tangent && previous.tangent && angle(row.tangent, previous.tangent) > o.discontinuityToleranceDeg*Math.PI/180) {
            issue('tangent-discontinuity', {t: row.t});
          }
          if (row.t === 1) route[route.length-1] = row;
          continue;
        }
      }
      route.push(row);
    }
    samples = route.map((p, i) => {
      if (i) length += distance(route[i-1].p, p.p);
      return {t: p.t, positionMm: [...p.p], arcLengthMm: length};
    });
    if (!Number.isFinite(length)) { issue('nonfinite-geometry'); fatal = true; }
    if (length <= o.numericToleranceMm) issue('cusp-or-stall');
    for (let i = 1; i < route.length - 1; i++) {
      const a = sub(route[i].p, route[i-1].p), b = sub(route[i+1].p, route[i].p);
      const la = norm(a), lb = norm(b), lc = distance(route[i-1].p, route[i+1].p), area = norm(cross(a, b));
      if (la <= o.numericToleranceMm || lb <= o.numericToleranceMm) issue('cusp-or-stall', {t: route[i].t});
      else if (angle(a, b) > Math.PI * .95) issue('cusp-or-stall', {t: route[i].t});
      else if (area > 0) recordRadius(la * lb * lc / (2 * area), route[i].t, 'sampled-chords');
    }
    for (let i = 1; i < route.length; i++) {
      const a = route[i-1], b = route[i];
      if (a.tangent && b.tangent) {
        const turn = angle(a.tangent, b.tangent);
        if (Number.isFinite(turn) && turn > 1e-10) recordRadius(distance(a.p, b.p) / (2 * Math.sin(turn/2)), b.t, 'sampled-tangents');
      }
    }
    function oneSided(t, h, forward) {
      const p0 = at(t), p1 = at(t + (forward ? h/2 : -h/2)), p2 = at(t + (forward ? h : -h));
      if (!p0 || !p1 || !p2) return null;
      return p0.p.map((v, i) => (forward ? -3*v + 4*p1.p[i] - p2.p[i] : 3*v - 4*p1.p[i] + p2.p[i]));
    }
    for (const [i, endpoint] of [0, 1].entries()) {
      const row = endpoint === 0 ? route[0] : route.at(-1), neighbor = endpoint === 0 ? route[1] : route.at(-2);
      const end = i === 0 ? 'start' : 'end', fit = fittings[i];
      const error = distance(row.p, fit.positionMm);
      metrics[`${end}EndpointErrorMm`] = error;
      if (error > o.endpointToleranceMm) issue('endpoint-detached', {end, errorMm: error});
      if (neighbor) {
        const geometric = oneSided(endpoint, Math.abs(neighbor.t - endpoint)/8, endpoint === 0);
        if (geometric) {
          const tangentError = Math.max(angle(geometric, fit.axis), row.tangent ? angle(row.tangent, fit.axis) : 0) * 180 / Math.PI;
          metrics[`${end}TangentErrorDeg`] = tangentError;
          if (tangentError > o.tangentToleranceDeg) issue('fitting-tangent', {end, errorDeg: tangentError});
        }
      }
    }
    const joins = uniqueParameters([...boundaries]);
    for (let i = 1; i < joins.length - 1 && !fatal; i++) {
      const t = joins[i], h = Math.min(t-joins[i-1], joins[i+1]-t)/8;
      const left = oneSided(t, h, false), right = oneSided(t, h, true);
      if (!left || !right) break;
      const turn = angle(left, right) * 180 / Math.PI;
      if (turn > o.discontinuityToleranceDeg) issue('tangent-discontinuity', {t, angleDeg: turn});
    }
    const requiredGap = 2*o.tubeRadiusMm + o.selfClearanceMm + 2*observedError + o.numericToleranceMm;
    pairLoop: for (let i = 0; i < samples.length-1 && !fatal; i++) {
      for (let j = i+2; j < samples.length-1; j++) {
        if (samples[j].arcLengthMm - samples[i+1].arcLengthMm <= o.localArcExclusionMm) continue;
        if (++pairs > o.maxPairTests) { issue('self-distance-budget'); break pairLoop; }
        const d = Math.sqrt(segmentSegmentSquared(samples[i].positionMm, samples[i+1].positionMm, samples[j].positionMm, samples[j+1].positionMm));
        if (!Number.isFinite(d)) { issue('nonfinite-geometry'); break pairLoop; }
        minSelfDistance = Math.min(minSelfDistance, d);
        if (d <= requiredGap) issue('self-intersection-or-close-sections', {segments: [i, j], distanceMm: d, requiredGapMm: requiredGap});
      }
    }
  }
  metrics.lengthMm = length;
  metrics.minBendRadiusMm = Number.isFinite(minRadius) ? minRadius : null; // null: straight at all evaluated samples, not unmeasured infinity.
  metrics.minNonadjacentDistanceMm = Number.isFinite(minSelfDistance) ? minSelfDistance : null;
  return {
    ok: findings.length === 0, findings, metrics, samples,
    sampling: {
      approximate: true, certifiedErrorBound: false, method: 'adaptive-quarter-chords-and-one-sided-join-probes',
      curvatureMethod: hasSecond ? 'derivatives-and-sampled-chords-tangents' : 'sampled-chords-and-available-tangents',
      inputUnits: options.units ?? 'mm', outputUnits: 'mm',
      converged: !fatal && !seen.has('unresolved-fold-or-discontinuity'),
      evaluatedPoints: cache.size, routeSamples: samples.length, maxDepthUsed, pairTests: pairs,
      parameterRoundoffTolerance,
      observedChordDeviationMm: observedError, observedTangentStepDeg: observedTurn * 180 / Math.PI,
      tolerances: Object.fromEntries(['endpointToleranceMm', 'bendRadiusToleranceMm', 'minBendRadiusMm', 'tubeRadiusMm',
        'chordToleranceMm', 'maxSegmentLengthMm', 'selfClearanceMm', 'localArcExclusionMm', 'numericToleranceMm',
        'tangentToleranceDeg', 'maxTangentStepDeg', 'discontinuityToleranceDeg', 'minIntervals', 'maxDepth', 'maxSamples', 'maxPairTests'].map(key => [key, o[key]])),
      meshClearanceChecked: false, nativeSolidClearanceChecked: false,
    },
  };
}
