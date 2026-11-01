// Run the exact production named-view caller with bundled real controls.
// Finite box fixtures prove framing/lifecycle only, never CAD fit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three'),{OrbitControls}=await import('../site/viewer/vendor/OrbitControls.js'),{frameResponsiveView}=await import('../site/viewer/responsive-camera.mjs');
const text=await fs.readFile(new URL('../site/viewer/v0-app.js',import.meta.url),'utf8'),body=text.match(/function view\(name\)\{([\s\S]*?)\n\}\nfor\(const name/)?.[1];assert(body,'Exact V0 named view body required');
const view=new Function('THREE','scene','camera','orbit','assemblyView','frameResponsiveView','render','name',body);let cases=0;
function setup(width,height,damping){
 const document=new EventTarget(),canvas=new EventTarget(),captured=new Set();Object.assign(canvas,{style:{},clientWidth:width,clientHeight:height,getRootNode:()=>document,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)});
 const camera=new THREE.PerspectiveCamera(38,width/height,.001,10);camera.position.set(.3,.2,.4);const controls=new OrbitControls(camera,canvas);controls.enableDamping=damping;
 function gesture(){for(const[t,x,y]of [['pointerdown',120,100],['pointermove',190,140],['pointerup',190,140]]){const e=new Event(t,{cancelable:true});Object.assign(e,{pointerId:1,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});canvas.dispatchEvent(e)}}
 return{camera,controls,gesture};
}
for(const[width,height]of [[1000,600],[390,299]])for(const damping of [false,true])for(const name of ['iso','front','top']){
 const{camera,controls,gesture}=setup(width,height,damping),scene=new THREE.Scene(),joint=new THREE.Group();joint.position.set(-.04,.045,.01);scene.add(joint);
 const geometry=new THREE.BoxGeometry(.026,.019,.023),material=new THREE.MeshStandardMaterial(),visible=new THREE.Mesh(geometry,material);visible.rotation.y=.3;joint.add(visible);
 const hidden=new THREE.Mesh(new THREE.BoxGeometry(3,3,3),material);hidden.position.set(2,3,4);hidden.visible=false;joint.add(hidden);
 const notDrawn=new THREE.Mesh(new THREE.BoxGeometry(5,5,5),material);notDrawn.geometry.setDrawRange(0,0);joint.add(notDrawn);scene.updateMatrixWorld(true);geometry.computeBoundingBox();const expectedBox=geometry.boundingBox.clone().applyMatrix4(visible.matrixWorld),center=expectedBox.getCenter(new THREE.Vector3()),original=[visible.matrixWorld.toArray(),hidden.matrixWorld.toArray(),hidden.visible,notDrawn.geometry.drawRange.count];let renders=0;
 gesture();view(THREE,scene,camera,controls,{getDisplayedParts:()=>[{nodes:[joint]}]},frameResponsiveView,()=>renders++,name);
 assert(controls.target.distanceTo(center)<1e-12,'Manual preset must target visible joint, not whole-machine reference');assert(camera.position.distanceTo(center)<.3,'Isolated assembly must remain inspectable');assert.equal(renders,1);
 const direction=new THREE.Vector3(...({iso:[.65,.4,1],front:[0,0,1],top:[0,1,0]}[name])).normalize();assert(camera.position.clone().sub(controls.target).normalize().dot(direction)>1-1e-8);assert.deepEqual(camera.up.toArray(),name==='top'?[0,0,-1]:[0,1,0]);
 const stable={position:camera.position.clone(),target:controls.target.clone()};for(let i=0;i<120;i++)controls.update();assert(camera.position.distanceTo(stable.position)<1e-10&&controls.target.distanceTo(stable.target)<1e-10,'Pending real input must settle after manual preset');assert.equal(controls.enableDamping,damping);
 camera.updateMatrixWorld(true);for(const x of [expectedBox.min.x,expectedBox.max.x])for(const y of [expectedBox.min.y,expectedBox.max.y])for(const z of [expectedBox.min.z,expectedBox.max.z]){const p=new THREE.Vector3(x,y,z).project(camera);assert(Math.abs(p.x)<=1&&Math.abs(p.y)<=1&&p.z>-1&&p.z<1,'Visible source fixture clips named view')}
 assert.deepEqual([visible.matrixWorld.toArray(),hidden.matrixWorld.toArray(),hidden.visible,notDrawn.geometry.drawRange.count],original);controls.dispose();geometry.dispose();hidden.geometry.dispose();notDrawn.geometry.dispose();material.dispose();cases++;
}
for(const manual of [null,{getDisplayedParts:()=>[]}])for(const name of ['iso','front','top']){
 const{camera,controls}=setup(1000,600,false),scene=new THREE.Scene();view(THREE,scene,camera,controls,manual,frameResponsiveView,()=>{},name);assert.deepEqual(controls.target.toArray(),[0,.16,0]);assert(camera.position.toArray().every(Number.isFinite));controls.dispose();cases++;
}
console.log(JSON.stringify({passed:true,cases,scope:'Exact current V0 named-view caller, real bundled pointer controls, visible/hidden/drawRange finite fixtures, requested directions, bounds fit, pending-input stability, unchanged part transforms and native/empty fallback. Selected browser and actual geometry are separate evidence.'}));
