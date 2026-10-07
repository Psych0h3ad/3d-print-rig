import assert from 'node:assert/strict';
import fs from 'node:fs';
import vm from 'node:vm';
import {mountAssemblyDownload} from '../site/viewer/assembly-downloads.mjs';
// Use the same locale module instance as the production download component.
const downloadModule=new URL('../site/viewer/assembly-downloads.mjs',import.meta.url);
const localeImport=fs.readFileSync(downloadModule,'utf8').match(/^import \{formatMessage\} from '([^']+)';/);
assert(localeImport);
const {formatMessage,loadLanguage,supportedLanguages}=await import(new URL(localeImport[1],downloadModule).href);

const app=fs.readFileSync(new URL('../site/viewer/custom-voron.js',import.meta.url),'utf8');
const html=fs.readFileSync(new URL('../site/viewer/custom-voron.html',import.meta.url),'utf8');
const start=app.indexOf(" const $=id=>document.getElementById(id)"),end=app.indexOf('\n const renderer=',start);
assert(start>0&&end>start);
const bootstrap=app.slice(start,end);
const slot=html.match(/<div\b[^>]*\bid="assemblyDownload"[^>]*>/)?.[0];assert(slot);
const dataset={};
for(const [,name,value]of slot.matchAll(/data-([a-z-]+)="([^"]*)"/g))dataset[name.replace(/-([a-z])/g,(_,c)=>c.toUpperCase())]=value;
assert.equal(dataset.assemblyDownloadCatalog,'defaults');
assert.equal(dataset.assemblyDownloadNoticeId,'custom_voron.reference');
const element=tag=>({tag,dataset:{},children:[],textContent:'',append(...children){this.children.push(...children)},replaceChildren(...children){this.children=[...children]}});
const baseURI='https://example.invalid/3d-print-rig/viewer/custom-voron.html';
const document={baseURI,documentElement:{lang:'en'},createElement:element,getElementById:()=>null};
globalThis.document=document;
const ids=['voron_v24_500_custom','voron_trident_500_custom'];
const entry=id=>({machine_id:id,display_name:id,configuration:'custom reference CAD',part_count:10,
 upstream_url:'https://example.invalid/source',step_zip:{path:'../steps/'+id+'.zip',filename:id+'.zip',bytes:1048576}});
const catalog={defaults:ids.map(entry),machines:[{...entry(ids[0]),step_zip:{path:'../wrong-mod.zip',filename:'wrong.zip',bytes:1}}]};

for(const id of [...ids,'voron_v24_350_half_z','voron_trident_350_half_z','unknown_custom']){
 let options,navigated;
 vm.runInNewContext(bootstrap,{URL,document,location:{href:baseURI+'?machine='+id},
  setupMachineNavigation:value=>{navigated=value},setupPublicInfo:value=>{options=value}});
 assert.equal(navigated,id);
 assert.equal(options.machineId,ids.includes(id)?id:null);
 assert.equal(options.includeDownloads,!ids.includes(id),'custom STEP must not use the standard-only dialog');
 if(!ids.includes(id))continue;
 const container=element('div');container.dataset={...dataset};
 for(const language of supportedLanguages){
  await loadLanguage(language);document.documentElement.lang=language;
  assert.equal(mountAssemblyDownload(container,options.machineId,catalog),true);
  const [download,,notice,source]=container.children;
  assert.equal(download.href,new URL(entry(id).step_zip.path,baseURI).href);
  assert.equal(download.download,id+'.zip');
  assert.equal(notice.dataset.i18nId,'custom_voron.reference');
  assert.equal(notice.textContent,formatMessage('custom_voron.reference',{},language));
  assert.equal(container.children[4].dataset.i18nId,'text.0364');
  assert.equal(container.children[4].textContent,formatMessage('text.0364',{},language));
  assert.equal(source.href,entry(id).upstream_url);
 }
 document.documentElement.lang='en';mountAssemblyDownload(container,id,catalog);
 assert(container.children[2].textContent.includes('not a standard kit'));
 const expected=container.children.map(n=>[n.tag,n.href,n.download,n.textContent]);
 // Display/Mod/source state never substitutes a default assembly or re-scopes it.
 for(const state of [{mod:'selected',source:'modified',color:'#123456',pose:[500,500,100]},
                     {mod:'stock',source:'original',color:'#e32636',pose:[0,0,0]}]){
  document.body={dataset:state};catalog.machines=[{...entry(id),configuration:state.mod,step_zip:{path:'../modified.zip',filename:'modified.zip',bytes:1}}];
  mountAssemblyDownload(container,id,catalog);assert.deepEqual(container.children.map(n=>[n.tag,n.href,n.download,n.textContent]),expected);
 }
 const absent={defaults:catalog.defaults.filter(row=>row.machine_id!==id),machines:[entry(id)]};
 assert.equal(mountAssemblyDownload(container,id,absent),false,'missing exact default must not fall back to machines or another500');
 assert.equal(container.children.length,0,'stale download must be removed');
 assert.equal(mountAssemblyDownload(container,id,{defaults:[{...entry(id),step_zip:null}],machines:[entry(id)]}),false);
 assert.equal(container.children.length,0);
}
// Existing stock caller semantics and standard/Mods exclusion notice stay intact.
const stock=element('div');const stockEntry=entry('stock');
assert(mountAssemblyDownload(stock,'stock',{machines:[stockEntry],defaults:[{...stockEntry,step_zip:null}]}));
assert.equal(stock.children[0].download,'stock.zip');
assert.equal(stock.children[2].dataset.i18nId,undefined);
assert(stock.children[2].textContent.includes('Mod'));
assert.equal(mountAssemblyDownload(stock,'missing',{machines:[stockEntry]}),false);
assert.equal(stock.children.length,0);
console.log('Custom500 STEP: exact defaults IDs, source/Mod independence, missing entry/no fallback, localized derived scope and stock semantics passed.');
