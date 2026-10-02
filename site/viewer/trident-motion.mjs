import {createTridentBelts} from './trident-belts.mjs?v=public-v18-motion1';
/** Independent Trident bed motion. Vertices carry their CAD placements. */
export function createTridentMotion(profile){
 if(profile.kinematics!=='trident'||profile.machine_id!=='voron_trident_350')throw Error('Trident profile mismatch');
 const entries=new Map(),belts=[];let reference=[...profile.display_reference_xyz_mm],bedReferenceDrop=0;
 function register(root,metadata){
  const rows=new Map(metadata.parts.map(p=>[p.key,p]));
  root.traverse(mesh=>{if(!mesh.isMesh)return;const key=mesh.userData.part_key||mesh.name,row=rows.get(key);if(!row)throw Error('Unregistered Trident part '+key);
   if(!['fixed','xy','y','z','reference_flexible'].includes(row.motion))throw Error('Unknown Trident motion '+key);
   if(entries.has(mesh))return;entries.set(mesh,{row,origin:mesh.position.clone()});
  });
  if(metadata.id==='trident_r2_gantry_350'&&!belts.some(b=>b.root===root))belts.push({root,...createTridentBelts(root,metadata)});
 }
 function setReference(value){reference=[...value]}
 function setBedReferenceDrop(value){if(!Number.isFinite(value)||value<0||value>profile.display_limits_mm.Z[1])throw Error('Invalid bed reference');bedReferenceDrop=value}
 function setPose(pose,{flexibleVisible=true,toolheadReference=true}={}){
  const xyz=['x','y','z'].map((a,i)=>{const v=Number(pose[a]);if(!Number.isFinite(v))throw Error('Non-finite pose');const limits=profile.display_limits_mm[a.toUpperCase()];return Math.max(limits[0],Math.min(limits[1]-(a==='z'?bedReferenceDrop:0),v))});
  const dx=xyz[0]-reference[0],dy=xyz[1]-reference[1],down=xyz[2]+bedReferenceDrop;
  for(const [mesh,{row,origin}] of entries){const motion=row.motion;
   mesh.position.set(origin.x+(motion==='xy'?dx/1000:0),origin.y-(motion==='z'?down/1000:0),origin.z-(['xy','y'].includes(motion)?dy/1000:0));
   if(motion==='reference_flexible'){
    const bedChain=row.group==='Z Assembly'||/Chain Z:/.test(row.source_component||'');
    mesh.visible=Boolean(flexibleVisible)&&(bedChain?Math.abs(down)<.00001:toolheadReference&&Math.abs(dx)+Math.abs(dy)+Math.abs(down)<.00001);
   }
  }
  for(const b of belts)b.update(dy,flexibleVisible);
  return {x:xyz[0],y:xyz[1],z:xyz[2],dx,dy,bed_down_mm:down,bed_chain_visible:Boolean(flexibleVisible)&&Math.abs(down)<.00001,belt_route_lengths_mm:belts.flatMap(b=>b.entries.map(e=>e.route.length))};
 }
 return {register,setReference,setBedReferenceDrop,setPose,entries,belts};
}
