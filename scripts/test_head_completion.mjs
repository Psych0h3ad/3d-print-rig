// Synthetic evidence fixtures exercise rejection rules; they are not mechanical
// review receipts and must never enter a release's actual-model evidence.
import assert from 'node:assert/strict';
import {auditHeadCompletion,headCompletionHash,headCompletionChecks} from './audit_head_completion.mjs';
import {companionRoles} from './audit_head_combination_coverage.mjs';

const H=n=>n.repeat(64),nativeHardware=new Set(['hotend','nozzle','extruder','hotend_fan','part_fan','fasteners']);
function fixture(){
 const selection={toolhead:'fixture',extruder:'fixture-extruder',hotend:'fixture-hotend',cooling:'fixture-cooling',board:'none',carriage:'fixture-carriage',gantry:'fixture-gantry',mount:'fixed',probe:'none'};
 const parts=companionRoles.map(role=>({key:role,source_identity:'fixture-source/'+role,component:role,material:nativeHardware.has(role)?'purchased':'printed',appearance_role:nativeHardware.has(role)?undefined:'base'}));
 const metadata={parts},asset={model_sha256:H('1'),metadata_sha256:H('2'),spec_sha256:H('3'),metadata};
 const row={id:'fixture-id',recipe_sha256:H('4'),selection,retained_assets:[{id:'fixture-asset',spec_sha256:asset.spec_sha256,metadata_semantic_sha256:headCompletionHash(metadata),declared_model_sha256:asset.model_sha256,hidden_keys:[]}],machine_registrations:[{machine:'fixture-machine',configuration:'installed-fixture',recipe_review:{installed_plan_sha256:H('5')}}],source_hosts:[]};
 row.machine_registrations[0].recipe_review.retained_assets=row.retained_assets;
 const coverage={schema:'3d-print-rig-head-combination-coverage-v1',input_sha256:{catalog:H('6'),adapter:H('7')},configurations:[row]};
 const scope={schema:'3d-print-rig-head-completion-scope-v1',configurations:[{id:row.id,selection}]};
 const companions=companionRoles.map(role=>({role,state:'required',sources:['fixture-source'],leaves:[{asset:'fixture-asset',key:role,source_identity:'fixture-source/'+role}]}));
 const requirements={schema:'3d-print-rig-head-companion-requirements-v1',sources:[{id:'fixture-source',url:'https://example.org/public/immutable-cad.step',sha256:H('8'),revision:'fixture-revision',license:'fixture-only'}],configurations:[{id:row.id,selection,recipe_sha256:row.recipe_sha256,companions}]};
 const leaves=companions.flatMap(c=>c.leaves.map(p=>({role:c.role,asset:p.asset,key:p.key,source_identity:p.source_identity}))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b)));
 const assets={'fixture-asset':{model_sha256:asset.model_sha256,metadata_sha256:asset.metadata_sha256}};
 const consumers=[{kind:'standalone',configuration:row.id},{kind:'installed',machine:'fixture-machine',configuration:'installed-fixture',recipe_sha256:H('5')}];
 const receipts=headCompletionChecks.map(check=>({id:check,check,state:'pass',findings:[],report_sha256:H('9'),report_verified:true,input_sha256:coverage.input_sha256,coverage_inputs_sha256:headCompletionHash(coverage.input_sha256),method:'native_solids',source_ids:['fixture-source'],interface_ids:['fixture-seat'],threaded_engagement_separated:true,adaptive_native_sweep:true,adaptive_transitions:true,axes_min_max_intermediate_reverse:true,native_reset:true,flexible_routes_attached:true,a_b_a:true,save_load:true,contrasting_palettes:true,reversed_changes:true,purchased_materials_preserved:true,browser:'Synthetic fixture',views:['front','side','rear','underside'],screenshots:[{sha256:H('a'),verified:true}],bindings:consumers.map(consumer=>({configuration:row.id,consumer,recipe_sha256:row.recipe_sha256,assets,companion_leaves_sha256:headCompletionHash(leaves)}))}));
 return {coverage,scope,requirements,evidence:{schema:'3d-print-rig-head-completion-evidence-v1',receipts},actualAssets:{'fixture-asset':asset}};
}
function run(f){return auditHeadCompletion(f.coverage,f);}
let cases=0;
const good=run(fixture());assert.equal(good.passed,true);assert.equal(good.summary.complete,1);assert.equal(good.summary.consumers,2);cases++;
function reject(code,mutate){const f=fixture();mutate(f);const r=run(f);assert.equal(r.passed,false);assert(r.findings.some(p=>p.code===code),code+': '+JSON.stringify(r.findings));cases++;}
reject('RETAINED_CONFIGURATION_REMOVED',f=>f.coverage.configurations=[]);
reject('RETAINED_SELECTION_CHANGED',f=>f.scope.configurations[0].selection={...f.scope.configurations[0].selection,board:'different'});
reject('SOURCE_REQUIREMENTS_MISSING',f=>f.requirements.configurations=[]);
reject('SOURCE_REQUIREMENTS_MISSING',f=>f.coverage.configurations.push({...f.coverage.configurations[0],id:'new-id'}));
reject('SOURCE_RECIPE_CHANGED',f=>f.requirements.configurations[0].recipe_sha256=H('b'));
reject('INVALID_PUBLIC_SOURCE',f=>f.requirements.sources[0].url='https://localhost/model.step');
reject('COMPANION_SOURCE_MISSING',f=>f.requirements.configurations[0].companions[0].sources=['unregistered-source']);
reject('COMPANION_REQUIREMENT_UNKNOWN',f=>f.requirements.configurations[0].companions.pop());
reject('COMPANION_UNRESOLVED',f=>f.requirements.configurations[0].companions[0].state='unknown');
reject('INVALID_COMPANION_EXEMPTION',f=>f.requirements.configurations[0].companions.find(p=>p.role==='nozzle').state='not_required');
reject('COMPANION_ASSET_NOT_RETAINED',f=>f.requirements.configurations[0].companions[0].leaves[0].asset='missing-asset');
reject('COMPANION_HIDDEN',f=>f.coverage.configurations[0].retained_assets[0].hidden_keys=['hotend_fan']);
reject('COMPANION_LEAF_MISSING_OR_DUPLICATED',f=>f.actualAssets['fixture-asset'].metadata.parts=f.actualAssets['fixture-asset'].metadata.parts.filter(p=>p.key!=='nozzle'));
reject('COMPANION_SOURCE_IDENTITY_CHANGED',f=>f.requirements.configurations[0].companions[0].leaves[0].source_identity='some-other-public-part');
reject('PURCHASED_COMPANION_PALETTE_MUTABLE',f=>f.actualAssets['fixture-asset'].metadata.parts.find(p=>p.key==='part_fan').appearance_role='accent');
reject('ACTUAL_MODEL_CHANGED',f=>f.actualAssets['fixture-asset'].model_sha256=H('b'));
reject('ACTUAL_ASSET_MISSING',f=>delete f.actualAssets['fixture-asset']);
reject('OBSOLETE_COMPANION_VISIBLE',f=>f.requirements.configurations[0].forbidden_leaves=[{asset:'fixture-asset',key:'cover'}]);
reject('CHECK_EVIDENCE_MISSING',f=>f.evidence.receipts.find(p=>p.check==='native_mating').bindings.pop());
reject('CHECK_BINDING_STALE',f=>f.evidence.receipts.find(p=>p.check==='native_mating').bindings[1].consumer.recipe_sha256=H('c'));
reject('INSTALLED_ASSET_PLAN_MISSING',f=>delete f.coverage.configurations[0].machine_registrations[0].recipe_review.retained_assets);
reject('COMPANION_HIDDEN',f=>f.coverage.configurations[0].machine_registrations[0].recipe_review.retained_assets=[{...f.coverage.configurations[0].retained_assets[0],hidden_keys:['part_fan']}]);
reject('CHECK_INPUT_CHANGED',f=>f.coverage.input_sha256.adapter=H('c'));
reject('NATIVE_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='native_mating').method='bounding_boxes');
reject('NATIVE_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='native_mating').threaded_engagement_separated=false);
reject('NATIVE_SWEEP_MISSING',f=>f.evidence.receipts.find(p=>p.check==='native_clearance').adaptive_native_sweep=false);
reject('MOTION_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='motion').flexible_routes_attached=false);
reject('SWITCHING_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='switching').save_load=false);
reject('MATERIAL_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='materials').purchased_materials_preserved=false);
reject('BROWSER_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='browser').views.pop());
reject('BROWSER_EVIDENCE_INCOMPLETE',f=>f.evidence.receipts.find(p=>p.check==='browser').screenshots[0].verified=false);
reject('CHECK_NOT_PASSED',f=>f.evidence.receipts[0].report_verified=false);
reject('CHECK_NOT_PASSED',f=>f.evidence.receipts[0].findings=['known body interference']);
reject('AMBIGUOUS_CHECK_EVIDENCE',f=>f.evidence.receipts.push({...f.evidence.receipts[0],id:'second-parts-receipt'}));
reject('INSTALLED_CONSUMER_MISSING',f=>f.coverage.configurations[0].machine_registrations=[]);
reject('SOURCE_HOST_OR_INSTALLATION_UNREGISTERED',f=>f.requirements.configurations[0].additional_consumers=[{kind:'installed',machine:'another-machine',configuration:'missing-installation'}]);
const split=fixture(),fasteners=split.requirements.configurations[0].companions.find(c=>c.role==='fasteners');
fasteners.leaves.push({asset:'second-asset',key:'source-screw',source_identity:'fixture-source/second-screw'});
split.actualAssets['second-asset']={model_sha256:H('b'),metadata_sha256:H('c'),spec_sha256:H('d'),metadata:{parts:[{key:'source-screw',material:'purchased',source_identity:'fixture-source/second-screw'}]}};
split.coverage.configurations[0].retained_assets.push({id:'second-asset',spec_sha256:H('d'),metadata_semantic_sha256:headCompletionHash(split.actualAssets['second-asset'].metadata),hidden_keys:[]});
const leafHash=headCompletionHash(split.requirements.configurations[0].companions.flatMap(c=>c.leaves.map(p=>({role:c.role,asset:p.asset,key:p.key,source_identity:p.source_identity}))).sort((a,b)=>JSON.stringify(a).localeCompare(JSON.stringify(b))));
for(const receipt of split.evidence.receipts)for(const binding of receipt.bindings){binding.companion_leaves_sha256=leafHash;binding.assets['second-asset']={model_sha256:H('b'),metadata_sha256:H('c')};}
assert.equal(run(split).passed,true,'A role may span multiple exact public-source assets.');cases++;
console.log(JSON.stringify({passed:true,cases,scope:'Synthetic completion-gate rejection regressions; no model or fit certification.'}));
