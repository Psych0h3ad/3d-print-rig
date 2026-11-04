// Original source occurrences and official page-specific operations, not CAD fit.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createV0RailOperations} from '../site/viewer/v0-rail-operations.mjs';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
import {previousAssemblyProgressStorageKeys} from '../site/viewer/assembly-progress-migrations.mjs';
import {attachRailFixtureMetadata,reviewedRailViews,auditRailOwnership} from './v0_rail_reference_audit.mjs';
import {loadLanguage,translate,supportedLanguages} from '../site/viewer/i18n.mjs';
const raw=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),doc=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');let positive=0,negative=0;
for(const[id,spec]of Object.entries(doc.machines)){
 const manifest={machine_id:id,parts:attachRailFixtureMetadata(spec.stages.flatMap(s=>s.part_keys).map(key=>({key,name:key})),id)},policy=createV0RailOperations({spec,manifest}),review=reviewedRailViews(id);auditRailOwnership({id,spec,manifest});positive++;
 for(const row of review.rows){const i=spec.stages.findIndex(s=>s.id===row.id),before=new Set(spec.stages.slice(0,i+1).flatMap(s=>s.part_keys)),shown=policy.filter(i,before);assert.deepEqual(shown,new Set(row.refs));assert.deepEqual(new Set(policy.focus(i)),new Set(row.refs));assert.deepEqual(new Set(policy.stored(i,before)),new Set([...before].filter(k=>!shown.has(k))));assert.equal(policy.at(i).isolated,true);assert.deepEqual(policy.at(i).direction,[.65,.45,1]);positive++;}
 const index=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':sha}});
 const oldHash='30115ff48261cbbdcb53c49a2e9b51d8c660a6554eed43ec305870ffe1739c8a';for(const version of [1,2]){
  const old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:oldHash},current_stage:'y-rails',checked_stages:['nut-carriers','y-rails','z-rails','z-crossmembers','z-stops','head-motor','head-install'],...(version===2?{checked_parts:[review.key(11),review.screws[0][0],review.lower[0]]}:{})};const saved=JSON.stringify(old),v=validateAssemblyProgress(index,old);assert.equal(v.current_stage,'y-rail-lubrication');assert.deepEqual(v.checked_stages,['nut-carriers','head-motor','head-install']);assert.deepEqual(new Set(v.checked_parts),new Set(version===2?old.checked_parts:[]));assert.equal(JSON.stringify(old),saved);assert(previousAssemblyProgressStorageKeys(index).includes('3d-print-rig-assembly-progress-v'+version+':'+id+':'+oldHash));positive++;
 }
 for(const edit of [s=>s.model_sha256='0'.repeat(64),s=>s.manual.sha256='0'.repeat(64),s=>s.stages.find(s=>s.id==='y-rails').page_start++,s=>delete s.stages.find(s=>s.id==='y-rail-mounts').part_keys[0],s=>s.stages.find(s=>s.id==='z-rail-position').operation_part_keys.push(review.key(11)),s=>{const a=s.stages.findIndex(s=>s.id==='y-rail-position');[s.stages[a],s.stages[a+1]]=[s.stages[a+1],s.stages[a]]}]){const changed=structuredClone(spec);edit(changed);assert.throws(()=>createV0RailOperations({spec:changed,manifest}));negative++;}
 for(const edit of [p=>p.name='foreign',p=>p.solid_count++,p=>p.source.assembly_path[0]='foreign',p=>p.source.source_key='99999',p=>p.source.commit='0'.repeat(40)]){const changed=structuredClone(manifest);edit(changed.parts.find(p=>p.key===review.screws[0][0]));assert.throws(()=>createV0RailOperations({spec,manifest:changed}));negative++;}
 for(const i of [-1,NaN,.5,spec.stages.length]){assert.throws(()=>policy.at(i));negative++;}
 for(const lang of supportedLanguages){await loadLanguage(lang);for(const s of spec.stages.filter(s=>review.rows.some(r=>r.id===s.id)||s.id==='z-stops'))for(const f of ['title','note']){assert(translate(s[f],lang).trim());if(lang!=='en')assert.notEqual(translate(s[f],lang),s[f],'Missing rail copy '+lang+'/'+s.id+'/'+f)}positive++;}
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Both source/manual rail policies, all 40 original screws, upper/lower stop timing, B crossmember ownership, old progress preservation and six-language copy. Actual model/browser/native contact remain separate.'}));
