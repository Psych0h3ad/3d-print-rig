// Small event/DOM fixture for component logic. It is not browser or visual proof.
export class TestDocument {
  constructor(){this.activeElement=null;this.body=this.createElement('body');}
  createElement(tag){return new Node(this,tag);}
  createElementNS(ns,tag){return this.createElement(tag);}
}
class Node {
  constructor(doc,tag){this.ownerDocument=doc;this.tagName=tag.toUpperCase();this.children=[];this.dataset={};this.attrs=new Map();this.listeners=new Map();this._value='';this._text='';this.className='';this.hidden=false;this.disabled=false;this.classList={add:(...names)=>{this.className=[...new Set([...this.className.split(/\s+/),...names])].join(' ').trim();}};}
  get firstChild(){return this.children[0];}
  get textContent(){return this._text+this.children.map(c=>typeof c==='string'?c:c.textContent).join('');}
  set textContent(v){this._text=String(v);for(const c of this.children)if(typeof c!=='string')c.parentNode=null;this.children=[];}
  get id(){return this._id||'';}set id(v){this._id=v;}
  get value(){if(this.tagName==='SELECT'){return this.options.find(o=>o.selected)?.value||this.options[0]?.value||'';}return this._value;}
  set value(v){if(this.tagName==='SELECT'){for(const o of this.options)o.selected=o.value===String(v);}else this._value=String(v);}
  get valueAsNumber(){return this._value.trim()===''?NaN:Number(this._value);}
  get options(){return this.children.filter(c=>c?.tagName==='OPTION');}
  append(...items){for(const n of items){if(typeof n==='object'){n.remove();n.parentNode=this;}this.children.push(n);}}
  replaceChildren(...items){for(const n of this.children)if(typeof n==='object')n.parentNode=null;this.children=[];this._text='';this.append(...items);}
  remove(){if(this.parentNode){this.parentNode.children=this.parentNode.children.filter(n=>n!==this);this.parentNode=null;}}
  setAttribute(k,v){this.attrs.set(k,String(v));if(k==='id')this.id=String(v);if(k.startsWith('data-'))this.dataset[k.slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())]=String(v);}
  getAttribute(k){return this.attrs.get(k)??null;}
  removeAttribute(k){this.attrs.delete(k);}
  addEventListener(k,fn){if(!this.listeners.has(k))this.listeners.set(k,new Set());this.listeners.get(k).add(fn);}
  removeEventListener(k,fn){this.listeners.get(k)?.delete(fn);}
  dispatch(k){if(this.disabled)return;for(const fn of this.listeners.get(k)||[])fn({target:this,type:k});}
  click(){this.dispatch('click');}
  focus(){this.ownerDocument.activeElement=this;}
  blur(){this.ownerDocument.activeElement=null;this.dispatch('blur');}
  checkValidity(){const n=this.valueAsNumber;return Number.isFinite(n)&&(!this.min||n>=Number(this.min))&&(!this.max||n<=Number(this.max));}
  contains(n){return n===this||this.children.some(c=>typeof c==='object'&&c.contains(n));}
  matches(s){
    if(s.startsWith('#'))return this.id===s.slice(1);
    const match=s.match(/^\[([^=\]]+)(?:=['"]?([^'"\]]+)['"]?)?\]$/);
    if(match){let v;if(match[1].startsWith('data-'))v=this.dataset[match[1].slice(5).replace(/-([a-z])/g,(_,a)=>a.toUpperCase())];else v=this.getAttribute(match[1]);return match[2]===undefined?v!==undefined&&v!==null:v===match[2];}
    return this.tagName===s.toUpperCase();
  }
  querySelectorAll(s){const parts=s.split(',').map(p=>p.trim()),out=[];const walk=n=>{for(const c of n.children)if(typeof c==='object'){if(parts.some(p=>c.matches(p)))out.push(c);walk(c);}};walk(this);return out;}
  querySelector(s){return this.querySelectorAll(s)[0]||null;}
}
