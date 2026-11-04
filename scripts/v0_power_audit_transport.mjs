// The offline release audit uses the actual delivered bytes and the production
// streamed decoder/cryptographic receipt. No raw object is injected as proof.
import assert from 'node:assert/strict';
import {fileURLToPath} from 'node:url';
export async function installPowerAuditTransport({viewer,assemblySource,pin,SourceTextModule}){
 const dependency=new SourceTextModule(assemblySource).dependencySpecifiers.filter(s=>s.startsWith('./v0-power-references.mjs'));
 assert.equal(dependency.length,1,'Exact production reference-module identity required');
 const referenceModule=await import(new URL(dependency[0],viewer));
 const delivery=referenceModule.v0PowerReferenceDelivery;
 const expected=new URL('./data/v0-power-references.json.gz?v='+delivery.gzip.sha256.slice(0,20),viewer);
 const bytes=await pin(fileURLToPath(new URL(delivery.gzip.path,new URL('../',viewer))));
 const previous=globalThis.fetch;let requests=0;
 const transport=async(url,options={})=>{assert.equal(new URL(url).href,expected.href,'Unregistered offline audit request');assert.equal(options.cache,'no-cache');options.signal?.throwIfAborted();requests++;return new Response(bytes,{headers:{'Content-Length':String(bytes.length)}});};
 globalThis.fetch=transport;
 try{const references=await referenceModule.loadV0PowerReferences();assert.equal(requests,1);return{references,delivery,summary(){return {requests,encodedBytes:bytes.length,encodedSHA256:delivery.gzip.sha256,decodedBytes:delivery.bytes,decodedSHA256:delivery.sha256,productionDecoderAndCryptoReceipt:true};},restore(){assert.equal(globalThis.fetch,transport,'Audit transport unexpectedly replaced');globalThis.fetch=previous;}};}
 catch(error){globalThis.fetch=previous;throw error;}
}
