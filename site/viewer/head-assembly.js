// A head uses the exact registered module placements, with no printer gantry.
export function headPlan(variant){
 return {
  base:variant.toolhead,
  translation:variant.head_translation_mm,
  hidden:new Set(variant.toolhead==='xol'?variant.hidden_xol_keys:variant.removed_stock_keys),
  modules:variant.modules.filter(m=>m.id!=='trident_r2_gantry_350')
 };
}

export function partKey(mesh){
 return mesh.userData.part_key||mesh.name.match(/^P([^_]+)__/u)?.[1]||mesh.name;
}

export function headCombinationCount(catalog){
 return new Set(catalog.variants.map(v=>[v.toolhead,v.hotend,v.extruder].join('__'))).size;
}
