// Small genuine public-source regressions; no synthetic shape/mirror fixtures.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {scanTriangles,verifySourceOwnership,inspectGlb} from './render_geometry_qa.mjs';

const source=JSON.parse(fs.readFileSync(new URL('./fixtures/render_geometry_source_regression.json',import.meta.url),'utf8'));
assert.equal(source.revo_m4.source_step_sha256,'d57ebb2f3daade807e66f1cb1daa0b45c4807b95cffc677290b823e4ea7ab479');
assert.equal(source.revo_m4.source_revision,'88c7758cea9d0d00a54fdb238bedb3b33425f409');
assert.deepEqual(source.revo_m4.triangles.map(t=>t.source_triangle_id),[2264,2318,2325,2378]);
assert.deepEqual(source.revo_m4.triangles.map(t=>t.source_native_face_id),[23,23,24,24]);
const bad=source.revo_m4.triangles.map(t=>({...t,normals:t.original_normals}));
const old=scanTriangles(bad,{worldMatrix:source.revo_m4.actual_world_matrix});
assert.equal(old.passed,false);assert.equal(old.counts.localNormalWindingConflict,4);
assert.equal(old.counts.nonfinite,0);assert.equal(old.counts.nonunitNormals,0);assert.equal(old.counts.zeroArea,0);
const corrected=source.revo_m4.triangles.map(t=>({...t,normals:t.corrected_normals}));
const fixed=scanTriangles(corrected,{worldMatrix:source.revo_m4.actual_world_matrix});assert.equal(fixed.passed,true);
assert.deepEqual(corrected.map(t=>t.positions),bad.map(t=>t.positions));
assert.deepEqual(corrected.map(t=>t.source_native_face_id),bad.map(t=>t.source_native_face_id));
assert.equal(verifySourceOwnership(corrected,corrected).passed,true);assert.equal(verifySourceOwnership(corrected.map((t,i)=>i? t:{...t,source_native_face_id:22}),corrected).passed,false);

assert.equal(source.VIRTU_duct.source_revision,'9f3d9d82097bb929601afd81f6d3ae4ec896e594');
assert.equal(source.VIRTU_duct.source_author_STL_sha256,'644f48983de87d1258d9d3bc71ab037b87716563c86f54f0aa8e2c1e09c59b3e');
const duct=source.VIRTU_duct.triangles.map(t=>({...t,part_key:source.VIRTU_duct.part_key,normals:t.corrected_normals}));
assert.equal(scanTriangles(duct,{worldMatrix:source.VIRTU_duct.actual_world_matrix}).passed,true);
assert.equal(verifySourceOwnership(duct,duct).passed,true);
assert.deepEqual(verifySourceOwnership([],duct).missing,[28747,32258,32505,35313]);
assert.equal(verifySourceOwnership([...duct,duct[0]],duct).passed,false);
// Reproduce the exact failed first-primitive-only query: the four genuine
// triangles belong to the second primitive. Flatten every primitive, keeping
// original source IDs, rather than treating primitive0 as the complete leaf.
const split=[[],duct];assert.equal(verifySourceOwnership(split[0],duct).passed,false);
assert.equal(verifySourceOwnership(split.flat(),duct).passed,true);

// Serialize the genuine source witnesses, then exercise the actual GLB
// accessor/ownership path. A material primitive or encoding child is not a
// new physical leaf; all its original positive triangles must be audited.
function witnessGlb(groups,{encodingChild=false,splitAcrossEncodingChildren=false,spoofTriangleId=false,spoofFaceId=false}={}){
 const bin=[],bufferViews=[],accessors=[],primitives=[];let size=0;
 function attribute(values,type,componentType){const b=Buffer.alloc(values.length*4);values.forEach((v,i)=>componentType===5126?b.writeFloatLE(v,i*4):b.writeUInt32LE(v,i*4));const view=bufferViews.length;bufferViews.push({buffer:0,byteOffset:size,byteLength:b.length});bin.push(b);size+=b.length;const index=accessors.length;accessors.push({bufferView:view,componentType,count:values.length/(type==='VEC3'?3:1),type});return index;}
 for(const rows of groups){if(!rows.length)continue;const q=rows.flatMap(t=>t.positions.flat()),n=rows.flatMap(t=>t.normals.flat()),ids=rows.map(t=>t.source_triangle_id);if(spoofTriangleId)ids[0]++;
  const attributes={POSITION:attribute(q,'VEC3',5126),NORMAL:attribute(n,'VEC3',5126)};
  if(rows.every(t=>t.source_native_face_id!==undefined))attributes._SOURCE_NATIVE_FACE_ID=attribute(rows.flatMap(t=>Array(3).fill(spoofFaceId?22:t.source_native_face_id)),'SCALAR',5125);
  primitives.push({attributes,extras:{original_display_triangle_ids:ids}});
 }
 const key=groups.flat().find(t=>t.part_key)?.part_key||'genuine-source-reference';
 const nodes=splitAcrossEncodingChildren?[{mesh:0,extras:{part_key:key},children:[1]},{mesh:1,extras:{part_key:'encoding-frame-is-not-a-physical-part',technical_rigid_encoding_child:true}}]:encodingChild?[{extras:{part_key:key},children:[1]},{mesh:0,extras:{technical_rigid_encoding_child:true}}]:[{mesh:0,extras:{part_key:key}}];
 const meshes=splitAcrossEncodingChildren?[{primitives:primitives.slice(0,1)},{primitives:primitives.slice(1)}]:[{primitives}];
 const doc={asset:{version:'2.0'},buffers:[{byteLength:size}],bufferViews,accessors,meshes,nodes,scenes:[{nodes:[0]}],scene:0};let json=Buffer.from(JSON.stringify(doc));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const bytes=Buffer.alloc(28+json.length+size);bytes.writeUInt32LE(0x46546c67,0);bytes.writeUInt32LE(2,4);bytes.writeUInt32LE(bytes.length,8);bytes.writeUInt32LE(json.length,12);bytes.writeUInt32LE(0x4e4f534a,16);json.copy(bytes,20);bytes.writeUInt32LE(size,20+json.length);bytes.writeUInt32LE(0x004e4942,24+json.length);Buffer.concat(bin).copy(bytes,28+json.length);return bytes;
}
for(const options of [{},{encodingChild:true},{splitAcrossEncodingChildren:true}]){const r=inspectGlb(witnessGlb([duct.slice(0,1),duct.slice(1)],options),{witnesses:duct,physicalPartKeys:[source.VIRTU_duct.part_key],expectedParts:[{part_key:source.VIRTU_duct.part_key,positive_triangles:4}]});assert.equal(r.passed,true);assert.equal(r.triangles,4);assert.equal(r.all_owned_primitives.length,2);assert.equal(r.source_ownership.expected,4);assert.equal(r.all_physical_part_counts.length,1);assert.equal(r.all_physical_part_counts[0].positive_triangles,4);assert.equal(r.positive_part_count_guard.passed,true);}
assert.equal(inspectGlb(witnessGlb([duct.slice(0,1)]),{expectedParts:[{part_key:source.VIRTU_duct.part_key,positive_triangles:4}]}).positive_part_count_guard.passed,false);
assert.equal(inspectGlb(witnessGlb([duct.slice(0,1)]),{witnesses:duct}).source_ownership.passed,false);
assert.equal(inspectGlb(witnessGlb([duct],{spoofTriangleId:true}),{witnesses:duct}).source_ownership.passed,false);
const revoWitnesses=corrected.map(t=>({...t,part_key:'genuine-source-reference'}));
assert.equal(inspectGlb(witnessGlb([revoWitnesses]),{witnesses:revoWitnesses}).passed,true);
assert.equal(inspectGlb(witnessGlb([revoWitnesses],{spoofFaceId:true}),{witnesses:revoWitnesses}).source_ownership.passed,false);

// One exact original May STL triangle has a single opposed corner even
// though its averaged normal faces forward. Averages cannot certify corners.
const corner=source.single_opposed_source_corner;
assert.equal(corner.source_original_STL_triangle_id,117780);
assert.equal(corner.source_revision,'9f3d9d82097bb929601afd81f6d3ae4ec896e594');
assert.equal(corner.source_triangle_positions_bytes_verified,true);
const cornerBefore=scanTriangles([{positions:corner.positions,normals:corner.original_normals}]);
assert.equal(cornerBefore.counts.localNormalWindingConflict,1);
const cornerAfter=scanTriangles([{positions:corner.positions,normals:corner.corrected_normals}]);
assert.equal(cornerAfter.passed,true);
assert.deepEqual(corner.corrected_normals[0],corner.original_normals[0]);
assert.deepEqual(corner.corrected_normals[2],corner.original_normals[2]);
const tangent=source.source_tangent_world_parity;
assert.equal(tangent.source_product_id,2549935);assert.equal(tangent.source_native_face_id,113);
const exactParity=scanTriangles([{positions:tangent.positions,normals:tangent.normals}],{worldMatrix:tangent.actual_world_matrix});
assert.equal(exactParity.passed,true);
// Actual independently rounded matrix arithmetic disagrees at tangent dot0;
// the exact inverse-transpose/determinant identity needs no angular epsilon.
const tangentResult=(await import('./render_geometry_qa.mjs')).scanTriangle(tangent.positions,tangent.normals,{worldMatrix:tangent.actual_world_matrix});
assert.equal(tangentResult.roundedWorldSignDisagreement,true);

const e=source.source_float32_encoding;assert.equal(e.license,'GPL-3.0');assert.equal(e.original_native_face_id,6);
const collapsed=scanTriangles([{source_triangle_id:e.source_triangle_id,source_native_face_id:e.original_native_face_id,positions:e.bad_definition_local_f32_metres,normals:e.source_normals}]);
assert.equal(collapsed.passed,false);assert.equal(collapsed.counts.zeroArea,1);assert.equal(collapsed.counts.float32CrossCollapse,1);
const restored=scanTriangles([{source_triangle_id:e.source_triangle_id,source_native_face_id:e.original_native_face_id,positions:e.good_face_local_f32_metres,normals:e.source_normals}]);
assert.equal(restored.counts.zeroArea,0);assert.equal(restored.counts.float32CrossCollapse,1); // Genuine source f64-positive / f32-arithmetic cancellation.
const framed=scanTriangles([{source_triangle_id:e.source_triangle_id,source_native_face_id:e.original_native_face_id,positions:e.source_triangle_local_frame_f32_metres,normals:[[0,0,1],[0,0,1],[0,0,1]]}]);assert.equal(framed.passed,true);
for(let i=0;i<3;i++)for(let k=0;k<3;k++){const world=e.source_triangle_frame_origin_mm[k]+e.source_triangle_frame_rotation[k].reduce((s,x,j)=>s+x*e.source_triangle_local_frame_f32_metres[i][j]*1000,0);assert(Math.abs(world-e.source_positions_mm[i][k])<=e.source_triangle_frame_encode_restore_max_error_mm+Number.EPSILON*Math.max(1,Math.abs(world))*32);}
const nativeSource=scanTriangles([{source_triangle_id:e.source_triangle_id,source_native_face_id:e.original_native_face_id,positions:e.source_positions_mm,normals:e.source_normals}]);assert.equal(nativeSource.counts.zeroArea,0);assert.equal(nativeSource.counts.localNormalWindingConflict,0);assert.equal(nativeSource.counts.float32CrossCollapse,1);
// Pin the actual bundled renderer convention, without inventing a reflected
// source object for a synthetic mirror test.
const renderer=fs.readFileSync(new URL('../site/viewer/vendor-r180/three.module.js',import.meta.url),'utf8');
assert(renderer.includes('object.matrixWorld.determinant() < 0'));assert(renderer.includes('if ( frontFaceCW ) flipSided = ! flipSided;'));
console.log('Genuine Creality native faces23/24:4 normal defects rejected/restored;4 VIRTU split-primitive source triangles preserved;original Voron face6 f32 collapse rejected;actual renderer mirror convention checked. Native fit/GPU unclaimed.');
