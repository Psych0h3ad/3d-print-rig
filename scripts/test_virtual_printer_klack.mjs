import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {compileVirtualPrinter,createVirtualPlayback} from '../site/viewer/virtual-printer-emulator.mjs';
import {displacementGcodeSettings} from '../site/viewer/gcode-machine-bindings.mjs';

const metadata={repository:'https://github.com/kevinakasam/KlackEnder-Probe',revision:'5e6db594cd14b856a31f86e7d1cfcc709bb6a030',coordinate_mapping:'UNVERIFIED: official firmware origin differs from native viewer displacement origin',purpose:'Rejection regression only; not an installed dock or contact registration',files:[
 {path:'Firmware/Klipper/KlackEnder.cfg',sha256:'6afebfff7280b80b87652c1dd9326e0f1d3014d3a917eae9237897d12c4faf48'},
 {path:'Firmware/Klipper/AddToPrinter.cfg',sha256:'63677c5bdc39bf858021661e92cfbffb5baf6ab8e23c5255d0abc8d4f54796df'}]};
const settings=displacementGcodeSettings({axes:{x:[-100,100],y:[-100,100],z:[0,100]}},{x:0,y:0,z:0});
const excerpt='[gcode_macro PROBE_OUT]\ngcode:\n    G90\n    G1 X245 F4000\n    G4 P300\n    G1 Z15\n    G1 X0\n';
const run=macros=>compileVirtualPrinter('PROBE_OUT',{settings,macros,sourceMetadata:metadata});
const rejected=run(excerpt);assert.equal(rejected.complete,false);assert.match(rejected.error.message,/X/);assert.equal(rejected.error.line,1);assert.equal(rejected.error.source.macro,'PROBE_OUT');assert.equal(rejected.error.source.macro_line,2);assert.deepEqual(rejected.error.source.stack,['PROBE_OUT']);assert.deepEqual(rejected.final.position,[0,0,0,0]);assert.deepEqual(rejected.source_metadata,metadata);assert.throws(()=>createVirtualPlayback(rejected),/complete/);
const bad='[gcode_macro BED_MESH_CALIBRATE] #macro with parameter passing\nrename_existing: _BED_MESH_CALIBRATE # unsupported\ngcode: # valid field comment\n    PROBE_OUT\n';
try{compileVirtualPrinter('BED_MESH_CALIBRATE',{settings,macros:bad,sourceMetadata:metadata});assert.fail('Override must reject')}catch(e){assert.match(e.message,/Unsupported macro option rename_existing \(configuration line 2\)/);assert.deepEqual(e.source_metadata,metadata);assert.equal(e.phase,'settings_or_macro_config')}
const annotated=compileVirtualPrinter('PROBE_OUT',{settings,macros:'[gcode_macro PROBE_OUT] # valid\ngcode: # body\n  # body comment\n\n  G90 # mode\n  G1 X245 F4000 # retain firmware target',sourceMetadata:metadata});
assert.equal(annotated.error.source.macro_line,4);assert.equal(annotated.error.source.configuration_line,6);assert.deepEqual(annotated.final.position,[0,0,0,0]);assert.deepEqual(annotated.source_metadata,metadata);
const report={pinned_revision:metadata.revision,metadata,coordinate_mapping_verified:false,automatic_dock_trajectory:false,range_rejection:rejected.error,accepted_prefix:rejected.events.map(e=>({kind:e.kind,text:e.text})),final:rejected.final.position,full_files:[]};
if(process.argv[2])for(const file of metadata.files){
 const bytes=fs.readFileSync(path.join(process.argv[2],file.path));assert.equal(createHash('sha256').update(bytes).digest('hex'),file.sha256);
 let diagnostic;try{compileVirtualPrinter('PROBE_OUT',{settings,macros:bytes.toString('utf8'),sourceMetadata:metadata});assert.fail('Full config must visibly reject unsupported features')}catch(e){assert.deepEqual(e.source_metadata,metadata);diagnostic=e.message}
 report.full_files.push({...file,passed:true,diagnostic});
 if(file.path.endsWith('/KlackEnder.cfg')){assert.match(diagnostic,/Unsupported macro option rename_existing \(configuration line 26\)/);const macro=bytes.toString('utf8').match(/\[gcode_macro PROBE_OUT\]\r?\n([\s\S]*?)(?=\[gcode_macro)/)[0];assert.equal(run(macro).error.source.macro_line,2)}
}
const complete=compileVirtualPrinter('G1 X1 F600',{settings,sourceMetadata:metadata}),saved=createVirtualPlayback(complete).save();
assert.deepEqual(createVirtualPlayback(complete).restore(JSON.parse(JSON.stringify(saved))).position,complete.initial);
const altered=compileVirtualPrinter('G1 X1 F600',{settings,sourceMetadata:{...metadata,revision:'different'}});assert.throws(()=>createVirtualPlayback(altered).restore(saved),/program/);
assert.deepEqual(complete.source_metadata,metadata);assert.notEqual(complete.source_metadata,metadata);
assert.throws(()=>compileVirtualPrinter('',{settings,sourceMetadata:{...metadata,coordinate_mapping:'x'.repeat(9000)}}),/8 KB/);
assert.throws(()=>compileVirtualPrinter('',{settings:{...settings,evidence:{oversized:'x'.repeat(128001)}}}),/128 KB/);
if(process.argv[3])fs.writeFileSync(process.argv[3],JSON.stringify(report,null,2)+'\n');
console.log('Pinned Klack: unsupported config, X245 range stop, macro line/stack, unchanged pose, metadata preservation and replay identity passed.');
