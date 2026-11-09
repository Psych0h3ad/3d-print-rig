import {decodeExactGzip} from './source-assembly-runtime/exact_gzip_transport.mjs';
const packedDelivery={"trident-250-manual":[115707,"4bb1a3608ee9ffcc3c41aca5dc504f4e59dd945a9cc8efb4ee319a293f060d73",7059,"fefe3c478ca1853d394c11e11abe66366d8995b1bd90c1e84deebfe34aa2b759"],"trident-300-manual":[115900,"813e4a26724f4c0dd5189558dadb3f7db8da3877e64dddfd4005be3e959aa993",7277,"2b382410a49299a549f10ff237343cde8b371865217b32aac9c8d290d2451916"],"trident-350-manual":[115900,"51db22c962a96dca335b608530f9c513259df66b8c2b36ff6a8b3dd3aaae9925",7259,"e9861bd7ad58f047cc4d958d676603f524ecf4a4c50f8ea0871e934c84f1c9de"]};
const delivery=Object.fromEntries(Object.entries(packedDelivery).map(([name,[bytes,sha256,encodedBytes,encodedSHA256]])=>[name,{sourcePath:'viewer/data/'+name+'.source.json',bytes,sha256,gzip:{path:'viewer/data/'+name+'.json.gz',bytes:encodedBytes,sha256:encodedSHA256}}]));
export const tridentManualMachines=Object.freeze(['voron_trident_250','voron_trident_300','voron_trident_350']);
export const supportsTridentManual=machine=>tridentManualMachines.includes(machine);
const reference=machine=>{if(!supportsTridentManual(machine))fail('Unregistered machine');return delivery['trident-'+machine.slice(-3)+'-manual']};
const fail=s=>{throw Error('Trident manual data: '+s)};
const aborted=signal=>signal?.throwIfAborted();
const freeze=v=>{if(v&&typeof v==='object'){for(const x of Object.values(v))freeze(x);Object.freeze(v)}return v};
freeze(delivery);export const tridentManualDelivery=delivery;
const ready=new Map(),pending=new Map();
export function checkedTridentManualData(machine='voron_trident_250'){reference(machine);if(!ready.has(machine))fail('Exact received reference required');return ready.get(machine)}
async function receive({machine,fetchImpl,signal}){
 const ref=reference(machine);
 aborted(signal);const url=new URL('./data/trident-'+machine.slice(-3)+'-manual.json.gz?v='+ref.gzip.sha256.slice(0,20),import.meta.url),response=await fetchImpl(url,{cache:'no-cache',signal});aborted(signal);
 if(!response?.ok)fail('Reference download failed');
 const length=response.headers?.get('Content-Length');if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==ref.gzip.bytes))fail('Changed encoded length');
 if(!response.body?.getReader)fail('Bounded reference body unavailable');
 const body=new Uint8Array(ref.gzip.bytes),reader=response.body.getReader();let used=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{})};signal?.addEventListener('abort',cancel,{once:true});
 try{while(true){aborted(signal);const{done,value}=await reader.read();aborted(signal);if(done)break;if(!(value instanceof Uint8Array)||used+value.byteLength>body.byteLength)fail('Encoded reference exceeds pin');body.set(value,used);used+=value.byteLength}if(used!==body.byteLength)fail('Truncated reference')}
 catch(error){await reader.cancel().catch(()=>{});throw error}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock()}
 const bytes=await decodeExactGzip(body,ref,ref.gzip,{signal});aborted(signal);const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
 if(value?.panel?.machine!==machine||Object.keys(value.filament||{}).join('|')!==machine)fail('Unexpected reference source');const result=freeze(value);ready.set(machine,result);return result;
}
export function loadTridentManualData(options={}){
 const machine=options.machine??'voron_trident_250',fetchImpl=options.fetchImpl??globalThis.fetch,signal=options.signal;reference(machine);if(typeof fetchImpl!=='function')return Promise.reject(Error('Trident manual data: Download unavailable'));aborted(signal);
 if(signal||Object.hasOwn(options,'fetchImpl'))return receive({machine,fetchImpl,signal});if(ready.has(machine))return Promise.resolve(ready.get(machine));if(!pending.has(machine))pending.set(machine,receive({machine,fetchImpl}).finally(()=>{pending.delete(machine)}));return pending.get(machine);
}
