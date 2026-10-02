import {Vector3} from './vendor/three.module.js';
import {tridentChainPins} from './bed-chain-pins.mjs?v=public-v25';

// Twenty rigid 17 mm links. Solve their angles in the native XZ hinge plane.
// Endpoints are the frame and bed pivots; no mesh stretching or head dependency.
export function bedChainRoute(start,end,count=20,pitch=17){
 const target=[end[0]-start[0],end[1]-start[1]];
 let centre=(count+target[1]/pitch)/2,span=Math.PI*target[0]/(2*pitch);
 const evaluate=(c,s)=>{const angles=Array.from({length:count},(_,i)=>Math.PI/2-Math.PI*Math.max(0,Math.min(1,(i+.5-c)/s+.5)));
  return {angles,xy:[pitch*angles.reduce((n,a)=>n+Math.cos(a),0),pitch*angles.reduce((n,a)=>n+Math.sin(a),0)]};};
 let result,error;
 for(let i=0;i<60;i++){
  result=evaluate(centre,span);error=result.xy.map((v,j)=>v-target[j]);if(Math.hypot(...error)<1e-7)break;
  const h=.001,c=evaluate(centre+h,span).xy,s=evaluate(centre,span+h).xy,j=c.map((v,k)=>[(v-result.xy[k])/h,(s[k]-result.xy[k])/h]);
  const det=j[0][0]*j[1][1]-j[0][1]*j[1][0];if(Math.abs(det)<1e-10)throw Error('Bed chain route singular');
  centre-=Math.max(-.5,Math.min(.5,(error[0]*j[1][1]-error[1]*j[0][1])/det));
  span=Math.max(1,span-Math.max(-.5,Math.min(.5,(j[0][0]*error[1]-j[1][0]*error[0])/det)));
 }
 if(Math.hypot(...error)>1e-5)throw Error('Bed chain endpoints outside route');
 const points=[[...start]];for(const a of result.angles){const p=points.at(-1);points.push([p[0]+pitch*Math.cos(a),p[1]+pitch*Math.sin(a)]);}
 return {points,angles:result.angles,endpoint_error_mm:Math.hypot(...error),length_mm:count*pitch};
}

export function isTridentBedChain(row){return (row?.group==='04_Z_Motion'&&row.name==='10x11 Chain Link')||/Chain Z:/.test(row?.source_component||'');}

export function createBedChain(root,metadata){
 const rows=metadata.parts.filter(isTridentBedChain),links=rows.filter(p=>p.name==='10x11 Chain Link');
 if(!links.length)return null;if(links.length!==20)throw Error('Trident bed chain link count');
 const siboor=links[0].group==='04_Z_Motion',pins=tridentChainPins[siboor?'siboor':'voron'],meshes=new Map();
 root.traverse(o=>{if(o.isMesh)meshes.set(o.userData.part_key||o.userData.partKey||o.name,o)});
 const entries=pins.map(pin=>{
  const row=links.find(r=>siboor?r.key===pin.key:r.key.endsWith('_'+pin.key.split('_').at(-1)));
  if(!row)throw Error('Missing native chain link '+pin.key);const mesh=meshes.get(row.key);if(!mesh)throw Error('Missing chain mesh '+row.key);
  for(const p of [pin.from_xz_mm,pin.to_xz_mm])for(const [j,a]of [0,2].entries())if(p[j]<row.bounds_mm[0][a]-.001||p[j]>row.bounds_mm[1][a]+.001)throw Error('Native chain hinge registration '+row.key);
  const y=(row.bounds_mm[0][1]+row.bounds_mm[1][1])/2,from=new Vector3(pin.from_xz_mm[0]/1000,pin.from_xz_mm[1]/1000,-y/1000);
  mesh.frustumCulled=false;
  return {row,mesh,from,angle:Math.atan2(pin.to_xz_mm[1]-pin.from_xz_mm[1],pin.to_xz_mm[0]-pin.from_xz_mm[0]),origin:mesh.position.clone(),rotation:mesh.quaternion.clone()};
 });
 const endParts=rows.filter(p=>p.name!=='10x11 Chain Link').map(row=>({row,mesh:meshes.get(row.key),origin:meshes.get(row.key).position.clone(),moving:(row.bounds_mm[0][2]+row.bounds_mm[1][2])/2>150}));
 const start=pins[0].from_xz_mm,end=pins.at(-1).to_xz_mm,axis=new Vector3(0,0,1);let lastDown,route;
 function update(down,visible){
  if(down!==lastDown){
   route=bedChainRoute(start,[end[0],end[1]-down]);
   for(const [i,e]of entries.entries()){
    if(Math.abs(down)<1e-8){e.mesh.position.copy(e.origin);e.mesh.quaternion.copy(e.rotation);continue;}
    e.mesh.quaternion.setFromAxisAngle(axis,route.angles[i]-e.angle);
    const p=route.points[i];e.mesh.position.set(p[0]/1000,p[1]/1000,e.from.z).sub(e.from.clone().applyQuaternion(e.mesh.quaternion)).add(e.origin);
   }
   for(const e of endParts)e.mesh.position.set(e.origin.x,e.origin.y-(e.moving?down/1000:0),e.origin.z);
   lastDown=down;
  }
  for(const e of [...entries,...endParts])e.mesh.visible=Boolean(visible);
  return {visible:Boolean(visible),links:entries.length,length_mm:route.length_mm,endpoint_error_mm:route.endpoint_error_mm};
 }
 return {entries,endParts,update};
}
