import {Quaternion,Vector3} from './vendor/three.module.js';

// Axis shared by the two native stock hinges, before any display transforms.
export const stockTophatPivot=[0,123,257.9524226837];
export function tophatTransform(angle,pivot=stockTophatPivot){
 if(typeof angle!=='number'||!Number.isFinite(angle)||angle<0||angle>110)throw Error('Invalid V0 tophat angle');
 if(!Array.isArray(pivot)||pivot.length!==3||pivot.some(v=>!Number.isFinite(v)))throw Error('Invalid V0 tophat datum');
 const point=new Vector3(pivot[0]/1000,pivot[2]/1000,-pivot[1]/1000),rotation=new Quaternion().setFromAxisAngle(new Vector3(1,0,0),-angle*Math.PI/180);
 return {rotation,offset:point.clone().sub(point.clone().applyQuaternion(rotation))};
}
export function createV0Tophat(nodes,manifest){
 const entries=manifest.parts.filter(p=>p.source?.assembly_path?.includes('Extrusion Tophat:1')&&!p.name.startsWith('M3x12 BHCS')).map(p=>({key:p.key,node:nodes.get(p.key),origin:nodes.get(p.key).position.clone(),quaternion:nodes.get(p.key).quaternion.clone()}));
 if(!entries.length)throw Error('V0 tophat parts are missing');let angle=0;
 function setAngle(value,pivot){const {rotation,offset}=tophatTransform(value,pivot);for(const e of entries){e.node.quaternion.copy(rotation).multiply(e.quaternion);e.node.position.copy(e.origin).applyQuaternion(rotation).add(offset)}angle=value;}
 setAngle(0);return {keys:new Set(entries.map(e=>e.key)),entries,setAngle,getAngle:()=>angle};
}
