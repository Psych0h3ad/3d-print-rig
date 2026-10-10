import assert from 'node:assert/strict';
import {setupLanguage,loadLanguage} from '../site/viewer/i18n.mjs';

// Model real, queued cross-document StorageEvents, including older values
// delivered after a later write. A received event must not generate new writes.
class Element extends EventTarget {
 constructor(tag='DIV'){super();this.tagName=tag;this.nodeType=1;this.childNodes=[];this.attrs=new Map();this.isConnected=true}
 append(...nodes){for(const node of nodes){node.parentElement=this;this.childNodes.push(node)}}
 prepend(node){node.parentElement=this;this.childNodes.unshift(node)}
 setAttribute(key,value){this.attrs.set(key,value)}
 getAttribute(key){return this.attrs.get(key)??null}
 hasAttribute(key){return this.attrs.has(key)}
 closest(){return this.attrs.get('data-i18n')==='off'?this:null}
 contains(node){return this.childNodes.includes(node)||this.childNodes.some(child=>child.nodeType===1&&child.contains(node))}
}
class Observer {observe(){}disconnect(){}takeRecords(){return []}}
class DetailEvent extends Event {constructor(type,options={}){super(type);this.detail=options.detail}}
const key='3d-print-rig-language',values=new Map(),windows=[],queue=[],writes=[];
function makeWindow(query=''){
 const window=new EventTarget();window.location={href:'https://example.test/viewer/?'+query};
 window.navigator={languages:['en']};window.MutationObserver=Observer;window.CustomEvent=DetailEvent;
 window.history={replaceState(_state,_title,url){window.location.href=String(url)}};
 window.localStorage={getItem:k=>values.get(k)??null,setItem(k,value){
  const oldValue=values.get(k)??null;values.set(k,String(value));writes.push({window,key:k,value});
  if(oldValue!==String(value))for(const other of windows)if(other!==window)queue.push(()=>{
   const event=new Event('storage');Object.assign(event,{key:k,oldValue,newValue:String(value),storageArea:other.localStorage});other.dispatchEvent(event);
  });
 }};windows.push(window);return window;
}
function setup(window,load=loadLanguage){
 const body=new Element('BODY'),header=new Element(),text={nodeType:3,nodeValue:'構成'};body.append(header,text);
 const document={body,documentElement:{},getElementById:()=>null,createElement:tag=>new Element(tag.toUpperCase()),querySelector:selector=>selector==='.header-actions'?header:null};
 return {controller:setupLanguage({document,window,load}),text,window,select:header.childNodes[0].childNodes[1]};
}
async function flush(){
 let count=0;while(queue.length){assert(++count<=100,'Cross-tab language notifications must settle without an echo loop');queue.shift()();await Promise.resolve()}
 await Promise.resolve();return count;
}
await Promise.all(['es','ko','ru'].map(loadLanguage));
values.set(key,'ja');
const pinned=setup(makeWindow('lang=en')),linked=setup(makeWindow('lang=ru')),automatic=setup(makeWindow()),legacy=makeWindow();
await Promise.all([pinned.controller.ready,linked.controller.ready,automatic.controller.ready]);
assert.equal(writes.length,0,'Opening a translated/share URL must not overwrite the preference of other tabs');
assert.equal(linked.text.nodeValue,'Конфигурация');assert.equal(automatic.controller.language,'ja');

// Delayed obsolete events and many tabs must settle at the latest stored value.
legacy.localStorage.setItem(key,'es');legacy.localStorage.setItem(key,'ko');legacy.localStorage.setItem(key,'en');
const writesBefore=writes.length;await flush();
assert.equal(writes.length,writesBefore,'Received preferences are applied without writing them back');
assert.equal(automatic.controller.language,'en');assert.equal(automatic.text.nodeValue,'Configuration');
assert.equal(pinned.controller.language,'en');assert.equal(linked.controller.language,'ru','An explicit URL language stays local to that tab');
assert.equal(new URL(linked.window.location.href).searchParams.get('lang'),'ru');

// A real dropdown choice saves the default once, and then stays pinned.
automatic.select.value='ja';automatic.select.dispatchEvent(new Event('change'));await flush();
assert.equal(values.get(key),'ja');assert.equal(writes.length,writesBefore+1);assert.equal(automatic.text.nodeValue,'構成');
legacy.localStorage.setItem(key,'ko');await flush();assert.equal(automatic.controller.language,'ja');

// Unpinned pages load the stored dictionary without rebroadcasting it.
const pending=new Map(),delayed=setup(makeWindow(),language=>new Promise(resolve=>pending.set(language,resolve)));
assert.equal(delayed.controller.language,'ko');
legacy.localStorage.setItem(key,'es');await flush();assert.equal(delayed.controller.language,'es');
pending.get('ko')();await delayed.controller.ready;assert.equal(delayed.controller.language,'es');
pending.get('es')();await Promise.resolve();await Promise.resolve();assert.equal(delayed.text.nodeValue,'Configuración');

// Wrong storage areas, removed/invalid values, and a disposed viewer are inert.
const invalid=new Event('storage');Object.assign(invalid,{key,newValue:'ja',storageArea:{}});delayed.window.dispatchEvent(invalid);
assert.equal(delayed.controller.language,'es');
delayed.controller.disconnect();legacy.localStorage.setItem(key,'en');await flush();
assert.equal(delayed.controller.language,'es');await delayed.controller.setLanguage('ja');assert.equal(delayed.controller.language,'es');
for(const item of [pinned,linked,automatic])item.controller.disconnect();
console.log('Queued language preferences settle without storage echoes; URL/user choices, delayed dictionaries and disposed viewers remain stable.');
