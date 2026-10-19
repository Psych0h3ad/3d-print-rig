import {TRINITY_RENDER_DELIVERY as trinityDelivery} from './trinity-render-delivery.mjs';
import {boundedSha256} from './bounded-sha256.mjs';
import {LEGACY_LED_SPECS,LED_ALIASES,REGISTERED_LED_ASSETS} from './led-source-contract.mjs';

const receipts=new WeakMap(),HEX=/^[a-f0-9]{64}$/;
const canonical=value=>Array.isArray(value)?value.map(canonical):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const semantic=value=>JSON.stringify(canonical(value));
const alias=new Map(LED_ALIASES),normalize=k=>alias.get(String(k))||String(k);
const sha=async bytes=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),n=>n.toString(16).padStart(2,'0')).join('');
function info(spec,catalogId){
 if(!spec||typeof spec!=='object'||typeof catalogId!=='string'||!catalogId)throw Error('Invalid LED asset descriptor');
 const signature=semantic(spec),legacy=LEGACY_LED_SPECS[catalogId];
 const legacyExpected=legacy?.spec_semantic===signature?legacy.required_model_sha256:null;
 const model=spec.files?.['model.glb'],expected=model?.decoded_sha256||spec.decoded_model_sha256||(model&&(!model.encoding||model.encoding==='identity')?model.sha256:null)||legacyExpected;
 if(model?.encoding&&!['gzip','identity'].includes(model.encoding))throw Error('Unknown LED model encoding');
 if(model?.encoding==='identity'&&!expected)throw Error('Missing decoded LED model hash');
 if(model?.encoding==='gzip'&&!model.decoded_sha256)throw Error('Missing decoded LED model hash');
 if(expected&&!HEX.test(expected))throw Error('Invalid decoded LED model hash');
 return {id:spec.component_id||catalogId,expected,signature};
}

// Receipts are created from the bytes actually passed to GLTFLoader, not from
// descriptor declarations. A caller cannot counterfeit one by copying a hash.
export async function verifyLedModelBytes(root,spec,bytes,{catalogId}={}){
 if(!root?.isObject3D||!(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes)))throw Error('Invalid LED model bytes');
 const i=info(spec,catalogId);if(!i.expected)return null;
 const view=bytes instanceof ArrayBuffer?new Uint8Array(bytes):new Uint8Array(bytes.buffer,bytes.byteOffset,bytes.byteLength),actual=await sha(view);
 if(actual!==i.expected)throw Error('LED decoded model receipt mismatch');
 const token=Object.freeze({id:i.id,decoded_model_sha256:actual});receipts.set(token,{root,signature:i.signature,id:i.id,hash:actual});return token;
}

// Narrow bridge for the pinned lossless Trinity rendering derivative. The
// immutable manifest bytes and actual parser bytes are measured independently.
// Original CAD/source hashes continue to identify the native mounting witness.
export async function verifyTrinityLedModelBytes(root,spec,bytes,manifestBytes,{catalogId}={}){
 if(!root?.isObject3D||!(bytes instanceof ArrayBuffer||ArrayBuffer.isView(bytes))||!(manifestBytes instanceof ArrayBuffer||ArrayBuffer.isView(manifestBytes)))throw Error('Invalid Trinity LED derivative bytes');
 const i=info(spec,catalogId),view=b=>b instanceof ArrayBuffer?new Uint8Array(b):new Uint8Array(b.buffer,b.byteOffset,b.byteLength),raw=view(manifestBytes);
 if(spec.component_id!==trinityDelivery.component_id||spec.parts!==trinityDelivery.parts||i.expected!==trinityDelivery.source_model_sha256||spec.files?.['parts.json']?.sha256!==trinityDelivery.source_parts_sha256)throw Error('Trinity LED source descriptor changed');
 if(raw.byteLength!==trinityDelivery.manifest.bytes||await sha(raw)!==trinityDelivery.manifest.sha256)throw Error('Trinity LED delivery manifest changed');
 const manifest=JSON.parse(new TextDecoder().decode(raw)),derivative=manifest.verified_lossless_derivative;
 if(manifest.schema!=='trinity98-lossless-accessor-chunks-v1'||manifest.source?.decoded_sha256!==i.expected||manifest.source?.parts_sha256!==trinityDelivery.source_parts_sha256||!HEX.test(derivative?.decoded_sha256)||derivative.decoded_bytes!==354048088)throw Error('Trinity LED delivery source changed');
 const actualBytes=view(bytes),actual=await boundedSha256(actualBytes);
 if(actualBytes.byteLength!==derivative.decoded_bytes||actual!==derivative.decoded_sha256)throw Error('Trinity LED decoded derivative mismatch');
 const token=Object.freeze({id:i.id,decoded_model_sha256:i.expected,render_decoded_sha256:actual,delivery_manifest_sha256:trinityDelivery.manifest.sha256});
 receipts.set(token,{root,signature:i.signature,id:i.id,hash:i.expected,renderHash:actual});return token;
}

export function bindLedSource(root,meta,spec,{catalogId,receipt=null}={}){
 if(!root?.isObject3D||!Array.isArray(meta?.parts))throw Error('Invalid LED source manifest');
 const i=info(spec,catalogId),proof=receipt&&receipts.get(receipt),legacy=LEGACY_LED_SPECS[catalogId];
 let asset;
 if(i.expected){
  if(!proof||proof.root!==root||proof.signature!==i.signature||proof.id!==i.id||proof.hash!==i.expected)throw Error('Missing actual decoded LED model receipt');
  asset={id:i.id,decoded_model_sha256:proof.hash,...(proof.renderHash?{source_decoded_model_sha256:proof.hash,render_decoded_sha256:proof.renderHash,delivery_manifest_sha256:trinityDelivery.manifest.sha256}:{})};
 }else{
  // Only the unchanged, catalog-pinned legacy descriptor may use the original
  // ID/geometry contract. Unknown assets receive their own ID (never an alias).
  if(legacy){if(legacy.spec_semantic!==i.signature||legacy.metadata_id!==meta.id)throw Error('Changed legacy LED asset requires a decoded model pin');}
  else if(REGISTERED_LED_ASSETS.includes(i.id))throw Error('Registered LED asset requires an actual decoded receipt');
  asset={id:i.id};
 }
 if(spec.component_id&&meta.id!==spec.component_id)throw Error('LED component metadata ID mismatch');
 if(legacy&&!spec.component_id&&legacy.metadata_id!==meta.id)throw Error('LED legacy metadata ID mismatch');
 const lookup=new Map();for(const row of meta.parts){
  if(typeof row.key!=='string'||!row.key||lookup.has(normalize(row.key)))throw Error('Duplicate or missing LED source key');
  lookup.set(normalize(row.key),row);
 }
 const assignments=[];
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  const data=mesh.userData||{},name=mesh.name?.match(/^P(.+?)__/u)?.[1],keys=[data.part_key,name,mesh.name].filter(k=>typeof k==='string').map(normalize),rows=[...new Set(keys.map(k=>lookup.get(k)).filter(Boolean))];
  if(rows.length>1)throw Error('Ambiguous LED mesh/source identity');
  // Anonymous non-lighting surfaces are not assigned invented source rows.
  const row=rows[0]||null;
  if(!row&&keys.some(k=>alias.has(k)||LED_ALIASES.some(([a,b])=>b===k)))throw Error('Registered LED or guide has no source row');
  const extrasKey=data.part_key;if(row&&extrasKey&&normalize(extrasKey)!==normalize(row.key))throw Error('Stale LED mesh/source key');
  assignments.push({mesh,row});
 });
 if(root.userData.ledSourceAsset&&semantic(root.userData.ledSourceAsset)!==semantic(asset))throw Error('LED asset is already bound to another source');
 // All descriptor, receipt and row guards complete before any mutation.
 root.userData.ledSourceAsset=Object.freeze(asset);
 for(const {mesh,row} of assignments)if(row)mesh.userData.ledSourceRow=row;
 return {mode:i.expected?'decoded_model_verified':legacy?'legacy_catalog_geometry':'unregistered_catalog_id',id:i.id,decoded_model_sha256:i.expected||null,bound_rows:assignments.filter(x=>x.row).length,unmapped_meshes:assignments.filter(x=>!x.row).length};
}
