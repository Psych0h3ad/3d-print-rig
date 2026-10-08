import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {gunzipSync} from 'node:zlib';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {expandedPrinterCatalog} from '../site/viewer/machine-head-model.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {createMachineHeads} from '../site/viewer/machine-heads.js';
import {createMadmaxPtfe,madmaxPtfeApplies,madmaxPtfePort} from '../site/viewer/madmax-ptfe.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function auditMadmaxPtfe(root){
 const inputs={},read=async name=>{const b=await fs.readFile(path.join(root,name));inputs[name]=sha(b);return JSON.parse(b);};
 const heads=await read('TOOLHEAD_CONFIGURATIONS.json'),registry=await read('MACHINE_HEAD_REGISTRATIONS.json'),reports=[];
 for(const size of [250,300,350]){
  const machine=`voron_trident_${size}`,dir=`machines/${machine}`,profile=await read(dir+'/machine_profile.json'),manifest=await read(dir+'/assembly_manifest.json'),raw=await read(dir+'/configurations.json');
  const catalog=expandedPrinterCatalog(raw,heads,registry,machine),variant=catalog.variants.find(v=>madmaxPtfeApplies(machine,v));assert(variant);
  const filename=profile.base_assets.glb+'.gz',compressed=await fs.readFile(path.join(root,filename));inputs[filename]=sha(compressed);const b=gunzipSync(compressed);
  const base=(await new GLTFLoader().parseAsync(b.buffer.slice(b.byteOffset,b.byteOffset+b.byteLength),'')).scene,scene=new THREE.Scene();scene.add(base);
  const rig=createMachineHeads(scene,{...catalog,base_assets:heads.base_assets});await rig.install(variant);const route=createMadmaxPtfe(scene,base,manifest,profile,rig),motion=createTridentMotion(profile);motion.register(base,manifest);
  const originalGeometry=route.source.geometry,positions=originalGeometry.attributes.position.array.slice(),colors=route.source.material.color.clone();
  const port=rig.cache.get('xol').loaded.entries.find(e=>e.key==='xol_321').mesh;assert(port.visible);
  // Independently pinned native original face5/6/3, not metadata filament-inlet guesses.
  const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/madmax-ptfe-native-102.json',import.meta.url),'utf8'));assert.deepEqual(madmaxPtfePort.point_mm,fixture.port.point_mm);
  let poses=0,vertices=0,normals=0,triangles=0,checks=0,maxError=0;
  const ref=profile.display_reference_xyz_mm,waypoints=[ref,[0,0,0],[size,size,250],[size/2,size/2,125],[0,size,250],[size,0,0],[size,size,250],[0,0,0],ref];
  function sample(xyz,geometryCheck){
   const pose=motion.setPose({x:xyz[0],y:xyz[1],z:xyz[2]});rig.setDelta([pose.dx,pose.dy,0]);const d=route.update(variant,true);assert(route.mesh.visible&&!route.source.visible);assert.equal(route.mesh.material,route.source.material);assert(route.mesh.material.color.equals(colors));
   const p=new THREE.Vector3(...[fixture.port.point_mm[0]/1000,fixture.port.point_mm[2]/1000,-fixture.port.point_mm[1]/1000]);port.localToWorld(p);const expected=[p.x*1000,-p.z*1000,p.y*1000];const err=Math.hypot(...d.start_mm.map((n,i)=>n-expected[i]));assert(err<1e-8);maxError=Math.max(maxError,err);
   const a=route.mesh.geometry.attributes.position,n=route.mesh.geometry.attributes.normal,idx=route.mesh.geometry.index.array,stride=25,layer=385*stride;
   // Both annular layers keep the native radii and the actual installed socket axis.
   for(const shell of [0,1]){const center=new THREE.Vector3();for(let j=0;j<24;j++)center.add(new THREE.Vector3().fromBufferAttribute(a,shell*layer+j));center.multiplyScalar(1/24);assert(center.distanceTo(p)<2e-7);for(let j=0;j<24;j++){const q=new THREE.Vector3().fromBufferAttribute(a,shell*layer+j);assert(Math.abs(q.distanceTo(p)*1000-[2,1.5][shell])<.0001);assert(Math.abs(q.y-p.y)<1e-7);}checks++;}
   if(geometryCheck){for(let i=0;i<a.count;i++){const q=new THREE.Vector3().fromBufferAttribute(a,i),normal=new THREE.Vector3().fromBufferAttribute(n,i);assert(q.toArray().every(Number.isFinite));assert(Math.abs(normal.length()-1)<1e-6);vertices++;normals++;}for(let i=0;i<idx.length;i+=3){const pa=new THREE.Vector3().fromBufferAttribute(a,idx[i]),pb=new THREE.Vector3().fromBufferAttribute(a,idx[i+1]),pc=new THREE.Vector3().fromBufferAttribute(a,idx[i+2]),cross=pb.sub(pa).cross(pc.sub(pa)),normal=new THREE.Vector3().fromBufferAttribute(n,idx[i]).add(new THREE.Vector3().fromBufferAttribute(n,idx[i+1])).add(new THREE.Vector3().fromBufferAttribute(n,idx[i+2]));assert(cross.length()>1e-13,'Collapsed runtime tube triangle');assert(cross.dot(normal)>0,'Reversed runtime tube triangle');triangles++;}}
   poses++;
  }
  for(const xyz of waypoints)sample(xyz,true);
  // Rapid reversible changes: refine each interval to <=8mm of endpoint travel.
  for(let i=1;i<waypoints.length;i++){const a=waypoints[i-1],b=waypoints[i],steps=Math.max(2,Math.ceil(Math.hypot(b[0]-a[0],b[1]-a[1])/8));for(let j=1;j<steps;j++)sample(a.map((n,k)=>n+(b[k]-n)*j/steps),j===Math.floor(steps/2));}
  route.update(variant,false);assert(!route.mesh.visible&&!route.source.visible);route.update(variant,true);assert(route.mesh.visible);
  for(const palette of [{base:'#00ffff',accent:'#ff00ff'},{base:'#ff00ff',accent:'#00ffff'},{base:'#24272c',accent:'#e32636'}]){rig.setPalette(palette);assert(route.mesh.material.color.equals(colors));sample(ref,false);}
  const stock=catalog.variants.find(v=>v.id===profile.default_configuration);assert(stock);
  for(let i=0;i<3;i++){await rig.install(stock);route.update(stock,true);assert(route.source.visible&&!route.mesh.visible);assert.equal(route.source.geometry,originalGeometry);assert.deepEqual(originalGeometry.attributes.position.array,positions);await rig.install(variant);sample(ref,false);}
  for(const changed of [{...variant,id:'another'},{...variant,extruder:'orbiter2'},{...variant,toolhead:'sphinx'}]){route.update(changed,true);assert(route.source.visible&&!route.mesh.visible);}
  reports.push({machine_id:machine,poses,endpoint_checks:checks,vertices,normals,triangles,maximum_endpoint_error_mm:maxError,original_geometry_restored:true,purchased_material_preserved:true,source_cut_length_preserved:false,whole_route_clearance_certified:false});
  route.dispose();scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});scene.clear();rig.cache.clear();globalThis.gc?.();
 }
 for(const name of ['XOL_MOD.json','Xol_SherpaMini_Rapido2UHF_AWD9.glb.gz']){const b=await fs.readFile(path.join(root,name));inputs[name]=sha(b);}
 return {schema:'madmax-native-port-runtime-102',passed:true,machines:reports,input_sha256:inputs,adapter_sha256:sha(await fs.readFile(new URL('../site/viewer/madmax-ptfe.mjs',import.meta.url))),native_fixture_sha256:sha(await fs.readFile(new URL('./fixtures/madmax-ptfe-native-102.json',import.meta.url))),scope:'Actual original exported ECAS and PTFE material; selected Trident250/300/350 MadMax Xol tuple. Port/end tangents, hollow section, min/max/mid/reverse/adaptive rapid motion, finite/winding/normals, visibility and exact stock reset. Flexible route is variable length; full route solid clearance, CAN, manufacturing and other combinations are not certified.',whole_machine_certified:false};
}
