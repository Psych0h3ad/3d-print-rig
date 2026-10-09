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
export function nativeWitnessInputs(evidence,hashes,bundle,machine,name,proof){
 if(evidence?.model_bundle_sha256===bundle?.sha256)return {hashes,bundle,retained:false};
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
 return {hashes:verified,bundle:{...bundle,sha256:source.baseline},retained:true,
  scope:'Original named native witnesses and baseline datums retained through the exact deck-only delta. Changed deck clearance and whole-machine fit are unqualified.'};
}
