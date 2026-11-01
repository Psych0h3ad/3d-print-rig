import assert from 'node:assert/strict';
import fs from 'node:fs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
const source=fs.readFileSync(new URL('../site/viewer/source-map-app.mjs',import.meta.url),'utf8');
const functions=source.slice(source.indexOf('function bounds('),source.indexOf('function download('));
assert(functions.includes('const viewNodes='));
function run(assemblyMode){
 const scene=new THREE.Scene(),frame=new THREE.Mesh(new THREE.BoxGeometry(.5,.5,.5)),later=new THREE.Mesh(new THREE.BoxGeometry(.2,.2,.2));later.position.set(2,-.4,.3);scene.add(frame,later);
 const camera=new THREE.PerspectiveCamera(38,1.4,.001,100),orbit={target:new THREE.Vector3()},buttons=new Map(),$=s=>{if(!buttons.has(s))buttons.set(s,{});return buttons.get(s)};let verified=0,settled=0;
 const index={verifyLive:()=>verified++,entries:()=>[{node:frame}]};
 new Function('THREE','scene','camera','orbit','index','nativeNodes','assemblyMode','$','settleCameraPose','render',functions)(THREE,scene,camera,orbit,index,[frame,later],assemblyMode,$,()=>settled++,()=>{});
 $('#mapFit').onclick();const distance=camera.position.distanceTo(orbit.target),center=orbit.target.clone();$('#mapFront').onclick();assert.equal(camera.position.x,orbit.target.x);$('#mapTop').onclick();assert.deepEqual(camera.up.toArray(),[0,0,-1]);
 assert(verified>=3);assert(settled>=3);assert(camera.position.toArray().every(Number.isFinite));return {distance,center};
}
const complete=run(true),classification=run(false);assert(complete.distance>classification.distance*2,'A frame-only current stage must retain space for later source parts');assert(complete.center.x>.5);assert.equal(classification.center.x,0);
console.log(JSON.stringify({passed:true,scope:'Actual source-map fit functions/handlers with real finite THREE geometry/camera and explicit control-port fixture; assembly framing includes future native parts. Not full browser/orbit/native-solid qualification.'}));
