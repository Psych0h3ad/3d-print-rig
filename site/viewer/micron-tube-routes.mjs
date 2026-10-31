import {Vector3,Curve,CurvePath,LineCurve3,CubicBezierCurve3} from './vendor/three.module.js';

// One smooth free span, with zero curvature at the straight fitting sections.
// The bell and its antisymmetric spread both vanish through second order at
// either end. Spread lets a compressed hose open into a broad bow instead of
// sharpening the crest of a tall, narrow arch. Only the free span changes.
export function serviceBow(point,a,b,u,v,length,shape){
 const [r0,r1,dx,dy,spread]=shape,span=b.map((n,i)=>n-a[i]);
 const horizontal=Math.hypot(span[0],span[1]);
 if(!(length>Math.hypot(...span))||horizontal<1e-6)throw Error('Insufficient service bow length or horizontal span');
 const direction=new Vector3(dx,dy,1).normalize().toArray();
 const width=Math.max(0,length*spread-horizontal*.5),side=[span[0]/horizontal,span[1]/horizontal,0];
 const base=a.map((n,i)=>{const d0=5*length*r0*u[i],d1=5*length*r1*v[i],d=span[i],w=side[i]*width;
  return [n,d0,0,10*d-6*d0-4*d1-64*w,-15*d+8*d0+7*d1+320*w,6*d-3*d0-3*d1-576*w,448*w,-128*w];});
 const lift=direction.map(n=>[0,0,0,64*n,-192*n,192*n,-64*n,0]);
 const evaluate=(row,t,derivative=0)=>{let n=0;for(let i=7;i>=derivative;i--)n=n*t+row[i]*(derivative===2?i*(i-1):derivative===1?i:1);return n;};
 const coefficients=height=>base.map((row,i)=>row.map((n,j)=>n+height*lift[i][j]));
 // Use the same bounded chord integration for the solve and Three's arc map.
 const divisions=384;
 function measure(c){let total=0,previous=a;for(let i=1;i<=divisions;i++){const p=c.map(row=>evaluate(row,i/divisions));total+=Math.hypot(...p.map((n,j)=>n-previous[j]));previous=p;}return total;}
 if(measure(base)>length)throw Error('Insufficient service bow length for fitting tangents');
 let lo=0,hi=length*2;
 if(measure(coefficients(hi))<length)throw Error('Service bow length solve is unbracketed');
 for(let i=0;i<25;i++){const mid=(lo+hi)/2;if(measure(coefficients(mid))<length)lo=mid;else hi=mid;}
 const c=coefficients((lo+hi)/2),zero=point([0,0,0]);
 const display=c[0].map((_,j)=>j?point(c.map(row=>row[j])).sub(zero):point(c.map(row=>row[j])));
 class Bow extends Curve{
  constructor(){super();this.arcLengthDivisions=divisions;}
  getPoint(t,target=new Vector3()){target.set(0,0,0);for(let i=7;i>=0;i--)target.multiplyScalar(t).add(display[i]);return target;}
  getDerivative(t,target=new Vector3()){target.set(0,0,0);for(let i=7;i>=1;i--)target.multiplyScalar(t).addScaledVector(display[i],i);return target;}
  getSecondDerivative(t,target=new Vector3()){target.set(0,0,0);for(let i=7;i>=2;i--)target.multiplyScalar(t).addScaledVector(display[i],i*(i-1));return target;}
  getTangent(t,target=new Vector3()){return this.getDerivative(t,target).normalize();}
 }
 return new Bow();
}

// RC8 native fitting bore/plane datums, in CAD millimetres. Only the display
// routing is rebuilt; the downloadable author assembly is unchanged.
export const micronTubeSpecs=[
 {key:'m180_00411',kind:'ptfe',radius_mm:2,
  start_mm:[.0648056631109313,-12.760644259270862,193.2681367173879],
  start_axis:[2.5469709119306342e-9,5.701774436593067e-12,1],start_straight_mm:27,
  end_mm:[195.00007009748734,64.9999999999971,352.40006489699687],
  end_axis:[0,-1,0],end_straight_mm:98.2,end_motion:'fixed',
  start_attachment:['m180_01415','m180_01416'],end_attachment:['m180_00340','m180_00344']},
 {key:'m180_01768',kind:'umbilical',radius_mm:2.75,
  start_mm:[20.132339122285572,16.964919307374135,183.63196420530977],
  start_axis:[-.0001570770859019239,-.00000263432481003511,.9999999876599248],start_straight_mm:35,
  end_mm:[75.83447820320578,138.035152004206,166.7916868833239],
  end_axis:[0,.2588190451029345,-.9659258262889574],end_straight_mm:25,end_motion:'z_gantry',
  start_attachment:['m180_01765','m180_01766','m180_01421'],end_attachment:['m180_01767']}
];
export const micronRoutePoint=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
export function micronTubeRoute(spec,delta){
 if(delta?.length!==3||![0,1,2].every(i=>Number.isFinite(delta[i])))throw Error('Invalid Micron tube pose');
 const start=add(spec.start_mm,delta),end=add(spec.end_mm,spec.end_motion==='fixed'?[0,0,0]:[0,0,delta[2]]);
 const exit=add(start,spec.start_axis,spec.start_straight_mm),entry=add(end,spec.end_axis,-spec.end_straight_mm);
 const curve=new CurvePath(),line=(a,b)=>curve.add(new LineCurve3(micronRoutePoint(a),micronRoutePoint(b)));
 const cubic=(a,b,c,d)=>curve.add(new CubicBezierCurve3(...[a,b,c,d].map(micronRoutePoint)));
 line(start,exit);
 if(spec.kind==='ptfe'){
  // The two fixed frame guides retain their straight native feed-throughs.
  // The free loop lifts above its moving outlet instead of folding into it.
  const shoulder=[-.000166428718375+delta[0]*.5,Math.max(186.2+delta[1]*.35,exit[1]+40),Math.max(320.599778706421+delta[2]*.5,exit[2]+45)];
  const guide=[54.8799712795471,195,end[2]],corner=[end[0]-31.8,195,end[2]],turn=[end[0],163.2,end[2]];
  cubic(exit,add(exit,spec.start_axis,55),add(shoulder,[0,-45,0]),shoulder);
  cubic(shoulder,add(shoulder,[0,35,0]),add(guide,[-35,0,0]),guide);
  line(guide,corner);
  const k=31.8*4*(Math.sqrt(2)-1)/3;
  cubic(corner,add(corner,[k,0,0]),add(turn,[0,k,0]),turn);
  line(turn,end);
 }else{
  // Nominal PUG/PG9 tangent preview; these straight spans are not certified
  // insertion, gripping or service lengths.
  const handle=Math.max(130,Math.hypot(exit[0]-entry[0],exit[1]-entry[1])*.7);
  cubic(exit,add(exit,spec.start_axis,handle),add(entry,spec.end_axis,-handle),entry);
  line(entry,end);
 }
 return {curve,endpoints_mm:[start,end],straight_sections_mm:[[start,exit],[spec.kind==='ptfe'?[end[0],163.2,end[2]]:entry,end]],start_axis:spec.start_axis,end_axis:spec.end_axis};
}
