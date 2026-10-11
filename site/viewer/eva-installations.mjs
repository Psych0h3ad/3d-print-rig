// Native EVA installations bind a complete printer occurrence tree, not a
// translation inferred from a rail name. Other hosts need separate adapters.
const sha=/^[a-f0-9]{64}$/;
const required=['carriage','core','hotend_mount','hotend','nozzle','extruder','hotend_fan','part_fan','duct','fasteners','probe'];
export function validateEvaMountReview(row,keys=null){
 if(row.mount_review?.mount_verified!==true)return;
 const review=row.mount_review,targets=Object.values(row.head_keys||{});
 if(!Number.isFinite(review.axis_error_mm)||review.axis_error_mm<0||review.axis_error_mm>.05
  ||!Array.isArray(review.fastener_keys)||!review.fastener_keys.length||review.fastener_keys.some(k=>!targets.includes(k))
  ||!Array.isArray(review.rail_keys)||!review.rail_keys.length||review.rail_keys.some(k=>typeof k!=='string'||!k||keys&&!keys.has(k))
  ||typeof review.native_scope!=='string'||!review.native_scope||review.full_physical_fit_certified!==false)
  throw Error('Incomplete native EVA mounting review');
}
export function evaCommunityIndex(index,registry){
 if(registry?.schema!=='3d-print-rig-eva-installations-v1')throw Error('Invalid EVA installation registry');
 const result=structuredClone(index);
 for(const [id,row]of Object.entries(registry.machines)){
  validateEvaMountReview(row);
  if(row.asset){
   if(result.machines[id])throw Error('Duplicate EVA printer asset');
   if(row.asset.machine_id!==id)throw Error('Wrong EVA printer asset');
   result.machines[id]=structuredClone(row.asset);
  }
  const spec=result.machines[id];
  if(!spec||spec.files['model.glb'].decoded_sha256!==row.model_sha256
   ||spec.files['assembly_manifest.json'].sha256!==row.manifest_sha256
   ||spec.files['machine_profile.json'].sha256!==row.profile_sha256)
   throw Error('EVA printer assets changed: '+id);
  result.machines[id].eva_installation=structuredClone(row);
 }
 return result;
}
export function applyEvaInstallation(manifest,profile,row){
 if(!row)return {manifest,profile};
 if(row.machine_id!==profile.machine_id||manifest.machine_id!==profile.machine_id
  ||![2,3].includes(row.generation)||!sha.test(row.source_step_sha256)
  ||profile.source.source_step_sha256!==row.source_step_sha256
  ||typeof row.configuration!=='string'||!row.configuration
  ||!sha.test(row.native_review_sha256))throw Error('Invalid native EVA installation');
 const keys=new Map(manifest.parts.map(p=>[p.key,p]));
 if(manifest.native_leaf_count!==manifest.parts.length||keys.size!==manifest.parts.length
  ||!Array.isArray(manifest.reference_leaves)||new Set(manifest.reference_leaves).size!==manifest.reference_leaves.length
  ||manifest.reference_leaves.some(k=>typeof k!=='string'||!keys.has(k)))
  throw Error('Invalid native EVA occurrence manifest');
 const mapping=Object.entries(row.head_keys||{}),targets=mapping.map(([,k])=>k);
 if(mapping.length!==row.head_parts||new Set(targets).size!==mapping.length
  ||targets.some(k=>!keys.has(k)||keys.get(k).group!=='head'))
  throw Error('Incomplete installed EVA occurrence tree');
 for(const category of required){
  const ids=row.companions?.[category];
  if(!Array.isArray(ids)||!ids.length||new Set(ids).size!==ids.length
   ||ids.some(k=>!Object.hasOwn(row.head_keys,k)))throw Error('Missing installed EVA companion: '+category);
 }
 for(const [key,material]of Object.entries(row.purchased_materials||{})){
  if(!targets.includes(key)||['base','accent','frame'].includes(keys.get(key).appearance_role)
   ||!Array.isArray(material.color_linear)||material.color_linear.length!==3
   ||material.color_linear.some(n=>!Number.isFinite(n)||n<0||n>1)
   ||['metalness','roughness'].some(n=>!Number.isFinite(material[n])||material[n]<0||material[n]>1))
   throw Error('Invalid EVA purchased material override');
 }
 validateEvaMountReview(row,keys);
 const next=structuredClone(profile);
 next.configuration_label='Toolhead installation';
 const original=next.configurations?.stock||{label:'Original',hidden_keys:[],rest_offsets_mm:{}};
 const configuration={...original,label:row.label,notices:row.notices||[],
  sources:[row.source],eva_generation:row.generation,source_head_configuration:row.configuration};
 next.configurations={...(next.configurations||{}),stock:configuration,[row.configuration]:configuration};
 next.eva_installation=structuredClone(row);
 if(Array.isArray(row.review_notices)&&next.motion_registration)
  next.motion_registration.notices=[...row.review_notices];
 return {manifest,profile:next};
}
export function evaInstallationSupport(row,heads,options=null){
 const variant=heads.variants.find(v=>v.id===row.configuration);
 if(!variant?.eva||variant.eva.generation!==row.generation||variant.belt_width_mm!==row.belt_width_mm
  ||variant.eva.source_revision!==row.source_revision
  ||JSON.stringify(variant.eva.companions)!==JSON.stringify(row.companions))
  throw Error('EVA installed selection differs from the source head');
 const dimensions=['toolhead','extruder','hotend','probe'];
 const fields={toolhead:'toolheads',extruder:'extruders',hotend:'hotends',probe:'probes'};
 const ids=options?.hosts?.[row.machine_id]?.configurations||[row.configuration];
 const variants=ids.map(id=>{
  const candidate=heads.variants.find(v=>v.id===id);
  if(!candidate?.eva||candidate.eva.generation!==row.generation
   ||candidate.eva.source_revision!==row.source_revision
   ||candidate.eva.source_machine?.id!==row.machine_id
   ||id!==row.configuration&&!options.variants.some(v=>v.id===id&&v.machine_id===row.machine_id))
   throw Error('Unregistered EVA installed combination');
  return candidate;
 });
 return {dimensions,options:Object.fromEntries(dimensions.map(d=>{
  const choices=[...new Set(variants.map(v=>v[d]))].map(id=>{
   const option=heads[fields[d]].find(o=>o.id===id);
   if(!option)throw Error('Missing EVA installed option');
   return {id:option.id,label:option.label};
  });return [d,choices];
 })),variants:variants.map(v=>({...v,notes:v.id===row.configuration?row.notices||[]:v.installation?.notices||v.notes||[]})),accessories:[]};
}
