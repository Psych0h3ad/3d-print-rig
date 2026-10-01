import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dimensions,resolveVariant,choicesFor,importedVariant} from '../site/viewer/configuration-model.js';
const registry=JSON.parse(await readFile(new URL('../site/MOD_REGISTRY.json',import.meta.url),'utf8'));
const catalog={gantries:[{id:'siboor_awd'},{id:'trident_r2'}],toolheads:[{id:'stealthburner'},{id:'xol'}],hotends:registry.hotends,extruders:[{id:'cw2'},{id:'sherpa_mini'},{id:'orbiter2'}],variants:[]};
for(const g of catalog.gantries)for(const t of catalog.toolheads)for(const h of registry.hotends){
 if(!h.mounts[t.id])continue;
 for(const e of registry.toolhead_extruders[t.id])catalog.variants.push({id:[g.id,t.id,h.id,e].join('__'),gantry:g.id,toolhead:t.id,hotend:h.id,extruder:e});
}
assert.equal(catalog.variants.length,36);
for(const v of catalog.variants){
 assert.equal(resolveVariant(catalog,v),v);
 for(const dimension of dimensions)for(const choice of choicesFor(catalog,v,dimension)){
  const resolved=resolveVariant(catalog,{...v,[dimension]:choice.id},dimension);
  assert.equal(resolved[dimension],choice.id);
  assert(catalog.variants.includes(resolved));
 }
 assert.equal(importedVariant(catalog,{machine:'siboor_trident_350',configuration:v.id}),v);
 assert.equal(importedVariant(catalog,{id:v.id}),v); // Previous JSON exports.
}
const uhf=catalog.variants.find(v=>v.hotend==='dragon_uhf'&&v.extruder==='orbiter2'&&v.gantry==='trident_r2');
const sb=resolveVariant(catalog,{...uhf,toolhead:'stealthburner'},'toolhead');
assert.equal(sb.gantry,'trident_r2');assert.equal(sb.extruder,'cw2');assert.notEqual(sb.hotend,'dragon_uhf');
assert(!choicesFor(catalog,sb,'hotend').some(h=>h.id==='dragon_uhf'));
assert(!choicesFor(catalog,uhf,'hotend').some(h=>h.id==='v6'));
assert.equal(resolveVariant(catalog,{...sb,hotend:'missing'},'hotend'),null);
assert.throws(()=>importedVariant(catalog,{configuration:uhf.id,machine:'siboor_v24_350'}));
assert.throws(()=>importedVariant(catalog,{configuration:'unregistered',modules:[{glb:'external'}]}));
// Test a future gantry restriction and an extruder-specific hotend together.
const restricted={...catalog,variants:catalog.variants.filter(v=>!(v.gantry==='trident_r2'&&v.hotend==='dragon_hf')&&!(v.hotend==='dragon_sf'&&v.extruder==='orbiter2'))};
const sf=restricted.variants.find(v=>v.hotend==='dragon_sf'&&v.toolhead==='xol');
assert(!choicesFor(restricted,sf,'extruder').some(e=>e.id==='orbiter2'));
assert(!choicesFor(restricted,{...sf,gantry:'trident_r2'},'hotend').some(h=>h.id==='dragon_hf'));
console.log('Configuration selection passed: 36 registered combinations, restricted mounts, dependent choices, JSON imports.');
