import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withMonolithMachines,monolithPartDelta,monolithConfigurationRequest,monolithDisplayLimits} from '../site/viewer/monolith-machine-model.mjs';
import {monolithBeltRoute,monolithBeltGeometry} from '../site/viewer/monolith-belts.mjs';
import {choicesFor,resolveVariant,importedVariant} from '../site/viewer/configuration-model.js';
import {headPrinterLink} from '../site/viewer/head-navigation.mjs';
import {bankChoices} from '../site/viewer/changer-bank-model.mjs';
const near=(a,b,t=1e-7)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const routes=JSON.parse(fs.readFileSync(new URL('./fixtures/monolith-belt-routes.json',import.meta.url)));
let poses=0;
for(const sources of Object.values(routes.routes))for(const source of sources)for(const size of [250,300,350]){
 const rest=monolithBeltRoute(source,size),cut={x_mm:[-25.2,25.2]};
 for(const dx of [-size/2,0,size/2])for(const dy of [-size/2,0,size/2])for(const clipping of [null,cut]){
  const route=monolithBeltRoute(source,size,dx,dy,clipping),reference=monolithBeltRoute(source,size,0,0,clipping);
  near(route.length,reference.length);
  for(const index of [0,route.points.length-1]){near(route.points[index][0]-reference.points[index][0],dx);near(route.points[index][1]-reference.points[index][1],dy)}
  for(const [i,segment] of route.segments.entries())if(segment.kind==='circle')near(segment.radius,rest.segments[i].radius);
  const geometry=monolithBeltGeometry(route);assert(geometry.attributes.position.array.every(Number.isFinite));geometry.computeBoundingBox();near(geometry.boundingBox.max.y-geometry.boundingBox.min.y,source.width/1000,1e-8);
  // Every indexed edge belongs to two triangles, including both open-belt
  // end caps. The centerline is open; the physical strip is a closed solid.
  const edges=new Map(),indices=geometry.index.array;
  for(let i=0;i<indices.length;i+=3)for(let j=0;j<3;j++){const edge=[indices[i+j],indices[i+(j+1)%3]].sort((a,b)=>a-b).join(',');edges.set(edge,(edges.get(edge)||0)+1)}
  assert([...edges.values()].every(n=>n===2));geometry.dispose();poses++;
 }
}
assert.deepEqual(monolithPartDelta('monolith_x_frame_350',{name:'_MGN12H'},[15,25,35],'V2'),[15,25,35]);
assert.deepEqual(monolithPartDelta('monolith_x_frame_350',{name:'rail'},[15,25,35],'VT'),[0,25,0]);
assert.deepEqual(monolithPartDelta('monolith_y_frame_v2_350',{name:'_MGN9H'},[15,25,35],'V2'),[0,25,35]);
assert.deepEqual(monolithPartDelta('monolith_y_frame_vt_350',{name:'rail'},[15,25,35],'VT'),[0,0,0]);
assert.deepEqual(monolithPartDelta('monolith_z_printed_9_awd_350',{name:'joint'},[15,25,35],'V2'),[0,0,35]);

const fixed={id:'sphinx_complete',toolhead:'sphinx',mount:'fixed',gantry:'sphinx_monolith',extruder:'sherpa',hotend:'tricorn',carriage:'standard',probe:'none',board:'none',cooling:'source',base_asset:'sphinx_native',head_translation_mm:[0,0,0],base_hidden_keys:[],modules:[{id:'sherpa',translation_mm:[0,0,0]},{id:'tricorn',translation_mm:[0,0,0]}],notes:[],fit:{nozzle_mm:[0,-17.5,-84.5],complete_head_native:{extruder:'sherpa',hotend:'tricorn'}}};
const sc=width=>({...fixed,id:'sc'+width,toolhead:'xol',mount:'stealthchanger',gantry:'sc_monolith_'+width,belt_width_mm:width});
const heads={variants:[fixed,sc(6),sc(9)],sources:[],assets:{},base_assets:{},gantries:[],toolheads:[{id:'sphinx'},{id:'xol'}],mounts:[{id:'fixed'},{id:'stealthchanger'}],extruders:[{id:'sherpa'}],hotends:[{id:'tricorn'}],carriages:[{id:'standard'}],probes:[{id:'none'}],boards:[{id:'none'}],cooling_options:[{id:'source'}]};
const registry={sources:{stealthchanger_monolith:{origin_mm:[0,0,0]},sphinx_native:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:[6,9]}},monolith_target:{origin_mm:[0,.5,0],axis_error_mm:0},machines:{}};
const gantries={variants:[],source:{url:'https://github.com/Monolith3D/Monolith_Gantry'},assets:{}};
for(const size of [250,300,350])for(const family of ['VT','V2'])for(const build of ['printed','sheet_metal'])for(const width of [6,9])for(const motors of [2,4])gantries.variants.push({id:`monolith_${family.toLowerCase()}_${build}_${width}_${motors===4?'awd':'2wd'}_${size}`,machine:family,size_mm:size,build,belt_width_mm:width,xy_motors:motors,modules:[],notes:[]});
const registrations={machines:{}};
for(const size of [250,300,350])for(const [prefix,suffix,family] of [['voron_trident_','','VT'],['voron_v24_','_printed','V2']])registrations.machines[prefix+size+suffix]={family,size_mm:size,translation_mm:[3,4,200],stock_hidden_keys:['old-beam','old-head'],bed_min_xy_mm:[-size/2,-size/2]};
registry.monolith={registrations,gantries};
for(const machine of Object.keys(registrations.machines)){
 const current={...heads,machine_id:machine,gantries:[{id:'stock',label:'Stock'}],variants:[{...fixed,id:'stock',gantry:'stock'}]},before=JSON.stringify(current),catalog=withMonolithMachines(current,heads,registry,gantries,registrations);
 assert.equal(catalog.gantries.length,9);assert.equal(catalog.variants.length,17);assert.equal(JSON.stringify(current),before);
 const selected=catalog.variants[1];assert.deepEqual(selected.machine_head.nozzle_mm,[3,-5.5,115.5]);
 assert.deepEqual(choicesFor(catalog,selected,'mount').map(r=>r.id),['fixed','stealthchanger']);
 const changed=resolveVariant(catalog,{...selected,mount:'stealthchanger'},'mount');assert.equal(changed.gantry,selected.gantry);
 assert.equal(resolveVariant(catalog,{...changed,gantry:'stock'},'gantry').id,'stock');
 for(const v of catalog.variants.slice(1))assert.equal(importedVariant(catalog,{machine,configuration:v.id}),v);
 assert.equal(monolithConfigurationRequest(catalog,'?gantry='+selected.gantry+'&head_configuration='+selected.source_head_configuration),selected);
 const link=headPrinterLink(fixed,registry,'https://example.test/viewer/toolheads.html?return_machine='+machine+'&return_gantry='+selected.gantry),url=new URL(link.url);
 assert.equal(link.machine,machine);assert.equal(url.searchParams.get('gantry'),selected.gantry);assert.equal(url.searchParams.get('head_configuration'),fixed.id);
 assert.deepEqual(bankChoices(catalog,{},selected.gantry),[],'Standard frame docks must not be borrowed by Monolith');
}
console.log(`Monolith: ${poses} native belt poses, watertight strips, fixed/SC choices, 48 gantries, 6 machine catalogs, save/restore, links and distinct bearing motion passed.`);

const full={X:[0,350],Y:[0,350],Z:[0,350]},rail={machine_gantry:{z_delta_limits_mm:[-40,240]}};
assert.deepEqual(monolithDisplayLimits(full,[175,175,38],rail).Z,[0,278]);
assert.deepEqual(monolithDisplayLimits(full,[175,175,48],rail).Z,[8,288]);
assert.deepEqual(monolithDisplayLimits(full,[175,175,38],null),full);
assert.deepEqual(full.Z,[0,350]);
assert.throws(()=>monolithDisplayLimits(full,[175,175,500],{machine_gantry:{z_delta_limits_mm:[0,10]}}),/表示範囲/);
console.log('Head-dependent Z limits preserve both native guide stops and restore the stock range.');
