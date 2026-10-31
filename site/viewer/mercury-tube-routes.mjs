import {Vector3,CurvePath,LineCurve3} from './vendor-r180/three.module.js';
import {serviceBow} from './micron-tube-routes.mjs?v=42301291ca24b3c155be';

// Native annular end-face centres/normals, not the edge of the tube wall.
// Length comes from the author's OD4/ID2 swept tube volume.
export const mercuryTubeSpecs={
 mercury_one1_235:{key:'00433',head:[-5.348378240498164,-15.45527286232922,543.8354321075243],fixed:[260.999999999997,202.20000000000357,375.000000000004],axis:[0,-1,0],length:7908.150474822358/(3*Math.PI)},
 mercury_one1_370:{key:'00510',head:[2.3467468596181,-18.1600000000025,653.751746106185],fixed:[324.999999999996,279.700000000004,505.00000000000597],axis:[0,-1,0],length:9381.273663266998/(3*Math.PI)}
};
const add=(a,b,s=1)=>a.map((v,i)=>v+b[i]*s);
export const mercuryPoint=([x,y,z])=>new Vector3(x/1000,z/1000,-y/1000);
export function mercuryTubeRoute(id,axes){
 const spec=mercuryTubeSpecs[id];if(!spec||!['x','y','z'].every(k=>Number.isFinite(axes[k])))throw Error('Invalid Mercury tube pose');
 const start=add(spec.head,[axes.x,axes.y,0]),end=[...spec.fixed];
 const exit=add(start,[0,0,35]),entry=add(end,spec.axis,-30);
 const curve=new CurvePath();curve.add(new LineCurve3(mercuryPoint(start),mercuryPoint(exit)));
 const shape=id.endsWith('235')?[.096,.103,-.44,1.25,.12]:[.089,.06,.79,1.76,.459];
 curve.add(serviceBow(mercuryPoint,exit,entry,[0,0,1],spec.axis,spec.length-65,shape));
 curve.add(new LineCurve3(mercuryPoint(entry),mercuryPoint(end)));
 return {curve,endpoints_mm:[start,end],straight_sections_mm:[[start,exit],[entry,end]],radius_mm:2,length_mm:curve.getLength()*1000};
}
