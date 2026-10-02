import assert from 'node:assert/strict';
import {poseDelta,partTranslation,corexyDelta,corexyInverse}from '../site/viewer/micron-adapter.mjs';
import {machineChoices,machinePage}from '../site/viewer/machines.js';
const p={display_reference_xyz_mm:[60,60,5],display_limits_mm:{X:[.24,119.57],Y:[0,120],Z:[0,95.13]},sampled_clearance_limits_mm:null};
const d=poseDelta(p,{x:100,y:30,z:85});assert.deepEqual(d,[40,-30,80]);
assert.deepEqual(corexyInverse(...Object.values(corexyDelta(d))),d.slice(0,2));
assert.deepEqual(partTranslation({motion_axes:''},d).glb_m,[0,0,-0]);
assert.deepEqual(partTranslation({motion_axes:'Z'},d).glb_m,[0,.08,-0]);
assert.deepEqual(partTranslation({motion_axes:'YZ'},d).glb_m,[0,.08,.03]);
assert.deepEqual(partTranslation({motion_axes:'XYZ'},d).glb_m,[.04,.08,.03]);
assert.throws(()=>poseDelta(p,{x:100,y:30,z:120}),/Out of range Z/);
assert.throws(()=>poseDelta(p,{x:100,y:30,z:85},{requireClearanceEnvelope:true}),/No validated clearance/);
assert.throws(()=>poseDelta(p,{x:NaN,y:30,z:85}),/Invalid/);
for(const [id,size]of [['micron_r1_120',120],['micron_plus_r1_180',180]]){const m=machineChoices.find(m=>m.id===id);assert(m);assert.equal(m.family,'micron');assert.equal(m.vendor,'pfa');assert.equal(m.size,size);assert.equal(machinePage(id),'./micron.html')}
console.log('Micron motion bounds, fixed bed, axis mapping and selected size routes passed.');
