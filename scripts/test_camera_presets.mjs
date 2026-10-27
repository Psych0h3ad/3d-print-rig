import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {framePrinterView} from '../site/viewer/printer-camera-presets.mjs';
import {frameResponsiveView,setResponsiveAspect} from '../site/viewer/responsive-camera.mjs';

const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/top-view-source.json',import.meta.url),'utf8'));
let samples=0;
for(const folder of ['vendor','vendor-r180']){
 const href=new URL(`../site/viewer/${folder}/three.module.js`,import.meta.url).href;
 const THREE=await import(href),code=(await fs.readFile(new URL(`../site/viewer/${folder}/OrbitControls.js`,import.meta.url),'utf8')).replace("from 'three'",`from '${href}'`);
 const {OrbitControls}=await import('data:text/javascript;base64,'+Buffer.from(code).toString('base64'));
 const angle=(a,b)=>THREE.MathUtils.radToDeg(Math.acos(THREE.MathUtils.clamp(a.dot(b),-1,1)));
 function make(orthographic=false){
  const doc=new EventTarget(),canvas=new EventTarget(),captured=new Set();
  Object.assign(canvas,{style:{},clientWidth:1000,clientHeight:600,getRootNode:()=>doc,setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)});
  const camera=orthographic?new THREE.OrthographicCamera(-1,1,1,-1,.01,100):new THREE.PerspectiveCamera(35,1000/600,.01,100);
  camera.position.set(1.05,.78,1.18);const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
  const event=(id,x,y)=>({pointerId:id,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});
  function gesture(dy){
   controls._onPointerDown(event(1,400,300));controls._onPointerMove(event(1,460,300+dy));controls._onPointerUp(event(1,460,300+dy));
   controls._onPointerDown(event(2,400,300));controls._onPointerDown(event(3,600,300));controls._onPointerMove(event(3,640,340));controls._onPointerUp(event(2,400,300));controls._onPointerUp(event(3,640,340));
  }
  return {camera,controls,gesture};
 }
 const direction=(c,k)=>c.position.clone().sub(k.target).normalize();
 const screen=(v,c)=>{const p=v.clone().project(c);return new THREE.Vector2(p.x*c.aspect,p.y);};
 // The shipped historical source pose rolled the entire X/Z grid by45deg.
 {
  const {camera,controls}=make();camera.position.fromArray(fixture.old_top.position);controls.target.fromArray(fixture.old_top.target);camera.up.fromArray(fixture.old_top.up);camera.lookAt(controls.target);camera.updateMatrixWorld(true);
  const a=screen(controls.target,camera),b=screen(controls.target.clone().add(new THREE.Vector3(.2,0,0)),camera),d=b.sub(a),roll=Math.abs(THREE.MathUtils.radToDeg(Math.atan2(d.y,d.x)));
  assert(Math.abs(roll-45)<.01,'Historical source pose no longer reproduces the45deg finding');controls.dispose();
 }
 for(const dy of [-70,70])for(const portrait of [false,true]){
  const {camera,controls,gesture}=make();if(portrait)setResponsiveAspect(camera,controls,390,844);
  for(const name of ['top','front','iso','top']){
   gesture(dy);const zoom=camera.zoom;framePrinterView(camera,controls,name);
   assert.equal(controls.enableDamping,true);assert.equal(camera.zoom,zoom);assert.equal(controls.autoRotate,false);
   const before={p:camera.position.clone(),t:controls.target.clone(),q:camera.quaternion.clone()};
   for(let i=0;i<180;i++)controls.update();
   assert(camera.position.distanceTo(before.p)<1e-9,'Preset drifted after a pending gesture');assert(controls.target.distanceTo(before.t)<1e-9,'Pending pan displaced preset target');assert(camera.quaternion.angleTo(before.q)<1e-7,'Preset orientation drifted');
   if(name==='top'){
    assert(angle(direction(camera,controls),new THREE.Vector3(0,1,0))<.001);assert(camera.up.equals(new THREE.Vector3(0,1,0)));
    assert(new THREE.Vector3(0,1,0).applyQuaternion(camera.quaternion).dot(new THREE.Vector3(0,0,-1))>1-1e-9,'Actual screen-up must face the back of the printer');
    const a=screen(controls.target,camera),x=screen(controls.target.clone().add(new THREE.Vector3(.2,0,0)),camera).sub(a),z=screen(controls.target.clone().add(new THREE.Vector3(0,0,-.2)),camera).sub(a);
    assert(x.x>0&&Math.abs(x.y)<1e-7&&z.y>0&&Math.abs(z.x)<1e-7,'Top view must keep X horizontal and back-of-printer upward');
   }else assert(camera.up.equals(new THREE.Vector3(0,1,0)),'Leaving top must restore normal screen-up');
   samples++;
  }
  const p=camera.position.clone(),t=controls.target.clone();assert.throws(()=>framePrinterView(camera,controls,'missing'));assert(camera.position.equals(p)&&controls.target.equals(t));controls.dispose();
 }
 // The generic helper also serves source/other viewers and orthographic cameras.
 for(const orthographic of [false,true]){
  const {camera,controls,gesture}=make(orthographic);gesture(-70);
  const target=new THREE.Vector3(.2,.3,-.1),eye=target.clone().add(new THREE.Vector3(0,2,.0001)),up=new THREE.Vector3(0,0,-1);
  camera.position.copy(eye);camera.up.copy(up);controls.target.copy(target);camera.zoom=1.75;camera.updateProjectionMatrix();
  frameResponsiveView(camera,controls);const p=camera.position.clone();for(let i=0;i<180;i++)controls.update();
  assert(camera.position.distanceTo(p)<1e-9&&controls.target.distanceTo(target)<1e-9);assert.equal(camera.zoom,1.75);assert.equal(controls.enableDamping,true);assert(camera.up.equals(up));controls.dispose();samples++;
 }
}
console.log(JSON.stringify({passed:true,production_control_versions:2,samples,historical_roll_deg:45,pending_orbit_pan_dolly_cleared:true,preset_ABA:true,portrait:true,orthographic_helper:true,scope:'Production camera/control projection and pointer-protocol regressions; actual model geometry and browser evidence are separate.'}));
