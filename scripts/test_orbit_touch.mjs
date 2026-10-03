import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {PerspectiveCamera} from '../site/viewer/vendor/three.module.js';

// Exercise the production controls' pointer protocol without a browser/GPU.
for(const folder of ['vendor','vendor-r180']){
 const href=new URL(`../site/viewer/${folder}/three.module.js`,import.meta.url).href;
 const code=(await fs.readFile(new URL(`../site/viewer/${folder}/OrbitControls.js`,import.meta.url),'utf8')).replace("from 'three'",`from '${href}'`);
 const {OrbitControls}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const doc=new EventTarget(),canvas=new EventTarget(),captured=new Set();
 Object.assign(canvas,{style:{},clientWidth:390,clientHeight:320,getRootNode:()=>doc,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>{assert(captured.has(id),'Release of a lost capture');captured.delete(id)}});
 const camera=new PerspectiveCamera(38,390/320,.01,10);camera.position.set(0,0,1);
 const controls=new OrbitControls(camera,canvas);
 const event=(id,x,y)=>({pointerId:id,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});
 const rotate=id=>{camera.position.set(0,.4,1);controls.update();const before=camera.position.clone();controls._onPointerDown(event(id,100,100));controls._onPointerMove(event(id,180,100));assert(camera.position.distanceTo(before)>.05)};
 assert.equal(canvas.style.touchAction,'none');rotate(1);
 // Mobile browser has already cancelled/released capture before dispatch.
 captured.delete(1);controls._onPointerUp(event(1,180,150));assert.equal(controls._pointers.length,0);assert.equal(controls.state,-1);
 controls._onPointerUp(event(1,180,150));rotate(2);controls._onPointerDown(event(3,220,150));controls._onPointerMove(event(3,250,160));
 captured.delete(2);controls._onPointerUp(event(2,180,150));assert.equal(controls._pointers.length,1);
 const before=camera.position.clone();controls._onPointerMove(event(3,200,100));assert(camera.position.distanceTo(before)>.01);controls._onPointerUp(event(3,200,100));
 rotate(4);controls.disconnect();assert.equal(controls._pointers.length,0);controls.connect(canvas);rotate(5);controls._onPointerUp(event(5,180,150));
 // Capture-loss listener must clean tracking even without a pointer-up.
 rotate(6);captured.delete(6);const lost=new Event('lostpointercapture');Object.assign(lost,event(6,180,150));canvas.dispatchEvent(lost);assert.equal(controls._pointers.length,0);rotate(7);controls._onPointerUp(event(7,180,150));controls.dispose();
}
console.log('Touch orbit: both production controls recover from cancellation, capture loss, duplicate end, two-to-one fingers and reconnect.');
