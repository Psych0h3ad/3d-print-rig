// EVA generations have distinct source assemblies and companion interfaces.
// A shared rail or hotend name does not authorize mixing their printed parts.
import {validateEvaMountReview} from './eva-installations.mjs?v=3838c4828bb6ab03392f';
const categories=['carriage','core','hotend_mount','hotend','nozzle','extruder','hotend_fan','part_fan','duct','fasteners'];
export function validateEvaVariant(variant,asset){
 if(!variant.eva){if(/^eva_[23]$/.test(variant.toolhead))throw Error('Missing EVA source recipe');return;}
 const recipe=variant.eva;
 if(![2,3].includes(recipe.generation)||variant.toolhead!==`eva_${recipe.generation}`
  ||!(recipe.version===null&&recipe.version_scope==='source_assembly'
    ||/^\d+\.\d+\.\d+$/.test(recipe.version)&&Number(recipe.version.split('.')[0])===recipe.generation)
  ||! /^(?:[a-f0-9]{40}|urn:adsk\.wipprod:fs\.file:vf\.[A-Za-z0-9_-]+\?version=[1-9]\d*)$/.test(recipe.source_revision)
  ||variant.source_version!==recipe.source_revision
  ||!variant.hardware_assembled||!asset?.external||variant.modules.length
  ||variant.base_hidden_keys?.length||variant.head_translation_mm.some(n=>n!==0)
  ||!Array.isArray(variant.fit?.nozzle_mm)||variant.fit.nozzle_mm.length!==3
  ||!variant.fit.nozzle_mm.every(Number.isFinite))throw Error('Invalid EVA source assembly: '+variant.id);
 for(const category of [...categories,...(variant.probe==='none'?[]:['probe'])]){
  const keys=recipe.companions?.[category];
  if(!Array.isArray(keys)||!keys.length||new Set(keys).size!==keys.length||keys.some(k=>typeof k!=='string'||!k))
   throw Error('Missing EVA companion: '+category);
 }
}
export function validateEvaMetadata(variant,meta){
 if(!variant.eva)return;
 const recipe=variant.eva;
 if(meta.id!==variant.base_asset||(meta.source_revision??meta.source_commit)!==recipe.source_revision
  ||meta.eva_generation!==recipe.generation||meta.eva_version!==recipe.version)
  throw Error('EVA model generation/source mismatch');
 const parts=new Map(meta.parts.map(p=>[p.key,p]));
 if(parts.size!==meta.parts.length)throw Error('Duplicate EVA source part');
 for(const[category,keys]of Object.entries(recipe.companions))for(const key of keys){
  const part=parts.get(key);
  if(!part||!part.eva_companions?.includes(category))throw Error('EVA source companion missing: '+category+'/'+key);
  if(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners','probe'].includes(category)
   &&['base','accent'].includes(part.appearance_role))throw Error('EVA hardware has a printed palette role: '+key);
 }
}
// GLTFLoader represents one native leaf with several material primitives as
// a Group. Its explicit occurrence identity belongs to every surface child.
// Never infer a purchased descendant's identity from a printed assembly name.
export function bindEvaMeshIdentities(meta,root){
 if(!meta.eva_generation)return;
 const parts=new Map(meta.parts.map(p=>[p.key,p]));
 root.traverse(mesh=>{
  if(!mesh.isMesh)return;
  let owner=mesh;
  while(owner&&!owner.userData?.part_key)owner=owner.parent;
  const key=owner?.userData.part_key;
  if(!parts.has(key))throw Error('Missing EVA native surface identity');
  mesh.userData.part_key=key;
 });
}
// A head selected from an existing printer can link back to that exact stock
// assembly. This is not a mounting registration for another printer or size.
export function bindEvaSourceMachines(heads,registry,community){
 const bound={},configurations={},reviews=[];
 for(const variant of heads.variants){
  const host=variant.eva?.source_machine;if(!host)continue;
  const spec=community.machines?.[host.id];
  if(spec?.files?.['model.glb']?.decoded_sha256!==host.decoded_model_sha256
   ||spec.files['assembly_manifest.json']?.sha256!==host.manifest_sha256)
   throw Error('EVA source printer identity changed: '+host.id);
  bound[variant.id]=host.id;
  if(spec.eva_installation){
   validateEvaMountReview(spec.eva_installation);
   if(spec.eva_installation.configuration!==variant.id)throw Error('EVA source printer selection changed');
   if(spec.eva_installation.generation!==variant.eva.generation
    ||spec.eva_installation.source_revision!==variant.eva.source_revision
    ||JSON.stringify(spec.eva_installation.companions)!==JSON.stringify(variant.eva.companions)
    ||spec.eva_installation.belt_width_mm!==variant.belt_width_mm)
    throw Error('EVA source printer companions changed');
   configurations[variant.id]=spec.eva_installation.configuration;
   if(spec.eva_installation.mount_review?.mount_verified===true)
    reviews.push([variant,{...structuredClone(spec.eva_installation.mount_review),machine:host.id,native_review_sha256:spec.eva_installation.native_review_sha256}]);
  }
 }
 registry.eva_source_machines=bound;
 registry.eva_installation_configurations=configurations;
 for(const variant of heads.variants)if(variant.eva&&variant.fit)delete variant.fit.native_installation;
 for(const [variant,review]of reviews)variant.fit.native_installation=review;
 return registry;
}
