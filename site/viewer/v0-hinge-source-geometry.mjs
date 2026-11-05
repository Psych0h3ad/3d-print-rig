const metadataURL=new URL('../modules/v0_hinge_source_tessellation.json',import.meta.url);
const metadataSHA256='0d0c84fb0021281ea72c340df1b5e664c9e426c417bb562e8ea26ac0a7733511';
const siteRoot=new URL('../',import.meta.url);
const verifiedAssets=new WeakSet(),leases=new WeakMap();

const fail=message=>{throw Error(`V0 hinge source geometry: ${message}`)};
const same=(a,b)=>a.length===b.length&&a.every((value,i)=>value===b[i]);
const stable=value=>Array.isArray(value)?value.map(stable):value&&typeof value==='object'?Object.fromEntries(Object.keys(value).sort().map(key=>[key,stable(value[key])])):value;
const identical=(a,b)=>JSON.stringify(stable(a))===JSON.stringify(stable(b));
const bytes=attribute=>new Uint8Array(attribute.array.buffer,attribute.array.byteOffset,attribute.array.byteLength);
const copyBytes=attribute=>Uint8Array.from(bytes(attribute));
const hash=async data=>Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)),v=>v.toString(16).padStart(2,'0')).join('');
function freeze(value){if(value&&typeof value==='object'&&!Object.isFrozen(value)){for(const item of Object.values(value))freeze(item);Object.freeze(value)}return value}
function belongs(node,root){for(let p=node;p;p=p.parent)if(p===root)return true;return false}
function positionAndIndex(geometry,expected){
 if(!geometry?.isBufferGeometry||Object.keys(geometry.attributes).length!==1||!geometry.attributes.position||geometry.attributes.position.isInterleavedBufferAttribute||!geometry.index||geometry.index.isInterleavedBufferAttribute)fail('unexpected source attributes');
 if(!(geometry.attributes.position.array instanceof Float32Array)||geometry.attributes.position.itemSize!==3||geometry.attributes.position.normalized||![Uint16Array,Uint32Array].includes(geometry.index.array.constructor)||geometry.index.itemSize!==1||geometry.index.normalized||geometry.groups.length||Object.keys(geometry.morphAttributes).length)fail('unexpected source buffer layout');
 if(geometry.attributes.position.count!==expected.vertices||geometry.index.count!==expected.triangles*3||geometry.attributes.normal)fail('source vertex/index/NORMAL contract differs');
 if(geometry.drawRange.start!==0||!(geometry.drawRange.count===Infinity||geometry.drawRange.count===geometry.index.count))fail('source draw range is incomplete');
 return {position:geometry.attributes.position,index:geometry.index};
}
async function verifyGeometry(geometry,expected){
 const attributes=positionAndIndex(geometry,expected);
 if(await hash(bytes(attributes.position))!==expected.POSITION_sha256||await hash(bytes(attributes.index))!==expected.index_sha256)fail('whole source geometry hash differs');
 return attributes;
}
async function readLimited(response,limit,signal){
 if(!response.ok)fail(`asset unavailable (${response.status})`);
 const reader=response.body?.getReader();if(!reader)fail('asset stream missing');
 const blocks=[];let total=0;
 try{while(true){signal?.throwIfAborted();const {done,value}=await reader.read();if(done)break;total+=value.byteLength;if(total>limit)fail('asset byte limit exceeded');blocks.push(value)}}
 catch(error){await reader.cancel().catch(()=>{});throw error}
 const result=new Uint8Array(total);let offset=0;for(const block of blocks){result.set(block,offset);offset+=block.byteLength}return result;
}
function disposeScene(root){
 const geometries=new Set(),materials=new Set();root?.traverse(node=>{if(node.geometry)geometries.add(node.geometry);for(const material of [].concat(node.material||[]))materials.add(material)});
 for(const geometry of geometries)geometry.dispose();for(const material of materials)material.dispose();root?.removeFromParent();root?.clear();
}

export const v0HingeSourceMetadataSHA256=metadataSHA256;
export async function loadV0HingeSourceAsset(loader,{signal,fetchAsset=fetch}={}){
 signal?.throwIfAborted();let scene;
 try{
  const metadataBytes=await readLimited(await fetchAsset(metadataURL,{signal,cache:'no-cache'}),65536,signal);
  if(await hash(metadataBytes)!==metadataSHA256)fail('metadata hash differs');
  const metadata=JSON.parse(new TextDecoder().decode(metadataBytes));
  if(metadata.schema!=='v0-source-hinge-tessellation-v1'||metadata.id!=='v0_hinge_source_tessellation'||metadata.parts.length!==2||metadata.model.encoding!=='gzip'||metadata.model.decoded_bytes>262144)fail('unsupported pinned metadata');
  const url=new URL(metadata.model.path,siteRoot);
  if(url.origin!==siteRoot.origin||!url.href.startsWith(siteRoot.href))fail('model left the pinned site root');
  const packed=await readLimited(await fetchAsset(url,{signal,cache:'no-cache'}),metadata.model.bytes,signal);
  if(packed.byteLength!==metadata.model.bytes||await hash(packed)!==metadata.model.sha256||packed[0]!==0x1f||packed[1]!==0x8b)fail('compressed model hash differs');
  const decoded=await readLimited(new Response(new Blob([packed]).stream().pipeThrough(new DecompressionStream('gzip'))),metadata.model.decoded_bytes,signal);
  if(decoded.byteLength!==metadata.model.decoded_bytes||await hash(decoded)!==metadata.model.decoded_sha256)fail('decoded model hash differs');
  const loaded=await loader.parseAsync(decoded.buffer,new URL('.',url).href);scene=loaded.scene;signal?.throwIfAborted();
  const replacements=new Map();scene.updateMatrixWorld(true);scene.traverse(node=>{if(!node.isMesh)return;const key=node.userData?.replacement_key;if(!key||replacements.has(key))fail('replacement source key missing or duplicated');replacements.set(key,node)});
  if(replacements.size!==metadata.parts.length)fail('replacement source leaf count differs');
  for(const part of metadata.parts){const node=replacements.get(part.key);if(!node||!same(node.matrixWorld.toArray(),[1,0,0,0,0,1,0,0,0,0,1,0,0,0,0,1]))fail('replacement frame differs');await verifyGeometry(node.geometry,part)}
  const asset={metadata:freeze(metadata),scene,replacements,disposed:false,receipt:freeze({metadata_sha256:metadataSHA256,model_decoded_sha256:metadata.model.decoded_sha256,model_stored_sha256:metadata.model.sha256})};verifiedAssets.add(asset);return asset;
 }catch(error){disposeScene(scene);throw error}
}
export function disposeV0HingeSourceAsset(asset){if(asset?.disposed)return;if(asset){asset.disposed=true;verifiedAssets.delete(asset);disposeScene(asset.scene);asset.replacements?.clear()}}

export async function prepareV0HingeSourceGeometry({root,manifest,profile,receipts,asset,signal}){
 if(!root?.isObject3D||!verifiedAssets.has(asset)||asset.disposed||leases.has(root))fail('root/asset lease is invalid');
 const metadata=asset.metadata,machine=metadata.source_models[manifest?.machine_id];
 if(!machine||profile?.machine_id!==manifest.machine_id||receipts?.['model.glb']!==machine.model_decoded_sha256||receipts?.['assembly_manifest.json']!==machine.manifest_sha256||receipts?.['machine_profile.json']!==machine.profile_sha256)fail('original model/manifest/profile receipt differs');
 const recordedReceipts={...receipts},parts=new Map(manifest.parts.map(part=>[part.key,part])),nodes=new Map(),staged=[];
 if(parts.size!==manifest.parts.length)fail('duplicate original source part');
 root.updateMatrixWorld(true);root.traverse(node=>{const key=node.userData?.part_key;if(parts.has(key)&&node.parent?.userData?.part_key!==key){if(nodes.has(key))fail('duplicate original source node');nodes.set(key,node)}});
 try{
  for(const expected of machine.parts){
   signal?.throwIfAborted();const part=parts.get(expected.key),node=nodes.get(expected.key),replacement=metadata.parts.find(part=>part.key===expected.replacement_key),source=asset.replacements.get(expected.replacement_key);
   if(!part||!node?.isMesh||!belongs(node,root)||part.name!==expected.name||!identical(part.source,expected.source)||!source||!replacement||!same(node.matrixWorld.toArray(),expected.world_matrix))fail('original source owner/frame differs');
   const geometry=node.geometry,attributes=positionAndIndex(geometry,expected.original_geometry),snapshot={position:copyBytes(attributes.position),index:copyBytes(attributes.index)};
   if(await hash(snapshot.position)!==expected.original_geometry.POSITION_sha256||await hash(snapshot.index)!==expected.original_geometry.index_sha256)fail('original source geometry changed');
   const clone=source.geometry.clone();const row={node,expected,part,geometry,material:node.material,parent:node.parent,world:node.matrixWorld.toArray(),localPosition:node.position.toArray(),localQuaternion:node.quaternion.toArray(),localScale:node.scale.toArray(),snapshot,clone,replacement};staged.push(row);
   const fresh=await verifyGeometry(clone,replacement);row.newSnapshot={position:copyBytes(fresh.position),index:copyBytes(fresh.index)};
  }
  if(staged.length!==2)fail('exactly two original source replacements required');signal?.throwIfAborted();
 }catch(error){for(const row of staged)row.clone.dispose();throw error}
 let state='prepared';
 const receipt=freeze({schema:'v0-source-hinge-applied-v1',machine_id:manifest.machine_id,source_model_sha256:machine.model_decoded_sha256,...asset.receipt,source_keys:staged.map(row=>row.expected.key),source_ids_preserved:true,source_materials_preserved:true,source_pose_preserved:true,physical_fit_verified:false});
 function validatePrepared(){
  signal?.throwIfAborted();if(state!=='prepared'||leases.has(root)||asset.disposed)fail('prepared lease expired');root.updateMatrixWorld(true);
  for(const key of ['model.glb','assembly_manifest.json','machine_profile.json'])if(receipts[key]!==recordedReceipts[key])fail('source receipt changed during preparation');
  for(const row of staged){
   if(row.node.geometry!==row.geometry||row.node.material!==row.material||row.node.parent!==row.parent||!belongs(row.node,root)||row.node.userData?.part_key!==row.expected.key||!same(row.node.matrixWorld.toArray(),row.world)||!same(row.node.position.toArray(),row.localPosition)||!same(row.node.quaternion.toArray(),row.localQuaternion)||!same(row.node.scale.toArray(),row.localScale)||!identical(row.part.source,row.expected.source))fail('target changed during preparation');
   const old=positionAndIndex(row.geometry,row.expected.original_geometry),fresh=positionAndIndex(row.clone,row.replacement);
   if(!same(bytes(old.position),row.snapshot.position)||!same(bytes(old.index),row.snapshot.index)||!same(bytes(fresh.position),row.newSnapshot.position)||!same(bytes(fresh.index),row.newSnapshot.index))fail('source bytes changed during preparation');
  }
 }
 function rollback(){
  if(state==='finished')fail('finished geometry ownership cannot roll back');
  if(state==='released'||state==='rolled-back')return;
  const errors=[];for(const row of staged)if(row.attempted)try{if(row.node.geometry===row.clone)row.node.geometry=row.geometry;else if(row.node.geometry!==row.geometry)fail('rollback geometry ownership changed')}catch(error){errors.push(error)}
  if(errors.length){state='rollback-failed';throw new AggregateError(errors,'V0 hinge source geometry rollback failed')}
  if(leases.get(root)===lease)leases.delete(root);for(const row of staged)row.clone.dispose();state='rolled-back';
 }
 const lease={receipt,get state(){return state},commit(){
  try{validatePrepared();for(const row of staged){row.attempted=true;row.node.geometry=row.clone}state='committed';leases.set(root,lease);return receipt}
  catch(error){try{rollback()}catch(rollbackError){throw new AggregateError([error,rollbackError],'V0 hinge source geometry commit/rollback failed')}throw error}
 },rollback,finish(){
  if(state!=='committed')fail('geometry was not committed');
  lease.verify();const stillUsed=new Set();root.traverse(node=>{if(node.geometry)stillUsed.add(node.geometry)});state='finished';const errors=[];for(const geometry of new Set(staged.map(row=>row.geometry)))if(!stillUsed.has(geometry))try{geometry.dispose()}catch(error){errors.push(error)}if(errors.length)throw new AggregateError(errors,'V0 hinge source geometry postcommit cleanup failed');return receipt;
 },release(){
  if(state==='prepared'||state==='committed'){rollback();return}
  if(state==='finished'){leases.delete(root);state='released'}
 },verify(){
  if(!['committed','finished'].includes(state)||leases.get(root)!==lease)fail('applied geometry lease expired');
  for(const row of staged){if(row.node.geometry!==row.clone||row.node.userData?.part_key!==row.expected.key||!belongs(row.node,root))fail('applied source geometry owner changed');const current=positionAndIndex(row.clone,row.replacement);if(!same(bytes(current.position),row.newSnapshot.position)||!same(bytes(current.index),row.newSnapshot.index))fail('applied geometry bytes changed')}
  return receipt;
 }};
 return lease;
}
export function guardV0HingeSourceGeometry(root){const lease=leases.get(root);if(!lease)fail('required source geometry receipt missing');return lease.verify()}
export async function applyV0HingeSourceGeometry({loader,root,manifest,profile,receipts,signal,fetchAsset}){
 const asset=await loadV0HingeSourceAsset(loader,{signal,fetchAsset});let lease;
 try{lease=await prepareV0HingeSourceGeometry({root,manifest,profile,receipts,asset,signal});lease.commit();lease.finish();return lease.receipt}
 catch(error){if(lease&&lease.state!=='finished')lease.rollback();throw error}
 finally{disposeV0HingeSourceAsset(asset)}
}
