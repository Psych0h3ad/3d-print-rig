import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync,gzipSync} from 'node:zlib';
import vm from 'node:vm';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const {enumerateV0,buildSupport,portableSupportGzip}=await import('./build_support_catalog.mjs');
for(const decoded of [Buffer.alloc(0),Buffer.from('{"language":"日本語 / Español / 한국어 / Русский"}\n'),Buffer.from(Array.from({length:1024},(_,i)=>i%256))]){
 const platformEncoder=os=>(bytes,options)=>{const result=Buffer.from(gzipSync(bytes,options));result[9]=os;return result;};
 const linux=portableSupportGzip(decoded,platformEncoder(3)),windows=portableSupportGzip(decoded,platformEncoder(10));
 assert.deepEqual(linux,windows,'Platform metadata must not change stored bytes or catalog checksums');
 assert.equal(linux[9],255,'Use the portable unknown OS marker');
 assert.deepEqual(gunzipSync(linux),decoded,'Normalization must preserve the complete decoded payload');
 assert.deepEqual(linux.subarray(10),gzipSync(decoded,{level:9}).subarray(10),'Deflate payload, CRC and length must remain exact');
}
const {readV0ModsURL}=await import('../site/viewer/v0-state.mjs');
import {configurationId,matchingRows,rowSelection,supportSelection,supportURL} from '../site/support/model.mjs';
import {machineChoices} from '../site/viewer/machines.js';
const v0=enumerateV0({options:[{slot:'toolhead',id:'test-head',label:'Test',requires:{strain_relief:'stock'}},{slot:'strain_relief',id:'test-mount',label:'Test'}]});
assert(v0.variants.some(v=>v.toolhead==='test-head'));
assert(!v0.variants.some(v=>v.toolhead==='test-head'&&v.strain_relief==='test-mount'));
const fixture={dimensions:['toolhead','extruder'],options:{toolhead:[{id:'a'},{id:'b'}],extruder:[{id:'c'},{id:'d'}]},idParts:['installed','a','b'],rows:[[[0,1],0,0,0],[[0,2],1,1,0]]};
assert.equal(matchingRows(fixture,{toolhead:'a',extruder:'d'}).length,0,'Unsupported combinations must not silently resolve to another part');
assert.equal(matchingRows(fixture,{toolhead:'a',extruder:'d'},'extruder').length,1);
for(const value of ['unregistered-head','Peregrine / not registered','<not-an-option>','__proto__','constructor','toString','a&extruder=d#?+%/日本語',' ']){
 const query=new URLSearchParams({lang:'ja',machine:'toolheads',toolhead:value,extruder:'c',unrelated:'ignored'});
 const selection=supportSelection(fixture,query);
 assert.deepEqual(selection,{toolhead:value,extruder:'c'},'URL filters must retain absent source options rather than select unrelated assemblies');
 assert.equal(matchingRows(fixture,selection).length,0);
 const restored=supportSelection(fixture,new URLSearchParams({lang:'ru',machine:'toolheads',...selection}));
 assert.deepEqual(restored,selection,'Language/URL reconstruction must preserve a rejected option');
 assert.equal(matchingRows(fixture,restored).length,0);
 assert.equal(matchingRows(fixture,{...restored,toolhead:'a'}).length,1,'An explicit valid replacement can recover');
 assert.equal(matchingRows(fixture,supportSelection(fixture,'')).length,2,'Only an explicit filter reset clears the request');
}
assert.deepEqual(supportSelection(fixture,'?toolhead=&extruder=c'),{extruder:'c'});
assert.deepEqual(supportSelection(fixture,'?toolhead=__proto__&toolhead=a&__proto__=polluted&constructor=ignored'),{toolhead:'__proto__'},'Extra query keys and duplicate later values must not replace the requested part');
assert.equal(Object.getPrototypeOf(supportSelection(fixture,'?toolhead=__proto__')),Object.prototype);
assert.equal(Object.prototype.polluted,undefined);
assert.equal(configurationId(fixture,fixture.rows[0]),'installed__a');
const link=supportURL({id:'test',page:'./trident.html',kind:'machine'},fixture,fixture.rows[0],'https://example.test/rig/support/','ja');
assert.equal(new URL(link).searchParams.get('configuration'),'installed__a');
assert.equal(new URL(link).pathname,'/rig/viewer/trident.html');
const v0URL=new URL(supportURL({id:'v0',page:'./v0.html',kind:'v0'},fixture,fixture.rows[0],'https://example.test/rig/support/','ja'));
assert(!v0URL.searchParams.has('configuration'));assert.deepEqual(JSON.parse(v0URL.searchParams.get('v0_mods')),rowSelection(fixture,fixture.rows[0]));
// Exercise the actual page restore/render path, not only its filter helper.
const {translate,loadLanguage}=await import('../site/viewer/i18n.mjs');
export async function supportPageFixture(source,catalog,language,{toolhead='peregrine',extraQuery={}}={}){
 const elements=new Map();
 class Element{
  constructor(tag){this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs=new Map();this._text='';this.value='';this.hidden=false;this.classList={toggle(){}};}
  set id(id){this._id=id;elements.set(id,this)}get id(){return this._id}
  append(...nodes){this.children.push(...nodes)}replaceChildren(...nodes){this.children=[];this._text='';this.append(...nodes)}
  set textContent(value){this._text=String(value);this.children=[]}get textContent(){return this._text+this.children.map(n=>n.textContent||'').join('')}
  get childElementCount(){return this.children.length}setAttribute(k,v){this.attrs.set(k,String(v))}removeAttribute(k){this.attrs.delete(k)}scrollIntoView(){}
 }
 const ids=['error','heads','headCoverage','extraBody','extras','filters','results','resultCount','empty','more','catalog','download','target','targetSummary','reset','chooseTitle','stats','release','machineRows'];
 for(const id of ids){const e=new Element('div');e.id=id;}
 let url=new URL('https://example.test/support/?'+new URLSearchParams({machine:'toolheads',lang:language,...extraQuery,toolhead}));
 const location={get href(){return url.href},get search(){return url.search}},history={replaceState(_a,_b,value){url=new URL(value,url)}};
 const languageState={language},window=new EventTarget(),errors=[];
 const index={targets:[{id:'toolheads',label:'Toolheads',page:'./toolheads.html',status:'standalone',kind:'standalone',file:'toolheads.json',count:catalog.rows.length}],head_families:[],resources:{'toolheads.json':{}},model_bundle:{url:'https://example.test/releases/tag/fixed/models.zip'}};
 const context=vm.createContext({URL,URLSearchParams,Blob,Option:class extends Element{constructor(text,value){super('option');this.textContent=text;this.value=value}},window,location,history,
  document:{getElementById:id=>elements.get(id),createElement:tag=>new Element(tag),querySelector:()=>new Element('div')},
  setupLanguage:()=>languageState,setupHeaderThemeToggle(){},translate,formatMessage:()=>'',matchingRows,supportSelection,supportURL,
  readSupportJSON:async name=>structuredClone(name==='index.json'?index:catalog),supportDownloadBlob:data=>new Blob([JSON.stringify(data)]),
  console:{error:e=>errors.push(e)}});
 await new vm.Script('(async()=>{'+source.replace(/^import[^\n]*\n/gmu,'')+'\n})()').runInContext(context);
 assert.deepEqual(errors,[],'Actual support page initialization failed');
 return {elements,get href(){return url.href},languageState,changeLanguage(value){languageState.language=value;window.dispatchEvent(new Event('rig-language-change'))}};
}
const supportPage=fs.readFileSync(new URL('../site/support/support.mjs',import.meta.url),'utf8');
const pageCatalog={...fixture,id:'toolheads',notes:[[]],options:Object.fromEntries(Object.entries(fixture.options).map(([key,rows])=>[key,rows.map(row=>({...row,label:row.id}))]))};
for(const language of ['en','ja','es','ko','ru']){
 await loadLanguage(language);const page=await supportPageFixture(supportPage,pageCatalog,language),ids=page.elements;
 assert.equal(new URL(page.href).searchParams.get('toolhead'),'peregrine','Page must not erase an unsupported request');
 assert.equal(ids.get('filter-toolhead').value,'peregrine');assert.equal(ids.get('results').children.length,0);assert.equal(ids.get('empty').hidden,false);
 assert(ids.get('filter-toolhead').children.some(o=>o.value==='peregrine'&&o.textContent===translate('CAD未登録',language)+' · peregrine'));
 page.changeLanguage('ja');assert.equal(new URL(page.href).searchParams.get('toolhead'),'peregrine');assert.equal(ids.get('results').children.length,0);
 ids.get('filter-toolhead').value='a';ids.get('filter-toolhead').onchange();assert.equal(ids.get('results').children.length,1);
 ids.get('filter-toolhead').value='b';ids.get('filter-toolhead').onchange();assert.equal(ids.get('results').children.length,1);
 ids.get('filter-toolhead').value='a';ids.get('filter-toolhead').onchange();assert.equal(ids.get('results').children.length,1);
 ids.get('reset').onclick();assert(!new URL(page.href).searchParams.has('toolhead'));assert.equal(ids.get('results').children.length,2);
}
for(const token of ['__proto__','constructor','toString','<img src=x onerror=ignored>','a&extruder=d#?+%/日本語']){
 const page=await supportPageFixture(supportPage,pageCatalog,'en',{toolhead:token,extraQuery:JSON.parse('{"__proto__":"polluted","constructor":"ignored"}')});
 assert.equal(new URL(page.href).searchParams.get('toolhead'),token);assert.equal(page.elements.get('filter-toolhead').value,token);
 assert.equal(page.elements.get('results').children.length,0);assert(!new URL(page.href).searchParams.has('__proto__'));
 assert.equal(Object.prototype.polluted,undefined,'Unknown source IDs and URL tokens must remain plain text values');
}
if(process.argv[2]){
 const {index,details}=buildSupport(process.argv[2]);
 const delivery=process.argv[3]?JSON.parse(fs.readFileSync(path.join(process.argv[3],'index.json'),'utf8')):null;
 if(delivery){const {resources,...semantic}=delivery;assert.deepEqual(semantic,JSON.parse(JSON.stringify(index)),'Published machine index must match production composition');assert.deepEqual(Object.keys(resources).sort(),[...details.keys()].sort(),'Every registered report needs an exact delivery resource');}
 assert.deepEqual(index.targets.filter(m=>m.kind!=='standalone').map(m=>m.id).sort(),machineChoices.map(m=>m.id).sort());
 let rows=0;
 for(const target of index.targets){
  if(!target.file){assert(['stock','missing'].includes(target.status));continue}
  const c=details.get(target.file),ids=new Set();assert.equal(c.rows.length,target.count);
  if(target.id==='ender3_stock_220'){
   assert.equal(target.kind,'community');assert.equal(c.rows.length,8);assert.deepEqual(c.dimensions,['toolhead','zdrive','probe']);
   for(const row of c.rows){const url=new URL(supportURL(target,c,row,'https://fixture.test/support/','en'));assert.equal(url.searchParams.get('machine'),target.id);assert.equal(url.searchParams.get('configuration'),configurationId(c,row));}
  }
  const tuples=new Set();
  for(const row of c.rows){const id=configurationId(c,row);assert(!ids.has(id));ids.add(id);const selected=rowSelection(c,row);assert(Object.values(selected).every(Boolean));assert(c.notes[row.at(-1)]);tuples.add(JSON.stringify(selected));rows++}
  assert.equal(tuples.size,c.rows.length,'Display rows must retain every differentiating dimension');
  if(target.kind==='v0'){assert(c.mods.some(m=>!m.options.length));assert(c.mods.some(m=>m.options.length));assert(!matchingRows(c,{toolhead:'dragon-burner-revo-sherpa',strain_relief:'picobilical-plate'}).length);const registry=JSON.parse(fs.readFileSync(path.join(process.argv[2],'V0_INSTALLATIONS.json'),'utf8')).machines[target.id];for(const row of c.rows){const selected=rowSelection(c,row),url=supportURL(target,c,row,'https://fixture.test/support/','en');assert.deepEqual(readV0ModsURL(url,{machine_id:target.id,registry}),selected,'Every real V0 support link must restore its complete selected Mod tuple');}}
  if(target.id.startsWith('voron_trident_')){assert(target.heads.includes('sphinx'));assert(c.options.gantry.some(g=>g.id.startsWith('monolith_')));assert(c.banks.filter(b=>b.system==='stealthchanger').every(b=>!b.choices))}
  assert(c.banks.filter(b=>b.system==='madmax').every(b=>b.permitted===false),'A disabled single-tool state is not a registered dock');
  if(delivery){const resource=delivery.resources[target.file],stored=fs.readFileSync(path.join(process.argv[3],resource.file)),decoded=gunzipSync(stored);assert.equal(stored[9],255,'Every delivered report must use the portable gzip OS marker');assert.deepEqual(stored,portableSupportGzip(decoded),'Published compression must match the exact canonical producer');assert.equal(resource.file,target.file+'.gz');assert.equal(resource.encoding,'gzip');assert.equal(stored.length,resource.bytes);assert.equal(decoded.length,resource.decoded_bytes);assert.equal(createHash('sha256').update(stored).digest('hex'),resource.sha256);assert.equal(createHash('sha256').update(decoded).digest('hex'),resource.decoded_sha256);assert.equal(decoded.toString('utf8'),JSON.stringify(c)+'\n','Published report must match current composition rules: '+target.id);assert(!fs.existsSync(path.join(process.argv[3],target.file)),'Generated plain duplicate must not consume deployment capacity');}
 }
 console.log(JSON.stringify({targets:index.targets.length,rows,all_registered_configurations_checked:true}));
}
console.log('Support index: strict filtering, V0 dependencies, exact links and machine coverage passed.');
