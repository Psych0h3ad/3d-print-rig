// Minimal event/DOM interface fixture, not a browser/XML parser implementation.
// Raw markup insertion and network access are intentionally unavailable.
import assert from 'node:assert/strict';
const NS='http://www.w3.org/2000/svg';
export function fixtureDOM(){
  const created=[];let doc,xmlRoot,parseCalls=0;
  class Element{
    constructor(tag,ns=null){this.tagName=tag;this.localName=tag;this.namespaceURI=ns;this.children=[];this.dataset={};this.attributes={};this.listeners=new Map();this.style={};this.className='';this.disabled=false;this.value='';this._text='';this.open=false;this.classList={add:(...n)=>this.className+=' '+n.join(' ')};created.push(this)}
    set textContent(v){this._text=String(v);this.children=[]}get textContent(){return this._text+this.children.map(c=>c.textContent).join('')}
    set innerHTML(_value){throw Error('Raw HTML insertion forbidden')}
    get valueAsNumber(){if(!/^-?(?:\d+(?:\.\d*)?|\.\d+)(?:[eE][+-]?\d+)?$/.test(String(this.value)))return NaN;return Number(this.value)}
    checkValidity(){if(this.disabled)return true;if(this.required&&String(this.value)==='')return false;if(this.type!=='number')return true;const n=this.valueAsNumber;return Number.isFinite(n)&&(this.min===undefined||n>=Number(this.min))&&(this.max===undefined||n<=Number(this.max))}
    setAttribute(k,v){this.attributes[k]=String(v)}
    append(...items){for(const item of items){item.parent=this;this.children.push(item)}}
    replaceChildren(...items){for(const c of this.children)c.parent=null;this.children=[];this.append(...items)}
    addEventListener(k,f,options){const a=this.listeners.get(k)||[];a.push({f,once:options?.once});this.listeners.set(k,a)}
    emit(k,extra={}){const event={target:this,button:0,pointerId:1,preventDefault(){this.defaultPrevented=true},...extra};for(const h of [...(this.listeners.get(k)||[])]){h.f(event);if(h.once)this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==h))}return event}
    click(){if(!this.disabled)this.emit('click')}
    focus(){doc.activeElement=this}
    remove(){if(this.parent)this.parent.children=this.parent.children.filter(x=>x!==this);this.parent=null}
    showModal(){this.open=true}close(){this.open=false;this.emit('close')}
    setPointerCapture(id){this.capture=id}hasPointerCapture(id){return this.capture===id}releasePointerCapture(){this.capture=null}
    getScreenCTM(){return {inverse(){return this}}}
  }
  const descendants=root=>[root,...root.children.flatMap(descendants)];
  doc={activeElement:null,createElement:tag=>new Element(tag),createElementNS:(ns,tag)=>new Element(tag,ns)};
  doc.body=new Element('body');doc.head=new Element('head');doc.querySelector=selector=>{assert.equal(selector,'[data-layout-room-editor-style]');return descendants(doc.head).find(e=>Object.hasOwn(e.dataset,'layoutRoomEditorStyle'))||null};
  class XMLElement{
    constructor(tag,attributes={},children=[]){this.localName=tag;this.namespaceURI=NS;this.children=children;this.data=attributes;this.attributes=Object.entries(attributes).map(([name,value])=>({name,localName:name.split(':').at(-1),prefix:name.includes(':')?name.split(':')[0]:null,value}));this.textContent=''}
    getAttribute(name){return Object.hasOwn(this.data,name)?this.data[name]:null}
    getElementsByTagName(name){return this.children.flatMap(c=>[...(name==='*'||name===c.localName?[c]:[]),...c.getElementsByTagName(name)])}
  }
  const element=(tag,a={},children=[])=>new XMLElement(tag,a,children);
  const XMLParser=class{parseFromString(){parseCalls++;return {documentElement:xmlRoot,childNodes:[],getElementsByTagName:()=>[]}}};
  const install=()=>{globalThis.document=doc;globalThis.DOMParser=XMLParser;globalThis.DOMPoint=class{constructor(x,y){this.x=x;this.y=y}matrixTransform(){return {x:this.x,y:this.y}}}};
  const setXML=(children,attributes={viewBox:'0 0 600 400'})=>xmlRoot=element('svg',attributes,children);
  function editor(){
    const dialog=doc.body.children.find(x=>x.tagName==='dialog');assert.ok(dialog,'Expected room editor dialog');
    const all=()=>descendants(dialog),button=key=>{const b=all().find(x=>x.tagName==='button'&&x.textContent===key);assert.ok(b,key);return b};
    const field=key=>{const l=all().find(x=>x.tagName==='label'&&x.children.some(c=>c.tagName==='span'&&c.textContent===key));assert.ok(l,key);return l.children.find(c=>c.tagName==='input')};
    const svg=all().find(x=>x.namespaceURI===NS&&x.tagName==='svg');
    const points=()=>{const n=svg.children.find(x=>x.tagName==='polygon'||x.tagName==='polyline');return (n?.attributes.points||'').split(' ').filter(Boolean).map(s=>s.split(',').map(Number))};
    const change=(key,value)=>{const f=field(key);f.focus();f.value=String(value);f.emit('change');doc.activeElement=null};
    const press=(x,z,target=svg)=>svg.emit('pointerdown',{clientX:x,clientY:z,target});
    return {dialog,all,button,field,svg,points,change,press};
  }
  return {install,doc,created,element,setXML,editor,get parseCalls(){return parseCalls}};
}
