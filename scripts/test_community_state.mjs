import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createHash} from 'node:crypto';
import {sourceAssemblyMachines} from '../site/viewer/source-assembly-registry.mjs';
import {communitySchema,validateAxes,nativeMotion,displayMotion,validateCommunityState} from '../site/viewer/community-state.mjs';
import {machineChoices,machineFamilies,machineVendors} from '../site/viewer/machines.js';
import {evaCommunityIndex} from '../site/viewer/eva-installations.mjs';
import {elegooMachines} from '../site/viewer/elegoo-catalog.mjs';
const axes={x:[-100,100],y:[-90,90],z:[-95,150]},profile={machine_id:'siboor_sboom_220',axes,motions:{head:['x',0,'z'],beam:[0,0,'z'],bed:[0,'y',0]},basis:[[1,0,0],[0,0,1],[0,-1,0]]};
assert.deepEqual(displayMotion(nativeMotion('head',{x:100,y:90,z:150},profile),profile),[.1,.15,0]);
assert.deepEqual(displayMotion(nativeMotion('bed',{x:100,y:90,z:150},profile),profile),[0,0,-.09]);
for(const bad of [{x:101,y:0,z:0},{x:0,y:Infinity,z:0},{x:0,z:0},{x:0,y:0,z:0,extra:1}])assert.throws(()=>validateAxes(bad,profile));
const state={schema:communitySchema,machine:profile.machine_id,axes:{x:0,y:0,z:0},palette:{base:'#24272c',accent:'#e32636',frame:'#25292c'},night:false,grid:false,references:false,camera:{position:[1,1,1],target:[0,.3,0],up:[0,1,0]}};
assert.deepEqual(validateCommunityState(JSON.parse(JSON.stringify(state)),profile),state);
for(const mutate of [s=>s.machine='another',s=>s.schema='unsupported',s=>s.axes.x=NaN,s=>s.palette.base='red',s=>s.grid=1,s=>s.camera.position=[0,.3,0],s=>s.camera.up=[0,0,0]]){const bad=structuredClone(state);mutate(bad);assert.throws(()=>validateCommunityState(bad,profile))}
const catalog=evaCommunityIndex(JSON.parse(readFileSync(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url))),JSON.parse(readFileSync(new URL('../site/EVA_INSTALLATIONS.json',import.meta.url))));
const sourceIndex=JSON.parse(readFileSync(new URL('../site/SOURCE_ASSEMBLIES.json',import.meta.url)));
assert.equal(sourceIndex.schema,'public-source-assembly-index-v1');
assert.deepEqual(sourceIndex.models.map(r=>r.id).sort(),sourceAssemblyMachines.map(r=>r.id).sort());
for(const source of sourceIndex.models){
 assert(!Object.hasOwn(catalog.machines,source.id),'Machine must use one concrete delivery transport');
 assert.match(source.model_sha256,/^[a-f0-9]{64}$/);assert.match(source.packet.sha256,/^[a-f0-9]{64}$/);
 const bytes=readFileSync(new URL('../site/viewer/'+source.packet.url,import.meta.url));
 assert.equal(bytes.length,source.packet.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),source.packet.sha256);
 const packet=JSON.parse(bytes);assert.equal(packet.model.sha256,source.model_sha256);
 assert(packet.parts.length>200);assert.equal(new Set(packet.parts.map(r=>r.key)).size,packet.parts.length);
 assert.match(packet.chunk_delivery.manifest.sha256,/^[a-f0-9]{64}$/);assert(packet.chunk_delivery.chunk_count>0);
 const choice=machineChoices.find(r=>r.id===source.id);assert(choice&&choice.page==='./community.html'&&choice.available!==false);
 assert.equal(choice.family,source.family);assert(machineFamilies[choice.family]&&machineVendors[choice.vendor]);
}
assert.deepEqual([...Object.keys(catalog.machines),...sourceIndex.models.map(r=>r.id),...elegooMachines.map(r=>r.id)].sort(),machineChoices.filter(m=>m.available!==false&&m.page==='./community.html').map(m=>m.id).sort());
for(const [id,spec] of Object.entries(catalog.machines)){
 const choice=machineChoices.find(x=>x.id===id);assert.ok(choice);assert.ok(choice.page.includes('community.html'));assert.ok(machineFamilies[choice.family]);assert.ok(machineVendors[choice.vendor]);
 assert.equal(spec.machine_id,id);assert.ok(spec.parts>200);for(const file of Object.values(spec.files)){assert.ok(file.bytes>0);assert.match(file.sha256,/^[a-f0-9]{64}$/);assert.ok(!file.path.includes('..'))}
}
console.log('Community native machine selection, motion coordinate mapping and configuration validation passed.');
const idex={...profile,machine_id:'snakeoil_xy_idex',axes:{x:[0,90],u:[0,80],y:[-130,70],z:[-70,170]},motions:{head:['x','y',0],head2:['u','y',0],beam:[0,'y',0],bed:[0,0,'z']}};
const dualPose={x:40,u:10,y:20,z:30};
assert.deepEqual(nativeMotion('head',dualPose,idex),[40,20,0]);
assert.deepEqual(nativeMotion('head2',dualPose,idex),[10,20,0]);
assert.deepEqual(validateCommunityState({...state,machine:idex.machine_id,axes:dualPose},idex).axes,dualPose);
assert.throws(()=>validateAxes({x:0,y:0,z:0},idex));
assert.throws(()=>validateAxes({...dualPose,u:81},idex));
assert.throws(()=>validateAxes({...dualPose,v:0},idex));
