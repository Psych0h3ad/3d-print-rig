import assert from 'node:assert/strict';
import {bankChoices,initialBank,normalizeBank,bankPlan,readBankURL} from '../site/viewer/changer-bank-model.mjs';
const profiles=['xol','jabberwocky'].map(toolhead=>({selection:{toolhead,hotend:'hot',extruder:'drive',probe:'none',board:'none',cooling:'source'},dock:'dock_'+toolhead,park_translation_mm:[0,68,73]}));
const data={pitch_mm:90,nine_mm_forward_mm:5.6,profiles,machines:{printer:{capacity:4,center_x_mm:0,translation_mm:[0,-240,330]}},fixture_assets:['nuts']};
const variants=[6,9].flatMap(belt_width_mm=>profiles.map(p=>({id:'installed_'+belt_width_mm+'_'+p.selection.toolhead,source_head_configuration:'source_'+belt_width_mm+'_'+p.selection.toolhead,mount:'stealthchanger',gantry:'g'+belt_width_mm,belt_width_mm,...p.selection,machine_head:{base:p.selection.toolhead,translation:[1,2,3],translation_delta_mm:[1,2,3],hidden:['support'],modules:[{id:'front',translation_mm:[1,2,3],role:'tool'},{id:'shuttle',translation_mm:[1,2,3],role:'shuttle'}]}})));
const catalog={machine_id:'printer',variants},snapshot=JSON.stringify({catalog,data});
for(const width of [6,9]){
 const choices=bankChoices(catalog,data,'g'+width);assert.equal(choices.length,2);const initial=initialBank(catalog,data,'g'+width);assert.equal(initial.tools.length,3);assert.equal(initial.enabled,false);
 for(let count=1;count<=4;count++)for(let mask=0;mask<2**count;mask++)for(let active=0;active<count;active++){
  const state={enabled:true,active,tools:Array.from({length:count},(_,i)=>choices[mask>>i&1].source_head_configuration)},v=choices[mask>>active&1],plan=bankPlan(state,catalog,data,v);
  assert.equal(plan.instances.filter(e=>e.kind==='dock').length,count);assert.equal(plan.instances.filter(e=>e.kind==='fastener').length,count);assert.equal(plan.instances.filter(e=>e.kind==='tool').length,(count-1)*2);assert(!plan.instances.some(e=>e.id==='shuttle'));assert(!plan.instances.some(e=>e.kind==='tool'&&e.slot===active));
  const parked=plan.instances.find(e=>e.kind==='tool');if(parked)assert.equal(parked.translation_mm[1],-172+(width===9?5.6:0));
  assert.deepEqual(normalizeBank(JSON.parse(JSON.stringify(state)),catalog,data,'g'+width),state);
 }
 assert.throws(()=>normalizeBank({...initial,active:3},catalog,data,'g'+width));assert.throws(()=>normalizeBank({...initial,tools:['unknown']},catalog,data,'g'+width));assert.throws(()=>normalizeBank({...initial,tools:Array(5).fill(initial.tools[0])},catalog,data,'g'+width));
 assert.equal(bankPlan(initial,catalog,data,choices[0]).instances.length,0);
 assert.throws(()=>bankPlan({...initial,enabled:true},catalog,data,choices[1]),/一致/);
}
assert.equal(JSON.stringify({catalog,data}),snapshot);assert.equal(readBankURL('?lang=en'),null);assert.deepEqual(readBankURL('?tools='+encodeURIComponent('{"enabled":false}')),{enabled:false});assert.throws(()=>readBankURL('?tools=bad'));assert.throws(()=>readBankURL('?tools='+'a'.repeat(4097)));
console.log('Changer bank counts, mixed/repeated heads, active exclusion, belt datum correction, round trips and invalid state rejection passed.');
