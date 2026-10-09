import fs from 'node:fs';import crypto from 'node:crypto';import assert from 'node:assert/strict';
import {nativeDeckEvidenceSource as source,nativeWitnessInputs} from '../site/viewer/native-evidence-bridge.mjs';
import {acceptedHeadValidation} from '../site/viewer/head-validation.mjs';
import {acceptedMountValidation} from '../site/viewer/mount-validation.mjs';
const read=n=>JSON.parse(fs.readFileSync(new URL('../site/'+n,import.meta.url),'utf8'));
const sha=n=>crypto.createHash('sha256').update(fs.readFileSync(new URL('../site/'+n,import.meta.url))).digest('hex');
const proof=read(source.file),head=read('HEAD_VALIDATION.json'),mount=read('MOUNT_VALIDATION.json'),bundle=read('ASSET_BUNDLE.json');
const pins=(e,m,n)=>{
 const hashes={...e.input_sha256,...e.machines[m].input_sha256,[n]:sha(n),[source.file]:sha(source.file)};
 for(const r of proof.machines)if(['voron_trident_300','voron_trident_350'].includes(r.machine_id)){
  const key=`machines/${r.machine_id}/assembly_manifest.json`;if(key in hashes)hashes[key]=r.after_files['assembly_manifest.json'].sha256;
 }
 return hashes;
};
let positives=0,negatives=0;
for(const [name,e,accept]of [['HEAD_VALIDATION.json',head,acceptedHeadValidation],['MOUNT_VALIDATION.json',mount,acceptedMountValidation]]){
 for(const machine of Object.keys(e.machines)){
  const hashes=pins(e,machine,name),before=JSON.stringify(e),inputs=nativeWitnessInputs(e,hashes,bundle,machine,name,proof);
  assert(inputs?.retained,machine+' missing exact source bridge');
  const result=accept(e,inputs.hashes,inputs.bundle,machine);assert.equal(result?.machine,machine);
  assert.equal(accept(e,hashes,bundle,machine),null,'A new bundle must not silently match an old witness');
  assert.equal(JSON.stringify(e),before,'Retain original negative findings and qualifications');
  assert.equal(inputs.bundle.sha256,source.baseline);assert.equal(bundle.sha256,source.current);
  assert.match(inputs.scope,/Changed deck clearance.*unqualified/);positives++;
 }
}
const machine='voron_trident_350',name='HEAD_VALIDATION.json',hashes=pins(head,machine,name);
for(const change of [
 a=>a.proof=null,
 a=>a.hashes[source.file]='0'.repeat(64),
 a=>a.hashes[name]='0'.repeat(64),
 a=>a.bundle.sha256='0'.repeat(64),
 a=>a.bundle.bytes++,
 a=>a.proof.all_other_bundle_members_byte_identical=false,
 a=>a.proof.all_original_proof_bytes_preserved=false,
 a=>a.proof.whole_machine_certified=true,
 a=>a.proof.bundle_changed_paths.push('another.glb'),
 a=>a.proof.machines[0].part_key='another-part',
 a=>a.proof.machines[0].all_original_binary_bytes_preserved=false,
 a=>a.proof.machines[0].after_files['machine_profile.json'].sha256='0'.repeat(64),
 a=>a.hashes['machines/voron_trident_350/assembly_manifest.json']='0'.repeat(64),
 a=>a.hashes[Object.keys(head.input_sha256)[0]]='0'.repeat(64),
 a=>a.head.machines[machine].bank_records=[{fixture_part:'voron_trident_350_base_1188'}],
 a=>a.head.machines[machine].input_sha256[Object.keys(head.input_sha256)[0]]='0'.repeat(64),
 a=>a.machine='unregistered'
]){
 const a={proof:structuredClone(proof),hashes:{...hashes},bundle:{...bundle},head:structuredClone(head),machine};change(a);
 assert.equal(nativeWitnessInputs(a.head,a.hashes,a.bundle,a.machine,name,a.proof),null);negatives++;
}
assert.equal(nativeWitnessInputs(head,hashes,bundle,machine,'unknown.json',proof),null);
console.log(JSON.stringify({original_native_bindings_restored:positives,rejected_changes:negatives+1,altered_deck_native_fit_certified:false,old_reports_modified:false}));
