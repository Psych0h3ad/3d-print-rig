const MAX_JSON_BYTES=32*1024*1024;
const sha256=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
export const supportDownloadBlob=value=>new Blob([JSON.stringify(value)+'\n'],{type:'application/json;charset=utf-8'});

export function validateSupportResource(file,resource){
 if(!/^[a-z0-9_-]+\.json$/u.test(file)||resource?.file!==file+'.gz'||resource.encoding!=='gzip'
  ||![resource.bytes,resource.decoded_bytes].every(n=>Number.isSafeInteger(n)&&n>0&&n<=MAX_JSON_BYTES)
  ||![resource.sha256,resource.decoded_sha256].every(s=>typeof s==='string'&&/^[a-f0-9]{64}$/u.test(s)))throw Error('Invalid support resource: '+file);
 return resource;
}

async function boundedBytes(stream,limit){
 const reader=stream.getReader(),chunks=[];let size=0;
 try{
  for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
   if(size>limit)throw Error('Support resource exceeds its declared size');chunks.push(value);
  }
 }catch(error){await reader.cancel().catch(()=>{});throw error}finally{reader.releaseLock()}
 const bytes=new Uint8Array(size);let offset=0;for(const chunk of chunks){bytes.set(chunk,offset);offset+=chunk.byteLength}return bytes;
}

export async function readSupportJSON(file,{resource,fetcher=fetch}={}){
 if(resource)validateSupportResource(file,resource);
 const response=await fetcher('./data/'+(resource?.file||file),{cache:'no-cache'});
 if(!response.ok||!response.body)throw Error('Could not load support resource: '+file);
 const bytes=await boundedBytes(response.body,resource?Math.max(resource.bytes,resource.decoded_bytes):MAX_JSON_BYTES);
 let decoded=bytes;
 if(resource&&bytes[0]===0x1f&&bytes[1]===0x8b){
  if(bytes.byteLength!==resource.bytes||await sha256(bytes)!==resource.sha256)throw Error('Support resource checksum mismatch: '+file);
  if(typeof DecompressionStream==='undefined')throw Error('Gzip decompression is unavailable');
  decoded=await boundedBytes(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')),resource.decoded_bytes);
 }
 // Content-Encoding may cause the browser to decompress the response first.
 if(resource&&(decoded.byteLength!==resource.decoded_bytes||await sha256(decoded)!==resource.decoded_sha256))throw Error('Decoded support resource checksum mismatch: '+file);
 return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(decoded));
}
