export function validateCustomState(s,machineId,profile){
 if(s?.schema!=='custom-voron-1'||s.machine_id!==machineId||!Array.isArray(s.axes)||s.axes.length!==3||s.axes.some((n,i)=>!Number.isFinite(n)||n<profile.display_limits_mm[['X','Y','Z'][i]][0]||n>profile.display_limits_mm[['X','Y','Z'][i]][1])||['base','accent','frame'].some(k=>!/^#[a-f0-9]{6}$/i.test(s.colors?.[k]))||['panels','belts','grid'].some(k=>typeof s[k]!=='boolean'))throw Error('Invalid custom VORON configuration');
 return s;
}
