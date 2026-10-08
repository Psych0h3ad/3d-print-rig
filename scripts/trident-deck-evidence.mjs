import fs from 'node:fs';import assert from 'node:assert/strict';import {createHash} from 'node:crypto';
const baseline='a79fe940bf766ba2323dc96defc4e1970e2722a8cc3ace381d66929449a1dee8',current='8bdbf3d8573dbcfd15ba5fd24d8d796562e266ebb8d2003e9754377856e8affa',proofHash='1043f2cc82a369e5c81ea0017ad743a032a84f2445b92ad89dd10ad619f3b28e';
const retained={'HEAD_VALIDATION.json':'307de76ad2fa77fd9f41c62269d8103aa760467f5651cc20a7a71438e99036ec','MOUNT_VALIDATION.json':'7abe5612128bafc9840587769556f26639b42334002da3906987cf5ec9d179d7','REAR_ENCLOSURE_QA.json':'6173dc68d5a22fd08fa179797698687e74e8afbe9680e8428053bca24f843f0f','STOCK_SKIRT_RETENTION_QA_92.json':'2265d22011d7cc08211292f775f56f88bc30888701df6b9a12a2d0f69b491505'};
const hash=b=>createHash('sha256').update(b).digest('hex');
// Retain the exact older native witnesses, with their original scope. The
// independently audited deck-only delta is a separate pinned witness.
export function nativeWitnessBundle(site,bundle,name){
 const file=new URL('TRIDENT_DECK_REPAIR_103.json',site);
 if(bundle.sha256!==current){assert(!fs.existsSync(file),'Repair proof belongs to another model bundle');return bundle.sha256}
 assert.equal(bundle.bytes,851019084);const raw=fs.readFileSync(file);assert.equal(hash(raw),proofHash);const p=JSON.parse(raw);assert.equal(p.schema,'trident-source-aperture-deck-103');assert.equal(p.model_bundle_sha256,current);assert.equal(p.baseline_bundle_sha256,baseline);assert.equal(p.whole_machine_certified,false);
 assert.deepEqual(p.retained_proof_sha256,retained);for(const[n,pin]of Object.entries(retained))assert.equal(hash(fs.readFileSync(new URL(n,site))),pin,n+' changed native witness');assert(Object.hasOwn(retained,name));
 assert.deepEqual(p.bundle_changed_paths,['machines/voron_trident_300/assembly_manifest.json','machines/voron_trident_300/model.glb.gz','machines/voron_trident_350/assembly_manifest.json','machines/voron_trident_350/model.glb.gz']);assert.equal(p.all_other_bundle_members_byte_identical,true);assert.equal(p.all_original_proof_bytes_preserved,true);
 return baseline;
}
