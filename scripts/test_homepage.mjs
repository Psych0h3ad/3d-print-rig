import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {homeMessages} from '../site/home/locale-data.mjs';
import {legacyViewerURL,homeDestination} from '../site/home/home.mjs';
import {startHomeAnalytics} from '../site/home/usage.mjs';
import {storeStatisticsConsent,statisticsConsentKey} from '../site/viewer/statistics-preference.mjs';
const root=new URL('../site/',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
const html=read('index.html');
assert(!/http-equiv="refresh"/i.test(html));assert(html.includes('<main id="main">'));
for(const key of [...html.matchAll(/data-home-(?:copy|label)="([^"]+)"/gu)].map(m=>m[1]))for(const lang of ['en','ja','es','ko','ru','de'])assert(homeMessages[lang][key],lang+' '+key);
for(const lang of Object.keys(homeMessages))assert.deepEqual(Object.keys(homeMessages[lang]).sort(),Object.keys(homeMessages.en).sort());
const current='https://psych0h3ad.github.io/3d-print-rig/?lang=ja&analytics=off';
for(const href of ['./','./?lang=ja','./?analytics=off#main'])assert.equal(legacyViewerURL(new URL(href,current)),null);
for(const key of ['machine','configuration']){
 const u=new URL('./?'+key+'=a%2Bb&lang=de&analytics=off#bed',current),target=new URL(legacyViewerURL(u.href));
 assert.equal(target.pathname,'/3d-print-rig/viewer/');assert.equal(target.search,u.search);assert.equal(target.hash,u.hash);
}
assert.equal(homeDestination('./layout/',current,'de'),'https://psych0h3ad.github.io/3d-print-rig/layout/?lang=de&analytics=off');
assert.equal(homeDestination('https://example.org/',current,'ja'),'https://example.org/');
for(const href of [...html.matchAll(/(?:href|src)="(\.\/[^"?#]+)(?:[^"\s]*)"/gu)].map(m=>m[1])){
 const name=href.slice(2);assert(fs.existsSync(new URL(name.endsWith('/')?name+'index.html':name,root)),name);
}
const gallery=JSON.parse(read('assets/machines/index.json'));
const thumb=gallery.machines.find(r=>r.id==='voron_trident_350');
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('assets/machines/'+thumb.thumbnail,root))).digest('hex'),thumb.thumbnail_sha256);
assert.equal(thumb.page,'./trident.html');
// Follow the actual home import graph: no catalog/model/Three.js dependency.
const visited=new Set();let bytes=0;
function graph(url){if(visited.has(url.href))return;visited.add(url.href);const text=fs.readFileSync(url,'utf8');bytes+=Buffer.byteLength(text);assert(!/GLTFLoader|three\.module|PUBLIC_CATALOG|fetch\(/u.test(text),url.href);for(const m of text.matchAll(/from\s+['"]([^'"]+)['"]/gu))graph(new URL(m[1],url));}
graph(new URL('home/home.mjs',root));assert(bytes<50000,bytes+' home JS bytes');
// Consent setup uses the shared versioned record and latches review exclusion.
function fixture(choice,query=''){
 const data=new Map(),session=new Map(),calls=[],cookies=[];const storage={getItem:k=>data.get(k)??null,setItem:(k,v)=>data.set(k,v)};
 if(choice)storeStatisticsConsent(storage,choice);
 const window=new EventTarget();Object.assign(window,{location:{href:current.split('?')[0]+query},navigator:{webdriver:false},localStorage:storage,sessionStorage:{getItem:k=>session.get(k),setItem:(k,v)=>session.set(k,v)},clearTimeout(){},setTimeout(){return 1;}});
 const create=options=>{calls.push(['create',options]);return {allow:()=>calls.push(['allow']),deny:()=>calls.push(['deny']),page:()=>calls.push(['page']),dispose:()=>calls.push(['dispose'])};};
 const document={set cookie(value){cookies.push(value)}};
 startHomeAnalytics({window,document},create);return {calls,window,storage,session,cookies,data};
}
for(const choice of [null,'denied']){const f=fixture(choice);assert(!f.calls.some(c=>c[0]==='allow'));assert(f.calls.some(c=>c[0]==='deny'));}
const granted=fixture('granted');assert(granted.calls.some(c=>c[0]==='allow'));
storeStatisticsConsent(granted.storage,'denied');const ev=new Event('storage');ev.key=statisticsConsentKey;granted.window.dispatchEvent(ev);assert.equal(granted.calls.at(-1)[0],'deny');
for(const invalidation of ['removed','expired','version']){
 const f=fixture('granted');
 if(invalidation==='removed')f.data.delete(statisticsConsentKey);
 else {const record=JSON.parse(f.data.get(statisticsConsentKey));if(invalidation==='expired'){record.createdAt=0;record.expiresAt=180*86400000;}else record.version='old-policy';f.data.set(statisticsConsentKey,JSON.stringify(record));}
 const event=new Event('storage');event.key=statisticsConsentKey;f.window.dispatchEvent(event);
 assert.equal(f.calls.at(-1)[0],'deny');assert.equal(f.cookies.length,2,invalidation+' cookie cleanup');assert(f.cookies.every(s=>s.includes('Max-Age=0; Path=/3d-print-rig/')));
}
assert(read('fun/fun.mjs').includes('a.brand[href="../"]'));
assert(read('layout/index.html').includes('href="../viewer/machines.html" data-layout-link data-layout-i18n="layout.machines"'));
assert(read('viewer/workspace-ui.mjs').includes("credits, $('.brand')].filter(Boolean)"));
const excluded=fixture('granted','?analytics=off');assert.equal(excluded.calls[0][1].excluded,true);assert.equal(excluded.session.get('3d-print-rig-analytics-review'),'off');
console.log(JSON.stringify({passed:true,languages:6,home_module_bytes:bytes,local_links:true,thumbnail_pin:true,deep_links:true,consent:'shared record, initial choice, withdrawal and review latch; fake tracker only',scope:'Homepage source/routing/consent fixtures; no live telemetry or model-fit claim'}));
