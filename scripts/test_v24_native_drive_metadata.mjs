import assert from 'node:assert/strict';
import {v24NativeDriveMetadata,withV24NativeDriveMetadata,assertV24NativeDriveVariant} from '../site/viewer/v24-drive-metadata.mjs';
const profiles=[{"machine_id":"voron_v24_250_ldo_cnc","cnc":{"repository":"VCProjects/LDO_AWD","commit":"946c81462a966bab11b8b9722dad83876d2b8b59","native_drive_leaves":211,"xy_drive_count":4,"xy_z_joints":"printed, as in the manufacturer CAD","siboor_chaoticlab_kit_identical":false},"xy_belt_width_mm":6},{"machine_id":"voron_v24_300_ldo_cnc","cnc":{"repository":"VCProjects/LDO_AWD","commit":"946c81462a966bab11b8b9722dad83876d2b8b59","native_drive_leaves":211,"xy_drive_count":4,"xy_z_joints":"printed, as in the manufacturer CAD","siboor_chaoticlab_kit_identical":false},"xy_belt_width_mm":6},{"machine_id":"voron_v24_350_ldo_cnc","cnc":{"repository":"VCProjects/LDO_AWD","commit":"946c81462a966bab11b8b9722dad83876d2b8b59","native_drive_leaves":211,"xy_drive_count":4,"xy_z_joints":"printed, as in the manufacturer CAD","siboor_chaoticlab_kit_identical":false},"xy_belt_width_mm":6}];
const catalog={variants:[{id:'stock',gantry:'machine_gantry',belt_width_mm:6,xy_motors:2},{id:'trinity',gantry:'machine_gantry',belt_width_mm:6,xy_motors:2},{id:'monolith',gantry:'monolith_9',belt_width_mm:9,xy_motors:4}]};
const original=JSON.stringify(catalog);let refusals=0;
for(const profile of profiles){
 const machine=profile.machine_id,result=withV24NativeDriveMetadata(catalog,machine,profile);
 assert.equal(v24NativeDriveMetadata(machine,profile).xy_drive_count,4);
 assert.deepEqual(result.variants.map(v=>v.xy_motors),[4,4,4]);
 for(const v of catalog.variants.slice(0,2)){assert.throws(()=>assertV24NativeDriveVariant(v,machine,profile));refusals++;}
 for(const mutate of [p=>p.cnc.xy_drive_count=2,p=>p.cnc.native_drive_leaves=210,p=>p.cnc.commit='0'.repeat(40),p=>p.cnc.repository='unproved/CNC',p=>p.xy_belt_width_mm=9,p=>p.machine_id='unproved']){const bad=structuredClone(profile);mutate(bad);assert.throws(()=>v24NativeDriveMetadata(machine,bad));refusals++;}
 assert.throws(()=>v24NativeDriveMetadata(machine,null));refusals++;
}
assert.throws(()=>v24NativeDriveMetadata('siboor_v24_350',profiles[0]));refusals++;
assert.equal(JSON.stringify(catalog),original);
assert.equal(withV24NativeDriveMetadata(catalog,'voron_v24_350_printed',{machine_id:'voron_v24_350_printed'}),catalog);
assert.equal(withV24NativeDriveMetadata(catalog,'siboor_v24_350',{machine_id:'siboor_v24_350'}),catalog);
console.log(JSON.stringify({passed:true,actual_source_profiles:profiles.length,rejected_bad_metadata_or_variants:refusals,raw_registry_mutated:false,head_placement_claim:false}));
