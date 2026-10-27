import assert from 'node:assert/strict';
import {BufferGeometry,Float32BufferAttribute,Group,Mesh,MeshStandardMaterial} from '../site/viewer/vendor/three.module.js';
import {createMicronFlexible} from '../site/viewer/micron-flexible.mjs';
import {micronChainPins} from '../site/viewer/micron-flexible-pins.mjs';
import {micronTubeSpecs} from '../site/viewer/micron-tube-routes.mjs';

// Lifecycle fixtures only: identity/buffer preservation, not source fit or clearance.
const nodes=new Map(),records=new Map(),leaves=[],material=new MeshStandardMaterial();
for(const pin of micronChainPins.links){
 const node=new Group();nodes.set(pin.key,node);
 records.set(pin.key,{bounds_mm:[[0,0,0],[1,1,1]]});
}
for(const spec of micronTubeSpecs){
 const node=new Group();node.position.set(.01,.02,.03);nodes.set(spec.key,node);
 records.set(spec.key,{motion:'reference_flexible'});
 for(const offset of [0,1]){
  const original=new BufferGeometry();original.setAttribute('position',new Float32BufferAttribute([offset,0,0,offset,1,0,offset,0,1],3));original.setIndex([0,1,2]);
  const mesh=new Mesh(original,material);node.add(mesh);
  const leaf={mesh,original,positions:Array.from(original.attributes.position.array),indices:Array.from(original.index.array),sourceDisposals:0};
  original.addEventListener('dispose',()=>leaf.sourceDisposals++);leaves.push(leaf);
 }
}
const flexible=createMicronFlexible(nodes,records,{machine_id:'micron_plus_r1_180'});
function assertNative(state){
 assert.equal(state.tubes.length,micronTubeSpecs.length);
 for(const [i,tube]of state.tubes.entries()){
  assert.equal(tube.native_geometry,true);
  assert.deepEqual(tube.endpoints_mm,[micronTubeSpecs[i].start_mm,micronTubeSpecs[i].end_mm]);
  assert.deepEqual(tube.straight_sections_mm,[],'Do not label preview fitting sections as measured native geometry');
 }
 for(const leaf of leaves){
  assert.equal(leaf.mesh.geometry,leaf.original,'Reset must restore every authored PTFE/CAN leaf');
  assert.deepEqual(Array.from(leaf.original.attributes.position.array),leaf.positions);
  assert.deepEqual(Array.from(leaf.original.index.array),leaf.indices);
  assert.equal(leaf.sourceDisposals,0,'Source geometry must remain usable after reset');
 }
 for(const tube of flexible.tubes){
  assert(tube.node.position.equals(tube.origin));
  for(const mesh of tube.meshes)assert.equal(mesh.preview,null);
 }
}
assertNative(flexible.update([0,0,0],true));
const poses=[[-89.6666224467,-105.4013186976,-27.89608999],[0,0,54.60391001],[89.6633775533,71.4186813024,137.10391001]];
let transitions=0;
for(const delta of [...poses,...poses.slice().reverse()]){
 const state=flexible.update(delta,true),previews=leaves.map(leaf=>leaf.mesh.geometry),disposed=previews.map(()=>0);
 assert(state.tubes.every(t=>t.native_geometry===false));
 for(const [i,preview]of previews.entries()){
  assert.notEqual(preview,leaves[i].original);
  preview.addEventListener('dispose',()=>disposed[i]++);
 }
 flexible.update(delta,false);
 for(const [i,leaf]of leaves.entries())assert.equal(leaf.mesh.geometry,previews[i],'Visibility must not allocate a new route');
 assert(flexible.tubes.every(t=>t.node.visible===false));
 assertNative(flexible.update([0,0,0],false));
 assert.deepEqual(disposed,previews.map(()=>1),'Reset must dispose each preview exactly once');
 assertNative(flexible.update([0,0,0],true));
 assert.deepEqual(disposed,previews.map(()=>1),'Repeated reset must not dispose a preview twice');
 transitions++;
}
// Match the adapter reference-pose tolerance, including a return from a preview.
flexible.update([1,0,0],true);
assertNative(flexible.update([5e-7,-5e-7,5e-7],true));
assert.throws(()=>flexible.update([NaN,0,0],true),/Invalid Micron tube pose/);
assertNative(flexible.update([0,0,0],true));
assert.equal(createMicronFlexible(new Map(),new Map(),{machine_id:'micron_r1_120'}).update([0,0,0],true).tubes.length,0,'120 has no Plus tube registration');
console.log(`Micron Plus PTFE/CAN: source geometry retained at load and after ${transitions} forward/reverse/reset transitions; previews disposed, source buffers intact. Fixture lifecycle only; moving-route clearance remains open.`);
