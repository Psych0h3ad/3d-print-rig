import assert from 'node:assert/strict';
import fs from 'node:fs';
import {machineChoices,machineOptions,machinePage} from '../site/viewer/machines.js';
import {nativeMotion} from '../site/viewer/community-state.mjs';
import {stingerTubeRoute,stingerTubeSpec} from '../site/viewer/stinger-tube-route.mjs';
import * as THREE from '../site/viewer/vendor-r180/three.module.js';
import {stingerFlexWeights} from '../site/viewer/stinger-flex.mjs';
const id='lh_stinger_200',catalog=JSON.parse(fs.readFileSync(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url))),profile=JSON.parse(fs.readFileSync(new URL('./fixtures/stinger-motion.json',import.meta.url)));
assert.equal(catalog.machines[id].parts,875);
assert.equal(machinePage(id),'./community.html');
const choice=machineChoices.find(r=>r.id===id);assert.deepEqual(machineOptions(choice,'size'),[200]);
const pose={x:95,y:105,z:130};
assert.deepEqual(nativeMotion('head',pose,profile),[95,0,130]);
assert.deepEqual(nativeMotion('beam',pose,profile),[0,0,130]);
assert.deepEqual(nativeMotion('bed',pose,profile),[0,105,0]);
assert.deepEqual(nativeMotion('fixed',pose,profile),[0,0,0]);
// Pulley anchors stay in place while the belt's native clamp ends follow.
assert.deepEqual(stingerFlexWeights([-135.553216,289,103],'550'),[0,0,1]);
assert.deepEqual(stingerFlexWeights([25,289,103],'550'),[1,0,1]);
assert.deepEqual(stingerFlexWeights([203.855102,289,103],'550'),[0,0,1]);
assert.deepEqual(stingerFlexWeights([25,38.054404,-30],'708'),[0,0,0]);
assert.deepEqual(stingerFlexWeights([25,257,-20],'708'),[0,1,0]);
assert.deepEqual(stingerFlexWeights([25,476.384080,-30],'708'),[0,0,0]);
// A single source leaf contains four fixed clips and one beam-mounted clip.
assert.deepEqual(stingerFlexWeights([-83,300,110],'345'),[0,0,1]);
assert.deepEqual(stingerFlexWeights([183,360,-60],'345'),[0,0,0]);
assert.deepEqual(stingerFlexWeights([-77.4095,348.7489,-40.0479],'333'),[0,0,0]);
assert.deepEqual(stingerFlexWeights([-3.0062,259.761,122.1009],'333'),[1,0,1]);
assert.deepEqual(stingerFlexWeights([-184.5552,362.7148,-57.4836],'343'),[0,0,0]);
assert.deepEqual(stingerFlexWeights([-59.8671,405.8592,-5.8618],'343'),[0,1,0]);
console.log('LH Stinger: native gantry/bed groups, 6/9 mm belt clamp anchors, tube fittings, mixed cable clips and grouped selection passed.');
for(const x of [-95,0,95])for(const z of [profile.axes.z[0],0,130]){
 const r=stingerTubeRoute({x,y:0,z},profile);assert(Math.abs(r.length_mm-600)<.001);
 const point=a=>new THREE.Vector3(...profile.basis.map(row=>row.reduce((v,n,i)=>v+n*(a[i]-profile.origin_mm[i]),0)/1000));
 assert(r.curve.getPoint(0).distanceTo(point(r.endpoints_mm[0]))<1e-9);assert(r.curve.getPoint(1).distanceTo(point(stingerTubeSpec.fixed))<1e-9);
 for(let i=1;i<600;i++){
  const a=r.curve.getPoint((i-1)/600),b=r.curve.getPoint(i/600),c=r.curve.getPoint((i+1)/600),ab=b.clone().sub(a),bc=c.clone().sub(b),ac=c.clone().sub(a),cross=ab.clone().cross(bc).length();
  if(cross>1e-12)assert(ab.length()*bc.length()*ac.length()/2/cross>.0249);
 }
}
const d=profile.clearance_datums_mm;
assert(d.nozzle_tip_z+profile.axes.z[0]-d.bed_top_z>.12);
assert(d.lowest_bed_overlapping_part_z+profile.axes.z[0]-d.bed_top_z>=.049999);
console.log('LH Stinger: 600 mm PTFE, 25 mm bend radii and bed clearance passed.');

for(const key of ['550','708','333','338','343','345'])for(let i=0;i<100;i++)assert(stingerFlexWeights([i*5-200,i*7-50,i*5-100],key).every(v=>Number.isFinite(v)&&v>=0&&v<=1));
