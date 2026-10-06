import * as THREE from './vendor-r180/three.module.js';
import {nativeMotion,displayMotion} from './community-state.mjs?v=28a3ee6638eaf28328b4';
import {bedChainRoute} from './bed-chain.mjs';
const clamp=v=>Math.max(0,Math.min(1,v));
const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
function segment(p,a,b){const dx=b[0]-a[0],dy=b[1]-a[1],t=clamp(((p[0]-a[0])*dx+(p[1]-a[1])*dy)/(dx*dx+dy*dy||1));return {t,d:dist(p,[a[0]+dx*t,a[1]+dy*t])}}
function beltWeights(p,spec){
 const q=spec.plane_axes.map(a=>p[a]);let best={d:Infinity,weights:{}};
 for(const wire of spec.wires)for(const e of wire.edges){
  let candidate;
  if(e.type==='circle'){
   const angle=Math.atan2(q[1]-e.center[1],q[0]-e.center[0]),relative=((e.turn*(angle-e.start_angle))%(2*Math.PI)+2*Math.PI)%(2*Math.PI);
   if(relative<=e.sweep+.002)candidate={d:Math.abs(dist(q,e.center)-e.radius),weights:{[e.group]:1}};
   else candidate={d:Math.min(dist(q,e.start),dist(q,e.end)),weights:{[e.group]:1}};
  }else{
   const points=e.points||[e.start,e.end];let hit={d:Infinity};
   for(let i=1;i<points.length;i++){const r=segment(q,points[i-1],points[i]);if(r.d<hit.d)hit={d:r.d,t:(i-1+r.t)/(points.length-1)}}
   candidate={d:hit.d,weights:{[e.start_group||'fixed']:1-hit.t}};candidate.weights[e.end_group||'fixed']=(candidate.weights[e.end_group||'fixed']||0)+hit.t;
  }
  if(candidate.d<best.d)best=candidate;
 }
 return best.weights;
}
export function registeredFlexWeights(native,spec){
 if(spec.type==='native_belt_boundary')return beltWeights(native,spec);
 if(spec.type==='bed_wire')return {bed:clamp((native[2]-spec.fixed_z)/(spec.moving_z-spec.fixed_z))};
 if(spec.type==='endpoint_route'){
  const d=spec.fixed_mm.map((v,i)=>v-spec.moving_mm[i]),q=native.map((v,i)=>v-spec.moving_mm[i]),t=clamp(q.reduce((s,v,i)=>s+v*d[i],0)/d.reduce((s,v)=>s+v*v,0));
  const w=t*t*(3-2*t);return {[spec.moving_group]:1-w,[spec.fixed_group||'fixed']:w};
 }
 throw Error('Unknown registered flexible native component');
}
export function registeredFlexDelta(weights,spec,axes,profile){
 const delta=[0,0,0];for(const[group,weight]of Object.entries(weights)){const motion=nativeMotion(group,axes,profile);for(let j=0;j<3;j++)delta[j]+=motion[j]*weight}
 if(spec.type==='native_belt_boundary'&&spec.axial_group)delta[spec.width_axis]=nativeMotion(spec.axial_group,axes,profile)[spec.width_axis];
 return displayMotion(delta,profile);
}
export function createRegisteredChains(nodes,initial,profile){
 const entries=(profile.motion_registration?.chains||[]).map(spec=>{
  const uv=spec.plane_axes,first=spec.links[0],d=first.to_mm.map((v,i)=>v-first.from_mm[i]),vertical=Math.abs(d[0])>Math.abs(d[1])?0:1,horizontal=1-vertical;
  const signs=[Math.sign(spec.end_mm[horizontal]-spec.start_mm[horizontal])||1,Math.sign(d[vertical])||1];
  const project=p=>[p[horizontal]*signs[0],p[vertical]*signs[1]],unproject=p=>{const out=[];out[horizontal]=p[0]*signs[0];out[vertical]=p[1]*signs[1];return out};
  const start=project(spec.start_mm),end=project(spec.end_mm),normal=new THREE.Vector3(...displayMotion([0,1,2].map(a=>a===spec.normal_axis?1:0),profile)).normalize();
  // Logical XY ordering may swap or reflect the native hinge plane.
  const cross=new THREE.Vector3(...displayMotion([0,1,2].map(a=>a===uv[horizontal]?signs[0]:0),profile)).cross(new THREE.Vector3(...displayMotion([0,1,2].map(a=>a===uv[vertical]?signs[1]:0),profile))).normalize();normal.copy(cross);
  const links=spec.links.map(link=>{const from=project(link.from_mm),to=project(link.to_mm);return {...link,angle:Math.atan2(to[1]-from[1],to[0]-from[0]),from:new THREE.Vector3(...displayMotion([0,1,2].map(a=>uv.includes(a)?link.from_mm[uv.indexOf(a)]-profile.origin_mm[a]:0),profile))}});
  return {spec,uv,signs,start,end,links,normal,unproject,project};
 });
 let reports=[];
 function update(axes){
  reports=[];for(const e of entries){
   const motion=nativeMotion(e.spec.moving_group,axes,profile),delta=e.project(e.uv.map(a=>motion[a])),end=e.end.map((v,i)=>v+delta[i]),route=bedChainRoute(e.start,end,e.links.length,e.spec.pitch_mm),zero=motion.every(v=>Math.abs(v)<1e-9);
   for(const[i,link]of e.links.entries())for(const key of link.keys){
    const node=nodes.get(key);if(!node)throw Error('Missing registered chain link');node.matrix.copy(initial.get(key));
    if(zero)continue;
    const target=e.unproject(route.points[i]),native=[0,0,0];for(const[j,a]of e.uv.entries())native[a]=target[j]-profile.origin_mm[a];
    const to=new THREE.Vector3(...displayMotion(native,profile)),rotation=new THREE.Matrix4().makeRotationAxis(e.normal,route.angles[i]-link.angle),translation=to.clone().sub(link.from.clone().applyMatrix4(rotation));
    rotation.setPosition(translation);node.matrix.premultiply(rotation);
   }
   reports.push({links:e.links.length,pitch_mm:e.spec.pitch_mm,endpoint_error_mm:route.endpoint_error_mm,native_joint_gap_mm:e.spec.native_joint_gap_mm});
  }
  return reports;
 }
 return {update,getReports:()=>reports};
}
