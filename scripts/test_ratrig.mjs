import assert from 'node:assert/strict';import fs from 'node:fs/promises';
import {createRigState} from '../site/viewer/ratrig_motion_math.mjs';
import {createRatRigGcodePreview} from '../site/viewer/ratrig_gcode_preview.mjs';
import {ratRigSchema,validateRatRigConfiguration,ratRigAxisRanges} from '../site/viewer/ratrig-ui-state.mjs';
import {machineChoices} from '../site/viewer/machines.js';
const profiles=JSON.parse(await fs.readFile(new URL('./fixtures/ratrig-profiles.json',import.meta.url))),fixtures=JSON.parse(await fs.readFile(new URL('./fixtures/ratrig-traces.json',import.meta.url)));
const close=(a,b)=>{if(typeof a==='number')assert(Math.abs(a-b)<1e-7);else if(a&&typeof a==='object'){assert.deepEqual(Object.keys(a).sort(),Object.keys(b).sort());for(const k of Object.keys(a))close(a[k],b[k])}else assert.equal(a,b)};
assert.equal(Object.keys(profiles).length,18);assert.equal(fixtures.records.length,186);
for(const f of fixtures.records){const p=profiles[f.machine_id],state=createRigState(p,{belts:[],tubes:[]});state.setPose(f.initial_pose);const trace=createRatRigGcodePreview(state,p),before=trace.snapshot();
 if(f.expected==='error_without_state_change'){assert.throws(()=>trace.execute(f.commands.join('\n')));assert.deepEqual(trace.snapshot(),before)}
 else{trace.execute(f.commands.join('\n'));close(state.getSnapshot(),f.expected_rig_state);close(trace.snapshot(),f.expected_gcode_state)}
}
for(const p of Object.values(profiles)){
 const state=createRigState(p,{belts:[],tubes:[]}),snap=state.getSnapshot(),appearance={palette:p.appearance.palette_defaults,flexible_visible:true,enclosure_visible:true};
 const data={schema:ratRigSchema,machine:p.machine_id,rig:{...snap,appearance},view:{night:false,grid:false,camera:{position:[1,1,1],target:[0,.4,0],up:[0,1,0]}}};
 assert.equal(validateRatRigConfiguration(p,data),data);assert(machineChoices.some(m=>m.id===p.machine_id&&m.stock_only));
 for(const mutate of [d=>delete d.rig.pose.z,d=>d.machine='different',d=>d.view.camera.position=d.view.camera.target,d=>d.view.night=1,d=>d.rig.appearance.palette.base='#abcd',d=>d.rig.mirror_sum_mm=NaN]){const invalid=structuredClone(data);mutate(invalid);assert.throws(()=>validateRatRigConfiguration(p,invalid));assert.deepEqual(state.getSnapshot(),snap)}
 for(const pose of [{x0:NaN},{y:Infinity},{z:p.size_mm+1},...(p.mode==='idex'?[{x0:0,x1:p.limits.safe_distance_mm-.1}]:[])]){assert.throws(()=>state.setPose(pose));assert.deepEqual(state.getSnapshot(),snap)}
 const ranges=ratRigAxisRanges(p,snap);for(const[a,[lo,hi]]of Object.entries(ranges)){assert(lo<=snap.pose[a]&&hi>=snap.pose[a])}
 if(p.mode==='idex')for(const mode of ['copy','mirror']){state.setMode(mode,{pose:{x0:0}});const s=state.getSnapshot(),r=ratRigAxisRanges(p,s);assert(r.x0[0]<=s.pose.x0&&r.x0[1]>=s.pose.x0);for(const x0 of r.x0)state.setPose({x0});assert(state.getSnapshot().pose.x1-state.getSnapshot().pose.x0>=p.limits.safe_distance_mm-1e-7)}
}
console.log('Rat Rig: 18 stock profiles, 186 executed trace regressions, distinct carriage/extruder and G-code restore semantics, atomic snapshot rejection and coupled slider bounds passed.');
