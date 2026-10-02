import assert from 'node:assert/strict';
import {installedHeadPlan,machineHeadVariants,expandedPrinterCatalog} from '../site/viewer/machine-head-model.mjs';
import {choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
const registry={sources:{stealthchanger:{origin_mm:[0,10,6]},kit_fixed:{origin_mm:[0,0,360]},r2_fixed:{origin_mm:[0,-7,360]},indx:{origin_mm:[0,34,8]}},native_nozzle_points:{indx_base:[0,0,-32],stealthburner:[0,-29,303]},assets:{head_indx_rail_fasteners:{}},machines:{six:{origin_mm:[0,-7,136],belt_width_mm:6,xy_motors:2},nine:{gantries:{awd:{origin_mm:[0,0,360],belt_width_mm:9,xy_motors:4}}}}};
const head=(id,toolhead,mount,gantry,width)=>({id,toolhead,mount,gantry,belt_width_mm:width,extruder:'drive',hotend:'hot',carriage:'standard',probe:'none',board:'none',cooling:'source',head_translation_mm:[0,0,0],modules:[],notes:[],fit:{nozzle_mm:[0,-28,-40]}});
const fixed=head('sb','stealthburner','fixed','trident_r2',6);fixed.fit.nozzle_mm=null;fixed.head_translation_mm=[0,-7,-3];
const sc6=head('sc6','jabberwocky','stealthchanger','sc_standard_6',6),sc9=head('sc9','jabberwocky','stealthchanger','sc_standard_9',9);
sc6.modules=[{id:'tool',role:'tool',translation_mm:[0,-5,0],hidden_keys:['support']},{id:'dock',role:'dock',translation_mm:[0,0,0]}];
const indx=head('indx','indx','indx','indx_mgn12',6);indx.base_asset='indx_base';indx.fit={};
const heads={variants:[fixed,sc6,sc9,indx],sources:[],assets:{},base_assets:{},toolheads:['stealthburner','jabberwocky','indx'].map(id=>({id})),mounts:['fixed','stealthchanger','indx'].map(id=>({id})),extruders:[{id:'drive'}],hotends:[{id:'hot'}],carriages:[{id:'standard'}],probes:[{id:'none'}],boards:[{id:'none'}],cooling_options:[{id:'source'}]};
const snapshot=JSON.stringify(heads),target=registry.machines.six;
assert.deepEqual(installedHeadPlan(fixed,registry,target).nozzle_mm,[0,-36,76]);
const sc=installedHeadPlan(sc6,registry,target);assert.deepEqual(sc.modules.map(m=>m.id),['tool']);assert.deepEqual(sc.modules[0].translation_mm,[0,-22,130]);assert.deepEqual(sc.modules[0].hidden_keys,['support']);
const ip=installedHeadPlan(indx,registry,target);assert.deepEqual(ip.nozzle_mm,[0,-41,96]);assert.equal(ip.modules.at(-1).id,'head_indx_rail_fasteners');
assert.deepEqual(machineHeadVariants(heads,registry,'six').map(v=>v.source_head_configuration),['sb','sc6','indx']);
assert.deepEqual(machineHeadVariants(heads,registry,'nine','awd').map(v=>v.source_head_configuration),['sc9']);
assert.deepEqual(machineHeadVariants(heads,registry,'missing'),[]);
assert.deepEqual(machineHeadVariants(heads,registry,'nine','missing'),[]);
for(const machine of ['six','nine'])for(const v of machineHeadVariants(heads,registry,machine,machine==='nine'?'awd':undefined)){assert(v.machine_head.nozzle_mm.every(Number.isFinite));assert.equal(v.fit.machine_mount.full_travel_verified,false);assert.equal(v.fit.machine_mount.docking_registered,false)}
const old={...heads,machine_id:'nine',gantries:[{id:'awd'}],variants:[{...fixed,id:'stock',gantry:'awd',extruder:'cw2',modules:[],removed_stock_keys:['100']}],sources:[]};
const expanded=expandedPrinterCatalog(old,heads,registry,'nine');assert.equal(expanded.variants.length,2);assert.equal(expanded.variants[0].id,'stock');assert(expanded.variants[1].removed_stock_keys.includes('412'));assert(!expanded.variants[1].removed_stock_keys.includes('202'));assert.equal(expanded.variants[1].belt_width_mm,9);
assert.deepEqual(choicesFor(expanded,expanded.variants[0],'toolhead').map(v=>v.id),['stealthburner','jabberwocky']);assert.equal(resolveVariant(expanded,{...expanded.variants[0],toolhead:'jabberwocky'},'toolhead').source_head_configuration,'sc9');
assert.equal(JSON.stringify(heads),snapshot);assert.equal(old.variants.length,1);
// Native kit SB and R2 SB use different rail origins. A fixed extruder or
// cooling option must reach machine menus without duplicating an old pose.
const kit=head('kit_orbiter','stealthburner','fixed','siboor_awd',9);kit.extruder='orbiter2';kit.fit.nozzle_mm=[0,-29,303];
const kitPlan=installedHeadPlan(kit,registry,registry.machines.nine.gantries.awd);assert.deepEqual(kitPlan.translation,[0,0,0]);assert.deepEqual(kitPlan.nozzle_mm,[0,-29,303]);
const extra={...heads,variants:[...heads.variants,kit],extruders:[...heads.extruders,{id:'orbiter2',label:'SB Orbiter'}]};
const withFixed=expandedPrinterCatalog(old,extra,registry,'nine');assert.equal(withFixed.variants.length,3);assert(withFixed.variants.some(v=>v.extruder==='orbiter2'&&v.mount==='fixed'&&v.machine_head));
assert.equal(resolveVariant(withFixed,{...withFixed.variants[0],extruder:'orbiter2'},'extruder').source_head_configuration,'kit_orbiter');
const duplicate={...kit,id:'other_source_id',extruder:'cw2'};assert.equal(expandedPrinterCatalog(old,{...extra,variants:[...extra.variants,duplicate]},registry,'nine').variants.length,3);
const recollection=expandedPrinterCatalog({...old,extruders:[{id:'drive',label:'old'}]},extra,registry,'nine');assert.equal(recollection.extruders.find(r=>r.id==='orbiter2').label,'SB Orbiter');
assert.throws(()=>installedHeadPlan({...fixed,toolhead:'unknown',base_asset:'unknown'},registry,target),/ノズル/);
// A source head with its own rail datum must use that datum and retain
// its original belt-width scope when offered on another printer.
registry.sources.crowncooler={origin_mm:[0,14.5,0]};
const crown=head('crown','crowncooler','fixed','head_mgn12',6);crown.registration_source='crowncooler';crown.base_asset='native_crown';crown.fit.nozzle_mm=[0,-14.6,-59.4];
const crownPlan=installedHeadPlan(crown,registry,target);assert.deepEqual(crownPlan.translation,[0,-21.5,136]);assert.deepEqual(crownPlan.nozzle_mm,[0,-36.1,76.6]);
const newHeads={...heads,variants:[...heads.variants,crown]};assert(machineHeadVariants(newHeads,registry,'six').some(v=>v.toolhead==='crowncooler'));assert(!machineHeadVariants(newHeads,registry,'nine','awd').some(v=>v.toolhead==='crowncooler'));
console.log('Machine head rail placement, belt widths, native nozzle fallback, preserved stock configurations and dependent choices passed.');
const probed={...sc6,id:'sc6_probe',probe:'beacon',fit:{...sc6.fit,probe:{coil_bottom_mm:[0,-10,-37],coil_nozzle_gap_mm:3,metal_keepout_bounds_mm:[[-10,-20,-35],[10,0,-15]]}}};
const placed=machineHeadVariants({...heads,variants:[probed]},registry,'six')[0];
assert.deepEqual(placed.fit.probe.coil_bottom_mm,[0,-27,93]);assert.deepEqual(placed.fit.probe.metal_keepout_bounds_mm,[[-10,-37,95],[10,-17,115]]);
assert.equal(placed.fit.probe.coil_bottom_mm[2]-placed.fit.nozzle_mm[2],3);assert.equal(placed.fit.probe.machine_environment_verified,false);
assert.deepEqual(probed.fit.probe.coil_bottom_mm,[0,-10,-37]);
