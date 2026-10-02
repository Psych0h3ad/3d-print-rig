import {xolEmbeddedBoard,sbEmbeddedBoard,withEmbeddedBoards} from '../site/viewer/embedded-boards.mjs';
// Run against the assembled asset directory. This exercises the production
// installed-head controller and actual GLBs, not a WebGL/browser screenshot.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {headPlan} from '../site/viewer/head-assembly.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
const root=path.resolve(process.argv[2]),read=async f=>JSON.parse(await fs.readFile(path.join(root,f),'utf8'));
globalThis.location={href:'https://assets.test/viewer/'};
globalThis.fetch=async input=>{
 let file=String(input).split('?')[0];
 if(file.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});
 if(file.startsWith('http'))file=new URL(file).pathname.slice(1);else file=file.replace(/^\.\.\//,'');
 try{return new Response(await fs.readFile(path.join(root,file)))}catch{return new Response('',{status:404})}
};
const {createMachineHeads}=await import('../site/viewer/machine-heads.js');
const rawHeads=await read('TOOLHEAD_CONFIGURATIONS.json');const heads=withEmbeddedBoards(rawHeads,[xolEmbeddedBoard(await read(rawHeads.base_assets.xol.meta)),sbEmbeddedBoard(await read(rawHeads.base_assets.stealthburner.meta))]),registry=await read('MACHINE_HEAD_REGISTRATIONS.json');
const catalog={...heads,assets:{...heads.assets,...registry.assets}};
let configurations=0,meshChecks=0;const modules=new Set(),failures=[];
for(const family of heads.toolheads){
 const scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog);
 const sources=heads.variants.filter(v=>v.toolhead===family.id),single={...heads,variants:sources};
 const plans=sources.map(v=>{const p=headPlan(v);return {...v,machine_head:{...p,hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}}});
 for(const [machine,binding] of Object.entries(registry.machines))for(const gantry of binding.gantries?Object.keys(binding.gantries):[undefined])plans.push(...machineHeadVariants(single,registry,machine,gantry));
 for(const v of plans){
  try{
   await rig.install(v);assert.equal(rig.active,v);const p=v.machine_head,entries=[{id:p.base,translation_mm:p.translation,hidden_keys:p.hidden},...p.modules],wanted=new Set(entries.map(e=>e.id));let visible=0;
   for(const [id,cache] of rig.cache){const a=cache.loaded;if(!a)continue;modules.add(id);assert.equal(a.root.visible,wanted.has(id),v.id+' stale module '+id);if(!wanted.has(id))continue;
    const e=entries.find(e=>e.id===id),position=e.translation_mm;assert.deepEqual(a.root.position.toArray(),[position[0]*.001,position[2]*.001,-position[1]*.001]);
    const hidden=new Set(e.hidden_keys||[]);for(const r of a.entries){const expected=!hidden.has(r.key)&&!['rail_reference','dock','shuttle_reference'].includes(r.component);assert.equal(r.mesh.visible,expected,v.id+' '+id+' '+r.key);if(expected){assert(r.mesh.geometry.attributes.position.count>0);visible++}meshChecks++}
   }
   assert(visible>0,v.id+' empty head');rig.setDelta([37,-24,81]);assert.deepEqual(rig.rig.position.toArray(),[.037,.081,.024]);configurations++;
  }catch(e){failures.push({variant:v.id,message:e.message})}
 }
 scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});rig.cache.clear();scene.clear();globalThis.gc?.();
 console.log(family.id+': '+plans.length+' plans checked');
}
const report={configurations,meshChecks,modules:modules.size,failures,browser_render_test:false};
await fs.writeFile(process.argv[3]||'loaded-head-audit.json',JSON.stringify(report,null,2));console.log(JSON.stringify(report));if(failures.length)process.exitCode=1;
