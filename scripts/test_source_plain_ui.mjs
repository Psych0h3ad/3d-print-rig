import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {sourceText,sourceMessages} from '../site/viewer/source-assembly-messages.mjs';
import {createSourceUIText,sourceCreditLabel,sourceCreditNote} from '../site/viewer/source-assembly-ui-text.mjs';
import {sourceCreditRecords} from '../site/viewer/source-assembly-references.mjs';
import {sourceRevision} from './build_locales.mjs';
const source=await fs.readFile(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
const html=await fs.readFile(new URL('../site/viewer/community.html',import.meta.url),'utf8');
const bootstrap=code=>code.slice(code.indexOf(' const job=coordinator.start(),index=await loadSourceIndex'),code.lastIndexOf(" await load('full');"));
assert(bootstrap(source).includes('sourceReference.replaceChildren'));
class Element{
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.textContent='';}
 append(...nodes){this.children.push(...nodes);}
 replaceChildren(...nodes){this.children=[];this.append(...nodes);}
}
export async function auditPlainUI(packet,record,{code=source,language='en'}={}){
 let currentLanguage=language;
 const nodes=new Map(['machineTitle','machineRevision','machineDescription'].map(id=>[id,new Element('div')]));
 const sourceReference=new Element('details'),credits=new Element('dialog'),creditsList=new Element('ul');
 const messages=createSourceUIText(()=>currentLanguage);
 const owned=(tag,attributes={})=>Object.assign(new Element(tag),attributes);
 const text=(node,key)=>messages.set(node,key);
 const run=new (Object.getPrototypeOf(async function(){}).constructor)('env',
  "const {coordinator,loadSourceIndex,loadSourcePacket,sourceHeadPlan,machine,$,owned,text,sourceReference,credits,creditsList,messages,sourceCreditRecords,sourceCreditLabel,sourceCreditNote}=env;let packet,headPlan;\n"+bootstrap(code));
 await run({coordinator:{start:()=>({signal:new AbortController().signal,current:()=>true})},
  loadSourceIndex:async()=>({models:[record]}),loadSourcePacket:async()=>packet,sourceHeadPlan:async()=>({}),
  machine:record.id,$:id=>nodes.get(id),owned,text,sourceReference,credits,creditsList,messages,
  sourceCreditRecords,sourceCreditLabel,sourceCreditNote});
 const descendants=node=>[node,...node.children.flatMap(descendants)];
 const expected=sourceCreditRecords(packet).map(r=>r.url).sort();
 for(const host of [creditsList,sourceReference])assert.deepEqual(descendants(host).filter(n=>n.tagName==='a').map(n=>n.href).sort(),expected);
 assert.equal(descendants(sourceReference).filter(n=>n.tagName==='p'&&n.textContent===packet.public_author_source.source_revision).length,1,'Exact source version paragraph missing');
 if(record.id==='rh3d_e3ng_v12_235'){
  assert.equal(nodes.get('machineTitle').textContent,'E3NG v1.2 / 235');assert.equal(nodes.get('machineRevision').textContent,'');
  assert.equal(nodes.get('machineDescription').textContent,'Orbiter 2 · Revo Voron');
 }else{
  assert.equal(nodes.get('machineTitle').textContent,record.label);
  assert.equal(nodes.get('machineRevision').textContent,packet.public_author_source.source_revision);
 }
 for(const lang of ['en','ja','es','ko','ru','de']){currentLanguage=lang;messages.refresh();if(record.id==='rh3d_e3ng_v12_235')assert.equal(nodes.get('machineDescription').textContent,sourceText('installedE3Components',lang));}
 return {machine:record.id,language,credit_links_each_destination:expected.length,source_revision_exact:true,geometry_loaded:false};
}
const central=JSON.parse(await fs.readFile(new URL('../localization/source.json',import.meta.url),'utf8'));
const id='source_assembly.installed_e3_components',entry=central.entries[id];assert(entry);
for(const lang of ['en','ja','es','ko','ru','de']){
 assert.equal(sourceMessages[lang].installedE3Components,'Orbiter 2 · Revo Voron');
 if(['en','ja'].includes(lang))assert.equal(entry[lang],sourceText('installedE3Components',lang));
 else{const d=JSON.parse(await fs.readFile(new URL('../localization/'+lang+'.json',import.meta.url),'utf8'));assert.equal(d.messages[id].source_revision,sourceRevision(entry));assert.equal(d.messages[id].text,sourceText('installedE3Components',lang));}
 assert(sourceText('stl-e3ng',lang)&&sourceText('stl-virtu',lang),'Source provenance notices retained');
}
assert.match(html,/<p id="sourceModelNotice"[^>]*data-i18n-id="source_assembly.loading"[^>]*>Loading assembly<\/p>/);
assert(!html.includes('Assembly based on the author’s complete CAD'));
const index=JSON.parse(await fs.readFile(new URL('../site/SOURCE_ASSEMBLIES.json',import.meta.url),'utf8'));
const rows=[];
for(const record of index.models){
 const packet=JSON.parse(await fs.readFile(new URL(record.packet.url,new URL('../site/viewer/',import.meta.url)),'utf8'));
 for(const language of ['en','ja','es','ko','ru','de'])rows.push(await auditPlainUI(packet,record,{language}));
 // Fixture checks the unpublished E3NG display branch only; no model is registered or qualified.
 const fixtureRecord={...record,id:'rh3d_e3ng_v12_235',label:'Long fixture assembly label'};
 await auditPlainUI(packet,fixtureRecord);
 const old=source.replace("machine==='rh3d_e3ng_v12_235'?'E3NG v1.2 / 235':record.label",'record.label');
 await assert.rejects(()=>auditPlainUI(packet,fixtureRecord,{code:old}));
}
console.log(JSON.stringify({passed:true,rows,central_stable_key:id,source_DOM_bootstrap_executed:true,
 scope:'Production text/References bootstrap with actual public packet metadata and exact credits. E3NG branch fixture only; no new geometry, native fit or browser rendering claim.'}));
