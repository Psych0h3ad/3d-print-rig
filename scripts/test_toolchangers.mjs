import assert from 'node:assert/strict';
import {changerChoice,changerChoices,changerPlacement} from '../site/viewer/toolchanger-model.js';
const c={assets:{},variants:[]};
for(const system of ['stealthchanger','tapchanger'])for(const iface of system==='stealthchanger'?['standard_6','standard_9','monolith_6','monolith_9']:['source'])for(const toolhead of system==='stealthchanger'?['sb','xol','dragon']:['sb_rods','liftbar']){
 const id=[system,iface,toolhead].join('_');c.assets[id]={meta:id+'.json',glb:id+'.glb'};
 c.variants.push({id,system,interface:iface,toolhead,probe_travel_mm:system==='stealthchanger'?[0,3]:null,modules:[{id,role:system==='stealthchanger'?'tool':'reference',translation_mm:[0,-5.6,0]}]});
}
for(const v of c.variants){
 assert.equal(changerChoice(c,v),v);
 for(const key of ['system','interface','toolhead'])for(const choice of changerChoices(c,v,key)){
  const next=changerChoice(c,{...v,[key]:choice},key);assert.equal(next[key],choice);assert(c.variants.includes(next));
 }
 const entry=v.modules[0],original=[...entry.translation_mm];
 assert.deepEqual(changerPlacement(v,entry),original);
 if(v.probe_travel_mm){
  assert.deepEqual(changerPlacement(v,entry,{probe:3,explode:20}),[0,-25.6,13]);
  for(const role of ['shuttle','dock','reference'])assert.deepEqual(changerPlacement(v,{...entry,role},{probe:3,explode:20}),original);
  assert.throws(()=>changerPlacement(v,entry,{probe:3.01}));
 }else assert.throws(()=>changerPlacement(v,entry,{probe:1}));
 assert.deepEqual(entry.translation_mm,original);
 for(const options of [{probe:NaN},{probe:-1},{explode:-1},{explode:50.01},{explode:Infinity}])assert.throws(()=>changerPlacement(v,entry,options));
 assert.throws(()=>changerChoice({...c,assets:{}},v));
}
assert.throws(()=>changerChoice(c,{system:'missing'},'system'));
assert.throws(()=>changerChoice(c,{toolhead:'unknown'},'toolhead'));
assert.equal(changerChoice(c,{...c.variants[0],system:'tapchanger'},'system').interface,'source');
assert.equal(changerChoice(c,{...c.variants.at(-1),system:'stealthchanger'},'system').system,'stealthchanger');
// YUDX separates the hotend horizontally, with no invented probing stroke.
const yudx={id:'yudx_assembly',system:'yudx',interface:'yudx_mgn12',toolhead:'yudx_assembly',probe_travel_mm:null,modules:[{id:'yudx',role:'tool',translation_mm:[0,0,0],explode_vector_mm:[0,-1,0]}]};
c.assets.yudx={meta:'yudx.json',glb:'yudx.glb'};c.variants.push(yudx);
assert.equal(changerChoice(c,{...c.variants[0],system:'yudx'},'system'),yudx);
assert.deepEqual(changerChoices(c,yudx,'interface'),['yudx_mgn12']);
for(const explode of [0,1,25,50])assert.deepEqual(changerPlacement(yudx,yudx.modules[0],{explode}),[0,explode===0?0:-explode,0]);
assert.throws(()=>changerPlacement(yudx,yudx.modules[0],{probe:1}));
assert.throws(()=>changerPlacement(yudx,{...yudx.modules[0],explode_vector_mm:[0,NaN,0]},{explode:1}));
console.log('Toolchanger selections, asset completeness and declared probe/explode motion passed.');

// Dock catalog membership must never authorize a whole machine conversion.
// Exercise the same fail-closed checks used by the actual-asset bank auditor.
const {register}=await import('node:module');register('./three-test-loader.mjs',import.meta.url);
const {assertReferenceDockScope,assertBankHostFrame,assertChainPresent,adaptiveChainDrops}=await import('./audit_changer_banks.mjs');
const {initialBank,normalizeBank,bankPlan,bankChoices,bankCapacity,bankBedReferenceDrop}=await import('../site/viewer/changer-bank-model.mjs');
const {tridentChainPins}=await import('../site/viewer/bed-chain-pins.mjs');
const originalFrame={key:'native_frame_leaf',bounds_mm:[[-200,-230,480],[200,-210,500]]};
const mount={capacity:4,frame_part_key:originalFrame.key,frame_meta:'native_host.json',frame_bounds_mm:structuredClone(originalFrame.bounds_mm),center_x_mm:0,translation_mm:[0,-215,300],bed_reference_top_mm:303.25,bed_max_up_mm:9.3671,bank_permitted:false,print_setup_verified:false};
const bankData={machines:{voron_trident_300:mount},profiles:[{selection:{toolhead:'xol'},dock:'source_dock',park_translation_mm:[0,68,73]}],indx:{machines:{voron_trident_300:{...mount,bank_permitted:undefined}},reference_geometry_only:true}};
for(const system of ['stealthchanger','indx','madmax'])assertReferenceDockScope(bankData,'voron_trident_300',system);
for(const system of ['stealthchanger','indx'])for(const key of ['print_setup_verified','full_travel_verified','automatic_docking_verified','whole_installation_verified']){
 const bad=structuredClone(bankData),spec=system==='indx'?bad.indx:bad;spec.machines.voron_trident_300[key]=true;
 assert.throws(()=>assertReferenceDockScope(bad,'voron_trident_300',system),/missing whole-installation proof/);
 spec.machines.voron_trident_300[key]=false;spec[key]=true;
 assert.throws(()=>assertReferenceDockScope(bad,'voron_trident_300',system),/missing whole-installation proof/);
}
assert.throws(()=>assertReferenceDockScope(bankData,'unregistered_host','indx'),/unregistered host/);
assert.throws(()=>assertReferenceDockScope({...bankData,indx:{...bankData.indx,reference_geometry_only:false}},'voron_trident_300','indx'),/reference scope/);
assertBankHostFrame(mount,{parts:[originalFrame]});
for(const parts of [[],[originalFrame,originalFrame],[{...originalFrame,key:'other_host'}],[{...originalFrame,bounds_mm:[[-200,-230,479],[200,-210,500]]}],[{...originalFrame,bounds_mm:[[NaN,0,0],[1,1,1]]}]])assert.throws(()=>assertBankHostFrame(mount,{parts}));
const sc={id:'installed_sc',source_head_configuration:'native_sc',mount:'stealthchanger',toolhead:'xol',gantry:'trident_r2',machine_head:{}},mm={...sc,id:'installed_madmax',source_head_configuration:'native_madmax',mount:'madmax',registration_source:'madmax_xol'};
const bankCatalog={machine_id:'voron_trident_300',variants:[sc,mm]},empty=initialBank(bankCatalog,bankData,sc.gantry);
assert.deepEqual(empty,{enabled:false,active:0,tools:[]});
for(const state of [{enabled:true,active:0,tools:[sc.source_head_configuration]},{enabled:true,active:0,tools:[]}])assert.throws(()=>bankPlan(state,bankCatalog,bankData,sc));
const disabledMadmax=initialBank(bankCatalog,bankData,mm.gantry,'madmax');assert.equal(disabledMadmax.enabled,false);assert.equal(bankCapacity(bankData,bankCatalog.machine_id,'madmax'),1);
assert.deepEqual(normalizeBank(JSON.parse(JSON.stringify(disabledMadmax)),bankCatalog,bankData,mm.gantry),disabledMadmax);
assert.throws(()=>bankPlan({...disabledMadmax,enabled:true},bankCatalog,bankData,mm));
for(const gantry of ['monolith_VT_300_printed_6_2wd','monolith_VT_300_sheet_metal_9_awd'])for(const system of ['stealthchanger','indx','madmax'])assert.deepEqual(bankChoices(bankCatalog,bankData,gantry,system),[]);
const aboveBed={...sc,fit:{nozzle_mm:[0,0,330]}};
assert.equal(bankBedReferenceDrop(bankCatalog,bankData,empty,aboveBed),-mount.bed_max_up_mm);
assert.equal(bankBedReferenceDrop(bankCatalog,bankData,{...empty,enabled:true},aboveBed),-mount.bed_max_up_mm);
assert(aboveBed.fit.nozzle_mm[2]-(mount.bed_reference_top_mm+mount.bed_max_up_mm)>0,'Bed datum must expose unreachable nozzle gap');
// Negative tests model audit state only; no fixture geometry substitutes for
// missing purchased hardware or a native-solid clearance proof.
const chainFixture=()=>({entries:Array.from({length:20},(_,i)=>({row:{key:String(i)},mesh:{isMesh:true,visible:true,parent:{visible:true,parent:{visible:true}},geometry:{attributes:{position:{count:3}}},matrixWorld:{elements:[1,0,0,1]},updateWorldMatrix(){}}})),endParts:[]});
assertChainPresent(chainFixture());assert.throws(()=>assertChainPresent(null),/Missing actual/);
for(const mutate of [c=>c.entries.pop(),c=>c.entries[0].mesh.visible=false,c=>c.entries[0].mesh.parent.parent.visible=false,c=>c.entries[0].mesh.matrixWorld.elements[0]=NaN,c=>c.entries[0].mesh.geometry.attributes.position.count=0]){const chain=chainFixture();mutate(chain);assert.throws(()=>assertChainPresent(chain));}
for(const pins of Object.values(tridentChainPins)){const drops=adaptiveChainDrops(pins,-9.3671,250);assert(drops.length>3);assert.equal(drops[0],-9.3671);assert.equal(drops.at(-1),250);assert(drops.includes((-9.3671+250)/2));}
console.log('Dock source/host/qualification gates, legacy/save-load rejection, native bed limit and vanished-chain negative regressions passed. Actual exported assets and native-solid clearance require separate runs.');
