import assert from 'node:assert/strict';
import fs from 'node:fs';
import {mercuryTubeSpecs,mercuryTubeRoute} from '../site/viewer/mercury-tube-routes.mjs';
import {stingerTubeRoute} from '../site/viewer/stinger-tube-route.mjs';
import {auditFlexRoute} from './flex-route-quality.mjs';
import {joinCurvatureJump} from './flexible-route-curvature.mjs';
const profile=JSON.parse(fs.readFileSync(new URL('./fixtures/stinger-motion.json',import.meta.url)));
let count=0,minRadius=Infinity;
for(const id of [...Object.keys(mercuryTubeSpecs),'lh_stinger_200']){
 const ranges=id==='lh_stinger_200'?profile.axes:id.endsWith('235')?{x:[-100,100],y:[-100,90],z:[-200,100]}:{x:[-160,160],y:[-160,150],z:[-300,60]};
 const poses=[];for(const x of [ranges.x[0],(ranges.x[0]+ranges.x[1])/2,ranges.x[1]])for(const y of [ranges.y[0],(ranges.y[0]+ranges.y[1])/2,ranges.y[1]])for(const z of [ranges.z[0],(ranges.z[0]+ranges.z[1])/2,ranges.z[1]])poses.push({x,y,z});
 const make=p=>id==='lh_stinger_200'?stingerTubeRoute(p,profile):mercuryTubeRoute(id,p),reference=make({x:0,y:0,z:0}).curve.getPoints(32).map(p=>p.toArray());
 for(const pose of [...poses,...poses.slice().reverse(),{x:0,y:0,z:0}]){
  const {curve,length_mm}=make(pose),q=auditFlexRoute(curve,{units:'m',tubeRadiusMm:2,minBendRadiusMm:25,chordToleranceMm:.05,maxSegmentLengthMm:8,
   start:{positionMm:curve.getPoint(0).multiplyScalar(1000).toArray(),axis:curve.getTangent(0).toArray()},end:{positionMm:curve.getPoint(1).multiplyScalar(1000).toArray(),axis:curve.getTangent(1).toArray()}});
  assert(q.ok,JSON.stringify({id,pose,findings:q.findings}));assert(Math.abs(length_mm-(id==='lh_stinger_200'?600:mercuryTubeSpecs[id].length))<.02);
  assert(joinCurvatureJump(curve)<1e-6,'A free suspended span must not jump between line/arc curvature');
  assert(curve.curves[1].getSecondDerivative(0).length()<1e-8&&curve.curves[1].getSecondDerivative(1).length()<1e-8,'Free bow must meet fitting lines at zero curvature');
  minRadius=Math.min(minRadius,q.metrics.minBendRadiusMm);count++;
 }
 assert.deepEqual(make({x:0,y:0,z:0}).curve.getPoints(32).map(p=>p.toArray()),reference,'Reversed travel must restore the exact reference bow');
}
assert.deepEqual(mercuryTubeSpecs.mercury_one1_370.axis,[0,-1,0],'Fixed 51115K727 fitting axis, rather than the tilted legacy tube end face');
console.log(JSON.stringify({test:'Mercury/Stinger complete free-span shape, self-distance, length, zero-curvature joins and reversed/reset poses',poses:count,minimum_sampled_radius_mm:minRadius,native_solid_clearance:false}));
