/**
 * Dependency-free browser ES module. Accepts ONLY already admitted scene instances.
 * Source admission, hashing, licenses, scene snapshots and UI belong to the caller.
 * No fetch, file access, native CAD, global scene state, solids or healing.
 */
export const STEP_SURFACE_LIMITS = Object.freeze({
  triangles: 150_000,
  outputBytes: 80 * 1024 * 1024,
  positionComponents: 1_000_000, // Sum of positions.length, NOT the vertex count.
  coordinateMM: 1_000_000_000,
  labelCodeUnits: 1024,
  chunkBytes: 32 * 1024,
  workPerYield: 2048,
  timeSliceMS: 8,
});

export const SURFACE_STEP_NOTICE =
  'Faceted surface STEP from admitted mesh triangles; not native CAD solids; ' +
  'not manufacturing certification. No stitching, healing or solid reconstruction.';

export class StepSurfaceWriterError extends Error {
  constructor(code, message, details = {}) {
    super(message);
    this.name = code === 'ABORTED' ? 'AbortError' : 'StepSurfaceWriterError';
    this.code = code;
    Object.assign(this, details);
  }
}

const fail = (code, message, details) => {
  throw new StepSurfaceWriterError(code, message, details);
};
const clock = () => globalThis.performance?.now() ?? Date.now();
const yieldToHost = () => new Promise(resolve => setTimeout(resolve, 0));
const tag = value => Object.prototype.toString.call(value);

function fixedBuffer(view, context) {
  if (tag(view.buffer) !== '[object ArrayBuffer]' || view.buffer.resizable === true) {
    fail('INVALID_ARRAY', `${context}: shared/resizable buffers are not accepted.`);
  }
}

function numericSequence(value, length, context) {
  const array = Array.isArray(value);
  const typed = ArrayBuffer.isView(value) &&
    (tag(value) === '[object Float32Array]' || tag(value) === '[object Float64Array]');
  if ((!array && !typed) || value.length !== length) {
    fail('INVALID_ARRAY', `${context}: expected exactly ${length} numeric entries.`);
  }
  if (typed) fixedBuffer(value, context);
  const copy = new Array(length);
  for (let i = 0; i < length; i++) {
    if (!Number.isFinite(value[i])) fail('NONFINITE', `${context}[${i}] must be finite.`);
    copy[i] = value[i];
  }
  return copy;
}

function matrix1000(value, instanceId) {
  const m = numericSequence(value, 16, `matrixCAD (${instanceId})`);
  // Exact affine last row: near-zero perspective terms must not be silently lost.
  if (m[3] !== 0 || m[7] !== 0 || m[11] !== 0 || m[15] !== 1) {
    fail('INVALID_MATRIX', 'matrixCAD must be affine, column-major, with last row 0,0,0,1.', { instanceId });
  }
  const x = [m[0] / 1000, m[1] / 1000, m[2] / 1000];
  const y = [m[4] / 1000, m[5] / 1000, m[6] / 1000];
  const z = [m[8] / 1000, m[9] / 1000, m[10] / 1000];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const det = x[0] * (y[1] * z[2] - y[2] * z[1]) -
    x[1] * (y[0] * z[2] - y[2] * z[0]) +
    x[2] * (y[0] * z[1] - y[1] * z[0]);
  // 1e-6 on the normalized Gram matrix accommodates Float32 rotation residuals.
  const tolerance = 1e-6;
  if (![dot(x, x), dot(y, y), dot(z, z)].every(n => Math.abs(n - 1) <= tolerance) ||
      ![dot(x, y), dot(x, z), dot(y, z)].every(n => Math.abs(n) <= tolerance) ||
      !Number.isFinite(det) || Math.abs(det - 1) > 3 * tolerance) {
    fail('INVALID_MATRIX', 'matrixCAD requires a proper rigid rotation times uniform +1000; no reflection, scale, skew or singular matrix.', { instanceId });
  }
  return m;
}

function checkedLabel(value, context, allowEmpty = false) {
  if (typeof value !== 'string' || (!allowEmpty && value.length === 0) ||
      value.length > STEP_SURFACE_LIMITS.labelCodeUnits) {
    fail('INVALID_LABEL', `${context}: expected ${allowEmpty ? '0' : '1'}..1024 UTF-16 code units.`);
  }
  for (let i = 0; i < value.length; i++) {
    const c = value.charCodeAt(i);
    if (c >= 0xd800 && c <= 0xdbff) {
      const next = value.charCodeAt(++i);
      if (!(next >= 0xdc00 && next <= 0xdfff)) fail('INVALID_LABEL', `${context}: unpaired surrogate.`);
    } else if (c >= 0xdc00 && c <= 0xdfff) {
      fail('INVALID_LABEL', `${context}: unpaired surrogate.`);
    }
  }
  return value;
}

// All generated text is ASCII, so character counts equal UTF-8 byte counts.
function stepString(value) {
  let s = "'";
  for (const c of value) {
    const n = c.codePointAt(0);
    if (c === "'") s += "''";
    else if (c === '\\') s += '\\\\';
    else if (n >= 32 && n <= 126) s += c;
    else if (n <= 0xffff) s += `\\X2\\${n.toString(16).toUpperCase().padStart(4, '0')}\\X0\\`;
    else s += `\\X4\\${n.toString(16).toUpperCase().padStart(8, '0')}\\X0\\`;
  }
  return s + "'";
}

// Expand Number's shortest round-trip representation without fixed-decimal rounding.
// Finite doubles need at most 343 characters here. No e/E, NaN or Infinity tokens.
function stepReal(n) {
  if (!Number.isFinite(n)) fail('NONFINITE', 'Nonfinite output number.');
  if (n === 0) return '0.';
  const sign = n < 0 ? '-' : '';
  const raw = Math.abs(n).toString();
  const e = raw.indexOf('e');
  if (e < 0) return sign + raw + (raw.includes('.') ? '' : '.');
  const mantissa = raw.slice(0, e);
  const digits = mantissa.replace('.', '');
  const point = (mantissa.indexOf('.') < 0 ? mantissa.length : mantissa.indexOf('.')) + Number(raw.slice(e + 1));
  if (point <= 0) return sign + '0.' + '0'.repeat(-point) + digits;
  if (point >= digits.length) return sign + digits + '0'.repeat(point - digits.length) + '.';
  return sign + digits.slice(0, point) + '.' + digits.slice(point);
}

// Subtract the serialized opacity from decimal 1 without floating subtraction.
// For example .8 -> .2, and 1e-200 stays encoded instead of rounding to zero
// opacity. A downstream double-only importer can still round its transparency.
function stepTransparency(opacity) {
  if (opacity === 0) return '1.';
  if (opacity === 1) return '0.';
  const fraction = stepReal(opacity).slice(2);
  const digits = new Array(fraction.length);
  let carry = 1;
  for (let i = fraction.length - 1; i >= 0; i--) {
    const n = 9 - Number(fraction[i]) + carry;
    digits[i] = String(n % 10);
    carry = n === 10 ? 1 : 0;
  }
  return '0.' + digits.join('');
}

class ChunkWriter {
  constructor(maxBytes) {
    this.maxBytes = maxBytes;
    this.bytes = 0;
    this.next = 1;
    this.pending = '';
    this.blobParts = [];
    this.maxChunkBytes = 0;
  }
  append(text) {
    if (this.bytes + text.length > this.maxBytes) {
      fail('OUTPUT_BUDGET', `STEP output exceeds ${this.maxBytes} bytes.`, { outputBytes: this.bytes, attemptedBytes: this.bytes + text.length });
    }
    this.bytes += text.length;
    let offset = 0;
    while (offset < text.length) {
      const take = Math.min(text.length - offset, STEP_SURFACE_LIMITS.chunkBytes - this.pending.length);
      this.pending += text.slice(offset, offset + take);
      offset += take;
      if (this.pending.length === STEP_SURFACE_LIMITS.chunkBytes) this.flush();
    }
  }
  flush() {
    if (!this.pending) return;
    this.maxChunkBytes = Math.max(this.maxChunkBytes, this.pending.length);
    this.blobParts.push(new Blob([this.pending]));
    this.pending = '';
  }
  entity(type, args) {
    const id = this.next++;
    this.append(`#${id}=${type}(${args});\n`);
    return id;
  }
  startShellModel(label) {
    const id = this.next++;
    this.append(`#${id}=SHELL_BASED_SURFACE_MODEL(${label},(\n`);
    return id;
  }
  finish() {
    this.flush();
    return new Blob(this.blobParts, { type: 'model/step' });
  }
}

function reducedLimit(value, name) {
  const hard = STEP_SURFACE_LIMITS[name];
  if (value === undefined) return hard;
  if (!Number.isSafeInteger(value) || value < 1 || value > hard) {
    fail('INVALID_OPTION', `${name} must be an integer in 1..${hard}; hard caps cannot be raised.`);
  }
  return value;
}

function degenerate(points, a, b, c) {
  const ax = points[a], ay = points[a + 1], az = points[a + 2];
  const ux = points[b] - ax, uy = points[b + 1] - ay, uz = points[b + 2] - az;
  const vx = points[c] - ax, vy = points[c + 1] - ay, vz = points[c + 2] - az;
  const us = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz));
  const vs = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
  if (us === 0 || vs === 0) return true;
  // Normalize independently to avoid cross-product overflow/underflow. No area cutoff.
  const x = uy / us * (vz / vs) - uz / us * (vy / vs);
  const y = uz / us * (vx / vs) - ux / us * (vz / vs);
  const z = ux / us * (vy / vs) - uy / us * (vx / vs);
  return x === 0 && y === 0 && z === 0;
}

function triangleAxes(points, a, b, c) {
  const ux = points[b] - points[a], uy = points[b + 1] - points[a + 1], uz = points[b + 2] - points[a + 2];
  const vx = points[c] - points[a], vy = points[c + 1] - points[a + 1], vz = points[c + 2] - points[a + 2];
  const us = Math.max(Math.abs(ux), Math.abs(uy), Math.abs(uz));
  const vs = Math.max(Math.abs(vx), Math.abs(vy), Math.abs(vz));
  const nx = uy / us * (vz / vs) - uz / us * (vy / vs);
  const ny = uz / us * (vx / vs) - ux / us * (vz / vs);
  const nz = ux / us * (vy / vs) - uy / us * (vx / vs);
  const normalLength = Math.hypot(nx, ny, nz);
  const edgeLength = Math.hypot(ux, uy, uz);
  if (!(normalLength > 0) || !(edgeLength > 0)) fail('DEGENERATE_TRIANGLE', 'Cannot construct a plane for a degenerate triangle.');
  const normal = [nx / normalLength, ny / normalLength, nz / normalLength];
  // Reproject only the plane's reference direction. The origin, plane normal
  // and all triangle coordinates stay unchanged, including very thin facets.
  const edge = [ux / edgeLength, uy / edgeLength, uz / edgeLength];
  const dot = edge.reduce((sum, value, i) => sum + value * normal[i], 0);
  const x = edge.map((value, i) => value - dot * normal[i]);
  const length = Math.hypot(...x);
  if (!(length > 0)) fail('DEGENERATE_TRIANGLE', 'Invalid triangle plane reference.');
  return { normal, x: x.map(value => value / length) };
}

/**
 * @param {Array<{id:string,name:string,positions:Float32Array,index:Uint16Array|Uint32Array|null,matrixCAD:Array<number>|Float32Array|Float64Array,rgb:Array<number>,opacity:number}>} instances
 * @param {{signal?:AbortSignal,onProgress?:(p:object)=>void,maxTriangles?:number,maxOutputBytes?:number,maxPositionComponents?:number,yieldControl?:()=>Promise<void>}} options
 * @returns {Promise<{blob:Blob,parts:number,triangles:number,report:object}>}
 *
 * Input buffers must remain unchanged until resolution (the parent owns snapshotting).
 * Shared/resizable buffers are rejected; validated data is copied in bounded loops.
 * yieldControl is an optional host-task scheduler, not a microtask-only scheduler.
 * Progress callbacks must be quick; they may abort the supplied signal.
 */
export async function writeSurfaceStep(instances, options = {}) {
  let writer;
  const report = {
    kind: 'faceted-open-shell-surface', schema: 'AUTOMOTIVE_DESIGN', units: 'mm',
    notice: SURFACE_STEP_NOTICE, inputInstances: 0, positionComponents: 0, vertices: 0,
    inputTriangles: 0, validatedTriangles: 0, emittedTriangles: 0,
    degenerateOmissions: 0, degenerateRejected: 0, completedInstances: 0,
  };
  try {
    if (!options || typeof options !== 'object' || Array.isArray(options)) fail('INVALID_OPTION', 'Options must be an object.');
    const { signal, onProgress, yieldControl = yieldToHost } = options;
    if (signal !== undefined && (!signal || typeof signal.aborted !== 'boolean' || typeof signal.addEventListener !== 'function')) {
      fail('INVALID_OPTION', 'signal must be an AbortSignal.');
    }
    if (onProgress !== undefined && typeof onProgress !== 'function') fail('INVALID_OPTION', 'onProgress must be a function.');
    if (typeof yieldControl !== 'function') fail('INVALID_OPTION', 'yieldControl must be a function.');
    const maxTriangles = reducedLimit(options.maxTriangles, 'triangles');
    const maxBytes = reducedLimit(options.maxOutputBytes, 'outputBytes');
    const maxPositions = reducedLimit(options.maxPositionComponents, 'positionComponents');
    const abort = () => {
      if (signal?.aborted) fail('ABORTED', 'STEP surface export cancelled.');
    };
    const progress = phase => {
      abort();
      onProgress?.({ phase, parts: report.inputInstances, triangles: report.inputTriangles,
        validatedTriangles: report.validatedTriangles, emittedTriangles: report.emittedTriangles,
        completedInstances: report.completedInstances, outputBytes: writer?.bytes ?? 0 });
      abort();
    };
    let work = 0;
    let sliceStart = clock();
    const due = () => {
      work++;
      return work >= STEP_SURFACE_LIMITS.workPerYield ||
        ((work & 15) === 0 && clock() - sliceStart >= STEP_SURFACE_LIMITS.timeSliceMS);
    };
    const pause = async phase => {
      progress(phase);
      await yieldControl();
      abort();
      work = 0;
      sliceStart = clock();
    };
    abort();
    if (typeof Blob !== 'function') fail('UNSUPPORTED_ENVIRONMENT', 'Blob is required.');
    if (!Array.isArray(instances) || !instances.length) fail('INVALID_INPUT', 'Expected a nonempty array of admitted instances.');
    if (instances.length > maxTriangles) fail('TRIANGLE_BUDGET', 'More instances than the triangle budget.');
    report.inputInstances = instances.length;
    const plans = [];
    const ids = new Set();
    await pause('preflight');
    for (let n = 0; n < instances.length; n++) {
      const input = instances[n];
      if (!input || typeof input !== 'object' || Array.isArray(input)) fail('INVALID_INPUT', `Instance ${n} must be an object.`);
      const id = checkedLabel(input.id, `Instance ${n} id`);
      const name = checkedLabel(input.name, `Instance ${id} name`, true);
      if (ids.has(id)) fail('DUPLICATE_ID', `Instance id ${id} is not unique.`, { instanceId: id });
      ids.add(id);
      const source = input.positions;
      const index = input.index;
      if (!ArrayBuffer.isView(source) || tag(source) !== '[object Float32Array]' ||
          source.length === 0 || source.length % 3 !== 0) {
        fail('INVALID_ARRAY', 'positions must be a nonempty complete Float32Array of XYZ triples.', { instanceId: id });
      }
      fixedBuffer(source, 'positions');
      if (index !== null) {
        if (!ArrayBuffer.isView(index) || !['[object Uint16Array]', '[object Uint32Array]'].includes(tag(index)) ||
            index.length === 0 || index.length % 3 !== 0) {
          fail('INVALID_ARRAY', 'index must be null or a nonempty complete Uint16Array/Uint32Array of triangle triples.', { instanceId: id });
        }
        fixedBuffer(index, 'index');
      } else if (source.length % 9 !== 0) {
        fail('INVALID_ARRAY', 'Nonindexed positions must contain complete triangles.', { instanceId: id });
      }
      const triangles = index === null ? source.length / 9 : index.length / 3;
      report.positionComponents += source.length;
      report.vertices += source.length / 3;
      report.inputTriangles += triangles;
      if (report.positionComponents > maxPositions) fail('POSITION_BUDGET', `positions.length total exceeds ${maxPositions}.`);
      if (report.inputTriangles > maxTriangles) fail('TRIANGLE_BUDGET', `Triangle count exceeds ${maxTriangles}.`);
      const rgb = numericSequence(input.rgb, 3, `rgb (${id})`);
      if (!rgb.every(c => c >= 0 && c <= 1) || !Number.isFinite(input.opacity) || input.opacity < 0 || input.opacity > 1) {
        fail('INVALID_MATERIAL', 'RGB and opacity must be finite numbers in [0,1].', { instanceId: id });
      }
      const m = matrix1000(input.matrixCAD, id);
      // Length-prefixed id makes labels injective, including adversarial separators.
      const label = `part[${id.length}]:${id} ${name}`;
      plans.push({ id, name, label, source, sourceIndex: index, m, rgb, opacity: input.opacity, triangles });
      if (due()) await pause('preflight');
    }
    await pause('validate');
    for (const p of plans) {
      const source = p.source;
      const m = p.m;
      const points = new Float64Array(source.length);
      for (let j = 0; j < source.length; j += 3) {
        const x = source[j], y = source[j + 1], z = source[j + 2];
        if (!Number.isFinite(x) || !Number.isFinite(y) || !Number.isFinite(z)) {
          fail('NONFINITE', 'Every position, including unused vertices, must be finite.', { instanceId: p.id, vertexIndex: j / 3 });
        }
        const xx = m[0] * x + m[4] * y + m[8] * z + m[12];
        const yy = m[1] * x + m[5] * y + m[9] * z + m[13];
        const zz = m[2] * x + m[6] * y + m[10] * z + m[14];
        if (![xx, yy, zz].every(v => Number.isFinite(v) && Math.abs(v) <= STEP_SURFACE_LIMITS.coordinateMM)) {
          fail('COORDINATE_RANGE', 'World CAD coordinates must be finite and within +/-1e9 mm.', { instanceId: p.id, vertexIndex: j / 3 });
        }
        points[j] = xx; points[j + 1] = yy; points[j + 2] = zz;
        if (due()) await pause('validate');
      }
      const index = p.sourceIndex === null ? null : new Uint32Array(p.triangles * 3);
      const vertexCount = points.length / 3;
      for (let t = 0; t < p.triangles; t++) {
        const j = t * 3;
        const a = index === null ? j : p.sourceIndex[j];
        const b = index === null ? j + 1 : p.sourceIndex[j + 1];
        const c = index === null ? j + 2 : p.sourceIndex[j + 2];
        if (![a, b, c].every(v => Number.isInteger(v) && v >= 0 && v < vertexCount) || a === b || b === c || a === c) {
          fail('INVALID_INDEX', 'Triangle indices must be in-range distinct integers.', { instanceId: p.id, triangleIndex: t });
        }
        // Reject BOTH original zero-area geometry and collapse after world placement.
        if (degenerate(source, a * 3, b * 3, c * 3) || degenerate(points, a * 3, b * 3, c * 3)) {
          report.degenerateRejected++;
          fail('DEGENERATE_TRIANGLE', 'Zero-area/collapsed triangle rejects the entire candidate; none are omitted.', { instanceId: p.id, triangleIndex: t });
        }
        if (index !== null) { index[j] = a; index[j + 1] = b; index[j + 2] = c; }
        report.validatedTriangles++;
        if (due()) await pause('validate');
      }
      p.points = points;
      p.index = index;
      delete p.source;
      delete p.sourceIndex;
    }
    await pause('write');
    writer = new ChunkWriter(maxBytes);
    writer.append('ISO-10303-21;\nHEADER;\n');
    writer.append(`FILE_DESCRIPTION((${stepString(SURFACE_STEP_NOTICE)}),'2;1');\n`);
    writer.append(`FILE_NAME('custom-faceted-surfaces.step','${new Date().toISOString()}',(''),(''),'step-surface-writer','step-surface-writer','');\n`);
    writer.append("FILE_SCHEMA(('AUTOMOTIVE_DESIGN'));\nENDSEC;\nDATA;\n");
    const entity = (type, args) => writer.entity(type, args);
    const app = entity('APPLICATION_CONTEXT', "'core data for automotive mechanical design processes'");
    entity('APPLICATION_PROTOCOL_DEFINITION', `'international standard','automotive_design',2000,#${app}`);
    const productContext = entity('PRODUCT_CONTEXT', `'',#${app},'mechanical'`);
    const definitionContext = entity('PRODUCT_DEFINITION_CONTEXT', `'part definition',#${app},'design'`);
    const lengthUnit = writer.next++;
    writer.append(`#${lengthUnit}=(LENGTH_UNIT() NAMED_UNIT(*) SI_UNIT(.MILLI.,.METRE.));\n`);
    const angleUnit = writer.next++;
    writer.append(`#${angleUnit}=(NAMED_UNIT(*) PLANE_ANGLE_UNIT() SI_UNIT($,.RADIAN.));\n`);
    const solidAngleUnit = writer.next++;
    writer.append(`#${solidAngleUnit}=(NAMED_UNIT(*) SI_UNIT($,.STERADIAN.) SOLID_ANGLE_UNIT());\n`);
    const context = writer.next++;
    writer.append(`#${context}=(GEOMETRIC_REPRESENTATION_CONTEXT(3) GLOBAL_UNIT_ASSIGNED_CONTEXT((#${lengthUnit},#${angleUnit},#${solidAngleUnit})) REPRESENTATION_CONTEXT('','3D mm faceted surfaces'));\n`);
    const partReports = [];
    for (const p of plans) {
      const label = stepString(p.label);
      const product = entity('PRODUCT', `${stepString(p.id)},${label},${stepString(SURFACE_STEP_NOTICE)},(#${productContext})`);
      const formation = entity('PRODUCT_DEFINITION_FORMATION', `'','',#${product}`);
      const definition = entity('PRODUCT_DEFINITION', `'design','faceted mesh surface',#${formation},#${definitionContext}`);
      const shape = entity('PRODUCT_DEFINITION_SHAPE', `'','',#${definition}`);
      const first = writer.next;
      for (let t = 0; t < p.triangles; t++) {
        const j = t * 3;
        const refs = [];
        const offsets = [];
        for (let k = 0; k < 3; k++) {
          const offset = (p.index === null ? j + k : p.index[j + k]) * 3;
          offsets.push(offset);
          refs.push(entity('CARTESIAN_POINT', `'',(${stepReal(p.points[offset])},${stepReal(p.points[offset + 1])},${stepReal(p.points[offset + 2])})`));
        }
        const loop = entity('POLY_LOOP', `'',(#${refs[0]},#${refs[1]},#${refs[2]})`);
        const bound = entity('FACE_OUTER_BOUND', `'',#${loop},.T.`);
        const axes = triangleAxes(p.points, offsets[0], offsets[1], offsets[2]);
        const normal = entity('DIRECTION', `'',(${axes.normal.map(stepReal).join(',')})`);
        const x = entity('DIRECTION', `'',(${axes.x.map(stepReal).join(',')})`);
        const placement = entity('AXIS2_PLACEMENT_3D', `'',#${refs[0]},#${normal},#${x}`);
        const plane = entity('PLANE', `'',#${placement}`);
        const face = entity('FACE_SURFACE', `'',(#${bound}),#${plane},.T.`);
        entity('OPEN_SHELL', `'',(#${face})`);
        report.emittedTriangles++;
        if (due()) await pause('write');
      }
      // Each one-face shell is connected and open, even for disconnected/nonmanifold
      // input meshes. Do not claim a triangle soup is one stitched connected shell.
      const model = writer.startShellModel(label);
      for (let t = 0; t < p.triangles; t++) {
        writer.append(`${t ? ',' : ''}#${first + t * 11 + 10}${(t & 31) === 31 ? '\n' : ''}`);
        if (due()) await pause('write');
      }
      writer.append('));\n');
      // WR5 requires FACE_SURFACE for every face in every shell boundary.
      const representation = entity('MANIFOLD_SURFACE_SHAPE_REPRESENTATION', `${label},(#${model}),#${context}`);
      entity('SHAPE_DEFINITION_REPRESENTATION', `#${shape},#${representation}`);
      const colour = entity('COLOUR_RGB', `'',${p.rgb.map(stepReal).join(',')}`);
      const fillColour = entity('FILL_AREA_STYLE_COLOUR', `'',#${colour}`);
      const fill = entity('FILL_AREA_STYLE', `'',(#${fillColour})`);
      const surfaceFill = entity('SURFACE_STYLE_FILL_AREA', `#${fill}`);
      const transparency = entity('SURFACE_STYLE_TRANSPARENT', stepTransparency(p.opacity));
      const rendering = entity('SURFACE_STYLE_RENDERING_WITH_PROPERTIES', `.NORMAL_SHADING.,#${colour},(#${transparency})`);
      const side = entity('SURFACE_SIDE_STYLE', `'',(#${surfaceFill},#${rendering})`);
      const usage = entity('SURFACE_STYLE_USAGE', `.BOTH.,#${side}`);
      const assignment = entity('PRESENTATION_STYLE_ASSIGNMENT', `(#${usage})`);
      const styled = entity('STYLED_ITEM', `'',(#${assignment}),#${model}`);
      // AUTOMOTIVE_DESIGN has no MECHANICAL_DESIGN_SHADED_PRESENTATION_REPRESENTATION.
      // Its geometric presentation subtype also forbids rendering styles (WR9).
      // AP214 DRAUGHTING_MODEL admits this STYLED_ITEM + rendering/fill graph.
      entity('DRAUGHTING_MODEL', `${label},(#${styled}),#${context}`);
      partReports.push({ id: p.id, name: p.name, label: p.label, triangles: p.triangles,
        rgb: p.rgb, opacity: p.opacity, product, representation, surfaceModel: model });
      report.completedInstances++;
      delete p.points;
      delete p.index;
      if (due()) await pause('write');
    }
    writer.append('ENDSEC;\nEND-ISO-10303-21;\n');
    await pause('finalize');
    const blob = writer.finish();
    progress('complete');
    return { blob, parts: plans.length, triangles: report.emittedTriangles, report: {
      ...report, outputBytes: writer.bytes, entities: writer.next - 1,
      cartesianPoints: report.emittedTriangles * 3, faces: report.emittedTriangles,
      faceSurfaces: report.emittedTriangles, planes: report.emittedTriangles,
      directions: report.emittedTriangles * 2, axisPlacements: report.emittedTriangles,
      openShells: report.emittedTriangles, shellBasedSurfaceModels: plans.length,
      products: plans.length, representations: plans.length,
      blobChunks: writer.blobParts.length, maxChunkBytes: writer.maxChunkBytes,
      parts: partReports,
    } };
  } catch (error) {
    if (error instanceof StepSurfaceWriterError) {
      error.report = { ...report, outputBytes: writer?.bytes ?? 0, returnedBlob: false };
    }
    throw error;
  }
}

export default writeSurfaceStep;
