// Exact qualified public source exports and source-derived rigid placements.
// This contract does not certify closed rear-cover clamping or whole fit.
import fs from'node:fs';
import assert from'node:assert/strict';
import{createHash}from'node:crypto';
export const selectedGeometry=JSON.parse(fs.readFileSync(new URL('./virtu-selected-geometry-contract.json',import.meta.url),'utf8'));
const sha=b=>createHash('sha256').update(b).digest('hex');
export function assertSelectedGeometryPacket(packet){
 const c=selectedGeometry;
 assert.equal(packet.model.sha256,c.model_sha256);assert.equal(packet.inventory.sha256,c.inventory_sha256);
 assert.equal(packet.parts.length,c.owners,'Exact qualified registered owner count');
 const parts=new Map(packet.parts.map(p=>[p.key,p]));assert.equal(parts.size,c.owners,'Duplicate source owner');
 assert.equal(packet.default_variant,c.default_variant);assert.equal(packet.variants.length,Object.keys(c.variants).length);
 assert.equal(new Set(packet.variants.map(v=>v.id)).size,packet.variants.length);
 for(const v of packet.variants){assert(c.variants[v.id],'Unqualified variant');assert.deepEqual(v.visible_keys,c.variants[v.id],'Qualified source visibility mask: '+v.id);if(v.visible_keys.includes('VIRTU-frame-759'))for(const cap of['virtu_may_nonpro_4040_base_front_cap_left','virtu_may_nonpro_4040_base_front_cap_right'])assert(!v.visible_keys.includes(cap),'Incompatible old cap with source 4040 front: '+v.id)}
 assert(!parts.has('VIRTU-frame-nonpro-Y-350'),'Obsolete 2040 front must not replace source 4040');
 assert.equal(packet.variants.find(v=>v.id===packet.default_variant).visible_keys.length,c.default_visible);
 assert.deepEqual(packet.public_head_keys,c.public_head_keys,'Enclosure/frame hardware must not enter Head membership');
 assert.equal(c.hardware58_keys.length,58);assert.equal(c.appended61_keys.length,61);
 for(const r of c.source_bindings){const actual=parts.get(r.key);assert(actual,'Missing qualified source: '+r.key);for(const field of['source_id','source_identity','kind','material_role'])assert.equal(actual[field],r[field],r.key+': '+field);assert.deepEqual(actual.matrix,r.matrix,'Source-derived pose: '+r.key)}
 for(const key of c.appended61_keys){assert(!packet.public_head_keys.includes(key));assert.equal(parts.get(key).kind,'purchased');assert.equal(parts.get(key).material_role,'native')}
 assert.equal(packet.source_public_enclosure_panels.hardware_occurrences,58);
 assert.equal(packet.source_public_enclosure_panels.selected_finite_results.source_reference_M3x6_substitutions,2);
 assert.equal(packet.source_public_enclosure_panels.whole_machine_fit_verified,false);
 assert.equal(c.open_rigid_clamp_gap_mm,0.04999997022366642,'Literal source clamp residual stays OPEN');
 return true;
}
export function assertSelectedMaterial(material,expected,label){
 assert.deepEqual(material.color.toArray(),expected.color,'Purchased source color: '+label);
 for(const field of['opacity','metalness','roughness','transparent'])assert.equal(material[field],expected[field],'Purchased source '+field+': '+label);
 if(expected.original_source_material_id!==null&&expected.original_source_material_id!==undefined){
  assert.equal(material.userData.original_source_material_id,expected.original_source_material_id,'Original front source cut/finish identity');assert(material.userData.original_SimplePhong,'Original source style provenance retained');
 }
}
function packedHash(attribute){
 assert(attribute&&attribute.itemSize===3,'Missing actual source vector attribute');
 const Type=(attribute.isInterleavedBufferAttribute?attribute.data.array:attribute.array).constructor,packed=new Type(attribute.count*3);
 for(let i=0;i<attribute.count;i++){packed[3*i]=attribute.getX(i);packed[3*i+1]=attribute.getY(i);packed[3*i+2]=attribute.getZ(i)}
 return sha(Buffer.from(packed.buffer,packed.byteOffset,packed.byteLength));
}
export function assertSelectedGeometryRig(rig,packet){
 assertSelectedGeometryPacket(packet);assert.equal(rig.parts.size,selectedGeometry.owners);rig.root.updateMatrixWorld(true);const rows=[];
 for(const binding of selectedGeometry.source_bindings){
  const entry=rig.parts.get(binding.key);assert(entry,'Missing actual qualified GLB owner: '+binding.key);
  const delta=Math.max(...entry.node.matrixWorld.elements.map((x,i)=>Math.abs(x-binding.matrix[i])));assert(delta<1e-12,'Actual native source placement: '+binding.key);
  const meshes=[];entry.node.traverse(n=>{if(n.isMesh)meshes.push(n)});assert.equal(meshes.length,binding.primitives.length,'Actual source surface count: '+binding.key);
  let triangles=0;for(let i=0;i<meshes.length;i++){
   const mesh=meshes[i],pr=binding.primitives[i],geometry=mesh.geometry;assert.equal(packedHash(geometry.attributes.position),pr.positions_sha256,'Actual source POSITION: '+binding.key);assert.equal(packedHash(geometry.attributes.normal),pr.normals_sha256,'Actual source NORMAL: '+binding.key);
   const count=(geometry.index?.count??geometry.attributes.position.count)/3;assert.equal(count,pr.triangles);triangles+=count;assertSelectedMaterial(mesh.material,pr.material,binding.key+'/'+i);
  }
  rows.push({key:binding.key,source_id:binding.source_id,triangles,actual_arrays_materials_and_native_pose_match:true,max_matrix_residual:delta});
 }
 return {exact_registered_owners:727,exact_default_mask:697,head_keys:236,new_panels:3,new_hardware:58,source_bound_actual_owners:rows,clamp_datum:{status:'OPEN',gap_mm:selectedGeometry.open_rigid_clamp_gap_mm},whole_fit_claim:false};
}
export function assertSelectedVisibility(rig,packet,expectedKeys){
 const effective=node=>{for(let n=node;n;n=n.parent)if(!n.visible)return false;return true};
 for(const key of[...selectedGeometry.appended61_keys,'VIRTU-frame-759','virtu_may_nonpro_4040_base_front_cap_left','virtu_may_nonpro_4040_base_front_cap_right'])assert.equal(effective(rig.parts.get(key).node),expectedKeys.has(key),'Actual selected source visibility: '+key);
 for(const key of['VIRTU-Z-left-original-RH3D-public-NEMA17-34','VIRTU-Z-right-original-RH3D-public-NEMA17-34','VIRTU-Z-rear-original-RH3D-public-NEMA17-34'])assert(!effective(rig.parts.get(key).node),'Unselected author motor reference must not replace original OEM hardware');
}
