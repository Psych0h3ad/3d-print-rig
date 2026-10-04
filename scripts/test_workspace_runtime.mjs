import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import vm from 'node:vm';
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
