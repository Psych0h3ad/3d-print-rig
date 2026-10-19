import assert from 'node:assert/strict';
import fs from 'node:fs';
import {registerHooks} from 'node:module';
import {headSubsetPlan} from '../site/viewer/source-assembly-runtime/head_subset.mjs';
import {initialState,validateState} from '../site/viewer/source-assembly-runtime/state.mjs';
import {sourceControlBounds} from '../site/viewer/source-control-bounds.mjs';
const base=new URL('../site/viewer/',import.meta.url),read=url=>JSON.parse(fs.readFileSync(url,'utf8'));
registerHooks({resolve(specifier,context,next){return specifier==='three'?{url:new URL('vendor-r180/three.module.js',base).href,shortCircuit:true}:next(specifier,context);}});
const {selectedSourcePacket}=await import('../site/viewer/source-assembly-loader.mjs');
for(const record of read(new URL('../SOURCE_ASSEMBLIES.json',base)).models){
 const packet=read(new URL(record.packet.url,base)),manifest=read(new URL(packet.chunk_delivery.manifest.url,base));
 const plan=headSubsetPlan(packet,manifest,packet.public_head_keys),head=selectedSourcePacket(packet,plan),state=initialState(head);
 assert(head.parts.length>100);assert.equal(head.parts.length,new Set(packet.public_head_keys).size);assert(head.head_only_subset);
 for(const key of ['source_preview_limits6','source_fixed_Z_anchors5','private_source_motion172','source_fixed_XY309','source_drive304','source_loom306'])assert.equal(head[key],undefined,key+' unavailable on a head-only view');
 validateState(state,head);for(const axis of 'xyz')assert.deepEqual(sourceControlBounds(head,state,axis),{min:0,max:0});
 assert.equal(packet.parts.length,record.id.includes('virtu')?662:416,'Full packet untouched');
 if(packet.source_preview_limits6){
  const full=initialState(packet);for(const axis of 'xyz'){const bounds=sourceControlBounds(packet,full,axis);assert(bounds.max>bounds.min);}
  const bad=structuredClone(packet);bad.source_preview_limits6.model_sha256='0'.repeat(64);assert.throws(()=>sourceControlBounds(bad,full,'x'),/binding changed/,'Full-machine revision guard retained');
 }
}
console.log('Actual source head subsets + production control bounds pass; full-machine motion revision guards retained.');
