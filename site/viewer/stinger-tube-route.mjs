import {Vector3,Curve,CurvePath,LineCurve3} from './vendor-r180/three.module.js';

// End-face centres and fitting normal from the pinned native CAD. The author's
// toolhead guide specifies a 600 mm reverse Bowden, longer than its CAD sweep.
export const stingerTubeSpec={key:'332',head:[25.6781951113354,248.919116782186,157.139192844205],fixed:[234.430918725857,343.457844277599,280.856604417942],axis:[.45553533331645113,.09121356969897562,-.8855324075396902],length:600};
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
export function stingerTubeRoute(axes,profile){
 if(!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid LH Stinger tube pose');
 const s=stingerTubeSpec,start=add(s.head,[axes.x,0,axes.z]),end=s.fixed;
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const exit=add(start,[0,0,35]),entry=add(end,s.axis,-30);
 class Arc extends Curve{
  constructor(center,radial,normal,angle){super();Object.assign(this,{center,radial,normal,angle})}
  getPoint(t,target=new Vector3()){return target.copy(this.radial).applyAxisAngle(this.normal,this.angle*t).add(this.center)}
  getLength(){return this.radial.length()*this.angle}
 }
 function make(height){
  const first=add(start,[0,0,65]),last=add(end,s.axis,-50);
  const pts=[start,first,[last[0]-60,start[1],height],[last[0],last[1],height],last,end].map(point),corners=[];
  for(let i=1;i<pts.length-1;i++){
   const before=pts[i].clone().sub(pts[i-1]),after=pts[i+1].clone().sub(pts[i]),u=before.clone().normalize(),w=after.clone().normalize();
   const angle=Math.acos(Math.max(-1,Math.min(1,u.dot(w)))),radius=.025,d=radius*Math.tan(angle/2),normal=u.clone().cross(w).normalize();
   const a=pts[i].clone().addScaledVector(u,-d),b=pts[i].clone().addScaledVector(w,d),center=a.clone().addScaledVector(normal.clone().cross(u),radius);
   corners.push({a,b,d,arc:new Arc(center,a.clone().sub(center),normal,angle)});
  }
  for(let i=0;i<corners.length;i++)if(corners[i].d+(corners[i-1]?.d||0)>=pts[i+1].distanceTo(pts[i]))throw Error('LH Stinger tube bend overlap');
  const path=new CurvePath();let previous=pts[0];
  for(const c of corners){if(c.a.clone().sub(previous).dot(c.a.clone().sub(previous))<1e-10)throw Error('LH Stinger tube bend overlap');path.add(new LineCurve3(previous,c.a));path.add(c.arc);previous=c.b}
  path.add(new LineCurve3(previous,pts.at(-1)));return path;
 }
 let lo=380,hi=1000;
 if(make(lo).getLength()*1000>s.length)throw Error('LH Stinger tube service length is insufficient');
 for(let i=0;i<25;i++){const mid=(lo+hi)/2;if(make(mid).getLength()*1000<s.length)lo=mid;else hi=mid}
 const curve=make((lo+hi)/2);
 return {curve,endpoints_mm:[start,end],straight_sections_mm:[[start,exit],[entry,end]],radius_mm:2,length_mm:curve.getLength()*1000};
}
