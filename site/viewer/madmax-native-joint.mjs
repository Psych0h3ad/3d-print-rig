// Original source2/315 finite native seats, standard Trident250 local joint only.
// Original BIN geometry/PBR and all catalog eligibility remain unchanged.
const joint={"machine":"voron_trident_250","variant":"installed__trident_r2__v21__madmax__xol__sherpa_mini__rapido2_uhf","shift":[-0.0001879310030119541,-16.399997425107884,359.99999328029236],"parts":{"madmax_xol_carriage_2":{"source_key":"2","matrix":[0.9999999999999988,-4.789654267989712e-08,9.616417897969506e-14,0.0,4.7896542696635976e-08,0.9999999999999988,1.028594920434604e-13,0.0,-9.614531886300694e-14,-1.0291767438275201e-13,0.9999999999999999,0.0,-1.832800594235226e-15,-8.526512829121202e-16,-2.9025670755800095e-15,1.0]},"madmax_mgn12_fasteners_0":{"source_key":"315","matrix":[0.9999999999999988,-4.789654267989712e-08,9.616417897969506e-14,0.0,4.7896542696635976e-08,0.9999999999999988,1.028594920434604e-13,0.0,-9.614531886300694e-14,-1.0291767438275201e-13,0.9999999999999999,0.0,-1.8520296676223613e-15,-8.7323482808044e-16,0.00020000009999711563,1.0]},"madmax_mgn12_fasteners_1":{"source_key":"315","matrix":[0.9999999999999988,-4.789654267989712e-08,9.616417897969506e-14,0.0,4.7896542696635976e-08,0.9999999999999988,1.028594920434604e-13,0.0,-9.614531886300694e-14,-1.0291767438275201e-13,0.9999999999999999,0.0,-1.852029667622361e-15,-8.732348280804396e-16,0.00020000009999711298,1.0]},"madmax_mgn12_fasteners_2":{"source_key":"315","matrix":[0.9999999999999988,-4.789654267989712e-08,9.616417897969506e-14,0.0,4.7896542696635976e-08,0.9999999999999988,1.028594920434604e-13,0.0,-9.614531886300694e-14,-1.0291767438275201e-13,0.9999999999999999,0.0,-1.8520296676223613e-15,-8.7323482808044e-16,0.00020000009999711563,1.0]},"madmax_mgn12_fasteners_3":{"source_key":"315","matrix":[0.9999999999999988,-4.789654267989712e-08,9.616417897969506e-14,0.0,4.7896542696635976e-08,0.9999999999999988,1.028594920434604e-13,0.0,-9.614531886300694e-14,-1.0291767438275201e-13,0.9999999999999999,0.0,-1.852029667622361e-15,-8.732348280804396e-16,0.00020000009999711298,1.0]}},"assets":{"madmax_xol_carriage":{"metadata_sha256":"0c4ac5838ed23d82b50c5b4fa0cad05e55773ae29d4c5bd3909f4f9e8a44f528","decoded_model_sha256":"b9ca4c738a1a49cb9b81bde206a482b794b89d05acea765d7c6d4a6fc4831dae"},"madmax_mgn12_fasteners":{"metadata_sha256":"7a7012a70b67af7b7c51df39899a05c4ba2699c263b0b157904b662e5970ce5f","decoded_model_sha256":"0294a728e9a1acf3158b6ac5b9686aaf3f0f565197e8ddbb3aa331de094af3ab"}}};
const modules=Object.keys(joint.assets);
export const madmaxJointScope=Object.freeze({machine:joint.machine,variant:joint.variant,parts:Object.keys(joint.parts)});
export function madmaxJointAssetSpec(machine,id,spec){
 return spec&&machine===joint.machine&&joint.assets[id]?{...spec,...joint.assets[id]}:spec;
}
export function madmaxJointApplies(machine,variant){
 if(machine!==joint.machine||variant?.id!==joint.variant)return false;
 if(variant.mount!=='madmax'||variant.carriage!=='madmax_xol'||variant.toolhead!=='xol'||variant.gantry!=='trident_r2'||variant.hotend!=='rapido2_uhf'||variant.extruder!=='sherpa_mini'||variant.registration_source!=='madmax_xol')return false;
 const plan=variant.machine_head;
 if(plan?.source_variant!=='v21__madmax__xol__sherpa_mini__rapido2_uhf'||!Array.isArray(plan.modules))return false;
 return modules.every(id=>{const rows=plan.modules.filter(m=>m.id===id),p=rows[0]?.translation_mm;return rows.length===1&&Array.isArray(p)&&p.length===3&&p.every((v,i)=>Number.isFinite(v)&&Math.abs(v-joint.shift[i])<1e-10)});
}
export function captureMadmaxJoint(machine,id,meta,entries){
 if(machine!==joint.machine||!joint.assets[id])return null;
 const expected=Object.entries(joint.parts).filter(([key])=>key.startsWith(id+'_'));
 if(entries.length!==expected.length)throw Error('MadMax native joint part count changed');
 return expected.map(([key,pin])=>{
  const entry=entries.find(e=>e.key===key),source=meta.parts.find(p=>p.key===key);
  if(!entry||String(source?.source_key)!==pin.source_key||source.file!==`modules/${id}/${key}.brep`)throw Error('MadMax native joint source identity changed');
  entry.mesh.updateMatrix();
  if(!entry.mesh.matrix.elements.every((v,i)=>Math.abs(v-(i%5===0?1:0))<1e-14))throw Error('MadMax native joint baseline matrix changed');
  return {mesh:entry.mesh,original:entry.mesh.matrix.clone(),correction:pin.matrix};
 });
}
export function setMadmaxJointPose(records,enabled){
 for(const row of records||[]){
  row.mesh.matrix.copy(row.original);
  if(enabled)row.mesh.matrix.fromArray(row.correction);
  row.mesh.matrix.decompose(row.mesh.position,row.mesh.quaternion,row.mesh.scale);
  row.mesh.updateMatrixWorld(true);
 }
}
