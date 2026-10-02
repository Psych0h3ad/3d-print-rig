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
