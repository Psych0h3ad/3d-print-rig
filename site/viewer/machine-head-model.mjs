import {headPlan} from './head-assembly.js?v=public-v20';

import {translatedProbeFit} from './probe-checks.js?v=public-v20';

import {withEmbeddedBoards} from './embedded-boards.mjs?v=public-v20';

const clone=value=>JSON.parse(JSON.stringify(value));
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function installedHeadPlan(variant,registry,target){
 const plan=headPlan(variant);let anchor;
 if(variant.registration_source)anchor=registry.sources[variant.registration_source].origin_mm;
 else if(variant.mount==='stealthchanger')anchor=registry.sources.stealthchanger.origin_mm;
 else if(variant.toolhead==='indx')anchor=registry.sources.indx.origin_mm;
 else if(variant.toolhead==='xol')anchor=add(registry.sources.kit_fixed.origin_mm,variant.head_translation_mm);
 else anchor=registry.sources[variant.gantry==='siboor_awd'?'kit_fixed':'r2_fixed'].origin_mm;
 const shift=target.origin_mm.map((v,i)=>v-anchor[i]);
 const modules=plan.modules.filter(m=>m.role!=='dock').map(m=>({...m,translation_mm:add(m.translation_mm||variant.head_translation_mm,shift)}));
 if(variant.toolhead==='indx')modules.push({id:'head_indx_rail_fasteners',translation_mm:shift,role:'tool'});
 const nativeNozzle=registry.native_nozzle_points?.[plan.base];
 const sourceNozzle=variant.fit?.nozzle_mm||(nativeNozzle?add(nativeNozzle,plan.translation):null);
 if(!sourceNozzle)throw Error('ノズル位置が未登録です：'+variant.id);
 return {base:plan.base,translation:add(plan.translation,shift),translation_delta_mm:shift,hidden:[...plan.hidden],modules,nozzle_mm:sourceNozzle?add(sourceNozzle,shift):null,source_variant:variant.id,source_gantry:variant.gantry};
}
export function machineHeadVariants(heads,registry,machine,gantry){
 const binding=registry.machines[machine];if(!binding)return [];
 const target=binding.gantries?binding.gantries[gantry]:binding;if(!target)return [];
 return heads.variants.filter(v=>
  (v.mount==='fixed'&&['trident_r2','siboor_awd'].includes(v.gantry)&&v.carriage==='standard'&&['stealthburner','xol'].includes(v.toolhead))||
  (v.toolhead==='crowncooler'&&v.registration_source==='crowncooler'&&target.belt_width_mm===6)||
  (v.toolhead==='sphinx'&&v.registration_source==='sphinx_voron'&&target.belt_width_mm===6)||
  (v.mount==='stealthchanger'&&v.gantry==='sc_standard_'+target.belt_width_mm&&['stealthburner','xol','jabberwocky'].includes(v.toolhead))||
  (v.toolhead==='indx'&&target.belt_width_mm===6)
 ).filter(v=>v.belt_width_mm===target.belt_width_mm).map(v=>{
  const n=clone(v);n.source_head_configuration=v.id;n.machine_head=installedHeadPlan(v,registry,target);n.id='installed__'+(gantry||machine)+'__'+v.id;n.gantry=gantry||'machine_gantry';n.xy_motors=target.xy_motors;
  n.fit={...n.fit,nozzle_mm:n.machine_head.nozzle_mm,bed_reference_drop_mm:0,machine_mount:{kind:'MGN12H 20 x 20 mm',axis_error_mm:Math.max(target.axis_error_mm||0,v.mount==='stealthchanger'?(registry.mount_verification?.stealthchanger?.axis_error_mm||0):v.toolhead==='indx'?(registry.mount_verification?.indx?.axis_error_mm||0):(registry.mount_verification?.[v.registration_source]?.axis_error_mm||0)),docking_registered:false,full_travel_verified:false}};
  if(n.fit.probe)n.fit.probe=translatedProbeFit(n.fit.probe,n.machine_head.translation_delta_mm);
  n.notes=[...n.notes.filter(t=>!t.includes('プリンター全体への装着')),'MGN12の取付軸で機体に配置。全域の干渉・ホーミング接点・配線・ドッキングは未検証。'];
  if(v.toolhead==='indx')n.notes.push('INDXはレール取付のプレビュー。ベルト固定具・機体側ドックは未登録。');
  if(v.toolhead==='sphinx')n.notes.push('MGN12の取付面と4本の穴軸でVORON機体へ配置。センサー・全可動域は未検証。');
  return n;
 });
}
export function expandedPrinterCatalog(current,heads,registry,machine){
 const result=clone(withEmbeddedBoards(current,heads.embedded_board));result.machine_id=machine;result.dimensions=['gantry','toolhead','mount','extruder','hotend','carriage','probe','board','cooling'];
 for(const v of result.variants){v.mount||='fixed';v.carriage||='standard';v.board||='none';v.cooling||='source'}
 for(const field of ['toolheads','mounts','extruders','hotends','carriages','probes','boards','cooling_options']){
  result[field]||=[];for(const row of heads[field]||[]){const existing=result[field].find(r=>r.id===row.id);if(existing)Object.assign(existing,clone(row));else result[field].push(clone(row));}
 }
 for(const gantry of result.gantries){
  const foundation=result.variants.find(v=>v.gantry===gantry.id&&v.toolhead==='stealthburner'&&v.extruder==='cw2');if(!foundation)continue;
  for(const variant of machineHeadVariants(heads,registry,machine,gantry.id)){
   if(result.variants.some(v=>result.dimensions.every(field=>v[field]===variant[field])))continue;
   variant.removed_stock_keys=[...new Set([...foundation.removed_stock_keys,...Array.from({length:168},(_,i)=>String(i+412)),'surface_422'])];
   variant.modules=foundation.modules.filter(m=>m.id==='trident_r2_gantry_350');
   if(variant.fit.nozzle_mm&&Number.isFinite(result.bed_reference_top_mm))variant.fit.bed_reference_drop_mm=Math.max(0,result.bed_reference_top_mm-variant.fit.nozzle_mm[2]+.2);
   result.variants.push(variant);
  }
 }
 result.assets={...result.assets,...heads.assets,...heads.base_assets,...registry.assets};
 for(const source of heads.sources)if(!result.sources.some(s=>s.url===source.url))result.sources.push(clone(source));
 return result;
}
export function v24HeadCatalog(heads,registry,machine){
 const variants=machineHeadVariants(heads,registry,machine),result={...heads,variants,machine_id:machine,dimensions:['toolhead','mount','extruder','hotend','carriage','probe','board','cooling'],assets:{...heads.assets,...registry.assets},gantries:[{id:'machine_gantry',label:'現在のガントリー'}]};
 return result;
}
