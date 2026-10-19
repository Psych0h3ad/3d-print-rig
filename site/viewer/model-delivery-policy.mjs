const checksum=value=>typeof value==='string'&&/^[0-9a-f]{64}$/.test(value);
export function registeredModelDelivery(input,base,siteRoot,delivery){
 const url=new URL(input,base),root=new URL(siteRoot);
 if(url.origin!==root.origin||!url.pathname.startsWith(root.pathname))return null;
 const relative=decodeURIComponent(url.pathname.slice(root.pathname.length));
 const row=delivery.files[relative];if(!row)return null;
 if(delivery.schema!=='pinned-model-delivery-v1'||!/^[0-9a-f]{40}$/.test(delivery.commit))throw Error('Invalid model delivery revision');
 const prefix='https://raw.githubusercontent.com/Psych0h3ad/3d-print-rig-large-voron-models/'+delivery.commit+'/';
 if(row.url!==prefix+relative+'.gz'||!checksum(row.sha256)||!checksum(row.decoded_sha256)||!Number.isSafeInteger(row.bytes)||row.bytes<=0||!Number.isSafeInteger(row.decoded_bytes)||row.decoded_bytes<=0)throw Error('Invalid registered model delivery');
 return row;
}
export async function verifyDeliveredModel(bytes,pin,decoded=false){
 const key=decoded?'decoded_sha256':'sha256',length=decoded?pin.decoded_bytes:pin.bytes;
 if(bytes.byteLength!==length)throw Error('Registered model delivery size mismatch');
 const digest=await crypto.subtle.digest('SHA-256',bytes);
 const hash=Array.from(new Uint8Array(digest),v=>v.toString(16).padStart(2,'0')).join('');
 if(hash!==pin[key])throw Error('Registered model delivery hash mismatch');
}
