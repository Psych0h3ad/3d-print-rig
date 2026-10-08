import {checkedExtraAsset,extraAssetBase} from './extra-asset-integrity.mjs?v=737f5dc17ca78791c0d8';
import {beginModelLoading} from './model-progress.mjs?v=6b41a2b9f7626039b7e6';
import {parseSharedComponentGlb,sharedGlbDocument} from './shared-component-glb.mjs?v=a21b698822731b57dea6';
import {TRINITY_RENDER_DELIVERY as delivery} from './trinity-render-delivery.mjs?v=a21b698822731b57dea6';

export function prepareChunkAssembly(manifest,prefix){
 if(manifest.schema!=='trinity98-lossless-accessor-chunks-v1'||manifest.logical_part_nodes!==205||manifest.logical_meshes!==205||manifest.material_primitives!==206||manifest.source?.decoded_sha256!==delivery.source_model_sha256||manifest.source?.parts_sha256!==delivery.source_parts_sha256||manifest.chunk_count!==11||manifest.chunks?.length!==11||manifest.max_decoded_chunk_bytes!==33554432||manifest.verified_lossless_derivative?.decoded_bytes!==354048088)throw Error('Trinity delivery identity mismatch');
 const bytes=new Uint8Array(manifest.verified_lossless_derivative.decoded_bytes);bytes.set(prefix);
 const doc=sharedGlbDocument(bytes),counts=new Array(doc.accessors.length).fill(0);
 if(doc.json.nodes?.length!==205||doc.json.meshes?.length!==205||doc.json.materials?.length!==106||doc.buffer.byteLength!==prefix.length+doc.json.buffers[0].byteLength)throw Error('Trinity assembly identity mismatch');
 return {bytes,doc,counts,next:0};
}
export function scatterComponentChunk(state,record,bytes){
 if(record.ordinal!==state.next||record.file.decoded_bytes>33554432||record.file.decoded_bytes!==bytes.length)throw Error('Trinity chunk order/size mismatch');
 const source=sharedGlbDocument(bytes);
 for(const p of record.packets){
  const dest=state.doc.accessors[p.destination_accessor],a=source.accessors[p.chunk_accessor];
  if(!dest||!a||p.first_element!==state.counts[p.destination_accessor]||p.count<=0||p.count!==a.length/a.size||dest.size!==a.size||dest.T!==a.T||p.count+p.first_element>dest.length/dest.size||p.bytes!==a.length*a.T.BYTES_PER_ELEMENT||p.source_binary_byte_offset!==dest.start+p.first_element*dest.size*dest.T.BYTES_PER_ELEMENT)throw Error('Trinity accessor range mismatch');
  new Uint8Array(state.bytes.buffer,state.doc.binOffset+dest.start+p.first_element*dest.size*dest.T.BYTES_PER_ELEMENT,p.bytes).set(new Uint8Array(source.buffer,source.binOffset+a.start,p.bytes));
  state.counts[p.destination_accessor]+=p.count;
 }
 state.next++;
}
export function finishChunkAssembly(state){
 if(state.next!==11||state.counts.some((count,i)=>count!==state.doc.accessors[i].length/state.doc.accessors[i].size))throw Error('Incomplete Trinity accessor delivery');
 return state.bytes;
}
export async function loadChunkedTrinity(loader,spec,href){
 if(spec.component_id!==delivery.component_id||spec.parts!==delivery.parts||spec.files['model.glb'].decoded_sha256!==delivery.source_model_sha256||spec.files['parts.json'].sha256!==delivery.source_parts_sha256)throw Error('Trinity native source identity changed');
 const base=extraAssetBase(delivery.external,href),manifest=JSON.parse(new TextDecoder().decode(await checkedExtraAsset(base,delivery.manifest))),root=new URL('trinity-lossless-v1/',base);
 const progress=beginModelLoading(Object.fromEntries(manifest.chunks.map(r=>[String(r.ordinal),r.file])));
 try{
  const [prefix,parts]=await Promise.all([checkedExtraAsset(root,manifest.reassembly_prefix),checkedExtraAsset(root,manifest.parts)]),meta=JSON.parse(new TextDecoder().decode(parts));
  if(meta.id!==delivery.component_id||meta.parts?.length!==205||new Set(meta.parts.map(p=>p.key)).size!==205||meta.decoded_model_sha256!==delivery.source_model_sha256)throw Error('Trinity part manifest identity mismatch');
  const state=prepareChunkAssembly(manifest,prefix);
  // One checked packet at a time. Never retain parsers or concatenate chunks.
  for(const record of manifest.chunks){
   const bytes=await checkedExtraAsset(root,record.file,{onProgress:event=>progress.update(String(record.ordinal),event)});
   scatterComponentChunk(state,record,bytes);
  }
  progress.assembling();
  return {gltf:await parseSharedComponentGlb(loader,finishChunkAssembly(state),root.href),meta};
 }finally{progress.finish()}
}
