// Focused actual-asset audit. Only caller-listed public cache paths are read;
// controllers always come from this checkout. No downloads or native CAD.
import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {fileURLToPath} from 'node:url';
import {register} from 'node:module';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {createMachineHeads}=await import('../site/viewer/machine-heads.js');
const {withHeadAdditions}=await import('../site/viewer/head-additions.mjs');
const {withRapidoXUhfCover}=await import('../site/viewer/rapido-x-uhf-cover.mjs');
const {withEmbeddedBoards,xolEmbeddedBoard,sbEmbeddedBoard}=await import('../site/viewer/embedded-boards.mjs');
const {monolithHeadCatalog,monolithCompanion}=await import('../site/viewer/monolith-head-model.mjs');
const {withMonolithMachines}=await import('../site/viewer/monolith-machine-model.mjs');
const {expandedPrinterCatalog}=await import('../site/viewer/machine-head-model.mjs');
const {sizedSiboorCatalog,registerSizedSiboor}=await import('../site/viewer/siboor-catalog.mjs');
const {configurationById,importedVariant,resolveVariant,choicesFor,headBuilderDimensions}=await import('../site/viewer/configuration-model.js');
const {sphinxCompanionPresets}=await import('../site/viewer/head-companion-presets.mjs');
const {headPlan}=await import('../site/viewer/head-assembly.js');
const {machineChoices}=await import('../site/viewer/machines.js');
const {validateEvaOptionsRegistry}=await import('../site/viewer/eva-options.mjs');
const {evaInstallationSupport}=await import('../site/viewer/eva-installations.mjs');
const {assertExportedHeadParts,assertHeadCompanions}=await import('./audit_loaded_heads.mjs');

const [site,bindingsFile,planFile,destination]=process.argv.slice(2);
assert(site&&bindingsFile&&planFile&&destination,'Usage: audit_source_backed_combinations.mjs SITE CATALOG_BINDINGS ASSET_PLAN REPORT');
const sha=b=>createHash('sha256').update(b).digest('hex'),read=async p=>JSON.parse(await fs.readFile(p));
const bindingsBytes=await fs.readFile(bindingsFile),planBytes=await fs.readFile(planFile),bindings=JSON.parse(bindingsBytes),plan=JSON.parse(planBytes);
const report={schema:'source-backed-combinations-actual-v1',started_at_utc:new Date().toISOString(),passed:false,
 bindings_sha256:sha(bindingsBytes),asset_plan_sha256:sha(planBytes),catalogs:{},assets:{},code_sha256:{},
 coverage:[],restored_tuples:[],actual_cases:[],failures:[],open_findings:[],
 execution:{node_heap_limit_MiB:384,v8_pool_size:1,actual_jobs:1,asset_resolution:'explicit listed actual_path, current catalog pin, then current bytes/hash'},
 scope:{actual_exported_head_leaves:true,production_head_controller:true,all_machine_registration_coverage:true,
 browser_visual_review:false,native_solid_clearance:false,complete_companion_fit_certified:false,
 host_stock_replacement:false,continuous_axis_clearance:false}};
const catalogBytes=new Map(),requests=new Map(),pinnedPaths=new Map();
async function catalog(name){
 if(catalogBytes.has(name))return JSON.parse(catalogBytes.get(name));
 const b=await fs.readFile(path.join(site,name));catalogBytes.set(name,b);report.catalogs[name]={sha256:sha(b),bytes:b.length};
 const declared=bindings.filter(r=>r.path===name&&r.catalog!=='historical-path-hint-only');
 if(declared.length)assert(declared.some(r=>r.sha256===sha(b)&&r.bytes===b.length),'Current catalog differs from public binding '+name);
 return JSON.parse(b);
}
const delivery=await catalog('APPROVED_DELIVERY.json');
async function bindFile(name,pin=null,localDirectory=null,url=null){
 const declared=pin||delivery.files.find(r=>r.path===name);assert(declared,'Missing current catalog pin '+name);
 const candidates=bindings.filter(r=>r.path===name&&r.sha256===declared.sha256&&r.bytes===declared.bytes
  &&(!localDirectory||(r.local_directory||r.directory)===localDirectory));
 assert(candidates.length,'Missing exact public binding '+name);
 const candidate=candidates.find(r=>r.catalog!=='historical-path-hint-only')||candidates[0];
 const absolute=path.resolve(candidate.actual_path);
 const item={...declared,path:name,actual_path:absolute};
 const key=localDirectory?localDirectory+'/'+name:name;
 if(requests.has(key))assert.equal(requests.get(key).sha256,item.sha256,'Conflicting resource '+key);
 requests.set(key,item);if(url)requests.set(url,item);pinnedPaths.set(absolute,item);
 return item;
}
async function assetSpec(id,spec){
 if(report.assets[id])return;
 assert(spec,'Unregistered actual module '+id);
 let metadata;
 if(spec.external){
  for(const name of ['parts.json','model.glb']){
   const pin=spec.files[name];assert(pin,'Missing component descriptor '+id+'/'+name);
   const item=await bindFile(pin.path,pin,spec.external.local_directory,new URL(pin.path,spec.external.base_url).href);
   if(name==='parts.json')metadata=item;
  }
 }else{
  metadata=await bindFile(spec.meta);await bindFile(spec.glb+'.gz');
 }
 const b=await verified(metadata),meta=JSON.parse(b);
 assert(Array.isArray(meta.parts)&&meta.parts.length,'Missing actual leaf metadata '+id);
 report.assets[id]={metadata_sha256:sha(b),metadata_path:metadata.actual_path,parts:meta.parts.length,
  leaf_ids:meta.parts.map(p=>String(p.key)),components:Object.fromEntries([...new Set(meta.parts.map(p=>p.component||'unclassified'))].map(k=>[k,meta.parts.filter(p=>(p.component||'unclassified')===k).length]))};
}
async function verified(item){
 const bytes=await fs.readFile(item.actual_path);assert.equal(bytes.length,item.bytes,'Changed public asset size '+item.path);
 assert.equal(sha(bytes),item.sha256,'Changed public asset hash '+item.path);return bytes;
}
async function pinCode(){
 const pins={},seen=new Set(),root=fileURLToPath(new URL('../',import.meta.url));
 async function visit(url){
  url=new URL(url);url.search='';url.hash='';if(seen.has(url.href))return;seen.add(url.href);
  const file=fileURLToPath(url),relative=path.relative(root,file).replaceAll('\\','/');assert(!relative.startsWith('../'),'Controller dependency escaped current checkout');
  const bytes=await fs.readFile(file);pins[relative]=sha(bytes);
  for(const m of bytes.toString('utf8').matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"]+)\1/g))await visit(new URL(m[2],url));
 }
 // Pin the complete local import closure used by this audit, including the
 // loader's bare-three target. Unrelated machine route work is not evidence
 // for these head plans and must not invalidate a disjoint focused review.
 for(const url of [import.meta.url,new URL('./three-test-loader.mjs',import.meta.url),new URL('../site/viewer/vendor/three.module.js',import.meta.url)])await visit(url);
 return pins;
}
report.code_sha256=await pinCode();
const oldFetch=globalThis.fetch,oldLocation=globalThis.location;
globalThis.location={href:'http://localhost/viewer/'};
globalThis.fetch=async input=>{
 const u=new URL(String(input.url||input),location.href),relative=u.protocol==='file:'?decodeURIComponent(u.pathname).split('/site/').at(-1):decodeURIComponent(u.pathname).replace(/^\//,'');
 const clean=new URL(u);clean.search='';
 if(requests.has(relative)||requests.has(clean.href))return new Response(await verified(requests.get(relative)||requests.get(clean.href)));
 if(!relative.includes('/')&&relative.endsWith('.json'))return new Response(Buffer.from(JSON.stringify(await catalog(relative))));
 throw Error('Unlisted public asset request '+clean.href);
};
function snapshot(rig){
 rig.rig.updateMatrixWorld(true);const rows=[];
 for(const [id,p]of rig.cache)if(p.loaded?.root.visible)for(const e of p.loaded.entries)if(e.mesh.visible)rows.push({id,key:e.key,matrix:e.mesh.matrixWorld.elements.map(v=>Math.round(v*1e11)/1e11)});
 return rows.sort((a,b)=>(a.id+'/'+a.key).localeCompare(b.id+'/'+b.key));
}
async function exercise(catalog,a,b,label){
 const scene=new THREE.Scene(),rig=createMachineHeads(scene,catalog);
 const onlyHead=v=>{const result={...v};delete result.machine_gantry;return result;};
 // Preserve production installed head plans. Host/gantry models and their
 // stock visibility are deliberately outside this focused head audit.
 const activeA=onlyHead(a),activeB=onlyHead(b);
 for(const v of [a,b])for(const id of [v.machine_head.base,...v.machine_head.modules.map(m=>m.id)])await assetSpec(id,catalog.base_assets?.[id]||catalog.assets[id]);
 let meshChecks=0;
 async function inspect(v){
  const expected=assertHeadCompanions(v),wanted=new Set(expected.map(e=>e.id));
  for(const[id,p]of rig.cache)if(p.loaded){
   const loaded=p.loaded;assert.equal(loaded.root.visible,wanted.has(id),'Stale module '+label+'/'+id);if(!wanted.has(id))continue;
   const meta=JSON.parse(await verified(requests.get((catalog.base_assets?.[id]||catalog.assets[id]).external?
    (catalog.base_assets?.[id]||catalog.assets[id]).external.local_directory+'/'+(catalog.base_assets?.[id]||catalog.assets[id]).files['parts.json'].path:
    (catalog.base_assets?.[id]||catalog.assets[id]).meta)));
   const exported=assertExportedHeadParts(meta,loaded,id),entry=expected.find(e=>e.id===id),hidden=new Set((entry.hidden_keys||[]).map(String));
   for(const k of hidden)assert(exported.has(k),'Stale mask '+id+'/'+k);
   assert.deepEqual(loaded.root.position.toArray(),[entry.translation_mm[0]*.001,entry.translation_mm[2]*.001,-entry.translation_mm[1]*.001]);
   for(const e of loaded.entries){
    assert.equal(e.mesh.visible,!hidden.has(String(e.key))&&!['rail_reference','dock','shuttle_reference'].includes(e.component),'Leaf visibility '+label+'/'+id+'/'+e.key);
    const pos=e.mesh.geometry.attributes.position;assert(pos?.count>0);for(const n of pos.array)assert(Number.isFinite(n));meshChecks++;
   }
  }
 }
 try{
  await rig.install(activeA);await inspect(activeA);const original=snapshot(rig);
  await rig.install(activeB);await inspect(activeB);await rig.install(activeA);await inspect(activeA);assert.deepEqual(snapshot(rig),original,'A-B-A source leaves or poses changed');
  const poses=[[-37,-24,0],[0,0,40.5],[37,24,81],[0,0,40.5],[-37,-24,0],[0,0,0]];
  for(const delta of poses){rig.setDelta(delta);assert.equal(snapshot(rig).length,original.length);assert(snapshot(rig).every(r=>r.matrix.every(Number.isFinite)));}
  assert.deepEqual(snapshot(rig),original,'Adapter delta reset changed source assembly');
  await rig.install(null);assert([...rig.cache.values()].every(p=>!p.loaded?.root.visible),'Native teardown retained parts');
  const saved=JSON.parse(JSON.stringify({machine:catalog.machine_id,configuration:a.id})),restored=importedVariant(catalog,saved);
  await rig.install(onlyHead(restored));await inspect(activeA);assert.deepEqual(snapshot(rig),original,'Saved exact ID changed actual assembly');
  const preset=sphinxCompanionPresets.find(p=>p.to===(a.source_head_configuration||a.id));let legacySave=null;
  if(preset){
   legacySave=a.id===preset.to?preset.from:a.id.slice(0,-preset.to.length)+preset.from;
   const migrated=importedVariant(catalog,JSON.parse(JSON.stringify({machine:catalog.machine_id,configuration:legacySave})));
   assert.equal(migrated,a);await rig.install(onlyHead(migrated));await inspect(activeA);
   assert.deepEqual(snapshot(rig),original,'Legacy saved ID changed exported companion assembly');
  }
  report.actual_cases.push({label,machine:catalog.machine_id,A:a.id,B:b.id,base:a.machine_head.base,modules:a.machine_head.modules.map(m=>m.id),visible_leaves:original.length,mesh_checks:meshChecks,
   A_B_A:true,adapter_delta_samples:poses,teardown_and_reinstall:true,saved_id_restored:true,legacy_saved_id:legacySave,host_stock_replacement_reviewed:false});
 }finally{
  await rig.install(null);scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});rig.cache.clear();scene.clear();globalThis.gc?.();
 }
}
try{
 const raw=await catalog('TOOLHEAD_CONFIGURATIONS.json'),additions=await catalog('HEAD_ADDITIONS.json');
 await assetSpec('xol',raw.base_assets.xol);await assetSpec('stealthburner',raw.base_assets.stealthburner);
 const metadata=async spec=>JSON.parse(await verified(requests.get(spec.meta)));
 const heads=withEmbeddedBoards(withRapidoXUhfCover(withHeadAdditions(raw,additions)),[xolEmbeddedBoard(await metadata(raw.base_assets.xol)),sbEmbeddedBoard(await metadata(raw.base_assets.stealthburner))]);
 heads.machine_id='toolhead';heads.dimensions=headBuilderDimensions;
 const registry=await catalog('MACHINE_HEAD_REGISTRATIONS.json'),gantries=await catalog('GANTRY_CONFIGURATIONS.json'),mounts=await catalog('MONOLITH_MACHINE_REGISTRATIONS.json');
 const siboor=await catalog('SIBOOR_TRIDENT_ASSETS.json'),bank=await catalog('TOOLCHANGER_BANK.json');registerSizedSiboor(siboor,registry,bank,{machines:{}});
 const bench=monolithHeadCatalog(heads,registry,gantries),catalogs=[bench];
 // Limit host composition to the two changed source migrations. Keeping the
 // unrelated full catalog for every host exceeds the prescribed 384 MiB heap.
 const affectedHeads={...heads,variants:heads.variants.filter(v=>sphinxCompanionPresets.some(p=>p.gantry==='sphinx_monolith'&&p.to===v.id))};
 const currentMachines=machineChoices.filter(m=>m.available!==false);assert.deepEqual(currentMachines.map(m=>m.id).sort(),plan.map(m=>m.id).sort(),'Missing or unregistered machine in supplied release coverage');
 for(const machine of currentMachines){
  const applicable=!!mounts.machines[machine.id];report.coverage.push({machine:machine.id,available:true,monolith_registration:applicable,geometry_scope:applicable?'Shared source head plan groups; full host geometry not audited here':'Outside changed composition; release asset-plan row present',expected_model_sha256:plan.find(r=>r.id===machine.id).expected_model_sha256});
  if(!applicable)continue;
  const current={machine_id:machine.id,gantries:[],variants:[],assets:{},sources:[],configuration_aliases:heads.configuration_aliases};
  catalogs.push(withMonolithMachines(current,affectedHeads,registry,gantries,mounts));
 }
 for(const c of catalogs)for(const v of c.variants){
  const p=sphinxCompanionPresets.find(p=>p.to===v.source_head_configuration);if(!p)continue;
  const old=v.id.slice(0,-p.to.length)+p.from;
  assert.equal(configurationById(c,old),v);assert.equal(importedVariant(c,{machine:c.machine_id,configuration:old}),v);
  assert.equal(monolithCompanion(heads,v)?.id,p.to);
  assert.equal(resolveVariant(c,{...v,hotend:'unregistered'}),null);
  const source=heads.variants.find(s=>s.id===p.to),native=headPlan(source);
  assert.deepEqual(v.machine_head.modules.map(m=>[m.id,m.hidden_keys||[]]),native.modules.map(m=>[m.id,m.hidden_keys||[]]));
  for(const m of v.machine_head.modules)assert(m.translation_mm.every((n,i)=>Math.abs(n-(v.machine_head.translation_delta_mm[i]+source.modules.find(s=>s.id===m.id).translation_mm[i]))<1e-8));
  report.restored_tuples.push({machine:c.machine_id,id:v.id,legacy_id:old,source_id:p.to,gantry:v.gantry,belt_width_mm:v.belt_width_mm,
   toolhead:v.toolhead,extruder:v.extruder,hotend:v.hotend,probe:v.probe,board:v.board,cooling:v.cooling,
   base:v.machine_head.base,modules:v.machine_head.modules.map(m=>m.id),plan_sha256:sha(JSON.stringify(v.machine_head))});
 }
 const sourcePlan=v=>{const p=headPlan(v);return {...v,machine_head:{...p,hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}};};
 const standalone={...heads,variants:heads.variants.map(sourcePlan)};
 const targets=sphinxCompanionPresets.filter(p=>p.gantry==='sphinx_monolith').map(p=>p.to);
 for(const id of targets){
  const a=standalone.variants.find(v=>v.id===id),b=standalone.variants.find(v=>v.id===targets.find(s=>s!==id));await exercise(standalone,a,b,'standalone migrated Sphinx');
  const aBench=bench.variants.find(v=>v.source_head_configuration===id&&v.belt_width_mm===6),bBench=bench.variants.find(v=>v.source_head_configuration===b.id&&v.gantry===aBench.gantry);await exercise(bench,aBench,bBench,'Monolith migrated Sphinx head plan');
 }
 for(const width of [6,9])for(const family of ['stealthburner','xol','jabberwocky']){
  const a=bench.variants.find(v=>v.belt_width_mm===width&&v.toolhead===family),b=bench.variants.find(v=>v.gantry===a.gantry&&v.toolhead===(family==='xol'?'stealthburner':'xol'));
  assert(a&&b);assert.equal(monolithCompanion(heads,a)?.id,a.source_head_configuration);await exercise(bench,a,b,'existing non-Sphinx Monolith '+family+'/'+width);
 }
 for(const machine of ['siboor_trident_300','siboor_trident_350']){
  const c=expandedPrinterCatalog(sizedSiboorCatalog(await catalog('ASSEMBLY_CONFIGURATIONS.json'),siboor,machine),heads,registry,machine),stock=c.variants[0];
  assert(choicesFor(c,stock,'toolhead').some(r=>r.id==='sphinx'));const chosen=resolveVariant(c,{...stock,toolhead:'sphinx'},'toolhead');assert.equal(chosen.gantry,'trident_r2');
  assert(!c.variants.some(v=>v.toolhead==='sphinx'&&v.gantry==='siboor_awd'),'Unregistered 9 mm Sphinx mount escaped');
  const a=c.variants.find(v=>v.source_head_configuration==='sphinx19__voron__tricorn__short'),b=c.variants.find(v=>v.source_head_configuration==='sphinx44__voron__goliath_air__short__none');assert(a&&b);
  await exercise(c,a,b,'SIBOOR Sphinx exact registered R2');
 }
 const options=await catalog('EVA_OPTIONS.json'),installations=await catalog('EVA_INSTALLATIONS.json');validateEvaOptionsRegistry(options,heads);
 const front=await catalog('EVA_FRONT_SURFACES.json');await assetSpec(front.asset.component_id,front.asset);
 for(const host of Object.values(installations.machines)){
  const support=evaInstallationSupport(host,heads,options);assert.equal(support.variants.length,options.hosts[host.machine_id].configurations.length);
  for(const tuple of support.variants){
   const a=standalone.variants.find(v=>v.id===tuple.id),b=standalone.variants.find(v=>v.eva&&v.eva.generation!==a.eva.generation);assert(a&&b);
   assert.equal(resolveVariant(standalone,{...a,hotend:'missing'}),null);await exercise(standalone,a,b,'EVA exact source option '+host.machine_id);
  }
 }
 report.open_findings.push(
  {priority:1,scope:'Monolith fixed heads other than Sphinx',finding:'Trinity/Crossbow source assemblies have no exact Monolith installed datum/receiver registration in the current registry. Names and 6/9 mm labels cannot establish that interface.'},
  {priority:1,scope:'SIBOOR AWD Sphinx',finding:'Current stock AWD binding is 9 mm. Existing VORON Sphinx registrations are 6 mm; the R2 gantry choice remains available. No 9 mm native stock carriage binding was added.'},
  {priority:1,scope:'Complete companion requirements',finding:'Actual exported leaves and declared base/hotend/extruder/fan modules are checked. Source-specific missing fastener/LED/blower/duct/probe requirements and native mating clearance remain open; inherited source contacts retain their original fit states.'},
  {priority:2,scope:'EVA installed source hosts',finding:'All six exact source-host recipes remain composed. This audit loads their standalone head plans; complete source-host controllers, native reset, measured travel and browser appearance remain separate parent release checks.'},
  {priority:2,scope:'Browser and publication',finding:'Parent owns browser screenshots, served revision, PTFE and full release checks. This receipt is not browser or native-solid evidence.'});
 for(const[name,b]of catalogBytes)assert.equal(sha(await fs.readFile(path.join(site,name))),sha(b),'Current catalog changed during audit '+name);
 assert.deepEqual(await pinCode(),report.code_sha256,'Current controller changed during actual audit');
 for(const item of pinnedPaths.values())await verified(item);
 report.actual_files=[...pinnedPaths.values()];
 report.passed=true;
}catch(error){report.failures.push({message:error.message,stack:error.stack});process.exitCode=1;}
finally{globalThis.fetch=oldFetch;globalThis.location=oldLocation;}
report.completed_at_utc=new Date().toISOString();await fs.mkdir(path.dirname(path.resolve(destination)),{recursive:true});await fs.writeFile(destination,JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify({passed:report.passed,machine_rows:report.coverage.length,restored_tuples:report.restored_tuples.length,actual_cases:report.actual_cases.length,assets:Object.keys(report.assets).length,failures:report.failures.map(f=>f.message),report:path.resolve(destination)}));
