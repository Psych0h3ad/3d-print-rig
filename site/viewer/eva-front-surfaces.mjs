import {loadExternalComponent} from './component-assets.mjs?v=9f8ef058f1297ab60e53';

const sha=/^[a-f0-9]{64}$/;
const same=(a,b)=>JSON.stringify(a)===JSON.stringify(b);
const loads=new WeakMap();
const xyz=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const names=p=>Array.isArray(p)&&p.length&&p.every(n=>typeof n==='string'&&n);
export const evaFrontOwnerMode=owner=>owner.mode??'source_patch';
function nativeDescriptor(d,limit){
 if(!d||typeof d.path!=='string'||!d.path||/^[\/\\]|[\\:#?]/.test(d.path)||d.path.split('/').some(p=>!p||p==='.'||p==='..')
  ||!sha.test(d.sha256)||!Number.isSafeInteger(d.bytes)||d.bytes<=0||d.bytes>limit
  ||![undefined,'gzip'].includes(d.encoding)||d.encoding==='gzip'&&(!sha.test(d.decoded_sha256)||!Number.isSafeInteger(d.decoded_bytes)||d.decoded_bytes<=0||d.decoded_bytes>16_000_000))
  throw Error('Invalid EVA native front descriptor');
}
export function validateEvaFrontRegistry(registry){
 if(registry?.schema!=='3d-print-rig-eva-front-surfaces-v1'
  ||registry.source_solids_modified!==false||registry.supports_removed!==false
  ||!registry.asset?.external||!sha.test(registry.asset?.files?.['model.glb']?.decoded_sha256)
  ||!registry.owners||Object.keys(registry.owners).length<4)
  throw Error('Invalid EVA front surface registry');
 for(const [id,owner]of Object.entries(registry.owners)){
  const mode=evaFrontOwnerMode(owner);
  if(!['source_patch','native_export'].includes(mode))throw Error('Unknown EVA front owner mode');
  if(owner.id!==id||!sha.test(owner.model_sha256)||!sha.test(owner.source_step_sha256)
   ||!xyz(owner.source_origin_mm)||!Array.isArray(owner.targets)||!owner.targets.length
   ||new Set(owner.targets.map(t=>t.part_key)).size!==owner.targets.length)
   throw Error('Invalid EVA front surface owner');
  for(const target of owner.targets){
   if(typeof target.part_key!=='string'||!target.part_key||mode==='source_patch'&&(typeof target.patch_key!=='string'||!target.patch_key)
    ||!Array.isArray(target.source_path)||!target.source_path.length||target.source_path.some(p=>typeof p!=='string'||!p)
    ||!sha.test(target.source_brep_sha256))throw Error('Invalid EVA front surface identity');
  }
  if(mode==='source_patch'){
   if(owner.patch_required!==undefined&&owner.patch_required!==true)throw Error('Source patch cannot be waived');
  }else{
   const native=owner.native_export;
   if(owner.patch_required!==false||!sha.test(owner.metadata_sha256)||typeof owner.configuration_id!=='string'||!owner.configuration_id
    ||!native||!same(native.required_views,['standalone','installed'])||!native.external?.local_directory
    ||!names(Object.keys(native.surfaces||{}))||!same(Object.keys(native.surfaces).sort(),owner.targets.map(t=>t.part_key).sort())
    ||!owner.targets.some(t=>t.part_key===native.ray_part_key))throw Error('Incomplete EVA native front owner');
   let base;try{base=new URL(native.external.base_url)}catch{throw Error('Invalid EVA native front origin')}
   if(base.protocol!=='https:'||base.username||base.password||!base.hostname.includes('.')||base.search||base.hash)throw Error('Invalid EVA native front origin');
   nativeDescriptor(native.witness,300_000);nativeDescriptor(native.audit,1_000_000);nativeDescriptor(native.rays,100_000);
   for(const d of Object.values(native.surfaces))nativeDescriptor(d,4_000_000);
   for(const target of owner.targets)if(target.patch_key!==undefined||target.source_sha256!==owner.source_step_sha256
    ||!names(target.source_label_path)||typeof target.definition_label!=='string'||!target.definition_label
    ||typeof target.source_revision!=='string'||!target.source_revision||!Array.isArray(target.native_bounds_mm)
    ||target.native_bounds_mm.length!==2||!target.native_bounds_mm.every(xyz)
    ||target.native_bounds_mm[0].some((n,k)=>n>target.native_bounds_mm[1][k]))throw Error('Invalid EVA native front source identity');
  }
 }
}
export async function loadEvaFrontSurfaces(loader,pageUrl){
 const url=new URL('../EVA_FRONT_SURFACES.json?v=5a7cb46eed288ef3189a',pageUrl).href;
 let cache=loads.get(loader);if(!cache){cache=new Map();loads.set(loader,cache)}
 if(!cache.has(url))cache.set(url,(async()=>{
  const response=await fetch(url,{cache:'no-cache'});if(!response.ok)throw Error('EVA front surfaces unavailable');
  const registry=await response.json();validateEvaFrontRegistry(registry);
  const {meta,gltf}=await loadExternalComponent(loader,registry.asset,pageUrl);
  if(meta.id!==registry.asset.component_id||meta.source_solids_modified!==false||meta.supports_removed!==false)
   throw Error('EVA front surface provenance changed');
  return {registry,patchRoot:gltf.scene,patchMeta:meta};
 })().catch(error=>{cache.delete(url);throw error}));
 return cache.get(url);
}
function leaves(root){
 const result=new Map();root.traverse(node=>{
  const key=node.userData?.part_key;if(!key)return;
  for(let parent=node.parent;parent;parent=parent.parent)if(String(parent.userData?.part_key)===String(key))return;
  if(result.has(String(key)))throw Error('Duplicate EVA surface occurrence');
  result.set(String(key),node);
 });return result;
}
function singleMesh(node){
 const meshes=[];node.traverse(m=>{if(m.isMesh)meshes.push(m)});
 if(meshes.length!==1||Array.isArray(meshes[0].material))throw Error('Unexpected EVA front surface primitives');
 return meshes[0];
}
function checkedGeometry(geometry,{requireNormals=true}={}){
 const position=geometry?.getAttribute('position'),normal=geometry?.getAttribute('normal'),index=geometry?.getIndex();
 if(!position||requireNormals&&!normal||position.itemSize!==3||normal&&(normal.itemSize!==3||position.count!==normal.count)
  ||!index||index.count%3||!position.count||!index.count)throw Error('Incomplete EVA front surface mesh');
 for(let i=0;i<position.count;i++){
  if(![position.getX(i),position.getY(i),position.getZ(i)].every(Number.isFinite)
   ||normal&&(![normal.getX(i),normal.getY(i),normal.getZ(i)].every(Number.isFinite)
    ||Math.abs(Math.hypot(normal.getX(i),normal.getY(i),normal.getZ(i))-1)>2e-5))
   throw Error('Invalid EVA front surface position/normal');
 }
 for(let i=0;i<index.count;i++)if(!Number.isSafeInteger(index.getX(i))||index.getX(i)<0||index.getX(i)>=position.count)
  throw Error('Invalid EVA front surface index');
 geometry.computeBoundingBox();return geometry.boundingBox;
}
// Original CAD solids, occurrence nodes, materials and motion ownership remain
// intact. Only source-derived rendering surfaces replace the three printed
// leaves whose opposed zero-volume faces obscure the native fan grille.
export function applyEvaFrontSurfaces(root,meta,modelSha256,{registry,patchRoot,patchMeta,sourceOriginMm=null,metadataSha256=null}){
 validateEvaFrontRegistry(registry);
 const id=meta.id||meta.machine_id,owner=registry.owners[id];
 if(!owner){if(meta.eva_generation)throw Error('Unregistered EVA front surface owner');return false}
 if(evaFrontOwnerMode(owner)==='native_export'){
  validateEvaNativeFrontBinding(root,meta,modelSha256,owner,{metadataSha256,sourceOriginMm});
  // Native author-export geometry is retained. A successful binding is not an
  // aperture/native-normal pass: the mandatory actual release gate supplies it.
  return owner.targets.length;
 }
 const source=meta.source?.source_step_sha256||meta.source_sha256;
 const composedSources=meta.eva_composition?.part_sources;
 const sourceMatches=composedSources&&Array.isArray(meta.parts)?owner.targets.every(target=>{
  const native=composedSources[target.part_key],part=meta.parts.find(p=>p.key===target.part_key);
  return native?.source_sha256===owner.source_step_sha256&&part?.source_sha256===owner.source_step_sha256
   &&same(native.source_path,target.source_path)&&same(part.source_path,target.source_path);
 }):source===owner.source_step_sha256;
 const declaredOrigin=meta.source_origin_mm||meta.source_origin_native_zup_mm;
 if(sourceOriginMm!==null&&(!xyz(sourceOriginMm)||declaredOrigin&&!same(declaredOrigin,sourceOriginMm)))
  throw Error('EVA front profile/source frame changed');
 const origin=declaredOrigin||sourceOriginMm||[0,0,0];
 if(modelSha256!==owner.model_sha256||!sourceMatches||!same(origin,owner.source_origin_mm))
  throw Error('Stale EVA front surface source/frame');
 if(patchMeta?.id!==registry.asset.component_id||patchMeta.source_solids_modified!==false
  ||patchMeta.supports_removed!==false||!Array.isArray(patchMeta.parts)
  ||new Set(patchMeta.parts.map(p=>String(p.key))).size!==patchMeta.parts.length
  ||!Array.isArray(meta.parts)||new Set(meta.parts.map(p=>String(p.key))).size!==meta.parts.length)
  throw Error('Invalid EVA front surface manifest');
 const original=leaves(root),patches=leaves(patchRoot),parts=new Map(meta.parts.map(p=>[String(p.key),p]));
 const patchParts=new Map(patchMeta.parts.map(p=>[String(p.key),p])),pending=[];
 root.updateMatrixWorld(true);patchRoot.updateMatrixWorld(true);
 for(const target of owner.targets){
  const part=parts.get(target.part_key),patchPart=patchParts.get(target.patch_key);
  if(!part||part.printed===false||!['base','accent'].includes(part.appearance_role)||!same(part.source_path,target.source_path)
   ||!patchPart||patchPart.source_brep_sha256!==target.source_brep_sha256
   ||!original.has(target.part_key)||!patches.has(target.patch_key))throw Error('EVA front source occurrence changed');
  const mesh=singleMesh(original.get(target.part_key)),replacement=singleMesh(patches.get(target.patch_key));
  if(mesh.matrixWorld.elements.some((n,i)=>Math.abs(n-root.matrixWorld.elements[i])>1e-10))
   throw Error('EVA front mesh frame changed');
  if(replacement.matrixWorld.elements.some((n,i)=>Math.abs(n-(i%5===0?1:0))>1e-10))
   throw Error('EVA front patch frame changed');
  const geometry=replacement.geometry.clone();
  geometry.translate(-origin[0]*.001,-origin[2]*.001,origin[1]*.001);
  const oldBox=checkedGeometry(mesh.geometry,{requireNormals:false}),newBox=checkedGeometry(geometry);
  for(const side of ['min','max'])for(const axis of ['x','y','z'])
   if(Math.abs(oldBox[side][axis]-newBox[side][axis])>.00003)throw Error('EVA front surface envelope changed');
  pending.push({mesh,geometry,key:target.part_key,patchKey:target.patch_key});
 }
 for(const {mesh,geometry,key,patchKey}of pending){
  mesh.geometry=geometry;
  mesh.userData.eva_front_surface={part_key:key,patch_key:patchKey,model_sha256:modelSha256,
   patch_sha256:registry.asset.files['model.glb'].decoded_sha256,source_solids_modified:false,supports_removed:false};
 }
 return pending.length;
}

export function validateEvaNativeFrontBinding(root,meta,modelSha256,owner,{metadataSha256=null,sourceOriginMm=null}={}){
 if(modelSha256!==owner.model_sha256||metadataSha256!==owner.metadata_sha256)throw Error('Stale EVA native front model/metadata');
 if(!Array.isArray(meta.parts)||new Set(meta.parts.map(p=>String(p.key))).size!==meta.parts.length)throw Error('Invalid EVA native front manifest');
 const declared=meta.source_origin_mm??meta.source_origin_native_zup_mm;
 if(sourceOriginMm!==null&&(!xyz(sourceOriginMm)||declared&&!same(declared,sourceOriginMm)))throw Error('EVA native front source frame changed');
 const origin=declared??sourceOriginMm??[0,0,0];if(!same(origin,owner.source_origin_mm))throw Error('EVA native front source frame changed');
 const nodes=leaves(root),parts=new Map(meta.parts.map(p=>[String(p.key),p]));root.updateMatrixWorld(true);
 for(const target of owner.targets){
  const p=parts.get(target.part_key),source=meta.eva_composition?.part_sources?.[target.part_key];
  if(!p||p.printed!==true||!['base','accent'].includes(p.appearance_role)||p.source_sha256!==target.source_sha256
   ||p.source_revision!==target.source_revision||!same(p.source_path,target.source_path)
   ||!same(p.source_label_path,target.source_label_path)||p.definition_label!==target.definition_label
   ||(p.source_brep_sha256??p.brep_sha256)!==target.source_brep_sha256
   ||source&&(['source_sha256','source_revision','source_path','source_label_path','definition_label'].some(k=>!same(source[k],target[k]))))
   throw Error('EVA native front source occurrence changed');
  const node=nodes.get(target.part_key);if(!node)throw Error('Missing EVA native front occurrence');
  const meshes=[];node.traverse(m=>{if(m.isMesh)meshes.push(m)});if(!meshes.length)throw Error('Empty EVA native front occurrence');
  const bounds={min:[Infinity,Infinity,Infinity],max:[-Infinity,-Infinity,-Infinity]};
  for(const mesh of meshes){
   if(mesh.matrixWorld.elements.some((n,i)=>Math.abs(n-root.matrixWorld.elements[i])>1e-10))throw Error('EVA native front mesh frame changed');
   const box=checkedGeometry(mesh.geometry);for(const side of ['min','max'])for(const [i,a]of ['x','y','z'].entries())bounds[side][i]=Math[side](bounds[side][i],box[side][a]);
  }
  const world=[bounds.min,bounds.max].map(v=>[v[0]*1000+origin[0],-v[2]*1000+origin[1],v[1]*1000+origin[2]]);
  const sourceBounds=[[world[0][0],world[1][1],world[0][2]],[world[1][0],world[0][1],world[1][2]]];
  if(sourceBounds.some((v,i)=>v.some((n,k)=>Math.abs(n-target.native_bounds_mm[i][k])>.03)))throw Error('EVA native front envelope changed');
 }
 return true;
}
