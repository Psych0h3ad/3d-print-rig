import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {fixtureSpec} from './test_custom_voron_ptfe.mjs';
import {customTubeCurve,customTubeGeometry} from '../site/viewer/custom-voron-tube.mjs';
import {roofTubeLayout,roofCustomTubeRoute} from '../site/viewer/trident-roof-tube.mjs';
const thousand={machine_id:'voron_trident_1000_custom',part_key:'voron_trident_350_base_1409',holder_part_key:'voron_trident_350_base_1393',radius_mm:2,inner_radius_mm:1.5,start_mm:[0,-35.880961,1182.6602579999999],end_mm:[595.1625295410765,171.98175283421568,1265.8999999999962],reference_xyz_mm:[499.6060671871081,501.63501757013745,0],display_limits_mm:{X:[0,1000],Y:[0,1000],Z:[0,1000]}};
let numericalPoses=0,meshes=0;
for(const source of [fixtureSpec,thousand]){
 const spec=roofTubeLayout(source),size=source.display_limits_mm.X[1],ref=source.reference_xyz_mm;
 for(let x=0;x<=size;x+=size/20)for(let y=0;y<=size;y+=size/20){const f=roofCustomTubeRoute(source,x-ref[0],y-ref[1]);assert(Math.abs(f.totalLengthMm-spec.cut_length_mm)<1e-8);assert(Math.min(f.a*f.a/f.h,f.h*f.h/f.a)>=20);assert.equal(f.loopStart[2],spec.storage_start_mm[2]+(f.arch?0:spec.exterior_turn_radius_mm));assert.equal(f.loopEnd[2],f.loopStart[2]);numericalPoses++}
 const poses=[ref,[0,0,0],[size,size,size],[0,size,0],[size,0,size],[size/2,size/2,size/2]],geometryPoses=[...poses,...poses.slice().reverse(),ref];
 let first;
 for(const xyz of geometryPoses){
  const curve=customTubeCurve(source,xyz[0]-ref[0],xyz[1]-ref[1]);
  for(let i=0;i<curve.curves.length-1;i++){assert(curve.curves[i].getPoint(1).distanceTo(curve.curves[i+1].getPoint(0))<1e-9);assert(curve.curves[i].getTangent(1).dot(curve.curves[i+1].getTangent(0))>1-1e-9)}
  // Finite differences independently check that positions and sweep frames
  // use the same distance parameter, including both skins and the end rims.
  for(let i=1;i<100;i++){const u=i/100,e=1e-7,t=curve.getPointAt(u+e).sub(curve.getPointAt(u-e)).normalize();assert(t.dot(curve.getTangentAt(u))>.9999,'Point/frame parameter mismatch')}
  const g=customTubeGeometry(source,xyz[0]-ref[0],xyz[1]-ref[1]),p=g.attributes.position,n=g.attributes.normal,idx=g.index,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
  assert(p.array.every(Number.isFinite));assert(n.array.every(Number.isFinite));
  for(let i=0;i<n.count;i++)assert(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)<1e-6);
  for(let i=0;i<idx.count;i+=3){const ids=[idx.getX(i),idx.getX(i+1),idx.getX(i+2)],cross=b.fromBufferAttribute(p,ids[1]).sub(a.fromBufferAttribute(p,ids[0])).cross(c.fromBufferAttribute(p,ids[2]).sub(a));assert(cross.lengthSq()>1e-24);assert(cross.dot(new THREE.Vector3().fromBufferAttribute(n,ids[0]).add(new THREE.Vector3().fromBufferAttribute(n,ids[1])).add(new THREE.Vector3().fromBufferAttribute(n,ids[2])))>0)}
  const layers=769*25;for(const i of [0,384,768])for(const [shell,r]of [[0,.002],[1,.0015]])assert(Math.abs(new THREE.Vector3().fromBufferAttribute(p,shell*layers+i*25).distanceTo(curve.getPointAt(i/768))-r)<1e-7);
  if(!first)first=p.array.slice();if(xyz===ref)assert.deepEqual(p.array,first);g.dispose();meshes++;
 }
 const bad=structuredClone(source);bad.end_mm[1]+=1;assert.throws(()=>roofTubeLayout(bad));assert.throws(()=>roofCustomTubeRoute(source,NaN,0));assert.throws(()=>roofCustomTubeRoute(source,-ref[0]-1,0));
}
console.log(JSON.stringify({passed:true,numerical_poses:numericalPoses,mesh_poses:meshes,constant_lengths_mm:[1410,2300],finite_unit_normals_winding_and_matched_sweep_frames:true,native_continuous_clearance_certified:false}));
