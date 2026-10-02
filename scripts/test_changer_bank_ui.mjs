import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {setupChangerBank} from '../site/viewer/changer-bank.js';

// Start the real bank controller against IDs from the shipped standalone HTML.
// The previous implementation unconditionally required the printer-only panel.
class Element {
 constructor(){this.children=[];this.nodes=new Map();this.dataset={};this.classList={toggle(){}};this.beforeNodes=[]}
 set innerHTML(html){for(const [,id] of html.matchAll(/\bid="([^"]+)"/g))this.nodes.set('#'+id,new Element())}
 querySelector(key){return this.nodes.get(key)||null}
 append(...nodes){this.children.push(...nodes)}
 replaceChildren(...nodes){this.children=nodes}
 before(...nodes){this.beforeNodes.push(...nodes)}
}
const html=await fs.readFile(new URL('../site/viewer/toolheads.html',import.meta.url),'utf8'),dom=new Element();dom.innerHTML=html;
globalThis.document={querySelector:key=>dom.querySelector(key),createElement:()=>new Element()};
globalThis.location={href:'https://example.test/viewer/toolheads.html',search:''};globalThis.history={replaceState(){}};
assert.equal(document.querySelector('#configurationControls'),null);
const sphinx={id:'sphinx',toolhead:'sphinx',mount:'fixed',gantry:'sphinx_voron',extruder:'sherpa',hotend:'tricorn'};
const sc={id:'sc',toolhead:'xol',mount:'stealthchanger',gantry:'sc_standard_6',extruder:'sherpa',hotend:'rapido',machine_head:{}};
const catalog={machine_id:'toolhead',variants:[sphinx,sc],extruders:[{id:'sherpa',label:'Sherpa'}],hotends:[{id:'tricorn',label:'Tricorn'},{id:'rapido',label:'Rapido'}]};
const data={profiles:[{selection:{toolhead:'xol'}}],machines:{toolhead:{capacity:4}}};
const calls=[],rig={async install(v,state){calls.push({v,state})}};
const anchor=document.querySelector('#assemblyScope');assert.ok(anchor);
const bank=setupChangerBank({catalog,rig,data,before:anchor});
await bank.install(sphinx);await bank.bind({current:sphinx,busy:false});
assert.equal(anchor.beforeNodes.length,1);const panel=anchor.beforeNodes[0];assert.equal(panel.id,'changerBank');
assert.equal(panel.querySelector('#bankEnabled').disabled,true);assert.equal(calls[0].state.enabled,false);
await bank.install(sc);await bank.bind({current:sc,busy:false});assert.equal(panel.querySelector('#bankEnabled').disabled,false);
assert.equal(calls[1].v.id,'sc');
// Existing machine callers retain their default insertion point.
dom.nodes.set('#configurationControls',new Element());setupChangerBank({catalog,rig,data});
assert.equal(dom.querySelector('#configurationControls').beforeNodes.length,1);
console.log('Standalone head bank initializes with shipped HTML, Sphinx stays selectable, SC bank enables, and machine panel placement is preserved.');
