// Pure XZ footprint geometry. Coordinates are finite millimetres.
// Close-to-zero orientation uses exact binary64 dyadic arithmetic, not an epsilon.
const scratch = new DataView(new ArrayBuffer(8));
function dyadic(n) {
  if (n === 0) return [0n, 0];
  scratch.setFloat64(0, n, false);
  const bits = scratch.getBigUint64(0, false), exponent = Number((bits >> 52n) & 2047n);
  const sign = bits >> 63n ? -1n : 1n;
  return [sign * ((bits & ((1n << 52n) - 1n)) + (exponent ? 1n << 52n : 0n)),
    exponent ? exponent - 1075 : -1074];
}
function add([a, e], [b, f]) {
  const power = Math.min(e, f);
  return [(a << BigInt(e - power)) + (b << BigInt(f - power)), power];
}
function sub(a, [b, f]) { return add(a, [-b, f]); }
function mul([a, e], [b, f]) { return [a * b, e + f]; }
const sign = a => a < 0n ? -1 : a > 0n ? 1 : 0;
export function orient(a, b, c) {
  const ax = a[0] - c[0], ay = a[1] - c[1], bx = b[0] - c[0], by = b[1] - c[1];
  const left = ax * by, right = ay * bx, det = left - right;
  if (Math.abs(det) > (Math.abs(left) + Math.abs(right)) * 3.3306690738754716e-16) return Math.sign(det);
  return sign(sub(mul(sub(dyadic(a[0]), dyadic(c[0])), sub(dyadic(b[1]), dyadic(c[1]))),
    mul(sub(dyadic(a[1]), dyadic(c[1])), sub(dyadic(b[0]), dyadic(c[0]))))[0]);
}
const equal = (a, b) => a[0] === b[0] && a[1] === b[1];
export function onSegment(p, a, b) {
  return orient(a, b, p) === 0 && p[0] >= Math.min(a[0], b[0]) && p[0] <= Math.max(a[0], b[0])
    && p[1] >= Math.min(a[1], b[1]) && p[1] <= Math.max(a[1], b[1]);
}
export function segmentsIntersect(a, b, c, d) {
  const abc = orient(a, b, c), abd = orient(a, b, d), cda = orient(c, d, a), cdb = orient(c, d, b);
  return abc * abd < 0 && cda * cdb < 0 || abc === 0 && onSegment(c, a, b)
    || abd === 0 && onSegment(d, a, b) || cda === 0 && onSegment(a, c, d) || cdb === 0 && onSegment(b, c, d);
}
function properCross(a, b, c, d) { return orient(a, b, c) * orient(a, b, d) < 0 && orient(c, d, a) * orient(c, d, b) < 0; }
export function polygonAreaSign(poly) {
  let sum = [0n, 0];
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    sum = add(sum, sub(mul(dyadic(a[0]), dyadic(b[1])), mul(dyadic(b[0]), dyadic(a[1]))));
  }
  return sign(sum[0]);
}
export function polygonProblems(poly, {maxVertices = 32, maxCoordinateMm = 1000000} = {}) {
  if (!Array.isArray(poly) || poly.length < 3 || poly.length > maxVertices) return ['POLYGON_VERTEX_COUNT'];
  if (poly.some(p => !Array.isArray(p) || p.length !== 2 || p.some(n => typeof n !== 'number' || !Number.isFinite(n) || Math.abs(n) > maxCoordinateMm))) return ['POLYGON_COORDINATE'];
  const issues = new Set();
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (equal(a, b)) issues.add('POLYGON_ZERO_EDGE');
    const c = poly[(i + 2) % poly.length];
    if (orient(a, b, c) === 0 && (onSegment(c, a, b) || onSegment(a, b, c))) issues.add('POLYGON_BACKTRACK');
    for (let j = i + 1; j < poly.length; j++) {
      if (equal(a, poly[j])) issues.add('POLYGON_REPEATED_VERTEX');
      if (j === i + 1 || i === 0 && j === poly.length - 1) continue;
      if (segmentsIntersect(a, b, poly[j], poly[(j + 1) % poly.length])) issues.add('POLYGON_SELF_INTERSECTION');
    }
  }
  if (polygonAreaSign(poly) === 0) issues.add('POLYGON_ZERO_AREA');
  return [...issues];
}
// -1 outside, 0 on the boundary, 1 strictly inside. Either polygon winding works.
export function pointInPolygon(p, poly) {
  let winding = 0;
  for (let i = 0; i < poly.length; i++) {
    const a = poly[i], b = poly[(i + 1) % poly.length];
    if (onSegment(p, a, b)) return 0;
    if (a[1] <= p[1]) { if (b[1] > p[1] && orient(a, b, p) > 0) winding++; }
    else if (b[1] <= p[1] && orient(a, b, p) < 0) winding--;
  }
  return winding ? 1 : -1;
}
export function polygonContains(outer, inner) {
  if (inner.some(p => pointInPolygon(p, outer) < 0)) return false;
  for (let i = 0; i < inner.length; i++) {
    const a = inner[i], b = inner[(i + 1) % inner.length], cuts = [0, 1];
    const axis = Math.abs(b[0] - a[0]) >= Math.abs(b[1] - a[1]) ? 0 : 1;
    for (let j = 0; j < outer.length; j++) {
      const c = outer[j], d = outer[(j + 1) % outer.length];
      if (properCross(a, b, c, d)) return false;
      // Split even at reflex-vertex touches: endpoint-only tests miss an L-shaped notch.
      for (const p of [c, d]) if (onSegment(p, a, b)) cuts.push((p[axis] - a[axis]) / (b[axis] - a[axis]));
    }
    cuts.sort((x, y) => x - y);
    for (let j = 1; j < cuts.length; j++) if (cuts[j] > cuts[j - 1]) {
      const t = (cuts[j] + cuts[j - 1]) / 2;
      if (pointInPolygon([a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])], outer) < 0) return false;
    }
  }
  return true;
}
export function rectangle(widthMm, depthMm) {
  return [[-widthMm / 2, -depthMm / 2], [widthMm / 2, -depthMm / 2], [widthMm / 2, depthMm / 2], [-widthMm / 2, depthMm / 2]];
}
export function rotateXZ([x, z], yawDeg) {
  // Exact cardinal rotations prevent artificial gaps at the usual room/desk angles.
  const angle = ((yawDeg % 360) + 360) % 360;
  if (angle === 0) return [x, z];
  if (angle === 90) return [z, -x];
  if (angle === 180) return [-x, -z];
  if (angle === 270) return [-z, x];
  const radians = angle * Math.PI / 180, c = Math.cos(radians), s = Math.sin(radians);
  return [c * x + s * z, -s * x + c * z];
}
export function transformPolygon(poly, {xMm, zMm, yawDeg}) {
  return poly.map(p => { const q = rotateXZ(p, yawDeg); return [q[0] + xMm, q[1] + zMm]; });
}
export function bounds(poly) {
  return {minX: Math.min(...poly.map(p => p[0])), maxX: Math.max(...poly.map(p => p[0])),
    minZ: Math.min(...poly.map(p => p[1])), maxZ: Math.max(...poly.map(p => p[1]))};
}
function inTriangle(p, a, b, c) { return orient(a, b, p) >= 0 && orient(b, c, p) >= 0 && orient(c, a, p) >= 0; }
export function triangulatePolygon(poly) {
  let points = poly.slice();
  if (polygonAreaSign(points) < 0) points.reverse();
  // Remove redundant collinear points only in this temporary triangulation index.
  let changed = true;
  while (changed && points.length > 3) {
    changed = false;
    for (let i = 0; i < points.length; i++) if (orient(points[(i + points.length - 1) % points.length], points[i], points[(i + 1) % points.length]) === 0) {
      points.splice(i, 1); changed = true; break;
    }
  }
  const result = [];
  while (points.length > 3) {
    let found = false;
    for (let i = 0; i < points.length; i++) {
      const previous = (i + points.length - 1) % points.length, next = (i + 1) % points.length;
      const a = points[previous], b = points[i], c = points[next];
      if (orient(a, b, c) <= 0) continue;
      if (points.some((p, j) => j !== previous && j !== i && j !== next && inTriangle(p, a, b, c))) continue;
      result.push([a, b, c]); points.splice(i, 1); found = true; break;
    }
    if (!found) throw new Error('SIMPLE_POLYGON_TRIANGULATION_FAILED');
  }
  if (points.length === 3 && orient(...points) > 0) result.push(points);
  return result;
}
function trianglesOverlapPositive(a, b) {
  for (const [one, other] of [[a, b], [b, a]]) for (let i = 0; i < 3; i++) {
    if (other.every(p => orient(one[i], one[(i + 1) % 3], p) <= 0)) return false;
  }
  return true;
}
export function polygonsOverlap(a, b) {
  const aa = bounds(a), bb = bounds(b);
  if (aa.maxX <= bb.minX || bb.maxX <= aa.minX || aa.maxZ <= bb.minZ || bb.maxZ <= aa.minZ) return false;
  const ta = triangulatePolygon(a), tb = triangulatePolygon(b);
  return ta.some(x => tb.some(y => trianglesOverlapPositive(x, y)));
}
