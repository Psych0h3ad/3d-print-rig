import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import zlib from 'node:zlib';
import {fixture,fingerprint,GLTFLoader} from './test_shared_component_glb.mjs';
import {prepareChunkAssembly,scatterComponentChunk,finishChunkAssembly} from '../site/viewer/chunked-component-glb.mjs';
import {sharedGlbDocument,parseSharedComponentGlb} from '../site/viewer/shared-component-glb.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const dirArg=process.argv.indexOf('--chunks');
if(dirArg>=0){
 const dir=process.argv[dirArg+1],manifest=JSON.parse(fs.readFileSync(path.join(dir,'manifest.json')));
 const checked=r=>{const file=fs.readFileSync(path.join(dir,r.path));assert.equal(file.length,r.bytes);assert.equal(sha(file),r.sha256);const decoded=r.encoding==='gzip'?zlib.gunzipSync(file):file;if(r.encoding==='gzip'){assert.equal(decoded.length,r.decoded_bytes);assert.equal(sha(decoded),r.decoded_sha256)}return new Uint8Array(decoded.buffer,decoded.byteOffset,decoded.byteLength)};
 const state=prepareChunkAssembly(manifest,checked(manifest.reassembly_prefix)),samples=[];
 for(const record of manifest.chunks){const bytes=checked(record.file);scatterComponentChunk(state,record,bytes);samples.push(process.memoryUsage())}
 const bytes=finishChunkAssembly(state);assert.equal(sha(bytes),manifest.verified_lossless_derivative.decoded_sha256);assert.deepEqual(state.doc.json,JSON.parse(new TextDecoder().decode(checked(manifest.assembly))));
 const gltf=await parseSharedComponentGlb(new GLTFLoader(),bytes,''),rows=fingerprint(gltf),buffers=new Set();gltf.scene.traverse(n=>{if(!n.isMesh)return;for(const a of [...Object.values(n.geometry.attributes),n.geometry.index].filter(Boolean))buffers.add(a.array.buffer)});assert.deepEqual([...buffers],[bytes.buffer]);
 const parts=JSON.parse(new TextDecoder().decode(checked(manifest.parts)));assert.equal(parts.parts.length,205);assert.equal(parts.decoded_model_sha256,manifest.source.decoded_sha256);assert.equal(rows.length,206);assert.equal(rows.reduce((s,r)=>s+r.triangles,0),4976842);
 const report={passed:true,source_sha256:manifest.source.decoded_sha256,render_sha256:sha(bytes),chunks:manifest.chunk_count,max_decoded_chunk_bytes:Math.max(...manifest.chunks.map(r=>r.file.decoded_bytes)),array_buffers:buffers.size,render_meshes:rows.length,triangles:4976842,accessor_ranges_complete:true,rows,memory_samples:samples,scope:'Actual checked lossless delivery, parsed scene and shared CPU arrays. Browser/iPhone and native fit are separate.'};
 const outArg=process.argv.indexOf('--report');if(outArg>=0)fs.writeFileSync(process.argv[outArg+1],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({...report,rows:undefined,memory_samples:undefined}));
}else{
 const source=fixture(),doc=sharedGlbDocument(source),target=new Uint8Array(source.length);target.set(source.subarray(0,doc.binOffset));const state={bytes:target,doc:sharedGlbDocument(target),counts:[0,0],next:0};
 const packets=doc.accessors.map((a,i)=>({destination_accessor:i,first_element:0,count:3,chunk_accessor:i,source_binary_byte_offset:a.start,bytes:36})),record={ordinal:0,file:{decoded_bytes:source.length},packets};
 assert.throws(()=>scatterComponentChunk(state,{...record,ordinal:1},source));assert.throws(()=>scatterComponentChunk(state,{...record,file:{decoded_bytes:33554433}},source));
 scatterComponentChunk(state,record,source);assert.deepEqual(target,source);assert.throws(()=>scatterComponentChunk(state,{...record,ordinal:1},source),'duplicate range accepted');assert.throws(()=>finishChunkAssembly(state),'partial assembly accepted');assert.throws(()=>prepareChunkAssembly({schema:'unknown'},source));
 const altered={bytes:target,doc:sharedGlbDocument(target),counts:[0,0],next:0};assert.throws(()=>scatterComponentChunk(altered,{...record,packets:[{...packets[0],first_element:1}]},source));
 console.log(JSON.stringify({passed:true,scatter_bytes_exact:true,reordered_duplicate_incomplete_mismatched_delivery_rejected:true}));
}
