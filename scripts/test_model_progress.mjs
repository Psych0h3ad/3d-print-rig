import assert from 'node:assert/strict';
import {gzipSync} from 'node:zlib';
import {beginModelLoading,createModelProgress,readModelBytes} from '../site/viewer/model-progress.mjs';

function chunked(chunks,headers={}) {
  return new Response(new ReadableStream({start(c){for(const chunk of chunks)c.enqueue(Uint8Array.from(chunk));c.close()}}),{headers});
}
const events=[],progress=createModelProgress({a:{bytes:4},b:{bytes:6}},s=>events.push(s));
assert.equal(progress.snapshot().percent,0);
assert.deepEqual(await readModelBytes(chunked([[1,2],[3,4]]),{spec:{bytes:4},onProgress:e=>progress.update('a',e)}),Uint8Array.of(1,2,3,4));
assert.equal(progress.snapshot().percent,40,'Completing one file must not report the entire assembly as downloaded');
await readModelBytes(chunked([[5,6],[7,8,9,10]],{'content-length':'6'}),{onProgress:e=>progress.update('b',e)});
assert.equal(progress.snapshot().percent,100);assert(events.some(s=>s.percent===60));
progress.assembling();assert.equal(progress.snapshot().phase,'assembly');
const previous=events.length;progress.close();progress.update('a',{loaded:0,total:4});assert.equal(events.length,previous);

for(const [headers,spec,expected] of [
  [{},undefined,0],
  [{'content-length':'1','content-encoding':'gzip'},undefined,0],
  [{'content-length':'1','content-encoding':'gzip'},{encoding:'gzip',bytes:1,decoded_bytes:4},0],
  [{'content-length':'4'},undefined,4],
]) {
  const seen=[];await readModelBytes(chunked([[1,2],[3,4]],headers),{spec,onProgress:e=>seen.push(e)});
  assert.equal(seen[0].total,expected);assert(seen.at(-1).received);assert.equal(seen.at(-1).loaded,4);
}
for(const encoding of ['gzip','br']) {
  const seen=[];
  await readModelBytes(chunked([[0x1f],[0x8b,1,2]],{'content-encoding':encoding,'content-length':'2'}),{spec:{encoding:'gzip',bytes:4,decoded_bytes:40},onProgress:e=>seen.push(e)});
  assert.equal(seen[0].total,0);assert.equal(seen.at(-1).total,4,'Outer HTTP encoding must not confuse gzip payload bytes with decoded CAD bytes');
}
const decoded=[];
await readModelBytes(chunked([[0x67],[0x6c,0x54,0x46]],{'content-encoding':'gzip','content-length':'2'}),{spec:{encoding:'gzip',bytes:2,decoded_bytes:4},onProgress:e=>decoded.push(e)});
assert.equal(decoded.at(-1).total,4);
const unknown=createModelProgress({a:{}});
await readModelBytes(chunked([[1],[2]]),{onProgress:e=>{unknown.update('a',e);assert.equal(unknown.snapshot().percent,e.received?100:null)}});
const mismatch=[];await readModelBytes(chunked([[1,2,3,4]],{'content-length':'1'}),{onProgress:e=>mismatch.push(e)});
assert.equal(mismatch.at(-2).total,0,'An unexpectedly decoded response must not show a false percentage');
const broken=new Response(new ReadableStream({start(c){c.error(new Error('Aborted transfer'))}}));
await assert.rejects(readModelBytes(broken),/Aborted transfer/);

// The actual presenter: weighted concurrent jobs, cleanup, fresh stages and
// no stale updates from a failed/disposed workspace.
class Element {
  constructor(tag){this.tagName=tag;this.children=[];this.attrs={};this.isConnected=true;this.textContent='';}
  append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n)}}
  setAttribute(k,v){this.attrs[k]=v} removeAttribute(k){delete this.attrs[k]}
  remove(){this.isConnected=false;if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this)}
}
let stage=new Element('stage');
const document={getElementById:()=>stage,createElement:tag=>new Element(tag)};
const first=beginModelLoading({a:{bytes:10}},{document}),second=beginModelLoading({b:{bytes:30}},{document});
assert.equal(stage.children.length,1);
first.update('a',{loaded:10,total:10,received:true});first.assembling();first.finish();
second.update('b',{loaded:10,total:30});assert.equal(stage.children[0].children[1].textContent,'50%');
second.update('b',{loaded:30,total:30,received:true});second.assembling();
assert.equal(stage.children[0].children[0].textContent,'モデルを組み立て中…');assert.equal(stage.children[0].children[1].textContent,'100%');
second.finish();assert.equal(stage.children.length,0);
const old=beginModelLoading({a:{}},{document});const oldStage=stage;oldStage.isConnected=false;stage=new Element('stage');
const next=beginModelLoading({a:{bytes:10}},{document});old.update('a',{loaded:5,total:10});old.finish();
assert.equal(stage.children[0].children[1].textContent,'0%');next.finish();assert.equal(stage.children.length,0);

// Production GLB loader: byte identity, gzip, HTTP auto-decoding, raw fallback,
// parse failure and HTTP failure all use the same progress cleanup.
globalThis.location=new URL('https://fixture.test/viewer/');globalThis.document=document;
const native=Uint8Array.from([0x67,0x6c,0x54,0x46,1,2,3,4]),gzip=gzipSync(native);let mode='gzip';
globalThis.fetch=async url=>{
  if(String(url).includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip',sha256:'a'.repeat(64)});
  if(mode==='fail')return new Response(null,{status:503});
  if(mode==='fallback'&&String(url).includes('.gz'))return new Response(null,{status:404});
  const bytes=mode==='gzip'?gzip:native;return new Response(bytes,{headers:{'content-length':String(bytes.length)}});
};
const {loadModel}=await import('../site/viewer/model-loader.js');
for(mode of ['gzip','decoded','fallback']) {
  const transfers=[];
  const result=await loadModel({parseAsync:async(buffer,base)=>{assert.deepEqual(new Uint8Array(buffer),native);assert.equal(base,'https://fixture.test/');return 'native model'}},'../model.glb',e=>transfers.push(e));
  assert.equal(result,'native model');assert(transfers.at(-1).received);assert.equal(stage.children.length,0);
}
await assert.rejects(loadModel({parseAsync:async()=>{throw Error('Invalid CAD')}},'../model.glb'),/Invalid CAD/);assert.equal(stage.children.length,0);
mode='fail';await assert.rejects(loadModel({},'../model.glb'),/503/);assert.equal(stage.children.length,0);
console.log('Model progress: byte-weighted batches, known/unknown size, HTTP decompression, gzip/raw identity, failures and stale UI cleanup passed.');
