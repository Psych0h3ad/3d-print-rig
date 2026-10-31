import {Vector3,CurvePath,LineCurve3} from './vendor-r180/three.module.js';
import {serviceBow} from './micron-tube-routes.mjs?v=42301291ca24b3c155be';

// End-face centres and fitting normal from the pinned native CAD. The author's
// toolhead guide specifies a 600 mm reverse Bowden, longer than its CAD sweep.
export const stingerTubeSpec={key:'332',head:[25.6781951113354,248.919116782186,157.139192844205],fixed:[234.430918725857,343.457844277599,280.856604417942],axis:[.45553533331645113,.09121356969897562,-.8855324075396902],length:600};
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
export function stingerTubeRoute(axes,profile){
 if(!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid LH Stinger tube pose');
 const s=stingerTubeSpec,start=add(s.head,[axes.x,0,axes.z]),end=s.fixed;
 const point=p=>new Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(p[i]-profile.origin_mm[i]),0)/1000));
 const exit=add(start,[0,0,35]),entry=add(end,s.axis,-30);
 const curve=new CurvePath();curve.add(new LineCurve3(point(start),point(exit)));
 curve.add(serviceBow(point,exit,entry,[0,0,1],s.axis,s.length-65,[.119,.149,.84,-1.15,.431]));
 curve.add(new LineCurve3(point(entry),point(end)));
 return {curve,endpoints_mm:[start,end],straight_sections_mm:[[start,exit],[entry,end]],radius_mm:2,length_mm:curve.getLength()*1000};
}
