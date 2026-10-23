// Source-owned manufacturing helper omission. This is not a mounting certificate.
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {geometryBufferIdentity} from './yavoth-cowl-identity.mjs';
const witness=JSON.parse(readFileSync(new URL('./fixtures/yavoth9-support.json',import.meta.url),'utf8'));
export function assertYavothSupportMetadata(meta){
 const r=meta?.manufacturing_support_omission;
 assert(r,'Missing author support-omission notice');
 for(const [key,value]of Object.entries({source_repository:witness.source_repository,source_revision:witness.source_revision,source_step_sha256:witness.source_step_sha256,source_entity:809,source_body_name:'Support',retained_entity:810,source_occurrence:30,removed_triangles:256,retained_triangles:6176,all_vertex_attributes_unchanged:true,retained_triangle_indices_original_subsequence:true,native_mounting_qualified:false}))assert.equal(r[key],value,'Wrong author support identity or scope '+key);
 assert.deepEqual(meta.omitted_separate_support_keys,['alternative_mounts_30/Support#809'],'Missing separate support identity');
 assert(meta.support_removal_notice?.includes('manufacturing support'),'Missing visible support notice');
 assert.equal(meta.prepared_step_available,false,'Original source STEP must not be advertised as the filtered display');
 assert.equal(meta.step,undefined,'Unfiltered STEP advertised as selected carriage');
 assert.equal(meta.native_export_available,false,'Unfiltered native body advertised as selected carriage');
 assert.equal(meta.parts?.length,1,'Unexpected carriage source leaf count');
 assert.equal(meta.parts[0].file,undefined,'Unfiltered native body retained as current export');
 assert.equal(meta.parts[0].native_export_available,false,'Unfiltered part body advertised as selected carriage');
 assert.equal(meta.parts[0].source_native_solids,2,'Original native source scope lost');
 return r;
}
export function assertYavothSupportOmission(id,asset){
 if(id!==witness.module)return null;
 assertYavothSupportMetadata(asset.meta);
 assert.equal(asset.entries.length,1,'Extra or missing Yavoth carriage leaf');
 const row=asset.entries[0];assert.equal(String(row.key),witness.key,'Changed stable carriage identity');
 const identity=geometryBufferIdentity(row.mesh.geometry);
 assert.equal(identity.position.type,'Float32Array');assert.equal(identity.position.itemSize,3);
 assert.equal(identity.position.count,witness.position_count,'Trimmed source position attributes');
 assert.equal(identity.position.sha256,witness.position_sha256,'Changed structural carriage positions');
 assert.equal(identity.index?.type,'Uint32Array');assert.equal(identity.index.count,witness.retained_triangles*3,'Manufacturing helper retained or main triangles removed');
 assert.equal(identity.index.sha256,witness.retained_index_sha256,'Not the exact retained source main-body subsequence');
 assert.equal(identity.draw_range.start,0);assert(['full',identity.index.count].includes(identity.draw_range.count),'Carriage draw range clips the main body');
 if(identity.groups.length)assert.deepEqual(identity.groups,[{start:0,count:identity.index.count,materialIndex:0}],'Carriage material groups clip or duplicate the main body');
 return {source_entity:809,retained_entity:810,removed_triangles:256,retained_triangles:6176,actual_buffers:identity,whole_mount_certified:false};
}
