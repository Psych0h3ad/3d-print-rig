import {Vector3} from './vendor/three.module.js';
import {bedChainRoute} from './bed-chain.mjs?v=public-v25';
import {v0ChainPins} from './v0-chain-pins.mjs?v=v0-mounts-38';
export function createV0Chain(nodes,manifest){
 const pins=v0ChainPins[manifest.machine_id];if(!pins)throw Error('V0 native chain pins are missing');
 const entries=pins.links.map(pin=>{
  const row=manifest.parts.find(p=>p.key===pin.key),from=pin.from_xz_mm,to=pin.to_xz_mm;
  if(!row||!nodes.has(row.key))throw Error('V0 native chain link is missing');
  const node=nodes.get(row.key),y=(row.bounds_mm[0][1]+row.bounds_mm[1][1])/2;
  node.traverse(o=>{if(o.isMesh)o.frustumCulled=false});
  return {row,node,from:new Vector3(from[0]/1000,from[1]/1000,-y/1000),to:new Vector3(to[0]/1000,to[1]/1000,-y/1000),nativeAngle:Math.atan2(to[1]-from[1],to[0]-from[0]),origin:node.position.clone(),quaternion:node.quaternion.clone()};
 });
 const connector=manifest.parts.find(p=>p.name==='040-07-12 (1)'&&p.motion==='z_bed'),endNode=nodes.get(connector.key),endOrigin=endNode.position.clone(),axis=new Vector3(0,0,1);let lastDown,lastShift='',route;
 function update(down,visible,shift=[0,0,0]){
  const shiftKey=shift.join(',');
  if(down!==lastDown||shiftKey!==lastShift){
   const start=pins.links[0].from_xz_mm,end=pins.endpoint_xz_mm;route=bedChainRoute(start,[end[0]+shift[0],end[1]+shift[2]-down],11,16.7);
   for(const[i,e]of entries.entries()){
    if(Math.abs(down)<1e-8&&shift.every(v=>Math.abs(v)<1e-8)){e.node.position.copy(e.origin);e.node.quaternion.copy(e.quaternion);continue}
    e.node.quaternion.setFromAxisAngle(axis,route.angles[i]-e.nativeAngle);const p=route.points[i];
    e.node.position.set(p[0]/1000,p[1]/1000,e.from.z-shift[1]/1000).sub(e.from.clone().applyQuaternion(e.node.quaternion)).add(e.origin);
   }
   endNode.position.set(endOrigin.x+shift[0]/1000,endOrigin.y+(shift[2]-down)/1000,endOrigin.z-shift[1]/1000);
   lastDown=down;lastShift=shiftKey;
  }
  for(const e of entries)e.node.visible=Boolean(visible);
  return {visible:Boolean(visible),links:11,length_mm:183.7,endpoint_error_mm:route.endpoint_error_mm};
 }
 return {keys:new Set(entries.map(e=>e.row.key)),entries,update,getRoute:()=>route};
}
