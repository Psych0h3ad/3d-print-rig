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
