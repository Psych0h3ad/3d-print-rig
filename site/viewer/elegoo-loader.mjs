import * as THREE from './vendor-r180/three.module.js';
import {GLTFLoader} from './vendor-r180/GLTFLoader.js';
import {checkedExtraAsset, extraAssetBase} from './extra-asset-integrity.mjs?v=7483c3e6dfe211e4d6b5';
import {elegooAssetIndex} from './elegoo-catalog.mjs';
import {runElegooLoad} from './elegoo-load-task.mjs';

export function disposeElegooRoot(root) {
  if (!root) return;
  root.removeFromParent();
  const resources = new Set();
  root.traverse(node => {
    if (node.geometry) resources.add(node.geometry);
    for (const material of [].concat(node.material || [])) {
      resources.add(material);
      for (const value of Object.values(material)) if (value?.isTexture) resources.add(value);
    }
  });
  for (const resource of resources) resource.dispose();
}

export function assemble(gltf, manifest, profile, row) {
  const root = new THREE.Group(), nodes = new Map();
  // These exact proper rotations are display-only; no source part is reshaped.
  const b = row.basis;
  root.applyMatrix4(new THREE.Matrix4().set(...b[0], 0, ...b[1], 0, ...b[2], 0, 0, 0, 0, 1));
  gltf.scene.traverse(node => {
    if (node.userData?.part_key != null) {
      const key = String(node.userData.part_key);
      if (nodes.has(key)) throw Error('Duplicate loaded ELEGOO part');
      nodes.set(key, node);
    }
    // Keep vertex colors and loader materials. Do not invent PBR, transparency,
    // hardware, printed-role colors, motion or decals absent from these GLBs.
  });
  if (nodes.size !== row.parts || manifest.parts.some(part => !nodes.has(part.key)))
    throw Error('Missing loaded ELEGOO part');
  root.add(gltf.scene); root.updateMatrixWorld(true);
  // precise=true avoids conservative transformed local-box corner bounds.
  const bounds = new THREE.Box3().setFromObject(root, true), headBounds = new THREE.Box3();
  if (bounds.isEmpty() || ![...bounds.min.toArray(), ...bounds.max.toArray()].every(Number.isFinite))
    throw Error('Invalid ELEGOO assembly bounds');
  for (const part of manifest.parts) if (part.path?.some(name =>
    /^(Extrusion Kit|Extruder Kit|Extruder_Kit)/i.test(name))) headBounds.expandByObject(nodes.get(part.key), true);
  return {root, bounds, headBounds, nodes, manifest, profile};
}

export function loadElegooReference(row, options = {}) {
  const base = extraAssetBase(elegooAssetIndex, location.href);
  return runElegooLoad(row, {...options,
    fetchAsset: (spec, args) => checkedExtraAsset(base, spec, args),
    parse: bytes => new GLTFLoader().parseAsync(
      bytes.byteOffset === 0 && bytes.byteLength === bytes.buffer.byteLength ? bytes.buffer : bytes.slice().buffer,
      base.href),
    assemble: (gltf, manifest, profile) => {
      try { return assemble(gltf, manifest, profile, row); }
      catch (error) { gltf.scene.removeFromParent(); throw error; }
    },
    dispose: disposeElegooRoot,
  });
}
