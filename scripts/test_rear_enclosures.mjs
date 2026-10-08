import fs from 'node:fs';import assert from 'node:assert/strict';
import {nativeWitnessBundle} from './trident-deck-evidence.mjs';
const proof=JSON.parse(fs.readFileSync(new URL('../site/REAR_ENCLOSURE_QA.json',import.meta.url))),bundle=JSON.parse(fs.readFileSync(new URL('../site/ASSET_BUNDLE.json',import.meta.url)));
assert.equal(proof.model_bundle_sha256,nativeWitnessBundle(new URL('../site/',import.meta.url),bundle,'REAR_ENCLOSURE_QA.json'));assert(proof.trident.all_passed&&proof.v24.all_passed&&proof.retention.all_passed);
assert.equal(Object.keys(proof.retention.changed_machines).length,9);assert.equal(proof.native_parts.length,18);assert(proof.retention.minimum_y_separation_mm>30);
for(const row of [...proof.trident.machines,...proof.v24.machines]){
 assert(/^[a-f0-9]{64}$/.test(row.model_sha256));
 for(const p of row.native_parts||[])assert((p.central_exhaust_interface_difference_mm3??p.native_exhaust_interface_difference_mm3)<1e-5);
 for(const hit of row.added_body_contacts||[])if(hit.kind==='retained_native_soft_seal_face_contact')assert(hit.penetration_mm<=hit.original_native_penetration_mm+1e-6&&hit.penetration_mm<.001);else assert((hit.added_body_intersection_mm3??hit.intersection_mm3??0)<.001);
}
console.log('Rear enclosure native delta proof is current; solid, soft-seal and retained mounting scopes remain distinct.');
