import fs from 'node:fs';import assert from 'node:assert/strict';
import {validateAssemblyProgress}from'../site/viewer/assembly-workbench-model.mjs';
import {tridentPanelProgressNeedsMigration,previousTridentPanelProgressStorageKeys}from'../site/viewer/trident-panel-progress-migrations.mjs';
const rows=JSON.parse(fs.readFileSync(new URL('./fixtures/trident-panel-size-progress.json',import.meta.url),'utf8'));let cases=0;
for(const row of rows){
 const sourceKeys=row.sourceKeys,stages=row.previousStages.filter(id=>!['panels','filament'].includes(id)).map(id=>({id,part_keys:[]}));stages.push({id:'rear-frame-preload',part_keys:[]},{id:row.refinedStage,part_keys:sourceKeys});
 const index={identity:row.current,stages,stage(id){const s=stages.find(s=>s.id===id);assert(s,'Unknown source fixture stage');return s},part(key){assert(sourceKeys.includes(key));return{key}}};
 assert(tridentPanelProgressNeedsMigration(index,row.previous));
 for(const version of [1,2])for(const current_stage of ['panels','filament']){
  const old={schema:'assembly-workbench-progress-v'+version,identity:row.previous,current_stage,checked_stages:['frame','wiring','panels','filament'],...(version===2?{checked_parts:sourceKeys}:{})},moved=validateAssemblyProgress(index,old);
  assert.equal(moved.current_stage,'rear-frame-preload');assert.deepEqual(moved.checked_stages,['frame']);assert.deepEqual(moved.checked_parts,version===2?sourceKeys:[]);assert.deepEqual(moved.identity,row.current);cases++;
  const bad=structuredClone(old);bad.current_stage=row.refinedStage;assert.throws(()=>validateAssemblyProgress(index,bad),/absent/);cases++;
  const unknown=structuredClone(old);unknown.identity.source_documents_sha256='0'.repeat(64);assert.throws(()=>validateAssemblyProgress(index,unknown),/another model/);cases++;
 }
 for(const version of [1,2])assert(previousTridentPanelProgressStorageKeys(index).includes('3d-print-rig-assembly-progress-v'+version+':'+row.previous.machine+':'+row.previous.stages_sha256));
 const other=rows.find(r=>r.current.machine!==row.current.machine);assert(!tridentPanelProgressNeedsMigration(index,other.previous));cases++;
}
console.log(JSON.stringify({cases,machines:rows.map(r=>r.current.machine),scope:'Exact source identity v1/v2 software migration, unchanged source checks, recheck of refined stages, old-record injection and cross-size refusal. Real full-source file migration is separately audited.'}));
