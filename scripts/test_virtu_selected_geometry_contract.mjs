import fs from'node:fs';import assert from'node:assert/strict';
import{assertMayRolePacket}from'./virtu-may-role-contract.mjs';
import{selectedGeometry,assertSelectedMaterial}from'./virtu-selected-geometry-contract.mjs';
import{sourceOperatingBounds}from'../site/viewer/source-operating-bounds6.mjs';
import{validateReviewMotion,validateReviewTransition}from'../site/viewer/source-assembly-runtime/state.mjs';
const packet=JSON.parse(fs.readFileSync(new URL('../site/source-assembly-assets/packet-rh3d_virtu_may_230.json',import.meta.url)));assertMayRolePacket(packet);const cases=[];
const panel='virtu_author_PANEL_electronics_dxf_7114522',bolt='virtu_panel_public_M3x6_BHCS_for_original_frag_714';
for(const[label,corrupt]of[
 ['missing-panel-same-count',p=>{p.parts.find(r=>r.key===panel).key='missing-panel';}],
 ['missing-genuine-companion-same-count',p=>{p.parts.find(r=>r.key===bolt).key='missing-genuine-bolt';}],
 ['duplicate-companion-same-count',p=>{p.parts[p.parts.findIndex(r=>r.key===bolt)]={...p.parts.find(r=>r.key===selectedGeometry.hardware58_keys[0])};}],
 ['wrong-panel-source',p=>{p.parts.find(r=>r.key===panel).source_id='0'.repeat(64);}],
 ['purchased-panel-mistyped-printed',p=>{Object.assign(p.parts.find(r=>r.key===panel),{kind:'printed',material_role:'M'});}],
 ['unsupported-panel-nudge-closes-gap',p=>{p.parts.find(r=>r.key===panel).matrix[14]+=.00005;}],
 ['left-motor-source-axis-wrong',p=>{p.parts.find(r=>r.key==='VIRTU-Z-left-original-Creality-42-34-motor').matrix[12]+=.001;}],
 ['right-original-motor-changed',p=>{p.parts.find(r=>r.key==='VIRTU-Z-right-original-Creality-42-34-motor').matrix[12]+=.001;}],
 ['rear-original-motor-changed',p=>{p.parts.find(r=>r.key==='VIRTU-Z-rear-original-Creality-42-34-motor').matrix[12]+=.001;}],
 ['wrong-seated-grub',p=>{p.parts.find(r=>r.key==='May-1655-16T-original-source-body-1').matrix[12]+=.001;}],
 ['hidden-panel-same-visible-count',p=>{const v=p.variants.find(v=>v.id===p.default_variant);v.visible_keys[v.visible_keys.indexOf(panel)]='virtu_may_nonpro_4040_base_front_cap_left';}],
 ['old-front-cap-reintroduced-same-count',p=>{const v=p.variants.find(v=>v.id===p.default_variant);v.visible_keys[v.visible_keys.indexOf('bed-stock235')]='virtu_may_nonpro_4040_base_front_cap_right';}],
 ['new-panel-in-head-same-head-count',p=>{p.public_head_keys[0]=panel;}]
]){const bad=structuredClone(packet);corrupt(bad);assert.throws(()=>assertMayRolePacket(bad),undefined,label);cases.push(label)}
const expected=selectedGeometry.source_bindings.find(r=>r.key==='VIRTU-frame-759').primitives[0].material;
function fake(values){return{color:{toArray:()=>[...values.color]},opacity:values.opacity,metalness:values.metalness,roughness:values.roughness,transparent:values.transparent,userData:{original_source_material_id:values.original_source_material_id,original_SimplePhong:{retained:true}}}}
assertSelectedMaterial(fake(expected),expected,'qualified original front finish');const wrong={...expected,color:[.3,.3,.3]};assert.throws(()=>assertSelectedMaterial(fake(wrong),expected,'wrong source finish'));cases.push('wrong-actual-front-finish');const wrongAlpha={...expected,transparent:true,opacity:.35};assert.throws(()=>assertSelectedMaterial(fake(wrongAlpha),expected,'wrong source opacity'));cases.push('wrong-actual-opacity');
const origin={x:0,y:0,z:0},outside={x:0,y:152,z:0};
assert.equal(sourceOperatingBounds(packet,origin,'y').max,147);assert.equal(sourceOperatingBounds(packet,{x:116,y:0,z:0},'y').max,152);
validateReviewMotion(packet,{x:0,y:147,z:0});validateReviewMotion(packet,{x:116,y:152,z:106});
assert.throws(()=>validateReviewMotion(packet,outside),/Retained source body contact:/);cases.push('native-X-rejects-outside-Y152');
assert.throws(()=>validateReviewTransition(packet,{review_axes:origin,probe_state:'attached'},{review_axes:outside,probe_state:'attached'}),/Retained source path crosses\/touches body:/);cases.push('native-X-rejects-path-to-outside-Y152');
console.log(JSON.stringify({passed:true,actual_packet:packet.model.sha256,meaningful_negative_cases:cases,exact_owners:727,exact_default_visible:697,conditional_Y_maxima_at_X0_X116:[147,152],rigid_clamp_still_OPEN:true,full_actual_GLTF_source_checks_required_in_normal_auditor:true}));
