// Original350 size alternatives retain their outer end, not their centroid.
// Native bore/shaft/socket measurements: docs/NATIVE_STANDARD_FRONT_REGISTRATION_100.json.
const mates=[
 {leaf:'825',name:'front_skirt_left_350',side:'Left',delta:-50,bounds:[[-173.5,-255,-66.000113854177],[-9.5,-235,.8]]},
 {leaf:'852',name:'front_skirt_right_350',side:'Right',delta:50,bounds:[[9.499884575971,-255,-66.000113854187],[173.499884775972,-235,.8]]},
];
export function tridentFrontRegistration(profile,metadata){
 const result=new Map();
 if(profile.machine_id!=='voron_trident_350'||metadata.id!=='voron_trident_350_base')return result;
 if(profile.size_mm!==350)throw Error('Trident front source size mismatch');
 for(const mate of mates){
  const key='voron_trident_350_base_'+mate.leaf,row=metadata.parts.find(p=>p.key===key);
  if(!row||row.source_leaf!==mate.leaf||row.name!==mate.name||row.motion!=='fixed'||row.appearance_role!=='base'||row.source_component!==`Skirt:1/Front:1/${mate.side}:1/${mate.name}:1`)throw Error('Trident front native source identity changed');
  const error=delta=>Math.max(...mate.bounds.flatMap((b,j)=>b.map((v,i)=>Math.abs(row.bounds_mm?.[j]?.[i]-(v+(i===0?delta:0))))));
  const delta=error(0)<.001?mate.delta:error(mate.delta)<.001?0:null;
  if(delta===null)throw Error('Trident front native registration differs');
  result.set(key,{delta_mm:delta,source_bounds_mm:row.bounds_mm,registered_bounds_mm:row.bounds_mm.map(b=>b.map((v,i)=>v+(i===0?delta:0)))});
 }
 return result;
}
