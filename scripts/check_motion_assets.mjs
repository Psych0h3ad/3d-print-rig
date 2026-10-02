// Run against the assembled release, not just synthetic objects:
// node --experimental-loader ./scripts/three-test-loader.mjs scripts/check_motion_assets.mjs <site-root> [report.json]
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import zlib from 'node:zlib';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {Vector3} from '../site/viewer/vendor/three.module.js';
import {createV0Adapter} from '../site/viewer/v0_adapter.mjs';
import {createV24Adapter as createSiboor} from '../site/viewer/v24_adapter.mjs';
import {createV24Adapter as createVoron} from '../site/viewer/v24_matrix_adapter.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {checkRoute,checkGeometry,checkNoCrossing} from './test_v0_belts.mjs';
const root=process.argv[2];if(!root)throw Error('Pass assembled site directory');
const read=file=>JSON.parse(fs.readFileSync(file));
const near=(a,b,t=1e-8)=>assert(Math.abs(a-b)<t,`${a} != ${b}`);
const load=async file=>{
 const bytes=fs.existsSync(file)?fs.readFileSync(file):zlib.gunzipSync(fs.readFileSync(file+'.gz'));
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
};
const report={machines:[],findings:[],scope:'Viewer geometry and rigid motion; not collision, tension or firmware certification.'};
const ids=fs.readdirSync(path.join(root,'machines')).filter(id=>/^voron_v0|^voron_v24_|^siboor_v24_/.test(id));
for(const id of ids){
 const base=path.join(root,'machines',id),manifest=read(path.join(base,'assembly_manifest.json')),profile=read(path.join(base,'machine_profile.json'));
 const scene=await load(path.join(base,'model.glb')),v0=id.startsWith('voron_v0');
 const adapter=(v0?createV0Adapter:id.startsWith('siboor')?createSiboor:createVoron)(scene,manifest,profile);
 const reference=Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]]));
 adapter.setPose(reference);scene.updateMatrixWorld(true);
 const origins=new Map([...adapter.nodes].map(([key,node])=>[key,node.getWorldPosition(new Vector3()).toArray()]));
 const lengths=v0?adapter.belts.entries.map(b=>b.route.length):[];
 const values=['X','Y','Z'].map((a,i)=>[profile.display_limits_mm[a][0],profile.display_limits_mm[a][1]/4,profile.display_limits_mm[a][1]/2,profile.display_limits_mm[a][1]*.75,profile.display_limits_mm[a][1],profile.display_reference_xyz_mm[i]]);
 let poses=0,maxLengthDrift=0;
 for(const x of values[0])for(const y of values[1])for(const z of values[2]){
  const result=adapter.setPose({x,y,z}),delta=[x-reference.x,y-reference.y,z-reference.z];scene.updateMatrixWorld(true);
  for(const [key,node]of adapter.nodes){
   const row=adapter.records.get(key);if(row.motion==='reference_flexible')continue;
   const origin=origins.get(key),position=node.getWorldPosition(new Vector3()).toArray();
   const t=['X','Y','Z'].map((a,i)=>row.motion_axes.includes(a)?delta[i]*(row.motion_signs?.[a]??1):0);
   [t[0]/1000,t[2]/1000,-t[1]/1000].forEach((v,i)=>near(position[i]-origin[i],v));
  }
  if(v0){
   for(const [i,b]of adapter.belts.entries.entries()){
    assert(b.node.visible);checkRoute(b.route);maxLengthDrift=Math.max(maxLengthDrift,Math.abs(b.route.length-lengths[i]));
    near(b.route.length,lengths[i]);
   }
   assert.equal(result.chain_visible,Math.abs(delta[2])<1e-5);
  }else{
   for(const [key,node]of adapter.nodes){
    const row=adapter.records.get(key);
    if(/^Z Belt(?: \(\d+\))?$/.test(row.name)){assert(node.visible);assert.deepEqual(node.getWorldPosition(new Vector3()).toArray(),origins.get(key))}
    if(/^[AB] Belt$/.test(row.name)){
     assert.equal(node.visible,Math.abs(delta[0])+Math.abs(delta[1])<1e-5);
     near(node.position.y-origins.get(key)[1],delta[2]/1000);
    }
   }
  }
  poses++;
 }
 if(v0){
  // Fine Y sweep catches between-grid route discontinuities; X/Z cannot stretch an XY belt.
  for(let y=0;y<=120;y+=.5){adapter.setPose({...reference,y});for(const b of adapter.belts.entries){checkRoute(b.route);checkGeometry(b.mesh.geometry)}}
  adapter.setPose(reference);const saved=adapter.belts.entries.map(b=>Array.from(b.mesh.geometry.attributes.position.array));
  adapter.setPose({x:0,y:0,z:120});adapter.setPose(reference);
  adapter.belts.entries.forEach((b,i)=>assert.deepEqual(Array.from(b.mesh.geometry.attributes.position.array),saved[i]));
 }
 adapter.setFlexibleVisible(false);adapter.setPose(reference);
 for(const [key,node]of adapter.nodes)if(adapter.records.get(key).motion==='reference_flexible')assert(!node.visible);
 adapter.setFlexibleVisible(true);adapter.setPose(reference);
 for(const [key,node]of adapter.nodes)if(adapter.records.get(key).motion==='reference_flexible')assert(node.visible);
 adapter.setEnclosureVisible(false);adapter.setPose(reference);
 for(const [key,node]of adapter.nodes){const r=adapter.records.get(key);if(id==='siboor_v24_350'?(r.panel_surface||profile.panel_surface_keys?.includes(key)):r.group===(v0?'V0_Enclosure':'V24_Enclosure'))assert(!node.visible)}
 const row={id,parts:manifest.parts.length,poses,max_belt_length_drift_mm:maxLengthDrift,fine_y_sweep:v0?241:0};report.machines.push(row);console.log(JSON.stringify(row));
 scene.traverse(m=>{if(m.isMesh)m.geometry.dispose()});
}
// Also audit the vanilla Trident's real base, R2 drive and Z-chain dependencies.
{
 const id='voron_trident_350',profile=read(path.join(root,'machines',id,'machine_profile.json'));
 const motion=createTridentMotion(profile),base=read(path.join(root,profile.base_assets.meta));
 const body=await load(path.join(root,profile.base_assets.glb));motion.register(body,base);
 const gantryMeta=read(path.join(root,'modules/trident_r2_gantry_350.json'));
 const gantry=await load(path.join(root,'modules/trident_r2_gantry_350.glb'));motion.register(gantry,gantryMeta);
 motion.setPose(Object.fromEntries(['x','y','z'].map((a,i)=>[a,profile.display_reference_xyz_mm[i]])));
 const beltEntries=motion.belts.flatMap(b=>b.entries),lengths=beltEntries.map(e=>e.route.length);
 assert.equal(beltEntries.length,2);let maxLengthDrift=0;
 let poses=0;for(const x of [0,175,350])for(const y of [0,175,350])for(const z of [0,125,250]){
  const pose=motion.setPose({x,y,z});
  for(const [mesh,{row,origin}]of motion.entries){
   near(mesh.position.x-origin.x,row.motion==='xy'?pose.dx/1000:0);
   near(mesh.position.y-origin.y,row.motion==='z'?-pose.bed_down_mm/1000:0);
   near(mesh.position.z-origin.z,['xy','y'].includes(row.motion)?-pose.dy/1000:0);
   if(row.motion==='reference_flexible'&&row.group==='Z Assembly')assert.equal(mesh.visible,z===0);
  }
  for(const [i,b]of beltEntries.entries()){
   assert(b.mesh.visible);checkRoute(b.route);checkNoCrossing(b.route.points);
   maxLengthDrift=Math.max(maxLengthDrift,Math.abs(b.route.length-lengths[i]));near(b.route.length,lengths[i],1e-6);
  }poses++;
 }
 for(let y=0;y<=350;y+=.5){
  motion.setPose({x:0,y,z:0},{toolheadReference:false});
  for(const [i,b]of beltEntries.entries()){checkRoute(b.route);checkGeometry(b.mesh.geometry);near(b.route.length,lengths[i],1e-6)}
  for(const [mesh,{row}]of motion.entries)if(row.motion==='reference_flexible'&&row.group==='Z Assembly')assert(mesh.visible);
 }
 motion.setPose({x:0,y:0,z:0});const saved=beltEntries.map(b=>Array.from(b.mesh.geometry.attributes.position.array));
 motion.setPose({x:350,y:350,z:250},{flexibleVisible:false});beltEntries.forEach(b=>assert(!b.mesh.visible));
 motion.setPose({x:0,y:0,z:0},{toolheadReference:false});beltEntries.forEach((b,i)=>{assert(b.mesh.visible);assert.deepEqual(Array.from(b.mesh.geometry.attributes.position.array),saved[i])});
 // Re-registering a cached module must not create duplicate dynamic geometry.
 motion.register(gantry,gantryMeta);assert.equal(motion.belts.length,1);
 const r2Refs=read(path.join(root,'R2_ENDSTOP_REGISTRATION.json'));
 for(const ref of Object.values(r2Refs.heads)){
  motion.setReference([ref.X.cad_reference_display_coordinate_mm,ref.Y.cad_reference_display_coordinate_mm,0]);
  for(const y of [0,350]){motion.setPose({x:0,y,z:0},{toolheadReference:false});beltEntries.forEach((b,i)=>near(b.route.length,lengths[i],1e-6))}
 }
 motion.setBedReferenceDrop(1.97);motion.setPose({x:0,y:0,z:0});
 for(const [mesh,{row}]of motion.entries)if(row.motion==='reference_flexible'&&row.group==='Z Assembly')assert(!mesh.visible);
 report.machines.push({id,parts:motion.entries.size,poses,fine_y_sweep:701,max_belt_length_drift_mm:maxLengthDrift,belt_routing:'registered smooth envelope; teeth/clamp cuts/tension not simulated',z_chain:'XY-independent, source Z pose only'});
}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2));
console.log(`Release motion audit finished: ${report.machines.length} machine configurations; ${report.findings.length} unresolved finding(s) recorded separately.`);
