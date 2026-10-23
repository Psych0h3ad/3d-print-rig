// Numerical planning-footprint regressions only; no browser, model or CAD fit claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import crypto from 'node:crypto';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const siteArg = process.argv.indexOf('--site');
const site = siteArg < 0 ? path.join(root, 'site') : path.resolve(process.argv[siteArg + 1]);
const source = path.join(site, 'layout');
const S = await import(pathToFileURL(path.join(source, 'layout-state.mjs')));
const G = await import(pathToFileURL(path.join(source, 'layout-geometry.mjs')));
const C = await import(pathToFileURL(path.join(source, 'layout-constraints.mjs')));
const hashes = () => Object.fromEntries(['layout-state.mjs', 'layout-geometry.mjs', 'layout-constraints.mjs']
  .map(name => [name, crypto.createHash('sha256').update(fs.readFileSync(path.join(source, name))).digest('hex')]));
const before = hashes(), cases = [];
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) <= 1e-7, `${actual} != ${expected} mm (numerical comparison only)`);
function test(name, run) {
  try { run(); cases.push({name, status: 'PASS'}); }
  catch (error) { cases.push({name, status: 'FAIL', error: error.stack}); }
}
const catalog = S.createCatalog([
  {id: 'square', widthMm: 200, depthMm: 200, heightMm: 300},
  {id: 'radius500', widthMm: 600, depthMm: 800, heightMm: 300},
  {id: 'wide', widthMm: 600, depthMm: 400, heightMm: 300},
  {id: 'long', widthMm: 600, depthMm: 100, heightMm: 300},
  {id: 'triangle', widthMm: 200, depthMm: 200, heightMm: 300, footprintMm: [[-50,-50],[50,-50],[-50,50]]}
]);
const pose = (xMm = 0, zMm = 0, yawDeg = 0) => ({xMm, zMm, yawDeg});
const printer = (machineId = 'square', attachment = {}) => ({id: 'p', machineId, configurationId: null,
  attachment: {parentId: null, surfaceId: 'floor', ...pose(), ...attachment}});
const stateFor = (machineId = 'square', attachment = {}, room = S.createRoomRect()) =>
  S.createDefaultLayout({room, printers: [printer(machineId, attachment)]}, catalog);
function checked(state, resolve) {
  const original = S.serializeLayout(state, catalog), result = resolve();
  assert.ok(result, 'A valid starting placement must resolve');
  assert.equal(S.serializeLayout(state, catalog), original, 'Preview must preserve the source state');
  assert.deepEqual(S.placementViolations(result.state, catalog), []);
  for (const entity of [...S.deriveScene(result.state, catalog).furniture, ...S.deriveScene(result.state, catalog).printers])
    assert.ok(entity.worldEnvelopeMm.flat().every(Number.isFinite));
  return result;
}
const move = (state, id, x, z, options = {snapMm: 0}) => checked(state,
  () => S.resolveWorldMove(state, {id, x, z}, catalog, options));
const turn = (state, id, yawDeg) => checked(state,
  () => S.resolveWorldRotation(state, {id, yawDeg}, catalog, {snapDeg: 0}));
const localWorld = (parent, x, z) => {
  const p = G.rotateXZ([x, z], parent.pose.yawDeg);
  return [p[0] + parent.pose.xMm, p[1] + parent.pose.zMm];
};

test('exact-radius tangent rotation is a complete continuous sweep', () => {
  const local = G.rectangle(600, 800), outer = G.rectangle(1000, 1000);
  // Independent integer oracle: every point of this convex footprint is in
  // the radius-500 disk, which is wholly contained in this room at every angle.
  assert.ok(local.every(([x, z]) => x * x + z * z === 500 * 500));
  for (const yawDeg of [-180, -90, 90, 180])
    assert.equal(C.rigidMotionStaysInside(outer, local, pose(), pose(0, 0, yawDeg)), true);
});
test('slanted convex walls, reversed winding and redundant corners retain tangency', () => {
  const room = [[-700,100],[-400,-300],[-100,-700],[700,-100],[100,700]];
  // Each nonzero edge has perpendicular distance exactly 500 from the origin.
  for (const outer of [room, room.slice().reverse()])
    assert.equal(C.rigidMotionStaysInside(outer, G.rectangle(600, 800), pose(), pose(0, 0, 90)), true);
});
test('tangent rotation with translation proves the entire swept capsule', () => {
  // The centre moves along z=0, where the radius-500 disk touches both z walls.
  // Checking just the start/end footprint or an axis-aligned footprint box
  // would not establish containment of the intermediate rotated triangles.
  const outer = G.rectangle(1200, 1000), local = G.rectangle(600, 800);
  for (const direction of [-1, 1])
    assert.equal(C.rigidMotionStaysInside(outer, local, pose(-100, 0), pose(100, 0, direction * 90)), true);
  for (const scale of [2 ** -10, 100]) {
    const scaled = p => p.map(([x, z]) => [x * scale, z * scale]);
    assert.equal(C.rigidMotionStaysInside(scaled(G.rectangle(1000, 1000)), scaled(local), pose(), pose(0, 0, 90)), true);
  }
});
test('full turns, rapid direction changes and A-B-A cross tangent angles', () => {
  const initial = stateFor('radius500', {}, S.createRoomRect({widthMm: 1000, depthMm: 1000}));
  let state = initial;
  for (const yaw of [90, -90, 360, -360, 720, 0]) {
    const r = turn(state, 'p', yaw);
    assert.equal(r.yawDeg, yaw); assert.equal(r.boundaryLimited, undefined); state = r.state;
  }
  assert.equal(S.serializeLayout(state, catalog), S.serializeLayout(initial, catalog));
  assert.equal(S.serializeLayout(S.parseLayout(S.serializeLayout(state, catalog), catalog), catalog), S.serializeLayout(initial, catalog));
});
test('rotating furniture carries local children through exact room tangency', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 600, depthMm: 800});
  const child = printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 50, zMm: 70, yawDeg: 15});
  const initial = S.createDefaultLayout({room: S.createRoomRect({widthMm: 1000, depthMm: 1000}), furniture: [desk], printers: [child]}, catalog);
  let state = initial;
  for (const yaw of [90, -90, 360, 0]) {
    const r = turn(state, 'desk', yaw), world = S.worldTransform(r.state, 'p', catalog), expected = G.rotateXZ([50, 70], yaw);
    assert.equal(r.yawDeg, yaw); assert.deepEqual(r.state.printers[0].attachment, child.attachment);
    near(world.xMm, expected[0]); near(world.zMm, expected[1]); near(world.yawDeg, yaw + 15);
    assert.equal(world.supportYM, .75); state = r.state;
  }
  assert.equal(S.serializeLayout(state, catalog), S.serializeLayout(initial, catalog));
});
test('attached rotation proves the support-local sweep on an angled parent', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 1000, pose: pose(100, -200, 37)});
  const initial = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('radius500', {parentId: 'desk', surfaceId: 'top'})]}, catalog);
  let state = initial;
  for (const yaw of [127, -53, 397, 37]) {
    const r = turn(state, 'p', yaw); assert.equal(r.yawDeg, yaw);
    assert.equal(r.state.printers[0].attachment.yawDeg, yaw - 37);
    assert.deepEqual(r.state.furniture, initial.furniture); state = r.state;
  }
  assert.equal(S.serializeLayout(state, catalog), S.serializeLayout(initial, catalog));
});
test('one representable undersize and displaced circle cannot waive interference', () => {
  const local = G.rectangle(600, 800), undersize = G.rectangle(1000 - 2 ** -43, 1000);
  assert.ok(G.polygonContains(undersize, local));
  assert.ok(G.polygonContains(undersize, G.transformPolygon(local, pose(0, 0, 90))));
  assert.equal(C.rigidMotionStaysInside(undersize, local, pose(), pose(0, 0, 90)), false);
  assert.equal(C.rigidMotionStaysInside(G.rectangle(1000, 1000), local, pose(1e-10, 0), pose(1e-10, 0, 90)), false);
});
test('narrow room valid endpoints still reject an unsafe intermediate rotation', () => {
  const state = stateFor('wide', {}, S.createRoomRect({widthMm: 660, depthMm: 660}));
  const local = catalog.byId.wide.footprintMm;
  assert.ok(G.polygonContains(state.room.polygonMm, G.transformPolygon(local, pose(0, 0, 90))));
  assert.equal(G.polygonContains(state.room.polygonMm, G.transformPolygon(local, pose(0, 0, 45))), false);
  for (const direction of [-1, 1]) {
    const r = turn(state, 'p', direction * 90);
    const exactFirst = (Math.atan2(200, 300) - Math.acos(330 / Math.hypot(300, 200))) * 180 / Math.PI;
    assert.ok(direction * r.yawDeg > 0 && direction * r.yawDeg <= exactFirst);
    assert.equal(r.boundaryLimited, true); assert.equal(turn(r.state, 'p', 0).yawDeg, 0);
  }
});
test('concave L reflex edge rejects unsafe arcs between contained endpoints', () => {
  const state = stateFor('long', pose(-200, -200), S.createRoomL());
  const local = catalog.byId.long.footprintMm;
  assert.ok(G.polygonContains(state.room.polygonMm, G.transformPolygon(local, pose(-200, -200, -90))));
  assert.equal(G.polygonContains(state.room.polygonMm, G.transformPolygon(local, pose(-200, -200, -45))), false);
  assert.equal(C.rigidMotionStaysInside(state.room.polygonMm, local, pose(-200, -200), pose(-200, -200, -90)), false);
  const r = turn(state, 'p', -90); assert.ok(r.yawDeg > -45 && r.yawDeg < 0);
  assert.equal(turn(r.state, 'p', 0).yawDeg, 0);
});
test('catalog polygon can fit where its declared width-depth box does not', () => {
  const state = stateFor('triangle', {}, S.createRoomRect({widthMm: 150, depthMm: 150}));
  assert.equal(G.polygonContains(state.room.polygonMm, G.rectangle(200, 200)), false);
  assert.equal(turn(state, 'p', 360).yawDeg, 360);
});
for (const axis of ['x', 'z']) for (const side of [-1, 1]) test(`diagonal wall slide and immediate reversal ${axis}/${side}`, () => {
  let state = stateFor(), limit = axis === 'x' ? 1900 : 1400;
  for (const tangent of [300, -300, 600, -600]) {
    const goal = axis === 'x' ? [side * 1000000, tangent] : [tangent, side * 1000000];
    const r = move(state, 'p', ...goal);
    near(r[axis], side * limit); near(r[axis === 'x' ? 'z' : 'x'], tangent);
    const away = axis === 'x' ? [r.x - side * .001, r.z] : [r.x, r.z - side * .001];
    const reverse = move(r.state, 'p', ...away); near(reverse.x, away[0]); near(reverse.z, away[1]);
    state = reverse.state;
  }
});
test('L-room concave wall slide stays inside and releases on first reversed input', () => {
  let state = stateFor('square', pose(-100, 300), S.createRoomL());
  for (const z of [1000, 200, 1700, 300]) {
    const r = move(state, 'p', 1000000, z); near(r.x, -100); near(r.z, z);
    const reverse = move(r.state, 'p', r.x - .001, r.z); near(reverse.x, r.x - .001); state = reverse.state;
  }
});
test('rapid translation cannot jump between concave U arms with valid endpoints', () => {
  const room = S.createRoomPolygon({polygonMm: [[0,0],[6000,0],[6000,6000],[4000,6000],[4000,2000],[2000,2000],[2000,6000],[0,6000]]});
  const initial = stateFor('square', pose(1000, 4000), room), local = catalog.byId.square.footprintMm;
  const start = G.transformPolygon(local, pose(1000, 4000)), end = G.transformPolygon(local, pose(5000, 4000));
  assert.ok(G.polygonContains(room.polygonMm, start)); assert.ok(G.polygonContains(room.polygonMm, end));
  assert.equal(C.translationStaysInside(room.polygonMm, start, 4000, 0), false);
  const r = move(initial, 'p', 5000, 4000); near(r.x, 1900); near(r.z, 4000);
  let state = r.state;
  for (const [x, z] of [[1000,1000],[5000,1000],[5000,4000]]) {
    const next = move(state, 'p', x, z); near(next.x, x); near(next.z, z); state = next.state;
  }
});
for (const yaw of [0, 37, 90, -37]) test(`support-local diagonal pressure and release on parent ${yaw}`, () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100, 200, yaw)});
  const initial = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 400})]}, catalog);
  const r = move(initial, 'p', ...localWorld(desk, 450, 120), {snapMm: 10, snapOrigin: pose(400, 0)});
  near(r.state.printers[0].attachment.xMm, 400); near(r.state.printers[0].attachment.zMm, 120);
  const away = move(r.state, 'p', ...localWorld(desk, 390, 120), {snapMm: 10, snapOrigin: pose(400, 0)});
  near(away.state.printers[0].attachment.xMm, 390); near(away.state.printers[0].attachment.zMm, 120);
  assert.deepEqual(away.state.furniture, initial.furniture);
});
test('rotated furniture with a local printer slides without changing attachment', () => {
  const yaw = 37, local = G.rectangle(800, 500), extent = Math.max(...G.transformPolygon(local, pose(0, 0, yaw)).map(p => p[0]));
  const desk = S.createDesk({id: 'desk', widthMm: 800, depthMm: 500, pose: pose(2000 - extent, 0, yaw)});
  const child = printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 100, zMm: -50, yawDeg: 15});
  let state = S.createDefaultLayout({furniture: [desk], printers: [child]}, catalog);
  for (const z of [200, -200, 600, -600]) {
    const r = move(state, 'desk', 1000000, z); near(r.x, desk.pose.xMm); near(r.z, z);
    assert.deepEqual(r.state.printers[0].attachment, child.attachment);
    const away = move(r.state, 'desk', r.x - .001, r.z); near(away.x, r.x - .001); state = away.state;
  }
});
test('coordinate limits and rapid min-max-mid-reversed translation remain finite', () => {
  const room = S.createRoomPolygon({polygonMm: [[900000,900000],[1000000,900000],[1000000,1000000],[900000,1000000]]});
  let state = stateFor('square', pose(950000, 950000), room);
  for (const [x, z] of [[1000000,1000000],[-1000000,-1000000],[950000,950000],[1000000,-1000000],[-1000000,1000000]]) {
    const r = move(state, 'p', x, z);
    assert.ok(r.x >= 900100 && r.x <= 999900 && r.z >= 900100 && r.z <= 999900); state = r.state;
  }
});

for (const snapMm of [0, 10]) test(`rotated-desk confirmed full tangent shortfall ${snapMm}`, () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100, 200, 37)});
  const initial = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 400, zMm: 120})]}, catalog);
  const r = move(initial, 'p', ...localWorld(desk, 450, -120), {snapMm, snapOrigin: pose(400, 120)});
  assert.equal(r.state.printers[0].attachment.xMm, 400);
  assert.equal(r.state.printers[0].attachment.zMm, -120);
  assert.equal(r.boundaryLimited, true);
  const local = catalog.byId.square.footprintMm;
  assert.equal(C.translationStaysInside(G.rectangle(1000, 600), G.transformPolygon(local, pose(400, 120)), 0, -240), true);
  assert.throws(() => S.applyAction(r.state, {type: 'UPDATE_PRINTER', id: 'p', patch: {attachment: {xMm: 400 + 2 ** -44}}}, catalog),
    error => error instanceof S.LayoutValidationError && error.errors.some(e => e.code === 'SURFACE_OVERHANG'));
});
for (const yaw of [37, -37, 143]) for (const axis of ['x', 'z']) for (const side of [-1, 1]) for (const snapMm of [0, 10])
test(`support-edge rapid pressure-reversal ${yaw}/${axis}/${side}/snap${snapMm}`, () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100, 200, yaw)});
  const limit = axis === 'x' ? 400 : 200, tangentLimit = axis === 'x' ? 200 : 400;
  const point = (normal, tangent) => axis === 'x' ? [normal, tangent] : [tangent, normal];
  const [xMm, zMm] = point(side * limit, 120), origin = {xMm, zMm};
  const initial = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('square', {parentId: 'desk', surfaceId: 'top', xMm, zMm})]}, catalog);
  let state = initial;
  for (const tangent of [-120, 120, tangentLimit - 1, 1 - tangentLimit, -120, 120]) {
    const r = move(state, 'p', ...localWorld(desk, ...point(side * (limit + 50), tangent)), {snapMm, snapOrigin: origin});
    const attachment = r.state.printers[0].attachment;
    assert.equal(attachment[axis === 'x' ? 'xMm' : 'zMm'], side * limit, 'Contact normal must stay exact');
    const expected = snapMm ? 120 + Math.round((tangent - 120) / snapMm) * snapMm : tangent;
    near(attachment[axis === 'x' ? 'zMm' : 'xMm'], expected);
    const distance = snapMm || .001, away = point(side * (limit - distance), expected);
    const reversed = move(r.state, 'p', ...localWorld(desk, ...away), {snapMm, snapOrigin: origin});
    near(reversed.state.printers[0].attachment.xMm, away[0]); near(reversed.state.printers[0].attachment.zMm, away[1]);
    const back = move(reversed.state, 'p', ...localWorld(desk, ...point(side * limit, expected)), {snapMm, snapOrigin: origin});
    // A direct unsnapped input can land one ULP inside; every subsequent
    // constrained slide must reach the full tangent target without penetration.
    near(back.state.printers[0].attachment[axis === 'x' ? 'xMm' : 'zMm'], side * limit); state = back.state;
  }
  const restored = move(state, 'p', ...localWorld(desk, xMm, zMm), {snapMm, snapOrigin: origin});
  assert.equal(S.serializeLayout(restored.state, catalog), S.serializeLayout(initial, catalog));
});
test('parent translations and rotations retain exact child coordinates after boundary slides', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100.125, 200.375, 37)});
  let state = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 400, zMm: 120})]}, catalog);
  state = move(state, 'p', ...localWorld(desk, 450, -120), {snapMm: 10, snapOrigin: pose(400, 120)}).state;
  const attachment = state.printers[0].attachment;
  assert.equal(attachment.xMm, 400); assert.equal(attachment.zMm, -120);
  for (const [x, z, yaw] of [[1000,-1000,127],[-1000,1000,-53],[0,0,397],[100.125,200.375,37]]) {
    state = move(state, 'desk', x, z).state; state = turn(state, 'desk', yaw).state;
    assert.deepEqual(state.printers[0].attachment, attachment);
    const parent = state.furniture[0], child = S.worldTransform(state, 'p', catalog), expected = localWorld(parent, 400, -120);
    near(child.xMm, expected[0]); near(child.zMm, expected[1]); near(child.yawDeg, yaw);
    state = move(state, 'p', ...localWorld(parent, 450, 120), {snapMm: 10, snapOrigin: pose(400, -120)}).state;
    assert.equal(state.printers[0].attachment.xMm, 400); assert.equal(state.printers[0].attachment.zMm, 120);
    state = move(state, 'p', ...localWorld(parent, 450, -120), {snapMm: 10, snapOrigin: pose(400, 120)}).state;
    assert.deepEqual(state.printers[0].attachment, attachment);
    assert.deepEqual(S.parseLayout(S.serializeLayout(state, catalog), catalog), state);
  }
});
test('parent rapid concave-room movement preserves child attachment and polygon containment', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(-900, -800, 37)});
  const child = printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 400, zMm: 120});
  let state = S.createDefaultLayout({room: S.createRoomL(), furniture: [desk], printers: [child]}, catalog);
  for (const [x, z] of [[1000000,1000],[-1000000,-1000000],[-900,1000],[-900,-1000],[-900,-800]]) {
    state = move(state, 'desk', x, z).state; assert.deepEqual(state.printers[0].attachment, child.attachment);
  }
});
for (const yaw of [23, 37, -37]) test(`fractional unsnapped no-op and anchored A-B-A preserve saved coordinates ${yaw}`, () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100.1234567890123, -200.9876543210987, yaw)});
  const attachment = {parentId: 'desk', surfaceId: 'top', xMm: 5.123456789012345, zMm: -3.987654321098765, yawDeg: 15.23456789012345};
  const state = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}), furniture: [desk],
    printers: [printer('square', attachment)]}, catalog), original = S.serializeLayout(state, catalog);
  const world = S.worldTransform(state, 'p', catalog), noOp = S.applyWorldMove(state, {id: 'p', xMm: world.xMm, zMm: world.zMm}, catalog);
  assert.equal(noOp, state); assert.equal(S.serializeLayout(noOp, catalog), original);
  const moved = move(state, 'p', ...localWorld(desk, attachment.xMm + 50, attachment.zMm - 70), {snapMm: 0, snapOrigin: attachment});
  const back = move(moved.state, 'p', world.xMm, world.zMm, {snapMm: 0, snapOrigin: attachment});
  assert.equal(S.serializeLayout(back.state, catalog), original);
  assert.equal(S.serializeLayout(S.parseLayout(original, catalog), catalog), original);
  assert.deepEqual(Object.keys(back.state), Object.keys(state));
});
test('attached slide uses the catalog polygon rather than the declared dimension box', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 150, depthMm: 150, pose: pose(100, 200, 37)});
  const state = S.createDefaultLayout({furniture: [desk], printers: [printer('triangle', {parentId: 'desk', surfaceId: 'top', xMm: 25})]}, catalog);
  assert.equal(G.polygonContains(G.rectangle(150, 150), G.rectangle(200, 200)), false);
  const r = move(state, 'p', ...localWorld(desk, 100, 20), {snapMm: 10, snapOrigin: pose(25, 0)});
  assert.equal(r.state.printers[0].attachment.xMm, 25); assert.equal(r.state.printers[0].attachment.zMm, 20);
});
test('rotated support snapping retains only the world-space unsnapped pointer remainder', () => {
  const desk = S.createDesk({id: 'desk', widthMm: 1000, depthMm: 600, pose: pose(100, 200, 37)});
  const state = S.createDefaultLayout({furniture: [desk], printers: [printer('square', {parentId: 'desk', surfaceId: 'top', xMm: 400, zMm: 120})]}, catalog);
  const raw = localWorld(desk, 450.25, -117.25), snapped = localWorld(desk, 450, -120);
  const r = move(state, 'p', ...raw, {snapMm: 10, snapOrigin: pose(400, 120)});
  assert.equal(r.state.printers[0].attachment.xMm, 400); assert.equal(r.state.printers[0].attachment.zMm, -120);
  assert.deepEqual(r.pointerRemainder, {x: raw[0] - snapped[0], z: raw[1] - snapped[1]});
});

assert.deepEqual(hashes(), before, 'Tests must not mutate numerical sources');
const failures = cases.filter(c => c.status === 'FAIL');
const report = {status: failures.length ? 'FAIL' : 'PASS', cases, sourceSHA256: before,
  scope: 'Synthetic planning footprints, continuous constraint proofs and state transactions only. No browser, actual-asset or native-solid verification.'};
const reportArg = process.argv.indexOf('--report');
if (reportArg >= 0) fs.writeFileSync(process.argv[reportArg + 1], JSON.stringify(report, null, 2) + '\n', {flag: 'wx'});
console.log(JSON.stringify(report));
assert.deepEqual(failures, [], 'Drag-boundary regressions');
