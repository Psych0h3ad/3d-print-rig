import assert from 'node:assert/strict';
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
 assert.equal(row.current_controller_review?.sampled_pose_reset_palette_passed,true,`Missing current controller review: ${row.id}`);
 assert(Array.isArray(row.known_required_companion_failures),`Unknown required companion disposition: ${row.id}`);
 assert.equal(row.known_required_companion_failures.length,0,`Missing genuine required companions: ${row.id}: ${row.known_required_companion_failures.join('; ')}`);
 return true;
}
