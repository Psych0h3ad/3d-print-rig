// Evidence applies to one native probe placement on one stock machine.
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const samePoint=(a,b)=>point(a)&&point(b)&&a.every((n,i)=>Math.abs(n-b[i])<1e-7);
export async function contentSHA256(text){
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),n=>n.toString(16).padStart(2,'0')).join('');
}
export function acceptedMountValidation(evidence,hashes,bundle,machine){
 if(evidence?.schema!=='3d-print-rig-probe-travel-v1'||evidence.model_bundle_sha256!==bundle?.sha256)return null;
 const target=evidence.machines?.[machine];if(!target)return null;
 if(!evidence.input_sha256||Object.keys(evidence.input_sha256).length<2||!target.input_sha256||Object.keys(target.input_sha256).length<2||!Array.isArray(target.records)||!target.records.length||!Number.isFinite(evidence.clearance_margin_mm)||evidence.clearance_margin_mm<=0)return null;
 if(target.records.some(r=>!Array.isArray(r.source_configurations)||!r.source_configurations.length||!point(r.nozzle_mm)||!point(r.translation_mm)||!r.module||!Number.isFinite(r.checked_pairs)||r.checked_pairs<=0))return null;
 for(const [name,digest]of Object.entries({...evidence.input_sha256,...target.input_sha256}))if(hashes[name]!==digest)return null;
 return {revision:evidence.revision,machine,records:target.records,clearance_margin_mm:evidence.clearance_margin_mm};
}
export function applyMountValidation(variant,registry,machine,gantry){
 const data=registry.probe_travel_validation,p=variant.fit?.probe,plan=variant.machine_head;
 if(p)delete p.rigid_machine_travel;
 if(!p||!plan||variant.mount!=='fixed'||variant.machine_gantry||gantry&&gantry!=='machine_gantry'||data?.machine!==machine)return null;
 // Removing an embedded PCB leaves the tested probe assembly unchanged.
 const id=variant.source_head_configuration,source=variant.toolhead==='xol'&&variant.board==='none'?id.replace(/__without_sht36$/u,''):id;
 const record=data.records.find(r=>r.state==='clear'&&r.source_configurations.includes(source)&&samePoint(r.nozzle_mm,plan.nozzle_mm)&&plan.modules.some(m=>m.id===r.module&&samePoint(m.translation_mm,r.translation_mm)));
 if(!record)return null;
 const check={state:'clear',revision:data.revision,machine,module:record.module,display_limits_mm:record.display_limits_mm,checked_pairs:record.checked_pairs,clearance_margin_mm:data.clearance_margin_mm,methods:record.methods};
 p.rigid_machine_travel=check;return check;
}
