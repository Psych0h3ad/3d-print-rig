// Actual rendered EVA fronts, using independently pinned native-surface witnesses.
// This is neither support removal nor a complete native-solid/physical-fit audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {register} from 'node:module';
import {spawnSync} from 'node:child_process';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
import {createPaletteController} from '../site/viewer/palette-controller.mjs';
import {applyEvaInstallation} from '../site/viewer/eva-installations.mjs';
import {evaFrontOwnerMode} from '../site/viewer/eva-front-surfaces.mjs';
import {applyEvaOptionsProfile,createEvaOptionsController} from '../site/viewer/eva-options.mjs';

const sha=b=>createHash('sha256').update(b).digest('hex');
const digest=/^[a-f0-9]{64}$/;
const triple=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const unit=v=>triple(v)&&Math.abs(Math.hypot(...v)-1)<1e-6;
const mutable=new Set(['base','accent','frame','cnc']);
const sourceSteps={2:'46650c0be0527b0f799a6ebd5cde210254caafdc4c436f558857fa30c17e9b94',3:'9bfde01c4d811eaef253831f2fe7354e14c36b607d36b5b37bfc4fe9f48906d6'};
const sourceCounts={2:90,3:123};
const eva2ShroudPath=JSON.stringify(['Rat Rig - V-Minion 1.0 v7','Full Assembly v6:1','EVA Assembly v5:1','ratrig_eva_shroud v2:1']);
const eva2ShroudBrep='c2849ab7e2b621903eec5fb0cf658f7f0d6893f45bfacc016a2105a772f81add';
const eva2LegacyOwners={eva2_vminion_lgx_bmo:'21b8cf9694d86062e6b124051c1b60b963d66328a0df7a1b45ba2baaabd46b3b',ratrig_vminion_180:'b394124d0ef44519aa24cd005d1433305f35a545c3b8d5f9c8cccb8268fb0175'};
export function evaFrontCodeClosure(){
 const repo=fileURLToPath(new URL('../',import.meta.url));
 // Use Node's parser, not an import regex: comments and multiline re-exports
 // must neither invent dependencies nor hide a changed local runtime.
 const script=`import fs from 'node:fs';import path from 'node:path';import vm from 'node:vm';import crypto from 'node:crypto';
 const repo=process.argv[1],todo=JSON.parse(fs.readFileSync(0,'utf8')),pins={};
 while(todo.length){const relative=todo.pop(),filename=path.resolve(repo,relative),key=path.relative(repo,filename).replaceAll('\\\\','/');
  if(key.startsWith('../')||path.isAbsolute(key))throw Error('Dependency escaped production checkout');if(pins[key])continue;
  const raw=fs.readFileSync(filename),source=raw.toString('utf8');pins[key]=crypto.createHash('sha256').update(raw).digest('hex');
  for(const spec of new vm.SourceTextModule(source).dependencySpecifiers){
   if(spec.startsWith('node:'))continue;if(spec==='three'){todo.push('site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js');continue;}
   if(!spec.startsWith('.'))throw Error('Unpinned local module import '+spec);
   todo.push(path.relative(repo,path.resolve(path.dirname(filename),spec.split(/[?#]/)[0])));
  }
 }console.log(JSON.stringify(pins));`;
 const roots=['site/viewer/eva-front-surfaces.mjs','site/viewer/eva-options.mjs','site/viewer/community-loader.mjs','site/viewer/community-adapter.mjs','site/viewer/palette-controller.mjs','site/viewer/eva-installations.mjs','site/viewer/gcode-loaded-asset-identity.mjs','site/viewer/vendor/GLTFLoader.js','site/viewer/vendor-r180/GLTFLoader.js','site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js','scripts/three-test-loader.mjs'];
 const parsed=spawnSync(process.execPath,['--no-warnings','--experimental-vm-modules','--input-type=module','-e',script,repo],{input:JSON.stringify(roots),encoding:'utf8',maxBuffer:4*1024*1024});
 assert.equal(parsed.status,0,'Incomplete EVA production import closure: '+(parsed.stderr||parsed.error?.message||''));return JSON.parse(parsed.stdout);
}
export function evaFrontRecipe(heads,community,installations,asset,meta){
 const installed=asset.kind==='installed',installation=installed?installations.machines[asset.owner]:null;
 const variants=heads.variants.filter(v=>installed?v.id===installation?.configuration:v.base_asset===asset.owner);
 assert.equal(variants.length,1,'Missing/ambiguous pinned EVA source recipe');const variant=variants[0];
 assert.equal(variant.eva.generation,asset.generation,'Pinned recipe generation changed');
 let modelSpec,metadataSpec,expectedHeadKeys,expectedFanKeys;
 const sourceFans=[...variant.eva.companions.hotend_fan,...variant.eva.companions.part_fan];
 if(installed){
  assert(installation,'Missing pinned EVA host recipe');
  assert.deepEqual(installation.companions,variant.eva.companions,'Installed companions differ from pinned head recipe');
  assert.equal(installation.generation,asset.generation,'Installed source recipe generation changed');
  const host=installation.asset??community.machines[asset.owner];assert(host,'Missing pinned public EVA host catalog');
  modelSpec=host.files['model.glb'];metadataSpec=host.files['assembly_manifest.json'];
  expectedHeadKeys=Object.values(installation.head_keys);expectedFanKeys=sourceFans.map(k=>installation.head_keys[k]);
  assert.equal(asset.profile?.sha256,host.files['machine_profile.json'].sha256,'Host source profile differs from pinned public catalog');
 }else{
  const head=heads.assets[asset.owner];assert(head,'Missing pinned standalone source asset');
  modelSpec=head.files['model.glb'];metadataSpec=head.files['parts.json'];expectedHeadKeys=meta.parts.map(p=>String(p.key));expectedFanKeys=sourceFans;
  const complete=new Set(Object.values(variant.eva.companions).flat());
  assert.equal(expectedHeadKeys.length,head.parts,'Standalone source catalog/actual leaf count differs');
  assert([...complete].every(k=>expectedHeadKeys.includes(k)),'Standalone source companion recipe differs from actual inventory');
 }
 assert.equal(asset.model.sha256,modelSpec.sha256,'Model input differs from pinned source recipe');
 assert.equal(asset.model.decoded_sha256,modelSpec.decoded_sha256,'Decoded model differs from pinned source recipe');
 assert.equal(asset.model.encoding??null,modelSpec.encoding??null,'Model encoding differs from pinned source recipe');
 assert.equal(asset.metadata.sha256,metadataSpec.sha256,'Metadata input differs from pinned source recipe');
 assert.deepEqual(asset.head_keys.slice().sort(),expectedHeadKeys.slice().sort(),'Derived head keys differ from pinned source recipe');
 assert.deepEqual(asset.fan_keys.slice().sort(),expectedFanKeys.slice().sort(),'Derived fan keys differ from pinned source recipe');
 return {variant_id:variant.id,base_asset:variant.base_asset,head_parts:expectedHeadKeys.length,fan_keys:expectedFanKeys};
}
function sourcePinnedEva2Printed(row,{owner,modelSha256}={}){
 return row.identity===eva2ShroudPath&&row.role==='base'&&row.printed_declared===false&&eva2LegacyOwners[owner]===modelSha256;
}
export function evaFrontIdentity(part){
 const p=part.source_identity?.path??part.source_path??part.source?.assembly_path;
 assert(Array.isArray(p)&&p.length&&p.every(n=>typeof n==='string'&&n),'Missing native front occurrence identity');
 return JSON.stringify(p);
}
export function evaFrontParts(root,meta){
 assert(Array.isArray(meta.parts)&&meta.parts.length,'Missing actual EVA front manifest');
 const records=new Map(meta.parts.map(p=>[String(p.key),p]));
 assert.equal(records.size,meta.parts.length,'Duplicate actual EVA part key');
 const result=new Map();root.updateMatrixWorld(true);
 function walk(node,inherited=null){
  const explicit=node.userData?.part_key,key=explicit===undefined?inherited:String(explicit);
  if(node.isMesh){
   assert(key&&records.has(key),'Unregistered actual EVA mesh');
   if(!result.has(key))result.set(key,{key,part:records.get(key),meshes:[]});
   result.get(key).meshes.push(node);
  }
  for(const child of node.children)walk(child,key);
 }
 walk(root);assert.equal(result.size,records.size,'Missing actual EVA source leaf');
 return result;
}
function arrayHash(a){return a?sha(Buffer.from(a.array.buffer,a.array.byteOffset,a.array.byteLength)):null;}
function materialState(m){return {color:m.color.toArray(),metalness:m.metalness,roughness:m.roughness,opacity:m.opacity,transparent:m.transparent,side:m.side,depthWrite:m.depthWrite,flatShading:m.flatShading};}
export function evaFrontSnapshot(root,meta){
 return new Map([...evaFrontParts(root,meta)].map(([key,row])=>[key,{identity:evaFrontIdentity(row.part),role:row.part.appearance_role??null,printed:row.part.printed??null,printed_declared:Object.hasOwn(row.part,'printed'),meshes:row.meshes.map(m=>({mesh:m,geometry:m.geometry,matrix:[...m.matrixWorld.elements],visible:m.visible,position:arrayHash(m.geometry.attributes.position),index:arrayHash(m.geometry.index),normal:arrayHash(m.geometry.attributes.normal),groups:structuredClone(m.geometry.groups),draw:{...m.geometry.drawRange},materials:[].concat(m.material).map(materialState)}))}]));
}
export function assertEvaFrontPreservation(before,after,repairKeys,{legacyEva2=null,nativeExport=false}={}){
 assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort(),'Native EVA leaf inventory changed');
 const changed=new Set(repairKeys);assert((changed.size||nativeExport)&&changed.size===repairKeys.length,'Invalid repeated front repair keys');
 if(nativeExport)assert.equal(changed.size,0,'Native-export geometry cannot be substituted');
 for(const key of changed)assert(before.has(key),'Unexpected printed source repair key '+key);
 let hardware=0,untouched=0;
 for(const [key,b]of before){
  const a=after.get(key);assert.equal(a.identity,b.identity,'Native EVA source identity changed '+key);
  assert.equal(a.role,b.role,'Native EVA role changed '+key);assert.equal(a.printed,b.printed,'Native printed/hardware identity changed '+key);assert.equal(a.printed_declared,b.printed_declared,'Native printed metadata declaration changed');
  assert.equal(a.meshes.length,b.meshes.length,'Native EVA mesh/hardware count changed '+key);
  if(changed.has(key))assert(b.printed===true&&['base','accent'].includes(b.role)||legacyEva2&&sourcePinnedEva2Printed(b,legacyEva2),'Front patch targets purchased or unclassified leaf '+key);
  for(let i=0;i<b.meshes.length;i++){
   const original=b.meshes[i],now=a.meshes[i];assert.equal(now.mesh,original.mesh,'Native EVA source node replaced '+key);
   assert.deepEqual(now.matrix,original.matrix,'Authored EVA mating placement changed '+key);assert.equal(now.visible,original.visible,'Native EVA visibility changed '+key);
   assert.deepEqual(now.materials,original.materials,'Native hardware/printed material changed during patch '+key);
   if(!changed.has(key)){
    for(const field of ['geometry','position','index','normal'])assert.equal(now[field],original[field],'Unchanged native geometry modified '+key+'/'+field);
    assert.deepEqual(now.groups,original.groups);assert.deepEqual(now.draw,original.draw);untouched++;
   }
  }
  if(!b.printed&&!mutable.has(b.role))hardware++;
 }
 return {native_leaves:before.size,unchanged_meshes:untouched,preserved_purchased_leaves:hardware,authored_node_matrices_unchanged:true};
}
export function assertEvaFrontSurfacePins(evidence,owner,patchMeta){
 assert.equal(evidence.parts.length,owner.targets.length,'Missing/repeated source surface array evidence');
 for(const target of owner.targets){
  const proofs=evidence.parts.filter(p=>evaFrontIdentity(p)===JSON.stringify(target.source_path));
  assert.equal(proofs.length,1,'Missing exact source surface witness');const proof=proofs[0];
  const patch=patchMeta.parts.find(p=>p.key===target.patch_key);assert(patch,'Missing packaged native front leaf');
  assert(digest.test(proof.source_surface_array_sha256),'Missing native front source array pin');
  assert.equal(patch.surface_input_sha256,proof.source_surface_array_sha256,'Stale packaged/native witness surface array SHA');
  assert.equal(patch.source_step_sha256,evidence.source_step_sha256,'Packaged native STEP pin changed');
  assert.equal(patch.source_brep_sha256,proof.source_brep_sha256,'Packaged native BRep pin changed');
  assert.deepEqual(patch.source_path,target.source_path,'Packaged native source path changed');
  assert.equal(patch.triangles,proof.triangle_witnesses.length,'Packaged native triangle count changed');
 }
}
function triangles(row,origin){
 const result=[],position=new THREE.Vector3(),normal=new THREE.Vector3();
 for(const [primitive,mesh]of row.meshes.entries()){
  const g=mesh.geometry,p=g.attributes.position,n=g.attributes.normal,index=g.index;
  assert(p?.itemSize===3&&p.count>0,'Empty front surface '+row.key);
  assert(n?.itemSize===3&&n.count===p.count,'Missing repaired front source normals '+row.key);
  const count=index?.count??p.count;assert.equal(count%3,0,'Truncated front triangles');
  assert.equal(g.drawRange.start,0,'Hidden repaired front triangle range');assert(g.drawRange.count>=count,'Hidden repaired front triangles');
  const normalMatrix=new THREE.Matrix3().getNormalMatrix(mesh.matrixWorld);
  assert(mesh.matrixWorld.elements.every(Number.isFinite)&&Math.abs(mesh.matrixWorld.determinant())>1e-15,'Non-finite/singular front placement');
  for(let v=0;v<p.count;v++){
   assert([p.getX(v),p.getY(v),p.getZ(v)].every(Number.isFinite),'Non-finite front vertex');
   const length=Math.hypot(n.getX(v),n.getY(v),n.getZ(v));assert(Number.isFinite(length)&&Math.abs(length-1)<=.003,'Non-unit front normal');
  }
  for(let t=0;t<count;t+=3){
   const vertices=[],normals=[];
   for(let j=0;j<3;j++){
    const v=index?index.getX(t+j):t+j;assert(Number.isSafeInteger(v)&&v>=0&&v<p.count,'Invalid front triangle index');
    position.fromBufferAttribute(p,v).applyMatrix4(mesh.matrixWorld);
    vertices.push([position.x*1000+origin[0],-position.z*1000+origin[1],position.y*1000+origin[2]]);
    normal.fromBufferAttribute(n,v).applyMatrix3(normalMatrix).normalize();normals.push([normal.x,-normal.z,normal.y]);
   }
   const a=new THREE.Vector3(...vertices[0]),b=new THREE.Vector3(...vertices[1]),c=new THREE.Vector3(...vertices[2]),cross=b.sub(a).cross(c.sub(a));
   assert(cross.toArray().every(Number.isFinite)&&cross.length()>0,'Degenerate repaired front triangle '+JSON.stringify({key:row.key,primitive,triangle:t/3,indices:[0,1,2].map(j=>index?index.getX(t+j):t+j),vertices_mm:vertices}));
   result.push({primitive,triangle:t/3,vertices,normals,center:[0,1,2].map(k=>vertices.reduce((s,v)=>s+v[k],0)/3),winding:cross.normalize().toArray()});
  }
 }
 return result;
}
const sub=(a,b)=>a.map((v,i)=>v-b[i]),dot=(a,b)=>a.reduce((s,v,i)=>s+v*b[i],0),cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
export function evaFrontRayHit(tris,witness){
 assert(triple(witness.origin_mm)&&unit(witness.direction_unit),'Invalid source aperture ray');
 const range=witness.range_mm;assert(Array.isArray(range)&&range.length===2&&range.every(Number.isFinite)&&range[0]>=0&&range[1]>range[0],'Invalid source aperture range');
 let nearest=Infinity;
 for(const t of tris){
  const [a,b,c]=t.vertices,e1=sub(b,a),e2=sub(c,a),h=cross(witness.direction_unit,e2),det=dot(e1,h);
  if(Math.abs(det)<1e-12)continue;
  const s=sub(witness.origin_mm,a),u=dot(s,h)/det;if(u<-1e-9||u>1+1e-9)continue;
  const q=cross(s,e1),v=dot(witness.direction_unit,q)/det;if(v<-1e-9||u+v>1+1e-9)continue;
  const distance=dot(e2,q)/det;
  if(distance>=range[0]-1e-6&&distance<=range[1]+1e-6)nearest=Math.min(nearest,distance);
 }
 return nearest;
}
function locateTriangle(actual,witness,buckets,tolerance){
 const center=witness.vertices_mm.reduce((r,v)=>r.map((n,k)=>n+v[k]/3),[0,0,0]),cell=center.map(v=>Math.floor(v/.05));
 const candidates=[];
 for(let x=-1;x<=1;x++)for(let y=-1;y<=1;y++)for(let z=-1;z<=1;z++)candidates.push(...(buckets.get([cell[0]+x,cell[1]+y,cell[2]+z].join(','))||[]));
 const matches=[],permutations=[[0,1,2],[0,2,1],[1,0,2],[1,2,0],[2,0,1],[2,1,0]];
 for(const id of candidates){
  const t=actual[id],ranked=permutations.map(permutation=>{const distances=t.vertices.map((v,j)=>Math.hypot(...sub(v,witness.vertices_mm[permutation[j]])));return {permutation,error:Math.max(...distances),sum:distances.reduce((s,v)=>s+v,0)};}).sort((a,b)=>a.sum-b.sum);
  if(ranked[0].error<=tolerance)matches.push({id,t,...ranked[0]});
 }
 matches.sort((a,b)=>a.sum-b.sum);assert(matches.length,'Source front triangle missing or moved');
 assert(matches.length===1||matches[1].sum-matches[0].sum>1e-9,'Source front triangle duplicated or ambiguous');return matches[0];
}
export function assertEvaFrontWitnesses(root,meta,bindings,evidence,{originMm=meta.source_origin_mm??[0,0,0],owner=meta.id??meta.machine_id,modelSha256=null}={}){
 assert(triple(originMm),'Invalid authored source/native offset frame');
 assert.equal(evidence.schema,'3d-print-rig-eva-front-source-witnesses-v1','Invalid native front witness schema');
 assert([2,3].includes(evidence.generation)&&evidence.source_step_sha256===sourceSteps[evidence.generation],'Wrong/unpinned native EVA front generation');
 assert.equal(evidence.physical_fit_certified,false,'Front evidence must not certify complete physical fit');
 assert.equal(evidence.supports_removed,false,'Source-null-face correction is not support removal');
 assert(Array.isArray(evidence.parts)&&evidence.parts.length,'Missing source front surface evidence');
 const actual=evaFrontParts(root,meta),proofKeys=new Set(),rows=[];
 for(const proof of evidence.parts){
  const identity=evaFrontIdentity(proof),key=bindings[identity];assert(typeof key==='string'&&actual.has(key),'Missing exact owner/source front binding');
  assert(!proofKeys.has(key),'Duplicate source front repair binding');proofKeys.add(key);
  const row=actual.get(key);assert.equal(evaFrontIdentity(row.part),identity,'Incorrect printed occurrence bound to front patch');
  const legacy=evidence.generation===2&&proof.source_brep_sha256===eva2ShroudBrep&&sourcePinnedEva2Printed({identity,role:row.part.appearance_role,printed_declared:Object.hasOwn(row.part,'printed')},{owner,modelSha256});
  assert(row.part.printed===true&&['base','accent'].includes(row.part.appearance_role)||legacy,'Unexpected purchased source front key');
  assert(digest.test(proof.source_brep_sha256),'Unpinned native front leaf');
  assert(['source_null_faces_rendering','source_outward_normals'].includes(proof.correction_kind),'Unknown native rendering correction');
  if(proof.correction_kind==='source_null_faces_rendering')assert.equal(proof.native_void_domains_proven,true,'Unproved source-null/void correction');
  const ts=triangles(row,originMm),buckets=new Map();
  ts.forEach((t,i)=>{const key=t.center.map(v=>Math.floor(v/.05)).join(',');if(!buckets.has(key))buckets.set(key,[]);buckets.get(key).push(i);});
  assert(Array.isArray(proof.triangle_witnesses)&&proof.triangle_witnesses.length===ts.length,'Native outward-normal proof must cover every repaired rendered triangle');
  const checked=new Set();let minWinding=1,minNormal=1;
  for(const w of proof.triangle_witnesses){
   assert(Number.isSafeInteger(w.source_face_ordinal)&&w.source_face_ordinal>=0,'Missing exact native face witness');
   assert(Array.isArray(w.vertices_mm)&&w.vertices_mm.length===3&&w.vertices_mm.every(triple),'Invalid source face triangle coordinates');
   assert(unit(w.center_normal_unit)&&Array.isArray(w.corner_normals_unit)&&w.corner_normals_unit.length===3&&w.corner_normals_unit.every(unit),'Invalid source outward-normal witness');
   const {id,t,permutation}=locateTriangle(ts,w,buckets,.005);assert(!checked.has(id),'Repeated native front triangle witness');checked.add(id);
   const winding=dot(t.winding,w.center_normal_unit);assert(winding>1e-8,'Rendered front winding opposes native outward face');minWinding=Math.min(minWinding,winding);
   for(let j=0;j<3;j++){const agreement=dot(t.normals[j],w.corner_normals_unit[permutation[j]]);assert(agreement>1e-8,'Rendered front normal opposes native outward face '+JSON.stringify({key,primitive:t.primitive,triangle:t.triangle,source_face_ordinal:w.source_face_ordinal,corner:j,agreement_dot:agreement,rendered_normal:t.normals[j],native_normal:w.corner_normals_unit[permutation[j]],vertices_mm:t.vertices}));minNormal=Math.min(minNormal,agreement);}
  }
  assert.equal(checked.size,ts.length,'Unreviewed repaired front triangles');
  assert(Array.isArray(proof.aperture_witnesses),'Missing source-defined front aperture witness list');
  if(proof.correction_kind==='source_null_faces_rendering')assert(proof.aperture_witnesses.length,'Missing source-defined front aperture witnesses');
  const types=new Set(proof.aperture_witnesses.map(w=>w.kind));
  if(proof.feature_family!=='normal_surface')for(const kind of proof.feature_family==='fan_grille'?['void','hub','arm','rim']:['void','rim'])assert(types.has(kind),'Missing source aperture/grille feature '+kind);
  let voids=0,solids=0;
  for(const w of proof.aperture_witnesses){
   assert(['void','hub','arm','rim'].includes(w.kind),'Unknown source aperture witness kind');
   assert.equal(w.expected_hit,w.kind!=='void','Contradictory source aperture witness');
   assert(Number.isSafeInteger(w.source_face_ordinal)&&w.source_face_ordinal>=0||w.kind==='void'&&Array.isArray(w.opposed_source_faces)&&w.opposed_source_faces.length>=2&&w.opposed_source_faces.every(n=>Number.isSafeInteger(n)&&n>=0),'Missing source trimmed-domain witness');
   const hit=evaFrontRayHit(ts,w);assert.equal(Number.isFinite(hit),w.expected_hit,'Native grille/void mismatch '+key+'/'+w.id);
   if(w.expected_hit){
    assert(Number.isFinite(w.expected_distance_mm)&&Math.abs(hit-w.expected_distance_mm)<=.05,'Authored front face moved '+key+'/'+w.id);solids++;
   }else voids++;
  }
  // Source-native bounds constrain placement; rays/triangles prove more than an AABB.
  const b=row.part.native_bounds_mm??row.part.bounds_mm;
  assert(Array.isArray(b)&&b.length===2&&b.every(triple),'Missing native front source bounds');
  const offset=row.part.native_bounds_mm?[0,0,0]:originMm;
  for(const t of ts)for(const v of t.vertices)for(let k=0;k<3;k++)assert(v[k]>=b[0][k]+offset[k]-.1&&v[k]<=b[1][k]+offset[k]+.1,'Repaired front exceeds source-native bounds');
  rows.push({key,source_path:proof.source_path??proof.source_identity.path,source_brep_sha256:proof.source_brep_sha256,correction_kind:proof.correction_kind,feature_family:proof.feature_family,triangles:ts.length,native_face_normal_triangles:checked.size,singular_native_corner_limits:proof.singular_native_corner_limits??[],min_winding_native_dot:minWinding,min_corner_native_dot:minNormal,void_witnesses:voids,hub_arm_rim_witnesses:solids});
 }
 return {rows,repair_keys:[...proofKeys],supports_removed:false,physical_fit_certified:false,scope:'All rendered repaired-leaf triangles against precomputed exact source-face outward normals; finite source-domain rays preserve voids, hub, arms and rim. Source evidence is supplied independently; this consumer does not compute native BRep booleans.'};
}

const sourceIdentityFields=['source_sha256','source_revision','source_path','source_label_path','definition_label','source_brep_sha256'];
function sameNativeIdentity(actual,expected){
 for(const field of sourceIdentityFields)assert.deepEqual(actual[field],expected[field],'Native front source identity changed: '+field);
}
function descriptorMatches(actual,expected){
 for(const field of ['sha256','bytes','encoding','decoded_sha256','decoded_bytes'])assert.equal(actual[field]??null,expected[field]??null,'Native front artifact descriptor changed: '+field);
}
export function assertEvaNativeFrontWitnesses(root,meta,owner,{witness,audit,rays,surfaces},{modelSha256,metadataSha256,kind='standalone',machineId=null,originMm=owner.source_origin_mm,nativeMotionMm=[0,0,0]}={}){
 assert.equal(evaFrontOwnerMode(owner),'native_export');assert.equal(owner.patch_required,false);
 assert(['standalone','installed'].includes(kind)&&triple(originMm)&&triple(nativeMotionMm),'Invalid native front review frame');
 if(kind==='standalone')assert.deepEqual(nativeMotionMm,[0,0,0],'Standalone front cannot carry an installed motion');
 assert.deepEqual(originMm,owner.source_origin_mm,'Native front origin changed');
 assert.equal(modelSha256,owner.model_sha256,'Stale native front model');assert.equal(metadataSha256,owner.metadata_sha256,'Stale native front metadata');
 assert.equal(witness.schema,'3d-print-rig-eva-current-front-native-owner-witness-v1','Wrong native owner witness schema');
 assert.equal(audit.schema,'3d-print-rig-current-eva-front-native-audit-v1','Wrong native front audit schema');
 for(const proof of [witness,audit]){
  assert.equal(proof.configuration,owner.configuration_id,'Native front configuration changed');
  assert.equal(proof.model.decoded_sha256??proof.model.sha256,modelSha256,'Native proof model changed');
  assert.equal(proof.metadata.sha256,metadataSha256,'Native proof metadata changed');
  assert.equal(proof.full_physical_fit_certified,false,'Native front proof cannot certify full fit');
  assert(Array.isArray(proof.parts)&&proof.parts.length===owner.targets.length&&new Set(proof.parts.map(p=>p.key)).size===proof.parts.length,'Missing/repeated native front proof part');
 }
 assert.equal(witness.original_128_front_domains_retained,false,'Old Rapido front domains cannot qualify native mode');
 assert.equal(witness.apply_original_128_patch,false,'Native export must not apply old Rapido geometry');
 assert.equal(audit.passed,true,'Native source surface audit failed');
 const frames=witness.owner_frames.filter(f=>f.kind===kind);assert.equal(frames.length,1,'Missing exact authored native owner frame');
 assert.deepEqual(frames[0].source_origin_mm,originMm,'Native owner witness frame changed');
 if(kind==='installed')assert(typeof machineId==='string'&&machineId&&frames[0].machine_id===machineId,'Native owner witness source host changed');
 const actual=evaFrontParts(root,meta),rows=[],rendered=new Map();
 for(const target of owner.targets){
  const part=actual.get(target.part_key);assert(part,'Missing native front mesh');
  assert.equal(part.part.printed,true,'Native front targets purchased hardware');assert(['base','accent'].includes(part.part.appearance_role),'Native front palette classification changed');
  sameNativeIdentity({...part.part,source_brep_sha256:part.part.source_brep_sha256??part.part.brep_sha256},target);
  const source=witness.parts.find(p=>p.key===target.part_key),native=audit.parts.find(p=>p.key===target.part_key),surface=surfaces[target.part_key];
  assert(source&&native&&surface,'Missing native front source array/audit');
  for(const p of [source,native,surface])sameNativeIdentity(p,target);
  for(const p of [source,native])descriptorMatches(p.surface,owner.native_export.surfaces[target.part_key]);
  assert.equal(surface.schema,'3d-print-rig-current-eva-native-surfaces-v1','Wrong native surface schema');
  assert.equal(surface.configuration,owner.configuration_id,'Surface recipe changed');
  assert.deepEqual(surface.source_origin_mm,originMm,'Surface native origin changed');
  assert.equal(surface.coordinate_system,'Original installed source world Z-up millimetres; normals in the same native basis.','Unknown native surface basis');
  assert.equal(surface.supports_removed,false);assert.equal(surface.all_native_faces_represented,true);
  assert.deepEqual(surface.removed_native_domains,[],'Native surface domains removed');assert.deepEqual(source.removed_native_domains,[],'Native witness domains removed');
  assert.equal(native.all_native_faces_represented,true);assert.equal(native.zero_native_domains_removed,true);assert.equal(native.failures,0,'Native source face audit failed');
  assert(Array.isArray(surface.positions_mm)&&surface.positions_mm.length&&surface.positions_mm.every(triple),'Invalid native front vertex array');
  assert(Array.isArray(surface.normals)&&surface.normals.length===surface.positions_mm.length&&surface.normals.every(n=>triple(n)&&Math.abs(Math.hypot(...n)-1)<.003),'Invalid native outward normals');
  assert(Array.isArray(surface.triangles)&&surface.triangles.length===source.triangles&&surface.triangles.length===native.triangles,'Native triangle inventory changed');
  assert(Array.isArray(surface.source_face_map)&&surface.source_face_map.length===surface.triangles.length,'Incomplete source face map');
  assert.deepEqual(surface.native_bounds_mm,target.native_bounds_mm,'Native source bounds changed');assert.deepEqual(source.native_bounds_mm,target.native_bounds_mm,'Witness native bounds changed');
  const faces=surface.source_native_face_receipts;assert(Array.isArray(faces)&&faces.length===source.faces&&faces.length===native.native_faces,'Missing native face receipts');
  assert(Array.isArray(native.face_results)&&native.face_results.length===faces.length,'Incomplete independent native face audit');
  const faceCounts=new Map();for(const f of surface.source_face_map){assert(Number.isSafeInteger(f)&&f>=0&&f<faces.length,'Invalid native face map');faceCounts.set(f,(faceCounts.get(f)||0)+1)}
  const faceIDs=new Set(),auditIDs=new Set();
  for(const f of faces){
   assert(Number.isSafeInteger(f.face_ordinal)&&f.face_ordinal>=0&&!faceIDs.has(f.face_ordinal),'Repeated/missing native source face');faceIDs.add(f.face_ordinal);
   const report=native.face_results.find(r=>r.native_face===f.face_ordinal);assert(report&&!auditIDs.has(report.native_face),'Missing native face orientation audit');auditIDs.add(report.native_face);
   assert.equal(f.triangles,faceCounts.get(f.face_ordinal)??0,'Native face triangles changed');assert.equal(report.triangles,f.triangles,'Independent native face triangle count changed');
   assert.deepEqual(report.failures,[],'Native face orientation failures');
   if(f.triangles){assert(Number.isFinite(report.minimum_native_winding_dot)&&report.minimum_native_winding_dot>1e-8,'Native face winding unproved');assert(Number.isFinite(report.minimum_native_normal_dot)&&report.minimum_native_normal_dot>1e-8,'Native face normal unproved');}
   else assert(Number.isFinite(f.native_area_mm2)&&f.native_area_mm2<=1e-10,'Positive-area native face omitted');
  }
  const ts=triangles(part,originMm);for(const t of ts){t.vertices=t.vertices.map(v=>sub(v,nativeMotionMm));t.center=sub(t.center,nativeMotionMm)}
  assert.equal(ts.length,surface.triangles.length,'Exported native front triangle count changed');
  const buckets=new Map();ts.forEach((t,i)=>{const k=t.center.map(v=>Math.floor(v/.05)).join(',');if(!buckets.has(k))buckets.set(k,[]);buckets.get(k).push(i)});
  const seen=new Set();let minWinding=1,minNormal=1;
  for(const tri of surface.triangles){
   assert(Array.isArray(tri)&&tri.length===3&&tri.every(i=>Number.isSafeInteger(i)&&i>=0&&i<surface.positions_mm.length),'Invalid native triangle indices');
   const vertices_mm=tri.map(i=>surface.positions_mm[i]),normals=tri.map(i=>surface.normals[i]);
   const crossNormal=cross(sub(vertices_mm[1],vertices_mm[0]),sub(vertices_mm[2],vertices_mm[0])),length=Math.hypot(...crossNormal);assert(length>0&&Number.isFinite(length),'Degenerate native source triangle');
   const {id,t,permutation}=locateTriangle(ts,{vertices_mm},buckets,.005);assert(!seen.has(id),'Repeated source-native rendered triangle');seen.add(id);
   const winding=dot(t.winding,crossNormal.map(n=>n/length));assert(winding>1-1e-5,'Native export winding changed');minWinding=Math.min(minWinding,winding);
   for(let j=0;j<3;j++){const n=normals[permutation[j]],agreement=dot(t.normals[j],n)/Math.hypot(...n);assert(agreement>1-1e-5,'Native export normal changed');minNormal=Math.min(minNormal,agreement);}
  }
  assert.equal(seen.size,ts.length,'Unreviewed native rendered triangles');rendered.set(target.part_key,ts);
  rows.push({key:target.part_key,source_sha256:target.source_sha256,source_revision:target.source_revision,source_path:target.source_path,source_brep_sha256:target.source_brep_sha256,faces:faces.length,triangles:ts.length,min_winding_source_dot:minWinding,min_normal_source_dot:minNormal,source_domains_removed:0});
 }
 assert.equal(rays.schema,'3d-print-rig-eva-current-front-rays-v1','Wrong native airway witness schema');
 assert.equal(rays.configuration,owner.configuration_id);assert.equal(rays.model_sha256,modelSha256);assert.equal(rays.metadata_sha256,metadataSha256);
 const target=owner.targets.find(t=>t.part_key===owner.native_export.ray_part_key);assert(target,'Missing exact native airway target');
 assert.equal(rays.source_sha256,target.source_sha256);
 // Ray classification must identify its original solid, not just its assembly.
 assert.equal(rays.target_key,target.part_key,'Missing/stale native airway source part');
 assert.equal(rays.source_revision,target.source_revision,'Stale native airway source revision');
 assert.deepEqual(rays.source_path,target.source_path,'Stale native airway occurrence');assert.equal(rays.source_brep_sha256,target.source_brep_sha256,'Stale native airway BRep');
 assert.equal(rays.unexpected_open_airway_hit_count,0,'Native airway witness failed');
 assert(Array.isArray(rays.rays)&&rays.rays.length,'Missing native airway rays');let samples=0;
 for(const [i,ray]of rays.rays.entries()){
  assert(Array.isArray(ray.samples)&&ray.samples.length>=3,'Incomplete native airway samples');assert.deepEqual(ray.hits,[],'Native airway is blocked');
  assert(ray.samples.every(s=>triple(s.native_world_mm)&&s.state==='TopAbs_State.TopAbs_OUT'),'Unproved native open airway');
  const first=ray.samples[0].native_world_mm,last=ray.samples.at(-1).native_world_mm,direction=sub(last,first),length=Math.hypot(...direction);assert(Number.isFinite(length)&&length>0,'Invalid native airway interval');
  for(const sample of ray.samples){const delta=sub(sample.native_world_mm,first);assert(Math.hypot(...cross(delta,direction))/length<=1e-5&&dot(delta,direction)>=-1e-6&&dot(delta,direction)<=length*length+1e-6,'Native airway samples are not collinear');}
  const hit=evaFrontRayHit(rendered.get(target.part_key),{origin_mm:first,direction_unit:direction.map(n=>n/length),range_mm:[0,length]});assert(!Number.isFinite(hit),'Rendered native airway blocked '+i);samples+=ray.samples.length;
 }
 return {rows,repair_keys:[],native_export:true,kind,source_airway_rays:rays.rays.length,source_airway_samples:samples,supports_removed:false,physical_fit_certified:false,scope:'Every rendered dedicated-front triangle matches hash-pinned author arrays and independent native face-orientation receipts. Only the authored airway intervals are ray-tested; this is not all-aperture, continuous clearance or complete physical-fit certification.'};
}
export function assertEvaFrontFanProtection(root,meta,fanKeys,baseline,{requireDark=true}={}){
 const rows=evaFrontParts(root,meta);assert(Array.isArray(fanKeys)&&fanKeys.length===2&&new Set(fanKeys).size===2,'Both original purchased fans required');
 for(const key of fanKeys){
  const row=rows.get(key),old=baseline.get(key);assert(row&&old,'Missing purchased EVA fan');
  assert(row.part.printed!==true&&!mutable.has(row.part.appearance_role),'Purchased fan classified as printed');
  for(const [i,m]of row.meshes.entries()){
   const materials=[].concat(m.material);assert.equal(materials.length,old.meshes[i].materials.length);
   materials.forEach((material,j)=>{
    const state=materialState(material);assert.deepEqual(state,old.meshes[i].materials[j],'Purchased EVA fan finish changed');
    assert(state.color.every(v=>Number.isFinite(v)&&v>=0&&v<=1),'Invalid purchased EVA fan color');
    if(requireDark)assert(state.color.every(v=>v<=.08),'Purchased EVA fan is no longer source-dark');
    assert.equal(state.opacity,1,'Transparent purchased EVA fan');assert.equal(state.transparent,false);
   });
  }
 }
 return {fans:fanKeys.length,source_material_preserved:true,source_dark_material_protected:requireDark};
}
export function assertEvaFrontPalettes(root,meta,fanKeys,{setPalette=null}={}){
 const parts=evaFrontParts(root,meta),baseline=evaFrontSnapshot(root,meta);
 if(!setPalette){
  const nodes=new Map([...parts].map(([key,row])=>{const group=new THREE.Group();group.children=[...row.meshes];return [key,group];}));
  const controller=createPaletteController(nodes,new Map(meta.parts.map(p=>[String(p.key),p])));setPalette=palette=>controller.setPalette(palette);
 }
 const isolated=evaFrontSnapshot(root,meta),A={base:'#13cbe8',accent:'#ed4811',frame:'#e2e2e2'},B={base:'#ed4811',accent:'#13cbe8',frame:'#393939'};
 let stages=0,protectedChecks=0,printedChecks=0;
 for(const palette of [A,B,A]){
  setPalette(palette);const now=evaFrontSnapshot(root,meta);
  for(const [key,row]of now){
   const before=isolated.get(key);row.meshes.forEach((mesh,i)=>{
    assert.deepEqual(mesh.matrix,before.meshes[i].matrix,'Palette changed authored mating placement');
    for(const field of ['position','index','normal'])assert.equal(mesh[field],before.meshes[i][field],'Palette changed native geometry');
    mesh.materials.forEach((material,j)=>{
     const original=before.meshes[i].materials[j],color=palette[row.role];
     if(color){assert.deepEqual(material.color,new THREE.Color(color).toArray(),'Printed front palette not applied');printedChecks++;}
     else{assert.deepEqual(material,original,'Palette changed protected hardware material');protectedChecks++;}
    });
   });
  }
  assertEvaFrontFanProtection(root,meta,fanKeys,isolated);stages++;
 }
 // Reset uses the exact source role colors, since community palette setters do
 // not restore colors when given an empty object. Restore after A-B-A inspection.
 for(const [key,row]of parts)row.meshes.forEach((mesh,i)=>[].concat(mesh.material).forEach((m,j)=>m.color.fromArray(isolated.get(key).meshes[i].materials[j].color)));
 const reset=evaFrontSnapshot(root,meta);for(const [key,row]of reset)assert.deepEqual(row.meshes.map(m=>m.materials),isolated.get(key).meshes.map(m=>m.materials),'Native front color reset failed');
 assert.equal(reset.size,baseline.size);
 return {sequence:['A','B','A'],stages,printed_checks:printedChecks,protected_checks:protectedChecks,source_color_restore:'Exact captured source colors restored; this is not a browser/native-reset-button test.'};
}

async function pinnedFile(base,descriptor,inputs){
 assert(descriptor&&typeof descriptor.path==='string'&&digest.test(descriptor.sha256),'Missing explicit pinned EVA audit input');
 const file=path.resolve(base,descriptor.path),bytes=await fs.readFile(file);assert.equal(sha(bytes),descriptor.sha256,'Stale EVA front artifact SHA-256');
 const decoded=descriptor.encoding==='gzip'?gunzipSync(bytes):bytes;assert(!descriptor.encoding||descriptor.encoding==='gzip','Unknown EVA audit encoding');
 if(descriptor.decoded_sha256!==undefined)assert.equal(sha(decoded),descriptor.decoded_sha256,'Stale EVA decoded front SHA-256');
 inputs.set(file,descriptor.sha256);return {bytes,decoded,sha256:sha(bytes),decoded_sha256:sha(decoded)};
}
async function parseGlb(bytes,Loader=GLTFLoader){
 assert(bytes.length>=28&&bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Invalid actual EVA GLB');
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 assert.equal(doc.buffers?.length,1,'EVA front GLB requires one embedded buffer');assert(!doc.buffers[0].uri&&!(doc.images||[]).length&&!(doc.extensionsRequired||[]).length,'External/extended EVA GLB requires separate review');
 return (await new Loader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
function disposeFrontRoot(root){root?.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of [].concat(m.material))material.dispose()}})}
async function nativeFrontInputs(base,asset,owner,inputs){
 const spec=owner.native_export;assert(asset.native,'Missing source-native front artifacts');
 const result={surfaces:{},hashes:{surfaces:{}}};
 for(const name of ['witness','audit','rays']){
  const file=await pinnedFile(base,asset.native[name],inputs);assert.equal(file.sha256,spec[name].sha256,'Stale registered native front '+name);
  assert.equal(file.bytes.length,spec[name].bytes,'Native front receipt size changed');
  if(spec[name].decoded_sha256)assert.equal(file.decoded_sha256,spec[name].decoded_sha256,'Native receipt decoded pin changed');
  result[name]=JSON.parse(file.decoded);result.hashes[name]=file.sha256;
 }
 for(const proof of [result.witness,result.audit]){descriptorMatches(proof.model,asset.model);descriptorMatches(proof.metadata,asset.metadata)}
 assert.equal(result.witness.front_aperture_rays.sha256,spec.rays.sha256,'Owner witness ray pin changed');
 assert.equal(result.witness.front_aperture_rays.bytes,spec.rays.bytes,'Owner witness ray size changed');
 assert.deepEqual(Object.keys(asset.native.surfaces||{}).sort(),Object.keys(spec.surfaces).sort(),'Missing/extra native front arrays');
 for(const [key,descriptor]of Object.entries(spec.surfaces)){
  const file=await pinnedFile(base,asset.native.surfaces[key],inputs);assert.equal(file.sha256,descriptor.sha256,'Stale native surface array');
  assert.equal(file.bytes.length,descriptor.bytes,'Native array bytes changed');assert.equal(file.decoded_sha256,descriptor.decoded_sha256??descriptor.sha256,'Stale native decoded array');
  if(descriptor.decoded_bytes)assert.equal(file.decoded.length,descriptor.decoded_bytes,'Native decoded array bytes changed');
  result.surfaces[key]=JSON.parse(file.decoded);result.hashes.surfaces[key]={sha256:file.sha256,decoded_sha256:file.decoded_sha256};
 }
 return result;
}
async function auditNativeInstalledFront({base,asset,owner,bundle,model,meta,sourceBaseline,registry,patch,patchMeta,adapter,heads,community,installations,options,inputs}){
 const {GLTFLoader:Loader}=await import('../site/viewer/vendor-r180/GLTFLoader.js');
 const {createCommunityAdapter}=await import('../site/viewer/community-adapter.mjs');
 const {loadedPrinterAssetIdentity}=await import('../site/viewer/gcode-loaded-asset-identity.mjs');
 const {applyNativeMotionProfile}=await import('../site/viewer/native-motion-profile.mjs');
 const {nativeMotion,communityConfiguration}=await import('../site/viewer/community-state.mjs');
 const variant=options?.variants.find(v=>v.id===owner.configuration_id&&v.base_asset===asset.owner);
 assert(variant,'Source-native front requires a registered installed configuration');
 const host=options.hosts[variant.machine_id],row=installations.machines[variant.machine_id],native=asset.native_host;
 assert(host&&row&&native?.machine_id===host.machine_id,'Missing native front source-host binding');
 const spec=row.asset??community.machines[host.machine_id];assert(spec&&!spec.additional_models?.length,'Unsupported native front source-host export');
 const hostModel=await pinnedFile(base,native.model,inputs),manifestFile=await pinnedFile(base,native.metadata,inputs),profileFile=await pinnedFile(base,native.profile,inputs);
 assert.equal(hostModel.decoded_sha256,host.model_sha256);assert.equal(hostModel.sha256,spec.files['model.glb'].sha256);
 assert.equal(manifestFile.sha256,host.manifest_sha256);assert.equal(profileFile.sha256,host.profile_sha256);
 let manifest=JSON.parse(manifestFile.decoded),profile=JSON.parse(profileFile.decoded),root,patchRoot,controller;
 try{
  ({manifest,profile}=applyNativeMotionProfile(manifest,profile,profile.motion_registration,hostModel.decoded_sha256));
  ({manifest,profile}=applyEvaInstallation(manifest,profile,row));
  root=await parseGlb(hostModel.decoded,Loader);patchRoot=await parseGlb(patch.decoded,Loader);
  adapter.applyEvaFrontSurfaces(root,manifest,hostModel.decoded_sha256,{registry,patchRoot,patchMeta,metadataSha256:manifestFile.sha256,sourceOriginMm:profile.origin_mm});
  const receipt=await loadedPrinterAssetIdentity({machine:host.machine_id,spec,manifest,profile,checkedFileNames:['model.glb','assembly_manifest.json','machine_profile.json']});
  const current={root,manifest,profile,replay_asset_identity:receipt,adapter:createCommunityAdapter(root,manifest,profile)};
  applyEvaOptionsProfile(current,options,heads);
  controller=createEvaOptionsController(current,{registry:options,heads,loader:new Loader(),href:'https://psych0h3ad.github.io/3d-print-rig/viewer/community.html',
   loadComponent:async(loader,requested)=>{
    assert.deepEqual(requested,heads.assets[asset.owner],'Installed native front loaded a different source head');
    return {meta:structuredClone(meta),gltf:{scene:await parseGlb(model.decoded,Loader),animations:[]}};
   },loadFrontSurfaces:async()=>({registry,patchRoot,patchMeta}),applyFrontSurfaces:adapter.applyEvaFrontSurfaces});
  await controller.install(variant.id);assert(controller.current?.root,'Installed native front has no actual overlay');
  current.adapter.setConfiguration(variant.id);
  const selected=communityConfiguration(profile,variant.id),limits=selected.axes??profile.axes;
  const axesEntries=Object.entries(profile.axes),poses=[];
  for(const stage of ['neutral','min','max','mid','reverse_min']){
   const axes=Object.fromEntries(axesEntries.map(([axis,range])=>{const r=limits[axis]??range;return [axis,stage==='neutral'?Math.max(r[0],Math.min(r[1],0)):stage==='max'?r[1]:stage==='mid'?(r[0]+r[1])/2:r[0]]}));
   current.adapter.setAxes(axes);controller.update(current.adapter.getAxes());
   const witness=assertEvaNativeFrontWitnesses(controller.current.root,controller.current.manifest,owner,bundle,{modelSha256:model.decoded_sha256,metadataSha256:asset.metadata.sha256,kind:'installed',machineId:host.machine_id,originMm:host.origin_mm,nativeMotionMm:nativeMotion('head',current.adapter.getAxes(),profile)});
   poses.push({stage,axes:current.adapter.getAxes(),native_motion_mm:nativeMotion('head',current.adapter.getAxes(),profile),witnessed_front_triangles:witness.rows.reduce((n,r)=>n+r.triangles,0),airway_rays:witness.source_airway_rays});
  }
  const fan=assertEvaFrontFanProtection(controller.current.root,controller.current.manifest,asset.fan_keys,sourceBaseline);
  const palette=assertEvaFrontPalettes(controller.current.root,controller.current.manifest,asset.fan_keys,{setPalette:p=>controller.setPalette(p)});
  await controller.reset();assert.equal(controller.current,null,'Native front reset retained orphan head');
  return {machine_id:host.machine_id,configuration:variant.id,model_sha256:hostModel.sha256,decoded_model_sha256:hostModel.decoded_sha256,manifest_sha256:manifestFile.sha256,profile_sha256:profileFile.sha256,loader_receipt:true,production_installed_controller:true,poses,fan,palette,selected_overlay_released:true,physical_fit_certified:false};
 }finally{controller?.dispose();disposeFrontRoot(root);disposeFrontRoot(patchRoot)}
}
export function evaFrontCoverageComplete(assets,failures,requiredOwners){
 const actual=assets.map(a=>a.owner);
 return failures.length===0&&actual.length===requiredOwners.length&&new Set(actual).size===actual.length
  &&JSON.stringify([...actual].sort())===JSON.stringify([...requiredOwners].sort());
}
export async function auditEvaFrontSurfaces(manifestFile){
 const file=path.resolve(manifestFile),base=path.dirname(file),raw=await fs.readFile(file),manifest=JSON.parse(raw),inputs=new Map([[file,sha(raw)]]);
 assert.equal(manifest.schema,'3d-print-rig-eva-front-audit-inputs-v1');
 assert(Array.isArray(manifest.assets)&&manifest.assets.length>=4,'Front audit requires every standalone/installed owner asset');
 const baselineOwners={eva2_vminion_lgx_bmo:'2/standalone',ratrig_vminion_180:'2/installed',eva3_ratrig_vcore31_urn9_rapido_hf_lgx_lite:'3/standalone',ratrig_vcore31_300:'3/installed'};
 for(const [owner,kind]of Object.entries(baselineOwners)){
  const matches=manifest.assets.filter(a=>a.owner===owner);assert.equal(matches.length,1,'Missing/repeated original EVA owner '+owner);
  assert.equal(`${matches[0].generation}/${matches[0].kind}`,kind,'Original EVA owner generation/scope changed');
 }
 assert(manifest.assets.every(a=>[2,3].includes(a.generation)&&['standalone','installed'].includes(a.kind)),'Unknown EVA owner generation/scope');
 assert.equal(new Set(manifest.assets.map(a=>a.owner)).size,manifest.assets.length,'Repeated EVA front owner binding');
 const registryFile=await pinnedFile(base,manifest.registry,inputs),registry=JSON.parse(registryFile.decoded),patch=await pinnedFile(base,manifest.patch,inputs),patchMetaFile=await pinnedFile(base,manifest.patch_metadata,inputs),patchMeta=JSON.parse(patchMetaFile.decoded);
 const adapterFile=await pinnedFile(base,manifest.adapter,inputs);
 const headsFile=await pinnedFile(base,manifest.heads,inputs),heads=JSON.parse(headsFile.decoded),communityFile=await pinnedFile(base,manifest.community,inputs),community=JSON.parse(communityFile.decoded),installationsFile=await pinnedFile(base,manifest.installations,inputs),installations=JSON.parse(installationsFile.decoded);
 const adapter=await import(pathToFileURL(path.resolve(base,manifest.adapter.path)).href);
 assert(typeof adapter.applyEvaFrontSurfaces==='function','Production EVA front surface helper missing');
 adapter.validateEvaFrontRegistry(registry);
 const nativeOwners=Object.values(registry.owners).filter(o=>evaFrontOwnerMode(o)==='native_export');
 const optionsFile=nativeOwners.length?await pinnedFile(base,manifest.options,inputs):null,options=optionsFile?JSON.parse(optionsFile.decoded):null;
 assert.deepEqual(Object.keys(registry.owners).sort(),manifest.assets.map(a=>a.owner).sort(),'Actual front audit must cover every production owner binding');
 assert.equal(registry.asset.files['model.glb'].sha256,patch.sha256,'Actual patch does not match production descriptor');
 assert.equal(registry.asset.files['model.glb'].decoded_sha256??patch.sha256,patch.decoded_sha256,'Actual decoded patch does not match production descriptor');
 assert.equal(registry.asset.files['parts.json'].sha256,patchMetaFile.sha256,'Actual patch metadata does not match production descriptor');
 assert.equal(patchMeta.id,registry.asset.component_id,'Production patch component identity mismatch');
 assert.equal(patchMeta.source_solids_modified,false);assert.equal(patchMeta.supports_removed,false);
 const codeInputs=evaFrontCodeClosure();for(const [relative,hash]of Object.entries(codeInputs)){const filename=fileURLToPath(new URL('../'+relative,import.meta.url));assert.equal(sha(await fs.readFile(filename)),hash,'Production dependency changed while pinning closure');inputs.set(filename,hash);}
 assert.equal(codeInputs['site/viewer/eva-front-surfaces.mjs'],adapterFile.sha256,'Audit must invoke the current pinned production helper');
 const report={schema:'3d-print-rig-eva-front-actual-audit-v1',passed:false,started_at_utc:new Date().toISOString(),registry_sha256:registryFile.sha256,heads_sha256:headsFile.sha256,community_sha256:communityFile.sha256,installations_sha256:installationsFile.sha256,options_sha256:optionsFile?.sha256??null,patch_sha256:patch.sha256,patch_decoded_sha256:patch.decoded_sha256,patch_metadata_sha256:patchMetaFile.sha256,adapter_sha256:adapterFile.sha256,audit_sha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),production_code_sha256:codeInputs,assets:[],failures:[],scope:{four_actual_owners:true,source_native_triangle_normals:true,source_defined_void_grille_witnesses:true,authored_mating_transforms:true,untouched_source_hardware:true,production_surface_helper:true,production_static_import_closure:true,pinned_source_recipes:true,palettes_A_B_A:true,browser_visual_review:false,native_solid_boolean_recomputed:false,supports_removed:false,physical_fit_certified:false}};
 for(const asset of manifest.assets){
  let root,patchRoot;
  try{
   const owner=registry.owners[asset.owner],nativeMode=evaFrontOwnerMode(owner)==='native_export';
   const model=await pinnedFile(base,asset.model,inputs),metadata=await pinnedFile(base,asset.metadata,inputs),meta=JSON.parse(metadata.decoded);
   const nativeBundle=nativeMode?await nativeFrontInputs(base,asset,owner,inputs):null;
   const evidenceFile=nativeMode?{sha256:nativeBundle.hashes.witness}:await pinnedFile(base,asset.evidence,inputs),evidence=nativeMode?nativeBundle.witness:JSON.parse(evidenceFile.decoded);
   if(!nativeMode)assert.equal(evidence.generation,asset.generation,'Owner source generation mismatch');
   const recipe=evaFrontRecipe(heads,community,installations,asset,meta);
   const baselineKeys=asset.head_keys;assert(Array.isArray(baselineKeys)&&baselineKeys.length===recipe.head_parts&&baselineKeys.length>0&&new Set(baselineKeys).size===baselineKeys.length,'Incomplete registered EVA head companion inventory');
   if(Object.hasOwn(baselineOwners,asset.owner))assert.equal(baselineKeys.length,sourceCounts[asset.generation],'Original EVA head inventory changed');
   root=await parseGlb(model.decoded);patchRoot=await parseGlb(patch.decoded);
   assert.equal(asset.owner,meta.id??meta.machine_id,'Actual asset does not match owner ID');
   assert.equal(owner.model_sha256,model.decoded_sha256,'Stale production owner/model hash');
   if(!nativeMode){assert.equal(owner.source_step_sha256,sourceSteps[asset.generation],'Wrong production owner native source');assertEvaFrontSurfacePins(evidence,owner,patchMeta);}
   else assert.equal(asset.kind,'standalone','Native option owners require both standalone and installed-controller review');
   assert.deepEqual(owner.source_origin_mm,asset.source_origin_mm??meta.source_origin_mm??meta.source_origin_native_zup_mm??[0,0,0],'Wrong authored native owner offset');
   let profileFile=null,sourceProfile=null,installationFile=null,installation=null;
   if(asset.kind==='installed'){
    profileFile=await pinnedFile(base,asset.profile,inputs);sourceProfile=JSON.parse(profileFile.decoded);
    installationFile=installationsFile;installation=installations.machines[asset.owner];
    assert(installation,'Missing exact native EVA installation');
    assert.equal(profileFile.sha256,installation.profile_sha256,'Installed EVA source profile pin changed');
    assert(triple(sourceProfile.origin_mm),'Missing source-pinned installed EVA origin');
    assert.deepEqual(sourceProfile.origin_mm,owner.source_origin_mm,'Installed EVA profile/owner frame mismatch');
   }
   const initial=evaFrontSnapshot(root,meta);for(const key of baselineKeys)assert(initial.has(key),'Missing original EVA hardware/companion');
   const identities=new Map(meta.parts.map(p=>[String(p.key),evaFrontIdentity(p)]));
   for(const [identity,key]of Object.entries(asset.bindings))assert.equal(identities.get(key),identity,'Incorrect exact EVA source owner binding');
   // Parent owns this protocol and production guard. The runtime helper is
   // invoked on the actual decoded source root, never a replacement fixture.
   const applied=await adapter.applyEvaFrontSurfaces(root,meta,model.decoded_sha256,{registry,patchRoot,patchMeta,metadataSha256:metadata.sha256,...(sourceProfile?{sourceOriginMm:sourceProfile.origin_mm}:{})});
   assert(applied,'Production front helper did not validate the owner');
   const witness=nativeMode?assertEvaNativeFrontWitnesses(root,meta,owner,nativeBundle,{originMm:owner.source_origin_mm,modelSha256:model.decoded_sha256,metadataSha256:metadata.sha256}):assertEvaFrontWitnesses(root,meta,asset.bindings,evidence,{originMm:owner.source_origin_mm,owner:asset.owner,modelSha256:model.decoded_sha256});
   const preservation=assertEvaFrontPreservation(initial,evaFrontSnapshot(root,meta),witness.repair_keys,{nativeExport:nativeMode,legacyEva2:asset.generation===2?{owner:asset.owner,modelSha256:model.decoded_sha256}:null});
   let fan=assertEvaFrontFanProtection(root,meta,asset.fan_keys,initial,{requireDark:asset.kind!=='installed'});
   assert.equal(applied,nativeMode?witness.rows.length:witness.repair_keys.length,'Missing/repeated production front target');
   assert.deepEqual(owner.targets.map(t=>t.part_key).sort(),witness.rows.map(r=>r.key).sort(),'Owner targets differ from independently witnessed printed leaves');
   let palette,controllerReset=null;
   if(asset.kind==='installed'){
    const {profile}=applyEvaInstallation(meta,sourceProfile,installation);
    const {createCommunityAdapter}=await import('../site/viewer/community-adapter.mjs');
    const controller=createCommunityAdapter(root,meta,profile),native=evaFrontSnapshot(root,meta),keys=baselineKeys,axes=controller.getAxes();
    // The immutable V-Minion export predates its pinned purchased-material
    // recipe. Verify patch preservation before that production override, and
    // exact recipe application before judging the displayed fan finishes.
    for(const key of asset.fan_keys){
     const override=installation.purchased_materials?.[key];
     for(const [i,mesh]of native.get(key).meshes.entries())for(const [j,material]of mesh.materials.entries()){
      const before=initial.get(key).meshes[i].materials[j];
      assert.deepEqual(material.color,override?.color_linear??before.color,'Displayed EVA fan differs from pinned purchased-material recipe');
      assert.equal(material.metalness,override?.metalness??before.metalness);assert.equal(material.roughness,override?.roughness??before.roughness);
     }
    }
    fan={...assertEvaFrontFanProtection(root,meta,asset.fan_keys,native),patch_hardware_materials_preserved:true,purchased_materials_recipe_sha256:installationFile.sha256};
    palette=assertEvaFrontPalettes(root,meta,asset.fan_keys,{setPalette:p=>controller.setPalette(p)});
    controller.setAxes(axes);const reset=evaFrontSnapshot(root,meta);
    for(const key of keys){const a=reset.get(key),b=native.get(key);assert.deepEqual(a.meshes.map(m=>m.matrix),b.meshes.map(m=>m.matrix),'Installed native reset changed authored EVA head frame');assert.deepEqual(a.meshes.map(m=>m.position),b.meshes.map(m=>m.position),'Installed native reset changed rigid EVA companions');}
    controllerReset={source_profile_sha256:profileFile.sha256,installations_sha256:installationFile.sha256,native_head_parts:keys.length,head_matrices_and_geometry_restored:true,scope:'Production community adapter current axes reset; no whole-travel or parked-tool clearance claim.'};
   }else palette=assertEvaFrontPalettes(root,meta,asset.fan_keys);
   const installedNative=nativeMode?await auditNativeInstalledFront({base,asset,owner,bundle:nativeBundle,model,meta,sourceBaseline:initial,registry,patch,patchMeta,adapter,heads,community,installations,options,inputs}):null;
   report.assets.push({owner:asset.owner,generation:asset.generation,kind:asset.kind,mode:evaFrontOwnerMode(owner),model_sha256:model.sha256,decoded_model_sha256:model.decoded_sha256,metadata_sha256:metadata.sha256,source_evidence_sha256:evidenceFile.sha256,source_step_sha256:owner.source_step_sha256,source_revision:evidence.source_revision??owner.targets[0].source_revision,source_origin_mm:owner.source_origin_mm,head_companions:baselineKeys.length,recipe,preservation,fan,palette,controllerReset,witness,native_artifact_sha256:nativeBundle?.hashes??null,installedNative});
  }catch(error){report.failures.push({owner:asset.owner,message:error.message});}
  finally{for(const scene of [root,patchRoot])scene?.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of [].concat(m.material))material.dispose();}});}
 }
 for(const [filename,expected]of inputs)assert.equal(sha(await fs.readFile(filename)),expected,'EVA front audit input changed during run');
 report.scope.registered_owner_count=manifest.assets.length;
 report.scope.every_registered_owner=true;
 report.passed=evaFrontCoverageComplete(report.assets,report.failures,manifest.assets.map(a=>a.owner));report.completed_at_utc=new Date().toISOString();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),help='Usage: node scripts/audit_eva_front_surfaces.mjs --inputs EXPLICIT_INPUTS_JSON --report REPORT_JSON';
 assert(args.length===4&&args[0]==='--inputs'&&args[2]==='--report',help);
 let report;try{report=await auditEvaFrontSurfaces(args[1]);}catch(error){report={schema:'3d-print-rig-eva-front-actual-audit-v1',passed:false,failures:[{message:error.message}],physical_fit_certified:false};}
 const destination=path.resolve(args[3]);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,assets:report.assets?.length??0,failures:report.failures,physical_fit_certified:false}));if(!report.passed)process.exitCode=1;
}
