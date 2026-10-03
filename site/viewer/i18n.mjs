import {messages,templates} from './messages-en.mjs?v=motion-colors-41';

const normalize=text=>text.trim().replace(/\s+/gu,' ');
const escape=text=>text.replace(/[.*+?^${}()|[\]\\]/gu,'\\$&');
const patterns=Object.entries(templates).map(([source,target])=>{
 const keys=[];let last=0,expression='';
 for(const match of source.matchAll(/\{(\d+)\}/gu)){expression+=escape(source.slice(last,match.index))+'(.*?)';keys.push(match[1]);last=match.index+match[0].length}
 expression+=escape(source.slice(last));return {test:new RegExp('^'+expression+'$','u'),keys,target,specificity:source.replace(/\{\d+\}/gu,'').length};
}).sort((a,b)=>b.specificity-a.specificity);
const fragments=Object.keys(messages).filter(s=>s.length>1&&/[\u3040-\u30ff\u3400-\u9fff]/u.test(s)).sort((a,b)=>b.length-a.length);
const fragmentPattern=new RegExp(fragments.map(escape).join('|'),'gu');

export function translate(text,language='en',depth=0){
 if(language!=='en'||typeof text!=='string'||depth>5||!/[\u3040-\u30ff\u3400-\u9fff]/u.test(text))return text;
 const source=normalize(text);let result=Object.hasOwn(messages,source)?messages[source]:undefined;
 if(result===undefined){
  for(const p of patterns){const m=source.match(p.test);if(!m)continue;const values=Object.fromEntries(p.keys.map((key,i)=>[key,translate(m[i+1],'en',depth+1)]));result=p.target.replace(/\{(\d+)\}/gu,(_,key)=>values[key]);break}
 }
 if(result===undefined)result=source.replace(fragmentPattern,key=>messages[key]);
 return text.slice(0,text.indexOf(text.trim()))+result+text.slice(text.indexOf(text.trim())+text.trim().length);
}

export function chooseLanguage({query,stored,languages=[]}={}){
 if(['ja','en'].includes(query))return query;
 if(['ja','en'].includes(stored))return stored;
 return (languages[0]||'en').toLowerCase().startsWith('ja')?'ja':'en';
}
export function languageURL(href,language){const url=new URL(href);if(['ja','en'].includes(language))url.searchParams.set('lang',language);return url.href}

const sourceText=new WeakMap(),sourceAttributes=new WeakMap();
export function originalText(element){
 if(!element)return '';
 if(element.nodeType===3){const s=sourceText.get(element);return s&&element.nodeValue===s.rendered?s.source:element.nodeValue}
 return [...element.childNodes].map(originalText).join('');
}

export function setupLanguage({document=globalThis.document,window=globalThis.window}={}){
 if(!document?.body||document.getElementById('viewerLanguage'))return;
 let stored;try{stored=window.localStorage.getItem('3d-print-rig-language')}catch{}
 let language=chooseLanguage({query:new URL(window.location.href).searchParams.get('lang'),stored,languages:window.navigator.languages||[window.navigator.language]});
 const label=document.createElement('label');label.className='language-picker';label.setAttribute('data-i18n','off');
 const name=document.createElement('span');name.className='language-label';name.textContent='Language / 言語';
 const select=document.createElement('select');select.id='viewerLanguage';select.setAttribute('aria-label','Language / 言語');
 for(const [value,text]of [['ja','日本語'],['en','English']]){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}
 label.append(name,select);document.querySelector('.header-actions')?.prepend(label);
 const attributes=['title','placeholder','aria-label','alt'];
 const excluded=element=>element?.closest('script,style,pre,code,textarea,[contenteditable="true"],[data-i18n="off"],[data-part]');
 let observer,pending=false;const dirty=new Set();
 function localizeLink(element){
  if(element.tagName!=='A'||!element.hasAttribute('href')||element.hasAttribute('download'))return;
  const href=element.getAttribute('href');if(!href||href.startsWith('#'))return;
  let url;try{url=new URL(href,window.location.href)}catch{return}
  if(url.origin!==window.location.origin||!url.pathname.includes('/viewer/')||!(url.pathname.endsWith('/')||url.pathname.endsWith('.html')))return;
  if(url.searchParams.get('lang')!==language)element.setAttribute('href',languageURL(url.href,language));
 }
 function visit(element){
  if(excluded(element))return;
  for(const attr of attributes){
   if(!element.hasAttribute(attr))continue;
   let records=sourceAttributes.get(element);if(!records){records=new Map();sourceAttributes.set(element,records)}
   const current=element.getAttribute(attr),previous=records.get(attr),source=previous&&current===previous.rendered?previous.source:current,rendered=translate(source,language);records.set(attr,{source,rendered});if(current!==rendered)element.setAttribute(attr,rendered);
  }
  localizeLink(element);
  for(const child of element.childNodes){
   if(child.nodeType===1)visit(child);
   else if(child.nodeType===3){const current=child.nodeValue,previous=sourceText.get(child),source=previous&&current===previous.rendered?previous.source:current,rendered=translate(source,language);sourceText.set(child,{source,rendered});if(current!==rendered)child.nodeValue=rendered}
  }
 }
 const observe=()=>observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'href']});
 function refresh(){dirty.clear();observer?.disconnect();visit(document.body);document.documentElement.lang=language;select.value=language;observe()}
 // Motion updates only translate their changed labels, not the whole workbench.
 function schedule(records){
  for(const record of records){
   if(record.type==='childList')for(const added of record.addedNodes)dirty.add(added.nodeType===1?added:added.parentElement);
   else dirty.add(record.target.nodeType===1?record.target:record.target.parentElement);
  }
  if(pending||!dirty.size)return;pending=true;
  queueMicrotask(()=>{pending=false;observer.disconnect();const roots=[...dirty].filter(e=>e?.isConnected);dirty.clear();for(const e of roots)if(!roots.some(parent=>parent!==e&&parent.contains(e)))visit(e);observe()});
 }
 observer=new window.MutationObserver(schedule);
 function setLanguage(value){
  if(!['ja','en'].includes(value))return;
  language=value;try{window.localStorage.setItem('3d-print-rig-language',value)}catch{}
  window.history.replaceState(null,'',languageURL(window.location.href,value));refresh();
  window.dispatchEvent(new window.CustomEvent('rig-language-change',{detail:{language:value}}));
 }
 select.addEventListener('change',()=>setLanguage(select.value));
 window.addEventListener('storage',event=>{if(event.key==='3d-print-rig-language'&&['ja','en'].includes(event.newValue)&&event.newValue!==language)setLanguage(event.newValue)});
 window.history.replaceState(null,'',languageURL(window.location.href,language));
 refresh();return {setLanguage,refresh,get language(){return language},disconnect:()=>observer.disconnect()};
}
