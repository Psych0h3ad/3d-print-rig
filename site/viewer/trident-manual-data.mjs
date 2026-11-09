import {decodeExactGzip} from './source-assembly-runtime/exact_gzip_transport.mjs';
const packedDelivery={"trident-250-manual":[115707,"4bb1a3608ee9ffcc3c41aca5dc504f4e59dd945a9cc8efb4ee319a293f060d73",7059,"fefe3c478ca1853d394c11e11abe66366d8995b1bd90c1e84deebfe34aa2b759"]};
const delivery=Object.fromEntries(Object.entries(packedDelivery).map(([name,[bytes,sha256,encodedBytes,encodedSHA256]])=>[name,{sourcePath:'viewer/data/'+name+'.source.json',bytes,sha256,gzip:{path:'viewer/data/'+name+'.json.gz',bytes:encodedBytes,sha256:encodedSHA256}}]));
const ref=delivery['trident-250-manual'];
const fail=s=>{throw Error('Trident manual data: '+s)};
const aborted=signal=>signal?.throwIfAborted();
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v};
freeze(delivery);export const tridentManualDelivery=delivery;
let ready,pending;
export function checkedTridentManualData(){if(!ready)fail('Exact received reference required');return ready}
async function receive({fetchImpl,signal}){
 aborted(signal);const url=new URL('./data/trident-250-manual.json.gz?v='+ref.gzip.sha256.slice(0,20),import.meta.url),response=await fetchImpl(url,{cache:'no-cache',signal});aborted(signal);
 if(!response?.ok)fail('Reference download failed');
 const length=response.headers?.get('Content-Length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==ref.gzip.bytes))fail('Changed encoded length');
 if(!response.body?.getReader)fail('Bounded reference body unavailable');
 const body=new Uint8Array(ref.gzip.bytes),reader=response.body.getReader();let used=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{})};signal?.addEventListener('abort',cancel,{once:true});
 try{while(true){aborted(signal);const{done,value}=await reader.read();aborted(signal);if(done)break;if(!(value instanceof Uint8Array)||used+value.byteLength>body.byteLength)fail('Encoded reference exceeds pin');body.set(value,used);used+=value.byteLength}if(used!==body.byteLength)fail('Truncated reference')}
 catch(error){await reader.cancel().catch(()=>{});throw error}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock()}
 const bytes=await decodeExactGzip(body,ref,ref.gzip,{signal});aborted(signal);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value?.panel?.machine!=='voron_trident_250'||Object.keys(value.filament||{}).join('|')!=='voron_trident_250')fail('Unexpected reference source');ready=freeze(value);return ready;
}
export function loadTridentManualData(options={}){
 const fetchImpl=options.fetchImpl??globalThis.fetch,signal=options.signal;if(typeof fetchImpl!=='function')return Promise.reject(Error('Trident manual data: Download unavailable'));aborted(signal);
 if(signal||Object.hasOwn(options,'fetchImpl'))return receive({fetchImpl,signal});if(ready)return Promise.resolve(ready);if(!pending)pending=receive({fetchImpl}).finally(()=>{pending=undefined});return pending;
}
