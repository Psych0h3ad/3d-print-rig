import assert from 'node:assert/strict';
import {readFile,access} from 'node:fs/promises';
import path from 'node:path';
import {gantryChoice} from '../site/viewer/gantry-model.js';
import {dimensions,choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
const root=path.resolve(process.argv[2]||'site'),read=async f=>JSON.parse(await readFile(path.join(root,f),'utf8'));
const gantries=await read('GANTRY_CONFIGURATIONS.json'),heads=await read('TOOLHEAD_CONFIGURATIONS.json'),library=await read('COMPONENT_LIBRARY.json');
assert.equal(gantries.variants.length,16);assert.equal(heads.variants.length,268);assert.equal(library.items.length,23);
for(const catalog of [gantries,heads,library])for(const asset of Object.values(catalog.assets)){await access(path.join(root,asset.meta));try{await access(path.join(root,asset.glb))}catch{await access(path.join(root,asset.glb+'.gz'))}const meta=await read(asset.meta);assert(meta.parts.length>0)}
for(const v of gantries.variants){assert.equal(gantryChoice(gantries,v),v);assert(v.modules.every(id=>gantries.assets[id]));assert.equal(v.front,v.xy_motors===2?'FT':'NP')}
let transitions=0;
for(const v of heads.variants){
 const plan=headPlan(v);assert(heads.base_assets[plan.base]);assert(plan.modules.every(m=>heads.assets[m.id]));assert(!plan.modules.some(m=>m.id==='trident_r2_gantry_350'));
 for(const dimension of dimensions)for(const row of choicesFor(heads,v,dimension)){const next=resolveVariant(heads,{...v,[dimension]:row.id},dimension);assert(heads.variants.includes(next));assert.equal(next[dimension],row.id);transitions++}
 if(v.carriage==='vitalii_lightweight'){assert(v.head_only&&v.probe==='none'&&v.fit.carriage_native_body_passed===false);assert(v.fit.carriage_native_body_collisions.length>0);assert(heads.assets[v.inspection_module]);assert.deepEqual(choicesFor(heads,v,'probe').map(p=>p.id),['none'])}
}
assert.equal(heads.variants.filter(v=>v.carriage==='vitalii_lightweight').length,6);
console.log(JSON.stringify({monolith_assemblies:16,head_variants:268,library_items:23,head_choice_transitions:transitions,browser_ui_review:false}));
