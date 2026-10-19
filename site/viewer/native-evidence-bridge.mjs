// Retain unchanged native witnesses across the separately audited deck delta.
// The altered deck itself receives no inherited travel/clearance qualification.
export const nativeDeckEvidenceSource={
 file:'TRIDENT_DECK_REPAIR_103.json',sha256:'1043f2cc82a369e5c81ea0017ad743a032a84f2445b92ad89dd10ad619f3b28e',
 baseline:'a79fe940bf766ba2323dc96defc4e1970e2722a8cc3ace381d66929449a1dee8',
 current:'8bdbf3d8573dbcfd15ba5fd24d8d796562e266ebb8d2003e9754377856e8affa',bytes:851019084
};
const retained={
 'HEAD_VALIDATION.json':'307de76ad2fa77fd9f41c62269d8103aa760467f5651cc20a7a71438e99036ec',
 'MOUNT_VALIDATION.json':'7abe5612128bafc9840587769556f26639b42334002da3906987cf5ec9d179d7'
};
const hosts=['voron_trident_300','voron_trident_350'];
const changed=hosts.flatMap(id=>[`machines/${id}/assembly_manifest.json`,`machines/${id}/model.glb.gz`]);
export const nativeCatalogEvidenceSource={
 file:'HEAD_CATALOG_DELTA_ACE_HF_20261020.json',sha256:'0995df8a20b9bcbd44856da8f1d5253a285a1f0dbee81222f32677cae7dc32ca',
 catalog:'TOOLHEAD_CONFIGURATIONS.json',baseline:'910890df1868584a5aef27d39653d2cb124bbeef4cac576703df715a7052e463',
 current:'c95523f09e893ed2b4a7603a3e3c74aa39aa0c97508f00b2d60202e26b33afbf'
};
function retainedCatalogInputs(evidence,hashes,machine,name,proof){
 const source=nativeCatalogEvidenceSource,expected=evidence?.input_sha256?.[source.catalog];
 // These are retained original witnesses, including on the equal-bundle path.
 // A rewritten witness cannot authenticate its own new input expectations.
 if(!retained[name]||hashes[name]!==retained[name])return null;
 if(hashes[source.catalog]===expected)return {hashes,retained:false};
 const target=evidence?.machines?.[machine],pilot='ace_hf__siboor_awd__stealthburner__cw2__fixed__none';
 if(!target||!retained[name]||hashes[name]!==retained[name]
  ||expected!==source.baseline||hashes[source.catalog]!==source.current||hashes[source.file]!==source.sha256
  ||proof?.schema!=='ace-hf-append-only-mounting-catalog-delta-v1'
  ||proof.baseline_catalog?.sha256!==source.baseline||proof.baseline_catalog.bytes!==8912023
  ||proof.current_catalog?.sha256!==source.current||proof.current_catalog.bytes!==8916573
  ||proof.original_native_witness_records_dates_and_scopes_unchanged!==true||proof.whole_machine_fit_certified!==false
  ||Object.entries(retained).some(([key,sha])=>proof.retained_original_witnesses?.[key]!==sha)
  ||JSON.stringify(Object.keys(proof.added_records||{}).sort())!==JSON.stringify(['assets','hotends','variants'])
  ||proof.added_records.assets?.id!=='sb_rapido_ace_hf_complete'
  ||proof.added_records.assets.canonical_sha256!=='898a8303cb8babe8483c381e803b80fec01d92514a470270a2b3a3b4c700aa38'
  ||proof.added_records.hotends?.id!=='rapido_ace_hf'
  ||proof.added_records.hotends.canonical_sha256!=='8a708f3cdc7311e1fa980bd93110a0cb08706eaefbdca1d0c8b6a6f4b63eab8e'
  ||proof.added_records.variants?.id!==pilot
  ||proof.added_records.variants.canonical_sha256!=='978f2c6ce6601086abaa1675135f7cddddcf94246ab9c73bf1f1e42a1da21488'
  ||proof.retained_catalog_rows?.assets!==274||proof.retained_catalog_rows.hotends!==33||proof.retained_catalog_rows.variants!==1291
  ||proof.new_pilot?.variant!==pilot||proof.new_pilot.historical_native_witness_scope_includes_new_variant!==false
  ||proof.new_pilot.whole_head_fit_certified!==false||proof.new_pilot.whole_machine_fit_certified!==false||proof.new_pilot.printing_Z0_qualified!==false
  ||Object.entries(target.input_sha256||{}).some(([key,sha])=>Object.hasOwn(evidence.input_sha256||{},key)&&evidence.input_sha256[key]!==sha)
  ||target.records?.some(r=>r.source_configurations?.includes(pilot))
  ||target.bank_records?.some(r=>r.source_configuration===pilot))return null;
 // Both raw documents and the exact three-record projection proof are pinned.
 // Only the historical input identity is presented to the old validator.
 // The shipped catalog, records, placements and their qualifications stay intact.
 return {hashes:{...hashes,[source.catalog]:source.baseline},retained:true};
}
export function nativeWitnessInputs(evidence,hashes,bundle,machine,name,proof,catalogProof=null){
 const catalog=retainedCatalogInputs(evidence,hashes,machine,name,catalogProof);if(!catalog)return null;hashes=catalog.hashes;
 if(evidence?.model_bundle_sha256===bundle?.sha256)return {hashes,bundle,retained:catalog.retained,catalog_delta_retained:catalog.retained};
 const source=nativeDeckEvidenceSource,target=evidence?.machines?.[machine];
 if(!target||!retained[name]||hashes[name]!==retained[name]
  ||hashes[source.file]!==source.sha256||bundle?.sha256!==source.current||bundle.bytes!==source.bytes
  ||evidence.model_bundle_sha256!==source.baseline
  ||proof?.schema!=='trident-source-aperture-deck-103'||proof.model_bundle_sha256!==source.current
  ||proof.baseline_bundle_sha256!==source.baseline||proof.whole_machine_certified!==false
  ||proof.all_other_bundle_members_byte_identical!==true||proof.all_original_proof_bytes_preserved!==true
  ||JSON.stringify(proof.bundle_changed_paths)!==JSON.stringify(changed)
  ||Object.entries(retained).some(([key,sha])=>proof.retained_proof_sha256?.[key]!==sha))return null;
 const rows=hosts.map(id=>proof.machines?.find(r=>r.machine_id===id));
 if(rows.some((r,i)=>!r||r.part_key!==hosts[i]+'_base_1188'
  ||r.all_nodes_materials_and_other_manifest_rows_preserved!==true
  ||r.all_original_binary_bytes_preserved!==true
  ||r.only_deck_primitive_and_appended_views_accessors_changed!==true
  ||!r.before_files?.['machine_profile.json']?.sha256
  ||r.before_files['machine_profile.json'].sha256!==r.after_files?.['machine_profile.json']?.sha256))return null;
 const global=evidence.input_sha256||{},local=target.input_sha256||{};
 if(Object.entries(local).some(([key,sha])=>Object.hasOwn(global,key)&&global[key]!==sha))return null;
 const original={...global,...local},verified={...hashes};
 for(const [key,sha]of Object.entries(original)){
  if(hashes[key]===sha)continue;
  const row=rows.find(r=>key===`machines/${r.machine_id}/assembly_manifest.json`);
  if(!row||sha!==row.before_files['assembly_manifest.json'].sha256
   ||hashes[key]!==row.after_files['assembly_manifest.json'].sha256)return null;
  verified[key]=sha;
 }
 // None of these exact original head/probe witnesses may reference leaf1188.
 // Future changed-leaf findings require fresh native checks, not this bridge.
 const changedKeys=hosts.map(id=>id+'_base_1188');
 const refers=v=>typeof v==='string'?changedKeys.includes(v):Array.isArray(v)?v.some(refers):v&&typeof v==='object'?Object.entries(v).some(([k,value])=>changedKeys.includes(k)||refers(value)):false;
 if(refers(target.records)||refers(target.bank_records)||refers(evidence.intersection_witnesses))return null;
 return {hashes:verified,bundle:{...bundle,sha256:source.baseline},retained:true,catalog_delta_retained:catalog.retained,
  scope:'Original named native witnesses and baseline datums retained through the exact deck-only delta. Changed deck clearance and whole-machine fit are unqualified.'};
}
