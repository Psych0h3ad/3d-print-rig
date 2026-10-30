// Execute the production app's storage/startup/recovery/keyboard/select bodies.
// Storage, download, renderer, panel layout and DOM are ports; the schema, UI and callbacks
// are current source. No live browser, model, mesh, native or full-build job.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';

const root=fileURLToPath(new URL('../',import.meta.url)),siteAt=process.argv.indexOf('--site');
const site=siteAt<0?path.join(root,'site'):path.resolve(process.argv[siteAt+1]);
const appURL=pathToFileURL(path.join(site,'layout/layout-app.mjs')),source=fs.readFileSync(appURL,'utf8');
const binding=name=>{
 const match=source.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`));
 assert.ok(match,'Actual app import missing: '+name);return new URL(match[1],appURL);
};
const S=await import(binding('layout-state.mjs'));
const G=await import(binding('layout-groups.mjs'));
const H=await import(binding('layout-clipboard.mjs'));
const {createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const files=['layout-app.mjs','layout-state.mjs','layout-groups.mjs','layout-clipboard.mjs','layout-group-data.mjs','layout-group-labels.mjs','layout-ui.mjs','layout-i18n.mjs'];
const hashes=()=>Object.fromEntries(files.map(n=>['layout/'+n,createHash('sha256').update(fs.readFileSync(path.join(site,'layout',n))).digest('hex')]));
const before=hashes(),results=[],apps=[];
function section(start,end){
 const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
 assert.ok(a>=0&&b>a,'Production section missing: '+start);return source.slice(a,b);
}
function onlyLine(predicate,label){const matches=source.split(/\r?\n/).filter(predicate);assert.equal(matches.length,1,label);return matches[0];}
const keys=section('const storageKey=','const groupLibraryKey=');
const storeBody=section('function store(){','function readSavedLayout(){');
const readBody=section('function readSavedLayout(){','function message(');
const loadBody=section('  if(!startEmpty)try{const saved=readSavedLayout();','  try{const saved=localStorage.getItem(groupLibraryKey)');
const postReadySave=onlyLine(l=>l.includes('if(loadedSaved)store();'),'One post-readiness save');
assert(source.indexOf(postReadySave)>source.indexOf('if(!await ensureEquipmentPreview(state)||disposed)return;'));
assert(source.indexOf(postReadySave)>source.indexOf("sync();if(getPopStationMigrations(state).length)"));
const syncSelect=section('function sync(){','async function ensureEquipmentPreview(');
const shortcuts=section('function placementKey(event){','async function start(){');
const selectionIds=section('function selectionIds(){','function copySelection(');
const actionBody=section('async function act(action){','function updateViewPresentation(');
const idBody=section('const id=prefix=>','const t=');
const canvasKeys=section("  view.canvas.addEventListener('keydown',event=>{","  view.setOptions({dark:dark()");
// Bound complete constructor statements by their following startup statements;
// callbacks may span lines and contain their own nested calls and semicolons.
const uiConstruction=section('  ui=createLayoutUI(','  ui.setStatus({canPaste:true});');
const rendererConstruction=section('  view=createLayoutRenderer(','  sync();');
const recovery=onlyLine(l=>l.includes('readSavedLayout()')&&l.includes('download(new Blob'),'One actual recovery download');
const catalog=[{id:'app-unit-fixture',label:'Source test printer',widthMm:200,depthMm:180,heightMm:300}];
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
function seed(){
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000}),
  furniture:[S.createDesk({id:'bench-a',pose:pose(-1500)}),S.createDesk({id:'bench-b',pose:pose(1500)})],
  printers:[{id:'printer-a',machineId:catalog[0].id,configurationId:'exact-saved-configuration',
   attachment:{parentId:'bench-a',surfaceId:'top',...pose(123.125,-23.75,0.1)}}]},catalog);
 state=G.createGroup(state,{id:'unit-a',name:'Custom bench',memberIds:['bench-a']},catalog);
 return G.createGroup(state,{id:'unit-b',name:'Other bench',memberIds:['bench-b']},catalog);
}
const labeled=seed(),legacyData=JSON.parse(JSON.stringify(labeled));legacyData.groups.forEach(g=>delete g.label);
const legacy=S.parseLayout(JSON.stringify(legacyData),catalog),encode=s=>S.serializeLayout(s,catalog);
const oldBytes=encode(legacy),newBytes=encode(labeled),empty=()=>S.createDefaultLayout({},catalog);
const V1='3d-print-rig-layout-v1',V2='3d-print-rig-layout-v2';
class StoragePort{
 constructor(map=new Map()){this.map=map;this.reads=[];this.writes=[];this.failGet=false;this.failSet=false;}
 getItem(key){this.reads.push(key);if(this.failGet)throw new Error('Read denied');return this.map.has(key)?this.map.get(key):null;}
 setItem(key,value){this.writes.push([key,String(value)]);if(this.failSet)throw new Error('Quota denied');this.map.set(key,String(value));}
}

const factory=new Function('deps',`"use strict";
 const {localStorage,document,canvas,container,createLayoutUI,serializeLayout,parseLayout,validatePlacement,
  createDefaultLayout,applyAction,applyWorldMove,worldTransform,getPopStationMigrations,renameGroup,ungroup,removeGroup,transformGroup,
  captureLayoutClipboard,regroupLayoutSelection}=deps;
 ${keys}
 let state=deps.initial,catalog=deps.catalog,rows=deps.catalog,ui,view=deps.view,panelLayout=deps.panelLayout,selected='unit-a';
 let disposed=false,busy=false,buildTools=null,activeOpeningTool=null,roomEditing=false,startEmpty=false,placement=null,interactionGeneration=0,operation=null;
 let groupLibrary=[],nextId=1,rendererOptions,loadedSaved=false;
 ${idBody}
 const past=[],future=[],actions=[],rotations=[],messages=[],downloads=[],placementCommands=[],pending=[];
 const $=selector=>document.body.querySelector(selector),t=deps.translate,language={t};
 const message=(value,error)=>messages.push({text:typeof value==='function'?value():value,error});
 const download=(blob,name)=>downloads.push({blob,name});
 const runAction=(()=>{${actionBody};return act;})();
 const act=action=>{actions.push(action);if(deps.transactions){const result=runAction(action);pending.push(result);return result;}if(action.type==='select')select(action.id);};
 const humanError=error=>error?.code||error?.message||String(error);
 const beginPlacement=spec=>{placementCommands.push(['begin',spec]);placement=spec;};
 const ensureEquipmentPreview=async()=>true;
 const worldRotate=value=>{rotations.push(value);return true;};
 const {worldMove,constrainMove,constrainRotate,previewPlacement,placeProposal,updateViewPresentation}=deps;
 const createLayoutRenderer=options=>{rendererOptions=options;return deps.view;};
 const rotatePlacement=value=>placementCommands.push(['rotate',value]);
 const cancelPlacement=()=>{placementCommands.push(['cancel']);placement=null;};
 ${storeBody}
 ${readBody}
 ${syncSelect}
 ${selectionIds}
 ${shortcuts}
 function load(){loadedSaved=false;${loadBody};${postReadySave}}
 function recover(){${recovery}}
 ${uiConstruction}
 ${rendererConstruction}
 ${canvasKeys}
 ui.update(state,selected);
 return {ui,readSavedLayout,store,load,recover,placementKey,historyKey,select,pick,sync,commit,act,selectionIds,
  actions,rotations,messages,downloads,placementCommands,keys:{storageKey,legacyStorageKey,maxFileBytes},
  rendererOptions:()=>rendererOptions,selected:()=>selected,generation:()=>interactionGeneration,
  history:()=>({past:past.length,future:future.length}),settle:()=>Promise.all(pending),
  state:()=>state,setState:s=>{state=s;},setView:v=>{view=v;},setPanelLayout:value=>{panelLayout=value;},
  flags:value=>{busy=!!value.busy;roomEditing=!!value.roomEditing;disposed=!!value.disposed;startEmpty=!!value.startEmpty;},
  setPlacement:value=>{placement=value;},getPlacement:()=>placement,
  seedHistory:()=>{past.push(state);future.push(state);},
  dispose:()=>ui.dispose()};`);
function app(storage=new StoragePort(),initial=empty(),transactions=false){
 const document=new TestDocument(),container=document.createElement('aside'),canvas=document.createElement('canvas'),status=document.createElement('p');
 container.id='layout-sidebar';status.id='layout-status';document.body.append(container,canvas,status);
 const panelLayout={revealCalls:[],reveal(){this.revealCalls.push(document.activeElement);return true;}};
 const view={canvas,pickCalls:[],stateCalls:[],focusCalls:0,cancelCalls:0,gesture:false,
  setPickedRoots(ids){this.pickCalls.push([...ids]);},setState(...args){this.stateCalls.push(args);},
  cancelGesture(){this.cancelCalls++;const active=this.gesture;this.gesture=false;return active;},
  focusSelected(){this.focusCalls++;return true;},view(){}};
 const a=factory({localStorage:storage,initial,catalog,document,canvas,container,view,panelLayout,createLayoutUI,
  ...S,...G,...H,transactions,translate:createLayoutTranslator('en')});
 apps.push(a);return {...a,document,container,canvas,storage,view,panelLayout};
}
// Legacy tabs execute the exact same unconditional production writer body,
// bound to their old key and old unlabeled snapshot. They cannot write v2.
const legacyFactory=new Function('localStorage','serializeLayout','state','catalog',`${keys}
 const oldStore=new Function('localStorage','serializeLayout','state','catalog','storageKey',${JSON.stringify(storeBody+';return store;')});
 return {save:()=>oldStore(localStorage,serializeLayout,state,catalog,legacyStorageKey)(),key:legacyStorageKey};`);

// This models Element.closest's relevant ancestor selectors, not the app guard.
function target(node){
 node.closest=selector=>{
  assert.equal(selector,'input,textarea,select,[contenteditable]:not([contenteditable="false"]),dialog');
  for(let n=node;n;n=n.parentNode){
   const editable=n.getAttribute('contenteditable');
   if(['INPUT','TEXTAREA','SELECT','DIALOG'].includes(n.tagName)||editable!==null&&editable!=='false')return n;
  }
  return null;
 };return node;
}
function event(key,node,extra={}){
 return {key,target:target(node),prevented:0,stopped:0,ctrlKey:false,metaKey:false,altKey:false,shiftKey:false,
  defaultPrevented:false,repeat:false,preventDefault(){this.prevented++;this.defaultPrevented=true;},stopPropagation(){this.stopped++;},...extra};
}
function key(a,node,key,extra={}){
 const e=event(key,node,extra);
 for(const fn of node.listeners.get('keydown')??[])fn(e);
 if(!e.stopped){a.placementKey(e);a.historyKey(e);}return e;
}
async function test(name,fn){const at=apps.length;try{await fn();results.push({name,passed:true});}catch(e){results.push({name,passed:false,error:e.stack});}finally{for(const a of apps.splice(at))a.dispose();}}

await test('actual key declarations separate current layouts from legacy layouts and retain file size budget',()=>{
 const a=app();assert.deepEqual(a.keys,{storageKey:V2,legacyStorageKey:V1,maxFileBytes:2*1024*1024});assert.notEqual(V1,V2);
});
await test('legacy fallback is read-only until actual successful startup migrates only the new key',()=>{
 const map=new Map([[V1,oldBytes]]),s=new StoragePort(map),a=app(s);
 assert.equal(a.readSavedLayout(),oldBytes);assert.equal(s.writes.length,0);assert.deepEqual(s.reads,[V2,V1]);s.reads=[];
 a.load();assert.deepEqual(a.state(),legacy);assert.equal(map.get(V1),oldBytes);assert.equal(map.get(V2),oldBytes);
 assert.deepEqual(s.writes.map(([k])=>k),[V2]);assert(a.state().groups.every(g=>!Object.hasOwn(g,'label')));
 const b=app(new StoragePort(map));b.load();assert.deepEqual(b.storage.reads,[V2]);assert.equal(map.get(V1),oldBytes);assert.equal(b.messages.length,0);
});
await test('existing labeled v2 wins over conflicting legacy bytes and stores current identities exactly',()=>{
 const map=new Map([[V1,oldBytes],[V2,newBytes]]),s=new StoragePort(map),a=app(s);a.load();
 assert.deepEqual(a.state(),labeled);assert.deepEqual(s.reads,[V2]);assert.equal(map.get(V1),oldBytes);assert.equal(map.get(V2),newBytes);
 assert.deepEqual(a.state().groups.map(g=>[g.id,g.label,g.name]),labeled.groups.map(g=>[g.id,g.label,g.name]));
 assert.deepEqual(a.state().printers,labeled.printers);
});
await test('old and new tab Map views cannot overwrite the other version after migration',()=>{
 const map=new Map([[V1,oldBytes]]),newTab=app(new StoragePort(map));newTab.load();newTab.setState(labeled);newTab.store();
 const changedOld=S.applyAction(legacy,{type:'UPDATE_FURNITURE',id:'bench-a',patch:{pose:{xMm:-1400}}},catalog);
 const oldPort=new StoragePort(map),oldTab=legacyFactory(oldPort,S.serializeLayout,changedOld,catalog);oldTab.save();
 assert.equal(oldTab.key,V1);assert.deepEqual(oldPort.writes.map(([k])=>k),[V1]);assert.equal(map.get(V2),newBytes);
 const fresh=app(new StoragePort(map));fresh.load();assert.deepEqual(fresh.state(),labeled);assert.deepEqual(fresh.storage.reads,[V2]);
 newTab.setState(G.renameGroup(labeled,'unit-b','Renamed new identity',catalog));newTab.store();
 assert.equal(map.get(V1),encode(changedOld));assert.equal(S.parseLayout(map.get(V2),catalog).groups[1].label,'B');
});
await test('a fresh candidate tab rereads current v2 rather than a later legacy writer',()=>{
 const map=new Map([[V1,oldBytes],[V2,newBytes]]),a=app(new StoragePort(map));a.load();
 const renamed=G.renameGroup(a.state(),'unit-a','Fresh current plan',catalog);a.setState(renamed);a.store();map.set(V1,oldBytes.replace('Custom bench','Legacy latest'));
 const b=app(new StoragePort(map));b.load();assert.deepEqual(b.state(),renamed);assert.deepEqual(b.storage.reads,[V2]);
});
await test('present empty/malformed/oversized v2 never silently falls back or overwrites either raw document',async()=>{
 for(const value of ['', '{broken','null','x'.repeat(2*1024*1024+1)]){
  const map=new Map([[V1,oldBytes],[V2,value]]),s=new StoragePort(map),initial=empty(),a=app(s,initial);
  assert.equal(a.readSavedLayout(),value);s.reads=[];a.load();assert.strictEqual(a.state(),initial);assert.deepEqual(s.reads,[V2]);assert.equal(s.writes.length,0);
  assert.equal(map.get(V1),oldBytes);assert.equal(map.get(V2),value);
  a.recover();assert.equal(a.downloads.length,value?1:0);if(value)assert.equal(await a.downloads[0].blob.text(),value);
 }
});
await test('invalid or missing legacy data never creates a migrated v2 document',()=>{
 for(const raw of [undefined,'{bad']){
  const map=new Map(raw===undefined?[]:[[V1,raw]]),a=app(new StoragePort(map)),initial=a.state();a.load();
  assert.strictEqual(a.state(),initial);assert.equal(map.has(V2),false);assert.equal(a.storage.writes.length,0);assert.equal(a.messages.length,raw===undefined?0:1);
 }
});
await test('migration write failure and denied reads leave the legacy bytes recoverable',()=>{
 const map=new Map([[V1,oldBytes]]),s=new StoragePort(map),a=app(s);s.failSet=true;a.load();
 assert.deepEqual(a.state(),legacy);assert.equal(map.get(V1),oldBytes);assert.equal(map.has(V2),false);
 s.failSet=false;s.failGet=true;const initial=a.state();a.load();assert.strictEqual(a.state(),initial);assert.equal(a.messages.at(-1).error,true);
 assert.doesNotThrow(()=>a.recover());assert.equal(a.downloads.length,0);assert.equal(map.get(V1),oldBytes);
});
await test('explicit empty startup bypasses both saved keys and performs no migration write',()=>{
 const a=app(new StoragePort(new Map([[V1,oldBytes],[V2,newBytes]]))),initial=a.state();a.flags({startEmpty:true});a.load();
 assert.strictEqual(a.state(),initial);assert.deepEqual(a.storage.reads,[]);assert.deepEqual(a.storage.writes,[]);
});
await test('actual recovery callback exports the authoritative raw document without parsing or rewriting it',async()=>{
 for(const [entries,expected]of [[[[V1,oldBytes]],oldBytes],[[[V1,oldBytes],[V2,'{recover exact raw bytes']],'{recover exact raw bytes']]){
  const a=app(new StoragePort(new Map(entries)));a.recover();assert.equal(a.downloads.length,1);
  assert.equal(a.downloads[0].name,'3d-print-rig-layout.json');assert.equal(a.downloads[0].blob.type,'application/json');
  assert.equal(await a.downloads[0].blob.text(),expected);assert.deepEqual(a.storage.writes,[]);
 }
});
await test('slash and two-stage Escape execute actual app UI wiring and return native focus to canvas',()=>{
 const a=app(new StoragePort(),labeled),saved=encode(a.state());a.canvas.focus();const slash=key(a,a.canvas,'/');
 const search=a.container.querySelector('#layout-object-search');assert.equal(slash.prevented,1);assert.strictEqual(a.document.activeElement,search);
 assert.deepEqual(a.panelLayout.revealCalls,[a.canvas],'Reveal the inspector before focusing its search');
 search.value='B';search.dispatch('input');const first=key(a,search,'Escape');assert.equal(first.prevented,1);assert.equal(search.value,'');assert.strictEqual(a.document.activeElement,search);
 const second=key(a,search,'Escape');assert.equal(second.prevented,1);assert.strictEqual(a.document.activeElement,a.canvas);
 assert.deepEqual(a.panelLayout.revealCalls,[a.canvas],'Escape must not reveal the inspector again');
 assert.equal(encode(a.state()),saved);assert.deepEqual(a.actions,[]);assert.deepEqual(a.rotations,[]);assert.deepEqual(a.storage.writes,[]);
});
await test('actual reveal callback tolerates an unbound panel and follows its later binding for search and catalog',()=>{
 const a=app(new StoragePort(),labeled),saved=encode(a.state());a.setPanelLayout(null);a.canvas.focus();
 assert.equal(key(a,a.canvas,'/').prevented,1);assert.strictEqual(a.document.activeElement,a.container.querySelector('#layout-object-search'));
 assert.deepEqual(a.panelLayout.revealCalls,[]);a.setPanelLayout(a.panelLayout);a.canvas.focus();
 assert.equal(key(a,a.canvas,'/').prevented,1);assert.deepEqual(a.panelLayout.revealCalls,[a.canvas]);
 a.canvas.focus();assert.equal(a.ui.openPrinterCatalog(),true);
 assert.deepEqual(a.panelLayout.revealCalls,[a.canvas,a.canvas]);assert.strictEqual(a.document.activeElement,a.container.querySelector('#layout-catalog-search'));
 assert.equal(encode(a.state()),saved);assert.deepEqual(a.actions,[]);assert.deepEqual(a.storage.writes,[]);
});
await test('actual search escape callback tolerates a not-yet-created view and follows its later binding',()=>{
 const a=app(new StoragePort(),labeled),search=a.container.querySelector('#layout-object-search');a.setView(null);search.focus();assert.doesNotThrow(()=>key(a,search,'Escape'));
 a.setView(a.view);key(a,search,'Escape');assert.strictEqual(a.document.activeElement,a.canvas);
});
await test('native input/select/textarea/contenteditable/dialog targets keep typing and native undo shortcuts',()=>{
 const a=app(new StoragePort(),labeled);a.seedHistory();
 const search=a.container.querySelector('#layout-object-search'),numeric=a.container.querySelector('[data-layout-field="xMm"]');
 const textarea=a.document.createElement('textarea'),select=a.document.createElement('select'),editable=a.document.createElement('div'),span=a.document.createElement('span'),dialog=a.document.createElement('dialog'),dialogChild=a.document.createElement('button');
 editable.setAttribute('contenteditable','true');editable.append(span);dialog.append(dialogChild);a.document.body.append(textarea,select,editable,dialog);
 for(const node of [search,numeric,textarea,select,editable,span,dialogChild])for(const [k,extra]of [['/',{}],['r',{}],['Delete',{}],['Backspace',{}],['f',{}],['a',{ctrlKey:true}],['g',{metaKey:true}],['z',{ctrlKey:true}],['z',{metaKey:true,shiftKey:true}],['/',{isComposing:true}]]){
  node.focus();const e=event(k,node,extra);a.placementKey(e);a.historyKey(e);assert.equal(e.prevented,0,k+' in '+node.tagName);assert.strictEqual(a.document.activeElement,node);
 }
 assert.deepEqual(a.actions,[]);assert.deepEqual(a.rotations,[]);assert.deepEqual(a.storage.writes,[]);
 assert.deepEqual(a.panelLayout.revealCalls,[],'Typing and native shortcuts must not reveal the inspector');
});
await test('busy/disposed/room editing, modifiers, repeat and consumed key events do not steal slash',()=>{
 const a=app(new StoragePort(),labeled);
 for(const flag of ['busy','disposed','roomEditing']){a.flags({[flag]:true});a.canvas.focus();assert.equal(key(a,a.canvas,'/').prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);}
 a.flags({});
 for(const extra of [{altKey:true},{ctrlKey:true},{metaKey:true},{repeat:true},{defaultPrevented:true}]){
  a.canvas.focus();assert.equal(key(a,a.canvas,'/',extra).prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);
 }
 a.ui.setStatus({busy:true});a.canvas.focus();assert.equal(key(a,a.canvas,'/').prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);assert.deepEqual(a.actions,[]);
 assert.deepEqual(a.panelLayout.revealCalls,[],'Guarded shortcuts must not reveal the inspector');
});
await test('placement and history shortcuts retain their existing command paths outside native inputs',()=>{
 const a=app(new StoragePort(),labeled);a.seedHistory();a.setPlacement({kind:'group'});a.canvas.focus();
 assert.equal(key(a,a.canvas,'/').prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);
 assert.equal(key(a,a.canvas,'r',{shiftKey:true}).prevented,1);assert.deepEqual(a.placementCommands.at(-1),['rotate',true]);
 assert.equal(key(a,a.canvas,'Escape').prevented,1);assert.equal(a.getPlacement(),null);
 key(a,a.canvas,'z',{ctrlKey:true});assert.deepEqual(a.actions.at(-1),{type:'undo'});
 key(a,a.canvas,'z',{metaKey:true,shiftKey:true});assert.deepEqual(a.actions.at(-1),{type:'redo'});
 key(a,a.canvas,'r');assert.deepEqual(a.rotations.at(-1),{id:'unit-a',deltaDeg:90});
});
await test('same-ID explicit app select opens inspector from Room while ordinary sync keeps Room',()=>{
 const a=app(new StoragePort(),labeled),room=a.container.querySelector('#layout-tab-room'),panel=a.container.querySelector('#layout-nav-selection');
 room.click();assert.equal(panel.hidden,true);a.sync();assert.equal(panel.hidden,true);
 a.select('unit-a');assert.equal(panel.hidden,false);assert.equal(a.container.querySelector('#layout-selected-unit').getAttribute('aria-label'),'A · Custom bench');
 room.click();a.ui.setPickedRootIds(['bench-b']);a.setPlacement({kind:'group'});a.select('unit-b');
 assert.equal(a.getPlacement(),null);assert.deepEqual(a.placementCommands.at(-1),['cancel']);assert.equal(panel.hidden,false);
 assert.equal(a.container.querySelector('#layout-selected-unit').getAttribute('aria-label'),'B · Other bench');assert.deepEqual(a.storage.writes,[]);
});
await test('busy explicit selection cannot change the active Room panel or selected identity',()=>{
 const a=app(new StoragePort(),labeled);a.container.querySelector('#layout-tab-room').click();a.flags({busy:true});a.select('unit-b');
 assert.equal(a.container.querySelector('#layout-nav-room').hidden,false);assert.equal(a.container.querySelector('#layout-selected-unit').getAttribute('aria-label'),'A · Custom bench');
});

// Replay actual app construction and action/shortcut bodies. The renderer is a
// recording port, not a second implementation of pick/selection semantics.
function integration(initial=labeled){return app(new StoragePort(),initial,true);}
function checkRoot(a,id,checked=true){
 const checkbox=a.container.querySelector(`[data-layout-group-member="${id}"]`);assert.ok(checkbox,id);
 checkbox.checked=checked;checkbox.dispatch('change');
}
function command(a,name,parent=a.container){return parent.querySelector(`[data-layout-command="${name}"]`);}
function usable(node){for(let n=node;n;n=n.parentNode)if(n.hidden)return false;return !!node&&!node.disabled;}
function canvasPick(a,ids,extra={}){a.rendererOptions().onPick({ids,mode:'toggle',...extra});}
function assertNoErrors(a){assert.deepEqual(a.messages.filter(m=>m.error),[]);assert.equal(a.container.querySelector('[role="status"]').dataset.error,'false');}

await test('actual renderer onPick binding reaches pick, canonical UI checks and renderer callback once',()=>{
 const a=integration(),original=encode(a.state());
 assert.strictEqual(a.rendererOptions().onPick,a.pick);assert.strictEqual(a.rendererOptions().onSelect,a.select);
 canvasPick(a,['bench-b'],{seedIds:['bench-a']});
 assert.deepEqual(a.ui.getPickedRootIds(),['bench-a','bench-b']);assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b']]);
 assert.equal(a.selected(),null);assert.equal(a.view.stateCalls.at(-1)[1],null);
 for(const id of ['bench-a','bench-b'])assert.equal(a.container.querySelector(`[data-layout-group-member="${id}"]`).checked,true);
 assert.equal(a.container.querySelector('#layout-selection-count').textContent,'Selected: 2');
 assert.equal(encode(a.state()),original);assert.deepEqual(a.history(),{past:0,future:0});assert.deepEqual(a.storage.writes,[]);
 canvasPick(a,['bench-b','missing','printer-a'],{mode:'add',seedIds:['missing']});
 assert.deepEqual(a.ui.getPickedRootIds(),['bench-a','bench-b']);assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b']]);
});
await test('toggling the last canvas root off never revives the former primary or its destructive shortcuts',()=>{
 const a=integration(),original=encode(a.state());canvasPick(a,['bench-b']);canvasPick(a,['bench-b']);
 assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.equal(a.selected(),null);assert.deepEqual(a.selectionIds(),[]);
 assert.deepEqual(a.view.pickCalls,[['bench-b'],[]]);
 for(const name of ['r','Delete','Backspace','ArrowLeft','ArrowDown','f'])key(a,a.canvas,name);
 assert.deepEqual(a.actions,[]);assert.deepEqual(a.rotations,[]);assert.equal(a.view.focusCalls,0);assert.equal(encode(a.state()),original);
});
await test('actual UI checkbox/select-all/clear callbacks keep renderer roots synchronized without repeated notifications',()=>{
 const a=integration();checkRoot(a,'bench-b');checkRoot(a,'bench-b');
 assert.deepEqual(a.view.pickCalls,[['bench-b']]);key(a,a.canvas,'a',{ctrlKey:true});key(a,a.canvas,'a',{metaKey:true});
 assert.deepEqual(a.view.pickCalls,[['bench-b'],['bench-a','bench-b']]);
 command(a,'layout.selection.clear').click();command(a,'layout.selection.clear').click();
 assert.deepEqual(a.view.pickCalls,[['bench-b'],['bench-a','bench-b'],[]]);assert.deepEqual(a.actions,[]);
});
await test('callback updates and same-ID echoes are finite through actual UI and app sync bindings',()=>{
 const a=integration(),record=a.view.setPickedRoots;let depth=0,maxDepth=0;
 a.view.setPickedRoots=function(ids){
  depth++;maxDepth=Math.max(maxDepth,depth);assert(depth<3,'Recursive pick notification');
  assert.deepEqual(a.ui.getPickedRootIds(),ids);record.call(this,ids);a.sync();a.ui.setPickedRootIds([...ids].reverse());depth--;
 };
 canvasPick(a,['bench-b']);a.sync();a.sync();assert.equal(maxDepth,1);assert.deepEqual(a.view.pickCalls,[['bench-b']]);
 assert.equal(a.container.querySelector('[role="status"]').hidden,true);assert.deepEqual(a.messages,[]);
});
await test('Ctrl/Cmd+G and visible Group execute production regroup transactions on checked roots with companions',async()=>{
 for(const source of ['canvas','checkbox','strip'])for(const modifier of ['ctrlKey','metaKey']){
  const a=integration(),before=encode(a.state()),oldGroup=structuredClone(a.state().groups.find(g=>g.id==='unit-b'));
  a.select('unit-b');
  if(source==='checkbox')checkRoot(a,'bench-a');else canvasPick(a,['bench-a']);
  if(source==='strip')command(a,'layout.selection.group').click();else assert.equal(key(a,a.canvas,'g',{[modifier]:true}).prevented,1);
  await a.settle();
  const created=a.state().groups.find(g=>!['unit-a','unit-b'].includes(g.id));assert.ok(created,a.messages.map(m=>m.text).join(','));
  assert.deepEqual(created.memberIds,['bench-a']);assert.deepEqual(a.state().groups.find(g=>g.id==='unit-b'),oldGroup);
  assert.deepEqual(a.state().printers,labeled.printers);assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.deepEqual(a.view.pickCalls.at(-1),[]);
  assert.equal(a.selected(),created.id);assert.deepEqual(a.history(),{past:1,future:0});assert.notEqual(encode(a.state()),before);
  assert.equal(a.storage.writes.length,1);assertNoErrors(a);
 }
});
await test('Ctrl/Cmd+D and visible Duplicate capture highlighted roots rather than a former primary',async()=>{
 for(const source of ['canvas','checkbox','strip'])for(const modifier of ['ctrlKey','metaKey']){
  const a=integration(),original=encode(a.state());a.select('unit-b');
  if(source==='checkbox')checkRoot(a,'bench-a');else canvasPick(a,['bench-a']);
  if(source==='strip')command(a,'layout.selection.duplicate').click();else assert.equal(key(a,a.canvas,'d',{[modifier]:true}).prevented,1);
  await a.settle();const placed=a.getPlacement();assert.equal(placed?.kind,'group',a.messages.map(m=>m.text).join(','));
  const expected=H.captureLayoutClipboard(a.state(),['bench-a'],catalog,{name:placed.template.name});assert.deepEqual(placed.template,expected);
  assert.equal(placed.template.printers[0].configurationId,'exact-saved-configuration');
  assert.equal(encode(a.state()),original);assert.deepEqual(a.history(),{past:0,future:0});assert.deepEqual(a.storage.writes,[]);
  assert.deepEqual(a.ui.getPickedRootIds(),['bench-a']);assert.deepEqual(a.messages,[]);
 }
});
await test('canvas and list selection clear checked roots; ordinary primary movement works again',async()=>{
 for(const source of ['canvas','list']){
  const a=integration();canvasPick(a,['bench-a']);a.setPlacement({kind:'group'});
  if(source==='canvas')a.rendererOptions().onSelect('unit-b');else a.container.querySelector('[data-layout-group="unit-b"]').click();
  await a.settle();assert.equal(a.selected(),'unit-b');assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.deepEqual(a.view.pickCalls.at(-1),[]);assert.equal(a.getPlacement(),null);
  const original=a.state().groups.find(g=>g.id==='unit-b').pose.xMm;key(a,a.canvas,'ArrowRight');await a.settle();
  assert.equal(a.state().groups.find(g=>g.id==='unit-b').pose.xMm,original+10);assert.deepEqual(a.history(),{past:1,future:0});assertNoErrors(a);
  canvasPick(a,['bench-a']);a.rendererOptions().onSelect(null);assert.equal(a.selected(),null);assert.deepEqual(a.ui.getPickedRootIds(),[]);
 }
});
await test('Escape cancels an active marquee before clearing existing checked roots; the next Escape clears',()=>{
 const a=integration();canvasPick(a,['bench-a','bench-b']);const generation=a.generation();a.view.gesture=true;
 assert.equal(key(a,a.canvas,'Escape').prevented,1);assert.equal(a.view.cancelCalls,1);assert.equal(a.view.gesture,false);
 assert.deepEqual(a.ui.getPickedRootIds(),['bench-a','bench-b']);assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b']]);
 assert.deepEqual(a.placementCommands,[]);assert.equal(a.generation(),generation);
 assert.equal(key(a,a.canvas,'Escape').prevented,1);assert.equal(a.view.cancelCalls,2);
 assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b'],[]]);assert.equal(a.selected(),null);
});
await test('Escape cancels duplicate placement and clears roots without modifying the source plan',async()=>{
 const a=integration(),original=encode(a.state());canvasPick(a,['bench-a']);key(a,a.canvas,'d',{ctrlKey:true});await a.settle();
 assert.ok(a.getPlacement());assert.equal(key(a,a.canvas,'Escape').defaultPrevented,true);
 assert.equal(a.getPlacement(),null);assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.equal(encode(a.state()),original);assert.deepEqual(a.history(),{past:0,future:0});
});
await test('busy, room editing, disposed and placement guards reject app picks and selection shortcuts',()=>{
 for(const flag of ['busy','roomEditing','disposed','placement']){
  const a=integration(),original=encode(a.state());canvasPick(a,['bench-a']);
  if(flag==='placement')a.setPlacement({kind:'group'});else {a.flags({[flag]:true});if(flag==='busy')a.sync();}
  const generation=a.generation(),notifications=a.view.pickCalls.length;
  canvasPick(a,['bench-b']);
  for(const [name,extra]of [['g',{ctrlKey:true}],['d',{metaKey:true}],['a',{ctrlKey:true}],['Delete',{}]])key(a,a.canvas,name,extra);
  assert.deepEqual(a.ui.getPickedRootIds(),['bench-a']);assert.equal(a.view.pickCalls.length,notifications);assert.equal(a.generation(),generation);
  assert.deepEqual(a.actions,[]);assert.equal(encode(a.state()),original);assert.deepEqual(a.storage.writes,[]);
  if(flag==='busy'){command(a,'layout.selection.clear').click();a.ui.setPickedRootIds([]);assert.deepEqual(a.ui.getPickedRootIds(),['bench-a']);}
 }
});
await test('highlighted checked roots block primary Delete, Backspace, R and arrow moves while F frames roots',()=>{
 const a=integration(),original=encode(a.state());checkRoot(a,'bench-b');
 for(const name of ['Delete','Backspace','r','ArrowLeft','ArrowRight','ArrowUp','ArrowDown'])for(const shiftKey of [false,true])key(a,a.canvas,name,{shiftKey});
 assert.deepEqual(a.actions,[]);assert.deepEqual(a.rotations,[]);assert.equal(encode(a.state()),original);assert.deepEqual(a.history(),{past:0,future:0});
 assert.equal(key(a,a.canvas,'f').prevented,1);assert.equal(a.view.focusCalls,1);assert.deepEqual(a.ui.getPickedRootIds(),['bench-b']);
});
await test('real commits, support reparenting and reset prune UI roots and notify once per change',()=>{
 const floor={id:'floor-printer',machineId:catalog[0].id,configurationId:null,attachment:{parentId:null,surfaceId:'floor',...pose(0,2000)}};
 const initial=S.createDefaultLayout({...labeled,printers:[...labeled.printers,floor]},catalog),a=integration(initial);
 canvasPick(a,['bench-a','bench-b','floor-printer']);a.commit(S.applyAction(a.state(),{type:'SET_ATTACHMENT',id:floor.id,attachment:{parentId:'bench-b',surfaceId:'top',...pose()}},catalog));
 assert.deepEqual(a.ui.getPickedRootIds(),['bench-a','bench-b']);assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b','floor-printer'],['bench-a','bench-b']]);
 a.commit(G.removeGroup(a.state(),'unit-a',catalog));a.sync();assert.deepEqual(a.ui.getPickedRootIds(),['bench-b']);
 a.commit(empty(),{selection:null});a.sync();assert.deepEqual(a.view.pickCalls,[['bench-a','bench-b','floor-printer'],['bench-a','bench-b'],['bench-b'],[]]);
 assert.deepEqual(a.ui.getPickedRootIds(),[]);assert.equal(a.container.querySelector('#layout-selection-actions').hidden,true);
 assert.equal(a.view.stateCalls.at(-1)[0],a.state());assertNoErrors(a);
});
await test('canvas pick invalidates an in-flight import using the actual generation guard',async()=>{
 const a=integration(),original=encode(a.state());let resolveText;const pending=a.act({type:'import',file:{size:100,text:()=>new Promise(resolve=>{resolveText=resolve;})}});
 canvasPick(a,['bench-b']);resolveText(encode(empty()));await pending;
 assert.equal(encode(a.state()),original);assert.deepEqual(a.ui.getPickedRootIds(),['bench-b']);assert.deepEqual(a.history(),{past:0,future:0});assert.deepEqual(a.storage.writes,[]);
});

// These regressions intentionally assert the user-facing selection contract;
// failures identify production findings, not exceptions to that contract.
await test('checked-root sidebar Delete cannot remove an unhighlighted former primary',async()=>{
 const a=integration(),primary=structuredClone(a.state().groups.find(g=>g.id==='unit-a'));checkRoot(a,'bench-b');
 const button=command(a,'layout.delete',a.container.querySelector('#layout-nav-selection'));if(usable(button))button.click();await a.settle();
 assert.deepEqual(a.state().groups.find(g=>g.id===primary.id),primary,'Sidebar Delete removed the old unhighlighted group');
 assert(a.state().furniture.some(f=>f.id==='bench-a'));assert(a.state().printers.some(p=>p.id==='printer-a'));
});
await test('checked-root sidebar pose edit cannot move an unhighlighted former primary',async()=>{
 const a=integration(),original=encode(a.state());checkRoot(a,'bench-b');const field=a.container.querySelector('[data-layout-field="xMm"]');
 if(usable(field)){field.value='-1400';field.dispatch('input');field.dispatch('change');}await a.settle();
 assert.equal(encode(a.state()),original,'Sidebar pose edited the old unhighlighted group');
});
await test('checked-root sidebar Duplicate is disabled or captures the highlighted selection',async()=>{
 const a=integration();checkRoot(a,'bench-b');const button=command(a,'layout.duplicate',a.container.querySelector('#layout-nav-selection'));
 if(usable(button))button.click();await a.settle();const placed=a.getPlacement();
 if(placed)assert.deepEqual(placed.template,H.captureLayoutClipboard(a.state(),['bench-b'],catalog,{name:placed.template.name}),'Sidebar duplicated the old primary');
});
await test('Ctrl/Cmd+Shift+G cannot ungroup an unhighlighted primary while roots are checked',async()=>{
 for(const modifier of ['ctrlKey','metaKey']){
  const a=integration(),oldGroup=structuredClone(a.state().groups.find(g=>g.id==='unit-a'));checkRoot(a,'bench-b');
  key(a,a.canvas,'g',{[modifier]:true,shiftKey:true});await a.settle();
  assert.deepEqual(a.state().groups.find(g=>g.id===oldGroup.id),oldGroup,'Ungroup targeted the old primary');
 }
});
await test('checkbox selection supersedes an in-flight import just as canvas selection does',async()=>{
 const a=integration(),original=encode(a.state());let resolveText;const pending=a.act({type:'import',file:{size:100,text:()=>new Promise(resolve=>{resolveText=resolve;})}});
 checkRoot(a,'bench-b');resolveText(encode(empty()));await pending;
 assert.equal(encode(a.state()),original,'Late import replaced the newly selected plan');assert.deepEqual(a.ui.getPickedRootIds(),['bench-b']);assert.deepEqual(a.storage.writes,[]);
});

await test('placing a copy makes its new primary selection replace the source checks',()=>{
 const a=integration();checkRoot(a,'bench-a');checkRoot(a,'bench-b');
 const next=structuredClone(a.state());next.furniture.push(S.createDesk({id:'placed-copy',pose:pose(0,2000)}));
 a.commit(next,{selection:'placed-copy'});
 assert.deepEqual(a.ui.getPickedRootIds(),[],'Original roots remained checked after placement');
 assert.deepEqual(a.selectionIds(),['placed-copy'],'Commands must target the newly placed object');
 assert(a.container.querySelector('#layout-field-xMm'),'The new primary has an editable pose');
});

assert.deepEqual(hashes(),before,'App/unit source changed during focused replay');
const report={passed:results.every(r=>r.passed),checks:results.length,results,source_sha256:before,
 actualAppBindings:['store','readSavedLayout','saved-layout startup branch','recovery download callback','placementKey','historyKey','canvas arrow listener','sync','commit','select','pick','selectionIds','act','createLayoutUI construction including onPickedChange','createLayoutRenderer construction including onPick/onSelect'],
 scope:'Actual source storage/read/migration/recovery, pick/select/UI callback, action/commit and keyboard bindings. Integration cases execute production regroup and clipboard capture through real imported state/group/clipboard/UI modules. Renderer, panel reveal, placement preview, rotation, file text, storage and download are recording ports. Legacy writer reuses the production writer bound to v1. No renderer hit-testing/marquee geometry, full startup/network, browser pixels, CAD/native or model validation claim.'};
const reportAt=process.argv.indexOf('--report');if(reportAt>=0)fs.writeFileSync(path.resolve(process.argv[reportAt+1]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));assert.equal(report.passed,true,'Layout app unit regressions');
