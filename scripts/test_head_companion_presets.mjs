import assert from 'node:assert/strict';
import fs from 'node:fs';
import {register} from 'node:module';
import {sphinxCompanionPresets,withSphinxCompanionPresets,hasDeclaredHeadHardware} from '../site/viewer/head-companion-presets.mjs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {configurationById,importedVariant,resolveVariant,headBuilderDimensions} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
register('./three-test-loader.mjs',import.meta.url);
const {assertHeadPresetAliases}=await import('./audit_loaded_heads.mjs');
const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/sphinx-companion-presets.json',import.meta.url),'utf8'));
const additions=JSON.parse(fs.readFileSync(new URL('../site/HEAD_ADDITIONS.json',import.meta.url),'utf8'));
const before=JSON.stringify(raw),catalog=withSphinxCompanionPresets(raw);
assert.equal(JSON.stringify(raw),before);assert.equal(catalog.variants.length,4);
assert.deepEqual(withSphinxCompanionPresets(catalog),catalog,'Migration is stable after A-B-A catalog reconstruction');
assert.equal(Object.keys(catalog.configuration_aliases).length,4);
assert.deepEqual(assertHeadPresetAliases(catalog,true),{registered:4,installed_ids:0,unsupported:0});
assert.throws(()=>assertHeadPresetAliases({...catalog,variants:[]},true),'Actual audit must reject missing standalone companions');
assert.throws(()=>assertHeadPresetAliases({...catalog,configuration_aliases:{}},true),'Actual audit must reject missing migration registration');
for(const p of sphinxCompanionPresets){
 const source=raw.variants.find(v=>v.id===p.to),old=raw.variants.find(v=>v.id===p.from);
 assert.equal(old.base_asset,source.base_asset);
 const target=configurationById(catalog,p.from);
 assert.equal(target,source);assert(hasDeclaredHeadHardware(target));assert(!hasDeclaredHeadHardware(old));
 assert.deepEqual(headPlan(target),headPlan(source));
 assert.deepEqual(target.fit,source.fit,'Do not convert retained source contacts or limited native scope into a new pass');
 assert.deepEqual(target.notes,source.notes);assert.equal(target.probe,'none');assert.equal(target.board,'none');
 assert.equal(importedVariant(catalog,{configuration:p.from}),source);
 assert.equal(importedVariant(catalog,JSON.parse(JSON.stringify({configuration:source.id}))),source);
 const installed={...catalog,machine_id:'voron_trident_300',variants:[{...source,id:'installed__voron_trident_300__'+source.id,source_head_configuration:source.id}]};
 assert.equal(configurationById(installed,p.from),installed.variants[0]);
 const savedInstalled='installed__voron_trident_300__'+p.from;
 assert.equal(configurationById(installed,savedInstalled),installed.variants[0]);
 assert.equal(importedVariant(installed,{machine:installed.machine_id,configuration:savedInstalled}),installed.variants[0]);
 assert.equal(configurationById(installed,'installed__other_gantry__'+p.from),undefined);
 assert.throws(()=>importedVariant(installed,{machine:installed.machine_id,configuration:'installed__other_gantry__'+p.from}));
 assert.throws(()=>importedVariant(installed,{machine:'toolheads',configuration:p.from}),/別のマシン/);
 const selectable={...raw,dimensions:headBuilderDimensions};
 const selected=resolveVariant(selectable,{...old,toolhead:'sphinx',id:'entering-family'},'toolhead');
 assert(hasDeclaredHeadHardware(selected),'Entering Sphinx prefers its declared hotend, extruder and cooling modules');
 assert.equal(resolveVariant(selectable,old,'extruder'),old,'An explicit printed-source choice remains selectable');
}
const missing='head13__sphinx__fixed__micro_bowden__dragon_ace_mze__sphinx_voron__none__source';
assert.equal(configurationById(catalog,missing),undefined,'Unknown companion requirements are not mapped to another hotend');
assert.equal(configurationById(catalog,'unknown'),undefined);assert.throws(()=>importedVariant(catalog,{configuration:'unknown'}));
assert.equal(withHeadAdditions({...structuredClone(raw),sources:[]},additions).variants.length,18,'All production consumers apply the same four preset migrations');
const p=sphinxCompanionPresets[0];let negatives=0;
for(const mutate of [
 c=>c.variants=c.variants.filter(v=>v.id!==p.to),
 c=>c.variants.find(v=>v.id===p.to).base_asset='another-source',
 c=>c.variants.find(v=>v.id===p.from).hotend='rapido2_hf',
 c=>c.variants.find(v=>v.id===p.to).extruder='orbiter2',
 c=>c.variants.find(v=>v.id===p.to).probe='beacon_revh',
 c=>c.variants.find(v=>v.id===p.to).board='ebb36',
 c=>c.variants.find(v=>v.id===p.to).modules.pop(),
 c=>c.variants.find(v=>v.id===p.to).modules[0].translation_mm[2]=1,
 c=>c.variants.find(v=>v.id===p.to).head_translation_mm=[],
 c=>c.variants.find(v=>v.id===p.to).base_hidden_keys=['nozzle'],
 c=>c.variants.find(v=>v.id===p.to).fit.complete_head_native.hotend='missing',
 c=>delete c.assets[p.modules[3]],
 c=>c.configuration_aliases={[p.from]:'wrong'},
 c=>c.variants=c.variants.filter(v=>v.id!==p.from)
]){const bad=structuredClone(raw);mutate(bad);assert.throws(()=>withSphinxCompanionPresets(bad));negatives++;}
console.log(JSON.stringify({source_presets:4,old_link_and_saved_id_migrations:4,source_placements_and_native_findings_preserved:true,rejected_changes:negatives,geometry_review:false}));
