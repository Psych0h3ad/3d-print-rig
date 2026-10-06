import fs from 'node:fs';
import assert from 'node:assert/strict';
import {machineChoices} from '../site/viewer/machines.js';
import {siboorMachine} from '../site/viewer/siboor-catalog.mjs';
import {sizedSiboorCatalog,registerSizedSiboor} from '../site/viewer/siboor-catalog.mjs';
const read=file=>JSON.parse(fs.readFileSync(new URL('../site/'+file,import.meta.url)));
const index=read('SIBOOR_TRIDENT_ASSETS.json');
for(const size of [300,350]){
 const id='siboor_trident_'+size,row=machineChoices.find(m=>m.id===id);
 assert(row&&row.family==='trident'&&row.vendor==='siboor'&&row.size===size&&row.available!==false);
 assert.deepEqual(siboorMachine('https://example.test/viewer/?machine='+id),{id,size,gantryId:'trident_r2_gantry_'+size,maxX:size,maxY:size+10});
}
assert.throws(()=>siboorMachine('https://example.test/?machine=voron_trident_300'));
assert.equal(siboorMachine('https://example.test/').size,350);
const spec=index.machines.siboor_trident_300;
assert.equal(spec.parts,1500);assert.equal(spec.omitted_stock_keys.length,8);
for(const file of ['assembly_manifest.json','flexible_routes.json','model.glb','endstops.glb','COLOR_OPTIONS.json','configurations.json','R2_ENDSTOP_REGISTRATION.json']){
 assert(spec.files[file]?.path.startsWith('siboor-trident-300/'));
 assert(/^[a-f0-9]{64}$/.test(spec.files[file].sha256));
}
const registry={machines:{}},bank={machines:{},indx:{machines:{}}},mods={machines:{}};
registerSizedSiboor(index,registry,bank,mods);
assert.equal(registry.machines.siboor_trident_300.gantries.trident_r2.part_key,'trident_r2_gantry_300_381');
assert.equal(bank.machines.siboor_trident_300.bank_permitted,false);
assert.equal(bank.indx.machines.siboor_trident_300.bank_permitted,false);
const base={machine_id:'siboor_trident_350',assets:{trident_r2_gantry_350:{glb:'modules/trident_r2_gantry_350/model.glb'}},variants:[{id:'r2',notes:['350 mm'],modules:[{id:'trident_r2_gantry_350'}],removed_stock_keys:['Y1_rail_screw_19','keep']}],accessories:[{id:'trident_bedfans',translation_mm:[0,0,0]}]};
const c=sizedSiboorCatalog(base,index,'siboor_trident_300');
assert.equal(base.machine_id,'siboor_trident_350');assert.equal(c.machine_id,'siboor_trident_300');
assert.equal(c.assets.trident_r2_gantry_300.glb,'modules/trident_r2_gantry_300/model.glb');
assert.deepEqual(c.variants[0].removed_stock_keys,['keep']);assert.deepEqual(c.accessories[0].translation_mm,[0,-25,0]);
assert.throws(()=>sizedSiboorCatalog(base,index,'siboor_trident_250'));
console.log('SIBOOR 300/350 selector, size identity, native asset pins, gantry recipes and unregistered dock constraints passed.');
