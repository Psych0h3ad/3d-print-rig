// Controller/delivery fixtures only. No model files, native or clearance jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
const root=new URL('../',import.meta.url),viewer=new URL('site/viewer/',root);
registerHooks({resolve(s,c,next){return s==='three'?{url:new URL('vendor-r180/three.module.js',viewer).href,shortCircuit:true}:next(s,c)}});
const load=path=>import(new URL(path,viewer).href);
const T=await load('vendor-r180/three.module.js');
const {loadSourceAssembly,sourceHeadPlan}=await load('source-assembly-loader.mjs');
const {loadProgressiveSource,createProgressiveUploader}=await load('source-assembly-runtime/progressive-source-loader.mjs');
const {releaseRoot}=await load('source-assembly-runtime/resources.mjs');
const {initialState}=await load('source-assembly-runtime/state.mjs');
const {migrateCompatibleState}=await load('source-assembly-runtime/state_compatibility.mjs');
const {restoreCurrentAssemblyState}=await load('source-assembly-runtime/restore_current_state.mjs');
const {loadLayoutRecipe}=await load('layout-machine-providers.mjs');
const {sourceAssemblyMachines}=await load('source-assembly-registry.mjs');
const {layoutMachineRecipes}=await load('layout-machine-recipes.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),encode=x=>new TextEncoder().encode(JSON.stringify(x));
const I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1],keys=Array.from({length:6},(_,i)=>'latch-'+i);
const model='a'.repeat(64),inventory='b'.repeat(64);
const profile={schema:'e3ng-illustrative-loaded-latch-v1',model_sha256:model,base_preserved:true,topology_preserved:true,physical_simulation:false,hinge_and_screw_transforms_unchanged:true,owner_keys:keys,notice:'Synthetic fitted display'};
// 108 bytes: one tiny triangle's position/normal/morph attributes, reused by
// six illustrative owners plus one ordinary rigid owner. Not a printer model.
const data=new Uint8Array(new Float32Array([0,0,0,1,0,0,0,1,0,0,0,1,0,0,1,0,0,1,0,0,.1,0,0,.1,0,0,.1]).buffer);
const allKeys=[...keys,'hardware'],chunk={ordinal:0,start:0,bytes:data.length,sha256:sha(data),url:'https://fixture.invalid/chunk.bin'};
const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:allKeys.map((_,i)=>i)}],buffers:[{byteLength:data.length}],
 bufferViews:[0,1,2].map(i=>({buffer:0,byteOffset:i*36,byteLength:36})),
 accessors:[0,1,2].map(i=>({bufferView:i,componentType:5126,count:3,type:'VEC3',...(i===0?{min:[0,0,0],max:[1,1,0]}:{})})),
 materials:[{pbrMetallicRoughness:{baseColorFactor:[.125,.25,.375,1],metallicFactor:.3,roughnessFactor:.6}}],
 meshes:[{weights:[1],primitives:[{attributes:{POSITION:0,NORMAL:1},targets:[{POSITION:2}],material:0}]},{primitives:[{attributes:{POSITION:0,NORMAL:1},material:0}]}],
 nodes:allKeys.map((key,i)=>({name:key,mesh:i<6?0:1,extras:{part_key:key,source_identity:'fixture-'+key}}))};
const manifest={schema:'priority-exact-source-chunks-134-v1',model_sha256:model,model_bytes:108,source_inventory_sha256:inventory,occurrences:7,chunks:[chunk],largest_chunk_bytes:108,source_faces_deleted:0,normal_averaging:false,geometry_bytes:108,document,buffer_view_chunks:[0,1,2].map(i=>({chunk:0,offset:i*36}))};
const manifestBytes=encode(manifest);
const packet={id:'runtime-review-fixture',machine:'e3ng',model:{sha256:model,bytes:108},inventory:{sha256:inventory},
 chunk_delivery:{manifest:{url:'https://fixture.invalid/manifest.json',bytes:manifestBytes.length,sha256:sha(manifestBytes)},chunk_count:1,largest_chunk_bytes:108},
 loading_budget:{model_sha256:model,bytes:108,single_load_peak_bytes:1024*1024,transfer_peak_bytes:108},
 parts:allKeys.map((key,i)=>({key,node_name:key,source_identity:'fixture-'+key,actual_export:{node:i},matrix:I,kind:i<6?'printed':'purchased',material_role:i<6?'M':'native',motion_axes:[]})),
 variants:[{id:'native',visible_keys:allKeys}],default_variant:'native',axes:{},basis:[[1,0,0],[0,1,0],[0,0,1]],unit_scale:.001,routes:[],visibility_groups:[],public_head_keys:['hardware'],illustrative_latch_display:profile};
const packetBytes=encode(packet),packetRecord={id:'rh3d_e3ng_v12_235',assembly_id:packet.id,model_sha256:model,configuration:'native',packet:{url:'https://fixture.invalid/packet.json',bytes:packetBytes.length,sha256:sha(packetBytes)}};
const files=new Map([[packet.chunk_delivery.manifest.url,manifestBytes],[chunk.url,data],[packetRecord.packet.url,packetBytes]]);
let requests=[];
globalThis.fetch=async url=>{const key=String(url);requests.push(key);if(key.endsWith('/SOURCE_ASSEMBLIES.json'))return new Response(encode({schema:'public-source-assembly-index-v1',models:sourceAssemblyMachines.map(row=>row.id===packetRecord.id?packetRecord:{id:row.id})}));assert(files.has(key),'Unexpected fetch blocked: '+key);return new Response(files.get(key))};
const fetchAsset=async url=>{assert(files.has(String(url)));return files.get(String(url)).slice().buffer};
const checks=[];
const check=(name,detail={})=>checks.push({name,status:'PASS',...detail});

// Exercise the real renderer-less Layout caller with tiny pinned source bytes.
const layout=await loadLayoutRecipe({machine_id:packetRecord.id,category:'source'},{signal:new AbortController().signal,onProgress:()=>{}});
assert.equal(layout.root.userData.progressiveSource.cpu_retention,'until-dispose','Headless load must use progressive CPU retention');
assert.equal(layout.root.userData.progressiveSource.upload_performed,false);
assert.equal(layout.root.userData.progressiveSource.source_arrays_released,0);
assert(layout.root.userData.progressiveSource.cpu_retained_bytes>0);
assert(layout.root.userData.progressiveSource.peak_accounted_bytes<=packet.loading_budget.single_load_peak_bytes);
const geometries=new Set(),materials=new Set();let sourceMeshes=0;
layout.root.traverse(node=>{if(!node.isMesh)return;sourceMeshes++;geometries.add(node.geometry);materials.add(node.material);
 assert(node.geometry.attributes.position.array instanceof Float32Array);
 const cloned=node.geometry.clone();assert.deepEqual(cloned.attributes.position.array,node.geometry.attributes.position.array);cloned.dispose();
 for(const attribute of Object.values(node.geometry.attributes)){attribute.onUploadCallback();assert(attribute.array,'Headless source arrays must survive future renderer uploads');}
 if(node.morphTargetInfluences?.length)assert.equal(node.morphTargetInfluences[0],1);
});
assert.equal(sourceMeshes,7);let disposedGeometries=0,disposedMaterials=0;
for(const g of geometries)g.addEventListener('dispose',()=>disposedGeometries++);
for(const m of materials)m.addEventListener('dispose',()=>disposedMaterials++);
layout.dispose();assert.equal(disposedGeometries,geometries.size);assert.equal(disposedMaterials,materials.size);assert.equal(layout.root.children.length,0);
const cpu=await loadSourceAssembly(packet,{fetchAsset});
assert.equal(cpu.snapshot().source_material_display,'source');assert.equal(cpu.snapshot().illustrative_latch_display.weight,1);
const cpuSaved=cpu.snapshot();cpu.apply({...cpuSaved,source_material_display:'palette',illustrative_latch_display:{model_sha256:model,weight:0}});
assert.equal(cpu.snapshot().source_material_display,'palette');assert.equal(cpu.snapshot().illustrative_latch_display.weight,0);
cpu.reset();assert.equal(cpu.snapshot().source_material_display,'source');assert.equal(cpu.snapshot().illustrative_latch_display.weight,1);releaseRoot(cpu.root,cpu);
check('actual Layout CPU-retaining load, future upload/clone support, disposal and both full-view adapters',{synthetic_payload_bytes:data.length});
const multiManifest=structuredClone(manifest),multiPacket=structuredClone(packet),multiBodies=new Map();
multiManifest.chunks=[data.slice(0,72),data.slice(72)].map((bytes,ordinal)=>{
 const url='https://fixture.invalid/multi-'+ordinal+'.bin';multiBodies.set(url,bytes);
 return {ordinal,start:ordinal?72:0,bytes:bytes.length,sha256:sha(bytes),url};
});
multiManifest.largest_chunk_bytes=72;multiManifest.buffer_view_chunks=[{chunk:0,offset:0},{chunk:0,offset:36},{chunk:1,offset:0}];
const multiBytes=encode(multiManifest),multiURL='https://fixture.invalid/multi-manifest.json';multiBodies.set(multiURL,multiBytes);
multiPacket.chunk_delivery={manifest:{url:multiURL,bytes:multiBytes.length,sha256:sha(multiBytes)},chunk_count:2,largest_chunk_bytes:72};
const multiFetch=async url=>{assert(multiBodies.has(url));return multiBodies.get(url).slice().buffer};
const streamed=await loadSourceAssembly(multiPacket,{fetchAsset:multiFetch});
assert.equal(streamed.root.userData.progressiveSource.chunks,2);assert.equal(streamed.root.userData.progressiveSource.upload_performed,false);
streamed.root.traverse(n=>{if(n.isMesh){assert(n.geometry.attributes.position.array);for(const attrs of Object.values(n.geometry.morphAttributes))for(const a of attrs)assert(a.array);}});
releaseRoot(streamed.root,streamed);
await assert.rejects(loadProgressiveSource(packet,{retainCPU:true,displayProfile:profile,fetchAsset,maxAccountedBytes:1}),/allocation exceeds budget/);
await assert.rejects(loadProgressiveSource(packet,{retainCPU:true,upload:()=>{},displayProfile:profile,fetchAsset}),/real uploader or explicit CPU retention/);
check('two-chunk CPU streaming, retained morph/position arrays, hard budget and no fake-uploader admission');
// Fake only GPU upload. Exercise actual production loader, assembly and wrappers.
let renderTarget={original:true},uploads=0;
const renderer={getRenderTarget:()=>renderTarget,setRenderTarget:x=>{renderTarget=x},render(scene){uploads++;scene.traverse(n=>{if(!n.isMesh)return;for(const a of [...Object.values(n.geometry.attributes),...Object.values(n.geometry.morphAttributes).flat(),...(n.geometry.index?[n.geometry.index]:[])])if(a.array)a.onUploadCallback()})}};
const originalTarget=renderTarget,progress=[];
let assembly=await loadSourceAssembly(packet,{renderer,fetchAsset,onProgress:p=>progress.push(p)});
assert.equal(renderTarget,originalTarget);assert.equal(uploads,1);assert.equal(progress.at(-1).phase,'ready');
assert.equal(assembly.root.userData.progressiveSource.source_arrays_released,2);
assert.equal(assembly.parts.get('hardware').node.geometry.attributes.position.array,null);
for(const key of keys)assert(assembly.parts.get(key).node.geometry.morphAttributes.position[0].array);
check('progressive retained morph/released rigid attribute lifecycle; restored render target',{uploads,synthetic_payload_bytes:data.length});
for(const r of assembly.materials)assert.deepEqual(r.material.color.toArray(),r.color.toArray());
const saved=assembly.snapshot();assert.equal(saved.source_material_display,'source');
assert.equal(saved.illustrative_latch_display.weight,1);
const hardware=assembly.materials.find(r=>r.role==='native'),hardwareBefore=hardware.material.color.toArray();
assembly.apply({...saved,source_material_display:'palette',palette:{M:'#ff0000',A:'#00ff00'},illustrative_latch_display:{model_sha256:model,weight:0}});
assert.deepEqual(hardware.material.color.toArray(),hardwareBefore);
for(const key of keys)assert.equal(assembly.parts.get(key).node.morphTargetInfluences[0],0);
restoreCurrentAssemblyState(assembly,JSON.parse(JSON.stringify(saved)));
for(const r of assembly.materials)assert.deepEqual(r.material.color.toArray(),r.color.toArray());
for(const bad of [{model_sha256:model,weight:2},{model_sha256:'c'.repeat(64),weight:1}]){
 const before=assembly.snapshot(),colors=assembly.materials.map(r=>r.material.color.toArray());
 assert.throws(()=>assembly.apply({...before,illustrative_latch_display:bad}));
 assert.deepEqual(assembly.snapshot(),before);assert.deepEqual(assembly.materials.map(r=>r.material.color.toArray()),colors);
}
assembly.reset();assert.equal(assembly.snapshot().source_material_display,'source');assert.equal(assembly.snapshot().illustrative_latch_display.weight,1);
check('actual wrapper composition: source first load, palette edit, hardware preservation, saved restore, reset and invalid latch rejection');
releaseRoot(assembly.root,assembly);

const headPlan=await sourceHeadPlan(packet),head=await loadSourceAssembly(packet,{mode:'head',headPlan,fetchAsset});
assert.equal(head.snapshot().source_material_display,'source');assert.equal(head.packet.illustrative_latch_display,undefined);assert.equal(head.snapshot().illustrative_latch_display,undefined);releaseRoot(head.root,head);
check('head path needs no renderer; full-only latch profile removed and material wrapper retained');

// Cancellation and upload exceptions never produce a usable partial result.
const controller=new AbortController();controller.abort();let calls=0;
await assert.rejects(loadProgressiveSource(packet,{signal:controller.signal,upload:()=>{},fetchAsset:async()=>{calls++;throw Error('unexpected')}}),e=>e.name==='AbortError');assert.equal(calls,0);
await assert.rejects(loadProgressiveSource(packet,{displayProfile:profile,fetchAsset,upload:()=>{throw Error('upload failed')}}),/upload failed/);
const uploader=createProgressiveUploader({getRenderTarget:()=>originalTarget,setRenderTarget:x=>{renderTarget=x},render(){throw Error('GPU failure')}}),empty=new T.Group();
assert.throws(()=>uploader.upload(empty),/GPU failure/);assert.equal(empty.parent,null);assert.equal(renderTarget,originalTarget);uploader.dispose();
check('pre-cancel avoids fetch; failed upload restores render target and detaches temporary scene');

console.log(JSON.stringify({passed:true,checks,geometry_scope:'108-byte synthetic payload only; no printer geometry, native or browser work.'}));
