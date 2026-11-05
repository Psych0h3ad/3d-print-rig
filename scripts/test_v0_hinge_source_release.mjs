import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
const viewer=new URL('../site/viewer/',import.meta.url),sha=b=>createHash('sha256').update(b).digest('hex');
const api=await import(new URL('v0-hinge-source-geometry.mjs',viewer)),metaFile=new URL('../site/modules/v0_hinge_source_tessellation.json',import.meta.url),packedFile=new URL('../site/modules/v0_hinge_source_tessellation.glb.gz',import.meta.url),metaBytes=await fs.readFile(metaFile),metadata=JSON.parse(metaBytes);
// Source CI deliberately contains no model bodies. Exact real GLTF parsing and
// buffer/transaction checks are mandatory in audit_v0_hinge_source_assets.mjs,
// both full-stage consumers and the native-installed actual-asset consumer.
assert.equal(api.v0HingeSourceMetadataSHA256,sha(metaBytes));assert.deepEqual(Object.keys(metadata.source_models).sort(),['voron_v02_120','voron_v02r1_120']);assert.match(metadata.model.sha256,/^[a-f0-9]{64}$/u);assert.equal(metadata.model.bytes,11861);
for(const [machine,source]of Object.entries(metadata.source_models)){assert.equal(source.parts.length,2);assert(source.model_decoded_sha256&&source.manifest_sha256&&source.profile_sha256);assert.equal(new Set(source.parts.map(p=>p.key)).size,2);assert.deepEqual(source.parts.map(p=>p.name),['M3x40 BHCS','M3x30 BHCS']);for(const p of source.parts){assert.equal(p.source.repository,'VoronDesign/Voron-0');assert.equal(p.preserve_original_material,true);assert.equal(p.original_geometry.NORMAL_absent,true);assert.equal(p.source.assembly_path[2],'Door Assembly:1')}}
const loader={parseAsync(){throw Error('Corrupt fixture must never reach GLTF parsing')}};let mode='missing',calls=0;
const fetchAsset=async url=>{calls++;const file=fileURLToPath(url);assert([fileURLToPath(metaFile),fileURLToPath(packedFile)].map(p=>path.resolve(p)).includes(path.resolve(file)));const isMeta=file.endsWith('.json');if(mode==='missing')return new Response('',{status:404});const bytes=isMeta?Uint8Array.from(metaBytes):new Uint8Array(metadata.model.bytes);if(mode==='metadata'&&isMeta)bytes[0]^=1;return new Response(bytes)};
for(const [value,expected]of [['missing',/HTTP 404|request failed|response failed|fetch failed|load failed|read failed|response is not OK|metadata|404/i],['metadata',/metadata hash differs/],['geometry',/compressed model hash differs/]]){mode=value;await assert.rejects(api.loadV0HingeSourceAsset(loader,{fetchAsset}),expected)}
const app=await fs.readFile(new URL('v0-app.js',viewer),'utf8'),layout=await fs.readFile(new URL('layout-v0-provider.mjs',viewer),'utf8');assert(app.includes('await workspaceTask(()=>applyV0HingeSourceGeometry('));assert(app.includes('guardV0HingeSourceGeometry(g.scene)'));assert(layout.includes('await applyV0HingeSourceGeometry('));assert(layout.includes('guardV0HingeSourceGeometry(gltf.scene)'));assert(layout.indexOf('await applyV0HingeSourceGeometry(')<layout.indexOf('const adapter=createV0Adapter('));
const release=await fs.readFile(new URL('./check_v0_assembly_release.py',import.meta.url),'utf8');assert(release.includes('audit_v0_hinge_source_assets.mjs'),'Actual geometry gate must be mandatory in the existing normal release driver');assert(release.includes("row['machines'][0]['hingeSource'] = hinge"));assert(release.includes("hinge.get('moving_source_leaves') != 10"));
for(const [consumer,target]of [['v0-app.js','v0-hinge-source-geometry.mjs'],['layout-v0-provider.mjs','v0-hinge-source-geometry.mjs'],['layout-v0-provider.mjs','v0-layout-source-identity.mjs'],['v0_adapter.mjs','v0-door.mjs']]){
 const text=await fs.readFile(new URL(consumer,viewer),'utf8'),body=await fs.readFile(new URL(target,viewer),'utf8'),tag=text.split('./'+target+'?v=')[1]?.slice(0,20);
 assert.equal(tag,sha(body.replaceAll('\r\n','\n')).slice(0,20),'Current source dependency must invalidate its consumer cache: '+consumer+' -> '+target);
}
const build=await fs.readFile(new URL('./build_site.py',import.meta.url),'utf8');assert(build.includes('scripts/check_v0_assembly_release.py'),'Normal build must retain the required V0 driver');
for(const file of ['audit_v0_assembly_assets.mjs','audit_v0_native_installation_assets.mjs']){const code=await fs.readFile(new URL(file,import.meta.url),'utf8');assert(code.includes('applyBuiltV0HingeGeometry({'),'Existing real-asset consumers must apply the same geometry before their adapters')}
const nativeDriver=await fs.readFile(new URL('./check_v0_native_assets_release.py',import.meta.url),'utf8');assert(nativeDriver.includes("report.get('hinge_source_representation'"));
assert.equal(sha(await fs.readFile(metaFile)),sha(metaBytes));
console.log(`V0 source hinge release: mandatory metadata/model pins, three source-only reject controls, ${calls} transport requests and app/Layout/normal-release integration. Real GLTF and native fit remain separate required audits.`);
