import assert from 'node:assert/strict';
import fs from 'node:fs';
import {hasDeclaredHeadHardware} from '../site/viewer/head-companion-presets.mjs';
import {withA4TPrintedReference,a4tPrintedReference} from '../site/viewer/a4t-printed-companions.mjs';
import {resolveVariant,headBuilderDimensions,importedVariant,choicesFor} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
const input=JSON.parse(fs.readFileSync(new URL('./fixtures/a4t-hardware-selection.json',import.meta.url)));
const base={dimensions:headBuilderDimensions,machine_id:'toolheads',variants:input.variants,base_assets:{},assets:{},sources:[],...Object.fromEntries([['cooling_options','cooling'],['hotends','hotend']].map(([key,field])=>[key,[...new Set(input.variants.map(v=>v[field]))].map(id=>({id}))]))};
const catalog=withA4TPrintedReference(base),assembled=input.variants.filter(v=>v.toolhead==='a4t');
assert.equal(assembled.length,6);
const snapshot=JSON.stringify(catalog);
for(const row of assembled){
 assert(hasDeclaredHeadHardware(row),row.id+' hardware is embedded in the native base');
 for(const field of ['toolhead','mount','extruder','hotend','cooling','base_asset'])assert(!hasDeclaredHeadHardware({...row,[field]:'different-source'}));
 for(const field of ['base','hotend','extruder','geometry_revision','state'])assert(!hasDeclaredHeadHardware({...row,fit:{...row.fit,complete_head_native:{...row.fit.complete_head_native,[field]:'unknown'}}}));
 for(const hotend of [undefined,'unknown','constructor','__proto__']){
  const native={...row.fit.complete_head_native};delete native.base;delete native.hotend;delete native.extruder;
  const missing={...row,hotend,fit:{...row.fit,complete_head_native:native}};delete missing.base_asset;
  assert(!hasDeclaredHeadHardware(missing),'Absent source identities must not match each other');
 }
 assert.deepEqual(importedVariant(catalog,JSON.parse(JSON.stringify({machine:'toolheads',configuration:row.id}))),row);
}
const from=input.variants.find(v=>v.toolhead==='stealthburner');
assert(from);
for(const board of ['none','ebb2209_stock']){
 const start={...from,board};
 const selected=resolveVariant(catalog,{...start,toolhead:'a4t'},'toolhead');
 assert.equal(selected.hotend,'chube_compact','Entering A4T must retain an existing Chube assembly');
 assert(hasDeclaredHeadHardware(selected));
 assert(choicesFor(catalog,selected,'hotend').some(o=>o.id==='rapido1_hf'));
 const before=JSON.stringify(headPlan(selected));
 const rapido=resolveVariant(catalog,{...selected,hotend:'rapido1_hf'},'hotend');
 assert.equal(rapido.hotend,'rapido1_hf');
 const restored=resolveVariant(catalog,{...rapido,hotend:'chube_compact'},'hotend');
 assert.equal(restored.id,selected.id);assert.equal(JSON.stringify(headPlan(restored)),before);
 const sb=resolveVariant(catalog,{...selected,toolhead:'stealthburner'},'toolhead');
 assert.equal(resolveVariant(catalog,{...sb,toolhead:'a4t'},'toolhead').id,selected.id);
}
assert(hasDeclaredHeadHardware(catalog.variants.find(v=>v.id===a4tPrintedReference.variant_id)));
assert(!hasDeclaredHeadHardware({...assembled[0],base_asset:'head_print_a4t',fit:{complete_head_native:{state:'reference'}}}));
assert.equal(JSON.stringify(catalog),snapshot,'Selection must not rewrite source findings or geometry');
console.log('A4T integrated hardware: six source recipes, Chube preservation, companion changes, saved IDs and negative source cases passed.');
