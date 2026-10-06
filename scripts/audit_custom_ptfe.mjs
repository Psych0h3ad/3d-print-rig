// Audit the complete exported models, including unchanged V2.4 variants.
// node --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_custom_ptfe.mjs <community-site> <report.json>
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createV24Adapter} from '../site/viewer/v24_matrix_adapter.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {createCustomTube,customTubeCurve} from '../site/viewer/custom-voron-tube.mjs';
import {verifyTubeGeometry} from './test_custom_ptfe.mjs';
const [base,out]=process.argv.slice(2);assert(base&&out);
const catalog=JSON.parse(fs.readFileSync(new URL('../site/CUSTOM_VORON_ASSETS.json',import.meta.url))),results=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const machine of catalog.machines){
 const files=Object.fromEntries(Object.entries(machine.files).map(([name,spec])=>{
  const raw=fs.readFileSync(path.join(base,spec.path));assert.equal(raw.length,spec.bytes);assert.equal(sha(raw),spec.sha256);
  const bytes=spec.encoding==='gzip'?zlib.gunzipSync(raw):raw;
  if(spec.decoded_sha256)assert.equal(sha(bytes),spec.decoded_sha256);
  return [name,bytes];
 }));
 const meta=JSON.parse(files['assembly_manifest.json']),profile=JSON.parse(files['machine_profile.json']);
 const raw=files['model.glb'],root=(await new GLTFLoader().parseAsync(raw.buffer.slice(raw.byteOffset,raw.byteOffset+raw.byteLength),'')).scene;
 const meshes=[];
 root.traverse(m=>{if(m.isMesh)meshes.push(m)});
 const present=new Set(meshes.map(m=>m.userData.part_key));
 for(const row of meta.parts)assert(present.has(row.key),`Missing actual part ${row.key}`);
 const checked=new WeakSet();let degenerateOnlyNormals=0;
 for(const mesh of meshes){
  const g=mesh.geometry;if(checked.has(g))continue;checked.add(g);
  const p=g.getAttribute('position'),n=g.getAttribute('normal');
  assert(p?.count);assert(p.array.every(Number.isFinite));
  if(!n){assert((Array.isArray(mesh.material)?mesh.material:[mesh.material]).every(m=>m.flatShading),'Missing normals without flat shader');continue}
  assert.equal(n.count,p.count);assert(n.array.every(Number.isFinite));
  const bad=new Set();
  for(let i=0;i<n.count;i++)if(Math.abs(Math.hypot(n.getX(i),n.getY(i),n.getZ(i))-1)>=.002)bad.add(i);
  if(bad.size){
   // OCC may retain vertices used only by zero-area seam triangles. They do
   // not render; every normal contributing to a drawable face must be unit.
   const index=g.index.array,a=new THREE.Vector3(),b=new THREE.Vector3(),c=new THREE.Vector3();
   for(let i=0;i<index.length;i+=3)if([index[i],index[i+1],index[i+2]].some(v=>bad.has(v))){
    a.fromBufferAttribute(p,index[i]);b.fromBufferAttribute(p,index[i+1]);c.fromBufferAttribute(p,index[i+2]);
    assert(b.sub(a).cross(c.sub(a)).lengthSq()<1e-24,`${machine.id} ${mesh.userData.part_key} drawable face has invalid normal`);
   }
   degenerateOnlyNormals+=bad.size;
  }
 }
 const trident=machine.family==='trident',adapter=trident?createTridentMotion(profile):createV24Adapter(root,meta,profile);
 if(trident)adapter.register(root,meta);
 const tube=createCustomTube(root,meta);
 const rows=new Map(meta.parts.map(r=>[r.key,r])),ref=profile.display_reference_xyz_mm;
 const source=new Map(meshes.map(m=>[m,[m.position.clone(),m.quaternion.clone()]]));
 const poses=[],values=['X','Y','Z'].map((a,i)=>[...profile.display_limits_mm[a],profile.display_limits_mm[a][1]/2,ref[i]]);
 for(const x of values[0])for(const y of values[1])for(const z of values[2])poses.push([x,y,z]);
 // Subdivide each rapid corner-to-corner transition to <=5 mm per axis.
 for(const end of [[0,0,0],[machine.size,machine.size,machine.z],[0,machine.size,0],[machine.size,0,machine.z],ref]){
  const start=poses.at(-1),count=Math.ceil(Math.max(...end.map((v,i)=>Math.abs(v-start[i])))/5);
  for(let j=1;j<=count;j++)poses.push(start.map((v,i)=>v+(end[i]-v)*j/count));
 }
 poses.push(...poses.slice().reverse(),ref);
 let first=null,maxEndpointError=0,minLength=Infinity,maxLength=0;
 const tubeMesh=meshes.find(m=>m.userData.part_key===meta.custom_ptfe?.part_key);
 if(tube){verifyTubeGeometry(tubeMesh.geometry);tube.update();first=Array.from(tubeMesh.geometry.attributes.position.array)}
 for(const [index,xyz]of poses.entries()){
  adapter.setFlexibleVisible?.(true);adapter.setPose({x:xyz[0],y:xyz[1],z:xyz[2]},{flexibleVisible:true});
  tube?.update(xyz[0]-ref[0],xyz[1]-ref[1],true);root.updateMatrixWorld(true);
  for(const m of meshes){assert(m.position.toArray().every(Number.isFinite));assert(m.quaternion.toArray().every(Number.isFinite));if(rows.get(m.userData.part_key)?.motion==='reference_flexible')assert(m.visible)}
  if(tube){
   const spec=meta.custom_ptfe,curve=customTubeCurve(spec,xyz[0]-ref[0],xyz[1]-ref[1]);
   const expected=new THREE.Vector3(spec.end_mm[0],spec.end_mm[2],-spec.end_mm[1]).multiplyScalar(.001);
   maxEndpointError=Math.max(maxEndpointError,curve.getPoint(1).distanceTo(expected)*1000);
   assert(maxEndpointError<1e-6);
   const tangent=curve.getTangent(1),axis=new THREE.Vector3(spec.holder_bore_axis[0],spec.holder_bore_axis[2],-spec.holder_bore_axis[1]).negate();
   assert(tangent.dot(axis)>.999999);
   assert(tubeMesh.geometry.attributes.position.array.every(Number.isFinite));
   if(index%100===0)verifyTubeGeometry(tubeMesh.geometry);
   const length=curve.getLength()*1000;minLength=Math.min(minLength,length);maxLength=Math.max(maxLength,length);
  }
 }
 for(const m of meshes){assert(m.position.distanceTo(source.get(m)[0])<1e-7);assert(m.quaternion.angleTo(source.get(m)[1])<1e-7)}
 if(tube){assert.deepEqual(Array.from(tubeMesh.geometry.attributes.position.array),first);tube.update(0,0,false);assert(!tubeMesh.visible);tube.update(0,0,true);assert(tubeMesh.visible)}
 results.push({id:machine.id,passed:true,parts:meshes.length,poses:poses.length,degenerate_only_normals:degenerateOnlyNormals,model_sha256:sha(raw),manifest_sha256:sha(files['assembly_manifest.json']),
  ptfe:!!tube,max_endpoint_error_mm:maxEndpointError,preview_length_range_mm:tube?[minLength,maxLength]:null,
  scope:trident?'Actual model and production controller; sampled/reversed/adaptively subdivided motion, native holder endpoint/tangent, mesh winding, visibility and deterministic reset. Length varies: not a physical hose simulation.':'Actual model and production controller, sampled XYZ and reset. Native V2.4 source has the internal head tube but no external Bowden tube.'});
 tube?.dispose();root.traverse(m=>{if(m.isMesh)m.geometry.dispose()});
 console.log(machine.id,poses.length,'poses passed');
}
fs.writeFileSync(out,JSON.stringify({all_passed:true,results,adapter_sha256:sha(fs.readFileSync(new URL('../site/viewer/custom-voron-tube.mjs',import.meta.url)))},null,2)+'\n');
