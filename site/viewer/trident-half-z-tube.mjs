import {CurvePath,LineCurve3,CubicBezierCurve3,Vector3} from './vendor/three.module.js';

// Half-height 350 source: the stationary 4.4 mm roof passage and holder stay
// fixed. Only the free display hose changes; native/downloaded solids do not.
export const halfZTubeSource={
 machine_id:'voron_trident_350_half_z',
 roof_bottom_z_mm:377.9938482537978,
 routing_datums:{"part_key":"voron_trident_350_base_1409","controls_mm":[[0.0,-35.880961,347.660258],[0.0,-35.880961,377.660258],[0,185.0,315],[0,185.0,345],[0,185.0,435],[0,185.0,465],[270.16252954107694,243.39839201394472,364.90646910724536],[270.16252954107665,187.0168347667902,385.42767770678546]],"radius_mm":2,"inner_radius_mm":1.5,"moving_axes":["X","Y"],"start_mm":[0.0,-35.880961,307.660258],"end_mm":[270.1625295410766,171.98175283421565,390.89999999999617],"holder_part_key":"voron_trident_350_base_1393","holder_bore_axis":[4.977943102828792e-15,0.9396926207859085,-0.3420201433256684],"holder_bore_point_mm":[270.16252954107654,162.34642462299354,394.4069726662664],"route_revision":2},
 native_mate_guards:{
  voron_trident_350_base_1409:'475e455d0124dc07f3119c14ce739dc8bee486bed3c40e7920983b8962f5279d',
  voron_trident_350_base_1359:'7e5c6cd90e2c58a5d8670d1819d4a799a3b8cc6dd378c5e2764d9e5ef2b3594a',
  voron_trident_350_base_1393:'ad7f0f8a2368567a1a7d32c2c6c09d4f6ceff502d917ce8c5049f3eab65bc576',
  voron_trident_350_base_1347:'d6d834c7cc653dcf2c9eb2c010a423f6d30927508d08e12fcf955c8eae5ce46d',
  voron_trident_350_base_1346:'b0388a8912c735d57bbe7a4ad2080314995c4edb265c5263a07b19592920841f',
  578:'e4f73068790c6c312305ca6201b1db0af25fa5bdf2d34816875bb12351c1a4cc'
 }
};
export function isHalfZTube(spec){
 return spec?.route_revision===2&&spec.part_key==='voron_trident_350_base_1409'
  &&spec.start_mm?.[2]===307.660258&&spec.end_mm?.[2]===390.89999999999617;
}
function guardDatums(spec){
 for(const[key,value]of Object.entries(halfZTubeSource.routing_datums))
  if(JSON.stringify(spec?.[key])!==JSON.stringify(value))throw Error('Half-height PTFE routing datum changed: '+key);
}
export function guardHalfZTube(manifest){
 if(manifest.machine_id!==halfZTubeSource.machine_id||!isHalfZTube(manifest.custom_ptfe))throw Error('Half-height PTFE source changed');
 guardDatums(manifest.custom_ptfe);
 for(const[key,sha]of Object.entries(halfZTubeSource.native_mate_guards))
  if(manifest.parts.find(p=>p.key===key)?.native_sha256!==sha)throw Error('Half-height PTFE native mate changed: '+key);
}
const world=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
export function halfZTubeCurve(spec,dx=0,dy=0){
 if(!isHalfZTube(spec)||![dx,dy].every(Number.isFinite))throw Error('Invalid half-height PTFE source/pose');
 guardDatums(spec);
 const p=spec.controls_mm.map(v=>v.slice()),start=spec.start_mm.map((v,i)=>v+(i===0?dx:i===1?dy:0));
 // The old 40 mm neck followed by two short handles folded immediately out
 // of the extruder. Keep a 10 mm coaxial lead and approach the SAME roof
 // passage on its original vertical axis, below the panel's underside.
 const exit=[start[0],start[1],start[2]+10];
 const entry=[p[3][0],p[3][1],halfZTubeSource.roof_bottom_z_mm-spec.radius_mm-.25];
 const span=Math.hypot(entry[0]-exit[0],entry[1]-exit[1]),rise=entry[2]-exit[2];
 const handle=Math.max(rise/2,1.15*Math.sqrt(2*30*span/3));
 const first=[exit,[exit[0],exit[1],exit[2]+handle],[entry[0],entry[1],entry[2]-handle],entry];
 // The short first handle on the OUTSIDE bow also formed a ~4 mm radius.
 // Both tangents still meet the original roof axis and tilted holder bore.
 const tailHandle=Math.hypot(...p[7].map((v,i)=>v-p[4][i]))*.4;
 // Lift the outside bow over the original top-panel corner clip and screw;
 // shortening the neck alone sent the hose through their upper edge.
 const tail=[p[4],[p[4][0],p[4][1],p[4][2]+tailHandle*2],p[7].map((v,i)=>v+spec.holder_bore_axis[i]*tailHandle),p[7]];
 const curve=new CurvePath(),line=(a,b)=>curve.add(new LineCurve3(world(a),world(b))),cubic=points=>{
  const c=new CubicBezierCurve3(...points.map(world));c.arcLengthDivisions=2048;curve.add(c);
 };
 line(start,exit);cubic(first);line(entry,p[4]);cubic(tail);line(p[7],spec.end_mm);
 curve.userData={route:'half-height-source-passage-fair-bows',roof_axis_xy_mm:entry.slice(0,2),
  roof_entry_mm:entry,roof_exit_mm:p[4].slice(),minimum_review_radius_mm:20,
  radius_scope:'Display review assumption; not a PTFE material rating',
  physical_cut_length_certified:false};
 return curve;
}
