import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import {pathToFileURL} from 'node:url';
import assert from 'node:assert/strict';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three'),{GLTFLoader}=await import('../site/viewer/vendor/GLTFLoader.js');
const {createCutawayAssembly,filamentMeltProfile}=await import('../site/viewer/stealthburner-cutaway-model.mjs');
const {cutawaySource}=await import('../site/viewer/stealthburner-cutaway-source.mjs');
const {lessonState}=await import('../site/viewer/stealthburner-lesson.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const geometryHash=g=>sha(Buffer.concat([Buffer.from(g.index.array.buffer,g.index.array.byteOffset,g.index.array.byteLength),Buffer.from(g.attributes.position.array.buffer,g.attributes.position.array.byteOffset,g.attributes.position.array.byteLength)]));
const materialState=mesh=>[].concat(mesh.material).map(m=>({color:m.color.toArray(),emissive:m.emissive.toArray(),intensity:m.emissiveIntensity,metalness:m.metalness,roughness:m.roughness,opacity:m.opacity,transparent:m.transparent}));
export async function auditStealthburnerCutaway(assetRoot,output){
if(!assetRoot)throw Error('Pass the assembled site directory');
const assets=[],receipts=[],sourceGeometry=new Map(),sourceMaterials=new Map();
for(const spec of cutawaySource.assets){
  const packed=await fs.readFile(path.join(assetRoot,spec.path+'.glb.gz')),bytes=gunzipSync(packed),metaBytes=await fs.readFile(path.join(assetRoot,spec.path+'.json'));
  assert.equal(packed.length,spec.compressed_bytes);assert.equal(sha(packed),spec.compressed_sha256);
  assert.equal(bytes.length,spec.decoded_bytes);assert.equal(sha(bytes),spec.decoded_sha256);assert.equal(sha(metaBytes),spec.metadata_sha256);
  const gltf=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
  gltf.scene.traverse(mesh=>{if(mesh.isMesh){const key=mesh.userData.part_key||mesh.name.match(/^P([^_]+)__/u)?.[1]||mesh.name;const rows=sourceGeometry.get(key)||[];rows.push(geometryHash(mesh.geometry));sourceGeometry.set(key,rows);const materials=sourceMaterials.get(key)||[];materials.push(materialState(mesh));sourceMaterials.set(key,materials);}});
  assets.push({spec,gltf,meta:JSON.parse(metaBytes)});receipts.push({...spec});
}
let nozzle,nozzleReceipt;
if(cutawaySource.nozzle_mesh){
  const spec=cutawaySource.nozzle_mesh,bytes=await fs.readFile(new URL('../site/viewer/'+spec.path,import.meta.url));
  assert.equal(bytes.length,spec.bytes);assert.equal(sha(bytes),spec.sha256);nozzle=JSON.parse(bytes);nozzleReceipt={...spec};
}
const assembly=createCutawayAssembly(assets,{nozzle}),original=new Map(),thermal=new Set([...cutawaySource.hot_keys,cutawaySource.sink_key,cutawaySource.heatbreak_key]);
assert.equal(assembly.rows.size,83);
for(const [key,row]of assembly.rows){
  assert.deepEqual(row.meshes.map(materialState),sourceMaterials.get(key),'Source material preservation '+key);
  if(cutawaySource.nozzle_mesh&&key==='sb_v6_hot_83'){
    assert.equal(row.meshes.length,1);const geometry=row.meshes[0].geometry;
    assert.deepEqual([...geometry.userData.original_source_face_ids].sort((a,b)=>a-b),[...cutawaySource.nozzle_mesh.source_face_ids].sort((a,b)=>a-b));
    const normals=geometry.attributes.normal;for(let i=0;i<normals.count;i++)assert(Math.abs(new THREE.Vector3().fromBufferAttribute(normals,i).length()-1)<1e-6);
  }else assert.deepEqual(row.meshes.map(mesh=>geometryHash(mesh.geometry)),sourceGeometry.get(key),'Unchanged source part '+key);
  original.set(key,row.meshes.map(mesh=>({mesh,geometry:geometryHash(mesh.geometry),matrix:mesh.matrixWorld.toArray(),color:[].concat(mesh.material).map(m=>m.color.toArray()),hardware:[].concat(mesh.material).map(m=>[m.metalness,m.roughness,m.opacity,m.transparent])})));
  for(const mesh of row.meshes)assert(mesh.geometry.attributes.position.array.every(Number.isFinite));
}
const sections=[];
for(const value of [0,25,50,75,100,50,0,100]){
  const x=assembly.setSection(value);assert(Number.isFinite(x));
  if(value===0){for(const records of original.values())for(const {mesh}of records){const p=mesh.geometry.attributes.position;for(let i=0;i<p.count;i++)assert(assembly.cut.distanceToPoint(new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(mesh.matrixWorld))>=-1e-9);}}
  if(value===100)assert(Math.abs(assembly.cut.distanceToPoint(assembly.point(cutawaySource.nozzle_mm)))<1e-12);
  sections.push({percent:value,plane_x_m:x,caps_visible:assembly.caps.filter(c=>c.group.visible).length});
}
for(const state of [lessonState(0),lessonState(20),lessonState(40,{fan:false}),lessonState(40,{heater:false}),lessonState(0)]){
  assembly.update(state);
  for(const [key,records]of original)for(const record of records){
    assert.equal(geometryHash(record.mesh.geometry),record.geometry);assert.deepEqual(record.mesh.matrixWorld.toArray(),record.matrix);
    const ms=[].concat(record.mesh.material);for(let i=0;i<ms.length;i++){
      assert.deepEqual([ms[i].metalness,ms[i].roughness,ms[i].opacity,ms[i].transparent],record.hardware[i]);
      if(!thermal.has(key))assert.deepEqual(ms[i].color.toArray(),record.color[i]);
    }
  }
}
assembly.update(lessonState(40),{heatColors:false});
for(const records of original.values())for(const record of records)assert.deepEqual([].concat(record.mesh.material).map(m=>m.color.toArray()),record.color);
const profile=filamentMeltProfile(assembly);
assert(profile.length===49);assert(profile.every(([r,y])=>Number.isFinite(r)&&Number.isFinite(y)&&r>0&&r<=.000875));
assert(Math.abs(profile[0][0]-.0002*.96)<.00001,'Source 0.4 mm nozzle mouth must stay open');
for(const cap of assembly.caps){
  assert.equal(cap.group.children.at(-1),cap.cap);
  assert.equal(cap.cap.material.stencilFunc,THREE.NotEqualStencilFunc);
  const source=assembly.rows.get(cap.key).entries[0].material;
  for(const key of ['metalness','roughness','opacity','transparent'])assert.equal(cap.cap.material[key],source[key]);
  for(const stencil of cap.group.children.slice(0,-1))assert(assembly.rows.get(cap.key).meshes.some(mesh=>mesh.geometry===stencil.geometry),'Caps must use exact source surfaces');
}
assembly.reset();assert.equal(assembly.cut.constant,0);assembly.restore();
const report={schema:'stealthburner-cutaway-actual-assets-v1',utc:new Date().toISOString(),passed:true,source_assets:receipts,
  adapter_sha256:sha(await fs.readFile(new URL('../site/viewer/stealthburner-cutaway-model.mjs',import.meta.url))),
  leaf_count:83,unchanged_source_geometry_leaves:cutawaySource.nozzle_mesh?82:83,nozzle_source_replacement:nozzleReceipt||null,sections,thermal_transitions:5,original_colors_restored:true,
  filament_bore_profile_m:profile,source_nozzle_opening_mm:.4,
  scope:'Actual exported-model/controller CPU audit; no browser/GPU stencil or native-solid clearance certificate.',
  browser_review:false,native_solid_review:false};
if(output)await fs.writeFile(output,JSON.stringify(report,null,2)+'\n');
return report;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
  if(!process.argv[2]||!process.argv[3])throw Error('Usage: node scripts/audit_stealthburner_cutaway.mjs <assembled-site> <report.json>');
  await auditStealthburnerCutaway(process.argv[2],process.argv[3]);
console.log('PASS actual SB/CW2/V6 source hashes, original part identities, section transitions, thermal-only tint/reset and actual nozzle bore profile. Browser/native review remains separate.');
}
