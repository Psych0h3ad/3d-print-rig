const LIMIT=128*1024*1024, HASH=/^[a-f0-9]{64}$/;
function check(ref){if(!Number.isSafeInteger(ref?.bytes)||ref.bytes<=0||ref.bytes>LIMIT||!HASH.test(ref?.sha256))throw Error('Invalid exact chunk identity or byte budget');}
const abort=signal=>{if(signal?.aborted)throw new DOMException('Canceled','AbortError');};
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),v=>v.toString(16).padStart(2,'0')).join('');

export async function decodeExactGzip(encoded,rawRef,gzipRef,{signal,onProgress=()=>{},Decoder=globalThis.DecompressionStream}={}){
 check(rawRef);check(gzipRef);abort(signal);
 if(typeof Decoder!=='function')throw Error('Gzip decoding is unavailable');
 const input=encoded instanceof Uint8Array?encoded:new Uint8Array(encoded);
 if(input.byteLength!==gzipRef.bytes||await sha(input)!==gzipRef.sha256)throw Error('Compressed chunk identity changed');
 abort(signal);
 const output=new Uint8Array(rawRef.bytes),stream=new Blob([input]).stream().pipeThrough(new Decoder('gzip')),reader=stream.getReader();let received=0;
 const cancel=()=>{reader.cancel(new DOMException('Canceled','AbortError')).catch(()=>{});};
 signal?.addEventListener('abort',cancel,{once:true});
 try{while(true){abort(signal);const {done,value}=await reader.read();abort(signal);if(done)break;if(received+value.byteLength>output.byteLength)throw Error('Decoded chunk exceeds pinned byte budget');output.set(value,received);received+=value.byteLength;onProgress({phase:'decode',received,total:output.byteLength,percent:received/output.byteLength*100});}
  if(received!==output.byteLength)throw Error('Truncated decoded chunk');
  if(await sha(output)!==rawRef.sha256)throw Error('Decoded source chunk identity changed');
  abort(signal);return output.buffer;
 }catch(error){await reader.cancel().catch(()=>{});throw error;}finally{signal?.removeEventListener('abort',cancel);reader.releaseLock();}
}

export async function fetchExactChunk(ref,{fetchPinned,signal,onProgress=()=>{},Decoder=globalThis.DecompressionStream}={}){
 check(ref);abort(signal);
 if(!ref.gzip||typeof Decoder!=='function'){
  if(typeof ref.url!=='string')throw Error('This source model requires browser gzip decompression');
  return fetchPinned(ref.url,ref,signal,onProgress);
 }
 check(ref.gzip);
 const bytes=await fetchPinned(ref.gzip.url,ref.gzip,signal,onProgress);
 return decodeExactGzip(bytes,ref,ref.gzip,{signal,onProgress,Decoder});
}
