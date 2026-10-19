// Catalog/metadata coverage only. This does not inspect GLBs, native solids,
// motion, mounting, reset in a viewer, or certify fit. Importing performs no IO.
// Usage: node scripts/audit_head_combination_coverage.mjs --site <assembled-site>
//   [--additions <HEAD_ADDITIONS.json>] [--source-matrix <matrix.json>]
//   [--evidence <evidence.json>] [--output <report.json>] [--strict-open]
// Evidence can supply production-composed machineCatalogs, sourceHosts and
// assetMetadata. Never supply a list of declared compatible machines as evidence.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {withHeadAdditions} from '../site/viewer/head-additions.mjs';
import {withEmbeddedBoards,xolEmbeddedBoard,sbEmbeddedBoard} from '../site/viewer/embedded-boards.mjs';
import {withRapidoXUhfCover} from '../site/viewer/rapido-x-uhf-cover.mjs';
import {collections,headBuilderDimensions} from '../site/viewer/configuration-model.js';
import {headPlan} from '../site/viewer/head-assembly.js';
import {TRINITY_ALPHA_SOURCE,TRINITY_INSTALLED_BELT_SAMPLE_KEYS,trinityAlphaVariants} from '../site/viewer/trinity-alpha-installation.mjs';
import {TRINITY_ALPHA_HOST_SOURCE} from '../site/viewer/trinity-alpha-host-extensions.mjs';
import {TRINITY_SIBOOR_SOURCE} from '../site/viewer/trinity-alpha-siboor-r2.mjs';

export const sourceMatrixSchema='3d-print-rig-head-source-matrix-v1';
export const coreDimensions=Object.freeze(['toolhead','extruder','hotend','cooling']);
export const inventoryDimensions=Object.freeze([...coreDimensions,'board','carriage']);
// Each source-reviewed assembled entry must address these roles explicitly.
// An external/absent/optional fan or LED needs a source-backed exemption, not a
// guessed rule based on CPAP, HF/UHF, or the head's name.
export const companionRoles=Object.freeze(['cover','hotend_mount','spacer','duct',
 'hotend_fan','part_fan','led_carrier','hotend','nozzle','extruder','probe','fasteners','carriage']);
const hardwareRoles=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners']);
const printedLeaf=p=>!hardwareRoles.has(p.component)&&!(Array.isArray(p.eva_companions)&&p.eva_companions.some(r=>hardwareRoles.has(r)))&&
 (p.material==='printed'||p.component==='printed'&&p.material===undefined||
  !p.component&&!p.material&&['base','accent'].includes(p.appearance_role));
const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const string=v=>typeof v==='string'&&v.trim().length>0;
const strings=v=>Array.isArray(v)&&v.length>0&&v.every(string)&&new Set(v).size===v.length;
const vector=v=>Array.isArray(v)&&v.length===3&&v.every(Number.isFinite);
const validMask=v=>v===undefined||Array.isArray(v)&&v.every(k=>typeof k==='string'||typeof k==='number'&&Number.isFinite(k));
const commit=v=>typeof v==='string'&&/^[a-f0-9]{40}$/.test(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const sorted=v=>[...new Set(v)].sort();
const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(
 Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
const equal=(a,b)=>JSON.stringify(canonical(a))===JSON.stringify(canonical(b));
const sha=v=>createHash('sha256').update(typeof v==='string'?v:JSON.stringify(canonical(v))).digest('hex');
export const installedRecipeSourceSpecs=Object.freeze([TRINITY_ALPHA_SOURCE,TRINITY_ALPHA_HOST_SOURCE,TRINITY_SIBOOR_SOURCE].map(s=>Object.freeze({...s})));
const vectorsEqual=(a,b)=>vector(a)&&vector(b)&&a.every((n,i)=>Math.abs(n-b[i])<=1e-9);
const mask=v=>Array.isArray(v)&&validMask(v)&&new Set(v.map(String)).size===v.length?sorted(v.map(String)):null;
const recipeFields=['id','toolhead','extruder','hotend','cooling','board','carriage','mount','probe','gantry','belt_width_mm',
 'base_asset','modules','base_hidden_keys','hidden_xol_keys','removed_stock_keys','head_translation_mm','cover_source','source_version','eva'];
const recipePin=v=>sha(Object.fromEntries(recipeFields.map(k=>[k,v[k]??null])));

// Only immutable production sidecars authorize a native-alpha plan. An
// expected plan copied from the observed installation is not source evidence.
function nativeRecipeSources(inputs,inputSha256,add){
 const result=new Map();
 for(const [name,record]of Object.entries(inputs)){
  const expected=installedRecipeSourceSpecs.find(s=>s.file===name);
  if(!expected||!object(record)||typeof record.raw_json!=='string'||record.sha256!==expected.sha256
   ||sha(record.raw_json)!==expected.sha256||inputSha256[name]!==expected.sha256){
   add('failure','INSTALLED_RECIPE_SOURCE_INVALID','Native installed recipes require exact raw sidecar bytes and matching independently pinned input hashes.',{input:name});continue;
  }
  try{result.set(name,JSON.parse(record.raw_json))}catch{add('failure','INSTALLED_RECIPE_SOURCE_INVALID','Native recipe source JSON is invalid.',{input:name})}
 }
 return result;
}
function nativeInstalledRecipe(original,installed,machine,sources,inputSha256){
 const base=sources.get(TRINITY_ALPHA_SOURCE.file);if(!base)throw Error('Pinned base native-alpha source missing');
 if(inputSha256['MACHINE_HEAD_REGISTRATIONS.json']!==base.raw_registry_sha256)throw Error('Native-alpha original registration input changed or missing');
 if(original.id!==base.source_head_id||!base.asset?.files?.['parts.json']||!base.asset?.files?.['model.glb'])throw Error('Different native-alpha source recipe');
 const candidates=[base,...[TRINITY_ALPHA_HOST_SOURCE,TRINITY_SIBOOR_SOURCE].map(s=>sources.get(s.file)).filter(Boolean)];
 const matches=candidates.flatMap(source=>(source.rows||[]).filter(r=>r.machine_id===machine&&r.gantry_id===installed.gantry).map(row=>({source,row})));
 if(matches.length!==1)throw Error('Exact native-alpha host/gantry source row missing or duplicated');
 const {source,row}=matches[0];
 if(row.source_siboor_index_sha256&&inputSha256['SIBOOR_TRIDENT_ASSETS.json']!==row.source_siboor_index_sha256)throw Error('Native-alpha SIBOOR original author-index input changed or missing');
 if(source!==base&&(source.base_alpha_source?.sha256!==TRINITY_ALPHA_SOURCE.sha256
  ||source.raw_registry_sha256!==base.raw_registry_sha256||source.current_native_manifest_sha256!==base.current_native_manifest_sha256
  ||source.asset_id!==base.asset_id||source.decoded_model_sha256!==base.asset.files['model.glb'].decoded_sha256))throw Error('Native-alpha source lineage changed');
 if(installed.id!==row.id||!equal(installed.native_alpha_92,row)||row.belt_width_mm!==original.belt_width_mm)throw Error('Native-alpha installed row differs from the pinned source');
 // This minimal binding contains only the source-authored rail occurrence and
 // belt width needed by the production plan function. No transform is inferred.
 const binding={belt_width_mm:row.belt_width_mm,part_key:row.stock_block_key,xy_motors:row.xy_motors};
 const registry={trinity_alpha_92:{...base,rows:[row]},machines:{[machine]:row.gantry_id==='machine_gantry'?binding:{gantries:{[row.gantry_id]:binding}}}};
 const expected=trinityAlphaVariants({variants:[original]},registry,machine,row.gantry_id)[0];
 if(!expected)throw Error('Production native-alpha source plan is unavailable');
 return {expected,spec:base.asset,source_files:candidates.filter(s=>s===base||s===source).map(s=>{
  const item=installedRecipeSourceSpecs.find(p=>sources.get(p.file)===s);return {file:item.file,sha256:item.sha256};
 })};
}
function ordinaryInstalledPlanMatches(original,plan){
 const source=headPlan(original),delta=plan.translation.map((n,i)=>n-source.translation[i]);
 if(plan.base!==source.base||plan.source_gantry!==original.gantry||!mask(plan.hidden)||!equal(mask(plan.hidden),sorted([...source.hidden].map(String)))
  ||!vectorsEqual(plan.translation_delta_mm,delta))return false;
 const modules=source.modules.filter(m=>m.role!=='dock').map(m=>({...m,translation_mm:(m.translation_mm||source.translation).map((n,i)=>n+delta[i])}));
 // This additional native fastening module is explicit in installedHeadPlan;
 // no other installed-only module is admitted by an asset-name wildcard.
 if(original.toolhead==='indx')modules.push({id:'head_indx_rail_fasteners',translation_mm:delta,role:'tool'});
 if(modules.length!==plan.modules.length)return false;
 const remaining=[...plan.modules];
 for(const expected of modules){
  const i=remaining.findIndex(m=>m.id===expected.id);if(i<0)return false;
  const actual=remaining.splice(i,1)[0];
  if(!mask(actual.hidden_keys||[])||!equal(mask(actual.hidden_keys||[]),mask(expected.hidden_keys||[]))
   ||!vectorsEqual(actual.translation_mm,expected.translation_mm)
   ||!equal(Object.fromEntries(Object.entries(actual).filter(([k])=>!['hidden_keys','translation_mm'].includes(k))),
    Object.fromEntries(Object.entries(expected).filter(([k])=>!['hidden_keys','translation_mm'].includes(k)))))return false;
 }
 return !vector(original.fit?.nozzle_mm)||vectorsEqual(plan.nozzle_mm,original.fit.nozzle_mm.map((n,i)=>n+delta[i]));
}
const tuple=(v,dimensions)=>dimensions.map(d=>v[d]??null);
const count=(rows,dimensions)=>new Set(rows.map(v=>JSON.stringify(tuple(v,dimensions)))).size;
const status=rows=>rows.some(r=>r.severity==='failure')?'failure':rows.length?'open':'covered';
// Preserve literal exported revisions independently of Git matrix pins. A CAD
// workspace, element microversion or per-part revision is not a Git commit.
const revisionFields=['source_revision','source_commit','source_version','source_identity','source_id',
 'document_id','workspace_id','version_id','microversion_id','element_id','part_id'];
const nestedRevisionFields=['revision','commit','version','identity','id','document_id','documentId',
 'workspace_id','workspaceId','version_id','versionId','microversion_id','microversionId',
 'element_id','elementId','part_id','partId'];
function exportedRevisions(record){
 const result=Object.fromEntries(revisionFields.filter(k=>string(record?.[k])).map(k=>[k,record[k]]));
 if(object(record?.source))result.source=Object.fromEntries(nestedRevisionFields
  .filter(k=>string(record.source[k])).map(k=>[k,record.source[k]]));
 return result;
}

export function isPublicSourceURL(value){
 try{
  const u=new URL(value),host=u.hostname.toLowerCase().replace(/^\[|\]$/g,'');
  if(u.protocol!=='https:'||u.username||u.password||!host.includes('.')||
   /^(?:localhost|0\.|10\.|127\.|169\.254\.|192\.168\.|172\.(?:1[6-9]|2\d|3[01])\.)/.test(host)||
   /(?:\.local|\.internal|\.localhost)$/.test(host)||host.includes(':'))return false;
  return true;
 }catch{return false}
}
const urls=v=>strings(v)&&v.every(isPublicSourceURL);

export function composeHeadCoverageCatalog(raw,additions,{embeddedBoards=[]}={}){
 const merged=withRapidoXUhfCover(withHeadAdditions(raw,additions));
 return {...withEmbeddedBoards(merged,embeddedBoards),dimensions:[...headBuilderDimensions]};
}

function declaration(v){
 if(v.hardware_assembled===true)return 'assembled_declared';
 if(v.hardware_assembled===false)return 'mount_only_declared';
 const native=v.fit?.complete_head_native,base=v.base_asset||v.toolhead;
 const ids=new Set([base,...(v.modules||[]).map(m=>m.id)]);
 // A native state of 'clear' or a nozzle datum alone is not hardware evidence.
 if(native?.base===base&&[native.hotend,native.extruder,v.fit?.hotend_cooling?.module]
  .every(id=>string(id)&&ids.has(id)))return 'assembled_declared';
 return 'hardware_unknown';
}

function planEntries(v){
 const plan=headPlan(v);
 return [{id:plan.base,hidden_keys:[...plan.hidden],translation_mm:plan.translation},
  ...plan.modules.filter(m=>m.role!=='dock')];
}

function auditMetadata(v,catalog,metadata,add){
 const entries=planEntries(v),assets=[],visible=new Map();let complete=true;
 for(const entry of entries){
  const spec=catalog.base_assets?.[entry.id]||catalog.assets?.[entry.id];
  if(!spec){add('failure','ASSET_UNREGISTERED','A retained head asset is not registered.',{variant:v.id,asset:entry.id});complete=false;continue}
  const meta=metadata[entry.id],hidden=new Set((entry.hidden_keys||[]).map(String));
  assets.push({id:entry.id,hidden_keys:sorted(hidden),spec_sha256:sha(spec),
   metadata_semantic_sha256:meta?sha(meta):null,
   declared_model_sha256:spec.decoded_model_sha256||spec.files?.['model.glb']?.decoded_sha256||spec.files?.['model.glb']?.sha256||null});
  if(!meta){complete=false;continue}
  if(!Array.isArray(meta.parts)||!meta.parts.length){
   add('failure','ASSET_METADATA_INVALID','An exported metadata inventory is empty or malformed.',{variant:v.id,asset:entry.id});complete=false;continue;
  }
  if(spec.parts!==undefined&&spec.parts!==meta.parts.length)
   add('failure','ASSET_PART_COUNT_CHANGED','Exported metadata does not match the declared leaf count.',{variant:v.id,asset:entry.id});
  const seen=new Set(),parts=new Map();
  for(const part of meta.parts){
   if(!object(part)||part.key===undefined||part.key===null||!String(part.key)||seen.has(String(part.key))){
    add('failure','PART_ID_INVALID','Exported part keys must be present and unique per asset.',{variant:v.id,asset:entry.id});complete=false;continue;
   }
   const key=String(part.key);seen.add(key);parts.set(key,part);
  }
  for(const key of hidden)if(!seen.has(key))add('failure','HIDDEN_PART_UNKNOWN','A head visibility mask names a missing exported leaf.',{variant:v.id,asset:entry.id,part:key});
  if(visible.has(entry.id))add('failure','ASSET_INSTANCE_DUPLICATED','The head plan repeats an asset; companion instance coverage is ambiguous.',{variant:v.id,asset:entry.id});
  visible.set(entry.id,{parts,hidden});
 }
 const observed=new Set();let classificationComplete=true;
 for(const {parts,hidden}of visible.values())for(const [key,p]of parts)if(!hidden.has(key)){
  const purchased=!['base','accent','frame','cnc'].includes(p.appearance_role)&&p.material!=='printed'&&p.component!=='printed';
  for(const role of Array.isArray(p.eva_companions)?p.eva_companions:[])if(hardwareRoles.has(role)&&purchased)observed.add(role);
  // Only explicit source categories are accepted. Printed descendants, names,
  // parent labels and 'mount' substrings cannot establish purchased hardware.
  if(hardwareRoles.has(p.component)&&!['printed','base','accent'].includes(p.material)&&
   !['base','accent','frame','cnc'].includes(p.appearance_role))observed.add(p.component);
  if(!string(p.component)&&!string(p.material)&&!string(p.appearance_role)&&
   !(Array.isArray(p.eva_companions)&&p.eva_companions.length))classificationComplete=false;
 }
 const visibleParts=[...visible.values()].flatMap(({parts,hidden})=>[...parts].filter(([key])=>!hidden.has(key)).map(([,p])=>p));
 return {entries,assets,visible,complete,classificationComplete,printedOnly:visibleParts.length>0&&visibleParts.every(printedLeaf),observed:sorted(observed)};
}

function validateMatrix(matrix,add){
 if(matrix===null||matrix===undefined)return [];
 if(!object(matrix)||matrix.schema!==sourceMatrixSchema||!Array.isArray(matrix.families)){
  add('failure','SOURCE_MATRIX_SCHEMA','Invalid pinned source-family matrix.');return [];
 }
 if(!matrix.families.length)add('open','SOURCE_MATRIX_EMPTY','The supplied source-family matrix reviews no families.');
 const ids=new Set(),combos=new Set(),families=[];
 for(const family of matrix.families){
  if(!object(family)||!string(family.id)||ids.has(family.id)||!['required','open'].includes(family.status)||
   !commit(family.sourceCommit)||!urls(family.sourceUrls)||
   !family.sourceUrls.some(u=>u.includes(family.sourceCommit))||!Array.isArray(family.expectedCombinations)){
   add('failure','SOURCE_FAMILY_SCHEMA','Each family needs a unique ID, status, full source commit, public pinned URLs and exact expected combinations.',{family:family?.id??null});continue;
  }
  ids.add(family.id);
  const validated={...family,expectedCombinations:[]};families.push(validated);
  if(!family.expectedCombinations.length)add('open','SOURCE_EXPECTATIONS_EMPTY','This source family has no source-backed expected combination IDs.',{family:family.id});
  if(family.options!==undefined&&(!object(family.options)||Object.entries(family.options).some(([d,values])=>
   !Object.hasOwn(collections,d)||!strings(values)))){
   add('failure','SOURCE_OPTIONS_SCHEMA','Named option expectations must use catalog dimensions and unique option IDs.',{family:family.id});validated.options={};
  }
  for(const expected of family.expectedCombinations){
   if(!object(expected)||!string(expected.id)||combos.has(expected.id)||
    expected.status!==undefined&&!['required','open'].includes(expected.status)||
    !['assembled','mount_only'].includes(expected.assembly)||!object(expected.selection)||
    expected.selection.toolhead!==family.id||Object.entries(expected.selection).some(([d,id])=>!Object.hasOwn(collections,d)||!string(id))||
    inventoryDimensions.some(d=>!string(expected.selection[d]))||!Array.isArray(expected.requiredCompanions)||
    expected.sourceCommit!==undefined&&!commit(expected.sourceCommit)||
    expected.sourceUrls!==undefined&&!urls(expected.sourceUrls)){
    add('failure','SOURCE_COMBINATION_SCHEMA','Expected combinations need exact unique IDs, complete component selections, assembly scope and companion identities.',{family:family.id,variant:expected?.id??null});continue;
   }
   combos.add(expected.id);validated.expectedCombinations.push(expected);
   const pin=expected.sourceCommit||family.sourceCommit,links=expected.sourceUrls||family.sourceUrls;
   if(!links.some(u=>u.includes(pin)))add('failure','SOURCE_COMBINATION_UNPINNED','The expected combination has no URL at its exact source commit.',{family:family.id,variant:expected.id});
   const roles=new Set();
   for(const required of expected.requiredCompanions){
    if(!object(required)||!string(required.role)||!string(required.assetId)||!strings(required.partKeys)||roles.has(required.role)||
     required.sourceCommit!==undefined&&!commit(required.sourceCommit)||required.sourceUrls!==undefined&&!urls(required.sourceUrls)){
     add('failure','SOURCE_COMPANION_SCHEMA','Required companions need unique roles, exact asset IDs and unique exported leaf keys.',{family:family.id,variant:expected.id});continue;
    }
    roles.add(required.role);
    const revision=required.sourceCommit||pin,sourceUrls=required.sourceUrls||links;
    if(!sourceUrls.some(u=>u.includes(revision)))add('failure','SOURCE_COMPANION_UNPINNED','A companion has no URL at its exact source commit.',{family:family.id,variant:expected.id,role:required.role});
   }
   for(const field of ['notRequiredCompanions','unknownCompanions']){
    if(expected[field]!==undefined&&!Array.isArray(expected[field])){add('failure','SOURCE_COMPANION_SCHEMA','Companion dispositions must be arrays.',{family:family.id,variant:expected.id});continue}
    for(const disposition of expected[field]||[]){
     if(!object(disposition)||!string(disposition.role)||!string(disposition.reason)||roles.has(disposition.role)||
      field==='notRequiredCompanions'&&!urls(disposition.sourceUrls)){
      add('failure','SOURCE_COMPANION_SCHEMA','Each omitted or unknown role needs a unique explicit disposition; exemptions need public source URLs.',{family:family.id,variant:expected.id});continue;
     }
     roles.add(disposition.role);
     if(field==='notRequiredCompanions'&&!disposition.sourceUrls.some(u=>u.includes(pin)))
      add('failure','SOURCE_EXEMPTION_UNPINNED','A companion exemption needs a URL at the exact source commit.',{family:family.id,variant:expected.id,role:disposition.role});
    }
   }
   if(expected.forbiddenCompanions!==undefined&&(!Array.isArray(expected.forbiddenCompanions)||expected.forbiddenCompanions.some(p=>
    !object(p)||!string(p.assetId)||!strings(p.partKeys))))add('failure','SOURCE_COMPANION_SCHEMA','Forbidden companions need exact asset IDs and leaf keys.',{family:family.id,variant:expected.id});
  }
 }
 return families;
}

/** Pure, deterministic reporter for the production-merged head catalog.
 * machineCatalogs: [{machine, variants: productionComposedVariants}]. Only an
 * exact source_head_configuration and matching component tuple + machine_head
 * plan establishes a registration here; it never establishes physical fit.
 * sourceHosts: [{configuration, machine, sourceCommit, sourceUrls,
 *   modelSha256, manifestSha256}]. These identify retained source assemblies,
 * not arbitrary other-host installations. No host is inferred from a name.
 * assetMetadata: {assetId: exportedPartsJSON}. Presence checks use the actual
 * headPlan masks, not the catalog's hardware_assembled flag.
 * installedRecipeSources: {sidecarFilename: {raw_json, sha256}}. Native-alpha
 * exceptions require immutable production pins, exact rows and actual metadata.
 */
export function auditHeadCombinationCoverage(catalog,{sourceMatrix=null,machineCatalogs=[],sourceHosts=[],assetMetadata={},inputSha256={},installedRecipeSources={}}={}){
 if(!object(catalog)||!Array.isArray(catalog.variants))throw TypeError('A merged catalog with variants is required');
 if(!Array.isArray(machineCatalogs)||!Array.isArray(sourceHosts)||!object(assetMetadata)||!object(inputSha256)||!object(installedRecipeSources))throw TypeError('Invalid coverage evidence input');
 const findings=[],add=(severity,code,message,context={})=>findings.push({severity,code,message,...context});
 for(const [name,value]of Object.entries(inputSha256))if(!hash(value))add('failure','INPUT_HASH_INVALID','Supplied raw input hashes must be SHA-256 values.',{input:name});
 const nativeSources=nativeRecipeSources(installedRecipeSources,inputSha256,add);
 const options=new Map();
 for(const [dimension,collection]of Object.entries(collections)){
  const values=catalog[collection];options.set(dimension,new Map());
  if(!Array.isArray(values)){add('failure','CATALOG_OPTIONS_MISSING','A merged catalog option collection is missing.',{dimension});continue}
  for(const option of values){
   if(!object(option)||!string(option.id)||options.get(dimension).has(option.id))add('failure','CATALOG_OPTION_INVALID','Option IDs must be unique and named.',{dimension,option:option?.id??null});
   else options.get(dimension).set(option.id,option);
  }
 }
 const variants=new Map(),rows=[];
 for(const v of catalog.variants){
  if(!object(v)||!string(v.id)||variants.has(v.id)){add('failure','CATALOG_VARIANT_INVALID','Configuration IDs must be present and unique.',{variant:v?.id??null});continue}
  variants.set(v.id,v);
  for(const dimension of Object.keys(collections))if(!options.get(dimension).has(v[dimension]))add('failure','CATALOG_VARIANT_OPTION_UNKNOWN','A variant refers to an undeclared named option.',{variant:v.id,dimension,option:v[dimension]??null});
  if(v.hardware_assembled!==undefined&&typeof v.hardware_assembled!=='boolean')add('failure','HARDWARE_DECLARATION_INVALID','Hardware assembly declarations must be booleans.',{variant:v.id});
  const validPlan=vector(v.head_translation_mm)&&Array.isArray(v.modules)&&!v.modules.some(m=>!object(m)||!string(m.id)||!validMask(m.hidden_keys)||m.translation_mm!==undefined&&!vector(m.translation_mm))&&
   [v.base_hidden_keys,v.hidden_xol_keys,v.removed_stock_keys].every(validMask);
  if(!validPlan){
   add('failure','HEAD_PLAN_INVALID','Head placements, modules or visibility masks are invalid.',{variant:v.id});
  }
  const meta=validPlan?auditMetadata(v,catalog,assetMetadata,add):{entries:[],assets:[],visible:new Map(),complete:false,classificationComplete:false,observed:[]},
   declared=validPlan?declaration(v):'hardware_unknown';
  if(meta.complete&&v.hardware_assembled===true&&meta.printedOnly)
   add('failure','ASSEMBLED_DECLARATION_WITHOUT_HARDWARE','The assembled declaration retains only explicitly printed metadata leaves.',{variant:v.id});
  const native=v.fit?.complete_head_native;
  rows.push({id:v.id,recipe_sha256:recipePin(v),selection:Object.fromEntries(Object.keys(collections).map(d=>[d,v[d]??null])),
   core:tuple(v,coreDimensions),assembly:declared,valid_plan:validPlan,hardware_metadata:!meta.complete||!meta.classificationComplete?'unreviewed':
    meta.printedOnly?'mount_only_observed':hardwareRoles.size===meta.observed.length?'hardware_roles_observed':
     meta.observed.length?'partial_hardware_observed':'unreviewed',
   observed_hardware_roles:meta.observed,retained_assets:meta.assets,companion_status:'unreviewed',
   machine_registrations:[],source_hosts:[],declared_source_host:v.eva?.source_machine?structuredClone(v.eva.source_machine):null,
   source_revision:v.source_version||v.source_commit||v.eva?.source_revision||null,
   native_fit:{certified:false,catalog_state:native?.state??null,
    catalog_scope:native?.scope??null,catalog_body_findings:native?.body_collisions?.length??0},_meta:meta});
 }
 const rowById=new Map(rows.map(r=>[r.id,r]));
 if(!catalog.variants.length)add('failure','CATALOG_EMPTY','The merged head catalog contains no configurations.');
 const machines=[],seenMachines=new Set();
 for(const entry of machineCatalogs){
  if(!object(entry)||!string(entry.machine)||seenMachines.has(entry.machine)||!Array.isArray(entry.variants)){
   add('failure','MACHINE_CATALOG_INVALID','Machine evidence must contain one production catalog per machine.',{machine:entry?.machine??null});continue;
  }
  seenMachines.add(entry.machine);let registered=0;const seen=new Set();
  for(const installed of entry.variants){
   if(!object(installed)||!string(installed.id)||seen.has(installed.id)){add('failure','MACHINE_VARIANT_INVALID','Installed IDs must be unique per machine.',{machine:entry.machine});continue}
   seen.add(installed.id);
   // Stock machine rows without a source-head link are outside this head audit.
   if(!installed.source_head_configuration)continue;
   const original=variants.get(installed.source_head_configuration),row=rowById.get(installed.source_head_configuration),plan=installed.machine_head;
   if(!original||!row||!row.valid_plan||!plan||plan.source_variant!==original.id||!string(plan.base)||!vector(plan.translation)||!vector(plan.nozzle_mm)||
    !Array.isArray(plan.hidden)||!validMask(plan.hidden)||!Array.isArray(plan.modules)||plan.modules.some(m=>!object(m)||!string(m.id)||!validMask(m.hidden_keys)||!vector(m.translation_mm))||
    !equal(tuple(original,[...inventoryDimensions,'mount','probe']),tuple(installed,[...inventoryDimensions,'mount','probe']))){
    add('failure','MACHINE_REGISTRATION_MISMATCH','A production installation lacks its exact head recipe, component selections or finite placement.',{machine:entry.machine,variant:installed.id});continue;
   }
   let sourceProof={kind:'standalone_source_plan_with_registered_translation',source_recipe_sha256:recipePin(original),installed_plan_sha256:sha(plan)};
   if(installed.native_alpha_92){
    try{
     const native=nativeInstalledRecipe(original,installed,entry.machine,nativeSources,inputSha256);
     if(!equal(plan,native.expected.machine_head))throw Error('Installed native-alpha base, masks, companions, datums or retained stock hardware differ from the production source plan');
     const registered=catalog.base_assets?.[plan.base]||catalog.assets?.[plan.base];
     if(registered&&!equal(registered,native.spec)||assetMetadata[plan.base]?.id!==native.spec.component_id)throw Error('Installed native-alpha asset/metadata source identity changed');
     const effective={...original,base_asset:plan.base,head_translation_mm:plan.translation,base_hidden_keys:plan.hidden,modules:plan.modules};
     const before=findings.length,meta=auditMetadata(effective,{base_assets:{[plan.base]:native.spec}},assetMetadata,add);
     if(!meta.complete||findings.slice(before).some(f=>f.severity==='failure'))throw Error('Installed native-alpha exported metadata is missing or inconsistent');
     sourceProof={...sourceProof,kind:'pinned_native_alpha_production_plan',source_files:native.source_files,
      source_asset_spec_sha256:sha(native.spec),metadata_semantic_sha256:sha(assetMetadata[plan.base]),
      declared_model_sha256:native.spec.files['model.glb'].decoded_sha256,
      required_hidden_belt_samples:[...TRINITY_INSTALLED_BELT_SAMPLE_KEYS],retained_assets:meta.assets};
    }catch(error){add('failure','MACHINE_NATIVE_RECIPE_INVALID',error.message,{machine:entry.machine,variant:installed.id});continue}
   }else if(!ordinaryInstalledPlanMatches(original,plan)){
    add('failure','MACHINE_COMPANION_PLAN_CHANGED','Installed base, exact modules, masks or source-relative companion/nozzle placements differ from the registered source recipe.',{machine:entry.machine,variant:installed.id});continue;
   }
   if(!installed.native_alpha_92&&object(entry.assets)){
    const effective={...original,base_asset:plan.base,head_translation_mm:plan.translation,base_hidden_keys:plan.hidden,modules:plan.modules};
    const meta=auditMetadata(effective,{base_assets:catalog.base_assets,assets:{...catalog.assets,...entry.assets}},assetMetadata,add);
    sourceProof={...sourceProof,retained_assets:meta.assets,exported_metadata_status:meta.complete?'metadata_present':'unreviewed'};
   }
   row.machine_registrations.push({machine:entry.machine,configuration:installed.id,gantry:installed.gantry,
    recipe_review:sourceProof,registration_only:true,native_fit_certified:false});registered++;
  }
  machines.push({machine:entry.machine,production_rows:entry.variants.length,head_registration_rows:registered,
   unique_core_combinations:count(entry.variants.filter(v=>rowById.get(v.source_head_configuration)?.machine_registrations.some(r=>r.machine===entry.machine&&r.configuration===v.id)),coreDimensions)});
 }
 const hostIds=new Set();
 for(const host of sourceHosts){
  const row=rowById.get(host?.configuration),v=variants.get(host?.configuration),key=JSON.stringify([host?.configuration,host?.machine]);
  if(!object(host)||!row||!string(host.machine)||hostIds.has(key)||!string(host.sourceCommit)||!urls(host.sourceUrls)||
   !hash(host.modelSha256)||!hash(host.manifestSha256)||host.sourceCommit!==row.source_revision){
   add('failure','SOURCE_HOST_INVALID','A source host needs an exact registered head, source revision, public URLs and model/manifest hashes.',{variant:host?.configuration??null,machine:host?.machine??null});continue;
  }
  hostIds.add(key);
  const source=v.eva?.source_machine;
  if(source&&(source.id!==host.machine||source.decoded_model_sha256!==host.modelSha256||source.manifest_sha256!==host.manifestSha256)){
   add('failure','SOURCE_HOST_CHANGED','The source host no longer matches the catalog model/manifest identities.',{variant:host.configuration,machine:host.machine});continue;
  }
  row.source_hosts.push({...structuredClone(host),source_assembly_only:true,native_fit_certified:false});
 }
 const matrixFamilies=validateMatrix(sourceMatrix,add),expectationRows=[],reviewed=new Set();
 for(const family of matrixFamilies){
  const severity=family.status==='required'?'failure':'open';
  if(!options.get('toolhead').has(family.id)&&!rows.some(r=>r.selection.toolhead===family.id))add(severity,'SOURCE_FAMILY_UNREGISTERED','A public source family has no registration in the merged catalog.',{family:family.id});
  for(const expected of family.expectedCombinations){
   if(!object(expected)||!string(expected.id))continue;
   const level=(expected.status||family.status)==='required'?'failure':'open',row=rowById.get(expected.id);
   const expectationStatus=()=>status(findings.filter(f=>f.variant===expected.id));
   const context={family:family.id,variant:expected.id};
   if(!row){add(level,'EXPECTED_COMBINATION_MISSING','An exact source-backed combination is missing; no Cartesian alternatives are inferred.',context)}
   else{
    if(row.selection.toolhead!==family.id||!object(expected.selection)||Object.entries(expected.selection).some(([d,id])=>row.selection[d]!==id))add(level,'EXPECTED_SELECTION_MISMATCH','The exact configuration ID refers to different components.',context);
    if(row.source_revision!==(expected.sourceCommit||family.sourceCommit))add(level,'SOURCE_REVISION_MISMATCH','The catalog recipe is not at the pinned source commit.',context);
    if(expected.assembly==='assembled'&&row.assembly==='mount_only_declared')add(level,'ASSEMBLED_HARDWARE_FALSE','The expected assembly is explicitly registered as mount-only.',context);
    if(expected.assembly==='mount_only'&&(row.assembly==='assembled_declared'||row._meta.observed.length))
     add(level,'MOUNT_ONLY_SCOPE_MISMATCH','A mount-only source expectation refers to declared or observed assembled hardware.',context);
    if(!expected.requiredCompanions.length)add(level,'SOURCE_COMPANIONS_EMPTY','An exact source expectation has no required exported companion identities.',context);
    const dispositions=new Set([...(expected.requiredCompanions||[]),...(Array.isArray(expected.notRequiredCompanions)?expected.notRequiredCompanions:[])].map(p=>p?.role));
    if(expected.assembly==='assembled'&&['hotend','nozzle'].some(role=>!expected.requiredCompanions.some(p=>p?.role===role)))
     add(level,'ASSEMBLED_CORE_REQUIREMENTS_MISSING','An assembled hardware expectation needs exact hotend and nozzle leaves.',context);
    if(expected.assembly==='assembled')for(const role of companionRoles)if(!dispositions.has(role))add(level,'COMPANION_REQUIREMENT_UNKNOWN','The exact source has no resolved companion requirement or exemption.',{...context,role});
    for(const unknown of Array.isArray(expected.unknownCompanions)?expected.unknownCompanions:[]){
     if(!object(unknown))continue;
     if(expected.assembly!=='assembled')add(level,'COMPANION_REQUIREMENT_UNKNOWN',unknown.reason||'Unresolved companion requirement.',{...context,role:unknown.role});
    }
    for(const required of Array.isArray(expected.requiredCompanions)?expected.requiredCompanions:[]){
     if(!object(required)||!strings(required.partKeys))continue;
     const present=row._meta.visible.get(required.assetId),entry=row._meta.entries.find(e=>e.id===required.assetId);
     if(!entry){add(level,'REQUIRED_COMPANION_ASSET_MISSING','A required source companion asset is absent from the head plan.',{...context,role:required.role,asset:required.assetId});continue}
     if(!present){add(level,'COMPANION_METADATA_MISSING','Required companion exported leaves have not been inspected.',{...context,role:required.role,asset:required.assetId});continue}
     for(const [asset,retained]of row._meta.visible)for(const [key,p]of retained.parts)if(!retained.hidden.has(key)&&
      (p.component===required.role||Array.isArray(p.eva_companions)&&p.eva_companions.includes(required.role))&&
      (asset!==required.assetId||!required.partKeys.includes(key)))
      add(level,'UNEXPECTED_COMPANION_VISIBLE','A source-categorized extra companion remains visible outside the exact required leaf set.',{...context,role:required.role,asset,part:key});
     for(const key of required.partKeys){
      const p=present.parts.get(key);
      if(!p)add(level,'REQUIRED_COMPANION_PART_MISSING','An exact required companion leaf is missing.',{...context,role:required.role,asset:required.assetId,part:key});
      else if(present.hidden.has(key))add(level,'REQUIRED_COMPANION_HIDDEN','An exact required companion is hidden in the current head plan.',{...context,role:required.role,asset:required.assetId,part:key});
      else{
       const meta=assetMetadata[required.assetId],revision=p.source_revision||p.source_commit||p.source?.revision||p.source?.commit||meta.source_revision||meta.source_commit;
       if(revision!==(required.sourceCommit||expected.sourceCommit||family.sourceCommit))add(level,'COMPANION_SOURCE_MISMATCH','A retained companion leaf lacks the pinned source revision.',{...context,role:required.role,asset:required.assetId,part:key});
       if(hardwareRoles.has(required.role)&&(['base','accent','frame','cnc'].includes(p.appearance_role)||p.material==='printed'||p.component==='printed'))add(level,'PURCHASED_COMPANION_PRINTED','A purchased hardware requirement resolves to a printed/palette-mutable leaf.',{...context,role:required.role,asset:required.assetId,part:key});
      }
     }
    }
    for(const forbidden of Array.isArray(expected.forbiddenCompanions)?expected.forbiddenCompanions:[]){
     if(!object(forbidden)||!Array.isArray(forbidden.partKeys))continue;
     const retained=row._meta.visible.get(forbidden.assetId);
     for(const key of forbidden.partKeys)if(retained?.parts.has(key)&&!retained.hidden.has(key))add(level,'OBSOLETE_COMPANION_VISIBLE','A forbidden obsolete/alternative companion remains visible.',{...context,asset:forbidden.assetId,part:key});
    }
    reviewed.add(row.id);row.companion_status=expectationStatus();
    if(row.companion_status==='covered')row.companion_status='metadata_covered';
    // Even a truthful assembled flag requires the source-specific leaves above.
    if(!row._meta.complete&&row.companion_status==='metadata_covered'){
     add(level,'SOURCE_METADATA_INCOMPLETE','The reviewed source plan contains unaudited retained asset metadata.',context);row.companion_status=level;
    }
   }
   expectationRows.push({family:family.id,id:expected.id,policy:expected.status||family.status,
    sourceCommit:expected.sourceCommit||family.sourceCommit,sourceUrls:expected.sourceUrls||family.sourceUrls,
    present:!!row,status:expectationStatus(),native_fit_certified:false});
  }
 }
 const families=[];
 for(const id of sorted([...options.get('toolhead').keys(),...rows.map(r=>r.selection.toolhead).filter(string)])){
  const familyRows=rows.filter(r=>r.selection.toolhead===id),familyMatrix=matrixFamilies.find(f=>f.id===id),ctx={family:id};
  if(!familyRows.length)add('open','FAMILY_WITHOUT_VARIANTS','A named catalog family has no configuration rows.',ctx);
  if(!familyMatrix)add('open','SOURCE_FAMILY_UNREVIEWED','No pinned public source-family matrix covers this registered family.',ctx);
  const unreviewed=familyRows.filter(r=>!reviewed.has(r.id));
  if(unreviewed.length)add('open','COMPANION_COVERAGE_UNREVIEWED','Registered configurations lack exact source-backed companion review.',{...ctx,variants:unreviewed.map(r=>r.id)});
  const optionCoverage={};
  for(const dimension of inventoryDimensions.filter(d=>d!=='toolhead')){
   const present=sorted(familyRows.map(r=>r.selection[dimension]).filter(string)),expected=familyMatrix?.options?.[dimension]||[],missing=expected.filter(value=>!present.includes(value));
   for(const value of missing)add(familyMatrix.status==='required'?'failure':'open','NAMED_FAMILY_OPTION_MISSING','A source-backed named family option is not represented.',{...ctx,dimension,option:value});
   optionCoverage[dimension]={represented:present,expected:[...expected],missing,
    options:present.map(value=>{const matches=familyRows.filter(r=>r.selection[dimension]===value);return {id:value,label:options.get(dimension).get(value)?.label||value,
     unique_core_combinations:new Set(matches.map(r=>JSON.stringify(r.core))).size,configuration_ids:matches.map(r=>r.id),
     assembled_declared:matches.filter(r=>r.assembly==='assembled_declared').length,
     machine_registered:matches.filter(r=>r.machine_registrations.length).length,source_host:matches.filter(r=>r.source_hosts.length).length}})};
  }
  families.push({id,label:options.get('toolhead').get(id)?.label||id,configuration_rows:familyRows.length,
   unique_core_combinations:new Set(familyRows.map(r=>JSON.stringify(r.core))).size,
   unique_carriage_combinations:new Set(familyRows.map(r=>JSON.stringify([...r.core,r.selection.carriage]))).size,
   assembly:Object.fromEntries(['assembled_declared','mount_only_declared','hardware_unknown'].map(s=>[s,familyRows.filter(r=>r.assembly===s).length])),
   assembly_core_combinations:Object.fromEntries(['assembled_declared','mount_only_declared','hardware_unknown'].map(s=>[s,new Set(familyRows.filter(r=>r.assembly===s).map(r=>JSON.stringify(r.core))).size])),
   standalone_rows:familyRows.length,machine_registered_rows:familyRows.filter(r=>r.machine_registrations.length).length,
   machine_registered_core_combinations:new Set(familyRows.filter(r=>r.machine_registrations.length).map(r=>JSON.stringify(r.core))).size,
   source_host_rows:familyRows.filter(r=>r.source_hosts.length).length,source_host_declared_rows:familyRows.filter(r=>r.declared_source_host).length,
   standalone_only_rows:familyRows.filter(r=>!r.machine_registrations.length&&!r.source_hosts.length).length,
   source_matrix_status:familyMatrix?'supplied':'unreviewed',option_coverage:optionCoverage,native_fit_certified:false});
 }
 const unusedOptions={};
 for(const d of inventoryDimensions)unusedOptions[d]=[...options.get(d).keys()].filter(id=>!rows.some(r=>r.selection[d]===id)).sort();
 const failures=findings.filter(f=>f.severity==='failure').length,open=findings.filter(f=>f.severity==='open').length;
 return {schema:'3d-print-rig-head-combination-coverage-v1',status:status(findings),passed:!failures&&!open,
  scope:{catalog:'Production-merged catalog supplied to the pure validator; CLI composes withHeadAdditions, Rapido X cover and embedded boards.',
   counting:'Core tuples: toolhead/extruder/hotend/cooling; carriage tuples add carriage. Board, gantry, mount, probe and machine rows never multiply core counts.',
   registration:'Only supplied production machine catalogs and exact pinned source hosts; standalone catalog support does not establish machine installation.',
   companions:'Exact source-matrix IDs and visible exported metadata leaves; no guessed Cartesian combinations or name-based hardware.',
   native_solid_clearance:false,exported_meshes_inspected:false,browser_review:false,motion_or_viewer_reset_review:false,whole_head_fit_certified:false},
  input_sha256:{...inputSha256,merged_catalog_semantic:sha(catalog),source_matrix_semantic:sourceMatrix?sha(sourceMatrix):null,
   machine_catalogs_semantic:sha(machineCatalogs),source_hosts_semantic:sha(sourceHosts),asset_metadata_semantic:sha(assetMetadata),installed_recipe_sources_semantic:sha(installedRecipeSources)},
  summary:{configuration_rows:rows.length,unique_core_combinations:count(rows.map(r=>r.selection),coreDimensions),
   unique_carriage_combinations:count(rows.map(r=>r.selection),[...coreDimensions,'carriage']),
   registered_families:families.length,unique_options:Object.fromEntries(inventoryDimensions.map(d=>[d,sorted(rows.map(r=>r.selection[d]).filter(string)).length])),
   assembled_declared_rows:rows.filter(r=>r.assembly==='assembled_declared').length,
   mount_only_declared_rows:rows.filter(r=>r.assembly==='mount_only_declared').length,hardware_unknown_rows:rows.filter(r=>r.assembly==='hardware_unknown').length,
   assembly_core_combinations:Object.fromEntries(['assembled_declared','mount_only_declared','hardware_unknown'].map(s=>[s,new Set(rows.filter(r=>r.assembly===s).map(r=>JSON.stringify(r.core))).size])),
   observed_mount_only_rows:rows.filter(r=>r.hardware_metadata==='mount_only_observed').length,
   metadata_covered_rows:rows.filter(r=>r.companion_status==='metadata_covered').length,
   machine_registered_head_rows:rows.filter(r=>r.machine_registrations.length).length,source_host_head_rows:rows.filter(r=>r.source_hosts.length).length,
   machine_registered_core_combinations:new Set(rows.filter(r=>r.machine_registrations.length).map(r=>JSON.stringify(r.core))).size,
   source_host_core_combinations:new Set(rows.filter(r=>r.source_hosts.length).map(r=>JSON.stringify(r.core))).size,
   source_host_declared_rows:rows.filter(r=>r.declared_source_host).length,
   standalone_only_rows:rows.filter(r=>!r.machine_registrations.length&&!r.source_hosts.length).length,
   exact_source_expectations:expectationRows.length,failures,open_findings:open},
  families,machines,unused_options:unusedOptions,source_expectations:expectationRows,
  exported_source_revisions:{metadata_only:true,source_requirements_verified:false,
   assets:sorted(rows.flatMap(r=>r.retained_assets.map(a=>a.id))).filter(id=>object(assetMetadata[id]))
    .map(id=>({id,metadata:exportedRevisions(assetMetadata[id]),
     parts:(Array.isArray(assetMetadata[id].parts)?assetMetadata[id].parts:[]).filter(object)
      .map(p=>({key:p.key??null,...exportedRevisions(p)}))}))},
  configurations:rows.map(({_meta,...r})=>r),findings};
}

// Evidence preparation can review one actual production row without running
// global composition or generating any combinations. Open author/source-family
// review stays outside this recipe result and must survive the full audit.
export function reviewInstalledHeadRecipe(catalog,original,installed,machine,options={}){
 if(!catalog?.variants?.some(v=>v.id===original?.id)||!equal(catalog.variants.find(v=>v.id===original.id),original))
  throw TypeError('Exact original recipe must come from the supplied production catalog');
 // Limit semantic hashing to the supplied row's assets. A producer may hold
 // metadata for the entire inventory; hashing all of it for every row would
 // turn a bounded comparison into repeated whole-inventory work.
 const ids=new Set([original.base_asset||original.toolhead,installed?.machine_head?.base,
  ...(Array.isArray(original.modules)?original.modules:[]).map(m=>m?.id),
  ...(Array.isArray(installed?.machine_head?.modules)?installed.machine_head.modules:[]).map(m=>m?.id)].filter(string));
 const select=values=>Object.fromEntries([...ids].filter(id=>Object.hasOwn(values||{},id)).map(id=>[id,values[id]]));
 const scoped={...catalog,variants:[original],base_assets:select(catalog.base_assets),assets:select(catalog.assets)};
 const report=auditHeadCombinationCoverage(scoped,{assetMetadata:select(options.assetMetadata),
  inputSha256:options.inputSha256||{},installedRecipeSources:options.installedRecipeSources||{},
  machineCatalogs:[{machine,variants:[installed]}]});
 const registration=report.configurations[0]?.machine_registrations.find(r=>r.machine===machine&&r.configuration===installed?.id);
 return {passed:report.summary.failures===0&&!!registration,recipe_review:registration?.recipe_review??null,
  findings:report.findings.filter(f=>f.severity==='failure'),source_family_reviewed:false,
  exported_meshes_inspected:false,native_fit_certified:false};
}

export function coverageExitCode(report,{strictOpen=false}={}){
 return report.status==='failure'||strictOpen&&report.status==='open'?1:0;
}

export function renderHeadCoverageMarkdown(report){
 const s=report.summary;
 return ['# Head combination coverage','',`Status: **${report.status}**. ${s.failures} failures; ${s.open_findings} open findings.`,
  '',`${s.configuration_rows} configuration rows; ${s.unique_core_combinations} unique toolhead/extruder/hotend/cooling combinations; ${s.unique_carriage_combinations} with carriage.`,
  '',report.scope.counting,'',report.scope.companions,
  '', 'This report does not establish native fit, exported mesh rendering, movement or viewer reset. Assembled declarations are not hardware-presence passes.',
  '', '| Family | Core combinations | Rows | Declared assembled | Declared mount-only | Hardware unknown | Machine rows | Source-host rows |',
  '| --- | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ...report.families.map(f=>`| ${f.id.replaceAll('|','\\|')} | ${f.unique_core_combinations} | ${f.configuration_rows} | ${f.assembly.assembled_declared} | ${f.assembly.mount_only_declared} | ${f.assembly.hardware_unknown} | ${f.machine_registered_rows} | ${f.source_host_rows} |`),
  '', 'Detailed named options, exact IDs, source pins, input hashes and findings are in the JSON report.',''].join('\n');
}

async function main(argv){
 const flags=new Map();let strictOpen=false;
 for(let i=0;i<argv.length;i++){
  if(argv[i]==='--strict-open'){strictOpen=true;continue}
  if(!['--site','--additions','--source-matrix','--evidence','--output'].includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--')||flags.has(argv[i]))throw Error('Usage: --site <assembled-site> [--additions <json>] [--source-matrix <json>] [--evidence <json>] [--output <json>] [--strict-open]');
  flags.set(argv[i],argv[++i]);
 }
 if(!flags.has('--site'))throw Error('--site <assembled-site> is required; a missing production catalog is not a skipped pass');
 const root=path.resolve(flags.get('--site')),inputSha256={},inputFiles=new Map();
 const read=(file,label)=>{const bytes=fs.readFileSync(file);inputFiles.set(label,path.resolve(file));inputSha256[label]=createHash('sha256').update(bytes).digest('hex');return JSON.parse(bytes)};
 const siteRead=name=>{
  const file=path.resolve(root,name),relative=path.relative(root,file);
  if(relative.startsWith('..')||path.isAbsolute(relative))throw Error('Catalog metadata path escapes the assembled site');
  return read(file,name);
 };
 const adapters=['head-additions.mjs','head-companion-presets.mjs','a4t-printed-companions.mjs','rapido-x-uhf-cover.mjs','embedded-boards.mjs','configuration-model.js','head-assembly.js','machine-head-model.mjs',
  'trinity-alpha-installation.mjs','trinity-alpha-host-extensions.mjs','trinity-alpha-siboor-r2.mjs'];
 for(const name of adapters){const file=new URL('../site/viewer/'+name,import.meta.url);inputFiles.set('viewer/'+name,file);inputSha256['viewer/'+name]=createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
 inputFiles.set('audit_adapter',new URL(import.meta.url));inputSha256.audit_adapter=createHash('sha256').update(fs.readFileSync(new URL(import.meta.url))).digest('hex');
 const raw=siteRead('TOOLHEAD_CONFIGURATIONS.json'),additions=flags.has('--additions')?read(flags.get('--additions'),'HEAD_ADDITIONS.json'):siteRead('HEAD_ADDITIONS.json');
 const assetMetadata={},boards=[];
 for(const [id,identify]of [['xol',xolEmbeddedBoard],['stealthburner',sbEmbeddedBoard]]){
  const spec=raw.base_assets?.[id];if(!spec)continue;
  const meta=siteRead(spec.meta);assetMetadata[id]=meta;boards.push(identify(meta));
 }
 const catalog=composeHeadCoverageCatalog(raw,additions,{embeddedBoards:boards});
 // CLI fallback enumerates only this exact registry's production compositions.
 // Parent orchestration can supply expanded/Monolith/board-derived catalogs in
 // --evidence instead; counts always retain the supplied registration scope.
 let machineCatalogs=[],registrationScope='No machine registrations supplied.';
 if(fs.existsSync(path.join(root,'MACHINE_HEAD_REGISTRATIONS.json'))){
  const {machineHeadVariants}=await import('../site/viewer/machine-head-model.mjs');
  const registry=siteRead('MACHINE_HEAD_REGISTRATIONS.json');
  machineCatalogs=Object.entries(registry.machines).map(([machine,binding])=>({machine,
   variants:(binding.gantries?Object.keys(binding.gantries):[undefined]).flatMap(g=>machineHeadVariants(catalog,registry,machine,g))}));
  registrationScope='MACHINE_HEAD_REGISTRATIONS.json via machineHeadVariants only; expanded stock, Monolith and supplemental hosts require supplied production evidence.';
 }
 const evidence=flags.has('--evidence')?read(flags.get('--evidence'),'coverage_evidence'):{};
 if(evidence.schema!==undefined&&evidence.schema!=='3d-print-rig-head-coverage-evidence-v1')throw Error('Invalid coverage evidence schema');
 for(const [name,pin]of Object.entries(evidence.inputSha256||{}))if(inputSha256[name]!==undefined&&inputSha256[name]!==pin)throw Error('Production evidence input differs from the current CLI input: '+name);
 const inputs={...evidence.inputSha256,...inputSha256};
 const installedRecipeSources=evidence.installedRecipeSources??{};
 if(evidence.installedRecipeSources===undefined&&(evidence.machineCatalogs??machineCatalogs).some(c=>c.variants.some(v=>v.native_alpha_92))){
  for(const source of installedRecipeSourceSpecs){
   const file=path.join(root,source.file);if(!fs.existsSync(file))continue;
   siteRead(source.file);inputs[source.file]=inputSha256[source.file];
   installedRecipeSources[source.file]={raw_json:fs.readFileSync(file,'utf8'),sha256:inputs[source.file]};
  }
 }
 const sourceMatrix=flags.has('--source-matrix')?read(flags.get('--source-matrix'),'source_matrix'):evidence.sourceMatrix??null;
 const report=auditHeadCombinationCoverage(catalog,{...evidence,sourceMatrix,inputSha256:{...inputs,...inputSha256},installedRecipeSources,
  machineCatalogs:evidence.machineCatalogs??machineCatalogs,assetMetadata:{...assetMetadata,...evidence.assetMetadata}});
 report.scope.registration_inputs=evidence.machineCatalogs?'Supplied production-composed machine catalogs.':registrationScope;
 for(const [label,file]of inputFiles)if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==inputSha256[label])
  throw Error('Coverage input changed during the audit: '+label);
 if(flags.has('--output')){
  const output=path.resolve(flags.get('--output'));fs.mkdirSync(path.dirname(output),{recursive:true});
  fs.writeFileSync(output,JSON.stringify(report,null,2)+'\n');
  fs.writeFileSync(output.replace(/\.json$/i,'')+'.md',renderHeadCoverageMarkdown(report));
 }
 console.log(JSON.stringify({schema:report.schema,status:report.status,...report.summary}));
 process.exitCode=coverageExitCode(report,{strictOpen});
}

if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url){
 main(process.argv.slice(2)).catch(error=>{console.error('Head coverage audit failed: '+error.message);process.exitCode=1});
}
