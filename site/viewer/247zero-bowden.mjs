import {Vector3,CurvePath,LineCurve3,CubicBezierCurve3,TubeGeometry,Mesh,MeshStandardMaterial} from './vendor-r180/three.module.js';
import {validateAxes} from './community-state.mjs?v=460b3fa78cc503ddb6e6';

// The source omits the installed tube. This is an explicit routing preview,
// using the native Ø4 bores and axes; its chosen length is not a BOM dimension.
export function zeroBowdenRoute(axes,profile){
 if(profile.machine_id!=='247zero_beta2_120'||!profile.bowden_preview)throw Error('Unregistered 247zero tube');
 validateAxes(axes,profile);const spec=profile.bowden_preview;
 const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s),head=add(spec.head_mm,[axes.x,axes.y,0]),fixed=[...spec.fixed_mm];
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((s,n,i)=>s+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const exit=add(head,spec.head_axis,45),entry=add(fixed,spec.fixed_axis,110);
 function make(lift){
  const apex=[(exit[0]+entry[0])/2,(exit[1]+entry[1])/2,Math.max(exit[2],entry[2])+lift],path=new CurvePath();
  path.add(new LineCurve3(point(head),point(exit)));
  path.add(new CubicBezierCurve3(point(exit),point(add(exit,spec.head_axis,35)),point(add(apex,[0,-25,0])),point(apex)));
  path.add(new CubicBezierCurve3(point(apex),point(add(apex,[0,25,0])),point(add(entry,spec.fixed_axis,35)),point(entry)));
  path.add(new LineCurve3(point(entry),point(fixed)));return path;
 }
 let lo=25,hi=500;const target=spec.display_length_mm/1000;
 if(make(lo).getLength()>target)throw Error('247zero display route is too short');
 for(let i=0;i<26;i++){const mid=(lo+hi)/2;if(make(mid).getLength()<target)lo=mid;else hi=mid}
 const curve=make((lo+hi)/2);
 return {curve,endpoints_mm:[head,fixed],straight_sections_mm:[[head,exit],[entry,fixed]],radius_mm:spec.radius_mm,length_mm:curve.getLength()*1000,source_length_known:false};
}
export function createZeroBowden(root,profile){
 if(profile.machine_id!=='247zero_beta2_120')return {update(){},meshes:[]};
 const mesh=new Mesh(undefined,new MeshStandardMaterial({color:'#eceee9',roughness:.7,metalness:0}));
 mesh.name='247zero_Bowden_routing_preview';mesh.frustumCulled=false;mesh.userData.routing_preview=true;root.add(mesh);
 let previous;
 function update(axes){
  const key=JSON.stringify([axes.x,axes.y]);if(key===previous)return;
  const route=zeroBowdenRoute(axes,profile);mesh.geometry?.dispose();mesh.geometry=new TubeGeometry(route.curve,160,route.radius_mm/1000,12,false);
  Object.assign(mesh.userData,{endpoints_mm:route.endpoints_mm,length_mm:route.length_mm,source_length_known:false});previous=key;
 }
 return {update,meshes:[mesh]};
}
