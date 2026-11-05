import assert from 'node:assert/strict';import fs from'node:fs/promises';import{createHash}from'node:crypto';
import{createAssemblyIndex,validateAssemblyProgress}from'../site/viewer/assembly-workbench-model.mjs';
import{v0ManualDelivery}from'../site/viewer/v0-manual-data.mjs';
const bytes=await fs.readFile(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),sha=b=>createHash('sha256').update(b).digest('hex'),stageSHA=sha(bytes),oldBytes=Buffer.concat([bytes.subarray(0,-1),Buffer.from('\r\n')]),oldSHA=sha(oldBytes),doc=JSON.parse(bytes);
assert.equal(bytes.at(-1),10);assert.equal(stageSHA,'7cb12de4b91de4fa4b77c8479ab30eed7eef9cc4cfe108f2601bd2d003d6f7f6');assert.equal(oldSHA,'26c6c7295ebcdf701719b6dad76ee3c4f83ebc268c45b86bb461a120530f98a1');assert.deepEqual(JSON.parse(oldBytes),doc);assert.equal(v0ManualDelivery['v0-assembly-stages'].sha256,stageSHA);
let rows=0;for(const[id,spec]of Object.entries(doc.machines)){
 const keys=spec.stages.flatMap(s=>s.part_keys),manifest={machine_id:id,parts:keys.map(key=>({key,name:key,source:{}}))},index=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':stageSHA}});
 for(const schema of['assembly-workbench-progress-v1','assembly-workbench-progress-v2']){
  const value={schema,identity:{...index.identity,stages_sha256:oldSHA},current_stage:'complete',checked_stages:spec.stages.map(s=>s.id)};if(schema.endsWith('v2'))value.checked_parts=keys;
  const before=JSON.stringify(value),next=validateAssemblyProgress(index,value);assert.equal(JSON.stringify(value),before);assert.equal(next.identity.stages_sha256,stageSHA);assert.deepEqual(next.checked_stages,spec.stages.map(s=>s.id));assert.deepEqual(next.checked_parts,schema.endsWith('v2')?keys:[]);rows++;
 }
 const corrupt={schema:'assembly-workbench-progress-v2',identity:{...index.identity,stages_sha256:'0'.repeat(64)},current_stage:'complete',checked_stages:[],checked_parts:[]};assert.throws(()=>validateAssemblyProgress(index,corrupt));
}
console.log(JSON.stringify({passed:true,identityCases:rows,onlySourceTerminalNewlineChanged:true,completeOriginalSourceChecksRetained:true,oldVersion1InventsNoPartChecks:true,unknownSourceIdentityRejected:true,geometryOrPhysicalFitQualification:false}));
