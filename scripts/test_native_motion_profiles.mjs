import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyNativeMotionProfile} from '../site/viewer/native-motion-profile.mjs';
import {nativeMotion,communityMotionEnabled} from '../site/viewer/community-state.mjs';
import {registeredFlexWeights,registeredFlexDelta} from '../site/viewer/native-motion-flex.mjs';
import {bedChainRoute} from '../site/viewer/bed-chain.mjs';
const directory=new URL('../site/viewer/motion-profiles/',import.meta.url);
const names=fs.readdirSync(directory).filter(n=>n.endsWith('.json'));
assert.equal(names.length,9);
for(const name of names){
 const rig=JSON.parse(fs.readFileSync(new URL(name,directory))),keys=Object.values(rig.groups).flat();
 assert.match(rig.model_sha256,/^[a-f0-9]{64}$/);assert.equal(keys.length,rig.part_count);assert.equal(new Set(keys).size,keys.length);
 for(const range of Object.values(rig.axes)){assert(range.every(Number.isFinite));assert(range[0]<=0&&range[1]>=0&&range[1]>range[0]);}
 const original={parts:keys.map(key=>({key,group:'fixed',bounds_mm:[[0,0,0],[1,1,1]]}))};
 const {profile}=applyNativeMotionProfile(original,{machine_id:rig.machine_id,basis:[[1,0,0],[0,0,1],[0,-1,0]],origin_mm:[0,0,0]},rig,rig.model_sha256);
 assert(communityMotionEnabled(profile));
 assert.throws(()=>applyNativeMotionProfile(original,profile,rig,'wrong'));
 assert.throws(()=>applyNativeMotionProfile({...original,parts:original.parts.slice(1)},profile,rig,rig.model_sha256));
 assert.throws(()=>applyNativeMotionProfile(original,profile,{...rig,groups:{...rig.groups,duplicate:[keys[0]]}},rig.model_sha256));
 for(const rangeEnd of [0,1]){
  const axes=Object.fromEntries(Object.entries(rig.axes).map(([k,r])=>[k,r[rangeEnd]]));
  for(const group of Object.keys(rig.groups))assert(nativeMotion(group,axes,profile).every(Number.isFinite));
  for(const spec of Object.values(rig.flex||{}))if(spec.type==='native_belt_boundary'){
   assert(spec.width_mm>0);assert(spec.wires.length);assert.match(spec.native_file_sha256,/^[a-f0-9]{64}$/);
   for(const wire of spec.wires)for(const edge of wire.edges){
    const p=[0,0,0];for(let i=0;i<2;i++)p[spec.plane_axes[i]]=edge.start[i];p[spec.width_axis]=spec.axial_mm;
    const w=registeredFlexWeights(p,spec);assert(Math.abs(Object.values(w).reduce((a,b)=>a+b,0)-1)<1e-8);
    assert(registeredFlexDelta(w,spec,axes,profile).every(Number.isFinite));
   }
  }
  for(const chain of rig.chains||[]){
   const uv=chain.plane_axes,d=chain.links[0].to_mm.map((v,i)=>v-chain.links[0].from_mm[i]),vertical=Math.abs(d[0])>Math.abs(d[1])?0:1,horizontal=1-vertical;
   const sx=Math.sign(chain.end_mm[horizontal]-chain.start_mm[horizontal])||1,sy=Math.sign(d[vertical])||1;
   const project=p=>[p[horizontal]*sx,p[vertical]*sy],start=project(chain.start_mm),end=project(chain.end_mm);
   const delta=project(uv.map(a=>nativeMotion(chain.moving_group,axes,profile)[a]));
   const route=bedChainRoute(start,end.map((v,i)=>v+delta[i]),chain.links.length,chain.pitch_mm);
   assert(route.endpoint_error_mm<1e-5);
  }
 }
}
console.log('Nine exact native motion registrations: complete identities, hash rejection, signed motion, belt boundary weights and rigid-chain reach. Actual exported geometry and native-solid audits are separate.');

