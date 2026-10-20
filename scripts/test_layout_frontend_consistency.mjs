// Actual source-body replay and actual localization module; DOM-interface
// fixtures only. Browser rendering and full model loading are separate gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const site=path.resolve(option('--site')||fileURLToPath(new URL('../site/',import.meta.url)));
const consumed={};
const read=rel=>{const b=fs.readFileSync(path.join(site,rel));consumed[rel]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8')};
const app=read('layout/layout-app.mjs'),renderer=read('layout/layout-renderer.mjs');
read('layout/layout-language.mjs');read('layout/layout-i18n.mjs');
read('layout/layout-state.mjs');read('layout/layout-constraints.mjs');read('layout/layout-geometry.mjs');
const S=await import(pathToFileURL(path.join(site,'layout/layout-state.mjs')));
const {createDefaultLayout,createRoomRect,createDesk,createCatalog,applyAction,serializeLayout,parseLayout}=S;
const {setupLayoutLanguage}=await import(pathToFileURL(path.join(site,'layout/layout-language.mjs')));
const {supportedLanguages,t}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const tests=[];async function test(id,fn){await fn();tests.push({id,status:'PASS'})}
const unique=(s,start,end)=>{assert.equal(s.split(start).length,2,'Source boundary must be unique');const i=s.indexOf(start),j=s.indexOf(end,i);assert.ok(j>i);return s.slice(i,j)};
const camel=k=>k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase());
class E{
 constructor(tag='div'){this.tagName=tag;this.dataset={};this.attrs={};this.children=[];this.listeners=new Map();this.textContent='';}
 setAttribute(k,v){if(k.startsWith('data-'))this.dataset[camel(k)]=String(v);else this.attrs[k]=String(v)}
 getAttribute(k){return k.startsWith('data-')?this.dataset[camel(k)]??null:this.attrs[k]??null}
 get href(){return this.attrs.href||''}
 set href(v){this.attrs.href=String(v)}
 hasAttribute(k){return this.getAttribute(k)!==null}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}
 addEventListener(k,f){const a=this.listeners.get(k)||[];a.push(f);this.listeners.set(k,a)}
 removeEventListener(k,f){this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==f))}
 emit(k){for(const f of this.listeners.get(k)||[])f({target:this})}
 showModal(){this.open=true;this.modalCalls=(this.modalCalls||0)+1}
 close(){this.open=false;this.emit('close')}
 focus(){this.focused=true}
}
function environment(){
 const canvas=new E('canvas'),hint=new E(),theme=new E('button'),workspace=new E(),appRoot=new E(),views=['perspective','top','front','fit'].map(mode=>{const n=new E('button');n.dataset.layoutView=mode;return n});
 hint.dataset.layoutI18n='layout.hint.auto';
 const all=[canvas,hint,theme,workspace,appRoot,...views],byId={'#layout-theme':theme,'#layout-scene-hint':hint,'#layout-app':appRoot,'.layout-workspace':workspace};
 const descendants=n=>[n,...n.children.flatMap(descendants)];
 const doc={documentElement:{dataset:{theme:'light'}},body:new E('body'),title:'',createElement:tag=>{const n=new E(tag);all.push(n);return n},
  querySelector:q=>byId[q]||null,
  querySelectorAll:q=>q==='[data-layout-view]'?views:q==='[data-layout-link]'?all.filter(n=>Object.hasOwn(n.dataset,'layoutLink')):q.startsWith('[data-layout-i18n]')?[...new Set(all.flatMap(descendants))].filter(n=>Object.keys(n.dataset).some(k=>k.startsWith('layoutI18n'))):[]};
 const store=new Map(),win={location:{href:'https://example.invalid/layout/?lang=en',origin:'https://example.invalid'},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},history:{state:null,replaceState(_s,_x,url){win.location.href=url}},
  addEventListener(){},removeEventListener(){},dispatchEvent(){},CustomEvent:class{constructor(type,value){this.type=type;Object.assign(this,value)}},
  matchMedia:q=>({matches:q==='(hover: none) and (pointer: coarse)'})};
 return {doc,win,canvas,hint,theme,workspace,appRoot,views};
}
await test('canvas-aria-label-refreshes-five-languages-through-real-language-module',()=>{
 const e=environment(),source=unique(renderer,'const canvas=renderer.domElement;','container.append(canvas);')+'container.append(canvas);';
 const lang=setupLayoutLanguage({document:e.doc,window:e.win});
 new Function('renderer','container','t',source)({domElement:e.canvas},new E(),key=>lang.t('layout.'+key));
 assert.equal(e.canvas.getAttribute('data-layout-i18n-aria-label'),'layout.sceneLabel');
 for(const code of supportedLanguages){lang.setLanguage(code);assert.equal(e.canvas.getAttribute('aria-label'),t('layout.sceneLabel',{},code));}
 lang.disconnect();
});
await test('automatic-3D-and-flat-plan-hints-follow-current-view-in-all-five-languages',()=>{
 const e=environment();let lang;
 const source=unique(app,'function updateViewPresentation(','\nfunction updateLanguage(){');
 const factory=new Function('document','$','ui','t',`${source}\nreturn updateViewPresentation;`);
 const calls=[],update=factory(e.doc,q=>e.doc.querySelector(q),{setProjection:v=>calls.push(v)},(k,p)=>lang.t(k,p));
 lang=setupLayoutLanguage({document:e.doc,window:e.win});
 for(const value of [{mode:'perspective',projection:'perspective-3d'},{mode:'top',projection:'orthographic-floorplan'},{mode:'front',projection:'perspective-3d'}]){
  update(value);const key=value.mode==='top'?'layout.hint.plan':'layout.hint.auto';assert.equal(e.hint.dataset.layoutI18n,key);
  for(const code of supportedLanguages){lang.setLanguage(code);assert.equal(e.hint.textContent,t(key,{},code));for(const button of e.views)if(button.dataset.layoutView!=='fit')assert.equal(button.getAttribute('aria-pressed'),String(button.dataset.layoutView===value.mode));}
 }
 assert.deepEqual(calls,['perspective-3d','orthographic-floorplan','perspective-3d']);assert.ok(!/data-layout-tool=/.test(read('layout/index.html')));lang.disconnect();
});
await test('coarse-only-notice-theme-header-live-with-no-renderer-catalog-or-model',async()=>{
 const e=environment();let dark=false,fetches=0,rendererCalls=0,saves=0;
 const start=unique(app,'async function start(){','  const response=await fetch(');
 assert.ok(app.indexOf('view=createLayoutRenderer(')>app.indexOf("document.body.dataset.layoutReady='desktop-only';return;"));
 assert.ok(app.indexOf("await import('./layout-renderer.mjs")>app.indexOf("document.body.dataset.layoutReady='desktop-only';return;"));
 const factory=new Function('deps',`
  let language,view,busy=false;const document=deps.doc,window=deps.win,$=s=>document.querySelector(s),updateLanguage=()=>language?.refresh();
  const setupLayoutLanguage=deps.setupLayoutLanguage,readDisplay=deps.readDisplay,saveDisplay=deps.saveDisplay,applyDisplay=deps.applyDisplay;
  const fetch=()=>{deps.onFetch();throw Error('Desktop notice must not request catalog/model')},createLayoutRenderer=()=>deps.onRenderer();
  ${start}\nthrow Error('Fixture expected coarse-only branch');}\nreturn {start,language:()=>language,busy:v=>busy=v};`);
 const replay=factory({doc:e.doc,win:e.win,setupLayoutLanguage,readDisplay:()=>({dark}),saveDisplay:value=>{dark=value.dark;saves++},applyDisplay:value=>{if(typeof value==='boolean')dark=value;e.doc.documentElement.dataset.theme=dark?'dark':'light'},onFetch:()=>fetches++,onRenderer:()=>rendererCalls++});
 await replay.start();assert.equal(e.doc.body.dataset.layoutReady,'desktop-only');assert.equal(e.workspace.hidden,true);assert.equal(e.appRoot.children.length,1);
 const popup=e.doc.body.children.find(n=>n.tagName==='dialog');assert.ok(popup);assert.equal(popup.open,true);assert.equal(popup.modalCalls,1);
 assert.equal(popup.getAttribute('aria-labelledby'),popup.children[0].id);assert.equal(popup.getAttribute('aria-describedby'),popup.children[1].id);
 for(const code of supportedLanguages){replay.language().setLanguage(code);e.theme.emit('click');assert.equal(e.doc.documentElement.dataset.theme,dark?'dark':'light');assert.equal(e.appRoot.children[0].children[0].textContent,t('layout.desktopOnlyTitle',{},code));assert.equal(popup.children[0].textContent,t('layout.desktopOnlyTitle',{},code));assert.equal(popup.children[1].textContent,t('layout.desktopOnlyText',{},code));assert.equal(popup.children[3].textContent,t('common.close',{},code));assert.equal(new URL(popup.children[2].href).searchParams.get('lang'),code);}
 popup.children[3].emit('click');assert.equal(popup.open,false);assert.equal(e.appRoot.children[0].children[2].focused,true);assert.equal(e.workspace.hidden,true);assert.equal(popup.modalCalls,1);
 assert.equal(saves,5);assert.equal(dark,true);replay.busy(true);e.theme.emit('click');assert.equal(saves,5);replay.busy(false);e.theme.emit('click');assert.equal(dark,false);assert.equal(saves,6);
 assert.equal(fetches,0);assert.equal(rendererCalls,0);replay.language().disconnect();
 for(const scenario of [{coarse:false,fine:true,mobile:false,shown:false},{coarse:true,fine:true,mobile:false,shown:false},{coarse:false,fine:true,mobile:true,shown:true}]){
  const c=environment();c.win.navigator={userAgentData:{mobile:scenario.mobile}};c.win.matchMedia=q=>({matches:q==='(any-pointer: fine)'?scenario.fine:scenario.coarse});
  const attempt=factory({doc:c.doc,win:c.win,setupLayoutLanguage,readDisplay:()=>({dark:false}),saveDisplay(){},applyDisplay(){},onFetch(){throw Error('Unexpected request')},onRenderer(){throw Error('Unexpected renderer')}});
  if(scenario.shown){await attempt.start();assert.equal(c.doc.body.dataset.layoutReady,'desktop-only');attempt.language().disconnect();}
  else{await assert.rejects(attempt.start(),/Fixture expected coarse-only branch/);assert.equal(c.appRoot.children.length,0);assert.equal(c.doc.body.children.length,0);assert.equal(c.workspace.hidden,undefined);attempt.language().disconnect();}
 }
});
await test('deferred-layout-import-never-overwrites-newer-commands-or-disposed-page',async()=>{
 const messageSource=unique(app,'function message(','\nfunction humanError(');
 const commitSource=unique(app,'function commit(next','\nfunction select(');
 const selectSource=unique(app,'function select(value)','\nfunction download(');
 const actSource=unique(app,'async function act(action){','\nfunction updateViewPresentation(');
 const factory=new Function('deps',`
  const {createDefaultLayout,applyAction,serializeLayout,parseLayout}=deps,catalog=[];
  let state=deps.initial,selected=null,busy=false,roomEditing=false,disposed=false,interactionGeneration=0;
  const past=[],future=[],maxFileBytes=2097152,messages=[],views=[];
  const sync=()=>{},store=()=>{},humanError=()=> 'error',t=k=>k;
  const view={view:v=>views.push(v)};
  const uiStatuses=[],statusNode={hidden:false,textContent:''},$=()=>statusNode,ui={setStatus(value){uiStatuses.push(value);if(statusNode._layoutMessage)messages.push([value.message,...(value.error?[true]:[])])}};
  ${messageSource}\n${commitSource}\n${selectSource}\n${actSource}
  return {act,select,get:()=>state,dispose:()=>disposed=true,messages,views,statusNode,uiStatuses};`);
 const room=width=>applyAction(createDefaultLayout(),{type:'SET_ROOM',room:createRoomRect({widthMm:width,depthMm:4000})},[]);
 const make=(initial=room(6000))=>factory({initial,createDefaultLayout,applyAction,serializeLayout,parseLayout});
 const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b});return {file:{size:100,text:()=>promise},resolve,reject}};
 const text=serializeLayout(room(8000),[]),latestText=serializeLayout(room(9000),[]);
 assert.notEqual(text,latestText,'Newer import fixture must contain a different room');
 const encoded=r=>serializeLayout(r.get(),[]);
 for(const initial of [room(6000),createDefaultLayout()]){
  const r=make(initial),d=deferred(),pending=r.act({type:'import',file:d.file});
  await r.act({type:'reset'});const after=encoded(r);d.resolve(text);await pending;
  assert.equal(encoded(r),after);assert.equal(r.messages.length,0,'Reset must cancel even a no-op load');
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file}),before=encoded(r);
  await r.act({type:'SET_ROOM',room:createRoomRect({widthMm:7000,depthMm:4000})});const after=encoded(r);assert.notEqual(after,before);d.resolve(text);await pending;assert.equal(encoded(r),after);
 }
 {
  const r=make(),a=deferred(),b=deferred(),first=r.act({type:'import',file:a.file}),last=r.act({type:'import',file:b.file});
  b.resolve(latestText);await last;const after=encoded(r);a.resolve(text);await first;
  assert.equal(encoded(r),after);assert.equal(after,latestText);assert.deepEqual(r.messages,[['layout.loaded']]);
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file}),before=encoded(r);r.dispose();d.resolve(text);await pending;
  assert.equal(encoded(r),before);assert.equal(r.messages.length,0);assert.equal(r.views.length,0);
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file});await r.act({type:'reset'});d.reject(Error('stale read'));await pending;assert.equal(r.messages.length,0);
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file}),before=encoded(r);
  await r.act({type:'SET_ROOM',room:createRoomRect({widthMm:7000,depthMm:4000})});assert.notEqual(encoded(r),before);await r.act({type:'undo'});assert.equal(encoded(r),before);
  d.resolve(text);await pending;assert.equal(encoded(r),before,'A-to-B-to-A must invalidate an older load');
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file}),before=encoded(r);r.select(null);d.resolve(text);await pending;assert.equal(encoded(r),before);
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file});d.resolve(text);await pending;
  assert.equal(encoded(r),text);assert.deepEqual(r.messages,[['layout.loaded']]);assert.deepEqual(r.views,['perspective']);
  assert.equal(typeof r.statusNode._layoutMessage.format,'function');assert.equal(r.statusNode._layoutMessage.format(),'layout.loaded');assert.equal(r.statusNode.textContent,'layout.loaded');assert.equal(r.statusNode.hidden,false);assert.equal(r.uiStatuses.at(-1).message,'layout.loaded');assert.equal(r.uiStatuses.at(-1).error,false);
 }
 {
  const r=make(),d=deferred(),pending=r.act({type:'import',file:d.file});d.reject(Error('current read'));await pending;assert.deepEqual(r.messages,[['error',true]]);
 }
});
await test('desktop-bootstrap-reaches-ready-with-automatic-renderer-and-no-removed-tool-binding',async()=>{
 const bootstrap=unique(app,'  const response=await fetch(','\n}\nwindow.addEventListener(');
 const importPattern=/await import\('\.\/layout-renderer\.mjs\?v=[a-f0-9]+'\)/g;
 assert.equal([...bootstrap.matchAll(importPattern)].length,1);
 const source=bootstrap.replace(importPattern,'deps.rendererModule').replaceAll('import.meta.url',"'https://example.invalid/layout/layout-app.mjs'");
 const defaultSource=unique(app,'function makeDefault(){','\nlet pendingMove=');
 const e=environment(),catalogData=JSON.parse(read('layout/layout-catalog.json'));
 const AsyncFunction=Object.getPrototypeOf(async function(){}).constructor;
 const run=new AsyncFunction('deps',`
  const {createDefaultLayout,createDesk,createCatalog,applyAction,parseLayout}=deps;
  const document=deps.doc,$=q=>document.querySelector(q),navigator={deviceMemory:8},localStorage={getItem:()=>null};
  const storageKey='test',maxFileBytes=2097152,fetch=async()=>({ok:true,json:async()=>deps.catalogData});
  let state,catalog,rows,ui,view,selected=null,busy=false,roomEditing=false;
  const language={t:key=>key},t=key=>key,act=()=>{},select=()=>{},worldMove=()=>{},constrainMove=()=>{},worldRotate=deps.rotationPorts.onRotate,constrainRotate=deps.rotationPorts.constrainRotate,message=()=>{},humanError=()=> 'error';
  const calls={sync:0,language:0,views:[],presentations:[],options:[]};
  const sync=()=>calls.sync++,updateLanguage=()=>calls.language++,dark=()=>false;
  const updateViewPresentation=value=>calls.presentations.push(value);
  const createLayoutUI=()=>({fixture:true});
  ${defaultSource}
  ${source}
  return {ready:document.body.dataset.layoutReady,state,calls,view};`);
 const rotationPorts={onRotate:()=>{},constrainRotate:()=>false};
 const rendererModule={createLayoutRenderer:options=>{
  assert.equal(options.onRotate,rotationPorts.onRotate);assert.equal(options.constrainRotate,rotationPorts.constrainRotate);
  assert.equal(typeof options.onMove,'function');assert.equal(typeof options.constrainMove,'function');assert.equal(typeof options.onViewChange,'function');
  return {canvas:new E('canvas'),view:()=>{},getView:()=>({mode:'perspective',projection:'perspective-3d'}),setOptions:()=>{}};
 }};
 const result=await run({doc:e.doc,catalogData,createDefaultLayout,createDesk,createCatalog,applyAction,parseLayout,rendererModule,rotationPorts});
 assert.equal(result.ready,'true');assert.equal(result.state.furniture.length,1);assert.equal(result.state.printers.length,1);assert.equal(result.calls.sync,1);assert.equal(result.calls.language,1);
 assert.deepEqual(result.calls.presentations,[{mode:'perspective',projection:'perspective-3d'}]);
});

await test('actual-app-failed-noop-and-successful-commit-status-lifecycle',async()=>{
 const lifecycle=unique(app,'function message(','\nfunction select(');
 const selectSource=unique(app,'function select(value)','\nfunction download(');
 const moves=unique(app,'let pendingMove=','\nasync function render(');
 const actions=unique(app,'async function act(action){','\nfunction updateViewPresentation(');
 const factory=new Function('deps',`
  const {applyAction,applyWorldMove,resolveWorldMove,resolveWorldRotation,serializeLayout,parseLayout,createDefaultLayout,validatePlacement}=deps.S;
  const catalog=[],past=[],future=[],writes=[],updates=[],maxFileBytes=2097152,document={body:{dataset:{}}};
  let state=deps.initial,selected='status-desk',busy=false,roomEditing=false,disposed=false,interactionGeneration=0,operation=null;
  const status={hidden:true,textContent:''},uiState={message:'',error:false},$=selector=>{if(selector!=='#layout-status')throw Error('Unexpected status selector');return status};
  const ui={setStatus(value){Object.assign(uiState,value)},update(){updates.push({dom:{...status},ui:{...uiState}})}};
  const view={setState(){},view(){}},t=(key,params)=>deps.translate(key,params);
  const store=()=>writes.push({state:serializeLayout(state,catalog),dom:{...status},ui:{...uiState}});
  ${lifecycle}
  ${selectSource}
  ${moves}
  ${actions}
  return {worldMove,worldRotate,act,commit,message,read:()=>({state,status:{...status},ui:{...uiState},writes:[...writes],updates:[...updates]})};`);
 for(const language of supportedLanguages){
  const translate=(key,params)=>t(key,params,language);
  const initial=createDefaultLayout({room:createRoomRect({widthMm:4000,depthMm:4000}),furniture:[createDesk({id:'status-desk',widthMm:1000,depthMm:1600,heightMm:750,pose:{xMm:1500,zMm:0,yawDeg:0}})]},[]);
  const r=factory({S,initial,translate}),encoded=()=>serializeLayout(r.read().state,[]);
  const before=encoded();assert.equal(r.worldRotate({id:'status-desk',yawDeg:90,deltaDeg:90}),false);
  assert.equal(encoded(),before);assert.equal(r.read().status.hidden,false);
  assert.equal(r.read().status.textContent,translate('layout.error.ROOM_OUT_OF_BOUNDS'));assert.equal(r.read().ui.error,true);
  assert.equal(r.worldMove({id:'status-desk',x:0,z:0}),true);
  assert.equal(r.read().state.furniture[0].pose.xMm,0);assert.equal(r.read().status.hidden,true);
  assert.equal(r.read().status.textContent,'');assert.equal(r.read().ui.message,'');assert.equal(r.read().ui.error,false);
  r.message('preserve-current-error',true);let saved=r.read();
  r.commit(saved.state);r.commit(parseLayout(serializeLayout(saved.state,[]),[]));
  assert.deepEqual(r.read().status,saved.status);assert.deepEqual(r.read().ui,saved.ui);assert.equal(r.read().writes.length,saved.writes.length);
  assert.equal(r.worldMove({id:'status-desk',x:0,z:0}),true);assert.deepEqual(r.read().status,saved.status);
  const count=r.read().writes.length;
  await r.act({type:'UPDATE_FURNITURE',id:'status-desk',patch:{pose:{xMm:5000}}});
  assert.equal(r.read().writes.length,count);assert.equal(r.read().status.hidden,false);assert.equal(r.read().ui.error,true);
  assert.equal(r.worldRotate({id:'status-desk',yawDeg:90,deltaDeg:90}),true);
  assert.equal(r.read().state.furniture[0].pose.yawDeg,90);assert.deepEqual(r.read().status,{hidden:true,textContent:''});assert.equal(r.read().ui.error,false);
  assert.ok(r.read().writes.every(w=>w.dom.hidden&&w.dom.textContent===''&&w.ui.message===''&&w.ui.error===false),'Clear status before sync/store');
  const next=applyAction(r.read().state,{type:'SET_ROOM',room:createRoomRect({widthMm:6000,depthMm:4000})},[]);
  const text=serializeLayout(next,[]);await r.act({type:'import',file:{size:text.length,text:async()=>text}});
  assert.equal(encoded(),text);assert.equal(r.read().status.hidden,false);
  assert.equal(r.read().status.textContent,translate('layout.loaded'));assert.equal(r.read().ui.message,translate('layout.loaded'));assert.equal(r.read().ui.error,false);
 }
});

for(const [rel,h]of Object.entries(consumed))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,rel))).digest('hex'),h,'Source changed: '+rel);
const report={schema:'layout-frontend-consistency-source-v1',passed:true,tests,sourceInputs:consumed,languages:supportedLanguages,actualSourceBodies:true,actualLanguageModule:true,DOMInterfaceFixture:true,WebGL:false,modelsLoaded:0,native:false};
if(option('--report'))fs.writeFileSync(option('--report'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,tests:tests.length,languages:supportedLanguages.length,modelsLoaded:0,scope:'Actual source replay with DOM-interface fixtures; no browser/full-model claim'}));

