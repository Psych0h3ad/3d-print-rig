// Source-backed instruction identity plus a keyed lifecycle fixture. Actual
// complete GLBs/stock companions are audited separately by the release gate.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {createV0HeadAssembly} from '../site/viewer/v0-head-assembly.mjs';
import {createAssemblyIndex,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
import {attachHeadFixtureMetadata,reviewedHeadCohort,reviewedHeadKey,reviewedHeadViews,auditHeadOwnership} from './v0_head_reference_audit.mjs';
import {loadLanguage,translate,supportedLanguages} from '../site/viewer/i18n.mjs';
const raw=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),doc=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');let positive=0,negative=0;
for(const[id,spec]of Object.entries(doc.machines)){
 const keys=spec.stages.flatMap(s=>s.part_keys),manifest={machine_id:id,parts:attachHeadFixtureMetadata(keys.map(key=>({key,name:key})),id)},policy=createV0HeadAssembly({spec,manifest}),review=reviewedHeadViews(id),cohort=reviewedHeadCohort(id),k=n=>reviewedHeadKey(id,n);
 auditHeadOwnership({id,spec,manifest});assert.equal(cohort.length,id==='voron_v02r1_120'?100:99);positive++;
 for(const name of review.views.keys()){
  const i=spec.stages.findIndex(s=>s.id===name),v=review.views.get(name),current=policy.at(i),before=new Set(spec.stages.slice(0,i+1).flatMap(s=>s.part_keys)),shown=policy.filter(i,before),strain=spec.stages.findIndex(s=>s.id==='head-strain-relief');
  const expected=new Set([...before].filter(key=>v.isolated?v.shown.has(key):i>=strain||!review.spacers.has(key)));assert.deepEqual(shown,expected);assert.deepEqual(new Set(policy.stored(i,before)),new Set([...before].filter(key=>!shown.has(key))));assert.equal(current.isolated,v.isolated);assert(current.direction.every(Number.isFinite));assert(Object.isFrozen(current.direction));positive++;
 }
 const round=policy.at(spec.stages.findIndex(s=>s.id==='head-motor')),slot=policy.at(spec.stages.findIndex(s=>s.id==='head-motor-slot'));assert(round.direction[0]<0&&slot.direction[0]>0,'Opposite source screws need opposite sides of the head');assert(!round.keys.includes(k(383)));assert(slot.keys.includes(k(383)));positive++;
 if(id==='voron_v02r1_120'){assert(!policy.focus(spec.stages.findIndex(s=>s.id==='head-carriage-review')).includes('v02r1_00354'),'Removed support must not be presented as another carriage-preparation item');positive++}
 const index=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':sha}});
 for(const version of [1,2])for(const[id0,target]of [['head-extruder','head-motorplate-prep'],['head-fans','head-fan-first'],['head-hotend','head-hotend-choice']]){
  const old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:'689e54096b54f6eeaaa9d5d96c6a735a8fc43391e6477ab0115bc9aeb8ba2a4e'},current_stage:id0,checked_stages:['drives-install',id0,'head-prep'],...(version===2?{checked_parts:[k(369),k(383)]}:{})},migrated=validateAssemblyProgress(index,old);assert.equal(migrated.current_stage,target);assert.deepEqual(migrated.checked_stages,['drives-install']);assert.deepEqual(new Set(migrated.checked_parts),new Set(version===2?old.checked_parts:[]));positive++;
 }
 for(const edit of [s=>s.model_sha256='0'.repeat(64),s=>s.manual.sha256='0'.repeat(64),s=>s.stages.find(s=>s.id==='head-prep').page_start++,s=>delete s.stages.find(s=>s.id==='head-prep').part_keys[0],s=>delete s.stages.find(s=>s.id==='head-install').operation_part_keys[0],s=>{const a=s.stages.findIndex(s=>s.id==='head-motor'),b=s.stages.findIndex(s=>s.id==='head-motor-slot');[s.stages[a],s.stages[b]]=[s.stages[b],s.stages[a]]},s=>s.stages.find(s=>s.id==='head-install').part_keys.push(k(369))]){const changed=structuredClone(spec);edit(changed);assert.throws(()=>createV0HeadAssembly({spec:changed,manifest}));negative++}
 const changed=structuredClone(manifest);changed.parts.find(p=>p.key===k(341)).source.assembly_path=['foreign'];assert.throws(()=>createV0HeadAssembly({spec,manifest:changed}));negative++;
 for(const i of [-1,NaN,.5,spec.stages.length]){assert.throws(()=>policy.at(i));negative++}
 for(const lang of supportedLanguages){await loadLanguage(lang);for(const s of spec.stages.filter(s=>s.id.startsWith('head-'))){assert(translate(s.title,lang).trim());if(lang!=='en')assert.notEqual(translate(s.title,lang),s.title,'Missing head title '+lang+'/'+s.id);if(s.note&&lang!=='en')assert.notEqual(translate(s.note,lang),s.note,'Missing head note '+lang+'/'+s.id)}positive++}
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Both exact source/manual head operation policies, lower/plate/motor screw identities and reused front screws, keyed masks, exact legacy progress/head recheck and six language copy. Separate actual assets/native/browser evidence required.'}));
