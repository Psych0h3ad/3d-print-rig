// node --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_trident_sizes.mjs OVERLAY GEOMETRY250 GEOMETRY300 BASE_ASSETS
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {machineHeadVariants,expandedPrinterCatalog} from '../site/viewer/machine-head-model.mjs';
import {bankBedReferenceDrop,initialBank,normalizeBank,bankPlan} from '../site/viewer/changer-bank-model.mjs';
import {checkRoute,checkNoCrossing,checkGeometry} from './test_v0_belts.mjs';
const roots=process.argv.slice(2).map(p=>path.resolve(p));
async function bytes(file){for(const r of roots)try{return await fs.readFile(path.join(r,file))}catch(e){if(e.code!=='ENOENT')throw e}throw Error('Missing '+file)}
const read=async file=>JSON.parse(await bytes(file));
async function glb(file){let b;try{b=await bytes(file)}catch{b=gunzipSync(await bytes(file+'.gz'))}return (await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene}
const heads=await read('TOOLHEAD_CONFIGURATIONS.json'),registry=await read('MACHINE_HEAD_REGISTRATIONS.json'),bank=await read('TOOLCHANGER_BANK.json'),reports=[];
for(const size of [250,300,350]){
 const machine=`voron_trident_${size}`,dir=`machines/${machine}`,profile=await read(`${dir}/machine_profile.json`),manifest=await read(`${dir}/assembly_manifest.json`),gantry=await read(`modules/trident_r2_gantry_${size}.json`);
 assert.equal(profile.size_mm,size);assert.deepEqual(profile.display_limits_mm.X,[0,size]);assert.deepEqual(profile.display_limits_mm.Y,[0,size]);
 const frame=manifest.parts.filter(p=>p.appearance_role==='frame'&&p.motion==='fixed');
 for(const i of [0,1])assert(Math.abs(Math.max(...frame.map(p=>p.bounds_mm[1][i]))-Math.min(...frame.map(p=>p.bounds_mm[0][i]))-(size+160))<.001);
 const magnet=manifest.parts.find(p=>p.name==='Magnet Sheet');assert(Math.abs(magnet.bounds_mm[1][0]-magnet.bounds_mm[0][0]-(size+4))<.001);
 const motion=createTridentMotion(profile);let meshes=0;
 for(const [meta,file] of [[manifest,profile.base_assets.glb],[gantry,gantry.glb]]){
  const scene=await glb(file),seen=new Set();
  scene.traverse(o=>{if(!o.isMesh)return;const key=o.userData.part_key||o.name;assert(meta.parts.some(p=>p.key===key));seen.add(key);assert([...o.geometry.attributes.position.array].every(Number.isFinite));meshes++});
  assert.equal(seen.size,meta.parts.length);motion.register(scene,meta);
 }
 let routes=0;const lengths=[];
 for(let y=0;y<=size;y+=.5){
  const pose=motion.setPose({x:y,y,z:y/size*250});
  for(const {row,origin} of motion.entries.values())assert(['fixed','xy','y','z','reference_flexible'].includes(row.motion));
  for(const b of motion.belts)for(const e of b.entries){
   checkRoute(e.route);routes++;
   if(y===0)lengths.push(e.route.length);
   assert(Math.abs(e.route.length-lengths[b.entries.indexOf(e)])<1e-6);
   if(y%50===0){checkNoCrossing(e.route.points);checkGeometry(e.mesh.geometry)}
  }
  for(const [mesh,{row,origin}] of motion.entries){
   const p=mesh.position;
   if(row.motion==='z')assert(Math.abs(p.y-origin.y+pose.bed_down_mm/1000)<1e-10);
   if(row.motion==='fixed')assert(p.equals(origin));
  }
 }
 const raw=await read(`${dir}/configurations.json`),catalog=expandedPrinterCatalog(raw,heads,registry,machine),variants=machineHeadVariants(heads,registry,machine);
 assert(variants.length>100);for(const v of catalog.variants)for(const m of v.modules)if(/^trident_r2_gantry_/.test(m.id))assert.equal(m.id,gantry.id);
 const state=initialBank(catalog,bank,'trident_r2');assert(state.tools.length>0);normalizeBank(state,catalog,bank,'trident_r2');assert.throws(()=>normalizeBank({...state,enabled:true},catalog,bank,'trident_r2'));
 const standard=catalog.variants.find(v=>v.id===profile.default_configuration),drop=bankBedReferenceDrop(catalog,bank,state,standard);
 assert(Math.abs(catalog.bed_reference_top_mm-drop-standard.fit.nozzle_mm[2])<.001);
 motion.setBedReferenceDrop(drop);motion.setPose({x:0,y:0,z:0});
 const indx=catalog.variants.find(v=>v.toolhead==='indx'),indxState=initialBank(catalog,bank,'trident_r2','indx');indxState.enabled=true;
 const plan=bankPlan(indxState,catalog,bank,catalog.variants.find(v=>v.toolhead==='indx'&&v.hotend===indxState.tools[0]));assert(plan.instances.some(p=>p.id===`indx_crossbar_${size}`));
 reports.push({size,base_parts:manifest.parts.length,gantry_parts:gantry.parts.length,meshes,routes,registered_head_variants:variants.length,stock_nozzle_gap_mm:catalog.bed_reference_top_mm-drop-standard.fit.nozzle_mm[2]});
}
console.log(JSON.stringify({passed:true,reports},null,2));
