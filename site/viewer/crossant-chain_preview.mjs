import {cadToGlb} from './crossant-belt_deform.mjs';
/** A fixed-length routing preview. Individual hinge fit is explicitly approximate. */
export function chainPath(spec,bedDz){
 if(!Number.isFinite(bedDz))throw Error('Invalid chain displacement');
 const a=[...spec.fixed_center_mm],b=[...spec.bed_center_mm];b[2]+=bedDz;
 const r=(b[0]-a[0])/2;if(r<=0)throw Error('Invalid chain lane registration');
 const top=(spec.centerline_length_mm+a[2]+b[2]-Math.PI*r)/2;
 const up=top-a[2],down=top-b[2];if(up<0||down<0)throw Error('Chain straight run exhausted');
 const curve=Math.PI*r;
 function at(s){
  if(!Number.isFinite(s)||s< -1e-8||s>spec.centerline_length_mm+1e-8)throw Error('Chain station outside route');
  s=Math.max(0,Math.min(spec.centerline_length_mm,s));
  if(s<=up)return {point:[a[0],a[1],a[2]+s],tangent:[0,0,1]};
  if(s<=up+curve){const angle=Math.PI-(s-up)/r;return {point:[(a[0]+b[0])/2+r*Math.cos(angle),a[1],top+r*Math.sin(angle)],tangent:[Math.sin(angle),0,-Math.cos(angle)]};}
  return {point:[b[0],b[1],top-(s-up-curve)],tangent:[0,0,-1]};
 }
 return {a,b,r,top,up,down,length:up+curve+down,at};
}
export function createChainPreview(root,nodes,spec,THREE){
 const original=nodes.get(spec.prototype_key),meshes=[];if(!original)throw Error('Missing chain prototype');original.traverse(o=>{if(o.isMesh)meshes.push(o)});
 if(meshes.length!==1)throw Error('Ambiguous chain prototype');
 const p=meshes[0],center=spec.prototype_center_mm,origin=cadToGlb(center),geometry=p.geometry.clone();geometry.translate(...origin.map(x=>-x));
 const group=new THREE.Group();group.name='Crossant_chain_routing_preview';group.userData={representation:'native link prototype on a fixed-length routing preview; hinge fit unverified'};root.add(group);
 const links=Array.from({length:spec.link_instances},()=>{const m=new THREE.Mesh(geometry,p.material.clone());group.add(m);return m;});
 let visible=true,last;
 function update(dz){const route=chainPath(spec,dz);links.forEach((m,i)=>{const q=route.at(route.length*i/(links.length-1));m.position.set(...cadToGlb(q.point));m.quaternion.setFromAxisAngle(new THREE.Vector3(0,0,-1),Math.atan2(q.tangent[0],q.tangent[2]));m.visible=visible;});group.visible=visible;last=route;return route;}
 function setVisible(v){visible=Boolean(v);group.visible=visible;for(const l of links)l.visible=visible;}
 update(0);return {group,links,update,setVisible,getRoute:()=>last};
}
