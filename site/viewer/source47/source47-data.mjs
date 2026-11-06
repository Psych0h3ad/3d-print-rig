import {decodeExactGzip} from '../source-assembly-runtime/exact_gzip_transport.mjs';
const packedDelivery={"input":["ROUTE350_CAPTURE_BINDINGS_V2",54606,"7d12e0537458abe969e8c97f461189fbe27f928030d2ca54a45b7aabd8757e81",9703,"79275f6caac624778ad869fa261c88ddc62bc7c0fdb64f0a4d274e8d8a04d439"],"reference":["FULL350_SOURCE_REFERENCE",50952,"5be74e659c3d88f619fdbb83e50797e6aaaa35a8dd8cab79dd43c853bbcee5d1",6565,"38d3486408948747caa32569a3b34a42dd13d334d379a310ee540aee55e93f6c"],"serviceInput":["SOURCE_SERVICE_ROUTE_BINDINGS",23155,"37cd0f66c83c104561d37897a34e2d1df92fd64b79502b5fe3dac6a33404042e",1928,"b93131624448c90bfc286b0f6583a43d5e7b3a44813d7c49f32c5ab6862af030"]};
const fail=message=>{throw Error('Source47 data: '+message)};
const abort=signal=>signal?.throwIfAborted();
function freeze(value){if(value&&typeof value==='object'){for(const child of Object.values(value))freeze(child);Object.freeze(value)}return value}
export const source47Delivery=freeze(Object.fromEntries(Object.entries(packedDelivery).map(([key,[name,bytes,sha256,encodedBytes,encodedSHA256]])=>[key,{sourcePath:'viewer/source47/data/'+name+'.json',bytes,sha256,gzip:{path:'viewer/source47/data/'+name+'.json.gz',bytes:encodedBytes,sha256:encodedSHA256}}])));
const received=new WeakSet();
export function checkedSource47Data(value){if(!value||!received.has(value))fail('Exact complete received data required');return value}
async function receive(key,pin,fetchImpl,signal){
 abort(signal);
 const response=await fetchImpl(new URL('./data/'+pin.gzip.path.split('/').at(-1)+'?v='+pin.gzip.sha256.slice(0,20),import.meta.url),{signal,cache:'no-cache'});
 abort(signal);if(!response?.ok)fail('Download failed: '+key);
 const length=response.headers?.get('Content-Length');
 if(length!=null&&(!/^\d+$/.test(length)||Number(length)!==pin.gzip.bytes))fail('Changed encoded length: '+key);
 if(!response.body?.getReader)fail('Bounded download unavailable: '+key);
 const bytes=new Uint8Array(pin.gzip.bytes),reader=response.body.getReader();let used=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{})};
 signal.addEventListener('abort',cancel,{once:true});
 try{
  while(true){abort(signal);const {done,value}=await reader.read();abort(signal);if(done)break;
   if(!(value instanceof Uint8Array)||used+value.byteLength>bytes.byteLength)fail('Encoded budget exceeded: '+key);
   bytes.set(value,used);used+=value.byteLength;
  }
  if(used!==bytes.byteLength)fail('Truncated download: '+key);
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{signal.removeEventListener('abort',cancel);reader.releaseLock()}
 const decoded=await decodeExactGzip(bytes,pin,pin.gzip,{signal});abort(signal);
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Invalid table: '+key);
 return freeze(value);
}
export async function loadSource47Data({fetchImpl=globalThis.fetch,signal}={}){
 abort(signal);if(typeof fetchImpl!=='function')fail('Download unavailable');
 const controller=new AbortController(),cancel=()=>controller.abort(signal.reason),entries=Object.entries(source47Delivery),data=Object.create(null);let next=0,failure;
 signal?.addEventListener('abort',cancel,{once:true});
 async function worker(){while(!failure&&next<entries.length){const [key,pin]=entries[next++];try{data[key]=await receive(key,pin,fetchImpl,controller.signal)}catch(error){failure??=error;controller.abort(error)}}}
 try{
  await Promise.all([worker(),worker()]);if(failure)throw failure;abort(signal);
  if(Object.keys(data).length!==entries.length)fail('Incomplete bundle');
  const binding=data.reference.binding;
  if(binding?.v14_bindings_sha256!==source47Delivery.input.sha256||binding.model_sha256!=='96309090e82efd59e214c403edf4716357a245e76a190038bea88abae315ff52'||binding.HF40_sha256!=='8c7810f878cb6e2e954cec6544fb6bdb20e54aa8d2e206beda4948c56f7197e9')fail('Changed original source binding');
  freeze(data);received.add(data);return data;
 }finally{signal?.removeEventListener('abort',cancel)}
}
