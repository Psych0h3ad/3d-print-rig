import {decodeExactGzip} from './source-assembly-runtime/exact_gzip_transport.mjs';
const packedDelivery={"v0-fan-assembly":[11466,"67444c089c78524d834b7bf0641ea44d37497a000533c205f9136657877c55ba",1839,"9b5149a3215bfe03814b58ba5384c2454eb97a45b77c149f9290c6c1cfa4e94f"],"v0-enclosure-assembly":[46952,"98f232ddb517a2f3567e49969f1f7fd69cbbf43bdd630d6cefb3f4637827aec9",4689,"95695333db88ca0cdf58c6f5f6bc3218300a9b186f6cd39239a2f1b1769e4771"],"v0-panel-closure":[28666,"1670255062c94396c878d8cf2f8d7641d7139c2d49e6229a5180181717c21fd2",4827,"d80f797dce8b3aab9e33b381950f47dcf24d11797841fe207f76e742a6bcf13b"],"v0-panel-door":[118770,"3a75177508aae9186fac30673ddd2a8b1a84d6972a396a05c4b8b4692b4a7059",14777,"e720852b9711b5fca068d583fc4d5b5aa1136cd0a1bd496ad7b8758bcedaf7db"],"v0-tophat-assembly":[221308,"128ae71c503c951561a31f2aef51fd344cb3ce831c29ba1c60de4270ff831d09",23091,"111e5956151fa6965ff4d3b458c4956da1d3c7ebc2fa3e39e27a607d67c0618c"],"v0-spool-assembly":[18670,"717f6bb092ca1fb5d46dfc99bfab6afcb7274ee8b0227cc406c185e1f4bc4028",3270,"b37643d72cba2782e3c62526b92071f8a7b2ebeb95fcf3e17f4bc6b0cb2948ca"],"v0-assembly-stages":[353076,"7cb12de4b91de4fa4b77c8479ab30eed7eef9cc4cfe108f2601bd2d003d6f7f6",62989,"8b78bea9c16b842fc6c3255fb9e2daade0b696977d500de8eda4d30964eea4d4"],"v0-fan-copy":[10920,"2b848764462f795ce74218d4b3b9fb2498c78a203037e7b21b61c07a185b9306",4228,"97420c6658ee75c7b0a8b424d74c23c7557ed867c9b3f9a761afdf953c9a1872"],"v0-enclosure-copy":[28076,"e6d52fdb86f79aab2babbc3074a2bd17c1fcb566164098dd6e62bea817ae97fc",9861,"efa022608ab319d699a6aa3313993cff902557f455d5298ced5d1f2615dd0539"],"v0-panel-closure-copy":[16344,"38163de79a0d8c443c02d708bed36bc49b5275252e944453045ff542c25ae54e",6993,"e0cf0e24f7883741b84f64983613ab2ae09427f7feed1cc89052a5a7ad331ffd"],"v0-panel-door-copy":[15645,"394d718fd2bd54bdbf29a6b157d3aa2888c0202ea60b8a41384c3d47eac136e6",5752,"aa951d10b209d1ebd43d2fae1eec11f3926afab9dc60d3f52031ed4665f8e719"],"v0-tophat-copy":[31000,"eefc6f498c285ba03a6ed2df7dc655dd7328ce86a55f6f21efc781ba0abbd40c",9939,"2388f7665e5ef5194647f6c7dd5d08701b99ccb36a9f30fafdd7d23dae4d4f2f"],"v0-spool-copy":[13210,"0b2664bde977d85e5f5eef3eb19c8132f014459e11119eab611471168f203dbf",5375,"14709cadac288175df1913c8a4b7e561161761aca34ed88796a7bf656d7d9861"]};
const delivery=Object.fromEntries(Object.entries(packedDelivery).map(([name,[bytes,sha256,encodedBytes,encodedSHA256]])=>[name,{sourcePath:name==='v0-assembly-stages'?'V0_ASSEMBLY_STAGES.json':'viewer/data/'+name+'.source.json',bytes,sha256,gzip:{path:'viewer/data/'+name+'.json.gz',bytes:encodedBytes,sha256:encodedSHA256}}]));
const fail=message=>{throw Error('V0 manual data: '+message)};
const aborted=signal=>signal?.throwIfAborted();
function freeze(value){if(value&&typeof value==='object'){for(const v of Object.values(value))freeze(v);Object.freeze(value)}return value}
export const v0ManualDelivery=freeze(delivery);
const received=new WeakSet();let ready,pending;
export const v0ManualDataReady=()=>Boolean(ready);
export function checkedV0ManualBundle(value){if(!value||!received.has(value))fail('Exact complete received bundle required');return value}
export function checkedV0ManualData(name){const value=checkedV0ManualBundle(ready);if(!Object.hasOwn(value.data,name))fail('Unknown data table');return value.data[name]}
async function receiveFile(name,pin,fetchImpl,signal){
 aborted(signal);const url=new URL('./data/'+pin.gzip.path.split('/').at(-1)+'?v='+pin.gzip.sha256.slice(0,20),import.meta.url);
 const response=await fetchImpl(url,{cache:'no-cache',signal});aborted(signal);
 if(!response?.ok)fail('Reference download failed: '+name);
 const length=response.headers?.get('Content-Length');
 if(length!==null&&length!==undefined&&(!/^\d+$/.test(length)||Number(length)!==pin.gzip.bytes))fail('Changed encoded length: '+name);
 if(!response.body?.getReader)fail('Bounded reference download unavailable');
 const body=new Uint8Array(pin.gzip.bytes),reader=response.body.getReader();let used=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{})};signal.addEventListener('abort',cancel,{once:true});
 try{while(true){aborted(signal);const {done,value}=await reader.read();aborted(signal);if(done)break;
   if(!(value instanceof Uint8Array)||used+value.byteLength>body.byteLength)fail('Encoded reference exceeds pinned budget: '+name);
   body.set(value,used);used+=value.byteLength;
  }if(used!==body.byteLength)fail('Truncated encoded reference: '+name);
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{signal.removeEventListener('abort',cancel);reader.releaseLock()}
 const raw=await decodeExactGzip(body,pin,pin.gzip,{signal});aborted(signal);
 const value=JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(raw));
 if(!value||typeof value!=='object'||Array.isArray(value))fail('Invalid reference table: '+name);
 return freeze(value);
}
async function receive({fetchImpl,signal}){
 aborted(signal);const controller=new AbortController(),cancel=()=>controller.abort(signal.reason),entries=Object.entries(delivery),data=Object.create(null);let next=0,failure;
 signal?.addEventListener('abort',cancel,{once:true});
 async function worker(){while(!failure&&next<entries.length){const [name,pin]=entries[next++];try{data[name]=await receiveFile(name,pin,fetchImpl,controller.signal)}catch(error){failure??=error;controller.abort(error)}}}
 try{await Promise.all([worker(),worker()]);if(failure)throw failure;aborted(signal);
  if(Object.keys(data).length!==entries.length)fail('Incomplete reference bundle');
  const bundle=freeze({data,stageSHA256:delivery['v0-assembly-stages'].sha256});received.add(bundle);ready=bundle;return bundle;
 }finally{signal?.removeEventListener('abort',cancel)}
}
export function loadV0ManualData(options={}){
 const fetchImpl=options.fetchImpl??globalThis.fetch,signal=options.signal;
 if(typeof fetchImpl!=='function')return Promise.reject(Error('V0 manual data: Download unavailable'));
 if(signal||Object.hasOwn(options,'fetchImpl'))return receive({fetchImpl,signal});
 if(ready)return Promise.resolve(ready);
 if(!pending)pending=receive({fetchImpl}).finally(()=>{pending=undefined});
 return pending;
}
