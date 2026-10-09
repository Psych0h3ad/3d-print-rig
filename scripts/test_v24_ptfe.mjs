import assert from 'node:assert/strict';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {V24_PTFE_SPEC as spec,V24_PANEL_PASSAGES,v24PtfeRoute,createV24PtfePreview} from '../site/viewer/v24-ptfe.mjs';
import {verifyTubeGeometry} from './test_custom_ptfe.mjs';
const profile={machine_id:spec.machine_id,display_reference_xyz_mm:spec.reference_xyz_mm,display_limits_mm:spec.preview_display_limits_mm};
const moving=new Set([spec.cw2_part_key,spec.internal_tube_part_key]);
const manifest={machine_id:spec.machine_id,parts:Object.entries(spec.native_mate_guards).map(([key,native_sha256])=>({key,native_sha256,motion_axes:moving.has(key)?['X','Y','Z']:[]}))};
const root=new THREE.Group(),nativeGeometry=new THREE.BufferGeometry(),nativeMaterial=new THREE.MeshStandardMaterial({color:0x101112});
const internal=new THREE.Mesh(nativeGeometry,nativeMaterial);internal.userData.part_key=spec.internal_tube_part_key;root.add(internal);
const preview=createV24PtfePreview(THREE,root,manifest,profile,spec),sourceChildren=root.children.length;
const extremes=[spec.reference_xyz_mm,[0,0,0],[500,500,0],[500,500,469],[0,500,469],[500,0,0],[250,250,234.5],[500,0,469],[0,0,469]];
for(const xyz of [...extremes,...extremes.toReversed(),spec.reference_xyz_mm]){
 const route=v24PtfeRoute(spec,xyz);preview.setPose(xyz);assert(preview.mesh.visible);assert.equal(root.children.length,sourceChildren);assert.equal(preview.mesh.material,nativeMaterial);
 assert.deepEqual(route.start_mm,spec.head_seat_reference_mm.map((v,i)=>v+(xyz[i]-spec.reference_xyz_mm[i])));
 assert.deepEqual(route.pointAt(1),spec.holder_right_mm);assert(route.moving_cubic_min_y_derivative_mm>0);assert(route.total_length_mm>0);
 for(let i=0;i<route.segments.length-1;i++){
  assert(route.segments[i].end.every((v,j)=>Math.abs(v-route.segments[i+1].start[j])<1e-9));
  const a=route.segments[i].derivative(1),b=route.segments[i+1].derivative(0);assert(a.reduce((n,v,j)=>n+v*b[j],0)/Math.hypot(...a)/Math.hypot(...b)>1-1e-12);
 }
 assert(route.arc_end_mm[2]+2<spec.roof.bottom_z_mm);
 const passage=V24_PANEL_PASSAGES[spec.machine_id],axis=route.segments.find(s=>s.id==='fixed_panel_aperture_axis');
 assert(axis&&axis.type==='line');assert.equal(axis.length_mm,passage.approach_length_mm);
 assert.deepEqual(axis.end,spec.inner_feedthrough_mm);
 assert(axis.start[1]+spec.radius_mm<passage.inside_y_mm);
 // The moving cubic is monotone in Y and stops inside the panel. Only the
 // source connector axis crosses its opening; full native fit is separate.
 for(const t of [0,.125,.25,.5,.75,.875,1]){
  const p=route.segments.find(s=>s.id==='moving_monotone_Y').point(t);
  assert(p[1]+spec.radius_mm<passage.inside_y_mm);
 }
 assert(preview.mesh.geometry.attributes.position.array.every(Number.isFinite));verifyTubeGeometry(preview.mesh.geometry);
 assert.equal(internal.geometry,nativeGeometry);assert.equal(internal.material,nativeMaterial);
}
const reference=preview.mesh.geometry.attributes.position.array.slice();preview.setPose([500,500,469]);preview.reset();assert.deepEqual(preview.mesh.geometry.attributes.position.array,reference);
preview.setPose(spec.reference_xyz_mm,false);assert(!preview.mesh.visible);preview.reset();assert(preview.mesh.visible);
for(const xyz of [[0,0,480],[NaN,0,0],[-1,0,0],[500,501,469]])assert.throws(()=>preview.setPose(xyz));
for(const i of [0,1,2]){
 const boundary=[500,500,469],rounded=boundary.slice();rounded[i]+=1e-10;
 assert.deepEqual(v24PtfeRoute(spec,rounded).display_xyz_mm,boundary);
 const outside=boundary.slice();outside[i]+=1e-6;assert.throws(()=>v24PtfeRoute(spec,outside));
 const lower=[0,0,0];lower[i]-=1e-10;assert.deepEqual(v24PtfeRoute(spec,lower).display_xyz_mm,[0,0,0]);
}
for(const key of Object.keys(spec.native_mate_guards)){
 const bad=structuredClone(manifest);bad.parts.find(p=>p.key===key).native_sha256='0'.repeat(64);assert.throws(()=>createV24PtfePreview(THREE,root,bad,profile,spec));
}
preview.dispose();assert.equal(root.children.length,1);assert.equal(internal.geometry,nativeGeometry);assert.equal(internal.material,nativeMaterial);
console.log('V2.4 external PTFE: XYZ, reversed travel, hollow mesh, native section/material, roof envelope, source guards and deterministic reset passed. Native solid clearance is checked separately.');
