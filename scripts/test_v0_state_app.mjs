// Evaluate the real V0 mount/controller with a minimal DOM and keyed meshes.
// This is software integration coverage, not a browser or exported-mesh audit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {webcrypto,createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import {installationsModule,stateModule} from './v0-state-test-runtime.mjs';
import {translate,loadLanguage} from '../site/viewer/i18n.mjs';
await loadLanguage('ko');assert.equal(translate('Load error: Invalid XYZ settings','ko'),'로드 오류: 잘못된 XYZ 설정');
assert.equal(translate('Load error: Invalid XYZ settings','en'),'Load error: Invalid XYZ settings');
import * as libraryModule from '../site/viewer/v0-mod-library.mjs';
import * as adapterModule from '../site/viewer/v0_adapter.mjs';
import {fixtureProfile,makeV0Fixture,modStates,conflicts} from './v0-state-fixtures.mjs';
const catalog=JSON.parse(await fs.readFile(new URL('../site/V0_INSTALLATIONS.json',import.meta.url),'utf8'));
const appSource=await fs.readFile(new URL('../site/viewer/v0-app.js',import.meta.url),'utf8');
const plain=value=>JSON.parse(JSON.stringify(value));
const summary={result:'PASS',workers:1,appSelections:0,fileRestorations:0,urlStartupRestorations:0,invalidStartupLinks:0,failedLoads:0,races:0,resets:0,poseReversals:0,machines:[]};
class Element{
 constructor(id='',tag='input'){this.id=id;this.tag=tag;this.children=[];this.dataset={};this.checked=false;this.disabled=false;this.textContent='';this.files=[];this._value='';this.min='';this.max='';this.type='';this.classList={toggle:()=>{}}}
 get options(){return this.children}
 get value(){return this._value}
 set value(v){let s=String(v);if(this.type==='range'&&s!==''&&Number.isFinite(Number(s)))s=String(Math.max(Number(this.min),Math.min(Number(this.max),Number(s))));this._value=s}
 append(...children){this.children.push(...children);if(this.tag==='select'&&!this.value&&children.length)this.value=children[0].value}
 replaceChildren(...children){this.children=[];this.value='';this.append(...children)}
 setAttribute(){}removeAttribute(){}click(){this.onclick?.()}getBoundingClientRect(){return {width:900,height:700}}
}
async function mountApp(machine_id,mods,{rawURL,profile:providedProfile}={}){
 const profile=structuredClone(providedProfile||fixtureProfile(machine_id)),stockProfile=structuredClone(profile),registry=catalog.machines[machine_id],fixture=makeV0Fixture(registry,profile);
 const registration=structuredClone(catalog),metadata=new Map(),badHashes=new Set(),gates=new Map(),missingParts=new Set(),storage=new Map(),elements=new Map(),historyCalls=[],blobs=[],cleanups=[];
 const library={items:libraryModule.v0ModCategories.flatMap(category=>category.mods.map(id=>({id:'v0mod_'+id,kind:'mod',label:id})))};
 for(const [module,source]of Object.entries(registration.sources)){
  const bytes=new TextEncoder().encode(JSON.stringify({fixture:true,module}));metadata.set(source.metadata||'modules/'+module+'/module.json',{module,bytes});source.metadata_sha256=createHash('sha256').update(bytes).digest('hex');
 }
 const $=selector=>{if(!elements.has(selector)){const id=selector.replace(/^#/,''),e=new Element(id,['modCategory','modLibrary'].includes(id)?'select':'input');if(['enclosure','belts'].includes(id))e.checked=true;if(['x','y','z','doorAngle','tophatAngle'].includes(id)){e.type='range';e.min='0';e.max=id==='doorAngle'?'110':id==='tophatAngle'?'90':'120';e.value='0'}elements.set(selector,e)}return elements.get(selector)};
 const document={querySelector:$,createElement:tag=>new Element('',tag),body:{dataset:{}},documentElement:{dataset:{}}};
 // Register dynamically created controls with querySelector just like a DOM.
 const fields=$('#v0ModFields');fields.append=(...children)=>{fields.children.push(...children);for(const child of children)if(child.id)elements.set('#'+child.id,child)};
 const href=rawURL||stateModule.v0ModsURL('https://example.test/rig/viewer/v0.html?lang=ja&embed=1',{machine_id,registry},mods||stateModule.stockV0Mods());
 const location={href,get search(){return new URL(this.href).search}};
 const history={state:{workspaceMarker:42},replaceState(state,title,url){assert.equal(state,this.state);location.href=String(url);historyCalls.push(location.href)}};
 const scope={renderer:r=>r,scene:s=>s,resource:r=>r,cleanup:fn=>cleanups.push(fn)};
 let programFrame,programPose;
 const namespaces={
  'workspace-entry.mjs':{ensureWorkspaceEntry:()=>{}},
  'i18n.mjs':{translate},
  'display-preferences.mjs':{setupSceneDisplay:()=>{}},
  'workspace-lifecycle.mjs':{workspaceTask:fn=>Promise.resolve().then(fn),workspaceFrame:()=>1,workspaceListen:()=>{},WorkspaceResizeObserver:class{observe(){}}},
  'workspace-navigation.mjs':{replaceWorkspaceURL:(state,title,url)=>history.replaceState(state,title,url)},
  'v0-installations.mjs':installationsModule,'v0-state.mjs':stateModule,'v0-mod-library.mjs':libraryModule,
  'component-assets.mjs':{loadExternalComponent:()=>{throw Error('Unexpected external source')}},
  'responsive-camera.mjs':{setResponsiveAspect:()=>{},frameResponsiveView:()=>{}},
  'appearance-role.mjs':{appearanceRole:()=>null},
  three:{...THREE,WebGLRenderer:class{domElement={};setPixelRatio(){}setClearColor(){}render(){}setSize(){}dispose(){}}},
  'OrbitControls.js':{OrbitControls:class{target=new THREE.Vector3();addEventListener(){}update(){}dispose(){}}},
  'GLTFLoader.js':{GLTFLoader:class{}},
  'model-loader.js':{loadModel:async(loader,path)=>{
   if(path.endsWith('/'+machine_id+'/model.glb'))return {scene:fixture.scene};
   const module=Object.keys(registration.sources).find(id=>'../'+(registration.sources[id].glb||'modules/'+id+'/module.glb')===path);
   if(!module)throw Error('Unexpected model: '+path);if(gates.has(module))await gates.get(module);
   const value=await fixture.loadModule(module);if(missingParts.has(module)){const scene=value.scene.clone(true);scene.remove(scene.children[0]);return {scene}}return value;
  }},
  'v0_adapter.mjs':{...adapterModule,createV0Adapter:()=>fixture.adapter},
  'machines.js':{setupMachineNavigation:()=>{}},
  'grid-control.js':{setupGrid:(scene,render)=>{const grid=new THREE.Group();$('#gridVisible').onchange=()=>{grid.visible=$('#gridVisible').checked;render()};return grid}},
  'render-export.js':{setupRenderExport:()=>{}},'public-info.js':{setupPublicInfo:()=>{}},
  'gcode-panel.js':{setupGcodePanel:options=>({updatePath:pose=>{programPose=[...pose]}}),displayedMachineLimits:()=>{}},
  'gcode-timeline.mjs':{programPoint:(frame,xyz)=>{programFrame=frame;return xyz},programPathOffset:()=>[0,0,0]},
 };
 const fetch=async path=>{
  if(path.endsWith('/assembly_manifest.json'))return {ok:true,json:async()=>({parts:[...fixture.adapter.records].map(([key,row])=>({key,...row}))})};
  if(path.endsWith('/machine_profile.json'))return {ok:true,json:async()=>profile};
  if(path.includes('COMPONENT_LIBRARY'))return {ok:true,json:async()=>library};
  if(path.includes('V0_INSTALLATIONS'))return {ok:true,json:async()=>registration};
  const entry=metadata.get(path.replace(/^\.\.\//,''));if(!entry)throw Error('Unexpected fetch: '+path);
  const bytes=badHashes.has(entry.module)?new Uint8Array([1,2,3]):entry.bytes;
  return {ok:true,arrayBuffer:async()=>bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength)};
 };
 const TestURL=class extends URL{static createObjectURL(){return 'blob:v0-state-fixture'}static revokeObjectURL(){}};
 const context=vm.createContext({document,window:{},location,history,devicePixelRatio:1,URL:TestURL,URLSearchParams,TextEncoder,structuredClone,crypto:webcrypto,fetch,Blob:class{constructor(parts,options){blobs.push({parts,options})}},localStorage:{getItem:k=>storage.get(k)||null,setItem:(k,v)=>storage.set(k,v)},setTimeout:()=>1,console});
 const dependency=specifier=>{const key=specifier==='three'?'three':specifier.split('/').at(-1).split('?')[0];assert(namespaces[key],'Missing dependency stub: '+key);return key};
 const code=appSource.replace(/^import \{([^}]+)\} from '([^']+)';$/gmu,(_,names,specifier)=>`const {${names}}=dependencies[${JSON.stringify(dependency(specifier))}];`).replace(/^import \* as (\w+) from '([^']+)';$/gmu,(_,name,specifier)=>`const ${name}=dependencies[${JSON.stringify(dependency(specifier))}];`).replace(/\bimport\.meta\.url/gu,JSON.stringify('https://example.test/rig/viewer/v0-app.js')).replace(/^export /gmu,'');
 // Dependency injection preserves the controller body and closures while
 // allowing the normal source-test runner to avoid experimental VM modules.
 const factory=vm.runInContext(`(function(dependencies){${code}\nreturn {mount,setV0Mods,currentV0,captureV0State,restoreV0State};})`,context,{filename:'v0-app.js'});
 const api=factory(namespaces);await api.mount(scope);assert.equal(document.body.dataset.ready,'true',document.body.dataset.error);assert.equal($('#saveConfiguration').disabled,false);
 return {api,fixture,profile,stockProfile,$,location,history,historyCalls,document,badHashes,gates,missingParts,blobs,programPose:()=>programPose,dispose(){for(const fn of cleanups.reverse())fn();fixture.dispose()}};
}
for(const [machine_id,registry]of Object.entries(catalog.machines)){
 // A provided local exported profile is read as metadata only; meshes stay
 // fixtures. There is deliberately no model/CAD download or parse here.
 const profile=process.argv[2]?JSON.parse(await fs.readFile(new URL('file:///'+process.argv[2].replace(/\\/g,'/')+'/machines/'+machine_id+'/machine_profile.json'),'utf8')):fixtureProfile(machine_id);
 const initial={...stateModule.stockV0Mods(),toolhead:'rapid-burner-rapido-uhf-sherpa-cat',bed:'kirigami-bed',carriage:'heatset-carriage',accelerometer:'adxl-3',handles:'stealth-handles',tophat:'cat-flap-lift-off'};
 const app=await mountApp(machine_id,initial,{profile});summary.urlStartupRestorations++;
 assert.deepEqual(plain(app.api.captureV0State().mods),initial);assert(app.$('#configurationStatus').textContent.includes('共有リンク'));assert.equal(new URL(app.location.href).searchParams.get('lang'),'ja');assert.equal(app.history.state.workspaceMarker,42);
 const oldDatum=[...app.profile.display_reference_xyz_mm];
 for(const [i,axis]of ['x','y','z'].entries())app.$('#'+axis).value=[25,75,60][i];app.$('#x').oninput();
 const physical=app.api.captureV0State().pose.map((n,i)=>n-oldDatum[i]);await app.api.setV0Mods(stateModule.stockV0Mods());assert.deepEqual(plain(app.profile.sampled_clearance_limits_mm),plain(profile.sampled_clearance_limits_mm));
 const adjusted=app.api.captureV0State().pose;for(let i=0;i<3;i++)assert(Math.abs(adjusted[i]-Math.max(0,Math.min(120,physical[i]+app.profile.display_reference_xyz_mm[i])))<1e-8);
 let count=0;
 for(const mods of modStates(registry,installationsModule.v0Slots))if(!conflicts(registry,mods)){
  assert.equal(await app.api.setV0Mods(mods),true);summary.appSelections++;count++;
  for(const [slot]of installationsModule.v0Slots)assert.equal(app.$('#mod-'+slot).value,mods[slot]);
  assert.deepEqual(stateModule.readV0ModsURL(app.location.href,{machine_id,registry}),mods);
  const saved=plain(app.api.captureV0State());saved.pose=[0,60,120];saved.palette={base:'#ff3300',accent:'#00aaff',frame:'#eeeeee'};saved.enclosure=false;saved.belts=false;saved.grid=true;saved.door_angle_deg=110;saved.tophat_angle_deg=installationsModule.v0TophatMaxAngle(registry,mods);
  assert.equal(await app.api.restoreV0State(saved),true);summary.fileRestorations++;
  assert.deepEqual(plain(app.api.captureV0State()),saved);assert.deepEqual(app.programPose(),saved.pose);assert.equal(app.$('#tophatAngle').max,String(saved.tophat_angle_deg));assert.equal(app.$('#tophatAngle').value,String(saved.tophat_angle_deg));assert.equal(app.$('#frameFinish').value,'custom');
  const reversed={...saved,pose:[120,37,0],palette:{base:null,accent:null,frame:null},enclosure:true,belts:true,grid:false,door_angle_deg:0,tophat_angle_deg:0};
  assert.equal(await app.api.restoreV0State(reversed),true);assert.deepEqual(plain(app.api.captureV0State()),reversed);summary.fileRestorations++;summary.poseReversals++;
 }
 assert.equal(count,1152);
 const legacy=plain(app.api.captureV0State());legacy.mods={accelerometer:'none',strain_relief:'picobilical-plate',handles:'stealth-handles',tophat:'lift-off-tophat'};delete legacy.door_angle_deg;delete legacy.tophat_angle_deg;
 assert.equal(await app.api.restoreV0State(legacy),true);assert.deepEqual(plain(app.api.captureV0State().mods),{...stateModule.stockV0Mods(),...legacy.mods});
 app.$('#saveConfiguration').onclick();assert.equal(app.blobs.at(-1).options.type,'application/json');assert.deepEqual(JSON.parse(app.blobs.at(-1).parts[0]),plain(app.api.captureV0State()));
 // Exercise the file input handler, including invalid JSON and size guards.
 const file=plain(app.api.captureV0State());app.$('#configurationFile').files=[{size:100,text:async()=>JSON.stringify(file)}];await app.$('#configurationFile').onchange();assert.equal(app.$('#configurationStatus').textContent,'構成を復元しました');assert.equal(app.$('#configurationStatus').hidden,false);assert.equal(app.$('#configurationFile').value,'');
 const before=plain(app.api.captureV0State()),urlBefore=app.location.href;
 for(const invalid of [{...file,pose:[null,60,120]},{...file,mods:{...file.mods,toolhead:'v0mod_mailbox_v5'}}]){await assert.rejects(app.api.restoreV0State(invalid));assert.deepEqual(plain(app.api.captureV0State()),before);assert.equal(app.location.href,urlBefore)}
 app.$('#configurationFile').files=[{size:100,text:async()=>'{'}];await app.$('#configurationFile').onchange();assert(app.$('#configurationStatus').textContent.startsWith('読込エラー:'));assert.deepEqual(plain(app.api.captureV0State()),before);
 app.document.documentElement.lang='en';app.$('#configurationFile').files=[{size:100,text:async()=>JSON.stringify({...before,pose:[999,0,0]})}];await app.$('#configurationFile').onchange();const sourceError=app.$('#configurationStatus').textContent;assert.equal(sourceError,'読込エラー: XYZ設定が不正です');assert.equal(translate(sourceError,'en'),'Load error: Invalid XYZ settings');assert.equal(translate(sourceError,'ko'),'로드 오류: 잘못된 XYZ 설정');assert.equal(translate(sourceError,'ja'),'読込エラー: XYZ設定が不正です');assert.equal(app.$('#configurationStatus').hidden,false);assert.deepEqual(plain(app.api.captureV0State()),before);app.document.documentElement.lang='ja';
 app.$('#configurationFile').files=[{size:1048577,text:async()=>{throw Error('Should not read oversized file')}}];await app.$('#configurationFile').onchange();assert(app.$('#configurationStatus').textContent.includes('大きすぎ'));assert.deepEqual(plain(app.api.captureV0State()),before);
 await app.$('#resetMods').onclick();summary.resets++;assert.deepEqual(plain(app.api.captureV0State().mods),stateModule.stockV0Mods());assert.deepEqual(plain(app.profile.sampled_clearance_limits_mm),plain(profile.sampled_clearance_limits_mm));assert.deepEqual(stateModule.readV0ModsURL(app.location.href,{machine_id,registry}),stateModule.stockV0Mods());
 summary.machines.push({machine_id,selections:count,profileSource:process.argv[2]?'Local exported profile metadata':'State fixture',restoredLiftOffAngle:110});app.dispose();
 // Missing URL state leaves stock. Invalid explicit state never installs a
 // source-library candidate, switches machines or clears the error silently.
 const ordinary=await mountApp(machine_id,null,{rawURL:'https://example.test/rig/viewer/v0.html?machine='+machine_id,profile});assert.deepEqual(plain(ordinary.api.captureV0State().mods),stateModule.stockV0Mods());assert.equal(ordinary.historyCalls.length,0);ordinary.dispose();
 for(const raw of ['{',JSON.stringify({...stateModule.stockV0Mods(),toolhead:'v0mod_mailbox_v5'}),JSON.stringify({...stateModule.stockV0Mods(),toolhead:'dragon-burner-revo-sherpa',strain_relief:'picobilical-plate'})]){const url=new URL('https://example.test/rig/viewer/v0.html');url.searchParams.set('machine',machine_id);url.searchParams.set(stateModule.v0ModsParameter,raw);const invalid=await mountApp(machine_id,null,{rawURL:url.href,profile});assert.deepEqual(plain(invalid.api.captureV0State().mods),stateModule.stockV0Mods());assert(invalid.$('#configurationStatus').textContent.startsWith('共有リンクの読込エラー:'));assert.equal(invalid.historyCalls.length,0);invalid.dispose();summary.invalidStartupLinks++}
 // Guard a new, uncached source: wrong metadata hash and missing source part.
 const guarded=await mountApp(machine_id,stateModule.stockV0Mods(),{profile}),source='v0mod_picobilical',target={...stateModule.stockV0Mods(),strain_relief:'picobilical-plate'};
 guarded.badHashes.add(source);let guardBefore=plain(guarded.api.captureV0State()),guardURL=guarded.location.href;await assert.rejects(guarded.api.restoreV0State({...guardBefore,mods:target}),/バージョン/);assert.deepEqual(plain(guarded.api.captureV0State()),guardBefore);assert.equal(guarded.location.href,guardURL);assert.equal(guarded.$('#saveConfiguration').disabled,false);summary.failedLoads++;
 guarded.badHashes.delete(source);guarded.missingParts.add(source);await assert.rejects(guarded.api.setV0Mods(target),/部品が不足/);assert.deepEqual(plain(guarded.api.captureV0State()),guardBefore);assert.equal(guarded.location.href,guardURL);summary.failedLoads++;
 // The installation cache holds the failed keyed model; use a fresh mount
 // for the deterministic source-load race and a successful retry afterward.
 guarded.dispose();const raced=await mountApp(machine_id,stateModule.stockV0Mods(),{profile});let release;const gate=new Promise(resolve=>{release=resolve});raced.gates.set(source,gate);
 const saved=plain(raced.api.captureV0State());saved.mods=target;saved.pose=[1,2,3];saved.palette.base='#ff0000';
 const pending=raced.api.restoreV0State(saved);while(!raced.$('#saveConfiguration').disabled)await new Promise(resolve=>setImmediate(resolve));
 const newest=raced.api.setV0Mods(stateModule.stockV0Mods());assert.equal(await newest,true);release();assert.equal(await pending,false);assert.deepEqual(plain(raced.api.captureV0State().mods),stateModule.stockV0Mods());assert.notDeepEqual(plain(raced.api.captureV0State().pose),saved.pose);assert.equal(raced.api.captureV0State().palette.base,null);assert.equal(raced.$('#saveConfiguration').disabled,false);summary.races++;
 assert.equal(await raced.api.restoreV0State(saved),true);assert.deepEqual(plain(raced.api.captureV0State()),saved);raced.dispose();
}
console.log(JSON.stringify({...summary,scope:'Real V0 app mount, production installation/state modules, minimal DOM and keyed mesh fixtures. No browser, GPU, exported-model or native-solid clearance audit.'},null,2));
