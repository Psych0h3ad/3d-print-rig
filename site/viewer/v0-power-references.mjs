import {decodeExactGzip} from './source-assembly-runtime/exact_gzip_transport.mjs';

// Complete source-owner/manual references; no geometry or electrical state.
export const v0PowerReferenceDelivery=Object.freeze({
 sourcePath:'viewer/data/v0-power-references.source.json',
 bytes:615743,sha256:'f4b455722cd1878a7de8d6566cd4ab2bd8f5c3f6b5fb0de37625cd468a4ceded',
 gzip:Object.freeze({path:'viewer/data/v0-power-references.json.gz',bytes:31361,sha256:'2367c37c716689d6fe4107f83feb7a8023dcd5d9ba987f05df0b0331586329b7'})
});
const received=new WeakSet();let pending;
const fail=message=>{throw Error('V0 manual power references: '+message)};
const aborted=signal=>signal?.throwIfAborted();
function freeze(value){if(value&&typeof value==='object'){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
async function receive({fetchImpl,signal}){
 aborted(signal);const pin=v0PowerReferenceDelivery;
 const response=await fetchImpl(new URL('./data/v0-power-references.json.gz?v='+pin.gzip.sha256.slice(0,20),import.meta.url),{cache:'no-cache',signal});
 if(!response?.ok)fail('Reference download failed');
 const length=response.headers?.get('Content-Length');
 if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==pin.gzip.bytes))fail('Changed encoded byte count');
 if(!response.body?.getReader)fail('Bounded download unavailable');
 const body=new Uint8Array(pin.gzip.bytes),reader=response.body.getReader();let used=0;
 try{
  while(true){aborted(signal);const {done,value}=await reader.read();aborted(signal);if(done)break;
   if(!(value instanceof Uint8Array)||used+value.length>body.length)fail('Encoded reference exceeds pinned budget');
   body.set(value,used);used+=value.length;
  }
  if(used!==body.length)fail('Truncated encoded reference');
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
 const raw=await decodeExactGzip(body,pin,pin.gzip,{signal});aborted(signal);
 const data=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(!data||Object.keys(data).sort().join('|')!=='voron_v02_120|voron_v02r1_120')fail('Unknown manual reference source');
 freeze(data);received.add(data);return data;
}
export function loadV0PowerReferences({fetchImpl=globalThis.fetch,signal}={}){
 if(typeof fetchImpl!=='function')return Promise.reject(Error('V0 manual power references: Download unavailable'));
 if(signal||fetchImpl!==globalThis.fetch)return receive({fetchImpl,signal});
 if(!pending)pending=receive({fetchImpl,signal}).catch(error=>{pending=undefined;throw error});
 return pending;
}
export function checkedV0PowerReferences(value){if(!value||!received.has(value))fail('Exact received reference required');return value}
