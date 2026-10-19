import assert from 'node:assert/strict';
import {monolithHeadCatalog,monolithCompanion} from '../site/viewer/monolith-head-model.mjs';
import {choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
import {monolithBeltClip} from '../site/viewer/monolith-belt-clip.mjs';
const heads={variants:[],assets:{},base_assets:{},toolheads:[{id:'sb'}]};
for(const width of [6,9])for(const type of ['standard','monolith'])heads.variants.push({id:type+width,toolhead:'sb',extruder:'cw2',hotend:'revo',board:'none',cooling:'source',mount:'stealthchanger',gantry:'sc_'+type+'_'+width,belt_width_mm:width,head_translation_mm:[.2,-4,-353],base_asset:'sb',modules:[{id:'changer_sc_core_'+type+'_'+width,translation_mm:[0,0,0],role:'shuttle'},{id:'dock',role:'dock',translation_mm:[0,0,0]}],base_hidden_keys:[],notes:[],fit:{nozzle_mm:[.2,-33,-50]}});
const registry={sources:{stealthchanger_monolith:{origin_mm:[.2,5.7,5.6]}},monolith_target:{origin_mm:[0,.5,0],axis_error_mm:.000001}};
const gantries={variants:[]};for(const size of [250,350])for(const machine of ['VT','V2'])for(const build of ['printed','sheet_metal'])for(const width of [6,9])for(const motors of [2,4])gantries.variants.push({id:[size,machine,build,width,motors].join('_'),size_mm:size,machine,build,belt_width_mm:width,xy_motors:motors,notes:[]});
const c=monolithHeadCatalog(heads,registry,gantries);assert.equal(c.variants.length,32);assert.equal(c.gantries.length,32);
for(const v of c.variants){assert(v.source_head_configuration.startsWith('monolith'));assert.equal(v.machine_head.modules.length,1);assert.equal(v.machine_head.modules[0].id,'changer_sc_core_monolith_'+v.belt_width_mm);assert.deepEqual(v.machine_head.translation,[0,-9.2,-358.6]);assert.equal(v.fit.machine_mount.docking_registered,false)}
assert.equal(monolithCompanion(heads,heads.variants[0]).id,'monolith6');assert.equal(monolithCompanion(heads,{...heads.variants[0],hotend:'missing'}),undefined);assert.throws(()=>monolithHeadCatalog(heads,{sources:{}},gantries));
console.log('Monolith head selection passed: all 32 gantries, dedicated 6/9 mm carriers, native datum, omitted docks and exact component companions.');
const fixed={id:'sphinx_complete',toolhead:'sphinx',mount:'fixed',gantry:'sphinx_monolith',extruder:'sherpa',hotend:'tricorn',base_asset:'sphinx_native',head_translation_mm:[0,0,0],base_hidden_keys:[],modules:[{id:'sherpa',translation_mm:[0,0,0]},{id:'tricorn',translation_mm:[0,0,0]}],notes:[],fit:{nozzle_mm:[0,-17.5,-84.5],complete_head_native:{extruder:'sherpa',hotend:'tricorn'}}};
const expanded={...heads,mounts:[{id:'fixed'},{id:'stealthchanger'}],toolheads:[{id:'sb'},{id:'sphinx'}],variants:[...heads.variants,fixed,{...fixed,id:'mount_only',fit:{nozzle_mm:[0,0,0]}}]};
const mountedRegistry={...registry,sources:{...registry.sources,sphinx_native:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:[6,9],axis_error_mm:.00083}}};
const both=monolithHeadCatalog(expanded,mountedRegistry,gantries);
assert.equal(both.variants.filter(v=>v.mount==='fixed').length,32);
for(const g of gantries.variants){
 const sc=both.variants.find(v=>v.gantry===g.id&&v.mount==='stealthchanger');
 assert.deepEqual(choicesFor(both,sc,'mount').map(v=>v.id),['fixed','stealthchanger']);
 const standard=resolveVariant(both,{...sc,mount:'fixed'},'mount');
 assert.equal(standard.gantry,g.id);assert.equal(standard.toolhead,'sphinx');assert.equal(standard.belt_width_mm,g.belt_width_mm);
 assert.deepEqual(standard.machine_head.translation,[0,8,0]);assert.deepEqual(standard.machine_head.nozzle_mm,[0,-9.5,-84.5]);
 assert.equal(resolveVariant(both,{...standard,mount:'stealthchanger'},'mount').gantry,g.id);
}
assert.equal(monolithCompanion(expanded,fixed),fixed);
assert(!both.variants.some(v=>v.source_head_configuration==='mount_only'));
console.log('Fixed/SC switching keeps all 32 gantry selections, installs complete Sphinx heads, and exposes both mounting methods.');
const planes=monolithBeltClip({fit:{machine_mount:{belt_preview_cut:{x_mm:[-25.2,25.2],y_mm:[-35,35]}}}});
const clipped=([x,y,z])=>planes.every(([n,c])=>n[0]*x*.001+n[1]*z*.001-n[2]*y*.001+c<0);
assert(clipped([10,-1,8]));assert(!clipped([26,-1,8]));assert(!clipped([0,200,8]));assert(!clipped([0,-200,8]));
assert.deepEqual(monolithBeltClip({mount:'stealthchanger'}),[]);
// Sensor datums follow both the head/carriage registration and the later
// gantry-to-printer translation, exactly like their physical module.
import {withMonolithMachines} from '../site/viewer/monolith-machine-model.mjs';
const sensor={id:'cartographer_v4',coil_bottom_mm:[-.2746,7.0845,-81.8754],coil_nozzle_gap_mm:2.6246,metal_keepout_bounds_mm:[[-12,-5,-80.3],[11,19,-60.3]],physical_passed:true,height_passed:true,metal_keepout_verified:true,minimum_probe_bed_clearance_at_nozzle_contact_mm:.891};
const sensorHead={...fixed,id:'sphinx_probe',probe:'cartographer_v4',fit:{...fixed.fit,probe:sensor},modules:[...fixed.modules,{id:'sphinx_hotend_fan_2510',translation_mm:[0,0,0]},{id:'sphinx_cartographer_v4',translation_mm:[0,0,0]}]};
const sensorHeads={...expanded,variants:[sensorHead],probes:[{id:'cartographer_v4'}]};
const workbench=monolithHeadCatalog(sensorHeads,mountedRegistry,gantries);
for(const v of workbench.variants){assert.deepEqual(v.fit.probe.coil_bottom_mm,[-.2746,15.0845,-81.8754]);assert.deepEqual(v.machine_head.modules.at(-1).translation_mm,[0,8,0]);assert(Math.abs(v.fit.probe.coil_bottom_mm[2]-v.fit.nozzle_mm[2]-sensor.coil_nozzle_gap_mm)<1e-9)}
const machine='fixture',g=gantries.variants[0],shift=[2,5,320];
const printer=withMonolithMachines({machine_id:machine,gantries:[],variants:[],assets:{},sources:[]},sensorHeads,mountedRegistry,{...gantries,source:{url:'https://example.test/native'}},{machines:{[machine]:{family:g.machine,size_mm:g.size_mm,gantry_ids:[g.id],translation_mm:shift}}});
const attached=printer.variants[0];assert.deepEqual(attached.fit.probe.coil_bottom_mm,[1.7254,20.0845,238.1246]);assert.deepEqual(attached.machine_head.modules.at(-1).translation_mm,[2,13,320]);assert.deepEqual(sensorHead.fit.probe.coil_bottom_mm,sensor.coil_bottom_mm);assert.equal(attached.fit.probe.machine_environment_verified,false);
console.log('Sphinx sensor coordinates and physical modules remain aligned through workbench and printer registration.');

// Regression for the exported Sphinx tLW main-body interface, not its fan
// housing bounds. Static clipping and moving routes must share the same cut.
import {sphinxBeltInterface,sphinxBeltPreviewCut} from '../site/viewer/sphinx-belt-interface.mjs';
import {monolithBeltRoute} from '../site/viewer/monolith-belts.mjs';
import fs from 'node:fs';
const nativeRoutes=JSON.parse(fs.readFileSync(new URL('./fixtures/monolith-belt-routes.json',import.meta.url)));
const nativeMouths=JSON.parse(fs.readFileSync(new URL('./fixtures/sphinx-belt-entrances.json',import.meta.url)));
assert.deepEqual(Object.keys(sphinxBeltInterface.source_bodies_sha256).sort(),nativeMouths.entries.map(q=>q.asset).sort());
for(const entry of nativeMouths.entries){
 assert.equal(sphinxBeltInterface.source_bodies_sha256[entry.asset],entry.source_body_sha256);
 assert.equal(entry.finite_entry_edges.length,4);
 for(const edge of entry.finite_entry_edges)for(const p of edge.points_mm){
  assert(Math.abs(p[0]-sphinxBeltInterface.entrance_x_mm[p[0]<0?0:1])<.00001);
  assert(Math.abs(p[1]-sphinxBeltInterface.backing_y_mm)<.00001);
 }
 const source={...fixed,base_asset:entry.asset};
 const reg={...mountedRegistry,sources:{...mountedRegistry.sources,[entry.asset]:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:entry.widths_mm,belt_preview_cut:{x_mm:[-32.49075763926731,32.49075753926731],y_mm:[-35,35]}}}};
 const composed=monolithHeadCatalog({...expanded,variants:[source]},reg,gantries);
 assert.equal(composed.variants.length,entry.widths_mm.length*16);
 for(const v of composed.variants)assert.deepEqual(v.fit.machine_mount.belt_preview_cut.x_mm,entry.support_end_x_mm||sphinxBeltInterface.entrance_x_mm);
}
const sphinxSource={...fixed,base_asset:'head_sphinx_monolith_tricorn'};
const nativeRegistry={...mountedRegistry,sources:{...mountedRegistry.sources,
 [sphinxSource.base_asset]:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:[6,9],belt_preview_cut:{x_mm:[-32.49075763926731,32.49075753926731],y_mm:[-35,35]}}}};
const exact=monolithHeadCatalog({...expanded,variants:[sphinxSource]},nativeRegistry,gantries);
assert.equal(exact.variants.length,32);
for(const v of exact.variants){
 const cut=v.fit.machine_mount.belt_preview_cut;
 assert.deepEqual(cut.x_mm,sphinxBeltInterface.tricorn_support_end_x_mm);
 assert.deepEqual(nativeRegistry.sources[sphinxSource.base_asset].belt_preview_cut.x_mm,[-32.49075763926731,32.49075753926731]);
 const planes=monolithBeltClip(v),inside=p=>planes.every(([n,c])=>n[0]*p[0]*.001+n[1]*p[2]*.001-n[2]*p[1]*.001+c<0);
 for(const sources of Object.values(nativeRoutes.routes))for(const source of sources){
  if(Math.abs(source.width-v.belt_width_mm)>.001)continue;
  const rest=monolithBeltRoute(source,350,0,0,cut);
  for(const delta of [[0,0],[100,100],[-100,-100],[13,-27],[-13,27],[0,0]]){
   const route=monolithBeltRoute(source,350,...delta,cut);
   for(const p of [route.points[0],route.points.at(-1)]){
    const entrance=cut.x_mm[p[0]-delta[0]<0?0:1];
    assert(Math.abs(p[0]-delta[0]-entrance)<1e-8);
    assert(!inside([entrance+Math.sign(entrance)*.01,p[1]-delta[1],source.z]));
    assert(inside([entrance-Math.sign(entrance)*.01,p[1]-delta[1],source.z]));
   }
   assert(Math.abs(route.length-rest.length)<1e-6);
   const channel=sphinxBeltInterface.channel_z_mm[source.z<0?0:1];
   assert(source.z-source.width/2>=channel[0]-.00001&&source.z+source.width/2<=channel[1]+.00001);
   assert(Math.abs(source.segments[0].points[0][1]-source.thickness/2-(sphinxBeltInterface.backing_y_mm+8))<.00001);
  }
 }
}
assert.deepEqual(sphinxBeltPreviewCut('unregistered',{},[0,8,0]),undefined);
assert.throws(()=>sphinxBeltPreviewCut(sphinxSource.base_asset,{origin_mm:[0,-17.5,0]},[0,8,0]),/datum changed/);
assert.deepEqual(sphinxBeltPreviewCut(sphinxSource.base_asset,nativeRegistry.sources[sphinxSource.base_asset],[2,8,0]).x_mm,sphinxBeltInterface.tricorn_support_end_x_mm.map(x=>x+2));
console.log('Source-backed Sphinx mouths: static and moving ends, native 6/9 mm channels, reversed motion/reset, registration immutability and changed-datum rejection passed.');

// The new defect requires finite support area, not just endpoint/box presence.
const tricornLand=nativeMouths.entries.find(e=>e.asset==='head_sphinx_monolith_tricorn');
assert.deepEqual(tricornLand.support_end_x_mm,sphinxBeltInterface.tricorn_support_end_x_mm);
assert.deepEqual(tricornLand.finite_support_faces.map(f=>f.face),[7904,7908,8095,8099]);
for(const width of [6,9])for(const face of tricornLand.finite_support_faces){
 const points=Object.values(face.source_vertices),xs=points.map(p=>Math.abs(p[0]));
 assert.equal(Math.min(...xs),Math.abs(tricornLand.support_end_x_mm[0]));
 assert(Math.max(...xs)-Math.min(...xs)>2.46);
 assert(tricornLand.supported_straight_run_mm*width>14.76);
}

// Exact-zero draw omission is source-bound; tiny positive source facets remain.
import {sphinxSourceTriangleIsExactlyZero} from '../site/viewer/sphinx-belt-attachment.mjs';
const integerCross=points=>{
 const q=points.map(p=>p.map(v=>BigInt(v*2**149))),a=q[1].map((v,k)=>v-q[0][k]),b=q[2].map((v,k)=>v-q[0][k]);
 return [a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
};
assert.equal(nativeMouths.draw_primitive_regression.cases.length,4);
for(const source of nativeMouths.draw_primitive_regression.cases){
 assert.match(source.source_packed_sha256,/^[a-f0-9]{64}$/);
 assert.equal(source.zero_witnesses.length,source.expected_exact_zero_count);
 for(const witness of source.zero_witnesses){
  assert(witness.source_triangle_index<source.source_triangle_count);
  assert.deepEqual(integerCross(witness.positions_m),[0n,0n,0n]);
  assert.equal(sphinxSourceTriangleIsExactlyZero(witness.positions_m),true);
 }
 const positive=source.minimum_positive_source_witness.positions_m;
 assert(integerCross(positive).some(v=>v!==0n));
 assert.equal(sphinxSourceTriangleIsExactlyZero(positive),false);
}
assert.equal(sphinxSourceTriangleIsExactlyZero([[0,0,0],[2**-149,0,0],[0,2**-149,0]]),false);
console.log('Exact source zero primitives are classified without an area threshold; smallest positive Float32 facets remain.');
