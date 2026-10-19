// Actual authenticated evidence through the production loader. Synthetic
// successful HEAD/MOUNT files cannot stand in for the pinned native witnesses.
import assert from 'node:assert/strict';import fs from 'node:fs';import path from 'node:path';
import {createHash,webcrypto} from 'node:crypto';import {register} from 'node:module';import{fileURLToPath}from'node:url';
register('./three-test-loader.mjs',import.meta.url);globalThis.crypto??=webcrypto;
const site=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'../site'),machine='voron_v24_250_printed';
const sha=b=>createHash('sha256').update(b).digest('hex'),body=n=>fs.readFileSync(path.join(site,n)),read=n=>JSON.parse(body(n));
const head=read('HEAD_VALIDATION.json'),mount=read('MOUNT_VALIDATION.json'),before=[sha(body('HEAD_VALIDATION.json')),sha(body('MOUNT_VALIDATION.json'))];
const pins=e=>({...e.input_sha256,...e.machines[machine].input_sha256}),hp=pins(head),mp=pins(mount);
let missing=null,tamper=null;const fetched=new Set();
globalThis.fetch=async input=>{
 const u=new URL(String(input.url||input),'https://fixture.invalid/viewer/');
 const name=u.protocol==='file:'?u.pathname.split('/site/').at(-1):u.pathname.replace(/^\//,'');fetched.add(name);
 if(name===missing)return new Response('',{status:404});
 try{let b=body(name);if(name===tamper)b=Buffer.concat([b,Buffer.from(' ')]);return new Response(b)}catch{return new Response('',{status:404})}
};
const {loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
async function positive(){
 fetched.clear();const {registry}=await loadMachineHeadCatalog(machine);
 assert.equal(registry.head_witness_validation?.machine,machine);assert.equal(registry.probe_travel_validation?.machine,machine);
 assert.equal(registry.head_witness_validation.revision,head.revision);assert.deepEqual(registry.head_witness_validation.placements,head.placements);
 assert.deepEqual(registry.probe_travel_validation.records,mount.machines[machine].records);
 for(const name of new Set([...Object.keys(hp),...Object.keys(mp)]))assert(fetched.has(name),'Production root/target input not fetched: '+name);
}
async function negative(name,mode){
 missing=mode==='missing'?name:null;tamper=mode==='tamper'?name:null;fetched.clear();let registry,error;
 try{registry=(await loadMachineHeadCatalog(machine)).registry}catch(e){error=e}
 if(error)assert.match(error.message,/^(?:ヘッドの取付データを取得できません|Trinity alpha raw native registry identity mismatch)$/);
 else{
  if(name in hp)assert.equal(registry.head_witness_validation,null,name+' '+mode+' HEAD accepted');
  else assert.equal(registry.head_witness_validation?.machine,machine,'Unaffected HEAD lost');
  if(name in mp)assert.equal(registry.probe_travel_validation,null,name+' '+mode+' MOUNT accepted');
  else assert.equal(registry.probe_travel_validation?.machine,machine,'Unaffected MOUNT lost');
 }
 assert(fetched.has(name),'Missing production fetch '+name);missing=null;tamper=null;
}
await positive();globalThis.gc?.();let controls=0;
for(const name of new Set([...Object.keys(hp),...Object.keys(mp)]))for(const mode of ['missing','tamper']){await negative(name,mode);globalThis.gc?.();await positive();globalThis.gc?.();controls++}
assert.deepEqual([sha(body('HEAD_VALIDATION.json')),sha(body('MOUNT_VALIDATION.json'))],before);
console.log(JSON.stringify({passed:true,actual_machine:machine,missing_or_tampered_root_and_target_controls:controls,original_proof_bytes_unchanged:true,synthetic_native_identity_exceptions:false}));
