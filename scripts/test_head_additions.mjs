import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {collections,choicesFor,resolveVariant,headBuilderDimensions,importedVariant} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../site/'+f,import.meta.url),'utf8'));
const add=read('HEAD_ADDITIONS.json'),raw={assets:{},base_assets:{},sources:[],variants:[]};
for(const [d,f]of Object.entries(collections)){const supplied=new Set((add[f]||[]).map(o=>o.id));raw[f]=[...new Set(add.variants.map(v=>v[d]))].filter(id=>!supplied.has(id)).map(id=>({id,label:id}));}
const before=JSON.stringify(raw),catalog=withHeadAdditions(raw,add);catalog.dimensions=headBuilderDimensions;
assert.equal(JSON.stringify(raw),before);
const dragonID='head129__dragon_burner__sherpa_mini_a3_r9c__dragon_native';
const dragonAssetID='dragon_burner_v8_sherpa_mini_dragon_native';
const trinityIDs=[...['v05','v06','v07','v08','v09','v10','v11','v12','v13','v14'].map(id=>'trinity87__'+id),
 ...['n05','n06','n19','n20'].map(id=>'trinity88__'+id)];
assert.deepEqual(add.variants.filter(v=>!v.eva).map(v=>v.id).sort(),[...trinityIDs,dragonID].sort(),
 'All 14 Trinity source assemblies and the complete native Dragon recipe are required');
const dragonPrefix='head-coverage/dragon-v8-dragon-sherpa-mini/';
function assertDragonReference(additions,merged){
 const dragon=additions.variants.find(v=>v.id===dragonID),asset=additions.assets[dragonAssetID];
 assert(dragon&&asset,'Complete native Dragon reference is missing');
 assert.deepEqual(Object.fromEntries(['toolhead','mount','extruder','hotend','gantry','carriage','probe','board','cooling','belt_width_mm','base_asset']
  .map(k=>[k,dragon[k]])),{toolhead:'dragon_burner',mount:'chirpy_dragon_v8_native',extruder:'ahi_sherpa_mini_a3',
  hotend:'dragon_native_v2',gantry:'voron_v0r1_native_fixture',carriage:'voron_v0r1_native_fixture',probe:'none',board:'none',
  cooling:'dragon_v8_dual4010_3010_logo',belt_width_mm:6,base_asset:dragonAssetID});
 assert.equal(dragon.hardware_assembled,true);assert.equal(asset.component_id,dragonAssetID);assert.equal(asset.parts,72);
 assert.deepEqual(asset.files['model.glb'],{path:dragonPrefix+'model.glb.gz',bytes:14785920,
  sha256:'693e3456b3748400ca2a1509c4b9366b42db50944563d7df44f794185e7760ee',encoding:'gzip',decoded_bytes:54179324,
  decoded_sha256:'173b14e4a354efc3fc89841536706bff1d0a08c1b45c30913a14620274ab6dc0'});
 for(const[name,relative,bytes,hash]of[
  ['parts.json','parts.json',112509,'c81724bc121b931c206ba0184f2d51a6b28b85cd331756f6bf971cf90500ef03'],
  ['native-proof.json','native-proof.json',18864,'6172f764a8386af7206e40d8272108f57a00db030e01e3ea6d4d2bdac56711bf'],
  ['source-provenance.json','source-provenance.json',5455,'d3de29b261f4e85dbbfee9a6c69d33a0a71726446c42cd578f7904af4c6723f2'],
  ['companion-manifest.json','companion-manifest.json',66344,'7cfe5fa766ac9fd61a1ec6e3d8417b2066a3896dc7c88cf8446bd28d801920ea'],
  ['dragon-v8-dragon-sherpa-mini-source-supplement.zip','source/dragon-v8-dragon-sherpa-mini-source-supplement.zip',125726,
   'b69601de218b8020c81367a4599ab8b4c97d8a576f84387d60e38de1953b50fc'],
 ])assert.deepEqual(asset.files[name],{path:dragonPrefix+relative,bytes,sha256:hash},'Required Dragon source/companion descriptor: '+name);
 assert.equal(dragon.source_file,'V0/Dragon_Burner/CAD/Dragon_Burner_v0.2_v8.step');
 assert.equal(dragon.source_version,'Chirpy cc2e749 / Dragon v8 + native Dragon v2 / Sherpa Mini A3 r9c');
 const chirpy=additions.sources.filter(s=>s.url==='https://github.com/chirpy2605/voron');
 assert.equal(chirpy.length,1);assert.equal(chirpy[0].commit,'cc2e749d09d7f24418f9f8c73c90bcefb1e29584');
 assert.equal(chirpy[0].license,'GPL-3.0; original embedded purchased CAD retains its author terms');
 for(const[field,file]of[['native_review','native-proof.json'],['source_supplement','dragon-v8-dragon-sherpa-mini-source-supplement.zip']]){
  const pin=asset.files[file];assert.deepEqual(dragon[field],{url:asset.external.base_url+pin.path,bytes:pin.bytes,sha256:pin.sha256});
 }
 const fit=dragon.fit.complete_head_native;
 assert.equal(fit.base,dragonAssetID);assert.equal(fit.state,'reference');assert.equal(fit.native_proof,dragonPrefix+'native-proof.json');
 assert.equal(fit.unexpected_body_interferences,0);assert.equal(fit.full_physical_verified,false);
 assert.equal(dragon.fit.nozzle_source_face_id,'0:1:1:3:1@Dragon_Burner_v2 v114/Hotends:1/Dragon_Hotend:1/V6 Nozzle:1#face[20]');
 assert.deepEqual(dragon.base_hidden_keys,['v0r1_source_carriage','mgn7h_block','block_screw_0','block_screw_1','block_screw_2','block_screw_3','carriage_front_nut_0','carriage_front_nut_1']);
 assert.deepEqual(dragon.fit.source_carriage_fixture.keys,dragon.base_hidden_keys);
 assert.equal(dragon.fit.source_carriage_fixture.native_geometry_unchanged,true);
 assert.deepEqual(merged.base_assets[dragonAssetID],asset);assert.deepEqual(merged.variants.find(v=>v.id===dragonID),dragon);
}
assertDragonReference(add,catalog);
const standard=add.variants.filter(v=>v.toolhead==='trinity');
assert.equal(standard.length,4);
assert.deepEqual(standard.map(v=>v.id).sort(),['n05','n06','n19','n20'].map(id=>'trinity88__'+id));
assert(standard.every(v=>v.mount==='fixed'&&v.extruder==='sherpa_r2_standard_short'&&v.hotend==='dragon_ace_volcano'));
assert.equal(standard.filter(v=>v.carriage==='trinity_mgn9').length,2);
assert.equal(add.variants.filter(v=>v.toolhead==='trinity_crossbow').length,10);
let changes=0;
for(const v of add.variants.filter(v=>!v.eva)){
 assert(v.head_only&&!v.machine_head&&!v.registration_source&&v.hardware_assembled);
 assert.deepEqual(headPlan(v).translation,[0,0,0]);assert.equal(headPlan(v).modules.length,0);
 assert.equal(importedVariant(catalog,{configuration:v.id}),catalog.variants.find(r=>r.id===v.id));
 for(const dimension of Object.keys(collections))for(const option of choicesFor(catalog,v,dimension)){
  const next=resolveVariant(catalog,{...v,[dimension]:option.id},dimension);assert(next&&next[dimension]===option.id);changes++;
 }
}
for(const mutate of [a=>a.schema='invalid',a=>a.variants[0].head_only=false,a=>a.variants[0].machine_head=true,a=>a.variants[0].extruder='missing',a=>a.variants[0].head_translation_mm=[0,NaN,0],a=>a.variants[0].modules=[{id:'missing'}],a=>a.variants.push(a.variants[0]),a=>a.toolheads.push(a.toolheads[0]),a=>a.assets[add.variants[0].base_asset].parts=0]){const bad=structuredClone(add);mutate(bad);assert.throws(()=>withHeadAdditions(raw,bad));}
const dragonCounterexamples=[a=>a.variants.splice(a.variants.findIndex(v=>v.id===dragonID),1),
 a=>a.assets[dragonAssetID].parts=71,a=>a.assets[dragonAssetID].files['model.glb'].decoded_sha256='0'.repeat(64),
 a=>delete a.assets[dragonAssetID].files['companion-manifest.json'],a=>delete a.assets[dragonAssetID].files['source-provenance.json'],
 a=>a.sources.find(s=>s.url==='https://github.com/chirpy2605/voron').commit='0'.repeat(40),
 a=>a.variants.find(v=>v.id===dragonID).hardware_assembled=false,
 a=>a.variants.find(v=>v.id===dragonID).hotend='dragon_ace_volcano'];
for(const mutate of dragonCounterexamples){const bad=structuredClone(add);mutate(bad);assert.throws(()=>assertDragonReference(bad,withHeadAdditions(raw,bad)));}
console.log(JSON.stringify({native_head_references:add.variants.length,standard_trinity:standard.length,exact_choice_transitions:changes,
 complete_dragon_reference:dragonID,dragon_parts:72,dragon_source_counterexamples:dragonCounterexamples.length,
 machine_installation_registered:false,strict_invalid_inputs:true,scope:'Catalog/source descriptor fixtures; exported companion/native-solid audits remain separate.'}));
