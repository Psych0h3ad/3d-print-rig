// Execute the production app's storage/startup/recovery/keyboard/select bodies.
// Storage, download, renderer and DOM are ports; the schema, UI and callbacks
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
const {createLayoutUI}=await import(binding('layout-ui.mjs'));
const files=['layout-app.mjs','layout-state.mjs','layout-groups.mjs','layout-group-data.mjs','layout-group-labels.mjs','layout-ui.mjs'];
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
const syncSelect=section('function sync(){','async function ensureEquipmentPreview(');
const shortcuts=section('function placementKey(event){','async function start(){');
const selectionIds=section('function selectionIds(){','function copySelection(');
const uiConstruction=onlyLine(l=>/^\s*ui=createLayoutUI\(/.test(l),'One actual UI construction');
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
 const {localStorage,document,canvas,container,createLayoutUI,serializeLayout,parseLayout,validatePlacement}=deps;
 ${keys}
 let state=deps.initial,catalog=deps.catalog,rows=deps.catalog,ui,view=deps.view,selected='unit-a';
 let disposed=false,busy=false,roomEditing=false,startEmpty=false,placement=null,interactionGeneration=0;
 const past=[],future=[],actions=[],rotations=[],messages=[],downloads=[],placementCommands=[];
 const $=selector=>document.body.querySelector(selector),t=key=>key,language={t};
 const message=(value,error)=>messages.push({text:typeof value==='function'?value():value,error});
 const download=(blob,name)=>downloads.push({blob,name});
 const act=action=>{actions.push(action);if(action.type==='select')select(action.id);};
 const worldRotate=value=>{rotations.push(value);return true;};
 const rotatePlacement=value=>placementCommands.push(['rotate',value]);
 const cancelPlacement=()=>{placementCommands.push(['cancel']);placement=null;};
 ${storeBody}
 ${readBody}
 ${syncSelect}
 ${selectionIds}
 ${shortcuts}
 function load(){${loadBody}}
 function recover(){${recovery}}
 ${uiConstruction}
 ui.update(state,selected);
 return {ui,readSavedLayout,store,load,recover,placementKey,historyKey,select,sync,
  actions,rotations,messages,downloads,placementCommands,keys:{storageKey,legacyStorageKey,maxFileBytes},
  state:()=>state,setState:s=>{state=s;},setView:v=>{view=v;},
  flags:value=>{busy=!!value.busy;roomEditing=!!value.roomEditing;disposed=!!value.disposed;startEmpty=!!value.startEmpty;},
  setPlacement:value=>{placement=value;},getPlacement:()=>placement,
  seedHistory:()=>{past.push(state);future.push(state);},
  dispose:()=>ui.dispose()};`);
function app(storage=new StoragePort(),initial=empty()){
 const document=new TestDocument(),container=document.createElement('aside'),canvas=document.createElement('canvas'),status=document.createElement('p');
 container.id='layout-sidebar';status.id='layout-status';document.body.append(container,canvas,status);
 const view={canvas,setState(){},focusSelected(){return true;}};
 const a=factory({localStorage:storage,initial,catalog,document,canvas,container,view,createLayoutUI,
  serializeLayout:S.serializeLayout,parseLayout:S.parseLayout,validatePlacement:S.validatePlacement});
 apps.push(a);return {...a,document,container,canvas,storage,view};
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
 search.value='B';search.dispatch('input');const first=key(a,search,'Escape');assert.equal(first.prevented,1);assert.equal(search.value,'');assert.strictEqual(a.document.activeElement,search);
 const second=key(a,search,'Escape');assert.equal(second.prevented,1);assert.strictEqual(a.document.activeElement,a.canvas);
 assert.equal(encode(a.state()),saved);assert.deepEqual(a.actions,[]);assert.deepEqual(a.rotations,[]);assert.deepEqual(a.storage.writes,[]);
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
});
await test('busy/disposed/room editing, modifiers, repeat and consumed key events do not steal slash',()=>{
 const a=app(new StoragePort(),labeled);
 for(const flag of ['busy','disposed','roomEditing']){a.flags({[flag]:true});a.canvas.focus();assert.equal(key(a,a.canvas,'/').prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);}
 a.flags({});
 for(const extra of [{altKey:true},{ctrlKey:true},{metaKey:true},{repeat:true},{defaultPrevented:true}]){
  a.canvas.focus();assert.equal(key(a,a.canvas,'/',extra).prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);
 }
 a.ui.setStatus({busy:true});a.canvas.focus();assert.equal(key(a,a.canvas,'/').prevented,0);assert.strictEqual(a.document.activeElement,a.canvas);assert.deepEqual(a.actions,[]);
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

assert.deepEqual(hashes(),before,'App/unit source changed during focused replay');
const report={passed:results.every(r=>r.passed),checks:results.length,results,source_sha256:before,
 actualAppBindings:['store','readSavedLayout','saved-layout startup branch','recovery download callback','placementKey','historyKey','sync','select','createLayoutUI construction'],
 scope:'Actual source storage/read/migration/recovery and keyboard/select/UI bindings with shared Map tab views and DOM ports. Legacy writer reuses the production unconditional writer bound to its v1 key. No full startup/network, actual old-browser parser, simultaneous-new-tab conflict resolution, browser pixels, CAD/native or model validation claim.'};
const reportAt=process.argv.indexOf('--report');if(reportAt>=0)fs.writeFileSync(path.resolve(process.argv[reportAt+1]),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report));assert.equal(report.passed,true,'Layout app unit regressions');
