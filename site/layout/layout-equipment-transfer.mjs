// Exact file transport only; decoded model identities and geometry stay unchanged.
// Shared by the browser loader and actual-body CLI audits. No work on import.
export const MAX_LAYOUT_EQUIPMENT_BYTES=16*1024*1024;
export const LAYOUT_EQUIPMENT_TRANSFER_BASE='https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/da1f857f0c48606ed818/';
// Separate immutable receipt. It does not expand the legacy U1 path/base pairs.
export const BIQU_POPSTATION_TRANSFER_BASE='https://psych0h3ad.github.io/3d-print-rig-extra-models/layout-references/biqu-popstation-0759dac8fdee8cf20c6c/';
const BIQU_DIRECTORY='layout/assets/equipment/biqu-popstation-cad-v1/';
const biquIdentity=(name,bytes,sha256,wireBytes,wireSHA256)=>Object.freeze({
  path:BIQU_DIRECTORY+name,bytes,sha256,transfer:Object.freeze({
    path:BIQU_DIRECTORY+name+'.gz',bytes:wireBytes,sha256:wireSHA256,
    encoding:'gzip',baseURL:BIQU_POPSTATION_TRANSFER_BASE})});
export const BIQU_POPSTATION_MODEL_IDENTITY=biquIdentity('PopStationMini_source_empty.glb',1347856,
  'cd531f04bf1db39af6826aa658fe30a2e9efaafd1209e5d61ff4548c4970c83b',437640,
  'e3125f9042d4dafdb33534709c7098acac8f0c634f6a95f1ff284e5b79b7da75');
export const BIQU_POPSTATION_PREVIEW_IDENTITY=biquIdentity('PopStationMini_preview_geometry.json',9549487,
  'f7ae02fccb83c655c4784af5736eec59fb4064ca4e5f714846f7b88f34f3ab6c',1451459,
  '93f69bed29fb42022d3bd5535830c8579b778c63017206308890552793346ca2');
const HASH=/^[a-f0-9]{64}$/;
const EXTERNAL_MODELS=new Set([
  'layout/assets/equipment/u1-exterior/U1_exterior_standalone_loaded.glb',
  'layout/assets/equipment/u1-exterior/U1_exterior_docked.glb',
  'layout/assets/equipment/u1-exterior/PopStationMini_empty.glb',
  'layout/assets/equipment/u1-exterior/PopStationMini_loaded.glb'
]);
const GZIP_MODELS=new Set([
  ...['U1_standalone_loaded.glb','U1_docked.glb','PopStationMini_empty.glb','PopStationMini_loaded.glb']
    .map(name=>'layout/assets/equipment/u1-popstation/'+name),
  ...EXTERNAL_MODELS
]);
const fail=message=>Object.assign(new Error(message),{code:'LAYOUT_EQUIPMENT_INTEGRITY'});
const abort=signal=>signal?.throwIfAborted();

function exactBiquTransfer(model,pin) {
  if(!['path','bytes','sha256'].every(key=>model[key]===pin[key])||
    !model.transfer||!['path','bytes','sha256','encoding','baseURL'].every(key=>model.transfer[key]===pin.transfer[key]))
    throw fail('Unexpected BIQU immutable model or preview identity');
  return {...pin.transfer};
}

function checkIdentity(ref) {
  if(!Number.isSafeInteger(ref?.bytes)||ref.bytes<=0||ref.bytes>MAX_LAYOUT_EQUIPMENT_BYTES||
    typeof ref.sha256!=='string'||!HASH.test(ref.sha256))
    throw fail('Invalid equipment identity or 16 MiB byte budget');
}

/** Snapshot pins before any asynchronous work; never infer an encoding from a URL. */
export function equipmentTransferIdentity(model) {
  checkIdentity(model);
  if(model.path?.startsWith(BIQU_DIRECTORY))return exactBiquTransfer(model,BIQU_POPSTATION_MODEL_IDENTITY);
  if(typeof model.path!=='string'||!/^([A-Za-z0-9_-]+\/)*[A-Za-z0-9_.-]+\.glb$/.test(model.path)||
    model.path.split('/').some(part=>part==='.'||part==='..'))throw fail('Invalid equipment model path');
  if(model.transfer===undefined)return {path:model.path,bytes:model.bytes,sha256:model.sha256};
  const transfer=model.transfer;checkIdentity(transfer);
  if(transfer.encoding!=='gzip'||!GZIP_MODELS.has(model.path)||transfer.path!==model.path+'.gz')
    throw fail('Unexpected equipment transfer path or encoding');
  if(transfer.baseURL!==undefined&&
    (transfer.baseURL!==LAYOUT_EQUIPMENT_TRANSFER_BASE||!EXTERNAL_MODELS.has(model.path)))
    throw fail('Unexpected equipment transfer base or external model');
  return {path:transfer.path,bytes:transfer.bytes,sha256:transfer.sha256,encoding:'gzip',
    ...(transfer.baseURL!==undefined?{baseURL:transfer.baseURL}:{})};
}

/** Separate JSON contract; it cannot widen the GLB model allowlist. */
export function equipmentPreviewGeometryTransferIdentity(model) {
  checkIdentity(model);
  if(model.path?.startsWith(BIQU_DIRECTORY))return exactBiquTransfer(model,BIQU_POPSTATION_PREVIEW_IDENTITY);
  const transfer=model.transfer;checkIdentity(transfer);
  if(model.path!=='layout/assets/equipment/u1-exterior/U1_preview_geometry.json'||
    transfer.path!==model.path+'.gz'||transfer.encoding!=='gzip'||
    transfer.baseURL!==LAYOUT_EQUIPMENT_TRANSFER_BASE)
    throw fail('Unexpected equipment preview JSON transfer path, encoding or base');
  return {path:transfer.path,bytes:transfer.bytes,sha256:transfer.sha256,
    encoding:'gzip',baseURL:transfer.baseURL};
}

function snapshot(model,identity=equipmentTransferIdentity) {
  const transfer=identity(model);
  return {path:model.path,bytes:model.bytes,sha256:model.sha256,
    ...(transfer.encoding?{transfer}: {})};
}

export async function verifyEquipmentModelBytes(input,model,{signal}={}) {
  checkIdentity(model);abort(signal);
  const data=input instanceof Uint8Array?input:new Uint8Array(input);
  if(data.byteLength!==model.bytes)throw fail('Equipment model size differs from source receipt');
  const digest=new Uint8Array(await crypto.subtle.digest('SHA-256',data));
  abort(signal);
  if(Array.from(digest,v=>v.toString(16).padStart(2,'0')).join('')!==model.sha256)
    throw fail('Equipment model hash differs from source receipt');
  return data;
}

async function readExact(stream,total,{signal,onProgress=()=>{},phase}) {
  if(!stream?.getReader)throw fail('Equipment transport requires a bounded readable stream');
  const reader=stream.getReader(),output=new Uint8Array(total);let received=0,complete=false;
  const cancel=()=>{void reader.cancel(signal.reason).catch(()=>{});};
  signal?.addEventListener('abort',cancel,{once:true});
  try {
    for(;;){
      abort(signal);const {done,value}=await reader.read();abort(signal);
      if(done){complete=true;break}
      if(!(value instanceof Uint8Array)||value.byteLength>total-received)
        throw fail('Equipment '+phase+' exceeds pinned byte budget');
      output.set(value,received);received+=value.byteLength;
      onProgress({phase,loaded:received,total,percent:received/total*(phase==='download'?70:20)+(phase==='decode'?70:0)});
    }
    if(received!==total)throw fail('Truncated equipment '+phase+' body');
    return output;
  } finally {
    signal?.removeEventListener('abort',cancel);
    if(!complete)try{await reader.cancel(signal?.reason)}catch{}
    reader.releaseLock();
  }
}

/** Verify encoded SHA before inflation, then bounded decoded bytes and SHA. */
export async function decodeEquipmentTransfer(input,model,{signal,onProgress,
  Decoder=globalThis.DecompressionStream}={}) {
  return decodePinnedTransfer(input,snapshot(model),{signal,onProgress,Decoder});
}

async function decodePinnedTransfer(input,pinned,{signal,onProgress,Decoder}) {
  const transfer=pinned.transfer??pinned;
  const encoded=await verifyEquipmentModelBytes(input,transfer,{signal});
  if(!transfer.encoding)return encoded.buffer.slice(encoded.byteOffset,encoded.byteOffset+encoded.byteLength);
  if(typeof Decoder!=='function')throw fail('Equipment gzip decompression is unavailable');
  abort(signal);
  const stream=new Blob([encoded]).stream().pipeThrough(new Decoder('gzip'));
  const decoded=await readExact(stream,pinned.bytes,{signal,onProgress,phase:'decode'});
  await verifyEquipmentModelBytes(decoded,pinned,{signal});
  return decoded.buffer;
}

export async function downloadEquipmentModel(model,{signal,onProgress=()=>{},
  fetchImpl=globalThis.fetch,baseURL=new URL('../',import.meta.url),
  Decoder=globalThis.DecompressionStream}={}) {
  return downloadPinnedTransfer(snapshot(model),{signal,onProgress,fetchImpl,baseURL,Decoder});
}

async function downloadPinnedTransfer(pinned,{signal,onProgress,fetchImpl,baseURL,Decoder}) {
  const transfer=pinned.transfer??pinned;abort(signal);
  if(transfer.encoding&&typeof Decoder!=='function')throw fail('Equipment gzip decompression is unavailable');
  const url=new URL(transfer.path,transfer.baseURL??baseURL);
  const response=await fetchImpl(url,{signal,redirect:'error',credentials:'omit',referrerPolicy:'no-referrer'});
  let handedToReader=false;
  try {
    abort(signal);
    if(response.redirected||response.type==='opaqueredirect'||
      (transfer.baseURL&&response.url!==url.href))
      throw fail('Unexpected equipment transport redirect or response URL');
    if(!response.ok)throw Object.assign(new Error('Equipment model download failed: '+response.status),{code:'LAYOUT_EQUIPMENT_DOWNLOAD'});
    // An explicitly pinned .gz file is the response body. HTTP auto-decoding
    // would hide its exact wire identity; reject it, with no raw fallback.
    const encoding=response.headers.get('content-encoding');
    if(encoding!==null&&encoding.trim().toLowerCase()!=='identity')
      throw fail('Unexpected HTTP equipment content encoding');
    const length=response.headers.get('content-length');
    if(length!==null&&(!/^[0-9]+$/.test(length)||Number(length)!==transfer.bytes))
      throw fail('Equipment transport length differs from source receipt');
    handedToReader=true;
    const encoded=await readExact(response.body,transfer.bytes,{signal,onProgress,phase:'download'});
    return await decodePinnedTransfer(encoded,pinned,{signal,onProgress,Decoder});
  } finally {
    if(!handedToReader)try{await response.body?.cancel()}catch{}
  }
}

/** Pinned JSON data only. Schema validation and app initialization belong to its consumer. */
export async function downloadEquipmentPreviewGeometry(model,{signal,onProgress=()=>{},
  fetchImpl=globalThis.fetch,Decoder=globalThis.DecompressionStream}={}) {
  const bytes=await downloadPinnedTransfer(snapshot(model,equipmentPreviewGeometryTransferIdentity),
    {signal,onProgress,fetchImpl,Decoder});
  abort(signal);
  try {
    return JSON.parse(new TextDecoder('utf-8',{fatal:true}).decode(bytes));
  } catch {
    throw fail('Equipment preview body must be valid UTF-8 JSON data');
  }
}
