import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {webcrypto} from 'node:crypto';
import {baselineReference,baselineLimits,baselineResetPose,baselineGcodeContext,NATIVE_BASELINE_SOURCE,contentSHA256} from '../site/viewer/baseline-native-datum.mjs';
globalThis.crypto??=webcrypto;
const text=await fs.readFile(new URL('../site/TRIDENT_SB_NATIVE_DATUM.json',import.meta.url),'utf8');
assert.equal(await contentSHA256(text),NATIVE_BASELINE_SOURCE.sha256);
assert.notEqual(await contentSHA256(text+' '),NATIVE_BASELINE_SOURCE.sha256);
const data=JSON.parse(text);
assert.deepEqual(data.baselines.map(r=>r.machine),['voron_trident_250','voron_trident_300','voron_trident_350']);
for(const row of data.baselines){
 const size=Number(row.machine.split('_').at(-1)),original={X:[0,size],Y:[0,size],Z:[0,250]},profile={display_reference_xyz_mm:row.current_reference_xyz_mm};
 const variant={id:row.source_variant,native_reference_92:row};
 const reference=baselineReference(profile,variant),limits=baselineLimits(original,profile.display_reference_xyz_mm,reference,variant);
 assert.deepEqual(limits,row.new_display_limits_without_cad_domain_expansion_mm);
 const reset=baselineResetPose(reference,row.signed_bed_reference_drop_mm);
 assert.deepEqual(reset,row.native_reset_xyz_mm);
 assert(Math.abs(reset[2]+row.signed_bed_reference_drop_mm)<1e-10,'reset leaves native bed geometry unmoved');
 for(const[i,a]of ['X','Y'].entries()){
  const nativeDomain=row.original_cad_delta_limits_mm[a];
  assert(limits[a][0]-reference[i]>=nativeDomain[0]-1e-8);
  assert(limits[a][1]-reference[i]<=nativeDomain[1]+1e-8);
  assert(Math.abs(row.nozzle_native_machine_mm[i]-reference[i]-row.bed_frame.native_bounds_mm[0][i]-2)<1e-8);
 }
 const ctx=baselineGcodeContext(variant,{enabled:false},reference);
 assert.equal(ctx.native_baseline.source_sha256,await contentSHA256(text));
 assert.notEqual(JSON.stringify(ctx),JSON.stringify(baselineGcodeContext(variant,ctx.bank,reference.map((n,i)=>i===0?n+1:n))));
 assert.notEqual(JSON.stringify(ctx),JSON.stringify(baselineGcodeContext({...variant,native_reference_92:{...row,nozzle_native_machine_mm:[0,0,0]}},ctx.bank,reference)));
 assert.deepEqual(baselineReference(profile,{id:'installed'}),profile.display_reference_xyz_mm);
 assert.deepEqual(baselineLimits(original,profile.display_reference_xyz_mm,reference,{id:'installed'}),original);
 assert.equal(baselineGcodeContext({id:'installed'},null,reference).native_baseline,null);
 assert.equal(row.homing_switch_verified,false);
 assert.equal(row.physical_installation_verified,false);
}
assert.throws(()=>baselineResetPose([NaN,0,0],0),/Invalid/);
assert.throws(()=>baselineLimits({X:[0,1],Y:[0,1],Z:[0,1]},[0,0,0],[2,0,0],{native_reference_92:{}}),/Empty/);
console.log('PASS measured Trident native nozzle datum, original reach intersection, bed reset and G-code identity');
