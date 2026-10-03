import {circleBeltRoute,beltGeometry,BELT_THICKNESS} from './v0-belts.mjs?v=rear-cooling-34';

// Datums measured on both native R2 belt solids, not resized from V0.
// F695 back contact R6.5; toothed-pulley outer belt back R6.742203.
// Source: VoronDesign/Voron-Trident a8628f48546948ce1fc15511b7765b7f31f80722.
// Closed, smooth routing envelope only; teeth, clamps and tension are not simulated.
const centre=row=>row.bounds_mm[0].map((v,i)=>(v+row.bounds_mm[1][i])/2);
export function tridentBeltCircles(metadata,name,dy=0){
 if(!/^trident_r2_gantry_(250|300|350)$/.test(metadata.id)||metadata.belt_width_mm!==6)throw Error('Trident belt profile mismatch');
 if(!['A_Belt','B_Belt'].includes(name))throw Error('Unknown Trident belt');
 const mirror=name==='B_Belt'?-1:1,offset=(Number(metadata.id.split('_').at(-1))-350)/2;
 const specs=[[-226,-.5,1,true], [212.76,-13.74,-1,true,'idler'],
  [226,-220.25,1,false,'front'], [226,216.5,1,false],
  [196,231,-1,false,'motor'], [192,247.5,1,false],
  [-192,247.5,1,false], [-226,216.5,1,false]];
 return specs.map(([x,y,turn,moving,type])=>{
  x+=Math.sign(x)*offset;if(!moving)y+=Math.sign(y)*offset;
  const pattern=type==='motor'?/GT2 20T Pulley/:type==='idler'?/GT2 20T Idler/:type==='front'?/F695|M5x16 BHCS/:/F695/;
  const match=metadata.parts.some(p=>pattern.test(p.name)&&p.motion===(moving?'y':'fixed')&&Math.hypot(centre(p)[0]-x*mirror,centre(p)[1]-y)<.002);
  if(!match)throw Error('Trident belt axis registration mismatch: '+[x*mirror,y]);
  return {x:x*mirror,y:y+(moving?dy:0),r:type==='motor'||type==='idler'?6.742203-BELT_THICKNESS/2:6.5+BELT_THICKNESS/2,turn:turn*mirror,moving};
 });
}
export function createTridentBelts(root,metadata){
 const rows=metadata.parts.filter(p=>['A_Belt','B_Belt'].includes(p.name));
 if(rows.length!==2)throw Error('Expected two Trident R2 belts');
 const meshes=new Map();root.traverse(m=>{if(m.isMesh)meshes.set(m.userData.part_key||m.name,m)});
 const entries=rows.map(row=>{
  const mesh=meshes.get(row.key);if(!mesh)throw Error('Missing Trident belt mesh');
  return {row,mesh,z:centre(row)[2],circles:tridentBeltCircles(metadata,row.name),sourceGeometry:mesh.geometry,route:null};
 });
 let lastY;
 function update(dy,visible){
  for(const e of entries){
   if(dy!==lastY){
    e.route=circleBeltRoute(e.circles.map(c=>({...c,y:c.y+(c.moving?dy:0)})));
    if(e.mesh.geometry!==e.sourceGeometry)e.mesh.geometry.dispose();
    e.mesh.geometry=beltGeometry(e.route,e.z);
   }
   e.mesh.visible=Boolean(visible);
  }
  lastY=dy;
 }
 return {entries,update};
}
