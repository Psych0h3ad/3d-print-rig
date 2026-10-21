import {Vector3,Curve,CurvePath,LineCurve3,TubeGeometry,Mesh,MeshStandardMaterial} from './vendor-r180/three.module.js';
import {communityConfiguration} from './community-state.mjs?v=460b3fa78cc503ddb6e6';

// Centers and directions of the actual native pneumatic-joint end faces.
// Native Creality D4 tube STEP supplies OD4/ID2, but its 50 mm sample is not
// an installed hose. The viewer uses an explicit 550 mm service-length preview.
export const enderBowdenSpec={
 length_mm:550,radius_mm:2,minimum_bend_radius_mm:30,lead_bend_radius_mm:34,minimum_loop_width_mm:80,
 head_key:'00131',head:[6.112061443398004,211.388931744161,63.6999999999979],
 stock_key:'00090',stock:[-84.17249999999962,241.91036372880058,-30.29700000000281],
 belted_key:'belted_565',belted:[-85.06495622543252,229.247694852173,-28.323526418304]
};
const add=(a,b)=>a.map((v,i)=>v+b[i]);
// A round crown keeps the same bend radius when the service loop gets taller.
// Raising a narrow Bezier loop instead would pinch its crown into a hairpin.
class ServiceLoopCrown extends Curve{
 constructor(center,radial,up,angle=Math.PI){super();this.center=center;this.radial=radial;this.up=up;this.angle=angle;}
 getPoint(t,target=new Vector3()){return target.copy(this.center).addScaledVector(this.radial,Math.cos(this.angle*t)).addScaledVector(this.up,Math.sin(this.angle*t));}
 getTangent(t,target=new Vector3()){return target.copy(this.radial).multiplyScalar(-Math.sin(this.angle*t)).addScaledVector(this.up,Math.cos(this.angle*t)).normalize();}
 getLength(){return this.angle*this.radial.length();}
}
class ReversedBend extends Curve{
 constructor(curve){super();this.curve=curve;}
 getPoint(t,target=new Vector3()){return this.curve.getPoint(1-t,target);}
 getTangent(t,target=new Vector3()){return this.curve.getTangent(1-t,target).negate();}
 getLength(){return this.curve.getLength();}
}
function usesBowden(configuration){
 const mode=configuration.filament_path??'bowden';
 if(!['bowden','direct'].includes(mode))throw Error('Unknown Ender-3 filament path');
 return mode==='bowden';
}
export function enderBowdenRoute(axes,profile,configuration='stock'){
 if(profile.machine_id!=='ender3_stock_220'||!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
 const c=communityConfiguration(profile,configuration),belted=c.selection?.z==='belted',s=enderBowdenSpec;
 // A direct-drive installation replaces this stock extruder-to-hotend route.
 // Its own inlet/short liner belongs to the installed source assembly.
 if(!usesBowden(c))return null;
 const head=add(add(s.head,[axes.x,axes.z,0]),c.rest_offsets_mm?.[s.head_key]||[0,0,0]);
 const extruder=add(add(belted?s.belted:s.stock,[0,axes.z,0]),c.rest_offsets_mm?.[belted?s.belted_key:s.stock_key]||[0,0,0]);
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const bend=s.lead_bend_radius_mm,entry=add(head,[0,55,0]),exit=add(extruder,[8,0,0]);
 // Cross the frame at a fixed interior X, then rise in front of it. The return
 // enters the real tube opening vertically above HYDRA's plate and fasteners.
 const corner=add(exit,[bend,0,bend]),rise=add(corner,[0,bend,bend]);
 const arc=(center,radial,up,angle)=>new ServiceLoopCrown(point(center),point(add(center,radial)).sub(point(center)),point(add(center,up)).sub(point(center)),angle);
 const leadA=arc(add(exit,[0,0,bend]),[0,0,-bend],[bend,0,0],Math.PI/2);
 const leadB=arc(add(corner,[0,bend,0]),[0,-bend,0],[0,0,bend],Math.PI/2);
 // Splay the two upright legs in X with equal-radius S bends. This leaves the
 // depth of both legs clear of the frame, and prevents a hairpin when the head
 // is directly over the extruder. No short Bezier handles or sharp corners.
 const dz=entry[2]-rise[2],requiredX=Math.sqrt(Math.max(0,s.minimum_loop_width_mm**2-dz**2));
 const splay=Math.max(0,(requiredX-(entry[0]-rise[0]))/2);
 if(splay>4*bend)throw Error('Ender-3 tube leg separation is insufficient');
 const angle=Math.acos(1-splay/(2*bend)),height=2*bend*Math.sin(angle);
 function dogleg(start,sign){
  if(angle<1e-10)return {end:start,curves:[]};
  const center=add(start,[sign*bend,0,0]);
  const first=arc(center,[-sign*bend,0,0],[0,bend,0],angle);
  const joint=add(start,[sign*bend*(1-Math.cos(angle)),bend*Math.sin(angle),0]);
  const secondCenter=add(joint,[-sign*bend*Math.cos(angle),bend*Math.sin(angle),0]);
  const second=arc(secondCenter,[sign*bend*Math.cos(angle),-bend*Math.sin(angle),0],[sign*bend*Math.sin(angle),bend*Math.cos(angle),0],angle);
  return {end:add(start,[sign*splay,height,0]),curves:[first,second]};
 }
 const outward=dogleg(rise,-1),returning=dogleg(entry,1);
 const radius=Math.hypot(returning.end[0]-outward.end[0],dz)/2;
 const leadLength=8+Math.PI*bend+4*bend*angle;
 const crownY=(s.length_mm-leadLength-55-Math.PI*radius+outward.end[1]+returning.end[1])/2;
 if(crownY<Math.max(outward.end[1],returning.end[1]))throw Error('Ender-3 tube service length is insufficient');
 const topA=[outward.end[0],crownY,outward.end[2]],topB=[returning.end[0],crownY,returning.end[2]];
 const center=topA.map((v,i)=>(v+topB[i])/2),radial=point(topA).sub(point(center));
 const up=new Vector3(...profile.basis.map(row=>row[1]*radius/1000));
 const curve=new CurvePath();
 curve.add(new LineCurve3(point(extruder),point(exit)));curve.add(leadA);curve.add(leadB);
 for(const c of outward.curves)curve.add(c);
 curve.add(new LineCurve3(point(outward.end),point(topA)));
 curve.add(new ServiceLoopCrown(point(center),radial,up));
 curve.add(new LineCurve3(point(topB),point(returning.end)));
 for(const c of returning.curves.slice().reverse())curve.add(new ReversedBend(c));
 curve.add(new LineCurve3(point(entry),point(head)));
 return {curve,endpoints_mm:[extruder,head],straight_sections_mm:[[extruder,exit],[entry,head]],radius_mm:s.radius_mm,length_mm:curve.getLength()*1000,service_length_mm:s.length_mm,minimum_bend_radius_mm:s.minimum_bend_radius_mm};
}
export function createEnderBowden(root,profile){
 if(profile.machine_id!=='ender3_stock_220')return {update(){},meshes:[]};
 const material=new MeshStandardMaterial({color:'#e3e5e2',roughness:.65,metalness:0}),mesh=new Mesh(undefined,material);
 mesh.name='Ender3_native_profile_Bowden_route';mesh.frustumCulled=false;mesh.userData.routing_preview=true;
 root.add(mesh);
 let shapeKey=null,route;
 function update(axes,configuration){
  if(!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Ender-3 tube pose');
  if(!usesBowden(communityConfiguration(profile,configuration))){
   mesh.visible=false;delete mesh.userData.endpoints_mm;delete mesh.userData.length_mm;return;
  }
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
  mesh.visible=true;
 }
 return {update,meshes:[mesh]};
}
