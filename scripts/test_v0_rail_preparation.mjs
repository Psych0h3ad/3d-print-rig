// Rigid-display lifecycle/negative controls. Boxes are explicit software fixtures;
// audit_v0_assembly_assets separately loads both complete exported models.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {createV0RailPreparation} from '../site/viewer/v0-rail-preparation.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)));
let passed=0,negative=0;
function fixture(){
 const id='voron_v02r1_120',spec=structuredClone(catalog.machines[id]),keys=spec.stages.find(s=>s.id==='nut-carriers').part_keys,scene=new THREE.Scene(),nodes=new Map(),parts=[];
 for(const[g,holder]of [58,81,104,127,328].entries())for(let i=0;i<11;i++){
  const no=i===0?holder:[69,92,115,138,339][g]+i-1,key='v02r1_'+String(no).padStart(5,'0');assert(keys.includes(key));
  const n=new THREE.Mesh(i?new THREE.BoxGeometry(.004,.001,.004):new THREE.BoxGeometry(.145,.0024,.0055),new THREE.MeshStandardMaterial());
  n.position.set(g*.02+(i?(i-5.5)*.014:0),.2+(i?.003:0),.1);scene.add(n);nodes.set(key,n);parts.push({key,name:i?'M2 Hex Nut':'M2 Hex Adapter'});
 }
 scene.updateMatrixWorld(true);const input={nodes,manifest:{machine_id:id,parts},spec};return {...input,scene,make:()=>createV0RailPreparation(input)};
}
const snapshot=f=>[...f.nodes].map(([k,n])=>[k,n.position.toArray(),n.quaternion.toArray(),n.scale.toArray(),n.matrix.toArray(),n.matrixWorld.toArray()]);
const f=fixture(),native=snapshot(f),p=f.make();
for(const i of [1,2,3,2,1,57,1,0]){p.check();p.apply(i);p.check();assert.equal(p.prepared(i),i===1);if(i!==1)assert.deepEqual(snapshot(f),native);passed++}
assert.equal(p.deferred(2).length,33);assert.equal(p.deferred(3).length,11);assert.equal(p.focus(2).length,22);assert.equal(p.focus(3).length,22);
p.deferred(2).length=0;assert.equal(p.deferred(2).length,33);p.leave();assert.deepEqual(snapshot(f),native);passed++;
// A failure after the first two rows moved must restore the previous display,
// not leave a mixture of preparation and installation coordinates.
p.apply(1);const prepared=snapshot(f),victim=f.nodes.get('v02r1_00104'),original=victim.updateMatrix;
let injected=true;victim.updateMatrix=function(){if(injected){injected=false;throw Error('injected update failure')}return original.call(this)};
assert.throws(()=>p.apply(1),/injected/);victim.updateMatrix=original;assert.deepEqual(snapshot(f),prepared);p.check();p.leave();assert.deepEqual(snapshot(f),native);passed++;
p.apply(1);const n=f.nodes.get('v02r1_00058'),old=n.position.x;n.position.x+=.01;assert.throws(()=>p.check(),/outside preparation/);n.position.x=old;n.updateMatrix();n.updateWorldMatrix(true,false);p.check();p.leave();passed++;
for(const change of [
 f=>{f.spec.model_sha256='0'.repeat(64)},f=>{f.spec.manifest_sha256='0'.repeat(64)},f=>{f.spec.manual.sha256='0'.repeat(64)},
 f=>{f.spec.stages.find(s=>s.id==='x-rail').id='other'},f=>{f.spec.stages[1].part_keys.pop()},
 f=>{f.manifest.parts[0].name='Generic substitute'},f=>{f.manifest.parts[1].name='Wrong nut'},
 f=>{f.nodes.get('v02r1_00058').matrixAutoUpdate=false},f=>{f.nodes.get('v02r1_00069').parent=f.nodes.get('v02r1_00058')},
]){const x=fixture();change(x);assert.throws(()=>x.make(),/V0 rail preparation/);negative++}
console.log(JSON.stringify({passed:true,positiveCases:passed,negativeCases:negative,scope:'Source-pinned preparation policy with explicit box fixtures: row layout, deferred/receiving stage keys, A-B-A and exact restoration, partial-failure atomicity, external transform conflicts and identity rejection. Not model geometry or physical-fit evidence.'}));
