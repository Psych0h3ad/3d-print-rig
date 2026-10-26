// Node audit inputs only. Browser URLs never become implicit filesystem paths.
import assert from 'node:assert/strict';
import path from 'node:path';

export function validateSourceInputMap(value){
 assert(value&&typeof value==='object'&&!Array.isArray(value)&&value.files&&typeof value.files==='object'&&!Array.isArray(value.files),'Expected {files: {URL_path_without_leading_slash: absolute_file}}');
 for(const [key,file]of Object.entries(value.files)){
  assert(key&&!/[\\:%?#]/.test(key)&&!key.startsWith('/')&&!key.split('/').some(p=>!p||p==='.'||p==='..'),'Unsafe source input key: '+key);
  assert(typeof file==='string'&&path.isAbsolute(file)&&!file.split(/[\\/]/).includes('..'),'Source input must name an absolute local file: '+key);
 }
 return value;
}

export function sourceAssetLocation(site,reference,inputMap={files:{}}){
 assert(typeof reference==='string'&&reference&&!/[\\:%?#]/.test(reference)&&!reference.startsWith('//'),'Unsafe source asset URL');
 if(reference.startsWith('/')){
  const relative=reference.slice(1);
  assert(!relative.split('/').some(p=>!p||p==='.'||p==='..'),'Unsafe external source asset path');
  const file=inputMap.files?.[relative];
  assert(typeof file==='string'&&path.isAbsolute(file),'Missing exact source input mapping: '+relative);
  return {relative,file};
 }
 assert(reference.startsWith('./')||reference.startsWith('../'),'Source asset URL must be relative or an explicit same-origin path');
 const file=path.resolve(site,'viewer',reference),relative=path.relative(path.resolve(site),file).split(path.sep).join('/');
 assert(relative&&!relative.startsWith('../')&&!path.isAbsolute(relative),'Source asset escapes site');
 return {relative,file:null};
}

// checkedReference must verify encoded bytes/hash before returning parsed JSON.
// For gzip it must also verify decoded bytes/hash. No geometry is reconstructed.
export async function auditSourceAssetReferences(record,checkedReference){
 const packet=(await checkedReference(record.packet)).json;
 assert.equal(packet.id,record.assembly_id);assert.equal(packet.model.sha256,record.model_sha256);assert.equal(packet.default_variant,record.configuration);
 const inventory=(await checkedReference(packet.inventory)).json;
 assert(['public-source-assembly-inventory-v1','source-assembly-inventory-v1'].includes(inventory.schema),'Unknown source inventory schema');
 if(inventory.schema==='public-source-assembly-inventory-v1'){
  assert.equal(inventory.id,packet.id);assert.equal(inventory.source_geometry_model_sha256,packet.model.sha256);
 }else{
  assert.equal(inventory.model.sha256,packet.model.sha256);assert.equal(inventory.model.bytes,packet.model.bytes);assert.equal(inventory.part_count,packet.parts.length);
 }
 assert(Array.isArray(inventory.parts),'Missing source inventory parts');
 const keys=rows=>{const values=rows.map(p=>p.key);assert.equal(new Set(values).size,values.length,'Duplicate source owner');return values.sort();};
 assert.deepEqual(keys(inventory.parts),keys(packet.parts),'Source inventory owner mismatch');
 const manifest=(await checkedReference(packet.chunk_delivery.manifest)).json;
 assert.equal(manifest.schema,'priority-exact-source-chunks-134-v1','Unknown source chunk schema');
 assert.equal(manifest.model_sha256,packet.model.sha256);assert.equal(manifest.model_bytes,packet.model.bytes);
 assert.equal(packet.chunk_delivery.model_sha256,packet.model.sha256);assert.equal(manifest.occurrences,packet.parts.length);assert.equal(manifest.chunks.length,packet.chunk_delivery.chunk_count);
 assert.equal(manifest.all_BIN_bytes_preserved,true);assert(manifest.chunks.length>0);
 let end=0,gzip=0,raw=0;
 for(const [i,c]of manifest.chunks.entries()){
  assert.equal(c.ordinal,i);assert.equal(c.start,end);assert(Number.isSafeInteger(c.bytes)&&c.bytes>0);assert(/^[a-f0-9]{64}$/.test(c.sha256));end+=c.bytes;
  if(c.gzip){
   assert(c.gzip.url,'Missing approved gzip source transport');
   await checkedReference({...c.gzip,encoding:'gzip',decoded_bytes:c.bytes,decoded_sha256:c.sha256});gzip++;
  }
  // If both transports are declared, verify both. Corrupt gzip cannot fall back.
  if(c.url){await checkedReference({url:c.url,bytes:c.bytes,sha256:c.sha256});raw++;}
  assert(c.gzip||c.url,'Missing approved source chunk transport');
 }
 assert(Number.isSafeInteger(manifest.geometry_bytes)&&manifest.geometry_bytes>0);
 assert(end>=manifest.geometry_bytes&&end<=manifest.document.buffers[0].byteLength+3,'Incomplete source model chunks');
 return {packet,transport_counts:{gzip,raw},model_sha256:record.model_sha256,
  model_hash_basis:'Pinned original model binding plus every declared exported chunk transport; monolithic GLB not reconstructed'};
}
