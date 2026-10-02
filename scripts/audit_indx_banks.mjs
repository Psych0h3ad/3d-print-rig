import fs from 'node:fs/promises';import path from 'node:path';import assert from 'node:assert/strict';import * as THREE from 'three';
import {headPlan} from '../site/viewer/head-assembly.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
import {bankChoices,bankPlan,bankCapacity,bankBedReferenceDrop} from '../site/viewer/changer-bank-model.mjs';
const root=path.resolve(process.argv[2]),read=async n=>JSON.parse(await fs.readFile(path.join(root,n),'utf8'));
globalThis.location={href:'https://assets.test/viewer/'};globalThis.fetch=async input=>{let n=String(input).split('?')[0];if(n.includes('ASSET_BUNDLE.json'))return Response.json({encoding:'gzip'});n=n.startsWith('http')?new URL(n).pathname.slice(1):n.replace(/^\.\.\//,'');try{return new Response(await fs.readFile(path.join(root,n)))}catch{return new Response('',{status:404})}};
const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js');const {heads,registry}=await loadMachineHeadCatalog(),data=await read('TOOLCHANGER_BANK.json');
const targets=Object.entries(registry.machines).flatMap(([machine,b])=>(b.gantries?Object.keys(b.gantries):[undefined]).map(gantry=>({machine,gantry,variants:machineHeadVariants(heads,registry,machine,gantry)})));
targets.push({machine:'toolhead',variants:heads.variants.map(v=>{const p=headPlan(v);return {...v,machine_head:{...p,translation_delta_mm:[0,0,0],modules:p.modules.filter(m=>m.role!=='dock')}}})});
let cases=0,meshChecks=0;const results=[];
for(const t of targets){
 const variants=t.variants.filter(v=>v.toolhead==='indx');if(!variants.length)continue;
 const catalog={...heads,machine_id:t.machine,variants,assets:{...heads.assets,...registry.assets,...data.assets},bank_data:data},scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog),capacity=bankCapacity(data,t.machine,'indx');
 for(const cooling of [...new Set(variants.map(v=>v.cooling))]){
  const opts=bankChoices(catalog,data,t.gantry,'indx',cooling);assert.equal(opts.length,8);
  for(let count=1;count<=capacity;count++)for(let active=0;active<count;active++)for(let seed=0;seed<opts.length;seed++){
   const state={system:'indx',enabled:true,active,tools:Array.from({length:count},(_,i)=>opts[(seed+i)%opts.length].hotend)},v=opts.find(v=>v.hotend===state.tools[active]),plan=bankPlan(state,catalog,data,v);await rig.install(v,state);
   assert.equal(rig.bankRig.children.length,2*count);assert.equal(plan.instances.filter(p=>p.kind==='fixture').length,1);assert.equal(plan.instances.filter(p=>p.kind==='dock').length,count);assert.equal(plan.instances.filter(p=>p.kind==='tool').length,count-1);assert(!plan.instances.some(p=>p.kind==='tool'&&p.slot===active));
   rig.bankRig.updateMatrixWorld(true);const boxes=Array.from({length:count},()=>new THREE.Box3());
   rig.bankRig.children.forEach((o,i)=>{const p=plan.instances[i];assert.equal(o.userData.tool_bank.asset,p.id);assert.deepEqual(o.position.toArray(),[p.translation_mm[0]*.001,p.translation_mm[2]*.001,-p.translation_mm[1]*.001]);o.traverse(m=>{if(!m.isMesh)return;const original=rig.cache.get(p.id).loaded.entries.find(r=>r.key===(m.userData.part_key||m.name));assert(original);assert.notEqual(m.material,original.mesh.material);assert.equal(m.geometry,original.mesh.geometry);assert(m.visible);if(p.slot>=0)boxes[p.slot].expandByObject(m);meshChecks++})});
   for(let i=1;i<count;i++)assert(boxes[i].min.x>boxes[i-1].max.x,'Adjacent tool/dock envelopes');
   let smart=0,installedParts=0;for(const [id,p]of rig.cache){const a=p.loaded;if(!a?.root.visible)continue;if(id.startsWith('head_indx_')&&!id.includes('rail_fasteners'))smart++;if(id.startsWith('indx_passive_tool_'))installedParts+=a.entries.filter(r=>r.mesh.visible).length}
   assert.equal(smart,1);assert.equal(installedParts,8);
   const fixed=rig.bankRig.children.map(o=>o.getWorldPosition(new THREE.Vector3()).toArray());rig.setDelta([27,-19,80]);rig.bankRig.children.forEach((o,i)=>assert.deepEqual(o.getWorldPosition(new THREE.Vector3()).toArray(),fixed[i]));rig.setPalette({base:'#204f63',accent:'#da562b',frame:'#969da5'});cases++;
  }
 }
 const before=rig.bankRig.children.map(o=>o.uuid),active=rig.active,asset=data.indx.dock_asset;data.indx.dock_asset='unregistered_dock';await assert.rejects(rig.setBank(rig.bankState));data.indx.dock_asset=asset;assert.equal(rig.active,active);assert.deepEqual(rig.bankRig.children.map(o=>o.uuid),before);
 await rig.setBank({...rig.bankState,enabled:false});assert.equal(rig.bankRig.children.length,0);
 const mount=data.machines[t.machine];if(mount?.bed_max_up_mm){const drop=bankBedReferenceDrop(catalog,data,rig.bankState,active);assert(drop>=-mount.bed_max_up_mm);assert.equal(data.indx.machines[t.machine].print_setup_verified,false)}
 results.push({machine:t.machine,gantry:t.gantry,capacity,cooledReference:true});console.log(t.machine+' '+(t.gantry||'')+' INDX controls/actual assets passed');scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose()}});rig.cache.clear();scene.clear();globalThis.gc?.();
}
const q={all_passed:true,cases,meshChecks,results,actual_glbs:true,browser_visual_review:false,full_travel_verified:false,automatic_docking_verified:false};await fs.writeFile(process.argv[3],JSON.stringify(q,null,2)+'\n');console.log(JSON.stringify(q));
