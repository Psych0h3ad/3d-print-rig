// Actual source-body replay and actual localization module; DOM-interface
// fixtures only. Browser rendering and full model loading are separate gates.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import crypto from 'node:crypto';
import {fileURLToPath,pathToFileURL} from 'node:url';
const option=n=>{const i=process.argv.indexOf(n);return i<0?null:process.argv[i+1]};
const site=path.resolve(option('--site')||fileURLToPath(new URL('../site/',import.meta.url)));
const consumed={};
const read=rel=>{const b=fs.readFileSync(path.join(site,rel));consumed[rel]=crypto.createHash('sha256').update(b).digest('hex');return b.toString('utf8')};
const app=read('layout/layout-app.mjs'),renderer=read('layout/layout-renderer.mjs');
read('layout/layout-language.mjs');read('layout/layout-i18n.mjs');
const {setupLayoutLanguage}=await import(pathToFileURL(path.join(site,'layout/layout-language.mjs')));
const {supportedLanguages,t}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const tests=[];async function test(id,fn){await fn();tests.push({id,status:'PASS'})}
const unique=(s,start,end)=>{assert.equal(s.split(start).length,2,'Source boundary must be unique');const i=s.indexOf(start),j=s.indexOf(end,i);assert.ok(j>i);return s.slice(i,j)};
const camel=k=>k.replace(/^data-/,'').replace(/-([a-z])/g,(_,x)=>x.toUpperCase());
class E{
 constructor(tag='div'){this.tagName=tag;this.dataset={};this.attrs={};this.children=[];this.listeners=new Map();this.textContent='';}
 setAttribute(k,v){if(k.startsWith('data-'))this.dataset[camel(k)]=String(v);else this.attrs[k]=String(v)}
 getAttribute(k){return k.startsWith('data-')?this.dataset[camel(k)]??null:this.attrs[k]??null}
 hasAttribute(k){return this.getAttribute(k)!==null}
 append(...items){this.children.push(...items)}replaceChildren(...items){this.children=items}
 addEventListener(k,f){const a=this.listeners.get(k)||[];a.push(f);this.listeners.set(k,a)}
 removeEventListener(k,f){this.listeners.set(k,(this.listeners.get(k)||[]).filter(x=>x!==f))}
 emit(k){for(const f of this.listeners.get(k)||[])f({target:this})}
}
function environment(){
 const canvas=new E('canvas'),hint=new E(),theme=new E('button'),workspace=new E(),appRoot=new E(),orbit=new E('button'),move=new E('button');
 hint.dataset.layoutI18n='layout.sceneHint';orbit.dataset.layoutTool='orbit';move.dataset.layoutTool='move';
 const all=[canvas,hint,theme,workspace,appRoot,orbit,move],byId={'#layout-theme':theme,'#layout-scene-hint':hint,'#layout-app':appRoot,'.layout-workspace':workspace};
 const descendants=n=>[n,...n.children.flatMap(descendants)];
 const doc={documentElement:{dataset:{theme:'light'}},body:new E('body'),title:'',createElement:tag=>{const n=new E(tag);all.push(n);return n},
  querySelector:q=>byId[q]||null,
  querySelectorAll:q=>q==='[data-layout-tool]'?[orbit,move]:q==='[data-layout-link]'?all.filter(n=>Object.hasOwn(n.dataset,'layoutLink')):q.startsWith('[data-layout-i18n]')?[...new Set(all.flatMap(descendants))].filter(n=>Object.keys(n.dataset).some(k=>k.startsWith('layoutI18n'))):[]};
 const store=new Map(),win={location:{href:'https://example.invalid/layout/?lang=en'},localStorage:{getItem:k=>store.get(k)??null,setItem:(k,v)=>store.set(k,v)},history:{state:null,replaceState(_s,_x,url){win.location.href=url}},
  addEventListener(){},removeEventListener(){},dispatchEvent(){},CustomEvent:class{constructor(type,value){this.type=type;Object.assign(this,value)}},
  matchMedia:q=>({matches:q==='(hover: none) and (pointer: coarse)'})};
 return {doc,win,canvas,hint,theme,workspace,appRoot,orbit,move};
}
await test('canvas-aria-label-refreshes-five-languages-through-real-language-module',()=>{
 const e=environment(),source=unique(renderer,'const canvas=renderer.domElement;','container.append(canvas);')+'container.append(canvas);';
 const lang=setupLayoutLanguage({document:e.doc,window:e.win});
 new Function('renderer','container','t',source)({domElement:e.canvas},new E(),key=>lang.t('layout.'+key));
 assert.equal(e.canvas.getAttribute('data-layout-i18n-aria-label'),'layout.sceneLabel');
 for(const code of supportedLanguages){lang.setLanguage(code);assert.equal(e.canvas.getAttribute('aria-label'),t('layout.sceneLabel',{},code));}
 lang.disconnect();
});
await test('chosen-orbit-and-move-hint-survives-real-language-refresh-all-five',()=>{
 const e=environment();let lang;
 const source=unique(app,'  const setTool=tool=>{','\n  for(const e of document.querySelectorAll(\'[data-layout-tool]\'))');
 const update=unique(app,'function updateLanguage(){','\nasync function start(){');
 const factory=new Function('document','$','view','t','getLanguage',`let ui=null;const sync=()=>{throw Error('Unexpected UI mutation')};${source}\n${update.replaceAll('language.refresh()','getLanguage().refresh()')}\nreturn {setTool,updateLanguage};`);
 const calls=[];const replay=factory(e.doc,q=>e.doc.querySelector(q),{setTool:v=>calls.push(v)},(k,p)=>lang.t(k,p),()=>lang);
 lang=setupLayoutLanguage({document:e.doc,window:e.win,onChange:()=>replay.updateLanguage()});
 for(const tool of ['orbit','move','orbit']){
  replay.setTool(tool);assert.equal(e.hint.dataset.layoutI18n,'layout.hint.'+tool);
  for(const code of supportedLanguages){lang.setLanguage(code);assert.equal(e.hint.textContent,t('layout.hint.'+tool,{},code));assert.equal(e.orbit.getAttribute('aria-pressed'),String(tool==='orbit'));assert.equal(e.move.getAttribute('aria-pressed'),String(tool==='move'));}
 }
 assert.deepEqual(calls,['orbit','move','orbit']);lang.disconnect();
});
await test('coarse-only-notice-theme-header-live-with-no-renderer-catalog-or-model',async()=>{
 const e=environment();let dark=false,fetches=0,rendererCalls=0,saves=0;
 const start=unique(app,'async function start(){','  const response=await fetch(');
 assert.ok(app.indexOf('view=createLayoutRenderer(')>app.indexOf("document.body.dataset.layoutReady='desktop-only';return;"));
 const factory=new Function('deps',`
  let language,view,busy=false;const document=deps.doc,window=deps.win,$=s=>document.querySelector(s),updateLanguage=()=>language?.refresh();
  const setupLayoutLanguage=deps.setupLayoutLanguage,readDisplay=deps.readDisplay,saveDisplay=deps.saveDisplay,applyDisplay=deps.applyDisplay;
  const fetch=()=>{deps.onFetch();throw Error('Desktop notice must not request catalog/model')},createLayoutRenderer=()=>deps.onRenderer();
  ${start}\nthrow Error('Fixture expected coarse-only branch');}\nreturn {start,language:()=>language,busy:v=>busy=v};`);
 const replay=factory({doc:e.doc,win:e.win,setupLayoutLanguage,readDisplay:()=>({dark}),saveDisplay:value=>{dark=value.dark;saves++},applyDisplay:value=>{if(typeof value==='boolean')dark=value;e.doc.documentElement.dataset.theme=dark?'dark':'light'},onFetch:()=>fetches++,onRenderer:()=>rendererCalls++});
 await replay.start();assert.equal(e.doc.body.dataset.layoutReady,'desktop-only');assert.equal(e.workspace.hidden,true);assert.equal(e.appRoot.children.length,1);
 for(const code of supportedLanguages){replay.language().setLanguage(code);e.theme.emit('click');assert.equal(e.doc.documentElement.dataset.theme,dark?'dark':'light');assert.equal(e.appRoot.children[0].children[0].textContent,t('layout.desktopOnlyTitle',{},code));}
 assert.equal(saves,5);assert.equal(dark,true);replay.busy(true);e.theme.emit('click');assert.equal(saves,5);replay.busy(false);e.theme.emit('click');assert.equal(dark,false);assert.equal(saves,6);
 assert.equal(fetches,0);assert.equal(rendererCalls,0);replay.language().disconnect();
});
for(const [rel,h]of Object.entries(consumed))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(path.join(site,rel))).digest('hex'),h,'Source changed: '+rel);
const report={schema:'layout-frontend-consistency-source-v1',passed:true,tests,sourceInputs:consumed,languages:supportedLanguages,actualSourceBodies:true,actualLanguageModule:true,DOMInterfaceFixture:true,WebGL:false,modelsLoaded:0,native:false};
if(option('--report'))fs.writeFileSync(option('--report'),JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify({passed:true,tests:tests.length,languages:supportedLanguages.length,modelsLoaded:0,scope:'Actual source replay with DOM-interface fixtures; no browser/full-model claim'}));

