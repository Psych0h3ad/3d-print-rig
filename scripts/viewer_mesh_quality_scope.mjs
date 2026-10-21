import assert from 'node:assert/strict';
const hash64 = value => typeof value==='string'&&/^[a-f0-9]{64}$/.test(value);
function assertStaticElegooReview(row){
 const c=row.current_controller_review,s=c.static_reference_review,d=s?.displayReview,q=row.viewer_mesh_quality;
 assert.equal(c.sampled_pose_reset_palette_passed,false,`Static reference must not claim motion/palette: ${row.id}`);
 assert.equal(row.motionVerified,false,`Static motion capability must be disabled: ${row.id}`);
 assert.equal(row.printedPalette,false,`Static printed palette must be disabled: ${row.id}`);
 assert(hash64(row.model_sha256)&&hash64(c.report_evidence_sha256),`Missing exact static model/report hash: ${row.id}`);
 assert.equal(s?.schema,'elegoo-static-source-state-v1',`Missing static controller review: ${row.id}`);
 assert.equal(s.scope,'static/native_reference_assembly');
 assert.equal(s.evidence_kind,'cpu-scene-state');
 assert.equal(s.model_sha256,row.model_sha256,`Stale static model: ${row.id}`);
 assert(hash64(s.identity_evidence_sha256)&&q.evidence_sha256.includes(s.identity_evidence_sha256),`Missing static identity evidence: ${row.id}`);
 for(const field of ['source_state_preserved','actual_exported_input_identity_verified','finite_positions_and_world_matrices',
   'all_source_parts_present','proper_rigid_basis','precise_source_bounds_verified','material_identity_preserved',
   'native_vertex_colors_preserved','native_reference_reset_passed'])
  assert.equal(s[field],true,`Missing static ${field}: ${row.id}`);
 assert.equal(s.source_bound_tolerance_mm,.01,`Changed static bound tolerance: ${row.id}`);
 assert(Number.isFinite(s.max_source_bound_error_mm)&&s.max_source_bound_error_mm>=0&&s.max_source_bound_error_mm<=.01,`Invalid precise static source bounds: ${row.id}`);
 assert.equal(s.browser_or_gpu_reviewed,false,`CPU static evidence must not claim browser/GPU review: ${row.id}`);
 assert.equal(d?.passed,true,`Missing actual static display review: ${row.id}`);
 assert.match(d.scope,/^CPU scene-state\//);
 for(const field of ['cameraReferenceReset','sourceAssemblyUnchanged','productionAssembler','productionLightingHelper','savedViewContractRoundtrip'])
  assert.equal(d[field],true,`Missing static display/reset ${field}: ${row.id}`);
 for(const field of ['motionExercised','paletteExercised','motionSupported','printedPaletteSupported'])
  assert.equal(d[field],false,`Unsupported static capability ${field}: ${row.id}`);
 assert(Array.isArray(d.stages)&&d.stages.length===3,`Missing static A-B-A evidence: ${row.id}`);
 for(const [i,stage] of d.stages.entries()){
  assert.equal(stage.dark,i===1);assert.equal(stage.grid,i===1);assert.equal(stage.savedViewRoundtrip,true);
  assert(hash64(stage.sourceAssemblyFingerprint),`Missing static source-state fingerprint: ${row.id}`);
  assert.equal(stage.sourceAssemblyFingerprint,d.stages[0].sourceAssemblyFingerprint,`Static source state changed: ${row.id}`);
  assert.equal(stage.lighting?.darkRoom,false);
  assert(/^#[a-fA-F0-9]{6}$/.test(stage.lighting.background));
  for(const field of ['environmentIntensity','ambientIntensity','daylightScale','exposure'])assert(Number.isFinite(stage.lighting[field]));
 }
 assert.deepEqual(d.stages[0],d.stages[2],`Static A state not restored: ${row.id}`);
 assert.notDeepEqual(d.stages[0].lighting,d.stages[1].lighting,`No contrasting theme tested: ${row.id}`);
 const issues=s.source_issues;
 assert.equal(issues?.retained,true,`Missing original source issue disposition: ${row.id}`);
 assert.equal(issues.repaired,false,`Static gate must not claim source repair: ${row.id}`);
 assert.equal(q.source_face_orientation_verified,false,`Do not mask upstream facet orientation: ${row.id}`);
 for(const [sourceField,qualityField] of [['strictDegenerateTriangles','exact_zero_area_source_primitives_retained'],['opposedMeanNormals','negative_average_vertex_dot_diagnostic']]){
  assert(Number.isSafeInteger(issues[sourceField])&&issues[sourceField]>=0,`Missing original facet count: ${row.id}`);
  assert.equal(q[qualityField],issues[sourceField],`Source facet diagnostics were masked: ${row.id}`);
 }
}

// The report hash belongs to the complete actual-asset report, outside this
// derived coverage object, avoiding a self-referential evidence hash.
export function staticElegooCoverageFields(report,reportEvidenceSHA256){
 assert.equal(report.status,'PASS_STATIC_REFERENCE');
 assert.equal(report.inspection_scope,'static/native_reference_assembly');
 assert.equal(report.browserOrGPUReviewed,false);
 assert.equal(report.motionExercised,false);assert.equal(report.paletteExercised,false);
 const d=report.displayReview,issues=report.sourceIssues;
 const fields={id:report.id,family:'elegoo_neptune3',motion_scope:'native_reference_assembly',static_reference:true,
  model_sha256:report.model_sha256,mesh_quality_verified:true,motionVerified:d?.motionSupported,printedPalette:d?.printedPaletteSupported,
  viewer_mesh_quality:structuredClone(report.viewer_mesh_quality),known_required_companion_failures:[],full_physical_fit_certified:false,
  current_controller_review:{model_sha256:report.model_sha256,sampled_pose_reset_palette_passed:false,report_evidence_sha256:reportEvidenceSHA256,
   static_reference_review:{schema:'elegoo-static-source-state-v1',scope:'static/native_reference_assembly',evidence_kind:'cpu-scene-state',
    model_sha256:report.model_sha256,identity_evidence_sha256:report.identity_evidence?.sha256,
    source_state_preserved:d?.sourceAssemblyUnchanged,actual_exported_input_identity_verified:report.viewer_mesh_quality?.actual_exported_input_identity_verified,
    finite_positions_and_world_matrices:report.viewer_mesh_quality?.finite_positions_and_world_matrices,
    all_source_parts_present:report.all_source_parts_present,proper_rigid_basis:report.properRigidBasis,
    precise_source_bounds_verified:Number.isFinite(report.max_source_bound_error_mm)&&report.max_source_bound_error_mm>=0&&report.max_source_bound_error_mm<=.01,
    source_bound_tolerance_mm:.01,max_source_bound_error_mm:report.max_source_bound_error_mm,
    material_identity_preserved:d?.sourceAssemblyUnchanged,native_vertex_colors_preserved:d?.sourceAssemblyUnchanged,
    native_reference_reset_passed:d?.cameraReferenceReset&&d?.sourceAssemblyUnchanged,browser_or_gpu_reviewed:report.browserOrGPUReviewed,
    displayReview:structuredClone(d),source_issues:structuredClone(issues)}}};
 assertViewerMeshQuality(fields);
 return fields;
}

export function assertViewerMeshQuality(row){
 const q=row.viewer_mesh_quality;
 assert.equal(q?.schema,'actual-viewer-mesh-quality-v1',`Missing current viewer mesh scope: ${row.id}`);
 assert.equal(q.model_sha256,row.model_sha256,`Different viewer mesh revision: ${row.id}`);
 assert.equal(q.actual_exported_input_identity_verified,true,`Missing actual model bytes: ${row.id}`);
 assert.equal(q.finite_positions_and_world_matrices,true,`Nonfinite actual geometry: ${row.id}`);
 assert(q.meshes>0&&q.triangles>0,`Empty actual model: ${row.id}`);
 assert.equal(q.nonunit_consumed_vertex_normals,0,`Invalid consumed normals: ${row.id}`);
 assert.equal(q.zero_normals_on_drawn_nondegenerate_smooth_faces,0,`Zero consumed normals: ${row.id}`);
 assert.equal(q.missing_NORMAL_requiring_shader_input,0,`Missing required shader normals: ${row.id}`);
 assert(['unit-vertex-normals','unit-vertex-and-actual-flat-derivative'].includes(q.actual_normal_method),`Unknown actual normal method: ${row.id}`);
 assert(q.evidence_sha256?.length&&q.evidence_sha256.every(h=>/^[a-f0-9]{64}$/.test(h)),`Missing actual inspection evidence: ${row.id}`);
 assert.equal(row.mesh_quality_verified,true,`Unqualified viewer mesh scope: ${row.id}`);
 assert.equal(row.current_controller_review?.model_sha256,row.model_sha256,`Different current controller model: ${row.id}`);
 if(row.family==='elegoo_neptune3'&&row.motion_scope==='native_reference_assembly'&&row.static_reference===true)
  assertStaticElegooReview(row);
 else assert.equal(row.current_controller_review?.sampled_pose_reset_palette_passed,true,`Missing current controller review: ${row.id}`);
 assert(Array.isArray(row.known_required_companion_failures),`Unknown required companion disposition: ${row.id}`);
 assert.equal(row.known_required_companion_failures.length,0,`Missing genuine required companions: ${row.id}: ${row.known_required_companion_failures.join('; ')}`);
 return true;
}
