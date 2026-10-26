import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createPrinterPreviewMeshCache} from '../site/layout/layout-printer-preview-mesh.mjs';

// Allow independent fixture/catalog workers without importing renderer or CAD.
const args = process.argv.slice(2), suite = args.length === 0 ? 'all' : args[1];
assert.ok(args.length === 0 || (args.length === 2 && args[0] === '--suite' && ['components', 'catalog'].includes(suite)),
  'Usage: node scripts/test_layout_printer_preview_mesh.mjs [--suite components|catalog]');
const box = (extra = {}) => ({sizeM: [.4, .6, .2], centerM: [.1, .4, -.3], color: '#806040', ...extra});
const cylinder = (axis = 'y', extra = {}) => box({shape: 'cylinder', axis, ...extra});
const trianglesOf = g => (g.index?.count ?? g.attributes.position.count) / 3;
const bytesOf = g => Object.values(g.attributes).reduce((n, a) => n + a.array.byteLength, 0) + (g.index?.array.byteLength ?? 0);
const sha256 = data => crypto.createHash('sha256').update(data).digest('hex');
const near = (a, b, epsilon = 2e-6) => assert.ok(Math.abs(a - b) <= epsilon, `${a} != ${b}`);
const freezeParts = parts => Object.freeze(parts.map(p => Object.freeze({...p,
  sizeM: Object.freeze([...p.sizeM]), centerM: Object.freeze([...p.centerM])})));
const cases = [];
function test(name, run, scope = 'components') {
  if (suite !== 'all' && suite !== scope) return;
  run(); cases.push(name);
}
function rejected(cache, parts, pattern) {
  const before = cache.stats();
  assert.throws(() => cache.geometry(parts), e => e.code === 'LAYOUT_PRINTER_PREVIEW_MESH' && pattern.test(e.message));
  assert.deepEqual(cache.stats(), before, 'rejection must not retain partial resources');
}

function inspect(g, parts) {
  assert.ok(g.isBufferGeometry);
  assert.deepEqual(Object.keys(g.attributes).sort(), ['color', 'normal', 'position']);
  assert.equal(g.groups.length, 0, 'one vertex-color material without per-part draw groups');
  const {position: p, normal: n, color: c} = g.attributes;
  assert.equal(n.count, p.count); assert.equal(c.count, p.count);
  for (const a of [p, n, c]) {
    assert.ok(a.array instanceof Float32Array); assert.equal(a.itemSize, 3);
    assert.equal(a.normalized, false); assert.ok(a.array.every(Number.isFinite));
  }
  assert.ok(trianglesOf(g) <= 2500);
  if (g.index) for (const i of g.index.array) assert.ok(i >= 0 && i < p.count);
  let vertex = 0, face = 0;
  const expectedBounds = new THREE.Box3();
  for (const part of parts) {
    const count = part.shape === 'cylinder' ? 76 : 24, faces = part.shape === 'cylinder' ? 48 : 12;
    const origin = new THREE.Vector3(...part.centerM), expectedColor = new THREE.Color(part.color ?? '#465258');
    for (let axis = 0; axis < 3; axis++) {
      const low = part.centerM[axis] - part.sizeM[axis] / 2, high = part.centerM[axis] + part.sizeM[axis] / 2;
      expectedBounds.min.setComponent(axis, Math.min(expectedBounds.min.getComponent(axis), low));
      expectedBounds.max.setComponent(axis, Math.max(expectedBounds.max.getComponent(axis), high));
    }
    for (let i = vertex; i < vertex + count; i++) {
      const v = new THREE.Vector3().fromBufferAttribute(p, i), normal = new THREE.Vector3().fromBufferAttribute(n, i);
      near(normal.length(), 1);
      for (let axis = 0; axis < 3; axis++)
        assert.ok(Math.abs(v.getComponent(axis) - origin.getComponent(axis)) <= part.sizeM[axis] / 2 + 2e-6);
      assert.ok(normal.dot(v.clone().sub(origin)) > 0, 'vertex normals must point outward');
      near(c.getX(i), expectedColor.r, 1e-7); near(c.getY(i), expectedColor.g, 1e-7); near(c.getZ(i), expectedColor.b, 1e-7);
      if (part.shape === 'cylinder') {
        // The ellipse gradient in WORLD coordinates independently checks the
        // inverse-transpose normal, without reproducing the template rotation.
        const axis = ['x', 'y', 'z'].indexOf(part.axis ?? 'y'), delta = v.clone().sub(origin);
        const expected = new THREE.Vector3();
        if (Math.abs(normal.getComponent(axis)) > .99) expected.setComponent(axis, Math.sign(delta.getComponent(axis)));
        else for (let k = 0; k < 3; k++) if (k !== axis) expected.setComponent(k, delta.getComponent(k) / part.sizeM[k] ** 2);
        expected.normalize(); near(normal.dot(expected), 1);
      }
    }
    for (let i = face * 3; i < (face + faces) * 3; i += 3) {
      const ids = [0, 1, 2].map(k => g.index ? g.index.getX(i + k) : i + k);
      assert.ok(ids.every(j => j >= vertex && j < vertex + count), 'triangle must stay within its part');
      const [a, b, d] = ids.map(j => new THREE.Vector3().fromBufferAttribute(p, j));
      const cross = b.clone().sub(a).cross(d.clone().sub(a)), centroid = a.clone().add(b).add(d).multiplyScalar(1 / 3);
      assert.ok(cross.length() > 0 && Number.isFinite(cross.length()), 'finite nondegenerate triangles');
      assert.ok(cross.dot(centroid.sub(origin)) > 0, 'triangle winding must face outward');
      for (const j of ids) assert.ok(cross.dot(new THREE.Vector3().fromBufferAttribute(n, j)) > 0);
    }
    vertex += count; face += faces;
  }
  assert.equal(p.count, vertex); assert.equal(trianglesOf(g), face);
  if (parts.length) for (let axis = 0; axis < 3; axis++) {
    near(g.boundingBox.min.getComponent(axis), expectedBounds.min.getComponent(axis));
    near(g.boundingBox.max.getComponent(axis), expectedBounds.max.getComponent(axis));
  }
  assert.ok(g.boundingSphere.center.toArray().every(Number.isFinite));
  assert.ok(Number.isFinite(g.boundingSphere.radius));
}

test('merged boxes and anisotropic cylinders on every axis', () => {
  const cache = createPrinterPreviewMeshCache(THREE);
  const parts = freezeParts([box(), box({shape: 'box', color: 0x123456, centerM: [-.7, .3, .6]}),
    ...['x', 'y', 'z'].map((axis, i) => cylinder(axis, {sizeM: [.7, .19, .43], centerM: [i - 1, 1.2, -.8], color: '#2c8dba'})),
    cylinder(undefined, {color: 'rebeccapurple'})]);
  const input = JSON.stringify(parts), g = cache.geometry(parts);
  inspect(g, parts); assert.equal(JSON.stringify(parts), input);
  assert.equal(trianglesOf(g), 2 * 12 + 4 * 48);
  assert.equal(cache.stats().bytes, bytesOf(g) + 2760);
  // A diagonal ellipse normal differs markedly from a position-scaled normal.
  assert.ok(g.attributes.color.getX(0) < 128 / 255, 'sRGB must be converted to linear');
  cache.dispose();
});

test('identity sharing, opacity metadata and scene removal', () => {
  const cache = createPrinterPreviewMeshCache(THREE), parts = freezeParts([box()]);
  const g = cache.geometry(parts), initial = cache.stats();
  for (let i = 0; i < 100; i++) assert.equal(cache.geometry(parts), g);
  assert.deepEqual(cache.stats(), initial);
  const copy = cache.geometry(freezeParts(parts)); assert.notEqual(copy, g);
  const glazingParts = freezeParts([box({opacity: .18})]), glazing = cache.geometry(glazingParts);
  for (const key of ['position', 'normal', 'color']) assert.deepEqual(glazing.attributes[key].array, g.attributes[key].array);
  assert.deepEqual(glazing.index.array, g.index.array);
  const material = new THREE.MeshStandardMaterial({vertexColors: true});
  const glassMaterial = new THREE.MeshStandardMaterial({vertexColors: true, opacity: .18, transparent: true});
  const root = new THREE.Group(), nodes = [new THREE.Mesh(g, material), new THREE.Mesh(g, material), new THREE.Mesh(glazing, glassMaterial)];
  let released = 0; g.addEventListener('dispose', () => released++);
  root.add(...nodes); root.clear(); assert.equal(released, 0); assert.equal(cache.geometry(parts), g);
  const snapshot = cache.stats(); snapshot.bytes = -1; assert.ok(cache.stats().bytes > 0);
  cache.dispose(); assert.equal(released, 1); material.dispose(); glassMaterial.dispose();
});

test('empty arrays, default color, linear Color input and CSS channels', () => {
  const cache = createPrinterPreviewMeshCache(THREE), empty = cache.geometry([]);
  inspect(empty, []); assert.equal(empty.boundingSphere.radius, 0);
  assert.deepEqual(empty.boundingBox.min.toArray(), [0, 0, 0]);
  const parts = [box({color: undefined}), box({color: '#abc'}), box({color: 'rgb(128,64,32)'}),
    box({color: new THREE.Color('#867452')}), box({opacity: 0}), box({opacity: 1})];
  inspect(cache.geometry(parts), parts); cache.dispose();
});

test('invalid descriptors and unsupported input fail without retained allocations', () => {
  const cache = createPrinterPreviewMeshCache(THREE);
  for (const parts of [undefined, null, {}, 'parts', new Float32Array(3), Array(129).fill(box())]) rejected(cache, parts, /array/);
  for (const part of [null, undefined, 12, [], {}, box({sizeM: [1, 2]}), box({centerM: [0, 0]}),
    box({sizeM: '123'}), box({centerM: new Float32Array(3)})]) rejected(cache, [part], /invalid/);
  rejected(cache, Array(3), /invalid/);
  for (const value of [NaN, Infinity, -Infinity, '1', null]) {
    rejected(cache, [box({sizeM: [1, value, 1]})], /invalid/);
    rejected(cache, [box({centerM: [1, value, 1]})], /invalid/);
  }
  for (const value of [0, -1]) rejected(cache, [box({sizeM: [value, 1, 1]})], /invalid/);
  for (const shape of ['tube', 'mesh', 'sphere', null, '']) rejected(cache, [box({shape})], /unsupported shape/);
  for (const axis of ['w', null, 0]) rejected(cache, [cylinder(axis)], /unsupported axis/);
  for (const value of [true, 1, 'false']) rejected(cache, [box({wireframe: value})], /wireframe/);
  for (const value of [-.1, 1.1, NaN, null, '.18']) rejected(cache, [box({opacity: value})], /opacity/);
  for (const value of [null, {}, [], true, -1, 0x1000000, NaN, '', ' '.repeat(129), new THREE.Color(NaN, 0, 0)])
    rejected(cache, [box({color: value})], /color/);
  const warnings = [], warn = console.warn;
  try {
    console.warn = (...args) => warnings.push(args);
    for (const value of ['not-a-color', '#12345', 'rgb(nope)']) rejected(cache, [box({color: value})], /color/);
  } finally { console.warn = warn; }
  assert.ok(warnings.length >= 2);
  for (const sizeM of [[1e40, 1, 1], [1e-50, 1, 1]]) rejected(cache, [box({sizeM})], /float32/);
  rejected(cache, [box({centerM: [1e40, 0, 0]})], /float32/);
  rejected(cache, [box({centerM: [1e20, 0, 0]})], /float32/);
  rejected(cache, [cylinder('y', {centerM: [1e8, 0, 1e8], sizeM: [16, 1, 16]})], /collapsed/);
  rejected(cache, [box(), box({sizeM: [0, 1, 1]})], /invalid/);
  inspect(cache.geometry([box({wireframe: false})]), [box()]); cache.dispose();
});

test('part and triangle hard limits including largest attainable boundary', () => {
  const cache = createPrinterPreviewMeshCache(THREE), boxes = Array.from({length: 128}, () => box());
  assert.equal(trianglesOf(cache.geometry(boxes)), 1536);
  const exact = [...Array.from({length: 51}, () => cylinder()), ...Array.from({length: 4}, () => box())];
  assert.equal(trianglesOf(cache.geometry(exact)), 2496);
  rejected(cache, [...exact, box()], /triangle cap/);
  rejected(cache, Array.from({length: 53}, () => cylinder()), /triangle cap/);
  rejected(cache, [...boxes, box()], /128/); cache.dispose();
});

let resourceEvidence;
test('144 arrays fit, entry cap stays bounded and every template is released once', () => {
  const made = [], instrument = Base => class extends Base {
    constructor(...args) { super(...args); this.releases = 0; this.addEventListener('dispose', () => this.releases++); made.push(this); }
  };
  const cache = createPrinterPreviewMeshCache({...THREE, BoxGeometry: instrument(THREE.BoxGeometry),
    CylinderGeometry: instrument(THREE.CylinderGeometry), BufferGeometry: instrument(THREE.BufferGeometry)});
  const keys = [];
  assert.equal(made.length, 2); assert.equal(cache.stats().templates, 2);
  for (let i = 0; i < 144; i++) { const p = [box({opacity: i % 2 ? .18 : 1})]; keys.push(p); cache.geometry(p); }
  assert.equal(cache.stats().geometries, 144);
  while (cache.stats().geometries < cache.stats().maxGeometries) cache.geometry([box()]);
  assert.ok(cache.stats().maxGeometries >= 144 && cache.stats().maxGeometries <= 256);
  rejected(cache, [box()], /entry cap/);
  assert.equal(cache.stats().bytes, made.reduce((n, g) => n + bytesOf(g), 0));
  for (const p of keys) assert.equal(cache.geometry(p), cache.geometry(p), 'cache hits still work at capacity');
  resourceEvidence = {entryLimit: cache.stats().maxGeometries, entryLimitBytes: cache.stats().bytes};
  assert.ok(made.every(g => g.releases === 0)); cache.dispose(); cache.dispose();
  assert.ok(made.every(g => g.releases === 1));
  assert.equal(cache.stats().geometries, 0); assert.equal(cache.stats().templates, 0);
  assert.equal(cache.stats().bytes, 0); assert.equal(cache.stats().triangles, 0); assert.equal(cache.stats().disposed, true);
  rejected(cache, keys[0], /disposed/); rejected(cache, [], /disposed/);
});

test('byte cap uses actual retained buffers and rejects transactionally', () => {
  const cache = createPrinterPreviewMeshCache(THREE), keys = [];
  const heavy = () => Array.from({length: 52}, (_, i) => cylinder(['x', 'y', 'z'][i % 3]));
  const templateBytes = cache.stats().bytes, sample = heavy(), g = cache.geometry(sample), added = bytesOf(g);
  keys.push(sample);
  const limit = Math.floor((cache.stats().maxBytes - templateBytes) / added);
  assert.ok(limit >= 1 && limit < cache.stats().maxGeometries, 'byte guard must be independently reachable');
  for (let i = 1; i < limit; i++) { const parts = heavy(); keys.push(parts); cache.geometry(parts); }
  assert.equal(cache.stats().bytes, templateBytes + limit * added);
  assert.ok(cache.stats().bytes <= 16 * 1024 * 1024);
  rejected(cache, heavy(), /byte cap/); assert.equal(cache.geometry(sample), g);
  Object.assign(resourceEvidence, {byteLimit: cache.stats().maxBytes, bytesAtRejection: cache.stats().bytes,
    heavyGeometryBytes: added, heavyGeometryTriangles: trianglesOf(g), heavyGeometries: limit});
  cache.dispose(); assert.equal(cache.stats().bytes, 0);
});

let catalogEvidence;
test('all current catalog rows fit conservative budgets with identity reuse', () => {
  const catalogUrl = new URL('../site/layout/layout-catalog.json', import.meta.url), raw = fs.readFileSync(catalogUrl);
  const {machines} = JSON.parse(raw), cache = createPrinterPreviewMeshCache(THREE), coverage = [];
  assert.ok(machines.length >= 72, 'missing current source rows');
  for (const row of machines) {
    assert.ok(Array.isArray(row.proxy?.parts) && row.proxy.parts.length, `missing parts: ${row.id}`);
    const parts = freezeParts(row.proxy.parts.filter(p => !p.wireframe));
    assert.ok(parts.length, `missing solid planning symbols: ${row.id}`);
    const g = cache.geometry(parts); inspect(g, parts);
    for (let i = 0; i < 20; i++) assert.equal(cache.geometry(parts), g);
    assert.ok(trianglesOf(g) <= 1500, `source triangle regression: ${row.id}`);
    coverage.push({id: row.id, parts: parts.length, triangles: trianglesOf(g), bytes: bytesOf(g)});
  }
  assert.equal(new Set(coverage.map(r => r.id)).size, machines.length);
  const actual = cache.stats(); assert.equal(actual.geometries, machines.length);
  assert.ok(actual.bytes < 5 * 1024 * 1024, 'source cache should leave renderer headroom below 16 MiB');
  // Each row can also retain a distinct glazing array. Synthetic panels exercise
  // the two-array ownership contract; they do not assert catalog panel coverage.
  for (const row of machines) cache.geometry(freezeParts([box({opacity: .18, color: '#718096'})]));
  assert.equal(cache.stats().geometries, 2 * machines.length);
  assert.ok(cache.stats().bytes < 5 * 1024 * 1024);
  catalogEvidence = {catalogSha256: sha256(raw), machines: machines.length, actual,
    withSyntheticGlazing: cache.stats(), maxTriangles: Math.max(...coverage.map(r => r.triangles)), coverage};
  cache.dispose(); assert.equal(cache.stats().bytes, 0);
}, 'catalog');

console.log(JSON.stringify({passed: true, suite, threeRevision: THREE.REVISION, cases, resourceEvidence, catalogEvidence,
  sourceSha256: sha256(fs.readFileSync(new URL('../site/layout/layout-printer-preview-mesh.mjs', import.meta.url))),
  testSha256: sha256(fs.readFileSync(new URL('./test_layout_printer_preview_mesh.mjs', import.meta.url))),
  scope: `${suite === 'components' ? 'Bundled Three BufferGeometry and synthetic glazing/cylinder/resource fixtures.'
    : suite === 'catalog' ? 'All current Layout catalog planning descriptors and synthetic glazing capacity.'
      : 'Bundled Three BufferGeometry, synthetic fixtures and all current Layout catalog planning descriptors.'}
    No renderer/browser/GPU, native-solid, mounting, motion or hardware-fit verification.`}));
