// Independent mm/projection oracles against the real site module. Canvas calls
// are recorded fixtures: no browser pixels, model assets or native fit evidence.
// Usage: node scripts/test_layout_plan_measurements.mjs [--site <site-root>]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath, pathToFileURL} from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
assert.ok(args.length === 0 || args.length === 2 && args[0] === '--site' && !args[1].startsWith('--'),
  'Usage: node scripts/test_layout_plan_measurements.mjs [--site <site-root>]');
const site = args.length ? path.resolve(args[1]) : path.join(root, 'site');
const inputs = ['layout/layout-plan-measurements.mjs', 'layout/layout-state.mjs',
  'layout/layout-geometry.mjs', 'layout/layout-constraints.mjs', 'layout/layout-finishes.mjs',
  'viewer/vendor-r180/three.module.js', 'viewer/vendor-r180/three.core.js'];
const hashes = () => Object.fromEntries(inputs.map(name => {
  const bytes = fs.readFileSync(path.join(site, name));
  return [name, {bytes: bytes.length, sha256: crypto.createHash('sha256').update(bytes).digest('hex')}];
}));
const before = hashes();
const M = await import(pathToFileURL(path.join(site, 'layout/layout-plan-measurements.mjs')));
const S = await import(pathToFileURL(path.join(site, 'layout/layout-state.mjs')));
const {OrthographicCamera, Vector3} = await import(pathToFileURL(path.join(site, 'viewer/vendor-r180/three.module.js')));
const cases = [];
function test(id, run) {
  try { run(); cases.push({id, status: 'PASS'}); }
  catch (error) { cases.push({id, status: 'FAIL', error: error.stack}); }
}
function near(actual, expected, message = 'numeric fixture comparison, not a CAD tolerance') {
  assert.ok(Number.isFinite(actual) && Number.isFinite(expected), `${message}: non-finite value`);
  assert.ok(Math.abs(actual - expected) <= 1e-8 + Math.abs(expected) * 1e-10,
    `${message}: ${actual} != ${expected}`);
}
function pointNear(actual, expected, message) {
  assert.equal(actual.length, 2);
  actual.forEach((n, i) => near(n, expected[i], message));
}
function freeze(value) {
  if (value && typeof value === 'object' && !Object.isFrozen(value)) {
    Object.values(value).forEach(freeze); Object.freeze(value);
  }
  return value;
}
const roomMarks = marks => marks.filter(m => m.kind === 'room');
const selectedMarks = marks => marks.filter(m => m.kind === 'selected');
function finiteMarks(marks, width, height) {
  for (const m of marks) {
    assert.ok(['room', 'selected', 'scale'].includes(m.kind));
    for (const p of [m.start, m.end, m.label, m.tick]) {
      assert.ok(Array.isArray(p) && p.length === 2 && p.every(Number.isFinite), 'Non-finite drawing point');
    }
    assert.ok(Number.isFinite(m.lengthMm) && m.lengthMm > 0, 'Dimensions must be positive finite mm');
    near(Math.hypot(...m.tick), 1, 'Unit tick normal');
    assert.ok(m.label[0] >= 0 && m.label[0] <= width && m.label[1] >= 0 && m.label[1] <= height,
      'Annotation anchor must be onscreen');
  }
}

// Real vendored orthographic projection, without a renderer. The independent
// scale oracle is height * zoom / (2 * halfHeightM * 1000), in pixels per mm.
function view({width = 1600, height = 1400, halfHeightM = 6, zoom = 3, pan = [0, 0]} = {}) {
  const halfWidthM = halfHeightM * width / height;
  const camera = new OrthographicCamera(-halfWidthM, halfWidthM, halfHeightM, -halfHeightM, .1, 100);
  camera.up.set(0, 0, -1);
  camera.position.set(pan[0] / 1000, 10, pan[1] / 1000);
  camera.lookAt(pan[0] / 1000, 0, pan[1] / 1000);
  camera.zoom = zoom; camera.updateProjectionMatrix(); camera.updateMatrixWorld(true);
  const project = (x, z) => {
    const p = new Vector3(x / 1000, 0, z / 1000).project(camera);
    return [(p.x + 1) * width / 2, (1 - p.y) * height / 2];
  };
  return {width, height, project, pixelsPerMm: height * zoom / (2 * halfHeightM * 1000)};
}
function dimensions(options, polygonMm, kind = 'room') {
  const marks = M.planMeasurementMarks({...options, ...(kind === 'room' ? {polygonMm} : {selectedPolygonMm: polygonMm})});
  finiteMarks(marks, options.width, options.height);
  return marks.filter(m => m.kind === kind);
}
function edgeOracle(marks, polygon, lengths, project, offset) {
  assert.equal(marks.length, lengths.length, 'All expected visible edges must be measured');
  marks.forEach((m, i) => {
    near(m.lengthMm, lengths[i], `Edge ${i} actual mm length`);
    const a = project(...polygon[i]), b = project(...polygon[(i + 1) % polygon.length]);
    const distance = Array.isArray(offset) ? offset[i] : offset;
    pointNear(m.start.map((n, k) => n - m.tick[k] * distance), a, 'Original projected edge start');
    pointNear(m.end.map((n, k) => n - m.tick[k] * distance), b, 'Original projected edge end');
    pointNear(m.label, m.start.map((n, k) => (n + m.end[k]) / 2), 'Label midpoint');
    near((b[0] - a[0]) * m.tick[0] + (b[1] - a[1]) * m.tick[1], 0, 'Tick perpendicular to edge');
  });
}
const rectangle = [[-1200, -700], [1200, -700], [1200, 700], [-1200, 700]];
const lShape = [[-1800, -1500], [1800, -1500], [1800, -500], [400, -500], [400, 1500], [-1800, 1500]];
const lLengths = [3600, 1000, 1400, 2000, 2200, 3000];
// Rational 3-4-5 rotation, independent of production geometry helpers.
const rotated = polygon => polygon.map(([x, z]) => [(3 * x - 4 * z) / 5, (4 * x + 3 * z) / 5]);
const reversed = polygon => [polygon[0], ...polygon.slice(1).reverse()];

test('rotated-rectangle-reports-side-lengths-not-axis-aligned-bounds', () => {
  const v = view(), polygon = rotated(rectangle);
  edgeOracle(dimensions(v, polygon), polygon, [2400, 1400, 2400, 1400], v.project, 25);
});
test('L-shaped-outline-measures-every-actual-edge-including-closing-edge', () => {
  const v = view();
  edgeOracle(dimensions(v, lShape), lShape, lLengths, v.project, 25);
});
test('rotated-L-shape-and-reversed-winding-preserve-edge-lengths-and-outward-offsets', () => {
  const v = view({halfHeightM: 8}), polygon = rotated(lShape), reverse = reversed(polygon);
  const forwardMarks = dimensions(v, polygon), reverseMarks = dimensions(v, reverse);
  edgeOracle(forwardMarks, polygon, lLengths, v.project, 25);
  edgeOracle(reverseMarks, reverse, [...lLengths].reverse(), v.project, 25);
  const segments = marks => marks.map(m => [m.start, m.end].map(p => p.map(n => n.toFixed(6)).join(',')).sort().join('|')).sort();
  assert.deepEqual(segments(reverseMarks), segments(forwardMarks), 'Reversal must not move dimensions inward');
});
test('slanted-3-4-5-edge-is-Euclidean-length-not-axis-delta-or-perimeter', () => {
  const v = view(), polygon = [[-1000, -500], [500, -500], [500, 1500]];
  edgeOracle(dimensions(v, polygon), polygon, [1500, 2000, 2500], v.project, 25);
});
test('reflected-screen-projection-keeps-outward-room-offset', () => {
  const project = (x, z) => [800 + x / 4, 700 - z / 4];
  const marks = dimensions({project, width: 1600, height: 1400}, rectangle);
  edgeOracle(marks, rectangle, [2400, 1400, 2400, 1400], project, 25);
  pointNear(marks[0].tick, [0, 1], 'Topological outward side survives screen reflection');
});
test('orthographic-zoom-pan-and-reversed-zoom-leave-reported-mm-invariant', () => {
  const polygon = [[-900, -500], [900, -500], [900, 500], [-900, 500]];
  const visits = [[.6, 0, 0], [1, 200, -120], [2, -250, 150], [1, 200, -120], [.6, 0, 0]];
  const first = [];
  for (const [zoom, x, z] of visits) {
    const v = view({width: 1800, height: 1500, halfHeightM: 3, zoom, pan: [x, z]});
    pointNear(v.project(0, 0), [900 - x * v.pixelsPerMm, 750 - z * v.pixelsPerMm], 'Pan oracle');
    const marks = dimensions(v, polygon);
    edgeOracle(marks, polygon, [1800, 1000, 1800, 1000], v.project, 25);
    near(Math.hypot(marks[0].end[0] - marks[0].start[0], marks[0].end[1] - marks[0].start[1]),
      1800 * v.pixelsPerMm, 'Drawing changes with orthographic zoom');
    first.push(marks);
  }
  assert.deepEqual(first[0], first.at(-1), 'A-to-B-to-A camera restores identical annotations');
});

test('zero-and-short-edges-are-omitted-without-NaN-and-76px-edge-is-retained', () => {
  const v = {width: 500, height: 400, project: (x, z) => [x + 150, z + 120]};
  assert.equal(dimensions(v, [[0, 0], [75.99, 0], [75.99, 75.99], [0, 75.99]]).length, 0);
  assert.equal(dimensions(v, [[0, 0], [76, 0], [76, 76], [0, 76]]).length, 4);
  const duplicate = [[0, 0], [0, 0], [200, 0], [200, 150], [0, 150]];
  assert.deepEqual(dimensions(v, duplicate).map(m => m.lengthMm), [200, 150, 200, 150]);
  assert.deepEqual(M.planMeasurementMarks({...v, polygonMm: duplicate, project: () => [200, 200]}), []);
});
test('offscreen-pans-cull-dimensions-on-all-four-sides-with-finite-scale', () => {
  for (const pan of [[10000, 0], [-10000, 0], [0, 10000], [0, -10000]]) {
    const v = view({width: 800, height: 600, halfHeightM: 3, zoom: 1, pan});
    const marks = M.planMeasurementMarks({...v, polygonMm: rectangle});
    finiteMarks(marks, v.width, v.height);
    assert.equal(roomMarks(marks).length, 0);
    assert.equal(marks.filter(m => m.kind === 'scale').length, 1);
  }
});
test('invalid-viewports-and-missing-projector-never-emit-marks-or-call-projection', () => {
  for (const [width, height] of [[0, 400], [-1, 400], [600, 0], [NaN, 400], [600, Infinity]]) {
    assert.deepEqual(M.planMeasurementMarks({polygonMm: rectangle, width, height,
      project() { assert.fail('Invalid viewport must stop before projection'); }}), []);
  }
  assert.deepEqual(M.planMeasurementMarks({polygonMm: rectangle, width: 600, height: 400}), []);
});
test('non-finite-or-malformed-input-polygons-and-projections-cannot-leak-NaN', () => {
  const v = view();
  for (const polygonMm of [undefined, null, [], [[0, 0], [1, 0]],
    [[NaN, 0], [1000, 0], [1000, 1000]], [[0, 0], [Infinity, 0], [0, 1000]],
    [[0, 0, 0], [1000, 0], [1000, 1000]], [[0, 0], null, [1000, 1000]]]) {
    const marks = M.planMeasurementMarks({...v, polygonMm, selectedPolygonMm: polygonMm});
    finiteMarks(marks, v.width, v.height);
    assert.equal(roomMarks(marks).length + selectedMarks(marks).length, 0);
  }
  for (const project of [() => [NaN, 0], () => [0, Infinity], () => null, () => [0, 0, 0]]) {
    assert.deepEqual(M.planMeasurementMarks({...v, polygonMm: rectangle, selectedPolygonMm: rectangle, project}), []);
  }
});

test('scale-is-true-pixels-per-mm-at-55-zoom-and-viewport-combinations', () => {
  for (const [width, height] of [[180, 90], [320, 200], [800, 600], [3840, 2160], [8192, 4320]]) {
    for (const zoom of [.001, .01, .1, .25, .7, 1, 2, 5, 16, 128, 1000]) {
      const v = view({width, height, halfHeightM: 3, zoom});
      const marks = M.planMeasurementMarks(v);
      finiteMarks(marks, width, height);
      assert.equal(marks.length, 1, 'Exactly one scale, even without a room polygon');
      const m = marks[0], span = m.end[0] - m.start[0];
      assert.equal(m.kind, 'scale'); near(m.end[1], m.start[1]);
      near(span / m.lengthMm, v.pixelsPerMm, `${width}x${height} zoom=${zoom} scale calibration`);
      assert.ok(span >= 44 - 1e-8 && span <= 110 + 1e-8, 'Readable 1/2/5 scale interval');
      assert.ok([m.start, m.end, m.label].every(p => p[0] >= 0 && p[0] <= width && p[1] >= 0 && p[1] <= height));
      const mantissa = m.lengthMm / 10 ** Math.floor(Math.log10(m.lengthMm));
      assert.ok([1, 2, 5, 10].some(n => Math.abs(n - mantissa) < 1e-8));
    }
  }
});
test('scale-known-mm-values-and-pan-invariance-including-large-world-offset', () => {
  for (const [zoom, expectedMm, expectedPixels] of [[1, 1000, 100], [2, 500, 100], [.25, 2000, 50], [16, 50, 80], [1000, 1, 100]]) {
    let baseline;
    for (const pan of [[0, 0], [321, -654], [1000000, -1000000]]) {
      const v = view({width: 800, height: 600, halfHeightM: 3, zoom, pan});
      const [m] = M.planMeasurementMarks(v);
      near(m.lengthMm, expectedMm); near(m.end[0] - m.start[0], expectedPixels);
      if (baseline) {
        near(m.lengthMm, baseline.lengthMm); pointNear(m.start, baseline.start); pointNear(m.end, baseline.end);
      }
      baseline = m;
    }
  }
});
test('scale-omits-undersized-viewports-and-singular-or-non-finite-calibration', () => {
  for (const [width, height] of [[179, 90], [180, 89], [80, 600], [800, 50]]) {
    assert.deepEqual(M.planMeasurementMarks(view({width, height})), []);
  }
  for (const project of [() => [0, 0], () => [Infinity, 0], () => [NaN, 0]]) {
    assert.deepEqual(M.planMeasurementMarks({width: 800, height: 600, project}), []);
  }
});

// Recording Canvas2D fixture, with deliberately controlled text metrics. This
// verifies production drawing operations, not actual browser font rasterization.
function recordingContext({measure = true} = {}) {
  const records = [], stack = [];
  const stateKeys = ['font', 'textAlign', 'textBaseline', 'strokeStyle', 'fillStyle', 'lineWidth'];
  const ctx = {font: '19px serif', textAlign: 'right', textBaseline: 'alphabetic',
    strokeStyle: '#123456', fillStyle: '#abcdef', lineWidth: 7};
  const state = () => Object.fromEntries(stateKeys.map(k => [k, ctx[k]]));
  const initial = state();
  for (const op of ['beginPath', 'moveTo', 'lineTo', 'stroke', 'fillRect', 'fillText']) {
    ctx[op] = (...values) => {
      const numbers = op === 'fillText' ? values.slice(1) : values;
      assert.ok(numbers.every(n => typeof n === 'number' && Number.isFinite(n)), `${op} has invalid drawing coordinates`);
      if (op === 'fillText') assert.equal(typeof values[0], 'string');
      records.push({op, args: values, ...state()});
    };
  }
  ctx.save = () => { stack.push(state()); records.push({op: 'save'}); };
  ctx.restore = () => {
    assert.ok(stack.length, 'Unbalanced restore'); Object.assign(ctx, stack.pop()); records.push({op: 'restore'});
  };
  if (measure) ctx.measureText = text => {
    records.push({op: 'measureText', text, ...state()});
    return {width: Array.from(text).length * 7 * parseFloat(ctx.font) / 12};
  };
  for (const op of ['scale', 'transform', 'setTransform', 'rotate']) {
    ctx[op] = () => assert.fail(`Annotation drawing must not change the caller's pixel transform with ${op}`);
  }
  return {ctx, records, assertRestored() { assert.deepEqual(state(), initial); assert.equal(stack.length, 0); }};
}
function nearestValidCoordinate(actual, anchor, low, high) {
  assert.ok(actual >= low - 1e-8 && actual <= high + 1e-8, 'Text centre respects measured viewport bounds');
  // Bounds and minimum displacement uniquely specify the nearest valid point,
  // without requiring text to share the source dimension line's midpoint.
  const minimumDisplacement = anchor < low ? low - anchor : anchor > high ? anchor - high : 0;
  near(Math.abs(actual - anchor), minimumDisplacement, 'Text moves only as far as necessary to remain readable');
}
function checkDrawing(options, fixture) {
  const expected = M.planMeasurementMarks(options), marks = M.drawPlanMeasurements(fixture.ctx, options);
  assert.deepEqual(marks, expected, 'Drawing returns the actual computed annotations');
  finiteMarks(marks, options.width, options.height);
  const ops = name => fixture.records.filter(r => r.op === name);
  assert.equal(ops('stroke').length, marks.length);
  assert.equal(ops('beginPath').length, marks.length);
  assert.equal(ops('moveTo').length, marks.length * 3);
  assert.equal(ops('lineTo').length, marks.length * 3);
  assert.equal(ops('fillText').length, marks.length);
  assert.equal(ops('fillRect').length, marks.length);
  assert.equal(ops('save').length, 1); assert.equal(ops('restore').length, 1);
  const moves = ops('moveTo'), lines = ops('lineTo');
  marks.forEach((m, i) => {
    pointNear(moves[i * 3].args, m.start); pointNear(lines[i * 3].args, m.end);
    [m.start, m.end].forEach((p, k) => {
      pointNear(moves[i * 3 + k + 1].args, p.map((n, axis) => n - 4 * m.tick[axis]));
      pointNear(lines[i * 3 + k + 1].args, p.map((n, axis) => n + 4 * m.tick[axis]));
    });
    const text = ops('fillText')[i], background = ops('fillRect')[i];
    assert.equal(text.args.length, 3, 'No fillText maxWidth may compress text');
    assert.equal(text.font, '12px system-ui, sans-serif');
    assert.equal(text.textAlign, 'center'); assert.equal(text.textBaseline, 'middle');
    assert.doesNotMatch(text.args[0], /NaN|Infinity|undefined/);
    assert.ok(/[0-9]/u.test(text.args[0]), 'Text must contain a numeric dimension');
    const textWidth = Array.from(text.args[0]).length * 7;
    const [, textX, textY] = text.args;
    nearestValidCoordinate(textX, m.label[0], textWidth / 2 + 6, options.width - textWidth / 2 - 6);
    nearestValidCoordinate(textY, m.label[1], 10, options.height - 10);
    near(background.args[0], textX - textWidth / 2 - 5);
    near(background.args[1], textY - 9); near(background.args[2], textWidth + 10); near(background.args[3], 18);
    const stroke = ops('stroke')[i];
    assert.equal(stroke.lineWidth, m.kind === 'scale' ? 2 : 1);
    assert.equal(stroke.strokeStyle, m.kind === 'selected' ? '#a44628' : '#415760');
  });
  fixture.assertRestored(); return marks;
}
test('drawing-emits-real-lines-ticks-numeric-mm-and-constant-text-at-reversed-zooms', () => {
  const polygon = [[-617.28, -394.52], [617.28, -394.52], [617.28, 394.52], [-617.28, 394.52]];
  for (const zoom of [1, 2, 4, 2, 1]) {
    const fixture = recordingContext(), options = {...view({width: 1600, height: 1200, halfHeightM: 3, zoom}), polygonMm: polygon};
    const marks = checkDrawing(options, fixture);
    assert.equal(roomMarks(marks).length, 4);
    assert.deepEqual(fixture.records.filter(r => r.op === 'fillText').slice(0, 4).map(r => r.args[0]),
      ['1234.6 mm', '789 mm', '1234.6 mm', '789 mm']);
  }
});
test('2x-export-scales-font-ticks-offsets-and-bar-with-true-mm-calibration-and-no-sub1-shrink', () => {
  const shape = {polygonMm: rectangle, selectedPolygonMm: rotated(rectangle)};
  const preview = {...view({width: 960, height: 720}), ...shape};
  const output = {...view({width: 1920, height: 1440}), ...shape, pixelScale: 2};
  const limited = {...view({width: 512, height: 384}), ...shape};
  // Use both controlled font metrics and the module's metric fallback. These
  // are screen-space drawing fixtures, not actual PNG or browser font evidence.
  for (const measure of [true, false]) {
    const a = recordingContext({measure}), b = recordingContext({measure});
    const previewMarks = checkDrawing(preview, a), outputMarks = M.drawPlanMeasurements(b.ctx, output);
    finiteMarks(outputMarks, output.width, output.height);
    assert.equal(previewMarks.length, 7, 'Fixture covers four room edges, two selected edges and scale');
    assert.equal(outputMarks.length, previewMarks.length);
    outputMarks.forEach((mark, i) => {
      const original = previewMarks[i];
      assert.equal(mark.kind, original.kind); near(mark.lengthMm, original.lengthMm, 'Export preserves actual mm');
      for (const key of ['start', 'end', 'label']) pointNear(mark[key], original[key].map(n => n * 2), `2x ${key}`);
      pointNear(mark.tick, original.tick, 'Tick direction remains a unit normal');
    });
    const scale = outputMarks.find(m => m.kind === 'scale');
    near((scale.end[0] - scale.start[0]) / scale.lengthMm, output.pixelsPerMm, '1920px scale calibration');
    near(output.pixelsPerMm, 2 * preview.pixelsPerMm, 'Output camera pixels per mm doubles');
    assert.deepEqual(b.records.map(r => r.op), a.records.map(r => r.op), 'Same drawing operations at both resolutions');
    b.records.forEach((record, i) => {
      const original = a.records[i];
      if (record.op === 'fillText') {
        assert.equal(record.args.length, 3, 'Export must not compress text with maxWidth');
        assert.equal(record.args[0], original.args[0], 'Export text retains numeric lengths and units');
        assert.equal(record.font, '24px system-ui, sans-serif');
        pointNear(record.args.slice(1), original.args.slice(1).map(n => n * 2), '2x text centre');
      } else if (['moveTo', 'lineTo', 'fillRect'].includes(record.op)) {
        record.args.forEach((n, k) => near(n, original.args[k] * 2, `2x ${record.op} geometry`));
      } else if (record.op === 'stroke') {
        near(record.lineWidth, original.lineWidth * 2, '2x stroke width');
      }
    });
    b.assertRestored();
    const c = recordingContext({measure}), d = recordingContext({measure});
    const limitedMarks = checkDrawing(limited, c);
    const belowOneMarks = M.drawPlanMeasurements(d.ctx, {...limited, pixelScale: 512 / 960});
    assert.deepEqual(belowOneMarks, limitedMarks, 'GPU-limited output retains minimum offsets and scale-bar UI sizes');
    assert.deepEqual(d.records, c.records, 'Sub-1 pixelScale preserves 12px font, ticks, backgrounds and all drawing coordinates');
    d.assertRestored();
  }
});
test('drawing-calls-custom-formatter-with-unscaled-numeric-values-including-selected-and-scale', () => {
  const fixture = recordingContext(), seen = [], v = view();
  const marks = checkDrawing({...v, polygonMm: rectangle, selectedPolygonMm: rotated(rectangle),
    formatLength(n) { assert.equal(typeof n, 'number'); seen.push(n); return `${n.toFixed(2)} fixture-mm`; }}, fixture);
  assert.deepEqual(seen, marks.map(m => m.lengthMm));
  assert.equal(selectedMarks(marks).length, 2);
  assert.deepEqual(fixture.records.filter(r => r.op === 'fillText').map(r => r.args[0]), seen.map(n => `${n.toFixed(2)} fixture-mm`));
  assert.ok(fixture.records.filter(r => r.op === 'fillText').some((text, i) => text.args[1] !== marks[i].label[0]),
    'Long formatter text must exercise clamping independently of unchanged dimension geometry');
});
test('6000-by-4000-room-keeps-all-dimensions-with-adaptive-and-512px-inside-offsets', () => {
  // Numerical projections of the same fitted 6m x 4m room. No renderer, GPU or
  // PNG is created here; renderer/export integration is covered separately.
  const polygonMm = freeze([[-3000, -2000], [3000, -2000], [3000, 2000], [-3000, 2000]]);
  const original = JSON.stringify(polygonMm);
  for (const {width, height, offsets} of [
    {width: 900, height: 600, offsets: [146 / 11, 230 / 11, 146 / 11, 230 / 11]},
    {width: 512, height: 341, offsets: [-18, -18, -18, -18]},
    {width: 900, height: 600, offsets: [146 / 11, 230 / 11, 146 / 11, 230 / 11]},
  ]) {
    const v = view({width, height, halfHeightM: 2.2, zoom: 1});
    const fixture = recordingContext(), marks = checkDrawing({...v, polygonMm}, fixture);
    edgeOracle(roomMarks(marks), polygonMm, [6000, 4000, 6000, 4000], v.project, offsets);
    assert.deepEqual(fixture.records.filter(r => r.op === 'fillText').slice(0, 4).map(r => r.args[0]),
      ['6000 mm', '4000 mm', '6000 mm', '4000 mm']);
    const scale = marks.find(m => m.kind === 'scale');
    near((scale.end[0] - scale.start[0]) / scale.lengthMm, v.pixelsPerMm, 'Scale follows output pixel dimensions');
    assert.equal(JSON.stringify(polygonMm), original);
  }
});
test('drawing-text-metric-fallback-and-empty-output-restore-caller-state', () => {
  const v = view(); checkDrawing({...v, polygonMm: rectangle}, recordingContext({measure: false}));
  const fixture = recordingContext();
  assert.deepEqual(checkDrawing({...v, width: 0, polygonMm: rectangle}, fixture), []);
  assert.equal(fixture.records.filter(r => r.op === 'fillText' || r.op === 'fillRect').length, 0);
});
test('short-collapsed-and-offscreen-edges-have-finite-drawing-operations', () => {
  const polygonMm = [[0, 0], [50, 0], [50, 50], [0, 50]];
  for (const project of [(x, z) => [x + 100, z + 100], () => [200, 200],
    (x, z) => [x + 10000, z - 10000], () => [NaN, 0]]) {
    const marks = checkDrawing({polygonMm, project, width: 600, height: 400}, recordingContext());
    assert.equal(roomMarks(marks).length, 0);
  }
});
test('edge-label-backgrounds-stay-onscreen-near-left-and-right-viewport-boundaries', () => {
  const polygonMm = [[0, 0], [4000, 0], [4000, 3000], [0, 3000]];
  const clipped = [];
  for (const xOffset of [46, 154]) {
    const fixture = recordingContext();
    checkDrawing({polygonMm, width: 600, height: 400,
      project: (x, z) => [x * .1 + xOffset, z * .1 + 50]}, fixture);
    const backgrounds = fixture.records.filter(r => r.op === 'fillRect');
    assert.ok(backgrounds.length > 0, 'Boundary fixture must actually draw labels');
    for (const {args: [x, y, width, height]} of backgrounds) {
      if (!(x >= 0 && x + width <= 600 && y >= 0 && y + height <= 400)) {
        clipped.push({x, y, width, height, pan: xOffset});
      }
    }
    fixture.assertRestored();
  }
  assert.deepEqual(clipped, [], `Annotation backgrounds clip viewport: ${JSON.stringify(clipped)}`);
});

test('parented-printer-selection-uses-derived-world-polygon-through-parent-ABA-and-JSON-roundtrip', () => {
  const catalog = [{id: 'fixture-printer', widthMm: 600, depthMm: 320, heightMm: 450, baseOffsetMm: 25}];
  let state = S.createDefaultLayout({room: S.createRoomRect({widthMm: 10000, depthMm: 10000}),
    furniture: [S.createDesk({id: 'desk', widthMm: 1800, depthMm: 1000, heightMm: 750,
      pose: {xMm: 1000, zMm: -1500, yawDeg: 90}})],
    printers: [{id: 'printer', machineId: 'fixture-printer', configurationId: null,
      attachment: {parentId: 'desk', surfaceId: 'top', xMm: 120, zMm: 80, yawDeg: -30}}]}, catalog);
  const initial = S.serializeLayout(state, catalog), originalAttachment = state.printers[0].attachment;
  for (const [px, pz, yaw] of [[1000, -1500, 90], [-1100, 1200, -90], [0, 0, 37], [1000, -1500, 90]]) {
    state = S.applyAction(state, {type: 'UPDATE_FURNITURE', id: 'desk', patch: {pose: {xMm: px, zMm: pz, yawDeg: yaw}}}, catalog);
    const radians = yaw * Math.PI / 180, worldX = px + Math.cos(radians) * 120 + Math.sin(radians) * 80;
    const worldZ = pz - Math.sin(radians) * 120 + Math.cos(radians) * 80, angle = (yaw - 30) * Math.PI / 180;
    const expected = [[-300, -160], [300, -160], [300, 160], [-300, 160]].map(([x, z]) =>
      [worldX + Math.cos(angle) * x + Math.sin(angle) * z, worldZ - Math.sin(angle) * x + Math.cos(angle) * z]);
    const scene = S.deriveScene(state, catalog), printer = scene.printers[0];
    printer.worldEnvelopeMm.forEach((p, i) => pointNear(p, expected[i], 'Independent parent/child world corner'));
    assert.deepEqual(state.printers[0].attachment, originalAttachment);
    const v = view({width: 1400, height: 1000, halfHeightM: 2, zoom: 2, pan: [worldX, worldZ]});
    const options = {...v, polygonMm: state.room.polygonMm, selectedPolygonMm: printer.worldEnvelopeMm};
    const marks = checkDrawing(options, recordingContext());
    edgeOracle(selectedMarks(marks), expected, [600, 320], v.project, 17);
    const loaded = S.parseLayout(S.serializeLayout(state, catalog), catalog);
    assert.deepEqual(M.planMeasurementMarks({...options, selectedPolygonMm: S.deriveScene(loaded, catalog).printers[0].worldEnvelopeMm}), marks);
  }
  assert.equal(S.serializeLayout(state, catalog), initial);
});
test('optional-selection-measures-two-adjacent-rectangle-edges-and-rejects-other-cardinality', () => {
  const v = view(), polygon = rotated(rectangle), reverse = reversed(polygon);
  edgeOracle(dimensions(v, polygon, 'selected'), polygon, [2400, 1400], v.project, 17);
  edgeOracle(dimensions(v, reverse, 'selected'), reverse, [1400, 2400], v.project, 17);
  for (const selectedPolygonMm of [undefined, null, [], lShape, rectangle.slice(0, 3)]) {
    const marks = M.planMeasurementMarks({...v, polygonMm: rectangle, selectedPolygonMm});
    assert.equal(selectedMarks(marks).length, 0); assert.equal(roomMarks(marks).length, 4);
  }
});
test('frozen-input-and-cached-projection-points-remain-unchanged-and-returned-marks-do-not-alias', () => {
  const v = view(), points = new Map();
  const project = (x, z) => {
    const key = `${x},${z}`;
    if (!points.has(key)) points.set(key, Object.freeze(v.project(x, z)));
    return points.get(key);
  };
  const options = freeze({...v, project, polygonMm: structuredClone(lShape), selectedPolygonMm: rotated(rectangle)});
  const saved = JSON.stringify(options), expected = M.planMeasurementMarks(options);
  const projectedBefore = JSON.stringify([...points]);
  const marks = checkDrawing(options, recordingContext());
  assert.equal(JSON.stringify(options), saved); assert.equal(options.project, project);
  assert.equal(JSON.stringify([...points]), projectedBefore);
  marks[0].start[0] += 500; marks[0].end[1] -= 500; marks[0].label[0] = -500;
  marks[0].tick[0] = 3; marks[0].lengthMm = -1;
  assert.deepEqual(M.planMeasurementMarks(options), expected, 'Output edits must not contaminate future measurements');
  assert.equal(JSON.stringify(options), saved); assert.equal(JSON.stringify([...points]), projectedBefore);
});
test('tested-module-and-projection-dependencies-retain-their-recorded-hashes', () => assert.deepEqual(hashes(), before));

const failures = cases.filter(c => c.status === 'FAIL');
console.log(JSON.stringify({schema: 'layout-plan-measurements-regression-v1',
  status: failures.length ? 'FAIL' : 'PASS', site, cases: cases.length, passed: cases.length - failures.length,
  scope: 'Real site measurement/state modules and vendored orthographic camera; numeric fixtures and recorded Canvas2D operations only. No model, machine coverage, browser/GPU or native fit claim.',
  sources: before, failures}, null, 2));
if (failures.length) process.exitCode = 1;
