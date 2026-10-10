import assert from 'node:assert/strict';
import fs from 'node:fs';
import {a4tPrintedReference as spec,withA4TPrintedReference} from '../site/viewer/a4t-printed-companions.mjs';
import {configurationById,importedVariant,choicesFor,resolveVariant,headBuilderDimensions} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
const source=JSON.parse(fs.readFileSync(new URL('./fixtures/a4t-printed-reference.json',import.meta.url),'utf8'));
const catalog={variants:[source],base_assets:{},assets:{},sources:[],cooling_options:[{id:source.cooling}],dimensions:headBuilderDimensions};
const snapshot=JSON.stringify(catalog),updated=withA4TPrintedReference(catalog),v=configurationById(updated,spec.variant_id);
assert.equal(JSON.stringify(catalog),snapshot);assert.equal(updated.variants[0],source);
assert.equal(updated.variants.length,2);assert.equal(v.hotend,source.hotend);assert.equal(v.extruder,source.extruder);assert.equal(v.mount,'fixed');
assert(v.head_only&&v.hardware_assembled&&!v.registration_source&&!v.machine_head);
assert.deepEqual(headPlan(v),{base:spec.asset_id,translation:[0,0,0],hidden:new Set(),modules:[]});
assert.equal(v.fit.complete_head_native.state,'contact');assert.equal(v.fit.complete_head_native.cross_module_body_passed,false);
assert.deepEqual(v.fit.complete_head_native.body_collisions,source.fit.complete_head_native.body_collisions);
assert.equal(v.fit.complete_head_native.body_collisions[0].volume_mm3,0.8243437224838795);
assert.equal(v.fit.printed_companions.native_pair_checks,186);assert.equal(v.fit.printed_companions.whole_head_certified,false);
assert.equal(v.fit.printed_companions.PCB_harness_qualified,false);assert.equal(v.fit.complete_head_native.full_machine_travel_verified,false);
for(const selected of [source,v,source])assert.equal(importedVariant(updated,JSON.parse(JSON.stringify({configuration:selected.id}))),selected);
assert.deepEqual(choicesFor(updated,source,'cooling').map(o=>o.id).sort(),[source.cooling,'a4t_printed_led_housing'].sort());
assert.equal(resolveVariant(updated,{...source,cooling:spec.cooling_option.id},'cooling'),v);
assert.equal(resolveVariant(updated,{...v,cooling:source.cooling},'cooling'),source);
assert.equal(withA4TPrintedReference({...catalog,variants:[]}).variants.length,0);
const registry={assets:{},sources:{},machines:{six:{origin_mm:[0,0,360],belt_width_mm:6},nine:{gantries:{awd:{origin_mm:[0,0,360],belt_width_mm:9}}}}};
for(const [machine,g]of [['six',undefined],['nine','awd']]){
 assert.deepEqual(machineHeadVariants({...updated,variants:[v]},registry,machine,g),[]);
 assert.throws(()=>importedVariant({...updated,machine_id:machine,variants:[]},{machine,configuration:v.id}));
}
let rejected=0;
for(const mutate of [c=>c.variants[0].hotend='rapido2_hf',c=>c.variants[0].extruder='orbiter2',c=>c.variants[0].toolhead='xol',c=>c.variants[0].mount='stealthchanger',c=>c.variants[0].base_asset='other',c=>c.variants[0].registration_source='a4t_xol_carriage_6',c=>c.variants[0].machine_head={},c=>c.variants[0].modules.push({id:'another'}),c=>c.variants[0].head_translation_mm=[0,1,0],c=>c.variants[0].head_translation_mm=[],c=>c.variants[0].base_hidden_keys=['fan'],c=>c.variants[0].probe='cartographer',c=>c.variants[0].board='ebb36',c=>delete c.variants[0].fit.complete_head_native,c=>c.variants.push({...source,id:spec.variant_id}),c=>c.assets[spec.asset_id]={},c=>c.base_assets[spec.asset_id]={},c=>c.cooling_options.push(spec.cooling_option)]){const bad=structuredClone(catalog);mutate(bad);assert.throws(()=>withA4TPrintedReference(bad));rejected++;}
const code=fs.readFileSync(new URL('../site/viewer/head-additions.mjs',import.meta.url),'utf8');assert(code.includes('withA4TPrintedReference(withSphinxCompanionPresets(result))'));
const locales=fs.readFileSync(new URL('./build_locales.mjs',import.meta.url),'utf8');assert(locales.includes("'a4t-printed-companions.mjs'"),'New companion source must participate in cache revisions');
console.log(JSON.stringify({standalone_reference:true,negative_source_bindings:rejected,native_contacts_preserved:true,PCB_and_machine_fit_certified:false}));
