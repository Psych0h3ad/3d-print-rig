// Software identity/storage controls for the reviewed V0 stage correction.
// Source-key fixtures do not stand in for actual CAD or physical assembly.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {createAssemblyIndex,createAssemblyProgress,validateAssemblyProgress,assemblyProgressStorageKey} from '../site/viewer/assembly-workbench-model.mjs';
import {createAssemblyWorkbench} from '../site/viewer/assembly-workbench.mjs';
import {assemblyProgressNeedsMigration,previousAssemblyProgressStorageKeys} from '../site/viewer/assembly-progress-migrations.mjs';
const raw=fs.readFileSync(new URL('../site/V0_ASSEMBLY_STAGES.json',import.meta.url)),catalog=JSON.parse(raw),sha=createHash('sha256').update(raw).digest('hex');
const oldSHAs=["ec0981b7f877eeb77d819cb483c0678e80d9829efe09a9e06f216dae0574da99","27928f876b6e05a46227c0e7f7e07b3513a55e8fec375f546c2c594068baa059","64ffe3c0359d11e1c1ff523cfc8eda6b63fb51a5ce7cba3b6c857112c2fcc3e8",'689e54096b54f6eeaaa9d5d96c6a735a8fc43391e6477ab0115bc9aeb8ba2a4e','1a72f36890af24c6f61f8ec86843bf77406ec2b5a13a207a7bc357ca8c7edc37','5b88dcdf6ca7690a9737781ce0f09f0aeb8405ea534a1701c37084797c11612e',"2baa9a7d9ea85ec661d6d9b59055a4a68b0ec436e54f96ab7d7019ef17dafaa5","50a7f0e504fa3a013607cc4e0bc8cb4ff49dc442cb2a5b16a5ac70d17e0c67dd", 'cac666a318dc56cdae843f4464e1cb63f33663002c93b4ebedaf6abb97f6e810','30115ff48261cbbdcb53c49a2e9b51d8c660a6554eed43ec305870ffe1739c8a'];
let positive=0,negative=0;
for(const[mid,machine]of Object.entries(catalog.machines)){
 const keys=machine.stages.flatMap(s=>s.part_keys),manifest={machine_id:mid,parts:keys.map(key=>({key,name:'Source-key fixture '+key}))},receipts={'model.glb':machine.model_sha256,'assembly_manifest.json':machine.manifest_sha256,'assembly_stages.json':sha},index=createAssemblyIndex({manifest,machine,receipts});
 const mount=index.stage('drives-install').part_keys[0],bearing=index.stage('a-drive-stack').part_keys[0];assert.equal(index.owner(mount).id,'drives-install');
 for(const oldSHA of oldSHAs)for(const version of [1,2]){
  const old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:oldSHA},current_stage:'a-drive-stack',checked_stages:['a-drive-stack','drives-install'],...(version===2?{checked_parts:[mount,bearing]}:{})};
  assert(assemblyProgressNeedsMigration(index,old.identity));
  const next=validateAssemblyProgress(index,old);assert(!next.checked_stages.includes("feet-inlet-prep"));assert(!next.checked_stages.includes("z-motor-mount"));assert(!next.checked_stages.includes("bed-mount-flatness"));assert(!next.checked_stages.includes("bed-mounts-rail"));assert.equal(next.identity.stages_sha256,sha);assert.equal(next.current_stage,old.current_stage);assert.deepEqual(next.checked_stages,old.checked_stages);assert.deepEqual(new Set(next.checked_parts),new Set(version===2?[mount,bearing]:[]));positive++;
  const doc=new TestDocument(),container=doc.createElement('section');doc.body.append(container);const legacy={};
  for(const name of ['select','previous','next','focus','note','manual','finish'])legacy[name]=doc.createElement(name==='select'?'select':'button');
  for(const s of index.stages){const option=doc.createElement('option');option.value=String(s.index);legacy.select.append(option)}
  const oldKey='3d-print-rig-assembly-progress-v'+version+':'+mid+':'+oldSHA,oldText=JSON.stringify(old),memory=new Map([[oldKey,oldText]]);let ui,calls=0;
  const state=i=>({index:i,visible_keys:[...index.stage(i).part_keys],added:index.stage(i).part_keys.length,visible_count:index.stage(i).part_keys.length,manual_text:'manual fixture'});
  ui=createAssemblyWorkbench({container,index,legacy,storage:{getItem:k=>memory.get(k),setItem:(k,v)=>memory.set(k,v)},format:id=>id,translate:v=>v,onStage:i=>{calls++;ui.update(state(i))},onFocusPart:()=>{},download:()=>{}});
  ui.activate();ui.update(state(ui.resumeIndex()));assert.equal(memory.get(oldKey),oldText,'Original browser record must remain byte-exact');assert.equal(JSON.parse(memory.get(assemblyProgressStorageKey(index))).identity.stages_sha256,sha);assert.match(container.querySelector('[role="status"]').textContent,/updated_manual/);assert.deepEqual(ui.snapshot(),next);positive++;
  const wrong=structuredClone(old);wrong.identity.manual_sha256='0'.repeat(64);const before=ui.snapshot(),beforeCalls=calls;assert.throws(()=>ui.importProgress(wrong),/another model/);assert.equal(calls,beforeCalls,'Reject before changing the current stage');assert.deepEqual(ui.snapshot(),before);negative++;
  ui.importProgress(old);assert.match(container.querySelector('[role="status"]').textContent,/updated_manual/);ui.dispose();positive++;
 }
 for(const version of [1,2]){
  const sourceKeys=['electronics-psu-voltage','electronics-mains-inlet-prewire','electronics-guard'].flatMap(id=>index.stage(id).part_keys),old={schema:'assembly-workbench-progress-v'+version,identity:{...index.identity,stages_sha256:oldSHAs[0]},current_stage:'electronics-psu',checked_stages:['head-install','electronics-fan','electronics-psu','electronics-mains','electronics-dc','electronics-guard'],...(version===2?{checked_parts:sourceKeys}:{})},next=validateAssemblyProgress(index,old);
  assert.equal(next.current_stage,'electronics-psu-voltage');assert.deepEqual(next.checked_stages,['head-install','electronics-fan']);assert.deepEqual(next.checked_parts,version===2?sourceKeys:[]);positive++;
 }
 const oldSHA=oldSHAs[0];const progress=createAssemblyProgress(index).snapshot();progress.identity.stages_sha256=oldSHA;progress.checked_parts=[mount];
 for(const mutate of [
  p=>p.identity.machine='another',p=>p.identity.model_sha256='0'.repeat(64),p=>p.identity.manifest_sha256='0'.repeat(64),p=>p.identity.manual_sha256='0'.repeat(64),p=>p.identity.manual_revision+=' stale',p=>p.identity.stages_sha256='0'.repeat(64),
  p=>p.identity.extra='unknown',p=>p.checked_parts.push(mount),p=>p.checked_parts=['missing'],p=>p.checked_parts=new Array(2),p=>p.current_stage='missing',
 ]){const p=structuredClone(progress);mutate(p);assert.throws(()=>validateAssemblyProgress(index,p));negative++}
 assert.equal(previousAssemblyProgressStorageKeys(index).length,oldSHAs.length*2);assert.deepEqual(previousAssemblyProgressStorageKeys({identity:{...index.identity,model_sha256:'0'.repeat(64)}}),[]);positive++;
}
console.log(JSON.stringify({passed:true,positive,negative,scope:'Exact two before/after V0 identities only, v1/v2 file and browser-storage migration, visible notice, unchanged old storage, source-part/stage preservation, no invented v1 part checks and atomic rejection before UI mutation. Not actual CAD/native-fit evidence.'}));
