// Targeted pure-helper tests. Planning footprints are not CAD/clearance evidence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const option = name => { const i = process.argv.indexOf(name); return i < 0 ? null : process.argv[i + 1]; };
const site = path.resolve(option('--site') || fileURLToPath(new URL('../site/', import.meta.url)));
const suite = option('--suite') || 'all';
assert(['all', 'fixtures', 'catalog'].includes(suite), 'Use --suite fixtures, catalog or all');
const clipboardURL = pathToFileURL(path.join(site, 'layout/layout-clipboard.mjs'));
const source = fs.readFileSync(clipboardURL, 'utf8');
// Use the production dependency's exact URL, including its query, for catalogs
// and error identity. Other workers can change dependency contents independently.
const stateSpecifier = source.match(/from\s*['"](.\/layout-state\.mjs[^'"]*)['"]/)[1];
const S = await import(new URL(stateSpecifier, clipboardURL));
const G = await import(new URL('./layout-groups.mjs', clipboardURL));
const H = await import(clipboardURL);
const files = ['layout/layout-clipboard.mjs', 'layout/layout-state.mjs', 'layout/layout-groups.mjs',
  'layout/layout-group-data.mjs', 'layout/layout-geometry.mjs', 'layout/layout-constraints.mjs',
  'layout/layout-finishes.mjs', 'layout/layout-collision.mjs', 'layout/layout-catalog.json'];
const hashes = () => Object.fromEntries(files.filter(f => fs.existsSync(path.join(site, f))).map(f => {
  const bytes = fs.readFileSync(path.join(site, f));
  return [f, {sha256: createHash('sha256').update(bytes).digest('hex'), bytes: bytes.length}];
}));
const inputs = hashes(), cases = [], coverage = [];
const clone = value => JSON.parse(JSON.stringify(value));
const pose = (xMm = 0, zMm = 0, yawDeg = 0) => ({xMm, zMm, yawDeg});
const rows = [{id: 'fixture', widthMm: 100, depthMm: 60, heightMm: 100, baseOffsetMm: 12,
  footprintMm: [[-60, -25], [40, -25], [55, 35], [-60, 35]]}];
const C = S.createCatalog(rows);
const printer = (id, parentId = null, x = 0, z = 0, yaw = 0, surfaceId = parentId ? 'top' : 'floor') =>
  ({id, machineId: 'fixture', configurationId: `saved:${id}/size=250?head=UHF&board=CAN`,
    attachment: {parentId, surfaceId, ...pose(x, z, yaw)}});
const room = () => S.createRoomRect({widthMm: 30000, depthMm: 24000, wallHeightMm: 10000});
const desk = (id, x = 0, z = 0, yaw = 0) => S.createDesk({id, widthMm: 1600, depthMm: 1000, heightMm: 720, pose: pose(x, z, yaw)});
const empty = () => S.createDefaultLayout({room: room()}, C);
const reject = (fn, code) => assert.throws(fn, e => e.name === 'LayoutValidationError'
  && e.errors?.some(issue => issue.code === code), `Expected ${code}`);
const near = (a, b, message) => assert.ok(Math.abs(a - b) <= 1e-8, `${message}: ${a} != ${b}`);
function test(name, run) { run(); cases.push(name); }
function untouched(value, run) {
  const before = JSON.stringify(value), frozen = Object.isFrozen(value);
  try { return run(); } finally { assert.equal(JSON.stringify(value), before); assert.equal(Object.isFrozen(value), frozen); }
}
function fixture(grouped = false) {
  let state = S.createDefaultLayout({room: room(), furniture: [desk('bench-a', -3000, -1200, 37),
    S.createShelf({id: 'rack', widthMm: 1200, depthMm: 800, heightMm: 2000, boardThicknessMm: 20,
      pose: pose(800, -900, -63), levels: [{id: 'low', topMm: 100}, {id: 'middle', topMm: 900}, {id: 'top', topMm: 1850}]}),
    desk('bench-b', 3800, 1000, 90)], printers: [
    printer('left', 'bench-a', -350, 120, -15), printer('right', 'bench-a', 350, -150, 22),
    printer('rack-low', 'rack', 0, 0, 91, 'low'), printer('rack-mid', 'rack', 100, -80, -33, 'middle'),
    printer('rack-top', 'rack', -100, 70, 17, 'top'), printer('on-b', 'bench-b', 70, -30, -18),
    printer('floor', null, -900, 2600, -127)]}, C);
  if (grouped) {
    state = G.createGroup(state, {id: 'old-a', name: 'First row', memberIds: ['bench-a', 'floor']}, C);
    state = G.createGroup(state, {id: 'old-b', name: 'Second row', memberIds: ['rack', 'bench-b']}, C);
  }
  assert.equal(S.validatePlacement(state, C).length, 0);
  return state;
}
function allScene(state, catalog = C) {
  const scene = S.deriveScene(state, catalog); return [...scene.furniture, ...scene.printers];
}
function anchorOf(state, ids, catalog = C) {
  const points = allScene(state, catalog).filter(e => ids.includes(e.id)).flatMap(e => e.worldEnvelopeMm);
  return pose((Math.min(...points.map(p => p[0])) + Math.max(...points.map(p => p[0]))) / 2,
    (Math.min(...points.map(p => p[1])) + Math.max(...points.map(p => p[1]))) / 2);
}
function equivalentCopy(state, template, ids, catalog = C, floorIds = []) {
  const expected = new Map(allScene(state, catalog).filter(e => ids.includes(e.id)).map(e => [e.id, e]));
  const normalized = G.validateGroupTemplate(template, catalog), anchor = anchorOf(state, ids, catalog);
  assert.equal(template.format, '3d-print-rig-layout-set'); assert.equal(template.version, 1);
  assert.equal(template.furniture.length + template.printers.length, expected.size);
  for (const e of allScene(normalized, catalog)) {
    const original = expected.get(e.id); assert(original, e.id);
    near(e.xMm + anchor.xMm, original.xMm, `${e.id} normalized X`);
    near(e.zMm + anchor.zMm, original.zMm, `${e.id} normalized Z`);
    assert.equal(e.yawDeg, original.yawDeg, `${e.id} current world yaw must survive`);
    e.worldEnvelopeMm.forEach(([x, z], i) => {
      near(x + anchor.xMm, original.worldEnvelopeMm[i][0], `${e.id} footprint X`);
      near(z + anchor.zMm, original.worldEnvelopeMm[i][1], `${e.id} footprint Z`);
    });
    if (e.type === 'printer') {
      assert.equal(e.configurationId, original.configurationId);
      assert.equal(e.machineId, original.machineId);
      assert.equal(e.supportYM, floorIds.includes(e.id) ? 0 : original.supportYM);
    }
  }
  // Replay through the actual native placement API. ID remapping is its job.
  const placed = G.instantiateGroupTemplate(S.createDefaultLayout({room: state.room}, catalog),
    template, {id: 'pasted', ...anchor}, catalog);
  const remapped = new Map([...template.furniture.map((e, i) => [`pasted:f${i + 1}`, e.id]),
    ...template.printers.map((e, i) => [`pasted:p${i + 1}`, e.id])]);
  for (const e of allScene(placed, catalog)) {
    const original = expected.get(remapped.get(e.id));
    near(e.xMm, original.xMm, 'replayed X'); near(e.zMm, original.zMm, 'replayed Z');
    assert.equal(e.yawDeg, original.yawDeg);
    e.worldEnvelopeMm.forEach(([x, z], i) => {
      near(x, original.worldEnvelopeMm[i][0], 'replayed footprint X');
      near(z, original.worldEnvelopeMm[i][1], 'replayed footprint Z');
    });
  }
  assert.equal(S.validateState(placed, catalog).ok, true);
  assert.equal(S.validatePlacement(placed, catalog).length, 0);
  return placed;
}

if (suite !== 'catalog') {
  test('rotated supports preserve world geometry, all children, levels and exact configuration IDs', () => {
    const state = clone(fixture()), ids = ['bench-a', 'left', 'right', 'rack', 'rack-low', 'rack-mid', 'rack-top'];
    const template = untouched(state, () => H.captureLayoutClipboard(state, ['rack', 'bench-a'], C, {name: '  Production cell  '}));
    assert.equal(template.name, 'Production cell');
    assert.deepEqual(template.furniture.find(f => f.id === 'rack').levels, state.furniture[1].levels);
    for (const p of template.printers) assert.deepEqual(p.attachment, state.printers.find(q => q.id === p.id).attachment);
    equivalentCopy(state, template, ids);
    const p = state.printers[0], a = p.attachment, parent = state.furniture[0], r = parent.pose.yawDeg * Math.PI / 180;
    const local = G.validateGroupTemplate(template, C), copied = allScene(local).find(e => e.id === p.id), anchor = anchorOf(state, ids);
    near(copied.xMm + anchor.xMm, parent.pose.xMm + a.xMm * Math.cos(r) + a.zMm * Math.sin(r), 'independent rotated X');
    near(copied.zMm + anchor.zMm, parent.pose.zMm + a.zMm * Math.cos(r) - a.xMm * Math.sin(r), 'independent rotated Z');
    template.furniture[0].pose.xMm += 123; assert.equal(state.furniture[0].pose.xMm, -3000);
    assert(!Object.isFrozen(state.furniture[0]));
  });
  test('floor selection and lone attached printers preserve exact world XZ/yaw before normalization', () => {
    const state = fixture();
    for (const id of ['left', 'rack-mid', 'floor']) {
      const t = H.captureLayoutClipboard(state, [id], C);
      assert.equal(t.furniture.length, 0); assert.equal(t.printers.length, 1);
      assert.equal(t.printers[0].attachment.parentId, null); assert.equal(t.printers[0].attachment.surfaceId, 'floor');
      equivalentCopy(state, t, [id], C, [id]);
    }
  });
  test('group IDs flatten and mixed group/root/child picks deduplicate deterministically', () => {
    const state = fixture(true);
    const picks = ['old-a', 'old-b', 'left', 'rack-mid', 'bench-a', 'floor', 'old-a'];
    const t = H.captureLayoutClipboard(state, picks, C);
    assert.deepEqual(t, H.captureLayoutClipboard(state, ['bench-b', 'rack', 'floor', 'bench-a'], rows));
    assert(!Object.hasOwn(t, 'groups'));
    equivalentCopy(state, t, [...state.furniture, ...state.printers].map(e => e.id));
  });
  test('capturing a moved/rotated group normalizes translation only, never reverses its current yaw', () => {
    const initial = fixture(true), g = initial.groups[0];
    const state = G.transformGroup(initial, 'old-a', {...g.pose, xMm: g.pose.xMm - 1500, zMm: g.pose.zMm + 300, yawDeg: 41}, C);
    const t = H.captureLayoutClipboard(state, ['old-a'], C);
    assert.equal(t.furniture[0].pose.yawDeg, 37 + 41);
    assert.equal(t.printers.find(p => p.id === 'floor').attachment.yawDeg, -127 + 41);
    equivalentCopy(state, t, ['bench-a', 'left', 'right', 'floor']);
    assert.deepEqual(G.transformGroup(state, 'old-a', g.pose, C), initial);
  });
  test('unrelated and selected-to-external legacy overlaps cannot poison capture', () => {
    const initial = fixture(), overlap = clone(initial);
    overlap.printers.push(printer('legacy-1', null, 7000, 0), printer('legacy-2', null, 7000, 0),
      printer('external', null, initial.furniture[0].pose.xMm, initial.furniture[0].pose.zMm));
    const state = S.parseLayout(JSON.stringify(overlap), C);
    assert(S.validatePlacement(state, C).some(e => e.code === 'ENVELOPE_OVERLAP'));
    const t = untouched(state, () => H.captureLayoutClipboard(state, ['bench-a'], C));
    equivalentCopy(state, t, ['bench-a', 'left', 'right']);
    const next = H.regroupLayoutSelection(state, {id: 'safe', name: 'Kept', selectionIds: ['bench-a']}, C);
    assert.deepEqual(next.furniture, state.furniture); assert.deepEqual(next.printers, state.printers);
    assert.deepEqual(S.validatePlacement(next, C), S.validatePlacement(state, C));
  });
  test('internal selected overlaps, support overhang and shelf clearance still fail usefully', () => {
    const overlap = S.createDefaultLayout({room: room(), printers: [printer('a'), printer('b')]}, C);
    reject(() => H.captureLayoutClipboard(overlap, ['a', 'b'], C), 'ENVELOPE_OVERLAP');
    const overhang = clone(fixture()); overhang.printers[0].attachment.xMm = 1000;
    reject(() => H.captureLayoutClipboard(overhang, ['bench-a'], C), 'SURFACE_OVERHANG');
    const board = clone(fixture()); board.furniture[1].levels[1].topMm = 150;
    reject(() => H.captureLayoutClipboard(board, ['rack'], C), 'SHELF_BOARD_INTERSECTION');
  });
  test('selected room boundary/height violations remain errors', () => {
    const outside = clone(fixture()); outside.printers.at(-1).attachment.xMm = 15000;
    reject(() => H.captureLayoutClipboard(outside, ['floor'], C), 'ROOM_OUT_OF_BOUNDS');
    const low = clone(fixture()); low.room.wallHeightMm = 600;
    reject(() => H.captureLayoutClipboard(low, ['bench-a'], C), 'ROOM_HEIGHT_EXCEEDED');
  });
  test('regroup keeps old subsets, all coordinates, support parenting and native checked state', () => {
    const state = clone(fixture(true)), beforeScene = allScene(state);
    const next = untouched(state, () => H.regroupLayoutSelection(state,
      {id: 'merged', name: 'New row', selectionIds: ['rack', 'bench-a', 'left', 'rack-mid', 'rack']}, C));
    assert.deepEqual(next.furniture, state.furniture); assert.deepEqual(next.printers, state.printers);
    assert.deepEqual(allScene(next), beforeScene); assert.deepEqual(next.room, state.room);
    assert.deepEqual(next.groups.find(g => g.id === 'old-a'), {...state.groups[0], memberIds: ['floor'],
      memberPoses: state.groups[0].memberPoses.filter(e => e.id === 'floor')});
    assert.deepEqual(next.groups.find(g => g.id === 'old-b'), {...state.groups[1], memberIds: ['bench-b'],
      memberPoses: state.groups[1].memberPoses.filter(e => e.id === 'bench-b')});
    assert.deepEqual(next.groups.at(-1).memberIds, ['bench-a', 'rack']);
    assert.equal(S.validateState(next, C).ok, true); assert(Object.isFrozen(next));
    assert.deepEqual(S.parseLayout(S.serializeLayout(next, C), C), next);
  });
  test('rotated partial old group retains its exact anchor and can A-to-B-to-A', () => {
    const initial = fixture(true), old = initial.groups[0];
    const moved = G.transformGroup(initial, old.id, {...old.pose, xMm: old.pose.xMm - 1500, yawDeg: 31}, C);
    const next = H.regroupLayoutSelection(moved, {id: 'new', name: 'One bench', selectionIds: ['bench-a']}, C);
    assert.deepEqual(next.groups[0].pose, moved.groups[0].pose);
    assert.deepEqual(next.groups[0].originPose, moved.groups[0].originPose);
    const current = next.groups[0].pose;
    const a = G.transformGroup(next, old.id, {...current, xMm: current.xMm - 100, yawDeg: current.yawDeg + 5}, C);
    const back = G.transformGroup(a, old.id, current, C); assert.deepEqual(back, next);
    assert.deepEqual(next.furniture, moved.furniture); assert.deepEqual(next.printers, moved.printers);
  });
  test('regroup flattens multiple groups and removes emptied groups without nesting', () => {
    const state = fixture(true);
    const next = H.regroupLayoutSelection(state, {id: 'all', name: 'Everything', selectionIds: ['old-b', 'old-a', 'left', 'old-a']}, C);
    assert.equal(next.groups.length, 1);
    assert.deepEqual(new Set(next.groups[0].memberIds), new Set(['bench-a', 'rack', 'bench-b', 'floor']));
    assert(next.groups[0].memberIds.every(id => !['old-a', 'old-b'].includes(id)));
    assert.deepEqual(allScene(next), allScene(state));
    const reuse = H.regroupLayoutSelection(state, {id: 'old-a', name: 'Renamed/rebased', selectionIds: ['old-a']}, C);
    assert.equal(reuse.groups.length, 2); assert.deepEqual(allScene(reuse), allScene(state));
  });
  test('regroup child-only selection rejects atomically and does not add implicit supports', () => {
    const state = clone(fixture(true));
    untouched(state, () => reject(() => H.regroupLayoutSelection(state, {id: 'bad', name: 'Bad', selectionIds: ['left']}, C), 'GROUP_ROOT_REQUIRED'));
    const next = H.regroupLayoutSelection(state, {id: 'good', name: 'Good', selectionIds: ['left', 'bench-a', 'left']}, C);
    assert.deepEqual(next.groups.at(-1).memberIds, ['bench-a']);
  });
  test('group count limit applies after empty groups are removed', () => {
    let state = S.createDefaultLayout({room: room(), furniture: Array.from({length: S.LIMITS.maxGroups}, (_, i) =>
      S.createDesk({id: `d${i}`, widthMm: 100, depthMm: 100, pose: pose((i % 8) * 300, Math.floor(i / 8) * 300)}))}, C);
    for (const d of state.furniture) state = G.createGroup(state, {id: `g-${d.id}`, name: 'Single', memberIds: [d.id]}, C);
    const next = H.regroupLayoutSelection(state, {id: 'merged', name: 'Pair', selectionIds: ['g-d0', 'g-d1']}, C);
    assert.equal(next.groups.length, 63); assert.deepEqual(next.furniture, state.furniture);
    const full = clone(state); full.printers.push(printer('extra', null, -5000, 0));
    reject(() => H.regroupLayoutSelection(full, {id: 'overflow', name: 'Overflow', selectionIds: ['extra']}, C), 'GROUP_LIMIT');
  });
  test('empty/unknown/malformed picks, invalid names and colliding IDs leave input untouched', () => {
    const state = clone(fixture(true));
    for (const [picks, code] of [[[], 'GROUP_MEMBERS'], [null, 'GROUP_MEMBERS'], ['old-a', 'GROUP_MEMBERS'],
      [['missing'], 'UNKNOWN_ENTITY'], [[{}], 'INVALID_ID'], [['__proto__'], 'INVALID_ID'],
      [Array(257).fill('bench-a'), 'GROUP_MEMBERS']]) {
      untouched(state, () => reject(() => H.captureLayoutClipboard(state, picks, C), code));
      untouched(state, () => reject(() => H.regroupLayoutSelection(state, {id: 'x', name: 'X', selectionIds: picks}, C), code));
    }
    reject(() => H.captureLayoutClipboard(state, ['bench-a'], C, {name: '\u0000bad'}), 'GROUP_NAME');
    reject(() => H.captureLayoutClipboard(state, ['bench-a'], C, {extra: true}), 'UNKNOWN_FIELD');
    reject(() => H.regroupLayoutSelection(state, {id: 'floor', name: 'X', selectionIds: ['bench-a']}, C), 'DUPLICATE_ENTITY_ID');
    reject(() => H.regroupLayoutSelection(state, {id: 'old-a', name: 'X', selectionIds: ['bench-a']}, C), 'DUPLICATE_ENTITY_ID');
    reject(() => H.regroupLayoutSelection(state, {id: 'x', name: 'X', selectionIds: ['bench-a'], memberIds: []}, C), 'UNKNOWN_FIELD');
  });
  test('temporary anchor IDs cannot conflict with copied entities', () => {
    const state = S.createDefaultLayout({room: room(), furniture: [desk('clipboard-set'), desk('clipboard-set:1', 4000)]}, C);
    const t = H.captureLayoutClipboard(state, ['clipboard-set', 'clipboard-set:1'], C);
    assert.deepEqual(t.furniture.map(f => f.id), ['clipboard-set', 'clipboard-set:1']);
  });
  test('clipboard roundtrip is detached, deterministic and accepts catalog rows or native catalogs', () => {
    const t = H.captureLayoutClipboard(fixture(), ['rack', 'bench-a', 'floor'], C);
    const text = untouched(t, () => H.encodeLayoutClipboard(t, C));
    assert.equal(text, H.encodeLayoutClipboard(t, rows));
    const decoded = H.decodeLayoutClipboard(text, rows); assert.deepEqual(decoded, t);
    assert.equal(H.encodeLayoutClipboard(decoded, C), text);
    decoded.printers[0].configurationId = 'changed'; assert.notEqual(decoded.printers[0].configurationId, t.printers[0].configurationId);
    const furnitureOnly = H.captureLayoutClipboard(S.createDefaultLayout({furniture: [desk('desk')]}), ['desk']);
    assert.deepEqual(H.decodeLayoutClipboard(H.encodeLayoutClipboard(furnitureOnly)), furnitureOnly);
    assert.equal(H.captureLayoutClipboard(fixture(), ['floor'], C, {name: undefined}).name, 'Copied set');
  });
  test('maximum furniture/printer/group counts and all 256 explicit picks are supported', () => {
    const furniture = Array.from({length: S.LIMITS.maxFurniture}, (_, i) => S.createDesk({id: `support-${i}`,
      widthMm: 600, depthMm: 300, pose: pose((i % 8 - 3.5) * 1000, (Math.floor(i / 8) - 3.5) * 800, i % 2 ? 37 : -37)}));
    const printers = furniture.flatMap(f => [printer(`${f.id}-left`, f.id, -150), printer(`${f.id}-right`, f.id, 150)]);
    let state = S.createDefaultLayout({room: room(), furniture, printers}, C);
    for (const f of furniture) state = G.createGroup(state, {id: `g:${f.id}`, name: 'Support', memberIds: [f.id]}, C);
    const picks = [...state.furniture, ...state.printers, ...state.groups].map(e => e.id);
    assert.equal(picks.length, 256);
    const t = untouched(state, () => H.captureLayoutClipboard(state, picks, C));
    assert.equal(t.furniture.length, 64); assert.equal(t.printers.length, 128);
    assert.deepEqual(H.decodeLayoutClipboard(H.encodeLayoutClipboard(t, C), C), t);
    equivalentCopy(state, t, [...state.furniture, ...state.printers].map(e => e.id));
    const regrouped = H.regroupLayoutSelection(state, {id: 'all', name: 'All', selectionIds: picks}, C);
    assert.equal(regrouped.groups.length, 1); assert.equal(regrouped.groups[0].memberIds.length, 64);
    assert.deepEqual(regrouped.furniture, state.furniture); assert.deepEqual(regrouped.printers, state.printers);
  });
  test('malformed JSON and wrong format/version/root shape reject', () => {
    const t = H.captureLayoutClipboard(fixture(), ['bench-a'], C);
    for (const text of ['', '{', '{"format":}', 'null trailing', '\ufeff{}', '{}{}']) reject(() => H.decodeLayoutClipboard(text, C), 'JSON_PARSE_ERROR');
    for (const bad of [null, [], 'text', 42, {}, {...t, format: '3d-print-rig-layout'}, {...t, version: 2}, {...t, version: '1'}, {...t, groups: []}]) {
      untouched(bad, () => reject(() => H.encodeLayoutClipboard(bad, C), 'GROUP_TEMPLATE'));
      reject(() => H.decodeLayoutClipboard(JSON.stringify(bad), C), 'GROUP_TEMPLATE');
    }
    reject(() => H.decodeLayoutClipboard(null, C), 'JSON_SIZE_LIMIT');
  });
  test('unknown nested fields and dangerous prototype keys never survive either boundary', () => {
    const t = H.captureLayoutClipboard(fixture(), ['rack'], C);
    for (const key of ['__proto__', 'prototype', 'constructor', 'unexpected']) {
      for (const where of ['root', 'pose', 'attachment', 'level']) {
        const bad = clone(t), target = where === 'root' ? bad : where === 'pose' ? bad.furniture[0].pose
          : where === 'attachment' ? bad.printers[0].attachment : bad.furniture[0].levels[0];
        Object.defineProperty(target, key, {value: {polluted: true}, enumerable: true});
        const code = where === 'root' && key === 'unexpected' ? 'GROUP_TEMPLATE' : 'UNKNOWN_FIELD';
        untouched(bad, () => reject(() => H.encodeLayoutClipboard(bad, C), code));
        reject(() => H.decodeLayoutClipboard(JSON.stringify(bad), C), code);
      }
    }
    assert.equal({}.polluted, undefined);
  });
  test('non-JSON objects, cycles, getters, sparse arrays and hidden fields reject without execution', () => {
    const t = H.captureLayoutClipboard(fixture(), ['bench-a'], C);
    reject(() => H.encodeLayoutClipboard(Object.assign(Object.create({inherited: true}), t), C), 'EXPECTED_OBJECT');
    const cyclic = clone(t); cyclic.loop = cyclic; reject(() => H.encodeLayoutClipboard(cyclic, C), 'GROUP_TEMPLATE');
    const getter = clone(t); let reads = 0;
    Object.defineProperty(getter, 'name', {get() { reads++; return 'Getter'; }, enumerable: true});
    reject(() => H.encodeLayoutClipboard(getter, C), 'EXPECTED_OBJECT'); assert.equal(reads, 0);
    const method = {...t, toJSON() { throw new Error('must not execute'); }};
    reject(() => H.encodeLayoutClipboard(method, C), 'EXPECTED_OBJECT');
    const hidden = clone(t); Object.defineProperty(hidden, 'hidden', {value: 1});
    reject(() => H.encodeLayoutClipboard(hidden, C), 'EXPECTED_OBJECT');
    const sparse = clone(t); sparse.printers = Array(1); reject(() => H.encodeLayoutClipboard(sparse, C), 'GROUP_TEMPLATE');
    const extra = clone(t); extra.printers.extra = true; reject(() => H.encodeLayoutClipboard(extra, C), 'UNKNOWN_FIELD');
    const nonfinite = clone(t); nonfinite.furniture[0].pose.xMm = Infinity;
    reject(() => H.encodeLayoutClipboard(nonfinite, C), 'NUMBER_OUT_OF_RANGE');
  });
  test('unsupported external refs, unknown machines, config errors and duplicate IDs reject', () => {
    const t = H.captureLayoutClipboard(fixture(), ['rack'], C);
    const mutations = [
      ['UNKNOWN_PARENT', v => { v.printers[0].attachment.parentId = 'external'; }],
      ['UNKNOWN_SURFACE', v => { v.printers[0].attachment.surfaceId = 'gone'; }],
      ['UNKNOWN_MACHINE', v => { v.printers[0].machineId = 'unregistered'; }],
      ['INVALID_CONFIGURATION_ID', v => { v.printers[0].configurationId = 'x'.repeat(513); }],
      ['DUPLICATE_ENTITY_ID', v => { v.printers[0].id = v.furniture[0].id; }],
      ['FLOOR_SURFACE_REQUIRED', v => { v.printers[0].attachment.parentId = null; }],
    ];
    for (const [code, mutate] of mutations) {
      const bad = clone(t); mutate(bad);
      untouched(bad, () => reject(() => H.encodeLayoutClipboard(bad, C), code));
      reject(() => H.decodeLayoutClipboard(JSON.stringify(bad), C), code);
    }
    const invalidState = clone(fixture()); invalidState.printers[0].attachment.parentId = 'external';
    untouched(invalidState, () => reject(() => H.captureLayoutClipboard(invalidState, ['left'], C), 'UNKNOWN_PARENT'));
  });
  test('native entity/level counts remain bounded and empty templates reject', () => {
    const t = H.captureLayoutClipboard(fixture(), ['rack'], C);
    for (const [field, count, code] of [['furniture', 65, 'FURNITURE_COUNT'], ['printers', 129, 'PRINTER_COUNT']]) {
      const bad = clone(t); bad[field] = Array(count).fill(t[field][0]);
      reject(() => H.encodeLayoutClipboard(bad, C), code);
      reject(() => H.decodeLayoutClipboard(JSON.stringify(bad), C), code);
    }
    const levels = clone(t); levels.furniture[0].levels = Array(33).fill({id: 'level', topMm: 1});
    reject(() => H.decodeLayoutClipboard(JSON.stringify(levels), C), 'SHELF_LEVEL_COUNT');
    reject(() => H.decodeLayoutClipboard(JSON.stringify({...t, furniture: [], printers: []}), C), 'GROUP_MEMBERS');
  });
  test('2 MiB limit counts UTF-8 bytes and includes whitespace; excessive nesting is bounded', () => {
    const limit = 2 * 1024 * 1024, t = H.captureLayoutClipboard(fixture(), ['bench-a'], C), text = H.encodeLayoutClipboard(t, C);
    const boundary = text + ' '.repeat(limit - Buffer.byteLength(text));
    assert.equal(Buffer.byteLength(boundary), limit); assert.deepEqual(H.decodeLayoutClipboard(boundary, C), t);
    reject(() => H.decodeLayoutClipboard(boundary + ' ', C), 'JSON_SIZE_LIMIT');
    const bad = {...t, name: 'あ'.repeat(750000)}, unicode = JSON.stringify(bad);
    assert(unicode.length < limit && Buffer.byteLength(unicode) > limit);
    untouched(bad, () => reject(() => H.encodeLayoutClipboard(bad, C), 'JSON_SIZE_LIMIT'));
    reject(() => H.decodeLayoutClipboard(unicode, C), 'JSON_SIZE_LIMIT');
    reject(() => H.decodeLayoutClipboard('['.repeat(10000) + '0' + ']'.repeat(10000), C), 'JSON_SIZE_LIMIT');
  });
}

if (suite !== 'fixtures') {
  const {machineChoices}=await import(pathToFileURL(path.join(site,'viewer/machines.js')));
  const delivery=JSON.parse(fs.readFileSync(path.join(site,'APPROVED_DELIVERY.json'),'utf8'));
  const expectedMachines=machineChoices.filter(m=>m.available!==false).map(m=>m.id).sort();
  test('every registered planner machine copies its real catalog footprint and config without moving supports', () => {
    const catalog = JSON.parse(fs.readFileSync(path.join(site, 'layout/layout-catalog.json'), 'utf8'));
    assert(Array.isArray(catalog.machines) && catalog.machines.length, 'Missing planner machine registrations');
    assert.deepEqual(catalog.machines.map(m=>m.id).sort(),expectedMachines,'Missing or unregistered planner machine');
    assert.deepEqual([...delivery.machine_ids].sort(),expectedMachines,'Approved delivery and selector disagree');
    const inventory=JSON.parse(fs.readFileSync(new URL('../docs/SOURCE_INVENTORY.json',import.meta.url),'utf8'));
    const catalogPin=inventory.files.find(f=>f.path==='site/layout/layout-catalog.json');assert(catalogPin,'Unpinned delivered planner catalog');
    const catalogBytes=Buffer.from(fs.readFileSync(path.join(site,'layout/layout-catalog.json'),'utf8').replaceAll('\r\n','\n'));
    assert.deepEqual({sha256:createHash('sha256').update(catalogBytes).digest('hex'),bytes:catalogBytes.length},{sha256:catalogPin.sha256,bytes:catalogPin.bytes},'Planner catalog differs from inventoried exported source');
    const actualRows = catalog.machines.map(m => ({id: m.id, widthMm: m.dimensionsMm.width,
      depthMm: m.dimensionsMm.depth, heightMm: m.dimensionsMm.height, baseOffsetMm: m.baseOffsetMm ?? 0,
      ...(m.footprintMm ? {footprintMm: m.footprintMm} : {})}));
    const actual = S.createCatalog(actualRows);
    for (const [i, m] of actualRows.entries()) {
      const raw = catalog.machines[i], footprint = actual.byId[m.id].footprintMm;
      const widthMm = Math.max(...footprint.map(p => Math.abs(p[0]))) * 2 + 200;
      const depthMm = Math.max(...footprint.map(p => Math.abs(p[1]))) * 2 + 200;
      const config = raw.fullScene?.configurationId ?? raw.fullScene?.defaultSourceConfigurationId ?? null;
      const state = S.createDefaultLayout({room: room(), furniture: [S.createDesk({id: 'support', widthMm, depthMm, pose: pose(-3000, -1000, 37)})],
        printers: [{id: 'machine', machineId: m.id, configurationId: config,
          attachment: {parentId: 'support', surfaceId: 'top', ...pose(0, 0, 0)}}]}, actual);
      const selected = G.createGroup(state, {id: 'old', name: m.id, memberIds: ['support']}, actual);
      const template = untouched(selected, () => H.captureLayoutClipboard(selected, ['old', 'machine', 'support'], actual));
      const decoded = H.decodeLayoutClipboard(H.encodeLayoutClipboard(template, actual), actual);
      assert.deepEqual(decoded, template); assert.equal(template.printers[0].configurationId, config);
      equivalentCopy(state, decoded, ['support', 'machine'], actual);
      equivalentCopy(state, H.captureLayoutClipboard(state, ['machine'], actual), ['machine'], actual, ['machine']);
      const next = H.regroupLayoutSelection(selected, {id: 'new', name: 'Regrouped', selectionIds: ['old', 'support']}, actual);
      assert.deepEqual(next.furniture, state.furniture); assert.deepEqual(next.printers, state.printers);
      assert.equal(next.groups.length, 1); assert.equal(S.validateState(next, actual).ok, true);
      const blocker=S.createShelf({id:'blocker',widthMm,depthMm,heightMm:Math.max(1800,m.heightMm+1000),levels:[{id:'level-1',topMm:100}],pose:pose(3000,-1000,0)});
      const obstructed=S.createDefaultLayout({...selected,furniture:[...selected.furniture,blocker]},actual);
      const blocked=G.proposeGroupPlacement(obstructed,{template:decoded,id:'blocked-copy',xMm:3000,zMm:-1000,yawDeg:0,snapMm:0},actual);
      assert.equal(blocked.valid,false);assert(blocked.issues.some(e=>e.code==='ENVELOPE_OVERLAP'));
      const free=G.proposeGroupPlacement(obstructed,{template:decoded,id:'free-copy',xMm:3000,zMm:4000,yawDeg:0,snapMm:0},actual);
      assert.equal(free.valid,true);assert.equal(S.validatePlacement(free.state,actual).length,0);
      reject(()=>G.transformGroup(obstructed,'old',{xMm:6000,zMm:-1000},actual),'ENVELOPE_OVERLAP');
      coverage.push({machineId: m.id, status: 'PASS', configurationId: config, supportYawDeg: 37,
        scope: 'Approved delivered static planner footprint; support+children copy, lone-child floor copy, codec, regroup, obstacle/free paste and directed group path rejection. Not physical support or native-solid clearance.'});
    }
    assert.equal(coverage.length, catalog.machines.length);
    assert.equal(new Set(coverage.map(row => row.machineId)).size, catalog.machines.length);
  });
}

const after = hashes(), changed = Object.keys(inputs).filter(f => inputs[f].sha256 !== after[f]?.sha256);
assert.deepEqual(changed, [], 'Production inputs changed while tests ran; rerun the targeted suite');
const report = {status: 'PASS', suite, timestamp: new Date().toISOString(), cases, machineCount: coverage.length, coverage, inputs,
  test: {file: fileURLToPath(import.meta.url), sha256: createHash('sha256').update(fs.readFileSync(fileURLToPath(import.meta.url))).digest('hex')},
  scope: 'Pure clipboard/regroup transactions and static planner geometry only. No browser/UI, exported CAD, mounting or native-solid clearance audit.'};
if (option('--report')) fs.writeFileSync(path.resolve(option('--report')), JSON.stringify(report, null, 2) + '\n');
console.log(JSON.stringify({status: report.status, suite, cases: cases.length, machineCount: coverage.length, report: option('--report')}));
