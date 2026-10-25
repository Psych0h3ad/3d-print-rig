// Real UI and app rename/commit/history bodies; DOM/storage/view are controlled ports.
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
import {createHash} from 'node:crypto';
import {TestDocument} from './fixtures/layout_ui_dom.mjs';
const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..'),at=process.argv.indexOf('--site');
const site=at<0?path.join(root,'site'):path.resolve(process.argv[at+1]);
const appURL=pathToFileURL(path.join(site,'layout/layout-app.mjs')),app=fs.readFileSync(appURL,'utf8');
const binding=name=>{const m=app.match(new RegExp(`from ['"](\\./${name.replaceAll('.','\\.')}[^'"]*)['"]`));assert(m,'App import '+name);return new URL(m[1],appURL);};
const S=await import(binding('layout-state.mjs')),G=await import(binding('layout-groups.mjs'));
const {createLayoutUI}=await import(binding('layout-ui.mjs'));
const {createLayoutTranslator,supportedLanguages}=await import(pathToFileURL(path.join(site,'layout/layout-i18n.mjs')));
const files=['layout-ui.mjs','layout-app.mjs','layout-state.mjs','layout-groups.mjs','layout-group-labels.mjs','layout-i18n.mjs'];
const hashes=()=>Object.fromEntries(files.map(p=>[p,createHash('sha256').update(fs.readFileSync(path.join(site,'layout',p))).digest('hex')]));
const before=hashes(),results=[];
const section=(a,b)=>{const start=app.indexOf(a),end=app.indexOf(b,start+a.length);assert(start>=0&&end>start,a);return app.slice(start,end);};
const engineFactory=new Function('initial','S','G','document','t',`
 const {applyAction,validatePlacement,serializeLayout}=S,{renameGroup}=G;
 const catalog=[],past=[],future=[],writes=[],view={setState(){}};
 let state=initial,selected='unit-g',ui=null,busy=false,disposed=false,roomEditing=false,placement=null,operation=null,interactionGeneration=0;
 const $=selector=>document.body.querySelector(selector),store=()=>writes.push(serializeLayout(state,catalog));
 ${section('function message(','async function ensureEquipmentPreview(')}
 ${section('async function act(action){','function updateViewPresentation(')}
 return {act,bind(value){ui=value;sync();},sync,read:()=>({state,past:[...past],future:[...future],writes:[...writes]})};`);
function seed(){
 let state=S.createDefaultLayout({room:S.createRoomRect({widthMm:8000,depthMm:6000}),furniture:[S.createDesk({id:'bench'})]},[]);
 state=G.createGroup(state,{id:'unit-g',name:'Production bank',memberIds:['bench']},[]);
 return S.parseLayout(JSON.stringify({...state,groups:state.groups.map(g=>({...g,label:'G'}))}),[]);
}
function fixture(language='en'){
 const document=new TestDocument(),container=document.createElement('aside'),status=document.createElement('p');status.id='layout-status';document.body.append(status,container);
 const t=createLayoutTranslator(language),initial=seed(),engine=engineFactory(initial,S,G,document,t),actions=[],pending=[];
 const ui=createLayoutUI({container,catalog:[],t,onAction:action=>{actions.push(structuredClone(action));const promise=engine.act(action);pending.push(promise);return promise;}});engine.bind(ui);
 const name=()=>container.querySelector('#layout-group-edit-name');
 return {ui,engine,document,container,actions,initial,t,name,async settle(){await Promise.all(pending);await Promise.resolve();},dispose(){ui.dispose();}};
}
async function test(name,run){try{await run();results.push({name,pass:true});}catch(e){results.push({name,pass:false,error:e.stack});}}
for(const language of supportedLanguages)for(const order of ['blur-first','change-first'])await test(`actual app rename ${language}/${order}, one history entry, code G and undo/redo`,async()=>{
 const x=fixture(language),name=x.name();name.focus();name.value='  North row  ';name.dispatch('input');
 if(order==='blur-first'){
  name.blur();x.container.querySelector('#layout-tab-selection').click();await Promise.resolve();name.dispatch('change');
 }else{name.dispatch('change');name.blur();}
 await x.settle();let r=x.engine.read();
 assert.equal(r.state.groups[0].name,'North row');assert.equal(r.state.groups[0].label,'G');assert.equal(r.state.groups.length,1);
 assert.equal(r.past.length,1);assert.equal(r.writes.length,1);assert.equal(x.actions.length,1);assert.deepEqual(x.actions[0],{type:'group-rename',id:'unit-g',name:'North row'});
 assert.equal(x.name().value,'North row');assert.equal(x.container.querySelector('#layout-selected-unit').getAttribute('aria-label'),'G · North row');
 name.dispatch('change');name.blur();await x.settle();assert.equal(x.actions.length,1);assert.equal(x.engine.read().writes.length,1);
 await x.engine.act({type:'undo'});r=x.engine.read();assert.equal(r.state.groups[0].name,'Production bank');assert.equal(r.state.groups[0].label,'G');assert.equal(r.state.groups.length,1);assert.equal(r.past.length,0);assert.equal(r.future.length,1);
 await x.engine.act({type:'redo'});r=x.engine.read();assert.equal(r.state.groups[0].name,'North row');assert.equal(r.state.groups[0].label,'G');assert.equal(r.state.groups.length,1);assert.equal(r.past.length,1);assert.equal(r.future.length,0);x.dispose();
});
for(const [value,key]of [['','layout.group.nameRequired'],['   ','layout.group.nameRequired'],['x'.repeat(81),'layout.error.GROUP_NAME'],['bad\u0001name','layout.error.GROUP_NAME']])for(const order of ['blur-first','change-first'])await test(`invalid draft ${JSON.stringify(value)}/${order} remains visible without state/history writes`,async()=>{
 const x=fixture('ja'),name=x.name();name.focus();name.value=value;name.dispatch('input');
 if(order==='blur-first'){name.blur();await Promise.resolve();name.dispatch('change');}else{name.dispatch('change');name.blur();}
 await x.settle();x.engine.sync();assert.equal(name.value,value);assert.equal(name.getAttribute('aria-invalid'),'true');assert.equal(x.container.querySelector('[role="status"]').textContent,x.t(key));
 assert.equal(x.engine.read().state.groups[0].name,'Production bank');assert.equal(x.engine.read().state.groups[0].label,'G');assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);assert.deepEqual(x.actions,[]);
 name.focus();name.value='Corrected';name.dispatch('input');name.blur();await x.settle();assert.equal(x.engine.read().state.groups[0].name,'Corrected');assert.equal(x.actions.length,1);assert.equal(name.getAttribute('aria-invalid'),null);x.dispose();
});
await test('returning to the existing name is a no-op in both event orders',async()=>{
 for(const order of ['blur-first','change-first']){const x=fixture(),name=x.name();name.focus();name.value=' Production bank ';name.dispatch('input');if(order==='blur-first'){name.blur();name.dispatch('change');}else{name.dispatch('change');name.blur();}await x.settle();assert.equal(name.value,'Production bank');assert.deepEqual(x.actions,[]);assert.equal(x.engine.read().past.length,0);assert.equal(x.engine.read().writes.length,0);x.dispose();}
});
assert.deepEqual(hashes(),before,'Rename inputs changed during focused run');
const report={status:results.every(r=>r.pass)?'PASS':'FAIL',cases:results.length,results,sourceSHA256:before,scope:'Actual UI and production app rename/commit/sync/undo/redo bodies, real state/group validation, DOM/storage/view ports. Both native event orders are simulated explicitly; no browser/model/native/full-build claim.'};
const output=process.argv.indexOf('--report');if(output>=0)fs.writeFileSync(process.argv[output+1],JSON.stringify(report,null,2)+'\n',{flag:'wx'});
console.log(JSON.stringify(report));assert.deepEqual(results.filter(r=>!r.pass),[],'Unit-name commit integration regressions');
