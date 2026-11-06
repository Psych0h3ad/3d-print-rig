import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {loadSource47Data,checkedSource47Data,source47Delivery} from '../site/viewer/source47/source47-data.mjs';
import {source47TransportFixture} from './source47_transport_fixture.mjs';
const hash=b=>createHash('sha256').update(b).digest('hex');
const fixture=await source47TransportFixture(),packets=new Map();
for(const [key,p]of Object.entries(source47Delivery)){
 const bytes=Buffer.from(fixture[key],'base64');assert.equal(bytes.length,p.gzip.bytes);assert.equal(hash(bytes),p.gzip.sha256);
 packets.set(key,{bytes,p,url:new URL('./data/'+p.gzip.path.split('/').at(-1)+'?v='+p.gzip.sha256.slice(0,20),new URL('../site/viewer/source47/source47-data.mjs',import.meta.url)).href});
}
let requests=0,active=0,peak=0;
function fetcher(target,mode){return async(url,{signal,cache})=>{
 const found=[...packets].find(([,p])=>p.url===String(url));assert(found,'Only exact three registered gzip requests');const [key,p]=found;
 assert.equal(cache,'no-cache');requests++;active++;peak=Math.max(peak,active);await Promise.resolve();active--;signal.throwIfAborted();
 let body=p.bytes,headers={'Content-Length':String(body.length)};
 if(key===target){
  if(mode==='http')return new Response('',{status:503});
  if(mode==='short')body=body.subarray(0,-1);
  if(mode==='over')body=Buffer.concat([body,Buffer.from([0])]);
  if(mode==='length')headers['Content-Length']='999999999';
  if(mode==='bad-hash'){body=Buffer.from(body);body[body.length>>1]^=1;}
  if(mode==='wrong-table')body=packets.get(key==='input'?'reference':'input').bytes;
  if(mode==='no-reader')return {ok:true,headers:{get:()=>null},body:{}};
 }
 return new Response(body,{headers});
}}
assert.throws(()=>checkedSource47Data({input:{},reference:{},serviceInput:{}}));
const a=await loadSource47Data({fetchImpl:fetcher()});assert.equal(checkedSource47Data(a),a);assert.equal(requests,3);assert(peak<=2);
const initialBundleFetchConcurrency=peak;
for(const [key,p]of Object.entries(source47Delivery)){
 const original=await fs.readFile(new URL('../site/'+p.sourcePath,import.meta.url));assert.equal(hash(original),p.sha256);
 assert.deepEqual(a[key],JSON.parse(original));assert(Object.isFrozen(a[key]));assert.throws(()=>{a[key].changed=true});
}
assert(Object.isFrozen(a));assert.throws(()=>checkedSource47Data(structuredClone(a)));assert.equal(a.reference.binding.v14_bindings_sha256,source47Delivery.input.sha256);
let negativeControls=2;
for(const key of packets.keys())for(const mode of ['http','short','over','length','bad-hash','wrong-table','no-reader']){
 await assert.rejects(loadSource47Data({fetchImpl:fetcher(key,mode)}));assert.equal(checkedSource47Data(a),a);negativeControls++;
}
const before=requests,already=new AbortController();already.abort();await assert.rejects(loadSource47Data({fetchImpl:fetcher(),signal:already.signal}));assert.equal(requests,before);negativeControls++;
let started=0,ended=0;const mid=new AbortController();
const waiting=async(url,{signal})=>{started++;try{await new Promise((resolve,reject)=>{signal.addEventListener('abort',()=>reject(signal.reason),{once:true});signal.throwIfAborted()})}finally{ended++}};
const pending=loadSource47Data({fetchImpl:waiting,signal:mid.signal});await Promise.resolve();assert.equal(started,2);mid.abort();await assert.rejects(pending);assert.equal(ended,2);negativeControls++;
// One concurrent failure may not cancel or replace a different successful request.
const [bad,good]=await Promise.allSettled([loadSource47Data({fetchImpl:fetcher('serviceInput','bad-hash')}),loadSource47Data({fetchImpl:fetcher()})]);
assert.equal(bad.status,'rejected');assert.equal(good.status,'fulfilled');assert.deepEqual(good.value,a);assert.notEqual(good.value,a);negativeControls++;
const retry=await loadSource47Data({fetchImpl:fetcher()});assert.deepEqual(retry,a);
console.log(JSON.stringify({passed:true,exactTables:3,defaultBytesPreserved:true,originalSavedBindingPreserved:true,deepFrozenReceivedIdentity:true,negativeControls,concurrentRequestsIsolated:true,abortSiblingsRetired:ended,retryAfterFailure:true,initialBundleFetchConcurrency,productionDecoderUsed:true,actualModelOrBrowserOrNativeFitQualified:false,scope:'Current production gzip receiver, original byte/hash identity, full table values, bounded streams and receipt lifecycle on controlled network fixtures.'}));
