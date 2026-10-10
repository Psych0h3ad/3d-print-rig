import assert from 'node:assert/strict';
import fs from 'node:fs';
import {assemblyDownloadEntries,filterAssemblyDownloads,mountStepDownloadLibrary} from '../site/viewer/step-downloads.mjs';

const moduleURL=new URL('../site/viewer/step-downloads.mjs',import.meta.url);
const localeImport=fs.readFileSync(moduleURL,'utf8').match(/^import \{formatMessage\} from '([^']+)';/);
const {loadLanguage,formatMessage,supportedLanguages}=await import(new URL(localeImport[1],moduleURL));
const catalog=JSON.parse(fs.readFileSync(new URL('../site/PUBLIC_CATALOG.json',import.meta.url),'utf8'));
const entries=assemblyDownloadEntries(catalog);
assert.equal(entries.length,catalog.defaults.length,'every published default remains discoverable');
for(const original of catalog.defaults){
 const entry=entries.find(item=>item.id===(original.machine_id||original.id));assert(entry);
 assert.equal(entry.url,original.step_zip?.path||original.url);
 assert.equal(entry.filename,original.step_zip?.filename||new URL(original.url).pathname.split('/').pop());
}
// Retain the two verified SIBOOR archives even without step_zip metadata.
for(const size of [300,350])assert(entries.some(item=>item.id==='siboor_trident_'+size));
for(const id of ['siboor_v24_350','voron_trident_1000_custom','voron_v24_350_half_z','unknown'])assert(!entries.some(item=>item.id===id),'never substitute another vendor/size');
const base=catalog.defaults[0];
for(const url of ['file:///private/model.zip','http://localhost/model.zip','javascript:alert(1)','https://user:password@example.invalid/model.zip','https://example.invalid/manifest.json'])assert.equal(assemblyDownloadEntries({defaults:[{...base,url}]}).length,0);
assert.equal(assemblyDownloadEntries({defaults:[{...base,release_verified:false}]}).length,0);
assert.equal(assemblyDownloadEntries({defaults:[base,base]}).length,1);
assert.equal(assemblyDownloadEntries({machines:[base]}).length,0,'only baseline download catalog, never installed Mod assets');
assert(filterAssemblyDownloads(entries,'Trident 300').every(item=>item.id.endsWith('_300')));
assert.equal(filterAssemblyDownloads(entries,'not-a-printer').length,0);
assert.equal(filterAssemblyDownloads(entries,'').length,entries.length);

const make=tag=>({tag,dataset:{},className:'',textContent:'',value:'',children:[],listeners:{},
 classList:{add(...values){this.owner.className+=' '+values.join(' ')},owner:null},
 append(...children){this.children.push(...children)},replaceChildren(...children){this.children=[...children]},addEventListener(type,callback){this.listeners[type]=callback}});
globalThis.document={documentElement:{lang:'en'},createElement:tag=>{const node=make(tag);node.classList.owner=node;return node}};
const container=document.createElement('div');
const rows=()=>container.children.find(node=>node.className==='step-download-list').children;
for(const language of supportedLanguages){
 await loadLanguage(language);document.documentElement.lang=language;
 const {search}=mountStepDownloadLibrary(container,entries,'voron_trident_300');
 assert.equal(rows()[0].dataset.stepMachine,'voron_trident_300');
 assert.equal(rows()[0].children[0].textContent,formatMessage('step.current',{},language));
 const actions=rows()[0].children.find(node=>node.className==='step-download-actions');
 assert.equal(actions.children[0].textContent,formatMessage('step.download',{},language));
 assert.equal(actions.children[0].href,catalog.defaults.find(item=>item.id==='voron_trident_300').url);
 search.value='Micron';search.listeners.input();assert.equal(rows().filter(node=>!node.hidden).length,2);
 search.value='not-a-printer';search.listeners.input();assert(rows().every(node=>node.hidden));assert.equal(container.children.at(-1).hidden,false);
 search.value='';search.listeners.input();assert(rows().every(node=>!node.hidden));assert.equal(container.children.at(-1).hidden,true);
 // A-B-A machine changes cannot leave the old file featured.
 mountStepDownloadLibrary(container,entries,'micron_r1_120');assert.equal(rows()[0].dataset.stepMachine,'micron_r1_120');
 mountStepDownloadLibrary(container,entries,'voron_trident_300');assert.equal(rows()[0].dataset.stepMachine,'voron_trident_300');
 mountStepDownloadLibrary(container,entries,'voron_trident_1000_custom');assert(rows().every(node=>!node.className.includes('is-current')));
 assert(container.children.some(node=>node.dataset.i18nId==='step.unavailable'));
 mountStepDownloadLibrary(container,entries,null);assert(!container.children.some(node=>node.dataset.i18nId==='step.unavailable'));
 assert.equal(rows().filter(node=>node.children.some(child=>child.dataset.i18nId==='step.custom')).length,2);
}
console.log('Published STEP discovery: exact defaults, unsafe/unverified rejection, vendor/size no fallback, search/reset, A-B-A selection and all5 languages passed.');
