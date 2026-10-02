// A head uses the exact registered module placements, with no printer gantry.
export function headPlan(variant){
 return {
  base:variant.base_asset||variant.toolhead,
  translation:variant.head_translation_mm,
  hidden:new Set(variant.base_hidden_keys||(variant.toolhead==='xol'?variant.hidden_xol_keys:variant.removed_stock_keys)),
  modules:variant.modules.filter(m=>m.id!=='trident_r2_gantry_350')
 };
}

export function headPlacement(variant,entry,{probe=0,explode=0}={}){
 const p=[...(entry.translation_mm||variant.head_translation_mm)];
 if(variant.mount==='stealthchanger'&&entry.role==='tool'){
  p[1]-=Math.min(50,Math.max(0,Number(explode)||0));
  p[2]+=Math.min(3,Math.max(0,Number(probe)||0));
 }
 return p;
}

export function partKey(mesh){
 return mesh.userData.part_key||mesh.name.match(/^P([^_]+)__/u)?.[1]||mesh.name;
}

export function headCombinationCount(catalog){
 return new Set(catalog.variants.map(v=>[v.toolhead,v.hotend,v.extruder].join('__'))).size;
}
