import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {loadedPrinterAssetIdentity} from '../site/viewer/gcode-loaded-asset-identity.mjs';
// Explicit checksum fixtures, not physical printer assets.
const H=n=>String(n).repeat(64),machine='fixture',names=['assembly_manifest.json','machine_profile.json','model.glb','extra.glb'];
const spec={machine_id:machine,additional_models:['extra.glb'],files:Object.fromEntries(names.map((name,i)=>[name,{path:name,bytes:3,sha256:H(i+1)}]))};
spec.files['model.glb']={path:'model.glb.gz',bytes:5,sha256:H(5),encoding:'gzip',decoded_sha256:H(6),decoded_bytes:3};
const manifest={machine_id:machine,parts:[{key:'1',group:'head'}]};
const profile={machine_id:machine,source:{repository:'fixture-only',revision:'old'},axes:{x:[0,10],y:[0,10],z:[0,10]},motion_registration:{machine_id:machine,model_sha256:H(6),groups:{head:['1']}}};
const args={machine,spec,manifest,profile,checkedFileNames:names};
const identity=await loadedPrinterAssetIdentity(args);
assert.deepEqual(JSON.parse(JSON.stringify(identity)),identity);
assert(Object.isFrozen(identity)&&Object.isFrozen(identity.files)&&Object.isFrozen(identity.files[0])&&Object.isFrozen(identity.source));
assert.equal(identity.files[2].decoded_sha256,H(6));assert.equal(identity.files[2].sha256,H(5));
assert.equal(identity.files[1].sha256,H(2));assert.equal(identity.files[3].sha256,H(4));
assert.equal(identity.effective_manifest_sha256,createHash('sha256').update('{"machine_id":"fixture","parts":[{"group":"head","key":"1"}]}').digest('hex'));
assert.deepEqual(await loadedPrinterAssetIdentity({...args,profile:{motion_registration:profile.motion_registration,axes:profile.axes,source:profile.source,machine_id:machine}}),identity);
for(const mutate of [
 a=>a.spec.files['model.glb'].decoded_sha256=H(7),
 a=>a.spec.files['machine_profile.json'].sha256=H(7),
 a=>a.spec.files['assembly_manifest.json'].sha256=H(7),
 a=>a.spec.files['extra.glb'].decoded_sha256=H(7),
 a=>a.spec.files['extra.glb'].sha256=H(7),
 a=>a.profile.source.revision='new',
 a=>a.profile.motion_registration.groups.head=['2'],
 a=>a.profile.axes.x=[0,11],
 a=>a.manifest.parts[0].group='bed',
]){
 const changed=structuredClone(args);mutate(changed);const actual=await loadedPrinterAssetIdentity(changed);
 if(changed.spec.files['extra.glb'].decoded_sha256===H(7)&&changed.spec.files['extra.glb'].sha256===H(4))assert.deepEqual(actual,identity); // Unknown raw-decoding metadata is not used for identity assets.
 else assert.notDeepEqual(actual,identity,'Content/source changes must invalidate saved replay context, even with the same machine/config IDs');
}
for(const mutate of [a=>a.machine='other',a=>a.checkedFileNames.pop(),a=>a.spec.files['model.glb'].decoded_sha256='bad',a=>delete a.spec.files['machine_profile.json'],a=>delete a.profile.source]){
 const invalid=structuredClone(args);mutate(invalid);await assert.rejects(loadedPrinterAssetIdentity(invalid),/Loaded printer asset identity is incomplete/);
}
console.log('Loaded replay identity: checked model/extra-model pins, raw/effective profile and manifest, source revision, motion registration, stable serialization, immutable capture and incomplete identities passed. No native fit or replay authentication claim.');
