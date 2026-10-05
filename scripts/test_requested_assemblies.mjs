import assert from 'node:assert/strict';
import fs from 'node:fs';
import {machineChoices,machineFamilies,machineVendors} from '../site/viewer/machines.js';
const index=JSON.parse(fs.readFileSync(new URL('../site/COMMUNITY_MACHINES_ASSETS.json',import.meta.url)));
const publicCatalog=JSON.parse(fs.readFileSync(new URL('../site/PUBLIC_CATALOG.json',import.meta.url)));
for(const id of ['tictac_21_120','the100_v11_165','rook_mk2_120','satsuma180_v10']){
 const machine=machineChoices.find(m=>m.id===id),model=index.machines[id];
 assert(machine&&machineFamilies[machine.family]&&machineVendors[machine.vendor],id+' selectable family/vendor/size');
 assert.equal(machine.page,'./community.html');assert.equal(model.machine_id,id);assert(model.parts>250,id+' whole native assembly');
 for(const name of ['model.glb','assembly_manifest.json','machine_profile.json']){
  assert(model.files[name].bytes>0);assert.match(model.files[name].sha256,/^[a-f0-9]{64}$/);
 }
 const source=publicCatalog.sources.find(s=>s.label.startsWith(machine.family==='the100'?'THE 100':machine.family==='tictac'?'TicTac':machine.family==='rook'?'Rook':'Satsuma'));
 assert(source?.license_file&&source.notice&&source.source_step_sha256);
 assert(fs.existsSync(new URL('../site/'+source.license_file,import.meta.url)));
 assert(fs.existsSync(new URL('../site/'+source.notice,import.meta.url)));
 if(machine.family!=='the100')assert(source.url.startsWith('https://www.printables.com/model/'));
}
assert.deepEqual(index.machines.rook_mk2_120.additional_models,['g2sa.glb']);
assert(index.machines.rook_mk2_120.files['g2sa.glb'].decoded_bytes>0,'Independent licensed G2SA geometry');
console.log('Four complete CAD references have registered navigation, source checksums and licenses; G2SA is a separate geometry asset.');
