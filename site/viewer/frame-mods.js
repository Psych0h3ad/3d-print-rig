export async function loadFrameMods(machine){
 const response=await fetch('../MACHINE_MODS.json?v=trident-clearance-35',{cache:'no-cache'});if(!response.ok)throw Error('機種別Modを取得できません');
 const data=await response.json(),registration=data.machines[machine];if(!registration)throw Error('機種別Modが未登録です');
 if(registration.disco.motion!=='fixed')throw Error('照明の取付先が不正です');
 return {...registration,assets:data.assets};
}

export function withFrameMods(catalog,mods){
 const existing=new Set((catalog.accessories||[]).map(row=>row.id));
 return {...catalog,assets:{...catalog.assets,...mods.assets},accessories:[...(catalog.accessories||[]),...mods.accessories.filter(row=>!existing.has(row.id))]};
}
