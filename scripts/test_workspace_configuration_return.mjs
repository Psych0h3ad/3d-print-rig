import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import vm from 'node:vm';
import {supportedLanguages} from '../site/viewer/languages.mjs';

// Execute the actual controller-owned callback and observer binding. The
// observer fixture filters attribute notifications just as the DOM does.
const source=await fs.readFile(new URL('../site/viewer/workspace-ui.mjs',import.meta.url),'utf8');
const base=new URL('../site/viewer/workspace-ui.mjs',import.meta.url);
const reference=name=>new URL(source.match(new RegExp("from '(\\./"+name+"\\.mjs\\?v=[^']+)'"))[1],base);
const lifecycle=await import(reference('workspace-lifecycle'));
const {printerWorkspaceURL,workspaceReturnKey}=await import(reference('workspace-return'));
const begin=source.indexOf('  function rememberPrinter() {');
const end=source.indexOf('\n  for (const link of header.querySelectorAll',begin);
assert(begin>0&&end>begin);
const actual=source.slice(begin,end);
const legacy=actual.replace(", 'data-configuration'",'').replace(",'data-configuration'",'');
assert.notEqual(actual,legacy,'The real binding observes configuration changes');
let checks=0;
function exercise(body,expectedRefresh){
 for(const lang of supportedLanguages){
  const observers=[];
  class Observer{
   constructor(callback){this.callback=callback;observers.push(this)}
   observe(target,options){this.target=target;this.options=options}
   disconnect(){this.target=null}
   takeRecords(){return []}
  }
  globalThis.MutationObserver=Observer;
  const scope=new lifecycle.WorkspaceScope();lifecycle.activateScope(scope);
  const root={dataset:{machineId:'ender3_stock_220',configuration:'stock'}};
  const doc={body:root,documentElement:{lang}};
  const location={href:'https://example.test/3d-print-rig/viewer/community.html?machine=ender3_stock_220&configuration=stock&lang='+lang};
  const links={'#workspacePrinterLink':{href:''},'#workspaceSupportLink':{href:''}};
  const values=new Map(),sessionStorage={getItem:key=>values.get(key)||null,setItem:(key,value)=>values.set(key,value)};
  const context={URL,document:doc,location,sessionStorage,window:new EventTarget(),machinePage:true,page:'community.html',
   $:selector=>links[selector],printerWorkspaceURL,workspaceReturnKey,
   WorkspaceMutationObserver:lifecycle.WorkspaceMutationObserver,workspaceListen:lifecycle.workspaceListen};
  vm.runInNewContext(body,context);
  assert.equal(new URL(links['#workspacePrinterLink'].href).searchParams.get('configuration'),'stock');checks++;
  for(const configuration of ['microswiss_ng_genuine_installed','microswiss_ng_revo_genuine_installed','microswiss_ng_genuine_installed']){
   const u=new URL(location.href);u.searchParams.set('configuration',configuration);location.href=u.href;
   root.dataset.configuration=configuration;
   for(const o of observers)if(o.target===root&&o.options.attributeFilter.includes('data-configuration'))o.callback([{target:root,attributeName:'data-configuration'}]);
   const expected=expectedRefresh?configuration:'stock';
   assert.equal(new URL(links['#workspacePrinterLink'].href).searchParams.get('configuration'),expected);checks++;
   assert.equal(new URL(values.get(workspaceReturnKey)).searchParams.get('configuration'),expected);checks++;
   const head='https://example.test/3d-print-rig/viewer/toolheads.html?lang='+lang;
   assert.equal(new URL(printerWorkspaceURL(head,values.get(workspaceReturnKey))).searchParams.get('configuration'),expected);checks++;
   assert.equal(new URL(links['#workspacePrinterLink'].href).searchParams.get('lang'),lang);checks++;
  }
  const remembered=values.get(workspaceReturnKey);scope.dispose();
  location.href=location.href.replace('microswiss_ng_genuine_installed','after-disposal');
  for(const o of observers)o.callback([]);
  context.window.dispatchEvent(new Event('rig-language-change'));
  assert.equal(values.get(workspaceReturnKey),remembered,'Unmounted controller cannot overwrite the next destination');checks++;
 }
}
exercise(legacy,false); // Negative control reproduces the initial-selection bug.
exercise(actual,true);
lifecycle.activateScope(undefined);
console.log(JSON.stringify({passed:true,checks,languages:supportedLanguages.length,negative_control:'old observer retains stock',actual_callback:'configuration A-B-A refresh, session, Printer return and disposal'}));
