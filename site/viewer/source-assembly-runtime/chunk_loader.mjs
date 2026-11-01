import {BufferAttribute} from 'three';
import {fetchPinned,createChunkProgress} from './loading.mjs?v=e902db78d245dfb3d383';
import {headSubsetPlan} from './head_subset.mjs?v=e42678a5314a2d6c0676';
import {fetchExactChunk} from './exact_gzip_transport.mjs?v=e42678a5314a2d6c0676';

const types={5121:Uint8Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array},sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4};
// One explicit board-only source revision. Every other model still requires
// zero deleted source faces; neither zero nor another omission is valid here.
const boardOmission508=Object.freeze({
 model:'1dad2900f881eec60fa16255c98628489443ea453086c79b7d0d6ac0e3e6bf3f',
 inventory:'1fb17bae60800458c27ba5ffcd57d4987508f0fda5cec757cade3af60ef7fcca',
 owner:'BTT-original-full-controller-with-five-source-hole-derivative',faces:370328,owners:508
});
function sourceFacePolicy(m,p){
 const b=boardOmission508;
 if(m.model_sha256===b.model||p.model.sha256===b.model)return m.model_sha256===b.model&&p.model.sha256===b.model&&m.source_inventory_sha256===b.inventory&&p.inventory.sha256===b.inventory&&m.source_faces_deleted===b.faces&&m.omitted_owner===b.owner&&m.occurrences===b.owners&&p.parts.length===b.owners&&new Set(p.parts.map(r=>r.key)).size===b.owners&&!p.parts.some(r=>r.key===b.owner);
 return m.source_faces_deleted===0;
}
export function validateChunkManifest(m,p){
 if(m.schema!=='priority-exact-source-chunks-134-v1'||m.model_sha256!==p.model.sha256||m.model_bytes!==p.model.bytes||m.source_inventory_sha256!==p.inventory.sha256||m.occurrences!==p.parts.length||m.chunks.length!==p.chunk_delivery.chunk_count||m.largest_chunk_bytes!==p.chunk_delivery.largest_chunk_bytes||!sourceFacePolicy(m,p)||m.normal_averaging!==false)throw Error('Chunk source identity mismatch');
 const d=m.document;if(d.asset.version!=='2.0'||d.buffers.length!==1||d.buffers[0].uri||['images','textures','skins','animations'].some(k=>d[k]?.length)||[...(d.extensionsUsed||[]),...(d.extensionsRequired||[])].some(x=>x!=='EXT_mesh_gpu_instancing'))throw Error('Unsupported chunked source GLB');
 let end=0;for(const [i,c]of m.chunks.entries()){if(c.ordinal!==i||c.start!==end||!Number.isSafeInteger(c.bytes)||c.bytes<=0||c.bytes>m.largest_chunk_bytes)throw Error('Chunk coverage/order mismatch');end+=c.bytes;}if(end<m.geometry_bytes||end>d.buffers[0].byteLength+3)throw Error('Incomplete chunk coverage');
 for(const [i,a]of d.accessors.entries()){const v=d.bufferViews[a.bufferView],b=m.buffer_view_chunks[a.bufferView],c=m.chunks[b?.chunk],T=types[a.componentType],size=sizes[a.type],offset=(b?.offset??0)+(a.byteOffset??0),length=a.count*size;
  if(!T||!size||!v||v.buffer!==0||v.byteStride||a.sparse||!c||!Number.isSafeInteger(a.count)||a.count<=0||offset<0||offset%T.BYTES_PER_ELEMENT||offset+length*T.BYTES_PER_ELEMENT>b.offset+v.byteLength||b.offset+v.byteLength>c.bytes||c.start+b.offset!==(v.byteOffset??0))throw Error('Unsupported exact chunk accessor '+i);
 }return m;
}
export async function loadChunkedModel(loader,packet,{signal,onProgress=()=>{},fetchAsset=fetchPinned,onChunk=()=>{},selectedPartKeys=null}={}){
 if(signal?.aborted)throw new DOMException('Canceled','AbortError');
 onProgress({phase:'manifest',percent:null,downloadPercent:null});
 let manifestBytes=await fetchAsset(packet.chunk_delivery.manifest.url,packet.chunk_delivery.manifest,signal);
 const m=validateChunkManifest(JSON.parse(new TextDecoder().decode(manifestBytes)),packet);manifestBytes=null;
 const selection=selectedPartKeys?headSubsetPlan(packet,m,selectedPartKeys):null,selectedChunks=selection?selection.chunkOrdinals.map(i=>m.chunks[i]):m.chunks;
 const transportBytes=c=>typeof globalThis.DecompressionStream==='function'&&c.gzip?c.gzip.bytes:c.bytes,progress=createChunkProgress(selectedChunks,onProgress,{signal});
 const buffers=[];let downloaded=0,networkReceived=0;
 try{
  for(const c of selectedChunks){if(signal?.aborted)throw new DOMException('Canceled','AbortError');let bytes=new Uint8Array(await fetchExactChunk(c,{fetchPinned:fetchAsset,signal,onProgress:progress.begin(c.ordinal)}));buffers[c.ordinal]=bytes;downloaded+=bytes.length;networkReceived+=transportBytes(c);progress.finish(c.ordinal);onChunk({ordinal:c.ordinal,downloaded,network_received:networkReceived,retained_buffer_bytes:downloaded,pending_chunks:1});bytes=null;}
  if(signal?.aborted)throw new DOMException('Canceled','AbortError');
  const plugin=parser=>{parser.loadAccessor=index=>{const a=m.document.accessors[index],v=m.document.bufferViews[a.bufferView],b=m.buffer_view_chunks[a.bufferView],bytes=buffers[b.chunk],T=types[a.componentType];return Promise.resolve(new BufferAttribute(new T(bytes.buffer,bytes.byteOffset+b.offset+(a.byteOffset??0),a.count*sizes[a.type]),sizes[a.type],a.normalized===true));};return {name:'priority_exact_shared_chunk_accessors'};};
  progress.assembly();loader.register(plugin);try{const result=await loader.parseAsync(selection?selection.document:m.document,'');
   if(packet.source_GT2_189&&!selection){const ref=packet.source_GT2_189.source_curve,v=m.document.bufferViews[packet.source_GT2_189.embedded_curve_buffer_view],map=m.buffer_view_chunks[packet.source_GT2_189.embedded_curve_buffer_view];if(!v||!map||v.byteLength!==ref.bytes)throw Error('Missing exact source GT2 curve view');const bytes=buffers[map.chunk].subarray(map.offset,map.offset+v.byteLength).slice();const hash=Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',bytes)),x=>x.toString(16).padStart(2,'0')).join('');if(hash!==ref.sha256)throw Error('Source GT2 curve hash differs');result.prioritySourceCurve189=bytes.buffer;}
   if(selection)result.priorityHeadSubset={keys:selection.keys,downloadBytes:selection.downloadBytes,chunkOrdinals:selection.chunkOrdinals,loading_budget:selection.loading_budget};
   return result;}finally{loader.unregister(plugin);}
 }finally{buffers.length=0;}
}
