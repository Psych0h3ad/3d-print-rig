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
const bedAxis=apply(pose.matrices.bed_screw,[0,169.59235049725766,-108.02020077326199]);
assert(Math.abs(bedAxis.x+125.058436853864)<1e-8);assert(Math.abs(bedAxis.z+2.006699691386)<1e-8);
const seat=apply(pose.matrices.column_screw,s.column_screw_source_seat_mm);
const axis=new THREE.Vector3(0,0,-1).transformDirection(pose.matrices.column_screw);
for(const y of [37.52,40,42.26751067881665]){
 const point=seat.clone().addScaledVector(axis,(y-seat.y)/axis.y);
 assert(Math.hypot(point.x-124,point.z+2.006699691397)+2.942/axis.y<3.25);
}
for(const matrix of Object.values(positronFoldTransforms(profile,0).matrices))assert(matrix.equals(new THREE.Matrix4()));
console.log('Positron storage: original thumbscrews, holder registration, bore clearance, 201 rigid poses and native reset passed.');
