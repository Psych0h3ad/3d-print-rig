// Real production manifest validation, JSON only. No GLB/BIN/GPU/native loads.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import {createHash} from 'node:crypto';
import {registerHooks} from 'node:module';
import {sourceMetadataURL} from './source-metadata-input.mjs';
const base=new URL('../site/viewer/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const hooks=registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('vendor-r180/three.module.js',base).href,shortCircuit:true}:next(specifier,context);}});
const {validateChunkManifest}=await import('../site/viewer/source-assembly-runtime/chunk_loader.mjs');
const index=JSON.parse(fs.readFileSync(new URL('../SOURCE_ASSEMBLIES.json',base),'utf8'));
const record=index.models.find(r=>r.id==='rh3d_e3ng_v12_235');assert(record);
function pinned(ref){const bytes=fs.readFileSync(sourceMetadataURL(base,ref.url));assert.equal(bytes.length,ref.bytes);assert.equal(sha(bytes),ref.sha256);return JSON.parse(bytes);}
const packet=pinned(record.packet),manifest=pinned(packet.chunk_delivery.manifest);
assert.equal(packet.model.sha256,'1dad2900f881eec60fa16255c98628489443ea453086c79b7d0d6ac0e3e6bf3f');
assert.equal(packet.inventory.sha256,'1fb17bae60800458c27ba5ffcd57d4987508f0fda5cec757cade3af60ef7fcca');
assert.equal(manifest.source_faces_deleted,370328);
assert.equal(validateChunkManifest(manifest,packet),manifest);
let rejected=0;
function bad(change){const m=structuredClone(manifest),p=structuredClone(packet);change(m,p);assert.throws(()=>validateChunkManifest(m,p),/Chunk source identity mismatch/);rejected++;}
for(const faces of [0,1,370327,370329,'370328',null])bad(m=>m.source_faces_deleted=faces);
bad(m=>m.omitted_owner='another-owner');bad(m=>delete m.omitted_owner);
bad((m,p)=>{m.model_sha256=p.model.sha256='f'.repeat(64);});
bad(m=>m.model_sha256='f'.repeat(64));bad((m,p)=>p.model.sha256='f'.repeat(64));
bad((m,p)=>{m.source_inventory_sha256=p.inventory.sha256='e'.repeat(64);});
bad((m,p)=>{p.parts.pop();m.occurrences=p.parts.length;});
bad((m,p)=>{p.parts[0].key='BTT-original-full-controller-with-five-source-hole-derivative';});
bad((m,p)=>{p.parts[0].key=p.parts[1].key;});
bad(m=>m.normal_averaging=true);
// The old zero-deletion rule remains unchanged for other identities.
const otherM=structuredClone(manifest),otherP=structuredClone(packet);
otherM.model_sha256=otherP.model.sha256='d'.repeat(64);otherM.source_faces_deleted=0;delete otherM.omitted_owner;
assert.equal(validateChunkManifest(otherM,otherP),otherM);
otherM.source_faces_deleted=1;assert.throws(()=>validateChunkManifest(otherM,otherP),/Chunk source identity mismatch/);rejected++;
hooks.deregister();
console.log(JSON.stringify({passed:true,production_manifest_sha256:packet.chunk_delivery.manifest.sha256,model_sha256:packet.model.sha256,negative_cases:rejected,geometry_loaded:false,scope:'Production chunk-manifest validator on exact public508 JSON plus rejection fixtures; no actual geometry or fit validation.'}));
