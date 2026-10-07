// Only concrete, reviewed installations belong in this registry.
export function mergeRequestedMods(registration,data,machine){
 if(data?.schema!=='requested-native-mod-installations-v1'||!data.machines||!data.assets)throw Error('Invalid installed Mod registry');
 const rows=data.machines[machine]?.accessories||[];
 const existing=new Set((registration.accessories||[]).map(row=>row.id));
 for(const row of rows){
  if(!row.id||existing.has(row.id)||!row.module||!data.assets[row.module])throw Error('Duplicate or missing installed Mod');
  existing.add(row.id);
  if(!Array.isArray(row.gantry_ids)||!row.gantry_ids.length||new Set(row.gantry_ids).size!==row.gantry_ids.length)throw Error('Missing installed Mod gantry scope');
  const review=row.geometry_review;
  if(review?.finite_mating_passed!==true||review.unintended_body_interference_passed!==true||review.whole_machine_certified!==false||!Array.isArray(review.inputs)||!review.inputs.length||review.inputs.some(pin=>!/^[a-f0-9]{64}$/.test(pin.sha256||'')))throw Error('Missing installed Mod geometry review');
 }
 for(const id of Object.keys(data.assets))if(registration.assets?.[id])throw Error('Duplicate installed Mod asset');
 return {...registration,assets:{...registration.assets,...data.assets},accessories:[...(registration.accessories||[]),...rows]};
}
export async function loadRequestedMods(registration,machine){
 const response=await fetch('../REQUESTED_MOD_INSTALLATIONS.json?v=1891521be771c2ce0a35',{cache:'no-cache'});
 if(!response.ok)throw Error('追加Modの登録を取得できません');
 return mergeRequestedMods(registration,await response.json(),machine);
}
