import assert from 'node:assert/strict';
import {initialBank,normalizeBank,bankPlan,bankChoices,bankCapacity,bankSource} from '../site/viewer/changer-bank-model.mjs';
const data={indx:{pitch_mm:41,tool_options:[{id:'cht04'},{id:'standard025'}],machines:{printer:{capacity:7,center_x_mm:0,translation_mm:[0,-232,351.5],fixture_asset:'bar'}},dock_asset:'dock',parked_asset:'passive'}};
const variants=['4010','cpap','nozzle_open'].flatMap(cooling=>data.indx.tool_options.map(({id:hotend})=>({id:cooling+'_'+hotend,toolhead:'indx',hotend,cooling,gantry:'g6',machine_head:{base:'smart_head'}})));
const catalog={machine_id:'printer',variants},snapshot=JSON.stringify({catalog,data});
assert.equal(bankCapacity(data,'printer','indx'),7);
for(const cooling of ['4010','cpap','nozzle_open']){
 const choices=bankChoices(catalog,data,'g6','indx',cooling);assert.equal(choices.length,2);
 const first=initialBank(catalog,data,'g6','indx');assert.equal(first.tools.length,3);assert.equal(first.system,'indx');
 for(let count=1;count<=7;count++)for(let mask=0;mask<2**count;mask++)for(let active=0;active<count;active++){
  const state={system:'indx',enabled:true,active,tools:Array.from({length:count},(_,i)=>bankSource(choices[mask>>i&1],'indx'))},v=choices[mask>>active&1],p=bankPlan(state,catalog,data,v);
  assert.equal(p.instances.filter(e=>e.kind==='dock').length,count);assert.equal(p.instances.filter(e=>e.kind==='tool').length,count-1);assert.equal(p.instances.filter(e=>e.kind==='fixture').length,1);
  assert(!p.instances.some(e=>e.id==='smart_head'));assert(!p.instances.some(e=>e.kind==='tool'&&e.slot===active));assert.deepEqual(normalizeBank(state,catalog,data,'g6'),state);
  const docks=p.instances.filter(e=>e.kind==='dock');assert.equal(docks[0].translation_mm[0],(-(count-1)*41/2)||0);assert.equal(docks.at(-1).translation_mm[0],(count-1)*41/2);
 }
 assert.throws(()=>normalizeBank({...first,tools:['unregistered']},catalog,data,'g6'));assert.throws(()=>normalizeBank({...first,tools:Array(8).fill('cht04')},catalog,data,'g6'));
}
assert.equal(JSON.stringify({catalog,data}),snapshot);
console.log('INDX counts, mixed/repeated passive tools, one Smart Head, active exclusion, cooling, fixtures and invalid-state rejection passed.');
