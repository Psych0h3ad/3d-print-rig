import assert from 'node:assert/strict';
import {existsSync,readFileSync} from 'node:fs';
import {componentViews,resolveComponentView,componentViewKeys} from '../site/viewer/v0-mod-library.mjs';
import {headPlan} from '../site/viewer/head-assembly.js';
import {installedHeadPlan,machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
const parts=[{key:'adapter',name:'GrooveMount',source_solid:0},{key:'metal',name:'Rapido X body',source_solid:1}];
const views=componentViews({id:'rapido_x',select_parts:true},parts),initial=resolveComponentView(views);
assert.equal(initial.view.id,'four-bolt');assert.deepEqual(componentViewKeys(initial.view,initial.part),['metal']);
const groove=resolveComponentView(views,{view:'groove'});assert.deepEqual(componentViewKeys(groove.view,groove.part),['adapter','metal']);
assert.deepEqual(componentViewKeys(groove.view,'adapter'),['adapter']);
assert.throws(()=>componentViewKeys(views[0],'adapter'));
assert.throws(()=>componentViews({id:'rapido_x'},[parts[1]]),/mismatch/);
const head=(g,width,offset)=>({id:g,gantry:g,belt_width_mm:width,toolhead:'stealthburner',mount:'fixed',carriage:'standard',extruder:'cw2',hotend:'rapido_x_uhf',head_translation_mm:offset,removed_stock_keys:['old-hotend'],probe:'none',board:'none',cooling:'source',notes:[],modules:[{id:'sb_rapido_x',translation_mm:offset},{id:'head_sb_cw2',translation_mm:offset},{id:'hotend_rapido_x',translation_mm:offset.map((n,i)=>n+[0,-28.76,320.7][i]),hidden_keys:['hotend_rapido_x_hotend_0']}],fit:{nozzle_mm:offset.map((n,i)=>n+[0,-28.76,299.4][i])}});
const six=head('trident_r2',6,[0,-7.34,-3.0064]),nine=head('siboor_awd',9,[0,0,0]);
const registry={sources:{r2_fixed:{origin_mm:[0,-7.34,360]},kit_fixed:{origin_mm:[0,0,363.0064]}},machines:{six:{origin_mm:[0,-7.34,200],belt_width_mm:6,xy_motors:2},nine:{origin_mm:[0,0,363.0064],belt_width_mm:9,xy_motors:4}}};
for(const v of [six,nine]){
 assert(headPlan(v).hidden.has('old-hotend'));
 const plan=installedHeadPlan(v,registry,registry.machines[v.belt_width_mm===6?'six':'nine']);
 assert.deepEqual(plan.modules.find(m=>m.id==='hotend_rapido_x').hidden_keys,['hotend_rapido_x_hotend_0']);
 assert(Math.abs(plan.modules.find(m=>m.id==='hotend_rapido_x').translation_mm[2]-plan.nozzle_mm[2]-21.3)<1e-9);
}
assert.deepEqual(machineHeadVariants({variants:[six,nine]},registry,'six').map(v=>v.source_head_configuration),['trident_r2']);
assert.deepEqual(machineHeadVariants({variants:[six,nine]},registry,'nine').map(v=>v.source_head_configuration),['siboor_awd']);
// Local release checks also exercise the real ignored geometry catalog.
const path=new URL('../site/TOOLHEAD_CONFIGURATIONS.json',import.meta.url);
if(existsSync(path)){
 const catalog=JSON.parse(readFileSync(path)),rows=catalog.variants.filter(v=>v.id.startsWith('rapido51__'));
 assert.equal(rows.length,14);assert.equal(rows.filter(v=>v.toolhead==='stealthburner').length,2);
 assert.equal(catalog.hotends.find(h=>h.id==='rapido_x_uhf').label,'Rapido X');
 for(const v of rows){
  assert.equal(v.hotend,'rapido_x_uhf');assert(!v.modules.some(m=>/rapido2|chube/.test(m.id)));
  assert(v.fit.nozzle_mm.every(Number.isFinite));
  if(v.toolhead==='stealthburner')assert(v.modules.find(m=>m.id==='hotend_rapido_x').hidden_keys.includes('hotend_rapido_x_hotend_0'));
  else{
   assert(v.modules.some(m=>m.id==='sphinx_hotend_fan_2510'));assert.equal(v.fit.complete_head_native.hotend_orientation_z_deg,225);
   assert.deepEqual(v.fit.complete_head_native.hotend_body_collisions,[]);
   if(v.probe!=='none'){const p=v.fit.probe;assert(p.height_passed&&p.physical_passed&&p.metal_keepout_verified);assert(p.minimum_probe_bed_clearance_at_nozzle_contact_mm>0);assert.equal(p.machine_environment_verified,false);assert(Math.abs(p.coil_bottom_mm[2]-v.fit.nozzle_mm[2]-p.coil_nozzle_gap_mm)<1e-7)}
  }
 }
}
console.log('Rapido X: separate native body, adapter modes, measured nozzle projection, registered belt widths and real head/probe selections passed.');
