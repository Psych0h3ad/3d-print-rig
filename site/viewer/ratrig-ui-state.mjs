export const ratRigSchema='3d-print-rig-ratrig-v1';
const keys=(obj,expected)=>obj&&typeof obj==='object'&&!Array.isArray(obj)&&Object.keys(obj).sort().join(',')===[...expected].sort().join(',');
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(n=>Number.isFinite(n)&&Math.abs(n)<100);
export function validateRatRigConfiguration(profile,data){
 if(data?.schema!==ratRigSchema||data.machine!==profile.machine_id||data.rig?.machine_id!==profile.machine_id)throw Error('この構成は別のマシン用です。');
 const rig=data.rig,view=data.view;
 if(!keys(rig.pose,['x0','x1','y','z'])||!keys(rig.lights,['chamber','vaoc'])||!keys(rig.appearance,['palette','flexible_visible','enclosure_visible'])||!keys(rig.appearance.palette,['base','accent','frame']))throw Error('構成JSONの項目が不足しています。');
 if(!profile.supported_motion_modes.includes(rig.mode)||!Number.isFinite(rig.copy_offset_mm)||rig.copy_offset_mm<profile.limits.safe_distance_mm||rig.copy_offset_mm>profile.size_mm||!Number.isFinite(rig.mirror_sum_mm)||rig.mirror_sum_mm<(profile.limits.x0[0]+(profile.limits.x1?.[0]??0))||rig.mirror_sum_mm>profile.size_mm+(profile.limits.x1?.[1]??profile.size_mm))throw Error('IDEXの保存状態が不正です。');
 if(Object.values(rig.appearance.palette).some(v=>typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v))||typeof rig.appearance.flexible_visible!=='boolean'||typeof rig.appearance.enclosure_visible!=='boolean')throw Error('色・表示の保存状態が不正です。');
 if(!keys(view,['night','grid','camera'])||typeof view.night!=='boolean'||typeof view.grid!=='boolean'||!keys(view.camera,['position','target','up'])||!Object.values(view.camera).every(vector))throw Error('視点の保存状態が不正です。');
 if(Math.hypot(...view.camera.up)<.01||Math.hypot(...view.camera.position.map((n,i)=>n-view.camera.target[i]))<.0001)throw Error('視点の保存状態が不正です。');
 return data;
}
export function ratRigAxisRanges(profile,snapshot){
 const ranges=Object.fromEntries(['x0','x1','y','z'].filter(k=>profile.limits[k]).map(k=>[k,[...profile.limits[k]]]));
 if(profile.mode!=='idex')return ranges;
 const s=profile.limits.safe_distance_mm;
 if(snapshot.mode==='copy'){ranges.x0=[Math.max(ranges.x0[0],ranges.x1[0]-snapshot.copy_offset_mm),Math.min(ranges.x0[1],ranges.x1[1]-snapshot.copy_offset_mm)]}
 else if(snapshot.mode==='mirror'){ranges.x0=[Math.max(ranges.x0[0],snapshot.mirror_sum_mm-ranges.x1[1]),Math.min(ranges.x0[1],snapshot.mirror_sum_mm-ranges.x1[0],(snapshot.mirror_sum_mm-s)/2)]}
 else{ranges.x0[1]=Math.min(ranges.x0[1],snapshot.pose.x1-s);ranges.x1[0]=Math.max(ranges.x1[0],snapshot.pose.x0+s)}
 return ranges;
}
