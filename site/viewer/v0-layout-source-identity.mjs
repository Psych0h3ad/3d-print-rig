// A deterministic displayed-source identity, not a source authentication or fit
// certificate. The provider authenticates the original model and geometry lease
// before calling this function. Preserve the frozen baseline as separate data.
const fail=()=>{throw Error('Invalid V0 displayed-source identity')};
const hash=value=>typeof value==='string'&&/^[a-f0-9]{64}$/u.test(value);
export function v0LayoutDisplayIdentity({machineId,baselineRevision,manifestSHA256,profileSHA256,hingeReceipt,movingKeys,fixedPivotKeys,fixedLatchKeys}){
 const prefix=machineId==='voron_v02_120'?'v02_':machineId==='voron_v02r1_120'?'v02r1_':null;
 if(!prefix||![baselineRevision,manifestSHA256,profileSHA256].every(hash)||hingeReceipt?.schema!=='v0-source-hinge-applied-v1'||hingeReceipt.machine_id!==machineId||hingeReceipt.physical_fit_verified!==false)fail();
 for(const name of ['source_model_sha256','metadata_sha256','model_decoded_sha256','model_stored_sha256'])if(!hash(hingeReceipt[name]))fail();
 const keys=(value,count)=>{if(!Array.isArray(value)||value.length!==count||value.some(k=>typeof k!=='string'||!k.startsWith(prefix)||!/^\d{5}$/u.test(k.slice(prefix.length))))fail();return [...value].sort()};
 const moving=keys(movingKeys,10),pivot=keys(fixedPivotKeys,2),latch=keys(fixedLatchKeys,machineId==='voron_v02r1_120'?14:10);
 if(new Set([...moving,...pivot,...latch]).size!==moving.length+pivot.length+latch.length)fail();
 return Object.freeze({schema:'v0-displayed-source-identity-v1',machine_id:machineId,frozen_normal_baseline:baselineRevision,source_manifest_sha256:manifestSHA256,source_profile_sha256:profileSHA256,source_model_sha256:hingeReceipt.source_model_sha256,hinge_metadata_sha256:hingeReceipt.metadata_sha256,hinge_model_decoded_sha256:hingeReceipt.model_decoded_sha256,hinge_model_stored_sha256:hingeReceipt.model_stored_sha256,moving_door_source_keys:Object.freeze(moving),fixed_pivot_source_keys:Object.freeze(pivot),fixed_frame_latch_source_keys:Object.freeze(latch),physical_fit_verified:false});
}
