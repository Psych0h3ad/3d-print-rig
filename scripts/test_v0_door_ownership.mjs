import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {createV0Door} from '../site/viewer/v0-door.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/v0-door-source-occurrences.json',import.meta.url),'utf8'));
assert.equal(fixture.schema,'v0-door-source-occurrences-fixture-v1');
let visits=0,negativeCases=0;
for(const [machine_id,data]of Object.entries(fixture.machines)){
 const manifest={machine_id,parts:structuredClone(data.parts)},scene=new THREE.Scene(),nodes=new Map(),geometry=new THREE.BoxGeometry(.001,.002,.003),original=new Map();
 for(const [i,part]of manifest.parts.entries()){
  const node=new THREE.Group(),material=new THREE.MeshStandardMaterial({color:part.name==='6x3mm Magnet'?'#789abc':'#657487'});node.userData.part_key=part.key;node.add(new THREE.Mesh(geometry,material));node.position.set(-.05+i*.001,.05+i*.0003,.06+i*.0002);node.quaternion.setFromAxisAngle(new THREE.Vector3(1,0,0),i*.01);nodes.set(part.key,node);scene.add(node);
 }
 scene.updateMatrixWorld(true);for(const[k,n]of nodes)original.set(k,{position:n.position.toArray(),quaternion:n.quaternion.toArray(),matrix:n.matrixWorld.toArray(),child:n.children[0],geometry:n.children[0].geometry,material:n.children[0].material,color:n.children[0].material.color.toArray(),visible:n.visible});
 const expected=data.manualExpected,actor=createV0Door(nodes,manifest);assert.equal(expected.moving.length,10);assert.equal(expected.fixedPivot.length,2);assert.equal(expected.fixedLatch.length,machine_id==='voron_v02r1_120'?14:10);assert.deepEqual([...actor.keys].sort(),expected.moving);assert.deepEqual([...actor.fixedPivotKeys].sort(),expected.fixedPivot);assert.deepEqual([...actor.fixedLatchKeys].sort(),expected.fixedLatch);assert.equal(new Set([...actor.keys,...actor.fixedKeys]).size,manifest.parts.length);
 const movingCentres=expected.moving.map(k=>nodes.get(k).position.clone()),pairDistances=movingCentres.map((a,i)=>movingCentres.map((b,j)=>i<j?a.distanceTo(b):null));
 let saved55;
 for(const angle of [0,55,110,27.5,55,0]){
  actor.setAngle(angle);scene.updateMatrixWorld(true);assert.equal(actor.getAngle(),angle);visits++;
  for(const[k,n]of nodes){const b=original.get(k);assert.equal(n.visible,b.visible);assert.equal(n.children[0],b.child);assert.equal(b.child.geometry,b.geometry);assert.equal(b.child.material,b.material);assert.deepEqual(b.material.color.toArray(),b.color);assert(n.matrixWorld.elements.every(Number.isFinite));if(actor.fixedKeys.has(k)||angle===0){assert.deepEqual(n.position.toArray(),b.position);assert.deepEqual(n.quaternion.toArray(),b.quaternion);assert.deepEqual(n.matrixWorld.toArray(),b.matrix)}else assert.notDeepEqual(n.matrixWorld.toArray(),b.matrix)}
  const now=expected.moving.map(k=>nodes.get(k).position.clone());for(let i=0;i<now.length;i++)for(let j=i+1;j<now.length;j++)assert(Math.abs(now[i].distanceTo(now[j])-pairDistances[i][j])<1e-12,'Moving door cohort must stay rigid');
  if(angle===55){const snapshot=JSON.stringify(expected.moving.map(k=>nodes.get(k).matrixWorld.toArray()));if(saved55)assert.equal(snapshot,saved55);else saved55=snapshot;assert.equal(JSON.parse(JSON.stringify({doorAngle:actor.getAngle()})).doorAngle,55)}
 }
 const unchanged=()=>{scene.updateMatrixWorld(true);for(const[k,n]of nodes)assert.deepEqual(n.matrixWorld.toArray(),original.get(k).matrix)};
 for(const key of [expected.moving[0],expected.fixedPivot[0],expected.fixedLatch[0]])for(const mutation of ['missing','duplicate','source-path','source-revision','name','motion','node']){
  const bad=structuredClone(manifest),r=bad.parts.find(p=>p.key===key),nn=new Map(nodes);if(mutation==='missing')bad.parts=bad.parts.filter(p=>p.key!==key);if(mutation==='duplicate')bad.parts.push(structuredClone(r));if(mutation==='source-path')r.source.assembly_path[r.source.assembly_path.length-1]+='other';if(mutation==='source-revision')r.source.commit='0'.repeat(40);if(mutation==='name')r.name+='other';if(mutation==='motion')r.motion='xy';if(mutation==='node')nn.delete(key);assert.throws(()=>createV0Door(nn,bad));unchanged();negativeCases++;
 }
 const extra=structuredClone(manifest);extra.parts.push({...structuredClone(manifest.parts[0]),key:'unregistered-door-member'});assert.throws(()=>createV0Door(nodes,extra));negativeCases++;
 for(const invalid of [-1,111,NaN,Infinity,'55',null]){assert.throws(()=>actor.setAngle(invalid));unchanged();negativeCases++}
 for(const n of nodes.values())n.children[0].material.dispose();geometry.dispose();scene.clear();
}
console.log(`V0 door source ownership: two complete source cohorts, ${visits} selected fixture visits and ${negativeCases} identity/angle negatives. Actual exported geometry and native fit are separate required audits.`);
