import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const {enumerateV0,buildSupport}=await import('./build_support_catalog.mjs');
const {readV0ModsURL}=await import('../site/viewer/v0-state.mjs');
import {configurationId,matchingRows,rowSelection,supportURL} from '../site/support/model.mjs';
import {machineChoices} from '../site/viewer/machines.js';
const v0=enumerateV0({options:[{slot:'toolhead',id:'test-head',label:'Test',requires:{strain_relief:'stock'}},{slot:'strain_relief',id:'test-mount',label:'Test'}]});
assert(v0.variants.some(v=>v.toolhead==='test-head'));
assert(!v0.variants.some(v=>v.toolhead==='test-head'&&v.strain_relief==='test-mount'));
const fixture={dimensions:['toolhead','extruder'],options:{toolhead:[{id:'a'},{id:'b'}],extruder:[{id:'c'},{id:'d'}]},idParts:['installed','a','b'],rows:[[[0,1],0,0,0],[[0,2],1,1,0]]};
assert.equal(matchingRows(fixture,{toolhead:'a',extruder:'d'}).length,0,'Unsupported combinations must not silently resolve to another part');
assert.equal(matchingRows(fixture,{toolhead:'a',extruder:'d'},'extruder').length,1);
assert.equal(configurationId(fixture,fixture.rows[0]),'installed__a');
const link=supportURL({id:'test',page:'./trident.html',kind:'machine'},fixture,fixture.rows[0],'https://example.test/rig/support/','ja');
assert.equal(new URL(link).searchParams.get('configuration'),'installed__a');
assert.equal(new URL(link).pathname,'/rig/viewer/trident.html');
const v0URL=new URL(supportURL({id:'v0',page:'./v0.html',kind:'v0'},fixture,fixture.rows[0],'https://example.test/rig/support/','ja'));
assert(!v0URL.searchParams.has('configuration'));assert.deepEqual(JSON.parse(v0URL.searchParams.get('v0_mods')),rowSelection(fixture,fixture.rows[0]));
if(process.argv[2]){
 const {index,details}=buildSupport(process.argv[2]);
 assert.deepEqual(index.targets.filter(m=>m.kind!=='standalone').map(m=>m.id).sort(),machineChoices.map(m=>m.id).sort());
 let rows=0;
 for(const target of index.targets){
  if(!target.file){assert(['stock','missing'].includes(target.status));continue}
  const c=details.get(target.file),ids=new Set();assert.equal(c.rows.length,target.count);
  if(target.id==='ender3_stock_220'){
   assert.equal(target.kind,'community');assert.equal(c.rows.length,8);assert.deepEqual(c.dimensions,['toolhead','zdrive','probe']);
   for(const row of c.rows){const url=new URL(supportURL(target,c,row,'https://fixture.test/support/','en'));assert.equal(url.searchParams.get('machine'),target.id);assert.equal(url.searchParams.get('configuration'),configurationId(c,row));}
  }
  const tuples=new Set();
  for(const row of c.rows){const id=configurationId(c,row);assert(!ids.has(id));ids.add(id);const selected=rowSelection(c,row);assert(Object.values(selected).every(Boolean));assert(c.notes[row.at(-1)]);tuples.add(JSON.stringify(selected));rows++}
  assert.equal(tuples.size,c.rows.length,'Display rows must retain every differentiating dimension');
  if(target.kind==='v0'){assert(c.mods.some(m=>!m.options.length));assert(c.mods.some(m=>m.options.length));assert(!matchingRows(c,{toolhead:'dragon-burner-revo-sherpa',strain_relief:'picobilical-plate'}).length);const registry=JSON.parse(fs.readFileSync(path.join(process.argv[2],'V0_INSTALLATIONS.json'),'utf8')).machines[target.id];for(const row of c.rows){const selected=rowSelection(c,row),url=supportURL(target,c,row,'https://fixture.test/support/','en');assert.deepEqual(readV0ModsURL(url,{machine_id:target.id,registry}),selected,'Every real V0 support link must restore its complete selected Mod tuple');}}
  if(target.id.startsWith('voron_trident_')){assert(target.heads.includes('sphinx'));assert(c.options.gantry.some(g=>g.id.startsWith('monolith_')));assert(c.banks.filter(b=>b.system==='stealthchanger').every(b=>!b.choices))}
  assert(c.banks.filter(b=>b.system==='madmax').every(b=>b.permitted===false),'A disabled single-tool state is not a registered dock');
  if(process.argv[3]){const shipped=fs.readFileSync(path.join(process.argv[3],target.file),'utf8');assert.equal(shipped,JSON.stringify(c)+'\n','Published report must match current composition rules: '+target.id)}
 }
 console.log(JSON.stringify({targets:index.targets.length,rows,all_registered_configurations_checked:true}));
}
console.log('Support index: strict filtering, V0 dependencies, exact links and machine coverage passed.');
