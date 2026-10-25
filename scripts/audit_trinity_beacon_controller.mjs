// Focused production controller exercise: keep unrelated catalogs out of RAM.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {register} from 'node:module';
import {fileURLToPath} from 'node:url';
register('./three-test-loader.mjs',import.meta.url);
const THREE=await import('three');
const {withHeadAdditions}=await import('../site/viewer/head-additions.mjs');
const {createMachineHeads}=await import('../site/viewer/machine-heads.js');
const {headPlan}=await import('../site/viewer/head-assembly.js');
const {headBuilderDimensions,importedVariant}=await import('../site/viewer/configuration-model.js');
const {assertExportedHeadParts,assertHeadCompanions}=await import('./audit_loaded_heads.mjs');
const sha=b=>createHash('sha256').update(b).digest('hex');
const A='trinity88__n19',B='ahi17__a4t_rapido_prints';
function codePins(){
 const root=fileURLToPath(new URL('../',import.meta.url)),pins={},seen=new Set();
 function visit(url){url=new URL(url);url.search='';if(seen.has(url.href))return;seen.add(url.href);const file=fileURLToPath(url),relative=path.relative(root,file).replaceAll('\\','/');assert(!relative.startsWith('../'));const bytes=fs.readFileSync(file);pins[relative]=sha(bytes);for(const m of bytes.toString().matchAll(/(?:\bfrom\s*|\bimport\s*\(\s*|\bimport\s*)(['"])(\.[^'"]+)\1/g))visit(new URL(m[2],url));}
 for(const url of [import.meta.url,new URL('./three-test-loader.mjs',import.meta.url),new URL('../site/viewer/vendor/three.module.js',import.meta.url)])visit(url);return pins;
}
function catalog(site){
 const raw=JSON.parse(fs.readFileSync(path.join(site,'TOOLHEAD_CONFIGURATIONS.json'))),add=JSON.parse(fs.readFileSync(path.join(site,'HEAD_ADDITIONS.json')));
 const original=raw.variants.find(v=>v.id===B),native=add.variants.find(v=>v.id===A);assert(original&&native,'Exact controller recipes missing');
 raw.variants=[original];raw.configuration_aliases={};add.variants=[native];add.assets={[native.base_asset]:add.assets[native.base_asset]};globalThis.gc?.();
 const result=withHeadAdditions(raw,add);result.machine_id='toolhead';result.dimensions=headBuilderDimensions;
 result.variants=result.variants.filter(v=>[A,B].includes(v.id)).map(v=>{const p=headPlan(v);return {...v,machine_head:{...p,hidden:[...p.hidden],modules:p.modules.filter(m=>m.role!=='dock')}};});assert.equal(result.variants.length,2);
 return result;
}
function inputPlan(site){
 const c=catalog(site),ids=[...new Set(c.variants.flatMap(v=>[v.machine_head.base,...v.machine_head.modules.map(m=>m.id)]))];
 return {schema:'trinity-beacon-controller-input-plan-v1',cases:[A,B],assets:ids.map(id=>({id,spec:c.base_assets[id]||c.assets[id]}))};
}
function snapshot(rig){
 rig.rig.updateMatrixWorld(true);const out=[];
 for(const[id,p]of rig.cache)if(p.loaded?.root.visible)for(const row of p.loaded.entries)if(row.mesh.visible)out.push({id,key:row.key,matrix:[...row.mesh.matrixWorld.elements]});
 return out.sort((a,b)=>(a.id+'/'+a.key).localeCompare(b.id+'/'+b.key));
}
function assertPose(rows, original, delta){
 assert.equal(rows.length,original.length,'Moving source leaves disappeared');
 const shift=[delta[0]*.001,delta[2]*.001,-delta[1]*.001];
 for(let i=0;i<rows.length;i++){
  assert.equal(rows[i].id,original[i].id);assert.equal(rows[i].key,original[i].key);
  for(let j=0;j<16;j++){
   const expected=original[i].matrix[j]+(j>=12&&j<=14?shift[j-12]:0);
   assert(Number.isFinite(rows[i].matrix[j])&&Math.abs(rows[i].matrix[j]-expected)<1e-10,'Incorrect source leaf displacement '+rows[i].key+'/'+j);
  }
 }
}
async function execute(inputs){
 const site=inputs.site,c=catalog(site),plan=inputPlan(site);assert.deepEqual(plan,inputs.plan,'Controller source plan changed');
 const codeBefore=codePins();
 const before=Object.fromEntries(['HEAD_ADDITIONS.json','TOOLHEAD_CONFIGURATIONS.json','ASSET_BUNDLE.json','APPROVED_DELIVERY.json'].map(n=>[n,sha(fs.readFileSync(path.join(site,n)))]));
 const requests=new Map();for(const row of inputs.resources){assert(path.isAbsolute(row.actual_path));const bytes=fs.readFileSync(row.actual_path);assert.equal(bytes.length,row.bytes);assert.equal(sha(bytes),row.sha256);for(const key of [row.path,...(row.local_directory?[row.local_directory+'/'+row.path]:[]),row.url].filter(Boolean))requests.set(key,row);}
 const previousFetch=globalThis.fetch,previousLocation=globalThis.location;
 globalThis.location={href:'http://localhost/viewer/'};
 globalThis.fetch=async input=>{
  const url=new URL(String(input.url||input),location.href),relative=url.protocol==='file:'?decodeURIComponent(url.pathname).split('/site/').at(-1):decodeURIComponent(url.pathname).replace(/^\//,'');url.search='';
  if(relative==='ASSET_BUNDLE.json'){const bytes=fs.readFileSync(path.join(site,relative));assert.equal(sha(bytes),before[relative]);return new Response(bytes);}
  const row=requests.get(relative)||requests.get(url.href);assert(row,'Unlisted source model request '+url.href);const b=fs.readFileSync(row.actual_path);assert.equal(b.length,row.bytes);assert.equal(sha(b),row.sha256);return new Response(b);
 };
 const scene=new THREE.Scene(),rig=createMachineHeads(scene,c),a=c.variants.find(v=>v.id===A),b=c.variants.find(v=>v.id===B);let materialChecks=0;
 async function inspect(v){
  const expected=assertHeadCompanions(v),ids=new Set(expected.map(r=>r.id));
  for(const[id,item]of rig.cache)if(item.loaded){
   const loaded=item.loaded;assert.equal(loaded.root.visible,ids.has(id),'Stale active module');if(!ids.has(id))continue;const rows=assertExportedHeadParts(loaded.meta,loaded,id);assert(rows.size>0);
   for(const row of loaded.entries){const hidden=new Set(expected.find(e=>e.id===id).hidden_keys||[]);assert.equal(row.mesh.visible,!hidden.has(row.key)&&!['rail_reference','dock','shuttle_reference'].includes(row.component));}
  }
 }
 function palette(colors){
  rig.setPalette(colors);const rows=rig.cache.get(a.machine_head.base).loaded.entries,roles=new Set();
  for(const row of rows)for(const[i,m]of row.materials.entries()){
   const value=colors[row.role],expected=value?new THREE.Color(value):row.colors[i];assert(m.color.equals(expected),'Printed color or purchased material changed '+row.key);if(value)roles.add(row.role);materialChecks++;
  }
  assert(roles.has('base')&&roles.has('accent'));
 }
 try{
  globalThis.gc?.();await rig.install(a);await inspect(a);const original=snapshot(rig);assert.equal(rig.cache.get(a.machine_head.base).loaded.meta.parts.length,95);
  assert.throws(()=>assertPose(original,original,[-37,-24,0]),/Incorrect source leaf displacement/,'No-op movement must fail');
  const sensor=rig.cache.get(a.machine_head.base).loaded.entries.filter(r=>r.key==='n19_65');assert.equal(sensor.length,1);assert(sensor[0].mesh.visible);
  for(const colors of [{base:'#f0f4f8',accent:'#6a21d9'},{base:'#6a21d9',accent:'#f0f4f8'},{base:'#24272c',accent:'#e32636'}]){
   for(const delta of [[-37,-24,0],[37,24,81],[0,0,40.5],[0,0,0]]){rig.setDelta(delta);palette(colors);assertPose(snapshot(rig),original,delta);}
  }
  assert.deepEqual(snapshot(rig),original);await rig.install(b);await inspect(b);await rig.install(a);await inspect(a);assert.deepEqual(snapshot(rig),original,'A-B-A changed source placement/visibility');
  await rig.install(null);assert([...rig.cache.values()].every(p=>!p.loaded?.root.visible));const restored=importedVariant(c,JSON.parse(JSON.stringify({machine:c.machine_id,configuration:A})));assert.equal(restored,a);await rig.install(restored);await inspect(a);assert.deepEqual(snapshot(rig),original,'Reset/save-load changed assembly');palette({base:'#24272c',accent:'#e32636'});
  for(const[name,hash]of Object.entries(before))assert.equal(sha(fs.readFileSync(path.join(site,name))),hash);
  for(const row of inputs.resources)assert.equal(sha(fs.readFileSync(row.actual_path)),row.sha256);
  assert.deepEqual(codePins(),codeBefore,'Production adapter changed during inspection');
  return {passed:true,configuration:A,alternate:B,parts:95,visible_leaves:original.length,material_checks:materialChecks,A_B_A:true,teardown_reset:true,saved_id_restored:true,contrasting_and_reversed_palettes:true,per_leaf_expected_displacement:true,no_op_movement_rejected:true,delta_samples:[[-37,-24,0],[37,24,81],[0,0,40.5],[0,0,0]],catalog_sha256:before,code_sha256:codeBefore,native_solid_clearance:false,full_physical_fit_certified:false,scope:'Two exact source head recipes through the production controller; palette/material isolation, sampled rigid deltas and identity restoration. No complete machine geometry, continuous travel or native-solid clearance certification.'};
 }finally{
  await rig.install(null);scene.traverse(o=>{if(o.isMesh){o.geometry.dispose();for(const m of [].concat(o.material))m.dispose();}});rig.cache.clear();scene.clear();globalThis.fetch=previousFetch;globalThis.location=previousLocation;globalThis.gc?.();
 }
}
const args=process.argv.slice(2);
if(args[0]==='--plan'){assert.equal(args.length,2);console.log(JSON.stringify(inputPlan(args[1])));}
else {assert(args.length===4&&args[0]==='--inputs'&&args[2]==='--report','Use --plan SITE or --inputs JSON --report REPORT');const r=await execute(JSON.parse(fs.readFileSync(args[1])));fs.writeFileSync(args[3],JSON.stringify(r,null,2)+'\n');console.log(JSON.stringify({passed:r.passed,configuration:r.configuration,parts:r.parts,visible_leaves:r.visible_leaves,material_checks:r.material_checks,A_B_A:r.A_B_A,teardown_reset:r.teardown_reset,saved_id_restored:r.saved_id_restored,scope:r.scope}));}
