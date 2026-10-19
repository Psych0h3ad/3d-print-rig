// Completion is separate from catalog coverage. Exact source requirements,
// current exported leaves, native interfaces, runtime and browser evidence are
// required independently. Missing or stale evidence fails closed.
import fs from 'node:fs';
import path from 'node:path';
import {createHash} from 'node:crypto';
import {pathToFileURL} from 'node:url';
import {companionRoles,isPublicSourceURL} from './audit_head_combination_coverage.mjs';

const object=v=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const hash=v=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
const nonempty=v=>typeof v==='string'&&v.trim().length>0;
const canonical=v=>Array.isArray(v)?v.map(canonical):object(v)?Object.fromEntries(Object.keys(v).sort().map(k=>[k,canonical(v[k])])):v;
export const headCompletionHash=v=>createHash('sha256').update(JSON.stringify(canonical(v))).digest('hex');
const equal=(a,b)=>headCompletionHash(a)===headCompletionHash(b);
const hardware=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners']);
export const headCompletionChecks=Object.freeze(['exported_parts','native_mating','native_clearance','motion','switching','materials','browser']);
export const headCompletionConsumerKey=c=>JSON.stringify([c.kind,c.machine??null,c.configuration??null]);
const standalone=id=>({kind:'standalone',configuration:id});
const consumersFor=row=>[standalone(row.id),
 ...(row.machine_registrations||[]).map(r=>({kind:'installed',machine:r.machine,configuration:r.configuration,recipe_sha256:r.recipe_review?.installed_plan_sha256,retained_assets:r.recipe_review?.retained_assets})),
 ...(row.source_hosts||[]).map(r=>({kind:'source_host',machine:r.machine,configuration:row.id,model_sha256:r.modelSha256,manifest_sha256:r.manifestSha256}))];

// Actual assets contain hashes computed from independently read model/metadata
// bytes, and metadata parsed from those bytes. They are not catalog declarations.
export function auditHeadCompletion(coverage,{scope,requirements,evidence,actualAssets={}}={}){
 const findings=[],add=(code,context={},detail)=>findings.push({code,...context,...(detail?{detail}:{})});
 if(coverage?.schema!=='3d-print-rig-head-combination-coverage-v1'||!Array.isArray(coverage.configurations))throw Error('Current production head coverage is required');
 if(scope?.schema!=='3d-print-rig-head-completion-scope-v1'||!Array.isArray(scope.configurations)||!scope.configurations.length)throw Error('A nonempty retained configuration scope is required');
 if(requirements?.schema!=='3d-print-rig-head-companion-requirements-v1'||!Array.isArray(requirements.configurations))throw Error('Source companion requirements are required');
 if(evidence?.schema!=='3d-print-rig-head-completion-evidence-v1'||!Array.isArray(evidence.receipts))throw Error('Independent completion evidence is required');
 const rows=new Map(),required=new Map(),sources=new Map(),receipts=new Map(),checksByConsumer=new Map();
 if(coverage.findings?.some(f=>f.severity==='failure'))add('PRODUCTION_COVERAGE_FAILURE');
 for(const row of coverage.configurations){if(!nonempty(row.id)||rows.has(row.id))add('DUPLICATE_CONFIGURATION',{configuration:row.id});else rows.set(row.id,row);}
 for(const item of requirements.sources||[]){
  if(!nonempty(item.id)||sources.has(item.id)||!isPublicSourceURL(item.url)||!hash(item.sha256)||!nonempty(item.revision)||!nonempty(item.license))add('INVALID_PUBLIC_SOURCE',{source:item.id});
  else sources.set(item.id,item);
 }
 for(const item of requirements.configurations){if(!nonempty(item.id)||required.has(item.id))add('DUPLICATE_REQUIREMENT',{configuration:item.id});else required.set(item.id,item);}
 for(const receipt of evidence.receipts){
  if(!nonempty(receipt.id)||receipts.has(receipt.id)){add('DUPLICATE_RECEIPT',{receipt:receipt.id});continue;}
  receipts.set(receipt.id,receipt);
  for(const binding of receipt.bindings||[]){
   if(!object(binding.consumer)){add('INVALID_CHECK_BINDING',{receipt:receipt.id});continue;}
   const key=JSON.stringify([binding.configuration,headCompletionConsumerKey(binding.consumer),receipt.check]);
   if(!checksByConsumer.has(key))checksByConsumer.set(key,[]);checksByConsumer.get(key).push({receipt,binding});
  }
 }
 const scopeIds=new Set();
 for(const item of scope.configurations){
  if(!nonempty(item.id)||scopeIds.has(item.id)){add('INVALID_RETAINED_SCOPE',{configuration:item.id});continue;}
  scopeIds.add(item.id);const row=rows.get(item.id);
  if(!row)add('RETAINED_CONFIGURATION_REMOVED',{configuration:item.id});
  else if(!equal(item.selection,row.selection))add('RETAINED_SELECTION_CHANGED',{configuration:item.id});
 }
 // New IDs are also required. A retained snapshot cannot hide newly added rows.
 const result=[];
 for(const row of rows.values()){
  const begin=findings.length,ctx={configuration:row.id},req=required.get(row.id);
  if(!hash(row.recipe_sha256))add('RECIPE_PIN_MISSING',ctx);
  if(!req){add('SOURCE_REQUIREMENTS_MISSING',ctx);result.push({id:row.id,complete:false,consumers:consumersFor(row).length});continue;}
  if(!equal(req.selection,row.selection)||req.recipe_sha256!==row.recipe_sha256)add('SOURCE_RECIPE_CHANGED',ctx);
  const inspectRequirements=(definitions,retainedAssets,ctx)=>{
  const refs=new Map((retainedAssets||[]).map(a=>[a.id,a]));
  const roles=new Map(),leaves=[];
  for(const disposition of definitions||[]){
   if(!companionRoles.includes(disposition.role)||roles.has(disposition.role)){add('INVALID_COMPANION_ROLE',{...ctx,role:disposition.role});continue;}
   roles.set(disposition.role,disposition);
   if(!Array.isArray(disposition.sources)||!disposition.sources.length||disposition.sources.some(id=>!sources.has(id)))add('COMPANION_SOURCE_MISSING',{...ctx,role:disposition.role});
   if(disposition.state==='not_required'){
    if(!nonempty(disposition.reason)||['hotend','nozzle','extruder','fasteners','carriage'].includes(disposition.role))add('INVALID_COMPANION_EXEMPTION',{...ctx,role:disposition.role});
    continue;
   }
   if(disposition.state!=='required'||!Array.isArray(disposition.leaves)||!disposition.leaves.length){add('COMPANION_UNRESOLVED',{...ctx,role:disposition.role});continue;}
   const seen=new Set();
   for(const leaf of disposition.leaves){
    const key=JSON.stringify([leaf.asset,String(leaf.key)]),asset=actualAssets[leaf.asset],ref=refs.get(leaf.asset);
    if(seen.has(key)||!nonempty(leaf.source_identity)){add('INVALID_COMPANION_IDENTITY',{...ctx,role:disposition.role,asset:leaf.asset,part:leaf.key});continue;}
    seen.add(key);leaves.push({role:disposition.role,asset:leaf.asset,key:String(leaf.key),source_identity:leaf.source_identity});
    if(!ref){add('COMPANION_ASSET_NOT_RETAINED',{...ctx,role:disposition.role,asset:leaf.asset});continue;}
    if(!asset||!hash(asset.model_sha256)||!hash(asset.metadata_sha256)||!Array.isArray(asset.metadata?.parts)){add('ACTUAL_ASSET_MISSING',{...ctx,asset:leaf.asset});continue;}
    if(asset.spec_sha256!==ref.spec_sha256||headCompletionHash(asset.metadata)!==ref.metadata_semantic_sha256)add('ACTUAL_ASSET_BINDING_CHANGED',{...ctx,asset:leaf.asset});
    if(ref.declared_model_sha256&&ref.declared_model_sha256!==asset.model_sha256)add('ACTUAL_MODEL_CHANGED',{...ctx,asset:leaf.asset});
    const matches=asset.metadata.parts.filter(p=>String(p.key)===String(leaf.key));
    if(matches.length!==1)add('COMPANION_LEAF_MISSING_OR_DUPLICATED',{...ctx,role:disposition.role,asset:leaf.asset,part:leaf.key});
    else if((ref.hidden_keys||[]).map(String).includes(String(leaf.key)))add('COMPANION_HIDDEN',{...ctx,role:disposition.role,asset:leaf.asset,part:leaf.key});
    else{
     if(matches[0].source_identity!==leaf.source_identity&&!matches[0].source_identities?.includes(leaf.source_identity))add('COMPANION_SOURCE_IDENTITY_CHANGED',{...ctx,role:disposition.role,asset:leaf.asset,part:leaf.key});
     if(hardware.has(disposition.role)&&(matches[0].material==='printed'||matches[0].component==='printed'||['base','accent','frame','cnc'].includes(matches[0].appearance_role)))add('PURCHASED_COMPANION_PALETTE_MUTABLE',{...ctx,role:disposition.role,asset:leaf.asset,part:leaf.key});
    }
   }
  }
  for(const role of companionRoles)if(!roles.has(role))add('COMPANION_REQUIREMENT_UNKNOWN',{...ctx,role});
  for(const asset of refs.keys()){
   const actual=actualAssets[asset];if(!actual||!hash(actual.model_sha256)||!hash(actual.metadata_sha256))add('ACTUAL_ASSET_MISSING',{...ctx,asset});
  }
  for(const forbidden of req.forbidden_leaves||[]){
   const ref=refs.get(forbidden.asset),part=actualAssets[forbidden.asset]?.metadata?.parts?.some(p=>String(p.key)===String(forbidden.key));
   if(ref&&part&&!(ref.hidden_keys||[]).map(String).includes(String(forbidden.key)))add('OBSOLETE_COMPANION_VISIBLE',{...ctx,asset:forbidden.asset,part:forbidden.key});
  }
  const expectedAssets=Object.fromEntries([...refs.keys()].sort().map(id=>[id,{model_sha256:actualAssets[id]?.model_sha256??null,metadata_sha256:actualAssets[id]?.metadata_sha256??null}]));
  const expectedLeaves=headCompletionHash(leaves.sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
  return {expectedAssets,expectedLeaves};
  };
  const standaloneParts=inspectRequirements(req.companions,row.retained_assets,ctx);
  const consumers=consumersFor(row),requiredConsumers=new Set(consumers.map(headCompletionConsumerKey));
  if(!row.machine_registrations?.length&&!row.source_hosts?.length)add('INSTALLED_CONSUMER_MISSING',ctx);
  for(const target of req.additional_consumers||[])if(!requiredConsumers.has(headCompletionConsumerKey(target)))add('SOURCE_HOST_OR_INSTALLATION_UNREGISTERED',{...ctx,consumer:target});
  for(const consumer of consumers){
   const ck=headCompletionConsumerKey(consumer),consumerContext={...ctx,consumer};
   let parts=standaloneParts;
   if(consumer.kind==='installed'){
    if(!Array.isArray(consumer.retained_assets)||!consumer.retained_assets.length)add('INSTALLED_ASSET_PLAN_MISSING',consumerContext);
    else{
     const override=(req.consumer_requirements||[]).filter(r=>headCompletionConsumerKey(r.consumer)===ck);
     if(override.length>1)add('AMBIGUOUS_CONSUMER_REQUIREMENTS',consumerContext);
     const changes=new Map((override[0]?.companions||[]).map(r=>[r.role,r]));
     parts=inspectRequirements((req.companions||[]).map(r=>changes.get(r.role)||r),consumer.retained_assets,consumerContext);
    }
   }
   for(const check of headCompletionChecks){
    const candidates=checksByConsumer.get(JSON.stringify([row.id,ck,check]))||[];
    if(candidates.length!==1){add(candidates.length?'AMBIGUOUS_CHECK_EVIDENCE':'CHECK_EVIDENCE_MISSING',{...consumerContext,check});continue;}
    const {receipt,binding}=candidates[0];
    if(receipt.state!=='pass'||!Array.isArray(receipt.findings)||receipt.findings.length||!hash(receipt.report_sha256)||receipt.report_verified!==true)add('CHECK_NOT_PASSED',{...consumerContext,check,receipt:receipt.id});
    if(binding.recipe_sha256!==row.recipe_sha256||!equal(binding.assets,parts.expectedAssets)||binding.companion_leaves_sha256!==parts.expectedLeaves||
      consumer.recipe_sha256&&binding.consumer.recipe_sha256!==consumer.recipe_sha256||consumer.model_sha256&&binding.consumer.model_sha256!==consumer.model_sha256||consumer.manifest_sha256&&binding.consumer.manifest_sha256!==consumer.manifest_sha256)add('CHECK_BINDING_STALE',{...consumerContext,check,receipt:receipt.id});
    const pins=receipt.input_sha256;
    if(receipt.coverage_inputs_sha256!==headCompletionHash(coverage.input_sha256||{})||!object(pins)||Object.keys(pins).length<2||Object.entries(pins).some(([key,value])=>!hash(value)||coverage.input_sha256?.[key]!==value))add('CHECK_INPUT_CHANGED',{...consumerContext,check,receipt:receipt.id});
    if(check==='native_mating'||check==='native_clearance'){
     if(!['native_solids','native_faces'].includes(receipt.method)||!Array.isArray(receipt.source_ids)||!receipt.source_ids.length||receipt.source_ids.some(id=>!sources.has(id))||!Array.isArray(receipt.interface_ids)||!receipt.interface_ids.length||receipt.threaded_engagement_separated!==true)add('NATIVE_EVIDENCE_INCOMPLETE',{...consumerContext,check,receipt:receipt.id});
    }
    if(check==='native_clearance'&&receipt.adaptive_native_sweep!==true)add('NATIVE_SWEEP_MISSING',{...consumerContext,check,receipt:receipt.id});
    if(check==='motion'&&(receipt.adaptive_transitions!==true||receipt.axes_min_max_intermediate_reverse!==true||receipt.native_reset!==true||receipt.flexible_routes_attached!==true))add('MOTION_EVIDENCE_INCOMPLETE',{...consumerContext,check,receipt:receipt.id});
    if(check==='switching'&&(receipt.a_b_a!==true||receipt.native_reset!==true||receipt.save_load!==true))add('SWITCHING_EVIDENCE_INCOMPLETE',{...consumerContext,check,receipt:receipt.id});
    if(check==='materials'&&(receipt.contrasting_palettes!==true||receipt.reversed_changes!==true||receipt.purchased_materials_preserved!==true||receipt.native_reset!==true))add('MATERIAL_EVIDENCE_INCOMPLETE',{...consumerContext,check,receipt:receipt.id});
    if(check==='browser'&&(!nonempty(receipt.browser)||!['front','side','rear','underside'].every(view=>receipt.views?.includes(view))||!Array.isArray(receipt.screenshots)||!receipt.screenshots.length||receipt.screenshots.some(s=>!hash(s.sha256)||s.verified!==true)))add('BROWSER_EVIDENCE_INCOMPLETE',{...consumerContext,check,receipt:receipt.id});
   }
  }
  result.push({id:row.id,complete:findings.length===begin,consumers:consumers.length});
 }
 return {schema:'3d-print-rig-head-completion-report-v1',passed:findings.length===0,
  scope:{catalog_selection_is_fit:false,source_requirements:companionRoles,checks:headCompletionChecks,retained_ids:scopeIds.size,new_ids_also_required:true},
  input_sha256:{coverage:headCompletionHash(coverage),scope:headCompletionHash(scope),requirements:headCompletionHash(requirements),evidence:headCompletionHash(evidence)},
  summary:{configurations:rows.size,complete:result.filter(r=>r.complete).length,consumers:result.reduce((n,r)=>n+r.consumers,0),findings:findings.length},configurations:result,findings};
}

async function main(argv){
 const flags=new Map();for(let i=0;i<argv.length;i++){if(!['--coverage','--scope','--requirements','--evidence','--assets','--output'].includes(argv[i])||!argv[i+1]||argv[i+1].startsWith('--')||flags.has(argv[i]))throw Error('Usage: --coverage <json> --scope <json> --requirements <json> --evidence <json> --assets <json> --output <json>');flags.set(argv[i],path.resolve(argv[++i]));}
 for(const key of ['--coverage','--scope','--requirements','--evidence','--assets','--output'])if(!flags.has(key))throw Error('Missing '+key);
 const inputFiles=new Map(),read=file=>{const bytes=fs.readFileSync(file);inputFiles.set(file,createHash('sha256').update(bytes).digest('hex'));return JSON.parse(bytes);};
 const coverage=read(flags.get('--coverage')),scope=read(flags.get('--scope')),requirements=read(flags.get('--requirements')),evidence=read(flags.get('--evidence')),assetFiles=read(flags.get('--assets')),actualAssets={};
 if(assetFiles.schema!=='3d-print-rig-head-actual-assets-v1'||!object(assetFiles.assets))throw Error('Exact actual asset locations are required');
 for(const[id,asset]of Object.entries(assetFiles.assets)){
  const metaFile=path.resolve(path.dirname(flags.get('--assets')),asset.metadata.path),modelFile=path.resolve(path.dirname(flags.get('--assets')),asset.model.path),metadata=read(metaFile),bytes=fs.readFileSync(modelFile),modelHash=createHash('sha256').update(bytes).digest('hex');
  inputFiles.set(modelFile,modelHash);
  if(modelHash!==asset.model.sha256||inputFiles.get(metaFile)!==asset.metadata.sha256)throw Error('Actual asset bytes changed: '+id);
  actualAssets[id]={model_sha256:modelHash,metadata_sha256:inputFiles.get(metaFile),spec_sha256:asset.spec_sha256,metadata};
 }
 for(const receipt of evidence.receipts){
  receipt.report_verified=false;if(!receipt.report_file)continue;
  const file=path.resolve(path.dirname(flags.get('--evidence')),receipt.report_file),bytes=fs.readFileSync(file),digest=createHash('sha256').update(bytes).digest('hex'),result=JSON.parse(bytes);inputFiles.set(file,digest);
  receipt.report_verified=digest===receipt.report_sha256&&result.passed===true&&Array.isArray(result.findings)&&!result.findings.length;
  for(const shot of receipt.screenshots||[]){shot.verified=false;if(!shot.path)continue;const location=path.resolve(path.dirname(flags.get('--evidence')),shot.path),pixels=fs.readFileSync(location),actual=createHash('sha256').update(pixels).digest('hex');inputFiles.set(location,actual);shot.verified=actual===shot.sha256;}
 }
 const report=auditHeadCompletion(coverage,{scope,requirements,evidence,actualAssets});
 for(const[file,digest]of inputFiles)if(createHash('sha256').update(fs.readFileSync(file)).digest('hex')!==digest)throw Error('Completion input changed during inspection: '+file);
 fs.mkdirSync(path.dirname(flags.get('--output')),{recursive:true});fs.writeFileSync(flags.get('--output'),JSON.stringify(report,null,2)+'\n');
 console.log(JSON.stringify({passed:report.passed,...report.summary}));process.exitCode=report.passed?0:1;
}
if(process.argv[1]&&pathToFileURL(path.resolve(process.argv[1])).href===import.meta.url)main(process.argv.slice(2)).catch(error=>{console.error(error.message);process.exitCode=1});
