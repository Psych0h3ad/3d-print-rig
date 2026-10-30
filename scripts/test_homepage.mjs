import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {homeMessages} from '../site/home/locale-data.mjs';
import {legacyViewerURL,homeDestination} from '../site/home/home.mjs';
import {startHomeAnalytics} from '../site/home/usage.mjs';
import {storeStatisticsConsent,statisticsConsentKey} from '../site/viewer/statistics-preference.mjs';
const root=new URL('../site/',import.meta.url),read=name=>fs.readFileSync(new URL(name,root),'utf8');
const html=read('index.html');
const css=read('home/home.css');
const destinations=[
 {art:'machine-art',file:'machine-render.webp',href:'./viewer/machines.html',note:false},
 {art:'plan-art',file:'layout-render.webp',href:'./layout/',note:true},
 {art:'component-art',file:'toolhead-render.webp',href:'./viewer/components.html',note:false},
];
const attributes=tag=>Object.fromEntries([...(tag.match(/^<[^>]+>/u)?.[0]??tag).matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/gu)].map(m=>[m[1],m[3]]));
const hasClass=(tag,name)=>(attributes(tag).class??'').split(/\s+/u).includes(name);
const cards=[...html.matchAll(/<article\b[^>]*>[\s\S]*?<\/article>/giu)].map(m=>m[0]).filter(card=>hasClass(card.match(/^<article\b[^>]*>/iu)[0],'destination'));
assert.equal(cards.length,3,'exactly three destination cards');
for(const [i,{art,file,href,note}]of destinations.entries()){
 const card=cards[i],artwork=[...card.matchAll(/<a\b[^>]*>[\s\S]*?<\/a>/giu)].map(m=>m[0]).filter(a=>hasClass(a.match(/^<a\b[^>]*>/iu)[0],'destination-art'));
 assert.equal(artwork.length,1,file+' artwork slot');
 assert(hasClass(artwork[0],art),file+' destination order');
 assert.equal(attributes(artwork[0]).href,href,file+' artwork destination');
 assert(!/<(?:svg|canvas|object|iframe|picture|source)\b/iu.test(card),file+' must use the rendered img, without schematic/replacement artwork');
 const images=[...card.matchAll(/<img\b[^>]*>/giu)].map(m=>attributes(m[0]));
 assert.equal(images.length,1,file+' one actual img');
 assert(artwork[0].includes('<img'),file+' image inside artwork link');
 assert.equal(images[0].src,'./home/'+file);
 assert.equal(images[0].width,'1200');assert.equal(images[0].height,'750');
 assert(images[0].alt?.trim(),file+' accessible image description');
 assert.equal(images[0].loading,'lazy');
 const footers=[...card.matchAll(/<div\b[^>]*>[\s\S]*?<\/div>/giu)].map(m=>m[0]).filter(div=>hasClass(div.match(/^<div\b[^>]*>/iu)[0],'destination-footer'));
 assert.equal(footers.length,1,file+' shared footer slot');
 const links=[...footers[0].matchAll(/<a\b[^>]*>/giu)].map(m=>m[0]).filter(a=>hasClass(a,'destination-link'));
 assert.equal(links.length,1);assert.equal(attributes(links[0]).href,href);
 const notes=[...footers[0].matchAll(/<span\b[^>]*>[\s\S]*?<\/span>/giu)].map(m=>m[0]).filter(span=>hasClass(span.match(/^<span\b[^>]*>/iu)[0],'platform'));
 assert.equal(notes.length,1,file+' reserved note space');
 if(note)assert.equal(attributes(notes[0])['data-home-copy'],'desktop');
 else {assert.equal(attributes(notes[0])['aria-hidden'],'true');assert(!attributes(notes[0])['data-home-copy']);assert(/^(?:\s|&nbsp;|&#160;|\u00a0)*$/u.test(notes[0].replace(/<[^>]*>/gu,'')),file+' empty note placeholder');}
}
const rules=[...css.matchAll(/([^{}]+)\{([^{}]*)\}/gu)].map(([,selector,body])=>({selectors:selector.trim().split(',').map(s=>s.trim()),body}));
function declarations(selector){return rules.filter(rule=>rule.selectors.includes(selector)).map(rule=>rule.body).join(';');}
assert(/aspect-ratio\s*:\s*(?:16\s*\/\s*10|8\s*\/\s*5|1200\s*\/\s*750)\s*(?:;|$)/u.test(declarations('.destination-art')),'shared 1200:750 artwork aspect ratio');
assert(/display\s*:\s*flex\s*(?:;|$)/u.test(declarations('.destination'))&&/flex-direction\s*:\s*column\s*(?:;|$)/u.test(declarations('.destination')),'cards stack flexibly');
assert(/margin-top\s*:\s*auto\s*(?:;|$)/u.test(declarations('.destination-footer')),'footer anchors below variable translated copy');
assert(/min-height\s*:\s*(?:[1-9][\d.]*|0\.\d*[1-9]\d*)(?:px|rem|em)\s*(?:;|$)/u.test(declarations('.platform')),'all cards reserve note height');
assert(/object-fit\s*:\s*contain\s*(?:;|$)/u.test(declarations('.destination-art img')),'do not crop rendered printer/toolhead');
assert(css.includes(':root[data-theme=dark]'),'shared dark theme styles');
assert(/setupHeaderThemeToggle\(document\.querySelector\('\.header-tools'\)/u.test(read('home/home.mjs')),'shared theme control setup');
assert(read('viewer/display-preferences.mjs').includes('3d-print-rig-display-v1'),'shared persisted theme preference');
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

assert(html.includes('./home/trident-render.webp'));
assert(!html.includes('03-trident-paper-3840x2160.webp'));
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('home/trident-render.webp',root))).digest('hex'),'f10dab7a570a9b2afc5c0abd47ce0727fcf69ff90eb8a5f27a35d9267c268291');
const gallery=JSON.parse(read('assets/machines/index.json'));
const thumb=gallery.machines.find(r=>r.id==='voron_trident_350');
assert.equal(createHash('sha256').update(fs.readFileSync(new URL('assets/machines/'+thumb.thumbnail,root))).digest('hex'),thumb.thumbnail_sha256);
assert.equal(thumb.page,'./trident.html');
// Read only image headers and source metadata: no model loading or renderer.
function webpDimensions(data){
 assert.equal(data.toString('ascii',0,4),'RIFF','WebP RIFF signature');
 assert.equal(data.toString('ascii',8,12),'WEBP','WebP signature');
 assert.equal(data.readUInt32LE(4)+8,data.length,'complete WebP container');
 let dimensions,canvas;
 for(let offset=12;offset<data.length;){
  assert(offset+8<=data.length,'complete WebP chunk header');
  const kind=data.toString('ascii',offset,offset+4),size=data.readUInt32LE(offset+4),start=offset+8,end=start+size;
  assert(end+(size%2)<=data.length,'complete WebP chunk');
  if(kind==='VP8X'){assert.equal(size,10);assert(!(data[start]&2),'static homepage render');assert(!(data[start]&0x10),'opaque RGB homepage canvas');canvas=[data.readUIntLE(start+4,3)+1,data.readUIntLE(start+7,3)+1];}
  if(kind==='VP8 '){assert(size>=10);assert.deepEqual([...data.subarray(start+3,start+6)],[0x9d,0x01,0x2a]);assert(!dimensions,'one WebP image');dimensions=[data.readUInt16LE(start+6)&0x3fff,data.readUInt16LE(start+8)&0x3fff];}
  if(kind==='VP8L'){assert(size>=5);assert.equal(data[start],0x2f);assert(!dimensions,'one WebP image');const bits=data.readUInt32LE(start+1);assert.equal(bits>>>29,0);assert(!(bits&(1<<28)),'opaque RGB homepage canvas');dimensions=[(bits&0x3fff)+1,((bits>>>14)&0x3fff)+1];}
  assert(!['ANIM','ANMF'].includes(kind),'no animated homepage render');
  offset=end+(size%2);
 }
 assert(dimensions,'actual WebP image bitstream');if(canvas)assert.deepEqual(canvas,dimensions,'canvas and bitstream agree');return dimensions;
}
const provenanceFile=new URL('home/render-scenes.json',root);
assert(fs.existsSync(provenanceFile),'asset-wait: home/render-scenes.json is required; missing assets never pass');
assert(fs.statSync(provenanceFile).size<=256*1024,'bounded render provenance');
const provenance=JSON.parse(fs.readFileSync(provenanceFile,'utf8'));
assert.equal(provenance.schema,'3d-print-rig-home-render-scenes-v1');
assert.deepEqual(provenance.dimensions,[1200,750]);assert.equal(provenance.background,'#d5d6d7');
assert(Array.isArray(provenance.scenes));assert.equal(provenance.scenes.length,3,'one provenance scene per destination');
const registeredMachines=new Set(gallery.machines.map(row=>row.id));
const headCatalog=JSON.parse(read('TOOLHEAD_CONFIGURATIONS.json'));
const registeredHeads=new Set(headCatalog.variants.map(row=>row.id));
const renderEvidence=[];
for(const {file}of destinations){
 const url=new URL('home/'+file,root);assert(fs.existsSync(url),'asset-wait: home/'+file+' is required');
 const size=fs.statSync(url).size;assert(size>20&&size<=8*1024*1024,file+' bounded image size');
 const data=fs.readFileSync(url),dimensions=webpDimensions(data),sha256=createHash('sha256').update(data).digest('hex');
 assert.deepEqual(dimensions,[1200,750],file+' actual WebP dimensions');
 const matches=provenance.scenes.filter(row=>row.file===file);
 assert.equal(matches.length,1,file+' unique output provenance row');
 const row=matches[0];assert.equal(row.id,file.replace('-render.webp',''));
 assert.equal(row.sha256,sha256,file+' output SHA256 matches actual bytes');assert.equal(row.bytes,size);
 assert.deepEqual([row.width,row.height],dimensions,file+' metadata and actual dimensions agree');
 assert.match(row.source_revision,/^[a-f\d]{40}$/u,file+' immutable source revision');
 assert.match(row.source_image_sha256,/^[a-f\d]{64}$/u,file+' source image receipt');
 assert.match(row.renderer,/WebGL/u,file+' renderer provenance');
 if(row.id==='toolhead')assert(registeredHeads.has(row.configuration),file+' exact registered head configuration');
 else {assert(Array.isArray(row.machine_ids)&&row.machine_ids.length>0,file+' registered machine identities');for(const id of row.machine_ids)assert(registeredMachines.has(id),file+' unknown machine '+id);}
 if(row.id==='machine'){
  const source=JSON.parse(read('home/trident-render.json'));
  assert.deepEqual(row.machine_ids,[source.machine]);assert.equal(row.configuration,source.configuration);
  assert.equal(row.source_revision,source.sourceRevision);assert.equal(row.source_image_sha256,source.outputSha256);
  assert.deepEqual(row.source_image_dimensions,source.dimensions);
 }
 renderEvidence.push({file:'home/'+file,bytes:size,dimensions,sha256,machines:row.machine_ids??[],configuration:row.configuration??null,source_revision:row.source_revision});
}
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
console.log(JSON.stringify({passed:true,languages:6,home_module_bytes:bytes,local_links:true,thumbnail_pin:true,deep_links:true,theme_source:true,destination_cards:3,render_provenance_sha256:createHash('sha256').update(fs.readFileSync(provenanceFile)).digest('hex'),renders:renderEvidence,peak_rss_bytes:process.resourceUsage().maxRSS*1024,consent:'shared record, initial choice, withdrawal and review latch; fake tracker only',scope:'Homepage source/routing/consent fixtures and WebP headers/hashes/registered scene metadata; no browser, live telemetry, render reproduction or model-fit claim'}));
