import assert from 'node:assert/strict';
import {e3ngSelection,e3ngPartVisible,e3ngURL} from '../site/viewer/e3ng-model.mjs';
import {machineChoices,machinePage,machineOptions,machineFamilies,machineVendors} from '../site/viewer/machines.js';
import {workspaceKindFor} from '../site/viewer/workspace-return.mjs';
const selected=e3ngSelection();
const referenceURL=new URL(e3ngURL('https://example.test/viewer/e3ng.html?machine=e3ng_toolchanger_230&lang=en',selected));
assert(!referenceURL.searchParams.has('machine'));assert.equal(referenceURL.searchParams.get('lang'),'en');
assert.equal(machinePage('e3ng_toolchanger_230'),undefined);
assert(!machineChoices.some(m=>m.id.startsWith('e3ng_')||m.page==='./e3ng.html'));
assert(!machineOptions({},'family').includes('e3ng'));
assert(!('e3ng'in machineFamilies));assert(!('rh3d'in machineVendors));
assert.equal(workspaceKindFor('e3ng.html'),'toolchangers');
assert.equal(machinePage('e3ng_v12_230'),undefined);
for(const invalid of [{tools:0},{tools:7},{tools:NaN},{board:'ebb42_gen2'},{gantry:'voron'},{extruder:'orbiter'},{view:'printer'},{wiper:'yes'}])assert.throws(()=>e3ngSelection(invalid));
let selections=0;
for(const board of ['ebb42','ebb36'])for(const extruder of ['pin','bolt'])for(const arm of ['arm','sleeve'])for(const gantry of ['v12','beta'])for(const tools of [1,2,3,4,5,6])for(const view of ['head','assembly','dock','gantry']){
 const s=e3ngSelection({board,extruder,arm,gantry,tools,view}),visible=group=>e3ngPartVisible({group},s);
 assert.deepEqual(e3ngSelection(Object.fromEntries(new URL(e3ngURL('https://example.test/viewer/e3ng.html?lang=en',s)).searchParams)),s);
 if(['head','assembly'].includes(view)){
  assert(visible(board)&&!visible(board==='ebb42'?'ebb36':'ebb42'));
  assert(visible(extruder)&&!visible(extruder==='pin'?'bolt':'pin'));
  assert(visible(arm)&&!visible(arm==='arm'?'sleeve':'arm'));
 }else assert(!visible('head')&&!visible('tool_1'));
 if(['assembly','gantry'].includes(view))assert(visible('gantry_'+gantry)&&!visible('gantry_'+(gantry==='v12'?'beta':'v12')));
 if(['dock','assembly'].includes(view))for(let slot=1;slot<=6;slot++){assert.equal(visible('dock_'+slot),slot<=tools);if(slot>1)assert.equal(visible('tool_'+slot),slot<=tools)}
 assert(!visible('wiper')&&!visible('nudge')&&!visible('routing')&&!visible('bed_arm'));
 for(const mod of ['wiper','nudge','routing'])assert.equal(e3ngPartVisible({group:mod},{...s,[mod]:true}),view==='assembly');
 selections++;
}
assert.deepEqual(selected,e3ngSelection());
console.log(`E3NG: ${selections} component selections, independent alternatives, dock/tool counts and URL round trips; no machine registration or printer workspace.`);
