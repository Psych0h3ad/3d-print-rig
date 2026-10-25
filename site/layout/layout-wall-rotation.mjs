// Proposal generation for planning footprints only. The caller must still prove
// translation, the complete signed rotation and peer clearance with its strict
// swept predicates. No containment/acceptance tolerance is introduced here.
import {orient, polygonAreaSign, polygonContains, polygonProblems, rotateXZ, transformPolygon} from './layout-geometry.mjs?v=129e07e8d3e2b008fab6';

const MAX_DOMAINS = 32, MAX_LOCALS = 192, MAX_VERTICES = 12288;
const MAX_COORDINATE = 1000000, MAX_YAW = 720000;
const finite = (n, limit) => typeof n === 'number' && Number.isFinite(n) && Math.abs(n) <= limit;
const dot = (a, b) => a[0] * b[0] + a[1] * b[1];

// n.R(yaw).p = A cos(yaw) + B sin(yaw), for clockwise rotateXZ.
// Its minimum occurs at an endpoint or atan2(B,A)+pi+2k*pi. Keep the
// requested SIGNED interval: +270 is not interchangeable with -90.
function minimumSupport(n, p, start, delta) {
  const end = start + delta;
  let minimum = Math.min(dot(n, rotateXZ(p, start)), dot(n, rotateXZ(p, end)));
  const a = dot(n, p), b = n[0] * p[1] - n[1] * p[0];
  const phase = (Math.atan2(b, a) + Math.PI) * 180 / Math.PI;
  const lo = Math.min(start, end), hi = Math.max(start, end);
  const critical = phase + 360 * Math.ceil((lo - phase) / 360);
  if (critical <= hi) minimum = Math.min(minimum, -Math.hypot(a, b));
  return minimum;
}

/**
 * domains: [{outer, locals}], millimetres in the world XZ plane. Each local
 * polygon is relative to the rotation centre BEFORE origin.yawDeg is applied;
 * outer is already in world coordinates. origin is {xMm,zMm,yawDeg} and
 * targetYaw is absolute, with a signed difference of at most 360 degrees.
 *
 * Return the nearest feasible centre for the padded halfplane model, or [].
 * The strictly convex closest-point QP has one minimizer, so no farther peer
 * detours are offered. In concave rooms the retained walls are only a local
 * proposal corridor, not a proof against the actual room polygon.
 */
export function wallRotationCenters(domains, origin, targetYaw) {
  if (!origin || !finite(origin.xMm, MAX_COORDINATE) || !finite(origin.zMm, MAX_COORDINATE)
    || !finite(origin.yawDeg, MAX_YAW) || !finite(targetYaw, MAX_YAW)
    || !Array.isArray(domains) || !domains.length || domains.length > MAX_DOMAINS) return [];
  const delta = targetYaw - origin.yawDeg;
  if (delta === 0 || Math.abs(delta) > 360) return [];
  const start = ((origin.yawDeg % 360) + 360) % 360;
  const centre = [origin.xMm, origin.zMm], checked = [];
  let radius = 0, vertices = 0;
  for (const domain of domains) {
    if (!domain || polygonProblems(domain.outer).length || !Array.isArray(domain.locals)
      || !domain.locals.length || domain.locals.length > MAX_LOCALS) return [];
    const points = [], initial = [];
    for (const local of domain.locals) {
      if (polygonProblems(local).length || (vertices += local.length) > MAX_VERTICES) return [];
      const world = transformPolygon(local, origin);
      // Never turn an invalid imported/outside pose into an implicit repair.
      if (!polygonContains(domain.outer, world)) return [];
      initial.push(...world); points.push(...local);
      for (const p of local) radius = Math.max(radius, Math.hypot(...p));
    }
    const winding = polygonAreaSign(domain.outer);
    const convex = domain.outer.every((a, i, poly) => {
      const turn = orient(a, poly[(i + 1) % poly.length], poly[(i + 2) % poly.length]);
      return turn === 0 || turn === winding;
    });
    checked.push({outer: domain.outer, points, initial, winding, convex});
  }
  const reserve = Math.max(.01, radius * 1e-5), walls = [];
  let driven = false;
  for (const {outer, points, initial, winding, convex} of checked) {
    for (let i = 0; i < outer.length; i++) {
      const a = outer[i], b = outer[(i + 1) % outer.length];
      // A reflex wall extension can cut through a different arm of the room.
      // Keep it only if every initial source polygon is in its inward side.
      if (!convex && initial.some(p => orient(a, b, p) * winding < 0)) continue;
      const dx = b[0] - a[0], dz = b[1] - a[1], length = Math.hypot(dx, dz);
      const n = [-winding * dz / length, winding * dx / length];
      let support = Infinity;
      for (const p of points) support = Math.min(support, minimumSupport(n, p, start, delta));
      const offset = n[0] * (a[0] - centre[0]) + n[1] * (a[1] - centre[1]);
      const requirement = offset - support;
      if (requirement > 0) driven = true;
      const rhs = requirement + reserve;
      // Solve slightly inward of the padded plane to survive binary64
      // projection/intersection rounding. This is extra ACTUAL movement;
      // feasibility below remains a strict >= test against the padded plane.
      const roundingMove = 32 * Number.EPSILON * Math.max(1, Math.abs(centre[0]), Math.abs(centre[1]), Math.abs(offset), Math.abs(support), Math.abs(rhs));
      walls.push({n, rhs, solve: rhs + roundingMove});
    }
  }
  // Reserve alone must not move a near-wall/flush item whose real sweep fits.
  if (!driven) return [];

  // min |d|^2 subject to n_i.d >= rhs_i. In two dimensions its minimizer
  // is the origin, one wall projection, or the intersection of two walls.
  // Keep opposite/unviolated constraints in every feasibility test as well.
  let best = null, bestSquared = Infinity;
  const consider = d => {
    const squared = dot(d, d);
    if (!Number.isFinite(squared) || squared >= bestSquared
      || !finite(centre[0] + d[0], MAX_COORDINATE) || !finite(centre[1] + d[1], MAX_COORDINATE)) return;
    // Reconstruct the displacement from the actual absolute return value:
    // adding it to a large origin can otherwise lose a small inward reserve.
    const actual = [centre[0] + d[0] - centre[0], centre[1] + d[1] - centre[1]];
    if (walls.some(w => dot(w.n, actual) < w.rhs)) return;
    const actualSquared = dot(actual, actual);
    if (actualSquared < bestSquared) { best = actual; bestSquared = actualSquared; }
  };
  consider([0, 0]);
  for (const w of walls) if (w.solve > 0) {
    const factor = w.solve / dot(w.n, w.n);
    consider([factor * w.n[0], factor * w.n[1]]);
  }
  for (let i = 0; i < walls.length; i++) for (let j = i + 1; j < walls.length; j++) {
    const a = walls[i], b = walls[j], det = a.n[0] * b.n[1] - a.n[1] * b.n[0];
    if (det === 0) continue;
    const x = (a.solve * b.n[1] - a.n[1] * b.solve) / det;
    const z = (a.n[0] * b.solve - a.solve * b.n[0]) / det;
    // Nonnegative active-wall multipliers are necessary for the closest QP
    // solution; avoid considering remote intersections behind either wall.
    if ((x * b.n[1] - z * b.n[0]) / det < 0 || (a.n[0] * z - a.n[1] * x) / det < 0) continue;
    consider([x, z]);
  }
  return best ? [{xMm: centre[0] + best[0], zMm: centre[1] + best[1]}] : [];
}
