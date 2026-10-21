import assert from 'node:assert/strict';
import {machineChoices} from '../site/viewer/machines.js';
import {layoutMachineRecipes} from '../site/viewer/layout-machine-recipes.mjs';
import {createLayoutMachineLoader} from '../site/viewer/layout-machine-loader-core.mjs';
const ids=machineChoices.filter(row=>row.available!==false).map(row=>row.id);
const options={recipes:layoutMachineRecipes,expectedMachineIds:ids,loadRecipe:async()=>{},normalize:()=>{}};
assert.doesNotThrow(()=>createLayoutMachineLoader(options));
for(const recipes of [layoutMachineRecipes.slice(1),[...layoutMachineRecipes,layoutMachineRecipes[0]],layoutMachineRecipes.map((row,i)=>i?row:{...row,machine_id:'unregistered-machine'})])
 assert.throws(()=>createLayoutMachineLoader({...options,recipes}),/every available machine/);
assert.throws(()=>createLayoutMachineLoader({...options,expectedMachineIds:[...ids,ids[0]]}),/every available machine/);
assert.throws(()=>createLayoutMachineLoader({...options,expectedMachineIds:[]}),/every available machine/);
const load=createLayoutMachineLoader(options);
await assert.rejects(load('unknown-machine'),{code:'LAYOUT_UNKNOWN_MACHINE'});
console.log(JSON.stringify({passed:true,registeredMachines:ids.length,negativeCases:6,scope:'Exact selector/recipe identity and unknown-machine rejection; actual-model rendering is separate.'}));
