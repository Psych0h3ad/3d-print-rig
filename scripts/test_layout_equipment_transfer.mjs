// One sequential worker; public synthetic data only. Actual bodies have separate audits.
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {createServer} from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {createLayoutEquipmentLoader} from '../site/layout/layout-machine-loader.mjs';
import {MAX_LAYOUT_EQUIPMENT_BYTES,LAYOUT_EQUIPMENT_TRANSFER_BASE,equipmentTransferIdentity,decodeEquipmentTransfer,
  downloadEquipmentModel,downloadEquipmentPreviewGeometry} from '../site/layout/layout-equipment-transfer.mjs';

const checks=[],sha=b=>createHash('sha256').update(b).digest('hex');
const test=async(name,fn)=>{await fn();checks.push(name)};
const raw=Buffer.from('public synthetic equipment fixture\n'.repeat(4096)),gzip=gzipSync(raw,{level:9,mtime:0});
const modelPath='layout/assets/equipment/u1-popstation/U1_docked.glb';
const spec=(b=raw,z=gzip)=>({path:modelPath,bytes:b.length,sha256:sha(b),
  transfer:{path:modelPath+'.gz',bytes:z.length,sha256:sha(z),encoding:'gzip'}});
const options=fetchImpl=>({fetchImpl,baseURL:'https://equipment.invalid/'});
const response=(bytes,headers={})=>new Response(bytes,{headers});
const bad=e=>e.code==='LAYOUT_EQUIPMENT_INTEGRITY';
const canceled=e=>e.name==='AbortError';
const exteriorNames=['U1_exterior_standalone_loaded.glb','U1_exterior_docked.glb','PopStationMini_empty.glb','PopStationMini_loaded.glb'];
const hosted=(name=exteriorNames[0])=>{
 const m=spec();m.path='layout/assets/equipment/u1-exterior/'+name;
 m.transfer.path=m.path+'.gz';m.transfer.baseURL=LAYOUT_EQUIPMENT_TRANSFER_BASE;return m;
};
const hostedResponse=(url,body=gzip,properties={},headers={})=>{
 const result=response(body,headers);
 for(const [name,value]of Object.entries({url:url.href,...properties}))Object.defineProperty(result,name,{value});
 return result;
};

await test('hosted-exact-four-paths-and-both-pins-without-changing-raw-identity',async()=>{
 for(const name of exteriorNames){
  const m=hosted(name),before=structuredClone(m);let requests=0;
  const data=await downloadEquipmentModel(m,{baseURL:'https://ignored.invalid/',fetchImpl:async(url,o)=>{
   requests++;assert.equal(url.href,LAYOUT_EQUIPMENT_TRANSFER_BASE+m.path+'.gz');
   assert.equal(o.redirect,'error');assert.equal(o.credentials,'omit');assert.equal(o.referrerPolicy,'no-referrer');
   return hostedResponse(url,gzip,{}, {'content-length':String(gzip.length)});
  }});
  assert.equal(requests,1);assert.deepEqual(Buffer.from(data),raw);assert.deepEqual(m,before);
  assert.equal(equipmentTransferIdentity(m).baseURL,LAYOUT_EQUIPMENT_TRANSFER_BASE);
 }
});

await test('external-base-and-path-rejection-is-literal-before-any-fetch',async()=>{
 let requests=0;const opts={fetchImpl:async()=>{requests++;throw new Error('Unexpected fetch')}};
 for(const base of ['https://psych0h3ad.github.io/3d-print-rig-extra-models/',null,'','http://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/',
  'https://PSYCH0H3AD.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/',
  'https://psych0h3ad.github.io:443/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/',
  'https://user@psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/',
  LAYOUT_EQUIPMENT_TRANSFER_BASE.slice(0,-1),LAYOUT_EQUIPMENT_TRANSFER_BASE+'../3d-print-rig/',
  LAYOUT_EQUIPMENT_TRANSFER_BASE+'?x=1',LAYOUT_EQUIPMENT_TRANSFER_BASE+'#x',
  LAYOUT_EQUIPMENT_TRANSFER_BASE.replace('github.io','github.io.evil.invalid')]){
  const m=hosted();m.transfer.baseURL=base;await assert.rejects(downloadEquipmentModel(m,opts),bad);
 }
 for(const name of ['Other.glb','U1_exterior_docked.glb?x=1','%55%31_exterior_docked.glb',
  '../u1-exterior/U1_exterior_docked.glb','/U1_exterior_docked.glb','U1_exterior_docked.GLB'])
  await assert.rejects(downloadEquipmentModel(hosted(name),opts),bad);
 const legacy=spec();legacy.transfer.baseURL=LAYOUT_EQUIPMENT_TRANSFER_BASE;
 await assert.rejects(downloadEquipmentModel(legacy,opts),bad);
 for(const tail of ['?download=1','#x','/extra','%2e%2e','/../other.glb.gz']){
  const m=hosted();m.transfer.path+=tail;await assert.rejects(downloadEquipmentModel(m,opts),bad);
 }
 assert.equal(requests,0);
});

await test('hosted-redirect-response-mismatch-fails-and-cancels-with-no-raw-retry',async()=>{
 for(const properties of [{redirected:true},{type:'opaqueredirect'},
  {url:LAYOUT_EQUIPMENT_TRANSFER_BASE+'other.glb.gz'},
  {url:'https://elsewhere.invalid/'+hosted().transfer.path},{url:''}]){
  let requests=0,cancels=0;
  const stream=new ReadableStream({cancel(){cancels++}});
  await assert.rejects(downloadEquipmentModel(hosted(),{fetchImpl:async url=>{
   requests++;return hostedResponse(url,stream,properties);
  }}),bad);
  assert.equal(requests,1);assert.equal(cancels,1);assert.equal(stream.locked,false);
 }
});

await test('hosted-failure-and-abort-never-fetch-a-raw-or-alternate-body',async()=>{
 for(const failure of ['network','missing','encoded','decoded','encoding','abort']){
  const m=hosted(),control=new AbortController();let requests=0;
  if(failure==='decoded')m.sha256='0'.repeat(64);
  await assert.rejects(downloadEquipmentModel(m,{signal:control.signal,fetchImpl:async(url,o)=>{
   requests++;assert.equal(url.href,LAYOUT_EQUIPMENT_TRANSFER_BASE+m.transfer.path);assert.equal(o.signal,control.signal);
   if(failure==='network')throw new TypeError('Network/CORS fixture');
   if(failure==='missing'){const r=new Response(null,{status:404});Object.defineProperty(r,'url',{value:url.href});return r}
   if(failure==='abort')control.abort();
   const b=Buffer.from(gzip);if(failure==='encoded')b[12]^=1;
   return hostedResponse(url,b,{},failure==='encoding'?{'content-encoding':'gzip'}:{});
  }}));
  assert.equal(requests,1);
 }
 let requests=0;
 await assert.rejects(downloadEquipmentModel(hosted(),{Decoder:null,fetchImpl:async()=>{requests++}}),bad);
 assert.equal(requests,0);
});

await test('exact-gzip-roundtrip-and-plain-existing-rows',async()=>{
 const m=spec(),events=[];let requests=0;
 const result=await downloadEquipmentModel(m,{...options(async(url,o)=>{
  requests++;assert.equal(url.href,'https://equipment.invalid/'+m.transfer.path);
  assert.equal(o.signal,undefined);return response(gzip,{'content-length':String(gzip.length)});
 }),onProgress:e=>events.push(e)});
 assert.deepEqual(Buffer.from(result),raw);assert.equal(requests,1);
 assert(events.some(e=>e.phase==='download')&&events.some(e=>e.phase==='decode'));
 assert(events.every(e=>e.loaded<=e.total&&e.percent<=90));
 const plain={path:'fixture.glb',bytes:raw.length,sha256:sha(raw)};
 assert.deepEqual(Buffer.from(await downloadEquipmentModel(plain,options(async()=>response(raw)))),raw);
 assert.deepEqual(Buffer.from(await decodeEquipmentTransfer(gzip,m)),raw);
});

await test('exterior-reference-delivery-paths-preserve-exact-decoded-identity',async()=>{
 for(const name of ['U1_exterior_standalone_loaded.glb','U1_exterior_docked.glb','PopStationMini_empty.glb','PopStationMini_loaded.glb']){
  const path='layout/assets/equipment/u1-exterior/'+name,m=spec();m.path=path;m.transfer.path=path+'.gz';
  assert.deepEqual(Buffer.from(await decodeEquipmentTransfer(gzip,m)),raw);
 }
 const wrong=spec();wrong.path='layout/assets/equipment/u1-exterior/Other.glb';wrong.transfer.path=wrong.path+'.gz';
 await assert.rejects(decodeEquipmentTransfer(gzip,wrong),bad);
});

await test('encoded-and-decoded-hashes-are-independent-before-parse',async()=>{
 let decoders=0;class Spy {constructor(...args){decoders++;return new DecompressionStream(...args)}}
 const altered=Buffer.from(gzip);altered[12]^=1;
 await assert.rejects(decodeEquipmentTransfer(altered,spec(),{Decoder:Spy}),bad);assert.equal(decoders,0);
 const wrong=spec();wrong.sha256='0'.repeat(64);
 await assert.rejects(decodeEquipmentTransfer(gzip,wrong,{Decoder:Spy}),bad);assert.equal(decoders,1);
 // Same decoded content, different valid encoded identity must still fail.
 const another=gzipSync(raw,{level:1});assert.notEqual(sha(another),sha(gzip));
 await assert.rejects(decodeEquipmentTransfer(another,{...spec(),transfer:{...spec().transfer,bytes:another.length}}),bad);
});

await test('corrupt-gzip-crc-and-truncated-stream-with-matching-encoded-sha-fail',async()=>{
 for(const z of [gzip.subarray(0,-1),(()=>{const b=Buffer.from(gzip);b[b.length-8]^=1;return b})()])
  await assert.rejects(decodeEquipmentTransfer(z,spec(raw,z)));
});

await test('both-size-budgets-metadata-and-decoder-checked-before-fetch',async()=>{
 let fetched=0;const opts=options(async()=>{fetched++;return response(gzip)});
 for(const size of [0,-1,1.5,NaN,Infinity,MAX_LAYOUT_EQUIPMENT_BYTES+1]){
  await assert.rejects(downloadEquipmentModel({...spec(),bytes:size},opts),bad);
  const m=spec();m.transfer.bytes=size;await assert.rejects(downloadEquipmentModel(m,opts),bad);
 }
 for(const encoding of [undefined,'identity','br','GZIP']){
  const m=spec();m.transfer.encoding=encoding;await assert.rejects(downloadEquipmentModel(m,opts),bad);
 }
 for(const path of ['https://outside.invalid/model.glb','../fixture.glb','layout/../fixture.glb','fixture.glb?x=1'])
  await assert.rejects(downloadEquipmentModel({...spec(),path},opts),bad);
 for(const mutate of [m=>m.transfer.path='other.glb.gz',m=>m.path='fixture.glb',m=>m.transfer=null,
  m=>m.sha256='A'.repeat(64),m=>m.transfer.sha256='z'.repeat(64)]){
  const m=spec();mutate(m);await assert.rejects(downloadEquipmentModel(m,opts),bad);
 }
 await assert.rejects(downloadEquipmentModel(spec(),{...opts,Decoder:null}),bad);assert.equal(fetched,0);
});

await test('encoded-overflow-truncation-hash-and-header-failures-cancel',async()=>{
 let cancelCount=0;
 const over=new ReadableStream({start(c){c.enqueue(Buffer.concat([gzip,Buffer.from([1])]))},cancel(){cancelCount++}});
 await assert.rejects(downloadEquipmentModel(spec(),options(async()=>new Response(over))),bad);
 assert.equal(cancelCount,1);assert.equal(over.locked,false);
 await assert.rejects(downloadEquipmentModel(spec(),options(async()=>response(gzip.subarray(0,-1)))),bad);
 const corrupt=Buffer.from(gzip);corrupt[10]^=1;
 await assert.rejects(downloadEquipmentModel(spec(),options(async()=>response(corrupt))),bad);
 for(const headers of [{'content-encoding':'gzip'},{'content-encoding':'br'},{'content-encoding':''},
  {'content-length':String(gzip.length-1)},{'content-length':'NaN'},{'content-length':'999999999999999999999'}]){
  let canceled=0;const stream=new ReadableStream({cancel(){canceled++}});
  await assert.rejects(downloadEquipmentModel(spec(),options(async()=>new Response(stream,{headers}))),bad);
  assert.equal(canceled,1);assert.equal(stream.locked,false);
 }
 let canceled=0;const stream=new ReadableStream({cancel(){canceled++}});
 await assert.rejects(downloadEquipmentModel(spec(),options(async()=>new Response(stream,{status:404}))),{code:'LAYOUT_EQUIPMENT_DOWNLOAD'});
 assert.equal(canceled,1);
});

await test('decoded-overflow-zipbomb-bounded-and-truncation-rejected',async()=>{
 const bomb=Buffer.alloc(4*1024*1024,42),z=gzipSync(bomb),m=spec(bomb,z);m.bytes=1024;
 await assert.rejects(decodeEquipmentTransfer(z,m),bad);
 const tooShort=spec();tooShort.bytes=raw.length+1;await assert.rejects(decodeEquipmentTransfer(gzip,tooShort),bad);
 let canceled=0,decoderReads=0;
 class Overflow {
  constructor(){return new TransformStream({transform(_c,controller){decoderReads++;controller.enqueue(new Uint8Array(raw.length+1))}})}
 }
 await assert.rejects(decodeEquipmentTransfer(gzip,spec(),{Decoder:Overflow}),bad);assert.equal(decoderReads,1);
 // Observe the actual decoder-readable cancel and released lock explicitly.
 let readable;
 class Observed {
  constructor(){return {writable:new WritableStream(),readable:readable=new ReadableStream({
   start(c){c.enqueue(new Uint8Array(raw.length+1))},cancel(){canceled++}
  })}}
 }
 await assert.rejects(decodeEquipmentTransfer(gzip,spec(),{Decoder:Observed}),bad);
 assert.equal(canceled,1);assert.equal(readable.locked,false);
});

await test('preabort-and-pending-encoded-read-cancel-with-no-late-progress',async()=>{
 const before=new AbortController();before.abort();let fetched=0;
 await assert.rejects(downloadEquipmentModel(spec(),{...options(async()=>{fetched++}),signal:before.signal}),canceled);
 assert.equal(fetched,0);
 const control=new AbortController();let cancelCount=0,started;
 const pendingRead=new Promise(r=>started=r),events=[];
 const stream=new ReadableStream({pull(){started()},cancel(){cancelCount++}});
 const pending=downloadEquipmentModel(spec(),{...options(async()=>new Response(stream)),signal:control.signal,onProgress:e=>events.push(e)});
 await pendingRead;control.abort();await assert.rejects(pending,canceled);
 assert.equal(cancelCount,1);assert.equal(stream.locked,false);assert.equal(events.length,0);
});

await test('abort-pending-decoded-read-and-abort-from-progress-cancel',async()=>{
 const control=new AbortController();let started,cancels=0,readable;
 const pendingRead=new Promise(r=>started=r);
 class Pending {
  constructor(){return {writable:new WritableStream(),readable:readable=new ReadableStream({
   pull(){started()},cancel(){cancels++}
  })}}
 }
 const pending=decodeEquipmentTransfer(gzip,spec(),{signal:control.signal,Decoder:Pending});
 await pendingRead;control.abort();await assert.rejects(pending,canceled);
 assert.equal(cancels,1);assert.equal(readable.locked,false);
 const c=new AbortController(),events=[];
 await assert.rejects(downloadEquipmentModel(spec(),{...options(async()=>response(gzip)),signal:c.signal,
  onProgress:e=>{events.push(e);if(e.phase==='decode')c.abort()}}),canceled);
 assert.equal(events.filter(e=>e.phase==='decode').length,1);
});

await test('new-source-and-ABA-use-fresh-snapshotted-pins',async()=>{
 const other=Buffer.from('second public synthetic source\n'.repeat(2048)),otherGzip=gzipSync(other),a=spec(),b=spec(other,otherGzip);
 const original=structuredClone(a);let release,entered;const started=new Promise(r=>entered=r);
 const pending=downloadEquipmentModel(a,options(async()=>{entered();await new Promise(r=>release=r);return response(gzip)}));
 await started;Object.assign(a,b);release();assert.deepEqual(Buffer.from(await pending),raw);
 const requests=[];
 for(const [m,encoded,expected] of [[original,gzip,raw],[b,otherGzip,other],[original,gzip,raw]]){
  const data=await downloadEquipmentModel(m,options(async url=>{requests.push(url.href);return response(encoded)}));
  assert.deepEqual(Buffer.from(data),expected);
 }
 assert.equal(requests.length,3);assert.equal(new Set(requests).size,1,'Same URL with changed identity is not cached');
});

await test('production-default-download-validates-both-before-parse-and-recovers',async()=>{
 let current=spec(),body=gzip,parsed=0,mode='ok',requests=0;
 const originalFetch=globalThis.fetch;
 globalThis.fetch=async(url)=>{requests++;assert.equal(url.href.endsWith(current.transfer.path),true);return response(body)};
 const getEquipment=id=>id==='fixture'?{id,equipmentVariant:'standalone',model:current,dimensionsMm:{width:420,height:730,depth:499}}:null;
 const load=createLayoutEquipmentLoader({getEquipment,parse:async(data)=>{
  parsed++;assert.deepEqual(Buffer.from(data),raw);
  const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.42,.73,.499),new THREE.MeshBasicMaterial());
  mesh.position.y=.365;root.add(mesh);return {scene:root};
 }});
 try{
  for(mode of ['encoded','decoded','ok','encoded','ok']){
   current=spec();body=Buffer.from(gzip);
   if(mode==='encoded')body[12]^=1;
   if(mode==='decoded')current.sha256='0'.repeat(64);
   const count=parsed;
   if(mode!=='ok'){await assert.rejects(load('fixture'),bad);assert.equal(parsed,count)}
   else{const value=await load('fixture');assert.equal(value.source.sha256,sha(raw));value.dispose();value.dispose()}
  }
  assert.equal(parsed,2);assert.equal(requests,5);
 }finally{globalThis.fetch=originalFetch}
});

await test('injected-raw-download-retains-contract-even-for-transfer-row',async()=>{
 let parsed=0;
 const row={id:'fixture',equipmentVariant:'standalone',model:spec(),dimensionsMm:{width:420,height:730,depth:499}};
 const load=createLayoutEquipmentLoader({getEquipment:()=>row,download:async()=>raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),
  parse:async data=>{parsed++;assert.deepEqual(Buffer.from(data),raw);const root=new THREE.Group();
   const mesh=new THREE.Mesh(new THREE.BoxGeometry(.42,.73,.499),new THREE.MeshBasicMaterial());mesh.position.y=.365;root.add(mesh);return {scene:root}}
 });
 const value=await load('fixture');assert.equal(parsed,1);value.dispose();
});

await test('attribution-follows-registration-and-unknown-stays-unset',async()=>{
 for(const flags of [{publicSourcesOnly:true,manufacturerCAD:false},
  {publicSourcesOnly:false,manufacturerCAD:true},{}]){
  const row={id:'fixture',equipmentVariant:'standalone',model:spec(),dimensionsMm:{width:420,height:730,depth:499},...flags};
  const load=createLayoutEquipmentLoader({getEquipment:()=>row,download:async()=>raw,
   parse:async()=>{const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.42,.73,.499),new THREE.MeshBasicMaterial());
    mesh.position.y=.365;root.add(mesh);return {scene:root}}
  });
  const value=await load('fixture');
  for(const key of ['publicSourcesOnly','manufacturerCAD']){
   assert.equal(value.source[key],flags[key]);assert.equal(value.root.userData.layoutEquipment[key],flags[key]);
   assert.equal(Object.hasOwn(value.source,key),Object.hasOwn(flags,key));
  }
  value.dispose();
 }
});

await test('real-http-explicit-gzip-identity-and-unexpected-auto-decoding',async()=>{
 const server=createServer((req,res)=>{
  if(req.url==='/auto'){res.setHeader('Content-Encoding','gzip');res.end(gzip);return}
  res.setHeader('Content-Length',String(gzip.length));res.end(gzip);
 });
 await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const base=`http://127.0.0.1:${server.address().port}`;
 try{
  assert.deepEqual(Buffer.from(await downloadEquipmentModel(spec(),{fetchImpl:()=>fetch(base+'/explicit')})),raw);
  await assert.rejects(downloadEquipmentModel(spec(),{fetchImpl:()=>fetch(base+'/auto')}),bad);
 }finally{server.closeAllConnections();await new Promise(resolve=>server.close(resolve))}
});

await test('hosted-loader-snapshot-keeps-base-and-decoded-source-through-ABA',async()=>{
 const originalFetch=globalThis.fetch;let selected=hosted(),requests=0,parsed=0;
 const original=structuredClone(selected);
 globalThis.fetch=async(url)=>{
  requests++;assert.equal(url.href,LAYOUT_EQUIPMENT_TRANSFER_BASE+original.transfer.path);
  selected.path='mutated.glb';selected.sha256='0'.repeat(64);selected.transfer.baseURL='https://invalid.example/';
  return hostedResponse(url);
 };
 const load=createLayoutEquipmentLoader({getEquipment:()=>({id:'fixture',equipmentVariant:'standalone',model:selected,
  dimensionsMm:{width:420,height:730,depth:499}}),parse:async(bytes,row)=>{
   parsed++;assert.deepEqual(Buffer.from(bytes),raw);assert.deepEqual(row.model,original);
   const root=new THREE.Group(),mesh=new THREE.Mesh(new THREE.BoxGeometry(.42,.73,.499),new THREE.MeshBasicMaterial());
   mesh.position.y=.365;root.add(mesh);return {scene:root};
  }});
 try{
  for(let i=0;i<3;i++){
   selected=structuredClone(original);const result=await load('fixture');
   assert.equal(result.source.assetPath,original.path);assert.equal(result.source.sha256,original.sha256);
   assert.equal(result.manifest.model.transfer.baseURL,LAYOUT_EQUIPMENT_TRANSFER_BASE);result.dispose();
  }
  assert.equal(requests,3);assert.equal(parsed,3);
 }finally{globalThis.fetch=originalFetch}
});

await test('inclusive-16MiB-boundary-for-encoded-and-decoded-bodies',async()=>{
 const large=Buffer.alloc(MAX_LAYOUT_EQUIPMENT_BYTES,37),z=gzipSync(large),m=spec(large,z);
 assert.deepEqual(Buffer.from(await decodeEquipmentTransfer(z,m)),large);
 // Exercise the encoded inclusive boundary independently of gzip compression ratio.
 const wire=Buffer.alloc(MAX_LAYOUT_EQUIPMENT_BYTES,11),encoded=spec(raw,wire);
 class Exact {constructor(){return {writable:new WritableStream(),readable:new ReadableStream({start(c){c.enqueue(raw);c.close()}})}}}
 assert.deepEqual(Buffer.from(await decodeEquipmentTransfer(wire,encoded,{Decoder:Exact})),raw);
});

await test('preview-json-exact-pinned-data-contract-is-separate-from-GLB',async()=>{
 const data=Buffer.from('{"kind":"public synthetic preview","vertices":[1,2,3],"text":"日本語","__proto__":{"polluted":true}}'),z=gzipSync(data);
 const m={path:'layout/assets/equipment/u1-exterior/U1_preview_geometry.json',bytes:data.length,sha256:sha(data),
  transfer:{path:'layout/assets/equipment/u1-exterior/U1_preview_geometry.json.gz',bytes:z.length,sha256:sha(z),
   encoding:'gzip',baseURL:LAYOUT_EQUIPMENT_TRANSFER_BASE}};
 const fetchImpl=async url=>{assert.equal(url.href,LAYOUT_EQUIPMENT_TRANSFER_BASE+m.transfer.path);return hostedResponse(url,z)};
 const result=await downloadEquipmentPreviewGeometry(m,{fetchImpl});assert.deepEqual(result,JSON.parse(data));
 assert.equal({}.polluted,undefined);
 await assert.rejects(downloadEquipmentModel(m,{fetchImpl}),bad);
 let requests=0;const never=async()=>{requests++;throw new Error('Unexpected fetch')};
 for(const mutate of [n=>n.path=hosted().path,n=>n.path='../U1_preview_geometry.json',
  n=>n.transfer.path+='?x=1',n=>n.transfer.path=hosted().transfer.path,
  n=>n.transfer.baseURL='https://outside.invalid/',n=>delete n.transfer.baseURL,
  n=>n.transfer.baseURL=LAYOUT_EQUIPMENT_TRANSFER_BASE+'#x',n=>n.transfer.encoding='identity',
  n=>delete n.transfer,n=>n.sha256='Z'.repeat(64),n=>n.transfer.sha256='Z'.repeat(64),
  n=>n.bytes=MAX_LAYOUT_EQUIPMENT_BYTES+1,n=>n.transfer.bytes=MAX_LAYOUT_EQUIPMENT_BYTES+1,
  n=>n.bytes=0,n=>n.transfer.bytes=-1]){
  const n=structuredClone(m);mutate(n);await assert.rejects(downloadEquipmentPreviewGeometry(n,{fetchImpl:never}),bad);
 }
 assert.equal(requests,0);
 for(const mutate of [n=>n.sha256='0'.repeat(64),n=>n.transfer.sha256='0'.repeat(64),
  n=>n.bytes--,n=>n.bytes++,n=>n.transfer.bytes--,n=>n.transfer.bytes++]){
  const n=structuredClone(m);mutate(n);await assert.rejects(downloadEquipmentPreviewGeometry(n,{fetchImpl}),bad);
 }
 for(const body of [Buffer.from('{broken'),Buffer.from('globalThis.__previewEvaluated=true'),Buffer.from([0x22,0xff,0x22])]){
  const b=gzipSync(body),n={...m,bytes:body.length,sha256:sha(body),transfer:{...m.transfer,bytes:b.length,sha256:sha(b)}};
  await assert.rejects(downloadEquipmentPreviewGeometry(n,{fetchImpl:async url=>hostedResponse(url,b)}),bad);
 }
 assert.equal(globalThis.__previewEvaluated,undefined);
 const truncated=z.subarray(0,-1),t={...m,transfer:{...m.transfer,bytes:truncated.length,sha256:sha(truncated)}};
 await assert.rejects(downloadEquipmentPreviewGeometry(t,{fetchImpl:async url=>hostedResponse(url,truncated)}));
 for(const body of [z.subarray(0,-1),Buffer.concat([z,Buffer.from([0])])])
  await assert.rejects(downloadEquipmentPreviewGeometry(m,{fetchImpl:async url=>hostedResponse(url,body)}),bad);
 const bomb=Buffer.from('"'+'x'.repeat(1024*1024)+'"'),b=gzipSync(bomb);
 await assert.rejects(downloadEquipmentPreviewGeometry({...m,bytes:32,sha256:sha(bomb),transfer:{...m.transfer,bytes:b.length,sha256:sha(b)}},
  {fetchImpl:async url=>hostedResponse(url,b)}),bad);
 const control=new AbortController();control.abort();
 await assert.rejects(downloadEquipmentPreviewGeometry(m,{signal:control.signal,fetchImpl:never}),canceled);
 await assert.rejects(downloadEquipmentPreviewGeometry(m,{fetchImpl:async url=>hostedResponse(url,z,{redirected:true})}),bad);
});

const auditEntrypointChecks=[];
await test('both-real-audit-entrypoints-require-exact-cache-bodies-before-geometry',async()=>{
 const tmp=fs.mkdtempSync(path.join(os.tmpdir(),'layout-equipment-audit-inputs-'));
 const site=path.join(tmp,'site'),cache=path.join(tmp,'private-cache'),repo=fileURLToPath(new URL('../',import.meta.url));
 fs.mkdirSync(path.join(site,'layout'),{recursive:true});fs.mkdirSync(path.join(site,'viewer'),{recursive:true});fs.mkdirSync(cache);
 try{
  for(const name of ['layout/layout-biqu-popstation.mjs','layout/layout-biqu-display.mjs','layout/layout-biqu-appearance.mjs','layout/layout-machine-loader.mjs','layout/layout-equipment-transfer.mjs','layout/layout-geometry.mjs',
   'layout/layout-equipment-mesh.mjs','layout/layout-renderer.mjs','viewer/layout-machine-recipes.mjs',
   'viewer/source-assembly-registry.mjs'])
   fs.copyFileSync(path.join(repo,'site',name),path.join(site,name));
  fs.cpSync(path.join(repo,'site/viewer/vendor-r180'),path.join(site,'viewer/vendor-r180'),{recursive:true});
  const models=exteriorNames.map(name=>hosted(name)),prefix='layout/assets/equipment/u1-exterior/';
  const metadataDir=path.join(site,prefix);fs.mkdirSync(metadataDir,{recursive:true});
  // Public attribution/mount metadata only; no actual model or preview bodies.
  for(const name of ['MOUNT_SPEC.json','POPSTATION_PUBLIC_MOUNT_RECEIPTS.json','POPSTATION_PUBLIC_MANUAL_RECEIPTS.json',
   'U1_BED_OUTLINE.json','U1_exterior_notices.json','U1_BED_SOURCE_RECEIPT.json','Snapmaker_OrcaSlicer_LICENSE.txt'])
   fs.copyFileSync(path.join(repo,'site',prefix,name),path.join(metadataDir,name));
  const mount=JSON.parse(fs.readFileSync(path.join(metadataDir,'MOUNT_SPEC.json'),'utf8'));
  const receipt=JSON.parse(fs.readFileSync(path.join(metadataDir,'U1_BED_SOURCE_RECEIPT.json'),'utf8'));
  for(const consumer of receipt.models){const m=models[consumer.variant==='standalone'?0:1];consumer.path=m.path;consumer.bytes=m.bytes;consumer.sha256=m.sha256;}
  fs.writeFileSync(path.join(metadataDir,'U1_BED_SOURCE_RECEIPT.json'),JSON.stringify(receipt));

  // The real gates prepare preview geometry before inspecting the GLB. Use a
  // tiny, independently pinned 29-geometry fixture and the production strict
  // cache implementation, so those prerequisites cannot mask corruption guards.
  const geometries=Object.fromEntries(Array.from({length:29},(_,i)=>['fixture-'+i,{
   positionsM:[0,0,0,1,0,0,0,1,0],normals:[0,0,1,0,0,1,0,0,1],indices:[0,1,2]}]));
  const arrayPin=(values,integer=false)=>{
   const a=integer?new Uint32Array(values):new Float32Array(values),b=Buffer.from(a.buffer,a.byteOffset,a.byteLength);
   return {bytes:b.length,sha256:sha(b)};
  };
  const body=Buffer.from(JSON.stringify(geometries)),wire=gzipSync(body,{level:9,mtime:0});
  const preview={path:prefix+'U1_preview_geometry.json',bytes:body.length,sha256:sha(body),
   transfer:{path:prefix+'U1_preview_geometry.json.gz',bytes:wire.length,sha256:sha(wire),encoding:'gzip',baseURL:LAYOUT_EQUIPMENT_TRANSFER_BASE}};
  const descriptor={kind:'layout-preview-geometry',units:'m',up:'+Y',front:'+Z',rootPivotM:[0,0,0],
   geometry:Object.fromEntries(Object.entries(geometries).map(([id,g])=>[id,{vertices:3,triangles:1,
    positionsF32:arrayPin(g.positionsM),normalsF32:arrayPin(g.normals),indicesU32:arrayPin(g.indices,true)}])),
   body:{bytes:body.length,sha256:sha(body)},gzip:{bytes:wire.length,sha256:sha(wire)}};
  fs.writeFileSync(path.join(metadataDir,'U1_preview_geometry_index.json'),JSON.stringify(descriptor));
  const source=fs.readFileSync(path.join(repo,'site/layout/layout-equipment.mjs'),'utf8');
  const cacheStart=source.indexOf('const geometryIDs = '),cacheEnd=source.indexOf('const definitions = ',cacheStart);
  assert(cacheStart>=0&&cacheEnd>cacheStart,'Production strict preview cache closure missing');
  fs.writeFileSync(path.join(site,'layout/layout-equipment.mjs'),
   `const models=${JSON.stringify(models)},mount=${JSON.stringify(mount)};
export const LAYOUT_EQUIPMENT_PREVIEW=${JSON.stringify(descriptor)};
export const LAYOUT_EQUIPMENT_PREVIEW_MODEL=${JSON.stringify(preview)};
${source.slice(cacheStart,cacheEnd)}
export function getLayoutEquipment(id,variant){
 const u=id==='snapmaker_u1_layout_reference';
 const parts=Object.keys(LAYOUT_EQUIPMENT_PREVIEW.geometry).map(geometryId=>{
  const p={name:geometryId,shape:'mesh',geometryId,groupId:'casing',groupKind:'casing',centerM:[.5,.5,0],sizeM:[1,1,.001]};
  for(const field of ['positionsM','normals','indices'])Object.defineProperty(p,field,{enumerable:true,get:()=>getLayoutEquipmentPreviewGeometry(geometryId)?.[field]});
  return p;
 });
 return {id,equipmentVariant:variant,model:models[u?(variant==='standalone'?0:1):(variant==='empty'?2:3)],manufacturerCAD:false,
  ...(!u?{publicSourcesOnly:true,purchasedSourceDerived:false,privateSourceDerived:false,mount}:{}),
  proxy:{kind:u?'simplified-exterior-reference':'documented-exterior-planning-approximation',parts}};
}`);
  // Only four decoded canonical filenames enter the map. All ten bodies live
  // together in the private fixture cache; gzip/JSON never become map entries.
  const files=Object.fromEntries(models.map(m=>[m.path,path.join(cache,path.basename(m.path))]));
  for(const m of models){const file=files[m.path];fs.writeFileSync(file,raw);fs.writeFileSync(file+'.gz',gzip);}
  const previewFile=path.join(cache,path.basename(preview.path)),previewWire=previewFile+'.gz';
  fs.writeFileSync(previewFile,body);fs.writeFileSync(previewWire,wire);
  const rawFile=files[models[0].path],encodedFile=rawFile+'.gz',input=path.join(tmp,'inputs.json');
  assert.equal(Object.keys(files).length,4);
  for(const name of ['audit_layout_equipment_assets.mjs','audit_layout_equipment_geometry.mjs']){
   const invoke=(label,mapping,expected)=>{
    fs.writeFileSync(input,JSON.stringify(mapping));const report=path.join(tmp,'report.json');
    const result=spawnSync(process.execPath,['--max-old-space-size=384','--max-semi-space-size=4','--v8-pool-size=1',
     path.join(repo,'scripts',name),'--site',site,'--equipment-inputs',input,'--report',report],
     {encoding:'utf8',timeout:15000,windowsHide:true,env:{...process.env,UV_THREADPOOL_SIZE:'1',NODE_OPTIONS:''}});
    assert.ifError(result.error);assert.notEqual(result.status,0,label);assert.match(result.stdout+result.stderr,expected,label);assert(!fs.existsSync(report));
    auditEntrypointChecks.push({entrypoint:name,case:label,expected:String(expected)});
   };
   invoke('malformed-map',{files,extra:true},/exact \{files:/);
   invoke('unregistered-input',{files:{'other.glb':rawFile}},/Unregistered equipment audit input/);
   invoke('relative-decoded-path',{files:{[models[0].path]:'relative.glb'}},/cache path must be absolute/);
   invoke('missing-three-decoded-entries',{files:{[models[0].path]:rawFile}},/Hosted equipment requires an exact input mapping/);
   invoke('forbidden-encoded-map-entry',{files:{...files,[models[0].transfer.path]:encodedFile}},/Unregistered equipment audit input/);
   fs.unlinkSync(encodedFile);
   try{invoke('missing-real-gzip-sibling',{files},/Actual equipment body missing/);}finally{fs.writeFileSync(encodedFile,gzip);}
   const corruptGzip=Buffer.from(gzip);corruptGzip[12]^=1;fs.writeFileSync(encodedFile,corruptGzip);
   try{invoke('corrupt-real-gzip-sibling',{files},/hash differs from source receipt/);}finally{fs.writeFileSync(encodedFile,gzip);}
   fs.writeFileSync(rawFile,Buffer.alloc(raw.length,1));
   try{invoke('corrupt-decoded-glb',{files},/hash differs from source receipt/);}finally{fs.writeFileSync(rawFile,raw);}
   fs.unlinkSync(previewWire);
   try{invoke('missing-preview-gzip',{files},/Actual equipment body missing/);}finally{fs.writeFileSync(previewWire,wire);}
   const corruptPreview=Buffer.from(wire);corruptPreview[12]^=1;fs.writeFileSync(previewWire,corruptPreview);
   try{invoke('corrupt-preview-gzip',{files},/hash differs from source receipt/);}finally{fs.writeFileSync(previewWire,wire);}
   fs.writeFileSync(previewFile,Buffer.alloc(body.length,1));
   try{invoke('corrupt-decoded-preview',{files},/hash differs from source receipt/);}finally{fs.writeFileSync(previewFile,body);}
   // Every prerequisite passes, but synthetic model bytes must still fail the
   // actual GLB magic guard. Valid transport cannot certify geometry.
   invoke('authenticated-synthetic-non-glb',{files},/glTF/);
   for(const m of models){assert(!fs.existsSync(path.join(site,m.path)));assert(!fs.existsSync(path.join(site,m.transfer.path)));}
   assert(!fs.existsSync(path.join(site,preview.path)));assert(!fs.existsSync(path.join(site,preview.transfer.path)));
  }
 }finally{fs.rmSync(tmp,{recursive:true,force:true})}
});

const report={passed:true,checks:checks.length,cases:checks,workerCount:1,nativeJobs:0,auditEntrypointChecks,
 sourceInputs:Object.fromEntries(['../site/layout/layout-equipment-transfer.mjs','../site/layout/layout-machine-loader.mjs',
  './test_layout_equipment_transfer.mjs'].map(p=>[p,sha(fs.readFileSync(fileURLToPath(new URL(p,import.meta.url))))])),
 scope:'Synthetic corruption/overflow/truncation/abort and HTTP transport; encoded and decoded integrity before production parse; fresh-source/ABA and unchanged injected raw-download contract. Actual GLBs, browser visuals and native fit audited separately.'};
const option=process.argv.indexOf('--report');if(option>=0)fs.writeFileSync(process.argv[option+1],JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));
