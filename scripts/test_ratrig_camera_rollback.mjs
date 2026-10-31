import assert from 'node:assert/strict';import fs from 'node:fs/promises';import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('../site/viewer/vendor-r180/three.module.js');
const {OrbitControls}=await import('../site/viewer/vendor-r180/OrbitControls.js');
const {settleCameraPose}=await import('../site/viewer/responsive-camera.mjs');
const source=await fs.readFile(new URL('../site/viewer/ratrig.js',import.meta.url),'utf8');
const boundary='settleCameraPose(camera,controls);document.body.dataset.machineId';
assert.equal(source.split(boundary).length,2,'Rollback settle boundary changed');
const sources={source,base:source.replace(boundary,'camera.lookAt(controls.target);document.body.dataset.machineId')};
function runtime(width=1000,height=600,up=[0,1,0]){
 const doc=new EventTarget(),canvas=new EventTarget();Object.assign(canvas,{style:{},clientWidth:width,clientHeight:height,getRootNode:()=>doc,setPointerCapture:()=>{},releasePointerCapture:()=>{},hasPointerCapture:()=>true});
 const camera=new THREE.PerspectiveCamera(35,width/height,.01,30),controls=new OrbitControls(camera,canvas);controls.enableDamping=true;
 camera.position.set(.7,.8,1.1);controls.target.set(.02,.14,-.03);camera.up.fromArray(up);camera.zoom=1.25;camera.setViewOffset(width,height,11,-7,width,height);settleCameraPose(camera,controls);
 function touch(type,id,x,y){const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});canvas.dispatchEvent(e);}
 const gesture=()=>{touch('pointerdown',1,90,100);touch('pointermove',1,180,170);touch('pointerup',1,180,170);touch('pointerdown',2,100,100);touch('pointerdown',3,200,100);touch('pointermove',3,240,140);touch('pointerup',2,100,100);touch('pointerup',3,240,140);};
 return {camera,controls,gesture};
}
const cameraData=(r)=>({position:r.camera.position.toArray(),target:r.controls.target.toArray(),up:r.camera.up.toArray(),zoom:r.camera.zoom,view:{...r.camera.view},aspect:r.camera.aspect});
const error=(r,saved)=>({position:Math.hypot(...r.camera.position.toArray().map((v,i)=>v-saved.position[i])),target:Math.hypot(...r.controls.target.toArray().map((v,i)=>v-saved.target[i])),up:Math.hypot(...r.camera.up.toArray().map((v,i)=>v-saved.up[i]))});
const stable=e=>e.position<1e-10&&e.target<1e-10&&e.up<1e-12;
function scenario(source,stage,r,{noPrevious=false,disposedAfterLoad=false}={}){
 const calls=[],elements=new Map();const root=new THREE.Group(),nextRoot=new THREE.Group();
 // Finite placeholder bounds for the lifecycle fixture only, never exported
 // as a machine or substituted for original hardware.
 for(const group of [root,nextRoot]){const bound=new THREE.Mesh(new THREE.BoxGeometry(.5,.8,.6),new THREE.MeshBasicMaterial());bound.position.y=.4;group.add(bound);}
 // Explicit adapter/root fixtures: no generic object is presented as CAD hardware.
 const old={root,profile:{machine_id:'old-fixture'},adapter:{getSnapshot:()=>({fixture:'old-rig'})}};
 const next={root:nextRoot,profile:{machine_id:'new-fixture'},adapter:{getSnapshot:()=>({fixture:'new-rig'}),getSummary:()=>({fixture:'new-summary'})}};
 const scene=new THREE.Scene();if(!noPrevious)scene.add(root);const original=cameraData(r),originalView={night:false,grid:true,camera:original};
 let injected=false,context;const call=name=>{calls.push(name);if(name===stage&&!injected){injected=true;r.gesture();throw Error('injected-'+stage);}};
 const document={body:{dataset:{machineId:noPrevious?'':'old-fixture'}}},grid={position:{y:0}};
 const $=id=>{if(!elements.has(id))elements.set(id,{hidden:true,textContent:'',classList:{add(){}}});return elements.get(id);};
 const api={...r,THREE,scene,document,grid,$,settleCameraPose,AbortController,URL,location:{href:'https://example.invalid/viewer/ratrig.html?machine=old-fixture'},index:{fixture:true},workspaceTask:f=>f(),program:{invalidate:()=>calls.push('invalidate')},
  captureRatRigConfiguration:()=>({view:originalView}),setBusy:value=>calls.push('busy-'+value),
  loadRatRigMachine:async()=>{if(stage==='download'){throw Error('injected-download');}if(disposedAfterLoad)context.setDisposed();return next;},
  disposeRatRig:(target,adapter)=>{calls.push(target===root?'dispose-old':'dispose-next');target?.removeFromParent();},
  provenance:()=>call('provenance'),sync:()=>call('sync'),
  view:()=>{r.camera.position.set(-.4,.9,.3);r.camera.up.set(0,1,0);r.controls.target.set(.1,.2,.05);settleCameraPose(r.camera,r.controls);call('view');},
  replaceWorkspaceURL:()=>call('url')};
 const match=source.match(/async function loadMachine\(id\)\{return workspaceTask\(async\(\)=>\{[\s\S]*?\n\}\);\}/);assert(match,'Exact loadMachine body unavailable');
 context=new Function(...Object.keys(api),'old','let current=old,initialSnapshot=old?.adapter.getSnapshot(),disposed=false,busy=false,pending;const loadMachine='+match[0].replace(/^async function loadMachine/,'async function')+';return {loadMachine,read:()=>({current,initialSnapshot,disposed,busy,pending}),setDisposed:()=>{disposed=true;}};')(...Object.values(api),noPrevious?null:old);
 const cleanup=()=>{for(const group of [root,nextRoot])group.traverse(n=>{n.geometry?.dispose();n.material?.dispose();});};
 return {context,calls,old,next,document,grid,elements,original,originalView,scene,cleanup};
}
const reports=[];
 for(const [width,height]of [[1000,600],[390,844]])for(const up of [[0,1,0],[0,0,-1]])for(const stage of ['provenance','sync','view','url']){
  const versions={};
  for(const version of ['base','source']){
   const r=runtime(width,height,up),s=scenario(sources[version],stage,r),initial=s.context.read().initialSnapshot;await assert.rejects(s.context.loadMachine('new-fixture'),new RegExp('injected-'+stage));
   const first=error(r,s.original);for(let i=0;i<180;i++)r.controls.update();const last=error(r,s.original);
   assert.equal(s.context.read().initialSnapshot,initial,'Rollback must retain the original snapshot object');assert.equal(s.context.read().current,s.old);assert.equal(s.old.root.visible,true);assert.equal(s.old.root.parent,s.scene);assert.equal(s.next.root.parent,null);assert.equal(s.context.read().pending,null);assert(s.calls.includes('busy-false'));assert.equal(s.document.body.dataset.machineId,'old-fixture');
   assert.equal(r.camera.zoom,s.original.zoom);assert.equal(r.camera.aspect,s.original.aspect);assert.deepEqual(r.camera.view,s.original.view);assert.equal(r.controls.enableDamping,true);assert(Number.isFinite(s.grid.position.y),'Nonfinite rollback fixture support plane');
   if(version==='source')assert(stable(first)&&stable(last),'New rollback pose drift');else assert(!stable(last),'Baseline failed to reproduce pending-control defect');
   versions[version]={first,last};r.controls.dispose();s.cleanup();
  }
  reports.push({width,height,up,stage,versions});
 }
 for(const options of [{stage:'download'},{stage:'download',noPrevious:true},{stage:'none',disposedAfterLoad:true},{stage:'none'}]){
  const r=runtime(),s=scenario(sources.source,options.stage,r,options);
  if(options.stage==='download')await assert.rejects(s.context.loadMachine('new-fixture'),/injected-download/);else await s.context.loadMachine('new-fixture');
  assert.equal(s.context.read().pending,null);
  if(options.stage==='download'){
   assert.equal(s.context.read().current,options.noPrevious?null:s.old);assert(!s.calls.includes('dispose-old'));assert(!s.calls.includes('dispose-next'));assert.equal(s.document.body.dataset.assetStatus,options.noPrevious?'error':'ready');assert(stable(error(r,s.original)));assert(s.calls.includes('busy-false'));
  }else if(options.disposedAfterLoad){assert(s.calls.includes('dispose-next'));assert(!s.calls.includes('dispose-old'));assert(!s.calls.includes('busy-false'));assert.equal(s.context.read().current,s.old);}
  else{assert.equal(s.context.read().current,s.next);assert(s.calls.includes('dispose-old'));assert(!s.calls.includes('dispose-next'));assert.equal(s.document.body.dataset.machineId,'new-fixture');assert.equal(s.document.body.dataset.assetStatus,'ready');assert(s.calls.includes('busy-false'));}
  reports.push({options,calls:s.calls,status:s.document.body.dataset.assetStatus??'disposed'});r.controls.dispose();s.cleanup();
 }
console.log(JSON.stringify({passed:true,cases:reports.length,scope:'Exact exported loadMachine body with real r180 controls and explicit finite scene/adapter/DOM/network fixtures; selected actual-model and browser review remains separate.'}));
