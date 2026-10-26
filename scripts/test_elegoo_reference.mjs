import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import {createHash} from 'node:crypto';
import vm from 'node:vm';
import {elegooAssetIndex, elegooMachines, isElegooMachine} from '../site/viewer/elegoo-catalog.mjs';
import {validateElegooMetadata, validateElegooGLB, validateElegooView} from '../site/viewer/elegoo-contract.mjs';
import {runElegooLoad, createElegooLoadQueue} from '../site/viewer/elegoo-load-task.mjs';
import {referenceDepthRange} from '../site/viewer/elegoo-depth-range.mjs';
import {createElegooCameraSelection, elegooPresetButtonIds} from '../site/viewer/elegoo-view-state.mjs';

const root = new URL('../', import.meta.url), hash = value => createHash('sha256').update(value).digest('hex');
const read = name => fs.readFile(new URL(name, root), 'utf8');
let cases = 0;
const pass = () => { cases++; };
const abortError = error => error.name === 'AbortError';
const bytes = value => new TextEncoder().encode(JSON.stringify(value));
function glb(value) {
  const json = JSON.stringify(value), text = new TextEncoder().encode(json + ' '.repeat((4-json.length%4)%4));
  const result = new Uint8Array(20+text.length), view = new DataView(result.buffer);
  for (const [offset, value] of [[0,0x46546c67],[4,2],[8,result.length],[12,text.length],[16,0x4e4f534a]]) view.setUint32(offset,value,true);
  result.set(text,20); return result;
}
function fixture(row) {
  const parts = Array.from({length:row.parts},(_,i)=>({key:'fixture-'+i}));
  const manifest = {machine_id:row.id, parts};
  const profile = {machine_id:row.id, motion_preview:false, axes:{x:[0,0],y:[0,0],z:[0,0]},
    source:{url:row.source.url, revision:row.source.revision, source_file_sha256:row.source.sha256, license:row.source.license}};
  const json = {asset:{version:'2.0'}, scene:0, scenes:[{nodes:parts.map((_,i)=>i)}],
    nodes:parts.map(part=>({mesh:0,extras:{part_key:part.key}})), meshes:[{primitives:[{attributes:{COLOR_0:0}}]}]};
  return {manifest,profile,json};
}
assert.equal(elegooAssetIndex.machines.length,3); assert.equal(elegooMachines.length,3);
assert.equal(elegooAssetIndex.base_url,'https://psych0h3ad.github.io/3d-print-rig-extra-models/elegoo-assets/');
assert.equal(elegooAssetIndex.local_directory,'elegoo-assets'); assert.equal(isElegooMachine('elegoo_neptune2_reference'),false); pass();
const expectedSizes=[[220,220,280],[225,225,280],[320,320,400]];
for (const [i,row] of elegooAssetIndex.machines.entries()) {
  assert.equal(isElegooMachine(row.id),true); assert.deepEqual(row.nominal_build_size_mm,expectedSizes[i]);
  assert.equal(row.source.license,'GPL-3.0'); assert.match(row.source.revision,/^[a-f0-9]{40}$/);
  assert.equal(row.motionVerified,false); assert.equal(row.printedPalette,false);
  for (const spec of Object.values(row.files)) { assert.match(spec.sha256,/^[a-f0-9]{64}$/); assert(spec.bytes>0); }
  assert.match(row.files['model.glb'].decoded_sha256,/^[a-f0-9]{64}$/); pass();
  const f=fixture(row), keys=validateElegooMetadata(row,f.manifest,f.profile);
  validateElegooGLB(glb(f.json),keys); pass();
  assert.throws(()=>validateElegooMetadata(row,{...f.manifest,machine_id:'wrong'},f.profile));
  assert.throws(()=>validateElegooMetadata(row,{...f.manifest,parts:f.manifest.parts.map(()=>f.manifest.parts[0])},f.profile));
  assert.throws(()=>validateElegooMetadata(row,f.manifest,{...f.profile,motion_preview:true}));
  assert.throws(()=>validateElegooGLB(glb({...f.json,buffers:[{uri:'unverified.bin'}]}),keys));
  assert.throws(()=>validateElegooGLB(glb({...f.json,materials:[{}]}),keys));
  assert.throws(()=>validateElegooGLB(glb({...f.json,scenes:[{nodes:[0]}]}),keys));
  assert.throws(()=>validateElegooGLB(glb({...f.json,nodes:f.json.nodes.slice(1)}),keys)); pass();
  const saved={schema:'elegoo-static-view-v1',machine:row.id,model_sha256:row.files['model.glb'].decoded_sha256,
    source_revision:row.source.revision,dark:false,grid:false,camera:{position:[1,1,1],target:[0,0,0],up:[0,1,0]}};
  assert.equal(validateElegooView(saved,row),saved);
  for (const patch of [{machine:'wrong'},{model_sha256:'0'.repeat(64)},{palette:{}},{axes:{x:1}},
    {camera:{...saved.camera,position:[NaN,1,1]}},{camera:{...saved.camera,target:[1,1,1]}}])
    assert.throws(()=>validateElegooView({...saved,...patch},row)); pass();
}
assert.deepEqual(elegooAssetIndex.machines[1].basis,[[0,0,-1],[1,0,0],[0,-1,0]]); pass();
for(const row of elegooAssetIndex.machines.slice(1)){
 assert(row.files['model.glb'].path.includes('/zero-facets-v1/'));
 assert.deepEqual(Object.keys(row.zero_facet_source).sort(),['assembly_manifest.json','machine_profile.json','model.glb']);
 assert(row.zero_facet_source['model.glb'].decoded_sha256!==row.files['model.glb'].decoded_sha256);
 assert(!row.zero_facet_source['model.glb'].path.includes('/zero-facets-v1/'));
} pass();
const row=elegooAssetIndex.machines[0], f=fixture(row);
const fixtureFetch=async spec=>spec===row.files['assembly_manifest.json']?bytes(f.manifest):spec===row.files['machine_profile.json']?bytes(f.profile):glb(f.json);
let disposed=0, assembled=0;
const args={fetchAsset:fixtureFetch,parse:async()=>({scene:{synthetic:true}}),
  assemble:()=>{assembled++;return {root:{synthetic:true}};},dispose:()=>disposed++};
const success=await runElegooLoad(row,args); assert(success.root.synthetic); assert.equal(assembled,1); assert.equal(disposed,0); pass();
const before=new AbortController(); before.abort(); let fetches=0;
await assert.rejects(runElegooLoad(row,{...args,signal:before.signal,fetchAsset:async()=>{fetches++;}}),abortError);
assert.equal(fetches,0); pass();
const controller=new AbortController();
await assert.rejects(runElegooLoad(row,{...args,signal:controller.signal,parse:async()=>{controller.abort();return {scene:{synthetic:true}};}}),abortError);
assert.equal(disposed,1); assert.equal(assembled,1); pass();
await assert.rejects(runElegooLoad(row,{...args,assemble:()=>{throw Error('fixture assembly failure');}}),/fixture assembly failure/);
assert.equal(disposed,2); pass();
let current=true;
await assert.rejects(runElegooLoad(row,{...args,isCurrent:()=>current,parse:async()=>{current=false;return {scene:{synthetic:true}};}}),abortError);
assert.equal(disposed,3); pass();
const queue=createElegooLoadQueue(), a=queue.start(), events=[];
let finish; const blocked=new Promise(resolve=>finish=resolve);
const first=queue.run(a,async()=>{events.push('A');await blocked;events.push('A-end');});
await Promise.resolve(); const b=queue.start(), second=queue.run(b,async()=>events.push('B'));
const restored=queue.start(), third=queue.run(restored,async()=>events.push('A-restored'));
finish(); await Promise.all([first,second,third]); assert.deepEqual(events,['A','A-end','A-restored']); assert.equal(b.current(),false); queue.cancel(); assert.equal(restored.current(),false); pass();
for(const distance of [.01,.1,1,5,20]) {const clip=referenceDepthRange(distance,1.2);assert(clip.near>0&&clip.near<distance&&clip.far>distance);}
assert.throws(()=>referenceDepthRange(NaN,1)); pass();
const source=JSON.parse(await read('localization/source.json')), seen=new Set();
for(const entry of Object.values(source.entries)) {const signature=entry.kind+'\0'+entry.ja;assert(!seen.has(signature),'Duplicate Japanese source: '+entry.ja);seen.add(signature);}
for(const lang of ['es','ko','ru','de']) {
  const dictionary=JSON.parse(await read('localization/'+lang+'.json'));
  for(const [id,entry] of Object.entries(source.entries).filter(([id])=>id.startsWith('elegoo.'))) {
    assert(dictionary.messages[id].text);assert.equal(dictionary.messages[id].source_revision,
      hash(JSON.stringify([entry.kind,entry.ja,entry.en,entry.aliases||[]])).slice(0,20));
    assert.deepEqual(dictionary.messages[id].text.match(/\{\d+\}/g)||[],entry.en.match(/\{\d+\}/g)||[]);
  }
} pass();
const loader=await read('site/viewer/elegoo-loader.mjs'), renderer=await read('site/viewer/elegoo.mjs');
// Execute the production load body through the declined/canceled warning path.
// The already displayed assembly must remain exportable without a new fetch.
const loadBody=renderer.slice(renderer.indexOf('  async function load() {'),renderer.indexOf('  open.onclick ='));
assert(loadBody.includes('confirmLargeModel'));
for(const retained of [false,true])for(const cancelled of [false,true]){
 let readyState=retained,current=true,cleared=0;
 const scope={disposed:false},active=retained?{}:null;
 const job={signal:new AbortController().signal,current:()=>current};
 const deps={scope,active,workspace:{inert:false},queue:{start:()=>job,run:(_job,fn)=>fn()},open:{},cancel:{},progress:{},document:{body:{dataset:{}}},
  tracker:null,status:{},ready:value=>{readyState=value},assertElegooCurrent:()=>{},
  confirmLargeModel:async()=>{if(cancelled)current=false;return false},text(){},release:()=>{cleared++}};
 await new Function('deps','with(deps){'+loadBody+';return load();}')(deps);
 assert.equal(readyState,retained);assert.equal(deps.active,active);assert.equal(cleared,0);pass();
}
assert(loader.includes('setFromObject(root, true)')); assert(loader.includes('expandByObject(nodes.get(part.key), true)'));
assert(renderer.includes('prepareCamera: depth')); assert(renderer.includes("attributeFilter: ['inert']"));
assert(!renderer.includes('new THREE.PerspectiveCamera(35,1,.001,30)'));
assert((await read('site/viewer/community.js')).match(/import\('\.\/elegoo\.mjs(?:\?v=[a-f0-9]{20})?'\)/));
assert((await read('site/viewer/machines.js')).includes('...elegooMachines'));
assert((await read('site/viewer/render-export.js')).includes('prepareCamera(exportCamera)')); pass();
assert(renderer.includes("document.title = row.title + ' · 3D Print Rig'"));
assert(renderer.includes("active.nodes.size.toLocaleString(language()) + ' · ' + row.title")); pass();
const buttons=Object.values(elegooPresetButtonIds).map(id=>({id,attributes:new Map(),
  setAttribute(name,value){this.attributes.set(name,value);}}));
const toolButtons={querySelectorAll:()=>buttons}, orbit=new EventTarget();
const selection=createElegooCameraSelection(toolButtons,orbit);
const selected=()=>buttons.filter(button=>button.attributes.get('aria-pressed')==='true').map(button=>button.id);
selection.select('iso'); assert.deepEqual(selected(),['iso']);
selection.select('top'); assert.deepEqual(selected(),['top']);
// Load saved ISO after visiting Top: restored coordinates are arbitrary, so
// Top must not remain pressed and no preset is inferred from the saved camera.
selection.clear(); assert.deepEqual(selected(),[]); pass();
selection.select('top'); selection.select('iso'); assert.deepEqual(selected(),['iso']);
// A fit/reset is programmatic. Redraw/resize change events preserve its label.
orbit.dispatchEvent(new Event('change')); assert.deepEqual(selected(),['iso']); pass();
orbit.dispatchEvent(new Event('start')); assert.deepEqual(selected(),[]); pass();
for(const kind of Object.keys(elegooPresetButtonIds)) {
  selection.select(kind); assert.deepEqual(selected(),[elegooPresetButtonIds[kind]]);
}
assert.throws(()=>selection.select('not-a-preset')); selection.dispose();
orbit.dispatchEvent(new Event('start')); assert.deepEqual(selected(),['elegooUnder']); pass();
assert(renderer.includes('presets.select(kind)')); assert(renderer.includes('presets.clear();')); pass();
let syntaxModules=0;
if (vm.SourceTextModule) {
  const modules=['community.js','community-renderer.mjs','machines.js','render-export.js','elegoo.mjs','elegoo-loader.mjs',
    'elegoo-catalog.mjs','elegoo-contract.mjs','elegoo-load-task.mjs','elegoo-depth-range.mjs','elegoo-view-state.mjs',
    'locales/catalog.mjs','locales/manifest.mjs','locales/es.mjs','locales/ko.mjs','locales/ru.mjs'];
  for(const name of modules) {
    new vm.SourceTextModule(await read('site/viewer/'+name),{identifier:name}); syntaxModules++;
  }
  new vm.SourceTextModule(await read('scripts/test_elegoo_reference.mjs')); syntaxModules++;
  pass();
}
console.log(JSON.stringify({status:'SOURCE_AND_SYNTHETIC_FIXTURES_PASS',cases,machines:3,
  syntaxModules, actualModelsRead:false, browser:false, nativeCAD:false, physicalFitVerified:false, releaseEligible:false}));
