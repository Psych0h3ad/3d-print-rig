import fs from 'node:fs';
import assert from 'node:assert/strict';
import {assertMayRolePacket,mayRole} from './virtu-may-role-contract.mjs';
import {initialState,validateState,visibleKeys} from '../site/viewer/source-assembly-runtime/state.mjs';
import {headSubsetPacket} from '../site/viewer/source-assembly-runtime/head_subset.mjs';
const packet=JSON.parse(fs.readFileSync(new URL('../site/source-assembly-assets/packet-rh3d_virtu_may_230.json',import.meta.url)));
assertMayRolePacket(packet);
let states=0;
for(const variant of packet.variants){
 for(const toggle of [null,true,false]){
  const state=initialState(packet);state.variant=variant.id;
  if(toggle!==null)state.groups=Object.fromEntries((packet.visibility_groups||[]).map(g=>[g.id,toggle]));
  validateState(state,packet);
  assert(!visibleKeys(packet,state).has(mayRole.excluded));
  const restored=JSON.parse(JSON.stringify(state));validateState(restored,packet);
  assert.deepEqual([...visibleKeys(packet,restored)],[...visibleKeys(packet,state)]);
  states++;
 }
}
const head=headSubsetPacket(packet,{keys:packet.public_head_keys,loading_budget:packet.loading_budget});
assert(!head.parts.some(p=>p.key===mayRole.excluded));
assert(head.parts.some(p=>p.key===mayRole.canonical));
assert(!head.private_source_motion172&&!head.source_preview_limits6);
let negatives=0;
for(const corrupt of [
 p=>p.variants[0].visible_keys.push(mayRole.excluded),
 p=>p.public_head_keys.push(mayRole.excluded),
 p=>p.variants.find(v=>v.id===p.default_variant).visible_keys.splice(p.variants.find(v=>v.id===p.default_variant).visible_keys.indexOf(mayRole.canonical),1),
 p=>{p.parts.find(r=>r.key===mayRole.canonical).source_id='0'.repeat(64);},
 p=>{p.model.sha256='0'.repeat(64);},
 p=>{delete p.source_May_DDG_role316;}
]){const bad=structuredClone(packet);corrupt(bad);assert.throws(()=>assertMayRolePacket(bad));negatives++;}
console.log(JSON.stringify({passed:true,actual_packet_state_cases:states,negative_controls:negatives,head_subset_membership:true,geometry_or_native_fit_claim:false}));
