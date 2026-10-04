import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {checkedExtraAsset,extraAssetBase} from '../site/viewer/extra-asset-integrity.mjs';
import {machineChoices,machinePage,machineOptions} from '../site/viewer/machines.js';
import {workspacePages} from '../site/viewer/workspace-navigation.mjs';
const index={base_url:'https://psych0h3ad.github.io/3d-print-rig-extra-models/',local_directory:'extra-assets'};
assert.equal(extraAssetBase(index,'http://127.0.0.1:8873/viewer/a.js').href,'http://127.0.0.1:8873/extra-assets/');
assert.equal(extraAssetBase(index,'https://psych0h3ad.github.io/3d-print-rig/viewer/a.js').href,index.base_url);
const bytes=new TextEncoder().encode('native geometry'),gzip=gzipSync(bytes),sha=data=>createHash('sha256').update(data).digest('hex'),base=new URL(index.base_url);
const spec={path:'machines/test/model.glb.gz',bytes:gzip.length,sha256:sha(gzip),encoding:'gzip',decoded_bytes:bytes.length,decoded_sha256:sha(bytes)},original=globalThis.fetch;
try{
 for(const data of [gzip,bytes]){globalThis.fetch=async()=>new Response(data);assert.deepEqual(await checkedExtraAsset(base,spec),bytes)}
 globalThis.fetch=async()=>new Response(bytes.slice(1));await assert.rejects(checkedExtraAsset(base,spec),/checksum/);
 globalThis.fetch=async()=>new Response(gzip);await assert.rejects(checkedExtraAsset(base,{...spec,decoded_sha256:'0'.repeat(64)}),/Decoded/);
 globalThis.fetch=async()=>new Response('',{status:503});await assert.rejects(checkedExtraAsset(base,spec),/503/);
 for(const path of ['../model.glb','/model.glb','https://elsewhere.test/model','folder\\model'])await assert.rejects(checkedExtraAsset(base,{...spec,path}),/Invalid/);
}finally{globalThis.fetch=original}
const remorph=machineChoices.find(r=>r.id==='remorph_beta1_307');assert(remorph&&remorph.size===307&&remorph.family==='remorph');assert.equal(machinePage(remorph.id),'./remorph.html');assert(workspacePages.has('remorph.html'));assert.deepEqual(machineOptions(remorph,'size'),[307]);
console.log('Additional machine assets: gzip/HTTP decoding, checksums, invalid records, grouped machine selection and workspace routing passed.');
