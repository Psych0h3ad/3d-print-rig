// Execute the exact patched production functions with real Three.js resources.
// Only I/O, DOM controls and host registration services are fixture boundaries.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {createInactiveHeadCache,canRestoreInactiveHeadIndices} from '../site/viewer/inactive-head-cache.mjs';
import {THREE,MiB,assetFixture,disposalCounter} from './head-cache-test-fixtures.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),arg=process.argv.indexOf('--candidate');
const candidate=arg<0?root:path.resolve(process.argv[arg+1]);
const sourceArg=process.argv.indexOf('--source'),source=sourceArg<0?candidate:path.resolve(process.argv[sourceArg+1]);
const sourceFile=name=>fs.readFileSync(path.join(source,'site/viewer',name),'utf8');
function nativeModule(text,names,extra={}){
 const clean=text.replace(/^import[^\n]*\n/gm,'').replace(/^export /gm,'');
 return vm.runInNewContext(clean+'\n;({'+names.join(',')+'})',{THREE,...extra});
}
const cover=nativeModule(sourceFile('rapido-x-uhf-cover.mjs'),['setRapidoXUhfSurface']);
const assembly=nativeModule(sourceFile('head-assembly.js'),['headPlan','headPlacement','partKey']);
const ledNative=nativeModule(sourceFile('led-emission-surface.mjs'),['cloneNativeLedTree','prepareLedSurface','restoreLedSurface']);
const animation=nativeModule(sourceFile('lighting-animation.mjs'),['ledSample']);
const lighting=nativeModule(sourceFile('toolhead-lighting.mjs'),['createToolheadLedRig'],{
 ...ledNative,...animation,identities:{},prepareOpticalGuideResponse(){throw Error('No optical-guide fixture requested')},pairedOpticalEmitter:()=>null
});
const promiseTask=run=>run(),point=p=>new THREE.Vector3(p[0],p[2],-p[1]).multiplyScalar(.001);
function provider({lit=false}={}){
 const history=[],calls=new Map();let fail=null;
 function model(id){
  if(id===fail)throw Error('fixture source load failed');
  const key=id==='stealthburner'?'423':'part',asset=assetFixture(id,48*MiB,{key});calls.set(id,(calls.get(id)||0)+1);
  if(id==='stealthburner')asset.geometry.setIndex([...Array(14).fill([0,0,0]).flat(),0,1,2]);
  if(lit){
   const geometry=new THREE.BoxGeometry(.01,.01,.01),original=geometry.attributes.position.array;
   geometry.setAttribute('position',new THREE.BufferAttribute(new Float32Array(asset.backing,0,original.length),3));
   geometry.attributes.position.array.set(original);asset.mesh.geometry=geometry;asset.geometry=geometry;
  }
  asset.mesh.userData.source_identity=asset.meta.source;
  const runtimeMaterials=new Map();let currentMaterial=asset.material;
  Object.defineProperty(asset.mesh,'material',{configurable:true,get:()=>currentMaterial,set(value){
   currentMaterial=value;for(const material of [].concat(value))if(material!==asset.material&&!runtimeMaterials.has(material))runtimeMaterials.set(material,disposalCounter(material));
  }});
  history.push({...asset,geometryDisposals:disposalCounter(asset.geometry),runtimeMaterials,
   materialDisposals:()=>[...runtimeMaterials.values()][0]?.()||0});
  return asset;
 }
 const meta=id=>({id,source:'test-source-'+id,parts:[{key:id==='stealthburner'?'423':'part',name:id,component:'source-hardware'}]});
 return {history,calls,set fail(id){fail=id},meta,
  fetch:async url=>{const id=path.basename(String(url),'.json');if(id===fail)throw Error('fixture metadata failed');return {ok:true,json:async()=>meta(id)}},
  loadModel:async(_loader,url)=>{const id=path.basename(String(url),'.glb'),asset=model(id);return {scene:asset.root}},
  assets:Object.fromEntries(['A','B','C','D','E','F','stealthburner'].map(id=>[id,{meta:'modules/'+id+'.json',glb:'modules/'+id+'.glb'}]))
 };
}
function installed(backend){
 const code=fs.readFileSync(path.join(candidate,'site/viewer/machine-heads.js'),'utf8');
 const start=code.indexOf('export function createMachineHeads('),end=code.indexOf('export function ensureMachineHeadControls(',start);
 assert(start>=0&&end>start);const definition=code.slice(start,end).replace(/^export /,'');
 const dependencies={THREE,Map,Set,createInactiveHeadCache,canRestoreInactiveHeadIndices,point,...cover,...ledNative,...assembly,
  workspaceTask:promiseTask,GLTFLoader:class{},fetch:backend.fetch,loadModel:backend.loadModel,bindLedSource(){},bindEvaMeshIdentities(){},validateEvaMetadata(){},
  madmaxPtfeAssetSpec:(_machine,_id,spec)=>spec,madmaxJointAssetSpec:(_machine,_id,spec)=>spec,captureMadmaxJoint:()=>null,setMadmaxJointPose(){},madmaxJointApplies:()=>false,
  createMonolithGantry:()=>({install:async()=>{},setPalette(){},setDelta(){}}),appearanceRole:()=>null,
  bankPlan:state=>({state,instances:state.instances||[]})};
 const create=vm.runInNewContext(definition+';createMachineHeads',dependencies);
 const scene=new THREE.Scene(),catalog={machine_id:'fixture',base_assets:backend.assets,assets:backend.assets};
 return {rig:create(scene,catalog),scene};
}
function variant(id){return {id:'variant-'+id,toolhead:id,base_asset:id,head_translation_mm:[11,22,33],base_hidden_keys:[],modules:[],mount:'fixed',
 machine_head:{base:id,translation:[11,22,33],hidden:[],modules:[]}};}
async function installedChecks(){
 const backend=provider(),{rig}=installed(backend),a=variant('A');
 for(const id of ['A','B','C','D','E']){await rig.install(variant(id));if(rig.cachePolicy)assert(rig.cachePolicy.report.withinLimit);}
 assert(!rig.cache.has('A'),'Installed runtime must evict without auditor trimming');assert.equal(backend.history[0].geometryDisposals(),1);
 await rig.install(a);assert.equal(backend.calls.get('A'),2);assert.equal(rig.active,a);
 assert.deepEqual(rig.cache.get('A').loaded.root.position.toArray(),point([11,22,33]).toArray());
 assert.equal(rig.cache.get('A').loaded.meta.source,'test-source-A');assert.equal(rig.cache.get('A').loaded.entries[0].mesh.userData.part_key,'part');
 rig.setDelta([3,7,11]);assert.deepEqual(rig.rig.position.toArray(),point([3,7,11]).toArray());
 const before=rig.active;backend.fail='F';await assert.rejects(rig.install(variant('F')),/fixture/);assert.equal(rig.active,before);assert(rig.cache.get('A').loaded.root.visible);backend.fail=null;
 // A successful switch's cleanup exception must not reject the new selection.
 const inactive=[...rig.cache].find(([id])=>id!=='A')[1].loaded;inactive.root.traverse(n=>{if(n.geometry)n.geometry.addEventListener('dispose',()=>{throw Error('dispose hook fixture')})});
 await assert.doesNotReject(rig.install(null));assert.equal(rig.active,null);assert.equal(rig.cache.size,0);
 for(const entry of backend.history){assert.equal(entry.geometryDisposals(),1);assert.equal(entry.materialDisposals(),1);}
 return 'installed exact production install: default-capacity eviction, A-E-A reload, metadata/IDs/placements, failed load and none cleanup';
}
async function bankChecks(){
 const backend=provider(),{rig}=installed(backend);await rig.install(variant('A'));
 await rig.setBank({enabled:true,instances:[{id:'A',slot:1,kind:'parked',translation_mm:[50,60,70]}]});
 const original=rig.cache.get('A').loaded,clone=rig.bankRig.children[0],clonedMesh=clone.children[0],texture=new THREE.DataTexture(new Uint8Array(16),2,2);
 original.entries[0].materials[0].map=texture;clonedMesh.material.map=texture;
 const countG=disposalCounter(original.root.children[0].geometry),countT=disposalCounter(texture),countCloneMaterial=disposalCounter(clonedMesh.material);
 assert.equal(clonedMesh.geometry,original.entries[0].mesh.geometry);assert.deepEqual(clone.position.toArray(),point([50,60,70]).toArray());
 // Keep A parked while later source heads switch. Bank source A may leave its
 // cache, but its geometry/texture must remain usable by each parked clone.
 for(const id of ['B','C','D','E'])await rig.install(variant(id));
 assert.equal(countG(),0);assert.equal(countT(),0);assert.equal(countCloneMaterial(),1,'Replaced parked-clone material freed once');
 await rig.setBank({enabled:false});await rig.install(null);assert.equal(countG(),1);assert.equal(countT(),1);
 return 'installed parked clones preserve geometry/textures and registered offsets across source switches and bank cleanup';
}
function standalone(backend){
 const text=fs.readFileSync(path.join(candidate,'site/viewer/toolheads.js'),'utf8');
 const cacheStart=text.indexOf('const headCache=createInactiveHeadCache(');
 const declaration=cacheStart<0?'':text.slice(cacheStart,text.indexOf('let catalog,builder',cacheStart));
 const asset=text.slice(text.indexOf('async function asset(id)'),text.indexOf('const point=',text.indexOf('async function asset(id)')));
 const releaseStart=text.indexOf('function releaseInactiveHeads(')>=0?text.indexOf('function releaseInactiveHeads('):text.indexOf('function releaseUnusedEvaHeads(');
 const release=text.slice(releaseStart,text.indexOf('function clearGuide(',releaseStart));
 const install=text.slice(text.indexOf('async function install(variant)'),text.indexOf('function changerDisplay()',text.indexOf('async function install(variant)')));
 const scene=new THREE.Scene(),bench=new THREE.Group();scene.add(bench);const controls=new Map();
 const $=id=>{if(!controls.has(id))controls.set(id,{dataset:{},checked:false,value:0});return controls.get(id)};
 const context={THREE,Map,Set,createInactiveHeadCache,canRestoreInactiveHeadIndices,...cover,...assembly,workspaceTask:promiseTask,
  scene,bench,point,bankRig:null,GLTFLoader:class{},fetch:backend.fetch,loadModel:backend.loadModel,location:{href:'https://fixture.test/viewer/toolheads.html'},
  catalog:{base_assets:backend.assets,assets:backend.assets},loader:{},toolBank:null,machineRegistry:{},$,document:{body:{dataset:{}}},
  bindLedSource(){},bindEvaMeshIdentities(){},validateEvaMetadata(){},appearanceRole:()=>null,
  appearance(){},inspection(){},visibleBounds(){},fit(){},changerDisplay(){},headPrinterLink:()=>({url:'https://fixture.test/',registered:false})};
 const execute=vm.runInNewContext('(function(){const cached=new Map();let currentVariant,ready;'+declaration+asset+release+install+';return {install,cached,headCache:typeof headCache===\'undefined\'?null:headCache,get current(){return currentVariant}}})',context);
 return {rig:execute(),scene};
}
async function standaloneChecks(){
 const backend=provider(),{rig}=standalone(backend);
 for(const id of ['A','B','C','D','E'])await rig.install(variant(id));
 assert(!rig.cached.has('A'),'Standalone runtime must evict non-EVA assets');assert.equal(backend.history[0].geometryDisposals(),1);
 const restored=variant('A');await rig.install(restored);assert.equal(rig.current,restored);assert.equal(backend.calls.get('A'),2);
 assert.equal(rig.cached.get('A').loaded.meta.source,'test-source-A');assert.deepEqual(rig.cached.get('A').loaded.root.position.toArray(),point([11,22,33]).toArray());
 backend.fail='F';await assert.rejects(rig.install(variant('F')),/fixture/);assert.equal(rig.current,restored);assert(rig.cached.get('A').loaded.root.visible);
 return 'standalone exact production asset/install: all-family default budget, reload/source/placements and failed-load preservation';
}
async function ledChecks(){
 const backend=provider({lit:true}),{rig,scene}=installed(backend),owned=[];
 const led=lighting.createToolheadLedRig(scene,{identify:()=>({id:'fixture-led',kind:'logo',normal:[0,0,1]}),apertureFor:()=>null,guideFor:()=>null,own:resource=>owned.push(resource)});
 scene.userData.toolheadLedController=led;
 await rig.install(variant('A'));led.update();
 const first=backend.history[0],indices=first.geometry.index.array.slice(),positions=first.geometry.attributes.position.array.slice(),nativeGeometry=first.geometry;
 for(const id of ['B','C','D','E']){await rig.install(variant(id));led.update();}
 assert(!rig.cache.has('A'));assert.equal(first.mesh.geometry,nativeGeometry);assert.deepEqual(nativeGeometry.index.array,indices);assert.deepEqual(nativeGeometry.attributes.position.array,positions);
 assert.equal(first.geometryDisposals(),1);assert.equal(first.materialDisposals(),1);assert(!led.emitters.some(e=>e.mesh===first.mesh));
 await rig.install(null);led.dispose();for(const resource of owned)resource.dispose();
 for(const entry of backend.history){assert.equal(entry.geometryDisposals(),1);assert.equal(entry.materialDisposals(),1);}
 return 'actual production LED discover/restore: original triangles and buffers unchanged, stale emitters removed and scope cleanup disposes once';
}
async function rapidoChecks(){
 const backend=provider(),{rig}=installed(backend),v={...variant('stealthburner'),cover_source:{kind:'original_uhf'}};
 await rig.install(v);const original=rig.cache.get('stealthburner').loaded,entry=original.entries[0],native=entry.uhfSurface.source.slice(),draw={...entry.uhfSurface.draw};
 assert.equal(entry.mesh.geometry.drawRange.count,3);let resetAtDispose=false;
 entry.mesh.geometry.addEventListener('dispose',()=>{
  assert.deepEqual(entry.mesh.geometry.index.array,native);assert.deepEqual(entry.mesh.geometry.drawRange,draw);resetAtDispose=true;
 });
 for(const id of ['A','B','C','D'])await rig.install(variant(id));
 assert(!rig.cache.has('stealthburner'));assert(resetAtDispose,'Native UHF indices must be restored before eviction disposal');
 await rig.install(v);assert.equal(backend.calls.get('stealthburner'),2);assert.equal(rig.cache.get('stealthburner').loaded.entries[0].mesh.geometry.drawRange.count,3);
 await rig.install(null);assert.equal(rig.cache.size,0);

 const cache=new Map(),bank=new THREE.Group(),asset=assetFixture('shared-UHF',1024,{key:'423'});
 asset.geometry.setIndex([...Array(14).fill([0,0,0]).flat(),0,1,2]);cover.setRapidoXUhfSurface(asset.entries,true);
 const clone=asset.root.clone(true);clone.visible=true;bank.add(clone);const source=asset.entries[0].uhfSurface.source.slice();
 const policy=createInactiveHeadCache(cache,{protectedRoots:()=>[bank],beforeEvict:(a,{protectedResources})=>{
  if(!canRestoreInactiveHeadIndices(a,protectedResources))return false;cover.setRapidoXUhfSurface(a.entries,false);
 }});
 const promise=Promise.resolve(asset);promise.loaded=asset;cache.set('shared',promise);policy.track('shared',promise);await promise;await Promise.resolve();
 let result=policy.commit([],{purge:true});assert.deepEqual(result.blocked,['shared']);assert.equal(asset.geometry.drawRange.count,3,'Parked shared UHF surface must not be mutated');
 bank.remove(clone);policy.release([clone]);result=policy.commit([],{purge:true});assert.equal(cache.size,0);assert.deepEqual(asset.geometry.index.array,source);
 return 'actual production Rapido X UHF setter: native index/draw reset before eviction, A-B-A reload and shared bank index guard';
}
const tests=[];
const consumerArg=process.argv.indexOf('--consumer'),consumer=consumerArg<0?'all':process.argv[consumerArg+1];
for(const run of consumer==='installed'?[installedChecks]:consumer==='standalone'?[standaloneChecks]:[installedChecks,bankChecks,standaloneChecks,ledChecks,rapidoChecks]){tests.push(await run());globalThis.gc?.();}
console.log(JSON.stringify({passed:true,tests,actual_production_consumer_functions:true,auditor_trimming_used:false,real_buffers_per_asset:48*MiB,
 scope:'Exact production cache consumers with real Three.js allocation and lifecycle fixtures. Transport/host registration/DOM services are isolated fixtures; no actual CAD, browser, native-solid or all-pattern audit claimed.'}));
