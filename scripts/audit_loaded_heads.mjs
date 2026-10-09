// Actual exported heads through production catalog/controller. Standalone headPlan
// is a controller scope; standalone DOM/GPU and native solids are separate gates.
import fs from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import crypto from 'node:crypto';
import assert from 'node:assert/strict';
import * as THREE from 'three';
import {headPlan} from '../site/viewer/head-assembly.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
import {importedVariant,configurationById} from '../site/viewer/configuration-model.js';
import {sphinxCompanionPresets} from '../site/viewer/head-companion-presets.mjs';
import {rapidoXUhfCover} from '../site/viewer/rapido-x-uhf-cover.mjs';
import {TRINITY_INSTALLED_BELT_SAMPLE_KEYS} from '../site/viewer/trinity-alpha-installation.mjs';

const sha=b=>crypto.createHash('sha256').update(b).digest('hex');
const point=p=>Array.isArray(p)&&p.length===3&&p.every(Number.isFinite);
const references=new Set(['rail_reference','dock','shuttle_reference']);
const entriesFor=v=>[{id:v.machine_head.base,translation_mm:v.machine_head.translation,hidden_keys:v.machine_head.hidden},...v.machine_head.modules];
const display=p=>[p[0]*.001,p[2]*.001,-p[1]*.001];

export function assertHeadPresetAliases(catalog,standalone=false){
 const result={registered:0,installed_ids:0,unsupported:0};
 for(const p of sphinxCompanionPresets){
  assert.equal(catalog.configuration_aliases?.[p.from],p.to,'Missing source companion migration '+p.from);
  assert(!catalog.variants.some(v=>v.id===p.from||v.source_head_configuration===p.from),'Obsolete printed-only preset still registered');
  const targets=catalog.variants.filter(v=>v.id===p.to||v.source_head_configuration===p.to);
  if(standalone)assert.equal(targets.length,1,'Missing assembled standalone preset '+p.to);
  assert.equal(configurationById(catalog,p.from),targets[0],'Source alias resolved to another registration');
  if(!targets.length){result.unsupported++;continue;}
  result.registered++;
  for(const target of targets){
   if(target.id===p.to){assert.equal(importedVariant(catalog,{machine:catalog.machine_id,configuration:p.from}),target);continue;}
   assert(target.id.startsWith('installed__')&&target.id.endsWith('__'+p.to),'Unknown installed source ID format');
   const old=target.id.slice(0,-p.to.length)+p.from;
   assert.equal(configurationById(catalog,old),target,'Old installed link changed host/gantry');
   assert.equal(importedVariant(catalog,{machine:catalog.machine_id,configuration:old}),target,'Old installed save lost companions');
   result.installed_ids++;
  }
 }
 return result;
}

// Source-specific requirements, never inferred from HF/UHF names.
export function assertHeadCompanions(v){
 const entries=entriesFor(v),ids=entries.map(e=>e.id);
 assert.equal(new Set(ids).size,ids.length,v.id+' duplicate companion module');
 for(const e of entries)assert(point(e.translation_mm),v.id+' non-finite placement '+e.id);
 const requireModule=id=>{assert(ids.includes(id),v.id+' missing declared companion '+id);return entries.find(e=>e.id===id);};
 if(v.toolhead==='stealthburner'&&v.hotend==='rapido_x_uhf'){
  assert.equal(v.cover_source?.kind,'original_uhf',v.id+' obsolete Rapido X front cover');
  assert.equal(v.machine_head.base,'stealthburner',v.id+' changed original UHF source');
  for(const key of rapidoXUhfCover.original_keys)assert(!v.machine_head.hidden.includes(key),v.id+' missing original UHF shell/LED '+key);
  const cover=requireModule('sb_rapido_x');requireModule('hotend_rapido_x');
  for(const key of rapidoXUhfCover.replaced_keys)assert(cover.hidden_keys?.includes(key),v.id+' duplicate obsolete cover/LED '+key);
  for(const key of ['sb_rapido_x_mount_2','sb_rapido_x_mount_3'])assert(!cover.hidden_keys?.includes(key),v.id+' hidden manufacturer cartridge '+key);
 }
 if(v.toolhead==='sphinx'){
  const native=v.fit?.complete_head_native;
  if(native?.base)assert.equal(v.machine_head.base,native.base,v.id+' changed Sphinx source body');
  for(const id of [native?.hotend,native?.extruder].filter(Boolean))requireModule(id);
  if(v.fit?.hotend_cooling?.module)requireModule(v.fit.hotend_cooling.module);
 }
 if(v.native_alpha_92){
  for(const key of TRINITY_INSTALLED_BELT_SAMPLE_KEYS)assert(v.machine_head.hidden.includes(key),v.id+' residual Trinity belt sample '+key);
  assert(v.machine_head.hidden.includes('actual_retained_Trident_block'),v.id+' duplicate retained host block');
  assert.equal(v.machine_head.modules.length,0,v.id+' unexpected alpha companion');
 }
 return entries;
}

// The former loop only inspected loaded rows and silently accepted missing leaves.
export function assertExportedHeadParts(meta,loaded,id){
 assert(Array.isArray(meta?.parts)&&meta.parts.length,id+' missing manifest');
 const keys=meta.parts.map(p=>String(p.key));
 assert.equal(new Set(keys).size,keys.length,id+' duplicate source part identity');
 const byKey=new Map();
 for(const e of loaded.entries){const key=String(e.key);assert(keys.includes(key),id+' unregistered export '+key);if(!byKey.has(key))byKey.set(key,[]);byKey.get(key).push(e);}
 for(const key of keys){
  const rows=byKey.get(key);assert(rows?.length,id+' missing exported part '+key);
  // The pinned original switch export consists of its lever and housing. They
  // are different source surfaces, not two instances of the complete switch.
  // Require both exact identities, so losing either surface also fails closed.
  const originalSurfaces={480:['P480__Switch_Housing','P480__Switch_Lever'],546:['P546__motor_body','P546__steel_endcaps_and_shaft']};
  if(id==='stealthburner'&&originalSurfaces[key]&&meta.source_sha256==='8c94727b60ab24b2f76c303be8000b5a434e728b38070e5c8e82069eebe61e4c'){
   assert.deepEqual(rows.map(e=>e.mesh.name).sort(),originalSurfaces[key],id+' changed original purchased surface decomposition');continue;
  }
  // GLTF multi-material primitives must share one logical named part node.
  if(rows.length>1){const parent=rows[0].mesh.parent,parentKey=parent&&(parent.userData?.part_key||parent.name.match(/^P([^_]+)__/u)?.[1]||parent.name);assert(parentKey===key&&rows.every(e=>e.mesh.parent===parent),id+' duplicate exported part '+key);}
 }
 return byKey;
}

export function assertSphinxFanSource(meta){
 if(meta.id!=='sphinx_hotend_fan_2510')return;
 assert.equal(meta.geometry_revision,'sphinx-rear-cooling-2','Stale Sphinx fan revision');
 assert.equal(meta.source_commit,'c00b13ef851d38fef6e295e18296650e1ca50d7e','Sphinx fan source changed');
 assert.equal(meta.source_mount_url,'https://github.com/riley-github/Sphinx-Toolhead/tree/74ce5f58fcb06aea2ddcbb48b09610cbbfbfa180','Sphinx seat source changed');
 assert.deepEqual(meta.source_transform,{rotation_z_deg:180,translation_mm:[-.09999065671,-43.69962727068417,-378.6758689537]},'Sphinx rear fan transform changed');
 assert.equal(meta.mount_plane_y_mm,.21037520701583,'Sphinx rear fan seat changed');
 assert.equal(meta.parts.length,1,'Sphinx purchased fan body count changed');
 assert.equal(meta.parts[0].source_brep_sha256,'7ac69fa419e0b5bae62b82abcbc5f4d10f4c489bc14f071639f379fd7ac76e23','Sphinx original purchased fan changed');
}

export function assertSphinxFanBounds(bounds){
 const expected=[[-12.5,.21037520701583,-45],[12.5,10.21037520701583,-20]];
 for(const [side,actual]of bounds.entries())for(let i=0;i<3;i++)assert(Number.isFinite(actual[i])&&Math.abs(actual[i]-expected[side][i])<.002,'Actual Sphinx fan detached from pinned rear seat');
 assert.equal(bounds.length,2,'Sphinx fan bounds missing');
}

function snapshot(rig){
 rig.rig.updateMatrixWorld(true);const rows=[];
 for(const[id,p]of rig.cache){const a=p.loaded;if(!a?.root.visible)continue;
  for(const e of a.entries)if(e.mesh.visible)rows.push({id,key:e.key,matrix:[...e.mesh.matrixWorld.elements],draw:{...e.mesh.geometry.drawRange},surface:e.uhfSurface?sha(e.mesh.geometry.index.array):null});
 }
 return rows.sort((a,b)=>(a.id+'\0'+a.key).localeCompare(b.id+'\0'+b.key));
}

export async function auditLoadedHeads(root,{families=null,machines=null,variants=null}={}){
 root=path.resolve(root);const input={},sourceInput={},missing=new Set(),oldFetch=globalThis.fetch,oldLocation=globalThis.location;
 const site=fileURLToPath(new URL('../site/',import.meta.url));
 async function bytesFor(name){
  let bytes,origin='asset';
  try{bytes=await fs.readFile(path.join(root,name));}catch(error){
   // Asset-only fixtures omit site catalogs. Never substitute a missing model.
   if(name.includes('/')||!name.endsWith('.json'))throw error;
   bytes=await fs.readFile(path.join(site,name));origin='source';
  }
  const digest=sha(bytes),pins=origin==='asset'?input:sourceInput;
  if(pins[name])assert.equal(pins[name].sha256,digest,'Input changed during audit: '+name);
  pins[name]={sha256:digest,bytes:bytes.length};
  // Windows source checkout is CRLF; public Git JSON is LF. Pin both forms.
  if(origin==='source'){const served=Buffer.from(bytes.toString('utf8').replace(/\r\n/g,'\n'));pins[name].served_sha256=sha(served);return served;}
  return bytes;
 }
 const read=async name=>JSON.parse((await bytesFor(name)).toString('utf8'));
 globalThis.location={href:'http://localhost/viewer/'};
 globalThis.fetch=async inputURL=>{
  const url=new URL(String(inputURL.url||inputURL),globalThis.location.href),name=url.protocol==='file:'?decodeURIComponent(url.pathname).split('/site/').at(-1):decodeURIComponent(url.pathname).replace(/^\//,'');
  try{return new Response(await bytesFor(name));}catch{missing.add(name);return new Response('',{status:404});}
 };
 const report={schema:'loaded-head-companions-106',started_at_utc:new Date().toISOString(),configurations:0,meshChecks:0,modules:0,transitions:0,poseChecks:0,paletteChecks:0,legacyPresetRestorations:0,contexts:[],failures:[],open_findings:[],input_sha256:input,source_input_sha256:sourceInput,code_sha256:{},browser_render_test:false,native_solid_review:false,whole_head_certified:false,filters:{families,machines,variants}};
 report.cache_policy={inactive_geometry_limit_bytes:128*1024*1024,evicted_modules:0,max_cached_geometry_bytes:0,identity_scope:'Reuse only the same registered module in the same production catalog/scene; no cross-machine placement/native-joint reuse.'};
 const viewer=fileURLToPath(new URL('../site/viewer/',import.meta.url));
 async function codePins(dir,pins){for(const e of await fs.readdir(dir,{withFileTypes:true})){const full=path.join(dir,e.name);if(e.isDirectory())await codePins(full,pins);else if(/\.(?:mjs|js)$/.test(e.name))pins[path.relative(path.dirname(viewer),full).replaceAll('\\','/')]=sha(await fs.readFile(full));}}
 await codePins(viewer,report.code_sha256);report.code_sha256['scripts/audit_loaded_heads.mjs']=sha(await fs.readFile(fileURLToPath(import.meta.url)));
 const used=new Set(),found=new Set(),geometry=new WeakSet();
 try{
  const {createMachineHeads,loadMachineHeadCatalog}=await import('../site/viewer/machine-heads.js'),base=await loadMachineHeadCatalog();
  const machineIds=['standalone',...new Set([...Object.keys(base.registry.machines),'siboor_trident_300'])];
  for(const id of machines||machineIds)assert(machineIds.includes(id),'Unregistered audit machine '+id);
  for(const id of families||base.heads.toolheads.map(t=>t.id))assert(base.heads.toolheads.some(t=>t.id===id),'Unregistered audit head '+id);
  for(const machine of machineIds){
   if(machines&&!machines.includes(machine))continue;
   let data;try{data=machine==='standalone'?base:await loadMachineHeadCatalog(machine);}catch(e){report.failures.push({machine,stage:'production_catalog',message:e.message});continue;}
   const {heads,registry}=data;
   if(['voron_trident_250','voron_trident_300','voron_trident_350'].includes(machine))assert.equal(registry.head_witness_validation?.machine,machine,'Standard Trident baseline lost its current source witness binding');
   // Standard Trident has a direct native registry binding but the printer
   // consumer names its gantry trident_r2. Omitting that ID loses alpha rows.
   const gantries=machine==='standalone'?[]:registry.machines[machine].gantries?Object.keys(registry.machines[machine].gantries):machine.startsWith('voron_trident_')?['trident_r2']:[undefined];
   const plans=machine==='standalone'?heads.variants.map(v=>{const p=headPlan(v);return {...v,machine_head:{...p,hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}};}):gantries.flatMap(g=>machineHeadVariants(heads,registry,machine,g));
   const context={machine,production_variants:plans.length,checked:0,by_family:{}};report.contexts.push(context);
   context.companion_aliases=assertHeadPresetAliases({...heads,machine_id:machine,variants:plans},machine==='standalone');
   for(const family of heads.toolheads){
    if(families&&!families.includes(family.id))continue;
    const sources=plans.filter(v=>v.toolhead===family.id),selected=sources.filter(v=>!variants||variants.includes(v.source_head_configuration||v.id));if(!selected.length)continue;
    const catalog={...heads,machine_id:machine,assets:{...heads.assets,...registry.assets}},scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog),metadata=new Map();
    async function metadataFor(id){
     if(metadata.has(id))return metadata.get(id);
     const spec=catalog.base_assets?.[id]||catalog.assets[id];assert(spec,id+' unregistered module');
     const name=spec.external?(spec.component_id==='trinity_v13_current105_alpha_92'?'toolhead-models-assets/':spec.external.local_directory+'/')+spec.files['parts.json'].path:spec.meta;
     const meta=await read(name);assertSphinxFanSource(meta);metadata.set(id,meta);return meta;
    }
    async function inspect(v){
     const entries=assertHeadCompanions(v),wanted=new Set(entries.map(e=>e.id));let count=0;
     for(const[id,p]of rig.cache){const a=p.loaded;if(!a)continue;assert.equal(a.root.visible,wanted.has(id),v.id+' stale module '+id);if(!wanted.has(id))continue;
      used.add(id);const e=entries.find(e=>e.id===id),meta=await metadataFor(id),byKey=assertExportedHeadParts(meta,a,id),hidden=new Set((e.hidden_keys||[]).map(String));
      for(const key of hidden)assert(byKey.has(key),v.id+' stale visibility key '+id+'/'+key);
      assert.deepEqual(a.root.position.toArray(),display(e.translation_mm),v.id+' placement '+id);
      for(const row of a.entries){const expected=!hidden.has(String(row.key))&&!references.has(row.component);assert.equal(row.mesh.visible,expected,v.id+' '+id+'/'+row.key);report.meshChecks++;if(expected)count++;
       const g=row.mesh.geometry,positions=g.attributes.position;assert(positions?.count>0,id+'/'+row.key+' empty export');
       if(!geometry.has(g)){assert.equal(positions.itemSize,3);for(const n of positions.array)assert(Number.isFinite(n),id+'/'+row.key+' non-finite vertex');if(g.index)for(const n of g.index.array)assert(Number.isInteger(n)&&n>=0&&n<positions.count,id+'/'+row.key+' invalid index');geometry.add(g);}
      }
      if(id==='sphinx_hotend_fan_2510'){
       a.root.updateWorldMatrix(true,true);const box=new THREE.Box3().setFromObject(a.root),offset=new THREE.Vector3(...display(e.translation_mm)).add(rig.rig.position);box.translate(offset.negate());
       const lower=[box.min.x,-box.max.z,box.min.y].map(n=>n*1000),upper=[box.max.x,-box.min.z,box.max.y].map(n=>n*1000);assertSphinxFanBounds([lower,upper]);
      }
     }
     assert(count>0,v.id+' empty head');
     for(const e of entries){const a=rig.cache.get(e.id)?.loaded;assert(a,v.id+' unloaded companion '+e.id);if(e.id===v.fit?.hotend_cooling?.module)assert(a.entries.some(r=>r.mesh.visible),v.id+' hidden cooling companion');}
    }
    function trimCache(){
     const buffers=new Set(),inactive=[];let total=0;
     for(const[id,p]of rig.cache){const a=p.loaded;if(!a)continue;let bytes=0;for(const e of a.entries)for(const attr of [...Object.values(e.mesh.geometry.attributes),e.mesh.geometry.index].filter(Boolean)){const b=attr.array.buffer;if(!buffers.has(b)){buffers.add(b);bytes+=b.byteLength;}}total+=bytes;if(!a.root.visible)inactive.push({id,a,bytes});}
     report.cache_policy.max_cached_geometry_bytes=Math.max(report.cache_policy.max_cached_geometry_bytes,total);
     let unused=inactive.reduce((n,e)=>n+e.bytes,0),removed=0;
     // Evict only inactive assets after restoration checks. A source/module is
     // reloaded through the unchanged production integrity guard if needed again.
     for(const {id,a,bytes}of inactive.sort((a,b)=>b.bytes-a.bytes)){if(unused<=report.cache_policy.inactive_geometry_limit_bytes)break;rig.rig.remove(a.root);for(const e of a.entries){e.mesh.geometry.dispose();for(const m of e.materials)m.dispose();}rig.cache.delete(id);unused-=bytes;removed+=bytes;report.cache_policy.evicted_modules++;}
     if(removed)globalThis.gc?.();
    }
    try{
     for(const v of selected){found.add(v.source_head_configuration||v.id);try{
      if(v.toolhead==='sphinx'&&v.fit?.complete_head_native&&!v.fit.complete_head_native.base)report.open_findings.push({machine,variant:v.id,scope:'source_specific_companion_manifest',required_proof:'Legacy partial source reference has no complete base/hotend/extruder identity declaration. Its current displayed leaves are audited; absent extruder/blower/board/probe/wiring remain unqualified.'});
      rig.setDelta([0,0,0]);await rig.install(v);assert.equal(rig.active,v);await inspect(v);const original=snapshot(rig);
      const materials=[...rig.cache.values()].flatMap(p=>p.loaded?.root.visible?p.loaded.entries.filter(e=>e.mesh.visible):[]).map(e=>({e,physical:e.materials.map(m=>[m.metalness,m.roughness])}));
      for(const palette of [{base:'#00ffff',accent:'#ff00ff'},{base:'#ff00ff',accent:'#00ffff'},{base:'#24272c',accent:'#e32636'}]){
       rig.setPalette(palette);for(const {e,physical}of materials)for(const[i,m]of e.materials.entries()){if(['base','accent'].includes(e.role))assert.equal(m.color.getHexString(),palette[e.role].slice(1));else{assert(m.color.equals(e.colors[i]),v.id+' purchased color changed');assert.deepEqual([m.metalness,m.roughness],physical[i],v.id+' purchased material changed');}report.paletteChecks++;}
      }
      const limits=v.native_alpha_92?.limits_mm,reference=v.native_alpha_92?.reference_xyz_mm;
      const low=limits?['X','Y','Z'].map((a,i)=>limits[a][0]-reference[i]):[-37,-24,0],high=limits?['X','Y','Z'].map((a,i)=>limits[a][1]-reference[i]):[37,24,81],mid=low.map((n,i)=>(n+high[i])/2);
      for(const delta of [low,mid,high,mid,low,[0,0,0]]){rig.setDelta(delta);const actual=snapshot(rig);assert.equal(actual.length,original.length,v.id+' companions lost in movement');for(let i=0;i<actual.length;i++){const expected=[...original[i].matrix];for(const[axis,value]of display(delta).entries())expected[12+axis]+=value;assert(actual[i].matrix.every((n,j)=>Number.isFinite(n)&&Math.abs(n-expected[j])<1e-10),v.id+' detached '+actual[i].key);}report.poseChecks++;}
      const b=sources.find(n=>n.id!==v.id&&(n.hotend!==v.hotend||n.cooling!==v.cooling||n.extruder!==v.extruder||n.board!==v.board))||sources.find(n=>n.id!==v.id)||plans.find(n=>n.id!==v.id&&n.toolhead==='stealthburner');
      if(b){await rig.install(b);await inspect(b);await rig.install(v);await inspect(v);assert.deepEqual(snapshot(rig),original,v.id+' A-B-A did not restore companions');report.transitions++;}
      await rig.install(null);assert([...rig.cache.values()].every(p=>!p.loaded?.root.visible),v.id+' modules survived teardown');
      for(const p of rig.cache.values())for(const row of p.loaded?.entries||[])if(row.uhfSurface){assert.deepEqual(row.mesh.geometry.index.array,row.uhfSurface.source,v.id+' UHF original indices not restored');assert.deepEqual(row.mesh.geometry.drawRange,row.uhfSurface.draw);}
      const saved=JSON.parse(JSON.stringify({machine,configuration:v.id})),restored=importedVariant({...catalog,variants:plans},saved);await rig.install(restored);await inspect(restored);assert.deepEqual(snapshot(rig),original,v.id+' saved ID did not restore companions');report.transitions++;
      const preset=sphinxCompanionPresets.find(p=>p.to===(v.source_head_configuration||v.id));
      if(preset){
       const oldId=v.id===preset.to?preset.from:v.id.slice(0,-preset.to.length)+preset.from;
       const migrated=importedVariant({...catalog,variants:plans},JSON.parse(JSON.stringify({machine,configuration:oldId})));
       assert.equal(migrated,v);await rig.install(migrated);await inspect(migrated);
       assert.deepEqual(snapshot(rig),original,v.id+' old saved preset lost actual companions');report.legacyPresetRestorations++;
      }
      report.configurations++;context.checked++;context.by_family[family.id]=(context.by_family[family.id]||0)+1;
     }catch(e){report.failures.push({machine,variant:v.id,stage:'actual_head',message:e.message});}finally{trimCache();}}
    }finally{scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of Array.isArray(o.material)?o.material:[o.material])m.dispose();}});rig.cache.clear();scene.clear();globalThis.gc?.();}
    console.log(machine+'/'+family.id+': '+selected.length+' selected plans');
   }
  }
  assert(found.size>0,'No selected registrations audited');
  if(variants)for(const id of variants)assert(found.has(id),'Missing selected head '+id);
 }catch(e){report.failures.push({stage:'audit_intake',message:e.message});}
 finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
 const finalCode={};await codePins(viewer,finalCode);finalCode['scripts/audit_loaded_heads.mjs']=sha(await fs.readFile(fileURLToPath(import.meta.url)));if(JSON.stringify(finalCode)!==JSON.stringify(report.code_sha256))report.failures.push({stage:'code_freeze',message:'Production code changed during audit; this receipt is not current evidence.'});
 report.modules=used.size;report.missing_requests=[...missing].sort();report.passed=report.failures.length===0;report.completed_at_utc=new Date().toISOString();
 report.open_findings.push({scope:'complete_native_companion_requirements',required_proof:'Source revision requirements for every cover/mount/extension/duct/fan/LED/nozzle/probe/fastener and native finite mating clearance. Source-specific assertions here cover Rapido UHF selection, pinned tLW fan and declared companion modules only.'},{scope:'viewer_consumers',required_proof:'Parent browser review of standalone/installed consumers, host stock replacement, front/side/rear/underside, save/load controls and true machine reset. JSON ID roundtrip and rig teardown are controller scopes.'});
 report.scope='Production catalogs with additions, boards, Rapido adapter and exact Trinity sidecars; actual exported leaf completeness, masks, placements, declared companions, finite vertices, palettes, sampled rigid motion, A-B-A, controller teardown and saved-ID restoration. Non-alpha samples are adapter deltas, not machine travel extrema. No native clearance, fastener engagement, browser or physical-fit certificate.';
 return report;
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 assert(process.argv[2]&&process.argv[3],'Usage: audit_loaded_heads.mjs <assembled-assets> <private-report.json> [--families=a,b] [--machines=standalone,id] [--variants=source-id]');
 const options={};for(const arg of process.argv.slice(4)){const m=arg.match(/^--(families|machines|variants)=(.+)$/);assert(m,'Unknown audit argument '+arg);options[m[1]]=m[2].split(',');}
 const report=await auditLoadedHeads(process.argv[2],options);await fs.writeFile(process.argv[3],JSON.stringify(report,null,2)+'\n');console.log(JSON.stringify({passed:report.passed,configurations:report.configurations,meshChecks:report.meshChecks,failures:report.failures,report:path.resolve(process.argv[3])}));if(!report.passed)process.exitCode=1;
}
