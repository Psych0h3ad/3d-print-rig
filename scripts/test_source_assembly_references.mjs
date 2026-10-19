import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {sourceReferencePanel,sourceCreditRecords} from '../site/viewer/source-assembly-references.mjs';

class Element {
 constructor(tag){this.tagName=tag;this.children=[];this.dataset={};this.classList={add:()=>{}};}
 append(...nodes){for(const node of nodes){if(node.parentElement)node.parentElement.children=node.parentElement.children.filter(n=>n!==node);node.parentElement=this;this.children.push(node);}}
 contains(node){return node===this||this.children.some(n=>n.contains(node));}
 closest(tag){return this.tagName===tag?this:this.parentElement?.closest(tag)??null;}
 replaceChildren(...nodes){for(const child of this.children)child.parentElement=null;this.children=[];this.append(...nodes);}
}
function fixture(){
 const root=new Element('aside'),panel=new Element('div'),section=new Element('details'),anchor=new Element('a');
 panel.id='panel-reference';anchor.id='nativeSource';root.append(panel);panel.append(section);section.append(anchor);
 const document={createElement:tag=>new Element(tag),getElementById(id){const visit=n=>n.id===id?n:n.children.map(visit).find(Boolean);return visit(root)??null;}};
 return {root,panel,section,anchor,document};
}
const f=fixture(),section=sourceReferencePanel(f.document);
assert.equal(section,f.section);assert(f.panel.contains(section));
// The production UI replaces the legacy source link before the async load.
section.replaceChildren(new Element('summary'));
assert.equal(f.document.getElementById('nativeSource'),null);
await Promise.resolve();
const sources=new Element('ul');section.append(sources);
assert.equal(sourceReferencePanel(f.document),section);
assert(f.panel.contains(sources),'Loaded credits stay in shared References');
// A shared template may remove that legacy control before controller mount.
const removed=fixture();removed.panel.replaceChildren();
const replacement=sourceReferencePanel(removed.document);
assert(removed.panel.contains(replacement));
replacement.append(new Element('ul'));
assert.equal(sourceReferencePanel(removed.document),replacement,'No duplicate source section');
// A moved legacy section is returned to the common tab, preserving its data.
const moved=fixture();moved.root.append(moved.section);
assert.equal(sourceReferencePanel(moved.document),moved.section);assert(moved.panel.contains(moved.anchor));
assert.throws(()=>sourceReferencePanel({getElementById:()=>null}),/Missing source References/,'Never silently discard credits');
const ui=await readFile(new URL('../site/viewer/source-assembly.mjs',import.meta.url),'utf8');
assert(ui.includes('const sourceReference=sourceReferencePanel(document)'));
assert(!ui.includes("$('nativeSource').closest"),'No late lookup of removed shared control');
assert(ui.includes('for(const host of[creditsList,sourceReferenceList])'),'All source credits populate both destinations');
const site=new URL('../site/',import.meta.url),index=JSON.parse(await readFile(new URL('SOURCE_ASSEMBLIES.json',site),'utf8'));
for(const row of index.models){
 const packet=JSON.parse(await readFile(new URL(row.packet.url,new URL('viewer/',site)),'utf8'));
 const records=sourceCreditRecords(packet),expected=new Set([packet.public_author_source,...packet.public_sources].map(s=>s.url));
 assert(expected.size>1);assert.deepEqual(new Set(records.map(s=>s.url)),expected);
 assert(records.some(s=>s.author==='RH3D'&&s.url.startsWith('https://rh3d.xyz/')));
 for(const s of records)assert(s.license&&s.revision||s.license&&s.source_revision);
 const bad=structuredClone(packet);delete bad.public_author_source.url;assert.throws(()=>sourceCreditRecords(bad),/Missing public source/);
 delete bad.public_sources[0].url;assert.throws(()=>sourceCreditRecords(bad),/Missing public source/);
}
console.log('Source References: async legacy removal, missing shared control, panel move, retained credits and production integration passed.');
