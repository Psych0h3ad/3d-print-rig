import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {gzipSync,gunzipSync} from 'node:zlib';
import test from 'node:test';
import {fetchPinnedSource} from './fetch_pinned_source.mjs';

const url='https://psych0h3ad.github.io/3d-print-rig-community-models/ender3/source.fixture';
const body=Buffer.from('exact public source fixture\n');
const pin={bytes:body.length,sha256:createHash('sha256').update(body).digest('hex')};
function response(data=body,{status=200,headers={},source=url}={}){
 const reply=new Response(data,{status,headers});Object.defineProperty(reply,'url',{value:source});return reply;
}
function transport(sequence){
 const calls=[],sleeps=[];
 return {calls,sleeps,fetchImpl:async(...args)=>{
  calls.push(args);const next=sequence.shift();
  if(next instanceof Error)throw next;
  return typeof next==='function'?next(...args):next;
 },sleep:async ms=>{sleeps.push(ms);}};
}

test('first success streams exact bytes and checksum without a retry',async()=>{
 const io=transport([response(body,{headers:{'Content-Length':String(body.length)}})]);
 assert.deepEqual(await fetchPinnedSource(url,pin,io),body);assert.equal(io.calls.length,1);assert.deepEqual(io.sleeps,[]);
});

test('each allowed HTTP status and timeout retries only the same URL, at most three times',async()=>{
 const errors=[...[429,502,503,504].map(status=>()=>response('unavailable',{status})),
  ()=>new DOMException('timeout','TimeoutError'),
  ()=>Object.assign(new TypeError('fetch failed'),{cause:{code:'UND_ERR_CONNECT_TIMEOUT'}})];
 for(const error of errors){
  const io=transport([error(),error(),response()]);
  assert.deepEqual(await fetchPinnedSource(url,pin,io),body);assert.equal(io.calls.length,3);assert.deepEqual(io.sleeps,[1000,3000]);
  for(const [requested,options]of io.calls){assert.equal(requested,url);assert.equal(options.redirect,'error');assert.equal(options.headers['Accept-Encoding'],'identity');}
 }
 for(const status of [429,502,503,504]){
  const io=transport([response('',{status}),response('',{status}),response('',{status}),response()]);
  await assert.rejects(fetchPinnedSource(url,pin,io),new RegExp('HTTP '+status));assert.equal(io.calls.length,3);assert.deepEqual(io.sleeps,[1000,3000]);
 }
});

test('bad SHA, short/oversized body, invalid length, and changed URL never retry',async()=>{
 for(const bad of [response(Buffer.alloc(body.length,120)),response(body.subarray(1)),response(Buffer.concat([body,Buffer.from('x')])),
  response(body,{headers:{'Content-Length':'NaN'}}),response(body,{headers:{'Content-Length':String(body.length+1)}}),
  response(body,{source:'https://unapproved.example/other'})]){
  const io=transport([bad,response()]);await assert.rejects(fetchPinnedSource(url,pin,io));assert.equal(io.calls.length,1);assert.deepEqual(io.sleeps,[]);
 }
});

test('nontransient HTTP, certificate, cancellation, and unclassified errors never retry',async()=>{
 for(const bad of [...[404,408,425,500].map(status=>response('',{status})),
  Object.assign(new TypeError('certificate failure'),{cause:{code:'CERT_HAS_EXPIRED'}}),
  new DOMException('canceled','AbortError'),new TypeError('unclassified transport failure')]){
  const io=transport([bad,response()]);await assert.rejects(fetchPinnedSource(url,pin,io));assert.equal(io.calls.length,1);assert.deepEqual(io.sleeps,[]);
 }
});

test('body timeout discards prior partial chunks before a successful fresh attempt',async()=>{
 const partial=new ReadableStream({start(controller){controller.enqueue(body.subarray(0,4));controller.error(new DOMException('body timeout','TimeoutError'));}});
 const io=transport([response(partial),response()]);
 assert.deepEqual(await fetchPinnedSource(url,pin,io),body);assert.equal(io.calls.length,2);assert.deepEqual(io.sleeps,[1000]);
});

test('deadline covers stalled headers and stalled streaming body, with exactly three aborts',async()=>{
 for(const stalledBody of [false,true]){
  let calls=0,aborts=0;const sleeps=[];
  const fetchImpl=async(_, {signal})=>{
   calls++;
   if(!stalledBody)return new Promise((_,reject)=>signal.addEventListener('abort',()=>{aborts++;reject(signal.reason);},{once:true}));
   return response(new ReadableStream({start(controller){controller.enqueue(body.subarray(0,4));signal.addEventListener('abort',()=>{aborts++;controller.error(signal.reason);},{once:true});}}));
  };
  await assert.rejects(fetchPinnedSource(url,pin,{fetchImpl,timeoutMs:10,sleep:async ms=>sleeps.push(ms)}),{name:'TimeoutError'});
  assert.equal(calls,3);assert.equal(aborts,3);assert.deepEqual(sleeps,[1000,3000]);
 }
});

test('nonfinite, unsafe and invalid pins/timeouts and unsafe sources fail before transport',async()=>{
 const io=transport([]);
 for(const bytes of [NaN,Infinity,-Infinity,0,-1,1.5,true,Number.MAX_SAFE_INTEGER+1])await assert.rejects(fetchPinnedSource(url,{...pin,bytes},io));
 for(const sha256 of [null,'a'.repeat(63),'A'.repeat(64),'x'.repeat(64)])await assert.rejects(fetchPinnedSource(url,{...pin,sha256},io));
 for(const timeoutMs of [NaN,Infinity,0,-1,45001,true])await assert.rejects(fetchPinnedSource(url,pin,{...io,timeoutMs}));
 for(const source of ['http://example.com/body','https://user:password@example.com/body','https://example.com/body#fragment'])await assert.rejects(fetchPinnedSource(source,pin,io));
 assert.equal(io.calls.length,0);assert.deepEqual(io.sleeps,[]);
});

test('actual Ender consumer keeps exact cache, raw pins, and decoded gzip gates',async()=>{
 // Exercise the actual input-consumer closure without loading CAD or running the triangle audit.
 const source=fs.readFileSync(new URL('./audit_ender_bowden.mjs',import.meta.url),'utf8');
 const start=source.indexOf(' const pins={},checked=async name=>{'),end=source.indexOf(' const manifest=',start);
 assert(start>=0&&end>start,'Missing actual Ender input consumer');
 const factory=new Function('spec','index','assets','fs','path','assert','hash','gunzipSync','fetchPinnedSource',source.slice(start,end)+'return {checked,pins};');
 const hash=b=>createHash('sha256').update(b).digest('hex'),raw=gzipSync(body);
 const rawPin={path:'ender3/source.fixture',encoding:'gzip',bytes:raw.length,sha256:hash(raw),decoded_bytes:body.length,decoded_sha256:hash(body)};
 const spec={files:{fixture:rawPin}},index={base_url:'https://psych0h3ad.github.io/3d-print-rig-community-models/'};
 const bind=(files,assets,io)=>factory({files},index,assets,fs,path,assert,hash,gunzipSync,(u,p)=>fetchPinnedSource(u,p,io));
 const io=transport([response('',{status:503}),response(raw)]),consumer=bind(spec.files,undefined,io);
 assert.deepEqual(await consumer.checked('fixture'),body);assert.equal(io.calls.length,2);
 assert.deepEqual(consumer.pins.fixture,{sha256:rawPin.sha256,bytes:rawPin.bytes,decoded_sha256:rawPin.decoded_sha256});
 for(const changed of [{decoded_bytes:body.length+1},{decoded_sha256:'0'.repeat(64)}]){
  const io=transport([response(raw),response(raw)]),consumer=bind({fixture:{...rawPin,...changed}},undefined,io);
  await assert.rejects(consumer.checked('fixture'));assert.equal(io.calls.length,1);assert.deepEqual(io.sleeps,[]);
 }
 const assets=fs.mkdtempSync(path.join(os.tmpdir(),'source-fetch-cache-'));
 try{
  const cache=path.join(assets,rawPin.path);fs.mkdirSync(path.dirname(cache),{recursive:true});fs.writeFileSync(cache,raw);
  const io=transport([]);assert.deepEqual(await bind(spec.files,assets,io).checked('fixture'),body);assert.equal(io.calls.length,0);
  fs.writeFileSync(cache,Buffer.alloc(raw.length));
  await assert.rejects(bind(spec.files,assets,io).checked('fixture'));assert.equal(io.calls.length,0,'Corrupt cache must not fall back to network');
  assert.deepEqual(fs.readFileSync(cache),Buffer.alloc(raw.length),'Corrupt cache must not be overwritten');
 }finally{
  assert.equal(path.dirname(path.resolve(assets)),path.resolve(os.tmpdir()));
  assert(path.basename(assets).startsWith('source-fetch-cache-'));
  fs.rmSync(assets,{recursive:true,force:true});
 }
});
