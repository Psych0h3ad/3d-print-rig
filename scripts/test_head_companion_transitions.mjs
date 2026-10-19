import assert from 'node:assert/strict';
import fs from 'node:fs';
import {configurationById,importedVariant,resolveVariant,choicesFor,headBuilderDimensions,isHeadMountReference} from '../site/viewer/configuration-model.js';
import {builderCandidates} from '../site/viewer/toolhead-builder.mjs';

const raw=JSON.parse(fs.readFileSync(new URL('../site/TOOLHEAD_CONFIGURATIONS.json',import.meta.url),'utf8'));
const catalog={...raw,dimensions:headBuilderDimensions,machine_id:'toolhead'};
const before=JSON.stringify(catalog);
const assembled=catalog.variants.filter(v=>v.toolhead==='yavoth'&&v.hardware_assembled);
const references=catalog.variants.filter(v=>v.toolhead==='yavoth'&&isHeadMountReference(v));
assert.equal(assembled.length,16,'Audit the actual registered Yavoth hardware assemblies');
assert.equal(references.length,18,'Audit the actual retained mount-only references');
let optionTransitions=0;
for(const v of assembled){
 const hotends=choicesFor(catalog,v,'hotend').map(r=>r.id);
 assert(hotends.includes('rapido1_hf')&&hotends.includes('rapido1_uhf'));
 assert(!hotends.includes('rapido2_hf')&&!hotends.includes('rapido2_uhf')&&!hotends.includes('revo_voron'),'A hotend change must not remove the assembled hardware');
 for(const hotend of ['rapido2_hf','rapido2_uhf','revo_voron'])
  assert.equal(resolveVariant(catalog,{...v,hotend},'hotend'),null);
 const other=v.hotend==='rapido1_hf'?'rapido1_uhf':'rapido1_hf';
 const switched=resolveVariant(catalog,{...v,hotend:other},'hotend');
 assert(switched&&switched.hardware_assembled);
 for(const k of ['extruder','gantry','carriage','cooling','mount'])assert.equal(switched[k],v[k]);
 assert.equal(resolveVariant(catalog,{...switched,hotend:v.hotend},'hotend').id,v.id,'A-B-A retains the source companions and offsets');
 for(const dimension of headBuilderDimensions.filter(k=>k!=='toolhead')){
  for(const row of choicesFor(catalog,v,dimension)){
   const selected=resolveVariant(catalog,{...v,[dimension]:row.id},dimension);
   assert(selected&&!isHeadMountReference(selected),v.id+' '+dimension+' '+row.id);
   assert.equal(selected[dimension],row.id);optionTransitions++;
  }
 }
}
for(const v of references){
 assert.equal(configurationById(catalog,v.id),v,'Explicit archived reference URLs remain valid');
 assert.equal(importedVariant(catalog,{configuration:v.id}),v,'Existing saved reference configurations remain valid');
 assert.equal(resolveVariant(catalog,v,'hotend'),v,'An explicit reference stays an explicit reference');
}
const results=builderCandidates(catalog,{toolhead:'yavoth'});
assert.equal(results.length,16,'Component search must not describe mount-only data as an assembled head');
assert(!builderCandidates(catalog,{toolhead:'yavoth',hotend:'rapido2_hf'}).length);
assert(builderCandidates(catalog,{toolhead:'yavoth',hotend:'rapido1_hf'}).length===8);
const original=assembled[0];
assert.equal(isHeadMountReference({...original,fit:{complete_head_native:{state:'collision'}}}),false,'Hardware presence is independent of physical fit');
assert.equal(JSON.stringify(catalog),before,'Selection must not mutate catalog geometry, registrations, notices or fit findings');
console.log(JSON.stringify({all_passed:true,actual_Yavoth_hardware_variants:16,retained_explicit_mount_references:18,component_transitions:optionTransitions,hotend_A_B_A:16,geometry_or_mount_fit_claim:false}));
