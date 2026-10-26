// Source RGB is already retained by createAssembly in materials[].color.
// Attach after other display adapters; no model access or material replacement.
export function attachSourceMaterialDisplay(assembly) {
  const originals = assembly.materials.filter(r => r.role === 'M' || r.role === 'A');
  for (const {material, color} of originals) {
    if (!color || !['r', 'g', 'b'].every(k => Number.isFinite(color[k])) ||
        typeof material?.color?.copy !== 'function') {
      throw Error('Missing original printed source color');
    }
  }
  let mode = 'source';
  const restore = () => {
    // Purchased/native materials and all non-color properties stay with the
    // inner controller. Use linear RGB copy, never a hex/sRGB round trip.
    for (const {material, color} of originals) material.color.copy(color);
  };
  function snapshot() {
    return {...assembly.snapshot(), source_material_display: mode};
  }
  function apply(state) {
    if (!state || typeof state !== 'object' || Array.isArray(state)) {
      throw Error('Invalid source material display state');
    }
    const next = Object.hasOwn(state, 'source_material_display')
      ? state.source_material_display : 'palette';
    if (next !== 'source' && next !== 'palette') {
      throw Error('Invalid source material display mode');
    }
    // Validate our extension before any inner controller or color mutation.
    // Existing revision, pose and palette validation remains with inner apply.
    const {source_material_display: omitted, ...normal} = state;
    assembly.apply(normal);
    if (next === 'source') restore();
    mode = next;
    return snapshot();
  }
  function reset() {
    assembly.reset();
    restore();
    mode = 'source';
    return snapshot();
  }
  // Inherit instead of spreading: flexState and other getters stay live;
  // disposal, ownership sets, parts and other methods remain the inner ones.
  const wrapped = Object.create(assembly);
  Object.assign(wrapped, {snapshot, apply, reset});
  restore();
  return wrapped;
}
