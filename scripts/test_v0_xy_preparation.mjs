// Box fixtures exercise lifecycle/atomicity and source operation identity.
// Exact exported hardware and native gap/slot evidence are separate audits.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {createV0XYPreparation} from '../site/viewer/v0-xy-preparation.mjs';
import {createV0AssemblyStages} from '../site/viewer/v0-assembly.mjs';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
const bytes=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),catalog=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
let positive=0,negative=0;
function fixture(mid){
 const spec=structuredClone(catalog.machines[mid]),r1=mid.includes('r1'),key=n=>(r1?'v02r1_':'v02_')+String(n).padStart(5,'0'),scene=new THREE.Scene(),nodes=new Map(),parts=[];
 const box=new THREE.BoxGeometry(.004,.003,.005),long=new THREE.BoxGeometry(.145,.0024,.0055),material=new THREE.MeshStandardMaterial(),names=new Map();
 for(const[holder,first]of r1?[[58,69],[81,92],[104,115],[127,138],[328,339]]:[[56,67],[79,90],[102,113],[125,136],[320,331]]){names.set(key(holder),'M2 Hex Adapter');for(let i=0;i<10;i++)names.set(key(first+i),'M2 Hex Nut')}
 for(const[k,i]of spec.stages.flatMap(s=>s.part_keys).map((k,i)=>[k,i])){const n=new THREE.Mesh(names.get(k)==='M2 Hex Adapter'?long:box,material);n.userData.part_key=k;n.position.set((i%17)*.012,.2+Math.floor(i/17)*.001,.1);scene.add(n);nodes.set(k,n);parts.push({key:k,name:names.get(k)||k})}
 // Match the existing rail presentation fixture's rigid native cohort.
 for(const[g,[holder,first]]of (r1?[[58,69],[81,92],[104,115],[127,138],[328,339]]:[[56,67],[79,90],[102,113],[125,136],[320,331]]).entries()){
  nodes.get(key(holder)).position.set(g*.02,.2,.1);for(let i=0;i<10;i++)nodes.get(key(first+i)).position.set(g*.02+(i-4.5)*.014,.203,.1);
 }
 scene.updateMatrixWorld(true);const manifest={machine_id:mid,parts},receipts={'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':sha(bytes)},options={nodes,manifest,machine:spec,receipts,manualPreparation:true};
 return{spec,key,scene,nodes,manifest,options,index:id=>spec.stages.findIndex(s=>s.id===id)};
}
const snapshot=f=>{f.scene.updateMatrixWorld(true);return[...f.nodes].map(([k,n])=>[k,n.visible,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.matrix.toArray(),n.matrixWorld.toArray(),n.geometry,n.material])};
for(const mid of Object.keys(catalog.machines)){
 const f=fixture(mid),r1=mid.includes('r1'),p=createV0XYPreparation(f),c=createV0AssemblyStages(f.options),native=snapshot(f);
 const groups=(r1?[[265,266,267,268,270,277,278,279,280,281,282,283,284,285,286,287,288,289,290,291],[297,298,304,306,307,308,309,310,311,312,313,314,315,316,317,318,319,323,324,325]]:[[263,264,265,266,268,275,276,277,278,279,280,281,282,283,284,285,286,287,288,289],[292,293,299,301,302,303,304,305,306,307,308,309,310,311,312,313,314,315,316,317]]).map(ns=>ns.map(f.key));
 const roles=(r1?[[267,290,291,268],[324,306,307,304]]:[[265,288,289,266],[316,301,302,299]]).map(ns=>ns.map(f.key));
 const relative=g=>g.map(k=>f.nodes.get(g[0]).matrixWorld.clone().invert().multiply(f.nodes.get(k).matrixWorld).toArray()),before=groups.map(relative);
 for(const side of [0,1,0])for(const phase of ['inserts','stack','close','check']){
  const stem='xy-'+(side?'right':'left'),id=phase==='check'?stem:stem+'-'+phase,refs=phase==='inserts'?roles[side].slice(0,3):phase==='stack'?groups[side].filter(k=>!roles[side].includes(k)):groups[side],s=c.setStage(f.index(id));
  assert(s.subassembly);assert.equal(s.presentation_id,'xy-'+id);assert.deepEqual(new Set(c.getVisibleKeys()),new Set(refs));assert.equal(s.added,{inserts:3,stack:16,close:1,check:0}[phase]);
  for(const[i,m]of relative(groups[side]).entries())for(let j=0;j<16;j++)assert(Math.abs(m[j]-before[side][i][j])<1e-12,'Every original part moves with one rigid joint');
  assert(groups[1-side].every(k=>!c.getVisibleKeys().includes(k)));
  if(phase==='stack')assert(roles[side].slice(0,3).every(k=>s.stored_keys.includes(k)),'Prepared insert body is set aside until closing');
  positive++;
 }
 c.setStage(f.index('x-rail'));assert(groups.flat().every(k=>!c.getVisibleKeys().includes(k)));positive++;
 const installed=c.setStage(f.index('x-joints'));assert(!installed.subassembly);assert(groups.flat().every(k=>c.getVisibleKeys().includes(k)));for(const k of groups.flat())assert(installed.operation_part_keys.includes(k));
 for(const[i,row]of snapshot(f).entries())assert.deepEqual(row.slice(2),native[i].slice(2),'Original installation transform/material/geometry exact');positive++;
 c.leave();assert.deepEqual(snapshot(f),native);positive++;
 // XY failure after the rail/idler policies have already applied must roll
 // them back too, retaining the active operation and all original resources.
 c.setStage(f.index('idlers-prepare'));const previous=snapshot(f),victim=f.nodes.get(groups[0][0]),update=victim.updateMatrix;let inject=true;
 victim.updateMatrix=function(){if(inject){inject=false;throw Error('injected XY transform')}return update.call(this)};
 assert.throws(()=>c.setStage(f.index('xy-left-stack')),/injected XY transform/);victim.updateMatrix=update;assert.equal(c.current().id,'idlers-prepare');assert.deepEqual(snapshot(f),previous);c.leave();assert.deepEqual(snapshot(f),native);positive++;
 const index=createAssemblyIndex({manifest:f.manifest,machine:f.spec,receipts:f.options.receipts});
 for(const hash of ['1a72f36890af24c6f61f8ec86843bf77406ec2b5a13a207a7bc357ca8c7edc37','5b88dcdf6ca7690a9737781ce0f09f0aeb8405ea534a1701c37084797c11612e']){
  const old={schema:'assembly-workbench-progress-v2',identity:{...index.identity,stages_sha256:hash},current_stage:'xy-left',checked_stages:['b-idler','xy-left','xy-right'],checked_parts:[...groups[0],groups[1][0]]},m=validateAssemblyProgress(index,old);
  assert.equal(m.current_stage,'xy-left-inserts');assert.deepEqual(m.checked_stages,['b-idler']);assert.deepEqual(new Set(m.checked_parts),new Set(old.checked_parts));assert(!m.checked_stages.some(id=>id.startsWith('xy-')));positive++;
 }
 const current={schema:'assembly-workbench-progress-v2',identity:index.identity,current_stage:'xy-left',checked_stages:['xy-left'],checked_parts:[groups[0][0]]};assert.deepEqual(validateAssemblyProgress(index,current),current);positive++;
 const out=p.focus(f.index('xy-left-stack'));out.length=0;assert.equal(p.focus(f.index('xy-left-stack')).length,16);positive++;
 for(const mutate of [x=>x.spec.manual.sha256='0'.repeat(64),x=>x.spec.model_sha256='0'.repeat(64),x=>x.spec.manifest_sha256='0'.repeat(64),x=>delete x.spec.stages.find(s=>s.id==='xy-left-stack').part_keys[0],x=>x.spec.stages.find(s=>s.id==='xy-left-close').page_end++,x=>x.spec.stages.find(s=>s.id==='x-joints').operation_part_keys.pop(),x=>x.nodes.get(groups[0][0]).matrixAutoUpdate=false]){const x=fixture(mid);mutate(x);assert.throws(()=>createV0XYPreparation(x),/V0 XY preparation/);negative++}
 for(const i of [-1,NaN,.5,f.spec.stages.length]){assert.throws(()=>p.at(i));negative++}
 for(const x of f.nodes.values())x.geometry.dispose();
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Two source policies, mirrored box fixtures, insert/stack/close/gap visibility, full-cohort rigid transforms and exact exit, cross-policy atomic rollback and exact old-progress migration with new operations unchecked. Not actual exported geometry or native mating.'}));
