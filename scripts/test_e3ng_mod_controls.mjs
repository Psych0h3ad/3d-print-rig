import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {contentRevision} from './build_locales.mjs';
import {
 setupE3NGModControls,captureE3NGModSelection,transferE3NGModSelection,appendE3NGModCredits
} from '../site/viewer/e3ng-mod-controls.mjs';
import {createSourceUIText} from '../site/viewer/source-assembly-ui-text.mjs';
import {bindSourceConfigurationLoad} from '../site/viewer/source-assembly-configuration-ui.mjs';
import {sourceText} from '../site/viewer/source-assembly-messages.mjs';
import {captureViewAppearance,transferViewAppearance} from '../site/viewer/source-assembly-runtime/view_appearance.mjs';

// Only DOM/state doubles: no Three.js import, model fetch, mesh or native job.
const source=(await readFile(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8')).replace(/\r\n/g,'\n');
const i18nRevision=contentRevision(await readFile(new URL('../site/viewer/i18n.mjs',import.meta.url),'utf8'));
const {loadLanguage}=await import(new URL('../site/viewer/i18n.mjs?v='+i18nRevision,import.meta.url));
for(const[parent,child]of[
 ['source-assembly.mjs','source-assembly-loader.mjs'],
 ['source-assembly.mjs','e3ng-mod-controls.mjs'],
 ['source-assembly-loader.mjs','source-assembly-runtime/e3ng-mods.mjs'],
 ['source-assembly-loader.mjs','source-assembly-runtime/e3ng-mod-data.mjs'],
 ['source-assembly-runtime/e3ng-mods.mjs','source-assembly-runtime/e3ng-mod-data.mjs'],
 ['layout-machine-providers.mjs','source-assembly-loader.mjs']
]){
 const parentText=await readFile(new URL('../site/viewer/'+parent,import.meta.url),'utf8'),childText=await readFile(new URL('../site/viewer/'+child,import.meta.url),'utf8');
 assert(parentText.includes(child.split('/').at(-1)+'?v='+contentRevision(childText)),'Stale E3NG modification module cache: '+parent+' -> '+child);
}
const plannerSource=await readFile(new URL('../site/viewer/layout-machine-providers.mjs',import.meta.url),'utf8');assert(plannerSource.includes('includeModifications:false'),'Stock Layout recipe must not load optional modification geometry');
const machine='rh3d_e3ng_v12_235',stock=()=>({schema:'e3ng-mods-v1',base:'stock',cable:'stock'});
const combinations=[['stock','stock'],['reinforced','stock'],['reinforced','cable-hole'],['stock','cable-hole']];
const titles={
 en:['Toolhead base','Cable guide'],ja:['ツールヘッドベース','ケーブルガイド'],
 de:['Druckkopfträger','Kabelführung'],es:['Base del cabezal','Guía de cables'],
 ko:['툴헤드 베이스','케이블 가이드'],ru:['Основание головки','Направляющая кабеля']
};
const companionData=Object.freeze({hotend:'native-hotend',cover:'native-cover',fan:'native-fan',probe:'native-probe',fasteners:'native-fasteners'});
const packet=Object.freeze({id:'packet',model:Object.freeze({sha256:'a'.repeat(64)}),inventory:Object.freeze({sha256:'b'.repeat(64)}),companions:companionData});
const companionBefore=JSON.stringify(companionData);
const fixture=()=>({
 packet:packet.id,model_sha256:packet.model.sha256,inventory_sha256:packet.inventory.sha256,
 e3ng_mods:stock(),axes:{x:0,y:0,z:0},review_axes:{x:33,y:-14,z:-80},
 palette:{M:'#235634',A:'#fa6841'},source_material_display:'palette',purchased_appearance:'physical',
 theme:'dark',lighting:'rgb',lightIntensity:1,language:'ja',grid:true,probe_state:'attached',groups:{frame:true},
 companion_data:{...companionData}
});
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.hidden=false;this.textContent='';this.attributes=new Map();}
 append(...nodes){this.children.push(...nodes);}
 setAttribute(name,value){this.attributes.set(name,String(value));}
 getAttribute(name){return this.attributes.get(name)??null;}
 click(){this.clicked=true;}
}
const owned=(tag,props={})=>Object.assign(new Element(tag),props),all=node=>[node,...node.children.flatMap(all)];
const withoutMods=state=>{const copy=structuredClone(state);delete copy.e3ng_mods;return copy;};
function section(start,end){
 const begin=source.indexOf(start),finish=source.indexOf(end,begin);
 assert(begin>=0&&finish>begin,'Production source hook missing: '+start);
 return source.slice(begin,finish);
}
const applySource=section(' function apply(next)',' for(const a of\'xyz\')for(const input of axisControls');
const resetSource=section('reset.onclick=','\n for(const[k,input]of Object.entries(colorControls))').slice('reset.onclick='.length).trim().replace(/;$/,'');
const saveSource=section(' save.onclick=',';loadButton.onclick=').slice(' save.onclick='.length);
const loadSource=section(" async function load(requested='full',saved=null)"," workspaceListen(renderer.domElement,'webglcontextlost'");
assert.match(source,/setupE3NGModControls\(\{host:modHost,machine,language:lang,getState:\(\)=>active\?\.snapshot\(\)\?\?null,apply,owned,messages\}\)/);
assert.match(source,/function sync\(\)\{modControls\.sync\(\)/);
assert.match(source,/rig-language-change[^\n]*messages\.refresh\(\)[^\n]*modControls\.refresh\(\)/);
assert.match(source,/bindSourceConfigurationLoad\(\{file,machine,load,camera,controls,tools,render,messages,status:\$\('configurationStatus'\),task:workspaceTask\}\)/);
assert.match(source,/if\(!scope\.disposed\)appendE3NGModCredits\(\{hosts:\[creditsList,sourceReferenceList\]/);

let language='en',state=null,reject=false,resetBlocked=false,calls=0,blocked=0;
const messages=createSourceUIText(()=>language),host=owned('div'),error=owned('p');
const active={
 snapshot:()=>structuredClone(state),
 apply(next){
  calls++;assert.deepEqual(withoutMods(next),withoutMods(state),'Mod selection changed unrelated settings or companion data');
  const mods=next.e3ng_mods;
  if(reject||mods?.schema!=='e3ng-mods-v1'||!['stock','reinforced'].includes(mods.base)||!['stock','cable-hole'].includes(mods.cable))throw Error('Runtime blocked');
  state=structuredClone(next);
 },
 reset(){if(resetBlocked)throw Error('Reset blocked');state=fixture();}
};
let ui;
const apply=Function('active','messages','error','sync','moveError',applySource+';return apply;')(
 active,messages,error,()=>ui.sync(),()=>{blocked++;messages.set(error,'blocked');}
);
ui=setupE3NGModControls({host,machine,language:()=>language,getState:active.snapshot,apply,owned,messages});
const selects=all(host).filter(node=>node.tagName==='select'),[base,cable]=selects;
assert.equal(selects.length,2);assert(selects.every(node=>node.disabled&&node.value==='stock'));
assert.deepEqual(base.children.map(node=>node.value),['stock','reinforced']);
assert.deepEqual(cable.children.map(node=>node.value),['stock','cable-hole']);
for(const row of host.children)assert.equal(row.htmlFor,row.children[1].id,'Selectors need an associated label');
base.value='reinforced';base.onchange();assert.equal(calls,0);assert.equal(base.value,'stock');
for(const invalid of [null,{},[],{schema:'other',base:'stock',cable:'stock'},{schema:'e3ng-mods-v1',base:'missing',cable:'stock'},{schema:'e3ng-mods-v1',base:'stock'}]){
 state={...fixture(),e3ng_mods:invalid};ui.sync();assert(selects.every(node=>node.disabled&&node.value==='stock'));
 const before=calls;base.value='reinforced';base.onchange();assert.equal(calls,before);assert.equal(base.value,'stock');
}
state=fixture();ui.sync();assert(selects.every(node=>!node.disabled));
function choose(b,c){
 const oldCable=state.e3ng_mods.cable;base.value=b;base.onchange();assert.equal(state.e3ng_mods.cable,oldCable,'Base choice changed the cable guide');
 cable.value=c;cable.onchange();assert.deepEqual(state.e3ng_mods,{schema:'e3ng-mods-v1',base:b,cable:c});
 assert.equal(base.value,b);assert.equal(cable.value,c);
}
for(const lang of Object.keys(titles)){
 await loadLanguage(lang);language=lang;messages.refresh();ui.refresh();assert.deepEqual(host.children.map(row=>row.children[0].textContent),titles[lang]);
 for(const pair of combinations)choose(...pair);
 for(const pair of [['stock','stock'],['reinforced','cable-hole'],['stock','stock']])choose(...pair);
}
reject=true;base.value='reinforced';assert.equal(base.onchange(),false);assert.equal(base.value,'stock');
cable.value='cable-hole';assert.equal(cable.onchange(),false);assert.equal(cable.value,'stock');
reject=false;base.value='invalid';assert.equal(base.onchange(),false);assert.equal(base.value,'stock');assert.equal(blocked,3);
assert.equal(error.textContent,sourceText('blocked',language));
choose('reinforced','cable-hole');
const reset=Function('active','messages','error','sync','moveError','return '+resetSource)(
 active,messages,error,ui.sync,()=>{blocked++;}
);
reset();assert.deepEqual(state.e3ng_mods,stock());assert.equal(base.value,'stock');assert.equal(cable.value,'stock');
choose('reinforced','cable-hole');resetBlocked=true;reset();assert.equal(blocked,4);assert.equal(base.value,'reinforced');assert.equal(cable.value,'cable-hole');resetBlocked=false;

for(const otherMachine of ['rh3d_virtu_may_230','e3ng','rh3d_e3ng_v12_300',null]){
 const other=owned('div'),unused=()=>{throw Error('Non-E3NG machine accessed mod state');};
 const hidden=setupE3NGModControls({host:other,machine:otherMachine,language:'en',getState:unused,apply:unused,owned,messages});
 hidden.sync();hidden.refresh();assert(other.hidden);assert.equal(other.children.length,0);
 const credits=owned('ul');appendE3NGModCredits({hosts:[credits],machine:otherMachine,language:'en',owned,messages});assert.equal(credits.children.length,0);
}
const creditHosts=[owned('ul'),owned('ul')];
appendE3NGModCredits({hosts:creditHosts,machine,language:()=>language,owned,messages});
const modSources=[
 ['https://www.printables.com/model/1378246-ender-ng-3-v12-toolhead-base-with-large-reinforcem','STEP 6207809 · 2025-11-09'],
 ['https://www.printables.com/model/1348213-ender-3-ng-v12-toolhead-cable-mount-with-cable-hol','STEP 5672858 · 2025-07-07']
];
for(const lang of Object.keys(titles)){
 await loadLanguage(lang);language=lang;messages.refresh();
 for(const credits of creditHosts){
  assert.equal(credits.children.length,2);
  for(const [i,row]of credits.children.entries()){
   const [author,note]=row.children,[version,license]=note.children;
   assert.equal(author.href,modSources[i][0]);assert(author.textContent.startsWith('Synthead · '));assert(author.textContent.includes(titles[lang][i]));
   assert.equal(version.textContent,' · '+modSources[i][1]+' · ','Exact public STEP file/date must survive language changes');
   assert.equal(license.href,'https://creativecommons.org/licenses/by-nc-sa/4.0/');assert.equal(license.textContent,'CC-BY-NC-SA 4.0');
   for(const link of [author,license])assert(link.target==='_blank'&&link.rel==='noopener noreferrer');
  }
 }
}
const captured=captureE3NGModSelection(machine,state);captured.base='stock';assert.equal(state.e3ng_mods.base,'reinforced','Capture retained a mutable state alias');
assert.equal(captureE3NGModSelection('other',state),null);assert.equal(captureE3NGModSelection(machine,{}),null);
assert.throws(()=>captureE3NGModSelection(machine,{e3ng_mods:{schema:'wrong'}}));
assert.throws(()=>transferE3NGModSelection(machine,{},captured));
assert.equal(transferE3NGModSelection('other',state,captured),state);
assert.equal(transferE3NGModSelection(machine,state,null),state);

// Execute the production load function with asynchronous loading/renderer
// boundaries replaced by state-only doubles. Its carry/saved branches are real.
function adapter(value){
 let current=structuredClone(value);
 return {packet,root:{},snapshot:()=>structuredClone(current),apply:next=>{current=structuredClone(next);},reset:()=>{current=fixture();}};
}
function loadFixture(initial){
 const stats={sync:0,captures:0,restores:0};
 const env={
  initial:adapter(initial),stats,machine,packet,headPlan:{loading_budget:{single_load_peak_bytes:1}},
  coordinator:{start:()=>({signal:null,current:()=>true}),run:(job,operation)=>operation()},
  requestModelChoice:async()=> 'full',navigator:{},choose:{},captureViewAppearance,transferViewAppearance,
  captureE3NGModSelection:(...args)=>{stats.captures++;return captureE3NGModSelection(...args);},transferE3NGModSelection,
  loadSourceAssembly:async()=>adapter({...fixture(),review_axes:{x:0,y:0,z:0}}),sourceProgressStatus:()=>()=>{},
  restoreCurrentAssemblyState:(target,saved)=>{stats.restores++;target.apply(saved);return {migrated:false};},
  releaseRoot(){},readDisplay:()=>({dark:true}),lang:()=>language,messages:{set(){},clear(){}},
  status:{},cancelLoad:{hidden:true},renderer:{},scene:{add(){}},
  visibleBounds:()=>({getCenter:()=>({x:0,y:0,z:0}),min:{y:0}}),THREE:{Vector3:class{}},
  grid:{position:{set(){}}},placeSceneFill(){},view(){},$:()=>({disabled:false}),setupRenderExport:()=>({}),console
 };
 return Function('env',`
 const {stats,machine,packet,headPlan,coordinator,requestModelChoice,navigator,choose,captureViewAppearance,transferViewAppearance,captureE3NGModSelection,transferE3NGModSelection,loadSourceAssembly,sourceProgressStatus,restoreCurrentAssemblyState,releaseRoot,readDisplay,lang,messages,status,cancelLoad,renderer,scene,visibleBounds,THREE,grid,placeSceneFill,view,$,setupRenderExport,console}=env;
 let active=env.initial,mode='full',renderExport=true;
 function release(){active=null;}function sync(){stats.sync++;}
 ${loadSource}
 return {load,get active(){return active;},get mode(){return mode;},stats};
 `)(env);
}
for(const [b,c]of combinations){
 const initial={...fixture(),e3ng_mods:{schema:'e3ng-mods-v1',base:b,cable:c}},view=loadFixture(initial);
 for(const mode of ['head','full','head','full']){
  assert.equal(await view.load(mode),true);assert.equal(view.mode,mode);const next=view.active.snapshot();
  assert.deepEqual(next.e3ng_mods,initial.e3ng_mods);assert.deepEqual(next.palette,initial.palette);
  assert.equal(next.theme,initial.theme);assert.equal(next.lighting,initial.lighting);assert.equal(next.grid,initial.grid);assert.equal(next.source_material_display,initial.source_material_display);
  assert.equal(next.language,language);assert.deepEqual(next.review_axes,{x:0,y:0,z:0},'Carry must preserve the new view motion baseline');
  assert.deepEqual(next.companion_data,companionData);
 }
 const before=view.stats.captures,saved={...fixture(),e3ng_mods:stock()};
 assert.equal((await view.load('head',saved)).migrated,false);assert.deepEqual(view.active.snapshot().e3ng_mods,stock());
 assert.equal(view.stats.captures,before,'Saved state must bypass unsaved mod/appearance carry');
 const sameViewSaved={...fixture(),e3ng_mods:{schema:'e3ng-mods-v1',base:'reinforced',cable:'cable-hole'}};
 await view.load('head',sameViewSaved);assert.deepEqual(view.active.snapshot().e3ng_mods,sameViewSaved.e3ng_mods);assert.equal(view.stats.restores,2);
 view.active.reset();await view.load('full');assert.deepEqual(view.active.snapshot().e3ng_mods,stock());
}

// Use the actual save callback and actual configuration-file handler. Camera
// values are opaque arrays; the fake methods record restoration without 3D.
language='ja';state=fixture();choose('reinforced','cable-hole');
const savedCamera={position:[.3,.2,.5],target:[0,0,0],up:[0,1,0]};let savedBlob,downloadAnchor,revoked=false;
const save=Function('active','captureCamera','camera','controls','lang','Blob','URL','owned','setTimeout','messages','$','machine','mode','return '+saveSource)(
 active,()=>structuredClone(savedCamera),{}, {},()=>language,Blob,
 {createObjectURL:blob=>{savedBlob=blob;return 'blob:e3ng-mod-test';},revokeObjectURL:url=>{assert.equal(url,'blob:e3ng-mod-test');revoked=true;}},
 (tag,attributes)=>{downloadAnchor=owned(tag,attributes);return downloadAnchor;},fn=>fn(),messages,()=>owned('p'),machine,'head'
);
save();const savedView=JSON.parse(await savedBlob.text());
assert.equal(savedView.schema,'source-assembly-view-v1');assert.equal(savedView.machine,machine);assert.equal(savedView.view,'head');
assert.deepEqual(savedView.settings.e3ng_mods,state.e3ng_mods);assert.deepEqual(savedView.settings.camera,savedCamera);assert.equal(savedView.settings.language,language);
assert.deepEqual(savedView.settings.companion_data,companionData);assert(downloadAnchor.clicked&&revoked);assert.equal(downloadAnchor.download,machine+'.json');
const arrayValue=()=>({value:null,fromArray(value){this.value=[...value];}}),camera={position:arrayValue(),up:arrayValue(),lookAt(){}},controls={target:arrayValue(),update(){}};
const file={files:[],value:''},status=owned('p'),buttons=[owned('button',{id:'iso'}),owned('button',{id:'front'})],tools={querySelectorAll:()=>buttons};
let fileLoads=0,loadBlocked=false;
bindSourceConfigurationLoad({file,machine,camera,controls,tools,render(){},messages,status,task:operation=>operation(),load:async(mode,settings)=>{
 fileLoads++;assert.equal(mode,'head');if(loadBlocked)return false;state=structuredClone(settings);ui.sync();return {migrated:false};
}});
function selectFile(value){file.files=[{size:1000,text:async()=>JSON.stringify(value)}];file.value='saved.json';}
for(const lang of Object.keys(titles)){
 await loadLanguage(lang);language=lang;state=fixture();ui.sync();selectFile(savedView);await file.onchange();
 assert.equal(base.value,'reinforced');assert.equal(cable.value,'cable-hole');assert.deepEqual(state.companion_data,companionData);
 assert.equal(status.textContent,sourceText('loaded',lang));assert.equal(file.value,'');assert.deepEqual(camera.position.value,savedCamera.position);
}
loadBlocked=true;state=fixture();ui.sync();selectFile(savedView);await file.onchange();assert.equal(base.value,'stock');assert.equal(cable.value,'stock');assert.equal(status.textContent,sourceText('unsafe',language));
const beforeBad=fileLoads;selectFile({...savedView,machine:'other'});await file.onchange();assert.equal(fileLoads,beforeBad);assert.equal(status.textContent,sourceText('unsafe',language));
state=null;ui.sync();assert(selects.every(node=>node.disabled&&node.value==='stock'));
assert.equal(JSON.stringify(companionData),companionBefore,'Companion/source fixture data was mutated');
console.log(JSON.stringify({passed:true,languages:6,combinations:4,selection_ABA:true,invalid_and_blocked_resync:true,native_reset_UI:true,save_file_contract:true,full_head_carry:true,saved_precedence:true,credits_exact_public_STEP_versions:true,companion_data_untouched:true,scope:'Minimal DOM/state doubles and real UI/save/load/reset callbacks. No 3D/model/native or heavy mathematical jobs; not a physical companion/clearance audit.'}));
