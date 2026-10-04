/** Native fixed CoreXY bridge, XY head and downward-moving three-point bed. */
import {createRemorphBelts} from './remorph-belts.mjs';
export const cadToGlb=([x,y,z])=>[x/1000,z/1000,-y/1000];
export const corexyDelta=([x,y])=>({a_mm:x+y,b_mm:x-y});
export function poseDelta(profile,pose){
  const xyz=['x','y','z'].map(a=>pose[a]);
  if(xyz.some(v=>typeof v!=='number'||!Number.isFinite(v)))throw Error('Invalid XYZ pose');
  for(let i=0;i<3;i++){
    const limits=profile.display_limits_mm['XYZ'[i]];
    if(xyz[i]<limits[0]-1e-8||xyz[i]>limits[1]+1e-8)throw Error('Out of range '+ 'XYZ'[i]);
  }
  return xyz.map((v,i)=>v-profile.display_reference_xyz_mm[i]);
}
export function createRemorphAdapter(root,manifest,profile,bindings){
  if(manifest.machine_id!=='remorph_beta1_307'||profile.machine_id!==manifest.machine_id)throw Error('Remorph profile mismatch');
  const records=new Map(manifest.parts.map(p=>[p.key,p])),nodes=new Map();
  if(records.size!==manifest.parts.length)throw Error('Duplicate part key');
  root.traverse(n=>{const key=n.userData?.part_key;if(records.has(key)&&n.parent?.userData?.part_key!==key){if(nodes.has(key))throw Error('Duplicate GLB key '+key);nodes.set(key,n)}});
  if(nodes.size!==records.size)throw Error('Missing GLB parts');
  const origins=new Map([...nodes].map(([k,n])=>[k,n.position.clone()]));
  const belts=createRemorphBelts(nodes,bindings);
  let pose,panels=true,references=true;
  function setPose(next){
    const delta=poseDelta(profile,next),atReference=delta.every(d=>Math.abs(d)<1e-7);
    for(const [key,node]of nodes){
      const part=records.get(key),offset=cadToGlb(delta.map((d,i)=>part.motion_axes.includes('XYZ'[i])?d*(part.motion_signs?.['XYZ'[i]]??1):0)),origin=origins.get(key);
      node.position.set(origin.x+offset[0],origin.y+offset[1],origin.z+offset[2]);
      node.visible=part.motion==='reference_flexible'?references:part.group==='Remorph_Enclosure'?panels:true;
    }
    pose={...next};
    const beltState=belts.update(delta,references);
    return {xyz_mm:['x','y','z'].map(a=>next[a]),cad_delta_xyz_mm:delta,corexy_delta:corexyDelta(delta),bed_delta_mm:-delta[2],atReference,belts:beltState,reference_flexible_visible:references,clearance_verified:false};
  }
  function setEnclosureVisible(value){panels=Boolean(value);if(pose)setPose(pose)}
  function setFlexibleVisible(value){references=Boolean(value);if(pose)setPose(pose)}
  function setPalette(colors){for(const[k,n]of nodes){const color=colors[records.get(k).appearance_role];if(color)n.traverse(m=>{if(m.isMesh)for(const mat of [].concat(m.material))mat.color.set(color)})}}
  function getPose(){return pose?['x','y','z'].map(a=>pose[a]):[...profile.display_reference_xyz_mm]}
  return {nodes,records,belts,setPose,getPose,setEnclosureVisible,setFlexibleVisible,setPalette};
}
