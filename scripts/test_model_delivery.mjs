import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {registeredModelDelivery,verifyDeliveredModel} from '../site/viewer/model-delivery-policy.mjs';
import {externalModelDelivery as production} from '../site/viewer/model-delivery.mjs';
const root='https://example.test/rig/',base=root+'viewer/toolchangers.html';
const [name,pin]=Object.entries(production.files)[0];
assert.equal(Object.keys(production.files).length,168);
assert.equal(registeredModelDelivery('../'+name+'?v=1',base,root,production),pin);
for(const input of ['../modules/other.glb','https://other.test/'+name,root+'sibling/'+name])assert.equal(registeredModelDelivery(input,base,root,production),null);
let rejected=0;
for(const change of [{url:pin.url.replace('raw.githubusercontent.com','example.test')},{sha256:'x'.repeat(64)},{decoded_sha256:'0'},{bytes:0},{decoded_bytes:-1}]){
 assert.throws(()=>registeredModelDelivery('../'+name,base,root,{...production,files:{[name]:{...pin,...change}}}));rejected++;
}
assert.throws(()=>registeredModelDelivery('../'+name,base,root,{...production,commit:'main'}));rejected++;
const decoded=Uint8Array.from({length:8192},(_,i)=>(i*73)%251),stored=gzipSync(decoded),sha=b=>createHash('sha256').update(b).digest('hex');
const actual={bytes:stored.byteLength,sha256:sha(stored),decoded_bytes:decoded.byteLength,decoded_sha256:sha(decoded)};
await verifyDeliveredModel(stored,actual);await verifyDeliveredModel(decoded,actual,true);
for(const[body,record,expanded]of [[stored,{...actual,sha256:'0'.repeat(64)},false],[stored.subarray(1),actual,false],[decoded,{...actual,decoded_sha256:'0'.repeat(64)},true],[decoded.subarray(1),actual,true]]){
 await assert.rejects(verifyDeliveredModel(body,record,expanded));rejected++;
}
console.log(JSON.stringify({passed:true,registered_delivery_models:168,negative_cases:rejected,scope:'Transport routing and real gzip/decoded byte integrity fixtures; not actual model/GPU evidence.'}));
