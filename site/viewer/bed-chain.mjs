import {Vector3} from './vendor/three.module.js';
import {tridentChainPins} from './bed-chain-pins.mjs?v=public-v25';

// Rigid 17 mm links. Solve their angles in the native XZ hinge plane.
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
 if(!links.length)return null;
 const spec=metadata.bed_chain_spec,extended=spec!==undefined;
 if(extended&&(metadata.machine_id!=='voron_trident_1000_custom'||spec.schema!=='trident-native-chain-95'||!Number.isInteger(spec.count)||spec.count<20||spec.count>120||spec.pitch_mm!==17||!Array.isArray(spec.end_parts)))throw Error('Unregistered native bed chain specification');
 const count=extended?spec.count:20,pitch=extended?spec.pitch_mm:17;
 if(links.length!==count)throw Error('Trident bed chain link count');
 const siboor=links[0].group==='04_Z_Motion',pins=metadata.bed_chain_pins??tridentChainPins[siboor?'siboor':'voron'],meshes=new Map();
 if(pins.length!==count||new Set(pins.map(p=>p.key)).size!==count)throw Error('Trident bed chain hinge count');
 root.traverse(o=>{if(o.isMesh)meshes.set(o.userData.part_key||o.userData.partKey||o.name,o)});
 const entries=pins.map(pin=>{
  const row=links.find(r=>r.key===pin.key)||(!extended&&!siboor?links.find(r=>r.key.endsWith('_'+pin.key.split('_').at(-1))):undefined);
  if(!row)throw Error('Missing native chain link '+pin.key);const mesh=meshes.get(row.key);if(!mesh)throw Error('Missing chain mesh '+row.key);
  if(![pin.from_xz_mm,pin.to_xz_mm].every(p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite))||Math.abs(Math.hypot(...pin.to_xz_mm.map((v,i)=>v-pin.from_xz_mm[i]))-pitch)>1e-5)throw Error('Native chain hinge pitch '+row.key);
  for(const p of [pin.from_xz_mm,pin.to_xz_mm])for(const [j,a]of [0,2].entries())if(p[j]<row.bounds_mm[0][a]-.001||p[j]>row.bounds_mm[1][a]+.001)throw Error('Native chain hinge registration '+row.key);
  const y=(row.bounds_mm[0][1]+row.bounds_mm[1][1])/2,from=new Vector3(pin.from_xz_mm[0]/1000,pin.from_xz_mm[1]/1000,-y/1000);
  mesh.updateWorldMatrix(true,false);
  const pivotLocal=mesh.worldToLocal(from.clone());
  mesh.frustumCulled=false;
  return {row,mesh,from,pivotLocal,angle:Math.atan2(pin.to_xz_mm[1]-pin.from_xz_mm[1],pin.to_xz_mm[0]-pin.from_xz_mm[0]),origin:mesh.position.clone(),rotation:mesh.quaternion.clone()};
 });
 const endRows=rows.filter(p=>p.name!=='10x11 Chain Link'),endRegistration=new Map((spec?.end_parts??[]).map(p=>[p.key,p]));
 if(extended&&(endRegistration.size!==spec.end_parts.length||endRows.length!==endRegistration.size||endRows.some(p=>typeof endRegistration.get(p.key)?.moving!=='boolean')))throw Error('Native bed chain end hardware registration');
 const endParts=endRows.map(row=>{const mesh=meshes.get(row.key);if(!mesh)throw Error('Missing chain end mesh '+row.key);return {row,mesh,origin:mesh.position.clone(),moving:extended?endRegistration.get(row.key).moving:(row.bounds_mm[0][2]+row.bounds_mm[1][2])/2>150};});
 const start=pins[0].from_xz_mm,end=pins.at(-1).to_xz_mm,axis=new Vector3(0,0,1);let lastDown,route;
 if(extended&&[spec.start_xz_mm,spec.end_xz_mm].some((p,i)=>!Array.isArray(p)||p.length!==2||p.some((v,j)=>!Number.isFinite(v)||Math.abs(v-[start,end][i][j])>1e-5)))throw Error('Native bed chain endpoint registration');
 function update(down,visible){
  if(down!==lastDown){
   route=bedChainRoute(start,[end[0],end[1]-down],count,pitch);
   for(const [i,e]of entries.entries()){
    if(Math.abs(down)<1e-8){e.mesh.position.copy(e.origin);e.mesh.quaternion.copy(e.rotation);continue;}
    e.mesh.quaternion.setFromAxisAngle(axis,route.angles[i]-e.angle).multiply(e.rotation);
    const p=route.points[i],target=new Vector3(p[0]/1000,p[1]/1000,e.from.z);
    if(e.mesh.parent)e.mesh.parent.worldToLocal(target);
    e.mesh.position.copy(target).sub(e.pivotLocal.clone().multiply(e.mesh.scale).applyQuaternion(e.mesh.quaternion));
   }
   for(const e of endParts)e.mesh.position.set(e.origin.x,e.origin.y-(e.moving?down/1000:0),e.origin.z);
   lastDown=down;
  }
  for(const e of [...entries,...endParts])e.mesh.visible=Boolean(visible);
  return {visible:Boolean(visible),links:entries.length,length_mm:route.length_mm,endpoint_error_mm:route.endpoint_error_mm};
 }
 return {entries,endParts,update};
}
