import assert from 'node:assert/strict';
import {builderCandidates,builderGroups,builderManifest,validateBuilderExtras,builderURL} from '../site/viewer/toolhead-builder.mjs';
import {importedVariant} from '../site/viewer/configuration-model.js';
const rows=ids=>ids.map(id=>({id,label:id}));
const c={machine_id:'toolhead',import_machine_ids:['siboor_trident_350'],dimensions:['toolhead','extruder','hotend','mount'],toolheads:rows(['sb','xol']),extruders:rows(['g2e','orbiter']),hotends:rows(['revo','v6']),mounts:rows(['fixed','sc']),variants:[]};
for(const [toolhead,extruder,hotend] of [['sb','g2e','revo'],['sb','orbiter','revo'],['xol','orbiter','v6']])for(const mount of ['fixed','sc'])c.variants.push({id:[toolhead,extruder,hotend,mount].join('_'),toolhead,extruder,hotend,mount,base_asset:'head',head_translation_mm:[0,0,0],base_hidden_keys:['omitted'],modules:[{id:'drive',hidden_keys:['optional']},{id:'dock',role:'dock'}]});
assert.equal(builderCandidates(c,{extruder:'orbiter'}).length,4);
assert.equal(builderGroups(c,{hotend:'v6',extruder:'g2e'}).length,0);
const v=c.variants[3];assert.equal(builderGroups(c,{hotend:'revo'},v.id)[0].variant,v);
assert.equal(builderGroups(c,{extruder:'orbiter'}).length,2);
const meta=new Map([['head',{parts:[{key:'printed',name:'front',appearance_role:'accent'},{key:'omitted'},{key:'rail',component:'shuttle_reference'}],source_url:'https://github.com/example/head/blob/012345/CAD/head.step',source_commit:'012345'}],['drive',{parts:[{key:'mount',name:'Mount',appearance_role:'base'},{key:'motor',name:'Motor'},{key:'optional'}],source_records:[{source_url:'https://example.com/drive.step',commit:'abc'}]}],['dock',{parts:[{key:'dock',component:'dock'}],source_url:'javascript:alert(1)'}]]);
const normal=builderManifest(c,v,meta),refs=builderManifest(c,v,meta,{rail:true,dock:true});
assert.equal(normal.displayed_instances,3);assert.equal(normal.printed_instances,2);assert.equal(refs.displayed_instances,5);
assert(!normal.modules.some(m=>m.id==='dock'));assert.equal(refs.modules[2].sources.length,0);
assert.equal(normal.modules[1].sources[0].commit,'abc');assert.throws(()=>builderManifest(c,v,new Map()));
assert.equal(importedVariant(c,{machine:'toolhead',configuration:v.id}),v);assert.equal(importedVariant(c,{machine:'siboor_trident_350',configuration:v.id}),v);assert.throws(()=>importedVariant(c,{machine:'voron_v24_250',configuration:v.id}));
const extras={palette:{base:'#24272c',accent:'#e32636'},see_inside:false,dock:false,rail:true};
validateBuilderExtras({head_builder:extras});validateBuilderExtras({});
for(const value of [null,{}, {...extras,palette:{base:'url(x)',accent:'#e32636'}},{...extras,dock:'true'}])assert.throws(()=>validateBuilderExtras({head_builder:value}));
const url=new URL(builderURL('https://example.com/viewer/toolheads.html?mount=sc',v,extras));assert.equal(url.searchParams.get('configuration'),v.id);assert.equal(url.searchParams.get('base'),'24272c');assert(!url.searchParams.has('mount'));
assert.equal(importedVariant(c,JSON.parse(JSON.stringify({machine:'toolhead',configuration:v.id,head_builder:extras}))),v);
console.log('Head Builder passed: component-first filtering, exact registered results, hidden/reference parts, source URLs, saved palette validation, legacy imports and share-link restoration.');

// Exercise the real selection controller with an in-memory DOM, including a
// failed CAD load. This is a controller test, not a browser visual review.
class Element{
 constructor(){this.children=[];this.dataset={};this.value='';this.classList={toggle(){},add(){}}}
 replaceChildren(...nodes){this.children=nodes;this.value=nodes[0]?.value||''}
 append(...nodes){this.children.push(...nodes)}
 after(){} remove(){} click(){if(this.href)downloads.push(this.href)}
}
const nodes=new Map(),downloads=[];
globalThis.document={querySelector:s=>{if(!nodes.has(s))nodes.set(s,new Element());return nodes.get(s)},createElement:()=>new Element(),createTextNode:s=>s,body:new Element()};
globalThis.location=new URL('https://example.com/toolheads.html?configuration='+v.id);
globalThis.history={replaceState:(_a,_b,url)=>{globalThis.location=new URL(url)}};
const controlled={...c,sources:[],variants:c.variants.map(v=>({...v,notes:[],belt_width_mm:6}))};
let shown,fail,settled=[],palette={...extras},installs=[];
const {setupConfigurations}=await import('../site/viewer/configurations.js');
const control=await setupConfigurations(controlled,async v=>{installs.push(v.id);if(v.id===fail)throw Error('fixture CAD load failure');shown=v.id},{presentation:'toolhead',getExtras:()=>({head_builder:palette}),validateExtras:validateBuilderExtras,applyExtras:async d=>{palette=d.head_builder},onSettled:v=>settled.push(v.id)});
assert.equal(control.current.id,v.id);assert.equal(shown,v.id);assert(!control.busy);
const next=controlled.variants.at(-1);await control.selectVariant(next.id);assert.equal(shown,next.id);assert.equal(new URL(location).searchParams.get('configuration'),next.id);
fail=controlled.variants[0].id;const oldError=console.error;console.error=()=>{};try{await control.selectVariant(fail)}finally{console.error=oldError}
assert.equal(shown,next.id);assert.equal(control.current.id,next.id);assert.equal(settled.at(-1),next.id);assert(!control.busy);assert(installs.includes(fail));
for(const dimension of controlled.dimensions)assert.equal(nodes.get('#'+dimension+'Config').disabled,false);
nodes.get('#saveConfiguration').onclick();const saved=await(await fetch(downloads.at(-1))).json();assert.equal(saved.machine,'toolhead');assert.equal(saved.configuration,next.id);assert.deepEqual(saved.head_builder,extras);
const changed={...saved,head_builder:{...extras,palette:{base:'#f0f1ed',accent:'#9d5ce2'}}},input=nodes.get('#configurationFile');input.files=[{size:500,text:async()=>JSON.stringify(changed)}];await input.onchange();assert.deepEqual(palette,changed.head_builder);
input.files=[{size:20,text:async()=>'{'}];await input.onchange();assert.equal(shown,next.id);assert(!control.busy);
console.log('Head Builder controller passed: URL restore, selection, failed-load rollback, enabled controls, standalone save/load and malformed-file retention.');
// Original Beacon references may not have a measured coil datum.
const beaconReference={...next,id:next.id+'_beacon_reference',fit:{probe:{label:'Beacon Rev D',coil_nozzle_gap_mm:null,physical_passed:null,height_passed:null,metal_keepout_verified:false,notes:[]}}};
controlled.variants.push(beaconReference);await control.selectVariant(beaconReference.id);
assert.equal(control.current.id,beaconReference.id,'An unmeasured coil must not break a valid CAD selection');
assert(nodes.get('#mountInfo').children.some(li=>li.textContent==='Beacon Rev Dのコイル底面：未計測'));
assert.match(nodes.get('#configStatus').textContent,/取付条件未確認/u);
assert(!control.busy);
console.log('Unmeasured Beacon controller passed: CAD remains selectable and mounting conditions remain unverified.');
