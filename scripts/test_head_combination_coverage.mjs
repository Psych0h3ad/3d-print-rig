import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';
import {createHash} from 'node:crypto';
import {auditHeadCombinationCoverage,composeHeadCoverageCatalog,coverageExitCode,
 companionRoles,sourceMatrixSchema,isPublicSourceURL,renderHeadCoverageMarkdown,installedRecipeSourceSpecs,reviewInstalledHeadRecipe} from './audit_head_combination_coverage.mjs';
import {collections} from '../site/viewer/configuration-model.js';
import {machineHeadVariants} from '../site/viewer/machine-head-model.mjs';
import {trinityAlphaVariants} from '../site/viewer/trinity-alpha-installation.mjs';
import {withRapidoXUhfCover,rapidoXUhfCover} from '../site/viewer/rapido-x-uhf-cover.mjs';

const clone=v=>structuredClone(v),revision='a'.repeat(40),otherRevision='b'.repeat(40);
const sourceUrls=[`https://github.com/example/public-head/tree/${revision}`];
const hardware=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners']);
function variant(id='source-a',overrides={}){
 return {id,toolhead:'stealthburner',extruder:'cw2',hotend:'hot-a',cooling:'source',board:'none',
  carriage:'standard',mount:'fixed',gantry:'trident_r2',probe:'none',belt_width_mm:6,
  base_asset:'stealthburner',base_hidden_keys:[],head_translation_mm:[0,0,0],modules:[],
  head_only:true,hardware_assembled:true,source_version:revision,fit:{nozzle_mm:[0,0,-40],
   complete_head_native:{state:'clear',scope:'Selected fixture interfaces only.'}},notes:[],...overrides};
}
function catalog(variants=[variant()]){
 const c={assets:{},base_assets:{stealthburner:{parts:companionRoles.length,meta:'parts.json',glb:'model.glb'}},sources:[],variants};
 for(const [dimension,collection]of Object.entries(collections))c[collection]=[...new Set(variants.map(v=>v[dimension]))].map(id=>({id,label:id}));
 return c;
}
const parts=companionRoles.map(role=>({key:role,component:hardware.has(role)?role:'printed',
 material:hardware.has(role)?'purchased':'printed',appearance_role:hardware.has(role)?undefined:'base',
 source_commit:revision,source_identity:`source/assembly/${role}`}));
const metadata={stealthburner:{source_commit:revision,parts}};
function expected(v=variant(),overrides={}){
 return {id:v.id,assembly:'assembled',selection:Object.fromEntries(Object.keys(collections).map(d=>[d,v[d]])),
  requiredCompanions:companionRoles.map(role=>({role,assetId:'stealthburner',partKeys:[role]})),...overrides};
}
function matrix(variants=[variant()]){
 return {schema:sourceMatrixSchema,families:[{id:'stealthburner',status:'required',sourceCommit:revision,sourceUrls,
  options:{hotend:[...new Set(variants.map(v=>v.hotend))]},expectedCombinations:variants.map(v=>expected(v))}]};
}
const opts={sourceMatrix:matrix(),assetMetadata:metadata};
const audit=(c=catalog(),o=opts)=>auditHeadCombinationCoverage(c,o);
const codes=r=>r.findings.map(f=>f.code);
function rejects(code,mutate){const c=catalog(),o=clone(opts);mutate(c,o);const r=audit(c,o);assert(codes(r).includes(code),`${code}: ${JSON.stringify(r.findings)}`);assert.equal(r.passed,false);return r}
function freeze(o){if(o&&typeof o==='object'){Object.freeze(o);for(const v of Object.values(o))freeze(v)}return o}
let cases=0;
const good=audit();
assert.equal(good.status,'covered');assert.equal(good.passed,true);assert.equal(good.summary.metadata_covered_rows,1);
assert.equal(good.configurations[0].hardware_metadata,'hardware_roles_observed');
assert.equal(good.configurations[0].native_fit.certified,false);
assert.equal(good.scope.exported_meshes_inspected,false);cases++;

const additions={schema:'3d-print-rig-head-additions-v1',assets:{new_native:{external:{base_url:'https://example.org/models/'},parts:1}},
 variants:[variant('addition',{toolhead:'new-family',base_asset:'new_native'})],sources:[]};
for(const [d,f]of Object.entries(collections))additions[f]=d==='toolhead'?[{id:'new-family',label:'New family'}]:[];
const raw=catalog(),before=JSON.stringify(raw),addBefore=JSON.stringify(additions);
const merged=composeHeadCoverageCatalog(raw,additions);
assert.equal(JSON.stringify(raw),before);assert.equal(JSON.stringify(additions),addBefore);
assert(audit(merged).families.some(f=>f.id==='new-family'),'withHeadAdditions families cannot disappear from inventory');
assert(codes(audit(merged)).includes('SOURCE_FAMILY_UNREVIEWED'));cases++;

// Five registered rows differ only in boards and gantries; they are one core
// combination. Changing a carriage creates a second carriage tuple only.
const expanded=catalog([variant(),variant('board',{board:'can'}),variant('gantry',{gantry:'gantry-b'}),
 variant('both',{board:'can',gantry:'gantry-b'}),variant('carriage',{carriage:'other'})]);
const inventory=audit(expanded,{assetMetadata:metadata});
assert.equal(inventory.summary.unique_core_combinations,1);assert.equal(inventory.summary.unique_carriage_combinations,2);
assert.equal(inventory.summary.unique_options.board,2);assert.equal(inventory.summary.configuration_rows,5);
assert.equal(inventory.families[0].option_coverage.board.options[0].unique_core_combinations,1);
assert.equal(inventory.status,'open');assert.equal(inventory.passed,false);cases++;

const embedded=composeHeadCoverageCatalog(catalog(),{...additions,assets:{},variants:[],toolheads:[]},
 {embeddedBoards:[{id:'stock_board',base:'stealthburner',mask:'base_hidden_keys',suffix:'bare',label:'Fixture board',keys:['board']}]});
assert.equal(embedded.variants.length,2);assert.equal(audit(embedded).summary.unique_core_combinations,1);
assert.equal(embedded.variants.find(v=>v.board==='none').base_hidden_keys.includes('board'),true);cases++;

rejects('CATALOG_VARIANT_INVALID',c=>c.variants.push(clone(c.variants[0])));cases++;
rejects('CATALOG_VARIANT_OPTION_UNKNOWN',c=>c.variants[0].extruder='undeclared');cases++;
rejects('HARDWARE_DECLARATION_INVALID',c=>c.variants[0].hardware_assembled='true');cases++;
rejects('HEAD_PLAN_INVALID',c=>c.variants[0].head_translation_mm=[0,NaN,0]);cases++;
rejects('HEAD_PLAN_INVALID',c=>c.variants[0].modules=[{id:'invalid-mask',hidden_keys:'nozzle'}]);cases++;
rejects('ASSET_UNREGISTERED',c=>delete c.base_assets.stealthburner);cases++;
rejects('ASSET_METADATA_INVALID',(_c,o)=>o.assetMetadata.stealthburner.parts=[]);cases++;
rejects('PART_ID_INVALID',(_c,o)=>o.assetMetadata.stealthburner.parts.push(clone(parts[0])));cases++;
rejects('HIDDEN_PART_UNKNOWN',c=>c.variants[0].base_hidden_keys=['absent']);cases++;
rejects('REQUIRED_COMPANION_PART_MISSING',(_c,o)=>o.assetMetadata.stealthburner.parts=o.assetMetadata.stealthburner.parts.filter(p=>p.key!=='nozzle'));cases++;
rejects('REQUIRED_COMPANION_HIDDEN',c=>c.variants[0].base_hidden_keys=['nozzle']);cases++;
rejects('COMPANION_SOURCE_MISMATCH',(_c,o)=>o.assetMetadata.stealthburner.parts[0].source_commit=otherRevision);cases++;
rejects('PURCHASED_COMPANION_PRINTED',(_c,o)=>o.assetMetadata.stealthburner.parts.find(p=>p.key==='extruder').material='printed');cases++;
rejects('ASSEMBLED_HARDWARE_FALSE',c=>c.variants[0].hardware_assembled=false);cases++;
rejects('ASSEMBLED_CORE_REQUIREMENTS_MISSING',(_c,o)=>{const e=o.sourceMatrix.families[0].expectedCombinations[0];e.requiredCompanions=[];e.notRequiredCompanions=companionRoles.map(role=>({role,reason:'No leaf claimed.',sourceUrls}))});cases++;
rejects('COMPANION_METADATA_MISSING',(_c,o)=>o.assetMetadata={});cases++;
rejects('COMPANION_REQUIREMENT_UNKNOWN',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].requiredCompanions.pop());cases++;
rejects('OBSOLETE_COMPANION_VISIBLE',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].forbiddenCompanions=[{assetId:'stealthburner',partKeys:['cover']}]);cases++;
rejects('UNEXPECTED_COMPANION_VISIBLE',(c,o)=>{c.base_assets.stealthburner.parts++;o.assetMetadata.stealthburner.parts.push({key:'spare-cover',component:'cover',material:'printed',source_commit:revision})});cases++;
rejects('SOURCE_REVISION_MISMATCH',c=>c.variants[0].source_version=otherRevision);cases++;
rejects('EXPECTED_SELECTION_MISMATCH',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].selection.cooling='other');cases++;

const missing=rejects('EXPECTED_COMBINATION_MISSING',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations.push(expected(variant('exact-missing'))));
assert.equal(missing.source_expectations.length,2,'Do not expand declared options into guessed Cartesian products');cases++;
const openMissing=rejects('EXPECTED_COMBINATION_MISSING',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations.push(expected(variant('missing-open'),{status:'open'})));
assert.equal(openMissing.status,'open');assert.equal(coverageExitCode(openMissing),0);assert.equal(coverageExitCode(openMissing,{strictOpen:true}),1);cases++;
rejects('NAMED_FAMILY_OPTION_MISSING',(_c,o)=>o.sourceMatrix.families[0].options.hotend.push('source-known-missing'));cases++;
const unmatched=rejects('SOURCE_FAMILY_UNREGISTERED',(_c,o)=>o.sourceMatrix.families.push({id:'public-unregistered',status:'open',sourceCommit:revision,sourceUrls,expectedCombinations:[]}));
assert.equal(unmatched.status,'open');assert.equal(unmatched.passed,false);cases++;
rejects('SOURCE_FAMILY_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].sourceCommit='main');cases++;
rejects('SOURCE_FAMILY_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].sourceCommit='onshape:document/workspace/element/microversion');cases++;
rejects('SOURCE_FAMILY_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].sourceUrls=['https://localhost/private']);cases++;
rejects('SOURCE_COMBINATION_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].requiredCompanions={});cases++;
rejects('SOURCE_COMPANION_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].requiredCompanions[0].partKeys=['cover','cover']);cases++;
const badRequirement=rejects('SOURCE_COMPANION_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].expectedCombinations[0].requiredCompanions[0].partKeys=['cover','cover']);
assert.equal(badRequirement.configurations[0].companion_status,'failure');assert.equal(badRequirement.source_expectations[0].status,'failure');cases++;
rejects('SOURCE_EXEMPTION_UNPINNED',(_c,o)=>{const e=o.sourceMatrix.families[0].expectedCombinations[0];e.requiredCompanions=e.requiredCompanions.filter(p=>p.role!=='led_carrier');e.notRequiredCompanions=[{role:'led_carrier',reason:'No LED in the source variant.',sourceUrls:['https://github.com/example/public-head/tree/main']}]});cases++;
rejects('SOURCE_MATRIX_SCHEMA',(_c,o)=>o.sourceMatrix.schema='old');cases++;
rejects('SOURCE_OPTIONS_SCHEMA',(_c,o)=>o.sourceMatrix.families[0].options.hotend='invalid-list');cases++;
rejects('SOURCE_COMPANION_SCHEMA',(_c,o)=>{const e=o.sourceMatrix.families[0].expectedCombinations[0];e.assembly='mount_only';e.unknownCompanions=[null]});cases++;
rejects('INPUT_HASH_INVALID',(_c,o)=>o.inputSha256={catalog:'not-a-hash'});cases++;
for(const url of ['file:///private.step','http://example.org','https://10.0.0.1/a','https://192.168.1.2/a','https://user:pass@example.org/a','https://host.local/a'])assert.equal(isPublicSourceURL(url),false);
assert.equal(isPublicSourceURL(sourceUrls[0]),true);cases++;
const cadMetadata=clone(metadata),cadRevision='onshape:public-document/element/microversion';
cadMetadata.stealthburner.source_revision='assembly-version-9';
cadMetadata.stealthburner.parts[0].source_revision=cadRevision;
cadMetadata.stealthburner.parts[0].source={revision:cadRevision,microversionId:'1234567890abcdef12345678'};
const cadReport=audit(catalog(),{assetMetadata:cadMetadata});
assert.equal(cadReport.status,'open');assert.equal(cadReport.summary.metadata_covered_rows,0);
assert.equal(cadReport.exported_source_revisions.source_requirements_verified,false);
const cadAsset=cadReport.exported_source_revisions.assets[0];
assert.equal(cadAsset.metadata.source_revision,'assembly-version-9');
assert.equal(cadAsset.metadata.source_commit,revision);
assert.equal(cadAsset.parts[0].source_revision,cadRevision);
assert.equal(cadAsset.parts[0].source_commit,revision);
assert.deepEqual(cadAsset.parts[0].source,cadMetadata.stealthburner.parts[0].source);
assert.equal(metadata.stealthburner.parts[0].source_revision,undefined);cases++;
assert(codes(audit(catalog(),{...opts,assetMetadata:cadMetadata})).includes('COMPANION_SOURCE_MISMATCH'),
 'A part CAD revision cannot silently inherit its metadata Git pin');cases++;
const unclassified=clone(metadata);for(const p of unclassified.stealthburner.parts){delete p.material;delete p.appearance_role;delete p.component;}
assert.equal(audit(catalog(),{assetMetadata:unclassified}).configurations[0].hardware_metadata,'unreviewed','Unclassified hardware leaves cannot be relabeled mount-only');cases++;
const mounts=catalog([variant('mounts',{hardware_assembled:false})]);
const printed=clone(metadata);for(const p of printed.stealthburner.parts){p.material='printed';p.component='printed';p.appearance_role='base';}
const mountReport=audit(mounts,{assetMetadata:printed});
assert.equal(mountReport.summary.mount_only_declared_rows,1);assert.equal(mountReport.summary.observed_mount_only_rows,1);assert.equal(mountReport.passed,false);cases++;
assert(codes(audit(catalog(),{assetMetadata:printed})).includes('ASSEMBLED_DECLARATION_WITHOUT_HARDWARE'));cases++;
const mountMatrix=matrix(mounts.variants);mountMatrix.families[0].expectedCombinations[0].assembly='mount_only';
mountMatrix.families[0].expectedCombinations[0].requiredCompanions=[{role:'mount',assetId:'stealthburner',partKeys:['hotend_mount']}];
assert.equal(audit(mounts,{sourceMatrix:mountMatrix,assetMetadata:printed}).status,'covered');cases++;
const mountOnlyWrong=clone(opts);mountOnlyWrong.sourceMatrix.families[0].expectedCombinations[0].assembly='mount_only';
assert(codes(audit(catalog(),mountOnlyWrong)).includes('MOUNT_ONLY_SCOPE_MISMATCH'));cases++;

// Production machine composition gives installation evidence. Declared
// support, a source-host name, or a clear native state does not.
const registry={sources:{r2_fixed:{origin_mm:[0,0,0]}},assets:{},machines:{six:{origin_mm:[0,0,200],belt_width_mm:6,xy_motors:2}}};
const c=catalog(),installed=machineHeadVariants(c,registry,'six');
assert.equal(installed.length,1);
const machineOptions={...opts,machineCatalogs:[{machine:'six',variants:installed}]};
const registered=audit(c,machineOptions);assert.equal(registered.summary.machine_registered_head_rows,1);
assert.equal(registered.configurations[0].machine_registrations[0].native_fit_certified,false);cases++;
const declared=catalog([variant('source-a',{supported_machines:['six'],machine:'six'})]);
assert.equal(audit(declared).summary.machine_registered_head_rows,0);cases++;
for(const change of [v=>delete v.machine_head,v=>v.extruder='other',v=>v.source_head_configuration='missing',v=>v.machine_head.nozzle_mm=[NaN,0,0]]){
 const o=clone(machineOptions);change(o.machineCatalogs[0].variants[0]);assert(codes(audit(c,o)).includes('MACHINE_REGISTRATION_MISMATCH'));cases++;
}
const badMask=clone(machineOptions);badMask.machineCatalogs[0].variants[0].machine_head.hidden=['nozzle'];
assert(codes(audit(c,badMask)).includes('MACHINE_COMPANION_PLAN_CHANGED'));cases++;

// Exact companion multiplicity and placements, not a subset of required IDs.
const moduleSource=variant('module-source',{modules:[{id:'cooler',translation_mm:[1,2,3],role:'tool',hidden_keys:['alternative']}]});
const moduleCatalog=catalog([moduleSource]),moduleInstalled=machineHeadVariants(moduleCatalog,registry,'six');
const moduleOptions={assetMetadata:metadata,machineCatalogs:[{machine:'six',variants:moduleInstalled}]};
assert.equal(audit(moduleCatalog,moduleOptions).summary.machine_registered_head_rows,1);cases++;
const roundedPlan=clone(moduleOptions);roundedPlan.machineCatalogs[0].variants[0].machine_head.modules[0].translation_mm[0]+=1e-10;
assert.equal(audit(moduleCatalog,roundedPlan).summary.machine_registered_head_rows,1);cases++;
let strictPlanNegatives=0;
for(const change of [
 p=>p.modules.push({id:'unregistered-extra',translation_mm:[0,0,0]}),p=>p.modules.push(clone(p.modules[0])),
 p=>p.modules=[],p=>p.modules[0].hidden_keys=[],p=>p.modules[0].hidden_keys=['alternative','alternative'],
 p=>p.modules[0].translation_mm[0]+=.001,p=>p.modules[0].translation_mm[0]+=1e-7,p=>p.modules[0].role='dock',p=>p.nozzle_mm[2]+=.001,
 p=>p.translation_delta_mm[1]+=.001,p=>p.hidden=['nozzle','nozzle'],p=>p.base='another-source',p=>p.source_gantry='another-source-gantry'
]){
 const o=clone(moduleOptions);change(o.machineCatalogs[0].variants[0].machine_head);
 assert(codes(audit(moduleCatalog,o)).includes('MACHINE_COMPANION_PLAN_CHANGED'));cases++;strictPlanNegatives++;
}
const invalidOriginal=clone(moduleCatalog);invalidOriginal.variants[0].modules=null;
assert(codes(audit(invalidOriginal,moduleOptions)).includes('MACHINE_REGISTRATION_MISMATCH'));cases++;

// Source files are public JSON sidecars only; no meshes or native CAD are read.
// Companion metadata below is explicitly synthetic. These fixtures establish
// recipe/pin rejection, not the contents or fit of the real native assembly.
const sourceInputs={},sourcePins={},sha=text=>createHash('sha256').update(text).digest('hex');
for(const spec of installedRecipeSourceSpecs){
 const raw_json=fs.readFileSync(new URL('../site/'+spec.file,import.meta.url),'utf8');
 assert.equal(sha(raw_json),spec.sha256,'Native source fixture sidecar changed');
 sourceInputs[spec.file]={raw_json,sha256:spec.sha256};sourcePins[spec.file]=spec.sha256;
}
const sourceSidecars=installedRecipeSourceSpecs.map(s=>JSON.parse(sourceInputs[s.file].raw_json)),alpha=sourceSidecars[0];
sourcePins['MACHINE_HEAD_REGISTRATIONS.json']=alpha.raw_registry_sha256;
const nativeSource=variant(alpha.source_head_id,{toolhead:'trinity'}),nativeCatalog=catalog([nativeSource]);
nativeCatalog.assets[alpha.asset_id]=clone(alpha.asset);
const hiddenNative=['actual_retained_Trident_block','v13_29','v13_71','v13_72','v13_73'];
const nativeParts=Array.from({length:alpha.asset.parts},(_,i)=>({key:hiddenNative[i]||'synthetic-fastener-'+i,
 component:i<hiddenNative.length?'reference':'fasteners',material:'purchased',source_commit:revision}));
const nativeMetadata={...clone(metadata),[alpha.asset_id]:{id:alpha.asset_id,parts:nativeParts}};
function nativeOptions(row){
 const binding={belt_width_mm:row.belt_width_mm,part_key:row.stock_block_key,xy_motors:row.xy_motors};
 const nativeRegistry={trinity_alpha_92:{...alpha,rows:[row]},machines:{[row.machine_id]:row.gantry_id==='machine_gantry'?binding:{gantries:{[row.gantry_id]:binding}}}};
 const installed=trinityAlphaVariants(nativeCatalog,nativeRegistry,row.machine_id,row.gantry_id);
 const inputSha256={...sourcePins};if(row.source_siboor_index_sha256)inputSha256['SIBOOR_TRIDENT_ASSETS.json']=row.source_siboor_index_sha256;
 return {assetMetadata:clone(nativeMetadata),installedRecipeSources:clone(sourceInputs),inputSha256,
  machineCatalogs:[{machine:row.machine_id,variants:installed}]};
}
let nativeRecipePositives=0,nativeRecipeNegatives=0;
for(const source of sourceSidecars)for(const row of source.rows){
 const report=audit(nativeCatalog,nativeOptions(row));
 assert.equal(report.summary.machine_registered_head_rows,1,JSON.stringify(report.findings));
 const proof=report.configurations[0].machine_registrations[0].recipe_review;
 assert.equal(proof.kind,'pinned_native_alpha_production_plan');assert.equal(proof.declared_model_sha256,alpha.asset.files['model.glb'].decoded_sha256);
 assert(/^[a-f0-9]{64}$/.test(proof.source_recipe_sha256));assert(/^[a-f0-9]{64}$/.test(proof.installed_plan_sha256));
 assert.equal(report.configurations[0].machine_registrations[0].native_fit_certified,false);
 assert.equal(report.scope.exported_meshes_inspected,false);cases++;nativeRecipePositives++;
}
const nativeRow=sourceSidecars[0].rows[0],nativeGood=nativeOptions(nativeRow);
const nativeComparison=reviewInstalledHeadRecipe(nativeCatalog,nativeSource,nativeGood.machineCatalogs[0].variants[0],nativeRow.machine_id,nativeGood);
assert.equal(nativeComparison.passed,true);assert.equal(nativeComparison.source_family_reviewed,false);assert.equal(nativeComparison.native_fit_certified,false);cases++;
assert.equal(reviewInstalledHeadRecipe(c,c.variants[0],badMask.machineCatalogs[0].variants[0],'six',opts).passed,false);cases++;
function rejectNative(code,mutate){const c=clone(nativeCatalog),o=clone(nativeGood);mutate(c,o);const r=audit(c,o);
 assert(codes(r).includes(code),JSON.stringify(r.findings));assert.equal(r.passed,false);cases++;nativeRecipeNegatives++;return r}
for(const change of [
 (_c,o)=>delete o.installedRecipeSources[installedRecipeSourceSpecs[0].file],
 (_c,o)=>delete o.inputSha256['MACHINE_HEAD_REGISTRATIONS.json'],
 (_c,o)=>o.inputSha256['MACHINE_HEAD_REGISTRATIONS.json']='0'.repeat(64),
 (_c,o)=>o.machineCatalogs[0].machine='unproved-host',
 (_c,o)=>o.machineCatalogs[0].variants[0].id='unproved-config',
 (_c,o)=>o.machineCatalogs[0].variants[0].gantry='unproved-gantry',
 (_c,o)=>o.machineCatalogs[0].variants[0].native_alpha_92.translation_mm[0]+=.001,
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.base='stealthburner',
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.hidden.pop(),
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.hidden.push('synthetic-fastener-7'),
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.modules.push({id:'extra',translation_mm:[0,0,0]}),
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.nozzle_mm[2]+=.001,
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.translation[0]+=.001,
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.stock_retained_keys=[],
 (_c,o)=>o.machineCatalogs[0].variants[0].machine_head.native_alpha_limits_mm.X[0]+=.001,
 (_c,o)=>delete o.assetMetadata[alpha.asset_id],
 (_c,o)=>o.assetMetadata[alpha.asset_id].id='other-source',
 (_c,o)=>o.assetMetadata[alpha.asset_id].parts.pop(),
 (_c,o)=>o.assetMetadata[alpha.asset_id].parts[0].key='missing-reference',
 (c,_o)=>c.assets[alpha.asset_id].files['model.glb'].decoded_sha256='0'.repeat(64),
 (_c,o)=>{o.machineCatalogs[0].variants[0].machine_head.hidden=[];o.expectedInstalledPlans=clone(o.machineCatalogs)}
]){const r=rejectNative('MACHINE_NATIVE_RECIPE_INVALID',change);assert.equal(r.summary.machine_registered_head_rows,0)}
for(const change of [
 o=>o.installedRecipeSources[installedRecipeSourceSpecs[0].file].sha256='0'.repeat(64),
 o=>o.installedRecipeSources[installedRecipeSourceSpecs[0].file].raw_json+=' ',
 o=>{const r=o.installedRecipeSources[installedRecipeSourceSpecs[0].file];r.raw_json+=' ';r.sha256=sha(r.raw_json);o.inputSha256[installedRecipeSourceSpecs[0].file]=r.sha256},
 o=>delete o.inputSha256[installedRecipeSourceSpecs[0].file],
 o=>o.installedRecipeSources['arbitrary-waiver.json']=clone(o.installedRecipeSources[installedRecipeSourceSpecs[0].file])
])rejectNative('INSTALLED_RECIPE_SOURCE_INVALID',(_c,o)=>change(o));
const siboorRow=sourceSidecars[2].rows[0],badIndex=nativeOptions(siboorRow);badIndex.inputSha256['SIBOOR_TRIDENT_ASSETS.json']='0'.repeat(64);
assert(codes(audit(nativeCatalog,badIndex)).includes('MACHINE_NATIVE_RECIPE_INVALID'));cases++;nativeRecipeNegatives++;

// Rapido X support-builder recipes without the production UHF correction are
// invalid. A matching configuration ID or self-declared expected plan cannot
// waive the obsolete cover/LED masks. Test the exact two source recipe IDs.
let rapidoCorrectedPositives=0,rapidoUncorrectedNegatives=0;
for(const id of rapidoXUhfCover.variants){
 const v=variant(id,{hotend:'rapido_x_uhf',base_hidden_keys:[...rapidoXUhfCover.original_keys],
  modules:[{id:'sb_rapido_x',translation_mm:[0,0,0]}]}),raw=catalog([v]);
 const corrected=withRapidoXUhfCover(raw),goodInstalled=machineHeadVariants(corrected,registry,'six');
 assert.equal(audit(corrected,{assetMetadata:metadata,machineCatalogs:[{machine:'six',variants:goodInstalled}]}).summary.machine_registered_head_rows,1);
 const stale=machineHeadVariants(raw,registry,'six'),bad=audit(corrected,{assetMetadata:metadata,
  machineCatalogs:[{machine:'six',variants:stale}],expectedInstalledPlans:stale});
 assert(codes(bad).includes('MACHINE_COMPANION_PLAN_CHANGED'));assert.equal(bad.summary.machine_registered_head_rows,0);
 cases+=2;rapidoCorrectedPositives++;rapidoUncorrectedNegatives++;
}

const host={configuration:'source-a',machine:'source-printer',sourceCommit:revision,sourceUrls,modelSha256:'1'.repeat(64),manifestSha256:'2'.repeat(64)};
const hosted=audit(c,{...opts,sourceHosts:[host]});
assert.equal(hosted.summary.source_host_head_rows,1);assert.equal(hosted.summary.machine_registered_head_rows,0);
assert.equal(hosted.configurations[0].source_hosts[0].source_assembly_only,true);cases++;
const badHost={...host,sourceCommit:otherRevision};assert(codes(audit(c,{...opts,sourceHosts:[badHost]})).includes('SOURCE_HOST_INVALID'));cases++;
const evaCatalog=catalog([variant('source-a',{eva:{source_machine:{id:'source-printer',decoded_model_sha256:'3'.repeat(64),manifest_sha256:host.manifestSha256}}})]);
assert(codes(audit(evaCatalog,{...opts,sourceHosts:[host]})).includes('SOURCE_HOST_CHANGED'));cases++;

// A-to-B-to-A and native report reset: no sticky masks, metadata, matrix,
// family, hosts or machine registrations may carry over from a previous call.
const frozenC=freeze(catalog()),frozenOptions=freeze(clone(opts)),native=audit(frozenC,frozenOptions);
const b=catalog([variant('source-b',{hotend:'hot-b',base_hidden_keys:['nozzle']})]);
const broken=audit(b,{...clone(opts),sourceMatrix:matrix(b.variants)});
assert(codes(broken).includes('REQUIRED_COMPANION_HIDDEN'));
assert.deepEqual(audit(frozenC,frozenOptions),native,'A-to-B-to-A restores exact immutable report state');
const reset=audit(frozenC,{});
assert.equal(reset.summary.metadata_covered_rows,0);assert.equal(reset.source_expectations.length,0);
assert.equal(reset.summary.source_host_head_rows,0);assert.equal(reset.summary.machine_registered_head_rows,0);
assert.deepEqual(reset.exported_source_revisions.assets,[],'Reset must discard prior per-part source revisions');
assert.equal(reset.status,'open');assert.deepEqual(audit(frozenC,{}),reset);cases++;
assert(renderHeadCoverageMarkdown(good).includes('Assembled declarations are not hardware-presence passes.'));
assert.equal(coverageExitCode(good),0);assert.equal(coverageExitCode(missing),1);cases++;

// Import/CLI guard and missing actual catalogs: no filesystem output from
// no-argument source regressions, and absent release input cannot pass.
const script=fileURLToPath(new URL('./audit_head_combination_coverage.mjs',import.meta.url));
const absent=spawnSync(process.execPath,[script,'--site',path.join(path.dirname(script),'__absent_actual_head_catalog__')],{encoding:'utf8'});
assert.equal(absent.status,1);assert.match(absent.stderr,/audit failed/);cases++;
assert.throws(()=>auditHeadCombinationCoverage({}),/merged catalog/);cases++;

// Optional parent-provided actual merged report: inspect all families and all
// exact IDs without claiming these fixtures loaded meshes or native solids.
if(process.argv[2]){
 const actual=JSON.parse(fs.readFileSync(process.argv[2],'utf8'));
 assert.equal(actual.schema,'3d-print-rig-head-combination-coverage-v1');
 assert.equal(actual.summary.registered_families,actual.families.length);
 assert.equal(actual.summary.configuration_rows,actual.configurations.length);
 assert.equal(new Set(actual.configurations.map(v=>v.id)).size,actual.configurations.length);
 assert.equal(new Set(actual.configurations.map(v=>JSON.stringify(v.core))).size,actual.summary.unique_core_combinations);
 assert(actual.configurations.every(v=>actual.families.some(f=>f.id===v.selection.toolhead)));
 assert(actual.configurations.every(v=>v.native_fit.certified===false));
 assert.equal(actual.passed,actual.status==='covered');
 console.log(JSON.stringify({actual_registered_families:actual.families.length,actual_configuration_rows:actual.configurations.length,status:actual.status}));
}
console.log(JSON.stringify({head_coverage_fixture_cases:cases,strict_installed_plan_negatives:strictPlanNegatives,
 pinned_native_recipe_positives:nativeRecipePositives,pinned_native_recipe_negatives:nativeRecipeNegatives,
 rapido_x_corrected_positives:rapidoCorrectedPositives,rapido_x_uncorrected_negatives:rapidoUncorrectedNegatives,
 pure_reset_and_negative_boundaries:true,native_fit_claimed:false}));
