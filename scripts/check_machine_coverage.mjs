import fs from 'node:fs';
import assert from 'node:assert/strict';
import {machineChoices} from '../site/viewer/machines.js';
import {machineReviewInputs} from './machine_review_inputs.mjs';
import {assertViewerMeshQuality} from './viewer_mesh_quality_scope.mjs';
const suites={
 elegoo_neptune3:['elegoo_reference'],
 virtu:['source_assembly_assets','source_gallery_bindings'],e3ng:['source_assembly_assets','source_gallery_bindings','e3ng_loom_route','e3ng_installations','e3ng_scene_integration','e3ng_mods','e3ng_mod_controls'],
 '247zero':['community_state','247zero'],
 doomcube:['community_state','doomcube'],
 tictac:['community_state','requested_assemblies','native_motion_profiles'],the100:['community_state','requested_assemblies','native_motion_profiles'],rook:['community_state','requested_assemblies','native_motion_profiles'],satsuma:['community_state','requested_assemblies','native_motion_profiles'],
 sovol_sv08:['community_state','sovol_reference','native_motion_profiles'],
 lh_stinger:['stinger'],aether:['community_state'],vminion:['community_state','eva_options'],snakeoil_xy:['community_state'],snakeoil_3s:['community_state'],proosaxy:['community_state'],mercury:['community_state','mercury_tubes'],vzbot:['community_state'],ender3:['community_state','ender_bowden','ender_installation_selection'],sboom:['community_state'],
 switchwire:['community_state','switchwire_catalog','chain_moving_anchor'],
 positron:['positron_state','positron_storage'],annex_k1:['machine_navigation','native_motion_profiles'],annex_k2:['machine_navigation','native_motion_profiles'],annex_k3:['machine_navigation','native_motion_profiles'],remorph:['machine_navigation'],crossant:['crossant_state'],vcore4:['ratrig'],vcore3:['community_state','eva_installations','eva_options'],
 trident:['rear_enclosures','trident_motion','bed_chain','printer_gantry','machine_heads','changer_bank','probe_clearance'],v24:['rear_enclosures','v24_adapter','v24_belts','printer_gantry','machine_heads','changer_bank','probe_clearance'],v0:['v0_belts','v0_installations','v0_mod_selection','v0_native_installed_gate','v0_assembly','v0_assembly_app','v0_feet_assembly','v0_idler_assembly'],micron:['micron_adapter','micron_belts','micron_tubes']
};
const required=['flex_route_quality','viewer_mesh_quality_scope','appearance_roles','palette_controller','scene_lighting','lighting_animation','export_camera','orbit_touch','responsive_camera','selection_regressions','workspace_runtime','multilingual','german_language','machine_selection','model_progress','device_memory','siboor_sizes'];
const machines=machineChoices.filter(m=>m.available!==false);
assert.equal(new Set(machines.map(m=>m.id)).size,machines.length);
for(const machine of machines){
 assert(machine.page&&suites[machine.family],`Missing review registration: ${machine.id}`);
 for(const test of [...required,...suites[machine.family]])assert(fs.existsSync(new URL(`./test_${test}.mjs`,import.meta.url)),`Missing ${test} for ${machine.id}`);
}
if(!process.argv.includes('--registration-only')){
 const coverage=JSON.parse(fs.readFileSync(new URL('../docs/MACHINE_REVIEW_COVERAGE.json',import.meta.url)));
 assert.deepEqual(coverage.input_sha256,machineReviewInputs(),'Machine review is stale: rerun actual asset/motion audits and refresh docs/MACHINE_REVIEW_COVERAGE.json.');
 assert.deepEqual(coverage.machines.map(m=>m.id).sort(),machines.map(m=>m.id).sort(),'Every available machine needs an actual model review row.');
 for(const machine of machines){
  const row=coverage.machines.find(r=>r.id===machine.id);
  assert.equal(row.family,machine.family);
  assertViewerMeshQuality(row);
  assert(/^[a-f0-9]{64}$/.test(row.model_sha256)&&row.mesh_quality_verified===true,`Missing actual model review: ${machine.id}`);
  assert(['sampled_native_motion','native_reference_assembly','sampled_source_controller'].includes(row.motion_scope)&&row.evidence.length>0,`Missing scoped native evidence: ${machine.id}`);
  assert.equal(row.full_physical_fit_certified,false,'Sampled viewer checks must not certify all physical fit.');
 }
}
console.log(JSON.stringify({passed:true,available_machines:machines.length,families:[...new Set(machines.map(m=>m.family))],machines:machines.map(m=>({id:m.id,family:m.family,regressions:suites[m.family]})),scope:'Required regression coverage; model, solid-clearance and browser evidence must be reviewed separately.'}));
