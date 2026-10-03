import {poseDelta} from './crossant-adapter.mjs';
export const crossantSchema='3d-print-rig-crossant-v1';
export const crossantGroups=['Crossant_Electronics','Crossant_Skirts','Crossant_CPAP Housing','Crossant_Filter'];
export function validateCrossantState(profile,s){
 if(s?.schema!==crossantSchema||s.machine!==profile.machine_id)throw Error('この構成は別のマシン用です。');
 if(!s.pose||Object.keys(s.pose).sort().join()!=='x,y,z'||Object.values(s.pose).some(v=>typeof v!=='number'))throw Error('Crossantの座標が不正です。');
 poseDelta(profile,s.pose);
 if(typeof s.nominal!=='boolean'||!s.nominal&&['x','y','z'].some((a,i)=>s.pose[a]<profile.sampled_clearance_limits_mm['XYZ'[i]][0]||s.pose[a]>profile.sampled_clearance_limits_mm['XYZ'[i]][1]))throw Error('Crossantの表示範囲外です。');
 if(!s.palette||Object.keys(s.palette).sort().join()!=='accent,base,frame'||Object.values(s.palette).some(v=>typeof v!=='string'||!/^#[0-9a-f]{6}$/i.test(v)))throw Error('色・表示の保存状態が不正です。');
 if(!s.groups||Object.keys(s.groups).sort().join()!==[...crossantGroups].sort().join()||Object.values(s.groups).some(v=>typeof v!=='boolean'))throw Error('色・表示の保存状態が不正です。');
 if(['belts','chain','night','grid'].some(k=>typeof s[k]!=='boolean'))throw Error('色・表示の保存状態が不正です。');
 const c=s.camera;if(!c||Object.keys(c).sort().join()!=='position,target,up'||Object.values(c).some(v=>!Array.isArray(v)||v.length!==3||v.some(n=>!Number.isFinite(n)||Math.abs(n)>100))||Math.hypot(...c.up)<.01||Math.hypot(...c.position.map((n,i)=>n-c.target[i]))<.0001)throw Error('視点の保存状態が不正です。');
 return s;
}
