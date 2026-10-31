import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {OrbitControls}=await import('../site/viewer/vendor/OrbitControls.js');
const {frameHeadBounds}=await import('../site/viewer/head-camera.mjs');
const {restoreCamera,captureCamera}=await import('../site/viewer/source-assembly-view-state.mjs');
const {frameResponsiveView,settleCameraPose}=await import('../site/viewer/responsive-camera.mjs');
const old=process.argv.includes('--expect-drift'),results=[];
function setup(width=1000,height=600){
 const doc=new EventTarget(),canvas=new EventTarget(),captured=new Set();
 Object.assign(canvas,{style:{},clientWidth:width,clientHeight:height,getRootNode:()=>doc,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)});
 const camera=new THREE.PerspectiveCamera(38,width/height,.0001,100);camera.position.set(.3,.2,.4);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
 const event=(type,id,x,y)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});canvas.dispatchEvent(e);};
 const gesture=()=>{event('pointerdown',1,120,100);event('pointermove',1,180,155);event('pointerup',1,180,155);event('pointerdown',2,120,100);event('pointerdown',3,220,100);event('pointermove',3,250,130);event('pointerup',2,120,100);event('pointerup',3,250,130);};
 return {camera,controls,gesture};
}
const box=new THREE.Box3(new THREE.Vector3(-.05,.02,-.04),new THREE.Vector3(.08,.18,.07));
const snapshot=(camera,controls)=>({position:camera.position.clone(),target:controls.target.clone(),quaternion:camera.quaternion.clone(),up:camera.up.clone(),zoom:camera.zoom});
function settled(camera,controls,expected){
 for(let i=0;i<180;i++)controls.update();
 return camera.position.distanceTo(expected.position)<1e-10&&controls.target.distanceTo(expected.target)<1e-10&&camera.quaternion.angleTo(expected.quaternion)<1e-7&&camera.up.equals(expected.up)&&camera.zoom===expected.zoom;
}
// The actual production functions, pointer event listeners and bundled controller
// reproduce the old fault before this test is admitted as a release regression.
for(const [width,height,insets] of [[1000,600,{}],[390,299,{top:60,bottom:62}]]){
 for(const [direction,up] of [[[1,.65,1.4],[0,1,0]],[[0,0,1],[0,1,0]],[[0,0,-1],[0,1,0]],[[0,-1,0],[0,0,-1]]]){
  const {camera,controls,gesture}=setup(width,height);camera.up.fromArray(up);gesture();
  frameHeadBounds(camera,controls,box,{direction,width,height,insets});
  const stable=settled(camera,controls,snapshot(camera,controls));
  results.push({consumer:'head-fit',width,height,direction,stable});
  if(!old){assert(stable,'Head fit drifted after pending orbit/pan/dolly');camera.updateMatrixWorld(true);
   for(const x of [box.min.x,box.max.x])for(const y of [box.min.y,box.max.y])for(const z of [box.min.z,box.max.z]){
    const p=new THREE.Vector3(x,y,z).project(camera),px=(p.x+1)*width/2,py=(1-p.y)*height/2;
    assert(px>=(insets.left||0)&&px<=width-(insets.right||0)&&py>=(insets.top||0)&&py<=height-(insets.bottom||0)&&p.z>-1&&p.z<1,'Stable fit clips actual bounds or inset controls');
   }
  }
  assert.equal(controls.enableDamping,true);assert.equal(controls.autoRotate,false);controls.dispose();
 }
 for(const up of [[0,1,0],[0,0,-1]]){
  const {camera,controls,gesture}=setup(width,height);camera.up.fromArray(up);controls.target.set(.02,.03,-.01);camera.position.set(.2,.3,.5);controls.update();
  const saved=captureCamera(camera,controls);gesture();restoreCamera(saved,camera,controls);
  const restored=settled(camera,controls,{position:new THREE.Vector3(...saved.position),target:new THREE.Vector3(...saved.target),quaternion:new THREE.Quaternion().setFromRotationMatrix(new THREE.Matrix4().lookAt(new THREE.Vector3(...saved.position),new THREE.Vector3(...saved.target),new THREE.Vector3(...saved.up))),up:new THREE.Vector3(...saved.up),zoom:camera.zoom});
  results.push({consumer:'source-restore',width,height,up,stable:restored});if(!old)assert(restored,'Saved source camera altered by pending gesture or viewport scaling');controls.dispose();
 }
}
// Execute the shipped cutaway fit body, with a bounded assembly fixture. Browser
// and actual-model bounds are reviewed separately; no duplicated fit algorithm.
const text=await fs.readFile(new URL('../site/viewer/stealthburner-cutaway.mjs',import.meta.url),'utf8'),body=text.match(/function fit\(next=view\)\{([\s\S]*?)\n\}/)?.[1];assert(body,'Missing real cutaway fit');
for(const next of ['section','perspective','front']){
 const {camera,controls,gesture}=setup(),assembly={box},node={setAttribute(){}};
 const fit=new Function('assembly','camera','controls','THREE','$','view','settleCameraPose','next',body);
 gesture();fit(assembly,camera,controls,THREE,()=>node,'section',settleCameraPose,next);
 const stable=settled(camera,controls,snapshot(camera,controls));results.push({consumer:'cutaway-fit',next,stable});if(!old)assert(stable,'Cutaway preset drifted');controls.dispose();
}
if(old){assert(results.some(r=>r.consumer==='head-fit'&&!r.stable));assert(results.some(r=>r.consumer==='source-restore'&&!r.stable));assert(results.some(r=>r.consumer==='cutaway-fit'&&!r.stable));}
else{
 // Existing generic presets still apply portrait scaling exactly once, retain
 // projection offsets/zoom and restore damping/autoRotate flags even on errors.
 const {camera,controls,gesture}=setup(390,844);gesture();camera.position.set(0,0,2);controls.target.set(0,0,0);camera.zoom=1.4;frameResponsiveView(camera,controls);const s=snapshot(camera,controls);assert(settled(camera,controls,s));assert.equal(camera.zoom,1.4);assert(Math.abs(camera.position.length()-2/(390/844))<1e-8);controls.dispose();
 const c=setup();c.gesture();c.controls.autoRotate=true;c.camera.setViewOffset(1000,600,12,-8,1000,600);const view={...c.camera.view},requested=snapshot(c.camera,c.controls);settleCameraPose(c.camera,c.controls);
 assert.equal(c.controls.enableDamping,true);assert.equal(c.controls.autoRotate,true);assert.deepEqual(c.camera.view,view);assert(c.camera.position.distanceTo(requested.position)<1e-10&&c.controls.target.distanceTo(requested.target)<1e-10);c.controls.dispose();
 const fail=setup();fail.controls.autoRotate=true;fail.controls.update=()=>{throw Error('controlled update failure')};assert.throws(()=>settleCameraPose(fail.camera,fail.controls),/controlled update failure/);assert.equal(fail.controls.enableDamping,true);assert.equal(fail.controls.autoRotate,true);fail.controls.dispose();
}
console.log(JSON.stringify({passed:true,mode:old?'historical-runtime-reproduction':'fixed-production-regression',samples:results.length,results,scope:'Real bundled controls and DOM pointer protocols; camera framing/restore only. Model fit, browser and native-solid clearance are separate.'}));
