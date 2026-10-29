// Offline rejection/control fixtures. Optional --cache-dir exercises prepared
// actual arrays too; actual full/preview correspondence has its own audit gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {pathToFileURL} from 'node:url';
import {BIQU_POPSTATION_CAD as row,BIQU_POPSTATION_PREVIEW as preview,BIQU_POPSTATION_SOURCE,
  getBiquPopStation,prepareBiquPreview,isBiquPreviewPrepared,needsBiquPreview,validateBiquPreview,createBiquPreviewCache} from '../site/layout/layout-biqu-popstation.mjs';
import {BIQU_POPSTATION_TRANSFER_BASE,BIQU_POPSTATION_MODEL_IDENTITY as full,BIQU_POPSTATION_PREVIEW_IDENTITY as json,
  equipmentTransferIdentity,equipmentPreviewGeometryTransferIdentity,downloadEquipmentModel,downloadEquipmentPreviewGeometry} from '../site/layout/layout-equipment-transfer.mjs';
const checks=[],test=async(name,fn)=>{await fn();checks.push(name)},bad=e=>/INTEGRITY/.test(e.code??''),aborted=e=>e?.name==='AbortError';

await test('canonical-metadata-provenance-variant-selection-and-no-import-io',async()=>{
  assert.equal(getBiquPopStation(),row);assert.equal(getBiquPopStation('supplied'),row);
  assert.equal(row.id,'biqu_popstation_mini_cad_v1');assert.equal(row.type,'popstation_mini_biqu_v1');
  for(const [key,value]of Object.entries({manufacturerCAD:true,isLayoutEquipment:true,publicSourcesOnly:false,
    privateSourceDerived:true,purchasedSourceDerived:false,equipmentVariant:'supplied'}))assert.equal(row[key],value);
  assert.deepEqual(row.dimensionsMm,{width:423.10022712374223,depth:478.28293730922826,height:417.40023949665624});
  assert.equal(row.model.sha256,full.sha256);assert.equal(BIQU_POPSTATION_SOURCE.sourceInstances,70);
  for(const variant of ['empty','loaded','scan','',null,{},false,{equipmentVariant:'supplied',model:{path:'other.glb'}}])
    assert.throws(()=>getBiquPopStation(variant),e=>e.code==='LAYOUT_UNKNOWN_EQUIPMENT_VARIANT');
  assert(Object.isFrozen(row)&&Object.isFrozen(row.proxy)&&Object.isFrozen(row.model.transfer)&&Object.isFrozen(row.source));
  assert.equal(isBiquPreviewPrepared(),false);assert.deepEqual(row.proxy.parts,[]);assert(Object.isFrozen(row.proxy.parts));
  const previous=globalThis.fetch;let requests=0;globalThis.fetch=()=>{requests++;throw Error('Import I/O')};
  try{await import(pathToFileURL(path.resolve('site/layout/layout-biqu-popstation.mjs')).href+'?no-io-test');}finally{globalThis.fetch=previous}
  assert.equal(requests,0);
});

await test('recursive-new-type-placement-clipboard-groups-and-cycles',()=>{
  for(const item of [{type:row.type},{kind:row.type},{id:row.id},
    {layout:{furniture:[{type:row.type}]}},{clipboard:{groups:[{template:{children:[{kind:row.type}]}}]}}])assert(needsBiquPreview(item));
  const cycle={kind:'group',children:[]};cycle.children.push(cycle);assert.equal(needsBiquPreview(cycle),false);
  cycle.children.push({type:row.type});assert(needsBiquPreview(cycle));
  for(const value of [undefined,null,{},'popstation_mini_biqu_v1',{kind:'popstation_mini'},{type:'printer',machineId:'snapmaker_u1_layout_reference'}])
    assert.equal(needsBiquPreview(value),false);
  const accessor={};Object.defineProperty(accessor,'type',{enumerable:true,get(){throw Error('Untrusted getter')}});
  assert.equal(needsBiquPreview(accessor),false);
});

await test('strict-new-identities-and-cross-contract-rejection-before-fetch',async()=>{
  assert.deepEqual(equipmentTransferIdentity(full),full.transfer);assert.deepEqual(equipmentPreviewGeometryTransferIdentity(json),json.transfer);
  assert.throws(()=>equipmentTransferIdentity(json),bad);assert.throws(()=>equipmentPreviewGeometryTransferIdentity(full),bad);
  const mutations=[m=>m.sha256='0'.repeat(64),m=>m.sha256='X'.repeat(64),m=>m.bytes++,m=>m.bytes=16*1024*1024+1,
    m=>m.path=m.path.replace('Mini','Other'),m=>m.path+='?x=1',m=>m.path='../'+m.path,
    m=>delete m.transfer,m=>m.transfer.path+='?x=1',m=>m.transfer.encoding='identity',m=>m.transfer.bytes++,m=>m.transfer.sha256='0'.repeat(64),
    m=>m.transfer.baseURL=BIQU_POPSTATION_TRANSFER_BASE.replace('biqu-popstation-0759dac8fdee8cf20c6c','da1f857f0c48606ed818'),
    m=>m.transfer.baseURL+='?x=1',m=>m.transfer.baseURL=m.transfer.baseURL.slice(0,-1),m=>delete m.transfer.baseURL,
    m=>m.transfer.baseURL=m.transfer.baseURL.replace('https:','http:'),m=>m.transfer.baseURL=m.transfer.baseURL.replace('github.io','github.io.evil.invalid')];
  let requests=0;const opts={fetchImpl:async()=>{requests++;throw Error('Unexpected network')}};
  for(const pin of [full,json])for(const mutate of mutations){const model=structuredClone(pin);mutate(model);
    await assert.rejects(pin===full?downloadEquipmentModel(model,opts):downloadEquipmentPreviewGeometry(model,opts));}
  assert.equal(requests,0);
});

function fixture(){
  const n=preview.vertices,p=new Array(n*3).fill(0),normals=new Array(n*3).fill(0),indices=[],sourceLeaves=[];
  for(let i=0;i<n;i++)normals[i*3+1]=1;
  for(let a=0;a<3;a++){p[a]=preview.boundsM.min[a];p[3+a]=preview.boundsM.max[a];}
  let vo=0,io=0;
  for(let i=0;i<70;i++){
    const vc=i===69?n-vo:1,ic=i===69?preview.triangles*3-io:3;
    sourceLeaves.push({nodeIndex:i+1,meshIndex:i%30,sourceInstanceIndex:i,sourceInstanceLabel:'0:1:1:1:'+i,
      sourceDefinitionLabel:'0:1:1:'+(i%30),vertexOffset:vo,vertexCount:vc,indexOffset:io,indexCount:ic});
    for(let k=0;k<ic;k++)indices.push(vo);vo+=vc;io+=ic;
  }
  return {schema:preview.schema,units:'m',up:'+Y',front:'+Z',rootPivotM:[0,0,0],sourceSha256:BIQU_POPSTATION_SOURCE.sha256,
    fullModelSha256:full.sha256,boundsM:structuredClone(preview.boundsM),sourceLeaves,positionsM:p,normals,indices};
}
await test('strict-schema-finite-index-unit-normal-bounds-correspondence-and-array-receipts',async()=>{
  const input=fixture();
  const mutate=async(object,key,value)=>{
    const old=Object.getOwnPropertyDescriptor(object,key);Object.defineProperty(object,key,{value,writable:true,enumerable:true,configurable:true});
    try{await assert.rejects(validateBiquPreview(input),bad)}finally{if(old)Object.defineProperty(object,key,old);else delete object[key]}
  };
  for(const [key,value]of [['schema','other'],['units','mm'],['up','+Z'],['front','-Z'],['sourceSha256','0'.repeat(64)],
    ['fullModelSha256','0'.repeat(64)],['unexpected',true]])await mutate(input,key,value);
  await mutate(input.rootPivotM,0,1);
  await mutate(input.positionsM,6,Infinity);await mutate(input.positionsM,6,NaN);await mutate(input.positionsM,6,1e-100);
  await mutate(input.positionsM,6,1e30);await mutate(input.normals,0,2);
  await mutate(input.indices,0,-1);await mutate(input.indices,0,.5);await mutate(input.indices,0,preview.vertices);
  await mutate(input.sourceLeaves[0],'sourceInstanceIndex',69);await mutate(input.sourceLeaves[0],'vertexOffset',1);
  await mutate(input.sourceLeaves[0],'sourceInstanceLabel','https://invalid.invalid/source.step');
  await mutate(input,'sourceLeaves',input.sourceLeaves.slice(0,69));await mutate(input,'positionsM',new Float32Array(input.positionsM));
  const old=Object.getOwnPropertyDescriptor(input.normals,'0');Object.defineProperty(input.normals,'0',{get(){throw Error('getter called')},configurable:true,enumerable:true});
  try{await assert.rejects(validateBiquPreview(input),bad)}finally{Object.defineProperty(input.normals,'0',old)}
  // Structurally valid synthetic arrays still cannot pass actual receipts.
  await assert.rejects(validateBiquPreview(input),bad);
  const signal=AbortSignal.abort();await assert.rejects(validateBiquPreview(input,{signal}),aborted);
});

await test('abort-before-network-and-last-subscriber-cancellation-and-retry',async()=>{
  let calls=0,underlying;
  const cache=createBiquPreviewCache({download:async(_pin,{signal})=>{
    calls++;underlying=signal;return new Promise((_,reject)=>signal.addEventListener('abort',()=>reject(signal.reason),{once:true}));}});
  await assert.rejects(cache.prepare({signal:AbortSignal.abort()}),aborted);assert.equal(calls,0);
  for(const control of [{signal:{}},{onProgress:null}])await assert.rejects(cache.prepare(control),TypeError);
  const a=new AbortController(),b=new AbortController(),one=cache.prepare({signal:a.signal}),two=cache.prepare({signal:b.signal});
  await Promise.resolve();assert.equal(calls,1);a.abort();await assert.rejects(one,aborted);assert.equal(underlying.aborted,false);
  b.abort();await assert.rejects(two,aborted);assert.equal(underlying.aborted,true);assert.equal(cache.isPrepared(),false);
  const c=new AbortController(),retry=cache.prepare({signal:c.signal});await Promise.resolve();assert.equal(calls,2);c.abort();await assert.rejects(retry,aborted);
});

await test('failure-retry-and-progress-exceptions-never-install-partial-arrays',async()=>{
  let calls=0;const cache=createBiquPreviewCache({download:async(_pin,{onProgress})=>{calls++;onProgress({phase:'download',percent:10});throw Error('Synthetic network failure')}});
  await assert.rejects(cache.prepare(),/Synthetic network/);await assert.rejects(cache.prepare(),/Synthetic network/);assert.equal(calls,2);
  await assert.rejects(cache.prepare({onProgress(){throw Error('Progress failure')}}),/Progress failure/);
  assert.equal(cache.isPrepared(),false);assert.deepEqual(cache.getParts(),[]);assert(Object.isFrozen(cache.getParts()));
});

await test('new-pinned-transfers-reject-corrupt-bodies-and-cancel-pending-read',async()=>{
  for(const pin of [full,json]){
    let canceled=0,requests=0;
    const download=pin===full?downloadEquipmentModel:downloadEquipmentPreviewGeometry;
    const response=(url,body)=>{
      const r=new Response(body);Object.defineProperty(r,'url',{value:url.href});return r;
    };
    await assert.rejects(download(pin,{fetchImpl:async url=>{
      requests++;return response(url,new Uint8Array(pin.transfer.bytes));
    }}),bad);assert.equal(requests,1);
    const controller=new AbortController();let reading;
    const ready=new Promise(resolve=>{reading=resolve});
    const pending=download(pin,{signal:controller.signal,fetchImpl:async url=>{
      return response(url,new ReadableStream({pull(){reading()},cancel(){canceled++}}));
    }});
    await ready;controller.abort();await assert.rejects(pending,aborted);assert.equal(canceled,1);
  }
});

const cacheFlag=process.argv.indexOf('--cache-dir');
if(cacheFlag!==-1)await test('actual-prepared-cache-single-draw-shared-immutable-arrays-and-abort-during-validation',async()=>{
  const input=JSON.parse(fs.readFileSync(path.resolve(process.argv[cacheFlag+1],'PopStationMini_preview_geometry.json')));let downloads=0;
  const cache=createBiquPreviewCache({download:async()=>{downloads++;return input}}),events=[];
  const [a,b]=await Promise.all([cache.prepare({onProgress:e=>events.push(e)}),cache.prepare()]);
  assert.equal(downloads,1);assert.equal(a,b);assert.equal(a.length,1);assert.equal(a[0].doubleSided,true);
  for(const field of ['positionsM','normals','indices']){
    assert(Array.isArray(a[0][field])&&Object.isFrozen(a[0][field]));assert.notEqual(a[0][field],input[field]);
  }
  assert.equal(await cache.prepare(),a);assert.equal(events.at(-1).phase,'ready');
  const previous=a[0].positionsM[0];input.positionsM[0]=123;assert.equal(a[0].positionsM[0],previous);input.positionsM[0]=previous;
  const controller=new AbortController(),pending=validateBiquPreview(input,{signal:controller.signal});controller.abort();await assert.rejects(pending,aborted);
  const owned=validateBiquPreview(input);input.positionsM[0]=123;
  const snapshot=await owned;assert.equal(snapshot.positionsM[0],previous);input.positionsM[0]=previous;
  const THREE=await import('../site/viewer/vendor-r180/three.module.js');
  const {createEquipmentMeshCache}=await import('../site/layout/layout-equipment-mesh.mjs');
  const meshCache=createEquipmentMeshCache(THREE),geometry=meshCache.get(a[0]);
  assert.equal(meshCache.get(b[0]),geometry);assert.equal(geometry.attributes.position.count,preview.vertices);
  assert.equal(geometry.index.count,preview.triangles*3);
  let disposals=0;geometry.addEventListener('dispose',()=>disposals++);meshCache.dispose();assert.equal(disposals,1);
  // Public shared row is still metadata only; isolated audit cache cannot mutate it.
  assert.equal(isBiquPreviewPrepared(),false);assert.equal(row.proxy.parts.length,0);assert.equal(typeof prepareBiquPreview,'function');
});
console.log(JSON.stringify({status:'PASS',checks,actualArrays:cacheFlag!==-1}));
