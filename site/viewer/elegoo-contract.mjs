// Static reference contract. Product dimensions never define a motion range.
export function validateElegooMetadata(row, manifest, profile) {
  if (manifest?.machine_id !== row.id || profile?.machine_id !== row.id ||
      !Array.isArray(manifest.parts) || manifest.parts.length !== row.parts)
    throw Error('ELEGOO assembly identity mismatch');
  const keys = new Set();
  for (const part of manifest.parts) {
    if (typeof part.key !== 'string' || !part.key || keys.has(part.key))
      throw Error('Invalid or duplicate ELEGOO part identity');
    keys.add(part.key);
  }
  const source = profile.source;
  if (source?.url !== row.source.url || source.revision !== row.source.revision ||
      source.source_file_sha256 !== row.source.sha256 || source.license !== row.source.license)
    throw Error('ELEGOO source revision mismatch');
  if (profile.motion_preview !== false || ['x', 'y', 'z'].some(axis =>
    !Array.isArray(profile.axes?.[axis]) || profile.axes[axis].length !== 2 ||
    profile.axes[axis].some(value => value !== 0))) throw Error('ELEGOO static profile changed');
  return keys;
}

// Inspect only the checksum-verified GLB being loaded. Reject external resources
// before GLTFLoader can issue any unpinned buffer or image requests.
export function validateElegooGLB(bytes, expectedKeys) {
  const view = new DataView(bytes.buffer, bytes.byteOffset, bytes.byteLength);
  if (bytes.byteLength < 20 || view.getUint32(0, true) !== 0x46546c67 ||
      view.getUint32(4, true) !== 2 || view.getUint32(8, true) !== bytes.byteLength)
    throw Error('Invalid ELEGOO GLB header');
  const length = view.getUint32(12, true);
  if (view.getUint32(16, true) !== 0x4e4f534a || length % 4 || length > bytes.byteLength - 20)
    throw Error('Invalid ELEGOO GLB metadata');
  const json = JSON.parse(new TextDecoder().decode(bytes.subarray(20, 20 + length)));
  if (json.asset?.version !== '2.0' || !Array.isArray(json.nodes) ||
      !Array.isArray(json.scenes) || !Array.isArray(json.meshes) || !json.meshes.length ||
      json.animations?.length || json.extensionsRequired?.length ||
      (json.buffers || []).some(buffer => buffer.uri != null) ||
      (json.images || []).length || (json.textures || []).length || (json.materials || []).length)
    throw Error('ELEGOO GLB source-color contract changed');
  const keys = new Set();
  for (const node of json.nodes) if (node.extras?.part_key != null) {
    const key = node.extras.part_key;
    if (typeof key !== 'string' || keys.has(key) || !expectedKeys.has(key))
      throw Error('Unexpected or duplicate ELEGOO GLB part');
    keys.add(key);
  }
  if (keys.size !== expectedKeys.size) throw Error('Missing ELEGOO GLB parts');
  const scene = json.scenes[json.scene ?? 0], visited = new Set(), reachableKeys = new Set();
  function visit(index, owner) {
    if (!Number.isSafeInteger(index) || !json.nodes[index] || visited.has(index))
      throw Error('Invalid ELEGOO GLB scene hierarchy');
    visited.add(index);
    const node = json.nodes[index], key = node.extras?.part_key ?? owner;
    if (node.extras?.part_key != null) reachableKeys.add(key);
    if (node.mesh != null && (!key || !json.meshes[node.mesh]))
      throw Error('Unbound ELEGOO mesh');
    for (const child of node.children || []) visit(child, key);
  }
  if (!Array.isArray(scene?.nodes)) throw Error('Missing ELEGOO GLB scene');
  for (const node of scene.nodes) visit(node, null);
  if (reachableKeys.size !== expectedKeys.size) throw Error('Detached ELEGOO GLB parts');
  return json;
}

export function validateElegooView(data, row) {
  const finite3 = value => Array.isArray(value) && value.length === 3 && value.every(Number.isFinite);
  if (data?.schema !== 'elegoo-static-view-v1' || data.machine !== row.id ||
      data.model_sha256 !== row.files['model.glb'].decoded_sha256 ||
      data.source_revision !== row.source.revision || typeof data.grid !== 'boolean' ||
      typeof data.dark !== 'boolean' || !finite3(data.camera?.position) ||
      !finite3(data.camera?.target) || !finite3(data.camera?.up) ||
      data.camera.up.every(value => value === 0)) throw Error('Incompatible ELEGOO saved view');
  const delta = data.camera.position.map((value, i) => value - data.camera.target[i]);
  const length = Math.hypot(...delta);
  const cross = [delta[1]*data.camera.up[2]-delta[2]*data.camera.up[1],
    delta[2]*data.camera.up[0]-delta[0]*data.camera.up[2],
    delta[0]*data.camera.up[1]-delta[1]*data.camera.up[0]];
  if (!Number.isFinite(length) || length <= 0 || length > 100 ||
      Math.hypot(...cross) < 1e-12 || data.axes != null || data.palette != null ||
      data.configuration != null) throw Error('Invalid ELEGOO static camera');
  return data;
}
