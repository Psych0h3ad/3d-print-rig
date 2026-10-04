import * as THREE from './vendor-r180/three.module.js';
import {validateAxes,nativeMotion,displayMotion} from './community-state.mjs?v=e7dc4353c10ea94a369d';
const clamp=(v,a=0,b=1)=>Math.max(a,Math.min(b,v));
const smooth=v=>{v=clamp(v);return v*v*(3-2*v)};
function hat(v,a,l,h,b){return v<=a||v>=b?0:v<l?(v-a)/(l-a):v<=h?1:(b-v)/(b-h)}
// Flexible source meshes follow their mounted endpoints for visual inspection.
// They are display envelopes; belt tension and link mechanics are not simulated.
function flexWeights(p,r,profile){
 const k=Number(r.key),id=profile.machine_id,[x,y,z]=p;
 if(id.startsWith('mercury')){
  if(r.group==='tube'){
   const a=profile.flex?.tube_fixed,b=profile.flex?.tube_head;
   if(!a||!b)throw Error('Missing tube connectors');
   const da=Math.hypot(...p.map((v,i)=>v-a[i])),db=Math.hypot(...p.map((v,i)=>v-b[i]));
   return {head:smooth(da/(da+db))};
  }
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
 const records=new Map(manifest.parts.map(r=>[r.key,r])),nodes=new Map(),initial=new Map(),flex=[];let axes={x:0,y:0,z:0},references=false;
 root.traverse(n=>{if(n.userData?.part_key){if(nodes.has(n.userData.part_key))throw Error('Duplicate native part');nodes.set(n.userData.part_key,n)}});
 if(nodes.size!==records.size||nodes.size!==manifest.native_leaf_count)throw Error('Incomplete native assembly');root.updateMatrixWorld(true);
 for(const[key,node]of nodes){
  initial.set(key,node.matrix.clone());const r=records.get(key);
  node.traverse(m=>{if(!m.isMesh)return;m.frustumCulled=false;m.material=Array.isArray(m.material)?m.material.map(x=>x.clone()):m.material.clone();for(const material of [].concat(m.material))if(material.transparent)material.depthWrite=false;
   if(!['tube','belt','chain','bed_wire','x_belt'].includes(r.group))return;
   m.geometry=m.geometry.clone();const attribute=m.geometry.attributes.position,source=attribute.array.slice(),weights=[];
   for(let i=0;i<attribute.count;i++){
    const display=[source[i*3]*1000,source[i*3+1]*1000,source[i*3+2]*1000];
    const native=profile.origin_mm.map((v,j)=>v+profile.basis.reduce((s,row,a)=>s+row[j]*display[a],0));weights.push(flexWeights(native,r,profile));
   }flex.push({mesh:m,source,weights});
  });
 }
 function setAxes(next){
  validateAxes(next,profile);axes={...next};
  const motions=new Map([...new Set([...records.values()].map(r=>r.group))].map(group=>[group,displayMotion(nativeMotion(group,axes,profile),profile)])),head=displayMotion(nativeMotion('head',axes,profile),profile),axisNames=['x','y','z'];
  for(const[key,node]of nodes){const r=records.get(key),delta=motions.get(r.group);node.matrixAutoUpdate=false;node.matrix.copy(initial.get(key));node.matrix.elements[12]+=delta[0];node.matrix.elements[13]+=delta[1];node.matrix.elements[14]+=delta[2];node.visible=r.group!=='reference'||references}
  for(const e of flex){
   const a=e.mesh.geometry.attributes.position;a.array.set(e.source);
   for(let i=0;i<a.count;i++){const w=e.weights[i],delta=w.head!==undefined?head.map(v=>v*w.head):displayMotion(w.custom.map((v,j)=>v*axes[axisNames[j]]),profile);for(let j=0;j<3;j++)a.array[3*i+j]=e.source[3*i+j]+delta[j]}
   a.needsUpdate=true;e.mesh.geometry.computeVertexNormals();e.mesh.geometry.computeBoundingBox();e.mesh.geometry.computeBoundingSphere();
  }root.updateMatrixWorld(true);return {...axes};
 }
 function setPalette(palette){for(const[key,node]of nodes){const role=records.get(key).appearance_role;if(!palette[role])continue;node.traverse(m=>{if(m.isMesh)for(const material of [].concat(m.material))material.color.set(palette[role])})}}
 function setReferences(value){references=Boolean(value);for(const[key,node]of nodes)if(records.get(key).group==='reference')node.visible=references}
 setAxes(axes);return {root,nodes,records,flex,setAxes,setPalette,setReferences,getAxes:()=>({...axes})};
}
