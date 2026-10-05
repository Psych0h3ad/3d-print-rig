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
 setAttribute(key,value){this[key]=value}
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
assert.equal(anchor.beforeNodes.length,2);const panel=anchor.beforeNodes[0];assert.equal(panel.id,'changerBank');assert.equal(anchor.beforeNodes[1].hidden,true);
assert.equal(panel.querySelector('#bankEnabled').disabled,true);assert.equal(calls[0].state.enabled,false);
await bank.install(sc);await bank.bind({current:sc,busy:false});assert.equal(panel.querySelector('#bankEnabled').disabled,false);
assert.equal(calls[1].v.id,'sc');
// Existing machine callers retain their default insertion point.
dom.nodes.set('#configurationControls',new Element());setupChangerBank({catalog,rig,data});
assert.equal(dom.querySelector('#configurationControls').beforeNodes.length,2);
// Trident must expose no fixed SC dock controls, even when a source catalog
// contains old dock metadata. Single mounted heads still load.
for(const machine_id of ['voron_trident_250','voron_trident_300','voron_trident_350','siboor_trident_350']){
 const indx={id:'indx',toolhead:'indx',mount:'fixed',gantry:sc.gantry,hotend:'passive',cooling:'4010',machine_head:{}},madmax={...sc,id:'madmax',mount:'madmax',registration_source:'madmax_xol'};
 const tridentCatalog={...catalog,machine_id,variants:[...catalog.variants,indx,madmax],hotends:[...catalog.hotends,{id:'passive',label:'Passive tool'}]},tridentData={...data,machines:{[machine_id]:{capacity:4,bank_permitted:false,printing_blocked_reason:'Standard SC bed collision'}},indx:{pitch_mm:41,dock_asset:'indx_dock',parked_asset:'indx_tool',tool_options:[{id:'passive'}],machines:{[machine_id]:{capacity:3,center_x_mm:0,translation_mm:[0,-240,330]}}}};
 const tridentAnchor=new Element(),tridentCalls=[],tridentRig={async install(v,state){this.active=v;tridentCalls.push({v,state})},async setBank(state){tridentCalls.push({state})}};
 const tridentBank=setupChangerBank({catalog:tridentCatalog,rig:tridentRig,data:tridentData,before:tridentAnchor});
 const tridentPanel=tridentAnchor.beforeNodes[0],error=tridentAnchor.beforeNodes[1];
 let current=sphinx;
 const controller={get current(){return current},busy:false,async selectVariant(id,extras){current=tridentCatalog.variants.find(v=>v.id===id);await tridentBank.install(current);await tridentBank.options.applyExtras(extras);tridentBank.options.onSettled(current)}};
 await tridentBank.install(sphinx);await tridentBank.bind(controller);
 assert.equal(tridentPanel.hidden,true);assert.equal(tridentPanel.querySelector('#bankEnabled').disabled,true);assert.equal(tridentPanel.querySelector('#bankFields').children.length,0);
 await controller.selectVariant(sc.id,{});assert.equal(current,sc);assert.deepEqual(tridentBank.state,{enabled:false,active:0,tools:[]});assert.equal(tridentPanel.hidden,true);
 const legacy={enabled:false,active:0,tools:['sc']};
 tridentBank.options.validateExtras({configuration:sc.id,tool_bank:legacy});await tridentBank.options.applyExtras({tool_bank:legacy});assert.deepEqual(tridentBank.state,{enabled:false,active:0,tools:[]});
 assert.throws(()=>tridentBank.options.validateExtras({configuration:sc.id,tool_bank:{...legacy,enabled:true}}),/Standard SC bed collision/);
 await controller.selectVariant(indx.id,{});assert.equal(tridentPanel.hidden,false);assert.equal(tridentBank.state.system,'indx');assert.equal(tridentBank.state.enabled,true);assert.equal(tridentPanel.querySelector('#bankEnabled').disabled,false);
 await controller.selectVariant(sc.id,{});assert.equal(tridentPanel.hidden,true);assert.deepEqual(tridentBank.state,{enabled:false,active:0,tools:[]});
 await controller.selectVariant(madmax.id,{});assert.equal(tridentPanel.hidden,false);assert.equal(tridentBank.state.system,'madmax');assert.equal(tridentBank.state.enabled,false);assert.equal(tridentPanel.querySelector('#bankEnabled').disabled,true);
 await controller.selectVariant(sphinx.id,{});assert.equal(tridentPanel.hidden,true);assert.deepEqual(tridentBank.state,{enabled:false,active:0,tools:[]});
 // Stale links fail visibly outside the removed controls; no dock is installed.
 location.search='?tools='+encodeURIComponent(JSON.stringify({...legacy,enabled:true}));
 const linkedAnchor=new Element(),linked=setupChangerBank({catalog:tridentCatalog,rig:tridentRig,data:tridentData,before:linkedAnchor});
 await linked.install(sc);await linked.bind({...controller,current:sc});
 assert.equal(linkedAnchor.beforeNodes[0].hidden,true);assert.equal(linkedAnchor.beforeNodes[1].hidden,false);assert.match(linkedAnchor.beforeNodes[1].textContent,/Standard SC bed collision/);
 assert.equal(error.hidden,true);assert(tridentCalls.every(call=>!call.state.enabled||call.state.system==='indx'));location.search='';
}
console.log('Standalone head bank initializes with shipped HTML, Sphinx stays selectable, SC bank enables, and machine panel placement is preserved.');
console.log('All Trident sizes remove SC dock controls, load single heads, migrate disabled files, and visibly reject old enabled links.');
