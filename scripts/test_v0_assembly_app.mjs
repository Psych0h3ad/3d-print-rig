// Execute the production assembly UI with the real static-stage/state modules.
// Keyed geometry and DOM fixtures cover software state only, not native CAD fit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import * as assemblyModule from '../site/viewer/v0-assembly.mjs';
import {installationsModule,stateModule} from './v0-state-test-runtime.mjs';
import {v0NativeStateProfile,v0NativeModelHash} from '../site/viewer/v0-native-installed-gate.mjs';
import {fixtureProfile} from './v0-state-fixtures.mjs';
import {createAssemblyIndex,readAssemblyStageDocument} from '../site/viewer/assembly-workbench-model.mjs';

const appURL=new URL('../site/viewer/v0-app.js',import.meta.url),appSource=await fs.readFile(appURL,'utf8');
const stageURL=new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url),stageBytes=await fs.readFile(stageURL),productionStages=JSON.parse(stageBytes);
const gateURL=new URL('../site/viewer/v0-native-installed-gate.mjs',import.meta.url),gateBytes=await fs.readFile(gateURL);
const machineIds=['voron_v02_120','voron_v02r1_120'];
const plain=value=>JSON.parse(JSON.stringify(value));
const sha=value=>createHash('sha256').update(value).digest('hex');
// Skip strings/comments while balancing the complete function. In particular,
// template interpolation braces cannot terminate the extracted source early.
function skipString(source,index){
 const quote=source[index];index++;
 while(index<source.length){
  if(source[index]==='\\'){index+=2;continue}
  if(source[index]===quote)return index+1;
  if(quote==='`'&&source[index]==='$'&&source[index+1]==='{'){
   index=balanced(source,index+1)+1;continue;
  }
  index++;
 }
 throw Error('Unterminated production string');
}
function balanced(source,start){
 assert.equal(source[start],'{');let depth=0;
 for(let i=start;i<source.length;i++){
  const c=source[i];
  if(c==='"'||c==="'"||c==='`'){i=skipString(source,i)-1;continue}
  if(c==='/'&&source[i+1]==='/'){const end=source.indexOf('\n',i+2);i=end<0?source.length:end;continue}
  if(c==='/'&&source[i+1]==='*'){const end=source.indexOf('*/',i+2);assert(end>=0);i=end+1;continue}
  if(c==='{')depth++;else if(c==='}'&&!--depth)return i;
 }
 throw Error('Unbalanced production function');
}
function extractFunction(name){
 const expression=new RegExp('(?:async\\s+)?function\\s+'+name+'\\s*\\(','gu');
 const matches=[...appSource.matchAll(expression)];assert.equal(matches.length,1,'Unique production function '+name);
 const start=matches[0].index,body=appSource.indexOf('{',start);
 return appSource.slice(start,balanced(appSource,body)+1);
}
// Use actual input handlers as well, so native resets are not a second copy.
function extractHandler(prefix){
 const start=appSource.indexOf(prefix);assert(start>=0,'Missing production handler '+prefix);
 const body=appSource.indexOf('{',start+prefix.length);
 return appSource.slice(start+prefix.length,balanced(appSource,body)+1);
}
let setup=extractFunction('setupAssemblyControls');
const importPattern=/await import\('\.\/v0-assembly\.mjs(?:\?[^']*)?'\)/gu;
assert.equal([...setup.matchAll(importPattern)].length,1,'Exactly one real assembly module import');
setup=setup.replace(importPattern,'dependencies.assemblyModule');
const functions=['applyPose','setV0Mods','captureV0State','restoreV0State'].map(extractFunction).join('\n');
const handlers=Object.fromEntries([
 ['reset',"$('#reset').onclick="],['belts',"$('#belts').onchange="],
 ['enclosure',"$('#enclosure').onchange="],['doorAngle',"$('#doorAngle').oninput="],
 ['tophatAngle',"$('#tophatAngle').oninput="],
].map(([key,prefix])=>[key,extractHandler(prefix)]));
const factory=vm.runInNewContext(`(dependencies=>{
 const {THREE,$,document,scene,camera,orbit,adapter,profile,stockProfile,currentManifest,id,location,
  installations,stateRestorer,program,scope,fetch,workspaceTask,frameResponsiveView,render,
  loadError,stockV0Mods,validateV0State,v0ConfigurationSchema,v0NativeStateProfile,
  createAssemblyIndex,readAssemblyStageDocument,v0NativeByteHash,createAssemblyWorkbench,createAssemblyPicker,renderer,formatMessage,translate}=dependencies;
 let palette=dependencies.palette,assemblyView=null,assemblySnapshot=null,assemblyLocked=false,
  assemblyControlStates=new Map(),assemblyData=null,assemblyStageHash=null,assemblyWorkbench=null;
 ${functions}
 ${Object.entries(handlers).map(([id,code])=>`$('#${id}').${['reset'].includes(id)?'onclick':['belts','enclosure'].includes(id)?'onchange':'oninput'}=${code};`).join('\n')}
 ${setup}
 setupAssemblyControls(dependencies.receipts);
 return {applyPose,setV0Mods,captureV0State,restoreV0State,
  state:()=>({assemblyView,assemblySnapshot,assemblyLocked,assemblyData,lockedControls:assemblyControlStates.size})};
})`,{Map,URL,Error,console},{filename:'v0-assembly-production-fixture.js',timeout:1000});

class Element{
 constructor(id,{assembly=false,mobile=false,role=null,disabled=false}={}){
  Object.assign(this,{id,assembly,mobile,role,disabled,hidden:false,checked:false,value:'',textContent:'',children:[],dataset:{}});
 }
 closest(selector){return selector==='#assemblyControls'&&this.assembly||selector==='.mobile-layout'&&this.mobile?this:null}
 getAttribute(name){return name==='role'?this.role:null}
 replaceChildren(...children){this.children=children}
 click(){if(!this.disabled)return this.onclick?.()}
 input(value){if(!this.disabled){this.value=String(value);return this.oninput?.()}}
}
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {promise,resolve,reject}};
async function waitFor(check){for(let i=0;i<100;i++){if(check())return;await Promise.resolve()}throw Error('Fixture event did not reach expected boundary')}
function mount({machine_id='voron_v02r1_120',nonstock=false,stale=false,fetchFailure=false,focusFailure=false,stockCompanion=false,missingModelReceipt=false,autoAssembly=false,preparationBoundary=false,driveBoundary=false,bedBoundary=false}={}){
 const id=machine_id,profile=fixtureProfile(id),stockProfile=structuredClone(profile);
 const keys=['frame','rail','block','screw','bed','alternative'],scene=new THREE.Scene(),nodes=new Map(),geometry=new THREE.BoxGeometry(.02,.02,.02);
 for(const [i,key]of keys.entries()){
  const node=new THREE.Group();node.userData.part_key=key;node.visible=key!=='alternative';
  node.position.set(key==='frame'?-1:.2+i*.04,.1,.05);node.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:i%2?'#aaaaaa':'#ca1020'})));
  scene.add(node);nodes.set(key,node);
 }
 const wrapper=new THREE.Group();wrapper.position.set(.45,.22,.12);wrapper.visible=stockCompanion;
 wrapper.add(new THREE.Mesh(geometry,new THREE.MeshStandardMaterial({color:'#24272c'})));scene.add(wrapper);
 const companionKeys=id==='voron_v02_120'?['block']:['rail','block'];
 if(stockCompanion)for(const key of companionKeys)nodes.get(key).visible=false;
 const original=()=>[...nodes].map(([key,n])=>({key,visible:n.visible,position:n.position.toArray(),quaternion:n.quaternion.toArray(),scale:n.scale.toArray(),material:n.children[0].material,color:n.children[0].material.color.getHex()}));
 const native=original(),events=[],elements=new Map(),cleanups=[];
 const controlIds=['assemblyStart','assemblyStage','assemblyPrevious','assemblyNext','assemblyFocus','assemblyFinish','assemblySteps','assemblyStatus','assemblyPartCount','assemblyManual','assemblyStepNote','stage'];
 for(const key of controlIds)elements.set(key,new Element(key,{assembly:true}));
 for(const key of ['x','y','z','xv','yv','zv','reset','enclosure','belts','gridVisible','doorAngle','doorAnglev','tophatAngle','tophatAnglev','saveConfiguration','loadConfiguration','configurationFile','resetMods','mod-toolhead','motionStatus','flexibleStatus','installationStatus'])elements.set(key,new Element(key));
 elements.set('preDisabled',new Element('preDisabled',{disabled:true}));
 elements.set('viewerLanguage',new Element('viewerLanguage'));
 elements.set('configTab',new Element('configTab',{role:'tab'}));elements.set('mobileConfig',new Element('mobileConfig',{mobile:true}));
 const $=selector=>{assert(selector.startsWith('#'));const node=elements.get(selector.slice(1));assert(node,'Unexpected DOM selector '+selector);return node};
 const asideControls=new Set(['assemblyStart','assemblyStage','assemblyPrevious','assemblyNext','assemblyFocus','assemblyFinish',
  'x','y','z','reset','enclosure','belts','gridVisible','doorAngle','tophatAngle','saveConfiguration','loadConfiguration','configurationFile',
  'resetMods','mod-toolhead','preDisabled','viewerLanguage','configTab','mobileConfig']);
 const document={documentElement:{lang:'en'},body:{dataset:{}},querySelectorAll:selector=>{assert.equal(selector,'aside input,aside select,aside button');return [...elements.values()].filter(node=>asideControls.has(node.id))},createElement:tag=>new Element('',{assembly:tag==='option'})};
 $('#assemblySteps').hidden=true;
 let pose=[25,75,60],door=35,tophat=40,flexible=false,enclosure=false;
 const adapter={nodes,getPose:()=>[...pose],door:{getAngle:()=>door},tophat:{getAngle:()=>tophat},
  setPose(value){pose=['x','y','z'].map(a=>value[a]);events.push({type:'pose',value:[...pose]});return {belts_visible:flexible,chain_visible:flexible,within_sampled_clearance_envelope:true}},
  setFlexibleVisible(value){flexible=value;events.push({type:'belts',value})},setEnclosureVisible(value){enclosure=value;events.push({type:'enclosure',value})},
  setDoorAngle(value){door=value;events.push({type:'door',value})},setTophatAngle(value){tophat=value;events.push({type:'tophat',value})},
 };
 const registry={options:[{slot:'toolhead',id:'fixture-head',label:'State-only fixture head'}]};
 let mods=stateModule.stockV0Mods();if(nonstock)mods.toolhead='fixture-head';
 const config=stateModule.validateV0State({profile,registry},{schema:stateModule.v0ConfigurationSchema,machine_id:id,mods,pose,palette:{base:'#18293a',accent:'#f1b502',frame:'#778899'},enclosure,belts:flexible,grid:true,door_angle_deg:door,tophat_angle_deg:tophat});
 const palette={...config.palette},tasks={fetchGate:null,nextInstallation:null,fetchCount:0,installationCalls:0};
 const roots=stockCompanion?new Map([['stock-carriage',[{wrapper,option:{slot:'carriage',id:'stock',replace_keys:companionKeys}}]]]):new Map();
 const installations={registry,roots,getState:()=>({...mods}),setPose:()=>{},setTophatAngle:value=>adapter.setTophatAngle(value),setEnclosureVisible:()=>{},
  async setState(next){
   tasks.installationCalls++;events.push({type:'mods',value:{...next}});const action=tasks.nextInstallation;tasks.nextInstallation=null;
   if(action){const accepted=await action.promise;if(accepted===false)return false}
   mods=installationsModule.validateV0Mods(registry,next);return true;
  },
 };
 const commit=value=>{
  events.push({type:'commit',configuration:Boolean(value)});
  if(!value)return;
  Object.assign(palette,value.palette);
  for(const [i,a]of ['x','y','z'].entries())$('#'+a).value=String(value.pose[i]);
  for(const key of ['enclosure','belts']){$('#'+key).checked=value[key];$('#'+key).onchange()}
  $('#gridVisible').checked=value.grid;
  $('#doorAngle').value=String(value.door_angle_deg);$('#doorAngle').oninput();
  $('#tophatAngle').value=String(value.tophat_angle_deg);$('#tophatAngle').oninput();api.applyPose();
 };
 const stateRestorer=stateModule.createV0StateRestorer({profile:stockProfile,registry,installations,commit,
  busy:value=>{$('#saveConfiguration').disabled=value},error:()=>{}});
 // Use the actual registered model pin independently of the production lookup.
 // Executing the loader's real receipt assignment catches undefined lookups.
 // The meshes/manifests remain synthetic; this is not model-byte verification.
 const modelHash=productionStages.machines[id].model_sha256,manifestHash='b'.repeat(64),receipts={'assembly_manifest.json':manifestHash};
 const assignments=[...appSource.matchAll(/nativeAssetReceipts\['model\.glb'\]\s*=\s*v0NativeModelHash\(id\)\s*;/gu)];
 assert.equal(assignments.length,1,'Unique production model receipt assignment');
 vm.runInNewContext(assignments[0][0],{nativeAssetReceipts:receipts,v0NativeModelHash,id},{timeout:1000});
 if(missingModelReceipt)receipts['model.glb']=undefined;
 const stageData={schema:assemblyModule.v0AssemblySchema,machines:{[id]:{model_sha256:stale?'d'.repeat(64):modelHash,manifest_sha256:manifestHash,parts:keys.length,
  manual:{url:'https://example.test/native-manual.pdf',sha256:'c'.repeat(64),pages:100,revision:id+' fixture'},stages:[
   {id:'frame',title:'Frame',page_start:10,page_end:20,part_keys:['frame','alternative']},
   {id:'rail',title:'Rail and carriage',page_start:21,page_end:30,part_keys:['rail','block','screw']},
   {id:'bed',title:'Bed',page_start:31,page_end:40,part_keys:['bed'],note:'Static authored placements.'},
  ]}}};
 const camera=new THREE.PerspectiveCamera(45,1,.001,10);camera.position.set(.7,.8,.9);camera.up.set(0,0,1);
 const orbit={target:new THREE.Vector3(.03,.04,.05),update(){events.push({type:'orbit'})}};
 const cameraState=()=>({position:camera.position.toArray(),up:camera.up.toArray(),target:orbit.target.toArray()});
 const originalCamera=cameraState();let api;
 // This six-box lifecycle fixture has no reviewed rail geometry. Actual-model
 // jobs separately exercise the source-pinned preparation display.
 const assemblyFactory=options=>{const c=assemblyModule.createV0AssemblyStages({...options,manualPreparation:false});if(!preparationBoundary&&!driveBoundary&&!bedBoundary)return c;
  const mode=s=>s?{...s,...(bedBoundary&&s.index===1?{camera_direction:[.15,.18,1],camera_distance_floor:.24,presentation_label:'Installation reference view'}:{}),preparation:preparationBoundary&&s.index===1,subassembly:driveBoundary&&s.index===1,underside:driveBoundary&&s.index===1,presentation_id:s.index===1?(driveBoundary?'drive-a-underside':'rail-preparation'):'installed'}:null;
  return {...c,current:()=>mode(c.current()),setStage:i=>mode(c.setStage(i))};
 };
 const dependencies={THREE,assemblyModule:{...assemblyModule,createV0AssemblyStages:assemblyFactory},$,document,scene,camera,orbit,adapter,profile,stockProfile,currentManifest:{machine_id:id,parts:keys.map(key=>({key,name:key}))},id,location:{href:'https://example.test/viewer/v0.html?machine='+id+(autoAssembly?'&assembly=1':'')},
  createAssemblyIndex,readAssemblyStageDocument,v0NativeByteHash:async bytes=>sha(Buffer.from(bytes)),renderer:{domElement:{}},formatMessage:()=>'',translate:x=>x,
  // This port isolates the complete native/configuration lifecycle; the real DOM
  // workbench/picker have independent tests and an actual-model browser audit.
  createAssemblyWorkbench:({index})=>({resumeIndex:()=>0,update:()=>{},activate:()=>{},deactivate:()=>{},ownsCommand:()=>false,dispose:()=>{}}),
  createAssemblyPicker:()=>({dispose:()=>{}}),
  installations,stateRestorer,palette,program:{invalidate(){events.push({type:'gcode-invalidated'})},updatePath:()=>{}},
  scope:{cleanup:fn=>cleanups.push(fn)},receipts,
  fetch:async(path,options)=>{const url=new URL(path,'https://example.test/viewer/v0.html');assert.equal(url.pathname,'/V0_ASSEMBLY_STAGES.json');assert([...url.searchParams.keys()].every(key=>key==='v'),'Unexpected stage query parameter');assert.equal(options.cache,'no-cache');tasks.fetchCount++;if(tasks.fetchGate)await tasks.fetchGate.promise;return {ok:!fetchFailure,arrayBuffer:async()=>new TextEncoder().encode(JSON.stringify(stageData)).buffer}},
  workspaceTask:fn=>Promise.resolve().then(fn),frameResponsiveView:()=>{if(focusFailure)throw Error('Injected focus failure')},render:()=>{},loadError:(prefix,e)=>prefix+' '+e.message,
  stockV0Mods:stateModule.stockV0Mods,validateV0State:stateModule.validateV0State,v0ConfigurationSchema:stateModule.v0ConfigurationSchema,v0NativeStateProfile,
 };
 api=factory(dependencies);
 for(const [i,a]of ['x','y','z'].entries()){$('#'+a).value=String(pose[i]);$('#'+a).oninput=api.applyPose}
 for(const [key,value]of Object.entries({enclosure,belts:flexible,gridVisible:true}))$('#'+key).checked=value;
 $('#doorAngle').value=String(door);$('#tophatAngle').value=String(tophat);
 let saves=0;$('#saveConfiguration').onclick=()=>{api.captureV0State();saves++};
 const disabled=()=>Object.fromEntries([...elements].map(([key,node])=>[key,node.disabled]));
 const initialDisabled=disabled();
 return {api,$,document,events,tasks,nodes,wrapper,native,original,config,stageData,receipts,camera,orbit,cameraState,originalCamera,disabled,initialDisabled,
  saves:()=>saves,start:()=>$('#assemblyStart').click(),finish:()=>$('#assemblyFinish').click(),
  dispose(){for(const fn of cleanups)fn()},
  release(){geometry.dispose();for(const node of [...nodes.values(),wrapper])node.traverse(n=>n.material?.dispose())},
 };
}

const report={result:'PASS',scope:'Production UI functions, real static-stage/state modules, keyed DOM/THREE fixtures; no actual model, browser or solid-clearance certification.',
 app_source_sha256:sha(appSource),assembly_source_sha256:sha(await fs.readFile(new URL('../site/viewer/v0-assembly.mjs',import.meta.url))),
 native_gate_source_sha256:sha(gateBytes),stage_catalog_sha256:sha(stageBytes),
 model_pin_lookup:machineIds.map(id=>({machine_id:id,registered_model_sha256:productionStages.machines[id].model_sha256,lookup_sha256:v0NativeModelHash(id)})),passed:[],findings:[]};
async function check(name,run,options){const fixture=mount(options);try{await run(fixture);report.passed.push(name)}catch(error){report.findings.push({test:name,message:error.message})}finally{try{fixture.dispose()}catch{}fixture.release()}}
const assertConfig=f=>assert.deepEqual(plain(f.api.captureV0State()),f.config);
const assertNative=f=>assert.deepEqual(f.original(),f.native);
const ordinary=['x','y','z','reset','enclosure','belts','saveConfiguration','loadConfiguration','configurationFile','resetMods','mod-toolhead','preDisabled'];
const assertLocked=f=>{for(const key of ordinary)assert.equal(f.$('#'+key).disabled,true,key+' must remain locked');for(const key of ['viewerLanguage','configTab','mobileConfig'])assert.equal(f.$('#'+key).disabled,false,key+' must remain usable')};
await check('preparation boundary frames new space; other stage changes retain orbit',async f=>{
 await f.start();const first=f.orbit.target.toArray();
 f.$('#assemblyNext').click();assert.notDeepEqual(f.orbit.target.toArray(),first);const box=new THREE.Box3();
 for(const key of ['rail','block','screw'])box.union(new THREE.Box3().setFromObject(f.nodes.get(key)));
 assert(f.orbit.target.distanceTo(box.getCenter(new THREE.Vector3()))<1e-12);
 f.$('#assemblyNext').click();assert(f.orbit.target.distanceTo(f.nodes.get('bed').position)<1e-12);
 f.orbit.target.set(.6,.7,.8);f.$('#assemblyStage').value='0';f.$('#assemblyStage').onchange();assert.deepEqual(f.orbit.target.toArray(),[.6,.7,.8]);
 await f.finish();assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
},{preparationBoundary:true});
await check('bed receiver focus uses the manual-facing direction outside the frame',async f=>{
 await f.start();f.$('#assemblyNext').click();
 const direction=f.camera.position.clone().sub(f.orbit.target),expected=new THREE.Vector3(.15,.18,1).normalize();
 assert(direction.length()>=.24);assert(direction.normalize().distanceTo(expected)<1e-12);assert.deepEqual(f.camera.up.toArray(),[0,1,0]);
 f.orbit.target.set(.8,.6,.7);f.$('#assemblyFocus').click();assert(f.camera.position.distanceTo(f.orbit.target)>=.24);
 for(const[i,node]of f.original().entries())for(const key of ['position','quaternion','scale','material','color'])assert.deepEqual(node[key],f.native[i][key]);
 await f.finish();assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
},{bedBoundary:true});
await check('manual drive inspection changes camera side without moving hardware',async f=>{
 const hardwareUnchanged=()=>{for(const[i,node]of f.original().entries())for(const key of ['position','quaternion','scale','material','color'])assert.deepEqual(node[key],f.native[i][key])};
 await f.start();f.$('#assemblyNext').click();assert.deepEqual(f.camera.up.toArray(),[0,-1,0]);assert(f.camera.position.y<f.orbit.target.y);hardwareUnchanged();
 const focusedState=f.original();f.orbit.target.set(.6,.7,.8);f.$('#assemblyFocus').click();assert.deepEqual(f.camera.up.toArray(),[0,-1,0]);assert.deepEqual(f.original(),focusedState);
 f.$('#assemblyNext').click();assert.deepEqual(f.camera.up.toArray(),[0,1,0]);assert(f.camera.position.y>f.orbit.target.y);hardwareUnchanged();
 await f.finish();assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
},{driveBoundary:true});
for(const machine_id of machineIds)await check(machine_id+' explicit assembly link enters and restores',async f=>{
 await waitFor(()=>f.api.state().assemblyView&&!f.api.state().assemblyLocked);assert(f.api.state().assemblyView);await f.finish();assert.equal(f.api.state().assemblyView,null);assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
},{machine_id,autoAssembly:true});
for(const machine_id of machineIds)for(const nonstock of [false,true])await check(machine_id+' normal '+(nonstock?'nonstock':'stock')+' entry/stages/restore',async f=>{
 assert.equal(f.receipts['model.glb'],productionStages.machines[machine_id].model_sha256,'Production receipt must match registered model pin');
 await f.start();assert(f.api.state().assemblyView);assertLocked(f);assert.equal(f.$('#assemblySteps').hidden,false);
 const reset=f.events.findIndex(e=>e.type==='pose'&&JSON.stringify(e.value)==='[60,67,4]');assert(reset>=0,'Native reference pose must be reset');
 assert(f.events.slice(0,reset).some(e=>e.type==='door'&&e.value===0));assert(f.events.slice(0,reset).some(e=>e.type==='tophat'&&e.value===0));
 assert(f.events.some(e=>e.type==='gcode-invalidated'));assert.deepEqual(plain(f.api.captureV0State().mods),stateModule.stockV0Mods());
 assert.equal(f.$('#assemblyPartCount').textContent,'工程 1 / 3 · 追加 2 部品 · 表示 1 部品');assert.deepEqual(f.orbit.target.toArray(),[-1,.1,.05]);
 for(const index of [2,1,0,2]){f.$('#assemblyStage').value=String(index);f.$('#assemblyStage').onchange();assert.equal(f.api.state().assemblyView.current().index,index);assert.equal(f.nodes.get('alternative').visible,false)}
 for(const [i,node]of f.original().entries())for(const key of ['position','quaternion','scale','material','color'])assert.deepEqual(node[key],f.native[i][key]);
 assert.equal(f.api.state().assemblyView.current().visible_count,5);
 f.$('#assemblyPrevious').click();assert.equal(f.api.state().assemblyView.current().index,1);
 f.$('#assemblyFocus').click();const expected=new THREE.Box3();f.nodes.get('rail').parent.updateMatrixWorld(true);
 for(const key of ['rail','block','screw'])expected.union(new THREE.Box3().setFromObject(f.nodes.get(key)));const center=expected.getCenter(new THREE.Vector3());assert(f.orbit.target.distanceTo(center)<1e-12,'Focus must exclude previously added frame/bed');
 f.$('#assemblyNext').click();assert.equal(f.$('#assemblyNext').disabled,true);
 assert.equal(f.$('#assemblyManual').href,'https://example.test/native-manual.pdf#page=31');
 await f.finish();assert.equal(f.api.state().assemblyView,null);assert.equal(f.api.state().assemblyLocked,false);assert.equal(f.$('#assemblySteps').hidden,true);
 assert(!('assemblyStage' in f.document.body.dataset));assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
 for(const key of ordinary)assert.equal(f.$('#'+key).disabled,f.initialDisabled[key],key+' original disabled state');
},{machine_id,nonstock});
for(const machine_id of machineIds)await check(machine_id+' missing model receipt rejects with restored state',async f=>{
 await f.start();assert.equal(f.api.state().assemblyView,null);assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);assert.match(f.$('#assemblyStatus').textContent,/Stale or unverified model\/manifest bytes/);
},{machine_id,nonstock:true,missingModelReceipt:true});
await check('original V0.2 one-key stock carriage follows stages and focus',async f=>{
 await f.start();assert.equal(f.wrapper.visible,false);assert.equal(f.nodes.get('block').visible,false);
 for(const index of [1,2,0,1]){f.$('#assemblyStage').value=String(index);f.$('#assemblyStage').onchange();assert.equal(f.wrapper.visible,index>0);assert.equal(f.nodes.get('block').visible,false);assert.equal(f.api.state().assemblyView.current().visible_count,[1,4,5][index])}
 f.$('#assemblyFocus').click();const expected=new THREE.Box3();f.wrapper.parent.updateMatrixWorld(true);
 for(const node of [f.nodes.get('rail'),f.wrapper,f.nodes.get('screw')])expected.union(new THREE.Box3().setFromObject(node));
 assert(f.orbit.target.distanceTo(expected.getCenter(new THREE.Vector3()))<1e-12);await f.finish();assertConfig(f);assertNative(f);assert.equal(f.wrapper.visible,true);
},{machine_id:'voron_v02_120',stockCompanion:true,nonstock:true});
await check('stock support-omitted carriage is stage-bound and restores',async f=>{
 const position=f.wrapper.position.toArray(),material=f.wrapper.children[0].material,color=material.color.getHex();
 await f.start();assert.equal(f.wrapper.visible,false,'Display carriage must be hidden before its exact source stage');
 for(const index of [1,2,0,1,0,2]){
  f.$('#assemblyStage').value=String(index);f.$('#assemblyStage').onchange();
  assert.equal(f.wrapper.visible,index>0);assert.equal(f.nodes.get('rail').visible,false);assert.equal(f.nodes.get('block').visible,false);
  assert.equal(f.api.state().assemblyView.current().visible_count,[1,4,5][index]);
  assert.deepEqual(f.wrapper.position.toArray(),position);assert.equal(f.wrapper.children[0].material,material);assert.equal(material.color.getHex(),color);
 }
 await f.finish();assertConfig(f);assertNative(f);assert.equal(f.wrapper.visible,true);
},{nonstock:true,stockCompanion:true});
await check('focus added includes displayed stock companion',async f=>{
 await f.start();f.$('#assemblyStage').value='1';f.$('#assemblyStage').onchange();f.$('#assemblyFocus').click();
 const expected=new THREE.Box3();f.wrapper.parent.updateMatrixWorld(true);
 for(const node of [f.wrapper,f.nodes.get('screw')])expected.union(new THREE.Box3().setFromObject(node));
 assert(f.orbit.target.distanceTo(expected.getCenter(new THREE.Vector3()))<1e-12,'Focus must use replacement wrapper; hidden native support leaves are not focus geometry');
 await f.finish();
},{stockCompanion:true});
await check('active save/axis/mod/load guards',async f=>{
 await f.start();f.$('#saveConfiguration').click();assert.equal(f.saves(),0);const pose=f.api.captureV0State().pose;
 f.$('#x').input(10);f.$('#x').value='10';f.api.applyPose();assert.deepEqual(plain(f.api.captureV0State().pose),plain(pose));
 await assert.rejects(f.api.setV0Mods(stateModule.stockV0Mods()),/組み立て手順/);await assert.rejects(f.api.restoreV0State(f.config),/組み立て手順/);
 await f.finish();
});
await check('preparation locks and duplicate start',async f=>{
 f.tasks.fetchGate=deferred();const first=f.start();await waitFor(()=>f.tasks.fetchCount===1);assertLocked(f);assert.equal(f.api.state().assemblyLocked,true);
 await f.$('#assemblyStart').onclick();assert.equal(f.tasks.fetchCount,1);f.tasks.fetchGate.resolve();await first;await f.finish();
});
for(const [name,options]of [['fetch failure',{fetchFailure:true}],['stale receipt',{stale:true}],['camera/focus failure',{focusFailure:true}]])await check(name+' rollback',async f=>{
 await f.start();assert.equal(f.api.state().assemblyView,null);assert.equal(f.api.state().assemblyLocked,false);assert.equal(f.$('#assemblySteps').hidden,true);
 assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);assert(!('assemblyStage' in f.document.body.dataset));
 assert.match(f.$('#assemblyStatus').textContent,/エラー/);for(const key of ordinary)assert.equal(f.$('#'+key).disabled,f.initialDisabled[key]);
},{nonstock:true,...options});
for(const [name,mutate]of [
 ['stale manifest',data=>{data.manifest_sha256='e'.repeat(64)}],
 ['out-of-range manual pages',data=>{data.stages[0].page_end=101}],
 ['unknown source part',data=>{data.stages[0].part_keys.push('unknown-native-leaf')}],
 ['duplicate assigned leaf',data=>{data.stages[1].part_keys.push('frame')}],
])await check(name+' rejects with restored state',async f=>{
 mutate(f.stageData.machines[f.config.machine_id]);await f.start();assert.equal(f.api.state().assemblyView,null);assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);assert.match(f.$('#assemblyStatus').textContent,/エラー/);
},{nonstock:true});
await check('reentry reuses data and restores current stock filters',async f=>{
 await f.start();await f.finish();assertConfig(f);await f.start();assert.equal(f.tasks.fetchCount,1);
 f.$('#assemblyStage').value='2';f.$('#assemblyStage').onchange();await f.finish();assertConfig(f);assertNative(f);assert.deepEqual(f.cameraState(),f.originalCamera);
},{nonstock:true});
await check('false stock-load rejects and restores',async f=>{
 const rejected=deferred();rejected.resolve(false);f.tasks.nextInstallation=rejected;await f.start();assert.equal(f.api.state().assemblyView,null);assertConfig(f);assertNative(f);assert.match(f.$('#assemblyStatus').textContent,/標準構成/);
},{nonstock:true});
await check('finish false restoration is an error',async f=>{
 await f.start();const rejected=deferred();rejected.resolve(false);f.tasks.nextInstallation=rejected;await f.finish();assert.match(f.$('#assemblyStatus').textContent,/元の構成を復元できません/);assert.doesNotMatch(f.$('#assemblyStatus').textContent,/元の構成を復元しました/);
},{nonstock:true});
await check('failed-start false rollback is reported',async f=>{
 f.tasks.nextInstallation=deferred();const action=f.tasks.nextInstallation;const running=f.start();await waitFor(()=>f.tasks.installationCalls===1);const rejected=deferred();rejected.resolve(false);f.tasks.nextInstallation=rejected;action.resolve(false);await running;
 assert.match(f.$('#assemblyStatus').textContent,/標準構成.*元の構成を復元できません/);assert.equal(f.api.state().assemblyLocked,false);
},{nonstock:true});
await check('finish asynchronous restore retains ordinary locks',async f=>{
 await f.start();const pending=deferred();f.tasks.nextInstallation=pending;const finishing=f.finish();await waitFor(()=>f.tasks.nextInstallation===null);
 let failure;try{assertLocked(f);assert.equal(f.api.state().assemblyLocked,true);assert.equal(f.$('#assemblyStart').disabled,true)}catch(error){failure=error}
 pending.resolve(true);await finishing;assertConfig(f);if(failure)throw failure;
},{nonstock:true});
await check('failed-start asynchronous rollback retains ordinary locks',async f=>{
 f.tasks.nextInstallation=deferred();const load=f.tasks.nextInstallation;const starting=f.start();await waitFor(()=>f.tasks.installationCalls===1);
 const rollback=deferred();f.tasks.nextInstallation=rollback;load.resolve(false);await waitFor(()=>f.tasks.installationCalls===2);
 let failure;try{assertLocked(f);assert.equal(f.$('#assemblyStart').disabled,true)}catch(error){failure=error}
 rollback.resolve(true);await starting;assertConfig(f);if(failure)throw failure;
},{nonstock:true});
await check('dispose restores visibility and releases stage UI locks',async f=>{
 await f.start();f.dispose();assert.equal(f.api.state().assemblyView,null);assertNative(f);
 for(const key of ordinary)assert.equal(f.$('#'+key).disabled,f.initialDisabled[key],key+' must not retain disposed locks');assert(!('assemblyStage' in f.document.body.dataset));assert.equal(f.$('#assemblySteps').hidden,true);
});
report.result=report.findings.length?'FAIL':'PASS';
assert.equal(sha(await fs.readFile(appURL,'utf8')),report.app_source_sha256,'Production source changed during fixture run');
assert.equal(sha(await fs.readFile(new URL('../site/viewer/v0-assembly.mjs',import.meta.url))),report.assembly_source_sha256,'Assembly source changed during fixture run');
assert.equal(sha(await fs.readFile(gateURL)),report.native_gate_source_sha256,'Native receipt lookup source changed during fixture run');
assert.equal(sha(await fs.readFile(stageURL)),report.stage_catalog_sha256,'Production stage catalog changed during fixture run');
console.log(JSON.stringify(report,null,2));if(report.findings.length)process.exitCode=1;
