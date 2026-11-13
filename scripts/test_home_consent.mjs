import assert from 'node:assert/strict';
import fs from 'node:fs';
import {setupHomeConsent} from '../site/home/consent.mjs';
import {startHomeAnalytics} from '../site/home/usage.mjs';
import {homeMessages} from '../site/home/locale-data.mjs';
import {statisticsConsentKey,statisticsReviewKey,statisticsConsent,statisticsConsentLifetime,storeStatisticsConsent} from '../site/viewer/statistics-preference.mjs';
const origin='https://psych0h3ad.github.io',base='/3d-print-rig/',id='G-SEV0T0PFTB';
const cases=[];
const test=(name,run)=>{run();cases.push(name);};
let now=Date.now();const realNow=Date.now;Date.now=()=>now;
const savedFetch=globalThis.fetch;let network=0;
globalThis.fetch=()=>{network++;throw Error('Live telemetry forbidden in fixtures');};
class Element extends EventTarget{
 constructor(tag,document){super();this.tagName=tag.toUpperCase();this.ownerDocument=document;this.children=[];this.attributes=new Map();this.open=false;this.disabled=false;this.textContent='';}
 append(...nodes){for(const node of nodes){this.children.push(node);node.parent=this;}}
 appendChild(node){this.append(node);if(node.tagName==='SCRIPT')this.ownerDocument.requests.push(node.src);return node;}
 setAttribute(k,v){this.attributes.set(k,String(v));}
 getAttribute(k){return this.attributes.get(k)??null;}
 showModal(){assert(!this.open,'Native dialog cannot be shown twice');this.open=true;this.modal=true;}
 close(){this.open=false;}
 focus(){this.ownerDocument.activeElement=this;}
 click(){if(!this.disabled)this.dispatchEvent(new Event('click'));}
 remove(){if(this.parent)this.parent.children=this.parent.children.filter(n=>n!==this);}
}
function fixture({choice=null,query='',privacy={},iframe=false,local=false,blockedStorage=false,readOnly=false,sharedStorage=null,sharedSession=null,language='en'}={}){
 const values=sharedStorage??new Map(),session=sharedSession??new Map(),cookies=[],timers=new Map();let nextTimer=0;
 const storage={getItem:k=>values.get(k)??null,setItem:(k,v)=>{if(readOnly)throw Error('Read-only storage');values.set(k,v);}};
 if(choice)storeStatisticsConsent({setItem:(k,v)=>values.set(k,v)},choice);
 const document={requests:[],documentElement:{lang:language}};
 document.createElement=tag=>new Element(tag,document);document.head=document.createElement('head');document.body=document.createElement('body');document.footer=document.createElement('div');document.body.append(document.footer);
 document.querySelector=selector=>selector==='.footer-links'?document.footer:selector.startsWith('script[')?document.head.children.find(n=>n.tagName==='SCRIPT')??null:null;
 Object.defineProperty(document,'cookie',{set:value=>cookies.push(value)});
 const window=new EventTarget();window.self=window;window.top=iframe?{}:window;
 window.location={href:(local?'http://127.0.0.1:8080':origin)+base+query};window.navigator={...privacy};
 Object.defineProperty(window,'localStorage',{get(){if(blockedStorage)throw Error('Storage blocked');return storage;}});
 window.sessionStorage={getItem:k=>session.get(k)??null,setItem:(k,v)=>session.set(k,v)};
 window.setTimeout=(fn,delay)=>{const key=++nextTimer;timers.set(key,{fn,delay});return key;};window.clearTimeout=key=>timers.delete(key);
 const analytics=startHomeAnalytics({window,document});
 let lang=language;const ui=setupHomeConsent({window,document,analytics,copy:()=>homeMessages[lang]});
 const buttons=ui?.dialog.children.find(n=>n.className==='usage-statistics-actions').children;
 return {window,document,analytics,ui,values,storage,session,cookies,timers,buttons,
  setLanguage(value){lang=value;document.documentElement.lang=value;ui.render();},
  load(){document.head.children.find(n=>n.tagName==='SCRIPT')?.onload?.();},
  commands(){return [...(window.dataLayer??[])].map(args=>[...args]);},
  storageChanged(key=statisticsConsentKey){const e=new Event('storage');e.key=key;window.dispatchEvent(e);},
  hide(persisted=false){const e=new Event('pagehide');e.persisted=persisted;window.dispatchEvent(e);},
 };
}
try{
test('first visit opens a named modal before any Google request',()=>{
 const f=fixture({query:'?lang=en&configuration=secret#private'});assert(f.ui.dialog.open&&f.ui.dialog.modal);assert.equal(f.analytics.choice,null);assert.deepEqual(f.document.requests,[]);assert.equal(f.window.gtag,undefined);assert.equal(f.window.dataLayer,undefined);
 const [heading,description]=f.ui.dialog.children;assert.equal(f.ui.dialog.getAttribute('aria-labelledby'),heading.id);assert.equal(f.ui.dialog.getAttribute('aria-describedby'),description.id);assert.equal(f.document.activeElement,heading);
 assert.deepEqual(f.buttons.slice(0,2).map(b=>b.textContent),[homeMessages.en.statisticsDeny,homeMessages.en.statisticsAllow]);f.hide();
});
test('refusal persists, footer reopens, grant alone loads the tag and sends a sanitized single view',()=>{
 const f=fixture({query:'?private=secret#secret'});f.buttons[0].click();assert.equal(statisticsConsent(f.storage),'denied');assert(!f.ui.dialog.open);assert.deepEqual(f.document.requests,[]);
 f.ui.open.click();f.ui.open.click();assert(f.ui.dialog.open);f.buttons[1].click();assert.equal(statisticsConsent(f.storage),'granted');assert(!f.ui.dialog.open);assert.deepEqual(f.document.requests,['https://www.googletagmanager.com/gtag/js?id='+id]);
 f.load();const events=f.commands().filter(c=>c[0]==='event');assert.equal(events.length,1);assert.equal(events[0][1],'page_view');assert.equal(events[0][2].page_location,origin+base);assert.equal(events[0][2].page_referrer,'');assert.equal(events[0][2].page_title,'3D Print Rig');assert(!JSON.stringify(f.commands()).includes('secret'));
 f.ui.open.click();f.buttons[0].click();assert.equal(f.window['ga-disable-'+id],true);assert(f.cookies.slice(-2).every(c=>c.includes('Max-Age=0; Path='+base)));f.ui.open.click();f.buttons[1].click();f.load();assert.equal(f.document.requests.length,1);assert.equal(f.commands().filter(c=>c[0]==='event').length,0,'Withdrawal clears queued commands; re-grant must not duplicate the already-sent root view');f.hide();
});
test('existing grants and refusals suppress the initial prompt and share the viewer record',()=>{
 for(const choice of ['granted','denied']){const f=fixture({choice});assert.equal(f.analytics.choice,choice);assert(!f.ui.dialog.open);assert.equal(f.document.requests.length,choice==='granted'?1:0);f.hide();}
});
test('closing or Escape never supplies consent; settings can reopen the choice',()=>{
 for(const escape of [false,true]){const f=fixture();if(escape){f.ui.dialog.dispatchEvent(new Event('cancel'));f.ui.dialog.close();}else f.buttons[2].click();assert.equal(f.analytics.choice,null);assert(!f.values.has(statisticsConsentKey));assert.deepEqual(f.document.requests,[]);f.ui.open.click();assert(f.ui.dialog.open);f.hide();}
});
test('six languages keep the same dialog and focus and preserve the privacy route',()=>{
 const f=fixture();const heading=f.document.activeElement,dialog=f.ui.dialog;
 for(const language of ['en','ja','es','ko','ru','de']){f.setLanguage(language);assert.equal(f.ui.dialog,dialog);assert.equal(f.document.activeElement,heading);assert.equal(heading.textContent,homeMessages[language].statisticsTitle);assert.equal(f.buttons[1].textContent,homeMessages[language].statisticsAllow);const policy=dialog.children.find(n=>n.tagName==='A');assert.equal(new URL(policy.href).searchParams.get('lang'),language);assert.equal(new URL(policy.href).pathname.split('/').at(-1),'privacy.html');}
 assert.deepEqual(f.document.requests,[]);f.hide();
});
test('expired, changed-version and malformed consent prompt again without loading Google',()=>{
 for(const mode of ['expired','version','malformed']){const values=new Map();storeStatisticsConsent({setItem:(k,v)=>values.set(k,v)},'granted');const record=JSON.parse(values.get(statisticsConsentKey));if(mode==='expired'){record.createdAt=now-statisticsConsentLifetime-1;record.expiresAt=now-1;}else record.version='old';values.set(statisticsConsentKey,mode==='malformed'?'broken':JSON.stringify(record));const f=fixture({sharedStorage:values});assert(f.ui.dialog.open);assert.equal(f.analytics.choice,null);assert.deepEqual(f.document.requests,[]);f.hide();}
});
test('cross-tab allow/deny/removal closes resolved prompts and revokes future measurement',()=>{
 const f=fixture();storeStatisticsConsent(f.storage,'granted');f.storageChanged();assert(!f.ui.dialog.open);f.load();assert.equal(f.document.requests.length,1);storeStatisticsConsent(f.storage,'denied');f.storageChanged();assert.equal(f.analytics.choice,'denied');assert.equal(f.window['ga-disable-'+id],true);f.values.delete(statisticsConsentKey);f.storageChanged(null);assert.equal(f.analytics.choice,null);assert.equal(f.window['ga-disable-'+id],true);f.ui.open.click();assert(f.ui.dialog.open);f.hide();
});
test('unavailable or read-only storage respects each explicit choice during this visit',()=>{
 for(const options of [{blockedStorage:true},{readOnly:true},{choice:'granted',readOnly:true}]){const f=fixture(options);f.ui.open.click();f.buttons[0].click();assert.equal(f.analytics.choice,'denied');assert.equal(f.window['ga-disable-'+id],true);f.ui.open.click();f.buttons[1].click();assert.equal(f.analytics.choice,'granted');f.load();assert.equal(f.document.requests.length,1);f.ui.open.click();f.buttons[0].click();assert.equal(f.analytics.choice,'denied');f.hide();}
});
test('review query, latched session, automation and privacy signals never prompt or grant',()=>{
 for(const options of [{query:'?analytics=off'},{privacy:{webdriver:true}},{privacy:{globalPrivacyControl:true}},{privacy:{doNotTrack:'1'}},{privacy:{msDoNotTrack:'1'}},{sharedSession:new Map([[statisticsReviewKey,'off']])}]){const f=fixture({...options,choice:'granted'});assert(!f.ui.dialog.open);assert(f.analytics.blocked);assert.deepEqual(f.document.requests,[]);f.ui.open.click();assert(f.buttons[1].disabled);assert.equal(f.analytics.choose('granted'),false);assert.deepEqual(f.document.requests,[]);if(f.analytics.excluded){const policy=f.ui.dialog.children.find(n=>n.tagName==='A');assert.equal(new URL(policy.href).searchParams.get('analytics'),'off');}f.hide();}
 const f=fixture();f.window.doNotTrack='1';f.window.dispatchEvent(new Event('pageshow'));assert(f.analytics.blocked);assert(f.buttons[1].disabled);f.hide();
});
test('local preview and embedded entry never request telemetry or automatically prompt',()=>{
 const local=fixture({local:true,choice:'granted'});assert(!local.ui.dialog.open);assert.deepEqual(local.document.requests,[]);local.hide();const embed=fixture({iframe:true,choice:'granted'});assert.equal(embed.ui,null);assert.deepEqual(embed.document.requests,[]);embed.hide();
});
test('grant expiry revokes measurement in a still-open visit',()=>{
 const f=fixture();f.buttons[1].click();f.load();const timer=[...f.timers.values()][0];assert(timer);now+=statisticsConsentLifetime+1;timer.fn();assert.equal(f.analytics.choice,null);assert.equal(f.window['ga-disable-'+id],true);assert(f.cookies.slice(-2).every(c=>c.includes('Max-Age=0')));f.hide();
});
test('BFCache retains state; terminal navigation removes UI, timers and listeners',()=>{
 const f=fixture();f.hide(true);assert(f.document.body.children.includes(f.ui.dialog));f.hide();assert(!f.document.body.children.includes(f.ui.dialog));assert(!f.document.footer.children.includes(f.ui.open));assert.equal(f.timers.size,0);assert.equal(f.analytics.choose('granted'),false);storeStatisticsConsent(f.storage,'granted');f.storageChanged();assert.deepEqual(f.document.requests,[]);
});
test('a grant made here cannot override a cross-tab refusal when returning from BFCache',()=>{
 const f=fixture();f.buttons[1].click();f.load();f.hide(true);
 storeStatisticsConsent(f.storage,'denied');f.window.dispatchEvent(new Event('pageshow'));
 assert.equal(f.analytics.choice,'denied');assert.equal(f.window['ga-disable-'+id],true);assert.equal(f.document.requests.length,1);f.hide();
});
test('localized labels reuse the existing approved statistics messages',()=>{
 const root=new URL('../',import.meta.url),source=JSON.parse(fs.readFileSync(new URL('localization/source.json',root),'utf8')).entries;
 const keys={statisticsTitle:'statistics.title',statisticsDescription:'statistics.description',statisticsAllow:'statistics.allow',statisticsDeny:'statistics.deny',statisticsClose:'text.1234',statisticsEnabled:'statistics.enabled',statisticsDisabled:'statistics.disabled',statisticsExcluded:'statistics.excluded',statisticsPrivacySignal:'statistics.privacy_signal'};
 for(const lang of Object.keys(homeMessages)){const locale=['en','ja'].includes(lang)?null:JSON.parse(fs.readFileSync(new URL('localization/'+lang+'.json',root),'utf8')).messages;for(const [key,id]of Object.entries(keys))assert.equal(homeMessages[lang][key],locale?locale[id].text:source[id][lang]);}
 const html=fs.readFileSync(new URL('site/index.html',root),'utf8');assert(/rel="stylesheet" href="\.\/viewer\/usage-statistics\.css(?:\?v=[a-f0-9]+)?"/u.test(html));
});
assert.equal(network,0);console.log(JSON.stringify({passed:true,cases,languages:6,transport:'production consent controller and GA core with inert script elements; real network forbidden',browser:false,wholeMachineFit:false,peak_rss_bytes:process.resourceUsage().maxRSS*1024}));
}finally{Date.now=realNow;globalThis.fetch=savedFetch;}
