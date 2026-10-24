// Pure placement regression tests. No DOM, downloads or physical CAD fit claim.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const option = process.argv.indexOf('--site');
const site = option < 0 ? path.join(root, 'site') : path.resolve(process.argv[option + 1]);
const source = name => path.join(site, 'layout', name);
const S = await import(pathToFileURL(source('layout-state.mjs')));
const {rotateXZ, pointInPolygon} = await import(pathToFileURL(source('layout-geometry.mjs')));
const {proposePlacement} = await import(pathToFileURL(source('layout-placement.mjs')));
const entries = [{id: 'small', widthMm: 200, depthMm: 100, heightMm: 200, baseOffsetMm: 37},
  {id: 'large', widthMm: 600, depthMm: 400, heightMm: 600}];
const catalog = S.createCatalog(entries);
const empty = () => S.createDefaultLayout({}, catalog);
const request = patch => ({kind: 'printer', id: 'new-printer', machineId: 'small',
  xMm: 0, zMm: 0, yawDeg: 0, parentId: null, surfaceId: 'floor', snapMm: 0, ...patch});
const propose = (state, patch, machines = catalog) => proposePlacement(state, request(patch), machines);
const near = (actual, expected) => assert.ok(Math.abs(actual - expected) < 1e-8, `${actual} != ${expected}`);
const finitePreview = result => {
  assert.ok(Object.values(result.world).every(Number.isFinite));
  assert.ok(Object.values(result.sizeMm).every(n => Number.isFinite(n) && n >= 0));
};
const rejects = (result, code) => {
  finitePreview(result); assert.equal(result.valid, false); assert.equal(result.state, null);
  assert.deepEqual(result.guides, []); assert.ok(result.issues.length);
  if (code) assert.ok(result.issues.some(e => e.code === code), JSON.stringify(result.issues));
};
const accepted = result => {finitePreview(result); assert.equal(result.valid, true, JSON.stringify(result.issues)); assert.ok(result.state); return result;};
const cases = [];
function test(name, run) {run(); cases.push(name);}

test('empty layout: real defaults, world grid, no model base-offset in ghost', () => {
  for (const kind of ['desk', 'shelf', 'printer']) {
    const result = accepted(propose(empty(), {kind, id: `new-${kind}`, xMm: 113, zMm: -127, snapMm: 10}));
    assert.deepEqual(result.world, {xMm: 110, yMm: 0, zMm: -130, yawDeg: 0});
    assert.deepEqual(result.sizeMm, kind === 'printer' ? {width: 200, depth: 100, height: 200}
      : kind === 'desk' ? {width: 1200, depth: 600, height: 750} : {width: 900, depth: 450, height: 1800});
  }
});

test('rotated desk: world coordinates/yaw to support-local and TOP height', () => {
  for (const parentYaw of [90, 37, -123]) {
    const desk = S.createDesk({widthMm: 1600, depthMm: 1000, heightMm: 815,
      pose: {xMm: 300, zMm: -200, yawDeg: parentYaw}});
    const state = S.createDefaultLayout({furniture: [desk]}, catalog);
    const delta = rotateXZ([150, -70], parentYaw);
    const result = accepted(propose(state, {xMm: 300 + delta[0], zMm: -200 + delta[1], yawDeg: parentYaw + 25,
      parentId: desk.id, surfaceId: 'top'}));
    const a = result.state.printers[0].attachment;
    near(a.xMm, 150); near(a.zMm, -70); near(a.yawDeg, 25);
    assert.equal(result.world.yMm, 815);
    const derived = S.worldTransform(result.state, result.id, catalog);
    near(derived.xMm, result.world.xMm); near(derived.zMm, result.world.zMm);
    near(derived.yawDeg, result.world.yawDeg); near(derived.positionM.y * 1000, 852);
    const grid = accepted(propose(state, {xMm: 413, zMm: -137, yawDeg: parentYaw,
      parentId: desk.id, surfaceId: 'top', snapMm: 10}));
    near(grid.world.xMm, 410); near(grid.world.zMm, -140);
    const resolved = S.worldTransform(grid.state, grid.id, catalog);
    near(resolved.xMm, 410); near(resolved.zMm, -140);
  }
});

test('shelf support, obstructing board and ceiling reject', () => {
  const shelf = S.createShelf({widthMm: 1200, depthMm: 800, heightMm: 1800,
    levels: [{id: 'low', topMm: 100}, {id: 'middle', topMm: 350}, {id: 'high', topMm: 1800}]});
  const state = S.createDefaultLayout({furniture: [shelf]}, catalog);
  const result = accepted(propose(state, {parentId: shelf.id, surfaceId: 'low'}));
  assert.equal(result.world.yMm, 100);
  const blocked = propose(state, {parentId: shelf.id, surfaceId: 'low', machineId: 'large'});
  rejects(blocked, 'SHELF_BOARD_INTERSECTION'); assert.equal(blocked.world.yMm, 100);
  const lowRoom = S.createDefaultLayout({room: S.createRoomRect({wallHeightMm: 1900}), furniture: [shelf]}, catalog);
  rejects(propose(lowRoom, {parentId: shelf.id, surfaceId: 'high'}), 'ROOM_HEIGHT_EXCEEDED');
});

test('concave room: a footprint crossing the notch fails with all corners inside', () => {
  const polygonMm = [[0,0],[6000,0],[6000,6000],[4000,6000],[4000,2000],[2000,2000],[2000,6000],[0,6000]];
  for (const polygon of [polygonMm, [...polygonMm].reverse()]) {
    const state = S.createDefaultLayout({room: S.createRoomPolygon({polygonMm: polygon})}, catalog);
    const copy = S.createDesk({id: 'template', widthMm: 4000, depthMm: 4000});
    for (const p of [[1000,1000],[5000,1000],[5000,5000],[1000,5000]]) assert.ok(pointInPolygon(p, polygon) > 0);
    rejects(propose(state, {kind: 'desk', copy, xMm: 3000, zMm: 3000}), 'ROOM_OUT_OF_BOUNDS');
  }
});

test('overlap rejects; exact edge contact and unrelated legacy warnings survive', () => {
  const first = accepted(propose(empty(), {id: 'first'})).state;
  rejects(propose(first, {}), 'ENVELOPE_OVERLAP');
  accepted(propose(first, {xMm: 200}));
  const legacy = structuredClone(first); legacy.printers[0].attachment.xMm = 5000;
  accepted(propose(legacy, {}));
  const desk = S.createDesk();
  const deskState = S.createDefaultLayout({furniture: [desk]}, catalog);
  rejects(propose(deskState, {}), 'ENVELOPE_OVERLAP');
  rejects(propose(deskState, {kind: 'shelf'}), 'ENVELOPE_OVERLAP');
  rejects(propose(deskState, {parentId: desk.id, surfaceId: 'top', xMm: 550}), 'SURFACE_OVERHANG');
});

test('genuine catalog footprint drives room bounds and overlap, not build sizes', () => {
  const machines = S.createCatalog([{id: 'extended', widthMm: 200, depthMm: 100, heightMm: 200,
    footprintMm: [[-100,-50],[400,-50],[400,50],[-100,50]]}]);
  rejects(propose(empty(), {machineId: 'extended', xMm: 1750}, machines), 'ROOM_OUT_OF_BOUNDS');
  const first = accepted(propose(empty(), {machineId: 'extended', id: 'first'}, machines)).state;
  rejects(propose(first, {machineId: 'extended', xMm: 450}, machines), 'ENVELOPE_OVERLAP');
});

test('copy keeps furniture dimensions/levels and printer configuration; children stay put', () => {
  const copy = S.createShelf({id: 'original', widthMm: 1350, depthMm: 650, heightMm: 1200, boardThicknessMm: 25,
    levels: [{id: 'custom-bottom', topMm: 110}, {id: 'custom-top', topMm: 1200}], pose: {xMm: -1000, zMm: 0, yawDeg: 0}});
  const printer = {id: 'original-printer', machineId: 'small', configurationId: 'custom-configuration',
    attachment: {parentId: copy.id, surfaceId: 'custom-bottom', xMm: 0, zMm: 0, yawDeg: 0}};
  const state = S.createDefaultLayout({furniture: [copy], printers: [printer]}, catalog);
  const result = accepted(propose(state, {kind: 'shelf', copy, id: 'copied', xMm: 1000, yawDeg: 15}));
  const cloned = result.state.furniture[1];
  assert.deepEqual({...cloned, id: copy.id, pose: copy.pose}, copy);
  assert.deepEqual(result.state.printers, [printer]); assert.notEqual(cloned.levels, copy.levels);
  const p = accepted(propose(state, {copy: printer, id: 'copied-printer', xMm: 1000}));
  assert.equal(p.state.printers[1].configurationId, 'custom-configuration');
  assert.equal(p.state.printers[1].attachment.parentId, null);
});

test('magnetic centre/edge alignment is stable and opt-out restores raw world coordinates', () => {
  const first = accepted(propose(empty(), {id: 'first', xMm: 3, zMm: 0})).state;
  for (const xMm of [204, 206, 208]) {
    const result = accepted(propose(first, {xMm, zMm: 300, snapMm: 10}));
    assert.equal(result.world.xMm, 203); assert.equal(result.guides.length, 1);
    assert.equal(result.guides[0].axis, 'x'); assert.equal(result.guides[0].valueMm, 103);
    for (const g of result.guides) assert.ok([g.valueMm,g.minMm,g.maxMm].every(Number.isFinite));
    assert.deepEqual(propose(first, {xMm, zMm: 300, snapMm: 10}), result);
  }
  const centre = accepted(propose(first, {xMm: 9, zMm: 300, snapMm: 10}));
  assert.equal(centre.world.xMm, 3);
  const off = accepted(propose(first, {xMm: 208, zMm: 300}));
  assert.equal(off.world.xMm, 208); assert.deepEqual(off.guides, []);
  const far = accepted(propose(first, {xMm: 224, zMm: 300, snapMm: 10}));
  assert.equal(far.world.xMm, 220); assert.deepEqual(far.guides, []);
});

test('invalid nearest magnet falls back to original grid; only accepted axes get guides', () => {
  const edgeState = accepted(propose(empty(), {id: 'align-peer', xMm: 1803, zMm: 300})).state;
  const edge = accepted(propose(edgeState, {xMm: 1901, zMm: 0, snapMm: 10}));
  // The nearest alignment at 1903 crosses the room edge; grid 1900 is valid.
  assert.equal(edge.world.xMm, 1900); assert.deepEqual(edge.guides, []);
  // x=-3 magnet intersects the blocker; x=0 grid is valid and z can align.
  let state = accepted(propose(empty(), {id: 'align-peer', xMm: -3, zMm: 300})).state;
  state = accepted(propose(state, {id: 'blocker', xMm: -200, zMm: 0})).state;
  const fallback = accepted(propose(state, {xMm: -2, zMm: 0, snapMm: 10}));
  assert.equal(fallback.world.xMm, 0);
  assert.ok(fallback.guides.every(g => g.axis === 'z'));
});

test('magnet search is limited to the selected support surface', () => {
  const shelf = S.createShelf({widthMm: 1500, depthMm: 1000, levels: [{id: 'lower', topMm: 100}, {id: 'upper', topMm: 1000}]});
  let state = S.createDefaultLayout({furniture: [shelf]}, catalog);
  state = accepted(propose(state, {id: 'other-level', xMm: 3, parentId: shelf.id, surfaceId: 'lower'})).state;
  const result = accepted(propose(state, {xMm: 9, zMm: 300, parentId: shelf.id, surfaceId: 'upper', snapMm: 10}));
  assert.equal(result.world.xMm, 10); assert.deepEqual(result.guides, []);
});

test('limits, missing catalog/support, duplicate IDs and malformed input return finite red previews', () => {
  rejects(propose(empty(), {}, []), 'UNKNOWN_MACHINE');
  rejects(proposePlacement(empty(), request({}), undefined), 'UNKNOWN_MACHINE');
  rejects(propose(empty(), {}, {}), 'CATALOG_ARRAY_REQUIRED');
  rejects(propose(empty(), {}, [{id: 'broken', widthMm: Infinity, depthMm: 10, heightMm: 10}]), 'NUMBER_OUT_OF_RANGE');
  rejects(propose(empty(), {parentId: 'missing', surfaceId: 'top'}));
  const desk = S.createDesk();
  const deskState = S.createDefaultLayout({furniture: [desk]}, catalog);
  const missingMachine = propose(deskState, {machineId: 'missing', parentId: desk.id, surfaceId: 'top'});
  rejects(missingMachine, 'UNKNOWN_MACHINE'); assert.equal(missingMachine.world.yMm, 750);
  rejects(propose(deskState, {parentId: desk.id, surfaceId: 'wrong'}), 'UNKNOWN_SURFACE');
  rejects(propose(deskState, {kind: 'desk', id: desk.id, xMm: 1500}), 'DUPLICATE_ENTITY_ID');
  for (const patch of [{xMm: NaN}, {zMm: Infinity}, {yawDeg: -Infinity}, {xMm: 1e100}, {yawDeg: '90'},
    {kind: 'unknown'}, {snapMm: 5}, {copy: {}}, {kind: 'shelf', copy: desk}, {id: '__proto__'}]) rejects(propose(empty(), patch));
  rejects(proposePlacement(null, null, catalog));
  for (const kind of ['desk', 'printer']) {
    const state = structuredClone(empty()), count = kind === 'desk' ? S.LIMITS.maxFurniture : S.LIMITS.maxPrinters;
    for (let i = 0; i < count; i++) {
      if (kind === 'desk') state.furniture.push(S.createDesk({id: `old-${i}`}));
      else state.printers.push({id: `old-${i}`, machineId: 'small', configurationId: null,
        attachment: {parentId: null, surfaceId: 'floor', xMm: 0, zMm: 0, yawDeg: 0}});
    }
    rejects(propose(state, {kind}), kind === 'desk' ? 'FURNITURE_COUNT' : 'PRINTER_COUNT');
  }
});

test('immutable input/output ownership and prepared catalogs from versioned modules', () => {
  const template = S.createDesk({widthMm: 1400, depthMm: 800});
  const state = structuredClone(empty()), input = request({kind: 'desk', copy: template});
  const before = JSON.stringify({state, input, entries});
  const acceptedResult = accepted(proposePlacement(state, input, entries));
  proposePlacement(state, {...input, xMm: 1e100}, entries);
  assert.equal(JSON.stringify({state, input, entries}), before);
  assert.notEqual(acceptedResult.state, state); assert.notEqual(acceptedResult.state.room, state.room);
  state.room.wallHeightMm = 777;
  assert.equal(acceptedResult.state.room.wallHeightMm, 2400);
  const foreignCatalog = {entries: catalog.entries, byId: catalog.byId};
  accepted(propose(empty(), {}, foreignCatalog));
});

const catalogPath = source('layout-catalog.json');
assert.ok(fs.existsSync(catalogPath), 'Registered planning catalog must be present');
const raw = JSON.parse(fs.readFileSync(catalogPath, 'utf8'));
assert.ok(Array.isArray(raw.machines) && raw.machines.length > 0, 'No silently skipped machine catalog');
const actualCatalog = S.createCatalog(raw.machines.map(m => ({...m, widthMm: m.dimensionsMm.width,
  depthMm: m.dimensionsMm.depth, heightMm: m.dimensionsMm.height})));
const coverage = [];
test('every available catalog machine: floor, rotated support and impossible room endpoint', () => {
  const room = S.createRoomRect({widthMm: S.LIMITS.maxDimensionMm, depthMm: S.LIMITS.maxDimensionMm, wallHeightMm: S.LIMITS.maxWallHeightMm});
  for (const row of actualCatalog.entries) {
    const state = S.createDefaultLayout({room}, actualCatalog);
    const floor = propose(state, {machineId: row.id}, actualCatalog);
    accepted(floor);
    assert.deepEqual(floor.sizeMm, {width: row.widthMm, depth: row.depthMm, height: row.heightMm});
    rejects(propose(state, {machineId: row.id, xMm: S.LIMITS.maxDimensionMm}, actualCatalog), 'ROOM_OUT_OF_BOUNDS');
    const desk = S.createDesk({widthMm: Math.max(1200, row.widthMm + 200), depthMm: Math.max(800, row.depthMm + 200),
      pose: {xMm: 1000, zMm: -500, yawDeg: 37}});
    const supported = S.createDefaultLayout({room, furniture: [desk]}, actualCatalog);
    accepted(propose(supported, {machineId: row.id, parentId: desk.id, surfaceId: 'top', xMm: 1000, zMm: -500, yawDeg: 37}, actualCatalog));
    coverage.push({machineId: row.id, status: 'PASS', poses: ['floor', 'desk-yaw37', 'outside-room-reject']});
  }
});

const sha256 = file => crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');
console.log(JSON.stringify({status: 'PASS', cases: cases.length, machineCount: coverage.length,
  casesTested: cases, coverage, inputs: Object.fromEntries(['layout-placement.mjs', 'layout-state.mjs', 'layout-geometry.mjs', 'layout-catalog.json']
    .map(name => [name, sha256(source(name))])), scope: 'Pure static planning envelopes and transactions only; no exported model, browser or native-solid fit audit.'}));
