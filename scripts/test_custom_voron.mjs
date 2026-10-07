import assert from 'node:assert/strict';
import fs from 'node:fs';
import {machineChoices} from '../site/viewer/machines.js';
import {validateCustomState} from '../site/viewer/custom-voron-state.mjs';
const catalog=JSON.parse(fs.readFileSync(new URL('../site/CUSTOM_VORON_ASSETS.json',import.meta.url)));catalog.machines=Object.fromEntries(catalog.machines.map(r=>[r.id,r]));
const sizes={voron_v24_500_custom:[500,469],voron_v24_350_half_z:[350,165],voron_trident_500_custom:[500,250],voron_trident_350_half_z:[350,125]};
assert.deepEqual(Object.keys(catalog.machines).sort(),Object.keys(sizes).sort());
for(const[id,[xy,z]]of Object.entries(sizes)){
 const choice=machineChoices.find(m=>m.id===id);assert.equal(choice.page,'./custom-voron.html');assert.equal(choice.size,xy);
 const profile={display_limits_mm:{X:[0,xy],Y:[0,xy],Z:[0,z]}};
 const state={schema:'custom-voron-1',machine_id:id,axes:[xy,xy,z],colors:{base:'#123456',accent:'#aBc123',frame:'#b9bec4'},panels:true,belts:true,grid:false};
 assert.equal(validateCustomState(state,id,profile),state);
 for(const patch of [{machine_id:'wrong'},{axes:[xy,xy,z+1]},{axes:[-1,0,0]},{axes:[0,NaN,0]},{colors:{...state.colors,frame:'silver'}},{belts:'true'}])assert.throws(()=>validateCustomState({...state,...patch},id,profile));
 for(const spec of Object.values(catalog.machines[id].files)){assert(/^[0-9a-f]{64}$/.test(spec.sha256));assert(spec.bytes>0)}
}
console.log('Four custom sizes: registration, asset identity pins, travel limits and foreign/out-of-range state rejection passed.');
