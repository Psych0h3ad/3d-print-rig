import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {gantryChoice,gantryDimensions} from '../site/viewer/gantry-model.js';
import {catalogDimensions,choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
import {headPlan,headPlacement} from '../site/viewer/head-assembly.js';
import {changerDimensions,changerChoice,changerChoices,changerPlacement} from '../site/viewer/toolchanger-model.js';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {auditCommunityInstallations} from './audit_community_installations.mjs';
const root=path.resolve(process.argv[2]||'site'),read=async f=>JSON.parse(await readFile(path.join(root,f),'utf8'));
const gantries=await read('GANTRY_CONFIGURATIONS.json'),heads=withHeadAdditions(await read('TOOLHEAD_CONFIGURATIONS.json'),await read('HEAD_ADDITIONS.json')),library=await read('COMPONENT_LIBRARY.json'),changers=await read('TOOLCHANGER_CONFIGURATIONS.json');
assert(gantries.variants.length>0&&heads.variants.length>0&&library.items.length>0&&changers.variants.length>0);
for(const c of [gantries,heads,changers])assert.equal(new Set(c.variants.map(v=>v.id)).size,c.variants.length);
assert.equal(new Set(library.items.map(v=>v.id)).size,library.items.length);
for(const catalog of [gantries,heads,library,changers])for(const asset of Object.values({...catalog.assets,...catalog.base_assets})){
 if(asset.external){
  const candidates=[];for(const directory of process.argv.slice(3)){try{await access(path.join(directory,asset.files['parts.json'].path));candidates.push(directory)}catch{}}
  assert.equal(candidates.length,1,'Pass exactly one matching external component asset directory');const directory=candidates[0];
  const decoded={};for(const[name,spec]of Object.entries(asset.files)){
   assert(!spec.path.includes('..')&&!/[\\:]/.test(spec.path));const bytes=await readFile(path.join(directory,spec.path));
   assert.equal(bytes.length,spec.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256);
   decoded[name]=spec.encoding==='gzip'?gunzipSync(bytes):bytes;
   if(spec.encoding==='gzip'){assert.equal(decoded[name].length,spec.decoded_bytes);assert.equal(createHash('sha256').update(decoded[name]).digest('hex'),spec.decoded_sha256)}
  }
  const meta=JSON.parse(decoded['parts.json']);assert.equal(meta.id,asset.component_id);assert.equal(meta.parts.length,asset.parts);
 }else{await access(path.join(root,asset.meta));try{await access(path.join(root,asset.glb))}catch{await access(path.join(root,asset.glb+'.gz'))}const meta=await read(asset.meta);assert(meta.parts.length>0)}
}
let gantryTransitions=0;
for(const v of gantries.variants){
 assert.equal(gantryChoice(gantries,v),v);assert(v.modules.every(id=>gantries.assets[id]));assert.equal(v.front,v.xy_motors===2?'FT':'NP');
 for(const dimension of gantryDimensions)for(const value of new Set(gantries.variants.map(row=>row[dimension]))){const next=gantryChoice(gantries,{...v,[dimension]:value});assert.equal(next[dimension],value);gantryTransitions++}
}
let transitions=0;
for(const v of heads.variants){
 const plan=headPlan(v);assert(heads.base_assets[plan.base]);assert(plan.modules.every(m=>heads.assets[m.id]));assert(!plan.modules.some(m=>m.id==='trident_r2_gantry_350'));
 for(const dimension of catalogDimensions(heads))for(const row of choicesFor(heads,v,dimension)){const next=resolveVariant(heads,{...v,[dimension]:row.id},dimension);assert(heads.variants.includes(next));assert.equal(next[dimension],row.id);transitions++}
 if(v.mount==='stealthchanger'){
  assert(v.head_only&&v.modules.some(m=>m.role==='shuttle')&&v.modules.some(m=>m.role==='tool'));
  for(const entry of [...plan.modules,{translation_mm:plan.translation,role:'tool'}])for(const probe of [0,1.5,3]){
   const p=headPlacement(v,entry,{probe,explode:20});assert.equal(p[2],entry.translation_mm[2]+(entry.role==='tool'?probe:0));assert.equal(p[1],entry.translation_mm[1]-(entry.role==='tool'?20:0));
  }
  assert(v.fit.complete_head_native&&['clear','contact','collision'].includes(v.fit.complete_head_native.state));
 }
 if(v.carriage==='vitalii_lightweight'){assert(v.head_only&&v.probe==='none'&&v.fit.carriage_native_body_passed===false);assert(v.fit.carriage_native_body_collisions.length>0);assert(heads.assets[v.inspection_module]);assert.deepEqual(choicesFor(heads,v,'probe').map(p=>p.id),['none'])}
}
assert.equal(heads.variants.filter(v=>v.carriage==='vitalii_lightweight').length,6);
let changerTransitions=0;const unverifiedReferences=[];
for(const v of changers.variants){
 assert.equal(changerChoice(changers,v),v);assert(v.modules.every(m=>changers.assets[m.id]));
 if(!v.native_fit){
  // These are published interface-only source references, explicitly
  // carrying an unverified docking/sensor notice. Keep them separate from
  // complete assemblies with native mating evidence; never count as fit.
  assert(['madmax_mgn9_db_ah','madmax_mgn12_db_ah','madmax_mgn12_xol_a4t'].includes(v.id));
  assert.equal(v.system,'madmax');assert(v.notes.some(n=>n.includes('未検証')));
  unverifiedReferences.push(v.id);
 }else assert(typeof v.native_fit.passed==='boolean'||v.native_fit.scope==='source_reference'&&v.native_fit.passed==null&&(v.native_fit.passed===null||v.native_fit.machine_installation_verified===false));
 let parts=0;for(const e of v.modules){const meta=await read(changers.assets[e.id].meta);const hidden=new Set(e.hidden_keys||[]);for(const key of hidden)assert(meta.parts.some(p=>p.key===key));parts+=meta.parts.filter(p=>!hidden.has(p.key)).length;assert.deepEqual(changerPlacement(v,e),e.translation_mm);if(v.probe_travel_mm)for(const probe of [0,1.5,3])assert.equal(changerPlacement(v,e,{probe})[2],e.translation_mm[2]+(e.role==='tool'?probe:0))}assert.equal(parts,v.parts);
 for(const dimension of changerDimensions)for(const value of changerChoices(changers,v,dimension)){const next=changerChoice(changers,{...v,[dimension]:value},dimension);assert(changers.variants.includes(next));assert.equal(next[dimension],value);changerTransitions++}
}
for(const head of heads.toolheads)assert(heads.variants.some(v=>v.toolhead===head.id));
const referenceExtruders=[];
for(const extruder of heads.extruders)if(!heads.variants.some(v=>v.extruder===extruder.id)){
 assert.equal(extruder.id,'a4t_wwbmg_mount');assert(extruder.label.includes('取付形状'));
 referenceExtruders.push(extruder.id);
}
console.log(JSON.stringify({interface_reference_extruders:referenceExtruders,complete_extruder_fit_verified:false}));
assert(heads.variants.some(v=>v.mount==='stealthchanger'));
assert.equal(heads.variants.filter(v=>v.mount==='tapchanger').length,3);
console.log(JSON.stringify({monolith_assemblies:32,toolchanger_assemblies:changers.variants.length,head_variants:heads.variants.length,complete_stealthchanger_heads:heads.variants.filter(v=>v.mount==='stealthchanger').length,complete_tapchanger_source_assemblies:3,library_items:library.items.length,gantry_choice_transitions:gantryTransitions,head_choice_transitions:transitions,toolchanger_choice_transitions:changerTransitions,unverified_source_interfaces:unverifiedReferences,browser_ui_review:false,physical_fit_certified:false}));

let machineCount=0,machineParts=0,railMounts=0;
const frameForRail={298:299,414:415,440:441,1074:1075,1093:1094,1112:1113,1131:1132};
for(const file of ['V0_MACHINES.json','V24_MACHINES.json','KIT_MACHINES.json']){
 const registry=await read(file);
 for(const m of registry.machines){
  const meta=await read(m.meta),profile=await read(m.profile);assert.equal(meta.machine_id,m.id);assert.equal(profile.machine_id,m.id);assert(meta.parts.length>1000);
  try{await access(path.join(root,m.glb))}catch{await access(path.join(root,m.glb+'.gz'))}
  if(file==='V24_MACHINES.json'){
   const rows=new Map(meta.parts.map(r=>[r.key,r]));let count=0;
   for(const nut of meta.parts.filter(r=>r.key.includes('_tnut_'))){
    const [,rail,index]=nut.key.match(/^v24_rail(\d+)_tnut_(\d+)$/),railKey=`v24_${rail.padStart(5,'0')}`,frameKey=`v24_${String(frameForRail[rail]).padStart(5,'0')}`,boltKey=`v24_rail${rail}_bolt_${index}`;
    assert(nut.name.includes('M3'));assert.equal(nut.rail_mount?.thread,'M3');assert.equal(nut.rail_mount.rail_key,railKey);assert.equal(nut.rail_mount.bolt_key,boltKey);
    assert.equal(nut.method,'native_m3_nut_registered_to_rail_screw');assert.deepEqual(nut.motion_axes,rows.get(railKey).motion_axes);assert.deepEqual(nut.motion_axes,rows.get(boltKey).motion_axes);
    const frame=rows.get(frameKey);for(let a=0;a<3;a++){assert(nut.bounds_mm[0][a]>=frame.bounds_mm[0][a]-.001);assert(nut.bounds_mm[1][a]<=frame.bounds_mm[1][a]+.001)}
    count++;
   }
   assert.equal(count,{250:54,300:61,350:68}[m.size_mm]);railMounts+=count;
  }
  machineCount++;machineParts+=meta.parts.length;
 }
}
assert.equal(machineCount,9);assert.equal(machineParts,12999);assert.equal(railMounts,366);
console.log(JSON.stringify({new_machine_references:machineCount,native_machine_parts:machineParts,registered_M3_rail_mounts:railMounts}));
// Installed community mods are actual native supplements, so every release
// must exercise their visibility, motion, materials and saved configurations.
const community=await read('COMMUNITY_MACHINES_ASSETS.json'),ender=community.machines.ender3_stock_220;
const communityDirectories=[];for(const directory of process.argv.slice(3)){try{await access(path.join(directory,ender.files['machine_profile.json'].path));communityDirectories.push(directory)}catch{}}
assert.equal(communityDirectories.length,1,'Pass exactly one native community machine asset directory');
await auditCommunityInstallations(communityDirectories[0],{indexPath:path.join(root,'COMMUNITY_MACHINES_ASSETS.json')});
