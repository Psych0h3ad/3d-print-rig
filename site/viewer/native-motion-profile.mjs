// Motion registration is separate from the author's immutable CAD asset.
// A registration is accepted only for the exact model hash and all native keys.
export function applyNativeMotionProfile(manifest,profile,rig,modelHash){
 if(!rig)return {manifest,profile};
 if(rig.machine_id!==profile.machine_id||rig.model_sha256!==modelHash||rig.part_count!==manifest.parts.length)throw Error('Motion registration does not match native CAD');
 const groups=new Map();for(const[group,keys]of Object.entries(rig.groups))for(const key of keys){if(groups.has(key))throw Error('Duplicate motion registration');groups.set(key,group)}
 if(groups.size!==manifest.parts.length||manifest.parts.some(p=>!groups.has(p.key)))throw Error('Incomplete motion registration');
 const parts=manifest.parts.map(p=>({...p,group:p.group==='reference'?'reference':groups.get(p.key),native_bounds_mm:p.native_bounds_mm||p.bounds_mm}));
 return {manifest:{...manifest,parts,native_leaf_count:parts.length,reference_leaves:manifest.reference_leaves||[]},profile:{...profile,axes:rig.axes,motions:rig.motions,basis:rig.basis||profile.basis,origin_mm:rig.origin_mm||profile.origin_mm||[0,0,0],motion_preview:true,head_groups:rig.head_groups||['head'],motion_registration:rig}};
}
export async function loadNativeMotionProfile(machine,{signal}={}){
 const supported=['tictac_21_120','the100_v11_165','rook_mk2_120','satsuma180_v10','sovol_sv08_350','annex_k1_assembly','annex_k2_assembly','annex_k3_assembly','fysetc_v24_250_pro'];
 if(!supported.includes(machine))return null;
 const response=await fetch(new URL('./motion-profiles/'+machine+'.json',import.meta.url),{signal,cache:'no-cache'});if(!response.ok)throw Error('Native motion registration unavailable');return response.json();
}
