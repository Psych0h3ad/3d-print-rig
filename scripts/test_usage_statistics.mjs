import assert from 'node:assert/strict';
import {publicStatisticsURL,statisticsConsent,storeStatisticsConsent,statisticsConsentKey,statisticsConsentVersion,statisticsConsentLifetime,statisticsReviewKey} from '../site/viewer/usage-statistics.mjs';
import {formatMessage,loadLanguage,supportedLanguages} from '../site/viewer/i18n.mjs';

const config={measurementId:'G-ABC1234567',productionOrigin:'https://psych0h3ad.github.io',basePath:'/3d-print-rig/',publicReportUrl:null};
class Element extends EventTarget {
  constructor(tag){super();this.tagName=tag.toUpperCase();this.children=[];this.attributes=new Map();this.open=false;this.disabled=false;}
  append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
  setAttribute(name,value){this.attributes.set(name,String(value));}
  getAttribute(name){return this.attributes.get(name)??null;}
  show(){this.open=true;this.modal=false;}
  showModal(){this.open=true;this.modal=true;}
  close(){this.open=false;}
  remove(){if(this.parent)this.parent.children=this.parent.children.filter(node=>node!==this);}
  click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
}
function fixture({privacy=false,storageBlocked=false,choice=null,embedded=false,excluded=false}={}){
  const values=new Map(),session=new Map(),cookies=[],calls=[];
  const storage={getItem:key=>values.get(key)??null,setItem:(key,value)=>values.set(key,value)};
  if(choice)storeStatisticsConsent(storage,choice);
  const document={head:new Element('head'),body:new Element('body'),documentElement:{dataset:{embedded:String(embedded)}},createElement:tag=>new Element(tag),
    querySelector:()=>document.head.children.find(node=>node.getAttribute('data-usage-statistics')!==null)};
  Object.defineProperty(document,'cookie',{set:value=>cookies.push(value)});
  const window=new EventTarget();window.self=window;window.top=window;window.navigator={globalPrivacyControl:privacy};
  window.location={href:config.productionOrigin+config.basePath+'viewer/community.html?machine=sample&private=do-not-send'+(excluded?'&analytics=off':'')};
  window.sessionStorage={getItem:key=>session.get(key)??null,setItem:(key,value)=>session.set(key,value)};
  Object.defineProperty(window,'localStorage',{get:()=>{if(storageBlocked)throw Error('Storage unavailable');return storage;}});
  const container=new Element('div');
  const create=()=>{calls.push(['create']);return {allow:()=>calls.push(['allow']),deny:()=>calls.push(['deny']),page:url=>calls.push(['page',url]),dispose:()=>calls.push(['dispose'])};};
  return {window,document,container,create,values,session,cookies,calls,storage};
}
let sequence=0;
async function mount(options={},configuration=config){
  const f=fixture(options),{setupUsageStatistics}=await import('../site/viewer/usage-statistics.mjs?fixture='+sequence++);
  const ui=setupUsageStatistics(f.container,{...f,config:configuration});return {...f,ui,setupUsageStatistics};
}
const report='https://lookerstudio.google.com/reporting/12345678-abcd-ef12-1234-123456789abc/page/overview';
assert.equal(publicStatisticsURL(report),report);
for(const unsafe of ['http://lookerstudio.google.com/reporting/abc','https://lookerstudio.google.com.evil.test/reporting/abc','https://user:pass@lookerstudio.google.com/reporting/abc',report+'?access-token=secret',report+'#secret','javascript:alert(1)','https://lookerstudio.google.com:444/reporting/abc'])assert.equal(publicStatisticsURL(unsafe),null);
assert.equal(statisticsConsent({getItem:()=>{throw Error('blocked')}}),null);
assert.equal(statisticsConsent({getItem:()=> 'not-a-choice'}),null);
assert.throws(()=>storeStatisticsConsent({setItem(){}},'maybe'));
const records=new Map(),recordStorage={getItem:key=>records.get(key),setItem:(key,value)=>records.set(key,value)};
storeStatisticsConsent(recordStorage,'granted',1000);
assert.equal(statisticsConsent(recordStorage,1000),'granted');
assert.equal(statisticsConsent(recordStorage,1000+statisticsConsentLifetime),null,'Expired consent must not restart measurement');
records.set(statisticsConsentKey,JSON.stringify({version:'old-policy',choice:'granted',createdAt:1000,expiresAt:1000+statisticsConsentLifetime}));
assert.equal(statisticsConsent(recordStorage,1001),null,'A changed policy requires a new choice');

const absent=await mount({}, {...config,measurementId:null});
assert.equal(absent.ui,null);assert.deepEqual(absent.calls,[]);assert.equal(absent.document.head.children.length,0);
assert.equal(absent.container.children[0].getAttribute('data-i18n-id'),'privacy.title','The policy is available even when analytics is disabled');
const first=await mount();
assert.equal(first.ui.dialog.open,true);assert.equal(first.ui.dialog.modal,false,'First choice must not trap the model controls');
assert.equal(first.calls.some(([event])=>event==='allow'),false,'No implicit opt-in');
const firstActions=first.ui.dialog.children.find(node=>node.className==='usage-statistics-actions').children;
firstActions[0].click();assert.equal(statisticsConsent(first.storage),'granted');assert.equal(first.ui.dialog.open,false);
assert.equal(JSON.parse(first.values.get(statisticsConsentKey)).version,statisticsConsentVersion);
assert.equal(first.calls.filter(([event])=>event==='allow').length,1);
first.ui.open.click();assert.equal(first.ui.dialog.modal,true);
firstActions[1].click();assert.equal(statisticsConsent(first.storage),'denied');assert.equal(first.calls.at(-1)[0],'deny');
assert.deepEqual(first.cookies,['_ga=; Max-Age=0; Path=/3d-print-rig/; Secure; SameSite=Lax','_ga_ABC1234567=; Max-Age=0; Path=/3d-print-rig/; Secure; SameSite=Lax']);
assert.equal(first.cookies.some(value=>value.includes('Domain=')),false,'Never expire a parent-domain cookie belonging to another project');

for(const privacy of [false,true]){
 const f=await mount({choice:'granted',privacy});
 assert.equal(f.ui.dialog.open,false);
 assert.equal(f.calls.some(([event])=>event==='allow'),!privacy);
 assert.equal(f.ui.dialog.children.find(node=>node.className==='usage-statistics-actions').children[0].disabled,privacy);
}
const embedded=await mount({embedded:true});assert.equal(embedded.ui,null);assert.deepEqual(embedded.calls,[]);
const review=await mount({choice:'granted',excluded:true});
assert.equal(review.calls.some(([event])=>event==='allow'),false);
assert.equal(review.session.get(statisticsReviewKey),'off');
review.window.location.href=config.productionOrigin+config.basePath+'viewer/toolheads.html';
review.setupUsageStatistics(new Element('div'),{...review,config});
assert.equal(review.calls.some(([event])=>event==='allow'),false,'The review exclusion survives a route without the query marker');
const crossTab=await mount({choice:'granted'});
storeStatisticsConsent(crossTab.storage,'denied');
const storageEvent=new Event('storage');Object.defineProperty(storageEvent,'key',{value:statisticsConsentKey});
crossTab.window.dispatchEvent(storageEvent);
assert.equal(crossTab.calls.at(-1)[0],'deny','Withdrawal in another tab must stop the active tab');
const reportOnly=await mount({}, {...config,measurementId:null,publicReportUrl:report});
assert.deepEqual(reportOnly.calls,[]);assert.equal(reportOnly.ui.dialog.children[2].href,report);
assert.equal(reportOnly.ui.dialog.children[2].rel,'noopener noreferrer');
const blocked=await mount({storageBlocked:true});
blocked.ui.dialog.children.find(node=>node.className==='usage-statistics-actions').children[0].click();
blocked.setupUsageStatistics(new Element('div'),{...blocked,config});
assert.equal(blocked.calls.at(-2)[0],'allow','The current visit retains the explicit choice if storage is unavailable');
assert.equal(blocked.document.head.children.length,1,'Repeated workspace mounting must not duplicate the stylesheet');

for(const language of supportedLanguages){
 await loadLanguage(language);
 for(const key of ['title','description','public_report','report_pending','allow','deny','google_privacy','enabled','disabled','privacy_signal','excluded']){
  const value=formatMessage('statistics.'+key,{},language);
  assert.equal(typeof value,'string');assert.ok(value.length>0&&!value.includes('statistics.'+key));
  if(!['ja'].includes(language))assert.doesNotMatch(value,/[\u3040-\u30ff]/u);
 }
}
console.log('Usage statistics UI: public URL boundaries, explicit consent/revoke, scoped cookies, privacy signals, embedding, blocked storage and five languages passed. No real telemetry sent.');
