import assert from 'node:assert/strict';
import {gantryChoice,gantryAssets} from '../site/viewer/gantry-model.js';
import {choicesFor,resolveVariant,importedVariant} from '../site/viewer/configuration-model.js';
const gantries={assets:{},variants:[]};
for(const machine of ['VT','V2'])for(const build of ['printed','sheet_metal'])for(const belt_width_mm of [6,9])for(const xy_motors of [2,4]){
 const id=[machine,build,belt_width_mm,xy_motors].join('_');gantries.assets[id]={meta:id+'.json',glb:id+'.glb'};gantries.variants.push({id,machine,build,belt_width_mm,xy_motors,modules:[id]});
}
assert.equal(gantries.variants.length,16);
for(const v of gantries.variants){assert.equal(gantryChoice(gantries,v),v);assert.equal(gantryChoice(gantries,Object.fromEntries(Object.entries(v).map(([k,x])=>[k,String(x)]))),v);assert.equal(gantryAssets(gantries,v)[0].id,v.id)}
assert.throws(()=>gantryChoice(gantries,{machine:'V2',build:'printed',belt_width_mm:12,xy_motors:4}));
assert.throws(()=>gantryChoice({...gantries,assets:{}},gantries.variants[0]));
const catalog={gantries:[{id:'r2'}],toolheads:[{id:'sb'},{id:'xol'}],carriages:[{id:'standard'},{id:'lightweight'}],hotends:[{id:'revo'},{id:'v6'}],extruders:[{id:'cw2'},{id:'sherpa'}],probes:[{id:'none'},{id:'beacon'}],variants:[]};
for(const t of ['sb','xol'])for(const h of ['revo','v6'])catalog.variants.push({id:t+h,gantry:'r2',toolhead:t,carriage:'standard',hotend:h,extruder:t==='sb'?'cw2':'sherpa',probe:'beacon'});
for(const h of ['revo','v6'])catalog.variants.push({id:'trial'+h,gantry:'r2',toolhead:'sb',carriage:'lightweight',hotend:h,extruder:'cw2',probe:'none',fit:{carriage_native_body_passed:false}});
const trial=catalog.variants.at(-1);
assert.deepEqual(choicesFor(catalog,trial,'probe').map(p=>p.id),['none']);
assert.deepEqual(choicesFor(catalog,{...trial,toolhead:'xol'},'carriage').map(p=>p.id),['standard']);
assert.equal(resolveVariant(catalog,{...trial,toolhead:'xol'},'toolhead').carriage,'standard');
assert.equal(resolveVariant(catalog,{...catalog.variants[0],carriage:'lightweight'},'carriage').fit.carriage_native_body_passed,false);
assert.equal(importedVariant(catalog,{id:trial.id}),trial);
console.log('Workbench selection passed: 16 Monolith combinations, unavailable assets, independent carriage trials, compatible probe menus and saved links.');
