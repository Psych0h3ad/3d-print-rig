// Actual delivered JSON bodies pass through the production bounded/crypto loader.
import assert from 'node:assert/strict';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
export async function receiveBuiltV0ManualData({viewer,assemblySource,pin,SourceTextModule}){
 const matches=new SourceTextModule(assemblySource).dependencySpecifiers.filter(s=>s.startsWith('./v0-manual-data.mjs'));
 assert.equal(matches.length,1,'One exact production manual-data identity required');
 const moduleURL=new URL(matches[0],viewer),api=await import(moduleURL),bodies=new Map();let requests=0;
 for(const[name,ref]of Object.entries(api.v0ManualDelivery)){
  const url=new URL('./data/'+path.basename(ref.gzip.path)+'?v='+ref.gzip.sha256.slice(0,20),moduleURL);
  bodies.set(url.href,{name,ref,bytes:await pin(fileURLToPath(new URL('../'+ref.gzip.path,viewer)))});
 }
 const bundle=api.checkedV0ManualBundle(await api.loadV0ManualData({fetchImpl:async(url,options)=>{
  assert.equal(options.cache,'no-cache');const body=bodies.get(String(url));assert(body,'Unregistered exact manual data request');options.signal?.throwIfAborted();requests++;return new Response(body.bytes,{headers:{'Content-Length':String(body.bytes.length)}});
 }}));
 assert.equal(requests,13);assert.equal(Object.keys(bundle.data).length,13);
 return {bundle,api,summary(){return {requests,productionStreamingDecoderAndCryptoReceipt:true,decodedStageSHA256:bundle.stageSHA256,tables:[...bodies.values()].map(({name,ref,bytes})=>({name,encodedBytes:bytes.length,encodedSHA256:ref.gzip.sha256,decodedBytes:ref.bytes,decodedSHA256:ref.sha256}))}}};
}
