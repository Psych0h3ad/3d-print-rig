import assert from 'node:assert/strict';
import{sourceShroud}from'../site/viewer/microswiss-source-shroud-palette.mjs';
import{references}from'./microswiss-reference-contract.mjs';
let checks=0;
for(const r of references){
 if(!r.printed_shroud_key){assert.equal(sourceShroud({id:r.id}),null);checks++;continue;}
 const meta={id:r.id,source_sha256:r.source_sha256,parts:[structuredClone(r.printed_source_record)]};
 assert.equal(sourceShroud(meta).key,r.printed_shroud_key);checks++;
 for(const field of ['source_sha256','source_entry','source_occurrence','source_path_sha256']){const bad=structuredClone(meta);bad.parts[0][field]='changed';assert.throws(()=>sourceShroud(bad));checks++;}
 const missing=structuredClone(meta);missing.parts=[];assert.throws(()=>sourceShroud(missing));checks++;
 const duplicate=structuredClone(meta);duplicate.parts.push(structuredClone(meta.parts[0]));assert.throws(()=>sourceShroud(duplicate));checks++;
 const oldRole=structuredClone(meta);oldRole.parts[0].role=null;assert.throws(()=>sourceShroud(oldRole));checks++;
}
assert.equal(references.length,6);assert.equal(references.filter(r=>r.printed_shroud_key).length,2);
console.log(JSON.stringify({passed:true,source_identity_checks:checks,scope:'Guard fixtures; actual exported models are a separate required build gate.'}));
