import test from 'node:test';
import assert from 'node:assert/strict';
import { setTimeout as hostTask } from 'node:timers/promises';
import { writeSurfaceStep, STEP_SURFACE_LIMITS, StepSurfaceWriterError } from '../site/viewer/step-surface-writer.mjs';

// Synthetic, explicit topology fixtures: no CAD/personal/model assets are read.
const s = Math.SQRT1_2 * 1000;
function matrix(translation = [123.25, -87.5, 412.125]) {
  // Rz(45deg) * Rx(90deg), converting GLB metres to native Z-up millimetres.
  return [s, s, 0, 0, 0, 0, 1000, 0, s, -s, 0, 0, ...translation, 1];
}
function box(overrides = {}) {
  return {
    id: 'box-1', name: 'Tiny box',
    positions: new Float32Array([
      -1/128, -1/64, -1/256, 1/128, -1/64, -1/256,
      1/128, 1/64, -1/256, -1/128, 1/64, -1/256,
      -1/128, -1/64, 1/256, 1/128, -1/64, 1/256,
      1/128, 1/64, 1/256, -1/128, 1/64, 1/256,
    ]),
    index: new Uint16Array([
      0,2,1, 0,3,2, 4,5,6, 4,6,7, 0,1,5, 0,5,4,
      1,2,6, 1,6,5, 2,3,7, 2,7,6, 3,0,4, 3,4,7,
    ]),
    matrixCAD: matrix(), rgb: [0.125, 0.5, 0.875], opacity: 1,
    ...overrides,
  };
}
function detached(overrides = {}) {
  return {
    id: 'detached', name: 'Detached surface',
    positions: new Float32Array([
      0,0,0, 1/8,0,0, 0,1/4,0,
      1/2,1/2,1/2, 5/8,1/2,1/2, 1/2,5/8,3/4,
    ]),
    index: null, matrixCAD: matrix([-700.5, 36.25, -12.125]),
    rgb: [0.8, 0.2, 0.1], opacity: 0.35,
    ...overrides,
  };
}
function repeated(triangles, overrides = {}) {
  const b = box(overrides);
  const index = new Uint32Array(triangles * 3);
  for (let i = 0; i < index.length; i++) index[i] = b.index[i % b.index.length];
  return { ...b, index };
}

// Independent, non-evaluating STEP record/argument reader. It follows every
// emitted topology/material/product reference instead of trusting writer reports.
function unquote(token) {
  assert.ok(token.startsWith("'") && token.endsWith("'"));
  return token.slice(1, -1).replace(/''/g, "'")
    .replace(/\\X2\\([0-9A-F]+)\\X0\\/g, (_, hex) => {
      let result = '';
      for (let i = 0; i < hex.length; i += 4) result += String.fromCharCode(parseInt(hex.slice(i, i + 4), 16));
      return result;
    })
    .replace(/\\X4\\([0-9A-F]+)\\X0\\/g, (_, hex) => {
      let result = '';
      for (let i = 0; i < hex.length; i += 8) result += String.fromCodePoint(parseInt(hex.slice(i, i + 8), 16));
      return result;
    })
    .replace(/\\\\/g, '\\');
}
function fields(args) {
  const result = [];
  let start = 0, depth = 0, quoted = false;
  for (let i = 0; i < args.length; i++) {
    const c = args[i];
    if (c === "'") {
      if (quoted && args[i + 1] === "'") { i++; continue; }
      quoted = !quoted;
    } else if (!quoted) {
      if (c === '(') depth++;
      if (c === ')') depth--;
      if (c === ',' && depth === 0) { result.push(args.slice(start, i).trim()); start = i + 1; }
      assert.ok(depth >= 0);
    }
  }
  assert.equal(depth, 0);
  assert.equal(quoted, false);
  result.push(args.slice(start).trim());
  return result;
}
function references(text) {
  return Array.from(text.replace(/'(?:[^']|'')*'/g, "''").matchAll(/#(\d+)/g), match => Number(match[1]));
}
function parse(text) {
  assert.match(text, /^ISO-10303-21;\nHEADER;/);
  assert.match(text, /FILE_SCHEMA\(\('AUTOMOTIVE_DESIGN'\)\)/);
  assert.ok(text.endsWith('ENDSEC;\nEND-ISO-10303-21;\n'));
  assert.match(text, /not native CAD solids/);
  assert.match(text, /not manufacturing certification/);
  assert.doesNotMatch(text, /MANIFOLD_SOLID_BREP|FACETED_BREP|CLOSED_SHELL|ADVANCED_FACE|MECHANICAL_DESIGN_SHADED_PRESENTATION_REPRESENTATION/);
  assert.doesNotMatch(text, /[^\x00-\x7f]/);
  const data = text.slice(text.indexOf('\nDATA;\n') + 7, text.lastIndexOf('ENDSEC;'));
  const records = new Map();
  let consumed = '';
  for (const match of data.matchAll(/#(\d+)=(.*?);\n/gs)) {
    const id = Number(match[1]);
    assert.equal(id, records.size + 1, 'entity IDs must be unique and complete');
    const body = match[2];
    const simple = /^([A-Z_0-9]+)\((.*)\)$/s.exec(body);
    records.set(id, { id, body, type: simple?.[1] ?? 'COMPLEX', args: simple ? fields(simple[2]) : [] });
    consumed += match[0];
  }
  assert.equal(consumed, data, 'all data must be parsed without dropped records');
  for (const record of records.values()) {
    for (const ref of references(record.body)) assert.ok(records.has(ref), `unresolved reference #${ref}`);
  }
  return {
    records,
    all: type => [...records.values()].filter(record => record.type === type),
    get(id, type) {
      const record = records.get(id);
      assert.ok(record, `missing #${id}`);
      if (type) assert.equal(record.type, type);
      return record;
    },
  };
}
function triangleCoordinates(step, model) {
  const triangles = [];
  for (const shellId of references(model.args[1])) {
    const shell = step.get(shellId, 'OPEN_SHELL');
    const faces = references(shell.args[1]);
    assert.equal(faces.length, 1, 'one connected open shell per triangle');
    const face = step.get(faces[0], 'FACE_SURFACE');
    assert.equal(face.args[3], '.T.');
    const bounds = references(face.args[1]);
    assert.equal(bounds.length, 1);
    const bound = step.get(bounds[0], 'FACE_OUTER_BOUND');
    assert.equal(bound.args[2], '.T.');
    const loop = step.get(references(bound.args[1])[0], 'POLY_LOOP');
    const points = references(loop.args[1]);
    assert.equal(points.length, 3);
    const coordinates = points.map(id => {
      const point = step.get(id, 'CARTESIAN_POINT');
      const values = fields(point.args[1].slice(1, -1));
      assert.equal(values.length, 3);
      for (const token of values) assert.match(token, /^-?\d+\.\d*$/, 'finite, non-exponential STEP REAL');
      return values.map(Number);
    });
    const plane = step.get(references(face.args[2])[0], 'PLANE');
    const placement = step.get(references(plane.args[1])[0], 'AXIS2_PLACEMENT_3D');
    assert.deepEqual(references(placement.args[1]), [points[0]], 'plane origin is first triangle point');
    const direction = arg => {
      const record = step.get(references(arg)[0], 'DIRECTION');
      const values = fields(record.args[1].slice(1, -1));
      for (const token of values) assert.match(token, /^-?\d+\.\d*$/);
      return values.map(Number);
    };
    const normal = direction(placement.args[2]);
    const x = direction(placement.args[3]);
    const u = coordinates[1].map((v, k) => v - coordinates[0][k]);
    const v = coordinates[2].map((value, k) => value - coordinates[0][k]);
    const edgeLength = Math.hypot(...u);
    close(x, u.map(value => value / edgeLength), 1e-12);
    assert.ok(Math.abs(Math.hypot(...normal) - 1) < 1e-12);
    assert.ok(Math.abs(normal.reduce((sum, value, k) => sum + value * x[k], 0)) < 1e-12);
    const cross = [u[1]*v[2] - u[2]*v[1], u[2]*v[0] - u[0]*v[2], u[0]*v[1] - u[1]*v[0]];
    const crossLength = Math.hypot(...cross);
    close(normal, cross.map(value => value / crossLength), 1e-12);
    for (const edge of [u, v]) assert.ok(Math.abs(normal.reduce((sum, value, k) => sum + value * edge[k], 0)) < 1e-9);
    triangles.push(coordinates);
  }
  return triangles;
}
function expectedTriangles(input) {
  const count = input.index === null ? input.positions.length / 9 : input.index.length / 3;
  return Array.from({ length: count }, (_, t) => [0, 1, 2].map(k => {
    const v = (input.index === null ? t * 3 + k : input.index[t * 3 + k]) * 3;
    const [x, y, z] = input.positions.slice(v, v + 3);
    const [tx, ty, tz] = input.matrixCAD.slice(12, 15);
    // Closed-form, independent expectation for the known fixture rotation.
    return [tx + s * (x + z), ty + s * (x - z), tz + 1000 * y];
  }));
}
function close(actual, expected, tolerance = 1e-10) {
  assert.equal(actual.length, expected.length);
  for (let i = 0; i < actual.length; i++) assert.ok(Math.abs(actual[i] - expected[i]) <= tolerance, `${actual[i]} != ${expected[i]}`);
}
async function rejection(input, code, options) {
  await assert.rejects(writeSurfaceStep(input, options), error => {
    assert.ok(error instanceof StepSurfaceWriterError);
    assert.equal(error.code, code);
    assert.equal(error.report.returnedBlob, false);
    assert.equal(error.report.degenerateOmissions, 0);
    return true;
  });
}

test('geometry: public API, every box/detached triangle, CAD placement, topology and products', async () => {
  const inputs = [box(), detached()];
  const originals = inputs.map(p => ({ positions: p.positions.slice(), index: p.index?.slice(), matrix: p.matrixCAD.slice() }));
  const result = await writeSurfaceStep(inputs);
  assert.ok(result.blob instanceof Blob);
  assert.equal(result.blob.type, 'model/step');
  assert.equal(result.parts, 2);
  assert.equal(result.triangles, 14);
  const text = await result.blob.text();
  const step = parse(text);
  for (const [type, count] of Object.entries({ PRODUCT: 2, PRODUCT_DEFINITION: 2,
    MANIFOLD_SURFACE_SHAPE_REPRESENTATION: 2, SHAPE_DEFINITION_REPRESENTATION: 2,
    SHELL_BASED_SURFACE_MODEL: 2, OPEN_SHELL: 14, FACE_SURFACE: 14,
    PLANE: 14, AXIS2_PLACEMENT_3D: 14, DIRECTION: 28,
    FACE_OUTER_BOUND: 14, POLY_LOOP: 14, CARTESIAN_POINT: 42, FACE: 0, SHAPE_REPRESENTATION: 0 })) {
    assert.equal(step.all(type).length, count, type);
  }
  const models = step.all('SHELL_BASED_SURFACE_MODEL');
  for (let n = 0; n < inputs.length; n++) {
    const actual = triangleCoordinates(step, models[n]);
    const expected = expectedTriangles(inputs[n]);
    assert.equal(actual.length, expected.length);
    for (let t = 0; t < expected.length; t++) {
      for (let k = 0; k < 3; k++) close(actual[t][k], expected[t][k]);
    }
    const product = step.all('PRODUCT')[n];
    assert.equal(unquote(product.args[0]), inputs[n].id);
    assert.equal(unquote(product.args[1]), unquote(models[n].args[0]));
    const sdr = step.all('SHAPE_DEFINITION_REPRESENTATION')[n];
    const shape = step.get(references(sdr.args[0])[0], 'PRODUCT_DEFINITION_SHAPE');
    const pd = step.get(references(shape.args[2])[0], 'PRODUCT_DEFINITION');
    const formation = step.get(references(pd.args[2])[0], 'PRODUCT_DEFINITION_FORMATION');
    assert.equal(references(formation.args[2])[0], product.id);
    const representation = step.get(references(sdr.args[1])[0], 'MANIFOLD_SURFACE_SHAPE_REPRESENTATION');
    assert.deepEqual(references(representation.args[1]), [models[n].id]);
    assert.deepEqual(inputs[n].positions, originals[n].positions);
    assert.deepEqual(inputs[n].index, originals[n].index ?? null);
    assert.deepEqual(inputs[n].matrixCAD, originals[n].matrix);
  }
  assert.match(text, /SI_UNIT\(\.MILLI\.,\.METRE\.\)/);
  assert.equal(result.report.entities, step.records.size);
  assert.equal(result.report.outputBytes, Buffer.byteLength(text));
  assert.equal(result.blob.size, result.report.outputBytes);
  assert.equal(result.report.degenerateOmissions, 0);
  assert.equal(result.report.degenerateRejected, 0);
  assert.equal(result.report.openShells, 14);
});

test('geometry: RGB and opacity follow each model through AP214 draughting presentation graph', async () => {
  const inputs = [box({ opacity: 0 }), detached(), box({ id: 'opaque', opacity: 1 })];
  const { blob } = await writeSurfaceStep(inputs);
  const step = parse(await blob.text());
  for (let i = 0; i < inputs.length; i++) {
    const presentation = step.all('DRAUGHTING_MODEL')[i];
    const styled = step.get(references(presentation.args[1])[0], 'STYLED_ITEM');
    assert.equal(references(styled.args[2])[0], step.all('SHELL_BASED_SURFACE_MODEL')[i].id);
    const assignment = step.get(references(styled.args[1])[0], 'PRESENTATION_STYLE_ASSIGNMENT');
    const usage = step.get(references(assignment.args[0])[0], 'SURFACE_STYLE_USAGE');
    assert.equal(usage.args[0], '.BOTH.');
    const side = step.get(references(usage.args[1])[0], 'SURFACE_SIDE_STYLE');
    const styles = references(side.args[1]);
    const rendering = step.get(styles[1], 'SURFACE_STYLE_RENDERING_WITH_PROPERTIES');
    const colour = step.get(references(rendering.args[1])[0], 'COLOUR_RGB');
    assert.deepEqual(colour.args.slice(1).map(Number), inputs[i].rgb);
    const transparent = step.get(references(rendering.args[2])[0], 'SURFACE_STYLE_TRANSPARENT');
    assert.equal(Number(transparent.args[0]), 1 - inputs[i].opacity);
    const fill = step.get(styles[0], 'SURFACE_STYLE_FILL_AREA');
    const area = step.get(references(fill.args[0])[0], 'FILL_AREA_STYLE');
    const fillColour = step.get(references(area.args[1])[0], 'FILL_AREA_STYLE_COLOUR');
    assert.equal(references(fillColour.args[1])[0], colour.id);
  }
});

test('geometry: reversing winding reverses the explicit plane normal', async () => {
  const input = box({ index: new Uint16Array([0, 2, 1]) });
  const reversed = box({ id: 'reversed', index: new Uint32Array([0, 1, 2]) });
  const step = parse(await (await writeSurfaceStep([input, reversed])).blob.text());
  for (const model of step.all('SHELL_BASED_SURFACE_MODEL')) triangleCoordinates(step, model);
  const normals = step.all('AXIS2_PLACEMENT_3D').map(placement => {
    const direction = step.get(references(placement.args[2])[0], 'DIRECTION');
    return fields(direction.args[1].slice(1, -1)).map(Number);
  });
  close(normals[0], normals[1].map(value => -value), 1e-12);
});

test('geometry: stable unique labels, Unicode and STEP injection escaping', async () => {
  const nasty = "same');#987654=FAKE('name\\\n日本語😀";
  const a = box({ id: "x:'\\#65", name: nasty });
  const b = detached({ id: 'other', name: nasty });
  const forward = await writeSurfaceStep([a, b]);
  const reverse = await writeSurfaceStep([b, a]);
  const labelMap = result => new Map(result.report.parts.map(p => [p.id, p.label]));
  assert.deepEqual(labelMap(forward), labelMap(reverse));
  assert.notEqual(forward.report.parts[0].label, forward.report.parts[1].label);
  const step = parse(await forward.blob.text());
  assert.equal(step.all('PRODUCT').length, 2);
  for (let i = 0; i < 2; i++) {
    assert.equal(unquote(step.all('PRODUCT')[i].args[0]), [a, b][i].id);
    assert.equal(unquote(step.all('PRODUCT')[i].args[1]), forward.report.parts[i].label);
  }
  assert.equal(step.records.has(987654), false);
});

test('geometry: tiny finite coordinates and RGB use round-trip non-exponential numbers', async () => {
  const positions = new Float32Array([0,0,0, 1e-30,0,0, 0,1e-30,0]);
  const input = detached({ positions, matrixCAD: matrix([0, 0, 0]), rgb: [1e-200, 1e-25, 1] });
  const step = parse(await (await writeSurfaceStep([input])).blob.text());
  const coords = triangleCoordinates(step, step.all('SHELL_BASED_SURFACE_MODEL')[0]);
  assert.equal(coords[0][1][0], s * positions[3]);
  assert.ok(coords[0][2][2] > 0);
  assert.deepEqual(step.all('COLOUR_RGB')[0].args.slice(1).map(Number), input.rgb);
});

test('geometry: exact decimal opacity complement, including subnormal values', async () => {
  for (const opacity of [0.8, 1e-200, Number.MIN_VALUE, 0.9999999999999999]) {
    const { blob, report } = await writeSurfaceStep([box({ opacity })]);
    const step = parse(await blob.text());
    const transparency = step.all('SURFACE_STYLE_TRANSPARENT')[0].args[0];
    assert.match(transparency, /^0\.\d+$/);
    const digits = transparency.slice(2);
    // Recover opacity using decimal integers, independently of writer subtraction.
    const numerator = 10n ** BigInt(digits.length) - BigInt(digits);
    const recovered = Number('0.' + numerator.toString().padStart(digits.length, '0'));
    assert.equal(recovered, opacity);
    assert.equal(report.parts[0].opacity, opacity);
  }
});

test('geometry: AP214 entity vocabulary and arities exclude non-schema shaded representations', async () => {
  // Reviewed against STEPcode's AP214E3_2010.exp. This is a bounded structural
  // regression for the emitted subset, NOT a full EXPRESS conformance checker.
  const arities = new Map(Object.entries({
    APPLICATION_CONTEXT: 1, APPLICATION_PROTOCOL_DEFINITION: 4, PRODUCT_CONTEXT: 3,
    PRODUCT_DEFINITION_CONTEXT: 3, PRODUCT: 4, PRODUCT_DEFINITION_FORMATION: 3,
    PRODUCT_DEFINITION: 4, PRODUCT_DEFINITION_SHAPE: 3, CARTESIAN_POINT: 2,
    POLY_LOOP: 2, FACE_OUTER_BOUND: 3, FACE_SURFACE: 4, OPEN_SHELL: 2,
    DIRECTION: 2, AXIS2_PLACEMENT_3D: 4, PLANE: 2,
    SHELL_BASED_SURFACE_MODEL: 2, MANIFOLD_SURFACE_SHAPE_REPRESENTATION: 3,
    SHAPE_DEFINITION_REPRESENTATION: 2, COLOUR_RGB: 4, FILL_AREA_STYLE_COLOUR: 2,
    FILL_AREA_STYLE: 2, SURFACE_STYLE_FILL_AREA: 1, SURFACE_STYLE_TRANSPARENT: 1,
    SURFACE_STYLE_RENDERING_WITH_PROPERTIES: 3, SURFACE_SIDE_STYLE: 2,
    SURFACE_STYLE_USAGE: 2, PRESENTATION_STYLE_ASSIGNMENT: 1, STYLED_ITEM: 3,
    DRAUGHTING_MODEL: 3,
  }));
  const step = parse(await (await writeSurfaceStep([box(), detached()])).blob.text());
  for (const record of step.records.values()) {
    if (record.type === 'COMPLEX') continue;
    assert.ok(arities.has(record.type), `entity ${record.type} not in reviewed AP214 subset`);
    assert.equal(record.args.length, arities.get(record.type), record.type);
  }
  assert.equal(step.all('DRAUGHTING_MODEL').length, 2);
  assert.equal(step.all('MECHANICAL_DESIGN_GEOMETRIC_PRESENTATION_REPRESENTATION').length, 0);
});

test('geometry: Float32/Float64 matrices with small numerical rotation residual are accepted', async () => {
  for (const Type of [Float32Array, Float64Array]) {
    const result = await writeSurfaceStep([box({ matrixCAD: new Type(matrix()) })]);
    assert.equal(result.triangles, 12);
  }
  const m = matrix();
  m[0] *= 1 + 1e-8;
  assert.equal((await writeSurfaceStep([box({ matrixCAD: m })])).triangles, 12);
});

test('validation: malformed arrays, labels, materials, buffers and indices reject', async t => {
  const cases = [
    ['empty instances', () => [], 'INVALID_INPUT'],
    ['nonarray instances', () => ({}), 'INVALID_INPUT'],
    ['null instance', () => [null], 'INVALID_INPUT'],
    ['hole instance', () => new Array(1), 'INVALID_INPUT'],
    ['duplicate ids', () => [box(), box()], 'DUPLICATE_ID'],
    ['missing id', () => [box({ id: undefined })], 'INVALID_LABEL'],
    ['numeric id', () => [box({ id: 3 })], 'INVALID_LABEL'],
    ['long name', () => [box({ name: 'x'.repeat(1025) })], 'INVALID_LABEL'],
    ['unpaired Unicode', () => [box({ name: '\ud800' })], 'INVALID_LABEL'],
    ['plain positions', () => [box({ positions: [0,0,0] })], 'INVALID_ARRAY'],
    ['float64 positions', () => [box({ positions: new Float64Array(9) })], 'INVALID_ARRAY'],
    ['empty positions', () => [box({ positions: new Float32Array() })], 'INVALID_ARRAY'],
    ['incomplete xyz', () => [box({ positions: new Float32Array(10) })], 'INVALID_ARRAY'],
    ['incomplete nonindexed triangle', () => [box({ positions: new Float32Array(12), index: null })], 'INVALID_ARRAY'],
    ['missing index', () => [box({ index: undefined })], 'INVALID_ARRAY'],
    ['plain indices', () => [box({ index: [0,1,2] })], 'INVALID_ARRAY'],
    ['float indices', () => [box({ index: new Float32Array([0,1.5,2]) })], 'INVALID_ARRAY'],
    ['signed indices', () => [box({ index: new Int32Array([-1,1,2]) })], 'INVALID_ARRAY'],
    ['empty indices', () => [box({ index: new Uint16Array() })], 'INVALID_ARRAY'],
    ['incomplete index triple', () => [box({ index: new Uint32Array([0,1]) })], 'INVALID_ARRAY'],
    ['out of range', () => [box({ index: new Uint16Array([0,1,8]) })], 'INVALID_INDEX'],
    ['repeated index', () => [box({ index: new Uint16Array([0,0,2]) })], 'INVALID_INDEX'],
    ['unsigned wrapped negative', () => [box({ index: new Uint32Array([0,1,-1]) })], 'INVALID_INDEX'],
    ['NaN position', () => { const b = box(); b.positions[0] = NaN; return [b]; }, 'NONFINITE'],
    ['infinite position', () => { const b = box(); b.positions[0] = Infinity; return [b]; }, 'NONFINITE'],
    ['unused NaN position', () => { const b = box({ index: new Uint16Array([0,1,2]) }); b.positions[23] = NaN; return [b]; }, 'NONFINITE'],
    ['infinite opacity', () => [box({ opacity: Infinity })], 'INVALID_MATERIAL'],
    ['negative opacity', () => [box({ opacity: -0.1 })], 'INVALID_MATERIAL'],
    ['opacity too high', () => [box({ opacity: 1.01 })], 'INVALID_MATERIAL'],
    ['nonfinite RGB', () => [box({ rgb: [1,NaN,0] })], 'NONFINITE'],
    ['RGB range', () => [box({ rgb: [1.01,0,0] })], 'INVALID_MATERIAL'],
    ['short RGB', () => [box({ rgb: [0,0] })], 'INVALID_ARRAY'],
    ['sparse RGB', () => [box({ rgb: [0,,0] })], 'NONFINITE'],
    ['missing opacity', () => [box({ opacity: undefined })], 'INVALID_MATERIAL'],
    ['numeric string matrix', () => { const b = box(); b.matrixCAD[0] = '1000'; return [b]; }, 'NONFINITE'],
    ['short matrix', () => [box({ matrixCAD: matrix().slice(1) })], 'INVALID_ARRAY'],
    ['sparse matrix', () => [box({ matrixCAD: new Array(16) })], 'NONFINITE'],
  ];
  if (typeof SharedArrayBuffer === 'function') cases.push(
    ['shared positions', () => [box({ positions: new Float32Array(new SharedArrayBuffer(36)) })], 'INVALID_ARRAY'],
    ['shared indices', () => [box({ index: new Uint16Array(new SharedArrayBuffer(6)) })], 'INVALID_ARRAY'],
    ['shared matrix', () => [box({ matrixCAD: new Float64Array(new SharedArrayBuffer(128)) })], 'INVALID_ARRAY'],
  );
  if (typeof structuredClone === 'function') cases.push(['detached positions buffer', () => {
    const b = box(); structuredClone(b.positions.buffer, { transfer: [b.positions.buffer] }); return [b];
  }, 'INVALID_ARRAY']);
  if (new ArrayBuffer(0, { maxByteLength: 12 }).resizable) cases.push(['resizable buffer', () => [box({
    positions: new Float32Array(new ArrayBuffer(36, { maxByteLength: 72 })),
  })], 'INVALID_ARRAY']);
  for (const [name, input, code] of cases) await t.test(name, () => rejection(input(), code));
});

test('validation: all nonrigid, reflected, singular, perspective and nonfinite matrices reject', async t => {
  const variants = [
    ['identity scale', m => { m.splice(0, 16, 1,0,0,0, 0,1,0,0, 0,0,1,0, 0,0,0,1); }],
    ['uniform scale 2', m => { for (const i of [0,1,2,4,5,6,8,9,10]) m[i] *= 2; }],
    ['nonuniform scale', m => { m[0] *= 1.01; m[1] *= 1.01; }],
    ['subtle shear', m => { m[4] += 0.01; }],
    ['reflection', m => { m[0] *= -1; m[1] *= -1; m[2] *= -1; }],
    ['singular', m => { m[0] = m[1] = m[2] = 0; }],
    ['singular parallel axes', m => { m[4] = m[0]; m[5] = m[1]; m[6] = m[2]; }],
    ['perspective', m => { m[3] = 1e-15; }],
    ['bad homogeneous term', m => { m[15] = 0; }],
  ];
  for (const [name, mutate] of variants) await t.test(name, async () => {
    const m = matrix(); mutate(m); await rejection([box({ matrixCAD: m })], 'INVALID_MATRIX');
  });
  for (const value of [NaN, Infinity, -Infinity]) await t.test(`nonfinite ${value}`, () => {
    const m = matrix(); m[12] = value; return rejection([box({ matrixCAD: m })], 'NONFINITE');
  });
  await rejection([box({ matrixCAD: matrix([1e10, 0, 0]) })], 'COORDINATE_RANGE');
});

test('validation: original zero-area and transformed collapse reject whole export before output', async () => {
  const bad = detached({ positions: new Float32Array([0,0,0, 1,2,3, 2,4,6]) });
  await assert.rejects(writeSurfaceStep([box(), bad]), error => {
    assert.equal(error.code, 'DEGENERATE_TRIANGLE');
    assert.equal(error.instanceId, 'detached');
    assert.equal(error.triangleIndex, 0);
    assert.equal(error.report.validatedTriangles, 12);
    assert.equal(error.report.degenerateRejected, 1);
    assert.equal(error.report.degenerateOmissions, 0);
    assert.equal(error.report.emittedTriangles, 0);
    assert.equal(error.report.outputBytes, 0);
    return true;
  });
  await rejection([detached({ positions: new Float32Array([0,0,0, 0,0,0, 1,0,0]) })], 'DEGENERATE_TRIANGLE');
  await rejection([detached({ positions: new Float32Array([0,0,0, 1e-20,0,0, 0,1e-20,0]),
    matrixCAD: matrix([1e9, 1e9, 1e9]) })], 'DEGENERATE_TRIANGLE');
});

test('validation: triangle, aggregate position, exact byte budgets and non-raisable hard caps', async () => {
  await rejection([box(), detached()], 'TRIANGLE_BUDGET', { maxTriangles: 13 });
  await rejection([repeated(150001)], 'TRIANGLE_BUDGET');
  await rejection([box()], 'POSITION_BUDGET', { maxPositionComponents: 23 });
  await rejection([box({ positions: new Float32Array(1_000_002) })], 'POSITION_BUDGET');
  const a = box({ positions: new Float32Array(500001), index: new Uint16Array([0,1,2]) });
  await rejection([a, { ...a, id: 'second' }], 'POSITION_BUDGET');
  const baseline = await writeSurfaceStep([box()]);
  const exact = await writeSurfaceStep([box()], { maxOutputBytes: baseline.blob.size });
  assert.equal(exact.blob.size, baseline.blob.size);
  await rejection([box()], 'OUTPUT_BUDGET', { maxOutputBytes: baseline.blob.size - 1 });
  await rejection([box()], 'OUTPUT_BUDGET', { maxOutputBytes: 100 });
  for (const options of [{ maxTriangles: 150001 }, { maxOutputBytes: 80 * 1024 * 1024 + 1 },
    { maxPositionComponents: 1_000_001 }, { maxTriangles: 0 }, { maxOutputBytes: Infinity },
    { maxTriangles: 2.5 }, { signal: {} }, { onProgress: true }, { yieldControl: null }]) {
    await rejection([box()], 'INVALID_OPTION', options);
  }
  assert.deepEqual(STEP_SURFACE_LIMITS.triangles, 150000);
  assert.equal(STEP_SURFACE_LIMITS.outputBytes, 83886080);
});

test('cooperation: pre-cancel and cancellation from every phase never return a partial Blob', async () => {
  const already = new AbortController(); already.abort();
  let callbacks = 0;
  await rejection([box()], 'ABORTED', { signal: already.signal, onProgress() { callbacks++; } });
  assert.equal(callbacks, 0);
  for (const phase of ['preflight', 'validate', 'write', 'finalize', 'complete']) {
    const controller = new AbortController();
    let seen = false;
    await assert.rejects(writeSurfaceStep([box()], { signal: controller.signal,
      onProgress(p) { if (p.phase === phase) { seen = true; controller.abort(); } },
    }), error => error.name === 'AbortError' && error.code === 'ABORTED' && error.report.returnedBlob === false);
    assert.equal(seen, true, phase);
  }
});

test('cooperation: cancellation mid-validation and mid-write, with <=2048 triangle batches', async () => {
  for (const phase of ['validate', 'write']) {
    const controller = new AbortController();
    let previous = 0, stopped = 0;
    await assert.rejects(writeSurfaceStep([repeated(9000)], {
      signal: controller.signal,
      onProgress(p) {
        if (p.phase !== phase) return;
        const count = phase === 'write' ? p.emittedTriangles : p.validatedTriangles;
        assert.ok(count - previous <= 2048);
        previous = count;
        if (count >= 2048) { stopped = count; controller.abort(); }
      },
    }), error => {
      assert.equal(error.code, 'ABORTED');
      assert.ok(error.report.emittedTriangles < 9000);
      return true;
    });
    assert.ok(stopped >= 2048 && stopped < 9000);
  }
});

test('cooperation: validation of unused vertices yields to host tasks and cancels', async () => {
  const positions = new Float32Array(999999);
  positions.set([0,0,0, 1,0,0, 0,1,0]);
  const controller = new AbortController();
  let yields = 0;
  await rejection([box({ positions, index: new Uint16Array([0,1,2]) })], 'ABORTED', {
    signal: controller.signal,
    async yieldControl() { if (++yields === 4) controller.abort(); await hostTask(0); },
  });
  assert.equal(yields, 4);
});

test('cooperation: chunked Blob, host heartbeat and full multi-chunk geometry', async () => {
  let heartbeats = 0;
  const timer = setInterval(() => heartbeats++, 0);
  let result;
  try { result = await writeSurfaceStep([repeated(5000)]); }
  finally { clearInterval(timer); }
  assert.ok(heartbeats >= 5);
  assert.ok(result.report.blobChunks > 1);
  assert.ok(result.report.maxChunkBytes <= 32768);
  assert.equal(result.blob.size, result.report.outputBytes);
  const step = parse(await result.blob.text());
  assert.equal(step.all('FACE_SURFACE').length, 5000);
  assert.equal(triangleCoordinates(step, step.all('SHELL_BASED_SURFACE_MODEL')[0]).length, 5000);
});

test('cooperation: callback/scheduler exceptions propagate rather than return partial data', async () => {
  const sentinel = new Error('host callback failed');
  await assert.rejects(writeSurfaceStep([box()], { onProgress() { throw sentinel; } }), error => error === sentinel);
  await assert.rejects(writeSurfaceStep([box()], { yieldControl() { throw sentinel; } }), error => error === sentinel);
});

// Opt-in bounded synthetic workload at the parent's declared release shape.
// This is NOT coverage of the parent's approved source models or native gates.
test('capacity: 14 synthetic instances / 107916 triangles with streamed record counting',
  { skip: process.env.STEP_SURFACE_CAPACITY !== '1', timeout: 60000 }, async () => {
    const count = 107916;
    const inputs = Array.from({ length: 14 }, (_, i) => repeated(Math.floor(count / 14) + (i < count % 14 ? 1 : 0), {
      id: `capacity-${i}`, matrixCAD: matrix([i * 37.25, -i * 12.5, 101.75]),
      rgb: [i / 14, 0.25, 1 - i / 14], opacity: i / 13,
    }));
    const started = performance.now();
    let previousWrite = 0, yields = 0, sliceStart = performance.now(), maxSliceMS = 0;
    const result = await writeSurfaceStep(inputs, {
      onProgress(p) {
        if (p.phase === 'write') {
          assert.ok(p.emittedTriangles - previousWrite <= 2048);
          previousWrite = p.emittedTriangles;
        }
      },
      async yieldControl() {
        maxSliceMS = Math.max(maxSliceMS, performance.now() - sliceStart);
        yields++;
        await hostTask(0);
        sliceStart = performance.now();
      },
    });
    assert.equal(result.parts, 14);
    assert.equal(result.triangles, count);
    assert.ok(result.blob.size < 80 * 1024 * 1024);
    assert.ok(result.report.maxChunkBytes <= 32768);
    assert.ok(yields > count / 2048);
    const counts = { FACE_SURFACE: 0, POLY_LOOP: 0, FACE_OUTER_BOUND: 0, OPEN_SHELL: 0,
      PLANE: 0, AXIS2_PLACEMENT_3D: 0, DIRECTION: 0,
      CARTESIAN_POINT: 0, SHELL_BASED_SURFACE_MODEL: 0, PRODUCT: 0 };
    const decoder = new TextDecoder();
    let carry = '';
    for await (const chunk of result.blob.stream()) {
      const lines = (carry + decoder.decode(chunk, { stream: true })).split('\n');
      carry = lines.pop();
      for (const line of lines) {
        const match = /^#\d+=([A-Z_0-9]+)\(/.exec(line);
        if (match && Object.hasOwn(counts, match[1])) counts[match[1]]++;
      }
    }
    assert.equal(carry + decoder.decode(), '');
    for (const type of ['FACE_SURFACE', 'POLY_LOOP', 'FACE_OUTER_BOUND', 'OPEN_SHELL', 'PLANE', 'AXIS2_PLACEMENT_3D']) assert.equal(counts[type], count);
    assert.equal(counts.DIRECTION, count * 2);
    assert.equal(counts.CARTESIAN_POINT, count * 3);
    assert.equal(counts.SHELL_BASED_SURFACE_MODEL, 14);
    assert.equal(counts.PRODUCT, 14);
    console.log(JSON.stringify({ scope: 'synthetic-capacity-only', triangles: count, parts: result.parts,
      bytes: result.blob.size, blobChunks: result.report.blobChunks, maxChunkBytes: result.report.maxChunkBytes,
      yields, maxObservedWriterSliceMS: Math.round(maxSliceMS * 100) / 100,
      elapsedMS: Math.round(performance.now() - started), counts }));
  });
