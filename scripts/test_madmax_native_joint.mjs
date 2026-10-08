import assert from 'node:assert/strict';
import {register} from 'node:module';
import {madmaxJointAssetSpec,madmaxJointApplies,madmaxJointScope} from '../site/viewer/madmax-native-joint.mjs';
// Exercise the production curve with the shipped renderer in a plain Node run.
// This static viewer intentionally has no npm dependency installation.
const threeURL=new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href;
register('data:text/javascript,'+encodeURIComponent(`export async function resolve(specifier,context,next){if(specifier==='three')return {url:${JSON.stringify(threeURL)},shortCircuit:true};return next(specifier,context);}`),import.meta.url);
const {madmaxPtfeApplies,madmaxPtfeCurve,madmaxPtfePort}=await import('../site/viewer/madmax-ptfe.mjs');
const shift=[-.0001879310030119541,-16.399997425107884,359.99999328029236];
const variant={id:madmaxJointScope.variant,mount:'madmax',carriage:'madmax_xol',toolhead:'xol',gantry:'trident_r2',hotend:'rapido2_uhf',extruder:'sherpa_mini',registration_source:'madmax_xol',machine_head:{source_variant:'v21__madmax__xol__sherpa_mini__rapido2_uhf',modules:['madmax_xol_carriage','madmax_mgn12_fasteners'].map(id=>({id,translation_mm:[...shift]}))}};
assert(madmaxJointApplies('voron_trident_250',variant));
for(const machine of ['voron_trident_300','voron_trident_350','siboor_trident_350','voron_v24_250_printed',null])assert(!madmaxJointApplies(machine,variant));
for(const field of ['id','mount','carriage','toolhead','gantry','hotend','extruder','registration_source'])assert(!madmaxJointApplies('voron_trident_250',{...variant,[field]:'different'}),field);
for(const mutate of [v=>v.machine_head.source_variant='different',v=>v.machine_head.modules.pop(),v=>v.machine_head.modules.push(v.machine_head.modules[0]),v=>v.machine_head.modules[0].translation_mm[1]+=.2,v=>v.machine_head.modules=null,v=>v.machine_head.modules[0].translation_mm=[],v=>v.machine_head.modules[0].translation_mm=shift.slice(0,2),v=>v.machine_head.modules[0].translation_mm[1]=NaN,v=>v.machine_head.modules[0].translation_mm[1]=Infinity]){const v=structuredClone(variant);mutate(v);assert(!madmaxJointApplies('voron_trident_250',v));}
const spec={glb:'original.glb',meta:'original.json'},copy={...spec};
for(const id of ['madmax_xol_carriage','madmax_mgn12_fasteners']){const pinned=madmaxJointAssetSpec('voron_trident_250',id,spec);assert(/^[a-f0-9]{64}$/.test(pinned.metadata_sha256));assert(/^[a-f0-9]{64}$/.test(pinned.decoded_model_sha256));assert.equal(pinned.glb,spec.glb);assert.equal(madmaxJointAssetSpec('voron_trident_300',id,spec),spec);}
assert.deepEqual(spec,copy);assert.equal(madmaxJointAssetSpec('voron_trident_250','madmax_xol_carriage',undefined),undefined);
assert.equal(madmaxJointScope.parts.length,5);
console.log('MadMax exact native host/tuple/datum and immutable original asset guards passed. Actual mesh and finite native mating are separate audits.');
const routing={...variant,machine_head:{...variant.machine_head,base:'xol',hidden:[]}};
for(const size of [250,300,350]){
 const machine=`voron_trident_${size}`;assert(madmaxPtfeApplies(machine,routing));
 const r=madmaxPtfeCurve(machine,[-.1,-42.1,413.1176]);assert(r.length_mm>0);assert(r.end_mm.every(Number.isFinite));
 assert(r.curve.getTangentAt(0).distanceTo({x:0,y:1,z:0})<1e-12);
 for(const field of ['id','toolhead','extruder','hotend','mount','carriage','gantry','registration_source'])assert(!madmaxPtfeApplies(machine,{...routing,[field]:'other'}));
 assert(!madmaxPtfeApplies(machine,{...routing,machine_head:{...routing.machine_head,hidden:[madmaxPtfePort.key]}}));
 assert.throws(()=>madmaxPtfeCurve(machine,[0,NaN,0]),/datum/);
}
for(const machine of ['voron_trident_500_custom','siboor_trident_350','voron_v24_350_printed',null])assert(!madmaxPtfeApplies(machine,routing));
console.log('MadMax native ECAS PTFE route: exact supported tuple, hidden-port rejection, native endpoint tangent and invalid datum guards passed.');
