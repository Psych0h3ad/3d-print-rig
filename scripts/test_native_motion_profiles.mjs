import assert from 'node:assert/strict';
import fs from 'node:fs';
import {applyNativeMotionProfile} from '../site/viewer/native-motion-profile.mjs';
import {nativeMotion,communityMotionEnabled} from '../site/viewer/community-state.mjs';
import {registeredFlexWeights,registeredFlexDelta} from '../site/viewer/native-motion-flex.mjs';
import {bedChainRoute} from '../site/viewer/bed-chain.mjs';
import {setupNativeMotionControls} from '../site/viewer/native-motion-controls.mjs';
import {Vector3} from '../site/viewer/vendor-r180/three.module.js';
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
 if(rig.machine_id==='fysetc_v24_250_pro'){
  for(let n=353;n<=361;n++)assert(rig.groups.head.includes('fysetc_v24_250_pro_'+n),'Every X block body and seal follows the head');
  for(const n of [83,85,87])assert(rig.groups.z_gantry.includes('fysetc_v24_250_pro_'+n),'Rear cable gland stays on its bracket');
  for(const n of [105,106,109,181,182,183,184,1110,1118])assert.equal(rig.appearance_roles['fysetc_v24_250_pro_'+n],null,'Protect commercial hardware, CNC and bed materials');
 }
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
// Reject invalid saved configurations before changing a mounted assembly.
const rig=JSON.parse(fs.readFileSync(new URL('annex_k2_assembly.json',directory)));
const elements=new Map(['x','y','z','xValue','yValue','zValue','motionPlay','motionPause','resetPose'].map(id=>[id,{}]));
globalThis.document={documentElement:{lang:'en'},body:{dataset:{}},getElementById:id=>elements.get(id)};globalThis.window=new EventTarget();
let axes={x:0,y:0,z:0},appearance={enclosure:true};
const profile={machine_id:rig.machine_id,axes:rig.axes,motion_registration:rig};
const camera={position:new Vector3(1,1,1),up:new Vector3(0,1,0)},controls={target:new Vector3(),update(){}};
const control=setupNativeMotionControls({adapter:{getAxes:()=>({...axes}),setAxes:next=>{axes={...next}}},profile,camera,controls,render(){},scope:{cleanup(){}},getDisplay:()=>({...appearance}),setDisplay:d=>{appearance={...d}},validateDisplay:d=>{assert.equal(typeof d.enclosure,'boolean')}});
control.set({x:-200,y:-100,z:30});const saved=control.capture();assert.deepEqual(saved.axes,axes);assert.equal(saved.display.enclosure,true);
control.set({x:0,y:0,z:0});appearance={enclosure:false};control.restore(saved);assert.deepEqual(axes,saved.axes);assert.equal(appearance.enclosure,true);
for(const invalid of [{...saved,model_sha256:'wrong'},{...saved,axes:{...saved.axes,z:500}},{...saved,camera:{...saved.camera,up:[0,0,0]}},{...saved,display:{enclosure:'wrong'}}]){
 assert.throws(()=>control.restore(invalid));assert.deepEqual(axes,saved.axes);assert.equal(appearance.enclosure,true);
}
delete globalThis.document;delete globalThis.window;
console.log('Nine exact native motion registrations: complete identities, hash rejection, signed motion, belt boundary weights and rigid-chain reach. Actual exported geometry and native-solid audits are separate.');

