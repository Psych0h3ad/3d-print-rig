import fs from 'node:fs/promises';
import assert from 'node:assert/strict';
import {nativeWitnessBundle} from './trident-deck-evidence.mjs';
import {mkdtempSync,mkdirSync,writeFileSync,rmSync} from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {machineReviewInputs} from './machine_review_inputs.mjs';

const site=new URL('../site/',import.meta.url);
const read=async name=>JSON.parse(await fs.readFile(new URL(name,site),'utf8'));
const bundle=await read('ASSET_BUNDLE.json');
for(const name of ['HEAD_VALIDATION.json','MOUNT_VALIDATION.json']){
 const evidence=await read(name);
 assert.equal(evidence.model_bundle_sha256,nativeWitnessBundle(site,bundle,name),
  name+': native evidence belongs to an older bundle. Revalidate the tested geometry before retaining it.');
}
console.log('Pinned original mounting witnesses retained; exact deck-only repair has separate source evidence.');

// Old model hashes cannot keep a release green after its audit code changes.
// Exercise changed/new/deleted producers and the build workflow independently
// of the production snapshot, including canonical source-newline handling.
const root=mkdtempSync(path.join(os.tmpdir(),'rig-review-inputs-'));
assert.equal(path.dirname(path.resolve(root)),path.resolve(os.tmpdir()));
try{
 for(const directory of ['site/viewer/vendor','scripts/fixtures','.github/workflows'])mkdirSync(path.join(root,directory),{recursive:true});
 const files={
  'site/viewer/adapter.mjs':'export const axis="Z";\n',
  'site/viewer/vendor/three.module.js':'export const rendererRevision="fixture";\n',
  'site/MACHINES.json':'{"machines":["fixture"]}\n',
  'scripts/audit_actual.mjs':'inspectNativeParts();\n',
  'scripts/check_repository.py':'check()\n',
  'scripts/three-test-loader.mjs':'loadActualCode();\n',
  'scripts/fixtures/native-ports.json':'{"seat":"source-fixture"}\n',
  '.github/workflows/pages.yml':'steps:\n  - run: actual_audit\n',
 };
 for(const [name,data]of Object.entries(files))writeFileSync(path.join(root,name),data);
 const baseline=machineReviewInputs(root);
 assert.deepEqual(Object.keys(baseline).sort(),Object.keys(files).sort());
 for(const [name,data]of Object.entries(files)){
  writeFileSync(path.join(root,name),data+'changed\n');
  assert.notDeepEqual(machineReviewInputs(root),baseline,'Stale review accepted changed '+name);
  writeFileSync(path.join(root,name),data.replaceAll('\n','\r\n'));
  assert.deepEqual(machineReviewInputs(root),baseline,'Canonical source newlines changed review identities');
  writeFileSync(path.join(root,name),data);
 }
 const added=path.join(root,'scripts/audit_new.mjs');writeFileSync(added,'newRequiredCheck();\n');
 assert.notDeepEqual(machineReviewInputs(root),baseline,'New required audit omitted');rmSync(added);
 rmSync(path.join(root,'scripts/audit_actual.mjs'));
 assert.notDeepEqual(machineReviewInputs(root),baseline,'Removed actual audit omitted');
 rmSync(path.join(root,'.github/workflows'),{recursive:true});
 assert.throws(()=>machineReviewInputs(root),/ENOENT/,'Missing build gates must fail closed');
}finally{rmSync(root,{recursive:true,force:true});}
console.log('Changed, added or removed audit/build code invalidates release coverage.');
const motionAudit=await fs.readFile(new URL('./check_motion_assets.mjs',import.meta.url),'utf8');
for(const name of ['auditRearEnclosures','auditMicronColors'])
 assert(motionAudit.includes(`await ${name}(root,`),name+' must execute against the current actual release assets');
