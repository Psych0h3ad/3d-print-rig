import {replaceWorkspaceURL} from './workspace-navigation.mjs?v=5c6f4dcd051bb1336e43';
import {WorkspaceMutationObserver,workspaceListen,onWorkspaceDispose} from './workspace-lifecycle.mjs';
import {supportedLanguages,languageNames,normalizeLanguage,chooseLanguage,languageURL} from './languages.mjs?v=fa521b07d4184ded0146';
import {definitions,localeLoaders} from './locales/manifest.mjs?v=3ae0aa1dfca4d8bc593d';
import {createTranslator} from './translation-engine.mjs?v=59b4da15aa1f296a3647';
export {supportedLanguages,chooseLanguage,languageURL} from './languages.mjs?v=fa521b07d4184ded0146';

const dictionaries=new Map(),loads=new Map();
const translator=createTranslator(definitions,{dictionaries});
export const {messageIdFor,messageSource}=translator;
export const translate=(text,language='en',depth=0)=>translator.translate(text,normalizeLanguage(language)||'en',depth);
export const formatMessage=(id,values={},language='en')=>translator.formatMessage(id,values,normalizeLanguage(language)||'en');
export const translationDiagnostics=()=>({loadedLanguages:['ja','en',...dictionaries.keys()],...translator.diagnostics()});
export function loadLanguage(language){
 const lang=normalizeLanguage(language);if(!lang||['ja','en'].includes(lang))return Promise.resolve();
 if(!loads.has(lang))loads.set(lang,localeLoaders[lang]().then(module=>{dictionaries.set(lang,module.default)}).catch(error=>{loads.delete(lang);throw error}));
 return loads.get(lang);
}

const sourceText=new WeakMap(),sourceAttributes=new WeakMap();
export function originalText(element){
 if(!element)return '';
 if(element.nodeType===3){const s=sourceText.get(element);return s&&element.nodeValue===s.rendered?s.source:element.nodeValue}
 return [...element.childNodes].map(originalText).join('');
}

export function originalAttribute(element,attribute){
 const current=element?.getAttribute(attribute),previous=sourceAttributes.get(element)?.get(attribute);
 return previous&&current===previous.rendered?previous.source:current;
}

export function setupLanguage({document=globalThis.document,window=globalThis.window,load=loadLanguage}={}){
 if(!document?.body||document.getElementById('viewerLanguage'))return;
 let stored;try{stored=window.localStorage.getItem('3d-print-rig-language')}catch{}
 let language=chooseLanguage({query:new URL(window.location.href).searchParams.get('lang'),stored,languages:window.navigator.languages||[window.navigator.language]});
 const label=document.createElement('label');label.className='language-picker';label.setAttribute('data-i18n','off');
 const name=document.createElement('span');name.className='language-label';name.textContent='Language / 言語';
 const select=document.createElement('select');select.id='viewerLanguage';select.setAttribute('aria-label','Language / 言語');
 for(const [value,text]of supportedLanguages.map(value=>[value,languageNames[value]])){const option=document.createElement('option');option.value=value;option.textContent=text;select.append(option)}
 label.append(name,select);document.querySelector('.header-actions')?.prepend(label);
 const attributes=['title','placeholder','aria-label','alt'];
 const excluded=element=>element?.closest('script,style,pre,code,textarea,[contenteditable="true"],[data-i18n="off"],[data-part]');
 let observer,pending=false,disposed=false,generation=0;const dirty=new Set();
 onWorkspaceDispose(()=>{disposed=true;dirty.clear()});
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
  const explicitId=element.getAttribute('data-i18n-id');
  for(const child of element.childNodes){
   if(child.nodeType===1)visit(child);
   else if(child.nodeType===3){const current=child.nodeValue,previous=sourceText.get(child),source=explicitId?messageSource(explicitId):previous&&current===previous.rendered?previous.source:current,rendered=explicitId?formatMessage(explicitId,{},language):translate(source,language);sourceText.set(child,{source,rendered});if(current!==rendered)child.nodeValue=rendered}
  }
 }
 const observe=()=>observer.observe(document.body,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:[...attributes,'href']});
 function refresh(){dirty.clear();observer?.disconnect();visit(document.body);const title=document.querySelector('title');if(title)visit(title);document.documentElement.lang=language;select.value=language;select.setAttribute('aria-label',formatMessage('ui.language',{},language));name.textContent=formatMessage('ui.language',{},language);observe()}
 // Motion updates only translate their changed labels, not the whole workbench.
 function collect(records){
  for(const record of records){
   if(record.type==='childList')for(const added of record.addedNodes)dirty.add(added.nodeType===1?added:added.parentElement);
   else dirty.add(record.target.nodeType===1?record.target:record.target.parentElement);
  }
 }
 function schedule(records){
  collect(records);
  if(pending||!dirty.size)return;pending=true;
  queueMicrotask(()=>{if(disposed)return;pending=false;collect(observer.takeRecords());observer.disconnect();const roots=[...dirty].filter(e=>e?.isConnected);dirty.clear();for(const e of roots)if(!roots.some(parent=>parent!==e&&parent.contains(e)))visit(e);observe()});
 }
 observer=new WorkspaceMutationObserver(schedule,window.MutationObserver);
 async function setLanguage(value){
  const lang=normalizeLanguage(value);if(!lang)return;
  language=lang;const request=++generation;
  try{window.localStorage.setItem('3d-print-rig-language',lang)}catch{}
  replaceWorkspaceURL(null,'',languageURL(window.location.href,lang),window.history);refresh();
  window.dispatchEvent(new window.CustomEvent('rig-language-change',{detail:{language:lang}}));
  if(['ja','en'].includes(lang))return;
  try{await load(lang);if(disposed||request!==generation)return;refresh();window.dispatchEvent(new window.CustomEvent('rig-language-change',{detail:{language:lang}}))}
  catch(error){if(!disposed&&request===generation)console.warn('Translation dictionary unavailable; current English text is retained.',error)}
 }
 select.addEventListener('change',()=>setLanguage(select.value));
 workspaceListen(window,'storage',event=>{if(event.key==='3d-print-rig-language'&&normalizeLanguage(event.newValue)&&event.newValue!==language)setLanguage(event.newValue)});
 replaceWorkspaceURL(null,'',languageURL(window.location.href,language),window.history);
 refresh();const ready=['ja','en'].includes(language)?Promise.resolve():setLanguage(language);return {setLanguage,refresh,ready,get language(){return language},disconnect:()=>{disposed=true;generation++;observer.disconnect()}};
}
