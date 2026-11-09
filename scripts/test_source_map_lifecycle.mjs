import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createSourceViewLifetime} from '../site/viewer/source-view-lifetime.mjs';
const source=fs.readFileSync(new URL('../site/viewer/source-map-app.mjs',import.meta.url),'utf8');
const start=source.indexOf('const onLanguageChange='),end=source.indexOf('\ntry{',start);
assert(start>0&&end>start,'Require the actual pre-load application lifecycle installation');
const installation=source.slice(start,end);
assert(installation.includes("window.addEventListener('pagehide',onPageHide)"));
assert(source.indexOf('const received=await',end)>end,'Exit handling must be installed before model loading');
function fixture({ready=true,assembly=false,failures=[]}={}){
 const handlers=new Map(),calls=[],diagnostics=[],fail=new Set(failures);
 const mark=name=>(...args)=>{calls.push(name);if(fail.has(name))throw Error('Injected '+name)};
 const resource=name=>({dispose:mark(name)});
 const window={addEventListener:(name,fn)=>handlers.set(name,fn),removeEventListener:(name,fn)=>{assert.equal(handlers.get(name),fn);handlers.delete(name)}};
 const env={window,console:{error:(label,error)=>diagnostics.push({label,error})},
  refreshMode:mark('mode'),refreshCount:mark('count'),render:mark('render'),applyDisplay:mark('display'),resize:mark('resize'),
  controller:{abort:mark('abort')},cancelAnimationFrame:value=>{assert.equal(value,7);calls.push('cancelFrame')},
  resizeObserver:{disconnect:mark('observer')},themeObserver:{disconnect:mark('themeObserver')},
  navigation:ready?{dispose:mark('navigation'),refresh:mark('navigationRefresh')}:undefined,
  picker:ready?resource('picker'):undefined,workbench:ready?resource('workbench'):undefined,
  orbit:{dispose:mark('orbit'),removeEventListener:(name,fn)=>{assert.equal(name,'change');assert.equal(fn,env.render);calls.push('orbitListener')}},
  loaded:ready?resource('model'):undefined,grid:{geometry:resource('gridGeometry'),material:resource('gridMaterial')},renderer:resource('renderer'),
  assemblyMode:assembly,index:ready?{restore:mark('restore')}:undefined,assemblyEmphasis:resource('emphasis')};
 const setup='const {window,console,refreshMode,refreshCount,render,applyDisplay,resize,controller,cancelAnimationFrame,resizeObserver,themeObserver,orbit,grid,renderer,assemblyMode,assemblyEmphasis}=env;let disposed=false,frame=7,navigation=env.navigation,picker=env.picker,workbench=env.workbench,index=env.index,loaded=env.loaded;';
 const state=new Function('env','createSourceViewLifetime',setup+installation+';return()=>({disposed,closed:lifetime.closed,errors:lifetime.errors(),loaded,index});')(env,createSourceViewLifetime);
 return {calls,state,diagnostics,handlers,fire:(name,event)=>{const handler=handlers.get(name);if(handler){handler(event);return true}return false}};
}
const retained=fixture();
retained.fire('pagehide',{persisted:true});assert.deepEqual(retained.calls,[]);assert.equal(retained.state().disposed,false);
retained.fire('pageshow',{persisted:true});assert.deepEqual(retained.calls,['display','resize','render']);retained.calls.length=0;
retained.fire('rig-language-change',{});assert.deepEqual(retained.calls,['mode','count','navigationRefresh','render']);retained.calls.length=0;
retained.fire('pagehide',{persisted:false});assert(retained.state().disposed&&retained.state().closed);
const cleanup=['abort','cancelFrame','observer','themeObserver','navigation','picker','workbench','emphasis','orbitListener','orbit','model','gridGeometry','gridMaterial','renderer'];
assert.deepEqual(retained.calls,cleanup);assert.equal(retained.handlers.size,0);assert.equal(retained.state().loaded,undefined);
const once=[...retained.calls];for(const event of ['pagehide','pageshow','rig-language-change'])assert.equal(retained.fire(event,{persisted:false}),false);
assert.deepEqual(retained.calls,once,'A retired view must not dispose twice or revive rendering');assert.deepEqual(retained.diagnostics,[]);
const pending=fixture({ready:false});pending.fire('pagehide',{persisted:false});assert(pending.state().disposed);assert(!pending.calls.includes('model'));assert.equal(pending.handlers.size,0);
const assembly=fixture({assembly:true});assembly.fire('pagehide',{persisted:true});assert.deepEqual(assembly.calls,[]);assembly.fire('pagehide',{persisted:false});
assert(assembly.calls.indexOf('restore')<assembly.calls.indexOf('model'));assert.equal(assembly.state().index,undefined);
for(const failures of [['restore'],['workbench'],['emphasis'],['workbench','emphasis']]){
 const broken=fixture({assembly:true,failures});
 assert.doesNotThrow(()=>broken.fire('pagehide',{persisted:false}),'Cleanup diagnostics must not stop remaining retirement actions');
 for(const resource of [...cleanup,'restore'])assert.equal(broken.calls.filter(x=>x===resource).length,1,'Attempt each cleanup exactly once: '+resource);
 assert.equal(broken.handlers.size,0);assert.equal(broken.diagnostics.length,1);assert.equal(broken.state().errors.length,failures.length);
 assert.equal(broken.diagnostics[0].label,'Source view cleanup failed');assert(broken.diagnostics[0].error instanceof AggregateError);
 assert.deepEqual(broken.diagnostics[0].error.errors.map(e=>e.message),failures.map(name=>'Injected '+name));
}
console.log(JSON.stringify({passed:true,scope:'Exact current pre-load application handlers and real lifetime helper with explicit resource fixtures. Cached resume, language refresh, pending exit and aggregate cleanup diagnostics; not actual BFCache or GPU retirement certification.'}));
