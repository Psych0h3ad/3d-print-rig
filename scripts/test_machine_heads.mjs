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
registry.sources.stealthchanger_9={origin_mm:[0,4,6]};
assert.deepEqual(installedHeadPlan(sc9,registry,registry.machines.nine.gantries.awd).translation_delta_mm,[0,-4,354]);
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
// Author Sphinx tLW has its own rail plane and only registered 6 mm clamps.
registry.sources.sphinx_voron={origin_mm:[0,-7.5,0],axis_error_mm:.00083};
const sphinx=head('sphinx_native','sphinx','fixed','sphinx_voron',6);sphinx.registration_source='sphinx_voron';sphinx.base_asset='sphinx_original';sphinx.head_only=true;sphinx.extruder='sherpa_r2_standard_short';sphinx.hotend='tricorn';sphinx.carriage='source';sphinx.fit.nozzle_mm=[0,-17.5,-84.5];sphinx.modules=[{id:'sherpa_original',translation_mm:[0,0,0],role:'tool'},{id:'hotend_original',translation_mm:[0,0,0],role:'tool'}];
const sphinxHeads={...heads,variants:[sphinx]};const sphinxPlaced=machineHeadVariants(sphinxHeads,registry,'six');assert.equal(sphinxPlaced.length,1);assert.deepEqual(sphinxPlaced[0].machine_head.translation,[0,.5,136]);assert.deepEqual(sphinxPlaced[0].machine_head.nozzle_mm,[0,-17,51.5]);assert.equal(sphinxPlaced[0].probe,'none');assert.equal(sphinxPlaced[0].machine_head.modules.length,2);assert.equal(sphinxPlaced[0].source_head_configuration,'sphinx_native');assert.equal(machineHeadVariants(sphinxHeads,registry,'nine','awd').length,0);
assert.deepEqual(sphinx.fit.nozzle_mm,[0,-17.5,-84.5]);
// Archived generations have distinct native planes. An unregistered name or
// the incomplete single-inlet source assembly must not reach machine menus.
registry.sources.sphinx_v3_tricorn_7040={origin_mm:[0,14.3,62.75],axis_error_mm:2e-8};
const v3={...sphinx,id:'v3',registration_source:'sphinx_v3_tricorn_7040',cooling:'v3_ws7040',fit:{nozzle_mm:[0,0,0]}};
const legacy={...v3,id:'legacy',registration_source:'sphinx_single_inlet'};
const missing={...v3,id:'missing_v3',registration_source:'sphinx_v3_missing'};
const generations={...heads,variants:[sphinx,v3,legacy,missing]};
const placedV3=machineHeadVariants(generations,registry,'six');
assert.deepEqual(placedV3.map(v=>v.source_head_configuration),['sphinx_native','v3']);
assert.deepEqual(placedV3[1].machine_head.nozzle_mm,[0,-21.3,73.25]);
assert.equal(machineHeadVariants(generations,registry,'nine','awd').length,0);
// A4T uses a complete Xol carriage registration, with width-specific clamps.
registry.sources.a4t_xol_carriage_6={origin_mm:[0,-7,360]};
registry.sources.a4t_xol_carriage_9={origin_mm:[0,0,360]};
const a4t=head('a4t6','a4t','fixed','a4t_xol_carriage_6',6);
a4t.registration_source='a4t_xol_carriage_6';a4t.carriage='a4t_xol';a4t.base_asset='assembled_a4t';a4t.head_translation_mm=[0,-63.2,354.4];a4t.fit.nozzle_mm=[0,-31.35,310.9];a4t.modules=[{id:'a4t_xol_carriage_6',translation_mm:[0,-7,0],role:'tool'}];
const a4t9={...a4t,id:'a4t9',registration_source:'a4t_xol_carriage_9',belt_width_mm:9,gantry:'a4t_xol_carriage_9',head_translation_mm:[0,-56.2,354.4],modules:[{id:'a4t_xol_carriage_9',translation_mm:[0,0,0],role:'tool'}]};
const a4tHeads={...heads,variants:[a4t,a4t9,{...a4t,id:'unregistered',registration_source:'a4t_unregistered'}]};
const sixA4t=machineHeadVariants(a4tHeads,registry,'six');
assert.deepEqual(sixA4t.map(v=>v.source_head_configuration),['a4t6']);
assert.deepEqual(sixA4t[0].machine_head.modules[0].translation_mm,[0,-7,-224]);
assert.deepEqual(machineHeadVariants(a4tHeads,registry,'nine','awd').map(v=>v.source_head_configuration),['a4t9']);
assert.equal(sixA4t[0].fit.machine_mount.full_travel_verified,false);
