import {circleBeltRoute} from './v0-belts.mjs?v=trident-clearance-35';
import {monolithBeltGeometry} from './monolith-belts.mjs?v=trident-clearance-35';

// Native printed V2.4 R2 A/B belt contacts, in CAD millimetres (350 mm).
// VoronDesign/Voron-2 a192410e27ea345644ae5c4b29b4c9c40cbe1a73.
// F695: R6.5 contact + half the 1.38 mm belt; toothed pulleys: R5.240198.
// Keep the native mesh at the CAD XY pose. During travel, render an open,
// smooth belt envelope outside the head clamp; teeth/tension are not simulated.
const contacts=[
 [-226.1503713968,-.5004915679,7.19,-1,true],
 [-226.1503713968,245.5298371145,7.19,-1,false],
 [189.1961629756,245.5068256685,7.19,-1,false],
 [196.0002817713,230.0298371144,5.9301977237,1,false],
 [226.1961626001,245.5298371145,7.19,-1,false],
 [226.0231430766,-224.5001733508,7.19,-1,false],
 [212.9029847717,-13.6206892916,5.9301977237,1,true],
];
export function v24BeltCircles(size,name,dy=0){
 if(![250,300,350].includes(size)||!['A Belt','B Belt'].includes(name))throw Error('V2.4 R2 belt profile mismatch');
 const mirror=name==='A Belt'?1:-1,offset=(size-350)/2;
 return contacts.map(([x,y,r,turn,moving])=>({x:mirror*(x+Math.sign(x)*offset),y:y+(moving?dy:Math.sign(y)*offset),r,turn:turn*mirror,moving}));
}
export function v24BeltRoute(size,name,dx=0,dy=0,z=0){
 const closed=circleBeltRoute(v24BeltCircles(size,name,dy)),span=closed.spans.at(-1),mirror=name==='A Belt'?1:-1;
 // The final tangent crosses the carriage. Cut it into the two real ends,
 // inside the clamp region, instead of drawing a closed loop through the head.
 const endpoint=x=>[x,span.from[1]+(x-span.from[0])*(span.to[1]-span.from[1])/(span.to[0]-span.from[0])];
 const first=endpoint(-10*mirror+dx),last=endpoint(10*mirror+dx);
 if((first[0]-span.to[0])*mirror<=0||(span.from[0]-last[0])*mirror<=0)throw Error('V2.4 belt clamp outside idlers');
 const points=[first],normals=[span.normal];
 // circleBeltRoute stores the arc points in order, with straight joins.
 points.push(...closed.points);normals.push(...closed.normals);points.push(last);normals.push(span.normal);
 const length=closed.length-Math.hypot(span.to[0]-span.from[0],span.to[1]-span.from[1])+Math.hypot(first[0]-span.to[0],first[1]-span.to[1])+Math.hypot(last[0]-span.from[0],last[1]-span.from[1]);
 return {points,normals,length,arcs:closed.arcs,spans:closed.spans.slice(0,-1),z,width:6,thickness:1.38};
}
export function createV24Belts(nodes,manifest,profile){
 const rows=manifest.parts.filter(p=>/^[AB] Belt$/.test(p.name||''));
 // The LDO reference assets contain Z belts only; never reuse the R2 XY path.
 if(!rows.length)return {keys:new Set(),entries:[],update(){}};
 if(rows.length!==2||profile.xy_belt_width_mm!==6)throw Error('Expected two native 6 mm V2.4 R2 belts');
 const size=Number(profile.machine_id.match(/_(250|300|350)(?:_|$)/)?.[1]);
 const entries=rows.map(row=>{
  const node=nodes.get(row.key),meshes=[];node.traverse(m=>{if(m.isMesh)meshes.push(m)});
  if(meshes.length!==1)throw Error('Unexpected V2.4 belt mesh structure');
  return {node,mesh:meshes[0],sourceGeometry:meshes[0].geometry,z:(row.bounds_mm[0][2]+row.bounds_mm[1][2])/2,name:row.name,route:null};
 });
 let previous;
 function update(delta,visible){
  const [dx,dy]=delta,reference=Math.abs(dx)+Math.abs(dy)<1e-5;
  for(const e of entries){
   if(!previous||Math.abs(dx-previous[0])+Math.abs(dy-previous[1])>1e-8){
    if(e.mesh.geometry!==e.sourceGeometry)e.mesh.geometry.dispose();
    e.route=reference?null:v24BeltRoute(size,e.name,dx,dy,e.z);
    e.mesh.geometry=e.route?monolithBeltGeometry(e.route):e.sourceGeometry;
   }
   e.node.visible=Boolean(visible);e.mesh.visible=Boolean(visible);
  }
  previous=[dx,dy];
 }
 return {keys:new Set(rows.map(r=>r.key)),entries,update};
}
