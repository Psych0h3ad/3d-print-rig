import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const id='fysetc_v24_250_pro',sha=b=>createHash('sha256').update(b).digest('hex');
// Minimal valid glTF fixture exercises the real loader verification sequence.
// It has no printer geometry and supplies no physical assembly evidence.
const bytes=Buffer.from(JSON.stringify({asset:{version:'2.0'},scenes:[{nodes:[0]}],scene:0,nodes:[{name:'fixture'}]}));
const manifest={machine_id:id,parts:[{key:'p1',group:'fixed'}],source:{commit:'fixture-only'}};
const profile={machine_id:id,source:{commit:'fixture-only'}};
const rig={machine_id:id,model_sha256:sha(bytes),part_count:1,groups:{head:['p1']},axes:{x:[0,10],y:[0,10],z:[0,10]},motions:{}};
let wrongModel=false,wrongMachine=false,failedJSON=false,revision='one';
const originalFetch=globalThis.fetch,originalLocation=globalThis.location;
globalThis.location={href:'https://fixture.invalid/viewer/kit-reference.html'};
globalThis.fetch=async input=>{
 const url=String(input);
 if(url.includes('ASSET_BUNDLE'))return new Response(JSON.stringify({encoding:'identity'}));
 if(url.includes('motion-profiles'))return new Response(JSON.stringify(rig));
 if(url.endsWith('model.glb'))return new Response(wrongModel?bytes.subarray(1):bytes);
 if(url.endsWith('assembly_manifest.json'))return new Response(JSON.stringify({...manifest,source:{commit:revision}}));
 if(url.endsWith('machine_profile.json'))return failedJSON?new Response('',{status:503}):new Response(JSON.stringify({...profile,machine_id:wrongMachine?'other':id}));
 throw Error('Unexpected fixture asset request: '+url);
};
try{
 const {loadKitReference}=await import('../site/viewer/kit-reference-loader.mjs');
 const loaded=await loadKitReference(id),identity=loaded.replay_asset_identity;
 assert.equal(identity.files[2].sha256,sha(bytes));assert.equal(identity.files[2].bytes,bytes.length);
 assert.equal(identity.files[2].verification,'loader-sha256');assert.equal(identity.files[0].verification,'observed-sha256');
 assert.equal(identity.files[1].verification,'observed-sha256');assert(loaded.profile.motion_registration);
 assert.equal(loaded.manifest.parts[0].group,'head');assert(identity.motion_registration_sha256);
 assert.deepEqual((await loadKitReference(id)).replay_asset_identity,identity);
 revision='two';assert.notDeepEqual((await loadKitReference(id)).replay_asset_identity,identity);
 wrongModel=true;await assert.rejects(loadKitReference(id),/Native model hash mismatch/);wrongModel=false;
 wrongMachine=true;await assert.rejects(loadKitReference(id),/Motion registration/);wrongMachine=false;
 failedJSON=true;await assert.rejects(loadKitReference(id),/Native machine profile unavailable/);
 await assert.rejects(loadKitReference('unregistered'),/Loaded printer asset identity is incomplete/);
}finally{globalThis.fetch=originalFetch;globalThis.location=originalLocation}
console.log('Kit reference real loader: verified model before parse, observed JSON byte hashes, effective native registration, source change replay mismatch, same-load identity, corrupt model/wrong profile/failed JSON/unregistered ID rejection passed.');
