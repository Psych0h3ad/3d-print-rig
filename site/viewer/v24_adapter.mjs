import {appearanceRole} from './appearance-role.mjs?v=public-v17';
/** Separate V2.4 kinematic adapter. CAD vertices already contain world placement. */
export function createV24Adapter(root,manifest,profile){
  if(manifest.machine_id!==profile.machine_id||profile.machine_id!=='siboor_v24_350')throw new Error('V2.4 profile mismatch');
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
  let flexibleVisible=true;
  function setPose(pose){
    const v=['x','y','z'].map(k=>Number(pose[k]));if(v.some(x=>!Number.isFinite(x)))throw new Error('Non-finite pose');
    for(const [i,a] of ['X','Y','Z'].entries()){
      const [min,max]=profile.display_limits_mm[a];v[i]=Math.max(min,Math.min(max,v[i]));
    }
    const delta=v.map((x,i)=>x-profile.display_reference_xyz_mm[i]);
    const atReference=delta.every(x=>Math.abs(x)<1e-5);
    for(const [key,o] of nodes){
      const r=records.get(key),t=['X','Y','Z'].map((a,i)=>r.motion_axes.includes(a)?delta[i]:0),base=origins.get(key);
      o.position.set(base.x+t[0]/1000,base.y+t[2]/1000,base.z-t[1]/1000);
      if(r.motion==='reference_flexible')o.visible=flexibleVisible&&atReference;
    }
    return {display_xyz_mm:v,cad_delta_xyz_mm:delta,atReference};
  }
  function setFlexibleVisible(value){flexibleVisible=Boolean(value)}
  function setEnclosureVisible(value){
    const surfaces=new Set(profile.panel_surface_keys||[]);
    for(const [key,o] of nodes)if(records.get(key).panel_surface||surfaces.has(key))o.visible=Boolean(value);
  }
  function setPalette(palette){
    for(const [key,o] of nodes){
      const role=appearanceRole(records.get(key)),color=palette[role];if(!color)continue;
      o.traverse(n=>{if(n.isMesh)for(const m of Array.isArray(n.material)?n.material:[n.material])m.color.set(color)});
    }
  }
  function getSummary(){return {machine_id:profile.machine_id,part_count:nodes.size,fixed_bed_keys:profile.fixed_bed_keys,
    z_guide_block_keys:profile.z_guide_block_keys,motion_counts:manifest.parts.reduce((a,r)=>(a[r.motion]=(a[r.motion]||0)+1,a),{})};}
  return {nodes,records,setPose,setFlexibleVisible,setEnclosureVisible,setPalette,getSummary};
}
