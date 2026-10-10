import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {setupWorkspaceDestinationLanguages} from '../site/viewer/workspace-ui.mjs';
import {activateScope,WorkspaceScope} from '../site/viewer/workspace-lifecycle.mjs?v=823ad76bd9034ec8d6ff';
import {chooseLanguage,languageURL,supportedLanguages,languageNames} from '../site/viewer/languages.mjs';

// Optional candidate source keeps an out-of-scope gallery repair reviewable
// before it is applied. Without it, test the actual shipped gallery module.
const args=process.argv.slice(2);
assert(args.length===0 || (args.length===2 && args[0]==='--fun-source'), 'Usage: node scripts/test_workspace_destinations.mjs [--fun-source path]');
const [workspaceSource,shippedFun,funHTML]=await Promise.all([
  fs.readFile(new URL('../site/viewer/workspace-ui.mjs',import.meta.url),'utf8'),
  fs.readFile(new URL('../site/fun/fun.mjs',import.meta.url),'utf8'),
  fs.readFile(new URL('../site/fun/index.html',import.meta.url),'utf8'),
]);
const funSource=args.length?await fs.readFile(args[1],'utf8'):shippedFun;
assert.match(workspaceSource,/setupLanguage\(\);\s*setupWorkspaceDestinationLanguages\(\[\.\.\.navigation\.querySelectorAll\('a'\),\s*\.\.\.menu\.querySelectorAll\('a'\),\s*credits\]\)/,
  'Bind every navigation/menu destination and credits after the initial language is chosen');

const pending=[];
class Observer {
  static instances=[];
  constructor(callback){this.callback=callback;this.targets=new Set();Observer.instances.push(this)}
  observe(target){this.targets.add(target)}
  disconnect(){this.targets.clear()}
  takeRecords(){return []}
  static changed(target){for(const observer of Observer.instances)if(observer.targets.has(target)&&!pending.includes(observer))pending.push(observer)}
}
function flush(){let count=0;while(pending.length){assert(++count<=100,'Destination observers must settle without an href echo loop');pending.shift().callback([])}}
class Element extends EventTarget {
  constructor(tag='div',base=()=>globalThis.location.href){super();this.tagName=tag.toUpperCase();this.base=base;this.children=[];this.attrs=new Map();this.textContent=''}
  append(...nodes){this.children.push(...nodes)}
  replaceChildren(...nodes){this.children=[...nodes]}
  setAttribute(name,value){const next=String(value);if(this.attrs.get(name)!==next){this.attrs.set(name,next);if(name==='href')Observer.changed(this)}}
  getAttribute(name){return this.attrs.get(name)??null}
  hasAttribute(name){return this.attrs.has(name)}
  set href(value){this.setAttribute('href',value)}
  get href(){return new URL(this.getAttribute('href')||'',this.base()).href}
  get options(){return this.children}
  set value(value){this.selectedValue=this.tagName==='SELECT'&&!this.options.some(option=>option.value===String(value))?'':String(value)}
  get value(){return this.selectedValue??this.children[0]?.value??''}
}
function select(values,base){const element=new Element('select',base);for(const value of values){const option=new Element('option',base);option.value=value;element.append(option)}return element}
const root='https://example.test/3d-print-rig/',viewer=root+'viewer/';
const destinations=[
  ['printer','./trident.html?machine=siboor_trident_350&configuration=installed&lang=ja#assembly'],
  ['toolhead','./toolheads.html?configuration=xol_rapido&return_machine=siboor_trident_350&return_configuration=installed#head'],
  ['gantry','./gantries.html'],['fun','../fun/'],['support','../support/?machine=siboor_trident_350'],
  ['components','./components.html'],['changers','./toolchangers.html'],['e3ng','./e3ng.html'],['credits','./art/credits.html'],
];
let destinationChecks=0;
for(const language of supportedLanguages){
  globalThis.location={href:viewer+'trident.html?machine=siboor_trident_350&lang='+language};
  globalThis.document={documentElement:{lang:'ja'}};
  globalThis.window=new EventTarget();globalThis.MutationObserver=Observer;
  const scope=new WorkspaceScope();activateScope(scope);
  const links=destinations.map(([id,href])=>{const link=new Element('a');link.id=id;link.href=href;return link});
  const originals=links.map(link=>new URL(link.href));
  const untouched=['https://github.com/Psych0h3ad/3d-print-rig','https://www.x.com/YuTR0N','#inspectorTabs','../downloads/model.step',''];
  const exclusions=untouched.map(href=>{const link=new Element('a');link.href=href;if(href.endsWith('.step'))link.setAttribute('download','');return link});
  setupWorkspaceDestinationLanguages([...links,...exclusions]);
  function check(expected){
    for(const [index,link]of links.entries()){
      const url=new URL(link.href),original=originals[index];
      assert.equal(url.searchParams.get('lang'),expected,`${link.id}: ${expected}`);
      assert.equal(url.pathname,original.pathname);assert.equal(url.hash,original.hash);
      for(const [key,value]of original.searchParams)if(key!=='lang')assert.equal(url.searchParams.get(key),value,`${link.id} keeps ${key}`);
      destinationChecks++;
    }
    assert.deepEqual(exclusions.map(link=>link.getAttribute('href')),untouched,'Social, fragment, download and empty links retain their destinations');
  }
  check(language);
  for(const next of [...supportedLanguages,...supportedLanguages.toReversed(),language]){
    location.href=languageURL(location.href,next);
    window.dispatchEvent(new Event('rig-language-change'));flush();check(next);
  }
  // A late controller update must retain its complete selection and return URL.
  links[1].href='./toolheads.html?configuration=rapido_x_uhf&return_machine=siboor_trident_350&return_configuration=reversed&lang=ja#underside';
  flush();
  const updated=new URL(links[1].href);
  assert.equal(updated.searchParams.get('lang'),language);
  assert.equal(updated.searchParams.get('configuration'),'rapido_x_uhf');
  assert.equal(updated.searchParams.get('return_configuration'),'reversed');assert.equal(updated.hash,'#underside');
  scope.dispose();const stopped=links[3].href;
  location.href=languageURL(location.href,language==='en'?'ja':'en');window.dispatchEvent(new Event('rig-language-change'));flush();
  assert.equal(links[3].href,stopped,'Disposed workspaces no longer update destinations');activateScope(undefined);
}
for(const [query,documentLanguage,expected]of [['','es-MX','es'],['lang=invalid','RU-ru','ru'],['','invalid','en']]){
  globalThis.location={href:viewer+'?'+query};globalThis.document={documentElement:{lang:documentLanguage}};globalThis.window=new EventTarget();
  const scope=new WorkspaceScope();activateScope(scope);const link=new Element('a');link.href='../fun/';setupWorkspaceDestinationLanguages([link]);
  assert.equal(new URL(link.href).searchParams.get('lang'),expected);scope.dispose();activateScope(undefined);
}

// Execute the gallery source locally with a fixture catalog; no browser,
// network fetch, CAD loading or native-model job is involved.
async function gallery(source,{href,stored,browser='ja-JP',blockedStorage=false}={}){
  const loc={href:href||root+'fun/?format=phone&palette=graphite&kind=section#collection',get search(){return new URL(this.href).search}};
  const base=()=>loc.href,elements=new Map(),anchors=Array.from({length:3},()=>{const link=new Element('a',base);link.href='../viewer/';return link});
  const picker=select([...funHTML.match(/<select id="language"[^>]*>([\s\S]*?)<\/select>/)[1].matchAll(/<option value="([^"]+)"/g)].map(match=>match[1]),base);
  elements.set('language',picker);
  const form=new Element('form',base);form.elements={format:select(['phone','desktop','ultrawide'],base),palette:select(['paper','blueprint','graphite'],base),kind:select(['all','collection','pattern','assembly','exploded','section'],base)};elements.set('filters',form);
  const doc={documentElement:{lang:'en'},getElementById(id){if(!elements.has(id))elements.set(id,new Element('div',base));return elements.get(id)},
    createElement:tag=>new Element(tag,base),createDocumentFragment:()=>new Element('fragment',base),querySelector:()=>new Element('nav',base),
    querySelectorAll:selector=>selector==='a[href="../viewer/"]'?anchors.filter(link=>link.getAttribute('href')==='../viewer/'):[]};
  doc.getElementById('back').textContent='Open viewer ↗';doc.getElementById('error').hidden=true;
  let preference=stored;const writes=[];
  const win={localStorage:{getItem(){if(blockedStorage)throw Error('Storage blocked');return preference},setItem(key,value){if(blockedStorage)throw Error('Storage blocked');preference=value;writes.push([key,value])}},addEventListener(){}};
  const context={document:doc,window:win,location:loc,navigator:{language:browser},history:{replaceState(_state,_title,url){loc.href=String(url)}},
    URL,URLSearchParams,chooseLanguage,languageURL,supportedLanguages,languageNames,applyDisplay(){},displayKey:'display',setupHeaderThemeToggle(){},matchMedia:()=>({matches:false}),
    FormData:class{constructor(value){this.values=Object.entries(value.elements).map(([key,input])=>[key,input.value])}[Symbol.iterator](){return this.values[Symbol.iterator]()}},
    fetch:async path=>{assert.equal(path,'./wallpapers.json');return {ok:true,json:async()=>({packs:[],wallpapers:[{series:'toolhead-field',palette:'paper',format:'desktop',kind:'collection',preview:'fixture.svg',sources:[],width:100,height:100,bytes:1,no:1,download:'fixture.png',title:'Fixture'}]})}}};
  const executable=source.replace(/^import .*;\r?\n/gm,'');
  const result=await vm.runInNewContext(`(async()=>{${executable}\nreturn {language,ja};})()`,context,{filename:'fun-language-fixture.mjs',timeout:1000});
  assert.equal(doc.getElementById('error').hidden,true,'The fixture gallery completes its filter update');
  return {result,loc,picker,anchors,doc,writes,get preference(){return preference}};
}
const baseline=[];
if(args.length){
  const automatic=await gallery(shippedFun);baseline.push({query:null,browser:'ja-JP',selected:automatic.result.language});
  for(const language of ['es','ko','ru']){
    const page=await gallery(shippedFun,{href:root+'fun/?lang='+language});
    baseline.push({query:language,picker:page.picker.value,returnLanguage:new URL(page.anchors[0].href).searchParams.get('lang')});
  }
}
let galleryChecks=0,toggleChecks=0;
function checkGallery(page,language){
  assert.equal(page.result.language,language);assert.equal(page.picker.value,language,'The gallery picker keeps the viewer language');
  assert.equal(page.result.ja,language==='ja','A Japanese browser must not force non-Japanese links into Japanese');
  assert.equal(new URL(page.loc.href).searchParams.get('lang'),language);
  // Copy is English for the three languages without a gallery dictionary.
  assert.equal(page.doc.documentElement.lang,language==='ja'?'ja':'en');
  if(language!=='ja')assert.equal(page.doc.getElementById('back').textContent,'Open viewer ↗');
  for(const link of page.anchors){assert.equal(new URL(link.href).pathname,'/3d-print-rig/viewer/');assert.equal(new URL(link.href).searchParams.get('lang'),language);galleryChecks++}
}
for(const language of supportedLanguages){
  let page=await gallery(funSource,{href:root+'fun/?lang='+language+'&format=phone&palette=graphite&kind=section#collection',stored:'ja'});
  checkGallery(page,language);assert.equal(page.writes.length,0,'Opening a gallery URL does not overwrite preferences');
  assert.deepEqual(page.picker.options.map(option=>option.value),supportedLanguages);
  for(const next of [...supportedLanguages,...supportedLanguages.toReversed(),language]){
    page.picker.value=next;page.picker.onchange();
    assert.equal(new URL(page.loc.href).searchParams.get('lang'),next);
    assert.equal(page.preference,next);assert.deepEqual(page.writes,[['3d-print-rig-language',next]]);
    for(const [key,value]of [['format','phone'],['palette','graphite'],['kind','section']])assert.equal(new URL(page.loc.href).searchParams.get(key),value);
    assert.equal(new URL(page.loc.href).hash,'#collection');
    page=await gallery(funSource,{href:page.loc.href,stored:page.preference});checkGallery(page,next);toggleChecks++;
  }
  const preferred=await gallery(funSource,{stored:language});checkGallery(preferred,language);assert.equal(preferred.writes.length,0);
}
checkGallery(await gallery(funSource),'en');
checkGallery(await gallery(funSource,{href:root+'fun/?lang=invalid',stored:'ko'}),'ko');
const blocked=await gallery(funSource,{href:root+'fun/?lang=ru',blockedStorage:true});checkGallery(blocked,'ru');
blocked.picker.value='es';blocked.picker.onchange();assert.equal(new URL(blocked.loc.href).searchParams.get('lang'),'es');
console.log(JSON.stringify({status:'pass',languages:supportedLanguages,destinationChecks,galleryReturnChecks:galleryChecks,toggleChecks,
  funSource:args[1]||'site/fun/fun.mjs',baseline,scope:'Automated URL/DOM fixtures only; no browser, network, CAD or native-solid checks.'},null,2));
