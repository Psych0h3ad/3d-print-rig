// A head or extruder change must retain the selected printer's gantry.
export function withPrinterGantry(catalog) {
  if (!['siboor_awd', 'trident_r2'].every(id => catalog.gantries?.some(g => g.id === id))) return catalog;
  const foundation = catalog.variants.find(v => v.gantry === 'trident_r2' && v.toolhead === 'stealthburner' && v.extruder === 'cw2' && v.modules?.some(m => /^trident_r2_gantry_(250|300|350)$/.test(m.id)));
  const stock = foundation && catalog.variants.find(v => v.gantry === 'siboor_awd' && v.toolhead === foundation.toolhead && v.hotend === foundation.hotend && v.extruder === foundation.extruder && v.probe === foundation.probe);
  if (!foundation || !stock) throw Error('Missing registered Trident gantry foundation');
  const module = foundation.modules.find(m => /^trident_r2_gantry_(250|300|350)$/.test(m.id));
  const stockRemoved = new Set(stock.removed_stock_keys || []);
  const gantryRemoved = foundation.removed_stock_keys.filter(key => !stockRemoved.has(key));
  return {...catalog, variants: catalog.variants.map(v => v.gantry !== 'trident_r2' ? v : ({
    ...v,
    modules: [structuredClone(module), ...v.modules.filter(m => !/^trident_r2_gantry_(250|300|350)$/.test(m.id))],
    removed_stock_keys: [...new Set([...(v.removed_stock_keys || []), ...gantryRemoved])],
  }))};
}

export function printerBeltOwner(variant) {
  return variant?.machine_gantry ? 'monolith' : variant?.gantry === 'trident_r2' ? 'trident_r2' : 'siboor_awd';
}

export function createPrinterBelts(parts) {
  const entries = [];
  const visible = mesh => !!mesh?.visible && (!mesh.parent || visible(mesh.parent));
  function register(mesh, row) {
    // The published GLB does not carry flex_belt extras. The part manifest does.
    if (!row?.flex_belt && !mesh.userData.flex_belt) return false;
    const attr = mesh.geometry.attributes.position, original = attr.array.slice(), weights = [];
    for (let i = 0; i < attr.count; i++) {
      const x = original[i * 3] * 1000, y = -original[i * 3 + 2] * 1000;
      let wx = 0, wy = 0;
      if (y > -20 && y < 5) { wy = 1; if (Math.abs(x) < 216) wx = Math.max(0, Math.min(1, (216 - Math.abs(x)) / 196)); }
      else if (Math.abs(x) > 215) wy = y > 5 ? Math.max(0, 1 - (y - 5) / 233) : Math.max(0, 1 - (-20 - y) / 208);
      weights.push(wx, wy);
    }
    entries.push({mesh, attr, original, weights});
    return true;
  }
  function setVisible(variant, enabled) {
    const owner = printerBeltOwner(variant);
    const stock = ['580', 'Upper_Belt'].map(key => parts.get(key)).filter(Boolean);
    for (const mesh of stock) mesh.visible = !!enabled && owner === 'siboor_awd';
    for (const {mesh} of entries) mesh.visible = !!enabled && owner === 'trident_r2';
    const owned = owner === 'siboor_awd' ? stock : owner === 'trident_r2' ? entries.map(e => e.mesh) : [];
    return {owner, visible_meshes: owned.filter(visible).length, registered_meshes: owned.length};
  }
  function update(variant, dx, dy, enabled) {
    if (printerBeltOwner(variant) === 'trident_r2') for (const {mesh, attr, original, weights} of entries) {
      for (let i = 0; i < attr.count; i++) {
        attr.array[3 * i] = original[3 * i] + dx * weights[2 * i] / 1000;
        attr.array[3 * i + 2] = original[3 * i + 2] - dy * weights[2 * i + 1] / 1000;
      }
      attr.needsUpdate = true;
      mesh.geometry.computeBoundingSphere();
    }
    return setVisible(variant, enabled);
  }
  return {entries, register, update, setVisible};
}
