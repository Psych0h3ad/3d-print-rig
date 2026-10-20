import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {WorkspaceScope,activateScope,workspaceTask,workspaceFrame,workspaceListen,WorkspaceMutationObserver} from '../site/viewer/workspace-lifecycle.mjs';
import {workspacePages,workspaceTarget,bindWorkspaceNavigation,navigateWorkspace,setWorkspaceLeaving,replaceWorkspaceURL} from '../site/viewer/workspace-navigation.mjs';
import {displayKey,readDisplay,saveDisplay} from '../site/viewer/display-preferences.mjs';
import {ensureWorkspaceEntry} from '../site/viewer/workspace-entry.mjs';

// A cached pre-router HTML page must recover instead of displaying unmounted
// controls. Updated HTML and indirect imports must never reload the document.
function entryFixture({routed=false,scripts=['./bootstrap.js?v=old']}={}) {
 const replacements=[];
 const document={documentElement:{dataset:{}},querySelector:()=>routed?{}:null,querySelectorAll:()=>scripts.map(src=>({src}))};
 const location={href:'https://example.test/3d-print-rig/viewer/?machine=siboor_trident_350&configuration=r2&lang=en#stage',replace:url=>replacements.push(url)};
 return {document,location,replacements};
}
const entryModule='https://example.test/3d-print-rig/viewer/bootstrap.js?v=current';
const legacy=entryFixture();assert(ensureWorkspaceEntry(entryModule,legacy));
const recovered=new URL(legacy.replacements[0]);
assert.equal(recovered.searchParams.get('_viewer'),'20261004');
assert.equal(recovered.searchParams.get('configuration'),'r2');assert.equal(recovered.searchParams.get('lang'),'en');assert.equal(recovered.hash,'#stage');
assert.equal(ensureWorkspaceEntry(entryModule,legacy),false);assert.equal(legacy.replacements.length,1);
for(const fixture of [entryFixture({routed:true}),entryFixture({scripts:['./app.js?v=old']}),entryFixture({scripts:['https://other.test/3d-print-rig/viewer/bootstrap.js']})]) {
 assert.equal(ensureWorkspaceEntry(entryModule,fixture),false);assert.equal(fixture.replacements.length,0);
}
const retry=entryFixture();retry.location.href=recovered.href;assert.equal(ensureWorkspaceEntry(entryModule,retry),false,'A stale intermediary cannot create a reload loop');

const base='https://example.test/3d-print-rig/viewer/trident.html?machine=voron_trident_300&lang=en';
for(const page of workspacePages) assert(workspaceTarget('./'+page,base),page);
for(const target of ['https://other.test/3d-print-rig/viewer/v0.html','../v0.html','./art/credits.html','./model.glb','javascript:alert(1)','https://name@example.test/3d-print-rig/viewer/v0.html']) assert.equal(workspaceTarget(target,base),null,target);
assert.equal(workspaceTarget('./v0.html?machine=voron_v02_120&lang=en',base).searchParams.get('machine'),'voron_v02_120');
const visits=[];bindWorkspaceNavigation(url=>visits.push(String(url)));navigateWorkspace(base);assert.deepEqual(visits,[base]);
const history={replaceState:(...args)=>visits.push(args[2])};
setWorkspaceLeaving(true);replaceWorkspaceURL(null,'','stale',history);assert.equal(visits.length,1,'An old controller cannot replace the next destination');
setWorkspaceLeaving(false);replaceWorkspaceURL(null,'',base,history);assert.equal(visits.length,2);

const frames=new Map();let id=0;
globalThis.requestAnimationFrame=fn=>{frames.set(++id,fn);return id};
globalThis.cancelAnimationFrame=n=>frames.delete(n);
const scope=new WorkspaceScope();activateScope(scope);
let release,finished=false;
workspaceTask(async()=>{await new Promise(resolve=>{release=resolve});await workspaceTask(async()=>{await Promise.resolve();finished=true})});
let settled=false;const wait=scope.settle().then(()=>{settled=true});
await Promise.resolve();assert.equal(settled,false);release();await wait;assert(finished&&settled,'Wait for all old async CAD work before mounting another controller');
await assert.rejects(workspaceTask(async()=>{throw Error('network')}));await scope.settle();assert.equal(scope.tasks.size,0,'A failed load does not block navigation');
const target=new EventTarget();let changes=0,hidden=0,draws=0,disconnected=0,observed;
workspaceListen(target,'change',()=>changes++);workspaceListen(target,'pagehide',()=>hidden++);
target.dispatchEvent(new Event('change'));workspaceFrame(()=>draws++);
class Observer {constructor(fn){observed=fn}disconnect(){disconnected++}}
new WorkspaceMutationObserver(()=>changes++,Observer);
let stopped=0,disposed=0,lost=0,geometry=0,material=0,texture=0;
scope.renderer({setAnimationLoop:value=>{assert.equal(value,null);stopped++},dispose:()=>disposed++,forceContextLoss:()=>lost++});
const tex={isTexture:true,dispose:()=>texture++};
scope.scene({environment:tex,traverse:fn=>fn({geometry:{dispose:()=>geometry++},material:{map:tex,dispose:()=>material++}})});
scope.dispose();scope.dispose();observed();target.dispatchEvent(new Event('change'));
assert.deepEqual({changes,hidden,draws,disconnected,stopped,disposed,lost,geometry,material,texture},{changes:1,hidden:1,draws:0,disconnected:1,stopped:1,disposed:1,lost:1,geometry:1,material:1,texture:1});
assert.equal(frames.size,0);activateScope(undefined);

const values=new Map(),storage={getItem:k=>values.get(k)||null,setItem:(k,v)=>values.set(k,v)};
assert.equal(readDisplay(storage).dark,false);saveDisplay({dark:true},storage);assert.equal(readDisplay(storage).dark,true);
saveDisplay({dark:false},storage);assert.equal(readDisplay(storage).dark,false);
const blocked={getItem(){throw Error('blocked')},setItem(){throw Error('blocked')}};
saveDisplay({dark:true},blocked);assert.equal(readDisplay(blocked).dark,true,'Preferences survive in memory when storage is blocked');
const early=await readFile(new URL('../site/viewer/display-start.js',import.meta.url),'utf8');
function earlyTheme(entries){const store=new Map(entries),doc={documentElement:{dataset:{}}};vm.runInNewContext(early,{URL,location:{href:base,pathname:new URL(base).pathname},localStorage:{getItem:k=>store.get(k)||null,setItem:(k,v)=>store.set(k,v)},document:doc});return {store,theme:doc.documentElement.dataset.theme}}
let result=earlyTheme([['3d-print-rig-lighting-voron_trident_300','{"night":true}']]);assert.equal(result.theme,'dark');assert.equal(JSON.parse(result.store.get(displayKey)).dark,true);
result=earlyTheme([[displayKey,'{"dark":false}'],['3d-print-rig-lighting-voron_trident_300','{"night":true}']]);assert.equal(result.theme,'light','Shared setting wins over old per-machine preference');
console.log('Workspace runtime: routes, stale URL protection, pending/failed loads, listener/observer/frame/GPU cleanup, dark preference and legacy migration passed.');

// Status lifecycle regression. Execute actual controller/app bodies with actual
// locale engines and model-progress DOM. Scene/transport are controlled source
// fixtures; no printer assets, WebGL, browser pixels or native fit are tested.
const uiFlag=name=>{const i=process.argv.indexOf(name);return i<0?null:process.argv[i+1]};
const uiSite=path.resolve(uiFlag('--site')||fileURLToPath(new URL('../site/',import.meta.url)));
const uiResources=path.resolve(uiFlag('--resource-site')||uiSite),uiInputs=new Map(),uiCases=[];
const uiRead=relative=>{const p=path.join(uiSite,relative),bytes=fs.readFileSync(p);uiInputs.set(p,{bytes:bytes.length,sha256:createHash('sha256').update(bytes).digest('hex')});return bytes.toString('utf8')};
const uiModule=relative=>import(pathToFileURL(path.join(uiResources,relative)));
const uiI18n=await uiModule('viewer/i18n.mjs'),uiThree=await uiModule('viewer/vendor-r180/three.module.js');
const uiGcode=await uiModule('viewer/gcode-machine-bindings.mjs');
const uiProgress=await uiModule('viewer/model-progress.mjs'),uiCommunity=await uiModule('viewer/community-state.mjs');
const uiRegistry=await uiModule('viewer/source-assembly-registry.mjs'),uiSourceText=await uiModule('viewer/source-assembly-ui-text.mjs');
const uiSourceCopy=await uiModule('viewer/source-assembly-messages.mjs'),uiLayoutText=await uiModule('layout/layout-i18n.mjs');
const uiLayoutState=await uiModule('layout/layout-state.mjs'),uiLayout=await uiModule('layout/layout-ui.mjs');
for(const lang of ['en','ja','es','ko','ru'])await uiI18n.loadLanguage(lang);
const uiHTML=uiRead('viewer/community.html'),uiController=uiRead('viewer/community.js'),uiApp=uiRead('layout/layout-app.mjs');
function statusDocument(){
 const doc=new TestDocument(),create=doc.createElement.bind(doc),decorate=n=>{
  n.nodeType=1;n.checked=false;const oldSet=n.setAttribute.bind(n),oldRemove=n.removeAttribute.bind(n),oldGet=n.getAttribute.bind(n),oldMatches=n.matches.bind(n);
  const dataKey=k=>k.slice(5).replace(/-([a-z])/g,(_,c)=>c.toUpperCase());
  n.getAttribute=k=>k.startsWith('data-')?n.dataset[dataKey(k)]??null:k==='id'?n.id||null:k==='class'?n.className||null:oldGet(k);
  n.setAttribute=(k,v)=>{oldSet(k,v);if(k==='class')n.className=String(v)};n.removeAttribute=k=>{oldRemove(k);if(k.startsWith('data-'))delete n.dataset[dataKey(k)]};n.hasAttribute=k=>n.getAttribute(k)!==null;
  n.matches=s=>{if(s.startsWith('.'))return n.className.split(/\s+/).includes(s.slice(1));const m=s.match(/^([\w-]+)(\[.+\])$/);return m?n.tagName===m[1].toUpperCase()&&oldMatches(m[2]):oldMatches(s)};
  n.closest=s=>{for(let p=n;p;p=p.parentNode)if(s.split(',').some(v=>p.matches(v.trim())))return p;return null};
  n.prepend=item=>{item.remove();item.parentNode=n;n.children.unshift(item)};n.showModal=()=>{n.open=true};n.close=()=>{n.open=false};
  const text={nodeType:3,get nodeValue(){return n._text},set nodeValue(v){n._text=String(v)},parentElement:n};
  Object.defineProperties(n,{childNodes:{get:()=>[...(n._text?[text]:[]),...n.children]},parentElement:{get:()=>n.parentNode},isConnected:{get:()=>n===doc.body||!!n.parentNode?.isConnected}});return n;
 };
 doc.createElement=tag=>decorate(create(tag));doc.createElementNS=(ns,tag)=>doc.createElement(tag);decorate(doc.body);doc.documentElement=doc.createElement('html');doc.documentElement.lang='en';
 doc.querySelectorAll=s=>doc.body.querySelectorAll(s);doc.querySelector=s=>doc.querySelectorAll(s)[0]||null;doc.getElementById=id=>doc.querySelector('#'+id);
 const eventTarget=new EventTarget();for(const method of ['addEventListener','removeEventListener','dispatchEvent'])doc[method]=eventTarget[method].bind(eventTarget);const title=doc.createElement('title');doc.body.append(title);return doc;
}
const statusTick=async predicate=>{for(let i=0;i<80;i++){if(predicate())return;await new Promise(r=>setTimeout(r,0))}assert.fail('Controlled lifecycle did not reach expected phase')};
async function communityStatusFixture({lang='en',machine='voron_switchwire_250',failure=null,eva=false,legitimateNotice=false}={}){
 const doc=statusDocument(),events=new Map(),pendingEvents=[],jobs=[],scopes=[],stats={loads:0,publicInfo:0,renders:0,exports:0};
 for(const m of uiHTML.matchAll(/<([\w-]+)\b([^>]*\bid="[^"]+"[^>]*)>/g)){
  const n=doc.createElement(m[1]);for(const a of m[2].matchAll(/([\w-]+)(?:="([^"]*)")?/g))n.setAttribute(a[1],a[2]??'');n.hidden=/\bhidden(?:\s|$)/.test(m[2]);n.disabled=/\bdisabled(?:\s|$)/.test(m[2]);doc.body.append(n);
 }
 const node=id=>doc.getElementById(id);node('sourceModelNotice').textContent='Loading assembly';node('status').textContent='Loading CAD…';node('stage').getBoundingClientRect=()=>({width:640,height:480});
 for(const tag of ['aside','label']){const n=doc.createElement(tag);if(tag==='label')n.setAttribute('for','headInstallation');doc.body.append(n)}
 const header=doc.createElement('div');header.className='header-actions';doc.body.append(header);
 const loc={href:'https://example.test/viewer/community.html?machine='+machine+'&lang='+lang,get search(){return new URL(this.href).search},get origin(){return new URL(this.href).origin}};
 const win={location:loc,navigator:{languages:['en'],deviceMemory:16},localStorage:{getItem:()=>null,setItem(){}},history:{replaceState(s,t,url){if(url)loc.href=new URL(url,loc.href).href}},MutationObserver:class{observe(){}disconnect(){}takeRecords(){return []}},CustomEvent:class{constructor(type,value){this.type=type;Object.assign(this,value)}},
  addEventListener(type,fn){if(!events.has(type))events.set(type,new Set());events.get(type).add(fn)},removeEventListener(type,fn){events.get(type)?.delete(fn)},dispatchEvent(event){for(const fn of events.get(event.type)||[]){const p=fn(event);if(p?.then){pendingEvents.push(p);p.catch(()=>{})}}}};
 const language=uiI18n.setupLanguage({document:doc,window:win});await language.ready;
 if(legitimateNotice){node('sourceModelNotice').setAttribute('data-i18n-id','machine.switchwire.chain_notice');node('sourceModelNotice').textContent=uiI18n.formatMessage('machine.switchwire.chain_notice',{},lang)}
 let currentScope,infoResolve,evaResolve;const infoGate=()=>new Promise(r=>{infoResolve=r}),evaGate=()=>new Promise(r=>{evaResolve=r});let evaWait;
 const makeScope=()=>{const clean=[],resources=[],renderers=[],scenes=[];const s={disposed:false,cleanup:f=>clean.push(f),resource:o=>(resources.push(o),o),renderer:o=>(renderers.push(o),o),scene:o=>(scenes.push(o),o),
  dispose(){this.disposed=true;for(const f of clean)f();for(const o of resources)o.dispose?.();for(const o of renderers)o.domElement.remove();for(const s of scenes)s.traverse(n=>{n.geometry?.dispose();n.material?.dispose()})}};scopes.push(s);currentScope=s;return s};
 class StatusRenderer{constructor(){this.domElement=doc.createElement('canvas')}setPixelRatio(){}setSize(){}render(){stats.renders++}dispose(){}}
 class StatusPMREM{fromScene(){return {texture:new uiThree.Texture(),dispose(){this.texture.dispose()}}}dispose(){}}
 class StatusControls{constructor(camera){this.target=new uiThree.Vector3()}addEventListener(){}update(){}dispose(){}}
 function specimen(id){
  const root=new uiThree.Group(),mesh=new uiThree.Mesh(new uiThree.BoxGeometry(.1,.1,.1),new uiThree.MeshStandardMaterial());root.add(mesh);let axes={x:0,y:0,z:0};
  const profile={machine_id:id,title:'Controlled community scene',axes:{x:[-10,10],y:[-10,10],z:[-10,10]},palette_defaults:{base:'#333333',accent:'#cc3300',frame:'#888888'},configurations:{stock:{label:'Original',source_license_notices:['GPL-3.0']}},source:{author:'VORON Design',repository:'https://github.com/VoronDesign/Voron-Switchwire',version:'Switchwire Assembly v1',license:'GPL-3.0'},motion_registration:{notices:[]}};
  if(eva){profile.eva_installation={configuration:'eva-source'};profile.configurations['eva-source']={label:'EVA',source_license_notices:['GPL-3.0']}}
  return {root,profile,manifest:{native_leaf_count:1,reference_leaves:[]},adapter:{nodes:new Map([['fixture',mesh]]),records:new Map([['fixture',{group:'head'}]]),setPalette(){},setReferences(){},setConfiguration:id=>id,getAxes:()=>({...axes}),setAxes:next=>(axes={...next})}};
 }
 const dependencies={displacementGcodeSettings:uiGcode.displacementGcodeSettings,displacementCoordinateNote:uiGcode.displacementCoordinateNote,unavailableCoordinateNote:uiGcode.unavailableCoordinateNote,THREE:{...uiThree,WebGLRenderer:StatusRenderer,PMREMGenerator:StatusPMREM},OrbitControls:StatusControls,RoomEnvironment:class extends uiThree.Scene{},document:doc,window:win,location:loc,history:win.history,devicePixelRatio:1,
  translate:uiI18n.translate,loadLanguage:uiI18n.loadLanguage,messageIdFor:uiI18n.messageIdFor,isSourceAssemblyMachine:uiRegistry.isSourceAssemblyMachine,communitySchema:uiCommunity.communitySchema,communityConfiguration:uiCommunity.communityConfiguration,communityMotionEnabled:uiCommunity.communityMotionEnabled,
  sceneLightingState:()=>({background:'#eeeeee',environmentIntensity:1,exposure:1,ambientIntensity:.3}),setResponsiveAspect(){},frameResponsiveView(){},setupMachineNavigation(){},setupGcodePanel(){},setupRenderExport(){stats.exports++},
  workspaceFrame:fn=>{const owner=currentScope;queueMicrotask(()=>{if(!owner.disposed)fn(performance.now())});return 1},WorkspaceResizeObserver:class{observe(){}},workspaceTask:fn=>fn(),workspaceListen:(target,type,fn)=>{target.addEventListener(type,fn);currentScope.cleanup(()=>target.removeEventListener(type,fn))},
  evaCommunityIndex:index=>index,applyEvaOptionsProfile(){},withHeadAdditions:x=>x,GLTFLoader:class{},createEvaOptionsController:()=>({entries:[],install:async()=>({stale:false}),update(){},setPalette(){},dispose(){}}),
  fetch:async url=>{if(failure==='catalog')return {ok:false};if(String(url).includes('EVA_OPTIONS')){evaWait=evaGate();stats.waitingEva=true;await evaWait}else if(evaWait&&/TOOLHEAD_CONFIGURATIONS|HEAD_ADDITIONS/.test(String(url)))await evaWait;return {ok:true,json:async()=>({})}},
  loadCommunity:async(index,id)=>{stats.loads++;const tracker=uiProgress.beginModelLoading({fixture:{bytes:100}},{document:doc,navigator:win.navigator}),job={tracker};jobs.push(job);try{await new Promise((resolve,reject)=>Object.assign(job,{resolve,reject}));return specimen(id)}finally{tracker.finish()}},
  setupPublicInfo:async()=>{stats.publicInfo++;await infoGate();if(failure==='publicInfo')throw Error('Controlled source panel failure')},loadSourceController:async()=>({mount:s=>s.delegatedMount()})};
 let body=uiController.replace(/^import [^\n]+;\r?\n/gm,'').replace('ensureWorkspaceEntry(import.meta.url);','').replace('export async function mount(','async function mount(');
 const delegate=/import\('\.\/source-assembly\.mjs\?v=[a-f0-9]+'\)/;assert(delegate.test(body));body=body.replace(delegate,'loadSourceController()');
 const mount=new Function(...Object.keys(dependencies),body+'\nreturn mount;')(...Object.values(dependencies));
 return {doc,win,node,language,jobs,stats,makeScope,mount,setFailure:value=>{failure=value},releaseInfo:()=>infoResolve(),releaseEva:()=>evaResolve(),flushEvents:async()=>{const a=pendingEvents.splice(0);await Promise.all(a)},close(){for(const s of scopes)if(!s.disposed)s.dispose();language.disconnect()}};
}
for(const lang of ['en','ja','es','ko','ru']){
 const f=await communityStatusFixture({lang}),scope=f.makeScope(),mounting=f.mount(scope);await statusTick(()=>f.jobs.length===1);const j=f.jobs[0];
 assert.notEqual(f.doc.body.dataset.ready,'true');assert.equal(f.node('status').hidden,false);assert.equal(f.node('openRender').disabled,true);j.tracker.update('fixture',{loaded:25,total:100});assert.equal(f.doc.querySelector('output').textContent,'25%');j.tracker.assembling();j.resolve();await statusTick(()=>f.stats.publicInfo===1);
 assert.notEqual(f.doc.body.dataset.ready,'true');assert.equal(f.node('status').hidden,false);assert.equal(f.node('openRender').disabled,true);f.releaseInfo();await mounting;
 assert.equal(f.node('sourceModelNotice').hidden,true,'Completed native view retained inspector loading paragraph');assert.equal(f.node('sourceModelNotice').textContent,'');assert.equal(f.node('sourceModelNotice').getAttribute('data-i18n-id'),null);
 assert.equal(f.doc.body.dataset.ready,'true');assert.equal(f.node('status').hidden,true);assert.equal(f.node('status').textContent,'');assert.equal(f.node('status').getAttribute('data-i18n-id'),null);assert.equal(f.node('openRender').disabled,false);assert.equal(f.node('sourceNotice').hidden,false);assert(f.node('sourceNotice').textContent.includes('92cc013ca2af94e6c09950dbe05c0973ee49aa00'));assert.equal(f.node('sourceLicenseNotice').textContent,'GPL-3.0');
 for(const next of ['ru','ja','en','es','ko']){await f.language.setLanguage(next);await f.flushEvents();assert.equal(f.node('status').textContent,'');assert.equal(f.node('sourceModelNotice').textContent,'');assert.equal(f.node('sourceNotice').hidden,false)}
 assert.equal(f.stats.loads,1,'Changing language reloaded the scene');f.close();uiCases.push({id:'community-ready-no-phantom-loading-'+lang,pass:true});
}
for(const failure of ['catalog','load','publicInfo']){
 const f=await communityStatusFixture({failure:failure==='load'?null:failure}),scope=f.makeScope(),mounting=f.mount(scope);mounting.catch(()=>{});
 if(failure==='load'){await statusTick(()=>f.jobs.length===1);f.jobs[0].reject(Error('Controlled transfer failure'))}else if(failure==='publicInfo'){await statusTick(()=>f.jobs.length===1);f.jobs[0].resolve();await statusTick(()=>f.stats.publicInfo===1);f.releaseInfo()}
 await assert.rejects(mounting);assert.equal(f.doc.body.dataset.ready,'false');assert.equal(f.node('status').hidden,false);assert.equal(f.node('openRender').disabled,true);
 for(const lang of ['en','ja','es','ko','ru']){await f.language.setLanguage(lang);await f.flushEvents();assert.equal(f.node('status').textContent,uiI18n.formatMessage('navigation.load_failed',{},lang));assert.equal(f.node('status').hidden,false)}
 f.close();uiCases.push({id:'community-visible-failure-'+failure,pass:true});
}
{
 const f=await communityStatusFixture();let scope=f.makeScope(),mounting=f.mount(scope);await statusTick(()=>f.jobs.length===1);f.jobs[0].resolve();await statusTick(()=>f.stats.publicInfo===1);f.releaseInfo();await mounting;scope.dispose();
 f.setFailure('catalog');scope=f.makeScope();await assert.rejects(f.mount(scope));assert.equal(f.node('status').hidden,false);assert.equal(f.doc.body.dataset.ready,'false');assert.equal(f.node('openRender').disabled,true);scope.dispose();
 f.setFailure(null);scope=f.makeScope();mounting=f.mount(scope);await statusTick(()=>f.jobs.length===2);assert.equal(f.node('status').hidden,false);assert.equal(f.node('status').textContent,uiI18n.translate('Loading CAD…',f.doc.documentElement.lang));f.jobs[1].resolve();await statusTick(()=>f.stats.publicInfo===2);f.releaseInfo();await mounting;assert.equal(f.node('status').hidden,true);assert.equal(f.node('status').textContent,'');assert.equal(f.node('openRender').disabled,false);f.close();uiCases.push({id:'ready-then-failure-then-retry-same-DOM',pass:true});
}
{
 const f=await communityStatusFixture({eva:true}),mounting=f.mount(f.makeScope());await statusTick(()=>f.jobs.length===1);f.jobs[0].resolve();await statusTick(()=>f.stats.waitingEva===true);
 await f.language.setLanguage('ja');await f.flushEvents();assert.notEqual(f.doc.body.dataset.ready,'true');f.releaseEva();await statusTick(()=>f.stats.publicInfo===1);f.releaseInfo();await mounting;assert.equal(f.doc.body.dataset.ready,'true');f.close();uiCases.push({id:'language-during-deferred-EVA-before-state',pass:true});
}
{
 const f=await communityStatusFixture({legitimateNotice:true}),scope=f.makeScope(),mounting=f.mount(scope);await statusTick(()=>f.jobs.length===1);f.jobs[0].resolve();await statusTick(()=>f.stats.publicInfo===1);f.releaseInfo();await mounting;
 for(const lang of ['en','ja','es','ko','ru']){await f.language.setLanguage(lang);await f.flushEvents();assert.equal(f.node('sourceModelNotice').hidden,false);assert.equal(f.node('sourceModelNotice').textContent,uiI18n.formatMessage('machine.switchwire.chain_notice',{},lang))}f.close();uiCases.push({id:'legitimate-inspector-notice-is-not-loading',pass:true});
}
{
 const f=await communityStatusFixture();for(const machine of ['voron_switchwire_250','ender3_stock_220','voron_switchwire_250']){
  f.win.location.href='https://example.test/viewer/community.html?machine='+machine+'&lang=en';const before=f.jobs.length,scope=f.makeScope(),mounting=f.mount(scope);await statusTick(()=>f.jobs.length>before);assert.equal(f.node('status').hidden,false);assert.equal(f.node('openRender').disabled,true);f.jobs.at(-1).resolve();await statusTick(()=>f.stats.publicInfo===before+1);f.releaseInfo();await mounting;assert.equal(f.doc.body.dataset.ready,'true');assert.equal(f.node('sourceModelNotice').hidden,true);scope.dispose();
 }f.close();uiCases.push({id:'community-machine-A-B-A-fresh-status',pass:true});
}
{
 const f=await communityStatusFixture(),scope=f.makeScope(),mounting=f.mount(scope);await statusTick(()=>f.jobs.length===1);f.jobs[0].resolve();await statusTick(()=>f.stats.publicInfo===1);scope.dispose();const before={ready:f.doc.body.dataset.ready,status:f.node('status').textContent,exports:f.stats.exports};f.releaseInfo();await mounting;assert.deepEqual({ready:f.doc.body.dataset.ready,status:f.node('status').textContent,exports:f.stats.exports},before);f.close();uiCases.push({id:'disposed-controller-cannot-publish-ready-or-export',pass:true});
}
{
 const f=await communityStatusFixture({machine:'rh3d_virtu_may_230'}),scope=f.makeScope();let language='en';const messages=uiSourceText.createSourceUIText(()=>language);scope.delegatedMount=()=>messages.set(f.node('sourceModelNotice'),'stl-virtu');await f.mount(scope);assert.equal(f.stats.loads,0);assert.equal(f.node('sourceModelNotice').hidden,false);
 for(const family of ['virtu','e3ng'])for(const lang of ['en','ja','es','ko','ru']){language=lang;messages.set(f.node('sourceModelNotice'),'stl-'+family);messages.refresh();assert.equal(f.node('sourceModelNotice').textContent,uiSourceCopy.sourceText('stl-'+family,lang));assert(f.node('sourceModelNotice').textContent);assert.equal(f.node('sourceModelNotice').dataset.i18n,'off')}
 f.close();uiCases.push({id:'delegated-source-controller-and-both-source-notice-bindings-preserved',pass:true});
}

// Re-run actual planner status/commit/action/language/progress bodies with the
// actual UI and catalog translations. Layout is empty, so no models are loaded.
{
 const doc=statusDocument(),status=doc.createElement('p'),sidebar=doc.createElement('aside');status.id='layout-status';status.hidden=true;doc.body.append(status,sidebar);
 const section=(text,a,b)=>{const start=text.indexOf(a),end=text.indexOf(b,start+a.length);assert(start>=0&&end>start);return text.slice(start,end)};
 const methods=section(uiApp,'function message(','function commit(')+section(uiApp,'function commit(','function select(')+section(uiApp,'async function act(','function updateViewPresentation(')+section(uiApp,'function updateLanguage(){','async function start(){');
 const rendering=section(uiApp,'async function render(){','async function act('),progress=section(rendering,'onProgress:p=>{','\n    }});').slice('onProgress:p=>{'.length),complete=section(rendering,"document.body.dataset.layoutRendering='complete';",'\n  }catch(error){'),failed=section(rendering,'}catch(error){','\n  }finally{').slice('}catch(error){'.length);
 const engine=new Function('S','I','document','status',`const {applyAction,serializeLayout,parseLayout,createDefaultLayout,createDesk,createShelf,validatePlacement}=S;let state=createDefaultLayout(),catalog=[],selected=null,ui=null,busy=false,roomEditing=false,disposed=false,interactionGeneration=0,operation=null,renderURL=null,locale='en',floorplan=false,lastPercent=0;const past=[],future=[],maxFileBytes=2097152,$=()=>status,language={t:(k,p)=>I.t(k,p,locale),refresh(){document.documentElement.lang=locale}},t=(k,p)=>language.t(k,p),view={view(){},setState(){}};let writes=0,downloads=0;function store(){writes++}function download(){downloads++}
 ${methods}
 function onProgress(p){${progress}}function finish(result){busy=false;${complete}}function failRender(error){busy=false;${failed}}
 return {act,commit,message,onProgress,finish,failRender,bind(v){ui=v;sync()},language(next){locale=next;updateLanguage()},busy(v){busy=v},editing(v){roomEditing=v},read:()=>({state,past:[...past],future:[...future],writes,downloads,busy,interactionGeneration}),setRoomHeight(height){commit(applyAction(state,{type:'SET_ROOM',room:{...state.room,wallHeightMm:height}},catalog))}};`)(uiLayoutState,uiLayoutText,doc,status);
 const component=uiLayout.createLayoutUI({container:sidebar,onAction:engine.act,t:(k,p)=>uiLayoutText.t(k,p,'en'),catalog:[]}),updates=[];engine.bind({...component,setStatus(next){updates.push(next);component.setStatus(next)}});
 const feedback=()=>sidebar.querySelector('.layout-feedback'),render=()=>sidebar.querySelector('.layout-render-message');
 await engine.act({type:'export'});for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.saved',{},lang));assert.equal(feedback().textContent,status.textContent);assert.equal(feedback().dataset.error,'false')}
 await engine.act({type:'import',file:{size:2,text:async()=>'{bad'}});for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.error.JSON_PARSE_ERROR',{},lang));assert.equal(feedback().dataset.error,'true');assert.equal(feedback().hidden,false)}
 engine.setRoomHeight(2500);assert.equal(status.hidden,true);assert.equal(status.textContent,'');for(const lang of ['ja','ru','en']){engine.language(lang);assert.equal(status.hidden,true);assert.equal(feedback().hidden,true)}
 engine.busy(true);engine.onProgress({phase:'loading',index:0,total:2,ratio:.5});const before=engine.read();
 for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);const expected=uiLayoutText.t('layout.render.progress',{current:1,total:2,percent:25},lang);assert.equal(status.textContent,expected);assert.equal(render().textContent,expected);const bar=sidebar.querySelector('progress');assert.equal(Number(bar.value),25);assert.equal(bar.max,100);assert.equal(bar.hidden,false);assert.equal(sidebar.querySelector('[data-layout-command="undo"]').disabled,true);assert.deepEqual(engine.read(),before)}
 engine.finish({width:1920,height:1080});for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.render.complete',{width:1920,height:1080},lang));assert.equal(feedback().textContent,status.textContent)}
 engine.failRender(Object.assign(Error('cancelled'),{name:'AbortError'}));for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.render.cancelled',{},lang));assert.equal(feedback().dataset.error,'false')}
 engine.failRender(Object.assign(Error('blocked'),{errors:[{code:'ROOM_OUT_OF_BOUNDS'}]}));for(const lang of ['en','ja','es','ko','ru']){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.error.ROOM_OUT_OF_BOUNDS',{},lang));assert.equal(feedback().dataset.error,'true')}

 // Import/Undo/Redo must use the actual commit lifecycle, not just sync the scene.
 const localeNames=['en','ja','es','ko','ru'];
 const roomJSON=height=>uiLayoutState.serializeLayout(uiLayoutState.applyAction(engine.read().state,{type:'SET_ROOM',room:{...engine.read().state.room,wallHeightMm:height}},[]),[]);
 const clearInEveryLocale=()=>{const saved=engine.read();assert.equal(status.hidden,true);assert.equal(status.textContent,'');assert.equal(Object.hasOwn(status,'_layoutMessage'),false);assert.equal(feedback().hidden,true);assert.equal(feedback().dataset.error,'false');for(const lang of localeNames){engine.language(lang);assert.equal(status.hidden,true);assert.equal(status.textContent,'');assert.equal(feedback().hidden,true);assert.deepEqual(engine.read(),saved)}};
 const stateBeforeImport=engine.read().state,historyBeforeImport=engine.read();
 const importedText=roomJSON(2600);await engine.act({type:'import',file:{size:importedText.length,text:async()=>importedText}});
 const imported=engine.read();assert.equal(imported.state.room.wallHeightMm,2600);assert.equal(imported.past.length,historyBeforeImport.past.length+1);
 for(const lang of localeNames){engine.language(lang);assert.equal(status.textContent,uiLayoutText.t('layout.loaded',{},lang));assert.equal(feedback().textContent,status.textContent)}
 await engine.act({type:'undo'});assert.strictEqual(engine.read().state,stateBeforeImport);assert.equal(engine.read().future.length,1);assert.equal(engine.read().writes,imported.writes+1);clearInEveryLocale();uiCases.push({id:'planner-import-undo-clears-both-status-nodes-and-locale-formatter',pass:true});
 engine.message(()=>uiLayoutText.t('layout.error.generic',{},doc.documentElement.lang),true);
 const beforeRedo=engine.read();await engine.act({type:'redo'});assert.strictEqual(engine.read().state,imported.state);assert.equal(engine.read().future.length,0);assert.equal(engine.read().past.length,beforeRedo.past.length+1);assert.equal(engine.read().writes,beforeRedo.writes+1);clearInEveryLocale();uiCases.push({id:'planner-redo-clears-success-or-error-with-exact-history',pass:true});
 // A no-history command keeps the notification; existing generation invalidation remains.
 engine.message(()=>uiLayoutText.t('layout.loaded',{},doc.documentElement.lang));let beforeNoop=engine.read(),oldText=status.textContent,oldFormat=status._layoutMessage;
 await engine.act({type:'redo'});assert.deepEqual(engine.read(),{...beforeNoop,interactionGeneration:beforeNoop.interactionGeneration+1});assert.equal(status.textContent,oldText);assert.strictEqual(status._layoutMessage,oldFormat);
 while(engine.read().past.length)await engine.act({type:'undo'});
 engine.message(()=>uiLayoutText.t('layout.loaded',{},doc.documentElement.lang));beforeNoop=engine.read();oldText=status.textContent;oldFormat=status._layoutMessage;
 await engine.act({type:'undo'});assert.deepEqual(engine.read(),{...beforeNoop,interactionGeneration:beforeNoop.interactionGeneration+1});assert.equal(status.hidden,false);assert.equal(status.textContent,oldText);assert.strictEqual(status._layoutMessage,oldFormat);assert.equal(feedback().textContent,oldText);uiCases.push({id:'planner-empty-history-undo-and-redo-preserve-notification-and-state',pass:true});
 engine.setRoomHeight(2700);engine.setRoomHeight(2800);await engine.act({type:'undo'});assert(engine.read().past.length&&engine.read().future.length);
 engine.busy(true);engine.onProgress({phase:'loading',index:0,total:2,ratio:.5});const busyBefore=engine.read(),progressText=status.textContent;
 await engine.act({type:'undo'});await engine.act({type:'redo'});assert.deepEqual(engine.read(),busyBefore);assert.equal(status.textContent,progressText);assert.equal(Number(sidebar.querySelector('progress').value),25);assert.equal(sidebar.querySelector('[data-layout-command="undo"]').disabled,true);assert.equal(sidebar.querySelector('[data-layout-command="redo"]').disabled,true);
 engine.busy(false);engine.editing(true);const editingBefore=engine.read();await engine.act({type:'undo'});await engine.act({type:'redo'});assert.deepEqual(engine.read(),editingBefore);assert.equal(status.textContent,progressText);engine.editing(false);engine.failRender(Object.assign(Error('cancelled'),{name:'AbortError'}));uiCases.push({id:'planner-busy-progress-and-room-editor-reject-history-actions-without-clearing',pass:true});
 // A successful Undo invalidates a still-reading import, including its late error.
 let resolveText;const lateText=roomJSON(2900),lateImport=engine.act({type:'import',file:{size:lateText.length,text:()=>new Promise(r=>{resolveText=r})}});
 await engine.act({type:'undo'});const afterUndo=engine.read();clearInEveryLocale();resolveText(lateText);await lateImport;assert.deepEqual(engine.read(),afterUndo);clearInEveryLocale();uiCases.push({id:'planner-undo-invalidates-pending-import-without-stale-loaded-message',pass:true});
 let rejectText;const lateFailure=engine.act({type:'import',file:{size:2,text:()=>new Promise((resolve,reject)=>{rejectText=reject})}});
 await engine.act({type:'redo'});const afterRedo=engine.read();clearInEveryLocale();rejectText(Error('late read failure'));await lateFailure;assert.deepEqual(engine.read(),afterRedo);clearInEveryLocale();uiCases.push({id:'planner-redo-invalidates-pending-import-error-without-stale-error-message',pass:true});
 component.dispose();uiCases.push({id:'planner-five-locale-success-error-clear-live-progress-params-history',pass:true});
}
const uiReport={status:'PASS',cases:uiCases,inputs:Object.fromEntries(uiInputs),scope:'Actual controller/app/translation/progress/UI source on controlled DOM, synthetic scene and deferred transport. No model files, native jobs, actual browser/GPU or physical-fit evidence.'};
if(uiFlag('--report'))fs.writeFileSync(uiFlag('--report'),JSON.stringify(uiReport,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(uiReport));
