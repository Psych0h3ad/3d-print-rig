import fs from 'node:fs';
import {setupAccessories} from '../site/viewer/accessories.js';
import {setupChangerBank} from '../site/viewer/changer-bank.js';
import assert from 'node:assert/strict';
import {configurationById,resolveVariant,choicesFor,headBuilderDimensions} from '../site/viewer/configuration-model.js';
import {setupConfigurations as setupConfigurationsWithUI} from '../site/viewer/configurations.js';
const setupConfigurations=(catalog,install,options={})=>setupConfigurationsWithUI(catalog,install,{...options,createEditor:()=>({update(){}})});
import {monolithCompanion} from '../site/viewer/monolith-head-model.mjs';
import {xolEmbeddedBoard,withEmbeddedBoards} from '../site/viewer/embedded-boards.mjs';
const embedded=xolEmbeddedBoard({parts:[{key:'pcb',source:{path:['assembly','SHT-36v2 <1>:1','PCB']}},{key:'motor',source:{path:['drive']}}]});
assert.deepEqual(embedded.keys,['pcb']);
const raw={variants:[{id:'xol',toolhead:'xol',board:'none',hidden_xol_keys:['old'],notes:[]}],boards:[{id:'none'}]};
const corrected=withEmbeddedBoards(raw,embedded);assert.equal(corrected.variants.length,2);assert.equal(corrected.variants[0].board,'sht36_stock');assert.deepEqual(corrected.variants[1].hidden_xol_keys,['old','pcb']);assert.equal(corrected.variants[1].board,'none');assert.equal(withEmbeddedBoards(corrected,embedded).variants.length,2);assert.equal(raw.variants.length,1);
const base={id:'stock',toolhead:'sb',probe:'none',notes:[],fit:{},belt_width_mm:6,xy_motors:2};
const probe={...base,id:'probe',probe:'coil',fit:{probe:{height_passed:false}}};
const installed={...base,id:'installed__chube',source_head_configuration:'chube'};
const catalog={machine_id:'test',dimensions:['toolhead','probe'],toolheads:[{id:'sb',label:'SB'}],probes:[{id:'none',label:'none'},{id:'coil',label:'coil'}],variants:[base,probe,installed],sources:[]};
assert.equal(configurationById(catalog,'chube'),installed);assert.equal(configurationById(catalog,'stock'),base);assert.equal(configurationById(catalog,'unknown'),undefined);
assert.equal(resolveVariant(catalog,probe,'toolhead'),probe,'Re-selecting an unchanged head must not remove the selected probe');
const builder={dimensions:headBuilderDimensions,extruders:[{id:'archive'},{id:'orbiter'}],variants:[{toolhead:'db',mount:'archive',extruder:'archive'},{toolhead:'db',mount:'fixed',extruder:'orbiter'}]};
assert.deepEqual(choicesFor(builder,builder.variants[0],'extruder').map(v=>v.id),['archive','orbiter']);
const monolith={...base,mount:'stealthchanger',gantry:'sc_monolith_6'};
assert.equal(monolithCompanion({variants:[monolith]},probe),undefined,'Do not silently remove a probe on the Monolith link');
assert.equal(monolithCompanion({variants:[monolith]},base),monolith);
class Element{
 constructor(){this.children=[];this.dataset={};this.classList={add(){},toggle(){}};this.value='';this.nodes=new Map();this.beforeNodes=[]}
 replaceChildren(...c){this.children=c}append(...c){this.children.push(...c)}after(){}setAttribute(){}
 set innerHTML(html){for(const [,id]of html.matchAll(/\bid="([^"]+)"/g))this.nodes.set('#'+id,new Element())}
 querySelector(key){return this.nodes.get(key)||null}before(...n){this.beforeNodes.push(...n)}remove(){}click(){if(this.href)selectionDownloads.push(this.href)}
}
function dom(search=''){
 const nodes=new Map(['headProductLinks','toolheadConfig','probeConfig','configSummary','configRequirements','mountInfo','configStatus','loadConfiguration','saveConfiguration','configurationFile','modSources'].map(id=>['#'+id,new Element()]));
 globalThis.document={querySelector:s=>nodes.get(s),createElement:()=>new Element(),createTextNode:s=>s};
 globalThis.location={href:'https://example.test/viewer/'+search,search};globalThis.history={replaceState(){}};
 return nodes;
}
let nodes=dom('?configuration=chube'),calls=[];
let controller=await setupConfigurations(catalog,async v=>calls.push(v.id));
assert.equal(controller.current,installed);assert.equal(nodes.get('#configStatus').dataset.variant,installed.id);
nodes=dom('?configuration=missing');controller=await setupConfigurations(catalog,async()=>{});
assert.match(nodes.get('#configStatus').textContent,/指定された構成/);
nodes=dom();let fail=false;const savedError=console.error;console.error=()=>{};
controller=await setupConfigurations(catalog,async v=>{if(fail&&v===installed)throw Error('test failure')});
fail=true;await controller.selectVariant(installed.id);assert.equal(controller.current,base);assert.match(nodes.get('#configStatus').textContent,/直前の構成/);
nodes=dom();let broken=false;controller=await setupConfigurations(catalog,async()=>{if(broken)throw Error('test rollback failure')});
broken=true;await controller.selectVariant(installed.id);assert.equal(controller.current,null);assert.equal(nodes.get('#saveConfiguration').disabled,true);assert.equal(nodes.get('#configStatus').dataset.variant,undefined);assert.doesNotMatch(nodes.get('#configStatus').textContent,/直前の構成を表示中/);
console.error=savedError;
console.log('Selection regressions: source links, unchanged probe, component-first choices, Monolith probe retention, unknown URL and honest rollback status passed.');

// A workbench query selects a standalone gantry, not a machine registration.
nodes=dom('?gantry=monolith_v2_printed_9_awd_300');let shared;
globalThis.history={replaceState(_a,_b,url){shared=new URL(url)}};
controller=await setupConfigurations({...catalog,machine_id:'monolith_workbench'},async()=>{});
assert.doesNotMatch(nodes.get('#configStatus').textContent,/ガントリーはこの機体に未登録/);
assert.equal(shared.searchParams.get('gantry'),'monolith_v2_printed_9_awd_300');
nodes=dom('?gantry=missing');controller=await setupConfigurations(catalog,async()=>{});
assert.match(nodes.get('#configStatus').textContent,/ガントリーはこの機体に未登録/);
console.log('Standalone gantry links keep their query and do not falsely report missing machine registration.');

// A staged choice changes menus only. Apply installs once; discard/undo are
// explicit and failed installation leaves a retryable draft with honest state.
nodes=dom();calls=[];let rejectProbe=false;
controller=await setupConfigurations(catalog,async v=>{calls.push(v.id);if(rejectProbe&&v.id==='probe')throw Error('CAD unavailable')});
nodes.get('#probeConfig').value='coil';await nodes.get('#probeConfig').onchange();
assert.equal(controller.current,base);assert.equal(controller.draft.current,probe);
assert.equal(controller.draft.pending,true);assert.deepEqual(calls,['stock']);
controller.discardDraft();assert.equal(controller.draft.pending,false);assert.deepEqual(calls,['stock']);
nodes.get('#probeConfig').value='coil';await nodes.get('#probeConfig').onchange();
await controller.applyDraft();assert.equal(controller.current,probe);assert.equal(controller.draft.pending,false);assert.deepEqual(calls,['stock','probe']);
await controller.undo();assert.equal(controller.current,base);assert.deepEqual(calls,['stock','probe','stock']);
nodes.get('#probeConfig').value='coil';await nodes.get('#probeConfig').onchange();
rejectProbe=true;console.error=()=>{};
try{assert.equal(await controller.applyDraft(),false)}finally{console.error=savedError}
assert.equal(controller.current,base);assert.equal(controller.draft.current,probe);assert.equal(controller.draft.pending,true);
rejectProbe=false;assert.equal(await controller.applyDraft(),true);assert.equal(controller.current,probe);
let release;nodes=dom();controller=await setupConfigurations(catalog,async v=>{if(v===probe)await new Promise(resolve=>release=resolve)});
nodes.get('#probeConfig').value='coil';await nodes.get('#probeConfig').onchange();
const applying=controller.applyDraft();assert.equal(controller.busy,true);
assert.equal(await controller.applyDraft(),false);controller.discardDraft();assert.equal(controller.draft.pending,true);
release();await applying;assert.equal(controller.current,probe);assert.equal(controller.busy,false);
console.log('Draft workflow: no pre-apply install, discard, atomic apply, undo, failed-load retry and double-submit protection passed.');

nodes=dom();let initialFailure=true;console.error=()=>{};
try{controller=await setupConfigurations(catalog,async()=>{if(initialFailure)throw Error('initial failure')})}finally{console.error=savedError}
assert.equal(controller.current,null);assert.equal(controller.draft.pending,true);
initialFailure=false;assert.equal(await controller.applyDraft(),true);assert.equal(controller.current,base);

// Native references may omit optional notes; rendering must still commit.
const nativeReference={...base,id:'native-reference',fit:{complete_head_native:{state:'reference'}}};
nodes=dom('?configuration=native-reference');controller=await setupConfigurations({...catalog,variants:[base,nativeReference]},async()=>{});
assert.equal(controller.current,nativeReference);assert.equal(nodes.get('#configStatus').dataset.variant,nativeReference.id);


// Replay the real configuration/accessory/bank controllers. Roots below are
// source fixtures only; no CAD/model data, loader or WebGL is invoked.
const selectionDownloads=[],targetCases=[];
const registeredMods=JSON.parse(fs.readFileSync(new URL('../site/REQUESTED_MOD_INSTALLATIONS.json',import.meta.url),'utf8'));
const FOX='fox491404_v1_voron4010_reference_closed_v30',FOX_V2='trident_ab_stepper_fan_491404_v2';
const foxRow=registeredMods.machines.voron_trident_350.accessories.find(r=>r.id===FOX);assert(foxRow);
async function targetFixture({bankURL}={}){
 const nodes=dom(),body=new Element();document.body=body;document.documentElement={lang:'en'};globalThis.window=new EventTarget();
 nodes.set('#accessoryOptions',new Element());nodes.set('#accessoryStatus',new Element());nodes.set('#configurationControls',new Element());
 location.href='https://example.test/viewer/trident.html';location.search=bankURL?'?tools='+encodeURIComponent(JSON.stringify(bankURL)):'';location.href+=location.search;
 globalThis.history={replaceState(_s,_t,url){if(url){location.href=String(url);location.search=new URL(url).search}}};
 const good={...base,...foxRow.compatible_selection,mount:'fixed',carriage:'standard',board:'ebb2209_stock',cooling:'source'};
 const bad={...good,id:'installed__fixture_xol',toolhead:'xol',extruder:'sherpa_mini',hotend:'rapido2_uhf'};
 const indx={...bad,id:'installed__fixture_indx',toolhead:'indx',hotend:'passive',cooling:'4010',mount:'fixed',machine_head:{}};
 const rows=ids=>ids.map(id=>({id,label:id}));
 const c={machine_id:'voron_trident_350',dimensions:['toolhead','probe'],toolheads:rows(['stealthburner','xol','indx']),probes:rows(['none']),extruders:rows(['cw2','sherpa_mini']),hotends:rows(['revo_voron','rapido2_uhf','passive']),gantries:rows(['trident_r2']),variants:[good,bad,indx],sources:[],configuration_aliases:{archived_good:good.id,archived_bad:bad.id},accessories:structuredClone(registeredMods.machines.voron_trident_350.accessories.filter(r=>[FOX,FOX_V2].includes(r.id)))};
 const events=[],roots=new Map(c.accessories.map(r=>[r.module,{root:{visible:false,userData:{},position:{set(){}}}}]));let shown,failID,bank;
 const accessories=setupAccessories(c,{getVariant:()=>shown,load:async id=>{events.push({kind:'asset',id});return roots.get(id)},update(){},stockNodes:new Map()});
 const extraOptions={...accessories,validateExtras:data=>{events.push({kind:'validate',configuration:data.configuration});return accessories.validateExtras(data)}};
 if(bankURL){
  const data={profiles:[],machines:{[c.machine_id]:{capacity:4}},indx:{pitch_mm:41,tool_options:[{id:'passive'}],machines:{[c.machine_id]:{capacity:3,center_x_mm:0,translation_mm:[0,0,0]}}}};
  const rig={get active(){return shown},async install(v){shown=v;accessories.refresh()},async setBank(){events.push({kind:'setBank'})}};
  bank=setupChangerBank({catalog:c,rig,data,extras:extraOptions,before:nodes.get('#configurationControls')});
 }
 const ctrl=await setupConfigurations(c,async v=>{events.push({kind:'install',id:v.id});if(v.id===failID)throw Error('controlled install failure');if(bank)await bank.install(v);else{shown=v;accessories.refresh()}},bank?bank.options:extraOptions);
 const snapshot=()=>({current:ctrl.current?.id,shown:shown?.id,mods:accessories.getExtras(),visible:[...roots].map(([id,r])=>[id,r.root.visible]),installs:events.filter(e=>e.kind==='install').length,assets:events.filter(e=>e.kind==='asset').length});
 const importFile=async data=>{const text=JSON.stringify(data);const input=nodes.get('#configurationFile');input.files=[{size:Buffer.byteLength(text),text:async()=>text}];await input.onchange()};
 return {nodes,c,good,bad,indx,events,roots,accessories,ctrl,bank,snapshot,importFile,setFailure:id=>failID=id};
}
async function targetTest(id,fn){await fn();targetCases.push({id,status:'PASS'})}
const addFOX=async f=>f.accessories.applyExtras({accessories:[FOX]});
for(const key of ['id','configuration'])await targetTest('incompatible-'+key+'-alias-import-is-atomic',async()=>{
 const f=await targetFixture();await addFOX(f);const before=f.snapshot();await f.importFile({machine:f.c.machine_id,[key]:key==='id'?f.bad.id:'archived_bad',accessories:[FOX]});assert.deepEqual(f.snapshot(),before,'Rejected import installed/loaded before validating the resolved target');assert(f.nodes.get('#configStatus').textContent);assert.equal(f.ctrl.busy,false);
});
await targetTest('unknown-explicit-target-never-falls-back-current',async()=>{
 const f=await targetFixture();await addFOX(f);const before=f.snapshot();
 for(const data of [{id:'missing'},{configuration:'missing'},{configuration:'missing',id:f.good.id},{configuration:null},{id:'__proto__'}]){await f.importFile({...data,accessories:[FOX]});assert.deepEqual(f.snapshot(),before);assert.throws(()=>f.accessories.validateExtras({...data,accessories:[FOX]}));await assert.rejects(f.accessories.applyExtras({...data,accessories:[FOX]}));assert.deepEqual(f.snapshot(),before)}
 await assert.rejects(f.ctrl.selectVariant('missing',{accessories:[FOX]}));assert.deepEqual(f.snapshot(),before);
});
await targetTest('valid-canonical-save-load-and-legacy-alias-roundtrip',async()=>{
 const f=await targetFixture();await addFOX(f);f.nodes.get('#saveConfiguration').onclick();const saved=await(await fetch(selectionDownloads.at(-1))).json();assert.equal(saved.configuration,f.good.id);assert.deepEqual(saved.accessories,[FOX]);
 await f.accessories.applyExtras({accessories:[]});await f.importFile(saved);assert.deepEqual(f.accessories.getExtras(),{accessories:[FOX]});
 for(const data of [{id:'archived_good'},{configuration:'archived_good'},{id:f.good.id}]){const start=f.events.length;await f.importFile({...data,accessories:[FOX]});assert.equal(f.ctrl.current,f.good);assert.deepEqual(f.events.slice(start).filter(e=>e.kind==='validate').map(e=>e.configuration),[f.good.id]);assert.deepEqual(f.accessories.getExtras(),{accessories:[FOX]})}
});
await targetTest('forged-selection-and-exclusive-pair-rejected-before-install',async()=>{
 const f=await targetFixture();await addFOX(f);const before=f.snapshot();await f.importFile({configuration:f.bad.id,selection:f.good,accessories:[FOX]});assert.deepEqual(f.snapshot(),before);
 for(const accessories of [[FOX,FOX_V2],[FOX_V2,FOX]]){await f.importFile({configuration:f.good.id,accessories});assert.deepEqual(f.snapshot(),before)}
});
await targetTest('API-alias-prevalidation-and-A-B-A-final-visibility',async()=>{
 const f=await targetFixture();await addFOX(f);const before=f.snapshot();await assert.rejects(f.ctrl.selectVariant('archived_bad',{accessories:[FOX]}));assert.deepEqual(f.snapshot(),before);
 await f.ctrl.selectVariant(f.bad.id);assert.deepEqual(f.accessories.getExtras(),{accessories:[]});assert(f.roots.get(FOX).root.visible===false);
 await f.ctrl.selectVariant('archived_good');assert.equal(f.ctrl.current,f.good);assert.deepEqual(f.accessories.getExtras(),{accessories:[]});
 await f.ctrl.selectVariant('archived_good',{accessories:[FOX]});assert.equal(f.roots.get(FOX).root.visible,true);assert.equal(f.events.filter(e=>e.kind==='validate').at(-1).configuration,f.good.id);
});
await targetTest('Undo-validates-canonical-snapshot-before-any-install',async()=>{
 const f=await targetFixture();await addFOX(f);assert(f.ctrl.stageChoice('toolhead','xol'));await f.ctrl.applyDraft();assert.equal(f.ctrl.current,f.bad);const before=f.snapshot(),row=f.c.accessories.find(r=>r.id===FOX),rule=row.compatible_selection;
 row.compatible_selection={id:f.bad.id};await assert.rejects(f.ctrl.undo());assert.deepEqual(f.snapshot(),before,'Invalid Undo snapshot must not stage or roll back a head');row.compatible_selection=rule;
 const at=f.events.length;await f.ctrl.undo();assert.equal(f.ctrl.current,f.good);assert.deepEqual(f.accessories.getExtras(),{accessories:[FOX]});const steps=f.events.slice(at);assert.equal(steps[0].kind,'validate');assert.equal(steps[0].configuration,f.good.id);assert.equal(steps[1].kind,'install');
});
await targetTest('failed-install-rollback-also-validates-canonical-previous-target',async()=>{
 const f=await targetFixture();await addFOX(f);const before=f.snapshot();f.setFailure(f.bad.id);const log=console.error;console.error=()=>{};const at=f.events.length;try{assert.equal(await f.ctrl.selectVariant(f.bad.id),false)}finally{console.error=log}
 assert.equal(f.snapshot().shown,before.shown);assert.deepEqual(f.snapshot().mods,before.mods);assert.deepEqual(f.snapshot().visible,before.visible);const steps=f.events.slice(at);assert.deepEqual(steps.filter(e=>e.kind!=='asset').map(e=>[e.kind,e.configuration||e.id]),[['validate',f.bad.id],['install',f.bad.id],['validate',f.good.id],['install',f.good.id]]);
});
await targetTest('bank-URL-consumer-rejects-incompatible-target-atomically',async()=>{
 const f=await targetFixture({bankURL:{enabled:true,system:'indx',active:0,tools:['passive']}});await addFOX(f);const before=f.snapshot();await f.bank.bind(f.ctrl);assert.deepEqual(f.snapshot(),before);const panel=f.nodes.get('#configurationControls').beforeNodes;assert.equal(panel[1].hidden,false);assert(panel[1].textContent);assert(f.events.some(e=>e.kind==='validate'&&e.configuration===f.indx.id));
});
await targetTest('final-apply-still-checks-actual-active-variant',async()=>{
 const f=await targetFixture();await f.ctrl.selectVariant(f.bad.id);const before=f.snapshot();f.accessories.validateExtras({configuration:f.good.id,accessories:[FOX]});await assert.rejects(f.accessories.applyExtras({configuration:f.good.id,accessories:[FOX]}));assert.deepEqual(f.snapshot(),before);
});
const targetReport={status:'PASS',controllerCases:targetCases,actualControllers:true,originalSelectionCasesRetained:true,scope:'Real selection/accessory/changer-bank code with source-only controlled DOM and asset roots. No model files, WebGL/native or physical-fit claim.'};
const reportAt=process.argv.indexOf('--report');if(reportAt>=0)fs.writeFileSync(process.argv[reportAt+1],JSON.stringify(targetReport,null,2)+'\n',{flag:'wx'});console.log(JSON.stringify(targetReport));
