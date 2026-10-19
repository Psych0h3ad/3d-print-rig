import assert from 'node:assert/strict';
import {assertViewerMeshQuality} from './viewer_mesh_quality_scope.mjs';
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
console.log(JSON.stringify({passed:true,scope:'Viewer mesh integrity, actual shading inputs and current sampled controller. Source orientation/full physical fit remain separate; known missing companions always fail.',negative_controls:13}));
