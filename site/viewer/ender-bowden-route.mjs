import {Vector3,CurvePath,LineCurve3,CubicBezierCurve3,TubeGeometry,Mesh,MeshStandardMaterial} from './vendor-r180/three.module.js';
import {communityConfiguration} from './community-state.mjs?v=460b3fa78cc503ddb6e6';

// Centers and directions of the actual native pneumatic-joint end faces.
// Native Creality D4 tube STEP supplies OD4/ID2, but its 50 mm sample is not
// an installed hose. The viewer uses an explicit 450 mm service-length preview.
export const enderBowdenSpec={
 length_mm:450,radius_mm:2,
 head_key:'00131',head:[6.112061443398004,211.388931744161,63.6999999999979],
 stock_key:'00090',stock:[-84.17249999999962,241.91036372880058,-30.29700000000281],
 belted_key:'belted_565',belted:[-85.06495622543252,229.247694852173,-28.323526418304]
};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
export function enderBowdenRoute(axes,profile,configuration='stock'){
 if(profile.machine_id!=='ender3_stock_220'||!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
 const c=communityConfiguration(profile,configuration),belted=c.selection?.z==='belted',s=enderBowdenSpec;
 const head=add(add(s.head,[axes.x,axes.z,0]),c.rest_offsets_mm?.[s.head_key]||[0,0,0]);
 const extruder=add(add(belted?s.belted:s.stock,[0,axes.z,0]),c.rest_offsets_mm?.[belted?s.belted_key:s.stock_key]||[0,0,0]);
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const exit=add(extruder,[25,0,0]),entry=add(head,[0,25,0]);
 const crossing=[exit[0]+20,exit[1],32],lift=[exit[0]+20,260+axes.z,32];
 function make(height){
  const high=[entry[0],Math.max(exit[1],entry[1])+height,entry[2]+40];
  const path=new CurvePath();
  path.add(new LineCurve3(point(extruder),point(exit)));
  // Cross the top-frame plane below its lower face, then rise in front
  // of it while still behind the HYDRA mounting plate. These two distinct
  // turns keep the moving cable clip out of the tube's swept volume.
  path.add(new CubicBezierCurve3(point(exit),point(add(exit,[20,0,0])),point(add(crossing,[0,-8,0])),point(crossing)));
  path.add(new CubicBezierCurve3(point(crossing),point(add(crossing,[0,8,0])),point(add(lift,[0,-8,0])),point(lift)));
  path.add(new CubicBezierCurve3(point(lift),point(add(lift,[0,30,0])),point(add(high,[0,-20,0])),point(high)));
  // Return along the actual hotend fitting's X coordinate, through the
  // plate's tube opening, instead of crossing the clip on its right side.
  path.add(new CubicBezierCurve3(point(high),point(add(high,[0,20,0])),point(add(entry,[0,40,0])),point(entry)));
  path.add(new LineCurve3(point(entry),point(head)));return path;
 }
 let lo=lift[1]-Math.max(exit[1],entry[1])+20,hi=1000;const target=s.length_mm/1000;
 if(make(lo).getLength()>target)throw Error('Ender-3 tube service length is insufficient');
 for(let i=0;i<27;i++){const mid=(lo+hi)/2;if(make(mid).getLength()<target)lo=mid;else hi=mid}
 const curve=make((lo+hi)/2);
 return {curve,endpoints_mm:[extruder,head],straight_sections_mm:[[extruder,exit],[entry,head]],radius_mm:s.radius_mm,length_mm:curve.getLength()*1000,service_length_mm:s.length_mm};
}
export function createEnderBowden(root,profile){
 if(profile.machine_id!=='ender3_stock_220')return {update(){},meshes:[]};
 const material=new MeshStandardMaterial({color:'#e3e5e2',roughness:.65,metalness:0}),mesh=new Mesh(undefined,material);
 mesh.name='Ender3_native_profile_Bowden_route';mesh.frustumCulled=false;mesh.userData.routing_preview=true;
 root.add(mesh);
 let shapeKey=null,route;
 function update(axes,configuration){
  if(!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
  const key=JSON.stringify([axes.x,configuration]);
  if(key!==shapeKey){
   route=enderBowdenRoute({...axes,z:0},profile,configuration);
   const geometry=new TubeGeometry(route.curve,192,.002,12,false);
   mesh.geometry?.dispose();mesh.geometry=geometry;shapeKey=key;
  }
  // Both real fittings ride on the Z beam. Z and bed Y changes therefore
  // translate the existing tube instead of repeatedly rebuilding its mesh.
  mesh.position.set(...profile.basis.map(row=>row[1]*axes.z/1000||0));
  mesh.userData.endpoints_mm=route.endpoints_mm.map(p=>add(p,[0,axes.z,0]));mesh.userData.length_mm=route.length_mm;
 }
 return {update,meshes:[mesh]};
}
