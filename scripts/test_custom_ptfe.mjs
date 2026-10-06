import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {createCustomTube,customTubeCurve,customTubeGeometry} from '../site/viewer/custom-voron-tube.mjs';

// Measured Trident 500 inlet, roof passage and holder bore from native CAD.
export const spec={part_key:'tube',radius_mm:2,inner_radius_mm:1.5,start_mm:[0,-35.880961,432.660258],
 controls_mm:[[0,-35.880961,472.660258],[0,-35.880961,502.660258],[0,260,440],[0,260,470],[0,260,560],[0,260,590],
 [345.1625295410766,243.3983920134385,489.906469107177],[345.1625295410766,187.016834766284,510.427677706717]],
 end_mm:[345.1625295410766,171.98175283371,515.89999999995]};
export function verifyTubeGeometry(geometry){
 const p=geometry.getAttribute('position'),n=geometry.getAttribute('normal'),idx=geometry.index.array;
 assert(p.array.every(Number.isFinite));assert(n.array.every(Number.isFinite));
 const a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3(),normal=new THREE.Vector3();
 for(let i=0;i<idx.length;i+=3){
  a.fromBufferAttribute(p,idx[i]);b.fromBufferAttribute(p,idx[i+1]);c.fromBufferAttribute(p,idx[i+2]);
  const face=b.sub(a).cross(c.sub(a));
  if(face.lengthSq()<1e-24)continue;
  normal.set(0,0,0);for(let j=0;j<3;j++)normal.add(new THREE.Vector3().fromBufferAttribute(n,idx[i+j]));
  assert(face.dot(normal)>0,`Tube triangle ${i/3} winding disagrees with outward/inner/end-face normals (${face.dot(normal)})`);
 }
}
const root=new THREE.Group(),native=new THREE.BoxGeometry(),mesh=new THREE.Mesh(native);
mesh.userData.part_key='tube';root.add(mesh);
const tube=createCustomTube(root,{custom_ptfe:spec});tube.update();
const first=Array.from(mesh.geometry.attributes.position.array);assert.notEqual(mesh.geometry,native);
verifyTubeGeometry(mesh.geometry);
tube.update(.000001,0);assert.equal(mesh.geometry.attributes.position.array.length,first.length);
assert(Math.max(...first.map((v,i)=>Math.abs(v-mesh.geometry.attributes.position.array[i])))<1e-7,'First movement pops the tube');
tube.update(250,-250,false);assert.equal(mesh.visible,false);
tube.update(0,0,true);assert.equal(mesh.visible,true);assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),first);
assert.throws(()=>tube.update(NaN,0));
const endpoint=customTubeCurve(spec,200,100).getPoint(1);
assert(endpoint.distanceTo(new THREE.Vector3(spec.end_mm[0],spec.end_mm[2],-spec.end_mm[1]).multiplyScalar(.001))<1e-9);
const geometry=customTubeGeometry(spec,200,100);verifyTubeGeometry(geometry);geometry.dispose();
tube.dispose();assert.equal(mesh.geometry,native);
assert.equal(createCustomTube(root,{}),null);
console.log('PTFE: continuous rest/motion/reset, hollow tube normals, native holder endpoint and visibility passed.');
