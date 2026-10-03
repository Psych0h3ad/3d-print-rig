import {Vector3,CatmullRomCurve3,TubeGeometry} from './vendor/three.module.js';
import {bedChainRoute} from './bed-chain.mjs?v=public-v25';
import {micronChainPins} from './micron-flexible-pins.mjs?v=motion-colors-41';

const point=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
// Tube controls use native cap/straight-section coordinates. Moving paths are
// routing previews; their bend radii, service length and collisions are unverified.
const tubeSpecs=[
 {key:'m180_00411',radius_mm:2,headWeights:[1,1,.67,.33,0,0],gantry:false,points:[[.027122181333485,-11.6106005585107,135],[.027122181333485,-11.6106005585107,168],[-.000166428718375,186.2,320.599778706421],[54.8799712795471,195,352.4],[195,102,352.4],[195.000070097487,65,352.400064896997]]},
 {key:'m180_01768',radius_mm:2.75,headWeights:[1,.5,0,0],gantry:true,points:[[20.1321951785985,16.9647773201344,184.798624602641],[47.9833,77.5,295.9672],[75.8344782032097,137.776332959104,167.757612709613],[75.8344782032058,138.035152004206,166.791686883324]]}
];

export function createMicronFlexible(nodes,records,profile){
 const plus=profile.machine_id===micronChainPins.machine,axis=new Vector3(0,0,1),keys=new Set();
 const chain=plus?micronChainPins.links.map(pin=>{
  const node=nodes.get(pin.key),row=records.get(pin.key);if(!node||!row)throw Error('Missing Micron chain link '+pin.key);keys.add(pin.key);
  const y=(row.bounds_mm[0][1]+row.bounds_mm[1][1])/2,from=point([pin.from_xz_mm[0],y,pin.from_xz_mm[1]]);
  node.traverse(n=>{if(n.isMesh)n.frustumCulled=false});
  return {pin,node,from,angle:Math.atan2(pin.to_xz_mm[1]-pin.from_xz_mm[1],pin.to_xz_mm[0]-pin.from_xz_mm[0]),origin:node.position.clone(),quaternion:node.quaternion.clone()};
 }):[];
 const tubes=plus?tubeSpecs.map(spec=>{
  const node=nodes.get(spec.key);if(!node)throw Error('Missing Micron tube '+spec.key);keys.add(spec.key);const meshes=[];
  node.traverse(n=>{if(n.isMesh){n.frustumCulled=false;meshes.push({node:n,original:n.geometry,preview:null})}});
  return {...spec,node,origin:node.position.clone(),meshes};
 }):[];
 const fixed=[...records].filter(([k,r])=>r.motion==='reference_flexible'&&r.source?.assembly_path?.includes('Bed_Assembly v9:1')&&r.name==='Wire').map(([k])=>{keys.add(k);return nodes.get(k)});
 let lastZ,route,lastDelta='',tubeState=[];
 function update(delta,visible){
  const z=delta[2],active=Boolean(visible);
  if(chain.length&&z!==lastZ){
   const pins=micronChainPins;route=bedChainRoute(pins.start_xz_mm,[pins.end_xz_mm[0],pins.end_xz_mm[1]+z],chain.length,pins.pitch_mm);
   for(const[i,e]of chain.entries()){
    if(Math.abs(z)<1e-8){e.node.position.copy(e.origin);e.node.quaternion.copy(e.quaternion);continue}
    e.node.quaternion.setFromAxisAngle(axis,route.angles[i]-e.angle);const p=route.points[i];
    e.node.position.set(p[0]/1000,p[1]/1000,e.from.z).sub(e.from.clone().applyQuaternion(e.node.quaternion)).add(e.origin);
   }
   lastZ=z;
  }
  if(delta.join(',')!==lastDelta){
   tubeState=[];
   for(const t of tubes){
    const native=delta.every(d=>Math.abs(d)<1e-8)||(t.gantry&&Math.abs(delta[0])+Math.abs(delta[1])<1e-8);
    const controls=t.points.map((p,i)=>p.map((v,a)=>v+delta[a]*(a===2&&t.gantry?1:t.headWeights[i])));
    for(const e of t.meshes){
     e.preview?.dispose();e.preview=null;
     if(native)e.node.geometry=e.original;
     else{const curve=new CatmullRomCurve3(controls.map(point),false,'centripetal');e.preview=new TubeGeometry(curve,128,t.radius_mm/1000,12,false);e.preview.computeBoundingBox();e.preview.computeBoundingSphere();e.node.geometry=e.preview;}
    }
    t.node.position.copy(t.origin);if(native&&t.gantry)t.node.position.y+=z/1000;
    tubeState.push({key:t.key,endpoints_mm:[controls[0],controls.at(-1)],outer_diameter_mm:t.radius_mm*2,native_geometry:native});
   }
   lastDelta=delta.join(',');
  }else for(const t of tubes){t.node.position.copy(t.origin);if(t.gantry&&Math.abs(delta[0])+Math.abs(delta[1])<1e-8)t.node.position.y+=z/1000;}
  for(const e of chain)e.node.visible=active;for(const t of tubes)t.node.visible=active;for(const n of fixed)n.visible=active;
  return {visible:active,managed_parts:keys.size,chain:chain.length?{links:chain.length,pitch_mm:micronChainPins.pitch_mm,endpoint_error_mm:route.endpoint_error_mm}:null,tubes:tubeState};
 }
 return {keys,chain,tubes,fixed,update};
}
