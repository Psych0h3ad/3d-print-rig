import {createTridentBelts} from './trident-belts.mjs?v=36cbfcd85e770a25e822';
import {createBedChain,isTridentBedChain} from './bed-chain.mjs?v=5c6ddd46ac13e6974c73';
import {assertTridentBedRegistration} from './trident-bed-registration.mjs?v=17201d090ac06e795be0';
import {tridentFrontRegistration} from './trident-front-registration.mjs?v=6ae818408f2a66ba416a';
/** Independent Trident bed motion. Vertices carry their CAD placements. */
export function createTridentMotion(profile){
 if(profile.kinematics!=='trident'||!/^voron_trident_(?:(?:250|300|350)|(?:500|1000)_custom|350_half_z)$/.test(profile.machine_id))throw Error('Trident profile mismatch');
 const size=profile.size_mm??Number(profile.machine_id.match(/_(250|300|350|500|1000)(?:_|$)/)?.[1]),gantryId='trident_r2_gantry_'+size;
 const entries=new Map(),belts=[],bedChains=[];let reference=[...profile.display_reference_xyz_mm],bedReferenceDrop=0,limitsIncludeBedReferenceDrop=false;
 function register(root,metadata){
  if(/^trident_r2_gantry_/.test(metadata.id||'')&&metadata.id!==gantryId)throw Error('Trident gantry size mismatch');
  const rows=new Map(metadata.parts.map(p=>[p.key,p]));
  const front=tridentFrontRegistration(profile,metadata);
  // Original leaf1167 joins moving bed extrusions despite its Frame_Hardware path.
  const stockBase=/^voron_trident_(250|300|350)$/.test(profile.machine_id)&&metadata.id===profile.machine_id+'_base';
  const customProfile=/^voron_trident_((?:500|1000)_custom|350_half_z)$/.test(profile.machine_id);
  const customBase=customProfile&&(metadata.machine_id!==undefined||metadata.source_baseline!==undefined);
  if(customBase&&(metadata.machine_id!==profile.machine_id||metadata.source_baseline!=='voron_trident_350'||metadata.id!==gantryId))throw Error('Native custom Trident bed-joint source identity changed');
  if(customBase)assertTridentBedRegistration(metadata,profile);
  const bedJointPrefix=customBase?'voron_trident_350_base':profile.machine_id+'_base';
  const bedJointKey=bedJointPrefix+'_1167';
  if(stockBase||customBase){
   const screw=rows.get(bedJointKey),cross=rows.get(bedJointPrefix+'_1038'),stem=rows.get(bedJointPrefix+'_1039');
   if(!screw||screw.source_leaf!=='1167'||screw.name!=='M5x16 BHCS'||screw.source_component!=='Frame:1/Frame_Hardware:1/Screws:1/M5x16 BHCS:19'||!['fixed','z'].includes(screw.motion)||cross?.motion!=='z'||stem?.motion!=='z'||cross.source_leaf!=='1038'||stem.source_leaf!=='1039'||!cross.source_component?.startsWith('Frame:1/Bed Extrusions:1/')||!stem.source_component?.startsWith('Frame:1/Bed Extrusions:1/'))throw Error('Native Trident bed-joint identity/mates changed');
   // Copy one runtime row: raw metadata and its accepted native witness pins stay intact.
   rows.set(bedJointKey,{...screw,motion:'z',motion_axes:['Z'],mount_motion:'bed_support_extrusion'});
  }
  root.traverse(mesh=>{if(!mesh.isMesh)return;const key=mesh.userData.part_key||mesh.name,row=rows.get(key);if(!row)throw Error('Unregistered Trident part '+key);
   if(!['fixed','xy','y','z','reference_flexible'].includes(row.motion))throw Error('Unknown Trident motion '+key);
   if(entries.has(mesh))return;
   const registration=front.get(key);
   if(registration)mesh.position.x+=registration.delta_mm/1000;
   entries.set(mesh,{row:registration?{...row,bounds_mm:registration.registered_bounds_mm,front_registration_delta_mm:registration.delta_mm}:row,origin:mesh.position.clone()});
  });
  if(metadata.parts.some(p=>isTridentBedChain(p)&&p.name==='10x11 Chain Link')&&!bedChains.some(c=>c.root===root))bedChains.push({root,...createBedChain(root,metadata)});
  if(metadata.id===gantryId&&!belts.some(b=>b.root===root))belts.push({root,...createTridentBelts(root,metadata)});
 }
 function setReference(value){reference=[...value]}
 function setBedReferenceDrop(value,{displayLimitsIncludeBedReferenceDrop=false}={}){limitsIncludeBedReferenceDrop=displayLimitsIncludeBedReferenceDrop;if(!Number.isFinite(value)||value< -40||value>profile.display_limits_mm.Z[1])throw Error('Invalid bed reference');bedReferenceDrop=value}
 function setPose(pose,{flexibleVisible=true,toolheadReference=true}={}){
  const xyz=['x','y','z'].map((a,i)=>{const v=Number(pose[a]);if(!Number.isFinite(v))throw Error('Non-finite pose');const limits=profile.display_limits_mm[a.toUpperCase()];return Math.max(limits[0],Math.min(limits[1]-(a==='z'&&!limitsIncludeBedReferenceDrop?Math.max(0,bedReferenceDrop):0),v))});
  const dx=xyz[0]-reference[0],dy=xyz[1]-reference[1],down=xyz[2]+bedReferenceDrop;
  for(const [mesh,{row,origin}] of entries){const motion=row.motion;
   if(isTridentBedChain(row))continue;
   mesh.position.set(origin.x+(motion==='xy'?dx/1000:0),origin.y-(motion==='z'?down/1000:0),origin.z-(['xy','y'].includes(motion)?dy/1000:0));
   if(motion==='reference_flexible'){
    mesh.visible=Boolean(flexibleVisible);
   }
  }
  for(const b of belts)b.update(dy,flexibleVisible);
  const chains=bedChains.map(c=>c.update(down,flexibleVisible));
  return {x:xyz[0],y:xyz[1],z:xyz[2],dx,dy,bed_down_mm:down,bed_chain_visible:chains.some(c=>c.visible),bed_chains:chains,belt_route_lengths_mm:belts.flatMap(b=>b.entries.map(e=>e.route.length))};
 }
 return {register,setReference,setBedReferenceDrop,setPose,entries,belts,bedChains,getReference:()=>[...reference]};
}
