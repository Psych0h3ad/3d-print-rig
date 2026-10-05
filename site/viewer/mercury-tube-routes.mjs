import {Vector3,CurvePath,LineCurve3,CubicBezierCurve3} from './vendor-r180/three.module.js';

// Native annular end-face centres/normals, not the edge of the tube wall.
// Length comes from the author's OD4/ID2 swept tube volume.
export const mercuryTubeSpecs={
 mercury_one1_235:{key:'00433',head:[-5.348378240498164,-15.45527286232922,543.8354321075243],fixed:[260.999999999997,202.20000000000357,375.000000000004],axis:[0,-1,0],length:7908.150474822358/(3*Math.PI)},
 mercury_one1_370:{key:'00510',head:[2.3467468596181,-18.1600000000025,653.751746106185],fixed:[324.999999999996,279.700000000004,505.00000000000597],axis:[-.05941981705966123,-.9979759125749864,-.02265752106298471],length:9381.273663266998/(3*Math.PI)}
};
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
export const mercuryPoint=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
export function mercuryTubeRoute(id,axes){
 const spec=mercuryTubeSpecs[id];if(!spec||!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Mercury tube pose');
 const start=add(spec.head,[axes.x,axes.y,0]),end=[...spec.fixed];
 const exit=add(start,[0,0,35]),entry=add(end,spec.axis,-30);
 function make(height){
  const high=[entry[0],entry[1],exit[2]+height],curve=new CurvePath();
  const line=(a,b)=>curve.add(new LineCurve3(mercuryPoint(a),mercuryPoint(b)));
  const cubic=(...points)=>curve.add(new CubicBezierCurve3(...points.map(mercuryPoint)));
  line(start,exit);
  // All moving-to-fixed crossing lies above the head and frame. The descent
  // stays outside the right extrusion; the last 30 mm is coaxial and fixed.
  cubic(exit,add(exit,[0,0,65]),add(high,[-45,0,0]),high);
  cubic(high,add(high,[45,0,0]),add(entry,spec.axis,-45),entry);
  line(entry,end);return curve;
 }
 let lo=0,hi=1000;const target=spec.length/1000;
 if(make(lo).getLength()>target)throw Error('Mercury tube service length is insufficient: '+id+' '+JSON.stringify(axes)+' '+make(lo).getLength()*1000+' > '+spec.length);
 for(let i=0;i<25;i++){const mid=(lo+hi)/2;if(make(mid).getLength()<target)lo=mid;else hi=mid}
 const curve=make((lo+hi)/2);
 return {curve,endpoints_mm:[start,end],straight_sections_mm:[[start,exit],[entry,end]],radius_mm:2,length_mm:curve.getLength()*1000};
}
