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
 const roots=['site/viewer/eva-front-surfaces.mjs','site/viewer/community-loader.mjs','site/viewer/community-adapter.mjs','site/viewer/palette-controller.mjs','site/viewer/eva-installations.mjs','site/viewer/vendor/GLTFLoader.js','site/viewer/vendor-r180/GLTFLoader.js','site/viewer/vendor/three.module.js','site/viewer/vendor-r180/three.module.js','scripts/three-test-loader.mjs'];
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
export function assertEvaFrontPreservation(before,after,repairKeys,{legacyEva2=null}={}){
 assert.deepEqual([...after.keys()].sort(),[...before.keys()].sort(),'Native EVA leaf inventory changed');
 const changed=new Set(repairKeys);assert(changed.size&&changed.size===repairKeys.length,'Invalid repeated front repair keys');
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
async function parseGlb(bytes){
 assert(bytes.length>=28&&bytes.readUInt32LE(0)===0x46546c67&&bytes.readUInt32LE(4)===2&&bytes.readUInt32LE(8)===bytes.length,'Invalid actual EVA GLB');
 const doc=JSON.parse(bytes.subarray(20,20+bytes.readUInt32LE(12)).toString('utf8'));
 assert.equal(doc.buffers?.length,1,'EVA front GLB requires one embedded buffer');assert(!doc.buffers[0].uri&&!(doc.images||[]).length&&!(doc.extensionsRequired||[]).length,'External/extended EVA GLB requires separate review');
 return (await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'')).scene;
}
export async function auditEvaFrontSurfaces(manifestFile){
 const file=path.resolve(manifestFile),base=path.dirname(file),raw=await fs.readFile(file),manifest=JSON.parse(raw),inputs=new Map([[file,sha(raw)]]);
 assert.equal(manifest.schema,'3d-print-rig-eva-front-audit-inputs-v1');
 assert(Array.isArray(manifest.assets)&&manifest.assets.length===4,'Front audit requires all four standalone/installed owner assets');
 assert.deepEqual(manifest.assets.map(a=>`${a.generation}/${a.kind}`).sort(),['2/installed','2/standalone','3/installed','3/standalone'],'Missing/repeated EVA owner generation');
 assert.equal(new Set(manifest.assets.map(a=>a.owner)).size,4,'Repeated EVA front owner binding');
 const registryFile=await pinnedFile(base,manifest.registry,inputs),registry=JSON.parse(registryFile.decoded),patch=await pinnedFile(base,manifest.patch,inputs),patchMetaFile=await pinnedFile(base,manifest.patch_metadata,inputs),patchMeta=JSON.parse(patchMetaFile.decoded);
 const adapterFile=await pinnedFile(base,manifest.adapter,inputs);
 const headsFile=await pinnedFile(base,manifest.heads,inputs),heads=JSON.parse(headsFile.decoded),communityFile=await pinnedFile(base,manifest.community,inputs),community=JSON.parse(communityFile.decoded),installationsFile=await pinnedFile(base,manifest.installations,inputs),installations=JSON.parse(installationsFile.decoded);
 const adapter=await import(pathToFileURL(path.resolve(base,manifest.adapter.path)).href);
 assert(typeof adapter.applyEvaFrontSurfaces==='function','Production EVA front surface helper missing');
 adapter.validateEvaFrontRegistry(registry);
 assert.deepEqual(Object.keys(registry.owners).sort(),manifest.assets.map(a=>a.owner).sort(),'Actual front audit must cover every production owner binding');
 assert.equal(registry.asset.files['model.glb'].sha256,patch.sha256,'Actual patch does not match production descriptor');
 assert.equal(registry.asset.files['model.glb'].decoded_sha256??patch.sha256,patch.decoded_sha256,'Actual decoded patch does not match production descriptor');
 assert.equal(registry.asset.files['parts.json'].sha256,patchMetaFile.sha256,'Actual patch metadata does not match production descriptor');
 assert.equal(patchMeta.id,registry.asset.component_id,'Production patch component identity mismatch');
 assert.equal(patchMeta.source_solids_modified,false);assert.equal(patchMeta.supports_removed,false);
 const codeInputs=evaFrontCodeClosure();for(const [relative,hash]of Object.entries(codeInputs)){const filename=fileURLToPath(new URL('../'+relative,import.meta.url));assert.equal(sha(await fs.readFile(filename)),hash,'Production dependency changed while pinning closure');inputs.set(filename,hash);}
 assert.equal(codeInputs['site/viewer/eva-front-surfaces.mjs'],adapterFile.sha256,'Audit must invoke the current pinned production helper');
 const report={schema:'3d-print-rig-eva-front-actual-audit-v1',passed:false,started_at_utc:new Date().toISOString(),registry_sha256:registryFile.sha256,heads_sha256:headsFile.sha256,community_sha256:communityFile.sha256,installations_sha256:installationsFile.sha256,patch_sha256:patch.sha256,patch_decoded_sha256:patch.decoded_sha256,patch_metadata_sha256:patchMetaFile.sha256,adapter_sha256:adapterFile.sha256,audit_sha256:sha(await fs.readFile(fileURLToPath(import.meta.url))),production_code_sha256:codeInputs,assets:[],failures:[],scope:{four_actual_owners:true,source_native_triangle_normals:true,source_defined_void_grille_witnesses:true,authored_mating_transforms:true,untouched_source_hardware:true,production_surface_helper:true,production_static_import_closure:true,pinned_source_recipes:true,palettes_A_B_A:true,browser_visual_review:false,native_solid_boolean_recomputed:false,supports_removed:false,physical_fit_certified:false}};
 for(const asset of manifest.assets){
  let root,patchRoot;
  try{
   const model=await pinnedFile(base,asset.model,inputs),metadata=await pinnedFile(base,asset.metadata,inputs),evidenceFile=await pinnedFile(base,asset.evidence,inputs),meta=JSON.parse(metadata.decoded),evidence=JSON.parse(evidenceFile.decoded);
   assert.equal(evidence.generation,asset.generation,'Owner source generation mismatch');
   const recipe=evaFrontRecipe(heads,community,installations,asset,meta);
   const baselineKeys=asset.head_keys;assert(Array.isArray(baselineKeys)&&baselineKeys.length===sourceCounts[asset.generation]&&new Set(baselineKeys).size===baselineKeys.length,'Incomplete original EVA head companion inventory');
   root=await parseGlb(model.decoded);patchRoot=await parseGlb(patch.decoded);
   assert.equal(asset.owner,meta.id??meta.machine_id,'Actual asset does not match owner ID');
   const owner=registry.owners[asset.owner];assert.equal(owner.model_sha256,model.decoded_sha256,'Stale production owner/model hash');
   assert.equal(owner.source_step_sha256,sourceSteps[asset.generation],'Wrong production owner native source');
   assertEvaFrontSurfacePins(evidence,owner,patchMeta);
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
   const applied=await adapter.applyEvaFrontSurfaces(root,meta,model.decoded_sha256,{registry,patchRoot,patchMeta,...(sourceProfile?{sourceOriginMm:sourceProfile.origin_mm}:{})});
   assert(applied,'Production front patch was not applied');
   const witness=assertEvaFrontWitnesses(root,meta,asset.bindings,evidence,{originMm:owner.source_origin_mm,owner:asset.owner,modelSha256:model.decoded_sha256}),preservation=assertEvaFrontPreservation(initial,evaFrontSnapshot(root,meta),witness.repair_keys,{legacyEva2:asset.generation===2?{owner:asset.owner,modelSha256:model.decoded_sha256}:null});
   let fan=assertEvaFrontFanProtection(root,meta,asset.fan_keys,initial,{requireDark:asset.kind!=='installed'});
   assert.equal(applied,witness.repair_keys.length,'Missing/repeated production target patch');
   assert.deepEqual(owner.targets.map(t=>t.part_key).sort(),witness.repair_keys.slice().sort(),'Owner targets differ from independently witnessed printed leaves');
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
   report.assets.push({owner:asset.owner,generation:asset.generation,kind:asset.kind,model_sha256:model.sha256,decoded_model_sha256:model.decoded_sha256,metadata_sha256:metadata.sha256,source_evidence_sha256:evidenceFile.sha256,source_step_sha256:evidence.source_step_sha256,source_revision:evidence.source_revision,source_origin_mm:owner.source_origin_mm,head_companions:baselineKeys.length,recipe,preservation,fan,palette,controllerReset,witness});
  }catch(error){report.failures.push({owner:asset.owner,message:error.message});}
  finally{for(const scene of [root,patchRoot])scene?.traverse(m=>{if(m.isMesh){m.geometry.dispose();for(const material of [].concat(m.material))material.dispose();}});}
 }
 for(const [filename,expected]of inputs)assert.equal(sha(await fs.readFile(filename)),expected,'EVA front audit input changed during run');
 report.passed=report.assets.length===4&&report.failures.length===0;report.completed_at_utc=new Date().toISOString();return report;
}
if(process.argv[1]&&path.resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 const args=process.argv.slice(2),help='Usage: node scripts/audit_eva_front_surfaces.mjs --inputs EXPLICIT_INPUTS_JSON --report REPORT_JSON';
 assert(args.length===4&&args[0]==='--inputs'&&args[2]==='--report',help);
 let report;try{report=await auditEvaFrontSurfaces(args[1]);}catch(error){report={schema:'3d-print-rig-eva-front-actual-audit-v1',passed:false,failures:[{message:error.message}],physical_fit_certified:false};}
 const destination=path.resolve(args[3]);await fs.mkdir(path.dirname(destination),{recursive:true});await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,assets:report.assets?.length??0,failures:report.failures,physical_fit_certified:false}));if(!report.passed)process.exitCode=1;
}
