// Audit the complete exported models, including unchanged V2.4 variants.
// node --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_custom_ptfe.mjs <community-site> <report.json>
import fs from 'node:fs';import path from 'node:path';import zlib from 'node:zlib';
import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {createV24Adapter} from '../site/viewer/v24_matrix_adapter.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {createCustomTube,customTubeCurve,constantCustomTubeRoute} from '../site/viewer/custom-voron-tube.mjs';
import {V24_PTFE_SPEC,createV24PtfePreview,v24PtfeRoute} from '../site/viewer/v24-ptfe.mjs';
import {verifyTubeGeometry} from './test_custom_ptfe.mjs';
const [base,out,largeBase]=process.argv.slice(2);assert(base&&out);
const catalog=JSON.parse(fs.readFileSync(new URL('../site/CUSTOM_VORON_ASSETS.json',import.meta.url))),results=[];
const sha=b=>createHash('sha256').update(b).digest('hex');
for(const machine of catalog.machines){
 const sourceBase=machine.local_directory==='large-voron-assets'?largeBase:base;assert(sourceBase,'Missing actual large-model asset root');
 const files=Object.fromEntries(Object.entries(machine.files).map(([name,spec])=>{
  const raw=fs.readFileSync(path.join(sourceBase,spec.path));assert.equal(raw.length,spec.bytes);assert.equal(sha(raw),spec.sha256);
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
 const externalSpec=machine.id===V24_PTFE_SPEC.machine_id?V24_PTFE_SPEC:meta.v24_ptfe_spec;
 const external=externalSpec?createV24PtfePreview(THREE,root,meta,profile,externalSpec):null;
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
 let first=null,maxEndpointError=0,maxInletError=0,minLength=Infinity,maxLength=0,maxCutLengthError=0,minStorageRadius=Infinity;
 const constantRoute=meta.custom_ptfe?.route_type==='constant_cut_lsl_ellipse_93';
 if(meta.custom_ptfe?.route_type)assert(constantRoute,'Unknown PTFE route type');
 if(constantRoute){assert.deepEqual(meta.custom_ptfe.reference_xyz_mm,ref);assert.deepEqual(meta.custom_ptfe.display_limits_mm,profile.display_limits_mm);if(machine.id==='voron_trident_500_custom')assert.equal(meta.custom_ptfe.cut_length_mm,1410)}
 const tubeMesh=meshes.find(m=>m.userData.part_key===meta.custom_ptfe?.part_key);
 const externalFirst=external?Array.from(external.mesh.geometry.attributes.position.array):null;
 if(tube){verifyTubeGeometry(tubeMesh.geometry);tube.update();first=Array.from(tubeMesh.geometry.attributes.position.array)}
 for(const [index,xyz]of poses.entries()){
  adapter.setFlexibleVisible?.(true);const pose=adapter.setPose({x:xyz[0],y:xyz[1],z:xyz[2]},{flexibleVisible:true});
  const actual=pose.display_xyz_mm??[pose.x,pose.y,pose.z];assert(actual.every(Number.isFinite));
  tube?.update(actual[0]-ref[0],actual[1]-ref[1],true);root.updateMatrixWorld(true);
  if(external){
   external.setPose(actual,true);assert(external.mesh.visible);const route=v24PtfeRoute(externalSpec,actual);
   assert(route.start_mm.every((v,i)=>Math.abs(v-(externalSpec.head_seat_reference_mm[i]+(actual[i]-ref[i])))<1e-8));
   assert(route.pointAt(1).every((v,i)=>Math.abs(v-externalSpec.holder_right_mm[i])<1e-8));
   assert(route.arc_end_mm[2]+2<externalSpec.roof.bottom_z_mm);
   assert(external.mesh.geometry.attributes.position.array.every(Number.isFinite));
   if(index%100===0)verifyTubeGeometry(external.mesh.geometry);
  }
  for(const m of meshes){assert(m.position.toArray().every(Number.isFinite));assert(m.quaternion.toArray().every(Number.isFinite));if(rows.get(m.userData.part_key)?.motion==='reference_flexible')assert(m.visible)}
  if(tube){
   const spec=meta.custom_ptfe,dx=actual[0]-ref[0],dy=actual[1]-ref[1],curve=customTubeCurve(spec,dx,dy);
   const inlet=new THREE.Vector3(spec.start_mm[0]+dx,spec.start_mm[2],-(spec.start_mm[1]+dy)).multiplyScalar(.001);
   maxInletError=Math.max(maxInletError,curve.getPoint(0).distanceTo(inlet)*1000);assert(maxInletError<1e-6);
   const expected=new THREE.Vector3(spec.end_mm[0],spec.end_mm[2],-spec.end_mm[1]).multiplyScalar(.001);
   maxEndpointError=Math.max(maxEndpointError,curve.getPoint(1).distanceTo(expected)*1000);
   assert(maxEndpointError<1e-6);
   const tangent=curve.getTangent(1),axis=new THREE.Vector3(spec.holder_bore_axis[0],spec.holder_bore_axis[2],-spec.holder_bore_axis[1]).negate();
   assert(tangent.dot(axis)>.999999);
   assert(tubeMesh.geometry.attributes.position.array.every(Number.isFinite));
   if(index%100===0)verifyTubeGeometry(tubeMesh.geometry);
   const length=curve.getLength()*1000;minLength=Math.min(minLength,length);maxLength=Math.max(maxLength,length);
   if(constantRoute){
    const route=constantCustomTubeRoute(spec,dx,dy),a=route.storageRadiusMm,h=route.storageHeightMm;
    maxCutLengthError=Math.max(maxCutLengthError,Math.abs(length-spec.cut_length_mm),Math.abs(route.totalLengthMm-spec.cut_length_mm));assert(maxCutLengthError<1e-8);
    minStorageRadius=Math.min(minStorageRadius,a*a/h,h*h/a);assert(minStorageRadius>=spec.minimum_design_radius_mm);
   }
  }
 }
 for(const m of meshes){assert(m.position.distanceTo(source.get(m)[0])<1e-7);assert(m.quaternion.angleTo(source.get(m)[1])<1e-7)}
 if(tube){assert.deepEqual(Array.from(tubeMesh.geometry.attributes.position.array),first);tube.update(0,0,false);assert(!tubeMesh.visible);tube.update(0,0,true);assert(tubeMesh.visible)}
 if(external){assert.deepEqual(Array.from(external.mesh.geometry.attributes.position.array),externalFirst);external.setPose(ref,false);assert(!external.mesh.visible);external.setPose(ref,true);assert(external.mesh.visible);assert.deepEqual(Array.from(external.mesh.geometry.attributes.position.array),externalFirst)}
 results.push({id:machine.id,passed:true,parts:meshes.length,poses:poses.length,degenerate_only_normals:degenerateOnlyNormals,model_sha256:sha(raw),manifest_sha256:sha(files['assembly_manifest.json']),
  ptfe:!!tube||!!external,external_runtime_preview:!!external,route_type:external?'v24_native_mates_two_bends_94':meta.custom_ptfe?.route_type??(tube?'legacy_variable_length_preview':null),max_inlet_error_mm:maxInletError,max_endpoint_error_mm:maxEndpointError,preview_length_range_mm:tube?[minLength,maxLength]:null,
  constant_cut_length_mm:constantRoute?meta.custom_ptfe.cut_length_mm:null,max_cut_length_error_mm:constantRoute?maxCutLengthError:null,min_storage_radius_mm:constantRoute?minStorageRadius:null,full_native_continuous_clearance_certified:false,material_bend_certified:false,
  scope:trident?(constantRoute?'Actual composed model and production controller; sampled/reversed/adaptively subdivided motion, original inlet/holder endpoints and tangent, mesh winding, visibility and deterministic reset. Declared geometric cut length and elliptical storage radius checked. Material bending, loads/fatigue and full-printer continuous native clearance remain unqualified.':'Actual model and production controller; sampled/reversed/adaptively subdivided motion, native inlet/holder endpoints and tangent, mesh winding, visibility and deterministic reset. Route length varies; not a physical hose simulation.'):external?'Actual exported V2.4 source plus external flexible viewer preview through the production controller; sampled/reversed/adaptively subdivided XYZ, native inlet/connector/holder endpoints, roof envelope, winding, visibility and deterministic reset. Preview Z limit is the bound profile limit. Route length varies; this added preview is not included in STEP. Full-machine continuous native clearance, retention, material bending and physical cut length remain unqualified.':'Actual model and production controller, sampled XYZ and reset. Native V2.4 source has the internal head tube but no external Bowden tube.'});
 tube?.dispose();external?.dispose();root.traverse(m=>{if(m.isMesh)m.geometry.dispose()});
 console.log(machine.id,poses.length,'poses passed');
}
fs.writeFileSync(out,JSON.stringify({all_passed:true,results,adapter_sha256:sha(fs.readFileSync(new URL('../site/viewer/custom-voron-tube.mjs',import.meta.url))),v24_adapter_sha256:sha(fs.readFileSync(new URL('../site/viewer/v24-ptfe.mjs',import.meta.url))),v24_spec_sha256:sha(JSON.stringify(V24_PTFE_SPEC))},null,2)+'\n');
