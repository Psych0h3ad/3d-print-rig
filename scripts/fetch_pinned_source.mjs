// Fetch one exact public body with bounded transport retries.
import {createHash} from 'node:crypto';
import {setTimeout as delay} from 'node:timers/promises';

const transientStatus=new Set([429,502,503,504]);
class SourceHTTPError extends Error{
 constructor(status,url){super('Pinned source HTTP '+status+': '+url);this.status=status;}
}
const timeoutCodes=new Set(['ETIMEDOUT','UND_ERR_CONNECT_TIMEOUT','UND_ERR_HEADERS_TIMEOUT','UND_ERR_BODY_TIMEOUT']);
function retryable(error){
 return error instanceof SourceHTTPError?transientStatus.has(error.status):
  error?.name==='TimeoutError'||timeoutCodes.has(error?.cause?.code);
}

export async function fetchPinnedSource(url,pin,{timeoutMs=45000,fetchImpl=globalThis.fetch,sleep=delay}={}){
 const source=new URL(url);
 if(source.protocol!=='https:'||source.username||source.password||source.hash)throw new Error('Invalid pinned source URL');
 if(!Number.isSafeInteger(pin?.bytes)||pin.bytes<=0||typeof pin?.sha256!=='string'||!/^[0-9a-f]{64}$/.test(pin.sha256))throw new Error('Invalid pinned source size or checksum');
 if(!Number.isSafeInteger(timeoutMs)||timeoutMs<=0||timeoutMs>45000)throw new Error('Invalid pinned source timeout');
 for(let attempt=0;attempt<3;attempt++){
  const controller=new AbortController(),expired=new DOMException('Pinned source timed out: '+source.href,'TimeoutError');
  let timer;
  const deadline=new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort(expired);reject(expired);},timeoutMs);});
  const read=async()=>{
   const response=await fetchImpl(source.href,{signal:controller.signal,redirect:'error',headers:{'Accept-Encoding':'identity'}});
   if(response.url!==source.href){void response.body?.cancel().catch(()=>{});throw new Error('Pinned source URL changed');}
   if(!response.ok){void response.body?.cancel().catch(()=>{});throw new SourceHTTPError(response.status,source.href);}
   const length=response.headers.get('content-length');
   if(length!==null&&(!/^[0-9]+$/.test(length)||!Number.isSafeInteger(Number(length))||Number(length)!==pin.bytes)){
    void response.body?.cancel().catch(()=>{});throw new Error('Pinned source Content-Length mismatch');
   }
   if(!response.body)throw new Error('Missing pinned source body');
   const reader=response.body.getReader(),chunks=[],checksum=createHash('sha256');let total=0;
   try{
    while(true){
     const {done,value}=await reader.read();if(done)break;
     total+=value.byteLength;if(total>pin.bytes)throw new Error('Pinned source exceeded its size');
     checksum.update(value);chunks.push(Buffer.from(value));
    }
   }finally{void reader.cancel().catch(()=>{});reader.releaseLock();}
   if(total!==pin.bytes||checksum.digest('hex')!==pin.sha256)throw new Error('Pinned source checksum mismatch');
   return Buffer.concat(chunks,total);
  };
  try{return await Promise.race([read(),deadline]);}
  catch(error){if(!retryable(error)||attempt===2)throw error;}
  finally{clearTimeout(timer);}
  await sleep([1000,3000][attempt]);
 }
}
