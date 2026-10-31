import {Vector3,TubeGeometry} from './vendor/three.module.js';
import {bedChainRoute} from './bed-chain.mjs?v=5c6ddd46ac13e6974c73';
import {micronChainPins} from './micron-flexible-pins.mjs?v=motion-colors-41';
import {micronTubeSpecs,micronTubeRoute} from './micron-tube-routes.mjs?v=42301291ca24b3c155be';
import {validateMicronTubeBindings,micronNativeTubeEndpoints} from './micron-tube-bindings.mjs?v=a7589691b354aaef29d3';

const point=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
// Nominal bore datums follow checked source owners. Straight preview sections
// are not measured insertion or holding lengths.
// Moving free loops remain routing previews: service length/clearance unverified.
// At source reset retain the authored meshes, including the fixed rear passage.

export function createMicronFlexible(nodes,records,profile){
 const plus=profile.machine_id===micronChainPins.machine,axis=new Vector3(0,0,1),keys=new Set();
 // Validate every route before cloning materials or mutating any source leaf.
 if(plus)validateMicronTubeBindings(nodes,records,micronTubeSpecs);
 const chain=plus?micronChainPins.links.map(pin=>{
  const node=nodes.get(pin.key),row=records.get(pin.key);if(!node||!row)throw Error('Missing Micron chain link '+pin.key);keys.add(pin.key);
  const y=(row.bounds_mm[0][1]+row.bounds_mm[1][1])/2,from=point([pin.from_xz_mm[0],y,pin.from_xz_mm[1]]);
  node.traverse(n=>{if(n.isMesh)n.frustumCulled=false});
  return {pin,node,from,angle:Math.atan2(pin.to_xz_mm[1]-pin.from_xz_mm[1],pin.to_xz_mm[0]-pin.from_xz_mm[0]),origin:node.position.clone(),quaternion:node.quaternion.clone()};
 }):[];
 const tubes=plus?micronTubeSpecs.map(spec=>{
  const node=nodes.get(spec.key);if(!node)throw Error('Missing Micron tube '+spec.key);keys.add(spec.key);const meshes=[];
  node.traverse(n=>{if(n.isMesh){n.frustumCulled=false;if(spec.kind==='umbilical'){n.material=Array.isArray(n.material)?n.material.map(m=>m.clone()):n.material.clone();for(const m of Array.isArray(n.material)?n.material:[n.material])m.color.set('#191b1e');}meshes.push({node:n,original:n.geometry,preview:null})}});
  return {...spec,node,origin:node.position.clone(),meshes};
 }):[];
 const fixed=[...records].filter(([k,r])=>r.motion==='reference_flexible'&&r.source?.assembly_path?.includes('Bed_Assembly v9:1')&&r.name==='Wire').map(([k])=>{keys.add(k);return nodes.get(k)});
 let lastZ,route,lastDelta='',tubeState=[];
 function update(delta,visible){
  if(delta?.length!==3||![0,1,2].every(i=>Number.isFinite(delta[i])))throw Error('Invalid Micron tube pose');
  const atReference=delta.every(v=>Math.abs(v)<1e-6),deltaKey=atReference?'native':delta.join(',');
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
  if(deltaKey!==lastDelta){
   tubeState=[];
   for(const t of tubes){
    const route=atReference?null:micronTubeRoute(t,delta);
    for(const e of t.meshes){
     e.preview?.dispose();e.preview=null;
     if(atReference)e.node.geometry=e.original;
     else{e.preview=new TubeGeometry(route.curve,192,t.radius_mm/1000,12,false);e.preview.computeBoundingBox();e.preview.computeBoundingSphere();e.node.geometry=e.preview;}
    }
    t.node.position.copy(t.origin);
    // Preview straight sections do not describe the restored source geometry.
    const nativeEndpoints=atReference?micronNativeTubeEndpoints(t.key):null;
    tubeState.push({key:t.key,endpoints_mm:route?.endpoints_mm??nativeEndpoints,
     endpoint_basis:route?'display_route':nativeEndpoints?'source_outer_cap_centers':'unmeasured_source_caps',
     routing_datums_mm:[t.start_mm.slice(),t.end_mm.slice()],
     straight_sections_mm:route?.straight_sections_mm??[],outer_diameter_mm:t.radius_mm*2,native_geometry:atReference});
   }
   lastDelta=deltaKey;
  }else for(const t of tubes)t.node.position.copy(t.origin);
  for(const e of chain)e.node.visible=active;for(const t of tubes)t.node.visible=active;for(const n of fixed)n.visible=active;
  return {visible:active,managed_parts:keys.size,chain:chain.length?{links:chain.length,pitch_mm:micronChainPins.pitch_mm,endpoint_error_mm:route.endpoint_error_mm}:null,tubes:tubeState};
 }
 return {keys,chain,tubes,fixed,update};
}
