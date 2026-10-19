import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {registerHooks} from 'node:module';
import {pathToFileURL} from 'node:url';
import {fetchPinned,createChunkProgress,sourceLoadingText,sourceProgressStatus,createLoadCoordinator} from '../site/viewer/source-assembly-runtime/loading.mjs';
import {createSourceUIText} from '../site/viewer/source-assembly-ui-text.mjs';
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true}:next(specifier,context);}});
// Resolve the same content-versioned central engine as the production formatter.
const loadingURL=new URL('../site/viewer/source-assembly-runtime/loading.mjs',import.meta.url),loadingSource=fs.readFileSync(loadingURL,'utf8');
const engineURL=new URL(loadingSource.match(/from '([^']+i18n\.mjs[^']*)'/u)[1],loadingURL);
const {loadLanguage}=await import(engineURL.href);
for(const language of ['es','ko','ru'])await loadLanguage(language);
const {loadSourceAssembly}=await import('../site/viewer/source-assembly-loader.mjs');
const {loadChunkedModel}=await import('../site/viewer/source-assembly-runtime/chunk_loader.mjs');
const {GLTFLoader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
const {headSubsetPlan}=await import('../site/viewer/source-assembly-runtime/head_subset.mjs');
const {releaseRoot}=await import('../site/viewer/source-assembly-runtime/resources.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),I=[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1];
const getFlag=name=>process.argv.includes(name)?process.argv[process.argv.indexOf(name)+1]:null;
const rows=[],record=(name,detail={})=>rows.push({name,passed:true,...detail});
const eventsMonotone=events=>{const values=events.filter(p=>p.percent!==null&&p.percent!==undefined).map(p=>p.percent);assert(values.every((p,i)=>Number.isFinite(p)&&p>=0&&p<=100&&(!i||p>=values[i-1])));return values.length;};
const oldFetch=globalThis.fetch,oldDecoder=globalThis.DecompressionStream;
const chunks=[],raws=[],files=new Map(),bufferViews=[],accessors=[];
for(let i=0;i<4;i++){
 const a=new Float32Array(i%2?[0,0,1,0,0,1,0,0,1]:[0,0,0,1,0,0,0,1,0]),raw=new Uint8Array(a.buffer),encoded=gzipSync(raw);
 raws.push(raw);const c={ordinal:i,start:i*36,bytes:36,sha256:sha(raw),url:'https://fixtures.invalid/raw/'+i,gzip:{url:'https://fixtures.invalid/gzip/'+i,bytes:encoded.length,sha256:sha(encoded)}};
 chunks.push(c);files.set(c.url,raw);files.set(c.gzip.url,encoded);bufferViews.push({buffer:0,byteOffset:i*36,byteLength:36});accessors.push({bufferView:i,componentType:5126,count:3,type:'VEC3',...(i%2?{}:{min:[0,0,0],max:[1,1,0]})});
}
const document={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0,1]}],nodes:[0,1].map(i=>({name:'part'+i,mesh:i,extras:{part_key:'part'+i,source_identity:'fixture:'+i}})),meshes:[0,1].map(i=>({primitives:[{attributes:{POSITION:2*i,NORMAL:2*i+1},material:0}]})),materials:[{pbrMetallicRoughness:{baseColorFactor:[.3,.4,.5,1]}}],buffers:[{byteLength:144}],bufferViews,accessors};
const manifest={schema:'priority-exact-source-chunks-134-v1',model_sha256:'1'.repeat(64),model_bytes:1024,source_inventory_sha256:'2'.repeat(64),occurrences:2,chunks,largest_chunk_bytes:36,source_faces_deleted:0,normal_averaging:false,geometry_bytes:144,buffer_view_chunks:Object.fromEntries(chunks.map(c=>[c.ordinal,{chunk:c.ordinal,offset:0}])),document};
const manifestBytes=new TextEncoder().encode(JSON.stringify(manifest)),manifestRef={url:'https://fixtures.invalid/manifest',bytes:manifestBytes.length,sha256:sha(manifestBytes)};files.set(manifestRef.url,manifestBytes);
const packet={id:'loading-fixture',model:{sha256:manifest.model_sha256,bytes:1024},inventory:{sha256:manifest.source_inventory_sha256},chunk_delivery:{manifest:manifestRef,chunk_count:4,largest_chunk_bytes:36},parts:[0,1].map(i=>({key:'part'+i,node_name:'part'+i,source_identity:'fixture:'+i,matrix:I,kind:'printed',material_role:i?'A':'M',motion_axes:[]})),default_variant:'source',variants:[{id:'source',visible_keys:['part0','part1']}],basis:[[1,0,0],[0,1,0],[0,0,1]],unit_scale:1,axes:{},routes:[],public_head_keys:['part0'],loading_budget:{model_sha256:manifest.model_sha256,bytes:1024,single_load_peak_bytes:1024*1024,transfer_peak_bytes:36}};
let requests=[];
const serve=(corruptURL=null)=>async url=>{url=String(url);requests.push(url);assert(files.has(url),url);const source=files.get(url),b=new Uint8Array(source);if(url===corruptURL)b[0]^=1;let at=0;return new Response(new ReadableStream({pull(controller){if(at===b.length){controller.close();return;}const end=Math.min(b.length,at+7);controller.enqueue(b.subarray(at,end));at=end;}}),{headers:{'content-length':String(b.length)}});};
try{
 globalThis.fetch=serve();
 for(const mode of ['full','head','full']){
  const events=[],plan=mode==='head'?headSubsetPlan(packet,manifest,packet.public_head_keys):null;requests=[];
  const assembly=await loadSourceAssembly(packet,{signal:new AbortController().signal,mode,headPlan:plan,onProgress:p=>events.push(p)});
  assert.equal(assembly.parts.size,mode==='head'?1:2);assert.equal(events[0].phase,'manifest');assert.equal(events.at(-1).phase,'ready');assert.equal(events.at(-1).percent,null);
  assert(events.some(p=>p.phase==='decode'));assert(events.filter(p=>p.phase==='assembly').every(p=>p.percent===null));eventsMonotone(events);
  assert.equal(events.findLast(p=>p.total).total,(mode==='head'?chunks.slice(0,2):chunks).reduce((n,c)=>n+c.gzip.bytes,0));
  assert.equal(requests.length,mode==='head'?3:5);assert(requests.every(u=>!u.includes('/raw/')),'No duplicate raw downloads');
  const saved=assembly.snapshot();assembly.reset();assembly.apply(saved);releaseRoot(assembly.root,assembly);record('actual loader '+mode,{events:events.length,requests:requests.length});
 }
 const failed=[];globalThis.fetch=serve(chunks[1].gzip.url);
 await assert.rejects(loadSourceAssembly(packet,{signal:new AbortController().signal,onProgress:p=>failed.push(p)}),/Source asset hash changed/);assert(!failed.some(p=>p.phase==='ready'));record('changed compressed source rejected without ready');
 globalThis.fetch=serve();const retry=[];const assembly=await loadSourceAssembly(packet,{signal:new AbortController().signal,onProgress:p=>retry.push(p)});eventsMonotone(retry);assert.equal(retry.find(p=>p.phase==='download').percent,0);releaseRoot(assembly.root,assembly);record('fresh retry after integrity failure');
 const midDecode=new AbortController(),decodeEvents=[];
 await assert.rejects(loadSourceAssembly(packet,{signal:midDecode.signal,onProgress:p=>{decodeEvents.push(p);if(p.phase==='decode')midDecode.abort();}}),e=>e.name==='AbortError');assert(!decodeEvents.some(p=>p.phase==='ready'));record('cancel while decoding never reports ready');
 globalThis.fetch=async()=>new Response('failed',{status:503});const networkFailure=[];
 await assert.rejects(loadSourceAssembly(packet,{signal:new AbortController().signal,onProgress:p=>networkFailure.push(p)}),/Asset request failed: 503/);assert(!networkFailure.some(p=>p.phase==='ready'));record('network failure never reports completion');
 globalThis.fetch=serve();assert.deepEqual(new Uint8Array(await fetchPinned(chunks[0].url,chunks[0])),raws[0]);record('optional AbortSignal supported without weakening exact bytes');
 globalThis.DecompressionStream=undefined;const rawEvents=[];requests=[];
 const raw=await loadSourceAssembly(packet,{signal:new AbortController().signal,onProgress:p=>rawEvents.push(p)});eventsMonotone(rawEvents);assert.equal(rawEvents.findLast(p=>p.total).total,144);assert(requests.some(u=>u.includes('/raw/')));assert(!requests.some(u=>u.includes('/gzip/')));releaseRoot(raw.root,raw);record('uncompressed fallback exact denominator');
 globalThis.DecompressionStream=oldDecoder;
 const wrong=structuredClone(packet);wrong.parts[0].source_identity='changed';const rejected=[];
 await assert.rejects(loadSourceAssembly(wrong,{signal:new AbortController().signal,onProgress:p=>rejected.push(p)}),/Wrong source identity/);assert(!rejected.some(p=>p.phase==='ready'));record('actual assembly identity guard still rejects');
 // An abort must interrupt an outstanding reader, not wait for the next chunk.
 let cancelCount=0;globalThis.fetch=async()=>new Response(new ReadableStream({cancel(){cancelCount++;}}));
 const controller=new AbortController(),pending=fetchPinned('https://fixtures.invalid/pending',{bytes:4,sha256:sha(new Uint8Array(4))},controller.signal);await Promise.resolve();controller.abort();
 await assert.rejects(pending,e=>e.name==='AbortError');assert.equal(cancelCount,1);record('cancel interrupts pending source reader');
 globalThis.fetch=serve();const already=new AbortController();already.abort();const canceledEvents=[];
 await assert.rejects(loadSourceAssembly(packet,{signal:already.signal,onProgress:p=>canceledEvents.push(p)}),e=>e.name==='AbortError');assert.equal(canceledEvents.length,0);record('pre-canceled selection emits no progress');
 // Exercise the production message binding, including language refresh, stale
 // callbacks and a queued replacement selection on the serialized coordinator.
 const coordinator=createLoadCoordinator(),node={dataset:{},textContent:''};let language='en';const messages=createSourceUIText(()=>language);
 const a=coordinator.start(),reportA=sourceProgressStatus({job:a,messages,node,language:()=>language});reportA({phase:'decode',downloadPercent:25,currentChunk:1,totalChunks:4});assert(node.textContent.includes('25.0% downloaded'));
 for(const lang of ['ja','es','ko','ru','en']){language=lang;messages.refresh();assert.equal(node.textContent,sourceLoadingText({phase:'decode',downloadPercent:25,currentChunk:1,totalChunks:4},lang));assert(!node.textContent.includes('undefined'));}
 const b=coordinator.start(),reportB=sourceProgressStatus({job:b,messages,node,language:()=>language});const before=node.textContent;reportA({phase:'decode',downloadPercent:100,currentChunk:4,totalChunks:4});assert.equal(node.textContent,before);
 reportB({phase:'manifest'});assert(!node.textContent.includes('%'));coordinator.cancel();messages.clear(node);reportB({phase:'ready'});assert.equal(node.textContent,'');record('five-language refresh and stale callback isolation');
 let unlock;const busy=coordinator.start(),order=[];const first=coordinator.run(busy,async()=>{order.push('first');await new Promise(resolve=>unlock=resolve);});await Promise.resolve();const obsolete=coordinator.start(),skip=coordinator.run(obsolete,()=>order.push('obsolete')),last=coordinator.start(),run=coordinator.run(last,()=>order.push('last'));unlock();await Promise.all([first,skip,run]);assert.deepEqual(order,['first','last']);record('repeated selection serialized; superseded queued selection skipped');
 const invalid=createChunkProgress(chunks,()=>{});assert.throws(()=>invalid.assembly());const callback=invalid.begin(0);assert.throws(()=>invalid.begin(0));assert.throws(()=>callback({phase:'download',received:chunks[0].gzip.bytes+1}));record('invalid totals/order never become plausible percent');
 for(const lang of ['en','ja','es','ko','ru']){
  for(const phase of ['manifest','assembly','ready'])assert(!sourceLoadingText({phase,downloadPercent:100},lang).includes('%'));
  assert(sourceLoadingText({phase:'verify',downloadPercent:99.999,currentChunk:1,totalChunks:2},lang).includes('99.9%'));
  assert(!sourceLoadingText({phase:'decode',downloadPercent:NaN},lang).includes('%'));
 }record('unknown work totals and pre-completion rounding');
 // Copy revisions must reach the live formatter from the generated catalog.
 const manifestURL=new URL(fs.readFileSync(engineURL,'utf8').match(/from '([^']+locales\/manifest\.mjs[^']*)'/u)[1],engineURL);
 const {definitions}=await import(manifestURL.href),entry=definitions['source_assembly.progress.download'],original={...entry};
 try{entry.en='Central revised download';entry.ja='Central revised source';assert(sourceLoadingText({phase:'download',downloadPercent:12},'en').startsWith(entry.en));assert(sourceLoadingText({phase:'download',downloadPercent:12},'ja').startsWith(entry.ja));}
 finally{Object.assign(entry,original);}
 assert(!loadingSource.includes('progressCopy'));record('central catalog revisions reach live formatter without a second copy table');
 const baseRoot=getFlag('--baseline-root');
 if(baseRoot){
  const {loadChunkedModel:baseline}=await import(pathToFileURL(baseRoot+'/site/viewer/source-assembly-runtime/chunk_loader.mjs'));globalThis.fetch=serve();const old=[];
  const gltf=await baseline(new GLTFLoader(),packet,{signal:new AbortController().signal,onProgress:p=>old.push(p)});releaseRoot(gltf.scene);const drops=old.filter((p,i)=>i&&p.percent<old[i-1].percent);assert(drops.length>0);record('unmodified predecessor reproduces percent resets',{decreases:drops.length,first_drop:drops[0]});
 }
 const report={passed:true,cases:rows,scope:'Actual production loaders on bounded synthetic GLTF fixtures; source integrity, phase display and lifecycle. No machine geometry, GPU or physical-fit claim.'};
 if(getFlag('--report'))fs.writeFileSync(getFlag('--report'),JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify(report));
}finally{globalThis.fetch=oldFetch;globalThis.DecompressionStream=oldDecoder;}
