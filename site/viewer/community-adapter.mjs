import * as THREE from './vendor-r180/three.module.js';
import {validateAxes,nativeMotion,displayMotion,communityConfiguration} from './community-state.mjs?v=460b3fa78cc503ddb6e6';
import {mercuryTubeSpecs,mercuryTubeRoute} from './mercury-tube-routes.mjs?v=d27d615757ad1f732409';
import {stingerFlexWeights} from './stinger-flex.mjs?v=0ab64709177d49ba0fec';
import {stingerTubeRoute} from './stinger-tube-route.mjs';
import {registeredFlexWeights,registeredFlexDelta,createRegisteredChains} from './native-motion-flex.mjs?v=f08726bbc4595e183c74';
import {beltedZWeight,createBeltedZTeeth} from './ender-mods.mjs?v=5f07c69c7c42ba3f3936';
import {createEnderBowden} from './ender-bowden-route.mjs?v=709b99d375c41ef1b8d6';
import {createOriginalEnderXBelt} from './ender-original-x-belt.mjs';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
function hat(v,a,l,h,b){return v<=a||v>=b?0:v<l?(v-a)/(l-a):v<=h?1:(b-v)/(b-h)}
// Flexible source meshes follow their mounted endpoints for visual inspection.
// They are display envelopes; belt tension and link mechanics are not simulated.
function flexWeights(p,r,profile){
 const k=Number(r.key),id=profile.machine_id,[x,y,z]=p;
 if(id==='ender3_stock_220'&&r.group==='belted_z')return {native_axes:{z:[0,beltedZWeight(p),0]}};
 if(id==='lh_stinger_200')return {custom:stingerFlexWeights(p,r.key)};
 if(id==='antithesis_aether_mk11'&&k===347)return {native_axes:{x:[0,hat(y,-610.25,-530,-470,-395),0],y:[hat(x,-170.75,-81,-7,163.75),0,0]}};
 if(id==='ratrig_vminion_180'&&k===141)return {native_axes:{x:[hat(x,-70.68,-34.85,-.15,203.83),0,0],z:[0,0,1]}};
 if(id==='snakeoil_xy_180'&&r.group==='belt')return {native_axes:{x:[hat(x,-156,-24,24,156)*hat(y,5,180.5,232.9,370.5),0,0],y:[0,hat(y,5,170.76,232.5,370.5),0]}};
 if(id.startsWith('mercury')){
  const small=id.endsWith('235'),side=small?195:259,front=small?-167:-239.5,back=small?231:303.5,pivot=small?15.89:13.34;
  const low=k===(small?76:493),fixedSide=low?-1:1;
  const wy=x*fixedSide>side+5?0:hat(y,front,pivot-40,pivot+40,back);
  return {custom:[hat(x,-side+12,-25,25,side-12)*wy,wy,0]};
 }
 if(id==='siboor_sboom_220'){
  if(k===364)return {custom:[0,x>140?hat(y,-432.59,-282.1,-258.09,-61.59):0,0]};
  if(k===409){const wz=hat(z,98.4,224,280,456.1);return {custom:[hat(x,-27.82,119.7,153.7,301.22)*wz,0,wz]}}
  if(k===578)return {custom:[smooth((272.35-x)/(272.35-127.7)),0,1]};
  if(k===579)return {custom:[0,0,y<-135?smooth((z-100.25)/(290-100.25)):0]};
  if(k===365)return {custom:[0,smooth((z-24.61)/(113.25-24.61)),0]};
 }
 if(r.group==='x_belt'){
  const [a,b]=r.native_bounds_mm;return {custom:[x<0?clamp((x-a[0])/(b[0]-a[0])):clamp((b[0]-x)/(b[0]-a[0])),1,0]};
 }
 return {custom:[0,0,0]};
}
export function createCommunityAdapter(root,manifest,profile){
 const records=new Map(manifest.parts.map(r=>[r.key,r])),nodes=new Map(),initial=new Map(),flex=[];let axes=Object.fromEntries(Object.keys(profile.axes).map(k=>[k,0])),references=false,configuration='stock',hiddenKeys=new Set();
 root.traverse(n=>{if(n.userData?.part_key){if(nodes.has(n.userData.part_key))throw Error('Duplicate native part');nodes.set(n.userData.part_key,n)}});
 if(nodes.size!==records.size||nodes.size!==manifest.native_leaf_count)throw Error('Incomplete native assembly');root.updateMatrixWorld(true);
 for(const[key,node]of nodes){
  const r=records.get(key),rest=displayMotion(profile.motion_registration?.rest_offsets_mm?.[r.group]||[0,0,0],profile);
  node.matrixAutoUpdate=false;node.matrix.elements[12]+=rest[0];node.matrix.elements[13]+=rest[1];node.matrix.elements[14]+=rest[2];initial.set(key,node.matrix.clone());
  node.traverse(m=>{if(!m.isMesh)return;m.frustumCulled=false;m.material=Array.isArray(m.material)?m.material.map(x=>x.clone()):m.material.clone();for(const material of [].concat(m.material))if(material.transparent)material.depthWrite=false;
   if(!['tube','belt','chain','bed_wire','x_belt','compound_motion','registered_flex','belted_z'].includes(r.group))return;
   if(r.group==='tube'&&(mercuryTubeSpecs[profile.machine_id]||profile.machine_id==='lh_stinger_200'&&key==='332')){
    m.geometry=m.geometry.clone();const source=m.geometry.attributes.position.array.slice();
    const route=profile.machine_id==='lh_stinger_200'?stingerTubeRoute(axes,profile):mercuryTubeRoute(profile.machine_id,axes);m.geometry.dispose();m.geometry=new THREE.TubeGeometry(route.curve,profile.machine_id==='lh_stinger_200'?192:128,.002,12,false);
    flex.push({mesh:m,source:m.geometry.attributes.position.array.slice(),routed:true,key,nativeSource:source});return;
   }
   m.geometry=m.geometry.clone();const attribute=m.geometry.attributes.position,source=attribute.array.slice(),weights=[];
   for(let i=0;i<attribute.count;i++){
    const display=[source[i*3]*1000,source[i*3+1]*1000,source[i*3+2]*1000];
    const native=profile.origin_mm.map((v,j)=>v+profile.basis.reduce((s,row,a)=>s+row[j]*display[a],0));
    const weight=r.group==='registered_flex'?registeredFlexWeights(native,profile.motion_registration.flex[key]):flexWeights(native,r,profile);weights.push(weight);
    if(r.group==='registered_flex')for(const[group,factor]of Object.entries(weight)){const shift=displayMotion(profile.motion_registration.rest_offsets_mm?.[group]||[0,0,0],profile);for(let j=0;j<3;j++)source[3*i+j]+=shift[j]*factor}
   }flex.push({mesh:m,key,source,weights,normals:m.geometry.attributes.normal?.array.slice(),spec:r.group==='registered_flex'?profile.motion_registration.flex[key]:null});
  });
 }
 const chains=createRegisteredChains(nodes,initial,profile),teeth=createBeltedZTeeth(root,profile),bowden=createEnderBowden(root,profile);const originalXBelt=createOriginalEnderXBelt(root,profile);let restOffsets={};
 function setAxes(next){
  validateAxes(next,profile,configuration);axes={...next};
  const motions=new Map([...new Set([...records.values()].map(r=>r.group))].map(group=>[group,displayMotion(nativeMotion(group,axes,profile),profile)])),head=displayMotion(nativeMotion('head',axes,profile),profile),axisNames=['x','y','z'];
  for(const[key,node]of nodes){const r=records.get(key),delta=motions.get(r.group),rest=displayMotion(restOffsets[key]||[0,0,0],profile);node.matrixAutoUpdate=false;node.matrix.copy(initial.get(key));for(let i=0;i<3;i++)node.matrix.elements[12+i]+=delta[i]+rest[i];node.visible=!hiddenKeys.has(key)&&(r.group!=='reference'||references)}
  teeth.update(axes,nodes.has('belted_253')&&!hiddenKeys.has('belted_253'));
  bowden.update(axes,configuration);
  originalXBelt.update(axes);
  chains.update(axes);
  for(const e of flex){
   if(e.routed){
    const route=profile.machine_id==='lh_stinger_200'?stingerTubeRoute(axes,profile):mercuryTubeRoute(profile.machine_id,axes),geometry=new THREE.TubeGeometry(route.curve,profile.machine_id==='lh_stinger_200'?192:128,.002,12,false);
    e.mesh.geometry.dispose();e.mesh.geometry=geometry;continue;
   }
   const a=e.mesh.geometry.attributes.position;a.array.set(e.source);
   const registered=e.spec?new Map(Object.keys(profile.motions).map(group=>[group,registeredFlexDelta({[group]:1},e.spec,axes,profile)])):null;
   for(let i=0;i<a.count;i++){const w=e.weights[i],delta=e.spec?[0,1,2].map(j=>Object.entries(w).reduce((v,[group,weight])=>v+registered.get(group)[j]*weight,0)):w.native_axes?displayMotion([0,1,2].map(j=>Object.entries(w.native_axes).reduce((v,[k,c])=>v+c[j]*axes[k],0)),profile):w.head!==undefined?head.map(v=>v*w.head):displayMotion(w.custom.map((v,j)=>v*axes[axisNames[j]]),profile);for(let j=0;j<3;j++)a.array[3*i+j]=e.source[3*i+j]+delta[j]}
   a.needsUpdate=true;
   if(e.normals&&Object.values(axes).every(v=>v===0)){e.mesh.geometry.attributes.normal.array.set(e.normals);e.mesh.geometry.attributes.normal.needsUpdate=true}else e.mesh.geometry.computeVertexNormals();
   // Native tessellations can include coincident seam vertices at float32 precision.
   // Retain their authored unit normals instead of introducing zero-length normals.
   const normal=e.mesh.geometry.attributes.normal;if(e.normals)for(let i=0;i<normal.count;i++)if(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))<1e-12)normal.setXYZ(i,e.normals[3*i],e.normals[3*i+1],e.normals[3*i+2]);
   e.mesh.geometry.computeBoundingBox();e.mesh.geometry.computeBoundingSphere();
  }root.updateMatrixWorld(true);return {...axes};
 }
 function setPalette(palette){for(const[key,node]of nodes){const role=records.get(key).appearance_role;if(!palette[role])continue;node.traverse(m=>{if(m.isMesh)for(const material of [].concat(m.material))material.color.set(palette[role])})}}
 function setReferences(value){references=Boolean(value);for(const[key,node]of nodes)if(records.get(key).group==='reference')node.visible=references&&!hiddenKeys.has(key)}
 function setConfiguration(id){const spec=communityConfiguration(profile,id),keys=spec.hidden_keys||[],rest=spec.rest_offsets_mm||{};if(!Array.isArray(keys)||new Set(keys).size!==keys.length||keys.some(k=>!records.has(k))||Object.entries(rest).some(([k,v])=>!records.has(k)||!Array.isArray(v)||v.length!==3||!v.every(Number.isFinite)))throw Error('Incomplete configuration installation');configuration=id;hiddenKeys=new Set(keys);restOffsets=rest;for(const[k,[a,b]]of Object.entries(spec.axes||{}))axes[k]=Math.max(a,Math.min(b,axes[k]));setAxes(axes);return id}
 setConfiguration(configuration);return {root,nodes,records,flex,chains,teeth,bowden,originalXBelt,setAxes,setPalette,setReferences,setConfiguration,getConfiguration:()=>configuration,getAxes:()=>({...axes})};
}
