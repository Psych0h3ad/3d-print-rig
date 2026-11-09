import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {execFileSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {loadTridentManualData,checkedTridentManualData,tridentManualDelivery} from '../site/viewer/trident-manual-data.mjs';
import {decodeExactGzip} from '../site/viewer/source-assembly-runtime/exact_gzip_transport.mjs';
const raw=await fs.readFile(new URL('../site/viewer/data/trident-250-manual.source.json',import.meta.url));
// Python is the pinned build producer; another zlib build is not an authority
// for changing its encoded bytes or searching compression parameters.
const fixture=process.env.RIG_TRIDENT_MANUAL_REFERENCE_FIXTURE?await fs.readFile(process.env.RIG_TRIDENT_MANUAL_REFERENCE_FIXTURE,'utf8'):execFileSync(process.env.PYTHON||'python',['-B',fileURLToPath(new URL('prepare_trident_manual_fixture.py',import.meta.url))],{encoding:'utf8',maxBuffer:2*1024*1024,timeout:12000,windowsHide:true});
const encoded=Buffer.from(JSON.parse(fixture)['trident-250-manual'],'base64');
const ref=tridentManualDelivery['trident-250-manual'];assert.equal(createHash('sha256').update(encoded).digest('hex'),ref.gzip.sha256);
const response=(body=encoded,headers={})=>new Response(body,{status:200,headers:{'Content-Length':String(body.byteLength),...headers}});
assert.throws(()=>checkedTridentManualData());
const actual=await loadTridentManualData({fetchImpl:async()=>response()});assert.deepEqual(actual,JSON.parse(raw));assert(Object.isFrozen(actual.panel.stages));assert.deepEqual(Object.keys(actual.filament),['voron_trident_250']);
let cases=1;
for(const reply of [()=>response(encoded,{'Content-Length':String(encoded.length+1)}),()=>response(new Uint8Array(encoded.length+1),{'Content-Length':String(encoded.length)}),()=>response(encoded.subarray(0,-1),{'Content-Length':String(encoded.length)}),()=>{const b=encoded.slice();b[30]^=1;return response(b)},()=>new Response(null,{status:503})]){
 await assert.rejects(()=>loadTridentManualData({fetchImpl:async()=>reply()}));assert.equal(checkedTridentManualData(),actual);cases++;
}
for(const when of ['before','after-fetch','during-body']){
 const controller=new AbortController();if(when==='before')controller.abort();
 await assert.rejects(async()=>loadTridentManualData({signal:controller.signal,fetchImpl:async()=>{if(when==='after-fetch')controller.abort();if(when!=='during-body')return response();return new Response(new ReadableStream({pull(c){controller.abort();c.enqueue(encoded.subarray(0,32));c.close()}}),{headers:{'Content-Length':String(encoded.length)}})}}),e=>e.name==='AbortError');assert.equal(checkedTridentManualData(),actual);cases++;
}
await assert.rejects(()=>decodeExactGzip(encoded,{...ref,sha256:'0'.repeat(64)},ref.gzip));cases++;
console.log(JSON.stringify({cases,exactDecodedSource:true,encodedBytes:encoded.length,scope:'Pinned reference transport/cancellation software regression; no model or physical-fit claim'}));
const allFixtures=JSON.parse(fixture),received=new Map(),requests=[];
await Promise.all([300,350].map(async size=>{
 const machine='voron_trident_'+size,body=Buffer.from(allFixtures['trident-'+size+'-manual'],'base64');
 const value=await loadTridentManualData({machine,fetchImpl:async url=>{requests.push(new URL(url).pathname);return response(body)}});
 assert.equal(value.panel.machine,machine);assert.deepEqual(Object.keys(value.filament),[machine]);assert.equal(checkedTridentManualData(machine),value);received.set(machine,value);cases++;
}));
assert(requests.some(url=>url.endsWith('/trident-300-manual.json.gz')));assert(requests.some(url=>url.endsWith('/trident-350-manual.json.gz')));
for(const size of [300,350]){
 const machine='voron_trident_'+size,other=size===300?350:300,wrong=Buffer.from(allFixtures['trident-'+other+'-manual'],'base64');
 await assert.rejects(async()=>loadTridentManualData({machine,fetchImpl:async()=>response(wrong)}));assert.equal(checkedTridentManualData(machine),received.get(machine));cases++;
 const signal=AbortSignal.abort();await assert.rejects(async()=>loadTridentManualData({machine,signal,fetchImpl:async()=>{throw Error('Must not fetch cancelled size')}}),e=>e.name==='AbortError');assert.equal(checkedTridentManualData(machine),received.get(machine));cases++;
}
assert.equal(checkedTridentManualData(),actual);let fetchedUnknown=false;
assert.throws(()=>loadTridentManualData({machine:'voron_trident_999',fetchImpl:async()=>{fetchedUnknown=true;return response()}}),/Unregistered/);assert.equal(fetchedUnknown,false);cases++;
// Exercise the production shared-fetch path too: explicit fetchImpl controls
// above deliberately bypass request coalescing and therefore do not prove it.
const pendingReceiver=await import(new URL('../site/viewer/trident-manual-data.mjs?size-pending-regression',import.meta.url)),savedFetch=globalThis.fetch,pendingRequests=[];
try{
 globalThis.fetch=async url=>{const path=new URL(url).pathname,size=path.match(/trident-(300|350)-manual\.json\.gz$/)?.[1];assert(size);pendingRequests.push(size);await Promise.resolve();return response(Buffer.from(allFixtures['trident-'+size+'-manual'],'base64'))};
 const [a,b,c]=await Promise.all([pendingReceiver.loadTridentManualData({machine:'voron_trident_300'}),pendingReceiver.loadTridentManualData({machine:'voron_trident_300'}),pendingReceiver.loadTridentManualData({machine:'voron_trident_350'})]);
 assert.equal(a,b);assert.notEqual(a,c);assert.equal(a.panel.machine,'voron_trident_300');assert.equal(c.panel.machine,'voron_trident_350');assert.deepEqual(pendingRequests.sort(),['300','350']);
 assert.equal(await pendingReceiver.loadTridentManualData({machine:'voron_trident_300'}),a);assert.equal(await pendingReceiver.loadTridentManualData({machine:'voron_trident_350'}),c);assert.equal(pendingRequests.length,2);cases++;
}finally{globalThis.fetch=savedFetch}
console.log(JSON.stringify({cases,machines:['voron_trident_250','voron_trident_300','voron_trident_350'],scope:'Independent per-size exact body/ready-cache ownership, concurrent300/350receipt, wrong-size body and prefetch cancellation refusals. No native fit claim.'}));
