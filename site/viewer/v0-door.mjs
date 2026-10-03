import {Quaternion,Vector3} from './vendor/three.module.js';
// Native cylindrical hinge axes, measured on the fixed upper hinge clip.
const pivots={voron_v02r1_120:[116.49999999172769,-117.50000000220402],voron_v02_120:[116.49999999172769,-117.50000000220402]};
export function createV0Door(nodes,manifest){
 const xy=pivots[manifest.machine_id];if(!xy)throw Error('V0 door datum is missing');
 const pivot=new Vector3(xy[0]/1000,0,-xy[1]/1000),axis=new Vector3(0,1,0);
 const entries=manifest.parts.filter(p=>p.source?.assembly_path?.includes('Door Assembly:1')).map(p=>{const node=nodes.get(p.key);return {key:p.key,node,origin:node.position.clone(),quaternion:node.quaternion.clone()}});
 if(!entries.length)throw Error('V0 door parts are missing');let angle=0;
 function setAngle(value){
  if(typeof value!=='number'||!Number.isFinite(value)||value<0||value>110)throw Error('Invalid V0 door angle');
  const rotation=new Quaternion().setFromAxisAngle(axis,value*Math.PI/180),offset=pivot.clone().sub(pivot.clone().applyQuaternion(rotation));
  for(const e of entries){e.node.quaternion.copy(rotation).multiply(e.quaternion);e.node.position.copy(e.origin).applyQuaternion(rotation).add(offset)}angle=value;
 }
 setAngle(0);return {keys:new Set(entries.map(e=>e.key)),entries,setAngle,getAngle:()=>angle};
}
