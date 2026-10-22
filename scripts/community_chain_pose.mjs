import assert from 'node:assert/strict';
import {Vector3} from '../site/viewer/vendor-r180/three.module.js';
import {nativeMotion,displayMotion} from '../site/viewer/community-state.mjs';
import {bedChainRoute} from '../site/viewer/bed-chain.mjs';

export function bindCommunityChainFeatures(nodes,initial,profile){
 const keys=new Set(),chains=[];
 for(const spec of profile.motion_registration?.chains||[]){
  const uv=spec.plane_axes;
  assert.equal(new Set([...uv,spec.normal_axis]).size,3,'Invalid chain feature plane');
  assert(spec.links.length>0&&spec.pitch_mm>0&&Number.isFinite(spec.pitch_mm));
  const first=spec.links[0],d=first.to_mm.map((v,i)=>v-first.from_mm[i]),vertical=Math.abs(d[0])>Math.abs(d[1])?0:1,horizontal=1-vertical;
  const signs=[Math.sign(spec.end_mm[horizontal]-spec.start_mm[horizontal])||1,Math.sign(d[vertical])||1];
  const project=p=>[p[horizontal]*signs[0],p[vertical]*signs[1]];
  const point=(p,normal=0)=>{const native=[0,0,0];for(let i=0;i<2;i++)native[uv[i]]=p[i]-profile.origin_mm[uv[i]];native[spec.normal_axis]=normal;return new Vector3(...displayMotion(native,profile))};
  const links=spec.links.map(link=>{
   assert(link.keys.length>0);assert([...link.from_mm,...link.to_mm].every(Number.isFinite));
   const from=project(link.from_mm),to=project(link.to_mm),length=Math.hypot(to[0]-from[0],to[1]-from[1]);assert(length>0);
   const features=[point(link.from_mm),point(link.to_mm),point(link.from_mm,1)];
   const leaves=link.keys.map(key=>{assert(!keys.has(key),'Duplicate chain feature owner');keys.add(key);assert(nodes.has(key)&&initial.has(key),`Missing source-bound chain leaf ${key}`);const inverse=initial.get(key).clone().invert();return {key,inverse,local:features.map(p=>p.clone().applyMatrix4(inverse))}});
   return {length,features,leaves};
  });
  chains.push({spec,uv,signs,vertical,horizontal,project,point,links});
 }
 return {keys,chains};
}

export function assertCommunityChainFeatures(binding,nodes,axes,profile){
 for(const e of binding.chains){
  const fixed=nativeMotion(e.spec.fixed_group||'fixed',axes,profile),moving=nativeMotion(e.spec.moving_group,axes,profile),relative=moving.map((v,i)=>v-fixed[i]);
  const delta=e.project(e.uv.map(a=>relative[a])),end=e.project(e.spec.end_mm).map((v,i)=>v+delta[i]);
  const route=bedChainRoute(e.project(e.spec.start_mm),end,e.links.length,e.spec.pitch_mm),shift=new Vector3(...displayMotion(fixed,profile));
  assert(route.endpoint_error_mm<1e-5,'Registered chain route endpoint detached');
  for(const [i,link] of e.links.entries()){
   let expected;
   if(relative.every(v=>Math.abs(v)<1e-9))expected=link.features.map(p=>p.clone().add(shift));
   else{
    const from=[],to=[];for(const [p,target] of [[from,route.points[i]],[to,[route.points[i][0]+Math.cos(route.angles[i])*link.length,route.points[i][1]+Math.sin(route.angles[i])*link.length]]]){p[e.horizontal]=target[0]*e.signs[0];p[e.vertical]=target[1]*e.signs[1]}
    expected=[e.point(from),e.point(to),e.point(from,1)].map(p=>p.add(shift));
   }
   for(const leaf of link.leaves){
    const node=nodes.get(leaf.key);assert(node,'Missing bound chain node');
    assert(node.matrixWorld.elements.every(Number.isFinite),'Non-finite chain transform');
    const transform=node.matrixWorld.clone().multiply(leaf.inverse),columns=[0,1,2].map(i=>new Vector3().setFromMatrixColumn(transform,i));
    assert(Math.abs(transform.determinant()-1)<1e-8,'Chain transform must remain a proper rigid motion');
    for(let a=0;a<3;a++)for(let b=a;b<3;b++)assert(Math.abs(columns[a].dot(columns[b])-(a===b?1:0))<1e-8,'Chain link stretched or sheared');
    for(let p=0;p<3;p++){
     const actual=leaf.local[p].clone().applyMatrix4(node.matrixWorld);
     for(const axis of ['x','y','z'])assert(Math.abs(actual[axis]-expected[p][axis])<1e-8,`${profile.machine_id}/${leaf.key}: source-bound chain feature ${p}/${axis} drift`);
    }
   }
  }
 }
}
