// The V6 module copies these four authored front leaves from the pinned SB
// assembly. Its V6 mount, hotend, LEDs and purchased hardware are not admitted.
import fs from 'node:fs/promises';
import path from 'node:path';
import zlib from 'node:zlib';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {headPlan,headPlacement,partKey} from '../site/viewer/head-assembly.js';
import {snapshotHeadSurfaces,planSurfaceSelection} from '../site/viewer/step-surface-selection.mjs';
import {writeSurfaceStep} from '../site/viewer/step-surface-writer.mjs';
const hash=b=>crypto.createHash('sha256').update(b).digest('hex');
const keys=['sb_v6_front_6','sb_v6_front_9','sb_v6_front_10','sb_v6_front_11'];
export async function auditV6Surfaces(root,{catalog,policy}={}){
 const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
 catalog??=await read('TOOLHEAD_CONFIGURATIONS.json');policy??=await read('viewer/step-surface-sources.json');
 const spec=catalog.assets.sb_v6;assert(spec&&!spec.external);
 const meta=await read(spec.meta);let file=spec.glb;try{await fs.access(path.join(root,file))}catch{file+='.gz'}
 const raw=await fs.readFile(path.join(root,file)),bytes=file.endsWith('.gz')?zlib.gunzipSync(raw):raw;
 const model=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const scene=new THREE.Scene(),bench=new THREE.Group(),assembly=model.scene;scene.add(bench);bench.add(assembly);
 const metadata=new Map(meta.parts.map(p=>[String(p.key),p])),meshes=[];
 assembly.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh),row=metadata.get(key);assert(row);mesh.material=mesh.material.clone();meshes.push({key,mesh,role:row.appearance_role})});
 const cached=new Map([['sb_v6',{loaded:{root:assembly,meta,meshes}}]]);
 const snapshot=()=>snapshotHeadSurfaces({cached,bench,THREE,policy,catalog});
 const canonicalSpec=catalog.assets.sb_revo_voron;assert(canonicalSpec&&!canonicalSpec.external);
 const canonicalMeta=await read(canonicalSpec.meta);let canonicalFile=canonicalSpec.glb;try{await fs.access(path.join(root,canonicalFile))}catch{canonicalFile+='.gz'}
 const canonicalRaw=await fs.readFile(path.join(root,canonicalFile)),canonicalBytes=canonicalFile.endsWith('.gz')?zlib.gunzipSync(canonicalRaw):canonicalRaw;
 const canonicalModel=await new GLTFLoader().parseAsync(canonicalBytes.buffer.slice(canonicalBytes.byteOffset,canonicalBytes.byteOffset+canonicalBytes.byteLength),''),canonicalBench=new THREE.Group(),canonicalMeshes=[];
 canonicalBench.add(canonicalModel.scene);canonicalModel.scene.traverse(mesh=>{if(mesh.isMesh)canonicalMeshes.push({key:partKey(mesh),mesh})});
 const canonicalRows=snapshotHeadSurfaces({cached:new Map([['sb_revo_voron',{loaded:{root:canonicalModel.scene,meta:canonicalMeta,meshes:canonicalMeshes}}]]),bench:canonicalBench,THREE,policy,catalog});
 const sourceMatrix=(row,delta=[0,0,0])=>{
  const alias=policy.parts.find(p=>p.key===row.id),source=canonicalRows.find(p=>p.id===alias?.sourceAlias?.key);assert(source,'Missing canonical authored leaf');
  assert.equal(row.matrixCAD.length,16);assert(row.matrixCAD.every(Number.isFinite));
  for(let j=0;j<16;j++)assert(Math.abs(row.matrixCAD[j]-source.matrixCAD[j]-(j>=12&&j<=14?delta[j-12]:0))<1e-9,'Copied source placement changed: '+row.id);
 };
 // A copied purchased leaf is still omitted. Asset/key and complete buffer
 // hashes are both required; neither role nor geometric similarity grants it.
 const initial=await planSurfaceSelection(snapshot(),policy);assert.deepEqual(initial.included.map(p=>p.id).sort(),keys.slice().sort());
 for(const row of initial.included){
  const original=policy.parts.find(p=>p.asset==='sb_revo_voron'&&p.sourceSelector.id===row.sourceSelector.id);
  assert(original);assert.equal(row.positionSha256,original.geometry.position.sha256);assert.equal(row.indexSha256,original.geometry.index.sha256);
  sourceMatrix(row);
 }
 // Actual accessor-identical child-node transform mutations must reject too.
 let transformRejects=0;
 for(const key of keys){const mesh=meshes.find(p=>p.key===key).mesh;assert(mesh.matrixAutoUpdate);const position=mesh.position.clone(),quaternion=mesh.quaternion.clone(),scale=mesh.scale.clone();
  for(const mutate of [()=>mesh.position.x+=.001,()=>mesh.rotateZ(.1),()=>mesh.scale.x*=1.01]){try{mutate();assert.throws(()=>sourceMatrix(snapshot().find(p=>p.id===key)),/Copied source placement changed/);transformRejects++}finally{mesh.position.copy(position);mesh.quaternion.copy(quaternion);mesh.scale.copy(scale)}}
 }
 for(const key of ['sb_v6_front_7','sb_v6_front_13','sb_v6_mount_0','sb_v6_mount_1','sb_v6_hot_83'])assert(initial.omitted.some(p=>p.id==='sb_v6:'+key&&p.reason==='source-not-admitted'));
 const variants=catalog.variants.filter(v=>headPlan(v).modules.some(m=>m.id==='sb_v6'));assert(variants.length>0);
 const poses=[{probe:0,explode:0,delta:[0,0,0]},{probe:3,explode:50,delta:[0,-50,3]},{probe:1.5,explode:20,delta:[0,-20,1.5]},{probe:0,explode:0,delta:[0,0,0]}],palettes=[['#ffffff','#0095a8'],['#203040','#ff3500'],['#ffffff','#0095a8']],rows=[];
 let reference;
 for(const variant of variants){
  const entry=headPlan(variant).modules.find(m=>m.id==='sb_v6'),hidden=new Set(entry.hidden_keys||[]),expected=keys.filter(key=>!hidden.has(key)).sort();
  for(const row of meshes)row.mesh.visible=!hidden.has(row.key)&&!['dock','rail_reference','shuttle_reference'].includes(metadata.get(row.key).component);
  let first;
  for(const pose of poses){
   const p=headPlacement(variant,entry,pose);assembly.position.set(p[0]*.001,p[2]*.001,-p[1]*.001);
   const expectedPlacement=(entry.translation_mm||variant.head_translation_mm).map((v,j)=>v+(variant.mount==='stealthchanger'&&entry.role==='tool'?pose.delta[j]:0));assert.deepEqual(p,expectedPlacement);
   const snap=snapshot(),selected=snap.filter(p=>keys.includes(p.id));assert.deepEqual(selected.map(p=>p.id).sort(),expected);
   assert.equal(selected.length,variant.cooling==='cpap'||variant.extruder==='orbiter2'?3:4);
   for(const part of selected){const s=initial.included.find(p=>p.id===part.id);assert.deepEqual(part.positions,s.positions);assert.deepEqual(part.index,s.sourceIndex);sourceMatrix(part,expectedPlacement)}
   const signature=selected.map(p=>({id:p.id,matrix:p.matrixCAD}));if(!first)first=signature;else if(pose===poses.at(-1))assert.deepEqual(signature,first);
   if(pose===poses[0]){const admitted=await planSurfaceSelection(snap,policy);assert.deepEqual(admitted.included.map(p=>p.id).sort(),expected);if(variant.id==='head__sc__standard_6__stealthburner__v6__cw2')reference=admitted}
  }
  for(const palette of palettes){
   for(const row of meshes)if(['base','accent'].includes(row.role))row.mesh.material.color.set(palette[row.role==='base'?0:1]);
   const selected=snapshot().filter(p=>keys.includes(p.id));assert.deepEqual(selected.map(p=>p.id).sort(),expected);
   for(const part of selected){const role=metadata.get(part.key).appearance_role;if(!['base','accent'].includes(role))continue;const wanted=new THREE.Color(palette[role==='base'?0:1]).convertLinearToSRGB().toArray();assert(part.rgb.every((c,j)=>Math.abs(c-wanted[j])<1e-12))}
  }
  rows.push({configuration:variant.id,included:expected,poseStates:poses.length,paletteStates:palettes.length});
 }
 assert(reference);const surface=await writeSurfaceStep(reference.included);assert.equal(surface.parts,4);
 const changed=snapshot(),body=changed.find(p=>p.id==='sb_v6_front_10');assert(body);body.index[0]=(body.index[0]+1)%(body.positions.length/3);
 const rejected=await planSurfaceSelection(changed,policy);assert(rejected.omitted.some(p=>p.id===body.id&&p.reason==='source-geometry-changed'));
 for(const row of meshes){row.mesh.geometry.dispose();row.mesh.material.dispose()}
 for(const row of canonicalMeshes){row.mesh.geometry.dispose();for(const m of [].concat(row.mesh.material))m.dispose()}
 return {passed:true,inputs:{[file]:hash(raw),[spec.meta]:hash(await fs.readFile(path.join(root,spec.meta))),[canonicalFile]:hash(canonicalRaw),[canonicalSpec.meta]:hash(await fs.readFile(path.join(root,canonicalSpec.meta)))},sourceAliases:keys,transformRejects,configurations:rows,triangles:surface.triangles,stepBytes:surface.blob.size,newNativeSolids:0,scope:'Actual V6 front subset only, four exact source leaves; canonical full-matrix placement, all production placements/visibility, sampled separation/probe and reversed palettes. No new head/machine installation, native repair, full companion clearance or continuous-motion qualification.'};
}
