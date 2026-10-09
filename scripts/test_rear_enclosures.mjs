import fs from 'node:fs';import assert from 'node:assert/strict';
import {nativeWitnessBundle} from './trident-deck-evidence.mjs';
import {machineChoices} from '../site/viewer/machines.js';
import {applicableMachines,requireCompleteCoverage,requiredParts,requiredLeaves,boundsOf,decodePanelAsset,sheetBoundary,compareBoundaries,compareRigidVertices,checkFloorGap,checkDownloadBinding} from './audit_rear_enclosures.mjs';
const proof=JSON.parse(fs.readFileSync(new URL('../site/REAR_ENCLOSURE_QA.json',import.meta.url))),bundle=JSON.parse(fs.readFileSync(new URL('../site/ASSET_BUNDLE.json',import.meta.url)));
assert.equal(proof.model_bundle_sha256,nativeWitnessBundle(new URL('../site/',import.meta.url),bundle,'REAR_ENCLOSURE_QA.json'));assert(proof.trident.all_passed&&proof.v24.all_passed&&proof.retention.all_passed);
assert.equal(Object.keys(proof.retention.changed_machines).length,9);assert.equal(proof.native_parts.length,18);assert(proof.retention.minimum_y_separation_mm>30);
for(const row of [...proof.trident.machines,...proof.v24.machines]){
 assert(/^[a-f0-9]{64}$/.test(row.model_sha256));
 for(const p of row.native_parts||[])assert((p.central_exhaust_interface_difference_mm3??p.native_exhaust_interface_difference_mm3)<1e-5);
 for(const hit of row.added_body_contacts||[])if(hit.kind==='retained_native_soft_seal_face_contact')assert(hit.penetration_mm<=hit.original_native_penetration_mm+1e-6&&hit.penetration_mm<.001);else assert((hit.added_body_intersection_mm3??hit.intersection_mm3??0)<.001);
}
// Every current registration participates, including all 500/1000 and OEM IDs.
const machines=applicableMachines();assert(machines.some(m=>m.id==='siboor_trident_300'));
for(const family of ['trident','v24'])for(const size of [500,1000])assert(machines.some(m=>m.family===family&&m.size===size));
const coverage=machines.map(m=>({machine_id:m.id}));requireCompleteCoverage(machineChoices,coverage);
assert.throws(()=>requireCompleteCoverage(machineChoices,coverage.slice(1)),/Missing\/unregistered/);
assert.throws(()=>requireCompleteCoverage(machineChoices,[...coverage,coverage[0]]),/Duplicate/);
assert.throws(()=>requireCompleteCoverage([...machineChoices,{id:'new_1000',family:'v24',available:true}],coverage),/Missing\/unregistered/);
for(const machine of machines){
 const leaves=requiredLeaves(machine),parts=leaves.map(leaf=>({key:machine.vendor==='siboor'&&machine.family==='trident'?leaf:machine.vendor==='fysetc'?machine.id+'_'+leaf:machine.family==='v24'?'v24_'+leaf:machine.id+'_base_'+leaf,source_leaf:leaf,motion:'fixed'}));
 assert.equal(requiredParts(machine,{parts}).length,leaves.length);
 assert.throws(()=>requiredParts(machine,{parts:parts.slice(1)}),/missing\/duplicate/);
 assert.throws(()=>requiredParts(machine,{parts:[...parts,parts[0]]}),/missing\/duplicate/);
 assert.throws(()=>requiredParts(machine,{parts:parts.map((p,i)=>i===0?{...p,motion:'z'}:p)}),/is moving/);
 // OEM numeric source IDs are not globally unique (LDO shim 01376).
 if(machine.family==='v24'&&machine.vendor!=='fysetc')assert.equal(requiredParts(machine,{parts:[...parts,{key:'ldo_cnc_01376',source_leaf:'01376',motion:'fixed'}]}).length,leaves.length);
}

// Real closed planar ring: removing its hole keeps bounds/thickness unchanged.
const vertices=[[0,0,3],[10,0,3],[10,10,3],[0,10,3],[4,4,3],[6,4,3],[6,6,3],[4,6,3]];
const triangles=[[0,1,5],[0,5,4],[1,2,6],[1,6,5],[2,3,7],[2,7,6],[3,0,4],[3,4,7]];
const ring={vertices,triangles,bounds:boundsOf(vertices)},solid={vertices:vertices.slice(0,4),triangles:[[0,1,2],[0,2,3]],bounds:boundsOf(vertices)};
const boundary=sheetBoundary(ring,2);assert.equal(boundary.length,8);assert.equal(compareBoundaries(boundary,boundary),0);
assert.throws(()=>compareBoundaries(boundary,sheetBoundary(solid,2)),/source cutout/);
const stretched=boundary.map(e=>e.map(p=>[p[0]*2,p[1],p[2]]));assert.throws(()=>compareBoundaries(boundary,stretched),/source cutout/);
assert.throws(()=>compareRigidVertices(ring,solid,[0,0,0]),/surface changed/);
assert(compareRigidVertices(ring,ring,[0,0,0])<1e-9);
const shifted={...ring,vertices:vertices.map(p=>[p[0]+1,...p.slice(1)])};assert.throws(()=>compareRigidVertices(ring,shifted,[0,0,0]),/surface changed/);

const panel={bounds:[[-184.5,-184.5,17],[184.5,184.5,20]]},frame=[
 {bounds:[[-205,-185,0],[-185,185,20]]},{bounds:[[185,-185,0],[205,185,20]]},
 {bounds:[[-185,-205,0],[185,-185,20]]},{bounds:[[-185,185,0],[185,205,20]]},
 // An internal bed support cannot be confused with the perimeter member.
 {bounds:[[-85,-185,20],[-65,185,40]]}];
assert.deepEqual(checkFloorGap(panel,frame),[.5,.5,.5,.5]);
assert.throws(()=>checkFloorGap({bounds:[[-182,-184.5,17],[184.5,184.5,20]]},frame),/gap differs/);
assert.throws(()=>checkFloorGap(panel,frame.slice(1)),/Missing measured/);
const native='a'.repeat(64),zip='b'.repeat(64),step='c'.repeat(64),entry={step_zip:{sha256:zip}},parts=[{key:'plate',native_sha256:native}],witness={zip_sha256:zip,step_sha256:step,native_readback_performed:true,parts};
assert(checkDownloadBinding(entry,parts,witness));assert.throws(()=>checkDownloadBinding(entry,parts,{...witness,zip_sha256:native}),/divergence/);
assert.throws(()=>checkDownloadBinding(entry,parts,{...witness,parts:[]}),/native binding/);
assert.throws(()=>checkDownloadBinding(entry,parts,{...witness,native_readback_performed:false}),/readback/);
assert.throws(()=>checkDownloadBinding(entry,parts,{...witness,parts:[{key:'plate',native_sha256:step}]}),/native divergence/);

// Small actual binary GLB: a parent translation must affect child placement;
// duplicate nodes, missing meshes and corrupt indices must fail closed.
function glb(nodes,indices=[0,1,2]){
 const binary=Buffer.alloc(48);[0,0,0,.01,0,0,0,.01,0].forEach((v,i)=>binary.writeFloatLE(v,i*4));indices.forEach((v,i)=>binary.writeUInt32LE(v,36+i*4));
 const data={asset:{version:'2.0'},scene:0,scenes:[{nodes:[0]}],nodes,meshes:[{primitives:[{attributes:{POSITION:0},indices:1}]}],buffers:[{byteLength:48}],bufferViews:[{buffer:0,byteOffset:0,byteLength:36},{buffer:0,byteOffset:36,byteLength:12}],accessors:[{bufferView:0,componentType:5126,count:3,type:'VEC3'},{bufferView:1,componentType:5125,count:3,type:'SCALAR'}]};
 let json=Buffer.from(JSON.stringify(data));json=Buffer.concat([json,Buffer.alloc((4-json.length%4)%4,32)]);const raw=Buffer.alloc(28+json.length+48);
 raw.writeUInt32LE(0x46546c67,0);raw.writeUInt32LE(2,4);raw.writeUInt32LE(raw.length,8);raw.writeUInt32LE(json.length,12);raw.writeUInt32LE(0x4e4f534a,16);json.copy(raw,20);raw.writeUInt32LE(48,20+json.length);raw.writeUInt32LE(0x004e4942,24+json.length);binary.copy(raw,28+json.length);return raw;
}
const nodes=[{translation:[.1,.2,.3],children:[1]},{name:'plate',mesh:0}];
const actual=decodePanelAsset(glb(nodes),new Set(['plate'])).get('plate');assert(Math.abs(actual.bounds[0][0]-100)<1e-9);assert(Math.abs(actual.bounds[0][1]+300)<1e-9);assert(Math.abs(actual.bounds[0][2]-200)<1e-9);
assert.throws(()=>decodePanelAsset(glb(nodes),new Set(['missing'])),/missing actual/);
assert.throws(()=>decodePanelAsset(glb(nodes,[0,1,99]),new Set(['plate'])));
assert.throws(()=>decodePanelAsset(glb([{children:[1,2]},{name:'plate',mesh:0},{name:'plate',mesh:0}]),new Set(['plate'])),/duplicate exported/);
console.log(`Rear/floor/deck: ${machines.length} exact registrations; missing/duplicate/moving plates, source holes, stretched contours, detached/flattened covers, frame gaps, transformed actual GLB and download divergence regressions passed. Native occupied-set, OEM contours and complete download readback remain separate gates.`);
