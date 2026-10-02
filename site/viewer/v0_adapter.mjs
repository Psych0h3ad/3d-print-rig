import {appearanceRole} from './appearance-role.mjs?v=probe-travel-32';
import {createV0Belts} from './v0-belts.mjs?v=probe-travel-32';
/** V0: fixed-Z CoreXY gantry, Y beam, XY toolhead, single downward-moving bed. */
export const cadToGlb = ([x,y,z]) => [x/1000,z/1000,-y/1000];
export function poseDelta(profile, pose, {allowFirmwareOvertravel=false,requireClearanceEnvelope=false}={}) {
  const v=['x','y','z'].map(a=>Number(pose[a]));
  if(v.some(x=>!Number.isFinite(x)))throw new Error('Non-finite pose');
  const limits=requireClearanceEnvelope?(profile.sampled_clearance_limits_mm??profile.display_limits_mm):allowFirmwareOvertravel?profile.firmware_limits_mm:profile.display_limits_mm;
  for(let i=0;i<3;i++){
    const a=['X','Y','Z'][i];
    if(v[i]<limits[a][0]-1e-8||v[i]>limits[a][1]+1e-8)throw new Error(`Out of range ${a}=${v[i]}`);
  }
  return v.map((x,i)=>x-profile.display_reference_xyz_mm[i]);
}
export function partTranslation(row, delta){
  const d=delta.map((x,i)=>row.motion_axes.includes(['X','Y','Z'][i])?x*(row.motion_signs?.[['X','Y','Z'][i]]??1):0);
  return {cad_mm:d,glb_m:cadToGlb(d)};
}
export function corexyDelta([x,y]) {return {a_mm:x+y,b_mm:x-y};}
export function corexyInverse(a,b){return [(a+b)/2,(a-b)/2];}
export function createV0Adapter(root,manifest,profile){
  if(manifest.machine_id!==profile.machine_id||!/^voron_v0(2|2r1)_120$/.test(profile.machine_id))throw new Error('V0 profile mismatch');
  const records=new Map(manifest.parts.map(p=>[p.key,p])),nodes=new Map();
  if(records.size!==manifest.parts.length)throw new Error('Duplicate manifest key');
  root.traverse(o=>{const k=o.userData?.part_key;if(records.has(k)&&o.parent?.userData?.part_key!==k){if(nodes.has(k))throw new Error(`Duplicate node ${k}`);nodes.set(k,o);}});
  const missing=[...records.keys()].filter(k=>!nodes.has(k));if(missing.length)throw new Error(`Missing ${missing.length} V0 parts`);
  const origins=new Map([...nodes].map(([k,o])=>[k,o.position.clone()])),belts=createV0Belts(nodes,manifest);let flexibleVisible=true,lastPose;
  function setPose(pose,options){
    const delta=poseDelta(profile,pose,options),atReference=delta.every(x=>Math.abs(x)<1e-5);
    const atZReference=Math.abs(delta[2])<1e-5;
    for(const [key,o] of nodes){const r=records.get(key),d=partTranslation(r,delta).glb_m,b=origins.get(key);o.position.set(b.x+d[0],b.y+d[1],b.z+d[2]);if(r.motion==='reference_flexible'&&!belts.keys.has(key))o.visible=flexibleVisible&&atZReference;}
    belts.update(delta[1],flexibleVisible);
    const envelope=profile.sampled_clearance_limits_mm;const within=Boolean(envelope)&&['x','y','z'].every((a,i)=>pose[a]>=envelope['XYZ'[i]][0]&&pose[a]<=envelope['XYZ'[i]][1]);
    lastPose={...pose};return {display_xyz_mm:['x','y','z'].map(a=>Number(pose[a])),cad_delta_xyz_mm:delta,corexy_delta:corexyDelta(delta),atReference,atZReference,belts_visible:flexibleVisible,chain_visible:flexibleVisible&&atZReference,belt_route_lengths_mm:belts.entries.map(b=>b.route.length),within_sampled_clearance_envelope:within};
  }
  function setFlexibleVisible(v){flexibleVisible=Boolean(v);if(lastPose)setPose(lastPose);}
  function setEnclosureVisible(v){for(const [k,o] of nodes)if(records.get(k).group==='V0_Enclosure')o.visible=Boolean(v);}
  function setPalette(palette){for(const [k,o] of nodes){const color=palette[records.get(k).appearance_role];if(!color)continue;o.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])m.color.set(color);});}}
  return {nodes,records,belts,setPose,setFlexibleVisible,setEnclosureVisible,setPalette,getPose:()=>lastPose?['x','y','z'].map(a=>Number(lastPose[a])):[...profile.display_reference_xyz_mm],getSummary:()=>({machine_id:profile.machine_id,part_count:nodes.size,motion_counts:manifest.parts.reduce((a,r)=>(a[r.motion]=(a[r.motion]||0)+1,a),{})})};
}
