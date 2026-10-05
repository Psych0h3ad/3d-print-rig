import assert from 'node:assert/strict';
import fs from 'node:fs';
import {communityMotionEnabled,validateAxes} from '../site/viewer/community-state.mjs';
import {machineChoices,machinePage,machineOptions} from '../site/viewer/machines.js';
const row=machineChoices.find(m=>m.id==='sovol_sv08_350');
assert.equal(row.family,'sovol_sv08');assert.equal(row.vendor,'sovol');assert.equal(row.size,350);
assert.equal(machinePage(row.id),'./community.html');assert(machineOptions(row,'family').includes('sovol_sv08'));
const profile={motion_preview:false,axes:{x:[0,0],y:[0,0],z:[0,0]},motions:{}};
assert.equal(communityMotionEnabled(profile),false);validateAxes({x:0,y:0,z:0},profile);
assert.throws(()=>validateAxes({x:1,y:0,z:0},profile));
assert.equal(communityMotionEnabled({...profile,axes:{x:[0,300]},motion_preview:true}),true);
assert.equal(communityMotionEnabled({...profile,axes:{x:[0,300]}}),false);
const catalog=JSON.parse(fs.readFileSync(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url)));
assert.equal(catalog.machines[row.id].parts,719);
for(const file of Object.values(catalog.machines[row.id].files)){assert(file.path.startsWith('sv08/'));assert(file.bytes>0);assert.match(file.sha256,/^[a-f0-9]{64}$/)}
console.log('SOVOL native reference selection, disabled motion and catalog integrity passed.');
