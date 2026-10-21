import assert from 'node:assert/strict';
import {enderBowdenRoute,enderBowdenSpec,createEnderBowden} from '../site/viewer/ender-bowden-route.mjs';
import {Group} from '../site/viewer/vendor-r180/three.module.js';
import {auditFlexRoute} from './flex-route-quality.mjs';
const profile={machine_id:'ender3_stock_220',origin_mm:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],configurations:{stock:{},belted:{selection:{z:'belted'}},shifted:{rest_offsets_mm:{'00131':[1,2,3]}}}};
profile.configurations.ng={filament_path:'direct'};
profile.configurations.ng_revo={filament_path:'direct'};
profile.configurations.invalid_path={filament_path:'unknown'};
// A smooth free bow must not turn into straight uprights and joined elbows.
// Test actual interpolated curves as well as table nodes, including the narrow
// clearance near the top beam during intermediate Z movement.
for(const configuration of ['stock','belted'])for(let x=-100;x<=100;x+=25)for(const z of [-50,0,80,100,120,140,150,155,160,165,170,180,190]){
 const r=enderBowdenRoute({x,y:0,z},profile,configuration);
 assert(r.curve.getSecondDerivative(1).length()<1e-6,'Hose bends into the source plate at its fitting neck');
 const quality=auditFlexRoute(r.curve,{units:'m',tubeRadiusMm:2,minBendRadiusMm:30,maxSegmentLengthMm:8,chordToleranceMm:.04,
  start:{positionMm:r.endpoints_mm[0],axis:[1,0,0]},end:{positionMm:r.endpoints_mm[1],axis:[0,-1,0]}});
 assert(quality.ok,JSON.stringify({configuration,x,z,findings:quality.findings}));
 assert(Math.abs(quality.metrics.lengthMm-enderBowdenSpec.length_mm)<.1);
 for(const t of [.125,.25,.5,.75,.875]){
  const e=1e-5,finite=r.curve.getPoint(t+e).sub(r.curve.getPoint(t-e)).multiplyScalar(1/(2*e));
  assert(finite.distanceTo(r.curve.getDerivative(t))<2e-6,'Integrated bow has a derivative discontinuity');
 }
}
let samples=0;
for(const configuration of ['stock','belted','shifted'])for(const z of [-50,0,190])for(const direction of [1,-1])for(let k=0;k<=100;k++){
 const x=direction*(-100+2*k),axes={x,y:100,z},r=enderBowdenRoute(axes,profile,configuration);
 assert(Math.abs(r.length_mm-enderBowdenSpec.length_mm)<.003);
 for(const t of [0,.1,.3,.5,.7,.9,1])assert(r.curve.getPoint(t).toArray().every(Number.isFinite));
 assert(r.curve.getTangent(0).distanceTo({x:1,y:0,z:0})<1e-8);
 assert(r.curve.getTangent(1).distanceTo({x:0,y:-1,z:0})<1e-8);
 const d=configuration==='shifted'?[1,2,3]:[0,0,0];
 assert.deepEqual(r.endpoints_mm[1],enderBowdenSpec.head.map((v,i)=>v+[x,z,0][i]+d[i]));
 assert(r.curve.getPoint(0).distanceTo({x:r.endpoints_mm[0][0]/1000,y:r.endpoints_mm[0][1]/1000,z:r.endpoints_mm[0][2]/1000})<1e-12);
 assert(r.curve.getPoint(1).distanceTo({x:r.endpoints_mm[1][0]/1000,y:r.endpoints_mm[1][1]/1000,z:r.endpoints_mm[1][2]/1000})<1e-12);samples++;
}
assert.throws(()=>enderBowdenRoute({x:NaN,y:0,z:0},profile));
assert.throws(()=>enderBowdenRoute({x:0,y:0,z:0},{...profile,machine_id:'other'}));
const before=enderBowdenRoute({x:0,y:0,z:0},profile).curve.getPoints(64).map(v=>v.toArray());
enderBowdenRoute({x:100,y:-100,z:190},profile,'belted');
assert.deepEqual(enderBowdenRoute({x:0,y:0,z:0},profile).curve.getPoints(64).map(v=>v.toArray()),before);
const root=new Group(),adapter=createEnderBowden(root,profile);adapter.update({x:0,y:0,z:0},'stock');
const tube=adapter.meshes[0],nativeGeometry=tube.geometry;
for(const y of [-100,100,50,0]){
 adapter.update({x:0,y,z:0},'stock');assert.equal(tube.geometry,nativeGeometry);
 assert.equal(root.children.length,1);assert.deepEqual(tube.position.toArray(),[0,0,0]);
}
for(const z of [-50,190,95,0,-50,0]){
 adapter.update({x:0,y:100,z},'stock');assert.equal(root.children.length,1);
 assert.deepEqual(tube.position.toArray(),[0,0,0]);
 assert.deepEqual(tube.userData.endpoints_mm,enderBowdenRoute({x:0,y:100,z},profile).endpoints_mm);
 assert(tube.visible&&!tube.frustumCulled);
}
const currentGeometry=tube.geometry;
let disposed=0;currentGeometry.addEventListener('dispose',()=>disposed++);
adapter.update({x:100,y:0,z:190},'belted');assert.equal(disposed,1);assert.notEqual(tube.geometry,nativeGeometry);assert.equal(root.children.length,1);
adapter.update({x:0,y:0,z:0},'stock');assert.deepEqual(tube.position.toArray(),[0,0,0]);
assert.deepEqual(Array.from(tube.geometry.attributes.position.array),Array.from(nativeGeometry.attributes.position.array));
assert.equal(createEnderBowden(new Group(),{...profile,machine_id:'other'}).meshes.length,0);
assert.throws(()=>adapter.update({x:0,y:0,z:NaN},'stock'));
const stockReset=Array.from(tube.geometry.attributes.position.array);
for(const configuration of ['ng','ng_revo','ng']){
 for(const axes of [{x:0,y:0,z:0},{x:100,y:-100,z:190},{x:-100,y:100,z:-50},{x:0,y:0,z:0}]){
  assert.equal(enderBowdenRoute(axes,profile,configuration),null);
  adapter.update(axes,configuration);assert.equal(tube.visible,false);
  assert.equal(Object.hasOwn(tube.userData,'endpoints_mm'),false);
  assert.equal(Object.hasOwn(tube.userData,'length_mm'),false);
  assert.equal(root.children.length,1);
 }
 adapter.update({x:0,y:0,z:0},'stock');assert.equal(tube.visible,true);
 assert.deepEqual(Array.from(tube.geometry.attributes.position.array),stockReset);
 assert.deepEqual(tube.userData.endpoints_mm,enderBowdenRoute({x:0,y:0,z:0},profile).endpoints_mm);
}
assert.throws(()=>enderBowdenRoute({x:0,y:0,z:0},profile,'invalid_path'),/Unknown Ender-3 filament path/);
assert.throws(()=>adapter.update({x:0,y:0,z:0},'invalid_path'),/Unknown Ender-3 filament path/);
console.log(`Ender-3 native fitting tube: ${samples} forward/reversed service-length poses, fixed tangents, shifted fittings and exact reset.`);
