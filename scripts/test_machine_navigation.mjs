import assert from 'node:assert/strict';
import {setupMachineNavigation} from '../site/viewer/machines.js';
const nodes=new Map();
class Element{
 constructor(tag){this.tag=tag;this.children=[];this.dataset={};this.listeners={};this.classList={toggle(){}};this.value=''}
 set id(v){this._id=v;nodes.set('#'+v,this)}get id(){return this._id}
 setAttribute(){}before(){}after(){}append(...c){this.children.push(...c)}replaceChildren(...c){this.children=c;this.value=c[0]?.value||''}
 addEventListener(type,f){(this.listeners[type]||=[]).push(f)}change(value){this.value=String(value);for(const f of this.listeners.change||[])f()}
}
const select=new Element('select');select.id='machineConfig';const label=new Element('label');nodes.set('label[for="machineConfig"]',label);
globalThis.document={querySelector:s=>nodes.get(s),createElement:t=>new Element(t),body:{dataset:{}}};const assigned=[];globalThis.location={href:'https://example.test/viewer/?configuration=abc&lang=en',assign:u=>assigned.push(new URL(u))};globalThis.history={replaceState(){}};const saved=new Map();globalThis.localStorage={setItem:(k,v)=>saved.set(k,v),getItem:k=>saved.get(k)||null};
setupMachineNavigation('siboor_trident_350');const count=nodes.size;setupMachineNavigation('siboor_trident_350');assert.equal(nodes.size,count);
nodes.get('#machineFamily').change('v24');nodes.get('#machineVendor').change('voron');nodes.get('#machineSize').change(250);select.change('voron_v24_250_printed');assert.equal(assigned.length,0);assert.equal(nodes.get('#showMachine').disabled,false);nodes.get('#showMachine').onclick();assert.equal(assigned.length,1);assert.equal(assigned[0].searchParams.get('machine'),'voron_v24_250_printed');assert.equal(saved.get('3d-print-rig-last-configuration-siboor_trident_350'),'abc');
nodes.get('#machineVendor').change('fysetc');nodes.get('#machineSize').change(350);assert.equal(nodes.get('#showMachine').disabled,true);nodes.get('#showMachine').onclick();assert.equal(assigned.length,1,'Unavailable CAD must not navigate');
assert.equal(assigned[0].searchParams.get('lang'),'en','Explicit language survives printer navigation');
console.log('Machine navigation: staged family/vendor/size/spec choices, one explicit navigation, unavailable CAD and duplicate initialization passed.');
