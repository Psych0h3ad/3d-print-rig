import * as THREE from 'three';
import {cadToGlb} from './v0_adapter.mjs?v=trident-clearance-35';

export const v0Slots=[['accelerometer','加速度センサー'],['strain_relief','配線マウント'],['handles','ハンドル'],['tophat','トップハット']];
const basis=new THREE.Matrix4().set(1,0,0,0,0,0,1,0,0,-1,0,0,0,0,0,1);
export function installationMatrix(spec){
 const a=spec.rotation_xyz_deg.map(v=>v*Math.PI/180);
 const native=new THREE.Matrix4().makeRotationFromEuler(new THREE.Euler(...a,'ZYX'));
 const matrix=basis.clone().multiply(native).multiply(basis.clone().invert());
 matrix.setPosition(...cadToGlb(spec.translation_mm));return matrix;
}
export function validateV0Mods(registry,state){
 if(!state||Object.keys(state).length!==v0Slots.length)throw Error('V0 Mod設定が不正です');
 for(const[slot]of v0Slots){const id=state[slot];if(id==='stock'||slot==='accelerometer'&&id==='none')continue;
  const option=registry.options.find(o=>o.id===id&&o.slot===slot);if(!option)throw Error('このマシンにないV0 Modです: '+id);
  for(const[k,v]of Object.entries(option.requires||{}))if(state[k]!==v)throw Error('取付条件を満たしません: '+option.label);
 }
 return {...state};
}
export async function createV0Installations({scene,adapter,profile,registry,loadModule}){
 const roots=new Map(),cached=new Map(),preparing=new Map(),stockOrigins=new Map([...adapter.nodes].map(([k,n])=>[k,n.position.clone()]));
 const materialOrigins=new Map();let disposed=false,enclosure=true,state=Object.fromEntries(v0Slots.map(([k])=>[k,'stock'])),palette={};
 const adxlKeys=[...adapter.records].filter(([,p])=>p.source?.assembly_path?.includes('MiniSB ADXL Mount - Generic:1')).map(([k])=>k);
 async function build(option){
  if(roots.has(option.id))return roots.get(option.id);
  const records=[];
  try{
  for(const spec of option.attachments){
   let model;
   if(spec.stock_key){model=new THREE.Group();model.add(adapter.nodes.get(spec.stock_key).clone(true));model.children[0].visible=true;model.children[0].position.copy(stockOrigins.get(spec.stock_key));}
   else{
    if(!cached.has(spec.module))cached.set(spec.module,Promise.resolve().then(()=>loadModule(spec.module)).catch(e=>{cached.delete(spec.module);throw e}));
    const source=await cached.get(spec.module);model=source.scene.clone(true);const keys=new Set(spec.keys),found=new Set();
    model.traverse(n=>{if(n.userData?.part_key&&n.parent?.userData?.part_key!==n.userData.part_key){n.visible=keys.has(n.userData.part_key);if(n.visible)found.add(n.userData.part_key)}});
    if(found.size!==keys.size)throw Error('Modの部品が不足しています: '+option.id);
   }
   model.traverse(n=>{if(!n.isMesh)return;n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of Array.isArray(n.material)?n.material:[n.material])materialOrigins.set(m,m.color.clone());if(n.material.transparent)n.material.depthWrite=false});
   const wrapper=new THREE.Group();wrapper.name='V0 installed '+option.id+' '+(spec.clone||'');wrapper.userData.v0Installation=option.id;wrapper.applyMatrix4(installationMatrix(spec));wrapper.add(model);wrapper.visible=false;
   records.push({wrapper,model,spec,origin:wrapper.position.clone(),option});
  }
  if(disposed)throw Error('V0ビューを終了しました');
  roots.set(option.id,records);for(const r of records)scene.add(r.wrapper);return records;
  }catch(e){for(const r of records)release(r);throw e}
 }
 function prepare(option){if(!preparing.has(option.id))preparing.set(option.id,build(option).catch(e=>{preparing.delete(option.id);throw e}));return preparing.get(option.id)}
 function release(r){r.wrapper.removeFromParent();r.model.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material]){materialOrigins.delete(m);m.dispose()}})}
 function visibility(){
  const hidden=new Set(state.accelerometer==='none'?adxlKeys:[]);
  for(const option of registry.options)if(state[option.slot]===option.id)for(const key of option.replace_keys)hidden.add(key);
  for(const[k,n]of adapter.nodes){if(hidden.has(k))n.visible=false;else if(adapter.records.get(k).motion!=='reference_flexible')n.visible=adapter.records.get(k).group!=='V0_Enclosure'||enclosure;}
  for(const[id,rows]of roots)for(const r of rows)r.wrapper.visible=state[r.option.slot]===id&&(!r.option.enclosure||enclosure);
 }
 function setPose(pose){const d=pose.map((v,i)=>v-profile.display_reference_xyz_mm[i]);for(const rows of roots.values())for(const r of rows){const delta=cadToGlb(r.spec.motion==='xy'?[d[0],d[1],0]:r.spec.motion==='z_bed'?[0,0,-d[2]]:[0,0,0]);r.wrapper.position.copy(r.origin).add(new THREE.Vector3(...delta))}visibility()}
 function setPalette(colors){palette={...colors};for(const[m,c]of materialOrigins)m.color.copy(c);for(const rows of roots.values())for(const r of rows)r.model.traverse(n=>{
  if(!n.isMesh)return;let p=n;while(p&&!p.userData?.part_key)p=p.parent;
  const role=r.spec.role||r.spec.roles?.[p?.userData?.part_key];if(palette[role])for(const m of Array.isArray(n.material)?n.material:[n.material])m.color.set(palette[role]);
  if(role==='panel')for(const m of Array.isArray(n.material)?n.material:[n.material]){m.transparent=true;m.opacity=.16;m.depthWrite=false;}
 });}
 let request=0;
 async function setState(next){const value=validateV0Mods(registry,next),sequence=++request;const chosen=registry.options.filter(o=>value[o.slot]===o.id);await Promise.all(chosen.map(prepare));if(sequence!==request||disposed)return false;state=value;setPose(adapter.getPose());setPalette(palette);return true}
 return {registry,roots,setState,getState:()=>({...state}),setPose,setPalette,setEnclosureVisible:v=>{enclosure=Boolean(v);visibility()},getNotes:()=>registry.options.filter(o=>state[o.slot]===o.id).map(o=>o.notes),dispose(){disposed=true;request++;for(const rows of roots.values())for(const r of rows)release(r);roots.clear();cached.clear()}};
}
