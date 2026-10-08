import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fixture,fingerprint,GLTFLoader} from './test_shared_component_glb.mjs';
import {prepareChunkAssembly,scatterComponentChunk,finishChunkAssembly} from '../site/viewer/chunked-component-glb.mjs';
import {sharedGlbDocument,parseSharedComponentGlb} from '../site/viewer/shared-component-glb.mjs';
import {trinityAlphaVariants,TRINITY_ALPHA_SOURCE,TRINITY_INSTALLED_BELT_SAMPLE_KEYS} from '../site/viewer/trinity-alpha-installation.mjs';
import {TRINITY_ALPHA_HOST_SOURCE} from '../site/viewer/trinity-alpha-host-extensions.mjs';
import {TRINITY_SIBOOR_SOURCE} from '../site/viewer/trinity-alpha-siboor-r2.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
function installedBeltSamples(gltf,parts,site){
 const pins=[TRINITY_ALPHA_SOURCE,TRINITY_ALPHA_HOST_SOURCE,TRINITY_SIBOOR_SOURCE];
 const catalogs=pins.map(p=>{const bytes=fs.readFileSync(path.join(site,p.file));assert.equal(sha(bytes),p.sha256);return JSON.parse(bytes)});
 const base=catalogs[0],hostRows=catalogs.flatMap(c=>c.rows),registry={trinity_alpha_92:{...base,rows:hostRows},machines:{}};
 assert.equal(hostRows.length,12);assert.equal(new Set(hostRows.map(r=>r.machine_id)).size,12);
 // This checks the exact current policy for each pinned host tuple. Admission,
 // machine controllers and native mounting remain separate release jobs.
 for(const r of hostRows)registry.machines[r.machine_id]={gantries:{[r.gantry_id]:{part_key:r.stock_block_key,belt_width_mm:r.belt_width_mm,xy_motors:r.xy_motors||2}}};
 const expected={v13_29:'7fddc2c0ff68826acccd8031a464735ad8b6395c66b60c9385853b6bec9d13e5',v13_71:'87fb4c31585a397fab7b19d9aeea8e39ff5afb10675246fa9b48d23b8ff04aac',v13_72:'81e2ca7f64a3ea50f5e9dd987a47c3408065c8ea7893e21c4787982b599d4d34',v13_73:'a20e1b50e1011e3c57f21990e0327f8317660f8925ff3363c729ea33f0db571a'};
 assert.deepEqual(TRINITY_INSTALLED_BELT_SAMPLE_KEYS,Object.keys(expected));
 for(const [key,hash]of Object.entries(expected)){const p=parts.parts.find(p=>p.key===key);assert.equal(p?.source_brep_sha256,hash);assert.equal(p.name,'Part1_Trinity toolhead_6mm')}
 const meshes=[];gltf.scene.traverse(n=>{if(n.isMesh)meshes.push(n)});assert.equal(meshes.length,206);
 const original=new Map(meshes.map(n=>[n,{geometry:n.geometry,material:n.material,position:n.position.clone()}]));
 const observations=[];
 for(const row of hostRows){
  const [v]=trinityAlphaVariants({variants:[{id:base.source_head_id}]},registry,row.machine_id,row.gantry_id);assert(v);
  assert.deepEqual(v.machine_head.hidden,['actual_retained_Trident_block',...Object.keys(expected)]);assert.deepEqual(v.machine_head.stock_hidden_keys,[]);
  const hidden=new Set(v.machine_head.hidden),poses=[row.reference_xyz_mm,Object.values(row.limits_mm).map(r=>(r[0]+r[1])/2)];
  for(let mask=0;mask<8;mask++)poses.push(['X','Y','Z'].map((a,i)=>row.limits_mm[a][(mask>>i)&1]));
  poses.push(...poses.slice().reverse());
  for(const xyz of poses){
   // The installation changes scene visibility only; rigid native geometry,
   // materials, clamps and transforms must not be edited to hide fragments.
   gltf.scene.position.set(...xyz.map((n,i)=>n-row.reference_xyz_mm[i]));
   for(const n of meshes)n.visible=!hidden.has(String(n.userData.part_key));
   gltf.scene.updateMatrixWorld(true);
   assert.equal(meshes.filter(n=>n.visible).length,201);
   for(const n of meshes){assert.equal(n.geometry,original.get(n).geometry);assert.equal(n.material,original.get(n).material);assert(n.position.equals(original.get(n).position));assert(n.matrixWorld.elements.every(Number.isFinite));}
   for(const key of ['v13_28','v13_69'])assert(meshes.some(n=>n.userData.part_key===key&&n.visible),'Actual belt clamp disappeared');
  }
  observations.push({machine:row.machine_id,gantry:row.gantry_id,poses:poses.length,hidden_source_samples:Object.keys(expected),visible_render_meshes:201});
 }
 // The same cached native asset must restore all 206 meshes for standalone CAD.
 gltf.scene.position.set(0,0,0);for(const n of meshes)n.visible=true;gltf.scene.updateMatrixWorld(true);
 assert.equal(meshes.filter(n=>n.visible).length,206);
 return {passed:true,hosts:12,rows:observations,sample_native_sha256:expected,clamps_preserved:true,standalone_restored:true,original_geometry_and_materials_unchanged:true,scope:'Actual parsed Trinity parts and installed visibility policy at sampled translations. Host belt routing, native mating and continuous clearance are separate.'};
}
const dirArg=process.argv.indexOf('--chunks');
if(dirArg>=0){
 const dir=process.argv[dirArg+1],manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 const checked=r=>{const file=fs.readFileSync(path.join(dir,r.path));assert.equal(file.length,r.bytes);assert.equal(sha(file),r.sha256);const decoded=r.encoding==='gzip'?zlib.gunzipSync(file):file;if(r.encoding==='gzip'){assert.equal(decoded.length,r.decoded_bytes);assert.equal(sha(decoded),r.decoded_sha256)}return new Uint8Array(decoded.buffer,decoded.byteOffset,decoded.byteLength)};
 const state=prepareChunkAssembly(manifest,checked(manifest.reassembly_prefix)),samples=[];
 for(const record of manifest.chunks){const bytes=checked(record.file);scatterComponentChunk(state,record,bytes);samples.push(process.memoryUsage())}
 const bytes=finishChunkAssembly(state);assert.equal(sha(bytes),manifest.verified_lossless_derivative.decoded_sha256);assert.deepEqual(state.doc.json,JSON.parse(new TextDecoder().decode(checked(manifest.assembly))));
 const gltf=await parseSharedComponentGlb(new GLTFLoader(),bytes,''),rows=fingerprint(gltf),buffers=new Set();gltf.scene.traverse(n=>{if(!n.isMesh)return;for(const a of [...Object.values(n.geometry.attributes),n.geometry.index].filter(Boolean))buffers.add(a.array.buffer)});assert.deepEqual([...buffers],[bytes.buffer]);
 const parts=JSON.parse(new TextDecoder().decode(checked(manifest.parts)));assert.equal(parts.parts.length,205);assert.equal(parts.decoded_model_sha256,manifest.source.decoded_sha256);assert.equal(rows.length,206);assert.equal(rows.reduce((s,r)=>s+r.triangles,0),4976842);
 const siteArg=process.argv.indexOf('--site');assert(siteArg>=0,'Current all-host sidecars required');const installed_belt_samples=installedBeltSamples(gltf,parts,process.argv[siteArg+1]);
 const report={passed:true,source_sha256:manifest.source.decoded_sha256,render_sha256:sha(bytes),chunks:manifest.chunk_count,max_decoded_chunk_bytes:Math.max(...manifest.chunks.map(r=>r.file.decoded_bytes)),array_buffers:buffers.size,render_meshes:rows.length,triangles:4976842,accessor_ranges_complete:true,rows,memory_samples:samples,scope:'Actual checked lossless delivery, parsed scene and shared CPU arrays. Browser/iPhone and native fit are separate.'};
 report.installed_belt_samples=installed_belt_samples;
 const outArg=process.argv.indexOf('--report');if(outArg>=0)fs.writeFileSync(process.argv[outArg+1],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined,memory_samples:undefined}));
}else{
 const source=fixture(),doc=sharedGlbDocument(source),target=new Uint8Array(source.length);target.set(source.subarray(0,doc.binOffset));const state={bytes:target,doc:sharedGlbDocument(target),counts:[0,0],next:0};
 const packets=doc.accessors.map((a,i)=>({destination_accessor:i,first_element:0,count:3,chunk_accessor:i,source_binary_byte_offset:a.start,bytes:36})),record={ordinal:0,file:{decoded_bytes:source.length},packets};
 assert.throws(()=>scatterComponentChunk(state,{...record,ordinal:1},source));assert.throws(()=>scatterComponentChunk(state,{...record,file:{decoded_bytes:33554433}},source));
 scatterComponentChunk(state,record,source);assert.deepEqual(target,source);assert.throws(()=>scatterComponentChunk(state,{...record,ordinal:1},source),'duplicate range accepted');assert.throws(()=>finishChunkAssembly(state),'partial assembly accepted');assert.throws(()=>prepareChunkAssembly({schema:'unknown'},source));
 const altered={bytes:target,doc:sharedGlbDocument(target),counts:[0,0],next:0};assert.throws(()=>scatterComponentChunk(altered,{...record,packets:[{...packets[0],first_element:1}]},source));
 console.log(JSON.stringify({passed:true,scatter_bytes_exact:true,reordered_duplicate_incomplete_mismatched_delivery_rejected:true}));
}
