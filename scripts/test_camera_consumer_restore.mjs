import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('../site/viewer/vendor-r180/three.module.js');
const {OrbitControls}=await import('../site/viewer/vendor-r180/OrbitControls.js');
const {settleCameraPose}=await import('../site/viewer/responsive-camera.mjs');
const {validateCommunityState,communitySchema}=await import('../site/viewer/community-state.mjs');
const {validatePositronState,positronSchema}=await import('../site/viewer/positron-state.mjs');
const {validateRatRigConfiguration,ratRigSchema}=await import('../site/viewer/ratrig-ui-state.mjs');
const cases=[],negative=[];
const familyPaths={community:'community-renderer.mjs',positron:'positron.js',ratrig:'ratrig.js'};
const families=Object.keys(familyPaths);
// Execute shipped consumer bodies with real controls and validators. Adapter,
// DOM and render dependencies here are bounded fixtures; exported models and
// browser workflows are separate release evidence.
function setup(width,height){
 const doc=new EventTarget(),canvas=new EventTarget(),captured=new Set();
 Object.assign(canvas,{style:{},clientWidth:width,clientHeight:height,getRootNode:()=>doc,
  setPointerCapture:id=>captured.add(id),hasPointerCapture:id=>captured.has(id),releasePointerCapture:id=>captured.delete(id)});
 const camera=new THREE.PerspectiveCamera(35,width/height,.005,30);camera.position.set(.7,.8,1.1);
 const controls=new OrbitControls(camera,canvas);controls.enableDamping=true;controls.target.set(.03,.14,-.02);controls.update();
 const event=(type,id,x,y)=>{const e=new Event(type,{cancelable:true});Object.assign(e,{pointerId:id,pointerType:'touch',pageX:x,pageY:y,clientX:x,clientY:y});canvas.dispatchEvent(e);};
 const gesture=()=>{event('pointerdown',1,120,100);event('pointermove',1,180,155);event('pointerup',1,180,155);
  event('pointerdown',2,120,100);event('pointerdown',3,220,100);event('pointermove',3,250,130);event('pointerup',2,120,100);event('pointerup',3,250,130);};
 camera.zoom=1.3;camera.setViewOffset(width,height,12,-8,width,height);camera.updateProjectionMatrix();
 return {camera,controls,gesture};
}
const snap=(camera,controls)=>({position:camera.position.toArray(),target:controls.target.toArray(),up:camera.up.toArray(),zoom:camera.zoom,view:{...camera.view},aspect:camera.aspect});
const distance=(a,b)=>Math.hypot(...a.map((v,i)=>v-b[i]));
const metrics=(camera,controls,saved)=>({positionError:distance(camera.position.toArray(),saved.position),targetError:distance(controls.target.toArray(),saved.target),upError:distance(camera.up.toArray(),saved.up)});
const stable=m=>m.positionError<1e-10&&m.targetError<1e-10&&m.upError<1e-12;
function extract(source,family){
 const expression=family==='community'?/async function restore\(data\)\{([^\r\n]*)\}/:family==='positron'?/function restore\(data\)\{([^\r\n]*)\}/:/function restoreRatRigConfiguration\(data\)\{\r?\n([^\r\n]*)\r?\n\}/;
 const match=source.match(expression);assert(match,'Exact consumer function missing: '+family);return match[0];
}
function savedData(family,up=[0,1,0],choice='A'){
 const palette=choice==='A'?{base:'#123456',accent:'#fa04e1',frame:'#93a1bf'}:{base:'#fa04e1',accent:'#123456',frame:'#222222'};
 const camera=choice==='A'?{position:[.31,.52,.87],target:[.02,.08,-.03],up}:{position:[-.44,.61,.48],target:[.11,.19,.04],up};
 if(family==='community')return {schema:communitySchema,machine:'fixture-camera-machine',axes:{x:12,y:33,z:9},configuration:'stock',palette,night:true,grid:true,references:false,camera};
 if(family==='positron')return {schema:positronSchema,machine:'positron_v322',fold:37,palette,accessories:false,night:true,grid:true,camera};
 return {schema:ratRigSchema,machine:'fixture-ratrig-machine',rig:{machine_id:'fixture-ratrig-machine',mode:'single',pose:{x0:12,x1:33,y:7,z:11},lights:{chamber:1,vaoc:0},appearance:{palette,flexible_visible:true,enclosure_visible:false},copy_offset_mm:40,mirror_sum_mm:80},view:{night:true,grid:true,camera}};
}
function environment(family,runtime,options={}){
 const calls=[],elements=new Map(),grid={visible:false};
 const record=(name,...args)=>calls.push({name,args:structuredClone(args)});
 const profile=family==='ratrig'?{machine_id:'fixture-ratrig-machine',supported_motion_modes:['single'],limits:{safe_distance_mm:20,x0:[0,100]},size_mm:120}:{machine_id:'fixture-camera-machine',axes:{x:[0,100],y:[0,100],z:[0,100]},configurations:{stock:{}}};
 const current={profile,adapter:{setReferences:v=>record('references',v),setPalette:v=>record('palette',v),setAccessoriesVisible:v=>record('accessories',v),restore:v=>record('rig',v)}};
 let release;
 const ctx={...runtime,settleCameraPose,current,grid,evaOptions:null,
  validateCommunityState,validatePositronState,validateRatRigConfiguration,
  $:id=>{if(!elements.has(id))elements.set(id,{});return elements.get(id);},
  setInstallation:async id=>{record('install',id);if(options.deferred)await new Promise(resolve=>{release=resolve});return !options.stale;},
  setPalette:v=>record('palette',v),setAxes:v=>record('axes',v),setFold:v=>record('fold',v),
  stop:()=>record('stop'),lighting:()=>record('lighting'),rememberDisplayControl:()=>record('remember'),
  program:{invalidate:()=>record('invalidate')},createRatRigGcodePreview:()=>({kind:'fixture-gcode'}),
  sync:()=>record('sync'),captureRatRigConfiguration:()=>({camera:snap(runtime.camera,runtime.controls)})};
 return {ctx,calls,elements,grid,current,release:()=>{assert(release,'No installation await to release');release();}};
}
function compile(source,family,ctx){return new Function(...Object.keys(ctx),'let state,animation="running";return ('+extract(source,family)+');')(...Object.values(ctx));}
for(const family of families){
 const candidate=await fs.readFile(new URL('../site/viewer/'+familyPaths[family],import.meta.url),'utf8');
 const body=extract(candidate,family);assert.equal(body.split('settleCameraPose(camera,controls)').length,2,'Restore must settle the public controls');
 // A local mutation of this exact body reproduces the old pending-input defect.
 const base=candidate.replace(body,body.replace('settleCameraPose(camera,controls)','camera.lookAt(controls.target);controls.update()'));
 const sources={base,candidate};
 for(const [width,height] of [[1000,600],[390,844]])for(const up of [[0,1,0],[0,0,-1]]){
  const results={};
  for(const mode of ['base','candidate']){
   const runtime=setup(width,height),env=environment(family,runtime),restore=compile(sources[mode],family,env.ctx),savedA=savedData(family,up,'A');
   const expectedCamera=()=>savedA.camera??savedA.view.camera;
   runtime.gesture();await restore(savedA);
   const afterRestore=metrics(runtime.camera,runtime.controls,expectedCamera());
   for(let i=0;i<180;i++)runtime.controls.update();
   const afterTicks=metrics(runtime.camera,runtime.controls,expectedCamera());
   if(mode==='base')assert(!stable(afterRestore)||!stable(afterTicks),'Historical consumer did not reproduce the pending input defect');
   else{
    assert(stable(afterRestore)&&stable(afterTicks),'Candidate restore drifted');
    const savedB=savedData(family,up,'B');runtime.gesture();await restore(savedB);for(let i=0;i<180;i++)runtime.controls.update();assert(stable(metrics(runtime.camera,runtime.controls,savedB.camera??savedB.view.camera)));
    runtime.gesture();await restore(structuredClone(savedA));for(let i=0;i<180;i++)runtime.controls.update();assert(stable(metrics(runtime.camera,runtime.controls,expectedCamera())),'A-B-A camera restoration failed');
    assert.equal(runtime.controls.enableDamping,true);assert.equal(runtime.controls.autoRotate,false);
    assert.equal(runtime.camera.zoom,1.3);assert.equal(runtime.camera.aspect,width/height);
    assert.deepEqual(runtime.camera.view,{enabled:true,fullWidth:width,fullHeight:height,offsetX:12,offsetY:-8,width,height});
    assert.equal(env.grid.visible,true);assert.equal(env.calls.filter(row=>row.name==='remember').length,3);
    assert(env.calls.some(row=>row.name===(family==='community'?'axes':family==='positron'?'fold':'rig')),'Assembly state side effects lost');
   }
   results[mode]={afterRestore,after180Ticks:afterTicks};runtime.controls.dispose();
  }
  cases.push({family,width,height,up,results});
 }
 // Existing invalid-input validators run before any camera or assembly changes.
 for(const kind of ['wrong-schema','nonfinite-camera','wrong-machine']){
  const runtime=setup(1000,600),env=environment(family,runtime),restore=compile(sources.candidate,family,env.ctx),data=savedData(family),before=snap(runtime.camera,runtime.controls);
  if(kind==='wrong-schema')data.schema='obsolete';else if(kind==='wrong-machine')data.machine='other';else(data.camera??data.view.camera).position[0]=NaN;
  await assert.rejects(async()=>restore(data));assert.deepEqual(snap(runtime.camera,runtime.controls),before);assert.equal(env.calls.filter(row=>row.name!=='invalidate').length,0);
  negative.push({family,kind,rejectedBeforeMutation:true});runtime.controls.dispose();
 }
 if(family==='community'){
  const runtime=setup(390,844),env=environment(family,runtime,{deferred:true}),restore=compile(sources.candidate,family,env.ctx),data=savedData(family),pending=restore(data);
  await Promise.resolve();runtime.gesture();env.release();await pending;for(let i=0;i<180;i++)runtime.controls.update();assert(stable(metrics(runtime.camera,runtime.controls,data.camera)));negative.push({family,kind:'pending-input-during-install-await',stable:true});runtime.controls.dispose();
  const r2=setup(1000,600),e2=environment(family,r2,{stale:true}),before=snap(r2.camera,r2.controls);await compile(sources.candidate,family,e2.ctx)(data);assert.deepEqual(snap(r2.camera,r2.controls),before);assert.equal(e2.calls.filter(row=>row.name!=='install').length,0);negative.push({family,kind:'stale-install-no-camera-write',preserved:true});r2.controls.dispose();
 }
}
console.log(JSON.stringify({passed:true,cases:cases.length,negative:negative.length,scope:'Shipped Community/Positron/RatRig consumer restore bodies, existing validators and real r180 controls; bounded DOM/adapter fixtures, not model/physical fit.'}));
