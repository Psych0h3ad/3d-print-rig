import assert from 'node:assert/strict';
import {assertViewerMeshQuality,staticElegooCoverageFields} from './viewer_mesh_quality_scope.mjs';
import {publicAuditFailure} from './audit_elegoo_assets.mjs';
const hash='a'.repeat(64),row={id:'source-fixture',model_sha256:hash,mesh_quality_verified:true,viewer_mesh_quality:{schema:'actual-viewer-mesh-quality-v1',model_sha256:hash,actual_exported_input_identity_verified:true,finite_positions_and_world_matrices:true,meshes:1,triangles:1,nonunit_consumed_vertex_normals:0,zero_normals_on_drawn_nondegenerate_smooth_faces:0,missing_NORMAL_requiring_shader_input:0,actual_normal_method:'unit-vertex-and-actual-flat-derivative',evidence_sha256:[hash],source_face_orientation_verified:false,exact_zero_area_source_primitives_retained:3,negative_average_vertex_dot_diagnostic:2},current_controller_review:{model_sha256:hash,sampled_pose_reset_palette_passed:true},known_required_companion_failures:[],full_physical_fit_certified:false};
assert(assertViewerMeshQuality(row));
for(const mutate of[
 r=>r.viewer_mesh_quality.meshes=0,r=>r.viewer_mesh_quality.triangles=0,r=>r.viewer_mesh_quality.model_sha256='b'.repeat(64),
 r=>r.viewer_mesh_quality.actual_exported_input_identity_verified=false,r=>r.viewer_mesh_quality.finite_positions_and_world_matrices=false,
 r=>r.viewer_mesh_quality.nonunit_consumed_vertex_normals=1,r=>r.viewer_mesh_quality.zero_normals_on_drawn_nondegenerate_smooth_faces=1,
 r=>r.viewer_mesh_quality.missing_NORMAL_requiring_shader_input=1,r=>r.viewer_mesh_quality.actual_normal_method='assumed',
 r=>r.viewer_mesh_quality.evidence_sha256=[],r=>r.current_controller_review.sampled_pose_reset_palette_passed=false,
 r=>r.known_required_companion_failures=['actual source fan missing'],r=>delete r.known_required_companion_failures
]){const copy=structuredClone(row);mutate(copy);assert.throws(()=>assertViewerMeshQuality(copy));}
assert.equal(row.full_physical_fit_certified,false);assert.equal(row.viewer_mesh_quality.source_face_orientation_verified,false);
const reportHash='c'.repeat(64),identityHash='d'.repeat(64),fingerprint='e'.repeat(64);
const stage=dark=>({dark,grid:dark,savedViewRoundtrip:true,sourceAssemblyFingerprint:fingerprint,
 lighting:{darkRoom:false,background:dark?'#101820':'#edf1f5',environmentIntensity:.16,ambientIntensity:.25,daylightScale:1,exposure:.9}});
const report={status:'PASS_STATIC_REFERENCE',id:'elegoo-static-fixture',model_sha256:hash,inspection_scope:'static/native_reference_assembly',
 browserOrGPUReviewed:false,motionExercised:false,paletteExercised:false,all_source_parts_present:true,properRigidBasis:true,max_source_bound_error_mm:.000133,
 viewer_mesh_quality:{...structuredClone(row.viewer_mesh_quality),evidence_sha256:[identityHash]},identity_evidence:{sha256:identityHash},
 displayReview:{passed:true,scope:'CPU scene-state/production lighting helper A-B-A and static camera reference reset; no DOM/GPU/UI handler claim',
 stages:[stage(false),stage(true),stage(false)],cameraReferenceReset:true,sourceAssemblyUnchanged:true,productionAssembler:true,
 productionLightingHelper:true,savedViewContractRoundtrip:true,motionExercised:false,paletteExercised:false,motionSupported:false,printedPaletteSupported:false},
 sourceIssues:{retained:true,repaired:false,strictDegenerateTriangles:3,opposedMeanNormals:2}};
const staticRow=staticElegooCoverageFields(report,reportHash);
assert(assertViewerMeshQuality(staticRow));
assert.equal(staticRow.current_controller_review.sampled_pose_reset_palette_passed,false);
assert.equal(staticRow.current_controller_review.report_evidence_sha256,reportHash);
assert.equal(staticRow.current_controller_review.static_reference_review.model_sha256,hash);
assert.equal(staticRow.viewer_mesh_quality.exact_zero_area_source_primitives_retained,3);
assert.equal(staticRow.viewer_mesh_quality.negative_average_vertex_dot_diagnostic,2);
let staticNegatives=0;
function rejects(mutate){const copy=structuredClone(staticRow);mutate(copy);assert.throws(()=>assertViewerMeshQuality(copy));staticNegatives++;}
// Static evidence must never satisfy another family or a dynamic motion scope.
for(const mutate of [r=>r.family='trident',r=>delete r.family,r=>r.motion_scope='sampled_native_motion',r=>delete r.motion_scope,
 r=>r.static_reference=false,r=>delete r.static_reference,r=>r.static_reference='true',
 r=>r.motionVerified=true,r=>delete r.motionVerified,r=>r.printedPalette=true,r=>delete r.printedPalette,
 r=>r.current_controller_review.sampled_pose_reset_palette_passed=true,r=>delete r.current_controller_review.sampled_pose_reset_palette_passed,
 r=>delete r.current_controller_review.static_reference_review,r=>delete r.current_controller_review.report_evidence_sha256,
 r=>r.current_controller_review.report_evidence_sha256='not-a-hash',r=>r.current_controller_review.model_sha256='b'.repeat(64),
 r=>r.current_controller_review.static_reference_review.model_sha256='b'.repeat(64),
 r=>r.current_controller_review.static_reference_review.scope='sampled_native_motion',
 r=>r.current_controller_review.static_reference_review.evidence_kind='browser',
 r=>r.current_controller_review.static_reference_review.identity_evidence_sha256='b'.repeat(64),
 r=>r.current_controller_review.static_reference_review.max_source_bound_error_mm=.010001,
 r=>r.current_controller_review.static_reference_review.max_source_bound_error_mm=NaN,
 r=>r.current_controller_review.static_reference_review.max_source_bound_error_mm=-1,
 r=>r.current_controller_review.static_reference_review.source_bound_tolerance_mm=.1,
 r=>r.current_controller_review.static_reference_review.browser_or_gpu_reviewed=true,
 r=>delete r.current_controller_review.static_reference_review.displayReview,
 r=>r.current_controller_review.static_reference_review.displayReview.stages.pop(),
 r=>r.current_controller_review.static_reference_review.displayReview.stages[1].sourceAssemblyFingerprint='b'.repeat(64),
 r=>r.current_controller_review.static_reference_review.displayReview.stages[1].dark=false,
 r=>r.current_controller_review.static_reference_review.displayReview.stages[2].savedViewRoundtrip=false,
 r=>r.current_controller_review.static_reference_review.displayReview.stages[1].lighting=structuredClone(r.current_controller_review.static_reference_review.displayReview.stages[0].lighting),
 r=>r.current_controller_review.static_reference_review.source_issues.retained=false,
 r=>r.current_controller_review.static_reference_review.source_issues.repaired=true,
 r=>delete r.current_controller_review.static_reference_review.source_issues.strictDegenerateTriangles,
 r=>r.viewer_mesh_quality.exact_zero_area_source_primitives_retained=0,
 r=>r.viewer_mesh_quality.negative_average_vertex_dot_diagnostic=0,
 r=>r.viewer_mesh_quality.source_face_orientation_verified=true])rejects(mutate);
for(const field of ['source_state_preserved','actual_exported_input_identity_verified','finite_positions_and_world_matrices',
 'all_source_parts_present','proper_rigid_basis','precise_source_bounds_verified','material_identity_preserved',
 'native_vertex_colors_preserved','native_reference_reset_passed']){
 rejects(r=>delete r.current_controller_review.static_reference_review[field]);
 rejects(r=>r.current_controller_review.static_reference_review[field]=false);
}
for(const field of ['cameraReferenceReset','sourceAssemblyUnchanged','productionAssembler','productionLightingHelper','savedViewContractRoundtrip'])
 rejects(r=>r.current_controller_review.static_reference_review.displayReview[field]=false);
for(const field of ['motionExercised','paletteExercised','motionSupported','printedPaletteSupported'])
 rejects(r=>r.current_controller_review.static_reference_review.displayReview[field]=true);
// Every original exported-model and companion assertion still applies to static rows.
for(const mutate of [r=>delete r.viewer_mesh_quality,r=>r.mesh_quality_verified=false,
 r=>r.viewer_mesh_quality.meshes=0,r=>r.viewer_mesh_quality.triangles=0,r=>r.viewer_mesh_quality.model_sha256='b'.repeat(64),
 r=>r.viewer_mesh_quality.actual_exported_input_identity_verified=false,r=>r.viewer_mesh_quality.finite_positions_and_world_matrices=false,
 r=>r.viewer_mesh_quality.nonunit_consumed_vertex_normals=1,r=>r.viewer_mesh_quality.zero_normals_on_drawn_nondegenerate_smooth_faces=1,
 r=>r.viewer_mesh_quality.missing_NORMAL_requiring_shader_input=1,r=>r.viewer_mesh_quality.actual_normal_method='assumed',
 r=>r.viewer_mesh_quality.evidence_sha256=[],r=>r.known_required_companion_failures=['actual source fan missing'],r=>delete r.known_required_companion_failures])rejects(mutate);
// Non-ELEGOO dynamic rows retain the exact legacy requirement, even when they carry static metadata.
for(const family of ['trident','v24','e3ng','virtu','other']){
 const dynamic={...structuredClone(row),family,motion_scope:'native_reference_assembly',static_reference:true};
 dynamic.current_controller_review.static_reference_review=structuredClone(staticRow.current_controller_review.static_reference_review);
 assert(assertViewerMeshQuality(dynamic));dynamic.current_controller_review.sampled_pose_reset_palette_passed=false;
 assert.throws(()=>assertViewerMeshQuality(dynamic));staticNegatives++;
}
const strictBoundary=structuredClone(staticRow);strictBoundary.current_controller_review.static_reference_review.max_source_bound_error_mm=.01;
assert(assertViewerMeshQuality(strictBoundary));
assert.throws(()=>staticElegooCoverageFields({...report,status:'FAIL'},reportHash));staticNegatives++;
for(const originalPath of ['C:\\Users\\private\\asset.glb','/tmp/private/asset.glb','file:///home/private/asset.glb']){
 const error=Object.assign(new Error('Cannot inspect '+originalPath),{code:'ERR_ASSERTION'});
 const published=JSON.stringify(publicAuditFailure(error,'fixture'));
 assert(!published.includes(originalPath)&&!published.includes('private')&&!published.includes('stack'));
}
const missing=publicAuditFailure(Object.assign(new Error("ENOENT '/arbitrary/local/root/model.glb'"),{code:'ENOENT'}),'fixture');
assert.equal(missing.status,'FAIL');assert.equal(missing.error_code,'ENOENT');assert(!missing.message.includes('/arbitrary'));
assert.equal(report.displayReview.motionSupported,false);assert.equal(report.sourceIssues.repaired,false);
console.log(JSON.stringify({passed:true,dynamic_negative_controls:13,static_negative_controls:staticNegatives,
 public_failure_path_controls:4,
 scope:'Original dynamic assertions unchanged. ELEGOO-only CPU static source-state/identity/bounds/reset evidence; legacy motion/palette false. Source facets retained, browser and full physical fit separate.'}));
