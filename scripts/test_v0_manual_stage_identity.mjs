import assert from 'node:assert/strict';import fs from'node:fs/promises';import{createHash}from'node:crypto';
import{createAssemblyIndex,validateAssemblyProgress,createAssemblyProgress}from'../site/viewer/assembly-workbench-model.mjs';
import{v0ManualDelivery}from'../site/viewer/v0-manual-data.mjs';
const bytes=await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),stageSHA=sha(bytes),doc=JSON.parse(bytes);
const added=['reference-printed-parts','reference-fasteners','reference-blind-joints','reference-tools','reference-drilling','reference-frame-profiles','reference-belt-paths','reference-tophat-profiles','reference-startup-docs'];
const previous=structuredClone(doc);for(const spec of Object.values(previous.machines))spec.stages=spec.stages.filter(s=>!added.includes(s.id));
const oldBytes=Buffer.from(JSON.stringify(previous)+'\n'),oldSHA=sha(oldBytes),oldCRLF=sha(Buffer.concat([oldBytes.subarray(0,-1),Buffer.from('\r\n')]));
assert.equal(bytes.at(-1),10);assert.equal(stageSHA,'cbcdeba5d465a35dd1787c2f6064595d24e215b97601fc71ca8f450c7e3c6205');assert.equal(oldSHA,'7cb12de4b91de4fa4b77c8479ab30eed7eef9cc4cfe108f2601bd2d003d6f7f6');assert.equal(oldCRLF,'26c6c7295ebcdf701719b6dad76ee3c4f83ebc268c45b86bb461a120530f98a1');assert.equal(v0ManualDelivery['v0-assembly-stages'].sha256,stageSHA);
let rows=0;for(const[id,spec]of Object.entries(doc.machines)){
 const original=previous.machines[id],keys=spec.stages.flatMap(s=>s.part_keys),manifest={machine_id:id,parts:keys.map(key=>({key,name:key,source:{}}))},index=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':stageSHA}});
 assert.equal(spec.stages.length-original.stages.length,9);assert.deepEqual(spec.stages.filter(s=>!added.includes(s.id)),original.stages);for(const id of added)assert.deepEqual(index.stage(id).part_keys,[]);
 for(const oldHash of[oldSHA,oldCRLF])for(const schema of['assembly-workbench-progress-v1','assembly-workbench-progress-v2']){
  const value={schema,identity:{...index.identity,stages_sha256:oldHash},current_stage:'complete',checked_stages:original.stages.map(s=>s.id)};if(schema.endsWith('v2'))value.checked_parts=keys;
  const before=JSON.stringify(value),next=validateAssemblyProgress(index,value);assert.equal(JSON.stringify(value),before);assert.equal(next.identity.stages_sha256,stageSHA);assert.deepEqual(next.checked_stages,original.stages.map(s=>s.id));assert(added.every(id=>!next.checked_stages.includes(id)));assert.deepEqual(next.checked_parts,schema.endsWith('v2')?keys:[]);
  const progress=createAssemblyProgress(index,next);progress.setStage(added[0]);progress.toggle(added[0]);const checked=progress.snapshot(),undo=progress.clearChecks();assert.deepEqual(progress.snapshot().checked_stages,[]);assert.deepEqual(progress.snapshot().checked_parts,[]);progress.restore(undo);assert.deepEqual(progress.snapshot(),checked);rows++;
 }
 const corrupt={schema:'assembly-workbench-progress-v2',identity:{...index.identity,stages_sha256:'0'.repeat(64)},current_stage:'complete',checked_stages:[],checked_parts:[]};assert.throws(()=>validateAssemblyProgress(index,corrupt));
}
console.log(JSON.stringify({passed:true,identityCases:rows,allOriginalStageRowsAndPartKeysPreserved:true,nineNewReferencesNeverAutoChecked:true,clearAndUndoRestoreBothRecords:true,unknownSourceIdentityRejected:true,geometryOrPhysicalFitQualification:false}));
