import fs from 'node:fs';
import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {positronFoldTransforms} from '../site/viewer/positron-fold.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('./fixtures/positron-storage.json',import.meta.url)));
const apply=(matrix,point)=>new THREE.Vector3(...point).multiplyScalar(.001).applyMatrix4(matrix).multiplyScalar(1000);
for(let i=0;i<=200;i++)for(const matrix of Object.values(positronFoldTransforms(profile,i*.5).matrices)){
 assert(matrix.elements.every(Number.isFinite));assert(Math.abs(matrix.determinant()-1)<1e-9);
}
const s=profile.fold.storage,pose=positronFoldTransforms(profile,100);
assert.equal(pose.step,10);assert.equal(pose.angleDegrees,90);
const bottom=new THREE.Vector3(...s.holder_hole_top_mm);bottom.y-=s.holder_thickness_mm;
assert(apply(pose.matrices.holder,s.holder_source_hole_top_mm).distanceTo(bottom)<1e-9);
assert(new THREE.Vector3(0,1,0).transformDirection(pose.matrices.holder).y<-.999999);
assert(new THREE.Vector3(0,1,0).transformDirection(pose.matrices.bed_screw).y>.999999);
assert(new THREE.Vector3(0,-1,0).transformDirection(pose.matrices.bed_screw).distanceTo(new THREE.Vector3(0,-1,0))<1e-9);
assert(new THREE.Vector3(0,0,1).transformDirection(pose.matrices.column_screw).distanceTo(new THREE.Vector3(0,-1,0))<1e-9);
const bedAxis=apply(pose.matrices.bed_screw,[0,169.59235049725766,-108.02020077326199]);
assert(Math.abs(bedAxis.x+125.058436853864)<1e-8);assert(Math.abs(bedAxis.z+2.006699691386)<1e-8);
const seat=apply(pose.matrices.column_screw,s.column_screw_source_seat_mm);
assert(Math.abs(s.column_screw_nut_bounds_y_mm[1]-(seat.y-23)-s.column_screw_thread_engagement_mm)<.005);
const axis=new THREE.Vector3(0,0,-1).transformDirection(pose.matrices.column_screw);
assert(Math.abs(seat.x-124)<1e-9);assert(Math.abs(seat.z+2.006699691397)<1e-9);
assert(Math.abs(seat.y-23-31.29251067881665)<.005);
for(const y of [37.52,40,42.26751067881665]){
 const point=seat.clone().addScaledVector(axis,(y-seat.y)/axis.y);
 assert(Math.hypot(point.x-124,point.z+2.006699691397)+2.942/Math.abs(axis.y)<3.25);
}
// Old asset profiles must not restore the unsupported screw lean.
const legacy=structuredClone(profile);legacy.fold.storage.column_screw_lean_degrees=-5.5;
assert(new THREE.Vector3(0,0,1).transformDirection(positronFoldTransforms(legacy,100).matrices.column_screw).distanceTo(new THREE.Vector3(0,-1,0))<1e-9);
for(const matrix of Object.values(positronFoldTransforms(profile,0).matrices))assert(matrix.equals(new THREE.Matrix4()));
// Native display envelopes catch the former loose-screw path. V handling
// follows the registered column before folding; native solid audits cover
// the complete carried-part paths separately.
const parts=JSON.parse(fs.readFileSync(new URL('./fixtures/positron-carried-bounds.json',import.meta.url)));
const bounds=(part,pose)=>{
 const lo=part.bounds_mm[0].map((x,i)=>Math.min(x,part.bounds_mm[1][i])),hi=part.bounds_mm[0].map((x,i)=>Math.max(x,part.bounds_mm[1][i])),box=new THREE.Box3();
 for(const x of [lo[0],hi[0]])for(const y of [lo[1],hi[1]])for(const z of [lo[2],hi[2]])box.expandByPoint(apply(pose.matrices[part.group],[x,y,z]));
 return box;
};
const mainScrew=parts.find(p=>p.key==='00040'),display=parts.filter(p=>['00832','00833','00834','00835'].includes(p.key));
for(let p=39;p<=96;p+=.1){
 const pose=positronFoldTransforms(profile,p),screw=bounds(mainScrew,pose);
 for(const body of display)assert(!screw.intersectsBox(bounds(body,pose)),`Loose screw crossed display at ${p}`);
}
const registered=positronFoldTransforms(profile,62),relative=registered.matrices.column.clone().invert().multiply(registered.matrices.holder);
for(let p=62;p<=72;p+=.1){
 const next=positronFoldTransforms(profile,p),attached=next.matrices.column.clone().invert().multiply(next.matrices.holder);
 attached.elements.forEach((n,i)=>assert(Math.abs(n-relative.elements[i])<1e-10,`V failed to follow column at ${p}`));
}
// Pair with the Z column completely before it starts rotating. The relative
// transform must stay fixed during the entire closing rotation; checking
// only the final storage pose missed the previous through-rail path.
const paired=positronFoldTransforms(profile,78),pairedRelative=paired.matrices.column.clone().invert().multiply(paired.matrices.holder);
assert.equal(paired.angleDegrees,0);
for(let p=78;p<=92;p+=.1){
 const next=positronFoldTransforms(profile,p),relative=next.matrices.column.clone().invert().multiply(next.matrices.holder);
 relative.elements.forEach((n,i)=>assert(Math.abs(n-pairedRelative.elements[i])<1e-10,`V must stay paired with Z column during closing at ${p}`));
}
const beforeScrews=positronFoldTransforms(profile,96);
assert(beforeScrews.matrices.holder.equals(pose.matrices.holder));
for(let p=98.5;p<=100;p+=.02){
 const next=positronFoldTransforms(profile,p);
 for(const g of ['bed_screw','column_screw']){
  assert(Math.abs(next.matrices[g].elements[12]-pose.matrices[g].elements[12])<1e-10);
  assert(Math.abs(next.matrices[g].elements[14]-pose.matrices[g].elements[14])<1e-10);
 }
}
console.log('Positron storage: native holder registration, bore clearance, lifted handling paths, display obstruction regression, V following column, vertical screw insertion and native reset passed.');
