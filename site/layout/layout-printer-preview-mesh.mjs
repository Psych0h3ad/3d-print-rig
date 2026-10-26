// Layout planning symbols only. No source models, hardware or I/O belong here.
const MAX_PARTS = 128;
const MAX_TRIANGLES = 2500;
const MAX_GEOMETRIES = 192; // Two stable arrays for each of the current 72 rows, plus headroom.
const MAX_BYTES = 16 * 1024 * 1024;
const fail = message => Object.assign(new Error(`Printer preview mesh: ${message}`), {
  code: 'LAYOUT_PRINTER_PREVIEW_MESH'
});
const bytesOf = geometry => Object.values(geometry.attributes).reduce((n, a) => n + a.array.byteLength, 0)
  + (geometry.index?.array.byteLength ?? 0);

/**
 * One renderer owns this cache until shutdown, including across scene resets.
 * Parts arrays AND their descriptors must stay unchanged while cached. Copies
 * and placement ghosts share the same returned geometry; removing a Mesh must
 * not dispose it. No material, opacity or wireframe is baked into the buffers.
 * sizeM is the world-axis bounding size, including for x/z cylinders.
 * Colors accept Three's sRGB strings/hex integers or already-linear Color objects;
 * omitted color uses the Layout default. Optional opacity is metadata only.
 * stats().bytes includes templates and every retained attribute/index buffer.
 */
export function createPrinterPreviewMeshCache(THREE) {
  let lookup = new WeakMap(), disposed = false, bytes = 0, triangles = 0;
  const retained = new Set(), templates = new Map();
  for (const [shape, template] of [
    ['box', new THREE.BoxGeometry(1, 1, 1)],
    ['cylinder', new THREE.CylinderGeometry(.5, .5, 1, 12, 1, false)]
  ]) {
    template.deleteAttribute('uv');
    template.clearGroups();
    templates.set(shape, template);
    bytes += bytesOf(template);
  }

  function describe(part) {
    if (!part || typeof part !== 'object' || Array.isArray(part)) throw fail('invalid part');
    if (part.wireframe !== undefined && part.wireframe !== false) throw fail('wireframe parts must be separate');
    if (part.opacity !== undefined && (!Number.isFinite(part.opacity) || part.opacity < 0 || part.opacity > 1))
      throw fail('invalid opacity metadata');
    const shape = part.shape === undefined ? 'box' : part.shape, axis = part.axis === undefined ? 'y' : part.axis;
    if (!templates.has(shape)) throw fail('unsupported shape');
    if (!['x', 'y', 'z'].includes(axis)) throw fail('unsupported axis');
    if (!Array.isArray(part.sizeM) || part.sizeM.length !== 3 || !part.sizeM.every(v => Number.isFinite(v) && v > 0)
      || !Array.isArray(part.centerM) || part.centerM.length !== 3 || !part.centerM.every(Number.isFinite))
      throw fail('invalid sizeM or centerM');
    // Finite doubles alone do not guarantee usable GPU (float32) coordinates.
    for (let i = 0; i < 3; i++) {
      const low = Math.fround(part.centerM[i] - part.sizeM[i] / 2);
      const high = Math.fround(part.centerM[i] + part.sizeM[i] / 2);
      if (!Number.isFinite(low) || !Number.isFinite(high) || !(high > low))
        throw fail('dimensions exceed float32 precision');
    }
    const input = part.color === undefined ? '#465258' : part.color;
    if (!(typeof input === 'string' && input.trim().length > 0 && input.length <= 128)
      && !(Number.isInteger(input) && input >= 0 && input <= 0xffffff) && !input?.isColor)
      throw fail('invalid color');
    // Unknown CSS strings leave the sentinel unchanged instead of silently white.
    const color = new THREE.Color(NaN, NaN, NaN).set(input);
    if (![color.r, color.g, color.b].every(v => Number.isFinite(v) && v >= 0 && v <= 1)) throw fail('invalid color');
    return {shape, axis, size: [...part.sizeM], center: [...part.centerM], color};
  }

  function geometry(parts) {
    if (disposed) throw fail('cache is disposed');
    if (!Array.isArray(parts) || parts.length > MAX_PARTS) throw fail('expected an array of at most 128 parts');
    const existing = lookup.get(parts);
    if (existing) return existing;
    if (retained.size >= MAX_GEOMETRIES) throw fail('geometry entry cap exceeded');
    // Array.from also validates sparse slots, which Array.prototype.map skips.
    const plan = Array.from(parts, describe);
    let vertexCount = 0, indexCount = 0;
    for (const part of plan) {
      const template = templates.get(part.shape);
      vertexCount += template.attributes.position.count;
      indexCount += template.index.count;
    }
    if (indexCount / 3 > MAX_TRIANGLES) throw fail('2500 triangle cap exceeded');
    const addedBytes = vertexCount * 3 * 4 * 3 + indexCount * 2;
    if (bytes + addedBytes > MAX_BYTES) throw fail('retained geometry byte cap exceeded');
    const position = new Float32Array(vertexCount * 3), normal = new Float32Array(vertexCount * 3);
    const color = new Float32Array(vertexCount * 3), index = new Uint16Array(indexCount);
    let vertexOffset = 0, indexOffset = 0;
    for (const part of plan) {
      const template = templates.get(part.shape), p = template.attributes.position, n = template.attributes.normal;
      const [sx, sy, sz] = part.size, [cx, cy, cz] = part.center;
      for (let i = 0; i < p.count; i++) {
        let x = p.getX(i), y = p.getY(i), z = p.getZ(i);
        let nx = n.getX(i), ny = n.getY(i), nz = n.getZ(i);
        // Proper rotations (determinant +1) preserve winding. Scale in world
        // axes afterwards; normals use the inverse scale, never the position scale.
        if (part.shape === 'cylinder' && part.axis === 'x') {
          [x, y] = [-y, x]; [nx, ny] = [-ny, nx];
        } else if (part.shape === 'cylinder' && part.axis === 'z') {
          [y, z] = [-z, y]; [ny, nz] = [-nz, ny];
        }
        const j = (vertexOffset + i) * 3;
        position[j] = cx + x * sx; position[j + 1] = cy + y * sy; position[j + 2] = cz + z * sz;
        nx /= sx; ny /= sy; nz /= sz;
        const length = Math.hypot(nx, ny, nz);
        normal[j] = nx / length; normal[j + 1] = ny / length; normal[j + 2] = nz / length;
        color[j] = part.color.r; color[j + 1] = part.color.g; color[j + 2] = part.color.b;
      }
      for (const i of template.index.array) index[indexOffset++] = vertexOffset + i;
      vertexOffset += p.count;
    }
    if (!position.every(Number.isFinite) || !normal.every(Number.isFinite)) throw fail('nonfinite GPU coordinates');
    // Translation/quantization can still collapse cylinder edges despite valid
    // bounding extents. Reject such triangles before retaining any new resource.
    for (let i = 0; i < index.length; i += 3) {
      const a = index[i] * 3, b = index[i + 1] * 3, c = index[i + 2] * 3;
      const ux = position[b] - position[a], uy = position[b + 1] - position[a + 1], uz = position[b + 2] - position[a + 2];
      const vx = position[c] - position[a], vy = position[c + 1] - position[a + 1], vz = position[c + 2] - position[a + 2];
      const nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx;
      const facing = nx * (normal[a] + normal[b] + normal[c])
        + ny * (normal[a + 1] + normal[b + 1] + normal[c + 1])
        + nz * (normal[a + 2] + normal[b + 2] + normal[c + 2]);
      if (!(Math.hypot(nx, ny, nz) > 0) || !(facing > 0))
        throw fail('triangle collapsed or reversed at float32 precision');
    }
    const merged = new THREE.BufferGeometry();
    merged.setAttribute('position', new THREE.BufferAttribute(position, 3));
    merged.setAttribute('normal', new THREE.BufferAttribute(normal, 3));
    merged.setAttribute('color', new THREE.BufferAttribute(color, 3));
    merged.setIndex(new THREE.BufferAttribute(index, 1));
    merged.computeBoundingBox();
    if (!vertexCount) { merged.boundingBox.min.set(0, 0, 0); merged.boundingBox.max.set(0, 0, 0); }
    merged.computeBoundingSphere();
    lookup.set(parts, merged); retained.add(merged); bytes += addedBytes; triangles += indexCount / 3;
    return merged;
  }

  function dispose() {
    if (disposed) return;
    disposed = true;
    for (const entry of retained) entry.dispose();
    for (const template of templates.values()) template.dispose();
    retained.clear(); templates.clear(); lookup = new WeakMap(); bytes = triangles = 0;
  }

  function stats() {
    return {bytes, geometries: retained.size, templates: templates.size, triangles, disposed,
      maxBytes: MAX_BYTES, maxGeometries: MAX_GEOMETRIES, maxTriangles: MAX_TRIANGLES, maxParts: MAX_PARTS};
  }
  return Object.freeze({geometry, dispose, stats});
}
