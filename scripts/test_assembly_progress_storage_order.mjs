// Retained source revisions coexist in browser storage. The most recent
// supported source revision must win; current records still take precedence.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {createAssemblyIndex,assemblyProgressStorageKey,legacyAssemblyProgressStorageKey,validateAssemblyProgress} from '../site/viewer/assembly-workbench-model.mjs';
import {createAssemblyWorkbench} from '../site/viewer/assembly-workbench.mjs';
const raw=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),catalog=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');
const guide="64ffe3c0359d11e1c1ff523cfc8eda6b63fb51a5ce7cba3b6c857112c2fcc3e8";
const recent='30115ff48261cbbdcb53c49a2e9b51d8c660a6554eed43ec305870ffe1739c8a',archive='689e54096b54f6eeaaa9d5d96c6a735a8fc43391e6477ab0115bc9aeb8ba2a4e';let cases=0;
for(const[mid,machine]of Object.entries(catalog.machines)){
 const manifest={machine_id:mid,parts:machine.stages.flatMap(s=>s.part_keys).map(key=>({key,name:'Source-key fixture '+key}))},index=createAssemblyIndex({manifest,machine,receipts:{'model.glb':machine.model_sha256,'assembly_manifest.json':machine.manifest_sha256,'assembly_stages.json':sha}}),screw=machine.stages.find(s=>s.id==='y-rail-mounts').part_keys[0];
 const record=(hash,version,current_stage,checked_stages,parts=[])=>({schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:hash},current_stage,checked_stages,...(version===2?{checked_parts:parts}:{})});
 const storageKey=(hash,version)=>'3d-print-rig-assembly-progress-v'+version+':'+mid+':'+hash;
 const archived=record(archive,2,'head-motor',['head-motor']),latest=record(recent,2,'y-rails',['nut-carriers','y-rails','head-install'],[screw]),latestV1=record(recent,1,'y-rails',['nut-carriers','y-rails','head-install']);
 const current=record(sha,2,'z-rail-position',['nut-carriers'],[screw]),currentV1=record(sha,1,'head-install',['head-install']);
 const guideStage=mid==='voron_v02r1_120'?'z-motor-center':'z-align',guideV2=record(guide,2,guideStage,['head-install','z-rail-position',guideStage],[screw]),guideV1=record(guide,1,guideStage,['head-install','z-rail-position',guideStage]);
 const scenarios=[
  {name:'immediate-guide-v2-over-prior-v2',records:[[storageKey(recent,2),latest],[storageKey(guide,2),guideV2]],expected:guideV2},
  {name:'immediate-guide-v1-over-prior-v2',records:[[storageKey(recent,2),latest],[storageKey(guide,1),guideV1]],expected:guideV1},
  {name:'current-v2-over-immediate-guide',records:[[storageKey(guide,2),guideV2],[assemblyProgressStorageKey(index),current]],expected:current},
  {name:'latest-v2-over-archived-v2',records:[[storageKey(archive,2),archived],[storageKey(recent,2),latest]],expected:latest},
  {name:'latest-v2-over-archived-v1',records:[[storageKey(archive,1),record(archive,1,'head-motor',['head-motor'])],[storageKey(recent,2),latest]],expected:latest},
  {name:'latest-v1-over-archived-v2',records:[[storageKey(archive,2),archived],[storageKey(recent,1),latestV1]],expected:latestV1},
  {name:'current-v2-over-all-retained',records:[[storageKey(archive,2),archived],[storageKey(recent,2),latest],[assemblyProgressStorageKey(index),current]],expected:current},
  {name:'current-v1-over-retained',records:[[storageKey(archive,2),archived],[storageKey(recent,2),latest],[legacyAssemblyProgressStorageKey(index),currentV1]],expected:currentV1},
  {name:'latest-v2-over-same-source-v1',records:[[storageKey(archive,2),archived],[storageKey(recent,1),latestV1],[storageKey(recent,2),latest]],expected:latest}
 ];
 for(const sample of scenarios){
  const doc=new TestDocument(),container=doc.createElement('section');doc.body.append(container);const legacy={};for(const n of ['select','previous','next','focus','note','manual','finish'])legacy[n]=doc.createElement(n==='select'?'select':'button');for(const s of index.stages){const option=doc.createElement('option');option.value=String(s.index);legacy.select.append(option)}
  const memory=new Map(sample.records.map(([k,v])=>[k,JSON.stringify(v)])),before=new Map(memory);let ui;const state=i=>({index:i,visible_keys:[...index.stage(i).part_keys],added:index.stage(i).part_keys.length,visible_count:index.stage(i).part_keys.length,manual_text:'manual fixture'});
  ui=createAssemblyWorkbench({container,index,legacy,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},format:id=>id,translate:v=>v,onStage:i=>ui.update(state(i)),onFocusPart:()=>{},download:()=>{}});ui.activate();ui.update(state(ui.resumeIndex()));
  assert.deepEqual(ui.snapshot(),validateAssemblyProgress(index,sample.expected),mid+'/'+sample.name+' must preserve the most recent applicable record');for(const[k,v]of before)if(k!==assemblyProgressStorageKey(index))assert.equal(memory.get(k),v,'Archived record changed');ui.dispose();cases++;
 }
}
console.log(JSON.stringify({passed:true,cases,scope:'Two original V0 source identities, coexisting current/v1/retained revisions and source-specific part checks; deterministic storage precedence and unchanged archive bytes. Not CAD or native-fit evidence.'}));
