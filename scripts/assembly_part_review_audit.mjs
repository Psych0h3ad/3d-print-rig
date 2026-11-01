import assert from 'node:assert/strict';
export function auditPartReview(index,{assemblyPartRows,createAssemblyProgress,validateAssemblyProgress}){
 const references=index.stages.flatMap(s=>assemblyPartRows(index,s.id)),rows=[...new Map(references.map(r=>[r.key,r])).values()],keys=rows.map(r=>r.key);
 assert.equal(rows.length,index.partCount);assert.equal(new Set(keys).size,index.partCount);
 for(const stage of index.stages)for(const key of stage.part_keys)assert(index.parts(stage.id).some(p=>p.key===key),'Every introduced source part must remain in its operation');
 for(const r of rows){assert.equal(r.part,index.part(r.key));assert(r.ordinal>=1&&r.ordinal<=r.total);assert(index.owner(r.key).part_keys.includes(r.key));}
 const hardware=rows.filter(r=>r.fastener);assert(hardware.length>0,'Actual named source fasteners required');
 const progress=createAssemblyProgress(index),samples=[hardware[0],hardware[Math.floor(hardware.length/2)],hardware.at(-1)];
 for(const r of samples)if(!progress.snapshot().checked_parts.includes(r.key))progress.togglePart(r.key);
 const saved=progress.snapshot();assert.deepEqual(validateAssemblyProgress(index,JSON.parse(JSON.stringify(saved))),saved);
 assert.throws(()=>progress.togglePart('__unknown_source_part__'));assert.deepEqual(progress.snapshot(),saved);
 const old={schema:'assembly-workbench-progress-v1',identity:saved.identity,current_stage:saved.current_stage,checked_stages:saved.checked_stages},migrated=validateAssemblyProgress(index,old);assert.deepEqual(migrated.checked_parts,[]);assert.deepEqual(migrated.checked_stages,old.checked_stages);
 const complete=validateAssemblyProgress(index,{...saved,checked_parts:keys}),bytes=Buffer.byteLength(JSON.stringify(complete,null,2)+'\n');assert(bytes<524288,'Every source-part record must fit its own import limit');
 progress.clearChecks();assert.deepEqual(progress.snapshot().checked_parts,[]);progress.restore(saved);assert.deepEqual(progress.snapshot(),saved);
 return {parts:rows.length,operationReferences:references.length,namedFasteners:hardware.length,sampledSourceKeys:samples.map(r=>r.key),allPartsProgressBytes:bytes,sourceIdentityBound:true,legacyMigration:true,unknownPartRejected:true};
}
