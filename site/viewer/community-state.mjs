export const communitySchema='3d-print-rig.community.v1';
export function communityMotionEnabled(profile){
 return profile.motion_preview!==false&&Object.values(profile.axes).some(([min,max])=>max>min);
}
export function validateAxes(axes,profile){
 if(!axes||Object.keys(axes).sort().join()!==Object.keys(profile.axes).sort().join())throw Error('Invalid axes');
 for(const key of Object.keys(profile.axes))if(!Number.isFinite(axes[key])||axes[key]<profile.axes[key][0]||axes[key]>profile.axes[key][1])throw Error('Axis outside preview range: '+key);
 return axes;
}
export function nativeMotion(group,axes,profile){
 validateAxes(axes,profile);return (profile.motions[group]||[0,0,0]).map(v=>typeof v==='string'?axes[v]:typeof v==='number'?v:Object.entries(v).reduce((sum,[axis,factor])=>{if(!Object.hasOwn(axes,axis)||!Number.isFinite(factor))throw Error('Invalid native motion term');return sum+axes[axis]*factor},0));
}
export function displayMotion(native,profile){return profile.basis.map(row=>row.reduce((sum,n,i)=>sum+n*native[i],0)/1000)}
export function communityConfiguration(profile,id='stock'){
 const choices=profile.configurations||{stock:{label:'Original'}};
 if(typeof id!=='string'||!Object.hasOwn(choices,id))throw Error('Unknown printer configuration');
 return choices[id];
}
export function validateCommunityState(state,profile){
 if(state?.schema!==communitySchema||state.machine!==profile.machine_id)throw Error('Configuration belongs to another printer');validateAxes(state.axes,profile);
 for(const key of ['base','accent','frame'])if(!/^#[a-f0-9]{6}$/i.test(state.palette?.[key]))throw Error('Invalid color');
 for(const key of ['night','grid','references'])if(typeof state[key]!=='boolean')throw Error('Invalid display setting');
 communityConfiguration(profile,state.configuration??'stock');
 const c=state.camera;
 for(const key of ['position','target','up'])if(!Array.isArray(c?.[key])||c[key].length!==3||!c[key].every(n=>Number.isFinite(n)&&Math.abs(n)<30))throw Error('Invalid camera');
 if(c.position.every((v,i)=>Math.abs(v-c.target[i])<.001)||Math.hypot(...c.up)<.5)throw Error('Invalid camera pose');return state;
}
