import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {registerHooks} from 'node:module';
registerHooks({resolve(specifier,context,next){
 if(specifier==='three')return {url:new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url).href,shortCircuit:true};
 if(/e3ng-mod-data\.mjs(?:\?|$)/.test(specifier))return {url:new URL('../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs',import.meta.url).href,shortCircuit:true};
 return next(specifier,context);
}});
const THREE=await import('three');
const {attachE3NGMods,defaultE3NGMods,validateE3NGMods}=await import('../site/viewer/source-assembly-runtime/e3ng-mods.mjs');
import {e3ngModParts,e3ngModModel,e3ngModAsset,e3ngPanelAsset} from '../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs';

const panelParts=e3ngModParts.filter(r=>r.scope==='full'),headParts=e3ngModParts.filter(r=>r.scope!=='full');
assert.equal(panelParts.length,4);assert.equal(headParts.length,2);
assert(panelParts.every(r=>r.control==='panels'&&r.choice==='hex'&&r.geometry_transform?.length===16));
assert.equal(e3ngModAsset.bytes,1458448);assert(e3ngPanelAsset.bytes>0&&e3ngPanelAsset.bytes<=8*1024*1024);
function fixture(headOnly=false){
const specs=headOnly?headParts:e3ngModParts;
const root=new THREE.Group(),parts=new Map(),rest=new Map(),materials=[],ownedGeometries=new Set();
// A translated viewer root catches accidental reapplication of a root basis.
root.position.set(.17,-.21,.09);
for(const spec of specs){
 if(parts.has(spec.host))continue;
 const node=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:spec.control==='base'?'#ab2200':'#113399'}));node.matrixAutoUpdate=false;node.matrix.fromArray(spec.host_world);root.add(node);
 const record={source_id:spec.host_source_sha256};parts.set(spec.host,{node,record});rest.set(spec.host,{world:node.matrix.clone()});materials.push({key:spec.host,material:node.material,color:node.material.color.clone(),role:spec.control==='base'?'A':'M'});
}
const companion=new THREE.Mesh(new THREE.BoxGeometry(1,1,1),new THREE.MeshStandardMaterial({color:'#999999',metalness:1}));root.add(companion);const purchasedColor=companion.material.color.clone();
let state={palette:{M:'#0011ee',A:'#ee2200'},pose:0,hidden:false};
const normal={root,packet:{model:{sha256:e3ngModModel},...(headOnly?{head_only_subset:true,scope:'source-head-subset'}:{})},parts,rest,materials,ownedGeometries,snapshot:()=>structuredClone(state),apply:s=>{assert(Number.isFinite(s.pose));state=structuredClone(s);for(const spec of specs){const n=parts.get(spec.host).node;n.matrix.fromArray(spec.host_world);n.matrix.elements[12]+=s.pose;n.visible=!s.hidden;}for(const r of materials)r.material.color.set(s.palette[r.role]);root.updateMatrixWorld(true);},reset(){this.apply({palette:{M:'#0011ee',A:'#ee2200'},pose:0,hidden:false});},dispose(){}};
normal.apply(state);
const replacement=new THREE.Group();
for(const spec of specs){const geometry=new THREE.BufferGeometry();geometry.setAttribute('position',new THREE.Float32BufferAttribute(new Float32Array(9),3));geometry.setAttribute('normal',new THREE.Float32BufferAttribute(new Float32Array(9),3));geometry.setIndex(new THREE.BufferAttribute(new Uint32Array(spec.triangles*3),1));const mesh=new THREE.Mesh(geometry,new THREE.MeshStandardMaterial());mesh.userData={e3ng_mod:spec.id,source_sha256:spec.source_sha256};if(spec.geometry_transform)mesh.matrix.fromArray(spec.geometry_transform);replacement.add(mesh);}
return {root,parts,rest,materials,normal,replacement,companion,purchasedColor};
}
const {root,parts,rest,materials,normal,replacement,companion,purchasedColor}=fixture();
const adapter=attachE3NGMods(normal,{scene:replacement});
assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
assert.equal(adapter.e3ngMods.fullAssembly,true);
const alternatives=['stock','hex'].flatMap(panels=>['stock','reinforced'].flatMap(base=>['stock','cable-hole'].map(cable=>({base,cable,panels}))));
alternatives.push(alternatives[0]);
let checks=0;
for(const choice of alternatives)for(const pose of [0,.05,-.05,.025,0]){
 const s={...adapter.snapshot(),pose,e3ng_mods:{schema:'e3ng-mods-v1',...choice}};adapter.apply(s);
 for(const {spec,mesh,host,geometryTransform}of adapter.e3ngMods.entries){const selected=choice[spec.control]===spec.choice;assert.equal(mesh.visible,selected);assert.equal(host.node.visible,!selected);const expected=host.node.matrixWorld.clone().multiply(geometryTransform);assert(mesh.matrixWorld.elements.every((x,i)=>Number.isFinite(x)&&Math.abs(x-expected.elements[i])<1e-12));assert(mesh.material.color.equals(new THREE.Color(s.palette[spec.control==='base'?'A':'M'])));}
 assert(companion.visible&&companion.material.color.equals(purchasedColor));checks++;
 const saved=JSON.parse(JSON.stringify(adapter.snapshot()));adapter.reset();adapter.apply(saved);assert.deepEqual(adapter.snapshot(),saved);
}
adapter.apply({...adapter.snapshot(),hidden:true,e3ng_mods:{schema:'e3ng-mods-v1',base:'reinforced',cable:'cable-hole'}});assert(adapter.e3ngMods.entries.every(r=>!r.mesh.visible&&!r.host.node.visible));
for(const bad of [null,[],{schema:'e3ng-mods-v1',base:'reinforced',cable:'stock',unknown:true},{schema:'wrong',base:'stock',cable:'stock'},{schema:'e3ng-mods-v1',base:'missing',cable:'stock'},{...defaultE3NGMods(),panels:'bad'},{...defaultE3NGMods(),panels:undefined},{...defaultE3NGMods(),unknown:true}]){
 const before=adapter.snapshot();assert.throws(()=>adapter.apply({...before,e3ng_mods:bad}));assert.deepEqual(adapter.snapshot(),before);
}
adapter.reset();assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
const old={...adapter.snapshot()};delete old.e3ng_mods;adapter.apply(old);assert.deepEqual(adapter.snapshot().e3ng_mods,defaultE3NGMods());
assert.throws(()=>attachE3NGMods({...normal,packet:{model:{sha256:'0'.repeat(64)}}},{scene:new THREE.Group()}));assert.throws(()=>validateE3NGMods({schema:'e3ng-mods-v1',base:'stock',cable:'no'}));
// A late inner failure occurs after native pose/visibility and palette writes.
// The outer source-color adapter can display source RGB while storing a custom
// palette, so restoring only the snapshot cannot restore the displayed colors.
const {attachSourceMaterialDisplay}=await import('../site/viewer/source-assembly-runtime/source-material-display.mjs');
const display=attachSourceMaterialDisplay(adapter),innerApply=normal.apply;
let lateRejectChecks=0;
for(const colorMode of ['source','palette'])for(const choice of alternatives.slice(0,8)){
 display.reset();
 display.apply({...display.snapshot(),pose:.025,hidden:false,palette:{M:'#22eec1',A:'#c12eee'},source_material_display:colorMode,e3ng_mods:{schema:'e3ng-mods-v1',...choice}});
 const before=display.snapshot(),beforeInner=normal.snapshot(),beforeColors=materials.map(r=>r.material.color.toArray());
 const beforeEntries=adapter.e3ngMods.entries.map(({mesh,host})=>({
  geometry:mesh.geometry,hostGeometry:host.node.geometry,visible:mesh.visible,hostVisible:host.node.visible,
  matrix:mesh.matrix.elements.slice(),world:mesh.matrixWorld.elements.slice(),
  hostMatrix:host.node.matrix.elements.slice(),hostWorld:host.node.matrixWorld.elements.slice()
 }));
 if(colorMode==='source')assert(materials.some(r=>!r.material.color.equals(new THREE.Color(before.palette[r.role]))),'Source RGB must differ from the stored custom palette for this regression');
 const lateError=Error('Injected late native-mate rejection');let innerCalls=0,sawMutatedPose=false,sawRestoredOriginal=false,sawMutatedColors=false;
 const attempted={...before,pose:-.04,palette:{M:'#eecc00',A:'#0055ff'},source_material_display:colorMode==='source'?'palette':'source',e3ng_mods:{schema:'e3ng-mods-v1',base:choice.base==='stock'?'reinforced':'stock',cable:choice.cable==='stock'?'cable-hole':'stock',panels:choice.panels==='stock'?'hex':'stock'}};
 normal.apply=next=>{
  innerApply(next);innerCalls++;
  if(innerCalls===1){
   // The original fixture commits pose and writes all current materials before
   // this throw. The replacement adapter has not run its visibility update yet.
   sawMutatedPose=normal.snapshot().pose===attempted.pose&&adapter.e3ngMods.entries.every(({host},i)=>host.node.matrix.elements[12]!==beforeEntries[i].hostMatrix[12]);
   sawRestoredOriginal=adapter.e3ngMods.entries.every(({host})=>host.node.visible);
   sawMutatedColors=materials.every((r,i)=>r.material.color.toArray().some((v,k)=>v!==beforeColors[i][k]));
   throw lateError;
  }
 };
 try{assert.throws(()=>display.apply(attempted),error=>error===lateError,'Preserve the initial rejection after a successful rollback');}
 finally{normal.apply=innerApply;}
 assert(sawMutatedPose&&sawRestoredOriginal&&sawMutatedColors,'Failure injection must happen after native visibility, pose and material mutation');
 assert.equal(innerCalls,2,'Reapply exactly the last accepted inner state');
 assert.deepEqual(normal.snapshot(),beforeInner,'Restore inner pose/palette snapshot');
 assert.deepEqual(display.snapshot(),before,'Restore selected mods, pose, palette and outer source-color mode');
 assert.deepEqual(materials.map(r=>r.material.color.toArray()),beforeColors,'Restore exact displayed RGB, including hidden stock and replacement materials');
 for(const [i,{spec,mesh,host}]of adapter.e3ngMods.entries.entries()){
  const previous=beforeEntries[i],selected=choice[spec.control]===spec.choice;
  assert.equal(mesh.geometry,previous.geometry);assert.equal(host.node.geometry,previous.hostGeometry);
  assert.equal(mesh.visible,selected);assert.equal(mesh.visible,previous.visible);
  assert.equal(host.node.visible,!selected);assert.equal(host.node.visible,previous.hostVisible,'Selected replacement must keep its original hidden after rejection');
  assert.deepEqual(mesh.matrix.elements,previous.matrix);assert.deepEqual(mesh.matrixWorld.elements,previous.world);
  assert.deepEqual(host.node.matrix.elements,previous.hostMatrix);assert.deepEqual(host.node.matrixWorld.elements,previous.hostWorld);
 }
 assert(root.visible,'Successful rollback must leave the previous assembly displayed');
 assert(companion.visible&&companion.material.color.equals(purchasedColor),'Purchased companion must remain untouched');
 lateRejectChecks++;
}
display.reset();assert.deepEqual(display.snapshot().e3ng_mods,defaultE3NGMods());
// Explicit head scope is the only permission to omit full-only hosts/meshes.
for(const choice of alternatives.slice(0,8)){
 const head=fixture(true),headAdapter=attachE3NGMods(head.normal,{scene:head.replacement},{mode:'head'});
 assert.equal(headAdapter.e3ngMods.entries.length,2);
 assert.equal(headAdapter.e3ngMods.fullAssembly,false);
 assert.deepEqual(headAdapter.e3ngMods.availability,{base:true,cable:true,panels:false});
 const saved={...headAdapter.snapshot(),e3ng_mods:{schema:'e3ng-mods-v1',...choice}};
 headAdapter.apply(saved);assert.deepEqual(headAdapter.snapshot(),saved);
 adapter.apply({...adapter.snapshot(),e3ng_mods:headAdapter.snapshot().e3ng_mods});
 assert.deepEqual(adapter.snapshot().e3ng_mods,saved.e3ng_mods);
 headAdapter.reset();assert.deepEqual(headAdapter.snapshot().e3ng_mods,defaultE3NGMods());
 const legacy={schema:'e3ng-mods-v1',base:choice.base,cable:choice.cable};
 headAdapter.apply({...saved,e3ng_mods:legacy});assert.deepEqual(headAdapter.snapshot().e3ng_mods,{...legacy,panels:'stock'});
}
for(const mode of [true,'unknown',null]){
 const f=fixture();assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement},{mode}),/scope/);
}
for(const packetChange of [{head_only_subset:true},{scope:'source-head-subset'},{head_only_subset:true,scope:'source-head-subset'}]){
 const f=fixture();Object.assign(f.normal.packet,packetChange);assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement}),/scope/);
}
{
 const f=fixture();Object.assign(f.normal.packet,{head_only_subset:true,scope:'source-head-subset'});
 assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement},{mode:'head'}),/scope/);
}
for(const spec of panelParts){
 for(const missing of ['host','mesh']){
  const f=fixture();if(missing==='host')f.parts.delete(spec.host);else f.replacement.remove(f.replacement.children.find(n=>n.userData.e3ng_mod===spec.id));
  assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement}),missing==='host'?/host changed/:/Missing or duplicated/);
 }
}
for(const bad of [NaN,Infinity,-Infinity])for(const spec of [headParts[0],panelParts[0]]){
 const f=fixture(),mesh=f.replacement.children.find(n=>n.userData.e3ng_mod===spec.id);mesh.matrix.elements[12]=bad;
 assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement}),/geometry transform/);
 assert.equal(mesh.parent,f.replacement,'Invalid GLTF must fail before attachment');
 const g=fixture();g.rest.get(spec.host).world.elements[0]=bad;
 assert.throws(()=>attachE3NGMods(g.normal,{scene:g.replacement}),/host changed/);
}
{
 const f=fixture();f.replacement.children[0].matrix.elements[12]+=.1;
 assert.throws(()=>attachE3NGMods(f.normal,{scene:f.replacement}),/geometry transform/);
}
// Multiple printed leaves sharing one stock host must all be visible. The
// source catalog is restored immediately; no generated input/file is changed.
{
 const saved=panelParts[1],index=e3ngModParts.indexOf(saved);
 e3ngModParts[index]={...saved,host:panelParts[0].host,host_source_sha256:panelParts[0].host_source_sha256,host_world:panelParts[0].host_world};
 try{
  const f=fixture(),a=attachE3NGMods(f.normal,{scene:f.replacement});
  for(const panels of ['hex','stock','hex','stock']){
   a.apply({...a.snapshot(),e3ng_mods:{...defaultE3NGMods(),panels}});
   for(const r of a.e3ngMods.entries.filter(r=>r.spec.control==='panels'))assert.equal(r.mesh.visible,panels==='hex');
  }
 }finally{e3ngModParts[index]=saved;}
}
// Reversed palette changes and reset use the same host M material, including
// source RGB; all new panel leaves remain printed and purchased parts survive.
for(const palette of [{M:'#ff0088',A:'#00ffee'},{M:'#00ffee',A:'#ff0088'},{M:'#ff0088',A:'#00ffee'}]){
 display.apply({...display.snapshot(),palette,source_material_display:'palette',e3ng_mods:{...defaultE3NGMods(),panels:'hex'}});
 for(const {spec,mesh}of adapter.e3ngMods.entries)if(spec.control==='panels')assert(mesh.material.color.equals(new THREE.Color(palette.M)));
 assert(companion.material.color.equals(purchasedColor));
}
display.reset();
for(const {mesh,source}of adapter.e3ngMods.entries)assert(mesh.material.color.equals(source.color));
{
 const before=display.snapshot(),colors=materials.map(r=>r.material.color.toArray()),reset=normal.reset;
 normal.reset=()=>{innerApply({...normal.snapshot(),pose:.123,palette:{M:'#123456',A:'#abcdef'}});throw Error('Late reset rejection');};
 try{assert.throws(()=>display.reset(),/Late reset rejection/);}finally{normal.reset=reset;}
 assert.deepEqual(display.snapshot(),before);assert.deepEqual(materials.map(r=>r.material.color.toArray()),colors);
}

// Execute the production loader with download/parser/assembly boundaries
// doubled. This verifies delivery scope and cleanup without network or assets.
const loaderText=await readFile(new URL('../site/viewer/source-assembly-loader.mjs',import.meta.url),'utf8');
const loaderFunction=loaderText.slice(loaderText.indexOf('export async function loadSourceAssembly')).replace('export async function','async function');
function loaderFixture({failPanel=false,abortPanel=false,failAttach=false,panelAsset=e3ngPanelAsset}={}){
 const fetched=[],released=[],attachments=[],signal={aborted:false};
 const scene=name=>({name,children:[],add(n){this.children.push(n);}}),main=scene('main'),normal={root:main,packet:{}};
 const env={
  e3ngModModel,e3ngModAsset,e3ngPanelAsset:panelAsset,
  assertLoadingBudget(){},selectedSourcePacket:p=>({...p,head_only_subset:true,scope:'source-head-subset'}),
  loadChunkedModel:async()=>({scene:main}),createAssembly:()=>normal,
  GLTFLoader:class{async parseAsync(asset){if(abortPanel&&asset===panelAsset)signal.aborted=true;return {scene:scene(asset===panelAsset?'panels':'head-mods')};}},
  fetchPinned:async(url,asset)=>{fetched.push(asset);if(failPanel&&asset===panelAsset)throw Error('Panel download failed');return asset;},
  attachE3NGMods:(a,gltf,options)=>{attachments.push({gltf,options});if(failAttach)throw Error('Attachment rejected');return a;},
  attachSourceMaterialDisplay:a=>a,releaseRoot:(...args)=>released.push(args)
 };
 return {load:Function(...Object.keys(env),'return ('+loaderFunction+');')(...Object.values(env)),fetched,released,attachments,signal,normal};
}
const packet={machine:'e3ng',model:{sha256:e3ngModModel}};
for(const mode of ['head','full','head','full']){
 const f=loaderFixture();await f.load(packet,{mode,headPlan:{},signal:f.signal});
 assert.deepEqual(f.fetched,mode==='head'?[e3ngModAsset]:[e3ngModAsset,e3ngPanelAsset]);
 assert.deepEqual(f.attachments[0].options,{mode});
 assert.equal(f.attachments[0].gltf.scene.children.length,mode==='head'?0:1);
}
{
 const f=loaderFixture();await f.load(packet,{includeModifications:false});assert.equal(f.fetched.length,0);assert.equal(f.attachments.length,0);
}
for(const options of [{failPanel:true},{abortPanel:true},{failAttach:true},{panelAsset:{...e3ngPanelAsset,bytes:8*1024*1024+1}},{panelAsset:{...e3ngPanelAsset,bytes:NaN}}]){
 const f=loaderFixture(options);await assert.rejects(f.load(packet,{signal:f.signal}));
 assert.equal(f.released.length,2,'Release optional scenes and native assembly on failure');
 assert.equal(f.released[0][0].name,'head-mods');assert.equal(f.released[1][0],f.normal.root);
 if(options.abortPanel)assert.equal(f.released[0][0].children[0].name,'panels','Canceled panel scene must be included in cleanup');
}
console.log(JSON.stringify({passed:true,late_reject_transactions:lateRejectChecks,color_modes:['source','palette'],restored:['inner state','mod selections','stock/replacement visibility','pose matrices','geometry identity','exact displayed material colors','purchased companion'],scope:'Small synthetic controller fixture; no asset loading, model parsing or native job.'}));
console.log(JSON.stringify({passed:true,combinations:8,forward_reverse_pose_transactions:checks,save_load:true,native_reset:true,scope:'Synthetic source-bound selection, companion preservation and controller matrices. Actual geometry and browser inspections are separate; physical fit is not qualified.'}));
