import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import {componentCategory,componentViews,resolveComponentView,componentViewKeys} from '../site/viewer/v0-mod-library.mjs';
import {translate} from '../site/viewer/i18n.mjs';
const read=name=>JSON.parse(fs.readFileSync(new URL('../site/'+name,import.meta.url)));
const source=read('COCOBUSTOR_SOURCES.json'), additions=read('COMPONENT_ADDITIONS.json');
const revision='052e6c321a7e3fffad5057ce1e9f87de38f0e867';
assert.equal(source.source_commit,revision);
assert.equal(source.complete_machine,false);
assert.equal(source.machine_installation_verified,false);
assert.equal(source.acquired_stl_files.length,37);
assert.equal(source.included_stl_files.length,35);
assert.equal(source.withheld_stl_files.length,2);
assert.equal(source.excluded_stl_files.length,14);
const sourcePaths=new Set(source.included_stl_files.map(s=>s.path));
assert.equal(sourcePaths.size,35);
for(const s of source.included_stl_files){
 assert.equal(s.revision,revision);
 assert(s.url.startsWith('https://raw.githubusercontent.com/CoconutDevelopment/CocobustorZero/'+revision+'/'));
 assert(!/Archived|Unfinished|TimTimAWD/.test(s.path));
 assert(/^[a-f0-9]{64}$/.test(s.sha256)&&/^[a-f0-9]{40}$/.test(s.git_blob_sha1));
}
const counts=[5,6,9,8,1,6], keys=new Set();
const heldKeys=new Set(source.withheld_stl_files.map(s=>'cocobustor_'+s.git_blob_sha1.slice(0,16)));
for(const [i,id] of source.components.entries()){
 const item=additions.items.find(s=>s.id===id), asset=additions.assets[id];
 assert(item&&asset);
 assert.equal(item.module,id);assert.equal(asset.component_id,id);
 assert.equal(item.representation,'STL');assert.equal(item.source_commit,revision);
 assert.equal(item.machine_installation_verified,false);assert.equal(item.license,'GPL-3.0');
 assert.equal(item.solids,counts[i]);assert.equal(asset.parts,counts[i]);
 assert(componentCategory(item).length>0);
 assert(item.notes.includes('complete printer assembly, installation and motion remain unverified'));
 assert(item.notes.includes('built-in supports have not been isolated'));
 assert(translate(item.label).includes('CocobustorZero'));
 const parts=item.views.flatMap(v=>v.parts.map(key=>({key,name:key})));
 const views=componentViews(item,parts);assert(views.every(v=>!v.assembly));
 for(const p of parts){
  assert(!keys.has(p.key)&&!heldKeys.has(p.key));keys.add(p.key);
  const selection=resolveComponentView(views,{part:p.key});
  assert.deepEqual(componentViewKeys(selection.view,selection.part),[p.key]);
 }
 assert.throws(()=>componentViewKeys(views[0],'all'));
 assert.throws(()=>componentViews(item,parts.slice(1)),parts.length>1?/Missing component part/:/原本の部品がありません/);
 if(process.argv[2]){
  const directory=path.resolve(process.argv[2]);const decoded={};
  for(const [name,s]of Object.entries(asset.files)){
   const bytes=fs.readFileSync(path.join(directory,s.path));
   assert.equal(bytes.length,s.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),s.sha256);
   decoded[name]=s.encoding==='gzip'?gunzipSync(bytes):bytes;
   if(s.encoding==='gzip'){
    assert.equal(decoded[name].length,s.decoded_bytes);
    assert.equal(createHash('sha256').update(decoded[name]).digest('hex'),s.decoded_sha256);
   }
  }
  const meta=JSON.parse(decoded['parts.json']);assert.equal(meta.id,id);assert.equal(meta.complete_machine,false);
  assert.equal(meta.assembly_poses_verified,false);assert.deepEqual(meta.views,item.views);
  const glb=decoded['model.glb'];assert.equal(glb.readUInt32LE(0),0x46546c67);
  const document=JSON.parse(glb.subarray(20,20+glb.readUInt32LE(12)).toString('utf8'));
  const linear=hex=>[0,2,4].map(i=>{const c=parseInt(hex.slice(i,i+2),16)/255;return c<=0.04045?c/12.92:((c+0.055)/1.055)**2.4}).concat(1);
  assert.deepEqual(document.materials[0].pbrMetallicRoughness.baseColorFactor,linear('24272c'));
  assert.deepEqual(document.materials[1].pbrMetallicRoughness.baseColorFactor,linear('e32636'));
  assert.equal(document.nodes.length,meta.parts.length);
  for(const p of meta.parts){
   const original=source.included_stl_files.find(s=>s.path===p.source_file);
   assert(original);assert.equal(p.source_sha256,original.sha256);
   assert.equal(p.source_git_blob_sha1,original.git_blob_sha1);assert.equal(p.source_commit,revision);
   assert.equal(p.supports_removed,false);assert.equal(p.material,'printed');
   const role=p.name.startsWith('[a]_')?'accent':'base';assert.equal(p.appearance_role,role);
   const node=document.nodes.find(n=>n.extras?.part_key===p.key);assert(node);
   assert.equal(node.extras.source_file,p.source_file);
   assert.equal(document.meshes[node.mesh].primitives[0].material,role==='accent'?1:0);
   assert.equal(p.triangles,p.source_triangles-p.zero_area_triangles_removed.length);
   assert.equal(p.zero_area_triangles_removed.length,0,'Degenerate and unresolved source meshes must remain withheld');
  }
 }
}
assert.equal(keys.size,35);
console.log(JSON.stringify({passed:true,components:6,source_parts:35,withheld_source_parts:2,excluded_stl_variants:14,
 actual_assets_checked:Boolean(process.argv[2]),scope:'Pinned source-part fidelity and selection; no native printer installation or motion certification'}));
