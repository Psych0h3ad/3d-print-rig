import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createBedChain,bedChainRoute} from '../site/viewer/bed-chain.mjs';
import {Group,Mesh,BufferGeometry,Float32BufferAttribute,MeshBasicMaterial,Matrix4,Vector3} from '../site/viewer/vendor/three.module.js';

const data=JSON.parse(await fs.readFile(new URL('./fixtures/trident-native-chain-roots.json',import.meta.url),'utf8'));
assert.equal(data.parts.length,20);
const basis=new Matrix4().set(.001,0,0,0, 0,0,.001,0, 0,-.001,0,0, 0,0,0,1),inverseBasis=basis.clone().invert();
const worldPoint=p=>new Vector3(p[0]/1000,p[2]/1000,-p[1]/1000);
let hingeChecks=0;
// A translated parent also exercises world-to-local conversion. Both cases
// keep the same measured world assembly and its finite native axis datums.
for(const parentTranslation of [[0,0,0],[.027,.041,-.063]]){
 const root=new Group();root.position.fromArray(parentTranslation);root.updateMatrixWorld(true);
 const rows=[],meshes=new Map(),snapshots=new Map();
 for(const p of data.parts){
  const points=p.source_axis_points_xyz_mm.map(worldPoint),geometry=new BufferGeometry();
  geometry.setAttribute('position',new Float32BufferAttribute(points.flatMap(v=>v.toArray()),3));
  const mesh=new Mesh(geometry,new MeshBasicMaterial());mesh.userData.part_key=p.key;
  const cad=new Matrix4().fromArray(p.current_public_to_native_rigid_matrix_mm);
  const world=basis.clone().multiply(cad).multiply(inverseBasis);
  mesh.applyMatrix4(root.matrixWorld.clone().invert().multiply(world));root.add(mesh);meshes.set(p.key,mesh);
  rows.push({key:p.key,name:p.name,source_component:p.source_component,bounds_mm:p.candidate_bounds_mm});
  snapshots.set(p.key,{position:mesh.position.toArray(),rotation:mesh.quaternion.toArray(),scale:mesh.scale.toArray(),vertices:Array.from(geometry.attributes.position.array)});
 }
 assert([...meshes.values()].some(m=>Math.abs(m.quaternion.z)>.001),'Fixture must include nonidentity native root rotations');
 const pins=data.parts.map(p=>p.native_pin),metadata={parts:rows,bed_chain_pins:pins};
 const chain=createBedChain(root,metadata);assert.equal(chain.entries.length,20);
 for(const down of [0,62.5,125,187.5,250,187.5,125,62.5,0]){
  const state=chain.update(down,true);assert(state.visible);assert(state.endpoint_error_mm<1e-5);
  root.updateMatrixWorld(true);
  const route=bedChainRoute(pins[0].from_xz_mm,[pins.at(-1).to_xz_mm[0],pins.at(-1).to_xz_mm[1]-down]);
  for(const [i,p]of data.parts.entries()){
   const mesh=meshes.get(p.key),before=snapshots.get(p.key);
   assert(mesh.visible);assert(mesh.matrixWorld.elements.every(Number.isFinite));
   assert.deepEqual(mesh.scale.toArray(),before.scale,'Native link size changed');
   assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),before.vertices,'Native geometry was rewritten');
   for(const [j,axisPoint]of p.source_axis_points_xyz_mm.entries()){
    const actual=worldPoint(axisPoint).applyMatrix4(mesh.matrixWorld),target=new Vector3(route.points[i+j][0]/1000,route.points[i+j][1]/1000,-axisPoint[1]/1000);
    assert(actual.distanceTo(target)*1000<1e-7,`Native hinge detached: ${p.key}/${j}, Z${down}`);hingeChecks++;
   }
  }
 }
 for(const [key,mesh]of meshes){
  const native=snapshots.get(key);assert.deepEqual(mesh.position.toArray(),native.position,'Reset lost native root translation');
  assert.deepEqual(mesh.quaternion.toArray(),native.rotation,'Reset lost native root quaternion');
 }
 chain.update(125,false);assert([...meshes.values()].every(m=>!m.visible));
 chain.update(125,true);assert([...meshes.values()].every(m=>m.visible));
 chain.update(0,true);
}
console.log(`Production bed chain:20measured native roots /${hingeChecks}hinge checks, nonidentity placement, translated parent, reverse/reset and untouched geometry PASS. Transform scope only.`);
