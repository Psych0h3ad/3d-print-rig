// Execute the unchanged renderer source with actual Three geometry classes.
// WebGL, DOM and loader are controlled CPU fixtures: this is not GPU/model QA.
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
const R=path.dirname(fileURLToPath(import.meta.url));
const option=process.argv.indexOf('--site');
const A=option>=0?path.resolve(process.argv[option+1]):path.resolve(R,'../site');
const input=path.join(A,'layout/layout-renderer.mjs');
const source=fs.readFileSync(input,'utf8');
const intake=fs.mkdtempSync(path.join(os.tmpdir(),'layout-renderer-regression-'));
const snapshot=path.join(intake,'layout-renderer.snapshot.mjs');fs.writeFileSync(snapshot,source,{flag:'wx'});
try {
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,bytes:fs.statSync(p).size,sha256:sha(fs.readFileSync(p))});
const imports=[],renderers=[],observers=[],canvases=[],allControls=[];
let size={width:400,height:300},textureCopyBytes=0,pngRequests=0;
function makeCanvas(){
 const handlers=new Map();
 const c={width:0,height:0,tabIndex:0,style:{},removed:false,setAttribute(){},
  addEventListener(k,f){handlers.set(k,f)},removeEventListener(k){handlers.delete(k)},
  getBoundingClientRect(){return {...size,left:0,top:0}},
  emit(type,event){handlers.get(type)?.({button:0,pointerId:71,preventDefault(){},...event})},
  setPointerCapture(){},hasPointerCapture(){return false},releasePointerCapture(){},remove(){this.removed=true},
  toBlob(f){pngRequests++;f(new Blob(['CPU fixture PNG placeholder'],{type:'image/png'}))},
  getContext(){return {drawImage(){textureCopyBytes+=c.width*c.height*4},
    createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){}}}};
 canvases.push(c);return c;
}
const fixtureDocument={createElement:tag=>{assert.equal(tag,'canvas');return makeCanvas()}};
const raf=f=>setTimeout(()=>f(performance.now()),0);
class ObserverFixture {constructor(fn){this.fn=fn;observers.push(this)}observe(){}disconnect(){this.disconnected=true}}
async function realModule(file){imports.push(pin(file));return {namespace:await import(pathToFileURL(file)),evaluate:async()=>{}}}
const threeMod=await realModule(path.join(A,'viewer/vendor-r180/three.module.js'));
const THREE=threeMod.namespace;
const clonedInstances=[],targets=[],outputMaterials=[],outputGeometries=[];
class TrackedRenderTarget extends THREE.WebGLRenderTarget {
 constructor(...args){super(...args);this.reviewDisposes=0;this.addEventListener('dispose',()=>this.reviewDisposes++);targets.push(this)}
}
class TrackedPlaneGeometry extends THREE.PlaneGeometry {
 constructor(...args){super(...args);this.reviewDisposes=0;this.addEventListener('dispose',()=>this.reviewDisposes++);outputGeometries.push(this)}
}
class TrackedShaderMaterial extends THREE.ShaderMaterial {
 constructor(...args){super(...args);this.reviewDisposes=0;this.addEventListener('dispose',()=>this.reviewDisposes++);outputMaterials.push(this)}
}
class TrackedInstancedMesh extends THREE.InstancedMesh {
 constructor(...args){super(...args);this.reviewDisposeCount=0;this.addEventListener('dispose',()=>this.reviewDisposeCount++);clonedInstances.push(this)}
}
class RendererFixture{
 constructor(){this.domElement=makeCanvas();this.capabilities={maxTextureSize:512};this.autoClear=true;this.target=null;
  this.debug={checkShaderErrors:true,onShaderError:null};
  this.supportedExtensions=new Set(['EXT_color_buffer_float']);this.extensionQueries=[];
  this.extensions={has:name=>{this.extensionQueries.push(name);return this.supportedExtensions.has(name)}};
  this.readbacks=0;this.failStage=null;this.shaderFailures=[];
  this.calls=[];this.disposed=false;this.viewport=[0,0,0,0];this.renderLists={dispose:()=>{}};renderers.push(this)}
 setPixelRatio(){}setSize(w,h){this.domElement.width=w;this.domElement.height=h;this.viewport=[0,0,w,h]}
 getRenderTarget(){return this.target}
 setRenderTarget(t){this.target=t;if(t)this.viewport=[0,0,t.width,t.height]}
 render(scene,camera){
  this.lastScene=scene;
  scene.updateMatrixWorld(true);camera.updateMatrixWorld(true);let transparentDraws=0,fixtureDraws=0;
  scene.traverseVisible(o=>{if(!o.isMesh)return;
   const rows=Array.isArray(o.material)?o.geometry.groups.map(g=>o.material[g.materialIndex]):[o.material];
   for(const m of rows)if(m&&m.visible!==false&&m.opacity!==0){
    if(m.name.startsWith('review-fixture-'))fixtureDraws++;
    if(m.name==='review-fixture-transparent')transparentDraws++;
   }});
  const failureStage=this.target?.texture.type===THREE.UnsignedByteType?'output':transparentDraws?'transparent':fixtureDraws?'opaque':'initial-hdr';
  if(this.target&&this.failStage===failureStage){
   this.failStage=null;
   // Mirrors actual r180 onFirstUse: only failed LINK_STATUS, with debug checking on,
   // calls onShaderError(gl,program,vertexShader,fragmentShader). No real GLSL is compiled here.
   const gl={LINK_STATUS:0x8b82,getProgramParameter:()=>false},program={},vertexShader={},fragmentShader={};
   this.shaderFailures.push({stage:failureStage,checkShaderErrors:this.debug.checkShaderErrors,argumentCount:4});
   if(this.debug.checkShaderErrors&&gl.getProgramParameter(program,gl.LINK_STATUS)===false&&typeof this.debug.onShaderError==='function')
    this.debug.onShaderError(gl,program,vertexShader,fragmentShader);
  }
  this.calls.push({target:this.target?[this.target.width,this.target.height]:null,viewport:[...this.viewport],
    camera:{position:camera.position.toArray(),quaternion:camera.quaternion.toArray(),projection:camera.projectionMatrix.toArray(),matrixWorld:camera.matrixWorld.toArray()},
    walls:(()=>{const a=[];scene.traverse(o=>{if(o.userData.wall)a.push({position:o.position.toArray(),scale:o.scale.toArray(),inward:[...o.userData.inward],visible:o.visible,opacity:o.material.opacity})});return a})(),
    floors:(()=>{const a=[];scene.traverse(o=>{if(o.userData.roomOwned){const p=o.geometry.attributes.position,n=o.geometry.attributes.normal,normal=new THREE.Matrix3().getNormalMatrix(o.matrixWorld);a.push({position:Array.from({length:p.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(p,i).applyMatrix4(o.matrixWorld).toArray()),normal:Array.from({length:n.count},(_,i)=>new THREE.Vector3().fromBufferAttribute(n,i).applyNormalMatrix(normal).toArray()),index:o.geometry.index?Array.from(o.geometry.index.array):Array.from({length:p.count},(_,i)=>i)})}});return a})(),
    wallCopies:(()=>{const a=[];scene.traverseVisible(o=>{if(o.isMesh&&o.geometry.type==='BoxGeometry'&&o.material?.opacity===.45){const p=new THREE.Vector3().setFromMatrixPosition(o.matrixWorld);a.push({position:p.toArray(),matrixWorld:o.matrixWorld.toArray(),opacity:o.material.opacity,sourceWall:!!o.userData.wall})}});return a})(),
    afterDispose:this.disposed,transparentDraws,fixtureDraws,autoClear:this.autoClear,depthBuffer:this.target?.depthBuffer??null,targetType:this.target?.texture.type??null,targetColorSpace:this.target?.texture.colorSpace??null,instances:(()=>{const a=[];scene.traverseVisible(o=>{if(o.isInstancedMesh)a.push({count:o.count,matrixBytes:o.instanceMatrix.array.byteLength,matrixFirst:Array.from(o.instanceMatrix.array.slice(0,16))})});return a})()});
 }
 readRenderTargetPixels(){this.readbacks++}dispose(){this.disposed=true}
}
class PMREMFixture {fromScene(){return {texture:new THREE.Texture(),dispose(){this.texture.dispose()}}}dispose(){}}
class ControlsFixture {
 constructor(camera){this.camera=camera;this.target=new THREE.Vector3();this.enabled=true;this.events=new Map();allControls.push(this)}
 addEventListener(k,f){this.events.set(k,f)}update(){}dispose(){}change(){this.events.get('change')?.()}
}
class EnvironmentFixture extends THREE.Scene {dispose(){}}
const statePath=path.join(A,'layout/layout-state.mjs'),S=await import(pathToFileURL(statePath));imports.push(pin(statePath));
const importLines=source.match(/^import [^\n]+;\r?$/gm);assert.equal(importLines?.length,4,'Renderer dependency boundary changed');
for(const line of importLines)assert(/(?:three\.module\.js|OrbitControls\.js|RoomEnvironment\.js|layout-state\.mjs)(?:\?v=[a-f0-9]{20})?['"];$/u.test(line));
assert.equal(source.split('export function createLayoutRenderer(').length,2);
// Replace imports with controlled API boundaries; execute every product function body unchanged.
const body=source.replace(/^import [^\n]+;\r?\n/gm,'').replace('export function createLayoutRenderer(','function createLayoutRenderer(');
const replacement={...THREE,WebGLRenderer:RendererFixture,PMREMGenerator:PMREMFixture,InstancedMesh:TrackedInstancedMesh,WebGLRenderTarget:TrackedRenderTarget,ShaderMaterial:TrackedShaderMaterial,PlaneGeometry:TrackedPlaneGeometry};
const factory=new Function('THREE','OrbitControls','RoomEnvironment','deriveScene','document','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','ResizeObserver',body+'\nreturn createLayoutRenderer;')(
 replacement,ControlsFixture,EnvironmentFixture,(state,catalog)=>state.derived??S.deriveScene(state,catalog),fixtureDocument,1,raf,clearTimeout,ObserverFixture);
function setup(dimensions={width:400,height:300}){
 size={...dimensions};const container={getBoundingClientRect:()=>({...size}),append(){}};
 const catalog=[{id:'test-machine',dimensionsMm:{width:200,depth:200,height:300}}];
 const api=factory({container,catalog});
 const p={id:'p1',machineId:'test-machine',positionM:{x:1,y:.75,z:2},supportYM:.75,yawRad:Math.PI/2};
 api.setState({room:{polygonMm:[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]],wallHeightMm:2400},
  derived:{furniture:[],printers:[p],surfaces:[]}},null);
 return {api,renderer:renderers.at(-1),observer:observers.at(-1),p};
}
function resource({transparent=false,big=false,texture=false}={}){
 const root=new THREE.Group(),g=new THREE.BufferGeometry();
 g.setAttribute('position',new THREE.Float32BufferAttribute([-1,0,0,1,0,0,0,1,0],3));
 const m=new THREE.MeshStandardMaterial({transparent,opacity:transparent?.4:1});m.name='review-fixture-'+(transparent?'transparent':'opaque');
 if(texture)m.map=new THREE.Texture({width:4096,height:4096});
 const mesh=new THREE.Mesh(g,m);root.add(mesh);
 if(big){const extra=new THREE.BufferGeometry();extra.setAttribute('position',new THREE.BufferAttribute(new Float32Array(7*1024*1024),3));root.add(new THREE.Mesh(extra,m))}
 const r={root,disposes:0,materialIdentityAtDispose:null,dispose(){this.disposes++;this.materialIdentityAtDispose=mesh.material===m;
   root.traverse(o=>{o.geometry?.dispose();for(const mat of Array.isArray(o.material)?o.material:[o.material])mat?.dispose()})}};
 return r;
}
const findings=[],passed=[],observations=[];
{
 const {api,renderer}=setup(),r=resource({transparent:true});
 await api.exportImage({width:320,loadMachine:async()=>r});
 const final=renderer.calls.filter(c=>c.target&&c.transparentDraws>0).at(-1)??{transparentDraws:0};
 assert.equal(r.disposes,1);
 if(final.transparentDraws===0)findings.push({id:'RENDER-TRANSPARENT-SINGLE-MATERIAL',severity:'high',
  evidence:'Actual Three BufferGeometry has no material groups. Renderer always constructs an array material for the cloned transparent mesh; Three projectObject iterates zero groups, so the final transparent mesh has no draw.',
  scope:'Unchanged renderer execution plus real Three geometry/material classes; CPU draw-admission instrumentation, not GPU pixels.'});
 if(final.transparentDraws>0)passed.push('Single-material ungrouped transparent geometry reaches final draw.');
 observations.push({case:'transparent-single-material',final});api.dispose();
}
{
 const {api,renderer}=setup({width:200,height:800}),r=resource();
 const output=await api.exportImage({width:320,loadMachine:async()=>r});
 if(output.width<=renderer.capabilities.maxTextureSize&&output.height<=renderer.capabilities.maxTextureSize)passed.push('Tall output dimensions both within GPU cap.');
 else findings.push({id:'RENDER-TARGET-HEIGHT-UNCAPPED',severity:'high',width:output.width,height:output.height,maxTextureSize:512,
  evidence:'Only target width is capped. A tall mobile container creates height above GPU maxTextureSize and no total pixel-byte admission.'});api.dispose();
}
{
 const {api,renderer,observer}=setup(),r=resource();let finish;
 const promise=api.exportImage({width:320,loadMachine:()=>new Promise(resolve=>finish=resolve)});
 await Promise.resolve();size={width:100,height:100};observer.fn();finish(r);await promise;
 const calls=renderer.calls.filter(c=>c.target&&c.fixtureDraws);
 const viewportBad=calls.some(c=>c.viewport[2]!==c.target[0]||c.viewport[3]!==c.target[1]);
 if(!viewportBad)passed.push('Resize does not corrupt active target viewport.');
 else findings.push({id:'RENDER-RESIZE-CHANGES-ACTIVE-TARGET-VIEWPORT',severity:'high',
  evidence:'ResizeObserver calls renderer.setSize during awaited model load. Three setSize sets viewport; no target/viewport rebind precedes subsequent opaque/transparent passes.',calls});api.dispose();
}
{
 const {api,renderer}=setup(),r=resource();let finish;
 const promise=api.exportImage({width:320,loadMachine:()=>new Promise(resolve=>finish=resolve)});
 await Promise.resolve();api.dispose();finish(r);let stopError=null;try{await promise}catch(e){stopError=e}if(stopError)assert.equal(stopError.name,'AbortError');
 assert.equal(r.disposes,1);
 if(!renderer.calls.some(c=>c.afterDispose&&c.target))passed.push('Disposed renderer does not continue rendering late export.');
 else findings.push({id:'RENDER-DISPOSE-DOES-NOT-CANCEL-INFLIGHT-EXPORT',severity:'medium',
  evidence:'dispose() while awaiting load does not abort the renderer lifetime; late result proceeds to render/export after renderer/environment disposal. Caller must currently abort separately.',
  scope:'Renderer API lifecycle; final app callsite cancellation still needs integration review.'});
}
{
 const {api}=setup(),r=resource({transparent:true,texture:true});textureCopyBytes=0;
 let error=null;try{await api.exportImage({width:320,loadMachine:async()=>r})}catch(e){error=e}
 if(error){assert.equal(error.code,'RENDER_TRANSPARENCY_BUDGET');assert.equal(textureCopyBytes,0);passed.push('Oversize transparent image rejected before copying.')}
 else findings.push({id:'RENDER-TRANSPARENCY-TEXTURES-OUTSIDE-BYTE-CAP',severity:'medium',
  evidence:'24MiB counter covers geometry only; cloned texture/image canvas bytes are uncounted.',
  fixtureCopiedImageBytes:textureCopyBytes,actualCurrent69TextureExposure:'Not yet measured; fixture demonstrates admission gap only.'});api.dispose();
}
{
 const {api}=setup(),r=resource({transparent:true,big:true});
 await assert.rejects(api.exportImage({width:320,loadMachine:async()=>r}),e=>e.code==='RENDER_TRANSPARENCY_BUDGET');
 assert.equal(r.disposes,1);
 observations.push({case:'known-budget-material-restore',result:r.materialIdentityAtDispose?'PASS_RESTORED_BEFORE_DISPOSAL':'REPRODUCED_KNOWN_PARENT_FIX_PENDING'});
 if(r.materialIdentityAtDispose)passed.push('Material identities restored when transparency admission throws.');api.dispose();
}
{
 const {api}=setup(),r=resource(),abort=new AbortController();
 await assert.rejects(api.exportImage({width:320,signal:abort.signal,loadMachine:async()=>{abort.abort();return r}}),e=>e.name==='AbortError');
 assert.equal(r.disposes,1);
 const retry=resource();await api.exportImage({width:320,loadMachine:async()=>retry});assert.equal(retry.disposes,1);
 assert.deepEqual([retry.root.position.x,retry.root.position.y,retry.root.position.z],[1,.75,2]);
 assert.equal(retry.root.rotation.y,Math.PI/2);
 passed.push('Late abort disposes returned normalized root once; following successful export works. Identity placement wrapper gets support height and expected world yaw/position.');api.dispose();
}

{
 const {api}=setup(),r=resource({transparent:true});
 const image={width:128,height:128},texture=new THREE.Texture(image);
 const mesh=r.root.children[0];mesh.material.map=texture;
 await api.exportImage({width:320,loadMachine:async()=>r});
 if(texture.image!==image)findings.push({id:'RENDER-TEXTURE-CLONE-SHARED-SOURCE-MUTATION',severity:'medium',
   evidence:'Three Texture.clone shares Texture.source. Setting clone.image replaces the original texture image as well. The retained panel copy must use a new Source rather than mutate the shared Source data.',
   sourceImageUnchanged:false});
 else passed.push('Owned transparent image copy leaves original Texture.source data unchanged.');
 api.dispose();
}
{
 const {api,renderer}=setup(),r=resource({transparent:true}),old=r.root.children[0];
 r.root.remove(old);
 const instance=new THREE.InstancedMesh(old.geometry,old.material,2);
 const a=new THREE.Matrix4().makeTranslation(.5,1,1.5);instance.setMatrixAt(0,a);
 instance.setMatrixAt(1,new THREE.Matrix4().makeTranslation(-.5,2,-1.5));r.root.add(instance);
 const start=clonedInstances.length;
 await api.exportImage({width:320,loadMachine:async()=>r});
 const clones=clonedInstances.slice(start);assert.equal(clones.length,1);
 assert.equal(clones[0].count,2);assert.deepEqual(Array.from(clones[0].instanceMatrix.array),Array.from(instance.instanceMatrix.array));
 passed.push('Transparent instanced source count and complete instanceMatrix preserved.');
 if(clones.some(o=>o.reviewDisposeCount!==1))findings.push({id:'RENDER-CLONED-INSTANCE-BUFFER-DISPOSE-EVENT-MISSING',severity:'medium',
   evidence:'disposeTree only disposes geometry/materials/textures; retained InstancedMesh.dispose is never called, so Three instance buffer cleanup event is absent.',
   disposeEvents:clones.map(o=>o.reviewDisposeCount)});
 else passed.push('Retained instance buffers receive one dispose event.');
 instance.dispose();api.dispose();
}
{
 const {api}=setup(),r=resource({transparent:true}),old=r.root.children[0];r.root.remove(old);
 const instance=new THREE.InstancedMesh(old.geometry,old.material,400000);r.root.add(instance);
 let error=null;try{await api.exportImage({width:320,loadMachine:async()=>r})}catch(e){error=e}
 if(!error)findings.push({id:'RENDER-INSTANCE-ARRAYS-OUTSIDE-TRANSPARENCY-CAP',severity:'medium',
   evidence:'One transparent triangle with400000 genuine Three instances allocates a25600000-byte clone instanceMatrix outside the24MiB geometry-only admission counter.',
   clonedInstanceMatrixBytes:400000*16*4});
 else{assert.equal(error.code,'RENDER_TRANSPARENCY_BUDGET');passed.push('Instance array bytes included in transparent admission.');}
 instance.dispose();api.dispose();
}
{
 const {api}=setup(),r=resource(),external=new AbortController();let added=0,removed=0;
 const add=external.signal.addEventListener.bind(external.signal),remove=external.signal.removeEventListener.bind(external.signal);
 external.signal.addEventListener=(...a)=>{if(a[0]==='abort')added++;return add(...a)};
 external.signal.removeEventListener=(...a)=>{if(a[0]==='abort')removed++;return remove(...a)};
 await api.exportImage({width:320,signal:external.signal,loadMachine:async()=>r});
 assert.equal(added,1);assert.equal(removed,1);passed.push('External abort forwarding listener removed on success.');api.dispose();
}


{
 const {api,renderer}=setup(),r=resource({transparent:true});
 const startT=targets.length,startM=outputMaterials.length;
 await api.exportImage({width:320,loadMachine:async()=>r});
 const ownTargets=targets.slice(startT),m=outputMaterials.at(-1);
 assert.equal(ownTargets.length,2);assert.equal(outputMaterials.length-startM,1);
 const [hdr,out]=ownTargets;
 assert.equal(hdr.texture.type,THREE.HalfFloatType);assert.equal(hdr.texture.colorSpace,THREE.LinearSRGBColorSpace);
 assert.equal(hdr.depthBuffer,true);assert.equal(hdr.samples,0);
 assert.equal(out.texture.type,THREE.UnsignedByteType);assert.equal(out.texture.colorSpace,THREE.NoColorSpace);
 assert.equal(out.depthBuffer,false);assert.equal(m.toneMapped,false);assert.equal(m.depthTest,false);assert.equal(m.depthWrite,false);
 assert.equal(m.uniforms.map.value,hdr.texture);assert.equal(m.uniforms.toneMappingExposure.value,renderer.toneMappingExposure);
 assert.equal((m.fragmentShader.match(/ACESFilmicToneMapping\(color\.rgb\)/g)||[]).length,1);
 assert.equal((m.fragmentShader.match(/sRGBTransferOETF\(color\)/g)||[]).length,1);
 assert.ok(m.fragmentShader.includes('#include <tonemapping_pars_fragment>'));
 assert.ok(!m.fragmentShader.includes('#include <tonemapping_fragment>'));
 assert.ok(!m.fragmentShader.includes('#include <colorspace_fragment>'));
 assert.ok(THREE.ShaderChunk.tonemapping_pars_fragment.includes('vec3 ACESFilmicToneMapping'));
 assert.ok(THREE.ShaderChunk.colorspace_pars_fragment.includes('vec4 sRGBTransferOETF'));
 const vendor=fs.readFileSync(path.join(A,'viewer/vendor-r180/three.module.js'),'utf8');
 assert.ok(vendor.includes("ShaderChunk[ 'colorspace_pars_fragment' ]"));
 assert.ok(vendor.includes('currentRenderTarget === null || currentRenderTarget.isXRRenderTarget === true'));
 const passes=renderer.calls.filter(c=>c.target),last=passes.at(-1),transparent=passes.filter(c=>c.transparentDraws).at(-1);
 assert.equal(transparent.targetType,THREE.HalfFloatType);assert.equal(transparent.autoClear,false);
 assert.equal(last.targetType,THREE.UnsignedByteType);assert.equal(last.autoClear,true);
 assert.ok(ownTargets.every(t=>t.reviewDisposes===1));assert.equal(m.reviewDisposes,1);
 assert.equal(renderer.getRenderTarget(),null);assert.equal(renderer.autoClear,true);
 passed.push('HDR depth target retained through streamed opaque+transparent passes, then exactly one explicit vendor ACES/OETF output pass to RGBA8 NoColorSpace; both targets and output material disposed. This is source/control-flow evidence, not GLSL compile/pixel proof.');
 observations.push({case:'hdr-output-source-contract',targets:ownTargets.map(t=>({width:t.width,height:t.height,type:t.texture.type,colorSpace:t.texture.colorSpace,depthBuffer:t.depthBuffer,disposes:t.reviewDisposes})),exposure:m.uniforms.toneMappingExposure.value,shaderSha256:sha(m.fragmentShader),GPU:false});
 api.dispose();
}
{
 const {api,renderer}=setup({width:1920,height:1920}),r=resource();renderer.capabilities.maxTextureSize=4096;
 const start=targets.length;await api.exportImage({width:1920,loadMachine:async()=>r});
 const own=targets.slice(start);assert.equal(own.length,2);
 const targetBytes=own.reduce((n,t)=>n+t.width*t.height*(t.texture.type===THREE.HalfFloatType?8:4)+(t.depthBuffer?t.width*t.height*4:0),0);
 assert.equal(targetBytes,1920*1920*16);
 observations.push({case:'target-memory-accounting-square',width:1920,height:1920,targetBytes,targetMiB:targetBytes/2**20,
  formula:'RGBA16F color 8 + standard depth estimate 4 + RGBA8 output 4 = 16 bytes/pixel; excludes readback/ImageData/canvas/environment/loaded model and driver overhead',
  maximumAt2560SquareBytes:2560*2560*16,measuredGPU:false});
 passed.push('Target-byte bound is aspect-dependent: 1920-square is56.25MiB,2560-square100MiB; this does not claim a blanket<47MiB or browser peak measurement.');api.dispose();
}
{
 const {api,renderer}=setup(),r=resource({transparent:true});let finish;let signalAtLoad;
 const initialTargets=targets.length;
 const promise=api.exportImage({width:320,loadMachine:(_id,{signal})=>{signalAtLoad=signal;return new Promise(resolve=>finish=resolve)}});
 await Promise.resolve();api.dispose();assert.equal(signalAtLoad.aborted,true);finish(r);
 await assert.rejects(promise,e=>e.name==='AbortError');assert.equal(r.disposes,1);assert.equal(renderer.disposed,true);
 assert.ok(targets.slice(initialTargets).every(t=>t.reviewDisposes===1));
 assert.ok(!renderer.calls.some(c=>c.afterDispose));passed.push('Internal disposal abort is forwarded to an awaited genuine-loader contract; late resource and HDR target release occur before final renderer cleanup.');
}
{
 const {api}=setup(),r=resource();let finishBlob;
 const external=new AbortController();let removed=0;
 const originalRemove=external.signal.removeEventListener.bind(external.signal);
 external.signal.removeEventListener=(...a)=>{if(a[0]==='abort')removed++;return originalRemove(...a)};
 const oldCreate=fixtureDocument.createElement;
 fixtureDocument.createElement=tag=>{const c=oldCreate(tag);c.toBlob=f=>{finishBlob=f};return c};
 const start=targets.length;
 const promise=api.exportImage({width:320,signal:external.signal,loadMachine:async()=>r});
 for(let i=0;i<100&&!finishBlob;i++)await new Promise(resolve=>setTimeout(resolve,1));
 assert.ok(finishBlob);external.abort();finishBlob(new Blob(['fixture'],{type:'image/png'}));
 await assert.rejects(promise,e=>e.name==='AbortError');fixtureDocument.createElement=oldCreate;
 assert.equal(removed,1);assert.ok(targets.slice(start).every(t=>t.reviewDisposes===1));
 const retry=resource();await api.exportImage({width:320,loadMachine:async()=>retry});assert.equal(retry.disposes,1);
 passed.push('Cancellation while PNG encoding is awaited rejects output, disposes both targets/removes forwarding listener, and subsequent retry succeeds.');api.dispose();
}
{
 const {api,renderer}=setup();
 const polygon=[[0,0],[1200,0],[1200,1200],[800,1200],[800,400],[400,400],[400,1200],[0,1200]];
 const room={polygonMm:polygon,wallHeightMm:2400};
 api.setState({room,derived:{furniture:[],printers:[],surfaces:[]}},null);
 await new Promise(resolve=>setTimeout(resolve,5));
 let grid;renderer.lastScene.traverse(o=>{if(o.isLineSegments&&o.material.opacity===.35)grid=o});
 assert.ok(grid);const a=grid.geometry.attributes.position.array;
 // Same encoded room coordinates as real ShapeGeometry; no arbitrary widened epsilon.
 const encodedPolygon=polygon.map(p=>p.map(v=>Math.fround(v*.001)*1000));
 function insideOrBoundary(x,z){let inside=false;for(let i=0,j=encodedPolygon.length-1;i<encodedPolygon.length;j=i++){
  const A=encodedPolygon[j],B=encodedPolygon[i],cross=(B[0]-A[0])*(z-A[1])-(B[1]-A[1])*(x-A[0]);
  if(Math.abs(cross)<1e-5&&x>=Math.min(A[0],B[0])-1e-5&&x<=Math.max(A[0],B[0])+1e-5&&z>=Math.min(A[1],B[1])-1e-5&&z<=Math.max(A[1],B[1])+1e-5)return true;
  if((A[1]>z)!==(B[1]>z)&&x<(B[0]-A[0])*(z-A[1])/(B[1]-A[1])+A[0])inside=!inside;
 }return inside;}
 let samples=0;for(let i=0;i<a.length;i+=6)for(let k=0;k<=8;k++){
  const t=k/8,x=(a[i]*(1-t)+a[i+3]*t)*1000,z=(a[i+2]*(1-t)+a[i+5]*t)*1000;
  assert.ok(insideOrBoundary(x,z),JSON.stringify({x,z}));samples++;
 }
 assert.ok(samples>0);observations.push({case:'concave-room-grid',segments:a.length/6,samples,polygonMm:polygon,encodedPolygonMm:encodedPolygon});
 passed.push('Grid finite segments remain inside a concave U room, including eight independent samples per segment and the actual Float32 room boundaries; no old infinite grid.');api.dispose();
}


{
 const vendorPath=path.join(A,'viewer/vendor-r180/three.module.js'),vendor=fs.readFileSync(vendorPath,'utf8');
 const required=["has: function ( name )",'return getExtension( name ) !== null;',
  'checkShaderErrors: true,','onShaderError: null',
  'if ( renderer.debug.checkShaderErrors )',
  'gl.getProgramParameter( program, gl.LINK_STATUS ) === false',
  'renderer.debug.onShaderError( gl, program, glVertexShader, glFragmentShader );'];
 for(const text of required)assert.ok(vendor.includes(text),text);
 observations.push({case:'fixture-api-source-binding',vendor:pin(vendorPath),actualAPIs:required,
  scope:'extensions.has returns Boolean; debug defaults/callback arity and failed-link condition match literal pinned r180. Callback failure is injected, not actual GPU compilation.'});
 passed.push('Extension/debug fixture shape and failed-link callback behavior match pinned actual Three r180 source.');
}
{
 const {api,renderer}=setup(),original=()=>{};
 renderer.debug.onShaderError=original;renderer.supportedExtensions.clear();
 const startT=targets.length,startP=pngRequests;let loaderCalls=0;
 await assert.rejects(api.exportImage({width:320,loadMachine:async()=>{loaderCalls++;return resource()}}),e=>e.code==='RENDER_UNSUPPORTED');
 assert.equal(loaderCalls,0);assert.equal(targets.length,startT);assert.equal(pngRequests,startP);assert.equal(renderer.readbacks,0);
 assert.equal(renderer.debug.onShaderError,original);assert.deepEqual(renderer.extensionQueries,['EXT_color_buffer_float']);
 renderer.supportedExtensions.add('EXT_color_buffer_float');const retry=resource();
 await api.exportImage({width:320,loadMachine:async()=>retry});assert.equal(retry.disposes,1);assert.equal(renderer.debug.onShaderError,original);
 observations.push({case:'no-float-color-extension',expectedCode:'RENDER_UNSUPPORTED',loaderCalls,allocatedTargetsBeforeRetry:0,readbacksBeforeRetry:0,retry:'PASS'});
 passed.push('No EXT_color_buffer_float rejects before HDR allocation/load/readback/PNG, leaves original debug handler unchanged and permits later valid retry.');api.dispose();
}
for(const stage of ['initial-hdr','opaque','transparent','output']){
 const {api,renderer}=setup(),r=resource({transparent:true});
 // Add an opaque leaf so the middle phase is distinguishable from the transparent pass.
 const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute([0,0,0,.1,0,0,0,.1,0],3));
 const m=new THREE.MeshStandardMaterial();m.name='review-fixture-opaque';r.root.add(new THREE.Mesh(g,m));
 const cloneDisposes=[];
 r.root.traverse(o=>{if(!o.geometry)return;const realClone=o.geometry.clone.bind(o.geometry);o.geometry.clone=()=>{
  const c=realClone(),record={disposes:0};cloneDisposes.push(record);c.addEventListener('dispose',()=>record.disposes++);return c;
 }});
 let previousCallbackCalls=0;const original=(...args)=>{previousCallbackCalls++;assert.equal(args.length,4)};
 renderer.debug.onShaderError=original;renderer.failStage=stage;
 const external=new AbortController();let added=0,removed=0;
 const add=external.signal.addEventListener.bind(external.signal),remove=external.signal.removeEventListener.bind(external.signal);
 external.signal.addEventListener=(...a)=>{if(a[0]==='abort')added++;return add(...a)};
 external.signal.removeEventListener=(...a)=>{if(a[0]==='abort')removed++;return remove(...a)};
 const startT=targets.length,startM=outputMaterials.length,startG=outputGeometries.length,startP=pngRequests;
 let loaderCalls=0;
 await assert.rejects(api.exportImage({width:320,signal:external.signal,loadMachine:async()=>{loaderCalls++;return r}}),e=>e.code==='RENDER_SHADER_FAILED');
 assert.equal(renderer.shaderFailures.length,1);assert.equal(renderer.shaderFailures[0].stage,stage);
 assert.equal(renderer.shaderFailures[0].checkShaderErrors,true);
 assert.equal(previousCallbackCalls,0);assert.equal(renderer.debug.onShaderError,original);
 assert.equal(renderer.readbacks,0);assert.equal(pngRequests,startP);assert.equal(added,1);assert.equal(removed,1);
 assert.equal(r.disposes,stage==='initial-hdr'?0:1);assert.ok(cloneDisposes.every(c=>c.disposes===1));
 assert.ok(targets.slice(startT).every(t=>t.reviewDisposes===1));
 assert.ok(outputMaterials.slice(startM).every(t=>t.reviewDisposes===1));
 assert.ok(outputGeometries.slice(startG).every(t=>t.reviewDisposes===1));
 assert.equal(renderer.getRenderTarget(),null);assert.equal(renderer.autoClear,true);assert.equal(renderer.disposed,false);
 if(stage!=='initial-hdr')assert.equal(r.materialIdentityAtDispose,true);
 const cleanup={targets:targets.slice(startT).map(t=>t.reviewDisposes),outputMaterials:outputMaterials.slice(startM).map(t=>t.reviewDisposes),outputGeometries:outputGeometries.slice(startG).map(t=>t.reviewDisposes),transparentGeometryClones:cloneDisposes.map(t=>t.disposes)};
 const retry=resource();await api.exportImage({width:320,loadMachine:async()=>retry});
 assert.equal(retry.disposes,1);assert.equal(renderer.debug.onShaderError,original);assert.equal(renderer.readbacks,1);
 observations.push({case:'failed-shader-'+stage,expectedCode:'RENDER_SHADER_FAILED',callbackArguments:4,loaderCalls,activeDisposes:r.disposes,readbackOnFailure:0,PNGRequestsOnFailure:0,originalHandlerRestored:true,externalAbortListenerRemoved:true,cleanup,retry:'PASS',GPU:false});
 passed.push('Injected '+stage+' shader-link failure rejects instead of black PNG; owned targets/material/geometry and active source cleanup, handler/listener restoration and successful retry verified.');api.dispose();
}


// Exact integer XZ half-plane oracle, independent of the renderer's floating dot.
function expectedVisibleWalls(poly,camMm){
 let area=0n;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];area+=BigInt(a[0])*BigInt(b[1])-BigInt(b[0])*BigInt(a[1])}
 assert.notEqual(area,0n);const sign=area>0n?1n:-1n;
 return poly.map((a,i)=>{const b=poly[(i+1)%poly.length],cross=BigInt(b[0]-a[0])*BigInt(camMm[1]-a[1])-BigInt(b[1]-a[1])*BigInt(camMm[0]-a[0]);
  return {key:JSON.stringify([(a[0]+b[0])/2,(a[1]+b[1])/2]),visible:cross*sign>=0n};
 }).sort((a,b)=>a.key.localeCompare(b.key));
}
function actualWallMask(walls){return walls.map(w=>{const len=Math.hypot(...w.inward);return {key:JSON.stringify([Math.round((w.position[0]+w.inward[0]/len*.025)*1000),Math.round((w.position[2]+w.inward[1]/len*.025)*1000)]),visible:w.visible}}).sort((a,b)=>a.key.localeCompare(b.key))}
const cardinalViews=[{name:'east',mm:[6000,0]},{name:'west',mm:[-6000,0]},{name:'south',mm:[0,6000]},{name:'north',mm:[0,-6000]}];
for(const [shape,original]of [
 ['rectangle',[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]]],
 ['concave-L',[[-2000,-1500],[2000,-1500],[2000,0],[0,0],[0,1500],[-2000,1500]]],
]){
 const byWinding=[];
 for(const reversed of [false,true]){
  const poly=reversed?[...original].reverse():original.map(p=>[...p]);
  const {api,renderer,p}=setup({width:400,height:300}),controls=allControls.at(-1);
  api.setState({room:{polygonMm:poly,wallHeightMm:2400},derived:{furniture:[],printers:[p],surfaces:[]}},null);
  const masks=[];
  for(const viewpoint of cardinalViews){
   controls.camera.position.set(viewpoint.mm[0]/1000,3,viewpoint.mm[1]/1000);controls.camera.lookAt(0,1,0);controls.change();
   await new Promise(resolve=>setTimeout(resolve,5));
   const preview=renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1);assert.ok(preview);
   const expected=expectedVisibleWalls(poly,viewpoint.mm),actual=actualWallMask(preview.walls);
   assert.deepEqual(actual,expected);assert.ok(preview.walls.every(w=>w.opacity===.45&&w.inward.every(Number.isFinite)));
   const start=renderer.calls.length,r=resource();
   await api.exportImage({width:320,loadMachine:async()=>r});assert.equal(r.disposes,1);
   const hdr=renderer.calls.slice(start).filter(c=>c.target&&c.targetType===THREE.HalfFloatType);
   assert.ok(hdr.length>=3);for(const call of hdr)assert.deepEqual(call.camera,preview.camera);
   const outputWalls=hdr.at(-1).wallCopies;
   const selected=expected.filter(e=>e.visible).map(e=>e.key).sort();
   const outputKeys=outputWalls.map(w=>{const sourceWall=preview.walls.find(v=>Math.round(v.position[0]*1000)===Math.round(w.position[0]*1000)&&Math.round(v.position[2]*1000)===Math.round(w.position[2]*1000));assert.ok(sourceWall,'Exported wall has no matching actual preview source pose');return actualWallMask([sourceWall])[0].key}).sort();
   assert.deepEqual(outputKeys,selected);
   assert.ok(outputWalls.every(w=>w.opacity===.45&&!w.sourceWall));
   masks.push({view:viewpoint.name,mask:actual,exportedWallCount:outputWalls.length,cameraExact:true});
   observations.push({case:'cutaway-'+shape+'-'+(reversed?'CW':'CCW')+'-'+viewpoint.name,oracle:'Exact integer oriented-edge half-plane',expected,actual,exportedWallCount:outputWalls.length,cameraExact:true});
   passed.push('Cutaway '+shape+'/'+(reversed?'reversed':'original')+'/'+viewpoint.name+' agrees with exact source-edge oracle; preview/export camera arrays and visible wall set match.');
  }
  byWinding.push(masks);api.dispose();
 }
 assert.deepEqual(byWinding[0],byWinding[1]);
 passed.push(shape+' cutaway masks are identical after source polygon winding reversal.');
}
{
 const {api,renderer}=setup(),controls=allControls.at(-1);controls.camera.position.set(6,3,0);controls.camera.lookAt(0,1,0);controls.change();
 await new Promise(resolve=>setTimeout(resolve,5));
 const initial=renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1),mask=actualWallMask(initial.walls);
 api.setOptions({walls:false});await new Promise(resolve=>setTimeout(resolve,5));
 const off=renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1);assert.ok(off.walls.every(w=>!w.visible));
 const start=renderer.calls.length,r=resource();await api.exportImage({width:320,loadMachine:async()=>r});
 const hdr=renderer.calls.slice(start).filter(c=>c.target&&c.targetType===THREE.HalfFloatType);assert.ok(hdr.every(c=>c.wallCopies.length===0));
 await new Promise(resolve=>setTimeout(resolve,5));assert.ok(renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1).walls.every(w=>!w.visible));
 api.setOptions({walls:true});await new Promise(resolve=>setTimeout(resolve,5));
 assert.deepEqual(actualWallMask(renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1).walls),mask);
 passed.push('Walls OFF remains empty in preview/HDR/transparent/export cleanup; ON restores exact camera cutaway mask A-B-A.');api.dispose();
}
{
 const {api,renderer}=setup({width:1920,height:1138}),controls=allControls.at(-1);renderer.capabilities.maxTextureSize=4096;
 controls.camera.position.set(6,4,5);controls.camera.lookAt(0,1,0);controls.change();await new Promise(resolve=>setTimeout(resolve,5));
 const preview=renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1),start=renderer.calls.length,r=resource();
 const output=await api.exportImage({width:1920,loadMachine:async()=>r});assert.equal(output.width,1920);assert.equal(output.height,1138);
 for(const call of renderer.calls.slice(start).filter(c=>c.target&&c.targetType===THREE.HalfFloatType))assert.deepEqual(call.camera,preview.camera);
 const bytes=1920*1138*16;observations.push({case:'fixed-output-aspect',width:1920,height:1138,targetBytesEstimate:bytes,targetMiBEstimate:bytes/2**20,measuredGPU:false,cameraExact:true});
 passed.push('Fixed1920x1138 aspect retains exact preview/export camera; two-target estimate is33.33984375MiB, excluding other allocations.');api.dispose();
}


{
 const geoPath=path.join(A,'layout/layout-geometry.mjs'),geoModule=await realModule(geoPath);await geoModule.evaluate();const G=geoModule.namespace;
 for(const [name,original]of [
  ['rectangle',[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]]],
  ['concave-L',[[-2000,-1500],[2000,-1500],[2000,0],[0,0],[0,1500],[-2000,1500]]],
 ])for(const reversed of [false,true]){
  const poly=reversed?[...original].reverse():original.map(p=>[...p]);
  let area2=0n;for(let i=0;i<poly.length;i++){const a=poly[i],b=poly[(i+1)%poly.length];area2+=BigInt(a[0])*BigInt(b[1])-BigInt(b[0])*BigInt(a[1])}
  const sign=area2>0n?1:-1;
  const {api,renderer,p}=setup();api.setState({room:{polygonMm:poly,wallHeightMm:2400},derived:{furniture:[],printers:[p],surfaces:[]}},null);
  await new Promise(resolve=>setTimeout(resolve,5));const preview=renderer.calls.filter(c=>c.target===null&&c.walls.length).at(-1);
  assert.equal(preview.walls.length,poly.length);const footprints=[];
  for(let i=0;i<poly.length;i++){
   const a=poly[i],b=poly[(i+1)%poly.length],dx=b[0]-a[0],dz=b[1]-a[1],lenMm=Math.hypot(dx,dz),len=lenMm/1000;
   const tangent=[dx/lenMm,dz/lenMm],inward=[-dz*sign/lenMm,dx*sign/lenMm],mid=[(a[0]+b[0])*.0005,(a[1]+b[1])*.0005];
   const expectedCenter=[mid[0]-inward[0]*.025,1.2,mid[1]-inward[1]*.025];
   const wall=preview.walls.find(w=>Math.round(w.position[0]*1000)===Math.round(expectedCenter[0]*1000)&&Math.round(w.position[2]*1000)===Math.round(expectedCenter[2]*1000));
   assert.ok(wall,'Missing physical source-edge wall');assert.deepEqual(Array.from(wall.position),expectedCenter);assert.deepEqual(Array.from(wall.scale),[len,2.4,.05]);
   // Mathematical oriented rectangle from actual center/dimensions and literal edge
   // direction; this room geometry is synthetic, not a native-CAD fit proof.
   const strip=[[-1,-1],[1,-1],[1,1],[-1,1]].map(([along,across])=>[
    (wall.position[0]+along*tangent[0]*wall.scale[0]/2+across*inward[0]*wall.scale[2]/2)*1000,
    (wall.position[2]+along*tangent[1]*wall.scale[0]/2+across*inward[1]*wall.scale[2]/2)*1000]);
   assert.equal(G.polygonsOverlap(poly,strip),false,'50mm wall body intrudes into usable floor polygon');
   const inner=[wall.position[0]+inward[0]*wall.scale[2]/2,wall.position[2]+inward[1]*wall.scale[2]/2];
   assert.deepEqual(inner,mid);footprints.push({edge:i,centerM:wall.position,insideFaceMidM:inner,stripMm:strip,positiveAreaOverlap:false});
  }
  assert.equal(preview.floors.length,1);const floor=preview.floors[0];let area=0;
  assert.ok(floor.normal.every(n=>n[1]===1));
  for(let i=0;i<floor.index.length;i+=3){
   const [a,b,c]=floor.index.slice(i,i+3).map(j=>floor.position[j]);
   const up=(b[2]-a[2])*(c[0]-a[0])-(b[0]-a[0])*(c[2]-a[2]);assert.ok(up>0,'Floor triangle faces down/zero');area+=up/2;
   assert.equal(G.polygonContains(poly,[a,b,c].map(p=>[p[0]*1000,p[2]*1000])),true,'Floor triangle leaves literal usable polygon');
  }
  const expectedArea=Number(area2<0n?-area2:area2)/2/1e6;assert.equal(area,expectedArea);
  observations.push({case:'clear-floor-outward-wall-'+name+'-'+(reversed?'CW':'CCW'),literalRoomPolygonMm:poly,wallShiftOutwardMm:25,wallThicknessMm:50,footprints,
   floorTriangles:floor.index.length/3,floorAreaM2:area,expectedAreaM2:expectedArea,allFloorNormalsUp:true,unchangedUsableRoomPolygon:true});
  passed.push(name+'/'+(reversed?'reversed':'original')+' 50mm wall bodies stay outside clear room polygon with inner face on boundary; actual floor triangles cover exact area with upward normals and stay inside concave outline.');api.dispose();
 }
}


// Exercise the unchanged handlers with actual Three raycasting/plane intersections.
// Events are CPU DOM fixtures, not browser-trusted pointer input or GPU evidence.
const near=(a,b,label)=>assert.ok(Math.abs(a-b)<1e-12,label+': '+a+' != '+b);
for(const rebuildOnSelect of [false,true])for(const ending of ['pointercancel','lostpointercapture','pointerup']){
 size={width:800,height:600};
 const catalog=[{id:'test-machine',widthMm:200,depthMm:200,heightMm:300,dimensionsMm:{width:200,depth:200,height:300}}];
 const desk=S.createDesk({id:'desk',widthMm:1600,depthMm:900,heightMm:750,pose:{xMm:100,zMm:-200,yawDeg:90}});
 const shelf=S.createShelf({id:'shelf',pose:{xMm:-2000,zMm:0,yawDeg:0}});
 const printer=(id,parentId,surfaceId,xMm,zMm)=>({id,machineId:'test-machine',configurationId:null,attachment:{parentId,surfaceId,xMm,zMm,yawDeg:15}});
 let current=S.createDefaultLayout({furniture:[desk,shelf],printers:[printer('child1','desk','top',100,50),printer('child2','desk','top',-200,100),printer('free',null,'floor',2000,1000),printer('shelfchild','shelf','level-1',0,0)]},catalog);
 const initial=S.serializeLayout(current,catalog),commits=[],selections=[];
 let api;api=factory({container:{getBoundingClientRect:()=>({...size}),append(){}},catalog,
  onSelect:id=>{selections.push(id);if(rebuildOnSelect)api.setState(current,id)},
  onMove:move=>{commits.push(move);const old=current.furniture.find(f=>f.id===move.id);current=S.applyAction(current,{type:'UPDATE_FURNITURE',id:move.id,patch:{pose:{...old.pose,xMm:move.x,zMm:move.z}}},catalog);api.setState(current,move.id)}});
 api.setState(current,null);api.setTool('move');const renderer=renderers.at(-1),controls=allControls.at(-1);
 controls.camera.position.set(4,5,6);controls.camera.lookAt(0,.5,0);controls.change();await new Promise(r=>setTimeout(r,5));
 const active=()=>{const map=new Map();renderer.lastScene.traverse(o=>{if(o.userData.entityId)map.set(o.userData.entityId,o)});return map};
 const old=active(),origins=new Map([...old].map(([id,o])=>[id,{position:o.position.toArray(),yaw:o.rotation.y}]));
 const point=new THREE.Vector3(.4,.75,-.8).project(controls.camera);
 const down={clientX:(point.x+1)/2*800,clientY:(1-point.y)/2*600};
 api.canvas.emit('pointerdown',down);assert.deepEqual(selections,['desk']);
 const now=active();for(const id of origins.keys())assert.equal(now.get(id)===old.get(id),!rebuildOnSelect);
 api.canvas.emit('pointermove',{clientX:down.clientX+100,clientY:down.clientY-25});await new Promise(r=>setTimeout(r,5));
 const moved=active(),delta=[moved.get('desk').position.x-origins.get('desk').position[0],moved.get('desk').position.z-origins.get('desk').position[2]];
 assert.ok(Math.hypot(...delta)>.01);assert.equal(commits.length,0);
 for(const id of ['child1','child2']){const a=moved.get(id),b=origins.get(id);near(a.position.x-b.position[0],delta[0],id+' mid-drag X');near(a.position.z-b.position[2],delta[1],id+' mid-drag Z');assert.equal(a.position.y,b.position[1]);assert.equal(a.rotation.y,b.yaw)}
 for(const id of ['free','shelfchild','shelf'])assert.deepEqual(moved.get(id).position.toArray(),origins.get(id).position);
 if(rebuildOnSelect)for(const [id,o]of old)assert.deepEqual(o.position.toArray(),origins.get(id).position,'Detached old selection group changed');
 api.canvas.emit(ending,{clientX:down.clientX+100,clientY:down.clientY-25});await new Promise(r=>setTimeout(r,5));
 if(ending==='pointerup'){
  assert.equal(commits.length,1);assert.equal(commits[0].id,'desk');
  const derived=S.deriveScene(current,catalog);for(const e of [...derived.furniture,...derived.printers]){const o=active().get(e.id);near(o.position.x,e.positionM.x,e.id+' committed X');near(o.position.z,e.positionM.z,e.id+' committed Z');near(o.position.y,e.positionM.y,e.id+' committed Y')}
  const saved=S.serializeLayout(current,catalog);assert.equal(S.serializeLayout(S.parseLayout(saved,catalog),catalog),saved);
 }else{assert.equal(commits.length,0);assert.equal(S.serializeLayout(current,catalog),initial);for(const [id,o]of active())assert.deepEqual(o.position.toArray(),origins.get(id).position)}
 current=S.parseLayout(initial,catalog);api.setState(current,null);await new Promise(r=>setTimeout(r,5));for(const [id,o]of active())assert.deepEqual(o.position.toArray(),origins.get(id).position);
 passed.push('Real raycast/plane handlers: rotated furniture two followers move live, preserve support/yaw, exclude other parents; '+ending+'; selection rebuild='+rebuildOnSelect+'; commit/cancel/reset and JSON checked.');
 observations.push({case:'furniture-follow-'+ending+'-rebuild-'+rebuildOnSelect,deltaM:delta,followers:2,commits:commits.length,oldGroupsUnchanged:rebuildOnSelect,trustedBrowserEvent:false});api.dispose();
}

{
 const {api}=setup(),events=[];const room={polygonMm:[[-2000,-1500],[2000,-1500],[2000,1500],[-2000,1500]],wallHeightMm:2400};
 const printers=Array.from({length:3},(_,i)=>({id:'progress-'+i,machineId:'test-machine',positionM:{x:i,y:0,z:0},supportYM:0,yawRad:0}));
 api.setState({room,derived:{furniture:[],printers,surfaces:[]}},null);
 const details=[
  {total:12345678,index:999,phase:'download',machineId:'wrong',loaded:1234567,received:1234567},
  {total:12345678,index:999,phase:'download',loaded:6172839,received:4938272},
  {total:12345678,index:999,phase:'download',loaded:12345678,received:6172839},
 ];
 let calls=0;const resources=[];
 await api.exportImage({width:320,onProgress:e=>events.push({...e}),loadMachine:async(id,{onProgress})=>{assert.equal(id,'test-machine');calls++;for(const d of details)onProgress(d);const r=resource();resources.push(r);return r}});
 assert.equal(calls,3);assert.ok(resources.every(r=>r.disposes===1));
 let last=-Infinity;for(const e of events){assert.equal(e.total,3);assert.ok(e.index>=0&&e.index<=3);assert.equal(e.machineId,'test-machine');assert.ok(['loading','rendering'].includes(e.phase));assert.ok(e.ratio>=0&&e.ratio<=1);const progress=(e.index+(e.phase==='loading'?e.ratio:0))/e.total;assert.ok(progress>=last,'Overall progress moved backwards');last=progress}
 assert.equal(last,1);assert.equal(events.filter(e=>e.received!==undefined).length,9);
 for(let i=0;i<3;i++){const download=events.filter(e=>e.index===i&&e.received!==undefined);assert.equal(download.length,3);for(let j=0;j<3;j++)assert.equal(download[j].ratio,details[j].loaded/details[j].total)}
 observations.push({case:'reserved-progress-fields-exact-model-progress-event',events,overallFinal:last,hasLengthComputable:false});passed.push('Exact {loaded,total,received} byte events cannot override printer total/index/phase/machineId; three printers overall progress is monotonic and ends at 1.');api.dispose();
}
for(const [kind,detail,expected]of [['ratio',{ratio:.25,total:999,index:999,phase:'download'},.25],['percent',{percent:75,total:999,index:999,phase:'download'},.75]]){
 const {api}=setup(),events=[];await api.exportImage({width:320,onProgress:e=>events.push({...e}),loadMachine:async(id,{onProgress})=>{onProgress(detail);return resource()}});
 const e=events[1];assert.equal(e.ratio,expected);assert.equal(e.total,1);assert.equal(e.index,0);assert.equal(e.phase,'loading');assert.equal(e.machineId,'test-machine');passed.push('Progress '+kind+' normalization preserves reserved printer identity fields.');api.dispose();
}

const ownerSourceStillMatchesSnapshot=sha(fs.readFileSync(input))===sha(Buffer.from(source));
assert.equal(ownerSourceStillMatchesSnapshot,true,'Renderer changed during source regression');
assert.deepEqual(findings,[],'Renderer contract regression findings');
console.log(JSON.stringify({status:'PASS',scope:'Real Three geometry/raycast and unchanged renderer bodies; DOM/WebGL/loaders are fixtures. No models, trusted browser events, GPU pixels or native fit.',cases:passed.length,rendererSHA256:sha(Buffer.from(source)),stateSHA256:pin(statePath).sha256,findings:0}));
} finally {
 const resolvedIntake=path.resolve(intake),resolvedTemp=path.resolve(os.tmpdir());
 assert.ok(resolvedIntake.startsWith(resolvedTemp+path.sep)&&path.basename(resolvedIntake).startsWith('layout-renderer-regression-'),'Temporary fixture path escaped its intended directory');
 fs.rmSync(resolvedIntake,{recursive:true,force:true});
}
