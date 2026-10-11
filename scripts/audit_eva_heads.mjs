// Checks exported EVA assemblies. These checks are not native-solid clearance,
// mounting, printer travel, belt engagement, or a physical-fit certification.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
import {validateEvaVariant,validateEvaMetadata,bindEvaMeshIdentities} from '../site/viewer/eva-heads.mjs';
import {headPlan,partKey} from '../site/viewer/head-assembly.js';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';
import {createPaletteController} from '../site/viewer/palette-controller.mjs';
import {configurationById,importedVariant,collections,headBuilderDimensions,resolveVariant} from '../site/viewer/configuration-model.js';
import {createConfigurationDraft} from '../site/viewer/configuration-draft.mjs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';

const hardware=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners','probe']);
const sha=data=>createHash('sha256').update(data).digest('hex');
const triple=value=>Array.isArray(value)&&value.length===3&&value.every(Number.isFinite);
const hashPattern=/^[a-f0-9]{64}$/;
const finiteMatrix=matrix=>matrix.elements.every(Number.isFinite);
const disposed=new WeakSet();
const clone=value=>structuredClone(value);
export function evaAssemblyBounds(meta,part){
 const native=part.native_bounds_mm||part.bounds_mm,origin=meta.source_origin_mm||[0,0,0];
 assert(triple(origin),'Invalid EVA source origin');
 const bounds=part.native_bounds_mm?native.map(side=>side.map((n,i)=>n-origin[i])):native;
 if(part.native_bounds_mm&&part.bounds_mm)for(let side=0;side<2;side++)for(let axis=0;axis<3;axis++)
  assert(Math.abs(bounds[side][axis]-part.bounds_mm[side][axis])<1e-7,'EVA source-to-viewer frame mismatch '+part.key);
 return bounds;
}

export function evaSourceIdentity(part){
 const source=part.source_identity??part.source_component??part.source_path??part.source?.assembly_path;
 if(source&&typeof source==='object'&&!Array.isArray(source)){
  assert(Array.isArray(source.path)&&source.path.length&&source.path.every(s=>typeof s==='string'&&s),part.key+' malformed EVA occurrence path');
  assert(Array.isArray(source.label_path)&&source.label_path.length===source.path.length&&source.label_path.every(s=>typeof s==='string'&&s),part.key+' malformed EVA occurrence labels');
  assert(typeof source.definition_label==='string'&&source.definition_label,part.key+' missing EVA source definition');
  if(part.source_path!==undefined)assert.deepEqual(source.path,part.source_path,'Conflicting EVA source occurrence path');
  if(part.source_label_path!==undefined)assert.deepEqual(source.label_path,part.source_label_path,'Conflicting EVA source occurrence labels');
  if(part.definition_label!==undefined)assert.equal(source.definition_label,part.definition_label,'Conflicting EVA source definition');
  return source.path.join('/');
 }
 assert(typeof source==='string'&&source.trim()||Array.isArray(source)&&source.length&&source.every(s=>typeof s==='string'&&s),part.key+' missing EVA source leaf identity');
 return typeof source==='string'?source:source.join('/');
}

export function assertEvaSourceMetadata(variant,spec,meta){
 validateEvaVariant(variant,spec);validateEvaMetadata(variant,meta);
 if(variant.eva.version===null){assert.equal(variant.eva.version_scope,'source_assembly','Unconfirmed EVA patch lacks source-assembly scope');assert.equal(meta.eva_version,null,'Unconfirmed EVA patch fabricated in metadata');}
 assert.equal(spec.component_id,variant.base_asset,'EVA external ID changed');
 assert.equal(meta.parts.length,spec.parts,'EVA source leaf count changed');
 assert(hashPattern.test(meta.source_sha256||meta.native_file_sha256||meta.source?.source_step_sha256||''),'Missing EVA native source SHA-256');
 assert(meta.parts.length>0,'Empty EVA assembly');
 const identities=new Set();
 for(const part of meta.parts){
  const identity=evaSourceIdentity(part);assert(!identities.has(identity),'Duplicate EVA native instance identity '+identity);identities.add(identity);
  const commit=part.source_revision??part.source_commit??part.source?.revision??part.source?.commit??meta.source_revision??meta.source_commit;
  assert.equal(commit,variant.eva.source_revision,'Mixed EVA part source generation '+part.key);
  if(part.eva_generation!==undefined)assert.equal(part.eva_generation,variant.eva.generation,'Mixed EVA part generation '+part.key);
  if(part.eva_version!==undefined)assert.equal(part.eva_version,variant.eva.version,'Mixed EVA part version '+part.key);
  assert(Array.isArray(part.eva_companions),'Missing EVA category membership '+part.key);
  assert.equal(new Set(part.eva_companions).size,part.eva_companions.length,'Duplicate EVA companion membership '+part.key);
  const role=appearanceRole(part);
  assert.equal(role,part.appearance_role||null,'Source role overridden by unrelated legacy identity '+part.key);
  if(part.eva_companions.some(category=>hardware.has(category)))assert(!['base','accent','frame','cnc'].includes(role),'EVA purchased hardware is palette mutable '+part.key);
  if(['base','accent'].includes(role))assert(!['hardware','purchased','metal','motor','fan'].includes(part.material),'Purchased EVA leaf has printed role '+part.key);
  if(part.material==='printed'||part.component==='printed')assert(['base','accent','optical'].includes(role),'Unclassified printed EVA leaf '+part.key);
  const bounds=part.native_bounds_mm||part.bounds_mm;
  assert(Array.isArray(bounds)&&bounds.length===2&&bounds.every(triple),'Missing native EVA bounds '+part.key);
  assert(bounds[0].every((n,i)=>n<=bounds[1][i]),'Reversed native EVA bounds '+part.key);
 }
 // A hotend/nozzle may be one native compound. Require its declared point to
 // remain in a nozzle companion's source envelope, rather than inventing a tip.
 if(meta.nozzle_mm!==undefined){
  assert(triple(meta.nozzle_mm),'Invalid native EVA nozzle point');
  assert.deepEqual(variant.fit.nozzle_mm,meta.nozzle_mm,'EVA nozzle datum changed');
  assert(variant.eva.companions.nozzle.some(key=>{
   const p=meta.parts.find(p=>p.key===key),b=evaAssemblyBounds(meta,p);
   return meta.nozzle_mm.every((n,i)=>n>=b[0][i]-.1&&n<=b[1][i]+.1);
  }),'EVA nozzle datum outside native nozzle companion');
 }
 return identities;
}

export async function checkedEvaArtifacts(spec,directory){
 assert(spec.external&&spec.files?.['parts.json']&&spec.files?.['model.glb'],'Incomplete EVA external descriptor');
 const root=path.resolve(directory),realRoot=await fs.realpath(root),decoded={},pins={};
 for(const [name,descriptor]of Object.entries(spec.files)){
  assert(typeof descriptor.path==='string'&&descriptor.path&&!descriptor.path.startsWith('/')&&!descriptor.path.includes('..')&&!/[\\:]/.test(descriptor.path),'Unsafe EVA asset path');
  assert(Number.isSafeInteger(descriptor.bytes)&&descriptor.bytes>0&&descriptor.bytes<=180_000_000&&hashPattern.test(descriptor.sha256),'Invalid EVA asset checksum descriptor');
  const filename=path.resolve(root,descriptor.path);assert(filename.startsWith(root+path.sep),'EVA artifact escaped its explicit root');
  const realFile=await fs.realpath(filename);assert(realFile.startsWith(realRoot+path.sep),'EVA asset link escaped its explicit public-source root');
  const bytes=await fs.readFile(filename);assert.equal(bytes.length,descriptor.bytes,name+' byte length changed');assert.equal(sha(bytes),descriptor.sha256,name+' SHA-256 changed');
  assert(!descriptor.encoding||descriptor.encoding==='gzip','Unsupported EVA asset encoding');
  const data=descriptor.encoding==='gzip'?gunzipSync(bytes):bytes;
  if(descriptor.encoding==='gzip'){
   assert(Number.isSafeInteger(descriptor.decoded_bytes)&&hashPattern.test(descriptor.decoded_sha256),'Missing decoded EVA checksum');
   assert.equal(data.length,descriptor.decoded_bytes,name+' decoded byte length changed');assert.equal(sha(data),descriptor.decoded_sha256,name+' decoded SHA-256 changed');
  }
  pins[name]={path:descriptor.path,bytes:bytes.length,sha256:sha(bytes),decoded_bytes:data.length,decoded_sha256:sha(data)};decoded[name]=data;
 }
 return {decoded,pins};
}

export function evaGlbDocument(bytes){
 assert(bytes.length>=28&&bytes.readUInt32LE(0)===0x46546c67,'Invalid EVA GLB');
 assert.equal(bytes.readUInt32LE(4),2,'Unsupported EVA GLB version');assert.equal(bytes.readUInt32LE(8),bytes.length,'Truncated EVA GLB');
 let offset=12,document,binary;
 while(offset<bytes.length){
  assert(offset+8<=bytes.length,'Truncated EVA GLB chunk');const size=bytes.readUInt32LE(offset),type=bytes.readUInt32LE(offset+4);assert.equal(size%4,0,'Unaligned EVA GLB chunk');offset+=8;assert(offset+size<=bytes.length,'Truncated EVA GLB chunk body');
  if(type===0x4e4f534a){assert(!document,'Duplicate EVA GLB JSON');document=JSON.parse(bytes.subarray(offset,offset+size).toString('utf8'));}
  else if(type===0x004e4942){assert(!binary,'Duplicate EVA GLB BIN');binary=bytes.subarray(offset,offset+size);}
  else assert.fail('Unknown EVA GLB chunk');offset+=size;
 }
 assert(document&&binary,'Missing EVA GLB document/binary');assert.equal(document.asset?.version,'2.0');
 assert.equal(document.buffers?.length,1,'EVA GLB must be self contained');assert(!document.buffers[0].uri,'External EVA GLB buffer');
 assert(Number.isSafeInteger(document.buffers[0].byteLength)&&document.buffers[0].byteLength<=binary.length&&binary.length-document.buffers[0].byteLength<4,'EVA buffer length mismatch');
 assert(!(document.images||[]).length,'Unexpected EVA texture requires a separate source/material review');
 assert(!(document.extensionsRequired||[]).length,'Unexpected EVA compression/extension requires review');
 assert(!(document.skins||[]).length&&!(document.animations||[]).length,'Unexpected EVA deforming/animated hardware');
 return document;
}

function nativeBox(displayBox){
 return [[displayBox.min.x,-displayBox.max.z,displayBox.min.y],[displayBox.max.x,-displayBox.min.z,displayBox.max.y]].map(side=>side.map(n=>n*1000));
}
function snapshot(root){
 root.updateMatrixWorld(true);const rows=[];root.traverse(mesh=>{if(!mesh.isMesh)return;rows.push({key:partKey(mesh),matrix:[...mesh.matrixWorld.elements],visible:mesh.visible,material:[].concat(mesh.material).map(m=>({color:m.color.toArray(),metalness:m.metalness,roughness:m.roughness,opacity:m.opacity,transparent:m.transparent}))});});
 return rows.sort((a,b)=>(a.key+'\0'+JSON.stringify(a.matrix)).localeCompare(b.key+'\0'+JSON.stringify(b.matrix)));
}

export function assertEvaExportedLeaves(variant,meta,root,{boundsToleranceMm=.15,normalTolerance=.003,allowSourceFlatNormals=false}={}){
 assert(Number.isFinite(boundsToleranceMm)&&boundsToleranceMm>0&&boundsToleranceMm<=.25,'Invalid EVA mesh envelope tolerance');
 const rows=new Map(meta.parts.map(p=>[p.key,p])),nodes=new Map(),meshRows=[],seenGeometry=new WeakSet();let vertices=0,normalVertices=0,flatTriangles=0,triangles=0,maxBoundsError=0,maxNormalError=0;
 root.updateMatrixWorld(true);
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;const key=partKey(mesh),part=rows.get(key);assert(part,'Unregistered EVA GLB leaf '+key);
  assert(finiteMatrix(mesh.matrixWorld),'Non-finite EVA instance '+key);assert(mesh.visible,'Hidden native EVA leaf '+key);
  if(nodes.has(key))assert.equal(mesh.parent,nodes.get(key).parent,'Duplicate EVA GLB instance '+key);else nodes.set(key,mesh);
  const nativeIdentity=evaSourceIdentity(part),glbIdentity=mesh.userData.source_identity??mesh.userData.source_component??mesh.userData.source_path;
  if(glbIdentity!==undefined)assert.equal(evaSourceIdentity({...mesh.userData,key}),nativeIdentity,'GLB EVA source identity mismatch '+key);
  const glbRevision=mesh.userData.source_revision??mesh.userData.source_commit;if(glbRevision!==undefined)assert.equal(glbRevision,variant.eva.source_revision,'GLB EVA source revision mismatch '+key);
  if(mesh.userData.appearance_role!==undefined)assert.equal(mesh.userData.appearance_role||null,part.appearance_role||null,'GLB EVA palette role mismatch '+key);
  const materials=[].concat(mesh.material);assert(materials.length,'Missing EVA material '+key);
  for(const m of materials){assert(m.color.toArray().every(n=>Number.isFinite(n)&&n>=0&&n<=1),'Invalid EVA material color '+key);assert([m.metalness,m.roughness,m.opacity].every(n=>Number.isFinite(n)&&n>=0&&n<=1),'Invalid EVA PBR material '+key);}
  const geometry=mesh.geometry,position=geometry.getAttribute('position'),normal=geometry.getAttribute('normal'),indices=geometry.getIndex();
  assert(position&&position.itemSize===3&&position.count>0,'Missing EVA source positions '+key);
  assert(normal&&normal.itemSize===3&&normal.count===position.count||!normal&&allowSourceFlatNormals&&materials.every(m=>m.flatShading),'Missing EVA position/unit normal data '+key);
  assert(!geometry.morphAttributes.position?.length,'Deformed native EVA hardware '+key);
  if(!seenGeometry.has(geometry)){
   seenGeometry.add(geometry);vertices+=position.count;if(normal)normalVertices+=normal.count;
   for(let i=0;i<position.count;i++){
    const p=[position.getX(i),position.getY(i),position.getZ(i)];assert(p.every(Number.isFinite),'Non-finite EVA vertex '+key);
    if(normal){const n=[normal.getX(i),normal.getY(i),normal.getZ(i)];assert(n.every(Number.isFinite),'Non-finite EVA normal '+key);const error=Math.abs(Math.hypot(...n)-1);maxNormalError=Math.max(maxNormalError,error);assert(error<=normalTolerance,'Non-unit EVA normal '+key);}
   }
   const count=indices?indices.count:position.count;assert.equal(count%3,0,'Truncated EVA triangles '+key);triangles+=count/3;
   if(indices)for(let i=0;i<indices.count;i++){const index=indices.getX(i);assert(Number.isSafeInteger(index)&&index>=0&&index<position.count,'Out-of-range EVA mesh index '+key);}
   if(!normal)for(let i=0;i<count;i+=3){
    const ids=[i,i+1,i+2].map(j=>indices?indices.getX(j):j),a=new THREE.Vector3().fromBufferAttribute(position,ids[0]),b=new THREE.Vector3().fromBufferAttribute(position,ids[1]),c=new THREE.Vector3().fromBufferAttribute(position,ids[2]);
    const cross=b.sub(a).cross(c.sub(a));assert(cross.toArray().every(Number.isFinite)&&cross.lengthSq()>0,'Degenerate authored EVA flat-shading winding '+key);flatTriangles++;
   }
  }
  meshRows.push({key,mesh,part});
 });
 assert.equal(new Set(meshRows.map(r=>r.key)).size,meta.parts.length,'Missing exported EVA source leaf');
 const byKey=new Map();for(const row of meshRows){if(!byKey.has(row.key))byKey.set(row.key,[]);byKey.get(row.key).push(row.mesh);}
 for(const part of meta.parts){
  const meshes=byKey.get(part.key);assert(meshes?.length,'Missing exported EVA part '+part.key);
  // Multi-material primitives are allowed only beneath one named logical node.
  if(meshes.length>1){const parent=meshes[0].parent;assert(partKey(parent)===part.key&&meshes.every(m=>m.parent===parent),'Duplicate EVA part export '+part.key);}
  const box=new THREE.Box3();for(const mesh of meshes){mesh.geometry.computeBoundingBox();box.union(mesh.geometry.boundingBox.clone().applyMatrix4(mesh.matrixWorld));}
  assert(!box.isEmpty(),'Empty EVA source envelope '+part.key);const actual=nativeBox(box),expected=evaAssemblyBounds(meta,part);
  for(let side=0;side<2;side++)for(let axis=0;axis<3;axis++){const error=Math.abs(actual[side][axis]-expected[side][axis]);assert(Number.isFinite(error)&&error<=boundsToleranceMm,'EVA GLB/native source placement changed '+part.key);maxBoundsError=Math.max(maxBoundsError,error);}
 }
 for(const [category,keys]of Object.entries(variant.eva.companions))for(const key of keys)assert(byKey.has(key),'Missing actual EVA companion '+category+'/'+key);
 return {meshRows,vertices,normalVertices,flatTriangles,triangles,maxBoundsError,maxNormalError,parts:byKey.size};
}

export function assertEvaPalettes(meta,root){
 const records=new Map(meta.parts.map(p=>[p.key,p])),nodes=new Map();root.traverse(mesh=>{if(!mesh.isMesh)return;const key=partKey(mesh);if(!nodes.has(key))nodes.set(key,new THREE.Group());nodes.get(key).children.push(mesh);});
 // Synthetic grouping only exposes the actual meshes to the production
 // material controller. It neither changes their parents nor their poses.
 const before=snapshot(root),controller=createPaletteController(nodes,records);
 const baseline=snapshot(root);assert.equal(new Set(controller.rows.map(r=>r.material)).size,controller.rows.length,'EVA materials remain shared across source instances');
 const palettes=[{base:'#19d5f2',accent:'#f75413',frame:'#ab34d5',hardware:'#ffff00'},{base:'#f75413',accent:'#19d5f2',frame:'#2389ab',hardware:'#111111'},{}];
 let protectedChecks=0,printedChecks=0;
 for(const palette of palettes){
  controller.setPalette(palette);
  for(const row of controller.rows){
   const expected=['base','accent'].includes(row.role)&&palette[row.role]?new THREE.Color(palette[row.role]):row.original;
   assert(row.material.color.equals(expected),'EVA palette changed purchased/native material '+row.key);
   if(['base','accent'].includes(row.role)){assert.equal(row.material.metalness,0);assert.equal(row.material.roughness,.72);printedChecks++;}
   else {assert.equal(row.material.metalness,row.metalness);assert.equal(row.material.roughness,row.roughness);protectedChecks++;}
  }
 }
 assert.deepEqual(snapshot(root),baseline,'EVA native palette reset changed mesh placement/material');
 for(const [index,original]of before.entries()){const after=baseline[index];assert.equal(after.key,original.key,'EVA palette lost a native leaf');assert.deepEqual(after.matrix,original.matrix);if(!['base','accent'].includes(records.get(original.key).appearance_role))assert.deepEqual(after.material,original.material,'EVA purchased hardware finish changed during material isolation');}
 const atomic=snapshot(root);assert.throws(()=>controller.setPalette({base:'#bad'}),/Invalid palette/);assert.deepEqual(snapshot(root),atomic,'Invalid EVA palette mutated assembly');
 return {printedChecks,protectedChecks,palettes:palettes.length,nativeReset:true};
}

export function evaTestCatalog(additions,base=null){
 if(base)return {...withHeadAdditions(base,additions),dimensions:headBuilderDimensions};
 const raw={assets:{},base_assets:{},sources:[],variants:[]};
 for(const [dimension,field]of Object.entries(collections)){
  const supplied=new Set((additions[field]||[]).map(o=>o.id));raw[field]=[...new Set(additions.variants.map(v=>v[dimension]))].filter(id=>id!==undefined&&!supplied.has(id)).map(id=>({id,label:id}));
 }
 return {...withHeadAdditions(raw,additions),dimensions:headBuilderDimensions};
}

export function assertEvaSelectionLifecycle(catalog,variants){
 assert(variants.length&&variants.every(v=>v.eva),'No EVA source generations registered');let transitions=0,saves=0;
 for(const variant of variants){
  assert.equal(configurationById(catalog,variant.id),variant,'EVA exact registered ID not reachable');
  const saved=JSON.parse(JSON.stringify({configuration:variant.id,...(catalog.machine_id?{machine:catalog.machine_id}:{})}));
  assert.equal(importedVariant(catalog,saved),variant,'EVA save/load source ID changed');saves++;
  assert.throws(()=>importedVariant(catalog,{configuration:variant.id+'__missing'}),'Unregistered EVA save accepted');
  const plan=headPlan(variant);assert.equal(plan.base,variant.base_asset);assert.deepEqual(plan.translation,[0,0,0]);assert.equal(plan.hidden.size,0);assert.equal(plan.modules.length,0);
  const another=variants.find(v=>v.eva.generation!==variant.eva.generation);
  if(!another)continue;
  const a=resolveVariant(catalog,{...variant,toolhead:another.toolhead},'toolhead');assert(a&&a.eva?.generation===another.eva.generation,'EVA generation B unavailable through production chooser');
  const b=resolveVariant(catalog,{...a,toolhead:variant.toolhead},'toolhead');assert(b&&b.eva?.generation===variant.eva.generation,'EVA generation A lost after switching');
  const draft=createConfigurationDraft(catalog,variant);assert(draft.choose('toolhead',another.toolhead));assert(draft.pending);assert.equal(draft.current.eva.generation,another.eva.generation);draft.reset(variant);assert.equal(draft.current,variant);assert.equal(draft.pending,false);transitions+=2;
 }
 return {transitions,saves,scope:'Production exact IDs, generation choices, draft reset and saved selection; no DOM/GPU or printer installation claim'};
}

function dispose(root){root.traverse(mesh=>{if(!mesh.isMesh)return;for(const resource of [mesh.geometry,...[].concat(mesh.material)])if(!disposed.has(resource)){resource.dispose();disposed.add(resource);}});}

export async function auditEvaHeads(catalogRoot,externalDirectory,{catalog=null}={}){
 const directory=path.resolve(catalogRoot),additionBytes=await fs.readFile(path.join(directory,'HEAD_ADDITIONS.json')),additions=JSON.parse(additionBytes);
 let baseBytes;
 if(!catalog){
  let base;try{baseBytes=await fs.readFile(path.join(directory,'TOOLHEAD_CONFIGURATIONS.json'));base=JSON.parse(baseBytes);}catch(e){if(e.code!=='ENOENT')throw e;}
  catalog=evaTestCatalog(additions,base);
 }
 const variants=catalog.variants.filter(v=>v.eva),generations=[...new Set(variants.map(v=>v.eva.generation))].sort();
 assert.deepEqual(generations,[2,3],'EVA actual-asset audit requires both registered source generations');
 const report={schema:'3d-print-rig-eva-head-audit-v1',started_at_utc:new Date().toISOString(),passed:false,failures:[],open_findings:variants.filter(v=>v.eva.version===null).map(v=>({configuration:v.id,kind:'source_patch_unconfirmed',generation:v.eva.generation,version_scope:v.eva.version_scope,source_revision:v.eva.source_revision})),input_sha256:{'HEAD_ADDITIONS.json':sha(additionBytes)},code_sha256:{},artifacts:{},assets:[],configurations:variants.map(v=>({id:v.id,base_asset:v.base_asset,generation:v.eva.generation,version:v.eva.version,version_scope:v.eva.version_scope||'verified_patch',source_revision:v.eva.source_revision})),selection:assertEvaSelectionLifecycle(catalog,variants),scope:{actual_exported_companions:true,source_identity:true,finite_positions_and_unit_normals:true,native_metadata_bounds:true,contrasting_reversed_palettes_and_reset:true,browser_visual_review:false,native_solid_intersection_review:false,whole_machine_travel_review:false,physical_fit_certified:false}};
 report.scope.artifact_checks='Every file registered in the EVA external descriptors; source recipes/notices require checksum entries to join this scope';
 report.scope.normal_checks='Provided NORMAL attributes require finite unit vectors. Only the pinned public V-Minion source can retain authored derivative flat shading; its triangle winding is checked and counted separately.';
 if(baseBytes)report.input_sha256['TOOLHEAD_CONFIGURATIONS.json']=sha(baseBytes);
 report.composed_catalog_sha256=sha(JSON.stringify(catalog));
 for(const filename of ['audit_eva_heads.mjs','../site/viewer/eva-heads.mjs','../site/viewer/palette-controller.mjs','../site/viewer/configuration-model.js','../site/viewer/configuration-draft.mjs','../site/viewer/head-additions.mjs','../site/viewer/head-assembly.js','../site/viewer/appearance-role.mjs','../site/viewer/vendor/GLTFLoader.js'])report.code_sha256[filename]=sha(await fs.readFile(new URL(filename,import.meta.url)));
 const cache=new Map();
 try{
  for(const variant of variants){
   const spec=catalog.base_assets[variant.base_asset];assert(spec,'Unregistered EVA asset '+variant.base_asset);
   if(cache.has(variant.base_asset)){validateEvaMetadata(variant,cache.get(variant.base_asset).meta);continue;}
   const {decoded,pins}=await checkedEvaArtifacts(spec,externalDirectory);report.artifacts[variant.base_asset]=pins;
   const meta=JSON.parse(decoded['parts.json']);assertEvaSourceMetadata(variant,spec,meta);const bytes=decoded['model.glb'];evaGlbDocument(bytes);
   const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
   // This pinned public V-Minion export may omit NORMAL. GLTFLoader then
   // selects derivative flat shading. No other missing-normal source is
   // accepted without its own source-backed regression and provenance.
   const flatSource=meta.source_model_sha256==='b394124d0ef44519aa24cd005d1433305f35a545c3b8d5f9c8cccb8268fb0175'
    &&meta.source?.source_step_sha256==='46650c0be0527b0f799a6ebd5cde210254caafdc4c436f558857fa30c17e9b94'
    &&variant.eva.generation===2&&variant.eva.source_revision==='6811558082d6a1797dac160ca027692cd7904a4b';
   bindEvaMeshIdentities(meta,gltf.scene);const checked=assertEvaExportedLeaves(variant,meta,gltf.scene,{allowSourceFlatNormals:flatSource}),palette=assertEvaPalettes(meta,gltf.scene);
   cache.set(variant.base_asset,{root:gltf.scene,meta});report.assets.push({id:variant.base_asset,generation:variant.eva.generation,source_revision:variant.eva.source_revision,parts:checked.parts,vertices:checked.vertices,triangles:checked.triangles,source_normal_vertices:checked.normalVertices,source_flat_winding_triangles:checked.flatTriangles,max_native_bounds_error_mm:checked.maxBoundsError,max_unit_normal_error:checked.maxNormalError,palette});
  }
  // Exercise actual cached assemblies A→B→A; no stale generation stays visible.
  for(const variant of variants){
   const other=variants.find(v=>v.eva.generation!==variant.eva.generation),baseline=snapshot(cache.get(variant.base_asset).root);
   for(const current of [variant,other,variant]){
    const plan=headPlan(current);for(const [id,loaded]of cache){loaded.root.visible=id===plan.base;loaded.root.position.set(0,0,0);loaded.root.updateMatrixWorld(true);assert.equal(loaded.root.visible,id===current.base_asset);}
    validateEvaMetadata(current,cache.get(plan.base).meta);
   }
   assert.deepEqual(snapshot(cache.get(variant.base_asset).root),baseline,'EVA A→B→A changed native source pose/material');
  }
  assert.equal(sha(await fs.readFile(path.join(directory,'HEAD_ADDITIONS.json'))),report.input_sha256['HEAD_ADDITIONS.json'],'EVA catalog changed during audit');
  if(baseBytes)assert.equal(sha(await fs.readFile(path.join(directory,'TOOLHEAD_CONFIGURATIONS.json'))),report.input_sha256['TOOLHEAD_CONFIGURATIONS.json'],'Head source catalog changed during audit');
  for(const [filename,digest]of Object.entries(report.code_sha256))assert.equal(sha(await fs.readFile(new URL(filename,import.meta.url))),digest,'EVA controller changed during audit '+filename);
  for(const [id,pins]of Object.entries(report.artifacts))for(const pin of Object.values(pins))assert.equal(sha(await fs.readFile(path.join(path.resolve(externalDirectory),pin.path))),pin.sha256,'EVA actual artifact changed during audit '+id+'/'+pin.path);
  report.passed=true;
 }catch(error){report.failures.push({message:error.message});}
 finally{for(const loaded of cache.values())dispose(loaded.root);}
 report.completed_at_utc=new Date().toISOString();return report;
}

if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 assert(process.argv[2]&&process.argv[3]&&process.argv[4],'Usage: node scripts/audit_eva_heads.mjs CATALOG_ROOT EVA_EXTERNAL_ROOT REPORT_JSON');
 let report;try{report=await auditEvaHeads(process.argv[2],process.argv[3]);}catch(error){report={schema:'3d-print-rig-eva-head-audit-v1',passed:false,failures:[{message:error.message}],physical_fit_certified:false};}
 await fs.mkdir(path.dirname(path.resolve(process.argv[4])),{recursive:true});await fs.writeFile(process.argv[4],JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,assets:report.assets?.length||0,configurations:report.configurations?.length||0,failures:report.failures,report:path.resolve(process.argv[4]),physical_fit_certified:false}));if(!report.passed)process.exitCode=1;
}
