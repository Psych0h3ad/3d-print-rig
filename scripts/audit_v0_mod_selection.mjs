// Run with: node --experimental-loader ./scripts/three-test-loader.mjs scripts/audit_v0_mod_selection.mjs ASSET_ROOT
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {gunzipSync} from 'node:zlib';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {partNodes,selectParts,visibleBounds} from '../site/viewer/component-selection.js';
import {componentViews,componentViewKeys,resolveComponentView,componentCategory} from '../site/viewer/v0-mod-library.mjs';
const root=process.argv[2];if(!root)throw Error('Pass the extracted public asset directory');
const read=async file=>JSON.parse(await fs.readFile(path.join(root,file),'utf8'));
const catalog=await read('COMPONENT_LIBRARY.json');let viewsChecked=0,partsChecked=0;
const report=[];
for(const item of catalog.items.filter(i=>i.id.startsWith('v0mod_'))){
 assert.ok(componentCategory(item).startsWith('v0-'));
 const spec=catalog.assets[item.module],meta=await read(spec.meta),views=componentViews(item,meta.parts);
 let bytes;try{bytes=await fs.readFile(path.join(root,spec.glb))}catch{bytes=gunzipSync(await fs.readFile(path.join(root,spec.glb+'.gz')))}
 const g=await new GLTFLoader().parseAsync(bytes.buffer.slice(bytes.byteOffset,bytes.byteOffset+bytes.byteLength),'');
 const nodes=partNodes(g.scene,meta.parts),seen=new Set();
 const visible=()=>[...nodes].filter(([,n])=>n.visible).map(([key])=>key).sort();
 for(const view of views){
  const selected=resolveComponentView(views,{view:view.id}),keys=componentViewKeys(selected.view,selected.part);
  selectParts(nodes,keys);assert.deepEqual(visible(),[...keys].sort());
  const box=visibleBounds(g.scene);assert.ok(!box.isEmpty());assert.ok(box.min.toArray().concat(box.max.toArray()).every(Number.isFinite));
  assert.equal(new Set(view.parts.map(p=>p.label)).size,view.parts.length,'Labels must identify distinct parts');
  for(const part of view.parts){
   seen.add(part.key);selectParts(nodes,componentViewKeys(view,part.key));assert.deepEqual(visible(),[part.key]);
   assert.ok(!visibleBounds(g.scene).isEmpty(),part.key);partsChecked++;
  }
  viewsChecked++;
 }
 assert.deepEqual([...seen].sort(),meta.parts.map(p=>p.key).sort(),'Every imported part must remain reachable');
 const before=visible();assert.throws(()=>selectParts(nodes,[meta.parts[0].key,'missing']));assert.deepEqual(visible(),before,'Invalid selection must not mutate the scene');
 const legacy=resolveComponentView(views,{part:meta.parts.at(-1).key});assert.equal(legacy.part,meta.parts.at(-1).key);
 if(item.id==='v0mod_official_bowden'){
  assert.equal(views.length,3);assert.deepEqual(views.map(v=>v.parts.length),[27,24,24]);
  for(const v of views)assert.equal(v.parts.filter(p=>p.name.startsWith('Cowling_')).length,1);
 }
 if(item.id==='v0mod_official_adxl_mounts')assert.deepEqual(views.map(v=>v.parts.length),[11,11,11,11]);
 if(item.id==='v0mod_umbilical')assert.deepEqual(views.map(v=>v.parts.length),[1,17,9]);
 if(item.id==='v0mod_official_hotend_mounts')assert.equal(views.length,17);
 if(item.id==='v0mod_tip_tophat'){
  assert.ok(views[0].parts.every(p=>p.name!=='Unibody'));assert.ok(views[1].parts.every(p=>!/^Body_Q[1-4]$/.test(p.name)));
 }
 report.push({id:item.id,views:views.length,parts:meta.parts.length,default:resolveComponentView(views).part});
 g.scene.traverse(n=>{if(n.isMesh){n.geometry.dispose();for(const m of Array.isArray(n.material)?n.material:[n.material])m.dispose()}});
}
assert.equal(report.length,18);
console.log(JSON.stringify({mods:report.length,viewsChecked,partsChecked,report},null,2));
