// Uses production installation code + exported GLBs. Native mating/contact
// checks are generated separately by prepare_monolith_mount_assets.py.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {monolithHeadCatalog} from '../site/viewer/monolith-head-model.mjs';
import {choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
const [base,overlay,report]=process.argv.slice(2).map(p=>path.resolve(p));
async function bytes(file){try{return await fs.readFile(path.join(overlay,file))}catch{return fs.readFile(path.join(base,file))}}
const read=async file=>JSON.parse(await bytes(file));
globalThis.location={href:'https://assets.test/viewer/'};
globalThis.fetch=async input=>{
 let file=String(input).split('?')[0];if(file.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});
 file=file.startsWith('http')?new URL(file).pathname.slice(1):file.replace(/^\.\.\//,'');
 try{return new Response(await bytes(file))}catch{return new Response('',{status:404})}
};
const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');
const {heads,registry}=await loadMachineHeadCatalog(),gantries=await read('GANTRY_CONFIGURATIONS.json');
const catalog=monolithHeadCatalog(heads,registry,gantries),scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog);
let installed=0,meshBoundsChecked=0;const proven=new Set(),failures=[];
for(const g of gantries.variants){
 const rows=catalog.variants.filter(v=>v.gantry===g.id);
 const fixed=rows.filter(v=>v.mount==='fixed');
 assert(fixed.length>=4,g.id+' fixed head coverage');
 // The native fixed mount is Sphinx; SB/Xol use the registered changer
 // receiver. Verify every completed fixed assembly, including its hardware.
 assert(fixed.every(v=>v.toolhead==='sphinx'),g.id+' unregistered fixed mount');
 for(const v of fixed)for(const type of ['extruder','hotend'])assert(v.modules.some(m=>m.id===v.fit.complete_head_native[type]),g.id+' incomplete '+type);
 for(const mount of ['fixed','stealthchanger']){
  const chosen=resolveVariant(catalog,{...rows[0],mount},'mount');assert.equal(chosen.gantry,g.id);
  assert(choicesFor(catalog,chosen,'mount').some(r=>r.id===mount));
 }
 for(const v of rows){
  try{
   await rig.install(v);rig.rig.updateMatrixWorld(true);assert.equal(rig.active.id,v.id);
   const plan=v.machine_head,entries=[{id:plan.base,translation_mm:plan.translation,hidden_keys:plan.hidden},...plan.modules];
   const wanted=new Set(entries.map(e=>e.id));
   for(const [id,promise] of rig.cache){const a=promise.loaded;if(!a)continue;assert.equal(a.root.visible,wanted.has(id),v.id+' stale '+id)}
   for(const e of entries){
    const a=rig.cache.get(e.id).loaded,hidden=new Set(e.hidden_keys||[]);assert.deepEqual(a.root.position.toArray(),[e.translation_mm[0]*.001,e.translation_mm[2]*.001,-e.translation_mm[1]*.001]);assert.deepEqual(a.root.scale.toArray(),[1,1,1]);
    for(const row of a.entries)assert.equal(row.mesh.visible,!hidden.has(row.key)&&!['rail_reference','dock','shuttle_reference'].includes(row.component));
    if(proven.has(e.id+'|'+e.translation_mm.join(',')))continue;
    const meta=await read((catalog.base_assets?.[e.id]||catalog.assets[e.id]).meta),lookup=new Map(meta.parts.map(p=>[p.key,p]));
    for(const row of a.entries){
     if(!row.mesh.visible)continue;
     const b=new THREE.Box3().setFromObject(row.mesh),native=lookup.get(row.key).bounds_mm;
     if(!native)continue;
     const expected=native.map(p=>p.map((n,i)=>n+e.translation_mm[i]));
     const actual=[[b.min.x*1000,-b.max.z*1000,b.min.y*1000],[b.max.x*1000,-b.min.z*1000,b.max.y*1000]];
     // OpenCascade bounds can include B-spline control-point margins. The
     // mesh must lie inside it to the exporter's .18 mm deflection tolerance.
     // Native mating faces have a separate .001 mm contact/axis check.
     for(let j=0;j<3;j++)assert(actual[0][j]>=expected[0][j]-.18&&actual[1][j]<=expected[1][j]+.18,e.id+' '+row.key+' envelope '+JSON.stringify({actual,expected}));
     meshBoundsChecked++;
    }
    proven.add(e.id+'|'+e.translation_mm.join(','));
   }
   installed++;
  }catch(e){failures.push({id:v.id,error:e.message})}
 }
 console.log(g.id+': '+rows.length+' installed plans');
}
const result={installed,gantries:gantries.variants.length,fixedConfigurations:catalog.variants.filter(v=>v.mount==='fixed').length,meshBoundsChecked,failures,registration_axis_error_mm:registry.monolith_target.axis_error_mm,native_solid_clearance_rechecked:false,browserRenderingTest:false};
await fs.writeFile(report,JSON.stringify(result,null,2));console.log(JSON.stringify({...result,failures:failures.length,examples:failures.slice(0,5)}));
assert.equal(failures.length,0);
