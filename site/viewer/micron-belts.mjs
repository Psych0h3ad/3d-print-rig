import {circleBeltRoute,beltGeometry} from './v0-belts.mjs?v=probe-travel-32';

// Original RC8 belt-face arcs, CAD mm: PrintersForAnts/Micron f76aa287.
// Each loop has two Y-moving contacts; every XY contact follows the Z gantry.
// Smooth 6 mm routing preview. Tooth motion and belt clamp cuts are pending.
const specs=[
 [[132.163517,10.615342,6.38,true],[-121.671941,.144112,4.091,true],[-132.143381,-137.047204,6.380440,false],[-132.143820,148.582212,6.38,false],[-105.357598,135.259424,4.091,false],[-101.143820,148.582212,6.38,false],[132.164837,148.583847,6.378365,false]],
 [[-132.142500,10.616977,6.38,true],[121.692958,.145747,4.091,true],[132.164398,-137.045568,6.380440,false],[132.164837,148.583847,6.38,false],[105.378615,135.261060,4.091,false],[101.164837,148.583847,6.38,false],[-132.143820,148.585482,6.378365,false]]
];
export function micronBeltCircles(index,dy=0){
 if(!specs[index])throw Error('Unknown Micron belt');const mirror=index===0?1:-1;
 return specs[index].map(([x,y,r,moving])=>({x,y:y+(moving?dy:0),r:r+.69*(r<5?1:-1),turn:(r<5?1:-1)*mirror,moving}));
}
export function createMicronBelts(nodes,records,profile){
 const rows=[...records.values()].filter(p=>p.motion==='reference_flexible'&&/belt/i.test(p.name));
 const xy=rows.filter(p=>p.name==='Belts v6');
 if(xy.length&&profile.machine_id!=='micron_plus_r1_180'||xy.length&&xy.length!==2)throw Error('Micron XY belt profile');
 const entries=xy.sort((a,b)=>a.key.localeCompare(b.key)).map((row,index)=>{
  const node=nodes.get(row.key),meshes=[];node.traverse(m=>{if(m.isMesh)meshes.push(m)});if(meshes.length!==1)throw Error('Micron belt mesh count');
  return {row,node,mesh:meshes[0],index,z:(row.bounds_mm[0][2]+row.bounds_mm[1][2])/2,source:meshes[0].geometry,route:null};
 });
 const keys=new Set(rows.map(p=>p.key));let lastY;
 function update(delta,visible){
  for(const row of rows)nodes.get(row.key).visible=Boolean(visible);
  for(const e of entries){
   if(lastY!==delta[1]){
    e.route=circleBeltRoute(micronBeltCircles(e.index,delta[1]));
    if(e.mesh.geometry!==e.source)e.mesh.geometry.dispose();e.mesh.geometry=beltGeometry(e.route,e.z);
   }
   e.node.position.set(0,delta[2]/1000,0);
  }
  lastY=delta[1];return {visible:Boolean(visible),fixed_z_belts:rows.length-entries.length,xy_belts:entries.length,lengths_mm:entries.map(e=>e.route.length)};
 }
 return {keys,entries,update};
}
