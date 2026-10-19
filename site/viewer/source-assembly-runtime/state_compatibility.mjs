import {stateSchema,initialState,validateState} from './state.mjs?v=e42678a5314a2d6c0676';

// The packet is hash-pinned. Compatibility is an explicit reviewed revision pair,
// never a filename, prefix, configuration family or approximate geometry match.
export function migrateCompatibleState(saved,packet){
 if(saved?.schema!==stateSchema||saved.packet!==packet.id)throw Error('Configuration belongs to a different source configuration');
 const state=structuredClone(saved);
 const same=state.model_sha256===packet.model.sha256&&state.inventory_sha256===packet.inventory.sha256;
 let revision=null;
 if(!same){
  const c=packet.state_compatibility;
  if(c?.schema!=='priority-reviewed-state-compatibility-v1'||c.target_model_sha256!==packet.model.sha256||c.target_inventory_sha256!==packet.inventory.sha256)throw Error('Configuration belongs to an unreviewed source revision');
  revision=c.revisions.find(r=>r.packet===packet.id&&r.model_sha256===state.model_sha256&&r.inventory_sha256===state.inventory_sha256);
  if(!revision||revision.reviewed!==true||!revision.evidence?.length||!revision.evidence.every(r=>/^[a-f0-9]{64}$/.test(r.sha256)))throw Error('Configuration belongs to an unreviewed source revision');
  state.model_sha256=packet.model.sha256;state.inventory_sha256=packet.inventory.sha256;
  const defaults=initialState(packet);
  if(state.review_axes===undefined&&packet.private_source_motion172)state.review_axes=defaults.review_axes;
  if(state.probe_state===undefined&&packet.source_probe_state303)state.probe_state='attached';
  state.groups={...defaults.groups,...state.groups};
 }
 // Re-evaluate the current deployed-probe and bed planes. Do not park a probe,
 // clip an axis, or reset an unsafe old pose to make a saved state pass.
 try{validateState(state,packet);}catch(error){error.code='SAVED_STATE_UNSAFE';throw error;}
 return {state,migrated:!same,notice_key:!same?'savedRevisionMigrated':null,revision};
}
