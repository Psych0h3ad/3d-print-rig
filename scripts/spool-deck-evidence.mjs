import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';

export const spoolDeckProofSha256='f7db9df6129a5ace34191b9687d0ceec0279e81b24ad9a7a8dba3663d6dbe6bd';
export function qualifiedSpoolHostManifest(machine,row,raw){
 if(!row.host_delta)return row.qualification.machine_manifest_sha256;
 assert(['voron_trident_300','voron_trident_350'].includes(machine),'Unreviewed spool host delta');
 assert.equal(createHash('sha256').update(raw).digest('hex'),spoolDeckProofSha256,'Spool deck native evidence changed');
 const proof=JSON.parse(raw),delta=row.host_delta,observed=proof.machines[machine];
 assert.equal(proof.schema,'internal-spool-rear-deck-delta-103');
 assert.equal(delta.schema,proof.schema);assert.equal(delta.evidence_sha256,spoolDeckProofSha256);
 assert.equal(delta.evidence_document,'docs/TRIDENT_SPOOL_DECK_DELTA_103.json');
 assert.deepEqual(observed.original_qualification,row.qualification,'Original spool native receipt was relabeled');
 assert.equal(observed.original_manifest_sha256,row.qualification.machine_manifest_sha256);
 assert.equal(observed.unchanged_profile_sha256,row.qualification.machine_profile_sha256);
 assert.equal(observed.native_bindings_sha256,row.qualification.native_bindings_sha256);
 assert.equal(observed.original_native_receipt_sha256,row.qualification.native_tuple_receipt_sha256);
 for(const key of ['original_manifest_sha256','current_manifest_sha256','current_model_sha256','unchanged_profile_sha256'])assert.equal(delta[key],observed[key]);
 assert.equal(observed.native_part_count,190);assert(observed.minimum_added_material_distance_mm>0);
 assert.equal(observed.all_added_material_native_common_solids,0);assert.equal(observed.all_added_material_native_common_volume_mm3,0);
 assert.equal(observed.removed_material_volume_mm3,0);assert.equal(observed.retained_native_scope,'rigid_holder_and_guides_only');
 assert.equal(observed.filament_route_registered,false);assert.equal(observed.whole_machine_certified,false);assert.equal(delta.whole_machine_certified,false);
 return observed.current_manifest_sha256;
}
