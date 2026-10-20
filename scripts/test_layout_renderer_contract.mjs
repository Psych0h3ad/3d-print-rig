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
const tmpOption=process.argv.indexOf('--tmp-root'),fixtureTempRoot=tmpOption<0?os.tmpdir():path.resolve(process.argv[tmpOption+1]);fs.mkdirSync(fixtureTempRoot,{recursive:true});
const intake=fs.mkdtempSync(path.join(fixtureTempRoot,'layout-renderer-regression-'));
const snapshot=path.join(intake,'layout-renderer.snapshot.mjs');fs.writeFileSync(snapshot,source,{flag:'wx'});
try {
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const pin=p=>({path:p,bytes:fs.statSync(p).size,sha256:sha(fs.readFileSync(p))});
const imports=[],renderers=[],observers=[],canvases=[],allControls=[];
let size={width:400,height:300},textureCopyBytes=0,pngRequests=0,deferPNG=false,pendingPNG=[];
function makeCanvas(){
 const handlers=new Map(),captured=new Set(),draws=[],windowHandlers=new Map();const context={
  drawImage(){textureCopyBytes+=c.width*c.height*4},createImageData(w,h){return {data:new Uint8ClampedArray(w*h*4)}},putImageData(){},
  fillRect(...a){draws.push(['fillRect',...a])},fillText(...a){draws.push(['fillText',...a])},beginPath(){draws.push(['beginPath'])},closePath(){draws.push(['closePath'])},moveTo(...a){draws.push(['moveTo',...a])},lineTo(...a){draws.push(['lineTo',...a])},fill(){draws.push(['fill'])},stroke(){draws.push(['stroke'])},save(){},restore(){},clip(){}};
 const capture=o=>o===true||!!o?.capture;
 const c={width:0,height:0,tabIndex:0,style:{},removed:false,setAttribute(){},
  addEventListener(k,f,o){const list=handlers.get(k)||[];if(!list.some(r=>r.f===f&&r.capture===capture(o)))list.push({f,capture:capture(o)});handlers.set(k,list)},removeEventListener(k,f,o){handlers.set(k,(handlers.get(k)||[]).filter(r=>r.f!==f||r.capture!==capture(o)))},
  getBoundingClientRect(){return {...size,left:0,top:0}},
  get clientWidth(){return size.width},get clientHeight(){return size.height},getRootNode(){return {addEventListener(){},removeEventListener(){}}},
  emit(type,event={}){let stopped=false;const e={type,button:0,buttons:1,pointerId:71,pointerType:'mouse',isPrimary:true,preventDefault(){},stopPropagation(){},stopImmediatePropagation(){stopped=true},...event};e.pageX??=e.clientX;e.pageY??=e.clientY;for(const r of [...(handlers.get(type)||[])].sort((a,b)=>Number(b.capture)-Number(a.capture))){if(stopped)break;r.f(e)}return e},
  setPointerCapture(id){captured.add(id)},hasPointerCapture(id){return captured.has(id)},releasePointerCapture(id){if(captured.delete(id))c.emit('lostpointercapture',{pointerId:id})},remove(){this.removed=true},
  reviewDraws:draws,reviewHandlers:handlers,
  ownerDocument:{defaultView:{addEventListener(k,f){windowHandlers.set(k,f)},removeEventListener(k,f){if(windowHandlers.get(k)===f)windowHandlers.delete(k)}}},reviewBlur(){windowHandlers.get('blur')?.({type:'blur'})},reviewWindowHandlers:windowHandlers,
  toBlob(f){pngRequests++;const done=()=>f(new Blob(['CPU fixture PNG placeholder'],{type:'image/png'}));if(deferPNG)pendingPNG.push(done);else done()},
  getContext(){return context}};
 canvases.push(c);return c;
}
// Contextual controls use normal DOM nodes. Measurements are controlled fixture
// inputs, never a claim about browser CSS layout, SVG pixels or trusted events.
function makeDOMNode(tag){
 const handlers=new Map(),attrs=new Map(),captured=new Set();
 const n={tagName:String(tag).toUpperCase(),style:{},dataset:{},children:[],parentNode:null,hidden:false,disabled:false,className:'',id:'',textContent:'',innerHTML:'',reviewHandlers:handlers,reviewRect:null,
  append(...items){for(const item of items){item.remove?.();item.parentNode=this;this.children.push(item)}},appendChild(item){this.append(item);return item},
  replaceChildren(...items){for(const child of this.children)child.parentNode=null;this.children=[];this.append(...items)},
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(c=>c!==this);this.parentNode=null}this.removed=true},
  setAttribute(key,value){value=String(value);attrs.set(key,value);if(key==='id')this.id=value;if(key==='class')this.className=value;if(key.startsWith('data-'))this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value},
  getAttribute(key){if(key==='id')return this.id||null;if(key==='class')return this.className||null;if(key.startsWith('data-'))return this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]??null;return attrs.get(key)??null},
  removeAttribute(key){attrs.delete(key);if(key==='id')this.id='';if(key==='class')this.className='';if(key.startsWith('data-'))delete this.dataset[key.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]},
  addEventListener(type,fn,option){const capture=option===true||!!option?.capture,list=handlers.get(type)||[];if(!list.some(r=>r.fn===fn&&r.capture===capture))list.push({fn,capture,once:!!option?.once});handlers.set(type,list)},
  removeEventListener(type,fn,option){const capture=option===true||!!option?.capture;handlers.set(type,(handlers.get(type)||[]).filter(r=>r.fn!==fn||r.capture!==capture))},
  emit(type,detail={}){
   let stopped=false,immediate=false;const event={type,target:this,currentTarget:null,bubbles:true,button:0,buttons:1,pointerId:71,pointerType:'mouse',isPrimary:true,shiftKey:false,ctrlKey:false,altKey:false,metaKey:false,defaultPrevented:false,
    preventDefault(){this.defaultPrevented=true},stopPropagation(){stopped=true},stopImmediatePropagation(){stopped=true;immediate=true},...detail};
   const ancestors=[];for(let p=this.parentNode;p;p=p.parentNode)ancestors.push(p);
   const invoke=(node,capture)=>{event.currentTarget=node;for(const row of [...(node.reviewHandlers?.get(type)||[])]){if(row.capture!==capture)continue;row.fn(event);if(row.once)node.removeEventListener(type,row.fn,capture);if(immediate)break}};
   for(const p of [...ancestors].reverse()){invoke(p,true);if(stopped)return event}invoke(this,true);if(!immediate)invoke(this,false);
   if(event.bubbles&&!stopped)for(const p of ancestors){invoke(p,false);if(stopped)break}event.currentTarget=null;return event;
  },
  click(){if(!this.disabled)this.emit('click')},focus(){fixtureDocument.activeElement=this},blur(){if(fixtureDocument.activeElement===this)fixtureDocument.activeElement=null;this.emit('blur',{bubbles:false})},
  setPointerCapture(id){captured.add(id)},hasPointerCapture(id){return captured.has(id)},releasePointerCapture(id){if(captured.delete(id))this.emit('lostpointercapture',{pointerId:id})},
  contains(other){return this===other||this.children.some(c=>c.contains?.(other))},
  matches(selector){
   if(selector.startsWith('#'))return this.id===selector.slice(1);
   if(selector.startsWith('.'))return this.className.split(/\s+/).includes(selector.slice(1));
   const attr=selector.match(/^(?:([\w-]+))?\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);if(attr)return (!attr[1]||this.tagName===attr[1].toUpperCase())&&(attr[3]===undefined?this.getAttribute(attr[2])!==null:this.getAttribute(attr[2])===attr[3]);
   return this.tagName===selector.toUpperCase();
  },
  querySelectorAll(selector){const result=[],selectors=selector.split(',').map(x=>x.trim()),walk=node=>{for(const child of node.children||[]){if(selectors.some(s=>child.matches?.(s)))result.push(child);walk(child)}};walk(this);return result},querySelector(selector){return this.querySelectorAll(selector)[0]||null},
  getBoundingClientRect(){const r=this.reviewRect||{left:0,top:0,width:0,height:0};return {...r,right:r.left+r.width,bottom:r.top+r.height}},
  get offsetWidth(){return this.getBoundingClientRect().width},get offsetHeight(){return this.getBoundingClientRect().height},get clientWidth(){return this.offsetWidth},get clientHeight(){return this.offsetHeight}
 };
 n.classList={contains:name=>n.className.split(/\s+/).includes(name),add:(...names)=>{n.className=[...new Set([...n.className.split(/\s+/).filter(Boolean),...names])].join(' ')},remove:(...names)=>{n.className=n.className.split(/\s+/).filter(x=>!names.includes(x)).join(' ')},toggle:(name,force)=>{const enabled=force??!n.classList.contains(name);n.classList[enabled?'add':'remove'](name);return enabled}};
 Object.defineProperty(n,'ownerDocument',{get:()=>fixtureDocument});return n;
}
const fixtureDocument={activeElement:null,createElement:tag=>tag==='canvas'?makeCanvas():makeDOMNode(tag),createElementNS:(namespace,tag)=>makeDOMNode(tag)};
function makeContainer(){const n=makeDOMNode('div');n.getBoundingClientRect=()=>({...size,left:0,top:0,right:size.width,bottom:size.height});return n;}
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
  this.lastScene=scene;this.lastCamera=camera;
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
 size={...dimensions};const container=makeContainer();
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
 let api;api=factory({container:makeContainer(),catalog,
  onSelect:id=>{selections.push(id);if(rebuildOnSelect)api.setState(current,id)},
  onMove:move=>{commits.push(move);const old=current.furniture.find(f=>f.id===move.id);current=S.applyAction(current,{type:'UPDATE_FURNITURE',id:move.id,patch:{pose:{...old.pose,xMm:move.x,zMm:move.z}}},catalog);api.setState(current,move.id)}});
 api.setState(current,null);api.setTool('move');const renderer=renderers.at(-1),controls=allControls.at(-1);
 controls.camera.position.set(4,5,6);controls.camera.lookAt(0,.5,0);controls.change();await new Promise(r=>setTimeout(r,5));
 const active=()=>{const map=new Map();renderer.lastScene.traverse(o=>{if(o.userData.entityId&&!o.userData.planProjection)map.set(o.userData.entityId,o)});return map};
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

// New direct-operation cases use the same source body and actual vendored controls.
const orbitPath=path.join(A,'viewer/vendor-r180/OrbitControls.js'),orbitRaw=fs.readFileSync(orbitPath,'utf8');imports.push(pin(orbitPath));
const orbitToken="from 'three';";assert.equal(orbitRaw.split(orbitToken).length,2,'Vendored controls import-map boundary changed');
// Browser import maps bind bare `three` to this exact vendored module. Apply
// that one module-specifier mapping in Node; all control function bodies remain exact.
const orbitSnapshot=path.join(intake,'OrbitControls.import-map.snapshot.mjs');
fs.writeFileSync(orbitSnapshot,orbitRaw.replace(orbitToken,`from '${pathToFileURL(path.join(A,'viewer/vendor-r180/three.module.js')).href}';`),{flag:'wx'});
const orbitModule=await import(pathToFileURL(orbitSnapshot));
const factoryRealOrbit=new Function('THREE','OrbitControls','RoomEnvironment','deriveScene','document','devicePixelRatio','requestAnimationFrame','cancelAnimationFrame','ResizeObserver',body+'\nreturn createLayoutRenderer;')(
 replacement,orbitModule.OrbitControls,EnvironmentFixture,(state,catalog)=>state.derived??S.deriveScene(state,catalog),fixtureDocument,1,raf,clearTimeout,ObserverFixture);
const settled=()=>new Promise(resolve=>setTimeout(resolve,5));
function operationSetup(realOrbit=false,options={}){
 size={width:800,height:600};const catalog=[{id:'test-machine',label:'Test printer',widthMm:200,depthMm:180,heightMm:300,dimensionsMm:{width:200,depth:180,height:300}}];
 let state=S.createDefaultLayout({furniture:[S.createDesk({id:'desk',widthMm:1200,depthMm:700,heightMm:750})],printers:[{id:'child',machineId:'test-machine',configurationId:null,attachment:{parentId:'desk',surfaceId:'top',xMm:0,zMm:0,yawDeg:0}}]},catalog);
 const commits=[],rotationCommits=[],selections=[],views=[],errors=[];let api;const container=makeContainer();
 api=(realOrbit?factoryRealOrbit:factory)({container,catalog,
  onSelect:id=>{selections.push(id);api.setState(state,id)},onViewChange:e=>views.push(e),onError:e=>errors.push(e),constrainMove:options.constrainMove,constrainRotate:options.constrainRotate,
   onRotate:r=>{rotationCommits.push({...r});if(options.rejectRotate)return false;const furniture=state.furniture.find(f=>f.id===r.id),printer=state.printers.find(p=>p.id===r.id);if(furniture)state=S.applyAction(state,{type:'UPDATE_FURNITURE',id:r.id,patch:{pose:{yawDeg:r.yawDeg}}},catalog);else if(printer){const parent=state.furniture.find(f=>f.id===printer.attachment.parentId);state=S.applyAction(state,{type:'UPDATE_PRINTER',id:r.id,patch:{attachment:{yawDeg:r.yawDeg-(parent?.pose.yawDeg||0)}}},catalog)}else assert.fail('Unknown rotation callback entity');api.setState(state,r.id);return true;},
  onMove:m=>{commits.push(m);if(options.rejectMove)return false;if(m.id==='desk')state=S.applyAction(state,{type:'UPDATE_FURNITURE',id:m.id,patch:{pose:{xMm:m.x,zMm:m.z}}},catalog);api.setState(state,m.id)}});
 const renderer=renderers.at(-1),observer=observers.at(-1);api.setState(state,null);
 const nodes=plan=>{const out=new Map();renderer.lastScene.traverse(o=>{if(o.userData.entityId&&!!o.userData.planProjection===plan)out.set(o.userData.entityId,o)});return out};
 return {api,renderer,observer,container,catalog,commits,rotationCommits,selections,views,errors,nodes,state:()=>state};
}
const screen=(v,camera)=>{camera.updateMatrixWorld(true);const p=v.clone().project(camera);return {clientX:(p.x+1)*size.width/2,clientY:(1-p.y)*size.height/2}};
const cameraSnapshot=c=>({position:c.position.toArray(),quaternion:c.quaternion.toArray(),zoom:c.zoom});
{
 const x=operationSetup();assert.deepEqual(x.views,[],'No callback during constructor');assert.deepEqual(x.api.getView(),{mode:'perspective',projection:'perspective-3d'});
 const stateJSON=S.serializeLayout(x.state(),x.catalog);x.api.view('perspective');await settled();const c3=x.renderer.lastCamera;
 c3.position.set(5,4,7);c3.lookAt(0,.6,0);const before=cameraSnapshot(c3);
 x.api.view('top');await settled();const camera=x.renderer.lastCamera;assert.equal(camera.isOrthographicCamera,true);assert.equal(camera.isPerspectiveCamera,undefined);
 assert.deepEqual(x.views.at(-1),{mode:'top',projection:'orthographic-floorplan'});
 const center=screen(new THREE.Vector3(0,0,0),camera),right=screen(new THREE.Vector3(.1,0,0),camera),down=screen(new THREE.Vector3(0,0,.1),camera);
 assert.ok(right.clientX>center.clientX);near(right.clientY,center.clientY,'+X no screenY');assert.ok(down.clientY>center.clientY);near(down.clientX,center.clientX,'+Z no screenX');
 for(const height of [0,.75,1.8]){const p=screen(new THREE.Vector3(.2,height,.3),camera),floor=screen(new THREE.Vector3(.2,0,.3),camera);near(p.clientX,floor.clientX,'height-invariantX');near(p.clientY,floor.clientY,'height-invariantZ')}
 for(const g of x.nodes(true).values()){assert.ok(g.position.y<.01);assert.equal(g.rotation.y,0);assert.ok(g.children.some(o=>o.userData.planLabel));}
 assert.ok([...x.nodes(false).values()].every(g=>g.parent.visible===false));assert.ok([...x.nodes(true).values()].every(g=>g.parent.visible===true));
 const planControls=allControls.at(-2);assert.equal(planControls.enableRotate,false);assert.equal(planControls.mouseButtons.LEFT,THREE.MOUSE.PAN);assert.equal(planControls.mouseButtons.RIGHT,THREE.MOUSE.PAN);
 camera.zoom=2;planControls.target.x=1;camera.position.x=1;camera.lookAt(planControls.target);const planBefore=cameraSnapshot(camera);
 size={width:500,height:900};x.observer.fn();await settled();near((camera.right-camera.left)/(camera.top-camera.bottom),500/900,'orthographic resize aspect');assert.equal(camera.zoom,2);
 x.api.view('perspective');await settled();assert.equal(x.renderer.lastCamera,c3);assert.deepEqual(cameraSnapshot(c3),before);assert.ok([...x.nodes(false).values()].every(g=>g.parent.visible));assert.ok([...x.nodes(true).values()].every(g=>!g.parent.visible));
 x.api.view('top');await settled();assert.deepEqual(cameraSnapshot(camera),planBefore);x.api.view('fit');await settled();assert.equal(x.api.getView().mode,'top');assert.equal(camera.zoom,1);
 assert.equal(S.serializeLayout(x.state(),x.catalog),stateJSON);assert.equal(x.errors.length,0);x.api.dispose();
 passed.push('Orthographic floorplan +Xright/+Zdown independent of height; flat labeled footprints; resize/fit stay plan; independent3D camera and plan pan/zoom restored with unchanged serialized state.');
}
for(const mode of ['perspective','top']){
 const x=operationSetup();x.api.view(mode);await settled();const c=x.renderer.lastCamera,g=x.nodes(false).get('desk'),origin=g.position.clone();
 const down=screen(new THREE.Vector3(.4,mode==='top'?0:.75,0),c);
 x.api.canvas.emit('pointerdown',down);assert.equal(x.selections.at(-1),'desk');assert.equal(x.api.canvas.hasPointerCapture(71),true);
 x.api.canvas.emit('pointermove',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+2,clientY:down.clientY+1});await settled();assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin.toArray());
 x.api.canvas.emit('pointerdown',{...down,pointerId:72});x.api.canvas.emit('pointercancel',{pointerId:72});x.api.canvas.emit('pointermove',{pointerId:72,clientX:0,clientY:0});
 assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin.toArray());assert.equal(x.commits.length,0);
 x.api.canvas.emit('pointermove',{clientX:down.clientX+60,clientY:down.clientY+10});await settled();assert.ok(x.nodes(false).get('desk').position.distanceTo(origin)>.01);
 x.api.canvas.emit('pointercancel');await settled();assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin.toArray());assert.equal(x.commits.length,0);assert.equal(x.api.canvas.hasPointerCapture(71),false);
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+60,clientY:down.clientY+10});x.api.canvas.emit('pointerup');x.api.canvas.emit('lostpointercapture');await settled();
 assert.equal(x.commits.length,1);const after=S.deriveScene(x.state(),x.catalog);for(const e of [...after.furniture,...after.printers]){const node=x.nodes(false).get(e.id);near(node.position.x,e.positionM.x,'committed '+e.id);near(node.position.z,e.positionM.z,'committed '+e.id)}
 // State replacement during a preview discards stale delta rather than applying it later.
 const before=S.serializeLayout(x.state(),x.catalog),now=x.nodes(false).get('desk').position;
 const newDown=screen(new THREE.Vector3(now.x+.4,mode==='top'?0:.75,now.z),x.renderer.lastCamera);
 x.api.canvas.emit('pointerdown',newDown);x.api.canvas.emit('pointermove',{clientX:newDown.clientX+30,clientY:newDown.clientY});
 x.api.setState(S.parseLayout(before,x.catalog),null);x.api.canvas.emit('pointerup');assert.equal(x.commits.length,1);assert.equal(S.serializeLayout(x.state(),x.catalog),before);
 x.api.dispose();passed.push(mode+' automatic drag: no first-move teleport,4px threshold, exclusivepointer,matching cancellation, one commit, post-upcaptureloss, state-replacement rollback and native support retained.');
}
{
 const x=operationSetup(true);x.api.view('perspective');await settled();let camera=x.renderer.lastCamera;
 const down=screen(new THREE.Vector3(.4,.75,0),camera),start=cameraSnapshot(camera);
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+55,clientY:down.clientY+12});x.api.canvas.emit('pointerup');await settled();assert.equal(x.commits.length,1);assert.deepEqual(cameraSnapshot(camera),start,'Object gesture reached OrbitControls');
 const background={clientX:5,clientY:5};x.api.canvas.emit('pointerdown',background);x.api.canvas.emit('pointermove',{clientX:75,clientY:35});x.api.canvas.emit('pointerup');await settled();assert.notDeepEqual(cameraSnapshot(camera),start,'Background3D orbit absent');assert.equal(x.commits.length,1);
 const rightStart=cameraSnapshot(camera);x.api.canvas.emit('pointerdown',{button:2,buttons:2,clientX:400,clientY:300});x.api.canvas.emit('pointermove',{button:2,buttons:2,clientX:430,clientY:320});x.api.canvas.emit('pointerup',{button:2});await settled();assert.notDeepEqual(camera.position.toArray(),rightStart.position,'Rightpan absent');assert.equal(x.commits.length,1);
 const wheelStart=camera.position.clone();x.api.canvas.emit('wheel',{deltaY:-100,deltaMode:0,clientX:400,clientY:300});await settled();assert.ok(camera.position.distanceTo(wheelStart)>0,'3D wheelzoom absent');
 const saved3D=cameraSnapshot(camera);x.api.view('top');await settled();camera=x.renderer.lastCamera;const basis=camera.quaternion.toArray(),planPos=camera.position.toArray();
 x.api.canvas.emit('pointerdown',background);x.api.canvas.emit('pointermove',{clientX:85,clientY:45});x.api.canvas.emit('pointerup');await settled();assert.notDeepEqual(camera.position.toArray(),planPos);assert.deepEqual(camera.quaternion.toArray(),basis,'Plan background tilted');
 const zoom=camera.zoom;x.api.canvas.emit('wheel',{deltaY:-100,deltaMode:0,clientX:400,clientY:300});await settled();assert.ok(camera.zoom>zoom);assert.deepEqual(camera.quaternion.toArray(),basis);
 const planRight=camera.position.clone();x.api.canvas.emit('pointerdown',{button:2,buttons:2,clientX:400,clientY:300});x.api.canvas.emit('pointermove',{button:2,buttons:2,clientX:430,clientY:310});x.api.canvas.emit('pointerup',{button:2});await settled();assert.ok(camera.position.distanceTo(planRight)>0);assert.deepEqual(camera.quaternion.toArray(),basis);
 x.api.view('perspective');await settled();assert.ok(x.renderer.lastCamera.position.distanceTo(new THREE.Vector3(...saved3D.position))<1e-12);assert.equal(x.commits.length,1);x.api.dispose();
 passed.push('ACTUAL vendored OrbitControls: capture-phase object drag never orbits; background3D orbit/rightpan/wheelzoom; top background/rightpan/wheelzoom keep exact northup basis;3D restore.');
}
{
 const x=operationSetup();x.api.view('top');await settled();let loads=0;const expectedView=x.api.getView(),startTargets=targets.length,events=[];
 const pending=x.api.exportImage({width:320,loadMachine:()=>{loads++;throw Error('Plan requested full model')},onProgress:e=>events.push(e)});
 x.api.view('perspective');assert.deepEqual(x.api.getView(),expectedView,'View changed during plan export');const result=await pending;
 assert.equal(loads,0);assert.equal(targets.length,startTargets);assert.equal(result.projection,'orthographic-floorplan');assert.equal(result.rendering,'flat-floorplan');assert.equal(result.modelDetail,'footprints');assert.ok(result.width<=512&&result.height<=512);assert.deepEqual(events.map(e=>e.mode),['floorplan']);
 const output=canvases.at(-1),labels=output.reviewDraws.filter(r=>r[0]==='fillText');assert.equal(labels.length,0,'Occupied furniture label is suppressed and tiny printer label is hidden at320px output');assert.ok(output.reviewDraws.filter(r=>r[0]==='moveTo'||r[0]==='lineTo').every(r=>r.slice(1).every(Number.isFinite)));
 const abort=new AbortController();abort.abort();await assert.rejects(x.api.exportImage({signal:abort.signal}),e=>e.name==='AbortError');assert.deepEqual(x.api.getView(),expectedView);
 x.api.view('perspective');const r=resource();let finish;const full=x.api.exportImage({loadMachine:()=>new Promise(resolve=>finish=resolve)});await Promise.resolve();x.api.view('top');assert.equal(x.api.getView().projection,'perspective-3d');finish(r);const three=await full;assert.equal(three.projection,'perspective-3d');assert.equal(three.rendering,'streamed-browser-raster');assert.equal(r.disposes,1);x.api.dispose();
 passed.push('Plan export is labeled flat current-camera PNG with zero full-model/HDR-target requests, finite drawing/labels, abort cleanup; direct view switch refused in both2D/3D exports;3D streaming retained.');
}
{
 const x=operationSetup();x.api.view('top');await settled();deferPNG=true;const output=x.api.exportImage();assert.equal(pendingPNG.length,1);x.api.dispose();pendingPNG.shift()();deferPNG=false;await assert.rejects(output,e=>e.name==='AbortError');assert.equal(x.renderer.disposed,true);
 passed.push('Disposal while flat-plan PNG callback is pending aborts output and releases renderer resources once.');
}
for(const ending of ['pointerup','pointercancel']){
 const proposals=[],x=operationSetup(false,{constrainMove:p=>{proposals.push({...p});return {x:Math.min(p.x,150),z:p.z}}});x.api.view('top');await settled();const c=x.renderer.lastCamera;
 const down=screen(new THREE.Vector3(.4,0,0),c),before=S.serializeLayout(x.state(),x.catalog),childOrigin=x.nodes(false).get('child').position.clone();
 x.api.canvas.emit('pointerdown',down);
 for(const dx of [100,160,220]){x.api.canvas.emit('pointermove',{clientX:down.clientX+dx,clientY:down.clientY});await settled();near(x.nodes(false).get('desk').position.x,.15,'constrained live parent');near(x.nodes(false).get('child').position.x-childOrigin.x,.15,'constrained live child');assert.equal(x.commits.length,0);assert.equal(S.serializeLayout(x.state(),x.catalog),before)}
 x.api.canvas.emit(ending);await settled();assert.equal(x.commits.length,ending==='pointerup'?1:0);assert.ok(proposals.length===3&&proposals.every(p=>p.x>150));if(ending==='pointerup')assert.deepEqual(x.commits[0],{id:'desk',x:150,z:0});else assert.equal(S.serializeLayout(x.state(),x.catalog),before);
 x.api.dispose();passed.push('Synchronous constrainMove applies before each parent/child preview; '+ending+' uses accepted boundary pose once or restores all without state/history mutation.');
}
for(const response of [false,{x:NaN,z:0},{x:Infinity,z:0},{x:100,z:0,boundaryLimited:true,pointerRemainder:{x:NaN,z:0}},{x:100,z:0,boundaryLimited:true,pointerRemainder:{x:0,z:Infinity}}]){
 const x=operationSetup(false,{constrainMove:()=>response});x.api.view('top');await settled();const before=S.serializeLayout(x.state(),x.catalog),origin=x.nodes(false).get('desk').position.toArray(),down=screen(new THREE.Vector3(.4,0,0),x.renderer.lastCamera);
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+100,clientY:down.clientY});x.api.canvas.emit('pointerup');assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin);assert.equal(x.commits.length,0);assert.equal(S.serializeLayout(x.state(),x.catalog),before);if(response!==false)assert.equal(x.errors.at(-1).code,'INVALID_CONSTRAINED_MOVE');x.api.dispose();
 passed.push('constrainMove false/nonfinite position or pointer remainder cannot move root, commit history or leak rejected coordinates.');
}
{
 const x=operationSetup(false,{rejectMove:true});x.api.view('top');await settled();const down=screen(new THREE.Vector3(.4,0,0),x.renderer.lastCamera),before=S.serializeLayout(x.state(),x.catalog),origin=x.nodes(false).get('desk').position.toArray();
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+70,clientY:down.clientY});x.api.canvas.emit('pointerup');await settled();assert.equal(x.commits.length,1);assert.equal(S.serializeLayout(x.state(),x.catalog),before);assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin);near(x.nodes(false).get('child').position.x,0,'rejected child restored');x.api.dispose();
 passed.push('onMove false restores transient parent and child to unchanged canonical state; no stale preview after rejected drop.');
}
for(const dimensions of [{width:1200,height:400},{width:400,height:900}]){
 const x=operationSetup();x.api.view('top');await settled();size=dimensions;x.observer.fn();await settled();const camera=x.renderer.lastCamera,before=cameraSnapshot(camera),result=await x.api.exportImage({width:320});
 const projected=camera.clone(),middle=(projected.left+projected.right)/2,half=(projected.top-projected.bottom)*result.width/result.height/2;projected.left=middle-half;projected.right=middle+half;projected.updateProjectionMatrix();projected.updateMatrixWorld(true);
 const p=v=>{const n=v.clone().project(projected);return [(n.x+1)*result.width/2,(1-n.y)*result.height/2]};const base=p(new THREE.Vector3()),dx=p(new THREE.Vector3(.1,0,0)),dz=p(new THREE.Vector3(0,0,.1));near(dx[0]-base[0],dz[1]-base[1],'isometric output pixel scale');
 const first=canvases.at(-1).reviewDraws.find(r=>r[0]==='moveTo'),expected=p(new THREE.Vector3(-2,0,-1.5));near(first[1],expected[0],'current plan exportX');near(first[2],expected[1],'current plan exportZ');assert.deepEqual(cameraSnapshot(camera),before);assert.ok(result.width<=512&&result.height<=512);x.api.dispose();
 passed.push('Flat-plan '+dimensions.width+'x'+dimensions.height+' viewport exports same center/zoom/northup, finite capped PNG with exact uniform X/Z pixel scale after integer-size aspect adjustment.');
}
for(const ending of ['blur','view-change','return-to-grab-point']){
 const x=operationSetup(true);x.api.view('top');await settled();const c=x.renderer.lastCamera,down=screen(new THREE.Vector3(.4,0,0),c),before=S.serializeLayout(x.state(),x.catalog),origin=x.nodes(false).get('desk').position.toArray();
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+60,clientY:down.clientY+10});
 if(ending==='blur')x.api.canvas.reviewBlur();else if(ending==='view-change')x.api.view('perspective');else x.api.canvas.emit('pointermove',down);
 x.api.canvas.emit('pointerup',down);await settled();assert.equal(x.commits.length,0);assert.equal(S.serializeLayout(x.state(),x.catalog),before);assert.deepEqual(x.nodes(false).get('desk').position.toArray(),origin);near(x.nodes(false).get('child').position.x,0,'cancel child');
 x.api.dispose();assert.equal(x.api.canvas.reviewWindowHandlers.size,0);passed.push(ending+' restores exact parent/child canonical positions with no commit and cleans up blur listener; actualOrbit route.');
}
async function labelSetup({roomWidth=6000,depth=800,zoom=1}={}){
 size={width:900,height:600};const catalog=[{id:'label-machine',label:'Printer label',widthMm:800,depthMm:depth,heightMm:1000,dimensionsMm:{width:800,depth,height:1000}}];
 const state=S.createDefaultLayout({room:S.createRoomRect({widthMm:roomWidth,depthMm:roomWidth*2/3}),printers:[-550,550].map((x,i)=>({id:'label-'+i,machineId:'label-machine',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:x,zMm:0,yawDeg:0}}))},catalog);
 const api=factory({container:makeContainer(),catalog});api.setState(state,'label-0');api.view('top');await settled();const renderer=renderers.at(-1),camera=renderer.lastCamera;
 if(zoom!==1){camera.zoom=zoom;camera.updateProjectionMatrix();allControls.at(-2).change();await settled()}
 const groups=[];renderer.lastScene.traverse(g=>{if(g.userData.planProjection)groups.push(g)});
 return {api,renderer,camera,groups,state,catalog};
}
{
 const x=await labelSetup(),intervals=[];
 for(const g of x.groups){const label=g.children.find(o=>o.userData.planLabel),points=g.userData.planPoints,xs=points.map(p=>p[0]),zs=points.map(p=>p[1]);
  assert.equal(label.visible,true);assert.ok(label.scale.x<=(Math.max(...xs)-Math.min(...xs))*.9);assert.ok(label.scale.y<=(Math.max(...zs)-Math.min(...zs))*.9);near(label.scale.x/label.scale.y,8,'Font canvas aspect preserved');
  const a=screen(new THREE.Vector3(-.5,-.5,0).applyMatrix4(label.matrixWorld),x.camera),b=screen(new THREE.Vector3(.5,.5,0).applyMatrix4(label.matrixWorld),x.camera),width=Math.abs(b.clientX-a.clientX);assert.ok(width>=48&&width<192);intervals.push([Math.min(a.clientX,b.clientX),Math.max(a.clientX,b.clientX)]);
 }
 intervals.sort((a,b)=>a[0]-b[0]);assert.ok(intervals[0][1]<intervals[1][0],'Neighbor printer labels overlap atroomfit');
 const stateBefore=S.serializeLayout(x.state,x.catalog);await x.api.exportImage({width:900});const output=canvases.at(-1),text=output.reviewDraws.filter(r=>r[0]==='fillText');assert.equal(text.length,2);
 for(const row of text)assert.ok(row[4]>=48*496/512&&row[4]<192);near(parseFloat(output.getContext('2d').font),text.at(-1)[4]*512/496/16,'Export font scales uniformly with bounded label');
 assert.equal(S.serializeLayout(x.state,x.catalog),stateBefore);x.api.dispose();passed.push('6m room/900px: two800mm printers1100mm apart have footprint-bounded90% labels with original8:1 canvas aspect, no overlap; exported text width/font use identical policy.');
}
{
 const x=await labelSetup({roomWidth:20000});for(const g of x.groups){assert.equal(g.children.find(o=>o.userData.planLabel).visible,false);assert.equal(g.children.find(o=>o.userData.planFootprint).visible,true)}
 assert.equal(x.renderer.lastScene.children.find(o=>o.renderOrder===30).visible,true,'Selection remains visible when label hides');await x.api.exportImage({width:900});assert.equal(canvases.at(-1).reviewDraws.filter(r=>r[0]==='fillText').length,0);
 x.camera.zoom=4;x.camera.updateProjectionMatrix();allControls.at(-2).change();await settled();assert.ok(x.groups.every(g=>g.children.find(o=>o.userData.planLabel).visible));
 x.camera.zoom=1;x.camera.updateProjectionMatrix();allControls.at(-2).change();await settled();assert.ok(x.groups.every(g=>!g.children.find(o=>o.userData.planLabel).visible));x.api.dispose();
 passed.push('Labels below48screenpx hide in preview/export while footprint/selection remain; zoom A-B-A shows/hides without stale visibility.');
}
{
 const x=await labelSetup({depth:30,zoom:8});for(const g of x.groups){const label=g.children.find(o=>o.userData.planLabel);assert.equal(label.visible,true);assert.ok(label.scale.y<=.03*.9);near(label.scale.x/label.scale.y,8,'Shallow footprint label aspect')};x.api.dispose();
 passed.push('Shallow footprint additionally bounds label height within90% depth without stretching its32px-font canvas aspect.');
}
const segmentGeometry=await realModule(path.join(A,'layout/layout-geometry.mjs'));
for(const ending of ['commit','cancel','round-trip']){
 size={width:900,height:600};const room=[[0,0],[6000,0],[6000,6000],[4000,6000],[4000,2000],[2000,2000],[2000,6000],[0,6000]],catalog=[{id:'path-machine',widthMm:400,depthMm:400,heightMm:300,dimensionsMm:{width:400,depth:400,height:300}}];
 let state=S.createDefaultLayout({room:S.createRoomPolygon({polygonMm:room}),printers:[{id:'path-printer',machineId:'path-machine',configurationId:null,attachment:{parentId:null,surfaceId:'floor',xMm:1005,zMm:4005,yawDeg:0}}]},catalog),api;
 const original=S.serializeLayout(state,catalog),calls=[],commits=[];
 const swept=(a,b)=>[[Math.min(a.x,b.x)-200,Math.min(a.z,b.z)-200],[Math.max(a.x,b.x)+200,Math.min(a.z,b.z)-200],[Math.max(a.x,b.x)+200,Math.max(a.z,b.z)+200],[Math.min(a.x,b.x)-200,Math.max(a.z,b.z)+200]];
 const origin={x:1005,z:4005};
 api=factoryRealOrbit({container:makeContainer(),catalog,
  onSelect:id=>api.setState(state,id),
  constrainMove:(proposal,context)=>{
   const snapped={x:context.origin.x+Math.round((proposal.x-context.origin.x)/10)*10,z:context.origin.z+Math.round((proposal.z-context.origin.z)/10)*10};
   const accepted=segmentGeometry.namespace.polygonContains(room,swept(context.previous,snapped));
   calls.push({proposal:{...proposal},context:structuredClone(context),snapped,accepted});return accepted?snapped:false;
  },
  onMove:m=>{commits.push(m);state=S.applyAction(state,{type:'UPDATE_PRINTER',id:m.id,patch:{attachment:{xMm:m.x,zMm:m.z}}},catalog);api.setState(state,m.id)}});
 api.setState(state,null);api.view('top');await settled();const renderer=renderers.at(-1),camera=renderer.lastCamera,grab=target=>screen(new THREE.Vector3((target.x+50)*.001,0,(target.z+30)*.001),camera);
 api.canvas.emit('pointerdown',grab(origin));
 // These accepted segments are axis-aligned: their swept400mm square is exactly
 // this rectangle. The rejected endpoint lies in the notch. This is a renderer
 // callback fixture, not acceptance of A's final preview/cache/commit helper.
 for(const target of [{x:1005,z:1005},{x:3005,z:4005},{x:5005,z:1005}]){api.canvas.emit('pointermove',grab(target));await settled();assert.equal(S.serializeLayout(state,catalog),original);assert.equal(commits.length,0)}
 assert.deepEqual(calls.map(r=>r.context.previous),[origin,{x:1005,z:1005},{x:1005,z:1005}]);assert.deepEqual(calls.map(r=>r.accepted),[true,false,true]);assert.ok(calls.every(r=>r.context.origin.x===1005&&r.context.origin.z===4005));
 assert.equal(segmentGeometry.namespace.polygonContains(room,swept(origin,{x:5005,z:1005})),false,'Origin chord counterexample disappeared');
 if(ending==='round-trip')for(const target of [{x:1005,z:1005},origin])api.canvas.emit('pointermove',grab(target));
 api.canvas.emit(ending==='cancel'?'pointercancel':'pointerup');await settled();assert.equal(commits.length,ending==='commit'?1:0);
 if(ending==='commit')assert.deepEqual(commits[0],{id:'path-printer',x:5005,z:1005});else assert.equal(S.serializeLayout(state,catalog),original);
 const current=S.deriveScene(state,catalog).printers[0],newOrigin={x:current.xMm,z:current.zMm};
 const countBeforeNewGesture=calls.length;api.canvas.emit('pointerdown',grab(newOrigin));api.canvas.emit('pointermove',grab({x:newOrigin.x+80,z:newOrigin.z}));assert.equal(calls.length,countBeforeNewGesture+1);assert.deepEqual(calls.at(-1).context.previous,newOrigin);assert.deepEqual(calls.at(-1).context.origin,newOrigin);api.canvas.emit('pointercancel');api.dispose();
 passed.push('Incremental constrainMove metadata/'+ending+': safe U-room dogleg uses last accepted segment, false leavesprevious unchanged, original5mm snap anchor retained, one/no commit, next gesture resets origin.');
}
{
 const contexts=[],x=operationSetup(false,{constrainMove:(proposal,context)=>{contexts.push(structuredClone(context));context.previous.x=99999;context.origin.x=88888;return {x:proposal.x,z:proposal.z}}});x.api.view('top');await settled();const down=screen(new THREE.Vector3(.4,0,0),x.renderer.lastCamera);
 x.api.canvas.emit('pointerdown',down);x.api.canvas.emit('pointermove',{clientX:down.clientX+30,clientY:down.clientY});x.api.canvas.emit('pointermove',{clientX:down.clientX+60,clientY:down.clientY});
 assert.deepEqual(contexts.map(r=>r.origin),[{x:0,z:0},{x:0,z:0}]);assert.ok(contexts[1].previous.x>0&&contexts[1].previous.x<99999);x.api.canvas.emit('pointercancel');assert.equal(x.commits.length,0);x.api.dispose();
 passed.push('Preview context objects are copies: hook mutation cannot overwrite internal previous/original snap anchor.');
}
{
 size={width:900,height:675};const catalog=[{id:'label-stack-machine',label:'Printer name',widthMm:800,depthMm:600,heightMm:500,dimensionsMm:{width:800,depth:600,height:500}}],selections=[];
 const desk=S.createDesk({id:'desk',widthMm:1200,depthMm:900,heightMm:750}),printer={id:'stack-printer',machineId:'label-stack-machine',configurationId:null,attachment:{parentId:'desk',surfaceId:'top',xMm:0,zMm:0,yawDeg:0}};
 const occupied=S.createDefaultLayout({furniture:[desk],printers:[printer]},catalog),empty=S.applyAction(occupied,{type:'REMOVE_PRINTER',id:'stack-printer'},catalog),api=factory({container:makeContainer(),catalog,onSelect:id=>selections.push(id)});
 const renderer=renderers.at(-1),groups=()=>{const m=new Map();renderer.lastScene.traverse(g=>{if(g.userData.planProjection)m.set(g.userData.entityId,g)});return m},visibleLabels=()=>{const a=[];renderer.lastScene.traverseVisible(o=>{if(o.isMesh&&o.userData.planLabel===true)a.push(o)});return a};
 for(const [name,state,count,expectedText]of [['occupied',occupied,2,'Printer name'],['empty',empty,1,'desk'],['occupied-again',occupied,2,'Printer name']]){
  const jsonBefore=S.serializeLayout(state,catalog);api.setState(state,'desk');api.view('top');await settled();const map=groups(),labels=visibleLabels();assert.equal(map.size,count);assert.equal(labels.length,1,'Duplicate centered white label planes: '+name);
  assert.equal(map.get('desk').children.find(o=>o.userData.planLabel).visible,name==='empty');
  if(name!=='empty')assert.equal(map.get('stack-printer').children.find(o=>o.userData.planLabel).visible,true);
  for(const [id,g]of map){assert.equal(g.userData.entityId,id);assert.equal(g.children.find(o=>o.userData.planFootprint).visible,true)}
  assert.equal(labels[0].material.map.colorSpace,THREE.SRGBColorSpace);assert.equal(labels[0].material.toneMapped,false,'UI label should not be altered by scene exposure/tone mapping');
  await api.exportImage({width:900});const text=canvases.at(-1).reviewDraws.filter(r=>r[0]==='fillText');assert.equal(text.length,1,'Canvas export duplicates label: '+name);assert.equal(text[0][1],expectedText);assert.equal(S.serializeLayout(state,catalog),jsonBefore);
 }
 const camera=renderer.lastCamera;api.canvas.emit('pointerdown',screen(new THREE.Vector3(0,0,0),camera));api.canvas.emit('pointerup');assert.equal(selections.at(-1),'stack-printer');
 api.canvas.emit('pointerdown',screen(new THREE.Vector3(.55,0,0),camera));api.canvas.emit('pointerup');assert.equal(selections.at(-1),'desk','Suppressing a label must not remove its furniture selection footprint');api.dispose();
 passed.push('Label rendering regression: occupied desk+centered child has one visible printer label plane/canvas text; empty desk label returns; A-B-A retains both footprints/IDs/picking; sRGB label canvas and toneMappedfalse preserve UI text color.');
}
// Keep pointer movement responsive immediately after contact in both projections.
// Actual renderer/Three/OrbitControls code; CPU event/WebGL fixture only.
for(const mode of ['top','perspective']){
 const proposals=[],contexts=[];
 const x=operationSetup(true,{constrainMove:(proposal,context)=>{
  proposals.push({...proposal});contexts.push(structuredClone(context));
  return proposals.length===1?{x:40,z:0,boundaryLimited:true}:{x:proposal.x,z:proposal.z};
 }});
 x.api.view(mode);await settled();const camera=x.renderer.lastCamera;
 const point=new THREE.Vector3(.4,mode==='top'?0:.75,0),down=screen(point,camera);
 const movement=screen(point.clone().add(new THREE.Vector3(.6,0,0)),camera);
 const inward=screen(point.clone().add(new THREE.Vector3(.55,0,0)),camera);
 x.api.canvas.emit('pointerdown',down);assert.equal(x.selections.at(-1),'desk');
 x.api.canvas.emit('pointermove',movement);assert.equal(proposals.length,1);
 x.api.canvas.emit('pointermove',inward);assert.equal(proposals.length,2);
 const ray=new THREE.Raycaster(),plane=new THREE.Plane(new THREE.Vector3(0,1,0),0);
 const onPlane=event=>{ray.setFromCamera(new THREE.Vector2(event.clientX/size.width*2-1,1-event.clientY/size.height*2),camera);return ray.ray.intersectPlane(plane,new THREE.Vector3());};
 const delta=onPlane(inward).sub(onPlane(movement));
 near(proposals[1].x,40+delta.x*1000,'Immediate inward pointer delta after blocked overshoot '+mode);
 near(proposals[1].z,delta.z*1000,'Wall pullaway preserves projected tangent '+mode);
 assert.ok(proposals[1].x<40&&proposals[1].x>-100,'Next inward movement must immediately leave contact, without consuming the old overshoot');
 assert.deepEqual(contexts[1].origin,{x:0,z:0});assert.deepEqual(contexts[1].previous,{x:40,z:0});
 x.api.canvas.emit('pointercancel');assert.equal(x.commits.length,0);x.api.dispose();
 passed.push('Wall pointer anchor/'+mode+': blocked600mm overshoot discarded, next50mm inward pointer motion immediately leaves contact; original snap origin/accepted segment preserved; cancel commitsnothing.');
}

{
 const proposals=[],x=operationSetup(false,{constrainMove:proposal=>{proposals.push({...proposal});return {x:0,z:0};}});
 x.api.view('top');await settled();const camera=x.renderer.lastCamera;camera.zoom=20;camera.updateProjectionMatrix();
 const point=new THREE.Vector3(.4,0,0),down=screen(point,camera);
 x.api.canvas.emit('pointerdown',down);
 for(const delta of [.006,.009,.014])x.api.canvas.emit('pointermove',screen(point.clone().add(new THREE.Vector3(delta,0,0)),camera));
 assert.equal(proposals.length,3);near(proposals[2].x,14,'Free-space sub-grid movement still accumulates');
 x.api.canvas.emit('pointercancel');x.api.dispose();passed.push('Unconstrained grid snap retains accumulated small pointer displacement; boundary-only rebasing does not freeze slow drags.');
}

// Lightweight placement symbols: no CAD/assets are loaded by this case.
{
 const file=path.join(A,'layout/layout-catalog.json'),catalog=JSON.parse(fs.readFileSync(file,'utf8'));
 assert.equal(catalog.machines.length,69,'Every registered placement preview must be covered');
 const helper=source.slice(source.indexOf('function printerPreviewParts(row) {'),source.indexOf('export function createLayoutRenderer('));
 assert(helper.startsWith('function printerPreviewParts(row) {'));
 const preview=new Function(helper+'\nreturn printerPreviewParts;')(),sourceCatalogJSON=JSON.stringify(catalog),results=[];
 for(const original of catalog.machines){
  const shape=preview(original),parts=original.proxy?.parts||[];
  assert(shape.simplePreview&&shape.parts.length<=80,original.id+' preview cell budget');
  assert(shape.parts.slice(0,parts.length).every((p,i)=>p===parts[i]),original.id+' original source bounds retained');
  assert(shape.parts.some(p=>p.proxyRole==='bed'||p.proxyRole==='bed-cue'));
  assert(shape.parts.some(p=>p.proxyRole==='base-cue'));
  assert.equal(shape.parts.filter(p=>p.proxyRole==='contact-foot').length,4);
  const extents=[original.dimensionsMm.width,original.dimensionsMm.height,original.dimensionsMm.depth].map(v=>v/1000);
  for(const p of shape.parts){
   assert(p.centerM.every(Number.isFinite)&&p.sizeM.every(v=>Number.isFinite(v)&&v>0));
   if(p.previewCue)for(let axis=0;axis<3;axis++){
    assert(p.centerM[axis]-p.sizeM[axis]/2>=(axis===1?0:-extents[axis]/2)-1e-10);
    assert(p.centerM[axis]+p.sizeM[axis]/2<=(axis===1?extents[axis]:extents[axis]/2)+1e-10);
   }
  }
  for(const offset of [original.baseOffsetMm||0,27.5]){
   size={width:400,height:300};const row={...original,widthMm:original.dimensionsMm.width,depthMm:original.dimensionsMm.depth,heightMm:original.dimensionsMm.height,baseOffsetMm:offset},catalogRows=[row],raised=offset===27.5;
   const desk=S.createDesk({id:'proxy-desk',widthMm:4000,depthMm:4000,heightMm:740,pose:{xMm:4000,zMm:4000,yawDeg:0}});
   const printer={id:'proxy-printer',machineId:row.id,configurationId:null,attachment:{parentId:raised?desk.id:null,surfaceId:raised?'top':'floor',xMm:raised?0:4000,zMm:raised?0:4000,yawDeg:90}};
   const state=S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:10000}),furniture:raised?[desk]:[],printers:[printer]},catalogRows);
   const derived=S.deriveScene(state,catalogRows),api=factory({container:makeContainer(),catalog:catalogRows});
   api.setState(state,printer.id);api.view('front');await settled();
   const renderer=renderers.at(-1);let group;renderer.lastScene.traverse(o=>{if(o.userData.entityId===printer.id&&o.userData.simplePreview)group=o});assert(group,original.id+' actual renderer preview');
   const ground=derived.printers[0].supportYM,bounds=new THREE.Box3(),geometries=new Set();group.updateMatrixWorld(true);
   group.traverse(o=>{if(o.isMesh){bounds.union(new THREE.Box3().setFromObject(o));geometries.add(o.geometry)}});
   assert(Math.abs(bounds.min.y-ground)<1e-9,original.id+' supportYM contact, offset '+offset);
   assert.equal(group.position.y,ground);assert.equal(geometries.size,1,'One shared box geometry for preview solids');
   assert.equal(group.children.length,shape.parts.length);assert(group.userData.simplePreview);
   api.dispose();await settled();
  }
  results.push({id:original.id,style:shape.style,cells:shape.parts.length,triangles:shape.parts.filter(p=>!p.wireframe).length*12});
 }
 assert.equal(JSON.stringify(catalog),sourceCatalogJSON,'Preview must not edit source catalog');
 observations.push({case:'lightweight-printer-preview-all69',catalog:pin(file),machines:results,sourceAndPositiveBaseOffsetContact:true,fullCADLoaded:false});
 passed.push('All69 catalog printers retain source bounds/colors, gain bounded bed/base/contact cues using one shared box geometry, and opaque feet meet actual deriveScene supportYM on floor and desk even with positive native baseOffset; final CAD remains separate.');
}

// Source-backed recurrence: small tangent deltas must survive repeated wall
// pressure, just as they do in free space. Execute the actual app callback.
{
 size={width:900,height:675};
 const catalog=[{id:'slow-wall-machine',widthMm:200,depthMm:180,heightMm:300,dimensionsMm:{width:200,depth:180,height:300}}];
 const desk=S.createDesk({id:'slow-desk',widthMm:1200,depthMm:700,heightMm:750,pose:{xMm:0,zMm:-500,yawDeg:0}});
 const state=S.createDefaultLayout({room:S.createRoomRect({widthMm:4000,depthMm:1700}),furniture:[desk],printers:[]},catalog),before=S.serializeLayout(state,catalog);
 const appFile=path.join(A,'layout/layout-app.mjs'),app=fs.readFileSync(appFile,'utf8');imports.push(pin(appFile));
 const sourceMove=app.slice(app.indexOf('let pendingMove='),app.indexOf('async function render('));
 const constrain=new Function('initial','catalog','resolveWorldMove','applyWorldMove',`let state=initial,busy=false,roomEditing=false,disposed=false;${sourceMove}\nreturn constrainMove;`)(state,catalog,S.resolveWorldMove,S.applyWorldMove);
 const accepted=[],commits=[],api=factoryRealOrbit({container:makeContainer(),catalog,
  constrainMove:(proposal,context)=>{const value=constrain(proposal,context);accepted.push(value);return value;},onMove:m=>commits.push(m)});
 api.setState(state,null);api.view('top');await settled();const renderer=renderers.at(-1),camera=renderer.lastCamera;
 camera.zoom=5;camera.updateProjectionMatrix();const point=new THREE.Vector3(.45,0,-.5),at=(x,z)=>screen(point.clone().add(new THREE.Vector3(x/1000,0,z/1000)),camera);
 api.canvas.emit('pointerdown',at(0,0));
 for(let i=1;i<=20;i++)api.canvas.emit('pointermove',at(i*2,-i*20));
 assert.equal(accepted.length,20);near(accepted.at(-1).x,40,'Slow2mm wall tangent accumulates under20mm outward pressure');near(accepted.at(-1).z,-500,'Wall pressure stays clamped');
 for(let i=1;i<=20;i++)api.canvas.emit('pointermove',at(40-i*2,-400-i*20));
 near(accepted.at(-1).x,0,'Slow reversed wall tangent A-B-A');near(accepted.at(-1).z,-500,'Reversed tangent stays on wall');
 api.canvas.emit('pointermove',at(0,-780));near(accepted.at(-1).z,-480,'Immediate inward move drops old normal overshoot');
 assert.equal(commits.length,0);api.canvas.emit('pointercancel');assert.equal(commits.length,0);assert.equal(S.serializeLayout(state,catalog),before);api.dispose();
 observations.push({case:'slow-wall-tangent-grid-residual',frames:41,tangentStepMm:2,outwardStepMm:20,forwardMm:40,reverseMm:0,normalPullawayMm:20,actualAppCallback:true,trustedBrowserEvent:false});
 passed.push('Actual app+renderer callback: repeated2mm wall-parallel deltas survive20mm outward pressure; slowA-B-A and immediate normal pullaway; cancel preserves original state.');
}

// Exercise exact app transaction bodies and actual renderer DOM handlers. The
// ports for sync/storage/status are fixtures; math, commit, selection, rotation,
// JSON import generation guards and undo/redo action bodies are product source.
function rotationApp(initial,catalog){
 const appFile=path.join(A,'layout/layout-app.mjs'),app=fs.readFileSync(appFile,'utf8');imports.push(pin(appFile));
 const section=(start,end)=>{const a=app.indexOf(start),b=app.indexOf(end,a+start.length);assert(a>=0&&b>a,'Actual app section missing: '+start);return app.slice(a,b)};
 const methods=section('function commit(','function download(')+section('let pendingMove=','async function render(')+section('async function act(','function updateViewPresentation(');
 const keyboardStart="view.canvas.addEventListener('keydown',event=>{";
 const canvasKeyboard=section(keyboardStart,'\n  });').slice(keyboardStart.length);
 return new Function('initial','catalog','S',`const {applyAction,applyWorldMove,resolveWorldMove,resolveWorldRotation,serializeLayout,parseLayout,createDefaultLayout,createDesk,createShelf}=S;
  let state=initial,selected=null,busy=false,roomEditing=false,disposed=false,interactionGeneration=0,view=null,operation=null;const past=[],future=[],writes=[],errors=[],maxFileBytes=2000000;
  function sync(){view?.setState(state,selected)}function store(){writes.push(serializeLayout(state,catalog))}function humanError(e){return e.code||e.message}function message(text,error){if(error)errors.push(text)}const t=k=>k;
  const statusNode={hidden:false,textContent:''},$=()=>statusNode,ui={setStatus(){}};
  ${methods}
  function canvasKey(event){${canvasKeyboard}}
  return {constrainRotate,worldRotate,worldMove,constrainMove,select,act,bind(v){view=v;view.canvas.addEventListener('keydown',canvasKey);sync()},replace(next,id=selected){state=next;selected=id;sync()},read:()=>({state,selected,past:[...past],future:[...future],writes:[...writes],errors:[...errors],interactionGeneration})};`)(initial,catalog,S);
}
function rotationSeed(yaw=30){
 const catalog=[{id:'rotation-printer',label:'Rotation source fixture',widthMm:200,depthMm:180,heightMm:300,dimensionsMm:{width:200,depth:180,height:300}}];
 const desk=S.createDesk({id:'rotate-desk',widthMm:1600,depthMm:1000,heightMm:750,pose:{xMm:100,zMm:-100,yawDeg:yaw}});
 const printer=(id,parentId,xMm,zMm,yawDeg)=>({id,machineId:catalog[0].id,configurationId:null,attachment:{parentId,surfaceId:parentId?'top':'floor',xMm,zMm,yawDeg}});
 return {catalog,state:S.createDefaultLayout({room:S.createRoomRect({widthMm:10000,depthMm:8000}),furniture:[desk],printers:[printer('orbit-1',desk.id,250,120,15),printer('orbit-2',desk.id,-300,-100,-10),printer('unrelated',null,2500,0,0)]},catalog)};
}
async function rotationSetup({mode='top',seed=rotationSeed(),selected='rotate-desk',constrain,rejectCommit=false,defaultRotate=false}={}){
 size={width:900,height:675};const container=makeContainer(),engine=rotationApp(seed.state,seed.catalog),moves=[],rotations=[],proposals=[],errors=[];let api;
 api=factoryRealOrbit({container,catalog:seed.catalog,onSelect:engine.select,onMove:move=>{moves.push({...move});return engine.worldMove(move)},
  constrainMove:engine.constrainMove,onRotate:defaultRotate?undefined:r=>{rotations.push({...r});return rejectCommit?false:engine.worldRotate(r)},
  constrainRotate:(p,c)=>{proposals.push({proposal:structuredClone(p),context:structuredClone(c)});return constrain?constrain(p,c):engine.constrainRotate(p,c)},onError:e=>errors.push(e)});
 engine.bind(api);engine.select(selected);api.view(mode);await settled();
 const nodes=plan=>{const out=new Map();renderers.at(-1).lastScene.traverse(o=>{if(o.userData.entityId&&!!o.userData.planProjection===plan)out.set(o.userData.entityId,o)});return out};
 const toolbar=container.querySelector('.layout-object-tools'),button=name=>toolbar?.querySelector('[data-layout-rotation='+name+']');
 assert(toolbar&&button('left')&&button('handle')&&button('right'),'Actual contextual rotation controls missing');
 return {api,engine,container,toolbar,button,nodes,rotations,moves,proposals,errors,catalog:seed.catalog,initial:seed.state,renderer:renderers.at(-1)};
}
const angleNear=(actual,expected,label)=>assert.ok(Math.abs(actual-expected)<1e-9,label+': '+actual+' != '+expected);
const rotationSnapshot=x=>new Map([...x.nodes(false)].map(([id,n])=>[id,{position:n.position.clone(),yaw:n.rotation.y}]));
function checkRotationPreview(x,before,id,yaw){
 const own=before.get(id),rad=yaw*Math.PI/180,delta=rad-own.yaw,root=x.nodes(false).get(id),flat=x.nodes(true).get(id);
 angleNear(root.rotation.y,rad,'world rotation');assert.deepEqual(root.position.toArray(),own.position.toArray(),'Own center moved');angleNear(flat.rotation.y,delta,'Flat pre-rotated footprint must apply delta once');
 for(const source of x.initial.printers){
  const prior=before.get(source.id),node=x.nodes(false).get(source.id),plan=x.nodes(true).get(source.id);
  if(source.attachment.parentId===id){
   const dx=prior.position.x-own.position.x,dz=prior.position.z-own.position.z,c=Math.cos(delta),s=Math.sin(delta);
   angleNear(node.position.x,own.position.x+c*dx+s*dz,'Follower center X');angleNear(node.position.z,own.position.z-s*dx+c*dz,'Follower center Z');
   assert.equal(node.position.y,prior.position.y,'Follower support height changed');angleNear(node.rotation.y,prior.yaw+delta,'Follower orientation');
   angleNear(plan.position.x,node.position.x,'Flat follower X');angleNear(plan.position.z,node.position.z,'Flat follower Z');angleNear(plan.rotation.y,delta,'Flat follower delta');
  }else if(source.id!==id){assert.deepEqual(node.position.toArray(),prior.position.toArray(),'Other parent/free root moved');assert.equal(node.rotation.y,prior.yaw)}
 }
 assert.equal(x.engine.read().past.length,0,'Preview wrote undo');assert.equal(x.engine.read().writes.length,0,'Preview saved state');
}
{
 const x=await rotationSetup();assert.equal(x.toolbar.getAttribute('role'),'group');assert.equal(x.toolbar.hidden,false);assert.equal(x.toolbar.querySelectorAll('button').length,4);assert.equal(x.toolbar.querySelectorAll('svg').length,4);assert.equal(x.toolbar.querySelectorAll('[data-layout-rotation]').length,3);assert.equal(x.toolbar.querySelectorAll('output').length,1);
 for(const name of ['left','handle','right'])assert(x.button(name).getAttribute('aria-label'));
 for(const mode of ['top','perspective']){x.api.view(mode);await settled();const left=parseFloat(x.toolbar.style.left),top=parseFloat(x.toolbar.style.top);assert(Number.isFinite(left)&&left>=0&&left<=size.width);assert(Number.isFinite(top)&&top>=0&&top<=size.height)}
 x.engine.select(null);assert.equal(x.toolbar.hidden,true);x.engine.select('rotate-desk');assert.equal(x.toolbar.hidden,false);x.api.dispose();assert.equal(x.toolbar.parentNode,null);assert(x.toolbar.querySelectorAll('button').every(b=>[...b.reviewHandlers.values()].every(v=>v.length===0)));
 passed.push('Selected-only tool group keeps three rotation SVG buttons/angle output plus focus button, accessible labels, finite in-canvas source anchor in2D/3D, hides on deselect, removes controls/listeners on disposal.');
}
{
 const x=await rotationSetup(),original=S.serializeLayout(x.initial,x.catalog);
 x.button('right').click();assert.equal(x.rotations.length,1);assert.deepEqual(x.rotations[0],{id:'rotate-desk',yawDeg:120,deltaDeg:90});angleNear(S.worldTransform(x.engine.read().state,'rotate-desk',x.catalog).yawDeg,120,'Right90');assert.equal(x.engine.read().past.length,1);
 x.button('left').click();assert.equal(x.rotations.length,2);assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),original,'Button A-B-A changes local source attachment');
 await x.engine.act({type:'undo'});angleNear(x.engine.read().state.furniture[0].pose.yawDeg,120,'Actual app undo');await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),original);
 x.api.dispose();passed.push('Right/left90 call actual app worldRotate once each, preserve local companion attachments; actual app undo/redo restores exact A-B-A JSON.');
}
for(const keyboardControl of ['left','handle','right']){
 const x=await rotationSetup(),h=x.button(keyboardControl);let yaw=30;
 for(const [key,shift,delta]of [['ArrowRight',false,15],['ArrowLeft',false,-15],['ArrowRight',true,1],['ArrowLeft',true,-1],['r',false,90],['R',true,-90]]){h.emit('keydown',{key,shiftKey:shift});yaw+=delta;assert.deepEqual(x.rotations.at(-1),{id:'rotate-desk',yawDeg:yaw,deltaDeg:delta});angleNear(x.engine.read().state.furniture[0].pose.yawDeg,yaw,'Handle keyboard '+key)}
 const count=x.rotations.length;h.emit('keydown',{key:'r',repeat:true});assert.equal(x.rotations.length,count);assert.equal(x.engine.read().past.length,6);x.api.dispose();passed.push('Contextual '+keyboardControl+' button arrows15/Shift1 and R90/ShiftR-90 use actual commit path; repeated keydown does not duplicate undo.');
}
for(const mode of ['top','perspective'])for(const sign of [-1,1]){
 const x=await rotationSetup({mode}),before=rotationSnapshot(x),saved=S.serializeLayout(x.initial,x.catalog),cameraBefore=cameraSnapshot(x.renderer.lastCamera),h=x.button('handle');
 h.emit('pointerdown',{clientX:300,clientY:200});assert.equal(h.hasPointerCapture(71),true);assert.equal(fixtureDocument.activeElement,h);
 h.emit('pointermove',{clientX:300+62*sign,clientY:200});const expected=30+30*sign;checkRotationPreview(x,before,'rotate-desk',expected);assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),saved);assert.deepEqual(cameraSnapshot(x.renderer.lastCamera),cameraBefore,'Toolbar gesture reached orbit controls');
 const c=x.proposals.at(-1).context;assert.deepEqual(c.origin,{yawDeg:30});assert.deepEqual(c.previous,{yawDeg:30});assert.equal(c.snapDeg,15);
 h.emit('pointerup');assert.equal(x.rotations.length,1);assert.equal(x.engine.read().past.length,1);assert.equal(x.engine.read().writes.length,1);angleNear(x.engine.read().state.furniture[0].pose.yawDeg,expected,'Committed preview yaw');assert.equal(h.hasPointerCapture(71),false);
 assert.deepEqual(x.engine.read().state.printers,x.initial.printers,'Parent rotation changed stored follower attachments');const text=S.serializeLayout(x.engine.read().state,x.catalog);assert.equal(S.serializeLayout(S.parseLayout(text,x.catalog),x.catalog),text);
 await x.engine.act({type:'undo'});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),saved);await x.engine.act({type:'redo'});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),text);x.api.dispose();
 passed.push('Actual app/renderer '+mode+' signed rotation '+sign+': center fixed, two followers orbit/orient, flat delta once, no camera drift/history before drop, one exact commit, save/undo/redo.');
}
{
 const x=await rotationSetup(),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:325,clientY:200,shiftKey:true});assert.equal(x.proposals.at(-1).context.snapDeg,1);angleNear(x.nodes(false).get('rotate-desk').rotation.y*180/Math.PI,33,'Fine .1deg/px and1deg snap');h.emit('pointerup');angleNear(x.engine.read().state.furniture[0].pose.yawDeg,33,'Fine committed yaw');x.api.dispose();passed.push('Shift drag uses .1deg/px with1deg snap through actual app constraint and exact drop.');
}
{
 const x=await rotationSetup({seed:rotationSeed(350)}),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:360,clientY:200});angleNear(x.nodes(false).get('rotate-desk').rotation.y*180/Math.PI,380,'Unwrapped world yaw');assert.equal(h.querySelector('output').textContent,'20°');h.emit('pointerup');angleNear(x.rotations[0].yawDeg,380,'Do not normalize callback yaw');x.api.dispose();passed.push('350→380deg stays unwrapped in callback/state while contextual display shows20deg.');
}
for(const ending of ['pointercancel','lostpointercapture','blur','Escape','view-change','state-replace','dispose']){
 const x=await rotationSetup(),before=rotationSnapshot(x),saved=S.serializeLayout(x.initial,x.catalog),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:360,clientY:200});checkRotationPreview(x,before,'rotate-desk',60);
 if(ending==='blur')x.api.canvas.reviewBlur();else if(ending==='Escape')x.api.canvas.reviewWindowHandlers.get('keydown')({key:'Escape',preventDefault(){}});else if(ending==='view-change')x.api.view('perspective');else if(ending==='state-replace')x.engine.replace(S.parseLayout(saved,x.catalog));else if(ending==='dispose')x.api.dispose();else h.emit(ending);
 h.emit('pointerup');assert.equal(x.rotations.length,0);assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),saved);assert.equal(h.hasPointerCapture(71),false);
 if(ending!=='dispose'){for(const [id,prior]of before){const n=x.nodes(false).get(id);assert.deepEqual(n.position.toArray(),prior.position.toArray());angleNear(n.rotation.y,prior.yaw,'Cancel restored orientation')}h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:330,clientY:200});h.emit('pointerup');assert.equal(x.rotations.length,1,'Canceled pending rotation blocks next gesture');x.api.dispose()}
 passed.push('Rotation '+ending+' restores parent/followers and orientation with zero history/save, releases capture; fresh gesture remains usable.');
}
for(const response of [false,{yawDeg:NaN},{yawDeg:Infinity},{yawDeg:90,boundaryLimited:true,pointerRemainderDeg:NaN}]){
 const x=await rotationSetup({constrain:()=>response}),before=rotationSnapshot(x),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:400,clientY:200});h.emit('pointerup');assert.equal(x.rotations.length,0);assert.equal(x.engine.read().past.length,0);for(const [id,prior]of before){assert.deepEqual(x.nodes(false).get(id).position.toArray(),prior.position.toArray());assert.equal(x.nodes(false).get(id).rotation.y,prior.yaw)}if(response!==false)assert.equal(x.errors.at(-1).code,'INVALID_CONSTRAINED_ROTATION');x.api.dispose();passed.push('Rejected/nonfinite rotation or nonfinite angular remainder cannot alter preview, accepted drop or history.');
}
{
 const x=await rotationSetup(),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:450,clientY:200,pointerId:72});h.emit('pointercancel',{pointerId:72});assert.equal(h.hasPointerCapture(71),true);assert.equal(x.proposals.length,0);h.emit('pointermove',{clientX:360,clientY:200});h.emit('pointermove',{clientX:300,clientY:200});h.emit('pointerup');assert.equal(x.rotations.length,0);assert.equal(x.engine.read().past.length,0);x.api.dispose();passed.push('Foreign pointer cannot move/cancel captured rotation; exact A-B-A gesture commits no history.');
}
{
 const seed=rotationSeed(37),x=await rotationSetup({seed,selected:'orbit-1'}),h=x.button('handle'),parent=structuredClone(seed.state.furniture),other=seed.state.printers.filter(p=>p.id!=='orbit-1');
 h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:330,clientY:200});h.emit('pointerup');angleNear(x.rotations[0].yawDeg,67,'Attached printer world callback');angleNear(x.engine.read().state.printers[0].attachment.yawDeg,30,'Attached printer world-parent local conversion');assert.deepEqual(x.engine.read().state.furniture,parent);assert.deepEqual(x.engine.read().state.printers.filter(p=>p.id!=='orbit-1'),other);x.api.dispose();passed.push('Printer on37deg desk starts52deg world, commits67deg world/30deg local; parent and other companions stay unchanged.');
}
{
 const base=rotationSeed(),seed={catalog:base.catalog,state:S.createDefaultLayout({room:S.createRoomRect({widthMm:2000,depthMm:1000}),furniture:[S.createDesk({id:'rotate-desk',widthMm:1600,depthMm:700,heightMm:750})],printers:[]},base.catalog)};
 const x=await rotationSetup({seed}),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:390,clientY:200});const yaw=x.nodes(false).get('rotate-desk').rotation.y*180/Math.PI;
 assert(yaw>0&&yaw<45,'Wall constraint failed to stop rotated footprint');assert.equal(x.toolbar.dataset.boundaryLimited,'true');assert.equal(x.engine.read().past.length,0);h.emit('pointerup');
 angleNear(x.engine.read().state.furniture[0].pose.yawDeg,yaw,'Drop must not resnap constrained boundary');assert.equal(x.engine.read().past.length,1);assert.deepEqual(S.placementViolations(x.engine.read().state,x.catalog),[]);
 h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:270,clientY:200});assert(x.nodes(false).get('rotate-desk').rotation.y*180/Math.PI<yaw-5,'Immediate rotation away from wall stuck');h.emit('pointercancel');x.api.dispose();passed.push('Actual state angular boundary clamps before preview, marks limitation, commits exact fractional contact once without resnap; next gesture pulls away immediately.');
}
for(const option of [{rejectCommit:true},{defaultRotate:true}]){
 const x=await rotationSetup(option),saved=S.serializeLayout(x.initial,x.catalog),before=rotationSnapshot(x),h=x.button('handle');h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:360,clientY:200});h.emit('pointerup');assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),saved);assert.equal(x.engine.read().past.length,0);for(const [id,prior]of before){assert.deepEqual(x.nodes(false).get(id).position.toArray(),prior.position.toArray());assert.equal(x.nodes(false).get(id).rotation.y,prior.yaw)}x.api.dispose();passed.push('Rejected/default-noop onRotate restores original parent/followers/flat preview without retaining uncommitted rotation.');
}
for(const gesture of ['pointer','keyboard']){
 const x=await rotationSetup(),saved=S.serializeLayout(x.initial,x.catalog),importState=S.applyAction(x.initial,{type:'UPDATE_FURNITURE',id:'rotate-desk',patch:{pose:{xMm:500}}},x.catalog),text=S.serializeLayout(importState,x.catalog);let finish;
 const pending=x.engine.act({type:'import',file:{size:text.length,text:()=>new Promise(r=>{finish=r})}}),h=x.button('handle');assert.equal(typeof finish,'function');
 if(gesture==='pointer'){h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointercancel');}else h.emit('keydown',{key:'ArrowRight'});
 const afterGesture=S.serializeLayout(x.engine.read().state,x.catalog);finish(text);await pending;assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),afterGesture,'Stale async import replaced rotation');if(gesture==='pointer')assert.equal(afterGesture,saved);else assert.equal(x.engine.read().past.length,1);x.api.dispose();passed.push('Actual app async JSON import generation: '+gesture+' rotation invalidates delayed older import without losing current plan.');
}
for(const control of ['buttons','keyboard']){
 const base=rotationSeed(29.3),state=S.applyAction(base.state,{type:'UPDATE_PRINTER',id:'orbit-1',patch:{attachment:{yawDeg:10.2}}},base.catalog),x=await rotationSetup({seed:{catalog:base.catalog,state},selected:'orbit-1'}),before=S.serializeLayout(state,base.catalog),h=x.button('handle');
 if(control==='buttons')x.button('right').click();else h.emit('keydown',{key:'r'});
 assert.deepEqual(x.rotations.at(-1),{id:'orbit-1',yawDeg:129.5,deltaDeg:90});assert.equal(x.engine.read().state.printers[0].attachment.yawDeg,100.2);
 if(control==='buttons')x.button('left').click();else h.emit('keydown',{key:'R',shiftKey:true});
 assert.deepEqual(x.rotations.at(-1),{id:'orbit-1',yawDeg:39.5,deltaDeg:-90});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),before,'Fractional parent/local discrete A-B-A must preserve exact original serialization');
 assert.equal(x.engine.read().past.length,2);x.api.dispose();passed.push('Actual app '+control+' fractional29.3deg parent/10.2deg attachment: discrete delta payload preserves exact local A-B-A serialization.');
}
{
 const base=rotationSeed(29.3),state=S.applyAction(base.state,{type:'UPDATE_PRINTER',id:'orbit-1',patch:{attachment:{yawDeg:10.2}}},base.catalog),x=await rotationSetup({seed:{catalog:base.catalog,state},selected:'orbit-1'}),before=S.serializeLayout(state,base.catalog),h=x.button('handle');
 for(const [key,shift]of [['r',false],['r',false],['ArrowRight',false],['ArrowRight',true],['ArrowLeft',true],['ArrowLeft',false],['R',true],['R',true]])h.emit('keydown',{key,shiftKey:shift});
 assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),before,'Mixed integer turns/inverses drift original attachment');assert.equal(x.engine.read().past.length,8);assert.equal(x.rotations.length,8);x.api.dispose();passed.push('Fractional attached source survives eight mixed90/15/1 integer turns and inverses with exact original serialization and one history per turn.');
}
{
 const base=rotationSeed(29.3),state=S.applyAction(base.state,{type:'UPDATE_PRINTER',id:'orbit-1',patch:{attachment:{yawDeg:10.2}}},base.catalog),x=await rotationSetup({seed:{catalog:base.catalog,state},selected:'orbit-1'}),h=x.button('handle');
 h.emit('keydown',{key:'r'});await x.engine.act({type:'UPDATE_FURNITURE',id:'rotate-desk',patch:{pose:{xMm:600}}});const edited=S.serializeLayout(x.engine.read().state,x.catalog);
 h.emit('keydown',{key:'ArrowRight'});h.emit('keydown',{key:'ArrowLeft'});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),edited,'Discrete chain restored pre-edit plan');
 await x.engine.act({type:'undo'});const undone=S.serializeLayout(x.engine.read().state,x.catalog);assert.equal(x.engine.read().state.furniture[0].pose.xMm,600);h.emit('keydown',{key:'r'});h.emit('keydown',{key:'R',shiftKey:true});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),undone,'Discrete chain restored stale pre-undo plan');
 h.emit('pointerdown',{clientX:300,clientY:200});h.emit('pointermove',{clientX:330,clientY:200});h.emit('pointerup');const dragged=S.serializeLayout(x.engine.read().state,x.catalog);h.emit('keydown',{key:'r'});h.emit('keydown',{key:'R',shiftKey:true});assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),dragged,'Integer chain crossed committed drag');x.api.dispose();passed.push('Other edit, actual undo and committed drag each invalidate old discrete chain; next inverse pair restores current source plan, never stale base.');
}
{
 const x=await rotationSetup(),e=x.engine,initial=S.serializeLayout(e.read().state,x.catalog),context={previous:{yawDeg:30},origin:{yawDeg:30},snapDeg:15};
 assert.equal(e.constrainRotate({id:'rotate-desk',yawDeg:60},{...context,previous:{yawDeg:22}}),false);const accepted=e.constrainRotate({id:'rotate-desk',yawDeg:60},context);assert.equal(accepted.yawDeg,60);assert.equal(S.serializeLayout(e.read().state,x.catalog),initial);
 assert.equal(e.constrainRotate({id:'rotate-desk',yawDeg:75},{...context,origin:{yawDeg:31},previous:{yawDeg:60}}),false);assert.equal(e.worldRotate({id:'rotate-desk',yawDeg:60}),true);assert.equal(e.read().past.length,1);const once=S.serializeLayout(e.read().state,x.catalog);e.worldRotate({id:'rotate-desk',yawDeg:60});assert.equal(e.read().past.length,1);assert.equal(S.serializeLayout(e.read().state,x.catalog),once);
 const next=e.constrainRotate({id:'rotate-desk',yawDeg:75},{previous:{yawDeg:60},origin:{yawDeg:60},snapDeg:15});assert(next);await e.act({type:'UPDATE_FURNITURE',id:'rotate-desk',patch:{pose:{xMm:600}}});assert.equal(e.constrainRotate({id:'rotate-desk',yawDeg:90},{previous:{yawDeg:75},origin:{yawDeg:60},snapDeg:15}),false);assert.equal(e.read().state.furniture[0].pose.xMm,600);x.api.dispose();passed.push('Actual app pending rotation binds base/id/origin/previous, rejects stale contexts without losing safe state, consumes drop once and cannot resurrect pre-edit transaction.');
}
for(const keyboardTarget of ['left','handle','right','canvas']){
 const x=await rotationSetup(),node=keyboardTarget==='canvas'?x.api.canvas:x.button(keyboardTarget),before=S.serializeLayout(x.engine.read().state,x.catalog),origin=rotationSnapshot(x);
 for(const modifier of ['ctrlKey','metaKey','altKey'])for(const [key,shiftKey]of [['r',false],['R',true]]){
  let prevented=0;node.emit('keydown',{key,shiftKey,[modifier]:true,preventDefault(){prevented++}});assert.equal(prevented,0,keyboardTarget+' must not intercept '+modifier+'+'+key);assert.equal(x.rotations.length,0);assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),before);
  for(const [id,prior]of origin){assert.deepEqual(x.nodes(false).get(id).position.toArray(),prior.position.toArray());assert.equal(x.nodes(false).get(id).rotation.y,prior.yaw)}
 }
 for(const [key,shiftKey,yaw]of [['r',false,120],['R',true,30]]){let prevented=0;node.emit('keydown',{key,shiftKey,preventDefault(){prevented++}});assert.equal(prevented,1,'Plain rotation shortcut missing');angleNear(x.engine.read().state.furniture[0].pose.yawDeg,yaw,'Plain R/ShiftR after modified browser shortcut');}
 assert.equal(x.engine.read().past.length,2);assert.equal(S.serializeLayout(x.engine.read().state,x.catalog),before);x.api.dispose();passed.push('Actual '+keyboardTarget+' keyboard callback leaves Ctrl/Meta/Alt+R/ShiftR browser actions uncancelled with no rotation/history; plainR/ShiftR still rotate.');
}
// Focus is an explicit camera operation. Selection, placement and other views stay independent.
for(const mode of ['perspective','top']){
 const x=operationSetup(true);x.api.view(mode);await settled();
 assert.equal(typeof x.api.focusSelected,'function','Selected camera focus API missing');
 const camera=x.renderer.lastCamera,initialCamera=cameraSnapshot(camera),serialized=S.serializeLayout(x.state(),x.catalog);
 assert.equal(x.api.focusSelected(),false,'No selection must not move camera');assert.deepEqual(cameraSnapshot(camera),initialCamera);
 x.api.setState(x.state(),'child');await settled();assert.deepEqual(cameraSnapshot(camera),initialCamera,'Selection alone must preserve camera');
 // A sidebar can select an object after the camera has panned away. F must find it.
 const controls=mode==='top'?allControls.at(-2):allControls.at(-1);camera.position.x+=30;controls.target.x+=30;camera.updateMatrixWorld(true);
 const panned=cameraSnapshot(camera);let prevented=0;
 for(const modifier of ['ctrlKey','metaKey','altKey'])x.api.canvas.emit('keydown',{key:'f',[modifier]:true,preventDefault(){prevented++}});
 x.api.canvas.emit('keydown',{key:'f',repeat:true,preventDefault(){prevented++}});
 assert.equal(prevented,0);assert.deepEqual(cameraSnapshot(camera),panned,'Modified browser shortcuts and repeats remain untouched');
 x.api.canvas.emit('keydown',{key:'f',preventDefault(){prevented++}});await settled();assert.equal(prevented,1);
 const selected=x.nodes(false).get('child'),bounds=new THREE.Box3().setFromObject(selected),center=bounds.getCenter(new THREE.Vector3());
 if(mode==='top')center.y=0;
 const projected=center.clone().project(camera);near(projected.x,0,'Selected center X');near(projected.y,0,'Selected center Y');
 const corners=mode==='top'?x.nodes(true).get('child').userData.planPoints.map(([a,b])=>new THREE.Vector3(a+selected.position.x,0,b+selected.position.z)):
  [0,1,2,3,4,5,6,7].map(i=>new THREE.Vector3(i&1?bounds.max.x:bounds.min.x,i&2?bounds.max.y:bounds.min.y,i&4?bounds.max.z:bounds.min.z));
 for(const corner of corners){const p=corner.project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1&&Math.abs(p.z)<=1,'Selected bounds must fit active projection')}
 assert.equal(S.serializeLayout(x.state(),x.catalog),serialized);assert.equal(x.commits.length,0);assert.equal(x.rotationCommits.length,0);
 const focused=cameraSnapshot(camera);x.api.view(mode==='top'?'perspective':'top');await settled();x.api.view(mode);await settled();assert.deepEqual(cameraSnapshot(camera),focused,'Other view must preserve focused camera');
 x.api.setState(x.state(),'missing');assert.equal(x.api.focusSelected(),false);assert.deepEqual(cameraSnapshot(camera),focused);
 x.api.dispose();assert.equal(x.api.focusSelected(),false);assert.equal(x.errors.length,0);
 passed.push('Selected focus '+mode+': real OrbitControls, offscreenF, complete bounds in frame, modified keys ignored, selection alone inert, independent camera roundtrip, no model pose/history or disposal side effects.');
}
{
 const x=operationSetup(true);x.api.view('perspective');await settled();x.api.setState(x.state(),'desk');await settled();
 const button=x.container.querySelector('[data-layout-action=focus-selected]');assert.ok(button,'Focusable selection tool missing');
 assert.equal(button.getAttribute('aria-label'),'layout.focusSelected');
 const camera=x.renderer.lastCamera,controls=allControls.at(-1);camera.position.x+=20;controls.target.x+=20;
 button.click();await settled();const bounds=new THREE.Box3().setFromObject(x.nodes(false).get('desk')).union(new THREE.Box3().setFromObject(x.nodes(false).get('child'))),p=bounds.getCenter(new THREE.Vector3()).project(camera);near(p.x,0,'Button cameraX');near(p.y,0,'Button cameraY');
 const at=screen(new THREE.Vector3(.4,.75,0),camera),before=cameraSnapshot(camera);x.api.canvas.emit('pointerdown',at);assert.equal(x.api.canvas.hasPointerCapture(71),true);
 assert.equal(x.api.focusSelected(),false,'Focus must not interrupt live move');assert.deepEqual(cameraSnapshot(camera),before);
 x.api.canvas.emit('pointercancel');assert.equal(x.commits.length,0);assert.equal(x.rotationCommits.length,0);
 const handlers=x.api.canvas.reviewHandlers;assert.ok((handlers.get('keydown')||[]).length>0);x.api.dispose();assert.equal((handlers.get('keydown')||[]).length,0,'Focus keyboard listener leaked after dispose');
 passed.push('Selected focus toolbar: accessible label, real event handler frames object, live pointer/capture cannot be interrupted and focus keyboard listener disposes.');
}
for(const dimensions of [{width:360,height:900},{width:1200,height:400}]){
 const x=operationSetup(true);size={...dimensions};x.observer.fn();x.api.view('perspective');await settled();x.api.setState(x.state(),'desk');
 const serialized=S.serializeLayout(x.state(),x.catalog);assert.equal(x.api.focusSelected(),true);await settled();const camera=x.renderer.lastCamera,b=new THREE.Box3().setFromObject(x.nodes(false).get('desk')).union(new THREE.Box3().setFromObject(x.nodes(false).get('child')));
 for(let i=0;i<8;i++){const p=new THREE.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z).project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,'Focus clips selected object in non-square viewport')}
 assert.equal(S.serializeLayout(x.state(),x.catalog),serialized);x.api.dispose();passed.push('Selected focus aspect '+dimensions.width+'x'+dimensions.height+': all eight object bounds corners fit; source plan unchanged.');
}

for(const mode of ['perspective','top']){
 const x=operationSetup(true),base=x.state(),child=base.printers[0];
 // A retained imported placement may overhang its desk. Frame actual complete
 // footprints, rather than assuming that the parent bounds contain its children.
 const state=S.createDefaultLayout({...base,printers:[{...child,attachment:{...child.attachment,xMm:750,zMm:500}}]},x.catalog),serialized=S.serializeLayout(state,x.catalog);
 x.api.setState(state,'desk');x.api.view(mode);await settled();assert.equal(x.api.focusSelected(),true);await settled();
 const camera=x.renderer.lastCamera,points=[];
 for(const id of ['desk','child'])if(mode==='top'){
  const flat=x.nodes(true).get(id);for(const [a,b]of flat.userData.planPoints)points.push(new THREE.Vector3(a+flat.position.x,0,b+flat.position.z));
 }else{const b=new THREE.Box3().setFromObject(x.nodes(false).get(id));for(let i=0;i<8;i++)points.push(new THREE.Vector3(i&1?b.max.x:b.min.x,i&2?b.max.y:b.min.y,i&4?b.max.z:b.min.z))}
 const union=new THREE.Box3().setFromPoints(points),center=union.getCenter(new THREE.Vector3()).project(camera);near(center.x,0,'Furniture+child union centerX');near(center.y,0,'Furniture+child union centerY');
 for(const p of points){p.project(camera);assert.ok(Math.abs(p.x)<1&&Math.abs(p.y)<1,'Focus must include attached printer outside parent footprint')}
 assert.equal(S.serializeLayout(state,x.catalog),serialized);assert.equal(x.commits.length,0);assert.equal(x.rotationCommits.length,0);x.api.dispose();
 passed.push('Furniture focus '+mode+' includes separate attached printer height and extended footprints in actual source-derived imported placement; no automatic repair or pose/history change.');
}
const ownerSourceStillMatchesSnapshot=sha(fs.readFileSync(input))===sha(Buffer.from(source));
assert.equal(ownerSourceStillMatchesSnapshot,true,'Renderer changed during source regression');
assert.deepEqual(findings,[],'Renderer contract regression findings');
const reportOption=process.argv.indexOf('--report');
if(reportOption>=0)fs.writeFileSync(path.resolve(process.argv[reportOption+1]),JSON.stringify({status:'PASS',cases:passed.length,passed,observations,renderer:pin(input),test:pin(fileURLToPath(import.meta.url)),imports,scope:'Actual private renderer source, actual Three math and vendored OrbitControls; DOM/WebGL/PNG bytes are CPU fixtures. No full models, GPU, trusted browser event or native fit claim.'},null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({status:'PASS',scope:'Real Three geometry/raycast and unchanged renderer bodies; DOM/WebGL/loaders are fixtures. No models, trusted browser events, GPU pixels or native fit.',cases:passed.length,rendererSHA256:sha(Buffer.from(source)),stateSHA256:pin(statePath).sha256,findings:0}));
} finally {
 const resolvedIntake=path.resolve(intake),resolvedTemp=path.resolve(fixtureTempRoot);
 assert.ok(resolvedIntake.startsWith(resolvedTemp+path.sep)&&path.basename(resolvedIntake).startsWith('layout-renderer-regression-'),'Temporary fixture path escaped its intended directory');
 fs.rmSync(resolvedIntake,{recursive:true,force:true});
}
