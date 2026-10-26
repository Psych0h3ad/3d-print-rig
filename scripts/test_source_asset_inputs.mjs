import assert from 'node:assert/strict';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gzipSync} from 'node:zlib';
import {validateSourceInputMap,sourceAssetLocation,auditSourceAssetReferences} from './source-asset-input.mjs';
import {decodeRegisteredAsset} from './check_workbench_assets.mjs';
const root=path.resolve('fixture-site'),local=path.resolve('fixture-inputs/chunk.bin');
const mapping=validateSourceInputMap({files:{'assets-repo/source/chunk.bin':local}});
assert.deepEqual(sourceAssetLocation(root,'/assets-repo/source/chunk.bin',mapping),{relative:'assets-repo/source/chunk.bin',file:local});
assert.deepEqual(sourceAssetLocation(root,'../source-assembly-assets/packet.json'),{relative:'source-assembly-assets/packet.json',file:null});
assert.throws(()=>sourceAssetLocation(root,'/assets-repo/source/missing.bin',mapping),/Missing exact/);
for(const url of ['//remote/model','https://remote/model','../../escape','/assets-repo/../chunk.bin','/assets-repo/%2e%2e/chunk.bin','/assets-repo/chunk.bin?q=1','C:\\model.bin'])assert.throws(()=>sourceAssetLocation(root,url,mapping));
for(const files of [{'../escape':local},{'assets-repo/chunk.bin':'relative.bin'},{'/assets-repo/chunk.bin':local}])assert.throws(()=>validateSourceInputMap({files}));
const sha=raw=>createHash('sha256').update(raw).digest('hex');
function fixture({publicInventory=false,both=false,parts=3}={}){
 const bodies=new Map(),store=(url,raw)=>{bodies.set(url,raw);return {url,bytes:raw.length,sha256:sha(raw)};};
 const json=(url,value)=>store(url,Buffer.from(JSON.stringify(value)));
 const a=Buffer.from('abc'),b=Buffer.from('defg'),keys=Array.from({length:parts},(_,i)=>({key:'owner-'+i}));
 const model={sha256:'a'.repeat(64),bytes:123};
 const inventory=publicInventory?{schema:'public-source-assembly-inventory-v1',id:'source-fixture',source_geometry_model_sha256:model.sha256,parts:structuredClone(keys)}:{schema:'source-assembly-inventory-v1',model,part_count:parts,parts:structuredClone(keys)};
 const c0={ordinal:0,start:0,bytes:a.length,sha256:sha(a),gzip:store('/assets-repo/first.bin.gz',gzipSync(a))};
 if(both)c0.url=store('/assets-repo/first.bin',a).url;
 const c1={ordinal:1,start:a.length,...store('/assets-repo/second.bin',b)};
 const manifest={schema:'priority-exact-source-chunks-134-v1',model_sha256:model.sha256,model_bytes:model.bytes,occurrences:parts,all_BIN_bytes_preserved:true,geometry_bytes:a.length+b.length,document:{buffers:[{byteLength:a.length+b.length}]},chunks:[c0,c1]};
 const packet={id:'source-fixture',default_variant:'default',model,parts:keys,inventory:json('/assets-repo/inventory.json',inventory),chunk_delivery:{model_sha256:model.sha256,chunk_count:2,manifest:json('/assets-repo/manifest.json',manifest)}};
 const record={assembly_id:packet.id,configuration:'default',model_sha256:model.sha256,packet:json('../source-assembly-assets/packet.json',packet)};
 const checked=[],check=async ref=>{const raw=bodies.get(ref.url);assert(raw,'Missing fixture body: '+ref.url);const decoded=decodeRegisteredAsset(raw,ref,ref.url);checked.push(ref.url);return {json:ref.url.endsWith('.json')?JSON.parse(decoded):null};};
 function update(kind,change){const obj={packet,manifest,inventory}[kind];change(obj);if(kind==='manifest')packet.chunk_delivery.manifest=json('/assets-repo/manifest.json',manifest);if(kind==='inventory')packet.inventory=json('/assets-repo/inventory.json',inventory);record.packet=json(record.packet.url,packet);}
 return {bodies,record,packet,manifest,inventory,checked,check,update};
}
let passed=0;
for(const options of [{},{publicInventory:true},{both:true},{parts:4}]){
 const f=fixture(options),report=await auditSourceAssetReferences(f.record,f.check);
 assert.equal(report.packet.parts.length,options.parts??3);assert.deepEqual(report.transport_counts,{gzip:1,raw:options.both?2:1});assert.equal(f.checked.length,options.both?6:5);passed++;
}
async function rejects(mut,pattern){const f=fixture({both:true});mut(f);await assert.rejects(()=>auditSourceAssetReferences(f.record,f.check),pattern);passed++;}
await rejects(f=>f.bodies.delete('/assets-repo/second.bin'),/Missing fixture/);
await rejects(f=>f.bodies.set('/assets-repo/first.bin.gz',Buffer.from('bad')),/Asset byte count/);
await rejects(f=>f.bodies.set('/assets-repo/inventory.json',Buffer.from('bad')),/Asset byte count/);
await rejects(f=>f.update('manifest',m=>m.chunks[1].start++));
await rejects(f=>f.update('manifest',m=>m.chunks[0].sha256='0'.repeat(64)));
await rejects(f=>f.update('manifest',m=>{delete m.chunks[1].url;}),/Missing approved/);
await rejects(f=>f.update('manifest',m=>m.schema='future'),/Unknown source chunk schema/);
await rejects(f=>f.update('inventory',i=>i.schema='future'),/Unknown source inventory schema/);
await rejects(f=>f.update('inventory',i=>i.parts[0]={key:'wrong'}),/owner mismatch/);
await rejects(f=>f.update('inventory',i=>i.model={...i.model,sha256:'0'.repeat(64)}));
await rejects(f=>f.update('packet',p=>p.chunk_delivery.chunk_count++));
console.log(JSON.stringify({passed:true,fixture_cases:passed,scope:'Synthetic metadata and tiny gzip/raw bytes; exact mapping, both transports, inventory identity, corruption and missing-input rejection. No exported geometry or physical-fit claim.'}));
