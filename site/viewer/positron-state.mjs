export const positronSchema='3d-print-rig.positron.v1';
export function validatePositronState(data){
 if(!data||data.schema!==positronSchema||data.machine!=='positron_v322')throw Error('Invalid Positron configuration');
 if(typeof data.fold!=='number'||!Number.isFinite(data.fold)||data.fold<0||data.fold>100)throw Error('Invalid folding position');
 for(const key of ['base','accent','frame'])if(!/^#[0-9a-f]{6}$/i.test(data.palette?.[key]))throw Error('Invalid Positron color');
 for(const key of ['accessories','grid','night'])if(typeof data[key]!=='boolean')throw Error('Invalid Positron display setting');
 for(const key of ['position','target','up'])if(!Array.isArray(data.camera?.[key])||data.camera[key].length!==3||data.camera[key].some(n=>typeof n!=='number'||!Number.isFinite(n)||Math.abs(n)>20))throw Error('Invalid camera');
 const length=values=>Math.hypot(...values);
 if(length(data.camera.up)<.9||length(data.camera.up)>1.1||length(data.camera.position.map((n,i)=>n-data.camera.target[i]))<.01)throw Error('Invalid camera');
 return data;
}
