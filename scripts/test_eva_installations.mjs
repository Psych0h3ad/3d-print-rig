import assert from 'node:assert/strict';
import {evaCommunityIndex,applyEvaInstallation,evaInstallationSupport} from '../site/viewer/eva-installations.mjs';
import {communityConfiguration,validateCommunityState} from '../site/viewer/community-state.mjs';
import {bindEvaSourceMachines} from '../site/viewer/eva-heads.mjs';
const categories=['carriage','core','hotend_mount','hotend','nozzle','extruder','hotend_fan','part_fan','duct','fasteners','probe'];
const hash='a'.repeat(64),clone=structuredClone;
let rejected=0;
for(const generation of [2,3]){
 const id='eva_host_'+generation,configuration='eva_native__'+generation;
 const companions=Object.fromEntries(categories.map(c=>[c,[c]]));
 const row={machine_id:id,generation,configuration,label:'EVA '+generation,belt_width_mm:generation===2?6:9,source_revision:'b'.repeat(40),
  model_sha256:hash,manifest_sha256:hash,profile_sha256:hash,source_step_sha256:hash,native_review_sha256:hash,
  head_parts:categories.length,head_keys:Object.fromEntries(categories.map(c=>[c,'native_'+c])),companions,
  source:{author:'EVA',version:'Pinned source',license:'CC-BY-NC-SA-4.0'},notices:['Native source assembly']};
 const files=Object.fromEntries(['model.glb','assembly_manifest.json','machine_profile.json'].map(n=>[n,{sha256:hash,decoded_sha256:hash}]));
 const source={machines:{[id]:{machine_id:id,parts:categories.length,files}}},registry={schema:'3d-print-rig-eva-installations-v1',machines:{[id]:row}};
 const index=evaCommunityIndex(source,registry);assert.equal(source.machines[id].eva_installation,undefined);
 assert.deepEqual(index.machines[id].eva_installation,row);
 for(const mutate of [r=>r.schema='wrong',r=>r.machines[id].model_sha256='0'.repeat(64),r=>r.machines[id].manifest_sha256='0'.repeat(64),r=>r.machines[id].profile_sha256='0'.repeat(64)]){
  const bad=clone(registry);mutate(bad);assert.throws(()=>evaCommunityIndex(source,bad));rejected++;
 }
 const manifest={machine_id:id,native_leaf_count:categories.length,reference_leaves:[],parts:categories.map(c=>({key:'native_'+c,group:'head'}))},profile={machine_id:id,source:{source_step_sha256:hash},axes:{x:[-10,10],y:[-10,10],z:[0,100]},basis:[[1,0,0],[0,0,1],[0,-1,0]],motions:{head:['x','y',0]}};
 const result=applyEvaInstallation(manifest,profile,row);assert.equal(profile.configurations,undefined);
 assert.equal(communityConfiguration(result.profile,configuration).eva_generation,generation);
 assert.equal(communityConfiguration(result.profile,'stock').source_head_configuration,configuration);
 assert.throws(()=>communityConfiguration(result.profile,'another-generation'));
 for(const mutate of [r=>r.generation=1,r=>r.head_parts++,r=>r.native_review_sha256='unverified',r=>r.source_step_sha256='0'.repeat(64),r=>r.head_keys.nozzle='missing',r=>r.head_keys.nozzle=r.head_keys.hotend,r=>delete r.companions.hotend_fan,r=>r.companions.fasteners=['missing']]){
  const bad=clone(row);mutate(bad);assert.throws(()=>applyEvaInstallation(manifest,profile,bad));rejected++;
 }
 for(const material of [{color_linear:[0,0,0],metalness:0,roughness:1},{color_linear:[NaN,0,0],metalness:0,roughness:1},{color_linear:[0,0,0],metalness:-1,roughness:1}]){const bad=clone(row);bad.purchased_materials={missing:material};assert.throws(()=>applyEvaInstallation(manifest,profile,bad));rejected++;}
 const detached=clone(manifest);detached.parts.find(p=>p.key==='native_carriage').group='fixed';assert.throws(()=>applyEvaInstallation(detached,profile,row));rejected++;
 for(const mutate of [m=>m.reference_leaves=m.native_leaf_count,m=>m.reference_leaves=['missing'],m=>m.reference_leaves=['native_core','native_core'],m=>m.native_leaf_count++]){const bad=clone(manifest);mutate(bad);assert.throws(()=>applyEvaInstallation(bad,profile,row));rejected++;}
 const variant={id:configuration,toolhead:'eva_'+generation,belt_width_mm:row.belt_width_mm,extruder:'lgx',hotend:'native',probe:'probe',fit:{},eva:{generation,source_revision:row.source_revision,companions,source_machine:{id,decoded_model_sha256:hash,manifest_sha256:hash}}};
 const heads={variants:[variant],toolheads:[{id:variant.toolhead,label:'EVA'}],extruders:[{id:'lgx',label:'LGX'}],hotends:[{id:'native',label:'Native hotend'}],probes:[{id:'probe',label:'Probe'}]};
 const support=evaInstallationSupport(row,heads);assert.equal(support.variants.length,1);assert.equal(support.variants[0].id,configuration);
 for(const mutate of [h=>h.variants[0].eva.generation=4,h=>h.variants[0].eva.source_revision='wrong',h=>h.variants[0].eva.companions.nozzle=['wrong'],h=>h.variants[0].belt_width_mm=5,h=>h.hotends=[]]){
  const bad=clone(heads);mutate(bad);assert.throws(()=>evaInstallationSupport(row,bad));rejected++;
 }
 const bindings={};bindEvaSourceMachines(heads,bindings,index);assert.equal(bindings.eva_installation_configurations[configuration],configuration);
 const reviewed=clone(row);reviewed.mount_review={mount_verified:true,axis_error_mm:1e-8,fastener_keys:['native_fasteners'],rail_keys:['rail'],native_scope:'Opposing native mounting planes and four shaft/bore axes.',full_physical_fit_certified:false};
 const nativeManifest=clone(manifest);nativeManifest.parts.push({key:'rail',group:'fixed'});nativeManifest.native_leaf_count++;
 applyEvaInstallation(nativeManifest,profile,reviewed);
 const checkedIndex=clone(index);checkedIndex.machines[id].eva_installation=reviewed;
 bindEvaSourceMachines(heads,bindings,checkedIndex);assert.equal(variant.fit.native_installation.mount_verified,true);
 bindEvaSourceMachines(heads,bindings,{machines:source.machines});assert.equal(variant.fit.native_installation,undefined,'Stale native review persisted after removing installation');
 for(const mutate of [r=>r.mount_review.axis_error_mm=Infinity,r=>r.mount_review.fastener_keys=['missing'],r=>r.mount_review.rail_keys=['missing'],r=>r.mount_review.full_physical_fit_certified=true]){const bad=clone(reviewed);mutate(bad);assert.throws(()=>applyEvaInstallation(nativeManifest,profile,bad));rejected++;}
 const state={schema:'3d-print-rig.community.v1',machine:id,configuration,axes:{x:0,y:0,z:50},palette:{base:'#ff00ff',accent:'#00ff00',frame:'#eeeeee'},night:false,grid:false,references:false,camera:{position:[1,1,1],target:[0,0,0],up:[0,1,0]}};
 assert.deepEqual(validateCommunityState(JSON.parse(JSON.stringify(state)),result.profile),state);
 assert.throws(()=>validateCommunityState({...state,configuration:'eva_native__'+(generation===2?3:2)},result.profile));
 // Newly exported hosts must enter the same production catalog atomically.
 const extra=clone(registry);extra.machines[id].asset=source.machines[id];assert.throws(()=>evaCommunityIndex(source,extra));
 assert.equal(evaCommunityIndex({machines:{}},extra).machines[id].machine_id,id);
}
console.log(JSON.stringify({passed:true,generations:[2,3],rejected_inputs:rejected,scope:'Native host identity, complete moving companions, exact selections, stale asset rejection and save/load. Actual meshes and native solid travel require separate release audits.'}));
