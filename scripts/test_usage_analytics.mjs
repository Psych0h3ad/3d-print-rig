import assert from 'node:assert/strict';
import {createUsageAnalytics} from '../site/viewer/usage-analytics.mjs';

const oldFetch=globalThis.fetch;
let unexpectedNetwork=0;
globalThis.fetch=()=>{unexpectedNetwork++;throw Error('Fixture forbids real network')};
const ORIGIN='https://psych0h3ad.github.io',BASE='/3d-print-rig/',ROOT=BASE+'viewer/';
const ID='G-TEST123456',DISABLE='ga-disable-'+ID;
const defaults={measurementId:ID,productionOrigin:ORIGIN,basePath:BASE};
const cases=[];
function test(name,run){run();cases.push({name,passed:true})}
function fixture({href=ORIGIN+ROOT+'community.html?private=secret#assembly',privacy={},iframe=false,appendError=false,createError=false,queryError=false}={}){
 const requests=[],nodes=[],writes=[];
 const win={location:{href},navigator:{...privacy,sendBeacon(){unexpectedNetwork++;throw Error('No beacon')}},fetch:globalThis.fetch,history:{pushState(){throw Error('No history hooks')},replaceState(){throw Error('No history hooks')}}};
 win.self=win;win.top=iframe?{}:win;
 const doc={title:'PRIVATE raw CAD title',referrer:'https://private.example.invalid/?email=secret',
  head:{appendChild(node){if(appendError)throw Error('CSP/DOM load blocked');node.attached=true;requests.push(node.src);nodes.push(node);return node}},
  querySelector(){if(queryError)throw Error('DOM unavailable');return null},
  createElement(type){assert.equal(type,'script');if(createError)throw Error('DOM unavailable');return {onload:null,onerror:null,attached:false,remove(){this.attached=false;this.removed=true}}},
 };
 Object.defineProperty(doc,'cookie',{get(){throw Error('Core must not read cookies')},set(value){writes.push(value);throw Error('Core must not write/delete cookies')}});
 win.document=doc;
 const env={window:win,document:doc,navigator:win.navigator};
 return {win,doc,env,requests,nodes,writes,
  create(options={}){return createUsageAnalytics({...defaults,...options},env)},
  load(index=nodes.length-1){nodes[index].onload?.()},error(index=nodes.length-1){nodes[index].onerror?.()},
  commands(){return Array.from(win.dataLayer??[],args=>Array.from(args))},
  events(){return this.commands().filter(args=>args[0]==='event')},
  configs(){return this.commands().filter(args=>args[0]==='config')},
 };
}
const ready=()=>{const f=fixture();f.core=f.create();assert.equal(f.core.allow(),true);f.load();assert.equal(f.core.status,'ready');return f};
const path=(file='community')=>ROOT+file+'.html';
const safe=(p=path())=>({page_location:ORIGIN+p,page_referrer:'',page_title:'3D Print Rig viewer'});

test('import and denied methods cause no tag/global/network/storage work',()=>{
 const f=fixture(),a=f.create();assert.equal(a.status,'denied');
 assert.equal(f.win.gtag,undefined);assert.equal(f.win.dataLayer,undefined);
 assert.equal(a.page(ORIGIN+path()),false);a.deny();a.deny();
 assert.deepEqual(f.requests,[]);assert.deepEqual(f.writes,[]);assert.equal(f.win.dataLayer,undefined);
 a.dispose();a.dispose();assert.equal(a.status,'disposed');assert.equal(a.allow(),false);
});
test('pending absent measurement ID and malformed/injected IDs stay disabled',()=>{
 for(const measurementId of [undefined,null,'','G-','G-abc1234567','G-123456789','G-12345678901','G-TEST123456&x=bad',' G-TEST123456',123]){
  const f=fixture(),a=f.create({measurementId});assert.equal(a.status,'disabled-id');assert.equal(a.allow(),false);assert.equal(a.page(ORIGIN+path()),false);assert.equal(f.requests.length,0);
 }
});
test('invalid origins/base paths fail closed without resolving arbitrary code',()=>{
 for(const options of [{productionOrigin:'http://psych0h3ad.github.io'},{productionOrigin:ORIGIN+'/'},{productionOrigin:ORIGIN+'/other'},{productionOrigin:'https://localhost'},{productionOrigin:'https://127.0.0.1'},{productionOrigin:'https://[::1]'},{basePath:'/3d-print-rig/../'},{basePath:'/'},{basePath:'/3d-print-rig/?private=x'},{basePath:'/3d-print-rig'}]){
  const f=fixture(),a=f.create(options);assert.equal(a.allow(),false);assert.equal(a.status,'disabled-config');assert.deepEqual(f.requests,[]);
 }
});
test('non-production origin, loopback and preview origins cannot start',()=>{
 for(const href of ['http://localhost:8080'+ROOT,'https://localhost'+ROOT,'http://127.0.0.1'+ROOT,'http://[::1]'+ROOT,'https://preview.example.invalid'+ROOT,'https://psych0h3ad.github.io.evil.invalid'+ROOT,'http://psych0h3ad.github.io'+ROOT]){
  const f=fixture({href}),a=f.create();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-origin');assert.equal(f.requests.length,0);
 }
});
test('iframe and unavailable browser context stay disabled',()=>{
 const f=fixture({iframe:true}),a=f.create();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-iframe');assert.equal(f.requests.length,0);
 const server=createUsageAnalytics(defaults,{});assert.equal(server.allow(),false);assert.equal(server.status,'disabled-browser');
 const crossed=fixture();Object.defineProperty(crossed.win,'top',{get(){throw Error('Blocked window')}});assert.equal(crossed.create().allow(),false);assert.equal(crossed.requests.length,0);
});
test('GPC and browser DNT prevent any request, even with explicit allow',()=>{
 for(const privacy of [{globalPrivacyControl:true},{doNotTrack:'1'},{msDoNotTrack:'1'}]){
  const f=fixture({privacy}),a=f.create();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-privacy');assert.equal(a.page(ORIGIN+path()),false);assert.equal(f.requests.length,0);
 }
 const f=fixture();f.win.doNotTrack='1';assert.equal(f.create().allow(),false);assert.equal(f.requests.length,0);
});
test('false GPC and DNT 0 do not prevent an otherwise explicit grant',()=>{
 const f=fixture({privacy:{globalPrivacyControl:false,doNotTrack:'0'}}),a=f.create();assert.equal(a.allow(),true);assert.equal(f.requests.length,1);a.dispose();
});
test('each review exclusion defeats restored consent with zero script/dataLayer/network',()=>{
 for(const reason of ['config','webdriver','query']){
  const f=fixture(reason==='query'?{href:ORIGIN+path()+'?analytics=off&lang=ja'}:reason==='webdriver'?{privacy:{webdriver:true}}:{});
  // Simulate the parent immediately restoring an earlier affirmative choice.
  const savedConsent='granted';f.win[DISABLE]=false;
  const a=createUsageAnalytics({...defaults,excluded:reason==='config'},{window:f.win,document:f.doc});
  assert.equal(a.status,'disabled-excluded');
  if(savedConsent==='granted')assert.equal(a.allow(),false);
  assert.equal(a.page(ORIGIN+path()),false);assert.equal(a.allow(),false);
  assert.equal(a.status,'disabled-excluded');assert.equal(f.win[DISABLE],true);
  assert.deepEqual(f.requests,[]);assert.deepEqual(f.nodes,[]);assert.equal(f.win.dataLayer,undefined);assert.equal(f.win.gtag,undefined);assert.deepEqual(f.writes,[]);assert.equal(unexpectedNetwork,0);
  a.deny();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-excluded');a.dispose();
 }
});
test('actual analytics=off query is latched even when stripped before the first allow',()=>{
 const f=fixture({href:ORIGIN+path()+'?analytics=off'}),a=f.create();
 f.win.location.href=ORIGIN+path('trident')+'?lang=en';
 assert.equal(a.allow(),false);assert.equal(a.page(f.win.location.href),false);assert.equal(a.status,'disabled-excluded');assert.equal(f.requests.length,0);assert.equal(f.win.dataLayer,undefined);a.dispose();
});
test('query exclusion appearing after construction is latched at the next boundary',()=>{
 const f=fixture(),a=f.create();f.win.location.href=ORIGIN+path()+'?analytics=on&analytics=off';
 assert.equal(a.page(f.win.location.href),false);assert.equal(a.status,'disabled-excluded');
 f.win.location.href=ORIGIN+path();assert.equal(a.allow(),false);assert.equal(f.requests.length,0);assert.equal(f.win.dataLayer,undefined);a.dispose();
});
test('deny observes a new review marker before same-document URL cleanup',()=>{
 const f=fixture(),a=f.create();f.win.location.href=ORIGIN+path()+'?analytics=off';a.deny();assert.equal(a.status,'disabled-excluded');
 f.win.location.href=ORIGIN+path();a.deny();assert.equal(a.status,'disabled-excluded');assert.equal(a.allow(),false);assert.equal(f.requests.length,0);assert.equal(f.win.dataLayer,undefined);a.dispose();
});
test('exclusion uses an exact actual query parameter, not hash, substring or page argument',()=>{
 for(const tail of ['?analytics=OFF','?analytics=officer','?notanalytics=off','?analytics=on#analytics=off','#analytics=off']){
  const f=fixture({href:ORIGIN+path()+tail}),a=f.create({excluded:false});assert.equal(a.allow(),true);f.load();assert.equal(a.status,'ready');assert.equal(f.events().length,1);a.dispose();
 }
 const f=ready();assert.equal(f.core.page(ORIGIN+path('trident')+'?analytics=off'),true);assert.equal(f.core.status,'ready');assert.equal(f.events().length,2);f.core.dispose();
});
test('webdriver false and excluded false keep normal explicit opt-in functional',()=>{
 const f=fixture({privacy:{webdriver:false}}),a=f.create({excluded:false});assert.equal(a.allow(),true);f.load();assert.equal(a.status,'ready');assert.equal(f.events().length,1);a.dispose();
});
test('exclusion during a pending load clears views and survives URL cleanup/regrant',()=>{
 for(const cause of ['query','webdriver']){
  const f=fixture(),a=f.create();a.allow();const late=f.nodes[0].onload;
  if(cause==='query')f.win.location.href=ORIGIN+path()+'?analytics=off';else f.win.navigator.webdriver=true;
  late();assert.equal(a.status,'disabled-excluded');assert.equal(f.configs().length,0);assert.equal(f.events().length,0);assert.equal(f.win[DISABLE],true);
  f.win.location.href=ORIGIN+path();f.win.navigator.webdriver=false;assert.equal(a.allow(),false);assert.equal(a.page(f.win.location.href),false);assert.equal(f.requests.length,1);a.dispose();
 }
});
test('actual query opt-out after ready revokes before any next route and stays excluded',()=>{
 const f=ready();assert.equal(f.events().length,1);f.win.location.href=ORIGIN+path('trident')+'?analytics=off';
 assert.equal(f.core.page(f.win.location.href),false);assert.equal(f.core.status,'disabled-excluded');assert.equal(f.win[DISABLE],true);assert.equal(f.events().length,0);
 f.win.location.href=ORIGIN+path('v0');assert.equal(f.core.allow(),false);assert.equal(f.core.page(f.win.location.href),false);assert.equal(f.requests.length,1);f.core.dispose();
});
test('standard tag request is async and does not send a document referrer',()=>{
 const f=fixture(),a=f.create();assert.equal(a.allow(),true);assert.equal(a.status,'loading');
 assert.deepEqual(f.requests,['https://www.googletagmanager.com/gtag/js?id='+ID]);
 assert.equal(f.nodes[0].async,true);assert.equal(f.nodes[0].referrerPolicy,'no-referrer');
 assert.equal(Object.prototype.toString.call(f.win.dataLayer[0]),'[object Arguments]');
 assert.deepEqual(f.commands().map(x=>x[0]),['consent','js']);
 assert.deepEqual(f.commands()[0],['consent','default',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}]);
 assert.equal(f.configs().length,0);assert.equal(f.events().length,0);a.dispose();
});
test('initial config and actual page_view payload contain only safe page context',()=>{
 const f=ready();assert.deepEqual(f.configs(),[['config',ID,{send_page_view:false,allow_google_signals:false,allow_ad_personalization_signals:false,cookie_domain:'none',cookie_path:BASE,cookie_expires:15552000,cookie_update:false,...safe()}]]);
 assert.deepEqual(f.events(),[['event','page_view',{send_to:ID,...safe()}]]);
 const commands=f.commands(),ci=commands.findIndex(x=>x[0]==='config');
 assert(commands.slice(0,ci).some(x=>x[0]==='consent'&&x[1]==='default'&&x[2].ad_storage==='denied'&&x[2].ad_user_data==='denied'&&x[2].ad_personalization==='denied'));
 assert(commands.slice(0,ci).some(x=>x[0]==='consent'&&x[1]==='update'&&x[2].analytics_storage==='granted'&&x[2].ad_storage==='denied'));
 const serialized=JSON.stringify(commands);for(const secret of ['private=','secret','PRIVATE raw CAD title','private.example.invalid'])assert(!serialized.includes(secret));
 assert.deepEqual(f.writes,[]);f.core.dispose();
});
test('query, hash, configuration, axes and language calls do not create views',()=>{
 const f=ready();for(let i=0;i<200;i++)assert.equal(f.core.page(ORIGIN+path()+'?x='+i+'&lang=ja&model=secret#head'),true);
 assert.equal(f.events().length,1);assert.equal(f.configs().length,1);assert.equal(f.requests.length,1);assert.equal(f.core.allow(),true);assert.equal(f.events().length,1);f.core.dispose();
});
test('real A to B to A transitions are counted without a history hook',()=>{
 const f=ready(),history=f.win.history,push=history.pushState,replace=history.replaceState;
 f.core.page(ORIGIN+path('trident'));f.core.page(ORIGIN+path());
 assert.deepEqual(f.events().map(x=>x[2].page_location),[ORIGIN+path(),ORIGIN+path('trident'),ORIGIN+path()]);
 assert.equal(f.win.history,history);assert.equal(history.pushState,push);assert.equal(history.replaceState,replace);f.core.dispose();
});
test('viewer root and index aliases share a single canonical path',()=>{
 const f=fixture({href:ORIGIN+ROOT+'index.html?a=1#b'}),a=f.create();a.allow();f.load();
 for(const url of [ORIGIN+ROOT,ORIGIN+ROOT.slice(0,-1),ORIGIN+ROOT+'index.html?x=1'])a.page(url);
 assert.deepEqual(f.events(),[['event','page_view',{send_to:ID,...safe(ROOT)}]]);a.dispose();
});
test('every admitted top-level viewer route uses an explicit known name',()=>{
 const expected=['annex','cleaning','community','components','crossant','custom-voron','e3ng','gantries','kit-reference','machines','micron','positron','ratrig','remorph','stealthburner-cutaway','toolchangers','toolheads','trident','v0','v24','v24-reference'];
 const f=ready();for(const route of expected)assert.equal(f.core.page(ORIGIN+path(route)),true);
 assert.deepEqual(f.events().slice(1).map(x=>x[2].page_location),expected.map(n=>ORIGIN+path(n)));f.core.dispose();
});
test('outside viewer root, static assets, credentials and unknown pages are ignored',()=>{
 const f=ready();for(const url of [ORIGIN+BASE,ORIGIN+BASE+'support/',ORIGIN+ROOT+'file.glb',ORIGIN+ROOT+'profile.json',ORIGIN+ROOT+'community.mjs',ORIGIN+ROOT+'unknown.html',ORIGIN+ROOT+'art/credits.html',ORIGIN+ROOT+'community.html/secret','https://other.invalid'+path(),'https://name:password@psych0h3ad.github.io'+path(),'javascript:alert(1)',null,{},'/3d-print-rig/viewer/%63ommunity.html'])assert.equal(f.core.page(url),false);
 assert.equal(f.events().length,1);f.core.page(ORIGIN+path());assert.equal(f.events().length,1);f.core.dispose();
 const outside=fixture({href:ORIGIN+BASE+'support/'}),a=outside.create();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-path');assert.equal(outside.requests.length,0);
});
test('loading keeps only latest route and initial config matches that latest route',()=>{
 const f=fixture(),a=f.create();a.allow();a.page(ORIGIN+path('trident')+'?secret=1');a.page(ORIGIN+path('v0')+'#secret');a.allow();assert.equal(f.nodes.length,1);assert.equal(f.events().length,0);f.load();
 assert.deepEqual(f.configs()[0][2].page_location,ORIGIN+path('v0'));assert.deepEqual(f.events(),[['event','page_view',{send_to:ID,...safe(path('v0'))}]]);a.dispose();
});
test('an invalid latest route discards pending view; later valid mount can send',()=>{
 const f=fixture(),a=f.create();a.allow();a.page(ORIGIN+ROOT+'private.json');f.load();assert.equal(f.configs().length,0);assert.equal(f.events().length,0);assert.equal(a.page(ORIGIN+path('v0')),true);assert.equal(f.events().length,1);a.dispose();
});
test('deny before load drops grant/views and a captured late load cannot send',()=>{
 const f=fixture(),a=f.create();a.allow();a.page(ORIGIN+path('v0'));const late=f.nodes[0].onload;
 a.deny();assert.equal(a.status,'denied');assert.equal(f.win[DISABLE],true);late();assert.equal(f.events().length,0);assert.equal(f.configs().length,0);assert.equal(a.page(ORIGIN+path()),false);assert.equal(a.status,'denied');a.dispose();
});
test('allow deny allow before load uses one script and current permitted view',()=>{
 const f=fixture(),a=f.create();a.allow();a.page(ORIGIN+path('v0'));a.deny();assert.equal(a.allow(),true);assert.equal(a.status,'loading');assert.equal(f.requests.length,1);f.load();assert.deepEqual(f.events(),[['event','page_view',{send_to:ID,...safe()}]]);a.dispose();
});
test('deny load then renewed grant can configure once without a second download',()=>{
 const f=fixture(),a=f.create();a.allow();a.deny();f.load();assert.equal(f.events().length,0);assert.equal(a.allow(),true);assert.equal(f.requests.length,1);assert.equal(f.configs().length,1);assert.equal(f.events().length,1);a.dispose();
});
test('revoke after ready disables target before consent update; regrant does not duplicate same route',()=>{
 const f=ready(),before=f.events().length;assert.equal(before,1);const push=f.win.dataLayer.push.bind(f.win.dataLayer),flags=[];
 f.win.dataLayer.push=function(args){flags.push(f.win[DISABLE]);return push(args)};
 f.core.deny();assert(flags.every(Boolean));assert.equal(f.core.status,'denied');assert.equal(f.events().length,0);assert.deepEqual(f.commands()[0],['consent','update',{analytics_storage:'denied',ad_storage:'denied',ad_user_data:'denied',ad_personalization:'denied'}]);
 assert.equal(f.core.page(ORIGIN+path('v0')),false);assert.equal(f.core.allow(),true);assert.equal(f.events().length,0);assert.equal(f.requests.length,1);f.core.page(ORIGIN+path('v0'));assert.equal(f.events().length,1);f.core.dispose();
});
test('dispose while loading removes owned script and invalidates captured callbacks forever',()=>{
 const f=fixture(),a=f.create();a.allow();const node=f.nodes[0],late=node.onload,error=node.onerror,layer=f.win.dataLayer;
 a.dispose();assert.equal(node.attached,false);assert.equal(node.onload,null);assert.equal(node.onerror,null);assert.equal(f.win[DISABLE],true);late();error();
 assert.equal(a.status,'disposed');assert.equal(a.allow(),false);assert.equal(a.page(ORIGIN+path()),false);a.deny();a.dispose();assert.equal(a.status,'disposed');assert(!Array.from(layer,args=>args[0]).includes('event'));assert.equal(f.requests.length,1);
});
test('dispose ready disables target and removes only owned public entry points',()=>{
 const f=ready();f.core.dispose();assert.equal(f.win[DISABLE],true);assert.equal(f.win.gtag,undefined);assert.equal(f.win.dataLayer,undefined);assert.equal(f.nodes[0].removed,true);assert.equal(f.core.status,'disposed');
});
test('load failure is contained; explicit retry rejects stale callbacks and sends latest only',()=>{
 const f=fixture(),a=f.create();a.allow();const oldLoad=f.nodes[0].onload,oldError=f.nodes[0].onerror;
 assert.doesNotThrow(()=>f.error());assert.equal(a.status,'error');assert.equal(f.win[DISABLE],true);assert.equal(f.events().length,0);assert.equal(a.page(ORIGIN+path('v0')),false);
 assert.equal(a.allow(),true);assert.equal(f.requests.length,2);a.page(ORIGIN+path('trident'));oldLoad();oldError();assert.equal(a.status,'loading');assert.equal(f.events().length,0);f.load();assert.equal(a.status,'ready');assert.equal(f.events().length,1);assert.equal(f.events()[0][2].page_location,ORIGIN+path('trident'));a.dispose();
});
test('duplicate success/error callbacks after successful load cannot change state or duplicate views',()=>{
 const f=fixture(),a=f.create();a.allow();const load=f.nodes[0].onload,error=f.nodes[0].onerror;load();load();error();assert.equal(a.status,'ready');assert.equal(f.events().length,1);a.dispose();
});
test('DOM/CSP injection failures never throw into model startup',()=>{
 for(const flags of [{appendError:true},{createError:true},{queryError:true}]){
  const f=fixture(flags),a=f.create();assert.doesNotThrow(()=>assert.equal(a.allow(),false));assert.equal(a.status,'error');assert.equal(f.events().length,0);assert.doesNotThrow(()=>a.dispose());
 }
});
test('privacy signal during loading or after ready revokes on the next boundary',()=>{
 for(const beforeLoad of [true,false]){
  const f=fixture(),a=f.create();a.allow();if(!beforeLoad)f.load();f.win.navigator.globalPrivacyControl=true;
  if(beforeLoad)f.load();else assert.equal(a.page(ORIGIN+path('trident')),false);
  assert.equal(a.status,'disabled-privacy');assert.equal(f.win[DISABLE],true);assert.equal(f.events().length,0);assert.equal(a.allow(),false);a.dispose();
 }
});
test('origin or frame changes while tag is loading cannot flush pending views',()=>{
 for(const change of [f=>f.win.location.href='https://other.invalid'+path(),f=>f.win.top={}]){
  const f=fixture(),a=f.create();a.allow();change(f);f.load();assert.equal(f.events().length,0);assert.equal(f.configs().length,0);a.dispose();
 }
});
test('an existing tag/dataLayer is never adopted or overwritten',()=>{
 for(const existing of [{gtag(){throw Error('Not ours')}},{dataLayer:[]},{gtag:null},{dataLayer:null}]){
  const f=fixture();Object.assign(f.win,existing);const a=f.create();assert.equal(a.allow(),false);assert.equal(a.status,'disabled-existing-tag');assert.equal(f.requests.length,0);for(const [key,value]of Object.entries(existing))assert.equal(f.win[key],value);a.dispose();for(const [key,value]of Object.entries(existing))assert.equal(f.win[key],value);
 }
});
test('configured localhost aliases cannot turn an explicit grant into a download',()=>{
 for(const origin of ['https://localhost.','https://preview.localhost','https://127.1']){
  const f=fixture({href:origin+ROOT}),a=f.create({productionOrigin:origin});assert.equal(a.allow(),false);assert.equal(a.status,'disabled-config');assert.equal(f.requests.length,0);a.dispose();
 }
});
test('custom canonical project path keeps cookies and page context inside that project',()=>{
 const base='/another-project/',root=base+'viewer/',f=fixture({href:ORIGIN+root+'community.html?private=1'}),a=f.create({basePath:base});
 assert.equal(a.allow(),true);f.load();assert.equal(f.configs()[0][2].cookie_domain,'none');assert.equal(f.configs()[0][2].cookie_path,base);assert.equal(f.events()[0][2].page_location,ORIGIN+root+'community.html');assert.equal(a.page(ORIGIN+path()),false);a.dispose();
});
test('later replacement of public tag globals fails closed without deleting replacement',()=>{
 const f=ready(),other=()=>{};f.win.gtag=other;assert.equal(f.core.page(ORIGIN+path('v0')),false);assert.equal(f.core.status,'disabled-existing-tag');assert.equal(f.win[DISABLE],true);f.core.dispose();assert.equal(f.win.gtag,other);
});

assert.equal(unexpectedNetwork,0);globalThis.fetch=oldFetch;
const report={passed:true,caseCount:cases.length,cases,scope:'Fixture browser/Google-tag API commands only; no live ID, Google fetch, cookies, CAD or model scans',noGoogleRequests:true};
if(process.env.USAGE_ANALYTICS_REPORT){const {writeFile}=await import('node:fs/promises');await writeFile(process.env.USAGE_ANALYTICS_REPORT,JSON.stringify(report,null,2)+'\n',{flag:'wx'})}
console.log(JSON.stringify(report));
