import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {augmentTrinityAlpha,trinityAlphaVariants,alphaContext,TRINITY_ALPHA_SOURCE} from '../site/viewer/trinity-alpha-installation.mjs';
import {createTridentMotion} from '../site/viewer/trident-motion.mjs';
import {appearanceRole} from '../site/viewer/appearance-role.mjs';

const bytes=fs.readFileSync(new URL('../site/TRINITY_ALPHA_INSTALLATIONS.json',import.meta.url));
assert.equal(createHash('sha256').update(bytes).digest('hex'),TRINITY_ALPHA_SOURCE.sha256);
const sidecar=JSON.parse(bytes);
const registry={machines:Object.fromEntries([250,300,350].map(size=>['voron_trident_'+size,{xy_motors:2,gantries:{trident_r2:{part_key:'trident_r2_gantry_'+size+'_381',belt_width_mm:6}}}]))};
const heads={assets:{},variants:[{id:'trinity87__v13',toolhead:'trinity_crossbow',mount:'fixed',notes:[]}]};
augmentTrinityAlpha({heads,registry},null,sidecar,sidecar.raw_registry_sha256);
for(const size of [250,300,350]){
 assert.equal(appearanceRole({key:'voron_trident_'+size+'_base_1396',name:'Exhaust Grill (1)',source_component:'Filament_Path:1/PTFE Plate:1/PTFE_Plate_Printed:1/Exhaust Grill (1):1'}),'accent');
 const machine='voron_trident_'+size;
 const [variant]=trinityAlphaVariants(heads,registry,machine,'trident_r2');
 assert(variant);assert.equal(variant.machine_head.hidden[0],'actual_retained_Trident_block');
 assert.deepEqual(variant.machine_head.hidden,['actual_retained_Trident_block','v13_29','v13_71','v13_72','v13_73']);
 assert.deepEqual(variant.base_hidden_keys,variant.machine_head.hidden);
 for(const key of ['v13_28','v13_69'])assert(!variant.machine_head.hidden.includes(key),'Native metal belt clamps must remain');
 assert.deepEqual(variant.machine_head.stock_retained_keys,['trident_r2_gantry_'+size+'_381']);
 const profile={machine_id:machine,kinematics:'trident',display_reference_xyz_mm:variant.native_alpha_92.reference_xyz_mm,display_limits_mm:variant.native_alpha_92.limits_mm};
 const motion=createTridentMotion(profile);
 const drop=24.45000671979478;
 motion.setBedReferenceDrop(drop,{displayLimitsIncludeBedReferenceDrop:true});
 for(const z of [0,225.54999328020523,110,225.54999328020523,0]){
  const pose=motion.setPose({x:size/2,y:size/2,z});
  assert(Math.abs(pose.z-z)<1e-9,'Native upper Z range must not lose the bed drop twice');
  assert(Math.abs(pose.bed_down_mm-(z+drop))<1e-9);
 }
 assert.equal(motion.setPose({x:999,y:999,z:999}).z,profile.display_limits_mm.Z[1]);
 // Switching back to the native SB must remove the alpha limit policy.
 motion.setBedReferenceDrop(0);assert.equal(motion.setPose({x:0,y:0,z:0}).bed_down_mm,0);
 assert.equal(alphaContext({},variant).trinity_alpha_92.full_physical_fit,false);
}
assert.equal(appearanceRole({key:'voron_trident_350_base_1396',name:'M3x12 SHCS',source_component:'Filament_Path:1/PTFE Plate:1/PTFE_Plate_Hardware:1/M3x12 SHCS'}),null);
for(const machine of ['voron_v24_250_printed','siboor_trident_350','voron_trident_500_custom']){
 assert.deepEqual(trinityAlphaVariants(heads,registry,machine,'trident_r2'),[]);
}
const reject=change=>{
 const altered=structuredClone(sidecar);change(altered);
 assert.throws(()=>augmentTrinityAlpha({heads:{assets:{}},registry:structuredClone(registry)},null,altered,sidecar.raw_registry_sha256));
};
reject(a=>a.rows[0].limits_mm.Z[1]+=24.45000671979478);
reject(a=>a.rows[0].stock_block_key='missing');
reject(a=>a.rows[0].machine_id='siboor_trident_350');
reject(a=>a.rows[0].front_lateral_rules.source_file_sha256='0'.repeat(64));
reject(a=>a.rows[0].front_lateral_rules.machine_id='voron_trident_500_custom');
reject(a=>a.rows[0].front_lateral_rules.proof_url='https://example.invalid/proof.json');
reject(a=>a.current_native_manifest_sha256='0'.repeat(64));
reject(a=>a.asset.files['model.glb'].decoded_sha256='0'.repeat(64));
reject(a=>a.rows.push(structuredClone(a.rows[0])));
assert.throws(()=>augmentTrinityAlpha({heads,registry},null,sidecar,'0'.repeat(64)));
console.log('Trinity alpha regression passed: three exact hosts, single stock block, native Z range, reset policy and stale/unproved inputs.');
