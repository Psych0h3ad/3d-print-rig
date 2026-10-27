import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {readFileSync} from 'node:fs';
import {registerHooks} from 'node:module';
import {contentRevision,compileCatalog,compileLocale,sourceRevision} from './build_locales.mjs';
import {e3ngModModel} from '../site/viewer/source-assembly-runtime/e3ng-mod-data.mjs';
// Parallel work can validate reviewed JSON without rewriting generated locales
// or unrelated cache references. The default run still checks shipped modules.
const pendingLocales=process.argv.includes('--pending-locales');
if(pendingLocales)registerHooks({load(url,context,next){
 const name=new URL(url).pathname.match(/\/viewer\/locales\/(catalog|de|es|ko|ru)\.mjs$/)?.[1];
 if(!name)return next(url,context);
 const json=JSON.parse(readFileSync(new URL('../localization/'+(name==='catalog'?'source':name)+'.json',import.meta.url),'utf8'));
 return {format:'module',source:name==='catalog'?compileCatalog(json):compileLocale(json),shortCircuit:true};
}});
const {
 setupE3NGModControls,captureE3NGModSelection,transferE3NGModSelection,appendE3NGModCredits
}=await import('../site/viewer/e3ng-mod-controls.mjs');
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
 ['e3ng-mod-controls.mjs','source-assembly-runtime/e3ng-mod-data.mjs'],
 ['layout-machine-providers.mjs','source-assembly-loader.mjs']
]){
 const parentText=await readFile(new URL('../site/viewer/'+parent,import.meta.url),'utf8'),childText=await readFile(new URL('../site/viewer/'+child,import.meta.url),'utf8');
 if(!pendingLocales)assert(parentText.includes(child.split('/').at(-1)+'?v='+contentRevision(childText)),'Stale E3NG modification module cache: '+parent+' -> '+child);
}
const plannerSource=await readFile(new URL('../site/viewer/layout-machine-providers.mjs',import.meta.url),'utf8');assert(plannerSource.includes('includeModifications:false'),'Stock Layout recipe must not load optional modification geometry');
const machine='rh3d_e3ng_v12_235',stock=()=>({schema:'e3ng-mods-v1',base:'stock',cable:'stock',panels:'stock'});
const combinations=['stock','hex'].flatMap(p=>[['stock','stock',p],['reinforced','stock',p],['reinforced','cable-hole',p],['stock','cable-hole',p]]);
const titles={
 en:['Toolhead base','Cable guide','Rear panels'],ja:['ツールヘッドベース','ケーブルガイド','背面パネル'],
 de:['Druckkopfträger','Kabelführung','Rückwandpaneele'],es:['Base del cabezal','Guía de cables','Paneles traseros'],
 ko:['툴헤드 베이스','케이블 가이드','후면 패널'],ru:['Основание головки','Направляющая кабеля','Задние панели']
};
const hexLabels={en:'Hexagon pattern',ja:'六角形パターン',de:'Sechseckmuster',es:'Patrón hexagonal',ko:'육각형 패턴',ru:'Шестиугольный узор'};
const stockLabels={en:'Stock',ja:'純正',de:'Serienausführung',es:'De serie',ko:'기본 사양',ru:'Штатная конфигурация'};
const companionData=Object.freeze({hotend:'native-hotend',cover:'native-cover',fan:'native-fan',probe:'native-probe',fasteners:'native-fasteners'});
const packet=Object.freeze({id:'packet',machine:'e3ng',model:Object.freeze({sha256:e3ngModModel}),inventory:Object.freeze({sha256:'b'.repeat(64)}),companions:companionData});
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
assert.match(source,/setupE3NGModControls\(\{host:modHost,machine,language:lang,getState:\(\)=>active\?\.snapshot\(\)\?\?null,getAvailability:\(\)=>active\?\.e3ngMods\?\{base:true,cable:true,panels:active.e3ngMods.fullAssembly===true\}:null,apply,owned,messages\}\)/);
assert.match(source,/function sync\(\)\{modControls\.sync\(\)/);
assert.match(source,/rig-language-change[^\n]*messages\.refresh\(\)[^\n]*modControls\.refresh\(\)/);
assert.match(source,/bindSourceConfigurationLoad\(\{file,machine,load,camera,controls,tools,render,messages,status:\$\('configurationStatus'\),task:workspaceTask\}\)/);
assert.match(source,/if\(!scope\.disposed\)appendE3NGModCredits\(\{hosts:\[creditsList,sourceReferenceList\]/);

let language='en',state=null,reject=false,resetBlocked=false,calls=0,blocked=0,availability={base:true,cable:true,panels:true};
const messages=createSourceUIText(()=>language),host=owned('div'),error=owned('p');
const active={
 snapshot:()=>structuredClone(state),
 apply(next){
  calls++;assert.deepEqual(withoutMods(next),withoutMods(state),'Mod selection changed unrelated settings or companion data');
  const mods=next.e3ng_mods;
  if(reject||mods?.schema!=='e3ng-mods-v1'||!['stock','reinforced'].includes(mods.base)||!['stock','cable-hole'].includes(mods.cable)||!['stock','hex'].includes(mods.panels))throw Error('Runtime blocked');
  state=structuredClone(next);
 },
 reset(){if(resetBlocked)throw Error('Reset blocked');state=fixture();}
};
let ui;
const apply=Function('active','messages','error','sync','moveError',applySource+';return apply;')(
 active,messages,error,()=>ui.sync(),()=>{blocked++;messages.set(error,'blocked');}
);
ui=setupE3NGModControls({host,machine,language:()=>language,getState:active.snapshot,getAvailability:()=>availability,apply,owned,messages});
const selects=all(host).filter(node=>node.tagName==='select'),[base,cable,panels]=selects;
assert.equal(selects.length,3);assert(selects.every(node=>node.disabled&&node.value==='stock'));
assert.deepEqual(base.children.map(node=>node.value),['stock','reinforced']);
assert.deepEqual(cable.children.map(node=>node.value),['stock','cable-hole']);
assert.deepEqual(panels.children.map(node=>node.value),['stock','hex']);
for(const row of host.children)assert.equal(row.htmlFor,row.children[1].id,'Selectors need an associated label');
base.value='reinforced';base.onchange();assert.equal(calls,0);assert.equal(base.value,'stock');
for(const invalid of [null,{},[],{schema:'other',base:'stock',cable:'stock'},{schema:'e3ng-mods-v1',base:'missing',cable:'stock'},{schema:'e3ng-mods-v1',base:'stock'},{...stock(),panels:undefined},{...stock(),panels:'bad'},{...stock(),extra:true}]){
 state={...fixture(),e3ng_mods:invalid};ui.sync();assert(selects.every(node=>node.disabled&&node.value==='stock'));
 const before=calls;base.value='reinforced';base.onchange();assert.equal(calls,before);assert.equal(base.value,'stock');
}
state=fixture();ui.sync();assert(selects.every(node=>!node.disabled));
function choose(b,c,p='stock'){
 const oldCable=state.e3ng_mods.cable;base.value=b;base.onchange();assert.equal(state.e3ng_mods.cable,oldCable,'Base choice changed the cable guide');
 cable.value=c;cable.onchange();panels.value=p;panels.onchange();assert.deepEqual(state.e3ng_mods,{schema:'e3ng-mods-v1',base:b,cable:c,panels:p});
 assert.equal(base.value,b);assert.equal(cable.value,c);assert.equal(panels.value,p);
}
for(const lang of Object.keys(titles)){
 await loadLanguage(lang);language=lang;messages.refresh();ui.refresh();assert.deepEqual(host.children.map(row=>row.children[0].textContent),titles[lang]);
 assert.equal(panels.children[1].textContent,hexLabels[lang]);
 for(const input of selects)assert.equal(input.children[0].textContent,stockLabels[lang]);
 for(const pair of combinations)choose(...pair);
 for(const pair of [['stock','stock','stock'],['reinforced','cable-hole','hex'],['stock','stock','stock']])choose(...pair);
}
reject=true;base.value='reinforced';assert.equal(base.onchange(),false);assert.equal(base.value,'stock');
cable.value='cable-hole';assert.equal(cable.onchange(),false);assert.equal(cable.value,'stock');
reject=false;base.value='invalid';assert.equal(base.onchange(),false);assert.equal(base.value,'stock');assert.equal(blocked,3);
assert.equal(error.textContent,sourceText('blocked',language));
choose('reinforced','cable-hole','hex');
const reset=Function('active','messages','error','sync','moveError','return '+resetSource)(
 active,messages,error,ui.sync,()=>{blocked++;}
);
reset();assert.deepEqual(state.e3ng_mods,stock());assert.equal(base.value,'stock');assert.equal(cable.value,'stock');
assert.equal(panels.value,'stock');
choose('reinforced','cable-hole');resetBlocked=true;reset();assert.equal(blocked,4);assert.equal(base.value,'reinforced');assert.equal(cable.value,'cable-hole');resetBlocked=false;

for(const otherMachine of ['rh3d_virtu_may_230','e3ng','rh3d_e3ng_v12_300',null]){
 const other=owned('div'),unused=()=>{throw Error('Non-E3NG machine accessed mod state');};
 const hidden=setupE3NGModControls({host:other,machine:otherMachine,language:'en',getState:unused,apply:unused,owned,messages});
 hidden.sync();hidden.refresh();assert(other.hidden);assert.equal(other.children.length,0);
 const credits=owned('ul');appendE3NGModCredits({hosts:[credits],machine:otherMachine,language:'en',owned,messages});assert.equal(credits.children.length,0);
}
const creditHosts=[owned('ul'),owned('ul')];
appendE3NGModCredits({hosts:creditHosts,machine,packet,language:()=>language,owned,messages});
const modSources=[
 ['https://www.printables.com/model/1378246-ender-ng-3-v12-toolhead-base-with-large-reinforcem','STEP 6207809 · 2025-11-09'],
 ['https://www.printables.com/model/1348213-ender-3-ng-v12-toolhead-cable-mount-with-cable-hol','STEP 5672858 · 2025-07-07'],
 ...[['upper_left','4093353'],['upper_right','4093350'],['lower_left','4093351'],['lower_right','4093352']].map(([corner,id])=>['https://www.printables.com/model/922401-ender-3-ng-v12-corexy-conversion','electronics_panel_'+corner+'_dual_color.stl · STL '+id+' · 2024-08-16'])
];
for(const lang of Object.keys(titles)){
 await loadLanguage(lang);language=lang;messages.refresh();
 for(const credits of creditHosts){
  assert.equal(credits.children.length,6);
  for(const [i,row]of credits.children.entries()){
   const [author,note]=row.children,[version,license]=note.children;
   assert.equal(author.href,modSources[i][0]);assert(author.textContent.startsWith(i<2?'Synthead · ':'RH3D · '));assert(author.textContent.includes(titles[lang][i<2?i:2]));
   if(i>=2)assert(author.textContent.includes(hexLabels[lang]));
   assert.equal(version.textContent,' · '+modSources[i][1]+' · ','Exact public STEP/STL file/date must survive language changes');
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
for(const sourcePacket of [undefined,{machine:'other',model:{sha256:e3ngModModel}},{machine:'e3ng',model:{sha256:'a'.repeat(64)}}]){
 const credits=owned('ul');appendE3NGModCredits({hosts:[credits],machine,packet:sourcePacket,language:()=>language,owned,messages});
 assert.equal(credits.children.length,2,'RH3D panel credit requires the exact source case');
}
// Head view retains the panel choice with the row hidden and disabled, using
// explicit runtime availability rather than a missing mesh or current mode.
choose('reinforced','cable-hole','hex');
for(const available of [false,true,false,true]){
 availability={base:true,cable:true,panels:available};ui.sync();
 assert.equal(host.children[2].hidden,!available);assert.equal(panels.disabled,!available);assert.equal(panels.value,'hex');
 const before=calls;panels.value='stock';if(!available){panels.onchange();assert.equal(calls,before);assert.equal(panels.value,'hex');}else ui.sync();
}
availability=null;ui.sync();assert(selects.every(node=>node.disabled));assert(host.children[2].hidden);
availability={base:true,cable:true,panels:true};ui.sync();
const legacy={schema:'e3ng-mods-v1',base:'reinforced',cable:'cable-hole'};
assert.deepEqual(captureE3NGModSelection(machine,{e3ng_mods:legacy}),{...legacy,panels:'stock'});
for(const invalid of [{...stock(),extra:true},{...stock(),panels:undefined},{...stock(),panels:'bad'}]){
 assert.throws(()=>captureE3NGModSelection(machine,{e3ng_mods:invalid}));
 assert.throws(()=>transferE3NGModSelection(machine,state,invalid));
}

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
for(const [b,c,p]of combinations){
 const initial={...fixture(),e3ng_mods:{schema:'e3ng-mods-v1',base:b,cable:c,panels:p}},view=loadFixture(initial);
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
 const sameViewSaved={...fixture(),e3ng_mods:{schema:'e3ng-mods-v1',base:'reinforced',cable:'cable-hole',panels:'hex'}};
 await view.load('head',sameViewSaved);assert.deepEqual(view.active.snapshot().e3ng_mods,sameViewSaved.e3ng_mods);assert.equal(view.stats.restores,2);
 view.active.reset();await view.load('full');assert.deepEqual(view.active.snapshot().e3ng_mods,stock());
}

// Use the actual save callback and actual configuration-file handler. Camera
// values are opaque arrays; the fake methods record restoration without 3D.
language='ja';state=fixture();choose('reinforced','cable-hole','hex');
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
 assert.equal(base.value,'reinforced');assert.equal(cable.value,'cable-hole');assert.equal(panels.value,'hex');assert.deepEqual(state.companion_data,companionData);
 assert.equal(status.textContent,sourceText('loaded',lang));assert.equal(file.value,'');assert.deepEqual(camera.position.value,savedCamera.position);
}
loadBlocked=true;state=fixture();ui.sync();selectFile(savedView);await file.onchange();assert.equal(base.value,'stock');assert.equal(cable.value,'stock');assert.equal(status.textContent,sourceText('unsafe',language));
const beforeBad=fileLoads;selectFile({...savedView,machine:'other'});await file.onchange();assert.equal(fileLoads,beforeBad);assert.equal(status.textContent,sourceText('unsafe',language));
state=null;ui.sync();assert(selects.every(node=>node.disabled&&node.value==='stock'));
assert.equal(JSON.stringify(companionData),companionBefore,'Companion/source fixture data was mutated');
// Validate the authoritative new translations even when generated files belong
// to the parent worker. No build_locales --write is performed by this job.
const catalog=JSON.parse(await readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
for(const lang of ['de','es','ko','ru']){
 const locale=JSON.parse(await readFile(new URL('../localization/'+lang+'.json',import.meta.url),'utf8'));
 for(const id of ['e3ng.mods.panels','e3ng.mods.hex'])assert.equal(locale.messages[id].source_revision,sourceRevision(catalog.entries[id]));
}
console.log(JSON.stringify({passed:true,languages:6,combinations:8,pending_locales:pendingLocales,selection_ABA:true,explicit_panel_availability:true,invalid_and_blocked_resync:true,native_reset_UI:true,save_file_contract:true,full_head_carry:true,saved_precedence:true,credits_exact_public_STEP_STL_versions:true,companion_data_untouched:true,scope:'Minimal DOM/state doubles and real UI/save/load/reset callbacks. No 3D/model/native or heavy mathematical jobs; not a physical companion/clearance audit.'}));
