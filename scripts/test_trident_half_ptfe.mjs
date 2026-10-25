import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {halfZTubeSource,guardHalfZTube,halfZTubeCurve} from '../site/viewer/trident-half-z-tube.mjs';
import {customTubeCurve,createCustomTube} from '../site/viewer/custom-voron-tube.mjs';
import {auditFlexRoute} from './flex-route-quality.mjs';
import {verifyTubeGeometry} from './test_custom_ptfe.mjs';

const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/trident-half-z-ptfe.json',import.meta.url)));
assert.deepEqual(fixture.native_mate_guards,halfZTubeSource.native_mate_guards);
assert.equal(fixture.roof_bottom_z_mm,halfZTubeSource.roof_bottom_z_mm);
const manifest={machine_id:fixture.machine_id,custom_ptfe:fixture.custom_ptfe,
 parts:Object.entries(fixture.native_mate_guards).map(([key,native_sha256])=>({key,native_sha256}))};
guardHalfZTube(manifest);
assert.throws(()=>guardHalfZTube({...manifest,machine_id:'other'}));
assert.throws(()=>guardHalfZTube({...manifest,parts:manifest.parts.map(p=>({...p,native_sha256:'0'.repeat(64)}))}));
const spec=fixture.custom_ptfe,point=([x,y,z])=>[x,z,-y];
const reference=[174.60606718710815,176.63501757013745];
let minimum=Infinity;
const poses=[...[-reference[0],-reference[0]/2,0,(350-reference[0])/2,350-reference[0]].flatMap(x=>
 [-reference[1],-reference[1]/2,0,(350-reference[1])/2,350-reference[1]].map(y=>[x,y]))];
poses.push([175-reference[0],328-reference[1]],[0,314-reference[1]]);
poses.push(...poses.slice().reverse(),[0,0]);
for(const[dx,dy]of poses){
 const curve=customTubeCurve(spec,dx,dy);
 const start=point([spec.start_mm[0]+dx,spec.start_mm[1]+dy,spec.start_mm[2]]);
 const report=auditFlexRoute(curve,{units:'m',start:{positionMm:start,axis:[0,1,0]},
  end:{positionMm:point(spec.end_mm),axis:point(spec.holder_bore_axis).map(v=>-v)},
  minBendRadiusMm:20,tubeRadiusMm:spec.radius_mm,maxSamples:16385,maxPairTests:2000000});
 assert(report.ok,JSON.stringify({dx,dy,findings:report.findings}));
 minimum=Math.min(minimum,report.metrics.minBendRadiusMm);
 assert.equal(curve.curves.length,5);
 const guide=curve.curves[2],a=guide.v1,b=guide.v2;
 assert.equal(a.x,0);assert.equal(b.x,0);assert.equal(a.z,-.185);assert.equal(b.z,-.185);
 assert(a.y*1000+spec.radius_mm<fixture.roof_bottom_z_mm);
 assert(b.y*1000>fixture.roof_bottom_z_mm+3.1);
 // Before reaching the stationary guide, the hose stays BELOW the solid roof.
 for(let i=0;i<=256;i++)assert(curve.curves[1].getPoint(i/256).y*1000+spec.radius_mm<fixture.roof_bottom_z_mm);
}
assert(minimum>=20,'Both free bows must meet the declared 20 mm display threshold');
assert.throws(()=>halfZTubeCurve(spec,NaN,0));
for(const changed of [{...spec,radius_mm:-2},{...spec,holder_bore_axis:[0,1,0]},
 {...spec,end_mm:[0,0,0]},{...spec,controls_mm:spec.controls_mm.map(p=>p.map(()=>NaN))}]){
 assert.throws(()=>guardHalfZTube({...manifest,custom_ptfe:changed}));
 assert.throws(()=>halfZTubeCurve(changed));
}
const root=new THREE.Group(),sourceGeometry=new THREE.BoxGeometry(),mesh=new THREE.Mesh(sourceGeometry);
mesh.userData.part_key=spec.part_key;root.add(mesh);
const tube=createCustomTube(root,manifest);tube.update();
const first=Array.from(mesh.geometry.attributes.position.array);
verifyTubeGeometry(mesh.geometry);
tube.update(100,-100);verifyTubeGeometry(mesh.geometry);tube.update(0,0);
assert.deepEqual(Array.from(mesh.geometry.attributes.position.array),first);
tube.update(0,0,false);assert.equal(mesh.visible,false);tube.update(0,0,true);assert(mesh.visible);
assert(mesh.geometry.attributes.normal.array.every(Number.isFinite));
tube.dispose();assert.equal(mesh.geometry,sourceGeometry);
console.log(JSON.stringify({passed:true,poses:poses.length,min_bend_radius_mm:minimum,
 scope:'Pinned half-height source route regression; 20 mm display review threshold, not material or whole-machine clearance certification.'}));
