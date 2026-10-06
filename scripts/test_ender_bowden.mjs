import assert from 'node:assert/strict';
import {enderBowdenRoute,enderBowdenSpec,createEnderBowden} from '../site/viewer/ender-bowden-route.mjs';
import {Group} from '../site/viewer/vendor-r180/three.module.js';
const profile={machine_id:'ender3_stock_220',origin_mm:[0,0,0],basis:[[1,0,0],[0,1,0],[0,0,1]],configurations:{stock:{},belted:{selection:{z:'belted'}},shifted:{rest_offsets_mm:{'00131':[1,2,3]}}}};
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
for(const z of [-50,190,95,0,-50,0]){
 adapter.update({x:0,y:100,z},'stock');assert.equal(tube.geometry,nativeGeometry);assert.equal(root.children.length,1);
 assert.deepEqual(tube.position.toArray(),[0,z/1000,0]);
 assert.deepEqual(tube.userData.endpoints_mm,enderBowdenRoute({x:0,y:100,z},profile).endpoints_mm);
 assert(tube.visible&&!tube.frustumCulled);
}
let disposed=0;nativeGeometry.addEventListener('dispose',()=>disposed++);
adapter.update({x:100,y:0,z:190},'belted');assert.equal(disposed,1);assert.notEqual(tube.geometry,nativeGeometry);assert.equal(root.children.length,1);
adapter.update({x:0,y:0,z:0},'stock');assert.deepEqual(tube.position.toArray(),[0,0,0]);
assert.deepEqual(Array.from(tube.geometry.attributes.position.array),Array.from(nativeGeometry.attributes.position.array));
assert.equal(createEnderBowden(new Group(),{...profile,machine_id:'other'}).meshes.length,0);
assert.throws(()=>adapter.update({x:0,y:0,z:NaN},'stock'));
console.log(`Ender-3 native fitting tube: ${samples} forward/reversed service-length poses, fixed tangents, shifted fittings and exact reset.`);
