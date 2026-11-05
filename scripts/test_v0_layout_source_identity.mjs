import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {v0LayoutDisplayIdentity} from '../site/viewer/v0-layout-source-identity.mjs';
const fixture=JSON.parse(await fs.readFile(new URL('./fixtures/v0-door-source-occurrences.json',import.meta.url),'utf8'));
const metadata=JSON.parse(await fs.readFile(new URL('../site/modules/v0_hinge_source_tessellation.json',import.meta.url),'utf8'));
let negatives=0;
for(const[machineId,row]of Object.entries(fixture.machines)){
 const source=metadata.source_models[machineId],a={machineId,baselineRevision:'a'.repeat(64),manifestSHA256:source.manifest_sha256,profileSHA256:source.profile_sha256,hingeReceipt:{schema:'v0-source-hinge-applied-v1',machine_id:machineId,source_model_sha256:source.model_decoded_sha256,metadata_sha256:'b'.repeat(64),model_decoded_sha256:metadata.model.decoded_sha256,model_stored_sha256:metadata.model.sha256,physical_fit_verified:false},movingKeys:[...row.manualExpected.moving],fixedPivotKeys:[...row.manualExpected.fixedPivot],fixedLatchKeys:[...row.manualExpected.fixedLatch]};
 const before=structuredClone(a),identity=v0LayoutDisplayIdentity(a);
 assert.deepEqual(a,before);assert(Object.isFrozen(identity));assert(Object.isFrozen(identity.moving_door_source_keys));
 assert.deepEqual(v0LayoutDisplayIdentity({...a,movingKeys:[...a.movingKeys].reverse(),fixedPivotKeys:[...a.fixedPivotKeys].reverse(),fixedLatchKeys:[...a.fixedLatchKeys].reverse()}),identity);
 for(const field of ['baselineRevision','manifestSHA256','profileSHA256']){assert.notDeepEqual(v0LayoutDisplayIdentity({...a,[field]:'c'.repeat(64)}),identity);assert.throws(()=>v0LayoutDisplayIdentity({...a,[field]:'not-a-hash'}));negatives++}
 for(const field of ['source_model_sha256','metadata_sha256','model_decoded_sha256','model_stored_sha256']){assert.notDeepEqual(v0LayoutDisplayIdentity({...a,hingeReceipt:{...a.hingeReceipt,[field]:'d'.repeat(64)}}),identity);assert.throws(()=>v0LayoutDisplayIdentity({...a,hingeReceipt:{...a.hingeReceipt,[field]:null}}));negatives++}
 for(const field of ['movingKeys','fixedPivotKeys','fixedLatchKeys']){
  for(const transform of [v=>v.slice(1),v=>[v[0],...v.slice(0,-1)],v=>[null,...v.slice(1)],v=>['other_00001',...v.slice(1)],()=>null]){assert.throws(()=>v0LayoutDisplayIdentity({...a,[field]:transform(a[field])}));negatives++}
 }
 for(const mutate of [b=>b.machineId='unknown',b=>b.hingeReceipt.machine_id='unknown',b=>b.hingeReceipt.schema='old',b=>b.hingeReceipt.physical_fit_verified=true,b=>b.fixedPivotKeys[0]=b.movingKeys[0]]){const bad=structuredClone(a);mutate(bad);assert.throws(()=>v0LayoutDisplayIdentity(bad));negatives++}
 assert.equal(identity.physical_fit_verified,false);assert.equal(identity.source_manifest_sha256,source.manifest_sha256);
}
console.log(`V0 displayed-source identity: two metadata fixtures, deterministic sorted copies and ${negatives} rejection cases. No authentication, real consumer or physical-fit claim.`);
