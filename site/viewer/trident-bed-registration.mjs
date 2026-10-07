const prefix='voron_trident_350_base_';
const joints=[...Array.from({length:13},(_,i)=>1126+i),1167].map(n=>prefix+n);
const supports=[prefix+'1038',prefix+'1039'];
const recipe='5c417ef1e797ea77e0e076d95790b86073246ad6cf60a477b02c47b4d255f27b';
const finiteBounds=b=>Array.isArray(b)&&b.length===2&&b.every(p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite));
const sameBounds=(a,b,delta=[0,0,0],axes=[0,1,2])=>finiteBounds(a)&&finiteBounds(b)&&axes.every(j=>[0,1].every(i=>Math.abs(a[i][j]+delta[j]-b[i][j])<1e-4));
const digest=s=>typeof s==='string'&&/^[a-f0-9]{64}$/.test(s);

// Reject the former source-height fasteners. Byte integrity and native mating
// inspection are separate; these are registration guards, not a fit certificate.
export function assertTridentBedRegistration(metadata,profile){
 if(profile.machine_id!=='voron_trident_1000_custom')return;
 const r=metadata.bed_fastener_registration,rows=new Map(metadata.parts.map(p=>[p.key,p]));
 const fail=()=>{throw Error('Native Trident bed fastener registration changed')};
 if(!r||r.schema!=='trident-native-bed-fastener-registration-95'||r.machine_id!==profile.machine_id||r.source_baseline!=='voron_trident_350'||r.source_500_recipe_sha256!==recipe||r.source_to_native_z_delta_mm!==750||profile.display_limits_mm.Z[1]>994)fail();
 for(const [records,keys]of [[r.bed_supports,supports],[r.joints,joints]]){
  if(!Array.isArray(records)||records.length!==keys.length||new Set(records.map(p=>p.key)).size!==keys.length||records.some(p=>!keys.includes(p.key)))fail();
  for(const record of records){
   const row=rows.get(record.key);
   if(!row||row.motion!=='z'||record.motion!=='z'||!digest(record.native_sha256)||record.native_sha256!==row.native_sha256||!digest(record.source_500_native_sha256)||!sameBounds(record.native_bounds_mm,row.bounds_mm))fail();
   if(keys===supports){if(!sameBounds(record.source_500_bounds_mm,row.bounds_mm,[0,0,750],[2]))fail();continue;}
   const delta=record.source_to_native_translation_mm,mate=rows.get(record.mate_key);
   if(!Array.isArray(delta)||delta.length!==3||!delta.every(Number.isFinite)||delta[2]!==750||!sameBounds(record.source_500_bounds_mm,row.bounds_mm,delta)||!mate||mate.motion!=='z'||!digest(record.mate_native_sha256)||mate.native_sha256!==record.mate_native_sha256)fail();
   if(!sameBounds(record.mate_source_500_bounds_mm,mate.bounds_mm,delta,record.key===prefix+'1167'?[2]:[0,1,2]))fail();
  }
 }
}
