// Bound inactive source assets independently of current head and parked clones.
export const INACTIVE_HEAD_LIMIT_BYTES = 128 * 1024 * 1024;
const disposals = new WeakMap();

function guardDisposal(resource, method = 'dispose') {
  if (!resource || typeof resource[method] !== 'function') return;
  if (disposals.has(resource)) return;
  const original = resource[method], state = {disposed: false, method};
  resource[method] = function (...args) {
    if (state.disposed) return;
    state.disposed = true;
    return original.apply(this, args);
  };
  disposals.set(resource, state);
}

// ArrayBuffer identity, not accessor count, measures retained CPU storage.
// Interleaved attributes, morph targets, saved UHF indices and texture mipmaps
// can all retain the same backing store.
export function headResourceFootprint(assets) {
  const resources = new Set(), buffers = new Set(), attributes = new Set(), images = new Map();
  const visited = new Set();
  const buffer = value => {
    if (ArrayBuffer.isView(value)) buffers.add(value.buffer);
    else if (value instanceof ArrayBuffer || Object.prototype.toString.call(value) === '[object SharedArrayBuffer]') buffers.add(value);
  };
  const attribute = value => {
    if (!value || attributes.has(value)) return;
    attributes.add(value);buffer(value.array);buffer(value.data?.array);
    if (value.data) attributes.add(value.data);
  };
  function image(value) {
    if (!value || images.has(value)) return;
    if (Array.isArray(value)) { for (const item of value) image(item);return; }
    if (ArrayBuffer.isView(value)) { buffer(value);return; }
    if (value.data && ArrayBuffer.isView(value.data)) {
      buffer(value.data);images.set(value, {bytes: 0, measured: true});
    } else {
      const width = value.width ?? value.videoWidth, height = value.height ?? value.videoHeight;
      const bytes = Number.isSafeInteger(width) && width > 0 && Number.isSafeInteger(height) && height > 0 ? width * height * 4 : 0;
      images.set(value, {bytes, measured: false});
    }
    if (typeof value.close === 'function') { guardDisposal(value, 'close');resources.add(value); }
  }
  function texture(value) {
    if (!value || resources.has(value)) return;
    guardDisposal(value);resources.add(value);
    image(value.source?.data ?? value.image);
    for (const mip of value.mipmaps || []) image(mip);
  }
  function textures(value) {
    if (!value || typeof value !== 'object' || visited.has(value)) return;
    if (value.isTexture) { texture(value);return; }
    if (ArrayBuffer.isView(value) || value instanceof ArrayBuffer) return;
    visited.add(value);
    // Material uniforms contain texture arrays/objects too; never traverse a
    // scene/parent graph while looking for them.
    if (value.isObject3D || value.isBufferGeometry || value.isMaterial) return;
    for (const child of Object.values(value)) textures(child);
  }
  function material(value) {
    for (const item of [].concat(value || [])) {
      if (!item || resources.has(item)) continue;
      guardDisposal(item);resources.add(item);
      for (const child of Object.values(item)) textures(child);
    }
  }
  function geometry(value) {
    if (!value || resources.has(value)) return;
    guardDisposal(value);resources.add(value);
    for (const attr of Object.values(value.attributes || {})) attribute(attr);
    for (const attrs of Object.values(value.morphAttributes || {})) for (const attr of attrs) attribute(attr);
    attribute(value.index);attribute(value.indirect);
  }
  function node(value) {
    geometry(value.geometry);material(value.material);
    attribute(value.instanceMatrix);attribute(value.instanceColor);
    if (value.skeleton?.boneTexture) texture(value.skeleton.boneTexture);
    const surface = value.userData?.ledSurface, guide = value.userData?.ledGuide;
    if (surface) { geometry(surface.originalGeometry);material(surface.originalMaterial);material(surface.materials); }
    if (guide) material(guide.originalMaterial);
  }
  for (const asset of assets) {
    if (!asset) continue;
    const root = asset.root || asset;
    if (typeof root.traverse === 'function') root.traverse(node);
    for (const entry of asset.entries || asset.meshes || []) {
      material(entry.materials);
      buffer(entry.uhfSurface?.source);buffer(entry.uhfSurface?.kept);
    }
  }
  return {resources, buffers, attributes, images};
}

export function canRestoreInactiveHeadIndices(asset, protectedResources) {
  for (const entry of asset.entries || asset.meshes || []) {
    if (!entry.uhfSurface || !protectedResources.has(entry.mesh.geometry)) continue;
    const geometry = entry.mesh.geometry, native = entry.uhfSurface;
    if (geometry.drawRange.start !== native.draw.start || geometry.drawRange.count !== native.draw.count
      || geometry.index.array.length !== native.source.length
      || geometry.index.array.some((value, i) => value !== native.source[i])) return false;
  }
  return true;
}
function footprintBytes(footprint, protectedFootprint) {
  let bytes = 0, unmeasuredImages = 0;
  for (const buffer of footprint.buffers) if (!protectedFootprint.buffers.has(buffer)) bytes += buffer.byteLength;
  for (const [image, info] of footprint.images) if (!protectedFootprint.images.has(image)) {
    bytes += info.bytes;
    if (!info.measured) unmeasuredImages++;
  }
  return {bytes, unmeasuredImages};
}

export function createInactiveHeadCache(cache, {protectedRoots = () => [], beforeEvict = () => true, afterDetach = () => {}} = {}) {
  if (!(cache instanceof Map)) throw Error('Head cache must be a Map');
  const states = new WeakMap(), lastUsed = new Map(), retired = new Set(), cleanupPending = new Set();
  const cleanupErrors = [];
  let active = new Set(), clock = 0, cleanupErrorCount = 0, disposalFailureCount = 0, lastReport = null;
  function failure(stage, error) {
    cleanupErrorCount++;cleanupErrors.push({stage, message: String(error?.message || error)});
    if (stage === 'dispose') disposalFailureCount++;
    if (cleanupErrors.length > 16) cleanupErrors.shift();
  }
  const loaded = promise => promise?.loaded || states.get(promise)?.value;
  const rows = () => [...cache].flatMap(([id, promise]) => {
    const asset = loaded(promise);return asset ? [{id, promise, asset, settled: states.get(promise)?.status === 'fulfilled'}] : [];
  });
  const protectedView = records => headResourceFootprint([...records.filter(r => active.has(r.id) || r.asset.root.visible || !r.settled).map(r => r.asset), ...protectedRoots().filter(Boolean)]);
  function drain() {
    const held = headResourceFootprint([...rows().map(r => r.asset), ...cleanupPending, ...protectedRoots().filter(Boolean)]);
    const heldAttributes = held.attributes;
    for (const resource of [...retired]) {
      if (held.resources.has(resource)) continue;
      // Distinct geometry objects may share the renderer's attribute objects.
      if (resource.isBufferGeometry) {
        const attrs = [...Object.values(resource.attributes || {}), ...Object.values(resource.morphAttributes || {}).flat(), resource.index, resource.indirect].filter(Boolean);
        if (attrs.some(a => heldAttributes.has(a) || heldAttributes.has(a.data))) continue;
      }
      const state = disposals.get(resource);
      if (state) { try { resource[state.method](); } catch (error) { failure('dispose', error); } }
      retired.delete(resource);
    }
  }
  function track(id, promise) {
    if (states.has(promise)) return promise;
    const state = {status: 'pending', value: null};states.set(promise, state);
    promise.then(value => {
      state.status = 'fulfilled';state.value = value;
      try { headResourceFootprint(value ? [value] : []); } catch (error) { failure('track', error); }
      if (!lastUsed.has(id)) lastUsed.set(id, ++clock);
    }, () => { state.status = 'rejected'; });
    return promise;
  }
  function release(roots) {
    // The lighting controller restores native surfaces after detachment. Its
    // derived resources are disposed by that owner, never a second time here.
    for (const root of roots) cleanupPending.add(root);
    if (!cleanupPending.size) { drain();return; }
    headResourceFootprint([...cleanupPending]);
    try { afterDetach(); } catch (error) { failure('afterDetach', error);return; }
    for (const resource of headResourceFootprint([...cleanupPending]).resources) retired.add(resource);
    cleanupPending.clear();
    drain();
  }
  function commit(ids, {purge = false} = {}) {
    active = new Set(ids);
    for (const id of active) lastUsed.set(id, ++clock);
    if (cleanupPending.size) release([]);
    drain();
    const evicted = [], blocked = new Set(), limit = purge ? 0 : INACTIVE_HEAD_LIMIT_BYTES;
    let state;
    while (true) {
      const records = rows(), protectedFootprint = protectedView(records);
      const candidates = records.filter(r => r.settled && !active.has(r.id) && !r.asset.root.visible && !blocked.has(r.id));
      const inactive = records.filter(r => r.settled && !active.has(r.id) && !r.asset.root.visible);
      const footprint = headResourceFootprint([...inactive.map(r => r.asset), ...cleanupPending]);
      state = footprintBytes(footprint, protectedFootprint);
      if ((!purge && state.bytes <= limit && state.unmeasuredImages === 0) || (purge && !inactive.length)) break;
      candidates.sort((a, b) => (lastUsed.get(a.id) || 0) - (lastUsed.get(b.id) || 0));
      const next = candidates[0];if (!next) break;
      try {
        if (beforeEvict(next.asset, {protectedResources: protectedFootprint.resources}) === false) { blocked.add(next.id);continue; }
      } catch (error) { failure('beforeEvict', error);blocked.add(next.id);continue; }
      if (cache.get(next.id) !== next.promise || states.get(next.promise)?.status !== 'fulfilled') { blocked.add(next.id);continue; }
      next.asset.root.removeFromParent();cache.delete(next.id);lastUsed.delete(next.id);
      release([next.asset]);evicted.push(next.id);
    }
    drain();
    const held = headResourceFootprint([...rows().map(r => r.asset), ...protectedRoots().filter(Boolean)]);
    // A retired resource can remain alive solely through an active parked clone
    // or shared attribute. It is drained when that last reference is released.
    const deferred = [...retired].filter(r => !disposals.get(r)?.disposed);
    const deferredFootprint = headResourceFootprint(deferred.filter(r => r.isBufferGeometry).map(geometry => ({traverse(fn) {fn({geometry});}})));
    const deferredState = footprintBytes(deferredFootprint, held);
    return lastReport = {limitBytes: limit, inactiveBytes: state.bytes, unmeasuredInactiveImages: state.unmeasuredImages,
      deferredUnprotectedBytes: deferredState.bytes, withinLimit: state.bytes + deferredState.bytes <= limit && state.unmeasuredImages === 0 && cleanupPending.size === 0 && disposalFailureCount === 0,
      evicted, blocked: [...blocked], pending: [...cache].filter(([,p]) => states.get(p)?.status !== 'fulfilled').map(([id]) => id),
      deferredResources: deferred.length, pendingCleanupRoots: cleanupPending.size, disposalFailureCount, cleanupErrorCount, cleanupErrors: [...cleanupErrors]};
  }
  return {track, commit, release, get report() { return lastReport; }};
}
