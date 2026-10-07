import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assertTridentBedRegistration} from '../site/viewer/trident-bed-registration.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/trident-bed-registration-95.json',import.meta.url)));
assertTridentBedRegistration(source.metadata,source.profile);
for(const change of [
 m=>{for(const b of m.parts.find(r=>r.key.endsWith('_1126')).bounds_mm)b[2]-=750},
 m=>{for(const b of m.parts.find(r=>r.key.endsWith('_676')).bounds_mm)b[2]-=750},
 m=>{m.bed_fastener_registration.joints.pop()},
 m=>{m.parts.find(r=>r.key.endsWith('_1130')).native_sha256='0'.repeat(64)},
]){
 const metadata=structuredClone(source.metadata);change(metadata);
 assert.throws(()=>assertTridentBedRegistration(metadata,source.profile),/bed fastener registration changed/);
}
for(const z of [995,1000])assert.throws(()=>assertTridentBedRegistration(source.metadata,{...source.profile,display_limits_mm:{...source.profile.display_limits_mm,Z:[0,z]}}),/bed fastener registration changed/);
console.log('Measured Trident bed registration: fourteen joints accepted; detached source-height nut/bolt, missing joint, stale body and deck-intersecting travel rejected. Actual models and native solids are audited separately.');
