import assert from 'node:assert/strict';
import {micronTubeSpecs,micronTubeRoute,micronRoutePoint} from '../site/viewer/micron-tube-routes.mjs';

// Independent RC8 bore measurements: WWG2 fitting and split PUG clamp.
const bores={ptfe:{point:[.06480567618962851,-12.760644259241587,198.40313671738792],axis:[2.5469709119306342e-9,5.701774436593067e-12,1],top:200.20313682783052},
 umbilical:{point:[20.128361028363283,16.96485259114079,208.95770697902546],axis:[-.0001570770859019239,-.00000263432481003511,.9999999876599248],top:212.9993611207574}};
let count=0;
for(const spec of micronTubeSpecs)for(const x of [-89.6666224467,0,89.6633775533])for(const y of [-105.4013186976,0,71.4186813024])for(const z of [-27.89608999,0,137.10391001]){
 const delta=[x,y,z],route=micronTubeRoute(spec,delta),[first,last]=route.straight_sections_mm;
 const near=(a,b)=>assert(micronRoutePoint(a).distanceTo(micronRoutePoint(b))<1e-10);
 near(route.endpoints_mm[0],spec.start_mm.map((v,i)=>v+delta[i]));
 near(route.endpoints_mm[1],spec.end_mm.map((v,i)=>v+(i===2&&spec.end_motion==='z_gantry'?z:0)));
 const inlet=micronRoutePoint(bores[spec.kind].point.map((v,i)=>v+delta[i])),start=micronRoutePoint(first[0]);
 const direction=micronRoutePoint(bores[spec.kind].axis).normalize();
 assert(inlet.clone().sub(start).cross(direction).length()*1000<.00001,'tube misses its fitting bore');
 assert(first[1][2]>bores[spec.kind].top+z+5,'tube bends inside its clamp');
 assert(route.curve.curves[0].isLineCurve3,'insertion must remain straight');
 assert(route.curve.curves.at(-1).isLineCurve3,'fixed guide insertion must remain straight');
 assert(micronRoutePoint(last[1]).clone().sub(micronRoutePoint(last[0])).normalize().distanceTo(micronRoutePoint(spec.end_axis).normalize())<1e-10);
 assert(route.curve.getPoint(0).distanceTo(micronRoutePoint(route.endpoints_mm[0]))<1e-10);
 assert(route.curve.getPoint(1).distanceTo(micronRoutePoint(route.endpoints_mm[1]))<1e-10);
 for(let i=0;i<route.curve.curves.length-1;i++){
  const a=route.curve.curves[i],b=route.curve.curves[i+1];
  assert(a.getPoint(1).distanceTo(b.getPoint(0))<1e-10,'tube route gap');
  assert(a.getTangent(1).dot(b.getTangent(0))>.999999,'tube tangent jump');
 }
 for(let i=0;i<=200;i++)assert(route.curve.getPoint(i/200).toArray().every(Number.isFinite));
 assert(route.curve.getLength()>100/1000);
 count++;
}
const cable=micronTubeSpecs.find(s=>s.kind==='umbilical'),ref=micronTubeRoute(cable,[0,0,0]),zOnly=micronTubeRoute(cable,[0,0,100]);
for(let i=0;i<=200;i++)assert(zOnly.curve.getPoint(i/200).distanceTo(ref.curve.getPoint(i/200).add(micronRoutePoint([0,0,100])))<1e-9,'gantry-only motion must translate the complete cable');
assert.throws(()=>micronTubeRoute(cable,[NaN,0,0]),/Invalid/);
console.log('Micron Plus: '+count+' tube routes retain fitting axes, straight clamp sections, tangent continuity and fixed/gantry endpoints.');
