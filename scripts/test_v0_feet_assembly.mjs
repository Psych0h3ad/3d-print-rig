import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {createV0FeetAssembly} from '../site/viewer/v0-feet-assembly.mjs';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
const catalogBytes=await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),catalog=JSON.parse(catalogBytes),stageHash=createHash('sha256').update(catalogBytes).digest('hex');
let positive=0,negative=0;
for(const[mid,spec]of Object.entries(catalog.machines)){
 const r1=mid==='voron_v02r1_120',prefix=r1?'v02r1_':'v02_',key=n=>prefix+String(n).padStart(5,'0'),policy=createV0FeetAssembly(spec,mid),index=id=>spec.stages.findIndex(s=>s.id===id),stage=id=>spec.stages[index(id)],shown=id=>new Set(spec.stages.slice(0,index(id)+1).flatMap(s=>s.part_keys));
 const expected=r1?{'feet-front':[606,607,608,609,611,615,616,617],'feet-inlet-prep':[590,598,599,600,602],'feet-rear-plain':[634,636,637,638,639],'feet-runout':[619,623,624,626,628,629,630],'feet-runout-switch':[619,623,624,625,626,627,628,629,630],'z-motor':[542,543,544,545,547]}:
 {'feet-front':[594,599,600,601,602,604,608,609],'feet-inlet-prep':[581,583,591,592,593],'feet-rear-plain':[610,614,615,616,617],'z-motor':[533,534,535,536,538]};
 for(const[id,values]of Object.entries(expected)){
  const input=shown(id),output=policy.filter(index(id),input);assert.deepEqual(output,new Set(values.map(key)),id);assert.deepEqual(new Set(policy.focus(index(id))),output);assert(policy.at(index(id)).isolated);assert.deepEqual(new Set(policy.stored(index(id),input)),new Set([...input].filter(k=>!output.has(k))));positive++;
 }
 const long=r1?[591,605,614,622,633]:[584,598,607,613],accent=r1?[620,621,631,632,635,640]:[611,612,618],motorFrame=r1?[546,548,549,550]:[537,539,540,541],top=r1?[457,473]:[448,464],motorNuts=r1?[551,552,553,554]:[542,543,544,545],inletNuts=r1?[596,597]:[589,590];
 for(const n of long){assert.equal(spec.stages.find(s=>s.part_keys.includes(key(n))).id,'feet-inlet');assert(!shown('feet-rear-plain').has(key(n)));positive++}
 for(const n of accent){assert.equal(spec.stages.find(s=>s.part_keys.includes(key(n))).id,'feet-accents');positive++}
 const manifest={machine_id:mid,parts:spec.stages.flatMap(s=>s.part_keys).map(key=>({key,name:key}))},workbench=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':stageHash}});
 const old={schema:'assembly-workbench-progress-v2',identity:{...workbench.identity,stages_sha256:'2baa9a7d9ea85ec661d6d9b59055a4a68b0ec436e54f96ab7d7019ef17dafaa5'},current_stage:'feet-inlet',checked_stages:['feet-inlet','z-motor'],checked_parts:[key(long[0]),key(accent[0]),key(motorFrame[0])]};
 const migrated=validateAssemblyProgress(workbench,old);assert.deepEqual(new Set(migrated.checked_parts),new Set(old.checked_parts));assert.deepEqual(migrated.checked_stages,old.checked_stages);assert(!migrated.checked_stages.includes('feet-inlet-prep'));assert(!migrated.checked_stages.includes('z-motor-mount'));positive++;
 assert.deepEqual(policy.at(index('feet-rear-plain')).direction,[-1,.35,.5]);positive++;
 for(const n of motorFrame){assert(!stage('z-motor').part_keys.includes(key(n)));assert(stage('z-motor-mount').part_keys.includes(key(n)));positive++}
 assert(inletNuts.every(n=>stage('feet-inlet').operation_part_keys.includes(key(n))));assert(motorNuts.every(n=>stage('z-motor-mount').operation_part_keys.includes(key(n))));assert(top.every(n=>stage('z-align').operation_part_keys.includes(key(n))));positive+=3;
 for(const id of ['feet-inlet','feet-accents','z-motor-mount','z-align',...(r1?['z-motor-thread','z-motor-center','z-cycle']:[])]){const input=shown(id);assert.equal(policy.filter(index(id),input),input);assert.deepEqual(policy.stored(index(id),input),[]);assert(!policy.at(index(id)).isolated);positive++}
 if(r1){assert(stage('feet-runout').part_keys.includes(key(626)));assert.deepEqual(stage('feet-runout-switch').part_keys.map(k=>Number(k.slice(-5))).sort((a,b)=>a-b),[625,627]);for(const id of ['z-motor-thread','z-align','z-motor-center','z-cycle'])assert.equal(stage(id).part_keys.length,0);positive++}
 for(const edit of [s=>s.model_sha256='0'.repeat(64),s=>s.manifest_sha256='0'.repeat(64),s=>s.manual.sha256='0'.repeat(64),s=>s.stages[index('feet-inlet-prep')].page_start=102,s=>s.stages[index('feet-rear-plain')].part_keys.push(key(long.at(-1))),s=>delete s.stages[index('z-align')].operation_part_keys,s=>delete s.stages[index('feet-front')].part_keys[0],s=>delete s.stages[index('z-motor-mount')].operation_part_keys[0],s=>s.stages.push(structuredClone(s.stages[index('feet-front')]))]){const changed=structuredClone(spec);edit(changed);assert.throws(()=>createV0FeetAssembly(changed,mid));negative++}
 for(const value of [-1,NaN,1.5,spec.stages.length]){assert.throws(()=>policy.at(value));negative++}
 const untouched=index('bed-mounts');assert.equal(policy.at(untouched),null);const input=shown('bed-mounts');assert.equal(policy.filter(untouched,input),input);positive++;
}
assert.throws(()=>createV0FeetAssembly(catalog.machines.voron_v02_120,'unknown'));negative++;
console.log(JSON.stringify({passed:true,positive,negative,scope:'Exact manual/source operation references, deferred long screws and accents, motor versus frame fasteners, repeated top screws and sparse/identity negatives. Keyed policy fixtures only; actual models and native fit are separate.'}));
