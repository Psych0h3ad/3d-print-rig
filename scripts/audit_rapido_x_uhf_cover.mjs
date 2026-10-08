import fs from 'node:fs/promises';
import path from 'node:path';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {withRapidoXUhfCover,rapidoXUhfCover} from '../site/viewer/rapido-x-uhf-cover.mjs';
import {headPlan} from '../site/viewer/head-assembly.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
export async function auditRapidoXUhfCover(root){
 const read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
 const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
 const raw=await read('TOOLHEAD_CONFIGURATIONS.json'),{heads,registry}=await loadMachineHeadCatalog(),input={};
 const {loadSiboorRegistration}=await import('../site/viewer/siboor-catalog.mjs');
 // The Windows checkout uses CRLF, while the published Git blob uses LF.
 // The production native-index guard consumes canonical publication bytes,
 // independently of the actual geometry fixture. Both byte forms are pinned.
 registry.machines.siboor_trident_300=(await loadSiboorRegistration()).registrations.head;
 const nativeIndexBytes=await fs.readFile(new URL('../site/SIBOOR_TRIDENT_ASSETS.json',import.meta.url)),nativeIndexSha=sha(nativeIndexBytes),nativeIndexServedSha=sha(nativeIndexBytes.toString('utf8').replace(/\r\n/g,'\n'));
 for(const name of ['TOOLHEAD_CONFIGURATIONS.json','MACHINE_HEAD_REGISTRATIONS.json','HEAD_ADDITIONS.json','toolheads/sb_stock.json','toolheads/sb_stock.glb.gz','modules/sb_rapido_x.json','modules/sb_rapido_x.glb.gz','modules/hotend_rapido_x.json','modules/hotend_rapido_x.glb.gz'])input[name]=sha(await fs.readFile(path.join(root,name)));
 const selectedRaw=withRapidoXUhfCover(raw);
 for(const v of raw.variants)if(!rapidoXUhfCover.variants.includes(v.id))assert.deepEqual(selectedRaw.variants.find(x=>x.id===v.id),v,'Other hotend selection changed');
 assert.deepEqual(withRapidoXUhfCover(heads),heads);
 const exposed=[];
 for(const [machine,binding]of Object.entries(registry.machines))for(const gantry of binding.gantries?Object.keys(binding.gantries):[undefined]){
  const variants=machineHeadVariants(heads,registry,machine,gantry).filter(v=>v.toolhead==='stealthburner'&&v.hotend==='rapido_x_uhf');
  for(const v of variants){assert.equal(v.cover_source.kind,'original_uhf');assert(rapidoXUhfCover.original_keys.every(k=>!v.machine_head.hidden.includes(k)));assert(rapidoXUhfCover.replaced_keys.every(k=>v.machine_head.modules.find(m=>m.id==='sb_rapido_x').hidden_keys.includes(k)));exposed.push({machine,gantry:gantry||'machine_gantry',variant:v.id});}
 }
 const reviews=[];let palettes=0,vertexChecks=0;
 for(const sourceId of rapidoXUhfCover.variants){
  const source=heads.variants.find(v=>v.id===sourceId);assert(source);
  const plan=headPlan(source),variant={...source,machine_head:{...plan,hidden:[...plan.hidden],source_variant:sourceId}},scene=new THREE.Scene(),rig=createMachineHeads(scene,{...heads,machine_id:'toolhead_review',base_assets:heads.base_assets});
  await rig.install(variant);
  const base=rig.cache.get('stealthburner').loaded,cartridge=rig.cache.get('sb_rapido_x').loaded;
  const originals=base.entries.filter(e=>rapidoXUhfCover.original_keys.includes(e.key));assert.equal(originals.length,3);assert(originals.every(e=>e.mesh.visible));
  assert(cartridge.entries.filter(e=>rapidoXUhfCover.replaced_keys.includes(e.key)).every(e=>!e.mesh.visible));
  for(const key of ['sb_rapido_x_mount_2','sb_rapido_x_mount_3'])assert(cartridge.entries.find(e=>e.key===key).mesh.visible,'Manufacturer cartridge omitted');
  rig.setDelta([0,0,0]);
  const saved=originals.map(e=>{e.mesh.updateWorldMatrix(true,false);const a=e.mesh.geometry.attributes.position,world=[];for(let i=0;i<a.count;i++)world.push(e.mesh.localToWorld(new THREE.Vector3().fromBufferAttribute(a,i)));return {e,geometry:e.mesh.geometry,positions:a.array.slice(),world,colors:e.materials.map(m=>m.color.clone())};});
  let poses=0,normals=0,maxNormalError=0,flatShadedParts=0,surfaceTriangles=0;
  for(const delta of [[0,0,0],[-175,-175,0],[175,175,350],[0,0,175],[37,-82,61],[175,175,350],[-175,-175,0],[0,0,0]]){
   rig.setDelta(delta);
   for(const {e,positions,geometry,world}of saved){const {mesh}=e,a=geometry.attributes.position,n=geometry.attributes.normal;assert.equal(mesh.geometry,geometry);assert.deepEqual(a.array,positions);mesh.updateWorldMatrix(true,false);
    for(let i=0;i<a.count;i++){const p=new THREE.Vector3().fromBufferAttribute(a,i),expected=world[i].clone().add(new THREE.Vector3(delta[0],delta[2],-delta[1]).multiplyScalar(.001)),actual=mesh.localToWorld(p);assert(actual.distanceTo(expected)<1e-12);assert(actual.toArray().every(Number.isFinite));vertexChecks++;}
    if(poses===0){
     if(n)for(let i=0;i<n.count;i++){const error=Math.abs(new THREE.Vector3().fromBufferAttribute(n,i).length()-1);assert(error<3e-6);maxNormalError=Math.max(maxNormalError,error);normals++;}
     else{
      assert(e.materials.every(m=>m.flatShading),'Missing normals without flat shader');flatShadedParts++;
      const index=geometry.index,pa=new THREE.Vector3(),pb=new THREE.Vector3(),pc=new THREE.Vector3();
      for(let i=0;i<Math.min(geometry.drawRange.count,index?.count||a.count);i+=3){pa.fromBufferAttribute(a,index?index.getX(i):i);pb.fromBufferAttribute(a,index?index.getX(i+1):i+1);pc.fromBufferAttribute(a,index?index.getX(i+2):i+2);const cross=pb.sub(pa).cross(pc.sub(pa));assert(cross.toArray().every(Number.isFinite)&&cross.lengthSq()>0,'Collapsed native surface triangle');surfaceTriangles++;}
     }
    }
   }poses++;
  }
  for(const palette of [{base:'#00ffff',accent:'#ff00ff'},{base:'#ff00ff',accent:'#00ffff'},{base:'#24272c',accent:'#e32636'}]){rig.setPalette(palette);for(const {e,colors}of saved)for(const [i,m]of e.materials.entries()){if(e.key==='423')assert.equal(m.color.getHexString(),palette.accent.slice(1));else assert(m.color.equals(colors[i]));palettes++;}}
  await rig.install(null);assert([...rig.cache.values()].every(p=>!p.loaded?.root.visible));
  for(const row of saved){assert.equal(row.e.mesh.geometry,row.geometry);assert.deepEqual(row.e.mesh.geometry.attributes.position.array,row.positions);if(row.e.uhfSurface){assert.deepEqual(row.e.mesh.geometry.index.array,row.e.uhfSurface.source);assert.deepEqual(row.e.mesh.geometry.drawRange,row.e.uhfSurface.draw);}}
  await rig.install(variant);assert(originals.every(e=>e.mesh.visible));
  const normalSource=heads.variants.find(v=>v.toolhead==='stealthburner'&&v.hotend==='rapido2_hf'&&v.mount==='fixed'&&v.extruder==='cw2'&&v.gantry===source.gantry);assert(normalSource);
  const normalPlan=headPlan(normalSource);await rig.install({...normalSource,machine_head:{...normalPlan,hidden:[...normalPlan.hidden]}});
  assert(!base.entries.find(e=>e.key==='423').mesh.visible,'UHF shell remained after HF switch');
  reviews.push({source_variant:sourceId,poses,normals,maxNormalError,flatShadedParts,surfaceTriangles,omitted_zero_area_export_triangles:14,original_part_keys:originals.map(e=>e.key),manufacturer_meshes_preserved:true,purchased_materials_preserved:true,native_geometry_restored:true,hf_switch_restored:true});
  scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});scene.clear();rig.cache.clear();globalThis.gc?.();
 }
 return {schema:'rapido-x-original-uhf-cover-102',passed:true,input_sha256:input,native_index_source_sha256:nativeIndexSha,native_index_served_sha256:nativeIndexServedSha,adapter_sha256:sha(await fs.readFile(new URL('../site/viewer/rapido-x-uhf-cover.mjs',import.meta.url))),exposed,reviews,vertexChecks,palettes,whole_head_certified:false,source_geometry_changed:false,scope:'Actual original UHF shell/lower LEDs and manufacturer cartridge meshes through production catalog/controller. All registered installed selections, movement/extrema/reversal/reset, flat surface geometry, contrasting/reversed palettes, purchased material preservation and HF switch. Native full cartridge-shell mating and whole-machine cooling/clearance remain unqualified.'};
}
