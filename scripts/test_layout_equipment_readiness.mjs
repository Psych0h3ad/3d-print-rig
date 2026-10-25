import assert from 'node:assert/strict';
import fs from 'node:fs';
import {needsEquipmentPreview} from '../site/layout/layout-equipment-preview.mjs';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
import {t as translate,supportedLanguages} from '../site/layout/layout-i18n.mjs';
const source=fs.readFileSync(new URL('../site/layout/layout-app.mjs',import.meta.url),'utf8').replaceAll('\r\n','\n');
const body=source.slice(source.indexOf('async function ensureEquipmentPreview(value){'),source.indexOf('\nfunction selectionIds(){'));
assert(body.startsWith('async function ensureEquipmentPreview'));
const U={kind:'printer',machineId:'snapmaker_u1_layout_reference'},POP={kind:'popstation_mini'};
const deferred=()=>{let resolve,reject;const promise=new Promise((a,b)=>{resolve=a;reject=b;});return {promise,resolve,reject};};
const fixture=()=>{
  const calls=[],messages=[],statuses=[],doc={body:{dataset:{}}},node={hidden:true,textContent:''},pending=deferred();
  let cached=false;
  const run=new Function('deps',`
    let state={furniture:[],printers:[]},interactionGeneration=1,busy=false,roomEditing=false,disposed=false,operation=null;
    const past=[],future=[],document=deps.doc,$=()=>deps.node,needsEquipmentPreview=deps.needsEquipmentPreview;
    const isLayoutEquipmentPreviewPrepared=()=>deps.cached(),prepareLayoutEquipmentPreview=deps.prepare;
    const t=(key,values)=>({key,...values}),message=(format,_error,detail)=>deps.messages.push({message:format(),detail});
    const ui={setStatus:value=>deps.statuses.push(value)};
    ${body}
    return {ensureEquipmentPreview,read:()=>({state,interactionGeneration,busy,operation,disposed}),
      cancel:()=>operation?.abort(new DOMException('Fixture cancelled','AbortError')),
      change:()=>{state={furniture:[],printers:[]};interactionGeneration++;},
      dispose:()=>{disposed=true;operation?.abort(new DOMException('Fixture unload','AbortError'));},
      flags:values=>{if('busy'in values)busy=values.busy;if('roomEditing'in values)roomEditing=values.roomEditing;}};
  `)({doc,node,needsEquipmentPreview,cached:()=>cached,prepare:options=>{calls.push(options);return pending.promise;},messages,statuses});
  return {...run,calls,messages,statuses,doc,node,resolve:()=>{cached=true;pending.resolve({});},reject:error=>pending.reject(error),cached:value=>{cached=value;}};
};
const cases=[];async function test(name,fn){await fn();cases.push(name);}
await test('native and empty scenes do not fetch preview data',async()=>{
  const f=fixture();assert.equal(await f.ensureEquipmentPreview({kind:'desk'}),true);assert.equal(f.calls.length,0);
  assert.equal(needsEquipmentPreview({printers:[{machineId:'voron_trident_350'}],furniture:[]}),false);
});
await test('all Layout equipment entry shapes are detected without walking arrays',()=>{
  for(const value of [U,POP,{type:'popstation_mini'},{template:{furniture:[{type:'popstation_mini'}],printers:[]}},{printers:[U]}, {furniture:[{type:'popstation_mini'}]}])assert(needsEquipmentPreview(value));
  const cycle={};cycle.template=cycle;assert.equal(needsEquipmentPreview(cycle),false);
});
await test('preparation blocks editing and progress is monotone',async()=>{
  const f=fixture(),pending=f.ensureEquipmentPreview(U);assert.equal(f.calls.length,1);assert(f.read().busy);
  for(const percent of [35,80,20,100])f.calls[0].onProgress({percent});
  assert.deepEqual(f.messages.map(m=>m.detail.renderProgress.loaded),[0,35,80,80,100]);
  f.resolve();assert.equal(await pending,true);assert.equal(f.doc.body.dataset.layoutPreview,'ready');assert.equal(f.read().busy,false);assert.equal(f.read().operation,null);
  assert.equal(f.statuses.at(-1).message,'');assert.equal(f.statuses.at(-1).busy,false);
  assert.equal(await f.ensureEquipmentPreview(POP),true);assert.equal(f.calls.length,1);
});
await test('cancelled or unloaded late completion cannot accept a preview',async()=>{
  for(const dispose of [false,true]){
    const f=fixture(),pending=f.ensureEquipmentPreview(U);dispose?f.dispose():f.cancel();f.resolve();assert.equal(await pending,false);
    assert.equal(f.read().busy,false);if(!dispose)assert.equal(f.doc.body.dataset.layoutPreview,'cancelled');
  }
});
await test('stale scene/generation and download failure release busy ownership',async()=>{
  const stale=fixture(),pending=stale.ensureEquipmentPreview(U);stale.change();stale.resolve();assert.equal(await pending,false);assert.equal(stale.read().busy,false);
  const failed=fixture(),other=failed.ensureEquipmentPreview(U);failed.reject(Error('Fixture transport failed'));await assert.rejects(other,/Fixture transport/);
  assert.equal(failed.doc.body.dataset.layoutPreview,'failed');assert.equal(failed.read().busy,false);
});
await test('current work cannot be replaced by an unrelated preparation',async()=>{
  const f=fixture();f.flags({busy:true});assert.equal(await f.ensureEquipmentPreview(U),false);assert.equal(f.calls.length,0);
  f.flags({busy:false,roomEditing:true});assert.equal(await f.ensureEquipmentPreview(POP),false);assert.equal(f.calls.length,0);
});
await test('failed startup exposes retry, saved-plan export and empty-layout recovery',async()=>{
  const doc=new TestDocument(),sidebar=doc.createElement('aside'),status=doc.createElement('p');sidebar.id='layout-sidebar';status.id='layout-status';doc.body.append(sidebar,status);
  const saved='{"saved":"equipment layout"}',calls=[],downloads=[],messages=[];
  const recovery=source.slice(source.indexOf('function startupFailed(error){'),source.indexOf('\nstart().catch(startupFailed);'));
  assert(recovery.startsWith('function startupFailed'));
  const f=new Function('deps',`
    const document=deps.doc,localStorage={getItem:()=>deps.saved},storageKey='fixture',legacyStorageKey='legacy-fixture',console={error(){}},disposed=false,ui=null,view=null;
    const $=s=>document.body.querySelector(s),t=k=>k,message=(f)=>{const node=$('#layout-status');node.hidden=false;node.textContent=f();node._layoutMessage={error:true};deps.messages.push(f());},download=(b,n)=>deps.downloads.push({b,n});
    const language={refresh(){for(const n of document.body.querySelectorAll('[data-layout-i18n]')){
      for(const lang of deps.languages)deps.translate(n.dataset.layoutI18n,{},lang);
      n.textContent=deps.translate(n.dataset.layoutI18n,{},'en');
    }}};
    let startEmpty=false,rejectRetry=true;
    async function start(){deps.calls.push(startEmpty);if(rejectRetry)throw Error('Fixture retry failed');}
    ${source.slice(source.indexOf('function readSavedLayout(){'),source.indexOf('\nfunction message('))}
    ${recovery}
    return {fail:startupFailed,accept:()=>{rejectRetry=false;}};
  `)({doc,saved,calls,downloads,messages,translate,languages:supportedLanguages});
  f.fail(Error('Fixture preview failed'));
  const control=command=>sidebar.querySelector('[data-layout-recovery='+command+']');
  assert.equal(doc.body.dataset.layoutReady,'failed');assert(control('retry'));assert(control('empty'));assert(control('save'));
  control('save').click();assert.equal(downloads.length,1);assert.equal(await downloads[0].b.text(),saved);
  control('retry').click();await new Promise(setImmediate);assert.deepEqual(calls,[false]);
  assert.equal(sidebar.querySelectorAll('#layout-startup-recovery').length,1,'Failed retries must restore exactly one recovery panel');
  f.accept();control('empty').click();await new Promise(setImmediate);assert.deepEqual(calls,[false,true]);
  assert.equal(sidebar.querySelector('#layout-startup-recovery'),null);assert.equal(saved,'{"saved":"equipment layout"}');
  assert.equal(status.hidden,true);assert.equal(status.textContent,'');assert.equal(Object.hasOwn(status,'_layoutMessage'),false);
});
assert.match(source,/state=startEmpty\?createDefaultLayout\(\):makeDefault\(\);/);
assert.match(source,/if\(!startEmpty\)try\{const saved=readSavedLayout\(\)/);
assert.match(source,/if\(!await ensureEquipmentPreview\(state\)\|\|disposed\)return;/);
assert.match(source,/if\(!await ensureEquipmentPreview\(next\)/);
assert.match(source,/if\(needsEquipmentPreview\(spec\)&&!isLayoutEquipmentPreviewPrepared\(\)\)/);
assert.match(source,/if\(event.persisted&&!disposed&&!view\)window.location.reload\(\)/);
console.log(JSON.stringify({passed:true,cases:cases.length,liveRequests:0,scope:'Production application readiness body with controlled async transport and DOM observation sinks; bootstrap/import/placement call-site witnesses. Real geometry hashes and browser behavior have separate gates.'}));
