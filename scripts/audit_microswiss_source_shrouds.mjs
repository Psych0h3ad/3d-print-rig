// Exact exported references through the production external-component loader.
import fs from 'node:fs';import path from 'node:path';import assert from 'node:assert/strict';
import{createHash}from'node:crypto';import{fileURLToPath}from'node:url';import{Readable}from'node:stream';
import{GLTFLoader}from'../site/viewer/vendor/GLTFLoader.js';
import{loadExternalComponent}from'../site/viewer/component-assets.mjs';
import{partKey}from'../site/viewer/head-assembly.js';
import{createSourceShroudPalette,sourceShroud}from'../site/viewer/microswiss-source-shroud-palette.mjs';
import{references}from'./microswiss-reference-contract.mjs';
const args=Object.fromEntries(process.argv.slice(2).reduce((a,v,i,all)=>i%2?a:[...a,[v.slice(2),all[i+1]]],[]));
assert(args.site&&args.report,'--site and --report required');const site=path.resolve(args.site);
const repo=fileURLToPath(new URL('../',import.meta.url)),hash=b=>createHash('sha256').update(b).digest('hex');
const catalog=JSON.parse(fs.readFileSync(path.join(site,'COMPONENT_LIBRARY.json'))),delivery=JSON.parse(fs.readFileSync(path.join(site,'APPROVED_DELIVERY.json')));
const expected=new Map(delivery.files.map(r=>[r.path,r])),requests=[],results=[],negative=[];
const sourceFiles=['site/viewer/components.js','site/viewer/component-assets.mjs','site/viewer/head-assembly.js','site/viewer/microswiss-source-shroud-palette.mjs','scripts/microswiss-reference-contract.mjs'];
const sourcePins=Object.fromEntries(sourceFiles.map(n=>[n,hash(fs.readFileSync(path.join(repo,n)))]));
const actualFetch=globalThis.fetch;globalThis.self=globalThis;
globalThis.ProgressEvent??=class{constructor(type,value){Object.assign(this,{type},value)}};
globalThis.fetch=async input=>{
 const raw=String(input instanceof Request?input.url:input);if(raw.startsWith('blob:')||raw.startsWith('data:'))return actualFetch(input);
 const url=new URL(raw);assert.equal(url.origin,'http://127.0.0.1:7777','Unregistered external input');
 const rel=decodeURIComponent(url.pathname.slice(1)),pin=expected.get(rel);assert(pin,'Missing approved model '+rel);
 const file=path.join(site,rel),bytes=fs.readFileSync(file);assert.equal(bytes.length,pin.bytes,rel);assert.equal(hash(bytes),pin.sha256,rel);
 requests.push({path:rel,sha256:pin.sha256,bytes:pin.bytes});return new Response(Readable.toWeb(fs.createReadStream(file)),{headers:{'Content-Length':String(bytes.length)}});
};
function snapshot(root){const rows=[];root.updateMatrixWorld(true);root.traverse(n=>{if(!n.isMesh)return;
 rows.push({key:partKey(n),matrix:[...n.matrixWorld.elements],attributes:Object.fromEntries(Object.entries(n.geometry.attributes).map(([k,a])=>[k,hash(Buffer.from((a.isInterleavedBufferAttribute?a.data.array:a.array).buffer,(a.isInterleavedBufferAttribute?a.data.array:a.array).byteOffset,(a.isInterleavedBufferAttribute?a.data.array:a.array).byteLength))])),index:n.geometry.index?hash(Buffer.from(n.geometry.index.array.buffer,n.geometry.index.array.byteOffset,n.geometry.index.array.byteLength)):null,
 materials:[].concat(n.material).map(m=>({color:m.color.getHexString(),metalness:m.metalness,roughness:m.roughness,opacity:m.opacity}))});});return rows;}
assert.deepEqual(catalog.items.filter(r=>r.id.startsWith('microswiss_')).map(r=>r.id).sort(),references.map(r=>r.id).sort());
for(const r of references){
 const item=catalog.items.find(x=>x.id===r.id),spec=catalog.assets[item.module];assert.equal(item.source_sha256,r.source_sha256);
 assert.equal(spec.files['model.glb'].sha256,r.compressed_model_sha256);assert.equal(spec.files['model.glb'].decoded_sha256,r.decoded_model_sha256);assert.equal(spec.files['parts.json'].sha256,r.metadata_sha256);
 const loaded=await loadExternalComponent(new GLTFLoader(),spec,'http://127.0.0.1:7777/viewer/components.html');
 assert.equal(loaded.meta.source_sha256,r.source_sha256);assert.equal(loaded.meta.parts.length,r.parts);
 const root=loaded.gltf.scene,initial=snapshot(root);assert(initial.length>0);assert(initial.every(x=>x.matrix.every(Number.isFinite)));
 const adapter=createSourceShroudPalette(root,loaded.meta,partKey);let palettes=0;
 if(r.printed_shroud_key){assert.equal(adapter.key,r.printed_shroud_key);assert(initial.some(x=>x.key===adapter.key));
  for(const color of ['#ffd400','#0044ff','#ffd400']){adapter.setPalette({base:color});const current=snapshot(root);assert.equal(current.length,initial.length);
   for(let i=0;i<initial.length;i++){for(const key of ['matrix','attributes','index'])assert.deepEqual(current[i][key],initial[i][key]);
    if(current[i].key===adapter.key)for(const mat of current[i].materials)assert.equal(mat.color,color.slice(1));else assert.deepEqual(current[i].materials,initial[i].materials,'Purchased material recolored');}palettes++;}
  adapter.resetSource();assert.deepEqual(snapshot(root),initial,'Native material reset');
  for(const[name,mutate]of[['native_role',p=>p.role=null],['source_revision',p=>p.source_sha256='0'.repeat(64)],['source_path',p=>p.source_path_sha256='0'.repeat(64)]]){
   const bad=structuredClone(loaded.meta);mutate(bad.parts.find(x=>String(x.key)===r.printed_shroud_key));assert.throws(()=>sourceShroud(bad));negative.push({id:r.id,case:name,rejected:true});}
  const duplicate=structuredClone(loaded.meta);duplicate.parts.push(structuredClone(duplicate.parts.find(x=>String(x.key)===r.printed_shroud_key)));assert.throws(()=>sourceShroud(duplicate));negative.push({id:r.id,case:'duplicate_source_id',rejected:true});
  adapter.dispose();
 }else{assert.equal(adapter,null);assert.deepEqual(snapshot(root),initial);}
 results.push({id:r.id,decoded_model_sha256:r.decoded_model_sha256,metadata_sha256:r.metadata_sha256,actual_meshes:initial.length,printed_key:adapter?.key??null,palette_A_B_A:palettes,geometry_indices_normals_transforms_purchased_materials_unchanged:true,source_reset:true});
 root.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of[].concat(n.material))m.dispose()}});if(global.gc)global.gc();
}
for(const[name,pin]of Object.entries(sourcePins))assert.equal(hash(fs.readFileSync(path.join(repo,name))),pin,'Source changed during audit');
const report={schema:'actual-six-microswiss-source-role-release-v1',passed:true,results,negative,requests,source_code_sha256:sourcePins,experimental_fan_variants:0,native_fit_claim:false,browser_GPU_claim:false,
 scope:'Actual complete six manufacturer-reference exports via production loader, exact source identities, two printed shrouds, A-B-A, native reset and purchased-material protection. Four universal references have no shroud or cooling fans.'};
fs.mkdirSync(path.dirname(args.report),{recursive:true});fs.writeFileSync(args.report,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:true,models:results.length,source_negative_cases:negative.length}));
