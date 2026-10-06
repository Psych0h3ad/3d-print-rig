import assert from 'node:assert/strict';
import fs from 'node:fs';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {collections,choicesFor,resolveVariant,headBuilderDimensions,importedVariant} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
const read=f=>JSON.parse(fs.readFileSync(new URL('../site/'+f,import.meta.url),'utf8'));
const add=read('HEAD_ADDITIONS.json'),raw={assets:{},base_assets:{},sources:[],variants:[]};
for(const [d,f]of Object.entries(collections)){const supplied=new Set((add[f]||[]).map(o=>o.id));raw[f]=[...new Set(add.variants.map(v=>v[d]))].filter(id=>!supplied.has(id)).map(id=>({id,label:id}));}
const before=JSON.stringify(raw),catalog=withHeadAdditions(raw,add);catalog.dimensions=headBuilderDimensions;
assert.equal(JSON.stringify(raw),before);assert.equal(add.variants.length,10);
let changes=0;
for(const v of add.variants){
 assert(v.head_only&&!v.machine_head&&!v.registration_source&&v.hardware_assembled);
 assert.deepEqual(headPlan(v).translation,[0,0,0]);assert.equal(headPlan(v).modules.length,0);
 assert.equal(importedVariant(catalog,{configuration:v.id}),catalog.variants.find(r=>r.id===v.id));
 for(const dimension of Object.keys(collections))for(const option of choicesFor(catalog,v,dimension)){
  const next=resolveVariant(catalog,{...v,[dimension]:option.id},dimension);assert(next&&next[dimension]===option.id);changes++;
 }
}
for(const mutate of [a=>a.schema='invalid',a=>a.variants[0].head_only=false,a=>a.variants[0].machine_head=true,a=>a.variants[0].extruder='missing',a=>a.variants[0].head_translation_mm=[0,NaN,0],a=>a.variants[0].modules=[{id:'missing'}],a=>a.variants.push(a.variants[0]),a=>a.toolheads.push(a.toolheads[0]),a=>a.assets[add.variants[0].base_asset].parts=0]){const bad=structuredClone(add);mutate(bad);assert.throws(()=>withHeadAdditions(raw,bad));}
console.log(JSON.stringify({native_head_references:10,exact_choice_transitions:changes,machine_installation_registered:false,strict_invalid_inputs:true}));
