import {loadSiboorRegistration} from './siboor-catalog.mjs?v=632c197a61a4fe66320b';
import {loadInternalSpool} from './internal-spool.mjs?v=ca3a453f6bf2966e0208';
import {loadRequestedMods} from './requested-mods.mjs?v=59541cdb05a4fcf10171';
export async function loadFrameMods(machine){
 const response=await fetch('../MACHINE_MODS.json?v=trident-clearance-35',{cache:'no-cache'});if(!response.ok)throw Error('機種別Modを取得できません');
 const data=await response.json();if(machine==='siboor_trident_300'){const patch=(await loadSiboorRegistration()).registrations;data.machines[machine]=patch.mods;}const registration=data.machines[machine];if(!registration)throw Error('機種別Modが未登録です');
 if(registration.disco.motion!=='fixed')throw Error('照明の取付先が不正です');
 return loadRequestedMods(await loadInternalSpool({...registration,assets:data.assets},machine),machine);
}

export function withFrameMods(catalog,mods){
 const existing=new Set((catalog.accessories||[]).map(row=>row.id));
 return {...catalog,assets:{...catalog.assets,...mods.assets},accessories:[...(catalog.accessories||[]),...mods.accessories.filter(row=>!existing.has(row.id))]};
}
