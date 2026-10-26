import assert from 'node:assert/strict';
import {setupLanguage,loadLanguage,messageIdFor,formatMessage} from '../site/viewer/i18n.mjs';
class Element extends EventTarget{
 constructor(tag='DIV'){super();this.nodeType=1;this.tagName=tag;this.childNodes=[];this.attrs=new Map();this.isConnected=true;}
 append(...nodes){for(const n of nodes){n.parentElement=this;this.childNodes.push(n);}}
 prepend(n){n.parentElement=this;this.childNodes.unshift(n);}
 setAttribute(k,v){this.attrs.set(k,v);}getAttribute(k){return this.attrs.get(k)??null;}hasAttribute(k){return this.attrs.has(k);}
 closest(){return this.attrs.get('data-i18n')==='off'?this:null;}
 contains(n){return n===this||this.childNodes.some(c=>c===n||c.nodeType===1&&c.contains(n));}
}
class Observer{observe(){}disconnect(){}takeRecords(){return [];}}
const labels=['Printer','Toolhead','Gantry','Export image','Share','Settings category','Configuration','Appearance','Motion','References','Controls guide','Project sponsor'];
function fixture(load){
 const body=new Element('BODY'),nodes=labels.map(label=>({nodeType:3,nodeValue:label}));body.append(...nodes);
 const canvas=new Element('CANVAS');body.append(canvas);
 const events=[];const win={location:{href:'https://example.test/viewer/community.html?machine=kept&lang=en'},
  navigator:{languages:['en']},localStorage:{getItem:()=>null,setItem(){}},history:{replaceState(){}},MutationObserver:Observer,
  CustomEvent:class{constructor(type,values){this.type=type;Object.assign(this,values);}},addEventListener(){},dispatchEvent(e){events.push(e);}};
 const doc={body,documentElement:{lang:'en'},getElementById:()=>null,createElement:tag=>new Element(tag.toUpperCase()),querySelector:()=>null};
 const controller=setupLanguage({document:doc,window:win,load});return {controller,doc,events,nodes,canvas};
}
for(const language of ['es','ko','ru','de']){
 let release;const f=fixture(()=>new Promise(resolve=>{release=async()=>{await loadLanguage(language);resolve();};}));
 const before=f.nodes.map(n=>n.nodeValue),change=f.controller.setLanguage(language);
 assert.equal(f.doc.documentElement.lang,'en');assert.deepEqual(f.nodes.map(n=>n.nodeValue),before);
 assert.equal(f.events.length,0,'Source controls must not change ahead of the shared dictionary');
 await release();await change;
 assert.equal(f.doc.documentElement.lang,language);assert.equal(f.events.length,1);
 for(let i=0;i<labels.length;i++){const id=messageIdFor(labels[i]);assert(id,labels[i]);assert.equal(f.nodes[i].nodeValue,formatMessage(id,{},language));}
 assert.strictEqual(f.doc.body.childNodes.at(-1),f.canvas,'Language switch replaced the existing viewport');
 await f.controller.setLanguage('ja');assert.equal(f.doc.documentElement.lang,'ja');f.controller.disconnect();
}
let release;const disposed=fixture(()=>new Promise(resolve=>release=resolve));
const waiting=disposed.controller.setLanguage('ru');disposed.controller.disconnect();release();await waiting;assert.equal(disposed.events.length,0);
console.log(JSON.stringify({passed:true,shared_labels:labels.length,languages:['es','ko','ru','de'],pending_dictionary_keeps_committed_UI:true,
 source_event_after_dictionary_only:true,existing_canvas_preserved:true,disposed_request_suppressed:true,
 scope:'Real shared language controller and central stable catalog with deliberately delayed dictionaries. Browser model/rendering evidence is separate.'}));
