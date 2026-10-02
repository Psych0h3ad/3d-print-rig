import assert from 'node:assert/strict';
import {compileGcode,nozzlePoint} from '../site/viewer/gcode-preview.mjs';
const options={initial:[100,100,20],limits:{X:[0,250],Y:[0,250],Z:[0,230]}};
const run=text=>compileGcode(text,options),close=(a,b)=>assert(Math.abs(a-b)<1e-9,`${a} != ${b}`);
let r=run('G21\nG90\nG1X120Y110Z25F600\nM82\nG92E0\nG91\nG1X10E2\nG1E3');assert.equal(r.error,null);assert.deepEqual(r.final.position,[130,110,25,5]);
r=run('G92X0Y0\nG1X10Y20F600\nM220S50\nG1X20');assert.deepEqual(r.final.position,[120,120,20,0]);close(r.events[2].speed_mm_s,10);close(r.final.speed,5);
r=run('G1E10\nM221S200\nG1E11');assert.equal(r.final.position[3],12);assert.equal(r.final.base[3],-10);
r=run('SAVE_GCODE_STATE NAME=a\nG91\nG1X10E3\nSET_GCODE_OFFSET Z=1 MOVE=1 MOVE_SPEED=10\nRESTORE_GCODE_STATE NAME=a MOVE=1 MOVE_SPEED=30');assert.deepEqual(r.final.position,[100,100,20,3]);assert.equal(r.final.absolute,true);assert.equal(r.final.base[3],3);assert.equal(r.events.at(-1).speed_mm_s,30);
r=run('G1X110F600\nG28\nG1X200');assert.equal(r.error.line,2);assert.equal(r.events.length,1);assert.equal(r.final.position[0],110);
for(const text of ['G1X300','G1X110F0','G1X110X120','G20','G1XNaN','G1X1Y2Z3E4F1e999','G1X1 G1X2','{% if printer %}','M104S200','SET_SERVO SERVO=tray ANGLE=90','G4P-1','G4S10','G1X100Q10','RESTORE_GCODE_STATE NAME=missing','SET_GCODE_OFFSET Z=1 Z_ADJUST=2']){r=run(text+'\nG1X200');assert(r.error,text);assert.deepEqual(r.final.position,[100,100,20,0],text);assert.equal(r.events.length,0,text)}
r=run(';comment\n\nG4P1500');assert.equal(r.duration_s,1.5);assert.equal(r.events[0].line,3);
assert.throws(()=>run('G21\n'.repeat(30001)),/30000/);assert.throws(()=>compileGcode('',{...options,initial:[-1,0,0]}));
assert.deepEqual(nozzlePoint({nozzle_tip_mm:[0,-40,80],display_reference_xyz_mm:[125,125,22]},[130,140,32]),[5,-25,90]);
assert.equal(run('G1X1').physical_machine_connected,false);
console.log('Offline coordinate preview: modal XYZE, offsets, save/restore, factors, dwell, bounds, atomic failures and unknown-command stop passed.');
