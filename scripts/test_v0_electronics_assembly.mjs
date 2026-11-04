import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
const C=fileURLToPath(new URL('../',import.meta.url)),viewer=new URL('../site/viewer/',import.meta.url);
const sha=b=>createHash('sha256').update(b).digest('hex'),raw=await fs.readFile(C+'/site/V0_ASSEMBLY_STAGES.json'),doc=JSON.parse(raw);
const {createV0ElectronicsAssembly}=await import(new URL('v0-electronics-assembly.mjs',viewer));
const {createAssemblyIndex,validateAssemblyProgress}=await import(new URL('assembly-workbench-model.mjs',viewer));
const {translate,loadLanguage,supportedLanguages}=await import(new URL('i18n.mjs',viewer));
import {attachElectronicsFixtureMetadata,auditElectronicsOwnership} from './v0_electronics_reference_audit.mjs';
const report={passed:false,positive:0,negative:0,machines:[],physicalFitQualified:false,publicationQualified:false};
try{
for(const[id,spec]of Object.entries(doc.machines)){
 const r1=id==='voron_v02r1_120',key=n=>(r1?'v02r1_':'v02_')+String(n).padStart(5,'0'),manifest={machine_id:id,parts:attachElectronicsFixtureMetadata(spec.stages.flatMap(s=>s.part_keys).map(key=>({key,name:key})),id)};auditElectronicsOwnership({id,spec,manifest});
 const mounts=(r1?[1663,1662,1655,1657,1673,1672,1665,1667]:[1639,1638,1630,1632,1649,1648,1640,1642]).map(key),cleats=(r1?[1664,1661,1674,1671]:[1637,1636,1647,1646]).map(key),fan=(r1?[914,909,910,911,912]:[889,884,885,886,887]).map(key);
 const board=(r1?[1656,1658,1659,1660]:[1631,1633,1634,1635]).map(key),pi=(r1?[1666,1668,1669,1670]:[1641,1643,1644,1645]).map(key),policy=createV0ElectronicsAssembly({spec,manifest}),ids=spec.stages.map(s=>s.id),at=n=>ids.indexOf(n);
 assert.deepEqual(spec.stages[at('electronics-mounts')].part_keys,mounts);
 assert.deepEqual(spec.stages[at('electronics-control-board-fixing')].part_keys,board);assert.deepEqual(spec.stages[at('electronics-pi-board-fixing')].part_keys,pi);
 assert.deepEqual(spec.stages[at('electronics-fan-inserts')].part_keys,fan);
 assert.equal(spec.stages[at('electronics-control-board')].part_keys.length,739);assert.equal(spec.stages[at('electronics-pi-board')].part_keys.length,1);
 const boardIds=new Set(spec.stages[at('electronics-control-board')].part_keys);for(const row of manifest.parts.filter(p=>boardIds.has(p.key)))assert(row.source.assembly_path.includes('BTT SKR Pico MCU:1'));
 const observations=[];
 for(let i=0;i<spec.stages.length;i++){
  const stage=spec.stages[i],cumulative=spec.stages.slice(0,i+1).flatMap(s=>s.part_keys),isolated=['electronics-fan-inserts','electronics-mounts','electronics-mount-height','electronics-cleat-tape'].includes(stage.id),refs=stage.operation_part_keys||stage.part_keys;
  const stored=new Set([...(i<at('electronics-mount-install')?mounts:[]),...(i<at('electronics-cleat-install')?cleats:[]),...(i<at('electronics-fan')?fan:[])]),expected=cumulative.filter(k=>isolated?refs.includes(k):!stored.has(k));
  assert.deepEqual([...policy.filter(i,new Set(cumulative))],expected);
  if(policy.at(i)){assert.equal(policy.at(i).isolated,isolated);assert.deepEqual(policy.focus(i),refs);assert(Object.isFrozen(policy.at(i).direction));observations.push({id:stage.id,shown:expected.length,isolated,owned:stage.part_keys.length});}
  report.positive++;
 }
 const index=createAssemblyIndex({manifest,machine:spec,receipts:{'model.glb':spec.model_sha256,'assembly_manifest.json':spec.manifest_sha256,'assembly_stages.json':sha(raw)}}),oldSHA='27928f876b6e05a46227c0e7f7e07b3513a55e8fec375f546c2c594068baa059';
 for(const version of [1,2])for(const[current,target]of [['mid-panel','mid-panel-alignment'],['electronics-mounts','electronics-mounts'],['electronics-boards','electronics-control-board'],['electronics-fan','electronics-fan']]){
  const checked=['head-install','z-rail-position','mid-panel','electronics-mounts','electronics-boards','electronics-fan'],parts=[board[0],pi[0]],old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:oldSHA},current_stage:current,checked_stages:checked,...(version===2?{checked_parts:parts}:{})},migrated=validateAssemblyProgress(index,old);
  assert.equal(migrated.current_stage,target);assert.deepEqual(migrated.checked_stages,['z-rail-position','head-install'].sort((a,b)=>index.stage(a).index-index.stage(b).index));assert.deepEqual(new Set(migrated.checked_parts),new Set(version===2?parts:[]));report.positive++;
 }
 const mutate=[s=>s.model_sha256='0'.repeat(64),s=>s.manifest_sha256='0'.repeat(64),s=>s.manual.sha256='0'.repeat(64),s=>s.stages[at('electronics-mounts')].page_start++,s=>s.stages[at('electronics-mounts')].part_keys.splice(0,1),s=>{const p=s.stages[at('electronics-control-board-fixing')];p.part_keys[0]=mounts[2]},s=>{const a=at('electronics-pi-board'),b=at('electronics-pi-board-fixing');[s.stages[a],s.stages[b]]=[s.stages[b],s.stages[a]]},s=>s.stages[at('electronics-control-board')].part_keys.pop(),s=>s.stages[at('electronics-fan-inserts')].part_keys.push(key(1))];
 for(const edit of mutate){const changed=structuredClone(spec);edit(changed);assert.throws(()=>createV0ElectronicsAssembly({spec:changed,manifest}));report.negative++;}
 for(const edit of [p=>p.name='M2x10 generic replacement',p=>p.source.assembly_path=['unrelated'],p=>p.source.commit='0'.repeat(40),p=>p.source.source_key='99999']){const changed=structuredClone(manifest);edit(changed.parts.find(p=>p.key===board[0]));assert.throws(()=>createV0ElectronicsAssembly({spec,manifest:changed}));report.negative++;}
 for(const i of [-1,NaN,0.5,spec.stages.length]){assert.throws(()=>policy.at(i));report.negative++;}
 for(const lang of supportedLanguages){await loadLanguage(lang);for(const o of observations){const s=spec.stages[at(o.id)];for(const text of [s.title,s.note,policy.at(at(o.id)).status,...policy.at(at(o.id)).notes].filter(Boolean)){assert(translate(text,lang).trim());if(lang!=='en')assert.notEqual(translate(text,lang),text,'Missing literal '+lang+': '+text);}}report.positive++;}
 report.machines.push({machine:id,stages:spec.stages.length,parts:manifest.parts.length,observations,oldProgressCases:8,sourceBoardLeaves:739,purchasedPiLeaves:1});
}
report.passed=true;
}catch(e){throw e;}
assert(report.passed);console.log(JSON.stringify({passed:true,positive:report.positive,negative:report.negative,scope:'Exact source metadata fixtures, independent manual/storage/board fixing ownership, old progress and six languages. Actual geometry, browser and native interfaces are separate.'}));
