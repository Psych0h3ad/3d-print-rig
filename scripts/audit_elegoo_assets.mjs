// Actual pinned ELEGOO exports through the production r180 parser/assembler.
// CLI: node --expose-gc scripts/audit_elegoo_assets.mjs [--site DIR] [--assets DIR] [--out DIR]
// Optional --comparison DIR binds previous source-tessellation evidence, read-only.
// No network, child processes, workers, source repairs, motion or palette simulation.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath, pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {registerHooks} from 'node:module';
import {staticElegooCoverageFields} from './viewer_mesh_quality_scope.mjs';
import {assertZeroOmission} from './elegoo_zero_omission.mjs';

const repo = fileURLToPath(new URL('../', import.meta.url));
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
const arrayBytes = array => Buffer.from(array.buffer, array.byteOffset, array.byteLength);
const jsonBytes = value => Buffer.from(JSON.stringify(value, null, 2) + '\n');
const finite = values => values.every(Number.isFinite);
const sourcePin = file => {const bytes=fs.readFileSync(file);return {bytes:bytes.length,sha256:sha256(bytes)};};
const relative = file => path.relative(repo,file).replaceAll('\\','/');
const geometryPins = row => ({id:row.id,slug:row.slug,parts:row.parts,basis:row.basis,files:row.files,zero_facet_source:row.zero_facet_source,
  source:Object.fromEntries(['repository','revision','url','sha256','format','license','license_url','license_sha256'].map(k=>[k,row.source[k]]))});

export function publicAuditFailure(error,id=null){
 const code=String(error.code||error.name||'Error');
 // Filesystem/import diagnostics carry local roots. Public evidence identifies
 // the machine and error category without publishing those paths or stacks.
 const message=code!=='ERR_ASSERTION'?'Required asset or audit operation failed ('+code+').':String(error.message);
 const localPath=/(?:file:\/\/\/|(?:^|[\s"'(])[A-Za-z]:[\\/]|(?:^|[\s"'(])\/(?:Users|home|tmp|var|private|mnt|workspace)\/)/;
 return {id,status:'FAIL',error_code:code,message:localPath.test(message)?'Actual asset/source integrity assertion failed.':message};
}

export function assertPinned(bytes, spec, label) {
  assert(Number.isSafeInteger(spec.bytes) && spec.bytes > 0, label+' invalid byte pin');
  assert.match(spec.sha256,/^[a-f0-9]{64}$/);
  assert.equal(bytes.length,spec.bytes,label+' byte mismatch');
  assert.equal(sha256(bytes),spec.sha256,label+' SHA256 mismatch');
}

export function assertRigidBasis(basis) {
  assert(Array.isArray(basis)&&basis.length===3&&basis.every(r=>r.length===3&&finite(r)),'Invalid basis');
  for(let i=0;i<3;i++)for(let j=0;j<3;j++)
    assert.equal(basis[i].reduce((s,x,k)=>s+x*basis[j][k],0),i===j?1:0,'Nonorthonormal basis');
  const [a,b,c]=basis;
  assert.equal(a[0]*(b[1]*c[2]-b[2]*c[1])-a[1]*(b[0]*c[2]-b[2]*c[0])+a[2]*(b[0]*c[1]-b[1]*c[0]),1,'Improper rotation');
  // These exact signed permutations preserve coordinate extrema. Arbitrary
  // rotations require original vertex witnesses, not transformed AABB corners.
  assert(basis.every(r=>r.filter(x=>x!==0).length===1&&r.every(x=>[-1,0,1].includes(x))),
    'Source bound witnesses require an exact signed-permutation basis');
}

function checkedFile(base,spec) {
  assert(typeof spec.path==='string'&&!spec.path.includes('..')&&!/[\\:]/.test(spec.path)&&!spec.path.startsWith('/'),'Unsafe asset path');
  const file=path.resolve(base,spec.path),real=fs.realpathSync(file),relativePath=path.relative(base,real);
  assert(relativePath&&!relativePath.startsWith('..')&&!path.isAbsolute(relativePath),'Asset escapes exact --assets root');
  const raw=fs.readFileSync(real); assertPinned(raw,spec,spec.path);
  if(spec.encoding==null)return {bytes:raw,receipt:{path:spec.path,raw:sourcePin(real),decoded:sourcePin(real)}};
  assert.equal(spec.encoding,'gzip','Unsupported transport');
  assert(Number.isSafeInteger(spec.decoded_bytes)&&spec.decoded_bytes>0&&spec.decoded_bytes<=180_000_000);
  const bytes=gunzipSync(raw,{maxOutputLength:spec.decoded_bytes});
  assertPinned(bytes,{bytes:spec.decoded_bytes,sha256:spec.decoded_sha256},spec.path+' decoded');
  return {bytes,receipt:{path:spec.path,raw:{bytes:raw.length,sha256:sha256(raw)},decoded:{bytes:bytes.length,sha256:sha256(bytes)}}};
}

function binaryChunk(bytes,json) {
  const jsonLength=bytes.readUInt32LE(12),offset=20+jsonLength;
  assert(offset+8<=bytes.length&&bytes.readUInt32LE(offset+4)===0x004e4942,'Missing BIN chunk');
  const length=bytes.readUInt32LE(offset);assert(length%4===0&&offset+8+length===bytes.length,'Invalid BIN extent');
  assert.equal(json.buffers.length,1); assert(json.buffers[0].byteLength<=length&&length-json.buffers[0].byteLength<=3);
  return bytes.subarray(offset+8,offset+8+json.buffers[0].byteLength);
}

function accessor(json,bin,index) {
  const a=json.accessors[index];assert(a&&!a.sparse&&Number.isSafeInteger(a.count)&&a.count>0,'Unsupported accessor');
  const sizes={SCALAR:1,VEC2:2,VEC3:3,VEC4:4,MAT4:16};
  const constructors={5120:Int8Array,5121:Uint8Array,5122:Int16Array,5123:Uint16Array,5125:Uint32Array,5126:Float32Array};
  const C=constructors[a.componentType],size=sizes[a.type],view=json.bufferViews[a.bufferView];
  assert(C&&size&&view&&view.buffer===0,'Invalid accessor storage');
  assert(!view.byteStride||view.byteStride===size*C.BYTES_PER_ELEMENT,'Unsupported interleaved export');
  const offset=(view.byteOffset||0)+(a.byteOffset||0),length=a.count*size*C.BYTES_PER_ELEMENT;
  assert(offset>=0&&offset+length<=(view.byteOffset||0)+view.byteLength&&offset+length<=bin.length,'Accessor exceeds BIN');
  const array=new C(bin.buffer,bin.byteOffset+offset,a.count*size);
  return {array,size,count:a.count,normalized:!!a.normalized,componentType:a.componentType,sha256:sha256(arrayBytes(array))};
}

function materialIdentity(material,id) {
  const json=material.toJSON();
  assert(material.visible&&material.vertexColors&&!material.flatShading,'Unexpected consumed material');
  assert.equal(material.transparent,false);assert.equal(material.opacity,1);
  assert(!Object.values(material).some(v=>v?.isTexture),'Unpinned texture');
  return {id,uuid:material.uuid,name:material.name,type:material.type,vertexColors:material.vertexColors,
    opaque:true,flatShading:false,definition:json,sha256:sha256(jsonBytes(json))};
}

function sceneFingerprint(root) {
  root.updateMatrixWorld(true);const h=createHash('sha256');
  root.traverse(n=>{
    h.update(JSON.stringify([n.uuid,n.visible,n.matrix.toArray(),n.matrixWorld.toArray()]));
    if(n.isMesh){
      for(const key of Object.keys(n.geometry.attributes).sort()) {
        const a=n.geometry.attributes[key];assert(!a.isInterleavedBufferAttribute);h.update(key);h.update(arrayBytes(a.array));
      }
      if(n.geometry.index)h.update(arrayBytes(n.geometry.index.array));
      h.update(JSON.stringify([n.geometry.drawRange,n.geometry.groups]));
      for(const m of [].concat(n.material))h.update(JSON.stringify(m.toJSON()));
    }
  });return h.digest('hex');
}

function staticDisplayReview(THREE,assembly,row,lighting,validateView) {
  const {root,bounds}=assembly,scene=new THREE.Scene();scene.add(root);
  const grid=new THREE.GridHelper(2,40),hemisphere=new THREE.HemisphereLight();scene.add(grid,hemisphere);
  const camera=new THREE.PerspectiveCamera(35,1,.001,30),target=bounds.getCenter(new THREE.Vector3());
  const home=()=>{
    camera.up.set(0,1,0);camera.position.copy(target).add(new THREE.Vector3(.7,.45,1).normalize().multiplyScalar(
      bounds.getSize(new THREE.Vector3()).length()/2/Math.sin(THREE.MathUtils.degToRad(35)/2)*1.12));
    camera.lookAt(target);camera.updateMatrixWorld(true);
  };
  const original=sceneFingerprint(root);home();const nativeCamera=camera.matrixWorld.toArray(),stages=[];
  for(const [dark,visible] of [[false,false],[true,true],[false,false]]) {
    const state=lighting({darkUI:dark});scene.background=new THREE.Color(state.background);
    scene.environmentIntensity=state.environmentIntensity;hemisphere.intensity=state.ambientIntensity;grid.visible=visible;
    const saved={schema:'elegoo-static-view-v1',machine:row.id,model_sha256:row.files['model.glb'].decoded_sha256,
      source_revision:row.source.revision,dark,grid:visible,camera:{position:camera.position.toArray(),target:target.toArray(),up:camera.up.toArray()}};
    const restored=validateView(JSON.parse(JSON.stringify(saved)),row);
    camera.position.fromArray(restored.camera.position);camera.up.fromArray(restored.camera.up);camera.lookAt(new THREE.Vector3(...restored.camera.target));
    assert.equal(sceneFingerprint(root),original,'Static display changed source geometry/materials/placements');
    stages.push({dark,grid:visible,lighting:state,sourceAssemblyFingerprint:original,savedViewRoundtrip:true});
  }
  assert.deepEqual(stages[0],stages[2],'Display A-B-A did not restore A');
  camera.position.add(new THREE.Vector3(.1,.2,.3));home();assert.deepEqual(camera.matrixWorld.toArray(),nativeCamera,'Camera reference reset');
  assert.equal(sceneFingerprint(root),original,'Native static assembly changed on camera reset');
  grid.geometry.dispose();[].concat(grid.material).forEach(m=>m.dispose());scene.remove(root);
  return {passed:true,stages,cameraReferenceReset:true,sourceAssemblyUnchanged:true,
    productionAssembler:true,productionLightingHelper:true,savedViewContractRoundtrip:true,
    scope:'CPU scene-state/production lighting helper A-B-A and static camera reference reset; no DOM/GPU/UI handler claim',
    motionExercised:false,paletteExercised:false,motionSupported:false,printedPaletteSupported:false};
}

async function inspectMachine(row,api,{assets,comparison,out,sourceHashes}) {
  const {THREE,GLTFLoader,assemble,dispose,validateMetadata,validateGLB,validateView,lighting}=api;
  assertRigidBasis(row.basis);assert.equal(row.static_reference,true);assert.equal(row.motionVerified,false);assert.equal(row.printedPalette,false);
  const files={},metadata={};let bytes;
  for(const name of ['assembly_manifest.json','machine_profile.json','model.glb']) {
    assert(row.files[name],row.id+' missing catalog file');const result=checkedFile(assets,row.files[name]);files[name]=result.receipt;
    if(name==='model.glb')bytes=result.bytes;else metadata[name]=JSON.parse(result.bytes);
  }
  const manifest=metadata['assembly_manifest.json'],profile=metadata['machine_profile.json'];
  const keys=validateMetadata(row,manifest,profile),json=validateGLB(bytes,keys),bin=binaryChunk(bytes,json);
  let zeroOmission=null;
  if(row.zero_facet_source){
    const sourceModel=checkedFile(assets,row.zero_facet_source['model.glb']),sourceManifest=checkedFile(assets,row.zero_facet_source['assembly_manifest.json']);
    const sourceJSON=JSON.parse(sourceModel.bytes.subarray(20,20+sourceModel.bytes.readUInt32LE(12)));
    assert.equal(manifest.mesh_export_filter.source_model_sha256,sha256(sourceModel.bytes));
    zeroOmission=assertZeroOmission({json,bin,manifest,sourceJSON,sourceBIN:binaryChunk(sourceModel.bytes,sourceJSON),
      sourceManifest:JSON.parse(sourceManifest.bytes),accessor,sha256});
  }else assert(!manifest.mesh_export_filter,'Missing unfiltered source pins');
  assert.equal(manifest.native_leaf_count,row.parts);assert.equal(manifest.motion_preview,false);
  assert.equal(manifest.invalid_reference_leaves.length,0);assert.equal(manifest.reference_leaves.length,0);
  for(const s of [manifest.source,profile.source]) {
    assert.equal(s.revision,row.source.revision);assert.equal(s.source_file_sha256,row.source.sha256);
    assert.equal(s.license,row.source.license);assert.equal(s.url,row.source.url);
  }
  const rawNodes=new Map(json.nodes.filter(n=>n.extras?.part_key!=null).map(n=>[n.extras.part_key,n]));
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  let assembly;
  try {
    assembly=assemble(gltf,manifest,profile,row);const {root,nodes}=assembly;
    assert.deepEqual([...nodes.keys()].sort(),[...keys].sort(),'Production assembler key mismatch');
    const rotation=new THREE.Matrix4().set(...row.basis[0],0,...row.basis[1],0,...row.basis[2],0,0,0,0,1);
    const basisRoundoff=Math.max(...root.matrix.toArray().map((v,i)=>Math.abs(v-rotation.elements[i])));
    assert(basisRoundoff<=1e-12,'Production basis differs beyond quaternion roundoff');
    const materialMap=new Map(),materials=[],meshIdentities=[],parts=[],geometries=new Set();
    const totals={meshes:0,primitives:0,vertices:0,triangles:0,strict_zero_area_triangles:0,opposed_mean_normals:0,
      nonunit_consumed_vertex_normals:0,zero_normals_on_drawn_nondegenerate_smooth_faces:0,missing_NORMAL_requiring_shader_input:0,
      min_normal_length:Infinity,max_normal_length:0,max_source_bound_error_mm:0};
    root.traverse(n=>{assert(finite(n.matrix.elements)&&finite(n.matrixWorld.elements),'Nonfinite world matrix');});
    for(const part of manifest.parts) {
      assert.equal(part.group,'fixed');assert.equal(part.appearance_role,'native');
      assert.equal(part.source.commit_sha,row.source.revision);assert.equal(part.source.file,profile.source.path);
      assert(part.source.member&&part.source.reference_id&&part.source.instance_path_ids.length,'Missing source-part witness');
      assert(part.native_world_transform_mm.flat().every(Number.isFinite));
      assert(part.native_bounds_mm.length===2&&part.native_bounds_mm.every(v=>v.length===3&&finite(v)),'Missing finite source bounds');
      const node=nodes.get(part.key),rawNode=rawNodes.get(part.key),loaded=[];node.traverse(n=>{if(n.isMesh)loaded.push(n);});
      const primitives=json.meshes[rawNode.mesh]?.primitives;assert(primitives&&primitives.length>0,'Missing original mesh');
      assert.equal(loaded.length,primitives.length,'Lost or extra exported primitive');
      let vertices=0,triangles=0;
      for(let pi=0;pi<primitives.length;pi++) {
        const p=primitives[pi],mesh=loaded[pi],g=mesh.geometry,a=g.attributes;
        assert.equal(p.mode??4,4);assert(mesh.visible&&!mesh.isSkinnedMesh&&!mesh.isInstancedMesh);assert(!mesh.morphTargetInfluences?.length);
        const rawAttributes={};
        for(const [semantic,name] of [['POSITION','position'],['NORMAL','normal'],['COLOR_0','color']]) {
          assert(p.attributes[semantic]!=null&&a[name],part.key+' missing '+semantic);
          const original=accessor(json,bin,p.attributes[semantic]),actual=a[name];
          assert.equal(actual.count,original.count);assert.equal(actual.itemSize,original.size);assert.equal(actual.normalized,original.normalized);
          assert.equal(sha256(arrayBytes(actual.array)),original.sha256,part.key+' altered '+semantic);
          rawAttributes[semantic]={accessor:p.attributes[semantic],count:original.count,itemSize:original.size,
            componentType:original.componentType,normalized:original.normalized,sha256:original.sha256};
        }
        assert.equal(a.position.itemSize,3);assert.equal(a.normal.itemSize,3);assert.equal(a.position.count,a.normal.count);assert.equal(a.color.count,a.position.count);
        const position=a.position.array,normal=a.normal.array;assert(position.every(Number.isFinite)&&normal.every(Number.isFinite),'Nonfinite attributes');
        for(let i=0;i<a.color.array.length;i++)assert(Number.isFinite(a.color.array[i]),'Nonfinite source color');
        let indices=null,indexIdentity=null;
        if(p.indices!=null) {
          const original=accessor(json,bin,p.indices);assert.equal(original.size,1);assert(g.index);
          indices=g.index.array;assert.equal(sha256(arrayBytes(indices)),original.sha256,'Changed original indices');
          indexIdentity={accessor:p.indices,count:original.count,componentType:original.componentType,sha256:original.sha256};
        } else assert.equal(g.index,null);
        const count=indices?.length??a.position.count;assert(count>0&&count%3===0);assert.equal(g.drawRange.start,0);
        assert(g.drawRange.count===Infinity||g.drawRange.count===count,'Partial source draw range');assert.equal(g.groups.length,0,'Unexpected primitive groups');
        const used=new Uint8Array(a.position.count);for(let j=0;j<count;j++) {
          const i=indices?indices[j]:j;assert(Number.isInteger(i)&&i>=0&&i<a.position.count,'Index outside positions');used[i]=1;
        }
        let nonunit=0,zero=0,degenerate=0,opposed=0,minLength=Infinity,maxLength=0;
        for(let i=0;i<a.normal.count;i++)if(used[i]) {
          const k=i*3,length=Math.hypot(normal[k],normal[k+1],normal[k+2]);
          minLength=Math.min(minLength,length);maxLength=Math.max(maxLength,length);
          if(!Number.isFinite(length)||Math.abs(length-1)>1e-4)nonunit++;
        }
        for(let j=0;j<count;j+=3) {
          const ia=(indices?indices[j]:j)*3,ib=(indices?indices[j+1]:j+1)*3,ic=(indices?indices[j+2]:j+2)*3;
          const ux=position[ib]-position[ia],uy=position[ib+1]-position[ia+1],uz=position[ib+2]-position[ia+2];
          const vx=position[ic]-position[ia],vy=position[ic+1]-position[ia+1],vz=position[ic+2]-position[ia+2];
          const cx=uy*vz-uz*vy,cy=uz*vx-ux*vz,cz=ux*vy-uy*vx;
          if(cx===0&&cy===0&&cz===0){degenerate++;continue;}
          const nx=normal[ia]+normal[ib]+normal[ic],ny=normal[ia+1]+normal[ib+1]+normal[ic+1],nz=normal[ia+2]+normal[ib+2]+normal[ic+2];
          if((nx===0&&ny===0&&nz===0)||
            (normal[ia]===0&&normal[ia+1]===0&&normal[ia+2]===0)||
            (normal[ib]===0&&normal[ib+1]===0&&normal[ib+2]===0)||
            (normal[ic]===0&&normal[ic+1]===0&&normal[ic+2]===0))zero++;
          if(cx*nx+cy*ny+cz*nz<0)opposed++;
        }
        assert.equal(nonunit,0,part.key+' nonunit consumed normals');assert.equal(zero,0,part.key+' zero nondegenerate face normals');
        const mids=[].concat(mesh.material).map(m=>{
          if(!materialMap.has(m)){const id=materials.length;materialMap.set(m,id);materials.push(materialIdentity(m,id));}return materialMap.get(m);
        });
        const identity={part_key:part.key,name:mesh.name,uuid:mesh.uuid,source_node:part.node,raw_mesh:rawNode.mesh,
          primitive:pi,geometry_uuid:g.uuid,material_ids:mids,world_matrix:mesh.matrixWorld.toArray(),attributes:rawAttributes,indices:indexIdentity,
          vertices:a.position.count,triangles:count/3,strict_zero_area_triangles:degenerate,opposed_mean_normals:opposed,
          min_normal_length:minLength,max_normal_length:maxLength,nonunit_consumed_vertex_normals:nonunit,
          zero_normals_on_drawn_nondegenerate_smooth_faces:zero};
        meshIdentities.push(identity);geometries.add(g);vertices+=a.position.count;triangles+=count/3;
        totals.meshes++;totals.primitives++;totals.vertices+=a.position.count;totals.triangles+=count/3;
        totals.strict_zero_area_triangles+=degenerate;totals.opposed_mean_normals+=opposed;
        totals.min_normal_length=Math.min(totals.min_normal_length,minLength);totals.max_normal_length=Math.max(totals.max_normal_length,maxLength);
      }
      assert.equal(vertices,part.vertex_count,'Source vertex count changed');assert.equal(triangles,part.triangle_count,'Source facet count changed');
      const actual=new THREE.Box3().setFromObject(node,true),expected=new THREE.Box3(
        new THREE.Vector3(...part.native_bounds_mm[0]).multiplyScalar(.001),new THREE.Vector3(...part.native_bounds_mm[1]).multiplyScalar(.001)).applyMatrix4(rotation);
      assert(!actual.isEmpty()&&finite([...actual.min.toArray(),...actual.max.toArray()]));
      const av=[...actual.min.toArray(),...actual.max.toArray()],ev=[...expected.min.toArray(),...expected.max.toArray()];
      const error=Math.max(...av.map((v,i)=>Math.abs(v-ev[i])*1000));assert(error<=.01,part.key+' source bounds exceed .01 mm: '+error);
      totals.max_source_bound_error_mm=Math.max(totals.max_source_bound_error_mm,error);
      parts.push({key:part.key,name:part.name,path:part.path,source:part.source,group:part.group,appearance_role:part.appearance_role,
        native_world_transform_mm:part.native_world_transform_mm,source_bounds_mm:part.native_bounds_mm,
        display_bounds_m:[actual.min.toArray(),actual.max.toArray()],source_bound_error_mm:error,vertices,triangles});
    }
    let drawn=0;root.traverse(n=>{if(n.isMesh)drawn++;});assert.equal(drawn,totals.meshes,'Unbound loaded mesh');
    assert.equal(totals.triangles,manifest.triangles);assert.equal(parts.length,row.parts);
    const precise=new THREE.Box3().setFromObject(root,true);assert.deepEqual(precise.min.toArray(),assembly.bounds.min.toArray());assert.deepEqual(precise.max.toArray(),assembly.bounds.max.toArray());
    const display=staticDisplayReview(THREE,assembly,row,lighting,validateView);
    let comparisons=null;
    if(comparison) {
      const mf=path.join(comparison,'parent','MACHINE_'+row.slug+'.v3.private.json'),cf=path.join(comparison,'component-audit','AUDIT_SUMMARY.json');
      const previous=JSON.parse(fs.readFileSync(mf)),component=JSON.parse(fs.readFileSync(cf)),c=component.machines.find(m=>m.variant===row.slug);
      assert.equal(previous.modelSHA256,files['model.glb'].decoded.sha256);assert.equal(previous.manifestSHA256,files['assembly_manifest.json'].raw.sha256);
      assert.deepEqual(previous.basis,row.basis);assert.equal(previous.parts,row.parts);assert.equal(previous.vertices,totals.vertices);assert.equal(previous.triangles,totals.triangles);
      assert.deepEqual(previous.partsAudit.map(p=>p.key).sort(),parts.map(p=>p.key).sort());
      assert(c&&c.source.sha256===row.source.sha256&&c.raw_glb.sha256===files['model.glb'].decoded.sha256);
      assert.equal(c.parts,row.parts);assert.equal(c.triangles,totals.triangles);
      comparisons={machineReport:sourcePin(mf),componentReport:sourcePin(cf),sourcePackageSHA256:c.source.sha256,
        priorStrictDegenerateOccurrenceCount:c.strict_zero_area_triangles,priorOpposedMeanNormals:c.opposed_mean_normals,
        scope:'Exact source/model/manifest/basis/part/vertex/triangle pins match previous independent public-source reconstruction. New normal statistics below use strict float32-local cross products, not upstream near-zero QA.',
        newStrictDegenerateOccurrenceCount:totals.strict_zero_area_triangles,newOpposedMeanNormals:totals.opposed_mean_normals};
    }
    const detail={schema:'elegoo-actual-export-identities-v1',machine:row.id,model_sha256:files['model.glb'].decoded.sha256,
      exported_glb_material_count:json.materials?.length??0,loader_materials:materials,meshes:meshIdentities,parts};
    const detailBytes=jsonBytes(detail),detailHash=sha256(detailBytes);
    if(out)fs.writeFileSync(path.join(out,row.slug+'.identities.json'),detailBytes);
    const q={schema:'actual-viewer-mesh-quality-v1',model_sha256:files['model.glb'].decoded.sha256,
      actual_exported_input_identity_verified:true,finite_positions_and_world_matrices:true,meshes:totals.meshes,triangles:totals.triangles,
      nonunit_consumed_vertex_normals:0,zero_normals_on_drawn_nondegenerate_smooth_faces:0,missing_NORMAL_requiring_shader_input:0,
      actual_normal_method:'unit-vertex-normals',evidence_sha256:[detailHash],scope:'static/native_reference_assembly',
      source_face_orientation_verified:false,exact_zero_area_source_primitives_retained:totals.strict_zero_area_triangles,
      negative_average_vertex_dot_diagnostic:totals.opposed_mean_normals};
    const report={schema:'elegoo-actual-assets-release-gate-v1',status:'PASS_STATIC_REFERENCE',id:row.id,slug:row.slug,
      model_sha256:q.model_sha256,source:row.source,files,sourceHashes,basis:row.basis,properRigidBasis:true,basisRoundoff,
      all_source_parts_present:true,parts:parts.length,uniqueGeometries:geometries.size,exportedMaterialCount:json.materials?.length??0,
      loadedMaterialCount:materials.length,...totals,viewer_mesh_quality:q,identity_evidence:{file:row.slug+'.identities.json',bytes:detailBytes.length,sha256:detailHash},
      displayReview:display,comparisonEvidence:comparisons,zeroOmission,inspection_scope:'static/native_reference_assembly',
      sourceIssues:{retained:true,repaired:false,exactZeroIndexOmission:zeroOmission,strictDegenerateTriangles:totals.strict_zero_area_triangles,opposedMeanNormals:totals.opposed_mean_normals,
        definition:'Exact zero cross product and negative cross dot summed vertex normals, occurrence-weighted, on unchanged exported Float32 local positions.',
        appearance:'Original vertex RGBA retained with opaque GLTFLoader material. Original bitmap textures are omitted by the source export. No new material or alpha fix.'},
      physicalFitVerified:false,nativeSolidClearanceVerified:false,continuousMotionVerified:false,motionExercised:false,paletteExercised:false,
      browserOrGPUReviewed:false,wholeReleaseVerified:false,
      legacyControllerGate:{sampled_pose_reset_palette_passed:false,reason:'Motion and printed palette are unsupported. Static display/theme/reset evidence is separate; this flag is deliberately not asserted.'}};
    if(out)fs.writeFileSync(path.join(out,row.slug+'.actual-assets.json'),jsonBytes(report));
    return report;
  } finally {dispose(assembly?.root??gltf.scene);}
}

export async function auditElegooAssets({site=path.join(repo,'site'),assets=null,out=null,comparison=null}={}) {
  site=fs.realpathSync(path.resolve(site));assets??=path.join(site,'elegoo-assets');
  assets=fs.realpathSync(path.resolve(assets));if(out){out=path.resolve(out);fs.mkdirSync(out,{recursive:true});}
  const viewer=name=>pathToFileURL(path.join(site,'viewer',name)).href;
  const sourceHashes={},threeURL=viewer('vendor-r180/three.module.js');
  const hooks=registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:threeURL,shortCircuit:true}:next(specifier,context);},
    load(url,context,next){if(url.startsWith('file:')){const f=fileURLToPath(new URL(url)),fromSite=path.relative(site,f);
      if(!fromSite.startsWith('..')&&!path.isAbsolute(fromSite))sourceHashes['site/'+fromSite.replaceAll('\\','/')]=sourcePin(f);
      else if(!path.relative(repo,f).startsWith('..'))sourceHashes[relative(f)]=sourcePin(f);
    }return next(url,context);}});
  let api,index;
  try {
    const THREE=await import(threeURL),{GLTFLoader}=await import(viewer('vendor-r180/GLTFLoader.js'));
    const {assemble,disposeElegooRoot}=await import(viewer('elegoo-loader.mjs'));
    const {validateElegooMetadata,validateElegooGLB,validateElegooView}=await import(viewer('elegoo-contract.mjs'));
    const {sceneLightingState}=await import(viewer('scene-lighting-state.mjs'));
    index=(await import(viewer('elegoo-catalog.mjs'))).elegooAssetIndex;
    assert.equal(THREE.REVISION,'180');api={THREE,GLTFLoader,assemble,dispose:disposeElegooRoot,
      validateMetadata:validateElegooMetadata,validateGLB:validateElegooGLB,validateView:validateElegooView,lighting:sceneLightingState};
  } finally {hooks.deregister();}
  const sourceFile=name=>name.startsWith('site/')?path.join(site,name.slice(5)):path.join(repo,name);
  for(const name of ['scripts/audit_elegoo_assets.mjs','scripts/elegoo_zero_omission.mjs','scripts/viewer_mesh_quality_scope.mjs','site/viewer/elegoo.mjs'])sourceHashes[name]=sourcePin(sourceFile(name));
  assert.equal(index.machines.length,3,'Missing/extra ELEGOO catalog row');
  assert.equal(new Set(index.machines.map(r=>r.id)).size,3);assert.equal(new Set(index.machines.map(r=>r.slug)).size,3);
  const pinScope=JSON.stringify(index.machines.map(geometryPins));
  const reports=[],failures=[];
  for(const row of index.machines) {
    try {const report=await inspectMachine(row,api,{assets,comparison,out,sourceHashes});reports.push(report);
      console.error(JSON.stringify({machine:row.id,status:report.status,parts:report.parts,triangles:report.triangles,maxSourceBoundErrorMM:report.max_source_bound_error_mm}));
    } catch(error) {const failure=publicAuditFailure(error,row.id);failures.push(failure);
      if(out)fs.writeFileSync(path.join(out,row.slug+'.failure.json'),jsonBytes(failure));}
    globalThis.gc?.();
  }
  // Catalog metadata may be edited by another integration task. Pins/basis and
  // actual adapter inputs used in this run must be stable; cosmetic catalog
  // metadata is recorded by the start hash and explicitly compared at the end.
  const endCatalog=fs.readFileSync(sourceFile('site/viewer/elegoo-catalog.mjs'),'utf8');
  const catalogLiteral=JSON.parse(endCatalog.slice(endCatalog.indexOf('freeze({')+7,endCatalog.indexOf('\n});')+2));
  assert.equal(JSON.stringify(catalogLiteral.machines.map(geometryPins)),pinScope,'Catalog geometry/source inputs changed during audit');
  for(const [name,pin] of Object.entries(sourceHashes))if(name!=='site/viewer/elegoo-catalog.mjs')assert.deepEqual(sourcePin(sourceFile(name)),pin,'Adapter input changed during audit: '+name);
  const summary={schema:'elegoo-actual-assets-release-gate-v1',createdUTC:new Date().toISOString(),
    status:failures.length?'FAIL':'PASS_STATIC_REFERENCE',expectedMachines:index.machines.map(r=>r.id),testedMachines:reports.map(r=>r.id),
    missingOrSkippedMachines:index.machines.filter(r=>!reports.some(p=>p.id===r.id)).map(r=>r.id),failures,
    inspection_scope:'static/native_reference_assembly',physicalFitVerified:false,continuousMotionVerified:false,
    motionExercised:false,paletteExercised:false,browserOrGPUReviewed:false,wholeReleaseVerified:false,
    catalogAtStart:sourceHashes['site/viewer/elegoo-catalog.mjs'],catalogAtEnd:{bytes:Buffer.byteLength(endCatalog),sha256:sha256(endCatalog)},
    sourceHashes,machines:reports.map(r=>({id:r.id,status:r.status,model_sha256:r.model_sha256,parts:r.parts,meshes:r.meshes,primitives:r.primitives,
      vertices:r.vertices,triangles:r.triangles,max_source_bound_error_mm:r.max_source_bound_error_mm,viewer_mesh_quality:r.viewer_mesh_quality,
      sourceIssues:r.sourceIssues,report:r.slug+'.actual-assets.json',reportSHA256:sha256(jsonBytes(r)),
      coverage_fields:staticElegooCoverageFields(r,sha256(jsonBytes(r)))})),
    limitations:['No native-solid, mounting, travel, flexible-route, DOM or GPU certification.',
      'Exactly zero-area omissions require pinned unfiltered-source replay; other source issues and opaque vertex-color appearance remain labeled.',
      'Static ELEGOO CPU source-state coverage is distinct from the legacy motion/palette controller assertion; that legacy flag remains false.']};
  if(out)fs.writeFileSync(path.join(out,'AUDIT_SUMMARY.json'),jsonBytes(summary));
  assert.equal(reports.length,index.machines.length,'Every actual catalog row must pass; missing/failed models are failures');
  assert.equal(failures.length,0,failures.map(f=>f.id+': '+f.message).join('\n'));
  return summary;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url) {
  const options={};for(let i=2;i<process.argv.length;i++) {
    const key=process.argv[i];assert(['--site','--assets','--out','--comparison'].includes(key),'Unknown argument '+key);
    assert(process.argv[i+1]&&!process.argv[i+1].startsWith('--'),'Missing argument '+key);assert(!(key.slice(2) in options),'Duplicate argument '+key);options[key.slice(2)]=process.argv[++i];
  }
  try {const result=await auditElegooAssets(options);console.log(JSON.stringify({status:result.status,machines:result.machines,scope:result.inspection_scope}));}
  catch(error){console.error(JSON.stringify(publicAuditFailure(error)));process.exitCode=1;}
}
