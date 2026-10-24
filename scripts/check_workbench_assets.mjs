import assert from 'node:assert/strict';
import {readFile,access,writeFile} from 'node:fs/promises';
import {pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {gunzipSync} from 'node:zlib';
import path from 'node:path';
import {gantryChoice,gantryDimensions} from '../site/viewer/gantry-model.js';
import {catalogDimensions,choicesFor,resolveVariant} from '../site/viewer/configuration-model.js';
import {headPlan,headPlacement} from '../site/viewer/head-assembly.js';
import {changerDimensions,changerChoice,changerChoices,changerPlacement} from '../site/viewer/toolchanger-model.js';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {machineChoices as currentMachines} from '../site/viewer/machines.js';
import {layoutMachineRecipes as currentRecipes} from '../site/viewer/layout-machine-recipes.mjs';

// Read only explicitly supplied release roots. Never search drives or download
// substitute models. Missing inputs and unknown providers are release failures.
const legacyRegistries=['V0_MACHINES.json','V24_MACHINES.json','KIT_MACHINES.json'];
const digest=bytes=>createHash('sha256').update(bytes).digest('hex');
const safe=name=>{assert(typeof name==='string'&&name&&!path.isAbsolute(name)&&!/[\\:]/.test(name)&&!name.split('/').some(p=>!p||p==='..'||p==='.'),'Unsafe asset path: '+name);return name};
const exists=async file=>{try{await access(file);return true}catch(error){if(error.code==='ENOENT')return false;throw error}};
export async function locateWorkbenchAsset(relative,roots,{gzip=false,hasFile=exists}={}){
 safe(relative);
 for(const directory of [...new Set(roots)])for(const name of gzip?[relative,relative+'.gz']:[relative]){
  const file=path.join(directory,name);if(await hasFile(file))return file;
 }
 assert.fail('Missing actual registered asset: '+relative+'; supply its explicit asset root');
}
export function assertRegistrationCoverage(machines,recipes,delivery){
 const ids=machines.filter(m=>m.available!==false).map(m=>m.id),same=(rows,label)=>{
  assert(rows.length>0&&new Set(rows).size===rows.length,'Empty or duplicate '+label);
  assert.deepEqual([...rows].sort(),[...ids].sort(),'Missing or unregistered machine in '+label);
 };
 same(ids,'selector');same(recipes.map(r=>r.machine_id),'recipes');same(delivery.machine_ids,'approved delivery');
 assert.equal(delivery.schema,'approved-static-delivery-v1');
 return ids;
}
export function assertLegacyRegistryScope(delivery,present){
 const declared=legacyRegistries.filter(f=>delivery.files.some(row=>row.path===f));
 if(present.length||declared.length||delivery.legacy_archive_required!==false){
  assert.deepEqual([...present].sort(),[...legacyRegistries].sort(),'Missing required legacy machine registries');
  return 'legacy-and-current';
 }
 return 'current-approved-per-file-delivery';
}
// These source-specific checks are retained from the original nine-machine
// phase, now applied to every current V2.4 reference registration as well.
export function auditRailMounts(meta,machine){
 const frameForRail={298:299,414:415,440:441,1074:1075,1093:1094,1112:1113,1131:1132};
 const rows=new Map(meta.parts.map(r=>[r.key,r]));let count=0;
 for(const nut of meta.parts.filter(r=>r.key.includes('_tnut_'))){
  const match=nut.key.match(/^v24_rail(\d+)_tnut_(\d+)$/);assert(match,'Unknown rail-nut source identity');
  const [,rail,index]=match,railKey=`v24_${rail.padStart(5,'0')}`,frameKey=`v24_${String(frameForRail[rail]).padStart(5,'0')}`,boltKey=`v24_rail${rail}_bolt_${index}`;
  assert(nut.name.includes('M3'));assert.equal(nut.rail_mount?.thread,'M3');assert.equal(nut.rail_mount.rail_key,railKey);assert.equal(nut.rail_mount.bolt_key,boltKey);
  assert.equal(nut.method,'native_m3_nut_registered_to_rail_screw');assert(rows.has(railKey)&&rows.has(boltKey)&&rows.has(frameKey),'Missing rail mating metadata');
  assert.deepEqual(nut.motion_axes,rows.get(railKey).motion_axes);assert.deepEqual(nut.motion_axes,rows.get(boltKey).motion_axes);
  const frame=rows.get(frameKey);for(let a=0;a<3;a++){assert(nut.bounds_mm[0][a]>=frame.bounds_mm[0][a]-.001);assert(nut.bounds_mm[1][a]<=frame.bounds_mm[1][a]+.001)}
  count++;
 }
 assert.equal(count,{250:54,300:61,350:68}[machine.size??machine.size_mm],'Missing or duplicate V2.4 rail mounts');return count;
}
export function registeredAssetRow(index,id){
 const rows=Object.values(index.machines??{[index.machine_id]:index}),found=rows.filter(r=>(r.machine_id??r.id)===id);
 assert.equal(found.length,1,'Missing or duplicate registered model: '+id);
 assert(found[0].files&&Object.keys(found[0].files).some(n=>/\.(glb|gltf)$/.test(n)),'Missing registered model file: '+id);
 return found[0];
}
export function decodeRegisteredAsset(raw,spec,relative){
 assert.equal(raw.length,spec.bytes,'Asset byte count: '+relative);assert.equal(digest(raw),spec.sha256,'Asset checksum: '+relative);
 const bytes=spec.encoding==='gzip'||relative.endsWith('.gz')?gunzipSync(raw):raw;
 if(spec.decoded_sha256){assert.equal(bytes.length,spec.decoded_bytes);assert.equal(digest(bytes),spec.decoded_sha256)}
 return bytes;
}
export async function auditCurrentMachineAssets(root,directories=[]){
 const read=async f=>JSON.parse(await readFile(path.join(root,safe(f)),'utf8'));
 const imported=async f=>import(pathToFileURL(path.join(root,safe(f))).href);
 const [{machineChoices:machines},{layoutMachineRecipes:recipes},{elegooAssetIndex:elegoo},{evaCommunityIndex}]=await Promise.all([
  imported('viewer/machines.js'),imported('viewer/layout-machine-recipes.mjs'),imported('viewer/elegoo-catalog.mjs'),imported('viewer/eva-installations.mjs')]);
 const delivery=await read('APPROVED_DELIVERY.json'),ids=assertRegistrationCoverage(machines,recipes,delivery);
 assertRegistrationCoverage(currentMachines,currentRecipes,delivery);
 assert.deepEqual(recipes,currentRecipes,'Assembled provider recipes differ from current checkout');
 const pins=new Map(delivery.files.map(r=>[safe(r.path),r]));assert.equal(pins.size,delivery.files.length,'Duplicate approved delivery path');
 for(const r of delivery.external_original_transports_retained??[]){const name=safe(r.local_review_path);if(pins.has(name)){assert.equal(pins.get(name).sha256,r.sha256);assert.equal(pins.get(name).bytes,r.bytes)}else pins.set(name,r)}
 // Registration identity comes from offered machines, recipes and provider
 // rows. The delivery also retains approved source/library reference bodies;
 // their directory names are not additional machine registrations.
 const evidence=[],checked=new Map();
 async function checkedFile(relative,spec){
  safe(relative);assert(spec&&/^[a-f0-9]{64}$/.test(spec.sha256)&&Number.isSafeInteger(spec.bytes)&&spec.bytes>0,'Unpinned model input: '+relative);
  const candidates=[...new Set([root,...directories].map(d=>path.resolve(d,relative)))];let selected;
  for(const file of candidates)if(await exists(file)){selected=file;break}
  assert(selected,'Missing actual registered asset: '+relative+'; supply its explicit asset root');
  const cacheKey=selected+':'+spec.sha256;if(checked.has(cacheKey))return checked.get(cacheKey);
  const raw=await readFile(selected),bytes=decodeRegisteredAsset(raw,spec,relative);
  const row={path:relative,resolved_path:selected,sha256:spec.sha256,bytes:raw.length,decoded_sha256:digest(bytes),decoded_bytes:bytes.length};evidence.push(row);
  // Retain small metadata only, never the complete fleet's decompressed models.
  const value={row,json:/\.json$/.test(relative)?JSON.parse(bytes):null};checked.set(cacheKey,value);return value;
 }
 const pinned=async name=>{safe(name);assert(pins.has(name),'Unapproved registered input: '+name);return checkedFile(name,pins.get(name))};
 const catalogs={community:evaCommunityIndex(await read('COMMUNITY_MACHINES_ASSETS.json'),await read('EVA_INSTALLATIONS.json')),ratrig:await read('RATRIG_ASSETS.json'),custom:await read('CUSTOM_VORON_ASSETS.json'),annex:await read('EXTRA_MACHINE_ASSETS.json'),positron:await read('POSITRON_ASSETS.json'),crossant:await read('CROSSANT_ASSETS.json'),siboor:await read('SIBOOR_TRIDENT_ASSETS.json'),elegoo};
 const source=await read('SOURCE_ASSEMBLIES.json');catalogs.remorph=catalogs.annex;
 for(const catalog of new Set(Object.values(catalogs)))for(const row of Object.values(catalog.machines??{[catalog.machine_id]:catalog}))assert(ids.includes(row.id??row.machine_id),'Unregistered model in provider catalog: '+(row.id??row.machine_id));
 for(const row of source.models)assert(ids.includes(row.id),'Unregistered source model: '+row.id);
 const present=[];for(const f of legacyRegistries)if(await exists(path.join(root,f)))present.push(f);
 const legacyScope=assertLegacyRegistryScope(delivery,present),results=[];
 for(const machine of machines.filter(m=>m.available!==false)){
  const recipe=recipes.find(r=>r.machine_id===machine.id),before=evidence.length;
  const result={id:machine.id,family:machine.family,category:recipe.category,passed:false,assets:[],rail_mounts:0,poses_tested:[],native_clearance_verified:false};results.push(result);
  try{
   assert(recipe.controller&&recipe.default_recipe,'Incomplete current provider recipe');await access(path.join(root,safe(recipe.controller)));
   result.controller_sha256=digest(await readFile(path.join(root,recipe.controller)));
   let meta,profile;
   if(recipe.category==='source'){
    const record=source.models.find(r=>r.id===machine.id);assert(record,'Missing registered source packet');
    const relative=url=>{const file=path.resolve(root,'viewer',url),name=path.relative(root,file).split(path.sep).join('/');return safe(name)};
    const packet=(await checkedFile(relative(record.packet.url),record.packet)).json;
    assert.equal(packet.id,record.assembly_id);assert.equal(packet.model.sha256,record.model_sha256);assert.equal(packet.default_variant,record.configuration);
    const manifest=(await checkedFile(relative(packet.chunk_delivery.manifest.url),packet.chunk_delivery.manifest)).json;
    assert.equal(manifest.model_sha256,packet.model.sha256);assert.equal(manifest.occurrences,packet.parts.length);assert.equal(manifest.chunks.length,packet.chunk_delivery.chunk_count);
    assert.equal(manifest.all_BIN_bytes_preserved,true);let end=0;
    for(const [i,c]of manifest.chunks.entries()){assert.equal(c.ordinal,i);assert.equal(c.start,end);end+=c.bytes;assert(c.gzip,'Missing approved source chunk transport');await checkedFile(relative(c.gzip.url),{...c.gzip,encoding:'gzip',decoded_bytes:c.bytes,decoded_sha256:c.sha256})}
    assert(end>=manifest.geometry_bytes&&end<=manifest.document.buffers[0].byteLength+3,'Incomplete source model chunks');
    result.model_sha256=record.model_sha256;result.model_hash_basis='Pinned original model binding plus every exact exported chunk; original monolithic GLB not reconstructed';meta=packet;
   }else if(catalogs[recipe.category]&&!(recipe.category==='siboor'&&machine.id==='siboor_trident_350')){
    const index=catalogs[recipe.category],spec=registeredAssetRow(index,machine.id),local=safe(spec.local_directory??index.local_directory),files={};
    for(const [name,pin]of Object.entries(spec.files)){
     // Accept a supplied provider root as well as an assembled site root, but
     // use exactly the registered path; never discover replacement hardware.
     const rel=local+'/'+safe(pin.path),approved=pins.get(rel);
     // Public provider registries also pin external exports that are not
     // copied into the size-limited static delivery. Keep their own exact pins.
     if(approved){assert.equal(approved.sha256,pin.sha256);assert.equal(approved.bytes,pin.bytes)}
     let location=rel;
     if(!await exists(path.join(root,rel))){for(const d of directories)if(await exists(path.join(d,rel))){location=rel;break}else if(await exists(path.join(d,pin.path))){location=pin.path;break}}
     files[name]=await checkedFile(location,pin);
    }
    meta=files['assembly_manifest.json']?.json;profile=files['machine_profile.json']?.json;
    assert(meta,'Missing registered occurrence manifest');assert.equal(meta.machine_id,machine.id);
    if(recipe.category==='siboor'){assert.equal(files['configurations.json']?.json.machine_id,machine.id,'Missing SIBOOR configuration');result.profile_source='Production manifest/configuration recipe; standalone machine profile not consumed';}
    else assert.equal(profile?.machine_id,machine.id,'Missing registered machine profile');
    if(spec.parts)assert.equal(meta.native_leaf_count??meta.parts.length,spec.parts);
    result.model_sha256=files['model.glb']?.row.decoded_sha256??files['model.gltf']?.row.sha256;
   }else{
    assert(['v0','v24','v24-reference','micron','trident','kit','siboor'].includes(recipe.category),'Unregistered machine provider: '+recipe.category);
    const base=machine.id==='siboor_trident_350'?'':'machines/'+machine.id+'/',metaName=base+'assembly_manifest.json';meta=(await pinned(metaName)).json;
    if(base){profile=(await pinned(base+'machine_profile.json')).json;assert.equal(meta.machine_id,machine.id);assert.equal(profile.machine_id,machine.id)}
    const model=base+'model.glb',name=base?(pins.has(model)?model:model+'.gz'):'SIBOOR_Trident_350.glb.gz';result.model_sha256=(await pinned(name)).row.decoded_sha256;
    if(recipe.category==='trident')await pinned(base+'configurations.json');
    if(!base)for(const name of ['Endstop_Mechanisms.glb.gz','flexible_routes.json','COLOR_OPTIONS.json','ASSEMBLY_CONFIGURATIONS.json','R2_ENDSTOP_REGISTRATION.json'])await pinned(name);
   }
   assert(Array.isArray(meta.parts)&&meta.parts.length>0,'Missing actual model parts');assert.equal(new Set(meta.parts.map(p=>String(p.key))).size,meta.parts.length,'Duplicate actual part identities');
   if(recipe.category==='v24-reference')result.rail_mounts=auditRailMounts(meta,machine);
   result.parts=meta.parts.length;result.passed=true;
  }catch(error){result.error=error.message;}
  result.assets=evidence.slice(before);console.log(JSON.stringify({machine:result.id,passed:result.passed,assets:result.assets.length,error:result.error}));
  globalThis.gc?.();
 }
 const report={passed:results.every(r=>r.passed),registered_machines:ids.length,legacy_scope:legacyScope,machines:results,input_sha256:{},asset_count:evidence.length,scope:'Actual registered file hashes and decoded bytes, part identities, complete source chunks, and source-specific V2.4 rail-nut metadata. No machine motion or physical mounting claim.'};
 for(const f of ['APPROVED_DELIVERY.json','viewer/machines.js','viewer/layout-machine-recipes.mjs','viewer/layout-machine-providers.mjs','viewer/elegoo-catalog.mjs','COMMUNITY_MACHINES_ASSETS.json','EVA_INSTALLATIONS.json','RATRIG_ASSETS.json','CUSTOM_VORON_ASSETS.json','EXTRA_MACHINE_ASSETS.json','POSITRON_ASSETS.json','CROSSANT_ASSETS.json','SIBOOR_TRIDENT_ASSETS.json','SOURCE_ASSEMBLIES.json',...new Set(recipes.map(r=>r.controller))])report.input_sha256[f]=digest(await readFile(path.join(root,safe(f))));
 report.audit_script_sha256=digest(await readFile(new URL('./check_workbench_assets.mjs',import.meta.url)));
 for(const f of ['gantry-model.js','configuration-model.js','head-assembly.js','toolchanger-model.js','head-additions.mjs','community-adapter.mjs','native-motion-profile.mjs','eva-installations.mjs'])report.input_sha256['active-checkout/viewer/'+f]=digest(await readFile(new URL('../site/viewer/'+f,import.meta.url)));
 report.input_sha256['active-checkout/scripts/audit_community_installations.mjs']=digest(await readFile(new URL('./audit_community_installations.mjs',import.meta.url)));
 assert.equal(results.length,ids.length);
 return report;
}
export async function checkWorkbenchAssets(root,directories=[],onMachineReport=()=>{},machineDirectories=[]){
const read=async f=>JSON.parse(await readFile(path.join(root,f),'utf8'));
const gantries=await read('GANTRY_CONFIGURATIONS.json'),heads=withHeadAdditions(await read('TOOLHEAD_CONFIGURATIONS.json'),await read('HEAD_ADDITIONS.json')),library=await read('COMPONENT_LIBRARY.json'),changers=await read('TOOLCHANGER_CONFIGURATIONS.json');
assert(gantries.variants.length>0&&heads.variants.length>0&&library.items.length>0&&changers.variants.length>0);
for(const c of [gantries,heads,changers])assert.equal(new Set(c.variants.map(v=>v.id)).size,c.variants.length);
assert.equal(new Set(library.items.map(v=>v.id)).size,library.items.length);
for(const catalog of [gantries,heads,library,changers])for(const asset of Object.values({...catalog.assets,...catalog.base_assets})){
 if(asset.external){
  const candidates=[];for(const directory of directories){try{await access(path.join(directory,asset.files['parts.json'].path));candidates.push(directory)}catch{}}
  assert.equal(candidates.length,1,'Pass exactly one matching external component asset directory');const directory=candidates[0];
  const decoded={};for(const[name,spec]of Object.entries(asset.files)){
   assert(!spec.path.includes('..')&&!/[\\:]/.test(spec.path));const bytes=await readFile(path.join(directory,spec.path));
   assert.equal(bytes.length,spec.bytes);assert.equal(createHash('sha256').update(bytes).digest('hex'),spec.sha256);
   decoded[name]=spec.encoding==='gzip'?gunzipSync(bytes):bytes;
   if(spec.encoding==='gzip'){assert.equal(decoded[name].length,spec.decoded_bytes);assert.equal(createHash('sha256').update(decoded[name]).digest('hex'),spec.decoded_sha256)}
  }
  const meta=JSON.parse(decoded['parts.json']);assert.equal(meta.id,asset.component_id);assert.equal(meta.parts.length,asset.parts);
 }else{await access(path.join(root,safe(asset.meta)));await locateWorkbenchAsset(asset.glb,[root,...machineDirectories,...directories],{gzip:true});const meta=await read(asset.meta);assert(meta.parts.length>0)}
}
let gantryTransitions=0;
for(const v of gantries.variants){
 assert.equal(gantryChoice(gantries,v),v);assert(v.modules.every(id=>gantries.assets[id]));assert.equal(v.front,v.xy_motors===2?'FT':'NP');
 for(const dimension of gantryDimensions)for(const value of new Set(gantries.variants.map(row=>row[dimension]))){const next=gantryChoice(gantries,{...v,[dimension]:value});assert.equal(next[dimension],value);gantryTransitions++}
}
let transitions=0;
for(const v of heads.variants){
 const plan=headPlan(v);assert(heads.base_assets[plan.base]);assert(plan.modules.every(m=>heads.assets[m.id]));assert(!plan.modules.some(m=>m.id==='trident_r2_gantry_350'));
 for(const dimension of catalogDimensions(heads))for(const row of choicesFor(heads,v,dimension)){const next=resolveVariant(heads,{...v,[dimension]:row.id},dimension);assert(heads.variants.includes(next));assert.equal(next[dimension],row.id);transitions++}
 if(v.mount==='stealthchanger'){
  assert(v.head_only&&v.modules.some(m=>m.role==='shuttle')&&v.modules.some(m=>m.role==='tool'));
  for(const entry of [...plan.modules,{translation_mm:plan.translation,role:'tool'}])for(const probe of [0,1.5,3]){
   const p=headPlacement(v,entry,{probe,explode:20});assert.equal(p[2],entry.translation_mm[2]+(entry.role==='tool'?probe:0));assert.equal(p[1],entry.translation_mm[1]-(entry.role==='tool'?20:0));
  }
  assert(v.fit.complete_head_native&&['clear','contact','collision'].includes(v.fit.complete_head_native.state));
 }
 if(v.carriage==='vitalii_lightweight'){assert(v.head_only&&v.probe==='none'&&v.fit.carriage_native_body_passed===false);assert(v.fit.carriage_native_body_collisions.length>0);assert(heads.assets[v.inspection_module]);assert.deepEqual(choicesFor(heads,v,'probe').map(p=>p.id),['none'])}
}
assert.equal(heads.variants.filter(v=>v.carriage==='vitalii_lightweight').length,6);
let changerTransitions=0;const unverifiedReferences=[];
for(const v of changers.variants){
 assert.equal(changerChoice(changers,v),v);assert(v.modules.every(m=>changers.assets[m.id]));
 if(!v.native_fit){
  // These are published interface-only source references, explicitly
  // carrying an unverified docking/sensor notice. Keep them separate from
  // complete assemblies with native mating evidence; never count as fit.
  assert(['madmax_mgn9_db_ah','madmax_mgn12_db_ah','madmax_mgn12_xol_a4t'].includes(v.id));
  assert.equal(v.system,'madmax');assert(v.notes.some(n=>n.includes('未検証')));
  unverifiedReferences.push(v.id);
 }else assert(typeof v.native_fit.passed==='boolean'||v.native_fit.scope==='source_reference'&&v.native_fit.passed==null&&(v.native_fit.passed===null||v.native_fit.machine_installation_verified===false));
 let parts=0;for(const e of v.modules){const meta=await read(changers.assets[e.id].meta);const hidden=new Set(e.hidden_keys||[]);for(const key of hidden)assert(meta.parts.some(p=>p.key===key));parts+=meta.parts.filter(p=>!hidden.has(p.key)).length;assert.deepEqual(changerPlacement(v,e),e.translation_mm);if(v.probe_travel_mm)for(const probe of [0,1.5,3])assert.equal(changerPlacement(v,e,{probe})[2],e.translation_mm[2]+(e.role==='tool'?probe:0))}assert.equal(parts,v.parts);
 for(const dimension of changerDimensions)for(const value of changerChoices(changers,v,dimension)){const next=changerChoice(changers,{...v,[dimension]:value},dimension);assert(changers.variants.includes(next));assert.equal(next[dimension],value);changerTransitions++}
}
for(const head of heads.toolheads)assert(heads.variants.some(v=>v.toolhead===head.id));
const referenceExtruders=[];
for(const extruder of heads.extruders)if(!heads.variants.some(v=>v.extruder===extruder.id)){
 assert.equal(extruder.id,'a4t_wwbmg_mount');assert(extruder.label.includes('取付形状'));
 referenceExtruders.push(extruder.id);
}
console.log(JSON.stringify({interface_reference_extruders:referenceExtruders,complete_extruder_fit_verified:false}));
assert(heads.variants.some(v=>v.mount==='stealthchanger'));
assert.equal(heads.variants.filter(v=>v.mount==='tapchanger').length,3);
console.log(JSON.stringify({monolith_assemblies:32,toolchanger_assemblies:changers.variants.length,head_variants:heads.variants.length,complete_stealthchanger_heads:heads.variants.filter(v=>v.mount==='stealthchanger').length,complete_tapchanger_source_assemblies:3,library_items:library.items.length,gantry_choice_transitions:gantryTransitions,head_choice_transitions:transitions,toolchanger_choice_transitions:changerTransitions,unverified_source_interfaces:unverifiedReferences,browser_ui_review:false,physical_fit_certified:false}));

const machineReport=await auditCurrentMachineAssets(root,[...machineDirectories,...directories]);
machineReport.component_checks={passed:true,head_variants:heads.variants.length,toolchanger_assemblies:changers.variants.length,library_items:library.items.length,gantry_choice_transitions:gantryTransitions,head_choice_transitions:transitions,toolchanger_choice_transitions:changerTransitions,gantry_ids:gantries.variants.map(v=>v.id),head_variant_ids:heads.variants.map(v=>v.id),changer_ids:changers.variants.map(v=>v.id),stealthchanger_probe_poses_mm:[0,1.5,3],explode_mm:20,unverified_source_interfaces:unverifiedReferences,complete_extruder_fit_verified:false};
for(const f of ['GANTRY_CONFIGURATIONS.json','TOOLHEAD_CONFIGURATIONS.json','HEAD_ADDITIONS.json','COMPONENT_LIBRARY.json','TOOLCHANGER_CONFIGURATIONS.json'])machineReport.input_sha256[f]=digest(await readFile(path.join(root,f)));
await onMachineReport(machineReport);
assert(machineReport.passed,'Current registered machine asset audit failed; see coverage rows');
if(machineReport.legacy_scope==='legacy-and-current'){
let machineCount=0,machineParts=0,railMounts=0;

for(const file of ['V0_MACHINES.json','V24_MACHINES.json','KIT_MACHINES.json']){
 const registry=await read(file);
 for(const m of registry.machines){
  const meta=await read(m.meta),profile=await read(m.profile);assert.equal(meta.machine_id,m.id);assert.equal(profile.machine_id,m.id);assert(meta.parts.length>1000);
  try{await access(path.join(root,m.glb))}catch{await access(path.join(root,m.glb+'.gz'))}
  if(file==='V24_MACHINES.json')railMounts+=auditRailMounts(meta,m);
  machineCount++;machineParts+=meta.parts.length;
 }
}
assert.equal(machineCount,9);assert.equal(machineParts,12999);assert.equal(railMounts,366);
console.log(JSON.stringify({new_machine_references:machineCount,native_machine_parts:machineParts,registered_M3_rail_mounts:railMounts}));
}
// Installed community mods are actual native supplements, so every release
// must exercise their visibility, motion, materials and saved configurations.
const community=await read('COMMUNITY_MACHINES_ASSETS.json'),ender=community.machines.ender3_stock_220;
const communityDirectories=[];for(const directory of [...new Set([...directories,...machineDirectories])]){if(await exists(path.join(directory,ender.files['machine_profile.json'].path)))communityDirectories.push(directory)}
assert(communityDirectories.length,'Pass an explicit native community machine asset directory');
// A materialized public asset root may carry alternate local_directory roots.
// Its registry must be byte-identical to the assembled release registry.
let communityIndex=path.join(root,'COMMUNITY_MACHINES_ASSETS.json');
const communityDirectory=communityDirectories[0],candidateIndex=path.join(communityDirectory,'COMMUNITY_MACHINES_ASSETS.json');
if(await exists(candidateIndex)){assert.equal(digest(await readFile(candidateIndex)),digest(await readFile(communityIndex)),'Materialized community registry differs from current release');communityIndex=candidateIndex;}
const {auditCommunityInstallations}=await import('./audit_community_installations.mjs');
const installed=await auditCommunityInstallations(communityDirectory,{indexPath:communityIndex});
return {passed:true,machines:machineReport,installed_community:installed,scope:'Current exported identities, catalog transitions, V2.4 rail-nut metadata, and named community installation checks. Native-solid fit, browser review and all combinations remain separate.',native_clearance_verified:false,physical_fit_certified:false};
}

if(process.argv[1]&&import.meta.url===pathToFileURL(path.resolve(process.argv[1])).href){
 const args=process.argv.slice(2),reportAt=args.indexOf('--report');let output;
 if(reportAt!==-1){output=args[reportAt+1];assert(output,'Missing --report path');args.splice(reportAt,2)}
 const machineDirectories=[];let at;while((at=args.indexOf('--machine-assets'))!==-1){assert(args[at+1]&&!args[at+1].startsWith('--'),'Missing --machine-assets directory');machineDirectories.push(path.resolve(args[at+1]));args.splice(at,2)}
 assert(!args.some(a=>a.startsWith('--')),'Unknown workbench audit option');
 const root=path.resolve(args.shift()??'site'),directories=args.map(d=>path.resolve(d));let machines;
 try{
  const result=await checkWorkbenchAssets(root,directories,async value=>{machines=value;if(output)await writeFile(output,JSON.stringify({passed:false,phase:'machines-complete-community-pending',machines},null,2)+'\n')},machineDirectories);
  if(output)await writeFile(output,JSON.stringify(result,null,2)+'\n');console.log(JSON.stringify({passed:true,available_machines:result.machines.registered_machines,physical_fit_certified:false}));
 }catch(error){machines??={passed:false,registered_machines:currentMachines.filter(m=>m.available!==false).length,machines:currentMachines.filter(m=>m.available!==false).map(m=>({id:m.id,passed:false,error:'Audit did not reach machine coverage: '+error.message,poses_tested:[],native_clearance_verified:false}))};if(output)await writeFile(output,JSON.stringify({passed:false,error:error.stack,machines},null,2)+'\n');throw error}
}
