import assert from 'node:assert/strict';

export const mayRole={
 canonical:'vion_source__catalog-idler-NAUO-17379-solid-0',
 excluded:'vion_source__catalog-idler-pin-r6a-solid-0',
 model:'2f9c92fa1fb0253c755f81564309158263c6296f9444fd58ea5e12eea2b6e7aa',
 inventory:'45fe9828df27952ae4fa661eb3193992fffb7dfd91988d5f78d4050a52e82383',
 identities:{
  'vion_source__catalog-idler-NAUO-17379-solid-0':'f6c8ef76fed717f1c96cb49634d1de2b5d22ca8341567dcf546a280bd4e69db6',
  'vion_source__catalog-idler-pin-r6a-solid-0':'8893c7f71c5129f1d023238f25bc5afcc893dde16eaf7ea5ee76c921d55b9a72',
  'virtu_public_dbid_1338':'683b0ce162953b526bc33669d55b7dbad703e98c1b21d1148bbd052640d31d94',
  'vion_source__v-ion_th-tensioner_m-1':'91b0b1af91a5065dce2ff7716fe8d793e8ac583cc5219ef99f6ab2cf39eda4d1'
 },
 finiteSourceProof:'34866418dbb948d3af7e78ad70857969ad0cf6923a7564663ae9f14c317f70c9',
 finiteMateProof:'3b74ba27cd619eb9c796bbf0a2bcf9ea020f20eb0381df73780a8bd91e47722d',
 sourceRoleAuthority:'5ecc6afb0f36feb09ba15583f0e4c5a847c4dc9e0bd6365f78e4f81f533fe4b7'
};

// This contract is limited to the exact source assembly reviewed here. The
// original printed integral hinge and the DDG gear shaft have distinct axes.
export function assertMayRolePacket(packet){
 assert.equal(packet.id,'virtu_frame_body_head_candidate_132');
 assert.equal(packet.model.sha256,mayRole.model);
 assert.equal(packet.inventory.sha256,mayRole.inventory);
 for(const [key,source] of Object.entries(mayRole.identities))
  assert.equal(packet.parts.find(p=>p.key===key)?.source_id,source,'May source identity: '+key);
 assert.equal(packet.source_May_DDG_role316?.finiteProof,mayRole.finiteSourceProof);
 assert.equal(packet.source_May_DDG_role316?.full_assembly_or_native_fit_claim,false);
 assert.equal(packet.source_May_DDG_role316?.source_model_and_inventory_bytes_unchanged,true);
 assert(!packet.public_head_keys.includes(mayRole.excluded),'Foreign hinge in head membership');
 assert(packet.public_head_keys.includes(mayRole.canonical),'Missing original gear shaft in head');
 for(const variant of packet.variants){
  assert(!variant.visible_keys.includes(mayRole.excluded),'Foreign hinge eligible: '+variant.id);
  const originalGearShaft=['assembled-candidate','assembled-candidate-y-negative','original-author-Y-M2-reference338'].includes(variant.id);
  assert.equal(variant.visible_keys.includes(mayRole.canonical),originalGearShaft,'Original gear-shaft membership changed: '+variant.id);
 }
 return true;
}
