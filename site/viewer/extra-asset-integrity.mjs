const digest=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),b=>b.toString(16).padStart(2,'0')).join('');
export function extraAssetBase(index,href){
 const here=new URL(href);
 return ['127.0.0.1','localhost','[::1]'].includes(here.hostname)?new URL('../'+index.local_directory+'/',here):new URL(index.base_url);
}
export async function checkedExtraAsset(base,spec,{signal}={}){
 if(!spec||!Number.isSafeInteger(spec.bytes)||spec.bytes<0||spec.bytes>180_000_000||!/^[a-f0-9]{64}$/.test(spec.sha256)||typeof spec.path!=='string'||spec.path.includes('..')||/[\\:]/.test(spec.path)||spec.path.startsWith('/'))throw Error('Invalid asset record');
 const url=new URL(spec.path,base);url.searchParams.set('sha',spec.sha256.slice(0,16));
 const response=await fetch(url,{signal});if(!response.ok)throw Error('CAD request failed: '+response.status);
 const bytes=new Uint8Array(await response.arrayBuffer());
 if(spec.encoding==='gzip'&&bytes.length===spec.decoded_bytes&&await digest(bytes)===spec.decoded_sha256)return bytes;
 if(bytes.length!==spec.bytes||await digest(bytes)!==spec.sha256)throw Error('CAD checksum mismatch');
 if(spec.encoding!=='gzip')return bytes;
 const decoded=new Uint8Array(await new Response(new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip'))).arrayBuffer());
 if(decoded.length!==spec.decoded_bytes||await digest(decoded)!==spec.decoded_sha256)throw Error('Decoded CAD checksum mismatch');
 return decoded;
}
