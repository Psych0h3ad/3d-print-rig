// Explicit Three.js box fixtures for display lifecycle and atomicity only.
// Native receivers and complete exported models are separate inspections.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {createV0IdlerAssembly} from '../site/viewer/v0-idler-assembly.mjs';
import {createV0AssemblyStages} from '../site/viewer/v0-assembly.mjs';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
const bytes=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),catalog=JSON.parse(bytes),sha=b=>createHash('sha256').update(b).digest('hex');
let positive=0,negative=0;
// A new controller/stage table must not import a stale cached policy. This
// checks the actual import URLs against complete canonical dependency bytes.
const control=fs.readFileSync(new URL('../site/viewer/v0-assembly.mjs',import.meta.url),'utf8');
for(const name of ['v0-rail-preparation.mjs','v0-drive-assembly.mjs','v0-bed-assembly.mjs','v0-feet-assembly.mjs','v0-idler-assembly.mjs']){
 const body=fs.readFileSync(new URL('../site/viewer/'+name,import.meta.url),'utf8').replaceAll('\r\n','\n'),expected=sha(body).slice(0,20);
 assert(control.includes("'./"+name+'?v='+expected+"'"),'Policy import must be tied to current bytes: '+name);positive++;
}
const progressModel=fs.readFileSync(new URL('../site/viewer/assembly-workbench-model.mjs',import.meta.url),'utf8'),migration=fs.readFileSync(new URL('../site/viewer/assembly-progress-migrations.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
assert(progressModel.includes("'./assembly-progress-migrations.mjs?v="+sha(migration).slice(0,20)+"'"),'Progress migration must not reuse prior stage-identity code from cache');positive++;
function fixture(mid){
 const spec=structuredClone(catalog.machines[mid]),r1=mid.includes('r1'),prefix=r1?'v02r1_':'v02_',key=n=>prefix+String(n).padStart(5,'0'),scene=new THREE.Scene(),nodes=new Map(),parts=[];
 const box=new THREE.BoxGeometry(.004,.003,.005),long=new THREE.BoxGeometry(.145,.0024,.0055),mat=new THREE.MeshStandardMaterial();
 const rails=r1?[[58,69],[81,92],[104,115],[127,138],[328,339]]:[[56,67],[79,90],[102,113],[125,136],[320,331]],names=new Map();
 for(const [holder,first]of rails){names.set(key(holder),'M2 Hex Adapter');for(let i=0;i<10;i++)names.set(key(first+i),'M2 Hex Nut')}
 for(const[k,i]of spec.stages.flatMap(s=>s.part_keys).map((k,i)=>[k,i])){
  const n=new THREE.Mesh(names.get(k)==='M2 Hex Adapter'?long:box,mat);n.userData.part_key=k;n.position.set((i%17)*.012,.2+Math.floor(i/17)*.001,.1);scene.add(n);nodes.set(k,n);parts.push({key:k,name:names.get(k)||k});
 }
 for(const[g,[holder,first]]of rails.entries()){
  nodes.get(key(holder)).position.set(g*.02,.2,.1);
  for(let i=0;i<10;i++)nodes.get(key(first+i)).position.set(g*.02+(i-4.5)*.014,.203,.1);
 }
 scene.updateMatrixWorld(true);const manifest={machine_id:mid,parts},receipts={'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':sha(bytes)},options={nodes,manifest,machine:spec,receipts,manualPreparation:true};
 return{nodes,manifest,spec,scene,key,options,index:id=>spec.stages.findIndex(s=>s.id===id)};
}
const snapshot=f=>{f.scene.updateMatrixWorld(true);return[...f.nodes].map(([k,n])=>[k,n.visible,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.matrix.toArray(),n.matrixWorld.toArray(),n.geometry,n.material])};
for(const mid of Object.keys(catalog.machines)){
 const f=fixture(mid),p=createV0IdlerAssembly({...f}),c=createV0AssemblyStages(f.options),native=snapshot(f),r1=mid.includes('r1');
 const A=(r1?[243,244,246,247,248,249,251]:[241,242,244,245,246,247,249]).map(f.key),B=(r1?[254,255,258,260,261,262,263]:[252,253,256,258,259,260,261]).map(f.key),cams=(r1?[245,256]:[243,254]).map(f.key),front=(r1?[250,257]:[248,255]).map(f.key),rear=(r1?[166,209]:[164,207]).map(f.key);
 const own=k=>f.spec.stages.find(s=>s.part_keys.includes(k)).id;
 for(const k of front)assert.equal(own(k),'top-front-fasteners');for(const k of rear)assert.equal(own(k),'top-rear-fasteners');positive++;
 const relative=group=>group.map(k=>f.nodes.get(group[0]).matrixWorld.clone().invert().multiply(f.nodes.get(k).matrixWorld).toArray()),before=[A,B].map(relative);
 for(const id of ['idlers-prepare','b-idler','b-idler-lock','a-idler','a-idler-lock','idler-a-check','idler-b-check','idler-check','top-side-members','top-front-access','top-front-fasteners','top-camlocks-refit','top-rear-fasteners','idlers-prepare','top-rear-fasteners']){
  const s=c.setStage(f.index(id)),shown=new Set(c.getVisibleKeys());
  if(id==='idlers-prepare'){
   assert.deepEqual(shown,new Set([...A,...B]));assert(s.subassembly);
   for(const[gi,g]of [A,B].entries())for(const[i,m]of relative(g).entries())for(let j=0;j<16;j++)assert(Math.abs(m[j]-before[gi][i][j])<1e-12,'Each complete subassembly must remain rigid');
  }else{
   const now=snapshot(f);for(let i=0;i<now.length;i++)assert.deepEqual(now[i].slice(2),native[i].slice(2),'Native transforms/geometry/materials restored outside preparation');
   assert(!s.subassembly);
  }
  if(id==='b-idler'||id==='b-idler-lock'){assert(A.every(k=>!shown.has(k)));assert(B.every(k=>shown.has(k)))}
  for(const k of front)assert.equal(shown.has(k),f.index(id)>=f.index('top-front-fasteners'));
  for(const k of rear)assert.equal(shown.has(k),f.index(id)>=f.index('top-rear-fasteners'));
  if(['top-front-access','top-front-fasteners'].includes(id)){assert(cams.every(k=>!shown.has(k)));assert(cams.every(k=>s.stored_keys.includes(k)))}
  if(id==='top-camlocks-refit'||id==='top-rear-fasteners')assert(cams.every(k=>shown.has(k)));
  positive++;
 }
 c.leave();assert.deepEqual(snapshot(f),native);positive++;
 // A new idler failure follows a successful rail-layout update. Restore both
 // policies, the active stage, visibility and every source transform.
 c.setStage(f.index('nut-carriers'));const prepared=snapshot(f),victim=f.nodes.get(A[2]),update=victim.updateMatrix;let inject=true;
 victim.updateMatrix=function(){if(inject){inject=false;throw Error('injected idler transform')}return update.call(this)};
 assert.throws(()=>c.setStage(f.index('idlers-prepare')),/injected idler transform/);victim.updateMatrix=update;
 assert.equal(c.current().id,'nut-carriers');assert.deepEqual(snapshot(f),prepared);c.leave();assert.deepEqual(snapshot(f),native);positive++;
 c.setStage(f.index('idlers-prepare'));const beforeLeave=snapshot(f);inject=true;victim.updateMatrix=function(){if(inject){inject=false;throw Error('injected leave')}return update.call(this)};
 assert.throws(()=>c.leave(),/injected leave/);victim.updateMatrix=update;assert.equal(c.current().id,'idlers-prepare');assert.deepEqual(snapshot(f),beforeLeave);c.leave();assert.deepEqual(snapshot(f),native);positive++;
 const index=createAssemblyIndex({manifest:f.manifest,machine:f.spec,receipts:f.options.receipts}),saved={schema:'assembly-workbench-progress-v2',identity:{...index.identity,stages_sha256:'5b88dcdf6ca7690a9737781ce0f09f0aeb8405ea534a1701c37084797c11612e'},current_stage:'b-idler',checked_stages:['b-idler','top-side-members'],checked_parts:[front[0],rear[0],cams[0]]},migrated=validateAssemblyProgress(index,saved);
 assert.deepEqual(new Set(migrated.checked_parts),new Set(saved.checked_parts));assert.deepEqual(migrated.checked_stages,saved.checked_stages);assert.equal(migrated.current_stage,'b-idler');assert(!migrated.checked_stages.includes('idlers-prepare'));positive++;
 const fi=p.focus(f.index('idlers-prepare'));fi.length=0;assert.equal(p.focus(f.index('idlers-prepare')).length,14);positive++;
 for(const mutate of [
  x=>x.spec.model_sha256='0'.repeat(64),x=>x.spec.manual.sha256='0'.repeat(64),x=>x.spec.manifest_sha256='0'.repeat(64),
 ]){const x=fixture(mid);mutate(x);assert.throws(()=>createV0IdlerAssembly(x),/identity/);negative++}
 for(const mutate of [
  x=>{const s=x.spec.stages.find(s=>s.id==='idlers-prepare');delete s.part_keys[0]},
  x=>x.spec.stages.find(s=>s.id==='top-front-fasteners').page_start++,
  x=>x.spec.stages.find(s=>s.id==='b-idler').operation_part_keys.pop(),
  x=>x.nodes.get(A[0]).matrixAutoUpdate=false,
 ]){const x=fixture(mid);mutate(x);assert.throws(()=>createV0IdlerAssembly(x),/V0 idler assembly/);negative++}
 for(const i of [-1,NaN,.5,f.spec.stages.length]){assert.throws(()=>p.at(i));negative++}
 const x=fixture(mid);x.spec.stages.find(s=>s.id==='idlers-prepare').part_keys.reverse();createV0IdlerAssembly(x);positive++;
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Both manual/source operation policies, original fastener timing and cam-lock storage/refit, rigid box-fixture A-B-A/restoration, two cross-policy failure rollbacks and exact previous progress migration. Not actual geometry, native mating or insertion.'}));
