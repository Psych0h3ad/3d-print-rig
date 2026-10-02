import assert from 'node:assert/strict';
import {readFile} from 'node:fs/promises';
import {dimensions,resolveVariant,choicesFor,importedVariant} from '../site/viewer/configuration-model.js';
const registry=JSON.parse(await readFile(new URL('../site/MOD_REGISTRY.json',import.meta.url),'utf8'));
const catalog={gantries:[{id:'siboor_awd'},{id:'trident_r2'}],toolheads:[{id:'stealthburner'},{id:'xol'}],hotends:registry.hotends,extruders:[...new Set(Object.values(registry.toolhead_extruders).flat())].map(id=>({id})),variants:[]};
for(const g of catalog.gantries)for(const t of catalog.toolheads)for(const h of registry.hotends){
 if(!h.mounts[t.id])continue;
 for(const e of registry.toolhead_extruders[t.id])catalog.variants.push({id:[g.id,t.id,h.id,e].join('__'),gantry:g.id,toolhead:t.id,hotend:h.id,extruder:e});
}
assert.equal(catalog.variants.length,60);
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
assert(choicesFor(restricted,sf,'extruder').some(e=>e.id==='orbiter2'));
assert.notEqual(resolveVariant(restricted,{...sf,extruder:'orbiter2'},'extruder').hotend,'dragon_sf');
assert(!choicesFor(restricted,{...sf,gantry:'trident_r2'},'hotend').some(h=>h.id==='dragon_hf'));
const vanilla={...catalog,machine_id:'voron_trident_350',gantries:catalog.gantries.filter(g=>g.id==='trident_r2'),variants:catalog.variants.filter(v=>v.gantry==='trident_r2')};
assert.equal(vanilla.variants.length,30);
assert.equal(importedVariant(vanilla,{machine:'voron_trident_350',configuration:vanilla.variants[0].id}),vanilla.variants[0]);
assert.throws(()=>importedVariant(vanilla,{machine:'siboor_trident_350',configuration:vanilla.variants[0].id}));
console.log('Configuration selection passed: 60 kit and 30 vanilla combinations, restricted mounts, dependent choices, machine-specific JSON imports.');

// Probe support belongs to a concrete head/hotend/extruder fit. A change must
// keep it when possible and return to the compatible default when necessary.
const probed={...catalog,probes:[{id:'none'},{id:'cartographer_v4'},{id:'beacon_revh'}],variants:[]};
for(const v of catalog.variants){
 probed.variants.push({...v,probe:'none'});
 if(v.toolhead==='xol')for(const probe of ['cartographer_v4','beacon_revh'])probed.variants.push({...v,id:v.id+'__'+probe,probe});
 if(v.toolhead==='stealthburner'&&v.hotend==='revo_voron'&&v.gantry==='trident_r2')probed.variants.push({...v,id:v.id+'__beacon_revh',probe:'beacon_revh'});
}
const xp=probed.variants.find(v=>v.toolhead==='xol'&&v.probe==='cartographer_v4');
assert.equal(choicesFor(probed,xp,'probe').length,3);
const hf=resolveVariant(probed,{...xp,hotend:'rapido2_hf'},'hotend');assert.equal(hf.probe,'cartographer_v4');
const sbp=resolveVariant(probed,{...xp,toolhead:'stealthburner'},'toolhead');assert.equal(sbp.probe,'none');assert.equal(sbp.extruder,'cw2');
const revoBeacon=probed.variants.find(v=>v.toolhead==='stealthburner'&&v.probe==='beacon_revh');
assert.deepEqual(choicesFor(probed,revoBeacon,'probe').map(p=>p.id),['none','beacon_revh']);
assert.equal(resolveVariant(probed,{...revoBeacon,hotend:'dragon_sf'},'hotend').probe,'none');
assert.equal(importedVariant(probed,{configuration:xp.id}),xp);
assert.equal(importedVariant(probed,{configuration:xp.id.split('__').slice(0,4).join('__')}).probe,'none');
for(const v of probed.variants)for(const dimension of dimensions)for(const choice of choicesFor(probed,v,dimension)){
 const next=resolveVariant(probed,{...v,[dimension]:choice.id},dimension);assert(probed.variants.includes(next));assert.equal(next[dimension],choice.id);
}
console.log('Probe selection passed: compatible head changes, dependent lists, legacy links and saved configuration imports.');
