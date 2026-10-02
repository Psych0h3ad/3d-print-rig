import assert from 'node:assert/strict';
import {acceptedMountValidation,applyMountValidation,contentSHA256}from '../site/viewer/mount-validation.mjs';
import {probeCheck,probeMetrics,translatedProbeFit}from '../site/viewer/probe-checks.js';
import {translate}from '../site/viewer/i18n.mjs';
const clone=v=>structuredClone(v),digest=await contentSHA256('abc');
assert.equal(digest,'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
const record={state:'clear',source_configurations:['xol_native'],module:'probe_native',translation_mm:[1,2,3],nozzle_mm:[1,-30,80],display_limits_mm:{X:[0,250],Y:[0,250],Z:[0,250]},checked_pairs:1000,methods:{continuous_aabb:999,continuous_native_faces:1}};
const evidence={schema:'3d-print-rig-probe-travel-v1',revision:'probe-travel-v32',model_bundle_sha256:'bundle',clearance_margin_mm:.01,input_sha256:{heads:'h',registry:'r'},machines:{machine:{input_sha256:{meta:'m',profile:'p'},records:[record]}}};
const pins={heads:'h',registry:'r',meta:'m',profile:'p'},bundle={sha256:'bundle'};
const accepted=acceptedMountValidation(evidence,pins,bundle,'machine');assert(accepted);
for(const name of Object.keys(pins))assert.equal(acceptedMountValidation(evidence,{...pins,[name]:'changed'},bundle,'machine'),null);
assert.equal(acceptedMountValidation(evidence,pins,{sha256:'new-bundle'},'machine'),null);
assert.equal(acceptedMountValidation(evidence,pins,bundle,'other'),null);
assert.equal(acceptedMountValidation({...evidence,schema:'unknown'},pins,bundle,'machine'),null);
const source={source_head_configuration:'xol_native',toolhead:'xol',board:'none',mount:'fixed',probe:'beacon_revh',machine_head:{nozzle_mm:[1,-30,80],modules:[{id:'probe_native',translation_mm:[1,2,3]}]},fit:{nozzle_mm:[1,-30,80],probe:{physical_passed:true,height_passed:true,coil_bottom_mm:[1,-30,82.8],coil_nozzle_gap_mm:2.8,minimum_probe_bed_clearance_at_nozzle_contact_mm:1,metal_keepout_verified:true,machine_environment_verified:false}}};
const registry={probe_travel_validation:accepted};const v=clone(source);assert(applyMountValidation(v,registry,'machine'));
assert.equal(probeCheck(v).state,'rigid-travel-checked');assert(probeCheck(v).warning);assert(probeMetrics(v).some(r=>r[0]==='機体側／剛体可動域'));
assert.equal(v.fit.probe.machine_environment_verified,false,'Full machine verification must remain false');
for(const text of [probeCheck(v).label,...probeCheck(v).lines,...probeMetrics(v).flat()])assert(!/[\u3040-\u30ff\u3400-\u9fff]/u.test(translate(text)),text);
for(const edit of [n=>n.machine_head.nozzle_mm[2]+=.1,n=>n.machine_head.modules[0].translation_mm[1]+=.1,n=>n.machine_head.modules[0].id='different',n=>n.source_head_configuration='other',n=>n.mount='stealthchanger',n=>n.machine_gantry={id:'monolith'}]){
 const n=clone(source);edit(n);assert.equal(applyMountValidation(n,registry,'machine'),null);assert.equal(probeCheck(n).state,'unverified');
}
assert.equal(applyMountValidation(clone(source),registry,'other'),null);assert.equal(applyMountValidation(clone(source),registry,'machine','monolith'),null);
const bare=clone(source);bare.source_head_configuration+='__without_sht36';assert(applyMountValidation(bare,registry,'machine'));
const moved=translatedProbeFit(v.fit.probe,[0,0,10]);assert.equal(moved.rigid_machine_travel,undefined);
for(const [field,value,state]of [['physical_passed',false,'body-conflict'],['height_passed',false,'height-conflict'],['metal_keepout_collisions',[{}],'metal-conflict']]){
 const n=clone(v);n.fit.probe[field]=value;assert.equal(probeCheck(n).state,state,'External probe travel evidence cannot suppress a local conflict');
}
assert.equal(source.fit.probe.rigid_machine_travel,undefined);
console.log('Probe travel evidence: exact input pins, native placement, scoped status, local conflicts, moved/changed gantries and bilingual text passed.');
