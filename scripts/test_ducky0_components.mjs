import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {componentCategory,componentViews,resolveComponentView,componentViewKeys} from '../site/viewer/v0-mod-library.mjs';
import {translate} from '../site/viewer/i18n.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../site/'+name,import.meta.url)));
const hash=data=>createHash('sha256').update(data).digest('hex');
const source=read('DUCKY0_SOURCES.json'), additions=read('COMPONENT_ADDITIONS.json');
const revision='a831046bed5624bc98ab2a42843d2d5ae851755a';
const identities=['bbb1313d1626101037740b52980bdb10200f2398','76e27bf45b91d0b994d0d2fb718434eaf1f0ffda',
 'b980707db08a4bf321208fe732739117a456b526','dc62d923a72ae323fb01647d99447973c0ae84f9',
 '0081531781738e282ac505224b3db345bcec1876','ca104bbaa7d1a4a6577b6ff3f21ee15b2bdac39f'];
assert(fs.readFileSync(new URL('../.gitignore',import.meta.url),'utf8').split(/\r?\n/).includes('!/site/DUCKY0_SOURCES.json'));
assert.equal(source.source_commit,revision);
assert.equal(source.complete_machine,false);assert.equal(source.machine_installation_verified,false);
assert.equal(source.native_assembly_supplied,false);
assert.equal(source.acquired_files.length,11);assert.equal(source.included_stl_files.length,6);
assert.equal(source.withheld_stl_files.length,1);
assert.deepEqual(source.included_stl_files.map(s=>s.git_blob_sha1),identities);
assert.equal(source.withheld_stl_files[0].git_blob_sha1,'c12c510ae5922791d42b8db7ec1962690db9779a');
assert(source.withheld_stl_files[0].reason.includes('CC-BY-NC-4.0'));
const screen=source.source_references.find(s=>s.author==='Fizzy / @FizzysTech');
assert.equal(screen.license,'CC-BY-SA-4.0');assert.equal(screen.compatibility_url,'https://creativecommons.org/compatible-licenses/');
for(const s of source.acquired_files){
 assert.equal(s.revision,revision);assert(s.url.startsWith('https://raw.githubusercontent.com/Ducky28/Ducky0/'+revision+'/'));
 assert(/^[a-f0-9]{64}$/.test(s.sha256));
}
const counts=[4,2], keys=new Set();
assert.equal(source.components.length,2);
const receiptHash=hash(fs.readFileSync(new URL('../site/DUCKY0_SOURCES.json',import.meta.url)));
for(const [i,id] of source.components.entries()){
 const item=additions.items.find(s=>s.id===id),asset=additions.assets[id];assert(item&&asset);
 assert.equal(item.module,id);assert.equal(asset.component_id,id);assert.equal(item.source_commit,revision);
 assert.equal(item.source_sha256,receiptHash);assert.equal(item.machine_installation_verified,false);
 assert.equal(item.representation,'STL');assert.equal(item.license,'GPL-3.0');
 assert.equal(item.solids,counts[i]);assert.equal(asset.parts,counts[i]);assert(componentCategory(item));
 assert(item.notes.includes('complete printer assembly, installation and motion remain unverified'));
 assert(translate(item.label).includes('Ducky0'));
 const parts=item.views.flatMap(v=>v.parts.map(key=>({key,name:key})));
 const views=componentViews(item,parts);assert(views.every(v=>!v.assembly));
 for(const p of parts){
  assert(!keys.has(p.key));keys.add(p.key);assert(identities.some(s=>p.key==='ducky0_'+s.slice(0,16)));
  const choice=resolveComponentView(views,{part:p.key});assert.deepEqual(componentViewKeys(choice.view,choice.part),[p.key]);
 }
 assert.throws(()=>componentViewKeys(views[0],'all'));
 if(process.argv[2]){
  const directory=path.resolve(process.argv[2]),decoded={};
  for(const[name,s]of Object.entries(asset.files)){
   const bytes=fs.readFileSync(path.join(directory,s.path));assert.equal(bytes.length,s.bytes);assert.equal(hash(bytes),s.sha256);
   decoded[name]=s.encoding==='gzip'?gunzipSync(bytes):bytes;
   if(s.encoding==='gzip'){assert.equal(decoded[name].length,s.decoded_bytes);assert.equal(hash(decoded[name]),s.decoded_sha256);}
  }
  const meta=JSON.parse(decoded['parts.json']);assert.equal(meta.id,id);assert.deepEqual(meta.views,item.views);
  assert.equal(meta.complete_machine,false);assert.equal(meta.assembly_poses_verified,false);
  assert.equal(meta.converter_sha256,hash(fs.readFileSync(new URL('convert_ducky0_sources.py',import.meta.url),'utf8').replaceAll('\r\n','\n')));
  const glb=decoded['model.glb'];assert.equal(glb.readUInt32LE(0),0x46546c67);assert.equal(glb.readUInt32LE(8),glb.length);
  const document=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'));
  const linear=hex=>[0,2,4].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=.04045?c/12.92:((c+.055)/1.055)**2.4}).concat(1);
  assert.equal(document.materials.length,1);assert.deepEqual(document.materials[0].pbrMetallicRoughness.baseColorFactor,linear('24272c'));
  assert.equal(document.materials[0].pbrMetallicRoughness.metallicFactor,0);
  assert.equal(document.nodes.length,meta.parts.length);
  for(const p of meta.parts){
   const original=source.included_stl_files.find(s=>s.path===p.source_file);assert(original);
   assert.equal(p.source_sha256,original.sha256);assert.equal(p.source_git_blob_sha1,original.git_blob_sha1);
   assert.equal(p.source_commit,revision);assert.equal(p.triangles,p.source_triangles);
   assert.equal(p.supports_removed,false);assert.equal(p.support_isolation_verified,false);
   assert.equal(p.material,'printed');assert.equal(p.appearance_role,'base');
   const node=document.nodes.find(n=>n.extras?.part_key===p.key);assert(node);assert.equal(node.extras.source_file,p.source_file);
   assert.equal(document.meshes[node.mesh].primitives[0].material,0);
  }
  const notice=fs.readFileSync(path.join(directory,'ducky0-v1',id,'NOTICE.txt'),'utf8');
  assert(notice.includes(revision));assert(notice.includes('Original source triangles'));
  if(i===1){assert(notice.includes('Fizzy / @FizzysTech'));assert(notice.includes('CC-BY-SA-4.0'));}
 }
}
assert.equal(keys.size,6);
assert(!additions.items.some(i=>i.id==='v0mod_ducky0_bottom_panel'));
console.log(JSON.stringify({passed:true,components:2,source_parts:6,withheld_parts:1,actual_assets_checked:Boolean(process.argv[2]),
 scope:'Pinned source-part identity, selection, materials and notices; installation and complete printer assembly remain open'}));
