import assert from 'node:assert/strict';
import {access} from 'node:fs/promises';
import path from 'node:path';
import {machineChoices,machineFamilies,machineVendors,machineOptions,resolveMachine,machinePage} from '../site/viewer/machines.js';
assert.equal(new Set(machineChoices.map(m=>m.id)).size,machineChoices.length);
assert.deepEqual(machineOptions({family:'trident',vendor:'voron'},'size'),[250,300,350]);
for(const size of [250,300,350])assert.equal(machinePage('voron_trident_'+size),'./trident.html');
let transitions=0;
for(const m of machineChoices){
 assert(machineFamilies[m.family]&&machineVendors[m.vendor]&&[120,180,250,300,350].includes(m.size));
 for(const dimension of ['family','vendor','size','id']){
  assert(machineOptions(m,dimension).includes(m[dimension]));
  for(const value of machineOptions(m,dimension)){
   const next=resolveMachine({...m,[dimension]:value},dimension);assert.equal(next[dimension],value);assert(machineChoices.includes(next));transitions++;
  }
 }
 if(m.available!==false){assert.equal(machinePage(m.id),m.page);await access(path.resolve('site/viewer',m.page==='./'?'index.html':m.page))}
 else assert.equal(machinePage(m.id),undefined);
}
const fysetc=machineChoices.find(m=>m.id==='fysetc_v24_250_pro');assert.equal(fysetc.vendor,'fysetc');assert.equal(fysetc.family,'v24');assert.equal(fysetc.size,250);assert(fysetc.page);
for(const m of machineChoices.filter(m=>m.vendor==='fysetc'&&m.id!==fysetc.id)){assert.equal(m.available,false);assert(m.unavailable_reason)}
assert.equal(machineChoices.find(m=>m.id==='siboor_v24_350').vendor,'voron');
console.log(JSON.stringify({machine_specs:machineChoices.length,available:machineChoices.filter(m=>m.available!==false).length,grouped_selector_transitions:transitions}));
