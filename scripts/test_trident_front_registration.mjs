import assert from 'node:assert/strict';
import {tridentFrontRegistration} from '../site/viewer/trident-front-registration.mjs';
const profile={machine_id:'voron_trident_350',size_mm:350};
const metadata={id:'voron_trident_350_base',parts:[
 {key:'voron_trident_350_base_825',source_leaf:'825',name:'front_skirt_left_350',motion:'fixed',appearance_role:'base',source_component:'Skirt:1/Front:1/Left:1/front_skirt_left_350:1',bounds_mm:[[-173.5,-255,-66.000113854177],[-9.5,-235,.8]]},
 {key:'voron_trident_350_base_852',source_leaf:'852',name:'front_skirt_right_350',motion:'fixed',appearance_role:'base',source_component:'Skirt:1/Front:1/Right:1/front_skirt_right_350:1',bounds_mm:[[9.499884575971,-255,-66.000113854187],[173.499884775972,-235,.8]]},
]};
const original=structuredClone(metadata),registration=tridentFrontRegistration(profile,metadata);
assert.deepEqual(metadata,original);assert.equal(registration.size,2);
assert.deepEqual(registration.get(metadata.parts[0].key).registered_bounds_mm,[[-223.5,-255,-66.000113854177],[-59.5,-235,.8]]);
// Rebuilt source assemblies already at their bore-derived positions must not move twice.
const corrected=structuredClone(metadata);for(const p of corrected.parts)p.bounds_mm=registration.get(p.key).registered_bounds_mm;
assert([...tridentFrontRegistration(profile,corrected).values()].every(r=>r.delta_mm===0));
for(const id of ['voron_trident_250','voron_trident_300','voron_trident_500_custom','voron_trident_1000_custom','voron_trident_350_half_z','siboor_trident_350'])assert.equal(tridentFrontRegistration({...profile,machine_id:id},metadata).size,0);
assert.equal(tridentFrontRegistration(profile,{...metadata,id:'sb_revo_voron'}).size,0);
for(const mutate of [m=>m.parts.pop(),m=>m.parts[0].source_leaf='826',m=>m.parts[0].motion='z',m=>m.parts[0].appearance_role='hardware',m=>m.parts[0].bounds_mm[0][0]+=.01]){const m=structuredClone(metadata);mutate(m);assert.throws(()=>tridentFrontRegistration(profile,m));}
assert.throws(()=>tridentFrontRegistration({...profile,size_mm:300},metadata));
console.log('Native Trident350 front source registration and unchanged rebuild/hardware guards passed.');
