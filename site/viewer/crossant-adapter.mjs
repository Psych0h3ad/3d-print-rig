import {cadToGlb,createNativeBelts} from './crossant-belt_deform.mjs';
export function poseDelta(profile,pose){
 const p=['x','y','z'].map(a=>Number(pose[a]));
 if(p.some(x=>!Number.isFinite(x)))throw Error('Non-finite pose');
 for(let i=0;i<3;i++){const [a,b]=profile.display_limits_mm['XYZ'[i]];if(p[i]<a-1e-8||p[i]>b+1e-8)throw Error('Out of range '+['x','y','z'][i]);}
 return p.map((p,i)=>p-profile.display_reference_xyz_mm[i]);
}
export function partTranslation(row,delta){return delta.map((x,i)=>row.motion_axes.includes('XYZ'[i])?x*(row.motion_signs?.['XYZ'[i]]??1):0);}
export function driveTravel(delta){return {x_pair_mm:[delta[0],delta[0]],y_pair_mm:[delta[1],delta[1]],z_leadscrew_turns:[-delta[2]/8,-delta[2]/8,-delta[2]/8],motor_direction_status:'mechanical paired-axis travel; firmware motor polarity uncalibrated'};}
export function createCrossantAdapter(root,manifest,profile,bindings,{chainPreview=null,placementCorrections={}}={}){
 if(profile.machine_id!=='crossant_235_v06_leadscrew'||manifest.machine_id!==profile.machine_id||bindings.machine_id!==profile.machine_id)throw Error('Crossant profile mismatch');
 const records=new Map(manifest.parts.map(p=>[p.key,p])),nodes=new Map();
 if(records.size!==manifest.parts.length)throw Error('Duplicate Crossant key');
 root.traverse(o=>{const k=o.userData?.part_key;if(records.has(k)&&o.parent?.userData?.part_key!==k){if(nodes.has(k))throw Error('Duplicate node '+k);nodes.set(k,o);}});
 if(nodes.size!==records.size)throw Error('Crossant node coverage mismatch');
 for(const [k,offset]of Object.entries(placementCorrections)){
  if(!nodes.has(k)||records.get(k).motion!=='fixed'||!Array.isArray(offset)||offset.length!==3||offset.some(v=>!Number.isFinite(v)))throw Error('Crossant profile mismatch');
  const d=cadToGlb(offset);nodes.get(k).position.set(...d);
 }
 const origins=new Map([...nodes].map(([k,o])=>[k,o.position.clone()]));
 const belts=createNativeBelts(nodes,bindings);
 if(chainPreview)for(const [k,o] of nodes)if(records.get(k).motion==='chain_reference')o.visible=false;
 let last;
 function setPose(pose){
  const delta=poseDelta(profile,pose),d={x:delta[0],y:delta[1],z:delta[2]};
  // Validate all belt constraints before mutating any node.
  for(const e of belts.entries){const n=d[e.spec.drive_axis.toLowerCase()],[a,b]=e.spec.stationary_interval_mm,[l,h]=e.spec.clamp_interval_mm;if(l+n<=a||h+n>=b)throw Error('Belt clamp outside its registered span');}
  for(const [k,o] of nodes){const t=cadToGlb(partTranslation(records.get(k),delta)),b=origins.get(k);o.position.set(b.x+t[0],b.y+t[1],b.z+t[2]);}
  belts.update(d);if(chainPreview)chainPreview.update(-delta[2]);
  last={...pose};return {pose_mm:['x','y','z'].map(a=>pose[a]),delta_mm:delta,drive:driveTravel(delta),visible_belts:belts.entries.filter(e=>e.node.visible&&e.mesh.visible).length,chain_status:chainPreview?'dynamic routing preview':'native reference pose only',within_sampled_clearance_envelope:profile.sampled_clearance_limits_mm?['x','y','z'].every((a,i)=>pose[a]>=profile.sampled_clearance_limits_mm['XYZ'[i]][0]&&pose[a]<=profile.sampled_clearance_limits_mm['XYZ'[i]][1]):null};
 }
 function setPalette(palette){for(const [k,o] of nodes){const c=palette[records.get(k).appearance_role];if(!c)continue;o.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])m.color.set(c);});}}
 // Variant/auxiliary visibility can never modify the driven belt nodes.
 function setGroupVisible(group,value){for(const [k,o] of nodes)if(records.get(k).group===group&&!belts.keys.has(k)&&records.get(k).motion!=='chain_reference')o.visible=Boolean(value);}
 return {nodes,records,belts,setPose,setPalette,setGroupVisible,setBeltsVisible:belts.setVisible,getPose:()=>last};
}
