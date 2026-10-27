import assert from 'node:assert/strict';
import fs from 'node:fs';
import {V24_PTFE_SPEC,v24PtfeRoute} from '../site/viewer/v24-ptfe.mjs';
import {auditFlexRoute} from './flex-route-quality.mjs';
const fixture=JSON.parse(fs.readFileSync(new URL('./fixtures/v24-1000-ptfe-spec.json',import.meta.url)));
for(const spec of [V24_PTFE_SPEC,fixture.spec]){
 const size=spec.preview_display_limits_mm.X[1],height=spec.preview_display_limits_mm.Z[1],poses=[];
 for(const x of [0,size/2,size])for(const y of [0,size/2,size])for(const z of [0,height/2,height])poses.push([x,y,z]);
 const reference=v24PtfeRoute(spec,spec.reference_xyz_mm),service=reference.service_length_mm;
 for(const xyz of [...poses,...poses.toReversed(),spec.reference_xyz_mm]){
  const r=v24PtfeRoute(spec,xyz);
  assert.equal(r.service_length_mm,service);assert(Math.abs(r.total_length_mm-service)<1e-7);
  assert.equal(r.length_mode,'constant_service_length_preview');
  assert.equal(r.minimum_design_radius_mm,20);assert.equal(r.segments.find(s=>s.id==='head_toward_rear_inlet').minimum_design_radius_mm,20);
  assert(r.stem_mm[2]-(xyz[2]-spec.reference_xyz_mm[2])>215.2946171,'Turn only after the source CW2 body');
  assert.deepEqual(r.pointAt(0),r.start_mm);assert.deepEqual(r.pointAt(1),spec.holder_right_mm);
  for(let i=0;i<r.segments.length-1;i++){
   const a=r.segments[i],b=r.segments[i+1];assert(Math.hypot(...a.end.map((v,j)=>v-b.start[j]))<1e-8);
   const u=a.derivative(1),v=b.derivative(0);assert(u.reduce((n,t,j)=>n+t*v[j],0)/Math.hypot(...u)/Math.hypot(...v)>1-1e-10);
  }
  // The former rear-corner cubic reached radius 7.4/3.7 mm. Check the free
  // span's spatial curvature, including simultaneous yaw and elevation.
  for(const segment of r.segments)for(let i=0;i<=64;i++){
   const p=segment.point(i/64);assert(p.every(Number.isFinite));
   if(segment.curvature)assert(1/segment.curvature(i/64)>=25-1e-8);
   if(segment.id==='moving_rear_approach'){
    assert(p[1]+spec.radius_mm<r.rear_panel_inside_y_mm);assert(p[2]+spec.radius_mm<spec.roof.bottom_z_mm);
   }
  }
 }
 // Independent adaptive point/tangent and non-adjacent self-contact checker;
 // selected poses, not a continuous whole-machine clearance certificate.
 for(const xyz of [[0,size,0],[size,size,height],[size/2,size/2,height/2]]){
  const r=v24PtfeRoute(spec,xyz),audit=auditFlexRoute({getPoint:t=>r.pointAt(t),getTangent:t=>r.tangentAt(t)},
   {start:{positionMm:r.start_mm,axis:[0,0,1]},end:{positionMm:spec.holder_right_mm,axis:[1,0,0]},minBendRadiusMm:20,tubeRadiusMm:2,chordToleranceMm:.03,maxSegmentLengthMm:8,maxSamples:16385,maxPairTests:10000000,breakpoints:r.cumulative_mm.slice(1,-1).map(v=>v/r.total_length_mm)});
  assert(audit.ok,JSON.stringify({machine:spec.machine_id,xyz,findings:audit.findings,metrics:audit.metrics,sampling:audit.sampling}));
 }
 assert.deepEqual(v24PtfeRoute(spec,spec.reference_xyz_mm).pointAt(.37),reference.pointAt(.37));
}
console.log('V24 500/1000: fixed service length, rear-directed tangent, reversed XYZ, design bends, roof/panel envelope and selected adaptive self-contact checks passed.');
