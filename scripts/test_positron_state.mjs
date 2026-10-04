import assert from 'node:assert/strict';
import {positronSchema,validatePositronState} from '../site/viewer/positron-state.mjs';
import {machinePage,machineChoices,machineOptions} from '../site/viewer/machines.js';
const s={schema:positronSchema,machine:'positron_v322',fold:87.5,palette:{base:'#121416',accent:'#db301f',frame:'#292929'},accessories:false,grid:true,night:true,camera:{position:[1,.5,1],target:[0,.3,0],up:[0,1,0]}};
const original=JSON.stringify(s);validatePositronState(s);assert.equal(JSON.stringify(s),original);assert.deepEqual(validatePositronState(JSON.parse(original)),s);
for(const fold of [0,100])validatePositronState({...s,fold});
for(const bad of [{machine:'voron_v24_350'},{schema:'unknown'},{fold:'10'},{fold:NaN},{fold:-1},{fold:101},{palette:{base:'red',accent:'#123456',frame:'#123456'}},{accessories:'false'},{grid:1},{night:null},{camera:{position:[0,0,0],target:[0,0,0],up:[0,1,0]}},{camera:{position:[1,0,0],target:[0,0,0],up:[0,0,0]}}])assert.throws(()=>validatePositronState({...s,...bad}));
assert.equal(machinePage(s.machine),'./positron.html');const m=machineChoices.find(m=>m.id===s.machine);assert.deepEqual([m.family,m.vendor,m.size],['positron','positron_ldo',180]);assert.deepEqual(machineOptions(m,'size'),[180]);
console.log('Positron: machine navigation, folding boundaries, JSON round trip and atomic saved-state validation passed.');
