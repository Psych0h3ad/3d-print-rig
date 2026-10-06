import assert from 'node:assert/strict';
import fs from 'node:fs';
import {compileVirtualPrinter,createVirtualPlayback,virtualSettingsFromAdapter} from '../site/viewer/virtual-printer-emulator.mjs';
import {displacementGcodeSettings,ratRigGcodeSettings} from '../site/viewer/gcode-machine-bindings.mjs';
import {ratRigAxisRanges} from '../site/viewer/ratrig-ui-state.mjs';
import {createRigState} from '../site/viewer/ratrig_motion_math.mjs';
const instances=process.argv[2]?JSON.parse(fs.readFileSync(process.argv[2],'utf8')):[{id:'explicit-fixture',profile:{display_reference_xyz_mm:[50,50,10],display_limits_mm:{X:[1,100],Y:[0,120],Z:[0,100]}}}];
const rows=[];
for(const instance of instances){
 const pristine=JSON.stringify(instance.profile),profile=instance.profile;
 // Production initialization/clamping, with route solving outside this coordinate audit.
 const snap=instance.kind==='ratrig'?createRigState(profile,{belts:[],tubes:[]}).getSnapshot():null;
 const settings=instance.kind==='unavailable'?virtualSettingsFromAdapter({motionEnabled:false}):instance.kind==='displacement'?displacementGcodeSettings(profile,Object.fromEntries(Object.keys(profile.axes).map(a=>[a,0]))):instance.kind==='ratrig'?ratRigGcodeSettings(profile,snap,ratRigAxisRanges(profile,snap)):virtualSettingsFromAdapter({profile});
 if(settings.motion_enabled===false){
  for(const command of ['G1 X0','G92 Y0','G28','PROBE'])assert.equal(compileVirtualPrinter(command,{settings}).complete,false,instance.id+' '+command);
  const program=compileVirtualPrinter('M83\nG1 E1 F600\nG4 P100',{settings});assert.equal(program.complete,true);assert.equal(program.capabilities.rigid_xyz,false);assert.deepEqual(createVirtualPlayback(program).restore(createVirtualPlayback(program).save()).position,program.initial);
  rows.push({id:instance.id,passed:true,poses:'No XYZ binding: movement/contact rejection and logical extrusion replay',physical_fit_verified:false});continue;
 }
 const lines=['G21','G90','M83','SAVE_GCODE_STATE NAME=native'];
 for(const axis of ['X','Y','Z']){const [lo,hi]=settings.limits[axis];for(const value of [lo,hi,(lo+hi)/2,lo])lines.push('G1 '+axis+value.toFixed(8)+' F600')}
 lines.push('RESTORE_GCODE_STATE NAME=native MOVE=1 MOVE_SPEED=20');
 const result=compileVirtualPrinter(lines.join('\n'),{settings});assert.equal(result.error,null,instance.id);assert.deepEqual(result.final.position,result.initial);
 const playback=createVirtualPlayback(result);for(let i=0;i<51;i++){const sample=playback.seekTime(result.duration_s*i/50);assert(sample.position.every(Number.isFinite));const saved=JSON.parse(JSON.stringify(playback.save()));assert.deepEqual(createVirtualPlayback(result).restore(saved).position,sample.position)}
 assert.deepEqual(playback.reset().state,result.initial_state);assert.equal(JSON.stringify(instance.profile),pristine);
 if(!profile.virtual_firmware?.homing)assert.equal(compileVirtualPrinter('G28',{settings}).complete,false,instance.id);
 if(!profile.virtual_firmware?.probe)assert.equal(compileVirtualPrinter('PROBE',{settings}).complete,false,instance.id);
 for(const a of ['X','Y','Z'])assert.equal(compileVirtualPrinter('G1 '+a+(settings.limits[a][1]+1),{settings}).complete,false,instance.id+' upper bound '+a);
 if(instance.kind==='ratrig'&&profile.mode==='idex')for(const mode of ['copy','mirror']){
  const state={...snap,mode,pose:{...snap.pose,x0:profile.size_mm/4,x1:3*profile.size_mm/4}},limited=ratRigGcodeSettings(profile,state,ratRigAxisRanges(profile,state));limited.initial[0]=(limited.limits.X[0]+limited.limits.X[1])/2;
  assert.equal(compileVirtualPrinter('G1 X'+limited.limits.X[0]+'\nG1 X'+limited.limits.X[1]+'\nG1 X'+limited.limits.X[0],{settings:limited}).complete,true,instance.id+' '+mode);
 }
 rows.push({id:instance.id,passed:true,poses:'each axis min/max/mid/reversed, coordinate restore, 51 time samples and serialized cursors',physical_fit_verified:false});
}
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify({scope:'Coordinate emulator using actual release profile datums; no adapter mesh mutation, native mounting or continuous clearance',rows},null,2)+'\n');
console.log('Virtual adapter-datum replay: '+rows.length+' profiles passed; coordinate sampling only.');
