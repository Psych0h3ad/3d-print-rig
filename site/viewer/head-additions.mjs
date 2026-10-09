import {collections} from './configuration-model.js?v=922298bc5433b90fa3af';
import {withSphinxCompanionPresets} from './head-companion-presets.mjs?v=82ec6a996e9e1661b811';

// Supplemental source heads never create machine mounting registrations.
export function withHeadAdditions(catalog,additions){
 if(additions.schema!=='3d-print-rig-head-additions-v1')throw Error('Invalid head additions schema');
 const result=structuredClone(catalog),ids=new Set(result.variants.map(v=>v.id));
 for(const field of Object.values(collections)){
  result[field]||=[];
  for(const option of additions[field]||[]){
   if(result[field].some(o=>o.id===option.id))throw Error('Duplicate head option: '+option.id);
   result[field].push(structuredClone(option));
  }
 }
 for(const [id,spec]of Object.entries(additions.assets)){
  if(result.assets[id]||result.base_assets[id])throw Error('Duplicate head asset: '+id);
  result.base_assets[id]=structuredClone(spec);
 }
 for(const variant of additions.variants){
  if(ids.has(variant.id)||variant.head_only!==true||variant.registration_source||variant.machine_head)throw Error('Invalid standalone head registration');
  ids.add(variant.id);
  for(const [dimension,field]of Object.entries(collections))if(!result[field].some(o=>o.id===variant[dimension]))throw Error('Missing head option: '+dimension+'/'+variant[dimension]);
  const asset=result.base_assets[variant.base_asset];
  if(!asset?.external||asset.parts<1||!Array.isArray(variant.head_translation_mm)||variant.head_translation_mm.length!==3||!variant.head_translation_mm.every(Number.isFinite)||!Array.isArray(variant.modules)||variant.modules.length)throw Error('Invalid supplemental head asset');
  result.variants.push(structuredClone(variant));
 }
 result.sources.push(...structuredClone(additions.sources));
 return withSphinxCompanionPresets(result);
}
