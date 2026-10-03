// Positive native intersections are counterexamples, never a travel certificate.
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
export function headPlacementKey(plan){
 if(!plan)return null;
 return JSON.stringify([plan.base,plan.translation,plan.nozzle_mm,[...(plan.hidden||[])].map(String).sort(),plan.modules.map(m=>[m.id,m.translation_mm,[...(m.hidden_keys||[])].map(String).sort()])]);
}
export function acceptedHeadValidation(evidence,hashes,bundle,machine){
 const target=evidence?.machines?.[machine];
 if(evidence?.schema!=='3d-print-rig-head-witness-v1'||evidence.model_bundle_sha256!==bundle?.sha256||!target||!Array.isArray(target.records)||!evidence.placements)return null;
 const pins={...evidence.input_sha256,...target.input_sha256};if(Object.keys(pins).length<4)return null;
 for(const[name,digest]of Object.entries(pins))if(hashes[name]!==digest)return null;
 const records=target.records.map(r=>Array.isArray(r.intersection_ids)&&!('intersections'in r)?{...r,intersections:r.intersection_ids.map(id=>evidence.intersection_witnesses?.[id])}:r);
 if(records.some(r=>!evidence.placements[r.placement]||!Array.isArray(r.source_configurations)||!r.source_configurations.length||!Array.isArray(r.intersections)||r.intersections.some(p=>!p||!point(p.display_xyz_mm)||!Number.isFinite(p.overlap_mm3)||p.overlap_mm3<=.01)))return null;
 if(target.bank_records?.some(r=>!point(r.nozzle_mm)||!point(r.unit_translation_mm)||!point(r.display_xyz_mm)||!Number.isFinite(r.overlap_mm3)||r.overlap_mm3<=.01))return null;
 return {revision:evidence.revision,machine,records,bank_records:target.bank_records||[],placements:evidence.placements};
}
export function bankWitnessCheck(data,plan,variant){
 if(!plan?.state?.enabled||variant.machine_gantry)return null;
 const same=(a,b)=>point(a)&&point(b)&&a.every((n,i)=>Math.abs(n-b[i])<1e-7);
 const record=data?.bank_records?.find(r=>r.source_configuration===variant.source_head_configuration&&same(r.nozzle_mm,variant.machine_head?.nozzle_mm)&&r.count===plan.state.tools.length&&plan.instances.some(e=>e.id===r.head_module&&e.slot===r.slot&&same(e.translation_mm,r.unit_translation_mm)&&!(e.hidden_keys||[]).includes(r.head_part)));
 return record||null;
}
export function applyHeadValidation(variant,registry,machine,gantry){
 if(variant.fit)delete variant.fit.rigid_head_witnesses;
 const data=registry.head_witness_validation;
 if(data?.machine!==machine||variant.machine_gantry)return null;
 const record=data.records.find(r=>(r.gantry||'machine_gantry')===(gantry||'machine_gantry')&&r.source_configurations.includes(variant.source_head_configuration)&&data.placements[r.placement]===headPlacementKey(variant.machine_head));
 if(!record)return null;
 const check={...record,revision:data.revision,machine};variant.fit.rigid_head_witnesses=check;return check;
}
export function headWitnessCheck(variant){
 const proof=variant.fit?.rigid_head_witnesses;if(!proof)return null;
 const intersections=proof.intersections.filter(p=>p.category==='body'),interfaces=proof.intersections.filter(p=>p.category!=='body');
 return {state:intersections.length?'machine-head-conflict':'machine-head-unverified',warning:true,label:intersections.length?'機体内のヘッド干渉あり':'ヘッドの全可動域は未確認',intersections,interfaces,
  lines:[intersections.length?'原本CADで機体側部品との体積交差を確認。比較用の構成です。':'候補姿勢の交差検査のみ。交差のない姿勢から全可動域の適合は判定しません。','標準外装を含む検査。追加Mod・柔軟な配線・ホーミング・交換経路は未検証。','橙の枠は対象部品の外接枠です。体積交差は原本CADで判定しています。',...(proof.unresolved_pairs?.length?['体積干渉が未判定の組み合わせを含みます。干渉なしとは扱いません。']:[]),...(interfaces.length?['締結部・接点・参考配線の交差候補は別扱いです。機体全体の適合判定には使いません。']:[])]};
}
