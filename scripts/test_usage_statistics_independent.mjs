// Independent UI/core integration and route-hook fixtures only. No Google SDK
// is evaluated and no network/model/browser rendering is performed.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const project=path.resolve(process.env.USAGE_STATISTICS_REVIEW_ROOT||fileURLToPath(new URL('../',import.meta.url))),coreFile=process.env.USAGE_STATISTICS_REVIEW_CORE||path.join(project,'site/viewer/usage-analytics.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex'),sources=new Map(),pins=[];
function source(file){file=path.resolve(file);if(!sources.has(file)){const bytes=fs.readFileSync(file);sources.set(file,bytes.toString('utf8'));pins.push({file,sha256:sha(bytes)})}return sources.get(file)}
const read=rel=>source(path.join(project,rel)),core=source(coreFile),uiSource=read('site/viewer/usage-statistics.mjs'),lifecycle=read('site/viewer/workspace-lifecycle.mjs'),configSource=read('site/viewer/usage-analytics-config.mjs');
const ORIGIN='https://psych0h3ad.github.io',BASE='/3d-print-rig/',VIEW=BASE+'viewer/',ID='G-TEST123456',DISABLE='ga-disable-'+ID,CONSENT='3d-print-rig-analytics-consent-v1',REVIEW='3d-print-rig-analytics-review';
const config={measurementId:ID,productionOrigin:ORIGIN,basePath:BASE,publicReportUrl:null},cases=[],routeRows=[];
let serial=0,forbiddenNetwork=0;
const oldFetch=globalThis.fetch;globalThis.fetch=()=>{forbiddenNetwork++;throw Error('Independent fixture forbids real network')};
const data=(text,nonce='')=>'data:text/javascript;base64,'+Buffer.from(text+'\n// isolated-document '+nonce).toString('base64');
async function test(name,run){try{await run();cases.push({name,status:'pass'})}catch(error){cases.push({name,status:'fail',message:error.message})}}
class Element extends EventTarget{
 constructor(tag,onAppend){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.onAppend=onAppend;this.disabled=false;this.open=false}
 append(...nodes){for(const n of nodes){n.parent=this;this.children.push(n);this.onAppend?.(n)}}
 appendChild(n){this.append(n);return n}
 setAttribute(k,v){this.attributes.set(k,String(v))}
 getAttribute(k){return this.attributes.get(k)??null}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);this.removed=true}
 show(){this.open=true}showModal(){this.open=true}close(){this.open=false}
 click(){if(!this.disabled)this.dispatchEvent(new Event('click'))}
}
function store(initial=[]){const values=new Map(initial);return {values,getItem:k=>values.get(k)??null,setItem:(k,v)=>values.set(k,String(v)),removeItem:k=>values.delete(k)}}
function storageBus(){
 const shared=store(),tabs=[];
 return {shared,attach(win){const local={getItem:shared.getItem,setItem(key,value){const old=shared.getItem(key);shared.setItem(key,value);for(const peer of tabs)if(peer!==win)queueMicrotask(()=>{const event=new Event('storage');Object.assign(event,{key,oldValue:old,newValue:String(value),storageArea:peer.localStorage});peer.dispatchEvent(event)})}};tabs.push(win);return local}};
}
async function documentFixture({tail='community.html',local=store(),session=store(),bus}={}){
 const nonce=String(serial++),requests=[],scripts=[],cookies=[];
 const doc={documentElement:{dataset:{}},body:new Element('body'),head:new Element('head',n=>{if(n.tagName==='SCRIPT'){requests.push(n.src);scripts.push(n)}}),title:'Fixture only',referrer:''};
 doc.createElement=tag=>new Element(tag);doc.querySelector=selector=>selector.startsWith('script')?scripts.find(n=>!n.removed):doc.head.children.find(n=>n.getAttribute('data-usage-statistics')!==null)??null;
 Object.defineProperty(doc,'cookie',{get:()=>'',set:value=>cookies.push(value)});
 const win=new EventTarget();win.self=win;win.top=win;win.document=doc;win.navigator={webdriver:false,sendBeacon(){forbiddenNetwork++;throw Error('No beacon allowed')}};win.location={href:ORIGIN+VIEW+tail};win.sessionStorage=session;win.localStorage=bus?bus.attach(win):local;win.fetch=globalThis.fetch;
 const timers=new Map();let timerSequence=0;win.setTimeout=(callback,delay)=>{const id=++timerSequence;timers.set(id,{callback,delay});return id};win.clearTimeout=id=>timers.delete(id);
 const lifecycleURL=data(lifecycle,nonce),life=await import(lifecycleURL);
 const imports={'usage-analytics':data(core,nonce),'usage-analytics-config':data(configSource,nonce),'i18n':data('export const messageSource=id=>id;',nonce),'workspace-lifecycle':lifecycleURL};
 let transformed=uiSource;
 for(const [name,url]of Object.entries(imports)){const pattern=new RegExp(`from\\s*(['"])\\./${name}\\.mjs(?:\\?[^'"]*)?\\1`,'u');assert(pattern.test(transformed),'Expected actual UI import: '+name);transformed=transformed.replace(pattern,()=>"from '"+url+"'")}
 transformed=transformed.replaceAll('import.meta.url',JSON.stringify(pathToFileURL(path.join(project,'site/viewer/usage-statistics.mjs')).href));
 const ui=await import(data(transformed,nonce)),{createUsageAnalytics}=await import(imports['usage-analytics']);let scope;
 // Seed an earlier valid grant through the actual current persistence API,
 // including its current record version/expiry, rather than inventing a schema.
 if(win.localStorage.getItem(CONSENT)===null)ui.storeStatisticsConsent(win.localStorage,'granted');
 const f={win,doc,requests,scripts,cookies,session,ui,
  mount(){scope=new life.WorkspaceScope();life.activateScope(scope);f.controls=ui.setupUsageStatistics(new Element('div'),{document:doc,window:win,config,create:(options,env)=>(f.tracker=createUsageAnalytics(options,env))});return f.controls},
  disposeWorkspace(){scope?.dispose()},load(){const callback=scripts.at(-1)?.onload;assert(callback,'Expected pending fixture tag; actual tracker status '+f.tracker?.status);callback()},
  commands(){return Array.from(win.dataLayer??[],args=>Array.from(args))},
  events(){return f.commands().filter(v=>v[0]==='event')},configs(){return f.commands().filter(v=>v[0]==='config')},
  deny(){const actions=f.controls.dialog.children.find(n=>n.className==='usage-statistics-actions');assert(actions);actions.children[1].click()},
 };
 f.mount();return f;
}
try{
 await test('saved-grant-plus-review-marker-excludes-before-any-tag-request',async()=>{
  const f=await documentFixture({tail:'community.html?analytics=off'});assert.equal(f.requests.length,0);assert.equal(f.win.dataLayer,undefined);assert.equal(f.session.getItem(REVIEW),'off');assert.equal(f.win[DISABLE],true);f.disposeWorkspace();
 });
 await test('same-tab-review-session-survives-workspace-and-new-document-navigation',async()=>{
  const session=store(),f=await documentFixture({tail:'community.html?analytics=off',session});f.disposeWorkspace();f.win.location.href=ORIGIN+VIEW+'trident.html?configuration=next';f.mount();assert.equal(f.requests.length,0);f.disposeWorkspace();
  const next=await documentFixture({tail:'v0.html',session});assert.equal(next.requests.length,0);assert.equal(next.win[DISABLE],true);next.disposeWorkspace();
 });
 await test('duplicate-review-query-persists-exclusion-across-new-document',async()=>{
  const session=store(),f=await documentFixture({tail:'community.html?analytics=on&analytics=off',session});assert.equal(f.requests.length,0,'Core must reject any actual off value');f.disposeWorkspace();
  const next=await documentFixture({tail:'trident.html',session});assert.equal(next.requests.length,0,'Review exclusion must persist when duplicate off is not first');next.disposeWorkspace();
 });
 await test('cross-tab-withdrawal-stops-ready-tab-and-clears-pending-tab-before-late-load',async()=>{
  const bus=storageBus();
  const a=await documentFixture({bus}),b=await documentFixture({bus}),pending=await documentFixture({bus});a.load();b.load();const late=pending.scripts[0].onload;
  assert.equal(b.events().length,1);a.deny();await Promise.resolve();await Promise.resolve();
  assert.equal(a.ui.statisticsConsent(a.win.localStorage),'denied');assert.equal(b.win[DISABLE],true);assert.equal(pending.win[DISABLE],true);assert.equal(b.events().length,0);late();assert.equal(pending.events().length,0);assert.equal(pending.configs().length,0);
  b.win.location.href=ORIGIN+VIEW+'v24.html';b.disposeWorkspace();b.mount();assert.equal(b.events().length,0);assert.equal(b.requests.length,1);for(const f of [a,b,pending])f.disposeWorkspace();
 });
 await test('UI-deny-before-tag-load-cannot-configure-or-send-from-captured-callback',async()=>{
  const f=await documentFixture();const late=f.scripts[0].onload;f.deny();late();assert.equal(f.configs().length,0);assert.equal(f.events().length,0);assert.equal(f.win[DISABLE],true);f.disposeWorkspace();
 });
 await test('workspace-query-config-remount-does-not-duplicate-config-or-canonical-page',async()=>{
  const f=await documentFixture();f.load();assert.equal(f.events().length,1);assert.equal(f.configs().length,1);
  for(const tail of ['community.html?configuration=one','community.html?configuration=two&lang=en#details']){f.disposeWorkspace();f.win.location.href=ORIGIN+VIEW+tail;f.mount();assert.equal(f.events().length,1);assert.equal(f.configs().length,1)}
  f.disposeWorkspace();f.win.location.href=ORIGIN+VIEW+'trident.html?machine=fixture';f.mount();assert.equal(f.events().length,2);assert.equal(f.configs().length,1);f.disposeWorkspace();
 });
 await test('all-available-machine-routes-have-common-or-explicit-statistics-hook',async()=>{
  const machinesFile=path.join(project,'site/viewer/machines.js'),visited=new Set();
  function pinCatalogImports(file){file=path.resolve(file);if(visited.has(file))return;visited.add(file);const text=source(file);for(const m of text.matchAll(/(?:\bfrom\s*|\bimport\s*)['"](\.[^'"]+)['"]/g)){const p=path.resolve(path.dirname(file),m[1].split('?')[0]);if(/\.(?:mjs|js)$/.test(p))pinCatalogImports(p)}}
  pinCatalogImports(machinesFile);const {machineChoices}=await import(pathToFileURL(machinesFile).href);
  const router=read('site/viewer/workspace-router.mjs'),shared=read('site/viewer/workspace-ui.mjs');
  const common=/import\s*\{\s*setupUsageStatistics\s*\}\s*from\s*['"]\.\/usage-statistics\.mjs(?:\?[^'"]*)?['"]/.test(shared)&&/setupUsageStatistics\(menu\)/.test(shared)&&/setupWorkspace\(\)/.test(router)&&router.includes("from './workspace-ui.mjs");
  const controllerList=router.match(/const controllers = new Set\(\[([^\]]+)\]\)/)?.[1];assert(controllerList,'Actual router controller list is required');const controllers=new Set(Array.from(controllerList.matchAll(/['"]([^'"]+)['"]/g),m=>m[1]));
  const pages=new Map();
  for(const machine of machineChoices.filter(m=>m.available!==false)){
   const url=new URL(machine.page,ORIGIN+VIEW),file=url.pathname===VIEW?'index.html':url.pathname.slice(VIEW.length);assert(url.origin===ORIGIN&&url.pathname.startsWith(VIEW)&&!file.includes('/'),'Canonical available machine route: '+machine.id);
   let html;try{html=read('site/viewer/'+file)}catch{routeRows.push({id:machine.id,route:file,hook:'MISSING',reason:'Missing registered HTML'});continue}
   const tag=Array.from(html.matchAll(/<script\b[^>]*>/g),m=>m[0]).find(t=>/workspace-router\.mjs/.test(t)),controller=tag?.match(/data-controller=['"]([^'"]+)/)?.[1],name=controller&&new URL(controller,url).pathname.split('/').at(-1);
   const hooked=Boolean(common&&tag&&controllers.has(name)&&/<aside\b/.test(html)&&/id=['"]stage['"]/.test(html)&&/<header\b/.test(html));
   routeRows.push({id:machine.id,route:file,hook:hooked?'workspace-router -> workspace-ui -> setupUsageStatistics':'MISSING'});pages.set(file,url);
  }
  assert(routeRows.length>0);assert.equal(new Set(routeRows.map(r=>r.id)).size,routeRows.length);
  assert.deepEqual(routeRows.filter(r=>r.hook==='MISSING').map(r=>r.id),[],'Every available machine requires an actual common/explicit analytics hook');
  for(const [file,hook]of [['machines.html','machine-gallery.mjs'],['stealthburner-cutaway.html','stealthburner-cutaway.mjs']]){
   const html=read('site/viewer/'+file),script=read('site/viewer/'+hook);assert(html.includes(hook));assert(/import\s*\{setupUsageStatistics\}/.test(script)&&/setupUsageStatistics\(/.test(script),'Missing explicit gallery/standalone hook: '+file);pages.set(file,new URL(file,ORIGIN+VIEW));
  }
  for(const [file]of pages){const f=await documentFixture({tail:file==='index.html'?'':file});assert.equal(f.requests.length,1,'Core route allowlist must cover '+file);f.load();assert.equal(f.events().length,1,'Canonical page event required for '+file);f.disposeWorkspace()}
 });
 assert.equal(forbiddenNetwork,0);
 const changed=pins.filter(p=>sha(fs.readFileSync(p.file))!==p.sha256).map(p=>p.file);
 const report={schema:'usage-statistics-independent-fixtures/1',passed:cases.every(c=>c.status==='pass')&&changed.length===0,cases,available_machine_route_count:routeRows.length,machine_routes:routeRows,source_stable:changed.length===0,source_sha256:pins.map(p=>({path:path.relative(project,p.file).replaceAll('\\','/'),sha256:p.sha256})),core_overlay_used:Boolean(process.env.USAGE_STATISTICS_REVIEW_CORE),no_real_Google_requests:true,forbidden_network_calls:forbiddenNetwork,native_CAD_GPU_country_or_live_count_validation:false,full_law_compliance_claim:false};
 if(process.env.USAGE_STATISTICS_INDEPENDENT_REPORT){const out=process.env.USAGE_STATISTICS_INDEPENDENT_REPORT;assert(!fs.existsSync(out),'Preserve earlier independent receipt');fs.writeFileSync(out,JSON.stringify(report,null,2)+'\n')}
 console.log(JSON.stringify({passed:report.passed,cases:cases.length,failures:cases.filter(c=>c.status==='fail'),available_machine_routes:routeRows.length,no_real_Google_requests:true,source_stable:report.source_stable}));
 if(!report.passed)process.exitCode=1;
}finally{globalThis.fetch=oldFetch}
