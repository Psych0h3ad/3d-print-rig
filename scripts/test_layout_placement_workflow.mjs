// Production app closures with real schema/placement helpers and I/O ports.
// No browser permissions, renderer, model or native jobs.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url)),arg=process.argv.indexOf('--site');
const site=arg<0?path.join(root,'site'):path.resolve(process.argv[arg+1]);
const appFile=path.join(site,'layout/layout-app.mjs'),source=fs.readFileSync(appFile,'utf8');
const indexFile=path.join(site,'layout/index.html'),html=fs.readFileSync(indexFile,'utf8');
const hash=s=>createHash('sha256').update(s).digest('hex');
const bind=name=>{
 const m=source.match(new RegExp("from ['\"](\\./"+name.replaceAll('.','\\.')+"[^'\"]*)['\"]"));
 assert(m,'Missing production import '+name);return new URL(m[1],pathToFileURL(appFile));
};
const S=await import(bind('layout-state.mjs')),G=await import(bind('layout-groups.mjs'));
const H=await import(bind('layout-clipboard.mjs')),P=await import(bind('layout-placement.mjs'));
const section=(a,b)=>{const start=source.indexOf(a),end=source.indexOf(b,start+a.length);assert(start>=0&&end>start,'Missing production section '+a);return source.slice(start,end);};
const oneLine=(pattern,label)=>{const rows=source.split(/\r?\n/).filter(l=>pattern.test(l));assert.equal(rows.length,1,label);return rows[0];};
assert(source.includes('async function readClipboardSelection(generation)'));
const syncSelect=section('function sync(){','async function ensureEquipmentPreview(');
const clipboard=section('function selectionIds(){','function refreshGroupLibrary(){');
const placement=section('function cancelPlacement(){','function rotatePlacement(');
const actions=section('async function act(action){','function updateViewPresentation(');
const shortcuts=section('function placementKey(event){','function historyKey(event){');
const actualId=oneLine(/^const id=prefix=>/,'One production ID allocator');
const placementButtons=oneLine(/for\(const button of document\.querySelectorAll\('\[data-layout-placement\]'\)\)/,'Actual placement Cancel button binding');
const repeatInput=[...html.matchAll(/<input\b[^>]*>/gi)].map(m=>m[0]).find(s=>/\bid=["']layout-repeat["']/.test(s));
assert(repeatInput&&/\btype=["']checkbox["']/.test(repeatInput),'Repeat requires a shipped checkbox');
const catalog=[{id:'workflow-fixture',label:'Test printer',widthMm:200,depthMm:180,heightMm:250}];
const pose=(xMm=0,zMm=0,yawDeg=0)=>({xMm,zMm,yawDeg});
const seed=()=>S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000}),
 furniture:[S.createDesk({id:'local-desk',widthMm:900,depthMm:600,pose:pose(-2000)}),
 S.createDesk({id:'system-desk',widthMm:1200,depthMm:600,pose:pose(2000)})]},catalog);
const encode=s=>S.serializeLayout(s,catalog),initial=seed();
const payload=id=>H.encodeLayoutClipboard(H.captureLayoutClipboard(initial,[id],catalog,{name:'layout.group.defaultName'}),catalog);
const localText=payload('local-desk'),systemText=payload('system-desk'),results=[];
async function test(name,fn){try{await fn();results.push(name);}catch(error){error.message=name+': '+error.message;throw error;}}
function deferred(){let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};}
function virtualTimers(){
 let now=0,next=0;const pending=new Map(),created=[],cleared=[];
 return {created,cleared,pendingCount:()=>pending.size,
  setTimeout(fn,delay){const id=++next;assert.equal(typeof fn,'function');assert(Number.isFinite(delay)&&delay>=0);pending.set(id,{fn,at:now+delay});created.push({id,delay});return id;},
  clearTimeout(id){cleared.push(id);pending.delete(id);},
  advance(ms){now+=ms;for(const [id,row]of [...pending].sort((a,b)=>a[1].at-b[1].at))if(row.at<=now&&pending.has(id)){pending.delete(id);row.fn();}}};
}
function event(key,{text='',editing=false,shiftKey=false}={}){
 return {key,shiftKey,ctrlKey:false,metaKey:false,altKey:false,repeat:false,defaultPrevented:false,
 target:{closest:()=>editing?{}:null},preventDefault(){this.defaultPrevented=true;},
 clipboardData:{getData:()=>text,setData:()=>{}}};
}
function app({read=async()=>systemText,write=async()=>{},cached=localText,missingAPI=false,clock=virtualTimers()}={}){
 const messages=[],statuses=[],snapshots=[],nodes=new Map(),reads=[],writes=[];
 const node=key=>{if(!nodes.has(key))nodes.set(key,{hidden:false,textContent:'',dataset:{},checked:false,value:'',focus(){}});return nodes.get(key);};
 const ui={update(){},setStatus(v){statuses.push(v);},focusSelection(){},getPickedRootIds:()=>[],setPickedRootIds(){}};
 const cancelButton={dataset:{layoutPlacement:'cancel'},addEventListener(type,fn){assert.equal(type,'click');this.click=fn;}};
 const navigator=missingAPI?{}:{clipboard:{readText:()=>{reads.push(true);return read();},writeText:text=>{writes.push(text);return write(text);}}};
 const document={body:{dataset:{}},querySelector:node,querySelectorAll:selector=>{assert.equal(selector,'[data-layout-placement]');return [cancelButton];}};
 const deps={S,G,H,P,catalog,initial,cached,ui,node,messages,statuses,snapshots};
 const setup=new Function('deps','navigator','document','setTimeout','clearTimeout',String.raw`
  const {S,G,H,P,catalog,ui,node:$}=deps;
  const {createDefaultLayout,createDesk,createShelf,createPopStation,applyAction,applyWorldMove,
   deriveScene,worldTransform,validatePlacement,serializeLayout,parseLayout}=S;
  const {groupInfo,transformGroup,captureGroupTemplate,groupTemplateInfo,proposeGroupPlacement,
   regroupLayoutSelection,renameGroup,ungroup,removeGroup}= {...G,...H};
  const {captureLayoutClipboard,encodeLayoutClipboard,decodeLayoutClipboard}=H;
  const {proposePlacement}=P;
  let state=deps.initial,rows=catalog,selected='local-desk',clipboardText=deps.cached;
  let disposed=false,busy=false,roomEditing=false,placement=null,lastPlacementTarget=null;
  let interactionGeneration=0,operation=null,nextId=1,groupLibrary=[],renderURL=null;
  const past=[],future=[],maxFileBytes=2*1024*1024,GROUP_LIBRARY_LIMIT=64;
  const clone=value=>JSON.parse(JSON.stringify(value)),t=k=>k;
  const message=(value,error=false)=>deps.messages.push({value:typeof value==='function'?value():value,error});
  const humanError=error=>error.code||error.errors?.[0]?.code||error.message;
  const store=()=>{},needsEquipmentPreview=()=>false,isLayoutEquipmentPreviewPrepared=()=>true;
  const ensureEquipmentPreview=async()=>true;
  const updatePlacementBar=()=>{},refreshGroupLibrary=()=>{},saveGroupLibrary=()=>{},download=()=>{};
  const view={ghost:null,focusCount:0,canvas:{focus(){view.focusCount++;}},
   setPlacement(value){this.ghost=value?clone(value):null;},
   setState(value){deps.snapshots.push(value);},
   refreshPlacement(){if(lastPlacementTarget)previewPlacement(lastPlacementTarget);return true;},
   view(){},focusSelected(){return true;}};
 `+actualId+'\n'+syncSelect+'\n'+clipboard+'\n'+placement+'\n'+actions+'\n'+shortcuts+'\n'+placementButtons+String.raw`
  return {act,select,copySelection,pasteSelection,pasteEvent,copyEvent,placementKey,
   beginPlacement,previewPlacement,placeProposal,cancelPlacement,view,
   read:()=>({state,placement,lastPlacementTarget,selected,generation:interactionGeneration,past:[...past],future:[...future],buffer:clipboardText}),
   flags:value=>{if('busy'in value)busy=value.busy;if('roomEditing'in value)roomEditing=value.roomEditing;if('disposed'in value)disposed=value.disposed;},
   replaceState:value=>{state=value;},bumpGeneration:()=>{interactionGeneration++;}};
 `);
 const api=setup(deps,navigator,document,clock.setTimeout,clock.clearTimeout);return {...api,node,ui,messages,statuses,reads,writes,clock,clickCancel:()=>cancelButton.click()};
}
const ghostWidth=a=>a.read().placement?.copy?.widthMm;
const noLateMutation=(a,before)=>{assert.equal(encode(a.read().state),before);assert.equal(a.read().placement,null);};
function beginDesk(a){a.beginPlacement({kind:'desk',copy:S.createDesk({id:'placement-template',widthMm:600,depthMm:400})});return a.read().placement.id;}
const target=(xMm=0,zMm=0)=>({xMm,zMm,parentId:null,surfaceId:'floor'});

await test('toolbar prefers current OS payload to cached copy',async()=>{
 const a=app();await a.act({type:'paste'});assert.equal(a.reads.length,1);assert.equal(ghostWidth(a),1200);
 assert.equal(a.read().buffer,systemText);assert.equal(encode(a.read().state),encode(initial));assert.equal(a.read().past.length,0);
 assert.equal(a.clock.created[0].delay,5000);assert.equal(a.clock.pendingCount(),0,'Successful read leaked its timeout');
});
for(const outcome of ['resolve','reject'])await test('5s timeout ends hidden permission wait; late '+outcome+' cannot place',async()=>{
 const d=deferred(),a=app({read:()=>d.promise}),pending=a.act({type:'paste'});
 assert.equal(a.clock.pendingCount(),1);assert.equal(a.clock.created[0].delay,5000);assert.equal(a.messages.length,0,'No stale reading notice');
 a.clock.advance(4999);await Promise.resolve();assert.equal(a.messages.length,0);assert.equal(a.read().placement,null);
 a.clock.advance(1);await pending;noLateMutation(a,encode(initial));assert.equal(a.read().buffer,localText);
 assert.equal(a.messages.at(-1).value,'layout.clipboard.pasteShortcut');assert.equal(a.clock.pendingCount(),0);
 assert(a.clock.cleared.includes(a.clock.created[0].id),'Timeout was not cleared in finally');
 const count=a.messages.length;if(outcome==='resolve')d.resolve(systemText);else d.reject(Error('late permission failure'));
 await new Promise(resolve=>setImmediate(resolve));noLateMutation(a,encode(initial));assert.equal(a.messages.length,count);assert.equal(a.read().past.length,0);
});
await test('native paste supersedes a pending API read; its later timeout cannot erase ghost or show hint',async()=>{
 const d=deferred(),a=app({read:()=>d.promise}),pending=a.act({type:'paste'}),e=event('v',{text:systemText});
 a.pasteEvent(e);await Promise.resolve();assert(e.defaultPrevented);const id=a.read().placement.id;assert.equal(ghostWidth(a),1200);
 const messages=a.messages.length;a.clock.advance(5000);await pending;
 assert.equal(a.read().placement.id,id);assert.equal(a.messages.length,messages);assert.equal(a.clock.pendingCount(),0);
 d.resolve(localText);await Promise.resolve();assert.equal(a.read().placement.id,id);assert.equal(ghostWidth(a),1200);
});
await test('selection supersedes a pending API timeout without a stale shortcut hint',async()=>{
 const d=deferred(),a=app({read:()=>d.promise}),pending=a.act({type:'paste'});await a.act({type:'select',id:'system-desk'});
 const messages=a.messages.length;a.clock.advance(5000);await pending;noLateMutation(a,encode(initial));
 assert.equal(a.messages.length,messages);assert.equal(a.clock.pendingCount(),0);d.resolve(systemText);await Promise.resolve();assert.equal(a.read().placement,null);
});
await test('fresh receiving tab needs no local cached copy',async()=>{
 const a=app({cached:''});await a.act({type:'paste'});assert.equal(ghostWidth(a),1200);assert.equal(a.reads.length,1);
});
for(const missingAPI of [false,true])await test((missingAPI?'absent':'denied')+' read never falls back to stale cache',async()=>{
 const a=app({missingAPI,read:async()=>{throw Object.assign(Error('denied'),{name:'NotAllowedError'});}});
 await a.act({type:'paste'});noLateMutation(a,encode(initial));assert.equal(a.read().buffer,localText);
 assert.equal(a.messages.at(-1).value,'layout.clipboard.pasteShortcut');
});
await test('empty OS clipboard gives empty hint, not cached placement',async()=>{
 const a=app({read:async()=>''});await a.act({type:'paste'});noLateMutation(a,encode(initial));
 assert.equal(a.messages.at(-1).value,'layout.clipboard.empty');assert.equal(a.read().buffer,localText);
});
for(const text of ['not JSON','{"format":"wrong"}'])await test('invalid OS data preserves cache: '+text,async()=>{
 const a=app({read:async()=>text});await a.act({type:'paste'});noLateMutation(a,encode(initial));
 assert.equal(a.read().buffer,localText);assert.equal(a.messages.at(-1).error,true);
});
await test('explicit native payload bypasses readText',async()=>{
 const a=app({read:()=>{throw Error('unexpected API read');}});
 await a.act({type:'paste',text:systemText});assert.equal(a.reads.length,0);assert.equal(ghostWidth(a),1200);
});
await test('empty native event is neither prevented nor replaced by cache',()=>{
 const a=app(),e=event('v');a.pasteEvent(e);assert.equal(e.defaultPrevented,false);
 assert.equal(a.read().placement,null);assert.equal(a.read().buffer,localText);assert.equal(a.reads.length,0);
});
await test('native paste carries current event data without API read',async()=>{
 const a=app(),e=event('v',{text:systemText});a.pasteEvent(e);await Promise.resolve();
 assert(e.defaultPrevented);assert.equal(ghostWidth(a),1200);assert.equal(a.reads.length,0);
});
await test('input native clipboard remains untouched',()=>{
 const a=app();for(const method of ['pasteEvent','copyEvent']){const e=event('v',{text:systemText,editing:true});a[method](e);assert(!e.defaultPrevented);}
 assert.equal(a.read().placement,null);assert.equal(a.reads.length,0);
});
await test('toolbar copy permission failure retains buffer and gives native-copy hint',async()=>{
 const a=app({write:async()=>{throw Error('permission denied');}});
 await a.act({type:'copy',selectionIds:['system-desk']});assert.equal(a.writes.length,1);
 assert.equal(a.read().buffer,systemText);assert.equal(a.messages.at(-1).value,'layout.clipboard.copyShortcut');
});
const mutations={
 selection:a=>a.act({type:'select',id:'system-desk'}),generation:a=>a.bumpGeneration(),
 state:a=>a.replaceState(S.createDefaultLayout({},catalog)),busy:a=>a.flags({busy:true}),
 room:a=>a.flags({roomEditing:true}),dispose:a=>a.flags({disposed:true}),
 import:async a=>{const text=encode(S.createDefaultLayout({},catalog));await a.act({type:'import',file:{size:text.length,text:async()=>text}});}
};
for(const [name,mutate] of Object.entries(mutations))for(const outcome of ['resolve','reject'])
 await test('late '+outcome+' is ignored after '+name,async()=>{
  const d=deferred(),a=app({read:()=>d.promise}),pending=a.act({type:'paste'});assert.equal(a.reads.length,1);
  await mutate(a);const before=encode(a.read().state),messages=a.messages.length,history=a.read().past.length;
  if(outcome==='resolve')d.resolve(systemText);else d.reject(Error('late failure'));
  await pending;noLateMutation(a,before);assert.equal(a.messages.length,messages,'late message after stale read');
  assert.equal(a.read().past.length,history);assert.equal(a.read().buffer,localText);assert.equal(a.clock.pendingCount(),0,'Stale read leaked its timer');
 });
for(const cancellation of ['button','action','Escape'])for(const hasGhost of [false,true])for(const outcome of ['resolve','reject','timeout'])
 await test(cancellation+' invalidates pending '+outcome+' with ghost='+hasGhost,async()=>{
  const d=deferred(),a=app({read:()=>d.promise});if(hasGhost)beginDesk(a);
  const pending=a.act({type:'paste'}),epoch=a.read().generation;assert.equal(a.clock.pendingCount(),1);
  if(cancellation==='button')a.clickCancel();
  else if(cancellation==='action')await a.act({type:'cancel'});
  else {const escape=event('Escape');a.placementKey(escape);assert.equal(escape.defaultPrevented,hasGhost,'Escape default is prevented only for a visible ghost');}
  assert(a.read().generation>epoch,'Explicit cancellation did not invalidate clipboard intent');
  noLateMutation(a,encode(initial));assert.equal(a.read().lastPlacementTarget,null);
  const messages=a.messages.length;
  if(outcome==='resolve')d.resolve(systemText);else if(outcome==='reject')d.reject(Error('cancelled read failure'));else a.clock.advance(5000);
  await pending;noLateMutation(a,encode(initial));assert.equal(a.messages.length,messages,'Cancelled read surfaced a stale hint');
  assert.equal(a.read().buffer,localText);assert.equal(a.read().past.length,0);assert.equal(a.read().future.length,0);assert.equal(a.clock.pendingCount(),0);
  if(outcome==='timeout'){d.resolve(systemText);await new Promise(resolve=>setImmediate(resolve));noLateMutation(a,encode(initial));assert.equal(a.messages.length,messages);}
 });
await test('newer toolbar read wins out-of-order completion',async()=>{
 const first=deferred(),second=deferred();let count=0;const a=app({read:()=>++count===1?first.promise:second.promise});
 const old=a.act({type:'paste'}),newer=a.act({type:'paste'});second.resolve(systemText);await newer;
 const id=a.read().placement.id;first.resolve(localText);await old;
 assert.equal(a.read().placement.id,id);assert.equal(ghostWidth(a),1200);assert.equal(a.read().past.length,0);
});
await test('production startup enables toolbar Paste without cache',()=>{
 const start=source.indexOf('ui=createLayoutUI('),end=source.indexOf('refreshGroupLibrary();',start);assert(start>=0&&end>start);
 const statuses=[],ui={setStatus:v=>statuses.push(v)},document={},window={};let panelCalls=0;
 new Function('deps','const {createLayoutUI,setupLayoutPanel,document,window,$,act,language,rows,view}=deps;let ui,panelLayout;'+source.slice(start,end)+';return ui;')({
  createLayoutUI:()=>ui,setupLayoutPanel:options=>{assert.equal(options.document,document);assert.equal(options.window,window);assert.equal(typeof options.t,'function');panelCalls++;return {dispose(){}};},document,window,$:()=>({}),act(){},language:{t:k=>k},rows:[],view:{canvas:{focus(){}}}});
 assert(statuses.some(s=>s.canPaste===true));
 assert.equal(panelCalls,1);
});
for(const [checkbox,shift] of [[false,false],[true,false],[false,true],[true,true]])
 await test('one valid commit; repeat OR semantics '+checkbox+'/'+shift,()=>{
  const a=app(),first=beginDesk(a);a.node('#layout-repeat').checked=checkbox;
  const p=a.previewPlacement(target());assert(p.valid);a.placeProposal(p,{repeat:shift});
  assert.equal(a.read().state.furniture.length,initial.furniture.length+1);assert.equal(a.read().past.length,1);
  if(checkbox||shift){assert(a.read().placement);assert.notEqual(a.read().placement.id,first);assert.equal(a.node('#layout-repeat').checked,checkbox);}
  else assert.equal(a.read().placement,null);
  a.placeProposal(p,{repeat:shift});assert.equal(a.read().state.furniture.length,initial.furniture.length+1,'double commit from stale event');
 });
await test('invalid current target defeats a queued valid proposal',()=>{
 const a=app(),id=beginDesk(a);a.node('#layout-repeat').checked=true;const good=a.previewPlacement(target());assert(good.valid);
 assert.equal(a.previewPlacement(target(100000,100000)).valid,false);a.placeProposal(good,{repeat:true});
 assert.equal(encode(a.read().state),encode(initial));assert.equal(a.read().past.length,0);assert.equal(a.read().placement.id,id);
});
await test('state changes are revalidated before placement commit',()=>{
 const a=app(),id=beginDesk(a),old=a.previewPlacement(target());assert(old.valid);
 const blocked=S.applyAction(a.read().state,{type:'ADD_FURNITURE',furniture:S.createDesk({id:'new-blocker',widthMm:600,depthMm:400})},catalog);
 a.replaceState(blocked);a.placeProposal(old,{repeat:true});
 assert.equal(encode(a.read().state),encode(blocked));assert.equal(a.read().past.length,0);assert.equal(a.read().placement.id,id);
});
await test('unchecking repeat ends next placement; each commit has one undo/redo step',async()=>{
 const a=app();beginDesk(a);a.node('#layout-repeat').checked=true;a.placeProposal(a.previewPlacement(target()));const once=encode(a.read().state);
 a.node('#layout-repeat').checked=false;a.placeProposal(a.previewPlacement(target(1000,0)));const twice=encode(a.read().state);
 assert.equal(a.read().past.length,2);assert.equal(a.read().placement,null);
 await a.act({type:'undo'});assert.equal(encode(a.read().state),once);await a.act({type:'redo'});assert.equal(encode(a.read().state),twice);
});
await test('repeat printer inherits actual committed support, not stale original support',()=>{
 const a=app();a.node('#layout-repeat').checked=true;a.beginPlacement({kind:'printer',machineId:catalog[0].id,parentId:'local-desk',surfaceId:'top'});
 const first=a.read().placement.id,p=a.previewPlacement({...target(2000,0),parentId:'system-desk',surfaceId:'top'});assert(p.valid);
 a.placeProposal(p);assert.equal(a.read().state.printers.find(p=>p.id===first).attachment.parentId,'system-desk');
 assert.equal(a.read().placement.parentId,'system-desk');assert.equal(a.read().placement.surfaceId,'top');assert.notEqual(a.read().placement.id,first);
});
await test('Escape cancels fresh repeat ghost, preserves placed objects and repeat preference',()=>{
 const a=app();beginDesk(a);a.node('#layout-repeat').checked=true;a.placeProposal(a.previewPlacement(target()));
 const before=encode(a.read().state),e=event('Escape');a.placementKey(e);assert(e.defaultPrevented);
 assert.equal(a.read().placement,null);assert.equal(a.read().lastPlacementTarget,null);assert.equal(encode(a.read().state),before);
 assert.equal(a.read().past.length,1);assert(a.node('#layout-repeat').checked);
});
for(const flag of ['busy','roomEditing'])await test(flag+' blocks repeated commit',()=>{
 const a=app();beginDesk(a);a.node('#layout-repeat').checked=true;const p=a.previewPlacement(target());assert(p.valid);
 a.flags({[flag]:true});a.placeProposal(p,{repeat:true});assert.equal(encode(a.read().state),encode(initial));assert.equal(a.read().past.length,0);
});
assert.equal(fs.readFileSync(appFile,'utf8'),source,'App changed during replay');
assert.equal(fs.readFileSync(indexFile,'utf8'),html,'Checkbox binding changed during replay');
console.log(JSON.stringify({passed:true,cases:results.length,app_sha256:hash(source),index_sha256:hash(html),
 scope:'Current app clipboard/action/placement/history closures with real schema/clipboard/placement and controlled I/O. No browser/GPU/model/native evidence.'}));
