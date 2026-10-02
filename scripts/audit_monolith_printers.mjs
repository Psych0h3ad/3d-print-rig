import fs from 'node:fs/promises';
import path from 'node:path';
import {gzipSync} from 'node:zlib';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {GLTFLoader} from '../site/viewer/vendor/GLTFLoader.js';
import {expandedPrinterCatalog,v24HeadCatalog} from '../site/viewer/machine-head-model.mjs';
import {monolithDisplayLimits} from '../site/viewer/monolith-machine-model.mjs';
import {choicesFor,resolveVariant,importedVariant} from '../site/viewer/configuration-model.js';
const [base,overlay,native,report]=process.argv.slice(2).map(p=>path.resolve(p));
async function bytes(file){for(const root of [native,overlay,base]){try{return await fs.readFile(path.join(root,file))}catch{}if(file.endsWith('.glb.gz'))try{return gzipSync(await fs.readFile(path.join(root,file.slice(0,-3))))}catch{}}throw Error('Missing '+file)}
const read=async f=>JSON.parse(await bytes(f));
globalThis.location={href:'https://assets.test/viewer/'};
globalThis.fetch=async input=>{let f=String(input).split('?')[0];if(f.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});f=f.startsWith('http')?new URL(f).pathname.slice(1):f.replace(/^\.\.\//,'');try{return new Response(await bytes(f))}catch{return new Response('',{status:404})}};
const {loadModel}=await import('../site/viewer/model-loader.js');
const {loadMonolithMachines,stockGantryVisibility}=await import('../site/viewer/monolith-machine.js');
const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
const data=await loadMachineHeadCatalog(),bindings=await read('MONOLITH_MACHINE_REGISTRATIONS.json'),results=[];
assert.equal(bindings.candidate_for_ui_testing_only,undefined);
for(const [machine,binding] of Object.entries(bindings.machines)){
 const v2=binding.family==='V2',siboor=machine==='siboor_trident_350';
 const meta=await read(siboor?'assembly_manifest.json':`machines/${machine}/assembly_manifest.json`),profile=v2?await read(`machines/${machine}/machine_profile.json`):null;
 const g=await loadModel(new GLTFLoader(),siboor?'../SIBOOR_Trident_350.glb':`../machines/${machine}/model.glb`),scene=new THREE.Scene();scene.add(g.scene);
 const nodes=new Map();g.scene.traverse(o=>{if(!o.isMesh)return;const key=o.userData.part_key||(siboor?o.name.slice(1).split('__')[0]:o.name);if(key)nodes.set(String(key),o)});
 const missing=binding.stock_hidden_keys.filter(k=>!nodes.has(k));assert.equal(missing.length,0,machine+' missing removal keys '+missing.join(','));
 const visibility=stockGantryVisibility(nodes),original=new Map([...nodes].map(([k,n])=>[k,n.visible]));
 const current=v2?v24HeadCatalog(data.heads,data.registry,machine):expandedPrinterCatalog(await read(siboor?'ASSEMBLY_CONFIGURATIONS.json':`machines/${machine}/configurations.json`),data.heads,data.registry,machine);
 const catalog=await loadMonolithMachines(current,data);catalog.bank_data=data.bank;assert(catalog.monolith);const rig=createMachineHeads(scene,catalog);
 const registered=catalog.variants.filter(v=>v.machine_gantry),gantries=[...new Set(registered.map(v=>v.gantry))];assert.equal(gantries.length,8);
 let installed=0,contained=0,xyContained=0;
 for(const gantry of gantries)for(const mount of ['fixed','stealthchanger']){
  const variant=registered.find(v=>v.gantry===gantry&&v.mount===mount);assert(variant);
  assert.equal(importedVariant(catalog,{machine,configuration:variant.id}),variant);
  assert.deepEqual(choicesFor(catalog,variant,'mount').map(r=>r.id).sort(),['fixed','stealthchanger']);
  assert.equal(resolveVariant(catalog,{...variant,mount:mount==='fixed'?'stealthchanger':'fixed'},'mount').gantry,gantry);
  rig.setDelta([0,0,0]);await rig.install(variant);visibility.install(variant);installed++;
  for(const key of binding.stock_hidden_keys)assert.equal(nodes.get(key).visible,false);
  const z=v2?variant.machine_head.nozzle_mm[2]-profile.bed_top_world_z_mm:0,reference=[...variant.machine_head.nozzle_mm.slice(0,2).map((n,i)=>n-binding.bed_min_xy_mm[i]),z],limits=v2?monolithDisplayLimits(profile.display_limits_mm,reference,variant):{Z:[0,0]};
  const nativeLimits=variant.machine_gantry;
  assert.equal(nativeLimits.x_delta_limits_mm?.length,2,machine+' missing native X travel');
  assert.equal(nativeLimits.y_delta_limits_mm?.length,2,machine+' missing native Y travel');
  for(const x of nativeLimits.x_delta_limits_mm)for(const y of nativeLimits.y_delta_limits_mm)for(const zDisplay of limits.Z){
   const delta=[x,y,v2?zDisplay-z:0];rig.setDelta(delta);scene.updateMatrixWorld(true);
   for(const id of nativeLimits.modules.filter(id=>/^monolith_[xy]_frame_/.test(id))){
    const a=rig.gantry.cache.get(id).loaded,isX=id.startsWith('monolith_x_'),axis=isX?'x':'z';
    const rails=a.entries.filter(e=>{
     const size=new THREE.Box3().setFromObject(e.mesh).getSize(new THREE.Vector3());
     return size[axis]>.2&&size.y<.014&&(isX?size.z<.014:size.x<.01);
    });
    assert.equal(rails.length,isX?1:2,id+' native rail identification');
    for(const e of a.entries.filter(e=>e.row.name===(isX?'_MGN12H':'_MGN9H'))){
     const box=new THREE.Box3().setFromObject(e.mesh),center=box.getCenter(new THREE.Vector3());
     const rail=rails.map(r=>new THREE.Box3().setFromObject(r.mesh)).sort((a,b)=>Math.abs(a.getCenter(new THREE.Vector3()).x-center.x)-Math.abs(b.getCenter(new THREE.Vector3()).x-center.x))[0];
     assert(box.min[axis]>=rail.min[axis]-.00002&&box.max[axis]<=rail.max[axis]+.00002,machine+' '+gantry+' '+e.row.key+' escaped native '+axis+' rail');xyContained++;
    }
   }
   if(v2)for(const id of variant.machine_gantry.modules.filter(id=>id.startsWith('monolith_z_'))){const a=rig.gantry.cache.get(id).loaded;
    for(const e of a.entries.filter(e=>e.row.name==='_MGN9H')){
     const contact=variant.machine_gantry.datum_checks.contacts.find(c=>c.block_key===e.row.key);assert(contact);
     const rail=meta.parts.find(p=>p.key===contact.rail_key),box=new THREE.Box3().setFromObject(e.mesh);
     assert(box.min.y*1000>=rail.bounds_mm[0][2]-.02&&box.max.y*1000<=rail.bounds_mm[1][2]+.02,machine+' '+gantry+' guide escaped rail');contained++;
    }
   }
  }
  await rig.install(null);visibility.install(null);assert.equal(rig.gantry.root.visible,false);for(const [key,visible] of original)assert.equal(nodes.get(key).visible,visible);
 }
 const result={machine,gantries:gantries.length,installed,guideContainmentChecks:contained,xyContainmentChecks:xyContained,removedStockParts:binding.stock_hidden_keys.length};results.push(result);console.log(JSON.stringify(result));
 scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});scene.clear();
}
const result={passed:true,nativeRevision:bindings.geometry_revision,machines:results,installations:results.reduce((n,r)=>n+r.installed,0),guideContainmentChecks:results.reduce((n,r)=>n+r.guideContainmentChecks,0),xyContainmentChecks:results.reduce((n,r)=>n+r.xyContainmentChecks,0)};await fs.writeFile(report,JSON.stringify(result,null,2));console.log(JSON.stringify({passed:true,machines:results.length,installations:result.installations,guideContainmentChecks:result.guideContainmentChecks,xyContainmentChecks:result.xyContainmentChecks}));
