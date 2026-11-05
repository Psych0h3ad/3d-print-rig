// Execute the production assembly UI with the real static-stage/state modules.
// Keyed geometry and DOM fixtures cover software state only, not native CAD fit.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {createHash} from 'node:crypto';
import * as THREE from '../site/viewer/vendor/three.module.js';
import * as assemblyModule from '../site/viewer/v0-assembly.mjs';
import {createAssemblyStageEmphasis} from '../site/viewer/assembly-stage-emphasis.mjs';
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
 const {THREE,$,document,scene,camera,orbit,adapter,profile,stockProfile,currentManifest,id,location,assemblyEmphasis,
  installations,stateRestorer,program,scope,fetch,workspaceTask,frameResponsiveView,render,
  loadError,stockV0Mods,validateV0State,v0ConfigurationSchema,v0NativeStateProfile,
  createAssemblyIndex,readAssemblyStageDocument,v0NativeByteHash,createAssemblyWorkbench,createAssemblyPicker,renderer,formatMessage,translate,loadV0ManualData,checkedV0ManualBundle}=dependencies;
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
 getAttribute(name){return name==='role'?this.role:this.attributes?.[name]??null}
 setAttribute(name,value){(this.attributes??={})[name]=String(value)}
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
 const controlIds=['assemblyStart','assemblyStage','assemblyPrevious','assemblyNext','assemblyFocus','assemblyFinish','assemblySteps','assemblyStatus','assemblyPartCount','assemblyManual','assemblyStepNote','stage','iso','front','top','focusHead'];
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
 // This six-box fixture cannot satisfy received actual-buffer hashes. Keep
 // that boundary explicit; the mandatory actual-asset job checks it for real.
 const fixtureReceipt=Object.freeze({});
 const prepareFixture=async options=>{assert.equal(options.sourceDerivedFastenerSeating,true);return fixtureReceipt};
 const assemblyFactory=options=>{assert.equal(options.m2SeatingReceipt,fixtureReceipt);const c=assemblyModule.createV0AssemblyStages({...options,manualPreparation:false,sourceDerivedFastenerSeating:false});if(!preparationBoundary&&!driveBoundary&&!bedBoundary)return c;
  const mode=s=>s?{...s,...(bedBoundary&&s.index===1?{camera_direction:[.15,.18,1],camera_distance_floor:.24,presentation_label:'Installation reference view'}:{}),preparation:preparationBoundary&&s.index===1,subassembly:driveBoundary&&s.index===1,underside:driveBoundary&&s.index===1,presentation_id:s.index===1?(driveBoundary?'drive-a-underside':'rail-preparation'):'installed'}:null;
  return {...c,current:()=>mode(c.current()),setStage:i=>mode(c.setStage(i))};
 };
 const dependencies={THREE,assemblyEmphasis:createAssemblyStageEmphasis(),assemblyModule:{...assemblyModule,prepareV0AssemblyM2Seating:prepareFixture,createV0AssemblyStages:assemblyFactory},$,document,scene,camera,orbit,adapter,profile,stockProfile,currentManifest:{machine_id:id,parts:keys.map(key=>({key,name:key}))},id,location:{href:'https://example.test/viewer/v0.html?machine='+id+(autoAssembly?'&assembly=1':'')},
  createAssemblyIndex,readAssemblyStageDocument,v0NativeByteHash:async bytes=>sha(Buffer.from(bytes)),renderer:{domElement:{}},formatMessage:()=>'',translate:x=>x,
  // This port isolates the complete native/configuration lifecycle; the real DOM
  // workbench/picker have independent tests and an actual-model browser audit.
  createAssemblyWorkbench:({index})=>({resumeIndex:()=>0,update:()=>{},activate:()=>{},deactivate:()=>{},ownsCommand:()=>false,dispose:()=>{}}),
  createAssemblyPicker:()=>({dispose:()=>{}}),
  installations,stateRestorer,palette,program:{invalidate(){events.push({type:'gcode-invalidated'})},updatePath:()=>{}},
  scope:{cleanup:fn=>cleanups.push(fn)},receipts,
  // This is an explicit six-box UI-lifecycle port. The13 real crypto/data
  // streams have a separate transport gate; this port does not brand test data.
  loadV0ManualData:async()=>{tasks.fetchCount++;if(tasks.fetchGate)await tasks.fetchGate.promise;if(tasks.manualFailure??fetchFailure)throw Error('Injected exact manual data acquisition failure');return {data:{'v0-assembly-stages':stageData},stageSHA256:sha(Buffer.from(JSON.stringify(stageData)))}},
  checkedV0ManualBundle:value=>value,
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


const rows=[];for(const id of machineIds){
 const f=mount({id});try{
  f.tasks.manualFailure=true;const events=f.events.length;await f.start();assert.equal(f.tasks.fetchCount,1);assert.equal(f.events.length,events,'Data failure must not reset/install/restore the untouched old assembly');assert.deepEqual(plain(f.api.captureV0State()),f.config);assert.deepEqual(f.original(),f.native);assert.deepEqual(f.cameraState(),f.originalCamera);assert.equal(f.api.state().assemblyView,null);assert.equal(f.api.state().assemblyLocked,false);assert.equal(f.api.state().assemblySnapshot,null);assert.deepEqual(f.disabled(),f.initialDisabled);
  f.tasks.manualFailure=false;await f.start();assert(f.api.state().assemblyView);await f.finish();assert.deepEqual(plain(f.api.captureV0State()),f.config);assert.deepEqual(f.original(),f.native);rows.push({machine:id,dataFailureUntouched:true,retryAndLeave:true});
 }finally{f.dispose();f.release()}
 const g=mount({id});try{let release;g.tasks.fetchGate={promise:new Promise(resolve=>release=resolve)};const start=g.start();await Promise.resolve();assert.equal(g.tasks.fetchCount,1);assert.equal(g.api.state().assemblyView,null);assert.deepEqual(g.original(),g.native);assert.deepEqual(plain(g.api.captureV0State()),g.config);await g.start();assert.equal(g.tasks.fetchCount,1,'No duplicate start while preparing');release();await start;assert(g.api.state().assemblyView);await g.finish();assert.deepEqual(g.original(),g.native);rows.push({machine:id,delayedAcquisitionUntouched:true,duplicateStartRejected:true});}finally{g.dispose();g.release()}
}
const report={passed:true,groups:rows.length,rows,exactProductionSetupAndCatchBody:true,geometryAndDOM:'Explicit six-box software-lifecycle fixture; no real asset or browser/native-fit qualification.',actualCryptoStreamsSeparate:true,productionChanged:false,publicationQualified:false,physicalFitQualified:false,appSHA256:sha(appSource)};console.log(JSON.stringify(report));
