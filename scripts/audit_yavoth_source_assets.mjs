// Required actual-asset release audit. Detailed output belongs outside the site.
import fs from 'node:fs/promises';
import path from 'node:path';
import assert from 'node:assert/strict';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {yavothCowls,yavothRevision,sha256,readAuthorSTL,assertSourceCowl,geometryBufferIdentity} from './yavoth-cowl-identity.mjs';
import {assertYavothExactExportedCompanions,assertYavothCowlSource} from './yavoth-exact-companions.mjs';

export function expectedStandaloneYavothIds(){
 const ids=[];
 for(const e of ['sherpa_mini','orbiter2'])for(const h of ['rapido1_hf','rapido1_uhf'])for(const w of [6,9])for(const c of ['source','rear5'])ids.push(`yavoth59__${e}__${h}__${w}__${c}`);
 for(const e of ['orbiter2','sherpa_mini','sherpa_micro'])for(const h of ['rapido2_hf','rapido2_uhf','revo_voron'])for(const c of ['source','rear5'])ids.push(`head13__yavoth__fixed__${e}__${h}__printed_source__none__${c}`);
 return ids.sort();
}

export function assertYavothCoverage(contexts,sourceVariants){
 const source=sourceVariants.filter(v=>v.toolhead==='yavoth');
 assert.deepEqual(source.map(v=>v.id).sort(),expectedStandaloneYavothIds(),'Yavoth source/archived coverage changed; review exact new sources');
 const standalone=contexts.find(c=>c.machine==='standalone');assert(standalone,'Missing standalone Yavoth consumer');
 assert.deepEqual(standalone.plans.map(v=>v.id).sort(),expectedStandaloneYavothIds(),'Standalone Yavoth consumer omitted variants');
 const rows=[];
 for(const c of contexts){
  assert.equal(new Set(c.plans.map(v=>v.id)).size,c.plans.length,'Duplicate Yavoth registration '+c.machine+'/'+c.gantry);
  if(c.machine!=='standalone'){
   const expected=source.filter(v=>v.hardware_assembled&&v.mount==='fixed'&&v.carriage==='yavoth_mgn12'&&v.belt_width_mm===c.target.belt_width_mm&&['source','rear5'].includes(v.cooling)&&v.registration_source===`yavoth_mgn12_${c.target.belt_width_mm}_${v.cooling}`&&c.registry.sources[v.registration_source]&&(!v.registration_constraints||(v.registration_constraints.machines.includes(c.machine)&&v.registration_constraints.gantries.includes(c.gantry))));
   assert.deepEqual(c.plans.map(v=>v.source_head_configuration).sort(),expected.map(v=>v.id).sort(),'Missing/extra installed Yavoth consumer '+c.machine+'/'+c.gantry);
  }
  for(const v of c.plans){
   assert.equal(v.probe,'none','New Yavoth probe requires source review');assert.equal(v.board,'none','New Yavoth board requires source review');
   rows.push({machine:c.machine,gantry:c.gantry||'machine_gantry',variant:v.id,source_variant:v.source_head_configuration||v.id,belt_width_mm:v.belt_width_mm,base_asset:v.base_asset,reference_only:!v.hardware_assembled});
  }
 }
 for(const w of [6,9])assert(rows.some(r=>r.machine!=='standalone'&&r.belt_width_mm===w),'Missing Yavoth installed width '+w);
 for(const m of ['voron_v24_250_printed','voron_v24_250_ldo_cnc','voron_v24_300_printed','voron_v24_300_ldo_cnc','voron_v24_350_printed','voron_v24_350_ldo_cnc','voron_trident_250','voron_trident_300','voron_trident_350','siboor_v24_350','siboor_trident_300','siboor_trident_350'])assert(rows.some(r=>r.machine===m),'Lost existing Yavoth machine/vendor/size '+m);
 return rows;
}

const display=p=>[p[0]*.001,p[2]*.001,-p[1]*.001];
const all=rig=>[...rig.cache].filter(([,p])=>p.loaded).map(([id,p])=>[id,p.loaded]);
function visibleTree(o,root){for(;o;o=o.parent){if(!o.visible)return false;if(o===root)return true;}return false;}
function snapshot(rig){
 rig.rig.updateMatrixWorld(true);
 return all(rig).filter(([,a])=>a.root.visible).flatMap(([id,a])=>a.entries.filter(e=>visibleTree(e.mesh,a.root)).map(e=>({id,key:String(e.key),matrix:[...e.mesh.matrixWorld.elements],buffers:geometryBufferIdentity(e.mesh.geometry,false)}))).sort((a,b)=>(a.id+'/'+a.key).localeCompare(b.id+'/'+b.key));
}

export async function auditYavothSourceAssets({site,sourceCache,reportFile,allowSourceDownload=true,readAsset=relative=>fs.readFile(path.join(site,relative)),onProgress=()=>{}}){
 const started=new Date().toISOString(),inputs={},failures=[],proofs={},reviews=[];
 const report={schema:'yavoth-source-companions-release-v2',started_utc:started,passed:false,input_sha256:inputs,coverage:[],author_cowls:proofs,reviews,failures,native_solid_review:false,browser_GPU_review:false,whole_mount_certified:false,physical_LED_hardware_certified:false};
 const previousFetch=globalThis.fetch,previousLocation=globalThis.location;
 const read=async name=>{assert(!name.includes('..')&&!path.isAbsolute(name),'Unsafe release path');const b=await readAsset(name);const h=sha256(b);if(inputs[name])assert.equal(h,inputs[name],'Actual input changed during audit '+name);inputs[name]=h;return b;};
 const sources=new Map();
 globalThis.location={href:'http://localhost/viewer/'};
 globalThis.fetch=async value=>{
  const u=new URL(String(value.url||value),globalThis.location.href);
  const name=u.protocol==='file:'?decodeURIComponent(u.pathname).split('/site/').at(-1):decodeURIComponent(u.pathname).replace(/^\//,'');
  try{return new Response(await read(name));}catch(e){if(e.code==='ENOENT')return new Response('',{status:404});throw e;}
 };
 const finish=async()=>{report.completed_utc=new Date().toISOString();if(reportFile)await fs.writeFile(reportFile,JSON.stringify(report,null,2)+'\n');};
 try{
  const retained=JSON.parse(await fs.readFile(new URL('./fixtures/yavoth-author-cowls.json',import.meta.url),'utf8')).retained_input_sha256;
  assert(retained&&Object.keys(retained).length===2,'Missing retained Yavoth source input pins');
  for(const [name,expected]of Object.entries(retained))assert.equal(sha256(await read(name)),expected,'Unreviewed retained Yavoth source input '+name);
  for(const [id,r]of Object.entries(yavothCowls)){
   const file=path.join(sourceCache,path.basename(r.path));let b;
   try{b=await fs.readFile(file);}catch(e){
    if(e.code!=='ENOENT'||!allowSourceDownload)throw e;
    await fs.mkdir(sourceCache,{recursive:true});
    const url=`https://raw.githubusercontent.com/chirpy2605/voron/${yavothRevision}/${r.path}`;
    const response=await previousFetch(url,{signal:AbortSignal.timeout(15000)});assert(response.ok,'Pinned Yavoth author STL unavailable');
    b=Buffer.from(await response.arrayBuffer());readAuthorSTL(b,r);await fs.writeFile(file,b,{flag:'wx'});
   }
   readAuthorSTL(b,r);sources.set(id,b);
  }
  const THREE=await import('three');
  const {loadMachineHeadCatalog,createMachineHeads}=await import('../site/viewer/machine-heads.js');
  const {headPlan}=await import('../site/viewer/head-assembly.js');
  const {machineHeadVariants}=await import('../site/viewer/machine-head-model.mjs');
  const {importedVariant}=await import('../site/viewer/configuration-model.js');
  const initial=await loadMachineHeadCatalog(),contexts=[];
  const headOnly=v=>{const p=headPlan(v);return {...v,machine_head:{...p,hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}};};
  contexts.push({machine:'standalone',heads:{...initial.heads,variants:[]},registry:{sources:initial.registry.sources,assets:initial.registry.assets},plans:initial.heads.variants.filter(v=>v.toolhead==='yavoth').map(headOnly)});
  for(const machine of new Set([...Object.keys(initial.registry.machines),'siboor_trident_300'])){
   const {heads,registry}=await loadMachineHeadCatalog(machine),binding=registry.machines[machine];assert(binding,'Missing registered machine '+machine);
   const gantries=binding.gantries?Object.keys(binding.gantries):machine.startsWith('voron_trident_')?['trident_r2']:[undefined];
   const slimHeads={...heads,variants:[]},slimRegistry={sources:registry.sources,assets:registry.assets};
   for(const gantry of gantries)contexts.push({machine,gantry,heads:slimHeads,registry:slimRegistry,target:binding.gantries?binding.gantries[gantry]:binding,plans:machineHeadVariants(heads,registry,machine,gantry).filter(v=>v.toolhead==='yavoth')});
   globalThis.gc?.();
  }
  report.coverage=assertYavothCoverage(contexts,initial.heads.variants);
  report.contexts=contexts.map(c=>({machine:c.machine,gantry:c.gantry||'machine_gantry',registered_variants:c.plans.length}));
  // Preflight every repaired source, including the archived Micro consumer.
  // Collect all failures before stopping; never turn a held asset into a pass.
  const preflightScene=new THREE.Scene(),preflight=createMachineHeads(preflightScene,{...initial.heads,machine_id:'yavoth_source_review',assets:{...initial.heads.assets,...initial.registry.assets}});
  for(const id of Object.keys(yavothCowls)){
   try{
    const v=contexts[0].plans.find(v=>v.base_asset===id&&!v.hardware_assembled);assert(v,'Missing archived source cowl consumer '+id);await preflight.install(v);
    const asset=preflight.cache.get(id)?.loaded;assert(asset,'Missing actual cowl asset '+id);
    proofs[id]=assertSourceCowl(id,asset,sources.get(id));
   }catch(e){failures.push({stage:'actual_author_cowl_preflight',asset:id,message:e.message});}
  }
  await preflight.install(null);preflight.cache.clear();preflightScene.clear();
  if(failures.length)return report;
  const geometryProofCache=new WeakMap(),validatedGeometry=new WeakSet();
  for(const c of contexts){
   if(!c.plans.length)continue;
   const scene=new THREE.Scene(),catalog={...c.heads,machine_id:c.machine,assets:{...c.heads.assets,...c.registry.assets},variants:c.plans};
   const rig=createMachineHeads(scene,catalog);
   const inspect=v=>{
    const assets=all(rig),p=v.machine_head,expected=[p.base,...p.modules.map(m=>m.id)];
    assert.deepEqual(assets.filter(([,a])=>a.root.visible).map(([id])=>id).sort(),[...expected].sort(),'Yavoth stale/obsolete module');
    if(v.hardware_assembled)assertYavothExactExportedCompanions(v,assets,{validatedGeometry});else{
     assert.equal(expected.length,1,'Archived Yavoth reference acquired undeclared hardware');
     assert.equal(assets.find(([id])=>id===p.base)[1].entries.length,3,'Archived Yavoth cowl/LED owners');
     assertYavothCowlSource(v,assets);
    }
    for(const [id,a]of assets){if(!a.root.visible)continue;
     assert.equal(a.root.parent,rig.rig,'Yavoth companion attached to wrong movement owner');
     const wanted=id===p.base?p.translation:p.modules.find(m=>m.id===id).translation_mm;
     assert.deepEqual(a.root.position.toArray(),display(wanted),'Yavoth companion placement changed');
     assert.equal(new Set(a.entries.map(e=>String(e.key))).size,a.entries.length,'Duplicate source leaf');
     assert.equal(a.entries.length,a.meta.parts.length,'Missing source companion leaf');
     for(const e of a.entries){assert(visibleTree(e.mesh,a.root),'Yavoth hidden/detached companion');if(!validatedGeometry.has(e.mesh.geometry)){geometryBufferIdentity(e.mesh.geometry);validatedGeometry.add(e.mesh.geometry);}}
     if(yavothCowls[id]){
      const e=a.entries.find(e=>String(e.key)===id+'_'+yavothCowls[id].alias),fingerprint=JSON.stringify(geometryBufferIdentity(e.mesh.geometry,false));
      if(geometryProofCache.get(e.mesh.geometry)!==fingerprint){assertSourceCowl(id,a,sources.get(id));geometryProofCache.set(e.mesh.geometry,fingerprint);}
     }
     if(id===p.base){for(const prefix of ['LED_Holder','LED_Insert'])assert.equal(a.meta.parts.filter(q=>q.name.startsWith(prefix)).length,1,'Yavoth missing/duplicate LED owner');}
    }
   };
   try{for(const v of c.plans){
    rig.setDelta([0,0,0]);await rig.install(v);inspect(v);const original=snapshot(rig);
    // Every companion, including the source LED holder/insert, keeps its owner.
    for(const d of [[-37,24,0],[0,0,41],[37,-24,81],[-37,24,0],[0,0,0]]){
     rig.setDelta(d);inspect(v);const moved=snapshot(rig);assert.equal(moved.length,original.length,'Lost Yavoth companion during movement');
     for(let i=0;i<moved.length;i++){assert.deepEqual(moved[i].buffers,original[i].buffers,'Changed complete companion buffer');const matrix=[...original[i].matrix];for(const [k,n]of display(d).entries())matrix[12+k]+=n;assert(moved[i].matrix.every((n,k)=>Number.isFinite(n)&&Math.abs(n-matrix[k])<1e-10),'Wrong Yavoth movement owner');}
    }
    rig.setDelta([0,0,0]);assert.deepEqual(snapshot(rig),original,'Yavoth native reference pose not restored');
    const b=c.plans.find(w=>w.id!==v.id&&w.hotend!==v.hotend&&w.extruder===v.extruder&&w.cooling===v.cooling&&w.belt_width_mm===v.belt_width_mm&&w.gantry===v.gantry&&!!w.hardware_assembled===!!v.hardware_assembled);assert(b,'Missing Yavoth A-B-A partner');
    await rig.install(b);inspect(b);await rig.install(v);inspect(v);assert.deepEqual(snapshot(rig),original,'Yavoth A-B-A left obsolete/mutated companions');
    const saved=JSON.parse(JSON.stringify({machine:c.machine,configuration:v.id}));
    const restored=importedVariant(catalog,saved);assert.equal(restored.id,v.id,'Yavoth save/load changed source selection');
    await rig.install(null);assert(all(rig).every(([,a])=>!a.root.visible),'Yavoth reset retained a companion');
    await rig.install(restored);inspect(restored);assert.deepEqual(snapshot(rig),original,'Yavoth reset/save-load did not restore actual buffers/owners');
    reviews.push({machine:c.machine,gantry:c.gantry||'machine_gantry',variant:v.id,ABA_partner:b.id,reference_reset:true,save_load:true,companion_buffers_and_owners:true,LED_holder_and_insert_once:true,physical_neopixel_identity_claim:false});
   }}finally{await rig.install(null);scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});rig.cache.clear();scene.clear();globalThis.gc?.();}
   await onProgress({machine:c.machine,gantry:c.gantry||'machine_gantry',reviewed:reviews.length,expected:report.coverage.length});
  }
  assert.equal(reviews.length,report.coverage.length,'Yavoth missing actual consumer review');
  for(const [name,hash]of Object.entries(inputs))assert.equal(sha256(await readAsset(name)),hash,'Shipped Yavoth input changed during release audit');
  report.passed=true;return report;
 }catch(e){failures.push({stage:'release_audit',message:e.message});return report;}
 finally{globalThis.fetch=previousFetch;if(previousLocation===undefined)delete globalThis.location;else globalThis.location=previousLocation;await finish();}
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 const value=key=>{const i=process.argv.indexOf(key);assert(i>=0&&process.argv[i+1],'Required '+key);return path.resolve(process.argv[i+1]);};
 const result=await auditYavothSourceAssets({site:value('--site'),sourceCache:value('--source-cache'),reportFile:value('--report')});
 console.log(JSON.stringify({passed:result.passed,consumers:result.coverage.length,reviewed:result.reviews.length,failures:result.failures.length,whole_mount_certified:false}));
 if(!result.passed)process.exitCode=1;
}
