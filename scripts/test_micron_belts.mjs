import assert from 'node:assert/strict';
import {micronBeltCircles} from '../site/viewer/micron-belts.mjs';
import {circleBeltRoute,beltGeometry} from '../site/viewer/v0-belts.mjs';
for(const index of [0,1]){
 const source=micronBeltCircles(index),baseline=circleBeltRoute(source);let maxLengthError=0;
 for(let dy=-105.41;dy<71.42;dy+=.5){
  const circles=micronBeltCircles(index,dy),route=circleBeltRoute(circles);maxLengthError=Math.max(maxLengthError,Math.abs(route.length-baseline.length));
  for(let i=0;i<circles.length;i++){assert.equal(circles[i].x,source[i].x);assert.equal(circles[i].y,source[i].y+(source[i].moving?dy:0));}
  for(const [i,span]of route.spans.entries()){
   const c=circles[i],n=circles[(i+1)%circles.length];
   assert(Math.abs(Math.hypot(span.from[0]-c.x,span.from[1]-c.y)-c.r)<1e-7);
   assert(Math.abs(Math.hypot(span.to[0]-n.x,span.to[1]-n.y)-n.r)<1e-7);
   const tangent=[span.to[0]-span.from[0],span.to[1]-span.from[1]];
   assert(Math.abs(tangent[0]*span.normal[0]+tangent[1]*span.normal[1])<1e-7);
  }
  const g=beltGeometry(route,120);g.computeBoundingBox();assert(Math.abs((g.boundingBox.max.y-g.boundingBox.min.y)*1000-6)<.001);assert([...g.attributes.position.array].every(Number.isFinite));g.dispose();
 }
 // Original RC8 pulley pairs have sub-0.1 mm source offsets; retain their datums.
 assert(maxLengthError<.02,'Native belt route length drift '+maxLengthError);
}
console.log('Micron Plus: 708 XY routes have continuous tangents, 6 mm width and constant length within native CAD tolerance.');
