import assert from 'node:assert/strict';
import fs from 'node:fs';
import {configurationById,importedVariant,resolveVariant} from '../site/viewer/configuration-model.js';
import {sphinxCompanionPresets,withSphinxCompanionPresets} from '../site/viewer/head-companion-presets.mjs';
import {monolithHeadCatalog,monolithCompanion} from '../site/viewer/monolith-head-model.mjs';
import {withMonolithMachines} from '../site/viewer/monolith-machine-model.mjs';

const raw=JSON.parse(fs.readFileSync(new URL('./fixtures/sphinx-companion-presets.json',import.meta.url)));
const heads=withSphinxCompanionPresets(raw),registry={sources:{
 stealthchanger_monolith:{origin_mm:[.2,4,6]},
 head_sphinx_monolith_tricorn:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:[6,9]},
 head_sphinx_monolith_goliath_chcxl:{origin_mm:[0,-7.5,0],compatible_belt_widths_mm:[6]}
},monolith_target:{origin_mm:[0,.5,0],axis_error_mm:0}};
const gantries={source:{url:'https://example.test/source'},variants:[6,9].map(width=>({
 id:'fixture_'+width,machine:'VT',size_mm:350,build:'printed',belt_width_mm:width,xy_motors:4,modules:[],notes:[]
}))};
const bench=monolithHeadCatalog(heads,registry,gantries),machine='fixture_host';
const installed=withMonolithMachines({machine_id:machine,gantries:[],variants:[],assets:{},sources:[],configuration_aliases:heads.configuration_aliases},
 heads,registry,gantries,{machines:{[machine]:{family:'VT',size_mm:350,translation_mm:[0,0,360]}}});
let migrations=0;
for(const catalog of [bench,installed])for(const v of catalog.variants){
 const preset=sphinxCompanionPresets.find(p=>p.to===v.source_head_configuration);assert(preset);
 const legacy=v.id.slice(0,-preset.to.length)+preset.from;
 assert.equal(configurationById(catalog,legacy),v,'Legacy composed ID must retain the exact host and gantry');
 assert.equal(importedVariant(catalog,{machine:catalog.machine_id,configuration:legacy}),v);
 assert.equal(importedVariant(catalog,JSON.parse(JSON.stringify({machine:catalog.machine_id,configuration:v.id}))),v);
 assert.equal(monolithCompanion(heads,v),heads.variants.find(s=>s.id===preset.to));
 assert.equal(monolithCompanion(heads,{...v,source_head_configuration:'missing'}),undefined);
 for(const key of ['hotend','extruder','carriage','probe','board','cooling']){
  assert.equal(monolithCompanion(heads,{...v,[key]:'unregistered'}),undefined);
  assert.equal(resolveVariant(catalog,{...v,[key]:'unregistered'}),null,'Explicit unavailable tuple must fail without companion fallback');
  assert.throws(()=>importedVariant(catalog,{machine:catalog.machine_id,configuration:legacy,[key]:'unregistered'}),'A saved ID cannot waive a contradictory explicit tuple');
 }
 assert.equal(configurationById(catalog,legacy.replace('fixture_','missing_')),undefined);
 assert.equal(configurationById(catalog,'unregistered_prefix__'+legacy),undefined);
 assert.throws(()=>importedVariant(catalog,{machine:catalog.machine_id,configuration:legacy.replace('fixture_','missing_')}));
 migrations++;
}
const nine=bench.variants.find(v=>v.belt_width_mm===9),goliath=sphinxCompanionPresets.find(p=>p.gantry==='sphinx_monolith'&&p.hotend==='goliath_air');
assert.equal(configurationById(bench,'monolith_installed__fixture_9__'+goliath.from),undefined,'6 mm source migration cannot create a 9 mm clamp');
assert.equal(resolveVariant(bench,{...nine,hotend:'goliath_air'}),null);
const forged={...bench,variants:bench.variants.map(v=>({...v,source_head_configuration:'different-source'}))};
assert.equal(configurationById(forged,'monolith_installed__fixture_6__'+sphinxCompanionPresets.find(p=>p.gantry==='sphinx_monolith').from),undefined);
console.log(JSON.stringify({passed:true,composed_source_migrations:migrations,exact_source_companions:true,unavailable_tuple_fallback:false,
 scope:'Source recipe/controller fixtures only; actual exported geometry is a separate audit.'}));
