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
 constructor(){this.children=[];this.dataset={};this.classList={add(){},toggle(){}};this.value=''}
 replaceChildren(...c){this.children=c}append(...c){this.children.push(...c)}after(){}setAttribute(){}
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
