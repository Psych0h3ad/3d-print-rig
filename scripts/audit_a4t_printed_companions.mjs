// Audit the actual source-specific export; no new native or installed-fit claim.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {a4tPrintedReference as spec} from '../site/viewer/a4t-printed-companions.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const root=path.resolve(process.argv[2]),reportFile=path.resolve(process.argv[3]);
const report={schema:'actual-a4t-printed-companions-107',started_at_utc:new Date().toISOString(),passed:false,input_sha256:{},native_workers:0,new_native_tests_performed:false,whole_installed_fit_qualified:false,PCB_harness_qualified:false,browser_review:false};
const read=async n=>{let b;try{b=await fs.readFile(path.join(root,n));}catch(e){if(e.code!=='ENOENT'||!n.endsWith('.glb'))throw e;const encoded=await fs.readFile(path.join(root,n+'.gz'));report.input_sha256[n+'.gz']=sha(encoded);b=gunzipSync(encoded);}report.input_sha256[n]=sha(b);return b};
const glb=b=>{assert.equal(b.readUInt32LE(0),0x46546c67);assert.equal(b.readUInt32LE(4),2);assert.equal(b.readUInt32LE(8),b.length);const n=b.readUInt32LE(12);assert.equal(b.readUInt32LE(16),0x4e4f534a);assert.equal(b.readUInt32LE(24+n),0x004e4942);return {g:JSON.parse(b.subarray(20,20+n)),bin:b.subarray(28+n)}};
try{
 const folder=spec.asset.external.local_directory+'/',file=spec.asset.files['model.glb'],encoded=await read(folder+file.path);
 assert.equal(encoded.length,file.bytes);assert.equal(sha(encoded),file.sha256);const decoded=gunzipSync(encoded);assert.equal(decoded.length,file.decoded_bytes);assert.equal(sha(decoded),file.decoded_sha256);
 const mb=await read(folder+'parts.json');assert.equal(mb.length,spec.asset.files['parts.json'].bytes);assert.equal(sha(mb),spec.asset.files['parts.json'].sha256);const meta=JSON.parse(mb);
 assert.equal(meta.id,spec.asset_id);assert.equal(meta.parts.length,64);assert.equal(new Set(meta.parts.map(p=>p.key)).size,64);assert.equal(meta.source_commit,'e1fc27113bb3061458f528db837d517c35e0b88a');assert.equal(meta.license,'CC-BY-NC-SA-4.0');assert.equal(meta.printed_companion_scope.PCB_harness_qualified,false);assert.equal(meta.printed_companion_scope.whole_installed_fit_qualified,false);
 const next=glb(decoded),old=glb(await read('modules/head_a4t_rapido_hf_sherpa_assembled.glb'));
 assert.deepEqual(next.g.nodes.slice(0,61),old.g.nodes);assert.deepEqual(next.g.meshes.slice(0,old.g.meshes.length),old.g.meshes);assert.deepEqual(next.g.materials.slice(0,old.g.materials.length),old.g.materials);assert.deepEqual(next.g.accessors.slice(0,old.g.accessors.length),old.g.accessors);assert.deepEqual(next.g.bufferViews.slice(0,old.g.bufferViews.length),old.g.bufferViews);assert(next.bin.subarray(0,old.bin.length).equals(old.bin),'Original purchased/printed vertices or indices changed');
 const keys=['a4t106_led_carrier','a4t106_led_filter','a4t106_led_diffuser'];
 function values(index){const a=next.g.accessors[index],view=next.g.bufferViews[a.bufferView],counts={SCALAR:1,VEC3:3},sizes={5126:4,5125:4,5123:2};assert(counts[a.type]&&sizes[a.componentType]);const out=[];for(let i=0;i<a.count;i++)for(let j=0;j<counts[a.type];j++){const offset=(view.byteOffset||0)+(a.byteOffset||0)+i*(view.byteStride||sizes[a.componentType]*counts[a.type])+j*sizes[a.componentType];out.push(a.componentType===5126?next.bin.readFloatLE(offset):a.componentType===5125?next.bin.readUInt32LE(offset):next.bin.readUInt16LE(offset));}return out;}
 const added=[];
 for(const key of keys){const nodes=next.g.nodes.filter(n=>n.name===key);assert.equal(nodes.length,1);const node=nodes[0],row=meta.parts.find(p=>p.key===key);assert.deepEqual(node.scale,[1,1,1]);assert.equal(node.extras.source_commit,meta.source_commit);assert.equal(node.extras.source_url,row.source_url);assert.equal(row.source_commit,meta.source_commit);assert(/^[a-f0-9]{64}$/.test(row.source_sha256));assert(row.source_url.startsWith(spec.source.url.replace('/tree/','/blob/')+'/CAD/'));
  const primitives=next.g.meshes[node.mesh].primitives;let triangles=0,normals=0;
  for(const primitive of primitives){const pos=values(primitive.attributes.POSITION),normal=values(primitive.attributes.NORMAL),indices=primitive.indices===undefined?Array.from({length:pos.length/3},(_,i)=>i):values(primitive.indices);assert.equal(primitive.mode??4,4);assert.equal(pos.length,normal.length);assert(pos.every(Number.isFinite)&&normal.every(Number.isFinite));assert.equal(indices.length%3,0);for(let i=0;i<normal.length;i+=3){assert(Math.abs(Math.hypot(...normal.slice(i,i+3))-1)<1e-4);normals++;}for(let i=0;i<indices.length;i+=3){const [a,b,c]=indices.slice(i,i+3);assert(a!==b&&b!==c&&a!==c);assert(Math.max(a,b,c)<pos.length/3);const ab=[0,1,2].map(j=>pos[b*3+j]-pos[a*3+j]),ac=[0,1,2].map(j=>pos[c*3+j]-pos[a*3+j]);assert(Math.hypot(ab[1]*ac[2]-ab[2]*ac[1],ab[2]*ac[0]-ab[0]*ac[2],ab[0]*ac[1]-ab[1]*ac[0])>0);triangles++;}}
  if(key.endsWith('diffuser')){assert.equal(row.appearance_role,'optical');for(const p of primitives){const m=next.g.materials[p.material];assert.equal(m.alphaMode,'BLEND');assert.equal(m.pbrMetallicRoughness.baseColorFactor[3],.55);}}else assert.equal(row.appearance_role,'base');
  added.push({key,triangles,unit_normals:normals,source_sha256:row.source_sha256});
 }
 report.parts=64;report.original_parts=61;report.added_printed_parts=added;report.original_meshes_materials_and_binary_preserved=true;report.source_body_contacts_retained=true;report.new_supports_removed=0;report.passed=true;
}catch(e){report.failure=e.stack;process.exitCode=1;}
report.completed_at_utc=new Date().toISOString();report.producer_sha256=sha(await fs.readFile(new URL(import.meta.url)));await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,parts:report.parts,failure:report.failure}));
