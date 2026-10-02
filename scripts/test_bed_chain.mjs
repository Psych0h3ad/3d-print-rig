import assert from 'node:assert/strict';
import {bedChainRoute} from '../site/viewer/bed-chain.mjs';
import {tridentChainPins} from '../site/viewer/bed-chain-pins.mjs';
for(const native of Object.values(tridentChainPins)){
 const start=native[0].from_xz_mm,end=native.at(-1).to_xz_mm;
 for(let down=-40;down<=330;down+=.5){
  const r=bedChainRoute(start,[end[0],end[1]-down]);
  assert.equal(r.points.length,21);assert.equal(r.length_mm,340);assert(r.endpoint_error_mm<1e-5);
  for(let i=1;i<r.points.length;i++)assert(Math.abs(Math.hypot(...r.points[i].map((v,j)=>v-r.points[i-1][j]))-17)<1e-10);
  assert(Math.hypot(...r.points.at(-1).map((v,j)=>v-[end[0],end[1]-down][j]))<1e-5);
  for(let i=1;i<r.angles.length;i++)assert(Math.abs(r.angles[i]-r.angles[i-1])<Math.PI/3);
 }
}
console.log('Bed chain: 1,482 routes preserve 20 rigid links, 17 mm pitch and both endpoint pivots.');
