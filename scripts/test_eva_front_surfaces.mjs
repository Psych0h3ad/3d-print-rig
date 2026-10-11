// Negative fixtures for source-defined voids/normals and the production guard.
// Synthetic grille geometry is not evidence that an actual native head fits.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
import {applyEvaFrontSurfaces,validateEvaFrontRegistry,evaFrontOwnerMode} from '../site/viewer/eva-front-surfaces.mjs';
import {evaFrontSnapshot,assertEvaFrontPreservation,assertEvaFrontWitnesses,assertEvaNativeFrontWitnesses,assertEvaFrontFanProtection,assertEvaFrontPalettes,evaFrontIdentity,assertEvaFrontSurfacePins,evaFrontRecipe,evaFrontCodeClosure,evaFrontCoverageComplete} from './audit_eva_front_surfaces.mjs';

const clone=structuredClone,H='a'.repeat(64),MODEL='b'.repeat(64),PATCH='c'.repeat(64);
const steps={2:'46650c0be0527b0f799a6ebd5cde210254caafdc4c436f558857fa30c17e9b94',3:'9bfde01c4d811eaef253831f2fe7354e14c36b607d36b5b37bfc4fe9f48906d6'};
let rejected=0,positive=0;
const extendedOwners=['eva2','vminion','eva3','vcore','eva3_orbiter','eva2_v6'];
const extendedReviews=extendedOwners.map(owner=>({owner}));
assert(evaFrontCoverageComplete(extendedReviews,[],extendedOwners));positive++;
for(const rows of [extendedReviews.slice(0,4),[...extendedReviews.slice(0,-1),{owner:'extra'}],[...extendedReviews.slice(0,-1),extendedReviews[0]]]){assert.equal(evaFrontCoverageComplete(rows,[],extendedOwners),false);rejected++;}
assert.equal(evaFrontCoverageComplete(extendedReviews,[{owner:'eva2_v6',message:'Failed source aperture'}],extendedOwners),false);rejected++;
function rect(x0,z0,x1,z1,y=-2){return [[[x0,y,z0],[x1,y,z0],[x1,y,z1]],[[x0,y,z0],[x1,y,z1],[x0,y,z1]]];}
const grille=[...rect(-20,-20,20,-18),...rect(-20,18,20,20),...rect(-20,-18,-18,18),...rect(18,-18,20,18),...rect(-2,-2,2,2),...rect(-18,-1,-2,1),...rect(2,-1,18,1),...rect(-1,2,1,18),...rect(-1,-18,1,-2)];
function geometry(tris,origin=[0,0,0]){
 const p=[],n=[],index=[];
 tris.forEach(t=>t.forEach(v=>{index.push(index.length);p.push((v[0]-origin[0])*.001,(v[2]-origin[2])*.001,-(v[1]-origin[1])*.001);n.push(0,0,1);}));
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(p,3));g.setAttribute('normal',new THREE.Float32BufferAttribute(n,3));g.setIndex(index);return g;
}
function fixture(generation=3,origin=[0,0,0]){
 const root=new THREE.Group(),patchRoot=new THREE.Group(),sourcePath=['Synthetic native occurrence','Synthetic grille:1'];
 const parts=[{key:'cover',source_path:sourcePath,printed:true,appearance_role:'accent',native_bounds_mm:[[-20,-2,-20],[20,-2,20]]},...['fan1','fan2'].map((key,i)=>({key,source_path:['Synthetic native occurrence','Purchased fan:'+i],printed:false,appearance_role:'purchased'}))];
 const cover=new THREE.Mesh(geometry(grille,origin),new THREE.MeshStandardMaterial({color:0xe32636}));cover.userData.part_key='cover';root.add(cover);
 for(const [i,key]of ['fan1','fan2'].entries()){const mesh=new THREE.Mesh(geometry(rect(-20,-20,20,20,4+i),origin),new THREE.MeshStandardMaterial({color:0x222222,metalness:0,roughness:.65}));mesh.userData.part_key=key;root.add(mesh);}
 const patch=new THREE.Mesh(geometry(grille),new THREE.MeshStandardMaterial());patch.userData.part_key='patch';patchRoot.add(patch);
 const meta={id:'owner',eva_generation:generation,source_sha256:steps[generation],source_origin_mm:origin,parts};
 const owner={id:'owner',model_sha256:MODEL,source_step_sha256:steps[generation],source_origin_mm:origin,targets:[{part_key:'cover',patch_key:'patch',source_path:sourcePath,source_brep_sha256:H}]};
 const registry={schema:'3d-print-rig-eva-front-surfaces-v1',source_solids_modified:false,supports_removed:false,asset:{component_id:'fixture',external:{base_url:'https://example.org/public/eva-front/',local_directory:'eva-front-fixture/'},files:{'model.glb':{decoded_sha256:PATCH}}},owners:{owner}};
 for(const id of ['other1','other2','other3'])registry.owners[id]={...clone(owner),id};
 const patchMeta={id:'fixture',source_solids_modified:false,supports_removed:false,parts:[{key:'patch',source_brep_sha256:H}]};
 const proof={source_path:sourcePath,source_brep_sha256:H,correction_kind:'source_null_faces_rendering',native_void_domains_proven:true,feature_family:'fan_grille',triangle_witnesses:grille.map(vertices_mm=>({source_face_ordinal:0,vertices_mm,center_normal_unit:[0,-1,0],corner_normals_unit:[[0,-1,0],[0,-1,0],[0,-1,0]]})),aperture_witnesses:[{id:'open',kind:'void',origin_mm:[10,-10,10],direction_unit:[0,1,0],range_mm:[0,10],expected_hit:false,opposed_source_faces:[1,2]},...[[0,0,'hub'],[10,0,'arm'],[19,10,'rim']].map(([x,z,kind])=>({id:kind,kind,origin_mm:[x,-10,z],direction_unit:[0,1,0],range_mm:[0,10],expected_hit:true,expected_distance_mm:8,source_face_ordinal:0}))]};
 const evidence={schema:'3d-print-rig-eva-front-source-witnesses-v1',generation,source_step_sha256:steps[generation],source_revision:'synthetic-fixture',supports_removed:false,physical_fit_certified:false,parts:[proof]};
 return {root,patchRoot,cover,patch,meta,registry,patchMeta,evidence,bindings:{[evaFrontIdentity(proof)]:'cover'}};
}
const apply=f=>applyEvaFrontSurfaces(f.root,f.meta,MODEL,f);
const witnesses=f=>assertEvaFrontWitnesses(f.root,f.meta,f.bindings,f.evidence);
function rejectedGuard(mutator,pattern){const f=fixture();mutator(f);assert.throws(()=>apply(f),pattern);rejected++;}
function rejectedAudit(mutator,pattern){const f=fixture();apply(f);mutator(f);assert.throws(()=>witnesses(f),pattern);rejected++;}
for(const generation of [2,3])for(const origin of [[0,0,0],[70,0,0]]){
 const f=fixture(generation,origin),before=evaFrontSnapshot(f.root,f.meta);assert.equal(apply(f),1);
 const result=witnesses(f);assert.equal(result.rows[0].triangles,grille.length);assert.equal(result.rows[0].void_witnesses,1);
 assertEvaFrontPreservation(before,evaFrontSnapshot(f.root,f.meta),['cover']);assertEvaFrontFanProtection(f.root,f.meta,['fan1','fan2'],before);
 const palette=assertEvaFrontPalettes(f.root,f.meta,['fan1','fan2']);assert.deepEqual(palette.sequence,['A','B','A']);positive++;
}
{
 const f=fixture(2,[70,0,0]);delete f.meta.source_origin_mm;
 assert.equal(applyEvaFrontSurfaces(f.root,f.meta,MODEL,{...f,sourceOriginMm:[70,0,0]}),1);positive++;
 const g=fixture(2,[70,0,0]);
 assert.throws(()=>applyEvaFrontSurfaces(g.root,g.meta,MODEL,{...g,sourceOriginMm:[0,0,0]}),/frame/);rejected++;
 assert.throws(()=>applyEvaFrontSurfaces(g.root,g.meta,MODEL,{...g,sourceOriginMm:[NaN,0,0]}),/frame/);rejected++;
}
function legacyEva2(){
 const f=fixture(2,[70,0,0]),sourcePath=['Rat Rig - V-Minion 1.0 v7','Full Assembly v6:1','EVA Assembly v5:1','ratrig_eva_shroud v2:1'];
 const part=f.meta.parts[0];delete part.printed;part.appearance_role='base';part.source_path=sourcePath;
 f.evidence.parts[0].source_path=sourcePath;f.evidence.parts[0].source_brep_sha256='c2849ab7e2b621903eec5fb0cf658f7f0d6893f45bfacc016a2105a772f81add';
 f.bindings={[JSON.stringify(sourcePath)]:'cover'};
 f.options={originMm:[70,0,0],owner:'ratrig_vminion_180',modelSha256:'b394124d0ef44519aa24cd005d1433305f35a545c3b8d5f9c8cccb8268fb0175'};return f;
}
function composedFront(){
 const f=fixture(2,[70,0,0]),part=f.meta.parts[0];delete f.meta.source_sha256;
 part.source_sha256=steps[2];
 f.meta.eva_composition={recipe_sha256:H,part_sources:{cover:{source_sha256:steps[2],source_path:clone(part.source_path)}}};
 return f;
}
{
 const f=composedFront(),before=evaFrontSnapshot(f.root,f.meta);assert.equal(apply(f),1);
 assertEvaFrontPreservation(before,evaFrontSnapshot(f.root,f.meta),['cover']);witnesses(f);positive++;
}
for(const mutate of [f=>delete f.meta.eva_composition.part_sources.cover,
 f=>f.meta.eva_composition.part_sources.cover.source_sha256=steps[3],
 f=>f.meta.parts[0].source_sha256=steps[3],
 f=>f.meta.eva_composition.part_sources.cover.source_path=['wrong','occurrence']]){
 const f=composedFront(),original=f.cover.geometry;mutate(f);
 assert.throws(()=>apply(f),/Stale/);assert.equal(f.cover.geometry,original);rejected++;
}
{
 const f=legacyEva2();assertEvaFrontWitnesses(f.root,f.meta,f.bindings,f.evidence,f.options);
 const before=evaFrontSnapshot(f.root,f.meta);assertEvaFrontPreservation(before,before,['cover'],{legacyEva2:f.options});positive++;
}
for(const mutate of [f=>f.options.owner='unknown',f=>f.options.modelSha256=MODEL,f=>f.evidence.parts[0].source_brep_sha256=H,f=>f.meta.parts[0].printed=false,f=>f.meta.parts[0].printed=null,f=>f.meta.parts[0].appearance_role='purchased']){
 const f=legacyEva2();mutate(f);assert.throws(()=>assertEvaFrontWitnesses(f.root,f.meta,f.bindings,f.evidence,f.options),/purchased/);rejected++;
}
{
 const f=fixture(),owner=f.registry.owners.owner,proof=f.evidence.parts[0];proof.source_surface_array_sha256=H;
 Object.assign(f.patchMeta.parts[0],{surface_input_sha256:H,source_step_sha256:steps[3],source_path:owner.targets[0].source_path,triangles:grille.length});
 assertEvaFrontSurfacePins(f.evidence,owner,f.patchMeta);positive++;
 for(const mutation of [p=>p.surface_input_sha256=MODEL,p=>delete p.surface_input_sha256,p=>p.source_step_sha256=steps[2],p=>p.triangles--]){
  const changed=clone(f.patchMeta);mutation(changed.parts[0]);assert.throws(()=>assertEvaFrontSurfacePins(f.evidence,owner,changed),/pin|SHA|count/);rejected++;
 }
}
rejectedGuard(f=>f.registry.owners.owner.model_sha256='d'.repeat(64),/Stale/);
rejectedGuard(f=>f.meta.source_sha256='d'.repeat(64),/Stale/);
rejectedGuard(f=>f.meta.source_origin_mm=[70,0,0],/Stale/);
rejectedGuard(f=>f.meta.id='unknown',/Unregistered/);
rejectedGuard(f=>f.registry.owners.owner.targets[0].part_key='fan1',/occurrence/);
rejectedGuard(f=>f.meta.parts[0].source_path=['different','printed occurrence'],/occurrence/);
rejectedGuard(f=>f.registry.owners.owner.targets[0].patch_key='absent',/occurrence/);
rejectedGuard(f=>f.patchMeta.parts[0].source_brep_sha256='e'.repeat(64),/occurrence/);
rejectedGuard(f=>f.patch.geometry.translate(.00004,0,0),/envelope/);
rejectedGuard(f=>f.patch.geometry.attributes.normal.setXYZ(0,0,0,0),/position\/normal/);
rejectedGuard(f=>f.patch.geometry.attributes.position.setXYZ(0,NaN,0,0),/position\/normal/);
rejectedGuard(f=>f.patch.geometry.index.setX(0,1e9),/index/);
rejectedGuard(f=>f.patch.geometry.deleteAttribute('normal'),/Incomplete/);
rejectedGuard(f=>f.registry.owners.owner.targets.push(clone(f.registry.owners.owner.targets[0])),/owner/);
rejectedGuard(f=>delete f.registry.owners.other3,/registry/);
rejectedGuard(f=>f.cover.position.x=.001,/frame/);
rejectedGuard(f=>delete f.registry.asset.files,/registry/);
rejectedGuard(f=>delete f.registry.asset.files['model.glb'].decoded_sha256,/registry/);
rejectedGuard(f=>f.meta.parts[0].printed=false,/occurrence/);
rejectedGuard(f=>f.patch.position.z=.001,/patch frame/);
rejectedGuard(f=>f.patchRoot.rotation.x=.1,/patch frame/);
{
 const f=fixture(),original=f.cover.geometry;
 f.registry.owners.owner.targets.push({part_key:'missing',patch_key:'patch',source_path:['Missing'],source_brep_sha256:H});
 assert.throws(()=>apply(f),/occurrence/);assert.equal(f.cover.geometry,original,'Partial front patch mutated geometry before an invalid target failed');rejected++;
}
{
 const f=fixture(),original=f.cover.geometry;delete f.registry.asset.files;
 assert.throws(()=>apply(f),/registry/);assert.equal(f.cover.geometry,original,'Missing descriptors caused partial patch mutation');rejected++;
}

rejectedAudit(f=>{const index=f.cover.geometry.index,a=index.getX(0),b=index.getX(1);index.setX(0,b);index.setX(1,a);},/winding/);
rejectedAudit(f=>{const n=f.cover.geometry.attributes.normal;for(let i=0;i<3;i++)n.setXYZ(i,0,0,-1);},/normal opposes/);
rejectedAudit(f=>f.cover.geometry.index.setX(1,f.cover.geometry.index.getX(0)),/Degenerate/);
{
 // Finite source-native vertices can collapse only after the production's
 // second Float32 write when subtracting its baked 70 mm display origin.
 const sliver=[[-17.484647703962818,-11.999624987908199,136.86444488970753],[-17.484651368464892,-12.000030948427883,131.15926734490614],[-17.484650498791545,-11.99962498988786,136.86444569858804]];
 const f=fixture(2,[70,0,0]);f.cover.geometry=geometry([...grille,sliver]);f.cover.geometry.translate(-.07,0,0);
 assert.throws(()=>assertEvaFrontWitnesses(f.root,f.meta,f.bindings,f.evidence,{originMm:[70,0,0]}),/Degenerate/);rejected++;
}
rejectedAudit(f=>f.cover.geometry.attributes.normal.setXYZ(0,0,0,0),/Non-unit/);
rejectedAudit(f=>f.cover.geometry.translate(.001,0,0),/missing or moved/);
rejectedAudit(f=>f.evidence.parts[0].triangle_witnesses.pop(),/every repaired/);
rejectedAudit(f=>f.evidence.parts[0].triangle_witnesses[0].source_face_ordinal=null,/native face/);
rejectedAudit(f=>f.evidence.parts[0].native_void_domains_proven=false,/Unproved/);
rejectedAudit(f=>f.evidence.supports_removed=true,/not support removal/);
rejectedAudit(f=>f.evidence.physical_fit_certified=true,/must not certify/);
rejectedAudit(f=>f.evidence.source_step_sha256='0'.repeat(64),/generation/);
rejectedAudit(f=>f.evidence.parts[0].aperture_witnesses=f.evidence.parts[0].aperture_witnesses.filter(w=>w.kind!=='arm'),/feature arm/);
rejectedAudit(f=>f.evidence.parts[0].aperture_witnesses[0].origin_mm=[0,-10,0],/void mismatch/);
rejectedAudit(f=>f.evidence.parts[0].aperture_witnesses.find(w=>w.kind==='hub').origin_mm=[10,-10,10],/void mismatch/);
rejectedAudit(f=>f.bindings[evaFrontIdentity(f.evidence.parts[0])]='fan1',/occurrence/);
{
 const f=fixture(),before=evaFrontSnapshot(f.root,f.meta);apply(f);const fan=f.root.children.find(n=>n.userData.part_key==='fan1');fan.geometry=fan.geometry.clone();fan.geometry.translate(.001,0,0);
 assert.throws(()=>assertEvaFrontPreservation(before,evaFrontSnapshot(f.root,f.meta),['cover']),/Unchanged native geometry/);rejected++;
}
{
 const f=fixture(),before=evaFrontSnapshot(f.root,f.meta);apply(f);f.root.remove(f.root.children.find(n=>n.userData.part_key==='fan2'));
 assert.throws(()=>evaFrontSnapshot(f.root,f.meta),/Missing actual EVA/);rejected++;
}
{
 const f=fixture(),before=evaFrontSnapshot(f.root,f.meta);apply(f);f.root.children.find(n=>n.userData.part_key==='fan1').material.color.set('#ff0000');
 assert.throws(()=>assertEvaFrontFanProtection(f.root,f.meta,['fan1','fan2'],before),/finish changed/);rejected++;
}
{
 const f=fixture();apply(f);f.meta.parts.find(p=>p.key==='fan1').appearance_role='accent';
 assert.throws(()=>assertEvaFrontPalettes(f.root,f.meta,['fan1','fan2']),/classified as printed/);rejected++;
}

let nativePositive=0,nativeRejected=0;
const META='d'.repeat(64),nativeSource='e'.repeat(64);
function nativeFixture(origin=[0,0,0]){
 const f=fixture(3,origin),target=f.registry.owners.owner.targets[0],part=f.meta.parts[0];delete target.patch_key;
 Object.assign(target,{source_sha256:nativeSource,source_revision:'onshape:synthetic-native-microversion',source_label_path:['0:1','0:2'],definition_label:'0:3',native_bounds_mm:clone(part.native_bounds_mm)});
 for(const field of ['source_sha256','source_revision','source_path','source_label_path','definition_label','source_brep_sha256'])part[field]=clone(target[field]);
 const descriptor={path:'native/cover.surface.json.gz',sha256:H,bytes:100,encoding:'gzip',decoded_bytes:200,decoded_sha256:PATCH};
 const owner=f.registry.owners.owner;Object.assign(owner,{mode:'native_export',patch_required:false,configuration_id:'native-fixture',metadata_sha256:META,source_step_sha256:nativeSource,
  native_export:{required_views:['standalone','installed'],external:{base_url:'https://example.org/public/',local_directory:'native-front-fixture'},witness:{path:'native/witness.json',bytes:100,sha256:H},audit:{path:'native/audit.json',bytes:100,sha256:H},rays:{path:'native/rays.json',bytes:100,sha256:H},surfaces:{cover:descriptor},ray_part_key:'cover'}});
 const surface={schema:'3d-print-rig-current-eva-native-surfaces-v1',configuration:owner.configuration_id,key:'cover',...clone(target),source_origin_mm:clone(origin),coordinate_system:'Original installed source world Z-up millimetres; normals in the same native basis.',
  positions_mm:grille.flat().map(v=>[...v]),normals:grille.flat().map(()=>[0,-1,0]),triangles:grille.map((_t,i)=>[i*3,i*3+1,i*3+2]),source_face_map:grille.map(()=>0),
  source_native_face_receipts:[{face_ordinal:0,triangles:grille.length,native_area_mm2:100}],all_native_faces_represented:true,supports_removed:false,removed_native_domains:[]};
 const identity=Object.fromEntries(['source_sha256','source_revision','source_path','source_label_path','definition_label','source_brep_sha256'].map(k=>[k,clone(target[k])]));
 const model={sha256:MODEL,decoded_sha256:MODEL},metadata={sha256:META};
 const witness={schema:'3d-print-rig-eva-current-front-native-owner-witness-v1',configuration:owner.configuration_id,model,metadata,parts:[{key:'cover',...identity,triangles:grille.length,faces:1,surface:clone(descriptor),native_bounds_mm:clone(target.native_bounds_mm),removed_native_domains:[]}],owner_frames:['standalone','installed'].map(kind=>({kind,...(kind==='installed'?{machine_id:'native-fixture-host'}:{}),source_origin_mm:clone(origin)})),original_128_front_domains_retained:false,apply_original_128_patch:false,full_physical_fit_certified:false};
 const audit={schema:'3d-print-rig-current-eva-front-native-audit-v1',configuration:owner.configuration_id,model,metadata,parts:[{key:'cover',...identity,surface:clone(descriptor),native_faces:1,triangles:grille.length,all_native_faces_represented:true,zero_native_domains_removed:true,failures:0,face_results:[{native_face:0,triangles:grille.length,minimum_native_winding_dot:1,minimum_native_normal_dot:1,failures:[]}]}],passed:true,full_physical_fit_certified:false};
 const rays={schema:'3d-print-rig-eva-current-front-rays-v1',configuration:owner.configuration_id,model_sha256:MODEL,metadata_sha256:META,...identity,target_key:'cover',unexpected_open_airway_hit_count:0,rays:[{samples:[-10,-5,0].map(y=>({native_world_mm:[10,y,10],state:'TopAbs_State.TopAbs_OUT'})),hits:[]}]};
 return {...f,owner,bundle:{witness,audit,rays,surfaces:{cover:surface}},nativeOptions:{modelSha256:MODEL,metadataSha256:META,originMm:origin}};
}
const nativeApply=f=>applyEvaFrontSurfaces(f.root,f.meta,MODEL,{...f,metadataSha256:META});
const nativeWitness=f=>assertEvaNativeFrontWitnesses(f.root,f.meta,f.owner,f.bundle,f.nativeOptions);
for(const origin of [[0,0,0],[70,0,0]]){
 const f=nativeFixture(origin),before=evaFrontSnapshot(f.root,f.meta),original=f.cover.geometry;
 assert.equal(nativeApply(f),1);assert.equal(f.cover.geometry,original,'Native owner substituted old Rapido geometry');
 const proof=nativeWitness(f);assert.deepEqual(proof.repair_keys,[]);assert.equal(proof.native_export,true);
 assertEvaFrontPreservation(before,evaFrontSnapshot(f.root,f.meta),[],{nativeExport:true});assertEvaFrontPalettes(f.root,f.meta,['fan1','fan2']);positive++;nativePositive++;
}
{
 const f=nativeFixture(),original=f.cover.geometry;f.patch.geometry.attributes.position.setXYZ(0,NaN,0,0);
 assert.equal(nativeApply(f),1);assert.equal(f.cover.geometry,original);assert.equal(f.cover.userData.eva_front_surface,undefined);positive++;nativePositive++;
}
function rejectNativeGuard(change,pattern){const f=nativeFixture(),original=f.cover.geometry;change(f);assert.throws(()=>nativeApply(f),pattern);assert.equal(f.cover.geometry,original);rejected++;nativeRejected++;}
for(const [change,pattern]of [
 [f=>f.owner.mode='declaration_only',/mode/],[f=>f.owner.patch_required=true,/owner/],
 [f=>delete f.owner.metadata_sha256,/owner/],[f=>f.owner.metadata_sha256=H,/metadata/],
 [f=>f.owner.model_sha256=H,/model/],[f=>f.owner.source_origin_mm=[70,0,0],/frame/],
 [f=>f.owner.targets[0].patch_key='patch',/identity/],[f=>f.meta.parts[0].printed=false,/occurrence/],
 [f=>f.meta.parts[0].source_brep_sha256=MODEL,/occurrence/],[f=>f.meta.parts[0].source_revision='stale',/occurrence/],
 [f=>f.meta.parts[0].source_sha256=MODEL,/occurrence/],[f=>f.meta.parts[0].source_label_path=['wrong'],/occurrence/],
 [f=>f.meta.parts[0].definition_label='wrong',/occurrence/],[f=>f.cover.geometry.translate(.001,0,0),/envelope/],
 [f=>f.owner.native_export.required_views=['standalone'],/owner/],[f=>delete f.owner.native_export.surfaces.cover,/owner/],
 [f=>f.owner.native_export.audit.bytes=477763110,/descriptor/],
 [f=>f.owner.native_export.surfaces.cover.encoding='br',/descriptor/],
 [f=>delete f.owner.native_export.surfaces.cover.decoded_sha256,/descriptor/],
 [f=>f.owner.native_export.witness.path='../private.json',/descriptor/],
 [f=>f.owner.targets[0].native_bounds_mm[0][0]=21,/identity/]
])rejectNativeGuard(change,pattern);
{
 const f=nativeFixture(),original=f.cover.geometry;assert.throws(()=>applyEvaFrontSurfaces(f.root,f.meta,MODEL,f),/metadata/);assert.equal(f.cover.geometry,original);rejected++;nativeRejected++;
}
for(const [change,pattern]of [
 [f=>f.bundle.witness.model.decoded_sha256=H,/model/],
 [f=>f.bundle.audit.metadata.sha256=H,/metadata/],
 [f=>f.bundle.witness.apply_original_128_patch=true,/Rapido/],
 [f=>f.bundle.audit.passed=false,/failed/],
 [f=>f.bundle.audit.parts[0].face_results[0].minimum_native_winding_dot=-1,/winding/],
 [f=>f.bundle.audit.parts[0].face_results[0].minimum_native_normal_dot=0,/normal/],
 [f=>f.bundle.witness.parts=[],/proof part/],
 [f=>f.bundle.surfaces.cover.source_brep_sha256=MODEL,/identity/],
 [f=>f.bundle.surfaces.cover.source_revision='stale',/identity/],
 [f=>f.bundle.surfaces.cover.source_origin_mm=[70,0,0],/origin/],
 [f=>f.bundle.surfaces.cover.source_face_map.pop(),/face map/],
 [f=>f.bundle.surfaces.cover.removed_native_domains=[0],/domains/],
 [f=>f.bundle.surfaces.cover.positions_mm[0][0]+=.01,/missing or moved/],
 [f=>f.bundle.surfaces.cover.normals[0]=[0,1,0],/normal changed/],
 [f=>f.cover.geometry.index.setX(0,f.cover.geometry.index.getX(1)),/Degenerate/],
 [f=>{const i=f.cover.geometry.index,a=i.getX(0);i.setX(0,i.getX(1));i.setX(1,a)},/winding/],
 [f=>f.bundle.witness.parts[0].surface.sha256=MODEL,/descriptor/],
 [f=>delete f.bundle.rays.target_key,/source part/],
 [f=>f.bundle.rays.source_brep_sha256=MODEL,/BRep/],
 [f=>f.bundle.rays.source_revision='stale',/revision/],
 [f=>f.bundle.rays.metadata_sha256=H,/equal/],
 [f=>f.bundle.rays.rays[0].samples[1].state='TopAbs_State.TopAbs_IN',/airway/],
 [f=>f.bundle.rays.rays[0].samples[1].native_world_mm[0]+=.1,/collinear/],
 [f=>f.bundle.rays.rays[0].samples.forEach(s=>{s.native_world_mm[0]=0;s.native_world_mm[2]=0}),/blocked/],
 [f=>f.bundle.witness.owner_frames=f.bundle.witness.owner_frames.filter(r=>r.kind!=='standalone'),/frame/]
]){const f=nativeFixture();nativeApply(f);change(f);assert.throws(()=>nativeWitness(f),pattern);rejected++;nativeRejected++;}
{
 const f=nativeFixture(),before=evaFrontSnapshot(f.root,f.meta);nativeApply(f);f.cover.geometry=f.cover.geometry.clone();
 assert.throws(()=>assertEvaFrontPreservation(before,evaFrontSnapshot(f.root,f.meta),[],{nativeExport:true}),/Unchanged native geometry/);rejected++;nativeRejected++;
}
{
 const f=nativeFixture();nativeApply(f);f.root.position.set(.02,.03,-.01);f.root.updateMatrixWorld(true);
 const options={...f.nativeOptions,kind:'installed',machineId:'native-fixture-host'};
 assertEvaNativeFrontWitnesses(f.root,f.meta,f.owner,f.bundle,{...options,nativeMotionMm:[20,10,30]});positive++;nativePositive++;
 assert.throws(()=>assertEvaNativeFrontWitnesses(f.root,f.meta,f.owner,f.bundle,{...options,nativeMotionMm:[0,0,0]}),/missing or moved/);rejected++;nativeRejected++;
 for(const machineId of [null,'another-host']){assert.throws(()=>assertEvaNativeFrontWitnesses(f.root,f.meta,f.owner,f.bundle,{...options,machineId,nativeMotionMm:[20,10,30]}),/source host/);rejected++;nativeRejected++;}
}

// Source-default registration: no missing owner is a skipped pass. This joins
// the repository runner through its existing test_*.mjs discovery mechanism.
const registry=JSON.parse(await fs.readFile(new URL('../site/EVA_FRONT_SURFACES.json',import.meta.url),'utf8'));
validateEvaFrontRegistry(registry);
const heads=JSON.parse(await fs.readFile(new URL('../site/HEAD_ADDITIONS.json',import.meta.url),'utf8'));
const installed=JSON.parse(await fs.readFile(new URL('../site/EVA_INSTALLATIONS.json',import.meta.url),'utf8'));
const community=JSON.parse(await fs.readFile(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url),'utf8'));
const codeClosure=evaFrontCodeClosure();
for(const key of ['site/viewer/vendor/three.module.js','site/viewer/vendor/three.core.js','site/viewer/vendor-r180/three.module.js','site/viewer/vendor-r180/three.core.js','site/viewer/community-state.mjs','site/viewer/native-motion-flex.mjs','site/viewer/component-assets.mjs'])assert(/^[a-f0-9]{64}$/.test(codeClosure[key]),'Missing mandatory production dependency '+key);
const variants=heads.variants.filter(v=>v.eva),expected=[];
for(const v of variants){
 if(expected.includes(v.base_asset))continue;expected.push(v.base_asset);
 const owner=registry.owners[v.base_asset],asset=heads.assets[v.base_asset];assert(owner&&asset,'Missing standalone front owner');
 assert.equal(owner.model_sha256,asset.files['model.glb'].decoded_sha256);
 const native=evaFrontOwnerMode(owner)==='native_export';
 if(native){
  assert.equal(owner.patch_required,false);assert.equal(owner.metadata_sha256,asset.files['parts.json'].sha256);
  assert.equal(owner.configuration_id,v.id);assert.deepEqual(owner.native_export.required_views,['standalone','installed']);
  const companions=new Set(Object.values(v.eva.companions).flat());assert(owner.targets.every(t=>companions.has(t.part_key)),'Native front target absent from exact companion recipe');
 }else assert.equal(owner.source_step_sha256,steps[v.eva.generation]);
 const keys=native?owner.targets.map(t=>t.part_key):v.eva.generation===2?['eva2_vminion_lgx_bmo_334']:['eva3_native_010','eva3_native_094'];
 assert.deepEqual(owner.targets.map(t=>t.part_key).sort(),keys.sort(),'Unexpected standalone printed front source keys');
 for(const [id,row]of Object.entries(installed.machines))if(row.configuration===v.id){
  expected.push(id);const host=registry.owners[id];assert(host,'Missing installed front owner');
  assert.equal(host.model_sha256,row.model_sha256);assert.equal(host.source_step_sha256,steps[v.eva.generation]);
  assert.deepEqual(host.targets.map(t=>t.part_key).sort(),keys.map(k=>row.head_keys[k]).sort(),'Unexpected installed printed front source keys');
  for(const target of owner.targets){const mate=host.targets.find(t=>t.part_key===row.head_keys[target.part_key]);assert.deepEqual(mate.source_path,target.source_path);assert.equal(mate.source_brep_sha256,target.source_brep_sha256);assert.equal(mate.patch_key,target.patch_key);}
 }
}
assert.deepEqual(Object.keys(registry.owners).sort(),expected.sort(),'All four exact native/standalone owners must be covered');
for(const [owner,row]of Object.entries(installed.machines)){
 const variant=heads.variants.find(v=>v.id===row.configuration),headKeys=Object.keys(row.head_keys),fanSources=[...variant.eva.companions.hotend_fan,...variant.eva.companions.part_fan];
 for(const kind of ['standalone','installed']){
  const isHost=kind==='installed',id=isHost?owner:variant.base_asset,spec=isHost?(row.asset??community.machines[owner]):heads.assets[id];
  const input={owner:id,kind,generation:row.generation,model:clone(spec.files['model.glb']),metadata:clone(spec.files[isHost?'assembly_manifest.json':'parts.json']),head_keys:isHost?Object.values(row.head_keys):headKeys,fan_keys:isHost?fanSources.map(k=>row.head_keys[k]):fanSources,...(isHost?{profile:clone(spec.files['machine_profile.json'])}:{})};
  const metadata={parts:headKeys.map(key=>({key}))};evaFrontRecipe(heads,community,installed,input,metadata);positive++;
  for(const mutate of [v=>v.fan_keys[0]=v.head_keys.find(k=>!v.fan_keys.includes(k)),v=>v.head_keys.pop(),v=>v.metadata.sha256=H,v=>v.model.decoded_sha256=H]){
   const changed=clone(input);mutate(changed);assert.throws(()=>evaFrontRecipe(heads,community,installed,changed,metadata),/pinned source recipe/);rejected++;
  }
 }
}
// Verify the normal publication path cannot bypass the actual four-owner gate.
// Parse Python's AST, so comments/unused text cannot stand in for a real call.
const gateCheck=spawnSync(process.env.PYTHON||'python',['-c',`
import ast, pathlib, sys
build=ast.parse(pathlib.Path(sys.argv[1]).read_text(encoding='utf8'))
parents={child:node for node in ast.walk(build) for child in ast.iter_child_nodes(node)}
calls=[n for n in ast.walk(build) if isinstance(n,ast.Call) and isinstance(n.func,ast.Attribute) and n.func.attr=='run' and any(isinstance(v,ast.Constant) and v.value=='scripts/check_eva_front_release.py' for v in ast.walk(n))]
assert len(calls)==1, 'Mandatory actual EVA gate call missing/repeated'
call=calls[0]
assert any(k.arg=='check' and isinstance(k.value,ast.Constant) and k.value.value is True for k in call.keywords), 'Gate failure must abort build'
node=call
while node in parents:
 node=parents[node]
 assert not isinstance(node,(ast.If,ast.IfExp)), 'Actual EVA gate cannot be optional'
 if isinstance(node,ast.FunctionDef):
  assert node.name=='main', 'Actual gate is not on the build entry path'
  break
else: raise AssertionError('Actual gate is not inside build main')
gate=ast.parse(pathlib.Path(sys.argv[2]).read_text(encoding='utf8'))
assert any(isinstance(n,ast.Constant) and n.value=='scripts/audit_eva_front_surfaces.mjs' for n in ast.walk(gate)), 'Release gate must invoke actual audit CLI'
# Execute only definitions: no imports via bytecode cache, network, models or
# release main. The bounded production descriptor rules are persistent fixtures.
namespace={'__file__':sys.argv[2], '__name__':'descriptor_fixture'}
exec(compile(gate,sys.argv[2],'exec'),namespace)
check=namespace['checked_descriptor']
valid={'path':'native/front.surface.json.gz','sha256':'a'*64,'bytes':100,'encoding':'gzip','decoded_bytes':200,'decoded_sha256':'b'*64}
check(valid,4_000_000,16_000_000)
negatives=[{'bytes':477_763_110},{'bytes':True},{'bytes':0},{'encoding':'br'},{'decoded_bytes':16_000_001},{'decoded_bytes':True},{'decoded_sha256':'stale'},
 {'path':'../private.json'},{'path':'C:/private.json'},{'path':'native/./a.json'},{'path':'native//a.json'},{'path':'native/a.json?raw=1'},{'path':'native/a.json#bad'},{'path':None}]
for mutation in negatives:
 try: check(dict(valid,**mutation),4_000_000,16_000_000)
 except ValueError: pass
 else: raise AssertionError('Production native descriptor accepted: '+repr(mutation))
print(len(negatives))
`,new URL('build_site.py',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1'),new URL('check_eva_front_release.py',import.meta.url).pathname.replace(/^\/([A-Za-z]:)/,'$1')],{encoding:'utf8'});
assert.equal(gateCheck.status,0,'Mandatory actual build gate disconnected: '+(gateCheck.stderr||gateCheck.error?.message||''));
const descriptorNegatives=Number(gateCheck.stdout.trim());assert.equal(descriptorNegatives,14);positive++;rejected+=descriptorNegatives;
console.log(JSON.stringify({passed:true,positive_fixtures:positive,rejected_fixtures:rejected,native_export_positive_fixtures:nativePositive,native_export_rejected_fixtures:nativeRejected,python_native_descriptor_rejections:descriptorNegatives,production_owners:expected.length,production_static_import_files:Object.keys(codeClosure).length,mandatory_actual_build_gate:true,scope:'Synthetic guard/aperture/outward-normal/hardware/palette and native-export fixtures; exact registered source recipes and mandatory actual publication gate. These fixtures do not audit frozen actual models or certify physical fit.',physical_fit_certified:false}));
