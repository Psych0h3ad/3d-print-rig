import assert from 'node:assert/strict';
import {bankChoices,bankSpec,bankSystem,variantBankSystem,initialBank,normalizeBank,bankPlan,bankStateForVariant,bankBedReferenceDrop} from '../site/viewer/changer-bank-model.mjs';

const madmax={id:'installed_madmax',source_head_configuration:'native_madmax',toolhead:'xol',mount:'madmax',registration_source:'madmax_xol',gantry:'r2',belt_width_mm:6,machine_head:{},fit:{nozzle_mm:[0,-40,302.18]}};
const sc={id:'installed_sc',source_head_configuration:'native_sc',toolhead:'xol',mount:'stealthchanger',gantry:'r2',machine_head:{}};
const data={profiles:[{selection:{toolhead:'xol'}}],machines:{trident:{capacity:4,bank_permitted:false,printing_blocked_reason:'Standard SC bed collision',bed_reference_top_mm:303.25,bed_max_up_mm:9.3},toolhead:{capacity:4}}};
const before=JSON.stringify(data);
for(const machine_id of ['trident','toolhead']){
 const catalog={machine_id,variants:[madmax,sc]},state=initialBank(catalog,data,'r2','madmax');
 assert.equal(variantBankSystem(madmax),'madmax');assert.equal(bankSystem(state),'madmax');
 assert.deepEqual(bankChoices(catalog,data,'r2','madmax'),[madmax]);assert.equal(bankChoices(catalog,data,'awd','madmax').length,0);
 assert.deepEqual(normalizeBank(JSON.parse(JSON.stringify(state)),catalog,data,'r2'),state);
 assert.deepEqual(bankPlan(state,catalog,data,madmax).instances,[]);
 assert.equal(bankSpec(data,'madmax').machines[machine_id].docking_registered,false);
 assert.throws(()=>bankPlan({...state,enabled:true},catalog,data,madmax),/MadMax/);
 assert.throws(()=>normalizeBank({...state,tools:['native_sc']},catalog,data,'r2'),/登録されていない/);
 assert.throws(()=>normalizeBank({...state,tools:['native_madmax','native_madmax']},catalog,data,'r2'),/台数/);
 assert.deepEqual(bankStateForVariant({enabled:false,tools:['native_sc'],active:0},madmax,catalog,data),state);
 assert.throws(()=>bankStateForVariant({enabled:false,tools:[],active:0},madmax,catalog,data),/台数/);
 assert.throws(()=>bankStateForVariant({enabled:false,tools:['native_sc'],active:2},madmax,catalog,data),/台数/);
 assert.throws(()=>bankStateForVariant({...state,system:'stealthchanger'},madmax,catalog,data),/一致/);
 assert.throws(()=>bankStateForVariant(state,sc,catalog,data),/一致/);
 assert.deepEqual(bankStateForVariant(state,madmax,catalog,data),state);
}
assert.equal(bankBedReferenceDrop({machine_id:'trident'},data,{},madmax),303.25-302.18);
assert.equal(variantBankSystem({toolhead:'indx',mount:'fixed'}),'indx');assert.equal(variantBankSystem(sc),'stealthchanger');
assert.throws(()=>bankSystem({system:'unknown'}),/未登録/);
assert.equal(JSON.stringify(data),before);
console.log('MadMax Trident mode, saved-state migration, independent dock scope, no SC fixture reuse, and native nozzle datum passed.');
