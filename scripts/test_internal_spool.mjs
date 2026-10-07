import fs from 'node:fs';
import assert from 'node:assert/strict';
import {withInternalSpool} from '../site/viewer/internal-spool.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../site/TRIDENT_INTERNAL_SPOOL.json',import.meta.url)));
const registration={assets:{native:{meta:'native.json'}},accessories:[]};
assert.ok(Object.keys(catalog.machines).length>0,'No actual spool installation registered');
for(const machine of Object.keys(catalog.machines)){
 const result=withInternalSpool(registration,catalog,machine),row=result.accessories.at(-1);
 assert.equal(row.id,'trident_internal_spool');
 assert.deepEqual(row.translation_mm,[0,0,0]);
 assert.equal(registration.accessories.length,0);
 for(const mutate of [
  c=>{c.machines[machine].qualification.native_tuple_receipt_sha256='pending'},
  c=>{c.machines[machine].qualification.machine_id='voron_trident_250'},
  c=>{c.machines[machine].qualification.model_sha256='0'.repeat(64)},
  c=>{c.machines[machine].qualification.scope='whole_machine'},
  c=>{c.machines[machine].qualification.filament_route_registered=true},
 ]){
  const broken=structuredClone(catalog);mutate(broken);
  assert.throws(()=>withInternalSpool(registration,broken,machine),/missing or stale/);
 }
 assert.throws(()=>withInternalSpool(result,catalog,machine),/Duplicate/);
}
for(const machine of ['voron_trident_250','voron_trident_1000_custom','voron_v24_350_printed'])assert.equal(withInternalSpool(registration,catalog,machine),registration);
const invalid=structuredClone(catalog);invalid.machines.voron_trident_250=structuredClone(Object.values(catalog.machines)[0]);
assert.throws(()=>withInternalSpool(registration,invalid,'voron_trident_250'),/Unregistered/);
console.log('Current internal spool catalog composition: registered hosts and fixed placement; missing/stale native evidence, unsupported host and duplicate selection rejected. Native fit is inspected separately.');
