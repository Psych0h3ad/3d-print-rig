import {v24FlexibleState} from './v24-flexible.mjs?v=extra-machines-55';
import {appearanceRole} from './appearance-role.mjs?v=6eb709afed84945151b8';
import {createV24Belts} from './v24-belts.mjs?v=ad0c97343617f3c11d0b';
/** Separate V2.4 kinematic adapter. CAD vertices already contain world placement. */
export function createV24Adapter(root,manifest,profile){
  if(manifest.machine_id!==profile.machine_id||!profile.machine_id.startsWith('voron_v24_'))throw new Error('V2.4 profile mismatch');
  const records=new Map(manifest.parts.map(p=>[p.key,p])),nodes=new Map();
  root.traverse(o=>{
    const key=o.userData?.part_key;
    if(records.has(key)&&o.parent?.userData?.part_key!==key){
      if(nodes.has(key))throw new Error(`Duplicate part node ${key}`);
      nodes.set(key,o);
    }
  });
  const missing=[...records.keys()].filter(k=>!nodes.has(k));if(missing.length)throw new Error(`Missing ${missing.length} V2.4 parts`);
  const origins=new Map([...nodes].map(([k,o])=>[k,o.position.clone()]));
  const xyBelts=createV24Belts(nodes,manifest,profile);
  let flexibleVisible=true,currentPose=[...profile.display_reference_xyz_mm];
  function setPose(pose){
    const v=['x','y','z'].map(k=>Number(pose[k]));if(v.some(x=>!Number.isFinite(x)))throw new Error('Non-finite pose');
    for(const [i,a] of ['X','Y','Z'].entries()){const limits=profile.display_limits_mm[a];if(!limits||v[i]<limits[0]-1e-8||v[i]>limits[1]+1e-8)throw new RangeError(`${a}=${v[i]} outside ${limits}`)}
    const delta=v.map((x,i)=>x-profile.display_reference_xyz_mm[i]);
    const atReference=delta.every(x=>Math.abs(x)<1e-5);
    for(const [key,o] of nodes){
      const r=records.get(key),t=['X','Y','Z'].map((a,i)=>r.motion_axes.includes(a)?delta[i]:0),base=origins.get(key);
      o.position.set(base.x+t[0]/1000,base.y+t[2]/1000,base.z-t[1]/1000);
      if(r.motion==='reference_flexible'){const state=v24FlexibleState(r,delta,flexibleVisible);o.visible=state.visible;o.position.y=base.y+state.z/1000;}
    }
    currentPose=[...v];
    xyBelts.update(delta,flexibleVisible);
    return {display_xyz_mm:v,cad_delta_xyz_mm:delta,atReference,flexible_visible_count:[...nodes].filter(([k,o])=>records.get(k).motion==='reference_flexible'&&o.visible).length};
  }
  function setFlexibleVisible(value){flexibleVisible=Boolean(value)}
  function setEnclosureVisible(value){
    for(const [key,o] of nodes)if(records.get(key).group==='V24_Enclosure')o.visible=Boolean(value);
  }
  function setPalette(palette){
    for(const [key,o] of nodes){
      const role=appearanceRole(records.get(key)),color=palette[role];if(!color)continue;
      o.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material]){m.color.set(color);if(role==='base'||role==='accent'){m.metalness=0;m.roughness=.72;}}});
    }
  }
  function getSummary(){return {machine_id:profile.machine_id,part_count:nodes.size,fixed_bed_keys:profile.fixed_bed_keys,
    z_guide_block_keys:profile.z_guide_block_keys,motion_counts:manifest.parts.reduce((a,r)=>(a[r.motion]=(a[r.motion]||0)+1,a),{})};}
  return {nodes,records,setPose,getPose:()=>[...currentPose],setFlexibleVisible,setEnclosureVisible,setPalette,getSummary};
}
